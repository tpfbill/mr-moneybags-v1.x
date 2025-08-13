#!/usr/bin/env bash
# Mr. MoneyBags Installation Script for Ubuntu 24.04 LTS
# This script installs and configures all components needed to run the application

# Exit on error, undefined variables, and pipe failures
set -euo pipefail

# Configuration variables - customize these before running
DOMAIN="accounting.example.org"  # Domain name for the application
GIT_URL="https://github.com/OWNER/REPO.git"  # REQUIRED: Repository URL
BRANCH="main"  # Git branch to deploy
APP_DIR="/opt/mr-moneybags"  # Application installation directory
SERVICE_NAME="mr-moneybags"  # Systemd service name
RUN_USER="mrmb"  # System user to run the application

# HTTP / TLS behaviour
# Set to "true" via CLI flag --http-only to skip certbot and serve plain HTTP.
HTTP_ONLY="false"

# ---------------------------------------------------------------------------
# Database-related defaults (override via CLI or .env)
# ---------------------------------------------------------------------------
# Modes:
#   skip       – do nothing (default)
#   create     – create role & database only (setup-database.sql)
#   schema     – create role/db + load schema only (no sample data)
#   full       – create role/db + schema + built-in sample data (db-init.sql)
#   macdump    – schema + Mac test dataset
#   principle  – schema + run load-principle-foundation-data.js
DB_MODE="skip"
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="fund_accounting_db"
DB_USER="npfadmin"
DB_PASSWORD="npfa123"

# ---------------------------------------------------------------------------
# Usage helper
# ---------------------------------------------------------------------------
usage() {
  cat <<EOF
Mr. MoneyBags Ubuntu 24 Installer

Usage: sudo ./install.sh [options]

Options:
  --domain=FQDN          Public domain (default: $DOMAIN)
  --repo=URL             Git repository URL
  --branch=NAME          Git branch to deploy (default: $BRANCH)
  --app-dir=PATH         Install directory (default: $APP_DIR)
  --user=USERNAME        System user to run service (default: $RUN_USER)
  --db=MODE              Database setup mode (skip|create|schema|full|macdump|principle)
  --http-only           Configure Nginx for HTTP only (no SSL/certbot)
  -h, --help             Show this help and exit

Database modes:
  skip       No DB operations (default)
  create     Role & DB only
  schema     Role/DB + schema (no data)
  full       Role/DB + schema + built-in sample data
  macdump    Schema + sample-data-mac-export.sql
  principle  Schema + load-principle-foundation-data.js
EOF
  exit 0
}

# ---------------------------------------------------------------------------
# CLI argument parsing (very light)
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case $arg in
    --domain=*)      DOMAIN="${arg#*=}"       ;;
    --repo=*)        GIT_URL="${arg#*=}"      ;;
    --branch=*)      BRANCH="${arg#*=}"       ;;
    --app-dir=*)     APP_DIR="${arg#*=}"      ;;
    --user=*)        RUN_USER="${arg#*=}"     ;;
    --db=*)          DB_MODE="${arg#*=}"      ;;
    --http-only)     HTTP_ONLY="true"         ;;
    -h|--help)       usage                    ;;
    *)               echo "Unknown option: $arg"; usage ;;
  esac
done

# Text formatting
BOLD="\e[1m"
RED="\e[31m"
GREEN="\e[32m"
YELLOW="\e[33m"
BLUE="\e[34m"
RESET="\e[0m"

# Print section header
section() {
  echo -e "\n${BOLD}${BLUE}==== $1 ====${RESET}\n"
}

# Print success message
success() {
  echo -e "${GREEN}✓ $1${RESET}"
}

# Print error message and exit
error() {
  echo -e "${RED}ERROR: $1${RESET}" >&2
  exit 1
}

# Print warning message
warning() {
  echo -e "${YELLOW}WARNING: $1${RESET}"
}

# ---------------------------------------------------------------------------
# Helper: install postgres client if psql missing
# ---------------------------------------------------------------------------
ensure_postgres_client() {
  if ! command -v psql >/dev/null 2>&1; then
    section "Installing PostgreSQL client"
    apt-get install -y postgresql-client
    success "postgresql-client installed"
  fi
}

