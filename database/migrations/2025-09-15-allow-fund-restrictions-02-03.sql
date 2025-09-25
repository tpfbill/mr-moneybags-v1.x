-- =============================================================================
-- Migration: Allow fund restrictions 02 and 03
-- Date: 2025-09-15
-- =============================================================================
-- This migration updates the funds.restriction check constraint to allow
-- additional restriction codes '02' and '03' in addition to the existing
-- '00' and '01' values.
-- =============================================================================

BEGIN;

-- Drop the existing constraint if it exists
ALTER TABLE funds DROP CONSTRAINT IF EXISTS chk_funds_restriction;

-- Add new constraint allowing '00', '01', '02', '03'
ALTER TABLE funds ADD CONSTRAINT chk_funds_restriction CHECK (restriction::text = ANY (ARRAY['00'::character varying, '01'::character varying, '02'::character varying, '03'::character varying]::text[])) NOT VALID;

-- Validate existing rows satisfy the new constraint (should be fast)
ALTER TABLE funds VALIDATE CONSTRAINT chk_funds_restriction;

COMMIT;
