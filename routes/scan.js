const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const dbConfig = require('../db/config');
const { scanSchool } = require('../crawler/scanSchool');
// const PQueue = require('p-queue'); // Or any other promise pool library if needed for fine-grained control
// For now, we'll run scans sequentially or let the caller manage parallelism if multiple schoolIds are sent.
// A more advanced version could use a queue here.

// Max 5 parallel fetches as per requirements, can be managed here or in scanSchool if it handles multiple schools.
// For simplicity, if multiple schoolIds are passed, this route will iterate and await each one.
// For true parallel processing of multiple schools from one API call, a queue would be better.
// const queue = new PQueue({ concurrency: 5 });


async function getDbConnection() {
  return await mysql.createConnection(dbConfig);
}

// POST /api/scan - Avvia crawler per scuole selezionate
router.post('/', async (req, res, next) => {
  const { schoolIds } = req.body; // Expects an array of school IDs

  if (!Array.isArray(schoolIds) || schoolIds.length === 0) {
    return res.status(400).json({ message: 'schoolIds must be a non-empty array.' });
  }

  let connection;
  const results = [];
  let schoolsToScan = [];

  try {
    connection = await getDbConnection();
    // Validate schoolIds and fetch school details (especially sito_web)
    const placeholders = schoolIds.map(() => '?').join(',');
    const [schools] = await connection.execute(
      `SELECT id, denominazione, sito_web FROM schools WHERE id IN (${placeholders})`,
      schoolIds
    );

    schoolsToScan = schools;

    if (schoolsToScan.length === 0) {
        return res.status(404).json({ message: 'No valid schools found for the provided IDs.' });
    }

  } catch (dbError) {
    return next(dbError);
  } finally {
    if (connection) await connection.end();
  }

  // Non-blocking response: acknowledge the request and process scans in the background.
  // The client can poll for status or use WebSockets for real-time updates (more complex).
  // For now, we'll make it blocking for simplicity of progress feedback, but this might timeout for many schools.
  res.status(202).json({
    message: `Scan process initiated for ${schoolsToScan.length} schools. This might take a while.`,
    schoolsToScan: schoolsToScan.map(s => ({id: s.id, name: s.denominazione}))
  });


  // Actual scanning process (could be moved to a separate worker thread/process for long tasks)
  (async () => {
    console.log(`[SCAN_JOB] Starting scan for ${schoolsToScan.length} schools.`);
    for (const school of schoolsToScan) {
      if (!school.sito_web) {
        console.warn(`[SCAN_JOB] School ${school.denominazione} (ID: ${school.id}) has no website, skipping.`);
        results.push({ school_id: school.id, name: school.denominazione, status: 'skipped', message: 'Sito web non disponibile.', found_tenders: 0 });
        // Optionally, emit an event here for progress update to client if using sockets
        continue;
      }
      try {
        console.log(`[SCAN_JOB] Scanning school: ${school.denominazione} (ID: ${school.id}) - ${school.sito_web}`);
        // The scanSchool function is self-contained with its DB connection
        const result = await scanSchool(school); // scanSchool opens/closes its own DB connection
        results.push(result);
        console.log(`[SCAN_JOB] Finished scanning ${school.denominazione}. Found: ${result.found_tenders}`);
        // Optionally, emit an event here for progress update
      } catch (error) {
        console.error(`[SCAN_JOB] Critical error scanning school ${school.denominazione} (ID: ${school.id}): ${error.message}`);
        results.push({ school_id: school.id, name: school.denominazione, status: 'error', message: error.message, found_tenders: 0 });
        // Optionally, emit an event here for progress update
      }
    }
    console.log('[SCAN_JOB] All selected schools scanned. Results:', results.map(r => ({name:r.name, status:r.status, found:r.found_tenders || 0 }) ));
    // Here you could save the results summary to a log, DB, or notify an admin.
    // For now, results are just logged on the server. The client got a 202 earlier.
  })();

});

module.exports = router;
