-- =============================================================================
-- NONPROFIT FUND ACCOUNTING SYSTEM - SCHEMA ONLY
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
-- POSTGRESQL ROLE CREATION
-- -----------------------------------------------------------------------------

-- Create the application database role if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'npfadmin') THEN
        CREATE ROLE npfadmin WITH LOGIN PASSWORD 'npfa123';
        -- Allow the application role to create databases (optional)
        ALTER ROLE npfadmin CREATEDB;
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- DATABASE CREATION AND EXTENSIONS
-- -----------------------------------------------------------------------------

-- Create the application database (must be executed by a PostgreSQL super-user).
-- If the database already exists, PostgreSQL will raise an error; you can ignore
-- the "database already exists" message when re-running this script.
CREATE DATABASE fund_accounting_db;

-- Connect to the database
\c fund_accounting_db

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- SESSION MANAGEMENT TABLES
-- -----------------------------------------------------------------------------

-- Create session table for express-session with connect-pg-simple
CREATE TABLE IF NOT EXISTS user_sessions (
    sid VARCHAR NOT NULL,
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
);

-- Create index on expire column for session cleanup
CREATE INDEX IF NOT EXISTS "IDX_user_session_expire" ON user_sessions ("expire");

-- -----------------------------------------------------------------------------
-- CORE ACCOUNTING TABLES
-- -----------------------------------------------------------------------------

-- Users table for authentication and authorization
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to users table
COMMENT ON TABLE users IS 'System users with authentication and authorization information';

-- Entities table (organizations, departments, programs)
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_entity_id UUID REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_consolidated BOOLEAN DEFAULT FALSE,
    base_currency VARCHAR(3) DEFAULT 'USD',
    fiscal_year_start VARCHAR(5) DEFAULT '01-01',
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_entity_code UNIQUE (code)
);

-- Add comment to entities table
COMMENT ON TABLE entities IS 'Organizations, departments, or programs that maintain separate books';

-- Funds table (restricted, unrestricted, etc.)
CREATE TABLE IF NOT EXISTS funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    description TEXT,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_fund_code_per_entity UNIQUE (entity_id, code)
);

-- Add comment to funds table
COMMENT ON TABLE funds IS 'Funds for tracking restricted and unrestricted money';

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_account_code_per_entity UNIQUE (entity_id, code)
);

-- Add comment to accounts table
COMMENT ON TABLE accounts IS 'Chart of accounts for the accounting system';

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    entry_date DATE NOT NULL,
    reference_number VARCHAR(50),
    description TEXT,
    type VARCHAR(50) DEFAULT 'General',
    status VARCHAR(20) DEFAULT 'Draft',
    total_amount DECIMAL(15, 2) DEFAULT 0.00,
    is_inter_entity BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100),
    import_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to journal_entries table
COMMENT ON TABLE journal_entries IS 'Journal entries for financial transactions';

-- Journal Entry Items (line items)
CREATE TABLE IF NOT EXISTS journal_entry_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    fund_id UUID NOT NULL REFERENCES funds(id),
    description TEXT,
    debit DECIMAL(15, 2) DEFAULT 0.00,
    credit DECIMAL(15, 2) DEFAULT 0.00,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Data-integrity constraints
    CONSTRAINT chk_jei_non_negative CHECK (debit  >= 0 AND credit >= 0),
    CONSTRAINT chk_jei_one_sided   CHECK (
        (debit  > 0 AND credit = 0) OR
        (credit > 0 AND debit  = 0)
    )
);

-- Add comment to journal_entry_items table
COMMENT ON TABLE journal_entry_items IS 'Line items for journal entries';

-- Custom Report Definitions
CREATE TABLE IF NOT EXISTS custom_report_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    report_type VARCHAR(50) NOT NULL,
    configuration JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to custom_report_definitions table
COMMENT ON TABLE custom_report_definitions IS 'Custom report definitions created by users';

-- -----------------------------------------------------------------------------
-- BANKING TABLES
-- -----------------------------------------------------------------------------

-- Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    bank_name VARCHAR(100) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    routing_number VARCHAR(20),
    type VARCHAR(50) NOT NULL,
    balance DECIMAL(15, 2) DEFAULT 0.00,
    last_reconciliation_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_accounts table
COMMENT ON TABLE bank_accounts IS 'Bank accounts for the organization';

-- -----------------------------------------------------------------------------
-- BANK RECONCILIATION MODULE
-- -----------------------------------------------------------------------------

-- Bank Statements
CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    statement_date DATE NOT NULL,
    beginning_balance DECIMAL(15, 2) NOT NULL,
    ending_balance DECIMAL(15, 2) NOT NULL,
    filename VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_statements table
COMMENT ON TABLE bank_statements IS 'Bank statements for reconciliation';

-- Bank Statement Transactions
CREATE TABLE IF NOT EXISTS bank_statement_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
    transaction_date DATE NOT NULL,
    description TEXT,
    reference_number VARCHAR(50),
    amount DECIMAL(15, 2) NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    is_reconciled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_statement_transactions table
COMMENT ON TABLE bank_statement_transactions IS 'Transactions from bank statements';

-- Bank Reconciliations
CREATE TABLE IF NOT EXISTS bank_reconciliations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    bank_statement_id UUID NOT NULL REFERENCES bank_statements(id),
    reconciliation_date DATE NOT NULL,
    beginning_balance DECIMAL(15, 2) NOT NULL,
    ending_balance DECIMAL(15, 2) NOT NULL,
    cleared_balance DECIMAL(15, 2) NOT NULL,
    difference DECIMAL(15, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'in_progress',
    completed_by UUID REFERENCES users(id),
    completed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_reconciliations table
COMMENT ON TABLE bank_reconciliations IS 'Bank reconciliation records';

-- Bank Reconciliation Items
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    statement_transaction_id UUID REFERENCES bank_statement_transactions(id),
    amount DECIMAL(15, 2) NOT NULL,
    is_cleared BOOLEAN DEFAULT FALSE,
    match_type VARCHAR(20) DEFAULT 'manual',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_reconciliation_items table
COMMENT ON TABLE bank_reconciliation_items IS 'Items matched during bank reconciliation';

-- Bank Reconciliation Adjustments
CREATE TABLE IF NOT EXISTS bank_reconciliation_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reconciliation_id UUID NOT NULL REFERENCES bank_reconciliations(id) ON DELETE CASCADE,
    journal_entry_id UUID REFERENCES journal_entries(id),
    description TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    adjustment_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_reconciliation_adjustments table
COMMENT ON TABLE bank_reconciliation_adjustments IS 'Adjustments made during bank reconciliation';

-- -----------------------------------------------------------------------------
-- BANK DEPOSITS MODULE
-- -----------------------------------------------------------------------------

-- Bank Deposits
CREATE TABLE IF NOT EXISTS bank_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    deposit_date DATE NOT NULL,
    deposit_number VARCHAR(50),
    description TEXT,
    total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'pending',
    journal_entry_id UUID REFERENCES journal_entries(id),
    created_by UUID REFERENCES users(id),
    cleared_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to bank_deposits table
COMMENT ON TABLE bank_deposits IS 'Bank deposits record';

-- Bank Deposit Items
CREATE TABLE IF NOT EXISTS bank_deposit_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    deposit_id UUID NOT NULL REFERENCES bank_deposits(id) ON DELETE CASCADE,
    item_type VARCHAR(50) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    reference_number VARCHAR(50),
    payer_name VARCHAR(100),
    description TEXT,
    fund_id UUID REFERENCES funds(id),
    account_id UUID REFERENCES accounts(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Deposit item amounts must be strictly positive
    CONSTRAINT chk_bdi_amount_positive CHECK (amount > 0)
);

-- Add comment to bank_deposit_items table
COMMENT ON TABLE bank_deposit_items IS 'Items included in a bank deposit';

-- -----------------------------------------------------------------------------
-- CHECK PRINTING MODULE
-- -----------------------------------------------------------------------------

-- Check Formats
CREATE TABLE IF NOT EXISTS check_formats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    paper_size VARCHAR(20) DEFAULT 'letter',
    orientation VARCHAR(20) DEFAULT 'portrait',
    check_position VARCHAR(20) DEFAULT 'top',
    top_margin DECIMAL(8, 2) DEFAULT 0.00,
    left_margin DECIMAL(8, 2) DEFAULT 0.00,
    payee_left DECIMAL(8, 2) DEFAULT 1.00,
    payee_top DECIMAL(8, 2) DEFAULT 1.75,
    date_left DECIMAL(8, 2) DEFAULT 6.50,
    date_top DECIMAL(8, 2) DEFAULT 1.75,
    amount_left DECIMAL(8, 2) DEFAULT 6.50,
    amount_top DECIMAL(8, 2) DEFAULT 2.00,
    amount_words_left DECIMAL(8, 2) DEFAULT 1.00,
    amount_words_top DECIMAL(8, 2) DEFAULT 2.25,
    memo_left DECIMAL(8, 2) DEFAULT 1.00,
    memo_top DECIMAL(8, 2) DEFAULT 3.50,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to check_formats table
COMMENT ON TABLE check_formats IS 'Check printing format templates';

-- Printed Checks
CREATE TABLE IF NOT EXISTS printed_checks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    check_number VARCHAR(20) NOT NULL,
    payee_name VARCHAR(100) NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    check_date DATE NOT NULL,
    memo TEXT,
    status VARCHAR(20) DEFAULT 'printed',
    journal_entry_id UUID REFERENCES journal_entries(id),
    format_id UUID REFERENCES check_formats(id),
    printed_by UUID REFERENCES users(id),
    voided_by UUID REFERENCES users(id),
    voided_at TIMESTAMP,
    void_reason TEXT,
    cleared_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_check_number_per_account UNIQUE (bank_account_id, check_number)
);

