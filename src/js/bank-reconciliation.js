/**
 * Bank Reconciliation Module
 * 
 * Comprehensive JavaScript functionality for the bank reconciliation interface
 * Compatible with Mr. MoneyBags v1.x
 * 
 * This module handles:
 * - Bank statement management
 * - Transaction import
 * - Reconciliation workflow
 * - Matching transactions
 * - Adjustments
 * - Reports
 */

// =============================================
// Application State
// =============================================

// ---------------------------------------------------------------------------
//  GLOBAL FETCH WRAPPER  – ensure session cookie is sent automatically
// ---------------------------------------------------------------------------
(() => {
    /*  Patch window.fetch so every request includes `credentials: 'include'`
        unless the caller explicitly sets another value.
        This guarantees that all API calls made from this module (and any other
        script loaded afterwards) will carry the session cookie required for
        authentication without having to modify each individual fetch() call. */
    const _origFetch = window.fetch;
    window.fetch = (resource, init = {}) => {
        // Respect explicit credentials if already provided
        if (!init.credentials) {
            init = { ...init, credentials: 'include' };
        }
        return _origFetch(resource, init);
    };
})();

const reconciliationState = {
    // Selected bank account
    selectedBankAccountId: null,
    selectedBankAccount: null,
    
    // Bank statements
    bankStatements: [],
    statementsPage: 1,
    statementsTotalPages: 1,
    statementsFilters: {
        status: '',
        startDate: '',
        endDate: ''
    },
    selectedStatementId: null,
    selectedStatement: null,
    statementTransactions: [],
    
    // Reconciliations
    reconciliations: [],
    reportsPage: 1,
    reportsTotalPages: 1,
    reportsFilters: {
        status: '',
        startDate: '',
        endDate: ''
    },
    selectedReconciliationId: null,
    activeReconciliation: null,
    
    // Reconciliation workspace
    unmatchedBankTransactions: [],
    unmatchedJournalEntries: [],
    matchedItems: [],
    adjustments: [],
    
    // Reports
    selectedReportId: null,
    selectedReport: null,
    
    // UI state
    isLoading: false,
    activeTab: 'bank-statements-tab',
    
    // Reset state for a new session
    reset() {
        this.selectedBankAccountId = null;
        this.selectedBankAccount = null;
        this.bankStatements = [];
        this.statementsPage = 1;
        this.statementsTotalPages = 1;
        this.statementsFilters = {
            status: '',
            startDate: '',
            endDate: ''
        };
        this.selectedStatementId = null;
        this.selectedStatement = null;
        this.statementTransactions = [];
        this.reconciliations = [];
        this.reportsPage = 1;
        this.reportsTotalPages = 1;
        this.reportsFilters = {
            status: '',
            startDate: '',
            endDate: ''
        };
        this.selectedReconciliationId = null;
        this.activeReconciliation = null;
        this.unmatchedBankTransactions = [];
        this.unmatchedJournalEntries = [];
        this.matchedItems = [];
        this.adjustments = [];
        this.selectedReportId = null;
        this.selectedReport = null;
        this.isLoading = false;
        this.activeTab = 'bank-statements-tab';
    }
};

// =============================================
// Utility Functions
// =============================================

/**
 * Format currency amount
 * @param {number} amount - The amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    });
    
    return formatter.format(amount);
}

/**
 * Format date in MM/DD/YYYY format
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    });
}

/**
 * Format date range
 * @param {string} startDate - Start date string
 * @param {string} endDate - End date string
 * @returns {string} Formatted date range
 */
function formatDateRange(startDate, endDate) {
    return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

/**
 * Show loading spinner
 */
function showLoading() {
    reconciliationState.isLoading = true;
    // Add loading spinner to the page
    const loadingSpinner = document.createElement('div');
    loadingSpinner.id = 'loading-spinner';
    loadingSpinner.className = 'loading-spinner';
    loadingSpinner.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(loadingSpinner);
}

/**
 * Hide loading spinner
 */
function hideLoading() {
    reconciliationState.isLoading = false;
    // Remove loading spinner
    const loadingSpinner = document.getElementById('loading-spinner');
    if (loadingSpinner) {
        loadingSpinner.remove();
    }
}

/**
 * Show toast notification
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 */
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '';
    switch (type) {
        case 'success':
            icon = '✓';
            break;
        case 'error':
            icon = '✗';
            break;
        case 'warning':
            icon = '⚠';
            break;
        case 'info':
        default:
            icon = 'ℹ';
            break;
    }
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close">&times;</button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        toast.remove();
    }, 3000);
    
    // Close button functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });
}

/**
 * Create element with class and optional attributes
 * @param {string} tag - HTML tag name
 * @param {string|Array} className - CSS class name(s)
 * @param {Object} attributes - HTML attributes
 * @returns {HTMLElement} Created element
 */
function createElement(tag, className, attributes = {}) {
    const element = document.createElement(tag);
    
    if (className) {
        if (Array.isArray(className)) {
            element.classList.add(...className);
        } else {
            element.classList.add(className);
        }
    }
    
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    
    return element;
}

/**
 * Format amount with positive/negative class
 * @param {number} amount - Amount to format
 * @param {boolean} addClasses - Whether to add CSS classes
 * @returns {Object} Formatted amount and CSS class
 */
function formatAmountWithClass(amount, addClasses = true) {
    const formattedAmount = formatCurrency(amount);
    let cssClass = '';
    
    if (addClasses) {
        if (amount > 0) {
            cssClass = 'amount-positive';
        } else if (amount < 0) {
            cssClass = 'amount-negative';
        }
    }
    
    return { formattedAmount, cssClass };
}

/**
 * Format difference amount with appropriate class
 * @param {number} difference - Difference amount
 * @returns {Object} Formatted difference and CSS class
 */
function formatDifferenceWithClass(difference) {
    const formattedDifference = formatCurrency(difference);
    let cssClass = 'zero';
    
    if (Math.abs(difference) < 0.01) {
        cssClass = 'zero';
    } else if (difference > 0) {
        cssClass = 'positive';
    } else if (difference < 0) {
        cssClass = 'negative';
    }
    
    return { formattedDifference, cssClass };
}

/**
 * Get status badge HTML
 * @param {string} status - Status value
 * @returns {string} HTML for status badge
 */
function getStatusBadgeHtml(status) {
    if (!status) return '';
    
    const statusLower = status.toLowerCase().replace(/\s+/g, '-');
    return `<span class="status-badge status-${statusLower}">${status}</span>`;
}

/**
 * Create action buttons for tables
 * @param {Array} actions - Array of action objects
 * @returns {HTMLElement} Action cell element
 */
