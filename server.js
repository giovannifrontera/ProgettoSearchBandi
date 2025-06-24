const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const bodyParser = require('body-parser'); // To parse JSON request bodies
const dbConfig = require('./db/config');
const { initializeDatabase, testConnection } = require('./db/init');

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
async function startServer() {
  try {
    console.log('🚀 Starting School Tender Finder server...');
    
    // Initialize database (create DB and tables if needed)
    await initializeDatabase(true);
    
    // Test connection
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error('Database connection test failed');
    }

    console.log(`✅ Server is running on http://localhost:${PORT}`);
    console.log('🎉 School Tender Finder backend is ready.');
    console.log(`🌐 Frontend accessible at http://localhost:${PORT}/index.html`);
    
  } catch (error) {
    console.error('\n💥 Failed to start server:', error.message);
    console.error('\n📋 Troubleshooting:');
    console.error('   1. Make sure XAMPP/MySQL is running');
    console.error('   2. Check that MySQL is accessible on localhost:3306');
    console.error('   3. Verify root user has no password set');
    console.error('   4. Try running: npm run setup-db');
    console.error('\n⚠️  Server will continue but database operations may fail.\n');
  }
}


app.listen(PORT, async () => {
  await startServer();
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
