// src/js/check-printing-core.js
// Check Printing Core Module for Mr. MoneyBags v1.x

// ========================================================
// State Management
// ========================================================
const state = {
    checks: [],
    bankAccounts: [],
    vendors: [],
    journalEntries: [],
    checkFormats: [],
    currentCheck: null,
    printQueue: [],
    currentFormat: null,
    pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    },
    filters: {
        status: '',
        bank_account_id: '',
        payee: '',
        start_date: '',
        end_date: '',
        min_amount: '',
        max_amount: ''
    },
    loading: {
        checks: false,
        bankAccounts: false,
        vendors: false,
        journalEntries: false,
        checkFormats: false,
        checkDetails: false,
        printData: false
    }
};

// ========================================================
// DOM References
// ========================================================
// Tab navigation
const tabItems = document.querySelectorAll('.tab-item');
const tabPanels = document.querySelectorAll('.tab-panel');

// Check register tab
const checksTable = document.getElementById('checks-table');
const checksTableBody = document.getElementById('checks-table-body');
const filterForm = document.getElementById('filter-form');
const filterStatus = document.getElementById('filter-status');
const filterBankAccount = document.getElementById('filter-bank-account');
const filterPayee = document.getElementById('filter-payee');
const filterStartDate = document.getElementById('filter-start-date');
const filterEndDate = document.getElementById('filter-end-date');
const filterMinAmount = document.getElementById('filter-min-amount');
const filterMaxAmount = document.getElementById('filter-max-amount');
const filterApplyBtn = document.getElementById('filter-apply');
const filterResetBtn = document.getElementById('filter-reset');
const paginationContainer = document.getElementById('pagination-container');
const paginationInfo = document.getElementById('pagination-info');
const paginationControls = document.getElementById('pagination-controls');

// New check tab
const checkForm = document.getElementById('check-form');
const checkBankAccount = document.getElementById('check-bank-account');
const checkNumber = document.getElementById('check-number');
const checkDate = document.getElementById('check-date');
const checkPayee = document.getElementById('check-payee');
const checkAmount = document.getElementById('check-amount');
const checkAmountWords = document.getElementById('check-amount-words');
const checkMemo = document.getElementById('check-memo');
const checkStatus = document.getElementById('check-status');
const checkSaveBtn = document.getElementById('check-save');
const checkCancelBtn = document.getElementById('check-cancel');
const checkPreviewBtn = document.getElementById('check-preview');
const checkPrintBtn = document.getElementById('check-print');
const checkVoidBtn = document.getElementById('check-void');
const checkClearBtn = document.getElementById('check-clear');
const checkDeleteBtn = document.getElementById('check-delete');

// Print queue tab
const printQueueTable = document.getElementById('print-queue-table');
const printQueueTableBody = document.getElementById('print-queue-table-body');
const printQueueBankAccount = document.getElementById('print-queue-bank-account');
const printQueueFilter = document.getElementById('print-queue-filter');
const printQueueClearBtn = document.getElementById('print-queue-clear');
const printQueuePrintBtn = document.getElementById('print-queue-print');
const printPreviewContainer = document.getElementById('print-preview-container');

// Check formats tab
const formatsTable = document.getElementById('formats-table');
const formatsTableBody = document.getElementById('formats-table-body');
const formatAddBtn = document.getElementById('format-add');
const formatEditor = document.getElementById('format-editor');
const formatEditorTitle = document.getElementById('format-editor-title');
const formatForm = document.getElementById('format-form');
const formatName = document.getElementById('format-name');
const formatDescription = document.getElementById('format-description');
const formatWidth = document.getElementById('format-width');
const formatHeight = document.getElementById('format-height');
const formatIsDefault = document.getElementById('format-is-default');
const formatSaveBtn = document.getElementById('format-save');
const formatCancelBtn = document.getElementById('format-cancel');
const formatPreviewContainer = document.getElementById('format-preview-container');

// Modals
const checkDetailsModal = document.getElementById('check-details-modal');
const checkDetailsContent = document.getElementById('check-details-content');
const deleteCheckModal = document.getElementById('delete-check-modal');
const deleteCheckName = document.getElementById('delete-check-name');
const deleteCheckConfirm = document.getElementById('delete-check-confirm');
const voidCheckModal = document.getElementById('void-check-modal');
const voidCheckName = document.getElementById('void-check-name');
const voidCheckReason = document.getElementById('void-check-reason');
const voidCheckConfirm = document.getElementById('void-check-confirm');
const clearCheckModal = document.getElementById('clear-check-modal');
const clearCheckName = document.getElementById('clear-check-name');
const clearCheckDate = document.getElementById('clear-check-date');
const clearCheckConfirm = document.getElementById('clear-check-confirm');
const defaultFormatModal = document.getElementById('default-format-modal');
const defaultFormatName = document.getElementById('default-format-name');
const defaultFormatConfirm = document.getElementById('default-format-confirm');

