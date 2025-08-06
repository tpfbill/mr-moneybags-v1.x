-- =============================================================================
-- database/insert-complete-nacha-data.sql
-- Comprehensive Sample Data for NACHA Vendor Payments Functionality
-- =============================================================================
-- This script inserts all sample data needed for the NACHA Vendor Payments page
-- to function properly. It uses dynamic entity ID detection to ensure it works
-- across different installations and includes proper conflict handling.
-- =============================================================================

BEGIN;

-- Set client_min_messages to warning to reduce noise
SET client_min_messages TO warning;

-- =============================================================================
-- SECTION 1: USERS
-- Creates admin and regular user accounts needed for payment processing
-- =============================================================================
INSERT INTO users (username, password_hash, email, first_name, last_name, role, status)
VALUES 
('admin', '$2a$10$8KxO7M0O6h.WN/JaXXJJtO2AxJOZlJKlmIVW9vFDXqvT3Wp3JzZr2', 'admin@example.com', 'Admin', 'User', 'admin', 'active'),
('user', '$2a$10$8KxO7M0O6h.WN/JaXXJJtO2AxJOZlJKlmIVW9vFDXqvT3Wp3JzZr2', 'user@example.com', 'Regular', 'User', 'user', 'active')
ON CONFLICT (username) DO NOTHING;

-- Store user IDs for later reference
DO $$
DECLARE
    admin_user_id UUID;
    regular_user_id UUID;
    main_entity_id UUID;
    education_entity_id UUID;
