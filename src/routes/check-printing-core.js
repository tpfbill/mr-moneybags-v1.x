// src/routes/check-printing-core.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * Converts a number to words for check printing
 * @param {number} amount - The amount to convert
 * @returns {string} The amount in words
 */
function numberToWords(amount) {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 
                 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 
                 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    
    const formatDollars = (num) => {
        if (num === 0) return 'zero';
        if (num < 20) return ones[num];
        if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 !== 0 ? '-' + ones[num % 10] : '');
        if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 !== 0 ? ' ' + formatDollars(num % 100) : '');
        if (num < 1000000) return formatDollars(Math.floor(num / 1000)) + ' thousand' + (num % 1000 !== 0 ? ' ' + formatDollars(num % 1000) : '');
        return formatDollars(Math.floor(num / 1000000)) + ' million' + (num % 1000000 !== 0 ? ' ' + formatDollars(num % 1000000) : '');
    };
    
    // Split amount into dollars and cents
    const dollars = Math.floor(amount);
    const cents = Math.round((amount - dollars) * 100);
    
    // Format the result
    let result = formatDollars(dollars);
    result = result.charAt(0).toUpperCase() + result.slice(1);
    
    // Add cents
    if (cents > 0) {
        result += ` and ${cents}/100`;
    } else {
        result += ' and 00/100';
    }
    
    return result;
}

// ========================================================
// Check Management Routes
// ========================================================

/**
 * GET /api/checks
 * Returns all checks with optional filtering and pagination
 */