# ---------------------------------------------------------------------------
# Helper: ensure local PostgreSQL server running (for create/schema/full)
# ---------------------------------------------------------------------------
ensure_local_postgres() {
  if ! sudo -u postgres psql -Atqc "SELECT 1" >/dev/null 2>&1; then
    section "Installing local PostgreSQL server"
    apt-get install -y postgresql postgresql-contrib
    systemctl enable --now postgresql
    success "PostgreSQL server installed & running"
  fi
}

# ---------------------------------------------------------------------------
# Helper: read .env for PG* overrides if already present
# ---------------------------------------------------------------------------
read_env_if_present() {
  local env_file="$APP_DIR/.env"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    source <(grep -E '^PG(HOST|PORT|DATABASE|USER|PASSWORD)=' "$env_file" | xargs -d '\n' -I{} echo export {})
    DB_HOST="${PGHOST:-$DB_HOST}"
    DB_PORT="${PGPORT:-$DB_PORT}"
    DB_NAME="${PGDATABASE:-$DB_NAME}"
    DB_USER="${PGUSER:-$DB_USER}"
    DB_PASSWORD="${PGPASSWORD:-$DB_PASSWORD}"
  fi
}

# ---------------------------------------------------------------------------
# Helper: run psql command/file using provided credentials
# ---------------------------------------------------------------------------
run_psql() {
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -c "$1"
}

run_psql_file() {
  local file="$1"
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 -f "$file"
}

# ---------------------------------------------------------------------------
# Helper: produce schema-only tmp file from db-init.sql
# ---------------------------------------------------------------------------
make_schema_only_tmp_from_dbinit() {
  TMP_SCHEMA_ONLY="$(mktemp /tmp/mrmb_schema_only.XXXX.sql)"
  # Pull everything up to (but not including) the SAMPLE DATA section,
  # then drop any CREATE EXTENSION statements (extensions are created
  # earlier by setup-database.sql as the postgres superuser).
  awk '/SAMPLE DATA/ {exit} {print}' database/db-init.sql \
    | sed -E '/^[[:space:]]*CREATE[[:space:]]+EXTENSION\b/I d' \
    >"$TMP_SCHEMA_ONLY"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
  error "This script must be run as root. Try: sudo $0"
fi

# Verify GIT_URL is not the placeholder
if [[ "$GIT_URL" == "https://github.com/OWNER/REPO.git" ]]; then
  error "Please set the GIT_URL variable to your actual repository URL before running this script."
fi

section "System Update"
apt-get update
apt-get upgrade -y

section "Installing Required Packages"
apt-get install -y curl git nginx ufw

section "Installing Node.js 20.x"
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  success "Node.js $(node -v) installed"
else
  success "Node.js $(node -v) is already installed"
fi

section "Creating System User"
if ! id "$RUN_USER" &>/dev/null; then
  useradd -m -r -s /bin/bash "$RUN_USER"
  success "Created system user: $RUN_USER"
else
  success "System user $RUN_USER already exists"
fi

section "Setting Up Application Directory"
if [[ ! -d "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  success "Created application directory: $APP_DIR"
else
  success "Application directory already exists: $APP_DIR"
fi

# Ensure proper ownership
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"

section "Deploying Application"
cd "$APP_DIR"

if [[ -d .git ]]; then
  echo "Repository exists, updating..."
  git fetch --all
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
  success "Updated repository to latest $BRANCH"
else
  echo "Cloning repository..."
  git clone --branch "$BRANCH" "$GIT_URL" .
  success "Cloned repository from $GIT_URL (branch: $BRANCH)"
fi

section "Installing Dependencies"
if [[ -f package-lock.json ]]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

# Rebuild bcrypt if needed (architecture-specific binary)
if [[ -d node_modules/bcrypt ]]; then
  npm rebuild bcrypt --build-from-source
fi

success "Installed Node.js dependencies"

section "Environment Configuration"
if [[ ! -f .env ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example .env
    success "Created .env file from example"
    warning "Please edit the .env file with your database credentials and other settings:"
    echo -e "${YELLOW}  nano $APP_DIR/.env${RESET}"
  else
    warning "No .env.example found. You'll need to create a .env file manually."
    touch .env
    chown "$RUN_USER:$RUN_USER" .env
  fi
else
  success "Environment file already exists"
fi

###########################################################################
# Optional Database Setup
###########################################################################

section "Optional Database Setup"
read_env_if_present

case "$DB_MODE" in
  skip)
    success "DB setup skipped (use --db=... to enable)"
    ;;

  create)
    ensure_local_postgres
    sudo -u postgres psql -v ON_ERROR_STOP=1 -f database/setup-database.sql
    success "Role/database ensured via setup-database.sql"
    ;;

  schema)
    ensure_local_postgres
    sudo -u postgres psql -v ON_ERROR_STOP=1 -f database/setup-database.sql
    ensure_postgres_client
    make_schema_only_tmp_from_dbinit
    run_psql_file "$TMP_SCHEMA_ONLY"
    success "Schema loaded (no sample data)"
    ;;

  full)
    ensure_local_postgres
    sudo -u postgres psql -v ON_ERROR_STOP=1 -f database/setup-database.sql
    ensure_postgres_client
    run_psql_file database/db-init.sql
    success "Schema + built-in sample data loaded"
    ;;

  macdump)
    ensure_local_postgres
    sudo -u postgres psql -v ON_ERROR_STOP=1 -f database/setup-database.sql
    ensure_postgres_client
    make_schema_only_tmp_from_dbinit
    run_psql_file "$TMP_SCHEMA_ONLY"
    run_psql_file database/sample-data-mac-export.sql
    success "Schema + Mac test dataset loaded"
    ;;

  principle)
    ensure_local_postgres
    sudo -u postgres psql -v ON_ERROR_STOP=1 -f database/setup-database.sql
    ensure_postgres_client
    make_schema_only_tmp_from_dbinit
    run_psql_file "$TMP_SCHEMA_ONLY"
    sudo -u "$RUN_USER" env \
      PGPASSWORD="$DB_PASSWORD" PGHOST="$DB_HOST" PGPORT="$DB_PORT" \
      PGDATABASE="$DB_NAME" PGUSER="$DB_USER" \
      node database/load-principle-foundation-data.js
    success "Schema + Principle Foundation dataset loaded"
    ;;

  *)
    error "Unknown DB mode: $DB_MODE (valid: skip|create|schema|full|macdump|principle)"
    ;;
