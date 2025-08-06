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
// In a production system, this should be a database table
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
            await client.query('BEGIN');

            const { transactionId, entryDate, debit, credit, accountCode, fundCode, description } = mapping;
            
            // Group data by transaction ID
            const transactions = data.reduce((acc, row) => {
                const txId = row[transactionId];
                if (!acc[txId]) {
                    acc[txId] = [];
                }
                acc[txId].push(row);
                return acc;
            }, {});

            const totalTransactions = Object.keys(transactions).length;
            let processedTransactions = 0;

            for (const txId in transactions) {
                const lines = transactions[txId];
                const firstLine = lines[0];

                // Create Journal Entry
                const jeResult = await client.query(
                    `INSERT INTO journal_entries (reference_number, entry_date, description, total_amount, status, created_by, import_id)
                     VALUES ($1, $2, $3, $4, 'Posted', 'AccuFund Import', $5) RETURNING id, entity_id`,
                    [
                        txId,
                        new Date(firstLine[entryDate]),
                        firstLine[description] || 'AccuFund Import',
                        lines.reduce((sum, l) => sum + parseFloat(l[debit] || 0), 0),
                        importId
                    ]
                );
                const journalEntryId = jeResult.rows[0].id;
                const defaultEntityId = jeResult.rows[0].entity_id; // Use the default entity of the JE

                // Create Journal Entry Lines
                for (const line of lines) {
                    // Find account and fund IDs
                    const accountRes = await client.query('SELECT id FROM accounts WHERE code = $1 LIMIT 1', [line[accountCode]]);
                    const fundRes = await client.query('SELECT id FROM funds WHERE code = $1 LIMIT 1', [line[fundCode]]);
                    
                    const account_id = accountRes.rows[0]?.id;
                    const fund_id = fundRes.rows[0]?.id;

                    if (!account_id) {
                        throw new Error(`Account code "${line[accountCode]}" not found for transaction ${txId}.`);
                    }

                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [
                            journalEntryId,
                            account_id,
                            fund_id,
                            parseFloat(line[debit] || 0),
                            parseFloat(line[credit] || 0),
                            line[description] || ''
                        ]
                    );
                }

                processedTransactions++;
                importJobs[importId].progress = Math.floor((processedTransactions / totalTransactions) * 100);
                importJobs[importId].processedRecords += lines.length;
            }

            await client.query('COMMIT');
            importJobs[importId].status = 'completed';
            importJobs[importId].endTime = new Date();
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`Import ${importId} failed:`, error);
            importJobs[importId].status = 'failed';
            importJobs[importId].errors.push(error.message);
            importJobs[importId].endTime = new Date();
        } finally {
            client.release();
        }
    }, 100); // Start after 100ms
}));

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
