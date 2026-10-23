<?php
/**
 * Optional local database overrides for api.php.
 *
 * Copy this file to config/database.local.php (which is git-ignored) and edit
 * that copy. api.php reads "host", "port", "user", "pass" and "name" from here
 * when the matching environment variable is not set.
 *
 * Resolution order for every setting:
 *   1. environment variable  (DB_HOST / DB_PORT / DB_USER / DB_PASS / DB_NAME)
 *   2. this file
 *   3. the built-in default
 *
 * The port default is host-aware: 3308 for a local server (the XAMPP MariaDB
 * service on this machine) and 3306 for a remote one (lab.wayrus.co.ke).
 *
 * DO NOT COMMIT real credentials. config/database.local.php is ignored by git.
 */

return [
    // 'host' => 'localhost',
    // 'port' => 3308,
    // 'user' => 'wayrusc1_labdatacraft',
    // 'pass' => '...',
    // 'name' => 'wayrusc1_labdatacraft',
];
