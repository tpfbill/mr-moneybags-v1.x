// src/routes/users.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/users
 * Returns all users
 */
router.get('/', asyncHandler(async (req, res) => {
    const { status, role } = req.query;
    
    let query = 'SELECT * FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(status);
    }
    
    if (role) {
        query += ` AND role = $${paramIndex++}`;
        params.push(role);
    }
    
    query += ' ORDER BY name';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/users/:id
 * Returns a specific user by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/users
 * Creates a new user
 */
router.post('/', asyncHandler(async (req, res) => {
    const { name, email, role, status } = req.body;
    
    // Validate required fields
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Email already exists',
            details: 'A user with this email address already exists in the system'
        });
    }
    
    const { rows } = await pool.query(
        'INSERT INTO users (name, email, role, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, email, role || 'User', status || 'Active']
    );
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/users/:id
 * Updates an existing user
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, role, status } = req.body;
    
    // Validate required fields
    if (!name) {
        return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if email already exists (for another user)
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
    if (emailCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Email already exists',
            details: 'Another user with this email address already exists in the system'
        });
    }
    
    const { rows } = await pool.query(
        'UPDATE users SET name = $1, email = $2, role = $3, status = $4, updated_at = NOW() WHERE id = $5 RETURNING *',
        [name, email, role, status, id]
    );
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/users/:id
 * Deletes a user
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if this is the last admin user
    const adminCheck = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['Admin']);
    if (adminCheck.rows[0].count <= 1) {
        const userRole = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (userRole.rows[0].role === 'Admin') {
            return res.status(409).json({ 
                error: 'Cannot delete last admin user',
                details: 'At least one admin user must remain in the system'
            });
        }
    }
    
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    res.status(204).send();
}));

module.exports = router;
