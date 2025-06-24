const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dbConfig = require('./config');

/**
 * Initialize the database: create database if not exists, create tables if not exist
 * @param {boolean} verbose - Whether to log detailed information
 * @returns {Promise<boolean>} - Success status
 */
async function initializeDatabase(verbose = true) {
  let connection;
  
  try {
    if (verbose) {
      console.log('🔄 Starting database initialization...');
      console.log('📋 Configuration:', {
        host: dbConfig.host,
        user: dbConfig.user,
        database: dbConfig.database,
        port: dbConfig.port || 3306
      });
    }

    // First, connect without specifying database to create it if needed
    const connectionConfig = {
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port || 3306,
      charset: dbConfig.charset || 'utf8mb4'
    };

    if (verbose) console.log('🔗 Connecting to MySQL server...');
    connection = await mysql.createConnection(connectionConfig);
    
    // Create database if not exists
    if (verbose) console.log(`🏗️  Creating database '${dbConfig.database}' if not exists...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    if (verbose) console.log(`✅ Database '${dbConfig.database}' ensured.`);
    
    await connection.end();

    // Now connect to the specific database
    if (verbose) console.log(`🔗 Connecting to database '${dbConfig.database}'...`);
    connection = await mysql.createConnection(dbConfig);
    
    // Read and execute schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    if (verbose) console.log('📄 Reading schema file...');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split SQL statements by semicolon and execute each one
    const statements = schemaSql
      .split(/;\s*$/m)
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    if (verbose) console.log(`🏗️  Executing ${statements.length} SQL statements...`);
    
    for (const [index, statement] of statements.entries()) {
      try {
        await connection.query(statement);
        if (verbose) console.log(`  ✅ Statement ${index + 1}/${statements.length} executed successfully`);
      } catch (error) {
        // If it's a "table already exists" error, it's fine
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
          if (verbose) console.log(`  ℹ️  Statement ${index + 1}/${statements.length} - Table already exists (skipped)`);
        } else {
          throw error;
        }
      }
    }

    // Verify tables were created
    const [tables] = await connection.query('SHOW TABLES');
    if (verbose) {
      console.log('📊 Database tables:');
      tables.forEach(table => {
        const tableName = Object.values(table)[0];
        console.log(`  - ${tableName}`);
      });
    }

    if (verbose) console.log('🎉 Database initialization completed successfully!');
    return true;

  } catch (error) {
    console.error('❌ Database initialization failed:', error.message);
    
    // Provide helpful error messages for common issues
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Make sure MySQL/XAMPP is running and accessible on localhost:3306');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('💡 Check your MySQL credentials (user: root, password: empty)');
    } else if (error.code === 'ENOTFOUND') {
      console.error('💡 Cannot resolve hostname. Make sure MySQL is running on localhost');
    }
    
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

/**
 * Test database connection
 * @returns {Promise<boolean>} - Connection status
 */
async function testConnection() {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    await connection.query('SELECT 1');
    console.log('✅ Database connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    return false;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// If this script is run directly
if (require.main === module) {
  initializeDatabase(true)
    .then(() => {
      console.log('\n🎉 Database setup completed! You can now start the server.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Database setup failed:', error.message);
      process.exit(1);
    });
}

module.exports = {
  initializeDatabase,
  testConnection
};
