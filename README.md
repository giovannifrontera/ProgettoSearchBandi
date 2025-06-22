# School Tender Finder

**School Tender Finder** è una web-app single-page (SPA) progettata per cercare e aggregare bandi di gara e avvisi pubblicati sui siti web delle scuole italiane.

## Stack Tecnologico

- **Backend**: Node.js, Express, MySQL
- **Frontend**: Vue 3 (via CDN), Bootstrap 5
- **Librerie Principali**:
    - `mysql2/promise`: Per interazioni asincrone con MySQL.
    - `fast-csv`: Per il parsing di file CSV (importazione dataset scuole).
    - `cheerio`: Per il parsing HTML (crawler).
    - `axios`: Per le richieste HTTP (sia backend per download, sia frontend per API).
    - `node-schedule`: Per la gestione di task schedulati (es. aggiornamento automatico dataset, scansioni periodiche - opzionale, commentato in `server.js`).
    - `papaparse`: Per il parsing CSV lato client (opzionale, se si volesse gestire l'upload e parsing del file scuole interamente nel frontend prima dell'invio al backend).
    - `file-saver`: Per abilitare il download di file (es. esportazione dati) nel client.
    - `body-parser`: Middleware per Express per parsare i body delle richieste.

## Struttura del Progetto

```
/server.js                # Entry point del backend, inizializzazione Express e DB
/db/
  schema.sql            # DDL MySQL per la creazione delle tabelle
  config.js             # Configurazione database MySQL (DA CREARE E CONFIGURARE MANUALMENTE)
  config.example.js     # Esempio per db/config.js
  importSchools.js      # Logica per download e importazione/aggiornamento dataset scuole
/routes/
  schools.js            # API routes per le scuole (CRUD, filtri, import)
  tenders.js            # API routes per i bandi (CRUD, filtri)
  scan.js               # API route per avviare il crawler su scuole specifiche
/crawler/
  scanSchool.js         # Logica principale del crawler per una singola scuola (fetch + cheerio)
/public/                  # Cartella per i file statici del frontend
  index.html            # Layout principale della SPA
  app.js                # Logica dell'applicazione Vue 3
  styles.css            # Stili CSS personalizzati
/.gitignore               # File e cartelle da ignorare per Git
/package.json             # Dipendenze e script NPM
/README.md                # Questo file
```

## Setup e Avvio

### Prerequisiti
- Node.js (versione 20 o LTS raccomandata)
- Server MySQL in esecuzione

### Installazione
1.  **Clonare il repository (o scaricare i file).**
2.  **Configurare il Database:**
    *   Crea un database MySQL (es. `school_tender_finder`).
    *   Copia `db/config.example.js` in `db/config.js`.
    *   Modifica `db/config.js` con le tue credenziali MySQL (host, utente, password, nome database).
        ```javascript
        // db/config.js
        module.exports = {
          host: 'localhost',
          user: 'tuo_utente_mysql',
          password: 'tua_password_mysql',
          database: 'school_tender_finder' // o il nome che hai scelto
        };
        ```
3.  **Installare le dipendenze Node.js:**
    Apri un terminale nella root del progetto ed esegui:
    ```bash
    npm install
    ```
    Questo comando leggerà il `package.json` (che verrà creato al prossimo step se non presente, o aggiornato) e installerà le librerie necessarie come Express, mysql2, ecc. Se `package.json` non esiste, puoi inizializzarlo con `npm init -y` prima di installare le dipendenze specifiche.

### Avvio del Server
Esegui il seguente comando dalla root del progetto:
```bash
node server.js
```
Il server backend si avvierà (di default sulla porta 3000). All'avvio, tenterà di:
1.  Connettersi a MySQL.
2.  Creare il database specificato in `db/config.js` se non esiste.
3.  Eseguire `db/schema.sql` per creare le tabelle `schools` e `tenders` se non esistono.

Dopo l'avvio, vedrai messaggi di log nella console, incluso l'URL per accedere all'applicazione (es. `http://localhost:3000`).

## Utilizzo dell'Applicazione

Apri il browser e naviga all'indirizzo del server (es. `http://localhost:3000`).

1.  **Impostazioni (Settings):**
    *   Pagina illustrativa per configurazioni future. Le modifiche qui sono simulate e non persistenti nello stato attuale.
2.  **Scanner:**
    *   **Aggiorna Dataset Scuole:**
        *   **Aggiorna da MIUR (Auto):** Tenta di scaricare l'ultimo dataset delle scuole (URL hardcoded in `db/importSchools.js` - potrebbe necessitare di aggiornamento manuale dell'URL nel codice se quello attuale non è più valido) e lo importa nel database.
        *   **Carica File Scuole (CSV/JSON):** Permette (teoricamente) di caricare un file CSV/JSON dal proprio computer. *Nota: L'upload diretto del file dal client non è pienamente implementato; questa funzione segnala al backend di usare un file che si presume sia già accessibile sul server o tramite un path specifico. L'import automatico è più affidabile.*
    *   **Controllo Scanner Bandi:**
        *   Questa sezione mostra lo stato dell'ultima operazione di scan. Per avviare una nuova scansione, vai alla scheda "Elenco Scuole".
