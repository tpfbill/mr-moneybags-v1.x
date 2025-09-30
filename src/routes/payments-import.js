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
  try { console.log('[VPI DBG] NACHA resolve: hasEntityCol=', hasEntityCol, ' bank="'+bank+'"'); } catch(_){}
  if (bank) {
    // 1) Match company_nacha_settings.company_name
    let r;
    if (hasEntityCol && await hasColumn(db, 'company_nacha_settings', 'company_name')) {
      try { console.log('[VPI DBG] NACHA: try company_name match'); } catch(_){}
      try {
        r = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND LOWER(company_name) = LOWER($2) LIMIT 1',
          [entityId, bank]
        );
      } catch(e) { try { console.error('[VPI DBG] NACHA company_name query failed:', e.message||e); } catch(_){} }
      if (r.rows[0]?.id) return r.rows[0].id;
    }

    // 2) Match company_id
    if (hasEntityCol && await hasColumn(db, 'company_nacha_settings', 'company_id')) {
      try { console.log('[VPI DBG] NACHA: try company_id match'); } catch(_){}
      try {
        r = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND company_id = $2 LIMIT 1',
          [entityId, bank]
        );
      } catch(e) { try { console.error('[VPI DBG] NACHA company_id query failed:', e.message||e); } catch(_){} }
      if (r.rows[0]?.id) return r.rows[0].id;
    }

    // 3) Match via settlement bank account name
    if (hasEntityCol && 
      await hasColumn(db, 'company_nacha_settings', 'settlement_account_id') &&
      await hasColumn(db, 'bank_accounts', 'account_name')
    ) {
      try { console.log('[VPI DBG] NACHA: try settlement join match'); } catch(_){}
      try {
        r = await db.query(
          `SELECT cns.id
           FROM company_nacha_settings cns
           JOIN bank_accounts ba ON ba.id = cns.settlement_account_id
          WHERE cns.entity_id = $1 AND LOWER(ba.account_name) = LOWER($2)
          LIMIT 1`, [entityId, bank]
        );
      } catch(e) { try { console.error('[VPI DBG] NACHA settlement join failed:', e.message||e); } catch(_){} }
      if (r.rows[0]?.id) return r.rows[0].id;
    }
  }

  // 4) Fallback to any settings for the entity. Prefer default when column exists; gracefully degrade if not.
  if (hasEntityCol) {
    const hasIsDefault = await hasColumn(db, 'company_nacha_settings', 'is_default');
    const hasCreatedAt = await hasColumn(db, 'company_nacha_settings', 'created_at');
    if (hasIsDefault) {
      try {
        try { console.log('[VPI DBG] NACHA: try entity default order by is_default'); } catch(_){}
        const d = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY is_default DESC NULLS LAST, created_at ASC LIMIT 1',
          [entityId]
        );
        if (d.rows[0]?.id) return d.rows[0].id;
      } catch (e) { try { console.error('[VPI DBG] NACHA entity is_default query failed:', e.message||e); } catch(_){} }
    }
    if (hasCreatedAt) {
      try {
        try { console.log('[VPI DBG] NACHA: try entity order by created_at'); } catch(_){}
        const d2 = await db.query(
          'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY created_at ASC LIMIT 1',
          [entityId]
        );
        if (d2.rows[0]?.id) return d2.rows[0].id;
      } catch (e) { try { console.error('[VPI DBG] NACHA entity created_at query failed:', e.message||e); } catch(_){} }
    }
  }
  // Last-resort: any record in table
  const hasCreatedAtAny = await hasColumn(db, 'company_nacha_settings', 'created_at');
  if (hasCreatedAtAny) {
    try {
      try { console.log('[VPI DBG] NACHA: try any order by created_at'); } catch(_){}
      const any = await db.query('SELECT id FROM company_nacha_settings ORDER BY created_at ASC LIMIT 1');
      if (any.rows[0]?.id) return any.rows[0].id;
    } catch (e) { try { console.error('[VPI DBG] NACHA any created_at query failed:', e.message||e); } catch(_){} }
  }
  try { console.log('[VPI DBG] NACHA: try any plain'); } catch(_){}
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
  for (const h of headers) {
    const hl = h.toLowerCase();
    if (!map.bank && hl === 'bank') map.bank = h;
    if (!map.paymentId && hl.includes('payment') && hl.includes('id')) map.paymentId = h;
    if (!map.accountNo && (hl === 'account no.' || hl === 'account no' || hl === 'account')) map.accountNo = h;
    if (!map.paymentType && hl.includes('payment') && hl.includes('type')) map.paymentType = h;
    if (!map.reference && hl === 'reference') map.reference = h;
    if (!map.amount && (hl === 'amount' || hl.includes('amount'))) map.amount = h;
    if (!map.vendorZid && (hl === 'zid' || hl === 'vendor zid')) map.vendorZid = h;
    if (!map.vendorName && hl.includes('vendor') && hl.includes('name')) map.vendorName = h;
    if (!map.effectiveDate && (hl === 'effective date' || hl === 'effective_date')) map.effectiveDate = h;
    if (!map.paidDate && (hl === 'paid date' || hl === 'paid_date')) map.paidDate = h;
    if (!map.memo && (hl.includes('memo') || hl.includes('description'))) map.memo = h;
    if (!map.invoiceNumber && (hl.includes('invoice') && hl.includes('number'))) map.invoiceNumber = h;
  }

  res.json({ headers, suggestedMapping: map, recordCount: rows.length, sampleData: rows.slice(0, 5) });
}));

