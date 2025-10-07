// src/routes/liabilities.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// --- Schema helpers (kept local to avoid cross-module coupling) ------------
async function hasColumn(db, tableName, colName) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, colName]
  );
  return rows.length > 0;
}

async function getJeiCoreCols(db) {
  const jeRefCandidates = ['journal_entry_id', 'entry_id', 'je_id'];
  const accRefCandidates = ['account_id', 'gl_account_id', 'acct_id', 'account'];
  const debitCandidates = ['debit', 'debits', 'dr_amount', 'debit_amount', 'dr'];
  const creditCandidates = ['credit', 'credits', 'cr_amount', 'credit_amount', 'cr'];

  const pickFirst = async (cands) => {
    for (const c of cands) {
      if (await hasColumn(db, 'journal_entry_items', c)) return c;
    }
    return cands[0];
  };

  return {
    jeRef: await pickFirst(jeRefCandidates),
    accRef: await pickFirst(accRefCandidates),
    debitCol: await pickFirst(debitCandidates),
    creditCol: await pickFirst(creditCandidates)
  };
}

// GET /api/liabilities
// Returns liability accounts with computed current_balance and the aggregated total
router.get('/', asyncHandler(async (req, res) => {
  // Detect posted filter tolerance
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

  const jei = await getJeiCoreCols(pool);

  // Liability detection: classification contains 'liab' OR gl_code starts with '2'
  // Compute current_balance as beginning_balance + SUM(debit - credit) over posted items
  const sql = `
    WITH acc AS (
      SELECT 
        a.id,
        a.account_code,
        a.gl_code,
        a.classification,
        COALESCE(a.beginning_balance, 0)::numeric + COALESCE((
          SELECT SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0))
            FROM journal_entry_items jel
            JOIN journal_entries je ON jel.${jei.jeRef} = je.id
           WHERE jel.${jei.accRef}::text = a.id::text
             AND ${postedFilter}
        ), 0::numeric) AS current_balance
      FROM accounts a
      WHERE 
        (LOWER(COALESCE(a.classification,'')) LIKE '%liab%')
        OR (COALESCE(a.gl_code,'')::text LIKE '2%')
    )
    SELECT 
      acc.*, 
      (
        SELECT COALESCE(SUM(CASE WHEN current_balance < 0 THEN -current_balance ELSE 0 END), 0::numeric)
        FROM acc
      ) AS total_liabilities
    FROM acc
    ORDER BY acc.account_code, acc.gl_code;
  `;

  const { rows } = await pool.query(sql);
  const total = rows.length ? rows[0].total_liabilities : 0;
  const accounts = rows.map(({ total_liabilities, ...rest }) => rest);
  res.json({ total: Number(total), accounts });
}));

module.exports = router;
