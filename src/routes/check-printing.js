// src/routes/check-printing.js
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
    query += ` ORDER BY c.check_date DESC, c.check_number DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
        amount,
        memo,
        vendor_id,
        journal_entry_id,
        payment_batch_id,
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
    
    // Check if check number is already used for this bank account
    const checkNumberCheck = await pool.query(
        'SELECT id FROM printed_checks WHERE bank_account_id = $1 AND check_number = $2',
        [bank_account_id, check_number]
    );
    
    if (checkNumberCheck.rows.length > 0) {
        return res.status(400).json({ 
            error: 'Check number already used',
            details: `Check number ${check_number} is already used for this bank account`
        });
    }
    
    // Get default check format if not provided
    let formatId = check_format_id;
    if (!formatId) {
        const formatCheck = await pool.query('SELECT id FROM check_formats WHERE is_default = TRUE LIMIT 1');
        if (formatCheck.rows.length > 0) {
            formatId = formatCheck.rows[0].id;
        }
    }
    
    // Convert amount to words
    const amountWords = numberToWords(parseFloat(amount));
    
    // Create the check
    const { rows } = await pool.query(`
        INSERT INTO printed_checks (
            bank_account_id,
            check_number,
            check_date,
            payee_name,
            amount,
            amount_words,
            memo,
            status,
            vendor_id,
            journal_entry_id,
            payment_batch_id,
            check_format_id,
            created_by,
            updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
    `, [
        bank_account_id,
        check_number,
        check_date,
        payee_name,
        parseFloat(amount),
        amountWords,
        memo || null,
        status,
        vendor_id || null,
        journal_entry_id || null,
        payment_batch_id || null,
        formatId || null,
        req.user?.id,
        req.user?.id
    ]);
    
    res.status(201).json(rows[0]);
}));

// ========================================================
// Check Formats Routes
// ========================================================

/**
 * GET /api/check-formats
 * Returns all check formats
 */
router.get('/check-formats', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT * FROM check_formats
        ORDER BY is_default DESC, format_name ASC
    `);
    
    res.json(rows);
}));

/**
 * POST /api/check-formats
 * Creates a new check format
 */
