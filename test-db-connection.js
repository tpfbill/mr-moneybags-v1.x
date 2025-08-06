/**
 * test-db-connection.js
 * 
 * A simple script to test database connectivity and configuration.
 * This script helps diagnose "DB Offline" issues by checking:
 * - Environment variables
 * - Database connection
 * - Basic query functionality
 */

// Load environment variables from .env file
require('dotenv').config();
const { Client } = require('pg');

// Display environment variables being used
console.log('=== Environment Variables ===');
console.log(`PGHOST: ${process.env.PGHOST || 'not set (default: localhost)'}`);
console.log(`PGPORT: ${process.env.PGPORT || 'not set (default: 5432)'}`);
console.log(`PGDATABASE: ${process.env.PGDATABASE || 'not set (default: fund_accounting_db)'}`);
console.log(`PGUSER: ${process.env.PGUSER || 'not set (default: postgres)'}`);
console.log(`PGPASSWORD: ${process.env.PGPASSWORD ? '******** (set)' : 'not set'}`);
console.log('=============================\n');

// Get database configuration (same as main application)
const dbConfig = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE || 'fund_accounting_db',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    // Add a connection timeout for faster feedback
    connectionTimeoutMillis: 5000,
};

console.log('=== Connection Configuration ===');
console.log(`Host: ${dbConfig.host}`);
console.log(`Port: ${dbConfig.port}`);
console.log(`Database: ${dbConfig.database}`);
console.log(`User: ${dbConfig.user}`);
console.log(`Password: ${dbConfig.password ? '******** (set)' : 'not set (empty)'}`);
console.log('===============================\n');

// Create a client
const client = new Client(dbConfig);

// Test connection
console.log('Attempting to connect to database...');

client.connect()
    .then(async () => {
        console.log('✅ Successfully connected to database!');
        
        // Test a simple query
        console.log('\nTesting simple query (SELECT NOW())...');
        try {
            const result = await client.query('SELECT NOW() as current_time');
            console.log(`✅ Query successful! Current time: ${result.rows[0].current_time}`);
            
            // Test a query to check tables
            console.log('\nChecking database tables...');
            const tablesResult = await client.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
                ORDER BY table_name
            `);
            
            console.log(`✅ Found ${tablesResult.rows.length} tables:`);
            tablesResult.rows.forEach((row, i) => {
                console.log(`   ${i+1}. ${row.table_name}`);
            });
            
            // Check if entities table has data
            console.log('\nChecking if entities table has data...');
            const entitiesResult = await client.query('SELECT COUNT(*) FROM entities');
            console.log(`✅ Entities table has ${entitiesResult.rows[0].count} records`);
            
        } catch (err) {
            console.error('❌ Query failed:', err.message);
            console.error('Error details:', err);
        } finally {
            // Close the connection
            await client.end();
            console.log('\nDatabase connection closed.');
        }
    })
    .catch(err => {
        console.error('❌ Failed to connect to database!');
        console.error('Error message:', err.message);
        
        // Provide more specific error guidance
        if (err.code === 'ECONNREFUSED') {
            console.error('\nPossible causes:');
            console.error('1. PostgreSQL service is not running');
            console.error('   → Try: sudo systemctl start postgresql');
            console.error('2. Wrong host or port in configuration');
            console.error('   → Check PGHOST and PGPORT in .env file');
        } else if (err.code === '28P01') {
            console.error('\nAuthentication failed:');
            console.error('1. Wrong username or password');
            console.error('   → Check PGUSER and PGPASSWORD in .env file');
            console.error('2. User might not exist in PostgreSQL');
            console.error('   → Try running Option A or B again to create user');
        } else if (err.code === '3D000') {
            console.error('\nDatabase does not exist:');
            console.error('1. Database "fund_accounting_db" has not been created');
            console.error('   → Try running Option A or B again to create database');
        }
        
        console.error('\nFull error details:', err);
    });
