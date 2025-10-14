CREATE TABLE IF NOT EXISTS batch_payment_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id UUID NOT NULL,
    payment_item_id UUID,
    log_level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_import_id FOREIGN KEY (import_id) REFERENCES journal_entries(import_id) ON DELETE CASCADE,
    CONSTRAINT fk_payment_item_id FOREIGN KEY (payment_item_id) REFERENCES payment_items(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_batch_payment_log_import_id ON batch_payment_log(import_id);
CREATE INDEX IF NOT EXISTS idx_batch_payment_log_log_level ON batch_payment_log(log_level);
