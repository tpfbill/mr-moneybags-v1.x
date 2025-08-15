-- database/db-init.sql
-- Comprehensive Database Initialization Script for Nonprofit Fund Accounting v9.0
-- =============================================================================
-- This script creates a complete database schema with all necessary tables,
-- relationships, constraints, and sample data for the v9.0 system.
-- It is idempotent and can be run multiple times without causing errors.
-- All tables use IF NOT EXISTS to prevent duplicate creation.
-- =============================================================================

BEGIN;

-- Set client_min_messages to warning to reduce noise
SET client_min_messages TO warning;

-- =============================================================================
-- EXTENSIONS
-- =============================================================================
-- Create necessary PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- For UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- For text search
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- For encryption functions

-- =============================================================================
-- SCHEMA VERSIONING
-- Tracks the database schema version applied by this seed
-- =============================================================================
CREATE TABLE IF NOT EXISTS schema_meta (
    version     VARCHAR(64) PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Record current schema version for this seed
INSERT INTO schema_meta (version)
VALUES ('2025-08-15-02')
ON CONFLICT (version) DO NOTHING;

-- =============================================================================
-- ENTITIES TABLE
-- Stores organizational entities/departments in a hierarchical structure
-- =============================================================================
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) UNIQUE NOT NULL,
    parent_entity_id UUID REFERENCES entities(id),
    is_consolidated BOOLEAN DEFAULT FALSE,
    fiscal_year_start VARCHAR(5) DEFAULT '01-01',
    base_currency CHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'Active',
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- ACCOUNTS TABLE
-- Chart of accounts for the accounting system
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    description TEXT,
    parent_id UUID REFERENCES accounts(id),
    balance DECIMAL(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, code)
);

-- =============================================================================
-- FUNDS TABLE
-- Stores fund definitions for fund accounting
-- =============================================================================
CREATE TABLE IF NOT EXISTS funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    restriction_type VARCHAR(50) DEFAULT 'unrestricted',
    description TEXT,
    balance DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, code)
);

-- =============================================================================
-- JOURNAL_ENTRIES TABLE
-- Stores journal entry headers
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    target_entity_id UUID REFERENCES entities(id),
    import_id UUID,
    entry_date DATE NOT NULL,
    reference_number VARCHAR(50),
    description TEXT,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Draft',
    is_inter_entity BOOLEAN DEFAULT FALSE,
    matching_transaction_id UUID,
    entry_type VARCHAR(50) DEFAULT 'standard',
    created_by VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- JOURNAL_ENTRY_ITEMS TABLE
-- Stores journal entry line items with updated column names
-- =============================================================================
CREATE TABLE IF NOT EXISTS journal_entry_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    fund_id UUID NOT NULL REFERENCES funds(id),
    debit DECIMAL(15,2) DEFAULT 0.00,
    credit DECIMAL(15,2) DEFAULT 0.00,
    description TEXT,
    transfer_fund_id UUID REFERENCES funds(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- VENDORS TABLE
-- Stores vendor information
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    vendor_code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    tax_id VARCHAR(20),
    contact_name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    address_line1 VARCHAR(100),
    address_line2 VARCHAR(100),
    city VARCHAR(50),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(50) DEFAULT 'USA',
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, vendor_code)
);

-- =============================================================================
-- VENDOR_BANK_ACCOUNTS TABLE
-- Stores vendor bank account information for electronic payments
-- =============================================================================
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    routing_number VARCHAR(20) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    bank_name VARCHAR(100),
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PAYMENT_BATCHES TABLE
-- Stores payment batch information
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    fund_id UUID NOT NULL REFERENCES funds(id),
    nacha_settings_id UUID,
    batch_number VARCHAR(50) NOT NULL,
    batch_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Draft',
    created_by VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- PAYMENT_ITEMS TABLE
-- Stores individual payment items within a batch
-- =============================================================================
CREATE TABLE IF NOT EXISTS payment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    vendor_bank_account_id UUID REFERENCES vendor_bank_accounts(id),
    journal_entry_id UUID REFERENCES journal_entries(id),
    amount DECIMAL(15,2) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- NACHA_FILES TABLE
-- Stores NACHA file information for ACH payments
-- =============================================================================
-- =============================================================================

-- =============================================================================
-- BANK DEPOSITS MODULE
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    deposit_date DATE NOT NULL,
    deposit_type VARCHAR(50) NOT NULL,
    reference_number VARCHAR(50),
    description TEXT,
    memo TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    submitted_date TIMESTAMP,
    submitted_by UUID REFERENCES users(id),
    cleared_date DATE,
    clearing_reference VARCHAR(100),
    cleared_by UUID REFERENCES users(id),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_deposit_status CHECK (status IN ('Draft','Submitted','Cleared','Rejected'))
);

