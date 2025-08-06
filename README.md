# Mr-Moneybags-v1.x – Non-Profit Fund Accounting System

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/your-organization/mr-moneybags-v1.x/releases)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D%2018.0.0-brightgreen.svg)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%3E%3D%2014.0-blue.svg)](https://www.postgresql.org)

Mr-Moneybags-v1.x is a **production-ready, end-to-end fund-accounting platform** built for charities, foundations, and other non-profit organizations that require strict fund segregation, transparent reporting, and automated payment workflows.

Designed from the ground up with a **fully-modular Node.js backend and a proven, battle-tested frontend**, the system delivers enterprise-grade features such as NACHA payment batch generation, multi-entity consolidation, and audit-ready double-entry bookkeeping—without the price tag of commercial products.

---

## Table of Contents

- [Key Features](#key-features)
- [Installation](#installation)
  - [Prerequisites](#prerequisites)
  - [Setup Steps](#steps)
- [Quick Start Guide](#quick-start)
- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [Documentation](#documentation)
- [Development](#development)
  - [Local Development Setup](#local-development-setup)
  - [Testing](#testing)
  - [Code Standards](#code-standards)
- [Deployment](#deployment)
  - [Production Considerations](#production-considerations)
  - [Security Checklist](#security-checklist)
- [Screenshots & Demo](#screenshots--demo)
- [Release Notes](#release-notes)
- [Contributing](#contributing)
- [License](#license)
- [Contact & Support](#contact)

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
| **Deployability** | • One-command setup scripts for Ubuntu & macOS |

---

## Installation

### Prerequisites
* Node.js ≥ 18  
* PostgreSQL ≥ 14  
* Git  

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-organization/mr-moneybags-v1.x.git
cd mr-moneybags-v1.x

# 2. Install server dependencies
npm install

# 3. Configure environment
cp .env.example .env
# ⇢ Edit .env with your database credentials, SMTP settings, etc.

# 4. Initialize the database
npm run db:init       # Runs the database initialization script
npm run db:seed       # Loads sample entities, funds, vendors, etc.

# 5. Start the server
npm start
```

---

## Quick Start

After installation, follow these steps to get up and running quickly:

1. **Access the application**: Open `http://localhost:8080` in your browser.  

2. **Log in**: Use the default admin account:
   - Username: `admin@example.com`
   - Password: `changeme`
   - **Important**: Change this password immediately after first login!

3. **Configure your organization**:
   - Navigate to **Settings → Entities** to set up your organizational structure
   - Add your main entity and any sub-entities or departments
   - Create funds under each entity as needed

4. **Set up accounting structure**:
   - Go to **Chart of Accounts** to customize your account structure
   - Create or modify funds under **Funds Management**
   - Set up bank accounts under **Settings → Bank Accounts**

5. **Configure payment processing**:
   - Navigate to **Settings → Vendors** to add vendors
   - Configure **Settings → NACHA** with your bank routing information
   - Switch to **Vendor Payments** tab to create payment batches

6. **Create your first journal entry**:
   - Go to **Journal Entries** and click "New Journal Entry"
   - Select accounts, enter amounts, and post the transaction

7. **Generate reports**:
   - Visit **Fund Reports** to view financial statements
   - Use **Custom Reports** for specialized reporting needs

8. **Process vendor payments**:
   - Go to **Vendor Payments**
   - Select an entity & NACHA profile
   - Upload invoices and click **Create Batch**
   - Download the **.txt** NACHA file and upload it to your bank portal

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
PostgreSQL ‑ Normalized schema (15 tables)  
```

* **Backend Modularization:** Core logic is decomposed into self-contained route modules under `src/routes/`, orchestrated by a lightweight `server-modular.js` bootstrapper (≈114 LOC).  
* **Database Layer:** A single `connection.js` handles pooling and is shared via dependency injection.  
* **Frontend:** Original monolithic JS restored for stability; gradual, size-controlled refactors planned.

For an interactive view of the data model and service architecture:

* [Database ER Diagram](./database-er-diagram.html) - Interactive database schema visualization
* [Backend Architecture Diagram](./backend-architecture-diagram.html) - Node.js/Express API structure
* [Frontend Architecture Diagram](./frontend-architecture-diagram.html) - Client-side component structure

---

## Technology Stack

* **Node.js / Express** – RESTful API & middleware  
* **PostgreSQL** – ACID-compliant relational database  
* **JavaScript (ES2022)** – Frontend logic (vanilla + Chart.js)  
* **HTML5 / CSS3 / Bootstrap 5** – Responsive UI  
* **Mermaid / D3** – (Docs) architecture & data-flow visualizations

---

## Documentation

| Topic | Link |
| ----- | ---- |
| Administrator Guide | [`docs/manuals/Administrator_Guide_v1.x.md`](docs/manuals/Administrator_Guide_v1.x.md) |
| User Guide | [`docs/manuals/User_Guide_v1.x.md`](docs/manuals/User_Guide_v1.x.md) |
| Developer Guide | [`docs/development/HIERARCHY_GUIDE.md`](docs/development/HIERARCHY_GUIDE.md) |
| Ubuntu Deployment | [`docs/guides/Ubuntu_Deployment_Guide_v1.x.md`](docs/guides/Ubuntu_Deployment_Guide_v1.x.md) |
| Ubuntu Quick Reference | [`docs/guides/Ubuntu_Deployment_Quick_Reference_v1.x.md`](docs/guides/Ubuntu_Deployment_Quick_Reference_v1.x.md) |
| Database Schema | [`database/db-init.sql`](database/db-init.sql) |
| API Reference | _Coming soon_ |

---

## Development

### Local Development Setup

For developers who want to contribute or customize the application:

```bash
# Clone the repository
git clone https://github.com/your-organization/mr-moneybags-v1.x.git
cd mr-moneybags-v1.x

# Install dependencies
npm install

# Set up development environment
cp .env.example .env.development
# Edit .env.development with your local database credentials

# Create a development database
createdb fund_accounting_dev -U your_postgres_user

# Initialize the database with schema and sample data
psql -U your_postgres_user -d fund_accounting_dev -f database/db-init.sql
psql -U your_postgres_user -d fund_accounting_dev -f database/insert-complete-nacha-data.sql

# Start the development server with auto-reload
npm run dev
```

### Testing

```bash
# Run the test suite
npm test

# Run tests with coverage report
npm run test:coverage

# Run linting
npm run lint
```

### Code Standards

This project follows these coding standards:

- **JavaScript**: ESLint with Airbnb preset
- **SQL**: PostgreSQL best practices
- **Git**: Conventional Commits specification
- **Documentation**: JSDoc for API documentation

---

## Deployment

### Production Considerations

For production deployments, follow these additional steps:

1. **Secure your environment**:
   ```bash
   # Create a production .env file
   cp .env.example .env.production
   # Edit with secure credentials, disable debug mode
   ```

2. **Set up a production database**:
   ```bash
   # Create a dedicated database user with limited permissions
   createuser -P npfadmin
   createdb fund_accounting_prod -O npfadmin
   
   # Initialize with schema only (no sample data)
   psql -U npfadmin -d fund_accounting_prod -f database/db-init.sql
   ```

3. **Configure a process manager**:
   ```bash
   # Install PM2 globally
   npm install -g pm2
   
   # Start the application with PM2
   pm2 start server-modular.js --name mr-moneybags
   
   # Configure PM2 to start on system boot
   pm2 startup
   pm2 save
   ```

4. **Set up a reverse proxy** (Nginx example):
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **Secure with HTTPS**:
   ```bash
   # Install Certbot
   sudo apt install certbot python3-certbot-nginx
   
   # Obtain and configure SSL certificate
   sudo certbot --nginx -d your-domain.com
   ```

### Security Checklist

Before going live, ensure you've addressed these security considerations:

- [ ] Changed all default passwords
- [ ] Configured proper database user permissions
- [ ] Enabled HTTPS with valid SSL certificate
- [ ] Set secure HTTP headers
- [ ] Implemented regular database backups
- [ ] Configured firewall rules
- [ ] Set up monitoring and alerting
- [ ] Performed security audit and penetration testing

For detailed deployment instructions, see [`docs/guides/Ubuntu_Deployment_Guide_v1.x.md`](docs/guides/Ubuntu_Deployment_Guide_v1.x.md).

---

## Screenshots & Demo

### Dashboard
![Dashboard](docs/screenshots/dashboard.png)
*The main dashboard showing financial overview and fund balances*

### Journal Entry
![Journal Entry](docs/screenshots/journal-entry.png)
*Creating a balanced journal entry with multiple accounts*

### Entity Management
![Entity Management](docs/screenshots/entity-management.png)
*The entity hierarchy management interface*

### NACHA Payment Processing
![NACHA Payments](docs/screenshots/nacha-payments.png)
*Vendor payment batch creation and NACHA file generation*

**Live Demo**: [https://demo.mr-moneybags.org](https://demo.mr-moneybags.org) (Username: `demo@example.com` / Password: `demoaccess`)

---

## Release Notes

### v1.0.0 (August 2025)
- Initial public release
- Complete fund accounting system with multi-entity support
- NACHA payment processing
- Comprehensive reporting system
- Interactive architecture documentation

For detailed changelog, see [CHANGELOG.md](CHANGELOG.md).

---

## Contributing

We :heart: contributions!

1. Fork the repo & create your branch: `git checkout -b feature/my-awesome-feature`  
2. Commit your changes with clear messages following [Conventional Commits](https://www.conventionalcommits.org/)
3. Ensure `npm run lint && npm test` pass
4. Submit a pull request and describe **what** & **why**
5. One of the maintainers will review, request changes if needed, and merge

Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for coding standards, commit conventions, and the branching model.

---

## License

This project is licensed under the **MIT License** – see the [LICENSE](./LICENSE) file for details.

---

## Contact

* **Project Maintainers:**
  * William Developer – [william@principle.org](mailto:william@principle.org)
  * Fund Accounting Team – [accounting-dev@principle.org](mailto:accounting-dev@principle.org)
  
* **Issues & Support:** [GitHub Issues](https://github.com/your-organization/mr-moneybags-v1.x/issues)

* **Organization:** The Principle Foundation, Kansas City, MO

Need a feature or have a question? Open an issue or reach out—let's build better tools for the non-profit world!

---

© 2025 The Principle Foundation. All rights reserved.
