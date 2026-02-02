// src/routes/journal-entries.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Schema guard: check if a table has a column
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

// Detect core column names for journal_entry_items across schema variants
async function getJeiCoreCols(db) {
    // candidate lists ordered by preference
    const candidates = {
        journal_entry_id: ['journal_entry_id', 'entry_id', 'je_id'],
        account_id: ['account_id', 'gl_account_id', 'acct_id', 'account'],
        fund_id: ['fund_id', 'fund', 'fundid'],
        debit: ['debit', 'debits', 'dr_amount', 'debit_amount', 'dr'],
        credit: ['credit', 'credits', 'cr_amount', 'credit_amount', 'cr'],
        description: ['description', 'memo', 'note']
    };

    const pick = async (logical) => {
        for (const c of candidates[logical]) {
            if (await hasColumn(db, 'journal_entry_items', c)) return c;
        }
        return null;
    };

    const cols = {
        jeRef: await pick('journal_entry_id') || 'journal_entry_id',
        accRef: await pick('account_id') || 'account_id',
        fundRef: await pick('fund_id') || 'fund_id',
        debitCol: await pick('debit') || 'debit',
        creditCol: await pick('credit') || 'credit',
        descCol: await pick('description') || 'description'
    };
    return cols;
}

// Helper: build safe SELECT fragments for account and fund label columns
async function getAccountFundSelectFragments(db) {
    // Accounts: prefer account_code; fallback to code; else derive from entity_code-gl_code-fund_number
    const hasAccAccountCode = await hasColumn(db, 'accounts', 'account_code');
    const hasAccCode = await hasColumn(db, 'accounts', 'code');
    const hasAccEntity = await hasColumn(db, 'accounts', 'entity_code');
    const hasAccGL = await hasColumn(db, 'accounts', 'gl_code');
    const hasAccFundNum = await hasColumn(db, 'accounts', 'fund_number');
    let accCodeExpr = 'NULL';
    if (hasAccAccountCode) accCodeExpr = 'a.account_code';
    else if (hasAccCode) accCodeExpr = 'a.code';
    else if (hasAccEntity && hasAccGL && hasAccFundNum) accCodeExpr = "(a.entity_code || '-' || a.gl_code || '-' || a.fund_number)";

    // Account description/name
    const hasAccDesc = await hasColumn(db, 'accounts', 'description');
    const hasAccName = await hasColumn(db, 'accounts', 'name');
    const hasAccTitle = await hasColumn(db, 'accounts', 'title');
    const accDescExpr = hasAccDesc ? 'a.description' : (hasAccName ? 'a.name' : (hasAccTitle ? 'a.title' : 'NULL'));

    // Funds: prefer fund_name/fund_code; fallback to name/code when present; else NULL
    const hasFundName = await hasColumn(db, 'funds', 'fund_name');
    const hasFundCode = await hasColumn(db, 'funds', 'fund_code');
    const hasName = await hasColumn(db, 'funds', 'name');
    const hasCode = await hasColumn(db, 'funds', 'code');
    const fundNameExpr = hasFundName ? 'f.fund_name' : (hasName ? 'f.name' : 'NULL');
    const fundCodeExpr = hasFundCode ? 'f.fund_code' : (hasCode ? 'f.code' : 'NULL');

    return { accCodeExpr, accDescExpr, fundNameExpr, fundCodeExpr };
}

// Helpers: safely bump balances only if columns exist, applying GL line_type rules
// Spreadsheet rules (normalized):
// - Asset, Expense  => Debit increases (+), Credit decreases (-)
// - Liability, Equity, Revenue => Debit decreases (-), Credit increases (+)
// Our callers pass delta as: +amount for debit lines, -amount for credit lines.
// We therefore transform delta by line_type so stored balances reflect the rule above.

async function getLineTypeByAccountId(db, accountId) {
    try {
        const { rows } = await db.query(
            `SELECT COALESCE(gc.line_type, a.classification) AS line_type
               FROM accounts a
          LEFT JOIN gl_codes gc ON LOWER(gc.code) = LOWER(a.gl_code)
              WHERE a.id = $1
              LIMIT 1`,
            [accountId]
        );
        return rows[0]?.line_type || null;
    } catch (_) {
        return null;
    }
}

function normalizeLineType(t) {
    const s = (t || '').toString().trim().toLowerCase();
    if (!s) return null;
    if (s.startsWith('asset')) return 'Asset';
    if (s.startsWith('liab') || s.includes('credit card')) return 'Liability';
    if (s.startsWith('equity') || s.includes('net asset')) return 'Equity';
    if (s.startsWith('rev')) return 'Revenue';
    if (s.startsWith('exp')) return 'Expense';
    return null;
}

