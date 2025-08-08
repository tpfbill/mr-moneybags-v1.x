// src/js/check-printing-forms.js
// Check Printing Forms Module for Mr. MoneyBags v1.x

// ========================================================
// Form Management Functions
// ========================================================

// Populate check form with data
function populateCheckForm(check) {
    const core = window.checkPrintingCore;
    if (!check) return;
    
    // Store current check in state
    core.state.currentCheck = check;
    
    // Populate form fields
    document.getElementById('check-bank-account').value = check.bank_account_id || '';
    document.getElementById('check-number').value = check.check_number || '';
    document.getElementById('check-date').value = check.date || '';
    document.getElementById('check-payee').value = check.payee || '';
    document.getElementById('check-amount').value = check.amount || '';
    document.getElementById('check-amount-words').value = check.amount_words || numberToWords(check.amount) || '';
    document.getElementById('check-memo').value = check.memo || '';
    
    // Update status field
    document.getElementById('check-status').textContent = check.status || 'Draft';
    
    // Show/hide action buttons based on status
    updateActionButtons(check.status);
}

// Reset check form
function resetCheckForm() {
    const core = window.checkPrintingCore;
    
    // Clear current check from state
    core.state.currentCheck = null;
    
    // Reset form fields
    document.getElementById('check-form').reset();
    document.getElementById('check-status').textContent = 'Draft';
    
    // Reset validation styling
    document.querySelectorAll('.form-control.is-invalid').forEach(field => {
        field.classList.remove('is-invalid');
    });
    
    // Update action buttons
    updateActionButtons('Draft');
}

// Update action buttons based on check status
function updateActionButtons(status) {
    const previewBtn = document.getElementById('check-preview');
    const printBtn = document.getElementById('check-print');
    const voidBtn = document.getElementById('check-void');
    const clearBtn = document.getElementById('check-clear');
    const deleteBtn = document.getElementById('check-delete');
    
    if (!previewBtn || !printBtn || !voidBtn || !clearBtn || !deleteBtn) return;
    
    // Default all buttons to disabled
    previewBtn.disabled = true;
    printBtn.disabled = true;
    voidBtn.disabled = true;
    clearBtn.disabled = true;
    deleteBtn.disabled = true;
    
    switch (status) {
        case 'Draft':
            previewBtn.disabled = false;
            printBtn.disabled = false;
            deleteBtn.disabled = false;
            break;
        case 'Printed':
            previewBtn.disabled = false;
            voidBtn.disabled = false;
            clearBtn.disabled = false;
            break;
        case 'Voided':
            // All buttons remain disabled
            break;
        case 'Cleared':
            previewBtn.disabled = false;
            break;
    }
}

// Save check (create or update)
async function saveCheck() {
    const core = window.checkPrintingCore;
    
    // Validate form
    if (!await validateCheckForm()) {
        return false;
    }
    
    // Gather form data
    const checkData = {
        bank_account_id: document.getElementById('check-bank-account').value,
        check_number: document.getElementById('check-number').value.trim(),
        date: document.getElementById('check-date').value,
        payee: document.getElementById('check-payee').value.trim(),
        amount: parseFloat(document.getElementById('check-amount').value) || 0,
        amount_words: document.getElementById('check-amount-words').value.trim(),
        memo: document.getElementById('check-memo').value.trim(),
        status: core.state.currentCheck?.status || 'Draft'
    };
    
    try {
        let savedCheck;
        
        if (core.state.currentCheck?.id) {
            // Update existing check
            savedCheck = await core.updateCheck(core.state.currentCheck.id, checkData);
        } else {
            // Create new check
            savedCheck = await core.createCheck(checkData);
        }
        
        if (!savedCheck) return false;
        
        core.showToast('success', 'Saved', `Check #${savedCheck.check_number} has been saved.`);
        resetCheckForm();
        core.switchTab('check-register');
        return true;
    } catch (error) {
        console.error('Error saving check:', error);
        core.showToast('error', 'Error', error.message || 'Failed to save check');
        return false;
    }
}

// ========================================================
// Check Operations
// ========================================================

