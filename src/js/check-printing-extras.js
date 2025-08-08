// src/js/check-printing-extras.js
// Check Printing Extras Module for Mr. MoneyBags v1.x

// ========================================================
// Format API Functions
// ========================================================

// Fetch check formats
async function fetchCheckFormats() {
    const core = window.checkPrintingCore;
    return await core.fetchCheckFormats();
}

// Create new check format
async function createCheckFormat(formatData) {
    try {
        const response = await fetch('/api/checks/formats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formatData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to create format');
        }
        
        const data = await response.json();
        await fetchCheckFormats();
        return data;
    } catch (error) {
        console.error('Error creating check format:', error);
        window.checkPrintingCore.showToast('error', 'Error', error.message || 'Failed to create format');
        return null;
    }
}

// Update existing check format
async function updateCheckFormatAPI(id, formatData) {
    try {
        const response = await fetch(`/api/checks/formats/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(formatData)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to update format');
        }
        
        const data = await response.json();
        await fetchCheckFormats();
        return data;
    } catch (error) {
        console.error('Error updating check format:', error);
        window.checkPrintingCore.showToast('error', 'Error', error.message || 'Failed to update format');
        return null;
    }
}

// Delete check format
async function deleteCheckFormat(id) {
    try {
        const response = await fetch(`/api/checks/formats/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to delete format');
        }
        
        await fetchCheckFormats();
        return true;
    } catch (error) {
        console.error('Error deleting check format:', error);
        window.checkPrintingCore.showToast('error', 'Error', error.message || 'Failed to delete format');
        return false;
    }
}

