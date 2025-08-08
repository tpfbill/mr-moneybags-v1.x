#!/usr/bin/env node
/**
 * scripts/debug-sessions.js
 * 
 * This script helps troubleshoot session persistence issues on Ubuntu.
 * It performs various checks and tests related to the session management
 * to identify why sessions aren't persisting after login.
 * 
 * Usage:
 *   node scripts/debug-sessions.js
 * 
 * Requirements:
 *   - .env file with PostgreSQL connection parameters
 *   - pg module installed
 */

// Load environment variables from .env file
require('dotenv').config();

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Create a connection pool using environment variables
const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: process.env.PGPORT || 5432,
  database: process.env.PGDATABASE || 'fund_accounting_db',
  user: process.env.PGUSER || 'npfadmin',
  password: process.env.PGPASSWORD || 'npfa123'
});

// Constants
const SESSION_TABLE = 'user_sessions';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ChangeMeInProduction';

// Console output formatting
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Logging functions
const log = {
  info: (msg) => console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  section: (title) => console.log(`\n${colors.blue}=== ${title} ===${colors.reset}\n`),
  json: (obj) => console.log(util.inspect(obj, { colors: true, depth: null }))
};

/**
 * Check if the session table exists
 */
async function checkSessionTable() {
  log.section('Checking Session Table');
  
  try {
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = $1
      )
    `, [SESSION_TABLE]);
    
    const tableExists = result.rows[0].exists;
    
    if (tableExists) {
      log.success(`Table '${SESSION_TABLE}' exists in the database`);
      
      // Check table structure
      const columns = await pool.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [SESSION_TABLE]);
      
      log.info('Table structure:');
      columns.rows.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`);
      });
      
      // Check indexes
      const indexes = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = $1
      `, [SESSION_TABLE]);
      
      log.info('Table indexes:');
      if (indexes.rows.length === 0) {
        log.warn('No indexes found on session table! This could cause performance issues.');
      } else {
        indexes.rows.forEach(idx => {
          console.log(`  - ${idx.indexname}: ${idx.indexdef}`);
        });
      }
      
      return true;
    } else {
      log.error(`Table '${SESSION_TABLE}' does not exist in the database!`);
      log.info('This is likely why sessions are not persisting.');
      log.info('The table should be created automatically by connect-pg-simple.');
      log.info('Check that createTableIfMissing: true is set in the session configuration.');
      
      return false;
    }
  } catch (err) {
    log.error(`Error checking session table: ${err.message}`);
    return false;
  }
}

/**
 * Show current sessions in the database
 */
async function showCurrentSessions() {
  log.section('Current Sessions');
  
  try {
    const result = await pool.query(`
      SELECT sid, sess, expire
      FROM ${SESSION_TABLE}
      ORDER BY expire DESC
      LIMIT 10
    `);
    
    if (result.rows.length === 0) {
      log.warn('No sessions found in the database');
      log.info('This could be normal if no one has logged in yet or all sessions have expired.');
    } else {
      log.success(`Found ${result.rows.length} sessions`);
      
      result.rows.forEach((session, i) => {
        console.log(`\nSession #${i+1}:`);
        console.log(`  SID: ${session.sid}`);
        console.log(`  Expires: ${session.expire}`);
        console.log('  Data:');
        
        try {
          const sessionData = typeof session.sess === 'string' 
            ? JSON.parse(session.sess) 
            : session.sess;
          
          log.json(sessionData);
        } catch (e) {
          console.log(`  Error parsing session data: ${e.message}`);
          console.log(`  Raw data: ${session.sess}`);
        }
      });
    }
  } catch (err) {
    log.error(`Error retrieving sessions: ${err.message}`);
  }
}

/**
 * Test session creation
 */
