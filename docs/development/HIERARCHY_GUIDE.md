# Three-Level Hierarchy Guide

Welcome to the **Entity & Fund Hierarchy** for **Mr-Moneybags-v1.x**.  
The platform supports a full **three-tier** structure:

1. **Organization** – the top-level umbrella (e.g. *The Principle Foundation*).  
2. **Entities** – legal or operational units under the organization (e.g. *TPF*, *TPF-ES*, *IFCSN*).  
3. **Funds** – restricted or unrestricted buckets that live **inside an entity** (e.g. *General Fund*, *Building Fund*).

The design lets you see activity at any layer and automatically roll-up results for consolidated reporting.

---

## 1. Data Model at a Glance

| Level | Table | Key Columns | Notes |
|-------|-------|-------------|-------|
| Organization / Entity | `entities` | `id` (UUID PK) • `parent_entity_id` (FK → entities.id) • `code` • `name` • `is_consolidated` | A root entity has `parent_entity_id = NULL`. Any entity may own children and/or funds. |
| Fund | `funds` | `id` (UUID PK) • `entity_id` (FK → entities.id) • `code` • `name` | Each fund belongs to one entity only. |

*Self-referencing foreign key* on `entities.parent_entity_id` enables unlimited depths; we use **three** levels.

---

## 2. Setting-Up & Configuring Entities

### 2.1. Create the Top-Level Organization

If you have not already run the helper script, execute:

```sql
-- psql -U postgres -d fund_accounting_db -f add_top_level_organization.sql
```

The script:

* Inserts **The Principle Foundation** with `code = 'TPF_PARENT'`.
* Updates existing child entities to reference it.

### 2.2. Add or Edit Entities in the UI

1. Open **Settings → Entities**.  
2. Click **“Add Entity”** (or the ➕ icon on a parent).  
3. In the modal:
   * **Entity Name / Code** – required, codes should be short (“TPF-ES”).
   * **Parent Entity** – choose *The Principle Foundation* for 2nd-level entities, or another entity for deeper trees.
   * **Consolidate Children** – tick if this entity should roll-up balances from its descendants.
   * Fiscal & currency fields are optional overrides.
4. Save.  The hierarchy tree refreshes instantly.

**Tip:** you can also drag the node header in future releases to re-parent an entity.

### 2.3. Manage Funds

Navigate to **Funds** while an entity is chosen in the selector, then **Add Fund**.  
Funds inherit their parent entity and participate automatically in consolidation.

---

## 3. Consolidation Logic

| Flag | Where | Meaning |
|------|-------|---------|
| `is_consolidated` (boolean) | `entities` | If **true**, reports for this entity include *all* children (entity & fund data). |

Calculation steps:

1. Start with the entity’s own fund balances.
2. Recursively add balances from every fund in child entities.
3. Repeat up the chain until the root.

The **Consolidated View** toggle (header-right) lets a user switch between:

* **Entity-only** – see just the currently selected entity.
* **Consolidated** – include children if `is_consolidated` is enabled.

---

## 5. Advanced Features Integration (v1.x)

Version 1.x introduced several enterprise-grade capabilities that *build on* the entity & fund hierarchy.  
The diagram below shows how each new feature consumes hierarchy metadata.

```
 ┌────────────────────────┐
 │  Natural Language      │
 │  Query (NLQ) Engine    │
 └──────────┬─────────────┘
            │ uses
 ┌──────────▼─────────────┐
 │  Custom Reports        │
 │  Builder               │
 └──────────┬─────────────┘
            │ queries
 ┌──────────▼─────────────┐
 │  Consolidated SQL      │
 │  Views (entities/funds)│
 └──────────┬─────────────┘
            │ sources
 ┌──────────▼─────────────┐
 │  Hierarchical Tables   │
 │  (entities, funds, …)  │
 └────────────────────────┘
```

### 5.1. Natural Language Query (NLQ) System

| Aspect | Integration Point |
|--------|-------------------|
| **Entity Scoping** | Each NLQ request automatically injects `entity_id IN (…)` filters derived from the entity selector. |
| **Fund Awareness** | If the query references a fund code/name, NLQ joins `funds` → `entities` to respect entity ownership. |
| **Consolidation** | When *Consolidated View* is on, NLQ resolves the full descendant list and expands the SQL filter set. |

