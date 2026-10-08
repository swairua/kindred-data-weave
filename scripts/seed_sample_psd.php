<?php
declare(strict_types=1);

/**
 * scripts/seed_sample_psd.php
 *
 * Inserts an idempotent "Particle Size Distribution" sample project + test result
 * row into the lab database so the PSD export flow can be exercised end-to-end
 * (PDF, Excel, CSV) against real DB persistence.
 *
 * Environment (with api.php-compatible defaults):
 *   DB_HOST     default 'localhost'  (use lab.wayrus.co.ke for the remote DB)
 *   DB_USER     default 'wayrusc1_labdatacraft'
 *   DB_PASS     default 'Sirgeorge.12'
 *   DB_NAME     default 'wayrusc1_labdatacraft'
 *   DB_PORT     default 3306
 *
 *   API_URL     default 'https://lab.wayrus.co.ke/api.php'  (used when --api flag is set)
 *   API_EMAIL   admin@cransfield.com
 *   API_PASS    Pass123
 *
 * Usage:
 *   php scripts/seed_sample_psd.php            # Direct MySQL insert
 *   php scripts/seed_sample_psd.php --api      # HTTPS API insert (works through firewall)
 */

/* ---------------------------------------------------------------------- */
/* Configuration                                                          */
/* ---------------------------------------------------------------------- */
$host = getenv('DB_HOST') ?: 'localhost';
$user = getenv('DB_USER') ?: 'wayrusc1_labdatacraft';
$pass = getenv('DB_PASS') ?: 'Sirgeorge.12';
$name = getenv('DB_NAME') ?: 'wayrusc1_labdatacraft';
$port = (int) (getenv('DB_PORT') ?: 3306);

$apiUrl = getenv('API_URL') ?: 'https://lab.wayrus.co.ke/api.php';
$apiEmail = getenv('API_EMAIL') ?: 'admin@cransfield.com';
$apiPass = getenv('API_PASS') ?: 'Pass123';
$useApi = in_array('--api', $argv ?? [], true);

echo '=== seed_sample_psd.php ===' . PHP_EOL;
echo "Mode: " . ($useApi ? 'HTTPS API' : 'Direct MySQL') . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed project / record data                                              */
/* ---------------------------------------------------------------------- */
$projectName       = 'KIRIAINI AHP';
$clientName        = 'AHP';
$projectDate       = '2026-06-11';
$labOrganization   = 'Cransfield Materials Testing Center';
$testKey           = 'grading';

// Record identity
$recordId    = 'record-kiriani-bh1';
$label       = 'BH1';
$sampleNo    = 'BH01';
$sampleFrom  = '0.0';
$sampleTo    = '25.0';
$sampledBy   = 'Cransfield';
$testedBy    = 'JILLO';
$dateSub     = '2026-06-09';
$dateTest    = '2026-06-11';
$sampleNotes = 'BS 1377-2:1990 9.2/9.3/9.4 & 9.5';

// Sample preparation + moisture
$initDryMass   = '328.0';
$washedDryMass = '176.4';
$moistWetMass  = '186.5';
$moistDryMass  = '149.0';

// Atterberg limits (drives USCS MH / AASHTO A-7-5)
$liquidLimit     = '70';
$plasticLimit    = '50';
$plasticityIndex = '20';

// Full 22-row sieve list matching the frontend SIEVE_SIZES
$fullSieveSizes = [
    '75', '63', '50', '37.5', '28', '20', '14', '10', '6.3', '5',
    '4.75 (No. 4)', '3.35', '2.36', '2.00 (No. 10)', '1.18', '0.6',
    '0.425', '0.3', '0.15', '0.075', '0.063', '<0.063',
];

$sieveMasses = [
    '63'            => '0',
    '50'            => '0',
    '37.5'          => '0',
    '28'            => '0',
    '20'            => '0',
    '14'            => '0',
    '10'            => '0',
    '6.3'           => '0',
    '5'             => '0',
    '4.75 (No. 4)'  => '40.22',
    '3.35'          => '0',
    '2.36'          => '0',
    '1.18'          => '0',
    '0.6'           => '0',
    '0.425'         => '0',
    '0.3'           => '0',
    '0.15'          => '9.35',
    '0.075'         => '0',
    '<0.063'        => '126.83',
];

