# AccuFund → Mr. MoneyBags v1.x  
**Comprehensive Verification & Acceptance Procedure**

Use this end-to-end checklist to confirm that every capability of Mr. MoneyBags v1.x functions correctly after migration from AccuFund 9.x.  
Mark each item ☐/☑, attach evidence (📸 screenshot or export file name), record issues, and obtain final sign-off.

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

* ☐ = Not executed ☑ = Pass ✖ = Fail / Issue logged  
* 📸 = Evidence stored in `/verification_evidence/…`  
* 👤 Roles: **A** = Admin, **F** = Finance, **V** = Viewer  

---

## 1  Pre-Verification Setup (6 tests)

| # | Task | Steps | Expected | Role | Result |
|---|------|-------|----------|------|--------|
|1.1|System requirements confirmed|Check Ubuntu 24 LTS, Docker ≥ 24, 8 GB RAM, 4 vCPU|Meets specs|A|☐|
|1.2|User accounts created|Verify *admin*, *finance1*, *viewer1* can reach login|All accounts working|A|☐|
|1.3|Backup snapshot|Run `pg_dump -Fc` and VM snapshot|Files saved & hash logged|A|☐|
|1.4|Sample data loaded|All 24 tables contain ≥ 5 rows|Counts correct|A|☐|
|1.5|Network accessibility|Ports 3000, 5432 reachable from client VLAN|Telnet succeeds|A|☐|
|1.6|SSL certificate valid|Access app via HTTPS|No browser warning|A|☐|

---

## 2  Authentication & Security Verification (17 tests)

| # | Test Case | Steps | Expected | Role | ✔ |
|---|-----------|-------|----------|------|---|
|2.1|Password hashing|Inspect `users.password_hash` length|Bcrypt 60-char hash|A|☐|
|2.2|Session timeout|Idle 35 min|Forced logout|F|☐|
|2.3|Role visibility|Viewer menu lacks Settings|No Settings tab|V|☐|
|2.4|Failed logins lockout|Enter wrong pwd 5×|Account locked 15 min|A|☐|
|2.5|Password reset flow|Use “Forgot Password”|Reset email sent|F|☐|
|2.6|Password complexity|Set “password123”|Rejected|F|☐|
|2.7|Session persistence|Navigate 5 pages|Session retained|F|☐|
|2.8|Cross-tab session|Open new tab|Still authenticated|F|☐|
|2.9|Direct admin route|Viewer hits `/api/users`|403 Forbidden|V|☐|
|2.10|Logout button|Click user dropdown → Logout|Redirect to login|A|☐|
|2.11|Back-button after logout|Press browser ←|Remains logged out|F|☐|
|2.12|CSRF token check|Inspect POST forms|Token present|A|☐|
|2.13|XSS protection|Input `<script>`|Rendered as text|F|☐|
|2.14|SQL injection|Enter `' OR 1=1--` in search|No data leak|F|☐|
|2.15|Admin CRUD users|Create user Jane D.|User appears in list|A|☐|
|2.16|Finance user rights|Finance cannot delete user|Action denied|F|☐|
|2.17|Viewer JE post|Viewer tries to post JE|Button disabled|V|☐|

---

## 3  Core Fund Accounting Verification (45 tests)

### 3.1 Chart of Accounts (10 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.1.1|Open COA list|Count = CSV import|A|☐|
|3.1.2|View acct 4000|Details match source|F|☐|
|3.1.3|Inactivate then cancel|Status unchanged|F|☐|
|3.1.4|Create new acct|Added successfully|A|☐|
|3.1.5|Edit acct|Changes saved|A|☐|
|3.1.6|Filter by type|List filtered|F|☐|
|3.1.7|Search by name|Matches displayed|F|☐|
|3.1.8|Export to CSV|File downloads|A|☐|
|3.1.9|Delete acct w/ history|Error shown|A|☐|
|3.1.10|Inactivate unused acct|Status → Inactive|A|☐|

