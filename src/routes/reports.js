// src/routes/reports.js
const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// A secure map of allowed fields and tables for the report builder.
// This is a critical security measure to prevent SQL injection.
const REPORT_BUILDER_FIELD_MAP = {
    journal_entry_items: {
        from: 'FROM journal_entry_items jel',
        joins: `
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            JOIN accounts a ON a.id = jel.account_id
            LEFT JOIN funds f ON f.id = jel.fund_id
            LEFT JOIN entities e ON e.id = je.entity_id`,
        fields: {
            entry_date: { sql: 'je.entry_date', type: 'date' },
            reference_number: { sql: 'je.reference_number', type: 'string' },
            description: { sql: 'jel.description', type: 'string' },
            debit: { sql: 'jel.debit', type: 'number' },
            credit: { sql: 'jel.credit', type: 'number' },
            account_code: { sql: 'a.code', type: 'string' },
            account_description: { sql: 'a.description', type: 'string' },
            account_classifications: { sql: 'a.classifications', type: 'string' },
            fund_code: { sql: 'f.code', type: 'string' },
            fund_name: { sql: 'f.name', type: 'string' },
            fund_type: { sql: 'f.type', type: 'string' },
            entity_name: { sql: 'e.name', type: 'string' },
            entity_code: { sql: 'e.code', type: 'string' },
        }
    },
    funds: {
        from: 'FROM funds f',
        joins: 'LEFT JOIN entities e ON e.id = f.entity_id',
        fields: {
            code: { sql: 'f.code', type: 'string' },
            name: { sql: 'f.name', type: 'string' },
            type: { sql: 'f.type', type: 'string' },
            balance: { sql: 'f.balance', type: 'number' },
            status: { sql: 'f.status', type: 'string' },
            entity_name: { sql: 'e.name', type: 'string' },
        }
    },
    accounts: {
        from: 'FROM accounts a',
        joins: 'LEFT JOIN entities e ON e.id = a.entity_id',
        fields: {
            code: { sql: 'a.code', type: 'string' },
            description: { sql: 'a.description', type: 'string' },
            classifications: { sql: 'a.classifications', type: 'string' },
            balance: { sql: 'a.balance', type: 'number' },
            status: { sql: 'a.status', type: 'string' },
            entity_name: { sql: 'e.name', type: 'string' },
        }
    }
};

/**
 * Builds a dynamic SQL query from a report definition object.
 * This function is designed to be secure against SQL injection.
 */
