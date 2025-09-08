// src/routes/funds.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// ---------------------------------------------------------------------------
// Multer – in-memory storage for CSV uploads
// ---------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Normalisers & helper utils (mirrors vendors import style)
// ---------------------------------------------------------------------------
function normalizeStatus(v) {
    const s = (v || '').toString().trim().toLowerCase();
    return s === 'inactive' ? 'Inactive' : 'Active';
}

function normalizeYN(v) {
    const t = (v || '').toString().trim().toLowerCase();
    if (!t) return null;
    return ['1', 'yes', 'y', 'true'].includes(t) ? 'Yes' : 'No';
}

function toDateYYYYMMDD(v) {
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

// --- CSV header mapping helpers -------------------------------------------
function normalizeHeaderKey(key) {
    return (key || '')
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

const HEADER_ALIAS_MAP = (() => {
    const map = new Map();
    const CANON = [
        'fund_number',
        'fund_code',
        'fund_name',
        'entity_name',
        'entity_code',
        'restriction',
        'budget',
        'balance_sheet',
        'status',
        'starting_balance',
        'starting_balance_date',
        'last_used'
    ];
    CANON.forEach(k => map.set(k, k));
    const aliases = {
        fund_code: ['code'],
        fund_name: ['name'],
        entity_name: ['entityname', 'entity'],
        entity_code: ['entitycode'],
        starting_balance: ['startingbalance', 'startbalance', 'opening_balance', 'sbalance'],
        starting_balance_date: ['start_balance_date', 'opening_balance_date'],
        last_used: ['lastused', 'last_use']
    };
    Object.entries(aliases).forEach(([canon, arr]) => {
        arr.forEach(a => map.set(normalizeHeaderKey(a), canon));
    });
    return map;
})();

function normalizeCsvRecord(rec) {
    const out = {};
    for (const [raw, val] of Object.entries(rec)) {
        const canon = HEADER_ALIAS_MAP.get(normalizeHeaderKey(raw));
        if (canon) out[canon] = val;
    }
    return out;
}

/**
 * GET /api/funds
 * Returns all funds.
 * Optional filters: entity_code, restriction, status
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_code, restriction, status } = req.query;
    
    let query = `
        SELECT *
        FROM funds
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_code) {
        query += ` AND entity_code = $${paramIndex++}`;
        params.push(entity_code);
    }
    
    if (restriction) {
        query += ` AND restriction = $${paramIndex++}`;
        params.push(restriction);
    }
    
    if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
    }
    
    query += ` ORDER BY fund_code, fund_name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/funds/:id
 * Returns a specific fund by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(
        'SELECT * FROM funds WHERE id = $1',
        [id]
    );
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Fund not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/funds
 * Creates a new fund
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        fund_number,
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status,
        starting_balance,
        starting_balance_date,
        last_used
    } = req.body;
    
    // Validate required fields
    if (!fund_code) {
        return res.status(400).json({ error: 'fund_code is required' });
    }
    
    if (!fund_name) {
        return res.status(400).json({ error: 'fund_name is required' });
    }

    if (!entity_name || !entity_code) {
        return res.status(400).json({ error: 'entity_name and entity_code are required' });
    }

    // Normalize starting_balance and starting_balance_date
    const starting_balance_num = (starting_balance === '' || starting_balance == null) ? null : Number(starting_balance);
    const starting_balance_date_str = toDateYYYYMMDD(starting_balance_date);

    // Check duplicate fund_code (case-insensitive)
    const codeCheck = await pool.query(
        'SELECT id FROM funds WHERE LOWER(fund_code) = LOWER($1)',
        [fund_code]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'fund_code already exists',
            details: 'fund_code must be globally unique (case-insensitive)'
        });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO funds (
            fund_number,
            fund_code,
            fund_name,
            entity_name,
            entity_code,
            restriction,
            budget,
            balance_sheet,
            status,
            starting_balance,
            starting_balance_date,
            last_used
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::numeric,0::numeric),COALESCE($11::date,CURRENT_DATE),COALESCE($12::date,CURRENT_DATE))
        RETURNING *
    `, [
        (fund_number || fund_code || '').toString().trim(),
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status || 'Active',
        starting_balance_num,
        starting_balance_date_str,
        last_used || null
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/funds/:id
 * Updates an existing fund
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        fund_number,
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status,
        starting_balance,
        starting_balance_date,
        last_used
    } = req.body;
    
    // Validate required fields
    if (!fund_code) {
        return res.status(400).json({ error: 'fund_code is required' });
    }
    if (!fund_name) {
        return res.status(400).json({ error: 'fund_name is required' });
    }
    
    // Normalize starting_balance and starting_balance_date
    const starting_balance_num = (starting_balance === '' || starting_balance == null) ? null : Number(starting_balance);
    const starting_balance_date_str = toDateYYYYMMDD(starting_balance_date);
    
    // Check if fund exists
    const fundCheck = await pool.query('SELECT id FROM funds WHERE id = $1', [id]);
    if (fundCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Fund not found' });
    }
    
    // Check if fund code already exists for this entity (excluding this fund)
    const codeCheck = await pool.query(
        'SELECT id FROM funds WHERE LOWER(fund_code) = LOWER($1) AND id != $2',
        [fund_code, id]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'fund_code already exists',
            details: 'fund_code must be globally unique (case-insensitive)'
        });
    }
    
    const { rows } = await pool.query(`
        UPDATE funds
        SET fund_number   = $1,
            fund_code     = $2,
            fund_name     = $3,
            entity_name   = $4,
            entity_code   = $5,
            restriction   = $6,
            budget        = $7,
            balance_sheet = $8,
            status        = $9,
            starting_balance = COALESCE($10::numeric, starting_balance),
            starting_balance_date = COALESCE($11::date, starting_balance_date),
            last_used     = COALESCE($12::date, last_used)
        WHERE id = $13
        RETURNING *
    `, [
        (fund_number || fund_code || '').toString().trim(),
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status || 'Active',
        starting_balance_num,
        starting_balance_date_str,
        last_used || null,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/funds/:id
 * Deletes a fund if it has no dependencies
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check for journal entry items using this fund
    const journalItemsCheck = await pool.query(
        'SELECT id FROM journal_entry_items WHERE fund_id = $1 LIMIT 1',
        [id]
    );
    
    if (journalItemsCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete fund with journal entry items',
            details: 'This fund is referenced in journal entries and cannot be deleted'
        });
    }
    
    // Check for payment batches using this fund
    const paymentBatchesCheck = await pool.query(
        'SELECT id FROM payment_batches WHERE fund_id = $1 LIMIT 1',
        [id]
    );
    
    if (paymentBatchesCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete fund with payment batches',
            details: 'This fund is referenced in payment batches and cannot be deleted'
        });
    }

    /* ------------------------------------------------------------------
     * Optional budgets dependency check
     * ---------------------------------------------------------------
     * The budgets table is planned but may not exist in all
     * installations yet.  If the table is missing (PostgreSQL error
     * 42P01), we silently skip this check so deletion can proceed.
     * Any other database error is re-thrown.
     * ----------------------------------------------------------------*/
    try {
        const budgetsCheck = await pool.query(
            'SELECT id FROM budgets WHERE fund_id = $1 LIMIT 1',
            [id]
        );

        if (budgetsCheck.rows.length > 0) {
            return res.status(409).json({
                error: 'Cannot delete fund with budget entries',
                details: 'This fund is referenced in budgets and cannot be deleted'
            });
        }
    } catch (err) {
        // 42P01 = undefined_table
        if (!(err && err.code === '42P01')) {
            throw err;
        }
        // Table doesn't exist yet – skip budgets check
    }
    
    // If no dependencies, delete the fund
    const result = await pool.query('DELETE FROM funds WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Fund not found' });
    }
    
    res.status(204).send();
}));

