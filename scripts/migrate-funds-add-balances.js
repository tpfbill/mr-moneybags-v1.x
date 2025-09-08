#!/usr/bin/env node
/**
 * migrate-funds-add-balances.js
 * 
 * Migration script to add balance-related columns to the funds table.
 * This script adds the following columns if they don't exist:
 * 
 * 1. balance - NUMERIC(14,2) NOT NULL DEFAULT 0
 * 2. starting_balance - NUMERIC(14,2) NOT NULL DEFAULT 0
 * 3. starting_balance_date - DATE NOT NULL DEFAULT CURRENT_DATE
 * 
 * All operations are performed in a transaction and are idempotent.
 */

const { pool } = require('../src/database/connection');

// Track changes for summary report
const changes = {
  columnsAdded: [],
  errors: []
};

async function main() {
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    console.log('Starting funds table balance columns migration...');
    
    // Check if the funds table exists
    const tableExists = await checkTableExists(client, 'funds');
    if (!tableExists) {
      throw new Error('Funds table does not exist. Migration aborted.');
    }
    
    // Add new columns if they don't exist
    await addColumnsIfNotExist(client);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('Migration completed successfully.');
    
    // Print summary
    printSummary();
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during migration, rolled back:', error);
    changes.errors.push(error.message);
    printSummary();
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Check if a table exists in the database
 */
async function checkTableExists(client, tableName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    ) as exists
  `, [tableName]);
  
  return rows[0].exists;
}

/**
 * Check if a column exists in a table
 */
async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    ) as exists
  `, [tableName, columnName]);
  
  return rows[0].exists;
}

/**
 * Add new columns if they don't exist
 */
async function addColumnsIfNotExist(client) {
  // Define columns to add with their properties
  const columnsToAdd = [
    {
      name: 'balance',
      definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0'
    },
    {
      name: 'starting_balance',
      definition: 'NUMERIC(14,2) NOT NULL DEFAULT 0'
    },
    {
      name: 'starting_balance_date',
      definition: 'DATE NOT NULL DEFAULT CURRENT_DATE'
    }
  ];
  
  for (const column of columnsToAdd) {
    const exists = await columnExists(client, 'funds', column.name);
    
    if (!exists) {
      const sql = `ALTER TABLE funds ADD COLUMN ${column.name} ${column.definition}`;
      await client.query(sql);
      console.log(`Added column ${column.name} to funds table`);
      changes.columnsAdded.push(column.name);
    } else {
      console.log(`Column ${column.name} already exists, skipping`);
    }
  }
}

/**
 * Print a summary of changes made
 */
function printSummary() {
  console.log('\n=== MIGRATION SUMMARY ===');
  
  if (changes.columnsAdded.length > 0) {
    console.log('\nColumns added:');
    changes.columnsAdded.forEach(col => console.log(`  - ${col}`));
  } else {
    console.log('\nNo columns were added (all already exist)');
  }
  
  if (changes.errors.length > 0) {
    console.log('\nErrors encountered:');
    changes.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('\n=========================');
}

// Run the migration
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
