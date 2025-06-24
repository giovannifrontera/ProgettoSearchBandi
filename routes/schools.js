const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const dbConfig = require('../db/config');
const { importSchools } = require('../db/importSchools');

// Tenta di caricare multer, se non disponibile usa fallback
let multer;
let upload;
try {
  multer = require('multer');
  
  // Configurazione multer per upload file
  const uploadDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      // Genera nome file unico con timestamp
      const uniqueName = `schools_${Date.now()}_${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    }
  });

  const fileFilter = (req, file, cb) => {
    // Accetta solo file JSON e CSV
    const allowedTypes = ['.json', '.csv'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo file non supportato. Sono accettati solo file JSON e CSV.'), false);
    }
  };

  upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
      fileSize: 100 * 1024 * 1024 // Limite 100MB
    }
  });

  console.log('✅ Multer configurato correttamente per upload file');
} catch (error) {
  console.warn('⚠️ Multer non disponibile, upload file disabilitato:', error.message);
  console.warn('💡 Per abilitare upload: npm install multer');
}

async function getDbConnection() {
  return await mysql.createConnection(dbConfig);
}

// GET /api/schools - Elenco scuole filtrato
router.get('/', async (req, res, next) => {
  let connection;
  try {
    connection = await getDbConnection();
    let query = 'SELECT id, codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia FROM schools';
    const params = [];
    const conditions = [];

    if (req.query.regione) {
      conditions.push('regione = ?');
      params.push(req.query.regione);
    }
    if (req.query.provincia) {
      conditions.push('provincia = ?');
      params.push(req.query.provincia);
    }
    if (req.query.q) { // Testo libero per denominazione, comune
      conditions.push('(denominazione LIKE ? OR comune LIKE ? OR codice_mecc LIKE ?)');
      params.push(`%${req.query.q}%`);
      params.push(`%${req.query.q}%`);
      params.push(`%${req.query.q}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY denominazione ASC'; // Default ordering

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 50; // Default 50 schools per page
    const offset = (page - 1) * limit;

    const countQuery = `SELECT COUNT(*) as total FROM (${query.replace('SELECT id, codice_mecc, denominazione, regione, provincia, comune, sito_web, tipologia FROM schools', 'SELECT 1 FROM schools')}) as count_table`;
    const [totalResult] = await connection.execute(countQuery.replace('ORDER BY denominazione ASC',''), params); // Count query doesn't need ordering for this
    const totalSchools = totalResult[0].total;


    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [schools] = await connection.execute(query, params);

    res.json({
        data: schools,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalSchools / limit),
            totalItems: totalSchools,
            itemsPerPage: limit
        }
    });

  } catch (error) {
    next(error); // Pass to central error handler
  } finally {
    if (connection) await connection.end();
  }
});

// POST /api/schools/import - Importa/aggiorna dataset scuole (automatico)
router.post('/import', async (req, res, next) => {
  const { source } = req.body;

  if (source !== 'auto') {
    return res.status(400).json({ message: 'Invalid source type. Use "auto" for automatic import or use /import-upload for file upload.' });
  }

  try {
    console.log('🚀 Starting automatic school import process...');
    const result = await importSchools('auto');
    
    res.status(200).json({ 
      success: true,
      message: 'Importazione automatica completata con successo',
      statistics: result.statistics,
      duration: result.duration,
      fileType: result.fileType,
      fileSize: result.fileSize
    });
  } catch (error) {
    console.error('❌ Error during automatic school import:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'importazione automatica',
      error: error.message
    });
  }
});

