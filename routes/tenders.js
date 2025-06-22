const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const dbConfig = require('../db/config');

async function getDbConnection() {
  return await mysql.createConnection(dbConfig);
}

// GET /api/tenders - Elenco bandi filtrato
router.get('/', async (req, res, next) => {
  let connection;
  try {
    connection = await getDbConnection();
    let query = `
      SELECT
        t.id, t.school_id, t.title, t.type,
        DATE_FORMAT(t.deadline, '%Y-%m-%d') as deadline,
        DATE_FORMAT(t.publish_date, '%Y-%m-%d') as publish_date,
        t.url, t.summary, DATE_FORMAT(t.last_checked, '%Y-%m-%d %H:%i:%s') as last_checked,
        s.denominazione as school_name, s.provincia as school_provincia, s.regione as school_regione
      FROM tenders t
      JOIN schools s ON t.school_id = s.id
    `;
    const params = [];
    const conditions = [];

    if (req.query.regione) {
      conditions.push('s.regione = ?');
      params.push(req.query.regione);
    }
    if (req.query.provincia) {
      conditions.push('s.provincia = ?');
      params.push(req.query.provincia);
    }
    if (req.query.q) { // Testo libero per titolo bando, nome scuola
      conditions.push('(t.title LIKE ? OR s.denominazione LIKE ? OR t.summary LIKE ?)');
      params.push(`%${req.query.q}%`);
      params.push(`%${req.query.q}%`);
      params.push(`%${req.query.q}%`);
    }
    if (req.query.type) {
      conditions.push('t.type = ?');
      params.push(req.query.type);
    }
    if (req.query.school_id) {
        conditions.push('t.school_id = ?');
        params.push(req.query.school_id);
    }
    // Date filtering examples (optional, can be added if needed)
    // if (req.query.deadline_after) { ... }
    // if (req.query.published_before) { ... }


    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Sorting
    const sortBy = req.query.sortBy || 'publish_date'; // Default sort by publish_date
    const sortOrder = (req.query.sortOrder || 'DESC').toUpperCase(); // Default DESC
    const validSortBy = ['publish_date', 'deadline', 'title', 'school_name', 'last_checked'];
    const validSortOrder = ['ASC', 'DESC'];

    if (validSortBy.includes(sortBy) && validSortOrder.includes(sortOrder)) {
        // Map frontend sortBy values to actual DB columns if different
        let dbSortBy = sortBy;
        if (sortBy === 'school_name') dbSortBy = 's.denominazione';
        else if (sortBy !== 'title') dbSortBy = `t.${sortBy}`; // Default to t.column for others except title

        query += ` ORDER BY ${dbSortBy} ${sortOrder}, t.id ${sortOrder}`; // Add secondary sort by ID
    } else {
        query += ' ORDER BY t.publish_date DESC, t.id DESC'; // Default if invalid params
    }


    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25; // Default 25 tenders per page
    const offset = (page - 1) * limit;

    // Count total items for pagination
    // Need to construct a count query that matches the filtering
    let countQueryBase = `
        SELECT COUNT(t.id) as total
        FROM tenders t
        JOIN schools s ON t.school_id = s.id
    `;
    if (conditions.length > 0) {
        countQueryBase += ' WHERE ' + conditions.join(' AND ');
    }

    const [totalResult] = await connection.execute(countQueryBase, params);
    const totalTenders = totalResult[0].total;


    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [tenders] = await connection.execute(query, params);

    res.json({
        data: tenders,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalTenders / limit),
            totalItems: totalTenders,
            itemsPerPage: limit
        }
    });

  } catch (error) {
    next(error); // Pass to central error handler
  } finally {
    if (connection) await connection.end();
  }
});


// GET /api/tenders/:id - Dettaglio singolo bando (opzionale)
router.get('/:id', async (req, res, next) => {
    let connection;
    try {
        connection = await getDbConnection();
        const tenderId = req.params.id;
        const query = `
            SELECT
                t.id, t.school_id, t.title, t.type,
                DATE_FORMAT(t.deadline, '%Y-%m-%d') as deadline,
                DATE_FORMAT(t.publish_date, '%Y-%m-%d') as publish_date,
                t.url, t.summary, DATE_FORMAT(t.last_checked, '%Y-%m-%d %H:%i:%s') as last_checked,
                s.denominazione as school_name, s.provincia as school_provincia, s.regione as school_regione, s.sito_web as school_website
            FROM tenders t
            JOIN schools s ON t.school_id = s.id
            WHERE t.id = ?
        `;
        const [rows] = await connection.execute(query, [tenderId]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Tender not found' });
        }
        res.json(rows[0]);
    } catch (error) {
        next(error);
    } finally {
        if (connection) await connection.end();
    }
});


module.exports = router;
