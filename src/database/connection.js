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

        // Add import_id to journal_entries only if the table itself exists
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.tables 
                    WHERE table_schema = 'public' AND table_name = 'journal_entries'
                ) THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns 
                        WHERE table_name = 'journal_entries' AND column_name = 'import_id'
                    ) THEN
                        ALTER TABLE journal_entries ADD COLUMN import_id UUID;
                        CREATE INDEX IF NOT EXISTS idx_journal_entries_import_id ON journal_entries(import_id);
                        RAISE NOTICE 'Column "import_id" added to \"journal_entries\".';
                    END IF;
                END IF;
            END $$;
        `);
        console.log('Checked/created column "import_id" on "journal_entries" if table exists.');
        
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

        /* 
         * Tables that depend on core schema (bank_accounts, payment_batches, vendors)
         * are created by the main SQL schema loaded during installation. We skip
         * them here to avoid foreign-key errors when the core tables are absent.
         */

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
