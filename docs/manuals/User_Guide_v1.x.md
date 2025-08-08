# Mr-Moneybags v1.x – User Guide  
_Comprehensive guide for day-to-day users & administrators_

---

## 1  Introduction & Overview
Welcome to **Mr-Moneybags v1.x**, an open-source, non-profit fund-accounting platform built with Node.js/Express and a PostgreSQL back-end.  
It delivers:

* True fund accounting (multiple entities & funds)
* Full banking workflow – reconciliation, deposits, check printing
* Electronic vendor payments with NACHA export
* Role-based security with session persistence
* Custom report builder & interactive dashboards

> _Audience_: finance staff, treasurers, auditors and system administrators of charitable organisations.

---

## 2  Getting Started  
### 2.1  Logging In  
1. Browse to **https://\<server\>/login.html**.  
2. Enter _Username_ and _Password_.  
3. Tick **Remember me** to keep your session for 24 h.  
4. Press **Sign In**.  
   *On success you are redirected to the Dashboard; on failure a red toast appears.*

### 2.2  Authentication & Sessions  
• Sessions are stored in PostgreSQL; every API call automatically includes the session cookie.  
• Inactivity timeout: 60 min. Click your name → **Log out** to end the session.

### 2.3  Roles  
| Role | Permissions |
|------|-------------|
| **admin** | Full access, Settings tab visible, user management |
| **user**  | Day-to-day accounting & banking, no Settings tab |

---

## 3  Dashboard Navigation  
![Dashboard](screenshots/dashboard.png)

1. Global header – current entity / fund selector, user menu.  
2. Left nav – modules. Green buttons always return to Dashboard.  
3. At-a-glance widgets – cash balances, open deposits, unreconciled items, pending checks.  
4. Recent activity feed.

Keyboard shortcuts: `g d` Dashboard, `g b` Bank Reconciliation, `g v` Vendor Payments.

---

## 4  Core Fund Accounting  
### 4.1  Entities & Funds  
*Settings → Entities* to maintain a parent/child hierarchy (e.g. Head Office, Programs).  
*Settings → Funds* to create restricted or unrestricted funds.  
_Practical example_: create **Scholarship Fund** restricted = true.

### 4.2  Chart of Accounts  
*Accounts* module → **New Account**  
*Tip:* Use 4-digit natural numbers + fund/department segments if required.

### 4.3  Journal Entries  
1. Navigation → **Journal Entries**.  
2. Click **New Entry**.  
3. Enter header (date, reference, memo).  
4. Add debit & credit lines – system enforces balancing.  
5. **Post** to ledger.

Example screenshot: `screenshots/je_new.png`.

---

## 5  Banking Operations  
### 5.1  Bank Reconciliation  
![Reconciliation Workspace](screenshots/bank_recon_workspace.png)

1. **Bank Reconciliation** page → _Bank Statements_ tab → **Upload Statement** (CSV, QIF, OFX).  
2. Auto-matching suggests matches; review in _Workspace_ tab:  
   * Drag & drop unmatched books ↔ statement lines.  
   * Create adjustments (service fees, interest).  
3. When _Difference_ = 0, click **Finish Reconciliation** → PDF report.

### 5.2  Bank Deposits  
1. **Bank Deposits** → **New Deposit**.  
2. Select **Bank Acct** & deposit date.  
3. Add items (checks, cash, ACH gifts). Totals update in real-time.  
4. **Submit Deposit** – status becomes *Pending*.  
5. At bank confirmation mark **Clear** to move to *Cleared*.  
6. *Deposit Slip* tab prints an encoded slip (use plain letter paper).

### 5.3  Check Printing  
Pages: _Check Register_, _New Check_, _Print Queue_, _Check Formats_.  
Workflow:

| Step | Action |
|------|--------|
| Draft | Enter new check – payee, amount, GL lines. |
| Queue | Add to **Print Queue**. |
| Print | Select queue rows → **Print** → preview appears.  Load check stock & confirm. |
| Void | In register, click **Void** to invalidate (creates reversal JE). |
| Clear | After bank clears, mark **Cleared** (affects reconciliation). |

Format management supports 4 stock styles; admins may duplicate & adjust field offsets.

---

## 6  Vendor Management  
### 6.1  Vendors & ACH Details  
*Vendors* module → **New Vendor**  
Add routing & account numbers under _Bank Accounts_.

### 6.2  Payment Batches  
1. **Vendor Payments** → **New Batch**.  
2. Select invoices / bills to pay (import or manual).  
3. Review totals → **Approve Batch**.  
4. **Generate NACHA** – file appears in _NACHA Files_ tab for upload to your bank portal.

_Note:_ System tracks batch & item status (*Draft*, *Approved*, *Sent*, *Cleared*).

---

## 7  Reporting & Analytics  
*Reports* → **Create Report**  
1. Choose template (SoA, Trial Balance, Fund Balance).  
2. Configure filters (entity, fund, period).  
3. Save definition for reuse.  
4. Export PDF, Excel or CSV.  

Scheduled delivery via cron (admins edit `reports_schedule` table).

---

## 8  Administrative Functions (Admin Only)  
### 8.1  User Management  
*Settings → Users* list.  
• **Add User** – username, role, temporary password; user sets new password at first login.  
• **Disable** user to revoke access.

### 8.2  System Settings  
*Settings* covers company info, fiscal year, NACHA default settings, check numbering.

### 8.3  Security Tips  
* Always enforce HTTPS.  
* Rotate admin passwords quarterly.  
* Backup `session` table daily to preserve active logins after DB restore.

---

## 9  Troubleshooting  
| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| “Loading… never ends” | Session cookie missing | Clear browser cookies, re-login – ensure API fetches use `credentials:"include"`. |
| Settings tab invisible for admin | User role not lowercase `admin` | Check Users table; update role. |
| Cannot print checks – blank preview | Check format has zero margins | Go to _Check Formats_ → edit layout offsets. |
| Bank statement import fails | Wrong CSV headers | Use provided sample template in _Help → Samples_. |
| **psql: relation “…” does not exist** | Schema not loaded | Run `psql -f database/master-schema.sql`. |

Further help: `logs/server.log` (backend) & browser console (frontend).

---

## 10  Appendices  
### A  Keyboard Shortcuts
| Action | Keys |
|--------|------|
| Dashboard | `g d` |
| Bank Reconciliation | `g b` |
| Vendor Payments | `g v` |
| New Journal Entry | `n j` |
| Search | `/` |

### B  REST API Quick Reference
(Authenticated requests require session cookie.)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Create session |
| `/api/auth/logout` | POST | Destroy session |
| `/api/entities` | CRUD | Entity management |
| `/api/bank-reconciliation/statements` | POST | Upload statement |
| `/api/checks/print` | POST | Batch print checks |
| `/api/check-formats` | CRUD | Check format templates |
| `/api/payment-batches` | CRUD | Vendor payment batches |
| `/api/reports/run` | POST | Execute saved report |

### C  Sample Data
Fresh installs include demo chart of accounts, two sample bank statements and seeded users:

* admin / **admin123**  
* user  / **user123**

---

© 2025 San Francisco AI Factory – released under MIT License
