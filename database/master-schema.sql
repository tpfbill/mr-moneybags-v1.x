-- =============================================================================
-- NONPROFIT FUND ACCOUNTING SYSTEM - MASTER DATABASE SCHEMA
-- =============================================================================
-- This file contains the complete database schema for the Nonprofit Fund 
-- Accounting System, including all core tables and banking modules.
-- 
-- Features:
--   - Core accounting system (entities, funds, accounts, journal entries)
--   - User authentication with role-based access control
--   - Bank reconciliation module
--   - Bank deposits module
--   - Check printing module
--   - Vendor management
--   - Payment processing
-- =============================================================================

-- -----------------------------------------------------------------------------
-- DATABASE CREATION AND EXTENSIONS
-- -----------------------------------------------------------------------------

-- Create database if it doesn't exist
-- Note: This must be run as a PostgreSQL superuser
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'fund_accounting_db') THEN
        CREATE DATABASE fund_accounting_db;
    END IF;
END
$$;

-- Connect to the database
\c fund_accounting_db

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- SESSION MANAGEMENT TABLES
-- -----------------------------------------------------------------------------

-- Session table for persistent login sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    sid VARCHAR NOT NULL PRIMARY KEY,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS IDX_user_sessions_expire ON user_sessions (expire);

-- -----------------------------------------------------------------------------
-- CORE SYSTEM TABLES
-- -----------------------------------------------------------------------------

