-- Migration: Accounts Schema Overhaul (2025-09-12)
-- Implements comprehensive schema changes to the accounts table per definitive spec
-- No data backfill required as table will be emptied and repopulated

BEGIN;

-- 1. Drop obsolete trigger if it exists
DROP TRIGGER IF EXISTS trg_accounts_set_updated_at ON accounts;

-- 2. Drop unique constraint on (entity_id, code) if present
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'accounts_entity_id_code_key' 
        AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts DROP CONSTRAINT accounts_entity_id_code_key;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 3. Rename columns (with conditional checks to ensure idempotency)
DO $$
BEGIN
    -- code -> account_code
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts RENAME COLUMN code TO account_code;
    END IF;

    -- classifications -> classification
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'classifications'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts RENAME COLUMN classifications TO classification;
    END IF;

    -- balance -> beginning_balance
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'balance'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts RENAME COLUMN balance TO beginning_balance;
    END IF;

    -- updated_at -> last_used
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'updated_at'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts RENAME COLUMN updated_at TO last_used;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 4. Handle entity_id -> entity_code conversion
DO $$
BEGIN
    -- Drop entity_id if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'entity_id'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN entity_id;
    END IF;

    -- Add entity_code if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'entity_code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN entity_code varchar(10) NOT NULL;
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN entity_code TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN entity_code SET NOT NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 5. Alter column types and nullability/defaults
DO $$
BEGIN
    -- account_code: varchar(25) NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'account_code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ALTER COLUMN account_code TYPE varchar(25);
        ALTER TABLE accounts ALTER COLUMN account_code SET NOT NULL;
    END IF;

    -- description: varchar(100) NOT NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'description'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ALTER COLUMN description TYPE varchar(100);
        ALTER TABLE accounts ALTER COLUMN description SET NOT NULL;
    END IF;

    -- classification: varchar(50) NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'classification'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ALTER COLUMN classification TYPE varchar(50);
        ALTER TABLE accounts ALTER COLUMN classification DROP NOT NULL;
    END IF;

    -- status: varchar(10) NOT NULL with CHECK in ('Active','Inactive')
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'status'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ALTER COLUMN status TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN status SET NOT NULL;
        
        -- Drop existing check constraint if any
        IF EXISTS (
            SELECT 1 FROM pg_constraint 
            WHERE conname = 'accounts_status_check' 
            AND conrelid = 'accounts'::regclass
        ) THEN
            ALTER TABLE accounts DROP CONSTRAINT accounts_status_check;
        END IF;
        
        -- Add check constraint
        ALTER TABLE accounts ADD CONSTRAINT accounts_status_check 
            CHECK (status IN ('Active', 'Inactive'));
    END IF;

    -- last_used: date NOT NULL DEFAULT CURRENT_DATE
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'last_used'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ALTER COLUMN last_used TYPE date;
        ALTER TABLE accounts ALTER COLUMN last_used SET NOT NULL;
        ALTER TABLE accounts ALTER COLUMN last_used SET DEFAULT CURRENT_DATE;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 6. Add new columns if missing
DO $$
BEGIN
    -- gl_code: varchar(10) NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'gl_code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN gl_code varchar(10) NOT NULL;
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN gl_code TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN gl_code SET NOT NULL;
    END IF;

    -- fund_number: varchar(10) NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'fund_number'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN fund_number varchar(10) NOT NULL;
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN fund_number TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN fund_number SET NOT NULL;
    END IF;

    -- restriction: varchar(10) NOT NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'restriction'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN restriction varchar(10) NOT NULL;
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN restriction TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN restriction SET NOT NULL;
    END IF;

    -- balance_sheet: varchar(10) NOT NULL with CHECK in ('Yes','No')
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'balance_sheet'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN balance_sheet varchar(10) NOT NULL DEFAULT 'No';
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN balance_sheet TYPE varchar(10);
        ALTER TABLE accounts ALTER COLUMN balance_sheet SET NOT NULL;
    END IF;
    
    -- Add check constraint for balance_sheet
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'accounts_balance_sheet_check' 
        AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_balance_sheet_check 
            CHECK (balance_sheet IN ('Yes', 'No'));
    END IF;

    -- beginning_balance_date: date NULL
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'beginning_balance_date'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts ADD COLUMN beginning_balance_date date NULL;
    ELSE
        -- Ensure correct type and nullability
        ALTER TABLE accounts ALTER COLUMN beginning_balance_date TYPE date;
        ALTER TABLE accounts ALTER COLUMN beginning_balance_date DROP NOT NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 7. Drop columns if they exist
DO $$
BEGIN
    -- Drop subtype if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'subtype'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN subtype;
    END IF;

    -- Drop parent_id if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'parent_id'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN parent_id;
    END IF;

    -- Drop is_active if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'is_active'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN is_active;
    END IF;

    -- Drop created_at if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'created_at'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN created_at;
    END IF;

    -- Drop report_code if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'report_code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN report_code;
    END IF;

    -- Drop chart_code if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'accounts' AND column_name = 'chart_code'
        AND table_schema = current_schema()
    ) THEN
        ALTER TABLE accounts DROP COLUMN chart_code;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 7.5. Set up FK prerequisites (ensure referenced columns have unique constraints)
DO $$
DECLARE
    duplicate_fund_numbers INT;
