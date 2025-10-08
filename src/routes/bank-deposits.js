// src/routes/bank-deposits.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const crypto = require('crypto');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// Multer – in-memory for CSV upload
const upload = multer({ storage: multer.memoryStorage() });

function canon(s) {
    return (s == null ? '' : String(s)).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normHeader(k = '') {
    return String(k).replace(/^['"]+|['"]+$/g, '')
        .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseAmount(v) {
    if (v == null) return 0;
    let t = String(v).trim();
    // Accounting format: parentheses indicate negative
    let neg = false;
    if (/^\(.+\)$/.test(t)) {
        neg = true;
        t = t.replace(/^\(|\)$/g, '');
    }
    // Remove commas, spaces, quotes
    t = t.replace(/[",\s]/g, '');
    const num = parseFloat(t);
    if (isNaN(num)) return 0;
    return neg ? -num : num;
}

function parseDateMDY(input) {
    if (!input) return null;
    const s = String(input).trim();
    // Accept M/D/Y or MM/DD/YYYY (also single-digit month/day)
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) {
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    let mm = parseInt(m[1], 10);
    let dd = parseInt(m[2], 10);
    let yy = parseInt(m[3], 10);
    if (yy < 100) yy += yy >= 70 ? 1900 : 2000; // 2-digit year pivot
    const dt = new Date(yy, mm - 1, dd);
    if (isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
}

/**
 * GET /api/bank-deposits
 * Returns all bank deposits with optional filtering
 */
router.get('/', asyncHandler(async (req, res) => {
    const { 
        status, 
        bank_account_id, 
        start_date, 
        end_date,
        deposit_type,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT d.*, ba.account_name, ba.bank_name,
               CONCAT(u.first_name, ' ', u.last_name) as created_by_name
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u ON d.created_by = u.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND d.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (bank_account_id) {
        query += ` AND d.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (start_date) {
        query += ` AND d.deposit_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND d.deposit_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    if (deposit_type) {
        query += ` AND d.deposit_type = $${paramIndex++}`;
        params.push(deposit_type);
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY d.deposit_date DESC, d.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit);
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get deposit totals
    const depositIds = rows.map(row => row.id);
    let itemTotals = {};
    
    if (depositIds.length > 0) {
        const itemQuery = await pool.query(`
            SELECT deposit_id, SUM(amount) as total_amount, COUNT(*) as item_count
            FROM bank_deposit_items
            WHERE deposit_id = ANY($1)
            GROUP BY deposit_id
        `, [depositIds]);
        
        itemTotals = itemQuery.rows.reduce((acc, row) => {
            acc[row.deposit_id] = {
                total_amount: parseFloat(row.total_amount),
                item_count: parseInt(row.item_count)
            };
            return acc;
        }, {});
    }
    
    // Add totals to deposit objects
    const depositsWithTotals = rows.map(deposit => ({
        ...deposit,
        total_amount: itemTotals[deposit.id]?.total_amount || 0,
        item_count: itemTotals[deposit.id]?.item_count || 0
    }));
    
    res.json({
        data: depositsWithTotals,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit)
        }
    });
}));

/**
 * POST /api/bank-deposits
 * Creates a new bank deposit
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number,
        description,
        memo,
        status = 'Draft'
    } = req.body;
    
    // Validate required fields
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account is required' });
    }
    
    if (!deposit_date) {
        return res.status(400).json({ error: 'Deposit date is required' });
    }
    
    if (!deposit_type) {
        return res.status(400).json({ error: 'Deposit type is required' });
    }
    
    // Validate status
    const validStatuses = ['Draft', 'Submitted', 'Cleared', 'Rejected'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Bank account not found' });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO bank_deposits (
            bank_account_id,
            deposit_date,
            deposit_type,
            reference_number,
            description,
            memo,
            status,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number || null,
        description || null,
        memo || null,
        status,
        req.user?.id
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * GET /api/bank-deposits/types
 * Returns available deposit types
 */
router.get('/types', asyncHandler(async (req, res) => {
    // Return predefined deposit types
    const depositTypes = [
        { id: 'Regular',   name: 'Regular Deposit' },
        { id: 'ATM',       name: 'ATM Deposit' },
        { id: 'Mobile',    name: 'Mobile Deposit' },
        { id: 'Wire',      name: 'Wire Transfer' },
        { id: 'ACH',       name: 'ACH Transfer' },
        { id: 'Cash',      name: 'Cash Deposit' },
        { id: 'Mixed',     name: 'Mixed Deposit' }
    ];

    res.json(depositTypes);
}));

/**
 * GET /api/bank-deposits/item-types
 * Returns available deposit item types
 */
router.get('/item-types', asyncHandler(async (req, res) => {
    // Return predefined deposit item types
    const itemTypes = [
        { id: 'Cash',          name: 'Cash' },
        { id: 'Check',         name: 'Check' },
        { id: 'Electronic',    name: 'Electronic Transfer' },
        { id: 'Money Order',   name: 'Money Order' },
        { id: 'Cashier Check', name: 'Cashier\'s Check' },
        { id: 'Other',         name: 'Other' }
    ];

    res.json(itemTypes);
}));

/**
 * POST /api/bank-deposits/batched/import
 * Import AccuFund-style batched deposits CSV
 */
router.post('/batched/import', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    let records;
    try {
        records = parse(req.file.buffer.toString('utf8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
    } catch (e) {
        return res.status(400).json({ error: `Invalid CSV: ${e.message}` });
    }

    if (!records.length) return res.status(400).json({ error: 'CSV has no data rows' });

    // Header mapping
    const headers = Object.keys(records[0]).reduce((acc, h) => {
        acc[normHeader(h)] = h; return acc;
    }, {});

    // New CSV headers expected:
    // Reference, Activity Date, Description, Amount, Account No, Deposit zID, Bank
    // Backward compatible with legacy 'account_number' and 'amount_'
    const requiredBase = ['reference', 'activity_date', 'description', 'bank'];
    const missing = [];
    for (const k of requiredBase) {
        if (!headers[k]) missing.push(k);
    }
    const hasAmount = headers['amount'] || headers['amount_'];
    if (!hasAmount) missing.push('amount');
    const hasAcct = headers['account_no'] || headers['account_number'];
    if (!hasAcct) missing.push('account_no');
    if (missing.length) return res.status(400).json({ error: `Missing required headers: ${missing.join(', ')}` });

    // Group by reference
    const groups = new Map();
    const log = [];
    let lineNo = 1; // header line = 1
    for (const row of records) {
        lineNo++;
        const ref = (row[headers['reference']] || '').toString().trim();
        const dateStr = (row[headers['activity_date']] || '').toString().trim();
        const desc = (row[headers['description']] || '').toString().trim();
        const amt = parseAmount(row[headers['amount'] || headers['amount_']]);
        const acct = (row[headers['account_no']] || row[headers['account_number']] || '').toString();
        const depositZid = (row[headers['deposit_zid']] || '').toString().trim();
        const bankName = (row[headers['bank']] || '').toString().trim();

        if (!ref || !dateStr || !acct || !bankName) {
            log.push({ line: lineNo, status: 'Failed', message: 'Missing reference/date/account_number/bank' });
            continue;
        }
        if (!amt || amt === 0) {
            log.push({ line: lineNo, status: 'Failed', message: 'Amount missing or zero' });
            continue;
        }

        const key = ref;
        const item = { line: lineNo, ref, dateStr, desc, amt, acctCanon: canon(acct), bankName, depositZid };
        const arr = groups.get(key) || [];
        arr.push(item);
        groups.set(key, arr);
    }

    if (groups.size === 0) {
        return res.status(400).json({ error: 'No valid rows parsed', log });
    }

    const client = await pool.connect();
    let createdDeposits = 0;
    let createdItems = 0;
    let errors = 0;
    try {
        await client.query('BEGIN');

        for (const [ref, items] of groups.entries()) {
            // Enforce global uniqueness of reference_number
            const dup = await client.query(
                'SELECT id FROM bank_deposits WHERE reference_number = $1 LIMIT 1',
                [ref]
            );
            if (dup.rows.length) {
                errors++;
                log.push({ line: items[0].line, status: 'Failed', message: `Duplicate reference number: ${ref}` });
                continue;
            }

            // Resolve bank account using bank name from first item
            const bankName = items[0].bankName;
            const baRes = await client.query(
                `SELECT id FROM bank_accounts 
                 WHERE lower(account_name) = lower($1) OR lower(bank_name) = lower($1)
                    OR account_name ILIKE '%'||$1||'%' OR bank_name ILIKE '%'||$1||'%'
                 ORDER BY (status = 'Active') DESC, account_name ASC LIMIT 1`,
                [bankName]
            );
            const bank_account_id = baRes.rows[0]?.id;
            if (!bank_account_id) {
                errors++;
                log.push({ line: items[0].line, status: 'Failed', message: `Bank account not found for "${bankName}" (ref ${ref})` });
                continue;
            }

            // Fetch bank account details for entity and cash account mapping
            const baFull = await client.query(
                'SELECT id, entity_id, cash_account_id FROM bank_accounts WHERE id = $1',
                [bank_account_id]
            );
            const entity_id = baFull.rows[0]?.entity_id || null;
            const cash_account_id = baFull.rows[0]?.cash_account_id || null;
            if (!cash_account_id) {
                errors++;
                log.push({ line: items[0].line, status: 'Failed', message: `Bank account missing cash_account_id mapping (ref ${ref})` });
                continue;
            }

            // Determine deposit date (first item's date)
            const ymd = parseDateMDY(items[0].dateStr) || new Date().toISOString().slice(0, 10);

            // Build valid items with resolved account and fund
            const validItems = [];
            const fundTotals = new Map(); // fund_id -> sum amount (for cash debits)
            const entityCodeFreq = new Map(); // canonical entity_code -> total amount
            for (const it of items) {
                // Resolve account record
                const accRes = await client.query(
                    "SELECT id, entity_code, fund_number, restriction FROM accounts WHERE regexp_replace(lower(account_code), '[^a-z0-9]', '', 'g') = $1 LIMIT 1",
                    [it.acctCanon]
                );
                const account_id = accRes.rows[0]?.id;
                if (!account_id) {
                    errors++;
                    log.push({ line: it.line, status: 'Failed', message: `Account not found for code (${it.acctCanon}) – ref ${ref}` });
                    continue;
                }

                // Resolve fund by entity_code + fund_number + restriction
                const { entity_code, fund_number, restriction } = accRes.rows[0];
                const fundRes = await client.query(
                    `SELECT id FROM funds WHERE lower(entity_code)=lower($1) AND fund_number=$2 AND restriction=$3 LIMIT 1`,
                    [entity_code, fund_number, restriction]
                );
                const fund_id = fundRes.rows[0]?.id || null;
                if (!fund_id) {
                    errors++;
                    log.push({ line: it.line, status: 'Failed', message: `Fund not found for entity=${entity_code} fund=${fund_number} restr=${restriction}` });
                    continue;
                }

                validItems.push({ ...it, account_id, fund_id, account_entity_code: entity_code });
                fundTotals.set(fund_id, (fundTotals.get(fund_id) || 0) + it.amt);
                // Tally entity_code frequency by amount to choose JE owning entity
                const key = (entity_code || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
                if (key) entityCodeFreq.set(key, (entityCodeFreq.get(key) || 0) + Math.abs(it.amt));
            }

            if (validItems.length === 0) {
                errors++;
                log.push({ line: items[0].line, status: 'Failed', message: `No valid items for reference ${ref}` });
                continue;
            }

            // Create deposit (Submitted immediately)
            const depRes = await client.query(
                `INSERT INTO bank_deposits (bank_account_id, deposit_date, deposit_type, reference_number, description, status, created_by)
                 VALUES ($1,$2,'Mixed',$3,$4,'Submitted',$5) RETURNING id`,
                [bank_account_id, ymd, ref, items[0].desc || `Batched import ${ref}`, req.user?.id]
            );
            const deposit_id = depRes.rows[0].id;
            createdDeposits++;

            // Insert deposit items
            for (const it of validItems) {
                await client.query(
                    `INSERT INTO bank_deposit_items (deposit_id, item_type, amount, description, gl_account_id, created_by)
                     VALUES ($1,'Electronic',$2,$3,$4,$5)`,
                    [deposit_id, it.amt, it.desc || null, it.account_id, req.user?.id]
                );
                createdItems++;
                log.push({ line: it.line, status: 'OK', message: `Added item $${it.amt.toFixed(2)}` });
            }

            // Determine JE owning entity: prefer entity derived from deposit Account No (line account_code)
            let jeEntityId = entity_id; // fallback to bank account's entity
            if (entityCodeFreq.size > 0) {
                // Choose the entity_code with the highest total amount
                const sorted = [...entityCodeFreq.entries()].sort((a, b) => b[1] - a[1]);
                const topEntityCodeCanon = sorted[0][0];
                const entRes = await client.query(
                    "SELECT id FROM entities WHERE regexp_replace(lower(code), '[^a-z0-9]', '', 'g') = $1 LIMIT 1",
                    [topEntityCodeCanon]
                );
                if (entRes.rows[0]?.id) jeEntityId = entRes.rows[0].id;
            }

            // Create Journal Entry (Posted, Auto)
            const jeDesc = `Auto deposit ${ref} for bank account ${bankName}`;
            const jeRes = await client.query(
                `INSERT INTO journal_entries (entity_id, entry_date, reference_number, description, entry_type, status, total_amount, created_by, entry_mode)
                 VALUES ($1,$2,$3,$4,'Revenue','Posted',$5,$6,'Auto') RETURNING id`,
                [
                    jeEntityId,
                    ymd,
                    ref,
                    jeDesc,
                    validItems.reduce((s, v) => s + v.amt, 0),
                    req.user?.id
                ]
            );
            const journal_entry_id = jeRes.rows[0].id;

            // Cash side per fund (net):
            // - If net > 0: Debit cash = net
            // - If net < 0: Credit cash = abs(net)
            // - If net = 0: skip
            for (const [fund_id, amt] of fundTotals.entries()) {
                const n = Number(amt) || 0;
                if (n > 0) {
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, description, debit, credit)
                         VALUES ($1,$2,$3,$4,$5,0)`,
                        [journal_entry_id, cash_account_id, fund_id, `Deposit ${ref} cash`, n]
                    );
                } else if (n < 0) {
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, description, debit, credit)
                         VALUES ($1,$2,$3,$4,0,$5)`,
                        [journal_entry_id, cash_account_id, fund_id, `Deposit ${ref} cash reversal`, Math.abs(n)]
                    );
                }
            }

            // Revenue side per item:
            // - If amt > 0: Credit revenue = amt
            // - If amt < 0: Debit revenue = abs(amt) (reversal)
            for (const it of validItems) {
                const a = Number(it.amt) || 0;
                if (a > 0) {
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, description, debit, credit)
                         VALUES ($1,$2,$3,$4,0,$5)`,
                        [journal_entry_id, it.account_id, it.fund_id, it.desc || `Deposit ${ref}`, a]
                    );
                } else if (a < 0) {
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, description, debit, credit)
                         VALUES ($1,$2,$3,$4,$5,0)`,
                        [journal_entry_id, it.account_id, it.fund_id, (it.desc ? `${it.desc} reversal` : `Deposit ${ref} reversal`), Math.abs(a)]
                    );
                }
            }

            // Link deposit items to the JE
            await client.query(
                `UPDATE bank_deposit_items SET journal_entry_id = $1 WHERE deposit_id = $2`,
                [journal_entry_id, deposit_id]
            );
        }

        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: e.message, log });
    } finally {
        client.release();
    }

    // Persist import log (best-effort; non-fatal on failure)
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bank_deposit_import_runs (
                id UUID PRIMARY KEY,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                created_by INTEGER NULL,
                filename TEXT NULL,
                created_deposits INTEGER NOT NULL DEFAULT 0,
                created_items INTEGER NOT NULL DEFAULT 0,
                errors INTEGER NOT NULL DEFAULT 0,
                log JSONB NOT NULL
            )`);
        const runId = crypto.randomUUID();
        await pool.query(
            `INSERT INTO bank_deposit_import_runs (id, created_by, filename, created_deposits, created_items, errors, log)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [runId, req.user?.id || null, req.file?.originalname || null, createdDeposits, createdItems, errors, JSON.stringify(log)]
        );
        return res.json({
            id: runId,
            created_deposits: createdDeposits,
            created_items: createdItems,
            errors,
            log
        });
    } catch (err) {
        // If logging fails, still return successful import response
        return res.json({
            created_deposits: createdDeposits,
            created_items: createdItems,
            errors,
            log,
            warn: 'Import saved, but logging of results failed.'
        });
    }
}));

