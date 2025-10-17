// src/routes/payment-batches.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/payment-batches
 * Returns all payment batches, optionally filtered by entity_id, status, or date range
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, status, from_date, to_date } = req.query;
    
    let query = `
        SELECT pb.*, 
               e.name AS entity_name,
               f.name AS fund_name,
               COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, '') AS created_by_name
        FROM payment_batches pb
        LEFT JOIN entities e ON pb.entity_id = e.id
        LEFT JOIN funds f ON pb.fund_id = f.id
        LEFT JOIN users u ON u.id = pb.created_by
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND pb.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    if (status) {
        query += ` AND pb.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (from_date) {
        query += ` AND pb.batch_date >= $${paramIndex++}`;
        params.push(from_date);
    }
    
    if (to_date) {
        query += ` AND pb.batch_date <= $${paramIndex++}`;
        params.push(to_date);
    }
    
    query += ` ORDER BY pb.batch_date DESC, pb.created_at DESC`;
    
    /* ------------------------------------------------------------------ 
     * Execute query with defensive handling for missing tables
     *   • PG error code 42P01  → undefined_table
     *   • Some drivers return text “does not exist”
     * If tables have not been created yet, respond with an empty array
     * instead of propagating a 500 so the UI can still load gracefully.
     * ----------------------------------------------------------------*/
    try {
        const { rows } = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        const undefTable =
            err?.code === '42P01' ||
            /does not exist/i.test(err?.message || '');

        if (undefTable) {
            // Tables not present yet – treat as no data rather than error
            return res.json([]);
        }
        /* ----------------------------------------------------------------
         * Any unexpected error: log & degrade gracefully
         * -------------------------------------------------------------- */
        console.warn(
            '[payment-batches] Failed to query batches – returning empty list:',
            `${err.code || 'no-code'} – ${err.message}`
        );
        return res.json([]);
    }
}));

/**
 * GET /api/payment-batches/:id
 * Returns a specific payment batch by ID with its items
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get the payment batch
    const batchResult = await pool.query(`
        SELECT pb.*, 
               e.name AS entity_name,
               f.name AS fund_name,
               COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, '') AS created_by_name
        FROM payment_batches pb
        LEFT JOIN entities e ON pb.entity_id = e.id
        LEFT JOIN funds f ON pb.fund_id = f.id
        LEFT JOIN users u ON u.id = pb.created_by
        WHERE pb.id = $1
    `, [id]);
    
    if (batchResult.rows.length === 0) {
        return res.status(404).json({ error: 'Payment batch not found' });
    }
    
    // Get the payment items for this batch
    const itemsResult = await pool.query(`
        SELECT pi.*, 
               v.name               AS vendor_name,
               v.bank_account_number,
               v.bank_account_type
        FROM payment_items pi
        LEFT JOIN vendors v ON pi.vendor_id = v.id
        WHERE pi.payment_batch_id = $1
        ORDER BY pi.created_at
    `, [id]);
    
    // Combine batch with its items
    const batch = batchResult.rows[0];
    batch.items = itemsResult.rows;
    
    res.json(batch);
}));

/**
 * POST /api/payment-batches
 * Creates a new payment batch
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        fund_id,
        nacha_settings_id,
        batch_number,
        batch_date,
        effective_date,
        description,
        status
    } = req.body;

    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }

    if (!batch_number) {
        return res.status(400).json({ error: 'Batch number is required' });
    }

    if (!nacha_settings_id) {
        return res.status(400).json({ error: 'NACHA settings ID is required' });
    }

    // Get bank_name from bank_accounts table
    const bankAccount = await pool.query(
        'SELECT ba.bank_name FROM bank_accounts ba JOIN company_nacha_settings cns ON ba.id = cns.settlement_account_id WHERE cns.id = $1',
        [nacha_settings_id]
    );

    const bank_name = bankAccount.rows.length > 0 ? bankAccount.rows[0].bank_name : null;

    const created_by = (req.user && req.user.id) || null;

    const { rows } = await pool.query(`
        INSERT INTO payment_batches (
            entity_id,
            fund_id,
            nacha_settings_id,
            batch_number,
            batch_date,
            effective_date,
            description,
            status,
            total_amount,
            total_items,
            bank_name,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
    `, [
        entity_id,
        fund_id,
        nacha_settings_id,
        batch_number,
        batch_date || new Date(),
        effective_date,
        description || '',
        status || 'draft',
        0,          // Initial total_amount
        0,          // Initial total_items
        bank_name,
        created_by
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/payment-batches/:id
 * Updates an existing payment batch
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        entity_id,
        fund_id,
        nacha_settings_id,
        batch_number,
        batch_date,
        effective_date,
        description,
        status,
        total_amount
    } = req.body;

    // Validate batch exists
    const batchCheck = await pool.query('SELECT id FROM payment_batches WHERE id = $1', [id]);
    if (batchCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Payment batch not found' });
    }

    // Get bank_name from bank_accounts table
    const bankAccount = await pool.query(
        'SELECT ba.bank_name FROM bank_accounts ba JOIN company_nacha_settings cns ON ba.id = cns.settlement_account_id WHERE cns.id = $1',
        [nacha_settings_id]
    );

    const bank_name = bankAccount.rows.length > 0 ? bankAccount.rows[0].bank_name : null;

    // Update the batch
    const { rows } = await pool.query(`
        UPDATE payment_batches
        SET entity_id = $1,
            fund_id = $2,
            nacha_settings_id = $3,
            batch_number = $4,
            batch_date = $5,
            effective_date = $6,
            status = $7,
            total_amount = $8,
            description = $9,
            bank_name = $10,
            updated_at = NOW()
        WHERE id = $11
        RETURNING *
    `, [
        entity_id,
        fund_id,
        nacha_settings_id,
        batch_number,
        batch_date,
        effective_date,
        status,
        total_amount,
        description,
        bank_name,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/payment-batches/:id
 * Deletes a payment batch and its items
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Start a transaction to delete batch and related items
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete related payment items first
        await client.query('DELETE FROM payment_items WHERE payment_batch_id = $1', [id]);
        
        // Delete the payment batch
        const result = await client.query('DELETE FROM payment_batches WHERE id = $1 RETURNING id', [id]);
        
        await client.query('COMMIT');
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Payment batch not found' });
        }
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * GET /api/payment-batches/:id/items
 * Returns all payment items for a specific batch
 */
