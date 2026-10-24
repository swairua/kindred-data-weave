<?php
declare(strict_types=1);

/**
 * scripts/seed_reception.php
 *
 * Inserts an idempotent sample reception consignment (+ field definitions and
 * a real intake photo) into the lab database via the kindred API so the reception flow
 * (log a consignment -> dashboard -> acknowledgement) can be exercised
 * end-to-end against real DB persistence.
 *
 * Environment:
 *   API_URL     default 'https://lab.wayrus.co.ke/api.php'
 *   API_EMAIL   admin@cransfield.com
 *   API_PASS    Pass123
 *
 * Usage:
 *   php scripts/seed_reception.php --api
 */

$apiUrl   = getenv('API_URL') ?: 'https://lab.wayrus.co.ke/api.php';
$apiEmail = getenv('API_EMAIL') ?: 'admin@cransfield.com';
$apiPass  = getenv('API_PASS') ?: 'Pass123';
$useApi   = in_array('--api', $argv ?? [], true);

if (!$useApi) {
    fwrite(STDERR, "This script only supports --api mode (remote DB port 3306 is firewalled).\n");
    exit(1);
}

echo '=== seed_reception.php ===' . PHP_EOL;
echo "Mode: HTTPS API" . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed data                                                              */
/* ---------------------------------------------------------------------- */
$rcNo        = 'RC-26-0418';
$jobNo       = '26-0418';
$client      = 'Kiriani Construction Ltd';
$project     = 'KIRIAINI AHP';
$clientRef   = 'KIR-RC-GF-001';
$deliveredBy = 'Kiriani Transport';
$vehicleReg  = 'KBX 123M';
$receivedBy  = 'Site Lab Tech';
$storagePlan = 'Auto by type';

/** Conditions that hold a sample — and, through it, the whole consignment. */
$holdConditions = ['Seal broken', 'Too little'];

/**
 * Dates stay relative to the run day so the dashboard always reads like a live
 * consignment: received "Today 09:00", cubes cast 5 days ago (7-day break due
 * in 2 days, 28-day break in 23), photo stamped with the same morning.
 */
$receivedAt   = date('Y-m-d') . 'T09:00';
$photoTakenAt = date('Y-m-d') . ' 09:15:00';
$cubeCastDate = date('Y-m-d', strtotime('-5 days'));

$consignmentCustomFields = [
    ['key' => 'chainage',      'value' => '0+200'],
    ['key' => 'weather',       'value' => 'Cloudy'],
    ['key' => 'site_contact',  'value' => 'J. Mwangi'],
];

$transportCustomFields = [
    ['key' => 'cooler_temp',   'value' => '4'],
    ['key' => 'delay_hours',   'value' => '2'],
];

$samples = [
    [
        'labId'           => '26-0418/01',
        'clientMark'      => 'BH1-0.5',
        'location'        => 'Borehole 1',
        'depthLabel'      => '0.50 m',
        'sampleType'      => 'Disturbed bulk',
        'container'       => 'Heavy-duty bag',
        'massKg'          => '12.5',
        'condition'       => 'Intact',
        'tests'           => ['MC', 'PSD', 'ATT'],
        'customFields'    => [
            ['key' => 'borehole',  'value' => 'BH1'],
            ['key' => 'strata',    'value' => 'Brown silty clay'],
        ],
    ],
    [
        'labId'           => '26-0418/02',
        'clientMark'      => 'BH1-2.0',
        'location'        => 'Borehole 1',
        'depthLabel'      => '2.00 m',
        'sampleType'      => 'Undisturbed U100',
        'container'       => 'U100 tube, waxed & capped',
        'massKg'          => '2.1',
        'condition'       => 'Intact',
        'tests'           => ['UU', 'CON'],
        'customFields'    => [
            ['key' => 'borehole',  'value' => 'BH1'],
            ['key' => 'strata',    'value' => 'Grey stiff clay'],
        ],
    ],
    [
        'labId'           => '26-0418/03',
        'clientMark'      => 'C1-0.3',
        'location'        => 'Cube curing',
        'depthLabel'      => '—',
        'sampleType'      => 'Concrete cube',
        'container'       => '150 mm cube',
        'massKg'          => '8.2',
        'condition'       => 'Intact',
        'tests'           => ['CMP'],
        'customFields'    => [],
    ],
    [
        'labId'           => '26-0418/04',
        'clientMark'      => 'BH2-1.5',
        'location'        => 'Borehole 2',
        'depthLabel'      => '1.50 m',
        'sampleType'      => 'SPT split-spoon',
        'container'       => 'Jar, sealed',
        'massKg'          => '0.9',
        'condition'       => 'Seal broken',
        'onHoldReason'    => 'Sample tube seal compromised on arrival',
        'tests'           => ['PSD', 'ATT'],
        'customFields'    => [
            ['key' => 'borehole',  'value' => 'BH2'],
            ['key' => 'strata',    'value' => 'Dense gravelly sand'],
        ],
    ],
];

