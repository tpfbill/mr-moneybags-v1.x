// src/routes/reports.js
const express = require('express');
const router = express.Router();
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
    const conds = [
        `je.entry_date <= $2`
    ];

    if (entity_id) {
        conds.push(`je.entity_id = $${idx++}`);
        params.push(entity_id);
    }
    if (fund_id) {
        conds.push(`jei.fund_id = $${idx++}`);
        params.push(fund_id);
    }
    if (account_code_from) {
        conds.push(`a.code >= $${idx++}`);
        params.push(account_code_from);
    }
    if (account_code_to) {
        conds.push(`a.code <= $${idx++}`);
        params.push(account_code_to);
    }
    if (status && status.trim() !== '') {
        conds.push(`LOWER(TRIM(je.status)) = LOWER(TRIM($${idx++}))`);
        params.push(status);
    }

    const itemsWhere = conds.join(' AND ');

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
    a.code AS account_code,
    a.description AS account_name,
    a.classifications AS acct_class,
    f.id   AS fund_id,
    f.code AS fund_code,
    f.name AS fund_name
  FROM journal_entry_items AS jei
  JOIN journal_entries      AS je ON je.id = jei.journal_entry_id
  JOIN accounts             AS a  ON a.id  = jei.account_id
  LEFT JOIN funds           AS f  ON f.id  = jei.fund_id
  WHERE ${itemsWhere}
),
opening AS (
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
    COALESCE(o.opening_balance, 0) AS opening_balance,
    SUM(p.signed_amount) OVER (
      PARTITION BY p.account_id
      ORDER BY p.entry_date, p.id
      ROWS UNBOUNDED PRECEDING
    ) + COALESCE(o.opening_balance, 0) AS running_balance
  FROM period p
  LEFT JOIN opening o ON o.account_id = p.account_id
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
    a.code AS account_code,
    a.description AS account_name,
    a.classifications AS acct_class
  FROM journal_entry_items AS jei
  JOIN journal_entries      AS je ON je.id = jei.journal_entry_id
  JOIN accounts             AS a  ON a.id  = jei.account_id
  WHERE ${itemsWhere}
),
opening AS (
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
)
SELECT
  i.account_id,
  i.account_code,
  i.account_name,
  COALESCE(o.opening_balance, 0) AS opening_balance,
  COALESCE(a.period_debits, 0)   AS debits,
  COALESCE(a.period_credits, 0)  AS credits,
  COALESCE(o.opening_balance, 0) + COALESCE(a.period_net, 0) AS ending_balance
FROM (
  SELECT DISTINCT account_id, account_code, account_name FROM items
) i
LEFT JOIN opening  o ON o.account_id = i.account_id
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

module.exports = router;