// Hydrometer rows (BS 1377-2:1990 9.5 readings at successive times)
$hydrometerRows = [
    ['0.25', '24.5'], ['0.50', '23.5'], ['1', '22.6'], ['2', '21.5'], ['4', '20.2'],
    ['8', '18.9'], ['15', '17.8'], ['30', '16.9'], ['60', '16.1'], ['120', '15.5'],
    ['240', '15.0'], ['480', '14.7'], ['1440', '14.5'],
];

$hydrometerInputs = [
    'dryWeight'            => '176.4',
    'suspensionVolume'     => '1000',
    'sG'                   => '2.65',
    'temperature'          => '20',
    'hydrometerType'       => '152H',
    'zeroCorrection'       => '0',
    'meniscusCorrection'   => '0.1',
    'temperatureCorrection' => '',
    'kFactor'              => '',
];

/* ---------------------------------------------------------------------- */
/* Calculation helpers (ported from TypeScript frontend)                  */
/* ---------------------------------------------------------------------- */

/** Round to 2 decimal places (matches TS Number.toFixed(2) cast to number). */
function php_round2(float $value): float { return round($value, 2); }

/** Parse a string to float, return 0 if not finite. */
function php_numeric(string $value): float {
    $parsed = floatval($value);
    return is_finite($parsed) ? $parsed : 0.0;
}

function php_getALinePI(float $ll): float {
    return php_round2(0.73 * ($ll - 20));
}

function php_getULinePI(float $ll): float {
    return php_round2(0.9 * ($ll - 8));
}

/**
 * Port of calculateGrading from gradingCalculations.ts
 * @param array<int,array{sieveSize:string,weightRetained:string}> $rows
 * @return array{totalWeight:float,percentageRetained:array<float>,cumulativePassing:array<float|null>,d10:float|null,d30:float|null,d60:float|null,cu:float|null,cc:float|null}
 */
function php_calculateGrading(array $rows): array {
    $totalWeight = 0.0;
    foreach ($rows as $row) {
        $totalWeight += php_numeric($row['weightRetained']);
    }

    // percentageRetained
    $percentageRetained = [];
    foreach ($rows as $row) {
        $w = php_numeric($row['weightRetained']);
        $percentageRetained[] = $totalWeight > 0 ? ($w / $totalWeight) * 100 : 0;
    }

    // cumulativePassing
    $cumulativePassing = [];
    $retained = 0.0;
    foreach ($rows as $i => $row) {
        $retained += php_numeric($row['weightRetained']);
        $label = strtolower(trim($row['sieveSize']));
        $isPan = ($label === 'pan' || str_starts_with($label, '<'));
        if ($totalWeight > 0 && !$isPan) {
            $cumulativePassing[] = (1 - $retained / $totalWeight) * 100;
        } else {
            $cumulativePassing[] = null;
        }
    }

    // D-values via linear interpolation on log scale
    $points = [];
    foreach ($rows as $i => $row) {
        $size = php_numeric($row['sieveSize']);
        $passing = $cumulativePassing[$i];
        if ($size > 0 && $passing !== null && is_finite($passing)) {
            $points[] = ['size' => $size, 'passing' => $passing];
        }
    }
    // Sort by ascending size
    usort($points, fn($a, $b) => $a['size'] <=> $b['size']);

    $interpolate = function(float $target) use ($points): ?float {
        for ($i = 0; $i < count($points) - 1; $i++) {
            $first = $points[$i];
            $second = $points[$i + 1];
            if ($first['passing'] <= $target && $second['passing'] >= $target && $second['passing'] !== $first['passing']) {
                $ratio = ($target - $first['passing']) / ($second['passing'] - $first['passing']);
                return 10 ** (log10($first['size']) + $ratio * (log10($second['size']) - log10($first['size'])));
            }
        }
        return null;
    };

    $d10 = $interpolate(10);
    $d30 = $interpolate(30);
    $d60 = $interpolate(60);
    $cu = ($d10 !== null && $d60 !== null && $d10 > 0) ? $d60 / $d10 : null;
    $cc = ($d10 !== null && $d30 !== null && $d60 !== null && $d10 > 0 && $d60 > 0) ? ($d30 * $d30) / ($d10 * $d60) : null;

    return [
        'totalWeight'      => $totalWeight,
        'percentageRetained' => $percentageRetained,
        'cumulativePassing'  => $cumulativePassing,
        'd10' => $d10,
        'd30' => $d30,
        'd60' => $d60,
        'cu'  => $cu,
        'cc'  => $cc,
    ];
}