$transportChecks = [
    'coolBox'     => true,
    'tubesUpright'=> true,
    'fieldLog'    => true,
];

/**
 * Mirror LogConsignment.handleReceive: a held sample makes the consignment
 * "on-hold", never "logged" — otherwise the dashboard's On-hold filter
 * (which tests status === "on-hold") skips it entirely.
 */
$status = array_filter(
    $samples,
    static fn (array $s): bool => in_array($s['condition'] ?? '', $holdConditions, true)
) !== [] ? 'on-hold' : 'logged';

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */
function apiLogin(string $apiUrl, string $email, string $pass): string {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query(['action' => 'login', 'email' => $email, 'password' => $pass]));
    $out = curl_exec($ch);
    $data = json_decode($out, true);
    $token = $data['session_token'] ?? null;
    curl_close($ch);
    if (!$token) { fwrite(STDERR, "FATAL: API login failed: $out\n"); exit(1); }
    echo "API login OK (token: $token)\n";
    return $token;
}

function apiGet(string $apiUrl, string $token, array $params): array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);
    curl_setopt($ch, CURLOPT_URL, $apiUrl . '?' . http_build_query($params));
    $out = curl_exec($ch);
    curl_close($ch);
    return json_decode($out, true);
}

function apiPostJson(string $apiUrl, string $token, string $action, string $table, array $data, ?int $id = null): array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json',
        'X-Session-Token: ' . $token,
    ]);
    $body = ['action' => $action, 'table' => $table, 'data' => $data];
    if ($id !== null) $body['id'] = $id;
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    $decoded = json_decode($out, true);
    return ['code' => $code, 'data' => $decoded, 'raw' => $out];
}

/**
 * Multipart POST used by the photo upload endpoint. The action travels in the
 * query string (as the front end does): php://input is unavailable for
 * multipart bodies, so api.php would otherwise never see it.
 */
function apiPostMultipart(string $apiUrl, string $token, string $action, array $fields, string $fileField, string $filePath, string $mimeType, string $originalName): array {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);
    curl_setopt($ch, CURLOPT_URL, $apiUrl . '?' . http_build_query(['action' => $action]));
    $post = $fields;
    $post[$fileField] = new CURLFile($filePath, $mimeType, $originalName);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
    $out = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'data' => json_decode((string) $out, true), 'raw' => (string) $out];
}