### 3.2 Funds & Entities (10 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.2.1|Funds count|Matches source|F|☐|
|3.2.2|Toggle consolidated|Balances refresh|F|☐|
|3.2.3|Create fund|Added|A|☐|
|3.2.4|Edit fund|Saved|A|☐|
|3.2.5|Check hierarchy|Parent-child correct|F|☐|
|3.2.6|Filter funds|Filtered list|F|☐|
|3.2.7|Add entity w/ parent|Hierarchy updated|A|☐|
|3.2.8|Enable consolidate flag|Flag stored|A|☐|
|3.2.9|Entity graph view|Matches DB|A|☐|
|3.2.10|Change entity currency|No error|A|☐|

### 3.3 Journal Entries (15 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.3.1|Create $100 JE draft|Status Draft|F|☐|
|3.3.2|Post JE|Trial balance nets 0|F|☐|
|3.3.3|Viewer create JE|Denied|V|☐|
|3.3.4|Multi-line JE|Debits=Credits|F|☐|
|3.3.5|Inter-entity JE|Mirror created|F|☐|
|3.3.6|Edit draft|Saved|F|☐|
|3.3.7|Edit posted|Not allowed|F|☐|
|3.3.8|Import JE batch CSV|Imported|A|☐|
|3.3.9|Reverse posted JE|Offset created|F|☐|
|3.3.10|Filter by date|Filtered list|F|☐|
|3.3.11|Search description|Matches|F|☐|
|3.3.12|Export JE list|CSV|F|☐|
|3.3.13|Audit trail|Shows user/time|A|☐|
|3.3.14|Create recurring template|Template saved|F|☐|
|3.3.15|Generate from template|Draft created|F|☐|

### 3.4 Budgets & Allocations (10 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.4.1|Load budget list|Page loads|F|☐|
|3.4.2|Create budget|Added|A|☐|
|3.4.3|Edit line|Saved|F|☐|
|3.4.4|Import budget CSV|Rows imported|A|☐|
|3.4.5|Lock budget|Status Locked|A|☐|
|3.4.6|Allocate budget|JE created|A|☐|
|3.4.7|Copy last year|Data copied|A|☐|
|3.4.8|Variance report|Variance correct|F|☐|
|3.4.9|Export budget|CSV|F|☐|
|3.4.10|Delete unused budget|Removed|A|☐|

---

## 4  Banking Module Verification (40 tests)

*4.1 Bank Reconciliation – 15 tests (see Sec 3)*  
*Already covered in JE; continue with deposits, checks, account mgmt.*

### 4.1 Bank Reconciliation (15 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.1.1|Upload OFX sample|Transactions listed|F|☐|
|4.1.2|Auto-match|≥ 95 % matched|F|☐|
|4.1.3|Complete reconcile|Status Reconciled|F|☐|
|4.1.4|Manual match|Success|F|☐|
|4.1.5|Add adjustment JE|JE auto-posted|F|☐|
|4.1.6|Upload CSV stmt|Parsed|F|☐|
|4.1.7|Save progress|Draft saved|F|☐|
|4.1.8|Generate report|PDF generated|F|☐|
|4.1.9|View history|List shows entry|F|☐|
|4.1.10|Verify balances|Match bank stmt|F|☐|
|4.1.11|Unmatch txn|Returned|F|☐|
|4.1.12|Drag-drop match|Works|F|☐|
|4.1.13|Filter amount|Filtered list|F|☐|
|4.1.14|Search description|Matches|F|☐|
|4.1.15|Mark cleared item|Status Cleared|F|☐|

### 4.2 Bank Deposits (15 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.2.1|Create deposit 3 items|Total correct|F|☐|
|4.2.2|Mark cleared|Cleared date set|F|☐|
|4.2.3|Generate slip PDF|Slip formatted|F|☐|
|4.2.4|Add check item|Total updates|F|☐|
|4.2.5|Add cash item|Total updates|F|☐|
|4.2.6|Edit item|Saved|F|☐|
|4.2.7|Remove item|Total updates|F|☐|
|4.2.8|Submit approval|Status Pending|F|☐|
|4.2.9|Approve|Status Approved|A|☐|
|4.2.10|History list|Shows deposit|F|☐|
|4.2.11|Filter status|Filtered|F|☐|
|4.2.12|Search desc|Matches|F|☐|
|4.2.13|Export CSV|File|F|☐|
|4.2.14|Verify JE|Correct accounts|F|☐|
|4.2.15|Batch print slips|Works|F|☐|

