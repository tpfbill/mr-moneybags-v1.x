// src/routes/nacha-files.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);
const mkdirAsync = promisify(fs.mkdir);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads/nacha');

// Ensure uploads directory exists
const ensureUploadsDir = async () => {
    try {
        await mkdirAsync(uploadsDir, { recursive: true });
        console.log('NACHA uploads directory created or already exists');
    } catch (err) {
        console.error('Error creating NACHA uploads directory:', err);
    }
};

// Ensure uploads directory exists when module is loaded
ensureUploadsDir();

// Helper function for async route handlers
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};



/**
 * GET /api/nacha-files
 * Returns all NACHA files with optional filtering
 */
router.get('/', asyncHandler(async (req, res) => {
    const { entity_id, status, payment_batch_id } = req.query;
    
    let query = `
        SELECT nf.*,
               e.name              AS entity_name,
               pb.batch_number     AS related_batch_number
        FROM nacha_files nf
        LEFT JOIN payment_batches pb ON pb.id = nf.payment_batch_id
        LEFT JOIN entities        e  ON e.id  = pb.entity_id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (entity_id) {
        params.push(entity_id);
        // nacha_files does not hold entity_id directly,
        // filter via the linked payment_batches record.
        query += ` AND pb.entity_id = $${params.length}`;
    }
    
    if (status) {
        params.push(status);
        query += ` AND nf.status = $${params.length}`;
    }
    if (payment_batch_id) {
        params.push(payment_batch_id);
        query += ` AND nf.payment_batch_id = $${params.length}`;
    }
    
    query += ` ORDER BY nf.created_at DESC`;
    
    const { rows } = await pool.query(query, params);
    res.json(rows);
}));

/**
 * GET /api/nacha-files/:id
 * Returns a specific NACHA file by ID
 */
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    const { rows } = await pool.query(`
        SELECT nf.*,
               e.name          AS entity_name,
               pb.batch_number AS related_batch_number
        FROM nacha_files nf
        LEFT JOIN payment_batches pb ON pb.id = nf.payment_batch_id
        LEFT JOIN entities        e  ON e.id  = pb.entity_id
        WHERE nf.id = $1
    `, [id]);
    
    if (rows.length === 0) {
        return res.status(404).json({ error: 'NACHA file not found' });
    }
    
    res.json(rows[0]);
}));

/**
 * POST /api/nacha-files
 * Creates a new NACHA file record
 */
router.post('/', asyncHandler(async (req, res) => {
    const {
        payment_batch_id,
        file_name,
        file_content,
        batch_number,
        file_date,
        total_amount,
        total_items,
        file_control_total,
        status,
        transmitted_at,
        transmitted_by
    } = req.body;
    
    // Validate required fields
    if (!file_name) {
        return res.status(400).json({ error: 'File name is required' });
    }
    
    if (!file_content) {
        return res.status(400).json({ error: 'File content is required' });
    }
    
    // Generate unique file path
    const timestamp = Date.now();
    const fileName = `${timestamp}_${file_name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(uploadsDir, fileName);
    
    // Save file content to disk
    const fileBuffer = Buffer.from(file_content, 'base64');
    await writeFileAsync(filePath, fileBuffer);
    
    // Insert record into database
    const { rows } = await pool.query(`
        INSERT INTO nacha_files (
            payment_batch_id,
            file_name,
            file_path,
            file_date,
            total_amount,
            total_items,
            file_control_total,
            status,
            transmitted_at,
            transmitted_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *
    `, [
        payment_batch_id,
        file_name,
        filePath,
        file_date || new Date(),
        total_amount || 0,
        total_items || 0,
        file_control_total || 0,
        status || 'draft',
        transmitted_at || null,
        transmitted_by || null
    ]);
    
    res.status(201).json(rows[0]);
}));

/**
 * PUT /api/nacha-files/:id
 * Updates a NACHA file's metadata
 */
router.put('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        payment_batch_id,
        file_name,
        file_date,
        total_amount,
        total_items,
        file_control_total,
        status
    } = req.body;
    
    // Check if file exists
    const checkResult = await pool.query('SELECT * FROM nacha_files WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
        return res.status(404).json({ error: 'NACHA file not found' });
    }
    
    // Update record
    const { rows } = await pool.query(`
        UPDATE nacha_files
        SET payment_batch_id   = COALESCE($1, payment_batch_id),
            file_name          = COALESCE($2, file_name),
            file_date          = COALESCE($3, file_date),
            total_amount       = COALESCE($4, total_amount),
            total_items        = COALESCE($5, total_items),
            file_control_total = COALESCE($6, file_control_total),
            status             = COALESCE($7, status),
            updated_at = NOW()
        WHERE id = $8
        RETURNING *
    `, [
        payment_batch_id,
        file_name,
        file_date,
        total_amount,
        total_items,
        file_control_total,
        status,
        id
    ]);
    
    res.json(rows[0]);
}));

/**
 * DELETE /api/nacha-files/:id
 * Deletes a NACHA file
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get file info before deletion
    const fileResult = await pool.query('SELECT file_path FROM nacha_files WHERE id = $1', [id]);
    if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'NACHA file not found' });
    }
    
    const filePath = fileResult.rows[0].file_path;
    
    // Delete from database
    await pool.query('DELETE FROM nacha_files WHERE id = $1', [id]);
    
    // Delete file from disk
    try {
        await unlinkAsync(filePath);
    } catch (err) {
        console.error(`Error deleting file ${filePath}:`, err);
        // Continue even if file deletion fails
    }
    
    res.status(204).send();
}));

/**
 * GET /api/nacha-files/:id/download
 * Downloads a NACHA file
 */
router.get('/:id/download', asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    // Get file info
    const fileResult = await pool.query('SELECT file_name, file_path FROM nacha_files WHERE id = $1', [id]);
    if (fileResult.rows.length === 0) {
        return res.status(404).json({ error: 'NACHA file not found' });
    }
    
    const { file_name, file_path } = fileResult.rows[0];
    
    try {
        // Check if file exists on disk
        await fs.promises.access(file_path, fs.constants.F_OK);
        
        // Set headers
        res.setHeader('Content-Disposition', `attachment; filename="${file_name}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        
        // Stream file to response
        const fileStream = fs.createReadStream(file_path);
        fileStream.pipe(res);
    } catch (err) {
        console.error(`Error accessing file ${file_path}:`, err);
        res.status(404).json({ error: 'File not found on disk' });
    }
}));

module.exports = router;