/** Port of calculateMoisture from gradingCalculations.ts */
function php_calculateMoisture(string $wet, string $dry): array {
    $wetN = php_numeric($wet);
    $dryN = php_numeric($dry);
    $waterWeight = ($wetN > 0 && $dryN > 0) ? $wetN - $dryN : null;
    $moistureContent = ($waterWeight !== null && $dryN > 0) ? ($waterWeight / $dryN) * 100 : null;
    return ['waterWeight' => $waterWeight, 'moistureContent' => $moistureContent];
}

const HYDROMETER_DEPTH_CALIBRATION = [
    '152H' => ['intercept' => 16.294964, 'slope' => 0.164],
    '151H' => ['intercept' => 16.294964, 'slope' => 0.2645],
];
const WATER_KINEMATIC_VISCOSITY = [
    [15, 1.141], [16, 1.112], [17, 1.083], [18, 1.056], [19, 1.03], [20, 1.005],
    [21, 0.981], [22, 0.958], [23, 0.934], [24, 0.913], [25, 0.893], [26, 0.874],
    [27, 0.855], [28, 0.836], [29, 0.818], [30, 0.801], [31, 0.784], [32, 0.768],
];
const DEFAULT_SPECIFIC_GRAVITY = 2.65;
const DEFAULT_SUSPENSION_VOLUME = 1000;
const DEFAULT_MENISCUS_CORRECTION = 0.1;
const DEFAULT_KINEMATIC_VISCOSITY = 1.005;
const STANDARD_GRAVITY = 9.80665;

function php_interpolateTable(array $table, float $value): float {
    if ($value <= $table[0][0]) return $table[0][1];
    $last = $table[count($table) - 1];
    if ($value >= $last[0]) return $last[1];
    for ($i = 0; $i < count($table) - 1; $i++) {
        [$lowKey, $lowValue] = $table[$i];
        [$highKey, $highValue] = $table[$i + 1];
        if ($value >= $lowKey && $value <= $highKey) {
            $ratio = ($value - $lowKey) / ($highKey - $lowKey);
            return $lowValue + $ratio * ($highValue - $lowValue);
        }
    }
    return $last[1];
}

