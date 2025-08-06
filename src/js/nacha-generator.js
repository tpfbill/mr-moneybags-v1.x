/**
 * nacha-generator.js
 * 
 * NACHA (National Automated Clearing House Association) file generator
 * for the Nonprofit Fund Accounting System
 * 
 * This module handles the generation of NACHA files for vendor payments,
 * following the ACH file format specifications.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * NACHA File Generator class
 * Handles creation of ACH files in NACHA format
 */
class NachaGenerator {
  constructor(options = {}) {
    // Default settings
    this.settings = {
      // File header settings
      immediateDestination: '',      // Receiving bank routing number (your bank)
      immediateOrigin: '',           // Company identification number
      fileCreationDate: this._formatDate(new Date()), // Today's date YYMMDD
      fileCreationTime: this._formatTime(new Date()), // Current time HHMM
      fileIdModifier: 'A',           // File modifier (incremented for multiple files same day)
      blockingFactor: '10',          // Standard blocking factor
      formatCode: '1',               // Always '1'
      
      // Batch header settings
      companyName: '',               // Your company name (max 16 chars)
      companyDiscretionaryData: '',  // Optional data
      companyIdentification: '',     // Tax ID or NACHA assigned ID
      standardEntryClassCode: 'CCD', // CCD for vendor payments
      companyEntryDescription: 'PAYMENT',  // Description (e.g., PAYROLL, VENDOR)
      companyDescriptiveDate: '',    // Descriptive date (YYMMDD)
      effectiveEntryDate: '',        // Effective date (YYMMDD)
      originatorStatusCode: '1',     // 1 = originator
      originatingDFIId: '',          // Bank routing number
      
      // Production or test indicator
      isProduction: false,
      
      // Record size and padding
      recordSize: 94,
      
      // Override with provided options
      ...options
    };
    
    // Initialize file components
    this.fileHeader = '';
    this.batches = [];
    this.fileControl = '';
    this.currentBatchNumber = 1;
    this.totalEntryCount = 0;
    this.totalEntryHash = 0;
    this.totalDebitAmount = 0;
    this.totalCreditAmount = 0;
    this.blockCount = 0;
  }
  
  /**
   * Create a new batch of entries
   * @param {Object} batchOptions - Batch header options
   * @returns {Object} Batch object
   */
  createBatch(batchOptions = {}) {
    const batchNumber = this.currentBatchNumber++;
    
    const batch = {
      header: {
        serviceClassCode: '200',     // 200 = mixed debits and credits
        companyName: this.settings.companyName,
        companyDiscretionaryData: this.settings.companyDiscretionaryData,
        companyIdentification: this.settings.companyIdentification,
        standardEntryClassCode: this.settings.standardEntryClassCode,
        companyEntryDescription: this.settings.companyEntryDescription,
        companyDescriptiveDate: this.settings.companyDescriptiveDate || this.settings.fileCreationDate,
        effectiveEntryDate: this.settings.effectiveEntryDate || this.settings.fileCreationDate,
        settlementDate: '   ',       // Left blank, filled by ACH operator
        originatorStatusCode: this.settings.originatorStatusCode,
        originatingDFIId: this.settings.originatingDFIId,
        batchNumber: batchNumber.toString().padStart(7, '0'),
        ...batchOptions
      },
      entries: [],
      entryCount: 0,
      entryHash: 0,
      totalDebitAmount: 0,
      totalCreditAmount: 0,
      control: {}
    };
    
    this.batches.push(batch);
    return batch;
  }
  
  /**
   * Add an entry (payment) to a batch
   * @param {Object} batch - The batch to add the entry to
   * @param {Object} entryData - Entry details
   * @returns {Object} The updated batch
   */
  addEntry(batch, entryData) {
    // Validate required fields
    this._validateEntryData(entryData);
    
    // Format amounts to cents without decimal
    const amount = Math.round(parseFloat(entryData.amount) * 100).toString().padStart(10, '0');
    
    // Calculate trace number
    const traceNumber = this._generateTraceNumber(batch.entries.length + 1);
    
    // Create entry detail record
    const entry = {
      recordTypeCode: '6',           // 6 = entry detail
      transactionCode: entryData.transactionCode || '22', // 22 = checking credit
      receivingDFIId: entryData.routingNumber.substring(0, 8), // First 8 digits of routing number
      checkDigit: entryData.routingNumber.substring(8, 9),     // 9th digit of routing number
      DFIAccountNumber: entryData.accountNumber.padEnd(17, ' ').substring(0, 17),
      amount: amount,
      receivingCompanyId: entryData.receivingCompanyId || entryData.vendorId.padEnd(15, ' ').substring(0, 15),
      receivingCompanyName: entryData.receivingCompanyName.padEnd(22, ' ').substring(0, 22),
      discretionaryData: '  ',       // Optional
      addendaRecordIndicator: entryData.addenda ? '1' : '0',
      traceNumber: traceNumber,
      addenda: entryData.addenda ? this._createAddendaRecord(entryData.addenda, traceNumber) : null
    };
    
    // Update batch totals
    batch.entries.push(entry);
    batch.entryCount += 1;
    if (entryData.addenda) {
      batch.entryCount += 1; // Count addenda record
    }
    
    // Add to hash (sum of routing numbers)
    const routingNumberValue = parseInt(entryData.routingNumber.substring(0, 8), 10);
    batch.entryHash += routingNumberValue;
    
    // Update debit/credit totals
    if (entryData.transactionCode && ['27', '37', '28', '38'].includes(entryData.transactionCode)) {
      batch.totalDebitAmount += parseFloat(entryData.amount);
    } else {
      batch.totalCreditAmount += parseFloat(entryData.amount);
    }
    
    return batch;
  }
  
