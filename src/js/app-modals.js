/**
 * @file app-modals.js
 * @description Modal management module for the Non-Profit Fund Accounting System.
 * This module handles all modal-related functionality including entity, fund,
 * account, journal entry, and user management.
 */

// Import shared configuration and state
import { API_BASE, appState, formatCurrency } from './app-config.js';

// Import data management functions
import { fetchData, saveData } from './app-data.js';

// Forward declarations for data loading functions that will be imported in app-main.js
let loadEntityData;
let loadFundData;
let loadAccountData;
let loadJournalEntryData;
let loadUserData;
let loadDashboardData;
let loadBankAccountData; // <-- NEW

/**
 * Set data loading functions - called from app-main.js to connect modals with data refresh
 * @param {Object} dataLoaders - Object containing data loading functions
 */
export function setDataLoaders(dataLoaders) {
    loadEntityData = dataLoaders.loadEntityData;
    loadFundData = dataLoaders.loadFundData;
    loadAccountData = dataLoaders.loadAccountData;
    loadJournalEntryData = dataLoaders.loadJournalEntryData;
    loadUserData = dataLoaders.loadUserData;
    loadDashboardData = dataLoaders.loadDashboardData;
    loadBankAccountData = dataLoaders.loadBankAccountData;
}

/**
 * Show a modal by ID
 * @param {string} modalId - ID of the modal to show
 */
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.style.display = 'block';
    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
    
    // Focus the first input field in the modal
    setTimeout(() => {
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }, 100);
}

/**
 * Hide a modal by ID
 * @param {string} modalId - ID of the modal to hide
 */
export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('show');
    setTimeout(() => {
        modal.style.display = 'none';
        
        // Clear form fields
        const form = modal.querySelector('form');
        if (form) form.reset();
        
        // Clear any error messages
        const errorMessages = modal.querySelectorAll('.error-message');
        errorMessages.forEach(el => el.textContent = '');
        
        // Remove any dynamic elements
        const dynamicContainers = modal.querySelectorAll('.dynamic-container');
        dynamicContainers.forEach(container => {
            container.innerHTML = '';
        });
    }, 300);
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (success, error, warning, info)
 */
export function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toastContainer.removeChild(toast);
        }, 300);
    }, 3000);
}

/**
 * Validate form fields
 * @param {HTMLFormElement} form - Form to validate
 * @returns {boolean} True if valid, false otherwise
 */
function validateForm(form) {
    let isValid = true;
    
    // Clear previous error messages
    const errorMessages = form.querySelectorAll('.error-message');
    errorMessages.forEach(el => el.textContent = '');
    
    // Check required fields
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            
            // Find or create error message element
            let errorEl = field.nextElementSibling;
            if (!errorEl || !errorEl.classList.contains('error-message')) {
                errorEl = document.createElement('div');
                errorEl.className = 'error-message';
                field.parentNode.insertBefore(errorEl, field.nextElementSibling);
            }
            
            errorEl.textContent = `${field.name || 'This field'} is required`;
        }
    });
    
    return isValid;
}

/**
 * Get form data as an object
 * @param {HTMLFormElement} form - Form to get data from
 * @returns {Object} Form data as an object
 */
function getFormData(form) {
    const formData = new FormData(form);
    const data = {};
    
    formData.forEach((value, key) => {
        // Handle checkboxes
        if (form.elements[key].type === 'checkbox') {
            data[key] = form.elements[key].checked;
        } else {
            data[key] = value;
        }
    });
    
    return data;
}

/* --------------------------------------------------------------
 * Entity Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open entity modal for creation or editing
 * @param {string} [id] - Entity ID for editing, omit for creation
 */
export async function openEntityModal(id) {
    const modal = document.getElementById('entity-modal');
    const form = modal.querySelector('form');
    const title = modal.querySelector('.modal-title');
    
    // Reset form
    form.reset();
    form.dataset.id = id || '';
    
    // Set modal title
    title.textContent = id ? 'Edit Entity' : 'Create Entity';
    
    // Populate parent entity dropdown
    const parentEntitySelect = form.querySelector('#entity-parent-select');
    parentEntitySelect.innerHTML = '<option value="">None (Top Level)</option>';
    
    appState.entities.forEach(entity => {
        // Don't include the entity itself as a parent option
        if (id && entity.id === id) return;
        
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        parentEntitySelect.appendChild(option);
    });
    
    // If editing, populate form with entity data
    if (id) {
        try {
            const entity = await fetchData(`entities/${id}`);
            
            form.elements['entity-code'].value = entity.code || '';
            form.elements['entity-name'].value = entity.name || '';
            form.elements['entity-parent-id'].value = entity.parent_entity_id || '';
            form.elements['entity-status'].value = entity.status || 'Active';
            form.elements['entity-currency'].value = entity.base_currency || 'USD';
            form.elements['entity-fiscal-start'].value = entity.fiscal_year_start || '01-01';
            form.elements['entity-is-consolidated'].checked = entity.is_consolidated || false;
        } catch (error) {
            console.error('Error fetching entity data:', error);
            showToast('Error loading entity data', 'error');
        }
    }
    
    // Show the modal
    showModal('entity-modal');
}

/**
 * Save entity data
 * @param {Event} event - Form submit event
 */
