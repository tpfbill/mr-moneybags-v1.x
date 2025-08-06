/**
 * @file direct-tab-fix.js
 * @description This is a direct approach to fix tab functionality by adding onclick attributes to tab elements.
 */

// Run immediately and on DOMContentLoaded to ensure execution
(function() {
    function applyTabFixes() {
        console.log("Direct Tab Fix: Applying tab fixes by adding onclick attributes");
        
        // Select all tab items
        const tabItems = document.querySelectorAll('.tab-item');
        
        console.log(`Direct Tab Fix: Found ${tabItems.length} tab items`);
        
        // Add direct onclick attributes to each tab item
        tabItems.forEach(function(tabItem) {
            const targetTabId = tabItem.getAttribute('data-tab');
            if (!targetTabId) {
                console.error("Direct Tab Fix: Tab item missing data-tab attribute:", tabItem);
                return;
            }
            
            // Set the onclick attribute directly in the HTML
            tabItem.setAttribute('onclick', `
                // Get all tabs within the same container
                const tabContainer = this.closest('.tab-container');
                if (!tabContainer) return;
                
                // Get all tab items and panels
                const allTabs = tabContainer.querySelectorAll('.tab-item');
                const allPanels = tabContainer.querySelectorAll('.tab-panel');
                
                // Deactivate all tabs and panels
                allTabs.forEach(t => t.classList.remove('active'));
                allPanels.forEach(p => p.classList.remove('active'));
                
                // Activate this tab
                this.classList.add('active');
                
                // Activate corresponding panel
                const panel = tabContainer.querySelector('#${targetTabId}');
                if (panel) panel.classList.add('active');
                
                // Log for debugging
                console.log('Tab clicked: ${targetTabId}');
                
                // Prevent default action
                return false;
            `);
            
            console.log(`Direct Tab Fix: Added onclick handler to tab for ${targetTabId}`);
        });
        
        // Also add a direct click handler for immediate effect
        tabItems.forEach(function(tabItem) {
            tabItem.addEventListener('click', function(e) {
                const targetTabId = this.getAttribute('data-tab');
                console.log('Tab clicked via event listener:', targetTabId);
                
                const tabContainer = this.closest('.tab-container');
                if (!tabContainer) return;
                
                const allTabs = tabContainer.querySelectorAll('.tab-item');
                const allPanels = tabContainer.querySelectorAll('.tab-panel');
                
                allTabs.forEach(t => t.classList.remove('active'));
                allPanels.forEach(p => p.classList.remove('active'));
                
                this.classList.add('active');
                
                const panel = tabContainer.querySelector(`#${targetTabId}`);
                if (panel) panel.classList.add('active');
            }, true); // Using capture phase to ensure this runs first
        });
    }
    
    // Apply fixes immediately
    applyTabFixes();
    
    // Also apply when DOM is fully loaded
    document.addEventListener('DOMContentLoaded', applyTabFixes);
    
    // And apply after a delay as a fallback
    setTimeout(applyTabFixes, 1000);
    
    // Make function available globally for debugging
    window.applyTabFixes = applyTabFixes;
})();

// Add a "Fix Tabs" button for manual intervention
setTimeout(function() {
    const fixButton = document.createElement('button');
    fixButton.textContent = 'Fix Tabs';
    fixButton.style.position = 'fixed';
    fixButton.style.top = '10px';
    fixButton.style.right = '10px';
    fixButton.style.zIndex = '9999';
    fixButton.style.backgroundColor = '#ff5722';
    fixButton.style.color = 'white';
    fixButton.style.border = 'none';
    fixButton.style.borderRadius = '4px';
    fixButton.style.padding = '5px 10px';
    fixButton.style.cursor = 'pointer';
    
    fixButton.onclick = function() {
        if (typeof window.applyTabFixes === 'function') {
            window.applyTabFixes();
            alert('Tab fixes applied! Please try clicking on tabs now.');
        } else {
            alert('Tab fix function not available.');
        }
    };
    
    document.body.appendChild(fixButton);
}, 2000);
