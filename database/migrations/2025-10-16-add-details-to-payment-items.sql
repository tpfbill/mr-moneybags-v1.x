ALTER TABLE payment_items
ADD COLUMN reference VARCHAR(25),
ADD COLUMN post_date DATE,
ADD COLUMN payee_zid VARCHAR(25),
ADD COLUMN invoice_date DATE,
ADD COLUMN invoice_number VARCHAR(25),
ADD COLUMN account_number VARCHAR(25),
ADD COLUMN bank_name VARCHAR(25),
ADD COLUMN payment_type VARCHAR(25),
ADD COLUMN "1099_amount" NUMERIC(15, 2),
ADD COLUMN payment_id VARCHAR(25),
ADD COLUMN entity_code VARCHAR(10),
ADD COLUMN gl_code VARCHAR(10),
ADD COLUMN fund_number VARCHAR(10);