/* ---------------------------------------------------------------------------
 * POST /api/funds/import  – CSV upload
 * -------------------------------------------------------------------------*/
router.post(
    '/import',
    upload.single('file'),
    asyncHandler(async (req, res) => {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        let records;
        try {
            records = parse(req.file.buffer.toString('utf8'), {
                columns: true,
                skip_empty_lines: true,
                trim: true
            });
        } catch (err) {
            return res
                .status(400)
                .json({ error: 'Invalid CSV format', message: err.message });
        }

        let inserted = 0,
            updated = 0,
            failed = 0;
        const errors = [];

        for (let i = 0; i < records.length; i++) {
            const raw = records[i];
            const rec = normalizeCsvRecord(raw);
            try {
                const {
                    fund_number,
                    fund_code,
                    fund_name,
                    entity_name,
                    entity_code
                } = rec;

                if (!fund_code || !fund_name || !entity_name || !entity_code) {
                    throw new Error(
                        'Missing required fields (fund_code, fund_name, entity_name, entity_code)'
                    );
                }

                const normRow = {
                    // default fund_number to fund_code if missing
                    fund_number: (fund_number || fund_code || '').toString().trim(),
                    fund_code: fund_code.trim(),
                    fund_name: fund_name.trim(),
                    entity_name: entity_name.trim(),
                    entity_code: entity_code.trim(),
                    restriction: rec.restriction || null,
                    budget: normalizeYN(rec.budget),
                    balance_sheet: normalizeYN(rec.balance_sheet),
                    status: normalizeStatus(rec.status),
                    starting_balance: (rec.starting_balance === '' || rec.starting_balance == null) ? null : Number(rec.starting_balance),
                    starting_balance_date: toDateYYYYMMDD(rec.starting_balance_date),
                    last_used: toDateYYYYMMDD(rec.last_used)
                };

                // Upsert by fund_code (case-insensitive)
                const existing = await pool.query(
                    'SELECT id FROM funds WHERE LOWER(fund_code)=LOWER($1) LIMIT 1',
                    [normRow.fund_code]
                );

                if (existing.rows.length) {
                    // UPDATE
                    await pool.query(
                        `UPDATE funds
                           SET fund_number=COALESCE($1,$2,fund_number),
                               fund_code=$2,
                               fund_name=$3,
                               entity_name=$4,
                               entity_code=$5,
                               restriction=$6,
                               budget=$7,
                               balance_sheet=$8,
                               status=$9,
                               starting_balance=COALESCE($10::numeric, starting_balance),
                               starting_balance_date=COALESCE($11::date, starting_balance_date),
                               last_used=COALESCE($12::date, last_used)
                         WHERE id=$13`,
                        [
                            normRow.fund_number,
                            normRow.fund_code,
                            normRow.fund_name,
                            normRow.entity_name,
                            normRow.entity_code,
                            normRow.restriction,
                            normRow.budget,
                            normRow.balance_sheet,
                            normRow.status,
                            normRow.starting_balance,
                            normRow.starting_balance_date,
                            normRow.last_used,
                            existing.rows[0].id
                        ]
                    );
                    updated++;
                } else {
                    // INSERT
                    await pool.query(
                        `INSERT INTO funds
                            (fund_number,fund_code,fund_name,entity_name,entity_code,
                             restriction,budget,balance_sheet,status,starting_balance,starting_balance_date,last_used)
                         VALUES (COALESCE($1,$2),$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::numeric,0::numeric),COALESCE($11::date,CURRENT_DATE),COALESCE($12::date,CURRENT_DATE))`,
                        [
                            normRow.fund_number,
                            normRow.fund_code,
                            normRow.fund_name,
                            normRow.entity_name,
                            normRow.entity_code,
                            normRow.restriction,
                            normRow.budget,
                            normRow.balance_sheet,
                            normRow.status,
                            normRow.starting_balance,
                            normRow.starting_balance_date,
                            normRow.last_used
                        ]
                    );
                    inserted++;
                }
            } catch (err) {
                failed++;
                if (errors.length < 20) {
                    errors.push(`Row ${i + 1}: ${err.message}`);
                }
            }
        }

        res.json({
            total: records.length,
            inserted,
            updated,
            failed,
            sampleErrors: errors
        });
    })
);

module.exports = router;
