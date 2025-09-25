-- Migration: Add connection columns to bank_accounts
-- Date: 2025-09-23
-- Purpose: Ensure bank_accounts has connection_method and last_sync columns

BEGIN;

DO $$
BEGIN
    -- Add connection_method if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bank_accounts'
          AND column_name = 'connection_method'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN connection_method VARCHAR(50) DEFAULT 'Manual';
    END IF;

    -- Add last_sync if missing
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bank_accounts'
          AND column_name = 'last_sync'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN last_sync TIMESTAMPTZ;
    END IF;
END $$;

COMMIT;
