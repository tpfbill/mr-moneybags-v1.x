// src/js/bank-deposits.js
// Bank Deposits Module for Mr. MoneyBags v1.x

// ========================================================
// State Management
// ========================================================
const state = {
    deposits: [],
    bankAccounts: [],
    glAccounts: [],
    depositTypes: [],
    itemTypes: [],
    currentDeposit: null,
    currentDepositItems: [],
    editingItem: null,
    pagination: {
        page: 1,
        limit: 10,
        total: 0,
        pages: 0
    },
    filters: {
        status: '',
        bank_account_id: '',
        start_date: '',
        end_date: '',
        deposit_type: ''
    },
    loading: {
        deposits: false,
        bankAccounts: false,
        glAccounts: false,
        depositTypes: false,
        itemTypes: false,
        depositDetails: false,
        depositSlip: false
    }
};

// ========================================================
// DOM References
// ========================================================
// Tab navigation
const tabItems = document.querySelectorAll('.tab-item');
const tabPanels = document.querySelectorAll('.tab-panel');

// Deposits list tab
const depositsTable = document.getElementById('deposits-table');
const depositsTableBody = depositsTable.querySelector('tbody');
const filterStatus = document.getElementById('filter-status');
const filterBankAccount = document.getElementById('filter-bank-account');
const filterDepositType = document.getElementById('filter-deposit-type');
const filterDateStart = document.getElementById('filter-date-start');
const filterDateEnd = document.getElementById('filter-date-end');
const applyFiltersBtn = document.getElementById('apply-filters-btn');
const clearFiltersBtn = document.getElementById('clear-filters-btn');
const paginationStart = document.getElementById('pagination-start');
const paginationEnd = document.getElementById('pagination-end');
const paginationTotal = document.getElementById('pagination-total');
const paginationPrev = document.getElementById('pagination-prev');
const paginationNext = document.getElementById('pagination-next');
const paginationPages = document.getElementById('pagination-pages');

// New deposit tab
const depositForm = document.querySelector('.deposit-form');
const depositBankAccount = document.getElementById('deposit-bank-account');
const depositDate = document.getElementById('deposit-date');
const depositType = document.getElementById('deposit-type');
const depositReference = document.getElementById('deposit-reference');
const depositDescription = document.getElementById('deposit-description');
const depositMemo = document.getElementById('deposit-memo');
const depositItemsTable = document.getElementById('deposit-items-table');
const depositItemsTableBody = depositItemsTable.querySelector('tbody');
const depositTotal = document.getElementById('deposit-total');
const addItemBtn = document.getElementById('add-item-btn');
const saveDraftBtn = document.getElementById('save-draft-btn');
const submitDepositBtn = document.getElementById('submit-deposit-btn');
const cancelDepositBtn = document.getElementById('cancel-deposit-btn');

// Deposit slip tab
const depositSlipSelect = document.getElementById('deposit-slip-select');
const printDepositSlipBtn = document.getElementById('print-deposit-slip-btn');
const slipDate = document.getElementById('slip-date');
const slipAccountName = document.getElementById('slip-account-name');
const slipAccountNumber = document.getElementById('slip-account-number');
const slipBankName = document.getElementById('slip-bank-name');
const slipOrganization = document.getElementById('slip-organization');
const slipReference = document.getElementById('slip-reference');
const slipCashTotal = document.getElementById('slip-cash-total');
const slipChecksBody = document.getElementById('slip-checks-body');
const slipChecksTotal = document.getElementById('slip-checks-total');
const slipSummaryCash = document.getElementById('slip-summary-cash');
const slipSummaryChecks = document.getElementById('slip-summary-checks');
const slipSummaryOther = document.getElementById('slip-summary-other');
const slipSummaryTotal = document.getElementById('slip-summary-total');
const slipPreparedBy = document.getElementById('slip-prepared-by');
const slipPreparedDate = document.getElementById('slip-prepared-date');

// Add item modal
const addItemModal = document.getElementById('add-item-modal');
const addItemForm = document.getElementById('add-item-form');
const itemType = document.getElementById('item-type');
const itemAmount = document.getElementById('item-amount');
const itemCheckNumber = document.getElementById('item-check-number');
const itemCheckDate = document.getElementById('item-check-date');
const itemPayer = document.getElementById('item-payer');
const itemGlAccount = document.getElementById('item-gl-account');
const itemDescription = document.getElementById('item-description');
const checkFields = document.getElementById('check-fields');
const addItemSubmitBtn = document.getElementById('add-item-submit-btn');

// View deposit modal
const viewDepositModal = document.getElementById('view-deposit-modal');
const viewBankAccount = document.getElementById('view-bank-account');
const viewDepositDate = document.getElementById('view-deposit-date');
const viewDepositType = document.getElementById('view-deposit-type');
const viewReference = document.getElementById('view-reference');
const viewStatus = document.getElementById('view-status');
const viewTotalAmount = document.getElementById('view-total-amount');
const viewDescription = document.getElementById('view-description');
const viewMemo = document.getElementById('view-memo');
const viewItemsTable = document.getElementById('view-items-table');
const viewItemsTableBody = viewItemsTable.querySelector('tbody');
const viewDepositTotal = document.getElementById('view-deposit-total');
const viewCreatedBy = document.getElementById('view-created-by');
const viewCreatedDate = document.getElementById('view-created-date');
const viewSubmittedBy = document.getElementById('view-submitted-by');
const viewSubmittedDate = document.getElementById('view-submitted-date');
const viewClearedBy = document.getElementById('view-cleared-by');
const viewClearedDate = document.getElementById('view-cleared-date');
const viewPrintSlipBtn = document.getElementById('view-print-slip-btn');
const viewEditBtn = document.getElementById('view-edit-btn');

