#!/bin/bash
# ==============================================================================
# Production Update Script for Nonprofit Fund Accounting Application
# ==============================================================================
# This script automates the process of updating the application on a Linux
# server. It is designed to be safe and includes backup, verification, and
# automatic rollback capabilities.
#
# USAGE:
#   1. Make sure this script is executable: chmod +x update-linux.sh
#   2. Run the script: ./update-linux.sh
#
# ==============================================================================

# --- Configuration ---
# Exit immediately if a command exits with a non-zero status.
set -e
# The return value of a pipeline is the status of the last command to exit with a non-zero status.
set -o pipefail

# --- Variables (Customize these for your environment) ---
APP_DIR="/home/npfa/nonprofit-fund-accounting"
BACKUP_DIR="/home/npfa/backups"
SERVICE_NAME="npfa.service"
DB_NAME="fund_accounting_db"
DB_USER="postgres"
GIT_BRANCH="v8.5"

# --- Color Codes for Output ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# --- Global variables for rollback ---
PREVIOUS_COMMIT_HASH=""
DB_BACKUP_PATH=""
APP_BACKUP_PATH=""

# --- Functions ---

# Function to print messages
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to handle errors and trigger rollback
handle_error() {
    log_error "An error occurred on line $1."
    rollback_changes "Automatic rollback triggered due to an error."
}

# Set up error trapping
trap 'handle_error $LINENO' ERR

# Function to create backups
create_backup() {
    log_info "Starting backup process..."
    mkdir -p "$BACKUP_DIR"
    
    local TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    DB_BACKUP_PATH="$BACKUP_DIR/db_backup_${TIMESTAMP}.sql"
    APP_BACKUP_PATH="$BACKUP_DIR/app_backup_${TIMESTAMP}.tar.gz"

    log_info "Backing up database '$DB_NAME' to $DB_BACKUP_PATH..."
    sudo -u "$DB_USER" pg_dump "$DB_NAME" > "$DB_BACKUP_PATH"
    if [ $? -ne 0 ]; then
        log_error "Database backup failed!"
        exit 1
    fi

    log_info "Backing up application directory '$APP_DIR' to $APP_BACKUP_PATH..."
    tar -czf "$APP_BACKUP_PATH" -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")"
    if [ $? -ne 0 ]; then
        log_error "Application backup failed!"
        exit 1
    fi

    log_info "Cleaning up old backups (older than 30 days)..."
    find "$BACKUP_DIR" -name "*.sql" -mtime +30 -delete
    find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

    log_info "${GREEN}Backup completed successfully.${NC}"
}

# Function to pull latest code from GitHub
pull_latest_code() {
    log_info "Fetching latest code from GitHub branch '$GIT_BRANCH'..."
    cd "$APP_DIR"
    
    PREVIOUS_COMMIT_HASH=$(git rev-parse HEAD)
    log_info "Current version (commit): $PREVIOUS_COMMIT_HASH"
    
    git fetch origin
    git reset --hard "origin/$GIT_BRANCH"
    
    log_info "${GREEN}Successfully pulled latest code.${NC}"
}

# Function to update dependencies
update_dependencies() {
    log_info "Checking for dependency changes..."
    cd "$APP_DIR"
    
    # Check if package.json or package-lock.json has changed
    if git diff --quiet "$PREVIOUS_COMMIT_HASH" HEAD -- "package.json" "package-lock.json"; then
        log_info "No dependency changes detected. Skipping 'npm install'."
    else
        log_warn "Dependency files (package.json/package-lock.json) have changed. Running 'npm install'..."
        npm install
        log_info "${GREEN}Dependencies updated successfully.${NC}"
    fi
}

# Function to restart the application service
restart_application() {
    log_info "Restarting application service '$SERVICE_NAME'..."
    sudo systemctl restart "$SERVICE_NAME"
    
    log_info "Waiting for service to initialize..."
    sleep 5 # Give the service a moment to start up
}

# Function to verify the update
verify_update() {
    log_info "Verifying update..."
    
    # 1. Check if the service is active
    if ! sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        log_error "Service '$SERVICE_NAME' is not active after restart!"
        sudo systemctl status "$SERVICE_NAME"
        return 1
    fi
    log_info "Service is active."

    # 2. Check the application's health endpoint
    local HEALTH_URL="http://localhost:3000/api/health"
    local HTTP_STATUS=$(curl -o /dev/null -s -w "%{http_code}" "$HEALTH_URL")
    
    if [ "$HTTP_STATUS" -ne 200 ]; then
        log_error "Health check failed! Application returned HTTP status $HTTP_STATUS from $HEALTH_URL."
        return 1
    fi
    log_info "Health check passed (HTTP 200)."
    
    log_info "${GREEN}Update verified successfully! Application is running correctly.${NC}"
}

# Function to rollback changes in case of failure
rollback_changes() {
    log_error "!!! UPDATE FAILED !!!"
    log_warn "--- STARTING AUTOMATIC ROLLBACK ---"
    
    # Restore from Git
    if [ -n "$PREVIOUS_COMMIT_HASH" ]; then
        log_warn "Reverting code to previous commit: $PREVIOUS_COMMIT_HASH"
        cd "$APP_DIR"
        git reset --hard "$PREVIOUS_COMMIT_HASH"
        log_info "Code reverted. Re-installing old dependencies..."
        npm install
    else
        log_error "Could not find previous commit hash. Manual code restore may be needed from backup."
    fi

    # Restore database
    if [ -f "$DB_BACKUP_PATH" ]; then
        log_warn "Restoring database from backup: $DB_BACKUP_PATH"
        sudo -u "$DB_USER" psql -c "DROP DATABASE IF EXISTS $DB_NAME;"
        sudo -u "$DB_USER" psql -c "CREATE DATABASE $DB_NAME;"
        sudo -u "$DB_USER" psql -d "$DB_NAME" -f "$DB_BACKUP_PATH"
    else
        log_error "Could not find database backup file. Manual database restore is required."
    fi
    
    # Restart application with old code
    log_warn "Restarting application with rolled-back code..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 5
    
    if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        log_info "${GREEN}Rollback complete. Application has been restored to its previous state.${NC}"
    else
        log_error "Failed to restart application after rollback. Manual intervention is required."
        log_error "Check service status with: sudo systemctl status $SERVICE_NAME"
    fi
    
    exit 1
}

# --- Main Script Execution ---
main() {
    log_info "=============================================="
    log_info "Starting Nonprofit Fund Accounting Update"
    log_info "=============================================="
    
    create_backup
    pull_latest_code
    update_dependencies
    restart_application
    verify_update
    
    log_info "${GREEN}==============================================${NC}"
    log_info "${GREEN}  Update Complete and Successfully Deployed!  ${NC}"
    log_info "${GREEN}==============================================${NC}"
}

# Run the main function
main
