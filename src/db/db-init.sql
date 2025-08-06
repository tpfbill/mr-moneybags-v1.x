-- db-init.sql
-- Initialization script for the Non-Profit Fund Accounting System PostgreSQL database.

-- Enable UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables in reverse order of dependency if they exist, for a clean slate
DROP TABLE IF EXISTS journal_entry_lines CASCADE;
DROP TABLE IF EXISTS custom_report_definitions CASCADE;
DROP TABLE IF EXISTS budgets CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS funds CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS entities CASCADE;

--------------------------------------------------------------------------------
-- Entities Table
-- Stores information about each distinct legal or operational entity.
--------------------------------------------------------------------------------
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL, -- Short code for the entity
    parent_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL, -- For hierarchical structures
    is_consolidated BOOLEAN DEFAULT FALSE, -- True if this entity represents a consolidation of children
    fiscal_year_start VARCHAR(5) DEFAULT '01-01', -- MM-DD format, e.g., '07-01' for July 1st
    base_currency VARCHAR(3) DEFAULT 'USD' NOT NULL, -- ISO 4217 currency code
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    metadata JSONB, -- For any other custom entity-specific information
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE entities IS 'Stores information about each distinct legal or operational entity within the organization.';
COMMENT ON COLUMN entities.code IS 'A short, unique code for identifying the entity.';
COMMENT ON COLUMN entities.parent_entity_id IS 'References the parent entity in a hierarchy, if applicable.';
COMMENT ON COLUMN entities.is_consolidated IS 'Indicates if this entity is a consolidation point for child entities.';
COMMENT ON COLUMN entities.fiscal_year_start IS 'The start of the fiscal year for this entity (MM-DD format).';
COMMENT ON COLUMN entities.base_currency IS 'The primary operational currency for this entity.';

--------------------------------------------------------------------------------
-- Accounts Table (Chart of Accounts)
-- Stores the chart of accounts for each entity.
--------------------------------------------------------------------------------
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL, -- Account number/code
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Asset', 'Liability', 'Equity', 'Net Assets', 'Revenue', 'Expense')),
    balance DECIMAL(19, 4) DEFAULT 0.00 NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, code) -- Account code must be unique within an entity
);

COMMENT ON TABLE accounts IS 'Stores the chart of accounts. Each account is specific to an entity.';
COMMENT ON COLUMN accounts.code IS 'The unique code or number for the account within its entity.';
COMMENT ON COLUMN accounts.type IS 'The financial category of the account (e.g., Asset, Liability).';

--------------------------------------------------------------------------------
-- Funds Table
-- Stores information about different funds managed by entities.
--------------------------------------------------------------------------------
CREATE TABLE funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL, -- Fund code
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('Unrestricted', 'Temporarily Restricted', 'Permanently Restricted')),
    balance DECIMAL(19, 4) DEFAULT 0.00 NOT NULL,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, code) -- Fund code must be unique within an entity
);

COMMENT ON TABLE funds IS 'Stores information about different funds, specific to an entity.';
COMMENT ON COLUMN funds.type IS 'The restriction type of the fund.';

--------------------------------------------------------------------------------
-- Journal Entries Table
-- Stores header information for journal entries.
--------------------------------------------------------------------------------
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    reference_number VARCHAR(100), -- Should be unique per entity in practice, or globally. Global for simplicity here.
    description TEXT,
    total_amount DECIMAL(19, 4) NOT NULL, -- Sum of debits (or credits) for quick reference
    status VARCHAR(20) NOT NULL CHECK (status IN ('Draft', 'Posted', 'Void')),
    created_by VARCHAR(255), -- User ID or name
    is_inter_entity BOOLEAN DEFAULT FALSE,
    target_entity_id UUID REFERENCES entities(id) ON DELETE SET NULL, -- For inter-entity transfers, the other entity involved
    matching_transaction_id UUID, -- To link inter-entity JE pairs (not an FK, just a shared ID)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(reference_number) -- Making reference_number globally unique for this schema
);

COMMENT ON TABLE journal_entries IS 'Stores header information for journal entries.';
COMMENT ON COLUMN journal_entries.reference_number IS 'A user-defined or system-generated reference for the journal entry.';
COMMENT ON COLUMN journal_entries.is_inter_entity IS 'Flag indicating if this is part of an inter-entity transaction.';
COMMENT ON COLUMN journal_entries.target_entity_id IS 'If inter-entity, this points to the corresponding entity.';
COMMENT ON COLUMN journal_entries.matching_transaction_id IS 'A shared UUID to link two sides of an inter-entity transaction.';


