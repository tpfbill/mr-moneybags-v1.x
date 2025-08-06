/**
 * This script creates and loads test data for the Non-Profit Fund Accounting System.
 * It will use an in-memory database approach since we're working with the browser-based version.
 */

console.log('Loading test data for demonstration...');

// Define test data for the application
const testData = {
    entities: [
        { 
            id: 'ent1', 
            name: 'Main Organization', 
            code: 'MAIN', 
            status: 'Active', 
            fiscalYearStart: '01-01',
            baseCurrency: 'USD',
            isConsolidated: false 
        },
        { 
            id: 'ent2', 
            name: 'Youth Program', 
            code: 'YOUTH', 
            status: 'Active', 
            fiscalYearStart: '01-01',
            baseCurrency: 'USD',
            isConsolidated: false,
            parentEntityId: 'ent1'
        }
    ],

    accounts: [
        // Main Organization accounts
        { id: 'acc1', entityId: 'ent1', code: '1000', name: 'Cash', type: 'Asset', balance: 150000, status: 'Active' },
        { id: 'acc2', entityId: 'ent1', code: '1200', name: 'Grants Receivable', type: 'Asset', balance: 50000, status: 'Active' },
        { id: 'acc3', entityId: 'ent1', code: '2000', name: 'Accounts Payable', type: 'Liability', balance: 25000, status: 'Active' },
        { id: 'acc4', entityId: 'ent1', code: '3000', name: 'Net Assets', type: 'Net Assets', balance: 175000, status: 'Active' },
        { id: 'acc5', entityId: 'ent1', code: '4000', name: 'Grant Revenue', type: 'Revenue', balance: 250000, status: 'Active' },
        { id: 'acc6', entityId: 'ent1', code: '5000', name: 'Program Expenses', type: 'Expense', balance: 100000, status: 'Active' },
        
        // Youth Program accounts
        { id: 'acc7', entityId: 'ent2', code: '1000', name: 'Youth Program Cash', type: 'Asset', balance: 25000, status: 'Active' },
        { id: 'acc8', entityId: 'ent2', code: '4100', name: 'Youth Program Revenue', type: 'Revenue', balance: 35000, status: 'Active' },
        { id: 'acc9', entityId: 'ent2', code: '5100', name: 'Youth Program Expenses', type: 'Expense', balance: 10000, status: 'Active' }
    ],

    funds: [
        // Main Organization funds
        { id: 'fund1', entityId: 'ent1', code: 'GF', name: 'General Fund', type: 'Unrestricted', balance: 100000, status: 'Active' },
        { id: 'fund2', entityId: 'ent1', code: 'RF', name: 'Restricted Fund', type: 'Temporarily Restricted', balance: 75000, status: 'Active' },
        
        // Youth Program funds
        { id: 'fund3', entityId: 'ent2', code: 'YF', name: 'Youth Fund', type: 'Unrestricted', balance: 25000, status: 'Active' }
    ],

    journalEntries: [
        {
            id: 'je1',
            entityId: 'ent1',
            date: '2025-06-01',
            reference: 'JE-001',
            description: 'Grant received from Community Foundation',
            totalAmount: 25000,
            status: 'Posted',
            createdBy: 'System',
            lines: [
                { accountId: 'acc1', fundId: 'fund1', debit: 25000, credit: 0, description: 'Cash received' },
                { accountId: 'acc5', fundId: 'fund1', debit: 0, credit: 25000, description: 'Revenue recorded' }
            ]
        },
        {
            id: 'je2',
            entityId: 'ent1',
            date: '2025-06-15',
            reference: 'JE-002',
            description: 'Monthly office expenses',
            totalAmount: 5000,
            status: 'Posted',
            createdBy: 'System',
            lines: [
                { accountId: 'acc6', fundId: 'fund1', debit: 5000, credit: 0, description: 'Office expenses' },
                { accountId: 'acc1', fundId: 'fund1', debit: 0, credit: 5000, description: 'Cash payment' }
            ]
        },
        {
            id: 'je3',
            entityId: 'ent2',
            date: '2025-06-10',
            reference: 'JE-003',
            description: 'Youth program supplies',
            totalAmount: 2000,
            status: 'Posted',
            createdBy: 'System',
            lines: [
                { accountId: 'acc9', fundId: 'fund3', debit: 2000, credit: 0, description: 'Program supplies' },
                { accountId: 'acc7', fundId: 'fund3', debit: 0, credit: 2000, description: 'Cash payment' }
            ]
        }
    ],

    users: [
        { id: 'user1', name: 'Admin User', email: 'admin@example.org', role: 'Administrator', status: 'Active' },
        { id: 'user2', name: 'Finance Manager', email: 'finance@example.org', role: 'Finance', status: 'Active' },
        { id: 'user3', name: 'Program Staff', email: 'program@example.org', role: 'Staff', status: 'Active' }
    ],

    organizationSettings: {
        name: 'Community Non-Profit Organization',
        taxId: '12-3456789',
        phone: '(555) 123-4567',
        email: 'info@communitynonprofit.org',
        addressStreet: '123 Main Street',
        addressCity: 'Anytown',
        addressState: 'ST',
        addressZip: '12345',
        defaultCurrency: 'USD',
        globalFiscalYearStart: '01-01'
    }
};

// Function to load the test data into app's state
function loadTestData() {
    console.log('Loading test data into application state...');

    // Store data in the app's global state
    window.app.loadTestData(testData);

    console.log('Test data loaded successfully!');
    alert('Test data has been loaded. You can now explore the application with sample data.');
}

// Add function to app global object
window.loadTestData = loadTestData;

// Add a button to load test data
function addTestDataButton() {
    // Create a container for the test data button
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '10px';
    container.style.top = '60px';
    container.style.zIndex = '9999';

    // Create the button
    const button = document.createElement('button');
    button.textContent = 'Load Test Data';
    button.style.padding = '8px 12px';
    button.style.backgroundColor = '#4caf50';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.fontWeight = 'bold';

    // Add hover effect
    button.addEventListener('mouseover', function() {
        this.style.backgroundColor = '#45a049';
    });

    button.addEventListener('mouseout', function() {
        this.style.backgroundColor = '#4caf50';
    });

    // Add click handler
    button.addEventListener('click', function() {
        try {
            loadTestData();
        } catch (error) {
            console.error('Error loading test data:', error);
            alert('Error loading test data. Check console for details.');
        }
    });

    container.appendChild(button);
    document.body.appendChild(container);
}

// Create core data loading function for the app
window.app = window.app || {};
window.app.loadTestData = function(data) {
    console.log('Updating application state with test data');
    
    // Update state with test data
    const appState = window.app.getState();
    
    // Copy test data to state
    appState.entities = data.entities;
    appState.accounts = data.accounts;
    appState.funds = data.funds;
    appState.journalEntries = data.journalEntries;
    appState.users = data.users;
    appState.organizationSettings = data.organizationSettings;
    
    // Set current entity if not set
    if (!appState.currentEntityId && data.entities.length > 0) {
        appState.currentEntityId = data.entities[0].id;
    }
    
    // Refresh the UI
    if (window.ui && typeof window.ui.refreshAllViews === 'function') {
        window.ui.refreshAllViews(appState);
    } else {
        console.error('UI refresh function not available');
    }
};

// Add the test data button
document.addEventListener('DOMContentLoaded', addTestDataButton);

// Also add after a delay in case DOM is already loaded
setTimeout(addTestDataButton, 1000);

console.log('Test data script loaded!');
