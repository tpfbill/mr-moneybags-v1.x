// src/routes/check-formats.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/check-formats
 * Returns all check formats
 */
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT * FROM check_formats
        ORDER BY is_default DESC, format_name ASC
    `);
    
    res.json(rows);
}));

/**
 * GET /api/check-formats/:id
 * Returns a specific check format
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM check_formats WHERE id = $1', [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Check format not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/check-formats
 * Creates a new check format
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        format_name,
        description,
        check_width,
        check_height,
        payee_x,
        payee_y,
        date_x,
        date_y,
        amount_x,
        amount_y,
        amount_words_x,
        amount_words_y,
        memo_x,
        memo_y,
        signature_x,
        signature_y,
        font_name,
        font_size_normal,
        font_size_amount,
        is_default
    } = req.body;
    
    // Validate required fields
    if (!format_name) {
        return res.status(400).json({ error: 'Format name is required' });
    }
    
    if (!check_width || !check_height) {
        return res.status(400).json({ error: 'Check dimensions are required' });
    }
    
    // Required position fields
    const requiredPositions = [
        { name: 'payee_x', value: payee_x },
        { name: 'payee_y', value: payee_y },
        { name: 'date_x', value: date_x },
        { name: 'date_y', value: date_y },
        { name: 'amount_x', value: amount_x },
        { name: 'amount_y', value: amount_y },
        { name: 'amount_words_x', value: amount_words_x },
        { name: 'amount_words_y', value: amount_words_y },
        { name: 'memo_x', value: memo_x },
        { name: 'memo_y', value: memo_y },
        { name: 'signature_x', value: signature_x },
        { name: 'signature_y', value: signature_y }
    ];
    
    for (const pos of requiredPositions) {
        if (pos.value === undefined || pos.value === null) {
            return res.status(400).json({ 
                error: `Position ${pos.name} is required` 
            });
        }
    }
    
    // Start a transaction to handle default flag
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // If this format is set as default, unset any existing default
        if (is_default) {
            await client.query(`
                UPDATE check_formats
                SET is_default = FALSE
                WHERE is_default = TRUE
            `);
        }
        
        // Insert the new format
        const { rows } = await client.query(`
            INSERT INTO check_formats (
                format_name,
                description,
                check_width,
                check_height,
                payee_x,
                payee_y,
                date_x,
                date_y,
                amount_x,
                amount_y,
                amount_words_x,
                amount_words_y,
                memo_x,
                memo_y,
                signature_x,
                signature_y,
                font_name,
                font_size_normal,
                font_size_amount,
                is_default
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
            )
            RETURNING *
        `, [
            format_name,
            description || null,
            check_width,
            check_height,
            payee_x,
            payee_y,
            date_x,
            date_y,
            amount_x,
            amount_y,
            amount_words_x,
            amount_words_y,
            memo_x,
            memo_y,
            signature_x,
            signature_y,
            font_name || 'Arial',
            font_size_normal || 10.00,
            font_size_amount || 12.00,
            is_default || false
        ]);
        
        await client.query('COMMIT');
        
        res.status(201).json(rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * PUT /api/check-formats/:id
 * Updates a check format
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        format_name,
        description,
        check_width,
        check_height,
        payee_x,
        payee_y,
        date_x,
        date_y,
        amount_x,
        amount_y,
        amount_words_x,
        amount_words_y,
        memo_x,
        memo_y,
        signature_x,
        signature_y,
        font_name,
        font_size_normal,
        font_size_amount,
        is_default
    } = req.body;
    
    // Check if format exists
    const formatCheck = await pool.query('SELECT id, is_default FROM check_formats WHERE id = $1', [id]);
    if (formatCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check format not found' });
    }
    
    // Start a transaction to handle default flag
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // If this format is being set as default and wasn't already, unset any existing default
        if (is_default && !formatCheck.rows[0].is_default) {
            await client.query(`
                UPDATE check_formats
                SET is_default = FALSE
                WHERE is_default = TRUE
            `);
        }
        
        // Update the format
        const updateFields = [];
        const params = [];
        let paramIndex = 1;
        
        if (format_name !== undefined) {
            updateFields.push(`format_name = $${paramIndex++}`);
            params.push(format_name);
        }
        
        if (description !== undefined) {
            updateFields.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        
        if (check_width !== undefined) {
            updateFields.push(`check_width = $${paramIndex++}`);
            params.push(check_width);
        }
        
        if (check_height !== undefined) {
            updateFields.push(`check_height = $${paramIndex++}`);
            params.push(check_height);
        }
        
        if (payee_x !== undefined) {
            updateFields.push(`payee_x = $${paramIndex++}`);
            params.push(payee_x);
        }
        
        if (payee_y !== undefined) {
            updateFields.push(`payee_y = $${paramIndex++}`);
            params.push(payee_y);
        }
        
        if (date_x !== undefined) {
            updateFields.push(`date_x = $${paramIndex++}`);
            params.push(date_x);
        }
        
        if (date_y !== undefined) {
            updateFields.push(`date_y = $${paramIndex++}`);
            params.push(date_y);
        }
        
        if (amount_x !== undefined) {
            updateFields.push(`amount_x = $${paramIndex++}`);
            params.push(amount_x);
        }
        
        if (amount_y !== undefined) {
            updateFields.push(`amount_y = $${paramIndex++}`);
            params.push(amount_y);
        }
        
        if (amount_words_x !== undefined) {
            updateFields.push(`amount_words_x = $${paramIndex++}`);
            params.push(amount_words_x);
        }
        
        if (amount_words_y !== undefined) {
            updateFields.push(`amount_words_y = $${paramIndex++}`);
            params.push(amount_words_y);
        }
        
        if (memo_x !== undefined) {
            updateFields.push(`memo_x = $${paramIndex++}`);
            params.push(memo_x);
        }
        
        if (memo_y !== undefined) {
            updateFields.push(`memo_y = $${paramIndex++}`);
            params.push(memo_y);
        }
        
        if (signature_x !== undefined) {
            updateFields.push(`signature_x = $${paramIndex++}`);
            params.push(signature_x);
        }
        
        if (signature_y !== undefined) {
            updateFields.push(`signature_y = $${paramIndex++}`);
            params.push(signature_y);
        }
        
        if (font_name !== undefined) {
            updateFields.push(`font_name = $${paramIndex++}`);
            params.push(font_name);
        }
        
        if (font_size_normal !== undefined) {
            updateFields.push(`font_size_normal = $${paramIndex++}`);
            params.push(font_size_normal);
        }
        
        if (font_size_amount !== undefined) {
            updateFields.push(`font_size_amount = $${paramIndex++}`);
            params.push(font_size_amount);
        }
        
        if (is_default !== undefined) {
            updateFields.push(`is_default = $${paramIndex++}`);
            params.push(is_default);
        }
        
        // Add updated_at
        updateFields.push(`updated_at = NOW()`);
        
        // Add ID as the last parameter
        params.push(id);
        
        const { rows } = await client.query(`
            UPDATE check_formats
            SET ${updateFields.join(', ')}
            WHERE id = $${paramIndex}
            RETURNING *
        `, params);
        
        await client.query('COMMIT');
        
        res.json(rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * DELETE /api/check-formats/:id
 * Deletes a check format
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if format exists
    const formatCheck = await pool.query('SELECT id FROM check_formats WHERE id = $1', [id]);
    if (formatCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check format not found' });
    }
    
    // Check if format is in use
    const inUseCheck = await pool.query('SELECT id FROM printed_checks WHERE check_format_id = $1 LIMIT 1', [id]);
    if (inUseCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Format is in use',
            details: 'This format cannot be deleted because it is used by one or more checks'
        });
    }
    
    // Delete the format
    await pool.query('DELETE FROM check_formats WHERE id = $1', [id]);
    
    res.status(204).send();
}));

/**
 * POST /api/check-formats/:id/set-default
 * Sets a check format as the default
 */
router.post('/:id/set-default', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if format exists
    const formatCheck = await pool.query('SELECT id FROM check_formats WHERE id = $1', [id]);
    if (formatCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check format not found' });
    }
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Unset any existing default
        await client.query(`
            UPDATE check_formats
            SET is_default = FALSE
            WHERE is_default = TRUE
        `);
        
        // Set this format as default
        const { rows } = await client.query(`
            UPDATE check_formats
            SET 
                is_default = TRUE,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);
        
        await client.query('COMMIT');
        
        res.json(rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

module.exports = router;
