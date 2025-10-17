-- =============================================================================
-- NACHA Vendor Payments Schema Extension
-- For Nonprofit Fund Accounting System v8.8
--
-- This schema extends the existing database to support NACHA vendor payments
-- including vendor management, payment batches, and NACHA file generation.
-- =============================================================================

-- NOTE ------------------------------------------------------------------------
-- This script relies on the pgcrypto extension created in db-init.sql:
--     CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- which provides the gen_random_uuid() function used below.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------
-- Table: vendors
-- Description: Stores vendor/payee information
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    vendor_code VARCHAR(50) NOT NULL UNIQUE,
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
    vendor_type VARCHAR(50), -- supplier, contractor, employee, etc.
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vendor_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_entity ON vendors(entity_id);
CREATE INDEX IF NOT EXISTS idx_vendor_code ON vendors(vendor_code);
CREATE INDEX IF NOT EXISTS idx_vendor_name ON vendors(name);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_account_type CHECK (account_type IN ('checking', 'savings')),
    CONSTRAINT chk_routing_number CHECK (LENGTH(routing_number) = 9),
    CONSTRAINT chk_bank_account_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

CREATE INDEX IF NOT EXISTS idx_vendor_bank_vendor ON vendor_bank_accounts(vendor_id);

-- -----------------------------------------------------
-- Table: company_nacha_settings
-- Description: Organization's NACHA file generation settings
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS company_nacha_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    company_name VARCHAR(16) NOT NULL, -- NACHA requires max 16 chars
    company_id VARCHAR(10) NOT NULL, -- Tax ID or NACHA assigned ID
    originating_dfi_id VARCHAR(8) NOT NULL, -- Bank routing number first 8 digits
    company_entry_description VARCHAR(10) NOT NULL, -- e.g., 'PAYROLL', 'VENDOR'
    company_descriptive_date VARCHAR(6), -- YYMMDD format
    effective_entry_date VARCHAR(6), -- YYMMDD format
    settlement_account_id UUID REFERENCES bank_accounts(id) ON DELETE SET NULL,
    is_production BOOLEAN DEFAULT FALSE, -- Production or test
    batch_number_counter INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------
-- Table: payment_batches
-- Description: Groups payments for NACHA file generation
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_number VARCHAR(50) NOT NULL UNIQUE,
    entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
    fund_id UUID REFERENCES funds(id) ON DELETE SET NULL,
    nacha_settings_id UUID REFERENCES company_nacha_settings(id) ON DELETE RESTRICT,
    batch_date DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_date DATE NOT NULL,
    description VARCHAR(255) NOT NULL,
    total_amount NUMERIC(19, 4) NOT NULL DEFAULT 0,
    total_items INTEGER NOT NULL DEFAULT 0,
    bank_name VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_batch_status CHECK (status IN ('draft', 'pending_approval', 'approved', 'processed', 'canceled', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_payment_batch_entity ON payment_batches(entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_batch_fund ON payment_batches(fund_id);
CREATE INDEX IF NOT EXISTS idx_payment_batch_date ON payment_batches(batch_date);
CREATE INDEX IF NOT EXISTS idx_payment_batch_status ON payment_batches(status);

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_item_status CHECK (status IN ('pending', 'approved', 'processed', 'rejected', 'canceled', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_payment_item_batch ON payment_items(payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_vendor ON payment_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_journal ON payment_items(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_payment_item_status ON payment_items(status);

-- -----------------------------------------------------
-- Table: nacha_files
-- Description: Tracks generated NACHA files
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS nacha_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_batch_id UUID NOT NULL REFERENCES payment_batches(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255),
    file_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount NUMERIC(19, 4) NOT NULL,
    total_items INTEGER NOT NULL,
    file_control_total VARCHAR(10), -- NACHA file control hash
    status VARCHAR(20) NOT NULL DEFAULT 'generated',
    transmitted_at TIMESTAMP,
    transmitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_nacha_file_status CHECK (status IN ('generated', 'transmitted', 'confirmed', 'rejected', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_nacha_file_batch ON nacha_files(payment_batch_id);
CREATE INDEX IF NOT EXISTS idx_nacha_file_date ON nacha_files(file_date);
CREATE INDEX IF NOT EXISTS idx_nacha_file_status ON nacha_files(status);

-- Comments for documentation
COMMENT ON TABLE vendors IS 'Stores vendor/payee information for NACHA payments';
COMMENT ON TABLE vendor_bank_accounts IS 'Stores vendor banking information for ACH transfers';
COMMENT ON TABLE company_nacha_settings IS 'Organization settings for NACHA file generation';
COMMENT ON TABLE payment_batches IS 'Groups payments for NACHA file generation';
COMMENT ON TABLE payment_items IS 'Individual payments within a batch';
COMMENT ON TABLE nacha_files IS 'Tracks generated NACHA files';
