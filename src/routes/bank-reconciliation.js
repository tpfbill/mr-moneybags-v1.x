// src/routes/bank-reconciliation.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/bank-statements');
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Accept only CSV, OFX, QFX files
        const filetypes = /csv|ofx|qfx/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        
        if (extname || mimetype) {
            return cb(null, true);
        } else {
            cb(new Error('Only CSV, OFX, and QFX files are allowed'));
        }
    }
});

// ========================================================
// Bank Statements Routes
// ========================================================

/**
 * GET /api/bank-reconciliation/statements
 * List all bank statements with optional filtering
 */
router.get('/statements', asyncHandler(async (req, res) => {
    const { 
        bank_account_id, 
        status, 
        start_date, 
        end_date,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT bs.*, ba.account_name, ba.bank_name
        FROM bank_statements bs
        JOIN bank_accounts ba ON bs.bank_account_id = ba.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (bank_account_id) {
        query += ` AND bs.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (status) {
        query += ` AND bs.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (start_date) {
        query += ` AND bs.statement_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND bs.statement_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY bs.statement_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
 * POST /api/bank-reconciliation/statements
 * Create a new bank statement
 */
router.post('/statements', upload.single('statement_file'), asyncHandler(async (req, res) => {
    const {
        bank_account_id,
        statement_date,
        start_date,
        end_date,
        opening_balance,
        closing_balance,
        import_method,
        notes
    } = req.body;
    
    // Validate required fields
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account is required' });
    }
    
    if (!statement_date) {
        return res.status(400).json({ error: 'Statement date is required' });
    }
    
    if (!start_date || !end_date) {
        return res.status(400).json({ error: 'Statement period (start and end dates) is required' });
    }
    
    if (opening_balance === undefined || closing_balance === undefined) {
        return res.status(400).json({ error: 'Opening and closing balances are required' });
    }
    
    // File information
    let file_name = null;
    let file_path = null;
    
    if (req.file) {
        file_name = req.file.originalname;
        file_path = req.file.path;
    }
    
    const { rows } = await pool.query(`
        INSERT INTO bank_statements (
            bank_account_id,
            statement_date,
            start_date,
            end_date,
            opening_balance,
            closing_balance,
            status,
            file_name,
            file_path,
            import_method,
            notes,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *
    `, [
        bank_account_id,
        statement_date,
        start_date,
        end_date,
        parseFloat(opening_balance),
        parseFloat(closing_balance),
        'Uploaded', // Initial status
        file_name,
        file_path,
        import_method || 'Manual',
        notes || '',
        req.user?.id // Assuming user info is available in request
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * GET /api/bank-reconciliation/statements/:id
 * Get a specific bank statement by ID
 */
router.get('/statements/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT bs.*, ba.account_name, ba.bank_name
        FROM bank_statements bs
        JOIN bank_accounts ba ON bs.bank_account_id = ba.id
        WHERE bs.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * PUT /api/bank-reconciliation/statements/:id
 * Update a bank statement
 */
router.put('/statements/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        statement_date,
        start_date,
        end_date,
        opening_balance,
        closing_balance,
        status,
        notes
    } = req.body;
    
    // Check if statement exists
    const statementCheck = await pool.query('SELECT id FROM bank_statements WHERE id = $1', [id]);
    if (statementCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    // Validate status transitions
    if (status) {
        const validStatuses = ['Uploaded', 'Processed', 'Reconciled'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
    }
    
    const { rows } = await pool.query(`
        UPDATE bank_statements
        SET 
            statement_date = COALESCE($1, statement_date),
            start_date = COALESCE($2, start_date),
            end_date = COALESCE($3, end_date),
            opening_balance = COALESCE($4, opening_balance),
            closing_balance = COALESCE($5, closing_balance),
            status = COALESCE($6, status),
            notes = COALESCE($7, notes),
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        statement_date,
        start_date,
        end_date,
        opening_balance !== undefined ? parseFloat(opening_balance) : null,
        closing_balance !== undefined ? parseFloat(closing_balance) : null,
        status,
        notes,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-reconciliation/statements/:id
 * Delete a bank statement
 */
router.delete('/statements/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if statement exists
    const statementCheck = await pool.query('SELECT id, status, file_path FROM bank_statements WHERE id = $1', [id]);
    if (statementCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    // Prevent deletion of reconciled statements
    if (statementCheck.rows[0].status === 'Reconciled') {
        return res.status(409).json({ 
            error: 'Cannot delete a reconciled statement',
            details: 'Please remove the reconciliation first'
        });
    }
    
    // Check if statement is used in any reconciliations
    const reconciliationCheck = await pool.query(
        'SELECT id FROM bank_reconciliations WHERE bank_statement_id = $1 LIMIT 1',
        [id]
    );
    
    if (reconciliationCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete statement used in reconciliation',
            details: 'This statement is referenced by one or more reconciliations'
        });
    }
    
    // Delete the statement file if it exists
    const filePath = statementCheck.rows[0].file_path;
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    // Delete the statement (cascade will remove transactions)
    const result = await pool.query('DELETE FROM bank_statements WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    res.status(204).send();
}));

// ========================================================
// Bank Statement Transactions Routes
// ========================================================

/**
 * GET /api/bank-reconciliation/statements/:id/transactions
 * Get transactions for a specific bank statement
 */
router.get('/statements/:id/transactions', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status, type, page = 1, limit = 50 } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT * FROM bank_statement_transactions
        WHERE bank_statement_id = $1
    `;
    
    const params = [id];
    let paramIndex = 2;
    
    if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (type) {
        query += ` AND transaction_type = $${paramIndex++}`;
        params.push(type);
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY transaction_date, id LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
 * POST /api/bank-reconciliation/transactions/import
 * Import transactions from CSV file
 */
router.post('/transactions/import', upload.single('transaction_file'), asyncHandler(async (req, res) => {
    const { bank_statement_id } = req.body;
    
    if (!bank_statement_id) {
        return res.status(400).json({ error: 'Bank statement ID is required' });
    }
    
    if (!req.file) {
        return res.status(400).json({ error: 'Transaction file is required' });
    }
    
    // Check if statement exists
    const statementCheck = await pool.query('SELECT id FROM bank_statements WHERE id = $1', [bank_statement_id]);
    if (statementCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Bank statement not found' });
    }
    
    const filePath = req.file.path;
    const results = [];
    const errors = [];
    
    // Process CSV file
    await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => {
                // Map CSV columns to database fields
                try {
                    // Validate required fields
                    if (!data.date || !data.description || !data.amount) {
                        errors.push(`Row missing required fields: ${JSON.stringify(data)}`);
                        return;
                    }
                    
                    // Parse amount as float
                    const amount = parseFloat(data.amount);
                    if (isNaN(amount)) {
                        errors.push(`Invalid amount in row: ${JSON.stringify(data)}`);
                        return;
                    }
                    
                    results.push({
                        transaction_date: data.date,
                        description: data.description,
                        reference: data.reference || '',
                        amount: amount,
                        running_balance: data.balance ? parseFloat(data.balance) : null,
                        transaction_type: determineTransactionType(amount, data.type),
                        check_number: data.check_number || null
                    });
                } catch (err) {
                    errors.push(`Error processing row: ${err.message}`);
                }
            })
            .on('end', resolve)
            .on('error', reject);
    });
    
    // Insert transactions into database
    let inserted = 0;
    if (results.length > 0) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            for (const transaction of results) {
                await client.query(`
                    INSERT INTO bank_statement_transactions (
                        bank_statement_id,
                        transaction_date,
                        description,
                        reference,
                        amount,
                        running_balance,
                        transaction_type,
                        check_number,
                        status
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    bank_statement_id,
                    transaction.transaction_date,
                    transaction.description,
                    transaction.reference,
                    transaction.amount,
                    transaction.running_balance,
                    transaction.transaction_type,
                    transaction.check_number,
                    'Unmatched' // Initial status
                ]);
                
                inserted++;
            }
            
            // Update statement status to Processed
            await client.query(`
                UPDATE bank_statements
                SET status = 'Processed', updated_at = NOW()
                WHERE id = $1
            `, [bank_statement_id]);
            
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
    
    res.json({
        success: true,
        message: `Imported ${inserted} transactions`,
        total_rows: results.length,
        inserted,
        errors: errors.length > 0 ? errors : null
    });
}));

