# Mr-Moneybags-v1.x – Non-Profit Fund Accounting System

Mr-Moneybags-v1.x is a **production-ready, end-to-end fund-accounting platform** built for charities, foundations, and other non-profit organizations that require strict fund segregation, transparent reporting, and automated payment workflows.

Designed from the ground up with a **fully-modular Node.js backend and a proven, battle-tested frontend**, the system delivers enterprise-grade features such as NACHA payment batch generation, multi-entity consolidation, and audit-ready double-entry bookkeeping—without the price tag of commercial products.

---

## Key Features

| Category | Highlights |
| -------- | ---------- |
| **Payments** | • Automated ACH / NACHA batch creation<br>• Vendor management with 1099 tracking<br>• Payment approval workflow |
| **Entity Management** | • Three-level entity hierarchy (Organization → Entity → Fund)<br>• Drag-and-drop re-organization with circular-reference protection<br>• Consolidated or stand-alone reporting toggles |
| **Accounting** | • Double-entry journal engine<br>• Full chart-of-accounts, funds, and bank accounts modules<br>• Accrual or cash basis support |
| **Reporting** | • Financial position, functional expenses, budget vs. actual, and custom report builder<br>• CSV / PDF / Excel export |
| **Modularity** | • 13 focused route modules (`/src/routes/*`)<br>• Centralized database connection & helpers<br>• Plug-and-play middleware stack |
| **Operations** | • Uploads endpoint with secure file-system isolation<br>• Robust error handling & structured logging |
| **Security** | • Role-based access control (RBAC) scaffold<br>• Parameterized SQL with prepared statements to mitigate injection |
| **Deployability** | • Docker & docker-compose templates<br>• One-command setup scripts for Ubuntu & macOS |

---

## Installation

### Prerequisites
* Node.js ≥ 18  
* PostgreSQL ≥ 14  
* Git  
* (Optional) Docker & Docker Compose

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/mr-moneybags-v1.x.git
cd mr-moneybags-v1.x

# 2. Install server dependencies
npm install

# 3. Configure environment
cp .env.example .env
# ⇢ Edit .env with your database credentials, SMTP settings, etc.

# 4. Initialize the database
npm run db:init       # Runs the SQL migration set
npm run db:seed       # Loads sample entities, funds, vendors, etc.

# 5. Start the server
npm start
```

> **Docker users**: `docker compose up --build` will perform steps 3-5 automatically.

---

## Quick Start

1. Open `http://localhost:3000` in your browser.  
2. Log in with the default admin account (`admin@example.com` / `changeme`).  
3. Navigate to **Settings → Vendors** to add a vendor.  
4. Configure **Settings → NACHA** with your bank routing information.  
5. Switch to **Vendor Payments** tab, select an entity & NACHA profile, upload invoices, and click **Create Batch**.  
6. Download the **.txt** NACHA file and upload it to your bank portal—done!

---

## Architecture Overview

```
Client (HTML/JS/CSS)
        │
        ▼
Express.js API  ──►  13 Route Modules
        │              • accounts.js
        │              • bank-accounts.js
        │              • entities.js
        │              • funds.js
        │              • journal-entries.js
        │              • nacha-files.js
        │              • …
        │
        ▼
PostgreSQL ‑ Normalized schema (16 tables)  
```

* **Backend Modularization:** Core logic is decomposed into self-contained route modules under `src/routes/`, orchestrated by a lightweight `server-modular.js` bootstrapper (≈114 LOC).  
* **Database Layer:** A single `connection.js` handles pooling and is shared via dependency injection.  
* **Frontend:** Original monolithic JS restored for stability; gradual, size-controlled refactors planned.

For an interactive view of the data model and service diagram:

* [Entity-Relationship Diagram](./database-er-diagram.html)  
* [Application Architecture Diagram](./application-architecture-diagram.html)

---

## Technology Stack

* **Node.js / Express** – RESTful API & middleware  
* **PostgreSQL** – ACID-compliant relational database  
* **JavaScript (ES2022)** – Frontend logic (vanilla + Chart.js)  
* **HTML5 / CSS3 / Bootstrap 5** – Responsive UI  
* **Docker** – Optional containerization for production parity  
* **Mermaid / D3** – (Docs) architecture & data-flow visualizations

---

## Documentation

| Topic | Link |
| ----- | ---- |
| Full User Guide | `docs/manuals/Administrator_Guide.md` |
| Developer Setup | `docs/development/HIERARCHY_GUIDE.md` |
| Ubuntu Deployment | `docs/guides/Ubuntu_Deployment_Guide_v9.0.md` |
| Database Scripts | `database/` |
| API Reference | _auto-generated soon_ |

---

## Contributing

We :heart: contributions!

1. Fork the repo & create your branch: `git checkout -b feature/my-awesome-feature`  
2. Commit your changes with clear messages.  
3. Ensure `npm run lint && npm test` pass.  
4. Submit a pull request and describe **what** & **why**.  
5. One of the maintainers will review, request changes if needed, and merge.

Please read `CONTRIBUTING.md` for coding standards, commit conventions, and the branching model.

---

## License

This project is licensed under the **MIT License** – see the [LICENSE](./LICENSE) file for details.

---

## Contact

* **Project Lead:** William Developer – `william@example.org`  
* **Issues & Support:** [GitHub Issues](https://github.com/your-org/mr-moneybags-v1.x/issues)  
* **Organization:** The Principle Foundation, Kansas City, MO  

Need a feature or have a question? Open an issue or reach out—let’s build better tools for the non-profit world!
