-- =============================================================================
-- NONPROFIT FUND ACCOUNTING SYSTEM - COMPREHENSIVE SAMPLE DATA (PART 2 OF 2)
-- =============================================================================
-- This file contains the second part of comprehensive sample data for the 
-- Nonprofit Fund Accounting System, including:
--   1. Remaining accounts (36 of 72 total accounts)
--   2. Journal entries (23 entries from Mac export)
--   3. Journal entry items (line items)
--   4. Vendors data (3 vendors)
--   5. Banking module sample data (check formats, bank accounts)
--
-- IMPORTANT: This file should be run AFTER sample-data-part1.sql to ensure
-- all prerequisite data exists before inserting dependent records.
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
-- REMAINING ACCOUNTS DATA (Second 36 accounts)
-- -----------------------------------------------------------------------------

-- Insert TPF-ES entity accounts (remaining)
INSERT INTO accounts (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('3d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '1100', 'Accounts Receivable', 'Asset', 2500.0000, 'active', 
     'Amounts owed by customers', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('4d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '1200', 'Inventory', 'Asset', 5000.0000, 'active', 
     'Goods for sale', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('5d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2000', 'Accounts Payable', 'Liability', 5000.0000, 'active', 
     'Amounts owed to vendors', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('6d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2100', 'Accrued Expenses', 'Liability', 2500.0000, 'active', 
     'Expenses incurred but not yet paid', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('7d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '3000', 'Net Assets', 'Equity', 50000.0000, 'active', 
     'Net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('8d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '3100', 'Unrestricted Net Assets', 'Equity', 35000.0000, 'active', 
     'Unrestricted net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('9d9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '3200', 'Temporarily Restricted Net Assets', 'Equity', 15000.0000, 'active', 
     'Temporarily restricted net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ad9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '4000', 'Revenue', 'Revenue', 100000.0000, 'active', 
     'Revenue', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('bd9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '4100', 'Donations', 'Revenue', 50000.0000, 'active', 
     'Donations', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('cd9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '4200', 'Grants', 'Revenue', 35000.0000, 'active', 
     'Grant revenue', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert TPF-ES and IFCSN entity accounts
INSERT INTO accounts (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('dd9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '4300', 'Program Service Fees', 'Revenue', 15000.0000, 'active', 
     'Program service fees', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ed9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5000', 'Expenses', 'Expense', 75000.0000, 'active', 
     'Expenses', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('fd9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5100', 'Salaries and Wages', 'Expense', 35000.0000, 'active', 
     'Salaries and wages', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('0e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5200', 'Employee Benefits', 'Expense', 15000.0000, 'active', 
     'Employee benefits', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('1e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5300', 'Rent', 'Expense', 10000.0000, 'active', 
     'Rent expense', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('2e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5400', 'Utilities', 'Expense', 5000.0000, 'active', 
     'Utilities expense', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('3e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5500', 'Supplies', 'Expense', 5000.0000, 'active', 
     'Supplies expense', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('4e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '5600', 'Professional Fees', 'Expense', 5000.0000, 'active', 
     'Professional fees', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('5e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '1000', 'Cash', 'Asset', 2500.0000, 'active', 
     'Cash on hand', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('6e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '1010', 'Checking Account', 'Asset', 7500.0000, 'active', 
     'Main checking account', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert IFCSN entity accounts
INSERT INTO accounts (id, entity_id, code, name, type, balance, status, description, created_at, updated_at) 
VALUES 
    ('7e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '1020', 'Savings Account', 'Asset', 15000.0000, 'active', 
     'Savings account', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('8e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '1100', 'Accounts Receivable', 'Asset', 1000.0000, 'active', 
     'Amounts owed by customers', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('9e9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2000', 'Accounts Payable', 'Liability', 2500.0000, 'active', 
     'Amounts owed to vendors', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ae9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2100', 'Accrued Expenses', 'Liability', 1000.0000, 'active', 
     'Expenses incurred but not yet paid', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('be9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '3000', 'Net Assets', 'Equity', 25000.0000, 'active', 
     'Net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ce9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '3100', 'Unrestricted Net Assets', 'Equity', 15000.0000, 'active', 
     'Unrestricted net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('de9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '3200', 'Temporarily Restricted Net Assets', 'Equity', 10000.0000, 'active', 
     'Temporarily restricted net assets', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('ee9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '4000', 'Revenue', 'Revenue', 50000.0000, 'active', 
     'Revenue', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('fe9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '4100', 'Donations', 'Revenue', 25000.0000, 'active', 
     'Donations', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('0f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '4200', 'Grants', 'Revenue', 15000.0000, 'active', 
     'Grant revenue', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('1f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '4300', 'Program Service Fees', 'Revenue', 10000.0000, 'active', 
     'Program service fees', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('2f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '5000', 'Expenses', 'Expense', 35000.0000, 'active', 
     'Expenses', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('3f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '5100', 'Salaries and Wages', 'Expense', 15000.0000, 'active', 
     'Salaries and wages', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('4f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '5200', 'Employee Benefits', 'Expense', 7500.0000, 'active', 
     'Employee benefits', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('5f9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '5300', 'Rent', 'Expense', 5000.0000, 'active', 
     'Rent expense', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- JOURNAL ENTRIES DATA
-- -----------------------------------------------------------------------------

-- Insert journal entries for TPF entity
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, type, status, total_amount, is_inter_entity, created_by, created_at, updated_at) 
VALUES 
    ('c5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-01', 'JE-2025-001', 'Initial donation received', 'Donation', 'Posted', 10000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('d5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-02', 'JE-2025-002', 'Office supplies purchase', 'Expense', 'Posted', 500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-03', 'JE-2025-003', 'Rent payment for August', 'Expense', 'Posted', 2000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('f5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-04', 'JE-2025-004', 'Grant received from ABC Foundation', 'Grant', 'Posted', 25000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('05c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-05', 'JE-2025-005', 'Payroll for first half of August', 'Payroll', 'Posted', 7500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('15c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-06', 'JE-2025-006', 'Utility bills payment', 'Expense', 'Posted', 1000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('25c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-07', 'JE-2025-007', 'Program service fees collected', 'Revenue', 'Posted', 3500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('35c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-08', 'JE-2025-008', 'Professional services - accounting', 'Expense', 'Posted', 1500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('45c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-09', 'JE-2025-009', 'Donation from XYZ Corporation', 'Donation', 'Posted', 15000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('55c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', '2025-08-10', 'JE-2025-010', 'Equipment purchase', 'Asset Purchase', 'Posted', 5000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert journal entries for TPF-ES entity
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, type, status, total_amount, is_inter_entity, created_by, created_at, updated_at) 
VALUES 
    ('65c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-01', 'JE-ES-2025-001', 'Initial funding for educational services', 'Transfer', 'Posted', 5000.0000, true, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('75c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-02', 'JE-ES-2025-002', 'Educational materials purchase', 'Expense', 'Posted', 1500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('85c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-03', 'JE-ES-2025-003', 'Grant received for educational advocacy', 'Grant', 'Posted', 7500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('95c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-04', 'JE-ES-2025-004', 'Workshop fees collected', 'Revenue', 'Posted', 2500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('a6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-05', 'JE-ES-2025-005', 'Instructor payments', 'Expense', 'Posted', 3500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('b6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', '2025-08-06', 'JE-ES-2025-006', 'Office supplies for educational services', 'Expense', 'Posted', 750.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert journal entries for IFCSN entity
INSERT INTO journal_entries (id, entity_id, entry_date, reference_number, description, type, status, total_amount, is_inter_entity, created_by, created_at, updated_at) 
VALUES 
    ('c6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-01', 'JE-IFCSN-2025-001', 'Initial funding for IFCSN', 'Transfer', 'Posted', 2500.0000, true, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('d6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-02', 'JE-IFCSN-2025-002', 'Community support materials', 'Expense', 'Posted', 1000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-03', 'JE-IFCSN-2025-003', 'Grant for special projects', 'Grant', 'Posted', 5000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('f6c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-04', 'JE-IFCSN-2025-004', 'Community event fees', 'Revenue', 'Posted', 1500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('06c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-05', 'JE-IFCSN-2025-005', 'Coordinator payments', 'Expense', 'Posted', 2000.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('16c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c3f07c5d-c40f-4559-8875-111df6bf4248', '2025-08-06', 'JE-IFCSN-2025-006', 'Office supplies for community programs', 'Expense', 'Posted', 500.0000, false, 'admin', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- JOURNAL ENTRY ITEMS DATA
-- -----------------------------------------------------------------------------

-- Insert sample journal entry items for first journal entry (donation received)
INSERT INTO journal_entry_items (id, journal_entry_id, account_id, fund_id, description, debit, credit, created_at, updated_at)
VALUES
    ('d7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '1b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'bdd880a2-47d6-486f-bb47-3638c2b8cff3', 'Donation to checking account', 10000.00, 0.00, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'c5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '6c9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'bdd880a2-47d6-486f-bb47-3638c2b8cff3', 'Donation revenue', 0.00, 10000.00, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample journal entry items for second journal entry (supplies purchase)
INSERT INTO journal_entry_items (id, journal_entry_id, account_id, fund_id, description, debit, credit, created_at, updated_at)
VALUES
    ('f7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'ec9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'bdd880a2-47d6-486f-bb47-3638c2b8cff3', 'Office supplies expense', 500.00, 0.00, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('07c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd5c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '1b9e8c56-8c0f-4a7b-a7c0-3c7e6e2d7c0f', 'bdd880a2-47d6-486f-bb47-3638c2b8cff3', 'Payment from checking account', 0.00, 500.00, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- VENDORS DATA
-- -----------------------------------------------------------------------------

-- Insert vendors
INSERT INTO vendors (id, entity_id, vendor_code, name, tax_id, contact_name, email, phone, address_line1, city, state, postal_code, country, status, created_at, updated_at)
VALUES
    ('a7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'ACME-001', 'ACME Office Supplies', '12-3456789', 'John Smith', 'john@acmeoffice.com', '555-123-4567', '123 Main St', 'Anytown', 'CA', '90210', 'USA', 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('b7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'TECH-002', 'TechSolutions Inc.', '98-7654321', 'Jane Doe', 'jane@techsolutions.com', '555-987-6543', '456 Tech Blvd', 'Silicon Valley', 'CA', '94025', 'USA', 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('c7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'UTIL-003', 'City Utilities', '45-6789123', 'Robert Johnson', 'robert@cityutilities.com', '555-456-7890', '789 Power Ave', 'Metropolis', 'NY', '10001', 'USA', 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- -----------------------------------------------------------------------------
-- BANKING MODULE DATA
-- -----------------------------------------------------------------------------

-- Insert bank accounts
INSERT INTO bank_accounts (id, entity_id, bank_name, account_name, account_number, routing_number, type, balance, status, created_at, updated_at)
VALUES
    ('d7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'First National Bank', 'TPF Operating Account', '1234567890', '123456789', 'Checking', 25000.00, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7f33bfee-14fb-4562-8634-3e5ff8fc94ef', 'First National Bank', 'TPF Savings Account', '0987654321', '123456789', 'Savings', 50000.00, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('f7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '7c44acde-ecc6-4029-972e-2e5fae1c1f93', 'Community Trust Bank', 'TPF-ES Operating Account', '5678901234', '987654321', 'Checking', 15000.00, 'active', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert check formats
INSERT INTO check_formats (id, name, description, paper_size, orientation, check_position, is_default, created_at, updated_at)
VALUES
    ('07c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Standard Business Check', 'Standard business check format with check on top', 'letter', 'portrait', 'top', true, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('17c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Voucher Check', 'Voucher check with check in middle', 'letter', 'portrait', 'middle', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('27c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Three-Per-Page', 'Three checks per page format', 'letter', 'portrait', 'multiple', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('37c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Wallet Check', 'Personal wallet-sized check format', 'custom', 'landscape', 'full', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample bank statement
INSERT INTO bank_statements (id, bank_account_id, statement_date, beginning_balance, ending_balance, status, created_at, updated_at)
VALUES
    ('47c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-07-31', 20000.00, 25000.00, 'pending', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample bank statement transactions
INSERT INTO bank_statement_transactions (id, bank_statement_id, transaction_date, description, reference_number, amount, transaction_type, is_reconciled, created_at, updated_at)
VALUES
    ('57c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '47c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-07-15', 'Deposit - Donation', 'DEP12345', 10000.00, 'credit', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('67c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '47c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-07-20', 'Check #1001 - Office Supplies', 'CHK1001', 500.00, 'debit', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('77c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '47c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-07-25', 'Check #1002 - Rent', 'CHK1002', 2000.00, 'debit', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('87c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '47c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-07-28', 'Deposit - Grant', 'DEP12346', 7500.00, 'credit', false, '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample bank deposit
INSERT INTO bank_deposits (id, bank_account_id, deposit_date, deposit_number, description, total_amount, status, created_at, updated_at)
VALUES
    ('97c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-08-01', 'DEP-2025-001', 'Weekly donation deposit', 5000.00, 'pending', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample bank deposit items
INSERT INTO bank_deposit_items (id, deposit_id, item_type, amount, reference_number, payer_name, description, created_at, updated_at)
VALUES
    ('a8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '97c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Check', 2500.00, 'CHK9876', 'John Donor', 'Monthly donation', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('b8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '97c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Check', 1500.00, 'CHK5432', 'Jane Supporter', 'Program support', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('c8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '97c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'Cash', 1000.00, 'CASH001', 'Various Donors', 'Cash donations', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');

-- Insert sample printed check
INSERT INTO printed_checks (id, bank_account_id, check_number, payee_name, amount, check_date, memo, status, format_id, created_at, updated_at)
VALUES
    ('d8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '1001', 'ACME Office Supplies', 500.00, '2025-07-20', 'Office supplies purchase', 'cleared', '07c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('e8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '1002', 'City Properties LLC', 2000.00, '2025-07-25', 'August rent payment', 'cleared', '07c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839'),
    ('f8c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', 'd7c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '1003', 'City Utilities', 1000.00, '2025-08-06', 'Utility bills payment', 'printed', '07c3b2d1-e6f7-4a8b-9c0d-1e2f3a4b5c6d', '2025-08-05 20:02:58.415839', '2025-08-05 20:02:58.415839');
