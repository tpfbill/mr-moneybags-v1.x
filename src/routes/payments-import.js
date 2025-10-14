// src/routes/payments-import.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Upload destination (ephemeral)
const upload = multer({ dest: 'uploads/' });

// In-memory job tracker
const importJobs = {};

// --- Helper Functions ---

function parseAccountingAmount(v) {
    if (v == null) return 0;
    let t = String(v).trim();
    let neg = false;
    if (/^\(.+\)$/.test(t)) { neg = true; t = t.replace(/^\(|\)$/g, ''); }
    t = t.replace(/[,$\s]/g, '');
    const num = parseFloat(t);
    return isNaN(num) ? 0 : (neg ? -num : num);
}

function parseDateMDY(input) {
    if (!input) return null;
    const s = String(input).trim();
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    let mm = parseInt(m[1], 10);
    let dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
    const dt = new Date(yy, mm - 1, dd);
    return isNaN(dt.getTime()) ? null : dt;
}

async function lookupAccountId(db, accountCode) {
    if (!accountCode) return null;
    const normalizedCode = accountCode.trim();
    const r = await db.query('SELECT id FROM accounts WHERE account_code = $1 LIMIT 1', [normalizedCode]);
    return r.rows[0]?.id || null;
}

async function lookupFundedApAccountId(db, expenseAccountId) {
    if (!expenseAccountId) return null;
    const expenseAccountRes = await db.query('SELECT fund_number FROM accounts WHERE id = $1', [expenseAccountId]);
    if (!expenseAccountRes.rows.length) return null;
    const fundNumber = expenseAccountRes.rows[0].fund_number;

    const apAccountRes = await db.query(
        `SELECT id FROM accounts WHERE classification = 'Liability' AND description ILIKE '%Accounts Payable%' AND fund_number = $1`,
        [fundNumber]
    );
    return apAccountRes.rows[0]?.id || null;
}

async function lookupBankGlAccountId(db, bankAccountName) {
    if (!bankAccountName) return null;
    const r = await db.query('SELECT gl_account_id FROM bank_accounts WHERE account_name = $1 LIMIT 1', [bankAccountName.trim()]);
    return r.rows[0]?.gl_account_id || null;
}

async function resolveVendorId(db, { zid, name }) {
    if (zid) {
        const rz = await db.query('SELECT id FROM vendors WHERE LOWER(zid) = LOWER($1) LIMIT 1', [zid]);
        if (rz.rows[0]?.id) return rz.rows[0].id;
    }
    if (name) {
        const rn = await db.query('SELECT id FROM vendors WHERE LOWER(name) = LOWER($1)', [name]);
        if (rn.rows.length === 1) return rn.rows[0].id;
    }
    return null;
}


// --- API Endpoints ---

router.post('/analyze', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath);

    const rows = parse(content, { columns: true, skip_empty_lines: true });
    const headers = rows.length ? Object.keys(rows[0]) : [];

    const suggestedMapping = {};
    headers.forEach(header => {
        const h = header.toLowerCase();
        if (h.includes('payment') && h.includes('id')) suggestedMapping.paymentId = header;
        else if (h.includes('account') && h.includes('no')) suggestedMapping.accountNo = header;
        else if (h.includes('amount')) suggestedMapping.amount = header;
        else if (h.includes('bank')) suggestedMapping.bankAccountName = header;
        else if (h.includes('payee') || h.includes('vendor')) suggestedMapping.vendorName = header;
        else if (h.includes('zid')) suggestedMapping.vendorZid = header;
        else if (h.includes('date')) suggestedMapping.effectiveDate = header;
        else if (h.includes('description') || h.includes('memo')) suggestedMapping.memo = header;
        else if (h.includes('invoice')) suggestedMapping.invoiceNumber = header;
        else if (h.includes('reference')) suggestedMapping.reference = header;
    });

    res.json({ headers, suggestedMapping, recordCount: rows.length, sampleData: rows.slice(0, 5) });
}));

