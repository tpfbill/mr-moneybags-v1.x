// src/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const { getUserById, requireAuth } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Login endpoint that validates credentials and creates session
 */
router.post('/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
        return res.status(400).json({ 
            error: 'Username and password are required' 
        });
    }
    
    // Find user by username
    const userResult = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [username]
    );
    
    if (userResult.rows.length === 0) {
        return res.status(401).json({ 
            error: 'Invalid username or password' 
        });
    }
    
    const user = userResult.rows[0];
    
    // Check if user is active
    if ((user.status || '').toLowerCase() !== 'active') {
        return res.status(401).json({ 
            error: 'Account is inactive. Please contact an administrator.' 
        });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordMatch) {
        return res.status(401).json({ 
            error: 'Invalid username or password' 
        });
    }
    
    // Create session
    req.session.userId = user.id;
    
    // Update last login timestamp
    await pool.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
    );
    
    // Return user info (excluding password)
    const { password_hash, ...userInfo } = user;
    
    // Add display name
    userInfo.name = `${user.first_name} ${user.last_name}`.trim();
    
    res.json({
        message: 'Login successful',
        user: userInfo
    });
}));

/**
 * POST /api/auth/logout
 * Logout endpoint that destroys session
 */
router.post('/logout', asyncHandler(async (req, res) => {
    // Destroy session
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ 
                error: 'Failed to logout. Please try again.' 
            });
        }
        
        res.json({ 
            message: 'Logout successful' 
        });
    });
}));

/**
 * GET /api/auth/user
 * Get current authenticated user info
 */
router.get('/user', asyncHandler(async (req, res) => {
    // Check if user is authenticated
    if (!req.session || !req.session.userId) {
        return res.status(401).json({ 
            error: 'Not authenticated',
            authenticated: false
        });
    }
    
    // Get user from database
    const user = await getUserById(req.session.userId);
    
    if (!user) {
        // Clear invalid session
        req.session.destroy();
        
        return res.status(401).json({ 
            error: 'User not found',
            authenticated: false
        });
    }
    
    // Return user info
    res.json({
        authenticated: true,
        user
    });
}));

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    
    // Validate input
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ 
            error: 'Current password and new password are required' 
        });
    }
    
    // Validate password strength
    if (newPassword.length < 8) {
        return res.status(400).json({ 
            error: 'New password must be at least 8 characters long' 
        });
    }
    
    // Get user with password hash
    const userResult = await pool.query(
        'SELECT * FROM users WHERE id = $1',
        [req.session.userId]
    );
    
    if (userResult.rows.length === 0) {
        return res.status(404).json({ 
            error: 'User not found' 
        });
    }
    
    const user = userResult.rows[0];
    
    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!passwordMatch) {
        return res.status(401).json({ 
            error: 'Current password is incorrect' 
        });
    }
    
    // Hash new password
    const saltRounds = 10;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
    
    // Update password in database
    await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newPasswordHash, user.id]
    );
    
    res.json({ 
        message: 'Password changed successfully' 
    });
}));

module.exports = router;
