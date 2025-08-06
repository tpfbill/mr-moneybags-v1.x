/**
 * @file load-principle-foundation-data.js
 * @description Consolidated script to load The Principle Foundation test data.
 * This script is idempotent and can be run multiple times safely.
 * 
 * It performs the following actions:
 * 1. Creates/updates The Principle Foundation parent entity (TPF_PARENT)
 * 2. Creates/updates the hierarchy (TPF, TPF-ES, IFCSN)
 * 3. Creates standard chart of accounts for each entity
 * 4. Creates standard funds for each entity
 * 5. Creates sample journal entries to support fund balances
 */

// Load environment variables from .env file (if present)
require('dotenv').config();

const { Client } = require('pg');
const crypto = require('crypto');
const { getDbConfig } = require('../src/db/db-config');

// Configuration
const CONFIG = {
  ENTITIES: {
    TPF_PARENT: {
      name: 'The Principle Foundation',
      code: 'TPF_PARENT',
      is_consolidated: true
    },
    TPF: {
      name: 'The Principle Foundation',
      code: 'TPF',
      is_consolidated: true
    },
    TPF_ES: {
      name: 'TPF Educational Services',
      code: 'TPF-ES',
      is_consolidated: false
    },
    IFCSN: {
      name: 'IFCSN',
      code: 'IFCSN',
      is_consolidated: false
    }
  },
  // Standard chart of accounts for nonprofit organizations
  ACCOUNTS: [
    { code: '1000', name: 'Cash', type: 'Asset' },
    { code: '1100', name: 'Accounts Receivable', type: 'Asset' },
    { code: '1200', name: 'Prepaid Expenses', type: 'Asset' },
    { code: '1300', name: 'Investments', type: 'Asset' },
    { code: '2000', name: 'Accounts Payable', type: 'Liability' },
    { code: '2100', name: 'Accrued Expenses', type: 'Liability' },
    { code: '2200', name: 'Deferred Revenue', type: 'Liability' },
    { code: '3000', name: 'Net Assets - Unrestricted', type: 'Equity' },
    { code: '3100', name: 'Net Assets - Temporarily Restricted', type: 'Equity' },
    { code: '3200', name: 'Net Assets - Permanently Restricted', type: 'Equity' },
    { code: '4000', name: 'Contributions - Unrestricted', type: 'Revenue' },
    { code: '4100', name: 'Contributions - Restricted', type: 'Revenue' },
    { code: '4200', name: 'Grant Revenue', type: 'Revenue' },
    { code: '4300', name: 'Program Service Fees', type: 'Revenue' },
    { code: '4400', name: 'Investment Income', type: 'Revenue' },
    { code: '5000', name: 'Salaries and Wages', type: 'Expense' },
    { code: '5100', name: 'Employee Benefits', type: 'Expense' },
    { code: '5200', name: 'Office Supplies', type: 'Expense' },
    { code: '5300', name: 'Professional Services', type: 'Expense' },
    { code: '5400', name: 'Rent', type: 'Expense' },
    { code: '5500', name: 'Travel', type: 'Expense' },
    { code: '5600', name: 'Program Expenses', type: 'Expense' },
    { code: '5700', name: 'Grants and Assistance', type: 'Expense' },
    // Use a valid type accepted by the `accounts_type_check` constraint
    { code: '9100', name: 'Inter-Entity Transfers', type: 'Expense' }
  ],
  // Standard funds
  FUNDS: {
    TPF: [
      { code: 'GEN', name: 'General Fund', type: 'Unrestricted', balance: 10000, description: 'General operating fund' },
      { code: 'REST', name: 'Restricted Fund', type: 'Temporarily Restricted', balance: 0, description: 'Temporarily restricted funds' },
      { code: 'TPF-GEN', name: 'TPF General Fund', type: 'Unrestricted', balance: 5000, description: 'TPF general operating fund' },
      { code: 'TPF-SCH', name: 'TPF Scholarship Fund', type: 'Temporarily Restricted', balance: 2500, description: 'Scholarship program fund' }
    ],
    TPF_ES: [
      { code: 'GEN', name: 'General Fund', type: 'Unrestricted', balance: 10000, description: 'General operating fund' },
      { code: 'REST', name: 'Restricted Fund', type: 'Temporarily Restricted', balance: 0, description: 'Temporarily restricted funds' },
      { code: 'ES-ADV', name: 'ES Advocacy Fund', type: 'Temporarily Restricted', balance: 1500, description: 'Educational advocacy fund' },
      { code: 'ES-GRNT', name: 'ES Grant Fund', type: 'Temporarily Restricted', balance: 3000, description: 'Educational grants fund' }
    ],
    IFCSN: [
      { code: 'GEN', name: 'General Fund', type: 'Unrestricted', balance: 10000, description: 'General operating fund' },
      { code: 'REST', name: 'Restricted Fund', type: 'Temporarily Restricted', balance: 0, description: 'Temporarily restricted funds' },
      { code: 'IFCSN-COM', name: 'IFCSN Community Fund', type: 'Temporarily Restricted', balance: 2000, description: 'Community support fund' },
      { code: 'IFCSN-SP', name: 'IFCSN Special Projects', type: 'Temporarily Restricted', balance: 1000, description: 'Special projects fund' }
    ]
  }
};