router.post('/formats', asyncHandler(async (req, res) => {
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
router.put('/formats/:id', asyncHandler(async (req, res) => {
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
 * POST /api/check-formats/:id/set-default
 * Sets a check format as the default
 */
router.post('/formats/:id/set-default', asyncHandler(async (req, res) => {
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

/**
 * GET /api/checks/next-number/:bankAccountId
 * Get next available check number for a bank account
 */
router.get('/next-number/:bankAccountId', asyncHandler(async (req, res) => {
    const { bankAccountId } = req.params;
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bankAccountId]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    // Get highest check number for the bank account
    const { rows } = await pool.query(`
        SELECT MAX(CAST(check_number AS INTEGER)) as max_number
        FROM printed_checks
        WHERE bank_account_id = $1
        AND check_number ~ '^[0-9]+$'
    `, [bankAccountId]);
    
    let nextNumber = 10001; // Default starting number
    
    if (rows[0].max_number) {
        nextNumber = parseInt(rows[0].max_number) + 1;
    }
    
    res.json({ next_number: nextNumber.toString() });
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
        amount,
        memo,
        vendor_id,
        journal_entry_id,
        payment_batch_id,
        check_format_id
    } = req.body;
    
    // Check if check exists and get status
    const checkCheck = await pool.query('SELECT status, bank_account_id FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Prevent updates to non-draft checks
    const currentStatus = checkCheck.rows[0].status;
    if (currentStatus !== 'Draft') {
        return res.status(409).json({ 
            error: `Cannot modify a ${currentStatus.toLowerCase()} check`,
            details: `Only checks in Draft status can be modified`
        });
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
        // Check if check number is already used for this bank account
        const currentBankAccountId = bank_account_id || checkCheck.rows[0].bank_account_id;
        
        const checkNumberCheck = await pool.query(
            'SELECT id FROM printed_checks WHERE bank_account_id = $1 AND check_number = $2 AND id != $3',
            [currentBankAccountId, check_number, id]
        );
        
        if (checkNumberCheck.rows.length > 0) {
            return res.status(400).json({ 
                error: 'Check number already used',
                details: `Check number ${check_number} is already used for this bank account`
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
    
    if (amount !== undefined) {
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ error: 'Amount must be greater than zero' });
        }
        
        // Convert amount to words
        const amountWords = numberToWords(parseFloat(amount));
        
        updateFields.push(`amount = $${paramIndex++}`);
        params.push(parseFloat(amount));
        
        updateFields.push(`amount_words = $${paramIndex++}`);
        params.push(amountWords);
    }
    
    if (memo !== undefined) {
        updateFields.push(`memo = $${paramIndex++}`);
        params.push(memo);
    }
    
    if (vendor_id !== undefined) {
        updateFields.push(`vendor_id = $${paramIndex++}`);
        params.push(vendor_id || null);
    }
    
    if (journal_entry_id !== undefined) {
        updateFields.push(`journal_entry_id = $${paramIndex++}`);
        params.push(journal_entry_id || null);
    }
    
    if (payment_batch_id !== undefined) {
        updateFields.push(`payment_batch_id = $${paramIndex++}`);
        params.push(payment_batch_id || null);
    }
    
    if (check_format_id !== undefined) {
        updateFields.push(`check_format_id = $${paramIndex++}`);
        params.push(check_format_id || null);
    }
    
    // Add updated_at and updated_by
    updateFields.push(`updated_at = NOW()`);
    updateFields.push(`updated_by = $${paramIndex++}`);
    params.push(req.user?.id);
    
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
    
    // Prevent deletion of non-draft checks
    const status = checkCheck.rows[0].status;
    if (status !== 'Draft') {
        return res.status(409).json({ 
            error: `Cannot delete a ${status.toLowerCase()} check`,
            details: `Only checks in Draft status can be deleted. Consider voiding the check instead.`
        });
    }
    
    // Delete the check
    await pool.query('DELETE FROM printed_checks WHERE id = $1', [id]);
    
    res.status(204).send();
}));

// ========================================================
// Check Workflow Routes
// ========================================================

/**
 * POST /api/checks/:id/print
 * Mark check as printed
 */
router.post('/:id/print', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status, print_count FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate check status
    const status = checkCheck.rows[0].status;
    if (status !== 'Draft' && status !== 'Printed') {
        return res.status(409).json({ 
            error: `Cannot print a ${status.toLowerCase()} check`,
            details: `Only checks in Draft or Printed status can be printed`
        });
    }
    
    // Update check status and print information
    const currentPrintCount = checkCheck.rows[0].print_count || 0;
    
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Printed',
            printed_date = NOW(),
            printed_by = $1,
            print_count = $2,
            updated_at = NOW(),
            updated_by = $1
        WHERE id = $3
        RETURNING *
    `, [req.user?.id, currentPrintCount + 1, id]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/checks/:id/void
 * Void a printed check
 */
router.post('/:id/void', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { void_reason } = req.body;
    
    if (!void_reason) {
        return res.status(400).json({ error: 'Void reason is required' });
    }
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate check status
    const status = checkCheck.rows[0].status;
    if (status === 'Voided') {
        return res.status(409).json({ error: 'Check is already voided' });
    }
    
    if (status === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot void a cleared check',
            details: 'Cleared checks cannot be voided as they have already been processed by the bank'
        });
    }
    
    // Update check status and void information
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Voided',
            voided_date = NOW(),
            voided_by = $1,
            void_reason = $2,
            updated_at = NOW(),
            updated_by = $1
        WHERE id = $3
        RETURNING *
    `, [req.user?.id, void_reason, id]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/checks/:id/clear
 * Mark check as cleared
 */
router.post('/:id/clear', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { cleared_date } = req.body;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate check status
    const status = checkCheck.rows[0].status;
    if (status === 'Draft') {
        return res.status(409).json({ 
            error: 'Cannot clear a draft check',
            details: 'Check must be printed before it can be cleared'
        });
    }
    
    if (status === 'Voided') {
        return res.status(409).json({ 
            error: 'Cannot clear a voided check',
            details: 'Voided checks cannot be cleared'
        });
    }
    
    if (status === 'Cleared') {
        return res.status(409).json({ error: 'Check is already cleared' });
    }
    
    // Update check status and clearing information
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Cleared',
            cleared_date = $1,
            cleared_by = $2,
            updated_at = NOW(),
            updated_by = $2
        WHERE id = $3
        RETURNING *
    `, [
        cleared_date || new Date(),
        req.user?.id,
        id
    ]);
    
    res.json(rows[0]);
}));

// ========================================================
// Check Number Management Routes
// ========================================================

/**
 * POST /api/checks/validate-number
 * Validate if a check number is available for a bank account
 */
router.post('/validate-number', asyncHandler(async (req, res) => {
    const { bank_account_id, check_number, check_id } = req.body;
    
    if (!bank_account_id || !check_number) {
        return res.status(400).json({ 
            error: 'Bank account ID and check number are required'
        });
    }
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    // Check if number is already used
    let query = `
        SELECT id FROM printed_checks 
        WHERE bank_account_id = $1 AND check_number = $2
    `;
    
    const params = [bank_account_id, check_number];
    
    // If check_id is provided, exclude it from the check
    if (check_id) {
        query += ` AND id != $3`;
        params.push(check_id);
    }
    
    const { rows } = await pool.query(query, params);
    
    const isAvailable = rows.length === 0;
    
    res.json({ 
        is_available: isAvailable,
        message: isAvailable ? 
            'Check number is available' : 
            'Check number is already in use for this bank account'
    });
}));

// ========================================================
// Check Printing Routes
// ========================================================

/**
 * GET /api/checks/:id/print-data
 * Get formatted check data for printing
 */
router.get('/:id/print-data', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get check with format and bank account details
    const { rows } = await pool.query(`
        SELECT c.*, 
               ba.account_name, ba.bank_name, ba.account_number, ba.routing_number,
               cf.*
        FROM printed_checks c
        LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
        LEFT JOIN check_formats cf ON c.check_format_id = cf.id
        WHERE c.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    const check = rows[0];
    
    // If no format is assigned, get the default format
    let format = check;
    
    if (!check.format_name) {
        const formatRows = await pool.query(`
            SELECT * FROM check_formats WHERE is_default = TRUE LIMIT 1
        `);
        
        if (formatRows.rows.length > 0) {
            format = {
                ...check,
                ...formatRows.rows[0]
            };
        }
    }
    
    // Format the check date
    const checkDate = new Date(check.check_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    
    // Format the amount
    const formattedAmount = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(check.amount);
    
    // Prepare print data
    const printData = {
        check: {
            id: check.id,
            check_number: check.check_number,
            check_date: checkDate,
            payee_name: check.payee_name,
            amount: formattedAmount,
            amount_words: check.amount_words,
            memo: check.memo,
            bank_name: check.bank_name,
            account_name: check.account_name,
            account_number: check.account_number,
            routing_number: check.routing_number
        },
        format: {
            format_name: format.format_name,
            check_width: format.check_width,
            check_height: format.check_height,
            positions: {
                payee: { x: format.payee_x, y: format.payee_y },
                date: { x: format.date_x, y: format.date_y },
                amount: { x: format.amount_x, y: format.amount_y },
                amount_words: { x: format.amount_words_x, y: format.amount_words_y },
                memo: { x: format.memo_x, y: format.memo_y },
                signature: { x: format.signature_x, y: format.signature_y }
            },
            font: {
                name: format.font_name,
                size_normal: format.font_size_normal,
                size_amount: format.font_size_amount
            }
        }
    };
    
    res.json(printData);
}));

/**
 * POST /api/checks/batch-print
 * Print multiple checks
 */
router.post('/batch-print', asyncHandler(async (req, res) => {
    const { check_ids } = req.body;
    
    if (!check_ids || !Array.isArray(check_ids) || check_ids.length === 0) {
        return res.status(400).json({ error: 'Check IDs array is required' });
    }
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const results = [];
        
        for (const checkId of check_ids) {
            // Check if check exists and get status
            const checkCheck = await client.query(
                'SELECT id, status, print_count FROM printed_checks WHERE id = $1', 
                [checkId]
            );
            
            if (checkCheck.rows.length === 0) {
                results.push({
                    id: checkId,
                    success: false,
                    message: 'Check not found'
                });
                continue;
            }
            
            // Validate check status
            const status = checkCheck.rows[0].status;
            if (status !== 'Draft' && status !== 'Printed') {
                results.push({
                    id: checkId,
                    success: false,
                    message: `Cannot print a ${status.toLowerCase()} check`
                });
                continue;
            }
            
            // Update check status and print information
            const currentPrintCount = checkCheck.rows[0].print_count || 0;
            
            const updateResult = await client.query(`
                UPDATE printed_checks
                SET 
                    status = 'Printed',
                    printed_date = NOW(),
                    printed_by = $1,
                    print_count = $2,
                    updated_at = NOW(),
                    updated_by = $1
                WHERE id = $3
                RETURNING id, check_number, payee_name, amount
            `, [req.user?.id, currentPrintCount + 1, checkId]);
            
            results.push({
                id: checkId,
                success: true,
                message: 'Check marked as printed',
                check: updateResult.rows[0]
            });
        }
        
        await client.query('COMMIT');
        
        res.json({
            total: check_ids.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results
        });
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

module.exports = router;
