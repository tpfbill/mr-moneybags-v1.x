#!/usr/bin/env node
/**
 * Update Fund Starting Balances from Account Beginning Balances
 * 
 * Calculates each fund's starting_balance by summing the beginning_balance
 * of all balance sheet accounts (assets, liabilities, net assets) that
 * share the same entity_code, fund_number, and restriction.
 * 
 * Usage: node scripts/update-fund-starting-balances.js [--dry-run]
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { getDbConfig } = require('../src/db/db-config');

const STARTING_BALANCE_DATE = '2024-12-01';
const LOGS_DIR = path.join(__dirname, '../logs');

const pool = new Pool(getDbConfig());

// Create logs directory if it doesn't exist
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Generate log filename with date
const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-');
const LOG_FILE = path.join(LOGS_DIR, `update-fund-starting-balances-${dateStr}_${timeStr}.log`);

const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

function log(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${message}`;
    console.log(message);
    logStream.write(line + '\n');
}

function logError(message) {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ERROR: ${message}`;
    console.error(message);
    logStream.write(line + '\n');
}

async function updateFundStartingBalances(dryRun = false) {
    log(`Log file: ${LOG_FILE}`);
    log(`Starting balance date: ${STARTING_BALANCE_DATE}`);
    log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    log('---');

    const client = await pool.connect();

    try {
        // Get all funds
        const fundsResult = await client.query(`
            SELECT id, fund_code, fund_name, entity_code, fund_number, restriction,
                   starting_balance as current_starting_balance
            FROM funds
            ORDER BY entity_code, fund_number, restriction
        `);

        log(`Found ${fundsResult.rows.length} funds`);
        log('');

        // Calculate starting balance for each fund from balance sheet accounts
        // Balance sheet accounts are those where balance_sheet = 'Yes'
        const balancesResult = await client.query(`
            SELECT 
                entity_code,
                fund_number,
                restriction,
                SUM(COALESCE(beginning_balance, 0)) as calculated_balance,
                COUNT(*) as account_count
            FROM accounts
            WHERE balance_sheet = 'Yes'
            GROUP BY entity_code, fund_number, restriction
            ORDER BY entity_code, fund_number, restriction
        `);

        // Create a lookup map for calculated balances
        const balanceMap = new Map();
        for (const row of balancesResult.rows) {
            const key = `${row.entity_code}|${row.fund_number}|${row.restriction}`;
            balanceMap.set(key, {
                balance: parseFloat(row.calculated_balance) || 0,
                accountCount: parseInt(row.account_count) || 0
            });
        }

        log(`Calculated balances for ${balanceMap.size} entity/fund/restriction combinations`);
        log('---');

        if (!dryRun) {
            await client.query('BEGIN');
        }

        let updated = 0;
        let unchanged = 0;
        let noAccounts = 0;

        for (const fund of fundsResult.rows) {
            const key = `${fund.entity_code}|${fund.fund_number}|${fund.restriction}`;
            const calculated = balanceMap.get(key);

            if (!calculated || calculated.accountCount === 0) {
                log(`  [NO ACCOUNTS] ${fund.fund_code} (${fund.fund_name}) - entity: ${fund.entity_code}, fund: ${fund.fund_number}, restriction: ${fund.restriction}`);
                noAccounts++;
                continue;
            }

            const newBalance = Math.round(calculated.balance * 100) / 100;
            const currentBalance = Math.round((parseFloat(fund.current_starting_balance) || 0) * 100) / 100;

            if (newBalance === currentBalance) {
                log(`  [UNCHANGED] ${fund.fund_code}: ${newBalance.toFixed(2)} (${calculated.accountCount} accounts)`);
                unchanged++;
                continue;
            }

            if (!dryRun) {
                await client.query(`
                    UPDATE funds 
                    SET starting_balance = $1,
                        starting_balance_date = $2
                    WHERE id = $3
                `, [newBalance, STARTING_BALANCE_DATE, fund.id]);
            }

            const action = dryRun ? '[DRY RUN] Would update' : 'Updated';
            log(`  ${action} ${fund.fund_code} (${fund.fund_name}): ${currentBalance.toFixed(2)} -> ${newBalance.toFixed(2)} (from ${calculated.accountCount} balance sheet accounts)`);
            updated++;
        }

        if (!dryRun) {
            await client.query('COMMIT');
        }

        log('---');
        log('Summary:');
        log(`  Funds updated: ${updated}`);
        log(`  Funds unchanged: ${unchanged}`);
        log(`  Funds with no balance sheet accounts: ${noAccounts}`);
        log(`  Total funds: ${fundsResult.rows.length}`);

    } catch (err) {
        if (!dryRun) {
            await client.query('ROLLBACK');
        }
        logError('Error: ' + err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
        logStream.end();
    }
}

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-n');

updateFundStartingBalances(dryRun)
    .then(() => {
        log('\nUpdate completed successfully.');
        process.exit(0);
    })
    .catch(err => {
        logError('\nUpdate failed: ' + err);
        process.exit(1);
    });
