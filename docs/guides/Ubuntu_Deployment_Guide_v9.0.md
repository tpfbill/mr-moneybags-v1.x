# Ubuntu Deployment Guide – v1.x  
_Deploying & Updating **Mr-Moneybags-v1.x** on Ubuntu 22.04 LTS_

---

## Table of Contents
1.  Prerequisites & Initial Setup  
2.  Standard Deployment Workflow (Future Enhancements)  
3.  Database Migration Procedure  
4.  Service Management with PM2  
5.  Health Checks & Validation  
6.  Roll-Back Procedures  
7.  Troubleshooting Common Issues  
8.  Deployment Scenarios (Examples)  
9.  Best Practices & Safety Considerations  
10. Maintenance & Monitoring  

---

## 1  Prerequisites & Initial Setup

| Item | Recommended Version | Install Command |
|------|--------------------|-----------------|
| Ubuntu Server | 22.04 LTS (64-bit) | N/A |
| PostgreSQL | 16 + | `sudo apt install -y postgresql` |
| Node.js | ≥ 18 LTS | `curl -fsSL https://deb.nodesource.com/setup_18.x \| sudo -E bash -`<br>`sudo apt install -y nodejs` |
| Git | latest in repo | `sudo apt install -y git` |
| PM2 | 5.x (global) | `sudo npm i -g pm2` |
| Migration tool | node-pg-migrate | `sudo npm i -g node-pg-migrate` |
| Curl & jq | for health checks | `sudo apt install -y curl jq` |

### 1.1 System User & Directory Layout
```bash
sudo adduser --system --group fundapp
sudo mkdir -p /opt/mr-moneybags-v1.x
sudo chown -R fundapp:fundapp /opt/mr-moneybags-v1.x
```

### 1.2 Database Bootstrap  (one-time)
```bash
#
# Two idempotent helper scripts now ship with the repository:
#   • **setup-ubuntu-database.sh**  – _full fresh install_
#   • **fix-ubuntu-permissions.sh** – _repair / data-load on existing server_
#
# ──────────────────────────────────────────────────────────────────
# A)  Fresh Installation  (first time on a new server)
# ──────────────────────────────────────────────────────────────────
sudo chmod +x setup-ubuntu-database.sh
sudo ./setup-ubuntu-database.sh
# • creates *npfadmin / npfa123* role
# • (re)creates **fund_accounting_db**
# • runs **db-init.sql**   → tables & constraints
# • grants ALL + DEFAULT privileges to npfadmin
# • loads The Principle Foundation test data (entities, funds, **23 journal entries**)
# • writes/updates `.env`
#
# ──────────────────────────────────────────────────────────────────
# B)  Fix Existing Installation  (permission errors, missing data)
# ──────────────────────────────────────────────────────────────────
sudo chmod +x fix-ubuntu-permissions.sh
sudo ./fix-ubuntu-permissions.sh
# • repairs schema/table/sequence privileges for npfadmin
# • re-runs test-data loader (safe & idempotent)
#
# Both scripts are safe to run multiple times.  If you prefer
# manual SQL, you can still run:
#   sudo -u postgres psql -f setup-database-cross-platform.sql
```

---

## 2  Standard Deployment Workflow (Future Enhancements)

> **All commands run as _fundapp_ user unless noted**

```bash
sudo -iu fundapp
cd /opt/mr-moneybags-v1.x

# 1. Fetch changes
git fetch --all --tags

# 2. Checkout release tag or main
git checkout v1.0.0        # example
git pull --ff-only

# 3. Install exact dependencies
npm ci

# 4. Apply migrations (see §3)
npm run migrate:prod       # or manual commands below

# 5. Restart services (see §4)
pm2 restart fund-api fund-ui
```

Expected output:
```
> git checkout v1.0.0
HEAD is now at 1ab23cd Release 1.0.0 – initial Mr-Moneybags release
> npm ci
added 321, removed 4, audited 325 packages in 7s
```

---

## 3  Database Migration Procedure

### 3.1 Migration Files
* Stored in `migrations/`
* Naming: `YYYYMMDD_HHMM_description.sql`
* **Idempotent** – always use `IF NOT EXISTS`

Example:
```sql
ALTER TABLE bank_accounts
    ADD COLUMN IF NOT EXISTS connection_status VARCHAR(20) DEFAULT 'Manual';
```

### 3.2 Running Migrations
```bash
# Run baseline script (safe to repeat)
psql -U npfadmin -d postgres -f setup-database-cross-platform.sql

# Apply every .sql file in chronological order
for f in migrations/*.sql; do
  psql -U npfadmin -d fund_accounting_db -f "$f"
done
```
_or_ use node-pg-migrate:
```bash
DATABASE_URL=postgres://npfadmin:npfa123@localhost/fund_accounting_db \
node-pg-migrate up
```

Expected success message:
```
CREATE TABLE
ALTER TABLE
Completed migration 20250801_1200_add_connection_status
```

