// src/routes/import.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const path = require('path');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// In-memory store for import job status
const importJobs = {};

/**
 * POST /api/import/analyze
 * Analyzes an uploaded CSV file and returns column headers and suggested mappings
 */
router.post('/analyze', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath); // Clean up uploaded file

    const records = parse(fileContent, { columns: true, skip_empty_lines: true });
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    
    // Suggest mappings based on header names
    const suggestedMapping = {};
    headers.forEach(header => {
        const headerLower = header.toLowerCase();
        
        if (headerLower.includes('transaction') || headerLower.includes('id')) {
            suggestedMapping.transactionId = header;
        } else if (headerLower.includes('date')) {
            suggestedMapping.entryDate = header;
        } else if (headerLower.includes('debit') || headerLower.includes('dr') || headerLower === 'dr') {
            suggestedMapping.debit = header;
        } else if (headerLower.includes('credit') || headerLower.includes('cr') || headerLower === 'cr') {
            suggestedMapping.credit = header;
        } else if (headerLower.includes('account') && headerLower.includes('code')) {
            suggestedMapping.accountCode = header;
        } else if (headerLower.includes('fund') && headerLower.includes('code')) {
            suggestedMapping.fundCode = header;
        } else if (headerLower.includes('desc')) {
            suggestedMapping.description = header;
        }
    });

    res.json({
        headers,
        suggestedMapping,
        recordCount: records.length,
        sampleData: records.slice(0, 5) // First 5 records as sample
    });
}));

/**
 * POST /api/import/validate
 * Validates import data before processing
 */
router.post('/validate', asyncHandler(async (req, res) => {
    const { data, mapping } = req.body;
    
    if (!data || !Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'No data provided or invalid data format.' });
    }
    
    if (!mapping || !mapping.transactionId || !mapping.entryDate || 
        (!mapping.debit && !mapping.credit) || !mapping.accountCode) {
        return res.status(400).json({ error: 'Required mapping fields are missing.' });
    }
    
    const issues = [];
    
    // Check for required fields in each row
    data.forEach((row, index) => {
        if (!row[mapping.transactionId]) {
            issues.push(`Row ${index + 1}: Missing transaction ID.`);
        }
        if (!row[mapping.entryDate]) {
            issues.push(`Row ${index + 1}: Missing entry date.`);
        }
        if (!row[mapping.accountCode]) {
            issues.push(`Row ${index + 1}: Missing account code.`);
        }
        if ((!row[mapping.debit] || parseFloat(row[mapping.debit]) === 0) && 
            (!row[mapping.credit] || parseFloat(row[mapping.credit]) === 0)) {
            issues.push(`Row ${index + 1}: Missing both debit and credit amounts.`);
        }
    });
    
    // Check for balanced transactions
    const transactions = {};
    data.forEach(row => {
        const txId = row[mapping.transactionId];
        
        if (!transactions[txId]) {
            transactions[txId] = { debit: 0, credit: 0, rowCount: 0 };
        }
        transactions[txId].debit += parseFloat(row[mapping.debit] || 0);
        transactions[txId].credit += parseFloat(row[mapping.credit] || 0);
        transactions[txId].rowCount++;
    });

    let unbalancedCount = 0;
    for (const txId in transactions) {
        if (Math.abs(transactions[txId].debit - transactions[txId].credit) > 0.01) {
            unbalancedCount++;
        }
    }

    if (unbalancedCount > 0) {
        issues.push(`${unbalancedCount} transactions are unbalanced (debits do not equal credits).`);
    }

    res.json({
        isValid: issues.length === 0,
        issues,
        summary: {
            totalRows: data.length,
            uniqueTransactions: Object.keys(transactions).length,
            unbalancedTransactions: unbalancedCount
        }
    });
}));

/**
 * POST /api/import/process
 * Starts the data import process
 */
