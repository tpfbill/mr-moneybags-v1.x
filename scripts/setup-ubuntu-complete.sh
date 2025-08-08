#!/bin/bash
#=============================================================================
# Mr-MoneyBags v1.x - Complete Ubuntu Setup Script
#=============================================================================
# This script performs a complete setup of the Mr-MoneyBags application on
# Ubuntu, including database creation, schema setup, and password rehashing.
#
# It handles:
# - Dependency checking (PostgreSQL, Node.js, npm)
# - Database creation using the master schema
# - Password rehashing for cross-platform compatibility
# - Connection testing
# - Clear status messages and error handling
#
# Usage: ./scripts/setup-ubuntu-complete.sh
#=============================================================================

# Set script to exit on any error
set -e

# Color codes for pretty output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Database connection parameters
DB_USER="npfadmin"
DB_PASS="npfa123"
DB_NAME="fund_accounting_db"
DB_HOST="localhost"
DB_PORT="5432"

# Print a section header
section() {
    echo -e "\n${BLUE}=== $1 ===${NC}\n"
}

# Print a success message
success() {
    echo -e "${GREEN}✓ $1${NC}"
}

# Print an info message
info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# Print a warning message
warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Print an error message and exit
error() {
    echo -e "${RED}✗ ERROR: $1${NC}" >&2
    exit 1
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for required dependencies
check_dependencies() {
    section "Checking Dependencies"
    
    # Check for PostgreSQL
    if command_exists psql; then
        PG_VERSION=$(psql --version | grep -oP 'psql \(PostgreSQL\) \K[0-9.]+')
        success "PostgreSQL found (version $PG_VERSION)"
    else
        error "PostgreSQL not found. Please install PostgreSQL 16 or later."
    fi
    
    # Check for Node.js
    if command_exists node; then
        NODE_VERSION=$(node --version)
        success "Node.js found (version $NODE_VERSION)"
    else
        error "Node.js not found. Please install Node.js 18 or later."
    fi
    
    # Check for npm
    if command_exists npm; then
        NPM_VERSION=$(npm --version)
        success "npm found (version $NPM_VERSION)"
    else
        error "npm not found. Please install npm."
    fi
    
    # Check for bcrypt module
    if npm list bcrypt >/dev/null 2>&1 || npm list -g bcrypt >/dev/null 2>&1; then
        success "bcrypt module found"
    else
        warning "bcrypt module not found. It will be installed in the next step."
    fi
    
    # Check for pg module
    if npm list pg >/dev/null 2>&1 || npm list -g pg >/dev/null 2>&1; then
        success "pg module found"
    else
        warning "pg module not found. It will be installed in the next step."
    fi
}

# Install Node.js dependencies (project-level)
install_dependencies() {
    section "Installing Node.js Dependencies"
    cd "$PROJECT_ROOT" || error "Unable to change to project root."

    # Prefer npm ci when package-lock.json exists for reproducible installs
    if [ -f "package-lock.json" ]; then
        info "Running 'npm ci' (clean, reproducible install)..."
        if npm ci --no-audit --no-fund; then
            success "npm dependencies installed successfully (ci)"
        else
            error "npm ci failed. Please review the error messages above."
        fi
    else
        info "Running 'npm install'..."
        if npm install --no-audit --no-fund; then
            success "npm dependencies installed successfully"
        else
            error "npm install failed. Please review the error messages above."
        fi
    fi
}

# Create the database using the master schema
create_database() {
    section "Creating Database"
    
    info "Using master schema from: database/master-schema.sql"
    info "This will create:"
    info "- PostgreSQL role: $DB_USER"
    info "- Database: $DB_NAME"
    info "- All tables and sample data"
    
    # Check if the database already exists
    if sudo -u postgres psql -lqt | grep -qw "$DB_NAME"; then
        warning "Database '$DB_NAME' already exists."
        read -p "Do you want to drop and recreate it? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            info "Dropping existing database..."
            sudo -u postgres psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        else
            warning "Skipping database creation. Schema may be incomplete."
            return
        fi
    fi
    
    # Run the master schema script
    info "Creating database and schema (this may take a minute)..."
    if sudo -u postgres psql -f "$PROJECT_ROOT/database/master-schema.sql"; then
        success "Database and schema created successfully!"
    else
        error "Failed to create database and schema."
    fi
}

# Rehash passwords for cross-platform compatibility
rehash_passwords() {
    section "Rehashing Passwords"
    
    info "Rehashing default user passwords for Ubuntu compatibility..."
    
    # Check if the rehash script exists
    if [ ! -f "$PROJECT_ROOT/scripts/rehash-passwords.js" ]; then
        error "Password rehashing script not found at: scripts/rehash-passwords.js"
    fi
    
    # Make sure the script is executable
    chmod +x "$PROJECT_ROOT/scripts/rehash-passwords.js"
    
    # Run the password rehashing script
    if node "$PROJECT_ROOT/scripts/rehash-passwords.js"; then
        success "Passwords rehashed successfully!"
    else
        error "Failed to rehash passwords."
    fi
}

# Test the database connection
test_connection() {
    section "Testing Database Connection"
    
    info "Testing connection to $DB_NAME as $DB_USER..."
    
    # Create a temporary connection test script
    local TEMP_SCRIPT=$(mktemp)
    cat > "$TEMP_SCRIPT" <<EOF
const { Pool } = require('pg');
const pool = new Pool({
  host: '$DB_HOST',
  port: $DB_PORT,
  database: '$DB_NAME',
  user: '$DB_USER',
  password: '$DB_PASS'
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) FROM users');
    console.log(\`Connection successful! Found \${result.rows[0].count} users.\`);
    
    const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    console.log(\`Database contains \${tables.rowCount} tables.\`);
    
    client.release();
    await pool.end();
    return true;
  } catch (err) {
    console.error('Connection error:', err.message);
    return false;
  }
}

testConnection()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
EOF
    
    # Run the test script
    if node "$TEMP_SCRIPT"; then
        success "Database connection test passed!"
    else
        error "Database connection test failed."
    fi
    
    # Clean up the temporary script
    rm "$TEMP_SCRIPT"
}

# Display final instructions
show_final_instructions() {
    section "Setup Complete!"
    
    echo -e "${GREEN}Mr-MoneyBags v1.x has been successfully set up on your Ubuntu system.${NC}"
    echo
    echo -e "${CYAN}To start the application:${NC}"
    echo "1. Start the backend API server:"
    echo "   cd $PROJECT_ROOT && npm start"
    echo
    echo "2. In another terminal, start the frontend server:"
    echo "   cd $PROJECT_ROOT && npx http-server . -p 8080 --no-cache"
    echo
    echo -e "${CYAN}Access the application:${NC}"
    echo "   http://localhost:8080"
    echo
    echo -e "${CYAN}Default login credentials:${NC}"
    echo "   Admin: admin / admin123"
    echo "   User:  user / user123"
    echo
    echo -e "${YELLOW}For production use, please change the default passwords and SESSION_SECRET in .env${NC}"
}

# Main function to run the setup
main() {
    clear
    echo -e "${MAGENTA}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║                                                           ║"
    echo "║           Mr-MoneyBags v1.x - Ubuntu Setup               ║"
    echo "║                                                           ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Check if running as root or with sudo
    if [ "$EUID" -ne 0 ] && [ -z "$SUDO_USER" ]; then
        warning "This script may need sudo privileges for PostgreSQL operations."
        read -p "Continue anyway? (y/n): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Setup aborted. Please run with sudo."
        fi
    fi
    
    # Make sure we're in the project root directory
    cd "$PROJECT_ROOT" || error "Could not change to project root directory."
    
    # Run the setup steps
    check_dependencies
    install_dependencies
    create_database
    rehash_passwords
    test_connection
    show_final_instructions
}

# Run the main function
main