-- Add comment to printed_checks table
COMMENT ON TABLE printed_checks IS 'Printed checks for tracking check payments';

-- -----------------------------------------------------------------------------
-- VENDOR MANAGEMENT AND PAYMENT PROCESSING
-- -----------------------------------------------------------------------------

-- Vendors
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    vendor_code VARCHAR(20) NOT NULL,
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
    payment_terms VARCHAR(50),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_vendor_code_per_entity UNIQUE (entity_id, vendor_code)
);

-- Add comment to vendors table
COMMENT ON TABLE vendors IS 'Vendors for accounts payable';

-- Vendor Bank Accounts (for ACH/NACHA payments)
CREATE TABLE IF NOT EXISTS vendor_bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    routing_number VARCHAR(20) NOT NULL,
    account_type VARCHAR(20) NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to vendor_bank_accounts table
COMMENT ON TABLE vendor_bank_accounts IS 'Vendor bank accounts for ACH/NACHA payments';

-- Payment Batches
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    batch_number VARCHAR(50) NOT NULL,
    batch_date DATE NOT NULL,
    description TEXT,
    total_amount DECIMAL(15, 2) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'draft',
    payment_method VARCHAR(20) NOT NULL,
    bank_account_id UUID REFERENCES bank_accounts(id),
    created_by UUID REFERENCES users(id),
    submitted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_batch_number_per_entity UNIQUE (entity_id, batch_number)
);

-- Add comment to payment_batches table
COMMENT ON TABLE payment_batches IS 'Batches of vendor payments';

-- Payment Items
CREATE TABLE IF NOT EXISTS payment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    vendor_bank_account_id UUID REFERENCES vendor_bank_accounts(id),
    amount DECIMAL(15, 2) NOT NULL,
    description TEXT,
    reference_number VARCHAR(50),
    journal_entry_id UUID REFERENCES journal_entries(id),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to payment_items table
COMMENT ON TABLE payment_items IS 'Individual payments within a payment batch';

-- NACHA Files
CREATE TABLE IF NOT EXISTS nacha_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID NOT NULL REFERENCES payment_batches(id),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255),
    file_content TEXT,
    total_amount DECIMAL(15, 2) NOT NULL,
    entry_count INTEGER NOT NULL,
    effective_date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'generated',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add comment to nacha_files table
COMMENT ON TABLE nacha_files IS 'NACHA ACH payment files';