// Set default format
async function setDefaultFormatAPI(id) {
    try {
        const response = await fetch(`/api/checks/formats/${id}/default`, {
            method: 'PUT',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to set default format');
        }
        
        const data = await response.json();
        await fetchCheckFormats();
        return data;
    } catch (error) {
        console.error('Error setting default format:', error);
        window.checkPrintingCore.showToast('error', 'Error', error.message || 'Failed to set default format');
        return null;
    }
}

// ========================================================
// Print Queue Management
// ========================================================

// Add check to print queue
function addToPrintQueue(checkId) {
    const core = window.checkPrintingCore;
    const check = core.state.checks.find(c => c.id === checkId);
    
    if (!check) {
        core.showToast('error', 'Error', 'Check not found');
        return;
    }
    
    // Check if already in queue
    if (core.state.printQueue.some(c => c.id === checkId)) {
        core.showToast('info', 'Already in Queue', 'This check is already in the print queue');
        return;
    }
    
    core.state.printQueue.push(check);
    updatePrintQueue();
    core.showToast('success', 'Added to Queue', `Check #${check.check_number} added to print queue`);
}

// Remove check from print queue
function removeFromPrintQueue(checkId) {
    const core = window.checkPrintingCore;
    const index = core.state.printQueue.findIndex(c => c.id === checkId);
    
    if (index === -1) return;
    
    core.state.printQueue.splice(index, 1);
    updatePrintQueue();
}

// Clear print queue
function clearPrintQueue() {
    const core = window.checkPrintingCore;
    core.state.printQueue = [];
    updatePrintQueue();
    core.showToast('info', 'Queue Cleared', 'Print queue has been cleared');
}

// Update print queue table
function updatePrintQueue() {
    const core = window.checkPrintingCore;
    const tableBody = document.getElementById('print-queue-table-body');
    const filterSelect = document.getElementById('print-queue-bank-account');
    
    if (!tableBody) return;
    
    // Apply bank account filter if selected
    let filteredQueue = core.state.printQueue;
    if (filterSelect && filterSelect.value) {
        filteredQueue = filteredQueue.filter(check => check.bank_account_id === filterSelect.value);
    }
    
    if (filteredQueue.length === 0) {
        tableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">No checks in print queue. Add checks from the Check Register tab.</td>
            </tr>
        `;
        document.getElementById('print-queue-print')?.setAttribute('disabled', 'disabled');
        document.getElementById('print-queue-clear')?.setAttribute('disabled', 'disabled');
        return;
    }
    
    tableBody.innerHTML = filteredQueue.map(check => `
        <tr data-id="${check.id}">
            <td>${check.check_number}</td>
            <td>${check.bank_account_name}</td>
            <td>${check.date}</td>
            <td>${check.payee}</td>
            <td class="text-right">${core.formatCurrency(check.amount)}</td>
            <td>
                <button class="action-button remove-from-queue" data-id="${check.id}">Remove</button>
                <button class="action-button preview-check" data-id="${check.id}">Preview</button>
            </td>
        </tr>
    `).join('');
    
    // Enable print and clear buttons
    document.getElementById('print-queue-print')?.removeAttribute('disabled');
    document.getElementById('print-queue-clear')?.removeAttribute('disabled');
    
    // Add event listeners
    document.querySelectorAll('.remove-from-queue').forEach(btn => {
        btn.addEventListener('click', () => removeFromPrintQueue(btn.dataset.id));
    });
    
    document.querySelectorAll('.preview-check').forEach(btn => {
        btn.addEventListener('click', () => previewCheck(btn.dataset.id));
    });
    
    // Update print preview if empty
    const previewContainer = document.getElementById('print-preview-container');
    if (previewContainer && !previewContainer.querySelector('.check-template')) {
        previewContainer.innerHTML = `
            <div class="print-preview-placeholder">
                Select a check to preview or click "Print All" to print all checks in the queue.
            </div>
        `;
    }
}

// Print all checks in queue
async function printQueuedChecks() {
    const core = window.checkPrintingCore;
    const filterSelect = document.getElementById('print-queue-bank-account');
    
    // Apply bank account filter if selected
    let filteredQueue = core.state.printQueue;
    if (filterSelect && filterSelect.value) {
        filteredQueue = filteredQueue.filter(check => check.bank_account_id === filterSelect.value);
    }
    
    if (filteredQueue.length === 0) {
        core.showToast('info', 'Empty Queue', 'No checks to print');
        return;
    }
    
    try {
        // Mark checks as printed
        const checkIds = filteredQueue.map(check => check.id);
        const response = await fetch('/api/checks/print-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ check_ids: checkIds })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to print checks');
        }
        
        // Prepare for printing
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            throw new Error('Pop-up blocked. Please allow pop-ups for this site.');
        }
        
        // Generate print content
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Check Batch Print</title>
                <style>
                    @page {
                        size: 8.5in 11in;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        font-family: Arial, sans-serif;
                    }
                    .check-page {
                        page-break-after: always;
                        width: 8.5in;
                        height: 3.5in;
                        position: relative;
                        padding: 0.25in;
                        box-sizing: border-box;
                    }
                    .check-header {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 0.5in;
                    }
                    .bank-info {
                        font-weight: bold;
                        font-size: 14pt;
                    }
                    .check-number {
                        font-weight: bold;
                        font-size: 12pt;
                    }
                    .check-date {
                        position: absolute;
                        top: 0.75in;
                        right: 0.5in;
                        font-size: 12pt;
                    }
                    .check-payee {
                        position: absolute;
                        top: 1.25in;
                        left: 0.5in;
                        font-size: 12pt;
                        max-width: 4in;
                    }
                    .check-amount-box {
                        position: absolute;
                        top: 1.25in;
                        right: 0.5in;
                        border: 1px solid #000;
                        padding: 5px 10px;
                        font-weight: bold;
                        font-size: 12pt;
                        min-width: 1.5in;
                        text-align: right;
                    }
                    .check-amount-words {
                        position: absolute;
                        top: 1.75in;
                        left: 0.5in;
                        font-size: 12pt;
                        width: 6in;
                    }
                    .check-memo {
                        position: absolute;
                        bottom: 0.5in;
                        left: 0.5in;
                        font-size: 10pt;
                    }
                    .check-signature {
                        position: absolute;
                        bottom: 0.5in;
                        right: 0.5in;
                        width: 2in;
                        text-align: center;
                    }
                    .signature-line {
                        border-bottom: 1px solid #000;
                        margin-bottom: 5px;
                        height: 30px;
                    }
                    .signature-label {
                        font-size: 8pt;
                        color: #555;
                    }
                </style>
            </head>
            <body>
        `);
        
        // Add each check
        filteredQueue.forEach(check => {
            const bankAccount = core.state.bankAccounts.find(a => a.id === check.bank_account_id);
            
            printWindow.document.write(`
                <div class="check-page">
                    <div class="check-header">
                        <div class="bank-info">${bankAccount ? bankAccount.bank_name : 'Bank Account'}</div>
                        <div class="check-number">Check #${check.check_number}</div>
                    </div>
                    <div class="check-date">${check.date}</div>
                    <div class="check-payee">${check.payee}</div>
                    <div class="check-amount-box">${core.formatCurrency(check.amount)}</div>
                    <div class="check-amount-words">${check.amount_words}</div>
                    <div class="check-memo">Memo: ${check.memo || ''}</div>
                    <div class="check-signature">
                        <div class="signature-line"></div>
                        <div class="signature-label">Authorized Signature</div>
                    </div>
                </div>
            `);
        });
        
        printWindow.document.write(`
            </body>
            </html>
        `);
        
        printWindow.document.close();
        
        // Print after a short delay to ensure content is loaded
        setTimeout(() => {
            printWindow.print();
            // Close window after printing (or if print is canceled)
            printWindow.addEventListener('afterprint', () => {
                printWindow.close();
            });
        }, 500);
        
        // Refresh checks and clear queue
        await core.fetchChecks();
        clearPrintQueue();
        
        core.showToast('success', 'Printed', `${filteredQueue.length} checks have been sent to printer`);
    } catch (error) {
        console.error('Error printing checks:', error);
        core.showToast('error', 'Print Error', error.message || 'Failed to print checks');
    }
}

