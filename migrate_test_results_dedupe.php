<?php
/**
 * Migration script for the duplicate `test_results` problem.
 *
 * The previous Atterberg save path inserted a new row on every save and then failed to delete the
 * old one (it compared a string `project_id` from the API against a number), so a project could end
 * up with many rows for the same (project_id, test_key). `migrate_atterberg_constraint.php` had also
 * dropped the unique index that prevented this.
 *
 * This script:
 *   1. reports every (project_id, test_key) pair that has more than one row,
 *   2. keeps the most recently updated row (ties broken by the highest id),
 *   3. deletes the remaining duplicates (cascading into atterberg_save_audit),
 *   4. re-adds the UNIQUE index so the problem cannot come back.
 *
 * Usage:
 *   php migrate_test_results_dedupe.php            # dry run, prints the plan
 *   php migrate_test_results_dedupe.php --apply    # actually delete and add the index
 *
 * Credentials are read from the DB_HOST, DB_USER, DB_PASS and DB_NAME environment variables only.
 * The script deliberately carries no defaults, so a copy of it can never leak the database
 * password. It also prints the target it is about to touch and refuses to run against an empty
 * test_results table.
 */

$apply = in_array('--apply', $argv ?? [], true);

$host = getenv('DB_HOST') ?: 'localhost';
$port = (int) (getenv('DB_PORT') ?: 3306);
$user = getenv('DB_USER') ?: '';
$pass = getenv('DB_PASS') ?: '';
$name = getenv('DB_NAME') ?: '';

if ($user === '' || $pass === '' || $name === '') {
    die(
        "Missing database credentials. This script does not carry defaults on purpose.\n"
        . "Run it with the environment set, for example:\n\n"
        . "  DB_HOST=... DB_USER=... DB_PASS=... DB_NAME=... php " . basename(__FILE__) . " [--apply]\n"
    );
}

$conn = new mysqli($host, $user, $pass, $name, $port);
if ($conn->connect_error) {
    die('Connection failed: ' . $conn->connect_error . "\n"
        . "Set DB_HOST/DB_USER/DB_PASS/DB_NAME if this database is not on localhost.\n");
}
$conn->set_charset('utf8mb4');

echo '[' . date('d-M-Y H:i:s T') . '] mode: ' . ($apply ? 'APPLY' : 'DRY RUN') . "\n";

// Show exactly which database is about to be touched. The frontend proxies /api.php to
// lab.wayrus.co.ke, so production may not be the local MySQL instance at all.
$currentDatabase = $conn->query('SELECT DATABASE() AS db')->fetch_assoc()['db'] ?? '(none)';
$currentCount = (int) ($conn->query('SELECT COUNT(*) AS c FROM test_results')->fetch_assoc()['c'] ?? 0);
echo "[" . date('d-M-Y H:i:s T') . "] target: {$user}@{$host}:{$port} database={$currentDatabase}\n";
echo '[' . date('d-M-Y H:i:s T') . '] test_results currently holds ' . $currentCount . " row(s)\n";

if (getenv('DB_HOST') === false && $host === 'localhost') {
    echo '[' . date('d-M-Y H:i:s T') . '] WARNING: no DB_HOST set, so this points at the LOCAL MySQL'
        . " server. If production lives on lab.wayrus.co.ke, export DB_HOST (and credentials)"
        . " first, or run this script on the server.\n";
}
if ($currentCount === 0) {
    die("Refusing to continue: test_results is empty, so this is probably not the intended database.\n");
}

// 1. Find the pairs that hold more than one row.
$dupeQuery = "SELECT project_id, test_key, COUNT(*) AS row_count
              FROM test_results
              WHERE project_id IS NOT NULL
              GROUP BY project_id, test_key
              HAVING row_count > 1
              ORDER BY row_count DESC, project_id, test_key";

$dupeResult = $conn->query($dupeQuery);
$dupePairs = [];
while ($row = $dupeResult->fetch_assoc()) {
    $dupePairs[] = $row;
}

/** Number of sample records stored inside a row's payload_json. */
function payloadRecordCount($payload): int
{
    $decoded = json_decode((string) $payload, true);
    if (!is_array($decoded)) {
        return 0;
    }
    $records = $decoded['project']['records'] ?? null;
    return is_array($records) ? count($records) : 0;
}

$auditCount = 0;
$auditResult = $conn->query(
    "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = '"
    . $conn->real_escape_string($name) . "' AND TABLE_NAME = 'atterberg_save_audit'"
);
if ((int) ($auditResult->fetch_assoc()['c'] ?? 0) > 0) {
    $auditRow = $conn->query("SELECT COUNT(*) AS c FROM atterberg_save_audit")->fetch_assoc();
    $auditCount = (int) ($auditRow['c'] ?? 0);
}

$blockingWarnings = [];

if (count($dupePairs) === 0) {
    echo '[' . date('d-M-Y H:i:s T') . '] No duplicate pairs found.' . "\n";
} else {
    $totalExtra = 0;
    foreach ($dupePairs as $pair) {
        $totalExtra += ((int) $pair['row_count']) - 1;
        echo sprintf(
            "  project_id=%s test_key=%-14s rows=%d\n",
            $pair['project_id'],
            $pair['test_key'],
            (int) $pair['row_count']
        );
    }
    echo '[' . date('d-M-Y H:i:s T') . '] ' . count($dupePairs) . ' duplicate pair(s), '
        . $totalExtra . ' row(s) to remove.' . "\n";
}

