-- =============================================================================
-- NONPROFIT FUND ACCOUNTING SYSTEM - COMPREHENSIVE SAMPLE DATA (PART 1 OF 2)
-- =============================================================================
-- This file contains the first part of comprehensive sample data for the 
-- Nonprofit Fund Accounting System, including:
--   1. Users (admin and regular user)
--   2. Entities (The Principle Foundation hierarchy)
--   3. Funds (all funds for all entities)
--   4. First half of accounts (36 of 72 total accounts)
--
-- IMPORTANT: This file should be run AFTER schema-only.sql to ensure all tables
-- exist before inserting data. Run sample-data-part2.sql after this file.
--
-- WARNING: Due to circular foreign key constraints, you may need to temporarily
-- disable triggers when restoring this data or use the --disable-triggers option
-- with pg_restore.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SQL SETTINGS
-- -----------------------------------------------------------------------------

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- -----------------------------------------------------------------------------
-- USERS DATA
-- -----------------------------------------------------------------------------

-- Insert default users (admin/user with bcrypt hashed passwords)
INSERT INTO users (id, username, email, first_name, last_name, password_hash, role, status, created_at, updated_at) 
VALUES 
    ('a5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'admin', 'admin@example.com', 'System', 'Administrator', 
     '$2b$10$3euPcmQFCiblsZeEu5s7p.9MUZWg8PUdxufyQoj5Z2aQBYfETV1yO', 'admin', 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),  -- password: admin123
    ('b5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'user', 'user@example.com', 'Regular', 'User', 
     '$2b$10$3euPcmQFCiblsZeEu5s7p.9MUZWg8PUdxufyQoj5Z2aQBYfETV1yO', 'user', 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');   -- password: user123

-- -----------------------------------------------------------------------------
-- ENTITIES DATA
-- -----------------------------------------------------------------------------

-- Insert entities (The Principle Foundation hierarchy)
INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated, fiscal_year_start, base_currency, status, description, created_at, updated_at) 
VALUES 
    ('85bc84e8-f148-4e52-989f-6fc91180ddc2', 'The Principle Foundation', 'TPF_PARENT', NULL, true, '01-01', 'USD', 'active', 
     'Parent organization', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated, fiscal_year_start, base_currency, status, description, created_at, updated_at) 
VALUES 
    ('7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'The Principle Foundation', 'TPF', '85bc84e8-f148-4e52-989f-6fc91180ddc2', true, '01-01', 'USD', 'active', 
     'Main operating entity', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated, fiscal_year_start, base_currency, status, description, created_at, updated_at) 
VALUES 
    ('7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'TPF Educational Services', 'TPF-ES', '85bc84e8-f148-4e52-989f-6fc91180ddc2', false, '01-01', 'USD', 'active', 
     'Educational services division', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated, fiscal_year_start, base_currency, status, description, created_at, updated_at) 
