// src/routes/accounts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const { parse } = require('csv-parse/sync');

// Multer – in-memory storage for CSV uploads
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------*/
function normalizeYN(v) {
  const t = (v || '').toString().trim().toLowerCase();
  if (!t) return 'No';
  return ['1', 'yes', 'y', 'true'].includes(t) ? 'Yes' : 'No';
}

function toDateYYYYMMDD(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function isValidDateYYYYMMDD(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function normalizeHeaderKey(key = '') {
  return key
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const REQUIRED_HEADERS = [
  'account_code',
  'entity_code',
  'gl_code',
  'fund_number',
  'description',
  'status',
  'balance_sheet',
  'beginning_balance',
  'beginning_balance_date',
  'last_used',
  'restriction',
  'classification'
];

function mapCsvRecordStrict(rec) {
  const out = {};
  Object.entries(rec).forEach(([k, v]) => {
    const canon = normalizeHeaderKey(k);
    if (REQUIRED_HEADERS.includes(canon)) out[canon] = v;
  });
  return out;
}

/* ---------------------------------------------------------------------------
 * GET /api/accounts
 * Optional query params: entity_code, gl_code, fund_number, status
 * -------------------------------------------------------------------------*/
router.get('/', asyncHandler(async (req, res) => {
  const { entity_code, gl_code, fund_number, status } = req.query;

  let query = 'SELECT * FROM accounts WHERE 1=1';
  const params = [];
  let i = 1;

  if (entity_code) { query += ` AND entity_code = $${i++}`; params.push(entity_code); }
  if (gl_code)     { query += ` AND gl_code = $${i++}`;     params.push(gl_code); }
  if (fund_number) { query += ` AND fund_number = $${i++}`; params.push(fund_number); }
  if (status)      { query += ` AND status = $${i++}`;      params.push(status); }

  query += ' ORDER BY account_code, description';

  const { rows } = await pool.query(query, params);
  res.json(rows);
}));

/* ---------------------------------------------------------------------------
 * POST /api/accounts
 * Create new account (new schema)
 * -------------------------------------------------------------------------*/
router.post('/', asyncHandler(async (req, res) => {
  const {
    entity_code,
    gl_code,
    fund_number,
    description,
    status,
    balance_sheet,
    beginning_balance,
    beginning_balance_date,
    last_used
  } = req.body;

  if (!entity_code) return res.status(400).json({ error: 'entity_code is required' });
  if (!gl_code)     return res.status(400).json({ error: 'gl_code is required' });
  if (!fund_number) return res.status(400).json({ error: 'fund_number is required' });
  if (!description) return res.status(400).json({ error: 'description is required' });

  const bbNum   = beginning_balance === '' || beginning_balance == null ? null : Number(beginning_balance);
  const bbDate  = toDateYYYYMMDD(beginning_balance_date);
  const lastUse = toDateYYYYMMDD(last_used);

  const { rows } = await pool.query(
    `INSERT INTO accounts
       (entity_code, gl_code, fund_number, description, status, balance_sheet,
        beginning_balance, beginning_balance_date, last_used)
     VALUES ($1,$2,$3,$4,$5,$6,
             COALESCE($7::numeric,0::numeric),
             COALESCE($8::date, CURRENT_DATE),
             COALESCE($9::date, CURRENT_DATE))
     RETURNING *`,
    [
      entity_code,
      gl_code,
      fund_number,
      description,
      status || 'Active',
      normalizeYN(balance_sheet),
      bbNum,
      bbDate,
      lastUse
    ]
  );

  res.status(201).json(rows[0]);
}));

/* ---------------------------------------------------------------------------
 * PUT /api/accounts/:id
 * Update account
 * -------------------------------------------------------------------------*/
router.put('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    entity_code,
    gl_code,
    fund_number,
    description,
    status,
    balance_sheet,
    beginning_balance,
    beginning_balance_date,
    last_used
  } = req.body;

  const chk = await pool.query('SELECT id FROM accounts WHERE id = $1', [id]);
  if (!chk.rows.length) return res.status(404).json({ error: 'Account not found' });

  if (!entity_code || !gl_code || !fund_number || !description) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const bbNum   = beginning_balance === '' || beginning_balance == null ? null : Number(beginning_balance);
  const bbDate  = toDateYYYYMMDD(beginning_balance_date);
  const lastUse = toDateYYYYMMDD(last_used);

  const { rows } = await pool.query(
    `UPDATE accounts
        SET entity_code            = $1,
            gl_code                = $2,
            fund_number            = $3,
            description            = $4,
            status                 = $5,
            balance_sheet          = $6,
            beginning_balance      = COALESCE($7::numeric, beginning_balance),
            beginning_balance_date = COALESCE($8::date, beginning_balance_date),
            last_used              = COALESCE($9::date, last_used)
      WHERE id = $10
      RETURNING *`,
    [
      entity_code,
      gl_code,
      fund_number,
      description,
      status || 'Active',
      normalizeYN(balance_sheet),
      bbNum,
      bbDate,
      lastUse,
      id
    ]
  );

  res.json(rows[0]);
}));

/* ---------------------------------------------------------------------------
 * POST /api/accounts/import  – CSV upload (stop-on-first-error)
 * -------------------------------------------------------------------------*/
