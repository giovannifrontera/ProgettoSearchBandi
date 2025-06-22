const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('fast-csv');
const mysql = require('mysql2/promise');
const dbConfig = require('./config');

// URL for automatic download (example, replace with actual one if known or make configurable)
// The prompt mentions https://dati.istruzione.it/opendata/opendata/catalogo/elements1/?area=Scuole
// but this page lists multiple datasets. We'll need a more direct link or a way to find the latest.
// For now, using a placeholder.
const DATASET_URL_JSON = 'https://dati.istruzione.it/opendata/opendata/catalogo/elements/GET/DOCUMENTI/20232024/SCUANAGRAFESTAT20232420230901.json'; // Example JSON URL
const DATASET_URL_CSV = 'https://dati.istruzione.it/opendata/opendata/catalogo/elements/GET/DOCUMENTI/20232024/SCUANAGRAFESTAT20232420230901.csv'; // Example CSV URL


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
  console.log(`Processing JSON file: ${filePath}`);
  const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  // Assuming jsonData is an array of school objects.
  // Adjust field mapping based on actual JSON structure.
  // Example mapping (highly dependent on the actual dataset):
  // CODICESCUOLA -> codice_mecc
  // DENOMINAZIONESCUOLA -> denominazione
  // REGIONE -> regione
  // PROVINCIA -> provincia
  // COMUNE -> comune
  // INDIRIZZOEMAILSCUOLA -> (maybe not sito_web, but email)
  // INDIRIZZOWEBSCUOLA -> sito_web (if available)
  // DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA -> tipologia

  let count = 0;
  for (const school of jsonData) {
    // IMPORTANT: Adjust these field names to match the actual JSON structure
    const schoolData = {
      codice_mecc: school.CODICESCUOLA || school.CODICEISTITUTORIFERIMENTO, // Example: try multiple common names
      denominazione: school.DENOMINAZIONESCUOLA,
      regione: school.REGIONE,
      provincia: school.PROVINCIA,
      comune: school.DESCRIZIONECOMUNE,
      sito_web: school.INDIRIZZOWEBSCUOLA || school.SITO_WEB, // check for typical variations
      tipologia: school.DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA,
    };

    // Basic validation
    if (!schoolData.codice_mecc || !schoolData.denominazione) {
        console.warn('Skipping record due to missing codice_mecc or denominazione:', school);
        continue;
    }


    const query = `
      INSERT INTO schools (codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        denominazione = VALUES(denominazione),
        regione = VALUES(regione),
        provincia = VALUES(provincia),
        comune = VALUES(comune),
        sito_web = VALUES(sito_web),
        tipologia = VALUES(tipologia);
    `;
    try {
      await connection.execute(query, [
        schoolData.codice_mecc,
        schoolData.denominazione,
        schoolData.regione,
        schoolData.provincia,
        schoolData.comune,
        schoolData.sito_web,
        schoolData.tipologia
      ]);
      count++;
    } catch (error) {
      console.error(`Error inserting/updating school ${schoolData.codice_mecc}:`, error.message);
      // console.error('Problematic school data:', schoolData); // for debugging
    }
  }
  console.log(`Processed ${count} schools from JSON file.`);
}

async function processCsvFile(filePath, connection) {
  console.log(`Processing CSV file: ${filePath}`);
  return new Promise((resolve, reject) => {
    let count = 0;
    fs.createReadStream(filePath)
      .pipe(csv.parse({ headers: true, delimiter: ';' })) // Adjust delimiter if needed
      .on('error', error => {
        console.error('CSV parsing error:', error);
        reject(error);
      })
      .on('data', async (row) => {
        // IMPORTANT: Adjust these field names to match the actual CSV headers
        // Example mapping (highly dependent on the actual dataset):
        const schoolData = {
            codice_mecc: row.CODICESCUOLA || row.CODICEISTITUTORIFERIMENTO, // Common variations
            denominazione: row.DENOMINAZIONESCUOLA,
            regione: row.REGIONE,
            provincia: row.PROVINCIA,
            comune: row.DESCRIZIONECOMUNE,
            sito_web: row.INDIRIZZOWEBSCUOLA || row.SITO_WEB,
            tipologia: row.DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA,
        };

        if (!schoolData.codice_mecc || !schoolData.denominazione) {
            console.warn('Skipping CSV row due to missing codice_mecc or denominazione:', row);
            return; // Skip this row
        }

        const query = `
          INSERT INTO schools (codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            denominazione = VALUES(denominazione),
            regione = VALUES(regione),
            provincia = VALUES(provincia),
            comune = VALUES(comune),
            sito_web = VALUES(sito_web),
            tipologia = VALUES(tipologia);
        `;
        try {
          // Pausing the stream to wait for DB operation can be problematic with fast-csv
          // For large files, consider batching inserts or using a different CSV processing strategy
          // For now, we'll proceed with individual async operations.
          await connection.execute(query, [
            schoolData.codice_mecc,
            schoolData.denominazione,
            schoolData.regione,
            schoolData.provincia,
            schoolData.comune,
            schoolData.sito_web,
            schoolData.tipologia
          ]);
          count++;
        } catch (error) {
          console.error(`Error inserting/updating school ${schoolData.codice_mecc} from CSV:`, error.message);
          // console.error('Problematic CSV row:', row); // for debugging
        }
      })
      .on('end', (rowCount) => {
        console.log(`Parsed ${rowCount} rows from CSV. Processed ${count} schools.`);
        resolve(count);
      });
  });
}