esac

section "Setting Up Systemd Service"
SYSTEMD_FILE="/etc/systemd/system/$SERVICE_NAME.service"

if [[ -f deployment/ubuntu24/mr-moneybags.service ]]; then
  cp deployment/ubuntu24/mr-moneybags.service "$SYSTEMD_FILE"
  
  # Update paths and user if they differ from defaults
  if [[ "$APP_DIR" != "/opt/mr-moneybags" ]]; then
    sed -i "s|WorkingDirectory=/opt/mr-moneybags|WorkingDirectory=$APP_DIR|g" "$SYSTEMD_FILE"
  fi
  
  if [[ "$RUN_USER" != "mrmb" ]]; then
    sed -i "s|User=mrmb|User=$RUN_USER|g" "$SYSTEMD_FILE"
    sed -i "s|Group=mrmb|Group=$RUN_USER|g" "$SYSTEMD_FILE"
  fi
  
  success "Created systemd service: $SYSTEMD_FILE"
else
  error "Systemd service template not found at deployment/ubuntu24/mr-moneybags.service"
fi

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start "$SERVICE_NAME"
success "Systemd service enabled and started"

# If running HTTP-only we must ensure cookies are not marked “secure”
if [[ "$HTTP_ONLY" == "true" ]]; then
  sed -i "s|Environment=NODE_ENV=production|Environment=NODE_ENV=development|g" "$SYSTEMD_FILE" || true
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  success "Adjusted service to NODE_ENV=development for HTTP-only (non-secure cookies)"
fi

section "Setting Up Nginx"
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME.conf"
# -------------------------------------------------------------------------
# HTTPS (default) vs HTTP-only configuration
# -------------------------------------------------------------------------
if [[ "$HTTP_ONLY" != "true" ]]; then
  # --------------------------  HTTPS  ------------------------------------
  # Create webroot for Let's Encrypt challenges
  mkdir -p /var/www/letsencrypt
  chown -R www-data:www-data /var/www/letsencrypt

  # Install certbot & its nginx plugin
  apt-get install -y certbot python3-certbot-nginx

  if [[ -f deployment/ubuntu24/nginx/mr-moneybags.conf ]]; then
    cp deployment/ubuntu24/nginx/mr-moneybags.conf "$NGINX_CONF"
    # Replace domain & root path tokens
    sed -i "s|accounting.example.org|$DOMAIN|g" "$NGINX_CONF"
    if [[ "$APP_DIR" != "/opt/mr-moneybags" ]]; then
      sed -i "s|root /opt/mr-moneybags;|root $APP_DIR;|g" "$NGINX_CONF"
    fi
    success "Created HTTPS Nginx configuration: $NGINX_CONF"
  else
    error "Nginx configuration template not found at deployment/ubuntu24/nginx/mr-moneybags.conf"
  fi
