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
UPDATE entities SET parent_entity_id = 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22' 
WHERE code IN ('TPF-ES', 'TPF-IF') AND parent_entity_id IS NULL;

-- Sample Accounts
INSERT INTO accounts (id, entity_id, code, name, type, balance, status)
VALUES
    ('a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '1000', 'Cash - Operating', 'Asset', 100000.00, 'Active'),
    ('b2c3d4e5-f6a7-5b6c-9d0e-2f3a4b5c6d7e', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '1200', 'Accounts Receivable', 'Asset', 25000.00, 'Active'),
    ('c3d4e5f6-a7b8-6c7d-0e1f-3a4b5c6d7e8f', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '2000', 'Accounts Payable', 'Liability', 15000.00, 'Active'),
    ('d4e5f6a7-b8c9-7d8e-1f2a-4b5c6d7e8f9a', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '3000', 'Fund Balance', 'Equity', 110000.00, 'Active'),
    ('e5f6a7b8-c9d0-8e9f-2a3b-5c6d7e8f9a0b', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '4000', 'Contribution Revenue', 'Revenue', 0.00, 'Active'),
    ('f6a7b8c9-d0e1-9f0a-3b4c-6d7e8f9a0b1c', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '5000', 'Program Expenses', 'Expense', 0.00, 'Active'),
    ('a7b8c9d0-e1f2-0a1b-4c5d-7e8f9a0b1c2d', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '1900', 'Due From TPF-ES', 'Asset', 5000.00, 'Active'),
    ('b8c9d0e1-f2a3-1b2c-5d6e-8f9a0b1c2d3e', 'd8b3a2e1-5f4c-4e5b-8d7f-3c9a8b7e6d5c', '2900', 'Due To TPF Parent', 'Liability', 5000.00, 'Active')
ON CONFLICT (entity_id, code) DO NOTHING;

-- Sample Funds
INSERT INTO funds (id, entity_id, code, name, type, restriction_type, balance, status)
VALUES
    ('f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'GEN-FND', 'General Fund', 'Operating', 'unrestricted', 75000.00, 'Active'),
    ('f2e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'EDU-FND', 'Education Fund', 'Program', 'temporarily_restricted', 25000.00, 'Active'),
    ('f3e4d5c6-b7a8-6c7d-0e1f-3a4b5c6d7e8f', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'END-FND', 'Endowment Fund', 'Endowment', 'permanently_restricted', 10000.00, 'Active'),
    ('f4e5d6c7-b8a9-7d8e-1f2a-4b5c6d7e8f9a', 'd8b3a2e1-5f4c-4e5b-8d7f-3c9a8b7e6d5c', 'ES-GEN', 'ES General Fund', 'Operating', 'unrestricted', 15000.00, 'Active')
ON CONFLICT (entity_id, code) DO NOTHING;

-- Sample Journal Entries
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status)
VALUES
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '2025-07-15', 'JE-2025-001', 'Donation from Smith Foundation', 10000.00, 'Posted'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', '2025-07-16', 'JE-2025-002', 'Payment for educational materials', 2500.00, 'Posted')
ON CONFLICT (id) DO NOTHING;

-- Sample Journal Entry Items with updated column names (debit/credit)
INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
VALUES
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', 'f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 10000.00, 0.00, 'Cash received'),
    ('61e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'e5f6a7b8-c9d0-8e9f-2a3b-5c6d7e8f9a0b', 'f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 0.00, 10000.00, 'Donation revenue'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'f6a7b8c9-d0e1-9f0a-3b4c-6d7e8f9a0b1c', 'f2e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 2500.00, 0.00, 'Educational materials expense'),
    ('62e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', 'f2e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 0.00, 2500.00, 'Cash payment')
ON CONFLICT DO NOTHING;

-- Sample Vendors
INSERT INTO vendors (id, entity_id, vendor_code, name, tax_id, contact_name, email, status)
VALUES
    ('71e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'EDUSUP-001', 'Educational Supplies Inc', '12-3456789', 'John Smith', 'john@edusupplies.com', 'Active'),
    ('72e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'OFFSUPP-002', 'Office Supplies Co', '98-7654321', 'Jane Doe', 'jane@officesupplies.com', 'Active')
ON CONFLICT (entity_id, vendor_code) DO NOTHING;

-- Sample Vendor Bank Accounts
INSERT INTO vendor_bank_accounts (vendor_id, account_name, account_number, routing_number, account_type, is_primary)
VALUES
    ('71e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'Operating Account', '123456789', '021000021', 'Checking', TRUE),
    ('72e3d4c5-b6a7-5b6c-9d0e-2f3a4b5c6d7e', 'Main Account', '987654321', '021000021', 'Checking', TRUE)
ON CONFLICT DO NOTHING;

-- Sample Bank Accounts
INSERT INTO bank_accounts (entity_id, gl_account_id, bank_name, account_name, account_number, routing_number, type, balance, status)
VALUES
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'a1b2c3d4-e5f6-4a5b-8c9d-1e2f3a4b5c6d', 'First National Bank', 'Operating Account', '1234567890', '021000021', 'Checking', 100000.00, 'Active'),
    ('d8b3a2e1-5f4c-4e5b-8d7f-3c9a8b7e6d5c', NULL, 'Second National Bank', 'ES Operating Account', '0987654321', '021000021', 'Checking', 15000.00, 'Active')
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
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'The Principle Foundation', '1234567890', '02100002', FALSE)
ON CONFLICT DO NOTHING;

-- Sample Budget
INSERT INTO budgets (entity_id, fund_id, account_id, fiscal_year, period, amount)
VALUES
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'e5f6a7b8-c9d0-8e9f-2a3b-5c6d7e8f9a0b', '2025', 'Q1', 25000.00),
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'f1e2d3c4-b5a6-4a5b-8c9d-1e2f3a4b5c6d', 'f6a7b8c9-d0e1-9f0a-3b4c-6d7e8f9a0b1c', '2025', 'Q1', 20000.00)
ON CONFLICT DO NOTHING;

-- Sample Custom Report Definition
INSERT INTO custom_report_definitions (entity_id, name, description, definition_json, created_by)
VALUES
    ('c37c2e7c-9b69-4e5a-a899-a3c0f9668e22', 'Quarterly Fund Balance', 'Shows fund balances by quarter', 
    '{"dataSource": "funds", "fields": ["name", "code", "balance"], "filters": [{"field": "status", "operator": "=", "value": "Active"}]}', 'admin')
ON CONFLICT DO NOTHING;

COMMIT;