router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let records;
    try {
      records = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (err) {
      return res.status(400).json({ error: 'Invalid CSV', details: err.message });
    }

    if (!records.length) {
      return res.status(400).json({ error: 'CSV has no data rows' });
    }

    /* ---------------------------------
     * Header validation
     * --------------------------------*/
    const hdrSet = new Set(
      Object.keys(records[0]).map(h => normalizeHeaderKey(h))
    );
    const missing = REQUIRED_HEADERS.filter(h => !hdrSet.has(h));
    if (missing.length) {
      return res
        .status(400)
        .json({ error: 'Missing required headers', details: missing });
    }

    /* ---------------------------------
     * Validation pass – stop on first error
     * --------------------------------*/
    const client = await pool.connect();
    const logLines = [];
    const nowStr = new Date()
      .toISOString()
      .replace(/[:T]/g, '')
      .split('.')[0];
    function sendCsv(statusCode) {
      const header =
        'status,action,row_number,account_code,message\r\n' +
        logLines.join('\r\n');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=\"accounts_import_${nowStr}.csv\"`
      );
      res.setHeader('Content-Type', 'text/csv');
      res.status(statusCode).send(header);
    }

    try {
      // quick reference caches to reduce queries
      const entitiesCache = new Set(
        (await pool.query('SELECT code FROM entities')).rows.map(r =>
          r.code.toString().trim()
        )
      );
      const glCache = new Set(
        (await pool.query('SELECT code FROM gl_codes')).rows.map(r =>
          r.code.toString().trim()
        )
      );

      await client.query('BEGIN');

      for (let idx = 0; idx < records.length; idx++) {
        const raw = mapCsvRecordStrict(records[idx]);
        const rowNum = idx + 2; // +2 to account for header + 1-based
        const {
          account_code,
          entity_code,
          gl_code,
          fund_number,
          description,
          status,
          balance_sheet,
          beginning_balance,
          beginning_balance_date,
          last_used,
          restriction,
          classification
        } = raw;

        // basic validations
        if (
          account_code !== `${entity_code}-${gl_code}-${fund_number}`
        ) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"account_code mismatch"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }
        if (!entitiesCache.has(entity_code)) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"entity_code not found"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }
        if (!glCache.has(gl_code)) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"gl_code not found"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }
        /* ------------------------------------------------------------------
         * Validate fund exists for given entity_code + fund_number
         * ---------------------------------------------------------------- */
        const fundChk = await client.query(
          'SELECT 1 FROM funds WHERE entity_code = $1 AND fund_number = $2 LIMIT 1',
          [entity_code, fund_number]
        );
        if (!fundChk.rows.length) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"fund_number not found for entity_code"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }
        if (
          !isValidDateYYYYMMDD(beginning_balance_date) ||
          !isValidDateYYYYMMDD(last_used)
        ) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"Invalid date format"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }
        if (isNaN(Number(beginning_balance))) {
          logLines.push(
            `Failed,-,${rowNum},${account_code},"beginning_balance not numeric"`
          );
          await client.query('ROLLBACK');
          return sendCsv(400);
        }

        // upsert
        const ex = await client.query(
          'SELECT id FROM accounts WHERE LOWER(account_code)=LOWER($1) LIMIT 1',
          [account_code]
        );
        if (ex.rows.length) {
          await client.query(
            `UPDATE accounts
               SET entity_code=$2, gl_code=$3, fund_number=$4, description=$5,
                   status=$6, balance_sheet=$7,
                   beginning_balance=$8::numeric,
                   beginning_balance_date=$9::date,
                   last_used=$10::date,
                   restriction=$11,
                   classification=$12
             WHERE id=$1`,
            [
              ex.rows[0].id,
              entity_code,
              gl_code,
              fund_number,
              description,
              status,
              balance_sheet,
              beginning_balance,
              beginning_balance_date,
              last_used,
              restriction,
              classification
            ]
          );
          logLines.push(`OK,Updated,${rowNum},${account_code},`);
        } else {
          await client.query(
            `INSERT INTO accounts
              (account_code,entity_code,gl_code,fund_number,description,
               status,balance_sheet,beginning_balance,beginning_balance_date,
               last_used,restriction,classification)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::date,$10::date,$11,$12)`,
            [
              account_code,
              entity_code,
              gl_code,
              fund_number,
              description,
              status,
              balance_sheet,
              beginning_balance,
              beginning_balance_date,
              last_used,
              restriction,
              classification
            ]
          );
          logLines.push(`OK,Inserted,${rowNum},${account_code},`);
        }
      }

      await client.query('COMMIT');
      return sendCsv(200);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Accounts CSV Import] Fatal:', err);
      res
        .status(500)
        .json({ error: 'Import failed', details: err.message || '' });
    } finally {
      client.release();
    }
  })
);

/* ---------------------------------------------------------------------------
 * DELETE /api/accounts/:id
 * -------------------------------------------------------------------------*/
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Prevent deletion when referenced by journal items
  const check = await pool.query('SELECT 1 FROM journal_entry_items WHERE account_id = $1 LIMIT 1', [id]);
  if (check.rows.length) {
    return res.status(409).json({
      error: 'Cannot delete account with journal entry items',
      details: 'This account is referenced in journal entries and cannot be deleted'
    });
  }

  const result = await pool.query('DELETE FROM accounts WHERE id = $1 RETURNING id', [id]);
  if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });

  res.status(204).send();
}));

/* ---------------------------------------------------------------------------
 * GET /api/accounts/:id
 * -------------------------------------------------------------------------*/
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Account not found' });
  res.json(rows[0]);
}));

module.exports = router;
