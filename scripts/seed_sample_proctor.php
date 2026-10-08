<?php
declare(strict_types=1);

/**
 * scripts/seed_sample_proctor.php
 *
 * Inserts an idempotent "Density/Moisture Content Relationship" (Proctor)
 * sample project + test result row into the lab database so the Proctor
 * export flow can be exercised end-to-end (PDF) against real DB persistence.
 *
 * Environment (with api.php-compatible defaults):
 *   DB_HOST     default 'localhost'  (use lab.wayrus.co.ke for the remote DB)
 *   DB_USER     default 'wayrusc1_labdatacraft'
 *   DB_PASS     default 'Sirgeorge.12'
 *   DB_NAME     default 'wayrusc1_labdatacraft'
 *   DB_PORT     default 3306
 *
 *   API_URL     default 'https://lab.wayrus.co.ke/api.php'  (used when --api flag is set)
 *   API_EMAIL   admin@cransfield.com
 *   API_PASS    Pass123
 *
 * Usage:
 *   php scripts/seed_sample_proctor.php            # Direct MySQL insert
 *   php scripts/seed_sample_proctor.php --api      # HTTPS API insert (works through firewall)
 */

/* ---------------------------------------------------------------------- */
/* Configuration                                                          */
/* ---------------------------------------------------------------------- */
$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 'wayrusc1_labdatacraft';
$pass = getenv('DB_PASS') ?: 'Sirgeorge.12';
$name = getenv('DB_NAME') ?: 'wayrusc1_labdatacraft';
$port = (int) (getenv('DB_PORT') ?: 3306);

$apiUrl = getenv('API_URL') ?: 'https://lab.wayrus.co.ke/api.php';
$apiEmail = getenv('API_EMAIL') ?: 'admin@cransfield.com';
$apiPass = getenv('API_PASS') ?: 'Pass123';
$useApi = in_array('--api', $argv ?? [], true);

echo '=== seed_sample_proctor.php ===' . PHP_EOL;
echo "Mode: " . ($useApi ? 'HTTPS API' : 'Direct MySQL') . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed project / record data                                             */
/* ---------------------------------------------------------------------- */
$projectName     = 'KIRIAINI AHP';
$clientName      = 'AHP';
$projectDate     = '2026-06-11';
$labOrganization = 'Cransfield Materials Testing Center';
$testKey         = 'proctor';

// Record identity
$label       = 'BH1';
$sampleNo    = 'BH01';
$sampleFrom  = '0.0';
$sampleTo    = '25.0';
$sampledBy   = 'Cransfield';
$testedBy    = 'JILLO';
$dateSub     = '2026-06-09';
$dateTest    = '2026-06-11';
$sampleNotes = 'BS 1377-4:1990 3.3 (standard Proctor, 2.5 kg rammer)';

// Proctor parameters
$mouldVolume    = '1000';   // cm³, 1 L compaction mould (BS 1377-4 3.3.2.1)
$specificGravity = '2.70';
$airVoidsTarget = '5';

// Standard Proctor mould tare and container tare (g)
$mouldTare    = '2500';
$containerTare = '50';

/**
 * Six standard Proctor points bracketing the peak. Each entry is
 * [moistureAdded(cc), containerNo, drySoilMass(g), waterMass(g)].
 * The mould and container masses are derived so the computed
 * moisture content and dry density land on the intended curve.
 *
 * Intended (moisture %, dry density kg/m³):
 *   A  8.0  1750
 *   B 10.0  1850
 *   C 12.0  1920
 *   D 14.0  1900
 *   E 16.0  1830
 *   F 18.0  1750
 */
$points = [
    ['moistureAdded' => '0',   'containerNo' => 'C1', 'drySoilMass' => '100', 'waterMass' => '8'],
    ['moistureAdded' => '20',  'containerNo' => 'C2', 'drySoilMass' => '100', 'waterMass' => '10'],
    ['moistureAdded' => '40',  'containerNo' => 'C3', 'drySoilMass' => '100', 'waterMass' => '12'],
    ['moistureAdded' => '60',  'containerNo' => 'C4', 'drySoilMass' => '100', 'waterMass' => '14'],
    ['moistureAdded' => '80',  'containerNo' => 'C5', 'drySoilMass' => '100', 'waterMass' => '16'],
    ['moistureAdded' => '100', 'containerNo' => 'C6', 'drySoilMass' => '100', 'waterMass' => '18'],
];

