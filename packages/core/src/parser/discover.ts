/**
 * Discover Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - XLS file (actually HTML table)
 * - Has category column
 * - Amount convention: ASSUMED negative = purchase (credit card standard)
 *
 * ASSUMPTION: Discover follows credit card convention (negative = purchase).
 * This needs validation against real Discover exports.
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseDateValue, formatIsoDate } from '../utils/date-parse.js';

const DISCOVER_EXPECTED_COLUMNS = ['Trans. Date', 'Post Date', 'Description', 'Amount', 'Category'];

/**
 * Parse Discover Credit Card transaction export.
 *
 * NOTE: Discover exports .xls files that are actually HTML tables.
 * The xlsx library handles this transparently via format detection.
 */
export function parseDiscover(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    // xlsx auto-detects format including HTML tables saved as .xls
    // Using cellDates: true for consistency, though HTML parsing might result in strings.
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

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
    const requiredColumns = ['Trans. Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Discover parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Trans. Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseDateValue(dateValue, 'MDY');
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        // Use Post Date if available, otherwise Trans. Date
        let postDate = txnDate;
        if (row['Post Date']) {
            const parsed = parseDateValue(row['Post Date'], 'MDY');
            if (parsed) postDate = parsed;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // ASSUMPTION: Discover follows credit card convention (negative = purchase)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(postDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: formatIsoDate(txnDate),
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            raw_category: row['Category'] ? String(row['Category']) : undefined,
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
