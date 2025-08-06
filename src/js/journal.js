/**
 * @file journal.js
 * @description Journal entry specific functions for the Non-Profit Fund Accounting System.
 */

(function(window) {
    'use strict';
    
    // Format a number as currency
    function _formatCurrency(amount) {
        return '$' + (Number(amount) || 0).toFixed(2);
    }

    // Parse currency string to number
    function _parseCurrency(str) {
        if (!str) return 0;
        return parseFloat(str.replace(/[^0-9.-]+/g, '')) || 0;
    }
    
    // Journal module public API
    const journal = {
        init() {
            console.log('JOURNAL: Initializing...');
            
            // Set up event listeners
            const addLineBtn = document.getElementById('add-journal-line');
            if (addLineBtn) {
                addLineBtn.addEventListener('click', () => this.addLine());
            }
            
            // Set up inter-entity checkbox handler
            const interEntityCheck = document.getElementById('journal-entry-is-inter-entity');
            if (interEntityCheck) {
                interEntityCheck.addEventListener('change', function() {
                    const fieldsContainer = document.getElementById('inter-entity-fields-container');
                    if (fieldsContainer) {
                        fieldsContainer.classList.toggle('active', this.checked);
                    }
                });
            }
        },
        
        addLine(data = {}, readOnly = false) {
            const tbody = document.getElementById('journal-lines');
            if (!tbody) return;
            
            // Create a new row with account dropdown, fund dropdown, debit/credit inputs, and description
            const tr = document.createElement('tr');
            
            // Get state for accounts and funds
            const state = window.app ? window.app.getState() : {};
            const entityId = state.currentEntityId || '';
            
            // Create account select options
            let accountOptions = '<option value="">Select Account...</option>';
            if (state.accounts) {
                state.accounts
                    .filter(a => a.entityId === entityId && a.status === 'Active')
                    .forEach(account => {
                        accountOptions += `<option value="${account.id}">${account.code} - ${account.name}</option>`;
                    });
            }
            
            // Create fund select options
            let fundOptions = '<option value="">Select Fund...</option>';
            if (state.funds) {
                state.funds
                    .filter(f => f.entityId === entityId && f.status === 'Active')
                    .forEach(fund => {
                        fundOptions += `<option value="${fund.id}">${fund.code} - ${fund.name}</option>`;
                    });
            }
            
            // Create row HTML
            tr.innerHTML = `
                <td><select class="form-input" data-field="accountId">${accountOptions}</select></td>
                <td><select class="form-input" data-field="fundId">${fundOptions}</select></td>
                <td><input type="number" class="form-input" data-field="debit" value="" step="0.01"></td>
                <td><input type="number" class="form-input" data-field="credit" value="" step="0.01"></td>
                <td><input type="text" class="form-input" data-field="description" value=""></td>
                <td><button class="btn-danger remove-line">✕</button></td>
            `;
            
            // Add event listeners
            const debitInput = tr.querySelector('[data-field="debit"]');
            const creditInput = tr.querySelector('[data-field="credit"]');
            
            if (debitInput) {
                debitInput.addEventListener('input', function() {
                    if (this.value && parseFloat(this.value) > 0) {
                        if (creditInput) creditInput.value = '';
                    }
                    journal.updateTotals();
                });
            }
            
            if (creditInput) {
                creditInput.addEventListener('input', function() {
                    if (this.value && parseFloat(this.value) > 0) {
                        if (debitInput) debitInput.value = '';
                    }
                    journal.updateTotals();
                });
            }
            
            // Set remove button handler
            const removeBtn = tr.querySelector('.remove-line');
            if (removeBtn) {
                removeBtn.addEventListener('click', function() {
                    tr.parentElement.removeChild(tr);
                    journal.updateTotals();
                });
            }
            
            // If we have data, populate the row
            if (data.accountId) {
                tr.querySelector('[data-field="accountId"]').value = data.accountId;
            }
            if (data.fundId) {
                tr.querySelector('[data-field="fundId"]').value = data.fundId;
            }
            if (data.debit) {
                tr.querySelector('[data-field="debit"]').value = data.debit;
            }
            if (data.credit) {
                tr.querySelector('[data-field="credit"]').value = data.credit;
            }
            if (data.description) {
                tr.querySelector('[data-field="description"]').value = data.description;
            }
            
            // Add the row to the table
            tbody.appendChild(tr);
            
            // Update totals
            this.updateTotals();
        },
        
        updateTotals() {
            const rows = document.getElementById('journal-lines')?.querySelectorAll('tr') || [];
            
            let totalDebits = 0;
            let totalCredits = 0;
            
            rows.forEach(row => {
                const debit = parseFloat(row.querySelector('[data-field="debit"]')?.value || 0);
                const credit = parseFloat(row.querySelector('[data-field="credit"]')?.value || 0);
                
                totalDebits += debit || 0;
                totalCredits += credit || 0;
            });
            
            // Update the UI
            document.getElementById('journal-total-debits').value = _formatCurrency(totalDebits);
            document.getElementById('journal-total-credits').value = _formatCurrency(totalCredits);
            
            // Calculate difference
            const difference = Math.abs(totalDebits - totalCredits);
            document.getElementById('journal-difference').value = _formatCurrency(difference);
            
            // Highlight if balanced or not
            const differenceField = document.getElementById('journal-difference');
            if (differenceField) {
                differenceField.style.backgroundColor = difference < 0.01 ? '#e8f5e9' : '#ffebee';
            }
        },
        
        collectFormData() {
            // Get basic form data
            const jeData = {
                id: document.getElementById('edit-je-id-input')?.value || null,
                entityId: window.app?.getState().currentEntityId,
                date: document.getElementById('journal-entry-date')?.value,
                reference: document.getElementById('journal-entry-reference')?.value,
                description: document.getElementById('journal-entry-description')?.value,
                isInterEntity: document.getElementById('journal-entry-is-inter-entity')?.checked || false,
                lines: []
            };
            
            // Collect lines
            const rows = document.getElementById('journal-lines')?.querySelectorAll('tr') || [];
            rows.forEach(row => {
                const accountId = row.querySelector('[data-field="accountId"]')?.value;
                const fundId = row.querySelector('[data-field="fundId"]')?.value;
                const debit = parseFloat(row.querySelector('[data-field="debit"]')?.value || 0);
                const credit = parseFloat(row.querySelector('[data-field="credit"]')?.value || 0);
                const description = row.querySelector('[data-field="description"]')?.value || '';
                
                if (accountId && fundId && (debit > 0 || credit > 0)) {
                    jeData.lines.push({ accountId, fundId, debit, credit, description });
                }
            });
            
            // Calculate total amount
            jeData.totalAmount = jeData.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
            return jeData;
        }
    };

    // Expose the public API
    window.journal = journal;
    
    // Add support for the legacy addJournalLine global function
    window.addJournalLine = function(data, readOnly) {
        journal.addLine(data, readOnly);
    };
    
    // Initialize
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        journal.init();
    } else {
        document.addEventListener('DOMContentLoaded', () => journal.init());
    }
})(window);
