// src/routes/journal-entries.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/journal-entries
 * Returns all journal entries, optionally filtered by entity_id, date range, or status
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, from_date, to_date, status, limit } = req.query;
    
    let query = `
        SELECT je.*, 
               e.name as entity_name,
               te.name as target_entity_name,
               (SELECT COUNT(*) FROM journal_entry_items WHERE journal_entry_id = je.id) as line_count
        FROM journal_entries je
        LEFT JOIN entities e ON je.entity_id = e.id
        LEFT JOIN entities te ON je.target_entity_id = te.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (entity_id) {
        query += ` AND je.entity_id = $${paramIndex++}`;
        params.push(entity_id);
    }
    
    if (from_date) {
        query += ` AND je.entry_date >= $${paramIndex++}`;
        params.push(from_date);
    }
    
    if (to_date) {
        query += ` AND je.entry_date <= $${paramIndex++}`;
        params.push(to_date);
    }
    
    if (status) {
        query += ` AND je.status = $${paramIndex++}`;
        params.push(status);
    }
    
    query += ` ORDER BY je.entry_date DESC, je.created_at DESC`;
    
    if (limit && !isNaN(parseInt(limit))) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(parseInt(limit));
    }
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/journal-entries/:id
 * Returns a specific journal entry by ID with its lines
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get the journal entry
    const entryResult = await pool.query(`
        SELECT je.*, 
               e.name as entity_name,
               te.name as target_entity_name
        FROM journal_entries je
        LEFT JOIN entities e ON je.entity_id = e.id
        LEFT JOIN entities te ON je.target_entity_id = te.id
        WHERE je.id = $1
    `, [id]);
    
    if (entryResult.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    // Get the journal entry lines
    const linesResult = await pool.query(`
        SELECT jel.*, 
               a.name as account_name,
               a.code as account_code,
               f.name as fund_name,
               f.code as fund_code
        FROM journal_entry_items jel
        LEFT JOIN accounts a ON jel.account_id = a.id
        LEFT JOIN funds f ON jel.fund_id = f.id
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.id
    `, [id]);
    
    // Combine entry with its lines
    const entry = entryResult.rows[0];
    entry.lines = linesResult.rows;
    
    res.json(entry);
}));

/**
 * GET /api/journal-entries/:id/lines
 * Returns all lines for a specific journal entry
 */
router.get('/:id/lines', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT jel.*, 
               a.name as account_name,
               a.code as account_code,
               f.name as fund_name,
               f.code as fund_code
        FROM journal_entry_items jel
        LEFT JOIN accounts a ON jel.account_id = a.id
        LEFT JOIN funds f ON jel.fund_id = f.id
        WHERE jel.journal_entry_id = $1
        ORDER BY jel.id
    `, [id]);
    
    res.json(rows);
}));

