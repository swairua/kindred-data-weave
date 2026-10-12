<?php
$apiUrl = 'https://lab.wayrus.co.ke/api.php';

// Login
$ch = curl_init();
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

$payload = http_build_query([
    'action' => 'login',
    'email' => 'admin@cransfield.com',
    'password' => 'Pass123',
]);

curl_setopt($ch, CURLOPT_URL, $apiUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);

$out = curl_exec($ch);
$data = json_decode($out, true);
$token = $data['session_token'] ?? null;
curl_close($ch);

if (!$token) {
    fwrite(STDERR, "Login failed: {$out}" . PHP_EOL);
    exit(1);
}

echo "Login OK. Token: {$token}" . PHP_EOL;

// Fetch the grading test_result (id=404)
$ch = curl_init();
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_HTTPGET, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);

curl_setopt($ch, CURLOPT_URL, $apiUrl . '?' . http_build_query([
    'action' => 'read',
    'table' => 'test_results',
    'id' => 404,
]));

$out = curl_exec($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
echo PHP_EOL . "--- test_results id=404 ---" . PHP_EOL;
echo "HTTP {$code}: {$out}" . PHP_EOL;
curl_close($ch);
