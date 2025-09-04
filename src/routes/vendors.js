// src/routes/vendors.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// ---------------------------------------------------------------------------
// File-upload helper (in-memory storage – no temp files)
// ---------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage() });

// ---------------------------------------------------------------------------
// Normalisers for CSV fields
// ---------------------------------------------------------------------------
function normalizeStatus(v) {
  const s = (v || '').toString().trim().toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
}

function normalizeBool1099(v) {
  if (v === true || v === false) return v;
  const val = (v || '').toString().trim().toLowerCase();
  return val === '1' || val === 'yes' || val === 'y' ? true : false;
}

function normalizeAccountType(v) {
  const t = (v || '').toString().trim().toLowerCase();
  return t === 'business' ? 'Business' : 'Individual';
}

const VALID_PMT = ['eft', 'check', 'paypal', 'autodraft', 'cap one', 'convera'];
function normalizePaymentType(v) {
  const t = (v || '').toString().trim().toLowerCase();
  if (!t) return null;
  if (!VALID_PMT.includes(t)) return null;
  // Title-case except special 'cap one'
  return t === 'cap one' ? 'Cap One' : t.charAt(0).toUpperCase() + t.slice(1);
}

function toDateYYYYMMDD(v) {
  // Expect YYYY-MM-DD or blank; fallback today
  const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v) : new Date();
  return d.toISOString().split('T')[0];
}

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

// ---------------------------------------------------------------------------
// POST /api/vendors/import  (CSV upload)
// ---------------------------------------------------------------------------
router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const csv = req.file.buffer.toString('utf8');

    let records;
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (err) {
      return res
        .status(400)
        .json({ error: 'Invalid CSV format', message: err.message });
    }

    let inserted = 0,
      updated = 0,
      failed = 0;
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      try {
        const name = (r.name || '').trim();
        if (!name) throw new Error('Missing name');

        const idCandidate = (r.id || '').toString().trim() || null;
        const row = {
          name,
          name_detail: (r.name_detail || '').trim() || null,
          contact_name: null,
          email: (r.email || '').trim() || null,
          street_1: (r.street_1 || '').trim() || null,
          street_2: (r.street_2 || '').trim() || null,
          city: (r.city || '').trim() || null,
          state: (r.state || '').trim() || null,
          zip: (r.zip || '').trim() || null,
          country: (r.country || '').trim() || 'USA',
          tax_id: (r.tax_id || '').trim() || null,
          vendor_type: (r.vendor_type || '').trim() || null,
          subject_to_1099: normalizeBool1099(r.subject_to_1099),
          bank_account_type: (r.bank_account_type || '').trim() || null,
          bank_routing_number: (r.bank_routing_number || '').trim() || null,
          bank_account_number: (r.bank_account_number || '').trim() || null,
          last_used: toDateYYYYMMDD(r.last_used),
          status: normalizeStatus(r.status),
          account_type: normalizeAccountType(r.account_type),
          payment_type: normalizePaymentType(r.payment_type)
        };

        if (idCandidate) {
          // Upsert by explicit ID
          const byId = await pool.query('SELECT id FROM vendors WHERE id = $1 LIMIT 1', [idCandidate]);
          if (byId.rows.length) {
            await pool.query(
              `UPDATE vendors
                 SET name=$1, name_detail=$2, contact_name=$3, email=$4,
                     street_1=$5, street_2=$6, city=$7, state=$8, zip=$9, country=$10,
                     tax_id=$11, vendor_type=$12, subject_to_1099=$13,
                     bank_account_type=$14, bank_routing_number=$15, bank_account_number=$16,
                     last_used=$17, status=$18, account_type=$19, payment_type=$20
               WHERE id=$21`,
              [...Object.values(row), idCandidate]
            );
            updated++;
          } else {
            await pool.query(
              `INSERT INTO vendors
                (id, name, name_detail, contact_name, email,
                 street_1, street_2, city, state, zip, country,
                 tax_id, vendor_type, subject_to_1099,
                 bank_account_type, bank_routing_number, bank_account_number,
                 last_used, status, account_type, payment_type)
               VALUES ($1,$2,$3,$4,$5,
                       $6,$7,$8,$9,$10,$11,
                       $12,$13,$14,
                       $15,$16,$17,
                       $18,$19,$20,$21)`,
              [idCandidate, ...Object.values(row)]
            );
            inserted++;
          }
        } else {
          // Fallback upsert by name (case-insensitive)
          const existing = await pool.query('SELECT id FROM vendors WHERE LOWER(name) = LOWER($1) LIMIT 1', [row.name]);
          if (existing.rows.length) {
            const id = existing.rows[0].id;
            await pool.query(
              `UPDATE vendors
                 SET name=$1, name_detail=$2, contact_name=$3, email=$4,
                     street_1=$5, street_2=$6, city=$7, state=$8, zip=$9, country=$10,
                     tax_id=$11, vendor_type=$12, subject_to_1099=$13,
                     bank_account_type=$14, bank_routing_number=$15, bank_account_number=$16,
                     last_used=$17, status=$18, account_type=$19, payment_type=$20
               WHERE id=$21`,
              [...Object.values(row), id]
            );
            updated++;
          } else {
            await pool.query(
              `INSERT INTO vendors
                (name, name_detail, contact_name, email,
                 street_1, street_2, city, state, zip, country,
                 tax_id, vendor_type, subject_to_1099,
                 bank_account_type, bank_routing_number, bank_account_number,
                 last_used, status, account_type, payment_type)
               VALUES ($1,$2,$3,$4,
                       $5,$6,$7,$8,$9,$10,
                       $11,$12,$13,
                       $14,$15,$16,
                       $17,$18,$19,$20)`,
              Object.values(row)
            );
            inserted++;
          }
        }
      } catch (err) {
        failed++;
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    res.json({
      total: records.length,
      inserted,
      updated,
      failed,
      sampleErrors: errors.slice(0, 20)
    });
  })
);

module.exports = router;