function applyLineTypeToDelta(lineType, delta) {
    const lt = normalizeLineType(lineType);
    if (!lt) return delta; // fallback: keep incoming semantics
    // Asset/Expense keep sign (debit +, credit -)
    if (lt === 'Asset' || lt === 'Expense') return delta;
    // Liability/Equity/Revenue invert sign
    return -delta;
}

async function maybeUpdateAccountBalance(db, accountId, delta) {
    try {
        // Determine destination column (schema-aware)
        const hasBalance = await hasColumn(db, 'accounts', 'balance');
        const hasCurrent = await hasColumn(db, 'accounts', 'current_balance');
        if (!hasBalance && !hasCurrent) return; // no-op on this schema

        const lineType = await getLineTypeByAccountId(db, accountId);
        const signedDelta = applyLineTypeToDelta(lineType, Number(delta || 0));
        if (!signedDelta || isNaN(signedDelta)) return;

        const col = hasBalance ? 'balance' : 'current_balance';
        const hasUpdatedAt = await hasColumn(db, 'accounts', 'updated_at');
        const sql = hasUpdatedAt
          ? `UPDATE accounts SET ${col} = COALESCE(${col}, 0) + $1, updated_at = NOW() WHERE id = $2`
          : `UPDATE accounts SET ${col} = COALESCE(${col}, 0) + $1 WHERE id = $2`;
        await db.query(sql, [signedDelta, accountId]);
    } catch (_) { /* ignore */ }
}

async function maybeUpdateFundBalance(db, fundId, delta, accountId = null) {
    try {
        if (!await hasColumn(db, 'funds', 'balance')) return;
        let signedDelta = Number(delta || 0);
        if (accountId) {
            const lineType = await getLineTypeByAccountId(db, accountId);
            signedDelta = applyLineTypeToDelta(lineType, signedDelta);
        }
        if (!signedDelta || isNaN(signedDelta)) return;

        const hasUpdatedAt = await hasColumn(db, 'funds', 'updated_at');
        const sql = hasUpdatedAt
          ? `UPDATE funds SET balance = COALESCE(balance, 0) + $1, updated_at = NOW() WHERE id = $2`
          : `UPDATE funds SET balance = COALESCE(balance, 0) + $1 WHERE id = $2`;
        await db.query(sql, [signedDelta, fundId]);
    } catch (_) { /* ignore */ }
}

// Helper to choose best entity display label
async function getEntityNameExpr(db, alias) {
    const hasName = await hasColumn(db, 'entities', 'name');
    const hasCode = await hasColumn(db, 'entities', 'code');
    const hasDesc = await hasColumn(db, 'entities', 'description');
    if (hasName) return `${alias}.name`;
    if (hasCode) return `${alias}.code`;
    if (hasDesc) return `${alias}.description`;
    return 'NULL';
}

