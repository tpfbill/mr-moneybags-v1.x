/**
 * @file db.js
 * @description Database module for the Non-Profit Fund Accounting System.
 * This module handles all communication with the backend API. It provides
 * a robust fallback mechanism to use local data when the database is unreachable.
 */

(function(window) {
    'use strict';

    // --- Fallback Data -----------------------------------------------------------
    // This data is used as a local substitute when the backend API is offline.
    // It allows the UI to remain interactive and demonstrate functionality.

    const _fallback = {
        entities: [
            { id: 'ent_local_1', code: 'MAIN_ORG', name: 'Community Wellness Foundation', status: 'Active', parentEntityId: null, fiscalYearStart: '01-01', baseCurrency: 'USD', isConsolidated: false },
            { id: 'ent_local_2', code: 'YOUTH_CTR', name: 'Youth Center Program', status: 'Active', parentEntityId: 'ent_local_1', fiscalYearStart: '01-01', baseCurrency: 'USD', isConsolidated: false }
        ],
        accounts: [
            { id: 'acc_local_1', entityId: 'ent_local_1', code: '1010', name: 'Operating Bank Account', type: 'Asset', balance: 150000, status: 'Active' },
            { id: 'acc_local_2', entityId: 'ent_local_1', code: '4010', name: 'Grant Revenue', type: 'Revenue', balance: 300000, status: 'Active' },
            { id: 'acc_local_3', entityId: 'ent_local_2', code: '1010', name: 'Youth Center Cash', type: 'Asset', balance: 15000, status: 'Active' },
            { id: 'acc_local_4', entityId: 'ent_local_2', code: '5010', name: 'Program Supplies', type: 'Expense', balance: 5000, status: 'Active' }
        ],
        funds: [
            { id: 'fund_local_1', entityId: 'ent_local_1', code: 'GEN', name: 'General Fund', type: 'Unrestricted', balance: 100000, status: 'Active' },
            { id: 'fund_local_2', entityId: 'ent_local_1', code: 'BLD', name: 'Building Fund', type: 'Restricted', balance: 50000, status: 'Active' },
            { id: 'fund_local_3', entityId: 'ent_local_2', code: 'YTH', name: 'Youth Program Fund', type: 'Restricted', balance: 20000, status: 'Active' }
        ],
        journalEntries: [
            { 
                id: 'je_local_1', 
                entityId: 'ent_local_1', 
                date: '2025-06-15', 
                reference: 'JE-LCL-001', 
                description: 'Sample Grant Received', 
                totalAmount: 25000, 
                status: 'Posted', 
                createdBy: 'LocalAdmin',
                lines: [
                    { accountId: 'acc_local_1', fundId: 'fund_local_1', debit: 25000, credit: 0, description: 'Cash received' },
                    { accountId: 'acc_local_2', fundId: 'fund_local_1', debit: 0, credit: 25000, description: 'Revenue recorded' }
                ]
            }
        ],
        users: [
            { id: 'user1', name: 'Admin User', email: 'admin@example.com', role: 'Administrator', status: 'Active' },
            { id: 'user2', name: 'Finance Manager User', email: 'fm@example.com', role: 'Finance Manager', status: 'Active' }
        ],
        organizationSettings: {
            name: 'Default Non-Profit Org', 
            taxId: 'XX-XXXXXXX', 
            phone: '(555) 123-4567', 
            email: 'info@default.org',
            addressStreet: '123 Charity Lane', 
            addressCity: 'Hopeville', 
            addressState: 'HS', 
            addressZip: '90210',
            defaultCurrency: 'USD', 
            globalFiscalYearStart: '01-01'
        },
        customReportDefinitions: []
    };

    // API configuration
    let _config = {
        apiBaseUrl: 'http://localhost:3000',
        apiTimeout: 10000
    };

    // Connection state
    let _dbConnected = false;
    let _connectionAttempted = false;

    /**
     * Helper function to simulate a delay (useful for fallback mode)
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise} Promise that resolves after the delay
     */
    function _simulateDelay(ms = 100) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Makes a fetch request to the API with timeout
     * @param {string} url - The URL to fetch
     * @param {object} options - Fetch options
     * @returns {Promise} The fetch promise
     */
    async function _fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), _config.apiTimeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                // Always include credentials so that session cookies are sent
                // with every API request, unless the caller explicitly overrides
                // this value in the options they pass in.
                credentials: options.credentials || 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeout);
            return response;
        } catch (error) {
            clearTimeout(timeout);
            throw error;
        }
    }

    /**
     * Makes a GET request to the API
     * @param {string} endpoint - API endpoint (without base URL)
     * @returns {Promise} Promise resolving to the response data
     */
    async function _apiGet(endpoint) {
        const url = `${_config.apiBaseUrl}${endpoint}`;
        
        try {
            const response = await _fetchWithTimeout(url);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`DB: API GET failed for ${endpoint}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Makes a POST request to the API
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {object} data - Data to send
     * @returns {Promise} Promise resolving to the response data
     */
    async function _apiPost(endpoint, data) {
        const url = `${_config.apiBaseUrl}${endpoint}`;
        
        try {
            const response = await _fetchWithTimeout(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`DB: API POST failed for ${endpoint}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Makes a PUT request to the API
     * @param {string} endpoint - API endpoint (without base URL)
     * @param {object} data - Data to send
     * @returns {Promise} Promise resolving to the response data
     */
    async function _apiPut(endpoint, data) {
        const url = `${_config.apiBaseUrl}${endpoint}`;
        
        try {
            const response = await _fetchWithTimeout(url, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`DB: API PUT failed for ${endpoint}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Makes a DELETE request to the API
     * @param {string} endpoint - API endpoint (without base URL)
     * @returns {Promise} Promise resolving to the response data
     */
    async function _apiDelete(endpoint) {
        const url = `${_config.apiBaseUrl}${endpoint}`;
        
        try {
            const response = await _fetchWithTimeout(url, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`DB: API DELETE failed for ${endpoint}: ${error.message}`);
            throw error;
        }
    }

    // --- Public API ---

    const db = {
        /**
         * Attempts to connect to the database
         * @returns {Promise<boolean>} Promise that resolves to true if connection successful
         */
        async connect() {
            console.log('DB: Attempting to connect to backend API...');
            _connectionAttempted = true;
            
            try {
                const res = await _fetchWithTimeout(`${_config.apiBaseUrl}/api/health`);
                if (res.ok) {
                    _dbConnected = true;
                    console.log('DB: Connected to backend API successfully');
                    return true;
                } else {
                    throw new Error(`Health check failed: ${res.status}`);
                }
            } catch (err) {
                console.warn(`DB: Connection to backend failed - ${err.message}`);
                _dbConnected = false;
                return false;
            }
        },
        
        /**
         * Checks if the database is connected
         * @returns {boolean} Connection status
         */
        isConnected() {
            return _dbConnected;
        },
        
        /**
         * Checks if a connection attempt has been made
         * @returns {boolean} Whether connect() has been called
         */
        hasAttemptedConnection() {
            return _connectionAttempted;
        },
        
        /**
         * Sets the API configuration
         * @param {object} config - Configuration object
         */
        setConfig(config = {}) {
            _config = { ..._config, ...config };
        },
        
        /**
         * Gets the current configuration
         * @returns {object} Configuration object
         */
        getConfig() {
            return { ..._config };
        },
        
        /**
         * Fetches entities from API or fallback
         * @returns {Promise<Array>} Array of entities
         */
        async fetchEntities() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/entities');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching entities - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback entities data');
            await _simulateDelay();
            return [..._fallback.entities];
        },
        
        /**
         * Saves an entity (create or update)
         * @param {object} entityData - Entity data to save
         * @returns {Promise<object>} Saved entity
         */
        async saveEntity(entityData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (entityData.id) {
                        return await _apiPut(`/api/entities/${entityData.id}`, entityData);
                    } else {
                        return await _apiPost('/api/entities', entityData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving entity - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveEntity');
            await _simulateDelay();
            
            // In fallback mode, simulate save by updating the local array
            if (entityData.id) {
                // Update existing entity
                const index = _fallback.entities.findIndex(e => e.id === entityData.id);
                if (index !== -1) {
                    _fallback.entities[index] = { ..._fallback.entities[index], ...entityData };
                    return _fallback.entities[index];
                }
            }
            
            // Create new entity
            const newEntity = {
                ...entityData,
                id: entityData.id || `ent_local_${_fallback.entities.length + 1}`
            };
            _fallback.entities.push(newEntity);
            return newEntity;
        },

        /**
         * Deletes an entity and all directly related fallback objects.
         * @param {string} entityId - Entity ID to delete
         * @returns {Promise<boolean>} Success status
         */
        async deleteEntity(entityId) {
            if (!_connectionAttempted) await this.connect();

            /* ---------- Live API path ---------- */
            if (_dbConnected) {
                try {
                    await _apiDelete(`/api/entities/${entityId}`);
                    return true;
                } catch (err) {
                    console.warn(`DB: Error deleting entity - ${err.message}`);
                    _dbConnected = false;
                }
            }

            /* ---------- Fallback path ---------- */
            console.log('DB: Using fallback for deleteEntity');
            await _simulateDelay();

            const idx = _fallback.entities.findIndex(e => e.id === entityId);
            if (idx === -1) return false;   // entity not found

            // Remove the entity itself
            _fallback.entities.splice(idx, 1);

            // Cascade-delete directly related data in fallback collections
            _fallback.accounts        = _fallback.accounts
                                          .filter(a  => a.entityId   !== entityId);
            _fallback.funds           = _fallback.funds
                                          .filter(f  => f.entityId   !== entityId);
            _fallback.journalEntries  = _fallback.journalEntries
                                          .filter(je => je.entityId  !== entityId);

            return true;
        },
        
        /**
         * Fetches accounts from API or fallback
         * @returns {Promise<Array>} Array of accounts
         */
        async fetchAccounts() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/accounts');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching accounts - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback accounts data');
            await _simulateDelay();
            return [..._fallback.accounts];
        },
        
        /**
         * Saves an account (create or update)
         * @param {object} accountData - Account data to save
         * @returns {Promise<object>} Saved account
         */
        async saveAccount(accountData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (accountData.id) {
                        return await _apiPut(`/api/accounts/${accountData.id}`, accountData);
                    } else {
                        return await _apiPost('/api/accounts', accountData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving account - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveAccount');
            await _simulateDelay();
            
            if (accountData.id) {
                const index = _fallback.accounts.findIndex(a => a.id === accountData.id);
                if (index !== -1) {
                    _fallback.accounts[index] = { ..._fallback.accounts[index], ...accountData };
                    return _fallback.accounts[index];
                }
            }
            
            const newAccount = {
                ...accountData,
                id: accountData.id || `acc_local_${_fallback.accounts.length + 1}`
            };
            _fallback.accounts.push(newAccount);
            return newAccount;
        },
        
        /**
         * Fetches funds from API or fallback
         * @returns {Promise<Array>} Array of funds
         */
        async fetchFunds() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/funds');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching funds - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback funds data');
            await _simulateDelay();
            return [..._fallback.funds];
        },
        
        /**
         * Saves a fund (create or update)
         * @param {object} fundData - Fund data to save
         * @returns {Promise<object>} Saved fund
         */
        async saveFund(fundData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (fundData.id) {
                        return await _apiPut(`/api/funds/${fundData.id}`, fundData);
                    } else {
                        return await _apiPost('/api/funds', fundData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving fund - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveFund');
            await _simulateDelay();
            
            if (fundData.id) {
                const index = _fallback.funds.findIndex(f => f.id === fundData.id);
                if (index !== -1) {
                    _fallback.funds[index] = { ..._fallback.funds[index], ...fundData };
                    return _fallback.funds[index];
                }
            }
            
            const newFund = {
                ...fundData,
                id: fundData.id || `fund_local_${_fallback.funds.length + 1}`
            };
            _fallback.funds.push(newFund);
            return newFund;
        },
        
        /**
         * Fetches journal entries from API or fallback
         * @returns {Promise<Array>} Array of journal entries
         */
        async fetchJournalEntries() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/journal-entries');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching journal entries - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback journal entries data');
            await _simulateDelay();
            return [..._fallback.journalEntries];
        },
        
        /**
         * Saves a journal entry (create or update)
         * @param {object} jeData - Journal entry data to save
         * @returns {Promise<object>} Saved journal entry
         */
        async saveJournalEntry(jeData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (jeData.id) {
                        return await _apiPut(`/api/journal-entries/${jeData.id}`, jeData);
                    } else {
                        return await _apiPost('/api/journal-entries', jeData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving journal entry - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveJournalEntry');
            await _simulateDelay();
            
            if (jeData.id) {
                const index = _fallback.journalEntries.findIndex(je => je.id === jeData.id);
                if (index !== -1) {
                    _fallback.journalEntries[index] = { ..._fallback.journalEntries[index], ...jeData };
                    return _fallback.journalEntries[index];
                }
            }
            
            const newJE = {
                ...jeData,
                id: jeData.id || `je_local_${_fallback.journalEntries.length + 1}`
            };
            _fallback.journalEntries.push(newJE);
            return newJE;
        },
        
        /**
         * Fetches users from API or fallback
         * @returns {Promise<Array>} Array of users
         */
        async fetchUsers() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/users');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching users - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback users data');
            await _simulateDelay();
            return [..._fallback.users];
        },
        
        /**
         * Saves a user (create or update)
         * @param {object} userData - User data to save
         * @returns {Promise<object>} Saved user
         */
        async saveUser(userData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (userData.id) {
                        return await _apiPut(`/api/users/${userData.id}`, userData);
                    } else {
                        return await _apiPost('/api/users', userData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving user - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveUser');
            await _simulateDelay();
            
            if (userData.id) {
                const index = _fallback.users.findIndex(u => u.id === userData.id);
                if (index !== -1) {
                    _fallback.users[index] = { ..._fallback.users[index], ...userData };
                    return _fallback.users[index];
                }
            }
            
            const newUser = {
                ...userData,
                id: userData.id || `user_local_${_fallback.users.length + 1}`
            };
            _fallback.users.push(newUser);
            return newUser;
        },
        
        /**
         * Fetches organization settings from API or fallback
         * @returns {Promise<object>} Organization settings
         */
        async fetchOrganizationSettings() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/organization-settings');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching organization settings - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback organization settings data');
            await _simulateDelay();
            return { ..._fallback.organizationSettings };
        },
        
        /**
         * Saves organization settings
         * @param {object} settingsData - Settings data to save
         * @returns {Promise<object>} Saved settings
         */
        async saveOrganizationSettings(settingsData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    return await _apiPut('/api/organization-settings', settingsData);
                } catch (err) {
                    console.warn(`DB: Error saving organization settings - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveOrganizationSettings');
            await _simulateDelay();
            
            _fallback.organizationSettings = { ..._fallback.organizationSettings, ...settingsData };
            return _fallback.organizationSettings;
        },
        
        /**
         * Fetches custom report definitions from API or fallback
         * @returns {Promise<Array>} Array of custom report definitions
         */
        async fetchCustomReportDefinitions() {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    const data = await _apiGet('/api/reports/definitions');
                    return data;
                } catch (err) {
                    console.warn(`DB: Error fetching report definitions - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback report definitions data');
            await _simulateDelay();
            return [..._fallback.customReportDefinitions];
        },
        
        /**
         * Saves a custom report definition
         * @param {object} defData - Report definition data
         * @returns {Promise<object>} Saved report definition
         */
        async saveCustomReportDefinition(defData) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    if (defData.id) {
                        return await _apiPut(`/api/reports/definitions/${defData.id}`, defData);
                    } else {
                        return await _apiPost('/api/reports/definitions', defData);
                    }
                } catch (err) {
                    console.warn(`DB: Error saving report definition - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for saveCustomReportDefinition');
            await _simulateDelay();
            
            if (defData.id) {
                const index = _fallback.customReportDefinitions.findIndex(d => d.id === defData.id);
                if (index !== -1) {
                    _fallback.customReportDefinitions[index] = { ..._fallback.customReportDefinitions[index], ...defData };
                    return _fallback.customReportDefinitions[index];
                }
            }
            
            const newDef = {
                ...defData,
                id: defData.id || `report_def_local_${_fallback.customReportDefinitions.length + 1}`
            };
            _fallback.customReportDefinitions.push(newDef);
            return newDef;
        },
        
        /**
         * Deletes a custom report definition
         * @param {string} defId - Report definition ID to delete
         * @returns {Promise<boolean>} Success status
         */
        async deleteCustomReportDefinition(defId) {
            if (!_connectionAttempted) await this.connect();
            
            if (_dbConnected) {
                try {
                    await _apiDelete(`/api/reports/definitions/${defId}`);
                    return true;
                } catch (err) {
                    console.warn(`DB: Error deleting report definition - ${err.message}`);
                    _dbConnected = false;
                }
            }
            
            console.log('DB: Using fallback for deleteCustomReportDefinition');
            await _simulateDelay();
            
            const index = _fallback.customReportDefinitions.findIndex(d => d.id === defId);
            if (index !== -1) {
                _fallback.customReportDefinitions.splice(index, 1);
                return true;
            }
            
            return false;
        }
    };

    // Expose the public API to the window
    window.db = db;
    
    // Auto-initialize when included if document is already loaded
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        console.log('DB: Document already loaded, checking for auto-connection');
        // We don't auto-connect here - the core app module should manage this
    }

})(window);