--------------------------------------------------------------------------------
-- Journal Entry Lines Table
-- Stores individual debit/credit lines for each journal entry.
--------------------------------------------------------------------------------
CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT, -- Prevent deleting account if used in JE
    fund_id UUID REFERENCES funds(id) ON DELETE RESTRICT, -- Optional, prevent deleting fund if used
    debit_amount DECIMAL(19, 4) DEFAULT 0.00,
    credit_amount DECIMAL(19, 4) DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_debit_credit_not_both_zero CHECK (debit_amount <> 0 OR credit_amount <> 0),
    CONSTRAINT chk_debit_or_credit_only CHECK ( (debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0) OR (debit_amount = 0 AND credit_amount = 0) )
);
COMMENT ON TABLE journal_entry_lines IS 'Stores the detailed debit and credit lines for each journal entry.';

--------------------------------------------------------------------------------
-- Budgets Table
-- Stores budget information for accounts/funds for specific periods.
--------------------------------------------------------------------------------
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    fiscal_year INTEGER NOT NULL, -- e.g., 2024
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    fund_id UUID REFERENCES funds(id) ON DELETE CASCADE, -- Optional, for fund-specific budgeting
    period INTEGER NOT NULL, -- e.g., 1 for January, 2 for February, or 1-4 for quarters
    period_type VARCHAR(20) DEFAULT 'Month' CHECK (period_type IN ('Month', 'Quarter', 'Year')),
    budgeted_amount DECIMAL(19, 4) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, fiscal_year, account_id, fund_id, period, period_type)
);
COMMENT ON TABLE budgets IS 'Stores budget allocations for accounts and funds over fiscal periods.';

--------------------------------------------------------------------------------
-- Custom Report Definitions Table
-- Stores user-created custom report definitions.
--------------------------------------------------------------------------------
CREATE TABLE custom_report_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL, -- e.g., 'transaction_list', 'summary_report'
    entity_id UUID REFERENCES entities(id) ON DELETE CASCADE, -- Optional: if report is specific to an entity
    definition_json JSONB NOT NULL, -- Stores columns, filters, sorting, grouping
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE custom_report_definitions IS 'Stores definitions for user-created custom reports.';
COMMENT ON COLUMN custom_report_definitions.definition_json IS 'JSONB object containing the report structure: selected fields, filters, sorting, grouping criteria.';


--------------------------------------------------------------------------------
-- Indexes for Performance
--------------------------------------------------------------------------------
-- Entities
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_parent_id ON entities(parent_entity_id);

-- Accounts
CREATE INDEX idx_accounts_entity_id ON accounts(entity_id);
CREATE INDEX idx_accounts_name ON accounts(name);
CREATE INDEX idx_accounts_type ON accounts(type);

-- Funds
CREATE INDEX idx_funds_entity_id ON funds(entity_id);
CREATE INDEX idx_funds_name ON funds(name);
CREATE INDEX idx_funds_type ON funds(type);

-- Journal Entries
CREATE INDEX idx_journal_entries_entity_id ON journal_entries(entity_id);
CREATE INDEX idx_journal_entries_entry_date ON journal_entries(entry_date);
CREATE INDEX idx_journal_entries_status ON journal_entries(status);
CREATE INDEX idx_journal_entries_matching_transaction_id ON journal_entries(matching_transaction_id);


-- Journal Entry Lines
CREATE INDEX idx_journal_entry_lines_journal_entry_id ON journal_entry_lines(journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account_id ON journal_entry_lines(account_id);
CREATE INDEX idx_journal_entry_lines_fund_id ON journal_entry_lines(fund_id);

-- Budgets
CREATE INDEX idx_budgets_entity_fiscal_year ON budgets(entity_id, fiscal_year);
CREATE INDEX idx_budgets_account_id ON budgets(account_id);
CREATE INDEX idx_budgets_fund_id ON budgets(fund_id);

-- Custom Report Definitions
CREATE INDEX idx_custom_report_definitions_entity_id ON custom_report_definitions(entity_id);
CREATE INDEX idx_custom_report_definitions_type ON custom_report_definitions(type);

--------------------------------------------------------------------------------
-- Sample Data Insertion
--------------------------------------------------------------------------------
-- Sample Entities
INSERT INTO entities (id, name, code, parent_entity_id, fiscal_year_start, base_currency, is_consolidated) VALUES
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', 'Main Organization HQ', 'MAINHQ', NULL, '01-01', 'USD', TRUE),
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', 'Community Outreach Program', 'COP', 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', '01-01', 'USD', FALSE),
('c37c2e7c-7e7c-481e-8972-430c2c2c8194', 'Education Initiative', 'EDU', 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', '07-01', 'CAD', FALSE);

-- Sample Accounts for Main Organization HQ (entity1)
INSERT INTO accounts (entity_id, code, name, type, status, description, balance) VALUES
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '1010', 'Operating Cash - HQ', 'Asset', 'Active', 'Main bank account for HQ operations', 75000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '1200', 'Grants Receivable - HQ', 'Asset', 'Active', 'Expected grant payments', 15000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '2010', 'Accounts Payable - HQ', 'Liability', 'Active', 'Outstanding bills to vendors', 5000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '3000', 'Net Assets - Unrestricted - HQ', 'Net Assets', 'Active', 'Unrestricted net assets for HQ', 85000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '4010', 'Donation Revenue - HQ', 'Revenue', 'Active', 'General donations received by HQ', 120000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '5010', 'Salaries Expense - HQ', 'Expense', 'Active', 'Staff salaries for HQ', 60000.00);