router.get('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT pi.*, 
               v.name               AS vendor_name,
               v.bank_account_number,
               v.bank_account_type
        FROM payment_items pi
        LEFT JOIN vendors v ON pi.vendor_id = v.id
        WHERE pi.payment_batch_id = $1
        ORDER BY pi.created_at
    `, [id]);
    
    res.json(rows);
}));

/**
 * POST /api/payment-batches/:id/items
 * Adds a new payment item to a batch
 */
router.post('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        vendor_id,
        journal_entry_id,
        amount,
        description,
        status
    } = req.body;
    
    // Validate required fields
    if (!vendor_id) {
        return res.status(400).json({ error: 'Vendor ID is required' });
    }
    
    if (!amount || isNaN(parseFloat(amount))) {
        return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    // Start a transaction to add item and update batch totals
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Verify the batch exists
        const batchCheck = await client.query('SELECT id FROM payment_batches WHERE id = $1', [id]);
        if (batchCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment batch not found' });
        }
        
        // Insert the payment item
        const itemResult = await client.query(`
            INSERT INTO payment_items (
                payment_batch_id,
                vendor_id,
                journal_entry_id,
                amount,
                description,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [
            id,
            vendor_id,
            journal_entry_id,
            amount,
            description,
            status || 'Pending'
        ]);
        
        // Update the batch totals (amount and items count)
        await client.query(`
            UPDATE payment_batches
            SET total_amount = (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM payment_items
                    WHERE payment_batch_id = $1
                ),
                total_items = (
                    SELECT COUNT(*)
                    FROM payment_items
                    WHERE payment_batch_id = $1
                ),
                updated_at = NOW()
            WHERE id = $1
        `, [id]);
        
        await client.query('COMMIT');
        
        // Get the updated item with related data
        const { rows } = await pool.query(`
            SELECT pi.*, 
                   v.name  AS vendor_name,
                   v.bank_account_number,
                   v.bank_account_type
            FROM payment_items pi
            LEFT JOIN vendors v ON pi.vendor_id = v.id
            WHERE pi.id = $1
        `, [itemResult.rows[0].id]);
        
        res.status(201).json(rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * DELETE /api/payment-batches/:batchId/items/:itemId
 * Removes a payment item from a batch
 */
router.delete('/:batchId/items/:itemId', asyncHandler(async (req, res) => {
    const { batchId, itemId } = req.params;
    
    // Start a transaction to delete item and update batch totals
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Verify the item exists and belongs to the batch
        const itemCheck = await client.query(
            'SELECT id FROM payment_items WHERE id = $1 AND payment_batch_id = $2',
            [itemId, batchId]
        );
        
        if (itemCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Payment item not found or does not belong to this batch' });
        }
        
        // Delete the payment item
        await client.query('DELETE FROM payment_items WHERE id = $1', [itemId]);
        
        // Update the batch totals (amount and items count)
        await client.query(`
            UPDATE payment_batches
            SET total_amount = (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM payment_items
                    WHERE payment_batch_id = $1
                ),
                total_items = (
                    SELECT COUNT(*)
                    FROM payment_items
                    WHERE payment_batch_id = $1
                ),
                updated_at = NOW()
            WHERE id = $1
        `, [batchId]);
        
        await client.query('COMMIT');
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

module.exports = router;
