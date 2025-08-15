// src/routes/users.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const bcrypt = require('bcrypt');

/**
 * GET /api/users
 * Returns all users
 */
router.get('/', asyncHandler(async (req, res) => {
    const { status, role } = req.query;
    
    let query = 'SELECT *, CONCAT(first_name, \' \', last_name) AS name FROM users WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (status) {
        // Case-insensitive status filter
        query += ` AND lower(status) = lower($${paramIndex++})`;
        params.push(status);
    }
    
    if (role) {
        query += ` AND role = $${paramIndex++}`;
        params.push(role);
    }
    
    query += ' ORDER BY first_name, last_name';
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/users/:id
 * Returns a specific user by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(
        'SELECT *, CONCAT(first_name, \' \', last_name) AS name FROM users WHERE id = $1', 
        [id]
    );
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = rows[0];
    res.json(userWithoutPassword);
}));

/**
 * POST /api/users
 * Creates a new user
 */
router.post('/', asyncHandler(async (req, res) => {
    const { first_name, last_name, username, email, password, role, status } = req.body;

    // Normalize status to lowercase; default to 'active'
    const normalizedStatus = (status || 'active').toString().toLowerCase();
    
    // Validate required fields
    if (!first_name || !last_name) {
        return res.status(400).json({ error: 'First name and last name are required' });
    }
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!username) {
        return res.status(400).json({ error: 'Username is required' });
    }
    
    if (!password) {
        return res.status(400).json({ error: 'Password is required' });
    }
    
    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Email already exists',
            details: 'A user with this email address already exists in the system'
        });
    }
    
    // Check if username already exists
    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
        return res.status(409).json({ 
            error: 'Username already exists',
            details: 'A user with this username already exists in the system'
        });
    }
    
    // Hash the password
    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);
    
    const { rows } = await pool.query(
        `INSERT INTO users (
            username, password_hash, email, first_name, last_name, role, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [username, password_hash, email, first_name, last_name, role || 'user', normalizedStatus]
    );
    
    // Remove password hash from response
    const { password_hash: _, ...newUser } = rows[0];
    
    // Add display name
    newUser.name = `${newUser.first_name} ${newUser.last_name}`.trim();
    
    res.status(201).json(newUser);
}));

/**
 * PUT /api/users/:id
 * Updates an existing user
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { first_name, last_name, email, username, password, role, status } = req.body;
    
    // Check if user exists
    const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if email already exists (for another user)
    if (email) {
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, id]);
        if (emailCheck.rows.length > 0) {
            return res.status(409).json({ 
                error: 'Email already exists',
                details: 'Another user with this email address already exists in the system'
            });
        }
    }
    
    // Check if username already exists (for another user)
    if (username) {
        const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
        if (usernameCheck.rows.length > 0) {
            return res.status(409).json({ 
                error: 'Username already exists',
                details: 'Another user with this username already exists in the system'
            });
        }
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (first_name !== undefined) {
        updates.push(`first_name = $${paramIndex++}`);
        params.push(first_name);
    }
    
    if (last_name !== undefined) {
        updates.push(`last_name = $${paramIndex++}`);
        params.push(last_name);
    }
    
    if (email !== undefined) {
        updates.push(`email = $${paramIndex++}`);
        params.push(email);
    }
    
    if (username !== undefined) {
        updates.push(`username = $${paramIndex++}`);
        params.push(username);
    }
    
    if (password !== undefined) {
        // Hash the new password
        const saltRounds = 10;
        const password_hash = await bcrypt.hash(password, saltRounds);
        updates.push(`password_hash = $${paramIndex++}`);
        params.push(password_hash);
    }
    
    if (role !== undefined) {
        updates.push(`role = $${paramIndex++}`);
        params.push(role);
    }
    
    if (status !== undefined) {
        updates.push(`status = $${paramIndex++}`);
        // Normalize status to lowercase for consistency
        params.push(status?.toString().toLowerCase());
    }
    
    // Add updated_at timestamp
    updates.push(`updated_at = NOW()`);
    
    // If no fields to update, return the existing user
    if (updates.length === 1) { // Only updated_at
        const { rows } = await pool.query(
            'SELECT *, CONCAT(first_name, \' \', last_name) AS name FROM users WHERE id = $1',
            [id]
        );
        const { password_hash, ...userWithoutPassword } = rows[0];
        return res.json(userWithoutPassword);
    }
    
    // Add ID as the last parameter
    params.push(id);
    
    const { rows } = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} 
         RETURNING *, CONCAT(first_name, ' ', last_name) AS name`,
        params
    );
    
    // Remove password hash from response
    const { password_hash, ...updatedUser } = rows[0];
    
    res.json(updatedUser);
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
    const adminCheck = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = $1', ['admin']);
    if (adminCheck.rows[0].count <= 1) {
        const userRole = await pool.query('SELECT role FROM users WHERE id = $1', [id]);
        if (userRole.rows[0].role === 'admin') {
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
