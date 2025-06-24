const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('fast-csv');
const mysql = require('mysql2/promise');
const dbConfig = require('./config');

// URL aggiornati per dataset 2025/2026 (da verificare annualmente)
const DATASET_URL_JSON = 'https://dati.istruzione.it/opendata/opendata/catalogo/elements/GET/DOCUMENTI/20252026/SCUANAGRAFESTAT20252620250901.json';
const DATASET_URL_CSV = 'https://dati.istruzione.it/opendata/opendata/catalogo/elements/GET/DOCUMENTI/20252026/SCUANAGRAFESTAT20252620250901.csv';

/**
 * Normalizza e pulisce i dati di una scuola
 * @param {Object} schoolData - Dati grezzi della scuola
 * @returns {Object} - Dati normalizzati
 */
function normalizeSchoolData(schoolData) {
  return {
    // Campi obbligatori
    codice_mecc: (schoolData.codice_mecc || '').toString().trim().substring(0, 12),
    denominazione: (schoolData.denominazione || '').toString().trim().substring(0, 255),
    
    // Campi geografici
    regione: (schoolData.regione || '').toString().trim().substring(0, 100),
    provincia: (schoolData.provincia || '').toString().trim().substring(0, 100),
    comune: (schoolData.comune || '').toString().trim().substring(0, 100),
    area_geografica: (schoolData.area_geografica || '').toString().trim().substring(0, 50),
    codice_comune: (schoolData.codice_comune || '').toString().trim().substring(0, 10),
    
    // Contatti
    indirizzo: (schoolData.indirizzo || '').toString().trim().substring(0, 255),
    cap: (schoolData.cap || '').toString().trim().substring(0, 5),
    email: (schoolData.email || '').toString().trim().substring(0, 100),
    pec: (schoolData.pec || '').toString().trim().substring(0, 100),
    sito_web: (schoolData.sito_web || '').toString().trim().substring(0, 255),
    
    // Tipologia e caratteristiche
    tipologia: (schoolData.tipologia || '').toString().trim().substring(0, 100),
    caratteristica_scuola: (schoolData.caratteristica_scuola || '').toString().trim().substring(0, 100),
    
    // Istituto di riferimento
    codice_istituto_riferimento: (schoolData.codice_istituto_riferimento || '').toString().trim().substring(0, 12),
    denominazione_istituto_riferimento: (schoolData.denominazione_istituto_riferimento || '').toString().trim().substring(0, 255),
    
    // Flag e indicatori
    sede_direttivo: ['SI', 'NO'].includes(schoolData.sede_direttivo) ? schoolData.sede_direttivo : 'NO',
    sede_omnicomprensivo: (schoolData.sede_omnicomprensivo || '').toString().trim().substring(0, 50),
    sede_scolastica: ['SI', 'NO'].includes(schoolData.sede_scolastica) ? schoolData.sede_scolastica : 'NO',
    anno_scolastico: (schoolData.anno_scolastico || '').toString().trim().substring(0, 10)
  };
}


async function getDbConnection() {
  return await mysql.createConnection(dbConfig);
}

async function downloadFile(url, outputPath) {
  console.log(`Downloading dataset from ${url}...`);
  try {
    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream'
    });
    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

