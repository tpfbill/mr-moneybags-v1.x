/**
 * @file app.js
 * @description Main application logic for the Non-Profit Fund Accounting System.
 * This script handles data fetching, UI rendering, navigation, and user interactions.
 */

// ---------------------------------------------------------------------------
// Dynamic API base URL – automatically uses current host (works with
// localhost, Tailscale IP/hostname, or any other network interface)
// ---------------------------------------------------------------------------
const API_BASE = `${window.location.protocol}//${window.location.hostname}:3000`;

// DEBUGGING: App.js loaded on (timestamp)
console.log('App.js loaded:', new Date().toISOString(), '- Using API at', API_BASE);

// Application State
const appState = {
    entities: [],
    accounts: [],
    funds: [],
    journalEntries: [],
    bankAccounts: [],
    users: [],
    organizationSettings: {},
    customReportDefinitions: [],
    selectedEntityId: null,
    isConsolidatedView: false,
    currentPage: 'dashboard',
    currentTab: 'settings-users', // Default tab for settings page
    dbConnected: false,
    entityTypes: {
        ROOT: 'root',
        ENTITY: 'entity',
        FUND: 'fund'
    }
};

// Utility Functions
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount || 0);
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    }).format(date);
}

function formatPercentage(value, total) {
    if (!total) return '0.0%';
    return ((value / total) * 100).toFixed(1) + '%';
}

// API Functions
async function fetchData(endpoint) {
    try {
        console.log(`Fetching data from /api/${endpoint}...`);
        /* Use absolute URL pointing at the backend API (port 3000) to avoid
         * accidental requests to the static-file server on port 8080. */
        const response = await fetch(`${API_BASE}/api/${endpoint}`);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        const data = await response.json();
        console.log(`Received ${data.length} items from /api/${endpoint}`);
        return data;
    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return [];
    }
}