// ========================================================
// Check Format Management
// ========================================================

// Edit format
function editFormat(formatId) {
    const core = window.checkPrintingCore;
    const format = core.state.checkFormats.find(f => f.id === formatId);
    if (!format) return;
    
    // Populate form fields
    const formatForm = document.getElementById('format-form');
    const formatName = document.getElementById('format-name');
    const formatDescription = document.getElementById('format-description');
    const formatWidth = document.getElementById('format-width');
    const formatHeight = document.getElementById('format-height');
    const formatIsDefault = document.getElementById('format-is-default');
    
    // Position fields
    const formatPayeeX = document.getElementById('format-payee-x');
    const formatPayeeY = document.getElementById('format-payee-y');
    const formatDateX = document.getElementById('format-date-x');
    const formatDateY = document.getElementById('format-date-y');
    const formatAmountX = document.getElementById('format-amount-x');
    const formatAmountY = document.getElementById('format-amount-y');
    const formatAmountWordsX = document.getElementById('format-amount-words-x');
    const formatAmountWordsY = document.getElementById('format-amount-words-y');
    const formatMemoX = document.getElementById('format-memo-x');
    const formatMemoY = document.getElementById('format-memo-y');
    const formatSignatureX = document.getElementById('format-signature-x');
    const formatSignatureY = document.getElementById('format-signature-y');
    
    // Font fields
    const formatFontName = document.getElementById('format-font-name');
    const formatFontSizeNormal = document.getElementById('format-font-size-normal');
    const formatFontSizeAmount = document.getElementById('format-font-size-amount');
    
    // Populate basic info
    formatName.value = format.format_name || '';
    formatDescription.value = format.description || '';
    formatWidth.value = format.check_width || 8.5;
    formatHeight.value = format.check_height || 3.5;
    formatIsDefault.checked = format.is_default || false;
    
    // Populate positions
    formatPayeeX.value = format.payee_x || 1;
    formatPayeeY.value = format.payee_y || 1.75;
    formatDateX.value = format.date_x || 6.5;
    formatDateY.value = format.date_y || 0.75;
    formatAmountX.value = format.amount_x || 7.25;
    formatAmountY.value = format.amount_y || 1.75;
    formatAmountWordsX.value = format.amount_words_x || 1;
    formatAmountWordsY.value = format.amount_words_y || 2.25;
    formatMemoX.value = format.memo_x || 1;
    formatMemoY.value = format.memo_y || 2.75;
    formatSignatureX.value = format.signature_x || 6.5;
    formatSignatureY.value = format.signature_y || 2.75;
    
    // Populate font settings
    formatFontName.value = format.font_name || 'Arial';
    formatFontSizeNormal.value = format.font_size_normal || 10;
    formatFontSizeAmount.value = format.font_size_amount || 12;
    
    // Set current format
    core.state.currentFormat = format;
    
    // Update title & preview
    const formatEditorTitle = document.getElementById('format-editor-title');
    if (formatEditorTitle) {
        formatEditorTitle.textContent = `Edit Format – ${format.format_name}`;
    }
    
    updateFormatPreview();
    
    // Scroll to editor
    document.querySelector('.format-editor-container')?.scrollIntoView({ behavior: 'smooth' });
}

