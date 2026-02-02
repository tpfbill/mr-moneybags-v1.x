/**
 * Journal Entries Import API
 * Handles xlsx file upload and import of journal entries
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { pool } = require('../database/connection');
const { asyncHandler } = require('../utils/helpers');

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/je-imports/' });

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/je-imports');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Parse xlsx file
function parseXlsx(filePath) {
    const tempDir = `/tmp/xlsx_extract_${Date.now()}`;
    execSync(`mkdir -p ${tempDir}`);
    execSync(`unzip -q "${filePath}" -d ${tempDir}`);
    
    // Read shared strings
    const ssXml = fs.readFileSync(`${tempDir}/xl/sharedStrings.xml`, 'utf8');
    const strings = [];
    
    const siMatches = ssXml.matchAll(/<si>(.*?)<\/si>/gs);
    for (const siMatch of siMatches) {
        const siContent = siMatch[1];
        const textParts = [];
        const tMatches = siContent.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
        for (const tMatch of tMatches) {
            textParts.push(tMatch[1]);
        }
        strings.push(textParts.join(''));
    }
    
    // Read sheet1
    const sheetXml = fs.readFileSync(`${tempDir}/xl/worksheets/sheet1.xml`, 'utf8');
    
    const rows = [];
    const rowMatches = sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs);
    
    for (const rowMatch of rowMatches) {
        const rowNum = parseInt(rowMatch[1]);
        const rowContent = rowMatch[2];
        const cells = {};
        
        const cellMatches = rowContent.matchAll(/<c\s+([^>]*)>(.*?)<\/c>/gs);
        for (const cellMatch of cellMatches) {
            const attrs = cellMatch[1];
            const cellContent = cellMatch[2];
            
            const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
            if (!refMatch) continue;
            const col = refMatch[1];
            
            const typeMatch = attrs.match(/t="([^"]*)"/);
            const cellType = typeMatch ? typeMatch[1] : '';
            
            const valMatch = cellContent.match(/<v>([^<]*)<\/v>/);
            let val = valMatch ? valMatch[1] : '';
            
            if (cellType === 's' && val !== '') {
                const idx = parseInt(val);
                val = (idx >= 0 && idx < strings.length) ? strings[idx] : val;
            }
            
            cells[col] = val;
        }
        rows.push({ rowNum, cells });
    }
    
    execSync(`rm -rf ${tempDir}`);
    return rows;
}

// Parse date from Excel
function parseDate(val) {
    if (!val) return null;
    if (typeof val === 'string' && val.includes('/')) {
        const parts = val.split('/');
        if (parts.length === 3) {
            const [m, d, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
        const excelEpoch = new Date(1899, 11, 30);
        const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }
    return null;
}

function parseAmount(val) {
    if (!val || val === '') return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function parseAccountNumber(accountStr) {
    if (!accountStr) return null;
    const parts = accountStr.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const codeParts = parts.length >= 5 ? parts.slice(0, 4) : parts;
    const account_code = codeParts.join(' ');
    return {
        entity_code: parts[0],
        gl_code: parts[1],
        fund_number: parts[2],
        restriction: parts[3] || '00',
        account_code: account_code
    };
}

// POST /api/journal-entries-import/analyze
router.post('/analyze', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const filePath = req.file.path;
    
    try {
        const rows = parseXlsx(filePath);
        const dataRows = rows.filter(r => r.rowNum >= 4);
        
        // Group by JE number
        const jeGroups = new Map();
        
        for (const row of dataRows) {
            const { cells } = row;
            if (cells.A && cells.A.startsWith('This journal entry')) continue;
            const jeNum = cells.E;
            if (!jeNum || !cells.H) continue;
            
            if (!jeGroups.has(jeNum)) {
                jeGroups.set(jeNum, {
                    jeNum,
                    date: cells.A,
                    reference: cells.F || `JE-${jeNum}`,
                    description: cells.G || cells.F || '',
                    lines: []
                });
            }
            
            const debit = parseAmount(cells.L);
            const credit = parseAmount(cells.M);
            if (debit === 0 && credit === 0) continue;
            
            const parsed = parseAccountNumber(cells.H);
            if (!parsed) continue;
            
            jeGroups.get(jeNum).lines.push({
                accountCode: parsed.account_code,
                entityCode: parsed.entity_code,
                glCode: parsed.gl_code,
                fundNumber: parsed.fund_number,
                accountDesc: cells.I || '',
                debit,
                credit
            });
        }
        
        // Check for existing entries and validate accounts
        const results = [];
        const client = await pool.connect();
        
        try {
            for (const [jeNum, je] of jeGroups) {
                const result = {
                    jeNum,
                    reference: je.reference,
                    description: je.description,
                    date: parseDate(je.date),
                    lineCount: je.lines.length,
                    totalDebits: je.lines.reduce((s, l) => s + l.debit, 0),
                    totalCredits: je.lines.reduce((s, l) => s + l.credit, 0),
                    status: 'ready',
                    issues: []
                };
                
                // Check if already exists
                const existing = await client.query(
                    'SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1',
                    [je.reference]
                );
                if (existing.rows.length > 0) {
                    result.status = 'exists';
                    result.issues.push('Already imported');
                }
                
                // Check accounts exist
                if (result.status === 'ready') {
                    for (const line of je.lines) {
                        const acc = await client.query(
                            'SELECT id FROM accounts WHERE account_code = $1 LIMIT 1',
                            [line.accountCode]
                        );
                        if (acc.rows.length === 0) {
                            result.status = 'error';
                            result.issues.push(`Account not found: ${line.accountCode}`);
                            break;
                        }
                    }
                }
                
                results.push(result);
            }
        } finally {
            client.release();
        }
        
        // Clean up uploaded file
        fs.unlinkSync(filePath);
        
        const summary = {
            total: results.length,
            ready: results.filter(r => r.status === 'ready').length,
            exists: results.filter(r => r.status === 'exists').length,
            errors: results.filter(r => r.status === 'error').length
        };
        
        res.json({ summary, entries: results });
        
    } catch (err) {
        fs.unlinkSync(filePath);
        throw err;
    }
}));

// POST /api/journal-entries-import/run
router.post('/run', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const importStatus = req.body.status || 'Pending';
    const filePath = req.file.path;
    
    try {
        const rows = parseXlsx(filePath);
        const dataRows = rows.filter(r => r.rowNum >= 4);
        
        // Group by JE number
        const jeGroups = new Map();
        
        for (const row of dataRows) {
            const { cells } = row;
            if (cells.A && cells.A.startsWith('This journal entry')) continue;
            const jeNum = cells.E;
            if (!jeNum || !cells.H) continue;
            
            if (!jeGroups.has(jeNum)) {
                jeGroups.set(jeNum, {
                    jeNum,
                    date: cells.A,
                    reference: cells.F || `JE-${jeNum}`,
                    description: cells.G || cells.F || '',
                    lines: []
                });
            }
            
            const debit = parseAmount(cells.L);
            const credit = parseAmount(cells.M);
            if (debit === 0 && credit === 0) continue;
            
            const parsed = parseAccountNumber(cells.H);
            if (!parsed) continue;
            
            jeGroups.get(jeNum).lines.push({
                accountCode: parsed.account_code,
                entityCode: parsed.entity_code,
                glCode: parsed.gl_code,
                fundNumber: parsed.fund_number,
                accountDesc: cells.I || '',
                debit,
                credit
            });
        }
        
        const client = await pool.connect();
        const log = [];
        let imported = 0;
        let skipped = 0;
        let errors = 0;
        
        try {
            for (const [jeNum, je] of jeGroups) {
                if (je.lines.length === 0) {
                    log.push(`JE ${jeNum}: Skipped - no line items`);
                    skipped++;
                    continue;
                }
                
                const entryDate = parseDate(je.date);
                if (!entryDate) {
                    log.push(`JE ${jeNum}: Skipped - invalid date`);
                    skipped++;
                    continue;
                }
                
                // Check if exists
                const existing = await client.query(
                    'SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1',
                    [je.reference]
                );
                if (existing.rows.length > 0) {
                    log.push(`JE ${jeNum}: Skipped - already exists`);
                    skipped++;
                    continue;
                }
                
                // Get entity ID
                const firstLine = je.lines[0];
                const entityResult = await client.query(
                    "SELECT id FROM entities WHERE code = $1 OR code LIKE $2 LIMIT 1",
                    [firstLine.entityCode, `%${firstLine.entityCode}%`]
                );
                if (entityResult.rows.length === 0) {
                    log.push(`JE ${jeNum}: Error - entity not found: ${firstLine.entityCode}`);
                    errors++;
                    continue;
                }
                const entityId = entityResult.rows[0].id;
                
                // Resolve accounts and funds
                const resolvedLines = [];
                let hasError = false;
                
                for (const line of je.lines) {
                    const accResult = await client.query(
                        'SELECT id FROM accounts WHERE account_code = $1 LIMIT 1',
                        [line.accountCode]
                    );
                    if (accResult.rows.length === 0) {
                        log.push(`JE ${jeNum}: Error - account not found: ${line.accountCode}`);
                        hasError = true;
                        break;
                    }
                    
                    const fundResult = await client.query(
                        'SELECT id FROM funds WHERE fund_number = $1 LIMIT 1',
                        [line.fundNumber]
                    );
                    if (fundResult.rows.length === 0) {
                        log.push(`JE ${jeNum}: Error - fund not found: ${line.fundNumber}`);
                        hasError = true;
                        break;
                    }
                    
                    resolvedLines.push({
                        account_id: accResult.rows[0].id,
                        fund_id: fundResult.rows[0].id,
                        debit: line.debit,
                        credit: line.credit,
                        description: line.accountDesc
                    });
                }
                
                if (hasError) {
                    errors++;
                    continue;
                }
                
                const totalAmount = Math.max(
                    resolvedLines.reduce((s, l) => s + l.debit, 0),
                    resolvedLines.reduce((s, l) => s + l.credit, 0)
                );
                
                // Create journal entry
                try {
                    await client.query('BEGIN');
                    
                    const jeResult = await client.query(
                        `INSERT INTO journal_entries (entity_id, entry_date, reference_number, description, total_amount, status)
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                        [entityId, entryDate, je.reference, je.description, totalAmount, importStatus]
                    );
                    const journalEntryId = jeResult.rows[0].id;
                    
                    for (const line of resolvedLines) {
                        await client.query(
                            `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            [journalEntryId, line.account_id, line.fund_id, line.debit, line.credit, line.description]
                        );
                    }
                    
                    await client.query('COMMIT');
                    log.push(`JE ${jeNum}: Created (${resolvedLines.length} lines, $${totalAmount.toFixed(2)})`);
                    imported++;
                } catch (err) {
                    await client.query('ROLLBACK');
                    log.push(`JE ${jeNum}: Error - ${err.message}`);
                    errors++;
                }
            }
        } finally {
            client.release();
        }
        
        fs.unlinkSync(filePath);
        
        res.json({
            summary: { total: jeGroups.size, imported, skipped, errors },
            log
        });
        
    } catch (err) {
        fs.unlinkSync(filePath);
        throw err;
    }
}));

module.exports = router;