BEGIN
    -- Get user IDs
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin';
    SELECT id INTO regular_user_id FROM users WHERE username = 'user';
    
    -- Get the main parent entity ID (typically "The Principle Foundation" or similar)
    SELECT id INTO main_entity_id FROM entities WHERE parent_entity_id IS NULL LIMIT 1;
    
    -- If no entity exists, raise notice and exit
    IF main_entity_id IS NULL THEN
        RAISE NOTICE 'No entities found in the database. Please create entities first.';
        RETURN;
    END IF;
    
    -- Get an educational services entity if it exists
    SELECT id INTO education_entity_id FROM entities WHERE name ILIKE '%Education%' OR name ILIKE '%TPF-ES%' LIMIT 1;
    
    -- If no education entity exists, use the main entity
    IF education_entity_id IS NULL THEN
        education_entity_id := main_entity_id;
    END IF;
    
    -- Store entity and user IDs in temporary table for use in INSERT statements
    CREATE TEMPORARY TABLE temp_ids (
        admin_user_id UUID,
        regular_user_id UUID,
        main_entity_id UUID,
        education_entity_id UUID
    );
    
    INSERT INTO temp_ids VALUES (admin_user_id, regular_user_id, main_entity_id, education_entity_id);
    
    RAISE NOTICE 'Using main entity ID: %', main_entity_id;
    RAISE NOTICE 'Using education entity ID: %', education_entity_id;
    RAISE NOTICE 'Admin user ID: %', admin_user_id;
    RAISE NOTICE 'Regular user ID: %', regular_user_id;

    -- =============================================================================
    -- SECTION 2: VENDORS
    -- Creates sample vendors with proper entity references
    -- =============================================================================
    INSERT INTO vendors (
        entity_id, vendor_code, name, tax_id, contact_name, email, 
        phone, address_line1, city, state, postal_code, country, status
    )
    SELECT
        t.main_entity_id, 
        'EDUSUP-001', 
        'Educational Supplies Inc', 
        '12-3456789', 
        'John Smith', 
        'john@edusupplies.com',
        '555-123-4567',
        '123 Education Lane',
        'Knowledge City',
        'CA',
        '94105',
        'USA',
        'active'
    FROM temp_ids t
    ON CONFLICT DO NOTHING;

    INSERT INTO vendors (
        entity_id, vendor_code, name, tax_id, contact_name, email, 
        phone, address_line1, city, state, postal_code, country, status
    )
    SELECT
        t.main_entity_id, 
        'OFFSUPP-002', 
        'Office Supplies Co', 
        '98-7654321', 
        'Jane Doe', 
        'jane@officesupplies.com',
        '555-987-6543',
        '456 Office Park Drive',
        'Business City',
        'NY',
        '10001',
        'USA',
        'active'
    FROM temp_ids t
    ON CONFLICT DO NOTHING;

    INSERT INTO vendors (
        entity_id, vendor_code, name, tax_id, contact_name, email, 
        phone, address_line1, city, state, postal_code, country, status
    )
    SELECT
        t.education_entity_id, 
        'TECH-003', 
        'Technology Solutions Ltd', 
        '45-6789123', 
        'Robert Johnson', 
        'robert@techsolutions.com',
        '555-456-7890',
        '789 Tech Boulevard',
        'Innovation Valley',
        'WA',
        '98101',
        'USA',
        'active'
    FROM temp_ids t
    ON CONFLICT DO NOTHING;

    -- =============================================================================
    -- SECTION 3: VENDOR BANK ACCOUNTS
    -- Creates bank accounts for each vendor for ACH payments
    -- =============================================================================
    -- Get the vendor IDs we just inserted
    DECLARE
        vendor1_id UUID;
        vendor2_id UUID;
        vendor3_id UUID;
    BEGIN
        SELECT id INTO vendor1_id FROM vendors WHERE vendor_code = 'EDUSUP-001' LIMIT 1;
        SELECT id INTO vendor2_id FROM vendors WHERE vendor_code = 'OFFSUPP-002' LIMIT 1;
        SELECT id INTO vendor3_id FROM vendors WHERE vendor_code = 'TECH-003' LIMIT 1;
        
        -- Insert vendor bank accounts
        IF vendor1_id IS NOT NULL THEN
            INSERT INTO vendor_bank_accounts (
                vendor_id, account_name, account_number, routing_number, 
                account_type, is_primary, status
            ) VALUES
                (vendor1_id, 'Operating Account', '123456789', '021000021', 
                 'checking', TRUE, 'active'),
                (vendor1_id, 'Savings Account', '987654321', '021000021', 
                 'savings', FALSE, 'active')
            ON CONFLICT DO NOTHING;
        END IF;
        
        IF vendor2_id IS NOT NULL THEN
            INSERT INTO vendor_bank_accounts (
                vendor_id, account_name, account_number, routing_number, 
                account_type, is_primary, status
            ) VALUES
                (vendor2_id, 'Main Account', '456789123', '021000021', 
                 'checking', TRUE, 'active')
            ON CONFLICT DO NOTHING;
        END IF;
        
        IF vendor3_id IS NOT NULL THEN
            INSERT INTO vendor_bank_accounts (
                vendor_id, account_name, account_number, routing_number, 
                account_type, is_primary, status
            ) VALUES
                (vendor3_id, 'Business Account', '789123456', '021000021', 
                 'checking', TRUE, 'active')
            ON CONFLICT DO NOTHING;
        END IF;

        -- =============================================================================
        -- SECTION 4: NACHA SETTINGS
        -- Creates company NACHA settings for ACH file generation
        -- =============================================================================
        INSERT INTO company_nacha_settings (
            entity_id, company_name, company_id, originating_dfi_id,
            company_entry_description, is_production
        )
        SELECT
            t.main_entity_id,
            'TPF',
            '1234567890',
            '21000021',
            'PAYMENT',
            FALSE
        FROM temp_ids t
        ON CONFLICT DO NOTHING;

        INSERT INTO company_nacha_settings (
            entity_id, company_name, company_id, originating_dfi_id,
            company_entry_description, is_production
        )
        SELECT
            t.education_entity_id,
            'TPF-ES',
            '0987654321',
            '21000021',
            'PAYMENT',
            FALSE
        FROM temp_ids t
        ON CONFLICT DO NOTHING;

        -- =============================================================================
        -- SECTION 5: FUNDS (Get existing funds for payment batches)
        -- =============================================================================
        DECLARE
            main_fund_id UUID;
            education_fund_id UUID;
        BEGIN
            -- Get a fund for the main entity
            SELECT id INTO main_fund_id FROM funds WHERE entity_id = main_entity_id LIMIT 1;
            
            -- Get a fund for the education entity
            SELECT id INTO education_fund_id FROM funds WHERE entity_id = education_entity_id LIMIT 1;
            
            -- If no funds exist, use the main fund for both
            IF main_fund_id IS NULL THEN
                RAISE NOTICE 'No funds found for the main entity. Payment batches will not be created.';
                RETURN;
            END IF;
            
            IF education_fund_id IS NULL THEN
                education_fund_id := main_fund_id;
            END IF;

            -- =============================================================================
            -- SECTION 6: PAYMENT BATCHES
            -- Creates payment batches with different statuses
            -- =============================================================================
            DECLARE
                nacha_settings1_id UUID;
                nacha_settings2_id UUID;
                batch1_id UUID;
                batch2_id UUID;
                batch3_id UUID;
            BEGIN
                -- Get NACHA settings IDs
                SELECT id INTO nacha_settings1_id FROM company_nacha_settings WHERE entity_id = main_entity_id LIMIT 1;
                SELECT id INTO nacha_settings2_id FROM company_nacha_settings WHERE entity_id = education_entity_id LIMIT 1;
                
                -- Create payment batches
                INSERT INTO payment_batches (
                    entity_id, fund_id, nacha_settings_id, batch_number, batch_date, 
                    effective_date, total_amount, status, created_by
                ) 
                SELECT
                    t.main_entity_id,
                    main_fund_id,
                    nacha_settings1_id,
                    'BATCH-2025-001',
                    CURRENT_DATE,
                    CURRENT_DATE + INTERVAL '1 day',
                    2500.00,
                    'draft',
                    'admin'
                FROM temp_ids t
                ON CONFLICT DO NOTHING
                RETURNING id INTO batch1_id;

                INSERT INTO payment_batches (
                    entity_id, fund_id, nacha_settings_id, batch_number, batch_date, 
                    effective_date, total_amount, status, created_by
                ) 
                SELECT
                    t.main_entity_id,
                    main_fund_id,
                    nacha_settings1_id,
                    'BATCH-2025-002',
                    CURRENT_DATE - INTERVAL '1 day',
                    CURRENT_DATE,
                    3750.00,
                    'approved',
                    'admin'
                FROM temp_ids t
                ON CONFLICT DO NOTHING
                RETURNING id INTO batch2_id;

                INSERT INTO payment_batches (
                    entity_id, fund_id, nacha_settings_id, batch_number, batch_date, 
                    effective_date, total_amount, status, created_by
                ) 
                SELECT
                    t.education_entity_id,
                    education_fund_id,
                    nacha_settings2_id,
                    'BATCH-ES-001',
                    CURRENT_DATE,
                    CURRENT_DATE + INTERVAL '2 days',
                    1250.00,
                    'draft',
                    'user'
                FROM temp_ids t
                ON CONFLICT DO NOTHING
                RETURNING id INTO batch3_id;

                -- If batch IDs are null, try to get them from existing batches
                IF batch1_id IS NULL THEN
                    SELECT id INTO batch1_id FROM payment_batches WHERE batch_number = 'BATCH-2025-001' LIMIT 1;
                END IF;
                
                IF batch2_id IS NULL THEN
                    SELECT id INTO batch2_id FROM payment_batches WHERE batch_number = 'BATCH-2025-002' LIMIT 1;
                END IF;
                
                IF batch3_id IS NULL THEN
                    SELECT id INTO batch3_id FROM payment_batches WHERE batch_number = 'BATCH-ES-001' LIMIT 1;
                END IF;

                -- =============================================================================
                -- SECTION 7: NACHA FILES
                -- Creates NACHA files for payment batches
                -- =============================================================================
                IF batch1_id IS NOT NULL THEN
                    INSERT INTO nacha_files (
                        payment_batch_id, filename, file_date, file_content, status
                    ) VALUES (
                        batch1_id,
                        'TPF_20250806_001.ach',
                        CURRENT_DATE,
                        '101 1234567890 21000021250806    1234567890TPFPAYMENT        
5200TPF                    1234567890PAYMENT   250807250807   1234567890000001
622021000021456789123      0000125000OFFICE SUPPLIES CO       1234567890000001
622021000021789123456      0000125000TECHNOLOGY SOLUTIONS LTD 1234567890000002
8200000002000420000420000000250000000000000001234567890                         000002
9000001000001000000020004200004200000002500000000000000                                       ',
                        'generated'
                    ) ON CONFLICT DO NOTHING;
                END IF;

                IF batch2_id IS NOT NULL THEN
                    INSERT INTO nacha_files (
                        payment_batch_id, filename, file_date, file_content, status
                    ) VALUES (
                        batch2_id,
                        'TPF_20250805_001.ach',
                        CURRENT_DATE - INTERVAL '1 day',
                        '101 1234567890 21000021250805    1234567890TPFPAYMENT        
5200TPF                    1234567890PAYMENT   250806250806   1234567890000001
622021000021123456789      0000375000EDUCATIONAL SUPPLIES INC  1234567890000001
8200000001000210000210000000375000000000000001234567890                         000001
9000001000001000000010002100002100000003750000000000000                                       ',
                        'transmitted'
                    ) ON CONFLICT DO NOTHING;
                END IF;

                IF batch3_id IS NOT NULL THEN
                    INSERT INTO nacha_files (
                        payment_batch_id, filename, file_date, file_content, status
                    ) VALUES (
                        batch3_id,
                        'TPF_ES_20250806_001.ach',
                        CURRENT_DATE,
                        '101 0987654321 21000021250806    0987654321TPFPAYMENT        
5200TPF-ES                 0987654321PAYMENT   250808250808   0987654321000001
622021000021789123456      0000125000TECHNOLOGY SOLUTIONS LTD 0987654321000001
8200000001000210000210000000125000000000000000987654321                         000001
9000001000001000000010002100002100000001250000000000000                                       ',
                        'generated'
                    ) ON CONFLICT DO NOTHING;
                END IF;

                -- =============================================================================
                -- SECTION 8: PAYMENT ITEMS
                -- Creates payment items for each batch
                -- =============================================================================
                IF batch1_id IS NOT NULL AND vendor1_id IS NOT NULL AND vendor2_id IS NOT NULL THEN
                    -- Get vendor bank account IDs
                    DECLARE
                        vendor1_bank_id UUID;
                        vendor2_bank_id UUID;
                        vendor3_bank_id UUID;
                    BEGIN
                        SELECT id INTO vendor1_bank_id FROM vendor_bank_accounts 
                        WHERE vendor_id = vendor1_id AND is_primary = TRUE LIMIT 1;
                        
                        SELECT id INTO vendor2_bank_id FROM vendor_bank_accounts 
                        WHERE vendor_id = vendor2_id AND is_primary = TRUE LIMIT 1;
                        
                        SELECT id INTO vendor3_bank_id FROM vendor_bank_accounts 
                        WHERE vendor_id = vendor3_id AND is_primary = TRUE LIMIT 1;

                        -- Insert payment items for batch 1 (draft)
                        IF vendor2_bank_id IS NOT NULL THEN
                            INSERT INTO payment_items (
                                payment_batch_id, vendor_id, vendor_bank_account_id, amount, description, status
                            ) VALUES (
                                batch1_id,
                                vendor2_id,
                                vendor2_bank_id,
                                1250.00,
                                'Office supplies for Q3',
                                'pending'
                            ) ON CONFLICT DO NOTHING;
                        END IF;

                        IF vendor3_bank_id IS NOT NULL THEN
                            INSERT INTO payment_items (
                                payment_batch_id, vendor_id, vendor_bank_account_id, amount, description, status
                            ) VALUES (
                                batch1_id,
                                vendor3_id,
                                vendor3_bank_id,
                                1250.00,
                                'Technology consulting services',
                                'pending'
                            ) ON CONFLICT DO NOTHING;
                        END IF;

                        -- Insert payment item for batch 2 (approved)
                        IF vendor1_bank_id IS NOT NULL THEN
                            INSERT INTO payment_items (
                                payment_batch_id, vendor_id, vendor_bank_account_id, amount, description, status
                            ) VALUES (
                                batch2_id,
                                vendor1_id,
                                vendor1_bank_id,
                                3750.00,
                                'Educational supplies and materials',
                                'approved'
                            ) ON CONFLICT DO NOTHING;
                        END IF;

                        -- Insert payment item for batch 3 (education entity)
                        IF vendor3_bank_id IS NOT NULL THEN
                            INSERT INTO payment_items (
                                payment_batch_id, vendor_id, vendor_bank_account_id, amount, description, status
                            ) VALUES (
                                batch3_id,
                                vendor3_id,
                                vendor3_bank_id,
                                1250.00,
                                'Educational technology upgrade',
                                'pending'
                            ) ON CONFLICT DO NOTHING;
                        END IF;
                    END;
                END IF;
            END;
        END;
    END;
    -- Final completion notice
    RAISE NOTICE 'NACHA sample data insertion complete';
END $$;

-- Clean up temporary table
DROP TABLE IF EXISTS temp_ids;

COMMIT;
