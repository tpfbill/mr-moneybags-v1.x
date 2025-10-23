// ---------------------------------------------------------------------------
// API Configuration (dynamic)
// ---------------------------------------------------------------------------
// Determine the correct API base URL at runtime.
// • Dev mode: frontend runs on :8080/8081 and should talk to backend on :3000
// • Prod / same-origin: use the current window.location.origin
const devPorts = ['8080', '8081'];
const API_BASE_URL = devPorts.includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin;

// Global variables
let currentVendor = null;
let currentBatch = null;
let currentNachaSettings = null;
let entities = [];
let funds = [];
let bankAccounts = [];
let vendors = [];
let nachaSettings = [];
let currentBatchItems = [];

// Utility functions
// ---------------------------------------------------------------------------
// Admin role flag – updated by fetchCurrentUserRole()
// ---------------------------------------------------------------------------
let isAdminUser = false;

/* ---------------------------------------------------------------------------
 * Filtering helpers (Vendor search)
 * -------------------------------------------------------------------------*/
function getFilteredVendors() {
    const zidInput   = document.getElementById('vendorSearchZid');
    const nameInput  = document.getElementById('vendorSearchName');

    const zidTerm  = (zidInput?.value || '').toString().trim().toLowerCase();
    const nameTerm = (nameInput?.value || '').toString().trim().toLowerCase();

    return vendors.filter(v => {
        // zID match (contains, case-insensitive)
        if (zidTerm) {
            const zidVal = (v.zid || '').toString().toLowerCase();
            if (!zidVal.includes(zidTerm)) return false;
        }
        // Name / Name-detail match (contains, case-insensitive)
        if (nameTerm) {
            const nameVal = ((v.name_detail || '') + ' ' + (v.name || ''))
                .toString()
                .toLowerCase();
            if (!nameVal.includes(nameTerm)) return false;
        }
        return true;
    });
}

/* ---------------------------------------------------------------------------
 * Auth helpers
 * -------------------------------------------------------------------------*/
/**
 * Determine if the current session user is an admin and toggle UI controls.
 * Sets global isAdminUser flag.
 */
