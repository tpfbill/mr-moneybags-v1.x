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

section "Setting Up Nginx"
# Create webroot for Let's Encrypt
mkdir -p /var/www/letsencrypt
chown -R www-data:www-data /var/www/letsencrypt

# Install certbot
apt-get install -y certbot python3-certbot-nginx

# Copy and configure Nginx site
NGINX_CONF="/etc/nginx/sites-available/$SERVICE_NAME.conf"

if [[ -f deployment/ubuntu24/nginx/mr-moneybags.conf ]]; then
  cp deployment/ubuntu24/nginx/mr-moneybags.conf "$NGINX_CONF"
  
  # Update domain and root if they differ from defaults
  sed -i "s|accounting.example.org|$DOMAIN|g" "$NGINX_CONF"
  
  if [[ "$APP_DIR" != "/opt/mr-moneybags" ]]; then
    sed -i "s|root /opt/mr-moneybags;|root $APP_DIR;|g" "$NGINX_CONF"
  fi
  
  success "Created Nginx configuration: $NGINX_CONF"
else
  error "Nginx configuration template not found at deployment/ubuntu24/nginx/mr-moneybags.conf"
fi

# Enable site
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/

# Test Nginx configuration
nginx -t

# Reload Nginx
systemctl reload nginx
success "Nginx configuration applied"

section "Obtaining SSL Certificate"
echo "To obtain an SSL certificate, run the following command:"
echo -e "${YELLOW}  certbot --nginx -d $DOMAIN${RESET}"
echo "Or for non-interactive mode:"
echo -e "${YELLOW}  certbot --nginx --non-interactive --agree-tos --email your-email@example.com -d $DOMAIN${RESET}"

section "Configuring Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'

if ! ufw status | grep -q "Status: active"; then
  echo "Enabling UFW firewall..."
  ufw --force enable
  success "UFW firewall enabled"
else
  success "UFW firewall already enabled"
fi

section "Installation Complete"
echo "Mr. MoneyBags has been installed and configured!"
echo -e "Service status: ${BOLD}systemctl status $SERVICE_NAME${RESET}"
echo -e "Check API health: ${BOLD}curl -k https://$DOMAIN/api/health${RESET}"
echo -e "View logs: ${BOLD}journalctl -u $SERVICE_NAME -f${RESET}"
echo ""
echo -e "${YELLOW}IMPORTANT:${RESET} Remember to:"
echo "1. Edit your .env file with proper database credentials"
echo "2. Obtain SSL certificate using certbot command above"
echo "3. Update your DNS records to point $DOMAIN to this server's IP address"
echo ""
echo -e "${GREEN}Thank you for using Mr. MoneyBags!${RESET}"