/**
 * GET /api/journal-entries
 * Returns all journal entries, optionally filtered by entity_id, date range, or status
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, from_date, to_date, status, limit, entry_mode } = req.query;
    
    // Introspect optional columns/labels
    const hasJEEntity = await hasColumn(pool, 'journal_entries', 'entity_id');
    const hasJETarget = await hasColumn(pool, 'journal_entries', 'target_entity_id');
    const hasTypeCol = await hasColumn(pool, 'journal_entries', 'type');
    const hasEntryTypeCol = await hasColumn(pool, 'journal_entries', 'entry_type');
    const entityNameExpr = await getEntityNameExpr(pool, 'e');
    const targetNameExpr = await getEntityNameExpr(pool, 'te');

    let selectFields = 'je.*';
    let joins = '';
    if (hasJEEntity) {
        selectFields += `, ${entityNameExpr} as entity_name`;
        joins += ' LEFT JOIN entities e ON je.entity_id = e.id';
    }
    if (hasJETarget) {
        selectFields += `, ${targetNameExpr} as target_entity_name`;
        joins += ' LEFT JOIN entities te ON je.target_entity_id = te.id';
    }
    // Normalize type field across schema variants
    if (hasTypeCol && hasEntryTypeCol) {
        selectFields += ', COALESCE(je.type, je.entry_type) AS type';
    } else if (hasTypeCol) {
        selectFields += ', je.type AS type';
    } else if (hasEntryTypeCol) {
        selectFields += ', je.entry_type AS type';
    }
    // Count lines using schema-aware reference column
    const jeiCols = await getJeiCoreCols(pool);
    selectFields += `, (SELECT COUNT(*) FROM journal_entry_items WHERE ${jeiCols.jeRef} = je.id) as line_count`;

    // Derived lists (comma-separated) from line items
    // Funds: support various schema variants (id, fund_number, fund_code)
    const hasFundNumber = await hasColumn(pool, 'funds', 'fund_number');
    const hasFundCode = await hasColumn(pool, 'funds', 'fund_code');
    const fundMatchParts = [
        `(jel.${jeiCols.fundRef}::text = f.id::text)`
    ];
    if (hasFundNumber) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_number::text)`);
    if (hasFundCode) fundMatchParts.push(`(jel.${jeiCols.fundRef}::text = f.fund_code::text)`);
    const fundMatchClause = fundMatchParts.join(' OR ');

    // Build schema-aware fund label expression (prefer code then name)
    const { fundNameExpr, fundCodeExpr } = await getAccountFundSelectFragments(pool);
    const fundLabelExpr = `COALESCE(${fundCodeExpr}, ${fundNameExpr})`;

    // LATERAL subqueries to aggregate derived entity and fund labels
    const derivedJoins = `
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT COALESCE(e2.name, e2.code, a.entity_code)::text, ', ' ORDER BY COALESCE(e2.name, e2.code, a.entity_code)::text) AS derived_entities
        FROM journal_entry_items jel
        LEFT JOIN accounts a ON jel.${jeiCols.accRef} = a.id
        LEFT JOIN entities e2 ON lower(e2.code) = lower(a.entity_code)
        WHERE jel.${jeiCols.jeRef} = je.id
      ) d_entities ON TRUE
      LEFT JOIN LATERAL (
        SELECT string_agg(DISTINCT (${fundLabelExpr})::text, ', ' ORDER BY (${fundLabelExpr})::text) AS derived_funds
        FROM journal_entry_items jel
        LEFT JOIN funds f ON (${fundMatchClause})
        WHERE jel.${jeiCols.jeRef} = je.id
      ) d_funds ON TRUE
    `;
    selectFields += `, COALESCE(d_entities.derived_entities, '') AS derived_entities, COALESCE(d_funds.derived_funds, '') AS derived_funds`;

    let query = `SELECT ${selectFields} FROM journal_entries je${joins} ${derivedJoins} WHERE 1=1`;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND je.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    if (from_date) {
        query += ` AND je.entry_date >= $${paramIndex++}`;
        params.push(from_date);
    }
    
    if (to_date) {
        query += ` AND je.entry_date <= $${paramIndex++}`;
        params.push(to_date);
    }
    
    if (status) {
        try {
            const hasStatus = await hasColumn(pool, 'journal_entries', 'status');
            if (hasStatus) {
                query += ` AND je.status = $${paramIndex++}`;
                params.push(status);
            }
        } catch (_) { /* ignore */ }
    }
    
    // Optional entry_mode filter (Manual/Auto) when column exists
    if (entry_mode && entry_mode.toLowerCase() !== 'all') {
        try {
            const colCheck = await pool.query(
                `SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'journal_entries' AND column_name = 'entry_mode' LIMIT 1`
            );
            if (colCheck.rows.length > 0) {
                query += ` AND je.entry_mode = $${paramIndex++}`;
                params.push(entry_mode);
            }
        } catch (_) { /* ignore if introspection fails */ }
    }
    
    // Build ORDER BY clause from sort parameter
    const { sort } = req.query;
    // Default ordering per request: entry_date DESC, reference_number, created_at DESC
    // Be schema-aware: fall back to reference or id when columns are absent
    const hasRefNum = await hasColumn(pool, 'journal_entries', 'reference_number');
    const hasRef = await hasColumn(pool, 'journal_entries', 'reference');
    const hasCreatedAt = await hasColumn(pool, 'journal_entries', 'created_at');
    const refExpr = hasRefNum ? 'je.reference_number' : (hasRef ? 'je.reference' : 'je.id');
    const createdExpr = hasCreatedAt ? 'je.created_at' : 'je.id';
    let orderByClause = `ORDER BY je.entry_date DESC, ${refExpr}, ${createdExpr} DESC`;
    if (sort) {
        const allowedSortFields = [
            'entry_date',
            'reference_number',
            'status',
            'derived_entities',
            'derived_funds',
            'total_amount',
            'line_count'
        ];
        const sortFields = sort.split(',').map(field => {
            const [fieldName, direction] = field.split(':');
            const sortDirection = direction && direction.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
            
            // Whitelist fields to prevent SQL injection
            if (allowedSortFields.includes(fieldName)) {
                // Map frontend field names to backend column names
                if (fieldName === 'reference_number') {
                    return `je.reference_number ${sortDirection}`;
                }
                return `je.${fieldName} ${sortDirection}`;
            }
            return null;
        }).filter(Boolean);

        if (sortFields.length > 0) {
            orderByClause = `ORDER BY ${sortFields.join(', ')}`;
        }
    }
    
    query += ` ${orderByClause}`;
    
    if (limit && !isNaN(parseInt(limit))) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
    }
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/journal-entries/:id
 * Returns a specific journal entry by ID with its lines
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Build dynamic header SELECT avoiding optional columns
    const hasJEEntity = await hasColumn(pool, 'journal_entries', 'entity_id');
    const hasJETarget = await hasColumn(pool, 'journal_entries', 'target_entity_id');
    const hasTypeCol = await hasColumn(pool, 'journal_entries', 'type');
    const hasEntryTypeCol = await hasColumn(pool, 'journal_entries', 'entry_type');
    const entityNameExpr = await getEntityNameExpr(pool, 'e');
    const targetNameExpr = await getEntityNameExpr(pool, 'te');

    let selectFields = 'je.*';
    let joins = '';
    if (hasJEEntity) {
        selectFields += `, ${entityNameExpr} as entity_name`;
        joins += ' LEFT JOIN entities e ON je.entity_id = e.id';
    }
    if (hasJETarget) {
        selectFields += `, ${targetNameExpr} as target_entity_name`;
        joins += ' LEFT JOIN entities te ON je.target_entity_id = te.id';
    }
    // Normalize type field across schema variants
    if (hasTypeCol && hasEntryTypeCol) {
        selectFields += ', COALESCE(je.type, je.entry_type) AS type';
    } else if (hasTypeCol) {
        selectFields += ', je.type AS type';
    } else if (hasEntryTypeCol) {
        selectFields += ', je.entry_type AS type';
    }

    const entryResult = await pool.query(
        `SELECT ${selectFields} FROM journal_entries je${joins} WHERE je.id = $1`,
        [id]
    );
    
    if (entryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    // Get the journal entry lines
    const { accCodeExpr, accDescExpr, fundNameExpr, fundCodeExpr } = await getAccountFundSelectFragments(pool);
    const jeiCols = await getJeiCoreCols(pool);
    const linesResult = await pool.query(
        `SELECT jel.*,
                COALESCE(jel.${jeiCols.debitCol}, 0)  AS debit,
                COALESCE(jel.${jeiCols.creditCol}, 0) AS credit,
                ${accDescExpr} as account_description,
                ${accCodeExpr} as account_code,
                ${fundNameExpr} as fund_name,
                ${fundCodeExpr} as fund_code
         FROM journal_entry_items jel
         LEFT JOIN accounts a ON jel.${jeiCols.accRef} = a.id
         LEFT JOIN funds f ON jel.${jeiCols.fundRef} = f.id
         WHERE jel.${jeiCols.jeRef} = $1
         ORDER BY jel.id`,
        [id]
    );
    
    // Combine entry with its lines
    const entry = entryResult.rows[0];
    entry.lines = linesResult.rows;
    
    res.json(entry);
}));

