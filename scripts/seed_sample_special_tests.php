<?php
declare(strict_types=1);

/**
 * scripts/seed_sample_special_tests.php
 *
 * Seeds sample projects + test_results entries for SPT, CPT, slump,
 * NDT, Schmidt, UCS, and Point Load tests against the remote lab API.
 *
 * Environment:
 *   API_URL     default 'https://lab.wayrus.co.ke/api.php'
 *   API_EMAIL   admin@cransfield.com
 *   API_PASS    Pass123
 *
 * Usage:
 *   php scripts/seed_sample_special_tests.php --api
 */

$apiUrl   = getenv('API_URL') ?: 'https://lab.wayrus.co.ke/api.php';
$apiEmail = getenv('API_EMAIL') ?: 'admin@cransfield.com';
$apiPass  = getenv('API_PASS') ?: 'Pass123';
$useApi   = in_array('--api', $argv ?? [], true);

if (!$useApi) {
    fwrite(STDERR, "This script only supports --api mode (remote DB port 3306 is firewalled).\n");
    exit(1);
}

echo '=== seed_sample_special_tests.php ===' . PHP_EOL;
echo "Mode: HTTPS API ($apiUrl)" . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Helpers (matching seed_sample_compressive.php pattern)                 */
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

function findOrCreateProject(string $apiUrl, string $token, string $projectName, string $clientName, string $projectDate, string $testType): int {
    $projList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'projects', 'limit' => 1000]);
    $projectId = null;
    foreach ($projList['data'] ?? [] as $p) {
        if ($p['name'] === $projectName && ($p['test_type'] ?? '') === $testType) {
            $projectId = (int) $p['id'];
            break;
        }
    }

    $projectData = [
        'name' => $projectName,
        'client_name' => $clientName,
        'project_date' => $projectDate,
        'test_type' => $testType,
    ];

    if ($projectId !== null) {
        echo "  Project '$projectName' ($testType) already exists (id=$projectId). Updating.\n";
        apiPostJson($apiUrl, $token, 'update', 'projects', $projectData, $projectId);
    } else {
        $res = apiPostJson($apiUrl, $token, 'create', 'projects', $projectData);
        echo "  Project create: " . substr($res['raw'], 0, 200) . "\n";
        $projectId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
        if (!$projectId) { fwrite(STDERR, "  FATAL: Could not create/find project '$projectName'\n"); exit(1); }
        echo "  Created project '$projectName' ($testType) id=$projectId\n";
    }
    return $projectId;
}

function findOrCreateTestResult(string $apiUrl, string $token, int $projectId, string $testKey, string $name, string $category, array $payload): int {
    $trList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'test_results', 'limit' => 5000]);
    $existingResultId = null;
    foreach ($trList['data'] ?? [] as $r) {
        if ((int) $r['project_id'] === $projectId && ($r['test_key'] ?? '') === $testKey) {
            $existingResultId = $r['id'];
            break;
        }
    }

    $dataPoints = $payload['data_points'] ?? (is_array($payload['payload_json'] ?? null) ? count($payload['payload_json']) : 0);
    $testResultData = array_merge($payload, [
        'project_id' => $projectId,
        'test_key' => $testKey,
        'name' => $name,
        'category' => $category,
    ]);

    if ($existingResultId !== null) {
        $res = apiPostJson($apiUrl, $token, 'update', 'test_results', $testResultData, (int) $existingResultId);
        echo "  Updated test_results ($testKey) id={$existingResultId}\n";
        return (int) $existingResultId;
    } else {
        $res = apiPostJson($apiUrl, $token, 'create', 'test_results', $testResultData);
        $resultId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
        echo "  Created test_results ($testKey) id={$resultId}\n";
        return $resultId;
    }
}

/* ---------------------------------------------------------------------- */
/* Seed data for each test type                                            */
/* ---------------------------------------------------------------------- */
$projectDate = '2026-10-15';
$labOrg = 'Cransfield Materials Testing Center';

