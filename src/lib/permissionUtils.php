<?php

/**
 * Permission checking helper for user rights management.
 * 
 * This file contains helper functions for checking if a user has permission
 * to access specific database tables according to the user_allowed_tables permission model.
 */

/**
 * Check if a user has permission to access a specific table.
 * 
 * This implements the whitelist permission model: by default, users have NO access
 * to any tables. Access must be explicitly granted by admins.
 * 
 * @param int $userId The user ID to check permissions for
 * @param string $tableName The table name to check access to
 * @return bool true if the user has access, false otherwise
 */
function hasTablePermission(int $userId, string $tableName): bool
{
    global $conn;
    
    // Validate input parameters
    if (!is_int($userId) || $userId < 1 || !is_string($tableName) || !$tableName) {
        return false;
    }
    
    try {
        // First, check if this table is in the admin tables list
        // Admin tables (users, user_allowed_tables) can be accessed by anyone for administrative purposes
        $adminTables = ['users', 'user_allowed_tables'];
        
        if (in_array($tableName, $adminTables, true)) {
            // Admin tables can be accessed by any authenticated user
            // This is for administrative functions like user management
            return true;
        }
        
        // Check if the user has explicit permission to access this table
        $sql = "SELECT COUNT(*) as permission_count FROM user_allowed_tables WHERE user_id = ? AND table_name = ?";
        $stmt = $conn->prepare($sql);
        
        if (!$stmt) {
            error_log("Permission check failed: Unable to prepare statement");
            return false;
        }
        
        $stmt->bind_param('is', $userId, $tableName);
        $stmt->execute();
        $result = $stmt->get_result();
        $row = $result->fetch_assoc();
        $stmt->close();
        
        $hasPermission = (bool)($row['permission_count'] > 0);
        
        return $hasPermission;
        
    } catch (Exception $e) {
        error_log("Permission check failed: " . get_class($e) . " - " . $e->getMessage());
        return false;
    }
}

/**
 * Get all tables a user has permission to access.
 * 
 * @param int $userId The user ID to get permissions for
 * @return array Array of table names the user has access to
 */
function getUserPermittedTables(int $userId): array
{
    global $conn;
    
    if (!is_int($userId) || $userId < 1) {
        return [];
    }
    
    try {
        $sql = "SELECT table_name FROM user_allowed_tables WHERE user_id = ? ORDER BY table_name";
        $stmt = $conn->prepare($sql);
        
        if (!$stmt) {
            error_log("Failed to prepare permitted tables query");
            return [];
        }
        
        $stmt->bind_param('i', $userId);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $tables = [];
        while ($row = $result->fetch_assoc()) {
            $tables[] = $row['table_name'];
        }
        
        $stmt->close();
        return $tables;
        
    } catch (Exception $e) {
        error_log("Failed to get permitted tables: " . get_class($e) . " - " . $e->getMessage());
        return [];
    }
}

/**
 * Check if a table is an admin table that can be accessed by anyone.
 * 
 * @param string $tableName The table name to check
 * @return bool true if it's an admin table, false otherwise
 */
function isAdminTable(string $tableName): bool
{
    $adminTables = ['users', 'user_allowed_tables'];
    return in_array($tableName, $adminTables, true);
}

/**
 * Get the list of admin tables.
 * 
 * @return array Array of admin table names
 */
function getAdminTables(): array
{
    return ['users', 'user_allowed_tables'];
}

/**
 * Validate and filter API list requests based on user permissions.
 * 
 * This function should be called at the beginning of any API list action
 * to enforce the whitelist permission model.
 * 
 * @param string $tableName The table being accessed
 * @param int $userId The user ID making the request
 * @param callable $executeQuery The actual query execution function
 * @return mixed The query result, or an empty result if no permission
 */
function enforceTablePermission(string $tableName, int $userId, callable $executeQuery): mixed
{
    // First, check if this table is an admin table
    if (isAdminTable($tableName)) {
        // Admin tables can be accessed by any authenticated user
        return $executeQuery();
    }
    
    // Check if the user has permission to access this table
    if (!hasTablePermission($userId, $tableName)) {
        // Log permission violation for security monitoring
        error_log("Permission denied: User {$userId} attempted to access table {$tableName} without permission");
        
        // Return an empty result set
        // The structure of the empty result depends on the specific API
        // For most APIs, an empty array or empty result set is appropriate
        if (is_callable($executeQuery)) {
            // Execute a query that returns an empty result
            // This should be implemented in the specific API endpoint
            return [];
        }
        
        return null;
    }
    
    // User has permission, execute the query
    return $executeQuery();
}

?>