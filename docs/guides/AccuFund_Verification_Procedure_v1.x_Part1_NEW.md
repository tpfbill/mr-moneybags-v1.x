# AccuFund → Mr. MoneyBags v1.x  
**Comprehensive Verification & Acceptance Procedure – Part 1 (Sections 0-6)**  

Use this end-to-end checklist to confirm that every capability of Mr. MoneyBags v1.x functions correctly after migration from AccuFund 9.x.  
Mark each item ☐ / ☑, attach evidence (📸 screenshot or export file name), record issues, and obtain final sign-off.

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
|1.2|User accounts created|Verify **admin**, **finance1**, **viewer1** can log in|All accounts working|A|☐|
|1.3|Backup snapshot|Run `pg_dump -Fc` and VM snapshot|Files saved & hash logged|A|☐|
|1.4|Sample data loaded|All 24 tables contain ≥ 5 rows|Counts correct|A|☐|
|1.5|Network accessibility|Ports 3000, 5432 reachable from client VLAN|Telnet succeeds|A|☐|
|1.6|SSL certificate valid|Access app via HTTPS|No browser warning|A|☐|

---

## 2  Authentication & Security Verification (17 tests)
| # | Test Case | Steps | Expected | Role | ✔ |
|---|-----------|-------|----------|------|---|
|2.1|Password hashing|Inspect `users.password_hash` length|60-char bcrypt|A|☐|
|2.2|Session timeout|Idle 35 min|Forced logout|F|☐|
|2.3|Role visibility|Viewer menu lacks Settings|No Settings tab|V|☐|
|2.4|Failed login lockout|Enter wrong pwd 5×|Account locked 15 min|A|☐|
|2.5|Password reset flow|Use “Forgot Password”|Reset email sent|F|☐|
|2.6|Password complexity|Try “password123”|Rejected|F|☐|
|2.7|Session persistence|Navigate 5 pages|Session retained|F|☐|
|2.8|Cross-tab session|Open new tab|Still authenticated|F|☐|
|2.9|Direct admin route|Viewer hits `/api/users`|403 Forbidden|V|☐|
|2.10|Logout button|Click Logout|Redirect to login|A|☐|
|2.11|Back-button after logout|Press browser ←|Remains logged out|F|☐|
|2.12|CSRF token check|Inspect POST forms|Token present|A|☐|
|2.13|XSS protection|Input `<script>`|Rendered as text|F|☐|
|2.14|SQL injection|Enter `' OR 1=1--`|No data leak|F|☐|
|2.15|Admin CRUD users|Create user “Jane D.”|User appears in list|A|☐|
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
|3.1.4|Create new account|Added successfully|A|☐|
|3.1.5|Edit account|Changes saved|A|☐|
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
|3.2.3|Create fund|Fund added|A|☐|
|3.2.4|Edit fund|Changes saved|A|☐|
|3.2.5|Check hierarchy|Parent-child correct|F|☐|
|3.2.6|Filter funds|Filtered list|F|☐|
|3.2.7|Add entity with parent|Hierarchy updated|A|☐|
|3.2.8|Enable consolidate flag|Flag stored|A|☐|
|3.2.9|Entity graph view|Matches DB|A|☐|
|3.2.10|Change entity currency|No error|A|☐|

### 3.3 Journal Entries (15 tests)
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|3.3.1|Create $100 JE draft|Status Draft|F|☐|
|3.3.2|Post JE|Trial balance nets 0|F|☐|
|3.3.3|Viewer create JE|Denied|V|☐|
|3.3.4|Multi-line JE|Debits = Credits|F|☐|
|3.3.5|Inter-entity JE|Mirror created|F|☐|
|3.3.6|Edit draft|Saved|F|☐|
|3.3.7|Edit posted|Not allowed / adj|F|☐|
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
|3.4.3|Edit budget line|Saved|F|☐|
|3.4.4|Import budget CSV|Rows imported|A|☐|
|3.4.5|Lock budget|Status Locked|A|☐|
|3.4.6|Allocate budget|JE created|A|☐|
|3.4.7|Copy last year|Data copied|A|☐|
|3.4.8|Variance report|Variance correct|F|☐|
|3.4.9|Export budget|CSV|F|☐|
|3.4.10|Delete unused budget|Removed|A|☐|

---

## 4  Banking Module Verification (40 tests)

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
|4.1.9|View history|Entry visible|F|☐|
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
|4.2.9|Approve deposit|Status Approved|A|☐|
|4.2.10|History list|Shows deposit|F|☐|
|4.2.11|Filter status|Filtered|F|☐|
|4.2.12|Search description|Matches|F|☐|
|4.2.13|Export CSV|File|F|☐|
|4.2.14|Verify JE|Correct accounts|F|☐|
|4.2.15|Batch print slips|Works|F|☐|

