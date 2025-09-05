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
  return val === '1' || val === 'yes' || val === 'y' || val === 'true' ? true : false;
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

// ---------------------------------------------------------------------------
// CSV header / record normalisation
// ---------------------------------------------------------------------------
function normalizeHeaderKey(key) {
  return (key || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')      // spaces / punctuation -> underscore
    .replace(/^_+|_+$/g, '');         // trim underscores
}

// Build once – map of normalised header -> canonical field
const HEADER_ALIAS_MAP = (() => {
  const map = new Map();
  // canonical list
  const CANON = [
    'zid', 'name', 'name_detail', 'email', 'street_1', 'street_2', 'city', 'state',
    'zip', 'country', 'tax_id', 'vendor_type', 'subject_to_1099', 'bank_account_type',
    'bank_routing_number', 'bank_account_number', 'last_used', 'status',
    'account_type', 'payment_type'
  ];
  // self-map
  CANON.forEach(k => map.set(k, k));

  // common aliases
  const aliases = {
    zid: ['id', 'vendor_id', 'vendorid'],
    name: ['vendor_name', 'vendorname'],
    name_detail: ['name_detail', 'name_details', 'namedetail', 'vendor_name_detail'],
    tax_id: ['taxid', 'tax_id_number', 'tin'],
    subject_to_1099: ['subject_to_1099', 'subject1099', 'subject_to1099', '1099'],
    bank_account_type: ['bank_acct_type', 'acct_type'],
    bank_account_number: ['bank_acct_number', 'acct_number'],
    bank_routing_number: ['bank_routing', 'routing_number'],
    account_type: ['acct_type_vendor', 'accounttype'],
    payment_type: ['paymenttype', 'pay_type']
  };
  Object.entries(aliases).forEach(([canon, arr]) => {
    arr.forEach(a => map.set(normalizeHeaderKey(a), canon));
  });
  return map;
})();

function normalizeCsvRecord(rec) {
  const out = {};
  for (const [rawKey, val] of Object.entries(rec)) {
    const normKey = normalizeHeaderKey(rawKey);
    const canon   = HEADER_ALIAS_MAP.get(normKey);
    if (canon) out[canon] = val;
  }
  return out;
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
    zid,
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

  if (!zid || !zid.toString().trim()) {
    return res.status(400).json({ error: 'Missing zID' });
  }

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `INSERT INTO vendors
      (zid, name, name_detail, contact_name, email,
       street_1, street_2, city, state, zip, country,
       tax_id, vendor_type, subject_to_1099,
       bank_account_type, bank_routing_number, bank_account_number,
       account_type, payment_type,
       status, notes)
     VALUES ($1,$2,$3,$4,$5,
             $6,$7,$8,$9,$10,$11,
             $12,$13,$14,
             $15,$16,$17,
             $18,$19,
             $20,$21)
     RETURNING *`,
    [
      zid.toString().trim(),
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
    zid,
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

  if (!zid || !zid.toString().trim()) {
    return res.status(400).json({ error: 'Missing zID' });
  }

  const statusVal = status ? status.toLowerCase() : 'active';

  const { rows } = await pool.query(
    `UPDATE vendors
        SET zid                  = $1,
            name                 = $2,
            name_detail          = $3,
            contact_name         = $4,
            email                = $5,
            street_1             = $6,
            street_2             = $7,
            city                 = $8,
            state                = $9,
            zip                  = $10,
            country              = $11,
            tax_id               = $12,
            vendor_type          = $13,
            subject_to_1099      = $14,
            bank_account_type    = $15,
            bank_routing_number  = $16,
            bank_account_number  = $17,
            account_type         = $18,
            payment_type         = $19,
            status               = $20,
            notes                = $21
      WHERE id = $22
      RETURNING *`,
    [
      zid.toString().trim(),
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
      const rRaw = records[i];
      const rec = normalizeCsvRecord(rRaw);
      try {
        const name = (rec.name || '').trim();
        if (!name) throw new Error('Missing name');

        const zidCandidate = (rec.zid || '').toString().trim() || null;

        if (!zidCandidate) {
          throw new Error('Missing zID');
        }

        const row = {
          zid: zidCandidate,
          name,
          name_detail: (rec.name_detail || '').trim() || null,
          contact_name: null,
          email: (rec.email || '').trim() || null,
          street_1: (rec.street_1 || '').trim() || null,
          street_2: (rec.street_2 || '').trim() || null,
          city: (rec.city || '').trim() || null,
          state: (rec.state || '').trim() || null,
          zip: (rec.zip || '').trim() || null,
          country: (rec.country || '').trim() || 'USA',
          tax_id: (rec.tax_id || '').trim() || null,
          vendor_type: (rec.vendor_type || '').trim() || null,
          subject_to_1099: normalizeBool1099(rec.subject_to_1099),
          bank_account_type: (rec.bank_account_type || '').trim() || null,
          bank_routing_number: (rec.bank_routing_number || '').trim() || null,
          bank_account_number: (rec.bank_account_number || '').trim() || null,
          last_used: toDateYYYYMMDD(rec.last_used),
          status: normalizeStatus(rec.status),
          account_type: normalizeAccountType(rec.account_type),
          payment_type: normalizePaymentType(rec.payment_type)
        };

        // Upsert by zID (case-insensitive)
        const byZid = await pool.query(
          'SELECT id FROM vendors WHERE LOWER(zid) = LOWER($1) LIMIT 1',
          [zidCandidate]
        );

        if (byZid.rows.length) {
          const vid = byZid.rows[0].id;
          await pool.query(
            `UPDATE vendors
               SET zid=$1, name=$2, name_detail=$3, contact_name=$4, email=$5,
                   street_1=$6, street_2=$7, city=$8, state=$9, zip=$10, country=$11,
                   tax_id=$12, vendor_type=$13, subject_to_1099=$14,
                   bank_account_type=$15, bank_routing_number=$16, bank_account_number=$17,
                   last_used=$18, status=$19, account_type=$20, payment_type=$21
             WHERE id=$22`,
            [
              row.zid, row.name, row.name_detail, row.contact_name, row.email,
              row.street_1, row.street_2, row.city, row.state, row.zip, row.country,
              row.tax_id, row.vendor_type, row.subject_to_1099,
              row.bank_account_type, row.bank_routing_number, row.bank_account_number,
              row.last_used, row.status, row.account_type, row.payment_type,
              vid
            ]
          );
          updated++;
        } else {
          // Fallback upsert by name (case-insensitive)
          const existing = await pool.query('SELECT id FROM vendors WHERE LOWER(name) = LOWER($1) LIMIT 1', [row.name]);
          if (existing.rows.length) {
            const id = existing.rows[0].id;
            await pool.query(
              `UPDATE vendors
                 SET zid=$1, name=$2, name_detail=$3, contact_name=$4, email=$5,
                     street_1=$6, street_2=$7, city=$8, state=$9, zip=$10, country=$11,
                     tax_id=$12, vendor_type=$13, subject_to_1099=$14,
                     bank_account_type=$15, bank_routing_number=$16, bank_account_number=$17,
                     last_used=$18, status=$19, account_type=$20, payment_type=$21
               WHERE id=$22`,
              [
                row.zid, row.name, row.name_detail, row.contact_name, row.email,
                row.street_1, row.street_2, row.city, row.state, row.zip, row.country,
                row.tax_id, row.vendor_type, row.subject_to_1099,
                row.bank_account_type, row.bank_routing_number, row.bank_account_number,
                row.last_used, row.status, row.account_type, row.payment_type,
                id
              ]
            );
            updated++;
          } else {
            await pool.query(
              `INSERT INTO vendors
                (zid, name, name_detail, contact_name, email,
                 street_1, street_2, city, state, zip, country,
                 tax_id, vendor_type, subject_to_1099,
                 bank_account_type, bank_routing_number, bank_account_number,
                 last_used, status, account_type, payment_type)
               VALUES ($1,$2,$3,$4,$5,
                       $6,$7,$8,$9,$10,$11,
                       $12,$13,$14,
                       $15,$16,$17,
                       $18,$19,$20,$21)`,
              [
                row.zid, row.name, row.name_detail, row.contact_name, row.email,
                row.street_1, row.street_2, row.city, row.state, row.zip, row.country,
                row.tax_id, row.vendor_type, row.subject_to_1099,
                row.bank_account_type, row.bank_routing_number, row.bank_account_number,
                row.last_used, row.status, row.account_type, row.payment_type
              ]
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

// ---------------------------------------------------------------------------
// GET /api/vendors/export  – CSV download with zID first
// ---------------------------------------------------------------------------
router.get(
  '/export',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query('SELECT * FROM vendors ORDER BY name');

    const headers = [
      'zID',
      'name',
      'name_detail',
      'email',
      'street_1',
      'street_2',
      'city',
      'state',
      'zip',
      'country',
      'tax_id',
      'vendor_type',
      'subject_to_1099',
      'bank_account_type',
      'bank_routing_number',
      'bank_account_number',
      'last_used',
      'status',
      'account_type',
      'payment_type'
    ];

    const escapeCsv = (v) => {
      if (v === null || v === undefined) return '';
      const str = v.toString();
      return /[",\n]/.test(str)
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const lines = [
      headers.join(',')
    ];
    for (const r of rows) {
      const vals = [
        r.zid, r.name, r.name_detail, r.email, r.street_1, r.street_2, r.city, r.state, r.zip,
        r.country, r.tax_id, r.vendor_type, r.subject_to_1099, r.bank_account_type,
        r.bank_routing_number, r.bank_account_number, r.last_used, r.status, r.account_type, r.payment_type
      ].map(escapeCsv);
      lines.push(vals.join(','));
    }
    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=\"vendors-export.csv\"'
    );
    res.send(csv);
  })
);

module.exports = router;