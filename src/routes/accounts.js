// src/routes/accounts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/accounts
 * Returns all accounts, optionally filtered by entity_id
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, classifications, status } = req.query;
    
    let query = `
        SELECT a.*, e.name as entity_name
        FROM accounts a
        LEFT JOIN entities e ON a.entity_id = e.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND a.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    if (classifications) {
        query += ` AND a.classifications = $${paramIndex++}`;
        params.push(classifications);
    }
    
    if (status) {
        query += ` AND a.status = $${paramIndex++}`;
        params.push(status);
    }
    
    query += ` ORDER BY a.code, a.description`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * POST /api/accounts
 * Creates a new account
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        code,
        description,
        classifications,
        status
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Account code is required' });
    }
    
    if (!description) {
        return res.status(400).json({ error: 'Account description is required' });
    }
    
    if (!classifications) {
        return res.status(400).json({ error: 'Account classifications is required' });
    }
    
    // Validate entity exists
    const entityCheck = await pool.query('SELECT id FROM entities WHERE id = $1', [entity_id]);
    if (entityCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Entity not found' });
    }
    
    // Check if account code already exists for this entity
    const codeCheck = await pool.query(
        'SELECT id FROM accounts WHERE entity_id = $1 AND code = $2',
        [entity_id, code]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Account code already exists for this entity',
            details: 'Each account code must be unique within an entity'
        });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO accounts (
            entity_id,
            code,
            description,
            classifications,
            status,
            balance
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
    `, [
        entity_id,
        code,
        description,
        classifications,
        status || 'Active',
        0.00 // Initial balance
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/accounts/:id
 * Updates an existing account
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        entity_id,
        code,
        description,
        classifications,
        status,
        balance
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Account code is required' });
    }
    
    if (!description) {
        return res.status(400).json({ error: 'Account description is required' });
    }
    
    if (!classifications) {
        return res.status(400).json({ error: 'Account classifications is required' });
    }
    
    // Check if account exists
    const accountCheck = await pool.query('SELECT id FROM accounts WHERE id = $1', [id]);
    if (accountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
    }
    
    // Check if account code already exists for this entity (excluding this account)
    const codeCheck = await pool.query(
        'SELECT id FROM accounts WHERE entity_id = $1 AND code = $2 AND id != $3',
        [entity_id, code, id]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Account code already exists for this entity',
            details: 'Each account code must be unique within an entity'
        });
    }
    
    const { rows } = await pool.query(`
        UPDATE accounts
        SET entity_id = $1,
            code = $2,
            description = $3,
            classifications = $4,
            status = $5,
            balance = $6,
            updated_at = NOW()
        WHERE id = $7
        RETURNING *
    `, [
        entity_id,
        code,
        description,
        classifications,
        status,
        balance || 0.00,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/accounts/:id
 * Deletes an account if it has no dependencies
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check for journal entry items using this account
    const journalItemsCheck = await pool.query(
        'SELECT id FROM journal_entry_items WHERE account_id = $1 LIMIT 1',
        [id]
    );
    
    if (journalItemsCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete account with journal entry items',
            details: 'This account is referenced in journal entries and cannot be deleted'
        });
    }
    
    // Check for budgets using this account
    const budgetsCheck = await pool.query(
        'SELECT id FROM budgets WHERE account_id = $1 LIMIT 1',
        [id]
    );
    
    if (budgetsCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete account with budget entries',
            details: 'This account is referenced in budgets and cannot be deleted'
        });
    }
    
    // If no dependencies, delete the account
    const result = await pool.query('DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
    }
    
    res.status(204).send();
}));

/**
 * GET /api/accounts/:id
 * Returns a specific account by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT a.*, e.name as entity_name
        FROM accounts a
        LEFT JOIN entities e ON a.entity_id = e.id
        WHERE a.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Account not found' });
    }
    
    res.json(rows[0]);
}));

module.exports = router;
