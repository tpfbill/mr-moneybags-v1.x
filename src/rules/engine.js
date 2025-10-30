// src/rules/engine.js
// Lightweight rules engine foundation for accounting logic
// - Centralizes SQL snippets for debit/credit delta and revenue predicate
// - Reads overrides from accounting_rules table when present; otherwise uses defaults

const { pool } = require('../database/connection');

const DEFAULTS = {
  'balance.delta': {
    sql: 'COALESCE({debit},0::numeric) - COALESCE({credit},0::numeric)'
  },
  'revenue.predicate': {
    sql: "(LOWER({gc_line_type_a}) = 'revenue' OR LOWER({gc_line_type_j}) = 'revenue' OR COALESCE({gl_code_a},{gl_code_j}) LIKE '4%')"
  }
};

// Simple in-process cache
let cache = null;
let lastLoadAt = 0;
const TTL_MS = 30_000; // 30s cache

async function loadRules(force = false) {
  const now = Date.now();
  if (!force && cache && now - lastLoadAt < TTL_MS) return cache;
  const out = { ...DEFAULTS };
  try {
    const { rows } = await pool.query(
      `SELECT LOWER(rule_key) AS k, rule_value FROM accounting_rules WHERE is_active = TRUE`
    );
    rows.forEach(r => {
      const k = r.k;
      const v = r.rule_value || {};
      if (v && typeof v.sql === 'string' && v.sql.trim()) {
        out[k] = { sql: String(v.sql) };
      }
    });
  } catch (_) {
    // Table may not exist yet; fall back to defaults silently
  }
  cache = out;
  lastLoadAt = now;
  return out;
}

function fmt(template, mapping) {
  return template.replace(/\{([a-z_]+)\}/gi, (_, key) => {
    return Object.prototype.hasOwnProperty.call(mapping, key) ? mapping[key] : `{${key}}`;
  });
}

async function sqlDelta(debitExpr, creditExpr) {
  const rules = await loadRules();
  const tpl = rules['balance.delta']?.sql || DEFAULTS['balance.delta'].sql;
  return fmt(tpl, { debit: debitExpr, credit: creditExpr });
}

async function sqlRevenuePredicate({
  glCodeA = 'a.gl_code',
  glCodeJ = 'jel.gl_code',
  gcLineTypeA = 'gcA.line_type',
  gcLineTypeJ = 'gcJ.line_type'
} = {}) {
  const rules = await loadRules();
  const tpl = rules['revenue.predicate']?.sql || DEFAULTS['revenue.predicate'].sql;
  return fmt(tpl, {
    gl_code_a: glCodeA,
    gl_code_j: glCodeJ,
    gc_line_type_a: gcLineTypeA,
    gc_line_type_j: gcLineTypeJ
  });
}

module.exports = {
  loadRules,
  sql: {
    delta: sqlDelta,
    revenuePredicate: sqlRevenuePredicate
  }
};
