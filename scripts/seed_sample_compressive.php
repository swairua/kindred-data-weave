<?php
declare(strict_types=1);

/**
 * scripts/seed_sample_compressive.php
 *
 * Inserts an idempotent "Compressive Strength of Concrete Cubes" sample project
 * + test + cubes into the remote lab database so the compressive export flow
 * can be exercised end-to-end (PDF) against real DB persistence.
 *
 * Environment:
 *   API_URL     default 'https://lab.wayrus.co.ke/api.php'
 *   API_EMAIL   admin@cransfield.com
 *   API_PASS    Pass123
 *
 * Usage:
 *   php scripts/seed_sample_compressive.php --api
 */

$apiUrl   = getenv('API_URL') ?: 'https://lab.wayrus.co.ke/api.php';
$apiEmail = getenv('API_EMAIL') ?: 'admin@cransfield.com';
$apiPass  = getenv('API_PASS') ?: 'Pass123';
$useApi   = in_array('--api', $argv ?? [], true);

if (!$useApi) {
    fwrite(STDERR, "This script only supports --api mode (remote DB port 3306 is firewalled).\n");
    exit(1);
}

echo '=== seed_sample_compressive.php ===' . PHP_EOL;
echo "Mode: HTTPS API" . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed data                                                             */
/* ---------------------------------------------------------------------- */
$projectName     = 'KIRIAINI AHP';
$clientName      = 'AHP';
$projectDate     = '2026-06-11';
$labOrganization = 'Cransfield Materials Testing Center';

// Compressive test metadata (matches TestDetails in CompressiveStrengthTest.tsx)
$testData = [
    'date_tested'       => '2026-06-11',
    'cement'            => 'Bamburi CEM II/A-L 42.5N',
    'fine_aggregate'    => 'River sand (Kasarani)',
    'coarse_aggregate'  => 'Crushed stone 20mm (Juja)',
    'contractor'        => 'Kiriani Construction Ltd',
    'county'            => 'Murang\'a',
    'concrete_class'    => '25/20',
    'section'           => 'Ground floor columns',
    'made_by'           => 'Site Lab Tech',
    'slump'             => '75',
    'client_ref'        => 'KIR-COL-GF-001',
    'lab_ref'           => 'CRN-2026-0142',
    'status'            => 'submitted',
];

// 9 concrete cubes: 3x 7-day, 3x 28-day, 3x spare
// Cube dimensions: 150x150x150 mm
// Target class 25/20: fck = 25 MPa, fck,cube = 30 MPa (approx)
// Expected 7-day ~ 17 MPa, 28-day ~ 25+ MPa
$cubes = [
    // 7-day cubes (cast 2026-06-04, tested 2026-06-11)
    ['mark' => 'A1', 'dateOfCast' => '2026-06-04', 'dateOfTest' => '2026-06-11', 'load' => 410.5, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8150, 'remarks' => ''],
    ['mark' => 'A2', 'dateOfCast' => '2026-06-04', 'dateOfTest' => '2026-06-11', 'load' => 398.2, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8120, 'remarks' => ''],
    ['mark' => 'A3', 'dateOfCast' => '2026-06-04', 'dateOfTest' => '2026-06-11', 'load' => 425.0, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8180, 'remarks' => ''],
    // 28-day cubes (cast 2026-05-14, tested 2026-06-11)
    ['mark' => 'B1', 'dateOfCast' => '2026-05-14', 'dateOfTest' => '2026-06-11', 'load' => 635.0, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8210, 'remarks' => ''],
    ['mark' => 'B2', 'dateOfCast' => '2026-05-14', 'dateOfTest' => '2026-06-11', 'load' => 642.5, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8240, 'remarks' => ''],
    ['mark' => 'B3', 'dateOfCast' => '2026-05-14', 'dateOfTest' => '2026-06-11', 'load' => 628.8, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8195, 'remarks' => ''],
    // Spare / additional cubes (awaiting test)
    ['mark' => 'C1', 'dateOfCast' => '2026-05-14', 'dateOfTest' => '2026-06-18', 'load' => 0, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8200, 'remarks' => 'Awaiting 28-day test'],
    ['mark' => 'C2', 'dateOfCast' => '2026-05-14', 'dateOfTest' => '2026-06-18', 'load' => 0, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8190, 'remarks' => 'Awaiting 28-day test'],
    ['mark' => 'C3', 'dateOfCast' => '2026-06-04', 'dateOfTest' => '2026-06-25', 'load' => 0, 'width' => 150, 'height' => 150, 'depth' => 150, 'mass' => 8160, 'remarks' => 'Awaiting 28-day test'],
];