/** Port of calculateHydrometer from gradingCalculations.ts */
function php_calculateHydrometer(array $rows, array $inputs, string $totalDryMass): array {
    $specificGravity = php_numeric($inputs['sG']);
    if ($specificGravity <= 1) $specificGravity = DEFAULT_SPECIFIC_GRAVITY;
    $suspensionVolume = php_numeric($inputs['suspensionVolume']);
    if ($suspensionVolume <= 0) $suspensionVolume = DEFAULT_SUSPENSION_VOLUME;
    $hydrometerMass = php_numeric($inputs['dryWeight']);
    $sampleMass = php_numeric($totalDryMass);
    if ($sampleMass == 0) $sampleMass = $hydrometerMass;
    $temperature = php_numeric($inputs['temperature']);
    $zeroCorrection = php_numeric($inputs['zeroCorrection']);
    $meniscusCorrection = isset($inputs['meniscusCorrection']) && $inputs['meniscusCorrection'] !== '' ? php_numeric($inputs['meniscusCorrection']) : DEFAULT_MENISCUS_CORRECTION;
    $manualTemperatureCorrection = isset($inputs['temperatureCorrection']) && $inputs['temperatureCorrection'] !== '' ? php_numeric($inputs['temperatureCorrection']) : null;
    $manualKFactor = isset($inputs['kFactor']) && $inputs['kFactor'] !== '' ? php_numeric($inputs['kFactor']) : null;
    $hydrometerType = trim($inputs['hydrometerType']);
    $calibration = HYDROMETER_DEPTH_CALIBRATION[$hydrometerType]
        ?? HYDROMETER_DEPTH_CALIBRATION['152H'];

    $temperatureCorrection = $manualTemperatureCorrection ?? 0;
    $compositeCorrection = $meniscusCorrection + $temperatureCorrection;

    $kinematicViscosity = ($temperature > 0)
        ? php_interpolateTable(WATER_KINEMATIC_VISCOSITY, $temperature)
        : DEFAULT_KINEMATIC_VISCOSITY;
    $stokesConstant = $manualKFactor
        ?? 1000 * sqrt((18 * $kinematicViscosity * 1e-6) / STANDARD_GRAVITY);

    $EMPTY_RESULT = [
        'time' => null, 'adjustedReading' => null, 'compositeCorrection' => 0,
        'correctedReading' => null, 'effectiveDepth' => null,
        'particleDiameter' => null, 'finesInSuspension' => null, 'finesByHydrometer' => null,
    ];

    $results = [];
    foreach ($rows as $row) {
        $time = php_numeric($row['time']);
        $actual = isset($row['actualHydrometer']) && $row['actualHydrometer'] !== '' ? php_numeric($row['actualHydrometer']) : null;
        if ($time == 0 || $actual === null) {
            $results[] = array_merge($EMPTY_RESULT, ['time' => $time, 'compositeCorrection' => $compositeCorrection]);
            continue;
        }
        $adjustedReading = $actual + $zeroCorrection;
        $correctedReading = $adjustedReading + $compositeCorrection;
        $effectiveDepth = $calibration['intercept'] - $calibration['slope'] * $correctedReading;
        $particleDiameter = null;
        if ($effectiveDepth > 0 && $specificGravity > 1 && $time > 0) {
            $particleDiameter = $stokesConstant * sqrt(($effectiveDepth / 100) / (($specificGravity - 1) * $time * 60));
        }
        $specificGravityFactor = $specificGravity > 1 ? $specificGravity / ($specificGravity - 1) : null;
        $finesInSuspension = null;
        $finesByHydrometer = null;
        if ($specificGravityFactor !== null && $hydrometerMass > 0 && $suspensionVolume > 0) {
            $finesInSuspension = (($correctedReading * $specificGravityFactor * $suspensionVolume) / ($hydrometerMass * 1000)) * 100;
        }
        if ($specificGravityFactor !== null && $sampleMass > 0 && $suspensionVolume > 0) {
            $finesByHydrometer = (($correctedReading * $specificGravityFactor * $suspensionVolume) / ($sampleMass * 1000)) * 100;
        }
        $results[] = [
            'time' => $time,
            'adjustedReading' => $adjustedReading,
            'compositeCorrection' => $compositeCorrection,
            'correctedReading' => $correctedReading,
            'effectiveDepth' => $effectiveDepth,
            'particleDiameter' => $particleDiameter,
            'finesInSuspension' => $finesInSuspension,
            'finesByHydrometer' => $finesByHydrometer,
        ];
    }

    return [
        'results' => $results,
        'specificGravity' => $specificGravity,
        'suspensionVolume' => $suspensionVolume,
        'hydrometerMass' => $hydrometerMass > 0 ? $hydrometerMass : null,
        'sampleMass' => $sampleMass > 0 ? $sampleMass : null,
        'compositeCorrection' => $compositeCorrection,
        'temperatureCorrection' => $temperatureCorrection,
        'stokesConstant' => $stokesConstant,
    ];
}

/* ---------------------------------------------------------------------- */
/* Soil classification (ported from soilClassification.ts + atterbergCalculations.ts) */
/* ---------------------------------------------------------------------- */

function php_classifySoilAASHTO(float $fines, ?float $ll, ?float $pi): string {
    if ($fines <= 35) {
        if ($pi === null || $pi <= 6) {
            return ($ll !== null && $ll <= 40) ? 'A-1-a' : 'A-1-b';
        }
        if ($pi <= 10) {
            return ($ll !== null && $ll <= 40) ? 'A-2-4' : 'A-2-5';
        }
        return ($ll !== null && $ll <= 40) ? 'A-2-6' : 'A-2-7';
    }
    if ($ll === null || $ll <= 40) {
        return ($pi !== null && $pi <= 10) ? 'A-4' : 'A-6';
    }
    if ($pi === null || $pi <= 10) return 'A-5';
    return ($pi <= ($ll - 30)) ? 'A-7-5' : 'A-7-6';
}

function php_calculateAashtoGroupIndex(float $passingNo200, float $ll, float $pi, ?string $aashtoGroup): ?int {
    $plasticityOnly = ($aashtoGroup === 'A-2-6' || $aashtoGroup === 'A-2-7');
    $liquidTerm = $plasticityOnly ? 0 : ($passingNo200 - 35) * (0.2 + 0.005 * ($ll - 40));
    $plasticityTerm = 0.01 * ($passingNo200 - 15) * ($pi - 10);
    return (int) floor(max($liquidTerm + $plasticityTerm, 0) + 0.5);
}

