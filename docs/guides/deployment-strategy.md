# Deployment Strategy for Nonprofit Fund Accounting v8.8+

_Last updated: 2025-07-16_

---

## 1  Git-Based Code Deployment Workflow
1. **Branching model**  
   • `main` – always production ready  
   • `develop` – integration of completed features before release  
   • `feature/*` – one branch per feature or fix  
   • `hotfix/*` – urgent production fixes  

2. **Typical feature cycle**
```bash
git checkout -b feature/bank-reconciliation
# code, commit locally
git push -u origin feature/bank-reconciliation
# open PR → code review → squash & merge into develop
```

3. **Release**
```bash
# on develop after QA passes
git checkout main
git merge --ff-only develop
git tag -a v8.9.0 -m "Release 8.9.0 – Bank reconciliation"
git push origin main --tags
```

4. **Deployment pull on servers**
```bash
ssh ubuntu@server
cd ~/nonprofit-fund-accounting
git fetch --all
git checkout v8.9.0        # or main
git pull --ff-only
```

---

## 2  Database Migration Strategy

### 2.1 Versioned SQL Scripts
* Directory: `migrations/`
* Naming: `YYYYMMDD_HHMM_description.sql`
* Each script **must be idempotent** (use `IF NOT EXISTS`, `ALTER IF ...`).

Example `20250717_0930_add_bank_accounts_connection_status.sql`
```sql
BEGIN;

ALTER TABLE bank_accounts
    ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) DEFAULT 'Manual';

COMMENT ON COLUMN bank_accounts.connection_status
    IS 'Manual | Plaid | OFX';

COMMIT;
```

### 2.2 Migration Runner
```bash
# install once
npm i -g node-pg-migrate

# run as part of deploy
PGUSER=npfadmin PGPASSWORD=npfa123 \
node-pg-migrate up -d postgres://localhost/fund_accounting_db -m migrations
```

---

## 3  Dependency Management

* **Node.js** – lock with `package-lock.json`.  
  ```bash
  npm install new-lib@^3.2        # local
  npm run test && git add package*.json
  ```
* **Server upgrade** – after pulling code:  
  ```bash
  npm ci       # strict install, no drift
  ```
* **System packages (Ubuntu)** – use `apt` & `apt-mark hold` for critical versions.

---

## 4  Configuration Management

| Key | Description | Default |
|-----|-------------|---------|
| `PGUSER`, `PGPASSWORD` | DB credentials | `npfadmin` / `npfa123` |
| `NODE_ENV` | `development` \| `production` | `production` |
| `PORT` | Backend port | `3000` |

* Template file: `.env.example` – **never commit `.env`**.
* Use `direnv` or `dotenv-vault` for secrets in CI/CD.

---

## 5  Step-by-Step Deployment Process (Ubuntu 22.04)

1. **Prerequisites (one-time)**
   ```bash
   sudo apt update && sudo apt install git nodejs npm postgresql
   sudo npm i -g pm2 node-pg-migrate
   ```

2. **Fetch code**
   ```bash
   git clone https://github.com/<org>/nonprofit-fund-accounting.git
   cd nonprofit-fund-accounting
   git checkout v8.9.0    # or main
   ```

3. **Environment**
   ```bash
   cp .env.example .env
   nano .env              # adjust if needed
   ```

4. **Install dependencies**
   ```bash
   npm ci
   ```

5. **Database**
   ```bash
   sudo -u postgres psql -f setup-database-cross-platform.sql
   # apply new migrations
   node-pg-migrate up -d postgres://npfadmin:npfa123@localhost/fund_accounting_db -m migrations
   ```

6. **Start services with PM2**
   ```bash
   pm2 start server.js --name fund-api
   pm2 start "npx http-server . -p 8080 --no-cache" --name fund-ui
   pm2 save
   ```

7. **Verify**
   ```bash
   curl http://localhost:3000/api/health
   curl http://localhost:8080
   ```

---

## 6  Rollback Procedures

1. **Code rollback**
   ```bash
   git checkout v8.8.2
   npm ci
   pm2 restart fund-api fund-ui
   ```

2. **Database rollback**
   * If a migration causes issues:  
     ```bash
     node-pg-migrate down -1 -d postgres://npfadmin:npfa123@localhost/fund_accounting_db -m migrations
     ```
   * Alternatively restore last nightly dump:  
     ```bash
     psql fund_accounting_db < /backups/2025-07-16.sql
     ```

3. **Config rollback** – restore previous `.env` from `/etc/fund_backup/env_20250716`.

---

## 7  Testing Procedures

| Stage | Tool | Command |
|-------|------|---------|
| Unit   | Jest | `npm test` |
| Lint   | ESLint | `npm run lint` |
| DB Migrations | node-pg-migrate dry-run | `npm run migrate:check` |
| API   | Postman/Newman | `newman run tests/api_collection.json` |
| UI    | Cypress | `npm run cypress:run` |

CI pipeline (GitHub Actions) executes all tests and blocks merge if any fail.

---

## 8  Cross-Platform Considerations

| Concern | Mac | Ubuntu | Windows |
|---------|-----|--------|---------|
| Line endings | `core.autocrlf=input` | default | `core.autocrlf=true` |
| Service manager | `brew services` | `systemd/pm2` | `NSSM / Task Scheduler` |
| Paths | `/usr/local/...` | `/usr/bin/...` | `C:\...` |
| DB auth | socket/peer | socket/md5 | TCP `localhost` |

**Tip:** keep all scripts POSIX-compliant (`#!/usr/bin/env bash`) and avoid OS-specific commands inside migrations.

---

## Example Upgrade Scenario

> _Goal_: add “connection_status” to `bank_accounts`, upgrade npm lib `pdf-lib` and change API rate limit.

1. Create migration `20250801_1200_add_connection_status.sql` (see §2).
2. Update code & add UI field.
3. `npm install pdf-lib@^2.10 && npm i`.
4. Update `.env.example` adding `RATE_LIMIT=100/min`.
5. PR → CI passes → merge & tag `v8.10.0`.
6. On Ubuntu server follow §5; migrations and dependencies are applied automatically.
7. Run quick smoke tests (§7).

---

### **Keep this document in `/docs/deployment-strategy.md` and update with every release.**
