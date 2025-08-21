/**
 * @file modal-functions-fix.js
 * @description Additional modal-related functions for the Non-Profit Fund Accounting System.
 * This file provides modal dialog functionality and form handlers.
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('MODAL FUNCTIONS FIX: DOM ready, setting up modal handlers');
    
    // Modal initialization - add close button handlers
    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        const modalId = btn.dataset.modalId;
        if (modalId) {
            console.log(`MODAL FUNCTIONS FIX: Setting up close button for ${modalId}`);
            btn.addEventListener('click', function() {
                closeModal(modalId);
            });
        }
    });
    
    // Close modals when clicking on background
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', function(event) {
            // Only close if the background (not the modal content) was clicked
            if (event.target === this) {
                closeModal(this.id);
            }
        });
    });
    
    // Account form save handler
    const saveAccountBtn = document.getElementById('save-account-btn');
    if (saveAccountBtn) {
        saveAccountBtn.addEventListener('click', function() {
            saveAccount();
        });
    }
    
    // Fund form save handler
    const saveFundBtn = document.getElementById('save-fund-btn');
    if (saveFundBtn) {
        saveFundBtn.addEventListener('click', function() {
            saveFund();
        });
    }
    
    // Journal entry save handlers
    const saveJournalDraftBtn = document.getElementById('btn-save-journal-draft');
    if (saveJournalDraftBtn) {
        saveJournalDraftBtn.addEventListener('click', function() {
            saveJournalEntry('Draft');
        });
    }
    
    const saveJournalPostBtn = document.getElementById('btn-save-journal-post');
    if (saveJournalPostBtn) {
        saveJournalPostBtn.addEventListener('click', function() {
            saveJournalEntry('Posted');
        });
    }
    
    // Entity form save handler
    const saveEntityBtn = document.getElementById('btn-save-entity');
    if (saveEntityBtn) {
        saveEntityBtn.addEventListener('click', function() {
            saveEntity();
        });
    }
    
    // User form save handler
    const saveUserBtn = document.getElementById('save-user-btn');
    if (saveUserBtn) {
        saveUserBtn.addEventListener('click', function() {
            saveUser();
        });
    }
    
    // Inter-entity toggle handler
    const interEntityToggle = document.getElementById('journal-entry-is-inter-entity');
    if (interEntityToggle) {
        interEntityToggle.addEventListener('change', function() {
            const interEntityFields = document.getElementById('inter-entity-fields-container');
            if (interEntityFields) {
                interEntityFields.classList.toggle('active', this.checked);
            }
        });
    }
    
    console.log('MODAL FUNCTIONS FIX: Modal handlers setup complete');
});

// --- General Modal Functions ---

/**
 * Close a modal by ID
 * @param {string} modalId - ID of the modal to close
 */
