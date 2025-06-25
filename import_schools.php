<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST');
header('Access-Control-Allow-Headers: Content-Type');

// Configurazione database
$host = 'localhost';
$dbname = 'school_tender_finder';  // Corretta in base al config.js
$username = 'root';
$password = '';

try {
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch(PDOException $e) {
    die(json_encode(['error' => 'Errore connessione database: ' . $e->getMessage()]));
}

// Gestione dei dati in arrivo
$jsonContent = null;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Caso 1: Upload di file
    if (isset($_FILES['file'])) {
        $uploadDir = __DIR__ . '/uploads/';
        $uploadFile = $uploadDir . basename($_FILES['file']['name']);
        
        // Verifica tipo file
        $fileType = strtolower(pathinfo($uploadFile, PATHINFO_EXTENSION));
        if ($fileType !== 'json') {
            die(json_encode(['error' => 'Solo file JSON sono supportati']));
        }
        
        if (move_uploaded_file($_FILES['file']['tmp_name'], $uploadFile)) {
            $jsonContent = file_get_contents($uploadFile);
            // Pulisce il file temporaneo
            unlink($uploadFile);
        } else {
            die(json_encode(['error' => 'Errore durante l\'upload del file']));
        }
    }
    // Caso 2: Dati JSON inviati direttamente via POST
    else {
        $input = file_get_contents('php://input');
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
        
        if (strpos($contentType, 'application/json') !== false) {
            $jsonContent = $input;
        } else {
            die(json_encode(['error' => 'Formato dati non supportato. Usa JSON o upload file.']));
        }
    }
} else {
    // Caso 3: Richiesta GET - restituisce informazioni di stato
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $jsonFiles = glob(__DIR__ . '/uploads/*.json');
        echo json_encode([
            'info' => 'Script di importazione scuole pronto',
            'method' => 'Invia dati via POST per importare',
            'files_found' => count($jsonFiles),
            'upload_dir' => __DIR__ . '/uploads/'
        ]);
        exit;
    }
    
    // Caso 4: Cerca file JSON nella cartella uploads per POST senza dati
    $jsonFiles = glob(__DIR__ . '/uploads/*.json');
    if (empty($jsonFiles)) {
        die(json_encode(['error' => 'Nessun file JSON trovato. Carica un file o usa l\'importazione automatica.']));
    }
    $jsonContent = file_get_contents($jsonFiles[0]);
}

// Leggi e processa il contenuto JSON
if ($jsonContent === false || empty($jsonContent)) {
    die(json_encode(['error' => 'Impossibile leggere i dati JSON']));
}

$data = json_decode($jsonContent, true);
if (json_last_error() !== JSON_ERROR_NONE) {
    die(json_encode(['error' => 'File JSON non valido: ' . json_last_error_msg()]));
}

$stats = [
    'processed' => 0,
    'inserted' => 0,
    'updated' => 0,
    'errors' => 0,
    'start_time' => microtime(true)
];

// Prepara statement per inserimento/aggiornamento
$sql = "INSERT INTO schools (
    codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia,
    indirizzo, cap, email, pec, codice_istituto_riferimento, 
    denominazione_istituto_riferimento, area_geografica, caratteristica_scuola,
    sede_direttivo, sede_omnicomprensivo, sede_scolastica, anno_scolastico, codice_comune
) VALUES (
    :codice_mecc, :denominazione, :regione, :provincia, :comune, :sito_web, :tipologia,
    :indirizzo, :cap, :email, :pec, :codice_istituto_riferimento,
    :denominazione_istituto_riferimento, :area_geografica, :caratteristica_scuola,
    :sede_direttivo, :sede_omnicomprensivo, :sede_scolastica, :anno_scolastico, :codice_comune
) ON DUPLICATE KEY UPDATE
    denominazione = VALUES(denominazione),
    regione = VALUES(regione),
    provincia = VALUES(provincia),
    comune = VALUES(comune),
    sito_web = VALUES(sito_web),
    tipologia = VALUES(tipologia),
    indirizzo = VALUES(indirizzo),
    cap = VALUES(cap),
    email = VALUES(email),
    pec = VALUES(pec),
    codice_istituto_riferimento = VALUES(codice_istituto_riferimento),
    denominazione_istituto_riferimento = VALUES(denominazione_istituto_riferimento),
    area_geografica = VALUES(area_geografica),
    caratteristica_scuola = VALUES(caratteristica_scuola),
    sede_direttivo = VALUES(sede_direttivo),
    sede_omnicomprensivo = VALUES(sede_omnicomprensivo),
    sede_scolastica = VALUES(sede_scolastica),
    anno_scolastico = VALUES(anno_scolastico),
    codice_comune = VALUES(codice_comune),
    updated_at = CURRENT_TIMESTAMP";

$stmt = $pdo->prepare($sql);