/** Finds a TrueType font when GD can use one, else null (falls back to imagestring). */
function ttfFont(): ?string {
    if (!function_exists('imagettftext')) return null;
    foreach ([
        'C:/Windows/Fonts/arialbd.ttf',
        'C:/Windows/Fonts/arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    ] as $font) {
        if (is_file($font)) return $font;
    }
    return null;
}

/** Text helper: TTF when available, built-in bitmap font otherwise. */
function drawText($im, ?string $ttf, int $size, int $color, int $x, int $y, string $text): void {
    if ($ttf !== null) {
        imagettftext($im, $size, 0, $x, $y, $color, $ttf, $text);
        return;
    }
    $level = $size >= 22 ? 5 : ($size >= 15 ? 4 : 3);
    imagestring($im, $level, $x, $y, $text, $color);
}

/**
 * Renders the stand-in intake photo (JPEG) that the seed uploads, so the
 * consignment has a real file behind it. The dashboard reads reception_photos,
 * not payload_json, so an embedded path alone would show nothing at all.
 *
 * Depicts the held U100/SPT tube with a compromised seal plus the caption.
 */
function generateReceptionPhotoJpeg(string $labId, string $mark, string $caption, string $stamp, string $outPath): bool {
    if (!function_exists('imagecreatetruecolor')) return false;

    $w = 960;
    $h = 720;
    $im = imagecreatetruecolor($w, $h);

    // Gradient backdrop (sky → bench).
    for ($y = 0; $y < $h; $y++) {
        $t = $y / $h;
        $grey = (int) (46 + 54 * $t);
        imageline($im, 0, $y, $w, $y, imagecolorallocate($im, $grey, $grey + 4, $grey + 10));
    }

    $white   = imagecolorallocate($im, 245, 245, 245);
    $muted   = imagecolorallocate($im, 176, 184, 194);
    $steel   = imagecolorallocate($im, 168, 176, 184);
    $steelDk = imagecolorallocate($im, 108, 116, 126);
    $amber   = imagecolorallocate($im, 245, 176, 58);
    $red     = imagecolorallocate($im, 220, 78, 62);
    $panel   = imagecolorallocate($im, 24, 27, 33);
    $black   = imagecolorallocate($im, 12, 14, 17);

    // Bench line.
    imageline($im, 0, 566, $w, 566, imagecolorallocate($im, 74, 80, 90));

    // Sample tube (split-spoon) standing on the bench.
    $tx = 402;
    $ty = 208;
    $tw = 156;
    $th = 358;
    imagefilledrectangle($im, $tx, $ty, $tx + $tw, $ty + $th, $steel);
    imagefilledrectangle($im, $tx, $ty, $tx + $tw, $ty + 46, $steelDk);   // cap
    imagefilledrectangle($im, $tx, $ty + 150, $tx + $tw, $ty + 176, $amber); // wax band
    imagerectangle($im, $tx, $ty, $tx + $tw, $ty + $th, $black);

    // Compromised seal: jagged tear across the cap.
    $points = [
        $tx + 12, $ty + 14, $tx + 44, $ty + 34, $tx + 70, $ty + 12,
        $tx + 96, $ty + 36, $tx + 124, $ty + 16, $tx + 146, $ty + 40,
    ];
    for ($i = 0; $i < count($points) - 4; $i += 2) {
        imageline($im, $points[$i], $points[$i + 1], $points[$i + 2], $points[$i + 3], $red);
    }

    // Label plate on the tube.
    imagefilledrectangle($im, $tx + 14, $ty + 214, $tx + $tw - 14, $ty + 292, $panel);
    drawText($im, ttfFont(), 15, $white, $tx + 24, $ty + 244, $labId);
    drawText($im, ttfFont(), 13, $muted, $tx + 24, $ty + 270, 'mark ' . $mark);

    // Header bar.
    imagefilledrectangle($im, 0, 0, $w, 64, $panel);
    drawText($im, ttfFont(), 17, $amber, 24, 40, 'RC-26-0418  ·  intake photo');

    // Caption bar.
    imagefilledrectangle($im, 0, $h - 104, $w, $h, $panel);
    drawText($im, ttfFont(), 18, $white, 24, $h - 66, $caption);
    drawText($im, ttfFont(), 14, $muted, 24, $h - 34, $stamp . '  ·  sample held pending client decision');

    // Corner tag so the frame reads as a lab photo, not an empty render.
    imagefilledrectangle($im, $w - 236, 16, $w - 16, 52, $red);
    drawText($im, ttfFont(), 15, $white, $w - 222, 41, 'SEAL BROKEN');

    $ok = imagejpeg($im, $outPath, 86);
    imagedestroy($im);
    return (bool) $ok;
}

/** Turns a reception_photos row into the payload shape the app expects. */
function photoEntryFromRow(array $row): array {
    return [
        'id'               => (int) ($row['id'] ?? 0),
        'rcNo'             => (string) ($row['rc_no'] ?? ''),
        'filePath'         => (string) ($row['file_path'] ?? ''),
        'originalFilename' => $row['original_filename'] ?? null,
        'fileSize'         => isset($row['file_size']) ? (int) $row['file_size'] : null,
        'mimeType'         => $row['mime_type'] ?? null,
        'caption'          => $row['caption'] ?? null,
        'uploadedBy'       => isset($row['uploaded_by']) ? (int) $row['uploaded_by'] : null,
        'createdAt'        => $row['created_at'] ?? null,
    ];
}

/**
 * Guarantees a real photo row + file for the consignment and returns the
 * payload entry (empty array when the upload is unavailable — the consignment
 * still seeds). Idempotent: an existing row is reused, never duplicated.
 */
function ensureReceptionPhoto(string $apiUrl, string $token, string $rcNo, string $caption, string $labId, string $mark, string $stamp): array {
    $existing = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'reception_photos', 'filter' => 'rc_no=' . $rcNo, 'limit' => '50']);
    $rows = $existing['data'] ?? [];
    if ($rows !== []) {
        $row = $rows[0];
        if (($row['caption'] ?? '') === '') {
            $id = (int) $row['id'];
            apiPostJson($apiUrl, $token, 'update', 'reception_photos', ['id' => $id, 'caption' => $caption], $id);
            $row['caption'] = $caption;
        }
        echo "  Photo already present: {$row['file_path']} (id={$row['id']})\n";
        return photoEntryFromRow($row);
    }

    $tmp = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'reception_seed_photo.jpg';
    if (!generateReceptionPhotoJpeg($labId, $mark, $caption, $stamp, $tmp)) {
        fwrite(STDERR, "WARN: GD could not render the stand-in photo — seeding without one.\n");
        return [];
    }
    $size = (int) @filesize($tmp);

    $res = apiPostMultipart(
        $apiUrl,
        $token,
        'upload-reception-photo',
        ['rc_no' => $rcNo],
        'file',
        $tmp,
        'image/jpeg',
        'reception_damage_photo.jpg'
    );
    @unlink($tmp);

    $data = is_array($res['data']) ? $res['data'] : [];
    if (!($data['success'] ?? false)) {
        fwrite(STDERR, "WARN: photo upload failed (HTTP {$res['code']}): {$res['raw']}\n");
        return [];
    }

    $id = (int) ($data['id'] ?? 0);
    apiPostJson($apiUrl, $token, 'update', 'reception_photos', ['id' => $id, 'caption' => $caption], $id);

    // Re-read so the payload carries exactly what the table holds.
    $read = apiGet($apiUrl, $token, ['action' => 'read', 'table' => 'reception_photos', 'id' => (string) $id]);
    $row = $read['data'] ?? null;
    if (is_array($row) && isset($row['id'])) {
        echo "  Uploaded photo: {$row['file_path']} (id={$row['id']})\n";
        return photoEntryFromRow($row);
    }

    return [
        'id'               => $id,
        'rcNo'             => $rcNo,
        'filePath'         => (string) ($data['file_path'] ?? ''),
        'originalFilename' => 'reception_damage_photo.jpg',
        'fileSize'         => $size,
        'mimeType'         => 'image/jpeg',
        'caption'          => $caption,
        'createdAt'        => date('Y-m-d H:i:s'),
    ];
}