/**
 * PUT /api/bank-reconciliation/transactions/:id
 * Update a bank statement transaction
 */
router.put('/transactions/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        transaction_date,
        description,
        reference,
        amount,
        transaction_type,
        check_number,
        status
    } = req.body;
    
    // Check if transaction exists
    const transactionCheck = await pool.query('SELECT id FROM bank_statement_transactions WHERE id = $1', [id]);
    if (transactionCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
    }
    
    // Validate status if provided
    if (status) {
        const validStatuses = ['Unmatched', 'Matched', 'Ignored'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
    }
    
    const { rows } = await pool.query(`
        UPDATE bank_statement_transactions
        SET 
            transaction_date = COALESCE($1, transaction_date),
            description = COALESCE($2, description),
            reference = COALESCE($3, reference),
            amount = COALESCE($4, amount),
            transaction_type = COALESCE($5, transaction_type),
            check_number = COALESCE($6, check_number),
            status = COALESCE($7, status),
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        transaction_date,
        description,
        reference,
        amount !== undefined ? parseFloat(amount) : null,
        transaction_type,
        check_number,
        status,
        id
    ]);
    
    res.json(rows[0]);
}));

// ========================================================
// Bank Reconciliations Routes
// ========================================================

/**
 * GET /api/bank-reconciliation/reconciliations
 * List all reconciliations with optional filtering
 */
router.get('/reconciliations', asyncHandler(async (req, res) => {
    const { 
        bank_account_id, 
        status, 
        start_date, 
        end_date,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let query = `
        SELECT r.*, ba.account_name, ba.bank_name,
               bs.statement_date, bs.start_date as statement_start_date, bs.end_date as statement_end_date
        FROM bank_reconciliations r
        JOIN bank_accounts ba ON r.bank_account_id = ba.id
        LEFT JOIN bank_statements bs ON r.bank_statement_id = bs.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (bank_account_id) {
        query += ` AND r.bank_account_id = $${paramIndex++}`;
        params.push(bank_account_id);
    }
    
    if (status) {
        query += ` AND r.status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (start_date) {
        query += ` AND r.reconciliation_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        query += ` AND r.reconciliation_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    // Count total for pagination
    const countQuery = `SELECT COUNT(*) FROM (${query}) AS count_query`;
    const countResult = await pool.query(countQuery, params);
    const total = parseInt(countResult.rows[0].count);
    
    // Add pagination
    query += ` ORDER BY r.reconciliation_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
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
 * POST /api/bank-reconciliation/reconciliations
 * Create a new reconciliation
 */
router.post('/reconciliations', asyncHandler(async (req, res) => {
    const {
        bank_account_id,
        bank_statement_id,
        reconciliation_date,
        start_balance,
        end_balance,
        book_balance,
        statement_balance,
        notes
    } = req.body;
    
    // Validate required fields
    if (!bank_account_id) {
        return res.status(400).json({ error: 'Bank account is required' });
    }
    
    if (!reconciliation_date) {
        return res.status(400).json({ error: 'Reconciliation date is required' });
    }
    
    if (start_balance === undefined || end_balance === undefined) {
        return res.status(400).json({ error: 'Start and end balances are required' });
    }
    
    if (book_balance === undefined || statement_balance === undefined) {
        return res.status(400).json({ error: 'Book and statement balances are required' });
    }
    
    // Calculate difference
    const difference = parseFloat(statement_balance) - parseFloat(book_balance);
    
    const { rows } = await pool.query(`
        INSERT INTO bank_reconciliations (
            bank_account_id,
            bank_statement_id,
            reconciliation_date,
            start_balance,
            end_balance,
            book_balance,
            statement_balance,
            difference,
            status,
            notes,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `, [
        bank_account_id,
        bank_statement_id,
        reconciliation_date,
        parseFloat(start_balance),
        parseFloat(end_balance),
        parseFloat(book_balance),
        parseFloat(statement_balance),
        difference,
        'In Progress', // Initial status
        notes || '',
        req.user?.id // Assuming user info is available in request
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * GET /api/bank-reconciliation/reconciliations/:id
 * Get a specific reconciliation by ID with all related data
 */
router.get('/reconciliations/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get reconciliation details
    const reconciliationQuery = await pool.query(`
        SELECT r.*, ba.account_name, ba.bank_name,
               bs.statement_date, bs.start_date as statement_start_date, bs.end_date as statement_end_date
        FROM bank_reconciliations r
        JOIN bank_accounts ba ON r.bank_account_id = ba.id
        LEFT JOIN bank_statements bs ON r.bank_statement_id = bs.id
        WHERE r.id = $1
    `, [id]);
    
    if (reconciliationQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation not found' });
    }
    
    const reconciliation = reconciliationQuery.rows[0];
    
    // Get matched items
    const matchedItemsQuery = await pool.query(`
        SELECT ri.*, 
               bst.transaction_date as bank_date, bst.description as bank_description, bst.amount as bank_amount,
               jei.debit as journal_debit, jei.credit as journal_credit, 
               je.reference as journal_reference, je.description as journal_description
        FROM bank_reconciliation_items ri
        LEFT JOIN bank_statement_transactions bst ON ri.bank_statement_transaction_id = bst.id
        LEFT JOIN journal_entry_items jei ON ri.journal_entry_item_id = jei.id
        LEFT JOIN journal_entries je ON jei.journal_entry_id = je.id
        WHERE ri.bank_reconciliation_id = $1
        ORDER BY COALESCE(bst.transaction_date, je.date), ri.created_at
    `, [id]);
    
    // Get adjustments
    const adjustmentsQuery = await pool.query(`
        SELECT a.*
        FROM bank_reconciliation_adjustments a
        WHERE a.bank_reconciliation_id = $1
        ORDER BY a.adjustment_date, a.created_at
    `, [id]);
    
    // Combine all data
    const result = {
        ...reconciliation,
        matched_items: matchedItemsQuery.rows,
        adjustments: adjustmentsQuery.rows
    };
    
    res.json(result);
}));

/**
 * PUT /api/bank-reconciliation/reconciliations/:id
 * Update a reconciliation
 */
router.put('/reconciliations/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        reconciliation_date,
        book_balance,
        statement_balance,
        notes,
        status
    } = req.body;
    
    // Check if reconciliation exists
    const reconciliationCheck = await pool.query('SELECT id FROM bank_reconciliations WHERE id = $1', [id]);
    if (reconciliationCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation not found' });
    }
    
    // Validate status if provided
    if (status) {
        const validStatuses = ['In Progress', 'Completed', 'Approved'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
    }
    
    // Calculate difference if both balances provided
    let difference = null;
    if (book_balance !== undefined && statement_balance !== undefined) {
        difference = parseFloat(statement_balance) - parseFloat(book_balance);
    }
    
    const updateFields = [];
    const params = [];
    let paramIndex = 1;
    
    if (reconciliation_date) {
        updateFields.push(`reconciliation_date = $${paramIndex++}`);
        params.push(reconciliation_date);
    }
    
    if (book_balance !== undefined) {
        updateFields.push(`book_balance = $${paramIndex++}`);
        params.push(parseFloat(book_balance));
    }
    
    if (statement_balance !== undefined) {
        updateFields.push(`statement_balance = $${paramIndex++}`);
        params.push(parseFloat(statement_balance));
    }
    
    if (difference !== null) {
        updateFields.push(`difference = $${paramIndex++}`);
        params.push(difference);
    }
    
    if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        params.push(notes);
    }
    
    if (status) {
        updateFields.push(`status = $${paramIndex++}`);
        params.push(status);
        
        // If status is Approved, set approved_by and approved_at
        if (status === 'Approved') {
            updateFields.push(`approved_by = $${paramIndex++}`);
            params.push(req.user?.id);
            
            updateFields.push(`approved_at = $${paramIndex++}`);
            params.push(new Date());
        }
    }
    
    updateFields.push(`updated_at = NOW()`);
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(`
        UPDATE bank_reconciliations
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `, params);
    
    res.json(rows[0]);
}));

/**
 * POST /api/bank-reconciliation/reconciliations/:id/complete
 * Mark a reconciliation as complete and update bank account
 */
router.post('/reconciliations/:id/complete', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if reconciliation exists and get details
    const reconciliationQuery = await pool.query(`
        SELECT r.*, ba.id as bank_account_id
        FROM bank_reconciliations r
        JOIN bank_accounts ba ON r.bank_account_id = ba.id
        WHERE r.id = $1
    `, [id]);
    
    if (reconciliationQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation not found' });
    }
    
    const reconciliation = reconciliationQuery.rows[0];
    
    // Check if difference is zero
    if (Math.abs(reconciliation.difference) > 0.01) {
        return res.status(409).json({ 
            error: 'Cannot complete reconciliation with non-zero difference',
            details: `Current difference is ${reconciliation.difference}. Please add adjustments to balance.`
        });
    }
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Update reconciliation status
        const updateReconciliation = await client.query(`
            UPDATE bank_reconciliations
            SET 
                status = 'Completed',
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
        `, [id]);
        
        // Update bank account with last reconciliation info
        await client.query(`
            UPDATE bank_accounts
            SET 
                last_reconciliation_id = $1,
                last_reconciliation_date = $2,
                reconciled_balance = $3,
                updated_at = NOW()
            WHERE id = $4
        `, [
            id,
            reconciliation.reconciliation_date,
            reconciliation.end_balance,
            reconciliation.bank_account_id
        ]);
        
        // If there's a bank statement, update its status
        if (reconciliation.bank_statement_id) {
            await client.query(`
                UPDATE bank_statements
                SET 
                    status = 'Reconciled',
                    updated_at = NOW()
                WHERE id = $1
            `, [reconciliation.bank_statement_id]);
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: 'Reconciliation completed successfully',
            reconciliation: updateReconciliation.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ========================================================
// Matching Routes
// ========================================================

// ========================================================
// Adjustments Routes
// ========================================================

/**
 * POST /api/bank-reconciliation/adjustments
 * Create a reconciliation adjustment
 */
router.post('/adjustments', asyncHandler(async (req, res) => {
    const {
        bank_reconciliation_id,
        adjustment_date,
        description,
        adjustment_type,
        amount,
        status = 'Pending'
    } = req.body;

    /* ---- validation ---- */
    if (!bank_reconciliation_id) {
        return res.status(400).json({ error: 'Reconciliation ID is required' });
    }
    if (!adjustment_date) {
        return res.status(400).json({ error: 'Adjustment date is required' });
    }
    if (!description) {
        return res.status(400).json({ error: 'Description is required' });
    }
    if (!adjustment_type) {
        return res.status(400).json({ error: 'Adjustment type is required' });
    }
    if (amount === undefined) {
        return res.status(400).json({ error: 'Amount is required' });
    }
    const validStatuses = ['Pending', 'Approved'];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status value' });
    }

    const { rows } = await pool.query(`
        INSERT INTO bank_reconciliation_adjustments (
            bank_reconciliation_id,
            adjustment_date,
            description,
            adjustment_type,
            amount,
            status,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
        bank_reconciliation_id,
        adjustment_date,
        description,
        adjustment_type,
        parseFloat(amount),
        status,
        req.user?.id
    ]);

    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/bank-reconciliation/adjustments/:id
 * Update an adjustment
 */
router.put('/adjustments/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        adjustment_date,
        description,
        adjustment_type,
        amount,
        status
    } = req.body;

    const check = await pool.query('SELECT id FROM bank_reconciliation_adjustments WHERE id = $1', [id]);
    if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Adjustment not found' });
    }

    const updateFields = [];
    const params = [];
    let idx = 1;

    if (adjustment_date) {
        updateFields.push(`adjustment_date = $${idx++}`);
        params.push(adjustment_date);
    }
    if (description !== undefined) {
        updateFields.push(`description = $${idx++}`);
        params.push(description);
    }
    if (adjustment_type) {
        updateFields.push(`adjustment_type = $${idx++}`);
        params.push(adjustment_type);
    }
    if (amount !== undefined) {
        updateFields.push(`amount = $${idx++}`);
        params.push(parseFloat(amount));
    }
    if (status) {
        const valid = ['Pending', 'Approved'];
        if (!valid.includes(status)) {
            return res.status(400).json({ error: 'Invalid status value' });
        }
        updateFields.push(`status = $${idx++}`);
        params.push(status);
    }
    updateFields.push(`updated_at = NOW()`);
    params.push(id); // final param for WHERE

    const { rows } = await pool.query(`
        UPDATE bank_reconciliation_adjustments
        SET ${updateFields.join(', ')}
        WHERE id = $${idx}
        RETURNING *
    `, params);

    res.json(rows[0]);
}));

/**
 * DELETE /api/bank-reconciliation/adjustments/:id
 * Delete an adjustment
 */
router.delete('/adjustments/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const check = await pool.query('SELECT id FROM bank_reconciliation_adjustments WHERE id = $1', [id]);
    if (check.rows.length === 0) {
        return res.status(404).json({ error: 'Adjustment not found' });
    }

    await pool.query('DELETE FROM bank_reconciliation_adjustments WHERE id = $1', [id]);
    res.status(204).send();
}));

// ========================================================
// Utility Routes
// ========================================================

/**
 * POST /api/bank-reconciliation/match/auto
 * Auto-match transactions based on amount, date, and description
 */
router.post('/match/auto', asyncHandler(async (req, res) => {
    const { 
        bank_reconciliation_id,
        date_tolerance = 3, // Days of tolerance for date matching
        description_match = false // Whether to also match on description
    } = req.body;
    
    if (!bank_reconciliation_id) {
        return res.status(400).json({ error: 'Reconciliation ID is required' });
    }
    
    // Get reconciliation details
    const reconciliationQuery = await pool.query(`
        SELECT r.*, bs.id as statement_id
        FROM bank_reconciliations r
        LEFT JOIN bank_statements bs ON r.bank_statement_id = bs.id
        WHERE r.id = $1
    `, [bank_reconciliation_id]);
    
    if (reconciliationQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation not found' });
    }
    
    const reconciliation = reconciliationQuery.rows[0];
    
    // Get unmatched bank transactions
    const bankTransactionsQuery = await pool.query(`
        SELECT * FROM bank_statement_transactions
        WHERE bank_statement_id = $1 AND status = 'Unmatched'
    `, [reconciliation.statement_id]);
    
    if (bankTransactionsQuery.rows.length === 0) {
        return res.json({
            success: true,
            message: 'No unmatched bank transactions found',
            matches: 0
        });
    }
    
    // Get unmatched journal entries for this account
    const journalItemsQuery = await pool.query(`
        SELECT jei.*, je.date, je.reference, je.description
        FROM journal_entry_items jei
        JOIN journal_entries je ON jei.journal_entry_id = je.id
        LEFT JOIN bank_reconciliation_items bri ON bri.journal_entry_item_id = jei.id
        WHERE jei.account_id = (
            SELECT gl_account_id FROM bank_accounts WHERE id = $1
        )
        AND bri.id IS NULL
        AND je.status = 'Posted'
        AND je.date BETWEEN $2::DATE - INTERVAL '${date_tolerance} days' AND $3::DATE + INTERVAL '${date_tolerance} days'
    `, [
        reconciliation.bank_account_id,
        reconciliation.start_date || reconciliation.reconciliation_date,
        reconciliation.end_date || reconciliation.reconciliation_date
    ]);
    
    // Perform matching
    const matches = [];
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        for (const bankTx of bankTransactionsQuery.rows) {
            // Find matching journal entries by amount
            const matchingJournalItems = journalItemsQuery.rows.filter(ji => {
                // Match by amount (debit or credit depending on bank transaction amount)
                const journalAmount = bankTx.amount > 0 ? ji.debit : ji.credit;
                const bankAmount = Math.abs(bankTx.amount);
                
                if (Math.abs(journalAmount - bankAmount) > 0.01) {
                    return false;
                }
                
                // Match by date within tolerance
                const bankDate = new Date(bankTx.transaction_date);
                const journalDate = new Date(ji.date);
                const daysDiff = Math.abs((bankDate - journalDate) / (1000 * 60 * 60 * 24));
                
                if (daysDiff > date_tolerance) {
                    return false;
                }
                
                // Optionally match by description
                if (description_match) {
                    const bankDesc = bankTx.description.toLowerCase();
                    const journalDesc = (ji.description || '').toLowerCase();
                    
                    // Simple fuzzy match - check if one contains parts of the other
                    return bankDesc.includes(journalDesc) || journalDesc.includes(bankDesc);
                }
                
                return true;
            });
            
            // If we found exactly one match, create the reconciliation item
            if (matchingJournalItems.length === 1) {
                const journalItem = matchingJournalItems[0];
                
                // Insert reconciliation item
                const { rows } = await client.query(`
                    INSERT INTO bank_reconciliation_items (
                        bank_reconciliation_id,
                        bank_statement_transaction_id,
                        journal_entry_item_id,
                        match_type,
                        status,
                        amount,
                        created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    RETURNING *
                `, [
                    bank_reconciliation_id,
                    bankTx.id,
                    journalItem.id,
                    'Auto',
                    'Matched',
                    Math.abs(bankTx.amount),
                    req.user?.id
                ]);
                
                // Update bank transaction status
                await client.query(`
                    UPDATE bank_statement_transactions
                    SET status = 'Matched', updated_at = NOW()
                    WHERE id = $1
                `, [bankTx.id]);
                
                matches.push({
                    reconciliation_item: rows[0],
                    bank_transaction: bankTx,
                    journal_item: journalItem
                });
            }
        }
        
        await client.query('COMMIT');
        
        res.json({
            success: true,
            message: `Auto-matched ${matches.length} transactions`,
            matches: matches.length,
            matched_items: matches
        });
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

/**
 * POST /api/bank-reconciliation/match/manual
 * Manually match a bank transaction to a journal entry
 */
router.post('/match/manual', asyncHandler(async (req, res) => {
    const {
        bank_reconciliation_id,
        bank_statement_transaction_id,
        journal_entry_item_id,
        notes
    } = req.body;
    
    // Validate required fields
    if (!bank_reconciliation_id) {
        return res.status(400).json({ error: 'Reconciliation ID is required' });
    }
    
    if (!bank_statement_transaction_id && !journal_entry_item_id) {
        return res.status(400).json({ error: 'At least one of bank transaction ID or journal entry item ID is required' });
    }
    
    // Get transaction amount if provided
    let amount = null;
    if (bank_statement_transaction_id) {
        const txQuery = await pool.query('SELECT amount FROM bank_statement_transactions WHERE id = $1', [bank_statement_transaction_id]);
        if (txQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Bank transaction not found' });
        }
        amount = Math.abs(txQuery.rows[0].amount);
    } else if (journal_entry_item_id) {
        const itemQuery = await pool.query('SELECT debit, credit FROM journal_entry_items WHERE id = $1', [journal_entry_item_id]);
        if (itemQuery.rows.length === 0) {
            return res.status(404).json({ error: 'Journal entry item not found' });
        }
        amount = itemQuery.rows[0].debit > 0 ? itemQuery.rows[0].debit : itemQuery.rows[0].credit;
    }
    
    // Create the reconciliation item
    const { rows } = await pool.query(`
        INSERT INTO bank_reconciliation_items (
            bank_reconciliation_id,
            bank_statement_transaction_id,
            journal_entry_item_id,
            match_type,
            status,
            amount,
            notes,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
    `, [
        bank_reconciliation_id,
        bank_statement_transaction_id,
        journal_entry_item_id,
        'Manual',
        'Matched',
        amount,
        notes || '',
        req.user?.id
    ]);
    
    // Update bank transaction status if provided
    if (bank_statement_transaction_id) {
        await pool.query(`
            UPDATE bank_statement_transactions
            SET status = 'Matched', updated_at = NOW()
            WHERE id = $1
        `, [bank_statement_transaction_id]);
    }
    
    res.status(201).json(rows[0]);
}));

/**
 * DELETE /api/bank-reconciliation/match/:id
 * Remove a match (unmatch a transaction)
 */
router.delete('/match/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get match details before deleting
    const matchQuery = await pool.query('SELECT * FROM bank_reconciliation_items WHERE id = $1', [id]);
    if (matchQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Match not found' });
    }
    
    const match = matchQuery.rows[0];
    
    // Start a transaction
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Delete the match
        await client.query('DELETE FROM bank_reconciliation_items WHERE id = $1', [id]);
        
        // Update bank transaction status if it exists
        if (match.bank_statement_transaction_id) {
            await client.query(`
                UPDATE bank_statement_transactions
                SET status = 'Unmatched', updated_at = NOW()
                WHERE id = $1
            `, [match.bank_statement_transaction_id]);
        }
        
        await client.query('COMMIT');
        
        res.status(204).send();
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}));

// ========================================================
// Utility Routes
// ========================================================

/**
 * GET /api/bank-reconciliation/unmatched/:bank_account_id
 * Get unmatched transactions for a bank account
 */
router.get('/unmatched/:bank_account_id', asyncHandler(async (req, res) => {
    const { bank_account_id } = req.params;
    const { start_date, end_date } = req.query;
    
    // Validate dates if provided
    if ((start_date && !isValidDate(start_date)) || (end_date && !isValidDate(end_date))) {
        return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD.' });
    }
    
    // Get unmatched bank transactions
    let bankTransactionsQuery = `
        SELECT bst.*, bs.statement_date
        FROM bank_statement_transactions bst
        JOIN bank_statements bs ON bst.bank_statement_id = bs.id
        WHERE bs.bank_account_id = $1
        AND bst.status = 'Unmatched'
    `;
    
    const params = [bank_account_id];
    let paramIndex = 2;
    
    if (start_date) {
        bankTransactionsQuery += ` AND bst.transaction_date >= $${paramIndex++}`;
        params.push(start_date);
    }
    
    if (end_date) {
        bankTransactionsQuery += ` AND bst.transaction_date <= $${paramIndex++}`;
        params.push(end_date);
    }
    
    bankTransactionsQuery += ` ORDER BY bst.transaction_date, bst.id`;
    
    const bankTransactions = await pool.query(bankTransactionsQuery, params);
    
    // Get unmatched journal entries for this account
    let journalItemsQuery = `
        SELECT jei.*, je.date, je.reference, je.description, je.status as journal_status
        FROM journal_entry_items jei
        JOIN journal_entries je ON jei.journal_entry_id = je.id
        LEFT JOIN bank_reconciliation_items bri ON bri.journal_entry_item_id = jei.id
        WHERE jei.account_id = (
            SELECT gl_account_id FROM bank_accounts WHERE id = $1
        )
        AND bri.id IS NULL
        AND je.status = 'Posted'
    `;
    
    paramIndex = 2;
    const journalParams = [bank_account_id];
    
    if (start_date) {
        journalItemsQuery += ` AND je.date >= $${paramIndex++}`;
        journalParams.push(start_date);
    }
    
    if (end_date) {
        journalItemsQuery += ` AND je.date <= $${paramIndex++}`;
        journalParams.push(end_date);
    }
    
    journalItemsQuery += ` ORDER BY je.date, jei.id`;
    
    const journalItems = await pool.query(journalItemsQuery, journalParams);
    
    res.json({
        bank_transactions: bankTransactions.rows,
        journal_items: journalItems.rows
    });
}));

/**
 * GET /api/bank-reconciliation/reports/:id
 * Get a reconciliation report
 */
router.get('/reports/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get reconciliation details
    const reconciliationQuery = await pool.query(`
        SELECT r.*, ba.account_name, ba.bank_name,
               bs.statement_date, bs.start_date as statement_start_date, bs.end_date as statement_end_date,
               u1.name as created_by_name, u2.name as approved_by_name
        FROM bank_reconciliations r
        JOIN bank_accounts ba ON r.bank_account_id = ba.id
        LEFT JOIN bank_statements bs ON r.bank_statement_id = bs.id
        LEFT JOIN users u1 ON r.created_by = u1.id
        LEFT JOIN users u2 ON r.approved_by = u2.id
        WHERE r.id = $1
    `, [id]);
    
    if (reconciliationQuery.rows.length === 0) {
        return res.status(404).json({ error: 'Reconciliation not found' });
    }
    
    const reconciliation = reconciliationQuery.rows[0];
    
    // Get matched items
    const matchedItemsQuery = await pool.query(`
        SELECT ri.*, 
               bst.transaction_date as bank_date, bst.description as bank_description, 
               bst.amount as bank_amount, bst.transaction_type,
               jei.debit as journal_debit, jei.credit as journal_credit, 
               je.date as journal_date, je.reference as journal_reference, 
               je.description as journal_description
        FROM bank_reconciliation_items ri
        LEFT JOIN bank_statement_transactions bst ON ri.bank_statement_transaction_id = bst.id
        LEFT JOIN journal_entry_items jei ON ri.journal_entry_item_id = jei.id
        LEFT JOIN journal_entries je ON jei.journal_entry_id = je.id
        WHERE ri.bank_reconciliation_id = $1
        ORDER BY COALESCE(bst.transaction_date, je.date), ri.created_at
    `, [id]);
    
    // Get adjustments
    const adjustmentsQuery = await pool.query(`
        SELECT a.*, u.name as created_by_name
        FROM bank_reconciliation_adjustments a
        LEFT JOIN users u ON a.created_by = u.id
        WHERE a.bank_reconciliation_id = $1
        ORDER BY a.adjustment_date, a.created_at
    `, [id]);
    
    // Get summary statistics
    const summaryQuery = await pool.query(`
        SELECT
            COUNT(DISTINCT ri.id) as total_matched_items,
            COUNT(DISTINCT ri.bank_statement_transaction_id) as matched_bank_transactions,
            COUNT(DISTINCT ri.journal_entry_item_id) as matched_journal_items,
            COUNT(DISTINCT a.id) as total_adjustments,
            SUM(CASE WHEN a.status = 'Approved' THEN 1 ELSE 0 END) as approved_adjustments,
            SUM(CASE WHEN a.status = 'Pending' THEN 1 ELSE 0 END) as pending_adjustments
        FROM bank_reconciliations r
        LEFT JOIN bank_reconciliation_items ri ON r.id = ri.bank_reconciliation_id
        LEFT JOIN bank_reconciliation_adjustments a ON r.id = a.bank_reconciliation_id
        WHERE r.id = $1
    `, [id]);
    
    // Get unmatched items
    const unmatchedQuery = await pool.query(`
        SELECT
            (SELECT COUNT(*) FROM bank_statement_transactions bst
             JOIN bank_statements bs ON bst.bank_statement_id = bs.id
             WHERE bs.id = $1 AND bst.status = 'Unmatched') as unmatched_bank_transactions,
            (SELECT COUNT(*) FROM journal_entry_items jei
             JOIN journal_entries je ON jei.journal_entry_id = je.id
             LEFT JOIN bank_reconciliation_items bri ON bri.journal_entry_item_id = jei.id
             WHERE jei.account_id = (SELECT gl_account_id FROM bank_accounts WHERE id = $2)
             AND bri.id IS NULL
             AND je.status = 'Posted'
             AND je.date BETWEEN $3::DATE AND $4::DATE) as unmatched_journal_items
    `, [
        reconciliation.bank_statement_id,
        reconciliation.bank_account_id,
        reconciliation.start_date || reconciliation.reconciliation_date,
        reconciliation.end_date || reconciliation.reconciliation_date
    ]);
    
    // Combine all data into a comprehensive report
    const report = {
        reconciliation: reconciliation,
        matched_items: matchedItemsQuery.rows,
        adjustments: adjustmentsQuery.rows,
        summary: {
            ...summaryQuery.rows[0],
            ...unmatchedQuery.rows[0],
            is_balanced: Math.abs(reconciliation.difference) < 0.01,
            difference: reconciliation.difference
        }
    };
    
    res.json(report);
}));

// ========================================================
// Helper Functions
// ========================================================

/**
 * Determine transaction type based on amount and optional type hint
 */
function determineTransactionType(amount, typeHint) {
    if (typeHint) {
        return typeHint;
    }
    
    if (amount > 0) {
        return 'Deposit';
    } else if (amount < 0) {
        return 'Withdrawal';
    }
    
    return 'Other';
}

/**
 * Validate date string format (YYYY-MM-DD)
 */
function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

module.exports = router;
