/**
 * db-connection-browser.js
 * Browser-compatible version of db-connection module
 * This provides a fallback implementation for the browser
 */

// Utility logging function
function logMsg(message, type = 'info') {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [DB_MODULE] [${type.toUpperCase()}]: ${message}`);
    
    if (typeof window !== 'undefined' && window.logOutputDiv) {
        const p = document.createElement('p');
        p.className = `log-entry log-${type}`;
        p.textContent = `[${timestamp}] [DB_MODULE] [${type.toUpperCase()}]: ${message}`;
        window.logOutputDiv.appendChild(p);
        window.logOutputDiv.scrollTop = window.logOutputDiv.scrollHeight;
    }
}

// Create a mock database connection object for the browser
const dbConnection = {
    _isConnected: false,
    _fallbackMode: true,
    
    testConnection: async function() {
        logMsg("Testing database connection from browser...", "info");
        
        try {
            if (typeof db !== 'undefined' && typeof db.connect === 'function') {
                return await db.connect();
            }
            
            // Fallback implementation if db.connect isn't available
            const res = await fetch('http://localhost:3000/api/health');
            if (res.ok) {
                this._isConnected = true;
                this._fallbackMode = false;
                logMsg("Database connectivity test successful", "success");
                return true;
            } else {
                throw new Error(`HTTP error ${res.status}`);
            }
        } catch (err) {
            this._isConnected = false;
            this._fallbackMode = true;
            logMsg(`Database connectivity test failed: ${err.message}`, "error");
            return false;
        }
    },
    
    query: async function(text, params) {
        logMsg(`Browser cannot execute direct SQL queries: ${text}`, "warn");
        throw new Error("Direct SQL queries are not supported in browser environment");
    },
    
    // Mock implementation of helper functions
    helpers: {
        getAllActiveEntities: async function() {
            logMsg("getAllActiveEntities called in browser context", "info");
            if (typeof db !== 'undefined' && typeof db.fetchEntities === 'function') {
                return db.fetchEntities();
            }
            return [];
        },
        
        getAccountById: async function(id) {
            logMsg(`getAccountById(${id}) called in browser context`, "info");
            return null;
        }
    }
};

// For browser environment
if (typeof window !== 'undefined') {
    window.dbConnection = dbConnection;
    window.logMsg = logMsg;
    logMsg("Database connection browser module loaded", "info");
}

// For Node.js environment (won't actually be used in browser)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { dbConnection, logMsg };
}
