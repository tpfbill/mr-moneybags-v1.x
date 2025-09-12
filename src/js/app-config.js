/**
 * @file app-config.js
 * @description Configuration module for the Non-Profit Fund Accounting System.
 * This module contains shared constants, application state, and utility functions
 * that are used across multiple modules.
 */

// ---------------------------------------------------------------------------
// Dynamic API base URL – automatically uses current host (works with
// localhost, Tailscale IP/hostname, or any other network interface)
// ---------------------------------------------------------------------------
let API_BASE;
const devPorts = ['8080', '8081'];           // ports used by http-server dev instances

if (devPorts.includes(window.location.port)) {
    // Two-port dev mode → talk to backend on :3000
    API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;
} else {
    // Same-origin (single-port) – production or when Express serves static files
    API_BASE = window.location.origin;
}

export { API_BASE };

// DEBUGGING: Config module loaded on (timestamp)
console.log('app-config.js loaded:', new Date().toISOString(), '- Using API at', API_BASE);

// ---------------------------------------------------------------------------
// Application State - Shared across all modules
// ---------------------------------------------------------------------------
export const appState = {
    // Data collections
    entities: [],
    accounts: [],
    funds: [],
    journalEntries: [],
    bankAccounts: [],
    users: [],
    glCodes: [],            // <--- GL Codes data collection
    organizationSettings: {},
    customReportDefinitions: [],
    
    // Current selections and view state
    selectedEntityId: null,
    isConsolidatedView: false,
    currentPage: 'dashboard',
    currentTab: 'settings-users', // Default tab for settings page
    dbConnected: false,
    currentUser: null,
    
    // Entity type constants
    entityTypes: {
        ROOT: 'root',
        ENTITY: 'entity',
        FUND: 'fund'
    }
};

// ---------------------------------------------------------------------------
// Utility Functions - Shared across all modules
// ---------------------------------------------------------------------------

/**
 * Format a number as currency (USD)
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
export function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount || 0);
}

/**
 * Format a date string to a human-readable format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

/**
 * Format a value as a percentage of a total
 * @param {number} value - The value
 * @param {number} total - The total
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, total) {
    if (!total) return '0.0%';
    return ((value / total) * 100).toFixed(1) + '%';
}

/**
 * Get relevant entity IDs based on selected entity and consolidated view
 * @returns {Array<string>} Array of entity IDs
 */
export function getRelevantEntityIds() {
    if (!appState.selectedEntityId) return [];
    
    if (!appState.isConsolidatedView) {
        // Just the selected entity
        return [appState.selectedEntityId];
    } else {
        // Selected entity and its children
        const selectedEntity = appState.entities.find(entity => entity.id === appState.selectedEntityId);
        
        if (selectedEntity && selectedEntity.is_consolidated) {
            const childEntityIds = appState.entities
                .filter(entity => entity.parent_entity_id === selectedEntity.id)
                .map(entity => entity.id);
            
            return [selectedEntity.id, ...childEntityIds];
        } else {
            return [appState.selectedEntityId];
        }
    }
}

/**
 * Get relevant funds based on selected entity and consolidated view
 * @returns {Array<Object>} Array of fund objects
 */
export function getRelevantFunds() {
    // After funds schema refactor, funds are no longer linked by entity_id.
    // Return all funds for now; filtering (if needed) will be handled elsewhere.
    return appState.funds;
}
