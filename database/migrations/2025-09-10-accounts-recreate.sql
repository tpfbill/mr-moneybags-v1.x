-- database/migrations/2025-09-10-accounts-recreate.sql
-- =============================================================================
-- Migration: Drop and recreate accounts table with new schema
-- Date: 2025-09-10
-- 
-- This migration safely drops and recreates the accounts table according to
-- the new schema requirements. It handles foreign key constraints and includes
-- checks for idempotency.
-- =============================================================================

-- Ensure UUID extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

BEGIN;

-- Step 1: Drop foreign key constraints that reference accounts (if they exist)
ALTER TABLE IF EXISTS journal_entry_items DROP CONSTRAINT IF EXISTS journal_entry_items_account_id_fkey;
ALTER TABLE IF EXISTS bank_accounts DROP CONSTRAINT IF EXISTS bank_accounts_gl_account_id_fkey;
ALTER TABLE IF EXISTS budgets DROP CONSTRAINT IF EXISTS budgets_account_id_fkey;
ALTER TABLE IF EXISTS bank_deposit_items DROP CONSTRAINT IF EXISTS bank_deposit_items_gl_account_id_fkey;

-- Fallback: drop any other still-remaining FK constraints that reference accounts
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname, conrelid::regclass AS tbl
        FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'accounts'::regclass
    ) LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tbl, r.conname);
    END LOOP;
END $$;

-- Step 2: Drop the accounts table if it exists
DROP TABLE IF EXISTS accounts;

-- Step 3: Create the accounts table with the new schema
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    report_code VARCHAR(20),
    description VARCHAR(100) NOT NULL,
    classifications VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    parent_id UUID REFERENCES accounts(id),
    balance DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, code)
);

-- Step 4: Add chart_code column if it doesn't exist
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS chart_code VARCHAR(50);

-- Step 5: Backfill report_code from code when code is 4 digits
-- This is a no-op on an empty table but will work if there's data
UPDATE accounts 
SET report_code = code
WHERE report_code IS NULL AND code ~ '^[0-9]{4}$';

-- Step 6: Re-add the foreign key constraints for tables that reference accounts
-- Only if the referencing tables exist and the constraint is not already present

-- journal_entry_items.account_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'journal_entry_items'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'journal_entry_items_account_id_fkey'
    ) THEN
        ALTER TABLE journal_entry_items
        ADD CONSTRAINT journal_entry_items_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES accounts(id) NOT VALID;
    END IF;
END $$;

-- bank_accounts.gl_account_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bank_accounts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bank_accounts_gl_account_id_fkey'
    ) THEN
        ALTER TABLE bank_accounts
        ADD CONSTRAINT bank_accounts_gl_account_id_fkey
        FOREIGN KEY (gl_account_id) REFERENCES accounts(id) NOT VALID;
    END IF;
END $$;

-- bank_deposit_items.gl_account_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'bank_deposit_items'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'bank_deposit_items_gl_account_id_fkey'
    ) THEN
        ALTER TABLE bank_deposit_items
        ADD CONSTRAINT bank_deposit_items_gl_account_id_fkey
        FOREIGN KEY (gl_account_id) REFERENCES accounts(id) NOT VALID;
    END IF;
END $$;

-- budgets.account_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'budgets'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'budgets_account_id_fkey'
    ) THEN
        ALTER TABLE budgets
        ADD CONSTRAINT budgets_account_id_fkey
        FOREIGN KEY (account_id) REFERENCES accounts(id) NOT VALID;
    END IF;
END $$;

-- Step 7: Create index on entity_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_accounts_entity_id ON accounts(entity_id);

COMMIT;
