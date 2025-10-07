// src/routes/metrics.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Helpers
async function hasColumn(db, tableName, colName) {
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 AND column_name = $2 LIMIT 1`,
    [tableName, colName]
  );
  return rows.length > 0;
}

async function getJeiCoreCols(db) {
  const jeRefCandidates = ['journal_entry_id', 'entry_id', 'je_id'];
  const fundRefCandidates = ['fund_id', 'fund', 'fundid'];
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
    fundRef: await pickFirst(fundRefCandidates),
    debitCol: await pickFirst(debitCandidates),
    creditCol: await pickFirst(creditCandidates)
  };
}

// GET /api/metrics
// Returns { assets, liabilities, net_assets, revenue_ytd }
router.get('/', asyncHandler(async (req, res) => {
  const year = new Date().getFullYear();
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  // Posted tolerance
  const hasStatusCol = await hasColumn(pool, 'journal_entries', 'status');
  const hasPostedCol = await hasColumn(pool, 'journal_entries', 'posted');
  const postCond = (hasStatusCol && hasPostedCol)
    ? `(je.posted = TRUE OR je.status ILIKE 'post%')`
    : (hasStatusCol ? `(je.status ILIKE 'post%')` : (hasPostedCol ? `(je.posted = TRUE)` : 'TRUE'));

  // Funds balance expression mirrors src/routes/funds.js, summed for assets
  const jei = await getJeiCoreCols(pool);
  const hasSB = await hasColumn(pool, 'funds', 'starting_balance');
  const sbExpr = hasSB ? 'COALESCE(f.starting_balance, 0::numeric)' : '0::numeric';
  const hasFundNumber = await hasColumn(pool, 'funds', 'fund_number');
  const hasFundCode = await hasColumn(pool, 'funds', 'fund_code');

  const fundMatchParts = [ `(jel.${jei.fundRef}::text = f.id::text)` ];
  if (hasFundNumber) fundMatchParts.push(`(jel.${jei.fundRef}::text = f.fund_number::text)`);
  if (hasFundCode)   fundMatchParts.push(`(jel.${jei.fundRef}::text = f.fund_code::text)`);
  const fundMatchClause = fundMatchParts.join(' OR ');

  const assetsSql = `
    SELECT COALESCE(SUM(${sbExpr} + COALESCE((
      SELECT SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0))
        FROM journal_entry_items jel
        JOIN journal_entries je ON jel.${jei.jeRef} = je.id
       WHERE (${fundMatchClause})
         AND ${postCond}
    ), 0::numeric)), 0::numeric) AS assets
    FROM funds f
  `;

  // Liabilities: sum magnitudes of negative current_balance across liability accounts
  const liabilitiesSql = `
    WITH acc AS (
      SELECT 
        a.id,
        COALESCE(a.beginning_balance, 0)::numeric + COALESCE((
          SELECT SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0))
            FROM journal_entry_items jel
            JOIN journal_entries je ON jel.${jei.jeRef} = je.id
           WHERE jel.account_id::text = a.id::text
             AND ${postCond}
        ), 0::numeric) AS current_balance
      FROM accounts a
      WHERE (LOWER(COALESCE(a.classification,'')) LIKE '%liab%')
         OR (COALESCE(a.gl_code,'')::text LIKE '2%')
    )
    SELECT COALESCE(SUM(CASE WHEN current_balance < 0 THEN -current_balance ELSE 0 END), 0::numeric) AS liabilities
    FROM acc
  `;

  // Revenue YTD: sum of total_amount where normalized type = 'Revenue' in current year
  const hasTotalAmt = await hasColumn(pool, 'journal_entries', 'total_amount');
  const revenueSql = hasTotalAmt ? `
    SELECT COALESCE(SUM(COALESCE(je.total_amount::numeric,0)), 0::numeric) AS revenue_ytd
      FROM journal_entries je
     WHERE COALESCE(je.type, je.entry_type) ILIKE 'revenue'
       AND je.entry_date BETWEEN $1 AND $2
       AND ${postCond}
  ` : `
    SELECT COALESCE(SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0)), 0::numeric) AS revenue_ytd
      FROM journal_entry_items jel
      JOIN journal_entries je ON jel.${jei.jeRef} = je.id
     WHERE COALESCE(je.type, je.entry_type) ILIKE 'revenue'
       AND je.entry_date BETWEEN $1 AND $2
       AND ${postCond}
  `;

  const [assetsR, liabilitiesR, revenueR] = await Promise.all([
    pool.query(assetsSql),
    pool.query(liabilitiesSql),
    pool.query(revenueSql, [yStart, yEnd])
  ]);

  const assets = Number(assetsR.rows[0]?.assets || 0);
  const liabilities = Number(liabilitiesR.rows[0]?.liabilities || 0);
  const revenue_ytd = Number(revenueR.rows[0]?.revenue_ytd || 0);
  const net_assets = assets - liabilities;

  res.json({ assets, liabilities, net_assets, revenue_ytd });
}));

module.exports = router;
