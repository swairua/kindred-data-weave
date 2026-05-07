<?php
/**
 * Migration script to ensure sessions table has required columns for new session handler
 * Run this once: php migrate_sessions.php
 */

$host = 'localhost';
$user = 'wayrusc1_labdatacraft';
$pass = 'Sirgeorge.12';
$name = 'wayrusc1_labdatacraft';
$port = 3306;

try {
    $conn = new mysqli($host, $user, $pass, $name, $port);
    $conn->set_charset('utf8mb4');

    if ($conn->connect_error) {
        die('Database connection failed: ' . $conn->connect_error);
    }

    echo "Connected to database successfully.\n";

    // Check if session_data column exists
    $result = $conn->query("SHOW COLUMNS FROM `sessions` LIKE 'session_data'");
    
    if ($result && $result->num_rows === 0) {
        echo "Adding session_data column to sessions table...\n";
        $conn->query("ALTER TABLE `sessions` ADD COLUMN `session_data` LONGTEXT DEFAULT '' AFTER `session_id`");
        
        if ($conn->error) {
            echo "ERROR adding column: " . $conn->error . "\n";
        } else {
            echo "✓ session_data column added successfully.\n";
        }
    } else {
        echo "✓ session_data column already exists.\n";
    }

    // Check if expires_at column exists
    $result = $conn->query("SHOW COLUMNS FROM `sessions` LIKE 'expires_at'");
    if (!$result || $result->num_rows === 0) {
        echo "Adding expires_at column to sessions table...\n";
        $conn->query("ALTER TABLE `sessions` ADD COLUMN `expires_at` DATETIME NOT NULL DEFAULT (DATE_ADD(NOW(), INTERVAL 30 MINUTE))");
        
        if ($conn->error) {
            echo "ERROR adding column: " . $conn->error . "\n";
        } else {
            echo "✓ expires_at column added successfully.\n";
        }
    } else {
        echo "✓ expires_at column already exists.\n";
    }

    // Create index on expires_at for garbage collection
    $result = $conn->query("SHOW INDEX FROM `sessions` WHERE Key_name = 'idx_expires_at'");
    if (!$result || $result->num_rows === 0) {
        echo "Creating index on expires_at column...\n";
        $conn->query("CREATE INDEX `idx_expires_at` ON `sessions` (`expires_at`)");
        
        if ($conn->error && strpos($conn->error, 'Duplicate') === false) {
            echo "ERROR creating index: " . $conn->error . "\n";
        } else {
            echo "✓ Index created successfully.\n";
        }
    } else {
        echo "✓ Index already exists.\n";
    }

    // Show final table structure
    echo "\nFinal sessions table structure:\n";
    $result = $conn->query("DESCRIBE `sessions`");
    while ($row = $result->fetch_assoc()) {
        printf("  %-20s %-30s %s\n", $row['Field'], $row['Type'], $row['Null'] === 'YES' ? 'NULL' : 'NOT NULL');
    }

    echo "\n✓ Migration completed successfully!\n";
    
    $conn->close();
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
