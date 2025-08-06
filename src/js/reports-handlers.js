/**
 * Reports Event Handlers - Minimal script to handle report generation buttons
 * This replaces the fix-reports.js script with a simpler implementation.
 */

console.log('REPORTS HANDLERS: Script loaded');

// Execute when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('REPORTS HANDLERS: DOM content loaded, setting up report handlers');
    
    // Set up event handlers for standard report buttons
    document.querySelectorAll('[data-report]').forEach(button => {
        button.addEventListener('click', function() {
            const reportType = this.getAttribute('data-report');
            console.log(`REPORTS HANDLERS: Handling report button click for: ${reportType}`);
            
            // Hide all views
            document.querySelectorAll('.report-view').forEach(view => {
                view.classList.remove('active');
            });
            document.getElementById('reports-gallery').classList.remove('active');
            
            // Show the requested report view
            const targetReportView = document.getElementById(`${reportType}-report`);
            if (targetReportView) {
                targetReportView.classList.add('active');
            }
            
            // Update the title
            const titleElement = document.getElementById('reports-page-title');
            if (titleElement) {
                switch (reportType) {
                    case 'financial-position':
                        titleElement.textContent = 'Statement of Financial Position';
                        break;
                    case 'activities':
                        titleElement.textContent = 'Statement of Activities';
                        break;
                    case 'functional-expenses':
                        titleElement.textContent = 'Statement of Functional Expenses';
                        break;
                    case 'budget-vs-actual':
                        titleElement.textContent = 'Budget vs. Actual Report';
                        break;
                    default:
                        titleElement.textContent = 'Financial Reports';
                }
            }
        });
    });
    
    // Set up event handler for "back to gallery" buttons
    document.querySelectorAll('button[data-action="back-to-gallery"]').forEach(button => {
        button.addEventListener('click', function() {
            document.querySelectorAll('.report-view').forEach(view => {
                view.classList.remove('active');
            });
            const galleryElement = document.getElementById('reports-gallery');
            if (galleryElement) {
                galleryElement.classList.add('active');
            }
            const titleElement = document.getElementById('reports-page-title');
            if (titleElement) {
                titleElement.textContent = 'Financial Reports';
            }
        });
    });
    
    console.log('REPORTS HANDLERS: Report handlers setup complete');
});
