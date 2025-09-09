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

        /* ------------------------------------------------------------------
         * Ensure GL Codes master table exists (idempotent)
         * ----------------------------------------------------------------*/
        await client.query(`
            DO $$
            BEGIN
                ----------------------------------------------------------------
                -- 1) Create table if missing
                ----------------------------------------------------------------
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_schema = 'public' AND table_name = 'gl_codes'
                ) THEN
                    CREATE TABLE gl_codes (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        code           VARCHAR(50) NOT NULL,
                        description    TEXT,
                        classification TEXT,
                        line_type      VARCHAR(50) NOT NULL,
                        status         VARCHAR(20) NOT NULL DEFAULT 'Active',
                        budget         VARCHAR(10),
                        balance_sheet  VARCHAR(10),
                        created_at     TIMESTAMPTZ DEFAULT NOW(),
                        updated_at     TIMESTAMPTZ DEFAULT NOW()
                    );
                END IF;

                ----------------------------------------------------------------
                -- 2) Unique index on LOWER(code) for case-insensitive global key
                ----------------------------------------------------------------
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'uidx_gl_codes_code_lower'
                      AND n.nspname = 'public'
                ) THEN
                    CREATE UNIQUE INDEX uidx_gl_codes_code_lower
                        ON gl_codes (LOWER(code));
                END IF;

                ----------------------------------------------------------------
                -- 3) Check constraint on line_type enum
                ----------------------------------------------------------------
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_gl_codes_line_type'
                ) THEN
                    ALTER TABLE gl_codes
                        ADD CONSTRAINT chk_gl_codes_line_type
                        CHECK (line_type IN (
                            'Asset','Credit Card','Liability',
                            'Equity','Revenue','Expense'
                        ));
                END IF;

                ----------------------------------------------------------------
                -- 4) Check constraint on status enum
                ----------------------------------------------------------------
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conname = 'chk_gl_codes_status'
                ) THEN
                    ALTER TABLE gl_codes
                        ADD CONSTRAINT chk_gl_codes_status
                        CHECK (status IN ('Active','Inactive'));
                END IF;

                ----------------------------------------------------------------
                -- 5) Optional filter indexes
                ----------------------------------------------------------------
                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'idx_gl_codes_status'
                      AND n.nspname = 'public'
                ) THEN
                    CREATE INDEX idx_gl_codes_status ON gl_codes(status);
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = 'idx_gl_codes_line_type'
                      AND n.nspname = 'public'
                ) THEN
                    CREATE INDEX idx_gl_codes_line_type ON gl_codes(line_type);
                END IF;
            END $$;
        `);
        console.log('GL Codes table & indexes verified/created.');

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
        return true;
    } catch (err) {
        console.error('Database connection error:', err.message);
        return false;
    }
};

// ---------------------------------------------------------------------------
// Schema Version Check
// ---------------------------------------------------------------------------
const checkSchemaVersion = async () => {
    const REQUIRED = process.env.REQUIRED_SCHEMA_VERSION;

    if (!REQUIRED) {
        console.warn('[SchemaVersion] REQUIRED_SCHEMA_VERSION not set – skipping version check.');
        return;
    }

    const { rows } = await pool.query(
        `SELECT version
           FROM schema_meta
          ORDER BY applied_at DESC NULLS LAST, version DESC
          LIMIT 1`
    );

    if (rows.length === 0) {
        throw new Error(
            'schema_meta table is empty – database not seeded. ' +
            'Run `npm run db:seed` before starting the application.'
        );
    }

    const current = rows[0].version;

    if (current !== REQUIRED) {
        throw new Error(
            `Database schema version mismatch. Expected ${REQUIRED} but found ${current}. ` +
            'Run `npm run db:seed` or apply migrations to update the schema.'
        );
    }

    console.log(`[SchemaVersion] OK (version ${current})`);
};

module.exports = {
    pool,
    initializeDatabase,
    testConnection,
    checkSchemaVersion
};
