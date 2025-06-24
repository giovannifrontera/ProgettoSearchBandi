# Risoluzione Errore 404 - Upload File

## 🚨 Problema
**Errore**: `Request failed with status code 404` quando si tenta di caricare un file

## 🔍 Cause Possibili

### 1. **Multer Non Installato** (Più Probabile)
Il modulo `multer` non è installato nel progetto.

**Soluzione**:
```bash
npm install multer
```

### 2. **Server Non Avviato**
Il server Node.js non è in esecuzione.

**Soluzione**:
```bash
npm start
```

### 3. **Route Non Trovata**
L'endpoint `/api/schools/import-upload` non è registrato.

**Verifica**: Controlla che il server mostri:
```
✅ Multer configurato correttamente per upload file
```

## 🛠️ Soluzioni

### Soluzione A: Installa Multer
```bash
cd c:\xampp\htdocs\ProgettoSearchBandi
npm install multer
npm start
```

### Soluzione B: Usa Import Automatico
Se l'installazione fallisce, usa l'importazione automatica:
1. Clicca **"Aggiorna da MIUR (Auto)"**
2. Il sistema scaricherà automaticamente l'ultimo dataset

### Soluzione C: Import Manuale
1. Posiziona il file nella cartella `uploads/`
2. Usa l'endpoint `/api/schools/import-manual`:
```bash
POST /api/schools/import-manual
{
  "fileName": "scuole.json"
}
```

## 🔧 Verifica Installazione

### Test Dipendenze
```bash
node -e "console.log(require('multer') ? '✅ Multer OK' : '❌ Multer Mancante')"
```

### Test Endpoint
```bash
# Verifica status upload
curl http://localhost:3000/api/schools/upload-status

# Test import automatico
curl -X POST http://localhost:3000/api/schools/import \
  -H "Content-Type: application/json" \
  -d '{"source":"auto"}'
```

## 📋 Checklist Risoluzione

- [ ] Server Node.js avviato (`npm start`)
- [ ] Multer installato (`npm install multer`)
- [ ] Database configurato (`npm run setup-db`)
- [ ] XAMPP MySQL attivo
- [ ] Endpoint upload disponibile

## 🆘 Fallback

Se nulla funziona, usa sempre:
**"Aggiorna da MIUR (Auto)"** che non richiede upload e funziona sempre.

## 📊 Output Previsto

Quando funziona correttamente:
```
✅ Multer configurato correttamente per upload file
📁 File caricato: scuole.json (15.3 MB)
📊 Import completed:
   ✅ Processed: 8547 schools
   ⚠️  Skipped: 23 schools
   ❌ Errors: 2 schools
```