async function processJsonFile(filePath, connection) {
  console.log(`🔄 Processing JSON file: ${filePath}`);
  
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const jsonData = JSON.parse(fileContent);
    
    // Il file JSON usa formato RDF con @graph contenente array di scuole
    let schools = [];
    
    if (jsonData['@graph'] && Array.isArray(jsonData['@graph'])) {
      schools = jsonData['@graph'];
      console.log(`📊 Found ${schools.length} schools in @graph array`);
    } else if (Array.isArray(jsonData)) {
      schools = jsonData;
      console.log(`📊 Found ${schools.length} schools in root array`);
    } else {
      throw new Error('Invalid JSON structure: expected @graph array or root array');
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const batchSize = 100; // Process in batches for better performance
    
    // Prepara query ottimizzata con tutti i campi
    const insertQuery = `
      INSERT INTO schools (
        codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia,
        indirizzo, cap, email, pec, codice_istituto_riferimento, 
        denominazione_istituto_riferimento, area_geografica, caratteristica_scuola,
        sede_direttivo, sede_omnicomprensivo, sede_scolastica, anno_scolastico, codice_comune
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
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
        updated_at = CURRENT_TIMESTAMP
    `;

    console.log('🚀 Starting batch processing...');

    for (let i = 0; i < schools.length; i += batchSize) {
      const batch = schools.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(schools.length/batchSize)} (${batch.length} schools)`);
      
      for (const school of batch) {
        try {
          // Estrai dati dalla struttura RDF-JSON con namespace miur:
          const rawData = {
            codice_mecc: school['miur:CODICESCUOLA'],
            denominazione: school['miur:DENOMINAZIONESCUOLA'],
            regione: school['miur:REGIONE'],
            provincia: school['miur:PROVINCIA'],
            comune: school['miur:DESCRIZIONECOMUNE'],
            sito_web: school['miur:SITOWEBSCUOLA'],
            tipologia: school['miur:DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA'],
            indirizzo: school['miur:INDIRIZZOSCUOLA'],
            cap: school['miur:CAPSCUOLA'],
            email: school['miur:INDIRIZZOEMAILSCUOLA'],
            pec: school['miur:INDIRIZZOPECSCUOLA'],
            codice_istituto_riferimento: school['miur:CODICEISTITUTORIFERIMENTO'],
            denominazione_istituto_riferimento: school['miur:DENOMINAZIONEISTITUTORIFERIMENTO'],
            area_geografica: school['miur:AREAGEOGRAFICA'],
            caratteristica_scuola: school['miur:DESCRIZIONECARATTERISTICASCUOLA'],
            sede_direttivo: school['miur:INDICAZIONESEDEDIRETTIVO'],
            sede_omnicomprensivo: school['miur:INDICAZIONESEDEOMNICOMPRENSIVO'],
            sede_scolastica: school['miur:SEDESCOLASTICA'],
            anno_scolastico: school['miur:ANNOSCOLASTICO'] ? school['miur:ANNOSCOLASTICO'].toString() : null,
            codice_comune: school['miur:CODICECOMUNESCUOLA']
          };

          // Normalizza e valida i dati
          const schoolData = normalizeSchoolData(rawData);

          // Validazione campi obbligatori
          if (!schoolData.codice_mecc || !schoolData.denominazione) {
            console.warn(`⚠️  Skipping school: missing required fields (codice: ${schoolData.codice_mecc}, name: ${schoolData.denominazione})`);
            skipped++;
            continue;
          }

          // Converte CAP numerico in stringa se necessario
          if (schoolData.cap && !isNaN(schoolData.cap)) {
            schoolData.cap = schoolData.cap.toString().padStart(5, '0');
          }

          // Inserisci/aggiorna nel database
          await connection.execute(insertQuery, [
            schoolData.codice_mecc,
            schoolData.denominazione,
            schoolData.regione,
            schoolData.provincia,
            schoolData.comune,
            schoolData.sito_web,
            schoolData.tipologia,
            schoolData.indirizzo,
            schoolData.cap,
            schoolData.email,
            schoolData.pec,
            schoolData.codice_istituto_riferimento,
            schoolData.denominazione_istituto_riferimento,
            schoolData.area_geografica,
            schoolData.caratteristica_scuola,
            schoolData.sede_direttivo,
            schoolData.sede_omnicomprensivo,
            schoolData.sede_scolastica,
            schoolData.anno_scolastico,
            schoolData.codice_comune
          ]);

          processed++;

        } catch (error) {
          console.error(`❌ Error processing school ${school['miur:CODICESCUOLA'] || 'unknown'}:`, error.message);
          errors++;
        }
      }
    }

    // Statistiche finali
    console.log('📊 Import completed:');
    console.log(`   ✅ Processed: ${processed} schools`);
    console.log(`   ⚠️  Skipped: ${skipped} schools`);
    console.log(`   ❌ Errors: ${errors} schools`);
    console.log(`   📈 Success rate: ${((processed / (processed + skipped + errors)) * 100).toFixed(1)}%`);

    return { processed, skipped, errors };

  } catch (error) {
    console.error('💥 Error processing JSON file:', error.message);
    throw error;
  }
}

async function processCsvFile(filePath, connection) {
  console.log(`🔄 Processing CSV file: ${filePath}`);
  
  return new Promise((resolve, reject) => {
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    const rows = [];
    
    // Prepara query ottimizzata
    const insertQuery = `
      INSERT INTO schools (
        codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia,
        indirizzo, cap, email, pec, codice_istituto_riferimento, 
        denominazione_istituto_riferimento, area_geografica, caratteristica_scuola,
        sede_direttivo, sede_omnicomprensivo, sede_scolastica, anno_scolastico, codice_comune
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
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
        updated_at = CURRENT_TIMESTAMP
    `;

    fs.createReadStream(filePath)
      .pipe(csv.parse({ 
        headers: true, 
        delimiter: ';',
        skipEmptyLines: true,
        trim: true
      }))
      .on('error', error => {
        console.error('💥 CSV parsing error:', error);
        reject(error);
      })
      .on('data', (row) => {
        rows.push(row);
      })
      .on('end', async () => {
        console.log(`📊 Found ${rows.length} rows in CSV file`);
        console.log('🚀 Starting CSV processing...');

        const batchSize = 100;
        
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          console.log(`📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(rows.length/batchSize)} (${batch.length} rows)`);
          
          for (const row of batch) {
            try {
              // Mappa i campi del CSV (assumendo header simili al JSON ma senza namespace)
              const rawData = {
                codice_mecc: row.CODICESCUOLA || row.codice_scuola,
                denominazione: row.DENOMINAZIONESCUOLA || row.denominazione_scuola,
                regione: row.REGIONE || row.regione,
                provincia: row.PROVINCIA || row.provincia,
                comune: row.DESCRIZIONECOMUNE || row.comune,
                sito_web: row.SITOWEBSCUOLA || row.sito_web_scuola,
                tipologia: row.DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA || row.tipologia,
                indirizzo: row.INDIRIZZOSCUOLA || row.indirizzo_scuola,
                cap: row.CAPSCUOLA || row.cap_scuola,
                email: row.INDIRIZZOEMAILSCUOLA || row.email_scuola,
                pec: row.INDIRIZZOPECSCUOLA || row.pec_scuola,
                codice_istituto_riferimento: row.CODICEISTITUTORIFERIMENTO || row.codice_istituto_riferimento,
                denominazione_istituto_riferimento: row.DENOMINAZIONEISTITUTORIFERIMENTO || row.denominazione_istituto_riferimento,
                area_geografica: row.AREAGEOGRAFICA || row.area_geografica,
                caratteristica_scuola: row.DESCRIZIONECARATTERISTICASCUOLA || row.caratteristica_scuola,
                sede_direttivo: row.INDICAZIONESEDEDIRETTIVO || row.sede_direttivo,
                sede_omnicomprensivo: row.INDICAZIONESEDEOMNICOMPRENSIVO || row.sede_omnicomprensivo,
                sede_scolastica: row.SEDESCOLASTICA || row.sede_scolastica,
                anno_scolastico: row.ANNOSCOLASTICO || row.anno_scolastico,
                codice_comune: row.CODICECOMUNESCUOLA || row.codice_comune_scuola
              };

              // Normalizza i dati
              const schoolData = normalizeSchoolData(rawData);

              // Validazione campi obbligatori
              if (!schoolData.codice_mecc || !schoolData.denominazione) {
                console.warn(`⚠️  Skipping CSV row: missing required fields (codice: ${schoolData.codice_mecc}, name: ${schoolData.denominazione})`);
                skipped++;
                continue;
              }

              // Converte CAP numerico in stringa se necessario
              if (schoolData.cap && !isNaN(schoolData.cap)) {
                schoolData.cap = schoolData.cap.toString().padStart(5, '0');
              }

              // Inserisci nel database
              await connection.execute(insertQuery, [
                schoolData.codice_mecc,
                schoolData.denominazione,
                schoolData.regione,
                schoolData.provincia,
                schoolData.comune,
                schoolData.sito_web,
                schoolData.tipologia,
                schoolData.indirizzo,
                schoolData.cap,
                schoolData.email,
                schoolData.pec,
                schoolData.codice_istituto_riferimento,
                schoolData.denominazione_istituto_riferimento,
                schoolData.area_geografica,
                schoolData.caratteristica_scuola,
                schoolData.sede_direttivo,
                schoolData.sede_omnicomprensivo,
                schoolData.sede_scolastica,
                schoolData.anno_scolastico,
                schoolData.codice_comune
              ]);

              processed++;

            } catch (error) {
              console.error(`❌ Error processing CSV row ${row.CODICESCUOLA || 'unknown'}:`, error.message);
              errors++;
            }
          }
        }

        // Statistiche finali
        console.log('📊 CSV Import completed:');
        console.log(`   ✅ Processed: ${processed} schools`);
        console.log(`   ⚠️  Skipped: ${skipped} schools`);
        console.log(`   ❌ Errors: ${errors} schools`);
        console.log(`   📈 Success rate: ${((processed / (processed + skipped + errors)) * 100).toFixed(1)}%`);

        resolve({ processed, skipped, errors });
      });
  });
}


async function importSchools(sourceType = 'auto', filePath = null) {
  let connection;
  const startTime = Date.now();
  
  try {
    console.log('🚀 Starting school data import process...');
    connection = await getDbConnection();
    console.log('✅ Successfully connected to MySQL for school import.');

    let downloadedFilePath = filePath;
    let isJson = false;
    let shouldCleanup = false;

    if (sourceType === 'auto') {
      // Tentativo download automatico: prima JSON, poi CSV come fallback
      const tempJsonPath = path.join(__dirname, 'temp_schools_dataset.json');
      const tempCsvPath = path.join(__dirname, 'temp_schools_dataset.csv');

      try {
        console.log('📥 Attempting to download JSON dataset...');
        await downloadFile(DATASET_URL_JSON, tempJsonPath);
        downloadedFilePath = tempJsonPath;
        isJson = true;
        shouldCleanup = true;
        console.log('✅ JSON dataset downloaded successfully.');
      } catch (jsonError) {
        console.warn(`⚠️  Failed to download JSON dataset: ${jsonError.message}`);
        console.log('📥 Attempting to download CSV dataset as fallback...');
        
        try {
          await downloadFile(DATASET_URL_CSV, tempCsvPath);
          downloadedFilePath = tempCsvPath;
          isJson = false;
          shouldCleanup = true;
          console.log('✅ CSV dataset downloaded successfully.');
        } catch (csvError) {
          console.error(`❌ Failed to download CSV dataset: ${csvError.message}`);
          throw new Error('Failed to download dataset automatically. Please check URLs or try manual import.');
        }
      }
    } else if (sourceType === 'upload' && filePath) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Uploaded file not found: ${filePath}`);
      }
      downloadedFilePath = filePath;
      isJson = path.extname(filePath).toLowerCase() === '.json';
      console.log(`📁 Using uploaded file: ${filePath} (${isJson ? 'JSON' : 'CSV'})`);
    } else {
      throw new Error('Invalid import configuration: sourceType must be "auto" or "upload" with valid filePath.');
    }

    // Verifica dimensione del file
    const fileStats = fs.statSync(downloadedFilePath);
    const fileSizeMB = (fileStats.size / (1024 * 1024)).toFixed(2);
    console.log(`📊 File size: ${fileSizeMB} MB`);

    // Processa il file
    let result;
    if (isJson) {
      console.log('🔄 Processing as JSON file...');
      result = await processJsonFile(downloadedFilePath, connection);
    } else {
      console.log('🔄 Processing as CSV file...');
      result = await processCsvFile(downloadedFilePath, connection);
    }

    // Pulisci file temporaneo se necessario
    if (shouldCleanup && fs.existsSync(downloadedFilePath)) {
      fs.unlinkSync(downloadedFilePath);
      console.log(`🧹 Temporary file ${downloadedFilePath} deleted.`);
    }

    // Statistiche finali
    const endTime = Date.now();
    const durationSec = ((endTime - startTime) / 1000).toFixed(2);
    
    console.log('🎉 School data import process completed successfully!');
    console.log(`⏱️  Total duration: ${durationSec} seconds`);
    console.log(`📈 Final statistics:`, result);

    return {
      success: true,
      duration: durationSec,
      statistics: result,
      fileType: isJson ? 'json' : 'csv',
      fileSize: fileSizeMB
    };

  } catch (error) {
    console.error('💥 Error during school data import:', error.message);
    
    // Log dettagliato per debug
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack trace:', error.stack);
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 MySQL connection closed.');
    }
  }
}