/* ---------------------------------------------------------------------- */
/* Helpers (matching PSD seed script pattern)                             */
/* ---------------------------------------------------------------------- */
function apiLogin(string $apiUrl, string $email, string $pass): string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['action' => 'login', 'email' => $email, 'password' => $pass]));
    $out = curl_exec($ch);
    $data = json_decode($out, true);
    $token = $data['session_token'] ?? null;
    curl_close($ch);
    if (!$token) { fwrite(STDERR, "FATAL: API login failed: $out\n"); exit(1); }
    echo "API login OK (token: $token)\n";
    return $token;
}

function apiGet(string $apiUrl, string $token, array $params): array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);
    curl_setopt($ch, CURLOPT_URL, $apiUrl . '?' . http_build_query($params));
    $out = curl_exec($ch);
    curl_close($ch);
    return json_decode($out, true);
}

function apiPostJson(string $apiUrl, string $token, string $action, string $table, array $data, ?int $id = null): array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Session-Token: ' . $token,
    ]);
    $body = ['action' => $action, 'table' => $table, 'data' => $data];
    if ($id !== null) $body['id'] = $id;
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = json_decode($out, true);
    return ['code' => $code, 'data' => $decoded, 'raw' => $out];
}

/* ---------------------------------------------------------------------- */
/* Run                                                                    */
/* ---------------------------------------------------------------------- */

$token = apiLogin($apiUrl, $apiEmail, $apiPass);

// 1. Find or create project with test_type = 'compressive'
$projList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'projects', 'limit' => 1000]);
$projectId = null;
foreach ($projList['data'] ?? [] as $p) {
    if ($p['name'] === $projectName && ($p['test_type'] ?? '') === 'compressive') {
        $projectId = (int) $p['id'];
        break;
    }
}

if ($projectId !== null) {
    echo "Project '$projectName' (compressive) already exists (id=$projectId). Updating.\n";
    $res = apiPostJson($apiUrl, $token, 'update', 'projects', [
        'name' => $projectName,
        'client_name' => $clientName,
        'project_date' => $projectDate,
        'test_type' => 'compressive',
    ], $projectId);
    echo "Project update: " . $res['raw'] . "\n";
} else {
    $res = apiPostJson($apiUrl, $token, 'create', 'projects', [
        'name' => $projectName,
        'client_name' => $clientName,
        'project_date' => $projectDate,
        'test_type' => 'compressive',
    ]);
    echo "Project create: " . $res['raw'] . "\n";
    $projectId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
    if (!$projectId) { fwrite(STDERR, "FATAL: Could not create/find project\n"); exit(1); }
    echo "Created project '$projectName' (id=$projectId)\n";
}

// 2. Find or create compressive_tests record
$testList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'compressive_tests', 'limit' => 1000]);
$testId = null;
foreach ($testList['data'] ?? [] as $t) {
    if ((int) $t['project_id'] === $projectId && ($t['test_key'] ?? '') === 'compressive') {
        $testId = (int) $t['id'];
        break;
    }
}

$testPayload = array_merge(['project_id' => $projectId, 'test_key' => 'compressive'], $testData);

