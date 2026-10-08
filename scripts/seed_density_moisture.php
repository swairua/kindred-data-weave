<?php

/**
 * seed_density_moisture.php
 *
 * Seeds a SAMPLE density/moisture content relationship (Proctor / compaction
 * curve) test result into the remote database via the kindred API.
 *
 * Usage:
 *   php scripts/seed_density_moisture.php [api_url] [email] [password] [project_name]
 *
 * Defaults (also overridable via env vars API_URL / SEED_EMAIL / SEED_PASSWORD
 * / SEED_PROJECT):
 *   api_url        = https://lab.wayrus.co.ke/api.php
 *   email          = admin@cransfield.com
 *   password       = Pass123
 *   project_name   = SEED Density/Moisture Demo
 *
 * test_results columns used: user_id, project_id, test_key, name, category,
 * status, data_points, key_results_json, payload_json
 *   - test_key   = "proctor"
 *   - name       = "Density/Moisture Content Relationship"
 *   - category   = "soil"
 *   - data_points = number of valid plotted (moisture, dry density) points
 *   - key_results_json = array of {label, value} memo fields
 *   - payload_json = {version:"2.0", project:{...}, calculations:{standard,modified}}
 */

$apiUrl = getenv('API_URL') ?: (isset($argv[1]) ? $argv[1] : 'https://lab.wayrus.co.ke/api.php');
$email  = getenv('SEED_EMAIL') ?: (isset($argv[2]) ? $argv[2] : 'admin@cransfield.com');
$password = getenv('SEED_PASSWORD') ?: (isset($argv[3]) ? $argv[3] : 'Pass123');
$projectName = getenv('SEED_PROJECT') ?: (isset($argv[4]) ? $argv[4] : 'SEED Density/Moisture Demo');

function apiPost(string $url, string $body, string $token): string
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Session-Token: ' . $token,
    ]);
    $out = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err) {
        throw new RuntimeException('curl error: ' . $err . ' (HTTP ' . $code . ')');
    }
    return $out;
}

function apiPut(string $url, string $body, string $token): string
{
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Session-Token: ' . $token,
    ]);
    $out = curl_exec($ch);
    $err = curl_error($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($err) {
        throw new RuntimeException('curl error: ' . $err . ' (HTTP ' . $code . ')');
    }
    return $out;
}

function apiJsonPost(string $url, array $payload, string $token): array
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
    $out = apiPost($url, $body, $token);
    $decoded = json_decode($out, true);
    return is_array($decoded) ? $decoded : ['raw' => $out];
}

echo 'Logging in to ' . $apiUrl . PHP_EOL;

$login = apiJsonPost($apiUrl, ['action' => 'login', 'email' => $email, 'password' => $password], '');
$token = $login['session_token'] ?? ($login['data']['session_token'] ?? null);

if (!$token) {
    fwrite(STDERR, 'Login failed: ' . json_encode($login) . PHP_EOL);
    exit(1);
}
echo 'Logged in as ' . ($login['user']['name'] ?? 'unknown') . ' (user_id=' . ($login['user_id'] ?? '?') . ')' . PHP_EOL;


// ---------------------------------------------------------------------------
// 2. Ensure a project for 'proctor' exists
// ---------------------------------------------------------------------------

$projects = json_decode(apiPost($apiUrl, http_build_query(['action' => 'list', 'table' => 'projects', 'limit' => 1000]), $token), true);
$projectId = null;
foreach (($projects['data'] ?? []) as $p) {
    if (($p['test_type'] ?? '') === 'proctor') {
        $projectId = (int) $p['id'];
        break;
    }
}

