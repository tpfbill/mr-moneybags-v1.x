#!/usr/bin/env bash
# =============================================================================
# deploy-ubuntu.sh
# Deployment script for Nonprofit Fund Accounting system on Ubuntu
# =============================================================================
# This script performs a complete deployment of the application:
# - Pulls latest code from git
# - Installs/updates dependencies
# - Runs database migrations
# - Restarts services
# - Performs health checks
# - Provides rollback capability
# =============================================================================

# Set strict error handling
set -e
set -o pipefail

# =============================================================================
# Configuration
# =============================================================================
APP_DIR="${APP_DIR:-/opt/nonprofit-fund-accounting}"
BACKUP_DIR="${BACKUP_DIR:-/opt/backups/nonprofit-fund-accounting}"
LOG_DIR="${LOG_DIR:-/var/log/nonprofit-fund-accounting}"
GIT_REPO="${GIT_REPO:-https://github.com/tpfbill/nonprofit-fund-accounting.git}"
GIT_BRANCH="${GIT_BRANCH:-main}"
DB_USER="${DB_USER:-npfadmin}"
DB_PASS="${DB_PASS:-npfa123}"
DB_NAME="${DB_NAME:-fund_accounting_db}"
DB_HOST="${DB_HOST:-localhost}"
HEALTH_CHECK_URL="${HEALTH_CHECK_URL:-http://localhost:3000/api/health}"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:8080}"
DEPLOY_TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="${LOG_DIR}/deploy_${DEPLOY_TIMESTAMP}.log"
ROLLBACK_FILE="${APP_DIR}/.rollback_info"
MAX_RETRIES=3
TIMEOUT=10

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =============================================================================
# Helper Functions
# =============================================================================

# Log message to console and log file
log() {
    local message="[$(date +"%Y-%m-%d %H:%M:%S")] $1"
    echo -e "${message}"
    echo "${message}" | sed 's/\x1b\[[0-9;]*m//g' >> "${LOG_FILE}"
}

# Log success message
log_success() {
    log "${GREEN}SUCCESS: $1${NC}"
}

# Log info message
log_info() {
    log "${BLUE}INFO: $1${NC}"
}

# Log warning message
log_warning() {
    log "${YELLOW}WARNING: $1${NC}"
}

# Log error message
log_error() {
    log "${RED}ERROR: $1${NC}"
}

# Display usage information
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Deploy the Nonprofit Fund Accounting application."
    echo
    echo "Options:"
    echo "  -h, --help                 Display this help message"
    echo "  -b, --branch BRANCH        Specify the git branch to deploy (default: main)"
    echo "  -t, --tag TAG              Specify the git tag to deploy"
    echo "  -r, --rollback [VERSION]   Rollback to previous version or specific version"
    echo "  -s, --skip-dependencies    Skip npm dependencies installation"
    echo "  -m, --skip-migrations      Skip database migrations"
    echo "  -n, --no-restart           Don't restart services"
    echo "  -f, --force                Force deployment even if checks fail"
    echo
    echo "Examples:"
    echo "  $0                         Deploy the latest version from main branch"
    echo "  $0 -t v8.9.0               Deploy version v8.9.0"
    echo "  $0 -r                      Rollback to the previous version"
    echo "  $0 -r v8.8.0               Rollback to version v8.8.0"
    echo
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check if running as root or with sudo
check_privileges() {
    if [[ $EUID -ne 0 ]]; then
        log_warning "This script is not running as root. Some operations may fail."
        log_warning "Consider running with sudo if you encounter permission errors."
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_error "Deployment aborted by user."
            exit 1
        fi
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p "${APP_DIR}"
    mkdir -p "${BACKUP_DIR}"
    mkdir -p "${LOG_DIR}"
    
    # Ensure proper permissions
    if [[ $EUID -eq 0 ]]; then
        chown -R $(logname):$(logname) "${APP_DIR}" "${BACKUP_DIR}" "${LOG_DIR}"
    fi
    
    log_success "Directories created."
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_prereqs=false
    
    # Check for required commands
    for cmd in git npm node psql pm2 curl jq; do
        if ! command_exists "$cmd"; then
            log_error "Required command not found: $cmd"
            missing_prereqs=true
            
            # Suggest installation command
            case "$cmd" in
                git)
                    log_info "Install with: sudo apt update && sudo apt install -y git"
                    ;;
                npm|node)
                    log_info "Install with: sudo apt update && sudo apt install -y nodejs npm"
                    ;;
                psql)
                    log_info "Install with: sudo apt update && sudo apt install -y postgresql-client"
                    ;;
                pm2)
                    log_info "Install with: sudo npm install -g pm2"
                    ;;
                curl)
                    log_info "Install with: sudo apt update && sudo apt install -y curl"
                    ;;
                jq)
                    log_info "Install with: sudo apt update && sudo apt install -y jq"
                    ;;
            esac
        fi
    done
    
    # Check PostgreSQL connection
    if ! PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
        log_error "Cannot connect to PostgreSQL database."
        log_info "Check that PostgreSQL is running and credentials are correct."
        log_info "Current settings: DB_USER=${DB_USER}, DB_HOST=${DB_HOST}, DB_NAME=${DB_NAME}"
        missing_prereqs=true
    fi
    
    if [[ "$missing_prereqs" == "true" ]]; then
        if [[ "$FORCE" != "true" ]]; then
            log_error "Prerequisites check failed. Use --force to deploy anyway."
            exit 1
        else
            log_warning "Prerequisites check failed, but --force was specified. Continuing anyway."
        fi
    else
        log_success "All prerequisites satisfied."
    fi
}