async function fetchCurrentUserRole() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/user`, {
            credentials: 'include'
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        isAdminUser =
            data?.authenticated &&
            data?.user &&
            (data.user.role || '').toString().toLowerCase() === 'admin';
    } catch (err) {
        // Treat any failure as non-admin / not authenticated
        console.warn('[RBAC] Failed to fetch user role – assuming non-admin:', err.message);
        isAdminUser = false;
    } finally {
        /* Toggle New-Vendor button */
        const newBtn = document.getElementById('newVendorBtn');
        if (newBtn) {
            newBtn.style.display = isAdminUser ? '' : 'none';
            // ensure green styling
            if (isAdminUser) {
                newBtn.classList.remove('btn-primary');
                if (!newBtn.classList.contains('btn-success')) {
                    newBtn.classList.add('btn-success');
                }
            }
        }
        /* Toggle Delete-Vendor button in edit modal */
        const delBtn = document.getElementById('deleteVendorBtn');
        if (delBtn) {
            delBtn.style.display = isAdminUser ? '' : 'none';
        }
    }
}

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

function confirmDialog(message) {
    return window.confirm(message);
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

function maskTaxId(taxId) {
    if(!taxId) return '';
    const digits = String(taxId).replace(/\D/g,'');
    if(digits.length <= 4) return '*'.repeat(digits.length);
    const last4 = digits.slice(-4);
    return `***-**-${last4}`;
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
        const response = await fetch(`${API_BASE_URL}/api/entities`, {
            credentials: 'include'
        });
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
            document.getElementById('editBatchEntityId'),
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
        const response = await fetch(url, { credentials: 'include' });
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
            document.getElementById('batchFundId'),
            document.getElementById('editBatchFundId')
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
        const response = await fetch(`${API_BASE_URL}/api/bank-accounts`, {
            credentials: 'include'
        });

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
        const response = await fetch(`${API_BASE_URL}/api/vendors`, {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchVendors] /api/vendors endpoint not yet implemented - skipping');
                hideLoading();
                // Ensure badge shows zero if endpoint not present
                {
                    const badge = document.getElementById('vendorsCountBadge');
                    if (badge) badge.textContent = '0';
                }
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        vendors = await response.json();
        console.log('Vendors fetched successfully:', vendors.length, 'vendors');

        // Update count badge
        {
            const badge = document.getElementById('vendorsCountBadge');
            if (badge) badge.textContent = vendors.length;
        }

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
                option.textContent = (vendor.name_detail || vendor.name || '').toString().trim();
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
        const response = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}/bank-accounts`, {
            credentials: 'include'
        });
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
        const response = await fetch(`${API_BASE_URL}/api/nacha-settings`, {
            credentials: 'include'
        });
        if (!response.ok) {
            if (response.status === 404) {
                console.info('[fetchNachaSettings] /api/nacha-settings endpoint not yet implemented - skipping');
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        /* ------------------------------------------------------------------
         * Robust parsing / shape-normalisation
         * ----------------------------------------------------------------*/
        let data;
        try {
            data = await response.json();
        } catch (_) {
            data = [];
        }

        if (Array.isArray(data)) {
            nachaSettings = data;
        } else if (data && Array.isArray(data.rows)) {
            nachaSettings = data.rows;
        } else if (data && Array.isArray(data.data)) {
            nachaSettings = data.data;
        } else {
            nachaSettings = [];
        }

        console.log('NACHA settings fetched successfully:', (nachaSettings?.length || 0), 'settings');
        renderNachaSettingsTable();
        
        // Populate NACHA settings dropdowns
        const settingsSelects = [
            document.getElementById('nachaSettingsId'),
            document.getElementById('editNachaSettingsId')
        ];
        
        settingsSelects.forEach(select => {
            // Guard: make sure select element and its options collection exist
            if (!select || !select.options) return;
            
            // Clear existing options except the first one
            while ((select.options?.length || 0) > 1) {
                select.remove(1);
            }
            
            // Add settings options
            nachaSettings.forEach(setting => {
                const option = document.createElement('option');
                option.value = setting.id;
                option.textContent = setting.company_entry_description
                    ? `${setting.company_name} (${setting.company_entry_description})`
                    : setting.company_name;
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
        const response = await fetch(url, { credentials: 'include' });
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
        const response = await fetch(`${API_BASE_URL}/api/nacha-files`, {
            credentials: 'include'
        });
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

// Render functions
function getBatchesTableBody() {
    let body = document.getElementById('batchesTableBody');
    if (body) return body;
    const table = document.getElementById('batchesTable');
    if (table) {
        if (table.tBodies && table.tBodies.length) return table.tBodies[0];
        const tb = document.createElement('tbody');
        table.appendChild(tb);
        return tb;
    }
    return document.querySelector('#batches table tbody');
}

function renderBatchesTable(batches) {
    console.log('Rendering batches table with', batches?.length || 0, 'batches');
    const tableBody = getBatchesTableBody();
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (!batches || batches.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="7" class="text-center">No payment batches found</td>';
        tableBody.appendChild(row);
        return;
    }
    
    batches.forEach(batch => {
        const row = document.createElement('tr');
        row.dataset.id = batch.id;

        /* ----------- prepare values with graceful fall-backs ----------- */
        const batchNo    = batch.batch_number ?? '(n/a)';
        const batchDate  = formatDate(batch.batch_date);
        const bankName = batch.bank_name ?? '';
        const entityName = batch.entity_name ?? '';
        const amountFmt  = formatCurrency(parseFloat(batch.total_amount ?? 0));
        const itemsTotal = batch.total_items ?? 0;
        const createdBy  = batch.created_by_name || '';

        /* actions buttons */
        const actions = `
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary btn-edit-batch" data-id="${batch.id}" title="Edit Batch">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-outline-danger btn-delete-batch" data-id="${batch.id}" title="Delete Batch">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        /* ----------- build row html ----------- */
        row.innerHTML = `
            <td><a href="#" class="link-batch-items" data-id="${batch.id}" data-batch="${batchNo}">${batchNo}</a></td>
            <td>${batchDate}</td>
            <td>${bankName}</td>
            <td class="text-end">${itemsTotal}</td>
            <td class="text-end">${amountFmt}</td>
            <td>${createdBy}</td>
            <td class="text-center">${actions}</td>
        `;

        tableBody.appendChild(row);
    });

    // Add event listeners to action buttons
    document.querySelectorAll('.btn-edit-batch').forEach(btn => {
        btn.addEventListener('click', () => openEditBatch(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-batch').forEach(btn => {
        btn.addEventListener('click', () => deletePaymentBatch(btn.dataset.id));
    });

    // Batch number link → open items modal
    document.querySelectorAll('.link-batch-items').forEach(a => {
        a.addEventListener('click', (e) => {
            e.preventDefault();
            openBatchItemsModal(a.dataset.id, a.dataset.batch);
        });
    });
}

function renderVendorsTable() {
    const data = getFilteredVendors();
    console.log('Rendering vendors table with', data.length, 'vendors (filtered)');
    const tableBody = document.getElementById('vendorsTableBody');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    if (data.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="21" class="text-center">No vendors found</td>';
        tableBody.appendChild(row);
        // update badge even when empty
        const badge = document.getElementById('vendorsCountBadge');
        if (badge) badge.textContent = '0';
        return;
    }
    
    /* ------------------------------------------------------------------
     * Build table rows
     * ----------------------------------------------------------------*/
    data.forEach(vendor => {
        const row = document.createElement('tr');
        row.dataset.id = vendor.id;

        const statusCls   = getStatusBadgeClass(vendor.status);
        const statusBadge = `<span class="badge ${statusCls} text-capitalize">${(vendor.status || '')
                                .replace('_', ' ')}</span>`;

        /* actions buttons */
        const actions = isAdminUser ? `
            <div class="btn-group btn-group-sm">
                <button class="btn btn-success btn-edit-vendor me-1" data-id="${vendor.id}" title="Edit Vendor">
                    <i class="fas fa-edit me-1"></i> Edit
                </button>
                <button class="btn btn-success btn-delete-vendor" data-id="${vendor.id}" title="Delete Vendor">
                    <i class="fas fa-trash me-1"></i> Delete
                </button>
            </div>
        ` : '';

        row.innerHTML = `
            <td class="sticky-col-1">${vendor.zid || '—'}</td>
            <td class="sticky-col-2">${vendor.name || ''}</td>
            <td>${vendor.name_detail || ''}</td>
            <td>${vendor.account_type || '—'}</td>
            <td>${vendor.vendor_type || '—'}</td>
            <td>${maskTaxId(vendor.tax_id)}</td>
            <td>${vendor.email || '—'}</td>
            <td>${vendor.street_1 || '—'}</td>
            <td>${vendor.street_2 || '—'}</td>
            <td>${vendor.city || '—'}</td>
            <td>${vendor.state || '—'}</td>
            <td>${vendor.zip || '—'}</td>
            <td>${vendor.country || '—'}</td>
            <td>${vendor.subject_to_1099 ? 'Yes' : 'No'}</td>
            <td>${vendor.payment_type || '—'}</td>
            <td>${vendor.bank_account_type || '—'}</td>
            <td>${vendor.bank_routing_number || '—'}</td>
            <td>${maskAccountNumber(vendor.bank_account_number)}</td>
            <td>${formatDate(vendor.last_used)}</td>
            <td>${statusBadge}</td>
            <td class="text-center">${actions}</td>
        `;

        tableBody.appendChild(row);
    });

    // Update count badge with filtered length
    const badge = document.getElementById('vendorsCountBadge');
    if (badge) badge.textContent = data.length;

    // Add event listeners to action buttons
    document.querySelectorAll('.btn-edit-vendor').forEach(btn => {
        btn.addEventListener('click', () => openEditVendor(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-vendor').forEach(btn => {
        btn.addEventListener('click', () => deleteVendor(btn.dataset.id));
    });
}

function renderNachaSettingsTable() {
    console.log('Rendering NACHA settings table with', nachaSettings?.length || 0, 'settings');
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
        row.dataset.id = setting.id;

        /* graceful fall-backs */
        const companyName = setting.company_name ?? '';
        const companyId   = setting.company_id   ?? '';
        const dfiId       = setting.originating_dfi_id ?? '';
        const entryDesc   = setting.company_entry_description ?? '';
        const settlementAccount = setting.settlement_account_name ?? '—';
        const prodFlag    = setting.is_production ? 'Yes' : 'No';

        /* actions buttons */
        const actions = `
            <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary btn-edit-nacha-settings" data-id="${setting.id}" title="Edit Settings">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-outline-danger btn-delete-nacha-settings" data-id="${setting.id}" title="Delete Settings">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        row.innerHTML = `
            <td>${companyName}</td>
            <td>${companyId}</td>
            <td>${dfiId}</td>
            <td>${entryDesc}</td>
            <td>${settlementAccount}</td>
            <td class="text-center">${prodFlag}</td>
            <td class="text-center">${actions}</td>
        `;

        tableBody.appendChild(row);
    });

    // Add event listeners to action buttons
    document.querySelectorAll('.btn-edit-nacha-settings').forEach(btn => {
        btn.addEventListener('click', () => openEditNachaSettings(btn.dataset.id));
    });

    document.querySelectorAll('.btn-delete-nacha-settings').forEach(btn => {
        btn.addEventListener('click', () => deleteNachaSettings(btn.dataset.id));
    });
}

function renderNachaFilesTable(files) {
    console.log('Rendering NACHA files table with', files?.length || 0, 'files');
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
 * VENDOR CRUD OPERATIONS
 * -------------------------------------------------------------------------*/

// Open edit vendor modal
function openEditVendor(vendorId) {
    const vendor = vendors.find(v => v.id == vendorId);
    if (!vendor) {
        showToast('Error', 'Vendor not found', true);
        return;
    }

    currentVendor = vendor;

    // Populate form fields
    document.getElementById('editVendorId').value = vendor.id;
    document.getElementById('editZid').value = vendor.zid || '';
    document.getElementById('editVendorName').value = vendor.name;
    document.getElementById('editContactName').value = vendor.contact_name || '';
    document.getElementById('editVendorEmail').value = vendor.email || '';
    document.getElementById('editVendorStatus').value = vendor.status || 'active';
    document.getElementById('editVendorNotes').value = vendor.notes || '';

    // Populate extended fields
    document.getElementById('editNameDetail').value        = vendor.name_detail || '';
    document.getElementById('editTaxId').value             = vendor.tax_id || '';
    document.getElementById('editVendorType').value        = vendor.vendor_type || '';
    document.getElementById('editStreet1').value           = vendor.street_1 || '';
    document.getElementById('editStreet2').value           = vendor.street_2 || '';
    document.getElementById('editCity').value              = vendor.city || '';
    document.getElementById('editState').value             = vendor.state || '';
    document.getElementById('editZip').value               = vendor.zip || '';
    document.getElementById('editCountry').value           = vendor.country || 'USA';
    document.getElementById('editSubjectTo1099').value     = vendor.subject_to_1099 ? 'true' : 'false';
    document.getElementById('editBankAccountType').value   = vendor.bank_account_type || '';
    document.getElementById('editBankRoutingNumber').value = vendor.bank_routing_number || '';
    document.getElementById('editBankAccountNumber').value = vendor.bank_account_number || '';
    // New enum fields
    document.getElementById('editAccountType').value       = vendor.account_type || 'Individual';
    document.getElementById('editPaymentType').value       = vendor.payment_type || 'EFT';

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('editVendorModal'));
    modal.show();
}

// Create vendor
async function createVendor(vendorData) {
    try {
        console.log('[createVendor] Creating vendor…', vendorData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/vendors`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(vendorData)
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const created = await res.json();
        console.log('[createVendor] Success:', created);
        showToast('Success', 'Vendor created successfully');

        // Refresh list
        await fetchVendors();

        // Close modal & reset form
        const modalEl = document.getElementById('createVendorModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        document.getElementById('createVendorForm')?.reset();

        return created;
    } catch (err) {
        console.error('[createVendor] Error:', err);
        showToast('Error', 'Failed to create vendor: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Update vendor
async function updateVendor(vendorId, vendorData) {
    try {
        console.log('[updateVendor] Updating vendor…', vendorId, vendorData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(vendorData)
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const updated = await res.json();
        console.log('[updateVendor] Success:', updated);
        showToast('Success', 'Vendor updated successfully');

        // Refresh list
        await fetchVendors();

        // Close modal
        const modalEl = document.getElementById('editVendorModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        return updated;
    } catch (err) {
        console.error('[updateVendor] Error:', err);
        showToast('Error', 'Failed to update vendor: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Delete vendor
async function deleteVendor(vendorId) {
    if (!confirmDialog('Are you sure you want to delete this vendor? This action cannot be undone.')) {
        return;
    }

    try {
        console.log('[deleteVendor] Deleting vendor…', vendorId);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/vendors/${vendorId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        console.log('[deleteVendor] Success');
        showToast('Success', 'Vendor deleted successfully');

        // Refresh list
        await fetchVendors();

        // Close modal if open
        const modalEl = document.getElementById('editVendorModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch (err) {
        console.error('[deleteVendor] Error:', err);
        showToast('Error', 'Failed to delete vendor: ' + err.message, true);
    } finally {
        hideLoading();
    }
}

/* ---------------------------------------------------------------------------
 * VENDOR CSV IMPORT
 * -------------------------------------------------------------------------*/

/**
 * Upload a CSV file and import vendors via /api/vendors/import
 * @param {File} file
 */
async function importVendorsFromCsv(file) {
    if (!file) {
        showToast('Validation', 'Please select a CSV file first', true);
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        console.log('[importVendors] Uploading CSV…', file.name, file.size, 'bytes');
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/vendors/import`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const result = await res.json();
        console.log('[importVendors] Result:', result);
        if (Array.isArray(result?.sampleErrors) && result.sampleErrors.length) {
            console.warn('[importVendors] sampleErrors:', result.sampleErrors);
        }
        showToast(
            'Import complete',
            `Inserted ${result.inserted}, Updated ${result.updated}, Failed ${result.failed}`
        );

        // Refresh vendor list
        await fetchVendors();
    } catch (err) {
        console.error('[importVendors] Error:', err);
        showToast('Error', 'Vendor import failed: ' + err.message, true);
    } finally {
        hideLoading();
    }
}

/* ---------------------------------------------------------------------------
 * PAYMENTS CSV IMPORT (one-click)
 * -------------------------------------------------------------------------*/

function papaParseCsvFile(file) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.Papa && Papa.parse) {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    transformHeader: header => header.trim(),
                    complete: results => resolve(results.data || []),
                    error: err => reject(err)
                });
                return;
            }
        } catch (_) { /* fall through to manual parse */ }

        // Fallback: naive CSV parsing (no quoted-commas support)
        try {
            const text = await file.text();
            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
            if (!lines.length) return resolve([]);
            const headers = lines.shift().split(',').map(h => h.replace(/^['"]+|['"]+$/g, '').trim());
            const rows = lines.map(line => {
                const cols = line.split(',');
                const obj = {};
                headers.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i] : ''; });
                return obj;
            });
            resolve(rows);
        } catch (err) {
            reject(err);
        }
    });
}