export async function saveEntity(event) {
    event.preventDefault();
    
    const form = event.target;
    const id = form.dataset.id;
    
    // Validate form
    if (!validateForm(form)) return;
    
    // Get form data
    const data = {
        code: form.elements['entity-code'].value,
        name: form.elements['entity-name'].value,
        parent_entity_id: form.elements['entity-parent-id'].value || null,
        status: form.elements['entity-status'].value,
        base_currency: form.elements['entity-currency'].value,
        fiscal_year_start: form.elements['entity-fiscal-start'].value,
        is_consolidated: form.elements['entity-is-consolidated'].checked
    };
    
    try {
        if (id) {
            // Update existing entity
            await saveData(`entities/${id}`, data, 'PUT');
            showToast('Entity updated successfully', 'success');
        } else {
            // Create new entity
            await saveData('entities', data);
            showToast('Entity created successfully', 'success');
        }
        
        // Reload entity data
        if (typeof loadEntityData === 'function') {
            await loadEntityData();
        }
        
        // Hide the modal
        hideModal('entity-modal');
    } catch (error) {
        console.error('Error saving entity:', error);
        showToast('Error saving entity', 'error');
    }
}

/**
 * Delete an entity
 * @param {string} id - Entity ID to delete
 */
export async function deleteEntity(id) {
    if (!id) return;
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this entity? This action cannot be undone.')) {
        return;
    }
    
    try {
        // Check if entity has children
        const childEntities = appState.entities.filter(entity => entity.parent_entity_id === id);
        if (childEntities.length > 0) {
            showToast('Cannot delete entity with child entities', 'error');
            return;
        }        
        // Delete entity
        const res = await fetch(`${API_BASE}/api/entities/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        // Handle HTTP errors with server-provided details
        if (!res.ok) {
            let msg = `HTTP ${res.status}`;
            try {
                const ctype = res.headers.get('content-type') || '';
                if (ctype.includes('application/json')) {
                    const j = await res.json();
                    const base = j.error || '';
                    const details = j.details || '';
                    msg = details ? `${base} — ${details}` : base || msg;
                } else {
                    msg = await res.text() || msg;
                }
            } catch (_) {
                /* ignore parsing errors, fall back to generic msg */
            }
            showToast(msg, 'error');
            return; // abort success handling
        }
        
        // Reload entity data
        if (typeof loadEntityData === 'function') {
            await loadEntityData();
        }
        
        showToast('Entity deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting entity:', error);
        showToast('Error deleting entity', 'error');
    }
}

/* --------------------------------------------------------------
 * Fund Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open fund modal for creation or editing
 * @param {string} [id] - Fund ID for editing, omit for creation
 */
export async function openFundModal(id) {
    const modal = document.getElementById('fund-modal');
    const form = modal.querySelector('form');
    const title = modal.querySelector('.modal-title');
    
    // Reset form
    form.reset();
    form.dataset.id = id || '';
    
    // Set modal title
    title.textContent = id ? 'Edit Fund' : 'Create Fund';
    
    // Populate entity name dropdown if present
    const entityNameSelect = form.querySelector('#fund-entity-name');
    if (entityNameSelect) {
        entityNameSelect.innerHTML = '';
        const entityNames = ['TPF', 'TPFES', 'NFCSN'];
        entityNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            entityNameSelect.appendChild(option);
        });
    }
    
    // Populate entity code dropdown if present
    const entityCodeSelect = form.querySelector('#fund-entity-code');
    if (entityCodeSelect) {
        entityCodeSelect.innerHTML = '';
        const entityCodes = ['1', '2', '3'];
        entityCodes.forEach(code => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = code;
            entityCodeSelect.appendChild(option);
        });
    }
    
    // Populate restriction dropdown if present
    const restrictionSelect = form.querySelector('#fund-restriction');
    if (restrictionSelect) {
        restrictionSelect.innerHTML = '';
        const restrictions = ['00', '01'];
        restrictions.forEach(restriction => {
            const option = document.createElement('option');
            option.value = restriction;
            option.textContent = restriction;
            restrictionSelect.appendChild(option);
        });
    }
    
    // Populate budget dropdown if present
    const budgetSelect = form.querySelector('#fund-budget');
    if (budgetSelect) {
        budgetSelect.innerHTML = '';
        const budgetOptions = ['Yes', 'No'];
        budgetOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            budgetSelect.appendChild(opt);
        });
    }
    
    // Populate balance sheet dropdown if present
    const balanceSheetSelect = form.querySelector('#fund-balance-sheet');
    if (balanceSheetSelect) {
        balanceSheetSelect.innerHTML = '';
        const balanceSheetOptions = ['Yes', 'No'];
        balanceSheetOptions.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option;
            opt.textContent = option;
            balanceSheetSelect.appendChild(opt);
        });
    }
    
    // Set default date for last_used in create mode
    if (!id) {
        const lastUsedInput = form.querySelector('#fund-last-used');
        if (lastUsedInput) {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            lastUsedInput.value = today;
        }

        /* ----------------------------------------------------------
         * New balance-related defaults (create mode)
         * -------------------------------------------------------- */
        const sbInput  = form.querySelector('#fund-starting-balance');
        const sbdInput = form.querySelector('#fund-starting-balance-date');
        const balInput = form.querySelector('#fund-balance');

        if (sbInput)  sbInput.value  = '0.00';
        if (sbdInput) sbdInput.value = new Date().toISOString().split('T')[0];
        if (balInput) balInput.value = '';
    }
    
    // If editing, populate form with fund data
    if (id) {
        try {
            const fund = await fetchData(`funds/${id}`);
            
            // Populate new schema fields
            form.querySelector('#fund-number')?.setAttribute('value', fund.fund_number || '');
            form.querySelector('#fund-code')?.setAttribute('value', fund.fund_code || '');
            form.querySelector('#fund-name')?.setAttribute('value', fund.fund_name || '');
            
            // Set select values if they exist
            if (entityNameSelect) entityNameSelect.value = fund.entity_name || 'TPF';
            if (entityCodeSelect) entityCodeSelect.value = fund.entity_code || '1';
            if (restrictionSelect) restrictionSelect.value = fund.restriction || '00';
            if (budgetSelect) budgetSelect.value = fund.budget || 'No';
            if (balanceSheetSelect) balanceSheetSelect.value = fund.balance_sheet || 'No';
            
            // Set status
            const statusSelect = form.querySelector('#fund-status');
            if (statusSelect) statusSelect.value = fund.status || 'Active';
            
            // Set last_used date
            const lastUsedInput = form.querySelector('#fund-last-used');
            if (lastUsedInput && fund.last_used) {
                // Format date as YYYY-MM-DD for input[type=date]
                const lastUsed = new Date(fund.last_used).toISOString().split('T')[0];
                lastUsedInput.value = lastUsed;
            }

            /* ----------------------------------------------------------
             * Populate new balance fields (read-only + starting values)
             * -------------------------------------------------------- */
            const sbInput  = form.querySelector('#fund-starting-balance');
            const sbdInput = form.querySelector('#fund-starting-balance-date');
            const balInput = form.querySelector('#fund-balance');

            if (sbInput && fund.starting_balance != null) {
                sbInput.value = parseFloat(fund.starting_balance).toFixed(2);
            }
            if (sbdInput && fund.starting_balance_date) {
                sbdInput.value = new Date(fund.starting_balance_date)
                    .toISOString()
                    .split('T')[0];
            }
            if (balInput) {
                balInput.value = formatCurrency(fund.balance || 0);
            }
        } catch (error) {
            console.error('Error fetching fund data:', error);
            showToast('Error loading fund data', 'error');
        }
    }
    
    // Show the modal
    showModal('fund-modal');
}

/**
 * Save fund data
 * @param {Event} event - Form submit event
 */
export async function saveFund(event) {
    event.preventDefault();
    
    const form = event.target;
    const id = form.dataset.id;
    
    // Validate form
    if (!validateForm(form)) return;
    
    // Get form data for new schema
    const data = {
        fund_number: form.querySelector('#fund-number')?.value || null,
        fund_code: form.querySelector('#fund-code')?.value,
        fund_name: form.querySelector('#fund-name')?.value,
        entity_name: form.querySelector('#fund-entity-name')?.value || 'TPF',
        entity_code: form.querySelector('#fund-entity-code')?.value || '1',
        restriction: form.querySelector('#fund-restriction')?.value || '00',
        budget: form.querySelector('#fund-budget')?.value || 'No',
        balance_sheet: form.querySelector('#fund-balance-sheet')?.value || 'No',
        status: form.querySelector('#fund-status')?.value || 'Active',
        last_used: form.querySelector('#fund-last-used')?.value || null,
        // --- new balance fields ---
        starting_balance: form.querySelector('#fund-starting-balance')?.value || null,
        starting_balance_date: form.querySelector('#fund-starting-balance-date')?.value || null
    };
    
    try {
        if (id) {
            // Update existing fund
            await saveData(`funds/${id}`, data, 'PUT');
            showToast('Fund updated successfully', 'success');
        } else {
            // Create new fund
            await saveData('funds', data);
            showToast('Fund created successfully', 'success');
        }
        
        // Reload fund data
        if (typeof loadFundData === 'function') {
            await loadFundData();
        }
        
        // Hide the modal
        hideModal('fund-modal');
    } catch (error) {
        console.error('Error saving fund:', error);
        showToast('Error saving fund', 'error');
    }
}

/**
 * Delete a fund
 * @param {string} id - Fund ID to delete
 * @param {HTMLElement} [rowEl] - Optional <tr> element to remove immediately on success
 */
export async function deleteFund(id, rowEl) {
    if (!id) return;

    // Confirm deletion
    if (
        !confirm(
            'Are you sure you want to delete this fund? This action cannot be undone.'
        )
    ) {
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/funds/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            /* Attempt to read error message */
            let msg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                if (ctype.includes('application/json')) {
                    const j = await res.json();
                    // Combine error + details when both exist
                    const base = j.error || '';
                    const details = j.details || '';
                    msg = details ? `${base} — ${details}` : base;
                } else {
                    msg = await res.text();
                }
            } catch (_) {
                /* ignore body read errors */
            }
            throw new Error(msg || `HTTP ${res.status}`);
        }

        // Optimistically remove the row from the table for snappier UX
        if (rowEl && rowEl.parentNode) {
            rowEl.parentNode.removeChild(rowEl);
        }

        // Reload funds data if loader provided
        await loadFundData?.();

        showToast('Fund deleted successfully', 'success');
    } catch (err) {
        console.error('Error deleting fund:', err);
        showToast(err?.message || 'Error deleting fund', 'error');
    }
}

/* --------------------------------------------------------------
 * Account Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open account modal for creation or editing
 * @param {string} [id] - Account ID for editing, omit for creation
 */
export async function openAccountModal(id) {
    const modal = document.getElementById('account-modal');
    const form = modal.querySelector('form');
    const title = modal.querySelector('.modal-title');
    
    // Reset form
    form.reset();
    form.dataset.id = id || '';
    
    // Set modal title
    title.textContent = id ? 'Edit Account' : 'Create Account';
    
    // Populate entity dropdown
    const entitySelect = form.querySelector('#account-entity-id');
    entitySelect.innerHTML = '';
    
    appState.entities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        entitySelect.appendChild(option);
    });
    
    // Set default entity to currently selected entity
    if (appState.selectedEntityId) {
        entitySelect.value = appState.selectedEntityId;
    }
    
    // If editing, populate form with account data
    if (id) {
        try {
            const account = await fetchData(`accounts/${id}`);
            
            form.elements['account-code'].value = account.code || '';
            form.elements['account-description'].value = account.description || '';
            form.elements['account-classifications'].value = account.classifications || '';
            form.elements['account-entity-id'].value = account.entity_id || '';
            form.elements['account-status'].value = account.status || 'Active';
            // NEW: populate report code (simple 4-digit) field
            form.elements['account-report-code'].value = account.report_code || '';
        } catch (error) {
            console.error('Error fetching account data:', error);
            showToast('Error loading account data', 'error');
        }
    }
    
    // Show the modal
    showModal('account-modal');
}

/**
 * Save account data
 * @param {Event} event - Form submit event
 */
export async function saveAccount(event) {
    event.preventDefault();
    
    const form = event.target;
    const id = form.dataset.id;
    
    // Validate form
    if (!validateForm(form)) return;
    
    // Get form data
    const data = {
        code: form.elements['account-code'].value,
        report_code: form.elements['account-report-code'].value,
        description: form.elements['account-description'].value,
        classifications: form.elements['account-classifications'].value,
        entity_id: form.elements['account-entity-id'].value,
        status: form.elements['account-status'].value
    };
    
    try {
        if (id) {
            // Update existing account
            await saveData(`accounts/${id}`, data, 'PUT');
            showToast('Account updated successfully', 'success');
        } else {
            // Create new account
            await saveData('accounts', data);
            showToast('Account created successfully', 'success');
        }
        
        // Reload account data
        if (typeof loadAccountData === 'function') {
            await loadAccountData();
        }
        
        // Hide the modal
        hideModal('account-modal');
    } catch (error) {
        console.error('Error saving account:', error);
        showToast('Error saving account', 'error');
    }
}

/**
 * Delete an account
 * @param {string} id - Account ID to delete
 * @param {HTMLElement} [rowEl] - Optional table row to remove optimistically
 */
export async function deleteAccount(id, rowEl) {
    if (!id) return;

    // Confirm deletion with user
    const ok = confirm(
        'Are you sure you want to delete this account? This action cannot be undone.'
    );
    if (!ok) return;

    try {
        const res = await fetch(`${API_BASE}/api/accounts/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            /* Attempt to read server-provided error */
            let msg = `HTTP ${res.status}`;
            try {
                const ctype = res.headers.get('content-type') || '';
                if (ctype.includes('application/json')) {
                    const j = await res.json();
                    const base = j.error || '';
                    const details = j.details || '';
                    msg = details ? `${base} — ${details}` : base || msg;
                } else {
                    msg = (await res.text()) || msg;
                }
            } catch (_) {
                /* ignore body read errors */
            }
            throw new Error(msg);
        }

        // Optimistically remove row from UI
        if (rowEl && rowEl.parentNode) {
            rowEl.parentNode.removeChild(rowEl);
        }

        // Refresh account data
        await loadAccountData?.();

        showToast('Account deleted successfully', 'success');
    } catch (err) {
        console.error('Error deleting account:', err);
        showToast(err?.message || 'Error deleting account', 'error');
    }
}

