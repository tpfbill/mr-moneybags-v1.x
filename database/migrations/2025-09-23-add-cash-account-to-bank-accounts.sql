-- Migration: Add cash_account_id to bank_accounts for JE posting
-- Date: 2025-09-23

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bank_accounts' AND column_name = 'cash_account_id'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN cash_account_id UUID NULL;
    END IF;

    -- Add FK if not exists
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_bank_accounts_cash_account' 
          AND table_name = 'bank_accounts'
    ) THEN
        ALTER TABLE bank_accounts
            ADD CONSTRAINT fk_bank_accounts_cash_account
            FOREIGN KEY (cash_account_id) REFERENCES accounts(id) ON DELETE SET NULL;
    END IF;
END $$;

COMMIT;