// POST /api/schools/import-upload - Importa dataset da file caricato
router.post('/import-upload', (req, res, next) => {
  // Verifica se multer è disponibile
  if (!multer || !upload) {
    return res.status(503).json({
      success: false,
      message: 'Upload file non disponibile. Multer non è installato.',
      error: 'MULTER_NOT_AVAILABLE',
      solution: 'Installa multer con: npm install multer'
    });
  }

  // Usa multer middleware
  upload.single('schoolFile')(req, res, async (uploadErr) => {
    try {
      if (uploadErr) {
        console.error('❌ Multer upload error:', uploadErr);
        
        if (uploadErr.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File troppo grande. Dimensione massima: 100MB'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: uploadErr.message || 'Errore durante l\'upload del file'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Nessun file caricato. Seleziona un file JSON o CSV.'
        });
      }

      const uploadedFilePath = req.file.path;
      const originalName = req.file.originalname;
      const fileSizeMB = (req.file.size / (1024 * 1024)).toFixed(2);

      console.log(`📁 File caricato: ${originalName} (${fileSizeMB} MB)`);
      console.log(`📍 Path temporaneo: ${uploadedFilePath}`);

      // Avvia importazione
      const result = await importSchools('upload', uploadedFilePath);

      // Pulisci file temporaneo
      if (fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
        console.log('🧹 File temporaneo eliminato');
      }

      res.status(200).json({
        success: true,
        message: `Importazione da file "${originalName}" completata con successo`,
        statistics: result.statistics,
        duration: result.duration,
        fileType: result.fileType,
        fileSize: fileSizeMB,
        originalFileName: originalName
      });

    } catch (error) {
      console.error('❌ Error during file import:', error);
      
      // Pulisci file temporaneo in caso di errore
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
        console.log('🧹 File temporaneo eliminato dopo errore');
      }

      res.status(500).json({
        success: false,
        message: 'Errore durante l\'importazione da file',
        error: error.message
      });
    }
  });
});

// GET /api/schools/regions - Get distinct regions
router.get('/regions', async (req, res, next) => {
  let connection;
  try {
    connection = await getDbConnection();
    const [rows] = await connection.execute('SELECT DISTINCT regione FROM schools WHERE regione IS NOT NULL AND regione != "" ORDER BY regione');
    res.json(rows.map(r => r.regione));
  } catch (error) {
    next(error);
  } finally {
    if (connection) await connection.end();
  }
});

// GET /api/schools/provinces - Get distinct provinces for a region
router.get('/provinces', async (req, res, next) => {
  let connection;
  const { regione } = req.query;
  if (!regione) {
    return res.status(400).json({ message: 'Region query parameter is required.' });
  }
  try {
    connection = await getDbConnection();
    const [rows] = await connection.execute(
      'SELECT DISTINCT provincia FROM schools WHERE regione = ? AND provincia IS NOT NULL AND provincia != "" ORDER BY provincia',
      [regione]
    );
    res.json(rows.map(r => r.provincia));
  } catch (error) {
    next(error);
  } finally {
    if (connection) await connection.end();
  }
});

// GET /api/schools/upload-status - Verifica se upload è disponibile
router.get('/upload-status', (req, res) => {
  const isMulterAvailable = !!multer && !!upload;
  
  res.json({
    uploadAvailable: isMulterAvailable,
    multerInstalled: !!multer,
    message: isMulterAvailable ? 
      'Upload file disponibile' : 
      'Upload non disponibile. Installa multer con: npm install multer',
    alternatives: isMulterAvailable ? [] : [
      'Usa importazione automatica',
      'Posiziona file nella cartella uploads/ e usa import manuale',
      'Installa multer: npm install multer'
    ]
  });
});

// POST /api/schools/import-manual - Import da file già presente sul server
router.post('/import-manual', async (req, res) => {
  try {
    const { fileName } = req.body;
    
    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'Nome file richiesto',
        example: { fileName: 'scuole.json' }
      });
    }

    // Controlla se il file esiste nella cartella uploads
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const filePath = path.join(uploadDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: `File non trovato: ${fileName}`,
        hint: 'Posiziona il file nella cartella uploads/ del server'
      });
    }

    const stats = fs.statSync(filePath);
    const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`📁 Import manuale file: ${fileName} (${fileSizeMB} MB)`);

    // Avvia importazione
    const result = await importSchools('upload', filePath);

    res.status(200).json({
      success: true,
      message: `Importazione manuale di "${fileName}" completata con successo`,
      statistics: result.statistics,
      duration: result.duration,
      fileType: result.fileType,
      fileSize: fileSizeMB,
      fileName: fileName
    });

  } catch (error) {
    console.error('❌ Error during manual import:', error);
    res.status(500).json({
      success: false,
      message: 'Errore durante l\'importazione manuale',
      error: error.message
    });
  }
});


module.exports = router;