else
  # --------------------------  HTTP-only  ---------------------------------
  cat > "$NGINX_CONF" <<HTTP_ONLY_CONF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    root $APP_DIR;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }
}
HTTP_ONLY_CONF
  success "Created HTTP-only Nginx configuration: $NGINX_CONF"
fi

# Enable site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx
success "Nginx configuration applied"

# ---------------------------------------------------------------------------
# SSL certificate instructions (only when HTTPS mode)
# ---------------------------------------------------------------------------
if [[ "$HTTP_ONLY" != "true" ]]; then
  section "Obtaining SSL Certificate"
  echo "To obtain an SSL certificate, run the following command:"
  echo -e "${YELLOW}  certbot --nginx -d $DOMAIN${RESET}"
  echo "Or for non-interactive mode:"
  echo -e "${YELLOW}  certbot --nginx --non-interactive --agree-tos --email your-email@example.com -d $DOMAIN${RESET}"
else
  section "Running in HTTP-only mode"
  echo "This installation is configured for plain HTTP.  To enable HTTPS later:"
  echo -e "${YELLOW}  sudo apt-get install -y certbot python3-certbot-nginx${RESET}"
  echo -e "${YELLOW}  sudo certbot --nginx -d $DOMAIN --redirect${RESET}"
fi

section "Configuring Firewall"
ufw allow OpenSSH
# ---------------------------------------------------------------------------
# Hardened UFW configuration with profile fall-backs
# ---------------------------------------------------------------------------
section "Configuring Firewall"

# Allow SSH – fallback to port 22 if the application profile is absent
if ufw app list >/dev/null 2>&1; then
  if ufw app list | grep -qw OpenSSH; then
    ufw allow OpenSSH
  else
    ufw allow 22/tcp
  fi
else
  ufw allow 22/tcp
fi

# Allow web traffic depending on HTTP-only vs HTTPS mode
if [[ "$HTTP_ONLY" == "true" ]]; then
  if ufw app list >/dev/null 2>&1 && ufw app list | grep -qw "Nginx HTTP"; then
    ufw allow 'Nginx HTTP'
  else
    ufw allow 80/tcp
  fi
else
  if ufw app list >/dev/null 2>&1 && ufw app list | grep -qw "Nginx Full"; then
    ufw allow 'Nginx Full'
  else
    ufw allow 80/tcp
    ufw allow 443/tcp
  fi
fi

# Enable firewall if not already active
if ! ufw status | grep -q "Status: active"; then
  echo "Enabling UFW firewall..."
  ufw --force enable
  success "UFW firewall enabled"
else
  success "UFW firewall already enabled"
fi
echo "Mr. MoneyBags has been installed and configured!"
echo -e "Service status: ${BOLD}systemctl status $SERVICE_NAME${RESET}"
# Show correct health-check URL for the chosen protocol
if [[ "$HTTP_ONLY" == "true" ]]; then
  echo -e "Check API health: ${BOLD}curl http://$DOMAIN/api/health${RESET}"
else
  echo -e "Check API health: ${BOLD}curl -k https://$DOMAIN/api/health${RESET}"
fi
echo -e "View logs: ${BOLD}journalctl -u $SERVICE_NAME -f${RESET}"
echo ""
echo -e "${YELLOW}IMPORTANT:${RESET} Remember to:"
echo "1. Edit your .env file with proper database credentials"
echo "2. Obtain SSL certificate using certbot command above"
echo "3. Update your DNS records to point $DOMAIN to this server's IP address"
if [[ "$HTTP_ONLY" == "true" ]]; then
  echo "   (Running in HTTP-only mode. You can enable HTTPS later with certbot.)"
fi
echo ""
echo "DB setup mode used: $DB_MODE (override with --db=skip|create|schema|full|macdump|principle)"
echo ""
echo -e "${GREEN}Thank you for using Mr. MoneyBags!${RESET}"