/* ---------------------------------------------------------------------- */
/* Calculation helpers (ported from src/lib/proctorRecords.ts)            */
/* ---------------------------------------------------------------------- */

/** Parse a string to float, return null when blank/non-finite. */
function parseValue(string $value): ?float {
    $trimmed = trim($value);
    if ($trimmed === '') return null;
    $parsed = floatval($trimmed);
    return is_finite($parsed) ? $parsed : null;
}

/** Port of calculateProctorPoint from proctorRecords.ts. */
function php_calculateProctorPoint(array $row, string $mouldVolume): array {
    $empty = [
        'wetMaterialMass' => null, 'bulkDensity' => null, 'waterMass' => null,
        'drySoilMass' => null, 'moistureContent' => null, 'dryDensity' => null,
    ];
    $volume = parseValue($mouldVolume);
    $mouldWetMass = parseValue($row['mouldWetMass']);
    $mouldTare = parseValue($row['mouldTare']);
    $containerWetMass = parseValue($row['containerWetMass']);
    $containerDryMass = parseValue($row['containerDryMass']);
    $containerTare = parseValue($row['containerTare']);
    if ($volume === null || !is_finite($volume) || $volume <= 0) return $empty;
    if ($mouldWetMass === null || $mouldTare === null || $containerWetMass === null
        || $containerDryMass === null || $containerTare === null) return $empty;

    $wetMaterialMass = $mouldWetMass - $mouldTare;
    $waterMass = $containerWetMass - $containerDryMass;
    $drySoilMass = $containerDryMass - $containerTare;
    if ($wetMaterialMass <= 0 || $waterMass < 0 || $drySoilMass <= 0) return $empty;

    $bulkDensity = ($wetMaterialMass / $volume) * 1000;
    $moistureContent = ($waterMass / $drySoilMass) * 100;
    $dryDensity = $bulkDensity / (1 + $moistureContent / 100);
    return [
        'wetMaterialMass' => $wetMaterialMass,
        'bulkDensity' => $bulkDensity,
        'waterMass' => $waterMass,
        'drySoilMass' => $drySoilMass,
        'moistureContent' => $moistureContent,
        'dryDensity' => $dryDensity,
    ];
}

/** 3x3 determinant. */
function determinant3(array $m): float {
    return $m[0][0] * ($m[1][1] * $m[2][2] - $m[1][2] * $m[2][1])
         - $m[0][1] * ($m[1][0] * $m[2][2] - $m[1][2] * $m[2][0])
         + $m[0][2] * ($m[1][0] * $m[2][1] - $m[1][1] * $m[2][0]);
}

/** Cramer's rule for a 3x3 system; null when singular. */
function solve3(array $m, array $v): ?array {
    $det = determinant3($m);
    if (!is_finite($det) || abs($det) < 1e-9) return null;
    $out = [];
    for ($col = 0; $col < 3; $col++) {
        $replaced = [];
        foreach ($m as $r => $row) {
            $replaced[$r] = [];
            foreach ($row as $c => $cell) {
                $replaced[$r][$c] = ($c === $col) ? $v[$r] : $cell;
            }
        }
        $out[] = determinant3($replaced) / $det;
    }
    foreach ($out as $value) {
        if (!is_finite($value)) return null;
    }
    return $out;
}

/**
 * Port of fitCompactionCurve: least-squares parabola
 * dryDensity = a.moisture^2 + b.moisture + c through the measured points.
 */