async function saveData(endpoint, data, method = 'POST') {
    try {
        const response = await fetch(`${API_BASE}/api/${endpoint}`, {
            method,
            headers: {
                'Content-Type': 'application/json'
            },
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

// Database Connection Check
async function checkDatabaseConnection() {
    try {
        const dbStatusIndicator = document.getElementById('db-status-indicator');
        
        // Try to fetch entities as a connection test
        const response = await fetch(`${API_BASE}/api/entities`);
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

// Data Loading Functions
async function loadEntityData() {
    try {
        const entities = await fetchData('entities');
        appState.entities = entities;
        
        // Update entity selector
        updateEntitySelector();
        
        // Update entity table in settings
        updateEntitiesTable();
        
        return entities;
    } catch (error) {
        console.error('Error loading entity data:', error);
        return [];
    }
}

async function loadAccountData() {
    try {
        const accounts = await fetchData('accounts');
        appState.accounts = accounts;
        
        // Update chart of accounts table
        updateChartOfAccountsTable();
        
        return accounts;
    } catch (error) {
        console.error('Error loading account data:', error);
        return [];
    }
}

async function loadFundData() {
    try {
        const funds = await fetchData('funds');
        appState.funds = funds;
        
        // Update funds table
        updateFundsTable();
        
        // Update dashboard fund balances
        updateDashboardFundBalances();
        
        return funds;
    } catch (error) {
        console.error('Error loading fund data:', error);
        return [];
    }
}

async function loadJournalEntryData() {
    try {
        const journalEntries = await fetchData('journal-entries');
        appState.journalEntries = journalEntries;
        
        // Update journal entries table
        updateJournalEntriesTable();
        
        // Update dashboard recent transactions
        updateDashboardRecentTransactions();
        
        // Update dashboard unposted entries
        updateDashboardUnpostedEntries();
        
        return journalEntries;
    } catch (error) {
        console.error('Error loading journal entry data:', error);
        return [];
    }
}

async function loadUserData() {
    try {
        const users = await fetchData('users');
        appState.users = users;
        
        // Update users table
        updateUsersTable();
        
        return users;
    } catch (error) {
        console.error('Error loading user data:', error);
        return [];
    }
}

async function loadDashboardData() {
    try {
        // Update dashboard title based on selected entity
        updateDashboardTitle();
        
        // Update dashboard summary cards
        updateDashboardSummaryCards();
        
        // Update fund balances table
        updateDashboardFundBalances();
        
        // Update recent transactions table
        updateDashboardRecentTransactions();
        
        // Update unposted entries table
        updateDashboardUnpostedEntries();
        
        // Initialize charts if they exist
        initializeDashboardCharts();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    }
}

// UI Update Functions
function updateEntitySelector() {
    const entitySelector = document.getElementById('entity-selector');
    if (!entitySelector || !appState.entities.length) return;
    
    // Clear existing options
    entitySelector.innerHTML = '';
    
    // Find TPF_PARENT entity (root)
    const rootEntity = appState.entities.find(entity => 
        entity.parent_entity_id === null && 
        (entity.name === 'The Principle Foundation' || entity.code === 'TPF_PARENT')
    );
    
    // Add root entity option
    if (rootEntity) {
        const option = document.createElement('option');
        option.value = rootEntity.id;
        option.textContent = `${rootEntity.name} (Consolidated)`;
        entitySelector.appendChild(option);
    }
    
    // Add child entities
    const childEntities = rootEntity 
        ? appState.entities.filter(entity => entity.parent_entity_id === rootEntity.id)
        : appState.entities.filter(entity => entity.parent_entity_id === null);
    
    childEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        entitySelector.appendChild(option);
    });
    
    // Set default selected entity
    if (!appState.selectedEntityId && rootEntity) {
        appState.selectedEntityId = rootEntity.id;
        entitySelector.value = rootEntity.id;
    } else if (appState.selectedEntityId) {
        entitySelector.value = appState.selectedEntityId;
    }
    
    // Set consolidated view toggle state based on selected entity
    const consolidatedViewToggle = document.getElementById('consolidated-view-toggle');
    if (consolidatedViewToggle && rootEntity && appState.selectedEntityId === rootEntity.id) {
        consolidatedViewToggle.checked = true;
        appState.isConsolidatedView = true;
    }
}

function updateDashboardTitle() {
    const dashboardTitle = document.getElementById('dashboard-title');
    const dashboardCurrentEntity = document.getElementById('dashboard-current-entity');
    
    if (!dashboardTitle || !appState.selectedEntityId) return;
    
    const selectedEntity = appState.entities.find(entity => entity.id === appState.selectedEntityId);
    if (selectedEntity) {
        dashboardTitle.textContent = 'Dashboard';
        
        if (dashboardCurrentEntity) {
            dashboardCurrentEntity.textContent = selectedEntity.name;
            if (appState.isConsolidatedView && selectedEntity.is_consolidated) {
                dashboardCurrentEntity.textContent += ' (Consolidated)';
            }
        }
    }
}

function updateDashboardSummaryCards() {
    const summaryCardsContainer = document.getElementById('dashboard-summary-cards');
    if (!summaryCardsContainer || !appState.selectedEntityId) return;
    
    // Get relevant funds based on selected entity and consolidated view
    const relevantFunds = getRelevantFunds();
    
    // Calculate summary values
    const totalAssets = relevantFunds.reduce((sum, fund) => sum + parseFloat(fund.balance || 0), 0);
    const totalLiabilities = 0; // This would need to be calculated from accounts if available
    const netAssets = totalAssets - totalLiabilities;
    
    // Calculate YTD revenue from journal entries
    const currentYear = new Date().getFullYear();
    const relevantEntityIds = getRelevantEntityIds();
    
    const ytdRevenue = appState.journalEntries
        .filter(entry => 
            new Date(entry.entry_date).getFullYear() === currentYear &&
            relevantEntityIds.includes(entry.entity_id) &&
            entry.type === 'Revenue'
        )
        .reduce((sum, entry) => sum + parseFloat(entry.total_amount || 0), 0);
    
    // Update the cards
    summaryCardsContainer.innerHTML = `
        <div class="card">
            <div class="card-title">Total Assets</div>
            <div class="card-value">${formatCurrency(totalAssets)}</div>
        </div>
        <div class="card">
            <div class="card-title">Total Liabilities</div>
            <div class="card-value">${formatCurrency(totalLiabilities)}</div>
        </div>
        <div class="card">
            <div class="card-title">Net Assets</div>
            <div class="card-value">${formatCurrency(netAssets)}</div>
        </div>
        <div class="card">
            <div class="card-title">YTD Revenue</div>
            <div class="card-value">${formatCurrency(ytdRevenue)}</div>
        </div>
    `;
}

function updateDashboardFundBalances() {
    const fundBalancesTable = document.getElementById('dashboard-fund-balances-table');
    if (!fundBalancesTable || !appState.selectedEntityId) return;
    
    const fundBalancesTbody = fundBalancesTable.querySelector('tbody');
    if (!fundBalancesTbody) return;
    
    // Get relevant funds based on selected entity and consolidated view
    const relevantFunds = getRelevantFunds();
    
    // Sort funds by balance (descending)
    relevantFunds.sort((a, b) => parseFloat(b.balance || 0) - parseFloat(a.balance || 0));
    
    // Calculate total for percentage
    const totalBalance = relevantFunds.reduce((sum, fund) => sum + parseFloat(fund.balance || 0), 0);
    
    // Update the fund balances table
    fundBalancesTbody.innerHTML = '';
    
    if (relevantFunds.length === 0) {
        fundBalancesTbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">No funds found for the selected entity</td>
            </tr>
        `;
        return;
    }
    
    relevantFunds.forEach(fund => {
        const entityName = appState.entities.find(entity => entity.id === fund.entity_id)?.name || 'Unknown';
        const fundBalance = parseFloat(fund.balance || 0);
        const percentage = formatPercentage(fundBalance, totalBalance);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fund.name}${appState.isConsolidatedView ? ` (${entityName})` : ''}</td>
            <td>${fund.type || 'N/A'}</td>
            <td>${formatCurrency(fundBalance)}</td>
            <td>${percentage}</td>
        `;
        fundBalancesTbody.appendChild(row);
    });
}

function updateDashboardRecentTransactions() {
    const recentTransactionsTable = document.getElementById('dashboard-recent-transactions-table');
    if (!recentTransactionsTable || !appState.selectedEntityId) return;
    
    const recentTransactionsTbody = recentTransactionsTable.querySelector('tbody');
    if (!recentTransactionsTbody) return;
    
    // Get relevant journal entries based on selected entity and consolidated view
    const relevantEntityIds = getRelevantEntityIds();
    
    let relevantEntries = appState.journalEntries.filter(entry => 
        relevantEntityIds.includes(entry.entity_id) && 
        entry.status === 'Posted'
    );
    
    // Sort by date (most recent first)
    relevantEntries.sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    
    // Take only the 5 most recent
    relevantEntries = relevantEntries.slice(0, 5);
    
    // Update the recent transactions table
    recentTransactionsTbody.innerHTML = '';
    
    if (relevantEntries.length === 0) {
        recentTransactionsTbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No recent transactions found</td>
            </tr>
        `;
        return;
    }
    
    relevantEntries.forEach(entry => {
        const entityName = appState.entities.find(entity => entity.id === entry.entity_id)?.name || 'Unknown';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.entry_date)}</td>
            <td>${entry.reference_number || 'N/A'}</td>
            <td>${entry.description || 'N/A'}${appState.isConsolidatedView ? ` (${entityName})` : ''}</td>
            <td>${formatCurrency(entry.total_amount)}</td>
            <td><span class="status status-${entry.status.toLowerCase()}">${entry.status}</span></td>
        `;
        recentTransactionsTbody.appendChild(row);
    });
}

function updateDashboardUnpostedEntries() {
    const unpostedEntriesTable = document.getElementById('dashboard-unposted-entries-table');
    if (!unpostedEntriesTable || !appState.selectedEntityId) return;
    
    const unpostedEntriesTbody = unpostedEntriesTable.querySelector('tbody');
    if (!unpostedEntriesTbody) return;
    
    // Get relevant journal entries based on selected entity and consolidated view
    const relevantEntityIds = getRelevantEntityIds();
    
    let unpostedEntries = appState.journalEntries.filter(entry => 
        relevantEntityIds.includes(entry.entity_id) && 
        entry.status === 'Draft'
    );
    
    // Sort by date (most recent first)
    unpostedEntries.sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    
    // Update the unposted entries table
    unpostedEntriesTbody.innerHTML = '';
    
    if (unpostedEntries.length === 0) {
        unpostedEntriesTbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">No unposted entries found</td>
            </tr>
        `;
        return;
    }
    
    unpostedEntries.forEach(entry => {
        const entityName = appState.entities.find(entity => entity.id === entry.entity_id)?.name || 'Unknown';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.entry_date)}</td>
            <td>${entry.reference_number || 'N/A'}</td>
            <td>${entry.description || 'N/A'}${appState.isConsolidatedView ? ` (${entityName})` : ''}</td>
            <td>${formatCurrency(entry.total_amount)}</td>
            <td>${entry.created_by || 'System'}</td>
            <td>
                <button class="action-button btn-post-entry" data-id="${entry.id}">Post</button>
                <button class="action-button btn-edit-entry" data-id="${entry.id}">Edit</button>
            </td>
        `;
        unpostedEntriesTbody.appendChild(row);
    });
    
    // Add event listeners for post and edit buttons
    unpostedEntriesTbody.querySelectorAll('.btn-post-entry').forEach(button => {
        button.addEventListener('click', () => postJournalEntry(button.dataset.id));
    });
    
    unpostedEntriesTbody.querySelectorAll('.btn-edit-entry').forEach(button => {
        button.addEventListener('click', () => openJournalEntryModal(button.dataset.id));
    });
}

function updateChartOfAccountsTable() {
    const chartOfAccountsTable = document.getElementById('chart-of-accounts-table');
    if (!chartOfAccountsTable) return;
    
    const chartOfAccountsTbody = chartOfAccountsTable.querySelector('tbody');
    if (!chartOfAccountsTbody) return;
    
    // Sort accounts by code
    const sortedAccounts = [...appState.accounts].sort((a, b) => a.code.localeCompare(b.code));
    
    // Update the chart of accounts table
    chartOfAccountsTbody.innerHTML = '';
    
    if (sortedAccounts.length === 0) {
        chartOfAccountsTbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">No accounts found</td>
            </tr>
        `;
        return;
    }
    
    sortedAccounts.forEach(account => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${account.code}</td>
            <td>${account.name}</td>
            <td>${account.type}</td>
            <td>${formatCurrency(account.balance)}</td>
            <td><span class="status status-${account.status.toLowerCase()}">${account.status}</span></td>
            <td>
                <button class="action-button btn-edit-account" data-id="${account.id}">Edit</button>
            </td>
        `;
        chartOfAccountsTbody.appendChild(row);
    });
    
    // Add event listeners for edit buttons
    chartOfAccountsTbody.querySelectorAll('.btn-edit-account').forEach(button => {
        button.addEventListener('click', () => openAccountModal(button.dataset.id));
    });
}

function updateFundsTable() {
    const fundsTable = document.getElementById('funds-table');
    if (!fundsTable) return;
    
    const fundsTbody = fundsTable.querySelector('tbody');
    if (!fundsTbody) return;
    
    // Determine filtering mode (current entity vs all entities)
    const fundsFilterSelect = document.getElementById('funds-filter-select');
    const filterMode = fundsFilterSelect ? fundsFilterSelect.value : 'current';

    // Build list of funds respecting the chosen filter
    let displayFunds = appState.funds;
    if (filterMode !== 'all') {
        // Existing behaviour – filter by selected entity / consolidated view
        if (appState.selectedEntityId) {
            if (!appState.isConsolidatedView) {
                displayFunds = appState.funds.filter(fund => fund.entity_id === appState.selectedEntityId);
            } else {
                const relevantEntityIds = getRelevantEntityIds();
                displayFunds = appState.funds.filter(fund => relevantEntityIds.includes(fund.entity_id));
            }
        }
    }
    
    // Sort funds by code
    displayFunds.sort((a, b) => a.code.localeCompare(b.code));
    
    // Update the funds table
    fundsTbody.innerHTML = '';
    
    if (displayFunds.length === 0) {
        fundsTbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center">No funds found</td>
            </tr>
        `;
        return;
    }
    
    displayFunds.forEach(fund => {
        const entityName = appState.entities.find(entity => entity.id === fund.entity_id)?.name || 'Unknown';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fund.code}</td>
            <td>${fund.name}</td>
            <td>${fund.type || 'N/A'}</td>
            <td>${entityName}</td>
            <td>${formatCurrency(fund.balance)}</td>
            <td><span class="status status-${fund.status.toLowerCase()}">${fund.status}</span></td>
            <td>
                <button class="action-button btn-edit-fund" data-id="${fund.id}">Edit</button>
            </td>
        `;
        fundsTbody.appendChild(row);
    });
    
    // Add event listeners for edit buttons
    fundsTbody.querySelectorAll('.btn-edit-fund').forEach(button => {
        button.addEventListener('click', () => openFundModal(button.dataset.id));
    });
}