// Save format
async function saveFormat() {
    const core = window.checkPrintingCore;
    
    // Get form fields
    const formatName = document.getElementById('format-name');
    const formatDescription = document.getElementById('format-description');
    const formatWidth = document.getElementById('format-width');
    const formatHeight = document.getElementById('format-height');
    const formatIsDefault = document.getElementById('format-is-default');
    
    // Position fields
    const formatPayeeX = document.getElementById('format-payee-x');
    const formatPayeeY = document.getElementById('format-payee-y');
    const formatDateX = document.getElementById('format-date-x');
    const formatDateY = document.getElementById('format-date-y');
    const formatAmountX = document.getElementById('format-amount-x');
    const formatAmountY = document.getElementById('format-amount-y');
    const formatAmountWordsX = document.getElementById('format-amount-words-x');
    const formatAmountWordsY = document.getElementById('format-amount-words-y');
    const formatMemoX = document.getElementById('format-memo-x');
    const formatMemoY = document.getElementById('format-memo-y');
    const formatSignatureX = document.getElementById('format-signature-x');
    const formatSignatureY = document.getElementById('format-signature-y');
    
    // Font fields
    const formatFontName = document.getElementById('format-font-name');
    const formatFontSizeNormal = document.getElementById('format-font-size-normal');
    const formatFontSizeAmount = document.getElementById('format-font-size-amount');
    
    // Basic validation
    if (!formatName.value.trim()) {
        formatName.classList.add('is-invalid');
        return;
    }
    
    // Gather data
    const formatData = {
        format_name: formatName.value.trim(),
        description: formatDescription.value.trim(),
        check_width: parseFloat(formatWidth.value) || 8.5,
        check_height: parseFloat(formatHeight.value) || 3.5,
        is_default: formatIsDefault.checked,
        payee_x: parseFloat(formatPayeeX.value) || 1,
        payee_y: parseFloat(formatPayeeY.value) || 1.75,
        date_x: parseFloat(formatDateX.value) || 6.5,
        date_y: parseFloat(formatDateY.value) || 0.75,
        amount_x: parseFloat(formatAmountX.value) || 7.25,
        amount_y: parseFloat(formatAmountY.value) || 1.75,
        amount_words_x: parseFloat(formatAmountWordsX.value) || 1,
        amount_words_y: parseFloat(formatAmountWordsY.value) || 2.25,
        memo_x: parseFloat(formatMemoX.value) || 1,
        memo_y: parseFloat(formatMemoY.value) || 2.75,
        signature_x: parseFloat(formatSignatureX.value) || 6.5,
        signature_y: parseFloat(formatSignatureY.value) || 2.75,
        font_name: formatFontName.value.trim() || 'Arial',
        font_size_normal: parseFloat(formatFontSizeNormal.value) || 10,
        font_size_amount: parseFloat(formatFontSizeAmount.value) || 12
    };
    
    try {
        let saved;
        if (core.state.currentFormat && core.state.currentFormat.id) {
            saved = await updateCheckFormatAPI(core.state.currentFormat.id, formatData);
        } else {
            saved = await createCheckFormat(formatData);
        }
        
        if (!saved) return;
        
        core.showToast('success', 'Saved', `Format "${saved.format_name}" has been saved.`);
        
        // Refresh formats list
        await fetchCheckFormats();
        
        // Reset editor
        cancelFormat();
    } catch (err) {
        console.error(err);
    }
}

