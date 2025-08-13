-- =============================================================================
-- setup-database.sql
--
-- Description:
-- This script sets up the PostgreSQL database for the Nonprofit Fund Accounting system.
-- It creates a standard user (npfadmin), database (fund_accounting_db), and grants
-- all necessary permissions. The script is idempotent and can be run multiple times
-- without causing errors.
--
-- Usage:
--   sudo -u postgres psql -f setup-database.sql
-- =============================================================================

-- Ensure warnings are shown (but skip NOTICE noise)
SET client_min_messages TO WARNING;

-- Set password encryption method (if available)
DO $$
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'npfadmin') THEN
        CREATE ROLE npfadmin LOGIN PASSWORD 'npfa123';
        RAISE NOTICE 'Created role: npfadmin';
    ELSE
        RAISE NOTICE 'Role already exists: npfadmin';
        -- Update password if role exists
        ALTER ROLE npfadmin WITH PASSWORD 'npfa123';
    END IF;
END
$$;

-- Conditionally create database outside of a transaction using psql's \gexec
SELECT 'CREATE DATABASE fund_accounting_db OWNER npfadmin'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'fund_accounting_db');
\gexec

-- Ensure correct owner if DB already existed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'fund_accounting_db') THEN
        EXECUTE 'ALTER DATABASE fund_accounting_db OWNER TO npfadmin';
    END IF;
END
$$;

-- Connect to the database to set permissions
\c fund_accounting_db

-- Grant privileges to npfadmin
DO $$
BEGIN
    RAISE NOTICE 'Granting privileges to npfadmin...';
END
$$;

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO npfadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO npfadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO npfadmin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO npfadmin;

-- Ensure npfadmin can create objects in public schema
ALTER SCHEMA public OWNER TO npfadmin;

-- Verify setup
DO $$
DECLARE
    role_exists BOOLEAN;
    db_exists BOOLEAN;
    correct_owner BOOLEAN;
BEGIN
    -- Check if role exists
    SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'npfadmin') INTO role_exists;
    
    -- Check if database exists
    SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = 'fund_accounting_db') INTO db_exists;
    
    -- Check if database has correct owner
    SELECT EXISTS(
        SELECT 1 FROM pg_database d
        JOIN pg_roles r ON d.datdba = r.oid
        WHERE d.datname = 'fund_accounting_db' AND r.rolname = 'npfadmin'
    ) INTO correct_owner;
    
    -- Output verification results
    RAISE NOTICE '=== Database Setup Verification ===';
    RAISE NOTICE 'Role npfadmin exists: %', role_exists;
    RAISE NOTICE 'Database fund_accounting_db exists: %', db_exists;
    RAISE NOTICE 'Database has correct owner: %', correct_owner;
    
    IF role_exists AND db_exists AND correct_owner THEN
        RAISE NOTICE 'SUCCESS: Database setup complete!';
    ELSE
        RAISE WARNING 'WARNING: Database setup incomplete or incorrect.';
    END IF;
END
$$;

-- (No explicit COMMIT needed; script no longer uses an explicit BEGIN)

-- Instructions for next steps
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Next Steps ===';
    RAISE NOTICE '1. Update .env file with these credentials:';
    RAISE NOTICE '   PGHOST=localhost';
    RAISE NOTICE '   PGPORT=5432';
    RAISE NOTICE '   PGDATABASE=fund_accounting_db';
    RAISE NOTICE '   PGUSER=npfadmin';
    RAISE NOTICE '   PGPASSWORD=npfa123';
    RAISE NOTICE '';
    RAISE NOTICE '2. Initialize database schema:';
    RAISE NOTICE '   psql -U npfadmin -d fund_accounting_db -f db-init.sql';
    RAISE NOTICE '';
END
$$;
