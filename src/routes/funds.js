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
// Schema helpers (introspect columns to support multiple schema variants)
// ---------------------------------------------------------------------------
async function hasColumn(db, table, column) {
    try {
        const q = await db.query(
            `SELECT 1
               FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = $1
                AND column_name = $2
              LIMIT 1`,
            [table, column]
        );
        return q.rows.length > 0;
    } catch (_) {
        return false;
    }
}

async function getJeiCoreCols(db) {
    const candidates = {
        journal_entry_id: ['journal_entry_id', 'entry_id', 'je_id'],
        fund_id: ['fund_id', 'fund', 'fundid'],
        debit: ['debit', 'debits', 'dr_amount', 'debit_amount', 'dr'],
        credit: ['credit', 'credits', 'cr_amount', 'credit_amount', 'cr']
    };

    const pick = async (logical) => {
        for (const c of candidates[logical]) {
            if (await hasColumn(db, 'journal_entry_items', c)) return c;
        }
        return null;
    };

    return {
        jeRef: await pick('journal_entry_id') || 'journal_entry_id',
        fundRef: await pick('fund_id') || 'fund_id',
        debitCol: await pick('debit') || 'debit',
        creditCol: await pick('credit') || 'credit'
    };
}

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

function normalizeRestriction(v) {
  const s = (v || '').toString().trim();
  if (!s) return null;
  const d = s.replace(/[^0-9]/g, '');
  if (d === '0'  || d === '00') return '00';
  if (d === '1'  || d === '01') return '01';
  if (d === '2'  || d === '02') return '02';
  if (d === '3'  || d === '03') return '03';
  return null;
}

