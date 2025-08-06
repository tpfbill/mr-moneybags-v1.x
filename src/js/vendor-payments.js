// API Configuration
const API_BASE_URL = 'http://localhost:3000';

// Global variables
let currentVendor = null;
let currentBatch = null;
let entities = [];
let funds = [];
let bankAccounts = [];
let vendors = [];
let nachaSettings = [];

// Utility functions
function showLoading() {
    document.querySelector('.loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.querySelector('.loading-overlay').style.display = 'none';
}

function showToast(title, message, isError = false) {
    const toast = document.getElementById('toastNotification');
    const toastTitle = document.getElementById('toastTitle');
    const toastMessage = document.getElementById('toastMessage');
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    if (isError) {
        toast.classList.add('bg-danger', 'text-white');
    } else {
        toast.classList.remove('bg-danger', 'text-white');
    }
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US');
}

function maskAccountNumber(accountNumber) {
    if (!accountNumber) return '';
    const visible = accountNumber.slice(-4);
    const masked = 'X'.repeat(accountNumber.length - 4);
    return masked + visible;
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'draft': return 'bg-secondary';
        case 'pending_approval': return 'bg-warning';
        case 'approved': return 'bg-success';
        case 'processed': return 'bg-primary';
        case 'transmitted': return 'bg-info';
        case 'confirmed': return 'bg-success';
        case 'rejected': return 'bg-danger';
        case 'error': return 'bg-danger';
        case 'active': return 'bg-success';
        case 'inactive': return 'bg-secondary';
        case 'suspended': return 'bg-warning';
        default: return 'bg-secondary';
    }
}

// API Calls
async function fetchEntities() {
    try {
        console.log('Fetching entities from API...');
        const response = await fetch(`${API_BASE_URL}/api/entities`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        entities = await response.json();
        console.log('Entities fetched successfully:', entities.length, 'entities');
        
        // Populate entity dropdowns
        const entitySelects = [
            document.getElementById('entityId'),
            document.getElementById('editEntityId'),
            document.getElementById('batchEntityId'),
            document.getElementById('settingsEntityId'),
            document.getElementById('editSettingsEntityId')
        ];
        
        entitySelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add entity options
            entities.forEach(entity => {
                const option = document.createElement('option');
                option.value = entity.id;
                option.textContent = entity.name;
                select.appendChild(option);
            });
        });
        console.log('Entity dropdowns populated successfully');
    } catch (error) {
        console.error('Error fetching entities:', error);
        showToast('Error', 'Failed to load entities: ' + error.message, true);
    }
}

async function fetchFunds(entityId = null) {
    try {
        console.log('Fetching funds from API...');
        const url = entityId ? `${API_BASE_URL}/api/funds?entityId=${entityId}` : `${API_BASE_URL}/api/funds`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchFunds] /api/funds endpoint not yet implemented - skipping');
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        funds = await response.json();
        console.log('Funds fetched successfully:', funds.length, 'funds');
        
        // Populate fund dropdowns
        const fundSelects = [
            document.getElementById('batchFundId')
        ];
        
        fundSelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add fund options
            funds.forEach(fund => {
                const option = document.createElement('option');
                option.value = fund.id;
                option.textContent = fund.name;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error fetching funds:', error);
        showToast('Error', 'Failed to load funds: ' + error.message, true);
    }
}

async function fetchBankAccounts() {
    try {
        console.log('Fetching bank accounts from API...');
        const response = await fetch(`${API_BASE_URL}/api/bank-accounts`);

        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchBankAccounts] /api/bank-accounts endpoint not yet implemented - skipping');
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        bankAccounts = await response.json();
        console.log('Bank accounts fetched successfully:', bankAccounts.length, 'accounts');
        
        // Populate bank account dropdowns
        const bankAccountSelects = [
            document.getElementById('settlementAccountId'),
            document.getElementById('editSettlementAccountId')
        ];
        
        bankAccountSelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add bank account options
            bankAccounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.account_name} (${account.bank_name})`;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        showToast('Error', 'Failed to load bank accounts: ' + error.message, true);
    }
}

async function fetchVendors() {
    try {
        console.log('Fetching vendors from API...');
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api/vendors`);
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchVendors] /api/vendors endpoint not yet implemented - skipping');
                hideLoading();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        vendors = await response.json();
        console.log('Vendors fetched successfully:', vendors.length, 'vendors');
        renderVendorsTable();
        
        // Populate vendor dropdowns
        const vendorSelects = [
            document.getElementById('paymentVendorId'),
            document.getElementById('editPaymentVendorId')
        ];
        
        vendorSelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add vendor options
            vendors.forEach(vendor => {
                const option = document.createElement('option');
                option.value = vendor.id;
                option.textContent = `${vendor.name} (${vendor.vendor_code})`;
                select.appendChild(option);
            });
        });
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error fetching vendors:', error);
        showToast('Error', 'Failed to load vendors: ' + error.message, true);
    }
}

