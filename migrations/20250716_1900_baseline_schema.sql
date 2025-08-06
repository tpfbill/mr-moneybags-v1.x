-- =============================================================================
-- 20250716_1900_baseline_schema.sql
-- Baseline schema migration for Nonprofit Fund Accounting v8.8
-- =============================================================================
-- This migration establishes the baseline schema for the v8.8 system.
-- It is idempotent and can be run multiple times without causing errors.
-- All tables use IF NOT EXISTS to prevent duplicate creation.
-- =============================================================================

BEGIN;

-- Set client_min_messages to warning to reduce noise
SET client_min_messages TO warning;

-- Create extensions if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";  -- For text search

-- =============================================================================
-- ENTITIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS entities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    entity_code VARCHAR(50) UNIQUE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_entities_entity_code ON entities(entity_code);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);

-- =============================================================================
-- FUNDS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS funds (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    fund_code VARCHAR(50),
    description TEXT,
    fund_type VARCHAR(50),
    balance DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, fund_code)
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_funds_entity_id ON funds(entity_id);
CREATE INDEX IF NOT EXISTS idx_funds_fund_code ON funds(fund_code);
CREATE INDEX IF NOT EXISTS idx_funds_status ON funds(status);

-- =============================================================================
-- ACCOUNTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    account_type VARCHAR(50) NOT NULL,
    parent_account_id INTEGER REFERENCES accounts(id),
    balance DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, account_number)
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_accounts_entity_id ON accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_parent_account_id ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

-- =============================================================================
-- FISCAL YEARS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS fiscal_years (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    year_name VARCHAR(50) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_current BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'Open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(entity_id, year_name)
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_fiscal_years_entity_id ON fiscal_years(entity_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_is_current ON fiscal_years(is_current);
CREATE INDEX IF NOT EXISTS idx_fiscal_years_status ON fiscal_years(status);

-- =============================================================================
-- JOURNAL ENTRIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    fiscal_year_id INTEGER REFERENCES fiscal_years(id),
    entry_number VARCHAR(50),
    description TEXT,
    entry_date DATE NOT NULL,
    posting_date TIMESTAMPTZ DEFAULT NOW(),
    entry_type VARCHAR(50) DEFAULT 'Standard',
    status VARCHAR(20) DEFAULT 'Posted',
    total_debits DECIMAL(15,2) DEFAULT 0.00,
    total_credits DECIMAL(15,2) DEFAULT 0.00,
    created_by VARCHAR(100),
    approved_by VARCHAR(100),
    matching_transaction_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_id ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal_year_id ON journal_entries(fiscal_year_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_matching_transaction_id ON journal_entries(matching_transaction_id);

-- =============================================================================
-- JOURNAL ENTRY LINES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id SERIAL PRIMARY KEY,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    fund_id INTEGER REFERENCES funds(id),
    description TEXT,
    debit_amount DECIMAL(15,2) DEFAULT 0.00,
    credit_amount DECIMAL(15,2) DEFAULT 0.00,
    line_number INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_fund_id ON journal_entry_lines(fund_id);

-- =============================================================================
-- BANK ACCOUNTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(50),
    routing_number VARCHAR(50),
    type VARCHAR(50) DEFAULT 'Checking',
    status VARCHAR(20) DEFAULT 'Active',
    balance DECIMAL(15,2) DEFAULT 0.00,
    connection_method VARCHAR(50) DEFAULT 'Manual',
    description TEXT,
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_bank_accounts_entity_id ON bank_accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_status ON bank_accounts(status);

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(20) DEFAULT 'Active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- =============================================================================
-- USER_ENTITY_ACCESS TABLE (for multi-entity permissions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_entity_access (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    access_level VARCHAR(50) DEFAULT 'read',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_id)
);

-- Add indexes for faster lookups and joins
CREATE INDEX IF NOT EXISTS idx_user_entity_access_user_id ON user_entity_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_entity_access_entity_id ON user_entity_access(entity_id);

-- =============================================================================
-- IMPORT_JOBS TABLE (for tracking data imports)
-- =============================================================================
CREATE TABLE IF NOT EXISTS import_jobs (
    id SERIAL PRIMARY KEY,
    job_id VARCHAR(36) NOT NULL UNIQUE,
    entity_id INTEGER REFERENCES entities(id) ON DELETE CASCADE,
    import_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    total_records INTEGER DEFAULT 0,
    processed_records INTEGER DEFAULT 0,
    error_records INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_job_id ON import_jobs(job_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_entity_id ON import_jobs(entity_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status ON import_jobs(status);

-- =============================================================================
-- AUDIT_LOGS TABLE (for tracking system changes)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    entity_id INTEGER REFERENCES entities(id),
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INTEGER,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes for faster lookups and reporting
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- =============================================================================
-- Add any missing columns to existing tables (for idempotency)
-- =============================================================================

-- Check if entry_date column exists in journal_entries table and add if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_entries' AND column_name = 'entry_date'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN entry_date DATE;
    END IF;
END $$;

-- Check if connection_method column exists in bank_accounts table and add if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'bank_accounts' AND column_name = 'connection_method'
    ) THEN
        ALTER TABLE bank_accounts ADD COLUMN connection_method VARCHAR(50) DEFAULT 'Manual';
    END IF;
END $$;

-- Check if matching_transaction_id column exists in journal_entries table and add if missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_entries' AND column_name = 'matching_transaction_id'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN matching_transaction_id INTEGER;
    END IF;
END $$;

-- =============================================================================
-- Create or update any necessary views
-- =============================================================================

-- Fund Balance View
CREATE OR REPLACE VIEW fund_balances AS
SELECT 
    f.id AS fund_id,
    f.name AS fund_name,
    f.fund_code,
    e.id AS entity_id,
    e.name AS entity_name,
    f.balance AS current_balance,
    f.fund_type,
    f.status
FROM 
    funds f
JOIN 
    entities e ON f.entity_id = e.id
WHERE 
    f.status = 'Active';

-- Journal Entry Summary View
CREATE OR REPLACE VIEW journal_entry_summary AS
SELECT 
    je.id AS journal_entry_id,
    je.entry_number,
    je.description,
    je.entry_date,
    je.status,
    e.id AS entity_id,
    e.name AS entity_name,
    fy.id AS fiscal_year_id,
    fy.year_name AS fiscal_year,
    je.total_debits,
    je.total_credits,
    je.created_by,
    je.approved_by,
    je.created_at,
    COUNT(jel.id) AS line_count
FROM 
    journal_entries je
JOIN 
    entities e ON je.entity_id = e.id
LEFT JOIN 
    fiscal_years fy ON je.fiscal_year_id = fy.id
LEFT JOIN 
    journal_entry_lines jel ON je.id = jel.journal_entry_id
GROUP BY 
    je.id, e.id, fy.id;

COMMIT;