### 4.3 Check Printing (10 tests)
| # | Procedure | Expected | Role | ✔ |
|---|-----------|----------|------|---|
|4.3.1|Add check → Queue|Queue +1|F|☐|
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
|5.1|Add bank info to vendor|Routing validated|A|☐|
|5.2|Generate ACH batch (2 vendors)|NACHA file “Generated”|F|☐|
|5.3|Viewer downloads NACHA|Access denied|V|☐|
|5.4|Create new vendor|Vendor added|A|☐|
|5.5|Edit vendor|Changes saved|A|☐|
|5.6|Multiple bank accts|Default selectable|A|☐|
|5.7|Create payment batch|Batch created|F|☐|
|5.8|Edit payment batch|Changes saved|F|☐|
|5.9|Approve batch|Status Approved|A|☐|
|5.10|Generate NACHA file|Correct format|F|☐|
|5.11|Verify NACHA contents|Header/detail/footer OK|F|☐|
|5.12|Mark batch sent|Status Sent|F|☐|
|5.13|Mark payments cleared|Status Cleared|F|☐|
|5.14|View payment history|All payments listed|F|☐|
|5.15|Filter by status|Filtered view|F|☐|
|5.16|Search by vendor|Matches|F|☐|
|5.17|Export payments CSV|File downloads|F|☐|
|5.18|Verify payment JE|Correct accounts|F|☐|
|5.19|Prenote generation|Zero-dollar file|F|☐|
|5.20|Vendor 1099 settings|Tax flags saved|A|☐|

---

## 6  Reporting Verification (40 tests)

### 6.1 Standard Financial Reports (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.1.1|Income Statement (YTD)|Matches AccuFund ± 1¢|F|☐|
|6.1.2|Balance Sheet|Assets = Liabilities + Equity|F|☐|
|6.1.3|Cash Flow Statement|Beg + Net = End|F|☐|
|6.1.4|Trial Balance|Debits = Credits|F|☐|
|6.1.5|Budget vs Actual|Variance correct|F|☐|
|6.1.6|Export → PDF|PDF generated|F|☐|
|6.1.7|Export → Excel|Excel complete|F|☐|
|6.1.8|Filter by date|Filtered data|F|☐|
|6.1.9|Filter by fund|Filtered data|F|☐|
|6.1.10|Consolidated report|All entities included|F|☐|

### 6.2 Custom Reports (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.2.1|Build pivot report|CSV downloads|A|☐|
|6.2.2|Create tabular report|Displays correctly|F|☐|
|6.2.3|Add calculated column|Formula works|F|☐|
|6.2.4|Add grouping/subtotals|Totals correct|F|☐|
|6.2.5|Add chart|Chart renders|F|☐|
|6.2.6|Save report|Appears in list|F|☐|
|6.2.7|Edit saved report|Changes saved|F|☐|
|6.2.8|Schedule recurring|Schedule saved|A|☐|
|6.2.9|Export custom PDF|PDF generated|F|☐|
|6.2.10|Share with users|Shared access|A|☐|

### 6.3 Natural Language Queries (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.3.1|“Show restricted fund balances”|Returns ≥ 1 row|V|☐|
|6.3.2|“Top 5 expenses last month”|Shows 5 expenses|F|☐|
|6.3.3|“Revenue by month this year”|Monthly breakdown|F|☐|
|6.3.4|“Balance sheet as of last quarter”|Balance sheet output|F|☐|
|6.3.5|“Cash position trend”|Trend chart|F|☐|
|6.3.6|Save query|Query saved|F|☐|
|6.3.7|Export results CSV|File downloads|F|☐|
|6.3.8|Entity filter query|Entity-specific results|F|☐|
|6.3.9|Date-range query|Filtered results|F|☐|
|6.3.10|Complex condition query|Correct results|F|☐|

### 6.4 Fund Reports (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|6.4.1|Fund Balance Report|Balances match GL|F|☐|
|6.4.2|Fund Activity Report|Activity matches JEs|F|☐|
|6.4.3|Fund Statement|Balances correct|F|☐|
|6.4.4|Funds Comparison|All funds included|F|☐|
|6.4.5|Filter by date|Filtered data|F|☐|
|6.4.6|Export → PDF|PDF generated|F|☐|
|6.4.7|Export → Excel|Excel complete|F|☐|
|6.4.8|Restricted funds only|Filtered correctly|F|☐|
|6.4.9|Hierarchy view|Parent-child shown|F|☐|
|6.4.10|Balance calculation|Matches GL|F|☐|

---

**Proceed to “AccuFund Verification Procedure v1.x – Part 2” for Sections 7–13 (Utility Features, UI, Data Integrity, Performance, Documentation, Backup & Recovery, and Final Acceptance).**

© 2025 San Francisco AI Factory · All rights reserved.
