// src/routes/vendors.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

/**
 * GET /api/vendors
 * Returns all vendors ordered by name.
 */
router.get('/', asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM vendors ORDER BY name'
  );
  res.json(rows);
}));

/**
 * POST /api/vendors
 * Creates a new vendor.
 */
router.post('/', asyncHandler(async (req, res) => {
  const {
    name,
    name_detail,
    contact_name,
    email,
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
    account_type,
    payment_type,
    status,
    notes
  } = req.body;

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `INSERT INTO vendors
      (name, name_detail, contact_name, email,
       street_1, street_2, city, state, zip, country,
       tax_id, vendor_type, subject_to_1099,
       bank_account_type, bank_routing_number, bank_account_number,
       account_type, payment_type,
       status, notes)
     VALUES ($1,$2,$3,$4,
             $5,$6,$7,$8,$9,$10,
             $11,$12,$13,
             $14,$15,$16,
             $17,$18,
             $19,$20)
     RETURNING *`,
    [
      name,
      name_detail,
      contact_name,
      email,
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
      account_type,
      payment_type,
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
    name,
    name_detail,
    contact_name,
    email,
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
    account_type,
    payment_type,
    status,
    notes
  } = req.body;

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `UPDATE vendors
        SET name                 = $1,
            name_detail          = $2,
            contact_name         = $3,
            email                = $4,
            street_1             = $5,
            street_2             = $6,
            city                 = $7,
            state                = $8,
            zip                  = $9,
            country              = $10,
            tax_id               = $11,
            vendor_type          = $12,
            subject_to_1099      = $13,
            bank_account_type    = $14,
            bank_routing_number  = $15,
            bank_account_number  = $16,
            account_type         = $17,
            payment_type         = $18,
            status               = $19,
            notes                = $20
      WHERE id = $21
      RETURNING *`,
    [
      name,
      name_detail,
      contact_name,
      email,
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
      account_type,
      payment_type,
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
