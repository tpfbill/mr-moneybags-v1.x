// src/database/connection.js
const { Pool } = require('pg');
// Go up to project root then into src/db for DB configuration
const { getDbConfig } = require('../db/db-config');

// Initialize database connection pool
const pool = new Pool(getDbConfig());

// Function to initialize database schema if needed
const initializeDatabase = async () => {
    const client = await pool.connect();
    try {
        // Check for users table and create if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                role VARCHAR(50) DEFAULT 'User',
                status VARCHAR(20) DEFAULT 'Active',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Table "users" is present or created.');

        // Add import_id to journal_entries for rollback capability
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                               WHERE table_name='journal_entries' AND column_name='import_id') THEN
                    ALTER TABLE journal_entries ADD COLUMN import_id UUID;
                    CREATE INDEX IF NOT EXISTS idx_journal_entries_import_id ON journal_entries(import_id);
                    RAISE NOTICE 'Column "import_id" added to "journal_entries".';
                END IF;
            END $$;
        `);
        console.log('Column "import_id" on "journal_entries" is present or created.');
        
        // Check for custom_report_definitions table
        await client.query(`
            CREATE TABLE IF NOT EXISTS custom_report_definitions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) NOT NULL,
                description TEXT,
                definition_json JSONB NOT NULL,
                created_by VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Table "custom_report_definitions" is present or created.');

        // Check for bank_accounts table
        await client.query(`
            CREATE TABLE IF NOT EXISTS bank_accounts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                bank_name        VARCHAR(255) NOT NULL,
                account_name     VARCHAR(255) NOT NULL,
                account_number   VARCHAR(100),
                routing_number   VARCHAR(20),
                type             VARCHAR(50)  DEFAULT 'Checking',
                status           VARCHAR(20)  DEFAULT 'Active',
                balance          DECIMAL(15,2) DEFAULT 0.00,
                connection_method VARCHAR(50) DEFAULT 'Manual',
                description      TEXT,
                last_sync        TIMESTAMPTZ,
                created_at       TIMESTAMPTZ DEFAULT NOW(),
                updated_at       TIMESTAMPTZ DEFAULT NOW()
            );
        `);
        console.log('Table "bank_accounts" is present or created.');

        // Check for payment_batches table
        await client.query(`
            CREATE TABLE IF NOT EXISTS payment_batches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
                nacha_settings_id UUID REFERENCES company_nacha_settings(id) ON DELETE SET NULL,
                fund_id UUID REFERENCES funds(id) ON DELETE SET NULL,
                batch_number VARCHAR(255) NOT NULL,
                batch_date   DATE DEFAULT CURRENT_DATE,
                description  TEXT,
                total_amount DECIMAL(15,2) DEFAULT 0.00,
                status       VARCHAR(50)  DEFAULT 'Draft',
                created_at   TIMESTAMPTZ  DEFAULT NOW(),
                updated_at   TIMESTAMPTZ  DEFAULT NOW()
            );
        `);
        console.log('Table "payment_batches" is present or created.');

        // Vendors table (required for /api/vendors endpoints & UI lists)
        await client.query(`
            CREATE TABLE IF NOT EXISTS vendors (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_id     UUID REFERENCES entities(id) ON DELETE SET NULL,
                vendor_code   VARCHAR(50) UNIQUE NOT NULL,
                name          VARCHAR(255) NOT NULL,
                tax_id        VARCHAR(20),
                contact_name  VARCHAR(100),
                email         VARCHAR(255),
                phone         VARCHAR(20),
                address_line1 VARCHAR(255),
                address_line2 VARCHAR(255),
                city          VARCHAR(100),
                state         VARCHAR(50),
                postal_code   VARCHAR(20),
                country       VARCHAR(100) DEFAULT 'USA',
                vendor_type   VARCHAR(50),
                status        VARCHAR(20) DEFAULT 'active',
                notes         TEXT,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT chk_vendor_status CHECK (status IN ('active', 'inactive', 'suspended'))
            );
            
            CREATE INDEX IF NOT EXISTS idx_vendor_code ON vendors(vendor_code);
            CREATE INDEX IF NOT EXISTS idx_vendor_name ON vendors(name);
            CREATE INDEX IF NOT EXISTS idx_vendor_entity ON vendors(entity_id);
        `);
        console.log('Table "vendors" is present or created.');

    } catch (err) {
        console.error('Error during database initialization:', err);
    } finally {
        client.release();
    }
};

// Test the connection
const testConnection = async () => {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Database connected successfully at:', res.rows[0].now);
        // Initialize database after successful connection
        await initializeDatabase();
        return true;
    } catch (err) {
        console.error('Database connection error:', err.message);
        return false;
    }
};

module.exports = {
    pool,
    initializeDatabase,
    testConnection
};
