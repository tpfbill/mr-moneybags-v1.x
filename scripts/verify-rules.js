#!/usr/bin/env node
/*
 * scripts/verify-rules.js
 * Minimal verification for rules engine foundation
 * - Ensures accounting_rules table exists (or defaults loaded)
 * - Prints active rules
 * - Runs a simple revenue_ytd and assets/liabilities snapshot using current rules
 */

const { pool } = require('../src/database/connection');
const rules = require('../src/rules/engine');

(async () => {
  try {
    // Load rules (triggers default fallback if table missing)
    const r = await rules.loadRules(true);
    console.log('Active rules loaded:');
    Object.keys(r).sort().forEach(k => console.log(` - ${k}: ${r[k].sql}`));

    // Compute a quick metrics snapshot using same SQL blocks as API
    const year = new Date().getFullYear();
    const yStart = `${year}-01-01`;
    const yEnd = `${year}-12-31`;

    // Detect JEI core cols
    const hasColumn = async (table, col) => {
      const { rows } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
        [table, col]
      );
      return rows.length > 0;
    };
    const pick = async (table, cands, dflt) => {
      for (const c of cands) if (await hasColumn(table, c)) return c;
      return dflt;
    };
    const jei = {
      jeRef: await pick('journal_entry_items', ['journal_entry_id','entry_id','je_id'], 'journal_entry_id'),
      accRef: await pick('journal_entry_items', ['account_id','gl_account_id','acct_id','account'], 'account_id'),
      fundRef: await pick('journal_entry_items', ['fund_id','fund','fundid'], 'fund_id'),
      debitCol: await pick('journal_entry_items', ['debit','debits','dr_amount','debit_amount','dr'], 'debit'),
      creditCol: await pick('journal_entry_items', ['credit','credits','cr_amount','credit_amount','cr'], 'credit')
    };

    const hasStatus = await hasColumn('journal_entries', 'status');
    const hasPosted = await hasColumn('journal_entries', 'posted');
    const postCond = (hasStatus && hasPosted)
      ? `(je.posted = TRUE OR je.status ILIKE 'post%')`
      : (hasStatus ? `(je.status ILIKE 'post%')` : (hasPosted ? `(je.posted = TRUE)` : 'TRUE'));

    const hasSB = await hasColumn('funds', 'starting_balance');
    const sbExpr = hasSB ? 'COALESCE(f.starting_balance, 0::numeric)' : '0::numeric';
    const hasFundNumber = await hasColumn('funds', 'fund_number');
    const hasFundCode = await hasColumn('funds', 'fund_code');
    const fundMatchParts = [ `(jel.${jei.fundRef}::text = f.id::text)` ];
    if (hasFundNumber) fundMatchParts.push(`(jel.${jei.fundRef}::text = f.fund_number::text)`);
    if (hasFundCode)   fundMatchParts.push(`(jel.${jei.fundRef}::text = f.fund_code::text)`);
    const fundMatchClause = fundMatchParts.join(' OR ');

    const deltaExpr = await rules.sql.delta(`COALESCE(jel.${jei.debitCol}::numeric,0)`, `COALESCE(jel.${jei.creditCol}::numeric,0)`);

    const assetsSql = `
      SELECT COALESCE(SUM(${sbExpr} + COALESCE((
          SELECT SUM(${deltaExpr})
            FROM journal_entry_items jel
            JOIN journal_entries je ON jel.${jei.jeRef} = je.id
           WHERE (${fundMatchClause})
             AND ${postCond}
      ), 0::numeric)), 0::numeric) AS assets
        FROM funds f
    `;

    const liabilitiesSql = `
      WITH acc AS (
        SELECT 
          a.id,
          COALESCE(a.beginning_balance, 0)::numeric + COALESCE((
            SELECT SUM(${deltaExpr})
              FROM journal_entry_items jel
              JOIN journal_entries je ON jel.${jei.jeRef} = je.id
             WHERE jel.account_id::text = a.id::text
               AND ${postCond}
          ), 0::numeric) AS current_balance
        FROM accounts a
        WHERE ((LOWER(COALESCE(a.classification,'')) LIKE '%liab%')
           OR (COALESCE(a.gl_code,'')::text LIKE '2%'))
      )
      SELECT COALESCE(SUM(CASE WHEN current_balance < 0 THEN -current_balance ELSE 0 END), 0::numeric) AS liabilities
      FROM acc
    `;

    const hasJeiGlCode = await hasColumn('journal_entry_items', 'gl_code');
    const revenuePredicate = await rules.sql.revenuePredicate({
      glCodeA: 'a.gl_code',
      glCodeJ: hasJeiGlCode ? 'jel.gl_code' : "NULL::text",
      gcLineTypeA: 'gcA.line_type',
      gcLineTypeJ: hasJeiGlCode ? 'gcJ.line_type' : "''"
    });
    const gcJJoin = hasJeiGlCode ? ' LEFT JOIN gl_codes gcJ ON jel.gl_code = gcJ.code' : '';
    const revenueSql = `
      SELECT COALESCE(SUM(COALESCE(jel.${jei.creditCol}::numeric,0) - COALESCE(jel.${jei.debitCol}::numeric,0)), 0::numeric) AS revenue_ytd
        FROM journal_entry_items jel
        JOIN journal_entries je ON jel.${jei.jeRef} = je.id
        LEFT JOIN accounts a ON (jel.${jei.accRef}::text = a.id::text)
        LEFT JOIN gl_codes gcA ON a.gl_code = gcA.code
        ${gcJJoin}
       WHERE je.entry_date BETWEEN $1 AND $2
         AND ${postCond}
         AND ${revenuePredicate}
    `;

    const [{ rows: aR }, { rows: lR }, { rows: rR }] = await Promise.all([
      pool.query(assetsSql),
      pool.query(liabilitiesSql),
      pool.query(revenueSql, [yStart, yEnd])
    ]);

    console.log('Snapshot:');
    console.log(' assets=', aR[0]?.assets || 0);
    console.log(' liabs =', lR[0]?.liabilities || 0);
    console.log(' revYTD=', rR[0]?.revenue_ytd || 0);

    await pool.end();
  } catch (err) {
    console.error('[verify:rules] Failed:', err);
    process.exitCode = 1;
  }
})();