---

## 4  Service Management with PM2

### 4.1 First-time Startup
```bash
# API  (uses the `start` script from package.json → `node server-modular.js`)
pm2 start "npm start" --name fund-api
pm2 start "npx http-server . -p 8080 --no-cache" --name fund-ui
pm2 save
pm2 startup systemd -u fundapp --hp /home/fundapp
```

### 4.2 Common PM2 Commands
| Action | Command |
|--------|---------|
| List processes | `pm2 ls` |
| View logs | `pm2 logs fund-api` |
| Restart | `pm2 restart fund-api fund-ui` |
| Stop | `pm2 stop fund-api fund-ui` |
| Remove | `pm2 delete fund-api` |

---

## 5  Health Checks & Validation

### 5.1 API Health Endpoint
```bash
curl -s http://localhost:3000/api/health | jq
```
Expected:
```json
{
  "status":"OK",
  "message":"Server running",
  "connected":true
}
```

### 5.2 Frontend Check
```bash
curl -I http://localhost:8080 | head -n1
# HTTP/1.1 200 OK
```

### 5.3 Database Check
```bash
psql -U npfadmin -d fund_accounting_db -c "SELECT COUNT(*) FROM entities;"
```

---

## 6  Rollback Procedures

### 6.1 Git Rollback
```bash
git checkout v1.0.0        # known good tag
npm ci
pm2 restart fund-api fund-ui
```

### 6.2 Database Rollback
If migrations were applied with `node-pg-migrate`:
```bash
node-pg-migrate down -1
```
Or restore nightly dump:
```bash
pg_restore -U npfadmin -d fund_accounting_db /backups/2025-07-16.dump
```

### 6.3 Full Rollback Script
`deploy-ubuntu.sh --rollback` automatically:
* Restores previous commit
* Restores `.env`
* Restores `database.dump`
* Restarts services

---

## 7  Troubleshooting Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `DB Offline` in UI | PostgreSQL stopped | `sudo systemctl start postgresql` |
| PM2 shows **errored** | Env vars missing | Copy `.env.example` → `.env`, then `pm2 restart fund-api` |
| `could not connect to server: Connection refused` | Wrong `PGHOST`/port | Verify `.env` and `pg_hba.conf` |
| Migrations fail on “duplicate column” | Script not idempotent | Wrap column add in `IF NOT EXISTS` |

Logs to inspect:
```bash
tail -n 50 ~/.pm2/logs/fund-api-error.log
journalctl -u postgresql
```

---

## 8  Deployment Scenarios (Examples)

### 8.1 Deploy Main Branch Nightly
```bash
./deploy-ubuntu.sh --branch main
```

### 8.2 Deploy Specific Hotfix
```bash
./deploy-ubuntu.sh --tag v1.0.1-hotfix
```

### 8.3 Skip Dependency Install (small CSS tweak)
```bash
./deploy-ubuntu.sh --skip-dependencies
```

### 8.4 Force Deploy Ignoring Failed Health Check (maintenance window)
```bash
./deploy-ubuntu.sh --force
```

---

## 9  Best Practices & Safety Considerations

* **Use Tags** – tag each release (`git tag v1.0.0`) for reproducibility.  
* **Nightly Backups** – `pg_dump -Fc` to `/backups`.  
* **Environment Isolation** – never edit `.env` directly on server; use `scp` and reload.  
* **Least Privilege** – application uses `npfadmin`, management uses `postgres`.  
* **Idempotent Scripts** – every SQL migration should be safe to rerun.  
* **CI / CD** – automate tests and linting before merge to `main`.  
* **Monitor Logs** – integrate `pm2-logrotate` to prevent disk bloat.  

---

## 10  Maintenance & Monitoring

### 10.1 Automated Tasks
| Task | Frequency | Tool |
|------|-----------|------|
| Log rotation | daily | `pm2 install pm2-logrotate` |
| DB dump | nightly | `cron + pg_dump -Fc` |
| OS updates | weekly | `unattended-upgrades` |
| Security scan | monthly | `lynis audit system` |

### 10.2 Service Status Dashboard
```bash
pm2 monit          # live CPU / memory / restart count
```

### 10.3 Upgrade Node & PM2
```bash
sudo npm i -g n
sudo n 18          # upgrade to latest LTS
sudo npm i -g pm2@latest
pm2 update
```

---

## Appendix A – Reference Commands

```bash
# Quick start (first server install)
git clone https://github.com/tpfbill/mr-moneybags.git /opt/mr-moneybags-v1.x
cd /opt/mr-moneybags-v1.x
cp .env.example .env
npm ci
psql -U postgres -f setup-database-cross-platform.sql
pm2 start "npm start" --name fund-api
pm2 start "npx http-server . -p 8080 --no-cache" --name fund-ui
pm2 save
```

You are now ready to **develop, deploy, and evolve** **Mr-Moneybags-v1.x** on Ubuntu with confidence.  
Happy deploying! 🚀
