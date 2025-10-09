#!/usr/bin/env node
/*
 * Backfill: Fix deposit-generated Journal Entry entity_id from Account No first digit
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/database/connection');

async function main() {
  const sqlPath = path.join(__dirname, '..', 'database', 'backfills', 'fix-deposit-je-entity-from-account-digit.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  const client = await pool.connect();
  try {
    console.log('[Backfill] Starting...');
    await client.query('BEGIN');
    const res = await client.query(sql);
    await client.query('COMMIT');
    console.log(`[Backfill] Completed. Rows updated: ${res.rowCount}`);
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Backfill] Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

main();
