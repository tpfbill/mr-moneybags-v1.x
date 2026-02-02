-- Migration: Add log_file column to payment_batches table
-- This column stores the filename of the import log for each batch

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'payment_batches' AND column_name = 'log_file'
    ) THEN
        ALTER TABLE payment_batches ADD COLUMN log_file VARCHAR(255);
    END IF;
END $$;