// Helper Functions
function generateId() {
  return crypto.randomUUID();
}

function logInfo(message) {
  console.log(message);
}

function logSuccess(message) {
  console.log(`✅ ${message}`);
}

function logError(prefix, err) {
  console.error(`❌ ${prefix}: ${err.message}`);
  if (err.code) console.error('  code   :', err.code);
  if (err.detail) console.error('  detail :', err.detail);
  if (err.stack) console.error('  stack  :\n', err.stack);
}

// Main function to load Principle Foundation data
async function loadPrincipleFoundationData() {
  const client = new Client(getDbConfig());
  
  try {
    logInfo('Connecting to database...');
    await client.connect();
    logSuccess('Connected to database');

    // Start transaction
    await client.query('BEGIN');

    // Step 1: Create/update the top-level parent entity
    const parentEntityId = await createTopLevelEntity(client);
    logSuccess(`Top-level parent entity created/updated with ID: ${parentEntityId}`);

    // Step 2: Create/update the TPF hierarchy
    const entityIds = await createEntityHierarchy(client, parentEntityId);
    logSuccess('Entity hierarchy created/updated successfully');

    // Step 3: Create standard chart of accounts for each entity
    await createChartOfAccounts(client, entityIds);
    logSuccess('Standard chart of accounts created for all entities');

    // Step 4: Create standard funds for each entity
    const fundIds = await createFunds(client, entityIds);
    logSuccess('Standard funds created for all entities');

    // Step 5: Create sample journal entries
    await createJournalEntries(client, entityIds, fundIds);
    logSuccess('Sample journal entries created successfully');

    // Commit the transaction
    await client.query('COMMIT');
    logSuccess('Transaction committed successfully');

    // Display the entity hierarchy
    await displayEntityHierarchy(client);

    return { success: true, message: 'The Principle Foundation data loaded successfully' };
  } catch (err) {
    // Rollback transaction on error
    await client.query('ROLLBACK');
    logError('Error loading Principle Foundation data', err);
    return { success: false, error: err.message };
  } finally {
    // Close the database connection
    await client.end();
    logInfo('Database connection closed');
  }
}

// Create or update the top-level parent entity
async function createTopLevelEntity(client) {
  const { name, code, is_consolidated } = CONFIG.ENTITIES.TPF_PARENT;
  
  logInfo(`Creating/updating top-level entity: ${name} (${code})...`);
  
  // Check if the entity already exists
  const checkResult = await client.query(
    'SELECT id FROM entities WHERE code = $1',
    [code]
  );
  
  let entityId;
  
  if (checkResult.rows.length > 0) {
    // Update existing entity
    entityId = checkResult.rows[0].id;
    await client.query(
      'UPDATE entities SET name = $1, is_consolidated = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
      [name, is_consolidated, entityId]
    );
    logInfo(`Updated existing top-level entity with ID: ${entityId}`);
  } else {
    // Create new entity
    entityId = generateId();
    await client.query(
      'INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated) VALUES ($1, $2, $3, NULL, $4)',
      [entityId, name, code, is_consolidated]
    );
    logInfo(`Created new top-level entity with ID: ${entityId}`);
  }
  
  return entityId;
}