CREATE INDEX IF NOT EXISTS idx_bank_deposits_account ON bank_deposits(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_date    ON bank_deposits(deposit_date);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_status  ON bank_deposits(status);

CREATE TABLE IF NOT EXISTS bank_deposit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deposit_id UUID NOT NULL REFERENCES bank_deposits(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    check_number VARCHAR(50),
    check_date DATE,
    payer_name VARCHAR(100),
    description TEXT,
    gl_account_id UUID REFERENCES accounts(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_deposit ON bank_deposit_items(deposit_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_account ON bank_deposit_items(gl_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_type    ON bank_deposit_items(item_type);

-- =============================================================================
-- BANK RECONCILIATION MODULE
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    statement_date DATE NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    opening_balance DECIMAL(15,2) NOT NULL,
    closing_balance DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Uploaded',
    file_name VARCHAR(255),
    file_path VARCHAR(1024),
    import_method VARCHAR(50) DEFAULT 'Manual',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_statement_status CHECK (status IN ('Uploaded','Processed','Reconciled'))
);

CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date    ON bank_statements(statement_date);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status  ON bank_statements(status);

CREATE TABLE IF NOT EXISTS bank_statement_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    description TEXT NOT NULL,
    reference VARCHAR(100),
    amount DECIMAL(15,2) NOT NULL,
    running_balance DECIMAL(15,2),
    transaction_type VARCHAR(20) NOT NULL,
    check_number VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'Unmatched',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_tx_status CHECK (status IN ('Unmatched','Matched','Ignored'))
);

CREATE INDEX IF NOT EXISTS idx_bank_statement_tx_stmt   ON bank_statement_transactions(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_tx_date   ON bank_statement_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_statement_tx_status ON bank_statement_transactions(status);

CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    bank_statement_id UUID REFERENCES bank_statements(id),
    reconciliation_date DATE NOT NULL,
    start_balance DECIMAL(15,2) NOT NULL,
    end_balance DECIMAL(15,2) NOT NULL,
    book_balance DECIMAL(15,2) NOT NULL,
    statement_balance DECIMAL(15,2) NOT NULL,
    difference DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'In Progress',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_rec_status CHECK (status IN ('In Progress','Completed','Approved'))
);

CREATE INDEX IF NOT EXISTS idx_bank_recs_account ON bank_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_recs_date    ON bank_reconciliations(reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_bank_recs_status  ON bank_reconciliations(status);

CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    bank_statement_transaction_id UUID REFERENCES bank_statement_transactions(id),
    journal_entry_item_id UUID REFERENCES journal_entry_items(id),
    match_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Matched',
    amount DECIMAL(15,2) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bank_rec_items_rec     ON bank_reconciliation_items(bank_reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_items_stmt_tx ON bank_reconciliation_items(bank_statement_transaction_id);
CREATE INDEX IF NOT EXISTS idx_bank_rec_items_jei     ON bank_reconciliation_items(journal_entry_item_id);

CREATE TABLE IF NOT EXISTS bank_reconciliation_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    adjustment_date DATE NOT NULL,
    description TEXT NOT NULL,
    adjustment_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_bank_rec_adj_status CHECK (status IN ('Pending','Approved'))
);

CREATE INDEX IF NOT EXISTS idx_bank_rec_adjs_rec ON bank_reconciliation_adjustments(bank_reconciliation_id);

-- =============================================================================
-- CHECK PRINTING MODULE
-- =============================================================================
CREATE TABLE IF NOT EXISTS check_formats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    format_name VARCHAR(100) NOT NULL,
    description TEXT,
    check_width DECIMAL(8,2) NOT NULL,
    check_height DECIMAL(8,2) NOT NULL,
    payee_x DECIMAL(8,2) NOT NULL,
    payee_y DECIMAL(8,2) NOT NULL,
    date_x DECIMAL(8,2) NOT NULL,
    date_y DECIMAL(8,2) NOT NULL,
    amount_x DECIMAL(8,2) NOT NULL,
    amount_y DECIMAL(8,2) NOT NULL,
    amount_words_x DECIMAL(8,2) NOT NULL,
    amount_words_y DECIMAL(8,2) NOT NULL,
    memo_x DECIMAL(8,2) NOT NULL,
    memo_y DECIMAL(8,2) NOT NULL,
    signature_x DECIMAL(8,2) NOT NULL,
    signature_y DECIMAL(8,2) NOT NULL,
    font_name VARCHAR(100) DEFAULT 'Arial',
    font_size_normal DECIMAL(5,2) DEFAULT 10.00,
    font_size_amount DECIMAL(5,2) DEFAULT 12.00,
    format_data JSONB,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_check_formats_default ON check_formats(is_default);

CREATE TABLE IF NOT EXISTS printed_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    check_number VARCHAR(20) NOT NULL,
    check_date DATE NOT NULL,
    payee_name VARCHAR(100) NOT NULL,
    vendor_id UUID REFERENCES vendors(id),
    amount DECIMAL(15,2) NOT NULL,
    amount_in_words TEXT NOT NULL,
    memo TEXT,
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    address_city VARCHAR(100),
    address_state VARCHAR(50),
    address_zip VARCHAR(20),
    check_format_id UUID REFERENCES check_formats(id),
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    created_by UUID REFERENCES users(id),
    printed_by UUID REFERENCES users(id),
    voided_by UUID REFERENCES users(id),
    cleared_by UUID REFERENCES users(id),
    printed_date TIMESTAMP,
    voided_date TIMESTAMP,
    cleared_date TIMESTAMP,
    void_reason TEXT,
    clearing_reference VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_check_number_per_account UNIQUE (bank_account_id, check_number),
    CONSTRAINT chk_check_status CHECK (status IN ('Draft','Printed','Voided','Cleared'))
);

CREATE INDEX IF NOT EXISTS idx_printed_checks_account ON printed_checks(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_printed_checks_date    ON printed_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_printed_checks_status  ON printed_checks(status);
CREATE TABLE IF NOT EXISTS nacha_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_batch_id UUID NOT NULL REFERENCES payment_batches(id),
    filename VARCHAR(100) NOT NULL,
    file_date DATE NOT NULL,
    file_content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'Generated',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- COMPANY_NACHA_SETTINGS TABLE
-- Stores company NACHA settings for ACH file generation
-- =============================================================================
CREATE TABLE IF NOT EXISTS company_nacha_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    settlement_account_id UUID,
    company_name VARCHAR(100) NOT NULL,
    company_id VARCHAR(10) NOT NULL,
    originating_dfi_id VARCHAR(10) NOT NULL,
    immediate_destination VARCHAR(10),
    immediate_origin VARCHAR(10),
    company_entry_description VARCHAR(10) DEFAULT 'PAYMENT',
    is_production BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- BANK_ACCOUNTS TABLE
-- Stores bank account information
-- =============================================================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    gl_account_id UUID REFERENCES accounts(id),
    bank_name VARCHAR(100) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    routing_number VARCHAR(20) NOT NULL,
    type VARCHAR(20) NOT NULL,
    balance DECIMAL(15,2) DEFAULT 0.00,
    last_reconciliation_date DATE,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- Ensure new columns required by banking modules exist (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    -- last_reconciliation_id ---------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bank_accounts'
          AND column_name = 'last_reconciliation_id'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN last_reconciliation_id UUID;
    END IF;

    -- reconciled_balance -------------------------------------------------------
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'bank_accounts'
          AND column_name = 'reconciled_balance'
    ) THEN
        ALTER TABLE bank_accounts
            ADD COLUMN reconciled_balance DECIMAL(15,2) DEFAULT 0.00;
    END IF;
END $$;

-- =============================================================================
-- BUDGETS TABLE
-- Stores budget information
-- =============================================================================
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    fund_id UUID NOT NULL REFERENCES funds(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    fiscal_year VARCHAR(4) NOT NULL,
    period VARCHAR(10) NOT NULL,
    amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, fund_id, account_id, fiscal_year, period)
);

-- =============================================================================
-- USERS TABLE
-- Stores user authentication and profile data
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- CUSTOM_REPORT_DEFINITIONS TABLE
-- Stores custom report definitions
-- =============================================================================
CREATE TABLE IF NOT EXISTS custom_report_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    definition_json JSONB NOT NULL,
    created_by VARCHAR(100),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================================================
-- CONSTRAINTS AND INDEXES
-- =============================================================================

-- Journal Entry Items constraints with updated column names
ALTER TABLE IF EXISTS journal_entry_items 
ADD CONSTRAINT chk_debit_credit_not_both_zero 
CHECK (debit > 0 OR credit > 0);

ALTER TABLE IF EXISTS journal_entry_items 
ADD CONSTRAINT chk_debit_or_credit_only 
CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity_id ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_journal_entry_id ON journal_entry_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_account_id ON journal_entry_items(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_items_fund_id ON journal_entry_items(fund_id);
CREATE INDEX IF NOT EXISTS idx_accounts_entity_id ON accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_funds_entity_id ON funds(entity_id);
CREATE INDEX IF NOT EXISTS idx_vendors_entity_id ON vendors(entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_items_payment_batch_id ON payment_items(payment_batch_id);

-- =============================================================================
-- SAMPLE DATA
-- =============================================================================

-- Sample Entities
INSERT INTO entities (id, name, code, is_consolidated, status)
VALUES 
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'The Principle Foundation', 'TPF_PARENT', TRUE, 'Active'),
    ('d8b3a2e1-5f4c-4e5b-8d7f-3c9a8b7e6d5c', 'TPF Education Services', 'TPF-ES', FALSE, 'Active'),
    ('e9c4b3a2-6d5e-4f6c-9a8b-7c6d5e4f3a2b', 'TPF International Fund', 'TPF-IF', FALSE, 'Active')
ON CONFLICT (code) DO NOTHING;

-- Update parent-child relationships
-- NOTE: Avoid hard-coded UUIDs so the script can run even if the IDs were
-- generated differently on a previous run.  Look up the parent’s id by code.
UPDATE entities       AS e
SET    parent_entity_id = p.id
FROM   entities        AS p
WHERE  p.code = 'TPF_PARENT'
  AND  e.code IN ('TPF-ES', 'TPF-IF')
  AND  e.parent_entity_id IS NULL;

-- Sample Accounts
INSERT INTO accounts (id, entity_id, code, name, type, balance, status)
VALUES
    ('a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '1000', 'Cash - Operating', 'Asset', 100000.00, 'Active'),
    ('b2c3d4e5-f6a7-5b6c-9d0e-2f3a4b5c6d7e', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '1200', 'Accounts Receivable', 'Asset', 25000.00, 'Active'),
    ('c3d4e5f6-a7b8-6c7d-0e1f-3a4b5c6d7e8f', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '2000', 'Accounts Payable', 'Liability', 15000.00, 'Active'),
    ('d4e5f6a7-b8c9-7d8e-1f2a-4b5c6d7e8f9a', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '3000', 'Fund Balance', 'Equity', 110000.00, 'Active'),
    ('e5f6a7b8-c9d0-8e9f-2a3b-5c6d7e8f9a0b', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '4000', 'Contribution Revenue', 'Revenue', 0.00, 'Active'),
    ('f6a7b8c9-d0e1-9f0a-3b4c-6d7e8f9a0b1c', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '5000', 'Program Expenses', 'Expense', 0.00, 'Active'),
    ('a7b8c9d0-e1f2-0a1b-4c5d-7e8f9a0b1c2d', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '1900', 'Due From TPF-ES', 'Asset', 5000.00, 'Active'),
    ('b8c9d0e1-f2a3-1b2c-5d6e-8f9a0b1c2d3e', (SELECT id FROM entities WHERE code = 'TPF-ES'),      '2900', 'Due To TPF Parent', 'Liability', 5000.00, 'Active')
ON CONFLICT (entity_id, code) DO NOTHING;

-- Sample Funds
INSERT INTO funds (id, entity_id, code, name, type, restriction_type, balance, status)
VALUES
    ('f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'GEN-FND', 'General Fund', 'Operating', 'unrestricted', 75000.00, 'Active'),
    ('f2e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'EDU-FND', 'Education Fund', 'Program', 'temporarily_restricted', 25000.00, 'Active'),
    ('f3e4d5c6-b7a8-6c7d-0e1f-3a4b5c6d7e8f', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'END-FND', 'Endowment Fund', 'Endowment', 'permanently_restricted', 10000.00, 'Active'),
    ('f4e5d6c7-b8a9-7d8e-1f2a-4b5c6d7e8f9a', (SELECT id FROM entities WHERE code = 'TPF-ES'),      'ES-GEN', 'ES General Fund', 'Operating', 'unrestricted', 15000.00, 'Active')
ON CONFLICT (entity_id, code) DO NOTHING;

-- Sample Journal Entries
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status)
VALUES
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '2025-07-15', 'JE-2025-001', 'Donation from Smith Foundation', 10000.00, 'Posted'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), '2025-07-16', 'JE-2025-002', 'Payment for educational materials', 2500.00, 'Posted')
ON CONFLICT (id) DO NOTHING;

-- Sample Journal Entry Items with updated column names (debit/credit)
INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
VALUES
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d',
        (SELECT id FROM accounts WHERE code = '1000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM funds    WHERE code = 'GEN-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        10000.00, 0.00, 'Cash received'),
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d',
        (SELECT id FROM accounts WHERE code = '4000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM funds    WHERE code = 'GEN-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        0.00, 10000.00, 'Donation revenue'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e',
        (SELECT id FROM accounts WHERE code = '5000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM funds    WHERE code = 'EDU-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        2500.00, 0.00, 'Educational materials expense'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e',
        (SELECT id FROM accounts WHERE code = '1000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM funds    WHERE code = 'EDU-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        0.00, 2500.00, 'Cash payment')
ON CONFLICT DO NOTHING;

-- Sample Vendors
INSERT INTO vendors (id, entity_id, vendor_code, name, tax_id, contact_name, email, status)
VALUES
    ('71e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'EDUSUP-001', 'Educational Supplies Inc', '12-3456789', 'John Smith', 'john@edusupplies.com', 'Active'),
    ('72e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', (SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'OFFSUPP-002', 'Office Supplies Co', '98-7654321', 'Jane Doe', 'jane@officesupplies.com', 'Active')
ON CONFLICT (entity_id, vendor_code) DO NOTHING;

-- Sample Vendor Bank Accounts
INSERT INTO vendor_bank_accounts (vendor_id, account_name, account_number, routing_number, account_type, is_primary)
VALUES
    ((SELECT id FROM vendors WHERE vendor_code = 'EDUSUP-001'), 'Operating Account', '123456789', '021000021', 'Checking', TRUE),
    ((SELECT id FROM vendors WHERE vendor_code = 'OFFSUPP-002'), 'Main Account', '987654321', '021000021', 'Checking', TRUE)
ON CONFLICT DO NOTHING;

-- Sample Bank Accounts
INSERT INTO bank_accounts (entity_id, gl_account_id, bank_name, account_name, account_number, routing_number, type, balance, status)
VALUES
    ((SELECT id FROM entities WHERE code = 'TPF_PARENT'),
        (SELECT id FROM accounts WHERE code = '1000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        'First National Bank', 'Operating Account', '1234567890', '021000021', 'Checking', 100000.00, 'Active'),
    ((SELECT id FROM entities WHERE code = 'TPF-ES'),
        NULL,
        'Second National Bank', 'ES Operating Account', '0987654321', '021000021', 'Checking', 15000.00, 'Active')
ON CONFLICT DO NOTHING;

-- Sample Users
INSERT INTO users (username, password_hash, email, first_name, last_name, role, status)
VALUES
    ('admin', '$2a$10$8KxO7M0O6h.WN/JaXXJJtO2AxJOZlJKlmIVW9vFDXqvT3Wp3JzZr2', 'admin@example.com', 'Admin', 'User', 'admin', 'active'),
    ('user', '$2a$10$8KxO7M0O6h.WN/JaXXJJtO2AxJOZlJKlmIVW9vFDXqvT3Wp3JzZr2', 'user@example.com', 'Regular', 'User', 'user', 'active')
ON CONFLICT (username) DO NOTHING;

-- Sample NACHA Settings
INSERT INTO company_nacha_settings (entity_id, company_name, company_id, originating_dfi_id, is_production)
VALUES
    ((SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'The Principle Foundation', '1234567890', '02100002', FALSE)
ON CONFLICT DO NOTHING;

-- Sample Budget
INSERT INTO budgets (entity_id, fund_id, account_id, fiscal_year, period, amount)
VALUES
    ((SELECT id FROM entities WHERE code = 'TPF_PARENT'),
        (SELECT id FROM funds    WHERE code = 'GEN-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM accounts WHERE code = '4000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        '2025', 'Q1', 25000.00),
    ((SELECT id FROM entities WHERE code = 'TPF_PARENT'),
        (SELECT id FROM funds    WHERE code = 'GEN-FND' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        (SELECT id FROM accounts WHERE code = '5000' AND entity_id = (SELECT id FROM entities WHERE code = 'TPF_PARENT')),
        '2025', 'Q1', 20000.00)
ON CONFLICT DO NOTHING;

-- Sample Custom Report Definition
INSERT INTO custom_report_definitions (entity_id, name, description, definition_json, created_by)
VALUES
    ((SELECT id FROM entities WHERE code = 'TPF_PARENT'), 'Quarterly Fund Balance', 'Shows fund balances by quarter', 
    '{"dataSource": "funds", "fields": ["name", "code", "balance"], "filters": [{"field": "status", "operator": "=", "value": "Active"}]}', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
