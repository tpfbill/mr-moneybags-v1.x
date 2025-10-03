// src/routes/bank-accounts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/bank-accounts
 * Returns all bank accounts with calculated current balances based on linked GL accounts
 */
router.get('/', asyncHandler(async (req, res) => {
    const { status, type } = req.query;
    
    let query = `
        SELECT 
            ba.id,
            ba.entity_id,
            ba.gl_account_id,
            ba.bank_name,
            ba.account_name,
            ba.account_number,
            ba.routing_number,
            ba.type,
            ba.balance,
            ba.beginning_balance,
            ba.beginning_balance_date,
            ba.last_reconciliation_date,
            ba.status,
            ba.created_at,
            ba.updated_at,
            ba.last_reconciliation_id,
            ba.reconciled_balance,
            ba.connection_method,
            ba.last_sync,
            ba.description,
            ba.cash_account_id,
            CASE 
                WHEN ba.cash_account_id IS NOT NULL THEN
                    COALESCE(ba.beginning_balance, 0) + COALESCE((
                        SELECT SUM(jei.debit - jei.credit) 
                        FROM journal_entry_items jei 
                        JOIN journal_entries je ON jei.journal_entry_id = je.id 
                        WHERE jei.account_id = ba.cash_account_id 
                        AND je.status = 'Posted'
                    ), 0)
                ELSE ba.balance
            END as current_balance
        FROM bank_accounts ba
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND ba.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (type) {
        query += ` AND ba.type = $${paramIndex++}`;
        params.push(type);
    }
    
    query += ` ORDER BY ba.bank_name, ba.account_name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/bank-accounts/:id
 * Returns a specific bank account by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT * FROM bank_accounts WHERE id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/bank-accounts
 * Creates a new bank account
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        bank_name,
        account_name,
        account_number,
        routing_number,
        type,
        status,
        balance,
        beginning_balance,
        beginning_balance_date,
        connection_method,
        description,
        gl_account_id,
        cash_account_id
    } = req.body;
    
    // Validate required fields
    if (!bank_name) {
        return res.status(400).json({ error: 'Bank name is required' });
    }
    
    if (!account_name) {
        return res.status(400).json({ error: 'Account name is required' });
    }
    
    // Determine entity_id: use provided value if present; otherwise default to the primary entity
    let entityId = entity_id;
    if (!entityId) {
        const ent = await pool.query(
            `SELECT id FROM entities ORDER BY (code = 'TPF_PARENT') DESC, created_at ASC LIMIT 1`
        );
        entityId = ent.rows[0]?.id || null;
    }
    if (!entityId) {
        return res.status(400).json({ error: 'No entity available to assign bank account to' });
    }

    // Determine synchronized GL/cash account mapping (both point to same accounts.id)
    let syncedAccountId = cash_account_id || gl_account_id || null;
    if (syncedAccountId) {
        // Validate the referenced account exists
        const chk = await pool.query('SELECT 1 FROM accounts WHERE id = $1', [syncedAccountId]);
        if (!chk.rows.length) {
            return res.status(400).json({ error: 'Mapped cash/GL account not found' });
        }
    }

    // Canonicalize beginning balance inputs
    const bbNum =
        beginning_balance === '' || beginning_balance == null
            ? null
            : Number(beginning_balance);
    const bbDate = beginning_balance_date
        ? new Date(beginning_balance_date)
        : new Date();
    const bbDateIso = isNaN(bbDate.getTime())
        ? new Date().toISOString().split('T')[0]
        : bbDate.toISOString().split('T')[0];

    // Backward-compat shim: if caller provided only legacy balance and a cash/GL mapping,
    // treat it as beginning_balance for current balance computation.
    const hasExplicitBB = typeof beginning_balance !== 'undefined' || typeof beginning_balance_date !== 'undefined';
    const effBeginningBalance = hasExplicitBB
        ? (bbNum ?? 0)
        : (syncedAccountId ? (Number(balance) || 0) : 0);
    const effBeginningBalanceDate = hasExplicitBB
        ? bbDateIso
        : (syncedAccountId ? bbDateIso : null);

    const { rows } = await pool.query(`
        INSERT INTO bank_accounts (
            entity_id,
            bank_name,
            account_name,
            account_number,
            routing_number,
            type,
            status,
            balance,
            beginning_balance,
            beginning_balance_date,
            connection_method,
            description,
            gl_account_id,
            cash_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
    `, [
        entityId,
        bank_name,
        account_name,
        account_number,
        routing_number,
        type || 'Checking',
        status || 'Active',
        Number(balance) || 0.00,
        effBeginningBalance,
        effBeginningBalanceDate,
        connection_method || 'Manual',
        description || '',
        syncedAccountId,
        syncedAccountId
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/bank-accounts/:id
 * Updates an existing bank account
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        bank_name,
        account_name,
        account_number,
        routing_number,
        type,
        status,
        balance,
        beginning_balance,
        beginning_balance_date,
        connection_method,
        description,
        last_sync,
        gl_account_id,
        cash_account_id
    } = req.body;
    
    // Validate required fields
    if (!bank_name) {
        return res.status(400).json({ error: 'Bank name is required' });
    }
    
    if (!account_name) {
        return res.status(400).json({ error: 'Account name is required' });
    }
    
    // Check if bank account exists
    const accountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [id]);
    if (accountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    // Determine if mapping was explicitly provided; if so, validate and sync
    const mappingProvided = Object.prototype.hasOwnProperty.call(req.body, 'cash_account_id') ||
                            Object.prototype.hasOwnProperty.call(req.body, 'gl_account_id');
    let syncedAccountId = cash_account_id || gl_account_id || null;
    if (mappingProvided) {
        if (syncedAccountId) {
            const chk = await pool.query('SELECT 1 FROM accounts WHERE id = $1', [syncedAccountId]);
            if (!chk.rows.length) {
                return res.status(400).json({ error: 'Mapped cash/GL account not found' });
            }
        }
    }

    // Build dynamic UPDATE to avoid unintentionally nulling fields
    const updateFields = [];
    const params = [];
    let idx = 1;

    // Required fields (always updated)
    updateFields.push(`bank_name = $${idx++}`);        params.push(bank_name);
    updateFields.push(`account_name = $${idx++}`);     params.push(account_name);

    if (typeof account_number !== 'undefined') { updateFields.push(`account_number = $${idx++}`); params.push(account_number); }
    if (typeof routing_number !== 'undefined') { updateFields.push(`routing_number = $${idx++}`); params.push(routing_number); }
    if (typeof type !== 'undefined')           { updateFields.push(`type = $${idx++}`);           params.push(type); }
    if (typeof status !== 'undefined')         { updateFields.push(`status = $${idx++}`);         params.push(status); }
    if (typeof balance !== 'undefined')        { updateFields.push(`balance = $${idx++}`);        params.push(Number(balance)); }
    if (typeof beginning_balance !== 'undefined') {
        updateFields.push(`beginning_balance = $${idx++}`);
        params.push(beginning_balance === '' || beginning_balance == null ? null : Number(beginning_balance));
    }
    if (typeof beginning_balance_date !== 'undefined') {
        updateFields.push(`beginning_balance_date = COALESCE($${idx++}::date, beginning_balance_date)`);
        // default to today if empty string provided
        const d = beginning_balance_date && String(beginning_balance_date).trim()
            ? new Date(beginning_balance_date)
            : new Date();
        params.push(isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]);
    }
    if (typeof connection_method !== 'undefined') { updateFields.push(`connection_method = $${idx++}`); params.push(connection_method); }
    if (typeof description !== 'undefined')    { updateFields.push(`description = $${idx++}`);    params.push(description); }
    if (typeof last_sync !== 'undefined')      { updateFields.push(`last_sync = $${idx++}`);      params.push(last_sync); }

    if (mappingProvided) {
        // Set both columns to the same value (can be NULL to clear)
        updateFields.push(`gl_account_id = $${idx}, cash_account_id = $${idx}`);
        params.push(syncedAccountId);
        idx++;
    }

    // Backward-compat shim: when mapping exists and caller only sends legacy balance (no beginning fields),
    // treat balance as beginning_balance if beginning_balance is NULL currently.
    if (!hasOwnProperty.call(req.body, 'beginning_balance') && !hasOwnProperty.call(req.body, 'beginning_balance_date') && (cash_account_id || gl_account_id)) {
        updateFields.push(`beginning_balance = COALESCE(beginning_balance, $${idx++})`);
        params.push(Number(balance) || 0);
        updateFields.push(`beginning_balance_date = COALESCE(beginning_balance_date, CURRENT_DATE)`);
    }

    updateFields.push('updated_at = NOW()');

    params.push(id);

    const { rows } = await pool.query(
        `UPDATE bank_accounts
            SET ${updateFields.join(', ')}
          WHERE id = $${idx}
          RETURNING *`,
        params
    );
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-accounts/:id
 * Deletes a bank account if it has no dependencies
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check for NACHA settings using this bank account as settlement account
    const nachaSettingsCheck = await pool.query(
        'SELECT id FROM company_nacha_settings WHERE settlement_account_id = $1 LIMIT 1',
        [id]
    );
    
    if (nachaSettingsCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete bank account used as settlement account',
            details: 'This bank account is used as a settlement account in NACHA settings'
        });
    }
    
    // If no dependencies, delete the bank account
    const result = await pool.query('DELETE FROM bank_accounts WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    res.status(204).send();
}));

/**
 * POST /api/bank-accounts/:id/sync
 * Updates the last_sync timestamp for a bank account
 */
router.post('/:id/sync', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if bank account exists
    const accountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [id]);
    if (accountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    const { rows } = await pool.query(`
        UPDATE bank_accounts
        SET last_sync = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
    `, [id]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/bank-accounts/:id/update-balance
 * Updates the balance of a bank account
 */
router.post('/:id/update-balance', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { balance } = req.body;
    
    if (balance === undefined || isNaN(parseFloat(balance))) {
        return res.status(400).json({ error: 'Valid balance is required' });
    }
    
    // Check if bank account exists
    const accountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [id]);
    if (accountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    const { rows } = await pool.query(`
        UPDATE bank_accounts
        SET balance = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `, [
        parseFloat(balance),
        id
    ]);
    
    res.json(rows[0]);
}));

module.exports = router;
