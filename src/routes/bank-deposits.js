// src/routes/bank-deposits.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/bank-deposits
 * Returns all bank deposits with optional filtering
 */
router.get('/', asyncHandler(async (req, res) => {
    const { 
        status, 
        bank_account_id, 
        start_date, 
        end_date,
        deposit_type,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT d.*, ba.account_name, ba.bank_name,
               CONCAT(u.first_name, ' ', u.last_name) as created_by_name
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u ON d.created_by = u.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND d.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (bank_account_id) {
        query += ` AND d.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (start_date) {
        query += ` AND d.deposit_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND d.deposit_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    if (deposit_type) {
        query += ` AND d.deposit_type = $${paramIndex++}`;
        params.push(deposit_type);
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY d.deposit_date DESC, d.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit);
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    // Get deposit totals
    const depositIds = rows.map(row => row.id);
    let itemTotals = {};
    
    if (depositIds.length > 0) {
        const itemQuery = await pool.query(`
            SELECT deposit_id, SUM(amount) as total_amount, COUNT(*) as item_count
            FROM bank_deposit_items
            WHERE deposit_id = ANY($1)
            GROUP BY deposit_id
        `, [depositIds]);
        
        itemTotals = itemQuery.rows.reduce((acc, row) => {
            acc[row.deposit_id] = {
                total_amount: parseFloat(row.total_amount),
                item_count: parseInt(row.item_count)
            };
            return acc;
        }, {});
    }
    
    // Add totals to deposit objects
    const depositsWithTotals = rows.map(deposit => ({
        ...deposit,
        total_amount: itemTotals[deposit.id]?.total_amount || 0,
        item_count: itemTotals[deposit.id]?.item_count || 0
    }));
    
    res.json({
        data: depositsWithTotals,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit)
        }
    });
}));

/**
 * POST /api/bank-deposits
 * Creates a new bank deposit
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number,
        description,
        memo,
        status = 'Draft'
    } = req.body;
    
    // Validate required fields
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account is required' });
    }
    
    if (!deposit_date) {
        return res.status(400).json({ error: 'Deposit date is required' });
    }
    
    if (!deposit_type) {
        return res.status(400).json({ error: 'Deposit type is required' });
    }
    
    // Validate status
    const validStatuses = ['Draft', 'Submitted', 'Cleared', 'Rejected'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Bank account not found' });
    }
    
    const { rows } = await pool.query(`
        INSERT INTO bank_deposits (
            bank_account_id,
            deposit_date,
            deposit_type,
            reference_number,
            description,
            memo,
            status,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number || null,
        description || null,
        memo || null,
        status,
        req.user?.id
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * GET /api/bank-deposits/:id
 * Returns a specific bank deposit with its items
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get deposit details
    const depositQuery = await pool.query(`
        SELECT d.*, ba.account_name, ba.bank_name,
               CONCAT(u1.first_name, ' ', u1.last_name) as created_by_name,
               CONCAT(u2.first_name, ' ', u2.last_name) as updated_by_name
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u1 ON d.created_by = u1.id
        LEFT JOIN users u2 ON d.updated_by = u2.id
        WHERE d.id = $1
    `, [id]);
    
    if (depositQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositQuery.rows[0];
    
    // Get deposit items
    const itemsQuery = await pool.query(`
        SELECT di.*, a.name as account_name, a.code as account_code
        FROM bank_deposit_items di
        LEFT JOIN accounts a ON di.gl_account_id = a.id
        WHERE di.deposit_id = $1
        ORDER BY di.created_at
    `, [id]);
    
    // Calculate totals
    const totalAmount = itemsQuery.rows.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    // Combine all data
    const result = {
        ...deposit,
        items: itemsQuery.rows,
        total_amount: totalAmount,
        item_count: itemsQuery.rows.length
    };
    
    res.json(result);
}));

/**
 * PUT /api/bank-deposits/:id
 * Updates a bank deposit
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        bank_account_id,
        deposit_date,
        deposit_type,
        reference_number,
        description,
        memo,
        status
    } = req.body;
    
    // Check if deposit exists
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent updates to cleared deposits
    const currentStatus = depositCheck.rows[0].status;
    if (currentStatus === 'Cleared' && status !== 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot modify a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Validate status if provided
    if (status) {
        const validStatuses = ['Draft', 'Submitted', 'Cleared', 'Rejected'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
    }
    
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (bank_account_id) {
        // Validate bank account exists
        const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
        if (bankAccountCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Bank account not found' });
        }
        
        updateFields.push(`bank_account_id = $${paramIndex++}`);
        params.push(bank_account_id);
    }
    
    if (deposit_date) {
        updateFields.push(`deposit_date = $${paramIndex++}`);
        params.push(deposit_date);
    }
    
    if (deposit_type) {
        updateFields.push(`deposit_type = $${paramIndex++}`);
        params.push(deposit_type);
    }
    
    if (reference_number !== undefined) {
        updateFields.push(`reference_number = $${paramIndex++}`);
        params.push(reference_number);
    }
    
    if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(description);
    }
    
    if (memo !== undefined) {
        updateFields.push(`memo = $${paramIndex++}`);
        params.push(memo);
    }
    
    if (status) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
        
        // If status is Cleared, set cleared_date and cleared_by
        if (status === 'Cleared') {
            updateFields.push(`cleared_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`cleared_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
        
        // If status is Submitted, set submitted_date and submitted_by
        if (status === 'Submitted') {
            updateFields.push(`submitted_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`submitted_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
    }
    
    // Add updated_at and updated_by
    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex++}`);
    params.push(req.user?.id);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-deposits/:id
 * Deletes a bank deposit
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists and get status
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent deletion of submitted or cleared deposits
    const status = depositCheck.rows[0].status;
    if (status === 'Submitted' || status === 'Cleared') {
        return res.status(409).json({ 
            error: `Cannot delete a ${status.toLowerCase()} deposit`,
            details: `${status} deposits cannot be deleted. You may reject the deposit instead.`
        });
    }
    
    // Start a transaction to delete deposit and its items
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete deposit items first (foreign key constraint)
        await client.query('DELETE FROM bank_deposit_items WHERE deposit_id = $1', [id]);
        
        // Delete the deposit
        await client.query('DELETE FROM bank_deposits WHERE id = $1', [id]);
        
        await client.query('COMMIT');
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * GET /api/bank-deposits/:id/items
 * Returns items for a specific bank deposit
 */