function php_fitCompactionCurve(array $points): ?array {
    $samples = array_values(array_filter($points, fn($p) =>
        $p['moisture'] !== null && $p['dryDensity'] !== null
        && is_finite($p['moisture']) && is_finite($p['dryDensity'])));
    if (count($samples) < 3) return null;
    $moistures = array_map(fn($p) => $p['moisture'], $samples);
    if (count(array_unique($moistures)) < 3) return null;

    $n = 0; $sx = 0.0; $sx2 = 0.0; $sx3 = 0.0; $sx4 = 0.0;
    $sy = 0.0; $sxy = 0.0; $sx2y = 0.0;
    foreach ($samples as $p) {
        $x = $p['moisture']; $y = $p['dryDensity'];
        $n += 1;
        $sx += $x; $sx2 += $x * $x; $sx3 += $x ** 3; $sx4 += $x ** 4;
        $sy += $y; $sxy += $x * $y; $sx2y += $x * $x * $y;
    }

    $solved = solve3(
        [[$n, $sx, $sx2], [$sx, $sx2, $sx3], [$sx2, $sx3, $sx4]],
        [$sy, $sxy, $sx2y]
    );
    if ($solved === null) return null;
    [$c, $b, $a] = $solved;
    if ($a >= 0) return null;

    $omc = -$b / (2 * $a);
    $mdd = $a * $omc * $omc + $b * $omc + $c;
    if (!is_finite($omc) || !is_finite($mdd) || $mdd <= 0) return null;

    $lowest = min($moistures);
    $highest = max($moistures);
    if ($omc < $lowest - 2 || $omc > $highest + 2) return null;

    $mean = $sy / $n;
    $totalSpread = 0.0; $residualSpread = 0.0;
    foreach ($samples as $p) {
        $totalSpread += ($p['dryDensity'] - $mean) ** 2;
        $residualSpread += ($p['dryDensity'] - ($a * $p['moisture'] * $p['moisture'] + $b * $p['moisture'] + $c)) ** 2;
    }
    $rSquared = $totalSpread <= 0 ? ($residualSpread <= 0 ? 1 : 0) : 1 - $residualSpread / $totalSpread;
    return ['a' => $a, 'b' => $b, 'c' => $c, 'rSquared' => $rSquared, 'omc' => $omc, 'mdd' => $mdd];
}

/** Port of proctorWarnings. */
function php_proctorWarnings(array $points, ?array $fit): array {
    $warnings = [];
    if (count($points) < 5) {
        $warnings[] = 'Only ' . count($points) . ' moisture content' . (count($points) === 1 ? '' : 's') . ' completed; BS 1377-4 expects at least 5 with the peak bracketed.';
    }
    $peakDryDensity = max(array_map(fn($p) => $p['dryDensity'], $points));
    $peakIndex = 0;
    foreach ($points as $i => $p) { if ($p['dryDensity'] === $peakDryDensity) { $peakIndex = $i; break; } }
    if ($peakIndex === 0 || $peakIndex === count($points) - 1) {
        $warnings[] = 'Maximum dry density sits on the outermost completed point, so the curve has not turned over and OMC/MDD are not reliable.';
    }
    if (count($points) >= 3 && $fit === null) {
        $warnings[] = 'A stable compaction curve could not be fitted; OMC and MDD are taken from the highest measured point.';
    }
    if ($fit !== null && $fit['rSquared'] < 0.9) {
        $warnings[] = 'Curve fit is poor (R2 = ' . number_format($fit['rSquared'], 2) . '); check the readings and that the points bracket the peak.';
    }
    return $warnings;
}

/** Port of calculateProctor. */
function php_calculateProctor(array $rows, string $mouldVolume): array {
    $empty = [
        'omc' => null, 'mdd' => null, 'bulkDensity' => null, 'optimumSource' => 'none',
        'curve' => null, 'rSquared' => null, 'pointCount' => 0, 'warnings' => [],
    ];
    $measured = [];
    foreach ($rows as $row) {
        $point = php_calculateProctorPoint($row, $mouldVolume);
        if ($point['moistureContent'] !== null && $point['dryDensity'] !== null) {
            $measured[] = $point;
        }
    }
    if (count($measured) === 0) return $empty;

    $points = array_map(fn($p) => ['moisture' => $p['moistureContent'], 'dryDensity' => $p['dryDensity']], $measured);
    usort($points, fn($a, $b) => $a['moisture'] <=> $b['moisture']);
    $fit = php_fitCompactionCurve($points);
    $warnings = php_proctorWarnings($points, $fit);

    if ($fit !== null) {
        return [
            'omc' => $fit['omc'],
            'mdd' => $fit['mdd'],
            'bulkDensity' => $fit['mdd'] * (1 + $fit['omc'] / 100),
            'optimumSource' => 'curve',
            'curve' => $fit,
            'rSquared' => $fit['rSquared'],
            'pointCount' => count($points),
            'warnings' => $warnings,
        ];
    }

    $peak = $points[0];
    foreach ($points as $p) { if ($p['dryDensity'] > $peak['dryDensity']) $peak = $p; }
    $peakMeasurement = $measured[0];
    foreach ($measured as $m) { if ($m['dryDensity'] > $peakMeasurement['dryDensity']) $peakMeasurement = $m; }
    return [
        'omc' => $peak['moisture'],
        'mdd' => $peak['dryDensity'],
        'bulkDensity' => $peakMeasurement['bulkDensity'],
        'optimumSource' => 'peak-point',
        'curve' => null,
        'rSquared' => null,
        'pointCount' => count($points),
        'warnings' => $warnings,
    ];
}

