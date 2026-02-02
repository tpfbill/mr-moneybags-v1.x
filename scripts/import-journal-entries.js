/**
 * Import Journal Entries from Excel file
 * Usage: node scripts/import-journal-entries.js [--dry-run] [--status=Pending|Posted]
 * 
 * Reads: uploads/EF Report All.xlsx
 * Creates journal entries grouped by JE number (column E)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Simple xlsx parser using unzip command (no external dependencies)

// Parse command line args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const statusArg = args.find(a => a.startsWith('--status='));
const importStatus = statusArg ? statusArg.split('=')[1] : 'Pending';

console.log(`Import settings: dryRun=${dryRun}, status=${importStatus}`);

// Database connection (uses PG* env vars from .env)
const pool = new Pool({
    host: process.env.PGHOST || process.env.DB_HOST || 'localhost',
    port: process.env.PGPORT || process.env.DB_PORT || 5432,
    database: process.env.PGDATABASE || process.env.DB_NAME || 'fund_accounting',
    user: process.env.PGUSER || process.env.DB_USER || 'postgres',
    password: process.env.PGPASSWORD || process.env.DB_PASSWORD || ''
});

// Parse xlsx file manually using built-in modules
function parseXlsx(filePath) {
    const { execSync } = require('child_process');
    
    // Use unzip command to extract
    const tempDir = `/tmp/xlsx_extract_${Date.now()}`;
    execSync(`mkdir -p ${tempDir}`);
    execSync(`unzip -q "${filePath}" -d ${tempDir}`);
    
    // Read shared strings - parse <si> elements and concatenate all <t> text
    const ssXml = fs.readFileSync(`${tempDir}/xl/sharedStrings.xml`, 'utf8');
    const strings = [];
    
    // Match each <si>...</si> block
    const siMatches = ssXml.matchAll(/<si>(.*?)<\/si>/gs);
    for (const siMatch of siMatches) {
        const siContent = siMatch[1];
        // Extract all <t>...</t> text within this <si>
        const textParts = [];
        const tMatches = siContent.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
        for (const tMatch of tMatches) {
            textParts.push(tMatch[1]);
        }
        strings.push(textParts.join(''));
    }
    
    console.log(`Loaded ${strings.length} shared strings`);
    
    // Read sheet1
    const sheetXml = fs.readFileSync(`${tempDir}/xl/worksheets/sheet1.xml`, 'utf8');
    
    // Parse rows
    const rows = [];
    const rowMatches = sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs);
    
    for (const rowMatch of rowMatches) {
        const rowNum = parseInt(rowMatch[1]);
        const rowContent = rowMatch[2];
        const cells = {};
        
        // Match cells - non-greedy match for cell content
        const cellMatches = rowContent.matchAll(/<c\s+([^>]*)>(.*?)<\/c>/gs);
        for (const cellMatch of cellMatches) {
            const attrs = cellMatch[1];
            const cellContent = cellMatch[2];
            
            // Extract cell reference (column + row)
            const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
            if (!refMatch) continue;
            const col = refMatch[1];
            
            // Check if it's a shared string
            const typeMatch = attrs.match(/t="([^"]*)"/);
            const cellType = typeMatch ? typeMatch[1] : '';
            
            // Get value
            const valMatch = cellContent.match(/<v>([^<]*)<\/v>/);
            let val = valMatch ? valMatch[1] : '';
            
            // Look up shared string
            if (cellType === 's' && val !== '') {
                const idx = parseInt(val);
                val = (idx >= 0 && idx < strings.length) ? strings[idx] : val;
            }
            
            cells[col] = val;
        }
        rows.push({ rowNum, cells });
    }
    
    // Cleanup
    execSync(`rm -rf ${tempDir}`);
    
    return rows;
}

// Parse date from Excel serial number or string
function parseDate(val) {
    if (!val) return null;
    
    // Check if it's a date string like "12/31/2024"
    if (typeof val === 'string' && val.includes('/')) {
        const parts = val.split('/');
        if (parts.length === 3) {
            const [m, d, y] = parts;
            return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
    }
    
    // Excel serial number (days since 1900-01-01, with bug for 1900 leap year)
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
        const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
        return date.toISOString().split('T')[0];
    }
    
    return null;
}

// Parse amount
function parseAmount(val) {
    if (!val || val === '') return 0;
    const num = parseFloat(val);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

// Parse account number to get entity_code, gl_code, fund_number
function parseAccountNumber(accountStr) {
    if (!accountStr) return null;
    // Format: "1 5010 005 00 000" -> entity=1, gl=5010, fund=005, restriction=00
    // Strip the last segment (000) which is from the old system and not used
    const parts = accountStr.trim().split(/\s+/);
    if (parts.length < 3) return null;
    
    // Build account_code without the trailing segment (if 5 parts, drop the last one)
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

async function findEntityId(client, entityCode) {
    const { rows } = await client.query(
        'SELECT id FROM entities WHERE code = $1 OR code LIKE $2 LIMIT 1',
        [entityCode, `%${entityCode}%`]
    );
    return rows[0]?.id || null;
}

async function findAccountId(client, accountCode, entityCode, glCode, fundNumber) {
    // Try exact account_code match first
    let result = await client.query(
        'SELECT id FROM accounts WHERE account_code = $1 LIMIT 1',
        [accountCode]
    );
    if (result.rows[0]) return result.rows[0].id;
    
    // Try by entity_code + gl_code + fund_number
    result = await client.query(
        'SELECT id FROM accounts WHERE entity_code = $1 AND gl_code = $2 AND fund_number = $3 LIMIT 1',
        [entityCode, glCode, fundNumber]
    );
    return result.rows[0]?.id || null;
}

async function findFundId(client, fundNumber) {
    const { rows } = await client.query(
        'SELECT id FROM funds WHERE fund_number = $1 LIMIT 1',
        [fundNumber]
    );
    return rows[0]?.id || null;
}

async function importJournalEntries() {
    const filePath = path.join(__dirname, '../uploads/EF Report All.xlsx');
    
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
    }
    
    console.log('Parsing Excel file...');
    const rows = parseXlsx(filePath);
    console.log(`Found ${rows.length} rows`);
    
    // Skip header rows (row 1-3)
    const dataRows = rows.filter(r => r.rowNum >= 4);
    
    // Group by JE number (column E)
    const jeGroups = new Map();
    
    for (const row of dataRows) {
        const { cells } = row;
        
        // Skip separator rows (start with "This journal entry")
        if (cells.A && cells.A.startsWith('This journal entry')) {
            continue;
        }
        
        // Skip rows without JE number
        const jeNum = cells.E;
        if (!jeNum) continue;
        
        // Skip if no account
        if (!cells.H) continue;
        
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
        
        // Skip lines with no amounts
        if (debit === 0 && credit === 0) continue;
        
        const parsed = parseAccountNumber(cells.H);
        if (!parsed) {
            console.warn(`  Could not parse account: ${cells.H}`);
            continue;
        }
        
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
    
    console.log(`Found ${jeGroups.size} journal entries to import`);
    
    const client = await pool.connect();
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    try {
        for (const [jeNum, je] of jeGroups) {
            console.log(`\nProcessing JE ${jeNum}: ${je.reference}`);
            
            if (je.lines.length === 0) {
                console.log(`  Skipping - no line items`);
                skipped++;
                continue;
            }
            
            // Parse date
            const entryDate = parseDate(je.date);
            if (!entryDate) {
                console.log(`  Skipping - invalid date: ${je.date}`);
                skipped++;
                continue;
            }
            
            // Get entity ID from first line
            const firstLine = je.lines[0];
            const entityId = await findEntityId(client, firstLine.entityCode);
            if (!entityId) {
                console.log(`  Skipping - entity not found: ${firstLine.entityCode}`);
                skipped++;
                continue;
            }
            
            // Check if already imported (by reference number)
            const existing = await client.query(
                'SELECT id FROM journal_entries WHERE reference_number = $1 LIMIT 1',
                [je.reference]
            );
            if (existing.rows.length > 0) {
                console.log(`  Skipping - already exists with reference: ${je.reference}`);
                skipped++;
                continue;
            }
            
            // Resolve all line items
            const resolvedLines = [];
            let hasError = false;
            
            for (const line of je.lines) {
                const accountId = await findAccountId(client, line.accountCode, line.entityCode, line.glCode, line.fundNumber);
                if (!accountId) {
                    console.log(`  Warning: Account not found: ${line.accountCode}`);
                    hasError = true;
                    break;
                }
                
                const fundId = await findFundId(client, line.fundNumber);
                if (!fundId) {
                    console.log(`  Warning: Fund not found: ${line.fundNumber}`);
                    hasError = true;
                    break;
                }
                
                resolvedLines.push({
                    account_id: accountId,
                    fund_id: fundId,
                    debit: line.debit,
                    credit: line.credit,
                    description: line.accountDesc
                });
            }
            
            if (hasError) {
                console.log(`  Skipping due to lookup errors`);
                errors++;
                continue;
            }
            
            // Calculate totals
            const totalDebits = resolvedLines.reduce((s, l) => s + l.debit, 0);
            const totalCredits = resolvedLines.reduce((s, l) => s + l.credit, 0);
            const totalAmount = Math.max(totalDebits, totalCredits);
            
            console.log(`  Date: ${entryDate}, Lines: ${resolvedLines.length}, Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`);
            
            if (Math.abs(totalDebits - totalCredits) > 0.01) {
                console.log(`  Warning: Entry not balanced (diff: ${(totalDebits - totalCredits).toFixed(2)})`);
            }
            
            if (dryRun) {
                console.log(`  [DRY RUN] Would create journal entry`);
                imported++;
                continue;
            }
            
            // Create journal entry
            try {
                await client.query('BEGIN');
                
                const jeResult = await client.query(
                    `INSERT INTO journal_entries (entity_id, entry_date, reference_number, description, total_amount, status)
                     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                    [entityId, entryDate, je.reference, je.description, totalAmount, importStatus]
                );
                const journalEntryId = jeResult.rows[0].id;
                
                // Insert line items
                for (const line of resolvedLines) {
                    await client.query(
                        `INSERT INTO journal_entry_items (journal_entry_id, account_id, fund_id, debit, credit, description)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
                        [journalEntryId, line.account_id, line.fund_id, line.debit, line.credit, line.description]
                    );
                }
                
                await client.query('COMMIT');
                console.log(`  Created journal entry: ${journalEntryId}`);
                imported++;
            } catch (err) {
                await client.query('ROLLBACK');
                console.error(`  Error creating journal entry: ${err.message}`);
                errors++;
            }
        }
    } finally {
        client.release();
    }
    
    console.log(`\n========== Import Summary ==========`);
    console.log(`Total JE groups found: ${jeGroups.size}`);
    console.log(`Imported: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    
    await pool.end();
}

importJournalEntries().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
