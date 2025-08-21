/**
 * @file modals.js
 * @description Modal management module for the Non-Profit Fund Accounting System.
 * This module handles opening, closing, and interacting with modal dialogs.
 */

(function(window) {
    'use strict';

    // --- Private Variables and Helper Functions ---
    
    const _modals = {
        account: {
            id: 'account-modal',
            titleElement: 'account-modal-title',
            idInput: 'edit-account-id-input',
            saveButton: 'save-account-btn'
        },
        fund: {
            id: 'fund-modal',
            titleElement: 'fund-modal-title',
            idInput: 'edit-fund-id-input',
            saveButton: 'save-fund-btn'
        },
        journalEntry: {
            id: 'journal-entry-modal',
            titleElement: 'journal-entry-modal-title',
            idInput: 'edit-je-id-input',
            saveButton: ['btn-save-journal-draft', 'btn-save-journal-post']
        },
        entity: {
            id: 'entity-modal',
            titleElement: 'entity-modal-title-text',
            idInput: 'entity-id-edit',
            saveButton: 'btn-save-entity'
        },
        user: {
            id: 'user-modal',
            titleElement: 'user-modal-title',
            idInput: 'edit-user-id-input',
            saveButton: 'save-user-btn'
        }
    };

    /**
     * Generic function to show a modal
     * @param {string} modalId - The ID of the modal to show
     * @param {string} title - The title to set in the modal
     * @param {string} [editId=null] - ID of the item being edited, if any
     */
    function _showModal(modalId, title, editId = null) {
        console.log(`MODALS: Opening modal ${modalId} with title "${title}" and editId: ${editId || 'new'}`);
        
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`MODALS: Modal element with ID "${modalId}" not found`);
            return;
        }
        
        // Set the modal title
        const titleElement = modal.querySelector('.modal-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
        
        // Set the ID in the hidden input field, if any
        const idInput = modal.querySelector('input[type="hidden"]');
        if (idInput) {
            idInput.value = editId || '';
        }
        
        // Display the modal
        modal.style.display = 'flex';
        
        console.log(`MODALS: Modal ${modalId} displayed`);
    }

    /**
     * Close a modal by ID
     * @param {string} modalId - The ID of the modal to close
     */
    function _closeModal(modalId) {
        console.log(`MODALS: Closing modal ${modalId}`);
        
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            console.log(`MODALS: Modal ${modalId} hidden`);
        } else {
            console.error(`MODALS: Modal element with ID "${modalId}" not found`);
        }
    }

    /**
     * Reset form fields in a modal
     * @param {string} modalId - The ID of the modal containing the form
     */
    function _resetModalForm(modalId) {
        console.log(`MODALS: Resetting form fields in modal ${modalId}`);
        
        const modal = document.getElementById(modalId);
        if (!modal) {
            console.error(`MODALS: Modal element with ID "${modalId}" not found`);
            return;
        }
        
        // Reset all input fields except hidden ones
        const inputs = modal.querySelectorAll('input:not([type="hidden"]), textarea, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox' || input.type === 'radio') {
                input.checked = input.defaultChecked;
            } else {
                input.value = input.defaultValue;
            }
        });
    }

    /**
     * Populate an account form with data
     * @param {object} accountData - The account data
     */
    function _populateAccountForm(accountData) {
        document.getElementById('account-code-input').value = accountData.code || '';
        document.getElementById('account-name-input').value = accountData.name || '';
        document.getElementById('account-type-select').value = accountData.type || 'Asset';
        document.getElementById('account-status-select').value = accountData.status || 'Active';
    }

    /**
     * Populate a fund form with data
     * @param {object} fundData - The fund data
     */
    function _populateFundForm(fundData) {
        document.getElementById('fund-code-input').value = fundData.code || '';
        document.getElementById('fund-name-input').value = fundData.name || '';
        document.getElementById('fund-type-select').value = fundData.type || 'Unrestricted';
        document.getElementById('fund-status-select').value = fundData.status || 'Active';
        document.getElementById('fund-description-textarea').value = fundData.description || '';
    }

    /**
     * Populate a journal entry form with data
     * @param {object} jeData - The journal entry data
     */
    function _populateJournalEntryForm(jeData) {
        document.getElementById('journal-entry-date').value = jeData.date || new Date().toISOString().split('T')[0];
        document.getElementById('journal-entry-reference').value = jeData.reference || 'JE-' + Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        document.getElementById('journal-entry-description').value = jeData.description || '';
        document.getElementById('journal-entry-is-inter-entity').checked = Boolean(jeData.isInterEntity);
        
        // Toggle inter-entity fields based on the checkbox
        const interEntityFields = document.getElementById('inter-entity-fields-container');
        if (interEntityFields) {
            interEntityFields.classList.toggle('active', Boolean(jeData.isInterEntity));
        }
        
        // Clear journal lines
        const journalLines = document.getElementById('journal-lines');
        if (journalLines) {
            journalLines.innerHTML = '';
        }
        
        // Reset totals
        document.getElementById('journal-total-debits').value = '$0.00';
        document.getElementById('journal-total-credits').value = '$0.00';
        document.getElementById('journal-difference').value = '$0.00';
        
        // If this is an existing journal entry, populate the lines
        if (jeData.lines && Array.isArray(jeData.lines)) {
            jeData.lines.forEach(line => {
                // This assumes addJournalLine is a function defined elsewhere
                // In a real implementation, we would add this function or modify this approach
                if (typeof window.addJournalLine === 'function') {
                    window.addJournalLine(line);
                } else {
                    console.warn('MODALS: addJournalLine function not available');
                }
            });
        }
    }

    /**
     * Populate an entity form with data
     * @param {object} entityData - The entity data
     */
    function _populateEntityForm(entityData) {
        document.getElementById('entity-code-input').value = entityData.code || '';
        document.getElementById('entity-name-input').value = entityData.name || '';
        
        const parentSelect = document.getElementById('entity-parent-select');
        if (parentSelect) {
            parentSelect.value = entityData.parent_entity_id || '';
        }
        
        document.getElementById('entity-status-select').value = entityData.status || 'Active';
        document.getElementById('entity-fiscal-start-input').value = entityData.fiscal_year_start || '01-01';
        document.getElementById('entity-currency-select').value = entityData.base_currency || 'USD';
        document.getElementById('entity-consolidated-checkbox').checked = Boolean(entityData.is_consolidated);
        document.getElementById('entity-description-textarea').value = entityData.description || '';
    }

    /**
     * Populate a user form with data
     * @param {object} userData - The user data
     */
    function _populateUserForm(userData) {
        document.getElementById('user-name-input').value = userData.name || '';
        document.getElementById('user-email-input').value = userData.email || '';
        document.getElementById('user-role-select').value = userData.role || 'Staff';
        document.getElementById('user-status-select').value = userData.status || 'Active';
    }

    /**
     * Get an account by ID from the application state
     * @param {string} accountId - The account ID to look up
     * @returns {object|null} The account object or null if not found
     */
    function _getAccountById(accountId) {
        if (!window.app) return null;
        const state = window.app.getState();
        return state.accounts.find(account => account.id === accountId) || null;
    }

    /**
     * Get a fund by ID from the application state
     * @param {string} fundId - The fund ID to look up
     * @returns {object|null} The fund object or null if not found
     */
    function _getFundById(fundId) {
        if (!window.app) return null;
        const state = window.app.getState();
        return state.funds.find(fund => fund.id === fundId) || null;
    }

    /**
     * Get a journal entry by ID from the application state
     * @param {string} jeId - The journal entry ID to look up
     * @returns {object|null} The journal entry object or null if not found
     */
    function _getJournalEntryById(jeId) {
        if (!window.app) return null;
        const state = window.app.getState();
        return state.journalEntries.find(je => je.id === jeId) || null;
    }

    /**
     * Get an entity by ID from the application state
     * @param {string} entityId - The entity ID to look up
     * @returns {object|null} The entity object or null if not found
     */
    function _getEntityById(entityId) {
        if (!window.app) return null;
        const state = window.app.getState();
        return state.entities.find(entity => entity.id === entityId) || null;
    }

    /**
     * Get a user by ID from the application state
     * @param {string} userId - The user ID to look up
     * @returns {object|null} The user object or null if not found
     */
    function _getUserById(userId) {
        if (!window.app) return null;
        const state = window.app.getState();
        return state.users.find(user => user.id === userId) || null;
    }

    // --- Public API ---
    
    const modals = {
        /**
         * Initialize the modals module
         * Sets up event handlers for close buttons and background clicks
         */
        init() {
            console.log('MODALS: Initializing...');
            
            // Set up close buttons
            document.querySelectorAll('.modal-close-btn').forEach(btn => {
                const modalId = btn.dataset.modalId;
                if (modalId) {
                    btn.addEventListener('click', function() {
                        modals.close(modalId);
                    });
                }
            });
            
            // Set up background clicks to close modals
            document.querySelectorAll('.modal-overlay').forEach(overlay => {
                overlay.addEventListener('click', function(event) {
                    if (event.target === this) {
                        modals.close(this.id);
                    }
                });
            });
            
            console.log('MODALS: Initialization complete');
        },
        
        /**
         * Open the account modal
         * @param {string} [accountId=null] - ID of account to edit, null for new account
         */
        openAccount(accountId = null) {
            console.log(`MODALS: Opening account modal for ID: ${accountId || 'new'}`);
            
            // Determine title based on whether this is a new or existing account
            const title = accountId ? 'Edit Account' : 'Add New Account';
            
            // Reset the form first
            _resetModalForm(_modals.account.id);
            
            // If editing, populate the form with account data
            if (accountId) {
                const accountData = _getAccountById(accountId);
                if (accountData) {
                    _populateAccountForm(accountData);
                } else {
                    console.error(`MODALS: Account with ID "${accountId}" not found`);
                    return;
                }
            }
            
            // Show the modal
            _showModal(_modals.account.id, title, accountId);
        },
        
        /**
         * Open the fund modal
         * @param {string} [fundId=null] - ID of fund to edit, null for new fund
         */
        openFund(fundId = null) {
            console.log(`MODALS: Opening fund modal for ID: ${fundId || 'new'}`);
            
            const title = fundId ? 'Edit Fund' : 'Add New Fund';
            _resetModalForm(_modals.fund.id);
            
            if (fundId) {
                const fundData = _getFundById(fundId);
                if (fundData) {
                    _populateFundForm(fundData);
                } else {
                    console.error(`MODALS: Fund with ID "${fundId}" not found`);
                    return;
                }
            }
            
            _showModal(_modals.fund.id, title, fundId);
        },
        
        /**
         * Open the journal entry modal
         * @param {string} [jeId=null] - ID of journal entry to edit, null for new entry
         */
        openJournalEntry(jeId = null) {
            console.log(`MODALS: Opening journal entry modal for ID: ${jeId || 'new'}`);
            
            const title = jeId ? 'Edit Journal Entry' : 'New Journal Entry';
            _resetModalForm(_modals.journalEntry.id);
            
            if (jeId) {
                const jeData = _getJournalEntryById(jeId);
                if (jeData) {
                    _populateJournalEntryForm(jeData);
                } else {
                    console.error(`MODALS: Journal entry with ID "${jeId}" not found`);
                    return;
                }
            } else {
                // For new journal entries, set some default values
                _populateJournalEntryForm({});
            }
            
            _showModal(_modals.journalEntry.id, title, jeId);
        },
        
        /**
         * Open the entity modal
         * @param {string} [entityId=null] - ID of entity to edit, null for new entity
         */
        openEntity(entityId = null) {
            console.log(`MODALS: Opening entity modal for ID: ${entityId || 'new'}`);
            
            const title = entityId ? 'Edit Entity' : 'Add New Entity';
            _resetModalForm(_modals.entity.id);
            
            if (entityId) {
                const entityData = _getEntityById(entityId);
                if (entityData) {
                    _populateEntityForm(entityData);
                } else {
                    console.error(`MODALS: Entity with ID "${entityId}" not found`);
                    return;
                }
            }
            
            _showModal(_modals.entity.id, title, entityId);
        },
        
        /**
         * Open the user modal
         * @param {string} [userId=null] - ID of user to edit, null for new user
         */
        openUser(userId = null) {
            console.log(`MODALS: Opening user modal for ID: ${userId || 'new'}`);
            
            const title = userId ? 'Edit User' : 'Add New User';
            _resetModalForm(_modals.user.id);
            
            if (userId) {
                const userData = _getUserById(userId);
                if (userData) {
                    _populateUserForm(userData);
                } else {
                    console.error(`MODALS: User with ID "${userId}" not found`);
                    return;
                }
            }
            
            _showModal(_modals.user.id, title, userId);
        },
        
        /**
         * Close a modal by ID
         * @param {string} modalId - The ID of the modal to close
         */
        close(modalId) {
            _closeModal(modalId);
        },
        
        /**
         * Close all open modals
         */
        closeAll() {
            console.log('MODALS: Closing all modals');
            
            document.querySelectorAll('.modal-overlay[style*="display: flex"]').forEach(modal => {
                modal.style.display = 'none';
            });
        }
    };
    
    // Expose the public API to the window
    window.modals = modals;
    
    // Auto-initialize when included if document is loaded
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        console.log('MODALS: Document already loaded, initializing immediately');
        modals.init();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('MODALS: DOMContentLoaded event fired, initializing');
            modals.init();
        });
    }
    
})(window);