/* ---------------------------------------------------------------------- */
/* Build the Proctor rows from the intended points                        */
/* ---------------------------------------------------------------------- */
$standardRows = [];
foreach ($points as $pt) {
    $drySoilMass = floatval($pt['drySoilMass']);
    $waterMass = floatval($pt['waterMass']);
    $moistureContent = ($waterMass / $drySoilMass) * 100;
    // Target dry density drives the bulk density so the curve peaks near 12%.
    // bulkDensity = dryDensity * (1 + w/100); with a 1000 cm3 mould,
    // wetMaterialMass (g) == bulkDensity (kg/m3).
    $intendedDry = [1750, 1850, 1920, 1900, 1830, 1750][array_search($pt, $points, true) ?: 0];
    $bulkDensity = $intendedDry * (1 + $moistureContent / 100);
    $wetMaterialMass = $bulkDensity; // volume = 1000 cm3
    $standardRows[] = [
        'moistureAdded'   => $pt['moistureAdded'],
        'mouldWetMass'    => (string) round($wetMaterialMass + floatval($mouldTare), 1),
        'mouldTare'       => $mouldTare,
        'containerNumber' => $pt['containerNo'],
        'containerWetMass' => (string) round($containerTare + $drySoilMass + $waterMass, 1),
        'containerDryMass' => (string) round($containerTare + $drySoilMass, 1),
        'containerTare'   => $containerTare,
    ];
}

// Modified rows: present but empty (standard-only record)
$modifiedRows = [];
for ($i = 0; $i < 6; $i++) {
    $modifiedRows[] = [
        'moistureAdded' => '', 'mouldWetMass' => '', 'mouldTare' => '',
        'containerNumber' => '', 'containerWetMass' => '', 'containerDryMass' => '',
        'containerTare' => '',
    ];
}

$record = [
    'label' => $label,
    'sampleNumber' => $sampleNo,
    'sampleDepthFrom' => $sampleFrom,
    'sampleDepthTo' => $sampleTo,
    'sampledSubmittedBy' => $sampledBy,
    'dateSubmitted' => $dateSub,
    'dateTested' => $dateTest,
    'sampleNotes' => $sampleNotes,
    'type' => 'standard',
    'standardMouldVolume' => $mouldVolume,
    'modifiedMouldVolume' => $mouldVolume,
    'standardRows' => $standardRows,
    'modifiedRows' => $modifiedRows,
    'specificGravity' => $specificGravity,
    'airVoidsTarget' => $airVoidsTarget,
];

$standardSummary = php_calculateProctor($standardRows, $mouldVolume);
$modifiedSummary = php_calculateProctor($modifiedRows, $mouldVolume);

$payload = [
    'version' => '2.0',
    'project' => [
        'title' => $projectName,
        'clientName' => $clientName,
        'date' => $projectDate,
        'records' => [$record],
    ],
    'calculations' => [
        'standard' => $standardSummary,
        'modified' => $modifiedSummary,
    ],
];

$payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// key_results_json mirrors the frontend resultFields (empty values filtered out)
$fmtMoisture = fn(?float $v) => $v === null ? '' : number_format($v, 1) . '%';
$fmtDensity = fn(?float $v) => $v === null ? '' : number_format($v, 0) . ' kg/m³';
$keyResults = [];
$stdOmc = $fmtMoisture($standardSummary['omc']);
$stdMdd = $fmtDensity($standardSummary['mdd']);
$modOmc = $fmtMoisture($modifiedSummary['omc']);
$modMdd = $fmtDensity($modifiedSummary['mdd']);
if ($stdOmc !== '') $keyResults[] = ['label' => 'Standard OMC', 'value' => $stdOmc];
if ($stdMdd !== '') $keyResults[] = ['label' => 'Standard MDD', 'value' => $stdMdd];
if ($modOmc !== '') $keyResults[] = ['label' => 'Modified OMC', 'value' => $modOmc];
if ($modMdd !== '') $keyResults[] = ['label' => 'Modified MDD', 'value' => $modMdd];
$keyResultsJson = json_encode($keyResults, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// data_points = valid points across both methods
$dataPoints = $standardSummary['pointCount'] + $modifiedSummary['pointCount'];
$status = $dataPoints === 0 ? 'not-started' : 'completed';

echo "Project: {$projectName}" . PHP_EOL;
echo "Standard OMC: " . ($standardSummary['omc'] !== null ? number_format($standardSummary['omc'], 1) . '%' : 'null') . PHP_EOL;
echo "Standard MDD: " . ($standardSummary['mdd'] !== null ? number_format($standardSummary['mdd'], 0) . ' kg/m³' : 'null') . PHP_EOL;
echo "Optimum source: {$standardSummary['optimumSource']}" . PHP_EOL;
echo "R²: " . ($standardSummary['rSquared'] !== null ? number_format($standardSummary['rSquared'], 3) : 'null') . PHP_EOL;
echo "Data points: {$dataPoints}" . PHP_EOL;
echo "Warnings: " . (count($standardSummary['warnings']) > 0 ? implode(' | ', $standardSummary['warnings']) : 'none') . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed via direct MySQL or HTTPS API                                     */
/* ---------------------------------------------------------------------- */

$seeded = false;

if ($useApi) {
    /* -------------------- HTTPS API mode -------------------- */
    echo PHP_EOL . "--- Seeding via HTTPS API ---" . PHP_EOL;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

    // Login
    $loginPayload = http_build_query(['action' => 'login', 'email' => $apiEmail, 'password' => $apiPass]);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $loginPayload);
    $loginOut = curl_exec($ch);
    $loginData = json_decode($loginOut, true);
    $token = $loginData['session_token'] ?? null;
    if (!$token) {
        fwrite(STDERR, 'FATAL: API login failed: ' . $loginOut . PHP_EOL);
        exit(1);
    }
    echo "API login OK (token: {$token})" . PHP_EOL;
    curl_close($ch);

    // 1. Find or create the project
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);

    $projectUrl = $apiUrl . '?' . http_build_query([
        'action' => 'list',
        'table' => 'projects',
        'limit' => 1000,
    ]);
    curl_setopt($ch, CURLOPT_URL, $projectUrl);
    $projList = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $existingProjectId = null;
    foreach ($projList['data'] ?? [] as $p) {
        if ($p['name'] === $projectName && ($p['test_type'] ?? '') === $testKey) {
            $existingProjectId = $p['id'];
            break;
        }
    }

    $projectId = null;
    if ($existingProjectId !== null) {
        echo "Project '{$projectName}' already exists (id={$existingProjectId}). Updating." . PHP_EOL;
        $projectId = $existingProjectId;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $updateData = json_encode([
            'action' => 'update',
            'table' => 'projects',
            'id' => $existingProjectId,
            'data' => [
                'name' => $projectName,
                'client_name' => $clientName,
                'project_date' => $projectDate,
                'test_type' => $testKey,
            ],
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $updateData);
        $updOut = curl_exec($ch);
        echo "Project update: {$updOut}" . PHP_EOL;
        curl_close($ch);
    } else {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $createData = json_encode([
            'action' => 'create',
            'table' => 'projects',
            'data' => [
                'name' => $projectName,
                'client_name' => $clientName,
                'project_date' => $projectDate,
                'test_type' => $testKey,
            ],
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $createData);
        $projOut = curl_exec($ch);
        $projData = json_decode($projOut, true);
        echo "Project create: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $projOut . PHP_EOL;
        $projectId = $projData['id'] ?? ($projData['data']['id'] ?? null);
        curl_close($ch);
    }

    if ($projectId === null) {
        fwrite(STDERR, 'FATAL: Could not create/find project.' . PHP_EOL);
        exit(1);
    }
    echo "Using project id={$projectId}" . PHP_EOL;

    // 2. Find or create the test_result
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);
    $trUrl = $apiUrl . '?' . http_build_query([
        'action' => 'list',
        'table' => 'test_results',
        'limit' => 1000,
    ]);
    curl_setopt($ch, CURLOPT_URL, $trUrl);
    $trList = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $existingResultId = null;
    foreach ($trList['data'] ?? [] as $r) {
        if ((string) $r['project_id'] === (string) $projectId && ($r['test_key'] ?? '') === $testKey) {
            $existingResultId = $r['id'];
            break;
        }
    }

    $testResultData = [
        'project_id'    => $projectId,
        'test_key'      => $testKey,
        'name'          => 'Density/Moisture Content Relationship',
        'category'      => 'soil',
        'status'        => $status,
        'data_points'   => $dataPoints,
        'key_results_json'  => $keyResultsJson,
        'payload_json'  => $payloadJson,
    ];

    if ($existingResultId !== null) {
        echo PHP_EOL . "Test result already exists (id={$existingResultId}). Updating." . PHP_EOL;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $updateData = json_encode([
            'action' => 'update',
            'table' => 'test_results',
            'id' => $existingResultId,
            'data' => $testResultData,
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $updateData);
        $resOut = curl_exec($ch);
        echo "Test result update: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $resOut . PHP_EOL;
        curl_close($ch);
        $seeded = true;
    } else {
        echo PHP_EOL . "Creating new test_result..." . PHP_EOL;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $createData = json_encode([
            'action' => 'create',
            'table' => 'test_results',
            'data' => $testResultData,
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $createData);
        $resOut = curl_exec($ch);
        $resData = json_decode($resOut, true);
        echo "Test result create: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $resOut . PHP_EOL;
        if (isset($resData['id']) || isset($resData['data']['id'])) {
            $seeded = true;
        }
        curl_close($ch);
    }
} else {
    /* -------------------- Direct MySQL mode -------------------- */
    echo PHP_EOL . "--- Seeding via Direct MySQL ---" . PHP_EOL;

    $conn = new mysqli($host, $user, $pass, $name, $port);
    if ($conn->connect_error) {
        fwrite(STDERR, 'FATAL: MySQL connection failed: ' . $conn->connect_error . PHP_EOL);
        exit(1);
    }

    // Check if project already exists
    $stmt = $conn->prepare("SELECT id FROM projects WHERE name = ? AND test_type = ? LIMIT 1");
    $stmt->bind_param('ss', $projectName, $testKey);
    $stmt->execute();
    $stmt->bind_result($projectId);
    if ($stmt->fetch()) {
        $stmt->close();
        echo "Project '{$projectName}' already exists (id={$projectId}). Updating." . PHP_EOL;
        $upd = $conn->prepare("UPDATE projects SET client_name = ?, project_date = ?, test_type = ? WHERE id = ?");
        $upd->bind_param('sssi', $clientName, $projectDate, $testKey, $projectId);
        $upd->execute();
        $upd->close();
    } else {
        $stmt->close();
        $ins = $conn->prepare("INSERT INTO projects (user_id, name, client_name, project_date, test_type) VALUES (1, ?, ?, ?, ?)");
        $ins->bind_param('ssss', $projectName, $clientName, $projectDate, $testKey);
        $ins->execute();
        $projectId = $conn->insert_id;
        $ins->close();
        echo "Created project '{$projectName}' (id={$projectId})" . PHP_EOL;
    }

    // Check if test_result already exists for this project+test_key
    $stmt = $conn->prepare("SELECT id FROM test_results WHERE project_id = ? AND test_key = ? LIMIT 1");
    $stmt->bind_param('is', $projectId, $testKey);
    $stmt->execute();
    $stmt->bind_result($existingResultId);
    if ($stmt->fetch()) {
        $stmt->close();
        echo "Test result exists (id={$existingResultId}). Updating." . PHP_EOL;
        $upd = $conn->prepare("UPDATE test_results SET name = ?, category = ?, status = ?, data_points = ?, key_results_json = ?, payload_json = ?, updated_at = NOW() WHERE id = ?");
        $upd->bind_param('ssisissi', 'Density/Moisture Content Relationship', 'soil', $status, $dataPoints, $keyResultsJson, $payloadJson, $existingResultId);
        $upd->execute();
        $upd->close();
        $seeded = true;
    } else {
        $stmt->close();
        $ins = $conn->prepare("INSERT INTO test_results (user_id, project_id, test_key, name, category, status, data_points, key_results_json, payload_json) VALUES (1, ?, ?, 'Density/Moisture Content Relationship', 'soil', ?, ?, ?, ?)");
        $ins->bind_param('isissss', $projectId, $testKey, $status, $dataPoints, $keyResultsJson, $payloadJson);
        $ins->execute();
        $newId = $conn->insert_id;
        $ins->close();
        echo "Created test_result (id={$newId})" . PHP_EOL;
        $seeded = true;
    }
    $conn->close();
}

echo PHP_EOL . 'PROCTOR SAMPLE SEEDED: ' . ($seeded ? 'YES' : 'NO') . PHP_EOL;

exit($seeded ? 0 : 1);