router.get('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists
    const depositCheck = await pool.query('SELECT id FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Get deposit items with account information
    const { rows } = await pool.query(`
        SELECT di.*, a.name as account_name, a.code as account_code
        FROM bank_deposit_items di
        LEFT JOIN accounts a ON di.gl_account_id = a.id
        WHERE di.deposit_id = $1
        ORDER BY di.created_at
    `, [id]);
    
    // Calculate total
    const total = rows.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
    
    res.json({
        items: rows,
        total_amount: total,
        count: rows.length
    });
}));

/**
 * POST /api/bank-deposits/:id/items
 * Adds items to a bank deposit
 */
router.post('/:id/items', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const items = Array.isArray(req.body) ? req.body : [req.body];
    
    // Check if deposit exists and get status
    const depositCheck = await pool.query('SELECT status FROM bank_deposits WHERE id = $1', [id]);
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    // Prevent adding items to cleared deposits
    const status = depositCheck.rows[0].status;
    if (status === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot add items to a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Validate items
    if (items.length === 0) {
        return res.status(400).json({ error: 'At least one item is required' });
    }
    
    // Start a transaction to add all items
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const insertedItems = [];
        
        for (const item of items) {
            // Validate required fields
            if (!item.item_type) {
                throw new Error('Item type is required for all items');
            }
            
            if (!item.amount || parseFloat(item.amount) <= 0) {
                throw new Error('Valid amount is required for all items');
            }
            
            if (item.item_type === 'Check' && !item.check_number) {
                throw new Error('Check number is required for check items');
            }
            
            if (!item.gl_account_id) {
                throw new Error('GL account is required for all items');
            }
            
            // Validate GL account exists
            const accountCheck = await client.query('SELECT id FROM accounts WHERE id = $1', [item.gl_account_id]);
            if (accountCheck.rows.length === 0) {
                throw new Error(`GL account ${item.gl_account_id} not found`);
            }
            
            // Insert the item
            const { rows } = await client.query(`
                INSERT INTO bank_deposit_items (
                    deposit_id,
                    item_type,
                    amount,
                    check_number,
                    check_date,
                    payer_name,
                    description,
                    gl_account_id,
                    created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *
            `, [
                id,
                item.item_type,
                parseFloat(item.amount),
                item.check_number || null,
                item.check_date || null,
                item.payer_name || null,
                item.description || null,
                item.gl_account_id,
                req.user?.id
            ]);
            
            insertedItems.push(rows[0]);
        }
        
        // Update deposit's updated_at and updated_by
        await client.query(`
            UPDATE bank_deposits
            SET updated_at = NOW(), updated_by = $1
            WHERE id = $2
        `, [req.user?.id, id]);
        
        await client.query('COMMIT');
        
        res.status(201).json(insertedItems);
    } catch (error) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: error.message });
    } finally {
        client.release();
    }
}));

/**
 * PUT /api/bank-deposits/items/:id
 * Updates a deposit item
 */
