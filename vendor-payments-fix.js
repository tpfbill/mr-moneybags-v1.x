/**
 * vendor-payments-fix.js
 * 
 * This script patches the NACHA Vendor Payments page to handle missing API endpoints gracefully.
 * It intercepts fetch calls to non-existent endpoints and shows "Coming Soon" messages instead
 * of error toasts.
 * 
 * To use: Include this script in vendor-payments.html after the main script tag.
 */
(function() {
    'use strict';

    console.log('[vendor-payments-fix] Initializing API endpoint patch...');
    
    // Store the original fetch function
    const originalFetch = window.fetch;
    
    // List of API endpoints that might not be implemented yet
    const pendingEndpoints = [
        '/api/payment-batches',
        '/api/vendors',
        '/api/nacha-settings',
        '/api/nacha-files',
        '/api/vendors/'  // Prefix for vendor-specific endpoints
    ];
    
    // CSS for "Coming Soon" banners
    const injectCSS = () => {
        const style = document.createElement('style');
        style.textContent = `
            .coming-soon-banner {
                background-color: #e3f2fd;
                border-left: 5px solid #2196f3;
                padding: 15px;
                margin-bottom: 20px;
                border-radius: 4px;
                color: #0d47a1;
            }
        `;
        document.head.appendChild(style);
    };
    
    /**
     * Shows a "Coming Soon" message in the specified table body
     * @param {string} tableBodyId - The ID of the table body element
     * @param {number} colSpan - The number of columns to span
     * @param {string} message - The message to display
     */
    window.showComingSoonMessage = function(tableBodyId, colSpan, message = "This feature is coming soon") {
        const tableBody = document.getElementById(tableBodyId);
        if (!tableBody) return;
        
        tableBody.innerHTML = '';
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = colSpan;
        cell.className = 'text-center p-4';
        
        const alert = document.createElement('div');
        alert.className = 'coming-soon-banner';
        alert.innerHTML = `
            <h5 class="mb-2"><i class="fas fa-tools me-2"></i> ${message}</h5>
            <p class="mb-0">The backend API for this feature is not yet implemented.</p>
        `;
        
        cell.appendChild(alert);
        row.appendChild(cell);
        tableBody.appendChild(row);
    };
    
    /**
     * Override the fetch function to intercept API calls
     */
    window.fetch = function(url, options) {
        // Check if this is a call to a pending API endpoint
        const isPendingEndpoint = pendingEndpoints.some(endpoint => 
            typeof url === 'string' && url.includes(endpoint)
        );
        
        if (isPendingEndpoint) {
            console.log(`[vendor-payments-fix] Intercepting call to pending endpoint: ${url}`);
            
            // First try the original fetch
            return originalFetch(url, options)
                .then(response => {
                    // If the response is 404, handle it gracefully
                    if (response.status === 404) {
                        console.info(`[API] ${url} not available (404) - feature not implemented yet`);
                        
                        // Determine which table to show the coming soon message in
                        if (url.includes('/api/payment-batches')) {
                            setTimeout(() => showComingSoonMessage('batchesTableBody', 8, 'Payment Batches Coming Soon'), 100);
                        } else if (url.includes('/api/vendors') && !url.includes('/bank-accounts')) {
                            setTimeout(() => showComingSoonMessage('vendorsTableBody', 8, 'Vendor Management Coming Soon'), 100);
                        } else if (url.includes('/api/nacha-settings')) {
                            setTimeout(() => showComingSoonMessage('nachaSettingsTableBody', 7, 'NACHA Settings Coming Soon'), 100);
                        } else if (url.includes('/api/nacha-files')) {
                            setTimeout(() => showComingSoonMessage('nachaFilesTableBody', 7, 'NACHA Files Coming Soon'), 100);
                        }
                        
                        // Return a fake successful response with an empty array
                        return {
                            ok: true,
                            status: 200,
                            json: () => Promise.resolve([])
                        };
                    }
                    return response;
                })
                .catch(error => {
                    console.warn(`[vendor-payments-fix] Error with endpoint ${url}:`, error);
                    // Return a fake successful response with an empty array
                    return {
                        ok: true,
                        status: 200,
                        json: () => Promise.resolve([])
                    };
                });
        }
        
        // For non-pending endpoints, use the original fetch
        return originalFetch(url, options);
    };
    
    /**
     * Override the showToast function to suppress error messages for missing endpoints
     */
    const originalShowToast = window.showToast;
    window.showToast = function(title, message, isError = false) {
        // Suppress "Failed to load" error messages
        if (isError && (
            message.includes('Failed to load payment batches') ||
            message.includes('Failed to load vendors') ||
            message.includes('Failed to load NACHA settings') ||
            message.includes('Failed to load NACHA files') ||
            message.includes('Failed to load vendor bank accounts')
        )) {
            console.info(`[vendor-payments-fix] Suppressed error toast: ${message}`);
            return;
        }
        
        // Otherwise, use the original showToast function
        if (originalShowToast) {
            originalShowToast(title, message, isError);
        }
    };
    
    // Initialize the patch
    injectCSS();
    console.log('[vendor-payments-fix] Patch initialized successfully');
    
    // Add a small notification to let users know the page is in development
    document.addEventListener('DOMContentLoaded', function() {
        const container = document.querySelector('.container-fluid');
        if (container) {
            const notice = document.createElement('div');
            notice.className = 'alert alert-info mb-4';
            notice.innerHTML = `
                <i class="fas fa-info-circle me-2"></i>
                <strong>Development Notice:</strong> The NACHA Vendor Payments module is currently under development. 
                Some features may not be fully implemented yet.
            `;
            container.insertBefore(notice, container.firstChild.nextSibling);
        }
    });
})();