// View check details
async function viewCheck(checkId) {
    const core = window.checkPrintingCore;
    if (!checkId) return;
    
    try {
        const check = await core.getCheckById(checkId);
        if (!check) return;
        
        // Populate modal with check details
        const detailsContent = document.getElementById('check-details-content');
        if (!detailsContent) return;
        
        const bankAccount = core.state.bankAccounts.find(a => a.id === check.bank_account_id);
        
        detailsContent.innerHTML = `
            <div class="check-details">
                <div class="details-section">
                    <h4>Check Information</h4>
                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-label">Check Number</div>
                            <div class="detail-value">${check.check_number}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Status</div>
                            <div class="detail-value">
                                <span class="status-badge status-${check.status.toLowerCase()}">${check.status}</span>
                            </div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Date</div>
                            <div class="detail-value">${check.date}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Amount</div>
                            <div class="detail-value">${core.formatCurrency(check.amount)}</div>
                        </div>
                        <div class="detail-item full-width">
                            <div class="detail-label">Amount in Words</div>
                            <div class="detail-value">${check.amount_words}</div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section">
                    <h4>Payee & Bank Information</h4>
                    <div class="details-grid">
                        <div class="detail-item full-width">
                            <div class="detail-label">Payee</div>
                            <div class="detail-value">${check.payee}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Bank Account</div>
                            <div class="detail-value">${bankAccount ? `${bankAccount.bank_name} - ${bankAccount.account_name}` : 'Unknown'}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Account Number</div>
                            <div class="detail-value">${bankAccount ? `xxxx-xxxx-${bankAccount.account_number.slice(-4)}` : 'Unknown'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="details-section">
                    <h4>Additional Information</h4>
                    <div class="details-grid">
                        <div class="detail-item full-width">
                            <div class="detail-label">Memo</div>
                            <div class="detail-value">${check.memo || 'N/A'}</div>
                        </div>
                        ${check.void_reason ? `
                        <div class="detail-item full-width">
                            <div class="detail-label">Void Reason</div>
                            <div class="detail-value">${check.void_reason}</div>
                        </div>
                        ` : ''}
                        ${check.cleared_date ? `
                        <div class="detail-item">
                            <div class="detail-label">Cleared Date</div>
                            <div class="detail-value">${check.cleared_date}</div>
                        </div>
                        ` : ''}
                        <div class="detail-item">
                            <div class="detail-label">Created</div>
                            <div class="detail-value">${check.created_at}</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Last Updated</div>
                            <div class="detail-value">${check.updated_at}</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        core.openModal(document.getElementById('check-details-modal'));
    } catch (error) {
        console.error('Error viewing check:', error);
        core.showToast('error', 'Error', 'Failed to load check details');
    }
}

// Edit check
async function editCheck(checkId) {
    const core = window.checkPrintingCore;
    if (!checkId) return;
    
    try {
        const check = await core.getCheckById(checkId);
        if (!check) return;
        
        // Switch to new check tab and populate form
        core.switchTab('new-check');
        populateCheckForm(check);
    } catch (error) {
        console.error('Error editing check:', error);
        core.showToast('error', 'Error', 'Failed to load check for editing');
    }
}

// Create new check
function createNewCheck() {
    resetCheckForm();
    
    // Auto-suggest next check number
    suggestNextCheckNumber();
    
    // Set today's date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('check-date').value = today;
}

// Void check
async function voidCheck() {
    const core = window.checkPrintingCore;
    const modal = document.getElementById('void-check-modal');
    if (!modal) return;
    
    const checkId = modal.dataset.id;
    const reason = document.getElementById('void-check-reason').value.trim();
    
    if (!reason) {
        document.getElementById('void-check-reason').classList.add('is-invalid');
        return;
    }
    
    try {
        const response = await fetch(`/api/checks/${checkId}/void`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ void_reason: reason })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to void check');
        }
        
        await core.fetchChecks();
        core.closeModal(modal);
        core.showToast('success', 'Voided', 'Check has been voided successfully.');
    } catch (error) {
        console.error('Error voiding check:', error);
        core.showToast('error', 'Error', error.message || 'Failed to void check');
    }
}

// Clear check
async function clearCheck() {
    const core = window.checkPrintingCore;
    const modal = document.getElementById('clear-check-modal');
    if (!modal) return;
    
    const checkId = modal.dataset.id;
    const clearedDate = document.getElementById('clear-check-date').value;
    
    if (!clearedDate) {
        document.getElementById('clear-check-date').classList.add('is-invalid');
        return;
    }
    
    try {
        const response = await fetch(`/api/checks/${checkId}/clear`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ cleared_date: clearedDate })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to clear check');
        }
        
        await core.fetchChecks();
        core.closeModal(modal);
        core.showToast('success', 'Cleared', 'Check has been marked as cleared.');
    } catch (error) {
        console.error('Error clearing check:', error);
        core.showToast('error', 'Error', error.message || 'Failed to clear check');
    }
}

// Confirm delete check
function confirmDeleteCheck(checkId) {
    const core = window.checkPrintingCore;
    const check = core.state.checks.find(c => c.id === checkId);
    if (!check) return;
    
    const modal = document.getElementById('delete-check-modal');
    if (!modal) return;
    
    document.getElementById('delete-check-name').textContent = `#${check.check_number}`;
    modal.dataset.id = checkId;
    core.openModal(modal);
}

// Confirm void check
function confirmVoidCheck(checkId) {
    const core = window.checkPrintingCore;
    const check = core.state.checks.find(c => c.id === checkId);
    if (!check) return;
    
    const modal = document.getElementById('void-check-modal');
    if (!modal) return;
    
    document.getElementById('void-check-name').textContent = `#${check.check_number}`;
    document.getElementById('void-check-reason').value = '';
    document.getElementById('void-check-reason').classList.remove('is-invalid');
    modal.dataset.id = checkId;
    core.openModal(modal);
}

// Confirm clear check
function confirmClearCheck(checkId) {
    const core = window.checkPrintingCore;
    const check = core.state.checks.find(c => c.id === checkId);
    if (!check) return;
    
    const modal = document.getElementById('clear-check-modal');
    if (!modal) return;
    
    document.getElementById('clear-check-name').textContent = `#${check.check_number}`;
    
    // Set today's date as default cleared date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('clear-check-date').value = today;
    document.getElementById('clear-check-date').classList.remove('is-invalid');
    
    modal.dataset.id = checkId;
    core.openModal(modal);
}

// ========================================================
// Form Validation
// ========================================================

// Validate check form
async function validateCheckForm() {
    const core = window.checkPrintingCore;
    let valid = true;
    
    // Required fields
    const required = [
        { field: document.getElementById('check-bank-account'), name: 'Bank account' },
        { field: document.getElementById('check-number'), name: 'Check number' },
        { field: document.getElementById('check-date'), name: 'Date' },
        { field: document.getElementById('check-payee'), name: 'Payee' },
        { field: document.getElementById('check-amount'), name: 'Amount' }
    ];
    
    required.forEach(({ field, name }) => {
        if (!field.value) {
            field.classList.add('is-invalid');
            valid = false;
        } else {
            field.classList.remove('is-invalid');
        }
    });
    
    if (!valid) {
        core.showToast('error', 'Validation Error', 'Please fill in all required fields.');
        return false;
    }
    
    // Check number uniqueness
    const bankAccountId = document.getElementById('check-bank-account').value;
    const checkNumber = document.getElementById('check-number').value.trim();
    const checkId = core.state.currentCheck ? core.state.currentCheck.id : null;
    
    const result = await core.validateCheckNumber(bankAccountId, checkNumber, checkId);
    if (!result.is_available) {
        core.showToast('error', 'Duplicate Number', result.message || 'Check number already used.');
        document.getElementById('check-number').classList.add('is-invalid');
        return false;
    }
    
    // Amount validation
    const amount = parseFloat(document.getElementById('check-amount').value);
    if (isNaN(amount) || amount <= 0) {
        document.getElementById('check-amount').classList.add('is-invalid');
        core.showToast('error', 'Invalid Amount', 'Please enter a valid positive amount.');
        return false;
    }
    
    return true;
}

// ========================================================
// Amount to Words
// ========================================================

// Convert number to words
function numberToWords(num) {
    if (isNaN(num)) return '';
    
    const dollars = Math.floor(parseFloat(num));
    const cents = Math.round((parseFloat(num) - dollars) * 100);
    
    if (dollars === 0 && cents === 0) return 'Zero and 00/100';
    
    const dollarWords = convertToWords(dollars);
    const centWords = cents.toString().padStart(2, '0');
    
    return `${dollarWords} and ${centWords}/100`;
}

// Helper function to convert numbers to words
function convertToWords(num) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    
    if (num === 0) return 'Zero';
    
    function convertLessThanThousand(n) {
        if (n === 0) return '';
        
        if (n < 20) {
            return ones[n];
        }
        
        if (n < 100) {
            return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? '-' + ones[n % 10] : '');
        }
        
        return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' ' + convertLessThanThousand(n % 100) : '');
    }
    
    let result = '';
    
    if (num >= 1000000000) {
        result += convertLessThanThousand(Math.floor(num / 1000000000)) + ' Billion ';
        num %= 1000000000;
    }
    
    if (num >= 1000000) {
        result += convertLessThanThousand(Math.floor(num / 1000000)) + ' Million ';
        num %= 1000000;
    }
    
    if (num >= 1000) {
        result += convertLessThanThousand(Math.floor(num / 1000)) + ' Thousand ';
        num %= 1000;
    }
    
    result += convertLessThanThousand(num);
    
    return result.trim();
}