// Process endpoint – background job
router.post('/process', asyncHandler(async (req, res) => {
  const { data, mapping } = req.body || {};
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
    startTime: new Date()
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

        // Normalize amount (remove $ , and spaces)
        const amount = parseFloat(String(amountStr ?? '').replace(/[$,\s]/g, ''));
        if (i === 0) { try { console.log('[VPI DBG] row0 amount parsed:', amount); } catch(_){} }
        if (!amount || isNaN(amount)) {
          job.logs.push({ i: i + 1, level: 'error', msg: 'Invalid amount' });
          continue;
        }

        const { entityCode, glCode, fundToken } = parseAccountNo(accountNo);
        if (i === 0) { try { console.log('[VPI DBG] row0 acct parsed:', { entityCode, glCode, fundToken }); } catch(_){} }
        const entityId = await resolveEntityId(client, entityCode);
        if (i === 0) { try { console.log('[VPI DBG] row0 entityId:', entityId); } catch(_){} }
        if (!entityId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unknown entity from Account No.: ${accountNo}` });
          continue;
        }
        const fundId = await resolveFundId(client, entityCode, fundToken);
        if (i === 0) { try { console.log('[VPI DBG] row0 fundId:', fundId); } catch(_){} }
        if (!fundId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unknown fund from Account No.: ${accountNo}` });
          continue;
        }

        const vendorId = await resolveVendor(client, { zid: vendorZid, name: vendorName });
        if (i === 0) { try { console.log('[VPI DBG] row0 vendorId:', vendorId); } catch(_){} }
        if (!vendorId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Vendor not found (zid/name): ${vendorZid || vendorName}` });
          continue;
        }

        const isCompleted = !!paymentId; // per user: Payment ID populated => completed

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
        if (i === 0) { try { console.log('[VPI DBG] row0 nachaId:', nachaId); } catch(_){} }
        if (!nachaId) {
          job.logs.push({ i: i + 1, level: 'error', msg: `Unable to resolve NACHA settings for bank: ${bank}` });
          continue;
        }

        const effDate = effectiveDateStr ? new Date(effectiveDateStr) : new Date();
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

      // Completed flow → post JEs
      for (const c of completedRows) {
        // Resolve bank GL account by matching bank name first, then fallback to any entity bank account
        let bankGlAccountId = null;
        const bankVal = (data[c.i][mapping.bank] || '').toString().trim();
        if (bankVal) {
          const r1 = await client.query(
            `SELECT gl_account_id FROM bank_accounts 
              WHERE (LOWER(account_name) = LOWER($1) OR LOWER(bank_name) = LOWER($1))
              LIMIT 1`,
            [bankVal]
          );
          bankGlAccountId = r1.rows[0]?.gl_account_id || null;
        }
        if (!bankGlAccountId) {
          const r2 = await client.query(
            `SELECT gl_account_id FROM bank_accounts 
              WHERE entity_id = $1 ORDER BY created_at ASC LIMIT 1`,
            [c.entityId]
          );
          bankGlAccountId = r2.rows[0]?.gl_account_id || null;
        }
        if (!bankGlAccountId) {
          job.logs.push({ i: c.i + 1, level: 'error', msg: 'Bank GL account not resolvable for completed row' });
          continue;
        }

        // Parse account/fund from Account No.
        const acctId = await resolveAccountId(client, c.entityId, c.glCode);
        const fundId = await resolveFundId(client, c.entityCode, c.fundToken);
        if (!acctId || !fundId) {
          job.logs.push({ i: c.i + 1, level: 'error', msg: 'Account or Fund not resolvable for completed row' });
          continue;
        }

        // Idempotency: separate reference column (required)
        const ref = (data[c.i][mapping.reference] || '').toString().trim();
        if (!ref) {
          job.logs.push({ i: c.i + 1, level: 'error', msg: 'Missing separate reference for completed row' });
          continue;
        }
        const dupJe = await client.query('SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1', [ref]);
        if (dupJe.rows.length) {
          job.logs.push({ i: c.i + 1, level: 'warn', msg: `Duplicate JE skipped (ref ${ref})` });
          continue;
        }

        // Create posted JE: credit bank, debit expense/AP (acctId)
        const je = await client.query(
          `INSERT INTO journal_entries (entity_id, entry_date, reference_number, description, total_amount, status, created_by, import_id)
           VALUES ($1,$2,$3,$4,$5,'Posted','Payments Import',$6)
           RETURNING id`,
          [
            c.entityId,
            new Date(),
            ref,
            c.memo || 'Completed payment import',
            c.amount,
            jobId
          ]
        );
        const jeId = je.rows[0].id;

        // Debit expense/AP (acctId)
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,$4,0,$5)`,
          [jeId, acctId, fundId, c.amount, c.memo || '']
        );
        // Credit bank GL
        await client.query(
          `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
           VALUES ($1,$2,$3,0,$4,$5)`,
          [jeId, bankGlAccountId, fundId, c.amount, c.memo || '']
        );

        job.createdJEs.push(jeId);
      }

      await client.query('COMMIT');
      job.status = 'completed';
      job.endTime = new Date();
      job.processedRecords = data.length;
      job.progress = 100;
    } catch (e) {
      try { console.error('[VPI] Process error:', e && e.stack ? e.stack : e); } catch (_) {}
      await client.query('ROLLBACK');
      importJobs[jobId].status = 'failed';
      importJobs[jobId].errors.push(e && (e.detail || e.message || String(e)));
      importJobs[jobId].endTime = new Date();
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

module.exports = router;
