/**
 * @file app-data.js
 * @description Data management module for the Non-Profit Fund Accounting System.
 * This module handles API interactions, data fetching, and state updates.
 */

// Import shared configuration and state
import { API_BASE, appState } from './app-config.js';

// Forward declarations for UI update functions that will be imported in app-main.js
// These are called after data is loaded to update the UI
let updateEntitySelector;
let updateEntitiesTable;
let updateChartOfAccountsTable;
let updateFundsTable;
let updateJournalEntriesTable;
let updateUsersTable;
let updateDashboardTitle;
let updateDashboardSummaryCards;
let updateDashboardFundBalances;
let updateDashboardRecentTransactions;
let updateDashboardUnpostedEntries;
let updateEntityHierarchyVisualization;
let initializeDashboardCharts;

/**
 * Set UI update functions - called from app-main.js to connect the data layer with UI updates
 * @param {Object} uiUpdaters - Object containing UI update functions
 */
export function setUIUpdaters(uiUpdaters) {
    updateEntitySelector = uiUpdaters.updateEntitySelector;
    updateEntitiesTable = uiUpdaters.updateEntitiesTable;
    updateChartOfAccountsTable = uiUpdaters.updateChartOfAccountsTable;
    updateFundsTable = uiUpdaters.updateFundsTable;
    updateJournalEntriesTable = uiUpdaters.updateJournalEntriesTable;
    updateUsersTable = uiUpdaters.updateUsersTable;
    updateDashboardTitle = uiUpdaters.updateDashboardTitle;
    updateDashboardSummaryCards = uiUpdaters.updateDashboardSummaryCards;
    updateDashboardFundBalances = uiUpdaters.updateDashboardFundBalances;
    updateDashboardRecentTransactions = uiUpdaters.updateDashboardRecentTransactions;
    updateDashboardUnpostedEntries = uiUpdaters.updateDashboardUnpostedEntries;
    updateEntityHierarchyVisualization = uiUpdaters.updateEntityHierarchyVisualization;
    initializeDashboardCharts = uiUpdaters.initializeDashboardCharts;
}

/**
 * Generic function to fetch data from the API
 * @param {string} endpoint - API endpoint to fetch from
 * @returns {Promise<Array|Object>} - Fetched data
 */