function updateJournalEntriesTable() {
    const journalEntriesTable = document.getElementById('journal-entries-table');
    if (!journalEntriesTable) return;
    
    const journalEntriesTbody = journalEntriesTable.querySelector('tbody');
    if (!journalEntriesTbody) return;
    
    /* ------------------------------------------------------------------
     * Determine filter mode – current entity vs all entities
     * ------------------------------------------------------------------ */
    const jeFilterSelect = document.getElementById('journal-entries-filter-select');
    const jeFilterMode   = jeFilterSelect ? jeFilterSelect.value : 'current';

    // Build list of entries respecting the chosen filter
    let displayEntries = appState.journalEntries;
    
    if (jeFilterMode !== 'all') {
        // Existing behaviour – filter by selected entity / consolidated view
        if (appState.selectedEntityId) {
            if (!appState.isConsolidatedView) {
                // Show only entries for the selected entity
                displayEntries = displayEntries.filter(entry => entry.entity_id === appState.selectedEntityId);
            } else {
                // Show entries for the selected entity and its children
                const relevantEntityIds = getRelevantEntityIds();
                displayEntries = displayEntries.filter(entry => relevantEntityIds.includes(entry.entity_id));
            }
        }
    }
    
    // Sort entries by date (most recent first)
    displayEntries.sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    
    // Update the journal entries table
    journalEntriesTbody.innerHTML = '';
    
    if (displayEntries.length === 0) {
        journalEntriesTbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No journal entries found</td>
            </tr>
        `;
        return;
    }
    
    displayEntries.forEach(entry => {
        const entityName = appState.entities.find(entity => entity.id === entry.entity_id)?.name || 'Unknown';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.entry_date)}</td>
            <td>${entry.reference_number || 'N/A'}</td>
            <td>${entry.description || 'N/A'}${appState.isConsolidatedView ? ` (${entityName})` : ''}</td>
            <td>N/A</td>
            <td>${entityName}</td>
            <td>${formatCurrency(entry.total_amount)}</td>
            <td><span class="status status-${entry.status.toLowerCase()}">${entry.status}</span></td>
            <td>${entry.created_by || 'System'}</td>
            <td>
                <button class="action-button btn-view-entry" data-id="${entry.id}">View</button>
                ${entry.status === 'Draft' ? `<button class="action-button btn-edit-entry" data-id="${entry.id}">Edit</button>` : ''}
                <button class="action-button btn-delete-entry" data-id="${entry.id}">Delete</button>
            </td>
        `;
        journalEntriesTbody.appendChild(row);
    });
    
    // Add event listeners for view and edit buttons
    journalEntriesTbody.querySelectorAll('.btn-view-entry').forEach(button => {
        button.addEventListener('click', () => openJournalEntryModal(button.dataset.id, true));
    });
    
    journalEntriesTbody.querySelectorAll('.btn-edit-entry').forEach(button => {
        button.addEventListener('click', () => openJournalEntryModal(button.dataset.id));
    });

    // delete buttons
    journalEntriesTbody.querySelectorAll('.btn-delete-entry').forEach(button => {
        button.addEventListener('click', () => deleteJournalEntry(button.dataset.id));
    });
}

function updateEntitiesTable() {
    const entitiesTable = document.getElementById('entities-table');
    if (!entitiesTable) return;
    
    const entitiesTbody = entitiesTable.querySelector('tbody');
    if (!entitiesTbody) return;
    
    // Sort entities by name
    const sortedEntities = [...appState.entities].sort((a, b) => a.name.localeCompare(b.name));
    
    // Update the entities table
    entitiesTbody.innerHTML = '';
    
    if (sortedEntities.length === 0) {
        entitiesTbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center">No entities found</td>
            </tr>
        `;
        return;
    }
    
    sortedEntities.forEach(entity => {
        const parentEntity = appState.entities.find(e => e.id === entity.parent_entity_id);
        const parentName = parentEntity ? parentEntity.name : 'None (Top Level)';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${entity.code}</td>
            <td>${entity.name}</td>
            <td>${parentName}</td>
            <td><span class="status status-${entity.status.toLowerCase()}">${entity.status}</span></td>
            <td>${entity.base_currency || 'USD'}</td>
            <td>${entity.fiscal_year_start || '01-01'}</td>
            <td>${entity.is_consolidated ? 'Yes' : 'No'}</td>
            <td>
                <button class="action-button btn-edit-entity" data-id="${entity.id}">Edit</button>
                <button class="action-button btn-delete-entity" data-id="${entity.id}">Delete</button>
            </td>
        `;
        entitiesTbody.appendChild(row);
    });
    
    // Add event listeners for edit and delete buttons
    entitiesTbody.querySelectorAll('.btn-edit-entity').forEach(button => {
        button.addEventListener('click', () => openEntityModal(button.dataset.id));
    });
    
    entitiesTbody.querySelectorAll('.btn-delete-entity').forEach(button => {
        button.addEventListener('click', () => deleteEntity(button.dataset.id));
    });
    
}

function updateEntityHierarchyVisualization() {
    /* ------------------------------------------------------------------
     * Re-build the on-screen hierarchy tree.
     * Adds additional logging and guards against edge-cases where the
     * root node cannot be created for any reason.
     * ------------------------------------------------------------------ */
    console.log('[Hierarchy] Updating entity hierarchy visualization …');

    const entityRelationshipViz = document.getElementById(
        'entity-relationship-viz'
    );
    if (!entityRelationshipViz) return;
    
    // Clear existing content
    entityRelationshipViz.innerHTML = '';
    
    // Build hierarchy data
    const hierarchyData = buildEntityHierarchyData();
    
    if (!hierarchyData.root) {
        entityRelationshipViz.innerHTML = '<p class="text-center">No entity hierarchy found</p>';
        return;
    }
    
    // Create visualization container
    const vizContainer = document.createElement('div');
    vizContainer.className = 'hierarchy-visualization';
    
    // Create root node
    const rootNode = createEntityHierarchyNode(hierarchyData.root);

    if (rootNode) {
        vizContainer.appendChild(rootNode);
        entityRelationshipViz.appendChild(vizContainer);
        console.log('[Hierarchy] Visualization updated successfully');
    } else {
        console.error(
            '[Hierarchy] Failed to create root node – diagram not rendered'
        );
        entityRelationshipViz.innerHTML =
            '<p class="text-center">Error building entity hierarchy</p>';
    }
}