// Create or update the entity hierarchy
async function createEntityHierarchy(client, parentEntityId) {
  logInfo('Creating/updating entity hierarchy...');
  
  const entityIds = {
    TPF_PARENT: parentEntityId
  };
  
  // Create/update TPF, TPF-ES, and IFCSN entities
  for (const entityKey of ['TPF', 'TPF_ES', 'IFCSN']) {
    const entityCode = CONFIG.ENTITIES[entityKey].code;
    const entityName = CONFIG.ENTITIES[entityKey].name;
    const isConsolidated = CONFIG.ENTITIES[entityKey].is_consolidated;
    
    // Check if entity already exists
    const checkResult = await client.query(
      'SELECT id FROM entities WHERE code = $1',
      [entityCode]
    );
    
    if (checkResult.rows.length > 0) {
      // Update existing entity
      entityIds[entityKey] = checkResult.rows[0].id;
      await client.query(
        'UPDATE entities SET name = $1, parent_entity_id = $2, is_consolidated = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [entityName, parentEntityId, isConsolidated, entityIds[entityKey]]
      );
      logInfo(`Updated existing entity: ${entityName} (${entityCode}) with ID: ${entityIds[entityKey]}`);
    } else {
      // Create new entity
      entityIds[entityKey] = generateId();
      await client.query(
        'INSERT INTO entities (id, name, code, parent_entity_id, is_consolidated) VALUES ($1, $2, $3, $4, $5)',
        [entityIds[entityKey], entityName, entityCode, parentEntityId, isConsolidated]
      );
      logInfo(`Created new entity: ${entityName} (${entityCode}) with ID: ${entityIds[entityKey]}`);
    }
  }
  
  return entityIds;
}

// Create standard chart of accounts for each entity
async function createChartOfAccounts(client, entityIds) {
  logInfo('Creating standard chart of accounts for each entity...');
  
  const accountIds = {};
  
  for (const entityKey of ['TPF', 'TPF_ES', 'IFCSN']) {
    const entityId = entityIds[entityKey];
    accountIds[entityKey] = {};
    
    for (const account of CONFIG.ACCOUNTS) {
      // Check if account already exists for this entity
      const checkResult = await client.query(
        'SELECT id FROM accounts WHERE entity_id = $1 AND code = $2',
        [entityId, account.code]
      );
      
      if (checkResult.rows.length === 0) {
        // Create new account
        const accountId = generateId();
        await client.query(
          'INSERT INTO accounts (id, entity_id, code, name, type) VALUES ($1, $2, $3, $4, $5)',
          [accountId, entityId, account.code, account.name, account.type]
        );
        accountIds[entityKey][account.code] = accountId;
        logInfo(`Created account ${account.code} - ${account.name} for ${CONFIG.ENTITIES[entityKey].name}`);
      } else {
        // Store existing account ID
        accountIds[entityKey][account.code] = checkResult.rows[0].id;
      }
    }
    
    logSuccess(`Completed chart of accounts for ${CONFIG.ENTITIES[entityKey].name}`);
  }
  
  return accountIds;
}

// Create standard funds for each entity
async function createFunds(client, entityIds) {
  logInfo('Creating standard funds for each entity...');
  
  const fundIds = {};
  
  for (const entityKey of ['TPF', 'TPF_ES', 'IFCSN']) {
    const entityId = entityIds[entityKey];
    const funds = CONFIG.FUNDS[entityKey];
    fundIds[entityKey] = {};
    
    for (const fund of funds) {
      // Check if fund already exists for this entity
      const checkResult = await client.query(
        'SELECT id FROM funds WHERE entity_id = $1 AND code = $2',
        [entityId, fund.code]
      );
      
      if (checkResult.rows.length === 0) {
        // Create new fund
        const fundId = generateId();
        await client.query(
          'INSERT INTO funds (id, entity_id, code, name, type, balance, description) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [fundId, entityId, fund.code, fund.name, fund.type, fund.balance, fund.description]
        );
        fundIds[entityKey][fund.code] = fundId;
        logInfo(`Created fund ${fund.code} - ${fund.name} for ${CONFIG.ENTITIES[entityKey].name} with balance ${fund.balance}`);
      } else {
        // Update existing fund's balance
        await client.query(
          'UPDATE funds SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE entity_id = $2 AND code = $3',
          [fund.balance, entityId, fund.code]
        );
        fundIds[entityKey][fund.code] = checkResult.rows[0].id;
        logInfo(`Updated fund ${fund.code} - ${fund.name} for ${CONFIG.ENTITIES[entityKey].name} with balance ${fund.balance}`);
      }
    }
    
    logSuccess(`Completed funds for ${CONFIG.ENTITIES[entityKey].name}`);
  }
  
  return fundIds;
}

