/**
 * @file app-config.js
 * @description Configuration module for the Non-Profit Fund Accounting System.
 * This module contains shared constants, application state, and utility functions
 * that are used across multiple modules.
 */

// ---------------------------------------------------------------------------
// Dynamic API base URL
// - If frontend is served on 8080 (dev), point API to :3000 on same host
// - Otherwise default to current origin (single-port deployments)
// ---------------------------------------------------------------------------
const API_BASE = (() => {
    try {
        const loc = window.location;
        const apiPort = '3000';
        // If we're on 8080 or any non-API port, target the API port on same host
        if (loc.port && loc.port !== apiPort) {
            return `${loc.protocol}//${loc.hostname}:${apiPort}`;
        }
        // Fallback to current origin (includes port if present)
        return loc.origin;
    } catch {
        return window.location.origin;
    }
})();

// Expose globally for fetch interceptor (api-base-prefix.js)
window.API_BASE = API_BASE;

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
    dashboardMetrics: null,
    
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

/**
 * Get relevant entity codes based on selected entity and consolidated view
 * @returns {Array<string>} entity_code values
 */
export function getRelevantEntityCodes() {
    if (!appState.selectedEntityId) return [];

    const selected = appState.entities.find(e => e.id === appState.selectedEntityId);
    if (!selected) return [];

    if (!appState.isConsolidatedView || !selected.is_consolidated) {
        return [selected.code].filter(Boolean);
    }

    const childCodes = appState.entities
        .filter(e => e.parent_entity_id === selected.id)
        .map(e => e.code)
        .filter(Boolean);
    return [selected.code, ...childCodes].filter(Boolean);
}