/**
 * Funzione per testare l'importazione con file di esempio
 */
async function testImportFunction() {
  console.log('🧪 Testing import function with sample data...');
  
  // Crea file JSON di test
  const testJsonData = {
    "@graph": [
      {
        "@id": "_:b0",
        "miur:CODICESCUOLA": "TEST001",
        "miur:DENOMINAZIONESCUOLA": "Scuola Test JSON",
        "miur:REGIONE": "Lazio",
        "miur:PROVINCIA": "ROMA",
        "miur:DESCRIZIONECOMUNE": "Roma",
        "miur:SITOWEBSCUOLA": "www.test.it",
        "miur:DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA": "SCUOLA PRIMARIA",
        "miur:INDIRIZZOSCUOLA": "Via Test 123",
        "miur:CAPSCUOLA": "00100",
        "miur:INDIRIZZOEMAILSCUOLA": "test@test.it",
        "miur:INDIRIZZOPECSCUOLA": "test@pec.test.it",
        "miur:AREAGEOGRAFICA": "CENTRO"
      }
    ]
  };
  
  const testJsonPath = path.join(__dirname, 'test_schools.json');
  fs.writeFileSync(testJsonPath, JSON.stringify(testJsonData, null, 2));
  
  try {
    const result = await importSchools('upload', testJsonPath);
    console.log('✅ Test completed successfully:', result);
    return true;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  } finally {
    // Pulisci file di test
    if (fs.existsSync(testJsonPath)) {
      fs.unlinkSync(testJsonPath);
    }
  }
}

