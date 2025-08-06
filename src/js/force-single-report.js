/**
 * FORCE SINGLE REPORT - Ensures only one report is shown at a time
 * This is the final emergency fix for the reports display issue
 */

console.log("FORCE SINGLE REPORT: Script loaded");

// Function to initialize the report isolation system
function initReportIsolation() {
    console.log("FORCE SINGLE REPORT: Initializing report isolation system");
    
    // Check the current DOM structure first
    diagnosticReportCheck();
    
    // Create a panel with buttons to explicitly select individual reports
    createReportSelectorPanel();
}

// Function to run diagnostics on the report structure
function diagnosticReportCheck() {
    console.log("FORCE SINGLE REPORT: Running diagnostics on report structure");
    
    const reportIds = [
        'financial-position-report',
        'activities-report',
        'functional-expenses-report',
        'budget-vs-actual-report',
        'custom-generated-report'
    ];
    
    reportIds.forEach(reportId => {
        const report = document.getElementById(reportId);
        if (!report) {
            console.error(`FORCE SINGLE REPORT: Report ${reportId} not found in DOM!`);
            return;
        }
        
        console.log(`FORCE SINGLE REPORT: Report ${reportId} diagnostics:`);
        console.log(`- Parent element: ${report.parentElement ? report.parentElement.tagName : 'None'}`);
        console.log(`- Parent ID: ${report.parentElement ? report.parentElement.id : 'None'}`);
        console.log(`- Display style: ${window.getComputedStyle(report).display}`);
        console.log(`- Visibility: ${window.getComputedStyle(report).visibility}`);
        console.log(`- Has active class: ${report.classList.contains('active')}`);
        console.log(`- Has tables: ${report.querySelectorAll('table').length}`);
    });
}

// Function to create a standalone report selector panel
function createReportSelectorPanel() {
    console.log("FORCE SINGLE REPORT: Creating report selector panel");
    
    // Create a container for the control panel
    const container = document.createElement('div');
    container.id = 'report-control-panel';
    container.style.position = 'fixed';
    container.style.top = '40px';
    container.style.right = '10px';
    container.style.backgroundColor = '#333';
    container.style.color = 'white';
    container.style.padding = '10px';
    container.style.borderRadius = '4px';
    container.style.zIndex = '10000';
    container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
    container.style.width = '200px';
    
    // Add a title
    const title = document.createElement('div');
    title.textContent = 'REPORT CONTROLS';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.style.textAlign = 'center';
    container.appendChild(title);
    
    // Add separator
    const separator = document.createElement('hr');
    separator.style.border = '0';
    separator.style.borderTop = '1px solid #555';
    separator.style.margin = '5px 0';
    container.appendChild(separator);
    
    // Add mutually exclusive report selection radio buttons
    const reportOptions = [
        { id: 'financial-position-report', label: 'Financial Position' },
        { id: 'activities-report', label: 'Activities' },
        { id: 'functional-expenses-report', label: 'Functional Expenses' },
        { id: 'budget-vs-actual-report', label: 'Budget vs Actual' }
    ];
    
    // Create radio button group
    reportOptions.forEach(option => {
        const radioContainer = document.createElement('div');
        radioContainer.style.margin = '8px 0';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'report-selector';
        radio.id = `radio-${option.id}`;
        radio.style.marginRight = '8px';
        
        const label = document.createElement('label');
        label.textContent = option.label;
        label.htmlFor = radio.id;
        label.style.cursor = 'pointer';
        
        radioContainer.appendChild(radio);
        radioContainer.appendChild(label);
        container.appendChild(radioContainer);
        
        // Add click handler
        radio.addEventListener('change', function() {
            if (this.checked) {
                forceShowSingleReport(option.id);
            }
        });
    });
    
    // Add separator
    const separator2 = document.createElement('hr');
    separator2.style.border = '0';
    separator2.style.borderTop = '1px solid #555';
    separator2.style.margin = '5px 0';
    container.appendChild(separator2);
    
    // Add "Back to Gallery" button
    const backButton = document.createElement('button');
    backButton.textContent = 'Back to Gallery';
    backButton.style.width = '100%';
    backButton.style.padding = '8px';
    backButton.style.backgroundColor = '#007bff';
    backButton.style.color = 'white';
    backButton.style.border = 'none';
    backButton.style.borderRadius = '4px';
    backButton.style.cursor = 'pointer';
    backButton.style.marginTop = '10px';
    
    backButton.addEventListener('click', function() {
        returnToReportGallery();
        
        // Uncheck all radio buttons
        document.querySelectorAll('input[name="report-selector"]').forEach(radio => {
            radio.checked = false;
        });
    });
    
    container.appendChild(backButton);
    
    // Add container to body
    document.body.appendChild(container);
    
    console.log("FORCE SINGLE REPORT: Report selector panel created");
}

