/**
 * @file app.js
 * @description Main entry point for the Non-Profit Fund Accounting System.
 * This file imports and initializes all the modular components.
 * 
 * Modular Architecture:
 * - app-auth.js: Authentication and role-based access control
 * - app-config.js: Configuration, state management, and utility functions
 * - app-data.js: Data fetching and API integration
 * - app-ui.js: UI updates and DOM manipulation
 * - app-modals.js: Modal management and form handling
 * - app-main.js: Application orchestration and initialization
 */

console.log('Loading Non-Profit Fund Accounting System v1.x...');
console.log('Initializing modular architecture...');

// Track module loading status
const moduleStatus = {
    main: false,
    auth: false,
    config: false,
    data: false,
    ui: false,
    modals: false
};

/**
 * Initialize the application
 */
async function initializeApplication() {
    try {
        console.log('Importing modules...');
        
        // Import the main module (use absolute path so classic script resolves correctly)
        const { initializeApp } = await import('/src/js/app-main.js')
            .then(module => {
                console.log('✅ Main module loaded successfully');
                moduleStatus.main = true;
                return module;
            })
            .catch(error => {
                console.error('❌ Failed to load main module:', error);
                throw new Error('Critical module loading failure: app-main.js');
            });
        
        // Check if all required modules are loaded
        if (!moduleStatus.main) {
            throw new Error('Application initialization aborted: Required modules failed to load');
        }
        
        console.log('All modules loaded, starting application...');
        
        // Initialize the application
        await initializeApp();
        
        console.log('Application started successfully!');
    } catch (error) {
        console.error('Application initialization failed:', error);
        
        // Display error message to user
        const appContainer = document.getElementById('app-container');
        if (appContainer) {
            appContainer.innerHTML = `
                <div class="error-container">
                    <h2>Application Error</h2>
                    <p>The application failed to initialize. Please try refreshing the page or contact support if the problem persists.</p>
                    <p class="error-details">${error.message}</p>
                </div>
            `;
        }
    }
}

// Initialize the application when the DOM is fully loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApplication);
} else {
    // DOM already loaded, initialize immediately
    initializeApplication();
}

// Handle uncaught errors
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    
    // Show toast notification if available
    if (window.showToast) {
        window.showToast('An error occurred. Please check the console for details.', 'error');
    }
});

// Export module status for debugging
window.moduleStatus = moduleStatus;
