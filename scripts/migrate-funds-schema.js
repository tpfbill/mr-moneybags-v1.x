#!/usr/bin/env node
/**
 * migrate-funds-schema.js
 * 
 * Migration script to update the funds table schema according to new requirements.
 * This script performs the following changes:
 * 
 * 1. Drop columns: type, description, balance, created_at
 * 2. Rename columns: name->fund_name, code->fund_code, updated_at->last_used
 * 3. Add new columns: fund_number, entity_name, entity_code, restriction, budget, balance_sheet
 * 4. Update indices and constraints
 * 5. Remove entity_id column (after new columns exist)
 * 
 * All operations are performed in a transaction and are idempotent.
 */

const { pool } = require('../src/database/connection');

// Track changes for summary report
const changes = {
  columnsDropped: [],
  columnsRenamed: [],
  columnsAdded: [],
  constraintsModified: [],
  indicesCreated: [],
  errors: []
};

async function main() {
  const client = await pool.connect();
  
  try {
    // Start transaction
    await client.query('BEGIN');
    console.log('Starting funds table schema migration...');
    
    // Step 1: Check if the funds table exists
    const tableExists = await checkTableExists(client, 'funds');
    if (!tableExists) {
      throw new Error('Funds table does not exist. Migration aborted.');
    }
    
    // Step 2: Drop columns if they exist
    await dropColumnsIfExist(client, 'funds', ['type', 'description', 'balance', 'created_at']);
    
    // Step 3: Add new columns if they don't exist
    await addColumnsIfNotExist(client);
    
    // Step 4: Rename columns if they exist
    await renameColumnsIfExist(client);
    
    // Step 5: Update indices and constraints
    await updateIndicesAndConstraints(client);
    
    // Step 6: Remove entity_id column if it exists
    await removeEntityIdIfExists(client);
    // Step 7: Remove temporary defaults
    await removeTemporaryDefaults(client);
    
    // Commit transaction
    await client.query('COMMIT');
    console.log('Migration completed successfully.');
    
    // Print summary
    printSummary();
    
  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('Error during migration, rolled back:', error);
    changes.errors.push(error.message);
    printSummary();
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

/**
 * Check if a table exists in the database
 */
async function checkTableExists(client, tableName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = $1
    ) as exists
  `, [tableName]);
  
  return rows[0].exists;
}

/**
 * Check if a column exists in a table
 */
async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND column_name = $2
    ) as exists
  `, [tableName, columnName]);
  
  return rows[0].exists;
}

/**
 * Check if a constraint exists on a table
 */