/* ---------------------------------------------------------------------- */
/* Run                                                                    */
/* ---------------------------------------------------------------------- */

$token = apiLogin($apiUrl, $apiEmail, $apiPass);

// Seed field definitions (idempotent via field_definitions list + create)
echo PHP_EOL . "--- Seeding reception_field_definitions ---" . PHP_EOL;
$fieldDefs = [
    ['area' => 'consignment', 'field_key' => 'chainage',      'label' => 'Chainage / chainage from', 'value_type' => 'text',   'options' => null,  'sort_order' => 10, 'is_required' => 0],
    ['area' => 'consignment', 'field_key' => 'weather',       'label' => 'Weather on arrival',       'value_type' => 'select', 'options' => '["Sunny","Cloudy","Overcast","Rainy","Windy","Stormy"]', 'sort_order' => 20, 'is_required' => 0],
    ['area' => 'consignment', 'field_key' => 'site_contact',  'label' => 'Site contact',             'value_type' => 'text',   'options' => null,  'sort_order' => 30, 'is_required' => 0],
    ['area' => 'transport',   'field_key' => 'cooler_temp',   'label' => 'Cool box temperature (°C)', 'value_type' => 'number', 'options' => null,  'sort_order' => 10, 'is_required' => 0],
    ['area' => 'transport',   'field_key' => 'delay_hours',   'label' => 'Delay in transit (h)',      'value_type' => 'number', 'options' => null,  'sort_order' => 20, 'is_required' => 0],
    ['area' => 'sample',      'field_key' => 'borehole',      'label' => 'Borehole / trial pit',      'value_type' => 'text',   'options' => null,  'sort_order' => 10, 'is_required' => 0],
    ['area' => 'sample',      'field_key' => 'strata',        'label' => 'Strata description',        'value_type' => 'text',   'options' => null,  'sort_order' => 20, 'is_required' => 0],
];
$fdList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'reception_field_definitions', 'limit' => 1000]);
$existingFdKeys = [];
foreach ($fdList['data'] ?? [] as $fd) {
    $existingFdKeys[$fd['area'] . '|' . $fd['field_key']] = (int) $fd['id'];
}
foreach ($fieldDefs as $fd) {
    $mapKey = $fd['area'] . '|' . $fd['field_key'];
    if (isset($existingFdKeys[$mapKey])) {
        $res = apiPostJson($apiUrl, $token, 'update', 'reception_field_definitions', array_merge(['id' => $existingFdKeys[$mapKey]], $fd), $existingFdKeys[$mapKey]);
        echo "  Updated field def {$fd['area']}.{$fd['field_key']}\n";
    } else {
        $res = apiPostJson($apiUrl, $token, 'create', 'reception_field_definitions', $fd);
        echo "  Created field def {$fd['area']}.{$fd['field_key']}\n";
    }
}

