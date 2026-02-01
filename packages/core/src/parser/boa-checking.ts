/**
 * Bank of America Checking transaction parser.
 * Per PRD Section 8.2, IK D3.5.
 *
 * Format:
 * - CSV format
 * - DYNAMIC header row (summary rows before transactions)
 * - Amount convention: positive = deposit (money in), negative = withdrawal (money out)
 * - Amounts may have commas ("7,933.55") - strip before parsing
 *
 * Per IK D3.1: BoA Checking positive = deposit, so signed_amount = raw
 * Per IK D3.5: Use smart header detection (scan first 10 rows)
 * Per IK D3.10: Strip commas from amounts
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseDateValue, formatIsoDate } from '../utils/date-parse.js';

const BOA_CHECKING_HEADER_PATTERNS = ['date', 'description', 'amount'];
const BOA_CHECKING_MAX_HEADER_SCAN = 10;

/**
 * Find header row by scanning for canonical column names.
 * Per IK D3.5: BoA exports include summary rows before transaction table.
 */
function findHeaderRow(rows: unknown[][], maxScan: number = BOA_CHECKING_MAX_HEADER_SCAN): number {
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
        const cols = rows[i].map((c) => String(c ?? '').toLowerCase());
        if (BOA_CHECKING_HEADER_PATTERNS.every((h) => cols.some((c) => c.includes(h)))) {
            return i;
        }
    }
    throw new Error('BoA Checking parser: Could not find header row in first 10 rows');
}

/**
 * Parse Bank of America Checking transaction export.
 *
 * @param data - File contents as ArrayBuffer
 * @param accountId - 4-digit account ID from filename
 * @param sourceFile - Original filename for traceability
 * @returns ParseResult with transactions, warnings, and skip count
 */
export function parseBoaChecking(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Get raw rows to find header
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    if (rawRows.length === 0) {
        return { transactions: [], warnings: [], skippedRows: 0 };
    }

    // Smart header detection
    const headerRowIndex = findHeaderRow(rawRows);

    // Re-parse with correct range
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerRowIndex });

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `BoA Checking parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseDateValue(dateValue, 'MDY');
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        // Per IK D3.10: Strip commas before Decimal conversion
        const cleanAmount = rawAmountStr.replace(/,/g, '');

        // Skip "Beginning balance" rows or rows with empty Amount
        if (cleanAmount === '' || cleanAmount === '0' || rawDesc.toLowerCase().includes('beginning balance')) {
            // We don't count these as skipped rows in the same way as errors
            continue;
        }

        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // BoA Checking: positive = deposit, negative = withdrawal (matches our convention)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