// Funzione per normalizzare i dati
function normalizeSchoolData($school) {
    // Gestisce sia formato RDF-JSON che formato semplice
    $normalized = [];
    
    // Funzione helper per estrarre valori
    function getValue($data, $key, $default = null) {
        if (isset($data[$key])) {
            if (is_array($data[$key]) && isset($data[$key][0]['value'])) {
                return $data[$key][0]['value']; // Formato RDF-JSON
            } elseif (is_array($data[$key])) {
                return $data[$key][0] ?? $default; // Array semplice
            } else {
                return $data[$key]; // Valore diretto
            }
        }
        return $default;
    }
    
    $normalized['codice_mecc'] = getValue($school, 'codiceMeccanografico') ?? getValue($school, 'codice_mecc');
    $normalized['denominazione'] = getValue($school, 'denominazioneScuola') ?? getValue($school, 'denominazione');
    $normalized['regione'] = getValue($school, 'regione');
    $normalized['provincia'] = getValue($school, 'provincia');
    $normalized['comune'] = getValue($school, 'comune');
    $normalized['sito_web'] = getValue($school, 'sitoWeb') ?? getValue($school, 'sito_web');
    $normalized['tipologia'] = getValue($school, 'tipoScuola') ?? getValue($school, 'tipologia');
    $normalized['indirizzo'] = getValue($school, 'indirizzo');
    $normalized['cap'] = getValue($school, 'cap');
    $normalized['email'] = getValue($school, 'email');
    $normalized['pec'] = getValue($school, 'pec');
    $normalized['codice_istituto_riferimento'] = getValue($school, 'codiceIstitutoRiferimento') ?? getValue($school, 'codice_istituto_riferimento');
    $normalized['denominazione_istituto_riferimento'] = getValue($school, 'denominazioneIstitutoRiferimento') ?? getValue($school, 'denominazione_istituto_riferimento');
    $normalized['area_geografica'] = getValue($school, 'areaGeografica') ?? getValue($school, 'area_geografica');
    $normalized['caratteristica_scuola'] = getValue($school, 'caratteristicaScuola') ?? getValue($school, 'caratteristica_scuola');
    $normalized['sede_direttivo'] = getValue($school, 'sedeDirettivo') ?? getValue($school, 'sede_direttivo') ?? 'NO';
    $normalized['sede_omnicomprensivo'] = getValue($school, 'sedeOmnicomprensivo') ?? getValue($school, 'sede_omnicomprensivo');
    $normalized['sede_scolastica'] = getValue($school, 'sedeScolastica') ?? getValue($school, 'sede_scolastica') ?? 'NO';
    $normalized['anno_scolastico'] = getValue($school, 'annoScolastico') ?? getValue($school, 'anno_scolastico');
    $normalized['codice_comune'] = getValue($school, 'codiceComune') ?? getValue($school, 'codice_comune');
    
    // Pulisce e valida i dati
    foreach ($normalized as $key => $value) {
        if (is_string($value)) {
            $value = trim($value);
            if ($value === '') {
                $value = null;
            }
        }
        $normalized[$key] = $value;
    }
    
    return $normalized;
}

// Processa i dati
try {
    $pdo->beginTransaction();
    
    // Determina la struttura dei dati
    $schools = [];
    if (isset($data['results']['bindings'])) {
        // Formato RDF-JSON
        $schools = $data['results']['bindings'];
    } elseif (isset($data['scuole'])) {
        // Formato con wrapper
        $schools = $data['scuole'];
    } elseif (is_array($data)) {
        // Array diretto di scuole
        $schools = $data;
    }
    
    foreach ($schools as $school) {
        $stats['processed']++;
        
        try {
            $normalized = normalizeSchoolData($school);
            
            // Verifica che abbiamo almeno il codice meccanografico
            if (empty($normalized['codice_mecc'])) {
                $stats['errors']++;
                continue;
            }
            
            // Esegue l'inserimento/aggiornamento
            $executed = $stmt->execute($normalized);
            
            if ($executed) {
                if ($stmt->rowCount() > 0) {
                    $stats['inserted']++;
                } else {
                    $stats['updated']++;
                }
            } else {
                $stats['errors']++;
            }
            
        } catch (Exception $e) {
            $stats['errors']++;
            error_log("Errore elaborazione scuola: " . $e->getMessage());
        }
        
        // Ogni 100 record, committa e inizia nuova transazione
        if ($stats['processed'] % 100 == 0) {
            $pdo->commit();
            $pdo->beginTransaction();
        }
    }
    
    $pdo->commit();
    
} catch (Exception $e) {
    $pdo->rollback();
    die(json_encode(['error' => 'Errore durante l\'importazione: ' . $e->getMessage()]));
}

$stats['end_time'] = microtime(true);
$stats['duration'] = round($stats['end_time'] - $stats['start_time'], 2);
$stats['success'] = $stats['inserted'] + $stats['updated'];

echo json_encode([
    'success' => true,
    'message' => "Importazione completata con successo",
    'stats' => $stats
]);
?>
