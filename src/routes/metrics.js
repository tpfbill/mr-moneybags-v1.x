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
    fundRef: await pickFirst(fundRefCandidates),
    accRef: await pickFirst(accRefCandidates),
    debitCol: await pickFirst(debitCandidates),
    creditCol: await pickFirst(creditCandidates)
  };
}

// GET /api/metrics
// Returns { assets, liabilities, net_assets, revenue_ytd }
// Optional scoping via query params (any may be provided):
// - entity_code (repeatable) or entity_codes=CSV   → filters funds/accounts by entity_code
// - entity_id   (repeatable) or entity_ids=CSV     → filters journal_entries by entity_id
router.get('/', asyncHandler(async (req, res) => {
  const year = new Date().getFullYear();
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;

  // Posted tolerance
  const hasStatusCol = await hasColumn(pool, 'journal_entries', 'status');
  const hasPostedCol = await hasColumn(pool, 'journal_entries', 'posted');
  const hasJeEntityId = await hasColumn(pool, 'journal_entries', 'entity_id');
  const postCond = (hasStatusCol && hasPostedCol)
    ? `(je.posted = TRUE OR je.status ILIKE 'post%')`
    : (hasStatusCol ? `(je.status ILIKE 'post%')` : (hasPostedCol ? `(je.posted = TRUE)` : 'TRUE'));

  // Parse entity filters from query
  const q = req.query || {};
  const toArray = (v) => Array.isArray(v)
    ? v
    : (typeof v === 'string' && v.length ? v.split(',') : []);

  const entityCodes = [
    ...toArray(q.entity_code),
    ...toArray(q.entity_codes)
  ]
    .map(s => String(s || '').trim())
    .filter(Boolean);

  const entityIds = [
    ...toArray(q.entity_id),
    ...toArray(q.entity_ids)
  ]
    .map(s => String(s || '').trim())
    .filter(Boolean);

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

  let assetsSql = `
    SELECT COALESCE(SUM(${sbExpr} + COALESCE((
      SELECT SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0))
        FROM journal_entry_items jel
        JOIN journal_entries je ON jel.${jei.jeRef} = je.id
       WHERE (${fundMatchClause})
         AND ${postCond}
    ), 0::numeric)), 0::numeric) AS assets
    FROM funds f
    WHERE 1=1
  `;
  const assetsParams = [];
  if (entityCodes.length) {
    assetsSql += ' AND f.entity_code = ANY($1)';
    assetsParams.push(entityCodes);
  }

  // Liabilities: sum magnitudes of negative current_balance across liability accounts
  let liabilitiesSql = `
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
      WHERE ((LOWER(COALESCE(a.classification,'')) LIKE '%liab%')
         OR (COALESCE(a.gl_code,'')::text LIKE '2%'))
  `;
  const liabilitiesParams = [];
  if (entityCodes.length) {
    liabilitiesSql += ` AND a.entity_code = ANY($1)`;
    liabilitiesParams.push(entityCodes);
  }
  liabilitiesSql += `
    )
    SELECT COALESCE(SUM(CASE WHEN current_balance < 0 THEN -current_balance ELSE 0 END), 0::numeric) AS liabilities
    FROM acc
  `;

  // Revenue YTD: derive from line-items that hit Revenue/Income accounts
  // Robust join + classification detection across schema variants
  const hasAccClassification = await hasColumn(pool, 'accounts', 'classification');
  const hasAccEntityCode = await hasColumn(pool, 'accounts', 'entity_code');
  const hasAccAccountCode = await hasColumn(pool, 'accounts', 'account_code');
  const hasJeiAccountCode = await hasColumn(pool, 'journal_entry_items', 'account_code');
  const hasJeiGlCode = await hasColumn(pool, 'journal_entry_items', 'gl_code');
  const hasGlCodes = await hasColumn(pool, 'gl_codes', 'code');

  // Account match: prefer ID, fallback to account_code when present
  const accMatchParts = [
    `(jel.${jei.accRef}::text = a.id::text)`
  ];
  if (hasJeiAccountCode && hasAccAccountCode) {
    accMatchParts.push(
      "(regexp_replace(lower(jel.account_code),'[^a-z0-9]','','g') = regexp_replace(lower(a.account_code),'[^a-z0-9]','','g'))"
    );
  }
  const accMatchClause = accMatchParts.join(' OR ');

  // Optional joins for classification fallback
  const gcAJoin = hasGlCodes ? ' LEFT JOIN gl_codes gcA ON a.gl_code = gcA.code' : '';
  const gcJJoin = hasGlCodes && hasJeiGlCode ? ' LEFT JOIN gl_codes gcJ ON jel.gl_code = gcJ.code' : '';

  // Determine revenue via accounts.classification, gl_codes.classification, or GL prefix 4xxx
  const revenueClassPredicate = `(
    LOWER(COALESCE(a.classification, gcA.classification, gcJ.classification,
      CASE WHEN COALESCE(a.gl_code, ${hasJeiGlCode ? 'jel.gl_code' : "NULL::text"}) LIKE '4%'
           THEN 'revenue' ELSE '' END
    )) LIKE 'revenue%'
    OR LOWER(COALESCE(a.classification, gcA.classification, gcJ.classification,'')) LIKE 'income%'
  )`;

  // Join funds to enable entity scoping even if account join doesn't resolve
  const revenueFundsJoin = ` LEFT JOIN funds f ON (${fundMatchClause})`;

  let revenueSql = `
    SELECT COALESCE(SUM(COALESCE(jel.${jei.debitCol}::numeric,0) - COALESCE(jel.${jei.creditCol}::numeric,0)), 0::numeric) AS revenue_ytd
      FROM journal_entry_items jel
      JOIN journal_entries je ON jel.${jei.jeRef} = je.id
      LEFT JOIN accounts a ON (${accMatchClause})
      ${gcAJoin}
      ${gcJJoin}
      ${revenueFundsJoin}
     WHERE je.entry_date BETWEEN $1 AND $2
       AND ${postCond}
       AND ${revenueClassPredicate}
  `;
  const revenueParams = [yStart, yEnd];
  if (entityCodes.length) {
    if (hasAccEntityCode) {
      revenueSql += ` AND COALESCE(a.entity_code, f.entity_code) = ANY($${revenueParams.length + 1})`;
      revenueParams.push(entityCodes);
    } else {
      // Fallback: scope by funds.entity_code only
      revenueSql += ` AND f.entity_code = ANY($${revenueParams.length + 1})`;
      revenueParams.push(entityCodes);
    }
  }

  const [assetsR, liabilitiesR, revenueR] = await Promise.all([
    pool.query(assetsSql, assetsParams),
    pool.query(liabilitiesSql, liabilitiesParams),
    pool.query(revenueSql, revenueParams)
  ]);

  const assets = Number(assetsR.rows[0]?.assets || 0);
  const liabilities = Number(liabilitiesR.rows[0]?.liabilities || 0);
  const revenue_ytd = Number(revenueR.rows[0]?.revenue_ytd || 0);
  const net_assets = assets - liabilities;

  res.json({ assets, liabilities, net_assets, revenue_ytd });
}));

module.exports = router;
