// src/routes/payments-import.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const crypto = require('crypto');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Upload destination (ephemeral)
const upload = multer({ dest: 'uploads/' });

// In-memory job tracker (mirrors src/routes/import.js pattern)
const importJobs = {};

// Utility: safe lower
const lower = (s) => (s ?? '').toString().trim().toLowerCase();

// Normalize header to snake-ish: lower, non-alnum -> _
function normHeader(k = '') {
  return String(k).replace(/^['"]+|['"]+$/g, '')
    .trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

// Parse accounting-format numbers: commas, parentheses for negatives, optional $/spaces
function parseAccountingAmount(v) {
  if (v == null) return 0;
  let t = String(v).trim();
  let neg = false;
  if (/^\(.+\)$/.test(t)) { neg = true; t = t.replace(/^\(|\)$/g, ''); }
  t = t.replace(/[,$\s]/g, '');
  const num = parseFloat(t);
  if (isNaN(num)) return 0;
  return neg ? -num : num;
}

// Parse M/D/Y (or MM/DD/YYYY) with 2-digit-year pivot
function parseDateMDY(input) {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  let mm = parseInt(m[1], 10);
  let dd = parseInt(m[2], 10);
  let yy = parseInt(m[3], 10);
  if (yy < 100) yy += yy >= 70 ? 1900 : 2000;
  const dt = new Date(yy, mm - 1, dd);
  return isNaN(dt.getTime()) ? null : dt;
}

// Schema guard: check if a table has a column (any schema)
async function hasColumn(db, table, column) {
  const q = await db.query(
    `SELECT 1
       FROM information_schema.columns
      WHERE table_name = $1 AND column_name = $2
      LIMIT 1`,
    [table, column]
  );
  return q.rows.length > 0;
}

async function hasTable(db, table) {
  const q = await db.query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = $1 LIMIT 1`,
    [table]
  );
  return q.rows.length > 0;
}

// Parse "Account No." shape: "Entity GLCode FundNumber Restriction"
function parseAccountNo(val) {
  if (!val) return {};
  const parts = String(val).trim().split(/\s+/);
  if (parts.length < 4) {
    return { entityCode: parts[0] || null, glCode: parts[1] || null, fundToken: parts[2] || null, restriction: parts[3] || null };
  }
  const [entityCode, glCode, fundToken, restriction] = parts;
  return { entityCode, glCode, fundToken, restriction };
}

async function resolveEntityId(db, entityCode) {
  if (!entityCode) return null;
  // Try by code (common), tolerate absence of column
  if (await hasColumn(db, 'entities', 'code')) {
    const r = await db.query('SELECT id FROM entities WHERE code = $1 LIMIT 1', [entityCode]);
    if (r.rows[0]?.id) return r.rows[0].id;
  }

  // Alternate common column names
  if (await hasColumn(db, 'entities', 'short_code')) {
    const r2 = await db.query('SELECT id FROM entities WHERE short_code = $1 LIMIT 1', [entityCode]);
    if (r2.rows[0]?.id) return r2.rows[0].id;
  }
  if (await hasColumn(db, 'entities', 'entity_code')) {
    const r3 = await db.query('SELECT id FROM entities WHERE entity_code = $1 LIMIT 1', [entityCode]);
    if (r3.rows[0]?.id) return r3.rows[0].id;
  }

  // If token is numeric, try matching id directly
  const maybeId = parseInt(entityCode, 10);
  if (!Number.isNaN(maybeId)) {
    try {
      const r4 = await db.query('SELECT id FROM entities WHERE id = $1 LIMIT 1', [maybeId]);
      if (r4.rows[0]?.id) return r4.rows[0].id;
    } catch (_) { /* ignore */ }
  }
  return null;
}

async function resolveAccountId(db, entityId, glCode) {
  if (!entityId || !glCode) return null;
  // Prefer entity_id + code
  if (await hasColumn(db, 'accounts', 'entity_id') && await hasColumn(db, 'accounts', 'code')) {
    const r = await db.query('SELECT id FROM accounts WHERE entity_id = $1 AND code = $2 LIMIT 1', [entityId, glCode]);
    if (r.rows[0]?.id) return r.rows[0].id;
  }
  // Fallback: accounts.entity_code + code
  if (await hasColumn(db, 'accounts', 'entity_code')) {
    let entityCode = null;
    if (await hasColumn(db, 'entities', 'code')) {
      const e = await db.query('SELECT code FROM entities WHERE id = $1 LIMIT 1', [entityId]);
      entityCode = e.rows[0]?.code || null;
    }
    if (entityCode) {
      const codeCols = [];
      for (const col of ['code','gl_code','account_code','number','account_number']) {
        if (await hasColumn(db, 'accounts', col)) codeCols.push(col);
      }
      if (codeCols.length) {
        const or = codeCols.map(c => `${c} = $2`).join(' OR ');
        const r2 = await db.query(`SELECT id FROM accounts WHERE entity_code = $1 AND (${or}) LIMIT 1`, [entityCode, glCode]);
        if (r2.rows[0]?.id) return r2.rows[0].id;
      }
    }
  }
  // Last resort: any account by code
  const possibleCols = [];
  for (const col of ['code','gl_code','account_code','number','account_number']) {
    if (await hasColumn(db, 'accounts', col)) possibleCols.push(col);
  }
  if (possibleCols.length) {
    const where = possibleCols.map(c => `${c} = $1`).join(' OR ');
    const r3 = await db.query(`SELECT id FROM accounts WHERE ${where} LIMIT 1`, [glCode]);
    if (r3.rows[0]?.id) return r3.rows[0].id;
  }
  return null;
}

async function resolveFundId(db, entityCode, fundToken) {
  if (!entityCode || !fundToken) return null;
  // Try multiple shapes to accommodate live DB variations
  if (await hasColumn(db, 'funds', 'entity_code') && await hasColumn(db, 'funds', 'fund_number')) {
    const r1 = await db.query(
      'SELECT id FROM funds WHERE entity_code = $1 AND fund_number = $2 LIMIT 1',
      [entityCode, fundToken]
    );
    if (r1.rows[0]?.id) return r1.rows[0].id;
  }

  if (await hasColumn(db, 'funds', 'entity_code') && await hasColumn(db, 'funds', 'fund_code')) {
    const r2 = await db.query(
      'SELECT id FROM funds WHERE entity_code = $1 AND LOWER(fund_code) = LOWER($2) LIMIT 1',
      [entityCode, fundToken]
    );
    if (r2.rows[0]?.id) return r2.rows[0].id;
  }

  if (await hasColumn(db, 'funds', 'entity_id') && await hasColumn(db, 'funds', 'fund_number') && await hasColumn(db, 'entities', 'code')) {
    const r3 = await db.query(
      `SELECT f.id FROM funds f
         JOIN entities e ON f.entity_id = e.id
        WHERE e.code = $1 AND f.fund_number = $2
        LIMIT 1`,
      [entityCode, fundToken]
    );
    if (r3.rows[0]?.id) return r3.rows[0].id;
  }

  if (await hasColumn(db, 'funds', 'entity_id') && await hasColumn(db, 'funds', 'fund_code') && await hasColumn(db, 'entities', 'code')) {
    const r4 = await db.query(
      `SELECT f.id FROM funds f
         JOIN entities e ON f.entity_id = e.id
        WHERE e.code = $1 AND LOWER(f.fund_code) = LOWER($2)
        LIMIT 1`,
      [entityCode, fundToken]
    );
    if (r4.rows[0]?.id) return r4.rows[0].id;
  }

  if (await hasColumn(db, 'funds', 'fund_number')) {
    const r5 = await db.query('SELECT id FROM funds WHERE fund_number = $1 LIMIT 1', [fundToken]);
    if (r5.rows[0]?.id) return r5.rows[0].id;
  }

  if (await hasColumn(db, 'funds', 'fund_code')) {
    const r6 = await db.query('SELECT id FROM funds WHERE LOWER(fund_code) = LOWER($1) LIMIT 1', [fundToken]);
    if (r6.rows[0]?.id) return r6.rows[0].id;
  }

  return null;
}

async function resolveVendor(db, { zid, name }) {
  if (zid && await hasColumn(db, 'vendors', 'zid')) {
    const rz = await db.query('SELECT id FROM vendors WHERE LOWER(zid) = LOWER($1) LIMIT 1', [zid]);
    if (rz.rows[0]?.id) return rz.rows[0].id;
  }
  if (name) {
    if (await hasColumn(db, 'vendors', 'name')) {
      const rn = await db.query('SELECT id FROM vendors WHERE LOWER(name) = LOWER($1)', [name]);
      if (rn.rows.length === 1) return rn.rows[0].id;
    } else if (await hasColumn(db, 'vendors', 'vendor_name')) {
      const rn2 = await db.query('SELECT id FROM vendors WHERE LOWER(vendor_name) = LOWER($1)', [name]);
      if (rn2.rows.length === 1) return rn2.rows[0].id;
    } else if (await hasColumn(db, 'vendors', 'display_name')) {
      const rn3 = await db.query('SELECT id FROM vendors WHERE LOWER(display_name) = LOWER($1)', [name]);
      if (rn3.rows.length === 1) return rn3.rows[0].id;
    }
  }
  return null;
}

async function resolveNachaSettingsId(db, entityId, bankVal) {
  if (!entityId) return null;
  if (!(await hasTable(db, 'company_nacha_settings'))) return null;
  const bank = (bankVal || '').toString().trim();
  const hasEntityCol = await hasColumn(db, 'company_nacha_settings', 'entity_id');
  
  if (bank) {
    // 1) Match company_nacha_settings.company_name
    let r;
    if (hasEntityCol && await hasColumn(db, 'company_nacha_settings', 'company_name')) {
      try {
        r = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND LOWER(company_name) = LOWER($2) LIMIT 1',
          [entityId, bank]
        );
      } catch(e) { /* silent */ }
      if (r.rows[0]?.id) return r.rows[0].id;
    }

    // 2) Match company_id
    if (hasEntityCol && await hasColumn(db, 'company_nacha_settings', 'company_id')) {
      try {
        r = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND company_id = $2 LIMIT 1',
          [entityId, bank]
        );
      } catch(e) { /* silent */ }
      if (r.rows[0]?.id) return r.rows[0].id;
    }

    // 3) Match via settlement bank account name
    if (hasEntityCol && 
      await hasColumn(db, 'company_nacha_settings', 'settlement_account_id') &&
      await hasColumn(db, 'bank_accounts', 'account_name')
    ) {
      try {
        r = await db.query(
          `SELECT cns.id
           FROM company_nacha_settings cns
           JOIN bank_accounts ba ON ba.id = cns.settlement_account_id
          WHERE cns.entity_id = $1 AND LOWER(ba.account_name) = LOWER($2)
          LIMIT 1`, [entityId, bank]
        );
      } catch(e) { /* silent */ }
      if (r.rows[0]?.id) return r.rows[0].id;
    }
  }

  // 4) Fallback to any settings for the entity. Prefer default when column exists; gracefully degrade if not.
  if (hasEntityCol) {
    const hasIsDefault = await hasColumn(db, 'company_nacha_settings', 'is_default');
    const hasCreatedAt = await hasColumn(db, 'company_nacha_settings', 'created_at');
    if (hasIsDefault) {
      try {
        const d = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY is_default DESC NULLS LAST, created_at ASC LIMIT 1',
          [entityId]
        );
        if (d.rows[0]?.id) return d.rows[0].id;
      } catch (e) { /* silent */ }
    }
    if (hasCreatedAt) {
      try {
        const d2 = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY created_at ASC LIMIT 1',
          [entityId]
        );
        if (d2.rows[0]?.id) return d2.rows[0].id;
      } catch (e) { /* silent */ }
    }
  }
  // Last-resort: any record in table
  const hasCreatedAtAny = await hasColumn(db, 'company_nacha_settings', 'created_at');
  if (hasCreatedAtAny) {
    try {
      const any = await db.query('SELECT id FROM company_nacha_settings ORDER BY created_at ASC LIMIT 1');
      if (any.rows[0]?.id) return any.rows[0].id;
    } catch (e) { /* silent */ }
  }
  const any2 = await db.query('SELECT id FROM company_nacha_settings LIMIT 1');
  if (any2.rows[0]?.id) return any2.rows[0].id;
  return null;
}

async function resolveVendorBankAccountId(db, vendorId) {
  if (!vendorId) return null;
  if (!(await hasTable(db, 'vendor_bank_accounts'))) return null;
  // Prefer primary active account
  const hasStatus = await hasColumn(db, 'vendor_bank_accounts', 'status');
  const hasIsPrimary = await hasColumn(db, 'vendor_bank_accounts', 'is_primary');
  const hasCreatedAt = await hasColumn(db, 'vendor_bank_accounts', 'created_at');
  if (hasStatus && hasIsPrimary && hasCreatedAt) {
    const q = await db.query(
      `SELECT id FROM vendor_bank_accounts 
        WHERE vendor_id = $1 AND LOWER(status) = 'active'
        ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
      [vendorId]
    );
    return q.rows[0]?.id || null;
  }
  // Fallback: any account for vendor
  const q2 = await db.query(`SELECT id FROM vendor_bank_accounts WHERE vendor_id = $1 LIMIT 1`, [vendorId]);
  return q2.rows[0]?.id || null;
}

// Resolve Accounts Payable account by fund number and classification
async function resolveAPAccountId(db, { entityId, entityCode, fundToken }) {
  if (!fundToken) return null;

  // Determine available columns
  const hasEntityIdCol  = await hasColumn(db, 'accounts', 'entity_id');
  const hasEntityCodeCol= await hasColumn(db, 'accounts', 'entity_code');
  const hasFundNumCol   = await hasColumn(db, 'accounts', 'fund_number');
  const hasFundIdCol    = await hasColumn(db, 'accounts', 'fund_id');
  const hasClassCol     = await hasColumn(db, 'accounts', 'classification');
  const hasClassCols    = await hasColumn(db, 'accounts', 'classifications');

  // Build classification predicate
  const classPred = hasClassCol
    ? "LOWER(classification) LIKE LOWER($X) || '%'"
    : (hasClassCols ? "LOWER(classifications) LIKE LOWER($X) || '%'" : null);

  const apLabel = 'Accounts Payable';

  // Helper to substitute parameter index for classification predicate
  function classClause(pi) {
    if (!classPred) return null;
    return classPred.replace('$X', `$${pi}`);
  }

  // Try accounts.fund_number first
  if (hasFundNumCol && classPred) {
    const params = [];
    let idx = 1;
    let where = 'fund_number = $' + idx++; params.push(fundToken);
    const clsClause = classClause(idx); params.push(apLabel);
    where += ` AND ${clsClause}`; idx++;

    if (hasEntityIdCol && entityId) {
      where += ` AND entity_id = $${idx++}`; params.push(entityId);
    } else if (hasEntityCodeCol && entityCode) {
      where += ` AND entity_code = $${idx++}`; params.push(entityCode);
    }

    const q = await db.query(`SELECT id FROM accounts WHERE ${where} LIMIT 1`, params);
    if (q.rows[0]?.id) return q.rows[0].id;
  }

  // Next try accounts.fund_id joined via funds table
  if (hasFundIdCol && classPred) {
    const fId = await resolveFundId(db, entityCode, fundToken);
    if (fId) {
      const params = [fId, apLabel];
      let where = 'fund_id = $1 AND ' + (hasClassCol ? "LOWER(classification) LIKE LOWER($2) || '%'" : "LOWER(classifications) LIKE LOWER($2) || '%'");
      if (hasEntityIdCol && entityId) {
        params.push(entityId);
        where += ` AND entity_id = $${params.length}`;
      } else if (hasEntityCodeCol && entityCode) {
        params.push(entityCode);
        where += ` AND entity_code = $${params.length}`;
      }
      const q2 = await db.query(`SELECT id FROM accounts WHERE ${where} LIMIT 1`, params);
      if (q2.rows[0]?.id) return q2.rows[0].id;
    }
  }

  // Fallback: classification-only within entity
  if (classPred) {
    const params = [apLabel];
    let where = classClause(1);
    let next = 2;
    if (hasEntityIdCol && entityId) {
      where += ` AND entity_id = $${next++}`; params.push(entityId);
    } else if (hasEntityCodeCol && entityCode) {
      where += ` AND entity_code = $${next++}`; params.push(entityCode);
    }
    const q3 = await db.query(`SELECT id FROM accounts WHERE ${where} LIMIT 1`, params);
    if (q3.rows[0]?.id) return q3.rows[0].id;
  }

  // Final fallback: code/gl_code/number == '2000' within entity
  const possibleCodeCols = [];
  for (const col of ['code','gl_code','account_code','number','account_number']) {
    if (await hasColumn(db, 'accounts', col)) possibleCodeCols.push(col);
  }
  if (possibleCodeCols.length) {
    const ors = possibleCodeCols.map(c => `${c} = $1`).join(' OR ');
    const params = ['2000'];
    let where = `(${ors})`;
    if (hasEntityIdCol && entityId) {
      params.push(entityId); where += ` AND entity_id = $${params.length}`;
    } else if (hasEntityCodeCol && entityCode) {
      params.push(entityCode); where += ` AND entity_code = $${params.length}`;
    }
    const q4 = await db.query(`SELECT id FROM accounts WHERE ${where} LIMIT 1`, params);
    if (q4.rows[0]?.id) return q4.rows[0].id;
  }

  return null;
}

// Analyze endpoint – suggest mapping keys
router.post('/analyze', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const filePath = req.file.path;
  const content = fs.readFileSync(filePath, 'utf8');
  fs.unlinkSync(filePath);

  const rows = parse(content, { columns: true, skip_empty_lines: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];

  // Heuristic mapping per user answers
  const map = {};
  const norm = headers.reduce((acc, h) => { acc[normHeader(h)] = h; return acc; }, {});
  // Prefer new specified headers; fall back to older heuristics
  map.bank = norm['af_bank'] || norm['bank'] || headers.find(h => h.toLowerCase() === 'bank');
  map.paymentId = norm['paymentid'] || headers.find(h => h.toLowerCase().includes('payment') && h.toLowerCase().includes('id'));
  map.accountNo = norm['account_no'] || norm['account_no.'] || norm['account'] || headers.find(h => ['account no.','account no','account'].includes(h.toLowerCase()));
  map.paymentType = norm['payment_type'] || headers.find(h => h.toLowerCase().includes('payment') && h.toLowerCase().includes('type'));
  map.reference = norm['reference'] || headers.find(h => h.toLowerCase() === 'reference');
  map.amount = norm['amount'] || headers.find(h => h.toLowerCase().includes('amount'));
  map.vendorZid = norm['payee_zid'] || norm['vendor_zid'] || headers.find(h => ['zid','vendor zid'].includes(h.toLowerCase()));
  map.vendorName = norm['payee'] || norm['vendor'] || headers.find(h => h.toLowerCase().includes('vendor') && h.toLowerCase().includes('name'));
  map.effectiveDate = norm['post_date'] || norm['effective_date'] || norm['paid_date'];
  map.invoiceNumber = norm['invoice_grant_no'] || norm['invoice_no'] || headers.find(h => h.toLowerCase().includes('invoice') && h.toLowerCase().includes('no'));
  map.memo = norm['description'] || norm['memo'] || headers.find(h => h.toLowerCase().includes('memo') || h.toLowerCase().includes('description'));
  // Extra: include invoice_date and _1099 if present (not used in processing yet)
  if (norm['invoice_date']) map.invoiceDate = norm['invoice_date'];
  if (norm['1099_amount']) map.amount1099 = norm['1099_amount'];

  res.json({ headers, suggestedMapping: map, recordCount: rows.length, sampleData: rows.slice(0, 5) });
}));

