ALTER TABLE journal_entries
ADD COLUMN payment_item_id INTEGER REFERENCES payment_items(id);