/**
 * GET /api/journal-entries/:id/lines
 * Returns all lines for a specific journal entry
 */
router.get('/:id/lines', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { accCodeExpr, accDescExpr, fundNameExpr, fundCodeExpr } = await getAccountFundSelectFragments(pool);
    const jeiCols = await getJeiCoreCols(pool);
    const { rows } = await pool.query(
        `SELECT jel.*,
                COALESCE(jel.${jeiCols.debitCol}, 0)  AS debit,
                COALESCE(jel.${jeiCols.creditCol}, 0) AS credit,
                ${accDescExpr} as account_description,
                ${accCodeExpr} as account_code,
                ${fundNameExpr} as fund_name,
                ${fundCodeExpr} as fund_code
         FROM journal_entry_items jel
         LEFT JOIN accounts a ON jel.${jeiCols.accRef} = a.id
         LEFT JOIN funds f ON jel.${jeiCols.fundRef} = f.id
         WHERE jel.${jeiCols.jeRef} = $1
         ORDER BY jel.id`,
        [id]
    );
    
    res.json(rows);
}));

/**
 * POST /api/journal-entries
 * Creates a new journal entry with its lines
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        target_entity_id,
        entry_date,
        reference_number,
        description,
        status,
        is_inter_entity,
        lines
    } = req.body;

    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }

    if (!entry_date) {
        return res.status(400).json({ error: 'Entry date is required' });
    }

    const hasLines = Array.isArray(lines) && lines.length > 0;

    // When lines are provided, validate debits == credits (only for Posted entries)
    let totalDebits = 0;
    let totalCredits = 0;
    if (hasLines) {
        lines.forEach(line => {
            totalDebits += parseFloat(line.debit || 0);
            totalCredits += parseFloat(line.credit || 0);
        });
        // Round to 2 decimal places to avoid floating point issues
        totalDebits = Math.round(totalDebits * 100) / 100;
        totalCredits = Math.round(totalCredits * 100) / 100;

        // Skip balance check for Pending entries - allow unbalanced saves
        const entryStatus = (status || '').toString().toLowerCase();
        if (entryStatus !== 'pending' && totalDebits !== totalCredits) {
            return res.status(400).json({
                error: 'Invalid journal entry: Debits must equal credits',
                details: `Total debits (${totalDebits}) do not equal total credits (${totalCredits})`
            });
        }
    }

    // Start a transaction to create the journal entry and its lines
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Introspect journal_entries columns
        const jeHas = {
            entity_id: await hasColumn(client, 'journal_entries', 'entity_id'),
            target_entity_id: await hasColumn(client, 'journal_entries', 'target_entity_id'),
            entry_date: await hasColumn(client, 'journal_entries', 'entry_date'),
            reference_number: await hasColumn(client, 'journal_entries', 'reference_number'),
            reference: await hasColumn(client, 'journal_entries', 'reference'),
            description: await hasColumn(client, 'journal_entries', 'description'),
            status: await hasColumn(client, 'journal_entries', 'status'),
            posted: await hasColumn(client, 'journal_entries', 'posted'),
            is_inter_entity: await hasColumn(client, 'journal_entries', 'is_inter_entity'),
            total_amount: await hasColumn(client, 'journal_entries', 'total_amount'),
            entry_mode: await hasColumn(client, 'journal_entries', 'entry_mode'),
            type: await hasColumn(client, 'journal_entries', 'type'),
            entry_type: await hasColumn(client, 'journal_entries', 'entry_type')
        };

        // Build INSERT dynamically based on existing columns
        const cols = [];
        const vals = [];
        const add = (col, val) => { cols.push(col); vals.push(val); };

        if (jeHas.entity_id) add('entity_id', entity_id);
        if (jeHas.target_entity_id && typeof target_entity_id !== 'undefined') add('target_entity_id', target_entity_id);
        if (jeHas.entry_date) add('entry_date', entry_date);
        if (jeHas.reference_number) add('reference_number', reference_number);
        else if (jeHas.reference) add('reference', reference_number);
        if (jeHas.description && typeof description !== 'undefined') add('description', description);
        if (jeHas.status) add('status', status || 'Posted');
        if (jeHas.posted) add('posted', true);
        if (jeHas.is_inter_entity && typeof is_inter_entity !== 'undefined') add('is_inter_entity', !!is_inter_entity);
        if (jeHas.total_amount) add('total_amount', hasLines ? totalDebits : 0);
        if (jeHas.entry_mode) add('entry_mode', 'Manual');
        // Persist type if provided in request
        const reqType = (req.body && (req.body.type ?? req.body.entry_type)) || undefined;
        if (typeof reqType !== 'undefined') {
            if (jeHas.type) add('type', reqType);
            else if (jeHas.entry_type) add('entry_type', reqType);
        }

        // Ensure we have at least minimal required columns
        if (!jeHas.entity_id || !jeHas.entry_date) {
            throw new Error('Journal entries schema missing required columns');
        }

        const ph = vals.map((_, i) => `$${i + 1}`).join(',');
        const entryResult = await client.query(
            `INSERT INTO journal_entries (${cols.join(',')}) VALUES (${ph}) RETURNING *`,
            vals
        );

        const journalEntryId = entryResult.rows[0].id;

        // Create the journal entry lines (if provided)
        if (hasLines) {
            const itemHas = {
                description: await hasColumn(client, 'journal_entry_items', 'description'),
                memo: await hasColumn(client, 'journal_entry_items', 'memo')
            };
            const jeiCols = await getJeiCoreCols(client);
            for (const line of lines) {
                if (!line.account_id) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Account ID is required for all journal entry lines' });
                }

                if (!line.fund_id) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Fund ID is required for all journal entry lines' });
                }

                // Each line must contain a non-zero debit or credit amount
                if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({ error: 'Each line must have either a debit or credit amount' });
                }
                // Build item insert dynamically (schema-aware core columns)
                const itemCols = [jeiCols.jeRef, jeiCols.accRef, jeiCols.fundRef, jeiCols.debitCol, jeiCols.creditCol];
                const itemVals = [journalEntryId, line.account_id, line.fund_id, line.debit || 0, line.credit || 0];
                if (itemHas.description && jeiCols.descCol === 'description') {
                    itemCols.push('description');
                    itemVals.push(line.description || '');
                } else if (itemHas.memo && jeiCols.descCol !== 'description') {
                    itemCols.push(jeiCols.descCol);
                    itemVals.push(line.description || '');
                }
                const itemPh = itemVals.map((_, i) => `$${i + 1}`).join(',');
                await client.query(
                    `INSERT INTO journal_entry_items (${itemCols.join(',')}) VALUES (${itemPh})`,
                    itemVals
                );

                // Update balances (schema-aware)
                if (line.debit && line.debit > 0) {
                    await maybeUpdateAccountBalance(client, line.account_id, line.debit);
                    await maybeUpdateFundBalance(client, line.fund_id, line.debit, line.account_id);
                }
                if (line.credit && line.credit > 0) {
                    await maybeUpdateAccountBalance(client, line.account_id, -line.credit);
                    await maybeUpdateFundBalance(client, line.fund_id, -line.credit, line.account_id);
                }
            }
        }

        await client.query('COMMIT');

        // Get the complete journal entry with lines
        const hasJEEntity2 = await hasColumn(pool, 'journal_entries', 'entity_id');
        const hasJETarget2 = await hasColumn(pool, 'journal_entries', 'target_entity_id');
        const entityNameExpr2 = await getEntityNameExpr(pool, 'e');
        const targetNameExpr2 = await getEntityNameExpr(pool, 'te');

        let selFields = 'je.*';
        let selJoins = '';
        if (hasJEEntity2) {
            selFields += `, ${entityNameExpr2} as entity_name`;
            selJoins += ' LEFT JOIN entities e ON je.entity_id = e.id';
        }
        if (hasJETarget2) {
            selFields += `, ${targetNameExpr2} as target_entity_name`;
            selJoins += ' LEFT JOIN entities te ON je.target_entity_id = te.id';
        }
        // Normalize type on response as well
        const hasTypeCol2 = await hasColumn(pool, 'journal_entries', 'type');
        const hasEntryTypeCol2 = await hasColumn(pool, 'journal_entries', 'entry_type');
        if (hasTypeCol2 && hasEntryTypeCol2) selFields += ', COALESCE(je.type, je.entry_type) AS type';
        else if (hasTypeCol2) selFields += ', je.type AS type';
        else if (hasEntryTypeCol2) selFields += ', je.entry_type AS type';

        const { rows } = await pool.query(
            `SELECT ${selFields} FROM journal_entries je${selJoins} WHERE je.id = $1`,
            [journalEntryId]
        );

        // Get the lines
        const sel1 = await getAccountFundSelectFragments(pool);
        const jeiCols2 = await getJeiCoreCols(pool);
        const linesResult = await pool.query(
            `SELECT jel.*,
                    COALESCE(jel.${jeiCols2.debitCol}, 0)  AS debit,
                    COALESCE(jel.${jeiCols2.creditCol}, 0) AS credit,
                    ${sel1.accDescExpr} as account_description,
                    ${sel1.accCodeExpr} as account_code,
                    ${sel1.fundNameExpr} as fund_name,
                    ${sel1.fundCodeExpr} as fund_code
             FROM journal_entry_items jel
             LEFT JOIN accounts a ON jel.${jeiCols2.accRef} = a.id
             LEFT JOIN funds f ON jel.${jeiCols2.fundRef} = f.id
             WHERE jel.${jeiCols2.jeRef} = $1
             ORDER BY jel.id`,
            [journalEntryId]
        );

        const result = rows[0];
        result.lines = linesResult.rows;

        res.status(201).json(result);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * PUT /api/journal-entries/:id
 * Updates an existing journal entry
 * Note: This only updates the header, not the lines
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        entity_id,
        target_entity_id,
        entry_date,
        reference_number,
        description,
        status,
        is_inter_entity
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!entry_date) {
        return res.status(400).json({ error: 'Entry date is required' });
    }
    
    // Check if journal entry exists
    const entryCheck = await pool.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
    if (entryCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    // Introspect columns and build dynamic UPDATE
    const jeHas = {
        target_entity_id: await hasColumn(pool, 'journal_entries', 'target_entity_id'),
        reference_number: await hasColumn(pool, 'journal_entries', 'reference_number'),
        reference: await hasColumn(pool, 'journal_entries', 'reference'),
        description: await hasColumn(pool, 'journal_entries', 'description'),
        status: await hasColumn(pool, 'journal_entries', 'status'),
        is_inter_entity: await hasColumn(pool, 'journal_entries', 'is_inter_entity'),
        type: await hasColumn(pool, 'journal_entries', 'type'),
        entry_type: await hasColumn(pool, 'journal_entries', 'entry_type')
    };

    const sets = ['entity_id = $1', 'entry_date = $2'];
    const vals = [entity_id, entry_date];
    let idx = 3;
    if (jeHas.target_entity_id && typeof target_entity_id !== 'undefined') {
        sets.push(`target_entity_id = $${idx++}`);
        vals.push(target_entity_id);
    }
    if (jeHas.reference_number) {
        sets.push(`reference_number = $${idx++}`);
        vals.push(reference_number);
    } else if (jeHas.reference) {
        sets.push(`reference = $${idx++}`);
        vals.push(reference_number);
    }
    if (jeHas.description && typeof description !== 'undefined') {
        sets.push(`description = $${idx++}`);
        vals.push(description);
    }
    if (jeHas.status && typeof status !== 'undefined') {
        sets.push(`status = $${idx++}`);
        vals.push(status);
    }
    if (jeHas.is_inter_entity && typeof is_inter_entity !== 'undefined') {
        sets.push(`is_inter_entity = $${idx++}`);
        vals.push(!!is_inter_entity);
    }
    // Update type if provided
    const reqType = (req.body && (req.body.type ?? req.body.entry_type)) || undefined;
    if (typeof reqType !== 'undefined') {
        if (jeHas.type) {
            sets.push(`type = $${idx++}`);
            vals.push(reqType);
        } else if (jeHas.entry_type) {
            sets.push(`entry_type = $${idx++}`);
            vals.push(reqType);
        }
    }
    sets.push(`id = id`); // no-op to simplify comma handling
    vals.push(id);

    const { rows } = await pool.query(
        `UPDATE journal_entries SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals
    );

    try {
        if (await hasColumn(pool, 'journal_entries', 'updated_at')) {
            await pool.query('UPDATE journal_entries SET updated_at = NOW() WHERE id = $1', [id]);
        }
    } catch (_) { /* ignore */ }

    res.json(rows[0]);
}));