/* --------------------------------------------------------------
 * Journal Entry Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open journal entry modal for creation or editing
 * @param {string} [id] - Journal entry ID for editing, omit for creation
 * @param {boolean} [readOnly=false] - Whether to open in read-only mode
 */
export async function openJournalEntryModal(id, readOnly = false) {
    const modal = document.getElementById('journal-entry-modal');
    const form = modal.querySelector('form');
    const title = modal.querySelector('.modal-title');
    const saveButton = modal.querySelector('#save-journal-entry-btn');
    const postButton = modal.querySelector('#post-journal-entry-btn');
    const lineItemsContainer = document.getElementById('journal-entry-line-items');
    
    // Reset form
    form.reset();
    form.dataset.id = id || '';
    form.dataset.readOnly = readOnly ? 'true' : 'false';
    
    // Set modal title
    title.textContent = id ? (readOnly ? 'View Journal Entry' : 'Edit Journal Entry') : 'Create Journal Entry';
    
    // Set button visibility
    saveButton.style.display = readOnly ? 'none' : 'inline-block';
    postButton.style.display = (id && !readOnly) ? 'inline-block' : 'none';
    
    // Populate entity dropdown
    const entitySelect = form.querySelector('#journal-entry-entity-id');
    entitySelect.innerHTML = '';
    
    appState.entities.forEach(entity => {
        const option = document.createElement('option');
        option.value = entity.id;
        option.textContent = entity.name;
        entitySelect.appendChild(option);
    });
    
    // Set default entity to currently selected entity
    if (appState.selectedEntityId) {
        entitySelect.value = appState.selectedEntityId;
    }
    
    // Clear line items container
    lineItemsContainer.innerHTML = '';
    
    // If editing or viewing, populate form with journal entry data
    if (id) {
        try {
            const journalEntry = await fetchData(`journal-entries/${id}`);
            const lineItems = await fetchData(`journal-entries/${id}/items`);
            
            form.elements['journal-entry-date'].value = journalEntry.entry_date ? journalEntry.entry_date.split('T')[0] : '';
            form.elements['journal-entry-reference'].value = journalEntry.reference_number || '';
            form.elements['journal-entry-description'].value = journalEntry.description || '';
            form.elements['journal-entry-entity-id'].value = journalEntry.entity_id || '';
            form.elements['journal-entry-type'].value = journalEntry.type || 'General';
            
            // Disable form fields if read-only
            if (readOnly) {
                form.querySelectorAll('input, select, textarea').forEach(el => {
                    el.disabled = true;
                });
            }
            
            // Add line items
            lineItems.forEach(item => {
                addJournalEntryLineItem(item, readOnly);
            });
            
            // Add a blank line item if editing (not read-only)
            if (!readOnly) {
                addJournalEntryLineItem();
            }
            
            // Update totals
            updateJournalEntryTotals();
        } catch (error) {
            console.error('Error fetching journal entry data:', error);
            showToast('Error loading journal entry data', 'error');
        }
    } else {
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        form.elements['journal-entry-date'].value = today;
        
        // Add a blank line item
        addJournalEntryLineItem();
    }
    
    // Show the modal
    showModal('journal-entry-modal');
}

