# AccuFund → Mr. MoneyBags v1.x  
**Comprehensive Verification & Acceptance Procedure – Part 2 (Sections 7-13 & Appendices)**  

*Important:* Sections 0-6 (Pre-Verification through Reporting) are documented in **“AccuFund Verification Procedure v1.x – Part 1.md.”**  
Complete and pass all tests in Part 1 before proceeding with the checks below.

---

## 7  Utility Features Verification (30 tests)

### 7.1 Inter-Entity Transfer Wizard (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.1.1|Create $50 transfer between entities|Two mirror JEs created|F|☐|
|7.1.2|Due-to/Due-from accounts balanced|Balances zero out|F|☐|
|7.1.3|Transfer with different currencies|FX rate applied correctly|F|☐|
|7.1.4|Transfer with memo field|Memo appears in both JEs|F|☐|
|7.1.5|View transfer history list|All transfers listed|F|☐|
|7.1.6|Filter transfers by entity|List filters correctly|F|☐|
|7.1.7|Search transfers by description|Matching rows shown|F|☐|
|7.1.8|Reverse a transfer|Offsetting entries created|F|☐|
|7.1.9|Export transfer list to CSV|File downloads with data|F|☐|
|7.1.10|Verify JE link drill-down|Click row opens JE|F|☐|

### 7.2 Dashboard Features (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.2.1|Dashboard loads with charts|All widgets render|F|☐|
|7.2.2|Fund Balance Trends chart|Trend correct|F|☐|
|7.2.3|Income vs Expenses chart|Values accurate|F|☐|
|7.2.4|Fund Distribution donut|Segments match data|F|☐|
|7.2.5|Recent Transactions panel|Shows latest 10 txns|F|☐|
|7.2.6|Unposted Entries panel|Shows draft JEs|F|☐|
|7.2.7|Change date range|Charts refresh|F|☐|
|7.2.8|Entity filter on dashboard|Data scoped to entity|F|☐|
|7.2.9|Print dashboard|PDF generates correctly|F|☐|
|7.2.10|Consolidated view toggle|Switches between views|F|☐|

### 7.3 Default Financial Reports (10 tests)
| # | Test | Expected | Role | ✔ |
|---|------|----------|------|---|
|7.3.1|Open Default Reports page|Report list loads|F|☐|
|7.3.2|Statement of Financial Position|Report correct|F|☐|
|7.3.3|Statement of Activities|Report correct|F|☐|
|7.3.4|Statement of Functional Expenses|Report correct|F|☐|
|7.3.5|Statement of Cash Flows|Report correct|F|☐|
|7.3.6|Export report → PDF|PDF downloads|F|☐|
|7.3.7|Export report → Excel|XLSX downloads|F|☐|
|7.3.8|Filter report by fund|Data filters|F|☐|
|7.3.9|Filter report by date range|Data filters|F|☐|
|7.3.10|Print report|Print layout correct|F|☐|

---

## 8  User Interface Verification (20 tests)
| # | Check | Steps | Expected | ✔ |
|---|-------|-------|----------|---|
|8.1|Navigation links|Click all main nav links|No 404 / errors|☐|
|8.2|Responsive menu|Resize to 375 px width|Hamburger menu appears|☐|
|8.3|Lighthouse a11y score|Run audit|Score ≥ 90|☐|
|8.4|Color contrast|Check random pages|WCAG AA compliant|☐|
|8.5|Keyboard navigation|Tab through inputs|Focusable & logical|☐|
|8.6|Screen reader labels|Test with SR|Elements announced|☐|
|8.7|Form validation messages|Submit invalid form|Clear guidance shown|☐|
|8.8|Modal dialogs|Open/close all modals|No JS errors|☐|
|8.9|Toast notifications|Trigger success/error|Toasts display & auto-dismiss|☐|
|8.10|Loading indicators|Open heavy pages|Spinner visible|☐|
|8.11|Table sorting|Click column headers|Rows sort correctly|☐|
|8.12|Table filtering|Use filter boxes|Rows filter|☐|
|8.13|Table pagination|Navigate pages|Data loads|☐|
|8.14|Form reset/cancel|Click reset|Form returns to default|☐|
|8.15|Print-friendly CSS|Print various pages|Layouts optimized|☐|
|8.16|Back to Dashboard buttons|Click on banking pages|Returns home|☐|
|8.17|Entity selector|Change entity|Values update|☐|
|8.18|Consolidated toggle|Toggle on/off|Data refreshes|☐|
|8.19|Tab interfaces|Switch tabs|Correct content visible|☐|
|8.20|Help tooltips|Hover help icons|Tooltip text appears|☐|