// Process endpoint – background job
router.post('/process', asyncHandler(async (req, res) => {
  const { data, mapping, filename } = req.body || {};
  if (!Array.isArray(data) || !data.length) return res.status(400).json({ error: 'No data provided.' });
  if (!mapping) return res.status(400).json({ error: 'Mapping is required.' });

  const jobId = crypto.randomUUID();
  importJobs[jobId] = {
    id: jobId,
    status: 'processing',
    progress: 0,
    totalRecords: data.length,
    processedRecords: 0,
    errors: [],
    logs: [],
    createdBatches: [],
    createdItems: 0,
    createdJEs: [],
    startTime: new Date(),
    filename: filename || null
  };

  res.status(202).json({ message: 'Import started', id: jobId });

  setTimeout(async () => {
    const client = await pool.connect();
    const job = importJobs[jobId];
    try {
      await client.query('BEGIN');

      // Group pending EFT rows by (nacha_settings_id, fund_id, reference, effective_date)
      const pendingGroups = new Map();
      const completedRows = [];
      const postRows = [];

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const bank = row[mapping.bank];
        const paymentId = (row[mapping.paymentId] || '').toString().trim();
        const paymentType = (row[mapping.paymentType] || '').toString().trim();
        const reference = (row[mapping.reference] || '').toString().trim();
        const amountStr = row[mapping.amount];
        const memo = mapping.memo ? row[mapping.memo] : '';
        const vendorZid = mapping.vendorZid ? row[mapping.vendorZid] : '';
        const vendorName = mapping.vendorName ? row[mapping.vendorName] : '';
        const accountNo = mapping.accountNo ? row[mapping.accountNo] : '';
        const effectiveDateStr = mapping.effectiveDate ? row[mapping.effectiveDate] : '';
        const invoiceNumber = mapping.invoiceNumber ? row[mapping.invoiceNumber] : '';

        // Normalize amount from accounting format
        const amount = parseAccountingAmount(amountStr);
        
        if (!amount || isNaN(amount)) {
          job.logs.push({ i: i + 1, level: 'error', msg: 'Invalid amount' });
          continue;
        }

        const { entityCode, glCode, fundToken } = parseAccountNo(accountNo);
        const entityId = await resolveEntityId(client, entityCode);
        if (!entityId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unknown entity from Account No.: ${accountNo}` });
          continue;
        }
        const fundId = await resolveFundId(client, entityCode, fundToken);
        if (!fundId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unknown fund from Account No.: ${accountNo}` });
          continue;
        }

        const vendorId = await resolveVendor(client, { zid: vendorZid, name: vendorName });
        if (!vendorId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Vendor not found (zid/name): ${vendorZid || vendorName}` });
          continue;
        }

        const isCompleted = !!paymentId; // per user: Payment ID populated => completed

        // Prepare posting row for ALL rows (completed or pending)
        postRows.push({ i, row, entityId, amount, memo, entityCode, glCode, fundToken });

        if (isCompleted) {
          completedRows.push({ i, row, entityId, amount, memo, vendorId, entityCode, glCode, fundToken });
          continue;
        }

        // Pending: only EFT rows are eligible for NACHA/batches
        if (lower(paymentType) !== 'eft') {
          job.logs.push({ i: i + 1, level: 'info', msg: 'Skipped non-EFT pending row' });
          continue;
        }

        const nachaId = await resolveNachaSettingsId(client, entityId, bank);
        if (!nachaId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unable to resolve NACHA settings for bank: ${bank}` });
          continue;
        }

        const effDate = effectiveDateStr ? (parseDateMDY(effectiveDateStr) || new Date(effectiveDateStr)) : new Date();
        const key = `${nachaId}||${fundId}||${reference}||${effDate.toISOString().slice(0, 10)}`;
        if (!pendingGroups.has(key)) pendingGroups.set(key, { nachaId, reference, effDate, entityId, fundId, rows: [] });
        pendingGroups.get(key).rows.push({ i, vendorId, amount, memo });
      }

      // Create batches/items for pending groups
      for (const [key, group] of pendingGroups.entries()) {
        // Build batch_number from reference; status draft
        const batchNumber = group.reference || `BATCH-${Date.now()}`;
        const hasPbDesc = await hasColumn(client, 'payment_batches', 'description');
        const hasPbStatus = await hasColumn(client, 'payment_batches', 'status');
        const hasPbEffDate = await hasColumn(client, 'payment_batches', 'effective_date');
        const hasPbNacha = await hasColumn(client, 'payment_batches', 'nacha_settings_id');
        const cols = ['entity_id','fund_id'];
        const vals = [group.entityId, group.fundId];
        if (hasPbNacha) { cols.push('nacha_settings_id'); vals.push(group.nachaId); }
        cols.push('batch_number'); vals.push(batchNumber);
        cols.push('batch_date'); vals.push(new Date());
        if (hasPbEffDate) { cols.push('effective_date'); vals.push(group.effDate || new Date()); }
        if (hasPbDesc) { cols.push('description'); vals.push(group.reference || null); }
        cols.push('total_amount'); vals.push(0);
        if (hasPbStatus) { cols.push('status'); vals.push('Draft'); }
        const placeholders = vals.map((_,i)=>`$${i+1}`).join(',');
        const insBatch = await client.query(
          `INSERT INTO payment_batches (${cols.join(',')}) VALUES (${placeholders}) RETURNING id`,
          vals
        );
        const batchId = insBatch.rows[0].id;
        job.createdBatches.push(batchId);

        // Insert items, skip duplicates within this batch on (vendor_id, amount, description)
        for (const it of group.rows) {
          const vbaId = await resolveVendorBankAccountId(client, it.vendorId);
          if (!vbaId) {
            // Non-fatal: log and skip this item
            job.logs.push({ i: it.i + 1, level: 'error', msg: 'No active vendor bank account on file' });
            continue;
          }
          const dupCheck = await client.query(
            `SELECT 1 FROM payment_items WHERE payment_batch_id = $1 AND vendor_id = $2 AND amount = $3 AND COALESCE(memo,'') = COALESCE($4,'') LIMIT 1`,
            [batchId, it.vendorId, it.amount, it.memo || '']
          );
          if (dupCheck.rows.length) {
            job.logs.push({ i: it.i + 1, level: 'warn', msg: 'Duplicate in batch skipped' });
            continue;
          }

          // Insert item (status pending)
          try {
            const hasPiStatus = await hasColumn(client, 'payment_items', 'status');
            const itemCols = ['payment_batch_id','vendor_id','vendor_bank_account_id','amount','memo'];
            const itemVals = [batchId, it.vendorId, vbaId, it.amount, it.memo || ''];
            if (hasPiStatus) { itemCols.push('status'); itemVals.push('pending'); }
            const ph = itemVals.map((_,i)=>`$${i+1}`).join(',');
            await client.query(
              `INSERT INTO payment_items (${itemCols.join(',')}) VALUES (${ph})`,
              itemVals
            );
            job.createdItems += 1;
          } catch (e) {
            job.logs.push({ i: it.i + 1, level: 'error', msg: `Failed to insert item: ${e.message}` });
          }
        }

        // Update batch total
        const hasUpdatedAt = await hasColumn(client, 'payment_batches', 'updated_at');
        const setClauses = [
          `total_amount = COALESCE((SELECT SUM(amount) FROM payment_items WHERE payment_batch_id = $1),0)`
        ];
        if (hasUpdatedAt) setClauses.push('updated_at = NOW()');
        await client.query(`UPDATE payment_batches SET ${setClauses.join(', ')} WHERE id = $1`, [batchId]);
      }

      // Posting flow → create two posted JEs per row (Expense/AP then AP/Bank) for ALL rows
      for (const pr of postRows) {
        // Parse account/fund from Account No.
        const acctId = await resolveAccountId(client, pr.entityId, pr.glCode);
        const fundId = await resolveFundId(client, pr.entityCode, pr.fundToken);
        if (!acctId || !fundId) {
          job.logs.push({ i: pr.i + 1, level: 'error', msg: 'Account or Fund not resolvable for row' });
          continue;
        }

        // Resolve AP account by fund number classification
        const apAccountId = await resolveAPAccountId(client, { entityId: pr.entityId, entityCode: pr.entityCode, fundToken: pr.fundToken });
        if (!apAccountId) {
          job.logs.push({ i: pr.i + 1, level: 'error', msg: 'AP account (by fund/classification) not found' });
          continue;
        }

        // Resolve bank GL account: by bank name or fallback to first bank account for entity
        let bankGlAccountId = null;
        const bankVal = (data[pr.i][mapping.bank] || '').toString().trim();
        if (bankVal) {
          try {
            const r1 = await client.query(
              `SELECT gl_account_id FROM bank_accounts 
                WHERE (LOWER(account_name) = LOWER($1) OR LOWER(bank_name) = LOWER($1))
                LIMIT 1`,
              [bankVal]
            );
            bankGlAccountId = r1.rows[0]?.gl_account_id || null;
          } catch (_) { /* ignore */ }
        }
        if (!bankGlAccountId) {
          job.logs.push({ i: pr.i + 1, level: 'error', msg: bankVal ? `AF Bank not found in bank_accounts: ${bankVal}` : 'AF Bank value missing' });
          continue;
        }

        // Idempotency: separate reference column (required). Use same reference for both JEs.
        const ref = (data[pr.i][mapping.reference] || '').toString().trim();
        if (!ref) {
          job.logs.push({ i: pr.i + 1, level: 'error', msg: 'Missing reference' });
          continue;
        }
        const dupJe = await client.query('SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1', [ref]);
        if (dupJe.rows.length) {
          job.logs.push({ i: pr.i + 1, level: 'warn', msg: `Duplicate JEs skipped (ref ${ref})` });
          continue;
        }

        // Insert two posted journal entries with entry_mode = 'Auto' when column exists
        const hasEntryMode = await hasColumn(client, 'journal_entries', 'entry_mode');

        // JE1: Expense/AP (Debit Expense acctId, Credit AP apAccountId)
        const je1Cols = ['entity_id','entry_date','reference_number','description','total_amount','status','created_by','import_id'];
        const jeDate = (mapping.effectiveDate && data[pr.i][mapping.effectiveDate])
          ? (parseDateMDY(data[pr.i][mapping.effectiveDate]) || new Date())
          : new Date();
        const je1Vals = [pr.entityId, jeDate, ref, pr.memo || 'Payments import (Expense/AP)', pr.amount, 'Posted', 'Payments Import', jobId];
        if (hasEntryMode) { je1Cols.push('entry_mode'); je1Vals.push('Auto'); }
        const je1Ph = je1Vals.map((_,i)=>`$${i+1}`).join(',');
        const je1 = await client.query(
          `INSERT INTO journal_entries (${je1Cols.join(',')}) VALUES (${je1Ph}) RETURNING id`,
          je1Vals
        );
        const je1Id = je1.rows[0].id;
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,$4,0,$5)`,
          [je1Id, acctId, fundId, pr.amount, pr.memo || '']
        );
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,0,$4,$5)`,
          [je1Id, apAccountId, fundId, pr.amount, pr.memo || '']
        );
        job.createdJEs.push(je1Id);

        // JE2: AP/Bank (Debit AP, Credit Bank)
        const je2Cols = ['entity_id','entry_date','reference_number','description','total_amount','status','created_by','import_id'];
        const je2Vals = [pr.entityId, jeDate, ref, pr.memo || 'Payments import (AP/Bank)', pr.amount, 'Posted', 'Payments Import', jobId];
        if (hasEntryMode) { je2Cols.push('entry_mode'); je2Vals.push('Auto'); }
        const je2Ph = je2Vals.map((_,i)=>`$${i+1}`).join(',');
        const je2 = await client.query(
          `INSERT INTO journal_entries (${je2Cols.join(',')}) VALUES (${je2Ph}) RETURNING id`,
          je2Vals
        );
        const je2Id = je2.rows[0].id;
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,$4,0,$5)`,
          [je2Id, apAccountId, fundId, pr.amount, pr.memo || '']
        );
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,0,$4,$5)`,
          [je2Id, bankGlAccountId, fundId, pr.amount, pr.memo || '']
        );
        job.createdJEs.push(je2Id);
      }

      await client.query('COMMIT');
      job.status = 'completed';
      job.endTime = new Date();
      job.processedRecords = data.length;
      job.progress = 100;

      // Persist import run (best-effort)
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS vendor_payment_import_runs (
            id UUID PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            created_by INTEGER NULL,
            filename TEXT NULL,
            total_records INTEGER NOT NULL DEFAULT 0,
            processed_records INTEGER NOT NULL DEFAULT 0,
            created_batches INTEGER NOT NULL DEFAULT 0,
            created_items INTEGER NOT NULL DEFAULT 0,
            created_journal_entries INTEGER NOT NULL DEFAULT 0,
            errors INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'completed',
            log JSONB NOT NULL
          )`);
        const runId = crypto.randomUUID();
        const errorsCount = (job.errors?.length || 0) + (job.logs?.filter(l => l.level === 'error').length || 0);
        await pool.query(
          `INSERT INTO vendor_payment_import_runs (
             id, created_by, filename, total_records, processed_records, created_batches, created_items, created_journal_entries, errors, status, log
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            runId,
            null, // created_by unknown without auth on this route; filled when auth middleware adds req.user
            job.filename,
            job.totalRecords || 0,
            job.processedRecords || 0,
            (job.createdBatches?.length || 0),
            (job.createdItems || 0),
            (job.createdJEs?.length || 0),
            errorsCount,
            job.status,
            JSON.stringify(job.logs || [])
          ]
        );
        job.importRunId = runId;
      } catch (_) { /* ignore logging failures */ }
    } catch (e) {
      try { console.error('[VPI] Process error:', e && e.stack ? e.stack : e); } catch (_) {}
      await client.query('ROLLBACK');
      importJobs[jobId].status = 'failed';
      importJobs[jobId].errors.push(e && (e.detail || e.message || String(e)));
      // Ensure we don't report objects that were rolled back
      importJobs[jobId].createdBatches = [];
      importJobs[jobId].createdItems = 0;
      importJobs[jobId].createdJEs = [];
      importJobs[jobId].endTime = new Date();
      // Persist failed run (best-effort)
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS vendor_payment_import_runs (
            id UUID PRIMARY KEY,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            created_by INTEGER NULL,
            filename TEXT NULL,
            total_records INTEGER NOT NULL DEFAULT 0,
            processed_records INTEGER NOT NULL DEFAULT 0,
            created_batches INTEGER NOT NULL DEFAULT 0,
            created_items INTEGER NOT NULL DEFAULT 0,
            created_journal_entries INTEGER NOT NULL DEFAULT 0,
            errors INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'completed',
            log JSONB NOT NULL
          )`);
        const runId = crypto.randomUUID();
        const j = importJobs[jobId];
        const errorsCount = (j.errors?.length || 0) + (j.logs?.filter(l => l.level === 'error').length || 0);
        await pool.query(
          `INSERT INTO vendor_payment_import_runs (
             id, created_by, filename, total_records, processed_records, created_batches, created_items, created_journal_entries, errors, status, log
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            runId,
            null,
            j.filename,
            j.totalRecords || 0,
            j.processedRecords || 0,
            (j.createdBatches?.length || 0),
            (j.createdItems || 0),
            (j.createdJEs?.length || 0),
            errorsCount,
            j.status,
            JSON.stringify(j.logs || [])
          ]
        );
        j.importRunId = runId;
      } catch (_) { /* ignore logging failures */ }
    } finally {
      client.release();
    }
  }, 50);
}));

