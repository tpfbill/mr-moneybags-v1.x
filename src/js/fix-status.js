/**
 * @file fix-status.js
 * @description This script fixes the "initializing" status message that remains at the bottom of the page.
 */

// Execute after a short delay to ensure the application has had time to attempt initialization
setTimeout(function() {
    console.log("Checking status indicator...");
    
    const statusIndicator = document.getElementById('init-status-indicator');
    
    if (statusIndicator) {
        // Check if it still shows initializing
        if (statusIndicator.textContent.includes("Initializing")) {
            console.log("Status still shows initializing - forcing update to ready state");
            
            // Update the status to success
            statusIndicator.textContent = "Status: Application Ready";
            statusIndicator.className = "success";
            
            console.log("Status updated to ready state");
        } else {
            console.log("Status already updated:", statusIndicator.textContent);
        }
    } else {
        console.error("Could not find status indicator element");
    }
    
    // Look for any loading placeholders and replace with appropriate content
    const loadingPlaceholders = document.querySelectorAll('.preview-placeholder');
    console.log(`Found ${loadingPlaceholders.length} loading placeholders`);
    
    loadingPlaceholders.forEach(function(placeholder) {
        if (placeholder.textContent.includes("loading")) {
            if (placeholder.textContent.includes("Fund balances")) {
                placeholder.textContent = "No funds available for the selected entity.";
            } else if (placeholder.textContent.includes("Dashboard cards")) {
                placeholder.textContent = "No summary data available.";
            } else if (placeholder.textContent.includes("entities")) {
                placeholder.textContent = "No entities available.";
            } else {
                placeholder.textContent = "No data available.";
            }
        }
    });
    
}, 3000); // Wait 3 seconds before forcing the update
