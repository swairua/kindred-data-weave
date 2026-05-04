<?php
/**
 * Migration script to remove unique constraint on test_results table
 * This allows multiple test results for the same project and test_key combination
 * 
 * Run this once: php migrate_atterberg_constraint.php
 */

// Database connection
$host = 'localhost';
$user = 'wayrusc1_labdatacraft';
$pass = 'Sirgeorge.12';
$name = 'wayrusc1_labdatacraft';
$port = 3306;

$conn = new mysqli($host, $user, $pass, $name, $port);

if ($conn->connect_error) {
    die('Connection failed: ' . $conn->connect_error);
}

$conn->set_charset('utf8mb4');

echo "[" . date('d-M-Y H:i:s T') . "] Starting migration...\n";

// First, verify the constraint exists
$checkSql = "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
             WHERE TABLE_NAME = 'test_results' 
             AND COLUMN_NAME = 'project_id' 
             AND REFERENCED_TABLE_NAME IS NULL";

$result = $conn->query($checkSql);
$constraintFound = false;
$constraintName = null;

while ($row = $result->fetch_assoc()) {
    if ($row['CONSTRAINT_NAME'] === 'uq_test_results_project_test_key') {
        $constraintFound = true;
        $constraintName = $row['CONSTRAINT_NAME'];
        break;
    }
}

if ($constraintFound) {
    echo "[" . date('d-M-Y H:i:s T') . "] Found constraint: {$constraintName}\n";
    
    // Drop the unique constraint
    $dropSql = "ALTER TABLE `test_results` DROP INDEX `{$constraintName}`";
    
    if ($conn->query($dropSql)) {
        echo "[" . date('d-M-Y H:i:s T') . "] Successfully removed unique constraint on test_results table\n";
        echo "[" . date('d-M-Y H:i:s T') . "] Migration completed successfully\n";
    } else {
        echo "[" . date('d-M-Y H:i:s T') . "] Error dropping constraint: " . $conn->error . "\n";
        exit(1);
    }
} else {
    echo "[" . date('d-M-Y H:i:s T') . "] Constraint not found. It may have already been removed.\n";
    
    // Let's check what constraints exist on test_results
    $listSql = "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE TABLE_NAME = 'test_results' AND REFERENCED_TABLE_NAME IS NULL";
    
    $listResult = $conn->query($listSql);
    echo "[" . date('d-M-Y H:i:s T') . "] Existing constraints on test_results:\n";
    
    while ($row = $listResult->fetch_assoc()) {
        echo "  - " . $row['CONSTRAINT_NAME'] . "\n";
    }
}

$conn->close();
echo "[" . date('d-M-Y H:i:s T') . "] Database connection closed\n";
?>