async function testSessionCreation() {
  log.section('Testing Session Creation');
  
  try {
    const testSid = `test-session-${Date.now()}`;
    const testData = {
      userId: '00000000-0000-0000-0000-000000000000',
      created: new Date().toISOString(),
      test: true
    };
    
    const expireDate = new Date();
    expireDate.setHours(expireDate.getHours() + 24); // 24 hour expiry
    
    log.info('Attempting to insert a test session...');
    
    const result = await pool.query(`
      INSERT INTO ${SESSION_TABLE} (sid, sess, expire)
      VALUES ($1, $2, $3)
      RETURNING sid
    `, [testSid, JSON.stringify(testData), expireDate]);
    
    if (result.rows.length > 0) {
      log.success('Test session created successfully');
      
      // Try to retrieve it
      const retrieved = await pool.query(`
        SELECT * FROM ${SESSION_TABLE} WHERE sid = $1
      `, [testSid]);
      
      if (retrieved.rows.length > 0) {
        log.success('Test session retrieved successfully');
        
        // Clean up
        await pool.query(`
          DELETE FROM ${SESSION_TABLE} WHERE sid = $1
        `, [testSid]);
        
        log.info('Test session cleaned up');
      } else {
        log.error('Failed to retrieve the test session!');
      }
    } else {
      log.error('Failed to create test session!');
    }
  } catch (err) {
    log.error(`Error testing session creation: ${err.message}`);
    log.info('This suggests there might be permission issues or database constraints preventing session creation.');
  }
}

/**
 * Check database permissions
 */
async function checkDatabasePermissions() {
  log.section('Database Permissions');
  
  try {
    // Check if the current user has the necessary permissions
    const user = process.env.PGUSER || 'npfadmin';
    
    log.info(`Checking permissions for user: ${user}`);
    
    const tablePerms = await pool.query(`
      SELECT grantee, privilege_type
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
      AND table_name = $1
      AND grantee = $2
    `, [SESSION_TABLE, user]);
    
    if (tablePerms.rows.length === 0) {
      log.error(`User '${user}' has no explicit permissions on the ${SESSION_TABLE} table!`);
      log.info('This could prevent session creation and persistence.');
      
      // Check if the user has permissions through a role
      const rolePerms = await pool.query(`
        SELECT r.rolname, p.privilege_type
        FROM pg_roles r
        JOIN information_schema.table_privileges p ON p.grantee = r.rolname
        WHERE p.table_schema = 'public'
        AND p.table_name = $1
        AND r.rolname IN (
          SELECT rolname FROM pg_roles
          WHERE pg_has_role('${user}', oid, 'member')
        )
      `, [SESSION_TABLE]);
      
      if (rolePerms.rows.length > 0) {
        log.info('User has permissions through roles:');
        rolePerms.rows.forEach(perm => {
          console.log(`  - ${perm.rolname}: ${perm.privilege_type}`);
        });
      } else {
        log.warn('User does not have permissions through roles either.');
        log.info('Consider granting the necessary permissions:');
        log.info(`GRANT ALL ON ${SESSION_TABLE} TO ${user};`);
      }
    } else {
      log.success(`User '${user}' has the following permissions on ${SESSION_TABLE}:`);
      tablePerms.rows.forEach(perm => {
        console.log(`  - ${perm.privilege_type}`);
      });
      
      const requiredPerms = ['INSERT', 'SELECT', 'UPDATE', 'DELETE'];
      const missingPerms = requiredPerms.filter(p => 
        !tablePerms.rows.some(perm => perm.privilege_type.toUpperCase() === p)
      );
      
      if (missingPerms.length > 0) {
        log.warn(`Missing required permissions: ${missingPerms.join(', ')}`);
        log.info('This could prevent proper session management.');
      } else {
        log.success('User has all required permissions for session management');
      }
    }
  } catch (err) {
    log.error(`Error checking permissions: ${err.message}`);
  }
}

/**
 * Check server configuration
 */