// Return the most recent batched deposit import log
router.get('/batched/import/last', asyncHandler(async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS bank_deposit_import_runs (
                id UUID PRIMARY KEY,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                created_by INTEGER NULL,
                filename TEXT NULL,
                created_deposits INTEGER NOT NULL DEFAULT 0,
                created_items INTEGER NOT NULL DEFAULT 0,
                errors INTEGER NOT NULL DEFAULT 0,
                log JSONB NOT NULL
            )`);
        const uid = req.user?.id;
        let q;
        if (uid) {
            q = await pool.query(
                `SELECT id, created_at, filename, created_deposits, created_items, errors, log
                 FROM bank_deposit_import_runs
                 WHERE created_by = $1
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [uid]
            );
        } else {
            q = await pool.query(
                `SELECT id, created_at, filename, created_deposits, created_items, errors, log
                 FROM bank_deposit_import_runs
                 ORDER BY created_at DESC
                 LIMIT 1`
            );
        }
        if (!q.rows.length) return res.json({ log: [], created_deposits: 0, created_items: 0, errors: 0 });
        const r = q.rows[0];
        return res.json({ id: r.id, created_at: r.created_at, filename: r.filename, created_deposits: r.created_deposits, created_items: r.created_items, errors: r.errors, log: r.log });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
}));

