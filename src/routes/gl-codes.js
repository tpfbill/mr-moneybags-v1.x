// src/routes/gl-codes.js
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
// Normalisers & helper utils
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

function normalizeLineType(v) {
    const validTypes = ['asset', 'credit card', 'liability', 'equity', 'revenue', 'expense'];
    const t = (v || '').toString().trim().toLowerCase();
    
    // Map to proper case if valid
    if (validTypes.includes(t)) {
        if (t === 'credit card') return 'Credit Card';
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    
    // Return null if not valid (will be caught by validation)
    return null;
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
        'code',
        'description',
        'classification',
        'line_type',
        'status',
        'budget',
        'balance_sheet'
    ];
    CANON.forEach(k => map.set(k, k));
    const aliases = {
        code: ['gl_code', 'glcode'],
        description: ['desc', 'name'],
        classification: ['class', 'type'],
        line_type: ['linetype', 'line'],
        status: ['active', 'is_active'],
        budget: ['is_budget', 'budgeted'],
        balance_sheet: ['balancesheet', 'is_balance_sheet']
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
 * GET /api/gl-codes
 * Returns all GL codes.
 * Optional filters: status, line_type
 */
router.get('/', asyncHandler(async (req, res) => {
    const { status, line_type } = req.query;
    
    let query = `
        SELECT *
        FROM gl_codes
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (line_type) {
        query += ` AND line_type = $${paramIndex++}`;
        params.push(line_type);
    }
    
    query += ` ORDER BY code`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/gl-codes/:id
 * Returns a specific GL code by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(
        'SELECT * FROM gl_codes WHERE id = $1',
        [id]
    );
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'GL code not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/gl-codes
 * Creates a new GL code
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        code,
        description,
        classification,
        line_type,
        status,
        budget,
        balance_sheet
    } = req.body;
    
    // Validate required fields
    if (!code) {
        return res.status(400).json({ error: 'code is required' });
    }
    
    if (!line_type) {
        return res.status(400).json({ error: 'line_type is required' });
    }
    
    // Validate line_type is one of the allowed values
    const validLineTypes = ['Asset', 'Credit Card', 'Liability', 'Equity', 'Revenue', 'Expense'];
    if (!validLineTypes.includes(line_type)) {
        return res.status(400).json({ 
            error: 'Invalid line_type',
            details: `line_type must be one of: ${validLineTypes.join(', ')}`
        });
    }
    
    // Check for duplicate code (case-insensitive)
    const codeCheck = await pool.query(
        'SELECT id FROM gl_codes WHERE LOWER(code) = LOWER($1)',
        [code]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'code already exists',
            details: 'code must be globally unique (case-insensitive)'
        });
    }
    
    // Normalize status, budget, and balance_sheet
    const normalizedStatus = status ? normalizeStatus(status) : 'Active';
    const normalizedBudget = budget ? normalizeYN(budget) : null;
    const normalizedBalanceSheet = balance_sheet ? normalizeYN(balance_sheet) : null;
    
    const { rows } = await pool.query(`
        INSERT INTO gl_codes (
            code,
            description,
            classification,
            line_type,
            status,
            budget,
            balance_sheet
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
        code,
        description || null,
        classification || null,
        line_type,
        normalizedStatus,
        normalizedBudget,
        normalizedBalanceSheet
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/gl-codes/:id
 * Updates an existing GL code
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        code,
        description,
        classification,
        line_type,
        status,
        budget,
        balance_sheet
    } = req.body;
    
    // Validate required fields
    if (!code) {
        return res.status(400).json({ error: 'code is required' });
    }
    
    if (!line_type) {
        return res.status(400).json({ error: 'line_type is required' });
    }
    
    // Validate line_type is one of the allowed values
    const validLineTypes = ['Asset', 'Credit Card', 'Liability', 'Equity', 'Revenue', 'Expense'];
    if (!validLineTypes.includes(line_type)) {
        return res.status(400).json({ 
            error: 'Invalid line_type',
            details: `line_type must be one of: ${validLineTypes.join(', ')}`
        });
    }
    
    // Check if GL code exists
    const glCodeCheck = await pool.query('SELECT id FROM gl_codes WHERE id = $1', [id]);
    if (glCodeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'GL code not found' });
    }
    
    // Check if code already exists (excluding this record)
    const codeCheck = await pool.query(
        'SELECT id FROM gl_codes WHERE LOWER(code) = LOWER($1) AND id != $2',
        [code, id]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'code already exists',
            details: 'code must be globally unique (case-insensitive)'
        });
    }
    
    // Normalize status, budget, and balance_sheet
    const normalizedStatus = status ? normalizeStatus(status) : 'Active';
    const normalizedBudget = budget ? normalizeYN(budget) : null;
    const normalizedBalanceSheet = balance_sheet ? normalizeYN(balance_sheet) : null;
    
    const { rows } = await pool.query(`
        UPDATE gl_codes
        SET code = $1,
            description = $2,
            classification = $3,
            line_type = $4,
            status = $5,
            budget = $6,
            balance_sheet = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        code,
        description || null,
        classification || null,
        line_type,
        normalizedStatus,
        normalizedBudget,
        normalizedBalanceSheet,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/gl-codes/:id
 * Deletes a GL code
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Delete the GL code
    const result = await pool.query('DELETE FROM gl_codes WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'GL code not found' });
    }
    
    res.status(204).send();
}));

/**
 * POST /api/gl-codes/import
 * Import GL codes from CSV
 */
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
                    code,
                    description,
                    classification,
                    line_type,
                    status,
                    budget,
                    balance_sheet
                } = rec;

                if (!code || !line_type) {
                    throw new Error(
                        'Missing required fields (code, line_type)'
                    );
                }

                // Normalize and validate line_type
                const normalizedLineType = normalizeLineType(line_type);
                if (!normalizedLineType) {
                    throw new Error(
                        `Invalid line_type: "${line_type}". Must be one of: Asset, Credit Card, Liability, Equity, Revenue, Expense`
                    );
                }

                const normRow = {
                    code: code.trim(),
                    description: description || null,
                    classification: classification || null,
                    line_type: normalizedLineType,
                    status: normalizeStatus(status),
                    budget: normalizeYN(budget),
                    balance_sheet: normalizeYN(balance_sheet)
                };

                // Upsert by code (case-insensitive)
                const existing = await pool.query(
                    'SELECT id FROM gl_codes WHERE LOWER(code)=LOWER($1) LIMIT 1',
                    [normRow.code]
                );

                if (existing.rows.length) {
                    // UPDATE
                    await pool.query(
                        `UPDATE gl_codes
                           SET code=$1,
                               description=$2,
                               classification=$3,
                               line_type=$4,
                               status=$5,
                               budget=$6,
                               balance_sheet=$7,
                               updated_at=NOW()
                         WHERE id=$8`,
                        [
                            normRow.code,
                            normRow.description,
                            normRow.classification,
                            normRow.line_type,
                            normRow.status,
                            normRow.budget,
                            normRow.balance_sheet,
                            existing.rows[0].id
                        ]
                    );
                    updated++;
                } else {
                    // INSERT
                    await pool.query(
                        `INSERT INTO gl_codes
                            (code, description, classification, line_type, status, budget, balance_sheet)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [
                            normRow.code,
                            normRow.description,
                            normRow.classification,
                            normRow.line_type,
                            normRow.status,
                            normRow.budget,
                            normRow.balance_sheet
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