export async function fetchData(endpoint) {
    try {
        console.log(`Fetching data from /api/${endpoint}...`);
        /* Use absolute URL pointing at the backend API (port 3000) to avoid
         * accidental requests to the static-file server on port 8080. */
        const response = await fetch(`${API_BASE}/api/${endpoint}`, {
            credentials: 'include' // include cookies for session authentication
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Received ${Array.isArray(data) ? data.length : 1} item(s) from /api/${endpoint}`);
        return data;
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return Array.isArray(error) ? [] : {};
    }
}

/**
 * Generic function to save data to the API
 * @param {string} endpoint - API endpoint to save to
 * @param {Object} data - Data to save
 * @param {string} method - HTTP method (POST or PUT)
 * @returns {Promise<Object>} - Saved data
 */
export async function saveData(endpoint, data, method = 'POST') {
    try {
        const response = await fetch(`${API_BASE}/api/${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // include cookies for session authentication
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`Error saving to ${endpoint}:`, error);
        throw error;
    }
}

/**
 * Check database connection status
 * @returns {Promise<boolean>} - True if connected, false otherwise
 */
export async function checkDatabaseConnection() {
    try {
        const dbStatusIndicator = document.getElementById('db-status-indicator');
        
        // Try to fetch entities as a connection test
        const response = await fetch(`${API_BASE}/api/entities`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            if (dbStatusIndicator) {
                dbStatusIndicator.textContent = 'DB Connected';
                dbStatusIndicator.classList.remove('offline');
                dbStatusIndicator.classList.add('online');
            }
            appState.dbConnected = true;
            return true;
        } else {
            if (dbStatusIndicator) {
                dbStatusIndicator.textContent = 'DB Offline';
                dbStatusIndicator.classList.remove('online');
                dbStatusIndicator.classList.add('offline');
            }
            appState.dbConnected = false;
            return false;
        }
    } catch (error) {
        console.error('Database connection check error:', error);
        const dbStatusIndicator = document.getElementById('db-status-indicator');
        if (dbStatusIndicator) {
            dbStatusIndicator.textContent = 'DB Error';
            dbStatusIndicator.classList.remove('online');
            dbStatusIndicator.classList.add('offline');
        }
        appState.dbConnected = false;
        return false;
    }
}

/**
 * Load entity data and update UI
 * @returns {Promise<Array>} - Loaded entities
 */
export async function loadEntityData() {
    try {
        const entities = await fetchData('entities');
        appState.entities = entities;
        
        // Update entity selector if UI updater is available
        if (typeof updateEntitySelector === 'function') {
            updateEntitySelector();
        }
        
        // Update entity table in settings if UI updater is available
        if (typeof updateEntitiesTable === 'function') {
            updateEntitiesTable();
        }
        
        return entities;
    } catch (error) {
        console.error('Error loading entity data:', error);
        return [];
    }
}

/**
 * Load account data and update UI
 * @returns {Promise<Array>} - Loaded accounts
 */
export async function loadAccountData() {
    try {
        const accounts = await fetchData('accounts');
        appState.accounts = accounts;
        
        // Update chart of accounts table if UI updater is available
        if (typeof updateChartOfAccountsTable === 'function') {
            updateChartOfAccountsTable();
        }
        
        return accounts;
    } catch (error) {
        console.error('Error loading account data:', error);
        return [];
    }
}

/**
 * Load fund data and update UI
 * @returns {Promise<Array>} - Loaded funds
 */
export async function loadFundData() {
    try {
        const funds = await fetchData('funds');
        appState.funds = funds;
        
        // Update funds table if UI updater is available
        if (typeof updateFundsTable === 'function') {
            updateFundsTable();
        }
        
        // Update dashboard fund balances if UI updater is available
        if (typeof updateDashboardFundBalances === 'function') {
            updateDashboardFundBalances();
        }
        
        return funds;
    } catch (error) {
        console.error('Error loading fund data:', error);
        return [];
    }
}

/**
 * Load journal entry data and update UI
 * @returns {Promise<Array>} - Loaded journal entries
 */
export async function loadJournalEntryData() {
    try {
        const journalEntries = await fetchData('journal-entries');
        appState.journalEntries = journalEntries;
        
        // Update journal entries table if UI updater is available
        if (typeof updateJournalEntriesTable === 'function') {
            updateJournalEntriesTable();
        }
        
        // Update dashboard recent transactions if UI updater is available
        if (typeof updateDashboardRecentTransactions === 'function') {
            updateDashboardRecentTransactions();
        }
        
        // Update dashboard unposted entries if UI updater is available
        if (typeof updateDashboardUnpostedEntries === 'function') {
            updateDashboardUnpostedEntries();
        }
        
        return journalEntries;
    } catch (error) {
        console.error('Error loading journal entry data:', error);
        return [];
    }
}

/**
 * Load user data and update UI
 * @returns {Promise<Array>} - Loaded users
 */
export async function loadUserData() {
    try {
        const users = await fetchData('users');
        appState.users = users;
        
        // Update users table if UI updater is available
        if (typeof updateUsersTable === 'function') {
            updateUsersTable();
        }
        
        return users;
    } catch (error) {
        console.error('Error loading user data:', error);
        return [];
    }
}

/**
 * Load dashboard data and update UI
 */
export async function loadDashboardData() {
    try {
        // Update dashboard title based on selected entity
        if (typeof updateDashboardTitle === 'function') {
            updateDashboardTitle();
        }
        
        // Update dashboard summary cards
        if (typeof updateDashboardSummaryCards === 'function') {
            updateDashboardSummaryCards();
        }
        
        // Update fund balances table
        if (typeof updateDashboardFundBalances === 'function') {
            updateDashboardFundBalances();
        }
        
        // Update recent transactions table
        if (typeof updateDashboardRecentTransactions === 'function') {
            updateDashboardRecentTransactions();
        }
        
        // Update unposted entries table
        if (typeof updateDashboardUnpostedEntries === 'function') {
            updateDashboardUnpostedEntries();
        }
        
        // Initialize charts if they exist
        if (typeof initializeDashboardCharts === 'function') {
            initializeDashboardCharts();
        }
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

/**
 * Load all core data in parallel
 * @returns {Promise<void>}
 */
export async function loadAllCoreData() {
    try {
        // Load core data in parallel
        await Promise.all([
            loadEntityData(),
            loadFundData(),
            loadAccountData(),
            loadJournalEntryData(),
            loadUserData()
        ]);
        
        // Update entity hierarchy visualization after all data is loaded
        if (typeof updateEntityHierarchyVisualization === 'function') {
            updateEntityHierarchyVisualization();
        }
        
        console.log('All core data loaded successfully');
    } catch (error) {
        console.error('Error loading core data:', error);
    }
}
