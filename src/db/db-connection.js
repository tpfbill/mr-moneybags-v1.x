// db-connection.js
// This is a Node.js module for connecting to a PostgreSQL database.
// It uses the 'pg' (node-postgres) library.
// To use this, you'll need to install the 'pg' library: npm install pg

const { Pool } = require('pg');

// --- Database Configuration ---
// Replace with your actual database connection details
// It's recommended to use environment variables for sensitive information in a real application
const dbConfig = {
    user: process.env.DB_USER || 'your_db_user',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'fund_accounting_db',
    password: process.env.DB_PASSWORD || 'your_db_password',
    port: process.env.DB_PORT || 5432,
    max: 20, // Max number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
    connectionTimeoutMillis: 2000, // How long to wait for a connection from the pool
};

const pool = new Pool(dbConfig);

pool.on('connect', (client) => {
    console.log('DB_CONNECTION: New client connected to the PostgreSQL database.');
    // You can set session-specific parameters here if needed, e.g.:
    // client.query('SET DATESTYLE = iso, mdy');
});

pool.on('error', (err, client) => {
    console.error('DB_CONNECTION_POOL_ERROR: Unexpected error on idle client', err);
    // process.exit(-1); // Consider how to handle fatal pool errors
});

logMsg("PostgreSQL Connection Pool initialized.", "info");

// --- Utility Functions ---
function logMsg(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DB_MODULE] [${type.toUpperCase()}]: ${message}`);
}

// --- Core Query Function ---
/**
 * Executes a SQL query using a client from the pool.
 * @param {string} text - The SQL query string (e.g., "SELECT * FROM users WHERE id = $1").
 * @param {Array} [params] - An array of parameters to pass to the query.
 * @returns {Promise<QueryResult>} A promise that resolves with the query result.
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        logMsg(`Executed query: { ${text.substring(0, 100)}${text.length > 100 ? '...' : ''} } Duration: ${duration}ms, Rows: ${res.rowCount}`, "info");
        return res;
    } catch (err) {
        logMsg(`Error executing query: { ${text.substring(0, 100)}${text.length > 100 ? '...' : ''} } - ${err.message}`, "error");
        throw err; // Re-throw the error to be handled by the caller
    }
}

// --- Transaction Management ---
/**
 * Gets a client from the pool for transaction management.
 * Remember to release the client using client.release() when done.
 * @returns {Promise<PoolClient>} A promise that resolves with a database client.
 */
async function getClient() {
    logMsg("Acquiring client from pool for transaction...", "info");
    const client = await pool.connect();
    logMsg("Client acquired.", "info");
    return client;
}

/**
 * Begins a transaction on a given client.
 * @param {PoolClient} client - The database client.
 */
async function beginTransaction(client) {
    logMsg("Beginning transaction...", "info");
    await client.query('BEGIN');
    logMsg("Transaction started.", "success");
}

/**
 * Commits a transaction on a given client.
 * @param {PoolClient} client - The database client.
 */
async function commitTransaction(client) {
    logMsg("Committing transaction...", "info");
    await client.query('COMMIT');
    logMsg("Transaction committed.", "success");
}

/**
 * Rolls back a transaction on a given client.
 * @param {PoolClient} client - The database client.
 */
async function rollbackTransaction(client) {
    logMsg("Rolling back transaction...", "info");
    await client.query('ROLLBACK');
    logMsg("Transaction rolled back.", "warn");
}

// --- Conceptual Table Structures (for reference when writing queries) ---
/*
Entities Table:
CREATE TABLE entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    parent_entity_id UUID REFERENCES entities(id),
    is_consolidated BOOLEAN DEFAULT FALSE,
    fiscal_year_start VARCHAR(5) DEFAULT '01-01', -- MM-DD format
    base_currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Inactive'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

Accounts Table (Chart of Accounts):
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'Asset', 'Liability', 'Equity', 'Revenue', 'Expense'
    balance DECIMAL(19, 4) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Inactive'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, code) -- Account code must be unique within an entity
);

Funds Table:
CREATE TABLE funds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'Unrestricted', 'Temporarily Restricted', 'Permanently Restricted'
    balance DECIMAL(19, 4) DEFAULT 0.00,
    status VARCHAR(20) DEFAULT 'Active', -- 'Active', 'Inactive'
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (entity_id, code) -- Fund code must be unique within an entity
);

Journal Entries Table:
CREATE TABLE journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(id),
    entry_date DATE NOT NULL,
    reference_number VARCHAR(100) UNIQUE,
    description TEXT,
    total_amount DECIMAL(19, 4) NOT NULL, -- Sum of debits (or credits)
    status VARCHAR(20) NOT NULL, -- 'Draft', 'Posted', 'Void'
    created_by VARCHAR(255),
    is_inter_entity BOOLEAN DEFAULT FALSE,
    target_entity_id UUID REFERENCES entities(id), -- For inter-entity transfers
    matching_transaction_id UUID, -- To link inter-entity JE pairs
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

Journal Entry Lines Table:
CREATE TABLE journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES accounts(id),
    fund_id UUID REFERENCES funds(id), -- Optional, depending on accounting rules
    debit_amount DECIMAL(19, 4) DEFAULT 0.00,
    credit_amount DECIMAL(19, 4) DEFAULT 0.00,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_debit_credit CHECK (debit_amount >= 0 AND credit_amount >= 0 AND (debit_amount > 0 OR credit_amount > 0))
);
*/

// --- Helper Functions for Common Operations (Stubs - to be implemented) ---
// These would typically use the `query` function or a client for transactions.

// Example: Get all active entities
async function getAllActiveEntities() {
    // return query("SELECT * FROM entities WHERE status = 'Active' ORDER BY name");
    logMsg("getAllActiveEntities: Not yet implemented. Returning mock data.", "warn");
    return [{ id: 'mock_entity_id', name: 'Mock Entity (DB not fully connected)'}]; // Placeholder
}

// Example: Get an account by ID
async function getAccountById(accountId) {
    // return query("SELECT * FROM accounts WHERE id = $1", [accountId]);
    logMsg(`getAccountById for ${accountId}: Not yet implemented.`, "warn");
    return null; // Placeholder
}

// Example: Insert a new fund (within a transaction)
async function insertFund(client, fundData) {
    // const { entity_id, code, name, type, description, status } = fundData;
    // const sql = `
    //     INSERT INTO funds (entity_id, code, name, type, description, status)
    //     VALUES ($1, $2, $3, $4, $5, $6)
    //     RETURNING *;
    // `;
    // return client.query(sql, [entity_id, code, name, type, description, status || 'Active']);
    logMsg(`insertFund for ${fundData.name}: Not yet implemented.`, "warn");
    return { rows: [{...fundData, id: 'mock_fund_id'}] }; // Placeholder
}


// --- Module Exports ---
module.exports = {
    query,
    getClient,
    beginTransaction,
    commitTransaction,
    rollbackTransaction,
    // Helper function stubs (add more as needed)
    helpers: {
        getAllActiveEntities,
        getAccountById,
        insertFund,
        // ... other helper functions for accounts, funds, journal entries, etc.
    }
};

logMsg("PostgreSQL DB Connection Module (db-connection.js) loaded.", "info");
