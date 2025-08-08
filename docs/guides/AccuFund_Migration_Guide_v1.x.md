# AccuFund → Mr. MoneyBags v1.x  
**Comprehensive Migration Guide**

---

## 1  Executive Summary
AccuFund has long served nonprofits with baseline fund-accounting. Mr. MoneyBags v1.x offers a modern, web-based, multi-entity platform with:

* Full banking suite – bank reconciliation, electronic deposits, and check printing
* NACHA/ACH vendor payments with automated file generation
* Role-based authentication & session management
* Modular JavaScript frontend and RESTful backend for easier maintenance
* Enhanced reporting (interactive & PDF) and custom report builder
* Consolidated multi-entity financials
* Professional, responsive UI

Migrating unlocks speed, collaboration, security, and reduced licensing costs while preserving historical data integrity.

---

## 2  Pre-Migration Planning
### 2.1 Stakeholder Alignment
| Role | Responsibility |
|------|----------------|
| Finance Lead | Chart-of-accounts & fund mapping |
| IT Lead | Infrastructure, data extraction, validation |
| Executive Sponsor | Approval, budget, timeline |

### 2.2 Assessment Checklist
- [ ] Inventory AccuFund modules in use  
- [ ] Identify custom reports/macros  
- [ ] Note integrations (bank feeds, payroll, CRM)  
- [ ] Verify hardware / OS for Mr. MoneyBags server (Ubuntu 24 LTS recommended)

### 2.3 Data Backup Procedures
1. Run AccuFund’s **Database Backup** utility (full & differential).
2. Copy backups to offline media and encrypted cloud storage.
3. Document backup hash values for verification.

### 2.4 Timeline Planning
Typical mid-size nonprofit (3 entities, 5 yrs history):

| Phase | Duration |
|-------|----------|
| Discovery & Mapping | 1 week |
| Sandbox Migration & Testing | 2 weeks |
| User Acceptance Testing | 1 week |
| Go-Live Preparation | 3 days |
| Cut-over & Support | 2 days |

---

## 3  System Architecture Comparison
| Capability | AccuFund | Mr. MoneyBags v1.x |
|------------|----------|--------------------|
| Deployment | Windows on-prem | Ubuntu 24 LTS / Docker |
| UI | Windows desktop | Web (responsive) |
| Multi-Entity Consolidation | Limited | Native, real-time |
| Authentication | Windows login / static | Bcrypt-hashed passwords, sessions, role-based access |
| Bank Reconciliation | Basic manual | Automated match, adjustments, reports |
| Electronic Deposits | None | Integrated deposit slips & clearing |
| Check Printing Formats | Fixed templates | Customizable formats & batch printing |
| ACH Payments | Plug-in | Built-in NACHA generator |
| Reporting | Crystal Reports | Built-in interactive + PDF, custom builder |
| API | None | REST/JSON (covered in Admin Guide) |

---

## 4  Data Migration Process
### Master Sequence
1. **Entities & Funds**
2. **Chart of Accounts**
3. **Users & Roles**
4. **Vendors & Bank Accounts**
5. **Opening Balances**
6. **Historical Transactions**
7. **Outstanding Checks & Deposits**
8. **Custom Reports Definitions**

Each step is idempotent; reruns are safe after clearing staging tables.

---

## 5  Migrating New Banking Features
### 5.1 Bank Reconciliation
* Export last reconciled statement date from AccuFund (`bank_accounts.last_reconciliation_date`).
* Import statements CSV → `/api/bank-reconciliation/statements/upload`.
* Auto-match transactions; flag unmatched for manual review.

### 5.2 Bank Deposits
* Export open deposit batches.
* Map to `bank_deposits` and `bank_deposit_items`.
* Verify cleared status → run **Deposit Slip** report.

### 5.3 Check Printing
* Export vendor checks outstanding.
* Assign check numbers or let system auto-number.
* Choose default format or recreate custom layout in **Check Formats** tab.

---

## 6  Authentication & Security Migration
1. Create admin user via `INSERT ... users` with bcrypt hash (`bcrypt-cli` recommended).
2. Bulk-import users; map AccuFund security groups to Mr. MoneyBags roles:
   * `Administrator` → `admin`
   * `General Ledger` → `finance`
   * `View Only` → `viewer`
3. In Settings → Users tab, verify role-based UI access.

---

## 7  Chart of Accounts Mapping
* Extract `gl_accounts` to CSV.
* Use **COA Mapping Sheet** (template in `/templates/coa-mapping.xlsx`):
  * Old Account # → New Code
  * Name & Type verification
* Import via `/api/chart-of-accounts/bulk-import`.
* Run **Trial Balance** report to ensure zero variance.

---

## 8  Fund Structure Migration
* Export `funds` with type (unrestricted/temporarily/permanently restricted).
* Import with hierarchy (parent fund) if applicable.
* Enable **Consolidate Children** flag where necessary.

---

## 9  Historical Data Migration
### 9.1 Journal Entries
* Export GL detail by fiscal year.
* Use staging table `import_journal_entries`.
* Run `sp_process_imported_journal_entries()` to validate balancing.

### 9.2 Balances
* After journal import, run system **Rebuild Balances** utility.

---

## 10  Vendor Payment Migration
1. Export vendor list + bank details.
2. Import to `vendor_bank_accounts`.
3. Verify **Routing #** passes checksum (tool in Vendor Payments page).
4. Import unpaid vouchers to `payment_items` (status `Pending`).

---

## 11  Reporting Migration
| Report Type | Migration Action |
|-------------|------------------|
| Standard Financials | Available natively – no action |
| Custom Crystal Reports | Recreate in Report Builder or export to Excel & use **Custom Reports** |
| Ad-hoc Queries | Use **Natural Language Queries** module |

---

## 12  Post-Migration Setup
* Connect live bank feeds or upload OFX/CSV.
* Configure check printer alignment and default format.
* Train users (see **User Guide v1.x** pp 45-78).
* Schedule nightly PostgreSQL backups with `pg_dump`.

---

## 13  Testing & Validation Procedures
1. **Record Counts** – Source vs target tables.
2. **Financial Totals** – Trial balance per entity & consolidated.
3. **Random Transaction Drill-Down** – 5 per month.
4. **Bank Rec Integrity** – Ending balance equals statement.
5. **User Access** – Role matrix acceptance testing.

---

## 14  Go-Live Checklist
- [ ] Final backup of AccuFund database  
- [ ] Freeze data entry in AccuFund  
- [ ] Run delta migration scripts (last 48 h)  
- [ ] Switch DNS / URL for end users  
- [ ] Monitor logs & performance for 48 h  
- [ ] Decommission AccuFund access (read-only archived)

---

## 15  Common Issues & Troubleshooting
| Symptom | Cause | Resolution |
|---------|-------|-----------|
| “Failed to authenticate” | Old password hashes | Reset via admin panel |
| Out-of-balance JE import | Missing fund code | Update mapping sheet & re-import |
| Check format misaligned | Printer DPI difference | Adjust X/Y offsets in **Check Formats** |
| ACH file rejected by bank | Bank ID mismatch | Verify Immediate Origin/ Destination codes |

---

## 16  Support & Resources
* **Administrator Guide v1.x** – system configuration details  
* **User Guide v1.x** – daily operations & banking modules  
* Community Forum – https://community.mrmoneybags.org  
* Email Support – support@mrmoneybags.org  
* Professional Services – migration@solutions.mrmoneybags.org  

---

© 2025 San Francisco AI Factory. All rights reserved.
