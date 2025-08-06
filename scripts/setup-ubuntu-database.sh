#!/bin/bash
#
# setup-ubuntu-database.sh
#
# Comprehensive Ubuntu database setup script for nonprofit-fund-accounting
# This script:
# 1. Sets up PostgreSQL service
# 2. Creates the npfadmin user with proper permissions
# 3. Creates/recreates the fund_accounting_db database
# 4. Sets up all tables using db-init.sql
# 5. Grants all necessary permissions to npfadmin
# 6. Loads The Principle Foundation test data
# 7. Verifies everything works
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

# Function to check if PostgreSQL is installed
check_postgres_installed() {
  log_info "Checking if PostgreSQL is installed..."
  if ! command -v psql &> /dev/null; then
    log_error "PostgreSQL is not installed. Please install PostgreSQL 15 or later."
    log_info "You can install it with: sudo apt update && sudo apt install postgresql postgresql-contrib"
    exit 1
  fi
  log_success "PostgreSQL is installed."
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

# Function to create database user
create_db_user() {
  log_info "Creating database user '$DB_USER'..."
  
  # Check if user already exists
  if sudo -u $POSTGRES_USER psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    log_warning "User '$DB_USER' already exists. Updating password..."
    sudo -u $POSTGRES_USER psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
  else
    # Create new user
    sudo -u $POSTGRES_USER psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
  fi
  
  # Grant necessary role permissions
  sudo -u $POSTGRES_USER psql -c "ALTER USER $DB_USER WITH CREATEDB;"
  
  log_success "Database user '$DB_USER' configured successfully."
}

# Function to create/recreate database
create_database() {
  log_info "Setting up database '$DB_NAME'..."
  
  # Check if database exists
  if sudo -u $POSTGRES_USER psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    log_warning "Database '$DB_NAME' already exists."
    
    # Ask for confirmation before dropping
    read -p "Do you want to drop and recreate the database? This will delete all data! (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      log_warning "Dropping database '$DB_NAME'..."
      sudo -u $POSTGRES_USER psql -c "DROP DATABASE $DB_NAME;"
      sudo -u $POSTGRES_USER psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
      log_success "Database '$DB_NAME' recreated successfully."
    else
      log_info "Keeping existing database. Will attempt to update schema if needed."
    fi
  else
    # Create new database
    sudo -u $POSTGRES_USER psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    log_success "Database '$DB_NAME' created successfully."
  fi
  
  # Grant privileges on database
  sudo -u $POSTGRES_USER psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
}

# Function to set up database schema
setup_database_schema() {
  log_info "Setting up database schema..."

  # NOTE:
  #   db-init.sql creates the `pgcrypto` extension which provides the
  #   gen_random_uuid() function used throughout the schema (UUID PKs).
  #
  #   All database files live in the repository-root `database/` directory,
  #   so we reference them via "$SCRIPT_DIR/../database/…"

  # Run db-init.sql to create tables
  if [ -f "$SCRIPT_DIR/../database/db-init.sql" ]; then
    log_info "Running db-init.sql..."
    sudo -u $POSTGRES_USER psql -d $DB_NAME -f "$SCRIPT_DIR/../database/db-init.sql"
    log_success "Database schema created successfully."
  else
    log_error "db-init.sql not found (expected at $SCRIPT_DIR/../database)"
    exit 1
  fi
}

# Function to grant permissions to user
grant_permissions() {
  log_info "Granting permissions to '$DB_USER'..."
  
  # Grant schema permissions
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
  
  log_success "Permissions granted successfully."
}

# Function to load test data
load_test_data() {
  log_info "Loading The Principle Foundation test data..."
  
  # Check if load-principle-foundation-data.js exists
  if [ -f "$SCRIPT_DIR/../database/load-principle-foundation-data.js" ]; then
    # Set environment variables for the script
    export PGUSER=$DB_USER
    export PGPASSWORD=$DB_PASSWORD
    export PGDATABASE=$DB_NAME
    
    # Run the script
    node "$SCRIPT_DIR/../database/load-principle-foundation-data.js"
    
    if [ $? -eq 0 ]; then
      log_success "Test data loaded successfully."
    else
      log_error "Failed to load test data."
      exit 1
    fi
  else
    log_error "load-principle-foundation-data.js not found in $SCRIPT_DIR/../database"
    exit 1
  fi
}

# Function to verify database setup
verify_database() {
  log_info "Verifying database setup..."
  
  # Set environment variables
  export PGUSER=$DB_USER
  export PGPASSWORD=$DB_PASSWORD
  export PGDATABASE=$DB_NAME
  
  # Check if we can connect to the database
  if ! psql -c "SELECT 1;" > /dev/null 2>&1; then
    log_error "Cannot connect to database as $DB_USER."
    exit 1
  fi
  
  # Check if entities table exists and has data
  ENTITY_COUNT=$(psql -tAc "SELECT COUNT(*) FROM entities;")
  if [ "$ENTITY_COUNT" -gt 0 ]; then
    log_success "Entities table exists with $ENTITY_COUNT records."
  else
    log_error "Entities table is empty or does not exist."
    exit 1
  fi
  
  # Check if journal entries exist
  JOURNAL_COUNT=$(psql -tAc "SELECT COUNT(*) FROM journal_entries;")
  log_info "Journal entries table has $JOURNAL_COUNT records."
  
  # Check if funds exist
  FUND_COUNT=$(psql -tAc "SELECT COUNT(*) FROM funds;")
  log_info "Funds table has $FUND_COUNT records."
  
  log_success "Database verification completed successfully."
}

# Function to update .env file
update_env_file() {
  log_info "Updating .env file..."
  
  # Create or update .env file
  cat > "$SCRIPT_DIR/.env" <<EOF
# Database Configuration
PGUSER=$DB_USER
PGPASSWORD=$DB_PASSWORD
PGDATABASE=$DB_NAME
PGHOST=localhost

# Server Configuration
PORT=3000
NODE_ENV=development
EOF
  
  log_success ".env file updated successfully."
}

# Main execution
echo "=================================================="
echo "  Nonprofit Fund Accounting - Ubuntu Setup Script  "
echo "=================================================="
echo

# Check prerequisites
check_postgres_installed
check_postgres_service

# Setup database
create_db_user
create_database
setup_database_schema
grant_permissions
load_test_data
verify_database
update_env_file

echo
echo "=================================================="
log_success "Database setup completed successfully!"
echo
log_info "You can now start the application with:"
echo "  cd $SCRIPT_DIR"
echo "  node server.js &"
echo "  python3 -m http.server 8080 &"
echo
log_info "Access the application at: http://localhost:8080"
echo "=================================================="

exit 0
