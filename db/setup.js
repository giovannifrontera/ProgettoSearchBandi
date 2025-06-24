const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');

// Funzione per caricare la configurazione del database
async function getDbConfig() {
    try {
        // Tenta di caricare db/config.js
        const config = require('./config');
        return config;
    } catch (error) {
        // Se config.js non esiste, usa config.example.js
        console.warn("Attenzione: db/config.js non trovato. Utilizzo db/config.example.js come fallback.");
        console.warn("Per una configurazione di produzione, crea db/config.js con i tuoi dettagli.");
        const exampleConfig = require('./config.example.js');
        return exampleConfig;
    }
}

async function setupDatabase() {
    let connection;
    try {
        const dbConfig = await getDbConfig();

        // Connessione senza specificare un database, per poterlo creare se non esiste
        connection = await mysql.createConnection({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            // port: dbConfig.port || 3306 // Aggiungi se necessario
        });

        console.log(`Connesso a MySQL server come ${dbConfig.user}@${dbConfig.host}`);

        // Crea il database se non esiste
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
        console.log(`Database '${dbConfig.database}' assicurato.`);

        // Chiudi la connessione iniziale e riconnettiti specificando il database
        await connection.end();

        connection = await mysql.createConnection({
            ...dbConfig,
            multipleStatements: true // Permette di eseguire più query SQL in una singola chiamata
        });
        console.log(`Connesso al database '${dbConfig.database}'.`);

        // Leggi lo schema SQL
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = await fs.readFile(schemaPath, 'utf-8');

        // Esegui lo schema SQL
        // Nota: questo approccio esegue tutte le istruzioni CREATE TABLE.
        // Se le tabelle esistono già, potrebbero generare errori (che mysql2 gestisce o ignora a seconda della query).
        // Per una gestione più robusta, si potrebbe splittare il file SQL ed eseguire "CREATE TABLE IF NOT EXISTS" per ogni tabella.
        // Tuttavia, schema.sql usa già CREATE TABLE, che in MySQL non fallisce se la tabella esiste già con la stessa struttura.
        // Se la struttura è diversa, fallirà.
        console.log("Esecuzione di schema.sql...");
        await connection.query(schemaSql);
        console.log("Schema del database applicato con successo.");

        return { success: true, message: "Database configurato con successo." };

    } catch (error) {
        console.error("Errore durante la configurazione del database:", error);
        let errorMessage = "Errore durante la configurazione del database.";
        if (error.code === 'ECONNREFUSED') {
            errorMessage = "Connessione al database rifiutata. Verifica che il server MySQL sia in esecuzione e che le credenziali siano corrette.";
        } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            errorMessage = "Accesso negato per l'utente del database. Controlla le credenziali.";
        } else if (error.code === 'ER_DB_CREATE_EXISTS' || error.code === 'ER_TABLE_EXISTS_ERROR') {
            // Questi errori specifici potrebbero non essere generati se si usa IF NOT EXISTS
            // ma li gestiamo per completezza.
            console.warn("Il database o le tabelle potrebbero esistere già.");
            return { success: true, message: "Database già esistente o parzialmente configurato. Operazione completata." };
        }
        return { success: false, message: errorMessage, error: error.message };
    } finally {
        if (connection) {
            await connection.end();
            console.log("Connessione al database chiusa.");
        }
    }
}

// Se lo script è eseguito direttamente (es. da CLI per test), esegui la funzione.
if (require.main === module) {
    setupDatabase().then(result => {
        console.log(result.message);
        if (!result.success) {
            process.exit(1);
        }
    }).catch(err => {
        console.error("Errore non gestito:", err);
        process.exit(1);
    });
}

module.exports = setupDatabase;
