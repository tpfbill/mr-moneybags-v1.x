-- Migration: Add entry_mode to journal_entries
-- Date: 2025-09-23

BEGIN;

-- Add column entry_mode with default 'Manual' and check constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'journal_entries' AND column_name = 'entry_mode'
    ) THEN
        ALTER TABLE journal_entries
            ADD COLUMN entry_mode VARCHAR(10) NOT NULL DEFAULT 'Manual';
    END IF;

    -- Add constraint to restrict values
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_journal_entries_entry_mode'
    ) THEN
        ALTER TABLE journal_entries
            ADD CONSTRAINT chk_journal_entries_entry_mode
            CHECK (entry_mode IN ('Auto', 'Manual'));
    END IF;
END$$;

COMMIT;