-- Users table with authentication support
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_user_status CHECK (status IN ('active', 'inactive', 'suspended')),
    CONSTRAINT chk_user_role CHECK (role IN ('admin', 'user', 'accountant', 'manager', 'viewer'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
COMMENT ON TABLE users IS 'System users with authentication and role-based access control';

-- Entities table (organizational units)
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_consolidated BOOLEAN DEFAULT FALSE,
    base_currency VARCHAR(3) DEFAULT 'USD',
    fiscal_year_start VARCHAR(5) DEFAULT '01-01',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_entity_status CHECK (status IN ('active', 'inactive', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_code ON entities(code);
COMMENT ON TABLE entities IS 'Organizational entities representing the nonprofit structure';

-- Funds table (accounting funds)
CREATE TABLE IF NOT EXISTS funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'Unrestricted',
    description TEXT,
    balance DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_fund_code_entity UNIQUE(code, entity_id),
    CONSTRAINT chk_fund_status CHECK (status IN ('active', 'inactive', 'closed'))
);
CREATE INDEX IF NOT EXISTS idx_funds_entity ON funds(entity_id);
CREATE INDEX IF NOT EXISTS idx_funds_code ON funds(code);
CREATE INDEX IF NOT EXISTS idx_funds_type ON funds(type);
COMMENT ON TABLE funds IS 'Accounting funds for tracking restricted and unrestricted resources';

-- Accounts table (chart of accounts)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    is_contra BOOLEAN DEFAULT FALSE,
    balance DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_account_type CHECK (type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense')),
    CONSTRAINT chk_account_status CHECK (status IN ('active', 'inactive', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(code);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
COMMENT ON TABLE accounts IS 'Chart of accounts for the accounting system';

-- Journal Entries table
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    reference_number VARCHAR(50),
    description TEXT,
    type VARCHAR(50) DEFAULT 'Standard',
    status VARCHAR(20) DEFAULT 'Draft',
    is_recurring BOOLEAN DEFAULT FALSE,
    is_inter_entity BOOLEAN DEFAULT FALSE,
    total_amount DECIMAL(15,2) DEFAULT 0.00,
    created_by VARCHAR(255),
    import_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_je_status CHECK (status IN ('Draft', 'Posted', 'Voided'))
);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entity ON journal_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_import_id ON journal_entries(import_id);
COMMENT ON TABLE journal_entries IS 'Journal entries for recording financial transactions';

-- Journal Entry Lines table
CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE RESTRICT,
    description TEXT,
    debit_amount DECIMAL(15,2) DEFAULT 0.00,
    credit_amount DECIMAL(15,2) DEFAULT 0.00,
    memo TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_je ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_fund ON journal_entry_lines(fund_id);
COMMENT ON TABLE journal_entry_lines IS 'Line items for journal entries with fund and account assignments';

-- Custom Report Definitions table
CREATE TABLE IF NOT EXISTS custom_report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    definition_json JSONB NOT NULL,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE custom_report_definitions IS 'Custom report definitions created by users';

-- Bank Accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    bank_name VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(100),
    routing_number VARCHAR(20),
    type VARCHAR(50) DEFAULT 'Checking',
    status VARCHAR(20) DEFAULT 'Active',
    balance DECIMAL(15,2) DEFAULT 0.00,
    connection_method VARCHAR(50) DEFAULT 'Manual',
    description TEXT,
    last_reconciliation_date DATE,
    last_sync TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_bank_account_type CHECK (type IN ('Checking', 'Savings', 'Money Market', 'Credit Card', 'Other')),
    CONSTRAINT chk_bank_account_status CHECK (status IN ('Active', 'Inactive', 'Closed'))
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_entity ON bank_accounts(entity_id);
COMMENT ON TABLE bank_accounts IS 'Bank accounts for the organization';

-- Vendors table
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    vendor_code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(20),
    contact_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(20),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'USA',
    vendor_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_vendor_status CHECK (status IN ('active', 'inactive', 'suspended'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendor_name ON vendors(name);
CREATE INDEX IF NOT EXISTS idx_vendor_entity ON vendors(entity_id);
COMMENT ON TABLE vendors IS 'Vendors for accounts payable';

-- Company NACHA Settings table
CREATE TABLE IF NOT EXISTS company_nacha_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    company_id VARCHAR(50) NOT NULL,
    immediate_destination VARCHAR(50) NOT NULL,
    immediate_origin VARCHAR(50) NOT NULL,
    destination_name VARCHAR(255) NOT NULL,
    origin_name VARCHAR(255) NOT NULL,
    reference_code VARCHAR(50),
    service_class_code VARCHAR(10) DEFAULT '200',
    company_entry_description VARCHAR(50) DEFAULT 'PAYMENT',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_nacha_settings_entity ON company_nacha_settings(entity_id);
COMMENT ON TABLE company_nacha_settings IS 'NACHA settings for ACH payment processing';

-- Payment Batches table
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
    nacha_settings_id UUID REFERENCES company_nacha_settings(id) ON DELETE SET NULL,
    fund_id UUID REFERENCES funds(id) ON DELETE SET NULL,
    batch_number VARCHAR(255) NOT NULL,
    batch_date DATE DEFAULT CURRENT_DATE,
    description TEXT,
    total_amount DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payment_batches_entity ON payment_batches(entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_batches_status ON payment_batches(status);
COMMENT ON TABLE payment_batches IS 'Batches of payments for processing';

-- =============================================================================
-- NACHA VENDOR PAYMENT TABLES
-- =============================================================================

-- -----------------------------------------------------
-- Table: vendor_bank_accounts
-- Description: Stores vendor banking information for ACH payments
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    routing_number VARCHAR(9) NOT NULL,
    account_number VARCHAR(255) NOT NULL, -- Encrypted in application layer
    account_type VARCHAR(20) NOT NULL, -- checking, savings
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_account_type CHECK (account_type IN ('checking', 'savings')),
    CONSTRAINT chk_routing_number CHECK (LENGTH(routing_number) = 9),
    CONSTRAINT chk_bank_account_status CHECK (status IN ('active', 'inactive', 'suspended'))
);
CREATE INDEX IF NOT EXISTS idx_vendor_bank_vendor ON vendor_bank_accounts(vendor_id);
COMMENT ON TABLE vendor_bank_accounts IS 'Stores vendor banking information for ACH transfers';

-- -----------------------------------------------------
-- Table: payment_items
-- Description: Individual payments within a batch
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    vendor_bank_account_id UUID NOT NULL REFERENCES vendor_bank_accounts(id) ON DELETE RESTRICT,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    amount NUMERIC(19, 4) NOT NULL,
    memo VARCHAR(80), -- NACHA allows 80 chars
    invoice_number VARCHAR(50),
    invoice_date DATE,
    due_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    trace_number VARCHAR(15), -- NACHA trace number
    addenda TEXT, -- Additional payment information
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_payment_item_status CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'canceled', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_payment_item_batch ON payment_items(payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_vendor ON payment_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_journal ON payment_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_status ON payment_items(status);
COMMENT ON TABLE payment_items IS 'Individual payments within a batch';

-- -----------------------------------------------------
-- Table: nacha_files
-- Description: Tracks generated NACHA files
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS nacha_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255),
    file_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount NUMERIC(19, 4) NOT NULL,
    total_items INTEGER NOT NULL,
    file_control_total VARCHAR(10), -- NACHA file control hash
    status VARCHAR(20) NOT NULL DEFAULT 'generated',
    transmitted_at TIMESTAMPTZ,
    transmitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_nacha_file_status CHECK (status IN ('generated', 'transmitted', 'confirmed', 'rejected', 'error'))
);
CREATE INDEX IF NOT EXISTS idx_nacha_file_batch ON nacha_files(payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_nacha_file_date ON nacha_files(file_date);
CREATE INDEX IF NOT EXISTS idx_nacha_file_status ON nacha_files(status);
COMMENT ON TABLE nacha_files IS 'Tracks generated NACHA files';

-- -----------------------------------------------------------------------------
-- BANK RECONCILIATION MODULE TABLES
-- -----------------------------------------------------------------------------

-- Bank Statements table
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    statement_date DATE NOT NULL,
    beginning_balance DECIMAL(15,2) NOT NULL,
    ending_balance DECIMAL(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending',
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_statement_status CHECK (status IN ('Pending', 'In Progress', 'Reconciled', 'Finalized'))
);
CREATE INDEX IF NOT EXISTS idx_bank_statements_account ON bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_statements_date ON bank_statements(statement_date);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(status);
COMMENT ON TABLE bank_statements IS 'Bank statements for reconciliation';

-- Bank Statement Transactions table
CREATE TABLE IF NOT EXISTS bank_statement_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    description TEXT,
    reference_number VARCHAR(100),
    amount DECIMAL(15,2) NOT NULL,
    transaction_type VARCHAR(50) NOT NULL,
    is_credit BOOLEAN NOT NULL,
    status VARCHAR(50) DEFAULT 'Unmatched',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_transaction_status CHECK (status IN ('Unmatched', 'Matched', 'Reconciled', 'Adjustment'))
);
CREATE INDEX IF NOT EXISTS idx_bank_statement_transactions_statement ON bank_statement_transactions(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_statement_transactions_date ON bank_statement_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_statement_transactions_status ON bank_statement_transactions(status);
COMMENT ON TABLE bank_statement_transactions IS 'Transactions from bank statements';

-- Bank Reconciliations table
CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    reconciliation_date DATE NOT NULL,
    beginning_balance DECIMAL(15,2) NOT NULL,
    ending_balance DECIMAL(15,2) NOT NULL,
    cleared_deposits DECIMAL(15,2) DEFAULT 0.00,
    cleared_payments DECIMAL(15,2) DEFAULT 0.00,
    adjustments_amount DECIMAL(15,2) DEFAULT 0.00,
    is_balanced BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'In Progress',
    notes TEXT,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_reconciliation_status CHECK (status IN ('In Progress', 'Completed', 'Approved', 'Reopened'))
);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_account ON bank_reconciliations(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_statement ON bank_reconciliations(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_date ON bank_reconciliations(reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliations_status ON bank_reconciliations(status);
COMMENT ON TABLE bank_reconciliations IS 'Bank account reconciliations';

-- Bank Reconciliation Items table
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    statement_transaction_id UUID REFERENCES bank_statement_transactions(id) ON DELETE SET NULL,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    transaction_date DATE NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    is_cleared BOOLEAN DEFAULT FALSE,
    match_type VARCHAR(50) DEFAULT 'Manual',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_match_type CHECK (match_type IN ('Manual', 'Auto', 'Suggested', 'Forced'))
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_reconciliation ON bank_reconciliation_items(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_statement_transaction ON bank_reconciliation_items(statement_transaction_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_journal_entry ON bank_reconciliation_items(journal_entry_id);
COMMENT ON TABLE bank_reconciliation_items IS 'Items matched during bank reconciliation';

-- Bank Reconciliation Adjustments table
CREATE TABLE IF NOT EXISTS bank_reconciliation_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    adjustment_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    adjustment_type VARCHAR(50) NOT NULL,
    reason TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_adjustment_type CHECK (adjustment_type IN ('Bank Error', 'Book Error', 'Timing Difference', 'Unknown', 'Other'))
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_adjustments_reconciliation ON bank_reconciliation_adjustments(reconciliation_id);
COMMENT ON TABLE bank_reconciliation_adjustments IS 'Adjustments made during bank reconciliation';

-- -----------------------------------------------------------------------------
-- BANK DEPOSITS MODULE TABLES
-- -----------------------------------------------------------------------------

-- Bank Deposits table
CREATE TABLE IF NOT EXISTS bank_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    deposit_date DATE NOT NULL,
    deposit_number VARCHAR(50),
    description TEXT,
    total_amount DECIMAL(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Draft',
    deposit_method VARCHAR(50) DEFAULT 'Check',
    reference_number VARCHAR(100),
    is_reconciled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_deposit_status CHECK (status IN ('Draft', 'Submitted', 'Cleared', 'Voided')),
    CONSTRAINT chk_deposit_method CHECK (deposit_method IN ('Check', 'Cash', 'ACH', 'Wire', 'Other'))
);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_account ON bank_deposits(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_date ON bank_deposits(deposit_date);
CREATE INDEX IF NOT EXISTS idx_bank_deposits_status ON bank_deposits(status);
COMMENT ON TABLE bank_deposits IS 'Bank deposits for tracking deposits to bank accounts';

-- Bank Deposit Items table
CREATE TABLE IF NOT EXISTS bank_deposit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deposit_id UUID NOT NULL REFERENCES bank_deposits(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    item_date DATE NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'Check',
    reference_number VARCHAR(100),
    payer_name VARCHAR(255),
    fund_id UUID REFERENCES funds(id) ON DELETE SET NULL,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_deposit_item_method CHECK (payment_method IN ('Check', 'Cash', 'ACH', 'Wire', 'Credit Card', 'Other'))
);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_deposit ON bank_deposit_items(deposit_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_journal_entry ON bank_deposit_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_fund ON bank_deposit_items(fund_id);
CREATE INDEX IF NOT EXISTS idx_bank_deposit_items_account ON bank_deposit_items(account_id);
COMMENT ON TABLE bank_deposit_items IS 'Individual items within a bank deposit';

-- -----------------------------------------------------------------------------
-- CHECK PRINTING MODULE TABLES
-- -----------------------------------------------------------------------------

-- Check Formats table
CREATE TABLE IF NOT EXISTS check_formats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    paper_size VARCHAR(50) DEFAULT 'Letter',
    orientation VARCHAR(20) DEFAULT 'Portrait',
    check_position VARCHAR(20) DEFAULT 'Top',
    date_x DECIMAL(8,2) NOT NULL,
    date_y DECIMAL(8,2) NOT NULL,
    payee_x DECIMAL(8,2) NOT NULL,
    payee_y DECIMAL(8,2) NOT NULL,
    amount_numeric_x DECIMAL(8,2) NOT NULL,
    amount_numeric_y DECIMAL(8,2) NOT NULL,
    amount_text_x DECIMAL(8,2) NOT NULL,
    amount_text_y DECIMAL(8,2) NOT NULL,
    memo_x DECIMAL(8,2) NOT NULL,
    memo_y DECIMAL(8,2) NOT NULL,
    signature_x DECIMAL(8,2) NOT NULL,
    signature_y DECIMAL(8,2) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_check_formats_default ON check_formats(is_default);
COMMENT ON TABLE check_formats IS 'Check formats for printing checks';

-- Printed Checks table
CREATE TABLE IF NOT EXISTS printed_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL,
    vendor_id UUID REFERENCES vendors(id) ON DELETE SET NULL,
    check_number VARCHAR(50),
    check_date DATE NOT NULL,
    payee_name VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    memo TEXT,
    status VARCHAR(50) DEFAULT 'Draft',
    format_id UUID REFERENCES check_formats(id) ON DELETE SET NULL,
    print_count INTEGER DEFAULT 0,
    last_printed_at TIMESTAMPTZ,
    void_reason TEXT,
    void_date DATE,
    is_reconciled BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_check_status CHECK (status IN ('Draft', 'Printed', 'Cleared', 'Voided', 'Spoiled'))
);
CREATE INDEX IF NOT EXISTS idx_printed_checks_account ON printed_checks(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_printed_checks_journal_entry ON printed_checks(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_printed_checks_vendor ON printed_checks(vendor_id);
CREATE INDEX IF NOT EXISTS idx_printed_checks_number ON printed_checks(check_number);
CREATE INDEX IF NOT EXISTS idx_printed_checks_date ON printed_checks(check_date);
CREATE INDEX IF NOT EXISTS idx_printed_checks_status ON printed_checks(status);
COMMENT ON TABLE printed_checks IS 'Printed checks for tracking check payments';

-- -----------------------------------------------------------------------------
-- SAMPLE DATA INSERTION
-- -----------------------------------------------------------------------------

-- Insert default users (admin/user with bcrypt hashed passwords)
INSERT INTO users (username, email, first_name, last_name, password_hash, role, status)
VALUES 
    ('admin', 'admin@example.com', 'System', 'Administrator', 
     '$2b$10$3euPcmQFCiblsZeEu5s7p.9MUZWg8PUdxufyQoj5Z2aQBYfETV1yO', 'admin', 'active'),  -- password: admin123
    ('user', 'user@example.com', 'Regular', 'User', 
     '$2b$10$vAQXQDJfe3ZECXrJuQzEi.crqQoAQNFMk8J5DKzRXZY1.Eo1S4Idi', 'user', 'active')    -- password: user123
ON CONFLICT (username) DO NOTHING;

-- Insert root entity
INSERT INTO entities (code, name, description, is_consolidated, status)
VALUES ('TPF_PARENT', 'The Principle Foundation', 'Parent organization for all entities', TRUE, 'active')
ON CONFLICT (code) DO NOTHING;

-- Get the root entity ID
DO $$
DECLARE
    root_entity_id UUID;
BEGIN
    SELECT id INTO root_entity_id FROM entities WHERE code = 'TPF_PARENT';
    
    -- Insert child entities
    INSERT INTO entities (parent_entity_id, code, name, description, status)
    VALUES 
        (root_entity_id, 'TPF_MAIN', 'TPF Main Operations', 'Main operational entity', 'active'),
        (root_entity_id, 'TPF_WEST', 'TPF Western Region', 'Western regional operations', 'active'),
        (root_entity_id, 'TPF_EAST', 'TPF Eastern Region', 'Eastern regional operations', 'active')
    ON CONFLICT (code) DO NOTHING;
    
    -- Get the main entity ID
    DECLARE
        main_entity_id UUID;
    BEGIN
        SELECT id INTO main_entity_id FROM entities WHERE code = 'TPF_MAIN';
        
        -- Insert funds for main entity
        INSERT INTO funds (entity_id, code, name, type, description, balance, status)
        VALUES 
            (main_entity_id, 'GEN_OP', 'General Operations', 'Unrestricted', 'General operating fund', 250000.00, 'active'),
            (main_entity_id, 'ENDOW', 'Endowment', 'Permanently Restricted', 'Permanent endowment fund', 1000000.00, 'active'),
            (main_entity_id, 'SCHOL', 'Scholarship Fund', 'Temporarily Restricted', 'Scholarship assistance program', 75000.00, 'active')
        ON CONFLICT (code, entity_id) DO NOTHING;
    END;
END $$;

-- Insert default chart of accounts
INSERT INTO accounts (code, name, type, description, balance, status)
VALUES 
    ('1000', 'Cash - Operating', 'Asset', 'Primary operating cash account', 325000.00, 'active'),
    ('1100', 'Cash - Savings', 'Asset', 'Savings account', 750000.00, 'active'),
    ('1200', 'Accounts Receivable', 'Asset', 'Amounts owed to the organization', 15000.00, 'active'),
    ('1500', 'Fixed Assets', 'Asset', 'Property and equipment', 500000.00, 'active'),
    ('2000', 'Accounts Payable', 'Liability', 'Amounts owed by the organization', 12500.00, 'active'),
    ('2100', 'Accrued Expenses', 'Liability', 'Expenses incurred but not yet paid', 7500.00, 'active'),
    ('3000', 'Unrestricted Net Assets', 'Equity', 'Unrestricted fund balance', 500000.00, 'active'),
    ('3100', 'Temporarily Restricted Net Assets', 'Equity', 'Temporarily restricted fund balance', 75000.00, 'active'),
    ('3200', 'Permanently Restricted Net Assets', 'Equity', 'Permanently restricted fund balance', 1000000.00, 'active'),
    ('4000', 'Contribution Revenue', 'Revenue', 'Donations and contributions', 0.00, 'active'),
    ('4100', 'Grant Revenue', 'Revenue', 'Foundation and government grants', 0.00, 'active'),
    ('4200', 'Program Service Revenue', 'Revenue', 'Fees for services', 0.00, 'active'),
    ('5000', 'Salaries Expense', 'Expense', 'Staff salaries', 0.00, 'active'),
    ('5100', 'Benefits Expense', 'Expense', 'Employee benefits', 0.00, 'active'),
    ('5200', 'Rent Expense', 'Expense', 'Office rent', 0.00, 'active'),
    ('5300', 'Utilities Expense', 'Expense', 'Utilities for facilities', 0.00, 'active'),
    ('5400', 'Program Expense', 'Expense', 'Direct program expenses', 0.00, 'active')
ON CONFLICT (code) DO NOTHING;

-- Insert default bank account
DO $$
DECLARE
    main_entity_id UUID;
BEGIN
    SELECT id INTO main_entity_id FROM entities WHERE code = 'TPF_MAIN';
    
    INSERT INTO bank_accounts (entity_id, bank_name, account_name, account_number, routing_number, type, balance, status)
    VALUES 
        (main_entity_id, 'First National Bank', 'Operating Account', '123456789', '987654321', 'Checking', 325000.00, 'Active'),
        (main_entity_id, 'First National Bank', 'Savings Account', '987654321', '987654321', 'Savings', 750000.00, 'Active')
    ON CONFLICT DO NOTHING;
END $$;

-- Insert sample vendors
DO $$
DECLARE
    main_entity_id UUID;
BEGIN
    SELECT id INTO main_entity_id FROM entities WHERE code = 'TPF_MAIN';
    
    INSERT INTO vendors (entity_id, vendor_code, name, tax_id, contact_name, email, phone, address_line1, city, state, postal_code, country, status)
    VALUES 
        (main_entity_id, 'UTIL001', 'City Utilities', '45-1234567', 'Billing Department', 'billing@cityutilities.com', '555-123-4567', '123 Main St', 'Metropolis', 'NY', '10001', 'USA', 'active'),
        (main_entity_id, 'RENT001', 'ABC Properties', '45-7654321', 'Property Manager', 'manager@abcproperties.com', '555-987-6543', '456 Oak Ave', 'Metropolis', 'NY', '10001', 'USA', 'active'),
        (main_entity_id, 'SUPP001', 'Office Supplies Plus', '47-1122334', 'Sales Department', 'sales@officesuppliesplus.com', '555-456-7890', '789 Pine St', 'Metropolis', 'NY', '10001', 'USA', 'active')
    ON CONFLICT (vendor_code) DO NOTHING;
END $$;

-- Insert default check formats
INSERT INTO check_formats (name, description, paper_size, orientation, check_position, 
                          date_x, date_y, payee_x, payee_y, 
                          amount_numeric_x, amount_numeric_y, amount_text_x, amount_text_y,
                          memo_x, memo_y, signature_x, signature_y, is_default)
VALUES 
    ('Standard Business Check', 'Standard 3-per-page business check format', 'Letter', 'Portrait', 'Top',
     6.5, 0.75, 1.5, 1.25, 6.5, 1.25, 1.5, 1.75, 1.5, 2.25, 6.0, 2.25, TRUE),
    
    ('QuickBooks Compatible', 'Format compatible with QuickBooks check stock', 'Letter', 'Portrait', 'Top',
     6.75, 0.85, 1.75, 1.35, 6.75, 1.35, 1.75, 1.85, 1.75, 2.35, 6.25, 2.35, FALSE),
    
    ('Voucher Check', 'Check with detachable voucher', 'Letter', 'Portrait', 'Top',
     6.5, 0.75, 1.5, 1.25, 6.5, 1.25, 1.5, 1.75, 1.5, 2.25, 6.0, 2.25, FALSE),
    
    ('Wallet Size Personal Check', 'Small personal check format', 'Letter', 'Portrait', 'Middle',
     5.0, 2.5, 1.0, 3.0, 5.0, 3.0, 1.0, 3.5, 1.0, 4.0, 4.5, 4.0, FALSE)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Sample data for NACHA / PAYMENT PROCESSING MODULE
-- ---------------------------------------------------------------------------

/* Insert bank accounts for vendors (ACH) */
DO $$
DECLARE
    v_city_utils UUID;
    v_abc_props  UUID;
    v_supplies   UUID;
BEGIN
    SELECT id INTO v_city_utils FROM vendors WHERE vendor_code = 'UTIL001';
    SELECT id INTO v_abc_props  FROM vendors WHERE vendor_code = 'RENT001';
    SELECT id INTO v_supplies   FROM vendors WHERE vendor_code = 'SUPP001';

    INSERT INTO vendor_bank_accounts
        (vendor_id, account_name, routing_number, account_number, account_type, is_primary, status)
    VALUES
        (v_city_utils, 'City Utilities Operating', '021000021', '111122223333', 'checking', TRUE,  'active'),
        (v_abc_props,  'ABC Prop Main',            '026009593', '444455556666', 'checking', TRUE,  'active'),
        (v_supplies,   'Office Supplies Plus',     '031100209', '777788889999', 'checking', TRUE,  'active')
    ON CONFLICT ON CONSTRAINT idx_vendor_bank_vendor DO NOTHING;
END $$;

/* Insert organisation-wide NACHA company settings (one default) */
DO $$
DECLARE
    ent_main UUID;
BEGIN
    SELECT id INTO ent_main FROM entities WHERE code = 'TPF_MAIN';

    INSERT INTO company_nacha_settings
           (entity_id, company_name, company_id, immediate_destination,
            immediate_origin, destination_name, origin_name, reference_code,
            service_class_code, company_entry_description, is_default)
    VALUES (ent_main, 'The Principle Foundation', '1234567890',
            '021000021', '123456789', 'JPMORGAN CHASE', 'TPF MAIN OPS',
            'REF001', '220', 'VENDOR PAY', TRUE)
    ON CONFLICT (entity_id, company_id) DO NOTHING;
END $$;

/* -------------------------------------------------------------------------
   Insert a small payment cycle:
      • 1 batch “approved”
      • 1 batch “draft”
      • corresponding items & generated nacha file
---------------------------------------------------------------------------*/
DO $$
DECLARE
    ent_main   UUID;
    fund_gen   UUID;
    default_ns UUID;
    vb_city    UUID;
    vb_abc     UUID;
    vb_sup     UUID;
    batch1     UUID;
    batch2     UUID;
BEGIN
    SELECT id      INTO ent_main   FROM entities              WHERE code = 'TPF_MAIN';
    SELECT id      INTO fund_gen   FROM funds                 WHERE code = 'GEN_OP';
    SELECT id      INTO default_ns FROM company_nacha_settings WHERE entity_id = ent_main AND is_default;
    SELECT id      INTO vb_city    FROM vendor_bank_accounts  WHERE account_name ILIKE '%City Utilities%';
    SELECT id      INTO vb_abc     FROM vendor_bank_accounts  WHERE account_name ILIKE '%ABC Prop%';
    SELECT id      INTO vb_sup     FROM vendor_bank_accounts  WHERE account_name ILIKE '%Supplies%';

    /* Two payment batches */
    INSERT INTO payment_batches
        (entity_id, fund_id, nacha_settings_id, batch_number, batch_date,
         description, total_amount, status)
    VALUES
        (ent_main, fund_gen, default_ns, 'BATCH-001', CURRENT_DATE - 7,
         'Monthly utilities / rent', 4100.00, 'Approved'),
        (ent_main, fund_gen, default_ns, 'BATCH-002', CURRENT_DATE,
         'Office supplies & misc.',   850.00,  'Draft')
    RETURNING id, batch_number INTO batch1, batch2;

    /* Items for first batch */
    INSERT INTO payment_items
        (payment_batch_id, vendor_id, vendor_bank_account_id,
         amount, memo, invoice_number, invoice_date, due_date, status)
    SELECT batch1, v.id, vb_city, 2100.00, 'Electric + Water', 'INV-EU-2305', CURRENT_DATE-30, CURRENT_DATE-5, 'approved'
      FROM vendors v WHERE v.vendor_code = 'UTIL001'
    UNION ALL
    SELECT batch1, v.id, vb_abc, 2000.00, 'Office rent', 'INV-RENT-0523', CURRENT_DATE-28, CURRENT_DATE-3, 'approved'
      FROM vendors v WHERE v.vendor_code = 'RENT001';

    /* Items for second (draft) batch */
    INSERT INTO payment_items
        (payment_batch_id, vendor_id, vendor_bank_account_id,
         amount, memo, invoice_number, invoice_date, due_date, status)
    SELECT batch2, v.id, vb_sup, 850.00, 'Printer toner & paper',
           'INV-SUP-789', CURRENT_DATE-2, CURRENT_DATE+28, 'pending'
      FROM vendors v WHERE v.vendor_code = 'SUPP001';

    /* Generate sample nacha file record for first batch */
    INSERT INTO nacha_files
        (payment_batch_id, file_name, file_path, file_date,
         total_amount, total_items, file_control_total, status)
    VALUES
        (batch1, 'TPF_2025-05-ACH.ach', '/nacha/TPF_2025-05-ACH.ach',
         CURRENT_TIMESTAMP - INTERVAL '6 days', 4100.00, 2, '00004100', 'generated')
    ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Sample data for JOURNAL ENTRIES (simple revenue & expense)
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    ent_main UUID;
    fund_gen UUID;
    acc_cash UUID;
    acc_rev  UUID;
    acc_exp  UUID;
    je1      UUID;
BEGIN
    SELECT id INTO ent_main FROM entities WHERE code = 'TPF_MAIN';
    SELECT id INTO fund_gen FROM funds WHERE code  = 'GEN_OP';
    SELECT id INTO acc_cash FROM accounts WHERE code = '1000';   -- Cash
    SELECT id INTO acc_rev  FROM accounts WHERE code = '4000';   -- Contribution Revenue
    SELECT id INTO acc_exp  FROM accounts WHERE code = '5000';   -- Salaries Expense

    /* Contribution revenue entry */
    INSERT INTO journal_entries
        (entity_id, entry_date, reference_number, description, status, total_amount)
    VALUES (ent_main, CURRENT_DATE - 15, 'JE-0001', 'Cash donation received', 'Posted', 5000.00)
    RETURNING id INTO je1;

    INSERT INTO journal_entry_lines
        (journal_entry_id, account_id, fund_id, description, debit_amount, credit_amount)
    VALUES
        (je1, acc_cash, fund_gen, 'Cash in', 5000.00, 0.00),
        (je1, acc_rev, fund_gen, 'Donation revenue', 0.00, 5000.00);

    /* Salary expense entry */
    INSERT INTO journal_entries
        (entity_id, entry_date, reference_number, description, status, total_amount)
    VALUES (ent_main, CURRENT_DATE - 10, 'JE-0002', 'Bi-weekly payroll', 'Posted', -3200.00)
    RETURNING id INTO je1;

    INSERT INTO journal_entry_lines
        (journal_entry_id, account_id, fund_id, description, debit_amount, credit_amount)
    VALUES
        (je1, acc_exp,  fund_gen, 'Gross payroll', 3200.00, 0.00),
        (je1, acc_cash, fund_gen, 'Cash out',      0.00, 3200.00);
END $$;

-- ---------------------------------------------------------------------------
-- Sample data for BANK STATEMENTS / RECONCILIATION MODULE
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    op_acct      UUID;   -- Operating checking account
    user_admin   UUID;
    stmt1        UUID;
    stmt2        UUID;
    recon1       UUID;
    recon_item   UUID;
BEGIN
    SELECT id INTO op_acct    FROM bank_accounts WHERE account_name = 'Operating Account';
    SELECT id INTO user_admin FROM users WHERE username = 'admin';

    /* Two monthly statements */
    INSERT INTO bank_statements
        (bank_account_id, statement_date, beginning_balance, ending_balance,
         status, created_by)
    VALUES
        (op_acct, date_trunc('month', CURRENT_DATE) - INTERVAL '1 month',
         300000.00, 310300.00, 'Reconciled', user_admin),
        (op_acct, date_trunc('month', CURRENT_DATE),
         310300.00, 312000.00, 'In Progress', user_admin)
    RETURNING id INTO stmt1, stmt2;

    /* Statement transactions for first statement (6 items) */
    INSERT INTO bank_statement_transactions
        (bank_statement_id, transaction_date, description, reference_number,
         amount, transaction_type, is_credit, status)
    VALUES
        (stmt1, stmt1::date + 2, 'Utility Payment',  'ACH123', -2100.00,'ACH',FALSE,'Matched'),
        (stmt1, stmt1::date + 5, 'Office Rent',      'ACH124', -2000.00,'ACH',FALSE,'Matched'),
        (stmt1, stmt1::date + 7, 'Contribution',     'DEP555',  5000.00,'Deposit',TRUE,'Matched'),
        (stmt1, stmt1::date + 9, 'Deposit-Checks',   'DEP556',  1400.00,'Deposit',TRUE,'Matched'),
        (stmt1, stmt1::date +12, 'Bank Fee',         'FEE12',    -25.00,'Fee',FALSE,'Unmatched'),
        (stmt1, stmt1::date +15, 'Interest Earned',  'INT1',      50.00,'Interest',TRUE,'Unmatched');

    /* Reconciliation record for first statement */
    INSERT INTO bank_reconciliations
        (bank_account_id, bank_statement_id, reconciliation_date,
         beginning_balance, ending_balance, cleared_deposits,
         cleared_payments, adjustments_amount, is_balanced,
         status, completed_by, completed_at, created_by)
    VALUES
        (op_acct, stmt1, stmt1::date + 25,
         300000.00, 310300.00, 6400.00, 4100.00, -25.00,
         TRUE, 'Completed', user_admin, NOW(), user_admin)
    RETURNING id INTO recon1;

    /* Link matched items */
    INSERT INTO bank_reconciliation_items
        (reconciliation_id, transaction_date, description, amount,
         is_cleared, match_type, notes)
    SELECT recon1, transaction_date, description, amount,
           TRUE, 'Manual', 'Initial import'
    FROM bank_statement_transactions
    WHERE bank_statement_id = stmt1
      AND status = 'Matched';

    /* Adjustment for bank fee */
    INSERT INTO bank_reconciliation_adjustments
        (reconciliation_id, adjustment_date, description,
         amount, adjustment_type, created_by)
    VALUES
        (recon1, stmt1::date + 12, 'Bank Service Fee', -25.00,
         'Bank Error', user_admin)
    ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Sample data for BANK DEPOSITS MODULE
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    op_acct UUID;
    fund_gen UUID;
    ent_main UUID;
    dep1 UUID;
BEGIN
    SELECT id INTO op_acct FROM bank_accounts WHERE account_name = 'Operating Account';
    SELECT id INTO fund_gen FROM funds WHERE code = 'GEN_OP';
    SELECT id INTO ent_main FROM entities WHERE code = 'TPF_MAIN';

    /* Three deposits */
    INSERT INTO bank_deposits
        (bank_account_id, deposit_date, deposit_number, description,
         total_amount, status, deposit_method, created_by)
    VALUES
        (op_acct, CURRENT_DATE - 8, 'DEP-001', 'Weekly checks batch', 1400.00, 'Cleared','Check', ent_main),
        (op_acct, CURRENT_DATE - 3, 'DEP-002', 'Cash fundraiser',     600.00,  'Submitted','Cash', ent_main),
        (op_acct, CURRENT_DATE - 1, 'DEP-003', 'ACH contribution',    750.00,  'Draft','ACH', ent_main)
    RETURNING id INTO dep1;

    /* Items for first deposit */
    INSERT INTO bank_deposit_items
        (deposit_id, item_date, description, amount, payment_method,
         payer_name, fund_id)
    VALUES
        (dep1, CURRENT_DATE - 9, 'Check #1001 – Donation',  800.00,'Check',
         'Jane Donor', fund_gen),
        (dep1, CURRENT_DATE - 9, 'Check #1002 – Donation',  600.00,'Check',
         'John Donor', fund_gen)
    ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Sample data for CHECK PRINTING MODULE
-- ---------------------------------------------------------------------------

DO $$
DECLARE
    op_acct UUID;
    vend_util UUID;
    vend_rent UUID;
    fmt_default UUID;
BEGIN
    SELECT id INTO op_acct   FROM bank_accounts WHERE account_name = 'Operating Account';
    SELECT id INTO vend_util FROM vendors WHERE vendor_code = 'UTIL001';
    SELECT id INTO vend_rent FROM vendors WHERE vendor_code = 'RENT001';
    SELECT id INTO fmt_default FROM check_formats WHERE is_default = TRUE;

    INSERT INTO printed_checks
        (bank_account_id, vendor_id, check_number, check_date,
         payee_name, amount, memo, status, format_id, print_count,
         last_printed_at)
    VALUES
        (op_acct, vend_util, '50001', CURRENT_DATE - 20,
         'City Utilities', 2100.00, 'Electric & Water', 'Cleared',
         fmt_default, 1, CURRENT_TIMESTAMP - INTERVAL '20 days'),
        (op_acct, vend_rent, '50002', CURRENT_DATE - 18,
         'ABC Properties', 2000.00, 'Office Rent', 'Printed',
         fmt_default, 1, CURRENT_TIMESTAMP - INTERVAL '18 days'),
        (op_acct, vend_util, '50003', CURRENT_DATE - 2,
         'City Utilities',  50.00,  'Gas Top-Up', 'Draft',
         fmt_default, 0, NULL)
    ON CONFLICT DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- Sample data for CUSTOM REPORT DEFINITIONS
-- ---------------------------------------------------------------------------

INSERT INTO custom_report_definitions
    (name, description, definition_json, created_by)
VALUES
    ('Monthly Statement of Activities',
     'Shows income & expenses for the current month',
     '{"type":"income_statement","period":"month_to_date"}',
     'System'),
    ('Fund Balance Summary',
     'Lists ending balances for each fund',
     '{"type":"fund_balance","as_of":"today"}',
     'System')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- PERMISSIONS SETUP
-- -----------------------------------------------------------------------------

-- Grant necessary permissions to the application user
-- Note: Replace 'app_user' with your actual application database user
-- DO $$
-- BEGIN
--     EXECUTE 'GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user';
--     EXECUTE 'GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user';
-- END
-- $$;
