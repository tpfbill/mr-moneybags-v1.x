// db-config.js
// Client-side configuration for database connection parameters.

// Allow overriding via environment variables while keeping sensible defaults
// so the config automatically matches the local PostgreSQL setup but can be
// customized without editing source code.
const DB_CONFIG = {
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'npfa123',
    database: process.env.PGDATABASE || 'fund_accounting_db'
};

// Helper function to get the database configuration.
function getDbConfig() {
    return DB_CONFIG;
}

// For browser environment
if (typeof window !== 'undefined') {
    window.getDbConfig = getDbConfig;
}

// For Node.js environment
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getDbConfig, DB_CONFIG };
}
