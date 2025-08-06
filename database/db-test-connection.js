/**
 * db-test-connection.js
 * 
 * A simple script to test the PostgreSQL database connection for the
 * nonprofit-fund-accounting application.
 */

const { Client } = require('pg');
const { getDbConfig } = require('./src/db/db-config');

// Get the database configuration
const dbConfig = getDbConfig();

// Function to test the database connection
async function testDatabaseConnection() {
  const client = new Client(dbConfig);
  
  console.log('Database connection test starting...');
  console.log('Using configuration:', {
    host: dbConfig.host,
    port: dbConfig.port,
    database: dbConfig.database,
    user: dbConfig.user,
    // Not logging password for security reasons
  });

  try {
    // Connect to the database
    console.log('Attempting to connect to the database...');
    await client.connect();
    console.log('✅ Successfully connected to the database');

    // Run a simple query
    console.log('Running test query...');
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Query successful');
    console.log('Current database time:', result.rows[0].current_time);

    // Test if tables exist
    console.log('Checking if tables exist...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('Tables in database:');
    if (tablesResult.rows.length === 0) {
      console.log('  No tables found. Database schema may not be initialized.');
    } else {
      tablesResult.rows.forEach(row => {
        console.log(`  - ${row.table_name}`);
      });
    }

  } catch (error) {
    console.error('❌ Database connection error:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
      
      // Provide more detailed information for common PostgreSQL error codes
      switch (error.code) {
        case 'ECONNREFUSED':
          console.error('The database server is not accepting connections. Make sure PostgreSQL is running.');
          break;
        case 'ENOTFOUND':
          console.error('The host name could not be resolved. Check your host configuration.');
          break;
        case '28P01':
          console.error('Authentication failed. Check your username and password.');
          break;
        case '3D000':
          console.error('Database does not exist. You may need to create it first.');
          break;
        default:
          console.error('See PostgreSQL documentation for error code details.');
      }
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    // Close the connection
    try {
      await client.end();
      console.log('Database connection closed');
    } catch (err) {
      console.error('Error closing database connection:', err.message);
    }
  }
}

// Run the test
testDatabaseConnection().catch(err => {
  console.error('Unhandled error in test script:', err);
  process.exit(1);
});
