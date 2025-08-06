// src/routes/nacha-settings.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/nacha-settings
 * Returns all company NACHA settings, optionally filtered by entity_id
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id } = req.query;
    
    let query = `
        SELECT cns.*, e.name as entity_name, ba.account_name as settlement_account_name
        FROM company_nacha_settings cns
        LEFT JOIN entities e ON cns.entity_id = e.id
        LEFT JOIN bank_accounts ba ON cns.settlement_account_id = ba.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND cns.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    query += ` ORDER BY e.name, cns.company_name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/nacha-settings/:id
 * Returns a specific NACHA setting by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT cns.*, e.name as entity_name, ba.account_name as settlement_account_name
        FROM company_nacha_settings cns
        LEFT JOIN entities e ON cns.entity_id = e.id
        LEFT JOIN bank_accounts ba ON cns.settlement_account_id = ba.id
        WHERE cns.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'NACHA setting not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/nacha-settings
 * Creates a new NACHA setting
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        settlement_account_id,
        company_name,
        company_id,
        originating_dfi_id,
        company_entry_description,
        is_production
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!company_name) {
        return res.status(400).json({ error: 'Company name is required' });
    }
    
    if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
    }
    
    if (!originating_dfi_id) {
        return res.status(400).json({ error: 'Originating DFI ID is required' });
    }
    
    // Validate company name length (NACHA requires 16 chars or less)
    if (company_name.length > 16) {
        return res.status(400).json({ 
            error: 'Company name must be 16 characters or less for NACHA compliance',
            details: 'NACHA format requires company name to fit in a 16-character field'
        });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO company_nacha_settings (
            entity_id,
            settlement_account_id,
            company_name,
            company_id,
            originating_dfi_id,
            company_entry_description,
            is_production
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
        entity_id,
        settlement_account_id,
        company_name,
        company_id,
        originating_dfi_id,
        company_entry_description || 'PAYMENT',
        is_production || false
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/nacha-settings/:id
 * Updates an existing NACHA setting
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        entity_id,
        settlement_account_id,
        company_name,
        company_id,
        originating_dfi_id,
        company_entry_description,
        is_production
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!company_name) {
        return res.status(400).json({ error: 'Company name is required' });
    }
    
    if (!company_id) {
        return res.status(400).json({ error: 'Company ID is required' });
    }
    
    if (!originating_dfi_id) {
        return res.status(400).json({ error: 'Originating DFI ID is required' });
    }
    
    // Validate company name length (NACHA requires 16 chars or less)
    if (company_name.length > 16) {
        return res.status(400).json({ 
            error: 'Company name must be 16 characters or less for NACHA compliance',
            details: 'NACHA format requires company name to fit in a 16-character field'
        });
    }
    
    // Check if the NACHA setting exists
    const checkResult = await pool.query('SELECT id FROM company_nacha_settings WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'NACHA setting not found' });
    }
    
    const { rows } = await pool.query(`
        UPDATE company_nacha_settings
        SET entity_id = $1,
            settlement_account_id = $2,
            company_name = $3,
            company_id = $4,
            originating_dfi_id = $5,
            company_entry_description = $6,
            is_production = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        entity_id,
        settlement_account_id,
        company_name,
        company_id,
        originating_dfi_id,
        company_entry_description,
        is_production,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/nacha-settings/:id
 * Deletes a NACHA setting
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if the setting is being used in any payment batches
    const batchCheckResult = await pool.query(
        'SELECT id FROM payment_batches WHERE nacha_settings_id = $1 LIMIT 1',
        [id]
    );
    
    if (batchCheckResult.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete NACHA setting that is in use',
            details: 'This NACHA setting is referenced by one or more payment batches'
        });
    }
    
    const result = await pool.query(
        'DELETE FROM company_nacha_settings WHERE id = $1 RETURNING id',
        [id]
    );
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'NACHA setting not found' });
    }
    
    res.status(204).send();
}));

module.exports = router;