function buildEntityHierarchyData() {
    /* ------------------------------------------------------------------
     * Build an entity map keyed by **stringified** IDs so we avoid
     * subtle equality issues (UUID objects vs. plain strings, etc.).
     * Also sprinkle in some debugging to trace hierarchy creation.
     * ------------------------------------------------------------------ */

    console.log('[Hierarchy] Building entity hierarchy data …');
    console.log('[Hierarchy] Entities:', appState.entities.length, 'Funds:', appState.funds.length);

    const entityMap = {};
    appState.entities.forEach(entity => {
        const id = String(entity.id);
        entityMap[id] = {
            ...entity,
            id,                               // normalised string id
            type: appState.entityTypes.ENTITY,
            children: []
        };
        console.debug(`  • mapped entity ${entity.name} (${entity.code})`);
    });

    /* ------------------------------------------------------------------
     * Identify root (TPF_PARENT) – fall back to first top-level entity
     * ------------------------------------------------------------------ */
    const rootEntity =
        appState.entities.find(
            e =>
                e.parent_entity_id === null &&
                (e.name === 'The Principle Foundation' || e.code === 'TPF_PARENT')
        ) || appState.entities.find(e => e.parent_entity_id === null);

    /* ------------------------------------------------------------------
     * Ensure the root node is tagged with the correct visual type
     * ------------------------------------------------------------------ */
    if (rootEntity) {
        const rootRef = entityMap[String(rootEntity.id)];
        if (rootRef) {
            rootRef.type = appState.entityTypes.ROOT;
        }
    }

    const hierarchy = {
        root: rootEntity ? entityMap[String(rootEntity.id)] : null,
        entities: entityMap
    };

    /* ------------------------------------------------------------------
     * Wire child entities to their parents
     * ------------------------------------------------------------------ */
    appState.entities.forEach(entity => {
        if (!entity.parent_entity_id) return;
        const parentId = String(entity.parent_entity_id);
        const selfId = String(entity.id);

        if (entityMap[parentId]) {
            entityMap[parentId].children.push(entityMap[selfId]);
        } else {
            console.warn(`[Hierarchy] Parent entity ${parentId} missing for ${entity.code}`);
        }
    });

    /* ------------------------------------------------------------------
     * Attach funds to owning entities
     * ------------------------------------------------------------------ */
    appState.funds.forEach(fund => {
        const owningId = String(fund.entity_id);
        if (!entityMap[owningId]) {
            console.warn(`[Hierarchy] Entity ${owningId} not found for fund ${fund.code}`);
            return;
        }

        entityMap[owningId].children.push({
            ...fund,
            id: String(fund.id),
            type: appState.entityTypes.FUND,
            children: []
        });
    });

    /* ------------------------------------------------------------------
     * Debug: log counts so we can see if funds were attached
     * ------------------------------------------------------------------ */
    if (hierarchy.root) {
        console.log(
            `[Hierarchy] Root ${hierarchy.root.name} children:`,
            hierarchy.root.children.length
        );
        hierarchy.root.children.forEach(child => {
            const fundCount = child.children.filter(c => c.type === appState.entityTypes.FUND)
                .length;
            console.log(
                `    - ${child.name} (${child.code}) → entities+funds: ${child.children.length} (funds ${fundCount})`
            );
        });
    } else {
        console.warn('[Hierarchy] No root entity detected – hierarchy may be empty.');
    }

    return hierarchy;
}

function createEntityHierarchyNode(node) {
    if (!node) {
        console.warn('[Hierarchy Node] Attempted to create a node with null data');
        return null;
    }
    
    // Log node creation for debugging
    console.log(`[Hierarchy Node] Creating node: ${node.name} (${node.code}), type: ${node.type}, children: ${node.children?.length || 0}`);
    
    // Create node container with the appropriate class based on node type
    const nodeContainer = document.createElement('div');
    /* --------------------------------------------------------------
     * Map logical node types to CSS classes
     *  • ROOT  → root-node   (organisation level)
     *  • FUND  → fund-node   (leaf-level fund)
     *  • ENTITY (default) → entity-node
     * -------------------------------------------------------------- */
    let visualClass = 'entity-node';
    if (node.type === appState.entityTypes.ROOT) {
        visualClass = 'root-node';
    } else if (node.type === appState.entityTypes.FUND) {
        visualClass = 'fund-node';
    }
    nodeContainer.className = `hierarchy-node ${visualClass}`;
    nodeContainer.dataset.id = node.id;
    nodeContainer.dataset.type = node.type;
    nodeContainer.dataset.name = node.name; // Add name for easier debugging
    nodeContainer.dataset.code = node.code; // Add code for easier debugging
    
    // Create node header
    const nodeHeader = document.createElement('div');
    nodeHeader.className = 'node-header';
    
    // Create node title
    const nodeTitle = document.createElement('div');
    nodeTitle.className = 'node-title';
    nodeTitle.textContent = `${node.name} (${node.code})`;
    
    // Create consolidated indicator if applicable
    if (node.type !== appState.entityTypes.FUND && node.is_consolidated) {
        const consolidatedIndicator = document.createElement('span');
        consolidatedIndicator.className = 'consolidated-indicator';
        consolidatedIndicator.title = 'This entity consolidates its children';
        consolidatedIndicator.textContent = ' [Consolidated]';
        nodeTitle.appendChild(consolidatedIndicator);
    }
    
    // Create node actions
    const nodeActions = document.createElement('div');
    nodeActions.className = 'node-actions';
    
    // Add edit button for entities
    if (node.type === appState.entityTypes.ENTITY) {
        const editButton = document.createElement('button');
        editButton.className = 'btn-icon edit-entity';
        editButton.innerHTML = '✏️';
        editButton.title = 'Edit Entity';
        editButton.addEventListener('click', () => openEntityModal(node.id));
        nodeActions.appendChild(editButton);
    }
    
    // Add children if any
    if (node.children && node.children.length > 0) {
        console.log(`[Hierarchy Node] ${node.name} has ${node.children.length} children`);
        
        // Create toggle button for expanding/collapsing
        const toggleButton = document.createElement('button');
        toggleButton.className = 'toggle-children';
        toggleButton.textContent = '▼';
        
        // Create children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'node-children';
        
        toggleButton.addEventListener('click', () => {
            childrenContainer.classList.toggle('collapsed');
            toggleButton.textContent = childrenContainer.classList.contains('collapsed') ? '►' : '▼';
        });
        
        // Sort children: entities first, then funds
        const entityChildren = node.children.filter(child => child.type === appState.entityTypes.ENTITY);
        const fundChildren = node.children.filter(child => child.type === appState.entityTypes.FUND);
        
        console.log(`[Hierarchy Node] ${node.name} has ${entityChildren.length} entity children and ${fundChildren.length} fund children`);
        
        // Add entity children
        entityChildren.forEach(child => {
            const childNode = createEntityHierarchyNode(child);
            if (childNode) {
                childrenContainer.appendChild(childNode);
            }
        });
        
        // Add fund children
        fundChildren.forEach(child => {
            console.log(`[Hierarchy Node] Creating fund child: ${child.name} (${child.code})`);
            const childNode = createEntityHierarchyNode(child);
            if (childNode) {
                childrenContainer.appendChild(childNode);
            } else {
                console.warn(`[Hierarchy Node] Failed to create node for fund: ${child.name}`);
            }
        });
        
        // Only add toggle and children container if there are actually children
        if (childrenContainer.children.length > 0) {
            nodeHeader.insertBefore(toggleButton, nodeHeader.firstChild);
            nodeContainer.appendChild(childrenContainer);
        } else {
            console.warn(`[Hierarchy Node] No children were added to ${node.name} despite having ${node.children.length} children in the data`);
        }
    }
    
    // Assemble the node
    nodeHeader.appendChild(nodeTitle);
    nodeHeader.appendChild(nodeActions);
    nodeContainer.insertBefore(nodeHeader, nodeContainer.firstChild);
    
    return nodeContainer;
}

function updateUsersTable() {
    const usersTable = document.getElementById('users-table');
    if (!usersTable) return;
    
    const usersTbody = usersTable.querySelector('tbody');
    if (!usersTbody) return;
    
    // Sort users by name
    const sortedUsers = [...appState.users].sort((a, b) => a.name.localeCompare(b.name));
    
    // Update the users table
    usersTbody.innerHTML = '';
    
    if (sortedUsers.length === 0) {
        usersTbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No users found</td>
            </tr>
        `;
        return;
    }
    
    sortedUsers.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td><span class="status status-${user.status.toLowerCase()}">${user.status}</span></td>
            <td>
                <button class="action-button btn-edit-user" data-id="${user.id}">Edit</button>
            </td>
        `;
        usersTbody.appendChild(row);
    });
    
    // Add event listeners for edit buttons
    usersTbody.querySelectorAll('.btn-edit-user').forEach(button => {
        button.addEventListener('click', () => openUserModal(button.dataset.id));
    });
}

// Chart Initialization
function initializeDashboardCharts() {
    initializeFundBalanceChart();
    initializeIncomeExpenseChart();
    initializeFundDistributionChart();
}

