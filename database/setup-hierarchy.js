#!/usr/bin/env node

/**
 * setup-hierarchy.js
 * 
 * This script sets up the three-level hierarchy structure for The Principle Foundation:
 * 1. Top level: The Principle Foundation (parent organization)
 * 2. Second level: Entities (TPF, TPF-ES, IFCSN)
 * 3. Third level: Funds under each entity
 * 
 * The script:
 * - Connects to the PostgreSQL database
 * - Reads and executes the SQL from add_top_level_organization.sql
 * - Provides feedback on the changes made
 * - Displays the current hierarchy after changes
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const readline = require('readline');

// Import database configuration
let dbConfig;
try {
    const configPath = path.join(__dirname, 'src', 'db', 'db-config.js');
    if (fs.existsSync(configPath)) {
        const configModule = require(configPath);
        dbConfig = configModule.getDbConfig();
    } else {
        // Default configuration if file not found
        dbConfig = {
            host: 'localhost',
            port: 5432,
            user: 'postgres',
            password: 'npfa123',
            database: 'fund_accounting_db'
        };
    }
} catch (err) {
    console.error('Error loading database configuration:', err.message);
    console.log('Using default configuration...');
    dbConfig = {
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'npfa123',
        database: 'fund_accounting_db'
    };
}

// Create a new pool instance
const pool = new Pool(dbConfig);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    underscore: '\x1b[4m',
    blink: '\x1b[5m',
    reverse: '\x1b[7m',
    hidden: '\x1b[8m',
    
    fg: {
        black: '\x1b[30m',
        red: '\x1b[31m',
        green: '\x1b[32m',
        yellow: '\x1b[33m',
        blue: '\x1b[34m',
        magenta: '\x1b[35m',
        cyan: '\x1b[36m',
        white: '\x1b[37m',
        gray: '\x1b[90m',
    },
    
    bg: {
        black: '\x1b[40m',
        red: '\x1b[41m',
        green: '\x1b[42m',
        yellow: '\x1b[43m',
        blue: '\x1b[44m',
        magenta: '\x1b[45m',
        cyan: '\x1b[46m',
        white: '\x1b[47m',
        gray: '\x1b[100m',
    }
};

/**
 * Reads the SQL file content
 * @param {string} filePath - Path to the SQL file
 * @returns {Promise<string>} SQL file content
 */
async function readSqlFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`${colors.fg.red}Error reading SQL file:${colors.reset}`, err.message);
        throw err;
    }
}

/**
 * Executes the SQL content
 * @param {string} sql - SQL content to execute
 * @returns {Promise<void>}
 */