// Resolve the keeper and the rows to drop for each pair, and refuse to lose data.
$plan = [];
foreach ($dupePairs as $pair) {
    $projectId = (int) $pair['project_id'];
    $testKey = $pair['test_key'];
    $rowQuery = $conn->prepare(
        "SELECT id, status, payload_json, updated_at FROM test_results
         WHERE project_id = ? AND test_key = ?
         ORDER BY updated_at DESC, id DESC"
    );
    $rowQuery->bind_param('is', $projectId, $testKey);
    $rowQuery->execute();
    $rows = [];
    while ($row = $rowQuery->get_result()->fetch_assoc()) {
        $rows[] = $row;
    }
    $rowQuery->close();
    if (count($rows) < 2) {
        continue;
    }

    $keeper = array_shift($rows);
    $keeperSamples = payloadRecordCount($keeper['payload_json']);
    $dropIds = [];
    foreach ($rows as $stale) {
        $staleSamples = payloadRecordCount($stale['payload_json']);
        if ($staleSamples > $keeperSamples) {
            $blockingWarnings[] = sprintf(
                'project %s / %s: keeper #%s holds %d sample(s) but #%s holds %d - keeping the newest would lose data',
                $projectId,
                $testKey,
                $keeper['id'],
                $keeperSamples,
                $stale['id'],
                $staleSamples
            );
        }
        $dropIds[] = (int) $stale['id'];
    }
    $plan[] = [
        'project_id' => $projectId,
        'test_key' => $testKey,
        'keep_id' => (int) $keeper['id'],
        'keep_samples' => $keeperSamples,
        'drop_ids' => $dropIds,
    ];
}

if (count($blockingWarnings) > 0) {
    echo "\n[" . date('d-M-Y H:i:s T') . '] BLOCKING WARNINGS' . "\n";
    foreach ($blockingWarnings as $warning) {
        echo '  ! ' . $warning . "\n";
    }
    echo "These pairs must be merged by hand. Nothing will be deleted.\n\n";
}

if ($auditCount > 0) {
    $plannedDrops = array_sum(array_column($plan, 'drop_ids') ? array_map('count', array_column($plan, 'drop_ids')) : []);
    echo '[' . date('d-M-Y H:i:s T') . '] atterberg_save_audit holds ' . $auditCount
        . ' row(s) with ON DELETE CASCADE to test_results; deleting ' . $plannedDrops
        . " result row(s) will cascade away the matching audit row(s)." . "\n";
}

if ($apply && count($blockingWarnings) > 0) {
    die("Aborted: resolve the blocking warnings above before running with --apply.\n");
}

$removed = 0;
if ($apply && count($plan) > 0) {
    $conn->begin_transaction();
    try {
        foreach ($plan as $entry) {
            foreach ($entry['drop_ids'] as $id) {
                $delete = $conn->prepare("DELETE FROM test_results WHERE id = ?");
                $delete->bind_param('i', $id);
                if ($delete->execute()) {
                    $removed += $delete->affected_rows;
                } else {
                    throw new RuntimeException('Failed to delete test_results ' . $id . ': ' . $delete->error);
                }
                $delete->close();
            }
            echo '  project ' . $entry['project_id'] . ' / ' . $entry['test_key']
                . ' -> kept #' . $entry['keep_id'] . ', removed ' . count($entry['drop_ids']) . "\n";
        }
        $conn->commit();
        echo '[' . date('d-M-Y H:i:s T') . '] Removed ' . $removed . ' duplicate row(s).' . "\n";
    } catch (Throwable $error) {
        $conn->rollback();
        die('Migration failed and was rolled back: ' . $error->getMessage() . "\n");
    }
}

// 2. Re-add the unique index so duplicates cannot be inserted again.
$indexCheck = $conn->query(
    "SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = '" . $conn->real_escape_string($name) . "'
       AND TABLE_NAME = 'test_results'
       AND INDEX_NAME = 'uq_test_results_project_test_key'"
);
$indexExists = ((int) ($indexCheck->fetch_assoc()['c'] ?? 0)) > 0;

if ($indexExists) {
    echo '[' . date('d-M-Y H:i:s T') . '] uq_test_results_project_test_key already exists.' . "\n";
} elseif ($apply) {
    if ($conn->query('ALTER TABLE `test_results` ADD UNIQUE KEY `uq_test_results_project_test_key` (`project_id`, `test_key`)')) {
        echo '[' . date('d-M-Y H:i:s T') . '] Added uq_test_results_project_test_key.' . "\n";
    } else {
        die('Failed to add the unique index: ' . $conn->error . "\n");
    }
} else {
    echo '[' . date('d-M-Y H:i:s T') . '] Would add uq_test_results_project_test_key.' . "\n";
}

$conn->close();
echo '[' . date('d-M-Y H:i:s T') . '] Done. Removed=' . $removed . "\n";
