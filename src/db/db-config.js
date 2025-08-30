// db-config.js
// Client-side configuration for database connection parameters.

// Helper function to get the database configuration.
// Implements a robust fallback chain:
// 1. Use DATABASE_URL if available (with SSL configuration from PGSSLMODE)
// 2. Otherwise build from individual env vars with sensible defaults
// 3. For username, try multiple environment variables and OS username before fallback
function getDbConfig() {
  // If DATABASE_URL is set, use it as a connection string
  if (typeof process !== 'undefined' && process.env && process.env.DATABASE_URL) {
    const config = { connectionString: process.env.DATABASE_URL };
    
    // Add SSL configuration if PGSSLMODE is set
    const sslMode = process.env.PGSSLMODE;
    if (sslMode && sslMode !== 'disable') {
      config.ssl = { 
        rejectUnauthorized: sslMode === 'verify-ca' || sslMode === 'verify-full' 
      };
    }
    
    return config;
  }
  
  // Otherwise, build config from individual parameters
  const host = process.env.PGHOST || 'localhost';
  const port = Number(process.env.PGPORT) || 5432;
  const database = process.env.PGDATABASE || 'fund_accounting_db';
  
  // Try multiple sources for username with fallback chain
  let user = process.env.PGUSER || process.env.USER || process.env.LOGNAME;
  if (!user && typeof require === 'function') {
    try {
      // Only try to use os module if we're in Node
      user = require('os').userInfo().username;
    } catch (_) {
      // Fallback if os module not available or fails
      user = 'postgres';
    }
  }
  if (!user) user = 'postgres'; // Final fallback
  
  // Build the config object
  const config = { host, port, user, database };
  
  // Only include password if defined
  const password = process.env.PGPASSWORD;
  if (password) {
    config.password = password;
  }
  
  return config;
}

// For browser environment
if (typeof window !== 'undefined') {
  window.getDbConfig = getDbConfig;
}

// For Node.js environment
if (typeof module !== 'undefined' && module.exports) {
  // For Node, compute DB_CONFIG at export time
  const DB_CONFIG = typeof process !== 'undefined' ? getDbConfig() : {};
  module.exports = { getDbConfig, DB_CONFIG };
}
