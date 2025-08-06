# Inter-Entity Transfer Wizard – Integration Guide  
_Integrate into v8.5 Non-Profit Fund Accounting System_

---

## 1.  Overview

The **Inter-Entity Transfer Wizard** lets finance users move cash (or any value) between legal entities in one action.  
It automatically creates the two balanced journal entries, links them with `matching_transaction_id`, and selects the proper **Due To / Due From** accounts.

---

## 2.  Step-by-Step Integration

| Step | Task | File(s) |
|------|------|---------|
| 1 | Copy `inter-entity-transfer-wizard.html` into the project root or `/public`. | new file |
| 2 | Copy `inter-entity-transfer-api.js` into `/src/api` (or same folder as `server.js`). | new file |
| 3 | `npm install uuid` **(if not already present)** – used for server-side UUID generation. | — |
| 4 | **Modify `server.js`** to import and register routes (see §3). | server.js |
| 5 | Confirm DB schema has required columns (see §4). | migration check |
| 6 | Add navigation link in the UI (see §7). | index.html / navbar |
| 7 | Restart Node server → browse to `/inter-entity-transfer-wizard.html`. | — |
| 8 | Run tests (see §5). | jest / cypress |

---

## 3.  Code Modifications in `server.js`

```js
// 1️⃣  TOP – add import
const registerInterEntityTransferRoutes = require('./src/api/inter-entity-transfer-api');

// 2️⃣  AFTER pool created and standard middle-ware:
registerInterEntityTransferRoutes(app, pool);
```

Nothing else must change; the helper registers:

* `POST /api/journal-entries/:id/lines`
* `GET  /api/accounts`
* `GET  /api/funds`
* `GET  /api/inter-entity/accounts-mapping`
* `POST /api/inter-entity/transfer`
* `GET  /api/inter-entity/transfers`

---

## 4.  Database Schema Verification

Run once in psql to confirm:

```sql
-- journal_entries
\d journal_entries
-- expect columns:
-- is_inter_entity BOOLEAN
-- target_entity_id UUID
-- matching_transaction_id UUID

-- journal_entry_lines
\d journal_entry_lines
-- expect column entity_id UUID

-- If any column missing, apply migration:
--   ALTER TABLE ... ADD COLUMN ...
```

> v8.5 already contains these fields; no migration is normally required.

---

## 5.  Testing Procedures

### 5.1  Unit / API Tests (Jest)

```
npm run test
```

Create tests that:

* `POST /api/inter-entity/transfer` returns **201** and two JE IDs.
* Journal entries balance (`total_amount` equals sum of lines).
* Both JEs share same `matching_transaction_id`.

### 5.2  End-to-End (Cypress)

1. Visit `/inter-entity-transfer-wizard.html`.
2. Fill form: **TPF ➜ TPF-ES** $100.
3. Click **Submit**.
4. Verify confirmation shows success and two JE IDs.
5. Open each JE detail page – amounts reversed and balanced.

### 5.3  Regression

* Regular single-entity JE screen still works.
* Consolidated reports render without error.

---

## 6.  User Guide

1. **Open** _Transactions → Inter-Entity Transfer_.  
2. **Select** _From Entity_ and _To Entity_.  
3. Choose **Funds** and **Due To / Due From** accounts (drop-downs auto-filter).  
4. Enter **Amount**, **Date**, **Description**, optional **Reference #**.  
5. **Review** page shows both journal entries.  
6. Click **Submit** → system displays confirmation with JE IDs and UUID.  
7. **View Entries** via supplied links or Reports → Journal Entries.

---

## 7.  Navigation Integration

Add a menu entry (example `header.html`):

```html
<li class="nav-item">
  <a class="nav-link" href="inter-entity-transfer-wizard.html">
    <i class="fas fa-exchange-alt me-1"></i> Inter-Entity Transfer
  </a>
</li>
```

If you use SPA routing, register route `/inter-entity-transfer-wizard.html`.

---

## 8.  Security Considerations

| Risk | Mitigation |
|------|------------|
| Unauthorized transfers | Route protected by existing **JWT / role** middleware. Create new permission `inter_entity_transfer_create`. |
| SQL Injection | All queries use **parameterized statements**. |
| Large amount abuse | Add server-side limit (e.g., `amount <= 1_000_000`). |
| CSRF (if cookie auth) | Already handled by global CSRF token; wizard uses `fetch` with credentials. |
| Audit trail | `matching_transaction_id` links both sides; include in audit reports. |

---

## 9.  Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| **“No Due From accounts found”** message | Entity missing asset account | Create “1900 Due From X” account. |
| Wizard spins at “Processing transfer…” | API error | Check browser dev-tools + server logs. |
| One JE created, other fails | Mid-transaction DB error | The API runs inside a SQL transaction; it should roll back. Verify constraint violations. |
| Consolidated FS shows inter-entity balances | Expected (eliminations not yet automated) | Post elimination entry or enable future elimination feature. |

---

## 10.  Next Steps

* **Automated eliminations** in consolidation report (future sprint).  
* **Mapping table** for default Due To / Due From accounts.  
* **Role-based approvals** for transfers over threshold.

Happy transferring! 🎉
