// src/routes/vendor-payments.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Basic information_schema guard
async function hasColumn(db, table, column) {
  try {
    const q = await db.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
      [table, column]
    );
    return q.rows.length > 0;
  } catch (_) {
    return false;
  }
}

async function getEntityIdByCode(db, code) {
  const r = await db.query('SELECT id FROM entities WHERE code = $1 LIMIT 1', [code]);
  return r.rows[0]?.id || null;
}

async function getFundIdByNumber(db, fundNumber) {
  const r = await db.query('SELECT id FROM funds WHERE fund_number = $1 LIMIT 1', [fundNumber]);
  return r.rows[0]?.id || null;
}

async function getAccountByCode(db, accountCode) {
  const r = await db.query('SELECT * FROM accounts WHERE account_code = $1 LIMIT 1', [accountCode]);
  return r.rows[0] || null;
}

async function getAccountById(db, id) {
  const r = await db.query('SELECT * FROM accounts WHERE id = $1 LIMIT 1', [id]);
  return r.rows[0] || null;
}

async function findAPAccount(db, entityCode, fundNumber) {
  const r = await db.query(
    `SELECT id FROM accounts 
     WHERE classification = 'Accounts Payable' 
       AND entity_code = $1 AND fund_number = $2
     LIMIT 1`,
    [entityCode, fundNumber]
  );
  return r.rows[0]?.id || null;
}

async function findARAccount(db, entityCode, fundNumber) {
  // Prefer gl_code 1008 when present
  const r = await db.query(
    `SELECT id FROM accounts 
       WHERE classification = 'Accounts Receivable' 
         AND entity_code = $1 AND fund_number = $2
       ORDER BY (gl_code = '1008') DESC
       LIMIT 1`,
    [entityCode, fundNumber]
  );
  return r.rows[0]?.id || null;
}

async function findBankAccountByName(db, bankName) {
  if (!bankName) return null;
  // Try bank_name exact, then account_name exact, then ILIKE fuzzy on both
  const q = `
    SELECT *
      FROM bank_accounts
     WHERE LOWER(bank_name) = LOWER($1)
        OR LOWER(account_name) = LOWER($1)
     ORDER BY created_at DESC
     LIMIT 1
  `;
  const r = await db.query(q, [bankName]);
  if (r.rows[0]) return r.rows[0];
  const r2 = await db.query(
    `SELECT * FROM bank_accounts WHERE bank_name ILIKE $1 OR account_name ILIKE $1 ORDER BY created_at DESC LIMIT 1`,
    [bankName]
  );
  return r2.rows[0] || null;
}

// NOTE: Per user instruction, do NOT use NACHA settings to resolve bank account.
// Only resolve by matching bank_accounts.account_name (preferred) or bank_name (fallback)
async function resolveBankAccountByNameOnly(db, name) {
  if (!name) return null;
  return await findBankAccountByName(db, name);
}

async function findEftClearingAccountByEntity(db, entityCode) {
  const r = await db.query(
    `SELECT id FROM accounts WHERE gl_code = '1020' AND entity_code = $1 LIMIT 1`,
    [entityCode]
  );
  return r.rows[0]?.id || null;
}

