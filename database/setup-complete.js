/**
 * @file setup-complete.js
 * @description Complete setup script for Nonprofit Fund Accounting v8.8
 * 
 * This script automates the entire setup process:
 * 1. Checks database connection
 * 2. Initializes database schema
 * 3. Loads The Principle Foundation test data
 * 
 * Usage: node setup-complete.js
 */

const { Client } = require('pg');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');
const { getDbConfig } = require('../src/db/db-config');

// Import the Principle Foundation data loader
const { loadPrincipleFoundationData } = require('./load-principle-foundation-data');

// Console output styling
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

// Helper functions for console output
function printHeader(text) {
  console.log('\n' + COLORS.bright + COLORS.blue + '='.repeat(80) + COLORS.reset);
  console.log(COLORS.bright + COLORS.blue + ' ' + text + COLORS.reset);
  console.log(COLORS.bright + COLORS.blue + '='.repeat(80) + COLORS.reset + '\n');
}

function printSuccess(text) {
  console.log(COLORS.green + '✓ ' + text + COLORS.reset);
}

function printInfo(text) {
  console.log(COLORS.cyan + 'ℹ ' + text + COLORS.reset);
}

function printWarning(text) {
  console.log(COLORS.yellow + '⚠ ' + text + COLORS.reset);
}

function printError(text) {
  console.log(COLORS.red + '✗ ' + text + COLORS.reset);
}

/**
 * Main setup function
 */
async function setupComplete() {
  printHeader('NONPROFIT FUND ACCOUNTING v8.8 - COMPLETE SETUP');
  printInfo('Starting setup process...');

  try {
    // Step 1: Check database connection
    await checkDatabaseConnection();

    // Step 2: Initialize database schema
    await initializeDatabaseSchema();

    // Step 3: Load The Principle Foundation test data
    await loadTestData();

    // Setup complete
    printHeader('SETUP COMPLETE');
    printSuccess('The Nonprofit Fund Accounting v8.8 system has been successfully set up!');
    printInfo('You can now:');
    printInfo('  1. Start the backend server: node server.js');
    printInfo('  2. Start the frontend server: npx http-server . -p 8080');
    printInfo('  3. Access the application at: http://localhost:8080');
    
    return { success: true };
  } catch (error) {
    printHeader('SETUP FAILED');
    printError(`Setup process failed: ${error.message}`);
    if (error.stack) {
      console.error(COLORS.dim + error.stack + COLORS.reset);
    }
    return { success: false, error };
  }
}

/**
 * Step 1: Check database connection
 */
async function checkDatabaseConnection() {
  printInfo('Checking database connection...');
  
  const dbConfig = getDbConfig();
  const client = new Client(dbConfig);
  
  try {
    await client.connect();
    const result = await client.query('SELECT version()');
    
    printSuccess(`Connected to PostgreSQL (${result.rows[0].version.split(' ')[1]})`);
    printInfo(`Database: ${dbConfig.database}`);
    printInfo(`User: ${dbConfig.user}`);
    
    await client.end();
    return true;
  } catch (error) {
    printError('Database connection failed');
    throw new Error(`Database connection error: ${error.message}`);
  }
}

/**
 * Step 2: Initialize database schema
 */
async function initializeDatabaseSchema() {
  printInfo('Initializing database schema...');
  
  // db-init.sql now resides in the same directory as this script (/database)
  const dbInitPath = path.join(__dirname, 'db-init.sql');
  
  if (!fs.existsSync(dbInitPath)) {
    throw new Error(`Schema file not found: ${dbInitPath}`);
  }
  
  try {
    const dbConfig = getDbConfig();
    const command = `PGPASSWORD=${dbConfig.password} psql -U ${dbConfig.user} -h ${dbConfig.host} -p ${dbConfig.port} -d ${dbConfig.database} -f ${dbInitPath}`;
    
    printInfo('Executing db-init.sql...');
    const output = execSync(command, { encoding: 'utf8' });
    
    // Check for errors in the output
    if (output.toLowerCase().includes('error')) {
      printWarning('Schema initialization completed with warnings');
      console.log(COLORS.dim + output + COLORS.reset);
    } else {
      printSuccess('Database schema initialized successfully');
    }
    
    return true;
  } catch (error) {
    printError('Schema initialization failed');
    throw new Error(`Schema initialization error: ${error.message}`);
  }
}

/**
 * Step 3: Load The Principle Foundation test data
 */
async function loadTestData() {
  printInfo('Loading The Principle Foundation test data...');
  
  try {
    const result = await loadPrincipleFoundationData();
    
    if (result.success) {
      printSuccess('The Principle Foundation test data loaded successfully');
      return true;
    } else {
      throw new Error(result.error || 'Unknown error loading test data');
    }
  } catch (error) {
    printError('Test data loading failed');
    throw new Error(`Test data loading error: ${error.message}`);
  }
}

// Run the setup if this script is executed directly
if (require.main === module) {
  setupComplete()
    .then(result => {
      if (!result.success) {
        process.exit(1);
      }
    })
    .catch(error => {
      printError(`Unhandled error: ${error.message}`);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = {
    setupComplete
  };
}
