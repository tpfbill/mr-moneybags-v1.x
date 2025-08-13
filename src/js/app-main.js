/**
 * @file app-main.js
 * @description Main application module for the Non-Profit Fund Accounting System.
 * This module orchestrates the interaction between all other modules and
 * initializes the application.
 */

// Import authentication module
import {
    ensureAuthenticated,
    loadCurrentUser,
    applyRoleBasedAccess,
    logoutUser
} from './app-auth.js';

// Import configuration and state
import { 
    API_BASE, 
    appState,
    formatCurrency,
    formatDate,
    formatPercentage,
    getRelevantEntityIds,
    getRelevantFunds
} from './app-config.js';

// Import data management functions
import {
    setUIUpdaters,
    fetchData,
    saveData,
    checkDatabaseConnection,
    loadEntityData,
    loadFundData,
    loadAccountData,
    loadJournalEntryData,
    loadUserData,
    loadDashboardData,
    loadAllCoreData
} from './app-data.js';

// Import UI update functions
import {
    updateEntitySelector,
    updateEntitiesTable,
    updateChartOfAccountsTable,
    updateFundsTable,
    updateJournalEntriesTable,
    updateUsersTable,
    updateDashboardTitle,
    updateDashboardSummaryCards,
    updateDashboardFundBalances,
    updateDashboardRecentTransactions,
    updateDashboardUnpostedEntries,
    updateEntityHierarchyVisualization,
    initializeDashboardCharts
} from './app-ui.js';

// Import modal management functions
import {
    setDataLoaders,
    showModal,
    hideModal,
    showToast,
    openEntityModal,
    saveEntity,
    deleteEntity,
    openFundModal,
    saveFund,
    openAccountModal,
    saveAccount,
    openJournalEntryModal,
    saveJournalEntry,
    postJournalEntry,
    deleteJournalEntry,
    openUserModal,
    saveUser,
    initializeModalEventListeners
} from './app-modals.js';

/**
 * Initialize the application
 */
async function initializeApp() {
    console.log('Initializing application...');
    
    // Check authentication
    const authResult = await ensureAuthenticated();
    
    if (!authResult.authenticated) {
        console.log('Not authenticated, redirecting to login page');
        return;
    }
    
    // Store current user in app state
    appState.currentUser = authResult.user;
    console.log('Authenticated as:', appState.currentUser.username);
    
    // Connect data layer with UI updates
    connectDataWithUI();
    
    // Connect modal events with data refreshes
    connectModalsWithData();
    
    // Initialize modal event listeners
    initializeModalEventListeners();
    
    // Initialize navigation
    initializeNavigation();
    
    // Initialize entity selector
    initializeEntitySelector();
    
    // Initialize page-specific elements
    initializePageElements();
    
    // Check database connection
    await checkDatabaseConnection();
    
    // Load current user info
    await loadCurrentUser();
    
    // Load all core data
    await loadAllCoreData();
    
    // Show initial page (dashboard)
    showPage('dashboard');

    // Start periodic DB connection monitoring (runs once)
    initializeDatabaseConnectionMonitoring();
    
    console.log('Application initialized successfully');
}

/**
 * Connect data layer with UI updates
 */
function connectDataWithUI() {
    // Set UI updaters for data module
    setUIUpdaters({
        updateEntitySelector,
        updateEntitiesTable,
        updateChartOfAccountsTable,
        updateFundsTable,
        updateJournalEntriesTable,
        updateUsersTable,
        updateDashboardTitle,
        updateDashboardSummaryCards,
        updateDashboardFundBalances,
        updateDashboardRecentTransactions,
        updateDashboardUnpostedEntries,
        updateEntityHierarchyVisualization,
        initializeDashboardCharts
    });
}

/**
 * Connect modal events with data refreshes
 */
function connectModalsWithData() {
    // Set data loaders for modal module
    setDataLoaders({
        loadEntityData,
        loadFundData,
        loadAccountData,
        loadJournalEntryData,
        loadUserData,
        loadDashboardData
    });
}

/**
 * Initialize navigation
 */
function initializeNavigation() {
    // Get all navigation items
    const navItems = document.querySelectorAll('.nav-item');
    
    // Add click event listeners
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page) {
                showPage(page);
            }
        });
    });
    
    // Add logout button event listener
    const logoutBtn = document.getElementById('btnLogout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            logoutUser();
        });
    }
}

/**
 * Show a specific page
 * @param {string} pageId - ID of the page to show
 */
function showPage(pageId) {
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.classList.remove('active');
    });
    
    // Show the selected page
    const selectedPage = document.getElementById(`${pageId}-page`);
    if (selectedPage) {
        selectedPage.classList.add('active');
    }
    
    // Update active navigation item
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update app state
    appState.currentPage = pageId;
    
    // Handle page-specific initialization
    switch (pageId) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'journal-entries':
            loadJournalEntryData();
            break;
        case 'funds':
            loadFundData();
            break;
        case 'chart-of-accounts':
            loadAccountData();
            break;
        case 'settings':
            initializeSettingsTabs();
            break;
    }
}

