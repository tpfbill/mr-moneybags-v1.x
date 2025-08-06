/**
 * Force Display Reports - Emergency fix to ensure all report content is visible
 * This enforces display styles for all report elements
 */

console.log('FORCE REPORTS: Script loaded');

// Function to apply display fixes to reports
function forceDisplayReports() {
    console.log('FORCE REPORTS: Applying display fixes to all reports');
    
    // Define all report IDs
    const reportIds = [
        'financial-position-report',
        'activities-report',
        'functional-expenses-report',
        'budget-vs-actual-report',
        'custom-generated-report'
    ];
    
    // Ensure all reports have the right display styles when activated
    reportIds.forEach(reportId => {
        const report = document.getElementById(reportId);
        if (!report) {
            console.error(`FORCE REPORTS: Report ${reportId} not found`);
            return;
        }
        
        // Override CSS for the report view to ensure it displays properly when active
        const style = document.createElement('style');
        style.textContent = `
            #${reportId}.active {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            #${reportId}.active .report-container {
                display: block !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            #${reportId}.active .report-container * {
                display: revert !important;
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            #${reportId}.active table {
                display: table !important;
            }
            
            #${reportId}.active tr {
                display: table-row !important;
            }
            
            #${reportId}.active th,
            #${reportId}.active td {
                display: table-cell !important;
            }
        `;
        document.head.appendChild(style);
        
        console.log(`FORCE REPORTS: Applied display fixes to ${reportId}`);
    });
    
    // Also enhance the click handlers to ensure reports are displayed
    document.querySelectorAll('[data-report]').forEach(button => {
        const originalHandler = button.onclick;
        
        button.onclick = function() {
            const reportType = this.getAttribute('data-report');
            console.log(`FORCE REPORTS: Enhanced click handler for ${reportType}`);
            
            // Call the original handler if it exists
            if (typeof originalHandler === 'function') {
                originalHandler.call(this);
            }
            
            // Hide all reports first
            reportIds.forEach(id => {
                const report = document.getElementById(id);
                if (report) {
                    report.classList.remove('active');
                    report.style.display = 'none';
                }
            });
            
            // Show the targeted report with forced display
            const targetReport = document.getElementById(`${reportType}-report`);
            if (targetReport) {
                targetReport.classList.add('active');
                targetReport.style.display = 'block';
                
                // Make sure all child elements are shown
                const reportContainer = targetReport.querySelector('.report-container');
                if (reportContainer) {
                    reportContainer.style.display = 'block';
                }
            }
            
            return false; // Prevent default and stop propagation
        };
    });
    
    console.log('FORCE REPORTS: Enhanced all report button handlers');
}

// Apply fixes on load and after a delay
document.addEventListener('DOMContentLoaded', forceDisplayReports);
setTimeout(forceDisplayReports, 1000);
