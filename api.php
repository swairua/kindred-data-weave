<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

// CORS headers - use specific origin instead of * when credentials are involved
$allowed_origins = [
    'https://lab.wayrus.co.ke',
    'https://26823065fd2a4fa3bd380434d33615c0-gentle-road-nwozm8we.builderio.xyz',
    'https://lab-data-craft.lovable.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
// Allow any Lovable preview subdomain
$isLovablePreview = (bool) preg_match('/^https:\/\/[a-z0-9\-]+\.lovable\.app$/', $origin);
// Allow any Builder.io preview subdomain
$isBuilderPreview = (bool) preg_match('/^https:\/\/[a-z0-9\-]+\.builderio\.xyz$/', $origin);
if (in_array($origin, $allowed_origins, true) || $isLovablePreview || $isBuilderPreview) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
} elseif ($origin) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
}

header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

// Database connection for session handling
function createSessionDb(): mysqli
{
    $host = 'localhost';
    $user = 'wayrusc1_labdatacraft';
    $pass = 'Sirgeorge.12';
    $name = 'wayrusc1_labdatacraft';
    $port = 3306;

    $conn = new mysqli($host, $user, $pass, $name, $port);
    $conn->set_charset('utf8mb4');

    return $conn;
}

// Custom session handler using database
class DatabaseSessionHandler implements SessionHandlerInterface
{
    private mysqli $conn;

    public function __construct(mysqli $conn)
    {
        $this->conn = $conn;
    }

    public function open(string $path, string $name): bool
    {
        return true;
    }

    public function close(): bool
    {
        return true;
    }

    public function read(string $id): string|false
    {
        try {
            $sql = "SELECT session_data FROM `sessions` WHERE session_id = ? AND expires_at > NOW() LIMIT 1";
            $stmt = $this->conn->prepare($sql);
            if (!$stmt) {
                return false;
            }

            $stmt->bind_param('s', $id);
            $stmt->execute();
            $result = $stmt->get_result();
            $row = $result->fetch_assoc();
            $stmt->close();

            return $row['session_data'] ?? '';
        } catch (Exception $e) {
            error_log('Session read error: ' . $e->getMessage());
            return false;
        }
    }

    public function write(string $id, string $data): bool
    {
        try {
            // Extract user_id from serialized session data
            $userId = null;
            if ($data !== '') {
                try {
                    $sessionData = unserialize($data, ['allowed_classes' => false]);
                    if (is_array($sessionData) && isset($sessionData['user_id'])) {
                        $userId = (int) $sessionData['user_id'];
                    }
                } catch (Exception $e) {
                    error_log('Session data unserialize error: ' . $e->getMessage());
                }
            }

            // Insert or update session with user_id
            $sql = "INSERT INTO `sessions` (session_id, session_data, expires_at, updated_at, user_id)
                    VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW(), ?)
                    ON DUPLICATE KEY UPDATE session_data = ?, updated_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE), user_id = ?";
            $stmt = $this->conn->prepare($sql);
            if (!$stmt) {
                return false;
            }

            $stmt->bind_param('ssiii', $id, $data, $userId, $data, $userId);
            $stmt->execute();
            $stmt->close();

            return true;
        } catch (Exception $e) {
            error_log('Session write error: ' . $e->getMessage());
            return false;
        }
    }

    public function destroy(string $id): bool
    {
        try {
            $sql = "DELETE FROM `sessions` WHERE session_id = ?";
            $stmt = $this->conn->prepare($sql);
            if (!$stmt) {
                return false;
            }

            $stmt->bind_param('s', $id);
            $stmt->execute();
            $stmt->close();

            return true;
        } catch (Exception $e) {
            error_log('Session destroy error: ' . $e->getMessage());
            return false;
        }
    }

    public function gc(int $max_lifetime): int|false
    {
        try {
            $sql = "DELETE FROM `sessions` WHERE expires_at < NOW()";
            $this->conn->query($sql);
            return $this->conn->affected_rows;
        } catch (Exception $e) {
            error_log('Session gc error: ' . $e->getMessage());
            return false;
        }
    }
}