  /**
   * Generate the complete NACHA file content
   * @returns {string} NACHA file content
   */
  generateFile() {
    // Create file header
    this.fileHeader = this._createFileHeader();
    
    let fileContent = this.fileHeader;
    let entryCount = 0;
    let entryHash = 0;
    
    // Process each batch
    this.batches.forEach(batch => {
      // Create batch header
      const batchHeader = this._createBatchHeader(batch);
      fileContent += batchHeader;
      
      // Add all entries in the batch
      batch.entries.forEach(entry => {
        const entryDetail = this._createEntryDetail(entry);
        fileContent += entryDetail;
        
        // Add addenda if exists
        if (entry.addenda) {
          fileContent += entry.addenda;
        }
      });
      
      // Create batch control record
      const batchControl = this._createBatchControl(batch);
      fileContent += batchControl;
      
      // Update file totals
      entryCount += batch.entryCount;
      entryHash += batch.entryHash % 10000000000; // Modulo 10 billion
      this.totalDebitAmount += batch.totalDebitAmount;
      this.totalCreditAmount += batch.totalCreditAmount;
    });
    
    // Store totals for file control record
    this.totalEntryCount = entryCount;
    this.totalEntryHash = entryHash % 10000000000; // Modulo 10 billion
    
    // Create file control record
    this.fileControl = this._createFileControl();
    fileContent += this.fileControl;
    
    // Add file padding to block size if needed
    const blockLines = Math.ceil((fileContent.length / this.settings.recordSize) / 10) * 10;
    const currentLines = fileContent.length / this.settings.recordSize;
    const paddingLines = blockLines - currentLines;
    
    // Add padding records (9's) if needed
    if (paddingLines > 0) {
      for (let i = 0; i < paddingLines; i++) {
        fileContent += '9'.repeat(this.settings.recordSize);
      }
    }
    
    return fileContent;
  }
  
