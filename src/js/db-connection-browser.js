/**
 * @file db-connection-browser.js
 * @description Browser-compatible database connection module for the Non-Profit Fund Accounting System.
 * This module is a browser-safe version of db-connection.js.
 */

// Get database configuration
function getDbConfig() {
    return {
        host: 'localhost',
        port: 5432,
        database: 'fund_accounting_db',
        user: 'postgres',
        password: 'npfa123',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000
    };
}

// Check database connection status
async function checkDbConnection() {
    try {
        // We can't directly connect to PostgreSQL from the browser due to security
        // Instead, we make a request to our API server which will check the connection
        const response = await fetch('http://localhost:3000/api/health', {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            // Always send browser cookies (session) with this request
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.connected === true;
        }
        return false;
    } catch (error) {
        console.error('Database connection check failed:', error);
        return false;
    }
}

// Log messages with timestamps
function logMsg(msg, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DB] [${type.toUpperCase()}]: ${msg}`);
}

// Flag to track if we're in fallback mode
let fallbackMode = false;

// We're in a browser environment, so expose these functions globally
window.getDbConfig = getDbConfig;
window.checkDbConnection = checkDbConnection;
window.logMsg = logMsg;

// Initialize
(async function() {
    try {
        logMsg('Checking database connection...');
        const isConnected = await checkDbConnection();
        
        if (isConnected) {
            logMsg('Database connection successful', 'success');
            fallbackMode = false;
        } else {
            logMsg('Database connection failed, using fallback mode', 'warn');
            fallbackMode = true;
        }
        
        // Make the fallback mode accessible
        window.fallbackMode = fallbackMode;
        
        // Update any DB status indicators in the UI
        const dbStatusIndicator = document.getElementById('db-status-indicator');
        if (dbStatusIndicator) {
            if (isConnected) {
                dbStatusIndicator.textContent = 'DB Connected';
                dbStatusIndicator.className = 'db-status-indicator connected';
            } else {
                dbStatusIndicator.textContent = 'DB Offline (Local Mode)';
                dbStatusIndicator.className = 'db-status-indicator offline';
            }
        }
    } catch (error) {
        logMsg(`Error during initialization: ${error.message}`, 'error');
        fallbackMode = true;
        window.fallbackMode = fallbackMode;
    }
})();