/**
 * Classify soil for fine-grained case (fines >= 50%).
 * Returns [uscsSymbol, aashtoGroup].
 */
function php_classifyFineGrained(?float $ll, ?float $pi): array {
    if ($pi === null || $pi <= 0 || $pi < 0.5) {
        return ['ML', 'A-4'];
    }
    if ($ll === null || $pi === null) {
        return ['CH/CL', 'A-7'];
    }

    $aLinePI = php_getALinePI($ll);
    $uLinePI = php_getULinePI($ll);

    if ($pi > $uLinePI) {
        return ['—', '—'];  // suspect
    }

    $isClay = $pi >= $aLinePI;
    $uscs = $isClay ? ($ll < 50 ? 'CL' : 'CH') : ($ll < 50 ? 'ML' : 'MH');
    $aashto = ($isClay ? ($ll < 50 ? 'A-6' : 'A-7-6') : ($ll < 50 ? 'A-4 or A-5' : 'A-7-5'));

    // For AASHTO, use the canonical classifier
    $aashtoGroup = php_classifySoilAASHTO(71.91, $ll, $pi); // fines > 50, so use the >35 path

    return [$uscs, $aashtoGroup];
}

/* ---------------------------------------------------------------------- */
/* Build the PSD payload                                                    */
/* ---------------------------------------------------------------------- */

// Build sieve rows matching the frontend 22-size format
$sieveRowsFormatted = [];
foreach ($fullSieveSizes as $size) {
    $mass = $sieveMasses[$size] ?? '0';
    $sieveRowsFormatted[] = ['sieveSize' => $size, 'weightRetained' => $mass];
}

// Format hydrometer rows for the payload (all input fields included)
$hydrometerRowsFormatted = [];
foreach ($hydrometerRows as $hr) {
    $hydrometerRowsFormatted[] = [
        'time'                => $hr[0],
        'actualHydrometer'    => $hr[1],
        'adjustedHydrometer'  => 'auto',
        'compositeCorrection' => 'auto',
        'correctedHydrometer' => 'auto',
        'effectiveDepth'      => 'auto',
        'particleDiameter'    => 'auto',
        'finesInSuspension'   => 'auto',
        'finesByHydrometer'   => 'auto',
    ];
}

// Compute grading calculations
$calculations = php_calculateGrading($sieveRowsFormatted);

// Compute moisture
$moisture = php_calculateMoisture($moistWetMass, $moistDryMass);

// Compute hydrometer (totalDryMass = initialDryMass)
$hydrometer = php_calculateHydrometer($hydrometerRowsFormatted, $hydrometerInputs, $initDryMass);

// Classification values
$gravelPassing = null;
$finesPassing  = null;
foreach ($sieveRowsFormatted as $i => $row) {
    $label = strtolower(trim($row['sieveSize']));
    if (Number_parseFloat($row['sieveSize']) != 0 && $row['sieveSize'] == '4.75 (No. 4)') {
        $gravelPassing = $calculations['cumulativePassing'][$i];
    }
    if (Number_parseFloat($row['sieveSize']) != 0 && $label === '0.075') {
        $finesPassing = $calculations['cumulativePassing'][$i];
    }
}
// Fallback: find by label
if ($gravelPassing === null) {
    foreach ($sieveRowsFormatted as $i => $row) {
        if (str_contains($row['sieveSize'], '4.75') || str_contains($row['sieveSize'], 'No. 4')) {
            $gravelPassing = $calculations['cumulativePassing'][$i];
        }
    }
}
if ($finesPassing === null) {
    foreach ($sieveRowsFormatted as $i => $row) {
        if ($row['sieveSize'] === '0.075') {
            $finesPassing = $calculations['cumulativePassing'][$i];
        }
    }
}

$gravel = ($gravelPassing !== null) ? 100 - $gravelPassing : null;
$sand   = ($gravelPassing !== null && $finesPassing !== null) ? $gravelPassing - $finesPassing : null;
$fines  = $finesPassing;

$llNum = php_numeric($liquidLimit);
$plNum = php_numeric($plasticLimit);
$piNum = php_numeric($plasticityIndex);