-- Sample Accounts for Community Outreach Program (entity2)
INSERT INTO accounts (entity_id, code, name, type, status, description, balance) VALUES
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', '1010', 'COP Program Cash', 'Asset', 'Active', 'Cash account for COP activities', 10000.00),
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', '4050', 'Program Service Fees - COP', 'Revenue', 'Active', 'Fees collected for COP services', 5000.00),
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', '5100', 'Event Expenses - COP', 'Expense', 'Active', 'Expenses for COP community events', 3000.00);

-- Sample Funds for Main Organization HQ (entity1)
INSERT INTO funds (entity_id, code, name, type, status, description, balance) VALUES
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', 'GEN', 'General Operating Fund - HQ', 'Unrestricted', 'Active', 'Main operational fund for HQ', 85000.00),
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', 'CAP', 'Capital Campaign Fund - HQ', 'Temporarily Restricted', 'Active', 'Funds for new building project', 50000.00);

-- Sample Funds for Community Outreach Program (entity2)
INSERT INTO funds (entity_id, code, name, type, status, description, balance) VALUES
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', 'OUTRCH', 'Outreach Program Fund', 'Temporarily Restricted', 'Active', 'Restricted funds for COP activities', 12000.00);

-- Sample Journal Entries
-- JE1: Donation to HQ General Fund
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status, created_by) VALUES
('d48d3f8d-8f8f-492f-9083-541d3d3d9205', 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', '2024-07-15', 'JE-HQ-001', 'Received annual donation', 5000.00, 'Posted', 'Admin');
INSERT INTO journal_entry_lines (journal_entry_id, account_id, fund_id, debit_amount, credit_amount, description) VALUES
('d48d3f8d-8f8f-492f-9083-541d3d3d9205', (SELECT id from accounts WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = '1010'), (SELECT id from funds WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = 'GEN'), 5000.00, 0.00, 'Cash deposit for donation'),
('d48d3f8d-8f8f-492f-9083-541d3d3d9205', (SELECT id from accounts WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = '4010'), (SELECT id from funds WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = 'GEN'), 0.00, 5000.00, 'Donation revenue recognized');

-- JE2: COP Program Event Expense
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status, created_by) VALUES
('e59e4g9e-9g9g-403g-9194-652e4e4e0316', 'b26b1d6b-6d6b-470d-8861-329b1b1b7083', '2024-07-20', 'JE-COP-001', 'Expenses for Summer Festival', 1500.00, 'Posted', 'UserX');
INSERT INTO journal_entry_lines (journal_entry_id, account_id, fund_id, debit_amount, credit_amount, description) VALUES
('e59e4g9e-9g9g-403g-9194-652e4e4e0316', (SELECT id from accounts WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = '5100'), (SELECT id from funds WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = 'OUTRCH'), 1500.00, 0.00, 'Payment for event supplies'),
('e59e4g9e-9g9g-403g-9194-652e4e4e0316', (SELECT id from accounts WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = '1010'), (SELECT id from funds WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = 'OUTRCH'), 0.00, 1500.00, 'Cash paid for supplies');

-- JE3: Inter-entity transfer from HQ to COP (Conceptual - requires careful account mapping in real app)
-- For simplicity, we'll assume an "Inter-Entity Transfer" account exists in both.
-- This example uses existing cash accounts for simplicity, which isn't best practice.
INSERT INTO accounts (entity_id, code, name, type, status, description, balance) VALUES
('a15a0c5a-5c5a-469c-8750-218a0a0a6972', '1900', 'Due From COP', 'Asset', 'Active', 'Inter-entity receivable from COP', 0.00),
('b26b1d6b-6d6b-470d-8861-329b1b1b7083', '2900', 'Due To HQ', 'Liability', 'Active', 'Inter-entity payable to HQ', 0.00);