// Clear deposit modal
const clearDepositModal = document.getElementById('clear-deposit-modal');
const clearDepositForm = document.getElementById('clear-deposit-form');
const clearDepositId = document.getElementById('clear-deposit-id');
const clearingDate = document.getElementById('clearing-date');
const clearingReference = document.getElementById('clearing-reference');
const confirmClearBtn = document.getElementById('confirm-clear-btn');

// Delete confirmation modal
const deleteConfirmModal = document.getElementById('delete-confirm-modal');
const deleteDate = document.getElementById('delete-date');
const deleteReference = document.getElementById('delete-reference');
const deleteAmount = document.getElementById('delete-amount');
const confirmDeleteBtn = document.getElementById('confirm-delete-btn');

// Other buttons
const refreshDepositsBtn = document.getElementById('refresh-deposits-btn');
const newDepositBtn = document.getElementById('new-deposit-btn');

// ========================================================
// Event Listeners
// ========================================================
// Initialize event listeners
function initEventListeners() {
    // Tab navigation
    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabId = item.getAttribute('data-tab');
            switchTab(tabId);
        });
    });

    // Deposits list tab
    applyFiltersBtn.addEventListener('click', applyFilters);
    clearFiltersBtn.addEventListener('click', clearFilters);
    paginationPrev.addEventListener('click', () => changePage(state.pagination.page - 1));
    paginationNext.addEventListener('click', () => changePage(state.pagination.page + 1));
    refreshDepositsBtn.addEventListener('click', refreshDeposits);
    newDepositBtn.addEventListener('click', () => switchTab('new-deposit'));

    // New deposit tab
    depositDate.valueAsDate = new Date();
    addItemBtn.addEventListener('click', openAddItemModal);
    saveDraftBtn.addEventListener('click', saveDepositAsDraft);
    submitDepositBtn.addEventListener('click', submitDeposit);
    cancelDepositBtn.addEventListener('click', cancelDeposit);

    // Deposit slip tab
    depositSlipSelect.addEventListener('change', loadDepositSlip);
    printDepositSlipBtn.addEventListener('click', printDepositSlip);

    // Add item modal
    itemType.addEventListener('change', toggleCheckFields);
    addItemForm.addEventListener('submit', (e) => e.preventDefault());
    addItemSubmitBtn.addEventListener('click', addDepositItem);

    // View deposit modal
    viewPrintSlipBtn.addEventListener('click', () => {
        closeModal(viewDepositModal);
        switchTab('deposit-slip');
        depositSlipSelect.value = state.currentDeposit.id;
        loadDepositSlip();
    });
    viewEditBtn.addEventListener('click', () => {
        closeModal(viewDepositModal);
        editDeposit(state.currentDeposit);
    });

    // Clear deposit modal
    clearDepositForm.addEventListener('submit', (e) => e.preventDefault());
    confirmClearBtn.addEventListener('click', clearDeposit);

    // Delete confirmation modal
    confirmDeleteBtn.addEventListener('click', deleteDeposit);

    // Close modals
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-modal-id');
            closeModal(document.getElementById(modalId));
        });
    });
}

// ========================================================
// API Functions
// ========================================================
// Fetch deposits with pagination and filters
async function fetchDeposits() {
    try {
        state.loading.deposits = true;
        updateDepositsTable();

        const queryParams = new URLSearchParams({
            page: state.pagination.page,
            limit: state.pagination.limit,
            ...Object.fromEntries(
                Object.entries(state.filters).filter(([_, v]) => v !== '')
            )
        });

        const response = await fetch(`/api/bank-deposits?${queryParams}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch deposits: ${response.status}`);
        }

        const data = await response.json();
        state.deposits = data.data;
        state.pagination = data.pagination;

        updateDepositsTable();
        updatePagination();
        updateDepositSlipSelect();
    } catch (error) {
        console.error('Error fetching deposits:', error);
        showToast('error', 'Error', 'Failed to load deposits. Please try again.');
    } finally {
        state.loading.deposits = false;
    }
}

// Fetch bank accounts
async function fetchBankAccounts() {
    try {
        state.loading.bankAccounts = true;

        const response = await fetch('/api/bank-accounts', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch bank accounts: ${response.status}`);
        }

        const data = await response.json();
        state.bankAccounts = data;

        updateBankAccountDropdowns();
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        showToast('error', 'Error', 'Failed to load bank accounts. Please try again.');
    } finally {
        state.loading.bankAccounts = false;
    }
}

// Fetch GL accounts
async function fetchGLAccounts() {
    try {
        state.loading.glAccounts = true;

        const response = await fetch('/api/accounts?type=Asset,Revenue', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch GL accounts: ${response.status}`);
        }

        const data = await response.json();
        state.glAccounts = data;

        updateGLAccountDropdowns();
    } catch (error) {
        console.error('Error fetching GL accounts:', error);
        showToast('error', 'Error', 'Failed to load GL accounts. Please try again.');
    } finally {
        state.loading.glAccounts = false;
    }
}

// Fetch deposit types
async function fetchDepositTypes() {
    try {
        state.loading.depositTypes = true;

        const response = await fetch('/api/bank-deposits/types', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch deposit types: ${response.status}`);
        }

        const data = await response.json();
        state.depositTypes = data;
    } catch (error) {
        console.error('Error fetching deposit types:', error);
        // Use default types from HTML
    } finally {
        state.loading.depositTypes = false;
    }
}

// Fetch item types
async function fetchItemTypes() {
    try {
        state.loading.itemTypes = true;

        const response = await fetch('/api/bank-deposits/item-types', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch item types: ${response.status}`);
        }

        const data = await response.json();
        state.itemTypes = data;
    } catch (error) {
        console.error('Error fetching item types:', error);
        // Use default types from HTML
    } finally {
        state.loading.itemTypes = false;
    }
}

