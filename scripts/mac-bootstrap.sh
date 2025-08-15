#!/bin/bash
# mac-bootstrap.sh - Bootstrap PostgreSQL and database for Mr. MoneyBags on macOS
# Sets up PostgreSQL via Homebrew, creates required roles, and seeds the database

# Exit on error, unset variable reference, or pipe failure
set -euo pipefail

# Terminal colors
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${BOLD}=== Mr. MoneyBags macOS Bootstrap ===${RESET}"

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo -e "${RED}Error: This script is for macOS only.${RESET}"
    echo "For other platforms, please refer to the documentation."
    exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
    echo -e "${RED}Error: Homebrew is not installed.${RESET}"
    echo "Please install Homebrew first:"
    echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
    exit 1
fi

# Determine PostgreSQL formula to use
PG_FORMULA="postgresql@16"
if ! brew list --formula | grep -q "^postgresql@16$"; then
    if brew search postgresql@16 &> /dev/null; then
        echo -e "${YELLOW}PostgreSQL 16 not installed. Installing...${RESET}"
        brew install postgresql@16
    else
        echo -e "${YELLOW}PostgreSQL 16 formula not found. Falling back to latest PostgreSQL.${RESET}"
        PG_FORMULA="postgresql"
        if ! brew list --formula | grep -q "^postgresql$"; then
            echo -e "${YELLOW}PostgreSQL not installed. Installing...${RESET}"
            brew install postgresql
        fi
    fi
fi

# Determine the installed formula
if brew list --formula | grep -q "^postgresql@16$"; then
    PG_FORMULA="postgresql@16"
elif brew list --formula | grep -q "^postgresql$"; then
    PG_FORMULA="postgresql"
else
    echo -e "${RED}Error: Failed to find installed PostgreSQL formula.${RESET}"
    exit 1
fi

echo -e "${GREEN}Using PostgreSQL formula: ${PG_FORMULA}${RESET}"

# ---------------------------------------------------------------------------
# Start PostgreSQL service (with safety checks)
# ---------------------------------------------------------------------------
# 1. If a server is already answering on $PGPORT, skip starting anything.
# 2. Otherwise try `brew services start`.
# 3. If that fails, fall back to manual pg_ctl start (initialising the data
#    directory if necessary).

if pg_isready -h "${PGHOST}" -p "${PGPORT}" >/dev/null 2>&1; then
    echo "PostgreSQL already running on ${PGHOST}:${PGPORT} (pg_isready OK)"
else
    echo "Starting PostgreSQL service via Homebrew..."
    if brew services start "${PG_FORMULA}"; then
        :
    else
        echo -e "${YELLOW}brew services start failed. Attempting manual pg_ctl start...${RESET}"

        # Ensure PATH includes correct PostgreSQL bin dir
        if [[ "${PG_FORMULA}" == "postgresql@16" ]]; then
            export PATH="$(brew --prefix)/opt/postgresql@16/bin:$PATH"
            DATADIR="$(brew --prefix)/var/postgresql@16"
        else
            export PATH="$(brew --prefix)/opt/postgresql/bin:$PATH"
            DATADIR="$(brew --prefix)/var/postgresql"
        fi

        # Initialise data directory if it doesn't exist or is empty
        if [ ! -d "${DATADIR}" ] || [ -z "$(ls -A "${DATADIR}" 2>/dev/null)" ]; then
            echo "Initialising PostgreSQL data directory at ${DATADIR}..."
            mkdir -p "${DATADIR}"
            initdb -D "${DATADIR}"
        fi

        # Start postgres for this shell session
        if pg_ctl -D "${DATADIR}" -l "${DATADIR}/server.log" start; then
            echo -e "${GREEN}PostgreSQL started manually via pg_ctl.${RESET}"
        else
            echo -e "${RED}Error: Failed to start PostgreSQL manually via pg_ctl.${RESET}"
            echo "Check ${DATADIR}/server.log for details."
            exit 1
        fi
    fi
fi

# Set database connection parameters (same as db-seed.sh)
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-npfa123}"
PGDATABASE="${PGDATABASE:-fund_accounting_db}"

# Export password for psql (non-interactive authentication)
export PGPASSWORD

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
RETRY_COUNT=0
MAX_RETRIES=30
until pg_isready -h "${PGHOST}" -p "${PGPORT}" &> /dev/null || [ $RETRY_COUNT -eq $MAX_RETRIES ]; do
    echo "Waiting for PostgreSQL to start... ($((RETRY_COUNT+1))/$MAX_RETRIES)"
    RETRY_COUNT=$((RETRY_COUNT+1))
    sleep 1
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo -e "${RED}Error: PostgreSQL did not start within the expected time.${RESET}"
    echo "Check the PostgreSQL logs for more information."
    exit 1
fi

echo -e "${GREEN}PostgreSQL is ready!${RESET}"

# Display connection information (with masked password)
echo "=== Database Connection ==="
echo "Host: ${PGHOST}:${PGPORT}"
echo "User: ${PGUSER}"
echo "Database: ${PGDATABASE}"

# Ensure the database role exists with proper permissions
echo "Ensuring database role exists with proper permissions..."