**Example**  
> “Show expenses over \$1 000 for *Education Fund* this quarter.”  
NLQ SQL fragment:  
```sql
WHERE entity_id IN ('c37c2e7c-…')            -- selected entity + children
  AND fund_id   =  (SELECT id FROM funds
                    WHERE code = 'EDU-FND'
                      AND entity_id = 'c37c2e7c-…')
  AND debit > 1000
  AND entry_date BETWEEN '2025-04-01' AND '2025-06-30';
```

### 5.2. Custom Reports Builder

* **Entity Filter Widget** – defaults to the current entity path; users may expand to siblings if they hold permission.  
* **Fund Filter Widget** – fund dropdown is auto-filtered by the chosen entity.  
* **Group-By** – selecting *Entity* or *Fund* leverages the hierarchy to show roll-ups and grand totals.  
* **Saved Definitions** – persist the selected entity scope so scheduled reports always run in the correct context.

### 5.3. Data Import/Export with Hierarchy

| Import Type | Hierarchy Handling |
|-------------|-------------------|
| **AccuFund Migration** | `accufund-migration-guide.html` maps legacy *Fund* → new *Fund* **within the correct entity**. |
| **CSV Journal Lines** | Requires an `entity_code` column; loader looks up `entities.id` before insert. |
| **Bulk Fund Loader**  | Accepts `parent_entity_code` to attach incoming funds to the proper entity. |

During import the system rejects rows referencing inactive or non-existent entities/funds, ensuring referential integrity.

### 5.4. Docker Deployment Considerations

* **Service Naming** – `PGHOST=db` inside Docker Compose keeps hierarchy SQL scripts unchanged across environments.  
* **Multi-Org Scaling** – spin up additional app containers on the same network; all share the single hierarchy aware database.  
* **Back-ups** – `db-data` named volume captures *all* entity/fund records; nightly `pg_dump` recommended.  
* **Update Scripts** – `scripts/update-linux.sh` and `scripts/update-docker-windows.ps1` preserve hierarchy by backing up the database first then running migrations.

---

## 4. Navigating the Hierarchy

### 4.1. Entity Selector

*Located in the header.*  
Shows root + immediate children.  
Choosing a node filters dashboards, CoA, funds and journal data.

### 4.2. Hierarchy Tree (Settings → Entities)

Visual 3-level tree with expand / collapse:

* 🔄 badge marks entities consolidating children.
* ✏️ edits a node, ➕ adds a child.

### 4.3. Breadcrumb Path

When you pick an entity the dashboard displays  
`Dashboard – The Principle Foundation › TPF-ES` so you never lose context.

### 4.4. Consolidated Toggle

Right of the DB status light.  
Green = consolidated, Grey = entity-only.

---

## 6. Best Practices

1. **Stable Codes** – pick short immutable codes; reports use them as anchors.  
2. **Consolidation** – enable only where necessary (root, regional hubs). Avoid double-counting by *not* enabling it on every level.  
3. **Fiscal Calendars** – keep children aligned with the parent’s fiscal year to simplify roll-ups.  
4. **Permissions** – future ACL can restrict users to branches; design the tree with that in mind.  
5. **Testing** – after structural changes run trial reports:  
   * *Entity-only* vs *Consolidated* totals  
   * Cross-entity inter-company journals  
6. **Archiving** – mark obsolete entities **Inactive** instead of deleting to preserve history.

---

## 7. Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Entity not shown in selector | `status` ≠ 'Active' or missing parent link | Edit entity, set Active & correct parent |
| Fund balance missing from roll-up | Fund’s entity not in the selected path | Check entity hierarchy & consolidation flag |
| Duplicate amounts in consolidated statements | Multiple ancestors have `is_consolidated = true` | Leave consolidation only on desired level |

---

## 8. Further Reading

* **SETUP.md** – deployment & database prerequisites  
* **docs/REPORTS.md** – financial statement configuration  
* **src/js/entity-hierarchy.js** – client-side implementation
* **DOCKER_SETUP_WINDOWS.md** – container deployment guide  
* **mr-moneybags-user-guide.html** – full end-user manual  
* **scripts/update-linux.sh** / **scripts/update-docker-windows.ps1** – automated update workflows

Happy accounting!  
If you have questions or feature requests, open an issue on GitHub.
