<?php
/**
 * Migration script to fix corrupted test_results project_id associations
 * 
 * Problem: Due to a code bug in AtterbergTest.tsx, some test results were saved
 * with incorrect project_id associations. Specifically, test results with name
 * "Thika Road Mall" were saved to the "Atterberg Limits Testing" project.
 * 
 * Solution: 
 * 1. Create missing "Thika Road Mall" project
 * 2. Reassign test_results rows that belong to "Thika Road Mall" to the correct project
 * 3. Validate the fixes
 * 
 * Run this once: php migrate_fix_project_associations.php
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

echo "[" . date('d-M-Y H:i:s T') . "] Starting project association migration...\n";

// Step 1: Check if "Thika Road Mall" project exists
$checkProjectSql = "SELECT id FROM projects WHERE name = 'Thika Road Mall' LIMIT 1";
$projectResult = $conn->query($checkProjectSql);

if (!$projectResult) {
    die("[" . date('d-M-Y H:i:s T') . "] Error querying projects table: " . $conn->error . "\n");
}

$thikaProjectId = null;
if ($projectResult->num_rows > 0) {
    $row = $projectResult->fetch_assoc();
    $thikaProjectId = $row['id'];
    echo "[" . date('d-M-Y H:i:s T') . "] Found existing 'Thika Road Mall' project with id: {$thikaProjectId}\n";
} else {
    // Step 2: Create "Thika Road Mall" project if it doesn't exist
    echo "[" . date('d-M-Y H:i:s T') . "] 'Thika Road Mall' project not found, creating it...\n";
    
    // Extract project details from an existing test result with name "Thika Road Mall"
    $extractSql = "SELECT payload_json FROM test_results 
                   WHERE name = 'Thika Road Mall' 
                   ORDER BY created_at DESC 
                   LIMIT 1";
    
    $extractResult = $conn->query($extractSql);
    
    $clientName = 'Mr Musyoka';
    $projectDate = date('Y-m-d');
    
    if ($extractResult && $extractResult->num_rows > 0) {
        $row = $extractResult->fetch_assoc();
        $payload = json_decode($row['payload_json'], true);
        
        if ($payload && isset($payload['project'])) {
            $projectData = $payload['project'];
            $clientName = $projectData['clientName'] ?? 'Mr Musyoka';
            $projectDate = $projectData['date'] ?? date('Y-m-d');
        }
    }
    
    // Insert the new project
    $user_id = 1; // Default to admin user
    $insertSql = "INSERT INTO projects (user_id, name, client_name, project_date, created_at, updated_at) 
                  VALUES (?, ?, ?, ?, NOW(), NOW())";
    
    $stmt = $conn->prepare($insertSql);
    if (!$stmt) {
        die("[" . date('d-M-Y H:i:s T') . "] Prepare failed: " . $conn->error . "\n");
    }
    
    $stmt->bind_param('isss', $user_id, $projectName, $clientName, $projectDate);
    $projectName = 'Thika Road Mall';
    
    if ($stmt->execute()) {
        $thikaProjectId = $conn->insert_id;
        echo "[" . date('d-M-Y H:i:s T') . "] Successfully created 'Thika Road Mall' project with id: {$thikaProjectId}\n";
        echo "[" . date('d-M-Y H:i:s T') . "   - Client: {$clientName}\n";
        echo "[" . date('d-M-Y H:i:s T') . "   - Date: {$projectDate}\n";
    } else {
        die("[" . date('d-M-Y H:i:s T') . "] Error creating project: " . $stmt->error . "\n");
    }
    
    $stmt->close();
}

// Step 3: Find all test results with name "Thika Road Mall" that have wrong project_id
$findWrongSql = "SELECT id, project_id, name FROM test_results 
                 WHERE name = 'Thika Road Mall' 
                 AND project_id != ?
                 ORDER BY id";

$findStmt = $conn->prepare($findWrongSql);
if (!$findStmt) {
    die("[" . date('d-M-Y H:i:s T') . "] Prepare failed: " . $conn->error . "\n");
}

$findStmt->bind_param('i', $thikaProjectId);
$findStmt->execute();
$wrongResults = $findStmt->get_result();

$wrongIds = [];
echo "[" . date('d-M-Y H:i:s T') . "] Checking for misassociated test results...\n";

while ($row = $wrongResults->fetch_assoc()) {
    $wrongIds[] = $row['id'];
    echo "[" . date('d-M-Y H:i:s T') . "] Found misassociated test result: id={$row['id']}, project_id={$row['project_id']}, name={$row['name']}\n";
}

$findStmt->close();

// Step 4: Update all misassociated test results
if (!empty($wrongIds)) {
    $idsStr = implode(',', array_map('intval', $wrongIds));
    $updateSql = "UPDATE test_results SET project_id = ? WHERE id IN ({$idsStr})";
    
    $updateStmt = $conn->prepare($updateSql);
    if (!$updateStmt) {
        die("[" . date('d-M-Y H:i:s T') . "] Prepare failed: " . $conn->error . "\n");
    }
    
    $updateStmt->bind_param('i', $thikaProjectId);
    
    if ($updateStmt->execute()) {
        $affectedRows = $updateStmt->affected_rows;
        echo "[" . date('d-M-Y H:i:s T') . "] Successfully updated {$affectedRows} test result(s) to project_id={$thikaProjectId}\n";
    } else {
        die("[" . date('d-M-Y H:i:s T') . "] Error updating test results: " . $updateStmt->error . "\n");
    }
    
    $updateStmt->close();
} else {
    echo "[" . date('d-M-Y H:i:s T') . "] No misassociated test results found. All test results are correctly associated.\n";
}

// Step 5: Validate the fixes
echo "\n[" . date('d-M-Y H:i:s T') . "] === VALIDATION ===\n";

$validationSql = "
    SELECT 
        tr.id,
        tr.name as test_name,
        tr.project_id,
        p.name as project_name,
        tr.status,
        tr.created_at,
        tr.updated_at
    FROM test_results tr
    LEFT JOIN projects p ON tr.project_id = p.id
    ORDER BY tr.created_at DESC
";

$validationResult = $conn->query($validationSql);

if (!$validationResult) {
    die("[" . date('d-M-Y H:i:s T') . "] Error in validation query: " . $conn->error . "\n");
}

$mismatchCount = 0;
$correctCount = 0;

echo "[" . date('d-M-Y H:i:s T') . "] Test Result Associations:\n";
echo "[" . date('d-M-Y H:i:s T') . "] ID | Test Name | Project ID | Project Name | Status | Created At\n";
echo "[" . date('d-M-Y H:i:s T') . "] " . str_repeat("-", 90) . "\n";

while ($row = $validationResult->fetch_assoc()) {
    // Check if test name matches project name
    if ($row['test_name'] === $row['project_name']) {
        $correctCount++;
        $status = "✓ OK";
    } else {
        $mismatchCount++;
        $status = "✗ MISMATCH";
    }
    
    printf("[%s] %2d | %-30s | %-10s | %-30s | %-9s | %s\n",
        date('d-M-Y H:i:s T'),
        $row['id'],
        substr($row['test_name'], 0, 30),
        $row['project_id'] ?? 'NULL',
        substr($row['project_name'], 0, 30),
        $row['status'],
        $row['created_at']
    );
}

echo "[" . date('d-M-Y H:i:s T') . "] " . str_repeat("-", 90) . "\n";
echo "[" . date('d-M-Y H:i:s T') . "] Validation Summary:\n";
echo "[" . date('d-M-Y H:i:s T') . "] - Correctly associated: {$correctCount}\n";
echo "[" . date('d-M-Y H:i:s T') . "] - Mismatched: {$mismatchCount}\n";

if ($mismatchCount === 0) {
    echo "[" . date('d-M-Y H:i:s T') . "] ✓ All test results are correctly associated!\n";
} else {
    echo "[" . date('d-M-Y H:i:s T') . "] ⚠ Warning: {$mismatchCount} test result(s) still have mismatched associations\n";
}

$conn->close();
echo "\n[" . date('d-M-Y H:i:s T') . "] Migration completed.\n";
echo "[" . date('d-M-Y H:i:s T') . "] Database connection closed\n";
?>