### 4.3 Check Printing (10 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.3.1|Add check→Queue|Queue +1|F|☐|
|4.3.2|Print to PDF printer|MICR line visible|F|☐|
|4.3.3|Create check format|Saved|A|☐|
|4.3.4|Edit format|Saved|A|☐|
|4.3.5|Set default format|Default set|A|☐|
|4.3.6|Print single check|Printed|F|☐|
|4.3.7|Print batch|Numbers correct|F|☐|
|4.3.8|Void check|Status Void|F|☐|
|4.3.9|Reprint voided|New number|F|☐|
|4.3.10|Amount-to-words|Text correct|F|☐|

---

## 5  Vendor Payment Verification (20 tests)

| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|5.1|Add vendor bank info|Routing validated|A|☐|
|5.2|Generate ACH batch|NACHA “Generated”|F|☐|
|5.3|Viewer download attempt|Denied|V|☐|
|5.4|Create vendor|Added|A|☐|
|5.5|Edit vendor|Saved|A|☐|
|5.6|Multiple bank accts|Default selectable|A|☐|
|5.7|Create payment batch|Batch listed|F|☐|
|5.8|Edit batch|Saved|F|☐|
|5.9|Approve batch|Status Approved|A|☐|
|5.10|Generate NACHA|File format OK|F|☐|
|5.11|Validate NACHA|Header/detail/footer correct|F|☐|
|5.12|Mark batch sent|Status Sent|F|☐|
|5.13|Mark payments cleared|Status Cleared|F|☐|
|5.14|Payment history|All payments listed|F|☐|
|5.15|Filter payments|Filtered list|F|☐|
|5.16|Search vendor name|Matches|F|☐|
|5.17|Export payments CSV|File|F|☐|
|5.18|Verify JE creation|Accounts correct|F|☐|
|5.19|Generate prenote|Zero-dollar file|F|☐|
|5.20|Vendor 1099 flags|Saved|A|☐|

---

## 6  Reporting Verification (40 tests)

### 6.1 Standard Financial Reports (10 tests)

| # | Report | Expected | Role | ✔ |
|---|--------|----------|------|---|
|6.1.1|Income Statement YTD|Matches AF ±1¢|F|☐|
|6.1.2|Balance Sheet|A=L+E|F|☐|
|6.1.3|Cash-Flow|Beg+Net=End|F|☐|
|6.1.4|Trial Balance|Debits=Credits|F|☐|
|6.1.5|Budget vs Actual|Variance correct|F|☐|
|6.1.6|Export PDF|PDF ok|F|☐|
|6.1.7|Export Excel|File ok|F|☐|
|6.1.8|Filter date|Filtered|F|☐|
|6.1.9|Filter fund|Filtered|F|☐|
|6.1.10|Consolidated|Includes all entities|F|☐|

### 6.2 Custom Reports (10 tests)

| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.2.1|Build pivot|CSV downloads|A|☐|
|6.2.2|Create tabular|Displays|F|☐|
|6.2.3|Add calc column|Formula ok|F|☐|
|6.2.4|Group & subtotal|Totals correct|F|☐|
|6.2.5|Add chart|Chart shows|F|☐|
|6.2.6|Save report|In list|F|☐|
|6.2.7|Edit report|Changes saved|F|☐|
|6.2.8|Schedule report|Email sent|A|☐|
|6.2.9|Export PDF|PDF ok|F|☐|
|6.2.10|Share report|User access|A|☐|

### 6.3 Natural Language Queries (10 tests)

