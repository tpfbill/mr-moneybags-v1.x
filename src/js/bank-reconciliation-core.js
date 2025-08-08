/**
 * Bank Reconciliation Core Module
 * 
 * Core JavaScript functionality for the bank reconciliation interface
 * Compatible with Mr. MoneyBags v1.x
 * 
 * This module handles:
 * - Bank statement management
 * - Transaction import
 * - Reconciliation workflow
 * - Matching transactions
 */

// =============================================
// Application State
// =============================================
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
    if (!toastContainer) {
        console.error('Toast container not found');
        return;
    }
    
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
                errorMessage = document.createElement('div');
                errorMessage.className = 'error-message';
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
 * Helper to clear a table body and show an empty message
 * @param {HTMLTableSectionElement} tbody 
 * @param {string} message 
 */
function clearTableBody(tbody, message) {
    tbody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = tbody.parentElement.querySelectorAll('th').length || 1;
    td.className = 'empty-table-message';
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
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

// =============================================
// Data Loading and Rendering Functions
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
    if (bankAccountSelector) {
        bankAccountSelector.innerHTML = '<option value="">Select Bank Account...</option>';
    }
    
    // Statement form selector
    const statementBankAccount = document.getElementById('statement-bank-account');
    if (statementBankAccount) {
        statementBankAccount.innerHTML = '<option value="">Select Bank Account...</option>';
    }
    
    // Reconciliation form selector
    const reconciliationBankAccount = document.getElementById('reconciliation-bank-account');
    if (reconciliationBankAccount) {
        reconciliationBankAccount.innerHTML = '<option value="">Select Bank Account...</option>';
    }
    
    // Add bank accounts to dropdowns
    bankAccounts.forEach(account => {
        const accountText = `${account.bank_name} - ${account.account_name}`;
        
        // Main selector
        if (bankAccountSelector) {
            const option1 = document.createElement('option');
            option1.value = account.id;
            option1.textContent = accountText;
            bankAccountSelector.appendChild(option1);
        }
        
        // Statement form selector
        if (statementBankAccount) {
            const option2 = document.createElement('option');
            option2.value = account.id;
            option2.textContent = accountText;
            statementBankAccount.appendChild(option2);
        }
        
        // Reconciliation form selector
        if (reconciliationBankAccount) {
            const option3 = document.createElement('option');
            option3.value = account.id;
            option3.textContent = accountText;
            reconciliationBankAccount.appendChild(option3);
        }
    });
}

/**
 * Load bank statements
 */
async function loadBankStatements() {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Prepare filters
        const filters = {
            ...reconciliationState.statementsFilters
        };
        
        // Add bank account filter if selected
        if (reconciliationState.selectedBankAccountId) {
            filters.bank_account_id = reconciliationState.selectedBankAccountId;
        }
        
        // Fetch statements (10 per page)
        const result = await fetchBankStatements(filters, reconciliationState.statementsPage);
        
        reconciliationState.bankStatements = result.data;
        reconciliationState.statementsTotalPages = result.pagination.pages;
        reconciliationState.statementsPage = result.pagination.page;
        
        renderBankStatements(result.data);
        
        // Update pagination UI
        document.getElementById('statements-current-page').textContent = reconciliationState.statementsPage;
        document.getElementById('statements-total-pages').textContent = reconciliationState.statementsTotalPages;
        document.getElementById('statements-prev-page').disabled = reconciliationState.statementsPage <= 1;
        document.getElementById('statements-next-page').disabled = reconciliationState.statementsPage >= reconciliationState.statementsTotalPages;
    } catch (error) {
        console.error('Error loading bank statements:', error);
        showToast(`Error loading bank statements: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Render Bank Statements table
 * @param {Array} statements - Bank statements
 */
function renderBankStatements(statements) {
    const tbody = document.querySelector('#bank-statements-table tbody');
    if (!tbody) return;
    
    if (!statements || statements.length === 0) {
        clearTableBody(tbody, 'No bank statements found.');
        return;
    }
    
    tbody.innerHTML = '';
    statements.forEach(stmt => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(stmt.statement_date)}</td>
            <td>${stmt.bank_name} - ${stmt.account_name}</td>
            <td>${formatDateRange(stmt.start_date, stmt.end_date)}</td>
            <td>${formatCurrency(stmt.opening_balance)}</td>
            <td>${formatCurrency(stmt.closing_balance)}</td>
            <td>${getStatusBadgeHtml(stmt.status)}</td>
            <td>
                <button class="action-btn view-btn" data-id="${stmt.id}">View</button>
            </td>
        `;
        
        // Add event listener to view button
        const viewBtn = tr.querySelector('.view-btn');
        viewBtn.addEventListener('click', () => handleStatementRowClick(stmt.id));
        
        tbody.appendChild(tr);
    });
}

