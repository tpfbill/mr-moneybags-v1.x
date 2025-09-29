// src/routes/gl-codes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { parse } = require('csv-parse/sync');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/gl-codes
 * Returns all GL codes.
 */
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(`
        SELECT id, code, description, classification, created_at, updated_at
          FROM gl_codes
         ORDER BY LOWER(code)
    `);
    res.json(rows);
}));

/**
 * POST /api/gl-codes
 * Create a new GL code
 */
router.post('/', asyncHandler(async (req, res) => {
    const { code, description, classification } = req.body || {};
    if (!code || !String(code).trim()) {
        return res.status(400).json({ error: 'Code is required' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO gl_codes (code, description, classification)
             VALUES ($1, $2, $3)
             ON CONFLICT ((LOWER(code))) DO UPDATE
                 SET description = EXCLUDED.description,
                     classification = EXCLUDED.classification,
                     updated_at = NOW()
             RETURNING id, code, description, classification, created_at, updated_at`,
            [String(code).trim(), description ?? null, classification ?? null]
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        console.error('[GL Codes] Create error:', err);
        res.status(500).json({ error: 'Failed to create GL code' });
    }
}));

/**
 * PUT /api/gl-codes/:id
 * Update existing GL code by id
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { code, description, classification } = req.body || {};
    if (!code || !String(code).trim()) {
        return res.status(400).json({ error: 'Code is required' });
    }

    try {
        const { rows } = await pool.query(
            `UPDATE gl_codes
                SET code = $1,
                    description = $2,
                    classification = $3,
                    updated_at = NOW()
              WHERE id = $4
          RETURNING id, code, description, classification, created_at, updated_at`,
            [String(code).trim(), description ?? null, classification ?? null, id]
        );

        if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
        res.json(rows[0]);
    } catch (err) {
        console.error('[GL Codes] Update error:', err);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'Code already exists' });
        }
        res.status(500).json({ error: 'Failed to update GL code' });
    }
}));

/**
 * DELETE /api/gl-codes/:id
 * Delete a GL code
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('DELETE FROM gl_codes WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true });
    } catch (err) {
        console.error('[GL Codes] Delete error:', err);
        res.status(500).json({ error: 'Failed to delete GL code' });
    }
}));

/**
 * POST /api/gl-codes/import
 * CSV import endpoint. Expects a multipart file field named "file".
 * Columns supported (case-insensitive): code, description, classification|class
 */
router.post('/import', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    let records = [];
    try {
        records = parse(req.file.buffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });
    } catch (err) {
        console.error('[GL Codes] CSV parse error:', err);
        return res.status(400).json({ error: 'Invalid CSV' });
    }

    const client = await pool.connect();
    let inserted = 0, updated = 0, failed = 0;
    const errors = [];

    try {
        await client.query('BEGIN');

        for (const row of records) {
            const code = (row.code || row.GLCode || row.gl_code || row.glcode || row.GL_CODE || row["GL Code"])?.toString().trim();
            const description = (row.description || row.desc || row["Description"])?.toString().trim() || null;
            const classification = (row.classification || row.class || row["Classification"])?.toString().trim() || null;

            if (!code) { failed++; errors.push('Missing code'); continue; }

            try {
                const { rows: existing } = await client.query(
                    'SELECT id FROM gl_codes WHERE LOWER(code) = LOWER($1) LIMIT 1',
                    [code]
                );

                if (existing.length === 0) {
                    await client.query(
                        `INSERT INTO gl_codes (code, description, classification)
                         VALUES ($1, $2, $3)`,
                        [code, description, classification]
                    );
                    inserted++;
                } else {
                    await client.query(
                        `UPDATE gl_codes
                            SET description = $2,
                                classification = $3,
                                updated_at = NOW()
                          WHERE id = $1`,
                        [existing[0].id, description, classification]
                    );
                    updated++;
                }
            } catch (rowErr) {
                console.error('[GL Codes] Import row error:', rowErr);
                failed++;
                errors.push(rowErr.message);
            }
        }

        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[GL Codes] Import transaction error:', err);
        return res.status(500).json({ error: 'Import failed' });
    } finally {
        client.release();
    }

    res.json({ inserted, updated, failed, errors });
}));

module.exports = router;
