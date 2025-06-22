const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const dbConfig = require('../db/config');
const { importSchools } = require('../db/importSchools');

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

// POST /api/schools/import - Importa/aggiorna dataset scuole
router.post('/import', async (req, res, next) => {
  const { source, filePath } = req.body; // source: "auto" or "upload", filePath for "upload"

  if (source !== 'auto' && source !== 'upload') {
    return res.status(400).json({ message: 'Invalid source type. Must be "auto" or "upload".' });
  }
  if (source === 'upload' && !filePath) {
    // In a real scenario with file uploads, filePath would come from multer or similar middleware
    // For this structure, we assume filePath is passed if source is 'upload',
    // though the actual file handling from HTTP request is not implemented here.
    // This is more of a placeholder for triggering the import logic.
    // A more robust implementation would use `multer` to handle `multipart/form-data`.
    console.warn("File path for 'upload' source is expected. The client should handle file upload and provide a server-accessible path or the server should handle multipart data.");
    // For now, we'll assume filePath might be a path on the server if manually placed.
    // return res.status(400).json({ message: 'File path is required for upload source.' });
  }

  try {
    console.log(`Starting school import process. Source: ${source}, FilePath: ${filePath || 'N/A'}`);
    // The importSchools function is async. We await its completion.
    await importSchools(source, filePath);
    res.status(200).json({ message: 'School data import process initiated successfully. Check server logs for progress.' });
  } catch (error) {
    console.error('Error during school import route:', error);
    // The error from importSchools might already be logged, but we pass it to the central handler.
    next(error);
  }
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


module.exports = router;
