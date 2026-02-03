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
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });

    let activeSheet: XLSX.WorkSheet | null = null;
    let activeRows: Record<string, unknown>[] = [];

    // X-2: Robust multi-table handling. Scan all sheets for required headers.
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        if (rows.length === 0) continue;

        const firstRow = rows[0];
        const missingColumns = DISCOVER_EXPECTED_COLUMNS.filter((col) => !(col in firstRow));
        if (missingColumns.length === 0) {
            activeSheet = sheet;
            activeRows = rows;
            break;
        }
    }

    if (!activeSheet) {
        // Fallback for debugging: list schemas of all sheets
        const sheetSummaries = workbook.SheetNames.map(name => {
            const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[name]);
            const headers = rows.length > 0 ? Object.keys(rows[0]).join(', ') : 'EMPTY';
            return `"${name}": [${headers}]`;
        }).join('; ');

        throw new Error(
            `Discover parser: Could not find transaction table in any sheet. ` +
            `Checked: ${sheetSummaries}`
        );
    }

    const rows = activeRows;
    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

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

        // Per IK D2.6: Use txn_date for month assignment (effective_date)
        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: formatIsoDate(txnDate),
            post_date: formatIsoDate(postDate),
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
