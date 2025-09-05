// src/routes/funds.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

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
            last_used
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10, CURRENT_DATE))
        RETURNING *
    `, [
        fund_number || null,
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status || 'Active',
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
        last_used
    } = req.body;
    
    // Validate required fields
    if (!fund_code) {
        return res.status(400).json({ error: 'fund_code is required' });
    }
    if (!fund_name) {
        return res.status(400).json({ error: 'fund_name is required' });
    }
    
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
            last_used     = COALESCE($10, last_used)
        WHERE id = $11
        RETURNING *
    `, [
        fund_number || null,
        fund_code,
        fund_name,
        entity_name,
        entity_code,
        restriction,
        budget,
        balance_sheet,
        status || 'Active',
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

module.exports = router;
