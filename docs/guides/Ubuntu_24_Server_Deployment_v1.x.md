# Mr. MoneyBags v1.x – Ubuntu 24.04 LTS Server Deployment Guide

_Last updated: August 2025_

---

## 1. Overview & Prerequisites

Mr. MoneyBags (MMB) is a Node.js + PostgreSQL web application served behind Nginx.  
These instructions assume:

* Ubuntu 24.04 LTS minimal/server install
* DNS A/AAAA record for the site (e.g. `accounting.example.org`)
* A **sudo-enabled** user (e.g. your login user)  
* Outbound internet access for apt / git / certbot

### Quick facts

| Component | Purpose | Runs as |
|-----------|---------|---------|
| Node 20.x | API backend (port 3000 internal) | `mrmb` system user |
| Nginx     | HTTPS termination, static file hosting, proxy `/api/` to Node | `www-data` |
| PostgreSQL| Application database (can be local or external) | `postgres` |

---

## 2. Reference Architecture

```
┌─────────┐   HTTPS 443              ┌────────────────────┐
│ Client  │ ───────────────►  Nginx  │  Static html / js  │
└─────────┘                          └────────────────────┘
                          │
                          │ proxy /api/*
                          ▼
                    Node.js (systemd)  –  server-modular.js  (port 3000)
                          │
                          ▼
                     PostgreSQL
```

* **Nginx** serves all static assets from `$APP_DIR` and proxies `/api/` to Node.
* **Node** runs as an unprivileged user under systemd with secure cookie + trust-proxy.
* **PostgreSQL** may live on the same host or another server (set `DATABASE_URL`).

---

## 3. Variable Cheat-Sheet

| Variable | Example value | Description |
|----------|---------------|-------------|
| `DOMAIN` | `accounting.example.org` | Fully-qualified domain served by Nginx / TLS |
| `APP_DIR` | `/opt/mr-moneybags` | Directory where the repo is cloned |
| `RUN_USER` | `mrmb` | Unix user that runs Node |
| `SERVICE_NAME` | `mr-moneybags` | systemd unit name |

You can override these in the one-shot installer (`deployment/ubuntu24/install.sh`).

---

## 4. Step-by-Step Deployment

### 4.1  Update System

```bash
sudo apt update && sudo apt upgrade -y
```

### 4.2  Install Node 20.x LTS, Git, Nginx, UFW

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs git nginx ufw
```

### 4.3  Create Service User & Application Directory

```bash
sudo useradd -m -r -s /bin/bash mrmb
sudo mkdir -p /opt/mr-moneybags
sudo chown mrmb:mrmb /opt/mr-moneybags
```

### 4.4  Obtain Source Code

```bash
sudo -u mrmb git clone --branch main https://github.com/OWNER/REPO.git /opt/mr-moneybags
```

(Substitute **OWNER/REPO** and **branch** as required.)

### 4.5  Environment Configuration

```bash
cd /opt/mr-moneybags
sudo -u mrmb cp .env.example .env
sudo -u mrmb nano .env            # fill SESSION_SECRET, DATABASE_URL, etc.
```

Key variables:

* `SESSION_SECRET` – long random string
* `DATABASE_URL` – `postgres://user:pass@host:5432/db`
* `CORS_ORIGINS`  – leave blank for same-origin

### 4.6  Install Node Dependencies

```bash
cd /opt/mr-moneybags
sudo -u mrmb npm install --omit=dev
# rebuild native bcrypt if needed
sudo -u mrmb npm rebuild bcrypt --build-from-source
```

### 4.7  Install & Enable systemd Unit

```bash
sudo cp deployment/ubuntu24/mr-moneybags.service /etc/systemd/system/mr-moneybags.service
sudo systemctl daemon-reload
sudo systemctl enable --now mr-moneybags
```

> If you changed `APP_DIR` or `RUN_USER`, edit the unit file accordingly.

### 4.8  Configure Nginx Site

```bash
sudo cp deployment/ubuntu24/nginx/mr-moneybags.conf /etc/nginx/sites-available/mr-moneybags.conf
sudo sed -i "s/accounting.example.org/ACCOUNTING.DOMAIN.TLD/g" /etc/nginx/sites-available/mr-moneybags.conf
sudo ln -sf /etc/nginx/sites-available/mr-moneybags.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4.9  Obtain TLS Certificate (Let’s Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d accounting.example.org
```

Certificates are auto-renewed via systemd timers.

### 4.10  Firewall Rules

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
```

### 4.11  Verify Deployment

```bash
# Service status
sudo systemctl status mr-moneybags

# Logs (Ctrl-C to quit)
sudo journalctl -u mr-moneybags -f

# Health check
curl -k https://accounting.example.org/api/health
```

Expected JSON:

```json
{"status":"OK","message":"Server running","version":"9.0.0"}
```

---

## 5. Maintenance

| Task | Command |
|------|---------|
| Pull latest code | `sudo -u mrmb git -C /opt/mr-moneybags pull` |
| Reinstall deps   | `sudo -u mrmb npm install --omit=dev` |
| Restart service  | `sudo systemctl restart mr-moneybags` |
| Follow logs      | `sudo journalctl -u mr-moneybags -f` |

### Rolling back

```bash
sudo -u mrmb git -C /opt/mr-moneybags checkout <previous-commit>
sudo systemctl restart mr-moneybags
```

(Optionally tag stable releases so you can `git checkout v1.0.3`.)

---

## 6. Appendix

### 6.1  One-Shot Installer

Instead of manual steps you can run:

```bash
sudo bash deployment/ubuntu24/install.sh
```

Edit the variables at the top of the script (`DOMAIN`, `GIT_URL`, etc.) before running.  
The script performs every step above: packages, user, clone, install, systemd, Nginx, UFW.

### 6.2  Local PostgreSQL Quick-Setup

```bash
sudo apt install -y postgresql
sudo -u postgres psql <<'SQL'
CREATE USER mrmb_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE mrmb_db OWNER mrmb_user;
GRANT ALL PRIVILEGES ON DATABASE mrmb_db TO mrmb_user;
\q
SQL
```

Set in `.env`:

```
DATABASE_URL=postgresql://mrmb_user:STRONG_PASSWORD@localhost:5432/mrmb_db
```

Restart:

```bash
sudo systemctl restart mr-moneybags
```

---

### 6.3  File Locations Summary

| Path | Purpose |
|------|---------|
| `/opt/mr-moneybags` | Application code & static files |
| `/opt/mr-moneybags/.env` | Environment variables |
| `/etc/systemd/system/mr-moneybags.service` | systemd unit |
| `/etc/nginx/sites-available/mr-moneybags.conf` | Nginx site |
| `/var/www/letsencrypt` | ACME HTTP-01 challenges |

---

Happy accounting! 🚀
