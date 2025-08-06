/**
 * @file ui.js
 * @description UI module for the Non-Profit Fund Accounting System.
 * This module handles all rendering, table updates, and UI-specific logic.
 */

(function(window) {
    'use strict';

    // --- Private Variables and Functions ---

    const _elements = {}; // Will be populated in init()
    // Tracks whether toast styles have been injected
    let _toastStylesInjected = false;

    /**
     * Formats a currency value with the specified currency code
     * @param {number} amount - The amount to format
     * @param {string} currencyCode - The currency code (e.g. 'USD')
     * @returns {string} Formatted currency string
     */
    function _formatCurrency(amount, currencyCode = 'USD') {
        return `$${(amount || 0).toFixed(2)} ${currencyCode}`;
    }

    /**
     * Gets entity name from ID
     * @param {string} id - Entity ID
     * @param {object} state - Application state
     * @returns {string} Entity name or 'N/A' if not found
     */
    function _getEntityName(id, state) {
        const entity = state.entities.find(e => e.id === id);
        return entity ? entity.name : "N/A";
    }

    /**
     * Gets relevant entity IDs based on current view mode
     * @param {object} state - Application state
     * @returns {Array<string>} Array of entity IDs
     */
    function _getRelevantEntityIds(state) {
        if (state.isConsolidatedViewActive) return state.entities.map(e => e.id);
        return [state.currentEntityId].filter(Boolean);
    }

    /**
     * Gets accounts filtered by entity and status
     * @param {object} state - Application state
     * @param {string} [entityIdFilter] - Optional specific entity ID filter
     * @returns {Array<object>} Filtered accounts
     */
    function _getAccountsForDisplay(state, entityIdFilter = null) {
        const ids = entityIdFilter ? [entityIdFilter] : _getRelevantEntityIds(state);
        if (ids.length === 0 && !state.isConsolidatedViewActive && !entityIdFilter) return [];
        return state.accounts.filter(a => ids.includes(a.entityId) && a.status === 'Active');
    }

    /**
     * Gets funds filtered by entity and status
     * @param {object} state - Application state
     * @param {string} [entityIdFilter] - Optional specific entity ID filter
     * @returns {Array<object>} Filtered funds
     */
    function _getFundsForDisplay(state, entityIdFilter = null) {
        const ids = entityIdFilter ? [entityIdFilter] : _getRelevantEntityIds(state);
        if (ids.length === 0 && !state.isConsolidatedViewActive && !entityIdFilter) return [];
        return state.funds.filter(f => ids.includes(f.entityId) && f.status === 'Active');
    }

    /**
     * Gets journal entries filtered by entity
     * @param {object} state - Application state
     * @returns {Array<object>} Filtered journal entries
     */
    function _getJournalEntriesForDisplay(state) {
        const ids = _getRelevantEntityIds(state);
        if (ids.length === 0 && !state.isConsolidatedViewActive) return [];
        return state.journalEntries.filter(je => ids.includes(je.entityId));
    }

    /**
     * Updates the dashboard entity display
     * @param {object} state - Application state
     */
    function _updateDashboardEntityDisplay(state) {
        const displayEl = document.getElementById('dashboard-current-entity');
        if (displayEl) {
            const name = state.isConsolidatedViewActive
                ? "Consolidated View"
                : _getEntityName(state.currentEntityId, state);
            displayEl.textContent = state.currentEntityId
                ? `${name} (ID: ${state.currentEntityId})`
                : 'None Selected';
        }
    }

    /**
     * Renders the dashboard with summary cards and tables
     * @param {object} state - Application state
     */
    async function _renderDashboard(state) {
        console.log("UI: Rendering dashboard...");
        
        // Summary cards
        const cardsContainer = document.getElementById('dashboard-summary-cards');
        if (cardsContainer) {
            const accounts = _getAccountsForDisplay(state);
            const funds = _getFundsForDisplay(state);
            
            let totalAssets = 0, totalLiabilities = 0, totalRevenue = 0, totalExpenses = 0;
            
            accounts.forEach(account => {
                if (account.type === 'Asset') totalAssets += account.balance;
                if (account.type === 'Liability') totalLiabilities += account.balance;
                if (account.type === 'Revenue') totalRevenue += account.balance;
                if (account.type === 'Expense') totalExpenses += account.balance;
            });
            
            const netAssets = totalAssets - totalLiabilities;
            const netIncome = totalRevenue - totalExpenses;
            
            cardsContainer.innerHTML = `
                <div class="card">
                    <div class="card-title">Total Assets</div>
                    <div class="card-value">${_formatCurrency(totalAssets)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Total Liabilities</div>
                    <div class="card-value">${_formatCurrency(totalLiabilities)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Net Assets</div>
                    <div class="card-value">${_formatCurrency(netAssets)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Total Revenue</div>
                    <div class="card-value">${_formatCurrency(totalRevenue)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Total Expenses</div>
                    <div class="card-value">${_formatCurrency(totalExpenses)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Net Income</div>
                    <div class="card-value">${_formatCurrency(netIncome)}</div>
                </div>
            `;
        }
        
        // Fund balances table
        const fundBalancesTable = document.getElementById('dashboard-fund-balances-table').querySelector('tbody');
        if (fundBalancesTable) {
            const funds = _getFundsForDisplay(state);
            if (funds.length === 0) {
                fundBalancesTable.innerHTML = '<tr><td colspan="4" class="preview-placeholder">No funds available.</td></tr>';
            } else {
                const totalFunds = funds.reduce((sum, fund) => sum + fund.balance, 0);
                
                fundBalancesTable.innerHTML = funds.map(fund => {
                    const percent = totalFunds > 0 ? (fund.balance / totalFunds * 100).toFixed(1) : 0;
                    return `
                        <tr>
                            <td>${fund.name}</td>
                            <td>${fund.type}</td>
                            <td>${_formatCurrency(fund.balance)}</td>
                            <td>${percent}%</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Recent transactions
        const transactionsTable = document.getElementById('dashboard-recent-transactions-table').querySelector('tbody');
        if (transactionsTable) {
            const journalEntries = _getJournalEntriesForDisplay(state);
            if (journalEntries.length === 0) {
                transactionsTable.innerHTML = '<tr><td colspan="5" class="preview-placeholder">No recent transactions available.</td></tr>';
            } else {
                // Sort by date, newest first
                const sortedEntries = [...journalEntries].sort((a, b) => new Date(b.date) - new Date(a.date));
                // Take only the first 5
                const recentEntries = sortedEntries.slice(0, 5);
                
                transactionsTable.innerHTML = recentEntries.map(je => {
                    return `
                        <tr>
                            <td>${je.date}</td>
                            <td>${je.reference}</td>
                            <td>${je.description}</td>
                            <td>${_formatCurrency(je.totalAmount)}</td>
                            <td><span class="status status-${je.status.toLowerCase()}">${je.status}</span></td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        console.log("UI: Dashboard rendered.");
    }

    /**
     * Renders the Chart of Accounts table
     * @param {object} state - Application state
     */
    async function _renderChartOfAccountsTable(state) {
        console.log("UI: Rendering Chart of Accounts table...");
        
        const tbody = document.getElementById('chart-of-accounts-table').querySelector('tbody');
        if (!tbody) return;
        
        const accounts = _getAccountsForDisplay(state);
        
        if (accounts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="preview-placeholder">No accounts available.</td></tr>';
            return;
        }
        
        tbody.innerHTML = accounts.map(account => {
            return `
                <tr>
                    <td>${account.code}</td>
                    <td>${account.name}</td>
                    <td>${account.type}</td>
                    <td>${_formatCurrency(account.balance)}</td>
                    <td><span class="status status-${account.status.toLowerCase()}">${account.status}</span></td>
                    <td>
                        <button class="action-button btn-edit-account" data-id="${account.id}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log("UI: Chart of Accounts table rendered.");
    }

    /**
     * Renders the Funds table
     * @param {object} state - Application state
     */
    async function _renderFundsTable(state) {
        console.log("UI: Rendering Funds table...");
        
        const tbody = document.getElementById('funds-table').querySelector('tbody');
        if (!tbody) return;
        
        const funds = _getFundsForDisplay(state);
        
        if (funds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="preview-placeholder">No funds available.</td></tr>';
            return;
        }
        
        tbody.innerHTML = funds.map(fund => {
            return `
                <tr>
                    <td>${fund.code}</td>
                    <td>${fund.name}</td>
                    <td>${fund.type}</td>
                    <td>${_formatCurrency(fund.balance)}</td>
                    <td><span class="status status-${fund.status.toLowerCase()}">${fund.status}</span></td>
                    <td>
                        <button class="action-button btn-edit-fund" data-id="${fund.id}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log("UI: Funds table rendered.");
    }

    /**
     * Renders the Journal Entries table
     * @param {object} state - Application state
     */
    async function _renderJournalEntriesTable(state) {
        console.log("UI: Rendering Journal Entries table...");
        
        const tbody = document.getElementById('journal-entries-table').querySelector('tbody');
        if (!tbody) return;
        
        const journalEntries = _getJournalEntriesForDisplay(state);
        
        if (journalEntries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="preview-placeholder">No journal entries available.</td></tr>';
            return;
        }
        
        tbody.innerHTML = journalEntries.map(je => {
            return `
                <tr>
                    <td>${je.date}</td>
                    <td>${je.reference}</td>
                    <td>${je.description}</td>
                    <td>${_formatCurrency(je.totalAmount)}</td>
                    <td><span class="status status-${je.status.toLowerCase()}">${je.status}</span></td>
                    <td>${je.createdBy || 'System'}</td>
                    <td>
                        <button class="action-button btn-edit-je" data-id="${je.id}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log("UI: Journal Entries table rendered.");
    }

    /**
     * Renders the Entities table
     * @param {object} state - Application state
     */
    async function _renderEntitiesTable(state) {
        console.log("UI: Rendering Entities table...");
        
        const tbody = document.getElementById('entities-table').querySelector('tbody');
        if (!tbody) return;
        
        const entities = state.entities;
        
        if (entities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="preview-placeholder">No entities available.</td></tr>';
            return;
        }
        
        tbody.innerHTML = entities.map(entity => {
            const parentName = entity.parent_entity_id ? _getEntityName(entity.parent_entity_id, state) : 'None';
            
            return `
                <tr>
                    <td>${entity.code}</td>
                    <td>${entity.name}</td>
                    <td>${parentName}</td>
                    <td><span class="status status-${entity.status.toLowerCase()}">${entity.status}</span></td>
                    <td>${entity.base_currency || 'USD'}</td>
                    <td>${entity.fiscal_year_start || '01-01'}</td>
                    <td>${entity.is_consolidated ? 'Yes' : 'No'}</td>
                    <td>
                        <button class="action-button btn-edit-entity" data-id="${entity.id}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log("UI: Entities table rendered.");
    }

    /**
     * Updates the visual representation of entity relationships
     * @param {object} state - Application state
     */
    function _updateEntityRelationshipViz(state) {
        console.log("UI: Updating entity relationship visualization...");

        /* ------------------------------------------------------------------
         * Prefer using the dedicated entityHierarchy module, if present.
         * That module produces a richer, interactive tree.  We only fall
         * back to the simple UL/LI list if the helper is missing.
         * ------------------------------------------------------------------*/
        if (window.entityHierarchy &&
            typeof window.entityHierarchy.initializeHierarchyVisualization === 'function') {
            // Ensure hierarchy data is loaded then (re)render the viz.
            if (typeof window.entityHierarchy.loadHierarchyData === 'function') {
                // Load without forcing re-initialisation – caller decides
                window.entityHierarchy.loadHierarchyData(false);
            }
            window.entityHierarchy.initializeHierarchyVisualization(true);
            return;
        }
        
        const vizContainer = document.getElementById('entity-relationship-viz');
        if (!vizContainer) return;
        
        const entities = state.entities;
        
        if (entities.length === 0) {
            vizContainer.innerHTML = '<p class="preview-placeholder">No entities available.</p>';
            return;
        }
        
        // Find top-level entities (no parent)
        const topLevelEntities = entities.filter(e => !e.parent_entity_id);
        
        // Recursive function to build the tree
        function buildEntityTree(parentId) {
            const children = entities.filter(e => e.parent_entity_id === parentId);
            if (children.length === 0) return '';
            
            let html = '<ul>';
            children.forEach(child => {
                html += `<li>${child.name} (${child.code})${buildEntityTree(child.id)}</li>`;
            });
            html += '</ul>';
            return html;
        }
        
        // Build the final HTML
        let html = '<ul>';
        topLevelEntities.forEach(entity => {
            html += `<li>${entity.name} (${entity.code})${buildEntityTree(entity.id)}</li>`;
        });
        html += '</ul>';
        
        vizContainer.innerHTML = html;
        console.log("UI: Entity relationship visualization updated.");
    }

    /**
     * Renders the Users table in the settings
     * @param {object} state - Application state
     */
    async function _renderUsersTable(state) {
        console.log("UI: Rendering Users table...");
        
        const tbody = document.getElementById('users-table').querySelector('tbody');
        if (!tbody) return;
        
        const users = state.users;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="preview-placeholder">No users available.</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => {
            return `
                <tr>
                    <td>${user.name}</td>
                    <td>${user.email}</td>
                    <td>${user.role}</td>
                    <td><span class="status status-${user.status.toLowerCase()}">${user.status}</span></td>
                    <td>
                        <button class="action-button btn-edit-user" data-id="${user.id}">Edit</button>
                    </td>
                </tr>
            `;
        }).join('');
        
        console.log("UI: Users table rendered.");
    }

    /**
     * Populates the organization settings form
     * @param {object} state - Application state
     */
    async function _populateOrganizationSettingsForm(state) {
        console.log("UI: Populating organization settings form...");
        
        const settings = state.organizationSettings;
        
        document.getElementById('org-name-input').value = settings.name || '';
        document.getElementById('org-tax-id-input').value = settings.taxId || '';
        document.getElementById('org-phone-input').value = settings.phone || '';
        document.getElementById('org-email-input').value = settings.email || '';
        document.getElementById('org-address-street-input').value = settings.addressStreet || '';
        document.getElementById('org-address-city-input').value = settings.addressCity || '';
        document.getElementById('org-address-state-input').value = settings.addressState || '';
        document.getElementById('org-address-zip-input').value = settings.addressZip || '';
        document.getElementById('org-default-currency-input').value = settings.defaultCurrency || 'USD';
        document.getElementById('org-global-fiscal-year-start-input').value = settings.globalFiscalYearStart || '01-01';
        
        console.log("UI: Organization settings form populated.");
    }

    /**
     * Populates the entity selector dropdown
     * @param {object} state - Application state
     */
    function _populateEntitySelector(state) {
        console.log("UI: Populating entity selector...");
        
        const selector = document.getElementById('entity-selector');
        if (!selector) {
            console.error("UI: Entity selector element with ID 'entity-selector' not found!");
            return;
        }
        
        // Temporarily show a loading message
        selector.innerHTML = '<option value="">Populating...</option>';
        
        if (!state.entities || state.entities.length === 0) {
            console.warn("UI: No entities available in state to populate selector.");
            selector.innerHTML = '<option value="">No Entities Found</option>';
            return;
        }
        
        console.log(`UI: Found ${state.entities.length} total entities in state.`);

        // Filter for active, non-consolidated entities to be selectable in the dropdown
        const activeEntities = state.entities.filter(e => e.status === 'Active' && !e.is_consolidated);
        
        console.log(`UI: Found ${activeEntities.length} active, non-consolidated entities for selector.`);

        // Clear selector before adding new options
        selector.innerHTML = '';
        
        if (activeEntities.length === 0) {
            selector.innerHTML = '<option value="">No selectable entities</option>';
            console.warn("UI: No active, non-consolidated entities found to populate selector.");
            return;
        }

        // Add a default "Select Entity" option
        const defaultOption = new Option('-- Select Entity --', '');
        selector.add(defaultOption);

        // Add each selectable entity to the dropdown
        activeEntities.forEach(entity => {
            const option = new Option(entity.name, entity.id);
            selector.add(option);
            console.log(`UI: Added entity to selector: ${entity.name} (ID: ${entity.id})`);
        });
        
        // Set the current selection based on the application state
        if (state.currentEntityId && selector.querySelector(`option[value="${state.currentEntityId}"]`)) {
            selector.value = state.currentEntityId;
            console.log(`UI: Set selected entity to currentEntityId: ${state.currentEntityId}`);
        } else if (activeEntities.length > 0) {
            // If no current entity is set, or the set one is invalid, default to the first one
            state.currentEntityId = activeEntities[0].id;
            selector.value = state.currentEntityId;
            console.log(`UI: Defaulted selected entity to first active entity: ${state.currentEntityId}`);
        } else {
            // No entity could be selected
            state.currentEntityId = null;
            console.log(`UI: No entity selected.`);
        }
        
        console.log("UI: Entity selector populated successfully.");
    }

    /**
     * Updates the database status indicator in the UI
     * @param {boolean} isConnected - Whether the database is connected
     */
    function _updateDbStatusIndicator(isConnected) {
        const indicator = document.getElementById('db-status-indicator');
        if (!indicator) return;
        
        if (isConnected) {
            indicator.textContent = "DB Connected";
            indicator.className = "db-status-indicator connected";
        } else {
            indicator.textContent = "DB Offline (Local Mode)";
            indicator.className = "db-status-indicator offline";
        }
    }

    /* ------------------------------------------------------------------
     *  Simple Toast Notifications
     * ------------------------------------------------------------------*/

    /**
     * Injects minimal CSS required for toast notifications once per session.
     */
    function _ensureToastStyles() {
        if (_toastStylesInjected) return;

        const css = `
            .ui-toast{
                position:fixed;
                left:50%;
                bottom:30px;
                transform:translateX(-50%);
                padding:10px 16px;
                border-radius:4px;
                font-size:14px;
                color:#fff;
                background:#333;
                box-shadow:0 2px 6px rgba(0,0,0,0.2);
                opacity:0;
                z-index:9999;
                animation:uiToastFadeIn .3s forwards;
            }
            .ui-toast.toast-success{background:#4caf50;}
            .ui-toast.toast-error{background:#f44336;}
            .ui-toast.toast-info{background:#2196f3;}
            @keyframes uiToastFadeIn{
                from{opacity:0;transform:translate(-50%,20px)}
                to{opacity:1;transform:translate(-50%,0)}
            }
            @keyframes uiToastFadeOut{
                from{opacity:1;}
                to{opacity:0;}
            }
        `;

        const styleTag = document.createElement('style');
        styleTag.id = 'ui-toast-styles';
        styleTag.textContent = css.replace(/\s+/g, ' ').trim();
        document.head.appendChild(styleTag);
        _toastStylesInjected = true;
    }

    /**
     * Displays a toast message to the user.
     * @param {string} message  - Message to show.
     * @param {'info'|'success'|'error'} [type='info'] - Toast style.
     * @param {number} [duration=3000] - Milliseconds before auto-dismiss.
     */
    function _showToast(message, type = 'info', duration = 3000) {
        _ensureToastStyles();

        const toast = document.createElement('div');
        toast.className = `ui-toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Auto-dismiss after duration
        setTimeout(() => {
            toast.style.animation = 'uiToastFadeOut .3s forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    // --- Public API ---

    const ui = {
        /**
         * Initializes the UI module
         * @param {object} state - Application state
         */
        init(state) {
            console.log("UI: Initializing...");
            
            // Cache commonly used elements for performance
            _elements.dbStatusIndicator = document.getElementById('db-status-indicator');
            _elements.entitySelector = document.getElementById('entity-selector');
            _elements.consolidatedViewToggle = document.getElementById('consolidated-view-toggle');
            
            // Initialize UI components
            _populateEntitySelector(state);
            _elements.consolidatedViewToggle.checked = state.isConsolidatedViewActive;
            _updateDbStatusIndicator(state.dbMode);
            
            /* ------------------------------------------------------------------
             * Delegated click handlers for Edit buttons in data tables
             * ------------------------------------------------------------------ */

            // Chart of Accounts  ------------------------------------------------
            document
                .getElementById('chart-of-accounts-table')
                ?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-edit-account');
                    if (!btn) return;
                    const id = btn.dataset.id;
                    if (id && window.modals?.openAccount) {
                        modals.openAccount(id);
                    }
                });

            // Funds -------------------------------------------------------------
            document
                .getElementById('funds-table')
                ?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-edit-fund');
                    if (!btn) return;
                    const id = btn.dataset.id;
                    if (id && window.modals?.openFund) {
                        modals.openFund(id);
                    }
                });

            // Journal Entries ---------------------------------------------------
            document
                .getElementById('journal-entries-table')
                ?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-edit-je');
                    if (!btn) return;
                    const id = btn.dataset.id;
                    if (id && window.modals?.openJournalEntry) {
                        modals.openJournalEntry(id);
                    }
                });

            // Entities ----------------------------------------------------------
            document
                .getElementById('entities-table')
                ?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-edit-entity');
                    if (!btn) return;
                    const id = btn.dataset.id;
                    if (id && window.modals?.openEntity) {
                        modals.openEntity(id);
                    }
                });

            console.log("UI: Initialized.");
        },
        
        /**
         * Refreshes all data views based on current state
         * @param {object} state - Application state
         */
        async refreshAllViews(state) {
            console.log("UI: Refreshing all data views...");
            
            try {
                _updateDashboardEntityDisplay(state);
                
                // Find active page
                const activePage = document.querySelector('.page.active');
                if (!activePage) return;
                
                const pageId = activePage.id;
                
                // Render appropriate views based on active page
                if (pageId === 'dashboard-page') {
                    await _renderDashboard(state);
                }
                else if (pageId === 'chart-of-accounts-page') {
                    await _renderChartOfAccountsTable(state);
                }
                else if (pageId === 'funds-page') {
                    await _renderFundsTable(state);
                }
                else if (pageId === 'journal-entries-page') {
                    await _renderJournalEntriesTable(state);
                }
                else if (pageId === 'settings-page') {
                    // Check which settings tab is active
                    const activeTab = document.querySelector('#settings-page .tab-panel.active');
                    if (activeTab) {
                        const tabId = activeTab.id;
                        
                        if (tabId === 'settings-users') {
                            await _renderUsersTable(state);
                        }
                        else if (tabId === 'settings-organization') {
                            await _populateOrganizationSettingsForm(state);
                        }
                        else if (tabId === 'settings-entities') {
                            await _renderEntitiesTable(state);
                            _updateEntityRelationshipViz(state);
                        }
                    }
                }
                
                console.log("UI: All data views refreshed.");
            } catch (error) {
                console.error("UI: Error refreshing views:", error);
            }
        },

        /**
         * Shows a small toast notification.
         * Accessible globally via window.ui.showToast().
         */
        showToast(message, type = 'info', duration = 3000) {
            _showToast(message, type, duration);
        },
        
        /**
         * Updates the database status indicator
         * @param {boolean} isConnected - Whether the database is connected
         */
        updateDbStatusIndicator(isConnected) {
            _updateDbStatusIndicator(isConnected);
        },
        
        /**
         * Refreshes a specific table
         * @param {string} tableId - The ID of the table to refresh
         * @param {object} state - Application state
         */
        async refreshTable(tableId, state) {
            console.log(`UI: Refreshing table ${tableId}...`);
            
            switch (tableId) {
                case 'chart-of-accounts':
                    await _renderChartOfAccountsTable(state);
                    break;
                case 'funds':
                    await _renderFundsTable(state);
                    break;
                case 'journal-entries':
                    await _renderJournalEntriesTable(state);
                    break;
                case 'users':
                    await _renderUsersTable(state);
                    break;
                case 'entities':
                    await _renderEntitiesTable(state);
                    _updateEntityRelationshipViz(state);
                    break;
                default:
                    console.warn(`UI: Unknown table ID: ${tableId}`);
            }
        }
    };

    // Expose the public API to the window
    window.ui = ui;

})(window);
