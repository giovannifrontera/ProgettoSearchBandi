# Importazione Dataset Scuole

Questa documentazione spiega come utilizzare il sistema di importazione delle scuole aggiornato per gestire il formato RDF-JSON del MIUR.

## 🏗️ Struttura Dati Supportata

Il sistema è compatibile con il formato RDF-JSON del MIUR con namespace `miur:`:

```json
{
  "@graph": [
    {
      "@id": "_:b0",
      "miur:CODICESCUOLA": "TVIS018005",
      "miur:DENOMINAZIONESCUOLA": "IS SARTOR",
      "miur:REGIONE": "VENETO",
      "miur:PROVINCIA": "TREVISO",
      "miur:DESCRIZIONECOMUNE": "CASTELFRANCO VENETO",
      "miur:SITOWEBSCUOLA": "www.istitutoagrariosartor.edu.it",
      "miur:INDIRIZZOEMAILSCUOLA": "TVIS018005@istruzione.it",
      "miur:INDIRIZZOPECSCUOLA": "tvis018005@pec.istruzione.it",
      "miur:INDIRIZZOSCUOLA": "VIA POSTIOMA DI SALVAROSA 28",
      "miur:CAPSCUOLA": 31033.0,
      "miur:DESCRIZIONETIPOLOGIAGRADOISTRUZIONESCUOLA": "ISTITUTO SUPERIORE",
      "miur:AREAGEOGRAFICA": "NORD EST",
      "miur:CODICEISTITUTORIFERIMENTO": "TVIS018005",
      "miur:DENOMINAZIONEISTITUTORIFERIMENTO": "IS SARTOR",
      "miur:DESCRIZIONECARATTERISTICASCUOLA": "NORMALE",
      "miur:INDICAZIONESEDEDIRETTIVO": "SI",
      "miur:INDICAZIONESEDEOMNICOMPRENSIVO": "Non Disponibile",
      "miur:SEDESCOLASTICA": "NO",
      "miur:ANNOSCOLASTICO": 202526.0,
      "miur:CODICECOMUNESCUOLA": "C111"
    }
  ]
}
```

## 📊 Campi Database

Il database `schools` è stato esteso per includere tutti i campi disponibili:

### Campi Base
- `codice_mecc` - Codice meccanografico (obbligatorio)
- `denominazione` - Nome della scuola (obbligatorio)
- `regione`, `provincia`, `comune` - Ubicazione geografica
- `tipologia` - Tipo di istituto

### Campi Estesi
- `indirizzo`, `cap` - Indirizzo fisico
- `email`, `pec` - Contatti elettronici
- `sito_web` - Sito web istituzionale
- `area_geografica` - Area geografica (NORD, CENTRO, SUD, etc.)
- `codice_istituto_riferimento`, `denominazione_istituto_riferimento`
- `caratteristica_scuola` - Caratteristiche speciali
- `sede_direttivo`, `sede_omnicomprensivo`, `sede_scolastica` - Flag istituzionali
- `anno_scolastico` - Anno di riferimento dati
- `codice_comune` - Codice ISTAT comune

### Campi Sistema
- `stato_crawler` - Stato per il crawler (attivo/inattivo/errore)
- `ultima_scansione` - Timestamp ultima scansione
- `numero_scansioni` - Contatore scansioni
- `created_at`, `updated_at` - Timestamp gestione

## 🚀 Utilizzo

### 1. Importazione Automatica
Scarica e importa automaticamente l'ultimo dataset dal MIUR:

```bash
npm run import-schools
# oppure
node db/importSchools.js auto
```

### 2. Test con Dati di Esempio
Testa la funzione con dati di esempio:

```bash
npm run import-schools-test
# oppure
node db/importSchools.js test
```

### 3. Importazione da File Locale
Importa da un file locale (JSON o CSV):

```bash
npm run import-schools-local -- /path/to/file.json
# oppure
node db/importSchools.js local /path/to/file.json
```

## ⚙️ Funzionalità Avanzate

### Elaborazione Batch
- Processa i dati in batch di 100 record per ottimizzare performance
- Progress logging per monitorare l'avanzamento

### Validazione e Normalizzazione
- Validazione campi obbligatori (codice_mecc, denominazione)
- Normalizzazione lunghezza campi secondo schema DB
- Gestione CAP numerici convertiti in stringhe con padding

### Gestione Errori
- Continua l'elaborazione anche in caso di errori singoli
- Log dettagliato di errori e record problematici
- Statistiche complete: processati, saltati, errori

### Upsert Intelligente
- `INSERT ... ON DUPLICATE KEY UPDATE` per aggiornare record esistenti
- Mantiene timestamp di aggiornamento automatici

## 📈 Output e Statistiche

Il sistema fornisce statistiche complete:

```
📊 Import completed:
   ✅ Processed: 8547 schools
   ⚠️  Skipped: 23 schools  
   ❌ Errors: 2 schools
   📈 Success rate: 99.7%
⏱️  Total duration: 45.2 seconds
📊 File size: 15.3 MB
```

## 🔧 Configurazione

### URL Dataset
Gli URL sono configurabili nel file `importSchools.js`:

```javascript
const DATASET_URL_JSON = 'https://dati.istruzione.it/opendata/.../file.json';
const DATASET_URL_CSV = 'https://dati.istruzione.it/opendata/.../file.csv';
```

### Dimensione Batch
Modificabile nella variabile `batchSize` (default: 100).

### Timeout e Retry
Configurabile nelle funzioni di download per gestire connessioni lente.

## 🛠️ Risoluzione Problemi

### Errore Download
```
❌ Failed to download dataset automatically
```
**Soluzione**: Verifica URLs o usa importazione manuale.

### Errore Struttura JSON
```
Invalid JSON structure: expected @graph array
```
**Soluzione**: Verifica che il file JSON abbia la struttura RDF corretta.

### Errori Database
```
Error inserting/updating school: Duplicate entry
```
**Soluzione**: Normale per aggiornamenti, il sistema usa UPSERT.

### Performance
Per dataset molto grandi (>50MB):
- Aumenta `innodb_buffer_pool_size` in MySQL
- Considera l'uso di batch più grandi
- Monitora memoria disponibile

## 🔄 Manutenzione

### Aggiornamento Annuale
1. Verifica nuovi URL dataset per l'anno scolastico corrente
2. Aggiorna `DATASET_URL_JSON` e `DATASET_URL_CSV`
3. Testa con il nuovo formato dati
4. Esegui importazione completa

### Backup
Prima di importazioni massive:
```bash
mysqldump -u root school_tender_finder schools > backup_schools.sql
```

### Pulizia
Rimuovi scuole non più attive:
```sql
DELETE FROM schools WHERE updated_at < DATE_SUB(NOW(), INTERVAL 2 YEAR);
```