async function checkServerConfig() {
  log.section('Server Configuration');
  
  try {
    const serverFile = path.join(__dirname, '..', 'server-modular.js');
    
    if (!fs.existsSync(serverFile)) {
      log.error(`Server file not found: ${serverFile}`);
      return;
    }
    
    const serverContent = fs.readFileSync(serverFile, 'utf8');
    
    // Check session configuration
    if (serverContent.includes('session(')) {
      log.success('Found session configuration in server file');
      
      // Check for correct table name
      if (serverContent.includes(`tableName: '${SESSION_TABLE}'`)) {
        log.success(`Server is configured to use the correct table name: ${SESSION_TABLE}`);
      } else {
        const tableNameMatch = serverContent.match(/tableName:\s*['"]([^'"]+)['"]/);
        if (tableNameMatch) {
          const configuredTable = tableNameMatch[1];
          log.error(`Server is configured to use a different table name: ${configuredTable}`);
          log.info(`This doesn't match the table we're checking: ${SESSION_TABLE}`);
        } else {
          log.warn('Could not determine the configured table name');
        }
      }
      
      // Check createTableIfMissing
      if (serverContent.includes('createTableIfMissing: true')) {
        log.success('createTableIfMissing is set to true');
      } else {
        log.warn('createTableIfMissing might not be set to true');
        log.info('This could prevent the session table from being created automatically');
      }
      
      // Check cookie settings
      if (serverContent.includes('cookie: {')) {
        log.success('Found cookie configuration');
        
        // Check secure setting
        if (serverContent.includes('secure: process.env.NODE_ENV === \'production\'')) {
          log.info('Cookie secure setting is based on NODE_ENV');
          log.info(`Current NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
          
          if (process.env.NODE_ENV === 'production') {
            log.warn('secure=true in production might cause issues if not using HTTPS');
          }
        }
        
        // Check sameSite setting
        const sameSiteMatch = serverContent.match(/sameSite:\s*['"]([^'"]+)['"]/);
        if (sameSiteMatch) {
          log.info(`sameSite is set to: ${sameSiteMatch[1]}`);
          
          if (sameSiteMatch[1] === 'none') {
            log.warn('sameSite=none requires secure=true, which might cause issues');
          }
        }
      }
    } else {
      log.error('Could not find session configuration in server file');
    }
  } catch (err) {
    log.error(`Error checking server configuration: ${err.message}`);
  }
}

/**
 * Check for potential network/CORS issues
 */
async function checkNetworkIssues() {
  log.section('Network & CORS Configuration');
  
  try {
    const serverFile = path.join(__dirname, '..', 'server-modular.js');
    
    if (!fs.existsSync(serverFile)) {
      log.error(`Server file not found: ${serverFile}`);
      return;
    }
    
    const serverContent = fs.readFileSync(serverFile, 'utf8');
    
    // Check CORS configuration
    if (serverContent.includes('cors(')) {
      log.success('Found CORS configuration in server file');
      
      // Check credentials setting
      if (serverContent.includes('credentials: true')) {
        log.success('CORS is configured with credentials: true');
      } else {
        log.error('CORS credentials setting is not explicitly set to true');
        log.info('This will prevent cookies from being sent in cross-origin requests');
        log.info('Add credentials: true to the CORS configuration');
      }
      
      // Check origin setting
      if (serverContent.includes('origin:')) {
        log.success('Found CORS origin configuration');
        
        // Check for wildcard origin
        if (serverContent.includes('origin: \'*\'') || serverContent.includes('origin: "*"')) {
          log.error('CORS is configured with wildcard origin (*)');
          log.info('Wildcard origin is incompatible with credentials: true');
          log.info('Specify explicit origins instead of using *');
        }
      }
    } else {
      log.warn('Could not find CORS configuration in server file');
    }
    
    // Check for port differences
    log.info('Checking for potential port mismatches...');
    log.info(`API server port: ${process.env.PORT || '3000 (default)'}`);
    log.info('Frontend typically served on port 8080');
    
    if (process.env.PORT && process.env.PORT !== '3000') {
      log.warn(`Non-standard API port: ${process.env.PORT}`);
      log.info('Ensure frontend is configured to use this port for API calls');
    }
  } catch (err) {
    log.error(`Error checking network configuration: ${err.message}`);
  }
}

/**
 * Check for active Node.js processes
 */
async function checkProcesses() {
  log.section('Active Node.js Processes');
  
  try {
    const { stdout } = await exec('ps aux | grep node | grep -v grep');
    
    if (stdout.trim()) {
      log.info('Active Node.js processes:');
      console.log(stdout);
      
      // Check for multiple server instances
      const serverProcesses = stdout.split('\n').filter(line => 
        line.includes('server-modular.js') || line.includes('npm start')
      );
      
      if (serverProcesses.length > 1) {
        log.warn('Multiple server instances detected!');
        log.info('This could cause session conflicts or other issues');
        log.info('Consider terminating extra instances:');
        serverProcesses.forEach(proc => {
          const pid = proc.split(/\s+/)[1];
          if (pid) {
            console.log(`  kill ${pid}  # ${proc.substring(0, 80)}...`);
          }
        });
      }
    } else {
      log.warn('No active Node.js processes found');
    }
  } catch (err) {
    // This is expected if no processes are found
    log.info('No active Node.js processes found');
  }
}

/**
 * Test frontend fetch with credentials
 */