/**
 * DELETE /api/journal-entries/:id/items
 * Deletes all line items for a journal entry and reverses their balance effects.
 */
router.delete('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Fetch existing lines
        const jeiCols = await getJeiCoreCols(client);
        const { rows: existing } = await client.query(
            `SELECT * FROM journal_entry_items WHERE ${jeiCols.jeRef} = $1`,
            [id]
        );

        // If no entry, 404
        const check = await client.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Journal entry not found' });
        }

        // Reverse balances for existing lines
        for (const line of existing) {
            if (line.debit && line.debit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, -line.debit);
                await maybeUpdateFundBalance(client, line.fund_id, -line.debit, line.account_id);
            }
            if (line.credit && line.credit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, line.credit);
                await maybeUpdateFundBalance(client, line.fund_id, line.credit, line.account_id);
            }
        }

        // Delete lines and reset total_amount
        await client.query(`DELETE FROM journal_entry_items WHERE ${jeiCols.jeRef} = $1`, [id]);
        await client.query('UPDATE journal_entries SET total_amount = 0 WHERE id = $1', [id]);
        try {
            if (await hasColumn(client, 'journal_entries', 'updated_at')) {
                await client.query('UPDATE journal_entries SET updated_at = NOW() WHERE id = $1', [id]);
            }
        } catch (_) { /* ignore */ }

        await client.query('COMMIT');
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