/**
 * Initialize entity selector
 */
function initializeEntitySelector() {
    const entitySelector = document.getElementById('entity-selector');
    const consolidatedViewToggle = document.getElementById('consolidated-view-toggle');
    
    if (entitySelector) {
        entitySelector.addEventListener('change', () => {
            appState.selectedEntityId = entitySelector.value;
            
            // Update consolidated view toggle based on selected entity
            if (consolidatedViewToggle) {
                const selectedEntity = appState.entities.find(entity => entity.id === appState.selectedEntityId);
                consolidatedViewToggle.disabled = !selectedEntity || !selectedEntity.is_consolidated;
                
                // Reset consolidated view if entity doesn't support it
                if (!selectedEntity || !selectedEntity.is_consolidated) {
                    consolidatedViewToggle.checked = false;
                    appState.isConsolidatedView = false;
                }
            }
            
            // Reload data for current page
            refreshCurrentPageData();
        });
    }
    
    if (consolidatedViewToggle) {
        consolidatedViewToggle.addEventListener('change', () => {
            appState.isConsolidatedView = consolidatedViewToggle.checked;
            
            // Reload data for current page
            refreshCurrentPageData();
        });
    }
}

/**
 * Refresh data for the current page
 */
function refreshCurrentPageData() {
    switch (appState.currentPage) {
        case 'dashboard':
            loadDashboardData();
            break;
        case 'journal-entries':
            updateJournalEntriesTable();
            break;
        case 'funds':
            updateFundsTable();
            break;
        case 'chart-of-accounts':
            updateChartOfAccountsTable();
            break;
    }
}

/**
 * Initialize settings tabs
 */
function initializeSettingsTabs() {
    /* ------------------------------------------------------------------
     * HTML structure (index.html):
     *   • Tab buttons  : <div class="tab-item" data-tab="settings-users">...</div>
     *   • Tab contents : <div id="settings-users" class="tab-panel">…</div>
     *
     * The original (monolithic) code referenced non-existent classes
     * `.settings-tab-button` and `.settings-tab-content`.  After the
     * modular refactor the selectors were never updated, which left the
     * Settings page tabs non-functional.  We simply align the selectors
     * with the actual markup and adjust the ID comparison logic.
     * ------------------------------------------------------------------ */

    const tabButtons  = document.querySelectorAll('.tab-item');
    const tabContents = document.querySelectorAll('.tab-panel');
    
    // Load initial data
    loadEntityData();
    loadUserData();
    
    // Add click event listeners to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;
            
            // Update active tab button
            tabButtons.forEach(btn => {
                if (btn.dataset.tab === tab) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
            
            // Show selected tab content
            tabContents.forEach(content => {
                // Content IDs match data-tab exactly (e.g., "settings-users")
                if (content.id === `${tab}`) {
                    content.classList.add('active');
                } else {
                    content.classList.remove('active');
                }
            });
            
            // Update app state
            appState.currentTab = tab;
            
            // Handle tab-specific initialization
            switch (tab) {
                case 'settings-entities':
                    updateEntityHierarchyVisualization();
                    break;
                case 'settings-users':
                    loadUserData();
                    break;
                case 'settings-organization':
                    loadOrganizationSettings();
                    break;
            }
        });
    });
    
    // Show default tab (users)
    const defaultTab = document.querySelector('.tab-item[data-tab="settings-users"]');
    if (defaultTab) {
        defaultTab.click();
    }
}

/**
 * Load organization settings
 */
async function loadOrganizationSettings() {
    try {
        const settings = await fetchData('settings/organization');
        appState.organizationSettings = settings;
        
        // Update form fields
        const form = document.getElementById('organization-settings-form');
        if (form) {
            form.elements['org-name'].value = settings.name || '';
            form.elements['org-address'].value = settings.address || '';
            form.elements['org-phone'].value = settings.phone || '';
            form.elements['org-email'].value = settings.email || '';
            form.elements['org-website'].value = settings.website || '';
            form.elements['org-tax-id'].value = settings.tax_id || '';
            form.elements['org-fiscal-year-start'].value = settings.fiscal_year_start || '01-01';
            form.elements['org-base-currency'].value = settings.base_currency || 'USD';
        } else {
            // If no form exists, try to update individual input fields
            const nameInput = document.getElementById('org-name-input');
            const taxIdInput = document.getElementById('org-tax-id-input');
            
            if (nameInput) nameInput.value = settings.name || '';
            if (taxIdInput) taxIdInput.value = settings.tax_id || '';
        }
    } catch (error) {
        console.error('Error loading organization settings:', error);
        showToast('Error loading organization settings', 'error');
    }
}