-- The actual transfer
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status, created_by, is_inter_entity, target_entity_id, matching_transaction_id) VALUES
('f60f5h0f-0h0h-414h-9205-763f5f5f1427', 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', '2024-07-25', 'IE-HQ-COP-001', 'Transfer to COP for program support', 1000.00, 'Posted', 'Admin', TRUE, 'b26b1d6b-6d6b-470d-8861-329b1b1b7083', '123e4567-e89b-12d3-a456-426614174000');
INSERT INTO journal_entry_lines (journal_entry_id, account_id, fund_id, debit_amount, credit_amount, description) VALUES
('f60f5h0f-0h0h-414h-9205-763f5f5f1427', (SELECT id from accounts WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = '1900'), (SELECT id from funds WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = 'GEN'), 1000.00, 0.00, 'Due from COP for program support'),
('f60f5h0f-0h0h-414h-9205-763f5f5f1427', (SELECT id from accounts WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = '1010'), (SELECT id from funds WHERE entity_id = 'a15a0c5a-5c5a-469c-8750-218a0a0a6972' AND code = 'GEN'), 0.00, 1000.00, 'Cash transferred to COP');

-- Corresponding entry in COP (would be auto-generated or manually matched in a real system)
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, total_amount, status, created_by, is_inter_entity, target_entity_id, matching_transaction_id) VALUES
('g71g6i1g-1i1i-425i-9316-874g6g6g2538', 'b26b1d6b-6d6b-470d-8861-329b1b1b7083', '2024-07-25', 'IE-COP-HQ-001', 'Transfer from HQ for program support', 1000.00, 'Posted', 'System', TRUE, 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', '123e4567-e89b-12d3-a456-426614174000');
INSERT INTO journal_entry_lines (journal_entry_id, account_id, fund_id, debit_amount, credit_amount, description) VALUES
('g71g6i1g-1i1i-425i-9316-874g6g6g2538', (SELECT id from accounts WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = '1010'), (SELECT id from funds WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = 'OUTRCH'), 1000.00, 0.00, 'Cash received from HQ'),
('g71g6i1g-1i1i-425i-9316-874g6g6g2538', (SELECT id from accounts WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = '2900'), (SELECT id from funds WHERE entity_id = 'b26b1d6b-6d6b-470d-8861-329b1b1b7083' AND code = 'OUTRCH'), 0.00, 1000.00, 'Due to HQ for program support');


-- Sample Budgets
INSERT INTO budgets (entity_id, fiscal_year, account_id, fund_id, period, period_type, budgeted_amount, notes) VALUES
((SELECT id from entities WHERE code = 'MAINHQ'), 2024, (SELECT id from accounts WHERE entity_id = (SELECT id from entities WHERE code = 'MAINHQ') AND code = '5010'), (SELECT id from funds WHERE entity_id = (SELECT id from entities WHERE code = 'MAINHQ') AND code = 'GEN'), 7, 'Month', 5000.00, 'July budget for HQ Salaries'),
((SELECT id from entities WHERE code = 'COP'), 2024, (SELECT id from accounts WHERE entity_id = (SELECT id from entities WHERE code = 'COP') AND code = '5100'), (SELECT id from funds WHERE entity_id = (SELECT id from entities WHERE code = 'COP') AND code = 'OUTRCH'), 3, 'Quarter', 2500.00, 'Q3 Budget for COP Event Expenses');

-- Sample Custom Report Definition
INSERT INTO custom_report_definitions (name, description, type, entity_id, definition_json, created_by) VALUES
('HQ Expense Report by Fund', 'Monthly expenses for Main Organization HQ, grouped by fund.', 'summary_report', 'a15a0c5a-5c5a-469c-8750-218a0a0a6972', 
'{
    "selectedFields": ["fund_name", "account_name", "line_debit", "line_credit"],
    "filters": [
        {"fieldId": "account_type", "operator": "equalto", "value": "Expense"},
        {"fieldId": "transaction_date", "operator": "between", "value1": "2024-07-01", "value2": "2024-07-31"}
    ],
    "groupField": "fund_name",
    "sortField": "account_name",
    "sortOrder": "asc"
}', 'Admin');

-- Update sequences if using SERIAL (not needed for UUIDs with gen_random_uuid())
-- SELECT setval('entities_id_seq', (SELECT MAX(id) FROM entities));
-- etc. for other tables if they used SERIAL

-- Update timestamps (simple trigger function example for updated_at)
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables
CREATE TRIGGER set_timestamp_entities
BEFORE UPDATE ON entities
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_accounts
BEFORE UPDATE ON accounts
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_funds
BEFORE UPDATE ON funds
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_journal_entries
BEFORE UPDATE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_budgets
BEFORE UPDATE ON budgets
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_custom_reports
BEFORE UPDATE ON custom_report_definitions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();


SELECT 'Database initialization script completed.' AS status;