// ========================================================
// Check Number Management
// ========================================================

// Suggest next check number
async function suggestNextCheckNumber() {
    const bankAccountSelect = document.getElementById('check-bank-account');
    const checkNumberInput = document.getElementById('check-number');
    
    if (!bankAccountSelect || !bankAccountSelect.value || !checkNumberInput) return;
    
    try {
        const response = await fetch(
            `/api/checks/next-number?bank_account_id=${bankAccountSelect.value}`,
            { credentials: 'include' }
        );
        if (!response.ok) throw new Error('Failed to get next check number');
        
        const data = await response.json();
        checkNumberInput.value = data.next_number;
    } catch (error) {
        console.error('Error getting next check number:', error);
    }
}

// ========================================================
// Form Helpers
// ========================================================

// Initialize form event listeners
function initFormEventListeners() {
    // Bank account change - suggest next check number
    const bankAccountSelect = document.getElementById('check-bank-account');
    if (bankAccountSelect) {
        bankAccountSelect.addEventListener('change', suggestNextCheckNumber);
    }
    
    // Amount input - convert to words
    const amountInput = document.getElementById('check-amount');
    const amountWordsInput = document.getElementById('check-amount-words');
    if (amountInput && amountWordsInput) {
        amountInput.addEventListener('input', () => {
            const amount = parseFloat(amountInput.value);
            amountWordsInput.value = !isNaN(amount) ? numberToWords(amount) : '';
        });
    }
    
    // Void check modal
    const voidCheckConfirm = document.getElementById('void-check-confirm');
    if (voidCheckConfirm) {
        voidCheckConfirm.addEventListener('click', voidCheck);
    }
    
    // Clear check modal
    const clearCheckConfirm = document.getElementById('clear-check-confirm');
    if (clearCheckConfirm) {
        clearCheckConfirm.addEventListener('click', clearCheck);
    }
    
    // New check button
    const newCheckBtn = document.getElementById('new-check-btn');
    if (newCheckBtn) {
        newCheckBtn.addEventListener('click', () => {
            createNewCheck();
            window.checkPrintingCore.switchTab('new-check');
        });
    }
}

// Initialize module
function init() {
    initFormEventListeners();
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for use in other modules
window.checkPrintingForms = {
    populateCheckForm,
    resetCheckForm,
    saveCheck,
    viewCheck,
    editCheck,
    createNewCheck,
    voidCheck,
    clearCheck,
    confirmDeleteCheck,
    confirmVoidCheck,
    confirmClearCheck,
    validateCheckForm,
    numberToWords,
    suggestNextCheckNumber
};