// Real intake photo: uploads a rendered JPEG so reception_photos has a row and
// the server has the file (payload-only photos never reach the UI).
echo PHP_EOL . "--- Seeding reception photo ---" . PHP_EOL;
$photoEntry = ensureReceptionPhoto(
    $apiUrl,
    $token,
    $rcNo,
    'Seal broken on BH2 tube',
    '26-0418/04',
    'BH2-1.5',
    $photoTakenAt
);
// The app types photos as ReceptionPhoto[] — a bare assoc array would encode
// as a JSON object and break every consumer of payload_json.photos.
$photos = $photoEntry === [] ? [] : [$photoEntry];

$payload = [
    'rcNo'                 => $rcNo,
    'jobNo'                => $jobNo,
    'client'               => $client,
    'project'              => $project,
    'clientRef'            => $clientRef,
    'deliveredBy'          => $deliveredBy,
    'vehicleReg'           => $vehicleReg,
    'receivedAt'           => $receivedAt,
    'methodSet'            => 'BS 1377-2:2022',
    'receivedBy'           => $receivedBy,
    'storagePlan'          => $storagePlan,
    'status'               => $status,
    'samples'              => $samples,
    'transportChecks'      => $transportChecks,
    'customFields'         => $consignmentCustomFields,
    'transportCustomFields'=> $transportCustomFields,
    'photos'               => $photos,
    'cubeCastDate'         => $cubeCastDate,
];

$payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

// Create or update reception consignment
echo PHP_EOL . "--- Seeding reception_consignments ---" . PHP_EOL;
$consList = apiGet($apiUrl, $token, ['action' => 'list', 'table' => 'reception_consignments', 'limit' => 1000]);
$existingId = null;
foreach ($consList['data'] ?? [] as $c) {
    if ($c['rc_no'] === $rcNo) {
        $existingId = (int) $c['id'];
        break;
    }
}

$consignmentData = [
    'rc_no'       => $rcNo,
    'job_no'      => $jobNo,
    'status'      => $status,
    'payload_json'=> $payloadJson,
];

if ($existingId !== null) {
    echo "Consignment $rcNo already exists (id=$existingId). Updating.\n";
    $res = apiPostJson($apiUrl, $token, 'update', 'reception_consignments', $consignmentData, $existingId);
    echo "Consignment update: " . $res['raw'] . "\n";
} else {
    $res = apiPostJson($apiUrl, $token, 'create', 'reception_consignments', $consignmentData);
    echo "Consignment create: " . $res['raw'] . "\n";
    $existingId = (int) ($res['data']['data']['id'] ?? $res['data']['id'] ?? 0);
    if (!$existingId) { fwrite(STDERR, "FATAL: Could not create/find consignment\n"); exit(1); }
    echo "Created consignment $rcNo (id=$existingId)\n";
}

echo PHP_EOL . "RECEPTION SAMPLE SEEDED: YES" . PHP_EOL;
echo "RC No: $rcNo (id=$existingId)" . PHP_EOL;
echo "Job No: $jobNo" . PHP_EOL;
echo "Client: $client" . PHP_EOL;
echo "Project: $project" . PHP_EOL;
echo "Status: $status" . PHP_EOL;
echo "Samples: " . count($samples) . PHP_EOL;
echo "On hold: " . count(array_filter($samples, fn($s) => in_array($s['condition'], $holdConditions, true))) . PHP_EOL;
echo "Received: $receivedAt" . PHP_EOL;
echo "Cubes cast: $cubeCastDate" . PHP_EOL;
echo "Photo: " . ($photos !== [] ? $photos[0]['filePath'] : 'none') . PHP_EOL;
