#!/bin/bash
# db-seed.sh - Database seeding script for Mr. MoneyBags
# Executes the db-init.sql script to create and populate the database schema

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
echo "=== Database Seed Operation ==="
echo "Connection: ${PGUSER}:******@${PGHOST}:${PGPORT}/${PGDATABASE}"

# Check if database exists, create if it doesn't
echo "Checking if database exists..."
if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -lqt | cut -d \| -f 1 | grep -qw "$PGDATABASE"; then
    echo "Database $PGDATABASE does not exist. Creating..."
    createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
    echo "Database created successfully."
else
    echo "Database $PGDATABASE already exists."
fi

# Path to the SQL initialization file
SQL_FILE="database/db-init.sql"

# Check if SQL file exists
if [ ! -f "$SQL_FILE" ]; then
    echo "Error: SQL file $SQL_FILE not found!"
    exit 1
fi

# Run the SQL script with error stopping enabled
echo "Seeding database from $SQL_FILE..."
PGOPTIONS='--client-min-messages=warning' psql \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "$PGUSER" \
    -d "$PGDATABASE" \
    -v ON_ERROR_STOP=1 \
    -f "$SQL_FILE"

# Check exit status
if [ $? -eq 0 ]; then
    echo "=== Database seed completed successfully ==="
    exit 0
else
    echo "=== Database seed failed! ==="
    exit 1
fi