// Cancel format editing
function cancelFormat() {
    const core = window.checkPrintingCore;
    const formatForm = document.getElementById('format-form');
    const formatEditorTitle = document.getElementById('format-editor-title');
    const formatPreviewContainer = document.getElementById('format-preview-container');
    
    // Clear current format & hide validation
    core.state.currentFormat = null;
    document.querySelectorAll('.format-editor .is-invalid').forEach(i => i.classList.remove('is-invalid'));
    
    // Reset form
    if (formatForm) formatForm.reset();
    
    // Update UI
    if (formatEditorTitle) formatEditorTitle.textContent = 'Add / Edit Format';
    if (formatPreviewContainer) {
        formatPreviewContainer.innerHTML = '<div class="print-preview-placeholder">Select or create a format to preview.</div>';
    }
}

// Update format preview
function updateFormatPreview() {
    const core = window.checkPrintingCore;
    const previewContainer = document.getElementById('format-preview-container');
    if (!previewContainer) return;
    
    const format = core.state.currentFormat;
    if (!format) {
        previewContainer.innerHTML = '<div class="print-preview-placeholder">Select or create a format to preview.</div>';
        return;
    }
    
    // Create sample check data
    const sampleCheck = {
        check_number: '12345',
        date: new Date().toLocaleDateString(),
        payee: 'Sample Vendor, Inc.',
        amount: 1234.56,
        amount_words: 'One Thousand Two Hundred Thirty-Four and 56/100',
        memo: 'Sample payment'
    };
    
    // Generate preview
    previewContainer.innerHTML = `
        <div class="format-preview-check" style="width: ${format.check_width}in; height: ${format.check_height}in;">
            <div class="check-header">
                <div class="bank-info" style="font-family: ${format.font_name}; font-size: ${format.font_size_normal}pt;">Sample Bank</div>
                <div class="check-number" style="font-family: ${format.font_name}; font-size: ${format.font_size_normal}pt;">Check #${sampleCheck.check_number}</div>
            </div>
            <div class="check-date" style="
                position: absolute;
                top: ${format.date_y}in;
                right: ${format.date_x}in;
                font-family: ${format.font_name};
                font-size: ${format.font_size_normal}pt;
            ">${sampleCheck.date}</div>
            <div class="check-payee" style="
                position: absolute;
                top: ${format.payee_y}in;
                left: ${format.payee_x}in;
                font-family: ${format.font_name};
                font-size: ${format.font_size_normal}pt;
            ">${sampleCheck.payee}</div>
            <div class="check-amount-box" style="
                position: absolute;
                top: ${format.amount_y}in;
                right: ${format.amount_x}in;
                font-family: ${format.font_name};
                font-size: ${format.font_size_amount}pt;
                border: 1px solid #000;
                padding: 2px 5px;
                min-width: 1in;
                text-align: right;
            ">${core.formatCurrency(sampleCheck.amount)}</div>
            <div class="check-amount-words" style="
                position: absolute;
                top: ${format.amount_words_y}in;
                left: ${format.amount_words_x}in;
                font-family: ${format.font_name};
                font-size: ${format.font_size_normal}pt;
                width: 70%;
            ">${sampleCheck.amount_words}</div>
            <div class="check-memo" style="
                position: absolute;
                top: ${format.memo_y}in;
                left: ${format.memo_x}in;
                font-family: ${format.font_name};
                font-size: ${format.font_size_normal}pt;
            ">Memo: ${sampleCheck.memo}</div>
            <div class="check-signature" style="
                position: absolute;
                top: ${format.signature_y}in;
                right: ${format.signature_x}in;
                width: 1.5in;
                text-align: center;
            ">
                <div class="signature-line" style="
                    border-bottom: 1px solid #000;
                    margin-bottom: 5px;
                    height: 20px;
                "></div>
                <div class="signature-label" style="
                    font-family: ${format.font_name};
                    font-size: 8pt;
                ">Authorized Signature</div>
            </div>
        </div>
    `;
}