async function insertJournalEntry(db, { entityId, entryDate, reference, description, totalAmount, paymentItemId, createdBy }) {
  // Build dynamic insert for optional columns
  const cols = ['entity_id', 'entry_date', 'total_amount'];
  const vals = [entityId, entryDate, totalAmount];
  const ph = () => `$${vals.length}`;

  if (await hasColumn(db, 'journal_entries', 'reference_number')) {
    cols.push('reference_number'); vals.push(reference);
  } else if (await hasColumn(db, 'journal_entries', 'reference')) {
    cols.push('reference'); vals.push(reference);
  }
  if (await hasColumn(db, 'journal_entries', 'description')) {
    cols.push('description'); vals.push(description || '');
  }
  if (await hasColumn(db, 'journal_entries', 'status')) {
    cols.push('status'); vals.push('Posted');
  }
  if (await hasColumn(db, 'journal_entries', 'entry_mode')) {
    cols.push('entry_mode'); vals.push('Auto');
  }
  if (await hasColumn(db, 'journal_entries', 'payment_item_id') && paymentItemId) {
    cols.push('payment_item_id'); vals.push(paymentItemId);
  }
  if (await hasColumn(db, 'journal_entries', 'created_by') && createdBy) {
    cols.push('created_by'); vals.push(createdBy);
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  const sql = `INSERT INTO journal_entries (${cols.join(',')}) VALUES (${placeholders}) RETURNING id`;
  const r = await db.query(sql, vals);
  return r.rows[0].id;
}

async function insertJeLine(db, { journalEntryId, accountId, fundId, debit, credit, description }) {
  const cols = ['journal_entry_id', 'account_id', 'fund_id', 'debit', 'credit'];
  const vals = [journalEntryId, accountId, fundId, debit || 0, credit || 0];
  if (await hasColumn(db, 'journal_entry_items', 'description')) {
    cols.push('description'); vals.push(description || '');
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`).join(',');
  await db.query(`INSERT INTO journal_entry_items (${cols.join(',')}) VALUES (${placeholders})`, vals);
}

// POST /api/vendor-payments/pay
// Body: { payment_item_ids: [uuid,...] }
router.post('/pay', asyncHandler(async (req, res) => {
  const ids = req.body?.payment_item_ids || req.body?.ids || [];
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'payment_item_ids array is required' });
  }

  const client = await pool.connect();
  const results = [];
  try {
    for (const id of ids) {
      const itemResult = { payment_item_id: id };
      try {
        await client.query('BEGIN');

        // Lock the item
        // Lock only the payment_items row (avoid locking nullable side of an outer join)
        const { rows: piRows } = await client.query(
          `SELECT * FROM payment_items WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (!piRows.length) {
          throw new Error('Payment item not found');
        }
        const pi = piRows[0];

        // Fetch batch bank_name separately (no join in the FOR UPDATE query)
        let batchBankName = null;
        if (pi.payment_batch_id) {
          try {
            const rbn = await client.query(
              `SELECT bank_name FROM payment_batches WHERE id = $1 LIMIT 1`,
              [pi.payment_batch_id]
            );
            batchBankName = rbn.rows[0]?.bank_name || null;
          } catch (_) {
            batchBankName = null;
          }
        }

        const amount = Math.abs(Number(pi.amount || 0));
        if (!amount) throw new Error('Invalid amount');
        const entryDate = pi.post_date || new Date();
        const reference = pi.reference || pi.invoice_number || String(pi.id);
        const description = pi.description || '';
        const paymentType = (pi.payment_type || '').toString().toUpperCase();
        const bankName = pi.bank_name || batchBankName || null;

        // Expense account from payment item.account_number (canonical)
        let expenseAccount = await getAccountByCode(client, pi.account_number);
        if (!expenseAccount && pi.entity_code && pi.gl_code && pi.fund_number) {
          const r = await client.query(
            `SELECT * FROM accounts WHERE entity_code=$1 AND gl_code=$2 AND fund_number=$3 LIMIT 1`,
            [pi.entity_code, pi.gl_code, pi.fund_number]
          );
          expenseAccount = r.rows[0] || null;
        }
        if (!expenseAccount) throw new Error('Expense account not found from account_number');

        const entityId = await getEntityIdByCode(client, expenseAccount.entity_code);
        if (!entityId) throw new Error('Entity not found for expense account');
        const expenseFundId = await getFundIdByNumber(client, expenseAccount.fund_number);
        if (!expenseFundId) throw new Error('Fund not found for expense account');

        // AP/AR accounts in the item fund
        const apAccountId = await findAPAccount(client, expenseAccount.entity_code, expenseAccount.fund_number);
        if (!apAccountId) throw new Error('Accounts Payable account not found for item fund');
        const arAccountId = await findARAccount(client, expenseAccount.entity_code, expenseAccount.fund_number);
        if (!arAccountId) throw new Error('Accounts Receivable account not found for item fund');

        // Resolve bank account strictly by account_name/bank_name (no NACHA linking)
        const bankAcct = await resolveBankAccountByNameOnly(client, bankName);
        if (!bankAcct || !bankAcct.cash_account_id) {
          throw new Error('Bank cash account not found by account_name/bank_name');
        }
        const bankCash = await getAccountById(client, bankAcct.cash_account_id);
        if (!bankCash) throw new Error('Bank cash GL account not found');
        const bankFundId = await getFundIdByNumber(client, bankCash.fund_number);
        if (!bankFundId) throw new Error('Bank fund not found');

        // Optional EFT clearing account by payment item's entity_code (gl_code = 1020)
        const isEft = paymentType === 'EFT';
        let eftAccountId = null;
        if (isEft) {
          const itemEntityCode = pi.entity_code || expenseAccount.entity_code;
          eftAccountId = await findEftClearingAccountByEntity(client, itemEntityCode);
          if (!eftAccountId) throw new Error('EFT clearing (gl_code 1020) account not found for item entity');
        }

        // JE1: Expense Dr (item fund) / AP Cr (item fund)
        const je1Id = await insertJournalEntry(client, {
          entityId,
          entryDate,
          reference,
          description,
          totalAmount: amount,
          paymentItemId: id,
          createdBy: (req.user && req.user.id) || null
        });
        await insertJeLine(client, { journalEntryId: je1Id, accountId: expenseAccount.id, fundId: expenseFundId, debit: amount, credit: 0, description });
        await insertJeLine(client, { journalEntryId: je1Id, accountId: apAccountId,      fundId: expenseFundId, debit: 0,      credit: amount, description });

        // JE2: Bank Cash Dr (bank fund) / AR Cr (item fund)
        const je2Id = await insertJournalEntry(client, {
          entityId,
          entryDate,
          reference,
          description,
          totalAmount: amount,
          paymentItemId: id,
          createdBy: (req.user && req.user.id) || null
        });
        await insertJeLine(client, { journalEntryId: je2Id, accountId: bankCash.id,  fundId: bankFundId,   debit: amount, credit: 0,      description });
        await insertJeLine(client, { journalEntryId: je2Id, accountId: arAccountId,  fundId: expenseFundId, debit: 0,      credit: amount, description });

        // JE3: EFT only — Debit and Credit same EFT clearing (bank fund)
        let je3Id = null;
        if (isEft) {
          je3Id = await insertJournalEntry(client, {
            entityId,
            entryDate,
            reference,
            description,
            totalAmount: amount,
            paymentItemId: id,
            createdBy: (req.user && req.user.id) || null
          });
          await insertJeLine(client, { journalEntryId: je3Id, accountId: eftAccountId, fundId: bankFundId, debit: amount, credit: 0, description });
          await insertJeLine(client, { journalEntryId: je3Id, accountId: eftAccountId, fundId: bankFundId, debit: 0,      credit: amount, description });
        }

        // JE4: AP Dr (item fund) / Bank Cash Cr (bank fund)
        const je4Id = await insertJournalEntry(client, {
          entityId,
          entryDate,
          reference,
          description,
          totalAmount: amount,
          paymentItemId: id,
          createdBy: (req.user && req.user.id) || null
        });
        await insertJeLine(client, { journalEntryId: je4Id, accountId: apAccountId,   fundId: expenseFundId, debit: amount, credit: 0,      description });
        await insertJeLine(client, { journalEntryId: je4Id, accountId: bankCash.id,   fundId: bankFundId,    debit: 0,      credit: amount, description });

        // Persist on payment item
        // Mark processed (schema allows: pending/approved/processed/...) and store JE1 on journal_entry_id
        const updates = [];
        const params = [];
        let idx = 1;
        if (await hasColumn(client, 'payment_items', 'journal_entry_id')) {
          updates.push(`journal_entry_id = $${idx++}`); params.push(je1Id);
        }
        if (await hasColumn(client, 'payment_items', 'status')) {
          updates.push(`status = 'processed'`);
        }
        if (updates.length) {
          params.push(id);
          await client.query(`UPDATE payment_items SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params);
        }

        await client.query('COMMIT');

        itemResult.ok = true;
        itemResult.journal_entries = { je1Id, je2Id, je3Id, je4Id };
      } catch (err) {
        await client.query('ROLLBACK');
        itemResult.ok = false;
        itemResult.error = err.message || String(err);
      }
      results.push(itemResult);
    }

    res.json({ results });
  } finally {
    client.release();
  }
}));

module.exports = router;