// Session configuration
// Allow insecure cookies in development (localhost)
$isLocalhost = strpos($_SERVER['HTTP_HOST'] ?? '', 'localhost') === 0 ||
               strpos($_SERVER['HTTP_HOST'] ?? '', '127.0.0.1') === 0;

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'None',
    'secure' => !$isLocalhost, // Allow insecure cookies for localhost development
]);

// Initialize custom session handler
$sessionDb = createSessionDb();
$sessionHandler = new DatabaseSessionHandler($sessionDb);
session_set_save_handler($sessionHandler, true);
session_start();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // CORS preflight response - headers are already set above
    http_response_code(200);
    exit;
}

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

const ALLOWED_TABLES = [
    'projects' => true,
    'test_definitions' => true,
    'test_results' => true,
    'atterberg_instances' => true,
    'atterberg_rows' => true,
    'admin_images' => true,
    'admin_images_audit' => true,
];

function respond(array $payload, int $status = 200): never
{
    error_log("RESPOND: status=$status, payload=" . json_encode($payload));
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function hashPassword(string $password): string
{
    return password_hash($password, PASSWORD_DEFAULT);
}

function verifyPassword(string $password, string $hash): bool
{
    return password_verify($password, $hash);
}

function getCurrentUser(mysqli $conn): ?array
{
    if (!isset($_SESSION['user_id'])) {
        return null;
    }

    $userId = (int) $_SESSION['user_id'];

    // Fetch user from database to verify they still exist and get their details
    $sql = "SELECT id, email, name FROM `users` WHERE id = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }

    $stmt->bind_param('i', $userId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();

    if (!$row) {
        session_destroy();
        return null;
    }

    return [
        'id' => (int) $row['id'],
        'email' => $row['email'],
        'name' => $row['name'],
    ];
}

function requireAuth(mysqli $conn): ?array
{
    $user = getCurrentUser($conn);
    if (!$user) {
        respond(['error' => 'Unauthorized'], 401);
    }
    return $user;
}

function db(): mysqli
{
    $host = 'localhost';
    $user = 'wayrusc1_labdatacraft';
    $pass = 'Sirgeorge.12';
    $name = 'wayrusc1_labdatacraft';
    $port = 3306;

    $conn = new mysqli($host, $user, $pass, $name, $port);
    $conn->set_charset('utf8mb4');

    return $conn;
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
        return $decoded;
    }

    parse_str($raw, $parsed);
    return is_array($parsed) ? $parsed : [];
}

function tableName(array $input): string
{
    $table = trim((string) ($input['table'] ?? $_GET['table'] ?? ''));
    if ($table === '' || !preg_match('/^[a-zA-Z0-9_]+$/', $table) || !isset(ALLOWED_TABLES[$table])) {
        respond(['error' => 'Invalid or unsupported table'], 400);
    }

    return $table;
}

function columnSchema(mysqli $conn, string $table): array
{
    $columns = [];
    $primaryKey = null;
    $autoIncrement = [];

    $result = $conn->query("SHOW COLUMNS FROM `$table`");
    while ($row = $result->fetch_assoc()) {
        $columns[$row['Field']] = $row;
        if (($row['Key'] ?? '') === 'PRI') {
            $primaryKey = $row['Field'];
        }
        if (str_contains((string) ($row['Extra'] ?? ''), 'auto_increment')) {
            $autoIncrement[] = $row['Field'];
        }
    }

    return [
        'columns' => $columns,
        'primaryKey' => $primaryKey,
        'autoIncrement' => $autoIncrement,
    ];
}

function bindParams(mysqli_stmt $stmt, string $types, array $params): void
{
    $references = [$types];
    foreach ($params as $key => $value) {
        $references[$key + 1] = &$params[$key];
    }
    call_user_func_array([$stmt, 'bind_param'], $references);
}

function normalizeValue(mixed $value): mixed
{
    if (is_array($value) || is_object($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    return $value;
}

function hydrateRow(array $row): array
{
    foreach ($row as $key => $value) {
        if (!is_string($value) || !str_ends_with($key, '_json')) {
            continue;
        }

        $decoded = json_decode($value, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $row[$key] = $decoded;
        }
    }

    return $row;
}

function filteredPayload(array $input): array
{
    $payload = $input['data'] ?? $input['payload'] ?? $input;

    if (!is_array($payload)) {
        return [];
    }

    unset(
        $payload['action'],
        $payload['table'],
        $payload['id'],
        $payload['limit'],
        $payload['offset'],
        $payload['orderBy'],
        $payload['direction']
    );

    return $payload;
}

function logAuditSave(
    mysqli $conn,
    int $testResultId,
    int $userId,
    string $status,
    int $dataPoints = 0,
    string $testKey = 'atterberg',
    ?string $errorMessage = null
): bool {
    try {
        // Check if table exists first
        $tableCheck = $conn->query("SELECT 1 FROM atterberg_save_audit LIMIT 1");
        if ($tableCheck === false) {
            error_log("atterberg_save_audit table does not exist or cannot be accessed: " . $conn->error);
            return false;
        }

        $sql = "INSERT INTO atterberg_save_audit
                (test_result_id, user_id, status, data_points, test_key, error_message)
                VALUES (?, ?, ?, ?, ?, ?)";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            error_log("Failed to prepare audit log statement: " . $conn->error);
            return false;
        }

        $stmt->bind_param('iisiss', $testResultId, $userId, $status, $dataPoints, $testKey, $errorMessage);

        if (!$stmt->execute()) {
            error_log("Failed to execute audit log for test_result_id=$testResultId: " . $stmt->error);
            $stmt->close();
            return false;
        }

        error_log("Audit log created: test_result_id=$testResultId, status=$status, data_points=$dataPoints");
        $stmt->close();
        return true;
    } catch (Throwable $e) {
        error_log("Exception in logAuditSave: " . $e->getMessage());
        return false;
    }
}

function updateAuditSaveCompletion(
    mysqli $conn,
    int $testResultId,
    string $newStatus,
    ?string $errorMessage = null
): bool {
    $sql = "UPDATE atterberg_save_audit
            SET status = ?, error_message = ?, completed_at = NOW()
            WHERE test_result_id = ?
            ORDER BY created_at DESC
            LIMIT 1";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        error_log("Failed to prepare audit update statement: " . $conn->error);
        return false;
    }

    $stmt->bind_param('ssi', $newStatus, $errorMessage, $testResultId);

    if (!$stmt->execute()) {
        error_log("Failed to execute audit update: " . $stmt->error);
        $stmt->close();
        return false;
    }

    $stmt->close();
    return true;
}

try {
    $conn = db();
    $body = requestBody();
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $action = strtolower((string) ($_GET['action'] ?? $body['action'] ?? ''));

    error_log("==================== REQUEST ====================");
    error_log("Method: $method");
    error_log("Action: " . ($action ?: 'NOT SET'));
    error_log("GET params: " . json_encode($_GET));
    error_log("Request body: " . json_encode($body));
    error_log("Session user_id: " . ($_SESSION['user_id'] ?? 'NOT SET'));
    error_log("==============================================");

    // ============= AUTHENTICATION ENDPOINTS =============

    if ($action === 'register') {
        $email = trim((string) ($body['email'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $name = trim((string) ($body['name'] ?? ''));

        if (!$email || !$password || !$name) {
            respond(['error' => 'Missing required fields: email, password, name'], 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            respond(['error' => 'Invalid email format'], 400);
        }

        // Check if user already exists
        $checkStmt = $conn->prepare("SELECT id FROM `users` WHERE email = ? LIMIT 1");
        $checkStmt->bind_param('s', $email);
        $checkStmt->execute();
        if ($checkStmt->get_result()->fetch_assoc()) {
            respond(['error' => 'Email already registered'], 409);
        }
        $checkStmt->close();

        // Hash password and create user
        $hashedPassword = hashPassword($password);
        $insertStmt = $conn->prepare("INSERT INTO `users` (email, password, name) VALUES (?, ?, ?)");
        $insertStmt->bind_param('sss', $email, $hashedPassword, $name);

        if (!$insertStmt->execute()) {
            respond(['error' => 'Failed to create user'], 500);
        }

        $userId = $conn->insert_id;
        $insertStmt->close();

        // Create session - just set the user_id and let the session handler save it
        $_SESSION['user_id'] = $userId;

        respond([
            'message' => 'User registered and logged in',
            'user_id' => $userId,
            'user' => [
                'id' => $userId,
                'email' => $email,
                'name' => $name,
            ],
        ], 201);
    }

    if ($action === 'login') {
        $email = trim((string) ($body['email'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if (!$email || !$password) {
            respond(['error' => 'Missing email or password'], 400);
        }

        // Fetch user by email
        $userStmt = $conn->prepare("SELECT id, password, email, name FROM `users` WHERE email = ? LIMIT 1");
        $userStmt->bind_param('s', $email);
        $userStmt->execute();
        $userRow = $userStmt->get_result()->fetch_assoc();
        $userStmt->close();

        if (!$userRow || !verifyPassword($password, (string) $userRow['password'])) {
            respond(['error' => 'Invalid email or password'], 401);
        }

        // Create session - just set the user_id and let the session handler save it
        $userId = (int) $userRow['id'];
        $_SESSION['user_id'] = $userId;

        respond([
            'message' => 'Logged in successfully',
            'user_id' => $userId,
            'user' => [
                'id' => $userId,
                'email' => $userRow['email'],
                'name' => $userRow['name'],
            ],
        ]);
    }

    if ($action === 'logout') {
        // session_destroy() will use our custom handler to delete from the database
        session_destroy();

        respond(['message' => 'Logged out successfully']);
    }

    if ($action === 'me') {
        $user = getCurrentUser($conn);
        if (!$user) {
            respond(['user' => null, 'authenticated' => false], 401);
        }

        respond([
            'user' => $user,
            'authenticated' => true,
        ]);
    }

    // ============= IMAGE UPLOAD ENDPOINT =============
    if ($action === 'upload') {
        // Enable error logging
        ini_set('log_errors', 1);
        ini_set('error_log', __DIR__ . '/uploads_error.log');
        error_log("=== UPLOAD REQUEST START ===");

        // Debug session info
        error_log("Session user_id: " . (isset($_SESSION['user_id']) ? $_SESSION['user_id'] : 'NOT SET'));
        error_log("PHPSESSID cookie: " . ($_COOKIE['PHPSESSID'] ?? 'NOT SET'));
        error_log("Origin: " . ($_SERVER['HTTP_ORIGIN'] ?? 'NOT SET'));
        error_log("User-Agent: " . ($_SERVER['HTTP_USER_AGENT'] ?? 'NOT SET'));

        // Require authentication
        $user = requireAuth($conn);
        if (!$user) {
            error_log("ERROR: Authentication failed");
            respond(['error' => 'Unauthorized', 'debug' => 'Session validation failed'], 401);
        }
        $userId = (int) $_SESSION['user_id'];

        // Log request details
        error_log("User ID: $userId");
        error_log("Method: " . $_SERVER['REQUEST_METHOD']);
        error_log("Files received: " . json_encode(array_keys($_FILES)));
        error_log("Post data: " . json_encode($_POST));

        // Validate image_type
        $image_type = trim((string) ($_POST['image_type'] ?? $_GET['image_type'] ?? ''));
        $allowed_types = ['logo', 'contacts', 'stamp'];

        if (!$image_type || !in_array($image_type, $allowed_types, true)) {
            error_log("ERROR: Invalid image_type: $image_type");
            respond(['error' => 'Invalid image type. Must be: logo, contacts, or stamp'], 400);
        }

        error_log("Image type: $image_type");

        // Check if file was uploaded
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            $error = $_FILES['file']['error'] ?? 'Unknown error';
            error_log("ERROR: File upload failed with code: $error");
            respond(['error' => 'No file uploaded or upload error'], 400);
        }

        $file = $_FILES['file'];
        error_log("File info: name={$file['name']}, size={$file['size']}, type={$file['type']}, tmp={$file['tmp_name']}");

        // Validate file size (max 50MB)
        $maxSize = 50 * 1024 * 1024;
        if ($file['size'] > $maxSize) {
            error_log("ERROR: File too large: {$file['size']} bytes");
            respond(['error' => 'File too large. Maximum size is 50MB'], 413);
        }

        // Validate MIME type
        $allowed_mimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!in_array($file['type'], $allowed_mimes, true)) {
            error_log("ERROR: Invalid MIME type: {$file['type']}");
            respond(['error' => 'Invalid file type. Allowed: JPG, PNG, GIF, WebP'], 400);
        }

        // Create upload directory
        $upload_dir = __DIR__ . '/uploads/';
        if (!is_dir($upload_dir)) {
            if (!@mkdir($upload_dir, 0755, true)) {
                error_log("ERROR: Failed to create directory: $upload_dir");
                respond(['error' => 'Failed to create upload directory'], 500);
            }
            error_log("Created directory: $upload_dir");
        }

        // Generate unique filename
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        $filename = $image_type . '_' . date('Ymd_His') . '_' . bin2hex(random_bytes(6)) . '.' . $ext;
        $file_path = $upload_dir . $filename;
        $relative_path = '/uploads/' . $filename;

        error_log("Target file path: $file_path");

        // Move uploaded file
        if (!@move_uploaded_file($file['tmp_name'], $file_path)) {
            error_log("ERROR: Failed to move uploaded file from {$file['tmp_name']} to $file_path");
            respond(['error' => 'Failed to save uploaded file'], 500);
        }

        error_log("File successfully moved to: $file_path");

        // Insert into database
        try {
            $stmt = $conn->prepare(
                "INSERT INTO admin_images (image_type, file_path, original_filename, file_size, mime_type, uploaded_by)
                 VALUES (?, ?, ?, ?, ?, ?)"
            );

            if (!$stmt) {
                throw new Exception("Prepare failed: " . $conn->error);
            }

            $stmt->bind_param(
                'sssisi',
                $image_type,
                $relative_path,
                $file['name'],
                $file['size'],
                $file['type'],
                $userId
            );

            if (!$stmt->execute()) {
                throw new Exception("Execute failed: " . $stmt->error);
            }

            $image_id = $conn->insert_id;
            error_log("Image record created with ID: $image_id");

            respond([
                'success' => true,
                'message' => 'Image uploaded successfully',
                'file_path' => $relative_path,
                'image_id' => $image_id,
                'image_type' => $image_type,
            ], 200);

        } catch (Exception $e) {
            error_log("ERROR: Database insert failed: " . $e->getMessage());
            // Clean up uploaded file if database insert fails
            if (file_exists($file_path)) {
                @unlink($file_path);
                error_log("Cleaned up uploaded file due to database error");
            }
            respond(['error' => 'Failed to save image to database', 'details' => $e->getMessage()], 500);
        }
    }

    // ============= CRUD ENDPOINTS (require authentication) =============

    $table = tableName($body);
    $schema = columnSchema($conn, $table);
    $primaryKey = $schema['primaryKey'] ?? 'id';

    if ($action === '') {
        $action = $method === 'GET'
            ? (isset($_GET['id']) || isset($body['id']) ? 'read' : 'list')
            : match ($method) {
                'POST' => 'create',
                'PUT', 'PATCH' => 'update',
                'DELETE' => 'delete',
                default => '',
            };
    }

    if ($action === '') {
        respond(['error' => 'Unsupported action'], 405);
    }

    if ($action === 'schema') {
        respond([
            'table' => $table,
            'primaryKey' => $primaryKey,
            'columns' => array_values(array_map(fn ($col) => [
                'name' => $col['Field'],
                'type' => $col['Type'],
                'nullable' => $col['Null'] === 'YES',
                'key' => $col['Key'],
                'default' => $col['Default'],
                'extra' => $col['Extra'],
            ], $schema['columns'])),
        ]);
    }

    if ($action === 'list') {
        // Allow public tables to be listed without authentication
        $publicTables = ['test_definitions'];
        $user = null;
        $userId = null;

        if (!in_array($table, $publicTables, true)) {
            // Require authentication for non-public tables
            $user = requireAuth($conn);
            $userId = (int) $_SESSION['user_id'];
        } else {
            // For public tables, get user if authenticated
            $user = getCurrentUser($conn);
            $userId = $user ? (int) $_SESSION['user_id'] : null;
        }

        $limit = isset($_GET['limit']) ? max(1, (int) $_GET['limit']) : 100;
        $offset = isset($_GET['offset']) ? max(0, (int) $_GET['offset']) : 0;
        $orderBy = (string) ($_GET['orderBy'] ?? $primaryKey);
        $direction = strtoupper((string) ($_GET['direction'] ?? 'DESC'));

        if (!isset($schema['columns'][$orderBy])) {
            $orderBy = $primaryKey;
        }
        if (!in_array($direction, ['ASC', 'DESC'], true)) {
            $direction = 'DESC';
        }

        // Filter by user_id if the table has it and user is authenticated
        $whereClause = '';
        if ($userId && isset($schema['columns']['user_id'])) {
            $whereClause = "WHERE `user_id` = $userId";
        }

        $sql = "SELECT * FROM `$table` $whereClause ORDER BY `$orderBy` $direction LIMIT ? OFFSET ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('ii', $limit, $offset);
        $stmt->execute();
        $result = $stmt->get_result();

        $rows = [];
        while ($row = $result->fetch_assoc()) {
            $rows[] = hydrateRow($row);
        }

        respond([
            'table' => $table,
            'data' => $rows,
            'limit' => $limit,
            'offset' => $offset,
        ]);
    }

    if ($action === 'read') {
        $user = requireAuth($conn);
        $userId = (int) $_SESSION['user_id'];

        $id = $_GET['id'] ?? $body['id'] ?? null;
        if ($id === null || $id === '') {
            respond(['error' => 'Missing id'], 400);
        }

        // Check ownership if table has user_id
        $whereClause = "`$primaryKey` = ?";
        if (isset($schema['columns']['user_id'])) {
            $whereClause .= " AND `user_id` = $userId";
        }

        $sql = "SELECT * FROM `$table` WHERE $whereClause LIMIT 1";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();

        if (!$row) {
            respond(['error' => 'Record not found'], 404);
        }

        respond(['table' => $table, 'data' => hydrateRow($row)]);
    }

    if ($action === 'create') {
        error_log("=== CREATE ACTION START ===");
        error_log("Table: $table");
        error_log("Request body: " . json_encode($body));

        $user = requireAuth($conn);
        $userId = (int) $_SESSION['user_id'];
        error_log("User ID: $userId");

        $payload = filteredPayload($body);
        error_log("Filtered payload: " . json_encode($payload));

        // Automatically add user_id if table has it
        if (isset($schema['columns']['user_id'])) {
            $payload['user_id'] = $userId;
            error_log("Added user_id to payload");
        }

        $columns = [];
        $placeholders = [];
        $values = [];

        foreach ($payload as $column => $value) {
            if (!isset($schema['columns'][$column]) || in_array($column, $schema['autoIncrement'], true)) {
                error_log("Skipping column: $column (exists in schema: " . (isset($schema['columns'][$column]) ? 'YES' : 'NO') . ", is auto_increment: " . (in_array($column, $schema['autoIncrement'], true) ? 'YES' : 'NO') . ")");
                continue;
            }

            $columns[] = "`$column`";
            $placeholders[] = '?';
            $values[] = normalizeValue($value);
        }

        error_log("Columns to insert: " . json_encode($columns));
        error_log("Values to insert: " . json_encode($values));

        if ($columns === []) {
            error_log("ERROR: No valid fields provided for insert");
            respond(['error' => 'No valid fields provided for insert'], 422);
        }

        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(', ', $columns),
            implode(', ', $placeholders)
        );

        error_log("SQL: $sql");

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            error_log("ERROR: Failed to prepare statement: " . $conn->error);
            respond(['error' => 'Database error: ' . $conn->error], 500);
        }

        bindParams($stmt, str_repeat('s', count($values)), $values);

        if (!$stmt->execute()) {
            error_log("ERROR: Failed to execute statement: " . $stmt->error);
            respond(['error' => 'Database error: ' . $stmt->error], 500);
        }

        // Verify that the INSERT actually affected a row
        if ($stmt->affected_rows <= 0) {
            error_log("ERROR: INSERT statement did not affect any rows. Affected rows: " . $stmt->affected_rows);
            respond(['error' => 'Failed to insert record - database did not accept the insert'], 500);
        }

        $insertId = $conn->insert_id;
        error_log("Record inserted with ID: $insertId, affected_rows: " . $stmt->affected_rows);

        $created = $conn->query("SELECT * FROM `$table` WHERE `$primaryKey` = '" . $conn->real_escape_string((string) $insertId) . "' LIMIT 1")->fetch_assoc();
        error_log("Retrieved created record: " . json_encode($created));

        // Log audit for Atterberg test saves (non-blocking)
        error_log("Checking for audit logging: table=$table, test_key=" . ($payload['test_key'] ?? 'NOT_SET'));
        if ($table === 'test_results' && ($payload['test_key'] ?? '') === 'atterberg') {
            $dataPoints = (int) ($payload['data_points'] ?? 0);
            error_log("Creating audit log for test_result_id=$insertId, data_points=$dataPoints");
            $auditResult = logAuditSave($conn, $insertId, $userId, 'completed', $dataPoints, 'atterberg');
            if (!$auditResult) {
                error_log("WARNING: Audit log creation failed for test_result_id=$insertId, but main record was saved successfully");
            } else {
                error_log("Audit log created successfully for test_result_id=$insertId");
            }
        } else {
            error_log("Audit logging skipped: table match=" . ($table === 'test_results' ? 'YES' : 'NO') . ", test_key match=" . (($payload['test_key'] ?? '') === 'atterberg' ? 'YES' : 'NO'));
        }

        error_log("=== CREATE ACTION END ===");

        respond([
            'message' => 'Record created',
            'table' => $table,
            'id' => $insertId,
            'data' => $created ? hydrateRow($created) : null,
            'last_saved_at' => date('Y-m-d H:i:s'),
        ], 201);
    }

    if ($action === 'update') {
        error_log("=== UPDATE ACTION START ===");
        error_log("Table: $table");
        error_log("Request body: " . json_encode($body));

        $user = requireAuth($conn);
        $userId = (int) $_SESSION['user_id'];
        error_log("User ID: $userId");

        $id = $_GET['id'] ?? $body['id'] ?? null;
        if ($id === null || $id === '') {
            error_log("ERROR: Missing id parameter");
            respond(['error' => 'Missing id'], 400);
        }
        error_log("Record ID: $id");

        // Check ownership if table has user_id
        if (isset($schema['columns']['user_id'])) {
            error_log("Checking record ownership");
            $checkStmt = $conn->prepare("SELECT id FROM `$table` WHERE `$primaryKey` = ? AND `user_id` = ? LIMIT 1");
            $checkStmt->bind_param('si', $id, $userId);
            $checkStmt->execute();
            if (!$checkStmt->get_result()->fetch_assoc()) {
                error_log("ERROR: Record not found or forbidden for user_id=$userId");
                respond(['error' => 'Record not found or forbidden'], 404);
            }
            error_log("Record ownership verified");
            $checkStmt->close();
        }

        $payload = filteredPayload($body);
        error_log("Filtered payload: " . json_encode($payload));

        // Prevent user_id from being updated
        unset($payload['user_id']);

        $sets = [];
        $values = [];

        foreach ($payload as $column => $value) {
            if (!isset($schema['columns'][$column]) || $column === $primaryKey || in_array($column, $schema['autoIncrement'], true)) {
                error_log("Skipping column: $column");
                continue;
            }

            $sets[] = "`$column` = ?";
            $values[] = normalizeValue($value);
        }

        error_log("Columns to update: " . json_encode(array_map(fn($s) => trim($s, '` = ?'), $sets)));
        error_log("Values: " . json_encode($values));

        if ($sets === []) {
            error_log("ERROR: No valid fields provided for update");
            respond(['error' => 'No valid fields provided for update'], 422);
        }

        $sql = sprintf(
            'UPDATE `%s` SET %s WHERE `%s` = ?',
            $table,
            implode(', ', $sets),
            $primaryKey
        );

        error_log("Update SQL: $sql");

        $values[] = $id;
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            error_log("ERROR: Failed to prepare update statement: " . $conn->error);
            respond(['error' => 'Database error: ' . $conn->error], 500);
        }

        bindParams($stmt, str_repeat('s', count($values)), $values);

        if (!$stmt->execute()) {
            error_log("ERROR: Failed to execute update: " . $stmt->error);
            respond(['error' => 'Database error: ' . $stmt->error], 500);
        }

        // Verify that the record exists (affected_rows can be 0 if no values changed)
        if ($stmt->affected_rows < 0) {
            error_log("ERROR: UPDATE statement failed. Affected rows: " . $stmt->affected_rows . ", ID: $id");
            respond(['error' => 'Failed to update record - database error'], 500);
        }

        // In MySQL, affected_rows = 0 means either:
        // 1. The record doesn't exist, OR
        // 2. The new values are identical to existing values
        // We should verify the record exists if affected_rows = 0
        if ($stmt->affected_rows === 0) {
            error_log("UPDATE affected_rows = 0, verifying record exists. ID: $id");
            $verifyStmt = $conn->prepare("SELECT 1 FROM `$table` WHERE `$primaryKey` = ? LIMIT 1");
            if (!$verifyStmt) {
                error_log("ERROR: Failed to prepare verification statement: " . $conn->error);
                respond(['error' => 'Database error: ' . $conn->error], 500);
            }
            $verifyStmt->bind_param('s', $id);
            $verifyStmt->execute();
            $verifyResult = $verifyStmt->get_result()->fetch_assoc();
            $verifyStmt->close();

            if (!$verifyResult) {
                error_log("ERROR: Record does not exist for update. ID: $id");
                respond(['error' => 'Failed to update record - no rows matched the update criteria'], 500);
            }
            error_log("Record exists, values were unchanged. Update successful, affected_rows: 0");
        } else {
            error_log("Update successful, affected_rows: " . $stmt->affected_rows);
        }

        $updated = $conn->query("SELECT * FROM `$table` WHERE `$primaryKey` = '" . $conn->real_escape_string((string) $id) . "' LIMIT 1")->fetch_assoc();
        error_log("Retrieved updated record: " . json_encode($updated));

        // Log audit for Atterberg test saves (non-blocking)
        error_log("Checking for audit logging: table=$table, test_key=" . ($payload['test_key'] ?? 'NOT_SET'));
        if ($table === 'test_results' && ($payload['test_key'] ?? '') === 'atterberg') {
            $dataPoints = (int) ($payload['data_points'] ?? 0);
            error_log("Creating audit log for test_result_id=$id, data_points=$dataPoints");
            $auditResult = logAuditSave($conn, (int) $id, $userId, 'completed', $dataPoints, 'atterberg');
            if (!$auditResult) {
                error_log("WARNING: Audit log creation failed for test_result_id=$id, but main record was updated successfully");
            } else {
                error_log("Audit log created successfully for test_result_id=$id");
            }
        } else {
            error_log("Audit logging skipped: table match=" . ($table === 'test_results' ? 'YES' : 'NO') . ", test_key match=" . (($payload['test_key'] ?? '') === 'atterberg' ? 'YES' : 'NO'));
        }

        error_log("=== UPDATE ACTION END ===");

        respond([
            'message' => 'Record updated',
            'table' => $table,
            'data' => $updated ? hydrateRow($updated) : null,
            'last_saved_at' => date('Y-m-d H:i:s'),
        ]);
    }

    if ($action === 'delete') {
        $user = requireAuth($conn);
        $userId = (int) $_SESSION['user_id'];

        $id = $_GET['id'] ?? $body['id'] ?? null;
        if ($id === null || $id === '') {
            respond(['error' => 'Missing id'], 400);
        }

        // Check ownership if table has user_id
        $whereClause = "`$primaryKey` = ?";
        if (isset($schema['columns']['user_id'])) {
            $whereClause .= " AND `user_id` = $userId";
        }

        $sql = sprintf('DELETE FROM `%s` WHERE %s', $table, $whereClause);
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('s', $id);
        $stmt->execute();

        respond([
            'message' => 'Record deleted',
            'table' => $table,
            'deleted' => $stmt->affected_rows > 0,
        ]);
    }

    respond(['error' => 'Unsupported action'], 405);
} catch (Throwable $e) {
    error_log("=== UNCAUGHT EXCEPTION ===");
    error_log("Error: " . $e->getMessage());
    error_log("File: " . $e->getFile());
    error_log("Line: " . $e->getLine());
    error_log("Trace: " . $e->getTraceAsString());

    respond([
        'error' => 'Server error',
        'message' => $e->getMessage(),
    ], 500);
}