  /**
   * Write NACHA file to disk
   * @param {string} filePath - Path to write the file
   * @returns {Promise} Promise resolving to the file path
   */
  async writeFile(filePath) {
    const fileContent = this.generateFile();
    
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, fileContent, 'utf8', (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    });
  }
  
  /**
   * Create the file header record (Type 1)
   * @returns {string} Formatted file header record
   */
  _createFileHeader() {
    // Build the file header record
    return [
      '1',                                // Record Type Code
      '01',                               // Priority Code
      ` ${this.settings.immediateDestination.padStart(9, '0')}`,  // Immediate Destination
      ` ${this.settings.immediateOrigin.padStart(9, '0')}`,       // Immediate Origin
      this.settings.fileCreationDate,     // File Creation Date
      this.settings.fileCreationTime,     // File Creation Time
      this.settings.fileIdModifier,       // File ID Modifier
      this.settings.recordSize,           // Record Size
      this.settings.blockingFactor,       // Blocking Factor
      this.settings.formatCode,           // Format Code
      this.settings.companyName.padEnd(23, ' ').substring(0, 23), // Destination Name
      'NONPROFIT FUND ACCT    '.substring(0, 23),   // Origin Name
      '        '                          // Reference Code (optional)
    ].join('').padEnd(this.settings.recordSize, ' ');
  }
  
  // Additional helper methods would continue here...
  _formatDate(date) {
    const year = date.getFullYear().toString().substring(2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return year + month + day;
  }
  
  _formatTime(date) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return hours + minutes;
  }

  /* ------------------------------------------------------------------ *
   * Helper / builder methods                                           *
   * ------------------------------------------------------------------ */

  _createBatchHeader(batch) {
    return [
      '5',
      batch.header.serviceClassCode,
      batch.header.companyName.padEnd(16, ' ').substring(0, 16),
      batch.header.companyDiscretionaryData.padEnd(20, ' ').substring(0, 20),
      batch.header.companyIdentification.padStart(10, '0').substring(0, 10),
      batch.header.standardEntryClassCode,
      batch.header.companyEntryDescription.padEnd(10, ' ').substring(0, 10),
      batch.header.companyDescriptiveDate.padEnd(6, ' '),
      batch.header.effectiveEntryDate.padEnd(6, ' '),
      batch.header.settlementDate,               // blank
      batch.header.originatorStatusCode,
      batch.header.originatingDFIId.padStart(8, '0'),
      batch.header.batchNumber
    ].join('').padEnd(this.settings.recordSize, ' ');
  }

  _createEntryDetail(entry) {
    return [
      '6',
      entry.transactionCode,
      entry.receivingDFIId,
      entry.checkDigit,
      entry.DFIAccountNumber,
      entry.amount,
      entry.receivingCompanyId,
      entry.receivingCompanyName,
      entry.discretionaryData,
      entry.addendaRecordIndicator,
      entry.traceNumber
    ].join('').padEnd(this.settings.recordSize, ' ');
  }

  _createAddendaRecord(addendaInfo, traceNumber) {
    const addendaTypeCode = '05';
    const addendaSequenceNumber = '0001';
    const entrySeq = traceNumber.substring(traceNumber.length - 7);
    return [
      '7',
      addendaTypeCode,
      addendaInfo.padEnd(80, ' ').substring(0, 80),
      addendaSequenceNumber,
      entrySeq
    ].join('').padEnd(this.settings.recordSize, ' ');
  }

  _createBatchControl(batch) {
    const totalDebit = Math.round(batch.totalDebitAmount * 100).toString().padStart(12, '0');
    const totalCredit = Math.round(batch.totalCreditAmount * 100).toString().padStart(12, '0');
    const entryHash = (batch.entryHash % 10000000000).toString().padStart(10, '0');
    return [
      '8',
      batch.header.serviceClassCode,
      batch.entryCount.toString().padStart(6, '0'),
      entryHash,
      totalDebit,
      totalCredit,
      batch.header.companyIdentification.padStart(10, '0').substring(0, 10),
      ''.padEnd(19, ' '),                     // message authentication code
      ''.padEnd(6, ' '),                      // reserved
      batch.header.originatingDFIId.padStart(8, '0'),
      batch.header.batchNumber
    ].join('').padEnd(this.settings.recordSize, ' ');
  }

  _createFileControl() {
    const totalDebit = Math.round(this.totalDebitAmount * 100).toString().padStart(12, '0');
    const totalCredit = Math.round(this.totalCreditAmount * 100).toString().padStart(12, '0');
    const entryHash = this.totalEntryHash.toString().padStart(10, '0');
    const recordCount = 2 + this.totalEntryCount + (this.batches.length * 2);
    this.blockCount = Math.ceil(recordCount / 10);
    return [
      '9',
      this.batches.length.toString().padStart(6, '0'),
      this.blockCount.toString().padStart(6, '0'),
      this.totalEntryCount.toString().padStart(8, '0'),
      entryHash,
      totalDebit,
      totalCredit,
      ''.padEnd(39, ' ')
    ].join('').padEnd(this.settings.recordSize, ' ');
  }

  _generateTraceNumber(entrySequence) {
    const routingPrefix = this.settings.originatingDFIId.padStart(8, '0').substring(0, 8);
    const sequence = entrySequence.toString().padStart(7, '0');
    return routingPrefix + sequence;
  }

  _validateFileSettings() {
    const required = [
      'immediateDestination',
      'immediateOrigin',
      'companyName',
      'companyIdentification',
      'originatingDFIId'
    ];
    const missing = required.filter(r => !this.settings[r]);
    if (missing.length) {
      throw new Error(`Missing NACHA settings: ${missing.join(', ')}`);
    }
    if (!/^\d{9}$/.test(this.settings.immediateDestination)) {
      throw new Error('immediateDestination must be 9 digits');
    }
    if (!/^\d{8}$/.test(this.settings.originatingDFIId)) {
      throw new Error('originatingDFIId must be 8 digits');
    }
  }

  _validateEntryData(data) {
    const required = ['routingNumber', 'accountNumber', 'amount', 'receivingCompanyName', 'vendorId'];
    const missing = required.filter(f => !data[f]);
    if (missing.length) {
      throw new Error(`Missing entry fields: ${missing.join(', ')}`);
    }
    if (!NachaGenerator.validateRoutingNumber(data.routingNumber)) {
      throw new Error('Invalid routing number');
    }
    if (isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
      throw new Error('Amount must be positive');
    }
    if (data.accountNumber.length < 1 || data.accountNumber.length > 17) {
      throw new Error('Account number length invalid');
    }
  }

  /* -------- Static helpers -------- */
  static validateRoutingNumber(rn) {
    if (!/^\d{9}$/.test(rn)) return false;
    const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
    const sum = rn.split('').reduce((s, d, i) => s + (parseInt(d, 10) * w[i]), 0);
    return sum % 10 === 0;
  }
}

/* -------------------------------------------------------------------- *
 * Constants                                                            *
 * -------------------------------------------------------------------- */
NachaGenerator.TRANSACTION_CODES = {
  CHECKING_CREDIT: '22',
  SAVINGS_CREDIT:  '32',
  GL_CREDIT:       '42',
  CHECKING_DEBIT:  '27',
  SAVINGS_DEBIT:   '37',
  GL_DEBIT:        '47'
};

NachaGenerator.SERVICE_CLASS_CODES = {
  MIXED:        '200',
  CREDITS_ONLY: '220',
  DEBITS_ONLY:  '225'
};

NachaGenerator.ENTRY_CLASS_CODES = {
  CCD: 'CCD',
  PPD: 'PPD',
  CTX: 'CTX',
  WEB: 'WEB'
};

module.exports = NachaGenerator;