function createActionButtons(actions) {
    const actionCell = createElement('div', 'action-cell');
    
    actions.forEach(action => {
        const button = createElement('button', ['action-btn', `${action.type}-btn`], {
            'data-id': action.id,
            'title': action.label
        });
        button.textContent = action.label;
        button.addEventListener('click', action.handler);
        actionCell.appendChild(button);
    });
    
    return actionCell;
}

/**
 * Validate form inputs
 * @param {HTMLFormElement} form - Form to validate
 * @returns {boolean} Whether form is valid
 */
function validateForm(form) {
    const requiredInputs = form.querySelectorAll('[required]');
    let isValid = true;
    
    requiredInputs.forEach(input => {
        if (!input.value.trim()) {
            isValid = false;
            input.classList.add('invalid');
            
            // Add error message if not exists
            let errorMessage = input.nextElementSibling;
            if (!errorMessage || !errorMessage.classList.contains('error-message')) {
                errorMessage = createElement('div', 'error-message');
                errorMessage.textContent = 'This field is required';
                input.parentNode.insertBefore(errorMessage, input.nextSibling);
            }
        } else {
            input.classList.remove('invalid');
            
            // Remove error message if exists
            const errorMessage = input.nextElementSibling;
            if (errorMessage && errorMessage.classList.contains('error-message')) {
                errorMessage.remove();
            }
        }
    });
    
    return isValid;
}

/**
 * Reset form inputs
 * @param {HTMLFormElement} form - Form to reset
 */
function resetForm(form) {
    form.reset();
    
    // Remove validation styling
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
        input.classList.remove('invalid');
    });
    
    // Remove error messages
    const errorMessages = form.querySelectorAll('.error-message');
    errorMessages.forEach(message => message.remove());
}

/**
 * Calculate difference between statement and book balance
 * @param {number} statementBalance - Statement balance
 * @param {number} bookBalance - Book balance
 * @returns {number} Difference amount
 */
function calculateDifference(statementBalance, bookBalance) {
    return statementBalance - bookBalance;
}

// =============================================
// API Service Functions
// =============================================

/**
 * Fetch bank accounts
 * @returns {Promise<Array>} Bank accounts
 */
async function fetchBankAccounts() {
    try {
        const response = await fetch('/api/bank-accounts');
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bank accounts: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        showToast(`Error fetching bank accounts: ${error.message}`, 'error');
        return [];
    }
}

/**
 * Fetch bank statements
 * @param {Object} filters - Filter criteria
 * @param {number} page - Page number
 * @returns {Promise<Object>} Statements with pagination
 */
async function fetchBankStatements(filters = {}, page = 1) {
    try {
        const { bank_account_id, status, start_date, end_date } = filters;
        
        let url = `/api/bank-reconciliation/statements?page=${page}&limit=10`;
        
        if (bank_account_id) {
            url += `&bank_account_id=${bank_account_id}`;
        }
        
        if (status) {
            url += `&status=${status}`;
        }
        
        if (start_date) {
            url += `&start_date=${start_date}`;
        }
        
        if (end_date) {
            url += `&end_date=${end_date}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bank statements: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching bank statements:', error);
        showToast(`Error fetching bank statements: ${error.message}`, 'error');
        return { data: [], pagination: { total: 0, page: 1, pages: 1 } };
    }
}

/**
 * Fetch bank statement by ID
 * @param {string} id - Statement ID
 * @returns {Promise<Object>} Statement details
 */
async function fetchBankStatement(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/statements/${id}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch bank statement: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching bank statement ${id}:`, error);
        showToast(`Error fetching bank statement: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Fetch statement transactions
 * @param {string} statementId - Statement ID
 * @returns {Promise<Array>} Statement transactions
 */
async function fetchStatementTransactions(statementId) {
    try {
        const response = await fetch(`/api/bank-reconciliation/statements/${statementId}/transactions`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch statement transactions: ${response.status}`);
        }
        
        const result = await response.json();
        return result.data || [];
    } catch (error) {
        console.error(`Error fetching transactions for statement ${statementId}:`, error);
        showToast(`Error fetching transactions: ${error.message}`, 'error');
        return [];
    }
}

/**
 * Create bank statement
 * @param {FormData} formData - Form data with statement details
 * @returns {Promise<Object>} Created statement
 */
