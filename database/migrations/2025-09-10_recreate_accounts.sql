-- =============================================================================
-- ACCOUNTS TABLE RECREATION MIGRATION
-- =============================================================================
-- Date: 2025-09-10
-- Description: Drops and recreates the accounts table with new schema
-- =============================================================================

-- Start a transaction for atomicity
BEGIN;

-- =============================================================================
-- 1. DROP EXISTING ACCOUNTS TABLE (CASCADE will remove dependent constraints)
-- =============================================================================
DROP TABLE IF EXISTS accounts CASCADE;

-- =============================================================================
-- 2. CREATE NEW ACCOUNTS TABLE
-- =============================================================================
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(25) NOT NULL,
    description VARCHAR(100) NOT NULL,
    entity_code VARCHAR(10) NOT NULL,
    gl_code VARCHAR(10) NOT NULL,
    fund_number VARCHAR(10) NOT NULL,
    restriction VARCHAR(10) NOT NULL,
    classification VARCHAR(25) NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('Active', 'Inactive')),
    balance_sheet VARCHAR(10) NOT NULL CHECK (balance_sheet IN ('Yes', 'No')),
    beginning_balance DECIMAL(14,2) NULL,
    beginning_balance_date DATE NULL,
    last_used DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Foreign key constraints
    CONSTRAINT fk_accounts_entity_code FOREIGN KEY (entity_code) 
        REFERENCES entities(code) ON DELETE RESTRICT,
    CONSTRAINT fk_accounts_gl_code FOREIGN KEY (gl_code) 
        REFERENCES gl_codes(code) ON DELETE RESTRICT,
    CONSTRAINT fk_accounts_fund_number FOREIGN KEY (fund_number) 
        REFERENCES funds(fund_number) ON DELETE RESTRICT
);

-- =============================================================================
-- 3. CREATE INDEXES
-- =============================================================================
CREATE INDEX idx_accounts_account_code ON accounts(account_code);
CREATE INDEX idx_accounts_gl_code ON accounts(gl_code);
CREATE INDEX idx_accounts_fund_number ON accounts(fund_number);

-- =============================================================================
-- 4. RE-ADD FOREIGN KEYS FROM DEPENDENT TABLES
-- =============================================================================

-- Re-add FK from journal_entry_items to accounts
ALTER TABLE journal_entry_items
    DROP CONSTRAINT IF EXISTS fk_journal_entry_items_account_id,
    ADD CONSTRAINT fk_journal_entry_items_account_id 
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;

-- Re-add FK from bank_deposit_items to accounts (if exists)
DO $$
BEGIN
    -- Check if bank_deposit_items table exists
    IF EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'bank_deposit_items'
    ) THEN
        -- Check if account_id column exists in bank_deposit_items
        IF EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'bank_deposit_items' 
            AND column_name = 'account_id'
        ) THEN
            -- Drop existing constraint if it exists
            IF EXISTS (
                SELECT FROM information_schema.table_constraints
                WHERE constraint_name = 'fk_bank_deposit_items_account_id'
                AND table_schema = 'public'
            ) THEN
                ALTER TABLE bank_deposit_items DROP CONSTRAINT fk_bank_deposit_items_account_id;
            END IF;
            
            -- Add the new constraint
            ALTER TABLE bank_deposit_items
                ADD CONSTRAINT fk_bank_deposit_items_account_id 
                FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT;
        END IF;
    END IF;
END $$;

-- Check for any other tables that might reference accounts(id)
DO $$
DECLARE
    ref_table text;
    ref_column text;
    constraint_name text;
BEGIN
    FOR ref_table, ref_column, constraint_name IN
        SELECT ccu.table_name, ccu.column_name, tc.constraint_name
        FROM information_schema.constraint_column_usage ccu
        JOIN information_schema.table_constraints tc
            ON tc.constraint_name = ccu.constraint_name
        WHERE ccu.table_schema = 'public'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'accounts'
            AND ccu.column_name = 'id'
            AND tc.table_name NOT IN ('journal_entry_items', 'bank_deposit_items')
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I, ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES accounts(id) ON DELETE RESTRICT', 
                      ref_table, constraint_name, constraint_name, ref_column);
        RAISE NOTICE 'Recreated foreign key constraint % on table %.%', constraint_name, ref_table, ref_column;
    END LOOP;
END $$;

-- =============================================================================
-- 5. ADD COMMENT TO TABLE
-- =============================================================================
COMMENT ON TABLE accounts IS 'Chart of accounts with entity, gl_code, and fund references';

-- Commit the transaction
COMMIT;
