// src/routes/accounts.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');

// Multer – in-memory storage for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Logs directory for import logs
const LOGS_DIR = path.join(__dirname, '../../logs');
const BEGINNING_BALANCE_DATE = '2024-12-01';

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
  // For this schema: journal_entry_items has a UUID account_id referencing accounts.id; prefer direct id match
  const accRefCols = await getExistingCols(pool, 'journal_entry_items', ['account_id']);

  // Determine how to match JEI account reference to accounts table
  const hasAccAccountCode = await hasColumn(pool, 'accounts', 'account_code');
  const hasAccCode = await hasColumn(pool, 'accounts', 'code');
  const hasAccEntity = await hasColumn(pool, 'accounts', 'entity_code');
  const hasAccGL = await hasColumn(pool, 'accounts', 'gl_code');
  const hasAccFundNum = await hasColumn(pool, 'accounts', 'fund_number');
  const hasAccRestriction = await hasColumn(pool, 'accounts', 'restriction');
  // Tight, schema-correct match: JEI.account_id = accounts.id
  const accMatchClause = `jel.${(accRefCols[0] || jei.accRef)}::text = a.id::text`;

  // Journal entry posted filter (supports status or posted boolean)
  const hasStatusCol = await hasColumn(pool, 'journal_entries', 'status');
  const hasPostedCol = await hasColumn(pool, 'journal_entries', 'posted');
  let postedFilter = 'TRUE';
  if (hasStatusCol && hasPostedCol) {
    postedFilter = `(je.posted = TRUE OR je.status ILIKE 'post%')`;
  } else if (hasStatusCol) {
    postedFilter = `(je.status ILIKE 'post%')`;
  } else if (hasPostedCol) {
    postedFilter = `(je.posted = TRUE)`;
  }

  // Compute balance uniformly for all line types:
  // DEBITs ADD, CREDITs SUBTRACT
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
          SELECT SUM(
            COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0)
          )
          FROM journal_entry_items jel
          JOIN journal_entries je ON ${jeRefCols && jeRefCols.length ? '(' + jeRefCols.map(c => `jel.${c} = je.id`).join(' OR ') + ')' : `jel.${jei.jeRef} = je.id`}
          JOIN accounts a2 ON jel.${(accRefCols[0] || jei.accRef)}::text = a2.id::text
          WHERE a2.id = a.id
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
 * POST /api/accounts/import  – Excel/CSV upload
 * Supports both .xlsx and .csv files
 * -------------------------------------------------------------------------*/
