// src/routes/check-printing-validation.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// ========================================================
// Check Number Validation Routes
// ========================================================

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
 * POST /api/checks/validate-number
 * Validate if a check number is available for a bank account
 */
router.post('/validate-number', asyncHandler(async (req, res) => {
    const { bank_account_id, check_number, check_id } = req.body;
    
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account ID is required' });
    }
    
    if (!check_number) {
        return res.status(400).json({ error: 'Check number is required' });
    }
    
    // Validate bank account exists
    const bankAccountCheck = await pool.query('SELECT id FROM bank_accounts WHERE id = $1', [bank_account_id]);
    if (bankAccountCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank account not found' });
    }
    
    // Check if number is already in use
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
        check_number: check_number,
        bank_account_id: bank_account_id
    });
}));

// ========================================================
// Check Utility Routes
// ========================================================

/**
 * GET /api/checks/search
 * Search checks by various criteria
 */
router.get('/search', asyncHandler(async (req, res) => {
    const { 
        term,
        bank_account_id,
        status,
        start_date,
        end_date,
        min_amount,
        max_amount,
        limit = 20
    } = req.query;
    
    if (!term && !bank_account_id && !status && !start_date && !end_date && !min_amount && !max_amount) {
        return res.status(400).json({ error: 'At least one search parameter is required' });
    }
    
    let query = `
        SELECT c.*, ba.account_name, ba.bank_name,
               CONCAT(u1.first_name, ' ', u1.last_name) as created_by_name,
               v.name as vendor_name
        FROM printed_checks c
        LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
        LEFT JOIN users u1 ON c.created_by = u1.id
        LEFT JOIN vendors v ON c.vendor_id = v.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (term) {
        query += ` AND (
            c.check_number ILIKE $${paramIndex} OR
            c.payee_name ILIKE $${paramIndex} OR
            c.memo ILIKE $${paramIndex} OR
            v.name ILIKE $${paramIndex}
        )`;
        params.push(`%${term}%`);
        paramIndex++;
    }
    
    if (bank_account_id) {
        query += ` AND c.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (status) {
        query += ` AND c.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (start_date) {
        query += ` AND c.check_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND c.check_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    if (min_amount) {
        query += ` AND c.amount >= $${paramIndex++}`;
        params.push(parseFloat(min_amount));
    }
    
    if (max_amount) {
        query += ` AND c.amount <= $${paramIndex++}`;
        params.push(parseFloat(max_amount));
    }
    
    query += ` ORDER BY c.check_date DESC, c.check_number DESC LIMIT $${paramIndex++}`;
    params.push(limit);
    
    const { rows } = await pool.query(query, params);
    
    res.json({
        count: rows.length,
        results: rows
    });
}));

/**
 * GET /api/checks/reports
 * Get check reporting data
 */
router.get('/reports', asyncHandler(async (req, res) => {
    const { 
        report_type = 'summary',
        bank_account_id,
        start_date,
        end_date,
        status,
        group_by = 'month'
    } = req.query;
    
    // Validate date range
    if (!start_date || !end_date) {
        return res.status(400).json({ error: 'Start date and end date are required' });
    }
    
    // Validate report type
    const validReportTypes = ['summary', 'detail', 'status', 'vendor'];
    if (!validReportTypes.includes(report_type)) {
        return res.status(400).json({ error: 'Invalid report type' });
    }
    
    // Validate grouping
    const validGroupings = ['day', 'week', 'month', 'quarter', 'year'];
    if (!validGroupings.includes(group_by)) {
        return res.status(400).json({ error: 'Invalid grouping' });
    }
    
    let query;
    const params = [start_date, end_date];
    let paramIndex = 3;
    
    // Add bank account filter if provided
    let bankAccountFilter = '';
    if (bank_account_id) {
        bankAccountFilter = ` AND c.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    // Add status filter if provided
    let statusFilter = '';
    if (status) {
        statusFilter = ` AND c.status = $${paramIndex++}`;
        params.push(status);
    }
    
    // Define time grouping SQL
    let timeGroup;
    switch (group_by) {
        case 'day':
            timeGroup = `DATE_TRUNC('day', c.check_date)`;
            break;
        case 'week':
            timeGroup = `DATE_TRUNC('week', c.check_date)`;
            break;
        case 'month':
            timeGroup = `DATE_TRUNC('month', c.check_date)`;
            break;
        case 'quarter':
            timeGroup = `DATE_TRUNC('quarter', c.check_date)`;
            break;
        case 'year':
            timeGroup = `DATE_TRUNC('year', c.check_date)`;
            break;
        default:
            timeGroup = `DATE_TRUNC('month', c.check_date)`;
    }
    
    // Build query based on report type
    if (report_type === 'summary') {
        query = `
            SELECT 
                ${timeGroup} as period,
                COUNT(*) as check_count,
                SUM(c.amount) as total_amount,
                MIN(c.amount) as min_amount,
                MAX(c.amount) as max_amount,
                AVG(c.amount) as avg_amount
            FROM printed_checks c
            WHERE c.check_date BETWEEN $1 AND $2
            ${bankAccountFilter}
            ${statusFilter}
            GROUP BY period
            ORDER BY period
        `;
    } else if (report_type === 'status') {
        query = `
            SELECT 
                ${timeGroup} as period,
                c.status,
                COUNT(*) as check_count,
                SUM(c.amount) as total_amount
            FROM printed_checks c
            WHERE c.check_date BETWEEN $1 AND $2
            ${bankAccountFilter}
            ${statusFilter}
            GROUP BY period, c.status
            ORDER BY period, c.status
        `;
    } else if (report_type === 'vendor') {
        query = `
            SELECT 
                COALESCE(v.name, c.payee_name) as payee,
                COUNT(*) as check_count,
                SUM(c.amount) as total_amount,
                MIN(c.check_date) as first_check_date,
                MAX(c.check_date) as last_check_date
            FROM printed_checks c
            LEFT JOIN vendors v ON c.vendor_id = v.id
            WHERE c.check_date BETWEEN $1 AND $2
            ${bankAccountFilter}
            ${statusFilter}
            GROUP BY payee
            ORDER BY total_amount DESC
        `;
    } else if (report_type === 'detail') {
        query = `
            SELECT 
                c.*,
                ba.account_name, ba.bank_name,
                CONCAT(u.first_name, ' ', u.last_name) as created_by_name,
                v.name as vendor_name
            FROM printed_checks c
            LEFT JOIN bank_accounts ba ON c.bank_account_id = ba.id
            LEFT JOIN users u ON c.created_by = u.id
            LEFT JOIN vendors v ON c.vendor_id = v.id
            WHERE c.check_date BETWEEN $1 AND $2
            ${bankAccountFilter}
            ${statusFilter}
            ORDER BY c.check_date, c.check_number
        `;
    }
    
    const { rows } = await pool.query(query, params);
    
    // Calculate report summary
    const summary = {
        start_date,
        end_date,
        total_checks: rows.length,
        total_amount: rows.reduce((sum, row) => sum + parseFloat(row.total_amount || row.amount || 0), 0),
        report_type,
        group_by
    };
    
    if (bank_account_id) {
        // Get bank account details
        const bankAccountQuery = await pool.query('SELECT * FROM bank_accounts WHERE id = $1', [bank_account_id]);
        if (bankAccountQuery.rows.length > 0) {
            summary.bank_account = bankAccountQuery.rows[0];
        }
    }
    
    res.json({
        summary,
        data: rows
    });
}));

module.exports = router;
