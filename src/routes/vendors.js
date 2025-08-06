// src/routes/vendors.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/vendors
 * Returns all vendors ordered by code then name.
 */
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM vendors ORDER BY vendor_code, name'
  );
  res.json(rows);
}));

/**
 * POST /api/vendors
 * Creates a new vendor.
 */
router.post('/', asyncHandler(async (req, res) => {
  const {
    entity_id,
    vendor_code,
    name,
    contact_name,
    email,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    tax_id,
    vendor_type,
    status,
    notes
  } = req.body;

  const { rows } = await pool.query(
    `INSERT INTO vendors
      (entity_id, vendor_code, name, contact_name, email, phone,
       address_line1, address_line2, city, state, postal_code, country,
       tax_id, vendor_type, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     RETURNING *`,
    [
      entity_id,
      vendor_code,
      name,
      contact_name,
      email,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country ?? 'USA',
      tax_id,
      vendor_type,
      status ?? 'active',
      notes || ''
    ]
  );
  res.status(201).json(rows[0]);
}));

/**
 * PUT /api/vendors/:id
 * Updates an existing vendor.
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    entity_id,
    vendor_code,
    name,
    contact_name,
    email,
    phone,
    address_line1,
    address_line2,
    city,
    state,
    postal_code,
    country,
    tax_id,
    vendor_type,
    status,
    notes
  } = req.body;

  const { rows } = await pool.query(
    `UPDATE vendors
        SET entity_id     = $1,
            vendor_code   = $2,
            name          = $3,
            contact_name  = $4,
            email         = $5,
            phone         = $6,
            address_line1 = $7,
            address_line2 = $8,
            city          = $9,
            state         = $10,
            postal_code   = $11,
            country       = $12,
            tax_id        = $13,
            vendor_type   = $14,
            status        = $15,
            notes         = $16,
            updated_at    = NOW()
      WHERE id = $17
      RETURNING *`,
    [
      entity_id,
      vendor_code,
      name,
      contact_name,
      email,
      phone,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country ?? 'USA',
      tax_id,
      vendor_type,
      status ?? 'active',
      notes || '',
      id
    ]
  );
  res.json(rows[0]);
}));

/**
 * DELETE /api/vendors/:id
 * Deletes a vendor.
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await pool.query('DELETE FROM vendors WHERE id = $1', [id]);
  res.status(204).send();
}));

/**
 * GET /api/vendors/:id/bank-accounts
 * Returns bank accounts for a specific vendor.
 */
router.get('/:id/bank-accounts', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query(
    `SELECT * FROM vendor_bank_accounts 
     WHERE vendor_id = $1
     ORDER BY is_primary DESC, account_name`,
    [id]
  );
  res.json(rows);
}));

module.exports = router;