// Confirm set default format
function confirmSetDefaultFormat(formatId) {
    const core = window.checkPrintingCore;
    const format = core.state.checkFormats.find(f => f.id === formatId);
    if (!format) {
        core.showToast('error', 'Error', 'Format not found.');
        return;
    }
    
    const defaultFormatName = document.getElementById('default-format-name');
    const defaultFormatModal = document.getElementById('default-format-modal');
    
    if (defaultFormatName) defaultFormatName.textContent = format.format_name;
    if (defaultFormatModal) {
        defaultFormatModal.dataset.id = formatId;
        core.openModal(defaultFormatModal);
    }
}

// Set default format
async function setDefaultFormat() {
    const core = window.checkPrintingCore;
    const defaultFormatModal = document.getElementById('default-format-modal');
    if (!defaultFormatModal) return;
    
    const formatId = defaultFormatModal.dataset.id;
    if (!formatId) return;
    
    try {
        const res = await setDefaultFormatAPI(formatId);
        if (!res) return;
        
        core.showToast('success', 'Default Set', 'Default check format updated.');
        await fetchCheckFormats();
        core.closeModal(defaultFormatModal);
    } catch (e) {
        console.error(e);
    }
}

// ========================================================
// Check Preview & Print
// ========================================================

// Preview check
async function previewCheck(checkId) {
    const core = window.checkPrintingCore;
    if (!checkId) return;
    
    try {
        // Get check details
        const check = await core.getCheckById(checkId);
        if (!check) return;
        
        // Get default format
        const defaultFormat = core.state.checkFormats.find(f => f.is_default) || 
                             (core.state.checkFormats.length > 0 ? core.state.checkFormats[0] : null);
        
        if (!defaultFormat) {
            core.showToast('error', 'No Format', 'No check format found. Please create a format first.');
            return;
        }
        
        // Get bank account
        const bankAccount = core.state.bankAccounts.find(a => a.id === check.bank_account_id);
        
        // Generate preview
        const previewContainer = document.getElementById('print-preview-container');
        if (!previewContainer) return;
        
        previewContainer.innerHTML = `
            <div class="check-template" style="width: ${defaultFormat.check_width}in; height: ${defaultFormat.check_height}in;">
                <div class="check-header">
                    <div class="bank-info" style="font-family: ${defaultFormat.font_name}; font-size: ${defaultFormat.font_size_normal}pt;">
                        ${bankAccount ? bankAccount.bank_name : 'Bank Account'}
                    </div>
                    <div class="check-number" style="font-family: ${defaultFormat.font_name}; font-size: ${defaultFormat.font_size_normal}pt;">
                        Check #${check.check_number}
                    </div>
                </div>
                <div class="check-date" style="
                    position: absolute;
                    top: ${defaultFormat.date_y}in;
                    right: ${defaultFormat.date_x}in;
                    font-family: ${defaultFormat.font_name};
                    font-size: ${defaultFormat.font_size_normal}pt;
                ">${check.date}</div>
                <div class="check-payee" style="
                    position: absolute;
                    top: ${defaultFormat.payee_y}in;
                    left: ${defaultFormat.payee_x}in;
                    font-family: ${defaultFormat.font_name};
                    font-size: ${defaultFormat.font_size_normal}pt;
                ">${check.payee}</div>
                <div class="check-amount-box" style="
                    position: absolute;
                    top: ${defaultFormat.amount_y}in;
                    right: ${defaultFormat.amount_x}in;
                    font-family: ${defaultFormat.font_name};
                    font-size: ${defaultFormat.font_size_amount}pt;
                    border: 1px solid #000;
                    padding: 2px 5px;
                    min-width: 1in;
                    text-align: right;
                ">${core.formatCurrency(check.amount)}</div>
                <div class="check-amount-words" style="
                    position: absolute;
                    top: ${defaultFormat.amount_words_y}in;
                    left: ${defaultFormat.amount_words_x}in;
                    font-family: ${defaultFormat.font_name};
                    font-size: ${defaultFormat.font_size_normal}pt;
                    width: 70%;
                ">${check.amount_words}</div>
                <div class="check-memo" style="
                    position: absolute;
                    top: ${defaultFormat.memo_y}in;
                    left: ${defaultFormat.memo_x}in;
                    font-family: ${defaultFormat.font_name};
                    font-size: ${defaultFormat.font_size_normal}pt;
                ">Memo: ${check.memo || ''}</div>
                <div class="check-signature" style="
                    position: absolute;
                    top: ${defaultFormat.signature_y}in;
                    right: ${defaultFormat.signature_x}in;
                    width: 1.5in;
                    text-align: center;
                ">
                    <div class="signature-line" style="
                        border-bottom: 1px solid #000;
                        margin-bottom: 5px;
                        height: 20px;
                    "></div>
                    <div class="signature-label" style="
                        font-family: ${defaultFormat.font_name};
                        font-size: 8pt;
                    ">Authorized Signature</div>
                </div>
            </div>
            <div class="print-actions" style="margin-top: 20px; text-align: center;">
                <button class="action-button primary print-single-check" data-id="${check.id}">
                    <i class="fas fa-print"></i> Print Check
                </button>
            </div>
        `;
        
        // Add print event listener
        document.querySelector('.print-single-check')?.addEventListener('click', () => {
            printSingleCheck(check.id);
        });
        
        // If in print queue tab, scroll to preview
        if (document.querySelector('.tab-item[data-tab="print-queue"]').classList.contains('active')) {
            previewContainer.scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Error previewing check:', error);
        core.showToast('error', 'Preview Error', 'Failed to generate check preview');
    }
}

// Print single check
async function printSingleCheck(checkId) {
    const core = window.checkPrintingCore;
    if (!checkId) return;
    
    try {
        // Mark check as printed
        const response = await fetch(`/api/checks/${checkId}/print`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to print check');
        }
        
        // Trigger print
        window.print();
        
        // Refresh checks
        await core.fetchChecks();
        
        // Remove from queue if present
        removeFromPrintQueue(checkId);
        
        core.showToast('success', 'Printed', 'Check has been sent to printer');
    } catch (error) {
        console.error('Error printing check:', error);
        core.showToast('error', 'Print Error', error.message || 'Failed to print check');
    }
}

// ========================================================
// Event Listeners
// ========================================================
function initExtrasEventListeners() {
    // Format editor
    document.getElementById('format-add')?.addEventListener('click', () => {
        cancelFormat();
        document.querySelector('.format-editor-container')?.scrollIntoView({ behavior: 'smooth' });
    });
    
    document.getElementById('format-save')?.addEventListener('click', saveFormat);
    document.getElementById('format-cancel')?.addEventListener('click', cancelFormat);
    
    // Format position fields - update preview on change
    document.querySelectorAll('.format-editor input').forEach(input => {
        input.addEventListener('change', updateFormatPreview);
        input.addEventListener('input', updateFormatPreview);
    });
    
    // Default format confirmation
    document.getElementById('default-format-confirm')?.addEventListener('click', setDefaultFormat);
    
    // Print queue filter
    document.getElementById('print-queue-bank-account')?.addEventListener('change', updatePrintQueue);
    
    // Print queue buttons
    document.getElementById('print-queue-clear')?.addEventListener('click', clearPrintQueue);
    document.getElementById('print-queue-print')?.addEventListener('click', printQueuedChecks);
}

// ========================================================
// Initialization
// ========================================================
function init() {
    initExtrasEventListeners();
}

// Initialize on DOM content loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for use in other modules
window.checkPrintingExtras = {
    // Format functions
    fetchCheckFormats,
    createCheckFormat,
    updateCheckFormatAPI,
    deleteCheckFormat,
    setDefaultFormatAPI,
    editFormat,
    saveFormat,
    cancelFormat,
    updateFormatPreview,
    confirmSetDefaultFormat,
    setDefaultFormat,
    
    // Print queue functions
    addToPrintQueue,
    removeFromPrintQueue,
    clearPrintQueue,
    updatePrintQueue,
    printQueuedChecks,
    
    // Preview & print functions
    previewCheck,
    printSingleCheck
};