$tests = [
    // SPT (Standard Penetration Test) — soil, special
    [
        'test_type' => 'spt',
        'category'  => 'soil',
        'project_name' => 'KITENG SPT-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 3,
            'payload_json' => ['rows' => [
                ['depth' => '1.5', 'blowCount' => '8'],
                ['depth' => '3.0', 'blowCount' => '14'],
                ['depth' => '4.5', 'blowCount' => '22'],
            ]],
        ],
    ],
    // CPT (Cone Penetration Test) — soil
    [
        'test_type' => 'cpt',
        'category'  => 'soil',
        'project_name' => 'KITENG CPT-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 3,
            'payload_json' => ['rows' => [
                ['depth' => '1.0', 'coneResistance' => '2.5', 'frictionRatio' => '25'],
                ['depth' => '2.0', 'coneResistance' => '4.8', 'frictionRatio' => '40'],
                ['depth' => '3.0', 'coneResistance' => '7.2', 'frictionRatio' => '55'],
            ]],
        ],
    ],
    // Slump Test — concrete
    [
        'test_type' => 'slump',
        'category'  => 'concrete',
        'project_name' => 'KITENG SLUMP-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 1,
            'payload_json' => ['slump' => '75', 'remarks' => 'True slump'],
        ],
    ],
    // NDT (Rebound Hammer) — concrete
    [
        'test_type' => 'ndt',
        'category'  => 'concrete',
        'project_name' => 'KITENG NDT-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 2,
            'payload_json' => ['rows' => [
                ['location' => 'L1', 'r1' => '42', 'r2' => '44', 'r3' => '40', 'r4' => '43', 'r5' => '45'],
                ['location' => 'L2', 'r1' => '41', 'r2' => '43', 'r3' => '42', 'r4' => '44', 'r5' => '40'],
            ]],
        ],
    ],
    // Schmidt Hammer — rock
    [
        'test_type' => 'schmidt_rock',
        'category'  => 'rock',
        'project_name' => 'KITENG SCHMIDT-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 2,
            'payload_json' => ['rows' => [
                ['location' => 'L1', 'r1' => '42', 'r2' => '44', 'r3' => '40', 'r4' => '43', 'r5' => '45'],
                ['location' => 'L2', 'r1' => '41', 'r2' => '43', 'r3' => '42', 'r4' => '44', 'r5' => '40'],
            ]],
        ],
    ],
    // UCS (Unconfined Compressive Strength) — rock
    [
        'test_type' => 'ucs',
        'category'  => 'rock',
        'project_name' => 'KITENG UCS-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 3,
            'payload_json' => ['rows' => [
                ['sampleId' => 'R1', 'load' => '103', 'area' => '2290'],
                ['sampleId' => 'R2', 'load' => '118', 'area' => '2290'],
                ['sampleId' => 'R3', 'load' => '96', 'area' => '2290'],
            ]],
        ],
    ],
    // Point Load Test — rock
    [
        'test_type' => 'pointload',
        'category'  => 'rock',
        'project_name' => 'KITENG POINTLOAD-01',
        'payload' => [
            'status'  => 'completed',
            'data_points' => 3,
            'payload_json' => ['rows' => [
                ['sampleId' => 'P1', 'failureLoad' => '1.2', 'de' => '50'],
                ['sampleId' => 'P2', 'failureLoad' => '2.5', 'de' => '54'],
                ['sampleId' => 'P3', 'failureLoad' => '1.8', 'de' => '52'],
            ]],
        ],
    ],
];

/* ---------------------------------------------------------------------- */
/* Run                                                                    */
/* ---------------------------------------------------------------------- */

$token = apiLogin($apiUrl, $apiEmail, $apiPass);

$created = [];
foreach ($tests as $t) {
    echo "\n--- Seeding {$t['test_type']} test ---\n";
    $projectId = findOrCreateProject($apiUrl, $token, $t['project_name'], 'AHP', $projectDate, $t['test_type']);

    $nameMap = [
        'spt' => 'SPT (Standard Penetration Test)',
        'cpt' => 'CPT (Cone Penetration Test)',
        'slump' => 'Slump Test',
        'ndt' => 'NDT (Rebound Hammer)',
        'schmidt_rock' => 'Schmidt Hammer',
        'ucs' => 'UCS (Unconfined Compressive Strength)',
        'pointload' => 'Point Load Test',
    ];
    $name = $nameMap[$t['test_type']] ?? $t['test_type'];

    $resultId = findOrCreateTestResult(
        $apiUrl, $token, $projectId, $t['test_type'], $name, $t['category'], $t['payload']
    );
    echo "  test_results id=$resultId\n";
    $created[$t['test_type']] = ['project_id' => $projectId, 'result_id' => $resultId];
}

echo PHP_EOL . "=== SEED COMPLETE ===" . PHP_EOL;
foreach ($created as $testKey => $ids) {
    echo "$testKey: project_id={$ids['project_id']}, test_results_id={$ids['result_id']}" . PHP_EOL;
}