// Create sample journal entries
async function createJournalEntries(client, entityIds, fundIds) {
  logInfo('Creating sample journal entries...');
  
  // Get account IDs for each entity
  const accountIds = {};
  for (const entityKey of ['TPF', 'TPF_ES', 'IFCSN']) {
    const entityId = entityIds[entityKey];
    accountIds[entityKey] = {};
    
    const accountsResult = await client.query(
      'SELECT id, code FROM accounts WHERE entity_id = $1',
      [entityId]
    );
    
    accountsResult.rows.forEach(row => {
      accountIds[entityKey][row.code] = row.id;
    });
  }
  
  // Clear existing journal entries (to prevent duplicates)
  await client.query('DELETE FROM journal_entry_items');
  await client.query('DELETE FROM journal_entries');
  
  // Create journal entries for each entity
  for (const entityKey of ['TPF', 'TPF_ES', 'IFCSN']) {
    const entityId = entityIds[entityKey];
    const entityName = CONFIG.ENTITIES[entityKey].name;
    
    // 1. Opening Balance Entries (one per fund)
    for (const fund of CONFIG.FUNDS[entityKey]) {
      if (fund.balance > 0) {
        const jeId = await createJournalEntry(
          client,
          entityId,
          `Opening Balance - ${fund.name}`,
          '2025-01-01',
          `OB-${entityKey}-${fund.code}`,
          fund.balance
        );
        
        // Debit Cash
        await createJournalEntryItem(
          client,
          jeId,
          accountIds[entityKey]['1000'], // Cash
          fundIds[entityKey][fund.code],
          fund.balance,
          0,
          `Opening balance for ${fund.name}`
        );
        
        // Credit appropriate equity account based on fund type
        const equityAccountCode = fund.type === 'Unrestricted' ? '3000' : '3100';
        await createJournalEntryItem(
          client,
          jeId,
          accountIds[entityKey][equityAccountCode],
          fundIds[entityKey][fund.code],
          0,
          fund.balance,
          `Opening balance for ${fund.name}`
        );
        
        logInfo(`Created opening balance entry for ${fund.name} (${entityName}): ${fund.balance}`);
      }
    }
    
    // 2. Contribution/Revenue Entries (for funds with balances)
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    
    // Major donation to general fund
    if (fundIds[entityKey]['GEN']) {
      const amount = 5000;
      const jeId = await createJournalEntry(
        client,
        entityId,
        `Major Donation - ${entityName}`,
        `${currentYear}-${(currentMonth - 2).toString().padStart(2, '0')}-15`, // 2 months ago
        `DON-${entityKey}-${generateRandomRef()}`,
        amount
      );
      
      // Debit Cash
      await createJournalEntryItem(
        client,
        jeId,
        accountIds[entityKey]['1000'], // Cash
        fundIds[entityKey]['GEN'],
        amount,
        0,
        'Major unrestricted donation'
      );
      
      // Credit Contributions
      await createJournalEntryItem(
        client,
        jeId,
        accountIds[entityKey]['4000'], // Contributions - Unrestricted
        fundIds[entityKey]['GEN'],
        0,
        amount,
        'Major unrestricted donation'
      );
      
      logInfo(`Created major donation entry for ${entityName}: ${amount}`);
    }
    
    // Restricted donation (if entity has restricted funds)
    const restrictedFundCode = entityKey === 'TPF' ? 'TPF-SCH' : 
                              entityKey === 'TPF_ES' ? 'ES-GRNT' : 
                              entityKey === 'IFCSN' ? 'IFCSN-COM' : null;
    
    if (restrictedFundCode && fundIds[entityKey][restrictedFundCode]) {
      const amount = 2500;
      const jeId = await createJournalEntry(
        client,
        entityId,
        `Restricted Donation - ${CONFIG.FUNDS[entityKey].find(f => f.code === restrictedFundCode).name}`,
        `${currentYear}-${(currentMonth - 1).toString().padStart(2, '0')}-10`, // 1 month ago
        `RDON-${entityKey}-${generateRandomRef()}`,
        amount
      );
      
      // Debit Cash
      await createJournalEntryItem(
        client,
        jeId,
        accountIds[entityKey]['1000'], // Cash
        fundIds[entityKey][restrictedFundCode],
        amount,
        0,
        'Restricted donation for specific program'
      );
      
      // Credit Restricted Contributions
      await createJournalEntryItem(
        client,
        jeId,
        accountIds[entityKey]['4100'], // Contributions - Restricted
        fundIds[entityKey][restrictedFundCode],
        0,
        amount,
        'Restricted donation for specific program'
      );
      
      logInfo(`Created restricted donation entry for ${entityName}: ${amount}`);
    }
    
    // 3. Expense Entries
    // Office supplies expense
    const suppliesAmount = 750;
    const suppliesJeId = await createJournalEntry(
      client,
      entityId,
      `Office Supplies - ${entityName}`,
      `${currentYear}-${(currentMonth - 1).toString().padStart(2, '0')}-20`, // Last month
      `EXP-${entityKey}-${generateRandomRef()}`,
      suppliesAmount
    );
    
    // Debit Office Supplies expense
    await createJournalEntryItem(
      client,
      suppliesJeId,
      accountIds[entityKey]['5200'], // Office Supplies
      fundIds[entityKey]['GEN'],
      suppliesAmount,
      0,
      'Monthly office supplies'
    );
    
    // Credit Cash
    await createJournalEntryItem(
      client,
      suppliesJeId,
      accountIds[entityKey]['1000'], // Cash
      fundIds[entityKey]['GEN'],
      0,
      suppliesAmount,
      'Monthly office supplies'
    );
    
    logInfo(`Created office supplies expense entry for ${entityName}: ${suppliesAmount}`);
    
    // Program expense (if entity has restricted funds)
    if (restrictedFundCode && fundIds[entityKey][restrictedFundCode]) {
      const programAmount = 1200;
      const programJeId = await createJournalEntry(
        client,
        entityId,
        `Program Expense - ${CONFIG.FUNDS[entityKey].find(f => f.code === restrictedFundCode).name}`,
        `${currentYear}-${currentMonth.toString().padStart(2, '0')}-05`, // This month
        `PEXP-${entityKey}-${generateRandomRef()}`,
        programAmount
      );
      
      // Debit Program Expenses
      await createJournalEntryItem(
        client,
        programJeId,
        accountIds[entityKey]['5600'], // Program Expenses
        fundIds[entityKey][restrictedFundCode],
        programAmount,
        0,
        'Program-related expenses'
      );
      
      // Credit Cash
      await createJournalEntryItem(
        client,
        programJeId,
        accountIds[entityKey]['1000'], // Cash
        fundIds[entityKey][restrictedFundCode],
        0,
        programAmount,
        'Program-related expenses'
      );
      
      logInfo(`Created program expense entry for ${entityName}: ${programAmount}`);
    }
    
    // 4. Inter-Entity Transfer (for TPF entity only)
    if (entityKey === 'TPF' && fundIds['TPF_ES'] && fundIds['TPF_ES']['ES-GRNT']) {
      const transferAmount = 1500;
      const transferJeId = await createJournalEntry(
        client,
        entityId,
        'Transfer to TPF-ES Grant Fund',
        `${currentYear}-${currentMonth.toString().padStart(2, '0')}-10`, // This month
        `TRF-TPF-TPFES-${generateRandomRef()}`,
        transferAmount,
        true, // is_inter_entity
        entityIds['TPF_ES'] // target_entity_id
      );
      
      // Debit Inter-Entity Transfers
      await createJournalEntryItem(
        client,
        transferJeId,
        accountIds[entityKey]['9100'], // Inter-Entity Transfers
        fundIds[entityKey]['GEN'],
        transferAmount,
        0,
        'Transfer to TPF Educational Services for grant funding'
      );
      
      // Credit Cash
      await createJournalEntryItem(
        client,
        transferJeId,
        accountIds[entityKey]['1000'], // Cash
        fundIds[entityKey]['GEN'],
        0,
        transferAmount,
        'Transfer to TPF Educational Services for grant funding'
      );
      
      // Create matching entry in TPF-ES
      const matchingJeId = await createJournalEntry(
        client,
        entityIds['TPF_ES'],
        'Transfer from TPF',
        `${currentYear}-${currentMonth.toString().padStart(2, '0')}-10`, // Same date
        `TRF-TPFES-TPF-${generateRandomRef()}`,
        transferAmount,
        true, // is_inter_entity
        entityId, // target_entity_id
        transferJeId // matching_transaction_id
      );
      
      // Debit Cash
      await createJournalEntryItem(
        client,
        matchingJeId,
        accountIds['TPF_ES']['1000'], // Cash
        fundIds['TPF_ES']['ES-GRNT'],
        transferAmount,
        0,
        'Transfer from TPF for grant funding'
      );
      
      // Credit Inter-Entity Transfers
      await createJournalEntryItem(
        client,
        matchingJeId,
        accountIds['TPF_ES']['9100'], // Inter-Entity Transfers
        fundIds['TPF_ES']['ES-GRNT'],
        0,
        transferAmount,
        'Transfer from TPF for grant funding'
      );
      
      // Update matching_transaction_id for the first entry
      await client.query(
        'UPDATE journal_entries SET matching_transaction_id = $1 WHERE id = $2',
        [matchingJeId, transferJeId]
      );
      
      logInfo(`Created inter-entity transfer entries between TPF and TPF-ES: ${transferAmount}`);
    }
  }
  
  logSuccess('Sample journal entries created successfully');
}