/**
 * Add a journal entry line item to the form
 * @param {Object} [item] - Line item data for editing
 * @param {boolean} [readOnly=false] - Whether the line item is read-only
 */
function addJournalEntryLineItem(item = {}, readOnly = false) {
    const lineItemsContainer = document.getElementById('journal-entry-line-items');
    const lineItemIndex = lineItemsContainer.children.length;
    
    const lineItem = document.createElement('div');
    lineItem.className = 'journal-entry-line-item';
    lineItem.dataset.index = lineItemIndex;
    
    // Populate accounts dropdown
    let accountsOptions = '<option value="">Select Account</option>';
    appState.accounts.forEach(account => {
        accountsOptions += `<option value="${account.id}">${account.code} - ${account.description}</option>`;
    });
    
    // Populate funds dropdown
    let fundsOptions = '<option value="">Select Fund</option>';
    appState.funds.forEach(fund => {
        fundsOptions += `<option value="${fund.id}">${fund.fund_code} - ${fund.fund_name}</option>`;
    });
    
    lineItem.innerHTML = `
        <div class="form-row">
            <div class="form-group col-md-4">
                <select class="form-control account-select" name="line-item-account-${lineItemIndex}" ${readOnly ? 'disabled' : ''} required>
                    ${accountsOptions}
                </select>
            </div>
            <div class="form-group col-md-3">
                <select class="form-control fund-select" name="line-item-fund-${lineItemIndex}" ${readOnly ? 'disabled' : ''} required>
                    ${fundsOptions}
                </select>
            </div>
            <div class="form-group col-md-2">
                <input type="number" class="form-control debit-input" name="line-item-debit-${lineItemIndex}" placeholder="Debit" step="0.01" min="0" ${readOnly ? 'disabled' : ''}>
            </div>
            <div class="form-group col-md-2">
                <input type="number" class="form-control credit-input" name="line-item-credit-${lineItemIndex}" placeholder="Credit" step="0.01" min="0" ${readOnly ? 'disabled' : ''}>
            </div>
            <div class="form-group col-md-1">
                ${readOnly ? '' : '<button type="button" class="btn-icon remove-line-item">❌</button>'}
            </div>
        </div>
    `;
    
    lineItemsContainer.appendChild(lineItem);
    
    // Set values if editing
    if (item.id) {
        const accountSelect = lineItem.querySelector('.account-select');
        const fundSelect = lineItem.querySelector('.fund-select');
        const debitInput = lineItem.querySelector('.debit-input');
        const creditInput = lineItem.querySelector('.credit-input');
        
        accountSelect.value = item.account_id || '';
        fundSelect.value = item.fund_id || '';
        debitInput.value = item.debit || '';
        creditInput.value = item.credit || '';
    }
    
    // Add event listeners
    if (!readOnly) {
        // Remove line item button
        const removeButton = lineItem.querySelector('.remove-line-item');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                lineItemsContainer.removeChild(lineItem);
                updateJournalEntryTotals();
            });
        }
        
        // Debit/credit inputs
        const debitInput = lineItem.querySelector('.debit-input');
        const creditInput = lineItem.querySelector('.credit-input');
        
        debitInput.addEventListener('input', () => {
            if (debitInput.value && parseFloat(debitInput.value) > 0) {
                creditInput.value = '';
            }
            updateJournalEntryTotals();
        });
        
        creditInput.addEventListener('input', () => {
            if (creditInput.value && parseFloat(creditInput.value) > 0) {
                debitInput.value = '';
            }
            updateJournalEntryTotals();
        });
        
        // Add a new line item if this is the last one and has values
        debitInput.addEventListener('change', checkAddNewLineItem);
        creditInput.addEventListener('change', checkAddNewLineItem);
    }
}