VALUES 
    ('c3f07c5d-c40f-4559-8875-111df6bf4248', 'IFCSN', 'IFCSN', '85bc84e8-f148-4e52-989f-6fc91180ddc2', false, '01-01', 'USD', 'active', 
     'International division', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- FUNDS DATA
-- -----------------------------------------------------------------------------

-- Insert funds for TPF entity
INSERT INTO funds (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('bdd880a2-47d6-486f-bb47-3638c2b8cff3', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'GEN', 'General Fund', 'Unrestricted', 10000.0000, 'active', 
     'General operating fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('558f2e9b-2604-4852-84fa-c649350984bf', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'REST', 'Restricted Fund', 'Temporarily Restricted', 0.0000, 'active', 
     'Temporarily restricted funds', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('203dfbde-1d1a-49af-80b4-0958a8e5f73d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'TPF-GEN', 'TPF General Fund', 'Unrestricted', 5000.0000, 'active', 
     'TPF general operating fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('231236e8-6f92-417d-a997-68dedfe2da6b', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'TPF-SCH', 'TPF Scholarship Fund', 'Temporarily Restricted', 2500.0000, 'active', 
     'Scholarship program fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert funds for TPF-ES entity
INSERT INTO funds (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('396404a1-18c3-4cef-8809-95aad8c99244', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'GEN', 'General Fund', 'Unrestricted', 10000.0000, 'active', 
     'General operating fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e87bc7ae-6662-4d71-9a25-a598cef0ce25', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'REST', 'Restricted Fund', 'Temporarily Restricted', 0.0000, 'active', 
     'Temporarily restricted funds', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('cee4c09f-e88f-430d-96c5-d3a44d4151e4', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'ES-ADV', 'ES Advocacy Fund', 'Temporarily Restricted', 1500.0000, 'active', 
     'Educational advocacy fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('83e2e083-0f00-4592-bf4c-7cabd8bdd07c', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'ES-GRNT', 'ES Grant Fund', 'Temporarily Restricted', 3000.0000, 'active', 
     'Educational grants fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert funds for IFCSN entity
INSERT INTO funds (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('c90034cf-8cac-4b3f-9277-07606fe34be9', 'c3f07c5d-c40f-4559-8875-111df6bf4248', 'GEN', 'General Fund', 'Unrestricted', 10000.0000, 'active', 
     'General operating fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('68629f16-e4df-4caa-94ba-13eeffe06fad', 'c3f07c5d-c40f-4559-8875-111df6bf4248', 'REST', 'Restricted Fund', 'Temporarily Restricted', 0.0000, 'active', 
     'Temporarily restricted funds', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('56035007-de57-4ebf-bd80-66eb77aeebd7', 'c3f07c5d-c40f-4559-8875-111df6bf4248', 'IFCSN-COM', 'IFCSN Community Fund', 'Temporarily Restricted', 2000.0000, 'active', 
     'Community support fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('8905d28c-ab8f-4ce9-87b3-50b801ef8782', 'c3f07c5d-c40f-4559-8875-111df6bf4248', 'IFCSN-SP', 'IFCSN Special Projects', 'Temporarily Restricted', 1000.0000, 'active', 
     'Special projects fund', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- ACCOUNTS DATA (PART 1 - First 36 accounts)
-- -----------------------------------------------------------------------------

-- Insert TPF entity accounts (first set)
INSERT INTO accounts (id, entity_id, code, name, type, balance, status, created_at, updated_at) 
VALUES 
    ('0b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1000', 'Cash', 'Asset', 10000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('1b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1010', 'Checking Account', 'Asset', 25000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('2b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1020', 'Savings Account', 'Asset', 50000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('3b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1100', 'Accounts Receivable', 'Asset', 5000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('4b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1200', 'Inventory', 'Asset', 7500.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('5b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1300', 'Prepaid Expenses', 'Asset', 2500.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('6b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1500', 'Fixed Assets', 'Asset', 100000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('7b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1510', 'Equipment', 'Asset', 75000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('8b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1520', 'Furniture', 'Asset', 25000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('9b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '1600', 'Accumulated Depreciation', 'Asset', -50000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ab9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2000', 'Accounts Payable', 'Liability', 7500.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('bb9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2100', 'Accrued Expenses', 'Liability', 5000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('cb9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2200', 'Payroll Liabilities', 'Liability', 10000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('db9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2300', 'Unearned Revenue', 'Liability', 2500.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('eb9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2500', 'Long-term Liabilities', 'Liability', 100000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('fb9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2510', 'Mortgage Payable', 'Liability', 75000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('0c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2520', 'Notes Payable', 'Liability', 25000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('1c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '3000', 'Net Assets', 'Equity', 100000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('2c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '3100', 'Unrestricted Net Assets', 'Equity', 75000.0000, 'active', 
     '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert TPF entity accounts (second set)
INSERT INTO accounts (id, entity_id, code, name, type, balance, status, created_at, updated_at) 
VALUES 
    ('3c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '3200', 'Temporarily Restricted Net Assets', 'Equity', 20000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('4c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '3300', 'Permanently Restricted Net Assets', 'Equity', 5000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('5c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '4000', 'Revenue', 'Revenue', 200000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('6c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '4100', 'Donations', 'Revenue', 100000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('7c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '4200', 'Grants', 'Revenue', 75000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('8c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '4300', 'Program Service Fees', 'Revenue', 25000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('9c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5000', 'Expenses', 'Expense', 150000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ac9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5100', 'Salaries and Wages', 'Expense', 75000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('bc9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5200', 'Employee Benefits', 'Expense', 25000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('cc9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5300', 'Rent', 'Expense', 20000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('dc9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5400', 'Utilities', 'Expense', 10000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ec9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5500', 'Supplies', 'Expense', 7500.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('fc9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '5600', 'Professional Fees', 'Expense', 12500.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('0d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '1000', 'Cash', 'Asset', 5000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('1d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '1010', 'Checking Account', 'Asset', 15000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('2d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '1020', 'Savings Account', 'Asset', 25000.0000, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- End of sample-data-part1.sql
-- Continue with sample-data-part2.sql for the remaining accounts, journal entries, and banking module data
