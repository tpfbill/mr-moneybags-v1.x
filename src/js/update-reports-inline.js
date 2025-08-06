/**
 * This script updates the index.html file to include all report templates inline
 * and removes the need for fix-reports.js
 */

const fs = require('fs');
const path = require('path');

// Read the current index.html
const indexPath = path.join(__dirname, 'index.html');
let indexContent = fs.readFileSync(indexPath, 'utf8');

// Find where the financial-position-report ends
const reportEndPosition = indexContent.indexOf('</div>', indexContent.indexOf('</tbody>', indexContent.indexOf('financial-position-report'))) + 6;

// Insert the additional report templates after the financial-position-report
const additionalReports = `
            <!-- Statement of Activities Report -->
            <div id="activities-report" class="report-view">
              <div class="report-actions">
                <button class="btn-secondary" data-action="back-to-gallery">Back to Reports</button>
                <div class="report-tools">
                  <button class="action-button">Print</button>
                  <button class="action-button">Export PDF</button>
                  <button class="action-button">Export Excel</button>
                </div>
              </div>
              <div class="report-container">
                <div class="report-header">
                  <div class="report-title">Community Nonprofit Organization</div>
                  <div class="report-subtitle">Statement of Activities</div>
                  <div class="report-date">For the Period Ended June 30, 2025</div>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Revenue and Support</th>
                      <th class="text-right">Without Donor Restrictions</th>
                      <th class="text-right">With Donor Restrictions</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Contributions and Grants</td>
                      <td class="text-right">$250,000.00</td>
                      <td class="text-right">$75,000.00</td>
                      <td class="text-right">$325,000.00</td>
                    </tr>
                    <tr>
                      <td>Program Service Fees</td>
                      <td class="text-right">$35,000.00</td>
                      <td class="text-right">$0.00</td>
                      <td class="text-right">$35,000.00</td>
                    </tr>
                    <tr>
                      <td>Investment Income</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">$0.00</td>
                      <td class="text-right">$5,000.00</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Total Revenue and Support</td>
                      <td class="text-right">$290,000.00</td>
                      <td class="text-right">$75,000.00</td>
                      <td class="text-right">$365,000.00</td>
                    </tr>
                  </tbody>
                </table>
                
                <table class="data-table mt-20">
                  <thead>
                    <tr>
                      <th>Expenses</th>
                      <th class="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Program Services</td>
                      <td class="text-right">$100,000.00</td>
                    </tr>
                    <tr>
                      <td>Management and General</td>
                      <td class="text-right">$25,000.00</td>
                    </tr>
                    <tr>
                      <td>Fundraising</td>
                      <td class="text-right">$15,000.00</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Total Expenses</td>
                      <td class="text-right">$140,000.00</td>
                    </tr>
                  </tbody>
                </table>
                
                <table class="data-table mt-20">
                  <thead>
                    <tr>
                      <th>Change in Net Assets</th>
                      <th class="text-right">Without Donor Restrictions</th>
                      <th class="text-right">With Donor Restrictions</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="font-weight-bold">
                      <td>Change in Net Assets</td>
                      <td class="text-right">$150,000.00</td>
                      <td class="text-right">$75,000.00</td>
                      <td class="text-right">$225,000.00</td>
                    </tr>
                    <tr>
                      <td>Net Assets, Beginning of Year</td>
                      <td class="text-right">$100,000.00</td>
                      <td class="text-right">$25,000.00</td>
                      <td class="text-right">$125,000.00</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Net Assets, End of Year</td>
                      <td class="text-right">$250,000.00</td>
                      <td class="text-right">$100,000.00</td>
                      <td class="text-right">$350,000.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Statement of Functional Expenses Report -->
            <div id="functional-expenses-report" class="report-view">
              <div class="report-actions">
                <button class="btn-secondary" data-action="back-to-gallery">Back to Reports</button>
                <div class="report-tools">
                  <button class="action-button">Print</button>
                  <button class="action-button">Export PDF</button>
                  <button class="action-button">Export Excel</button>
                </div>
              </div>
              <div class="report-container">
                <div class="report-header">
                  <div class="report-title">Community Nonprofit Organization</div>
                  <div class="report-subtitle">Statement of Functional Expenses</div>
                  <div class="report-date">For the Year Ended June 30, 2025</div>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Expense</th>
                      <th class="text-right">Program Services</th>
                      <th class="text-right">Management & General</th>
                      <th class="text-right">Fundraising</th>
                      <th class="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Salaries and Wages</td>
                      <td class="text-right">$60,000.00</td>
                      <td class="text-right">$15,000.00</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">$80,000.00</td>
                    </tr>
                    <tr>
                      <td>Professional Fees</td>
                      <td class="text-right">$10,000.00</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$17,000.00</td>
                    </tr>
                    <tr>
                      <td>Supplies</td>
                      <td class="text-right">$15,000.00</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$3,000.00</td>
                      <td class="text-right">$20,000.00</td>
                    </tr>
                    <tr>
                      <td>Occupancy</td>
                      <td class="text-right">$8,000.00</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$1,000.00</td>
                      <td class="text-right">$11,000.00</td>
                    </tr>
                    <tr>
                      <td>Travel</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">$1,000.00</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$8,000.00</td>
                    </tr>
                    <tr>
                      <td>Other Expenses</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$0.00</td>
                      <td class="text-right">$2,000.00</td>
                      <td class="text-right">$4,000.00</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Total Expenses</td>
                      <td class="text-right">$100,000.00</td>
                      <td class="text-right">$25,000.00</td>
                      <td class="text-right">$15,000.00</td>
                      <td class="text-right">$140,000.00</td>
                    </tr>
                    <tr>
                      <td>Percentage</td>
                      <td class="text-right">71.4%</td>
                      <td class="text-right">17.9%</td>
                      <td class="text-right">10.7%</td>
                      <td class="text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Budget vs. Actual Report -->
            <div id="budget-vs-actual-report" class="report-view">
              <div class="report-actions">
                <button class="btn-secondary" data-action="back-to-gallery">Back to Reports</button>
                <div class="report-tools">
                  <button class="action-button">Print</button>
                  <button class="action-button">Export PDF</button>
                  <button class="action-button">Export Excel</button>
                </div>
              </div>
              <div class="report-container">
                <div class="report-header">
                  <div class="report-title">Community Nonprofit Organization</div>
                  <div class="report-subtitle">Budget vs. Actual Report</div>
                  <div class="report-date">For the Year Ended June 30, 2025</div>
                </div>
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th class="text-right">Budget</th>
                      <th class="text-right">Actual</th>
                      <th class="text-right">Variance</th>
                      <th class="text-right">% Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><strong>Revenue</strong></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                    </tr>
                    <tr>
                      <td>Contributions and Grants</td>
                      <td class="text-right">$300,000.00</td>
                      <td class="text-right">$325,000.00</td>
                      <td class="text-right">$25,000.00</td>
                      <td class="text-right">8.3%</td>
                    </tr>
                    <tr>
                      <td>Program Service Fees</td>
                      <td class="text-right">$40,000.00</td>
                      <td class="text-right">$35,000.00</td>
                      <td class="text-right">($5,000.00)</td>
                      <td class="text-right">-12.5%</td>
                    </tr>
                    <tr>
                      <td>Investment Income</td>
                      <td class="text-right">$10,000.00</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">($5,000.00)</td>
                      <td class="text-right">-50.0%</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Total Revenue</td>
                      <td class="text-right">$350,000.00</td>
                      <td class="text-right">$365,000.00</td>
                      <td class="text-right">$15,000.00</td>
                      <td class="text-right">4.3%</td>
                    </tr>
                    <tr>
                      <td><strong>Expenses</strong></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                      <td class="text-right"></td>
                    </tr>
                    <tr>
                      <td>Program Services</td>
                      <td class="text-right">$120,000.00</td>
                      <td class="text-right">$100,000.00</td>
                      <td class="text-right">$20,000.00</td>
                      <td class="text-right">16.7%</td>
                    </tr>
                    <tr>
                      <td>Management and General</td>
                      <td class="text-right">$30,000.00</td>
                      <td class="text-right">$25,000.00</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">16.7%</td>
                    </tr>
                    <tr>
                      <td>Fundraising</td>
                      <td class="text-right">$20,000.00</td>
                      <td class="text-right">$15,000.00</td>
                      <td class="text-right">$5,000.00</td>
                      <td class="text-right">25.0%</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Total Expenses</td>
                      <td class="text-right">$170,000.00</td>
                      <td class="text-right">$140,000.00</td>
                      <td class="text-right">$30,000.00</td>
                      <td class="text-right">17.6%</td>
                    </tr>
                    <tr class="font-weight-bold">
                      <td>Net Surplus/(Deficit)</td>
                      <td class="text-right">$180,000.00</td>
                      <td class="text-right">$225,000.00</td>
                      <td class="text-right">$45,000.00</td>
                      <td class="text-right">25.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
            <!-- Custom Generated Report -->
            <div id="custom-generated-report" class="report-view">
              <div class="report-actions">
                <button class="btn-secondary" data-action="back-to-gallery">Back to Reports</button>
                <div class="report-tools">
                  <button class="action-button">Print</button>
                  <button class="action-button">Export PDF</button>
                  <button class="action-button">Export Excel</button>
                </div>
              </div>
              <div class="report-container">
                <div class="report-header">
                  <div id="custom-report-output-org-name" class="report-title">Community Nonprofit Organization</div>
                  <div id="custom-report-output-title" class="report-subtitle">Custom Report</div>
                  <div id="custom-report-output-date" class="report-date">Generated on June 30, 2025</div>
                </div>
                <div id="custom-report-output-table-area">
                  <p>This is a placeholder for a custom report.</p>
                </div>
              </div>
            </div>`;

// Add the additional reports after the financial-position-report
const updatedContent = indexContent.substring(0, reportEndPosition) + additionalReports + indexContent.substring(reportEndPosition);

// Remove the fix-reports.js script reference
const fixReportsScriptPattern = /<script src="fix-reports.js"><\/script>/;
const finalContent = updatedContent.replace(fixReportsScriptPattern, '');

// Write the updated content back to the file
fs.writeFileSync(indexPath, finalContent);

console.log('index.html has been updated with inline report templates and fix-reports.js script has been removed');
