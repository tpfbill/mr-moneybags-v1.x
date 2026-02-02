/**
 * @file app-ui.js
 * @description UI update module for the Non-Profit Fund Accounting System.
 * This module handles all DOM updates and UI rendering.
 */

// Import shared configuration, state and utility functions
import { 
    appState, 
    formatCurrency, 
    formatDate, 
    formatPercentage, 
    getRelevantEntityIds, 
    getRelevantFunds,
    getRelevantEntityCodes 
} from './app-config.js';

/**
 * Populate Fund Reports fund dropdown based on current entity / consolidated view
 */
export function updateFundReportsFilters() {
    const fundSelect = document.getElementById('fund-reports-fund-select');
    if (!fundSelect) return;

    // Preserve previous selection so we don't reset user choice on every refresh
    const previous = fundSelect.value;

    // Determine funds relevant to the current context
    const funds = Array.isArray(getRelevantFunds()) ? getRelevantFunds() : [];

    // Sort by code then name for predictable ordering
    funds.sort(
        (a, b) =>
            (a.fund_code || '').localeCompare(b.fund_code || '') ||
            (a.fund_name || '').localeCompare(b.fund_name || '')
    );

    // Re-build the <select> options
    fundSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select Fund...';
    fundSelect.appendChild(placeholder);

    funds.forEach(fund => {
        const opt = document.createElement('option');
        opt.value = fund.id;
        opt.textContent = `${fund.fund_code || ''}${
            fund.fund_code ? ' - ' : ''
        }${fund.fund_name || ''}`.trim();
        fundSelect.appendChild(opt);
    });

    // Restore previous selection if it still exists, else reset to placeholder
    const exists = Array.from(fundSelect.options).some(
        o => o.value === previous
    );
    fundSelect.value = exists ? previous : '';
}

/**
 * Update entity selector dropdown with current entities
 */
export function updateEntitySelector() {
    const entitySelector = document.getElementById('entity-selector');
    if (!entitySelector || !appState.entities.length) return;
    
    // Clear existing options
    entitySelector.innerHTML = '';
    
    // Determine a sensible root entity (top-level with most children or marked consolidated)
    const topLevel = appState.entities.filter(e => e.parent_entity_id === null);
    let rootEntity = topLevel.find(e => e.code === 'TPF_PARENT' || (e.name || '').toLowerCase().includes('principle foundation'))
        || topLevel.find(e => e.is_consolidated)
        || topLevel.sort((a, b) => (b.child_count || 0) - (a.child_count || 0))[0]
        || null;

    // Add consolidated/root option first (if any top-level exists)
    if (rootEntity) {
        const option = document.createElement('option');
        option.value = rootEntity.id;
        option.textContent = 'All Entities (Consolidated)';
        entitySelector.appendChild(option);
    }
    
    // Build a flat list of all entities (excluding the root already added)
    const allEntities = appState.entities
        .filter(e => !rootEntity || e.id !== rootEntity.id)
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    
    allEntities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        entitySelector.appendChild(option);
    });
    
    // Set default selected entity (prefer rootEntity if present)
    if (!appState.selectedEntityId && rootEntity) {
        appState.selectedEntityId = rootEntity.id;
        entitySelector.value = rootEntity.id;
    } else if (appState.selectedEntityId) {
        entitySelector.value = appState.selectedEntityId;
    }

    /* ------------------------------------------------------------------
     * Fallback: if nothing selected yet, default to first option
     * ------------------------------------------------------------------ */
    if (
        !appState.selectedEntityId &&
        entitySelector.options.length > 0
    ) {
        appState.selectedEntityId = entitySelector.options[0].value;
        entitySelector.value = appState.selectedEntityId;
    }
    
    // Derive consolidated view automatically from the selected entity
    const selectedEntity = appState.entities.find(e => e.id === appState.selectedEntityId);
    appState.isConsolidatedView = !!(selectedEntity && selectedEntity.is_consolidated);
}

/**
 * Update dashboard title based on selected entity
 */