function buildDynamicQuery(definition) {
    const { dataSource, fields, filters, groupBy, sortBy } = definition;
    const params = [];
    let paramIndex = 1;

    // 1. Validate Data Source
    const sourceConfig = REPORT_BUILDER_FIELD_MAP[dataSource];
    if (!sourceConfig) {
        throw new Error(`Invalid data source: ${dataSource}`);
    }

    // 2. Build SELECT clause (validating every field)
    const selectClauses = fields.map(field => {
        if (!sourceConfig.fields[field]) {
            throw new Error(`Invalid field selected: ${field}`);
        }
        return `${sourceConfig.fields[field].sql} AS "${field}"`;
    });
    if (selectClauses.length === 0) {
        throw new Error('At least one field must be selected.');
    }

    // 3. Build WHERE clause (validating fields and operators, parameterizing values)
    const whereClauses = [];
    if (filters && filters.length > 0) {
        filters.forEach(filter => {
            if (!sourceConfig.fields[filter.field]) {
                throw new Error(`Invalid filter field: ${filter.field}`);
            }
            const validOperators = ['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'ILIKE', 'IN'];
            if (!validOperators.includes(filter.operator)) {
                throw new Error(`Invalid filter operator: ${filter.operator}`);
            }
            
            // For IN operator, we need to handle multiple params
            if (filter.operator === 'IN') {
                const inValues = filter.value.split(',').map(v => v.trim());
                const placeholders = inValues.map(() => `$${paramIndex++}`);
                whereClauses.push(`${sourceConfig.fields[filter.field].sql} IN (${placeholders.join(',')})`);
                params.push(...inValues);
            } else {
                whereClauses.push(`${sourceConfig.fields[filter.field].sql} ${filter.operator} $${paramIndex++}`);
                params.push(filter.operator.includes('LIKE') ? `%${filter.value}%` : filter.value);
            }
        });
    }

    // 4. Build GROUP BY clause
    let groupByClause = '';
    if (groupBy) {
        if (!sourceConfig.fields[groupBy]) {
            throw new Error(`Invalid group by field: ${groupBy}`);
        }
        // When grouping, all selected fields must either be in the GROUP BY or be an aggregate
        // For simplicity here, we'll just group by all selected non-aggregate fields
        groupByClause = `GROUP BY ${selectClauses.join(', ')}`;
    }
    
    // 5. Build ORDER BY clause
    let orderByClause = '';
    if (sortBy && sortBy.length > 0) {
        const orderByClauses = sortBy.map(sort => {
            if (!sourceConfig.fields[sort.field]) {
                throw new Error(`Invalid sort field: ${sort.field}`);
            }
            const direction = sort.direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
            return `${sourceConfig.fields[sort.field].sql} ${direction}`;
        });
        orderByClause = `ORDER BY ${orderByClauses.join(', ')}`;
    }

    const sql = `
        SELECT ${selectClauses.join(', ')}
        ${sourceConfig.from}
        ${sourceConfig.joins || ''}
        ${whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''}
        ${groupByClause}
        ${orderByClause}
        LIMIT 500;
    `;

    return { sql, params };
}

/**
 * GET /api/reports/custom/fields/:datasource
 * Returns available fields for a specific data source
 */
router.get('/custom/fields/:datasource', asyncHandler(async (req, res) => {
    const { datasource } = req.params;
    const sourceConfig = REPORT_BUILDER_FIELD_MAP[datasource];
    if (sourceConfig) {
        res.json(Object.keys(sourceConfig.fields));
    } else {
        res.status(404).json({ error: 'Invalid data source specified.' });
    }
}));

/**
 * POST /api/reports/custom/preview
 * Generates a preview of a custom report based on definition
 */
router.post('/custom/preview', asyncHandler(async (req, res) => {
    const definition = req.body;
    const { sql, params } = buildDynamicQuery(definition);
    console.log('Executing custom report query:', sql, params);
    const { rows } = await pool.query(sql, params);
    res.json(rows);
}));

/**
 * GET /api/reports/custom/saved
 * Returns all saved custom report definitions
 */
router.get('/custom/saved', asyncHandler(async (req, res) => {
    // Include full JSON definition so the restored builder can be populated
    const { rows } = await pool.query(
        'SELECT id, name, description, definition_json FROM custom_report_definitions ORDER BY name'
    );
    res.json(rows);
}));

/**
 * POST /api/reports/custom/save
 * Saves or updates a custom report definition
 */
router.post('/custom/save', asyncHandler(async (req, res) => {
    const { id, name, description, definition_json } = req.body;
    if (!name || !definition_json) {
        return res.status(400).json({ error: 'Name and definition are required.' });
    }

    if (id) {
        // Update existing report
        const { rows } = await pool.query(
            'UPDATE custom_report_definitions SET name = $1, description = $2, definition_json = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
            [name, description, definition_json, id]
        );
        res.json(rows[0]);
    } else {
        // Create new report
        const { rows } = await pool.query(
            'INSERT INTO custom_report_definitions (name, description, definition_json) VALUES ($1, $2, $3) RETURNING *',
            [name, description, definition_json]
        );
        res.status(201).json(rows[0]);
    }
}));

/**
 * DELETE /api/reports/custom/:id
 * Deletes a saved custom report definition
 */
router.delete('/custom/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;
    await pool.query('DELETE FROM custom_report_definitions WHERE id = $1', [id]);
    res.status(204).send();
}));

/**
 * GET /api/reports/gl
 * Returns General Ledger detail lines plus a per-account summary for a date range.
 * Query params (all strings):
 *   start_date (YYYY-MM-DD)  – required
 *   end_date   (YYYY-MM-DD)  – required
 *   entity_id  – optional UUID
 *   fund_id    – optional UUID
 *   account_code_from – optional string
 *   account_code_to   – optional string
 */
