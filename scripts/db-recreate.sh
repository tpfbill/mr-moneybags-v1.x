#!/bin/bash
# db-recreate.sh - Database recreation script for Mr. MoneyBags
# Drops and recreates the database, then runs db-seed.sh to populate it

# Exit immediately if a command exits with a non-zero status
# Treat unset variables as an error when substituting
# Exit if any command in a pipeline fails
set -euo pipefail

# Set default PostgreSQL connection parameters if not provided in environment
# These match the defaults in src/db/db-config.js and db-seed.sh
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-npfa123}"
PGDATABASE="${PGDATABASE:-fund_accounting_db}"

# Export password for psql (non-interactive authentication)
export PGPASSWORD

# Display connection information (with masked password)
echo "=== Database Recreation Operation ==="
echo "Connection: ${PGUSER}:******@${PGHOST}:${PGPORT}/${PGDATABASE}"

# Check if database exists
if psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -lqt | cut -d \| -f 1 | grep -qw "$PGDATABASE"; then
    echo "Database $PGDATABASE exists. Terminating active connections..."
    
    # Terminate all connections to the database
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "postgres" -c "
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = '$PGDATABASE'
        AND pid <> pg_backend_pid();"
    
    echo "Dropping database $PGDATABASE..."
    dropdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
    echo "Database dropped successfully."
fi

# Create the database
echo "Creating database $PGDATABASE..."
createdb -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" "$PGDATABASE"
echo "Database created successfully."

# Run the seed script
echo "Running database seed script..."
./scripts/db-seed.sh

echo "=== Database recreation completed successfully ==="
exit 0