# First check if we can connect as the target user
if ! psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "SELECT 1" postgres &> /dev/null; then
    echo "Cannot connect as ${PGUSER}. Attempting to create/update role..."
    
    # Get current macOS username to connect as initially
    CURRENT_USER=$(whoami)
    
    # Try connecting as current macOS user (Homebrew default)
    if psql -h "${PGHOST}" -p "${PGPORT}" -U "${CURRENT_USER}" -c "SELECT 1" postgres &> /dev/null; then
        echo "Connected as ${CURRENT_USER}. Creating ${PGUSER} role..."
        # Check if role exists
        if psql -h "${PGHOST}" -p "${PGPORT}" -U "${CURRENT_USER}" -tAc "SELECT 1 FROM pg_roles WHERE rolname='${PGUSER}'" postgres | grep -q 1; then
            # Role exists, update password and permissions
            psql -h "${PGHOST}" -p "${PGPORT}" -U "${CURRENT_USER}" -c "ALTER ROLE ${PGUSER} WITH LOGIN SUPERUSER PASSWORD '${PGPASSWORD}';" postgres
        else
            # Create new role
            psql -h "${PGHOST}" -p "${PGPORT}" -U "${CURRENT_USER}" -c "CREATE ROLE ${PGUSER} WITH LOGIN SUPERUSER PASSWORD '${PGPASSWORD}';" postgres
        fi
    else
        echo -e "${RED}Error: Cannot connect to PostgreSQL as ${CURRENT_USER} or ${PGUSER}.${RESET}"
        echo "You may need to manually create the role or fix PostgreSQL authentication."
        echo "Try: createuser -h ${PGHOST} -p ${PGPORT} -s -P ${PGUSER}"
        exit 1
    fi
    
    # Verify we can now connect as the target user
    if ! psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "SELECT 1" postgres &> /dev/null; then
        echo -e "${RED}Error: Still cannot connect as ${PGUSER} after setup attempt.${RESET}"
        echo "You may need to manually fix PostgreSQL authentication or pg_hba.conf."
        exit 1
    fi
fi

echo -e "${GREEN}Database role ${PGUSER} is ready!${RESET}"

# Ensure .env file exists with REQUIRED_SCHEMA_VERSION
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
fi

# Run database recreation script
echo -e "${BOLD}Running database recreation and seed...${RESET}"
npm run db:recreate

# ---------------------------------------------------------------------------
# Optional sample-data loads
# ---------------------------------------------------------------------------
# By default we load the full “Principle Foundation” sample data set so a fresh
# install is immediately usable.  NACHA vendor data is larger and disabled by
# default but can be enabled with an environment flag.
LOAD_TPF_DATA="${LOAD_TPF_DATA:-true}"
LOAD_NACHA_SAMPLE="${LOAD_NACHA_SAMPLE:-false}"

if [[ "${LOAD_TPF_DATA}" == "true" ]]; then
  echo
  echo -e "${BOLD}Loading The Principle Foundation comprehensive sample dataset...${RESET}"
  if node database/load-principle-foundation-data.js; then
    echo -e "${GREEN}TPF dataset loaded successfully.${RESET}"
  else
    echo -e "${YELLOW}Warning: TPF dataset load failed. Continuing...${RESET}"
  fi
fi

if [[ "${LOAD_NACHA_SAMPLE}" == "true" ]]; then
  echo
  echo -e "${BOLD}Loading NACHA vendor sample data...${RESET}"
  if [ -f database/insert-complete-nacha-data.sql ]; then
    if PGOPTIONS='--client-min-messages=warning' psql \
         -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" \
         -v ON_ERROR_STOP=1 \
         -f database/insert-complete-nacha-data.sql; then
      echo -e "${GREEN}NACHA sample data loaded successfully.${RESET}"
    else
      echo -e "${YELLOW}Warning: NACHA sample data load failed. Continuing...${RESET}"
    fi
  else
    echo -e "${YELLOW}Warning: NACHA sample SQL not found. Skipping...${RESET}"
  fi
fi

# ---------------------------------------------------------------------------
# Sync REQUIRED_SCHEMA_VERSION in .env with latest applied version
# ---------------------------------------------------------------------------
LATEST_VER=$(psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -tA \
  -c "SELECT version FROM schema_meta ORDER BY applied_at DESC NULLS LAST, version DESC LIMIT 1" \
  "${PGDATABASE}" || true)

if [ -n "${LATEST_VER}" ]; then
    if grep -qE '^REQUIRED_SCHEMA_VERSION=' .env; then
        # macOS sed requires an empty string '' for in-place editing backup suffix
        sed -i '' -e "s/^REQUIRED_SCHEMA_VERSION=.*/REQUIRED_SCHEMA_VERSION=${LATEST_VER}/" .env
    else
        echo "REQUIRED_SCHEMA_VERSION=${LATEST_VER}" >> .env
    fi
    echo -e "${GREEN}Synced REQUIRED_SCHEMA_VERSION=${LATEST_VER} in .env${RESET}"
else
    echo -e "${YELLOW}Warning: Could not determine latest schema version from schema_meta.${RESET}"
fi

echo -e "${GREEN}${BOLD}Bootstrap complete!${RESET}"
echo "You can now start the application with: npm run start"