/**
 * Check if a new line item should be added
 */
function checkAddNewLineItem() {
    const lineItemsContainer = document.getElementById('journal-entry-line-items');
    const lastLineItem = lineItemsContainer.lastElementChild;
    
    if (!lastLineItem) return;
    
    const accountSelect = lastLineItem.querySelector('.account-select');
    const fundSelect = lastLineItem.querySelector('.fund-select');
    const debitInput = lastLineItem.querySelector('.debit-input');
    const creditInput = lastLineItem.querySelector('.credit-input');
    
    if (accountSelect.value && fundSelect.value && (debitInput.value || creditInput.value)) {
        addJournalEntryLineItem();
    }
}

/**
 * Update journal entry totals
 */
function updateJournalEntryTotals() {
    const lineItems = document.querySelectorAll('.journal-entry-line-item');
    const totalDebitEl = document.getElementById('journal-entry-total-debit');
    const totalCreditEl = document.getElementById('journal-entry-total-credit');
    const balanceEl = document.getElementById('journal-entry-balance');
    
    let totalDebit = 0;
    let totalCredit = 0;
    
    lineItems.forEach(lineItem => {
        const debitInput = lineItem.querySelector('.debit-input');
        const creditInput = lineItem.querySelector('.credit-input');
        
        if (debitInput.value) {
            totalDebit += parseFloat(debitInput.value);
        }
        
        if (creditInput.value) {
            totalCredit += parseFloat(creditInput.value);
        }
    });
    
    totalDebitEl.textContent = formatCurrency(totalDebit);
    totalCreditEl.textContent = formatCurrency(totalCredit);
    
    const balance = totalDebit - totalCredit;
    balanceEl.textContent = formatCurrency(Math.abs(balance));
    balanceEl.className = balance === 0 ? 'balanced' : 'unbalanced';
}