/**
 * POST /api/journal-entries/:id/items
 * Replaces the line items for a journal entry (inserts provided items) and updates balances and total_amount.
 */
router.post('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { items } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Items array is required' });
    }

    // Check entry status - skip balance validation for Pending entries
    const entryResult = await pool.query('SELECT status FROM journal_entries WHERE id = $1', [id]);
    if (entryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }
    const entryStatus = (entryResult.rows[0].status || '').toString().toLowerCase();

    // Validate balanced (only for non-Pending entries)
    let totalDebits = 0;
    let totalCredits = 0;
    for (const line of items) {
        totalDebits += parseFloat(line.debit || 0);
        totalCredits += parseFloat(line.credit || 0);
    }
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    if (entryStatus !== 'pending' && totalDebits !== totalCredits) {
        return res.status(400).json({
            error: 'Invalid journal entry: Debits must equal credits',
            details: `Total debits (${totalDebits}) do not equal total credits (${totalCredits})`
        });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const check = await client.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
        if (check.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Journal entry not found' });
        }

        // Insert new lines
        const jeiCols = await getJeiCoreCols(client);
        for (const line of items) {
            if (!line.account_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Account ID is required for all journal entry lines' });
            }
            if (!line.fund_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Fund ID is required for all journal entry lines' });
            }
            if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Each line must have either a debit or credit amount' });
            }

            const itemHas = {
                description: await hasColumn(client, 'journal_entry_items', 'description'),
                memo: await hasColumn(client, 'journal_entry_items', 'memo')
            };
            const cols = [jeiCols.jeRef, jeiCols.accRef, jeiCols.fundRef, jeiCols.debitCol, jeiCols.creditCol];
            const vals = [id, line.account_id, line.fund_id, line.debit || 0, line.credit || 0];
            if (itemHas.description && jeiCols.descCol === 'description') { cols.push('description'); vals.push(line.description || ''); }
            else if (itemHas.memo && jeiCols.descCol !== 'description') { cols.push(jeiCols.descCol); vals.push(line.description || ''); }
            const ph = vals.map((_, i) => `$${i + 1}`).join(',');
            await client.query(`INSERT INTO journal_entry_items (${cols.join(',')}) VALUES (${ph})`, vals);

            if (line.debit && line.debit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, line.debit);
                await maybeUpdateFundBalance(client, line.fund_id, line.debit, line.account_id);
            }
            if (line.credit && line.credit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, -line.credit);
                await maybeUpdateFundBalance(client, line.fund_id, -line.credit, line.account_id);
            }
        }

        // Update JE total_amount
        await client.query('UPDATE journal_entries SET total_amount = $1 WHERE id = $2', [totalDebits, id]);
        try {
            if (await hasColumn(client, 'journal_entries', 'updated_at')) {
                await client.query('UPDATE journal_entries SET updated_at = NOW() WHERE id = $1', [id]);
            }
        } catch (_) { /* ignore */ }

        await client.query('COMMIT');

        // Return updated lines
        const sel2 = await getAccountFundSelectFragments(pool);
        const jeiCols2 = await getJeiCoreCols(pool);
        const { rows } = await pool.query(
            `SELECT jel.*,
                    COALESCE(jel.${jeiCols2.debitCol}, 0)  AS debit,
                    COALESCE(jel.${jeiCols2.creditCol}, 0) AS credit,
                    ${sel2.accDescExpr} as account_description,
                    ${sel2.accCodeExpr} as account_code,
                    ${sel2.fundNameExpr} as fund_name,
                    ${sel2.fundCodeExpr} as fund_code
             FROM journal_entry_items jel
             LEFT JOIN accounts a ON jel.${jeiCols2.accRef} = a.id
             LEFT JOIN funds f ON jel.${jeiCols2.fundRef} = f.id
             WHERE jel.${jeiCols2.jeRef} = $1
             ORDER BY jel.id`,
            [id]
        );

        res.status(201).json({ items: rows });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

