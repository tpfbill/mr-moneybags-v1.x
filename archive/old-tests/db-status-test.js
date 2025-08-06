/**
 * @file db-status-test.js
 * @description Client-side script for the db-status.html page.
 * This script provides functionality to test the backend API and the frontend db.js module.
 */

document.addEventListener('DOMContentLoaded', () => {
    const logOutput = document.getElementById('log-output');
    const dataDisplay = document.getElementById('data-display');
    const statusPanel = document.getElementById('status-panel');
    const statusText = document.getElementById('status-text');
    const apiStatusEl = document.getElementById('api-status');
    const apiResponseEl = document.getElementById('api-response');

    /**
     * Logs a message to the on-screen log container.
     * @param {string} message - The message to log.
     * @param {'info'|'success'|'warning'|'error'} [type='info'] - The log level for styling.
     */
    function log(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        const timestamp = new Date().toLocaleTimeString();
        entry.textContent = `[${timestamp}] [${type.toUpperCase()}]: ${message}`;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    }

    /**
     * Updates the main status panel to reflect the current connection mode.
     * @param {boolean} isConnected - True if connected to the live database.
     */
    function updateStatus(isConnected) {
        if (!statusPanel || !statusText) return;
        statusPanel.className = isConnected ? 'status status-live' : 'status status-fallback';
        statusPanel.querySelector('.status-icon').innerHTML = isConnected ? '✓' : '⚠';
        statusText.textContent = isConnected
            ? 'CONNECTED TO LIVE DATABASE: Data changes will be saved to PostgreSQL.'
            : 'USING LOCAL FALLBACK MODE: Changes will NOT be saved persistently!';
        log(
            isConnected ? 'Successfully connected to the PostgreSQL database' : 'Failed to connect to database, switched to fallback mode',
            isConnected ? 'success' : 'warning'
        );
    }

    /**
     * Displays fetched data in a formatted way in the data preview area.
     * @param {object|Array} data - The data to display.
     * @param {string} source - A string describing the source of the data (e.g., "Entities").
     */
    function displayData(data, source) {
        if (!dataDisplay) return;
        const isLive = window.db && window.db._dbConnected;
        dataDisplay.innerHTML = `
            <h3>Data from ${source}</h3>
            <p>Data mode: <strong>${isLive ? 'LIVE DATABASE' : 'LOCAL FALLBACK'}</strong></p>
            <p>Item count: ${Array.isArray(data) ? data.length : 'N/A'}</p>
            <pre>${JSON.stringify(data, null, 2)}</pre>
        `;
    }

    // --- Server API Test Listeners ---

    document.getElementById('btn-health-check').addEventListener('click', async () => {
        log('Testing API Health Check...');
        try {
            const response = await fetch('http://localhost:3000/api/health');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
            log(`Success: ${JSON.stringify(data)}`, 'success');
        } catch (err) {
            log(`Error: ${err.message}. Is the server running? (npm run server)`, 'error');
        }
    });

    document.getElementById('btn-init-db').addEventListener('click', async () => {
        if (!confirm('Are you sure you want to re-initialize the database? This will delete all existing data.')) {
            log('Database initialization cancelled by user.', 'warn');
            return;
        }
        log('Initializing database via API...');
        try {
            const response = await fetch('http://localhost:3000/api/init-db', { method: 'POST' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
            log(`Success: ${data.message}`, 'success');
        } catch (err) {
            log(`Error: ${err.message}. Check server logs and DB credentials.`, 'error');
        }
    });

    document.querySelectorAll('button[data-endpoint]').forEach(button => {
        button.addEventListener('click', async () => {
            const endpoint = button.dataset.endpoint;
            log(`Testing API endpoint: ${endpoint}...`);
            if (!apiStatusEl || !apiResponseEl) return;

            apiStatusEl.textContent = `Testing ${endpoint}...`;
            apiStatusEl.className = 'status info';
            apiResponseEl.textContent = 'Waiting for response...';

            try {
                const response = await fetch(`http://localhost:3000${endpoint}`);
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || `HTTP Error ${response.status}`);
                
                apiStatusEl.textContent = `${endpoint}: Success (${response.status})`;
                apiStatusEl.className = 'status success';
                apiResponseEl.textContent = JSON.stringify(data, null, 2);
                log(`API call to ${endpoint} successful.`, 'success');
            } catch (err) {
                apiStatusEl.textContent = `${endpoint}: Failed`;
                apiStatusEl.className = 'status error';
                apiResponseEl.textContent = err.message;
                log(`API call to ${endpoint} failed: ${err.message}`, 'error');
            }
        });
    });

    // --- Frontend DB Module Test Listeners ---

    document.getElementById('btn-connect-db-module').addEventListener('click', async () => {
        log('Testing db.connect(). This checks API health and sets the mode.');
        if (typeof db === 'undefined' || typeof db.connect !== 'function') {
            log('Error: db object or db.connect() function not found. Make sure src/js/db.js is loaded correctly.', 'error');
            return;
        }
        try {
            const isConnected = await db.connect();
            updateStatus(isConnected);
        } catch (err) {
            log(`An unexpected error occurred during db.connect(): ${err.message}`, 'error');
            updateStatus(false);
        }
    });

    document.querySelectorAll('#data-test-buttons button').forEach(button => {
        button.addEventListener('click', async () => {
            const dataType = button.id.replace('btn-fetch-', '');
            const fetchFunction = `fetch${dataType.charAt(0).toUpperCase() + dataType.slice(1)}`;
            
            log(`Fetching ${dataType} via db.${fetchFunction}()...`);
            if (typeof db === 'undefined' || typeof db[fetchFunction] !== 'function') {
                log(`Error: db.${fetchFunction}() not found.`, 'error');
                return;
            }

            try {
                const data = await db[fetchFunction]();
                log(`Success: Received ${data.length} ${dataType} from the module.`, 'success');
                displayData(data, dataType);
            } catch (err) {
                log(`Error during db.${fetchFunction}(): ${err.message}`, 'error');
            }
        });
    });

    // --- Initial Log Message ---
    log('Page loaded. Click "Check Connection" to test database connectivity.');
});
