# Documentation Overview (v9.0)

Welcome to the **Non-Profit Fund Accounting** documentation set.  
All materials in this `docs/` folder have been updated for **version 9.0** and reorganised to make it easier for both users and developers to find what they need quickly.

---

## 1. Directory Layout

| Directory | Audience | What you will find |
|-----------|----------|--------------------|
| `guides/` | Implementers & Admins | Step-by-step walkthroughs, deployment guides, migration playbooks and comparison white-papers. |
| `manuals/` | End-users & Administrators | Formal product manuals in PDF form (User & Administrator Guides). |
| `utilities/` | Power-users & Support | Stand-alone HTML tools, diagnostics and helper pages that ship with the application. |
| `development/` | Developers & Contributors | Design specs, integration notes and other dev-centric reference material. |

---

## 2. Contents by Sub-directory

### `guides/`
| File | Purpose |
|------|---------|
| `AccuFund_Migration_Guide_v9.0.pdf` | Detailed instructions for migrating legacy AccuFund data into v9.0. |
| `AccuFund_Migration_Steps_v9.0.pdf` | High-level migration checklist for project leads. |
| `AccuFund_Verification_Procedure_v9.0.pdf` | Post-migration validation steps to confirm data integrity. |
| `INSTALLATION_GUIDE_VirtualBox_Ubuntu24.md` | Local install guide using VirtualBox + Ubuntu 24.04 LTS. |
| `Ubuntu_Deployment_Guide_v9.0.md` | Production deployment on bare-metal or VM running Ubuntu 24.04. |
| `Ubuntu_Deployment_Quick_Reference.md` | One-page cheat-sheet for seasoned admins. |
| `DOCKER_SETUP_WINDOWS.md` | Running the full stack with Docker Desktop on Windows 11. |
| `Zoho_Books_Comparison_v9.0.pdf` | Feature matrix comparing NFA with Zoho Books (v9.0 snapshot). |
| `custom-vs-third-party-reporting.md` | Pros/cons of the built-in report builder vs third-party BI tools. |
| `reporting-tools-comparison.md` | Comparative overview of available reporting solutions. |
| `deployment-strategy.md` | Guidance on blue/green, rolling and canary deployment options. |

### `manuals/`
| File | Purpose |
|------|---------|
| `Administrator_Guide_v9.0.pdf` | Full administrative reference: configuration, security, maintenance. |
| `User_Guide_v9.0.pdf` | End-user handbook: day-to-day workflows, screenshots and tips. |

### `utilities/`
These HTML pages can be opened directly in a browser (they load the live app context).

| File | Purpose |
|------|---------|
| `vendor-payments-working.html` | Minimal vendor-payments interface used to validate NACHA export flow. |
| `db-status.html` | Quick database health & connectivity check. |
| `force-load.html` | Utility to force-refresh all cached master data. |
| `custom-reports-builder.html` | Stand-alone report builder for ad-hoc queries. |
| `inter-entity-transfer-wizard.html` | Guided wizard for inter-entity fund transfers. |
| `natural-language-queries.html` | NLQ prototype—query financial data using plain language. |
| `standalone-hierarchy.html` | Read-only entity/fund hierarchy viewer. |
| `direct-docs.html` | Index page that links directly to every document in `docs/`.

### `development/`
| File | Purpose |
|------|---------|
| `HIERARCHY_GUIDE.md` | Internal data-model notes for entity & fund hierarchy. |
| `INTER_ENTITY_WIZARD_INTEGRATION.md` | API contracts and UI flow for the transfer wizard module. |

---

## 3. How to Use This Documentation

1. **New installations** – start in `guides/` with the appropriate installation or deployment guide, then review the Administrator Guide in `manuals/`.
2. **Migrating from AccuFund** – follow the three-part migration series in `guides/` (guide → steps checklist → verification).
3. **Every-day users** – download or view `User_Guide_v9.0.pdf` in `manuals/`.
4. **Advanced troubleshooting or demos** – open tools in `utilities/` directly from your browser.
5. **Developers** – read `development/` docs first, then explore the source code.

Navigation tips:
• In GitHub, click into any subdirectory to see its files.  
• From within the application container, run `open docs/direct-docs.html` (macOS) or browse to it to get a single page linking everything.  
• Search by filename or keyword in the repository if you are unsure where a topic lives.

---

## 4. Versioning

All documents here target **Non-Profit Fund Accounting version 9.0**.  
When a new major version ships, the current `docs/` folder will be snap-shotted to `archive/` and a fresh vNext set will replace it, so links remain stable.

---

*Last updated: 22 July 2025*  
For questions or contributions, open an issue or pull request on GitHub.