/**
 * POST /api/journal-entries/:id/post
 * Marks a journal entry as Posted (schema-aware: uses status or posted boolean)
 * Validates that debits equal credits before posting
 */
router.post('/:id/post', asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Ensure entry exists
    const exists = await pool.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
    if (exists.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }

    // Validate balance before posting - debits must equal credits
    const jeiCols = await getJeiCoreCols(pool);
    const linesResult = await pool.query(
        `SELECT ${jeiCols.debitCol} as debit, ${jeiCols.creditCol} as credit 
         FROM journal_entry_items WHERE ${jeiCols.jeRef} = $1`,
        [id]
    );
    
    let totalDebits = 0;
    let totalCredits = 0;
    linesResult.rows.forEach(line => {
        totalDebits += parseFloat(line.debit || 0);
        totalCredits += parseFloat(line.credit || 0);
    });
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    
    if (totalDebits !== totalCredits) {
        return res.status(400).json({
            error: 'Cannot post: Journal entry is not balanced',
            details: `Total debits (${totalDebits}) do not equal total credits (${totalCredits})`
        });
    }

    // Introspect columns
    const hasStatus = await hasColumn(pool, 'journal_entries', 'status');
    const hasPosted = await hasColumn(pool, 'journal_entries', 'posted');

    if (!hasStatus && !hasPosted) {
        return res.status(400).json({ error: 'Posting not supported: missing status/posted columns' });
    }

    // Update accordingly
    if (hasStatus) {
        await pool.query('UPDATE journal_entries SET status = $1 WHERE id = $2', ['Posted', id]);
    }
    if (hasPosted) {
        await pool.query('UPDATE journal_entries SET posted = TRUE WHERE id = $1', [id]);
    }
    try {
        if (await hasColumn(pool, 'journal_entries', 'updated_at')) {
            await pool.query('UPDATE journal_entries SET updated_at = NOW() WHERE id = $1', [id]);
        }
    } catch (_) { /* ignore */ }

    // Return updated entry header
    const { rows } = await pool.query('SELECT * FROM journal_entries WHERE id = $1', [id]);
    res.json(rows[0]);
}));

