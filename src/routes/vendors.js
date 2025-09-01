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
    name_detail,
    contact_name,
    email,
    phone,
    street_1,
    street_2,
    city,
    state,
    zip,
    country,
    tax_id,
    vendor_type,
    subject_to_1099,
    bank_account_type,
    bank_routing_number,
    bank_account_number,
    status,
    notes
  } = req.body;

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `INSERT INTO vendors
      (entity_id, vendor_code, name, name_detail, contact_name, email, phone,
       street_1, street_2, city, state, zip, country,
       tax_id, vendor_type, subject_to_1099,
       bank_account_type, bank_routing_number, bank_account_number,
       status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,
             $8,$9,$10,$11,$12,$13,
             $14,$15,$16,
             $17,$18,$19,
             $20,$21)
     RETURNING *`,
    [
      entity_id,
      vendor_code,
      name,
      name_detail,
      contact_name,
      email,
      phone,
      street_1,
      street_2,
      city,
      state,
      zip,
      country ?? 'USA',
      tax_id,
      vendor_type,
      subject_to_1099 ?? false,
      bank_account_type,
      bank_routing_number,
      bank_account_number,
      statusVal,
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
    name_detail,
    contact_name,
    email,
    phone,
    street_1,
    street_2,
    city,
    state,
    zip,
    country,
    tax_id,
    vendor_type,
    subject_to_1099,
    bank_account_type,
    bank_routing_number,
    bank_account_number,
    status,
    notes
  } = req.body;

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `UPDATE vendors
        SET entity_id            = $1,
            vendor_code          = $2,
            name                 = $3,
            name_detail          = $4,
            contact_name         = $5,
            email                = $6,
            phone                = $7,
            street_1             = $8,
            street_2             = $9,
            city                 = $10,
            state                = $11,
            zip                  = $12,
            country              = $13,
            tax_id               = $14,
            vendor_type          = $15,
            subject_to_1099      = $16,
            bank_account_type    = $17,
            bank_routing_number  = $18,
            bank_account_number  = $19,
            status               = $20,
            notes                = $21,
            updated_at           = NOW()
      WHERE id = $22
      RETURNING *`,
    [
      entity_id,
      vendor_code,
      name,
      name_detail,
      contact_name,
      email,
      phone,
      street_1,
      street_2,
      city,
      state,
      zip,
      country ?? 'USA',
      tax_id,
      vendor_type,
      subject_to_1099 ?? false,
      bank_account_type,
      bank_routing_number,
      bank_account_number,
      statusVal,
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

module.exports = router;