router.post('/process', asyncHandler(async (req, res) => {
    const { data, mapping } = req.body;
    const importId = crypto.randomUUID();

    importJobs[importId] = {
        id: importId,
        status: 'processing',
        progress: 0,
        totalRecords: data.length,
        processedRecords: 0,
        errors: [],
        startTime: new Date(),
    };

    // Return immediately and process in the background
    res.status(202).json({ message: 'Import process started.', importId });

    // --- Non-blocking import process ---
    setTimeout(async () => {
        const client = await pool.connect();
        try {
            const { transactionId, entryDate, debit, credit, accountCode, fundCode, description, paymentId } = mapping;

            await client.query('BEGIN');

            const userRes = await client.query('SELECT first_name, last_name, id FROM users WHERE id = $1', [req.user.id]);
            const user = userRes.rows[0] || { first_name: 'System', last_name: 'User', id: null };
            const createdBy = `Payment import - ${user.first_name} ${user.last_name}`;

            const log = async (level, msg, pItemId = null) => {
                await client.query(
                    'INSERT INTO batch_payment_log (import_id, payment_item_id, log_level, message) VALUES ($1, $2, $3, $4)',
                    [importId, pItemId, level, msg]
                );
            };

            const bankGlAccountId = await getBankGlAccountId(client, importJobs[importId].batchId);
            if (!bankGlAccountId) throw new Error(`No Bank GL account could be determined for this payment batch.`);

            for (const line of data) {
                let paymentItemId = null;
                try {
                    const paymentStatus = line[paymentId] ? 'completed' : 'pending';
                    const amount = parseFloat(line[debit] || line[credit] || 0);

                    const expenseAccountId = await lookupAccountId(client, line[accountCode]);
                    if (!expenseAccountId) throw new Error(`Expense account with code '${line[accountCode]}' not found.`);

                    const apAccountId = await lookupFundedApAccountId(client, expenseAccountId);
                    if (!apAccountId) throw new Error(`Could not find a matching fund-specific AP account for expense account ${line[accountCode]}.`);

                    const paymentItemRes = await client.query(
                        `INSERT INTO payment_items (payment_batch_id, vendor_id, amount, description, status)
                         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                        [
                            importJobs[importId].batchId,
                            await lookupVendorId(client, line.vendor_code),
                            amount,
                            line[description] || '',
                            paymentStatus
                        ]
                    );
                    paymentItemId = paymentItemRes.rows[0].id;

                    // JE 1: Expense -> AP
                    const je1Res = await client.query(
                        `INSERT INTO journal_entries (entity_id, entry_date, description, total_amount, status, created_by, import_id)
                         VALUES ($1, $2, $3, $4, 'Posted', $5, $6) RETURNING id`,
                        [importJobs[importId].entityId, new Date(line[entryDate]), `Expense for ${line[description]}`, amount, createdBy, importId]
                    );
                    const je1Id = je1Res.rows[0].id;
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
                        [je1Id, expenseAccountId, amount, apAccountId]
                    );

                    // JE 2: AP -> Bank
                    const je2Res = await client.query(
                        `INSERT INTO journal_entries (entity_id, entry_date, description, total_amount, status, created_by, import_id)
                         VALUES ($1, $2, $3, $4, 'Posted', $5, $6) RETURNING id`,
                        [importJobs[importId].entityId, new Date(line[entryDate]), `Payment for ${line[description]}`, amount, createdBy, importId]
                    );
                    const je2Id = je2Res.rows[0].id;
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
                        [je2Id, apAccountId, amount, bankGlAccountId]
                    );

                    // Back-post the JE ID to the payment item
                    await client.query('UPDATE payment_items SET journal_entry_id = $1 WHERE id = $2', [je1Id, paymentItemId]);

                    await log('SUCCESS', `Successfully processed payment for ${amount}`, paymentItemId);
                    importJobs[importId].processedRecords++;

                } catch (lineError) {
                    await log('ERROR', `Failed to process line: ${lineError.message}`, paymentItemId);
                    importJobs[importId].errors.push(`Row ${importJobs[importId].processedRecords + 1}: ${lineError.message}`);
                }
            }

            await client.query('COMMIT');
            importJobs[importId].status = 'completed';
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Import ${importId} failed:`, error);
            importJobs[importId].status = 'failed';
            importJobs[importId].errors.push(error.message);
        } finally {
            importJobs[importId].progress = 100;
            importJobs[importId].endTime = new Date();
            client.release();
        }
    }, 100);
}));

// Helpers
async function lookupAccountId(db, acCode) {
    if (!acCode) return null;
    const r2 = await db.query('SELECT id FROM accounts WHERE account_code = $1 LIMIT 1', [acCode]);
    return r2.rows[0]?.id || null;
}

async function lookupFundedApAccountId(db, expenseAccountId) {
    // 1. Get the full account code from the expense account
    const expenseAccountRes = await db.query(
        `SELECT account_code FROM accounts WHERE id = $1`,
        [expenseAccountId]
    );
    if (!expenseAccountRes.rows.length) return null;
    const expenseAccountCode = expenseAccountRes.rows[0].account_code;

    // 2. Deconstruct the expense account code (E GGGG FFF RR)
    const parts = expenseAccountCode.split(' ');
    if (parts.length < 3) return null; // Invalid format
    const entityCode = parts[0];
    const fundNumber = parts[2];

    // 3. Get the GL code for "Accounts Payable"
    const apGlCodeRes = await db.query(`SELECT code FROM gl_codes WHERE description ILIKE '%Accounts Payable%' LIMIT 1`);
    if (!apGlCodeRes.rows.length) return null;
    const apGlCode = apGlCodeRes.rows[0].code;

    // 4. Construct the target AP account code
    // The AP account for a specific fund typically uses '00' for the restriction part
    const targetApAccountCode = `${entityCode} ${apGlCode} ${fundNumber} 00`;

    // 5. Find the AP account with the constructed code
    const apAccountRes = await db.query(
        `SELECT id FROM accounts WHERE account_code = $1`,
        [targetApAccountCode]
    );
    return apAccountRes.rows[0]?.id || null;
}

async function getBankGlAccountId(db, paymentBatchId) {
    const batchRes = await db.query('SELECT nacha_settings_id FROM payment_batches WHERE id = $1', [paymentBatchId]);
    if (!batchRes.rows.length) return null;

    const nachaSettingsId = batchRes.rows[0].nacha_settings_id;
    const settingsRes = await db.query('SELECT settlement_account_id FROM company_nacha_settings WHERE id = $1', [nachaSettingsId]);
    if (!settingsRes.rows.length) return null;

    const settlementAccountId = settingsRes.rows[0].settlement_account_id;
    const bankAccountRes = await db.query('SELECT gl_account_id FROM bank_accounts WHERE id = $1', [settlementAccountId]);
    if (!bankAccountRes.rows.length) return null;

    return bankAccountRes.rows[0].gl_account_id;
}

async function lookupVendorId(db, vCode) {
    if (!vCode) return null;
    const r = await db.query('SELECT id FROM vendors WHERE vendor_code = $1 LIMIT 1', [vCode]);
    return r.rows[0]?.id || null;
}

/**
 * GET /api/import/status/:importId
 * Gets the status of an ongoing import
 */
router.get('/status/:importId', asyncHandler(async (req, res) => {
    const { importId } = req.params;
    const job = importJobs[importId];
    if (job) {
        res.json(job);
    } else {
        res.status(404).json({ error: 'Import job not found.' });
    }
}));

/**
 * GET /api/import/history
 * Gets the history of all import jobs
 */
router.get('/history', asyncHandler(async (req, res) => {
    // Return a summary of jobs, not the full data
    const history = Object.values(importJobs).map(job => ({
        id: job.id,
        status: job.status,
        startTime: job.startTime,
        endTime: job.endTime,
        totalRecords: job.totalRecords,
        errors: job.errors
    }));
    res.json(history.reverse());
}));

/**
 * POST /api/import/rollback/:importId
 * Rolls back an import by deleting all associated journal entries
 */
router.post('/rollback/:importId', asyncHandler(async (req, res) => {
    const { importId } = req.params;
    const job = importJobs[importId];

    if (!job) {
        return res.status(404).json({ error: 'Import job not found.' });
    }
    if (job.status !== 'completed' && job.status !== 'failed') {
        return res.status(400).json({ error: 'Cannot rollback an import that is still in progress.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const deleteResult = await client.query(
            'DELETE FROM journal_entries WHERE import_id = $1',
            [importId]
        );
        await client.query('COMMIT');
        
        job.status = 'rolled_back';
        job.rollbackTime = new Date();
        
        res.json({ message: `Rollback successful. Deleted ${deleteResult.rowCount} journal entries.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Rollback for import ${importId} failed:`, error);
        res.status(500).json({ error: 'Rollback failed.', message: error.message });
    } finally {
        client.release();
    }
}));

module.exports = router;
