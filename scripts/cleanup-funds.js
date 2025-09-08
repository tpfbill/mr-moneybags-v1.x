#!/usr/bin/env node
/**
 * cleanup-funds.js
 * 
 * A utility script to safely delete test funds and their dependencies.
 * 
 * Usage:
 *   node scripts/cleanup-funds.js [options]
 * 
 * Options:
 *   --pattern PREFIX   Match funds with code/fund_code starting with PREFIX
 *   --all              Delete all funds (use with caution!)
 *   --execute          Actually perform deletions (default: dry run only)
 * 
 * Examples:
 *   node scripts/cleanup-funds.js --pattern TEST  # Dry run for TEST* funds
 *   node scripts/cleanup-funds.js --all --execute # Delete ALL funds
 */

const { pool } = require('../src/database/connection');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  pattern: null,
  all: false,
  execute: false
};

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--all') {
    options.all = true;
  } else if (arg === '--execute') {
    options.execute = true;
  } else if (arg === '--pattern' && i + 1 < args.length) {
    options.pattern = args[++i];
  }
}

// Validate arguments
if (!options.all && !options.pattern) {
  console.error('Error: Must specify either --all or --pattern PREFIX');
  process.exit(1);
}

// Main execution function
async function main() {
  const client = await pool.connect();
  
  try {
    // Check if we're in dry-run or execute mode
    console.log(`Mode: ${options.execute ? 'EXECUTE' : 'DRY RUN'}`);
    
    // Step 1: Determine which columns exist in the funds table
    const { hasCode, hasFundCode } = await checkColumnsExist(client);
    
    if (!hasCode && !hasFundCode) {
      console.error('Error: Neither "code" nor "fund_code" columns exist in funds table');
      process.exit(1);
    }
    
    // Step 2: Identify funds to delete
    const fundIds = await identifyFundsToDelete(client, hasCode, hasFundCode);
    
    if (fundIds.length === 0) {
      console.log('No matching funds found. Nothing to do.');
      return;
    }
    
    console.log(`Found ${fundIds.length} funds to delete.`);
    
    // Step 3: Count dependencies for reporting
    const counts = await countDependencies(client, fundIds);
    
    // Step 4: Report what would be deleted
    reportDeletions(counts);
    
    // Step 5: Execute deletions if requested
    if (options.execute) {
      await executeDeleteTransaction(client, fundIds, counts);
    } else {
      console.log('\nThis was a dry run. Use --execute to perform deletions.');
    }
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Check which columns exist in the funds table
 */
async function checkColumnsExist(client) {
  const { rows } = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE column_name = 'code') AS has_code,
      COUNT(*) FILTER (WHERE column_name = 'fund_code') AS has_fund_code
    FROM information_schema.columns 
    WHERE table_name = 'funds' AND table_schema = 'public'
  `);
  
  return {
    hasCode: rows[0].has_code > 0,
    hasFundCode: rows[0].has_fund_code > 0
  };
}

/**
 * Identify funds to delete based on pattern or --all flag
 */
async function identifyFundsToDelete(client, hasCode, hasFundCode) {
  let query = 'SELECT id FROM funds WHERE ';
  const params = [];
  
  if (options.all) {
    query = 'SELECT id FROM funds';
  } else {
    const conditions = [];
    let paramIndex = 1;
    
    if (hasCode) {
      conditions.push(`code LIKE $${paramIndex++}`);
      params.push(`${options.pattern}%`);
    }
    
    if (hasFundCode) {
      conditions.push(`fund_code LIKE $${paramIndex++}`);
      params.push(`${options.pattern}%`);
    }
    
    query += conditions.join(' OR ');
  }
  
  const { rows } = await client.query(query, params);
  return rows.map(row => row.id);
}

/**
 * Tiny utility to verify a column exists before we query against it.
 * Prevents runtime errors when running against databases that have not yet
 * been migrated to include newer tables / columns.
 * @param {import('pg').PoolClient} client
 * @param {string} table  lower-case table name
 * @param {string} column lower-case column name
 * @returns {Promise<boolean>}
 */
async function hasColumn(client, table, column) {
  const { rows } = await client.query(
    `SELECT COUNT(*) AS c
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = $1
        AND column_name  = $2`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

/**
 * Count dependencies for reporting
 */
async function countDependencies(client, fundIds) {
  if (fundIds.length === 0) return {};
  
  // Prepare the IN clause and parameters
  const placeholders = fundIds.map((_, i) => `$${i + 1}`).join(',');
  
  // Count journal entry items
  const journalItemsResult = await client.query(`
    SELECT COUNT(*) as count FROM journal_entry_items 
    WHERE fund_id IN (${placeholders})
  `, fundIds);
  
  // Identify journal entries that would become empty
  const journalEntriesQuery = `
    SELECT je.id
    FROM journal_entries je
    WHERE EXISTS (
      SELECT 1 FROM journal_entry_items jei
      WHERE jei.journal_entry_id = je.id
      AND jei.fund_id IN (${placeholders})
    )
    AND NOT EXISTS (
      SELECT 1 FROM journal_entry_items jei
      WHERE jei.journal_entry_id = je.id
      AND jei.fund_id NOT IN (${placeholders})
    )
  `;
  
  const journalEntriesResult = await client.query(journalEntriesQuery, fundIds);
  const emptyJournalEntryIds = journalEntriesResult.rows.map(row => row.id);
  
  // Count payment batches
  let paymentBatchesCount = 0;
  if (await hasColumn(client, 'payment_batches', 'fund_id')) {
    const pbRes = await client.query(
      `SELECT COUNT(*) as count
         FROM payment_batches
        WHERE fund_id IN (${placeholders})`,
      fundIds
    );
    paymentBatchesCount = Number(pbRes.rows[0].count);
  }
  
  // Count bank deposit items
  let bankDepositItemsCount = 0;
  let emptyBankDepositIds   = [];
  const hasBDI = await hasColumn(client, 'bank_deposit_items', 'fund_id');
  const hasBD  = await hasColumn(client, 'bank_deposits', 'id'); // table check
  if (hasBDI) {
    const bdiRes = await client.query(
      `SELECT COUNT(*) as count
         FROM bank_deposit_items
        WHERE fund_id IN (${placeholders})`,
      fundIds
    );
    bankDepositItemsCount = Number(bdiRes.rows[0].count);
  }
  
  // Identify bank deposits that would become empty
  if (hasBDI && hasBD) {
    const bankDepositsQuery = `
    SELECT bd.id
    FROM bank_deposits bd
    WHERE EXISTS (
      SELECT 1 FROM bank_deposit_items bdi
      WHERE bdi.deposit_id = bd.id
      AND bdi.fund_id IN (${placeholders})
    )
    AND NOT EXISTS (
      SELECT 1 FROM bank_deposit_items bdi
      WHERE bdi.deposit_id = bd.id
      AND bdi.fund_id NOT IN (${placeholders})
    )
  `;
  
    const bankDepositsResult = await client.query(bankDepositsQuery, fundIds);
    emptyBankDepositIds = bankDepositsResult.rows.map(r => r.id);
  }
  
  // Count budgets entries
  let budgetsCount = 0;
  const hasBudgets = await hasColumn(client, 'budgets', 'fund_id');
  if (hasBudgets) {
    const budgetsRes = await client.query(
      `SELECT COUNT(*) as count
         FROM budgets
        WHERE fund_id IN (${placeholders})`,
      fundIds
    );
    budgetsCount = Number(budgetsRes.rows[0].count);
  }
  
  return {
    funds: fundIds.length,
    journalEntryItems: parseInt(journalItemsResult.rows[0].count),
    journalEntries: emptyJournalEntryIds.length,
    paymentBatches: paymentBatchesCount,
    bankDepositItems: bankDepositItemsCount,
    bankDeposits: emptyBankDepositIds.length,
    budgets: budgetsCount,
    emptyJournalEntryIds,
    emptyBankDepositIds
  };
}

/**
 * Report what would be deleted
 */
function reportDeletions(counts) {
  console.log('\nDELETION SUMMARY:');
  console.log('================');
  console.log(`Funds: ${counts.funds}`);
  console.log(`Journal Entry Items: ${counts.journalEntryItems}`);
  console.log(`Journal Entries (that would become empty): ${counts.journalEntries}`);
  console.log(`Payment Batches: ${counts.paymentBatches}`);
  console.log(`Bank Deposit Items: ${counts.bankDepositItems}`);
  console.log(`Bank Deposits (that would become empty): ${counts.bankDeposits}`);
  if (counts.budgets !== undefined) {
    console.log(`Budgets: ${counts.budgets}`);
  }
  console.log('================');
  console.log(`TOTAL ROWS AFFECTED: ${
    counts.funds + 
    counts.journalEntryItems + 
    counts.journalEntries + 
    counts.paymentBatches + 
    counts.bankDepositItems + 
    counts.bankDeposits +
    (counts.budgets || 0)
  }`);
}

/**
 * Execute deletions in a transaction
 */
async function executeDeleteTransaction(client, fundIds, counts) {
  if (fundIds.length === 0) return;
  
  console.log('\nExecuting deletions in a transaction...');
  
  // Prepare the IN clause and parameters
  const placeholders = fundIds.map((_, i) => `$${i + 1}`).join(',');
  
  try {
    // Start transaction
    await client.query('BEGIN');
    
    // Step 1: Delete journal entry items
    if (counts.journalEntryItems > 0) {
      const journalItemsResult = await client.query(`
        DELETE FROM journal_entry_items 
        WHERE fund_id IN (${placeholders})
      `, fundIds);
      console.log(`Deleted ${journalItemsResult.rowCount} journal entry items.`);
    }
    
    // Step 2: Delete journal entries that are now empty
    if (counts.journalEntries > 0 && counts.emptyJournalEntryIds.length > 0) {
      const jeIds = counts.emptyJournalEntryIds;
      const jePlaceholders = jeIds.map((_, i) => `$${i + 1}`).join(',');
      
      const journalEntriesResult = await client.query(`
        DELETE FROM journal_entries 
        WHERE id IN (${jePlaceholders})
      `, jeIds);
      console.log(`Deleted ${journalEntriesResult.rowCount} empty journal entries.`);
    }
    
    // Step 3: Delete payment batches
    if (counts.paymentBatches > 0) {
      const paymentBatchesResult = await client.query(`
        DELETE FROM payment_batches 
        WHERE fund_id IN (${placeholders})
      `, fundIds);
      console.log(`Deleted ${paymentBatchesResult.rowCount} payment batches.`);
    }
    
    // Step 4: Delete bank deposit items
    if (counts.bankDepositItems > 0) {
      const bankDepositItemsResult = await client.query(`
        DELETE FROM bank_deposit_items 
        WHERE fund_id IN (${placeholders})
      `, fundIds);
      console.log(`Deleted ${bankDepositItemsResult.rowCount} bank deposit items.`);
    }
    
    // Step 5: Delete bank deposits that are now empty
    if (counts.bankDeposits > 0 && counts.emptyBankDepositIds.length > 0) {
      const bdIds = counts.emptyBankDepositIds;
      const bdPlaceholders = bdIds.map((_, i) => `$${i + 1}`).join(',');
      
      const bankDepositsResult = await client.query(`
        DELETE FROM bank_deposits 
        WHERE id IN (${bdPlaceholders})
      `, bdIds);
      console.log(`Deleted ${bankDepositsResult.rowCount} empty bank deposits.`);
    }
    
    // Step 6: Delete budgets entries
    if (counts.budgets > 0) {
      const budgetsResult = await client.query(`
        DELETE FROM budgets 
        WHERE fund_id IN (${placeholders})
      `, fundIds);
      console.log(`Deleted ${budgetsResult.rowCount} budget entries.`);
    }
    
    // Step 7: Finally delete the funds
    const fundsResult = await client.query(`
      DELETE FROM funds 
      WHERE id IN (${placeholders})
    `, fundIds);
    console.log(`Deleted ${fundsResult.rowCount} funds.`);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('\nTransaction committed successfully.');
    
    // Final report
    const finalCounts = {
      funds: fundsResult.rowCount,
      journalEntryItems: counts.journalEntryItems,
      journalEntries: counts.journalEntries,
      paymentBatches: counts.paymentBatches,
      bankDepositItems: counts.bankDepositItems,
      bankDeposits: counts.bankDeposits,
      budgets: counts.budgets || 0
    };
    
    console.log('\nFINAL DELETION REPORT:');
    console.log(JSON.stringify(finalCounts, null, 2));
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during transaction, rolled back:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
