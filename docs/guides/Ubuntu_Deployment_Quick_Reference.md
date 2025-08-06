# Ubuntu Deployment – Quick Reference (v8.8+)

**Server user:** `fundapp`  **App dir:** `/opt/nonprofit-fund-accounting`

---

## 1. Essential Deployment Commands

| Scenario | Command |
|----------|---------|
| **Standard update (main)** | `cd /opt/nonprofit-fund-accounting && git pull && npm ci && ./deploy-ubuntu.sh` |
| **Deploy release tag** | `./deploy-ubuntu.sh --tag v8.9.0` |
| **Deploy feature branch** | `./deploy-ubuntu.sh --branch feature/x` |
| **Skip dependency install** | `./deploy-ubuntu.sh --skip-dependencies` |
| **Skip DB migrations** | `./deploy-ubuntu.sh --skip-migrations` |
| **Force deploy (ignore failed checks)** | `./deploy-ubuntu.sh --force` |

---

## 2. Common Troubleshooting

```bash
# Backend / frontend logs
pm2 logs fund-api       # API
pm2 logs fund-ui        # UI

# PostgreSQL status & logs
sudo systemctl status postgresql
journalctl -u postgresql -n 50

# Port usage
sudo lsof -i :3000
sudo lsof -i :8080
```

---

## 3. Health Checks

```bash
# API
curl -s http://localhost:3000/api/health | jq

# Front-end
curl -I http://localhost:8080 | head -n1    # 200 OK

# Database
psql -U npfadmin -d fund_accounting_db -c "SELECT 1;"
```

---

## 4. Rollback

| Action | Command |
|--------|---------|
| Previous version | `./deploy-ubuntu.sh --rollback` |
| Specific tag     | `./deploy-ubuntu.sh --rollback v8.8.4` |
| Revert last migration | `node-pg-migrate down -1` |
| DB restore dump | `pg_restore -U npfadmin -d fund_accounting_db /backups/FILE.dump` |

---

## 5. Emergency Procedures

```bash
# Stop all app services
pm2 stop fund-api fund-ui

# Stop PostgreSQL (last resort)
sudo systemctl stop postgresql

# Disable incoming traffic (ufw)
sudo ufw deny 80/tcp
sudo ufw deny 443/tcp
```

*After stabilising, run rollback (above) then `pm2 restart fund-api fund-ui` and re-enable UFW.*

---

## 6. Key File Locations

| Path | Purpose |
|------|---------|
| `/opt/nonprofit-fund-accounting/.env` | Runtime environment variables |
| `/opt/nonprofit-fund-accounting/migrations/` | Versioned SQL migrations |
| `/var/log/nonprofit-fund-accounting/` | Deployment & script logs |
| `~/.pm2/logs/` | PM2 service logs |
| `/opt/backups/nonprofit-fund-accounting/` | Code & DB backups (auto by script) |

---

## 7. Service Management (PM2 & Systemd)

```bash
# PM2
pm2 ls                          # list services
pm2 restart fund-api fund-ui    # graceful reload
pm2 save && pm2 startup         # persist across reboot

# PostgreSQL
sudo systemctl restart postgresql
sudo systemctl enable postgresql
```

---

**Tip:** keep this card handy during maintenance windows for rapid reference.  
For full details see `Ubuntu Deployment Guide – v8.8`. 🚀
