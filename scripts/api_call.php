<?php
$url = (isset($argv[1]) ? $argv[1] : 'https://lab.wayrus.co.ke/api.php');
$params = $argv[2] ?? 'action=list&table=test_results&limit=3';
$token = $argv[3] ?? '';

$headers = ['Content-Type: application/x-www-form-urlencoded'];
if ($token !== '') {
    $headers[] = 'X-Session-Token: ' . $token;
}

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, $params);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 60);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
$out = curl_exec($ch);
$err = curl_error($ch);
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

echo "HTTP_CODE=$code\n";
if ($err) { echo "CURL_ERR=$err\n"; exit(1); }
echo $out . PHP_EOL;


