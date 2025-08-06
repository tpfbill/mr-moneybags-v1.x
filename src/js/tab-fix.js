/**
 * @file tab-fix.js
 * @description Fixes tab navigation functionality in the Non-Profit Fund Accounting System.
 * Uses both onClick assignments and event listeners to ensure tab functionality.
 */

(function(window) {
    'use strict';

    // Immediate execution for tab functionality setup
    function initializeTabs() {
        console.log('Tab-fix: Initializing tabs...');
        
        // Get all tab menus
        const tabMenus = document.querySelectorAll('.tab-menu');
        
        if (tabMenus.length === 0) {
            console.warn('Tab-fix: No tab menus found on page');
            // Schedule another attempt if DOM might not be ready yet
            setTimeout(initializeTabs, 500);
            return;
        }

        console.log(`Tab-fix: Found ${tabMenus.length} tab menu(s)`);

        // For each tab menu, set up the click handlers
        tabMenus.forEach(function(tabMenu) {
            // Get all tab items within this menu
            const tabItems = tabMenu.querySelectorAll('.tab-item');
            console.log(`Tab-fix: Found ${tabItems.length} tab items in a menu`);
            
            // For each tab item, set up both event listener and direct onclick
            tabItems.forEach(function(tabItem) {
                // Function to handle tab switching
                const tabSwitchHandler = function() {
                    console.log('Tab-fix: Tab clicked:', tabItem.dataset.tab);
                    
                    // Get the tab container that contains this menu
                    const tabContainer = tabMenu.closest('.tab-container');
                    if (!tabContainer) {
                        console.error('Tab-fix: Tab container not found for tab menu');
                        return;
                    }
                    
                    // Get all tab panels within this container
                    const tabPanels = tabContainer.querySelectorAll('.tab-panel');
                    console.log(`Tab-fix: Found ${tabPanels.length} panel(s)`);
                    
                    // Hide all tab panels
                    tabPanels.forEach(function(panel) {
                        panel.classList.remove('active');
                    });
                    
                    // Deactivate all tab items
                    tabItems.forEach(function(item) {
                        item.classList.remove('active');
                    });
                    
                    // Activate clicked tab item
                    tabItem.classList.add('active');
                    
                    // Activate corresponding tab panel
                    const targetTabId = tabItem.dataset.tab;
                    const targetPanel = tabContainer.querySelector(`#${targetTabId}`);
                    if (targetPanel) {
                        targetPanel.classList.add('active');
                        console.log(`Tab-fix: Activated panel ${targetTabId}`);
                    } else {
                        console.error(`Tab-fix: Tab panel with ID "${targetTabId}" not found`);
                    }
                };
                
                // Add event listener
                tabItem.addEventListener('click', tabSwitchHandler);
                
                // Also set direct onclick property as a fallback
                tabItem.onclick = tabSwitchHandler;
            });
        });

        console.log('Tab-fix: Tab navigation functionality initialized');
    }

    // Try to initialize immediately
    initializeTabs();

    // Also wait for DOM content to be fully loaded (belt and suspenders approach)
    document.addEventListener('DOMContentLoaded', initializeTabs);

    // Expose a function to retry tab initialization if needed
    window.retryTabInitialization = initializeTabs;
    
})(window);

// Execute tab initialization after a delay as a fallback
setTimeout(function() {
    console.log('Tab-fix: Running delayed initialization check...');
    if (typeof window.retryTabInitialization === 'function') {
        window.retryTabInitialization();
    }
}, 1000);
