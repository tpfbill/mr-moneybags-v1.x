-- database/migrations/2025-10-30-accounting-rules.sql
-- Foundation for accounting rules engine
-- Creates accounting_rules table and seeds default active rules

BEGIN;

CREATE TABLE IF NOT EXISTS accounting_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL,
  rule_value JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure one active row per rule_key (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_accounting_rules_active
  ON accounting_rules ((LOWER(rule_key)))
  WHERE is_active;

-- Seed default rules if none exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounting_rules WHERE LOWER(rule_key) = 'balance.delta' AND is_active) THEN
    INSERT INTO accounting_rules (rule_key, rule_value, description)
    VALUES (
      'balance.delta',
      '{"sql":"COALESCE({debit},0::numeric) - COALESCE({credit},0::numeric)"}',
      'Uniform balance rule: DEBIT adds, CREDIT subtracts'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM accounting_rules WHERE LOWER(rule_key) = 'revenue.predicate' AND is_active) THEN
    INSERT INTO accounting_rules (rule_key, rule_value, description)
    VALUES (
      'revenue.predicate',
      '{"sql":"(LOWER({gc_line_type_a}) = ''revenue'' OR LOWER({gc_line_type_j}) = ''revenue'' OR COALESCE({gl_code_a},{gl_code_j}) LIKE ''4%'')"}',
      'Revenue detection via gl_codes.line_type = revenue with 4xxx prefix fallback'
    );
  END IF;
END $$;

COMMIT;