export function updateDashboardTitle() {
    const dashboardTitle = document.getElementById('dashboard-title');
    const dashboardCurrentEntity = document.getElementById('dashboard-current-entity');
    
    if (!dashboardTitle) return;

    dashboardTitle.textContent = 'Dashboard';

    const selectedEntity = appState.entities.find(
        entity => entity.id === appState.selectedEntityId
    );

    if (dashboardCurrentEntity) {
        if (selectedEntity) {
            dashboardCurrentEntity.textContent = selectedEntity.name;
            if (
                appState.isConsolidatedView &&
                selectedEntity.is_consolidated
            ) {
                dashboardCurrentEntity.textContent += ' (Consolidated)';
            }
        } else {
            dashboardCurrentEntity.textContent = 'All Entities';
        }
    }
}

/**
 * Update dashboard summary cards with current data
 */
export function updateDashboardSummaryCards() {
    const summaryCardsContainer = document.getElementById('dashboard-summary-cards');
    if (!summaryCardsContainer) return;
    
    // Prefer server-side metrics when available
    const m = appState.dashboardMetrics;
    if (m && typeof m === 'object') {
        // If API reports zero assets but client-side funds indicate a positive total,
        // prefer the client-side fallback to avoid misleading zeros due to filtering.
        const relevantFundsForCheck = Array.isArray(getRelevantFunds()) ? getRelevantFunds() : [];
        const clientTotalAssets = relevantFundsForCheck.reduce(
            (sum, fund) => sum + parseFloat(fund.balance ?? fund.starting_balance ?? 0),
            0
        );
        const apiAssets = Number(m.assets || 0);
        if (apiAssets > 0 || clientTotalAssets <= 0) {
            summaryCardsContainer.innerHTML = `
                <div class="card">
                    <div class="card-title">Total Assets</div>
                    <div class="card-value">${formatCurrency(apiAssets)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Total Liabilities</div>
                    <div class="card-value">${formatCurrency(m.liabilities || 0)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Net Assets</div>
                    <div class="card-value">${formatCurrency(m.net_assets || 0)}</div>
                </div>
                <div class="card">
                    <div class="card-title">YTD Revenue</div>
                    <div class="card-value">${formatCurrency(m.revenue_ytd || 0)}</div>
                </div>
            `;
            return;
        }
        // else: fall through to client-side computation
    }

    // Fallback: compute client-side if server metrics unavailable
    const relevantFunds = Array.isArray(getRelevantFunds()) ? getRelevantFunds() : [];
    const totalAssets = relevantFunds.reduce(
        (sum, fund) => sum + parseFloat(fund.balance ?? fund.starting_balance ?? 0),
        0
    );
    const accounts = Array.isArray(appState.accounts) ? appState.accounts : [];
    // Filter liabilities by selected entity codes
    const canon = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const codeSet = new Set(getRelevantEntityCodes().map(canon));
    const totalLiabilities = accounts
        .filter(acc => {
            const cls = (acc.classification || '').toLowerCase();
            const gl  = String(acc.gl_code || '').trim();
            return cls.includes('liab') || gl.startsWith('2');
        })
        .filter(acc => {
            // If we have selected codes, keep only accounts whose entity_code matches
            if (codeSet.size === 0) return true;
            const accCodeCanon = canon(acc.entity_code);
            return codeSet.has(accCodeCanon);
        })
        .reduce((sum, acc) => {
            const bal = parseFloat(acc.current_balance ?? 0);
            return sum + (bal < 0 ? -bal : 0);
        }, 0);
    const netAssets = totalAssets - totalLiabilities;
    const currentYear = new Date().getFullYear();
    const relevantEntityIds = getRelevantEntityIds();
    const journalEntries = Array.isArray(appState.journalEntries) ? appState.journalEntries : [];
    const ytdRevenue = journalEntries
        .filter(entry => 
            new Date(entry.entry_date).getFullYear() === currentYear &&
            relevantEntityIds.includes(entry.entity_id) &&
            entry.type === 'Revenue'
        )
        .reduce((sum, entry) => sum + parseFloat(entry.total_amount || 0), 0);

    // Update the cards (fallback)
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

/**
 * Update dashboard fund balances table
 */
export function updateDashboardFundBalances() {
    const fundBalancesTable = document.getElementById('dashboard-fund-balances-table');
    if (!fundBalancesTable) return;
    
    const fundBalancesTbody = fundBalancesTable.querySelector('tbody');
    if (!fundBalancesTbody) return;
    
    // Get relevant funds based on selected entity and consolidated view
    const relevantFunds = Array.isArray(getRelevantFunds()) ? [...getRelevantFunds()] : [];
    
    // Sort funds by fund_number (natural order, handles numeric strings)
    relevantFunds.sort((a, b) =>
        String(a.fund_number ?? '')
            .localeCompare(String(b.fund_number ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    );
    
    // Calculate total for percentage (balance fallback)
    const totalBalance = relevantFunds.reduce(
        (sum, fund) =>
            sum + parseFloat(fund.balance ?? fund.starting_balance ?? 0),
        0
    );
    
    // Update the fund balances table
    fundBalancesTbody.innerHTML = '';
    
    if (relevantFunds.length === 0) {
        fundBalancesTbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center">No funds found for the selected entity</td>
            </tr>
        `;
        return;
    }
    
    relevantFunds.forEach(fund => {
        const fallbackEntityName =
            fund.entity_name ||
            appState.entities.find(entity => entity.id === fund.entity_id)?.name ||
            'Unknown';
        const fundBalance = parseFloat(
            fund.balance ?? fund.starting_balance ?? 0
        );
        const percentage = formatPercentage(fundBalance, totalBalance);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fund.fund_number || '—'}</td>
            <td>${fund.fund_name || fund.name || '—'}${
                appState.isConsolidatedView ? ` (${fallbackEntityName})` : ''
            }</td>
            <td>${fund.restriction || 'N/A'}</td>
            <td>${formatCurrency(fundBalance)}</td>
            <td>${percentage}</td>
        `;
        fundBalancesTbody.appendChild(row);
    });
}

/**
 * Update dashboard recent transactions table
 */
export function updateDashboardRecentTransactions() {
    const recentTransactionsTable = document.getElementById('dashboard-recent-transactions-table');
    if (!recentTransactionsTable || !appState.selectedEntityId) return;
    
    const recentTransactionsTbody = recentTransactionsTable.querySelector('tbody');
    if (!recentTransactionsTbody) return;
    
    // Get relevant journal entries based on selected entity and consolidated view
    const relevantEntityIds = getRelevantEntityIds();
    
    const journalEntries = Array.isArray(appState.journalEntries) ? appState.journalEntries : [];
    let relevantEntries = journalEntries.filter(entry => 
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

/**
 * Update dashboard unposted entries table
 */
export function updateDashboardUnpostedEntries() {
    const unpostedEntriesTable = document.getElementById('dashboard-unposted-entries-table');
    if (!unpostedEntriesTable || !appState.selectedEntityId) return;
    
    const unpostedEntriesTbody = unpostedEntriesTable.querySelector('tbody');
    if (!unpostedEntriesTbody) return;
    
    // Get relevant journal entries based on selected entity and consolidated view
    const relevantEntityIds = getRelevantEntityIds();
    
    const journalEntries = Array.isArray(appState.journalEntries) ? appState.journalEntries : [];
    let unpostedEntries = journalEntries.filter(entry => 
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
        const createdByDisplay = (() => {
            const id = entry.created_by;
            if (!id) return 'System';
            const user = (appState.users || []).find(u => String(u.id) === String(id));
            const name = user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
            return name || String(id);
        })();
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.entry_date)}</td>
            <td>${entry.reference_number || 'N/A'}</td>
            <td>${entry.description || 'N/A'}${appState.isConsolidatedView ? ` (${entityName})` : ''}</td>
            <td>${formatCurrency(entry.total_amount)}</td>
            <td>${createdByDisplay}</td>
            <td>
                <button class="action-button btn-post-entry" data-id="${entry.id}">Post</button>
                <button class="action-button btn-edit-entry" data-id="${entry.id}">Edit</button>
            </td>
        `;
        unpostedEntriesTbody.appendChild(row);
    });
    
    // Add event listeners for post and edit buttons
    unpostedEntriesTbody.querySelectorAll('.btn-post-entry').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('postJournalEntry', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
    
    unpostedEntriesTbody.querySelectorAll('.btn-edit-entry').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openJournalEntryModal', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
}

/**
 * Update chart of accounts table
 */
export function updateChartOfAccountsTable() {
    const table = document.getElementById('chart-of-accounts-table');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Determine admin privileges (case-insensitive)
    const isAdmin =
        (appState.currentUser?.role || '').toLowerCase() === 'admin';

    /* ------------------------------------------------------------------
     * Build display list and sort by derived account_code
     * ------------------------------------------------------------------ */
    const displayAccounts = Array.isArray(appState.accounts)
        ? [...appState.accounts]
        : [];

    displayAccounts.sort((a, b) => {
        const codeA =
            a.account_code ||
            `${a.entity_code || ''}-${a.gl_code || ''}-${a.fund_number || ''}`;
        const codeB =
            b.account_code ||
            `${b.entity_code || ''}-${b.gl_code || ''}-${b.fund_number || ''}`;
        return codeA.localeCompare(codeB);
    });

    /* ------------------------------------------------------------------
     * Render table body
     * ------------------------------------------------------------------ */
    tbody.innerHTML = '';

    if (displayAccounts.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="14" class="text-center">No accounts found</td></tr>';
        return;
    }

    displayAccounts.forEach(acc => {
        const row = document.createElement('tr');

        const acctCode =
            acc.account_code ||
            `${acc.entity_code || ''}-${acc.gl_code || ''}-${
                acc.fund_number || ''
            }`;
        const begBal = isNaN(parseFloat(acc.beginning_balance))
            ? 0
            : parseFloat(acc.beginning_balance);
        const currentBal = isNaN(parseFloat(acc.current_balance))
            ? begBal
            : parseFloat(acc.current_balance);
        const begDate = acc.beginning_balance_date
            ? formatDate(acc.beginning_balance_date)
            : '—';
        const lastUsed = acc.last_used ? formatDate(acc.last_used) : '—';
        const status = acc.status || 'Active';
        const balanceSheet = acc.balance_sheet || 'No';

        let actionsHtml = '';
        if (isAdmin) {
            actionsHtml = `
                <button class="action-button btn-edit-account" data-id="${acc.id}" style="margin-right:6px;">Edit</button>
                <button class="action-button btn-delete-account" data-id="${acc.id}">Delete</button>
            `;
        }

        row.innerHTML = `
            <td>${acctCode}</td>
            <td>${acc.description || ''}</td>
            <td>${acc.entity_code || ''}</td>
            <td>${acc.gl_code || ''}</td>
            <td>${acc.fund_number || ''}</td>
            <td>${acc.restriction || ''}</td>
            <td>${acc.classification || ''}</td>
            <td><span class="status status-${status.toLowerCase()}">${status}</span></td>
            <td>${balanceSheet}</td>
            <td>${formatCurrency(begBal)}</td>
            <td>${formatCurrency(currentBal)}</td>
            <td>${begDate}</td>
            <td>${lastUsed}</td>
            <td>${actionsHtml}</td>
        `;

        tbody.appendChild(row);
    });

    /* ------------------------------------------------------------------
     * Bind admin-only actions (edit / delete)
     * ------------------------------------------------------------------ */
    if (isAdmin) {
        tbody.querySelectorAll('.btn-edit-account').forEach(btn => {
            btn.addEventListener('click', () => {
                const evt = new CustomEvent('openAccountModal', {
                    detail: { id: btn.dataset.id }
                });
                document.dispatchEvent(evt);
            });
        });

        tbody.querySelectorAll('.btn-delete-account').forEach(btn => {
            btn.addEventListener('click', () => {
                const rowEl = btn.closest('tr');
                const evt = new CustomEvent('deleteAccount', {
                    detail: { id: btn.dataset.id, rowEl }
                });
                document.dispatchEvent(evt);
            });
        });
    }
}

/**
 * Update funds table
 */
export function updateFundsTable() {
    const fundsTable = document.getElementById('funds-table');
    if (!fundsTable) return;
    
    const fundsTbody = fundsTable.querySelector('tbody');
    if (!fundsTbody) return;

    // Determine if current user is admin (role check is case-insensitive)
    const isAdmin =
        (appState.currentUser?.role || '').toLowerCase() === 'admin';
    
    // For new schema we no longer filter by entity – always show all funds
    const displayFunds = Array.isArray(appState.funds) ? [...appState.funds] : [];
    // Sort funds by fund_code
    displayFunds.sort((a, b) => (a.fund_code || '').localeCompare(b.fund_code || ''));
    
    // Update the funds table
    fundsTbody.innerHTML = '';
    
    if (displayFunds.length === 0) {
        fundsTbody.innerHTML = `
            <tr>
                <td colspan="14" class="text-center">No funds found</td>
            </tr>
        `;
        return;
    }
    
    displayFunds.forEach(fund => {
        // Build actions column HTML based on role
        let actionsHtml = '';
        if (isAdmin) {
            actionsHtml = `
                <button class="action-button btn-edit-fund" style="margin-right:6px;" data-id="${fund.id}">Edit</button>
                <button class="action-button btn-delete-fund" data-id="${fund.id}">Delete</button>
            `;
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${fund.fund_number || '—'}</td>
            <td class="fund-code">${fund.fund_code}</td>
            <td>${fund.entity_code || '—'}</td>
            <td>${fund.entity_name || '—'}</td>
            <td>${fund.fund_name}</td>
            <td>${fund.restriction || '—'}</td>
            <td>${fund.budget || '—'}</td>
            <td>${fund.balance_sheet || '—'}</td>
            <td>${formatCurrency(fund.balance ?? fund.starting_balance)}</td>
            <td>${formatCurrency(fund.starting_balance)}</td>
            <td>${fund.starting_balance_date ? formatDate(fund.starting_balance_date) : '—'}</td>
            <td>${fund.last_used ? formatDate(fund.last_used) : '—'}</td>
            <td><span class="status status-${(fund.status || '').toLowerCase()}">${fund.status || ''}</span></td>
            <td>${actionsHtml}</td>
        `;
        fundsTbody.appendChild(row);
    });
    
    // Add event listeners for edit buttons
    fundsTbody.querySelectorAll('.btn-edit-fund').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openFundModal', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });

    // Add event listeners for delete buttons (admin only)
    fundsTbody.querySelectorAll('.btn-delete-fund').forEach(button => {
        button.addEventListener('click', () => {
            const rowEl = button.closest('tr');
            const evt = new CustomEvent('deleteFund', {
                detail: { id: button.dataset.id, rowEl }
            });
            document.dispatchEvent(evt);
        });
    });
}

/**
 * Update GL Codes table
 */
export function updateGLCodesTable() {
    const table = document.getElementById('gl-codes-table');
    if (!table) return; // page not loaded

    const thead = table.querySelector('thead') || table.createTHead();
    const tbody =
        table.querySelector('tbody') ||
        table.appendChild(document.createElement('tbody'));

    // Determine admin privileges (case-insensitive role check)
    const isAdmin =
        (appState.currentUser?.role || '').toLowerCase() === 'admin';

    // Build column list from first record
    const rawCols =
        Array.isArray(appState.glCodes) && appState.glCodes.length
            ? Object.keys(appState.glCodes[0])
            : [];

    // Filter out hidden columns
    const HIDDEN = new Set(['id', 'created_at', 'updated_at']);
    const columns = rawCols.filter(
        c => !HIDDEN.has(c.toLowerCase())
    );

    /* ----------- Render table head ----------- */
    thead.innerHTML = '';
    const headRow = document.createElement('tr');
    if (columns.length === 0) {
        headRow.innerHTML = '<th>GL Codes</th>';
    } else {
        columns.forEach(col => {
            const th = document.createElement('th');
            const lower = col.toLowerCase();
            const label =
                lower === 'code'
                    ? 'GL Code'
                    : col
                          .replace(/_/g, ' ')
                          .replace(/\b\w/g, m => m.toUpperCase());
            th.textContent = label;
            headRow.appendChild(th);
        });
        if (isAdmin) {
            const thActions = document.createElement('th');
            thActions.textContent = 'Actions';
            headRow.appendChild(thActions);
        }
    }
    thead.appendChild(headRow);

    /* ----------- Render table body ----------- */
    tbody.innerHTML = '';

    if (!appState.glCodes.length) {
        const tr = document.createElement('tr');
        const colspan = (columns.length || 1) + (isAdmin ? 1 : 0);
        tr.innerHTML = `<td colspan="${colspan}" class="text-center">No GL codes found</td>`;
        tbody.appendChild(tr);
        return;
    }

    appState.glCodes.forEach(rec => {
        const tr = document.createElement('tr');

        columns.forEach(col => {
            const td = document.createElement('td');
            const val = rec[col];
            td.textContent =
                val === null || val === undefined ? '—' : String(val);
            tr.appendChild(td);
        });

        /* ----------- Actions ----------- */
        if (isAdmin) {
            const tdAct = document.createElement('td');
            tdAct.innerHTML = `
                <button class="action-button btn-edit-gl-code" data-id="${rec.id}">Edit</button>
                <button class="action-button btn-delete-gl-code" style="margin-left:6px;" data-id="${rec.id}">Delete</button>
            `;
            tr.appendChild(tdAct);
        }

        tbody.appendChild(tr);
    });

    /* ----------- Event bindings ----------- */
    if (isAdmin) {
        tbody.querySelectorAll('.btn-edit-gl-code').forEach(btn => {
            btn.addEventListener('click', () => {
                const evt = new CustomEvent('openGLCodeModal', {
                    detail: { id: btn.dataset.id }
                });
                document.dispatchEvent(evt);
            });
        });

        tbody.querySelectorAll('.btn-delete-gl-code').forEach(btn => {
            btn.addEventListener('click', () => {
                const rowEl = btn.closest('tr');
                const evt = new CustomEvent('deleteGLCode', {
                    detail: { id: btn.dataset.id, rowEl }
                });
                document.dispatchEvent(evt);
            });
        });
    }
}

/**
 * Update journal entries table
 */
export function updateJournalEntriesTable() {
    const journalEntriesTable = document.getElementById('journal-entries-table');
    if (!journalEntriesTable) return;
    
    const journalEntriesTbody = journalEntriesTable.querySelector('tbody');
    if (!journalEntriesTbody) return;
    
    /* ------------------------------------------------------------------
     * Determine filter mode – current entity vs all entities
     * ------------------------------------------------------------------ */
    const jeFilterSelect = document.getElementById('journal-entries-filter-select');
    const jeFilterMode   = jeFilterSelect ? jeFilterSelect.value : 'current';
    const jeModeSelect   = document.getElementById('journal-entries-mode-select');
    const entryMode      = jeModeSelect ? jeModeSelect.value : 'all';

    // Build list of entries respecting the chosen filter
    let displayEntries = Array.isArray(appState.journalEntries) ? [...appState.journalEntries] : [];
    
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

    // Apply entry mode filter (Auto/Manual) if selected
    if (entryMode && entryMode.toLowerCase() !== 'all') {
        displayEntries = displayEntries.filter(entry => (entry.entry_mode || '').toLowerCase() === entryMode.toLowerCase());
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
        const entityNameHdr = appState.entities.find(entity => entity.id === entry.entity_id)?.name || 'Unknown';
        const derivedEntities = (entry.derived_entities || '').trim();
        const derivedFunds = (entry.derived_funds || '').trim();
        const entityDisplay = derivedEntities || entityNameHdr;
        const fundDisplay = derivedFunds || 'N/A';
        const createdByDisplay = (() => {
            const id = entry.created_by;
            if (!id) return 'System';
            const user = (appState.users || []).find(u => String(u.id) === String(id));
            const name = user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
            return name || String(id);
        })();

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(entry.entry_date)}</td>
            <td>${entry.reference_number || 'N/A'}</td>
            <td>${entry.description || 'N/A'}${appState.isConsolidatedView ? ` (${entityNameHdr})` : ''}</td>
            <td>${fundDisplay}</td>
            <td>${entityDisplay}</td>
            <td>${formatCurrency(entry.total_amount)}</td>
            <td><span class="status status-${entry.status.toLowerCase()}">${entry.status}</span></td>
            <td>${createdByDisplay}</td>
            <td>
                ${entry.status === 'Pending' 
                    ? `<button class="action-button btn-edit-entry" data-id="${entry.id}">Edit</button>`
                    : `<button class="action-button btn-view-entry" data-id="${entry.id}">View</button>`}
                ${entry.status === 'Draft' ? `<button class="action-button btn-edit-entry" data-id="${entry.id}">Edit</button>` : ''}
                <button class="action-button btn-delete-entry" data-id="${entry.id}">Delete</button>
            </td>
        `;
        journalEntriesTbody.appendChild(row);
    });
    
    // Add event listeners for view, edit, and delete buttons
    journalEntriesTbody.querySelectorAll('.btn-view-entry').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openJournalEntryModal', { 
                detail: { id: button.dataset.id, readOnly: true } 
            });
            document.dispatchEvent(event);
        });
    });
    
    journalEntriesTbody.querySelectorAll('.btn-edit-entry').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openJournalEntryModal', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });

    // Delete buttons
    journalEntriesTbody.querySelectorAll('.btn-delete-entry').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('deleteJournalEntry', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
}

/**
 * Update bank accounts table
 */
export function updateBankAccountsTable() {
    const bankAccountsTable = document.getElementById('bank-accounts-table');
    if (!bankAccountsTable) return;

    const bankAccountsTbody = bankAccountsTable.querySelector('tbody');
    if (!bankAccountsTbody) return;

    // Sort by bank then account name for predictable ordering
    const sortedAccounts = Array.isArray(appState.bankAccounts) ? [...appState.bankAccounts] : [];
    sortedAccounts.sort((a, b) => {
        const bankCmp = (a.bank_name || '').localeCompare(b.bank_name || '');
        if (bankCmp !== 0) return bankCmp;
        return (a.account_name || '').localeCompare(b.account_name || '');
    });

    bankAccountsTbody.innerHTML = '';

    if (sortedAccounts.length === 0) {
        bankAccountsTbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center">No bank accounts connected.</td>
            </tr>
        `;
        return;
    }

    sortedAccounts.forEach(acct => {
        const row = document.createElement('tr');
        const beginningBalance = isNaN(parseFloat(acct.beginning_balance)) ? 0 : parseFloat(acct.beginning_balance);
        const currentBalance = isNaN(parseFloat(acct.current_balance)) ? beginningBalance : parseFloat(acct.current_balance);
        
        row.innerHTML = `
            <td>${acct.bank_name || 'N/A'}</td>
            <td>${acct.account_name || 'N/A'}</td>
            <td>${acct.account_number || '—'}</td>
            <td>${acct.type || 'N/A'}</td>
            <td><span class="status status-${(acct.status || 'Active').toLowerCase()}">${acct.status || 'Active'}</span></td>
            <td>${formatCurrency(beginningBalance)}</td>
            <td>${formatCurrency(currentBalance)}</td>
            <td>${acct.last_sync ? formatDate(acct.last_sync) : 'Never'}</td>
            <td>
                <button class="action-button btn-edit-bank-account" data-id="${acct.id}">Edit</button>
                <button class="action-button btn-delete-bank-account" data-id="${acct.id}">Delete</button>
            </td>
        `;
        bankAccountsTbody.appendChild(row);
    });

    // Event listeners
    bankAccountsTbody.querySelectorAll('.btn-edit-bank-account').forEach(btn => {
        btn.addEventListener('click', () => {
            const evt = new CustomEvent('openBankAccountModal', {
                detail: { id: btn.dataset.id }
            });
            document.dispatchEvent(evt);
        });
    });

    bankAccountsTbody.querySelectorAll('.btn-delete-bank-account').forEach(btn => {
        btn.addEventListener('click', () => {
            const evt = new CustomEvent('deleteBankAccount', {
                detail: { id: btn.dataset.id }
            });
            document.dispatchEvent(evt);
        });
    });
}

