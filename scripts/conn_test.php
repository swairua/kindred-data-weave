<?php
$host = getenv('DB_HOST') ?: 'lab.wayrus.co.ke';
$user = getenv('DB_USER') ?: 'wayrusc1_labdatacraft';
$pass = getenv('DB_PASS') ?: 'Sirgeorge.12';
$name = getenv('DB_NAME') ?: 'wayrusc1_labdatacraft';
$port = (int) (getenv('DB_PORT') ?: 3306);

echo "DB_HOST=$host DB_USER=$user DB_NAME=$name DB_PORT=$port\n";

$conn = @new mysqli($host, $user, $pass, $name, $port);
if ($conn->connect_errno) {
    echo 'CONN_FAIL: ' . $conn->connect_error . PHP_EOL;
    exit(1);
}
echo 'CONN_OK: ' . $conn->host_info . PHP_EOL;

$stmt = $conn->prepare('SELECT COUNT(*) AS n FROM test_definitions WHERE test_key = ?');
$stmt->bind_param('s', $key);
$key = 'grading';
$stmt->execute();
$result = $stmt->get_result();
$row = $result->fetch_assoc();
echo 'grading test_definitions rows: ' . $row['n'] . PHP_EOL;

$stmt->close();
$conn->close();