router.get('/gl', asyncHandler(async (req, res) => {
    const {
        start_date,
        end_date,
        entity_id,
        fund_id,
        account_code_from,
        account_code_to,
        status
    } = req.query;

    if (!start_date || !end_date) {
        return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
    }

    // ---------------------------------------------------------------------
    // Build param list + reusable WHERE conditions
    // ---------------------------------------------------------------------
    const params = [start_date, end_date];
    let idx = 3;            // next placeholder index
    // Track placeholder indices for reuse in acct_open CTE
    let entityParamIdx = null;
    let fundParamIdx = null;
    let acctFromParamIdx = null;
    let acctToParamIdx = null;
    const conds = [
        `je.entry_date <= $2`
    ];

    if (entity_id) {
        entityParamIdx = idx;
        conds.push(`je.entity_id = $${idx++}`);
        params.push(entity_id);
    }
    if (fund_id) {
        fundParamIdx = idx;
        conds.push(`jei.fund_id = $${idx++}`);
        params.push(fund_id);
    }
    if (account_code_from) {
        // Use canonical column present in current schema
        acctFromParamIdx = idx;
        conds.push(`a.account_code >= $${idx++}`);
        params.push(account_code_from);
    }
    if (account_code_to) {
        // Use canonical column present in current schema
        acctToParamIdx = idx;
        conds.push(`a.account_code <= $${idx++}`);
        params.push(account_code_to);
    }
    if (status && status.trim() !== '') {
        conds.push(`LOWER(TRIM(je.status)) = LOWER(TRIM($${idx++}))`);
        params.push(status);
    }

    const itemsWhere = conds.join(' AND ');

    // Build WHERE for beginning balances (accounts table alias a2)
    const acctOpenConds = [
        `(a2.beginning_balance_date IS NOT NULL AND a2.beginning_balance_date <= $1)`
    ];
    if (entityParamIdx) {
        acctOpenConds.push(`EXISTS (SELECT 1 FROM entities e2 WHERE e2.code = a2.entity_code AND e2.id = $${entityParamIdx})`);
    }
    if (fundParamIdx) {
        acctOpenConds.push(`EXISTS (SELECT 1 FROM funds f2 WHERE f2.fund_number = a2.fund_number AND f2.id = $${fundParamIdx})`);
    }
    if (acctFromParamIdx) {
        acctOpenConds.push(`a2.account_code >= $${acctFromParamIdx}`);
    }
    if (acctToParamIdx) {
        acctOpenConds.push(`a2.account_code <= $${acctToParamIdx}`);
    }
    const acctOpenWhere = acctOpenConds.join(' AND ');

    // ---------------------------------------------------------------------
    // Detail query
    // ---------------------------------------------------------------------
    const sqlDetail = `
WITH items AS (
  SELECT
    jei.id,
    jei.debit,
    jei.credit,
    COALESCE(je.description, jei.description) AS line_description,
    je.entry_date,
    je.reference_number,
    a.id   AS account_id,
    a.account_code AS account_code,
    a.description AS account_name,
    a.classification AS acct_class,
    f.id   AS fund_id,
    f.fund_code AS fund_code,
    f.fund_name AS fund_name
  FROM journal_entry_items AS jei
  JOIN journal_entries      AS je ON je.id = jei.journal_entry_id
  JOIN accounts             AS a  ON a.id  = jei.account_id
  LEFT JOIN funds           AS f  ON f.id  = jei.fund_id
  WHERE ${itemsWhere}
),
je_open AS (
  SELECT
    account_id,
    SUM(
      CASE WHEN acct_class IN ('Asset','Expense')
           THEN COALESCE(debit,0) - COALESCE(credit,0)
           ELSE COALESCE(credit,0) - COALESCE(debit,0)
      END
    ) AS opening_balance
  FROM items
  WHERE entry_date < $1
  GROUP BY account_id
),
acct_open AS (
  SELECT
    a2.id AS account_id,
    CASE WHEN a2.classification IN ('Asset','Expense')
         THEN COALESCE(a2.beginning_balance,0)
         ELSE COALESCE(-a2.beginning_balance,0)
    END AS opening_balance
  FROM accounts a2
  WHERE ${acctOpenWhere}
),
period AS (
  SELECT
    i.*,
    CASE WHEN i.acct_class IN ('Asset','Expense')
         THEN COALESCE(i.debit,0) - COALESCE(i.credit,0)
         ELSE COALESCE(i.credit,0) - COALESCE(i.debit,0)
    END AS signed_amount
  FROM items i
  WHERE i.entry_date BETWEEN $1 AND $2
),
detail AS (
  SELECT
    p.id AS line_id,
    p.account_id,
    p.account_code,
    p.account_name,
    p.acct_class,
    p.entry_date,
    p.reference_number,
    p.line_description,
    p.fund_id,
    p.fund_code,
    p.fund_name,
    p.debit,
    p.credit,
    COALESCE(jo.opening_balance, 0) + COALESCE(ao.opening_balance, 0) AS opening_balance,
    SUM(p.signed_amount) OVER (
      PARTITION BY p.account_id
      ORDER BY p.entry_date, p.id
      ROWS UNBOUNDED PRECEDING
    ) + COALESCE(jo.opening_balance, 0) + COALESCE(ao.opening_balance, 0) AS running_balance
  FROM period p
  LEFT JOIN je_open  jo ON jo.account_id = p.account_id
  LEFT JOIN acct_open ao ON ao.account_id = p.account_id
)
SELECT *
FROM detail
ORDER BY account_code, entry_date, line_id;
`;

    // ---------------------------------------------------------------------
    // Summary query
    // ---------------------------------------------------------------------
    const sqlSummary = `
WITH items AS (
  SELECT
    jei.id,
    jei.debit,
    jei.credit,
    je.entry_date,
    a.id   AS account_id,
    a.account_code AS account_code,
    a.description AS account_name,
    a.classification AS acct_class
  FROM journal_entry_items AS jei
  JOIN journal_entries      AS je ON je.id = jei.journal_entry_id
  JOIN accounts             AS a  ON a.id  = jei.account_id
  WHERE ${itemsWhere}
),
je_open AS (
  SELECT
    account_id,
    SUM(
      CASE WHEN acct_class IN ('Asset','Expense')
           THEN COALESCE(debit,0) - COALESCE(credit,0)
           ELSE COALESCE(credit,0) - COALESCE(debit,0)
      END
    ) AS opening_balance
  FROM items
  WHERE entry_date < $1
  GROUP BY account_id
),
activity AS (
  SELECT
    account_id,
    SUM(debit)  AS period_debits,
    SUM(credit) AS period_credits,
    SUM(
      CASE WHEN acct_class IN ('Asset','Expense')
           THEN COALESCE(debit,0) - COALESCE(credit,0)
           ELSE COALESCE(credit,0) - COALESCE(debit,0)
      END
    ) AS period_net
  FROM items
  WHERE entry_date BETWEEN $1 AND $2
  GROUP BY account_id
),
acct_open AS (
  SELECT
    a2.id AS account_id,
    CASE WHEN a2.classification IN ('Asset','Expense')
         THEN COALESCE(a2.beginning_balance,0)
         ELSE COALESCE(-a2.beginning_balance,0)
    END AS opening_balance
  FROM accounts a2
  WHERE ${acctOpenWhere}
)
SELECT
  i.account_id,
  i.account_code,
  i.account_name,
  COALESCE(jo.opening_balance, 0) + COALESCE(ao.opening_balance, 0) AS opening_balance,
  COALESCE(a.period_debits, 0)   AS debits,
  COALESCE(a.period_credits, 0)  AS credits,
  COALESCE(jo.opening_balance, 0) + COALESCE(ao.opening_balance, 0) + COALESCE(a.period_net, 0) AS ending_balance
FROM (
  SELECT DISTINCT account_id, account_code, account_name FROM items
) i
LEFT JOIN je_open  jo ON jo.account_id = i.account_id
LEFT JOIN acct_open ao ON ao.account_id = i.account_id
LEFT JOIN activity a ON a.account_id = i.account_id
ORDER BY i.account_code;
`;

    // Execute both queries concurrently

    // ---------------------------------------------------------------------
    // Debug logging (helps troubleshoot filters & SQL generated)
    // ---------------------------------------------------------------------
    /* eslint-disable no-console */
    console.log('[GL] params:', params);
    console.log('[GL] sqlDetail:', sqlDetail);
    console.log('[GL] sqlSummary:', sqlSummary);
    /* eslint-enable no-console */

    const [detailResult, summaryResult] = await Promise.all([
        pool.query(sqlDetail, params),
        pool.query(sqlSummary, params)
    ]);

    res.json({
        params: { start_date, end_date, entity_id, fund_id, account_code_from, account_code_to, status },
        summary: summaryResult.rows,
        detail: detailResult.rows
    });
}));

