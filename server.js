const express = require('express');
const mysql = require('mysql2/promise');
const path = path = require('path');
const bodyParser = require('body-parser'); // To parse JSON request bodies
const dbConfig = require('./db/config');

// Import routes
const schoolsRoutes = require('./routes/schools');
const tendersRoutes = require('./routes/tenders');
const scanRoutes = require('./routes/scan');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json()); // For parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// Serve static files from 'public' directory (for Vue frontend)
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/schools', schoolsRoutes);
app.use('/api/tenders', tendersRoutes);
app.use('/api/scan', scanRoutes);

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack || err.message || err);
  // Check if headers already sent
  if (res.headersSent) {
    return next(err); // Delegate to default Express error handler
  }
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    // Optionally include stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Test DB Connection and Start Server
async function initializeDatabase() {
  let connection;
  try {
    // Create a temporary connection to check DB status and create database if not exists
    connection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      // port: dbConfig.port || 3306 // if using a non-standard port
    });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
    console.log(`Database '${dbConfig.database}' ensured.`);
    await connection.end();

    // Now connect to the specific database to check/create tables
    connection = await mysql.createConnection(dbConfig);
    console.log('Successfully connected to MySQL database.');

    // Read and execute schema.sql to create tables if they don't exist
    // This is a simple approach; migrations are better for production.
    const schemaSql = require('fs').readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf8');
    const statements = schemaSql.split(/;\s*$/m); // Split by semicolon at the end of a line, possibly with whitespace
    for (const statement of statements) {
      if (statement.trim().length > 0) {
        await connection.query(statement);
      }
    }
    console.log('Database schema ensured (tables created if not exist).');

  } catch (error) {
    console.error('Failed to initialize database:', error);
    // process.exit(1); // Exit if DB connection fails
    // For Replit, it might be better to let it start and show error on API use
    // Or, the user needs to setup MySQL first.
    console.error("**************************************************************************************");
    console.error("IMPORTANT: Could not connect to or initialize the database.");
    console.error("Please ensure MySQL is running and the credentials in 'db/config.js' are correct.");
    console.error("The database '" + dbConfig.database + "' and its tables defined in 'db/schema.sql' must be accessible.");
    console.error("**************************************************************************************");
    // We'll allow the server to start, but API calls requiring DB will likely fail.
  } finally {
    if (connection) await connection.end();
  }
}


app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  await initializeDatabase();
  console.log('School Tender Finder backend is ready.');
  console.log(`Frontend should be accessible at http://localhost:${PORT}/index.html (or just http://localhost:${PORT}/)`);
});

// Optional: node-schedule for cron jobs (if implemented later)
// const schedule = require('node-schedule');
// const { importSchools } = require('./db/importSchools');
// const { scanAllSchools } = require('./crawler/scanSchool'); // Assuming a function to scan all/active schools

// Example cron job for daily school data update at 2 AM
// schedule.scheduleJob('0 2 * * *', async () => {
//   console.log('Running scheduled job: Auto-importing schools...');
//   try {
//     await importSchools('auto');
//     console.log('Scheduled school import finished.');
//   } catch (error) {
//     console.error('Error during scheduled school import:', error);
//   }
// });

// Example cron job for hourly tender scan (e.g., for schools marked active)
// schedule.scheduleJob('0 * * * *', async () => {
//   console.log('Running scheduled job: Scanning for new tenders...');
//   try {
//     // await scanAllActiveSchools(); // You'd need to implement this logic
//     console.log('Scheduled tender scan finished.');
//   } catch (error) {
//     console.error('Error during scheduled tender scan:', error);
//   }
// });
