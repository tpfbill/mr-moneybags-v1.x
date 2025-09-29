-- database/migrations/2025-09-29-01_add-bank-accounts-beginning-balance.sql
-- Purpose: Align bank_accounts schema with runtime expectations and add
--          beginning balance support with safe, idempotent backfill.

BEGIN;

-- Ensure required columns exist (idempotent)
ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS gl_account_id UUID REFERENCES accounts(id);

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS cash_account_id UUID REFERENCES accounts(id);

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS beginning_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00;

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS beginning_balance_date DATE;

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS connection_method VARCHAR(50) DEFAULT 'Manual';

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ;

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS last_reconciliation_id UUID;

ALTER TABLE IF EXISTS bank_accounts
    ADD COLUMN IF NOT EXISTS reconciled_balance DECIMAL(15,2) DEFAULT 0.00;

-- Backfill beginning balance from legacy balance when appropriate
UPDATE bank_accounts
   SET beginning_balance      = COALESCE(NULLIF(beginning_balance, 0.00), balance),
       beginning_balance_date = COALESCE(beginning_balance_date, CURRENT_DATE)
 WHERE (beginning_balance IS NULL OR beginning_balance = 0.00)
   AND balance IS NOT NULL;

-- Keep cash/gl mapping synchronized when one exists
UPDATE bank_accounts
   SET cash_account_id = gl_account_id
 WHERE cash_account_id IS NULL
   AND gl_account_id IS NOT NULL;

COMMIT;