function initializeFundBalanceChart() {
    const canvas = document.getElementById('fund-balance-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant funds
    const relevantFunds = getRelevantFunds();
    
    // Prepare data
    const fundNames = relevantFunds.slice(0, 5).map(fund => fund.name);
    const fundBalances = relevantFunds.slice(0, 5).map(fund => parseFloat(fund.balance || 0));
    
    // Create chart
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: fundNames,
            datasets: [{
                label: 'Fund Balance',
                data: fundBalances,
                backgroundColor: 'rgba(33, 150, 243, 0.7)',
                borderColor: 'rgba(33, 150, 243, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatCurrency(value)
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => formatCurrency(context.raw)
                    }
                }
            }
        }
    });
}

function initializeIncomeExpenseChart() {
    const canvas = document.getElementById('income-expense-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant journal entries
    const relevantEntityIds = getRelevantEntityIds();
    const currentYear = new Date().getFullYear();
    
    // Get monthly data for the current year
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    
    const incomeData = months.map(month => {
        const startDate = new Date(currentYear, month - 1, 1);
        const endDate = new Date(currentYear, month, 0);
        
        return appState.journalEntries
            .filter(entry => 
                relevantEntityIds.includes(entry.entity_id) &&
                entry.type === 'Revenue' &&
                entry.status === 'Posted' &&
                new Date(entry.entry_date) >= startDate &&
                new Date(entry.entry_date) <= endDate
            )
            .reduce((sum, entry) => sum + parseFloat(entry.total_amount || 0), 0);
    });
    
    const expenseData = months.map(month => {
        const startDate = new Date(currentYear, month - 1, 1);
        const endDate = new Date(currentYear, month, 0);
        
        return appState.journalEntries
            .filter(entry => 
                relevantEntityIds.includes(entry.entity_id) &&
                entry.type === 'Expense' &&
                entry.status === 'Posted' &&
                new Date(entry.entry_date) >= startDate &&
                new Date(entry.entry_date) <= endDate
            )
            .reduce((sum, entry) => sum + parseFloat(entry.total_amount || 0), 0);
    });
    
    // Create chart
    new Chart(canvas, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            datasets: [
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(76, 175, 80, 0.2)',
                    borderColor: 'rgba(76, 175, 80, 1)',
                    borderWidth: 2,
                    tension: 0.3
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(244, 67, 54, 0.2)',
                    borderColor: 'rgba(244, 67, 54, 1)',
                    borderWidth: 2,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: value => formatCurrency(value)
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => formatCurrency(context.raw)
                    }
                }
            }
        }
    });
}