# Backup current version
backup_current_version() {
    local backup_path="${BACKUP_DIR}/backup_${DEPLOY_TIMESTAMP}"
    
    log_info "Backing up current version to ${backup_path}..."
    
    # Create backup directory
    mkdir -p "${backup_path}"
    
    # Backup code
    if [[ -d "${APP_DIR}/.git" ]]; then
        # Get current commit hash
        local current_commit=$(cd "${APP_DIR}" && git rev-parse HEAD)
        echo "COMMIT=${current_commit}" > "${backup_path}/git_info"
        
        # Get current branch or tag
        local current_branch=$(cd "${APP_DIR}" && git symbolic-ref --short HEAD 2>/dev/null || git describe --tags --exact-match 2>/dev/null || echo "detached")
        echo "REF=${current_branch}" >> "${backup_path}/git_info"
        
        # Save current .env file
        if [[ -f "${APP_DIR}/.env" ]]; then
            cp "${APP_DIR}/.env" "${backup_path}/.env"
        fi
        
        # Backup package.json and package-lock.json
        if [[ -f "${APP_DIR}/package.json" ]]; then
            cp "${APP_DIR}/package.json" "${backup_path}/package.json"
        fi
        if [[ -f "${APP_DIR}/package-lock.json" ]]; then
            cp "${APP_DIR}/package-lock.json" "${backup_path}/package-lock.json"
        fi
        
        # Backup database
        log_info "Backing up database..."
        PGPASSWORD="${DB_PASS}" pg_dump -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${backup_path}/database.dump"
        
        # Save rollback info
        echo "BACKUP_PATH=${backup_path}" > "${ROLLBACK_FILE}"
        echo "TIMESTAMP=${DEPLOY_TIMESTAMP}" >> "${ROLLBACK_FILE}"
        echo "COMMIT=${current_commit}" >> "${ROLLBACK_FILE}"
        echo "REF=${current_branch}" >> "${ROLLBACK_FILE}"
        
        log_success "Backup completed."
    else
        log_warning "No git repository found in ${APP_DIR}. Skipping code backup."
        
        # Still backup database if possible
        if PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
            log_info "Backing up database only..."
            PGPASSWORD="${DB_PASS}" pg_dump -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -F c -f "${backup_path}/database.dump"
            log_success "Database backup completed."
        else
            log_warning "Cannot connect to database. Skipping database backup."
        fi
    fi
}

