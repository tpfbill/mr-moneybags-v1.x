/**
 * @file db-verify-data.js
 * @description Script to verify data in the Non-Profit Fund Accounting System database.
 * This script queries and displays data from the main tables to confirm proper setup.
 */

const { Client } = require('pg');
const { getDbConfig } = require('./src/db/db-config');

// Create a PostgreSQL client with the resolved configuration
const client = new Client(getDbConfig());

// Helper to format currency values
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(amount);
}

// Helper to format dates
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Function to query and display entities
async function displayEntities() {
  console.log('\n===== ENTITIES =====');
  
  const result = await client.query(`
    SELECT 
      id, 
      name, 
      code, 
      parent_entity_id, 
      is_consolidated, 
      fiscal_year_start, 
      base_currency, 
      status
    FROM entities
    ORDER BY name
  `);
  
  if (result.rows.length === 0) {
    console.log('No entities found in the database.');
    return;
  }
  
  // Format for display
  const formattedEntities = result.rows.map(entity => ({
    'ID': entity.id.substring(0, 8) + '...',
    'Name': entity.name,
    'Code': entity.code,
    'Parent ID': entity.parent_entity_id ? entity.parent_entity_id.substring(0, 8) + '...' : 'None',
    'Consolidates': entity.is_consolidated ? 'Yes' : 'No',
    'Fiscal Year Start': entity.fiscal_year_start,
    'Currency': entity.base_currency,
    'Status': entity.status
  }));
  
  console.table(formattedEntities);
  console.log(`Total entities: ${result.rows.length}`);
}

// Function to query and display accounts
async function displayAccounts() {
  console.log('\n===== ACCOUNTS =====');
  
  const result = await client.query(`
    SELECT 
      a.id, 
      a.code, 
      a.name, 
      a.type, 
      a.balance, 
      a.status, 
      e.name as entity_name
    FROM accounts a
    JOIN entities e ON a.entity_id = e.id
    ORDER BY e.name, a.code
  `);
  
  if (result.rows.length === 0) {
    console.log('No accounts found in the database.');
    return;
  }
  
  // Format for display
  const formattedAccounts = result.rows.map(account => ({
    'ID': account.id.substring(0, 8) + '...',
    'Code': account.code,
    'Name': account.name,
    'Type': account.type,
    'Balance': formatCurrency(account.balance),
    'Status': account.status,
    'Entity': account.entity_name
  }));
  
  console.table(formattedAccounts);
  console.log(`Total accounts: ${result.rows.length}`);
}

// Function to query and display funds
async function displayFunds() {
  console.log('\n===== FUNDS =====');
  
  const result = await client.query(`
    SELECT 
      f.id, 
      f.code, 
      f.name, 
      f.type, 
      f.balance, 
      f.status, 
      e.name as entity_name
    FROM funds f
    JOIN entities e ON f.entity_id = e.id
    ORDER BY e.name, f.code
  `);
  
  if (result.rows.length === 0) {
    console.log('No funds found in the database.');
    return;
  }
  
  // Format for display
  const formattedFunds = result.rows.map(fund => ({
    'ID': fund.id.substring(0, 8) + '...',
    'Code': fund.code,
    'Name': fund.name,
    'Type': fund.type,
    'Balance': formatCurrency(fund.balance),
    'Status': fund.status,
    'Entity': fund.entity_name
  }));
  
  console.table(formattedFunds);
  console.log(`Total funds: ${result.rows.length}`);
}

// Function to query and display journal entries with their lines
async function displayJournalEntries() {
  console.log('\n===== JOURNAL ENTRIES =====');
  
  const jeResult = await client.query(`
    SELECT 
      je.id, 
      je.reference_number, 
      je.entry_date, 
      je.description, 
      je.total_amount, 
      je.status,
      e.name as entity_name
    FROM journal_entries je
    JOIN entities e ON je.entity_id = e.id
    ORDER BY je.entry_date DESC, je.reference_number
  `);
  
  if (jeResult.rows.length === 0) {
    console.log('No journal entries found in the database.');
    return;
  }
  
  // Format journal entries for display
  const formattedJEs = jeResult.rows.map(je => ({
    'ID': je.id.substring(0, 8) + '...',
    'Reference': je.reference_number,
    'Date': formatDate(je.entry_date),
    'Description': je.description,
    'Amount': formatCurrency(je.total_amount),
    'Status': je.status,
    'Entity': je.entity_name
  }));
  
  console.table(formattedJEs);
  console.log(`Total journal entries: ${jeResult.rows.length}`);
  
  // Display lines for each journal entry
  console.log('\n===== JOURNAL ENTRY LINES =====');
  
  for (const je of jeResult.rows) {
    console.log(`\nLines for Journal Entry: ${je.reference_number} - ${je.description}`);
    
    const linesResult = await client.query(`
      SELECT 
        jel.id,
        jel.debit_amount,
        jel.credit_amount,
        jel.description,
        a.code as account_code,
        a.name as account_name,
        f.code as fund_code,
        f.name as fund_name
      FROM journal_entry_lines jel
      JOIN accounts a ON jel.account_id = a.id
      LEFT JOIN funds f ON jel.fund_id = f.id
      WHERE jel.journal_entry_id = $1
      ORDER BY jel.id
    `, [je.id]);
    
    if (linesResult.rows.length === 0) {
      console.log('  No lines found for this journal entry.');
      continue;
    }
    
    // Format journal entry lines for display
    const formattedLines = linesResult.rows.map(line => ({
      'Account': `${line.account_code} - ${line.account_name}`,
      'Fund': line.fund_code ? `${line.fund_code} - ${line.fund_name}` : 'N/A',
      'Debit': formatCurrency(line.debit_amount),
      'Credit': formatCurrency(line.credit_amount),
      'Description': line.description
    }));
    
    console.table(formattedLines);
    
    // Calculate and display totals
    const totalDebits = linesResult.rows.reduce((sum, line) => sum + parseFloat(line.debit_amount), 0);
    const totalCredits = linesResult.rows.reduce((sum, line) => sum + parseFloat(line.credit_amount), 0);
    
    console.log(`  Total Debits: ${formatCurrency(totalDebits)}`);
    console.log(`  Total Credits: ${formatCurrency(totalCredits)}`);
    console.log(`  Balanced: ${Math.abs(totalDebits - totalCredits) < 0.01 ? 'Yes ✓' : 'No ✗'}`);
  }
}

// Main function to run all verifications
async function verifyDatabaseData() {
  console.log('=================================================');
  console.log('  NONPROFIT FUND ACCOUNTING DATABASE VERIFICATION');
  console.log('=================================================');
  
  try {
    // Connect to database
    await client.connect();
    console.log('Connected to database successfully');
    
    // Display data from each table
    await displayEntities();
    await displayAccounts();
    await displayFunds();
    await displayJournalEntries();
    
    console.log('\n=================================================');
    console.log('  DATABASE VERIFICATION COMPLETE');
    console.log('=================================================');
    
  } catch (error) {
    console.error('\n❌ ERROR DURING DATABASE VERIFICATION:');
    console.error('Error message:', error.message);
    
    if (error.code) {
      console.error('Error code:', error.code);
    }
    
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  } finally {
    // Always close the client
    try {
      await client.end();
      console.log('\nDatabase connection closed');
    } catch (err) {
      console.error('Error closing database connection:', err.message);
    }
  }
}

// Run the verification
verifyDatabaseData().catch(err => {
  console.error('Unhandled error in verification script:', err);
  process.exit(1);
});
