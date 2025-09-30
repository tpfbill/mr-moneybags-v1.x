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
  const { rows } = await db.query('SELECT id FROM entities WHERE code = $1 LIMIT 1', [entityCode]);
  return rows[0]?.id || null;
}

async function resolveAccountId(db, entityId, glCode) {
  if (!entityId || !glCode) return null;
  // Try exact accounts.code within entity
  const r = await db.query('SELECT id FROM accounts WHERE entity_id = $1 AND code = $2 LIMIT 1', [entityId, glCode]);
  return r.rows[0]?.id || null;
}

async function resolveFundId(db, entityCode, fundToken) {
  if (!entityCode || !fundToken) return null;
  // Try multiple shapes to accommodate live DB variations
  try {
    const r1 = await db.query(
      'SELECT id FROM funds WHERE entity_code = $1 AND fund_number = $2 LIMIT 1',
      [entityCode, fundToken]
    );
    if (r1.rows[0]?.id) return r1.rows[0].id;
  } catch (_) { /* column may not exist */ }

  try {
    const r2 = await db.query(
      'SELECT id FROM funds WHERE entity_code = $1 AND LOWER(fund_code) = LOWER($2) LIMIT 1',
      [entityCode, fundToken]
    );
    if (r2.rows[0]?.id) return r2.rows[0].id;
  } catch (_) { /* column may not exist */ }

  try {
    const r3 = await db.query(
      `SELECT f.id FROM funds f
         JOIN entities e ON f.entity_id = e.id
        WHERE e.code = $1 AND f.fund_number = $2
        LIMIT 1`,
      [entityCode, fundToken]
    );
    if (r3.rows[0]?.id) return r3.rows[0].id;
  } catch (_) { /* entity_id shape */ }

  try {
    const r4 = await db.query(
      `SELECT f.id FROM funds f
         JOIN entities e ON f.entity_id = e.id
        WHERE e.code = $1 AND LOWER(f.fund_code) = LOWER($2)
        LIMIT 1`,
      [entityCode, fundToken]
    );
    if (r4.rows[0]?.id) return r4.rows[0].id;
  } catch (_) { /* entity_id shape */ }

  try {
    const r5 = await db.query('SELECT id FROM funds WHERE fund_number = $1 LIMIT 1', [fundToken]);
    if (r5.rows[0]?.id) return r5.rows[0].id;
  } catch (_) { /* ignore */ }

  try {
    const r6 = await db.query('SELECT id FROM funds WHERE LOWER(fund_code) = LOWER($1) LIMIT 1', [fundToken]);
    if (r6.rows[0]?.id) return r6.rows[0].id;
  } catch (_) { /* ignore */ }

  return null;
}

async function resolveVendor(db, { zid, name }) {
  if (zid) {
    const rz = await db.query('SELECT id FROM vendors WHERE LOWER(zid) = LOWER($1) LIMIT 1', [zid]);
    if (rz.rows[0]?.id) return rz.rows[0].id;
  }
  if (name) {
    const rn = await db.query('SELECT id FROM vendors WHERE LOWER(name) = LOWER($1)', [name]);
    if (rn.rows.length === 1) return rn.rows[0].id;
  }
  return null;
}

async function resolveNachaSettingsId(db, entityId, bankVal) {
  if (!entityId) return null;
  const bank = (bankVal || '').toString().trim();
  if (bank) {
    // 1) Match company_nacha_settings.company_name
    let r = await db.query(
      'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND LOWER(company_name) = LOWER($2) LIMIT 1',
      [entityId, bank]
    );
    if (r.rows[0]?.id) return r.rows[0].id;

    // 2) Match company_id
    r = await db.query(
      'SELECT id FROM company_nacha_settings WHERE entity_id = $1 AND company_id = $2 LIMIT 1',
      [entityId, bank]
    );
    if (r.rows[0]?.id) return r.rows[0].id;

    // 3) Match via settlement bank account name
    try {
      r = await db.query(
        `SELECT cns.id
         FROM company_nacha_settings cns
         JOIN bank_accounts ba ON ba.id = cns.settlement_account_id
        WHERE cns.entity_id = $1 AND LOWER(ba.account_name) = LOWER($2)
        LIMIT 1`, [entityId, bank]
      );
      if (r.rows[0]?.id) return r.rows[0].id;
    } catch (_) { /* settlement link not available */ }
  }

  // 4) Fallback to any settings for the entity. Prefer default when column exists; gracefully degrade if not.
  try {
    const d = await db.query(
      'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY is_default DESC NULLS LAST, created_at ASC LIMIT 1',
      [entityId]
    );
    return d.rows[0]?.id || null;
  } catch (_) {
    const d2 = await db.query(
      'SELECT id FROM company_nacha_settings WHERE entity_id = $1 ORDER BY created_at ASC LIMIT 1',
      [entityId]
    );
    return d2.rows[0]?.id || null;
  }
}

async function resolveVendorBankAccountId(db, vendorId) {
  if (!vendorId) return null;
  // Prefer primary active account
  const q = await db.query(
    `SELECT id FROM vendor_bank_accounts 
      WHERE vendor_id = $1 AND LOWER(status) = 'active'
      ORDER BY is_primary DESC, created_at ASC LIMIT 1`,
    [vendorId]
  );
  return q.rows[0]?.id || null;
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

        const effDate = effectiveDateStr ? new Date(effectiveDateStr) : new Date();
        const key = `${nachaId}||${fundId}||${reference}||${effDate.toISOString().slice(0, 10)}`;
        if (!pendingGroups.has(key)) pendingGroups.set(key, { nachaId, reference, effDate, entityId, fundId, rows: [] });
        pendingGroups.get(key).rows.push({ i, vendorId, amount, memo });
      }

      // Create batches/items for pending groups
      for (const [key, group] of pendingGroups.entries()) {
        // Build batch_number from reference; status draft
        const batchNumber = group.reference || `BATCH-${Date.now()}`;
        const insBatch = await client.query(
          `INSERT INTO payment_batches (entity_id, fund_id, nacha_settings_id, batch_number, batch_date, description, total_amount, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id`,
          [
            group.entityId,
            group.fundId,
            group.nachaId,
            batchNumber,
            new Date(),
            group.reference || null,
            0,
            'Draft'
          ]
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
            await client.query(
              `INSERT INTO payment_items (payment_batch_id, vendor_id, vendor_bank_account_id, amount, memo, status)
               VALUES ($1,$2,$3,$4,$5,$6)`,
              [batchId, it.vendorId, vbaId, it.amount, it.memo || '', 'pending']
            );
            job.createdItems += 1;
          } catch (e) {
            job.logs.push({ i: it.i + 1, level: 'error', msg: `Failed to insert item: ${e.message}` });
          }
        }

        // Update batch total
        await client.query(
          `UPDATE payment_batches
             SET total_amount = COALESCE((SELECT SUM(amount) FROM payment_items WHERE payment_batch_id = $1),0),
                 updated_at = NOW()
           WHERE id = $1`,
          [batchId]
        );
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
      await client.query('ROLLBACK');
      importJobs[jobId].status = 'failed';
      importJobs[jobId].errors.push(e.message);
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