if ($fines !== null && $fines >= 50) {
    [$uscsSymbol, $aashtoGroup] = php_classifyFineGrained($llNum, $piNum);
} else {
    // Coarse-grained path (not expected for this sample, but handle gracefully)
    $uscsSymbol = 'GP/GW';
    $aashtoGroup = 'A-1-a';
}

$groupIndex = null;
if ($fines !== null && $llNum > 0 && $piNum > 0) {
    $groupIndex = php_calculateAashtoGroupIndex($fines, $llNum, $piNum, $aashtoGroup);
}

$fineMass = php_numeric($initDryMass) - php_numeric($washedDryMass);
$fineMass = max($fineMass, 0);
$finesPercentage = php_numeric($initDryMass) > 0 ? ($fineMass / php_numeric($initDryMass)) * 100 : null;

// Classification section
$classification = [
    'uscs'                   => 'auto',
    'aashtoGroup'            => 'auto',
    'aashtoRating'           => 'auto',
    'liquidLimit'            => $liquidLimit,
    'plasticLimit'           => $plasticLimit,
    'plasticityIndex'        => 'auto',
    'nonPlastic'             => false,
    'suspectedOrganic'       => false,
    'ovenDriedLiquidLimit'   => 'Required for OL/OH',
];

// Build the grading record
$record = [
    'label'              => $label,
    'sampleNumber'       => $sampleNo,
    'sampleDepthFrom'    => $sampleFrom,
    'sampleDepthTo'      => $sampleTo,
    'sampledSubmittedBy' => $sampledBy,
    'testedBy'           => $testedBy,
    'dateSubmitted'      => $dateSub,
    'dateTested'         => $dateTest,
    'sampleNotes'        => $sampleNotes,
    'samplePreparation'  => ['initialDryMass' => $initDryMass, 'washedOvenDryMass' => $washedDryMass],
    'moisture'           => ['wetMass' => $moistWetMass, 'dryMass' => $moistDryMass],
    'classification'     => $classification,
    'sieveRows'          => $sieveRowsFormatted,
    'hydrometerRows'     => $hydrometerRowsFormatted,
    'hydrometerInputs'   => $hydrometerInputs,
];

// Build calculations object
$calcObj = [
    ...$calculations,
    ...$moisture,
    ...$hydrometer,
    'fineMass'              => $fineMass,
    'finesPercentage'       => $finesPercentage,
    'gravelPercentage'      => $gravel,
    'sandPercentage'        => $sand,
    'sieveFinesPercentage'  => $fines,
    'plasticityIndex'       => $piNum,
    'groupIndex'            => $groupIndex,
    'uscsSymbol'            => $uscsSymbol,
    'aashtoGroup'           => $aashtoGroup,
];

$payload = [
    'version'    => '1.0',
    'project'    => [
        'title'      => $projectName,
        'clientName' => $clientName,
        'date'       => $projectDate,
        'records'    => [$record],
    ],
    'calculations' => $calcObj,
];

$payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