// ========================================================
// API Functions
// ========================================================
// Fetch checks with pagination and filters
async function fetchChecks() {
    try {
        state.loading.checks = true;
        updateUI();
        
        const params = new URLSearchParams();
        params.append('page', state.pagination.page);
        params.append('limit', state.pagination.limit);
        
        // Add filters
        Object.entries(state.filters).forEach(([key, value]) => {
            if (value) params.append(key, value);
        });
        
        const response = await fetch(`/api/checks?${params.toString()}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch checks');
        
        const data = await response.json();
        state.checks = data.checks;
        state.pagination.total = data.total;
        state.pagination.pages = Math.ceil(data.total / state.pagination.limit);
        
        state.loading.checks = false;
        updateUI();
        return data.checks;
    } catch (error) {
        console.error('Error fetching checks:', error);
        state.loading.checks = false;
        updateUI();
        showToast('error', 'Error', 'Failed to load checks');
        return [];
    }
}

// Fetch bank accounts
async function fetchBankAccounts() {
    try {
        state.loading.bankAccounts = true;
        const response = await fetch('/api/bank-accounts', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch bank accounts');
        
        const data = await response.json();
        state.bankAccounts = data;
        
        state.loading.bankAccounts = false;
        updateBankAccountDropdowns();
        return data;
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        state.loading.bankAccounts = false;
        showToast('error', 'Error', 'Failed to load bank accounts');
        return [];
    }
}

// Fetch vendors
async function fetchVendors() {
    try {
        state.loading.vendors = true;
        const response = await fetch('/api/vendors', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch vendors');
        
        const data = await response.json();
        state.vendors = data;
        
        state.loading.vendors = false;
        return data;
    } catch (error) {
        console.error('Error fetching vendors:', error);
        state.loading.vendors = false;
        showToast('error', 'Error', 'Failed to load vendors');
        return [];
    }
}

// Fetch journal entries
async function fetchJournalEntries() {
    try {
        state.loading.journalEntries = true;
        const response = await fetch('/api/journal-entries', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch journal entries');
        
        const data = await response.json();
        state.journalEntries = data;
        
        state.loading.journalEntries = false;
        return data;
    } catch (error) {
        console.error('Error fetching journal entries:', error);
        state.loading.journalEntries = false;
        showToast('error', 'Error', 'Failed to load journal entries');
        return [];
    }
}

// Fetch check formats
async function fetchCheckFormats() {
    try {
        state.loading.checkFormats = true;
        // Use separate endpoint dedicated to check formats (no UUID conflict)
        // Include credentials so session cookies are sent with the request
        const response = await fetch('/api/check-formats', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch check formats');
        
        const data = await response.json();
        state.checkFormats = data;
        
        state.loading.checkFormats = false;
        updateFormatsTable();
        return data;
    } catch (error) {
        console.error('Error fetching check formats:', error);
        state.loading.checkFormats = false;
        showToast('error', 'Error', 'Failed to load check formats');
        return [];
    }
}

// Get check by ID
async function getCheckById(id) {
    try {
        state.loading.checkDetails = true;
        const response = await fetch(`/api/checks/${id}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to fetch check details');
        
        const data = await response.json();
        state.loading.checkDetails = false;
        return data;
    } catch (error) {
        console.error('Error fetching check details:', error);
        state.loading.checkDetails = false;
        showToast('error', 'Error', 'Failed to load check details');
        return null;
    }
}

// Create new check
async function createCheck(checkData) {
    try {
        const response = await fetch('/api/checks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(checkData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create check');
        }
        
        const data = await response.json();
        await fetchChecks();
        return data;
    } catch (error) {
        console.error('Error creating check:', error);
        showToast('error', 'Error', error.message || 'Failed to create check');
        return null;
    }
}

// Update existing check
async function updateCheck(id, checkData) {
    try {
        const response = await fetch(`/api/checks/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(checkData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update check');
        }
        
        const data = await response.json();
        await fetchChecks();
        return data;
    } catch (error) {
        console.error('Error updating check:', error);
        showToast('error', 'Error', error.message || 'Failed to update check');
        return null;
    }
}

// Delete check
async function deleteCheck(id) {
    try {
        const response = await fetch(`/api/checks/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete check');
        }
        
        await fetchChecks();
        return true;
    } catch (error) {
        console.error('Error deleting check:', error);
        showToast('error', 'Error', error.message || 'Failed to delete check');
        return false;
    }
}

