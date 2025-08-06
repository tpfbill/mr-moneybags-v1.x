// src/routes/reports.js
const express = require('express');
const router = express.Router();
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// A secure map of allowed fields and tables for the report builder.
// This is a critical security measure to prevent SQL injection.
const REPORT_BUILDER_FIELD_MAP = {
    journal_entry_lines: {
        from: 'FROM journal_entry_lines jel',
        joins: `
            JOIN journal_entries je ON je.id = jel.journal_entry_id
            JOIN accounts a ON a.id = jel.account_id
            LEFT JOIN funds f ON f.id = jel.fund_id
            LEFT JOIN entities e ON e.id = je.entity_id`,
        fields: {
            entry_date: { sql: 'je.entry_date', type: 'date' },
            reference_number: { sql: 'je.reference_number', type: 'string' },
            description: { sql: 'jel.description', type: 'string' },
            debit_amount: { sql: 'jel.debit_amount', type: 'number' },
            credit_amount: { sql: 'jel.credit_amount', type: 'number' },
            account_code: { sql: 'a.code', type: 'string' },
            account_name: { sql: 'a.name', type: 'string' },
            account_type: { sql: 'a.type', type: 'string' },
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
            name: { sql: 'a.name', type: 'string' },
            type: { sql: 'a.type', type: 'string' },
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
    const { rows } = await pool.query('SELECT id, name, description FROM custom_report_definitions ORDER BY name');
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

module.exports = router;