# Update code from git
update_code() {
    log_info "Updating code from git..."
    
    # Check if directory exists and is a git repo
    if [[ -d "${APP_DIR}/.git" ]]; then
        # Directory exists and is a git repo, update it
        cd "${APP_DIR}"
        
        # Save any local changes to stash
        if [[ -n "$(git status --porcelain)" ]]; then
            log_warning "Local changes detected. Stashing them..."
            git stash save "Auto-stashed during deployment ${DEPLOY_TIMESTAMP}"
        fi
        
        # Fetch latest changes
        git fetch --all --tags --prune
        
        # Checkout the specified branch or tag
        if [[ -n "${GIT_TAG}" ]]; then
            log_info "Checking out tag: ${GIT_TAG}"
            git checkout "${GIT_TAG}"
        else
            log_info "Checking out branch: ${GIT_BRANCH}"
            git checkout "${GIT_BRANCH}"
            git pull origin "${GIT_BRANCH}"
        fi
    else
        # Directory doesn't exist or is not a git repo, clone it
        log_info "No git repository found. Cloning from ${GIT_REPO}..."
        
        # Remove directory if it exists but is not a git repo
        if [[ -d "${APP_DIR}" && ! -d "${APP_DIR}/.git" ]]; then
            log_warning "${APP_DIR} exists but is not a git repository. Removing it..."
            rm -rf "${APP_DIR}"
        fi
        
        # Clone the repository
        if [[ -n "${GIT_TAG}" ]]; then
            git clone --depth 1 --branch "${GIT_TAG}" "${GIT_REPO}" "${APP_DIR}"
        else
            git clone --branch "${GIT_BRANCH}" "${GIT_REPO}" "${APP_DIR}"
        fi
    fi
    
    # Get current commit info for logging
    local current_commit=$(cd "${APP_DIR}" && git rev-parse HEAD)
    local commit_message=$(cd "${APP_DIR}" && git log -1 --pretty=%B)
    local commit_author=$(cd "${APP_DIR}" && git log -1 --pretty=%an)
    local commit_date=$(cd "${APP_DIR}" && git log -1 --pretty=%ad --date=format:'%Y-%m-%d %H:%M:%S')
    
    log_success "Code updated to commit ${current_commit}"
    log_info "Commit message: ${commit_message}"
    log_info "Author: ${commit_author}"
    log_info "Date: ${commit_date}"
}

# Install or update dependencies
install_dependencies() {
    if [[ "${SKIP_DEPENDENCIES}" == "true" ]]; then
        log_info "Skipping dependencies installation as requested."
        return 0
    fi
    
    log_info "Installing dependencies..."
    
    cd "${APP_DIR}"
    
    # Check if package.json exists
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found in ${APP_DIR}"
        return 1
    fi
    
    # Install dependencies using npm ci for exact versions
    if [[ -f "package-lock.json" ]]; then
        log_info "Using npm ci for exact dependency installation..."
        npm ci
    else
        log_warning "package-lock.json not found. Using npm install instead..."
        npm install
    fi
    
    # Install global dependencies if needed
    if ! command_exists "node-pg-migrate"; then
        log_info "Installing node-pg-migrate globally..."
        npm install -g node-pg-migrate
    fi
    
    log_success "Dependencies installed."
}