/**
 * Render statement details
 * @param {Object} statement - Statement details
 * @param {Array} transactions - Statement transactions
 */
function renderStatementDetails(statement, transactions) {
    // Set statement details
    document.getElementById('statement-detail-date').textContent = formatDate(statement.statement_date);
    document.getElementById('statement-detail-account').textContent = `${statement.bank_name} - ${statement.account_name}`;
    document.getElementById('statement-detail-period').textContent = formatDateRange(statement.start_date, statement.end_date);
    document.getElementById('statement-detail-opening').textContent = formatCurrency(statement.opening_balance);
    document.getElementById('statement-detail-closing').textContent = formatCurrency(statement.closing_balance);
    document.getElementById('statement-detail-status').innerHTML = getStatusBadgeHtml(statement.status);
    document.getElementById('statement-detail-notes').textContent = statement.notes || 'No notes';
    
    // Render transactions
    renderStatementTransactions(transactions);
}

/**
 * Render statement transactions
 * @param {Array} transactions - Statement transactions
 */
function renderStatementTransactions(transactions) {
    const tbody = document.querySelector('#statement-transactions-table tbody');
    if (!tbody) return;
    
    if (!transactions || transactions.length === 0) {
        clearTableBody(tbody, 'No transactions found.');
        return;
    }
    
    tbody.innerHTML = '';
    transactions.forEach(tx => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(tx.transaction_date)}</td>
            <td>${tx.description}</td>
            <td>${tx.reference || ''}</td>
            <td class="${tx.amount > 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(tx.amount)}</td>
            <td>${tx.matched ? '<span class="status-badge status-matched">Matched</span>' : ''}</td>
        `;
        
        tbody.appendChild(tr);
    });
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
        if (!statementSelect) return;
        
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
 * Load reconciliations
 */
async function loadReconciliations() {
    if (reconciliationState.isLoading) return;
    
    showLoading();
    
    try {
        // Prepare filters
        const filters = {
            ...reconciliationState.reportsFilters
        };
        
        // Add bank account filter if selected
        if (reconciliationState.selectedBankAccountId) {
            filters.bank_account_id = reconciliationState.selectedBankAccountId;
        }
        
        // Fetch reconciliations (10 per page)
        const result = await fetchReconciliations(filters, reconciliationState.reportsPage);
        
        reconciliationState.reconciliations = result.data;
        reconciliationState.reportsTotalPages = result.pagination.pages;
        reconciliationState.reportsPage = result.pagination.page;
        
        renderReconciliations(result.data);
        
        // Update pagination UI
        const currentPageEl = document.getElementById('reports-current-page');
        const totalPagesEl = document.getElementById('reports-total-pages');
        const prevPageBtn = document.getElementById('reports-prev-page');
        const nextPageBtn = document.getElementById('reports-next-page');
        
        if (currentPageEl) currentPageEl.textContent = reconciliationState.reportsPage;
        if (totalPagesEl) totalPagesEl.textContent = reconciliationState.reportsTotalPages;
        if (prevPageBtn) prevPageBtn.disabled = reconciliationState.reportsPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = reconciliationState.reportsPage >= reconciliationState.reportsTotalPages;
        
        // Update reconciliation selector
        updateReconciliationSelector(result.data);
    } catch (error) {
        console.error('Error loading reconciliations:', error);
        showToast(`Error loading reconciliations: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * Render reconciliations table
 * @param {Array} reconciliations - Reconciliations
 */
function renderReconciliations(reconciliations) {
    const tbody = document.querySelector('#reconciliation-reports-table tbody');
    if (!tbody) return;
    
    if (!reconciliations || reconciliations.length === 0) {
        clearTableBody(tbody, 'No reconciliations found.');
        return;
    }
    
    tbody.innerHTML = '';
    reconciliations.forEach(rec => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(rec.reconciliation_date)}</td>
            <td>${rec.bank_name} - ${rec.account_name}</td>
            <td>${formatDate(rec.statement_date)}</td>
            <td>${formatCurrency(rec.statement_balance)}</td>
            <td>${formatCurrency(rec.book_balance)}</td>
            <td>${getStatusBadgeHtml(rec.status)}</td>
            <td>
                <button class="action-btn view-btn" data-id="${rec.id}">View</button>
            </td>
        `;
        
        // Add event listener to view button
        const viewBtn = tr.querySelector('.view-btn');
        viewBtn.addEventListener('click', () => handleReconciliationRowClick(rec.id));
        
        tbody.appendChild(tr);
    });
}

/**
 * Update reconciliation selector
 * @param {Array} reconciliations - Reconciliations
 */
function updateReconciliationSelector(reconciliations) {
    const selector = document.getElementById('reconciliation-selector');
    if (!selector) return;
    
    // Save current selection
    const currentSelection = selector.value;
    
    // Clear selector
    selector.innerHTML = '<option value="">Select Reconciliation...</option>';
    
    // Add in-progress reconciliations
    const inProgressReconciliations = reconciliations.filter(rec => rec.status === 'In Progress');
    
    if (inProgressReconciliations.length > 0) {
        inProgressReconciliations.forEach(rec => {
            const option = document.createElement('option');
            option.value = rec.id;
            option.textContent = `${formatDate(rec.reconciliation_date)} - ${rec.bank_name} (${formatCurrency(rec.statement_balance)})`;
            selector.appendChild(option);
        });
    }
    
    // Restore selection if possible
    if (currentSelection && Array.from(selector.options).some(opt => opt.value === currentSelection)) {
        selector.value = currentSelection;
    }
}

/**
 * Load reconciliation workspace
 * @param {string} reconciliationId - Reconciliation ID
 */
async function loadReconciliationWorkspace(reconciliationId = null) {
    if (reconciliationState.isLoading) return;
    
    const id = reconciliationId || reconciliationState.selectedReconciliationId;
    
    if (!id) {
        // Hide workspace, show empty state
        document.getElementById('reconciliation-workspace').style.display = 'none';
        document.getElementById('reconciliation-empty-state').style.display = 'flex';
        return;
    }
    
    showLoading();
    
    try {
        // Fetch reconciliation details
        const reconciliation = await fetchReconciliation(id);
        
        if (!reconciliation) {
            throw new Error('Failed to load reconciliation details');
        }
        
        // Fetch unmatched transactions
        const unmatchedResult = await fetchUnmatchedTransactions(
            reconciliation.bank_account_id,
            reconciliation.start_date,
            reconciliation.end_date
        );
        
        // Update state
        reconciliationState.selectedReconciliationId = id;
        reconciliationState.activeReconciliation = reconciliation;
        reconciliationState.unmatchedBankTransactions = unmatchedResult.bank_transactions || [];
        reconciliationState.unmatchedJournalEntries = unmatchedResult.journal_items || [];
        reconciliationState.matchedItems = reconciliation.matched_items || [];
        reconciliationState.adjustments = reconciliation.adjustments || [];
        
        // Show workspace, hide empty state
        document.getElementById('reconciliation-workspace').style.display = 'block';
        document.getElementById('reconciliation-empty-state').style.display = 'none';
        
        // Render workspace
        renderReconciliationWorkspace(reconciliation);
        
        // Update reconciliation selector
        document.getElementById('reconciliation-selector').value = id;
    } catch (error) {
        console.error('Error loading reconciliation workspace:', error);
        showToast(`Error loading reconciliation workspace: ${error.message}`, 'error');
        
        // Hide workspace, show empty state
        document.getElementById('reconciliation-workspace').style.display = 'none';
        document.getElementById('reconciliation-empty-state').style.display = 'flex';
    } finally {
        hideLoading();
    }
}

/**
 * Render reconciliation workspace
 * @param {Object} reconciliation - Reconciliation details
 */
function renderReconciliationWorkspace(reconciliation) {
    // Set reconciliation details
    document.getElementById('workspace-bank-account').textContent = `${reconciliation.bank_name} - ${reconciliation.account_name}`;
    document.getElementById('workspace-statement-date').textContent = formatDate(reconciliation.statement_date);
    document.getElementById('workspace-statement-balance').textContent = formatCurrency(reconciliation.statement_balance);
    document.getElementById('workspace-book-balance').textContent = formatCurrency(reconciliation.book_balance);
    
    const difference = reconciliation.statement_balance - reconciliation.book_balance;
    document.getElementById('workspace-difference').textContent = formatCurrency(difference);
    document.getElementById('workspace-difference').className = 
        difference === 0 ? 'amount-zero' : 
        difference > 0 ? 'amount-positive' : 'amount-negative';
    
    // Render unmatched bank transactions
    renderUnmatchedBankTransactions(reconciliationState.unmatchedBankTransactions);
    
    // Render unmatched journal entries
    renderUnmatchedJournalEntries(reconciliationState.unmatchedJournalEntries);
    
    // Render matched items
    renderMatchedItems(reconciliationState.matchedItems);
    
    // Render adjustments
    renderAdjustments(reconciliationState.adjustments);
}

/**
 * Render unmatched bank transactions
 * @param {Array} transactions - Unmatched bank transactions
 */
function renderUnmatchedBankTransactions(transactions) {
    const container = document.getElementById('unmatched-bank-transactions');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!transactions || transactions.length === 0) {
        container.innerHTML = '<div class="empty-message">No unmatched bank transactions</div>';
        return;
    }
    
    transactions.forEach(tx => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.draggable = true;
        item.dataset.id = tx.id;
        item.dataset.type = 'bank-transaction';
        item.dataset.amount = tx.amount;
        
        item.innerHTML = `
            <div class="transaction-date">${formatDate(tx.transaction_date)}</div>
            <div class="transaction-desc">${tx.description}</div>
            <div class="transaction-amount ${tx.amount > 0 ? 'amount-positive' : 'amount-negative'}">${formatCurrency(tx.amount)}</div>
        `;
        
        container.appendChild(item);
    });
}

/**
 * Render unmatched journal entries
 * @param {Array} entries - Unmatched journal entries
 */
function renderUnmatchedJournalEntries(entries) {
    const container = document.getElementById('unmatched-journal-entries');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!entries || entries.length === 0) {
        container.innerHTML = '<div class="empty-message">No unmatched journal entries</div>';
        return;
    }
    
    entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        item.draggable = true;
        item.dataset.id = entry.id;
        item.dataset.type = 'journal-entry';
        item.dataset.amount = entry.debit > 0 ? entry.debit : -entry.credit;
        
        item.innerHTML = `
            <div class="transaction-date">${formatDate(entry.transaction_date)}</div>
            <div class="transaction-desc">${entry.description}</div>
            <div class="transaction-amount">
                ${entry.debit > 0 ? 
                    `<span class="amount-positive">${formatCurrency(entry.debit)}</span>` : 
                    `<span class="amount-negative">${formatCurrency(-entry.credit)}</span>`}
            </div>
        `;
        
        container.appendChild(item);
    });
}

/**
 * Render matched items
 * @param {Array} matches - Matched items
 */
function renderMatchedItems(matches) {
    const container = document.getElementById('matched-items');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!matches || matches.length === 0) {
        container.innerHTML = '<div class="empty-message">No matched items</div>';
        return;
    }
    
    matches.forEach(match => {
        const item = document.createElement('div');
        item.className = 'match-item';
        
        item.innerHTML = `
            <div class="match-header">
                <div class="match-date">${formatDate(match.match_date)}</div>
                <button class="unmatch-btn" data-id="${match.id}">Unmatch</button>
            </div>
            <div class="match-content">
                <div class="match-bank-transaction">
                    <div class="transaction-date">${formatDate(match.bank_transaction.transaction_date)}</div>
                    <div class="transaction-desc">${match.bank_transaction.description}</div>
                    <div class="transaction-amount ${match.bank_transaction.amount > 0 ? 'amount-positive' : 'amount-negative'}">
                        ${formatCurrency(match.bank_transaction.amount)}
                    </div>
                </div>
                <div class="match-separator">⟷</div>
                <div class="match-journal-entry">
                    <div class="transaction-date">${formatDate(match.journal_entry.transaction_date)}</div>
                    <div class="transaction-desc">${match.journal_entry.description}</div>
                    <div class="transaction-amount">
                        ${match.journal_entry.debit > 0 ? 
                            `<span class="amount-positive">${formatCurrency(match.journal_entry.debit)}</span>` : 
                            `<span class="amount-negative">${formatCurrency(-match.journal_entry.credit)}</span>`}
                    </div>
                </div>
            </div>
        `;
        
        // Add event listener to unmatch button
        const unmatchBtn = item.querySelector('.unmatch-btn');
        unmatchBtn.addEventListener('click', () => handleUnmatchClick(match.id));
        
        container.appendChild(item);
    });
}

/**
 * Render adjustments
 * @param {Array} adjustments - Reconciliation adjustments
 */
function renderAdjustments(adjustments) {
    const container = document.getElementById('adjustments-list');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!adjustments || adjustments.length === 0) {
        container.innerHTML = '<div class="empty-message">No adjustments</div>';
        return;
    }
    
    adjustments.forEach(adj => {
        const item = document.createElement('div');
        item.className = 'adjustment-item';
        
        item.innerHTML = `
            <div class="adjustment-header">
                <div class="adjustment-date">${formatDate(adj.adjustment_date)}</div>
                <div class="adjustment-actions">
                    <button class="edit-btn" data-id="${adj.id}">Edit</button>
                    <button class="delete-btn" data-id="${adj.id}">Delete</button>
                </div>
            </div>
            <div class="adjustment-content">
                <div class="adjustment-desc">${adj.description}</div>
                <div class="adjustment-type">${adj.adjustment_type}</div>
                <div class="adjustment-amount ${adj.amount > 0 ? 'amount-positive' : 'amount-negative'}">
                    ${formatCurrency(adj.amount)}
                </div>
            </div>
        `;
        
        // Add event listeners to buttons
        const editBtn = item.querySelector('.edit-btn');
        editBtn.addEventListener('click', () => handleEditAdjustmentClick(adj.id));
        
        const deleteBtn = item.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => handleDeleteAdjustmentClick(adj.id));
        
        container.appendChild(item);
    });
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
// Stub / Missing Helper Handlers
// =============================================

/**
 * Fetch reconciliation by ID
 * (Light-weight helper mirroring other fetch* utilities used above)
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function fetchReconciliation(id) {
    try {
        const response = await fetch(`/api/bank-reconciliation/reconciliations/${id}`);
        if (!response.ok) {
            throw new Error(`Failed: ${response.status}`);
        }
        return await response.json();
    } catch (err) {
        console.error('Error fetching reconciliation:', err);
        showToast(`Error loading reconciliation: ${err.message}`, 'error');
        return null;
    }
}

/**
 * Handle click on reconciliation row (opens report panel)
 */
function handleReconciliationRowClick(id) {
    // For now just select the reconciliation and show toast.
    reconciliationState.selectedReportId = id;
    showToast('Reconciliation report view not yet implemented', 'info');
}

function handleEditAdjustmentClick(id) {
    showToast(`Edit adjustment (${id}) not implemented`, 'info');
}

function handleDeleteAdjustmentClick(id) {
    showToast(`Delete adjustment (${id}) not implemented`, 'info');
}

function handleEditStatementClick() {
    showToast('Edit statement not implemented', 'info');
}

function handleDeleteStatementClick() {
    showToast('Delete statement not implemented', 'info');
}

function handleAddAdjustmentClick() {
    showToast('Add adjustment not implemented', 'info');
}

function handleSaveAdjustmentClick() {
    showToast('Save adjustment not implemented', 'info');
}

function handleReportFilter() {
    showToast('Report filter not implemented', 'info');
}

function handleReportFilterReset() {
    showToast('Reset report filters not implemented', 'info');
}

function handleReconciliationSelectionChange() {
    showToast('Reconciliation selector change not handled yet', 'info');
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
        const modalId = button.closest('.modal').id;
        if (modalId) {
            button.addEventListener('click', () => hideModal(modalId));
        }
    });
}

// =============================================
// Initialization
// =============================================

/**
 * Initialize bank reconciliation page
 */
function initBankReconciliationPage() {
    // Load bank accounts dropdowns
    loadBankAccounts();

    // Bank account selector change
    const bankAccountSelector = document.getElementById('bank-account-selector');
    if (bankAccountSelector) {
        bankAccountSelector.addEventListener('change', handleBankAccountChange);
    }

    // Tabs
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', handleTabClick);
    });

    // Statement filters
    document.getElementById('btn-filter-statements')?.addEventListener('click', handleStatementFilter);
    document.getElementById('btn-reset-statement-filters')?.addEventListener('click', handleStatementFilterReset);

    // Pagination buttons
    document.getElementById('statements-prev-page')?.addEventListener('click', () => handleStatementPagination('prev'));
    document.getElementById('statements-next-page')?.addEventListener('click', () => handleStatementPagination('next'));

    // Upload statement
    document.getElementById('btn-upload-statement')?.addEventListener('click', handleUploadStatementClick);
    document.getElementById('btn-save-statement')?.addEventListener('click', handleSaveStatementClick);

    // New reconciliation
    document.getElementById('btn-new-reconciliation')?.addEventListener('click', handleNewReconciliationClick);
    document.getElementById('reconciliation-statement')?.addEventListener('change', handleReconciliationStatementChange);
    document.getElementById('btn-create-reconciliation')?.addEventListener('click', handleCreateReconciliationClick);

    // Reconciliation selector
    document.getElementById('reconciliation-selector')?.addEventListener('change', handleReconciliationSelectionChange);

    // Auto-match
    document.getElementById('btn-auto-match')?.addEventListener('click', handleAutoMatchClick);

    // Reports tab filters
    document.getElementById('btn-filter-reports')?.addEventListener('click', handleReportFilter);
    document.getElementById('btn-reset-report-filters')?.addEventListener('click', handleReportFilterReset);

    // Adjustment buttons
    document.getElementById('btn-add-adjustment')?.addEventListener('click', handleAddAdjustmentClick);
    document.getElementById('btn-save-adjustment')?.addEventListener('click', handleSaveAdjustmentClick);

    // Statement edit/delete
    document.getElementById('btn-edit-statement')?.addEventListener('click', handleEditStatementClick);
    document.getElementById('btn-delete-statement')?.addEventListener('click', handleDeleteStatementClick);

    // Close detail panels
    document.querySelectorAll('.close-panel-btn').forEach(btn => 
        btn.addEventListener('click', handleClosePanelClick));

    // Init modal close buttons
    initModalCloseButtons();

    // Drag & drop initialization
    initDragAndDrop();

    // Default load of statements
    loadBankStatements();
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', initBankReconciliationPage);