/**
 * GET /api/bank-deposits/:id
 * Returns a specific bank deposit with its items
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get deposit details
    const depositQuery = await pool.query(`
        SELECT d.*, ba.account_name, ba.bank_name,
               CONCAT(u1.first_name, ' ', u1.last_name) as created_by_name,
               CONCAT(u2.first_name, ' ', u2.last_name) as updated_by_name
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u1 ON d.created_by = u1.id
        LEFT JOIN users u2 ON d.updated_by = u2.id
        WHERE d.id = $1
    `, [id]);
    
    if (depositQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositQuery.rows[0];
    
    // Get deposit items
    const itemsQuery = await pool.query(`
        SELECT di.*, a.description as account_description, a.code as account_code
        FROM bank_deposit_items di
        LEFT JOIN accounts a ON di.gl_account_id = a.id
        WHERE di.deposit_id = $1
        ORDER BY di.created_at
    `, [id]);
    
    // Calculate totals
    const totalAmount = itemsQuery.rows.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // Combine all data
    const result = {
        ...deposit,
        items: itemsQuery.rows,
        total_amount: totalAmount,
        item_count: itemsQuery.rows.length
    };
    
    res.json(result);
}));

/**
 * PUT /api/bank-deposits/:id
 * Updates a bank deposit
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number,
        description,
        memo,
        status
    } = req.body;
    
    // Check if deposit exists
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent updates to cleared deposits
    const currentStatus = depositCheck.rows[0].status;
    if (currentStatus === 'Cleared' && status !== 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot modify a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Validate status if provided
    if (status) {
        const validStatuses = ['Draft', 'Submitted', 'Cleared', 'Rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
    }
    
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (bank_account_id) {
        // Validate bank account exists
        const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
        if (bankAccountCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Bank account not found' });
        }
        
        updateFields.push(`bank_account_id = $${paramIndex++}`);
        params.push(bank_account_id);
    }
    
    if (deposit_date) {
        updateFields.push(`deposit_date = $${paramIndex++}`);
        params.push(deposit_date);
    }
    
    if (deposit_type) {
        updateFields.push(`deposit_type = $${paramIndex++}`);
        params.push(deposit_type);
    }
    
    if (reference_number !== undefined) {
        updateFields.push(`reference_number = $${paramIndex++}`);
        params.push(reference_number);
    }
    
    if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(description);
    }
    
    if (memo !== undefined) {
        updateFields.push(`memo = $${paramIndex++}`);
        params.push(memo);
    }
    
    if (status) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
        
        // If status is Cleared, set cleared_date and cleared_by
        if (status === 'Cleared') {
            updateFields.push(`cleared_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`cleared_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
        
        // If status is Submitted, set submitted_date and submitted_by
        if (status === 'Submitted') {
            updateFields.push(`submitted_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`submitted_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
    }
    
    // Add updated_at and updated_by
    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex++}`);
    params.push(req.user?.id);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-deposits/:id
 * Deletes a bank deposit
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists and get status
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent deletion of submitted or cleared deposits
    const status = depositCheck.rows[0].status;
    if (status === 'Submitted' || status === 'Cleared') {
        return res.status(409).json({ 
            error: `Cannot delete a ${status.toLowerCase()} deposit`,
            details: `${status} deposits cannot be deleted. You may reject the deposit instead.`
        });
    }
    
    // Start a transaction to delete deposit and its items
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete deposit items first (foreign key constraint)
        await client.query('DELETE FROM bank_deposit_items WHERE deposit_id = $1', [id]);
        
        // Delete the deposit
        await client.query('DELETE FROM bank_deposits WHERE id = $1', [id]);
        
        await client.query('COMMIT');
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * GET /api/bank-deposits/:id/items
 * Returns items for a specific bank deposit
 */
