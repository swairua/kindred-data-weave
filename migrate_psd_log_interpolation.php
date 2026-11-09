<?php
/**
 * Recalculate existing PSD (grading) test results using the corrected
 * logarithmic interpolation and Cc = D30^2 / (D10 * D60) formula.
 *
 * Root cause: Before commit c5cbc43, D10/D30/D60 were interpolated linearly
 * instead of logarithmically (per BS 1377-2 semi-log graph paper standard),
 * and Cc was computed as D50^2 / (D10 * D60) instead of D30^2 / (D10 * D60).
 * Existing test_results rows saved under those bugs carry stale D-values and
 * Cc in their payload_json / key_results_json.
 *
 * This script recomputes gradation coefficients from the raw sieve rows
 * (record.sieveRows) stored in each grading test_results row and rewrites
 * both the payload_json and key_results_json with corrected values.
 *
 * Usage (run on the server, against the live database):
 *   CLI:  php migrate_psd_log_interpolation.php            # report only, changes nothing
 *         php migrate_psd_log_interpolation.php --repair   # recalculate and update rows
 *   Web:  /migrate_psd_log_interpolation.php               # report only, changes nothing
 *         /migrate_psd_log_interpolation.php?repair=1&token=<REPAIR_TOKEN>
 *                                                        # repair (needs the token below)
 *
 * The web repair URL only works with the exact token. Delete this file from
 * the server as soon as you are done - it must not stay publicly reachable.
 */

declare(strict_types=1);

const REPAIR_TOKEN = 'c5cbc43-log-interpolation-psd-recalc';
const REPAIR_DEFAULT_CONFIRM = 'RECALCULATE-PSD';

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

/**
 * Map sieve label (e.g. "No. 4", "0.075", "4.75 (No. 4)") to millimetres.
 */
$sieveLabelToMm = [
    'no. 4' => 4.75, 'no. 8' => 2.36, 'no. 10' => 2.0, 'no. 16' => 1.18,
    'no. 30' => 0.6, 'no. 40' => 0.425, 'no. 50' => 0.3, 'no. 100' => 0.15,
    'no. 200' => 0.075,
];

$sieveSizeToMm = static function (string $label) use (&$sieveLabelToMm): float {
    $trimmed = strtolower(trim($label));
    if (isset($sieveLabelToMm[$trimmed])) {
        return (float) $sieveLabelToMm[$trimmed];
    }
    if (preg_match('/[\d.]+/', $trimmed, $m)) {
        $parsed = (float) $m[0];
        return is_numeric($parsed) ? $parsed : 0.0;
    }
    return 0.0;
};

/**
 * Is a sieve row a pan row (<0.063, <0.075, pan)? Pan rows carry no passing value.
 */
$isPanRow = static function (string $sieveSize): bool {
    $label = strtolower(trim($sieveSize));
    return $label === 'pan' || str_starts_with($label, '<');
};

/**
 * Log interpolation: D(p) = 10^(log10(d1) + r * (log10(d2) - log10(d1)))
 * where r = (target - p1) / (p2 - p1).
 */
$interpolateLog = static function (array $points, int $target): ?float {
    $valid = array_filter($points, static function ($p) {
        return is_numeric($p['size']) && $p['size'] > 0
            && $p['passing'] !== null && is_numeric($p['passing']);
    });
    usort($valid, static fn ($a, $b) => $a['size'] <=> $b['size']);

    for ($i = 0; $i < count($valid) - 1; $i++) {
        $first = $valid[$i];
        $second = $valid[$i + 1];
        if ($first['passing'] <= $target && $second['passing'] >= $target
            && $second['passing'] !== $first['passing']) {
            $ratio = ($target - $first['passing']) / ($second['passing'] - $first['passing']);
            $size = pow(10, log10($first['size'])
                + $ratio * (log10($second['size']) - log10($first['size'])));
            return (float) round($size, 4);
        }
    }
    return null;
};

/**
 * Recalculate gradation coefficients from raw sieve rows.
 * Returns ['d10'=>?, 'd30'=>?, 'd60'=>?, 'cu'=>?, 'cc'=>?]
 * or null if insufficient data.
 */
$calculateGradationCoeffs = static function (array $sieveRows) use ($sieveSizeToMm, $isPanRow, $interpolateLog): ?array {
    $totalWeight = 0.0;
    $retainedMasses = [];
    $sizes = [];

    foreach ($sieveRows as $row) {
        $mass = (float) ($row['weightRetained'] ?? 0);
        if ($mass < 0) $mass = 0;
        $totalWeight += $mass;
        $retainedMasses[] = $mass;
        $sizes[] = $row['sieveSize'] ?? '';
    }

    if ($totalWeight <= 0) {
        return null;
    }

    $retained = 0.0;
    $points = [];
    foreach ($sieveRows as $i => $row) {
        $retained += $retainedMasses[$i];
        $sizeMm = $sieveSizeToMm($row['sieveSize'] ?? '');
        if ($sizeMm <= 0) {
            continue;
        }
        if ($isPanRow($row['sieveSize'] ?? '')) {
            continue;
        }
        $passing = (1 - $retained / $totalWeight) * 100;
        $points[] = ['size' => $sizeMm, 'passing' => round($passing, 4)];
    }

    $d10 = $interpolateLog($points, 10);
    $d30 = $interpolateLog($points, 30);
    $d60 = $interpolateLog($points, 60);

    if ($d10 === null || $d10 === 0.0 || $d30 === null || $d60 === null) {
        return null;
    }

    $cu = round($d60 / $d10, 2);
    $cc = round(($d30 * $d30) / ($d10 * $d60), 2);

    return [
        'd10' => $d10,
        'd30' => $d30,
        'd60' => $d60,
        'cu' => $cu,
        'cc' => $cc,
    ];
};

