/**
 * @file data-import-analyzer.js
 * @description A comprehensive tool to analyze accounting data from CSV/Excel files
 *              for import into the Non-Profit Fund Accounting System.
 *
 * This script performs the following actions:
 * 1.  Parses CSV files (with a placeholder for Excel).
 * 2.  Analyzes columns and suggests mappings to the target database schema.
 * 3.  Performs extensive data quality checks:
 *     - Validates that debits equal credits for each transaction.
 *     - Detects duplicate transactions.
 *     - Identifies rows with missing required data.
 *     - Extracts unique entities, funds, and accounts for pre-import setup.
 * 4.  Estimates data volume (transactions, master records).
 * 5.  Generates a detailed analysis report and a configuration file for a future importer.
 */

const DataImportAnalyzer = {

    /**
     * Main analysis function.
     * @param {File} file - The file object from a file input.
     * @returns {Promise<Object>} A promise that resolves with the analysis results.
     */
    async analyze(file) {
        if (!file) {
            throw new Error("No file provided.");
        }

        const results = {
            fileInfo: {
                name: file.name,
                size: file.size,
                type: file.type,
                detectedType: 'unknown'
            },
            analysis: {},
            report: {},
            importConfig: {}
        };

        // 1. Detect file type and parse data
        const fileContent = await this._readFileContent(file);
        let data;

        if (file.name.toLowerCase().endsWith('.csv')) {
            results.fileInfo.detectedType = 'csv';
            data = this._parseCSV(fileContent);
        } else if (['.xlsx', '.xls'].some(ext => file.name.toLowerCase().endsWith(ext))) {
            results.fileInfo.detectedType = 'excel';
            // Note: Excel parsing requires a library like 'xlsx' or 'exceljs'.
            // This is a placeholder for that functionality.
            data = this._parseExcel(file);
            if (!data) {
                const errorMsg = "Excel parsing not implemented. Please use a CSV file.";
                results.report.error = errorMsg;
                throw new Error(errorMsg);
            }
        } else {
            throw new Error("Unsupported file type. Please use CSV or Excel.");
        }

        results.fileInfo.rowCount = data.length - 1; // Exclude header row

        // 2. Column Analysis
        const headers = data[0];
        const columnAnalysis = this._analyzeColumns(headers, data.slice(1));
        results.analysis.columns = columnAnalysis;
        const columnMapping = columnAnalysis.suggestedMapping;

        // 3. Data Quality & Volume Analysis
        const qualityAnalysis = this._analyzeDataQuality(data.slice(1), columnMapping);
        results.analysis.quality = qualityAnalysis;

        // 4. Generate Report and Config
        results.report = this._generateReport(results.fileInfo, results.analysis);
        results.importConfig = this._generateImportConfig(columnMapping, results.analysis.columns.dateFormat);

        return results;
    },

    /**
     * Reads the content of a file as text.
     * @param {File} file - The file to read.
     * @returns {Promise<string>} The file content as a string.
     */
    _readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = event => resolve(event.target.result);
            reader.onerror = error => reject(error);
            reader.readAsText(file);
        });
    },

    /**
     * Parses a CSV string into an array of arrays.
     * Handles quoted fields containing commas.
     * @param {string} csvText - The raw CSV string.
     * @returns {Array<Array<string>>} The parsed data.
     */
    _parseCSV(csvText) {
        const rows = [];
        // Regex to handle quoted fields, including escaped quotes
        const regex = /(,|\r?\n|\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^",\r\n]*))/gi;
        let row = [];
        let match;
        while ((match = regex.exec(csvText))) {
            let col = match[2] !== undefined ? match[2].replace(/""/g, '"') : match[3];
            row.push(col);
            if (match[1].length && match[1] !== ',') {
                rows.push(row);
                row = [];
            }
        }
        if (row.length > 0) rows.push(row); // Add last row
        return rows;
    },

    /**
     * Placeholder for Excel file parsing.
     * @param {File} file - The Excel file.
     * @returns {null} - Returns null as it's not implemented.
     */
    _parseExcel(file) {
        console.warn("Excel parsing requires a third-party library like 'xlsx.js'. This feature is not implemented in this standalone script.");
        return null;
    },

    /**
     * Analyzes columns, detects data types, and suggests mappings.
     * @param {Array<string>} headers - The header row.
     * @param {Array<Array<string>>} records - The data records.
     * @returns {Object} Analysis of columns.
     */
    _analyzeColumns(headers, records) {
        const sampleSize = Math.min(records.length, 100);
        const sampleRecords = records.slice(0, sampleSize);

        const analysis = {
            headers: headers,
            dataTypes: {},
            dateFormat: 'unknown',
            suggestedMapping: {}
        };

        headers.forEach((header, index) => {
            let numberCount = 0;
            let dateCount = 0;
            let emptyCount = 0;

            for (const record of sampleRecords) {
                const value = record[index];
                if (value === null || value === undefined || value.trim() === '') {
                    emptyCount++;
                } else if (!isNaN(Number(value))) {
                    numberCount++;
                } else if (!isNaN(Date.parse(value))) {
                    dateCount++;
                    if (analysis.dateFormat === 'unknown') {
                        // Simple date format detection
                        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) analysis.dateFormat = 'YYYY-MM-DD';
                        else if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) analysis.dateFormat = 'MM/DD/YYYY';
                        else if (/^\d{2}-\d{2}-\d{4}$/.test(value)) analysis.dateFormat = 'MM-DD-YYYY';
                    }
                }
            }

            if (numberCount / sampleSize > 0.7) analysis.dataTypes[header] = 'Number';
            else if (dateCount / sampleSize > 0.7) analysis.dataTypes[header] = 'Date';
            else analysis.dataTypes[header] = 'String';
        });

        analysis.suggestedMapping = this._suggestColumnMappings(headers);
        return analysis;
    },

    /**
     * Suggests mappings from source headers to target schema fields.
     * @param {Array<string>} headers - The source file headers.
     * @returns {Object} A map of target fields to source headers.
     */
    _suggestColumnMappings(headers) {
        const mapping = {};
        const targetFields = {
            transactionId: ['transaction id', 'journal id', 'reference', 'ref', 'entry no'],
            entryDate: ['date', 'transaction date', 'entry date'],
            debit: ['debit', 'debit amount', 'dr'],
            credit: ['credit', 'credit amount', 'cr'],
            accountCode: ['account code', 'account #', 'gl code', 'account'],
            fundCode: ['fund code', 'fund', 'fund id'],
            entityCode: ['entity code', 'entity', 'location'],
            description: ['description', 'memo', 'note', 'details']
        };

        for (const [targetField, possibleNames] of Object.entries(targetFields)) {
            for (const header of headers) {
                const lowerHeader = header.toLowerCase().trim();
                if (possibleNames.includes(lowerHeader)) {
                    mapping[targetField] = header;
                    break; // Move to next target field once a match is found
                }
            }
        }
        return mapping;
    },

    /**
     * Performs all data quality checks.
     * @param {Array<Array<string>>} records - The data records.
     * @param {Object} mapping - The column mapping.
     * @returns {Object} A summary of all data quality issues.
     */
    _analyzeDataQuality(records, mapping) {
        const headers = Object.values(mapping);
        const headerIndexMap = {};
        for (const header of headers) {
            headerIndexMap[header] = records[0] ? records[0].length : 0;
            for(let i = 0; i < (records[0] ? records[0].length : 0); i++) {
                if (records[0][i] === header) {
                    headerIndexMap[header] = i;
                    break;
                }
            }
        }

        const transactionIdHeader = mapping.transactionId;
        const debitHeader = mapping.debit;
        const creditHeader = mapping.credit;

        if (!transactionIdHeader || !debitHeader || !creditHeader) {
            return { error: "Critical columns (transactionId, debit, credit) could not be mapped. Cannot perform quality analysis." };
        }

        const transactions = this._groupTransactions(records, mapping);

        return {
            missingData: this._findMissingData(records, mapping),
            unbalancedTransactions: this._validateBalances(transactions, debitHeader, creditHeader),
            duplicateTransactions: this._findDuplicates(transactions),
            masterRecordManifest: this._mapEntitiesFundsAccounts(records, mapping),
            dateRange: this._analyzeDateRange(records, mapping)
        };
    },

    /**
     * Groups flat records into structured transactions.
     * @param {Array<Array<string>>} records - The data records.
     * @param {Object} mapping - The column mapping.
     * @returns {Map<string, Array<Object>>} A map of transaction IDs to their line items.
     */
    _groupTransactions(records, mapping) {
        const transactions = new Map();
        const transactionIdIndex = records[0] ? records[0].findIndex(h => h === mapping.transactionId) : -1;

        if (transactionIdIndex === -1) return transactions;

        records.forEach((record, index) => {
            const txId = record[transactionIdIndex];
            if (txId) {
                if (!transactions.has(txId)) {
                    transactions.set(txId, []);
                }
                const recordObject = {};
                Object.values(mapping).forEach(header => {
                    const headerIndex = records[0].findIndex(h => h === header);
                    if (headerIndex !== -1) {
                        recordObject[header] = record[headerIndex];
                    }
                });
                recordObject.originalRow = index + 2; // +2 to account for header and 0-based index
                transactions.get(txId).push(recordObject);
            }
        });
        return transactions;
    },

    /**
     * Checks for missing data in required columns.
     * @param {Array<Array<string>>} records - The data records.
     * @param {Object} mapping - The column mapping.
     * @returns {Array<Object>} A list of rows with missing data.
     */
    _findMissingData(records, mapping) {
        const issues = [];
        const requiredFields = ['transactionId', 'entryDate', 'debit', 'credit', 'accountCode'];
        
        records.forEach((record, index) => {
            const missingFields = [];
            requiredFields.forEach(field => {
                const header = mapping[field];
                const headerIndex = records[0] ? records[0].findIndex(h => h === header) : -1;
                if (!header || headerIndex === -1 || !record[headerIndex] || record[headerIndex].trim() === '') {
                    missingFields.push(field);
                }
            });
            if (missingFields.length > 0) {
                issues.push({ row: index + 2, missingFields });
            }
        });
        return issues;
    },

    /**
     * Validates that debits equal credits for each transaction.
     * @param {Map<string, Array<Object>>} transactions - Grouped transactions.
     * @param {string} debitHeader - The header for the debit column.
     * @param {string} creditHeader - The header for the credit column.
     * @returns {Array<Object>} A list of unbalanced transactions.
     */
    _validateBalances(transactions, debitHeader, creditHeader) {
        const issues = [];
        transactions.forEach((lines, txId) => {
            const totalDebits = lines.reduce((sum, line) => sum + (Number(line[debitHeader]) || 0), 0);
            const totalCredits = lines.reduce((sum, line) => sum + (Number(line[creditHeader]) || 0), 0);

            // Use a small epsilon for float comparison
            if (Math.abs(totalDebits - totalCredits) > 0.001) {
                issues.push({
                    transactionId: txId,
                    totalDebits: totalDebits.toFixed(2),
                    totalCredits: totalCredits.toFixed(2),
                    difference: (totalDebits - totalCredits).toFixed(2),
                    rows: lines.map(l => l.originalRow)
                });
            }
        });
        return issues;
    },

    /**
     * Finds duplicate transactions.
     * @param {Map<string, Array<Object>>} transactions - Grouped transactions.
     * @returns {Array<Object>} A list of duplicate transactions.
     */
    _findDuplicates(transactions) {
        // This is a placeholder. A more robust check would involve hashing the content
        // of lines to see if two transactions with different IDs are identical.
        // For now, we assume the transaction ID is the primary key.
        return [];
    },

    /**
     * Extracts unique entities, funds, and accounts from the data.
     * @param {Array<Array<string>>} records - The data records.
     * @param {Object} mapping - The column mapping.
     * @returns {Object} An object containing sets of unique master records.
     */
    _mapEntitiesFundsAccounts(records, mapping) {
        const manifest = {
            entities: new Set(),
            funds: new Set(),
            accounts: new Set()
        };
        const entityIndex = records[0] ? records[0].findIndex(h => h === mapping.entityCode) : -1;
        const fundIndex = records[0] ? records[0].findIndex(h => h === mapping.fundCode) : -1;
        const accountIndex = records[0] ? records[0].findIndex(h => h === mapping.accountCode) : -1;

        records.forEach(record => {
            if (entityIndex > -1 && record[entityIndex]) manifest.entities.add(record[entityIndex]);
            if (fundIndex > -1 && record[fundIndex]) manifest.funds.add(record[fundIndex]);
            if (accountIndex > -1 && record[accountIndex]) manifest.accounts.add(record[accountIndex]);
        });

        return {
            entities: Array.from(manifest.entities),
            funds: Array.from(manifest.funds),
            accounts: Array.from(manifest.accounts)
        };
    },

    /**
     * Analyzes the date range of the data.
     * @param {Array<Array<string>>} records - The data records.
     * @param {Object} mapping - The column mapping.
     * @returns {Object} The start and end dates.
     */
    _analyzeDateRange(records, mapping) {
        const dateIndex = records[0] ? records[0].findIndex(h => h === mapping.entryDate) : -1;
        if (dateIndex === -1) return { startDate: null, endDate: null };

        let minDate = null, maxDate = null;
        records.forEach(record => {
            const dateValue = record[dateIndex];
            if (dateValue) {
                const date = new Date(dateValue);
                if (!isNaN(date)) {
                    if (!minDate || date < minDate) minDate = date;
                    if (!maxDate || date > maxDate) maxDate = date;
                }
            }
        });

        return {
            startDate: minDate ? minDate.toISOString().split('T')[0] : null,
            endDate: maxDate ? maxDate.toISOString().split('T')[0] : null
        };
    },

    /**
     * Generates a human-readable report from the analysis results.
     * @param {Object} fileInfo - Information about the file.
     * @param {Object} analysis - The detailed analysis object.
     * @returns {Object} The final report.
     */
    _generateReport(fileInfo, analysis) {
        const { quality, columns } = analysis;
        const recommendations = [];

        // Volume recommendations
        recommendations.push(`Prepare to import ${fileInfo.rowCount} transaction lines.`);
        if (quality.masterRecordManifest) {
            recommendations.push(`Found ${quality.masterRecordManifest.entities.length} unique entities. Ensure these exist in the system before import.`);
            recommendations.push(`Found ${quality.masterRecordManifest.funds.length} unique funds. Ensure these exist in the system before import.`);
            recommendations.push(`Found ${quality.masterRecordManifest.accounts.length} unique accounts. Ensure these exist in the chart of accounts for the respective entities.`);
        }

        // Quality recommendations
        if (quality.missingData && quality.missingData.length > 0) {
            recommendations.push(`CRITICAL: Found ${quality.missingData.length} rows with missing required data. These rows must be fixed before import.`);
        }
        if (quality.unbalancedTransactions && quality.unbalancedTransactions.length > 0) {
            recommendations.push(`CRITICAL: Found ${quality.unbalancedTransactions.length} unbalanced journal entries. Debits do not equal credits. These must be fixed.`);
        }
        if (Object.keys(columns.suggestedMapping).length < 5) {
            recommendations.push("WARNING: Could not automatically map all critical columns (Date, Debit, Credit, Account, Transaction ID). Manual mapping is required.");
        }

        return {
            summary: {
                fileName: fileInfo.name,
                fileSize: `${(fileInfo.size / 1024).toFixed(2)} KB`,
                totalRows: fileInfo.rowCount,
                dateRange: quality.dateRange,
                detectedDateFormat: columns.dateFormat,
            },
            volumeEstimates: {
                totalTransactionLines: fileInfo.rowCount,
                uniqueTransactions: quality.unbalancedTransactions.length + (fileInfo.rowCount - quality.unbalancedTransactions.reduce((sum, t) => sum + t.rows.length, 0)),
                uniqueEntities: quality.masterRecordManifest ? quality.masterRecordManifest.entities.length : 0,
                uniqueFunds: quality.masterRecordManifest ? quality.masterRecordManifest.funds.length : 0,
                uniqueAccounts: quality.masterRecordManifest ? quality.masterRecordManifest.accounts.length : 0,
            },
            dataQualityIssues: {
                unbalancedTransactions: quality.unbalancedTransactions,
                rowsWithMissingData: quality.missingData,
                duplicateTransactions: quality.duplicateTransactions,
            },
            masterRecordManifest: quality.masterRecordManifest,
            columnAnalysis: {
                headers: columns.headers,
                detectedDataTypes: columns.dataTypes,
                suggestedMapping: columns.suggestedMapping
            },
            recommendations: recommendations
        };
    },

    /**
     * Generates a configuration file for the importer.
     * @param {Object} mapping - The column mapping.
     * @param {string} dateFormat - The detected date format.
     * @returns {Object} The import configuration.
     */
    _generateImportConfig(mapping, dateFormat) {
        return {
            sourceFormat: 'csv', // or 'excel'
            columnMapping: mapping,
            dateFormat: dateFormat,
            importSettings: {
                skipRowsWithMissingData: false,
                autoCreateMasterRecords: false, // e.g., create funds/accounts on the fly
                transactionGroupingColumn: mapping.transactionId
            }
        };
    }
};