/**
 * Update entities table
 */
export function updateEntitiesTable() {
    const entitiesTable = document.getElementById('entities-table');
    if (!entitiesTable) return;
    
    const entitiesTbody = entitiesTable.querySelector('tbody');
    if (!entitiesTbody) return;
    
    // Sort entities by name
    const sortedEntities = Array.isArray(appState.entities) ? [...appState.entities] : [];
    sortedEntities.sort((a, b) => a.name.localeCompare(b.name));
    
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
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openEntityModal', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
    
    entitiesTbody.querySelectorAll('.btn-delete-entity').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('deleteEntity', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
}

/**
 * Update users table
 */
export function updateUsersTable() {
    const usersTable = document.getElementById('users-table');
    if (!usersTable) return;
    
    const usersTbody = usersTable.querySelector('tbody');
    if (!usersTbody) return;
    
    // Sort users by name
    const sortedUsers = Array.isArray(appState.users) ? [...appState.users] : [];
    sortedUsers.sort((a, b) => {
        const nameA = a.name || `${a.first_name} ${a.last_name}`;
        const nameB = b.name || `${b.first_name} ${b.last_name}`;
        return nameA.localeCompare(nameB);
    });
    
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
        // Handle both name formats (name or first_name + last_name)
        const displayName = user.name || `${user.first_name} ${user.last_name}`;
        // Normalize status for class; capitalize label for display
        const statusRaw   = user.status || 'active';
        const statusCls   = statusRaw.toLowerCase();
        const statusLabel = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${displayName}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td><span class="status status-${statusCls}">${statusLabel}</span></td>
            <td>
                <button class="action-button btn-edit-user" data-id="${user.id}">Edit</button>
            </td>
        `;
        usersTbody.appendChild(row);
    });
    
    // Add event listeners for edit buttons
    usersTbody.querySelectorAll('.btn-edit-user').forEach(button => {
        button.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openUserModal', { 
                detail: { id: button.dataset.id } 
            });
            document.dispatchEvent(event);
        });
    });
}

/**
 * Build entity hierarchy data structure
 * @returns {Object} Hierarchy data with root node and entity map
 */
export function buildEntityHierarchyData() {
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

/**
 * Create a node for the entity hierarchy visualization
 * @param {Object} node - Node data
 * @returns {HTMLElement} Node element
 */
export function createEntityHierarchyNode(node) {
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
        editButton.addEventListener('click', () => {
            // This will be connected to the modal module in app-main.js
            const event = new CustomEvent('openEntityModal', { 
                detail: { id: node.id } 
            });
            document.dispatchEvent(event);
        });
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

/**
 * Update entity hierarchy visualization
 */
export function updateEntityHierarchyVisualization() {
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

/**
 * Initialize all dashboard charts
 */
export function initializeDashboardCharts() {
    initializeFundBalanceChart();
    initializeIncomeExpenseChart();
    initializeFundDistributionChart();
}

/**
 * Initialize fund balance chart
 */
function initializeFundBalanceChart() {
    const canvas = document.getElementById('fund-balance-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant funds
    const relevantFunds = Array.isArray(getRelevantFunds()) ? getRelevantFunds() : [];
    
    // Prepare data
    const topFunds = relevantFunds.slice(0, 5);
    const fundNames = topFunds.map(
        fund => fund.fund_name || fund.name || '—'
    );
    const fundBalances = topFunds.map(fund =>
        parseFloat(fund.balance ?? fund.starting_balance ?? 0)
    );
    
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

/**
 * Initialize income/expense chart
 */
function initializeIncomeExpenseChart() {
    const canvas = document.getElementById('income-expense-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant journal entries
    const relevantEntityIds = getRelevantEntityIds();
    const currentYear = new Date().getFullYear();
    
    // Get monthly data for the current year
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    
    const journalEntries = Array.isArray(appState.journalEntries) ? appState.journalEntries : [];
    
    const incomeData = months.map(month => {
        const startDate = new Date(currentYear, month - 1, 1);
        const endDate = new Date(currentYear, month, 0);
        
        return journalEntries
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
        
        return journalEntries
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

/**
 * Initialize fund distribution chart
 */
function initializeFundDistributionChart() {
    const canvas = document.getElementById('fund-distribution-chart');
    if (!canvas || !window.Chart) return;
    
    // Get relevant funds
    const relevantFunds = Array.isArray(getRelevantFunds()) ? getRelevantFunds() : [];
    
    // Group funds by restriction
    const byRestriction = {};
    relevantFunds.forEach(fund => {
        const key = fund.restriction || 'Other';
        if (!byRestriction[key]) byRestriction[key] = 0;
        byRestriction[key] += parseFloat(
            fund.balance ?? fund.starting_balance ?? 0
        );
    });

    // Prepare data
    const types     = Object.keys(byRestriction);
    const balances  = Object.values(byRestriction);
    
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