router.post('/process', asyncHandler(async (req, res) => {
    const { data, mapping, filename } = req.body || {};
    if (!Array.isArray(data) || !data.length) return res.status(400).json({ error: 'No data provided.' });
    if (!mapping) return res.status(400).json({ error: 'Mapping is required.' });

    const jobId = crypto.randomUUID();
    importJobs[jobId] = {
        id: jobId, status: 'processing', progress: 0, totalRecords: data.length, processedRecords: 0,
        errors: [], logs: [], createdBatches: [], createdItems: 0, createdJEs: [],
        startTime: new Date(), filename: filename || null
    };

    res.status(202).json({ message: 'Import started', id: jobId });

    setTimeout(async () => {
        const client = await pool.connect();
        const job = importJobs[jobId];
        try {
            await client.query('BEGIN');

            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                const logPrefix = `Row ${i + 1}:`;

                try {
                    const amount = parseAccountingAmount(row[mapping.amount]);
                    if (!amount) {
                        job.logs.push({ i: i + 1, level: 'warn', msg: 'Skipped row with zero amount.' });
                        continue;
                    }
                    
                    const expenseAccountId = await lookupAccountId(client, row[mapping.accountNo]);
                    if (!expenseAccountId) throw new Error(`Expense account '${row[mapping.accountNo]}' not found.`);

                    const apAccountId = await lookupFundedApAccountId(client, expenseAccountId);
                    if (!apAccountId) throw new Error(`Could not find a matching fund-specific AP account for expense account ${row[mapping.accountNo]}.`);

                    const bankGlAccountId = await lookupBankGlAccountId(client, row[mapping.bankAccountName]);
                    if (!bankGlAccountId) throw new Error(`Could not find a bank account named '${row[mapping.bankAccountName]}'.`);

                    const vendorId = await resolveVendorId(client, { zid: row[mapping.vendorZid], name: row[mapping.vendorName] });
                    if (!vendorId) throw new Error(`Vendor not found (zid/name): ${row[mapping.vendorZid] || row[mapping.vendorName]}`);

                    const expenseAccountRes = await client.query('SELECT entity_id FROM accounts WHERE id = $1', [expenseAccountId]);
                    const entityId = expenseAccountRes.rows[0].entity_id;

                    const jeDate = parseDateMDY(row[mapping.effectiveDate]) || new Date();
                    const description = row[mapping.memo] || row[mapping.invoiceNumber] || 'Payment Import';
                    const reference = row[mapping.reference] || row[mapping.invoiceNumber] || `IMPORT-${jobId}-${i}`;
                    
                    // Idempotency Check
                    const dupJe = await client.query('SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1', [reference]);
                    if (dupJe.rows.length) {
                        job.logs.push({ i: i + 1, level: 'warn', msg: `Duplicate JE skipped (ref: ${reference})` });
                        continue;
                    }
                    
                    // JE 1: Expense -> AP
                    const je1Res = await client.query(
                        `INSERT INTO journal_entries (entity_id, entry_date, description, total_amount, status, created_by, import_id, reference_number)
                         VALUES ($1, $2, $3, $4, 'Posted', 'Payments Import', $5, $6) RETURNING id`,
                        [entityId, jeDate, `Expense: ${description}`, amount, jobId, reference]
                    );
                    const je1Id = je1Res.rows[0].id;
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
                        [je1Id, expenseAccountId, amount, apAccountId]
                    );
                    job.createdJEs.push(je1Id);

                    // JE 2: AP -> Bank
                    const je2Res = await client.query(
                        `INSERT INTO journal_entries (entity_id, entry_date, description, total_amount, status, created_by, import_id, reference_number)
                         VALUES ($1, $2, $3, $4, 'Posted', 'Payments Import', $5, $6) RETURNING id`,
                        [entityId, jeDate, `Payment: ${description}`, amount, jobId, reference]
                    );
                    const je2Id = je2Res.rows[0].id;
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, debit, credit) VALUES ($1, $2, $3, 0), ($1, $4, 0, $3)`,
                        [je2Id, apAccountId, amount, bankGlAccountId]
                    );
                    job.createdJEs.push(je2Id);
                    
                    job.logs.push({ i: i + 1, level: 'success', msg: `Successfully processed payment for ${amount}` });

                } catch (lineError) {
                    job.logs.push({ i: i + 1, level: 'error', msg: `${logPrefix} ${lineError.message}` });
                    job.errors.push(`${logPrefix} ${lineError.message}`);
                }
            }

            await client.query('COMMIT');
            job.status = 'completed';
        } catch (e) {
            await client.query('ROLLBACK');
            job.status = 'failed';
            job.errors.push(e.message || String(e));
        } finally {
            job.progress = 100;
            job.endTime = new Date();
            client.release();
        }
    }, 50);
}));

router.get('/status/:id', asyncHandler(async (req, res) => {
    const job = importJobs[req.params.id];
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
}));

router.get('/last', asyncHandler(async (req, res) => {
    // This is a simplified version for now, returning the last in-memory job
    const lastJobId = Object.keys(importJobs).pop();
    if (!lastJobId) return res.json({ log: [] });
    const lastJob = importJobs[lastJobId];
    res.json({
        id: lastJob.id,
        created_at: lastJob.startTime,
        filename: lastJob.filename,
        total_records: lastJob.totalRecords,
        processed_records: lastJob.processedRecords,
        created_batches: lastJob.createdBatches.length,
        created_items: lastJob.createdItems,
        created_journal_entries: lastJob.createdJEs.length,
        errors: lastJob.errors.length,
        status: lastJob.status,
        log: lastJob.logs
    });
}));

module.exports = router;