/**
 * DELETE /api/journal-entries/:id
 * Deletes a journal entry and its lines
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Start a transaction to delete the journal entry and its lines
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Get the journal entry lines to reverse account and fund balances (schema-aware)
        const jeiCols = await getJeiCoreCols(client);
        const linesResult = await client.query(`SELECT * FROM journal_entry_items WHERE ${jeiCols.jeRef} = $1`, [id]);
        
        if (linesResult.rows.length === 0) {
            // No lines found, check if the journal entry exists
            const entryCheck = await client.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
            if (entryCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Journal entry not found' });
            }
        }
        
        // Reverse account and fund balances
        for (const line of linesResult.rows) {
            if (line.debit && line.debit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, -line.debit);
                await maybeUpdateFundBalance(client, line.fund_id, -line.debit);
            }
            if (line.credit && line.credit > 0) {
                await maybeUpdateAccountBalance(client, line.account_id, line.credit);
                await maybeUpdateFundBalance(client, line.fund_id, line.credit);
            }
        }
        
        // Delete the journal entry lines
        await client.query(`DELETE FROM journal_entry_items WHERE ${jeiCols.jeRef} = $1`, [id]);
        
        // Delete the journal entry
        const result = await client.query('DELETE FROM journal_entries WHERE id = $1 RETURNING id', [id]);
        
        await client.query('COMMIT');
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Journal entry not found' });
        }
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

module.exports = router;
