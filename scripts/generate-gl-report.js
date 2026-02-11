#!/usr/bin/env node
/**
 * Generate General Ledger Report (Excel)
 * 
 * Creates a GL report matching the format of the legacy system export.
 * Groups journal entry items by account, showing beginning balance,
 * all transactions for the period, and ending balance.
 * 
 * Usage: node scripts/generate-gl-report.js --month=12 --year=2024 [--output=filename.xlsx]
 */

require('dotenv').config();

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getDbConfig } = require('../src/db/db-config');

const pool = new Pool(getDbConfig());

/**
 * Parse command line arguments
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = { month: null, year: null, output: null };
    
    for (const arg of args) {
        if (arg.startsWith('--month=')) {
            result.month = parseInt(arg.split('=')[1]);
        } else if (arg.startsWith('--year=')) {
            result.year = parseInt(arg.split('=')[1]);
        } else if (arg.startsWith('--output=')) {
            result.output = arg.split('=')[1];
        }
    }
    
    return result;
}

/**
 * Format number as currency string with commas and parentheses for negatives
 */
function formatCurrency(num) {
    if (num === null || num === undefined) return '';
    const n = parseFloat(num) || 0;
    const abs = Math.abs(n);
    const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return n < 0 ? `(${formatted})` : formatted;
}

/**
 * Format date as MM/DD/YYYY
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
}

/**
 * Get the last day of a month
 */
function getLastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

async function generateGLReport(month, year, outputFile) {
    console.log(`Generating GL Report for ${month}/${year}...`);
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = getLastDayOfMonth(year, month);
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
    
    console.log(`Period: ${startDate} to ${endDate}`);
    
    // Get all accounts with their beginning balances
    const accountsResult = await pool.query(`
        SELECT 
            a.id,
            a.account_code,
            a.description,
            a.beginning_balance,
            a.beginning_balance_date
        FROM accounts a
        ORDER BY a.account_code
    `);
    
    const accounts = accountsResult.rows;
    console.log(`Found ${accounts.length} accounts`);
    
    // Get all posted journal entry items for the period
    const itemsResult = await pool.query(`
        SELECT 
            jei.account_id,
            je.entry_date,
            je.reference_number,
            je.description as je_description,
            jei.description as line_description,
            jei.debit,
            jei.credit,
            a.account_code,
            a.description as account_description
        FROM journal_entry_items jei
        JOIN journal_entries je ON je.id = jei.journal_entry_id
        JOIN accounts a ON a.id = jei.account_id
        WHERE je.status = 'Posted'
          AND je.entry_date >= $1
          AND je.entry_date <= $2
        ORDER BY a.account_code, je.entry_date, je.id
    `, [startDate, endDate]);
    
    console.log(`Found ${itemsResult.rows.length} journal entry items for the period`);
    
    // Group items by account
    const itemsByAccount = new Map();
    for (const item of itemsResult.rows) {
        const key = item.account_id;
        if (!itemsByAccount.has(key)) {
            itemsByAccount.set(key, []);
        }
        itemsByAccount.get(key).push(item);
    }
    
    // Calculate beginning balance for each account
    // Beginning balance = account.beginning_balance + sum of all posted transactions before the period
    const priorBalancesResult = await pool.query(`
        SELECT 
            jei.account_id,
            SUM(COALESCE(jei.debit, 0) - COALESCE(jei.credit, 0)) as prior_activity
        FROM journal_entry_items jei
        JOIN journal_entries je ON je.id = jei.journal_entry_id
        WHERE je.status = 'Posted'
          AND je.entry_date < $1
        GROUP BY jei.account_id
    `, [startDate]);
    
    const priorBalances = new Map();
    for (const row of priorBalancesResult.rows) {
        priorBalances.set(row.account_id, parseFloat(row.prior_activity) || 0);
    }
    
    // Build the spreadsheet data
    const rows = [];
    
    // Title row
    rows.push([`Period To Date Actual + Allocation Ledger for Period Ending ${month}/${lastDay}/${year}`]);
    rows.push([]); // Empty row
    
    // Header row
    rows.push(['Account', 'Description', 'Demo Desc', 'Date', 'Source', 'JE', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']);
    
    // Process each account that has activity or a balance
    for (const account of accounts) {
        const accountItems = itemsByAccount.get(account.id) || [];
        const baseBalance = parseFloat(account.beginning_balance) || 0;
        const priorActivity = priorBalances.get(account.id) || 0;
        const beginningBalance = baseBalance + priorActivity;
        
        // Skip accounts with no beginning balance and no activity
        if (beginningBalance === 0 && accountItems.length === 0) {
            continue;
        }
        
        // Account code with trailing 000 (as in the original format)
        const fullAccountCode = account.account_code + ' 000';
        
        // Beginning Balance row
        rows.push([
            `Beginning Balance ${fullAccountCode}`,
            null, null, null, null, null, null, null, null, null,
            formatCurrency(beginningBalance)
        ]);
        
        // Transaction rows
        let runningBalance = beginningBalance;
        let totalDebits = 0;
        let totalCredits = 0;
        
        for (const item of accountItems) {
            const debit = parseFloat(item.debit) || 0;
            const credit = parseFloat(item.credit) || 0;
            runningBalance = runningBalance + debit - credit;
            totalDebits += debit;
            totalCredits += credit;
            
            // Use line description if available, otherwise use JE description
            const description = item.line_description || item.je_description || '';
            
            rows.push([
                fullAccountCode,
                account.description,
                '', // Demo Desc (empty)
                formatDate(item.entry_date),
                'JE', // Source
                '', // JE number (we don't have this field currently)
                item.reference_number || '',
                description,
                debit > 0 ? formatCurrency(debit) : null,
                credit > 0 ? formatCurrency(credit) : null,
                formatCurrency(runningBalance)
            ]);
        }
        
        // Ending Balance row
        rows.push([
            `Ending Balance ${fullAccountCode}`,
            null, null, null, null, null, null, null,
            formatCurrency(totalDebits),
            formatCurrency(totalCredits),
            formatCurrency(runningBalance)
        ]);
    }
    
    console.log(`Generated ${rows.length} rows`);
    
    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_array ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.aoa_to_sheet(rows);
    
    // Set column widths
    ws['!cols'] = [
        { wch: 35 },  // Account
        { wch: 30 },  // Description
        { wch: 10 },  // Demo Desc
        { wch: 12 },  // Date
        { wch: 8 },   // Source
        { wch: 8 },   // JE
        { wch: 15 },  // Reference
        { wch: 50 },  // Description
        { wch: 15 },  // Debit
        { wch: 15 },  // Credit
        { wch: 15 },  // Balance
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'SHEET1');
    
    // Write file
    const outputPath = outputFile || path.join(__dirname, `../uploads/${String(month).padStart(2, '0')}${year}GL-generated.xlsx`);
    XLSX.writeFile(wb, outputPath);
    
    console.log(`Report saved to: ${outputPath}`);
    
    await pool.end();
}

// Main
const args = parseArgs();

if (!args.month || !args.year) {
    console.error('Usage: node scripts/generate-gl-report.js --month=MM --year=YYYY [--output=filename.xlsx]');
    console.error('Example: node scripts/generate-gl-report.js --month=12 --year=2024');
    process.exit(1);
}

if (args.month < 1 || args.month > 12) {
    console.error('Month must be between 1 and 12');
    process.exit(1);
}

generateGLReport(args.month, args.year, args.output)
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch(err => {
        console.error('Error generating report:', err);
        process.exit(1);
    });
