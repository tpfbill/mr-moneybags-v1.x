-- Migration: Create gl_codes table (idempotent)
-- Date: 2025-09-29

BEGIN;

CREATE TABLE IF NOT EXISTS gl_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) NOT NULL,
    description VARCHAR(255),
    classification VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_gl_codes_code_lower
    ON gl_codes ((LOWER(code)));

COMMIT;