/**
 * GET /api/reports/gl-export
 * Generates and returns an Excel GL report for a specific month/year
 * Query params:
 *   month (1-12) - required
 *   year (YYYY)  - required
 */
router.get('/gl-export', asyncHandler(async (req, res) => {
    const { month, year } = req.query;

    if (!month || !year) {
        return res.status(400).json({ error: 'month and year are required' });
    }

    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (monthNum < 1 || monthNum > 12) {
        return res.status(400).json({ error: 'month must be between 1 and 12' });
    }

    // Calculate date range
    const startDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const endDate = `${yearNum}-${String(monthNum).padStart(2, '0')}-${lastDay}`;

    console.log(`[GL Export] Generating report for ${month}/${year} (${startDate} to ${endDate})`);

    // Get all accounts with their beginning balances
    const accountsResult = await pool.query(`
        SELECT 
            a.id,
            a.account_code,
            a.description,
            a.beginning_balance,
            a.beginning_balance_date
        FROM accounts a
        ORDER BY a.account_code
    `);

    const accounts = accountsResult.rows;

    // Get all posted journal entry items for the period
    const itemsResult = await pool.query(`
        SELECT 
            jei.account_id,
            je.entry_date,
            je.reference_number,
            je.description as je_description,
            jei.description as line_description,
            jei.debit,
            jei.credit,
            a.account_code,
            a.description as account_description
        FROM journal_entry_items jei
        JOIN journal_entries je ON je.id = jei.journal_entry_id
        JOIN accounts a ON a.id = jei.account_id
        WHERE je.status = 'Posted'
          AND je.entry_date >= $1
          AND je.entry_date <= $2
        ORDER BY a.account_code, je.entry_date, je.id
    `, [startDate, endDate]);

    // Group items by account
    const itemsByAccount = new Map();
    for (const item of itemsResult.rows) {
        const key = item.account_id;
        if (!itemsByAccount.has(key)) {
            itemsByAccount.set(key, []);
        }
        itemsByAccount.get(key).push(item);
    }

    // Calculate prior period activity for beginning balances
    const priorBalancesResult = await pool.query(`
        SELECT 
            jei.account_id,
            SUM(COALESCE(jei.debit, 0) - COALESCE(jei.credit, 0)) as prior_activity
        FROM journal_entry_items jei
        JOIN journal_entries je ON je.id = jei.journal_entry_id
        WHERE je.status = 'Posted'
          AND je.entry_date < $1
        GROUP BY jei.account_id
    `, [startDate]);

    const priorBalances = new Map();
    for (const row of priorBalancesResult.rows) {
        priorBalances.set(row.account_id, parseFloat(row.prior_activity) || 0);
    }

    // Helper functions
    function formatCurrency(num) {
        if (num === null || num === undefined) return '';
        const n = parseFloat(num) || 0;
        const abs = Math.abs(n);
        const formatted = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return n < 0 ? `(${formatted})` : formatted;
    }

    function formatDate(date) {
        if (!date) return '';
        const d = new Date(date);
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const y = d.getFullYear();
        return `${m}/${day}/${y}`;
    }

    // Build spreadsheet data
    const rows = [];

    // Title row
    rows.push([`Period To Date Actual + Allocation Ledger for Period Ending ${monthNum}/${lastDay}/${yearNum}`]);
    rows.push([]); // Empty row

    // Header row
    rows.push(['Account', 'Description', 'Demo Desc', 'Date', 'Source', 'JE', 'Reference', 'Description', 'Debit', 'Credit', 'Balance']);

    // Process each account
    for (const account of accounts) {
        const accountItems = itemsByAccount.get(account.id) || [];
        const baseBalance = parseFloat(account.beginning_balance) || 0;
        const priorActivity = priorBalances.get(account.id) || 0;
        const beginningBalance = baseBalance + priorActivity;

        // Skip accounts with no beginning balance and no activity
        if (beginningBalance === 0 && accountItems.length === 0) {
            continue;
        }

        const fullAccountCode = account.account_code + ' 000';

        // Beginning Balance row
        rows.push([
            `Beginning Balance ${fullAccountCode}`,
            null, null, null, null, null, null, null, null, null,
            formatCurrency(beginningBalance)
        ]);

        // Transaction rows
        let runningBalance = beginningBalance;
        let totalDebits = 0;
        let totalCredits = 0;

        for (const item of accountItems) {
            const debit = parseFloat(item.debit) || 0;
            const credit = parseFloat(item.credit) || 0;
            runningBalance = runningBalance + debit - credit;
            totalDebits += debit;
            totalCredits += credit;

            const description = item.line_description || item.je_description || '';

            rows.push([
                fullAccountCode,
                account.description,
                '',
                formatDate(item.entry_date),
                'JE',
                '',
                item.reference_number || '',
                description,
                debit > 0 ? formatCurrency(debit) : null,
                credit > 0 ? formatCurrency(credit) : null,
                formatCurrency(runningBalance)
            ]);
        }

        // Ending Balance row
        rows.push([
            `Ending Balance ${fullAccountCode}`,
            null, null, null, null, null, null, null,
            formatCurrency(totalDebits),
            formatCurrency(totalCredits),
            formatCurrency(runningBalance)
        ]);
    }

    console.log(`[GL Export] Generated ${rows.length} rows`);

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Set column widths
    ws['!cols'] = [
        { wch: 35 },  // Account
        { wch: 30 },  // Description
        { wch: 10 },  // Demo Desc
        { wch: 12 },  // Date
        { wch: 8 },   // Source
        { wch: 8 },   // JE
        { wch: 15 },  // Reference
        { wch: 50 },  // Description
        { wch: 15 },  // Debit
        { wch: 15 },  // Credit
        { wch: 15 },  // Balance
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'SHEET1');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Send response
    const filename = `${String(monthNum).padStart(2, '0')}${yearNum}GL.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
}));

module.exports = router;