router.get('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists
    const depositCheck = await pool.query('SELECT id FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Get deposit items with account information
    const { rows } = await pool.query(`
        SELECT di.*, a.description as account_description, a.code as account_code
        FROM bank_deposit_items di
        LEFT JOIN accounts a ON di.gl_account_id = a.id
        WHERE di.deposit_id = $1
        ORDER BY di.created_at
    `, [id]);
    
    // Calculate total
    const total = rows.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    res.json({
        items: rows,
        total_amount: total,
        count: rows.length
    });
}));

/**
 * POST /api/bank-deposits/:id/items
 * Adds items to a bank deposit
 */
router.post('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    // Check if deposit exists and get status
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent adding items to cleared deposits
    const status = depositCheck.rows[0].status;
    if (status === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot add items to a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Validate items
    if (items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
    }
    
    // Start a transaction to add all items
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const insertedItems = [];
        
        for (const item of items) {
            // Validate required fields
            if (!item.item_type) {
                throw new Error('Item type is required for all items');
            }
            
            if (!item.amount || parseFloat(item.amount) <= 0) {
                throw new Error('Valid amount is required for all items');
            }
            
            if (item.item_type === 'Check' && !item.check_number) {
                throw new Error('Check number is required for check items');
            }
            
            if (!item.gl_account_id) {
                throw new Error('GL account is required for all items');
            }
            
            // Validate GL account exists
            const accountCheck = await client.query('SELECT id FROM accounts WHERE id = $1', [item.gl_account_id]);
            if (accountCheck.rows.length === 0) {
                throw new Error(`GL account ${item.gl_account_id} not found`);
            }
            
            // Insert the item
            const { rows } = await client.query(`
                INSERT INTO bank_deposit_items (
                    deposit_id,
                    item_type,
                    amount,
                    check_number,
                    check_date,
                    payer_name,
                    description,
                    gl_account_id,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                id,
                item.item_type,
                parseFloat(item.amount),
                item.check_number || null,
                item.check_date || null,
                item.payer_name || null,
                item.description || null,
                item.gl_account_id,
                req.user?.id
            ]);
            
            insertedItems.push(rows[0]);
        }
        
        // Update deposit's updated_at and updated_by
        await client.query(`
            UPDATE bank_deposits
            SET updated_at = NOW(), updated_by = $1
            WHERE id = $2
        `, [req.user?.id, id]);
        
        await client.query('COMMIT');
        
        res.status(201).json(insertedItems);
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: error.message });
    } finally {
        client.release();
    }
}));

/**
 * PUT /api/bank-deposits/items/:id
 * Updates a deposit item
 */
router.put('/items/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        item_type,
        amount,
        check_number,
        check_date,
        payer_name,
        description,
        gl_account_id
    } = req.body;
    
    // Check if item exists and get deposit info
    const itemCheck = await pool.query(`
        SELECT di.*, bd.status as deposit_status
        FROM bank_deposit_items di
        JOIN bank_deposits bd ON di.deposit_id = bd.id
        WHERE di.id = $1
    `, [id]);
    
    if (itemCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit item not found' });
    }
    
    // Prevent updates to items in cleared deposits
    const depositStatus = itemCheck.rows[0].deposit_status;
    if (depositStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot update items in a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (item_type) {
        updateFields.push(`item_type = $${paramIndex++}`);
        params.push(item_type);
    }
    
    if (amount !== undefined) {
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }
        updateFields.push(`amount = $${paramIndex++}`);
        params.push(parseFloat(amount));
    }
    
    if (check_number !== undefined) {
        updateFields.push(`check_number = $${paramIndex++}`);
        params.push(check_number);
    }
    
    if (check_date !== undefined) {
        updateFields.push(`check_date = $${paramIndex++}`);
        params.push(check_date);
    }
    
    if (payer_name !== undefined) {
        updateFields.push(`payer_name = $${paramIndex++}`);
        params.push(payer_name);
    }
    
    if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(description);
    }
    
    if (gl_account_id) {
        // Validate GL account exists
        const accountCheck = await pool.query('SELECT id FROM accounts WHERE id = $1', [gl_account_id]);
        if (accountCheck.rows.length === 0) {
            return res.status(400).json({ error: 'GL account not found' });
        }
        
        updateFields.push(`gl_account_id = $${paramIndex++}`);
        params.push(gl_account_id);
    }
    
    // Add updated_at
    updateFields.push(`updated_at = NOW()`);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE bank_deposit_items
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    // Update deposit's updated_at and updated_by
    await pool.query(`
        UPDATE bank_deposits
        SET updated_at = NOW(), updated_by = $1
        WHERE id = $2
    `, [req.user?.id, itemCheck.rows[0].deposit_id]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-deposits/items/:id
 * Removes a deposit item
 */
router.delete('/items/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if item exists and get deposit info
    const itemCheck = await pool.query(`
        SELECT di.deposit_id, bd.status as deposit_status
        FROM bank_deposit_items di
        JOIN bank_deposits bd ON di.deposit_id = bd.id
        WHERE di.id = $1
    `, [id]);
    
    if (itemCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit item not found' });
    }
    
    // Prevent deletion of items in cleared deposits
    const depositStatus = itemCheck.rows[0].deposit_status;
    if (depositStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot remove items from a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Delete the item
    await pool.query('DELETE FROM bank_deposit_items WHERE id = $1', [id]);
    
    // Update deposit's updated_at and updated_by
    await pool.query(`
        UPDATE bank_deposits
        SET updated_at = NOW(), updated_by = $1
        WHERE id = $2
    `, [req.user?.id, itemCheck.rows[0].deposit_id]);
    
    res.status(204).send();
}));

/**
 * POST /api/bank-deposits/:id/submit
 * Submit a deposit to the bank
 */
router.post('/:id/submit', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists
    const depositCheck = await pool.query(`
        SELECT d.*, COUNT(di.id) as item_count, SUM(di.amount) as total_amount
        FROM bank_deposits d
        LEFT JOIN bank_deposit_items di ON d.id = di.deposit_id
        WHERE d.id = $1
        GROUP BY d.id
    `, [id]);
    
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositCheck.rows[0];
    
    // Validate deposit status
    if (deposit.status !== 'Draft') {
        return res.status(409).json({ 
            error: `Deposit is already ${deposit.status.toLowerCase()}`,
            details: `Only deposits in Draft status can be submitted`
        });
    }
    
    // Validate deposit has items
    if (parseInt(deposit.item_count) === 0) {
        return res.status(400).json({ 
            error: 'Cannot submit empty deposit',
            details: 'Deposit must have at least one item to submit'
        });
    }
    
    // Update deposit status to Submitted
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET 
            status = 'Submitted',
            submitted_date = NOW(),
            submitted_by = $1,
            updated_at = NOW(),
            updated_by = $1
        WHERE id = $2
        RETURNING *
    `, [req.user?.id, id]);
    
    // Return updated deposit with totals
    const result = {
        ...rows[0],
        item_count: parseInt(deposit.item_count),
        total_amount: parseFloat(deposit.total_amount)
    };
    
    res.json(result);
}));