# Run database migrations
run_migrations() {
    if [[ "${SKIP_MIGRATIONS}" == "true" ]]; then
        log_info "Skipping database migrations as requested."
        return 0
    fi
    
    log_info "Running database migrations..."
    
    cd "${APP_DIR}"
    
    # Check if migrations directory exists
    if [[ ! -d "migrations" ]]; then
        log_warning "No migrations directory found. Skipping migrations."
        return 0
    fi
    
    # Run the cross-platform setup script first (idempotent)
    # NOTE:  v9.0 files live inside the database/ sub-directory
    if [[ -f "database/setup-database-cross-platform.sql" ]]; then
        log_info "Running cross-platform database setup script..."
        PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -U "${DB_USER}" -d postgres -f database/setup-database-cross-platform.sql
    fi
    
    # Run migrations using node-pg-migrate
    log_info "Running SQL migrations..."
    
    # Find all SQL migration files and sort them
    local migration_files=($(find migrations -name "*.sql" | sort))
    
    if [[ ${#migration_files[@]} -eq 0 ]]; then
        log_warning "No SQL migration files found in migrations directory."
    else
        for migration_file in "${migration_files[@]}"; do
            local migration_name=$(basename "${migration_file}" .sql)
            log_info "Applying migration: ${migration_name}"
            
            # Run the migration
            PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -f "${migration_file}"
            
            if [[ $? -eq 0 ]]; then
                log_success "Migration ${migration_name} applied successfully."
            else
                log_error "Failed to apply migration ${migration_name}."
                return 1
            fi
        done
    fi
    
    # Check for node-pg-migrate migrations
    if command_exists "node-pg-migrate" && [[ -d "migrations" ]]; then
        log_info "Running node-pg-migrate migrations..."
        DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}" node-pg-migrate up
    fi
    
    log_success "Database migrations completed."
}

# Copy environment file if needed
setup_environment() {
    log_info "Setting up environment..."
    
    cd "${APP_DIR}"
    
    # If .env doesn't exist but .env.example does, copy it
    if [[ ! -f ".env" && -f ".env.example" ]]; then
        log_info "No .env file found. Creating from .env.example..."
        cp .env.example .env
        log_warning "Please review .env file and update as needed."
    elif [[ -f ".env" ]]; then
        log_info ".env file already exists. Checking for updates in .env.example..."
        
        # Check if .env.example has new variables not in .env
        if [[ -f ".env.example" ]]; then
            local new_vars=()
            while IFS= read -r line; do
                # Skip comments and empty lines
                if [[ "$line" =~ ^[[:space:]]*# || -z "$line" ]]; then
                    continue
                fi
                
                # Extract variable name
                local var_name=$(echo "$line" | cut -d= -f1)
                
                # Check if variable exists in .env
                if ! grep -q "^${var_name}=" .env; then
                    new_vars+=("$line")
                fi
            done < .env.example
            
            # Add new variables to .env
            if [[ ${#new_vars[@]} -gt 0 ]]; then
                log_info "Adding new variables to .env:"
                for var in "${new_vars[@]}"; do
                    echo "$var" >> .env
                    log_info "  - $(echo "$var" | cut -d= -f1)"
                done
            else
                log_info "No new variables found in .env.example."
            fi
        fi
    else
        log_warning "No .env or .env.example file found. Environment may not be properly configured."
    fi
    
    log_success "Environment setup completed."
}

# Restart services using PM2
restart_services() {
    if [[ "${NO_RESTART}" == "true" ]]; then
        log_info "Skipping service restart as requested."
        return 0
    fi
    
    log_info "Restarting services..."
    
    cd "${APP_DIR}"
    
    # Check if PM2 is running
    if ! pm2 ping >/dev/null 2>&1; then
        log_warning "PM2 daemon is not running. Starting it..."
        pm2 resurrect || pm2 save  # Try to resurrect first, if no saved state, just save empty state
    fi
    
    # Check if our services are already registered with PM2
    if pm2 list | grep -q "fund-api"; then
        log_info "Restarting backend API service..."
        pm2 restart fund-api
    else
        log_info "Starting backend API service for the first time..."
        pm2 start server.js --name fund-api
    fi
    
    if pm2 list | grep -q "fund-ui"; then
        log_info "Restarting frontend UI service..."
        pm2 restart fund-ui
    else
        log_info "Starting frontend UI service for the first time..."
        pm2 start "npx http-server . -p 8080 --no-cache" --name fund-ui
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Ensure PM2 starts on system boot
    if [[ $EUID -eq 0 ]]; then
        log_info "Setting up PM2 to start on system boot..."
        pm2 startup
        
        # If we're running as root but the app should run as another user
        if [[ -n "$(logname 2>/dev/null)" && "$(logname)" != "root" ]]; then
            log_info "Setting up PM2 to run as user: $(logname)"
            sudo -u "$(logname)" pm2 save
            pm2 startup -u "$(logname)" --hp "/home/$(logname)"
        fi
    else
        log_info "To set up PM2 to start on system boot, run: 'sudo pm2 startup'"
    fi
    
    log_success "Services restarted."
}

# Perform health checks
perform_health_checks() {
    log_info "Performing health checks..."
    
    # Wait a moment for services to start
    log_info "Waiting for services to start up..."
    sleep 5
    
    # Check backend API health
    log_info "Checking backend API health..."
    local retries=0
    local api_healthy=false
    
    while [[ $retries -lt $MAX_RETRIES && "$api_healthy" != "true" ]]; do
        if response=$(curl -s -m $TIMEOUT "${HEALTH_CHECK_URL}"); then
            if echo "$response" | grep -q '"status":"OK"'; then
                api_healthy=true
                log_success "Backend API is healthy."
            else
                log_warning "Backend API responded but health check failed. Response: ${response}"
                retries=$((retries + 1))
                sleep 2
            fi
        else
            log_warning "Backend API health check failed. Retrying in 2 seconds... (${retries}/${MAX_RETRIES})"
            retries=$((retries + 1))
            sleep 2
        fi
    done
    
    if [[ "$api_healthy" != "true" ]]; then
        log_error "Backend API health check failed after ${MAX_RETRIES} attempts."
        if [[ "$FORCE" != "true" ]]; then
            log_error "Deployment failed. Use --force to ignore health checks."
            return 1
        else
            log_warning "Continuing deployment despite failed health checks (--force)."
        fi
    fi
    
    # Check frontend UI
    log_info "Checking frontend UI..."
    local frontend_healthy=false
    retries=0
    
    while [[ $retries -lt $MAX_RETRIES && "$frontend_healthy" != "true" ]]; do
        if curl -s -m $TIMEOUT -o /dev/null -w "%{http_code}" "${FRONTEND_URL}" | grep -q "200"; then
            frontend_healthy=true
            log_success "Frontend UI is responding."
        else
            log_warning "Frontend UI check failed. Retrying in 2 seconds... (${retries}/${MAX_RETRIES})"
            retries=$((retries + 1))
            sleep 2
        fi
    done
    
    if [[ "$frontend_healthy" != "true" ]]; then
        log_error "Frontend UI check failed after ${MAX_RETRIES} attempts."
        if [[ "$FORCE" != "true" ]]; then
            log_error "Deployment failed. Use --force to ignore health checks."
            return 1
        else
            log_warning "Continuing deployment despite failed health checks (--force)."
        fi
    fi
    
    # Check database connection
    log_info "Checking database connection..."
    if PGPASSWORD="${DB_PASS}" psql -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1" >/dev/null 2>&1; then
        log_success "Database connection is working."
    else
        log_error "Database connection check failed."
        if [[ "$FORCE" != "true" ]]; then
            log_error "Deployment failed. Use --force to ignore health checks."
            return 1
        else
            log_warning "Continuing deployment despite failed health checks (--force)."
        fi
    fi
    
    log_success "Health checks completed."
}

# Rollback to previous version
rollback() {
    log_info "Starting rollback procedure..."
    
    # Check if rollback info file exists
    if [[ ! -f "${ROLLBACK_FILE}" && -z "${ROLLBACK_VERSION}" ]]; then
        log_error "No rollback information available."
        return 1
    fi
    
    # If specific version is requested
    if [[ -n "${ROLLBACK_VERSION}" ]]; then
        log_info "Rolling back to specific version: ${ROLLBACK_VERSION}"
        
        # Save current state before rollback
        backup_current_version
        
        # Checkout specific version
        cd "${APP_DIR}"
        git fetch --all --tags
        
        if git tag | grep -q "^${ROLLBACK_VERSION}$"; then
            log_info "Checking out tag: ${ROLLBACK_VERSION}"
            git checkout "${ROLLBACK_VERSION}"
        elif git branch -r | grep -q "origin/${ROLLBACK_VERSION}$"; then
            log_info "Checking out branch: ${ROLLBACK_VERSION}"
            git checkout "${ROLLBACK_VERSION}"
            git pull origin "${ROLLBACK_VERSION}"
        else
            log_error "Version ${ROLLBACK_VERSION} not found in git repository."
            return 1
        fi
        
        # Install dependencies and restart services
        install_dependencies
        restart_services
        perform_health_checks
        
        log_success "Rolled back to version ${ROLLBACK_VERSION}."
        return 0
    fi
    
    # Load rollback info
    source "${ROLLBACK_FILE}"
    
    if [[ -z "${BACKUP_PATH}" || ! -d "${BACKUP_PATH}" ]]; then
        log_error "Backup path not found: ${BACKUP_PATH}"
        return 1
    fi
    
    log_info "Rolling back to backup from ${TIMESTAMP}..."
    
    # Stop services
    log_info "Stopping services..."
    pm2 stop fund-api fund-ui
    
    # Restore database if backup exists
    if [[ -f "${BACKUP_PATH}/database.dump" ]]; then
        log_info "Restoring database from backup..."
        PGPASSWORD="${DB_PASS}" pg_restore -h "${DB_HOST}" -U "${DB_USER}" -d "${DB_NAME}" -c "${BACKUP_PATH}/database.dump"
    else
        log_warning "No database backup found. Skipping database restore."
    fi
    
    # Restore code if commit info exists
    if [[ -n "${COMMIT}" ]]; then
        log_info "Restoring code to commit ${COMMIT}..."
        cd "${APP_DIR}"
        
        # Stash any changes
        if [[ -n "$(git status --porcelain)" ]]; then
            git stash save "Auto-stashed during rollback ${DEPLOY_TIMESTAMP}"
        fi
        
        # Checkout the previous commit
        git checkout "${COMMIT}"
    else
        log_warning "No commit information found. Skipping code restore."
    fi
    
    # Restore .env file if it exists
    if [[ -f "${BACKUP_PATH}/.env" ]]; then
        log_info "Restoring .env file..."
        cp "${BACKUP_PATH}/.env" "${APP_DIR}/.env"
    fi
    
    # Restore dependencies
    if [[ -f "${BACKUP_PATH}/package.json" && -f "${BACKUP_PATH}/package-lock.json" ]]; then
        log_info "Restoring dependencies..."
        cp "${BACKUP_PATH}/package.json" "${APP_DIR}/package.json"
        cp "${BACKUP_PATH}/package-lock.json" "${APP_DIR}/package-lock.json"
        cd "${APP_DIR}"
        npm ci
    fi
    
    # Restart services
    log_info "Restarting services..."
    pm2 restart fund-api fund-ui
    
    # Perform health checks
    perform_health_checks
    
    log_success "Rollback completed successfully."
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Remove temporary files
    # (none for now)
    
    log_success "Cleanup completed."
}

# Error handler
error_handler() {
    local exit_code=$?
    local line_number=$1
    
    log_error "Error occurred at line ${line_number} with exit code ${exit_code}"
    
    if [[ "${ROLLBACK_ON_ERROR}" == "true" && -f "${ROLLBACK_FILE}" ]]; then
        log_warning "Attempting automatic rollback..."
        rollback
    else
        log_warning "Automatic rollback not enabled. Run with --rollback to revert changes."
    fi
    
    cleanup
    exit ${exit_code}
}

# =============================================================================
# Main Script
# =============================================================================

# Set up error trap
trap 'error_handler ${LINENO}' ERR

# Parse command line arguments
SKIP_DEPENDENCIES=false
SKIP_MIGRATIONS=false
NO_RESTART=false
FORCE=false
ROLLBACK_ON_ERROR=false
ROLLBACK_VERSION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -b|--branch)
            GIT_BRANCH="$2"
            shift 2
            ;;
        -t|--tag)
            GIT_TAG="$2"
            shift 2
            ;;
        -r|--rollback)
            if [[ -n "$2" && ! "$2" =~ ^- ]]; then
                ROLLBACK_VERSION="$2"
                shift 2
            else
                ROLLBACK_VERSION=""
                shift
            fi
            rollback
            exit $?
            ;;
        -s|--skip-dependencies)
            SKIP_DEPENDENCIES=true
            shift
            ;;
        -m|--skip-migrations)
            SKIP_MIGRATIONS=true
            shift
            ;;
        -n|--no-restart)
            NO_RESTART=true
            shift
            ;;
        -f|--force)
            FORCE=true
            shift
            ;;
        --rollback-on-error)
            ROLLBACK_ON_ERROR=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Create log directory
mkdir -p "${LOG_DIR}"

# Start deployment
log_info "Starting deployment of Nonprofit Fund Accounting system..."
log_info "Deployment timestamp: ${DEPLOY_TIMESTAMP}"

# Check privileges
check_privileges

# Create necessary directories
create_directories

# Check prerequisites
check_prerequisites

# Backup current version
backup_current_version

# Update code from git
update_code

# Install dependencies
install_dependencies

# Setup environment
setup_environment

# Run database migrations
run_migrations

# Restart services
restart_services

# Perform health checks
perform_health_checks

# Cleanup
cleanup

log_success "Deployment completed successfully!"
log_info "Application is now running at:"
log_info "  - Backend API: ${HEALTH_CHECK_URL}"
log_info "  - Frontend UI: ${FRONTEND_URL}"
log_info "Deployment log saved to: ${LOG_FILE}"

exit 0
