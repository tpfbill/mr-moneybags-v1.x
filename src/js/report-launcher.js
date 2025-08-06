/**
 * Report Launcher - Simple script to add direct links to standalone report pages
 */

console.log("REPORT LAUNCHER: Script loaded");

// Function to add report launcher buttons to the reports page
function addReportLaunchers() {
    console.log("REPORT LAUNCHER: Adding report launcher buttons");
    
    // Find the reports gallery element
    const gallery = document.getElementById('reports-gallery');
    if (!gallery) {
        console.error("REPORT LAUNCHER: Reports gallery element not found");
        return;
    }
    
    // Create the launcher container
    const launcherContainer = document.createElement('div');
    launcherContainer.className = 'launcher-container';
    launcherContainer.style.marginTop = '30px';
    launcherContainer.style.padding = '15px';
    launcherContainer.style.backgroundColor = '#f0f8ff'; // Light blue background
    launcherContainer.style.border = '1px solid #b0c4de'; // Light steel blue border
    launcherContainer.style.borderRadius = '5px';
    
    // Add a heading
    const heading = document.createElement('h3');
    heading.textContent = 'External Reports (Opens in New Window)';
    heading.style.marginTop = '0';
    heading.style.marginBottom = '15px';
    heading.style.color = '#333';
    launcherContainer.appendChild(heading);
    
    // Create a description
    const description = document.createElement('p');
    description.textContent = 'If you are experiencing issues with the reports module, you can open clean standalone reports in a new window:';
    description.style.marginBottom = '15px';
    launcherContainer.appendChild(description);
    
    // Create a grid for the report buttons
    const buttonGrid = document.createElement('div');
    buttonGrid.style.display = 'grid';
    buttonGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    buttonGrid.style.gap = '10px';
    
    // Report definitions
    const reports = [
        { id: 'financial-position', name: 'Statement of Financial Position', file: 'report-financial-position.html', color: '#4CAF50' },
        { id: 'activities', name: 'Statement of Activities', file: 'report-activities.html', color: '#2196F3' },
        { id: 'functional-expenses', name: 'Statement of Functional Expenses', file: 'report-functional-expenses.html', color: '#FF9800' },
        { id: 'budget-vs-actual', name: 'Budget vs. Actual Report', file: 'report-budget-vs-actual.html', color: '#9C27B0' }
    ];
    
    // Create a button for each report
    reports.forEach(report => {
        const button = document.createElement('button');
        button.textContent = report.name;
        button.style.padding = '15px';
        button.style.backgroundColor = report.color;
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        button.style.fontWeight = 'bold';
        button.style.fontSize = '14px';
        button.style.textAlign = 'center';
        
        // Add hover effect
        button.addEventListener('mouseover', function() {
            this.style.opacity = '0.9';
        });
        
        button.addEventListener('mouseout', function() {
            this.style.opacity = '1';
        });
        
        // Add click handler to open the report in a new window
        button.addEventListener('click', function() {
            window.open(report.file, '_blank');
        });
        
        buttonGrid.appendChild(button);
    });
    
    launcherContainer.appendChild(buttonGrid);
    
    // Add the container to the gallery
    gallery.appendChild(launcherContainer);
    
    console.log("REPORT LAUNCHER: Report launcher buttons added");
}

// Wait until the document is fully loaded
document.addEventListener('DOMContentLoaded', addReportLaunchers);

// Also try after a delay to make sure the DOM is ready
setTimeout(addReportLaunchers, 1500);

console.log("REPORT LAUNCHER: Script initialized successfully");
