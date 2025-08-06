#!/bin/bash
#
# fix-ubuntu-permissions.sh
#
# Quick fix script for Ubuntu database permissions in nonprofit-fund-accounting
# This script:
# 1. Fixes permissions for the npfadmin user
# 2. Loads journal entries using load-principle-foundation-data.js
# 3. Verifies everything works
# 4. Is safe to run on an existing system without destroying data
#
# This script is idempotent (safe to run multiple times)

# Set error handling
set -e  # Exit immediately if a command exits with a non-zero status
trap 'echo "Error occurred at line $LINENO. Command: $BASH_COMMAND"' ERR

# Configuration
DB_USER="npfadmin"
DB_PASSWORD="npfa123"
DB_NAME="fund_accounting_db"
POSTGRES_USER="postgres"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

log_info() {
  echo -e "${BLUE}ℹ️ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠️ $1${NC}"
}

log_error() {
  echo -e "${RED}❌ $1${NC}"
}

# Function to check if PostgreSQL service is running
check_postgres_service() {
  log_info "Checking PostgreSQL service status..."
  if ! systemctl is-active --quiet postgresql; then
    log_warning "PostgreSQL service is not running. Attempting to start..."
    sudo systemctl start postgresql
    if ! systemctl is-active --quiet postgresql; then
      log_error "Failed to start PostgreSQL service."
      exit 1
    fi
  fi
  log_success "PostgreSQL service is running."
}

# Function to check if user exists
check_user_exists() {
  log_info "Checking if user '$DB_USER' exists..."
  if ! sudo -u $POSTGRES_USER psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    log_error "User '$DB_USER' does not exist. Please create it first or run the full setup script."
    log_info "You can create the user with: sudo -u postgres psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';\""
    exit 1
  fi
  log_success "User '$DB_USER' exists."
}

# Function to check if database exists
check_database_exists() {
  log_info "Checking if database '$DB_NAME' exists..."
  if ! sudo -u $POSTGRES_USER psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    log_error "Database '$DB_NAME' does not exist. Please create it first or run the full setup script."
    log_info "You can create the database with: sudo -u postgres psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\""
    exit 1
  fi
  log_success "Database '$DB_NAME' exists."
}

# Function to fix permissions for npfadmin user
fix_permissions() {
  log_info "Fixing permissions for user '$DB_USER'..."
  
  # Grant database-level privileges
  sudo -u $POSTGRES_USER psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  
  # Grant schema-level privileges
  sudo -u $POSTGRES_USER psql -d $DB_NAME <<EOF
-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO $DB_USER;

-- Grant privileges on all tables
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;

-- Grant privileges on all sequences
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;

-- Grant privileges on all functions
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO $DB_USER;
EOF
  
  log_success "Permissions fixed successfully."
}

# Function to load journal entries
load_journal_entries() {
  log_info "Loading journal entries using load-principle-foundation-data.js..."
  
  # Check if script exists
  if [ ! -f "$SCRIPT_DIR/load-principle-foundation-data.js" ]; then
    log_error "load-principle-foundation-data.js not found in $SCRIPT_DIR"
    exit 1
  fi
  
  # Set environment variables for the script
  export PGUSER=$DB_USER
  export PGPASSWORD=$DB_PASSWORD
  export PGDATABASE=$DB_NAME
  
  # Run the script
  node "$SCRIPT_DIR/load-principle-foundation-data.js"
  
  if [ $? -eq 0 ]; then
    log_success "Journal entries loaded successfully."
  else
    log_error "Failed to load journal entries."
    exit 1
  fi
}

# Function to verify journal entries
verify_journal_entries() {
  log_info "Verifying journal entries..."
  
  # Set environment variables
  export PGUSER=$DB_USER
  export PGPASSWORD=$DB_PASSWORD
  export PGDATABASE=$DB_NAME
  
  # Check if we can connect to the database
  if ! psql -c "SELECT 1;" > /dev/null 2>&1; then
    log_error "Cannot connect to database as $DB_USER."
    exit 1
  fi
  
  # Check journal entries count
  JOURNAL_COUNT=$(psql -tAc "SELECT COUNT(*) FROM journal_entries;")
  if [ "$JOURNAL_COUNT" -gt 0 ]; then
    log_success "Journal entries table has $JOURNAL_COUNT records."
  else
    log_warning "Journal entries table is empty. The script ran but didn't create any entries."
  fi
}

# Main execution
echo "=================================================="
echo "  Nonprofit Fund Accounting - Ubuntu Permissions Fix  "
echo "=================================================="
echo

# Check prerequisites
check_postgres_service
check_user_exists
check_database_exists

# Fix permissions and load data
fix_permissions
load_journal_entries
verify_journal_entries

echo
echo "=================================================="
log_success "Permissions fixed and journal entries loaded successfully!"
echo
log_info "You can now start the application with:"
echo "  cd $SCRIPT_DIR"
echo "  node server.js &"
echo "  python3 -m http.server 8080 &"
echo
log_info "Access the application at: http://localhost:8080"
echo "=================================================="

exit 0
