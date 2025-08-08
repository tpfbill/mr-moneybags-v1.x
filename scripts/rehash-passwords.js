#!/usr/bin/env node
/**
 * scripts/rehash-passwords.js
 * 
 * This script rehashes the default user passwords on Ubuntu installations.
 * It ensures that bcrypt hashes are generated using the local system's bcrypt
 * implementation, which may differ between macOS and Ubuntu environments.
 * 
 * Usage:
 *   node scripts/rehash-passwords.js
 * 
 * Requirements:
 *   - .env file with PostgreSQL connection parameters
 *   - bcrypt and pg modules installed
 */

// Load environment variables from .env file
require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

// Default user credentials
const DEFAULT_USERS = [
  { username: 'admin', password: 'admin123' },
  { username: 'user', password: 'user123' }
];

// Create a connection pool using environment variables
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'fund_accounting_db',
  user: process.env.PGUSER || 'npfadmin',
  password: process.env.PGPASSWORD || 'npfa123'
});

/**
 * Updates a user's password hash in the database
 * @param {string} username - The username to update
 * @param {string} passwordHash - The bcrypt hash to set
 * @returns {Promise} - Resolves when update is complete
 */
async function updateUserPasswordHash(username, passwordHash) {
  const query = 'UPDATE users SET password_hash = $1 WHERE username = $2 RETURNING id';
  try {
    const result = await pool.query(query, [passwordHash, username]);
    if (result.rowCount === 0) {
      console.error(`❌ User '${username}' not found in database`);
      return false;
    }
    console.log(`✅ Updated password hash for user '${username}' (ID: ${result.rows[0].id})`);
    return true;
  } catch (err) {
    console.error(`❌ Error updating password for ${username}:`, err.message);
    return false;
  }
}

/**
 * Main function to rehash all default user passwords
 */
async function rehashDefaultPasswords() {
  console.log('🔑 Starting password rehashing process...');
  console.log(`📊 Database: ${process.env.PGDATABASE || 'fund_accounting_db'}`);
  console.log(`👤 Default users: ${DEFAULT_USERS.map(u => u.username).join(', ')}`);
  
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    // Process each default user
    for (const user of DEFAULT_USERS) {
      // Generate a new hash using the local bcrypt implementation
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);
      console.log(`🔐 Generated new bcrypt hash for ${user.username} (salt rounds: ${SALT_ROUNDS})`);
      
      // Update the user's password hash in the database
      await updateUserPasswordHash(user.username, passwordHash);
    }
    
    console.log('✅ Password rehashing complete!');
    console.log('🔐 Default logins:');
    console.log('   - admin / admin123 (Administrator)');
    console.log('   - user / user123 (Standard User)');
  } catch (err) {
    console.error('❌ Error connecting to database:', err.message);
    console.error('Please check your .env file and database connection settings.');
  } finally {
    // Close the database connection pool
    await pool.end();
    console.log('🔌 Database connection closed');
  }
}

// Run the main function
rehashDefaultPasswords().catch(err => {
  console.error('❌ Unhandled error:', err);
  process.exit(1);
});