function initializeFundDistributionChart() {
    const canvas = document.getElementById('fund-distribution-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant funds
    const relevantFunds = getRelevantFunds();
    
    // Group funds by type
    const fundTypes = {};
    relevantFunds.forEach(fund => {
        const type = fund.type || 'Other';
        if (!fundTypes[type]) {
            fundTypes[type] = 0;
        }
        fundTypes[type] += parseFloat(fund.balance || 0);
    });
    
    // Prepare data
    const types = Object.keys(fundTypes);
    const balances = Object.values(fundTypes);
    
    // Create chart
    new Chart(canvas, {
        type: 'pie',
        data: {
            labels: types,
            datasets: [{
                data: balances,
                backgroundColor: [
                    'rgba(33, 150, 243, 0.7)',
                    'rgba(76, 175, 80, 0.7)',
                    'rgba(255, 193, 7, 0.7)',
                    'rgba(156, 39, 176, 0.7)',
                    'rgba(0, 188, 212, 0.7)'
                ],
                borderColor: [
                    'rgba(33, 150, 243, 1)',
                    'rgba(76, 175, 80, 1)',
                    'rgba(255, 193, 7, 1)',
                    'rgba(156, 39, 176, 1)',
                    'rgba(0, 188, 212, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: context => {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return `${context.label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// Helper Functions
function getRelevantEntityIds() {
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

function getRelevantFunds() {
    const relevantEntityIds = getRelevantEntityIds();
    
    return appState.funds.filter(fund => 
        relevantEntityIds.includes(fund.entity_id)
    );
}

// Modal Functions
function openEntityModal(entityId = null) {
    const entityModal = document.getElementById('entity-modal');
    if (!entityModal) return;
    
    // Reset form
    document.getElementById('entity-id-edit').value = '';
    document.getElementById('entity-name-input').value = '';
    document.getElementById('entity-code-input').value = '';
    document.getElementById('entity-parent-select').value = '';
    document.getElementById('entity-consolidated-checkbox').checked = false;
    document.getElementById('entity-currency-select').value = 'USD';
    document.getElementById('entity-fiscal-start-input').value = '01-01';
    document.getElementById('entity-status-select').value = 'Active';
    document.getElementById('entity-description-textarea').value = '';
    
    // Update modal title
    document.getElementById('entity-modal-title-text').textContent = entityId ? 'Edit Entity' : 'Add Entity';
    
    // Populate parent entity dropdown
    populateParentEntityDropdown(entityId);
    
    if (entityId) {
        // Edit mode - populate form with entity data
        const entity = appState.entities.find(e => e.id === entityId);
        if (entity) {
            document.getElementById('entity-id-edit').value = entity.id;
            document.getElementById('entity-name-input').value = entity.name;
            document.getElementById('entity-code-input').value = entity.code;
            document.getElementById('entity-parent-select').value = entity.parent_entity_id || '';
            document.getElementById('entity-consolidated-checkbox').checked = entity.is_consolidated || false;
            document.getElementById('entity-currency-select').value = entity.base_currency || 'USD';
            document.getElementById('entity-fiscal-start-input').value = entity.fiscal_year_start || '01-01';
            document.getElementById('entity-status-select').value = entity.status || 'Active';
            document.getElementById('entity-description-textarea').value = entity.description || '';
        }
    }
    
    // Show modal
    entityModal.classList.remove('hidden');
    entityModal.style.display = 'block';
}

function populateParentEntityDropdown(currentEntityId = null) {
    const parentSelect = document.getElementById('entity-parent-select');
    if (!parentSelect) return;
    
    // Clear existing options
    parentSelect.innerHTML = '<option value="">-- No Parent (Top Level) --</option>';
    
    // Add all entities except the current one being edited
    appState.entities.forEach(entity => {
        if (entity.id !== currentEntityId) {
            const option = document.createElement('option');
            option.value = entity.id;
            option.textContent = entity.name;
            parentSelect.appendChild(option);
        }
    });
}

function openFundModal(fundId = null) {
    const fundModal = document.getElementById('fund-modal');
    if (!fundModal) return;
    
    // Reset form
    document.getElementById('edit-fund-id-input').value = '';
    document.getElementById('fund-code-input').value = '';
    document.getElementById('fund-name-input').value = '';
    document.getElementById('fund-type-select').value = 'Unrestricted';
    document.getElementById('fund-status-select').value = 'Active';
    document.getElementById('fund-description-textarea').value = '';
    
    // Update modal title
    document.getElementById('fund-modal-title').textContent = fundId ? 'Edit Fund' : 'Add Fund';
    
    if (fundId) {
        // Edit mode - populate form with fund data
        const fund = appState.funds.find(f => f.id === fundId);
        if (fund) {
            document.getElementById('edit-fund-id-input').value = fund.id;
            document.getElementById('fund-code-input').value = fund.code;
            document.getElementById('fund-name-input').value = fund.name;
            document.getElementById('fund-type-select').value = fund.type || 'Unrestricted';
            document.getElementById('fund-status-select').value = fund.status || 'Active';
            document.getElementById('fund-description-textarea').value = fund.description || '';
        }
        // Show delete button in edit mode
        const delBtn = document.getElementById('delete-fund-btn');
        if (delBtn) delBtn.style.display = 'inline-block';
    }
    else {
        // Hide delete button in create mode
        const delBtn = document.getElementById('delete-fund-btn');
        if (delBtn) delBtn.style.display = 'none';
    }
    
    // Show modal
    fundModal.classList.remove('hidden');
    fundModal.style.display = 'block';
}

// Delete Fund
async function deleteFund(fundId) {
    if (!fundId) return;
    if (!confirm('Are you sure you want to delete this fund? This action cannot be undone.')) return;
    try {
        const response = await fetch(`/api/funds/${fundId}`, { method: 'DELETE' });

        /* --- Enhanced error handling ------------------------------------- */
        if (!response.ok) {
            // Try to parse error details from server (JSON preferred, fallback to text)
            let serverMsg = `API Error: ${response.status}`;
            try {
                const data = await response.json();
                if (data && data.message) serverMsg = data.message;
            } catch {
                try {
                    const text = await response.text();
                    if (text) serverMsg = text;
                } catch { /* ignore */ }
            }
            throw new Error(serverMsg);
        }
        /* ----------------------------------------------------------------- */

        // Close modal
        const fundModal = document.getElementById('fund-modal');
        if (fundModal) {
            fundModal.classList.add('hidden');
            fundModal.style.display = 'none';
        }
        // Reload funds
        await loadFundData();
        alert('Fund deleted successfully.');
    } catch (err) {
        console.error('Error deleting fund:', err);
        alert('Error deleting fund: ' + err.message);
    }
}

function openAccountModal(accountId = null) {
    const accountModal = document.getElementById('account-modal');
    if (!accountModal) return;
    
    // Reset form
    document.getElementById('edit-account-id-input').value = '';
    document.getElementById('account-code-input').value = '';
    document.getElementById('account-name-input').value = '';
    document.getElementById('account-type-select').value = 'Asset';
    document.getElementById('account-status-select').value = 'Active';
    document.getElementById('account-description-textarea').value = '';
    
    // Update modal title
    document.getElementById('account-modal-title').textContent = accountId ? 'Edit Account' : 'Add Account';
    
    if (accountId) {
        // Edit mode - populate form with account data
        const account = appState.accounts.find(a => a.id === accountId);
        if (account) {
            document.getElementById('edit-account-id-input').value = account.id;
            document.getElementById('account-code-input').value = account.code;
            document.getElementById('account-name-input').value = account.name;
            document.getElementById('account-type-select').value = account.type || 'Asset';
            document.getElementById('account-status-select').value = account.status || 'Active';
            document.getElementById('account-description-textarea').value = account.description || '';
        }
    }
    
    // Show modal
    accountModal.classList.remove('hidden');
    accountModal.style.display = 'block';
}

function openJournalEntryModal(entryId = null, readOnly = false) {
    const journalEntryModal = document.getElementById('journal-entry-modal');
    if (!journalEntryModal) return;
    
    // Reset form
    document.getElementById('edit-je-id-input').value = '';
    document.getElementById('journal-entry-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('journal-entry-reference').value = 'JE-' + new Date().getFullYear() + '-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    document.getElementById('journal-entry-description').value = '';
    document.getElementById('journal-entry-is-inter-entity').checked = false;
    
    // Update modal title
    document.getElementById('journal-entry-modal-title').textContent = entryId ? (readOnly ? 'View Journal Entry' : 'Edit Journal Entry') : 'New Journal Entry';
    
    if (entryId) {
        // Edit/View mode - populate form with journal entry data
        const entry = appState.journalEntries.find(je => je.id === entryId);
        if (entry) {
            document.getElementById('edit-je-id-input').value = entry.id;
            document.getElementById('journal-entry-date').value = entry.entry_date ? new Date(entry.entry_date).toISOString().split('T')[0] : '';
            document.getElementById('journal-entry-reference').value = entry.reference_number || '';
            document.getElementById('journal-entry-description').value = entry.description || '';
            document.getElementById('journal-entry-is-inter-entity').checked = entry.is_inter_entity || false;
        }
    }
    
    // Set read-only state if viewing
    if (readOnly) {
        document.getElementById('journal-entry-date').disabled = true;
        document.getElementById('journal-entry-description').disabled = true;
        document.getElementById('journal-entry-is-inter-entity').disabled = true;
        document.getElementById('btn-save-journal-draft').style.display = 'none';
        document.getElementById('btn-save-journal-post').style.display = 'none';
    } else {
        document.getElementById('journal-entry-date').disabled = false;
        document.getElementById('journal-entry-description').disabled = false;
        document.getElementById('journal-entry-is-inter-entity').disabled = false;
        document.getElementById('btn-save-journal-draft').style.display = 'inline-block';
        document.getElementById('btn-save-journal-post').style.display = 'inline-block';
    }
    
    // Show modal
    journalEntryModal.classList.remove('hidden');
    journalEntryModal.style.display = 'block';
}

function openUserModal(userId = null) {
    const userModal = document.getElementById('user-modal');
    if (!userModal) return;
    
    // Reset form
    document.getElementById('edit-user-id-input').value = '';
    document.getElementById('user-name-input').value = '';
    
    // Update modal title
    document.getElementById('user-modal-title').textContent = userId ? 'Edit User' : 'Add User';
    
    if (userId) {
        // Edit mode - populate form with user data
        const user = appState.users.find(u => u.id === userId);
        if (user) {
            document.getElementById('edit-user-id-input').value = user.id;
            document.getElementById('user-name-input').value = user.name;
        }
    }
    
    // Show modal
    userModal.classList.remove('hidden');
    userModal.style.display = 'block';
}

// Entity CRUD Operations
async function saveEntity() {
    const entityId = document.getElementById('entity-id-edit').value;
    const entityData = {
        name: document.getElementById('entity-name-input').value,
        code: document.getElementById('entity-code-input').value,
        parent_entity_id: document.getElementById('entity-parent-select').value || null,
        is_consolidated: document.getElementById('entity-consolidated-checkbox').checked,
        base_currency: document.getElementById('entity-currency-select').value,
        fiscal_year_start: document.getElementById('entity-fiscal-start-input').value,
        status: document.getElementById('entity-status-select').value,
        description: document.getElementById('entity-description-textarea').value
    };
    
    try {
        let savedEntity;
        
        if (entityId) {
            // Update existing entity
            savedEntity = await saveData(`entities/${entityId}`, entityData, 'PUT');
        } else {
            // Create new entity
            savedEntity = await saveData('entities', entityData);
        }
        
        // Close modal
        const entityModal = document.getElementById('entity-modal');
        if (entityModal) {
            entityModal.classList.add('hidden');
            entityModal.style.display = 'none';
        }
        
        // Reload entity data
        await loadEntityData();
        
        return savedEntity;
    } catch (error) {
        console.error('Error saving entity:', error);
        alert('Error saving entity: ' + error.message);
        return null;
    }
}

async function deleteEntity(entityId) {
    if (!confirm('Are you sure you want to delete this entity? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Check if entity has children
        const hasChildren = appState.entities.some(entity => entity.parent_entity_id === entityId);
        if (hasChildren) {
            alert('Cannot delete entity with child entities. Please delete or reassign child entities first.');
            return;
        }
        
        // Check if entity has funds
        const hasFunds = appState.funds.some(fund => fund.entity_id === entityId);
        if (hasFunds) {
            alert('Cannot delete entity with funds. Please delete or reassign funds first.');
            return;
        }
        
        // Delete entity
        await fetch(`/api/entities/${entityId}`, { method: 'DELETE' });
        
        // Reload entity data
        await loadEntityData();
        
        alert('Entity deleted successfully.');
    } catch (error) {
        console.error('Error deleting entity:', error);
        alert('Error deleting entity: ' + error.message);
    }
}

// Fund CRUD Operations
async function saveFund() {
    const fundId = document.getElementById('edit-fund-id-input').value;
    const fundData = {
        code: document.getElementById('fund-code-input').value,
        name: document.getElementById('fund-name-input').value,
        type: document.getElementById('fund-type-select').value,
        status: document.getElementById('fund-status-select').value,
        description: document.getElementById('fund-description-textarea').value,
        entity_id: appState.selectedEntityId
    };
    
    try {
        let savedFund;
        
        if (fundId) {
            // Update existing fund
            savedFund = await saveData(`funds/${fundId}`, fundData, 'PUT');
        } else {
            // Create new fund
            savedFund = await saveData('funds', fundData);
        }
        
        // Close modal
        const fundModal = document.getElementById('fund-modal');
        if (fundModal) {
            fundModal.classList.add('hidden');
            fundModal.style.display = 'none';
        }
        
        // Reload fund data
        await loadFundData();
        
        return savedFund;
    } catch (error) {
        console.error('Error saving fund:', error);
        alert('Error saving fund: ' + error.message);
        return null;
    }
}

// Account CRUD Operations
async function saveAccount() {
    const accountId = document.getElementById('edit-account-id-input').value;
    const accountData = {
        code: document.getElementById('account-code-input').value,
        name: document.getElementById('account-name-input').value,
        type: document.getElementById('account-type-select').value,
        status: document.getElementById('account-status-select').value,
        description: document.getElementById('account-description-textarea').value
    };
    
    try {
        let savedAccount;
        
        if (accountId) {
            // Update existing account
            savedAccount = await saveData(`accounts/${accountId}`, accountData, 'PUT');
        } else {
            // Create new account
            savedAccount = await saveData('accounts', accountData);
        }
        
        // Close modal
        const accountModal = document.getElementById('account-modal');
        if (accountModal) {
            accountModal.classList.add('hidden');
            accountModal.style.display = 'none';
        }
        
        // Reload account data
        await loadAccountData();
        
        return savedAccount;
    } catch (error) {
        console.error('Error saving account:', error);
        alert('Error saving account: ' + error.message);
        return null;
    }
}

// Journal Entry Operations
async function saveJournalEntry(status = 'Draft') {
    const entryId = document.getElementById('edit-je-id-input').value;
    const entryData = {
        entry_date: document.getElementById('journal-entry-date').value,
        reference_number: document.getElementById('journal-entry-reference').value,
        description: document.getElementById('journal-entry-description').value,
        is_inter_entity: document.getElementById('journal-entry-is-inter-entity').checked,
        status: status,
        entity_id: appState.selectedEntityId,
        created_by: 'Current User' // This would be replaced with actual user info
    };
    
    try {
        let savedEntry;
        
        if (entryId) {
            // Update existing entry
            savedEntry = await saveData(`journal-entries/${entryId}`, entryData, 'PUT');
        } else {
            // Create new entry
            savedEntry = await saveData('journal-entries', entryData);
        }
        
        // Close modal
        const journalEntryModal = document.getElementById('journal-entry-modal');
        if (journalEntryModal) {
            journalEntryModal.classList.add('hidden');
            journalEntryModal.style.display = 'none';
        }
        
        // Reload journal entry data
        await loadJournalEntryData();
        
        return savedEntry;
    } catch (error) {
        console.error('Error saving journal entry:', error);
        alert('Error saving journal entry: ' + error.message);
        return null;
    }
}

async function postJournalEntry(entryId) {
    if (!confirm('Are you sure you want to post this journal entry? This action cannot be undone.')) {
        return;
    }
    
    try {
        const entry = appState.journalEntries.find(je => je.id === entryId);
        if (!entry) {
            throw new Error('Journal entry not found');
        }
        
        // Update entry status to Posted
        const updatedEntry = { ...entry, status: 'Posted' };
        await saveData(`journal-entries/${entryId}`, updatedEntry, 'PUT');
        
        // Reload journal entry data
        await loadJournalEntryData();
        
        alert('Journal entry posted successfully.');
    } catch (error) {
        console.error('Error posting journal entry:', error);
        alert('Error posting journal entry: ' + error.message);
    }
}

// Delete Journal Entry
async function deleteJournalEntry(entryId) {
    if (!entryId) return;
    if (!confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) return;

    try {
        const response = await fetch(`/api/journal-entries/${entryId}`, { method: 'DELETE' });
        if (!response.ok) {
            let msg = `API Error: ${response.status}`;
            try {
                const data = await response.json();
                if (data && data.message) msg = data.message;
            } catch {/* ignore */}
            throw new Error(msg);
        }
        await loadJournalEntryData();
        alert('Journal entry deleted successfully.');
    } catch (err) {
        console.error('Error deleting journal entry:', err);
        alert('Error deleting journal entry: ' + err.message);
    }
}

// ===================================================================
// FUND REPORTING FUNCTIONS
// ===================================================================

function populateFundReportsDropdown() {
    /* ------------------------------------------------------------------
     * DEBUGGING
     * ------------------------------------------------------------------
     *  1.  Log when the function is called
     *  2.  Log how many funds are in appState.funds
     *  3.  Log each fund that is being processed
     *  4.  Warn if the dropdown element cannot be found
     * ------------------------------------------------------------------ */
    console.log('[FundReports] populateFundReportsDropdown() called');
    console.log(`[FundReports] appState.funds contains ${appState.funds.length} fund(s)`);

    const fundSelect = document.getElementById('fund-reports-fund-select');
    if (!fundSelect) {
        console.warn('[FundReports] ⚠️  #fund-reports-fund-select element not found – cannot populate dropdown');
        return;
    }

    console.log('[FundReports] 🞄 Dropdown element located – populating options …');

    fundSelect.innerHTML = '<option value="">Select a Fund...</option>';
    
    // Sort funds alphabetically by name
    const sortedFunds = [...appState.funds].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedFunds.forEach(fund => {
        console.debug(`[FundReports]    ↳ adding option: ${fund.name} (${fund.code}) [id=${fund.id}]`);
        const option = document.createElement('option');
        option.value = fund.id;
        option.textContent = `${fund.name} (${fund.code})`;
        fundSelect.appendChild(option);
    });
}

async function generateFundReport() {
    const activeTab = document.querySelector('#fund-reports-page .tab-item.active').dataset.tab;
    
    switch(activeTab) {
        case 'fund-balance-report':
            await generateFundBalanceReport();
            break;
        case 'fund-activity-report':
            await generateFundActivityReport();
            break;
        case 'fund-statement-report':
            await generateFundStatementReport();
            break;
        case 'funds-comparison-report':
            await generateFundsComparisonReport();
            break;
    }
}

async function generateFundBalanceReport() {
    const fundId   = document.getElementById('fund-reports-fund-select').value;
    const content  = document.getElementById('fund-balance-content');

    /* ------------------------------------------------------------------
     * Basic validation – ensure a fund is chosen
     * ------------------------------------------------------------------ */
    if (!fundId) {
        content.innerHTML =
            '<p class="error">Please select a fund to generate the report.</p>';
        return;
    }

    /* ------------------------------------------------------------------
     * Find the fund in the already-loaded list
     * ------------------------------------------------------------------ */
    const fund = appState.funds.find(f => f.id === fundId);
    if (!fund) {
        content.innerHTML = '<p class="error">Fund not found.</p>';
        return;
    }

    /* ------------------------------------------------------------------
     * Use the fund's balance field that was loaded with /api/funds
     * ------------------------------------------------------------------ */
    try {
        const fundBalance = parseFloat(fund.balance || 0);

        content.innerHTML = `
            <h4>Balance for ${fund.name} (${fund.code})</h4>
            <table class="data-table">
                <thead>
                    <tr><th>Metric</th><th>Amount</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Current Fund Balance</strong></td>
                        <td><strong>${formatCurrency(fundBalance)}</strong></td>
                    </tr>
                    <tr><td>Fund Type</td><td>${fund.type || 'Not specified'}</td></tr>
                    <tr><td>Status</td><td>${fund.status || 'Active'}</td></tr>
                    <tr><td>Description</td><td>${fund.description || 'No description'}</td></tr>
                </tbody>
            </table>
            <p><em>Note: Balance shown is taken from the fund record currently loaded in the application.</em></p>
        `;
    } catch (err) {
        content.innerHTML = `<p class="error">Error generating report: ${err.message}</p>`;
    }
}

async function generateFundActivityReport() {
    const fundId     = document.getElementById('fund-reports-fund-select').value;
    const startDate  = document.getElementById('fund-reports-date-start').value;
    const endDate    = document.getElementById('fund-reports-date-end').value;
    const contentDiv = document.getElementById('fund-activity-content');

    /* ------------------------------------------------------------------
     * Validation
     * ------------------------------------------------------------------ */
    if (!fundId) {
        contentDiv.innerHTML =
            '<p class="error">Please select a fund to generate the report.</p>';
        return;
    }

    /* ------------------------------------------------------------------
     * Locate the fund locally
     * ------------------------------------------------------------------ */
    const fund = appState.funds.find(f => f.id === fundId);
    if (!fund) {
        contentDiv.innerHTML = '<p class="error">Fund not found.</p>';
        return;
    }

    /* ------------------------------------------------------------------
     * Filter journal entries by date range (local data)
     * NOTE: Demo-level – uses journalEntries header info, not per-line fund
     * ------------------------------------------------------------------ */
    try {
        contentDiv.innerHTML = '<p>Loading report...</p>';

        let relevantEntries = appState.journalEntries.filter(entry => {
            const d = new Date(entry.entry_date);
            if (startDate && d < new Date(startDate)) return false;
            if (endDate   && d > new Date(endDate))   return false;
            return true;
        });

        // Sort newest first
        relevantEntries.sort((a, b) =>
            new Date(b.entry_date) - new Date(a.entry_date)
        );

        /* ----------  Render results ---------- */
        if (relevantEntries.length === 0) {
            contentDiv.innerHTML = `
                <h4>Activity for ${fund.name} (${fund.code})</h4>
                <p>No transactions found for the selected date range.</p>
                <p><em>Date range: ${startDate || 'Beginning'} ➜ ${endDate || 'Now'}</em></p>
            `;
            return;
        }

        let html = `
            <h4>Activity for ${fund.name} (${fund.code})</h4>
            <p><em>Date range: ${startDate || 'Beginning'} ➜ ${endDate || 'Now'} • ${relevantEntries.length} journal entries</em></p>
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Reference</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
        `;

        relevantEntries.forEach(e => {
            html += `
                <tr>
                    <td>${formatDate(e.entry_date)}</td>
                    <td>${e.reference_number || 'N/A'}</td>
                    <td>${e.description || 'N/A'}</td>
                    <td>${formatCurrency(e.total_amount)}</td>
                    <td><span class="status status-${e.status.toLowerCase()}">${e.status}</span></td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
            <p><em>Demo Note: This lists journal entries only. Full implementation would drill into individual fund-specific lines.</em></p>
        `;

        contentDiv.innerHTML = html;

    } catch (err) {
        contentDiv.innerHTML =
            `<p class="error">Error generating report: ${err.message}</p>`;
    }
}

async function generateFundStatementReport() {
    const fundId = document.getElementById('fund-reports-fund-select').value;
    const contentDiv = document.getElementById('fund-statement-content');

    if (!fundId) {
        contentDiv.innerHTML = '<p class="error">Please select a fund to generate the report.</p>';
        return;
    }

    try {
        contentDiv.innerHTML = '<p>Loading report...</p>';
        const data = await fetchData(`reports/fund-statement/${fundId}`);
        
        let revenue = 0;
        let expense = 0;
        
        let tableHTML = `
            <table class="data-table">
                <thead>
                    <tr><th>Account Type</th><th>Net Amount</th></tr>
                </thead>
                <tbody>
        `;

        data.forEach(item => {
            if (item.account_type === 'Revenue') revenue += parseFloat(item.net);
            if (item.account_type === 'Expense') expense += parseFloat(item.net);
            
            tableHTML += `
                <tr>
                    <td>${item.account_type}</td>
                    <td>${formatCurrency(item.net)}</td>
                </tr>
            `;
        });

        const netIncome = revenue + expense; // Expenses are negative, so we add

        tableHTML += `
                </tbody>
                <tfoot>
                    <tr><td><strong>Total Revenue</strong></td><td><strong>${formatCurrency(revenue)}</strong></td></tr>
                    <tr><td><strong>Total Expenses</strong></td><td><strong>${formatCurrency(expense)}</strong></td></tr>
                    <tr><td><strong>Net Income/Loss</strong></td><td><strong>${formatCurrency(netIncome)}</strong></td></tr>
                </tfoot>
            </table>
        `;
        contentDiv.innerHTML = tableHTML;

    } catch (error) {
        contentDiv.innerHTML = `<p class="error">Error generating report: ${error.message}</p>`;
    }
}
// Navigation Functions
function showPage(pageId) {
    console.log(`[Navigation] Switching to page: ${pageId}`);
    /* --------------------------------------------------------------
     * 1.  Switch visible page content
     * 2.  Update navigation highlight so the blue bar follows
     * -------------------------------------------------------------- */
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`${pageId}-page`);
    if (pageEl) {
        pageEl.classList.add('active');
        appState.currentPage = pageId;
    } else {
        console.error(`[Navigation] Page element not found: ${pageId}-page`);
    }

    /* --------------------------------------------------------------
     * Navigation highlighting
     * -------------------------------------------------------------- */
    // Remove existing highlight
    document.querySelectorAll('.nav-item').forEach(nav =>
        nav.classList.remove('active')
    );

    // Add highlight to the nav item that matches the pageId
    const activeNav = document.querySelector(
        `.nav-item[data-page="${pageId}"]`
    );
    if (activeNav) {
        activeNav.classList.add('active');
    } else {
        console.warn(
            `[Navigation] Nav item not found for pageId: ${pageId}`
        );
    }
}

function showTab(panelContainer, tabId) {
    console.log(`[Navigation] Switching to tab: ${tabId}`);
    panelContainer.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    panelContainer.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    const tabItem = panelContainer.querySelector(`.tab-item[data-tab="${tabId}"]`);
    const panel = panelContainer.querySelector(`#${tabId}`);
    if (tabItem) tabItem.classList.add('active');
    if (panel) panel.classList.add('active');
}

function initializeNavigation() {
    console.log('[Navigation] Initializing navigation handlers...');
    
    // Main navigation
    document.querySelectorAll('.nav-item[data-page]').forEach(nav => {
        nav.addEventListener('click', e => {
            console.log('[Navigation] Nav item clicked:', e.currentTarget.dataset.page);
            const page = e.currentTarget.dataset.page;
            if (!page) return;
            showPage(page);

            // Load page-specific data
            if (page === 'dashboard') {
                console.log('[Navigation] Loading dashboard data');
                loadDashboardData();
            } else if (page === 'settings') {
                showTab(document.getElementById('settings-page'), 'settings-users');
            } else if (page === 'fund-reports') {
                // ensure dropdown is current each time Fund Reports opens
                populateFundReportsDropdown();
            }
        });
    });

    // Settings tabs
    const settingsPage = document.getElementById('settings-page');
    if (settingsPage) {
        settingsPage.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', e => {
                const tabId = e.currentTarget.dataset.tab;
                showTab(settingsPage, tabId);
                appState.currentTab = tabId;
                if (tabId === 'settings-bank-accounts' && typeof loadBankAccountData === 'function') {
                    loadBankAccountData();
                }
            });
        });
    }

    // Modal close buttons
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const modalId = e.currentTarget.dataset.modalId;
            const modalEl = document.getElementById(modalId);
            if (modalEl) modalEl.style.display = 'none';
        });
    });

    // Entity selector
    const entitySelector = document.getElementById('entity-selector');
    if (entitySelector) {
        entitySelector.addEventListener('change', e => {
            appState.selectedEntityId = e.target.value;
            loadDashboardData();
            updateFundsTable();
            updateJournalEntriesTable();
        });
    }

    // Consolidated view toggle
    const consolidatedToggle = document.getElementById('consolidated-view-toggle');
    if (consolidatedToggle) {
        consolidatedToggle.addEventListener('change', e => {
            appState.isConsolidatedView = e.target.checked;
            document.body.classList.toggle('consolidated-view', appState.isConsolidatedView);
            loadDashboardData();
        });
    }

    /* ------------------------------------------------------------------
     * Entity Modal – Save button
     * ------------------------------------------------------------------
     * Wire #btn-save-entity to the saveEntity() function so that editing
     * or creating an entity actually persists the data and closes the
     * modal.  This listener was previously missing, causing the “Save”
     * button to appear unresponsive.
     * ------------------------------------------------------------------ */
    const btnSaveEntity = document.getElementById('btn-save-entity');
    if (btnSaveEntity) {
        btnSaveEntity.addEventListener('click', async () => {
            try {
                await saveEntity();
            } catch (err) {
                console.error('[Entity] Save failed:', err);
            }
        });
    }
}

// Application Initialization
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[Init] Application initializing...');

    initializeNavigation();
    await checkDatabaseConnection();

    // Load core data in parallel
    await Promise.all([
        loadEntityData(),
        loadFundData(),
        loadAccountData(),
        loadJournalEntryData(),
        loadUserData()
    ]);

    // All core datasets (including entities & funds) are now in memory – 
    // safe to rebuild the hierarchy diagram exactly once during start-up.
    updateEntityHierarchyVisualization();

    // Load dashboard data
    loadDashboardData();

    console.log('[Init] Application ready.');
});
