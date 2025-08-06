-- =============================================================================
-- clean-main-org.sql
--
-- Description:
-- This script safely removes the "Main Organization" entity that shouldn't exist
-- in the TPF hierarchy. It checks for dependencies before removing the entity
-- and shows before/after state for verification.
--
-- The script is idempotent and can be run multiple times without causing issues.
-- =============================================================================

BEGIN;

-- Display current entities (BEFORE state)
SELECT 
    e.id, 
    e.name, 
    e.code, 
    e.parent_entity_id, 
    p.name as parent_name
FROM 
    entities e
LEFT JOIN 
    entities p ON e.parent_entity_id = p.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ')
ORDER BY 
    e.name;

-- Check for dependencies
DO $$
DECLARE
    main_org_id UUID;
    child_count INT;
    fund_count INT;
    account_count INT;
    journal_count INT;
    can_delete BOOLEAN := TRUE;
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
    
    -- Check for child entities
    SELECT COUNT(*) INTO child_count 
    FROM entities 
    WHERE parent_entity_id = main_org_id;
    
    -- Check for funds
    SELECT COUNT(*) INTO fund_count 
    FROM funds 
    WHERE entity_id = main_org_id;
    
    -- Check for accounts
    SELECT COUNT(*) INTO account_count 
    FROM accounts 
    WHERE entity_id = main_org_id;
    
    -- Check for journal entries
    SELECT COUNT(*) INTO journal_count 
    FROM journal_entries 
    WHERE entity_id = main_org_id;
    
    -- Display dependency counts
    RAISE NOTICE 'Main Organization (ID: %) dependencies:', main_org_id;
    RAISE NOTICE '  • Child entities: %', child_count;
    RAISE NOTICE '  • Funds: %', fund_count;
    RAISE NOTICE '  • Accounts: %', account_count;
    RAISE NOTICE '  • Journal entries: %', journal_count;
    
    -- Determine if safe to delete
    IF child_count > 0 THEN
        RAISE NOTICE 'Cannot delete: Has % child entities', child_count;
        can_delete := FALSE;
    END IF;
    
    IF fund_count > 0 THEN
        RAISE NOTICE 'Cannot delete: Has % funds', fund_count;
        can_delete := FALSE;
    END IF;
    
    IF account_count > 0 THEN
        RAISE NOTICE 'Cannot delete: Has % accounts', account_count;
        can_delete := FALSE;
    END IF;
    
    IF journal_count > 0 THEN
        RAISE NOTICE 'Cannot delete: Has % journal entries', journal_count;
        can_delete := FALSE;
    END IF;
    
    -- Delete if safe
    IF can_delete THEN
        RAISE NOTICE 'Safe to delete Main Organization entity. Proceeding...';
        DELETE FROM entities WHERE id = main_org_id;
        
        GET DIAGNOSTICS child_count = ROW_COUNT;
        IF child_count > 0 THEN
            RAISE NOTICE 'Successfully deleted Main Organization entity';
        ELSE
            RAISE NOTICE 'No rows deleted. Entity may have been removed already.';
        END IF;
    ELSE
        RAISE NOTICE 'Cannot safely delete Main Organization entity due to dependencies.';
        RAISE NOTICE 'Please resolve dependencies first.';
    END IF;
END $$;

-- Display entities after deletion (AFTER state)
SELECT 
    e.id, 
    e.name, 
    e.code, 
    e.parent_entity_id, 
    p.name as parent_name
FROM 
    entities e
LEFT JOIN 
    entities p ON e.parent_entity_id = p.id
WHERE
    e.name LIKE 'Main Organization%' OR e.code IN ('MAIN', 'MAINHQ')
ORDER BY 
    e.name;

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
