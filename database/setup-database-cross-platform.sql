-- =============================================================================
-- setup-database.sql
-- Cross-platform database setup for Nonprofit Fund Accounting v8.8
-- (Updated)  This script now works hand-in-hand with:
--   • db-init.sql                     – creates the full schema expected by the
--                                       application & data-loaders
--   • load-principle-foundation-data.js – single consolidated sample-data loader
--
-- Legacy loaders such as add-tpf-hierarchy.js, add-consolidated-test-data.js
-- and test-data.sql are now deprecated and will be removed in a future version.
-- =============================================================================

-- For Mac/Windows: Create npfadmin user and database
-- For Ubuntu: Can use either postgres or npfadmin user

\echo 'Setting up database for Nonprofit Fund Accounting v8.8...'

-- Create npfadmin role if it doesn't exist (safe for all platforms)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'npfadmin') THEN
        CREATE ROLE npfadmin LOGIN PASSWORD 'npfa123';
        RAISE NOTICE 'Created role: npfadmin';
    ELSE
        RAISE NOTICE 'Role already exists: npfadmin';
        ALTER ROLE npfadmin WITH PASSWORD 'npfa123';
    END IF;
END
$$;

-- Create database if it doesn't exist (safe for all platforms)
SELECT 'CREATE DATABASE fund_accounting_db OWNER npfadmin'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fund_accounting_db')\gexec

-- Grant privileges
GRANT ALL ON DATABASE fund_accounting_db TO npfadmin;

\echo 'Database setup complete!'
\echo 'Use these credentials in your .env file:'
\echo 'PGUSER=npfadmin'
\echo 'PGPASSWORD=npfa123'
\echo 'PGDATABASE=fund_accounting_db'

\echo ''
\echo 'Next Steps --------------------------------------------------------------'
\echo '1. Initialize the database schema:'
\echo '     psql -U npfadmin -d fund_accounting_db -f db-init.sql'
\echo ''
\echo '2. (Optional) Load The Principle Foundation sample data:'
\echo '     node load-principle-foundation-data.js'
\echo ''
\echo '   The consolidated loader replaces add-tpf-hierarchy.js,'
\echo '   add-consolidated-test-data.js and test-data.sql.'
\echo '-------------------------------------------------------------------------'
