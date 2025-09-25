// src/routes/bank-accounts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/bank-accounts
 * Returns all bank accounts, optionally filtered by status
 */
router.get('/', asyncHandler(async (req, res) => {
    const { status, type } = req.query;
    
    let query = `
        SELECT * FROM bank_accounts
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (type) {
        query += ` AND type = $${paramIndex++}`;
        params.push(type);
    }
    
    query += ` ORDER BY bank_name, account_name`;
    
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
            connection_method,
            description,
            gl_account_id,
            cash_account_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
    `, [
        entityId,
        bank_name,
        account_name,
        account_number,
        routing_number,
        type || 'Checking',
        status || 'Active',
        balance || 0.00,
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
    
    // Determine synchronized GL/cash account mapping
    let syncedAccountId = cash_account_id || gl_account_id || null;
    if (syncedAccountId) {
        // Validate exists
        const chk = await pool.query('SELECT 1 FROM accounts WHERE id = $1', [syncedAccountId]);
        if (!chk.rows.length) {
            return res.status(400).json({ error: 'Mapped cash/GL account not found' });
        }
    }

    const { rows } = await pool.query(`
        UPDATE bank_accounts
        SET bank_name = $1,
            account_name = $2,
            account_number = $3,
            routing_number = $4,
            type = $5,
            status = $6,
            balance = $7,
            connection_method = $8,
            description = $9,
            last_sync = $10,
            gl_account_id = COALESCE($12, gl_account_id),
            cash_account_id = COALESCE($12, cash_account_id),
            updated_at = NOW()
        WHERE id = $11
        RETURNING *
    `, [
        bank_name,
        account_name,
        account_number,
        routing_number,
        type,
        status,
        balance,
        connection_method,
        description,
        last_sync,
        id,
        syncedAccountId
    ]);
    
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
