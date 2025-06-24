# Configurazione Database

Questo progetto è configurato per utilizzare MySQL con XAMPP usando le impostazioni predefinite:

## Impostazioni Database
- **Server**: localhost
- **Porta**: 3306
- **Utente**: root
- **Password**: (vuota)
- **Database**: school_tender_finder

## Setup Automatico

### 1. Prerequisiti
Assicurati che XAMPP sia installato e in esecuzione:
- Avvia XAMPP Control Panel
- Avvia il servizio MySQL

### 2. Inizializzazione Database
Il database viene creato automaticamente quando avvii il server:

```bash
npm start
```

### 3. Setup Manuale (Opzionale)
Se vuoi inizializzare il database manualmente:

```bash
npm run setup-db
```

### 4. Test Connessione
Per testare la connessione al database:

```bash
npm run test-db
```

## Script Disponibili

- `npm start` - Avvia il server (crea automaticamente il database)
- `npm run setup-db` - Inizializza il database manualmente
- `npm run test-db` - Testa la connessione al database
- `npm run dev` - Avvia il server in modalità sviluppo

## Risoluzione Problemi

### Errore di Connessione
Se ottieni errori di connessione:

1. **Verifica che MySQL sia in esecuzione**
   - Apri XAMPP Control Panel
   - Assicurati che MySQL sia "Running" (verde)

2. **Verifica la porta**
   - MySQL dovrebbe essere in ascolto sulla porta 3306
   - Se usi una porta diversa, modifica `db/config.js`

3. **Verifica le credenziali**
   - L'utente root dovrebbe avere accesso senza password
   - Se hai impostato una password, modifica `db/config.js`

### Configurazione Personalizzata
Se devi modificare le impostazioni, edita il file `db/config.js`:

```javascript
module.exports = {
  host: 'localhost',
  user: 'root',
  password: '', // Cambia se hai impostato una password
  database: 'school_tender_finder',
  port: 3306, // Cambia se usi una porta diversa
  charset: 'utf8mb4'
};
```

## Struttura Database

Il database include le seguenti tabelle:

### `schools`
Contiene informazioni sulle scuole:
- id, codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia

### `tenders`
Contiene i bandi di gara trovati:
- id, school_id, title, type, deadline, publish_date, url, summary, last_checked

## Sicurezza

⚠️ **Nota**: La configurazione attuale è ottimizzata per sviluppo locale con XAMPP. Per produzione:

1. Crea un utente MySQL dedicato con password
2. Modifica le credenziali in `db/config.js`
3. Considera l'uso di variabili d'ambiente per le credenziali