// Esecuzione diretta per test (esegui con: node db/importSchools.js)
if (require.main === module) {
  (async () => {
    try {
      console.log('🧪 Running import script in test mode...');
      
      // Scelta dell'operazione da CLI args
      const args = process.argv.slice(2);
      const command = args[0] || 'test';
      
      switch (command) {
        case 'test':
          console.log('📋 Running test with sample data...');
          await testImportFunction();
          break;
          
        case 'auto':
          console.log('📋 Running automatic import...');
          await importSchools('auto');
          break;
          
        case 'local':
          const filePath = args[1];
          if (!filePath) {
            console.error('❌ Please provide file path: node db/importSchools.js local <path>');
            process.exit(1);
          }
          console.log(`📋 Running import with local file: ${filePath}`);
          await importSchools('upload', filePath);
          break;
          
        default:
          console.log('📋 Usage:');
          console.log('  node db/importSchools.js test     # Test with sample data');
          console.log('  node db/importSchools.js auto     # Download and import latest dataset');
          console.log('  node db/importSchools.js local <file>  # Import from local file');
      }
      
    } catch (error) {
      console.error('💥 Script execution failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { 
  importSchools, 
  testImportFunction,
  normalizeSchoolData,
  DATASET_URL_JSON, 
  DATASET_URL_CSV 
};