BEGIN
    -- 1. Add unique constraint on gl_codes.code if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'gl_codes_code_key' 
        AND conrelid = 'gl_codes'::regclass
    ) THEN
        -- Check if table exists first
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'gl_codes'
            AND table_schema = current_schema()
        ) THEN
            -- Check if there are any duplicates
            EXECUTE 'SELECT COUNT(*) FROM (SELECT code FROM gl_codes GROUP BY code HAVING COUNT(*) > 1) AS dupes'
            INTO duplicate_fund_numbers;
            
            IF duplicate_fund_numbers = 0 THEN
                -- Safe to add unique constraint
                ALTER TABLE gl_codes ADD CONSTRAINT gl_codes_code_key UNIQUE (code);
                RAISE NOTICE 'Added unique constraint on gl_codes.code';
            ELSE
                RAISE NOTICE 'Cannot add unique constraint on gl_codes.code - % duplicate values found', duplicate_fund_numbers;
            END IF;
        END IF;
    END IF;

    -- 2. Check if we can add unique constraint on funds.fund_number
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'funds_fund_number_key' 
        AND conrelid = 'funds'::regclass
    ) THEN
        -- Check if table exists first
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'funds'
            AND table_schema = current_schema()
        ) THEN
            -- Check if there are any duplicates
            EXECUTE 'SELECT COUNT(*) FROM (SELECT fund_number FROM funds GROUP BY fund_number HAVING COUNT(*) > 1) AS dupes'
            INTO duplicate_fund_numbers;
            
            IF duplicate_fund_numbers = 0 THEN
                -- Safe to add unique constraint
                ALTER TABLE funds ADD CONSTRAINT funds_fund_number_key UNIQUE (fund_number);
                RAISE NOTICE 'Added unique constraint on funds.fund_number';
            ELSE
                RAISE NOTICE 'Cannot add unique constraint on funds.fund_number - % duplicate values found', duplicate_fund_numbers;
            END IF;
        END IF;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'One or more referenced tables do not exist yet';
END $$;

-- 8. Add foreign keys
DO $$
BEGIN
    -- entity_code -> entities(code)
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'accounts_entity_code_fkey' 
        AND conrelid = 'accounts'::regclass
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_entity_code_fkey
            FOREIGN KEY (entity_code) REFERENCES entities(code) ON DELETE RESTRICT;
    END IF;

    -- gl_code -> gl_codes(code) - only if unique constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'accounts_gl_code_fkey' 
        AND conrelid = 'accounts'::regclass
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'gl_codes_code_key' 
        AND conrelid = 'gl_codes'::regclass
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_gl_code_fkey
            FOREIGN KEY (gl_code) REFERENCES gl_codes(code) ON DELETE RESTRICT;
    END IF;

    -- fund_number -> funds(fund_number) - only if unique constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'accounts_fund_number_fkey' 
        AND conrelid = 'accounts'::regclass
    ) AND EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'funds_fund_number_key' 
        AND conrelid = 'funds'::regclass
    ) THEN
        ALTER TABLE accounts ADD CONSTRAINT accounts_fund_number_fkey
            FOREIGN KEY (fund_number) REFERENCES funds(fund_number) ON DELETE RESTRICT;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 9. Create non-unique indexes
DO $$
BEGIN
    -- Index on account_code
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_accounts_account_code' 
        AND tablename = 'accounts'
    ) THEN
        CREATE INDEX idx_accounts_account_code ON accounts(account_code);
    END IF;

    -- Index on gl_code
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_accounts_gl_code' 
        AND tablename = 'accounts'
    ) THEN
        CREATE INDEX idx_accounts_gl_code ON accounts(gl_code);
    END IF;

    -- Index on fund_number
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_accounts_fund_number' 
        AND tablename = 'accounts'
    ) THEN
        CREATE INDEX idx_accounts_fund_number ON accounts(fund_number);
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

-- 10. Create trigger function to derive fields
CREATE OR REPLACE FUNCTION accounts_derive_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Set restriction from funds table based on fund_number
    SELECT restriction INTO NEW.restriction
    FROM funds
    WHERE fund_number = NEW.fund_number
    LIMIT 1;
    
    -- If restriction not found, use empty string
    IF NEW.restriction IS NULL THEN
        NEW.restriction := '';
    END IF;
    
    -- Set classification from gl_codes table based on gl_code
    SELECT classification INTO NEW.classification
    FROM gl_codes
    WHERE code = NEW.gl_code
    LIMIT 1;
    
    -- Compute account_code as concatenation with spaces
    NEW.account_code := CONCAT(
        COALESCE(NEW.entity_code, ''), ' ',
        COALESCE(NEW.gl_code, ''), ' ',
        COALESCE(NEW.fund_number, ''), ' ',
        COALESCE(NEW.restriction, '')
    );
    
    -- Set last_used to current date on INSERT if null
    IF TG_OP = 'INSERT' AND NEW.last_used IS NULL THEN
        NEW.last_used := CURRENT_DATE;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 11. Create trigger to call function on INSERT/UPDATE
DO $$
BEGIN
    -- Drop trigger if it exists
    DROP TRIGGER IF EXISTS trg_accounts_derive_fields ON accounts;
    
    -- Create trigger
    CREATE TRIGGER trg_accounts_derive_fields
    BEFORE INSERT OR UPDATE OF entity_code, gl_code, fund_number, restriction
    ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION accounts_derive_fields();
EXCEPTION
    WHEN undefined_table THEN
        RAISE NOTICE 'Table accounts does not exist yet';
END $$;

COMMIT;