router.post(
  '/import',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    // Create logs directory if needed
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }

    // Generate log filename with date
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
    const logFile = path.join(LOGS_DIR, `accounts-import-${dateStr}_${timeStr}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    function log(message) {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ${message}`;
      console.log(message);
      logStream.write(line + '\n');
    }

    function logError(message) {
      const timestamp = new Date().toISOString();
      const line = `[${timestamp}] ERROR: ${message}`;
      console.error(message);
      logStream.write(line + '\n');
    }

    /**
     * Parse accounting format number (handles parentheses for negatives, commas, dashes)
     */
    function parseAccountingNumber(value) {
      if (value === null || value === undefined || value === '') return 0;
      let str = String(value).trim();
      if (str === '-' || str === '- ' || str === ' - ' || str === ' -   ') return 0;
      const isNegative = str.startsWith('(') && str.endsWith(')');
      if (isNegative) str = str.slice(1, -1);
      str = str.replace(/[$,\s]/g, '');
      const num = parseFloat(str);
      if (isNaN(num)) return 0;
      return isNegative ? -num : num;
    }

    /**
     * Parse date from Excel format (M/D/YY or similar)
     */
    function parseExcelDate(value) {
      if (!value) return BEGINNING_BALANCE_DATE;
      const str = String(value).trim();
      const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
      if (match) {
        let [, month, day, year] = match;
        if (year.length === 2) {
          year = parseInt(year) < 50 ? `20${year}` : `19${year}`;
        }
        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      }
      return BEGINNING_BALANCE_DATE;
    }

    /* ---------------------------------------------------------------
     * Pre-flight checks
     * ------------------------------------------------------------- */
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    log(`Log file: ${logFile}`);
    log(`Processing file: ${req.file.originalname}`);
    log(`Beginning balance date: ${BEGINNING_BALANCE_DATE}`);
    log('---');

    let data;
    const filename = req.file.originalname.toLowerCase();

    try {
      if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        // Parse Excel file
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        data = XLSX.utils.sheet_to_json(sheet, { raw: false });
        log(`Found ${data.length} rows in Excel sheet "${sheetName}"`);
      } else if (filename.endsWith('.csv')) {
        // Parse CSV file
        data = parse(req.file.buffer.toString('utf8'), {
          columns: true,
          skip_empty_lines: true,
          trim: true
        });
        log(`Found ${data.length} rows in CSV`);
      } else {
        logStream.end();
        return res.status(400).json({ error: 'Unsupported file format. Please upload .xlsx, .xls, or .csv' });
      }
    } catch (err) {
      logError(`Failed to parse file: ${err.message}`);
      logStream.end();
      return res.status(400).json({ error: `Failed to parse file: ${err.message}` });
    }

    if (!data || !data.length) {
      logError('File has no data rows');
      logStream.end();
      return res.status(400).json({ error: 'File has no data rows' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      let updated = 0;
      let inserted = 0;
      let errors = 0;

      for (const row of data) {
        // Handle both Excel column names (with spaces) and normalized names
        const accountCode = (row['Account'] || row['account_code'] || '').trim();

        if (!accountCode) continue;

        // Parse all fields - support both Excel format and CSV format column names
        const entityCode = (row['Entity'] || row['entity_code'] || '').trim();
        const glCode = (row['GL Code'] || row['gl_code'] || '').trim();
        const fundNumber = (row['Fund'] || row['fund_number'] || '').trim();
        const restriction = (row['Restriction'] || row['restriction'] || '').trim();
        const description = (row['Description'] || row['description'] || '').trim();
        const classification = (row['Classification'] || row['classification'] || '').trim() || null;
        const status = (row['Status'] || row['status'] || 'Active').trim();
        
        // Balance Sheet: handle both "1"/"0" and "Yes"/"No"
        const balanceSheetRaw = (row['Balance Sheet'] || row['balance_sheet'] || '').toString().trim();
        const balanceSheet = balanceSheetRaw === '1' || balanceSheetRaw.toLowerCase() === 'yes' ? 'Yes' : 'No';
        
        // Parse beginning balance (handle accounting format)
        const beginningBalance = parseAccountingNumber(
          row[' Beginning Balance '] || row['Beginning Balance'] || row['beginning_balance'] || 0
        );
        
        // Parse last_used date
        const lastUsed = parseExcelDate(row['last used'] || row['last_used']);

        try {
          // Check if account exists
          const checkResult = await client.query(
            'SELECT id FROM accounts WHERE account_code = $1',
            [accountCode]
          );

          if (checkResult.rows.length > 0) {
            // Update existing account
            await client.query(
              `UPDATE accounts 
               SET entity_code = $1,
                   gl_code = $2,
                   fund_number = $3,
                   restriction = $4,
                   description = $5,
                   classification = $6,
                   status = $7,
                   balance_sheet = $8,
                   beginning_balance = $9,
                   beginning_balance_date = $10,
                   last_used = $11
               WHERE account_code = $12`,
              [entityCode, glCode, fundNumber, restriction, description,
               classification, status, balanceSheet, beginningBalance,
               BEGINNING_BALANCE_DATE, lastUsed, accountCode]
            );
            log(`  Updated: ${accountCode}`);
            updated++;
          } else {
            // Insert new account
            await client.query(
              `INSERT INTO accounts 
               (account_code, entity_code, gl_code, fund_number, restriction,
                description, classification, status, balance_sheet,
                beginning_balance, beginning_balance_date, last_used)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
              [accountCode, entityCode, glCode, fundNumber, restriction,
               description, classification, status, balanceSheet,
               beginningBalance, BEGINNING_BALANCE_DATE, lastUsed]
            );
            log(`  Inserted: ${accountCode}`);
            inserted++;
          }
        } catch (err) {
          logError(`  Error processing ${accountCode}: ${err.message}`);
          errors++;
        }
      }

      await client.query('COMMIT');

      log('---');
      log('Summary:');
      log(`  Accounts updated: ${updated}`);
      log(`  Accounts inserted: ${inserted}`);
      log(`  Errors: ${errors}`);
      log('\nImport completed successfully.');

      logStream.end();

      res.json({
        success: true,
        message: 'Import completed',
        updated,
        inserted,
        errors,
        logFile: path.basename(logFile)
      });

    } catch (err) {
      await client.query('ROLLBACK');
      logError('Import failed: ' + err.message);
      logStream.end();
      res.status(500).json({ error: 'Import failed', details: err.message });
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
