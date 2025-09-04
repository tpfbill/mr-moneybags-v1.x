// ---------------------------------------------------------------------------
// API Configuration (dynamic)
// ---------------------------------------------------------------------------
const devPorts = ['8080', '8081'];
const API_BASE_URL = devPorts.includes(window.location.port)
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : window.location.origin;

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

function showAlert(message) {
    const alertArea = document.getElementById('alertArea');
    const alertMessage = document.getElementById('alertMessage');
    
    alertMessage.textContent = message;
    alertArea.style.display = 'block';
}

function hideAlert() {
    document.getElementById('alertArea').style.display = 'none';
}

function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US');
}

function isNegative(value) {
    return parseFloat(value) < 0;
}

// Set default date range (first day of current month to today)
function setDefaultDateRange() {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    startDateInput.value = firstDay.toISOString().split('T')[0];
    endDateInput.value = today.toISOString().split('T')[0];
}

// Run the GL report
async function runGlReport(params) {
    try {
        showLoading();
        hideAlert();
        
        // Build query string
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value) queryParams.append(key, value);
        });
        
        console.debug('GL Report params:', params);
        
        const url = `${API_BASE_URL}/api/reports/gl?${queryParams.toString()}`;
        const response = await fetch(url, {
            credentials: 'include'
        });
        
        if (response.status === 401) {
            window.location.href = '/login.html';
            return;
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorText}`);
        }
        
        const data = await response.json();
        console.debug('GL Report results:', {
            summary: data.summary?.length || 0,
            detail: data.detail?.length || 0
        });
        
        // Show report results
        if ((!data.detail || data.detail.length === 0) && 
            (!data.summary || data.summary.length === 0)) {
            document.getElementById('reportResults').style.display = 'none';
            document.getElementById('noResultsMessage').style.display = 'block';
            return;
        }
        
        document.getElementById('reportResults').style.display = 'block';
        document.getElementById('noResultsMessage').style.display = 'none';
        
        // Display report metadata
        document.getElementById('reportDateRange').textContent = 
            `${formatDate(params.start_date)} to ${formatDate(params.end_date)}`;
        document.getElementById('reportStatus').textContent = 
            params.status || 'All Statuses';
        
        // Render tables
        renderSummaryTable(data.summary || []);
        renderDetailTable(data.detail || []);
        
    } catch (error) {
        console.error('Error running GL report:', error);
        showAlert(error.message);
        document.getElementById('reportResults').style.display = 'none';
        document.getElementById('noResultsMessage').style.display = 'none';
    } finally {
        hideLoading();
    }
}

function renderSummaryTable(summaryData) {
    const tableBody = document.getElementById('summaryTableBody');
    tableBody.innerHTML = '';
    
    let totalOpening = 0;
    let totalDebits = 0;
    let totalCredits = 0;
    let totalEnding = 0;
    
    summaryData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Track totals
        totalOpening += parseFloat(row.opening_balance || 0);
        totalDebits += parseFloat(row.debits || 0);
        totalCredits += parseFloat(row.credits || 0);
        totalEnding += parseFloat(row.ending_balance || 0);
        
        // Opening balance cell with negative check
        const openingCell = document.createElement('td');
        openingCell.className = 'currency';
        openingCell.textContent = formatCurrency(row.opening_balance);
        if (isNegative(row.opening_balance)) {
            openingCell.classList.add('negative');
        }
        
        // Ending balance cell with negative check
        const endingCell = document.createElement('td');
        endingCell.className = 'currency';
        endingCell.textContent = formatCurrency(row.ending_balance);
        if (isNegative(row.ending_balance)) {
            endingCell.classList.add('negative');
        }
        
        tr.innerHTML = `
            <td>${row.account_code || ''}</td>
            <td>${row.account_name || ''}</td>
        `;
        tr.appendChild(openingCell);
        tr.innerHTML += `
            <td class="currency">${formatCurrency(row.debits)}</td>
            <td class="currency">${formatCurrency(row.credits)}</td>
        `;
        tr.appendChild(endingCell);
        
        tableBody.appendChild(tr);
    });
    
    // Update totals in footer
    document.getElementById('totalOpening').textContent = formatCurrency(totalOpening);
    document.getElementById('totalDebits').textContent = formatCurrency(totalDebits);
    document.getElementById('totalCredits').textContent = formatCurrency(totalCredits);
    document.getElementById('totalEnding').textContent = formatCurrency(totalEnding);
    
    // Add negative class to totals if needed
    if (isNegative(totalOpening)) {
        document.getElementById('totalOpening').classList.add('negative');
    } else {
        document.getElementById('totalOpening').classList.remove('negative');
    }
    
    if (isNegative(totalEnding)) {
        document.getElementById('totalEnding').classList.add('negative');
    } else {
        document.getElementById('totalEnding').classList.remove('negative');
    }
}

function renderDetailTable(detailData) {
    const tableBody = document.getElementById('detailTableBody');
    tableBody.innerHTML = '';
    
    let currentAccount = null;
    
    detailData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Add a visual separator between accounts
        if (currentAccount !== row.account_code) {
            tr.style.borderTop = '2px solid #ccc';
            currentAccount = row.account_code;
        }
        
        // Running balance cell with negative check
        const balanceCell = document.createElement('td');
        balanceCell.className = 'currency';
        balanceCell.textContent = formatCurrency(row.running_balance);
        if (isNegative(row.running_balance)) {
            balanceCell.classList.add('negative');
        }
        
        tr.innerHTML = `
            <td>${formatDate(row.entry_date)}</td>
            <td>${row.reference_number || ''}</td>
            <td>${row.account_code || ''}</td>
            <td>${row.account_name || ''}</td>
            <td>${row.fund_code || ''}</td>
            <td>${row.line_description || ''}</td>
            <td class="currency">${row.debit ? formatCurrency(row.debit) : ''}</td>
            <td class="currency">${row.credit ? formatCurrency(row.credit) : ''}</td>
        `;
        tr.appendChild(balanceCell);
        
        tableBody.appendChild(tr);
    });
}

// Page initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing General Ledger Report page...');
    
    // Set default date range
    setDefaultDateRange();
    
    // Form submit handler
    const glReportForm = document.getElementById('glReportForm');
    glReportForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const params = {
            start_date: document.getElementById('startDate').value,
            end_date: document.getElementById('endDate').value,
            status: document.getElementById('status').value,
            account_code_from: document.getElementById('accountFrom').value,
            account_code_to: document.getElementById('accountTo').value
        };
        
        // Validate required fields
        if (!params.start_date || !params.end_date) {
            showAlert('Start date and end date are required.');
            return;
        }
        
        runGlReport(params);
    });
    
    // Form reset handler
    glReportForm.addEventListener('reset', function() {
        setTimeout(() => {
            setDefaultDateRange();
            document.getElementById('reportResults').style.display = 'none';
            document.getElementById('noResultsMessage').style.display = 'none';
            hideAlert();
        }, 0);
    });
});
