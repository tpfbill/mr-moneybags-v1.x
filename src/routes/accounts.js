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
// Schema helpers (duplicated from journal-entries.js for JEI column detection)
async function hasColumn(db, tableName, colName) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, colName]
  );
  return rows.length > 0;
}

async function getJeiCoreCols(db) {
  // Detect JEI foreign key to journal_entries
  const jeRefCandidates = ['journal_entry_id', 'entry_id', 'je_id'];
  let jeRef = 'journal_entry_id';
  for (const c of jeRefCandidates) {
    if (await hasColumn(db, 'journal_entry_items', c)) { jeRef = c; break; }
  }

  // Detect JEI account reference
  const accRefCandidates = ['account_id', 'gl_account_id', 'acct_id', 'account'];
  let accRef = 'account_id';
  for (const c of accRefCandidates) {
    if (await hasColumn(db, 'journal_entry_items', c)) { accRef = c; break; }
  }

  // Detect debit and credit columns
  const debitCandidates = ['debit', 'debits', 'dr_amount', 'debit_amount', 'dr'];
  const creditCandidates = ['credit', 'credits', 'cr_amount', 'credit_amount', 'cr'];
  let debitCol = 'debit';
  let creditCol = 'credit';
  for (const c of debitCandidates) {
    if (await hasColumn(db, 'journal_entry_items', c)) { debitCol = c; break; }
  }
  for (const c of creditCandidates) {
    if (await hasColumn(db, 'journal_entry_items', c)) { creditCol = c; break; }
  }

  return { jeRef, accRef, debitCol, creditCol };
}