function closeModal(modalId) {
    console.log(`MODAL FUNCTIONS FIX: Closing modal ${modalId}`);
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// --- Form Save Functions ---

/**
 * Save account form data
 */
async function saveAccount() {
    console.log('MODAL FUNCTIONS FIX: Saving account');
    
    // Get form values
    const id = document.getElementById('edit-account-id-input').value;
    const code = document.getElementById('account-code-input').value;
    const name = document.getElementById('account-name-input').value;
    const type = document.getElementById('account-type-select').value;
    const status = document.getElementById('account-status-select').value;
    
    // Validate
    if (!code) {
        alert('Please enter an account.');
        return;
    }
    
    if (!name) {
        alert('Please enter an account name.');
        return;
    }
    
    // Get current entity ID
    const state = window.app ? window.app.getState() : {};
    const entityId = state.currentEntityId;
    
    if (!entityId) {
        alert('Please select an entity before creating an account.');
        return;
    }
    
    // Create account data object
    const accountData = {
        id: id || null,
        entityId,
        code,
        name,
        type,
        status,
        balance: id ? undefined : 0  // Only set initial balance for new accounts
    };
    
    try {
        // Save to database
        if (window.db) {
            await db.saveAccount(accountData);
            
            // Refresh the data
            const accounts = await db.fetchAccounts();
            if (window.app) {
                window.app.getState().accounts = accounts;
                
                // Refresh views
                if (window.ui) {
                    ui.refreshTable('chart-of-accounts', window.app.getState());
                }
            }
            
            // Close the modal
            closeModal('account-modal');
        } else {
            console.error('MODAL FUNCTIONS FIX: db module not available');
            alert('Unable to save account: database module not initialized.');
        }
    } catch (err) {
        console.error('MODAL FUNCTIONS FIX: Error saving account:', err);
        alert('Failed to save account: ' + err.message);
    }
}

/**
 * Save fund form data
 */
async function saveFund() {
    console.log('MODAL FUNCTIONS FIX: Saving fund');
    
    // Get form values
    const id = document.getElementById('edit-fund-id-input').value;
    const code = document.getElementById('fund-code-input').value;
    const name = document.getElementById('fund-name-input').value;
    const type = document.getElementById('fund-type-select').value;
    const status = document.getElementById('fund-status-select').value;
    const description = document.getElementById('fund-description-textarea').value;
    
    // Validate
    if (!code) {
        alert('Please enter a fund code.');
        return;
    }
    
    if (!name) {
        alert('Please enter a fund name.');
        return;
    }
    
    // Get current entity ID
    const state = window.app ? window.app.getState() : {};
    const entityId = state.currentEntityId;
    
    if (!entityId) {
        alert('Please select an entity before creating a fund.');
        return;
    }
    
    // Create fund data object
    const fundData = {
        id: id || null,
        entityId,
        code,
        name,
        type,
        status,
        description,
        balance: id ? undefined : 0  // Only set initial balance for new funds
    };
    
    try {
        // Save to database
        if (window.db) {
            await db.saveFund(fundData);
            
            // Refresh the data
            const funds = await db.fetchFunds();
            if (window.app) {
                window.app.getState().funds = funds;
                
                // Refresh views
                if (window.ui) {
                    ui.refreshTable('funds', window.app.getState());
                }
            }
            
            // Close the modal
            closeModal('fund-modal');
        } else {
            console.error('MODAL FUNCTIONS FIX: db module not available');
            alert('Unable to save fund: database module not initialized.');
        }
    } catch (err) {
        console.error('MODAL FUNCTIONS FIX: Error saving fund:', err);
        alert('Failed to save fund: ' + err.message);
    }
}

/**
 * Save journal entry form data
 * @param {string} status - Status to save with (Draft or Posted)
 */
async function saveJournalEntry(status = 'Draft') {
    console.log(`MODAL FUNCTIONS FIX: Saving journal entry as ${status}`);
    
    // Validate the journal entry
    if (!window.journal || !journal.validateForm) {
        alert('Journal module not loaded properly. Cannot validate form.');
        return;
    }
    
    if (!journal.validateForm()) {
        return;
    }
    
    try {
        // Get the form data
        const jeData = journal.collectFormData();
        jeData.status = status;
        
        // Save to database
        if (window.db) {
            await db.saveJournalEntry(jeData);
            
            // Refresh the data
            const journalEntries = await db.fetchJournalEntries();
            if (window.app) {
                window.app.getState().journalEntries = journalEntries;
                
                // Refresh views
                if (window.ui) {
                    ui.refreshTable('journal-entries', window.app.getState());
                }
            }
            
            // Close the modal
            closeModal('journal-entry-modal');
        } else {
            console.error('MODAL FUNCTIONS FIX: db module not available');
            alert('Unable to save journal entry: database module not initialized.');
        }
    } catch (err) {
        console.error('MODAL FUNCTIONS FIX: Error saving journal entry:', err);
        alert('Failed to save journal entry: ' + err.message);
    }
}

/**
 * Save entity form data
 */
async function saveEntity() {
    console.log('MODAL FUNCTIONS FIX: Saving entity');
    
    // Get form values
    const id = document.getElementById('entity-id-edit').value;
    const code = document.getElementById('entity-code-input').value;
    const name = document.getElementById('entity-name-input').value;
    const parentEntityId = document.getElementById('entity-parent-select').value || null;
    const status = document.getElementById('entity-status-select').value;
    const fiscalYearStart = document.getElementById('entity-fiscal-year-start-input').value;
    const baseCurrency = document.getElementById('entity-base-currency-input').value;
    const isConsolidated = document.getElementById('entity-is-consolidated-input').checked;
    const description = document.getElementById('entity-description-input').value;
    
    // Validate
    if (!code) {
        alert('Please enter an entity code.');
        return;
    }
    
    if (!name) {
        alert('Please enter an entity name.');
        return;
    }
    
    // Create entity data object
    const entityData = {
        id: id || null,
        code,
        name,
        parentEntityId,
        status,
        fiscalYearStart: fiscalYearStart || '01-01',
        baseCurrency: baseCurrency || 'USD',
        isConsolidated,
        description
    };
    
    try {
        // Save to database
        if (window.db) {
            await db.saveEntity(entityData);
            
            // Refresh the data
            const entities = await db.fetchEntities();
            if (window.app) {
                window.app.getState().entities = entities;
                
                // Refresh views
                if (window.ui) {
                    ui.refreshTable('entities', window.app.getState());
                    // Refresh entity selector
                    ui.init(window.app.getState());
                }
            }
            
            // Close the modal
            closeModal('entity-modal');
        } else {
            console.error('MODAL FUNCTIONS FIX: db module not available');
            alert('Unable to save entity: database module not initialized.');
        }
    } catch (err) {
        console.error('MODAL FUNCTIONS FIX: Error saving entity:', err);
        alert('Failed to save entity: ' + err.message);
    }
}

/**
 * Save user form data
 */
async function saveUser() {
    console.log('MODAL FUNCTIONS FIX: Saving user');
    
    // Get form values
    const id = document.getElementById('edit-user-id-input').value;
    const name = document.getElementById('user-name-input').value;
    const email = document.getElementById('user-email-input').value;
    const role = document.getElementById('user-role-select').value;
    const status = document.getElementById('user-status-select').value;
    
    // Validate
    if (!name) {
        alert('Please enter a user name.');
        return;
    }
    
    if (!email) {
        alert('Please enter an email address.');
        return;
    }
    
    // Create user data object
    const userData = {
        id: id || null,
        name,
        email,
        role,
        status
    };
    
    try {
        // Save to database
        if (window.db) {
            await db.saveUser(userData);
            
            // Refresh the data
            const users = await db.fetchUsers();
            if (window.app) {
                window.app.getState().users = users;
                
                // Refresh views
                if (window.ui) {
                    ui.refreshTable('users', window.app.getState());
                }
            }
            
            // Close the modal
            closeModal('user-modal');
        } else {
            console.error('MODAL FUNCTIONS FIX: db module not available');
            alert('Unable to save user: database module not initialized.');
        }
    } catch (err) {
        console.error('MODAL FUNCTIONS FIX: Error saving user:', err);
        alert('Failed to save user: ' + err.message);
    }
}

// Expose functions globally
window.closeModal = closeModal;
window.saveAccount = saveAccount;
window.saveFund = saveFund;
window.saveJournalEntry = saveJournalEntry;
window.saveEntity = saveEntity;
window.saveUser = saveUser;