async function importPaymentsCsvOneClick(file) {
    if (!file) {
        showToast('Validation', 'Please choose a Payments CSV file first', true);
        return;
    }

    // 1) Analyze to get suggested mapping
    const formData = new FormData();
    formData.append('file', file);

    try {
        showLoading();
        console.log('[payments-import] Analyzing CSV…', file.name);
        const analyzeRes = await fetch(`${API_BASE_URL}/api/vendor-payments/import/analyze`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        if (!analyzeRes.ok) {
            let serverMsg = '';
            try {
                const ct = analyzeRes.headers.get('content-type') || '';
                serverMsg = ct.includes('application/json') ? (await analyzeRes.json()).error ?? '' : await analyzeRes.text();
            } catch (_) { /* ignore */ }
            throw new Error(`Analyze failed – HTTP ${analyzeRes.status}${serverMsg ? ' – ' + serverMsg : ''}`);
        }
        const analyze = await analyzeRes.json();
        const mapping = analyze?.suggestedMapping || {};
        console.log('[payments-import] Suggested mapping:', mapping);

        // 2) Parse CSV client-side
        const rows = await papaParseCsvFile(file);
        if (!rows.length) {
            showToast('Validation', 'CSV file appears empty', true);
            return;
        }
        console.log('[payments-import] Parsed rows:', rows.length);

        // 3) Kick off processing job
        const payload = { data: rows, mapping, filename: file.name };
        const procRes = await fetch(`${API_BASE_URL}/api/vendor-payments/import/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        if (!procRes.ok) {
            let serverMsg = '';
            try {
                const ct = procRes.headers.get('content-type') || '';
                serverMsg = ct.includes('application/json') ? (await procRes.json()).error ?? '' : await procRes.text();
            } catch (_) { /* ignore */ }
            throw new Error(`Process start failed – HTTP ${procRes.status}${serverMsg ? ' – ' + serverMsg : ''}`);
        }
        const { id } = await procRes.json();
        if (!id) throw new Error('Missing job id from process response');
        showToast('Import started', 'Processing payments in the background…');

        // 4) Poll status until done
        const job = await pollPaymentsImportStatus(id);
        if (job.status === 'completed') {
            const createdBatches = job.createdBatches?.length || 0;
            const createdItems = job.createdItems || 0;
            const createdJEs = job.createdJEs?.length || 0;
            showToast('Import complete', `Batches: ${createdBatches}, Items: ${createdItems}, JEs: ${createdJEs}`);
            // Refresh UI
            await fetchBatches();
            await fetchNachaFiles();
            await loadLastPaymentsImportLog();
        } else if (job.status === 'failed') {
            const msg = (job.errors && job.errors[0]) || 'Unknown error';
            showToast('Import failed', String(msg), true);
            await loadLastPaymentsImportLog();
        } else {
            showToast('Import', `Unexpected status: ${job.status}`, true);
        }
    } catch (err) {
        console.error('[payments-import] Error:', err);
        showToast('Error', err.message || String(err), true);
        throw err;
    } finally {
        hideLoading();
    }
}

async function pollPaymentsImportStatus(jobId, opts = {}) {
    const intervalMs = opts.intervalMs ?? 1000;
    const timeoutMs = opts.timeoutMs ?? 120000; // 2 minutes
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const res = await fetch(`${API_BASE_URL}/api/vendor-payments/import/status/${jobId}`, {
            credentials: 'include'
        });
        if (!res.ok) {
            throw new Error(`Status check failed – HTTP ${res.status}`);
        }
        const job = await res.json();
        if (['completed', 'failed'].includes(job.status)) return job;
        await new Promise(r => setTimeout(r, intervalMs));
    }
    throw new Error('Import timed out');
}

// Load the most recent Payments import log
async function loadLastPaymentsImportLog() {
    try {
        const tableBody = document.querySelector('#paymentsImportLogTable tbody');
        if (!tableBody) return;
        const res = await fetch(`${API_BASE_URL}/api/vendor-payments/import/last`, { credentials: 'include' });
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : { error: await res.text() };
        if (!res.ok) throw new Error(data?.error || `Failed to load import log (${res.status})`);

        const rows = Array.isArray(data?.log) ? data.log : [];
        if (!rows.length) {
            tableBody.innerHTML = `<tr><td colspan="3" class="text-center">No recent import log</td></tr>`;
            return;
        }
        tableBody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.i ?? ''}</td>
                <td>${r.level || ''}</td>
                <td>${r.msg || ''}</td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('[payments-import] loadLastPaymentsImportLog failed:', e);
    }
}

/* ---------------------------------------------------------------------------
 * NACHA SETTINGS CRUD OPERATIONS
 * -------------------------------------------------------------------------*/

// Open edit NACHA settings modal
function openEditNachaSettings(settingsId) {
    const settings = nachaSettings.find(s => s.id == settingsId);
    if (!settings) {
        showToast('Error', 'NACHA settings not found', true);
        return;
    }

    currentNachaSettings = settings;

    // Populate form fields
    document.getElementById('editNachaSettingsId').value = settings.id;
    document.getElementById('editSettingsEntityId').value = settings.entity_id;
    document.getElementById('editSettlementAccountId').value = settings.settlement_account_id || '';
    document.getElementById('editCompanyName').value = settings.company_name;
    document.getElementById('editCompanyId').value = settings.company_id;
    document.getElementById('editOriginatingDfiId').value = settings.originating_dfi_id;
    document.getElementById('editCompanyEntryDescription').value = settings.company_entry_description || '';
    document.getElementById('editIsProduction').checked = settings.is_production || false;

    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('editNachaSettingsModal'));
    modal.show();
}

// Create NACHA settings
async function createNachaSettings(settingsData) {
    try {
        console.log('[createNachaSettings] Creating NACHA settings…', settingsData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/nacha-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(settingsData)
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const created = await res.json();
        console.log('[createNachaSettings] Success:', created);
        showToast('Success', 'NACHA settings created successfully');

        // Refresh list
        await fetchNachaSettings();

        // Close modal & reset form
        const modalEl = document.getElementById('createNachaSettingsModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
        document.getElementById('createNachaSettingsForm')?.reset();

        return created;
    } catch (err) {
        console.error('[createNachaSettings] Error:', err);
        showToast('Error', 'Failed to create NACHA settings: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Update NACHA settings
async function updateNachaSettings(settingsId, settingsData) {
    try {
        console.log('[updateNachaSettings] Updating NACHA settings…', settingsId, settingsData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/nacha-settings/${settingsId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(settingsData)
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const updated = await res.json();
        console.log('[updateNachaSettings] Success:', updated);
        showToast('Success', 'NACHA settings updated successfully');

        // Refresh list
        await fetchNachaSettings();

        // Close modal
        const modalEl = document.getElementById('editNachaSettingsModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        return updated;
    } catch (err) {
        console.error('[updateNachaSettings] Error:', err);
        showToast('Error', 'Failed to update NACHA settings: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Delete NACHA settings
async function deleteNachaSettings(settingsId) {
    if (!confirmDialog('Are you sure you want to delete these NACHA settings? This action cannot be undone.')) {
        return;
    }

    try {
        console.log('[deleteNachaSettings] Deleting NACHA settings…', settingsId);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/nacha-settings/${settingsId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        console.log('[deleteNachaSettings] Success');
        showToast('Success', 'NACHA settings deleted successfully');

        // Refresh list
        await fetchNachaSettings();

        // Close modal if open
        const modalEl = document.getElementById('editNachaSettingsModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch (err) {
        console.error('[deleteNachaSettings] Error:', err);
        showToast('Error', 'Failed to delete NACHA settings: ' + err.message, true);
    } finally {
        hideLoading();
    }
}

/* ---------------------------------------------------------------------------
 * PAYMENT BATCH CRUD OPERATIONS
 * -------------------------------------------------------------------------*/

// Helper: Create payment batch via API
async function createPaymentBatch(batchData) {
    try {
        console.log('[createPaymentBatch] Creating batch …', batchData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/payment-batches`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
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

// Open edit batch modal
async function openEditBatch(batchId) {
    try {
        console.log('[openEditBatch] Fetching batch details…', batchId);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/payment-batches/${batchId}`, {
            credentials: 'include'
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }

        const batch = await res.json();
        console.log('[openEditBatch] Success:', batch);
        
        currentBatch = batch;

        // Populate form fields
        document.getElementById('editBatchId').value = batch.id;
        document.getElementById('editBatchNumber').value = batch.batch_number || '';
        document.getElementById('editBatchEntityId').value = batch.entity_id || '';
        document.getElementById('editBatchFundId').value = batch.fund_id || '';
        document.getElementById('editNachaSettingsId').value = batch.nacha_settings_id || '';
        
        // Format dates for input[type=date]
        if (batch.batch_date) {
            const batchDate = new Date(batch.batch_date);
            document.getElementById('editBatchDate').value = batchDate.toISOString().split('T')[0];
        }
        
        if (batch.effective_date) {
            const effectiveDate = new Date(batch.effective_date);
            document.getElementById('editEffectiveDate').value = effectiveDate.toISOString().split('T')[0];
        }
        
        document.getElementById('editBatchDescription').value = batch.description || '';

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('editBatchModal'));
        modal.show();
        
        hideLoading();
    } catch (err) {
        hideLoading();
        console.error('[openEditBatch] Error:', err);
        showToast('Error', 'Failed to load batch details: ' + err.message, true);
    }
}

// Update payment batch
async function updatePaymentBatch(batchId, batchData) {
    try {
        console.log('[updatePaymentBatch] Updating batch…', batchId, batchData);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/payment-batches/${batchId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(batchData)
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        const updated = await res.json();
        console.log('[updatePaymentBatch] Success:', updated);
        showToast('Success', 'Payment batch updated successfully');

        // Refresh list
        await fetchBatches();

        // Close modal
        const modalEl = document.getElementById('editBatchModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();

        return updated;
    } catch (err) {
        console.error('[updatePaymentBatch] Error:', err);
        showToast('Error', 'Failed to update batch: ' + err.message, true);
        throw err;
    } finally {
        hideLoading();
    }
}

// Delete payment batch
async function deletePaymentBatch(batchId) {
    if (!confirmDialog('Are you sure you want to delete this payment batch? This action cannot be undone.')) {
        return;
    }

    try {
        console.log('[deletePaymentBatch] Deleting batch…', batchId);
        showLoading();

        const res = await fetch(`${API_BASE_URL}/api/payment-batches/${batchId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!res.ok) {
            let serverMsg = '';
            try {
                const ctype = res.headers.get('content-type') || '';
                serverMsg = ctype.includes('application/json')
                    ? (await res.json()).error ?? ''
                    : await res.text();
            } catch (_) { /* ignore body read errors */ }
            throw new Error(`HTTP ${res.status}: ${res.statusText}${serverMsg ? ' – ' + serverMsg : ''}`);
        }

        console.log('[deletePaymentBatch] Success');
        showToast('Success', 'Payment batch deleted successfully');

        // Refresh list
        await fetchBatches();

        // Close modal if open
        const modalEl = document.getElementById('editBatchModal');
        if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
    } catch (err) {
        console.error('[deletePaymentBatch] Error:', err);
        showToast('Error', 'Failed to delete batch: ' + err.message, true);
    } finally {
        hideLoading();
    }
}

// Helpers for Batch Items modal
function normalizePaymentType(val) {
    const s = (val || '').toString().toLowerCase();
    if (s.includes('autodraft') || s.includes('ach')) return 'autodraft';
    if (s.includes('eft')) return 'eft';
    if (s.includes('check')) return 'check';
    if (s.includes('online')) return 'online';
    if (s.includes('paypal')) return 'paypal';
    return s || '';
}

function renderBatchItemsRows(items) {
    return items.map(item => {
        const id        = item.id;
        const reference = item.reference || item.invoice_number || '—';
        const vendor    = item.vendor_name || '—';
        const desc      = item.description || '';
        const amt       = formatCurrency(parseFloat(item.amount ?? 0));
        const postDate  = item.post_date ? formatDate(item.post_date) : (item.invoice_date ? formatDate(item.invoice_date) : '');
        const acctNo    = item.account_number || '—';
        const bankName  = item.bank_name || '—';
        const payType   = item.payment_type || '—';
        const status    = (item.status || '').toString();
        const badge     = `<span class="badge ${getStatusBadgeClass(status.toLowerCase())} text-capitalize">${status.replace('_',' ')}</span>`;
        return `
            <tr>
                <td><input type="checkbox" class="form-check-input item-select" data-id="${id}"></td>
                <td>${reference}</td>
                <td>${vendor}</td>
                <td>${desc}</td>
                <td class="text-end">${amt}</td>
                <td>${postDate}</td>
                <td>${acctNo}</td>
                <td>${bankName}</td>
                <td>${payType}</td>
                <td>${badge}</td>
            </tr>
        `;
    }).join('');
}

function applyBatchItemsFilter() {
    const tbody = document.getElementById('batchItemsTableBody');
    if (!tbody) return;
    const sel = document.getElementById('batchItemsTypeFilter');
    const val = (sel && sel.value) || '';
    const filtered = !val
        ? currentBatchItems
        : currentBatchItems.filter(it => normalizePaymentType(it.payment_type) === val);
    if (!filtered.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No items</td></tr>';
        // reset header state when nothing to show
        const hdr = document.getElementById('selectAllItemsCheckbox');
        if (hdr) { hdr.checked = false; hdr.indeterminate = false; }
        return;
    }
    tbody.innerHTML = renderBatchItemsRows(filtered);
    // If header is checked, keep new rows selected
    const hdr = document.getElementById('selectAllItemsCheckbox');
    const rowCbs = tbody.querySelectorAll('.item-select');
    if (hdr && hdr.checked) {
        rowCbs.forEach(cb => { cb.checked = true; });
    }
    // Wire change handlers to keep header state in sync
    rowCbs.forEach(cb => cb.addEventListener('change', updateSelectAllState));
    updateSelectAllState();
}

function updateSelectAllState() {
    const tbody = document.getElementById('batchItemsTableBody');
    const hdr = document.getElementById('selectAllItemsCheckbox');
    if (!tbody || !hdr) return;
    const cbs = tbody.querySelectorAll('.item-select');
    if (!cbs.length) { hdr.checked = false; hdr.indeterminate = false; return; }
    let checked = 0;
    cbs.forEach(cb => { if (cb.checked) checked++; });
    hdr.checked = checked === cbs.length;
    hdr.indeterminate = checked > 0 && checked < cbs.length;
}

// Open modal listing items for a batch
async function openBatchItemsModal(batchId, batchNumber) {
    try {
        // Set title and show modal immediately with loading row
        const titleEl = document.getElementById('batchItemsTitle');
        if (titleEl) titleEl.textContent = batchNumber ? `#${batchNumber}` : '';

        const tbody = document.getElementById('batchItemsTableBody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Loading…</td></tr>';

        const modalEl = document.getElementById('batchItemsModal');
        if (modalEl) {
            // Reuse the same Bootstrap Modal instance; avoid re-show while already open
            let modalInstance = bootstrap.Modal.getInstance(modalEl);
            if (!modalInstance) modalInstance = new bootstrap.Modal(modalEl);
            if (!modalEl.classList.contains('show')) modalInstance.show();
        }

        // Fetch items
        const res = await fetch(`${API_BASE_URL}/api/payment-batches/${batchId}/items`, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const items = await res.json();
        // Store for filtering and render via filter helper
        currentBatchItems = Array.isArray(items) ? items : [];
        if (typeof applyBatchItemsFilter === 'function') {
            if (!tbody) return;
            if (!currentBatchItems.length) {
                tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No items</td></tr>';
                return;
            }
            applyBatchItemsFilter();
            return;
        }

        if (!tbody) return;
        if (!Array.isArray(items) || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No items</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(item => {
            const id        = item.id;
            const reference = item.reference || item.invoice_number || '—';
            const vendor    = item.vendor_name || '—';
            const desc      = item.description || '';
            const amt       = formatCurrency(parseFloat(item.amount ?? 0));
            const postDate  = item.post_date ? formatDate(item.post_date) : (item.invoice_date ? formatDate(item.invoice_date) : '');
            const acctNo    = item.account_number || '—';
            const bankName  = item.bank_name || '—';
            const payType   = item.payment_type || '—';
            const status    = (item.status || '').toString();
            const badge     = `<span class="badge ${getStatusBadgeClass(status.toLowerCase())} text-capitalize">${status.replace('_',' ')}</span>`;
            return `
                <tr>
                    <td><input type="checkbox" class="form-check-input item-select" data-id="${id}"></td>
                    <td>${reference}</td>
                    <td>${vendor}</td>
                    <td>${desc}</td>
                    <td class="text-end">${amt}</td>
                    <td>${postDate}</td>
                    <td>${acctNo}</td>
                    <td>${bankName}</td>
                    <td>${payType}</td>
                    <td>${badge}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('[openBatchItemsModal] Error:', err);
        showToast('Error', 'Failed to load batch items: ' + err.message, true);
    }
}

// Page initialization
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Initializing Vendor Payments page...');
    
    try {
        showLoading();
        
        // Check if user is admin
        await fetchCurrentUserRole();
        
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
        await loadLastPaymentsImportLog();
        
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

        // Batch items modal controls
        const typeFilter = document.getElementById('batchItemsTypeFilter');
        if (typeFilter) {
            typeFilter.addEventListener('change', applyBatchItemsFilter);
        }

        const paySelectedBtn = document.getElementById('paySelectedItemsBtn');
        if (paySelectedBtn) {
            paySelectedBtn.addEventListener('click', () => {
                const checked = Array.from(document.querySelectorAll('#batchItemsTableBody .item-select:checked'));
                if (checked.length === 0) {
                    showToast('Validation', 'Please select at least one item to pay', true);
                    return;
                }
                const ids = checked.map(cb => cb.getAttribute('data-id'));
                console.log('[Pay Selected Items] IDs:', ids);
                (async () => {
                    try {
                        showLoading();
                        const res = await fetch(`${API_BASE_URL}/api/vendor-payments/pay`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ payment_item_ids: ids })
                        });
                        const ct = res.headers.get('content-type') || '';
                        const data = ct.includes('application/json') ? await res.json() : { error: await res.text() };
                        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

                        const okCount = Array.isArray(data?.results) ? data.results.filter(r => r.ok).length : 0;
                        const failCount = Array.isArray(data?.results) ? data.results.length - okCount : 0;
                        showToast('Payment', `Processed: ${okCount} OK, ${failCount} Failed`);

                        // Refresh batches and reopen modal contents to reflect Paid status
                        await fetchBatches();
                        // If a modal is open, reload its items
                        const openModal = document.getElementById('batchItemsModal');
                        if (openModal && openModal.classList.contains('show')) {
                            const batchLink = document.querySelector('.link-batch-items');
                            // Prefer re-fetch by current title if available
                            if (currentBatch && currentBatch.id) {
                                await openBatchItemsModal(currentBatch.id, currentBatch.batch_number || '');
                            } else if (batchLink) {
                                await openBatchItemsModal(batchLink.dataset.id, batchLink.dataset.batch);
                            }
                        }
                    } catch (err) {
                        console.error('[Pay Selected Items] Error:', err);
                        showToast('Error', `Payment failed: ${err.message || err}`, true);
                    } finally {
                        hideLoading();
                    }
                })();
            });
        }

        // Select-all header checkbox
        const selectAll = document.getElementById('selectAllItemsCheckbox');
        if (selectAll) {
            selectAll.addEventListener('change', () => {
                const tbody = document.getElementById('batchItemsTableBody');
                if (!tbody) return;
                const cbs = tbody.querySelectorAll('.item-select');
                cbs.forEach(cb => { cb.checked = selectAll.checked; });
                updateSelectAllState();
            });
        }

        // Global safety: when any modal hides, ensure overlays/backdrops are cleared
        document.addEventListener('hidden.bs.modal', () => {
            try { hideLoading(); } catch (_) {}
            // Remove any lingering backdrops and body modal-open state
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        });

        /* -----------------------------------------------------------
         * Payments CSV Import button (one-click)
         * ---------------------------------------------------------*/
        const importPaymentsBtn = document.getElementById('importPaymentsBtn');
        const paymentsFileInput = document.getElementById('paymentsCsvFile');
        if (importPaymentsBtn && paymentsFileInput) {
            importPaymentsBtn.addEventListener('click', async () => {
                const file = paymentsFileInput.files && paymentsFileInput.files[0];
                if (!file) {
                    showToast('Validation', 'Please choose a Payments CSV file', true);
                    return;
                }
                try {
                    await importPaymentsCsvOneClick(file);
                } finally {
                    paymentsFileInput.value = '';
                }
            });
            console.log('✅ Payments CSV import button listener added');
        }

        /* -----------------------------------------------------------
         * Vendor CSV Import button
         * ---------------------------------------------------------*/
        const importBtn  = document.getElementById('importVendorsBtn');
        const fileInput  = document.getElementById('vendorCsvFile');
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', async () => {
                const file = fileInput.files && fileInput.files[0];
                if (!file) {
                    showToast('Validation', 'Please choose a CSV file to import', true);
                    return;
                }
                try {
                    await importVendorsFromCsv(file);
                } finally {
                    // clear selection so the same file can be chosen again if needed
                    fileInput.value = '';
                }
            });
            console.log('✅ Import-vendors CSV button listener added');
        }

        /* -----------------------------------------------------------
         * Vendor CSV Export button
         * ---------------------------------------------------------*/
        const exportBtn = document.getElementById('exportVendorsBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', async () => {
                try {
                    showLoading();
                    const response = await fetch(`${API_BASE_URL}/api/vendors/export`, {
                        credentials: 'include'
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'vendors-export.csv';
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                } catch (error) {
                    console.error('Error exporting vendors:', error);
                    showToast('Error', 'Failed to export vendors: ' + error.message, true);
                } finally {
                    hideLoading();
                }
            });
            console.log('✅ Export-vendors CSV button listener added');
        }

        // Vendor search inputs (zID / Name)
        {
          const searchZidInput  = document.getElementById('vendorSearchZid');
          const searchNameInput = document.getElementById('vendorSearchName');
          const clearBtn        = document.getElementById('clearVendorSearchBtn');
          const reRender = () => renderVendorsTable();
          if (searchZidInput)  searchZidInput.addEventListener('input', reRender);
          if (searchNameInput) searchNameInput.addEventListener('input', reRender);
          if (clearBtn) clearBtn.addEventListener('click', () => {
            if (searchZidInput)  searchZidInput.value  = '';
            if (searchNameInput) searchNameInput.value = '';
            renderVendorsTable();
          });
          console.log('✅ Vendor search inputs wired up');
        }

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

        // Vendor form submission handlers
        const createVendorForm = document.getElementById('createVendorForm');
        if (createVendorForm) {
            createVendorForm.addEventListener('submit', async (e) => {
                e.preventDefault();

                const zid = document.getElementById('zid').value.trim();
                const name = document.getElementById('vendorName').value;
                const accountType = document.getElementById('accountType').value;
                const paymentType = document.getElementById('paymentType').value;
                const contactName = document.getElementById('contactName').value;
                const email = document.getElementById('vendorEmail').value;
                const status = document.getElementById('vendorStatus').value;
                const notes = document.getElementById('vendorNotes').value;
                
                /* extended fields */
                const nameDetail        = document.getElementById('nameDetail').value;
                const taxId             = document.getElementById('taxId').value;
                const vendorType        = document.getElementById('vendorType').value;
                const street1           = document.getElementById('street1').value;
                const street2           = document.getElementById('street2').value;
                const city              = document.getElementById('city').value;
                const state             = document.getElementById('state').value;
                const zip               = document.getElementById('zip').value;
                const country           = document.getElementById('country').value;
                const subjectTo1099     = document.getElementById('subjectTo1099').value === 'true';
                const bankAccountType   = document.getElementById('bankAccountType').value;
                const bankRoutingNumber = document.getElementById('bankRoutingNumber').value;
                const bankAccountNumber = document.getElementById('bankAccountNumber').value;

                // Validation
                if (!zid) return showToast('Validation', 'Please enter a zID', true);
                if (!name) return showToast('Validation', 'Please enter a vendor name', true);
                if (!accountType) return showToast('Validation', 'Please select an account type', true);
                if (!paymentType) return showToast('Validation', 'Please select a payment type', true);
                
                const vendorData = {
                    zid,
                    name,
                    contact_name: contactName,
                    email,
                    status,
                    notes,
                    /* new fields */
                    name_detail: nameDetail,
                    tax_id: taxId,
                    vendor_type: vendorType,
                    street_1: street1,
                    street_2: street2,
                    city,
                    state,
                    zip,
                    country,
                    subject_to_1099: subjectTo1099,
                    bank_account_type: bankAccountType,
                    bank_routing_number: bankRoutingNumber,
                    bank_account_number: bankAccountNumber,
                    account_type: accountType,
                    payment_type: paymentType
                };
                
                try {
                    await createVendor(vendorData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Create-vendor form submission handler added');
        }
        
        const editVendorForm = document.getElementById('editVendorForm');
        if (editVendorForm) {
            editVendorForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const vendorId = document.getElementById('editVendorId').value;
                const zid = document.getElementById('editZid').value.trim();
                const name = document.getElementById('editVendorName').value;
                const accountType = document.getElementById('editAccountType').value;
                const paymentType = document.getElementById('editPaymentType').value;
                const contactName = document.getElementById('editContactName').value;
                const email = document.getElementById('editVendorEmail').value;
                const status = document.getElementById('editVendorStatus').value;
                const notes = document.getElementById('editVendorNotes').value;
                /* extended fields */
                const nameDetail = document.getElementById('editNameDetail').value;
                const taxId = document.getElementById('editTaxId').value;
                const vendorType = document.getElementById('editVendorType').value;
                const street1 = document.getElementById('editStreet1').value;
                const street2 = document.getElementById('editStreet2').value;
                const city = document.getElementById('editCity').value;
                const state = document.getElementById('editState').value;
                const zip = document.getElementById('editZip').value;
                const country = document.getElementById('editCountry').value;
                const subjectTo1099 = document.getElementById('editSubjectTo1099').value === 'true';
                const bankAccountType = document.getElementById('editBankAccountType').value;
                const bankRoutingNumber = document.getElementById('editBankRoutingNumber').value;
                const bankAccountNumber = document.getElementById('editBankAccountNumber').value;
                
                // Validation
                if (!vendorId) return showToast('Validation', 'Vendor ID is missing', true);
                if (!zid) return showToast('Validation', 'Please enter a zID', true);
                if (!name) return showToast('Validation', 'Please enter a vendor name', true);
                if (!accountType) return showToast('Validation', 'Please select an account type', true);
                if (!paymentType) return showToast('Validation', 'Please select a payment type', true);
                
                const vendorData = {
                    zid,
                    name,
                    contact_name: contactName,
                    email,
                    status,
                    notes,
                    /* new fields */
                    name_detail: nameDetail,
                    tax_id: taxId,
                    vendor_type: vendorType,
                    street_1: street1,
                    street_2: street2,
                    city,
                    state,
                    zip,
                    country,
                    subject_to_1099: subjectTo1099,
                    bank_account_type: bankAccountType,
                    bank_routing_number: bankRoutingNumber,
                    bank_account_number: bankAccountNumber,
                    account_type: accountType,
                    payment_type: paymentType
                };
                
                try {
                    await updateVendor(vendorId, vendorData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Edit-vendor form submission handler added');
        }
        
        // Delete vendor button handler
        const deleteVendorBtn = document.getElementById('deleteVendorBtn');
        if (deleteVendorBtn) {
            deleteVendorBtn.addEventListener('click', () => {
                const vendorId = document.getElementById('editVendorId').value;
                if (vendorId) {
                    deleteVendor(vendorId);
                }
            });
            console.log('✅ Delete-vendor button handler added');
        }
        
        // NACHA Settings form submission handlers
        const createNachaSettingsForm = document.getElementById('createNachaSettingsForm');
        if (createNachaSettingsForm) {
            createNachaSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const entityId = document.getElementById('settingsEntityId').value;
                const settlementAccountId = document.getElementById('settlementAccountId').value;
                const companyName = document.getElementById('companyName').value;
                const companyId = document.getElementById('companyId').value;
                const originatingDfiId = document.getElementById('originatingDfiId').value;
                const companyEntryDescription = document.getElementById('companyEntryDescription').value;
                const isProduction = document.getElementById('isProduction').checked;
                
                // Validation
                if (!entityId) return showToast('Validation', 'Please select an entity', true);
                if (!companyName) return showToast('Validation', 'Please enter a company name', true);
                if (!companyId) return showToast('Validation', 'Please enter a company ID', true);
                if (!originatingDfiId) return showToast('Validation', 'Please enter an originating DFI ID', true);
                
                const settingsData = {
                    entity_id: entityId,
                    settlement_account_id: settlementAccountId,
                    company_name: companyName,
                    company_id: companyId,
                    originating_dfi_id: originatingDfiId,
                    company_entry_description: companyEntryDescription || 'PAYMENT',
                    is_production: isProduction
                };
                
                try {
                    await createNachaSettings(settingsData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Create-NACHA-settings form submission handler added');
        }
        
        const editNachaSettingsForm = document.getElementById('editNachaSettingsForm');
        if (editNachaSettingsForm) {
            editNachaSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const settingsId = document.getElementById('editNachaSettingsId').value;
                const entityId = document.getElementById('editSettingsEntityId').value;
                const settlementAccountId = document.getElementById('editSettlementAccountId').value;
                const companyName = document.getElementById('editCompanyName').value;
                const companyId = document.getElementById('editCompanyId').value;
                const originatingDfiId = document.getElementById('editOriginatingDfiId').value;
                const companyEntryDescription = document.getElementById('editCompanyEntryDescription').value;
                const isProduction = document.getElementById('editIsProduction').checked;
                
                // Validation
                if (!settingsId) return showToast('Validation', 'Settings ID is missing', true);
                if (!entityId) return showToast('Validation', 'Please select an entity', true);
                if (!companyName) return showToast('Validation', 'Please enter a company name', true);
                if (!companyId) return showToast('Validation', 'Please enter a company ID', true);
                if (!originatingDfiId) return showToast('Validation', 'Please enter an originating DFI ID', true);
                
                const settingsData = {
                    entity_id: entityId,
                    settlement_account_id: settlementAccountId,
                    company_name: companyName,
                    company_id: companyId,
                    originating_dfi_id: originatingDfiId,
                    company_entry_description: companyEntryDescription || 'PAYMENT',
                    is_production: isProduction
                };
                
                try {
                    await updateNachaSettings(settingsId, settingsData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Edit-NACHA-settings form submission handler added');
        }
        
        // Delete NACHA settings button handler
        const deleteNachaSettingsBtn = document.getElementById('deleteNachaSettingsBtn');
        if (deleteNachaSettingsBtn) {
            deleteNachaSettingsBtn.addEventListener('click', () => {
                const settingsId = document.getElementById('editNachaSettingsId').value;
                if (settingsId) {
                    deleteNachaSettings(settingsId);
                }
            });
            console.log('✅ Delete-NACHA-settings button handler added');
        }
        
        // Edit Batch form submission handler
        const editBatchForm = document.getElementById('editBatchForm');
        if (editBatchForm) {
            editBatchForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const batchId = document.getElementById('editBatchId').value;
                const batchNumber = document.getElementById('editBatchNumber').value;
                const entityId = document.getElementById('editBatchEntityId').value;
                const fundId = document.getElementById('editBatchFundId').value;
                const nachaSettingsId = document.getElementById('editNachaSettingsId').value;
                const batchDate = document.getElementById('editBatchDate').value;
                const effectiveDate = document.getElementById('editEffectiveDate').value;
                const description = document.getElementById('editBatchDescription').value;
                
                // Validation
                if (!batchId) return showToast('Validation', 'Batch ID is missing', true);
                if (!batchNumber) return showToast('Validation', 'Please enter a batch number', true);
                if (!entityId) return showToast('Validation', 'Please select an entity', true);
                if (!nachaSettingsId) return showToast('Validation', 'Please select NACHA settings', true);
                if (!batchDate) return showToast('Validation', 'Please enter a batch date', true);
                if (!effectiveDate) return showToast('Validation', 'Please enter an effective date', true);
                
                const batchData = {
                    entity_id: entityId,
                    fund_id: fundId || null,
                    nacha_settings_id: nachaSettingsId,
                    batch_name: batchNumber, // API expects batch_name but stores as batch_number
                    batch_date: batchDate,
                    effective_date: effectiveDate,
                    description,
                    status: currentBatch.status,
                    total_amount: currentBatch.total_amount
                };
                
                try {
                    await updatePaymentBatch(batchId, batchData);
                } catch (_) {
                    /* error toast already shown */
                }
            });
            console.log('✅ Edit-batch form submission handler added');
        }
        
        // Delete batch button handler
        const deleteBatchBtn = document.getElementById('deleteBatchBtn');
        if (deleteBatchBtn) {
            deleteBatchBtn.addEventListener('click', () => {
                const batchId = document.getElementById('editBatchId').value;
                if (batchId) {
                    deletePaymentBatch(batchId);
                }
            });
            console.log('✅ Delete-batch button handler added');
        }

        console.log('✅ Vendor Payments page initialized successfully');
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('❌ Error initializing Vendor Payments page:', error);
        showToast('Error', 'Failed to initialize page: ' + error.message, true);
    }
});