router.get('/', asyncHandler(async (req, res) => {
    const { 
        status, 
        bank_account_id, 
        start_date, 
        end_date,
        payee,
        vendor_id,
        min_amount,
        max_amount,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT c.*, ba.account_name, ba.bank_name,
               CONCAT(u1.first_name, ' ', u1.last_name) as created_by_name,
               CONCAT(u2.first_name, ' ', u2.last_name) as printed_by_name,
               CONCAT(u3.first_name, ' ', u3.last_name) as voided_by_name,
               CONCAT(u4.first_name, ' ', u4.last_name) as cleared_by_name,
               v.name as vendor_name
        FROM printed_checks c
        LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
        LEFT JOIN users u1 ON c.created_by = u1.id
        LEFT JOIN users u2 ON c.printed_by = u2.id
        LEFT JOIN users u3 ON c.voided_by = u3.id
        LEFT JOIN users u4 ON c.cleared_by = u4.id
        LEFT JOIN vendors v ON c.vendor_id = v.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND c.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (bank_account_id) {
        query += ` AND c.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (start_date) {
        query += ` AND c.check_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND c.check_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    if (payee) {
        query += ` AND c.payee_name ILIKE $${paramIndex++}`;
        params.push(`%${payee}%`);
    }
    
    if (vendor_id) {
        query += ` AND c.vendor_id = $${paramIndex++}`;
        params.push(vendor_id);
    }
    
    if (min_amount) {
        query += ` AND c.amount >= $${paramIndex++}`;
        params.push(parseFloat(min_amount));
    }
    
    if (max_amount) {
        query += ` AND c.amount <= $${paramIndex++}`;
        params.push(parseFloat(max_amount));
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY c.check_date DESC, c.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit);
    params.push(offset);
    
    const { rows } = await pool.query(query, params);
    
    res.json({
        data: rows,
        pagination: {
            total,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil(total / limit)
        }
    });
}));

/**
 * POST /api/checks
 * Creates a new check
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        bank_account_id,
        check_number,
        check_date,
        payee_name,
        vendor_id,
        amount,
        memo,
        address_line1,
        address_line2,
        address_city,
        address_state,
        address_zip,
        check_format_id,
        status = 'Draft'
    } = req.body;
    
    // Validate required fields
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account is required' });
    }
    
    if (!check_number) {
        return res.status(400).json({ error: 'Check number is required' });
    }
    
    if (!check_date) {
        return res.status(400).json({ error: 'Check date is required' });
    }
    
    if (!payee_name) {
        return res.status(400).json({ error: 'Payee name is required' });
    }
    
    if (!amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
    }
    
    // Validate status
    const validStatuses = ['Draft', 'Printed', 'Voided', 'Cleared'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(400).json({ error: 'Bank account not found' });
    }
    
    // Validate check number is unique for this bank account
    const checkNumberCheck = await pool.query(
        'SELECT id FROM printed_checks WHERE bank_account_id = $1 AND check_number = $2',
        [bank_account_id, check_number]
    );
    if (checkNumberCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Check number already exists',
            details: `Check number ${check_number} is already in use for this bank account`
        });
    }
    
    // Convert amount to words
    const amount_in_words = numberToWords(parseFloat(amount));
    
    // Insert the check
    const { rows } = await pool.query(`
        INSERT INTO printed_checks (
            bank_account_id,
            check_number,
            check_date,
            payee_name,
            vendor_id,
            amount,
            amount_in_words,
            memo,
            address_line1,
            address_line2,
            address_city,
            address_state,
            address_zip,
            check_format_id,
            status,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *
    `, [
        bank_account_id,
        check_number,
        check_date,
        payee_name,
        vendor_id || null,
        parseFloat(amount),
        amount_in_words,
        memo || null,
        address_line1 || null,
        address_line2 || null,
        address_city || null,
        address_state || null,
        address_zip || null,
        check_format_id || null,
        status,
        req.user?.id
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * GET /api/checks/:id
 * Returns a specific check
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT c.*, ba.account_name, ba.bank_name, ba.account_number, ba.routing_number,
               CONCAT(u1.first_name, ' ', u1.last_name) as created_by_name,
               CONCAT(u2.first_name, ' ', u2.last_name) as printed_by_name,
               CONCAT(u3.first_name, ' ', u3.last_name) as voided_by_name,
               CONCAT(u4.first_name, ' ', u4.last_name) as cleared_by_name,
               v.name as vendor_name,
               cf.format_name as check_format_name
        FROM printed_checks c
        LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
        LEFT JOIN users u1 ON c.created_by = u1.id
        LEFT JOIN users u2 ON c.printed_by = u2.id
        LEFT JOIN users u3 ON c.voided_by = u3.id
        LEFT JOIN users u4 ON c.cleared_by = u4.id
        LEFT JOIN vendors v ON c.vendor_id = v.id
        LEFT JOIN check_formats cf ON c.check_format_id = cf.id
        WHERE c.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * PUT /api/checks/:id
 * Updates a check
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        bank_account_id,
        check_number,
        check_date,
        payee_name,
        vendor_id,
        amount,
        memo,
        address_line1,
        address_line2,
        address_city,
        address_state,
        address_zip,
        check_format_id,
        status
    } = req.body;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Prevent updates to printed, cleared, or voided checks
    const currentStatus = checkCheck.rows[0].status;
    if (currentStatus !== 'Draft' && (status !== currentStatus || bank_account_id || check_number)) {
        return res.status(409).json({ 
            error: `Cannot modify a ${currentStatus.toLowerCase()} check`,
            details: `${currentStatus} checks are finalized and cannot be modified`
        });
    }
    
    // Validate status if provided
    if (status) {
        const validStatuses = ['Draft', 'Printed', 'Voided', 'Cleared'];
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
    
    if (check_number) {
        // Validate check number is unique for this bank account
        const checkNumberCheck = await pool.query(
            'SELECT id FROM printed_checks WHERE bank_account_id = COALESCE($1, bank_account_id) AND check_number = $2 AND id != $3',
            [bank_account_id || null, check_number, id]
        );
        if (checkNumberCheck.rows.length > 0) {
            return res.status(409).json({ 
                error: 'Check number already exists',
                details: `Check number ${check_number} is already in use for this bank account`
            });
        }
        
        updateFields.push(`check_number = $${paramIndex++}`);
        params.push(check_number);
    }
    
    if (check_date) {
        updateFields.push(`check_date = $${paramIndex++}`);
        params.push(check_date);
    }
    
    if (payee_name) {
        updateFields.push(`payee_name = $${paramIndex++}`);
        params.push(payee_name);
    }
    
    if (vendor_id !== undefined) {
        updateFields.push(`vendor_id = $${paramIndex++}`);
        params.push(vendor_id === null ? null : vendor_id);
    }
    
    if (amount) {
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }
        
        const newAmount = parseFloat(amount);
        const amount_in_words = numberToWords(newAmount);
        
        updateFields.push(`amount = $${paramIndex++}`);
        params.push(newAmount);
        
        updateFields.push(`amount_in_words = $${paramIndex++}`);
        params.push(amount_in_words);
    }
    
    if (memo !== undefined) {
        updateFields.push(`memo = $${paramIndex++}`);
        params.push(memo === null ? null : memo);
    }
    
    if (address_line1 !== undefined) {
        updateFields.push(`address_line1 = $${paramIndex++}`);
        params.push(address_line1 === null ? null : address_line1);
    }
    
    if (address_line2 !== undefined) {
        updateFields.push(`address_line2 = $${paramIndex++}`);
        params.push(address_line2 === null ? null : address_line2);
    }
    
    if (address_city !== undefined) {
        updateFields.push(`address_city = $${paramIndex++}`);
        params.push(address_city === null ? null : address_city);
    }
    
    if (address_state !== undefined) {
        updateFields.push(`address_state = $${paramIndex++}`);
        params.push(address_state === null ? null : address_state);
    }
    
    if (address_zip !== undefined) {
        updateFields.push(`address_zip = $${paramIndex++}`);
        params.push(address_zip === null ? null : address_zip);
    }
    
    if (check_format_id !== undefined) {
        updateFields.push(`check_format_id = $${paramIndex++}`);
        params.push(check_format_id === null ? null : check_format_id);
    }
    
    if (status) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
        
        // If status is Printed, set printed_date and printed_by
        if (status === 'Printed' && currentStatus !== 'Printed') {
            updateFields.push(`printed_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`printed_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
        
        // If status is Voided, set voided_date and voided_by
        if (status === 'Voided' && currentStatus !== 'Voided') {
            updateFields.push(`voided_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`voided_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
        
        // If status is Cleared, set cleared_date and cleared_by
        if (status === 'Cleared' && currentStatus !== 'Cleared') {
            updateFields.push(`cleared_date = $${paramIndex++}`);
            params.push(new Date());
            
            updateFields.push(`cleared_by = $${paramIndex++}`);
            params.push(req.user?.id);
        }
    }
    
    // Add updated_at
    updateFields.push(`updated_at = NOW()`);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/checks/:id
 * Deletes a check
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if check exists and get status
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Prevent deletion of printed, cleared, or voided checks
    const status = checkCheck.rows[0].status;
    if (status !== 'Draft') {
        return res.status(409).json({ 
            error: `Cannot delete a ${status.toLowerCase()} check`,
            details: `${status} checks cannot be deleted. You may void the check instead.`
        });
    }
    
    // Delete the check
    await pool.query('DELETE FROM printed_checks WHERE id = $1', [id]);
    
    res.status(204).send();
}));

module.exports = router;