---

## 9  Data Integrity Verification (28 tests)

### 9.1 Database Integrity Checks (15 tests)
| # | Procedure | Expected | ✔ |
|---|-----------|----------|---|
|9.1.1|Debit = Credit|Trial balance variance 0|☐|
|9.1.2|Restricted funds non-negative|No negatives|☐|
|9.1.3|JE audit trail present|User/time recorded|☐|
|9.1.4|Bank recon integrity proc|Returns 0 variance|☐|
|9.1.5|Inter-entity balances|Due-to/Due-from zero|☐|
|9.1.6|Vendor payment totals|Match invoices|☐|
|9.1.7|Check number uniqueness|No duplicates|☐|
|9.1.8|Deposit totals match items|Sums equal|☐|
|9.1.9|NACHA file validator|No errors|☐|
|9.1.10|Foreign keys enforced|No orphan rows|☐|
|9.1.11|Unique constraints|No dup keys|☐|
|9.1.12|Check constraints|All pass|☐|
|9.1.13|Null constraints|Required not null|☐|
|9.1.14|Data type conformity|Values proper types|☐|
|9.1.15|Index health|All indexes valid|☐|

### 9.2 New Table Verification (13 tests)
| # | Table | Rows ≥ | ✔ |
|---|-------|--------|---|
|9.2.1|`bank_statements`|5|☐|
|9.2.2|`bank_statement_transactions`|20|☐|
|9.2.3|`bank_reconciliations`|3|☐|
|9.2.4|`bank_reconciliation_items`|15|☐|
|9.2.5|`bank_reconciliation_adjustments`|2|☐|
|9.2.6|`bank_deposits`|5|☐|
|9.2.7|`bank_deposit_items`|15|☐|
|9.2.8|`check_formats`|4|☐|
|9.2.9|`printed_checks`|10|☐|
|9.2.10|`vendor_bank_accounts`|8|☐|
|9.2.11|`payment_items`|12|☐|
|9.2.12|`nacha_files`|3|☐|
|9.2.13|`session`|1|☐|

---

## 10  Performance Verification (20 tests)
| # | Scenario | Metric | Pass Threshold | ✔ |
|---|----------|--------|----------------|---|
|10.1|Login (20 users)|Avg page load|< 2 s|☐|
|10.2|Import 10k-line JE|Process time|< 60 s|☐|
|10.3|Dashboard load|Page load|< 3 s|☐|
|10.4|COA 1000 accts|Load time|< 2 s|☐|
|10.5|JE list 10k rows|Load time|< 3 s|☐|
|10.6|Reconcile 500 txns|Auto-match|< 10 s|☐|
|10.7|Income Statement 12 mo|Report time|< 5 s|☐|
|10.8|Custom report 20 cols|Report time|< 8 s|☐|
|10.9|NL query processing|Response|< 3 s|☐|
|10.10|NACHA generation 100+|Process|< 5 s|☐|
|10.11|Print 50 checks|Processing|< 15 s|☐|
|10.12|Database backup 100 MB|Backup|< 30 s|☐|
|10.13|Database restore 100 MB|Restore|< 60 s|☐|
|10.14|API 95th percentile|Resp time|< 500 ms|☐|
|10.15|Memory under load|Max RAM|< 4 GB|☐|
|10.16|CPU under load|Max CPU|< 80 %|☐|
|10.17|DB pool usage|Connections|< 80 % pool|☐|
|10.18|Network throughput|Bandwidth|< 10 Mbps|☐|
|10.19|Disk I/O|IOPS|< 1000|☐|
|10.20|Full load 50 users|Resp degradation|< 25 %|☐|

---

