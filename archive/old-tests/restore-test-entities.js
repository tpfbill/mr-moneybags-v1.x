/**
 * @file restore-test-entities.js
 * @description This script restores the test entities and funds for the three-level hierarchy.
 * It is designed to be idempotent, meaning it can be run multiple times without creating duplicates.
 * 
 * Hierarchy to be created:
 * 1. The Principle Foundation (Top-Level)
 *    - TPF (Entity)
 *      - General Operating Fund (Fund)
 *      - Scholarship Fund (Fund)
 *    - TPF-ES (Entity)
 *      - Environmental Grants (Fund)
 *      - Advocacy Fund (Fund)
 *    - IFCSN (Entity)
 *      - Community Support (Fund)
 *      - Special Projects (Fund)
 */

const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// --- Database Configuration ---
// Note: This script connects directly to the database, similar to a migration script.
// It does not use the browser-based db.js module.
let dbConfig;
try {
    const configPath = path.join(__dirname, 'src', 'db', 'db-config.js');
    if (fs.existsSync(configPath)) {
        const { getDbConfig } = require(configPath);
        dbConfig = getDbConfig();
        console.log('Loaded database configuration from src/db/db-config.js');
    } else {
        throw new Error('db-config.js not found');
    }
} catch (err) {
    console.warn(`Warning: Could not load db-config.js. Using default configuration. Error: ${err.message}`);
    dbConfig = {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'npfa123',
        database: 'fund_accounting_db'
    };
}

const pool = new Pool(dbConfig);

// --- ANSI Color Codes for Logging ---
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m'
};

// --- Test Data Definition ---
const testData = {
  parent: { name: 'The Principle Foundation', code: 'TPF_PARENT', is_consolidated: true, status: 'Active' },
  children: [
    {
      name: 'TPF',
      code: 'TPF',
      is_consolidated: false,
      status: 'Active',
      funds: [
        { name: 'General Operating Fund', code: 'TPF-GEN', type: 'Unrestricted', balance: 120000, status: 'Active' },
        { name: 'Scholarship Fund', code: 'TPF-SCH', type: 'Temporarily Restricted', balance: 75000, status: 'Active' }
      ]
    },
    {
      name: 'TPF-ES',
      code: 'TPF-ES',
      is_consolidated: false,
      status: 'Active',
      funds: [
        { name: 'Environmental Grants', code: 'ES-GRNT', type: 'Temporarily Restricted', balance: 250000, status: 'Active' },
        { name: 'Advocacy Fund', code: 'ES-ADV', type: 'Unrestricted', balance: 50000, status: 'Active' }
      ]
    },
    {
      name: 'IFCSN',
      code: 'IFCSN',
      is_consolidated: false,
      status: 'Active',
      funds: [
        { name: 'Community Support', code: 'IFCSN-COM', type: 'Unrestricted', balance: 95000, status: 'Active' },
        { name: 'Special Projects', code: 'IFCSN-SP', type: 'Permanently Restricted', balance: 150000, status: 'Active' }
      ]
    }
  ]
};

/**
 * Main function to execute the restoration process.
 */
async function main() {
    console.log(`${colors.bright}${colors.blue}--- Starting Test Entity Restoration Script ---${colors.reset}`);
    const client = await pool.connect();
    console.log('Database connection established.');

    try {
        await client.query('BEGIN');
        console.log('Transaction started.');

        // --- Step 1: Insert or find the parent entity ---
        console.log(`\nProcessing parent entity: ${colors.cyan}${testData.parent.name}${colors.reset}`);
        let parentResult = await client.query(
            `INSERT INTO entities (name, code, is_consolidated, status, parent_entity_id)
             VALUES ($1, $2, $3, $4, NULL)
             ON CONFLICT (code) DO NOTHING
             RETURNING id;`,
            [testData.parent.name, testData.parent.code, testData.parent.is_consolidated, testData.parent.status]
        );

        let parentId;
        if (parentResult.rows.length > 0) {
            parentId = parentResult.rows[0].id;
            console.log(`${colors.green} -> Created parent entity with ID: ${parentId}${colors.reset}`);
        } else {
            // If it already existed, we need to fetch its ID
            console.log(`${colors.yellow} -> Parent entity with code '${testData.parent.code}' already exists. Fetching ID...${colors.reset}`);
            parentResult = await client.query('SELECT id FROM entities WHERE code = $1', [testData.parent.code]);
            if (parentResult.rows.length === 0) {
                throw new Error(`Failed to find existing parent entity with code ${testData.parent.code}`);
            }
            parentId = parentResult.rows[0].id;
            console.log(`${colors.green} -> Found parent entity with ID: ${parentId}${colors.reset}`);
        }

        // --- Step 2: Insert or find child entities and their funds ---
        for (const child of testData.children) {
            console.log(`\nProcessing child entity: ${colors.cyan}${child.name}${colors.reset}`);
            let childResult = await client.query(
                `INSERT INTO entities (name, code, is_consolidated, status, parent_entity_id)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (code) DO NOTHING
                 RETURNING id;`,
                [child.name, child.code, child.is_consolidated, child.status, parentId]
            );

            let childId;
            if (childResult.rows.length > 0) {
                childId = childResult.rows[0].id;
                console.log(`${colors.green}   -> Created child entity with ID: ${childId}${colors.reset}`);
            } else {
                console.log(`${colors.yellow}   -> Child entity with code '${child.code}' already exists. Fetching ID...${colors.reset}`);
                childResult = await client.query('SELECT id FROM entities WHERE code = $1', [child.code]);
                 if (childResult.rows.length === 0) {
                    throw new Error(`Failed to find existing child entity with code ${child.code}`);
                }
                childId = childResult.rows[0].id;
                console.log(`${colors.green}   -> Found child entity with ID: ${childId}${colors.reset}`);
            }

            // --- Step 3: Insert funds for the child entity ---
            for (const fund of child.funds) {
                console.log(`  Processing fund: ${colors.cyan}${fund.name}${colors.reset}`);
                const fundResult = await client.query(
                    `INSERT INTO funds (name, code, type, balance, status, entity_id)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (entity_id, code) DO NOTHING;`,
                    [fund.name, fund.code, fund.type, fund.balance, fund.status, childId]
                );
                if (fundResult.rowCount > 0) {
                    console.log(`${colors.green}     -> Created fund '${fund.name}'.${colors.reset}`);
                } else {
                    console.log(`${colors.yellow}     -> Fund with code '${fund.code}' for this entity already exists. Skipped.${colors.reset}`);
                }
            }
        }

        await client.query('COMMIT');
        console.log(`\n${colors.bright}${colors.green}--- Restoration Complete! Transaction committed. ---${colors.reset}`);

    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`${colors.bright}${colors.red}\n--- ERROR! ---${colors.reset}`);
        console.error('An error occurred during the restoration process. Transaction has been rolled back.');
        console.error(error);
        process.exit(1);
    } finally {
        client.release();
        console.log('Database connection released.');
        pool.end();
    }
}

// Execute the script
main().catch(err => {
    console.error('Unhandled error in main execution:', err);
    process.exit(1);
});