/**
 * Save journal entry
 * @param {Event} event - Form submit event
 */
export async function saveJournalEntry(event) {
    event.preventDefault();
    
    const form = event.target;
    const id = form.dataset.id;
    const readOnly = form.dataset.readOnly === 'true';
    
    // Don't save if read-only
    if (readOnly) {
        hideModal('journal-entry-modal');
        return;
    }
    
    // Validate form
    if (!validateForm(form)) return;
    
    // Check if entry is balanced
    const balanceEl = document.getElementById('journal-entry-balance');
    if (balanceEl.className === 'unbalanced') {
        showToast('Journal entry must be balanced', 'error');
        return;
    }
    
    // Get form data
    const journalEntryData = {
        entry_date: form.elements['journal-entry-date'].value,
        reference_number: form.elements['journal-entry-reference'].value,
        description: form.elements['journal-entry-description'].value,
        entity_id: form.elements['journal-entry-entity-id'].value,
        type: form.elements['journal-entry-type'].value,
        status: 'Draft'
    };
    
    // Get line items
    const lineItems = [];
    const lineItemElements = document.querySelectorAll('.journal-entry-line-item');
    
    lineItemElements.forEach(lineItem => {
        const index = lineItem.dataset.index;
        const accountSelect = lineItem.querySelector('.account-select');
        const fundSelect = lineItem.querySelector('.fund-select');
        const debitInput = lineItem.querySelector('.debit-input');
        const creditInput = lineItem.querySelector('.credit-input');
        
        if (accountSelect.value && fundSelect.value && (debitInput.value || creditInput.value)) {
            lineItems.push({
                account_id: accountSelect.value,
                fund_id: fundSelect.value,
                debit: debitInput.value || 0,
                credit: creditInput.value || 0
            });
        }
    });
    
    // Check if there are line items
    if (lineItems.length === 0) {
        showToast('Journal entry must have at least one line item', 'error');
        return;
    }
    
    try {
        let journalEntryId;
        
        if (id) {
            // Update existing journal entry
            await saveData(`journal-entries/${id}`, journalEntryData, 'PUT');
            journalEntryId = id;
            
            // Delete existing line items
            await fetch(`${API_BASE}/api/journal-entries/${id}/items`, {
                method: 'DELETE',
                credentials: 'include'
            });
        } else {
            // Create new journal entry
            const newEntry = await saveData('journal-entries', journalEntryData);
            journalEntryId = newEntry.id;
        }
        
        // Add line items
        await saveData(`journal-entries/${journalEntryId}/items`, { items: lineItems });
        
        // Reload journal entry data
        if (typeof loadJournalEntryData === 'function') {
            await loadJournalEntryData();
        }
        
        // Reload dashboard data
        if (typeof loadDashboardData === 'function') {
            await loadDashboardData();
        }
        
        showToast('Journal entry saved successfully', 'success');
        hideModal('journal-entry-modal');
    } catch (error) {
        console.error('Error saving journal entry:', error);
        showToast('Error saving journal entry', 'error');
    }
}

/**
 * Post a journal entry
 * @param {string} id - Journal entry ID to post
 */
export async function postJournalEntry(id) {
    if (!id) return;
    
    // Confirm posting
    if (!confirm('Are you sure you want to post this journal entry? This action cannot be undone.')) {
        return;
    }
    
    try {
        await saveData(`journal-entries/${id}/post`, {}, 'POST');
        
        // Reload journal entry data
        if (typeof loadJournalEntryData === 'function') {
            await loadJournalEntryData();
        }
        
        // Reload dashboard data
        if (typeof loadDashboardData === 'function') {
            await loadDashboardData();
        }
        
        showToast('Journal entry posted successfully', 'success');
        hideModal('journal-entry-modal');
    } catch (error) {
        console.error('Error posting journal entry:', error);
        showToast('Error posting journal entry', 'error');
    }
}

/**
 * Delete a journal entry
 * @param {string} id - Journal entry ID to delete
 */