router.put('/items/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        item_type,
        amount,
        check_number,
        check_date,
        payer_name,
        description,
        gl_account_id
    } = req.body;
    
    // Check if item exists and get deposit info
    const itemCheck = await pool.query(`
        SELECT di.*, bd.status as deposit_status
        FROM bank_deposit_items di
        JOIN bank_deposits bd ON di.deposit_id = bd.id
        WHERE di.id = $1
    `, [id]);
    
    if (itemCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit item not found' });
    }
    
    // Prevent updates to items in cleared deposits
    const depositStatus = itemCheck.rows[0].deposit_status;
    if (depositStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot update items in a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (item_type) {
        updateFields.push(`item_type = $${paramIndex++}`);
        params.push(item_type);
    }
    
    if (amount !== undefined) {
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }
        updateFields.push(`amount = $${paramIndex++}`);
        params.push(parseFloat(amount));
    }
    
    if (check_number !== undefined) {
        updateFields.push(`check_number = $${paramIndex++}`);
        params.push(check_number);
    }
    
    if (check_date !== undefined) {
        updateFields.push(`check_date = $${paramIndex++}`);
        params.push(check_date);
    }
    
    if (payer_name !== undefined) {
        updateFields.push(`payer_name = $${paramIndex++}`);
        params.push(payer_name);
    }
    
    if (description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        params.push(description);
    }
    
    if (gl_account_id) {
        // Validate GL account exists
        const accountCheck = await pool.query('SELECT id FROM accounts WHERE id = $1', [gl_account_id]);
        if (accountCheck.rows.length === 0) {
            return res.status(400).json({ error: 'GL account not found' });
        }
        
        updateFields.push(`gl_account_id = $${paramIndex++}`);
        params.push(gl_account_id);
    }
    
    // Add updated_at
    updateFields.push(`updated_at = NOW()`);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE bank_deposit_items
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    // Update deposit's updated_at and updated_by
    await pool.query(`
        UPDATE bank_deposits
        SET updated_at = NOW(), updated_by = $1
        WHERE id = $2
    `, [req.user?.id, itemCheck.rows[0].deposit_id]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-deposits/items/:id
 * Removes a deposit item
 */
router.delete('/items/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if item exists and get deposit info
    const itemCheck = await pool.query(`
        SELECT di.deposit_id, bd.status as deposit_status
        FROM bank_deposit_items di
        JOIN bank_deposits bd ON di.deposit_id = bd.id
        WHERE di.id = $1
    `, [id]);
    
    if (itemCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit item not found' });
    }
    
    // Prevent deletion of items in cleared deposits
    const depositStatus = itemCheck.rows[0].deposit_status;
    if (depositStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot remove items from a cleared deposit',
            details: 'Cleared deposits are finalized and cannot be modified'
        });
    }
    
    // Delete the item
    await pool.query('DELETE FROM bank_deposit_items WHERE id = $1', [id]);
    
    // Update deposit's updated_at and updated_by
    await pool.query(`
        UPDATE bank_deposits
        SET updated_at = NOW(), updated_by = $1
        WHERE id = $2
    `, [req.user?.id, itemCheck.rows[0].deposit_id]);
    
    res.status(204).send();
}));

/**
 * POST /api/bank-deposits/:id/submit
 * Submit a deposit to the bank
 */
