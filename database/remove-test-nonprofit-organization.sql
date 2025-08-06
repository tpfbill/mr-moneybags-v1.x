-- =================================================================
-- CLEANUP SCRIPT: Remove Test Nonprofit Organization
-- =================================================================
-- This script removes the "Test Nonprofit Organization" entity and 
-- its associated "Test General Fund" from the database.
-- 
-- Created: July 21, 2025
-- Version: 9.0
-- =================================================================

-- NOTE -----------------------------------------------------------------
-- 2025-07-21  ►  One-time cleanup **COMPLETED**
-- •  The “Test Nonprofit Organization” entity (code TNO) and its
--    associated Test General Fund were removed from all environments.
-- •  The logic below is retained for historical reference / auditing
--    but should no longer find any matching rows.
-- ----------------------------------------------------------------------

-- Start transaction for atomicity
BEGIN;

-- =================================================================
-- VERIFICATION: Show counts and details before removal
-- =================================================================
\echo '--- BEFORE REMOVAL: Entity Count ---'
SELECT COUNT(*) as total_entities FROM entities;

\echo '--- BEFORE REMOVAL: Test Nonprofit Organization Details ---'
SELECT id, name, code, is_consolidated, status 
FROM entities 
WHERE name = 'Test Nonprofit Organization';

\echo '--- BEFORE REMOVAL: Associated Fund Details ---'
SELECT id, code, name, type, balance, status
FROM funds
WHERE entity_id = (SELECT id FROM entities WHERE name = 'Test Nonprofit Organization');

-- =================================================================
-- SAFETY CHECKS: Ensure we're removing the correct data
-- =================================================================

-- Verify entity exists and has expected properties
DO $$
DECLARE
    entity_count INTEGER;
    entity_id UUID;
BEGIN
    -- count matching entities and grab the first (there should only be one)
    SELECT COUNT(*) INTO entity_count
    FROM entities
    WHERE name = 'Test Nonprofit Organization' AND code = 'TNO';

    IF entity_count = 0 THEN
        RAISE EXCEPTION 'Test Nonprofit Organization not found in database. Aborting removal.';
    ELSIF entity_count > 1 THEN
        RAISE EXCEPTION 'Multiple Test Nonprofit Organization entities found ( % ). Please review database.', entity_count;
    END IF;

    -- fetch the single entity id
    SELECT id INTO entity_id
    FROM entities
    WHERE name = 'Test Nonprofit Organization' AND code = 'TNO'
    LIMIT 1;
    
    -- Verify no child entities exist
    IF EXISTS (SELECT 1 FROM entities WHERE parent_entity_id = entity_id) THEN
        RAISE EXCEPTION 'Test Nonprofit Organization has child entities. Remove them first.';
    END IF;
    
    -- Verify no journal entries exist
    IF EXISTS (SELECT 1 FROM journal_entries WHERE entity_id = entity_id) THEN
        RAISE EXCEPTION 'Test Nonprofit Organization has journal entries. Remove them first.';
    END IF;
    
    -- Verify no accounts exist
    IF EXISTS (SELECT 1 FROM accounts WHERE entity_id = entity_id) THEN
        RAISE EXCEPTION 'Test Nonprofit Organization has accounts. Remove them first.';
    END IF;
END $$;

-- =================================================================
-- REMOVAL: Delete fund first, then entity
-- =================================================================

-- Step 1: Delete the fund (must be done first due to foreign key constraints)
DELETE FROM funds 
WHERE entity_id = (SELECT id FROM entities WHERE name = 'Test Nonprofit Organization' AND code = 'TNO');

\echo '--- AFTER FUND REMOVAL: Fund Count for Test Nonprofit Organization ---'
SELECT COUNT(*) as remaining_funds 
FROM funds 
WHERE entity_id = (SELECT id FROM entities WHERE name = 'Test Nonprofit Organization' AND code = 'TNO');

-- Step 2: Delete the entity
DELETE FROM entities 
WHERE name = 'Test Nonprofit Organization' AND code = 'TNO';

-- =================================================================
-- VERIFICATION: Show counts after removal
-- =================================================================
\echo '--- AFTER REMOVAL: Entity Count ---'
SELECT COUNT(*) as total_entities FROM entities;

\echo '--- AFTER REMOVAL: Verification ---'
SELECT COUNT(*) as remaining_test_orgs 
FROM entities 
WHERE name = 'Test Nonprofit Organization' OR code = 'TNO';

-- Commit the transaction if all steps completed successfully
COMMIT;

\echo 'Test Nonprofit Organization and its associated fund have been successfully removed.'