async function fetchVendorBankAccounts(vendorId, targetSelect) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/bank-accounts`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const bankAccounts = await response.json();
        
        // Clear existing options except the first one
        while (targetSelect.options.length > 1) {
            targetSelect.remove(1);
        }
        
        // Add bank account options
        bankAccounts.forEach(account => {
            const option = document.createElement('option');
            option.value = account.id;
            option.textContent = `${account.account_name} - ${account.account_type} (${maskAccountNumber(account.account_number)})`;
            if (account.is_primary) {
                option.textContent += ' (Primary)';
                option.selected = true;
            }
            targetSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error fetching vendor bank accounts:', error);
        showToast('Error', 'Failed to load vendor bank accounts: ' + error.message, true);
    }
}

async function fetchNachaSettings() {
    try {
        console.log('Fetching NACHA settings from API...');
        const response = await fetch(`${API_BASE_URL}/api/nacha-settings`);
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchNachaSettings] /api/nacha-settings endpoint not yet implemented - skipping');
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        nachaSettings = await response.json();
        console.log('NACHA settings fetched successfully:', nachaSettings.length, 'settings');
        renderNachaSettingsTable();
        
        // Populate NACHA settings dropdowns
        const settingsSelects = [
            document.getElementById('nachaSettingsId')
        ];
        
        settingsSelects.forEach(select => {
            if (!select) return;
            
            // Clear existing options except the first one
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Add settings options
            nachaSettings.forEach(setting => {
                const option = document.createElement('option');
                option.value = setting.id;
                option.textContent = `${setting.company_name} (${setting.company_entry_description})`;
                select.appendChild(option);
            });
        });
    } catch (error) {
        console.error('Error fetching NACHA settings:', error);
        showToast('Error', 'Failed to load NACHA settings: ' + error.message, true);
    }
}

async function fetchBatches() {
    try {
        console.log('Fetching payment batches from API...');
        showLoading();
        const statusFilter = document.getElementById('batchStatusFilter')?.value;
        const url = statusFilter ? `${API_BASE_URL}/api/payment-batches?status=${statusFilter}` : `${API_BASE_URL}/api/payment-batches`;
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchBatches] /api/payment-batches endpoint not yet implemented - skipping');
                hideLoading();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const batches = await response.json();
        console.log('Payment batches fetched successfully:', batches.length, 'batches');
        renderBatchesTable(batches);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error fetching payment batches:', error);
        showToast('Error', 'Failed to load payment batches: ' + error.message, true);
    }
}

async function fetchNachaFiles() {
    try {
        console.log('Fetching NACHA files from API...');
        showLoading();
        const response = await fetch(`${API_BASE_URL}/api/nacha-files`);
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchNachaFiles] /api/nacha-files endpoint not yet implemented - skipping');
                hideLoading();
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const files = await response.json();
        console.log('NACHA files fetched successfully:', files.length, 'files');
        renderNachaFilesTable(files);
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error fetching NACHA files:', error);
        showToast('Error', 'Failed to load NACHA files: ' + error.message, true);
    }
}

// Render functions (stubs - these would contain the actual rendering logic)
function renderBatchesTable(batches) {
    console.log('Rendering batches table with', batches.length, 'batches');
    const tableBody = document.getElementById('batchesTableBody');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (!batches || batches.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center">No payment batches found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    // This would contain the full batches table rendering logic

    batches.forEach(batch => {
        const row = document.createElement('tr');

        /* ----------- prepare values with graceful fall-backs ----------- */
        const batchNo    = batch.batch_number ?? '(n/a)';
        const entityName = batch.entity_name ?? '';
        const nachaName  = batch.nacha_company_name ?? '—';
        const batchDate  = formatDate(batch.batch_date);
        const effDate    = formatDate(batch.effective_date);
        const amountFmt  = formatCurrency(parseFloat(batch.total_amount ?? 0));
        const itemsTotal = batch.total_items ?? 0;

        /* status badge */
        const statusCls  = getStatusBadgeClass(batch.status);
        const statusBadge = `<span class="badge ${statusCls} text-capitalize">${(batch.status || '')
                                    .replace('_', ' ')}</span>`;

        /* ----------- build row html ----------- */
        row.innerHTML = `
            <td>${batchNo}</td>
            <td>${entityName}</td>
            <td>${nachaName}</td>
            <td>${batchDate}</td>
            <td>${effDate}</td>
            <td>${statusBadge}</td>
            <td class="text-end">${amountFmt}</td>
            <td class="text-end">${itemsTotal}</td>
        `;

        tableBody.appendChild(row);
    });
}

function renderVendorsTable() {
    console.log('Rendering vendors table with', vendors.length, 'vendors');
    const tableBody = document.getElementById('vendorsTableBody');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (!vendors || vendors.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center">No vendors found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    /* ------------------------------------------------------------------
     * Build table rows
     * ----------------------------------------------------------------*/
    vendors.forEach(vendor => {
        const row = document.createElement('tr');

        const code        = vendor.vendor_code ?? '';
        const name        = vendor.name ?? '';
        const contactName = vendor.contact_name ?? '—';
        const email       = vendor.email ?? '—';
        const phone       = vendor.phone ?? '—';
        const statusCls   = getStatusBadgeClass(vendor.status);
        const statusBadge = `<span class="badge ${statusCls} text-capitalize">${(vendor.status || '')
                                .replace('_', ' ')}</span>`;
        const createdDate = formatDate(vendor.created_at);

        row.innerHTML = `
            <td>${code}</td>
            <td>${name}</td>
            <td>${contactName}</td>
            <td>${email}</td>
            <td>${phone}</td>
            <td>${statusBadge}</td>
            <td>${createdDate}</td>
        `;

        tableBody.appendChild(row);
    });
}

function renderNachaSettingsTable() {
    console.log('Rendering NACHA settings table with', nachaSettings.length, 'settings');
    const tableBody = document.getElementById('nachaSettingsTableBody');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (!nachaSettings || nachaSettings.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center">No NACHA settings found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    /* ------------------------------------------------------------------
     * Build table rows
     * ----------------------------------------------------------------*/
    nachaSettings.forEach(setting => {
        const row = document.createElement('tr');

        /* graceful fall-backs */
        const entityName  = setting.entity_name  ?? '—';
        const companyName = setting.company_name ?? '';
        const companyId   = setting.company_id   ?? '';
        const dfiId       = setting.originating_dfi_id ?? '';
        const entryDesc   = setting.company_entry_description ?? '';
        const prodFlag    = setting.is_production ? 'Yes' : 'No';
        const createdDate = formatDate(setting.created_at);

        row.innerHTML = `
            <td>${entityName}</td>
            <td>${companyName}</td>
            <td>${companyId}</td>
            <td>${dfiId}</td>
            <td>${entryDesc}</td>
            <td class="text-center">${prodFlag}</td>
            <td>${createdDate}</td>
        `;

        tableBody.appendChild(row);
    });
}

function renderNachaFilesTable(files) {
    console.log('Rendering NACHA files table with', files.length, 'files');
    const tableBody = document.getElementById('nachaFilesTableBody');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (!files || files.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center">No NACHA files found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    /* Helper to format file size nicely (bytes → KB/MB) */
    const formatFileSize = bytes => {
        if (!bytes && bytes !== 0) return '—';
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        return `${(kb / 1024).toFixed(2)} MB`;
    };

    /* ------------------------------------------------------------------
     * Build table rows
     * ----------------------------------------------------------------*/
    files.forEach(file => {
        const row = document.createElement('tr');

        const fileName   = file.file_name ?? file.filename ?? '(unnamed)';
        const batchNo    = file.batch_number ?? '—';
        const fileDate   = formatDate(file.file_date ?? file.created_at);
        const totalAmt   = formatCurrency(parseFloat(file.total_amount ?? 0));
        const items      = file.total_items ?? 0;
        const statusCls  = getStatusBadgeClass(file.status);
        const statusBadge = `<span class="badge ${statusCls} text-capitalize">${(file.status || '')
                                  .replace('_', ' ')}</span>`;

        /* If backend supports download via /api/nacha-files/:id/download */
        const downloadLink = file.id
            ? `<a href="${API_BASE_URL}/api/nacha-files/${file.id}/download" class="btn btn-sm btn-outline-primary" title="Download"><i class="fas fa-download"></i></a>`
            : '—';

        row.innerHTML = `
            <td>${fileName}</td>
            <td>${batchNo}</td>
            <td>${fileDate}</td>
            <td class="text-end">${totalAmt}</td>
            <td class="text-end">${items}</td>
            <td>${statusBadge}</td>
            <td class="text-center">${downloadLink}</td>
        `;

        tableBody.appendChild(row);
    });
}

/* ---------------------------------------------------------------------------
 * PAYMENT BATCH CREATION
 * -------------------------------------------------------------------------*/

// Helper: Create payment batch via API
async function createPaymentBatch(batchData) {
    try {
        console.log('[createPaymentBatch] Creating batch …', batchData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/payment-batches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batchData)
        });

        if (!res.ok) {
            // read response body only once
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).message ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const created = await res.json();
        console.log('[createPaymentBatch] Success:', created);
        showToast('Success', 'Payment batch created successfully');

        // Refresh list
        await fetchBatches();

        // Close modal & reset form
        const modalEl = document.getElementById('createBatchModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        document.getElementById('createBatchForm')?.reset();

        return created;
    } catch (err) {
        console.error('[createPaymentBatch] Error:', err);
        showToast('Error', 'Failed to create batch: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Page initialization
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing Vendor Payments page...');
    
    try {
        showLoading();
        
        console.log('📡 Starting API initialization...');
        
        // Initialize core data first (entities are critical)
        await fetchEntities();
        
        // Initialize other data (these may not be implemented yet)
        await fetchFunds();
        await fetchBankAccounts();
        await fetchVendors();
        await fetchNachaSettings();
        await fetchBatches();
        await fetchNachaFiles();
        
        // Setup refresh button event listeners
        const refreshButtons = [
            { id: 'refreshBatchesBtn', handler: fetchBatches },
            { id: 'refreshVendorsBtn', handler: fetchVendors },
            { id: 'refreshSettingsBtn', handler: fetchNachaSettings },
            { id: 'refreshFilesBtn', handler: fetchNachaFiles }
        ];
        
        refreshButtons.forEach(({ id, handler }) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', handler);
                console.log(`✅ Refresh button ${id} event listener added`);
            }
        });

        /* -----------------------------------------------------------
         * Dynamic field loaders & actions
         * ---------------------------------------------------------*/

        // Entity selector in Create-Batch modal → load funds for that entity
        const batchEntitySelect = document.getElementById('batchEntityId');
        if (batchEntitySelect) {
            batchEntitySelect.addEventListener('change', e => {
                const entId = e.target.value;
                if (entId) fetchFunds(entId);
            });
            console.log('✅ Entity-change listener added (fund loader)');
        }

        // Save / Create Batch button handler
        const saveBatchBtn = document.getElementById('saveBatchBtn');
        if (saveBatchBtn) {
            saveBatchBtn.addEventListener('click', async () => {
                const entityId        = document.getElementById('batchEntityId').value;
                const fundId          = document.getElementById('batchFundId').value || null;
                const nachaSettingsId = document.getElementById('nachaSettingsId').value;
                const batchDateInput  = document.getElementById('batchDate').value;
                const effectiveInput  = document.getElementById('effectiveDate').value;
                const description     = document.getElementById('batchDescription').value || '';

                // Validation
                if (!entityId)          return showToast('Validation', 'Please select an entity', true);
                if (!nachaSettingsId)   return showToast('Validation', 'Please select a NACHA configuration', true);
                if (!batchDateInput)    return showToast('Validation', 'Please select a batch date', true);
                if (!effectiveInput)    return showToast('Validation', 'Please select an effective date', true);

                // Build payload
                const batchData = {
                    entity_id: entityId,
                    fund_id: fundId,
                    nacha_settings_id: nachaSettingsId,
                    // API (and DB) expects batch_number (required)
                    batch_number: `BATCH-${Date.now()}`,
                    batch_date: batchDateInput,
                    effective_date: effectiveInput,
                    description,
                    status: 'draft',
                    total_items: 0
                };

                try {
                    await createPaymentBatch(batchData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Create-batch button listener added');
        }

        console.log('✅ Vendor Payments page initialized successfully');
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('❌ Error initializing Vendor Payments page:', error);
        showToast('Error', 'Failed to initialize page: ' + error.message, true);
    }
});