/**
 * POST /api/bank-deposits/:id/clear
 * Mark a deposit as cleared
 */
router.post('/:id/clear', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { clearing_date, clearing_reference } = req.body;
    
    // Check if deposit exists
    const depositCheck = await pool.query(`
        SELECT d.*, COUNT(di.id) as item_count, SUM(di.amount) as total_amount
        FROM bank_deposits d
        LEFT JOIN bank_deposit_items di ON d.id = di.deposit_id
        WHERE d.id = $1
        GROUP BY d.id
    `, [id]);
    
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositCheck.rows[0];
    
    // Validate deposit status
    if (deposit.status !== 'Submitted') {
        return res.status(409).json({ 
            error: `Deposit must be submitted before clearing`,
            details: `Only deposits in Submitted status can be cleared. Current status: ${deposit.status}`
        });
    }
    
    // Update deposit status to Cleared
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET 
            status = 'Cleared',
            cleared_date = $1,
            clearing_reference = $2,
            cleared_by = $3,
            updated_at = NOW(),
            updated_by = $3
        WHERE id = $4
        RETURNING *
    `, [
        clearing_date || new Date(),
        clearing_reference || null,
        req.user?.id,
        id
    ]);
    
    // Return updated deposit with totals
    const result = {
        ...rows[0],
        item_count: parseInt(deposit.item_count),
        total_amount: parseFloat(deposit.total_amount)
    };
    
    res.json(result);
}));

/**
 * GET /api/bank-deposits/slip/:id
 * Generate deposit slip data for a specific deposit
 */
router.get('/slip/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get deposit with bank account and items
    const depositQuery = await pool.query(`
        SELECT d.*, ba.account_name, ba.bank_name, ba.account_number, ba.routing_number,
               CONCAT(u.first_name, ' ', u.last_name) as prepared_by
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u ON d.created_by = u.id
        WHERE d.id = $1
    `, [id]);
    
    if (depositQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositQuery.rows[0];
    
    // Get deposit items grouped by type
    const itemsQuery = await pool.query(`
        SELECT 
            item_type,
            COUNT(*) as count,
            SUM(amount) as total
        FROM bank_deposit_items
        WHERE deposit_id = $1
        GROUP BY item_type
    `, [id]);
    
    // Get individual checks
    const checksQuery = await pool.query(`
        SELECT *
        FROM bank_deposit_items
        WHERE deposit_id = $1 AND item_type = 'Check'
        ORDER BY amount DESC
    `, [id]);
    
    // Calculate totals
    const totalAmount = itemsQuery.rows.reduce((sum, group) => sum + parseFloat(group.total || 0), 0);
    
    // Format deposit slip data
    const depositSlip = {
        deposit: {
            ...deposit,
            deposit_date_formatted: new Date(deposit.deposit_date).toLocaleDateString()
        },
        summary: {
            total_amount: totalAmount,
            item_groups: itemsQuery.rows
        },
        checks: checksQuery.rows,
        currency: {
            cash: itemsQuery.rows.find(g => g.item_type === 'Cash')?.total || 0,
            checks: itemsQuery.rows.find(g => g.item_type === 'Check')?.total || 0,
            electronic: itemsQuery.rows.find(g => g.item_type === 'Electronic')?.total || 0
        }
    };
    
    res.json(depositSlip);
}));

module.exports = router;