async function createBankStatement(formData) {
    try {
        const response = await fetch('/api/bank-reconciliation/statements', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to create bank statement: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating bank statement:', error);
        showToast(`Error creating bank statement: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Update bank statement
 * @param {string} id - Statement ID
 * @param {Object} data - Updated statement data
 * @returns {Promise<Object>} Updated statement
 */
async function updateBankStatement(id, data) {
    try {
        const response = await fetch(`/api/bank-reconciliation/statements/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update bank statement: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error updating bank statement ${id}:`, error);
        showToast(`Error updating bank statement: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Delete bank statement
 * @param {string} id - Statement ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteBankStatement(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/statements/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete bank statement: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error deleting bank statement ${id}:`, error);
        showToast(`Error deleting bank statement: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Import transactions from file
 * @param {string} statementId - Statement ID
 * @param {FormData} formData - Form data with transaction file
 * @returns {Promise<Object>} Import result
 */
async function importTransactions(statementId, formData) {
    try {
        formData.append('bank_statement_id', statementId);
        
        const response = await fetch('/api/bank-reconciliation/transactions/import', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to import transactions: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error importing transactions for statement ${statementId}:`, error);
        showToast(`Error importing transactions: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fetch reconciliations
 * @param {Object} filters - Filter criteria
 * @param {number} page - Page number
 * @returns {Promise<Object>} Reconciliations with pagination
 */
async function fetchReconciliations(filters = {}, page = 1) {
    try {
        const { bank_account_id, status, start_date, end_date } = filters;
        
        let url = `/api/bank-reconciliation/reconciliations?page=${page}&limit=10`;
        
        if (bank_account_id) {
            url += `&bank_account_id=${bank_account_id}`;
        }
        
        if (status) {
            url += `&status=${status}`;
        }
        
        if (start_date) {
            url += `&start_date=${start_date}`;
        }
        
        if (end_date) {
            url += `&end_date=${end_date}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch reconciliations: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching reconciliations:', error);
        showToast(`Error fetching reconciliations: ${error.message}`, 'error');
        return { data: [], pagination: { total: 0, page: 1, pages: 1 } };
    }
}

/**
 * Fetch reconciliation by ID
 * @param {string} id - Reconciliation ID
 * @returns {Promise<Object>} Reconciliation details
 */
async function fetchReconciliation(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/reconciliations/${id}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch reconciliation: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching reconciliation ${id}:`, error);
        showToast(`Error fetching reconciliation: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Create reconciliation
 * @param {Object} data - Reconciliation data
 * @returns {Promise<Object>} Created reconciliation
 */
async function createReconciliation(data) {
    try {
        const response = await fetch('/api/bank-reconciliation/reconciliations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to create reconciliation: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error creating reconciliation:', error);
        showToast(`Error creating reconciliation: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Update reconciliation
 * @param {string} id - Reconciliation ID
 * @param {Object} data - Updated reconciliation data
 * @returns {Promise<Object>} Updated reconciliation
 */
async function updateReconciliation(id, data) {
    try {
        const response = await fetch(`/api/bank-reconciliation/reconciliations/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update reconciliation: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error updating reconciliation ${id}:`, error);
        showToast(`Error updating reconciliation: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Complete reconciliation
 * @param {string} id - Reconciliation ID
 * @returns {Promise<Object>} Completion result
 */
async function completeReconciliation(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/reconciliations/${id}/complete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to complete reconciliation: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error completing reconciliation ${id}:`, error);
        showToast(`Error completing reconciliation: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fetch unmatched transactions
 * @param {string} bankAccountId - Bank account ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Unmatched transactions
 */
async function fetchUnmatchedTransactions(bankAccountId, startDate, endDate) {
    try {
        let url = `/api/bank-reconciliation/unmatched/${bankAccountId}`;
        
        if (startDate) {
            url += `?start_date=${startDate}`;
        }
        
        if (endDate) {
            url += startDate ? `&end_date=${endDate}` : `?end_date=${endDate}`;
        }
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch unmatched transactions: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching unmatched transactions for account ${bankAccountId}:`, error);
        showToast(`Error fetching unmatched transactions: ${error.message}`, 'error');
        return { bank_transactions: [], journal_items: [] };
    }
}

/**
 * Auto-match transactions
 * @param {string} reconciliationId - Reconciliation ID
 * @param {Object} options - Matching options
 * @returns {Promise<Object>} Matching result
 */
async function autoMatchTransactions(reconciliationId, options = {}) {
    try {
        const { description_match = true, date_tolerance = 3 } = options;
        
        const response = await fetch('/api/bank-reconciliation/match/auto', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bank_reconciliation_id: reconciliationId,
                description_match,
                date_tolerance
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to auto-match transactions: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error auto-matching transactions for reconciliation ${reconciliationId}:`, error);
        showToast(`Error auto-matching transactions: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Manual match transactions
 * @param {string} reconciliationId - Reconciliation ID
 * @param {string} bankTransactionId - Bank transaction ID
 * @param {string} journalEntryItemId - Journal entry item ID
 * @param {string} notes - Match notes
 * @returns {Promise<Object>} Match result
 */
async function manualMatchTransactions(reconciliationId, bankTransactionId, journalEntryItemId, notes = '') {
    try {
        const response = await fetch('/api/bank-reconciliation/match/manual', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bank_reconciliation_id: reconciliationId,
                bank_statement_transaction_id: bankTransactionId,
                journal_entry_item_id: journalEntryItemId,
                notes
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to match transactions: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error matching transactions for reconciliation ${reconciliationId}:`, error);
        showToast(`Error matching transactions: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Unmatch transactions
 * @param {string} matchId - Match ID
 * @returns {Promise<boolean>} Success status
 */
async function unmatchTransactions(matchId) {
    try {
        const response = await fetch(`/api/bank-reconciliation/match/${matchId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to unmatch transactions: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error unmatching transactions for match ${matchId}:`, error);
        showToast(`Error unmatching transactions: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Add reconciliation adjustment
 * @param {Object} data - Adjustment data
 * @returns {Promise<Object>} Created adjustment
 */
async function addAdjustment(data) {
    try {
        const response = await fetch('/api/bank-reconciliation/adjustments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to add adjustment: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error adding adjustment:', error);
        showToast(`Error adding adjustment: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Update reconciliation adjustment
 * @param {string} id - Adjustment ID
 * @param {Object} data - Updated adjustment data
 * @returns {Promise<Object>} Updated adjustment
 */
async function updateAdjustment(id, data) {
    try {
        const response = await fetch(`/api/bank-reconciliation/adjustments/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update adjustment: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error updating adjustment ${id}:`, error);
        showToast(`Error updating adjustment: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Delete reconciliation adjustment
 * @param {string} id - Adjustment ID
 * @returns {Promise<boolean>} Success status
 */
async function deleteAdjustment(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/adjustments/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete adjustment: ${response.status}`);
        }
        
        return true;
    } catch (error) {
        console.error(`Error deleting adjustment ${id}:`, error);
        showToast(`Error deleting adjustment: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fetch reconciliation report
 * @param {string} id - Reconciliation ID
 * @returns {Promise<Object>} Reconciliation report
 */
async function fetchReconciliationReport(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/reports/${id}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch reconciliation report: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`Error fetching reconciliation report ${id}:`, error);
        showToast(`Error fetching reconciliation report: ${error.message}`, 'error');
        return null;
    }
}

// =============================================
// UI Event Handlers
// =============================================

/**
 * Handle bank account selection change
 */
async function handleBankAccountChange() {
    const bankAccountSelector = document.getElementById('bank-account-selector');
    const selectedBankAccountId = bankAccountSelector.value;
    
    if (selectedBankAccountId) {
        reconciliationState.selectedBankAccountId = selectedBankAccountId;
        reconciliationState.selectedBankAccount = bankAccountSelector.options[bankAccountSelector.selectedIndex].text;
        
        // Update statement form bank account dropdown
        const statementBankAccount = document.getElementById('statement-bank-account');
        if (statementBankAccount) {
            statementBankAccount.value = selectedBankAccountId;
        }
        
        // Update reconciliation form bank account dropdown
        const reconciliationBankAccount = document.getElementById('reconciliation-bank-account');
        if (reconciliationBankAccount) {
            reconciliationBankAccount.value = selectedBankAccountId;
        }
        
        // Load bank statements for selected account
        loadBankStatements();
        
        // Load reconciliations for selected account
        loadReconciliations();
    } else {
        reconciliationState.selectedBankAccountId = null;
        reconciliationState.selectedBankAccount = null;
        
        // Clear bank statements
        renderBankStatements([]);
        
        // Clear reconciliations
        renderReconciliations([]);
    }
}

/**
 * Handle tab navigation
 * @param {Event} event - Click event
 */
function handleTabClick(event) {
    const tabItem = event.currentTarget;
    const tabId = tabItem.dataset.tab;
    
    // Update active tab
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.remove('active');
    });
    tabItem.classList.add('active');
    
    // Show selected tab panel
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(tabId).classList.add('active');
    
    // Update state
    reconciliationState.activeTab = tabId;
    
    // Load data for selected tab
    if (tabId === 'bank-statements-tab') {
        loadBankStatements();
    } else if (tabId === 'reconciliation-workspace-tab') {
        loadReconciliationWorkspace();
    } else if (tabId === 'reconciliation-reports-tab') {
        loadReconciliations();
    }
}

/**
 * Handle bank statement filter
 */
function handleStatementFilter() {
    const statusFilter = document.getElementById('statement-status-filter').value;
    const dateFromFilter = document.getElementById('statement-date-from').value;
    const dateToFilter = document.getElementById('statement-date-to').value;
    
    reconciliationState.statementsFilters = {
        status: statusFilter,
        startDate: dateFromFilter,
        endDate: dateToFilter
    };
    
    reconciliationState.statementsPage = 1;
    loadBankStatements();
}

/**
 * Handle bank statement filter reset
 */
function handleStatementFilterReset() {
    document.getElementById('statement-status-filter').value = '';
    document.getElementById('statement-date-from').value = '';
    document.getElementById('statement-date-to').value = '';
    
    reconciliationState.statementsFilters = {
        status: '',
        startDate: '',
        endDate: ''
    };
    
    reconciliationState.statementsPage = 1;
    loadBankStatements();
}

/**
 * Handle report filter
 */
function handleReportFilter() {
    const statusFilter = document.getElementById('report-status-filter').value;
    const dateFromFilter = document.getElementById('report-date-from').value;
    const dateToFilter = document.getElementById('report-date-to').value;
    
    reconciliationState.reportsFilters = {
        status: statusFilter,
        startDate: dateFromFilter,
        endDate: dateToFilter
    };
    
    reconciliationState.reportsPage = 1;
    loadReconciliations();
}

/**
 * Handle report filter reset
 */
function handleReportFilterReset() {
    document.getElementById('report-status-filter').value = '';
    document.getElementById('report-date-from').value = '';
    document.getElementById('report-date-to').value = '';
    
    reconciliationState.reportsFilters = {
        status: '',
        startDate: '',
        endDate: ''
    };
    
    reconciliationState.reportsPage = 1;
    loadReconciliations();
}

/**
 * Handle statement pagination
 * @param {string} direction - 'prev' or 'next'
 */
function handleStatementPagination(direction) {
    if (direction === 'prev' && reconciliationState.statementsPage > 1) {
        reconciliationState.statementsPage--;
    } else if (direction === 'next' && reconciliationState.statementsPage < reconciliationState.statementsTotalPages) {
        reconciliationState.statementsPage++;
    }
    
    loadBankStatements();
}

/**
 * Handle report pagination
 * @param {string} direction - 'prev' or 'next'
 */
function handleReportPagination(direction) {
    if (direction === 'prev' && reconciliationState.reportsPage > 1) {
        reconciliationState.reportsPage--;
    } else if (direction === 'next' && reconciliationState.reportsPage < reconciliationState.reportsTotalPages) {
        reconciliationState.reportsPage++;
    }
    
    loadReconciliations();
}

/**
 * Handle bank statement row click
 * @param {string} id - Statement ID
 */
async function handleStatementRowClick(id) {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Fetch statement details
        const statement = await fetchBankStatement(id);
        
        if (!statement) {
            throw new Error('Failed to load statement details');
        }
        
        // Fetch statement transactions
        const transactions = await fetchStatementTransactions(id);
        
        // Update state
        reconciliationState.selectedStatementId = id;
        reconciliationState.selectedStatement = statement;
        reconciliationState.statementTransactions = transactions;
        
        // Render statement details
        renderStatementDetails(statement, transactions);
        
        // Show statement details panel
        document.getElementById('statement-details-panel').style.display = 'block';
    } catch (error) {
        console.error('Error loading statement details:', error);
        showToast(`Error loading statement details: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle reconciliation row click
 * @param {string} id - Reconciliation ID
 */
async function handleReconciliationRowClick(id) {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Fetch reconciliation report
        const report = await fetchReconciliationReport(id);
        
        if (!report) {
            throw new Error('Failed to load reconciliation report');
        }
        
        // Update state
        reconciliationState.selectedReportId = id;
        reconciliationState.selectedReport = report;
        
        // Render report details
        renderReportDetails(report);
        
        // Show report details panel
        document.getElementById('report-details-panel').style.display = 'block';
    } catch (error) {
        console.error('Error loading reconciliation report:', error);
        showToast(`Error loading reconciliation report: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle close panel button click
 * @param {Event} event - Click event
 */
function handleClosePanelClick(event) {
    const panel = event.target.closest('.details-panel');
    if (panel) {
        panel.style.display = 'none';
        
        // Reset selected state
        if (panel.id === 'statement-details-panel') {
            reconciliationState.selectedStatementId = null;
            reconciliationState.selectedStatement = null;
            reconciliationState.statementTransactions = [];
        } else if (panel.id === 'report-details-panel') {
            reconciliationState.selectedReportId = null;
            reconciliationState.selectedReport = null;
        }
    }
}

/**
 * Handle upload statement button click
 */
function handleUploadStatementClick() {
    // Reset form
    const form = document.getElementById('statement-upload-form');
    resetForm(form);
    
    // Set default bank account
    if (reconciliationState.selectedBankAccountId) {
        document.getElementById('statement-bank-account').value = reconciliationState.selectedBankAccountId;
    }
    
    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('statement-date-input').value = today;
    
    // Calculate default start/end dates (first/last day of previous month)
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    document.getElementById('statement-start-date').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('statement-end-date').value = lastDayOfLastMonth.toISOString().split('T')[0];
    
    // Show modal
    showModal('upload-statement-modal');
}

/**
 * Handle save statement button click
 */
async function handleSaveStatementClick() {
    const form = document.getElementById('statement-upload-form');
    
    if (!validateForm(form)) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const formData = new FormData();
        
        // Add form fields
        formData.append('bank_account_id', document.getElementById('statement-bank-account').value);
        formData.append('statement_date', document.getElementById('statement-date-input').value);
        formData.append('start_date', document.getElementById('statement-start-date').value);
        formData.append('end_date', document.getElementById('statement-end-date').value);
        formData.append('opening_balance', document.getElementById('statement-opening-balance-input').value);
        formData.append('closing_balance', document.getElementById('statement-closing-balance-input').value);
        formData.append('import_method', document.getElementById('statement-import-method-select').value);
        formData.append('notes', document.getElementById('statement-notes-textarea').value);
        
        // Add file if selected
        const fileInput = document.getElementById('statement-file-input');
        if (fileInput.files.length > 0) {
            formData.append('statement_file', fileInput.files[0]);
        }
        
        // Create statement
        const statement = await createBankStatement(formData);
        
        // Hide modal
        hideModal('upload-statement-modal');
        
        // Reload statements
        loadBankStatements();
        
        showToast('Bank statement uploaded successfully', 'success');
        
        // If file was uploaded, ask if user wants to import transactions
        if (fileInput.files.length > 0) {
            const importConfirm = confirm('Do you want to import transactions from the uploaded file?');
            if (importConfirm) {
                await handleImportTransactionsClick(statement.id);
            }
        }
    } catch (error) {
        console.error('Error saving bank statement:', error);
        showToast(`Error saving bank statement: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle import transactions button click
 * @param {string} statementId - Statement ID
 */
async function handleImportTransactionsClick(statementId) {
    if (reconciliationState.isLoading) return;
    
    const id = statementId || reconciliationState.selectedStatementId;
    
    if (!id) {
        showToast('No statement selected', 'error');
        return;
    }
    
    // Check if statement has a file
    const statement = reconciliationState.selectedStatement;
    if (!statement || !statement.file_path) {
        showToast('No statement file available for import', 'error');
        return;
    }
    
    showLoading();
    
    try {
        // Create form data with statement ID
        const formData = new FormData();
        formData.append('bank_statement_id', id);
        
        // If we have a file path but no file, we need to upload the file again
        if (statement.file_path && !statement.file_name) {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.csv,.ofx,.qfx';
            
            // Wait for file selection
            await new Promise(resolve => {
                fileInput.onchange = () => {
                    if (fileInput.files.length > 0) {
                        formData.append('transaction_file', fileInput.files[0]);
                    }
                    resolve();
                };
                fileInput.click();
            });
            
            if (!formData.has('transaction_file')) {
                throw new Error('No file selected for import');
            }
        }
        
        // Import transactions
        const result = await importTransactions(id, formData);
        
        // Update statement status
        if (statement) {
            statement.status = 'Processed';
        }
        
        // Reload statement transactions
        const transactions = await fetchStatementTransactions(id);
        reconciliationState.statementTransactions = transactions;
        
        // Render updated transactions
        renderStatementTransactions(transactions);
        
        // Reload statements to update status
        loadBankStatements();
        
        showToast(`Imported ${result.inserted} transactions successfully`, 'success');
    } catch (error) {
        console.error('Error importing transactions:', error);
        showToast(`Error importing transactions: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle edit statement button click
 */
function handleEditStatementClick() {
    const statement = reconciliationState.selectedStatement;
    
    if (!statement) {
        showToast('No statement selected', 'error');
        return;
    }
    
    // TODO: Implement edit statement functionality
    showToast('Edit statement functionality not implemented yet', 'info');
}

/**
 * Handle delete statement button click
 */
function handleDeleteStatementClick() {
    const statement = reconciliationState.selectedStatement;
    
    if (!statement) {
        showToast('No statement selected', 'error');
        return;
    }
    
    // Show confirmation modal
    document.getElementById('confirmation-title').textContent = 'Delete Bank Statement';
    document.getElementById('confirmation-message').textContent = 
        `Are you sure you want to delete the bank statement for ${statement.bank_name} - ${statement.account_name} dated ${formatDate(statement.statement_date)}? This action cannot be undone.`;
    
    // Set confirm action
    document.getElementById('btn-confirm-action').onclick = async () => {
        hideModal('confirmation-modal');
        await confirmDeleteStatement(statement.id);
    };
    
    showModal('confirmation-modal');
}

/**
 * Confirm delete statement
 * @param {string} id - Statement ID
 */
async function confirmDeleteStatement(id) {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Delete statement
        await deleteBankStatement(id);
        
        // Hide details panel
        document.getElementById('statement-details-panel').style.display = 'none';
        
        // Reset selected state
        reconciliationState.selectedStatementId = null;
        reconciliationState.selectedStatement = null;
        reconciliationState.statementTransactions = [];
        
        // Reload statements
        loadBankStatements();
        
        showToast('Bank statement deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting bank statement:', error);
        showToast(`Error deleting bank statement: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle start reconciliation button click
 */
function handleStartReconciliationClick() {
    const statement = reconciliationState.selectedStatement;
    
    if (!statement) {
        showToast('No statement selected', 'error');
        return;
    }
    
    // Check if statement is processed
    if (statement.status !== 'Processed') {
        showToast('Statement must be processed before reconciliation', 'warning');
        return;
    }
    
    // Switch to reconciliation workspace tab
    document.querySelector(`.tab-item[data-tab="reconciliation-workspace-tab"]`).click();
    
    // Show new reconciliation modal
    handleNewReconciliationClick(statement.id);
}

/**
 * Handle new reconciliation button click
 * @param {string} statementId - Statement ID
 */
function handleNewReconciliationClick(statementId = null) {
    // Reset form
    const form = document.getElementById('new-reconciliation-form');
    resetForm(form);
    
    // Set default bank account
    if (reconciliationState.selectedBankAccountId) {
        document.getElementById('reconciliation-bank-account').value = reconciliationState.selectedBankAccountId;
        
        // Load statements for selected bank account
        loadBankStatementsForReconciliation(reconciliationState.selectedBankAccountId, statementId);
    }
    
    // Set default reconciliation date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reconciliation-date-input').value = today;
    
    // Show modal
    showModal('new-reconciliation-modal');
}

/**
 * Load bank statements for reconciliation
 * @param {string} bankAccountId - Bank account ID
 * @param {string} selectedStatementId - Pre-selected statement ID
 */
async function loadBankStatementsForReconciliation(bankAccountId, selectedStatementId = null) {
    if (!bankAccountId) return;
    
    try {
        // Fetch statements for bank account
        const result = await fetchBankStatements({ bank_account_id: bankAccountId, status: 'Processed' }, 1);
        
        // Populate statement dropdown
        const statementSelect = document.getElementById('reconciliation-statement');
        statementSelect.innerHTML = '<option value="">Select Statement...</option>';
        
        result.data.forEach(statement => {
            const option = document.createElement('option');
            option.value = statement.id;
            option.textContent = `${formatDate(statement.statement_date)} (${formatCurrency(statement.closing_balance)})`;
            option.dataset.openingBalance = statement.opening_balance;
            option.dataset.closingBalance = statement.closing_balance;
            statementSelect.appendChild(option);
        });
        
        // Set selected statement if provided
        if (selectedStatementId) {
            statementSelect.value = selectedStatementId;
            handleReconciliationStatementChange();
        }
    } catch (error) {
        console.error('Error loading bank statements for reconciliation:', error);
        showToast(`Error loading bank statements: ${error.message}`, 'error');
    }
}

/**
 * Handle reconciliation statement change
 */
function handleReconciliationStatementChange() {
    const statementSelect = document.getElementById('reconciliation-statement');
    const selectedOption = statementSelect.options[statementSelect.selectedIndex];
    
    if (selectedOption && selectedOption.value) {
        // Set statement balance from selected option
        const closingBalance = selectedOption.dataset.closingBalance;
        document.getElementById('reconciliation-statement-balance').value = closingBalance;
        
        // Set book balance to same value initially
        document.getElementById('reconciliation-book-balance').value = closingBalance;
    }
}

/**
 * Handle create reconciliation button click
 */
async function handleCreateReconciliationClick() {
    const form = document.getElementById('new-reconciliation-form');
    
    if (!validateForm(form)) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const bankAccountId = document.getElementById('reconciliation-bank-account').value;
        const bankStatementId = document.getElementById('reconciliation-statement').value;
        const reconciliationDate = document.getElementById('reconciliation-date-input').value;
        const bookBalance = parseFloat(document.getElementById('reconciliation-book-balance').value);
        const statementBalance = parseFloat(document.getElementById('reconciliation-statement-balance').value);
        const notes = document.getElementById('reconciliation-notes-textarea').value;
        
        // Get statement details for start/end balance
        const statementSelect = document.getElementById('reconciliation-statement');
        const selectedOption = statementSelect.options[statementSelect.selectedIndex];
        const startBalance = parseFloat(selectedOption.dataset.openingBalance);
        const endBalance = parseFloat(selectedOption.dataset.closingBalance);
        
        // Calculate difference
        const difference = calculateDifference(statementBalance, bookBalance);
        
        // Create reconciliation
        const reconciliation = await createReconciliation({
            bank_account_id: bankAccountId,
            bank_statement_id: bankStatementId,
            reconciliation_date: reconciliationDate,
            start_balance: startBalance,
            end_balance: endBalance,
            book_balance: bookBalance,
            statement_balance: statementBalance,
            notes
        });
        
        // Hide modal
        hideModal('new-reconciliation-modal');
        
        // Load reconciliation workspace
        reconciliationState.selectedReconciliationId = reconciliation.id;
        loadReconciliationWorkspace(reconciliation.id);
        
        showToast('Reconciliation created successfully', 'success');
    } catch (error) {
        console.error('Error creating reconciliation:', error);
        showToast(`Error creating reconciliation: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle reconciliation selection change
 */
async function handleReconciliationSelectionChange() {
    const reconciliationSelector = document.getElementById('reconciliation-selector');
    const selectedReconciliationId = reconciliationSelector.value;
    
    if (selectedReconciliationId) {
        reconciliationState.selectedReconciliationId = selectedReconciliationId;
        loadReconciliationWorkspace(selectedReconciliationId);
    } else {
        // Hide workspace, show empty state
        document.getElementById('reconciliation-workspace').style.display = 'none';
        document.getElementById('reconciliation-empty-state').style.display = 'flex';
        
        // Reset state
        reconciliationState.selectedReconciliationId = null;
        reconciliationState.activeReconciliation = null;
        reconciliationState.unmatchedBankTransactions = [];
        reconciliationState.unmatchedJournalEntries = [];
        reconciliationState.matchedItems = [];
        reconciliationState.adjustments = [];
    }
}

/**
 * Handle auto-match button click
 */
async function handleAutoMatchClick() {
    if (reconciliationState.isLoading || !reconciliationState.selectedReconciliationId) return;
    
    showLoading();
    
    try {
        // Get auto-match options
        const descriptionMatch = document.getElementById('auto-match-description').checked;
        const dateTolerance = parseInt(document.getElementById('auto-match-date-tolerance').value) || 3;
        
        // Perform auto-matching
        const result = await autoMatchTransactions(reconciliationState.selectedReconciliationId, {
            description_match: descriptionMatch,
            date_tolerance: dateTolerance
        });
        
        // Reload reconciliation workspace
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        
        showToast(`Auto-matched ${result.matches} transactions successfully`, 'success');
    } catch (error) {
        console.error('Error auto-matching transactions:', error);
        showToast(`Error auto-matching transactions: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle add adjustment button click
 */
function handleAddAdjustmentClick() {
    if (!reconciliationState.selectedReconciliationId) {
        showToast('No active reconciliation', 'error');
        return;
    }
    
    // Reset form
    const form = document.getElementById('adjustment-form');
    resetForm(form);
    
    // Clear adjustment ID
    document.getElementById('adjustment-id').value = '';
    
    // Set default date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('adjustment-date').value = today;
    
    // Show modal
    showModal('add-adjustment-modal');
}

/**
 * Handle save adjustment button click
 */
async function handleSaveAdjustmentClick() {
    const form = document.getElementById('adjustment-form');
    
    if (!validateForm(form)) {
        showToast('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const adjustmentId = document.getElementById('adjustment-id').value;
        const adjustmentDate = document.getElementById('adjustment-date').value;
        const description = document.getElementById('adjustment-description').value;
        const adjustmentType = document.getElementById('adjustment-type').value;
        const amount = parseFloat(document.getElementById('adjustment-amount').value);
        
        const adjustmentData = {
            bank_reconciliation_id: reconciliationState.selectedReconciliationId,
            adjustment_date: adjustmentDate,
            description,
            adjustment_type: adjustmentType,
            amount,
            status: 'Pending'
        };
        
        let adjustment;
        
        if (adjustmentId) {
            // Update existing adjustment
            adjustment = await updateAdjustment(adjustmentId, adjustmentData);
        } else {
            // Create new adjustment
            adjustment = await addAdjustment(adjustmentData);
        }
        
        // Hide modal
        hideModal('add-adjustment-modal');
        
        // Reload reconciliation workspace
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        
        showToast(`Adjustment ${adjustmentId ? 'updated' : 'added'} successfully`, 'success');
    } catch (error) {
        console.error('Error saving adjustment:', error);
        showToast(`Error saving adjustment: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle edit adjustment button click
 * @param {string} id - Adjustment ID
 */
function handleEditAdjustmentClick(id) {
    const adjustment = reconciliationState.adjustments.find(adj => adj.id === id);
    
    if (!adjustment) {
        showToast('Adjustment not found', 'error');
        return;
    }
    
    // Reset form
    const form = document.getElementById('adjustment-form');
    resetForm(form);
    
    // Set adjustment values
    document.getElementById('adjustment-id').value = adjustment.id;
    document.getElementById('adjustment-date').value = adjustment.adjustment_date;
    document.getElementById('adjustment-description').value = adjustment.description;
    document.getElementById('adjustment-type').value = adjustment.adjustment_type;
    document.getElementById('adjustment-amount').value = adjustment.amount;
    
    // Show modal
    showModal('add-adjustment-modal');
}

/**
 * Handle delete adjustment button click
 * @param {string} id - Adjustment ID
 */
function handleDeleteAdjustmentClick(id) {
    const adjustment = reconciliationState.adjustments.find(adj => adj.id === id);
    
    if (!adjustment) {
        showToast('Adjustment not found', 'error');
        return;
    }
    
    // Show confirmation modal
    document.getElementById('confirmation-title').textContent = 'Delete Adjustment';
    document.getElementById('confirmation-message').textContent = 
        `Are you sure you want to delete the adjustment "${adjustment.description}" for ${formatCurrency(adjustment.amount)}? This action cannot be undone.`;
    
    // Set confirm action
    document.getElementById('btn-confirm-action').onclick = async () => {
        hideModal('confirmation-modal');
        await confirmDeleteAdjustment(id);
    };
    
    showModal('confirmation-modal');
}

/**
 * Confirm delete adjustment
 * @param {string} id - Adjustment ID
 */
async function confirmDeleteAdjustment(id) {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Delete adjustment
        await deleteAdjustment(id);
        
        // Reload reconciliation workspace
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        
        showToast('Adjustment deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting adjustment:', error);
        showToast(`Error deleting adjustment: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle save reconciliation button click
 */
async function handleSaveReconciliationClick() {
    if (reconciliationState.isLoading || !reconciliationState.selectedReconciliationId) return;
    
    showLoading();
    
    try {
        // Get current reconciliation
        const reconciliation = reconciliationState.activeReconciliation;
        
        if (!reconciliation) {
            throw new Error('No active reconciliation');
        }
        
        // Update reconciliation
        await updateReconciliation(reconciliation.id, {
            status: 'In Progress',
            notes: reconciliation.notes
        });
        
        showToast('Reconciliation saved successfully', 'success');
    } catch (error) {
        console.error('Error saving reconciliation:', error);
        showToast(`Error saving reconciliation: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle view report button click
 */
function handleViewReportClick() {
    if (!reconciliationState.selectedReconciliationId) {
        showToast('No active reconciliation', 'error');
        return;
    }
    
    // Switch to reports tab
    document.querySelector(`.tab-item[data-tab="reconciliation-reports-tab"]`).click();
    
    // Load report
    handleReconciliationRowClick(reconciliationState.selectedReconciliationId);
}

/**
 * Handle complete reconciliation button click
 */
function handleCompleteReconciliationClick() {
    if (!reconciliationState.selectedReconciliationId) {
        showToast('No active reconciliation', 'error');
        return;
    }
    
    const reconciliation = reconciliationState.activeReconciliation;
    
    if (!reconciliation) {
        showToast('No active reconciliation', 'error');
        return;
    }
    
    // Populate summary
    document.getElementById('summary-bank-account').textContent = `${reconciliation.bank_name} - ${reconciliation.account_name}`;
    document.getElementById('summary-statement-date').textContent = formatDate(reconciliation.statement_date);
    document.getElementById('summary-book-balance').textContent = formatCurrency(reconciliation.book_balance);
    document.getElementById('summary-statement-balance').textContent = formatCurrency(reconciliation.statement_balance);
    
    const { formattedDifference, cssClass } = formatDifferenceWithClass(reconciliation.difference);
    document.getElementById('summary-difference').textContent = formattedDifference;
    document.getElementById('summary-difference').className = `info-value difference-amount ${cssClass}`;
    
    // Show warning if difference is not zero
    const differenceWarning = document.getElementById('difference-warning');
    if (Math.abs(reconciliation.difference) > 0.01) {
        differenceWarning.style.display = 'block';
    } else {
        differenceWarning.style.display = 'none';
    }
    
    // Set statistics
    document.getElementById('summary-matched-items').textContent = reconciliationState.matchedItems.length;
    document.getElementById('summary-adjustments').textContent = reconciliationState.adjustments.length;
    
    // Show modal
    showModal('complete-reconciliation-modal');
}

/**
 * Handle confirm complete button click
 */
async function handleConfirmCompleteClick() {
    if (reconciliationState.isLoading || !reconciliationState.selectedReconciliationId) return;
    
    hideModal('complete-reconciliation-modal');
    showLoading();
    
    try {
        // Complete reconciliation
        const result = await completeReconciliation(reconciliationState.selectedReconciliationId);
        
        // Switch to reports tab
        document.querySelector(`.tab-item[data-tab="reconciliation-reports-tab"]`).click();
        
        // Reload reconciliations
        loadReconciliations();
        
        showToast('Reconciliation completed successfully', 'success');
    } catch (error) {
        console.error('Error completing reconciliation:', error);
        showToast(`Error completing reconciliation: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Handle print report button click
 */
function handlePrintReportClick() {
    window.print();
}

/**
 * Handle export PDF button click
 */
function handleExportPDFClick() {
    // TODO: Implement PDF export
    showToast('PDF export functionality not implemented yet', 'info');
}

/**
 * Handle export Excel button click
 */
function handleExportExcelClick() {
    // TODO: Implement Excel export
    showToast('Excel export functionality not implemented yet', 'info');
}

// =============================================
// Drag and Drop Functionality
// =============================================

/**
 * Initialize drag and drop
 */
function initDragAndDrop() {
    // Set up drag and drop event listeners
    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragend', handleDragEnd);
}

/**
 * Handle drag start
 * @param {DragEvent} event - Drag event
 */
function handleDragStart(event) {
    const draggedItem = event.target.closest('.transaction-item');
    
    if (!draggedItem) return;
    
    // Set data transfer
    event.dataTransfer.setData('text/plain', draggedItem.dataset.id);
    event.dataTransfer.setData('application/json', JSON.stringify({
        id: draggedItem.dataset.id,
        type: draggedItem.dataset.type,
        amount: draggedItem.dataset.amount
    }));
    
    // Add dragging class
    draggedItem.classList.add('dragging');
    
    // Set drag image
    const dragImage = draggedItem.cloneNode(true);
    dragImage.style.width = `${draggedItem.offsetWidth}px`;
    dragImage.style.height = `${draggedItem.offsetHeight}px`;
    dragImage.style.opacity = '0.7';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    
    event.dataTransfer.setDragImage(dragImage, 10, 10);
    
    // Remove drag image after drag operation
    setTimeout(() => {
        document.body.removeChild(dragImage);
    }, 0);
}

/**
 * Handle drag over
 * @param {DragEvent} event - Drag event
 */
function handleDragOver(event) {
    // Prevent default to allow drop
    event.preventDefault();
    
    const dropTarget = event.target.closest('.matched-items-container');
    
    if (dropTarget) {
        dropTarget.classList.add('drop-target');
    }
}

/**
 * Handle drag leave
 * @param {DragEvent} event - Drag event
 */
function handleDragLeave(event) {
    const dropTarget = event.target.closest('.matched-items-container');
    
    if (dropTarget && !dropTarget.contains(event.relatedTarget)) {
        dropTarget.classList.remove('drop-target');
    }
}

/**
 * Handle drop
 * @param {DragEvent} event - Drag event
 */
async function handleDrop(event) {
    // Prevent default to allow drop
    event.preventDefault();
    
    const dropTarget = event.target.closest('.matched-items-container');
    
    if (!dropTarget) return;
    
    // Remove drop target class
    dropTarget.classList.remove('drop-target');
    
    try {
        // Get dragged item data
        const data = JSON.parse(event.dataTransfer.getData('application/json'));
        
        if (!data || !data.id || !data.type) return;
        
        // Handle based on item type
        if (data.type === 'bank-transaction') {
            // Find a matching journal entry
            const journalEntries = reconciliationState.unmatchedJournalEntries;
            const matchingEntry = findMatchingJournalEntry(journalEntries, parseFloat(data.amount));
            
            if (matchingEntry) {
                // Match transaction with journal entry
                await manualMatchTransactions(
                    reconciliationState.selectedReconciliationId,
                    data.id,
                    matchingEntry.id
                );
                
                // Reload reconciliation workspace
                await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
                
                showToast('Transaction matched successfully', 'success');
            } else {
                showToast('No matching journal entry found', 'warning');
            }
        } else if (data.type === 'journal-entry') {
            // Find a matching bank transaction
            const bankTransactions = reconciliationState.unmatchedBankTransactions;
            const matchingTransaction = findMatchingBankTransaction(bankTransactions, parseFloat(data.amount));
            
            if (matchingTransaction) {
                // Match journal entry with bank transaction
                await manualMatchTransactions(
                    reconciliationState.selectedReconciliationId,
                    matchingTransaction.id,
                    data.id
                );
                
                // Reload reconciliation workspace
                await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
                
                showToast('Transaction matched successfully', 'success');
            } else {
                showToast('No matching bank transaction found', 'warning');
            }
        }
    } catch (error) {
        console.error('Error handling drop:', error);
        showToast(`Error matching transactions: ${error.message}`, 'error');
    }
}

/**
 * Handle drag end
 * @param {DragEvent} event - Drag event
 */
function handleDragEnd(event) {
    // Remove dragging class from all elements
    document.querySelectorAll('.dragging').forEach(item => {
        item.classList.remove('dragging');
    });
    
    // Remove drop target class from all elements
    document.querySelectorAll('.drop-target').forEach(item => {
        item.classList.remove('drop-target');
    });
}

/**
 * Find matching journal entry for bank transaction
 * @param {Array} journalEntries - Journal entries
 * @param {number} amount - Transaction amount
 * @returns {Object|null} Matching journal entry
 */
function findMatchingJournalEntry(journalEntries, amount) {
    // For bank deposits (positive amount), look for debits
    // For bank withdrawals (negative amount), look for credits
    const isDeposit = amount > 0;
    
    return journalEntries.find(entry => {
        if (isDeposit) {
            return Math.abs(entry.debit - Math.abs(amount)) < 0.01;
        } else {
            return Math.abs(entry.credit - Math.abs(amount)) < 0.01;
        }
    });
}

/**
 * Find matching bank transaction for journal entry
 * @param {Array} bankTransactions - Bank transactions
 * @param {number} amount - Journal entry amount
 * @returns {Object|null} Matching bank transaction
 */
function findMatchingBankTransaction(bankTransactions, amount) {
    // For journal debits, look for bank deposits (positive amount)
    // For journal credits, look for bank withdrawals (negative amount)
    const isDebit = amount > 0;
    
    return bankTransactions.find(transaction => {
        if (isDebit) {
            return transaction.amount > 0 && Math.abs(transaction.amount - Math.abs(amount)) < 0.01;
        } else {
            return transaction.amount < 0 && Math.abs(Math.abs(transaction.amount) - Math.abs(amount)) < 0.01;
        }
    });
}

/**
 * Handle unmatch button click
 * @param {string} id - Match ID
 */
async function handleUnmatchClick(id) {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Unmatch transactions
        await unmatchTransactions(id);
        
        // Reload reconciliation workspace
        await loadReconciliationWorkspace(reconciliationState.selectedReconciliationId);
        
        showToast('Transactions unmatched successfully', 'success');
    } catch (error) {
        console.error('Error unmatching transactions:', error);
        showToast(`Error unmatching transactions: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// =============================================
// Modal Management
// =============================================

/**
 * Show modal
 * @param {string} modalId - Modal ID
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Hide modal
 * @param {string} modalId - Modal ID
 */
function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Initialize modal close buttons
 */
function initModalCloseButtons() {
    document.querySelectorAll('.modal-close-btn').forEach(button => {
        const modalId = button.dataset.modalId;
        if (modalId) {
            button.addEventListener('click', () => hideModal(modalId));
        }
    });
}

// =============================================
// Data Loading Functions
// =============================================

/**
 * Load bank accounts
 */
async function loadBankAccounts() {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Fetch bank accounts
        const bankAccounts = await fetchBankAccounts();
        
        // Populate bank account dropdowns
        populateBankAccountDropdowns(bankAccounts);
        
        hideLoading();
    } catch (error) {
        console.error('Error loading bank accounts:', error);
        showToast(`Error loading bank accounts: ${error.message}`, 'error');
        hideLoading();
    }
}

/**
 * Populate bank account dropdowns
 * @param {Array} bankAccounts - Bank accounts
 */
function populateBankAccountDropdowns(bankAccounts) {
    // Main selector
    const bankAccountSelector = document.getElementById('bank-account-selector');
    bankAccountSelector.innerHTML = '<option value="">Select Bank Account...</option>';
    
    // Statement form selector
    const statementBankAccount = document.getElementById('statement-bank-account');
    statementBankAccount.innerHTML = '<option value="">Select Bank Account...</option>';
    
    // Reconciliation form selector
    const reconciliationBankAccount = document.getElementById('reconciliation-bank-account');
    reconciliationBankAccount.innerHTML = '<option value="">Select Bank Account...</option>';
    
    // Add bank accounts to dropdowns
    bankAccounts.forEach(account => {
        // Main selector
        const option1 = document.createElement('option');
        option1.value = account.id;
        option1.textContent = `${account.bank_name} - ${account.account_name}`;
        bankAccountSelector.appendChild(option1);
        
        // Statement form selector
        const option2 = document.createElement('option');
        option2.value = account.id;
        option2.textContent = `${account.bank_name} - ${account