function toDateYYYYMMDD(v) {
    if (!v) return null;
    // Already ISO yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // Support D/M/Y or DD/MM/YYYY (and 2-digit year) explicitly
    const dmy = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*$/;
    const m = dmy.exec(v);
    if (m) {
        let [_, d, mth, y] = m;
        const dd = String(d).padStart(2, '0');
        const mm = String(mth).padStart(2, '0');
        let yyyy = y.length === 2 ? (Number(y) >= 70 ? `19${y}` : `20${y}`) : y; // pivot at 1970/2000
        return `${yyyy}-${mm}-${dd}`;
    }
    // Fallback to Date parsing
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
        fund_number: ['fund_no', 'fund#', 'no', 'number'],
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

    // Build schema-aware balance expression: starting_balance + SUM(Posted debits-credits)
    const jeiCols = await getJeiCoreCols(pool);
    const hasStatus = await hasColumn(pool, 'journal_entries', 'status');
    const hasPosted = await hasColumn(pool, 'journal_entries', 'posted');
    const hasStartingBalance = await hasColumn(pool, 'funds', 'starting_balance');
    const hasFundNumber = await hasColumn(pool, 'funds', 'fund_number');
    const hasFundCode = await hasColumn(pool, 'funds', 'fund_code');

    const sbExpr = hasStartingBalance ? 'COALESCE(f.starting_balance, 0::numeric)' : '0::numeric';
    const postFilter = hasStatus
        ? "AND je.status = 'Posted'"
        : (hasPosted ? 'AND je.posted = TRUE' : '');

    // Some installations store fund reference in JE lines as fund_number or fund_code
    // rather than the funds.id. Support all common variants by comparing as text.
    const fundMatchParts = [
        `(jel.${jeiCols.fundRef}::text = f.id::text)`
    ];
    if (hasFundNumber) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_number::text)`);
    if (hasFundCode) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_code::text)`);
    const fundMatchClause = fundMatchParts.join(' OR ');

    const balExpr = `${sbExpr} + COALESCE((
        SELECT SUM(COALESCE(jel.${jeiCols.debitCol},0) - COALESCE(jel.${jeiCols.creditCol},0))
          FROM journal_entry_items jel
          JOIN journal_entries je ON jel.${jeiCols.jeRef} = je.id
         WHERE (${fundMatchClause}) ${postFilter}
    ), 0::numeric)`;

    let query = `
        SELECT f.*, ${balExpr} AS balance
          FROM funds f
         WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (entity_code) {
        query += ` AND f.entity_code = $${paramIndex++}`;
        params.push(entity_code);
    }
    if (restriction) {
        query += ` AND f.restriction = $${paramIndex++}`;
        params.push(restriction);
    }
    if (status) {
        query += ` AND f.status = $${paramIndex++}`;
        params.push(status);
    }

    query += ` ORDER BY f.fund_code, f.fund_name`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/funds/:id
 * Returns a specific fund by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const jeiCols = await getJeiCoreCols(pool);
    const hasStatus = await hasColumn(pool, 'journal_entries', 'status');
    const hasPosted = await hasColumn(pool, 'journal_entries', 'posted');
    const hasStartingBalance = await hasColumn(pool, 'funds', 'starting_balance');
    const hasFundNumber = await hasColumn(pool, 'funds', 'fund_number');
    const hasFundCode = await hasColumn(pool, 'funds', 'fund_code');
    const sbExpr = hasStartingBalance ? 'COALESCE(f.starting_balance, 0::numeric)' : '0::numeric';
    const postFilter = hasStatus
        ? "AND je.status = 'Posted'"
        : (hasPosted ? 'AND je.posted = TRUE' : '');

    const fundMatchParts = [
        `(jel.${jeiCols.fundRef}::text = f.id::text)`
    ];
    if (hasFundNumber) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_number::text)`);
    if (hasFundCode) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_code::text)`);
    const fundMatchClause = fundMatchParts.join(' OR ');

    const balExpr = `${sbExpr} + COALESCE((
        SELECT SUM(COALESCE(jel.${jeiCols.debitCol},0) - COALESCE(jel.${jeiCols.creditCol},0))
          FROM journal_entry_items jel
          JOIN journal_entries je ON jel.${jeiCols.jeRef} = je.id
         WHERE (${fundMatchClause}) ${postFilter}
    ), 0::numeric)`;

    const { rows } = await pool.query(
        `SELECT f.*, ${balExpr} AS balance FROM funds f WHERE f.id = $1`,
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

    // Normalize restriction
    const restrictionNorm = normalizeRestriction(restriction);
    if (!restrictionNorm) {
        return res.status(400).json({ error: 'restriction must be one of 00,01,02,03' });
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
        restrictionNorm,
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
    
    // Normalize restriction
    const restrictionNorm = normalizeRestriction(restriction);
    if (!restrictionNorm) {
        return res.status(400).json({ error: 'restriction must be one of 00,01,02,03' });
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
        restrictionNorm,
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
        // Track duplicates within the uploaded CSV (case-insensitive, trimmed)
        const seenFundNumbers = new Set();

        // Accounting number parser: commas, parentheses for negatives; '-' or '' => 0
        const parseAccountingNumber = (val) => {
            if (val == null) return 0;
            const s = String(val).trim();
            if (s === '' || s === '-') return 0;
            const neg = /^\(.*\)$/.test(s);
            const cleaned = s.replace(/[(),]/g, '');
            const num = Number(cleaned);
            if (isNaN(num)) return 0;
            return neg ? -Math.abs(num) : num;
        };

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

                if (!fund_number || !fund_name || !entity_name || !entity_code) {
                    throw new Error(
                        'Missing required fields (fund_number, fund_name, entity_name, entity_code)'
                    );
                }

                // Reject duplicates within the same upload
                const fnKey = String(fund_number).trim().toLowerCase();
                if (seenFundNumbers.has(fnKey)) {
                    throw new Error(`Duplicate Fund No within file: ${fund_number}`);
                }
                seenFundNumbers.add(fnKey);

                const normRow = {
                    // fund_number is authoritative, required
                    fund_number: String(fund_number).trim(),
                    // fund_code no longer required – fallback to fund_number to satisfy NOT NULL schema
                    fund_code: (fund_code != null && String(fund_code).trim() !== '')
                        ? String(fund_code).trim()
                        : String(fund_number).trim(),
                    fund_name: fund_name.trim(),
                    entity_name: entity_name.trim(),
                    entity_code: entity_code.trim(),
                    restriction: normalizeRestriction(rec.restriction),
                    budget: normalizeYN(rec.budget),
                    balance_sheet: normalizeYN(rec.balance_sheet),
                    status: normalizeStatus(rec.status),
                    starting_balance: parseAccountingNumber(rec.starting_balance),
                    starting_balance_date: toDateYYYYMMDD(rec.starting_balance_date),
                    last_used: toDateYYYYMMDD(rec.last_used)
                };

                // Upsert by fund_number (case-insensitive)
                const existing = await pool.query(
                    'SELECT id FROM funds WHERE LOWER(fund_number)=LOWER($1)',
                    [normRow.fund_number]
                );

                if (existing.rows.length > 1) {
                    throw new Error(`Multiple existing rows found with Fund No: ${normRow.fund_number}. Please deduplicate in database.`);
                }

                if (existing.rows.length === 1) {
                    // UPDATE
                    await pool.query(
                        `UPDATE funds
                           SET fund_number=$1,
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
                         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::numeric,0::numeric),COALESCE($11::date,CURRENT_DATE),COALESCE($12::date,CURRENT_DATE))`,
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
