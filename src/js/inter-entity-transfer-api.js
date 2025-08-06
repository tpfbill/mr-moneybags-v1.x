/**
 * inter-entity-transfer-api.js
 * 
 * API endpoints to support the inter-entity transfer wizard.
 * This file contains routes for creating journal entry lines,
 * retrieving accounts and funds by entity, and helper functions
 * for validation and error handling.
 */

/**
 * Register inter-entity transfer API routes
 * @param {Object} app - Express application
 * @param {Object} pool - PostgreSQL connection pool
 */
function registerInterEntityTransferRoutes(app, pool) {
    const asyncHandler = fn => (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

    /**
     * POST /api/journal-entries/:id/lines
     * Create a journal entry line
     */
    app.post('/api/journal-entries/:id/lines', asyncHandler(async (req, res) => {
        const { id } = req.params;
        const { 
            account_id, 
            fund_id, 
            debit, 
            credit, 
            description 
        } = req.body;

        // Validate required fields
        if (!account_id) {
            return res.status(400).json({ message: 'Account ID is required' });
        }

        if (debit === undefined && credit === undefined) {
            return res.status(400).json({ message: 'Either debit or credit amount is required' });
        }

        try {
            // Verify journal entry exists
            const jeResult = await pool.query(
                'SELECT entity_id FROM journal_entries WHERE id = $1',
                [id]
            );

            if (jeResult.rows.length === 0) {
                return res.status(404).json({ message: 'Journal entry not found' });
            }

            const entity_id = jeResult.rows[0].entity_id;

            // Create the journal entry line
            const { rows } = await pool.query(
                `INSERT INTO journal_entry_items 
                (journal_entry_id, account_id, fund_id, debit, credit, description, entity_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7) 
                RETURNING *`,
                [
                    id, 
                    account_id, 
                    fund_id, 
                    parseFloat(debit || 0), 
                    parseFloat(credit || 0), 
                    description || '',
                    entity_id
                ]
            );

            // Update journal entry total_amount
            await updateJournalEntryTotal(pool, id);

            res.status(201).json(rows[0]);
        } catch (error) {
            console.error('Error creating journal entry line:', error);
            res.status(500).json({ 
                message: 'Failed to create journal entry line', 
                error: error.message 
            });
        }
    }));

    /**
     * GET /api/accounts
     * Get accounts with optional entity filter
     */
    app.get('/api/accounts', asyncHandler(async (req, res) => {
        const { entityId, type } = req.query;
        
        let query = 'SELECT * FROM accounts';
        const params = [];
        
        if (entityId || type) {
            query += ' WHERE';
            
            if (entityId) {
                params.push(entityId);
                query += ` entity_id = $${params.length}`;
            }
            
            if (entityId && type) {
                query += ' AND';
            }
            
            if (type) {
                params.push(type);
                query += ` type = $${params.length}`;
            }
        }
        
        query += ' ORDER BY code';
        
        const { rows } = await pool.query(query, params);
        res.json(rows);
    }));

    /**
     * GET /api/funds
     * Get funds with optional entity filter
     */
    app.get('/api/funds', asyncHandler(async (req, res) => {
        const { entityId, type } = req.query;
        
        let query = 'SELECT * FROM funds';
        const params = [];
        
        if (entityId || type) {
            query += ' WHERE';
            
            if (entityId) {
                params.push(entityId);
                query += ` entity_id = $${params.length}`;
            }
            
            if (entityId && type) {
                query += ' AND';
            }
            
            if (type) {
                params.push(type);
                query += ` type = $${params.length}`;
            }
        }
        
        query += ' ORDER BY code';
        
        const { rows } = await pool.query(query, params);
        res.json(rows);
    }));

    /**
     * GET /api/inter-entity/accounts-mapping
     * Get Due To/Due From account mappings between entities
     */
    app.get('/api/inter-entity/accounts-mapping', asyncHandler(async (req, res) => {
        const { fromEntityId, toEntityId } = req.query;
        
        if (!fromEntityId || !toEntityId) {
            return res.status(400).json({ message: 'Both fromEntityId and toEntityId are required' });
        }
        
        try {
            // Get Due From accounts (assets) from source entity
            const dueFromResult = await pool.query(
                `SELECT id, code, name 
                FROM accounts 
                WHERE entity_id = $1 
                AND type = 'Asset' 
                AND (name ILIKE '%due from%' OR code LIKE '19%')
                ORDER BY code`,
                [fromEntityId]
            );
            
            // Get Due To accounts (liabilities) from target entity
            const dueToResult = await pool.query(
                `SELECT id, code, name 
                FROM accounts 
                WHERE entity_id = $1 
                AND type = 'Liability' 
                AND (name ILIKE '%due to%' OR code LIKE '29%')
                ORDER BY code`,
                [toEntityId]
            );
            
            res.json({
                dueFromAccounts: dueFromResult.rows,
                dueToAccounts: dueToResult.rows
            });
        } catch (error) {
            console.error('Error fetching account mappings:', error);
            res.status(500).json({ 
                message: 'Failed to fetch account mappings', 
                error: error.message 
            });
        }
    }));

    /**
     * POST /api/inter-entity/transfer
     * Create a complete inter-entity transfer with both journal entries
     */
    app.post('/api/inter-entity/transfer', asyncHandler(async (req, res) => {
        const { 
            fromEntityId, 
            toEntityId, 
            date, 
            amount, 
            description, 
            referenceNumber,
            fromFundId,
            toFundId,
            fromDueFromAccountId,
            toDueToAccountId
        } = req.body;
        
        // Validate required fields
        if (!fromEntityId || !toEntityId || !date || !amount || !description || 
            !fromFundId || !toFundId || !fromDueFromAccountId || !toDueToAccountId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        
        if (parseFloat(amount) <= 0) {
            return res.status(400).json({ message: 'Amount must be greater than zero' });
        }
        
        // Start a transaction
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Generate a UUID for matching_transaction_id
            const matchingTransactionId = generateUUID();
            
            // Create source journal entry
            const sourceJeResult = await client.query(
                `INSERT INTO journal_entries 
                (entity_id, entry_date, reference_number, description, total_amount, 
                status, created_by, is_inter_entity, target_entity_id, matching_transaction_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                RETURNING *`,
                [
                    fromEntityId,
                    date,
                    referenceNumber ? `${referenceNumber}-SRC` : `IE-${Date.now()}-SRC`,
                    description,
                    parseFloat(amount),
                    'Posted',
                    'System',
                    true,
                    toEntityId,
                    matchingTransactionId
                ]
            );
            
            const sourceJournalEntryId = sourceJeResult.rows[0].id;
            
            // Find cash account for source entity
            const sourceCashResult = await client.query(
                `SELECT id FROM accounts 
                WHERE entity_id = $1 
                AND type = 'Asset' 
                AND (name ILIKE '%cash%' OR code LIKE '10%') 
                LIMIT 1`,
                [fromEntityId]
            );
            
            if (sourceCashResult.rows.length === 0) {
                throw new Error(`No cash account found for source entity`);
            }
            
            const sourceCashAccountId = sourceCashResult.rows[0].id;
            
            // Create source journal entry lines
            await client.query(
                `INSERT INTO journal_entry_items 
                (journal_entry_id, account_id, fund_id, debit, credit, description, entity_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    sourceJournalEntryId,
                    fromDueFromAccountId,
                    fromFundId,
                    parseFloat(amount),
                    0,
                    `Due from target entity`,
                    fromEntityId
                ]
            );
            
            await client.query(
                `INSERT INTO journal_entry_items 
                (journal_entry_id, account_id, fund_id, debit, credit, description, entity_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    sourceJournalEntryId,
                    sourceCashAccountId,
                    fromFundId,
                    0,
                    parseFloat(amount),
                    `Cash transfer to target entity`,
                    fromEntityId
                ]
            );
            
            // Create target journal entry
            const targetJeResult = await client.query(
                `INSERT INTO journal_entries 
                (entity_id, entry_date, reference_number, description, total_amount, 
                status, created_by, is_inter_entity, target_entity_id, matching_transaction_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
                RETURNING *`,
                [
                    toEntityId,
                    date,
                    referenceNumber ? `${referenceNumber}-TGT` : `IE-${Date.now()}-TGT`,
                    description,
                    parseFloat(amount),
                    'Posted',
                    'System',
                    true,
                    fromEntityId,
                    matchingTransactionId
                ]
            );
            
            const targetJournalEntryId = targetJeResult.rows[0].id;
            
            // Find cash account for target entity
            const targetCashResult = await client.query(
                `SELECT id FROM accounts 
                WHERE entity_id = $1 
                AND type = 'Asset' 
                AND (name ILIKE '%cash%' OR code LIKE '10%') 
                LIMIT 1`,
                [toEntityId]
            );
            
            if (targetCashResult.rows.length === 0) {
                throw new Error(`No cash account found for target entity`);
            }
            
            const targetCashAccountId = targetCashResult.rows[0].id;
            
            // Create target journal entry lines
            await client.query(
                `INSERT INTO journal_entry_items 
                (journal_entry_id, account_id, fund_id, debit, credit, description, entity_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    targetJournalEntryId,
                    targetCashAccountId,
                    toFundId,
                    parseFloat(amount),
                    0,
                    `Cash received from source entity`,
                    toEntityId
                ]
            );
            
            await client.query(
                `INSERT INTO journal_entry_items 
                (journal_entry_id, account_id, fund_id, debit, credit, description, entity_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    targetJournalEntryId,
                    toDueToAccountId,
                    toFundId,
                    0,
                    parseFloat(amount),
                    `Due to source entity`,
                    toEntityId
                ]
            );
            
            await client.query('COMMIT');
            
            res.status(201).json({
                success: true,
                matchingTransactionId,
                sourceJournalEntry: sourceJeResult.rows[0],
                targetJournalEntry: targetJeResult.rows[0]
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creating inter-entity transfer:', error);
            res.status(500).json({ 
                message: 'Failed to create inter-entity transfer', 
                error: error.message 
            });
        } finally {
            client.release();
        }
    }));

    /**
     * GET /api/inter-entity/transfers
     * Get all inter-entity transfers
     */
    app.get('/api/inter-entity/transfers', asyncHandler(async (req, res) => {
        const { entityId } = req.query;
        
        let query = `
            SELECT 
                je.id,
                je.entity_id,
                je.target_entity_id,
                je.entry_date,
                je.reference_number,
                je.description,
                je.total_amount,
                je.matching_transaction_id,
                e1.code as entity_code,
                e1.name as entity_name,
                e2.code as target_entity_code,
                e2.name as target_entity_name
            FROM journal_entries je
            JOIN entities e1 ON je.entity_id = e1.id
            JOIN entities e2 ON je.target_entity_id = e2.id
            WHERE je.is_inter_entity = true
        `;
        
        const params = [];
        
        if (entityId) {
            params.push(entityId);
            query += ` AND (je.entity_id = $${params.length} OR je.target_entity_id = $${params.length})`;
        }
        
        query += ` ORDER BY je.entry_date DESC`;
        
        const { rows } = await pool.query(query, params);
        
        // Group by matching_transaction_id
        const transfers = {};
        
        rows.forEach(row => {
            if (!transfers[row.matching_transaction_id]) {
                transfers[row.matching_transaction_id] = {
                    matchingTransactionId: row.matching_transaction_id,
                    date: row.entry_date,
                    description: row.description,
                    amount: row.total_amount,
                    entries: []
                };
            }
            
            transfers[row.matching_transaction_id].entries.push({
                id: row.id,
                entityId: row.entity_id,
                entityCode: row.entity_code,
                entityName: row.entity_name,
                targetEntityId: row.target_entity_id,
                targetEntityCode: row.target_entity_code,
                targetEntityName: row.target_entity_name,
                referenceNumber: row.reference_number
            });
        });
        
        res.json(Object.values(transfers));
    }));
}

/**
 * Update journal entry total amount based on sum of lines
 * @param {Object} pool - PostgreSQL connection pool
 * @param {string} journalEntryId - Journal entry ID
 */
async function updateJournalEntryTotal(pool, journalEntryId) {
    try {
        // Calculate total from lines
        const totalResult = await pool.query(
            `SELECT 
                COALESCE(SUM(debit), 0) as total_debits,
                COALESCE(SUM(credit), 0) as total_credits
            FROM journal_entry_items
            WHERE journal_entry_id = $1`,
            [journalEntryId]
        );
        
        const totalDebits = parseFloat(totalResult.rows[0].total_debits);
        const totalCredits = parseFloat(totalResult.rows[0].total_credits);
        
        // Use the larger of debits or credits as the total amount
        const totalAmount = Math.max(totalDebits, totalCredits);
        
        // Update journal entry
        await pool.query(
            'UPDATE journal_entries SET total_amount = $1 WHERE id = $2',
            [totalAmount, journalEntryId]
        );
    } catch (error) {
        console.error('Error updating journal entry total:', error);
        throw error;
    }
}

/**
 * Generate a UUID
 * @returns {string} UUID
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

module.exports = registerInterEntityTransferRoutes;