function checkFrontendCode() {
  log.section('Frontend Fetch Configuration');
  
  try {
    // Check a few key JavaScript files
    const filesToCheck = [
      path.join(__dirname, '..', 'src', 'js', 'app.js'),
      path.join(__dirname, '..', 'login.html')
    ];
    
    let credentialsFound = false;
    
    filesToCheck.forEach(file => {
      if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        
        if (content.includes('fetch(')) {
          log.info(`Found fetch calls in ${path.basename(file)}`);
          
          if (content.includes('credentials: \'include\'')) {
            log.success(`${path.basename(file)} includes fetch with credentials: 'include'`);
            credentialsFound = true;
          } else if (content.includes('credentials:')) {
            log.warn(`${path.basename(file)} has credentials setting but might not be 'include'`);
          } else {
            log.error(`${path.basename(file)} has fetch calls WITHOUT credentials: 'include'`);
            log.info('This will prevent cookies from being sent with requests');
          }
        }
      }
    });
    
    if (!credentialsFound) {
      log.warn('Could not find fetch calls with credentials: \'include\'');
      log.info('Ensure all API calls include { credentials: \'include\' }');
    }
  } catch (err) {
    log.error(`Error checking frontend code: ${err.message}`);
  }
}

/**
 * Check for session-related errors in logs
 */
async function checkLogs() {
  log.section('Recent Error Logs');
  
  try {
    // Check if there's a log file
    const logFile = path.join(__dirname, '..', 'logs', 'error.log');
    
    if (fs.existsSync(logFile)) {
      // Get the last 20 lines
      const { stdout } = await exec(`tail -n 20 ${logFile}`);
      
      if (stdout.trim()) {
        log.info('Recent errors from log file:');
        console.log(stdout);
      } else {
        log.info('No recent errors found in log file');
      }
    } else {
      log.info('No error log file found');
      
      // Try to get recent console output
      try {
        const { stdout } = await exec('journalctl -u node-app -n 20 2>/dev/null || echo "No systemd logs found"');
        
        if (stdout && !stdout.includes('No systemd logs found')) {
          log.info('Recent systemd logs:');
          console.log(stdout);
        }
      } catch (err) {
        // Ignore errors from journalctl
      }
    }
  } catch (err) {
    log.error(`Error checking logs: ${err.message}`);
  }
}

/**
 * Main function
 */
async function main() {
  log.section('Session Debugging Tool');
  log.info(`Database: ${process.env.PGDATABASE || 'fund_accounting_db'}`);
  log.info(`User: ${process.env.PGUSER || 'npfadmin'}`);
  log.info(`Session table: ${SESSION_TABLE}`);
  log.info(`Node.js version: ${process.version}`);
  log.info(`Platform: ${process.platform}`);
  
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    log.success('Database connection successful');
    
    // Run all checks
    const tableExists = await checkSessionTable();
    
    if (tableExists) {
      await showCurrentSessions();
      await testSessionCreation();
    }
    
    await checkDatabasePermissions();
    await checkServerConfig();
    await checkNetworkIssues();
    await checkProcesses();
    checkFrontendCode();
    await checkLogs();
    
    log.section('Summary & Recommendations');
    
    if (!tableExists) {
      log.error('The session table does not exist - this is the primary issue');
      log.info('Recommendations:');
      log.info('1. Ensure createTableIfMissing: true is in the session configuration');
      log.info('2. Check that the database user has CREATE TABLE permissions');
      log.info('3. Manually create the table using the schema from connect-pg-simple');
    } else {
      log.info('Potential issues to check:');
      log.info('1. Ensure all fetch calls include { credentials: \'include\' }');
      log.info('2. Check CORS configuration allows credentials with specific origins');
      log.info('3. Verify session cookie settings (httpOnly, sameSite, secure)');
      log.info('4. Confirm session secret is consistent across server restarts');
      log.info('5. Check for database permission issues');
    }
    
    log.info('\nFor more detailed debugging:');
    log.info('1. Add console.log statements to track session flow');
    log.info('2. Use browser DevTools to inspect cookies and network requests');
    log.info('3. Check server logs for any errors during session operations');
  } catch (err) {
    log.error(`Fatal error: ${err.message}`);
    log.info('This suggests there might be fundamental connection issues');
  } finally {
    // Close the database connection pool
    await pool.end();
    log.info('Database connection closed');
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
