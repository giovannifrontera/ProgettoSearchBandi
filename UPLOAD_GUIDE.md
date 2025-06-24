# Upload File Scuole - Guida Completa

## 🎯 Funzionalità Implementate

Il sistema ora supporta completamente l'upload di file per l'importazione del dataset scuole, risolvendo l'errore precedente.

## 🔧 Backend (API)

### Endpoint Disponibili

#### 1. `/api/schools/import` (POST)
- **Descrizione**: Importazione automatica dal MIUR
- **Payload**: `{ "source": "auto" }`
- **Risposta**: Statistiche complete dell'importazione

#### 2. `/api/schools/import-upload` (POST)
- **Descrizione**: Upload e importazione file
- **Content-Type**: `multipart/form-data`
- **Campo**: `schoolFile`
- **Tipi supportati**: JSON, CSV
- **Dimensione max**: 100MB

### Implementazione Multer

```javascript
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: 'schools_TIMESTAMP_RANDOM.ext'
});

const upload = multer({ 
  storage: storage,
  fileFilter: // Solo JSON e CSV
  limits: { fileSize: 100MB }
});
```

## 🌐 Frontend (Vue.js)

### Funzionalità Upload

```javascript
const handleFileUpload = (event) => {
  const file = event.target.files[0];
  // Validazione tipo file (JSON/CSV)
  // Validazione dimensione (100MB max)
  // Upload con FormData
  // Progress bar
  // Gestione errori
};
```

### Validazioni Client-Side

1. **Tipo File**: Solo `.json` e `.csv`
2. **Dimensione**: Massimo 100MB
3. **Feedback**: Progress bar durante upload
4. **Statistiche**: Mostra risultati importazione

## 📊 Statistiche Importazione

La risposta include statistiche dettagliate:

```json
{
  "success": true,
  "message": "Importazione completata con successo",
  "statistics": {
    "processed": 8547,
    "skipped": 23,
    "errors": 2
  },
  "duration": "45.2",
  "fileType": "json",
  "fileSize": "15.3",
  "originalFileName": "scuole.json"
}
```

## 🔄 Flusso Completo

### Upload File
1. **Selezione File**: Utente seleziona file JSON/CSV
2. **Validazione**: Client verifica tipo e dimensione
3. **Upload**: FormData inviato a `/api/schools/import-upload`
4. **Elaborazione**: Server salva file temporaneo ed elabora
5. **Import**: Dati importati nel database
6. **Cleanup**: File temporaneo eliminato
7. **Risposta**: Statistiche mostrate all'utente

### Import Automatico
1. **Richiesta**: Client invia richiesta a `/api/schools/import`
2. **Download**: Server scarica dataset MIUR
3. **Elaborazione**: Parsing e importazione
4. **Cleanup**: File temporaneo eliminato
5. **Risposta**: Statistiche complete

## 🛡️ Sicurezza

### Validazioni Server-Side
- Controllo estensione file
- Limite dimensione (100MB)
- Sanitizzazione nome file
- File temporanei in directory sicura

### Validazioni Client-Side
- Verifica MIME type
- Controllo estensione
- Limite dimensione
- Feedback immediato

## 🗂️ Struttura File

```
uploads/              # Directory upload temporanei
├── .gitkeep         # Mantiene directory in git
└── [temp files]     # File temporanei (ignorati da git)

db/
├── importSchools.js # Logica import migliorata
└── IMPORT_GUIDE.md  # Documentazione dettagliata

routes/
└── schools.js       # Endpoint con multer
```

## 🧪 Test

### Test Upload
```bash
# Test con file di esempio
npm run import-schools-test

# Test con file locale
npm run import-schools-local -- /path/to/file.json
```

### Test API
```bash
curl -X POST http://localhost:3000/api/schools/import \
  -H "Content-Type: application/json" \
  -d '{"source":"auto"}'

curl -X POST http://localhost:3000/api/schools/import-upload \
  -F "schoolFile=@scuole.json"
```

## 📱 Interfaccia Utente

### Scanner Tab
- **Aggiorna da MIUR**: Download automatico
- **Carica File**: Upload manuale con drag&drop
- **Progress Bar**: Feedback visivo
- **Statistiche**: Risultati dettagliati

### Feedback Utente
- Toast notifications per ogni operazione
- Progress bar durante upload
- Statistiche complete post-importazione
- Gestione errori con messaggi specifici

## 🚨 Gestione Errori

### Errori Comuni
1. **File troppo grande**: Limite 100MB
2. **Tipo file non supportato**: Solo JSON/CSV
3. **Errore di rete**: Timeout o connessione
4. **Errore parsing**: File corrotto o formato errato
5. **Errore database**: Problemi di connessione DB

### Messaggi di Errore
- Specifici per ogni tipo di errore
- Suggerimenti per la risoluzione
- Log dettagliato nel backend

## 🔧 Configurazione

### Environment Variables (opzionali)
```bash
UPLOAD_MAX_SIZE=104857600  # 100MB
UPLOAD_DIR=uploads/
ALLOWED_TYPES=json,csv
```

### Database
Il sistema è compatibile con la nuova struttura RDF-JSON del MIUR ed estende automaticamente lo schema DB.

## 📈 Performance

### Ottimizzazioni
- Processing batch (100 record/volta)
- Streaming per file grandi
- Cleanup automatico file temporanei
- Indici database ottimizzati

### Monitoraggio
- Statistiche complete per ogni operazione
- Tempo di esecuzione trackato
- Conteggio errori e successi