$rows = $fetchAll(
    'SELECT id, project_id, test_key, payload_json, key_results_json, name '
    . 'FROM test_results WHERE test_key = "grading" ORDER BY id'
);

$log('Found ' . count($rows) . ' grading test result row(s).');

$updated = 0;
$skipped = 0;
$errors = 0;

foreach ($rows as $row) {
    $rowId = (int) $row['id'];
    $payloadRaw = $row['payload_json'] ?? null;
    if ($payloadRaw === null || $payloadRaw === '') {
        $skipped++;
        continue;
    }

    $payload = json_decode($payloadRaw, true);
    if (!is_array($payload)) {
        $log("  row id=$rowId: invalid JSON payload, skipping.");
        $errors++;
        continue;
    }

    // Extract sieve rows from payload.project.records[0].sieveRows
    $sieveRows = [];
    $project = $payload['project'] ?? null;
    if (is_array($project)) {
        $records = $project['records'] ?? null;
        if (is_array($records) && count($records) > 0) {
            $firstRecord = $records[0];
            if (is_array($firstRecord)) {
                $sr = $firstRecord['sieveRows'] ?? null;
                if (is_array($sr)) {
                    $sieveRows = $sr;
                }
            }
        }
    }

    if (count($sieveRows) === 0) {
        $log("  row id=$rowId: no sieve rows found, skipping.");
        $skipped++;
        continue;
    }

    $coeffs = $calculateGradationCoeffs($sieveRows);
    if ($coeffs === null) {
        $log("  row id=$rowId: insufficient data for gradation coefficients, skipping.");
        $skipped++;
        continue;
    }

    // Read existing values for comparison
    $calculations = $payload['calculations'] ?? [];
    $oldD10 = $calculations['d10'] ?? null;
    $oldD30 = $calculations['d30'] ?? null;
    $oldD60 = $calculations['d60'] ?? null;
    $oldCu = $calculations['cu'] ?? null;
    $oldCc = $calculations['cc'] ?? null;

    $changed = (
        ($oldD10 !== $coeffs['d10']) ||
        ($oldD30 !== $coeffs['d30']) ||
        ($oldD60 !== $coeffs['d60']) ||
        ($oldCu !== $coeffs['cu']) ||
        ($oldCc !== $coeffs['cc'])
    );

    if (!$changed) {
        $log("  row id=$rowId: already correct (D10={$coeffs['d10']}, D30={$coeffs['d30']}, D60={$coeffs['d60']}, Cu={$coeffs['cu']}, Cc={$coeffs['cc']}).");
        continue;
    }

    $log("  row id=$rowId: D10 {$oldD10}->{$coeffs['d10']}, D30 {$oldD30}->{$coeffs['d30']}, "
        . "D60 {$oldD60}->{$coeffs['d60']}, Cu {$oldCu}->{$coeffs['cu']}, Cc {$oldCc}->{$coeffs['cc']}.");

    if (!$repair) {
        continue;
    }

    // Update payload_json calculations
    $calculations['d10'] = $coeffs['d10'];
    $calculations['d30'] = $coeffs['d30'];
    $calculations['d60'] = $coeffs['d60'];
    $calculations['cu'] = $coeffs['cu'];
    $calculations['cc'] = $coeffs['cc'];
    $payload['calculations'] = $calculations;

    $newPayloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($newPayloadJson === false) {
        $log("  row id=$rowId: failed to encode payload_json.");
        $errors++;
        continue;
    }

    // Update key_results_json
    $keyResults = json_decode($row['key_results_json'] ?? '[]', true);
    if (!is_array($keyResults)) {
        $keyResults = [];
    }

    $replaceOrAdd = static function (array &$results, string $label, $value) use (&$conn): void {
        $found = false;
        foreach ($results as &$item) {
            if (is_array($item) && ($item['label'] ?? '') === $label) {
                $item['value'] = $value;
                $found = true;
                break;
            }
        }
        if (!$found) {
            $results[] = ['label' => $label, 'value' => $value];
        }
    };

    $replaceOrAdd($keyResults, 'D10', number_format($coeffs['d10'], 3));
    $replaceOrAdd($keyResults, 'D30', number_format($coeffs['d30'], 3));
    $replaceOrAdd($keyResults, 'D60', number_format($coeffs['d60'], 3));
    $replaceOrAdd($keyResults, 'Cu', number_format($coeffs['cu'], 2));
    $replaceOrAdd($keyResults, 'Cc', number_format($coeffs['cc'], 2));

    $newKeyResultsJson = json_encode($keyResults, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($newKeyResultsJson === false) {
        $log("  row id=$rowId: failed to encode key_results_json.");
        $errors++;
        continue;
    }

    $stmt = $conn->prepare(
        'UPDATE test_results SET payload_json = ?, key_results_json = ? WHERE id = ?'
    );
    $stmt->bind_param('ssi', $newPayloadJson, $newKeyResultsJson, $rowId);
    if (!$stmt->execute()) {
        $log("  row id=$rowId: UPDATE failed: " . $stmt->error);
        $errors++;
    } else {
        $updated++;
    }
    $stmt->close();
}

if (!$repair) {
    $log('Report only: ' . count($rows) . ' rows scanned, '
        . ($updated + $skipped + $errors) . ' with differences found.');
    $log('Re-run with --repair (CLI) or ?repair=1&token=' . REPAIR_TOKEN . '&confirm=' . REPAIR_DEFAULT_CONFIRM . ' (web) to apply.');
    exit(0);
}

$log('Recalculation complete: ' . $updated . ' row(s) updated, '
    . $skipped . ' skipped, ' . $errors . ' error(s).');

$conn->close();
