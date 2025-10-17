#!/bin/bash
# run-psql.sh - Helper to run a SQL file against the local database
# Automatically uses the current system user, which is common for macOS setups.

set -euo pipefail

# --- Configuration ---
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-fund_accounting_db}"
# Use current user as default, as 'postgres' role may not exist locally
PGUSER="${PGUSER:-$(whoami)}"

# --- Script Logic ---
SQL_FILE="$1"

if [ -z "$SQL_FILE" ]; then
    echo "Usage: ./scripts/run-psql.sh <path-to-sql-file>"
    echo "Example: ./scripts/run-psql.sh scripts/recreate-payment-items.sql"
    exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
    echo "Error: SQL file not found at '$SQL_FILE'"
    exit 1
fi

echo "=== Executing SQL Script ==="
echo "Host:      $PGHOST"
echo "Port:      $PGPORT"
echo "Database:  $PGDATABASE"
echo "User:      $PGUSER"
echo "SQL File:  $SQL_FILE"
echo "============================"

# Execute the psql command
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$SQL_FILE"

echo ""
echo "=== Script execution finished. ==="
