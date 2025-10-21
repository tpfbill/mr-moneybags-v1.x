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

    // Base filter construction shared by primary and fallback queries
    const params = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (entity_id) { where += ` AND pb.entity_id = $${i++}`; params.push(entity_id); }
    if (status)    { where += ` AND pb.status    = $${i++}`; params.push(status); }
    if (from_date) { where += ` AND pb.batch_date >= $${i++}`; params.push(from_date); }
    if (to_date)   { where += ` AND pb.batch_date <= $${i++}`; params.push(to_date); }
   
    console.log("WEL: "+where);
    const orderBy = ' ORDER BY pb.batch_date DESC, pb.created_at DESC';

    // Primary query (includes created_by_name via users join)
    const primaryQuery = `
        SELECT pb.*,
               e.name AS entity_name,
               f.name AS fund_name,
               COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, '') AS created_by_name
          FROM payment_batches pb
     LEFT JOIN entities e ON pb.entity_id = e.id
     LEFT JOIN funds    f ON pb.fund_id = f.id
     LEFT JOIN users    u ON u.id = pb.created_by
          ${where}
          ${orderBy}
    `;

    // Fallback query (omit users join and avoid referencing columns that may not exist)
    const fallbackQuery = `
        SELECT pb.*,
               e.name AS entity_name
          FROM payment_batches pb
     LEFT JOIN entities e ON pb.entity_id = e.id
          ${where}
          ${orderBy}
    `;

    // Minimal fallback (no joins at all) ensures we can return rows from payment_batches
    const minimalQuery = `
        SELECT pb.*
          FROM payment_batches pb
          ${where}
          ${orderBy}
    `;

    try {
        const { rows } = await pool.query(primaryQuery, params);
        return res.json(rows);
    } catch (err) {
        // If undefined table/column, attempt a simpler fallback before giving up
        const undefinedTable   = err?.code === '42P01' || /relation .* does not exist/i.test(err?.message || '');
        const undefinedColumn  = err?.code === '42703' || /column .* does not exist/i.test(err?.message || '');
        const joinProblemLikely = undefinedTable || undefinedColumn;

        if (joinProblemLikely) {
            try {
                const { rows } = await pool.query(fallbackQuery, params);
                rows.forEach(r => { if (r.created_by_name === undefined) r.created_by_name = ''; });
                return res.json(rows);
            } catch (fallbackErr) {
                const undefinedTable2  = fallbackErr?.code === '42P01' || /relation .* does not exist/i.test(fallbackErr?.message || '');
                const undefinedColumn2 = fallbackErr?.code === '42703' || /column .* does not exist/i.test(fallbackErr?.message || '');
                if (undefinedTable2 || undefinedColumn2) {
                    try {
                        const { rows } = await pool.query(minimalQuery, params);
                        rows.forEach(r => { if (r.created_by_name === undefined) r.created_by_name = ''; });
                        return res.json(rows);
                    } catch (minimalErr) {
                        console.warn('[payment-batches] Minimal fallback failed:', minimalErr.code || 'no-code', '-', minimalErr.message);
                    }
                } else {
                    console.warn('[payment-batches] Fallback query failed:', fallbackErr.code || 'no-code', '-', fallbackErr.message);
                }
            }
        }

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

    const primary = `
        SELECT pb.*,
               e.name AS entity_name,
               f.name AS fund_name,
               COALESCE(NULLIF(TRIM(COALESCE(u.first_name,'') || ' ' || COALESCE(u.last_name,'')), ''), u.username, '') AS created_by_name
          FROM payment_batches pb
     LEFT JOIN entities e ON pb.entity_id = e.id
     LEFT JOIN funds    f ON pb.fund_id = f.id
     LEFT JOIN users    u ON u.id = pb.created_by
         WHERE pb.id = $1
    `;
    const fallback = `
        SELECT pb.*,
               e.name AS entity_name
          FROM payment_batches pb
     LEFT JOIN entities e ON pb.entity_id = e.id
         WHERE pb.id = $1
    `;

    const minimal = `
        SELECT pb.*
          FROM payment_batches pb
         WHERE pb.id = $1
    `;

    let batchRow;
    try {
        const r = await pool.query(primary, [id]);
        batchRow = r.rows[0];
    } catch (err) {
        const undefinedTable  = err?.code === '42P01' || /relation .* does not exist/i.test(err?.message || '');
        const undefinedColumn = err?.code === '42703' || /column .* does not exist/i.test(err?.message || '');
        if (undefinedTable || undefinedColumn) {
            try {
                const r = await pool.query(fallback, [id]);
                batchRow = r.rows[0];
                if (batchRow && batchRow.created_by_name === undefined) batchRow.created_by_name = '';
            } catch (fallbackErr) {
                const undefinedTable2  = fallbackErr?.code === '42P01' || /relation .* does not exist/i.test(fallbackErr?.message || '');
                const undefinedColumn2 = fallbackErr?.code === '42703' || /column .* does not exist/i.test(fallbackErr?.message || '');
                if (undefinedTable2 || undefinedColumn2) {
                    const r2 = await pool.query(minimal, [id]);
                    batchRow = r2.rows[0];
                    if (batchRow && batchRow.created_by_name === undefined) batchRow.created_by_name = '';
                } else {
                    throw fallbackErr;
                }
            }
        } else {
            throw err;
        }
    }

    if (!batchRow) {
        return res.status(404).json({ error: 'Payment batch not found' });
    }

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

    const batch = batchRow;
    batch.items = itemsResult.rows;
    return res.json(batch);
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

    // Prefer including batch bank_name via join to payment_batches
    const baseWithBatch = `
        SELECT pi.*,
               v.name AS vendor_name,
               v.bank_account_number,
               v.bank_account_type,
               pb.bank_name AS bank_name
          FROM payment_items pi
     LEFT JOIN vendors v ON pi.vendor_id = v.id
     LEFT JOIN payment_batches pb ON pb.id = pi.payment_batch_id
         WHERE pi.payment_batch_id = $1
    `;

    // Fallback without referencing payment_batches (for older schemas)
    const baseNoBatch = `
        SELECT pi.*,
               v.name AS vendor_name,
               v.bank_account_number,
               v.bank_account_type
          FROM payment_items pi
     LEFT JOIN vendors v ON pi.vendor_id = v.id
         WHERE pi.payment_batch_id = $1
    `;

    const orderByRef_withBatch   = `${baseWithBatch} ORDER BY pi.reference ASC, pi.created_at`;
    const orderByDate_withBatch  = `${baseWithBatch} ORDER BY pi.created_at`;
    const orderByDate_noBatch    = `${baseNoBatch} ORDER BY pi.created_at`;

    try {
        const { rows } = await pool.query(orderByRef_withBatch, [id]);
        return res.json(rows);
    } catch (err) {
        const undefinedColumn = err?.code === '42703' || /column .* does not exist/i.test(err?.message || '');
        if (!undefinedColumn) throw err;
        // Retry with created_at ordering (covers missing reference column)
        try {
            const { rows } = await pool.query(orderByDate_withBatch, [id]);
            return res.json(rows);
        } catch (err2) {
            const undefinedColumn2 = err2?.code === '42703' || /column .* does not exist/i.test(err2?.message || '');
            if (!undefinedColumn2) throw err2;
            // Final fallback: no payment_batches join
            const { rows } = await pool.query(orderByDate_noBatch, [id]);
            return res.json(rows);
        }
    }
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
