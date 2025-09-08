// src/routes/entities.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/entities
 * Returns all entities, optionally filtered by parent_entity_id
 */
router.get('/', asyncHandler(async (req, res) => {
    const { parent_id } = req.query;
    
    let query = `
        SELECT e.*, 
               pe.name as parent_entity_name,
               (SELECT COUNT(*) FROM entities WHERE parent_entity_id = e.id) as child_count
        FROM entities e
        LEFT JOIN entities pe ON e.parent_entity_id = pe.id
        WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (parent_id) {
        if (parent_id === 'null') {
            query += ` AND e.parent_entity_id IS NULL`;
        } else {
            query += ` AND e.parent_entity_id = $${paramIndex++}`;
            params.push(parent_id);
        }
    }
    
    query += ` ORDER BY e.name`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * POST /api/entities
 * Creates a new entity
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        name,
        code,
        parent_entity_id,
        is_consolidated,
        fiscal_year_start,
        base_currency,
        status
    } = req.body;
    
    // Validate required fields
    if (!name) {
        return res.status(400).json({ error: 'Entity name is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Entity code is required' });
    }
    
    // Validate parent entity exists if provided
    if (parent_entity_id) {
        const parentCheck = await pool.query('SELECT id FROM entities WHERE id = $1', [parent_entity_id]);
        if (parentCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Parent entity not found' });
        }
    }
    
    const { rows } = await pool.query(`
        INSERT INTO entities (
            name,
            code,
            parent_entity_id,
            is_consolidated,
            fiscal_year_start,
            base_currency,
            status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
    `, [
        name,
        code,
        parent_entity_id,
        is_consolidated || false,
        fiscal_year_start,
        base_currency || 'USD',
        status || 'Active'
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/entities/:id
 * Updates an existing entity
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        name,
        code,
        parent_entity_id,
        is_consolidated,
        fiscal_year_start,
        base_currency,
        status
    } = req.body;
    
    // Validate required fields
    if (!name) {
        return res.status(400).json({ error: 'Entity name is required' });
    }
    
    if (!code) {
        return res.status(400).json({ error: 'Entity code is required' });
    }
    
    // Prevent circular references
    if (parent_entity_id === id) {
        return res.status(400).json({ error: 'Entity cannot be its own parent' });
    }
    
    // Validate parent entity exists if provided
    if (parent_entity_id) {
        const parentCheck = await pool.query('SELECT id FROM entities WHERE id = $1', [parent_entity_id]);
        if (parentCheck.rows.length === 0) {
            return res.status(400).json({ error: 'Parent entity not found' });
        }
        
        // Check for circular references in the hierarchy
        const isCircular = await checkCircularReference(pool, id, parent_entity_id);
        if (isCircular) {
            return res.status(400).json({ error: 'Circular reference detected in entity hierarchy' });
        }
    }
    
    const { rows } = await pool.query(`
        UPDATE entities
        SET name = $1,
            code = $2,
            parent_entity_id = $3,
            is_consolidated = $4,
            fiscal_year_start = $5,
            base_currency = $6,
            status = $7,
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        name,
        code,
        parent_entity_id,
        is_consolidated,
        fiscal_year_start,
        base_currency,
        status,
        id
    ]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'Entity not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/entities/:id
 * Deletes an entity if it has no dependencies
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check for child entities
    const childrenCheck = await pool.query('SELECT id FROM entities WHERE parent_entity_id = $1 LIMIT 1', [id]);
    if (childrenCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete entity with child entities',
            details: 'This entity has child entities that must be deleted or reassigned first'
        });
    }
    
    // Check for accounts
    const accountsCheck = await pool.query('SELECT id FROM accounts WHERE entity_id = $1 LIMIT 1', [id]);
    if (accountsCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete entity with accounts',
            details: 'This entity has accounts that must be deleted first'
        });
    }
    
    
    // Check for journal entries
    const journalCheck = await pool.query('SELECT id FROM journal_entries WHERE entity_id = $1 LIMIT 1', [id]);
    if (journalCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Cannot delete entity with journal entries',
            details: 'This entity has journal entries that must be deleted first'
        });
    }
    
    // If no dependencies, delete the entity
    const result = await pool.query('DELETE FROM entities WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Entity not found' });
    }
    
    res.status(204).send();
}));

/**
 * Helper function to check for circular references in entity hierarchy
 * @param {Pool} pool - Database connection pool
 * @param {string} entityId - Entity ID to check
 * @param {string} newParentId - Proposed parent entity ID
 * @returns {boolean} True if circular reference detected
 */
async function checkCircularReference(pool, entityId, newParentId) {
    let currentParentId = newParentId;
    const visited = new Set();
    
    while (currentParentId) {
        // If we've seen this parent before, we have a cycle
        if (visited.has(currentParentId)) {
            return true;
        }
        
        // If we reach the original entity, we have a cycle
        if (currentParentId === entityId) {
            return true;
        }
        
        visited.add(currentParentId);
        
        // Get the next parent up the chain
        const result = await pool.query('SELECT parent_entity_id FROM entities WHERE id = $1', [currentParentId]);
        
        if (result.rows.length === 0 || !result.rows[0].parent_entity_id) {
            // Reached the top of the hierarchy with no cycles
            return false;
        }
        
        currentParentId = result.rows[0].parent_entity_id;
    }
    
    return false;
}

module.exports = router;