router.post('/:id/submit', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if deposit exists
    const depositCheck = await pool.query(`
        SELECT d.*, COUNT(di.id) as item_count, SUM(di.amount) as total_amount
        FROM bank_deposits d
        LEFT JOIN bank_deposit_items di ON d.id = di.deposit_id
        WHERE d.id = $1
        GROUP BY d.id
    `, [id]);
    
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositCheck.rows[0];
    
    // Validate deposit status
    if (deposit.status !== 'Draft') {
        return res.status(409).json({ 
            error: `Deposit is already ${deposit.status.toLowerCase()}`,
            details: `Only deposits in Draft status can be submitted`
        });
    }
    
    // Validate deposit has items
    if (parseInt(deposit.item_count) === 0) {
        return res.status(400).json({ 
            error: 'Cannot submit empty deposit',
            details: 'Deposit must have at least one item to submit'
        });
    }
    
    // Update deposit status to Submitted
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET 
            status = 'Submitted',
            submitted_date = NOW(),
            submitted_by = $1,
            updated_at = NOW(),
            updated_by = $1
        WHERE id = $2
        RETURNING *
    `, [req.user?.id, id]);
    
    // Return updated deposit with totals
    const result = {
        ...rows[0],
        item_count: parseInt(deposit.item_count),
        total_amount: parseFloat(deposit.total_amount)
    };
    
    res.json(result);
}));

/**
 * POST /api/bank-deposits/:id/clear
 * Mark a deposit as cleared
 */
router.post('/:id/clear', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { clearing_date, clearing_reference } = req.body;
    
    // Check if deposit exists
    const depositCheck = await pool.query(`
        SELECT d.*, COUNT(di.id) as item_count, SUM(di.amount) as total_amount
        FROM bank_deposits d
        LEFT JOIN bank_deposit_items di ON d.id = di.deposit_id
        WHERE d.id = $1
        GROUP BY d.id
    `, [id]);
    
    if (depositCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositCheck.rows[0];
    
    // Validate deposit status
    if (deposit.status !== 'Submitted') {
        return res.status(409).json({ 
            error: `Deposit must be submitted before clearing`,
            details: `Only deposits in Submitted status can be cleared. Current status: ${deposit.status}`
        });
    }
    
    // Update deposit status to Cleared
    const { rows } = await pool.query(`
        UPDATE bank_deposits
        SET 
            status = 'Cleared',
            cleared_date = $1,
            clearing_reference = $2,
            cleared_by = $3,
            updated_at = NOW(),
            updated_by = $3
        WHERE id = $4
        RETURNING *
    `, [
        clearing_date || new Date(),
        clearing_reference || null,
        req.user?.id,
        id
    ]);
    
    // Return updated deposit with totals
    const result = {
        ...rows[0],
        item_count: parseInt(deposit.item_count),
        total_amount: parseFloat(deposit.total_amount)
    };
    
    res.json(result);
}));

/**
 * GET /api/bank-deposits/slip/:id
 * Generate deposit slip data for a specific deposit
 */
router.get('/slip/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get deposit with bank account and items
    const depositQuery = await pool.query(`
        SELECT d.*, ba.account_name, ba.bank_name, ba.account_number, ba.routing_number,
               CONCAT(u.first_name, ' ', u.last_name) as prepared_by
        FROM bank_deposits d
        LEFT JOIN bank_accounts ba ON d.bank_account_id = ba.id
        LEFT JOIN users u ON d.created_by = u.id
        WHERE d.id = $1
    `, [id]);
    
    if (depositQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Deposit not found' });
    }
    
    const deposit = depositQuery.rows[0];
    
    // Get deposit items grouped by type
    const itemsQuery = await pool.query(`
        SELECT 
            item_type,
            COUNT(*) as count,
            SUM(amount) as total
        FROM bank_deposit_items
        WHERE deposit_id = $1
        GROUP BY item_type
    `, [id]);
    
    // Get individual checks
    const checksQuery = await pool.query(`
        SELECT *
        FROM bank_deposit_items
        WHERE deposit_id = $1 AND item_type = 'Check'
        ORDER BY amount DESC
    `, [id]);
    
    // Calculate totals
    const totalAmount = itemsQuery.rows.reduce((sum, group) => sum + parseFloat(group.total || 0), 0);
    
    // Format deposit slip data
    const depositSlip = {
        deposit: {
            ...deposit,
            deposit_date_formatted: new Date(deposit.deposit_date).toLocaleDateString()
        },
        summary: {
            total_amount: totalAmount,
            item_groups: itemsQuery.rows
        },
        checks: checksQuery.rows,
        currency: {
            cash: itemsQuery.rows.find(g => g.item_type === 'Cash')?.total || 0,
            checks: itemsQuery.rows.find(g => g.item_type === 'Check')?.total || 0,
            electronic: itemsQuery.rows.find(g => g.item_type === 'Electronic')?.total || 0
        }
    };
    
    res.json(depositSlip);
}));

/**
 * GET /api/bank-deposits/types
 * Returns available deposit types
 */
router.get('/types', asyncHandler(async (req, res) => {
    // Return predefined deposit types
    const depositTypes = [
        { id: 'Regular', name: 'Regular Deposit' },
        { id: 'ATM', name: 'ATM Deposit' },
        { id: 'Mobile', name: 'Mobile Deposit' },
        { id: 'Wire', name: 'Wire Transfer' },
        { id: 'ACH', name: 'ACH Transfer' },
        { id: 'Cash', name: 'Cash Deposit' },
        { id: 'Mixed', name: 'Mixed Deposit' }
    ];
    
    res.json(depositTypes);
}));

/**
 * GET /api/bank-deposits/item-types
 * Returns available deposit item types
 */
router.get('/item-types', asyncHandler(async (req, res) => {
    // Return predefined deposit item types
    const itemTypes = [
        { id: 'Cash', name: 'Cash' },
        { id: 'Check', name: 'Check' },
        { id: 'Electronic', name: 'Electronic Transfer' },
        { id: 'Money Order', name: 'Money Order' },
        { id: 'Cashier Check', name: 'Cashier\'s Check' },
        { id: 'Other', name: 'Other' }
    ];
    
    res.json(itemTypes);
}));

module.exports = router;
