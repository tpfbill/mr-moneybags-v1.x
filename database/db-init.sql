-- Comprehensive database initialization script for Nonprofit Fund Accounting System v8.8
-- This script creates all necessary tables with proper relationships

-- First, create the pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================
-- USERS TABLE
-- Stores user authentication and profile data
-- =============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- =============================================
-- ENTITIES TABLE
-- Stores organizational entities/departments
-- =============================================
CREATE TABLE IF NOT EXISTS entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- =============================================
-- FUNDS TABLE
-- Stores fund definitions for fund accounting
-- =============================================
CREATE TABLE IF NOT EXISTS funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    balance DECIMAL(15,4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Active',
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, code)
);

-- =============================================
-- ACCOUNTS TABLE
-- Stores chart of accounts
-- =============================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    balance DECIMAL(15,4) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Active',
    description TEXT,
    parent_account_id UUID REFERENCES accounts(id),
    fund_id UUID REFERENCES funds(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_id, code)
);

-- =============================================
-- JOURNAL ENTRIES TABLE
-- Stores journal entry headers
-- =============================================
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    entry_no VARCHAR(20),
    date DATE NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'Posted',
    posted_by UUID REFERENCES users(id),
    posted_date TIMESTAMP,
    created_by UUID REFERENCES users(id),
    import_id VARCHAR(100),
    -- Additional fields required by test-data loaders and application logic
    entry_date DATE DEFAULT CURRENT_DATE,
    reference_number VARCHAR(50),
    total_amount DECIMAL(15,2) DEFAULT 0.00,
    is_inter_entity BOOLEAN DEFAULT FALSE,
    target_entity_id UUID,
    matching_transaction_id UUID,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- JOURNAL ENTRY ITEMS TABLE
-- Stores journal entry line items
-- =============================================
CREATE TABLE IF NOT EXISTS journal_entry_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id),
    account_id UUID NOT NULL REFERENCES accounts(id),
    fund_id UUID REFERENCES funds(id),
    description TEXT,
    debit DECIMAL(15,4) DEFAULT 0,
    credit DECIMAL(15,4) DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- CUSTOM REPORT DEFINITIONS TABLE
-- Stores user-defined report configurations
-- =============================================
CREATE TABLE IF NOT EXISTS custom_report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL,
    created_by UUID REFERENCES users(id),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- BANK ACCOUNTS TABLE
-- Stores bank account information
-- =============================================
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL,
    account_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50),
    routing_number VARCHAR(50),
    type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    balance DECIMAL(15,4) DEFAULT 0,
    connection_method VARCHAR(50) DEFAULT 'Manual',
    description TEXT,
    last_sync TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- Add import_id column to journal_entries if not exists
-- =============================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'journal_entries' AND column_name = 'import_id'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN import_id VARCHAR(100);
    END IF;
END $$;

-- =============================================
-- Grant appropriate permissions
-- =============================================
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO npfadmin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO npfadmin;

-- End of initialization script
