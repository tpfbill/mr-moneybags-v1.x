/**
 * @file direct-button-fix.js
 * @description Direct button event handler attachment for the Non-Profit Fund Accounting System.
 * This script ensures that button click handlers are properly attached regardless of 
 * race conditions or timing issues.
 */

// Wait for the DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('DIRECT BUTTON FIX: Attaching button handlers directly...');
    
    // Attach handlers after a small delay to ensure modals module is loaded
    setTimeout(attachButtonHandlers, 500);
    
    // Also try to attach handlers after window load to catch any timing issues
    window.addEventListener('load', attachButtonHandlers);
});

// Try attaching handlers right away in case DOM is already loaded
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    console.log('DIRECT BUTTON FIX: Document already loaded, trying immediate attachment...');
    
    // Small delay to give other modules a chance to load
    setTimeout(attachButtonHandlers, 100);
}

/**
 * Attaches event handlers to all the important buttons
 */
function attachButtonHandlers() {
    console.log('DIRECT BUTTON FIX: Attaching button handlers...');
    
    // --- "Add" Buttons ---
    
    // Add Account button
    const btnAddAccount = document.getElementById('btnAddAccount');
    if (btnAddAccount) {
        console.log('DIRECT BUTTON FIX: Attaching handler to btnAddAccount');
        btnAddAccount.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: btnAddAccount clicked');
            if (window.modals) {
                window.modals.openAccount();
            } else {
                console.error('DIRECT BUTTON FIX: modals module not available');
                alert('The modals module is not loaded. Cannot open account form.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: btnAddAccount not found');
    }
    
    // Add Fund button
    const btnAddFund = document.getElementById('btnAddFund');
    if (btnAddFund) {
        console.log('DIRECT BUTTON FIX: Attaching handler to btnAddFund');
        btnAddFund.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: btnAddFund clicked');
            if (window.modals) {
                window.modals.openFund();
            } else {
                console.error('DIRECT BUTTON FIX: modals module not available');
                alert('The modals module is not loaded. Cannot open fund form.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: btnAddFund not found');
    }
    
    // New Journal Entry button
    const btnNewJournalEntry = document.getElementById('btnNewJournalEntry');
    if (btnNewJournalEntry) {
        console.log('DIRECT BUTTON FIX: Attaching handler to btnNewJournalEntry');
        btnNewJournalEntry.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: btnNewJournalEntry clicked');
            if (window.modals) {
                window.modals.openJournalEntry();
            } else {
                console.error('DIRECT BUTTON FIX: modals module not available');
                alert('The modals module is not loaded. Cannot open journal entry form.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: btnNewJournalEntry not found');
    }
    
    // Add Entity button
    const btnAddEntity = document.getElementById('btn-add-entity');
    if (btnAddEntity) {
        console.log('DIRECT BUTTON FIX: Attaching handler to btn-add-entity');
        btnAddEntity.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: btn-add-entity clicked');
            if (window.modals) {
                window.modals.openEntity();
            } else {
                console.error('DIRECT BUTTON FIX: modals module not available');
                alert('The modals module is not loaded. Cannot open entity form.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: btn-add-entity not found');
    }
    
    // Add User button
    const btnAddUser = document.getElementById('btnAddUser');
    if (btnAddUser) {
        console.log('DIRECT BUTTON FIX: Attaching handler to btnAddUser');
        btnAddUser.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: btnAddUser clicked');
            if (window.modals) {
                window.modals.openUser();
            } else {
                console.error('DIRECT BUTTON FIX: modals module not available');
                alert('The modals module is not loaded. Cannot open user form.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: btnAddUser not found');
    }
    
    // Custom Report button
    const createCustomReportBtn = document.getElementById('create-custom-report-definition');
    if (createCustomReportBtn) {
        console.log('DIRECT BUTTON FIX: Attaching handler to create-custom-report-definition');
        createCustomReportBtn.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: create-custom-report-definition clicked');
            if (window.reports) {
                window.reports.openReportBuilder();
            } else {
                console.error('DIRECT BUTTON FIX: reports module not available');
                alert('The reports module is not loaded. Cannot open report builder.');
            }
        };
    } else {
        console.warn('DIRECT BUTTON FIX: create-custom-report-definition not found');
    }
    
    // Report generate buttons
    const reportButtons = document.querySelectorAll('button[data-report]');
    reportButtons.forEach(button => {
        const reportType = button.dataset.report;
        console.log(`DIRECT BUTTON FIX: Attaching handler to report button [${reportType}]`);
        button.onclick = function(e) {
            e.preventDefault();
            console.log(`DIRECT BUTTON FIX: report button [${reportType}] clicked`);
            if (window.reports) {
                window.reports.generateStandardReport(reportType);
            } else {
                console.error('DIRECT BUTTON FIX: reports module not available');
                alert('The reports module is not loaded. Cannot generate report.');
            }
        };
    });
    
    // Back to gallery buttons
    const backToGalleryButtons = document.querySelectorAll('button[data-action="back-to-gallery"]');
    backToGalleryButtons.forEach(button => {
        console.log('DIRECT BUTTON FIX: Attaching handler to back-to-gallery button');
        button.onclick = function(e) {
            e.preventDefault();
            console.log('DIRECT BUTTON FIX: back-to-gallery clicked');
            if (window.reports) {
                window.reports.showGallery();
            } else {
                console.error('DIRECT BUTTON FIX: reports module not available');
                alert('The reports module is not loaded. Cannot show gallery.');
            }
        };
    });
    
    console.log('DIRECT BUTTON FIX: Finished attaching button handlers');
}
