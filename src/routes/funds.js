// src/routes/funds.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/funds
 * Returns all funds, optionally filtered by entity_id
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, type, status } = req.query;
    
    let query = `
        SELECT f.*, e.name as entity_name
        FROM funds f
        LEFT JOIN entities e ON f.entity_id = e.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND f.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    if (type) {
        query += ` AND f.type = $${paramIndex++}`;
        params.push(type);
    }
    
    if (status) {
        query += ` AND f.status = $${paramIndex++}`;
        params.push(status);
    }
    
    query += ` ORDER BY f.code, f.name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/funds/:id
 * Returns a specific fund by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT f.*, e.name as entity_name
        FROM funds f
        LEFT JOIN entities e ON f.entity_id = e.id
        WHERE f.id = $1
    `, [id]);
    
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
        entity_id,
        code,
        name,
        type,
        description,
        status
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Fund code is required' });
    }
    
    if (!name) {
        return res.status(400).json({ error: 'Fund name is required' });
    }
    
    // Validate entity exists
    const entityCheck = await pool.query('SELECT id FROM entities WHERE id = $1', [entity_id]);
    if (entityCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Entity not found' });
    }
    
    // Check if fund code already exists for this entity
    const codeCheck = await pool.query(
        'SELECT id FROM funds WHERE entity_id = $1 AND code = $2',
        [entity_id, code]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Fund code already exists for this entity',
            details: 'Each fund code must be unique within an entity'
        });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO funds (
            entity_id,
            code,
            name,
            type,
            description,
            status,
            balance
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
        entity_id,
        code,
        name,
        type || 'Unrestricted',
        description || '',
        status || 'Active',
        0.00 // Initial balance
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
        entity_id,
        code,
        name,
        type,
        description,
        status,
        balance
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Fund code is required' });
    }
    
    if (!name) {
        return res.status(400).json({ error: 'Fund name is required' });
    }
    
    // Check if fund exists
    const fundCheck = await pool.query('SELECT id FROM funds WHERE id = $1', [id]);
    if (fundCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Fund not found' });
    }
    
    // Check if fund code already exists for this entity (excluding this fund)
    const codeCheck = await pool.query(
        'SELECT id FROM funds WHERE entity_id = $1 AND code = $2 AND id != $3',
        [entity_id, code, id]
    );
    
    if (codeCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Fund code already exists for this entity',
            details: 'Each fund code must be unique within an entity'
        });
    }
    
    const { rows } = await pool.query(`
        UPDATE funds
        SET entity_id = $1,
            code = $2,
            name = $3,
            type = $4,
            description = $5,
            status = $6,
            balance = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        entity_id,
        code,
        name,
        type,
        description,
        status,
        balance || 0.00,
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

module.exports = router;