// Fetch deposit details
async function fetchDepositDetails(depositId) {
    try {
        state.loading.depositDetails = true;

        const response = await fetch(`/api/bank-deposits/${depositId}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch deposit details: ${response.status}`);
        }

        const data = await response.json();
        state.currentDeposit = data;
        state.currentDepositItems = data.items || [];

        return data;
    } catch (error) {
        console.error('Error fetching deposit details:', error);
        showToast('error', 'Error', 'Failed to load deposit details. Please try again.');
        return null;
    } finally {
        state.loading.depositDetails = false;
    }
}

// Fetch deposit slip data
async function fetchDepositSlip(depositId) {
    try {
        state.loading.depositSlip = true;

        const response = await fetch(`/api/bank-deposits/slip/${depositId}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch deposit slip: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching deposit slip:', error);
        showToast('error', 'Error', 'Failed to load deposit slip. Please try again.');
        return null;
    } finally {
        state.loading.depositSlip = false;
    }
}

// Create new deposit
async function createDeposit(depositData) {
    try {
        const response = await fetch('/api/bank-deposits', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(depositData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to create deposit: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating deposit:', error);
        showToast('error', 'Error', error.message || 'Failed to create deposit. Please try again.');
        return null;
    }
}

// Update deposit
async function updateDepositAPI(depositId, depositData) {
    try {
        const response = await fetch(`/api/bank-deposits/${depositId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(depositData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update deposit: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating deposit:', error);
        showToast('error', 'Error', error.message || 'Failed to update deposit. Please try again.');
        return null;
    }
}

// Delete deposit
async function deleteDepositAPI(depositId) {
    try {
        const response = await fetch(`/api/bank-deposits/${depositId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete deposit: ${response.status}`);
        }

        return true;
    } catch (error) {
        console.error('Error deleting deposit:', error);
        showToast('error', 'Error', error.message || 'Failed to delete deposit. Please try again.');
        return false;
    }
}

// Add deposit items
async function addDepositItemsAPI(depositId, items) {
    try {
        const response = await fetch(`/api/bank-deposits/${depositId}/items`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(items)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to add deposit items: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error adding deposit items:', error);
        showToast('error', 'Error', error.message || 'Failed to add deposit items. Please try again.');
        return null;
    }
}

// Update deposit item
async function updateDepositItemAPI(itemId, itemData) {
    try {
        const response = await fetch(`/api/bank-deposits/items/${itemId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(itemData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to update deposit item: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating deposit item:', error);
        showToast('error', 'Error', error.message || 'Failed to update deposit item. Please try again.');
        return null;
    }
}

// Delete deposit item
async function deleteDepositItemAPI(itemId) {
    try {
        const response = await fetch(`/api/bank-deposits/items/${itemId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to delete deposit item: ${response.status}`);
        }

        return true;
    } catch (error) {
        console.error('Error deleting deposit item:', error);
        showToast('error', 'Error', error.message || 'Failed to delete deposit item. Please try again.');
        return false;
    }
}

// Submit deposit
async function submitDepositAPI(depositId) {
    try {
        const response = await fetch(`/api/bank-deposits/${depositId}/submit`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to submit deposit: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error submitting deposit:', error);
        showToast('error', 'Error', error.message || 'Failed to submit deposit. Please try again.');
        return null;
    }
}

// Clear deposit
async function clearDepositAPI(depositId, clearingData) {
    try {
        const response = await fetch(`/api/bank-deposits/${depositId}/clear`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(clearingData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Failed to clear deposit: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error clearing deposit:', error);
        showToast('error', 'Error', error.message || 'Failed to clear deposit. Please try again.');
        return null;
    }
}

// ========================================================
// UI Update Functions
// ========================================================
// Switch tabs
function switchTab(tabId) {
    tabItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    tabPanels.forEach(panel => {
        if (panel.id === tabId) {
            panel.classList.add('active');
            
            // Load data specific to the tab
            if (tabId === 'deposits-list') {
                if (state.deposits.length === 0) {
                    fetchDeposits();
                }
            } else if (tabId === 'new-deposit') {
                resetNewDepositForm();
            }
        } else {
            panel.classList.remove('active');
        }
    });
}

// Update deposits table
function updateDepositsTable() {
    if (state.loading.deposits) {
        depositsTableBody.innerHTML = `
            <tr class="loading-row">
                <td colspan="9" class="text-center">Loading deposits...</td>
            </tr>
        `;
        return;
    }

    if (state.deposits.length === 0) {
        depositsTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9" class="text-center">No deposits found. Try clearing filters or create a new deposit.</td>
            </tr>
        `;
        return;
    }

    depositsTableBody.innerHTML = state.deposits.map(deposit => {
        const statusClass = `status-${deposit.status.toLowerCase()}`;
        const formattedDate = new Date(deposit.deposit_date).toLocaleDateString();
        const formattedAmount = formatCurrency(deposit.total_amount);
        
        return `
            <tr data-id="${deposit.id}">
                <td>${formattedDate}</td>
                <td>${deposit.deposit_type}</td>
                <td>${deposit.bank_name ? `${deposit.bank_name} - ${deposit.account_name}` : 'Unknown'}</td>
                <td>${deposit.reference_number || '-'}</td>
                <td>${deposit.description || '-'}</td>
                <td>${deposit.item_count || 0}</td>
                <td>${formattedAmount}</td>
                <td><span class="status-badge ${statusClass}">${deposit.status}</span></td>
                <td>
                    <button class="action-button" onclick="viewDeposit('${deposit.id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${deposit.status === 'Draft' ? `
                        <button class="action-button" onclick="editDeposit(${JSON.stringify(deposit).replace(/"/g, '&quot;')})">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="action-button" onclick="confirmDeleteDeposit(${JSON.stringify(deposit).replace(/"/g, '&quot;')})">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                    ${deposit.status === 'Submitted' ? `
                        <button class="action-button" onclick="openClearDepositModal('${deposit.id}')">
                            <i class="bi bi-check-circle"></i>
                        </button>
                    ` : ''}
                </td>
            </tr>
        `;
    }).join('');
}

// Update pagination
function updatePagination() {
    const { page, limit, total, pages } = state.pagination;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    paginationStart.textContent = total > 0 ? start : 0;
    paginationEnd.textContent = end;
    paginationTotal.textContent = total;

    paginationPrev.disabled = page <= 1;
    paginationNext.disabled = page >= pages;

    // Generate page buttons
    paginationPages.innerHTML = '';
    
    // Determine range of pages to show
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(pages, startPage + 4);
    
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    // Add first page if not in range
    if (startPage > 1) {
        const pageBtn = document.createElement('button');
        pageBtn.className = 'pagination-page';
        pageBtn.textContent = 1;
        pageBtn.addEventListener('click', () => changePage(1));
        paginationPages.appendChild(pageBtn);

        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationPages.appendChild(ellipsis);
        }
    }

    // Add page buttons in range
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `pagination-page ${i === page ? 'active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => changePage(i));
        paginationPages.appendChild(pageBtn);
    }

    // Add last page if not in range
    if (endPage < pages) {
        if (endPage < pages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationPages.appendChild(ellipsis);
        }

        const pageBtn = document.createElement('button');
        pageBtn.className = 'pagination-page';
        pageBtn.textContent = pages;
        pageBtn.addEventListener('click', () => changePage(pages));
        paginationPages.appendChild(pageBtn);
    }
}

// Update bank account dropdowns
function updateBankAccountDropdowns() {
    // Filter dropdown
    let filterOptions = '<option value="">All Bank Accounts</option>';
    
    // New deposit dropdown
    let depositOptions = '<option value="">Select Bank Account</option>';
    
    state.bankAccounts.forEach(account => {
        const accountLabel = `${account.bank_name} - ${account.account_name}`;
        
        filterOptions += `<option value="${account.id}">${accountLabel}</option>`;
        
        if (account.status === 'Active') {
            depositOptions += `<option value="${account.id}">${accountLabel}</option>`;
        }
    });
    
    filterBankAccount.innerHTML = filterOptions;
    depositBankAccount.innerHTML = depositOptions;
}

// Update GL account dropdowns
function updateGLAccountDropdowns() {
    let options = '<option value="">Select GL Account</option>';
    
    // Sort accounts by code
    const sortedAccounts = [...state.glAccounts].sort((a, b) => {
        return a.code.localeCompare(b.code);
    });
    
    sortedAccounts.forEach(account => {
        if (account.status === 'Active') {
            options += `<option value="${account.id}">${account.code} - ${account.name}</option>`;
        }
    });
    
    itemGlAccount.innerHTML = options;
}

// Update deposit slip select
function updateDepositSlipSelect() {
    let options = '<option value="">Select a deposit to view slip</option>';
    
    state.deposits.forEach(deposit => {
        const formattedDate = new Date(deposit.deposit_date).toLocaleDateString();
        const label = `${formattedDate} - ${deposit.reference_number || 'No Ref'} - ${formatCurrency(deposit.total_amount)}`;
        
        options += `<option value="${deposit.id}">${label}</option>`;
    });
    
    depositSlipSelect.innerHTML = options;
}

// Update deposit items table
function updateDepositItemsTable() {
    if (state.currentDepositItems.length === 0) {
        depositItemsTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="8" class="text-center">No items added. Click "Add Item" to begin.</td>
            </tr>
        `;
        depositTotal.textContent = formatCurrency(0);
        return;
    }

    let total = 0;
    
    depositItemsTableBody.innerHTML = state.currentDepositItems.map(item => {
        const amount = parseFloat(item.amount);
        total += amount;
        
        const formattedAmount = formatCurrency(amount);
        const formattedCheckDate = item.check_date ? new Date(item.check_date).toLocaleDateString() : '-';
        
        // Find GL account name
        let glAccountName = 'Unknown Account';
        const glAccount = state.glAccounts.find(acc => acc.id === item.gl_account_id);
        if (glAccount) {
            glAccountName = `${glAccount.code} - ${glAccount.name}`;
        }
        
        return `
            <tr data-id="${item.id || item.tempId}">
                <td>${item.item_type}</td>
                <td>${formattedAmount}</td>
                <td>${item.check_number || '-'}</td>
                <td>${formattedCheckDate}</td>
                <td>${item.payer_name || '-'}</td>
                <td>${glAccountName}</td>
                <td>${item.description || '-'}</td>
                <td>
                    <button class="action-button" onclick="editDepositItem(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="action-button" onclick="removeDepositItem('${item.id || item.tempId}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    depositTotal.textContent = formatCurrency(total);
}

// Update view deposit modal
function updateViewDepositModal(deposit) {
    if (!deposit) return;
    
    // Basic deposit info
    viewBankAccount.textContent = deposit.bank_name ? `${deposit.bank_name} - ${deposit.account_name}` : 'Unknown';
    viewDepositDate.textContent = new Date(deposit.deposit_date).toLocaleDateString();
    viewDepositType.textContent = deposit.deposit_type;
    viewReference.textContent = deposit.reference_number || '-';
    viewStatus.textContent = deposit.status;
    viewStatus.className = `detail-value status-badge status-${deposit.status.toLowerCase()}`;
    viewTotalAmount.textContent = formatCurrency(deposit.total_amount);
    viewDescription.textContent = deposit.description || '-';
    viewMemo.textContent = deposit.memo || '-';
    
    // Audit info
    viewCreatedBy.textContent = deposit.created_by_name || '-';
    viewCreatedDate.textContent = deposit.created_at ? new Date(deposit.created_at).toLocaleString() : '-';
    viewSubmittedBy.textContent = deposit.submitted_by ? (deposit.submitted_by_name || 'User') : '-';
    viewSubmittedDate.textContent = deposit.submitted_date ? new Date(deposit.submitted_date).toLocaleString() : '-';
    viewClearedBy.textContent = deposit.cleared_by ? (deposit.cleared_by_name || 'User') : '-';
    viewClearedDate.textContent = deposit.cleared_date ? new Date(deposit.cleared_date).toLocaleString() : '-';
    
    // Items table
    if (!deposit.items || deposit.items.length === 0) {
        viewItemsTableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="7" class="text-center">No items in this deposit</td>
            </tr>
        `;
        viewDepositTotal.textContent = formatCurrency(0);
    } else {
        let total = 0;
        
        viewItemsTableBody.innerHTML = deposit.items.map(item => {
            const amount = parseFloat(item.amount);
            total += amount;
            
            const formattedAmount = formatCurrency(amount);
            const formattedCheckDate = item.check_date ? new Date(item.check_date).toLocaleDateString() : '-';
            
            return `
                <tr>
                    <td>${item.item_type}</td>
                    <td>${formattedAmount}</td>
                    <td>${item.check_number || '-'}</td>
                    <td>${formattedCheckDate}</td>
                    <td>${item.payer_name || '-'}</td>
                    <td>${item.account_name ? `${item.account_code} - ${item.account_name}` : 'Unknown'}</td>
                    <td>${item.description || '-'}</td>
                </tr>
            `;
        }).join('');
        
        viewDepositTotal.textContent = formatCurrency(total);
    }
    
    // Update button visibility based on status
    viewEditBtn.style.display = deposit.status === 'Draft' ? 'inline-block' : 'none';
}

// Update deposit slip
function updateDepositSlip(slipData) {
    if (!slipData) {
        // Clear slip data
        slipDate.textContent = 'MM/DD/YYYY';
        slipAccountName.textContent = '--';
        slipAccountNumber.textContent = '--';
        slipBankName.textContent = '--';
        slipOrganization.textContent = '--';
        slipReference.textContent = '--';
        slipCashTotal.textContent = '$0.00';
        slipChecksBody.innerHTML = '<tr><td colspan="4" class="text-center">No checks in this deposit</td></tr>';
        slipChecksTotal.textContent = '$0.00';
        slipSummaryCash.textContent = '$0.00';
        slipSummaryChecks.textContent = '$0.00';
        slipSummaryOther.textContent = '$0.00';
        slipSummaryTotal.textContent = '$0.00';
        slipPreparedBy.textContent = '--';
        slipPreparedDate.textContent = '--';
        return;
    }
    
    const { deposit, summary, checks, currency } = slipData;
    
    // Deposit info
    slipDate.textContent = deposit.deposit_date_formatted;
    slipAccountName.textContent = deposit.account_name || '--';
    slipAccountNumber.textContent = deposit.account_number || '--';
    slipBankName.textContent = deposit.bank_name || '--';
    slipOrganization.textContent = document.getElementById('entity-selector').options[document.getElementById('entity-selector').selectedIndex].text;
    slipReference.textContent = deposit.reference_number || '--';
    
    // Currency totals
    slipCashTotal.textContent = formatCurrency(currency.cash);
    
    // Checks table
    if (!checks || checks.length === 0) {
        slipChecksBody.innerHTML = '<tr><td colspan="4" class="text-center">No checks in this deposit</td></tr>';
    } else {
        slipChecksBody.innerHTML = checks.map(check => {
            const formattedAmount = formatCurrency(check.amount);
            const formattedDate = check.check_date ? new Date(check.check_date).toLocaleDateString() : '--';
            
            return `
                <tr>
                    <td>${check.check_number || '--'}</td>
                    <td>${formattedDate}</td>
                    <td>${check.payer_name || '--'}</td>
                    <td>${formattedAmount}</td>
                </tr>
            `;
        }).join('');
    }
    
    slipChecksTotal.textContent = formatCurrency(currency.checks);
    
    // Summary
    slipSummaryCash.textContent = formatCurrency(currency.cash);
    slipSummaryChecks.textContent = formatCurrency(currency.checks);
    slipSummaryOther.textContent = formatCurrency(currency.electronic);
    slipSummaryTotal.textContent = formatCurrency(summary.total_amount);
    
    // Prepared by
    slipPreparedBy.textContent = deposit.prepared_by || '--';
    slipPreparedDate.textContent = deposit.created_at ? new Date(deposit.created_at).toLocaleDateString() : '--';
    
    // Enable print button
    printDepositSlipBtn.disabled = false;
}

// ========================================================
// Action Functions
// ========================================================
// Apply filters
function applyFilters() {
    state.filters.status = filterStatus.value;
    state.filters.bank_account_id = filterBankAccount.value;
    state.filters.start_date = filterDateStart.value;
    state.filters.end_date = filterDateEnd.value;
    state.filters.deposit_type = filterDepositType.value;
    
    state.pagination.page = 1;
    fetchDeposits();
    
    showToast('info', 'Filters Applied', 'Deposit list has been filtered.');
}

// Clear filters
function clearFilters() {
    filterStatus.value = '';
    filterBankAccount.value = '';
    filterDateStart.value = '';
    filterDateEnd.value = '';
    filterDepositType.value = '';
    
    state.filters = {
        status: '',
        bank_account_id: '',
        start_date: '',
        end_date: '',
        deposit_type: ''
    };
    
    state.pagination.page = 1;
    fetchDeposits();
    
    showToast('info', 'Filters Cleared', 'All filters have been cleared.');
}

// Change page
function changePage(page) {
    if (page < 1 || page > state.pagination.pages) return;
    
    state.pagination.page = page;
    fetchDeposits();
}

// Refresh deposits
function refreshDeposits() {
    fetchDeposits();
    showToast('info', 'Refreshed', 'Deposit list has been refreshed.');
}

// Reset new deposit form
function resetNewDepositForm() {
    // Reset form fields
    depositBankAccount.value = '';
    depositDate.valueAsDate = new Date();
    depositType.value = '';
    depositReference.value = '';
    depositDescription.value = '';
    depositMemo.value = '';
    
    // Clear deposit items
    state.currentDeposit = null;
    state.currentDepositItems = [];
    updateDepositItemsTable();
    
    // Reset validation
    const invalidFields = depositForm.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => field.classList.remove('is-invalid'));
}

// Open add item modal
function openAddItemModal() {
    // Reset form
    addItemForm.reset();
    itemType.value = '';
    checkFields.classList.add('hidden');
    
    // Reset validation
    const invalidFields = addItemForm.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => field.classList.remove('is-invalid'));
    
    // Set editing state
    state.editingItem = null;
    
    // Update modal title
    addItemModal.querySelector('.modal-header h3').textContent = 'Add Deposit Item';
    addItemSubmitBtn.textContent = 'Add Item';
    
    // Show modal
    openModal(addItemModal);
}

// Toggle check fields based on item type
function toggleCheckFields() {
    if (itemType.value === 'Check' || itemType.value === 'Cashier Check') {
        checkFields.classList.remove('hidden');
        itemCheckNumber.setAttribute('required', 'required');
    } else {
        checkFields.classList.add('hidden');
        itemCheckNumber.removeAttribute('required');
    }
}

// Add deposit item
function addDepositItem() {
    // Validate form
    if (!validateItemForm()) return;
    
    const newItem = {
        item_type: itemType.value,
        amount: parseFloat(itemAmount.value),
        check_number: itemType.value === 'Check' || itemType.value === 'Cashier Check' ? itemCheckNumber.value : null,
        check_date: itemType.value === 'Check' || itemType.value === 'Cashier Check' ? itemCheckDate.value : null,
        payer_name: itemPayer.value,
        description: itemDescription.value,
        gl_account_id: itemGlAccount.value
    };
    
    if (state.editingItem) {
        // Update existing item
        const index = state.currentDepositItems.findIndex(item => 
            (item.id && item.id === state.editingItem.id) || 
            (item.tempId && item.tempId === state.editingItem.tempId)
        );
        
        if (index !== -1) {
            if (state.editingItem.id) {
                // Server-side item - preserve ID
                newItem.id = state.editingItem.id;
            } else {
                // Client-side item - preserve tempId
                newItem.tempId = state.editingItem.tempId;
            }
            
            state.currentDepositItems[index] = newItem;
            showToast('success', 'Updated', 'Deposit item has been updated.');
        }
    } else {
        // Add new item with temporary ID
        newItem.tempId = 'temp_' + Date.now();
        state.currentDepositItems.push(newItem);
        showToast('success', 'Added', 'New item has been added to the deposit.');
    }
    
    // Update UI
    updateDepositItemsTable();
    
    // Close modal
    closeModal(addItemModal);
}

// Edit deposit item
function editDepositItem(item) {
    // Set form values
    itemType.value = item.item_type;
    itemAmount.value = item.amount;
    itemCheckNumber.value = item.check_number || '';
    itemCheckDate.value = item.check_date || '';
    itemPayer.value = item.payer_name || '';
    itemGlAccount.value = item.gl_account_id;
    itemDescription.value = item.description || '';
    
    // Show/hide check fields
    toggleCheckFields();
    
    // Set editing state
    state.editingItem = item;
    
    // Update modal title
    addItemModal.querySelector('.modal-header h3').textContent = 'Edit Deposit Item';
    addItemSubmitBtn.textContent = 'Update Item';
    
    // Show modal
    openModal(addItemModal);
}

// Remove deposit item
function removeDepositItem(itemId) {
    // Find item index
    const index = state.currentDepositItems.findIndex(item => 
        (item.id && item.id === itemId) || 
        (item.tempId && item.tempId === itemId)
    );
    
    if (index !== -1) {
        // Remove item
        state.currentDepositItems.splice(index, 1);
        
        // Update UI
        updateDepositItemsTable();
        
        showToast('info', 'Removed', 'Item has been removed from the deposit.');
    }
}

// Save deposit as draft
async function saveDepositAsDraft() {
    // Validate form
    if (!validateDepositForm()) return;
    
    // Prepare deposit data
    const depositData = {
        bank_account_id: depositBankAccount.value,
        deposit_date: depositDate.value,
        deposit_type: depositType.value,
        reference_number: depositReference.value,
        description: depositDescription.value,
        memo: depositMemo.value,
        status: 'Draft'
    };
    
    try {
        let deposit;
        
        if (state.currentDeposit && state.currentDeposit.id) {
            // Update existing deposit
            deposit = await updateDepositAPI(state.currentDeposit.id, depositData);
            
            if (!deposit) return;
            
            // Handle items - first remove any server-side items that were deleted
            const currentServerItemIds = state.currentDepositItems
                .filter(item => item.id)
                .map(item => item.id);
            
            const originalServerItemIds = state.currentDeposit.items
                .filter(item => item.id)
                .map(item => item.id);
            
            const itemsToDelete = originalServerItemIds.filter(id => !currentServerItemIds.includes(id));
            
            for (const itemId of itemsToDelete) {
                await deleteDepositItemAPI(itemId);
            }
            
            // Update existing server items
            for (const item of state.currentDepositItems) {
                if (item.id) {
                    // Server-side item - update
                    const itemData = {
                        item_type: item.item_type,
                        amount: parseFloat(item.amount),
                        check_number: item.check_number,
                        check_date: item.check_date,
                        payer_name: item.payer_name,
                        description: item.description,
                        gl_account_id: item.gl_account_id
                    };
                    
                    await updateDepositItemAPI(item.id, itemData);
                }
            }
            
            // Add new items
            const newItems = state.currentDepositItems.filter(item => !item.id);
            
            if (newItems.length > 0) {
                // Remove tempId from items
                const itemsToAdd = newItems.map(item => ({
                    item_type: item.item_type,
                    amount: parseFloat(item.amount),
                    check_number: item.check_number,
                    check_date: item.check_date,
                    payer_name: item.payer_name,
                    description: item.description,
                    gl_account_id: item.gl_account_id
                }));
                
                await addDepositItemsAPI(deposit.id, itemsToAdd);
            }
            
            showToast('success', 'Saved', 'Deposit has been updated successfully.');
        } else {
            // Create new deposit
            deposit = await createDeposit(depositData);
            
            if (!deposit) return;
            
            // Add items
            if (state.currentDepositItems.length > 0) {
                // Remove tempId from items
                const itemsToAdd = state.currentDepositItems.map(item => ({
                    item_type: item.item_type,
                    amount: parseFloat(item.amount),
                    check_number: item.check_number,
                    check_date: item.check_date,
                    payer_name: item.payer_name,
                    description: item.description,
                    gl_account_id: item.gl_account_id
                }));
                
                await addDepositItemsAPI(deposit.id, itemsToAdd);
            }
            
            showToast('success', 'Created', 'New deposit has been created successfully.');
        }
        
        // Refresh deposits and switch to list tab
        await fetchDeposits();
        switchTab('deposits-list');
    } catch (error) {
        console.error('Error saving deposit:', error);
        showToast('error', 'Error', 'Failed to save deposit. Please try again.');
    }
}

// Submit deposit
async function submitDeposit() {
    // First save as draft
    await saveDepositAsDraft();
    
    // If no current deposit, something went wrong during save
    if (!state.currentDeposit || !state.currentDeposit.id) {
        showToast('error', 'Error', 'Failed to save deposit before submission.');
        return;
    }
    
    // Validate items exist
    if (state.currentDepositItems.length === 0) {
        showToast('error', 'Validation Error', 'Cannot submit an empty deposit. Please add at least one item.');
        return;
    }
    
    try {
        // Submit deposit
        const result = await submitDepositAPI(state.currentDeposit.id);
        
        if (!result) return;
        
        showToast('success', 'Submitted', 'Deposit has been submitted successfully.');
        
        // Refresh deposits and switch to list tab
        await fetchDeposits();
        switchTab('deposits-list');
    } catch (error) {
        console.error('Error submitting deposit:', error);
        showToast('error', 'Error', 'Failed to submit deposit. Please try again.');
    }
}

// Cancel deposit
function cancelDeposit() {
    if (state.currentDepositItems.length > 0) {
        if (!confirm('Are you sure you want to cancel this deposit? All unsaved changes will be lost.')) {
            return;
        }
    }
    
    resetNewDepositForm();
    switchTab('deposits-list');
}

// View deposit
async function viewDeposit(depositId) {
    const deposit = await fetchDepositDetails(depositId);
    
    if (!deposit) return;
    
    updateViewDepositModal(deposit);
    openModal(viewDepositModal);
}

// Edit deposit
async function editDeposit(deposit) {
    if (deposit.status !== 'Draft') {
        showToast('error', 'Cannot Edit', `Cannot edit a deposit with status "${deposit.status}".`);
        return;
    }
    
    // If we only have basic deposit info, fetch full details
    if (!deposit.items) {
        deposit = await fetchDepositDetails(deposit.id);
        if (!deposit) return;
    }
    
    // Set current deposit
    state.currentDeposit = deposit;
    state.currentDepositItems = deposit.items || [];
    
    // Set form values
    depositBankAccount.value = deposit.bank_account_id;
    depositDate.value = deposit.deposit_date.substring(0, 10); // Format as YYYY-MM-DD
    depositType.value = deposit.deposit_type;
    depositReference.value = deposit.reference_number || '';
    depositDescription.value = deposit.description || '';
    depositMemo.value = deposit.memo || '';
    
    // Update items table
    updateDepositItemsTable();
    
    // Switch to new deposit tab
    switchTab('new-deposit');
}

// Open clear deposit modal
function openClearDepositModal(depositId) {
    clearDepositId.value = depositId;
    clearingDate.valueAsDate = new Date();
    clearingReference.value = '';
    
    openModal(clearDepositModal);
}

// Clear deposit
async function clearDeposit() {
    // Validate form
    if (!clearingDate.value) {
        clearingDate.classList.add('is-invalid');
        return;
    }
    
    const depositId = clearDepositId.value;
    const clearingData = {
        clearing_date: clearingDate.value,
        clearing_reference: clearingReference.value
    };
    
    try {
        const result = await clearDepositAPI(depositId, clearingData);
        
        if (!result) return;
        
        showToast('success', 'Cleared', 'Deposit has been marked as cleared.');
        
        // Refresh deposits
        await fetchDeposits();
        
        // Close modal
        closeModal(clearDepositModal);
    } catch (error) {
        console.error('Error clearing deposit:', error);
        showToast('error', 'Error', 'Failed to clear deposit. Please try again.');
    }
}

// Confirm delete deposit
function confirmDeleteDeposit(deposit) {
    if (deposit.status !== 'Draft') {
        showToast('error', 'Cannot Delete', `Cannot delete a deposit with status "${deposit.status}".`);
        return;
    }
    
    // Set current deposit
    state.currentDeposit = deposit;
    
    // Set confirmation details
    deleteDate.textContent = new Date(deposit.deposit_date).toLocaleDateString();
    deleteReference.textContent = deposit.reference_number || 'No reference';
    deleteAmount.textContent = formatCurrency(deposit.total_amount);
    
    // Show modal
    openModal(deleteConfirmModal);
}

// Delete deposit
async function deleteDeposit() {
    if (!state.currentDeposit || !state.currentDeposit.id) {
        showToast('error', 'Error', 'No deposit selected for deletion.');
        return;
    }
    
    try {
        const result = await deleteDepositAPI(state.currentDeposit.id);
        
        if (!result) return;
        
        showToast('success', 'Deleted', 'Deposit has been deleted successfully.');
        
        // Refresh deposits
        await fetchDeposits();
        
        // Close modal
        closeModal(deleteConfirmModal);
    } catch (error) {
        console.error('Error deleting deposit:', error);
        showToast('error', 'Error', 'Failed to delete deposit. Please try again.');
    }
}

// Load deposit slip
async function loadDepositSlip() {
    const depositId = depositSlipSelect.value;
    
    if (!depositId) {
        updateDepositSlip(null);
        printDepositSlipBtn.disabled = true;
        return;
    }
    
    const slipData = await fetchDepositSlip(depositId);
    
    if (!slipData) {
        printDepositSlipBtn.disabled = true;
        return;
    }
    
    updateDepositSlip(slipData);
}

// Print deposit slip
function printDepositSlip() {
    window.print();
}

// ========================================================
// Helper Functions
// ========================================================
// Open modal
function openModal(modal) {
    modal.classList.remove('hidden');
}

// Close modal
function closeModal(modal) {
    modal.classList.add('hidden');
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount || 0);
}

// Show toast notification
function showToast(type, title, message) {
    const toastContainer = document.querySelector('.toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close">&times;</button>
    `;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Add close event
    toast.querySelector('.toast-close').addEventListener('click', () => {
        toast.classList.add('hiding');
        setTimeout(() => {
            toast.remove();
        }, 300);
    });
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('hiding');
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, 5000);
}

// Validate deposit form
function validateDepositForm() {
    let isValid = true;
    
    // Reset validation
    const invalidFields = depositForm.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => field.classList.remove('is-invalid'));
    
    // Validate required fields
    if (!depositBankAccount.value) {
        depositBankAccount.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!depositDate.value) {
        depositDate.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!depositType.value) {
        depositType.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!isValid) {
        showToast('error', 'Validation Error', 'Please fill in all required fields.');
    }
    
    return isValid;
}

// Validate item form
function validateItemForm() {
    let isValid = true;
    
    // Reset validation
    const invalidFields = addItemForm.querySelectorAll('.is-invalid');
    invalidFields.forEach(field => field.classList.remove('is-invalid'));
    
    // Validate required fields
    if (!itemType.value) {
        itemType.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!itemAmount.value || parseFloat(itemAmount.value) <= 0) {
        itemAmount.classList.add('is-invalid');
        isValid = false;
    }
    
    if ((itemType.value === 'Check' || itemType.value === 'Cashier Check') && !itemCheckNumber.value) {
        itemCheckNumber.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!itemGlAccount.value) {
        itemGlAccount.classList.add('is-invalid');
        isValid = false;
    }
    
    if (!isValid) {
        showToast('error', 'Validation Error', 'Please fill in all required fields.');
    }
    
    return isValid;
}

// ========================================================
// Initialization
// ========================================================
// Initialize the module
async function init() {
    console.log('Initializing Bank Deposits module...');
    
    // Set up event listeners
    initEventListeners();
    
    // Load initial data
    try {
        // Load in parallel
        await Promise.all([
            fetchBankAccounts(),
            fetchGLAccounts(),
            fetchDepositTypes(),
            fetchItemTypes()
        ]);
        
        // Load deposits
        await fetchDeposits();
        
        console.log('Bank Deposits module initialized successfully.');
    } catch (error) {
        console.error('Error initializing Bank Deposits module:', error);
        showToast('error', 'Initialization Error', 'Failed to initialize Bank Deposits module. Please refresh the page.');
    }
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);

// ========================================================
// Global Functions (accessible from HTML)
// ========================================================
// Make functions available globally
window.viewDeposit = viewDeposit;
window.editDeposit = editDeposit;
window.confirmDeleteDeposit = confirmDeleteDeposit;
window.openClearDepositModal = openClearDepositModal;
window.editDepositItem = editDepositItem;
window.removeDepositItem = removeDepositItem;
