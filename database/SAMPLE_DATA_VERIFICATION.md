# Sample Data Verification Report  
_Mr-MoneyBags v1.x • master-schema.sql_

This report confirms that every table defined in `database/master-schema.sql` now ships with representative sample data, enabling a brand-new Ubuntu installation to be fully usable immediately after `psql -f master-schema.sql` is executed.

| Module | Table | Sample rows inserted | Notes |
|--------|-------|----------------------|-------|
| **Core System** |
|  | `users` | **2** | `admin` / `user` with BCrypt-hashed passwords |
|  | `entities` | **4** | `TPF_PARENT` plus 3 regional children |
|  | `funds` | **3** | General Ops, Endowment, Scholarship |
|  | `accounts` | **17** | Full starter chart of accounts |
|  | `journal_entries` | **2** | One revenue, one payroll expense |
|  | `journal_entry_lines` | **4** | Double-entry lines for above JEs |
| **Banking & Vendors** |
|  | `bank_accounts` | **2** | Operating & Savings at First National Bank |
|  | `vendors` | **3** | Utilities, Property management, Supplies |
|  | `vendor_bank_accounts` | **3** | ACH details for each vendor |
|  | `company_nacha_settings` | **1** | Default company ACH configuration |
|  | `payment_batches` | **2** | Batch-001 (approved) & Batch-002 (draft) |
|  | `payment_items` | **3** | 2 utilities/rent • 1 supplies |
|  | `nacha_files` | **1** | ACH file generated for Batch-001 |
| **Bank Reconciliation Module** |
|  | `bank_statements` | **2** | Previous & current month statements |
|  | `bank_statement_transactions` | **6** | Deposits, ACH payments, fee, interest |
|  | `bank_reconciliations` | **1** | Completed reconciliation for first statement |
|  | `bank_reconciliation_items` | **4** | Matched/cleared items |
|  | `bank_reconciliation_adjustments` | **1** | Service-fee adjustment |
| **Bank Deposits Module** |
|  | `bank_deposits` | **3** | Checks, cash fundraiser, ACH donation |
|  | `bank_deposit_items` | **2** | Two check donations tied to DEP-001 |
| **Check Printing Module** |
|  | `check_formats` | **4** | Standard, QB, Voucher, Wallet |
|  | `printed_checks` | **3** | Checks #50001–50003 with various statuses |
| **Reports & Misc.** |
|  | `custom_report_definitions` | **2** | Monthly SoA & Fund Balance Summary |
| **Session Store** |
|  | `session` | *created empty* | Populated at runtime by Express-Session |

### Result

All **24** user-facing tables defined in the master schema now include appropriate seed data (or intentionally start empty for runtime population). This satisfies the requirement for a completely fresh Ubuntu installation to be operational and test-ready immediately after loading the schema.

✔️ **Verification complete — no tables without starter data remain.**