/**
 * POST /api/journal-entries
 * Creates a new journal entry with its lines
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        entity_id,
        target_entity_id,
        entry_date,
        reference_number,
        description,
        status,
        is_inter_entity,
        lines
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!entry_date) {
        return res.status(400).json({ error: 'Entry date is required' });
    }
    
    if (!lines || !Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'At least one journal entry line is required' });
    }
    
    // Validate double-entry accounting (debits = credits)
    let totalDebits = 0;
    let totalCredits = 0;
    
    lines.forEach(line => {
        totalDebits += parseFloat(line.debit || 0);
        totalCredits += parseFloat(line.credit || 0);
    });
    
    // Round to 2 decimal places to avoid floating point issues
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;
    
    if (totalDebits !== totalCredits) {
        return res.status(400).json({ 
            error: 'Invalid journal entry: Debits must equal credits',
            details: `Total debits (${totalDebits}) do not equal total credits (${totalCredits})`
        });
    }
    
    // Start a transaction to create the journal entry and its lines
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Create the journal entry
        const entryResult = await client.query(`
            INSERT INTO journal_entries (
                entity_id,
                target_entity_id,
                entry_date,
                reference_number,
                description,
                status,
                is_inter_entity,
                total_amount
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `, [
            entity_id,
            target_entity_id,
            entry_date,
            reference_number,
            description,
            status || 'Posted',
            is_inter_entity || false,
            totalDebits // Total amount is the sum of debits (or credits, they're equal)
        ]);
        
        const journalEntryId = entryResult.rows[0].id;
        
        // Create the journal entry lines
        for (const line of lines) {
            if (!line.account_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Account ID is required for all journal entry lines' });
            }
            
            if (!line.fund_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Fund ID is required for all journal entry lines' });
            }
            
            // Each line must contain a non-zero debit or credit amount
            if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Each line must have either a debit or credit amount' });
            }
            
            await client.query(`
                INSERT INTO journal_entry_items (
                    journal_entry_id,
                    account_id,
                    fund_id,
                    debit,
                    credit,
                    description
                ) VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                journalEntryId,
                line.account_id,
                line.fund_id,
                line.debit || 0,
                line.credit || 0,
                line.description || ''
            ]);
            
            // Update account balances
            if (line.debit && line.debit > 0) {
                await client.query(`
                    UPDATE accounts
                    SET balance = balance + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.debit, line.account_id]);
            }
            
            if (line.credit && line.credit > 0) {
                await client.query(`
                    UPDATE accounts
                    SET balance = balance - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.credit, line.account_id]);
            }
            
            // Update fund balances
            if (line.debit && line.debit > 0) {
                await client.query(`
                    UPDATE funds
                    SET balance = balance + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.debit, line.fund_id]);
            }
            
            if (line.credit && line.credit > 0) {
                await client.query(`
                    UPDATE funds
                    SET balance = balance - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.credit, line.fund_id]);
            }
        }
        
        await client.query('COMMIT');
        
        // Get the complete journal entry with lines
        const { rows } = await pool.query(`
            SELECT je.*, 
                   e.name as entity_name,
                   te.name as target_entity_name
            FROM journal_entries je
            LEFT JOIN entities e ON je.entity_id = e.id
            LEFT JOIN entities te ON je.target_entity_id = te.id
            WHERE je.id = $1
        `, [journalEntryId]);
        
        // Get the lines
        const linesResult = await pool.query(`
            SELECT jel.*, 
                   a.name as account_name,
                   a.code as account_code,
                   f.name as fund_name,
                   f.code as fund_code
            FROM journal_entry_items jel
            LEFT JOIN accounts a ON jel.account_id = a.id
            LEFT JOIN funds f ON jel.fund_id = f.id
            WHERE jel.journal_entry_id = $1
            ORDER BY jel.id
        `, [journalEntryId]);
        
        const result = rows[0];
        result.lines = linesResult.rows;
        
        res.status(201).json(result);
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

/**
 * PUT /api/journal-entries/:id
 * Updates an existing journal entry
 * Note: This only updates the header, not the lines
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        entity_id,
        target_entity_id,
        entry_date,
        reference_number,
        description,
        status,
        is_inter_entity
    } = req.body;
    
    // Validate required fields
    if (!entity_id) {
        return res.status(400).json({ error: 'Entity ID is required' });
    }
    
    if (!entry_date) {
        return res.status(400).json({ error: 'Entry date is required' });
    }
    
    // Check if journal entry exists
    const entryCheck = await pool.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
    if (entryCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Journal entry not found' });
    }
    
    // Update the journal entry (header only)
    const { rows } = await pool.query(`
        UPDATE journal_entries
        SET entity_id = $1,
            target_entity_id = $2,
            entry_date = $3,
            reference_number = $4,
            description = $5,
            status = $6,
            is_inter_entity = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        entity_id,
        target_entity_id,
        entry_date,
        reference_number,
        description,
        status,
        is_inter_entity,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/journal-entries/:id
 * Deletes a journal entry and its lines
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Start a transaction to delete the journal entry and its lines
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Get the journal entry lines to reverse account and fund balances
        const linesResult = await client.query(`
            SELECT * FROM journal_entry_items WHERE journal_entry_id = $1
        `, [id]);
        
        if (linesResult.rows.length === 0) {
            // No lines found, check if the journal entry exists
            const entryCheck = await client.query('SELECT id FROM journal_entries WHERE id = $1', [id]);
            if (entryCheck.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Journal entry not found' });
            }
        }
        
        // Reverse account and fund balances
        for (const line of linesResult.rows) {
            // Reverse account balances
            if (line.debit && line.debit > 0) {
                await client.query(`
                    UPDATE accounts
                    SET balance = balance - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.debit, line.account_id]);
            }
            
            if (line.credit && line.credit > 0) {
                await client.query(`
                    UPDATE accounts
                    SET balance = balance + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.credit, line.account_id]);
            }
            
            // Reverse fund balances
            if (line.debit && line.debit > 0) {
                await client.query(`
                    UPDATE funds
                    SET balance = balance - $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.debit, line.fund_id]);
            }
            
            if (line.credit && line.credit > 0) {
                await client.query(`
                    UPDATE funds
                    SET balance = balance + $1,
                        updated_at = NOW()
                    WHERE id = $2
                `, [line.credit, line.fund_id]);
            }
        }
        
        // Delete the journal entry lines
        await client.query('DELETE FROM journal_entry_items WHERE journal_entry_id = $1', [id]);
        
        // Delete the journal entry
        const result = await client.query('DELETE FROM journal_entries WHERE id = $1 RETURNING id', [id]);
        
        await client.query('COMMIT');
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Journal entry not found' });
        }
        
        res.status(204).send();
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}));

module.exports = router;
