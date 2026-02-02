// src/routes/payments-import.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Upload destination (ephemeral)
const upload = multer({ dest: 'uploads/' });

// Payment logs folder
const LOGS_DIR = path.join(__dirname, '../../..', 'uploads/payment-logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// In-memory job tracker
const importJobs = {};

// --- Helper Functions ---

function parseAccountingAmount(v) {
    if (v == null) return 0;
    let t = String(v).trim();
    if (!t) return 0;
    // Strip leading/trailing quotes
    if (t.startsWith('"') && t.endsWith('"')) {
        t = t.substring(1, t.length - 1).trim();
    }
    let neg = false;
    if (t.startsWith('(') && t.endsWith(')')) {
        neg = true;
        t = t.substring(1, t.length - 1);
    }
    t = t.replace(/[,$\s]/g, '');
    const num = parseFloat(t);
    if (isNaN(num)) return 0;
    return neg ? -num : num;
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

function parseAccountNumber(accountNumber) {
    if (!accountNumber) return { entity_code: null, gl_code: null, fund_number: null };
    const parts = String(accountNumber).split(' ');
    if (parts.length < 3) return { entity_code: null, gl_code: null, fund_number: null };
    return {
        entity_code: parts[0],
        gl_code: parts[1],
        fund_number: parts[2]
    };
}

async function lookupAccountId(db, accountCode) {
    if (!accountCode) return null;
    const normalizedCode = accountCode.trim();
    const r = await db.query('SELECT id FROM accounts WHERE account_code = $1 LIMIT 1', [normalizedCode]);
    return r.rows[0]?.id || null;
}

async function lookupFundedApAccountId(db, expenseAccountId) {
    if (!expenseAccountId) return null;

    // 1. Get the entity_code and fund_number from the expense account
    const expenseAccountRes = await db.query(
        `SELECT entity_code, fund_number FROM accounts WHERE id = $1`,
        [expenseAccountId]
    );
    if (!expenseAccountRes.rows.length) return null;
    const { entity_code, fund_number } = expenseAccountRes.rows[0];

    // 2. Get the GL code for "Accounts Payable"
    const apGlCodeRes = await db.query(`SELECT code FROM gl_codes WHERE description ILIKE '%Accounts Payable%' LIMIT 1`);
    if (!apGlCodeRes.rows.length) return null;
    const apGlCode = apGlCodeRes.rows[0].code;

    // 3. Find the AP account with the matching entity, fund, and GL code
    const apAccountRes = await db.query(
        `SELECT id FROM accounts WHERE entity_code = $1 AND fund_number = $2 AND gl_code = $3`,
        [entity_code, fund_number, apGlCode]
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
        const rz = await db.query('SELECT id FROM vendors WHERE LOWER(TRIM(zid)) = LOWER(TRIM($1)) LIMIT 1', [zid]);
        if (rz.rows[0]?.id) return rz.rows[0].id;
    }
    if (name) {
        const rn = await db.query('SELECT id FROM vendors WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))', [name]);
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
    // Trim headers from the first row to create a clean mapping
    const headers = rows.length ? Object.keys(rows[0]).map(h => h.trim()) : [];

    const suggestedMapping = {};
    headers.forEach(header => {
        const h = header.toLowerCase().trim();
        if ((h.includes('post') || h.includes('effective')) && h.includes('date')) {
            suggestedMapping.effectiveDate = header;
        } else if (h === 'amount') {
            suggestedMapping.amount = header;
        } else if (h.includes('payment') && h.includes('id')) {
            suggestedMapping.paymentId = header;
        } else if (h.includes('account') && h.includes('no')) {
            suggestedMapping.accountNo = header;
        } else if (h.includes('bank')) {
            suggestedMapping.bankAccountName = header;
        } else if (h.includes('payee_zid') || h === 'zid') {
            suggestedMapping.vendorZid = header;
        } else if (h.includes('payee') || h.includes('vendor')) {
            suggestedMapping.vendorName = header;
        } else if (h.includes('description') || h.includes('memo')) {
            suggestedMapping.memo = header;
        } else if (h.includes('invoice') && h.includes('date')) {
            suggestedMapping.invoiceDate = header;
        } else if (h.includes('invoice') && !h.includes('date')) {
            suggestedMapping.invoiceNumber = header;
        } else if (h.includes('reference')) {
            suggestedMapping.reference = header;
        } else if (h.includes('payment') && h.includes('type')) {
            suggestedMapping.paymentType = header;
        } else if (h.includes('1099')) {
            suggestedMapping.ten99Amount = header;
        }
    });

    // Fallbacks for critical fields if they are not yet mapped
    if (!suggestedMapping.effectiveDate) {
        const genericDate = headers.find(h => h.toLowerCase().trim().includes('date'));
        if (genericDate) suggestedMapping.effectiveDate = genericDate;
    }
    if (!suggestedMapping.amount) {
        const genericAmount = headers.find(h => h.toLowerCase().trim().includes('amount'));
        if (genericAmount) suggestedMapping.amount = genericAmount;
    }

    res.json({ headers, suggestedMapping, recordCount: rows.length, sampleData: rows.slice(0, 5) });
}));

router.post('/process', asyncHandler(async (req, res) => {
    const { data, mapping, filename } = req.body || {};
    const currentUserId = req.user && req.user.id ? req.user.id : null;
    if (!currentUserId) return res.status(401).json({ error: 'Authentication required' });
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

            // --- New: Pre-process first row to get batch-level details ---
            let firstRow;
            let firstValidRowIndex = -1;
            for (let i = 0; i < data.length; i++) {
                if (data[i] && parseAccountingAmount(data[i][mapping.amount]) !== 0) {
                    firstRow = data[i];
                    firstValidRowIndex = i;
                    break;
                }
            }

            if (!firstRow) {
                throw new Error("No valid data rows found in the input file.");
            }

            const firstExpenseAccountId = await lookupAccountId(client, firstRow[mapping.accountNo]);
            if (!firstExpenseAccountId) throw new Error(`Could not find expense account from first valid row: ${firstRow[mapping.accountNo]}`);
            
            const firstExpenseAccountRes = await client.query('SELECT entity_code, fund_number FROM accounts WHERE id = $1', [firstExpenseAccountId]);
            if (!firstExpenseAccountRes.rows.length) throw new Error(`Could not find account details for ID ${firstExpenseAccountId}`);
            const { entity_code: firstEntityCode, fund_number: firstFundNumber } = firstExpenseAccountRes.rows[0];

            const firstEntityRes = await client.query('SELECT id FROM entities WHERE code = $1', [firstEntityCode]);
            if (!firstEntityRes.rows.length) throw new Error(`Could not find entity with code ${firstEntityCode}`);
            const batchEntityId = firstEntityRes.rows[0].id;

            const firstFundRes = await client.query('SELECT id FROM funds WHERE fund_number = $1', [firstFundNumber]);
            if (!firstFundRes.rows.length) throw new Error(`Could not find fund with number ${firstFundNumber}`);
            const batchFundId = firstFundRes.rows[0].id;

            let batchDate = parseDateMDY(firstRow[mapping.effectiveDate]) || new Date();
            const batchDescription = `Payments Import${filename ? ` - ${filename}` : ''}`;
            const batchBankName = (firstRow && mapping.bankAccountName) ? (firstRow[mapping.bankAccountName] || null) : null;

            // Create a single payment batch for this job with required fields
            const batchRes = await client.query(
                `INSERT INTO payment_batches (
                    entity_id,
                    fund_id,
                    nacha_settings_id,
                    batch_number,
                    batch_date,
                    effective_date,
                    description,
                    total_amount,
                    total_items,
                    bank_name,
                    status,
                    created_by
                 ) VALUES ($1, $2, NULL, $3, $4, $4, $5, 0, 0, $6, 'draft', $7)
                 RETURNING id`,
                [batchEntityId, batchFundId, `IMPORT-${jobId.substring(0, 8)}`, batchDate, batchDescription, batchBankName, currentUserId]
            );
            const batchId = batchRes.rows[0].id;
            job.createdBatches.push(batchId);
            let batchTotal = 0;

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

                    // JE creation removed; AP and Bank GL lookups no longer required

                    const vendorId = await resolveVendorId(client, { zid: row[mapping.vendorZid], name: row[mapping.vendorName] });
                    if (!vendorId) throw new Error(`Vendor not found (zid/name): ${row[mapping.vendorZid] || row[mapping.vendorName]}`);

                    const expenseAccountRes = await client.query('SELECT entity_code, fund_number FROM accounts WHERE id = $1', [expenseAccountId]);
                    if (!expenseAccountRes.rows.length) throw new Error(`Could not find account details for ID ${expenseAccountId}`);
                    const { entity_code: entityCode, fund_number: fundNumber } = expenseAccountRes.rows[0];

                    // Entity/Fund ID lookups only needed for JE; omit for item import

                    let jeDate = parseDateMDY(row[mapping.effectiveDate]);
                    if (!jeDate) {
                        job.logs.push({ i: i + 1, level: 'warn', msg: `Invalid or missing date '${row[mapping.effectiveDate]}'. Defaulting to today's date.` });
                        jeDate = new Date();
                    }

                    const baseReference = row[mapping.reference] || row[mapping.invoiceNumber] || 'Payment Import';

                    const description = row[mapping.memo] || `${baseReference} - ${row[mapping.invoiceNumber] || 'Payment'}`;
                    
                    // Idempotency against JEs removed (JEs no longer created here)

                    // Parse account number components
                    const { entity_code, gl_code, fund_number } = parseAccountNumber(row[mapping.accountNo]);

                    // Create the payment item record
                    const paymentItemRes = await client.query(
                        `INSERT INTO payment_items (
                            payment_batch_id, vendor_id, amount, status,
                            reference, post_date, payee_zid, invoice_date, invoice_number,
                            account_number, bank_name, payment_type, "1099_amount", payment_id,
                            entity_code, gl_code, fund_number, description
                         ) VALUES ($1, $2, $3, 'Pending', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
                        [
                            batchId, vendorId, amount,
                            row[mapping.reference], jeDate, row[mapping.vendorZid], parseDateMDY(row[mapping.invoiceDate]), row[mapping.invoiceNumber],
                            row[mapping.accountNo], row[mapping.bankAccountName], row[mapping.paymentType], parseAccountingAmount(row[mapping.ten99Amount]), row[mapping.paymentId],
                            entity_code, gl_code, fund_number, description
                        ]
                    );
                    const paymentItemId = paymentItemRes.rows[0].id;
                    job.createdItems++;
                    
                    job.logs.push({ i: i + 1, level: 'success', msg: `Imported payment item for ${amount}` });

                    batchTotal += amount;

                } catch (lineError) {
                    job.logs.push({ i: i + 1, level: 'error', msg: `${logPrefix} ${lineError.message}` });
                    job.errors.push(`${logPrefix} ${lineError.message}`);
                }
            }

            // Update the payment batch with final numbers
            if (job.createdItems > 0) {
                await client.query(
                    `UPDATE payment_batches 
                     SET total_amount = $1, total_items = $2, status = 'processed'
                     WHERE id = $3`,
                    [batchTotal, job.createdItems, batchId]
                );
            } else {
                // If no rows were processed, mark batch as failed
                await client.query(`UPDATE payment_batches SET status = 'error' WHERE id = $1`, [batchId]);
            }

            await client.query('COMMIT');
            job.status = 'completed';

            // Save log file for this batch
            const logFilename = `import-${batchId}.json`;
            const logPath = path.join(LOGS_DIR, logFilename);
            const logData = {
                jobId: job.id,
                batchId,
                filename: job.filename,
                startTime: job.startTime,
                endTime: new Date(),
                totalRecords: job.totalRecords,
                createdItems: job.createdItems,
                errors: job.errors,
                logs: job.logs
            };
            fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
            job.logFile = logFilename;

            // Update batch with log file reference
            await pool.query(
                `UPDATE payment_batches SET log_file = $1 WHERE id = $2`,
                [logFilename, batchId]
            );
        } catch (e) {
            await client.query('ROLLBACK');
            job.status = 'failed';
            job.errors.push(e.message || String(e));

            // Save error log even on failure
            if (job.createdBatches.length > 0) {
                const failedBatchId = job.createdBatches[0];
                const logFilename = `import-${failedBatchId}.json`;
                const logPath = path.join(LOGS_DIR, logFilename);
                const logData = {
                    jobId: job.id,
                    batchId: failedBatchId,
                    filename: job.filename,
                    startTime: job.startTime,
                    endTime: new Date(),
                    totalRecords: job.totalRecords,
                    createdItems: job.createdItems,
                    errors: job.errors,
                    logs: job.logs,
                    status: 'failed'
                };
                try {
                    fs.writeFileSync(logPath, JSON.stringify(logData, null, 2));
                    job.logFile = logFilename;
                    await pool.query(
                        `UPDATE payment_batches SET log_file = $1 WHERE id = $2`,
                        [logFilename, failedBatchId]
                    );
                } catch (_) { /* ignore log write errors */ }
            }
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

// GET /api/vendor-payments/import/log/:batchId - Retrieve log file for a batch
router.get('/log/:batchId', asyncHandler(async (req, res) => {
    const { batchId } = req.params;
    
    // First try to get log_file from database
    const { rows } = await pool.query(
        'SELECT log_file FROM payment_batches WHERE id = $1',
        [batchId]
    );
    
    let logFilename = rows[0]?.log_file;
    
    // Fallback: try default naming convention
    if (!logFilename) {
        logFilename = `import-${batchId}.json`;
    }
    
    const logPath = path.join(LOGS_DIR, logFilename);
    
    if (!fs.existsSync(logPath)) {
        return res.status(404).json({ error: 'Log file not found for this batch' });
    }
    
    try {
        const logContent = fs.readFileSync(logPath, 'utf8');
        const logData = JSON.parse(logContent);
        res.json(logData);
    } catch (e) {
        res.status(500).json({ error: 'Failed to read log file: ' + e.message });
    }
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