// Return the subset of candidate column names that actually exist on the table
async function getExistingCols(db, tableName, candidates) {
  const out = [];
  for (const c of candidates) {
    if (await hasColumn(db, tableName, c)) out.push(c);
  }
  return out;
}

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
  // Strip surrounding quotes first, then normalise
  return key
    .toString()
    .replace(/^['"]+|['"]+$/g, '') // remove leading/trailing quotes
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')   // collapse to underscores
    .replace(/^_+|_+$/g, '');      // trim leading/trailing underscores
}

// Canonicalise codes by stripping all non-alphanumerics and lower-casing
function canonCode(v) {
  return (v == null ? '' : String(v))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
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

  // Detect JEI columns dynamically so balance works across schemas
  const jei = await getJeiCoreCols(pool);
  const jeRefCols = await getExistingCols(pool, 'journal_entry_items', ['journal_entry_id', 'entry_id', 'je_id']);
  const accRefCols = await getExistingCols(pool, 'journal_entry_items', ['account_id', 'gl_account_id', 'acct_id', 'account', 'account_code', 'code', 'chart_code']);

  // Determine how to match JEI account reference to accounts table
  const hasAccAccountCode = await hasColumn(pool, 'accounts', 'account_code');
  const hasAccCode = await hasColumn(pool, 'accounts', 'code');
  const hasAccEntity = await hasColumn(pool, 'accounts', 'entity_code');
  const hasAccGL = await hasColumn(pool, 'accounts', 'gl_code');
  const hasAccFundNum = await hasColumn(pool, 'accounts', 'fund_number');
  const hasAccRestriction = await hasColumn(pool, 'accounts', 'restriction');
  const accMatchParts = [];
  // Canonical (sanitized) comparisons: strip non-alphanumerics and lowercase
  const canon = (expr) => `regexp_replace(lower(${expr}::text), '[^a-z0-9]', '', 'g')`;
  const accCols = (accRefCols && accRefCols.length ? accRefCols : [jei.accRef]);
  for (const col of accCols) {
    // Direct id or textual matches
    accMatchParts.push(`jel.${col}::text = a.id::text`);
    if (hasAccAccountCode) accMatchParts.push(`jel.${col}::text = a.account_code::text`);
    if (hasAccCode) accMatchParts.push(`jel.${col}::text = a.code::text`);
    if (hasAccEntity && hasAccGL && hasAccFundNum) {
      accMatchParts.push(`jel.${col}::text = (a.entity_code::text || '-' || a.gl_code::text || '-' || a.fund_number::text)`);
    }
    if (hasAccEntity && hasAccGL && hasAccFundNum && hasAccRestriction) {
      accMatchParts.push(`jel.${col}::text = (a.entity_code::text || '-' || a.gl_code::text || '-' || a.fund_number::text || '-' || COALESCE(a.restriction::text,''))`);
    }

    // Canonicalized equality
    const jelCanon = canon(`jel.${col}`);
    if (hasAccAccountCode) accMatchParts.push(`${jelCanon} = ${canon('a.account_code')}`);
    if (hasAccCode) accMatchParts.push(`${jelCanon} = ${canon('a.code')}`);
    if (hasAccEntity && hasAccGL && hasAccFundNum) {
      accMatchParts.push(`${jelCanon} = ${canon(`a.entity_code || '-' || a.gl_code || '-' || a.fund_number`)}`);
    }
    if (hasAccEntity && hasAccGL && hasAccFundNum && hasAccRestriction) {
      accMatchParts.push(`${jelCanon} = ${canon(`a.entity_code || '-' || a.gl_code || '-' || a.fund_number || '-' || COALESCE(a.restriction,'')`)}`);
    }
  }
  const accMatchClause = accMatchParts.join(' OR ');

  // Journal entry posted filter (supports status or posted boolean)
  const hasStatusCol = await hasColumn(pool, 'journal_entries', 'status');
  const hasPostedCol = await hasColumn(pool, 'journal_entries', 'posted');
  let postedFilter = 'TRUE';
  if (hasStatusCol && hasPostedCol) {
    postedFilter = `(je.status = 'Posted' OR je.posted = TRUE)`;
  } else if (hasStatusCol) {
    postedFilter = `(je.status = 'Posted')`;
  } else if (hasPostedCol) {
    postedFilter = `(je.posted = TRUE)`;
  }

  let query = `
    SELECT 
      a.id,
      a.account_code,
      a.description,
      a.entity_code,
      a.gl_code,
      a.fund_number,
      a.restriction,
      a.classification,
      a.status,
      a.balance_sheet,
      a.beginning_balance,
      a.beginning_balance_date,
      a.last_used,
      COALESCE(a.beginning_balance, 0) + COALESCE(
        (
          SELECT SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0))
          FROM journal_entry_items jel
          JOIN journal_entries je ON ${jeRefCols && jeRefCols.length ? '(' + jeRefCols.map(c => `jel.${c} = je.id`).join(' OR ') + ')' : `jel.${jei.jeRef} = je.id`}
          WHERE (${accMatchClause})
            AND ${postedFilter}
        ), 0
      ) AS current_balance
    FROM accounts a 
    WHERE 1=1
  `;
  const params = [];
  let i = 1;

  if (entity_code) { query += ` AND a.entity_code = $${i++}`; params.push(entity_code); }
  if (gl_code)     { query += ` AND a.gl_code = $${i++}`;     params.push(gl_code); }
  if (fund_number) { query += ` AND a.fund_number = $${i++}`; params.push(fund_number); }
  if (status)      { query += ` AND a.status = $${i++}`;      params.push(status); }

  query += ' ORDER BY a.account_code, a.description';

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
 * POST /api/accounts/import  – CSV upload (collect ALL errors)
 * -------------------------------------------------------------------------*/
router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    /* ---------------------------------------------------------------
     * Helpers for every outcome (success or any error)
     * ------------------------------------------------------------- */
    const nowStr = new Date().toISOString().replace(/[:T]/g, '').split('.')[0];
    const logLines = [];
    function sendCsv(statusCode) {
      const csv =
        'status,action,row_number,account_code,message\r\n' +
        logLines.join('\r\n');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="accounts_import_${nowStr}.csv"`
      );
      res.setHeader('Content-Type', 'text/csv');
      return res.status(statusCode).send(csv);
    }

    /* ---------------------------------------------------------------
     * Pre-flight checks
     * ------------------------------------------------------------- */
    if (!req.file) {
      logLines.push('Failed,-,1,,"No file uploaded"');
      console.warn('[Accounts CSV Import] First failure:', logLines[0]);
      return sendCsv(400);
    }

    let records;
    try {
      records = parse(req.file.buffer.toString('utf8'), {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });
    } catch (err) {
      logLines.push(`Failed,-,1,,"Invalid CSV (${err.message})"`);
      console.warn('[Accounts CSV Import] First failure:', logLines[0]);
      return sendCsv(400);
    }

    if (!records.length) {
      logLines.push('Failed,-,1,,"CSV has no data rows"');
      console.warn('[Accounts CSV Import] First failure:', logLines[0]);
      return sendCsv(400);
    }

    /* ---------------------------------
     * Header validation
     * --------------------------------*/
    const hdrSet = new Set(
      Object.keys(records[0]).map(h => normalizeHeaderKey(h))
    );
    const missing = REQUIRED_HEADERS.filter(h => !hdrSet.has(h));
    if (missing.length) {
      logLines.push(
        `Failed,-,1,,"Missing required headers: ${missing.join(', ')}"`
      );
      console.warn('[Accounts CSV Import] First failure:', logLines[0]);
      return sendCsv(400);
    }

    /* ---------------------------------
     * Build caches for validation
     * --------------------------------*/
    const entitiesCache = new Set(
      (await pool.query('SELECT code FROM entities')).rows.map(r =>
        canonCode(r.code)
      )
    );
    
    const glCache = new Set(
      (await pool.query('SELECT code FROM gl_codes')).rows.map(r =>
        canonCode(r.code)
      )
    );
    
    // Build funds map keyed by canonical entity_code|fund_number -> Set(restrictions)
    const fundsResult = await pool.query(
      'SELECT entity_code, fund_number, restriction FROM funds'
    );
    const fundsMap = new Map(); // key => Set of canonical restrictions
    fundsResult.rows.forEach(r => {
      const key = `${canonCode(r.entity_code)}|${canonCode(r.fund_number)}`;
      const set = fundsMap.get(key) || new Set();
      set.add(canonCode(r.restriction));
      fundsMap.set(key, set);
    });

    /* ---------------------------------
     * First pass: Validate all rows independently
     * --------------------------------*/
    const plannedRows = [];
    
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

      // ------------------------------------------------------------------
      // Canonicalisation & raw trims
      // ------------------------------------------------------------------
      const eRaw = (entity_code || '').toString().trim();
      const gRaw = (gl_code || '').toString().trim();
      const fRaw = (fund_number || '').toString().trim();
      const acRaw = (account_code || '').toString().trim();

      const eCanon = canonCode(eRaw);
      const gCanon = canonCode(gRaw);
      const fCanon = canonCode(fRaw);
      const acCanon = canonCode(acRaw);

      // Validate entity_code exists
      if (!entitiesCache.has(eCanon)) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"entity_code not found"`
        );
        continue; // Skip to next row
      }
      
      // Validate gl_code exists
      if (!glCache.has(gCanon)) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"gl_code not found"`
        );
        continue; // Skip to next row
      }
      
      // Determine restriction canon for this row
      let rCanonCsv = canonCode(restriction || '');
      if (!rCanonCsv) {
        // try to extract 4th token from account_code
        const acParts = acRaw
          .replace(/[^A-Za-z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .map(canonCode);
        rCanonCsv = acParts[3] || '';
      }
      if (!rCanonCsv) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"restriction missing (CSV and account_code)"`
        );
        continue;
      }

      // Validate fund exists and has this restriction
      const fundKey = `${eCanon}|${fCanon}`;
      const restrSet = fundsMap.get(fundKey);
      if (!restrSet) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"fund_number not found for entity_code"`
        );
        continue;
      }
      if (!restrSet.has(rCanonCsv)) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"fund restriction not found for entity_code+fund_number (have: ${[
            ...restrSet
          ].join('/')}; got: ${rCanonCsv})"`
        );
        continue;
      }

      // Build expected canonical with the derived restriction
      const expectedCanon = eCanon + gCanon + fCanon + rCanonCsv;

      if (acCanon !== expectedCanon) {
        // analyse parts to give detailed mismatch
        const parts = acRaw
          .replace(/[^A-Za-z0-9]+/g, ' ')
          .trim()
          .split(/\s+/)
          .map(canonCode);
        const mism = [];
        if ((parts[0] || '') !== eCanon) mism.push(`entity ${parts[0] || ''}`);
        if ((parts[1] || '') !== gCanon) mism.push(`gl ${parts[1] || ''}`);
        if ((parts[2] || '') !== fCanon) mism.push(`fund ${parts[2] || ''}`);
        if ((parts[3] || '') !== rCanonCsv)
          mism.push(`restriction ${parts[3] || ''}`);
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"account_code mismatch – ${mism.join(
            '; '
          )}; expected ${expectedCanon}"`
        );
        continue;
      }
      
      // Validate dates
      if (!isValidDateYYYYMMDD(beginning_balance_date) || !isValidDateYYYYMMDD(last_used)) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"Invalid date format"`
        );
        continue; // Skip to next row
      }
      
      // Validate beginning_balance is numeric
      if (isNaN(Number(beginning_balance))) {
        logLines.push(
          `Failed,-,${rowNum},${acRaw},"beginning_balance not numeric"`
        );
        continue; // Skip to next row
      }

      // If we got here, validation passed - add to planned rows
      plannedRows.push({
        rowNum,
        acRaw,
        acCanon,
        eCanon,
        gCanon,
        fCanon,
        description,
        status,
        balance_sheet: normalizeYN(balance_sheet),
        beginning_balance,
        beginning_balance_date,
        last_used,
        restriction: rCanonCsv, // use validated restriction
        classification
      });
    }

    /* ---------------------------------
     * If any errors, return 400 with all error lines
     * --------------------------------*/
    if (logLines.length > 0) {
      console.warn(`[Accounts CSV Import] Validation errors: ${logLines.length}. First: ${logLines[0]}`);
      return sendCsv(400);
    }

    /* ---------------------------------
     * No errors - process all planned rows in a transaction
     * --------------------------------*/
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const planned of plannedRows) {
        // Check if account exists by canonical code
        const ex = await client.query(
          "SELECT id FROM accounts WHERE regexp_replace(lower(account_code), '[^a-z0-9]', '', 'g') = $1 LIMIT 1",
          [planned.acCanon]
        );
        
        if (ex.rows.length) {
          // UPDATE existing account
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
              planned.eCanon,
              planned.gCanon,
              planned.fCanon,
              planned.description,
              planned.status,
              planned.balance_sheet,
              planned.beginning_balance,
              planned.beginning_balance_date,
              planned.last_used,
              planned.restriction,
              planned.classification
            ]
          );
          logLines.push(`OK,Updated,${planned.rowNum},${planned.acRaw},`);
        } else {
          // INSERT new account
          await client.query(
            `INSERT INTO accounts
              (account_code,entity_code,gl_code,fund_number,description,
               status,balance_sheet,beginning_balance,beginning_balance_date,
               last_used,restriction,classification)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::date,$10::date,$11,$12)`,
            [
              planned.acRaw,
              planned.eCanon,
              planned.gCanon,
              planned.fCanon,
              planned.description,
              planned.status,
              planned.balance_sheet,
              planned.beginning_balance,
              planned.beginning_balance_date,
              planned.last_used,
              planned.restriction,
              planned.classification
            ]
          );
          logLines.push(`OK,Inserted,${planned.rowNum},${planned.acRaw},`);
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
  const { rows } = await pool.query(`
    SELECT 
      a.id,
      a.account_code,
      a.description,
      a.entity_code,
      a.gl_code,
      a.fund_number,
      a.restriction,
      a.classification,
      a.status,
      a.balance_sheet,
      a.beginning_balance,
      a.beginning_balance_date,
      a.last_used
    FROM accounts a
    WHERE a.id = $1
  `, [id]);
  if (!rows.length) return res.status(404).json({ error: 'Account not found' });
  res.json(rows[0]);
}));

module.exports = router;
