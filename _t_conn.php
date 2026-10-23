<?php
// Verify api.php's db() resolution reaches the local MariaDB on 3308.
$host = getenv('DB_HOST') ?: 'localhost';
$isLocal = in_array(strtolower((string) parse_url($host, PHP_URL_HOST) ?: $host), ['localhost','127.0.0.1','::1',''], true);
$port = (int)(getenv('DB_PORT') ?: 0);
if ($port <= 0) $port = $isLocal ? 3308 : 3306;
echo "resolved host=$host port=$port\n";
$c = new mysqli($host, 'root', '', 'wayrusc1_labdatacraft', $port);
if ($c->connect_error) { echo "FAIL: ".$c->connect_error."\n"; exit(1); }
echo "CONNECT_OK via ".$c->host_info."\n";
$r = $c->query("SELECT COUNT(*) n FROM test_results");
echo "test_results rows=".$r->fetch_assoc()['n']."\n";
