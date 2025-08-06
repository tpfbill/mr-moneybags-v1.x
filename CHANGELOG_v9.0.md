# Change Log – Version 1.x  
*Release date: 21 July 2025*

---

## ✨ Highlights
| # | Area | Summary |
|---|------|---------|
| 1 | **Massive Directory Re-organisation** | 182 cluttered root-level items reduced to 110 core files; everything else moved into purpose-built sub-folders. |
| 2 | **Professional Repository Layout** | Clear separation of application, database, debug, test, and documentation assets. |
| 3 | **Documentation Overhaul** | All guides updated – every script and SQL reference now points to its new location. |
| 4 | **Clean Git History for v1.x** | Fresh repository initialised, version set to **1.0.0**. |
| 5 | **Feature Parity** | All v8.9 vendor-payment functionality (modal fixes, NACHA generation, API endpoints) fully preserved. |
| 6 | **Future-Ready** | Structure supports automated tests, CI pipelines, and modular feature development. |

---

## 🗂️ New Directory Map

| Directory | Purpose |
|-----------|---------|
| `database/` | Schema, migration & seed scripts (`db-init.sql`, `setup-database-cross-platform.sql`, `load-principle-foundation-data.js`, etc.) |
| `debug/` | One-off debug and hot-fix scripts, experimental HTML/JS test beds. |
| `tests/` | Automated and manual test pages (`test-batches.html`, `api-tester.html`, etc.). |
| `documentation/` | Generated / hand-authored guides (`Administrator_Guide_v8.8.html`, AccuFund migration docs…). |
| `src/` | Application source (CSS, JS modules, DB helpers). |
| `archive/` | PDFs and legacy artefacts kept for historical reference. |
| *Root* | Core application entry points (`index.html`, `server.js`, `vendor-payments.html`, `package.json`, `README.md`, `nacha-generator.js`). |

---

## 🔄 Detailed Changes

### 1. Repository Clean-Up
* Removed over **70** ad-hoc debug/test items from root.
* Grouped **SQL & loader scripts** inside `database/`.
* Moved **38** debug JS/HTML utilities to `debug/`.
* Consolidated **17** test harnesses under `tests/`.
* Relocated **8** standalone documentation pages to `documentation/`.

### 2. Documentation Updates
* INSTALLATION_GUIDE, README, and ADMINISTRATOR_GUIDE now reference paths such as  
  `database/db-init.sql` and `database/setup-database-cross-platform.sql`.
* All version badges switched to **1.x** (e.g., *v1.0*).
* Added section on new directory layout to each guide.

### 3. Core Functionality Retained
* Vendor payments UI & backend unchanged – entity/fund dropdown fix, NACHA generation, `/api/payment-batches` workflow still green.
* All automated tests pass against reorganised tree.

### 4. Version & Metadata
* `package.json` bumped to `"version": "1.0.0"`.
* New file **CHANGELOG_v1.x.md** freezes the milestone.

---

## ⚙️ Migration Notes (legacy ➜ 1.x)

1. **Clone** or **pull** the new `v9.0` repository ‑ existing databases remain valid.
2. Update any personal scripts that referenced old root-level paths to use the new `database/` location.
3. Re-install node modules (`npm ci`) – no dependency changes.
4. Start servers as usual:  
   ```bash
   node server.js            # backend (port 3000)
   npx http-server . -p 8080 --no-cache   # frontend
   ```

---

## 🎉 Credits

Big thanks to everyone who helped tame the file jungle and bring a professional layout to life. This restructuring sets the stage for faster development, cleaner pull requests, and simpler onboarding for new contributors.

*– The Non-Profit Fund Accounting Team*
