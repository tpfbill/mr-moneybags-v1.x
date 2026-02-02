#!/usr/bin/env node
/**
 * Import Accounts from Excel
 * 
 * Reads "FINAL-accounts-to-upload.xlsx" and updates/inserts accounts.
 * If an account exists, updates it. If not, creates it.
 * All beginning_balance_date fields are set to 2024-12-01.
 * 
 * Usage: node scripts/import-beginning-balances.js [--dry-run]
 */

require('dotenv').config();

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getDbConfig } = require('../src/db/db-config');

const EXCEL_FILE = path.join(__dirname, '../uploads/FINAL-accounts-to-upload.xlsx');
const BEGINNING_BALANCE_DATE = '2024-12-01';
const LOGS_DIR = path.join(__dirname, '../logs');

const pool = new Pool(getDbConfig());

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Generate log filename with date
const now = new Date();
const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS
const LOG_FILE = path.join(LOGS_DIR, `import-beginning-balances-${dateStr}_${timeStr}.log`);

// Logger that writes to both console and file
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(message);
    logStream.write(line + '\n');
}

function logError(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ERROR: ${message}`;
    console.error(message);
    logStream.write(line + '\n');
}

/**
 * Parse accounting format number (handles parentheses for negatives, commas, dashes)
 * @param {string} value - The accounting format number string
 * @returns {number} - Parsed number (defaults to 0 if invalid/empty)
 */
function parseAccountingNumber(value) {
    if (value === null || value === undefined || value === '') {
        return 0;
    }
    
    let str = String(value).trim();
    
    // Handle dash as zero (accounting format for zero)
    if (str === '-' || str === '- ' || str === ' - ' || str === ' -   ') {
        return 0;
    }
    
    // Check for negative (parentheses format)
    const isNegative = str.startsWith('(') && str.endsWith(')');
    if (isNegative) {
        str = str.slice(1, -1);
    }
    
    // Remove commas, currency symbols, and whitespace
    str = str.replace(/[$,\s]/g, '');
    
    const num = parseFloat(str);
    if (isNaN(num)) {
        return 0;
    }
    
    return isNegative ? -num : num;
}

/**
 * Parse date from Excel format (M/D/YY or similar)
 * @param {string} value - Date string
 * @returns {string} - ISO date string (YYYY-MM-DD)
 */
function parseDate(value) {
    if (!value) return BEGINNING_BALANCE_DATE;
    
    const str = String(value).trim();
    
    // Handle MM/DD/YY format
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (match) {
        let [, month, day, year] = match;
        if (year.length === 2) {
            year = year < 50 ? `20${year}` : `19${year}`;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return BEGINNING_BALANCE_DATE;
}

async function importAccounts(dryRun = false) {
    log(`Log file: ${LOG_FILE}`);
    log(`Reading Excel file: ${EXCEL_FILE}`);
    log(`Beginning balance date: ${BEGINNING_BALANCE_DATE}`);
    log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    log('---');
    
    // Read Excel file
    const workbook = XLSX.readFile(EXCEL_FILE);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { raw: false });
    
    log(`Found ${data.length} rows in sheet "${sheetName}"`);
    
    const client = await pool.connect();
    
    try {
        if (!dryRun) {
            await client.query('BEGIN');
        }
        
        let updated = 0;
        let inserted = 0;
        let errors = 0;
        
        for (const row of data) {
            const accountCode = row['Account']?.trim();
            
            if (!accountCode) {
                continue;
            }
            
            // Parse all fields from Excel
            const entityCode = row['Entity']?.trim() || '';
            const glCode = row['GL Code']?.trim() || '';
            const fundNumber = row['Fund']?.trim() || '';
            const restriction = row['Restriction']?.trim() || '';
            const description = row['Description']?.trim() || '';
            const classification = row['Classification']?.trim() || null;
            const status = row['Status']?.trim() || 'Active';
            // Balance Sheet: 1 = Yes, 0 = No
            const balanceSheetRaw = row['Balance Sheet']?.trim();
            const balanceSheet = balanceSheetRaw === '1' ? 'Yes' : 'No';
            const beginningBalance = parseAccountingNumber(row[' Beginning Balance '] || row['Beginning Balance']);
            const lastUsed = parseDate(row['last used']);
            
            try {
                // Check if account exists
                const checkResult = await client.query(
                    'SELECT id FROM accounts WHERE account_code = $1',
                    [accountCode]
                );
                
                if (checkResult.rows.length > 0) {
                    // Update existing account
                    if (!dryRun) {
                        await client.query(
                            `UPDATE accounts 
                             SET entity_code = $1,
                                 gl_code = $2,
                                 fund_number = $3,
                                 restriction = $4,
                                 description = $5,
                                 classification = $6,
                                 status = $7,
                                 balance_sheet = $8,
                                 beginning_balance = $9,
                                 beginning_balance_date = $10,
                                 last_used = $11
                             WHERE account_code = $12`,
                            [entityCode, glCode, fundNumber, restriction, description, 
                             classification, status, balanceSheet, beginningBalance,
                             BEGINNING_BALANCE_DATE, lastUsed, accountCode]
                        );
                    }
                    log(`  ${dryRun ? '[DRY RUN] Would update' : 'Updated'}: ${accountCode}`);
                    updated++;
                } else {
                    // Insert new account
                    if (!dryRun) {
                        await client.query(
                            `INSERT INTO accounts 
                             (account_code, entity_code, gl_code, fund_number, restriction,
                              description, classification, status, balance_sheet,
                              beginning_balance, beginning_balance_date, last_used)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                            [accountCode, entityCode, glCode, fundNumber, restriction,
                             description, classification, status, balanceSheet,
                             beginningBalance, BEGINNING_BALANCE_DATE, lastUsed]
                        );
                    }
                    log(`  ${dryRun ? '[DRY RUN] Would insert' : 'Inserted'}: ${accountCode}`);
                    inserted++;
                }
            } catch (err) {
                logError(`  Error processing ${accountCode}: ${err.message}`);
                errors++;
            }
        }
        
        if (!dryRun) {
            await client.query('COMMIT');
        }
        
        log('---');
        log('Summary:');
        log(`  Accounts updated: ${updated}`);
        log(`  Accounts inserted: ${inserted}`);
        log(`  Errors: ${errors}`);
        
    } catch (err) {
        if (!dryRun) {
            await client.query('ROLLBACK');
        }
        logError('Error during import: ' + err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
        logStream.end();
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');

importAccounts(dryRun)
    .then(() => {
        log('\nImport completed successfully.');
        process.exit(0);
    })
    .catch(err => {
        logError('\nImport failed: ' + err);
        process.exit(1);
    });
