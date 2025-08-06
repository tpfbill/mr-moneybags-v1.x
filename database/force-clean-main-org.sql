-- =============================================================================
-- force-clean-main-org.sql
--
-- Description:
-- This script forcefully removes the "Main Organization" entity and ALL its
-- dependencies (funds, accounts, journal entries) since they're not part of 
-- the TPF hierarchy. This is a comprehensive cleanup to ensure a clean TPF-only
-- hierarchy.
--
-- WARNING: This script will DELETE data. Use with caution.
-- =============================================================================

BEGIN;

-- Show before state counts
SELECT 'BEFORE STATE' as state;

DO $$
DECLARE
    main_org_id UUID;
    entity_count INT;
    fund_count INT;
    account_count INT;
    journal_count INT;
BEGIN
    -- Get Main Organization ID
    SELECT id INTO main_org_id 
    FROM entities 
    WHERE name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ')
    LIMIT 1;
    
    IF main_org_id IS NULL THEN
        RAISE NOTICE 'Main Organization entity not found. Nothing to delete.';
        RETURN;
    END IF;
    
    -- Count entities
    SELECT COUNT(*) INTO entity_count 
    FROM entities 
    WHERE id = main_org_id OR name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ');
    
    -- Count funds
    SELECT COUNT(*) INTO fund_count 
    FROM funds 
    WHERE entity_id = main_org_id;
    
    -- Count accounts
    SELECT COUNT(*) INTO account_count 
    FROM accounts 
    WHERE entity_id = main_org_id;
    
    -- Count journal entries
    SELECT COUNT(*) INTO journal_count 
    FROM journal_entries 
    WHERE entity_id = main_org_id;
    
    -- Display dependency counts
    RAISE NOTICE 'Main Organization (ID: %) dependencies:', main_org_id;
    RAISE NOTICE '  • Entities: %', entity_count;
    RAISE NOTICE '  • Funds: %', fund_count;
    RAISE NOTICE '  • Accounts: %', account_count;
    RAISE NOTICE '  • Journal entries: %', journal_count;
END $$;

-- Show detailed entity info
SELECT 
    e.id, 
    e.name, 
    e.code, 
    e.parent_entity_id
FROM 
    entities e
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Show funds that will be deleted
SELECT 
    f.id,
    f.name,
    f.code,
    f.entity_id,
    e.name as entity_name
FROM 
    funds f
JOIN 
    entities e ON f.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Show accounts that will be deleted
SELECT 
    a.id,
    a.code,
    a.name,
    a.type,
    e.name as entity_name
FROM 
    accounts a
JOIN 
    entities e ON a.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Show journal entries that will be deleted
SELECT 
    je.id,
    je.reference_number,
    je.description,
    je.total_amount,
    e.name as entity_name
FROM 
    journal_entries je
JOIN 
    entities e ON je.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Confirm deletion
DO $$
BEGIN
    RAISE NOTICE '=============================================================';
    RAISE NOTICE 'STARTING DELETION PROCESS';
    RAISE NOTICE 'This will delete all Main Organization data permanently';
    RAISE NOTICE '=============================================================';
END $$;

-- Step 1: Delete journal entry lines first (they reference journal entries)
DO $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM journal_entry_items
    WHERE journal_entry_id IN (
        SELECT je.id
        FROM journal_entries je
        JOIN entities e ON je.entity_id = e.id
        WHERE e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ')
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % journal entry items', deleted_count;
END $$;

-- Step 2: Delete journal entries
DO $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM journal_entries
    WHERE entity_id IN (
        SELECT id FROM entities 
        WHERE name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ')
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % journal entries', deleted_count;
END $$;

-- Step 3: Delete accounts
DO $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM accounts
    WHERE entity_id IN (
        SELECT id FROM entities 
        WHERE name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ')
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % accounts', deleted_count;
END $$;

-- Step 4: Delete funds
DO $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM funds
    WHERE entity_id IN (
        SELECT id FROM entities 
        WHERE name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ')
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % funds', deleted_count;
END $$;

-- Step 5: Delete the Main Organization entity
DO $$
DECLARE
    deleted_count INT;
BEGIN
    DELETE FROM entities
    WHERE name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % entities', deleted_count;
    
    IF deleted_count > 0 THEN
        RAISE NOTICE 'Successfully removed Main Organization entity and all its dependencies';
    ELSE
        RAISE NOTICE 'No entities were deleted. They may have been removed already.';
    END IF;
END $$;

-- Show after state
SELECT 'AFTER STATE' as state;

-- Verify Main Organization is gone
SELECT 
    COUNT(*) as remaining_entities
FROM 
    entities
WHERE
    name LIKE 'Main Organization%' OR code IN ('MAIN', 'MAINHQ');

-- Verify funds are gone
SELECT 
    COUNT(*) as remaining_funds
FROM 
    funds f
JOIN 
    entities e ON f.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Verify accounts are gone
SELECT 
    COUNT(*) as remaining_accounts
FROM 
    accounts a
JOIN 
    entities e ON a.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Verify journal entries are gone
SELECT 
    COUNT(*) as remaining_journal_entries
FROM 
    journal_entries je
JOIN 
    entities e ON je.entity_id = e.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ');

-- Show all top-level entities for verification
SELECT 
    e.id, 
    e.name, 
    e.code
FROM 
    entities e
WHERE
    e.parent_entity_id IS NULL
ORDER BY 
    e.name;

COMMIT;