| # | Query | Expected | Role | ✔ |
|---|-------|----------|------|---|
|6.3.1|“Show restricted fund balances”|≥1 row|V|☐|
|6.3.2|“Top 5 expenses last month”|5 rows|F|☐|
|6.3.3|“Revenue by month this year”|12 rows|F|☐|
|6.3.4|Quarterly balance sheet|Report|F|☐|
|6.3.5|Cash trend|Chart|F|☐|
|6.3.6|Save query|Saved|F|☐|
|6.3.7|Export CSV|File|F|☐|
|6.3.8|Entity filter|Filtered|F|☐|
|6.3.9|Date filter|Filtered|F|☐|
|6.3.10|Complex condition|Correct|F|☐|

### 6.4 Fund Reports (10 tests)

| # | Report | Expected | Role | ✔ |
|---|--------|----------|------|---|
|6.4.1|Fund Balance|Matches GL|F|☐|
|6.4.2|Fund Activity|Matches JEs|F|☐|
|6.4.3|Fund Statement|Correct|F|☐|
|6.4.4|Funds Comparison|All funds|F|☐|
|6.4.5|Filter date|Filtered|F|☐|
|6.4.6|Export PDF|PDF|F|☐|
|6.4.7|Export Excel|Excel|F|☐|
|6.4.8|Restricted only|Filtered|F|☐|
|6.4.9|Hierarchy view|Parent-child|F|☐|
|6.4.10|Balance calc|Matches GL|F|☐|

---

## 7  Utility Features Verification (30 tests)

### 7.1 Inter-Entity Transfer Wizard (10)

| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.1.1|Create $50 transfer|Mirror JEs|F|☐|
|7.1.2|Due to/from accounts|Balanced|F|☐|
|7.1.3|Different currencies|Rate applied|F|☐|
|7.1.4|Memo field|Memo in both JEs|F|☐|
|7.1.5|History list|Transfers listed|F|☐|
|7.1.6|Filter by entity|Filtered|F|☐|
|7.1.7|Search description|Matches|F|☐|
|7.1.8|Export CSV|File|F|☐|
|7.1.9|Verify JE accounts|Correct|F|☐|
|7.1.10|Reverse transfer|Offset JEs|F|☐|

### 7.2 Dashboard (10)

| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.2.1|Dashboard loads|Charts render|F|☐|
|7.2.2|Fund trend chart|Correct|F|☐|
|7.2.3|Income vs Expense|Correct|F|☐|
|7.2.4|Distribution chart|Correct|F|☐|
|7.2.5|Recent txns panel|Shows data|F|☐|
|7.2.6|Unposted entries|Shows drafts|F|☐|
|7.2.7|Change date range|Charts update|F|☐|
|7.2.8|Print dashboard|PDF ok|F|☐|
|7.2.9|Entity filter|Data filtered|F|☐|
|7.2.10|Consolidated toggle|Updates|F|☐|

### 7.3 Default Reports Page (10)

| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.3.1|Open page|List loads|F|☐|
|7.3.2|Run SoFP|Report|F|☐|
|7.3.3|Run SoA|Report|F|☐|
|7.3.4|Run SFE|Report|F|☐|
|7.3.5|Run Cash Flows|Report|F|☐|
|7.3.6|Export PDF|PDF|F|☐|
|7.3.7|Export Excel|Excel|F|☐|
|7.3.8|Filter date|Filtered|F|☐|
|7.3.9|Filter fund|Filtered|F|☐|
|7.3.10|Print report|Print view|F|☐|

---

## 8  User Interface Verification (20 tests)

| # | Check | Expected | ✔ |
|---|-------|----------|---|
|8.1|Navigation links|No dead links|☐|
|8.2|Responsive design|Hamburger at ≤ 375 px|☐|
|8.3|Accessibility score|Lighthouse ≥ 90|☐|
|8.4|Color contrast|WCAG AA|☐|
|8.5|Keyboard navigation|All focusable|☐|
|8.6|Screen reader labels|Announced|☐|
|8.7|Form validation msgs|Clear|☐|
|8.8|Modal open/close|No errors|☐|
|8.9|Toast notifications|Show & dismiss|☐|
|8.10|Loading spinners|Appear correctly|☐|
|8.11|Table sorting|Works|☐|
|8.12|Filtering|Works|☐|
|8.13|Pagination|Works|☐|
|8.14|Form reset|Clears fields|☐|
|8.15|Print CSS|Print-friendly|☐|
|8.16|Back to Dashboard Btn|Works|☐|
|8.17|Entity selector|Data updates|☐|
|8.18|Consolidate toggle|Data updates|☐|
|8.19|Tab navigation|Content switches|☐|
|8.20|Help tooltips|Display text|☐|

