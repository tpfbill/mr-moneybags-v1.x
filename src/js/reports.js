/**
 * @file reports.js
 * @description Reports module for the Non-Profit Fund Accounting System.
 * This module handles report generation, formatting, and display.
 */

(function(window) {
    'use strict';

    // --- Private Functions ---

    /**
     * Formats currency values
     * @param {number} amount - The amount to format
     * @param {string} currencyCode - The currency code, defaults to USD
     * @returns {string} Formatted currency string
     */
    function _formatCurrency(amount, currencyCode = 'USD') {
        return `$${(amount || 0).toFixed(2)} ${currencyCode}`;
    }

    /**
     * Shows a specific report view and hides others
     * @param {string} reportType - The report type identifier
     */
    function _showReportView(reportType) {
        console.log(`REPORTS: Showing report view: ${reportType}`);
        
        // Hide all report views
        document.querySelectorAll('.report-view').forEach(view => {
            view.classList.remove('active');
        });
        
        // Hide the gallery
        const galleryElement = document.getElementById('reports-gallery');
        if (galleryElement) {
            galleryElement.classList.remove('active');
        }
        
        // Show the requested report view
        const reportView = document.getElementById(`${reportType}-report`);
        if (reportView) {
            reportView.classList.add('active');
            console.log(`REPORTS: Report view "${reportType}" activated`);
        } else {
            console.error(`REPORTS: Report view with ID "${reportType}-report" not found`);
            // Fall back to the gallery
            if (galleryElement) {
                galleryElement.classList.add('active');
            }
        }
        
        // Update the reports page title
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
                case 'custom-generated-report':
                    titleElement.textContent = 'Custom Report';
                    break;
                default:
                    titleElement.textContent = 'Financial Reports';
            }
        }
    }

    /**
     * Generates a statement of financial position report
     * @param {object} state - Application state
     */
    function _generateFinancialPositionReport(state) {
        console.log('REPORTS: Generating Statement of Financial Position...');
        
        // This is a placeholder for real report generation logic.
        // In a real implementation, this would analyze the accounts data and produce a balance sheet.
        
        // For now, we're just showing the pre-built report in the HTML
        _showReportView('financial-position');
    }

    /**
     * Generates a statement of activities report
     * @param {object} state - Application state
     */
    function _generateActivitiesReport(state) {
        console.log('REPORTS: Generating Statement of Activities...');
        
        // Placeholder for real implementation
        _showReportView('activities');
    }

    /**
     * Generates a statement of functional expenses report
     * @param {object} state - Application state
     */
    function _generateFunctionalExpensesReport(state) {
        console.log('REPORTS: Generating Statement of Functional Expenses...');
        
        // Placeholder for real implementation
        _showReportView('functional-expenses');
    }

    /**
     * Generates a budget vs. actual report
     * @param {object} state - Application state
     */
    function _generateBudgetVsActualReport(state) {
        console.log('REPORTS: Generating Budget vs. Actual Report...');
        
        // Placeholder for real implementation
        _showReportView('budget-vs-actual');
    }

    /**
     * Opens the report builder modal for creating custom reports
     */
    function _openReportBuilder() {
        console.log('REPORTS: Opening report builder modal...');
        
        const modal = document.getElementById('report-builder-modal');
        if (modal) {
            const title = document.getElementById('report-builder-modal-title');
            if (title) {
                title.textContent = 'Create New Custom Report';
            }
            
            modal.style.display = 'flex';
        } else {
            console.error('REPORTS: Report builder modal element not found');
        }
    }

    /**
     * Runs a custom report based on a saved definition
     * @param {object} definition - The report definition
     * @param {object} state - Application state
     */
    async function _runCustomReport(definition, state) {
        console.log(`REPORTS: Running custom report: ${definition.name}`);
        
        const reportContainer = document.getElementById('custom-report-output-container');
        const orgNameEl = document.getElementById('custom-report-output-org-name');
        const titleEl = document.getElementById('custom-report-output-title');
        const dateEl = document.getElementById('custom-report-output-date');
        const tableArea = document.getElementById('custom-report-output-table-area');
        
        if (!reportContainer || !orgNameEl || !titleEl || !dateEl || !tableArea) {
            console.error('REPORTS: Custom report output elements not found');
            return;
        }
        
        // Set report header
        // Dynamically determine the correct organization name
        let orgName = (state.organizationSettings && state.organizationSettings.name) || null;
        try {
            const entities = await fetch('/api/entities').then(r => r.json());
            const topLevel = entities.find(e => e.parent_entity_id === null && e.is_consolidated === true);
            if (topLevel && topLevel.name) {
                orgName = topLevel.name;
            }
        } catch (err) {
            console.error('REPORTS: Failed to fetch top-level organization name:', err);
        }
        orgNameEl.textContent = orgName || 'Nonprofit Organization';
        titleEl.textContent = definition.name || 'Custom Report';
        dateEl.textContent = `As of ${new Date().toLocaleDateString()}`;
        
        // Generate placeholder content
        tableArea.innerHTML = `
            <p>This is a placeholder for custom report "${definition.name || 'Untitled'}".</p>
            <p>In a real implementation, this would analyze the data according to the report definition and generate a table.</p>
        `;
        
        _showReportView('custom-generated-report');
    }

    // --- Public API ---

    const reports = {
        /**
         * Initialize the reports module
         */
        init() {
            console.log('REPORTS: Initializing...');
            
            // Set up event handlers for standard report buttons
            document.querySelectorAll('[data-report]').forEach(button => {
                button.addEventListener('click', function() {
                    const reportType = this.dataset.report;
                    reports.generateStandardReport(reportType);
                });
            });
            
            // Set up event handler for "back to gallery" buttons
            document.querySelectorAll('button[data-action="back-to-gallery"]').forEach(button => {
                button.addEventListener('click', function() {
                    reports.showGallery();
                });
            });
            
            // Set up event handler for "create custom report" button
            const createCustomReportBtn = document.getElementById('create-custom-report-definition');
            if (createCustomReportBtn) {
                createCustomReportBtn.addEventListener('click', function() {
                    reports.openReportBuilder();
                });
            }
            
            console.log('REPORTS: Initialization complete');
        },
        
        /**
         * Generate a standard report
         * @param {string} reportType - The report type identifier
         */
        generateStandardReport(reportType) {
            console.log(`REPORTS: Generating standard report: ${reportType}`);
            
            // We need the app state to generate reports
            const state = window.app ? window.app.getState() : {};
            
            // Generate the requested report
            switch (reportType) {
                case 'financial-position':
                    _generateFinancialPositionReport(state);
                    break;
                case 'activities':
                    _generateActivitiesReport(state);
                    break;
                case 'functional-expenses':
                    _generateFunctionalExpensesReport(state);
                    break;
                case 'budget-vs-actual':
                    _generateBudgetVsActualReport(state);
                    break;
                default:
                    console.error(`REPORTS: Unknown report type: ${reportType}`);
                    alert(`Report type "${reportType}" not found or not yet implemented.`);
            }
        },
        
        /**
         * Open the report builder modal
         */
        openReportBuilder() {
            _openReportBuilder();
        },
        
        /**
         * Run a custom report
         * @param {object} definition - The report definition
         */
        async runCustomReport(definition) {
            const state = window.app ? window.app.getState() : {};
            await _runCustomReport(definition, state);
        },
        
        /**
         * Show the reports gallery (hides all reports)
         */
        showGallery() {
            console.log('REPORTS: Showing reports gallery');
            
            // Hide all report views
            document.querySelectorAll('.report-view').forEach(view => {
                view.classList.remove('active');
            });
            
            // Show the gallery
            const galleryElement = document.getElementById('reports-gallery');
            if (galleryElement) {
                galleryElement.classList.add('active');
            }
            
            // Update the title
            const titleElement = document.getElementById('reports-page-title');
            if (titleElement) {
                titleElement.textContent = 'Financial Reports';
            }
        }
    };
    
    // Expose the public API to the window
    window.reports = reports;
    
    // Auto-initialize when included if document is loaded
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
        console.log('REPORTS: Document already loaded, initializing immediately');
        reports.init();
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            console.log('REPORTS: DOMContentLoaded event fired, initializing');
            reports.init();
        });
    }
    
})(window);