if ($projectId === null) {
    echo 'Creating project: ' . $projectName . PHP_EOL;
    $created = json_decode(apiPost($apiUrl, http_build_query([
        'action' => 'create',
        'table' => 'projects',
        'data' => [
            'name' => $projectName,

// ---------------------------------------------------------------------------
// 3. Sample compaction data
// ---------------------------------------------------------------------------

// Realistic measured points (moisture %, dry density kg/m3). Two 6-point sets:
// standard (2.5 kg rammer, BS 1377-4:1990 3.3) and modified (4.5 kg rammer, 3.5).
$points = [
    'standard' => [
        ['w' => 9.0,  'dd' => 2050],
        ['w' => 11.0, 'dd' => 2210],
        ['w' => 13.0, 'dd' => 2350],
        ['w' => 15.0, 'dd' => 2450],
        ['w' => 17.0, 'dd' => 2470],
        ['w' => 18.5, 'dd' => 2390],
    ],
    'modified' => [
        ['w' => 10.0, 'dd' => 2180],
        ['w' => 12.5, 'dd' => 2320],
        ['w' => 15.0, 'dd' => 2460],
        ['w' => 17.0, 'dd' => 2500],
        ['w' => 18.5, 'dd' => 2490],
        ['w' => 20.0, 'dd' => 2400],
    ],
];

$valid = ['standard' => [], 'modified' => []];
foreach ($points as $method => $rows) {
    foreach ($rows as $row) {
        if (isset($row['w'], $row['dd']) && is_finite($row['w']) && is_finite($row['dd'])) {
            $valid[$method][] = ['w' => (float) $row['w'], 'dd' => (float) $row['dd']];
        }
    }
}

// Fit dry density = a.w^2 + b.w + c by least squares.
function fitCompactionCurve(array $pts): array
{
    $n = count($pts);
    $sumW = array_sum(array_column($pts, 'w'));
    $sumDd = array_sum(array_column($pts, 'dd'));
    $sumW2 = array_sum(array_map(fn($p) => $p['w'] ** 2, $pts));
    $sumW3 = array_sum(array_map(fn($p) => $p['w'] ** 3, $pts));
    $sumW4 = array_sum(array_map(fn($p) => $p['w'] ** 4, $pts));
    $sumWd = array_sum(array_map(fn($p) => $p['w'] * $p['dd'], $pts));
    $sumW2d = array_sum(array_map(fn($p) => $p['w'] ** 2 * $p['dd'], $pts));

    // Solve:
    //   n*c   + b*sumW   + a*sumW2 = sumDd
    //   c*sumW + b*sumW2 + a*sumW3 = sumWd
    //   c*sumW2 + b*sumW3 + a*sumW4 = sumW2d
    $A = [[$n, $sumW, $sumW2], [$sumW, $sumW2, $sumW3], [$sumW2, $sumW3, $sumW4]];
    $b = [$sumDd, $sumWd, $sumW2d];

    $det = det3($A);
    if ($det === 0.0) {
        return ['a' => null, 'b' => null, 'c' => null, 'omc' => null, 'mdd' => null, 'rSquared' => null, 'pointCount' => $n];
    }
    $Aa = matrixReplace($A, 0, $b);
    $Ab = matrixReplace($A, 1, $b);
    $Ac = matrixReplace($A, 2, $b);
    $a = det3($Aa) / $det;
    $b = det3($Ab) / $det;
    $c = det3($Ac) / $det;

    $omc = ($a !== 0 && is_finite($a)) ? -$b / (2 * $a) : null;

// ---------------------------------------------------------------------------
// 4. Build the Proctor record + payload
// ---------------------------------------------------------------------------

$record = [
    'label' => 'BH01',
    'sampleNumber' => '101',
    'sampleDepthFrom' => '0.00',
    'sampleDepthTo' => '1.50',
    'sampledSubmittedBy' => 'A. Mwangi',
    'dateSubmitted' => '2026-10-07',
    'dateTested' => '2026-10-08',
    'sampleNotes' => 'Sample taken at FT. Standard and modified compaction tests.',
    'type' => 'standard',
    'standardMouldVolume' => '1000',
    'modifiedMouldVolume' => '1000',
    'standardRows' => array_values(array_map(fn($p) => [
        'moistureAdded' => '', 'mouldWetMass' => '', 'mouldTare' => '',
        'containerNumber' => '', 'containerWetMass' => '', 'containerDryMass' => '',
        'containerTare' => '',
    ], $valid['standard'])),
    'modifiedRows' => array_values(array_map(fn($p) => [
        'moistureAdded' => '', 'mouldWetMass' => '', 'mouldTare' => '',
        'containerNumber' => '', 'containerWetMass' => '', 'containerDryMass' => '',
        'containerTare' => '',
    ], $valid['modified'])),
    'specificGravity' => '2.65',
    'airVoidsTarget' => '5',
];

$project = [
    'title' => $projectName,
    'clientName' => 'Seed Client',
    'date' => date('Y-m-d'),
    'records' => [$record],
];

$payload = [
    'version' => '2.0',
    'project' => $project,
    'calculations' => $summaries,
];

$payloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);

// key_results_json mirrors the on-screen memo fields (label + value).
$keyResults = array_values(array_filter([
    'Sample' => $record['label'] . ' (' . $record['sampleNumber'] . ')',
    'Depth' => $record['sampleDepthFrom'] . '-' . $record['sampleDepthTo'] . ' m',

// ---------------------------------------------------------------------------
// 5. Create the test_result
// ---------------------------------------------------------------------------

$dataPoints = array_sum(array_column($summaries, 'pointCount'));

$createBody = [
    'action' => 'create',
    'table' => 'test_results',
    'data' => [
        'user_id' => 1,
        'project_id' => $projectId,
        'test_key' => 'proctor',
        'name' => 'Density/Moisture Content Relationship',
        'category' => 'soil',
        'status' => 'completed',
        'data_points' => $dataPoints,
        'key_results_json' => $keyResults,
        'payload_json' => $payloadJson,
    ],
];

echo 'Creating test_result (proctor)...' . PHP_EOL;
$result = apiJsonPost($apiUrl, $createBody, $token);

if (isset($result['id']) || isset($result['data']['id'])) {
    $id = $result['id'] ?? $result['data']['id'];
    echo 'SEEDED OK: test_result id=' . $id . PHP_EOL;
    echo '  OMC standard = ' . $summaries['standard']['omc'] . '%' . PHP_EOL;
    echo '  MDD standard = ' . $summaries['standard']['mdd'] . ' kg/m3' . PHP_EOL;
    echo '  OMC modified = ' . $summaries['modified']['omc'] . '%' . PHP_EOL;
    echo '  MDD modified = ' . $summaries['modified']['mdd'] . ' kg/m3' . PHP_EOL;
    exit(0);
}

fwrite(STDERR, 'Create failed: ' . json_encode($result) . PHP_EOL);
exit(1);

    'Standard OMC' => $summaries['standard']['omc'] !== null ? round($summaries['standard']['omc'], 2) . '%' : 'N/A',
    'Standard MDD' => $summaries['standard']['mdd'] !== null ? round($summaries['standard']['mdd'], 2) . ' kg/m3' : 'N/A',
    'Modified OMC' => $summaries['modified']['omc'] !== null ? round($summaries['modified']['omc'], 2) . '%' : 'N/A',
    'Modified MDD' => $summaries['modified']['mdd'] !== null ? round($summaries['modified']['mdd'], 2) . ' kg/m3' : 'N/A',
    'Curve r2' => $summaries['standard']['rSquared'] !== null ? round($summaries['standard']['rSquared'], 4) : 'N/A',
], fn($v) => $v !== 'N/A'));

    $mdd = null;
    if (is_finite($omc)) {
        $mdd = $a * $omc ** 2 + $b * $omc + $c;
    }
    $rSquared = rSquared($pts, $a, $b, $c);

    return ['a' => $a, 'b' => $b, 'c' => $c, 'omc' => $omc, 'mdd' => $mdd, 'rSquared' => $rSquared, 'pointCount' => $n];
}

            'client_name' => 'Seed Client',
            'project_date' => date('Y-m-d'),
            'test_type' => 'proctor',
        ],
    ]), $token), true);
    $projectId = $created['id'] ?? ($created['data']['id'] ?? null);
    if ($projectId === null) {
        fwrite(STDERR, 'Failed to create project: ' . json_encode($created) . PHP_EOL);
        exit(1);
    }
}
echo 'Using / creating project id=' . $projectId . PHP_EOL;
