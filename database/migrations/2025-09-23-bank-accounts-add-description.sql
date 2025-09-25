-- Migration: Add description column to bank_accounts
-- Date: 2025-09-23

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'bank_accounts'
          AND column_name = 'description'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN description TEXT;
    END IF;
END $$;

COMMIT;