## 11  Documentation & Help Verification (15 tests)
| # | Test | Expected | ✔ |
|---|------|----------|---|
|11.1|Administrator Guide v1.x|PDF accessible & complete|☐|
|11.2|User Guide v1.x|PDF accessible & complete|☐|
|11.3|Installation Guide|PDF accurate|☐|
|11.4|Migration Guide v1.x|PDF accurate|☐|
|11.5|Migration Steps v1.x|Checklist complete|☐|
|11.6|Interactive ER Diagram|Loads; matches DB|☐|
|11.7|Backend Architecture Diagram|Components complete|☐|
|11.8|Frontend Architecture Diagram|Components complete|☐|
|11.9|In-app help tooltips|Present on complex fields|☐|
|11.10|Error messages|Clear, actionable|☐|
|11.11|Form validation text|Clear requirements|☐|
|11.12|Documentation links|No 404|☐|
|11.13|Documentation search|Returns relevant results|☐|
|11.14|Printability of docs|Print formatting correct|☐|
|11.15|Overall completeness|All features documented|☐|

---

## 12  Backup & Recovery Verification (10 tests)
| # | Test | Steps | Expected | ✔ |
|---|------|-------|----------|---|
|12.1|Automated nightly dump|Check cron log|Dump < 24 h old|☐|
|12.2|Sandbox restore|`pg_restore` runs|App starts ok|☐|
|12.3|Manual backup|Run `pg_dump`|Backup completes|☐|
|12.4|Point-in-time recovery|Restore timestamp|Data correct|☐|
|12.5|Backup encryption|Verify encryption|File unreadable raw|☐|
|12.6|Backup compression|Check size|Compressed|☐|
|12.7|Off-site transfer|Check logs|Transfer ok|☐|
|12.8|Retention policy|History matches policy|☐|
|12.9|Backup verification|Integrity check passes|☐|
|12.10|Disaster recovery test|Full restore|System operational|☐|

---

## 13  Final Acceptance Testing

### 13.1 End-to-End Workflows (10 tests)
| # | Workflow | Steps | Expected | ✔ |
|---|----------|-------|----------|---|
|13.1.1|Full Accounting Cycle|JE → Post → Reports|Reports reflect JE|☐|
|13.1.2|Banking Cycle|Deposit → Check → Reconcile|All items reconciled|☐|
|13.1.3|Vendor Payment Cycle|Vendor → Payment → NACHA|File generated|☐|
|13.1.4|Reporting Cycle|Standard → Custom → Export|All reports generate|☐|
|13.1.5|User Management Cycle|Create user → Assign role → Login|Proper access|☐|
|13.1.6|Entity Management Cycle|Entity → Fund → JE → Consolidate|Included correctly|☐|
|13.1.7|Bank Reconciliation Cycle|Import → Match → Reconcile|Balances correct|☐|
|13.1.8|Check Printing Cycle|Create → Print → Void → Reprint|All steps succeed|☐|
|13.1.9|Custom Reporting Cycle|Build → Save → Schedule → Receive|Report delivered|☐|
|13.1.10|Inter-Entity Transfer Cycle|Create transfer → Verify → Report|Reflected correctly|☐|

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
|Auth|Logout loop|Missing `credentials:'include'`|Clear cache; redeploy JS|
|Banking|Check mis-aligned|Printer DPI mis-set|Adjust X/Y offsets in format|
|ACH|Bank rejects file|Immediate Origin incorrect|Update ACH settings; regenerate|
|Reconciliation|Items won’t match|Date format mismatch|Check import parser format|
|Reports|Slow generation|Missing DB index|Add index; re-analyze|
|Performance|High CPU|JS build in dev mode|Switch to production build|
|DB|Connection errors|Pool exhausted|Increase pool size; tune queries|
|Security|Session expiry too fast|TTL too low|Adjust session config|
|API|404 on `/formats`|Route order conflict|Split into dedicated route|
|UI|Form won’t submit|Client-side validation|Check browser console|

---

## Appendix B – Test Data Reference
| Test Area | Sample Data Location | Contents |
|-----------|----------------------|----------|
|Bank Reconciliation|`/samples/bank/statements/`|OFX, CSV, QFX samples|
|Vendor Payments|`/samples/vendors/`|Vendor CSV templates|
|Check Printing|`/samples/checks/`|Sample check formats|
|Journal Entries|`/samples/journal/`|JE import CSVs|
|Reports|`/samples/reports/`|Report definitions|
|Users|`/samples/users/`|User import template|

---

© 2025 San Francisco AI Factory · All rights reserved.
