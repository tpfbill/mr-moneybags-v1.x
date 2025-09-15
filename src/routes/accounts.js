// src/routes/accounts.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

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