async function constraintExists(client, tableName, constraintName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
      AND table_name = $1 
      AND constraint_name = $2
    ) as exists
  `, [tableName, constraintName]);
  
  return rows[0].exists;
}

/**
 * Check if an index exists
 */
async function indexExists(client, indexName) {
  const { rows } = await client.query(`
    SELECT EXISTS (
      SELECT FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname = $1
    ) as exists
  `, [indexName]);
  
  return rows[0].exists;
}

/**
 * Drop columns if they exist
 */
async function dropColumnsIfExist(client, tableName, columnNames) {
  for (const columnName of columnNames) {
    const exists = await columnExists(client, tableName, columnName);
    
    if (exists) {
      await client.query(`ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName}`);
      console.log(`Dropped column ${columnName} from ${tableName}`);
      changes.columnsDropped.push(columnName);
    }
  }
}

/**
 * Add temporary defaults for new columns
 */
async function addTemporaryDefaults(client) {
  // This will be used when adding new NOT NULL columns to handle existing rows
  await client.query(`
    DO $$
    BEGIN
      -- Create a function to set temporary defaults
      CREATE OR REPLACE FUNCTION temp_set_column_default(
        p_table text, p_column text, p_default text
      ) RETURNS void AS $$
      BEGIN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET DEFAULT %s', 
                      p_table, p_column, p_default);
      END;
      $$ LANGUAGE plpgsql;
    END $$;
  `);
}

/**
 * Add new columns if they don't exist
 */
async function addColumnsIfNotExist(client) {
  // Define columns to add with their properties
  const columnsToAdd = [
    {
      name: 'fund_number',
      definition: `VARCHAR(10) DEFAULT '000000' NOT NULL`,
      constraint: null
    },
    {
      name: 'entity_name',
      definition: `VARCHAR(10) DEFAULT 'TPF' NOT NULL`,
      constraint: `CHECK (entity_name IN ('TPF', 'TPFES', 'NFCSN'))`
    },
    {
      name: 'entity_code',
      definition: `VARCHAR(10) DEFAULT '1' NOT NULL`,
      constraint: `CHECK (entity_code IN ('1', '2', '3'))`
    },
    {
      name: 'restriction',
      definition: `VARCHAR(10) DEFAULT '00' NOT NULL`,
      constraint: `CHECK (restriction IN ('00', '01'))`
    },
    {
      name: 'budget',
      definition: `VARCHAR(10) DEFAULT 'No' NOT NULL`,
      constraint: `CHECK (budget IN ('Yes', 'No'))`
    },
    {
      name: 'balance_sheet',
      definition: `VARCHAR(10) DEFAULT 'No' NOT NULL`,
      constraint: `CHECK (balance_sheet IN ('Yes', 'No'))`
    }
  ];
  
  for (const column of columnsToAdd) {
    const exists = await columnExists(client, 'funds', column.name);
    
    if (!exists) {
      let sql = `ALTER TABLE funds ADD COLUMN ${column.name} ${column.definition}`;
      
      if (column.constraint) {
        const constraintName = `chk_funds_${column.name}`;
        const hasConstraint = await constraintExists(client, 'funds', constraintName);
        
        if (!hasConstraint) {
          sql += ` CONSTRAINT ${constraintName} ${column.constraint}`;
        }
      }
      
      await client.query(sql);
      console.log(`Added column ${column.name} to funds table`);
      changes.columnsAdded.push(column.name);
    }
  }
}

/**
 * Rename columns if they exist
 */
async function renameColumnsIfExist(client) {
  // Define columns to rename with their new types
  const columnsToRename = [
    {
      oldName: 'name',
      newName: 'fund_name',
      newType: 'VARCHAR(100) NOT NULL'
    },
    {
      oldName: 'code',
      newName: 'fund_code',
      newType: 'VARCHAR(10) NOT NULL'
    },
    {
      oldName: 'updated_at',
      newName: 'last_used',
      newType: 'DATE NOT NULL DEFAULT CURRENT_DATE',
      // After renaming, reference the new column name in USING clause
      using: 'last_used::date'
    }
  ];
  
  for (const column of columnsToRename) {
    const oldExists = await columnExists(client, 'funds', column.oldName);
    const newExists = await columnExists(client, 'funds', column.newName);
    
    if (oldExists && !newExists) {
      // First rename the column
      await client.query(`ALTER TABLE funds RENAME COLUMN ${column.oldName} TO ${column.newName}`);
      console.log(`Renamed column ${column.oldName} to ${column.newName}`);
      
      // Then alter its type if needed
      if (column.newType) {
        let sql = `ALTER TABLE funds ALTER COLUMN ${column.newName} TYPE ${column.newType.split(' ')[0]}`;
        
        if (column.using) {
          sql += ` USING ${column.using}`;
        }
        
        await client.query(sql);
        
        // Set NOT NULL constraint if specified
        if (column.newType.includes('NOT NULL')) {
          await client.query(`ALTER TABLE funds ALTER COLUMN ${column.newName} SET NOT NULL`);
        }
        
        // Set DEFAULT if specified
        if (column.newType.includes('DEFAULT')) {
          const defaultMatch = column.newType.match(/DEFAULT\s+([^\s]+)/);
          if (defaultMatch) {
            await client.query(`ALTER TABLE funds ALTER COLUMN ${column.newName} SET DEFAULT ${defaultMatch[1]}`);
          }
        }
        
        console.log(`Altered type of column ${column.newName} to ${column.newType}`);
      }
      
      changes.columnsRenamed.push(`${column.oldName} -> ${column.newName}`);
    }
  }
}

/**
 * Update indices and constraints
 */
async function updateIndicesAndConstraints(client) {
  // Drop the unique constraint on (code, entity_id) if it exists
  const uniqueConstraintExists = await constraintExists(client, 'funds', 'unique_fund_code_entity');
  
  if (uniqueConstraintExists) {
    await client.query('ALTER TABLE funds DROP CONSTRAINT unique_fund_code_entity');
    console.log('Dropped constraint unique_fund_code_entity');
    changes.constraintsModified.push('Dropped unique_fund_code_entity');
  }
  
  // Add unique index on fund_code (case-insensitive)
  const uniqueIndexExists = await indexExists(client, 'uidx_funds_fund_code_lower');
  
  if (!uniqueIndexExists) {
    await client.query(`
      CREATE UNIQUE INDEX uidx_funds_fund_code_lower
      ON funds (LOWER(fund_code))
      WHERE fund_code IS NOT NULL
    `);
    console.log('Created unique index on LOWER(fund_code)');
    changes.indicesCreated.push('uidx_funds_fund_code_lower');
  }
  
  // Create BTREE indexes if missing
  const fundNumberIndexExists = await indexExists(client, 'idx_funds_fund_number');
  
  if (!fundNumberIndexExists) {
    await client.query('CREATE INDEX idx_funds_fund_number ON funds (fund_number)');
    console.log('Created index on fund_number');
    changes.indicesCreated.push('idx_funds_fund_number');
  }
  
  const fundCodeIndexExists = await indexExists(client, 'idx_funds_fund_code');
  
  if (!fundCodeIndexExists) {
    await client.query('CREATE INDEX idx_funds_fund_code ON funds (fund_code)');
    console.log('Created index on fund_code');
    changes.indicesCreated.push('idx_funds_fund_code');
  }
}

/**
 * Remove entity_id column if it exists
 */
async function removeEntityIdIfExists(client) {
  const exists = await columnExists(client, 'funds', 'entity_id');
  
  if (exists) {
    await client.query('ALTER TABLE funds DROP COLUMN entity_id');
    console.log('Dropped column entity_id from funds table');
    changes.columnsDropped.push('entity_id');
  }
}

/**
 * Remove temporary defaults
 */
async function removeTemporaryDefaults(client) {
  const columnsWithDefaults = [
    'fund_number', 'entity_name', 'entity_code', 
    'restriction', 'budget', 'balance_sheet'
  ];
  
  for (const column of columnsWithDefaults) {
    const exists = await columnExists(client, 'funds', column);
    
    if (exists) {
      await client.query(`ALTER TABLE funds ALTER COLUMN ${column} DROP DEFAULT`);
      console.log(`Removed temporary default from ${column}`);
    }
  }
  
}

/**
 * Print a summary of changes made
 */
function printSummary() {
  console.log('\n=== MIGRATION SUMMARY ===');
  
  if (changes.columnsDropped.length > 0) {
    console.log('\nColumns dropped:');
    changes.columnsDropped.forEach(col => console.log(`  - ${col}`));
  }
  
  if (changes.columnsRenamed.length > 0) {
    console.log('\nColumns renamed:');
    changes.columnsRenamed.forEach(col => console.log(`  - ${col}`));
  }
  
  if (changes.columnsAdded.length > 0) {
    console.log('\nColumns added:');
    changes.columnsAdded.forEach(col => console.log(`  - ${col}`));
  }
  
  if (changes.constraintsModified.length > 0) {
    console.log('\nConstraints modified:');
    changes.constraintsModified.forEach(con => console.log(`  - ${con}`));
  }
  
  if (changes.indicesCreated.length > 0) {
    console.log('\nIndices created:');
    changes.indicesCreated.forEach(idx => console.log(`  - ${idx}`));
  }
  
  if (changes.errors.length > 0) {
    console.log('\nErrors encountered:');
    changes.errors.forEach(err => console.log(`  - ${err}`));
  }
  
  console.log('\n=========================');
}

// Run the migration
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