// Helper function to create a journal entry
async function createJournalEntry(client, entityId, description, entryDate, referenceNumber, totalAmount, isInterEntity = false, targetEntityId = null, matchingTransactionId = null) {
  const journalEntryId = generateId();
  
  await client.query(
    `INSERT INTO journal_entries 
     (id, entity_id, date, description, entry_date, reference_number, total_amount, status, is_inter_entity, target_entity_id, matching_transaction_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      journalEntryId,
      entityId,
      entryDate,          // date (NOT NULL)
      description,
      entryDate,          // entry_date
      referenceNumber,
      totalAmount,
      'Posted',
      isInterEntity,
      targetEntityId,
      matchingTransactionId
    ]
  );
  
  return journalEntryId;
}

// Helper function to create a journal entry item
async function createJournalEntryItem(
  client,
  journalEntryId,
  accountId,
  fundId,
  debit,
  credit,
  description
) {
  const itemId = generateId();
  
  await client.query(
    `INSERT INTO journal_entry_items
     (id, journal_entry_id, account_id, fund_id, debit, credit, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      itemId,
      journalEntryId,
      accountId,
      fundId,
      debit,
      credit,
      description
    ]
  );
  
  return itemId;
}

// Helper function to generate a random reference number
function generateRandomRef() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

// Display the entity hierarchy
async function displayEntityHierarchy(client) {
  logInfo('\nEntity Hierarchy:');
  
  const result = await client.query(`
    SELECT 
      e.code, 
      e.name, 
      p.code as parent_code, 
      p.name as parent_name,
      e.is_consolidated
    FROM 
      entities e
    LEFT JOIN 
      entities p ON e.parent_entity_id = p.id
    ORDER BY 
      e.code
  `);
  
  console.table(result.rows);
}

// Execute the script if run directly
if (require.main === module) {
  loadPrincipleFoundationData()
    .then(result => {
      if (result.success) {
        logSuccess('Script completed successfully');
        process.exit(0);
      } else {
        logError('Script failed', new Error(result.error));
        process.exit(1);
      }
    })
    .catch(err => {
      logError('Unhandled error', err);
      process.exit(1);
    });
} else {
  // Export for use as a module
  module.exports = {
    loadPrincipleFoundationData
  };
}