---

## 9  Data Integrity Verification (28 tests)

### 9.1 General (15)

| # | Check | Expected | ✔ |
|---|-------|----------|---|
|9.1.1|Debit = Credit|`sp_verify_trial_balance()` 0|☐|
|9.1.2|Restricted balances|No negatives|☐|
|9.1.3|Audit trail entries|Create/Post shown|☐|
|9.1.4|Bank rec integrity|Stored proc 0|☐|
|9.1.5|Inter-entity balance|Proc 0|☐|
|9.1.6|Vendor pay amounts|Match invoices|☐|
|9.1.7|Check number dupes|None|☐|
|9.1.8|Deposit totals|Match items|☐|
|9.1.9|NACHA integrity|Validator pass|☐|
|9.1.10|Foreign keys|No orphans|☐|
|9.1.11|Unique constraints|No duplicates|☐|
|9.1.12|Check constraints|All enforced|☐|
|9.1.13|Null constraints|Required not null|☐|
|9.1.14|Data types|Correct types|☐|
|9.1.15|Indexes present|All expected|☐|

### 9.2 New Tables (13)

| # | Table | Records ≥ | ✔ |
|---|-------|-----------|---|
|9.2.1|bank_statements|5|☐|
|9.2.2|bank_statement_transactions|20|☐|
|9.2.3|bank_reconciliations|3|☐|
|9.2.4|bank_reconciliation_items|15|☐|
|9.2.5|bank_reconciliation_adjustments|2|☐|
|9.2.6|bank_deposits|5|☐|
|9.2.7|bank_deposit_items|15|☐|
|9.2.8|check_formats|4|☐|
|9.2.9|printed_checks|10|☐|
|9.2.10|vendor_bank_accounts|8|☐|
|9.2.11|payment_items|12|☐|
|9.2.12|nacha_files|3|☐|
|9.2.13|session|1|☐|

---

## 10  Performance Verification (20 tests)

| # | Scenario | Metric | Threshold | ✔ |
|---|----------|--------|-----------|---|
|10.1|Login 20 users|Avg load|< 2 s|☐|
|10.2|Import 10k JE|Process|< 60 s|☐|
|10.3|Dashboard load|Page|< 3 s|☐|
|10.4|COA 1k accts|Page|< 2 s|☐|
|10.5|JE list 10k|Page|< 3 s|☐|
|10.6|Reconcile 500 txns|Auto-match|< 10 s|☐|
|10.7|Income stmt 12 mo|Report|< 5 s|☐|
|10.8|Custom rpt 20 cols|Report|< 8 s|☐|
|10.9|NL query|Resp|< 3 s|☐|
|10.10|NACHA 100 pays|Process|< 5 s|☐|
|10.11|Print 50 checks|Process|< 15 s|☐|
|10.12|DB backup 100 MB|Time|< 30 s|☐|
|10.13|DB restore 100 MB|Time|< 60 s|☐|
|10.14|API 95th pct|Resp|< 500 ms|☐|
|10.15|Memory load|Max < 4 GB|☐|
|10.16|CPU load|Max < 80 %|☐|
|10.17|DB pool usage|< 80 %|☐|
|10.18|Network throughput|< 10 Mbps|☐|
|10.19|Disk I/O|< 1000 IOPS|☐|
|10.20|Full load 50 users|Resp Δ < 25 %|☐|

---

## 11  Documentation & Help Verification (15 tests)