// key_results_json
$formatValue = function(?float $v, int $decimals = 2): string {
    return $v === null ? 'auto' : number_format($v, $decimals, '.', '');
};
$keyResults = [
    ['label' => 'D10',  'value' => $formatValue($calculations['d10'], 3)],
    ['label' => 'D30',  'value' => $formatValue($calculations['d30'], 3)],
    ['label' => 'D60',  'value' => $formatValue($calculations['d60'], 3)],
    ['label' => 'Cu',   'value' => $formatValue($calculations['cu'])],
    ['label' => 'Cc',   'value' => $formatValue($calculations['cc'])],
];
if ($uscsSymbol !== null) $keyResults[] = ['label' => 'USCS',  'value' => $uscsSymbol];
if ($aashtoGroup !== null) $keyResults[] = ['label' => 'AASHTO', 'value' => $aashtoGroup];
if ($groupIndex !== null) $keyResults[] = ['label' => 'Group Index', 'value' => (string) $groupIndex];
$keyResultsJson = json_encode($keyResults, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

// data_points = number of sieve rows with non-empty weight
$dataPoints = 0;
foreach ($sieveRowsFormatted as $row) {
    if (trim($row['weightRetained']) !== '') {
        $dataPoints++;
    }
}

$projectDate = $projectDate;
echo "Project: {$projectName}" . PHP_EOL;
echo "Sieve total mass: {$calculations['totalWeight']}g" . PHP_EOL;
echo "Fines %: {$fines}%" . PHP_EOL;
echo "USCS: {$uscsSymbol}, AASHTO: {$aashtoGroup}, GI: {$groupIndex}" . PHP_EOL;
echo "Data points: {$dataPoints}" . PHP_EOL;

/* ---------------------------------------------------------------------- */
/* Seed via direct MySQL or HTTPS API                                     */
/* ---------------------------------------------------------------------- */

$seeded = false;

if ($useApi) {
    /* -------------------- HTTPS API mode -------------------- */
    echo PHP_EOL . "--- Seeding via HTTPS API ---" . PHP_EOL;

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);

    // Login
    $loginPayload = http_build_query(['action' => 'login', 'email' => $apiEmail, 'password' => $apiPass]);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $loginPayload);
    $loginOut = curl_exec($ch);
    $loginData = json_decode($loginOut, true);
    $token = $loginData['session_token'] ?? null;
    if (!$token) {
        fwrite(STDERR, 'FATAL: API login failed: ' . $loginOut . PHP_EOL);
        exit(1);
    }
    echo "API login OK (token: {$token})" . PHP_EOL;
    curl_close($ch);

    // 1. Find or create the project
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);

    // First check if project already exists
    $projectUrl = $apiUrl . '?' . http_build_query([
        'action' => 'list',
        'table' => 'projects',
        'limit' => 1000,
    ]);
    curl_setopt($ch, CURLOPT_URL, $projectUrl);
    $projList = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $existingProjectId = null;
    foreach ($projList['data'] ?? [] as $p) {
        if ($p['name'] === $projectName && ($p['test_type'] ?? '') === $testKey) {
            $existingProjectId = $p['id'];
            break;
        }
    }

    $projectId = null;
    if ($existingProjectId !== null) {
        echo "Project '{$projectName}' already exists (id={$existingProjectId}). Updating." . PHP_EOL;
        $projectId = $existingProjectId;
        // Update the project
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $updateData = json_encode([
            'action' => 'update',
            'table' => 'projects',
            'id' => $existingProjectId,
            'data' => [
                'name' => $projectName,
                'client_name' => $clientName,
                'project_date' => $projectDate,
                'test_type' => $testKey,
            ],
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $updateData);
        $updOut = curl_exec($ch);
        echo "Project update: {$updOut}" . PHP_EOL;
        curl_close($ch);
    } else {
        // Create the project
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $createData = json_encode([
            'action' => 'create',
            'table' => 'projects',
            'data' => [
                'name' => $projectName,
                'client_name' => $clientName,
                'project_date' => $projectDate,
                'test_type' => $testKey,
            ],
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $createData);
        $projOut = curl_exec($ch);
        $projData = json_decode($projOut, true);
        echo "Project create: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $projOut . PHP_EOL;
        $projectId = $projData['id'] ?? ($projData['data']['id'] ?? null);
        curl_close($ch);
    }

    if ($projectId === null) {
        fwrite(STDERR, 'FATAL: Could not create/find project.' . PHP_EOL);
        exit(1);
    }
    echo "Using project id={$projectId}" . PHP_EOL;

    // 2. Find or create the test_result
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_HTTPGET, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Session-Token: ' . $token]);
    $trUrl = $apiUrl . '?' . http_build_query([
        'action' => 'list',
        'table' => 'test_results',
        'limit' => 1000,
    ]);
    curl_setopt($ch, CURLOPT_URL, $trUrl);
    $trList = json_decode(curl_exec($ch), true);
    curl_close($ch);

    $existingResultId = null;
    foreach ($trList['data'] ?? [] as $r) {
        if (Number_isint($r['project_id']) && $r['project_id'] == $projectId && ($r['test_key'] ?? '') === $testKey) {
            $existingResultId = $r['id'];
            break;
        }
    }

    $testResultData = [
        'project_id'    => $projectId,
        'test_key'      => $testKey,
        'name'          => 'Particle Size Distribution',
        'category'      => 'soil',
        'status'        => 'completed',
        'data_points'   => $dataPoints,
        'key_results_json'  => $keyResultsJson,
        'payload_json'  => $payloadJson,
    ];

    if ($existingResultId !== null) {
        // Update existing test_result
        echo PHP_EOL . "Test result already exists (id={$existingResultId}). Updating." . PHP_EOL;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $updateData = json_encode([
            'action' => 'update',
            'table' => 'test_results',
            'id' => $existingResultId,
            'data' => $testResultData,
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $updateData);
        $resOut = curl_exec($ch);
        echo "Test result update: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $resOut . PHP_EOL;
        curl_close($ch);
        $seeded = true;
    } else {
        // Create new test_result
        echo PHP_EOL . "Creating new test_result..." . PHP_EOL;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Content-Type: application/json',
            'X-Session-Token: ' . $token,
        ]);
        $createData = json_encode([
            'action' => 'create',
            'table' => 'test_results',
            'data' => $testResultData,
        ]);
        curl_setopt($ch, CURLOPT_URL, $apiUrl);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $createData);
        $resOut = curl_exec($ch);
        $resData = json_decode($resOut, true);
        echo "Test result create: HTTP " . curl_getinfo($ch, CURLINFO_HTTP_CODE) . PHP_EOL;
        echo $resOut . PHP_EOL;
        if (isset($resData['id']) || isset($resData['data']['id'])) {
            $seeded = true;
        }
        curl_close($ch);
    }
} else {
    /* -------------------- Direct MySQL mode -------------------- */
    echo PHP_EOL . "--- Seeding via Direct MySQL ---" . PHP_EOL;

    // Check if project already exists
    $stmt = $conn->prepare("SELECT id FROM projects WHERE name = ? AND test_type = ? LIMIT 1");
    $stmt->bind_param('ss', $projectName, $testKey);
    $stmt->execute();
    $stmt->bind_result($projectId);
    if ($stmt->fetch()) {
        $stmt->close();
        echo "Project '{$projectName}' already exists (id={$projectId}). Updating." . PHP_EOL;
        $upd = $conn->prepare("UPDATE projects SET client_name = ?, project_date = ?, test_type = ? WHERE id = ?");
        $upd->bind_param('sssi', $clientName, $projectDate, $testKey, $projectId);
        $upd->execute();
        $upd->close();
    } else {
        $stmt->close();
        $ins = $conn->prepare("INSERT INTO projects (user_id, name, client_name, project_date, test_type) VALUES (1, ?, ?, ?, ?)");
        $ins->bind_param('ssss', $projectName, $clientName, $projectDate, $testKey);
        $ins->execute();
        $projectId = $conn->insert_id;
        $ins->close();
        echo "Created project '{$projectName}' (id={$projectId})" . PHP_EOL;
    }

    // Check if test_result already exists for this project+test_key
    $stmt = $conn->prepare("SELECT id FROM test_results WHERE project_id = ? AND test_key = ? LIMIT 1");
    $stmt->bind_param('is', $projectId, $testKey);
    $stmt->execute();
    $stmt->bind_result($existingResultId);
    if ($stmt->fetch()) {
        $stmt->close();
        echo "Test result exists (id={$existingResultId}). Updating." . PHP_EOL;
        $upd = $conn->prepare("UPDATE test_results SET name = ?, category = ?, status = ?, data_points = ?, key_results_json = ?, payload_json = ?, updated_at = NOW() WHERE id = ?");
        $upd->bind_param('ssisissi', 'Particle Size Distribution', 'soil', 'completed', $dataPoints, $keyResultsJson, $payloadJson, $existingResultId);
        $upd->execute();
        $upd->close();
        $seeded = true;
    } else {
        $stmt->close();
        $ins = $conn->prepare("INSERT INTO test_results (user_id, project_id, test_key, name, category, status, data_points, key_results_json, payload_json) VALUES (1, ?, ?, 'Particle Size Distribution', 'soil', 'completed', ?, ?, ?)");
        $ins->bind_param('isissss', $projectId, $testKey, $dataPoints, $keyResultsJson, $payloadJson);
        $ins->execute();
        $newId = $conn->insert_id;
        $ins->close();
        echo "Created test_result (id={$newId})" . PHP_EOL;
        $seeded = true;
    }
}

echo PHP_EOL . 'PSD SAMPLE SEEDED: ' . ($seeded ? 'YES' : 'NO') . PHP_EOL;

if (!$useApi) {
    $conn->close();
}

function Number_parseFloat(string $s): float {
    $f = floatval($s);
    return is_finite($f) ? $f : 0.0;
}

function Number_isint($v): bool {
    return is_int($v) || (is_string($v) && ctype_digit($v));
}

exit($seeded ? 0 : 1);