async function executeSql(sql) {
    const client = await pool.connect();
    try {
        console.log(`${colors.fg.cyan}Executing SQL...${colors.reset}`);
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');
        console.log(`${colors.fg.green}SQL executed successfully!${colors.reset}`);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`${colors.fg.red}Error executing SQL:${colors.reset}`, err.message);
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Checks if the top-level organization exists
 * @returns {Promise<boolean>}
 */
async function checkTopLevelOrganizationExists() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT COUNT(*) as count 
            FROM entities 
            WHERE name = 'The Principle Foundation' 
            OR code = 'TPF_PARENT'
        `);
        return parseInt(result.rows[0].count) > 0;
    } catch (err) {
        console.error(`${colors.fg.red}Error checking top-level organization:${colors.reset}`, err.message);
        return false;
    } finally {
        client.release();
    }
}

/**
 * Displays the current entity hierarchy
 * @returns {Promise<void>}
 */
async function displayHierarchy() {
    const client = await pool.connect();
    try {
        console.log(`\n${colors.bright}${colors.fg.blue}Current Entity Hierarchy:${colors.reset}\n`);
        
        // Query to get all entities with their parent information
        const result = await client.query(`
            WITH RECURSIVE entity_tree AS (
                -- Base case: top-level entities (no parent)
                SELECT 
                    e.id, 
                    e.name, 
                    e.code, 
                    e.parent_entity_id, 
                    e.is_consolidated,
                    e.status,
                    0 as level,
                    e.name as path
                FROM 
                    entities e
                WHERE 
                    e.parent_entity_id IS NULL
                
                UNION ALL
                
                -- Recursive case: child entities
                SELECT 
                    e.id, 
                    e.name, 
                    e.code, 
                    e.parent_entity_id, 
                    e.is_consolidated,
                    e.status,
                    et.level + 1,
                    et.path || ' > ' || e.name
                FROM 
                    entities e
                JOIN 
                    entity_tree et ON e.parent_entity_id = et.id
            )
            SELECT 
                id, 
                name, 
                code, 
                parent_entity_id, 
                is_consolidated,
                status,
                level,
                path
            FROM 
                entity_tree
            ORDER BY 
                path;
        `);
        
        // Display the hierarchy with indentation
        if (result.rows.length === 0) {
            console.log(`${colors.fg.yellow}No entities found in the database.${colors.reset}`);
        } else {
            // Display header
            console.log(`${colors.underscore}${'Level'.padEnd(8)} ${'Name'.padEnd(30)} ${'Code'.padEnd(12)} ${'Status'.padEnd(10)} ${'Consolidated'.padEnd(12)}${colors.reset}`);
            
            // Display entities
            result.rows.forEach(entity => {
                const indent = '  '.repeat(entity.level);
                const levelIndicator = entity.level === 0 ? '🏢' : entity.level === 1 ? '🏛️' : '📁';
                const consolidatedIcon = entity.is_consolidated ? '✅' : '❌';
                const statusColor = entity.status === 'Active' ? colors.fg.green : colors.fg.red;
                
                console.log(
                    `${indent}${levelIndicator} ${colors.fg.cyan}${entity.name.padEnd(30 - indent.length)}${colors.reset} ` +
                    `${colors.fg.yellow}${entity.code.padEnd(12)}${colors.reset} ` +
                    `${statusColor}${entity.status.padEnd(10)}${colors.reset} ` +
                    `${consolidatedIcon}`
                );
            });
        }
        
        // Display funds count per entity
        console.log(`\n${colors.bright}${colors.fg.blue}Funds per Entity:${colors.reset}\n`);
        
        const fundsResult = await client.query(`
            SELECT 
                e.name as entity_name, 
                e.code as entity_code,
                COUNT(f.id) as fund_count,
                SUM(f.balance) as total_balance
            FROM 
                entities e
            LEFT JOIN 
                funds f ON e.id = f.entity_id
            GROUP BY 
                e.id, e.name, e.code
            ORDER BY 
                e.name;
        `);
        
        if (fundsResult.rows.length === 0) {
            console.log(`${colors.fg.yellow}No funds found in the database.${colors.reset}`);
        } else {
            // Display header
            console.log(`${colors.underscore}${'Entity'.padEnd(30)} ${'Code'.padEnd(12)} ${'Fund Count'.padEnd(12)} ${'Total Balance'.padEnd(15)}${colors.reset}`);
            
            // Display funds per entity
            fundsResult.rows.forEach(row => {
                const fundCount = parseInt(row.fund_count) || 0;
                const totalBalance = parseFloat(row.total_balance) || 0;
                const formattedBalance = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalBalance);
                
                console.log(
                    `${colors.fg.cyan}${row.entity_name.padEnd(30)}${colors.reset} ` +
                    `${colors.fg.yellow}${row.entity_code.padEnd(12)}${colors.reset} ` +
                    `${fundCount.toString().padEnd(12)} ` +
                    `${formattedBalance.padEnd(15)}`
                );
            });
        }
        
    } catch (err) {
        console.error(`${colors.fg.red}Error displaying hierarchy:${colors.reset}`, err.message);
    } finally {
        client.release();
    }
}

/**
 * Prompts the user for confirmation
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} User's response
 */
async function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question(`${question} (y/n) `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * Main function
 */
async function main() {
    try {
        console.log(`${colors.bright}${colors.fg.green}=== Non-Profit Fund Accounting System - Hierarchy Setup ===${colors.reset}\n`);
        
        // Check database connection
        console.log(`${colors.fg.cyan}Connecting to database...${colors.reset}`);
        await pool.query('SELECT NOW()');
        console.log(`${colors.fg.green}Connected to database successfully!${colors.reset}`);
        
        // Check if top-level organization already exists
        const topLevelExists = await checkTopLevelOrganizationExists();
        
        if (topLevelExists) {
            console.log(`${colors.fg.yellow}The top-level organization already exists.${colors.reset}`);
            const shouldContinue = await promptUser('Do you want to display the current hierarchy?');
            
            if (shouldContinue) {
                await displayHierarchy();
            }
        } else {
            // Read SQL file
            console.log(`${colors.fg.cyan}Reading SQL file...${colors.reset}`);
            const sqlFilePath = path.join(__dirname, 'add_top_level_organization.sql');
            const sql = await readSqlFile(sqlFilePath);
            
            // Execute SQL
            await executeSql(sql);
            
            // Display hierarchy after changes
            console.log(`\n${colors.fg.green}Hierarchy setup completed successfully!${colors.reset}`);
            await displayHierarchy();
        }
        
        console.log(`\n${colors.bright}${colors.fg.green}=== Setup Complete ===${colors.reset}`);
    } catch (err) {
        console.error(`${colors.fg.red}Error:${colors.reset}`, err.message);
        process.exit(1);
    } finally {
        // Close pool
        await pool.end();
    }
}

// Run the script
main();