export async function deleteJournalEntry(id) {
    if (!id) return;
    
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this journal entry? This action cannot be undone.')) {
        return;
    }
    
    try {
        await fetch(`${API_BASE}/api/journal-entries/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        // Reload journal entry data
        if (typeof loadJournalEntryData === 'function') {
            await loadJournalEntryData();
        }
        
        // Reload dashboard data
        if (typeof loadDashboardData === 'function') {
            await loadDashboardData();
        }
        
        showToast('Journal entry deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting journal entry:', error);
        showToast('Error deleting journal entry', 'error');
    }
}

/* --------------------------------------------------------------
 * Bank Account Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open bank-account modal for creation or editing
 * @param {string} [id] - Bank-account UUID for editing, omit for creation
 */
export async function openBankAccountModal(id) {
    const modal   = document.getElementById('bank-account-modal');
    const form    = modal.querySelector('form');
    const titleEl = modal.querySelector('.modal-title');

    // Reset form & meta
    form.reset();
    form.dataset.id = id || '';

    // Title
    titleEl.textContent = id ? 'Edit Bank Account' : 'Add Bank Account';

    if (id) {
        try {
            const acct = await fetchData(`bank-accounts/${id}`);
            form.querySelector('#bank-name-select').value              = acct.bank_name           || '';
            form.querySelector('#bank-account-name-input').value       = acct.account_name        || '';
            form.querySelector('#bank-account-number-input').value     = acct.account_number      || '';
            form.querySelector('#routing-number-input').value          = acct.routing_number      || '';
            form.querySelector('#bank-account-type-select').value      = acct.type                || 'Checking';
            form.querySelector('#bank-account-status-select').value    = acct.status              || 'Active';
            form.querySelector('#connection-method-select').value      = acct.connection_method   || 'Manual';
            form.querySelector('#initial-balance-input').value         = acct.balance             || 0;
            form.querySelector('#bank-account-description-textarea').value = acct.description     || '';
        } catch (err) {
            console.error('Error loading bank account:', err);
            showToast('Error loading bank account', 'error');
            return;
        }
    }

    showModal('bank-account-modal');
}

/**
 * Save a bank account (create or update)
 */
export async function saveBankAccount(event) {
    event.preventDefault();

    const form = event.target;
    const id   = form.dataset.id;

    if (!validateForm(form)) return;

    const data = {
        bank_name        : form.querySelector('#bank-name-select').value,
        account_name     : form.querySelector('#bank-account-name-input').value,
        account_number   : form.querySelector('#bank-account-number-input').value,
        routing_number   : form.querySelector('#routing-number-input').value,
        type             : form.querySelector('#bank-account-type-select').value,
        status           : form.querySelector('#bank-account-status-select').value,
        balance          : parseFloat(form.querySelector('#initial-balance-input').value || 0),
        connection_method: form.querySelector('#connection-method-select').value,
        description      : form.querySelector('#bank-account-description-textarea').value
    };

    try {
        if (id) {
            await saveData(`bank-accounts/${id}`, data, 'PUT');
            showToast('Bank account updated', 'success');
        } else {
            await saveData('bank-accounts', data);
            showToast('Bank account created', 'success');
        }

        if (typeof loadBankAccountData === 'function') {
            await loadBankAccountData();
        }

        hideModal('bank-account-modal');
    } catch (err) {
        console.error('Error saving bank account:', err);
        showToast('Error saving bank account', 'error');
    }
}

/**
 * Delete a bank account
 * @param {string} id - Bank-account UUID
 */
export async function deleteBankAccount(id) {
    if (!id) return;
    if (!confirm('Delete this bank account? This cannot be undone.')) return;

    try {
        const res = await fetch(`${API_BASE}/api/bank-accounts/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        if (!res.ok) {
            const msg = await res.text();
            throw new Error(msg || `HTTP ${res.status}`);
        }

        await loadBankAccountData?.();
        showToast('Bank account deleted', 'success');
    } catch (err) {
        console.error('Delete bank account error:', err);
        showToast('Error deleting bank account', 'error');
    }
}

/* --------------------------------------------------------------
 * User Modal Functions
 * -------------------------------------------------------------- */

/**
 * Open user modal for creation or editing
 * @param {string} [id] - User ID for editing, omit for creation
 */
export async function openUserModal(id) {
    const modal = document.getElementById('user-modal');
    const form = modal.querySelector('form');
    const title = modal.querySelector('.modal-title');
    const passwordField = form.querySelector('#user-password');
    const passwordLabel = form.querySelector('label[for="user-password"]');
    
    // Reset form
    form.reset();
    form.dataset.id = id || '';
    
    // Set modal title
    title.textContent = id ? 'Edit User' : 'Create User';
    
    // Set password field requirement
    if (id) {
        passwordField.required = false;
        passwordLabel.textContent = 'Password (leave blank to keep current)';
    } else {
        passwordField.required = true;
        passwordLabel.textContent = 'Password *';
    }
    
    // If editing, populate form with user data
    if (id) {
        try {
            const user = await fetchData(`users/${id}`);
            
            // Handle both name formats (name or first_name + last_name)
            if (user.name) {
                form.elements['user-name'].value = user.name;
            } else if (user.first_name && user.last_name) {
                form.elements['user-name'].value = `${user.first_name} ${user.last_name}`;
            }
            
            form.elements['user-email'].value = user.email || '';
            form.elements['user-username'].value = user.username || '';
            form.elements['user-role'].value = user.role || 'user';
            // Ensure lowercase assignment to match <option value="active|inactive">
            form.elements['user-status'].value = (user.status || 'active').toLowerCase();
        } catch (error) {
            console.error('Error fetching user data:', error);
            showToast('Error loading user data', 'error');
        }
    }
    
    // Show the modal
    showModal('user-modal');
}

