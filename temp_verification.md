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
|1.1|System Requirements Confirmed|Check Ubuntu 24 LTS, Docker ≥ 24, 8 GB RAM, 4 vCPU|Meets or exceeds specs|A|☐|
|1.2|Access Accounts Created|Ensure **admin**, **finance1**, **viewer1** logins exist|All three users can reach login screen|A|☐|
|1.3|Backup Snapshot|Run `pg_dump -Fc` and VM snapshot|Files saved & hash logged|A|☐|
|1.4|Sample Data Verification|Verify all 24 tables have sample data|Each table has ≥ 5 records|A|☐|
|1.5|Network Configuration|Verify ports 3000, 5432 accessible|Telnet connection succeeds|A|☐|
|1.6|SSL Certificate|Verify SSL certificate installed & valid|HTTPS connection works|A|☐|

---

## 2  Authentication & Security Verification
| # | Test Case | Steps | Expected | Role | ✔ |
|---|-----------|-------|----------|------|---|
|2.1|Password Hashing|Inspect `users.password_hash` length 60|Bcrypt hash present|A|☐|
|2.2|Session Timeout|Login as finance, stay idle 35 min|Redirect to login page|F|☐|
|2.3|Role Visibility|Settings tab hidden for viewer|No nav item|V|☐|
|2.4|Failed Login Attempts|Enter wrong password 5 times|Account locked for 15 min|A|☐|
|2.5|Password Reset|Use "Forgot Password" link|Reset email sent|F|☐|
|2.6|Password Complexity|Try "password123" as new password|Rejected as too weak|F|☐|
|2.7|Session Persistence|Login, navigate to 5 different pages|Session maintained|F|☐|
|2.8|Cross-Site Access|Login, open new tab, access app|Session recognized|F|☐|
|2.9|Role Separation|Viewer attempts to access admin route directly|403 Forbidden|V|☐|
|2.10|Logout Function|Click logout button|Redirected to login page|A|☐|
|2.11|Session Invalidation|Logout, try back button|Login page, not app|F|☐|
|2.12|CSRF Protection|Inspect forms for CSRF tokens|Token present in all forms|A|☐|
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
|3.1.6|Filter accounts by type|Only matching accounts shown|F|☐|
|3.1.7|Search for account by name|Matching accounts shown|F|☐|
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