| # | Item | Expected | ✔ |
|---|------|----------|---|
|11.1|Administrator Guide|PDF accessible|☐|
|11.2|User Guide|PDF accessible|☐|
|11.3|Installation Guide|PDF accurate|☐|
|11.4|Migration Guide|PDF accurate|☐|
|11.5|Migration Steps|Checklist complete|☐|
|11.6|Interactive ER|Diagram loads|☐|
|11.7|Backend architecture|Diagram loads|☐|
|11.8|Frontend architecture|Diagram loads|☐|
|11.9|Help tooltips|Present|☐|
|11.10|Error messages|Actionable|☐|
|11.11|Field validation text|Clear|☐|
|11.12|Doc links|No 404|☐|
|11.13|Doc search|Returns results|☐|
|11.14|Print formatting|Correct|☐|
|11.15|Doc completeness|All features covered|☐|

---

## 12  Backup & Recovery Verification (10 tests)

| # | Test | Steps | Expected | ✔ |
|---|------|-------|----------|---|
|12.1|Nightly dump|Check cron|Dump < 24 h|☐|
|12.2|Sandbox restore|`pg_restore`|App starts|☐|
|12.3|Manual backup|Run `pg_dump`|Success|☐|
|12.4|Point-in-time|Restore specific time|Accurate|☐|
|12.5|Backup encryption|File unreadable raw|☐|
|12.6|Backup compression|File smaller|☐|
|12.7|Offsite transfer|Log shows success|☐|
|12.8|Retention policy|History matches|☐|
|12.9|Backup integrity|Checksum ok|☐|
|12.10|Disaster recovery|Full restore works|☐|

---

## 13  Final Acceptance Testing (10 workflows)

### 13.1 End-to-End Workflows

| # | Workflow | Steps | Expected | ✔ |
|---|----------|-------|----------|---|
|13.1.1|Full accounting cycle|JE → Post → Reports|Reports updated|☐|
|13.1.2|Banking cycle|Deposit → Check → Reconcile|All balanced|☐|
|13.1.3|Vendor payment|Vendor → Pay → NACHA|File valid|☐|
|13.1.4|Reporting cycle|Std → Custom → Export|All outputs ok|☐|
|13.1.5|User mgmt|Create user → Login|Access correct|☐|
|13.1.6|Entity mgmt|Create entity → Consolidated rpt|Included|☐|
|13.1.7|Bank rec cycle|Import → Match → Reconcile|Balanced|☐|
|13.1.8|Check printing|Create → Print → Void|All steps ok|☐|
|13.1.9|Custom reporting|Build → Schedule → Receive|Email delivered|☐|
|13.1.10|Inter-entity transfer|Create → Verify → Report|Balanced|☐|

### 13.2 Stakeholder Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Finance Lead | | | |
| IT Lead | | | |
| Executive Sponsor | | | |

> **All sections must be ☑ Pass before production cut-over.**

---

## Appendix A – Troubleshooting Reference

| Area | Symptom | Likely Cause | Resolution |
|------|---------|-------------|------------|
|Auth|Logout loop|Missing `credentials:include`|Clear cache & redeploy JS|
|Banking|Check misaligned|Printer DPI|Adjust X/Y offsets|
|ACH|Bank rejects file|Immediate Origin wrong|Update Settings → ACH|
|Reconcile|Items won’t match|Date format|Check import parsing|
|Reports|Slow generation|Missing index|Add DB index|
|Performance|Slow pages|Unminified JS|Enable prod build|
|DB|Conn errors|Pool exhausted|Increase pool size|
|UI|Form won’t submit|Client validation|Check console|
|Security|Short sessions|TTL too low|Increase timeout|
|API|404 on /formats|Route order|Re-arrange routes|

---

## Appendix B – Test Data Reference

| Test Area | Sample Data Path | Contents |
|-----------|-----------------|----------|
|Bank Reconciliation|`/samples/bank/statements/`|OFX, CSV, QFX|
|Vendor Payments|`/samples/vendors/`|Vendor CSV template|
|Check Printing|`/samples/checks/`|Check formats|
|Journal Entries|`/samples/journal/`|JE import CSVs|
|Reports|`/samples/reports/`|Report definitions|
|Users|`/samples/users/`|User import CSV|

---

© 2025 San Francisco AI Factory · All rights reserved.
