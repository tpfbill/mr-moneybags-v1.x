# AccuFund → Mr. MoneyBags v1.x  
**Comprehensive Verification & Acceptance Procedure**

Use this document after completing data migration to confirm every feature of Mr. MoneyBags v1.x is working exactly as expected.  
Mark each check ☐/☑, record evidence (screenshot #/file), note issues, and obtain the required sign-offs.

---

## 0  Document Control
| Item | Value |
|------|-------|
| Version | 1.0 |
| Prepared by | San Francisco AI Factory – Migration Services |
| Date | 07 Aug 2025 |
| Environment | `PROD` / `SANDBOX` (circle) |
| AccuFund Source Version | 9.x |
| Acceptance Window | ___ / ___ / 2025 – ___ / ___ / 2025 |

---

## Legend
* ☐ = Not executed ☑ = Pass ✖ = Fail / Issue logged  
* 📸 = Screenshot or export saved in `/verification_evidence/YYYY-MM-DD/…`  
* 👤 Roles: **A**=Admin, **F**=Finance, **V**=Viewer  

---

## 1  Pre-Verification Setup
| # | Task | Steps | Expected | Role | Result |
|---|------|-------|----------|------|--------|
|1.1|System Requirements Confirmed|Ensure Node.js ≥ 20, PostgreSQL ≥ 15, 8 GB RAM, 4 CPU (macOS/Windows/Linux supported)|Meets or exceeds specs|A|☐|
|1.2|Access Accounts Created|Ensure **admin**, **finance1**, **viewer1** logins exist|All three users can reach login screen|A|☐|
|1.3|Backup Snapshot|Run `pg_dump -Fc` and VM snapshot|Files saved & hash logged|A|☐|
|1.4|Sample Data Verification|Verify all 24 tables have sample data|Each table has ≥ 5 records|A|☐|
|1.5|Network Configuration|Verify ports 8080 (frontend) and 3000 (API) are accessible|Connections succeed|A|☐|
|1.6|Application Startup Verified|Run `npm run setup` then `npm run dev`|Login screen loads at http://localhost:8080|A|☐|

---

## 2  Authentication & Security Verification
| # | Test Case | Steps | Expected | Role | ✔ |
|---|-----------|-------|----------|------|---|
|2.1|Password Hashing|Inspect `users.password_hash` length 60|Bcrypt hash present|A|☐|
|2.2|Session Persistence|Login as finance; navigate across multiple pages and tabs|Session maintained|F|☐|
|2.3|Role Visibility|Settings tab hidden for viewer|No nav item|V|☐|
|2.4|Change Password minimum length|Open Change Password, try a 6-character password|Rejected; requires ≥ 8 chars|F|☐|
|2.7|Session Persistence|Login, navigate to 5 different pages|Session maintained|F|☐|
|2.8|Cross-Site Access|Login, open new tab, access app|Session recognized|F|☐|
|2.9|Role Separation|Viewer attempts to access admin route directly|403 Forbidden|V|☐|
|2.10|Logout Function|Click logout button|Redirected to login page|A|☐|
|2.11|Session Invalidation|Logout, try back button|Login page, not app|F|☐|
|2.13|XSS Protection|Enter `<script>alert('test')</script>` in description|Rendered as text, not executed|F|☐|
|2.14|SQL Injection Protection|Enter `' OR 1=1 --` in search field|No data leak, proper error|F|☐|
|2.15|Admin Role Access|Admin accesses Settings → Users|Full CRUD access|A|☐|
|2.16|Finance Role Access|Finance attempts user management|Read-only or denied|F|☐|
|2.17|Viewer Role Access|Viewer attempts to post journal entry|Button disabled or hidden|V|☐|

Troubleshooting  
* Session not expiring → check `SESSION_STORE` table TTL
* Login issues → verify `connect-pg-simple` session table exists
* Role issues → check `requireRole` middleware in auth.js

---

## 3  Core Fund Accounting Verification
### 3.1 Chart of Accounts
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.1.1|Navigate Settings → Chart of Accounts|Full list equals `gl_accounts.csv` count|A|☐|
|3.1.2|Open random account "4000 – Donations"|Details match import sheet|F|☐|
|3.1.3|Attempt to inactivate account; cancel|Status unchanged|F|☐|
|3.1.4|Create new account|Successfully added|A|☐|
|3.1.5|Edit existing account|Changes saved|A|☐|
|3.1.6|Filter accounts by classifications|Only matching accounts shown|F|☐|
|3.1.7|Search for account by description|Matching accounts shown|F|☐|
|3.1.8|Export account list to CSV|File downloads with all accounts|A|☐|
|3.1.9|Attempt to delete account with transactions|Error message shown|A|☐|
|3.1.10|Inactivate unused account|Status changes to Inactive|A|☐|

### 3.2 Funds & Entities
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.2.1|Funds page shows total funds = source file|Count correct|F|☐|
|3.2.2|Select Child Entity, Consolidated toggle|Balances refresh without error|F|☐|
|3.2.3|Create new fund|Successfully added|A|☐|
|3.2.4|Edit existing fund|Changes saved|A|☐|
|3.2.5|Verify fund hierarchy|Parent-child relationships correct|F|☐|
|3.2.6|Filter funds by type|Only matching funds shown|F|☐|
|3.2.7|Create entity with parent|Hierarchy updated correctly|A|☐|
|3.2.8|Enable "Consolidate Children" on entity|Flag set in database|A|☐|
|3.2.9|View entity hierarchy visualization|Matches database structure|A|☐|
|3.2.10|Change entity currency|Updates without errors|A|☐|

### 3.3 Journal Entries
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.3.1|Create test JE $100 Dr/Cr, save draft|Status = Draft|F|☐|
|3.3.2|Post the JE|Trial Balance unchanged (nets 0)|F|☐|
|3.3.3|Viewer attempts to create JE|Permission denied|V|☐|
|3.3.4|Create multi-line JE|Debits = Credits, saves successfully|F|☐|
|3.3.5|Create inter-entity JE|Creates mirror entry in target entity|F|☐|
|3.3.6|Edit draft JE|Changes saved|F|☐|
|3.3.7|Attempt to edit posted JE|Not allowed or creates adjustment|F|☐|
|3.3.8|Import JE batch from CSV|All entries imported correctly|A|☐|
|3.3.9|Reverse posted JE|Creates offsetting entry|F|☐|
|3.3.10|Filter JE by date range|Only matching entries shown|F|☐|
|3.3.11|Search JE by description|Matching entries shown|F|☐|
|3.3.12|Export JE list to CSV|File downloads with all entries|F|☐|
|3.3.13|Verify JE audit trail|Shows creator, approver, timestamps|A|☐|
|3.3.14|Create recurring JE template|Template saved|F|☐|
|3.3.15|Generate JE from template|Creates new draft JE|F|☐|

Common Issues  
* **Out-of-balance** → check COA mapping
* **Save error** → browser cache; hard refresh
* **Inter-entity issues** → verify matching accounts exist in both entities

---

## 4  Banking Module Verification
### 4.1 Bank Reconciliation
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.1.1|Upload sample OFX (`/samples/ofx/bofa.ofx`)|Transactions listed|F|☐|
|4.1.2|Auto-match|95%+ items auto-matched|F|☐|
|4.1.3|Finish reconciliation|Status = "Reconciled" report PDF generated|F|☐|
|4.1.4|Create manual match|Transaction matched to bank statement|F|☐|
|4.1.5|Create reconciliation adjustment|Adjustment JE created automatically|F|☐|
|4.1.6|Upload CSV statement|Parsed correctly with all transactions|F|☐|
|4.1.7|Save reconciliation in progress|Work saved, can resume later|F|☐|
|4.1.8|Generate reconciliation report|PDF shows all matched/unmatched items|F|☐|
|4.1.9|View reconciliation history|Previous reconciliations listed|F|☐|
|4.1.10|Verify statement balance calculation|Matches bank statement to penny|F|☐|
|4.1.11|Unmatch transaction|Returns to unmatched list|F|☐|
|4.1.12|Test drag-and-drop matching|Transaction matched via drag-drop|F|☐|
|4.1.13|Filter transactions by amount|Only matching transactions shown|F|☐|
|4.1.14|Search transactions by description|Matching transactions shown|F|☐|
|4.1.15|Mark item as cleared without statement|Item status updates to Cleared|F|☐|

### 4.2 Bank Deposits
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.2.1|Create deposit with 3 items|Total equals item sum|F|☐|
|4.2.2|Mark deposit cleared|Cleared date populated|F|☐|
|4.2.3|Generate deposit slip|PDF formatted correctly|F|☐|
|4.2.4|Add check to deposit|Item added, total updated|F|☐|
|4.2.5|Add cash to deposit|Item added, total updated|F|☐|
|4.2.6|Edit deposit item|Changes saved, total updated|F|☐|
|4.2.7|Remove deposit item|Item removed, total updated|F|☐|
|4.2.8|Submit deposit for approval|Status changes to Pending|F|☐|
|4.2.9|Approve deposit|Status changes to Approved|A|☐|
|4.2.10|View deposit history|All deposits listed with status|F|☐|
|4.2.11|Filter deposits by status|Only matching deposits shown|F|☐|
|4.2.12|Search deposits by description|Matching deposits shown|F|☐|
|4.2.13|Export deposit list to CSV|File downloads with all deposits|F|☐|
|4.2.14|Verify deposit JE creation|JE created with correct accounts|F|☐|
|4.2.15|Print multiple deposit slips|Batch printing works|F|☐|

### 4.3 Check Printing
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.3.1|Add check, send to Print Queue|Queue count +1|F|☐|
|4.3.2|Print to "PDF Printer" test|PDF contains MICR line|F|☐|
|4.3.3|Create new check format|Format saved with dimensions|A|☐|
|4.3.4|Edit check format|Changes saved|A|☐|
|4.3.5|Set default check format|Format set as default|A|☐|
|4.3.6|Print single check|Check prints correctly|F|☐|
|4.3.7|Print batch of checks|All checks print with correct numbers|F|☐|
|4.3.8|Void check|Status changes to Void|F|☐|
|4.3.9|Reprint voided check|New check number assigned|F|☐|
|4.3.10|View check register|All checks listed with status|F|☐|
|4.3.11|Filter checks by status|Only matching checks shown|F|☐|
|4.3.12|Search checks by payee|Matching checks shown|F|☐|
|4.3.13|Export check register to CSV|File downloads with all checks|F|☐|
|4.3.14|Verify check number sequence|No duplicates or gaps|F|☐|
|4.3.15|Test amount-to-words conversion|"$1,234.56" → "One thousand two hundred thirty-four and 56/100"|F|☐|

### 4.4 Bank Accounts Management
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.4.1|Add new bank account|Account created|A|☐|
|4.4.2|Edit bank account details|Changes saved|A|☐|
|4.4.3|Inactivate bank account|Status changes to Inactive|A|☐|
|4.4.4|Verify routing number validation|Invalid routing numbers rejected|A|☐|
|4.4.5|Set default bank account|Account set as default|A|☐|
|4.4.6|View bank account list|All accounts listed|A|☐|
|4.4.7|Filter bank accounts by type|Only matching accounts shown|A|☐|
|4.4.8|Search bank accounts by name|Matching accounts shown|A|☐|
|4.4.9|Export bank account list|File downloads with all accounts|A|☐|
|4.4.10|Verify account balance calculation|Matches GL balance|A|☐|

---

## 5  Vendor Payment Verification
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|5.1|Add bank info to vendor ACME|Routing validation passes|A|☐|
|5.2|Generate ACH batch for 2 vendors|NACHA file created, status "Generated"|F|☐|
|5.3|Viewer attempts NACHA download|Access denied|V|☐|
|5.4|Create new vendor|Vendor added to database|A|☐|
|5.5|Edit vendor details|Changes saved|A|☐|
|5.6|Add multiple bank accounts to vendor|Accounts added, can select default|A|☐|
|5.7|Create payment batch|Batch created with selected vendors|F|☐|
|5.8|Edit payment batch|Changes saved|F|☐|
|5.9|Approve payment batch|Status changes to Approved|A|☐|
|5.10|Generate NACHA file|File created with correct format|F|☐|
|5.11|Verify NACHA file contents|Header/detail/footer records correct|F|☐|
|5.12|Mark batch as sent|Status changes to Sent|F|☐|
|5.13|Mark payments as cleared|Status changes to Cleared|F|☐|
|5.14|View payment history|All payments listed with status|F|☐|
|5.15|Filter payments by status|Only matching payments shown|F|☐|
|5.16|Search payments by vendor|Matching payments shown|F|☐|
|5.17|Export payment list to CSV|File downloads with all payments|F|☐|
|5.18|Verify payment JE creation|JE created with correct accounts|F|☐|
|5.19|Test prenote generation|Zero-dollar prenote created|F|☐|
|5.20|Verify vendor 1099 settings|Tax settings saved correctly|A|☐|

---

## 6  Reporting Verification
### 6.1 Standard Financial Reports
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.1.1|Run Income Statement (YTD)|Matches AccuFund totals ±1¢|F|☐|
|6.1.2|Run Balance Sheet|Assets = Liabilities + Equity|F|☐|
|6.1.3|Run Cash Flow Statement|Beginning + Net = Ending Cash|F|☐|
|6.1.4|Run Trial Balance|Debits = Credits|F|☐|
|6.1.5|Run Budget vs. Actual|Variance calculated correctly|F|☐|
|6.1.6|Export report to PDF|PDF generated correctly|F|☐|
|6.1.7|Export report to Excel|Excel file contains all data|F|☐|
|6.1.8|Filter report by date range|Only matching data shown|F|☐|
|6.1.9|Filter report by fund|Only matching data shown|F|☐|
|6.1.10|Run consolidated report|All entities included|F|☐|

### 6.2 Custom Reports
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.2.1|Custom Report Builder – build pivot|CSV downloads|A|☐|
|6.2.2|Create tabular report|Report displays correctly|F|☐|
|6.2.3|Add calculated column|Formula calculates correctly|F|☐|
|6.2.4|Add grouping/subtotals|Groups and totals display correctly|F|☐|
|6.2.5|Add chart to report|Chart renders correctly|F|☐|
|6.2.6|Save custom report|Report saved and appears in list|F|☐|
|6.2.7|Edit saved report|Changes saved|F|☐|
|6.2.8|Schedule recurring report|Schedule saved|A|☐|
|6.2.9|Export custom report to PDF|PDF generated correctly|F|☐|
|6.2.10|Share report with other users|Users can access shared report|A|☐|

### 6.3 Natural Language Queries
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.3.1|Natural Language Query "Show restricted fund balances"|Table returns ≥1 row|V|☐|
|6.3.2|Query "Top 5 expenses last month"|Shows 5 highest expenses|F|☐|
|6.3.3|Query "Revenue by month this year"|Shows monthly breakdown|F|☐|
|6.3.4|Query "Balance sheet as of last quarter"|Generates balance sheet|F|☐|
|6.3.5|Query "Cash position trend"|Shows trend chart|F|☐|
|6.3.6|Save query as favorite|Query saved to favorites list|F|☐|
|6.3.7|Export query results to CSV|File downloads with all results|F|☐|
|6.3.8|Query with entity filter|Results filtered by entity|F|☐|
|6.3.9|Query with date range|Results filtered by date|F|☐|
|6.3.10|Query with complex condition|Results match condition|F|☐|

### 6.4 Fund Reports
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.4.1|Run Fund Balance Report|Balances match GL|F|☐|
|6.4.2|Run Fund Activity Report|Activity matches JEs|F|☐|
|6.4.3|Run Fund Statement Report|Statement balances correctly|F|☐|
|6.4.4|Run Funds Comparison Report|All funds included|F|☐|
|6.4.5|Filter fund report by date|Only matching data shown|F|☐|
|6.4.6|Export fund report to PDF|PDF generated correctly|F|☐|
|6.4.7|Export fund report to Excel|Excel file contains all data|F|☐|
|6.4.8|Run report for restricted funds|Only restricted funds shown|F|☐|
|6.4.9|Run report with fund hierarchy|Parent-child relationships shown|F|☐|
|6.4.10|Verify fund balance calculation|Matches GL balance|F|☐|

---

## 7  Utility Features Verification
### 7.1 Inter-Entity Transfer Wizard
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.1.1|Create $50 transfer between entities|Creates two mirror JEs|F|☐|
|7.1.2|Verify due to/due from accounts|Accounts balanced between entities|F|☐|
|7.1.3|Transfer with different currencies|Exchange rate applied correctly|F|☐|
|7.1.4|Transfer with memo|Memo appears in both JEs|F|☐|
|7.1.5|View transfer history|All transfers listed|F|☐|
|7.1.6|Filter transfers by entity|Only matching transfers shown|F|☐|
|7.1.7|Search transfers by description|Matching transfers shown|F|☐|
|7.1.8|Export transfer list to CSV|File downloads with all transfers|F|☐|
|7.1.9|Verify transfer JE creation|JEs created with correct accounts|F|☐|
|7.1.10|Reverse transfer|Creates offsetting entries|F|☐|

### 7.2 Dashboard Features
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.2.1|Dashboard loads with charts|All charts render|F|☐|
|7.2.2|Fund Balance Trends chart|Shows correct trend|F|☐|
|7.2.3|Income vs Expenses chart|Shows correct comparison|F|☐|
|7.2.4|Fund Distribution chart|Shows correct distribution|F|☐|
|7.2.5|Recent Transactions panel|Shows latest transactions|F|☐|
|7.2.6|Unposted Entries panel|Shows draft entries|F|☐|
|7.2.7|Change date range on charts|Charts update with new data|F|☐|
|7.2.8|Print dashboard|PDF generated correctly|F|☐|
|7.2.9|Dashboard with entity filter|Data filtered by entity|F|☐|
|7.2.10|Dashboard with consolidated view|Shows consolidated data|F|☐|

### 7.3 Default Financial Reports
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.3.1|Access Default Reports page|Page loads with report list|F|☐|
|7.3.2|Run Statement of Financial Position|Report generates correctly|F|☐|
|7.3.3|Run Statement of Activities|Report generates correctly|F|☐|
|7.3.4|Run Statement of Functional Expenses|Report generates correctly|F|☐|
|7.3.5|Run Statement of Cash Flows|Report generates correctly|F|☐|
|7.3.6|Export report to PDF|PDF generated correctly|F|☐|
|7.3.7|Export report to Excel|Excel file contains all data|F|☐|
|7.3.8|Filter report by date range|Only matching data shown|F|☐|
|7.3.9|Filter report by fund|Only matching data shown|F|☐|
|7.3.10|Print report|Report prints correctly|F|☐|

---

## 8  User Interface Verification
| # | Check | Steps | Expected | ✔ |
|---|-------|-------|----------|---|
|8.1|Navigation|Tab through all nav items|No 404 / JS errors|☐|
|8.2|Responsive|Resize to 375 px width|Menu collapses to hamburger|☐|
|8.3|Accessibility|Run Lighthouse a11y audit|Score ≥ 90|☐|
|8.4|Color Contrast|Check text/background contrast|WCAG AA compliant|☐|
|8.5|Keyboard Navigation|Navigate using Tab key only|All functions accessible|☐|
|8.6|Screen Reader|Test with screen reader|Content properly announced|☐|
|8.7|Form Validation|Submit form with errors|Clear error messages shown|☐|
|8.8|Modal Dialogs|Open and close all modals|Open/close without errors|☐|
|8.9|Toast Notifications|Trigger success/error messages|Messages appear and auto-dismiss|☐|
|8.10|Loading Indicators|Load data-heavy pages|Spinner shown during load|☐|
|8.11|Table Sorting|Click column headers|Data sorts correctly|☐|
|8.12|Table Filtering|Use filter controls|Data filters correctly|☐|
|8.13|Table Pagination|Navigate between pages|Page changes, data loads|☐|
|8.14|Form Reset|Click reset/cancel buttons|Form returns to initial state|☐|
|8.15|Print Layouts|Print various pages|Print-friendly formatting applied|☐|
|8.16|Back to Dashboard buttons|Click on all banking pages|Returns to dashboard|☐|
|8.17|Entity Selector|Change selected entity|UI updates with entity data|☐|
|8.18|Consolidated View Toggle|Toggle consolidated view|UI updates with consolidated data|☐|
|8.19|Tab Navigation|Click tabs in multi-tab interfaces|Tab content changes correctly|☐|
|8.20|Help Tooltips|Hover over help icons|Tooltips appear with helpful text|☐|

---

## 9  Data Integrity Verification
| # | Procedure | Expected | ✔ |
|---|-----------|----------|---|
|9.1|Debit = Credit|`sp_verify_trial_balance()` returns 0 variance|☐|
|9.2|Fund restriction check|Restricted funds have zero negative balances|☐|
|9.3|Audit trail|Open JE history shows create/post user & timestamp|☐|
|9.4|Bank reconciliation integrity|`sp_verify_bank_reconciliation()` returns 0 variance|☐|
|9.5|Inter-entity balancing|`sp_verify_interentity_balances()` returns 0 variance|☐|
|9.6|Vendor payment integrity|Payment amounts match invoices|☐|
|9.7|Check number sequence|No duplicate check numbers|☐|
|9.8|Bank deposit integrity|Deposit totals match items|☐|
|9.9|NACHA file integrity|File passes ACH validator|☐|
|9.10|Foreign key integrity|No orphaned records|☐|
|9.11|Unique constraints|No duplicate key violations|☐|
|9.12|Check constraints|All constraints enforced|☐|
|9.13|Null constraints|Required fields not null|☐|
|9.14|Data type integrity|Values match expected types|☐|
|9.15|Database indexes|All indexes present and optimized|☐|

### 9.16 New Table Verification
| # | Table | Verification | Expected | ✔ |
|---|-------|--------------|----------|---|
|9.16.1|`bank_statements`|Count records, check structure|≥5 records, all columns present|☐|
|9.16.2|`bank_statement_transactions`|Count records, check structure|≥20 records, all columns present|☐|
|9.16.3|`bank_reconciliations`|Count records, check structure|≥3 records, all columns present|☐|
|9.16.4|`bank_reconciliation_items`|Count records, check structure|≥15 records, all columns present|☐|
|9.16.5|`bank_reconciliation_adjustments`|Count records, check structure|≥2 records, all columns present|☐|
|9.16.6|`bank_deposits`|Count records, check structure|≥5 records, all columns present|☐|
|9.16.7|`bank_deposit_items`|Count records, check structure|≥15 records, all columns present|☐|
|9.16.8|`check_formats`|Count records, check structure|≥4 records, all columns present|☐|
|9.16.9|`printed_checks`|Count records, check structure|≥10 records, all columns present|☐|
|9.16.10|`vendor_bank_accounts`|Count records, check structure|≥8 records, all columns present|☐|
|9.16.11|`payment_items`|Count records, check structure|≥12 records, all columns present|☐|
|9.16.12|`nacha_files`|Count records, check structure|≥3 records, all columns present|☐|
|9.16.13|`session`|Count records, check structure|≥1 record, all columns present|☐|

---

## 10  Performance Verification
| # | Scenario | Metric | Pass Threshold | ✔ |
|---|----------|--------|----------------|---|
|10.1|Login under 20 concurrent users|Avg < 2 s page load|< 2 s|☐|
|10.2|Generate 10 k line JE import|Process < 60 s|< 60 s|☐|
|10.3|Dashboard initial load|Page load time|< 3 s|☐|
|10.4|Chart of Accounts (1000+ accounts)|Page load time|< 2 s|☐|
|10.5|Journal Entry list (10000+ entries)|Page load time|< 3 s|☐|
|10.6|Bank Reconciliation with 500+ transactions|Auto-match time|< 10 s|☐|
|10.7|Generate Income Statement (12 months)|Report generation time|< 5 s|☐|
|10.8|Custom Report with 20+ columns|Report generation time|< 8 s|☐|
|10.9|Natural Language Query processing|Response time|< 3 s|☐|
|10.10|NACHA file generation (100+ payments)|Processing time|< 5 s|☐|
|10.11|Print batch of 50 checks|Processing time|< 15 s|☐|
|10.12|Database backup (100 MB database)|Backup time|< 30 s|☐|
|10.13|Database restore (100 MB backup)|Restore time|< 60 s|☐|
|10.14|API response time (95th percentile)|Response time|< 500 ms|☐|
|10.15|Memory usage under load|Max memory usage|< 4 GB|☐|
|10.16|CPU usage under load|Max CPU usage|< 80%|☐|
|10.17|Database connection pool|Max connections|< 80% of pool|☐|
|10.18|Network throughput|Bandwidth usage|< 10 Mbps|☐|
|10.19|Disk I/O|IOPS|< 1000|☐|
|10.20|Full system load test (50 users)|Response time degradation|< 25%|☐|

---

## 11  Documentation & Help Verification
| # | Test | Expected | ✔ |
|---|------|----------|---|
|11.1|Administrator Guide v1.x|PDF accessible, content complete|☐|
|11.2|User Guide v1.x|PDF accessible, content complete|☐|
|11.3|Installation Guide|PDF accessible, steps accurate|☐|
|11.4|Migration Guide v1.x|PDF accessible, steps accurate|☐|
|11.5|Migration Steps v1.x|PDF accessible, checklist complete|☐|
|11.6|Interactive ER Diagram|Diagram loads, matches database|☐|
|11.7|Backend Architecture Diagram|Diagram loads, shows all components|☐|
|11.8|Frontend Architecture Diagram|Diagram loads, shows all components|☐|
|11.9|In-app help tooltips|Present on complex fields|☐|
|11.10|Error messages|Clear, actionable guidance|☐|
|11.11|Form field validation messages|Clear instructions on requirements|☐|
|11.12|Documentation links|All links work, no 404 errors|☐|
|11.13|Documentation search|Search returns relevant results|☐|
|11.14|Documentation printability|Print formatting correct|☐|
|11.15|Documentation completeness|All features documented|☐|

---

## 12  Backup & Recovery Verification
| # | Test | Steps | Expected | ✔ |
|---|------|-------|----------|---|
|12.1|Automated nightly dump|Check cron log|Dump file timestamp < 24 h|☐|
|12.2|Restore to sandbox|`pg_restore` succeeds, app starts|No errors|☐|
|12.3|Manual backup|Run `pg_dump` command|Backup completes successfully|☐|
|12.4|Point-in-time recovery|Restore to specific timestamp|Data matches expected state|☐|
|12.5|Backup encryption|Verify backup file is encrypted|Cannot read without decryption|☐|
|12.6|Backup compression|Check backup file size|Compressed smaller than raw data|☐|
|12.7|Backup transfer to offsite|Check transfer logs|File transferred successfully|☐|
|12.8|Backup retention|Check backup history|Matches retention policy|☐|
|12.9|Backup verification|Validate backup integrity|Passes integrity check|☐|
|12.10|Disaster recovery test|Full restore from backup|System fully operational|☐|

---

## 13  Final Acceptance Testing
### 13.1 End-to-End Workflows
| # | Workflow | Steps | Expected | ✔ |
|---|----------|-------|----------|---|
|13.1.1|Full Accounting Cycle|Create JE → Post → Run Reports|Reports reflect JE|☐|
|13.1.2|Banking Cycle|Deposit → Check → Reconcile|All items reconciled|☐|
|13.1.3|Vendor Payment Cycle|Create Vendor → Payment → NACHA|File generated correctly|☐|
|13.1.4|Reporting Cycle|Run standard reports → Custom report → Export|All reports generate correctly|☐|
|13.1.5|User Management Cycle|Create user → Assign role → Login as user|User can access appropriate features|☐|
|13.1.6|Entity Management Cycle|Create entity → Fund → JE → Consolidated report|Entity included in consolidation|☐|
|13.1.7|Bank Reconciliation Cycle|Import statement → Match → Reconcile → Report|Reconciliation balances|☐|
|13.1.8|Check Printing Cycle|Create check → Print → Void → Reprint|All steps complete successfully|☐|
|13.1.9|Custom Reporting Cycle|Build report → Save → Schedule → Receive|Report delivered as scheduled|☐|
|13.1.10|Inter-Entity Transfer Cycle|Create transfer → Verify JEs → Consolidated report|Transfer reflected correctly|☐|

### 13.2 Stakeholder Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Finance Lead | | | |
| IT Lead | | | |
| Executive Sponsor | | | |

> All sections must be ☑ Pass before production cut-over.

---

## Appendix A – Troubleshooting Reference
| Area | Symptom | Likely Cause | Resolution |
|------|---------|-------------|------------|
|Auth|Logout loop|Missing `credentials:'include'`|Clear cache, redeploy JS|
|Banking|Check misaligned|Printer DPI|Adjust X/Y offsets|
|ACH|Bank rejects file|Immediate Origin wrong|Update Settings → ACH|
|Reconciliation|Items won't match|Date format mismatch|Check date parsing in import|
|Reports|Slow generation|Missing index|Add index to reporting tables|
|Performance|Slow page loads|Missing JS bundling|Enable production mode|
|Database|Connection errors|Connection pool exhausted|Increase pool size|
|UI|Form won't submit|Client-side validation|Check browser console errors|
|Security|Session expires too quickly|TTL setting too low|Adjust session timeout|
|API|404 errors|Route order conflict|Check route definitions|

---

## Appendix B – Test Data Reference
| Test Area | Sample Data Location | Contents |
|-----------|----------------------|----------|
|Bank Reconciliation|`/samples/bank/statements/`|OFX, CSV, and QFX samples|
|Vendor Payments|`/samples/vendors/`|Vendor CSV import templates|
|Check Printing|`/samples/checks/`|Sample check formats|
|Journal Entries|`/samples/journal/`|Sample JE import files|
|Reports|`/samples/reports/`|Sample report definitions|
|Users|`/samples/users/`|Sample user import template|

---

© 2025 San Francisco AI Factory · All rights reserved.
