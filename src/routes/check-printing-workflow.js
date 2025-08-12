// src/routes/check-printing-workflow.js
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
// Check Workflow Routes
// ========================================================

/**
 * GET /api/checks/:id/print-data
 * Returns check data formatted for printing
 */
router.get('/:id/print-data', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get check details with bank account and format information
    const { rows } = await pool.query(`
        SELECT c.*, ba.account_name, ba.bank_name, ba.account_number, ba.routing_number,
               CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
               v.name as vendor_name, v.address_line1 as vendor_address_line1,
               v.address_line2 as vendor_address_line2, v.city as vendor_city,
               v.state as vendor_state, v.zip as vendor_zip,
               cf.format_name, cf.format_data
        FROM printed_checks c
        LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
        LEFT JOIN users u ON c.created_by = u.id
        LEFT JOIN vendors v ON c.vendor_id = v.id
        LEFT JOIN check_formats cf ON c.check_format_id = cf.id
        WHERE c.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    const check = rows[0];
    
    // If no check format is specified, get the default format
    let formatData = check.format_data;
    if (!formatData) {
        const defaultFormatQuery = await pool.query(`
            SELECT format_data FROM check_formats WHERE is_default = true LIMIT 1
        `);
        
        if (defaultFormatQuery.rows.length > 0) {
            formatData = defaultFormatQuery.rows[0].format_data;
        } else {
            // Use a basic default format if no formats are defined
            formatData = {
                check_size: { width: 8.5, height: 3.5 },
                date_position: { x: 7, y: 0.5 },
                payee_position: { x: 1.5, y: 1 },
                amount_position: { x: 7, y: 1 },
                amount_words_position: { x: 1.5, y: 1.5 },
                memo_position: { x: 1, y: 2.5 },
                signature_position: { x: 6.5, y: 2.5 }
            };
        }
    }
    
    // Use vendor address if available and no specific address on check
    if (check.vendor_id && !check.address_line1) {
        check.address_line1 = check.vendor_address_line1;
        check.address_line2 = check.vendor_address_line2;
        check.address_city = check.vendor_city;
        check.address_state = check.vendor_state;
        check.address_zip = check.vendor_zip;
    }
    
    // Format the check data for printing
    const printData = {
        check: {
            id: check.id,
            number: check.check_number,
            date: check.check_date,
            payee: check.payee_name,
            amount: parseFloat(check.amount),
            amount_in_words: check.amount_in_words,
            memo: check.memo,
            address: {
                line1: check.address_line1,
                line2: check.address_line2,
                city: check.address_city,
                state: check.address_state,
                zip: check.address_zip
            }
        },
        bank: {
            name: check.bank_name,
            account_name: check.account_name,
            account_number: check.account_number,
            routing_number: check.routing_number
        },
        format: formatData
    };
    
    res.json(printData);
}));

/**
 * POST /api/checks/:id/print
 * Marks a check as printed
 */
router.post('/:id/print', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate current status
    const currentStatus = checkCheck.rows[0].status;
    if (currentStatus !== 'Draft') {
        return res.status(409).json({ 
            error: `Cannot print a ${currentStatus.toLowerCase()} check`,
            details: `Only checks in Draft status can be printed. Current status: ${currentStatus}`
        });
    }
    
    // Update check status to Printed
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Printed',
            printed_date = NOW(),
            printed_by = $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `, [req.user?.id, id]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/checks/:id/void
 * Voids a check
 */
router.post('/:id/void', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { void_reason } = req.body;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate current status
    const currentStatus = checkCheck.rows[0].status;
    if (currentStatus === 'Voided') {
        return res.status(409).json({ 
            error: 'Check is already voided',
            details: 'This check has already been voided'
        });
    }
    
    if (currentStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Cannot void a cleared check',
            details: 'Cleared checks cannot be voided as they have been reconciled'
        });
    }
    
    // Update check status to Voided
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Voided',
            voided_date = NOW(),
            voided_by = $1,
            void_reason = $2,
            updated_at = NOW()
        WHERE id = $3
        RETURNING *
    `, [req.user?.id, void_reason || null, id]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/checks/:id/clear
 * Marks a check as cleared
 */
router.post('/:id/clear', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { clearing_date, clearing_reference } = req.body;
    
    // Check if check exists
    const checkCheck = await pool.query('SELECT status FROM printed_checks WHERE id = $1', [id]);
    if (checkCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Check not found' });
    }
    
    // Validate current status
    const currentStatus = checkCheck.rows[0].status;
    if (currentStatus === 'Cleared') {
        return res.status(409).json({ 
            error: 'Check is already cleared',
            details: 'This check has already been cleared'
        });
    }
    
    if (currentStatus === 'Voided') {
        return res.status(409).json({ 
            error: 'Cannot clear a voided check',
            details: 'Voided checks cannot be cleared'
        });
    }
    
    if (currentStatus === 'Draft') {
        return res.status(409).json({ 
            error: 'Cannot clear a draft check',
            details: 'Checks must be printed before they can be cleared'
        });
    }
    
    // Update check status to Cleared
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Cleared',
            cleared_date = $1,
            cleared_by = $2,
            clearing_reference = $3,
            updated_at = NOW()
        WHERE id = $4
        RETURNING *
    `, [
        clearing_date || new Date(),
        req.user?.id,
        clearing_reference || null,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * POST /api/checks/batch-print
 * Prints multiple checks in a batch
 */
router.post('/batch-print', asyncHandler(async (req, res) => {
    const { check_ids } = req.body;
    
    if (!check_ids || !Array.isArray(check_ids) || check_ids.length === 0) {
        return res.status(400).json({ error: 'No check IDs provided' });
    }
    
    // Validate all checks exist and are in Draft status
    const checksQuery = await pool.query(`
        SELECT id, status FROM printed_checks WHERE id = ANY($1)
    `, [check_ids]);
    
    if (checksQuery.rows.length !== check_ids.length) {
        return res.status(404).json({ error: 'One or more checks not found' });
    }
    
    const nonDraftChecks = checksQuery.rows.filter(check => check.status !== 'Draft');
    if (nonDraftChecks.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot print checks that are not in Draft status',
            details: `${nonDraftChecks.length} checks are not in Draft status`
        });
    }
    
    // Update all checks to Printed status
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Printed',
            printed_date = NOW(),
            printed_by = $1,
            updated_at = NOW()
        WHERE id = ANY($2)
        RETURNING *
    `, [req.user?.id, check_ids]);
    
    res.json({
        success: true,
        message: `${rows.length} checks marked as printed`,
        checks: rows
    });
}));

/**
 * POST /api/checks/batch-void
 * Voids multiple checks in a batch
 */
router.post('/batch-void', asyncHandler(async (req, res) => {
    const { check_ids, void_reason } = req.body;
    
    if (!check_ids || !Array.isArray(check_ids) || check_ids.length === 0) {
        return res.status(400).json({ error: 'No check IDs provided' });
    }
    
    // Validate all checks exist and are not already voided or cleared
    const checksQuery = await pool.query(`
        SELECT id, status FROM printed_checks WHERE id = ANY($1)
    `, [check_ids]);
    
    if (checksQuery.rows.length !== check_ids.length) {
        return res.status(404).json({ error: 'One or more checks not found' });
    }
    
    const invalidChecks = checksQuery.rows.filter(check => 
        check.status === 'Voided' || check.status === 'Cleared'
    );
    
    if (invalidChecks.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot void checks that are already voided or cleared',
            details: `${invalidChecks.length} checks are already voided or cleared`
        });
    }
    
    // Update all checks to Voided status
    const { rows } = await pool.query(`
        UPDATE printed_checks
        SET 
            status = 'Voided',
            voided_date = NOW(),
            voided_by = $1,
            void_reason = $2,
            updated_at = NOW()
        WHERE id = ANY($3)
        RETURNING *
    `, [req.user?.id, void_reason || null, check_ids]);
    
    res.json({
        success: true,
        message: `${rows.length} checks voided`,
        checks: rows
    });
}));

module.exports = router;