// Function to force show a single report and hide all others
function forceShowSingleReport(reportId) {
    console.log(`FORCE SINGLE REPORT: Forcing display of ${reportId} only`);
    
    // First, make sure we're on the reports page
    showReportsPage();
    
    // Hide the report gallery
    const gallery = document.getElementById('reports-gallery');
    if (gallery) {
        gallery.style.display = 'none';
        gallery.classList.remove('active');
    }
    
    // Hide ALL reports first
    const allReports = document.querySelectorAll('.report-view');
    allReports.forEach(report => {
        report.style.display = 'none';
        report.classList.remove('active');
    });
    
    // Show ONLY the selected report
    const targetReport = document.getElementById(reportId);
    if (targetReport) {
        // Remove from DOM and re-add to ensure it's fresh and not influenced by any CSS
        const parent = targetReport.parentNode;
        const clone = targetReport.cloneNode(true);
        
        // Update styling on the clone
        clone.style.display = 'block';
        clone.classList.add('active');
        
        // Remove the original and append the clone
        parent.removeChild(targetReport);
        parent.appendChild(clone);
        
        // Use requestAnimationFrame for an additional display force after rendering
        requestAnimationFrame(() => {
            // Add specific styles to ensure tables display properly
            const tables = clone.querySelectorAll('table');
            tables.forEach(table => {
                table.style.display = 'table';
                
                const rows = table.querySelectorAll('tr');
                rows.forEach(row => {
                    row.style.display = 'table-row';
                    
                    const cells = row.querySelectorAll('th, td');
                    cells.forEach(cell => {
                        cell.style.display = 'table-cell';
                    });
                });
            });
            
            // Set up the back button event
            const backBtn = clone.querySelector('button[data-action="back-to-gallery"]');
            if (backBtn) {
                backBtn.addEventListener('click', returnToReportGallery);
            }
        });
        
        // Set title in header
        const titleElement = document.getElementById('reports-page-title');
        if (titleElement) {
            switch (reportId) {
                case 'financial-position-report':
                    titleElement.textContent = 'Statement of Financial Position';
                    break;
                case 'activities-report':
                    titleElement.textContent = 'Statement of Activities';
                    break;
                case 'functional-expenses-report':
                    titleElement.textContent = 'Statement of Functional Expenses';
                    break;
                case 'budget-vs-actual-report':
                    titleElement.textContent = 'Budget vs. Actual Report';
                    break;
                default:
                    titleElement.textContent = 'Report';
            }
        }
        
        console.log(`FORCE SINGLE REPORT: ${reportId} displayed with ${clone.querySelectorAll('table').length} tables`);
    } else {
        console.error(`FORCE SINGLE REPORT: Target report ${reportId} not found!`);
    }
}

// Function to show the reports page
function showReportsPage() {
    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
        page.classList.remove('active');
    });
    
    // Show reports page
    const reportsPage = document.getElementById('reports-page');
    if (reportsPage) {
        reportsPage.style.display = 'block';
        reportsPage.classList.add('active');
    }
}

// Function to return to the report gallery
function returnToReportGallery() {
    console.log("FORCE SINGLE REPORT: Returning to report gallery");
    
    // Hide all reports
    document.querySelectorAll('.report-view').forEach(report => {
        report.style.display = 'none';
        report.classList.remove('active');
    });
    
    // Show the gallery
    const gallery = document.getElementById('reports-gallery');
    if (gallery) {
        gallery.style.display = 'block';
        gallery.classList.add('active');
    }
    
    // Update title
    const titleElement = document.getElementById('reports-page-title');
    if (titleElement) {
        titleElement.textContent = 'Financial Reports';
    }
}

// Initialize after a short delay to ensure DOM is ready
setTimeout(initReportIsolation, 1000);

console.log("FORCE SINGLE REPORT: Script loaded successfully");