3.  **Elenco Scuole (Schools):**
    *   Visualizza l'elenco delle scuole importate.
    *   Filtra per regione, provincia, o testo libero.
    *   Seleziona una o più scuole dalla tabella.
    *   Clicca su **"Avvia Scan per Selezionate"** per inviare le scuole selezionate al crawler. Lo stato della scansione verrà (parzialmente) aggiornato nella vista "Scanner". La scansione avviene nel backend; i risultati (nuovi bandi) saranno visibili nella vista "Risultati Bandi" dopo un refresh o una nuova ricerca.
4.  **Risultati Bandi (Results):**
    *   Visualizza i bandi trovati dal crawler.
    *   Filtra per regione/provincia della scuola, o testo libero (titolo bando, nome scuola).
    *   Ordina i risultati cliccando sulle intestazioni delle colonne.
    *   Esporta i risultati in formato CSV o JSON.
    *   Link diretti ai bandi/documenti originali.

## API Endpoints

Il backend espone le seguenti API REST:

*   `GET /api/schools`: Restituisce un elenco filtrato e paginato di scuole.
    *   Query params: `regione`, `provincia`, `q` (ricerca testuale), `page`, `limit`.
*   `POST /api/schools/import`: Avvia l'importazione/aggiornamento del dataset delle scuole.
    *   Body: `{ "source": "auto" | "upload", "filePath": "path/to/file_on_server_if_upload" }`
*   `GET /api/schools/regions`: Restituisce un elenco delle regioni uniche.
*   `GET /api/schools/provinces`: Restituisce un elenco delle province uniche per una data regione.
    *   Query params: `regione`.
*   `GET /api/tenders`: Restituisce un elenco filtrato, paginato e ordinabile di bandi.
    *   Query params: `regione`, `provincia`, `q`, `type`, `school_id`, `page`, `limit`, `sortBy`, `sortOrder`.
*   `GET /api/tenders/:id`: Restituisce i dettagli di un singolo bando.
*   `POST /api/scan`: Avvia il processo di scansione per un elenco di ID scuola.
    *   Body: `{ "schoolIds": [1, 2, 3,...] }`

## Logica di Importazione Dataset Scuole

*   **Automatica**: Scarica il file JSON (o CSV come fallback) da un URL predefinito (potrebbe necessitare di aggiornamento nel codice sorgente `db/importSchools.js` se il link cambia).
*   **Manuale (Upload)**: L'utente (teoricamente) carica un file CSV/JSON. Il backend poi processa questo file.
*   Per ogni record nel file, esegue un `INSERT ... ON DUPLICATE KEY UPDATE` nella tabella `schools`.

## Logica del Crawler

1.  Per ogni scuola selezionata, il crawler tenta di accedere al sito web della scuola.
2.  Esplora percorsi comuni come `/albo-pretorio`, `/bandi-gara`, `/gare`, `/avvisi`.
3.  Analizza l'HTML delle pagine trovate usando `cheerio`.
4.  Cerca link (`<a>`) e sezioni di testo (`<article>`, `<div>`, ecc.) che contengono keyword rilevanti (es. "bando", "gara", "avviso").
5.  Estrae: titolo, URL del bando/documento, e tenta di identificare data di pubblicazione e scadenza basandosi su pattern testuali.
6.  Salva/aggiorna le informazioni trovate nella tabella `tenders`, collegandole alla scuola.
7.  Gestisce timeout e URL non validi.

## Note e Limitazioni

*   **URL Dataset Scuole**: L'URL per il download automatico del dataset scuole è hardcoded in `db/importSchools.js`. Questo URL potrebbe cambiare annualmente o non essere più disponibile. Verificare e aggiornare se necessario.
*   **Efficacia del Crawler**: L'efficacia del crawler dipende molto dalla struttura dei siti web delle scuole, che varia enormemente. Potrebbe non trovare tutti i bandi o estrarre informazioni in modo impreciso.
*   **Errori CORS**: Durante la scansione, il backend (Node.js) fa richieste HTTP dirette ai siti delle scuole, quindi gli errori CORS tipici del browser non sono un problema per il backend. Se si tentasse di fare fetch diretti dal frontend (non è il caso di questo crawler), si incontrerebbero problemi CORS.
*   **File Upload**: La funzionalità di "Carica File Scuole" dal client è concettuale. Un'implementazione robusta richiederebbe la gestione di `multipart/form-data` nel backend e l'upload effettivo del file dal client.
*   **Feedback Scansione**: La scansione dei bandi avviata da "Elenco Scuole" è un processo asincrono nel backend. L'interfaccia utente in "Scanner" fornisce un feedback limitato e simulato sullo stato di avanzamento. Per un feedback in tempo reale, sarebbero necessarie tecnologie come WebSockets o polling.
*   **Configurazione DB**: È fondamentale configurare correttamente `db/config.js` prima di avviare il server.

## Possibili Miglioramenti Futuri (Extra)

*   Implementare un sistema di upload file robusto per il dataset scuole.
*   Migliorare l'euristica del crawler (pattern di date, tipi di bando, estrazione sommario).
*   Aggiungere Service Worker per caching e notifiche (come da richiesta originale).
*   Creare un `Dockerfile` per containerizzare l'applicazione.
*   Scrivere unit test (es. con Jest) per la logica del crawler.
*   Utilizzare un sistema di code (es. BullMQ) per gestire le scansioni in modo più robusto e scalabile.
*   Implementare WebSockets per feedback in tempo reale sullo stato della scansione.
*   Aggiungere autenticazione e gestione utenti se necessario.
*   Migliorare la UI/UX con componenti più avanzati o un framework CSS più completo.
```