// Validate check number
async function validateCheckNumber(bankAccountId, checkNumber, checkId = null) {
    try {
        const params = new URLSearchParams();
        params.append('bank_account_id', bankAccountId);
        params.append('check_number', checkNumber);
        if (checkId) params.append('check_id', checkId);
        
        const response = await fetch(`/api/checks/validate-number?${params.toString()}`, {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Failed to validate check number');
        
        return await response.json();
    } catch (error) {
        console.error('Error validating check number:', error);
        return { is_available: false, message: 'Error validating check number' };
    }
}

// ========================================================
// UI Update Functions
// ========================================================
// Update checks table
function updateChecksTable() {
    if (!checksTableBody) return;
    
    if (state.loading.checks) {
        checksTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="7">Loading checks...</td>
            </tr>
        `;
        return;
    }
    
    if (state.checks.length === 0) {
        checksTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7">No checks found. Try adjusting your filters or create a new check.</td>
            </tr>
        `;
        return;
    }
    
    checksTableBody.innerHTML = state.checks.map(check => `
        <tr data-id="${check.id}">
            <td>${check.check_number}</td>
            <td>${check.bank_account_name}</td>
            <td>${check.date}</td>
            <td>${check.payee}</td>
            <td class="text-right">${formatCurrency(check.amount)}</td>
            <td><span class="status-badge status-${check.status.toLowerCase()}">${check.status}</span></td>
            <td>
                <button class="action-button view-check" data-id="${check.id}">View</button>
                <button class="action-button edit-check" data-id="${check.id}">Edit</button>
            </td>
        </tr>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.view-check').forEach(btn => {
        btn.addEventListener('click', () => viewCheck(btn.dataset.id));
    });
    
    document.querySelectorAll('.edit-check').forEach(btn => {
        btn.addEventListener('click', () => editCheck(btn.dataset.id));
    });
    
    updatePagination();
}

// Update pagination
function updatePagination() {
    if (!paginationInfo || !paginationControls) return;
    
    const { page, limit, total, pages } = state.pagination;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    
    paginationInfo.textContent = total > 0 
        ? `Showing ${start} to ${end} of ${total} checks`
        : 'No checks found';
    
    let paginationHTML = `
        <button class="pagination-button" id="prev-page" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <div class="pagination-pages">
    `;
    
    for (let i = 1; i <= pages; i++) {
        paginationHTML += `
            <button class="pagination-page ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>
        `;
    }
    
    paginationHTML += `
        </div>
        <button class="pagination-button" id="next-page" ${page >= pages ? 'disabled' : ''}>Next</button>
    `;
    
    paginationControls.innerHTML = paginationHTML;
    
    // Add event listeners
    document.getElementById('prev-page')?.addEventListener('click', () => {
        if (state.pagination.page > 1) {
            state.pagination.page--;
            fetchChecks();
        }
    });
    
    document.getElementById('next-page')?.addEventListener('click', () => {
        if (state.pagination.page < state.pagination.pages) {
            state.pagination.page++;
            fetchChecks();
        }
    });
    
    document.querySelectorAll('.pagination-page').forEach(btn => {
        btn.addEventListener('click', () => {
            state.pagination.page = parseInt(btn.dataset.page);
            fetchChecks();
        });
    });
}

// Update bank account dropdowns
function updateBankAccountDropdowns() {
    if (!state.bankAccounts.length) return;
    
    let filterOptions = '<option value="">All Bank Accounts</option>';
    let checkOptions = '<option value="">Select Bank Account</option>';
    let printQueueOptions = '<option value="">All Bank Accounts</option>';
    
    state.bankAccounts.forEach(account => {
        const accountLabel = `${account.bank_name} - ${account.account_name}`;
        
        filterOptions += `<option value="${account.id}">${accountLabel}</option>`;
        
        if (account.status === 'Active') {
            checkOptions += `<option value="${account.id}">${accountLabel}</option>`;
            printQueueOptions += `<option value="${account.id}">${accountLabel}</option>`;
        }
    });
    
    if (filterBankAccount) filterBankAccount.innerHTML = filterOptions;
    if (checkBankAccount) checkBankAccount.innerHTML = checkOptions;
    if (printQueueBankAccount) printQueueBankAccount.innerHTML = printQueueOptions;
}

// Update formats table
function updateFormatsTable() {
    if (!formatsTableBody) return;
    
    if (state.loading.checkFormats) {
        formatsTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="5">Loading check formats...</td>
            </tr>
        `;
        return;
    }
    
    if (state.checkFormats.length === 0) {
        formatsTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="5">No check formats found. Create a new format to get started.</td>
            </tr>
        `;
        return;
    }
    
    formatsTableBody.innerHTML = state.checkFormats.map(format => `
        <tr data-id="${format.id}">
            <td>${format.format_name}</td>
            <td>${format.description || 'N/A'}</td>
            <td>${format.check_width}" × ${format.check_height}"</td>
            <td>${format.is_default ? 'Yes' : 'No'}</td>
            <td>
                <button class="action-button edit-format" data-id="${format.id}">Edit</button>
                ${!format.is_default ? `<button class="action-button set-default-format" data-id="${format.id}">Set Default</button>` : ''}
            </td>
        </tr>
    `).join('');
    
    // Add event listeners
    document.querySelectorAll('.edit-format').forEach(btn => {
        btn.addEventListener('click', () => editFormat(btn.dataset.id));
    });
    
    document.querySelectorAll('.set-default-format').forEach(btn => {
        btn.addEventListener('click', () => confirmSetDefaultFormat(btn.dataset.id));
    });
}

// Update UI based on state
function updateUI() {
    updateChecksTable();
    updatePagination();
}

// ========================================================
// Tab Management
// ========================================================
function switchTab(tabId) {
    tabItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tabId);
    });
    
    tabPanels.forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });
    
    // Special handling for specific tabs
    if (tabId === 'check-register') {
        fetchChecks();
    } else if (tabId === 'print-queue') {
        updatePrintQueue();
    } else if (tabId === 'check-formats') {
        fetchCheckFormats();
    }
}

// ========================================================
// Utility Functions
// ========================================================
function formatCurrency(amount) {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '$0.00';
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// Show toast notification
function showToast(type, title, message, timeout = 4000) {
    const container = document.querySelector('.toast-container') ||
        (() => {
            const c = document.createElement('div');
            c.className = 'toast-container';
            document.body.appendChild(c);
            return c;
        })();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.add('hiding');
        setTimeout(() => container.removeChild(toast), 300);
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.classList.add('hiding');
            setTimeout(() => toast.parentElement && container.removeChild(toast), 300);
        }
    }, timeout);
}

// ========================================================
// Event Listeners
// ========================================================
function initEventListeners() {
    // Tab navigation
    tabItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });
    
    // Filter form
    filterApplyBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        state.filters.status = filterStatus.value;
        state.filters.bank_account_id = filterBankAccount.value;
        state.filters.payee = filterPayee.value;
        state.filters.start_date = filterStartDate.value;
        state.filters.end_date = filterEndDate.value;
        state.filters.min_amount = filterMinAmount.value;
        state.filters.max_amount = filterMaxAmount.value;
        state.pagination.page = 1;
        fetchChecks();
    });
    
    filterResetBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        filterForm.reset();
        Object.keys(state.filters).forEach(key => {
            state.filters[key] = '';
        });
        state.pagination.page = 1;
        fetchChecks();
    });
    
    // Initialize other event listeners in separate functions
    initCheckFormListeners();
    initModalListeners();
}

// Initialize check form listeners
function initCheckFormListeners() {
    // Check amount to words conversion
    checkAmount?.addEventListener('input', () => {
        const amount = parseFloat(checkAmount.value);
        if (!isNaN(amount)) {
            // This would call a function from a separate module
            if (typeof numberToWords === 'function') {
                checkAmountWords.value = numberToWords(amount);
            }
        } else {
            checkAmountWords.value = '';
        }
    });
    
    // Save check
    checkSaveBtn?.addEventListener('click', async (e) => {
        e.preventDefault();
        // This would call a function from a separate module
        if (typeof saveCheck === 'function') {
            await saveCheck();
        }
    });
    
    // Cancel check edit
    checkCancelBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        resetCheckForm();
        switchTab('check-register');
    });
}

// Initialize modal listeners
function initModalListeners() {
    // Close modals when clicking outside content
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });
    
    // Close modal buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) closeModal(modal);
        });
    });
    
    // Delete check confirmation
    deleteCheckConfirm?.addEventListener('click', async () => {
        const checkId = deleteCheckModal.dataset.id;
        if (checkId && await deleteCheck(checkId)) {
            closeModal(deleteCheckModal);
            showToast('success', 'Deleted', 'Check has been deleted successfully.');
            switchTab('check-register');
        }
    });
}

// Open modal
function openModal(modal) {
    if (!modal) return;
    modal.classList.remove('hidden');
}

// Close modal
function closeModal(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
}

// ========================================================
// Initialization
// ========================================================
function init() {
    initEventListeners();
    
    // Load initial data
    Promise.all([
        fetchBankAccounts(),
        fetchVendors(),
        fetchJournalEntries(),
        fetchCheckFormats()
    ]).then(() => {
        // Default to check register tab
        switchTab('check-register');
    });
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for use in other modules
window.checkPrintingCore = {
    state,
    fetchChecks,
    fetchBankAccounts,
    fetchVendors,
    fetchJournalEntries,
    fetchCheckFormats,
    getCheckById,
    createCheck,
    updateCheck,
    deleteCheck,
    validateCheckNumber,
    updateUI,
    switchTab,
    formatCurrency,
    showToast,
    openModal,
    closeModal
};
