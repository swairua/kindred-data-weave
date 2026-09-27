<?php
/**
 * Orphan audit for compressive tests (read-only unless --repair is passed).
 *
 * Root cause of the "Couldn't load project details" error: `compressive_tests`
 * carries no foreign key to `projects`, so deleting a project leaves the test
 * (and its cubes) orphaned. The record wizard then calls `read projects` with
 * the stale project_id and gets a 404 ("Record not found", logged as
 * `API error response: status=404, action=read`).
 *
 * Usage (run on the server, against the live database):
 *   CLI:  php migrate_compressive_orphans.php            # report only, changes nothing
 *         php migrate_compressive_orphans.php --repair   # delete orphaned rows + guard future deletes
 *   Web:  /migrate_compressive_orphans.php               # report only, changes nothing
 *         /migrate_compressive_orphans.php?repair=1&token=<REPAIR_TOKEN>
 *                                                        # repair (needs the token below)
 *
 * The web repair URL only works with the exact token. Delete this file from
 * the server as soon as you are done - it must not stay publicly reachable.
 *
 * Repair deletes orphaned compressive_tests rows together with their
 * compressive_cubes children, then adds fk_compressive_tests_project with
 * ON DELETE CASCADE so a future project delete removes the test rows with it
 * (same semantics as atterberg_instances). The existing orphan (test id 1,
 * project 11) holds only placeholder data (dd/dd/dd), but review the --repair
 * report before running it: deletions cannot be undone without a backup.
 */

declare(strict_types=1);

const REPAIR_TOKEN = 'f925f0c38554df1cf5035ff97a9570783e0ee8f83fdd1247';
const REPAIR_DEFAULT_CONFIRM = 'DELETE-ORPHANS';

$isWeb = PHP_SAPI !== 'cli';
$rawRepairFlag = $isWeb ? ($_GET['repair'] ?? '0') : '';
$rawToken = $isWeb ? ($_GET['token'] ?? '') : '';
$rawConfirm = $isWeb ? ($_GET['confirm'] ?? '') : '';

$repair = $isWeb
    ? ($rawRepairFlag === '1' && hash_equals(REPAIR_TOKEN, (string) $rawToken)
        && hash_equals(REPAIR_DEFAULT_CONFIRM, (string) $rawConfirm))
    : in_array('--repair', $argv ?? [], true);

if ($isWeb && ($rawRepairFlag === '1' || $rawToken !== '' || $rawConfirm !== '')) {
    header('Content-Type: text/plain; charset=utf-8');
    if (!hash_equals(REPAIR_TOKEN, (string) $rawToken)) {
        http_response_code(403);
        echo "Repair refused: bad or missing token.\n";
        exit(1);
    }
    if (!hash_equals(REPAIR_DEFAULT_CONFIRM, (string) $rawConfirm)) {
        http_response_code(400);
        echo 'Repair refused: pass confirm=' . REPAIR_DEFAULT_CONFIRM . " to proceed.\n";
        exit(1);
    }
} elseif ($isWeb) {
    header('Content-Type: text/plain; charset=utf-8');
}

$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 'wayrusc1_labdatacraft';
$pass = getenv('DB_PASS') ?: 'Sirgeorge.12';
$name = getenv('DB_NAME') ?: 'wayrusc1_labdatacraft';
$port = (int) (getenv('DB_PORT') ?: 3306);

$log = static function (string $message): void {
    echo '[' . date('d-M-Y H:i:s T') . '] ' . $message . "\n";
};

$conn = new mysqli($host, $user, $pass, $name, $port);
if ($conn->connect_error) {
    die('Connection failed: ' . $conn->connect_error . "\n");
}
$conn->set_charset('utf8mb4');

/** @return array<int, array<string, mixed>> */
$fetchAll = static function (string $sql) use ($conn): array {
    $result = $conn->query($sql);
    if (!$result) {
        die('Query failed: ' . $conn->error . "\n");
    }
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $rows[] = $row;
    }
    return $rows;
};

$orphans = $fetchAll(
    'SELECT ct.id, ct.project_id, ct.client_ref, ct.date_tested, ct.status, ' .
    '(SELECT COUNT(*) FROM compressive_cubes cc WHERE cc.test_id = ct.id) AS cube_count ' .
    'FROM compressive_tests ct LEFT JOIN projects p ON p.id = ct.project_id ' .
    'WHERE p.id IS NULL ORDER BY ct.id'
);

if ($orphans === []) {
    $log('No orphaned compressive_tests rows: every test points at an existing project.');
} else {
    $log(sprintf('Found %d orphaned compressive_tests row(s):', count($orphans)));
    foreach ($orphans as $orphan) {
        $log(sprintf(
            '  test id=%s project_id=%s client_ref=%s date_tested=%s status=%s cubes=%s',
            $orphan['id'],
            $orphan['project_id'],
            $orphan['client_ref'] ?? '(none)',
            $orphan['date_tested'] ?? '(none)',
            $orphan['status'] ?? '(none)',
            $orphan['cube_count']
        ));
    }
}

$constraintExists = $fetchAll(
    "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS " .
    "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compressive_tests' " .
    "AND CONSTRAINT_NAME = 'fk_compressive_tests_project'"
) !== [];

if (!$repair) {
    if ($orphans !== []) {
        $log('Report only: re-run with --repair (CLI) or ?repair=1&token=<REPAIR_TOKEN>&confirm=' . REPAIR_DEFAULT_CONFIRM . ' (web) to delete the rows above and add the guard.');
    } elseif (!$constraintExists) {
        $log('Report only: re-run with --repair (CLI) or ?repair=1&token=<REPAIR_TOKEN>&confirm=' . REPAIR_DEFAULT_CONFIRM . ' (web) to add fk_compressive_tests_project.');
    }
    exit(0);
}

foreach ($orphans as $orphan) {
    $testId = (int) $orphan['id'];
    $cubes = $conn->prepare('DELETE FROM compressive_cubes WHERE test_id = ?');
    $cubes->bind_param('i', $testId);
    $cubes->execute();
    $log(sprintf('Deleted %d cube row(s) for orphaned test id=%d.', $cubes->affected_rows, $testId));
    $cubes->close();

    $tests = $conn->prepare('DELETE FROM compressive_tests WHERE id = ?');
    $tests->bind_param('i', $testId);
    $tests->execute();
    $log(sprintf('Deleted orphaned compressive test id=%d.', $testId));
    $tests->close();
}

if (!$constraintExists) {
    $conn->query(
        'ALTER TABLE compressive_tests ' .
        'ADD CONSTRAINT fk_compressive_tests_project ' .
        'FOREIGN KEY (project_id) REFERENCES projects (id) ' .
        'ON DELETE CASCADE ON UPDATE CASCADE'
    );
    if ($conn->error) {
        die('Failed to add the foreign key: ' . $conn->error . "\n");
    }
    $log('Added fk_compressive_tests_project (ON DELETE CASCADE) to compressive_tests.project_id.');
} else {
    $log('fk_compressive_tests_project already exists; nothing more to do.');
}

$conn->close();
$log('Done.');