/**
 * Save user data
 * @param {Event} event - Form submit event
 */
export async function saveUser(event) {
    event.preventDefault();
    
    const form = event.target;
    const id = form.dataset.id;
    
    // Validate form
    if (!validateForm(form)) return;
    
    // Derive first_name and last_name from the single \"Full Name\" field
    const fullName   = form.elements['user-name'].value.trim();
    let firstName    = fullName;
    let lastName     = '';

    if (fullName.includes(' ')) {
        const parts  = fullName.split(/\s+/);
        lastName     = parts.pop();
        firstName    = parts.join(' ');
    }

    // Build payload expected by the backend
    const data = {
        first_name : firstName,
        last_name  : lastName,
        email      : form.elements['user-email'].value,
        username   : form.elements['user-username'].value,
        role       : form.elements['user-role'].value,
        // Always store status in lowercase for consistency with backend
        status     : (form.elements['user-status'].value || '').toLowerCase()
    };
    
    // Add password if provided
    if (form.elements['user-password'].value) {
        data.password = form.elements['user-password'].value;
    }
    
    try {
        if (id) {
            // Update existing user
            await saveData(`users/${id}`, data, 'PUT');
            showToast('User updated successfully', 'success');
        } else {
            // Create new user
            await saveData('users', data);
            showToast('User created successfully', 'success');
        }
        
        // Reload user data
        if (typeof loadUserData === 'function') {
            await loadUserData();
        }
        
        // Hide the modal
        hideModal('user-modal');
    } catch (error) {
        console.error('Error saving user:', error);
        showToast('Error saving user', 'error');
    }
}

// Initialize modal event listeners
export function initializeModalEventListeners() {
    // Entity modal
    document.getElementById('entity-modal-form')?.addEventListener('submit', saveEntity);
    document.getElementById('entity-modal-close')?.addEventListener('click', () => hideModal('entity-modal'));
    document.getElementById('entity-modal-cancel')?.addEventListener('click', () => hideModal('entity-modal'));
    
    // Fund modal
    document.getElementById('fund-modal-form')?.addEventListener('submit', saveFund);
    document.getElementById('fund-modal-close')?.addEventListener('click', () => hideModal('fund-modal'));
    document.getElementById('fund-modal-cancel')?.addEventListener('click', () => hideModal('fund-modal'));
    
    // Account modal
    document.getElementById('account-modal-form')?.addEventListener('submit', saveAccount);
    document.getElementById('account-modal-close')?.addEventListener('click', () => hideModal('account-modal'));
    document.getElementById('account-modal-cancel')?.addEventListener('click', () => hideModal('account-modal'));
    
    // Journal entry modal
    document.getElementById('journal-entry-modal-form')?.addEventListener('submit', saveJournalEntry);
    document.getElementById('journal-entry-modal-close')?.addEventListener('click', () => hideModal('journal-entry-modal'));
    document.getElementById('journal-entry-modal-cancel')?.addEventListener('click', () => hideModal('journal-entry-modal'));
    document.getElementById('post-journal-entry-btn')?.addEventListener('click', () => {
        const form = document.getElementById('journal-entry-modal-form');
        const id = form.dataset.id;
        if (id) postJournalEntry(id);
    });
    document.getElementById('add-line-item-btn')?.addEventListener('click', () => addJournalEntryLineItem());
    
    // User modal
    document.getElementById('user-modal-form')?.addEventListener('submit', saveUser);
    document.getElementById('user-modal-close')?.addEventListener('click', () => hideModal('user-modal'));
    document.getElementById('user-modal-cancel')?.addEventListener('click', () => hideModal('user-modal'));
    
    // Custom event listeners
    document.addEventListener('openEntityModal', (event) => openEntityModal(event.detail?.id));
    document.addEventListener('deleteEntity', (event) => deleteEntity(event.detail?.id));
    document.addEventListener('openFundModal', (event) => openFundModal(event.detail?.id));
    document.addEventListener('openAccountModal', (event) => openAccountModal(event.detail?.id));
    // Account deletion
    document.addEventListener('deleteAccount', (event) =>
        deleteAccount(event.detail?.id, event.detail?.rowEl)
    );
    document.addEventListener('openJournalEntryModal', (event) => openJournalEntryModal(event.detail?.id, event.detail?.readOnly));
    document.addEventListener('postJournalEntry', (event) => postJournalEntry(event.detail?.id));
    document.addEventListener('deleteJournalEntry', (event) => deleteJournalEntry(event.detail?.id));
    document.addEventListener('openUserModal', (event) => openUserModal(event.detail?.id));

    // --- Bank account modal events ---
    document.getElementById('bank-account-modal-form')?.addEventListener('submit', saveBankAccount);
    document.getElementById('bank-account-modal-close')?.addEventListener('click', () => hideModal('bank-account-modal'));
    document.getElementById('bank-account-modal-cancel')?.addEventListener('click', () => hideModal('bank-account-modal'));

    document.addEventListener('openBankAccountModal', (e) => openBankAccountModal(e.detail?.id));
    document.addEventListener('deleteBankAccount',   (e) => deleteBankAccount(e.detail?.id));

    // --- Funds (admin) custom events ---
    document.addEventListener('deleteFund', (e) => deleteFund(e.detail?.id, e.detail?.rowEl));
}
