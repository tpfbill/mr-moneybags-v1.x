-- =============================================================================
-- fix-tpf-parent.sql
--
-- Description:
-- This script fixes the TPF entity hierarchy issues in the nonprofit fund accounting system.
-- It ensures TPF_PARENT is the top-level entity with no parent, and that TPF, 
-- TPF-ES, and IFCSN are properly set as children of TPF_PARENT.
--
-- The script is idempotent and can be run multiple times without causing issues.
-- =============================================================================

BEGIN;

-- Display current entity hierarchy for diagnostic purposes
SELECT 
    e.id, 
    e.name, 
    e.code, 
    e.parent_entity_id, 
    p.name as parent_name, 
    p.code as parent_code
FROM 
    entities e
LEFT JOIN 
    entities p ON e.parent_entity_id = p.id
WHERE
    e.code IN ('TPF_PARENT', 'TPF', 'TPF-ES', 'IFCSN', 'NFCSN')
    OR e.name LIKE '%Principle Foundation%'
ORDER BY 
    CASE WHEN e.parent_entity_id IS NULL THEN 0 ELSE 1 END, 
    e.name;

-- Step 1: Ensure TPF_PARENT has no parent
UPDATE entities 
SET parent_entity_id = NULL
WHERE code = 'TPF_PARENT';

-- Step 2: Fix entity names for clarity
UPDATE entities 
SET name = 'The Principle Foundation - Parent'
WHERE code = 'TPF_PARENT';

UPDATE entities 
SET name = 'The Principle Foundation'
WHERE code = 'TPF';

UPDATE entities 
SET name = 'TPF Educational Services'
WHERE code = 'TPF-ES';

UPDATE entities 
SET name = 'International Foundation for Community Service Networks',
    code = 'IFCSN'
WHERE code IN ('IFCSN', 'NFCSN');

-- Step 3: Ensure all child entities point to TPF_PARENT
UPDATE entities AS child
SET parent_entity_id = parent.id
FROM entities AS parent
WHERE parent.code = 'TPF_PARENT'
  AND child.code IN ('TPF', 'TPF-ES', 'IFCSN')
  AND (child.parent_entity_id IS NULL OR child.parent_entity_id != parent.id);

-- ---------------------------------------------------------------------------
-- Step 4: Remove duplicate entities (UUID-safe)
-- ---------------------------------------------------------------------------
--  PostgreSQL cannot apply MIN()/MAX() directly on UUID columns.  Instead,
--  use ROW_NUMBER() to mark every entity after the first (per code) and
--  delete rows where rn > 1.  This approach is idempotent and works on all
--  PG versions ≥9.6.
WITH dupes AS (
    SELECT
        id,
        code,
        ROW_NUMBER() OVER (PARTITION BY code ORDER BY id) AS rn
    FROM entities
    WHERE code IN ('TPF_PARENT', 'TPF', 'TPF-ES', 'IFCSN')
)
DELETE FROM entities
WHERE id IN (SELECT id FROM dupes WHERE rn > 1);

-- ---------------------------------------------------------------------------
-- Step 4.1: Remove stray generic “Main Organization” entities (if any)
-- ---------------------------------------------------------------------------
DELETE FROM entities
WHERE (code IN ('MAIN', 'MAINHQ') OR name ILIKE 'Main Organization%')
  AND id NOT IN (SELECT parent_entity_id FROM entities WHERE parent_entity_id IS NOT NULL);

-- Display final entity hierarchy to verify changes
SELECT 
    e.id, 
    e.name, 
    e.code, 
    e.parent_entity_id, 
    p.name as parent_name, 
    p.code as parent_code
FROM 
    entities e
LEFT JOIN 
    entities p ON e.parent_entity_id = p.id
WHERE
    e.code IN ('TPF_PARENT', 'TPF', 'TPF-ES', 'IFCSN')
    OR e.name LIKE '%Principle Foundation%'
ORDER BY 
    CASE WHEN e.parent_entity_id IS NULL THEN 0 ELSE 1 END, 
    e.name;

-- Verify the correct hierarchy structure
DO $$
DECLARE
    tpf_parent_id UUID;
    tpf_count INT;
    tpf_es_count INT;
    ifcsn_count INT;
    hierarchy_valid BOOLEAN := TRUE;
BEGIN
    -- Get TPF_PARENT ID
    SELECT id INTO tpf_parent_id FROM entities WHERE code = 'TPF_PARENT';
    
    -- Count children with TPF_PARENT as parent
    SELECT COUNT(*) INTO tpf_count FROM entities WHERE code = 'TPF' AND parent_entity_id = tpf_parent_id;
    SELECT COUNT(*) INTO tpf_es_count FROM entities WHERE code = 'TPF-ES' AND parent_entity_id = tpf_parent_id;
    SELECT COUNT(*) INTO ifcsn_count FROM entities WHERE code = 'IFCSN' AND parent_entity_id = tpf_parent_id;
    
    -- Check if hierarchy is valid
    IF tpf_parent_id IS NULL THEN
        RAISE NOTICE 'ERROR: TPF_PARENT entity not found';
        hierarchy_valid := FALSE;
    END IF;
    
    IF tpf_count = 0 THEN
        RAISE NOTICE 'ERROR: TPF entity not found or not properly linked to TPF_PARENT';
        hierarchy_valid := FALSE;
    END IF;
    
    IF tpf_es_count = 0 THEN
        RAISE NOTICE 'ERROR: TPF-ES entity not found or not properly linked to TPF_PARENT';
        hierarchy_valid := FALSE;
    END IF;
    
    IF ifcsn_count = 0 THEN
        RAISE NOTICE 'ERROR: IFCSN entity not found or not properly linked to TPF_PARENT';
        hierarchy_valid := FALSE;
    END IF;
    
    IF hierarchy_valid THEN
        RAISE NOTICE 'SUCCESS: Entity hierarchy is valid. TPF_PARENT -> (TPF, TPF-ES, IFCSN)';
    ELSE
        RAISE NOTICE 'WARNING: Entity hierarchy validation failed';
    END IF;
END $$;

COMMIT;