if ($testId !== null) {
    echo "Compressive test already exists (id=$testId). Updating.\n";
    $res = apiPostJson($apiUrl, $token, 'update', 'compressive_tests', $testPayload, $testId);
    echo "Test update: " . $res['raw'] . "\n";
} else {
    $res = apiPostJson($apiUrl, $token, 'create', 'compressive_tests', $testPayload);
    echo "Test create: " . $res['raw'] . "\n";
    $testId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
    if (!$testId) { fwrite(STDERR, "FATAL: Could not create/find compressive test\n"); exit(1); }
    echo "Created compressive test (id=$testId)\n";
}

// 3. Create cubes (matching CompressiveCubeApiRow fields)
$createdCount = 0;
foreach ($cubes as $cube) {
    $load   = $cube['load'];
    $width  = $cube['width'];
    $height = $cube['height'];
    $depth  = $cube['depth'];
    $mass   = $cube['mass'];

    $strength = ($width > 0 && $depth > 0 && $load > 0)
        ? round(($load * 1000) / ($width * $depth), 1) // MPa = load(kN)*1000 / area(mm²)
        : null;

    $volume = ($width > 0 && $height > 0 && $depth > 0)
        ? ($width * $height * $depth) / 1e9 // m³
        : null;
    $density = ($mass > 0 && $volume > 0)
        ? round($mass / 1000 / $volume) // kg/m³
        : null;

    $fields = [
        'test_id'                => $testId,
        'cube_mark'              => $cube['mark'] ?: null,
        'date_of_cast'           => $cube['dateOfCast'] ?: null,
        'date_of_test'           => $cube['dateOfTest'] ?: null,
        'load_kn'                => $load > 0 ? $load : null,
        'width_mm'               => $width,
        'height_mm'              => $height,
        'depth_mm'               => $depth,
        'mass_g'                 => $mass > 0 ? $mass : null,
        'calculated_strength_mpa'=> $strength,
        'density_kg_m3'          => $density,
        'remarks'                => $cube['remarks'] ?: null,
    ];

    $res = apiPostJson($apiUrl, $token, 'create', 'compressive_cubes', $fields);
    if ($res['code'] >= 200 && $res['code'] < 300 && isset($res['data']['data']['id'])) {
        $createdCount++;
        echo "  Created cube {$cube['mark']} (id={$res['data']['data']['id']}) strength=" . ($strength ?? 'pending') . " MPa\n";
    } else {
        echo "  FAILED cube {$cube['mark']}: " . $res['raw'] . "\n";
    }
}

// 4. Create or update a test_results record so the project appears in the Projects list
//    (the Projects page filters by test_results count for each project)
$trList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'test_results', 'limit' => 1000]);
$existingResultId = null;
foreach ($trList['data'] ?? [] as $r) {
    if ((int) $r['project_id'] === $projectId && ($r['test_key'] ?? '') === 'compressive') {
        $existingResultId = $r['id'];
        break;
    }
}

$testResultData = [
    'project_id'    => $projectId,
    'test_key'      => 'compressive',
    'name'          => 'Compressive Strength Test',
    'category'      => 'concrete',
    'status'        => 'submitted',
    'data_points'   => count($cubes),
    'payload_json'  => json_encode(['test_id' => $testId]),
];

if ($existingResultId !== null) {
    $res = apiPostJson($apiUrl, $token, 'update', 'test_results', $testResultData, (int) $existingResultId);
    echo "Updated test_results record (id={$existingResultId})\n";
} else {
    $res = apiPostJson($apiUrl, $token, 'create', 'test_results', $testResultData);
    $resultId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
    echo "Created test_results record (id={$resultId})\n";
}

echo PHP_EOL . "COMPRESSIVE SAMPLE SEEDED: YES" . PHP_EOL;
echo "Project: $projectName (id=$projectId)" . PHP_EOL;
echo "Compressive test: id=$testId" . PHP_EOL;
echo "Cubes created: $createdCount" . PHP_EOL;