async function importSchools(sourceType = 'auto', filePath = null) {
  let connection;
  try {
    connection = await getDbConnection();
    console.log('Successfully connected to MySQL for school import.');

    let downloadedFilePath = filePath;
    let isJson = false;

    if (sourceType === 'auto') {
      // Attempt JSON download first, then CSV as fallback
      const tempJsonPath = path.join(__dirname, 'temp_schools_dataset.json');
      const tempCsvPath = path.join(__dirname, 'temp_schools_dataset.csv');

      try {
        await downloadFile(DATASET_URL_JSON, tempJsonPath);
        downloadedFilePath = tempJsonPath;
        isJson = true;
        console.log('Dataset downloaded successfully as JSON.');
      } catch (jsonError) {
        console.warn(`Failed to download JSON dataset (${jsonError.message}). Attempting CSV download...`);
        try {
          await downloadFile(DATASET_URL_CSV, tempCsvPath);
          downloadedFilePath = tempCsvPath;
          isJson = false;
          console.log('Dataset downloaded successfully as CSV.');
        } catch (csvError) {
          console.error(`Failed to download CSV dataset (${csvError.message}). Aborting import.`);
          throw new Error('Failed to download dataset automatically.');
        }
      }
    } else if (sourceType === 'upload' && filePath) {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Uploaded file not found: ${filePath}`);
      }
      downloadedFilePath = filePath;
      isJson = path.extname(filePath).toLowerCase() === '.json';
      console.log(`Using uploaded file: ${filePath}`);
    } else {
      throw new Error('Invalid import configuration: sourceType or filePath missing.');
    }

    if (isJson) {
      await processJsonFile(downloadedFilePath, connection);
    } else {
      await processCsvFile(downloadedFilePath, connection);
    }

    if (sourceType === 'auto' && fs.existsSync(downloadedFilePath)) {
      fs.unlinkSync(downloadedFilePath); // Clean up temp file
      console.log(`Temporary file ${downloadedFilePath} deleted.`);
    }

    console.log('School data import process completed.');

  } catch (error) {
    console.error('Error during school data import:', error.message);
    // Further error handling (e.g., throw to be caught by caller API)
    throw error;
  } finally {
    if (connection) {
      await connection.end();
      console.log('MySQL connection closed.');
    }
  }
}

// Example usage (for direct execution, e.g. `node db/importSchools.js`):
// if (require.main === module) {
//   (async () => {
//     // To test auto download:
//     // await importSchools('auto');

//     // To test with a local file (create a dummy file first):
//     // fs.writeFileSync('dummy_schools.json', JSON.stringify([{ CODICESCUOLA: 'TEST0001', DENOMINAZIONESCUOLA: 'Test School JSON', REGIONE: 'Lazio', PROVINCIA: 'RM', DESCRIZIONECOMUNE: 'Roma', INDIRIZZOWEBSCUOLA: 'http://test.json', DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA: 'Primaria'}]));
//     // await importSchools('upload', 'dummy_schools.json');

//     // fs.writeFileSync('dummy_schools.csv', "CODICESCUOLA;DENOMINAZIONESCUOLA;REGIONE;PROVINCIA;DESCRIZIONECOMUNE;INDIRIZZOWEBSCUOLA;DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA\nTEST0002;Test School CSV;Lombardia;MI;Milano;http://test.csv;Secondaria I Grado");
//     // await importSchools('upload', 'dummy_schools.csv');
//   })();
// }

module.exports = { importSchools, DATASET_URL_JSON, DATASET_URL_CSV };
