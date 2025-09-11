// src/routes/gl-codes.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/gl-codes
 * Returns all GL codes.
 */
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT * 
        FROM gl_codes
        ORDER BY 1
    `);
    
    res.json(rows);
}));

module.exports = router;
