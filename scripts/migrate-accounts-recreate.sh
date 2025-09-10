#!/bin/bash
# migrate-accounts-recreate.sh - Migration script for recreating the accounts table
# Executes the accounts table migration SQL script to drop and recreate the table with new schema

# Exit immediately if a command exits with a non-zero status
# Treat unset variables as an error when substituting
# Exit if any command in a pipeline fails
set -euo pipefail

# Set default PostgreSQL connection parameters if not provided in environment
# These match the defaults in src/db/db-config.js
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-npfa123}"
PGDATABASE="${PGDATABASE:-fund_accounting_db}"

# Export password for psql (non-interactive authentication)
export PGPASSWORD

# Display connection information (with masked password)
echo "=== Accounts Table Migration ==="
echo "Connection: ${PGUSER}:******@${PGHOST}:${PGPORT}/${PGDATABASE}"

# Path to the SQL migration file
SQL_FILE="database/migrations/2025-09-10-accounts-recreate.sql"

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    echo "Error: SQL file $SQL_FILE not found!"
    exit 1
fi

# Run the SQL script with error stopping enabled
echo "Running accounts table migration from $SQL_FILE..."
PGOPTIONS='--client-min-messages=warning' psql \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 \
    -f "$SQL_FILE"

# Check exit status
if [ $? -eq 0 ]; then
    echo "=== Accounts table migration completed successfully ==="
    exit 0
else
    echo "=== Accounts table migration failed! ==="
    exit 1
fi