/**
 * Save organization settings
 * @param {Event} event - Form submit event
 */
async function saveOrganizationSettings(event) {
    event.preventDefault();
    
    const form = event.target;
    
    // Get form data
    const data = {
        name: form.elements['org-name'].value,
        address: form.elements['org-address'].value,
        phone: form.elements['org-phone'].value,
        email: form.elements['org-email'].value,
        website: form.elements['org-website'].value,
        tax_id: form.elements['org-tax-id'].value,
        fiscal_year_start: form.elements['org-fiscal-year-start'].value,
        base_currency: form.elements['org-base-currency'].value
    };
    
    try {
        await saveData('settings/organization', data, 'PUT');
        appState.organizationSettings = data;
        showToast('Organization settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving organization settings:', error);
        showToast('Error saving organization settings', 'error');
    }
}

/**
 * Save organization settings from individual input fields
 * (Used when no form wrapper is present)
 */
async function saveOrganizationSettingsFromInputs() {
    try {
        // Read values from individual input fields
        const nameInput = document.getElementById('org-name-input');
        const taxIdInput = document.getElementById('org-tax-id-input');
        
        // Build minimal payload
        const payload = {
            name: nameInput ? nameInput.value : '',
            tax_id: taxIdInput ? taxIdInput.value : ''
        };
        
        // Save data
        const result = await saveData('settings/organization', payload, 'PUT');
        
        // Update app state and show success toast
        appState.organizationSettings = {
            ...appState.organizationSettings,
            ...payload
        };
        
        showToast('Organization settings saved successfully', 'success');
    } catch (error) {
        // Handle 404 error differently (just log, no toast)
        if (error.status === 404) {
            console.info('Organization settings endpoint not implemented yet');
        } else {
            console.error('Error saving organization settings:', error);
            showToast('Error saving organization settings', 'error');
        }
    }
}

/**
 * Initialize page-specific elements
 */
function initializePageElements() {
    // Initialize add buttons
    initializeAddButtons();
    
    // Initialize organization settings form
    const orgSettingsForm = document.getElementById('organization-settings-form');
    if (orgSettingsForm) {
        orgSettingsForm.addEventListener('submit', saveOrganizationSettings);
    }
    
    // Initialize organization settings save button (without form wrapper)
    const saveOrgSettingsBtn = document.getElementById('btnSaveOrganizationSettings');
    if (saveOrgSettingsBtn) {
        saveOrgSettingsBtn.addEventListener('click', saveOrganizationSettingsFromInputs);
    }
    
    // Initialize filter selects
    initializeFilterSelects();
}

/**
 * Initialize add buttons
 */
function initializeAddButtons() {
    // Add entity button
    const addEntityBtn = document.getElementById('btn-add-entity');
    if (addEntityBtn) {
        addEntityBtn.addEventListener('click', () => {
            openEntityModal();
        });
    }
    
    // Add fund button
    const addFundBtn = document.getElementById('btnAddFund');
    if (addFundBtn) {
        addFundBtn.addEventListener('click', () => {
            openFundModal();
        });
    }
    
    // Add account button
    const addAccountBtn = document.getElementById('btnAddAccount');
    if (addAccountBtn) {
        addAccountBtn.addEventListener('click', () => {
            openAccountModal();
        });
    }
    
    // Add journal entry button
    const addJournalEntryBtn = document.getElementById('btnNewJournalEntry');
    if (addJournalEntryBtn) {
        addJournalEntryBtn.addEventListener('click', () => {
            openJournalEntryModal();
        });
    }
    
    // Add user button
    const addUserBtn = document.getElementById('btnAddUser');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            openUserModal();
        });
    }
}

/**
 * Initialize filter selects
 */
function initializeFilterSelects() {
    // Journal entries filter
    const jeFilterSelect = document.getElementById('journal-entries-filter-select');
    if (jeFilterSelect) {
        jeFilterSelect.addEventListener('change', () => {
            updateJournalEntriesTable();
        });
    }
    
    // Funds filter
    const fundsFilterSelect = document.getElementById('funds-filter-select');
    if (fundsFilterSelect) {
        fundsFilterSelect.addEventListener('change', () => {
            updateFundsTable();
        });
    }
}

/**
 * Handle database connection status updates
 */
function initializeDatabaseConnectionMonitoring() {
    // Check connection every 30 seconds
    setInterval(async () => {
        await checkDatabaseConnection();
    }, 30000);
}

// Initialize the application when the DOM is fully loaded
// (Initialization is now triggered solely by app.js entry point to
// prevent double-initialisation issues.)

// Export main functions for potential use in other modules
export {
    initializeApp,
    showPage,
    refreshCurrentPageData
};
