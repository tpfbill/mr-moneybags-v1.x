-- database/migrations/2025-09-12-accounts-incremental.sql
-- =============================================================================
-- Incremental migration for Accounts (no table replacement)
-- - Add report_code, chart_code if missing
-- - Backfill report_code from 4-digit code
-- - Enforce unique (entity_id, code)
-- - Optional format check on report_code (nullable, 4 digits)
-- - Ensure description is VARCHAR(100) if data allows
-- - Ensure updated_at trigger exists
-- - Ensure index on entity_id
-- =============================================================================

BEGIN;

-- 1) Add columns if not present
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS report_code VARCHAR(20);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS chart_code  VARCHAR(50);

-- 2) Backfill report_code from 4-digit code
UPDATE accounts
SET report_code = code
WHERE report_code IS NULL AND code ~ '^[0-9]{4}$';

-- 3) description length to 100 if data fits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='accounts' AND column_name='description' AND character_maximum_length = 100
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM accounts WHERE length(description) > 100
    ) THEN
      ALTER TABLE accounts ALTER COLUMN description TYPE VARCHAR(100);
    ELSE
      RAISE NOTICE 'Skipped narrowing description to 100: rows exceed length 100';
    END IF;
  END IF;
END $$;

-- 4) Unique (entity_id, code)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name='accounts' AND tc.constraint_type='UNIQUE' AND tc.constraint_name='accounts_entity_code_key'
  ) THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_entity_code_key UNIQUE (entity_id, code);
  END IF;
END $$;

-- 5) Optional: format check for report_code (nullable, 4 digits)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='accounts_report_code_format_chk') THEN
    ALTER TABLE accounts
      ADD CONSTRAINT accounts_report_code_format_chk
      CHECK (report_code IS NULL OR report_code ~ '^[0-9]{4}$') NOT VALID;
  END IF;
END $$;

-- Try to validate if data conforms
DO $$
BEGIN
  BEGIN
    ALTER TABLE accounts VALIDATE CONSTRAINT accounts_report_code_format_chk;
  EXCEPTION WHEN others THEN
    -- Leave as NOT VALID; can be validated after data cleanup
    NULL;
  END;
END $$;

-- 6) Ensure updated_at trigger auto-sets timestamp
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'accounts_set_updated_at') THEN
    CREATE OR REPLACE FUNCTION accounts_set_updated_at()
    RETURNS trigger AS $f$
    BEGIN
      NEW.updated_at := NOW();
      RETURN NEW;
    END
    $f$ LANGUAGE plpgsql;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_accounts_set_updated_at') THEN
    CREATE TRIGGER trg_accounts_set_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION accounts_set_updated_at();
  END IF;
END $$;

-- 7) Helpful index
CREATE INDEX IF NOT EXISTS idx_accounts_entity_id ON accounts(entity_id);

COMMIT;