router.get('/status/:id', asyncHandler(async (req, res) => {
  const job = importJobs[req.params.id];
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
}));

// Return the most recent vendor payment import log
router.get('/last', asyncHandler(async (req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendor_payment_import_runs (
        id UUID PRIMARY KEY,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by INTEGER NULL,
        filename TEXT NULL,
        total_records INTEGER NOT NULL DEFAULT 0,
        processed_records INTEGER NOT NULL DEFAULT 0,
        created_batches INTEGER NOT NULL DEFAULT 0,
        created_items INTEGER NOT NULL DEFAULT 0,
        created_journal_entries INTEGER NOT NULL DEFAULT 0,
        errors INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'completed',
        log JSONB NOT NULL
      )`);

    // If auth is in place, prefer user-specific; otherwise global last
    const uid = req.user?.id;
    let q;
    if (uid) {
      q = await pool.query(
        `SELECT id, created_at, filename, total_records, processed_records, created_batches, created_items, created_journal_entries, errors, status, log
           FROM vendor_payment_import_runs
          WHERE created_by = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [uid]
      );
    } else {
      q = await pool.query(
        `SELECT id, created_at, filename, total_records, processed_records, created_batches, created_items, created_journal_entries, errors, status, log
           FROM vendor_payment_import_runs
          ORDER BY created_at DESC
          LIMIT 1`
      );
    }
    if (!q.rows.length) return res.json({ log: [], created_batches: 0, created_items: 0, created_journal_entries: 0, errors: 0 });
    const r = q.rows[0];
    return res.json({
      id: r.id,
      created_at: r.created_at,
      filename: r.filename,
      total_records: r.total_records,
      processed_records: r.processed_records,
      created_batches: r.created_batches,
      created_items: r.created_items,
      created_journal_entries: r.created_journal_entries,
      errors: r.errors,
      status: r.status,
      log: r.log
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}));

module.exports = router;
