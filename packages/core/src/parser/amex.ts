/**
 * Amex transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - XLSX format
 * - Skip 6 header rows
 * - Amount convention: positive = charge (money out), negative = credit/refund
 * - Has category column
 *
 * Per IK D3.1: Amex positive = charge, so signed_amount = -raw
 *
 * ARCHITECTURAL NOTE: No console.* calls. Warnings returned in ParseResult.
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';

const AMEX_HEADER_OFFSET = 6;
const AMEX_EXPECTED_COLUMNS = ['Date', 'Description', 'Amount'];

/**
 * Parse Amex transaction export.
 *
 * @param data - File contents as ArrayBuffer
 * @param accountId - 4-digit account ID from filename
 * @param sourceFile - Original filename for traceability
 * @returns ParseResult with transactions, warnings, and skip count
 */
export function parseAmex(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Convert to JSON, skipping header rows
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: AMEX_HEADER_OFFSET });

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedRows = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows };
    }

    // Header validation - check first row has expected columns
    const firstRow = rows[0];
    const missingColumns = AMEX_EXPECTED_COLUMNS.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Amex parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Date'];
        if (!dateValue) {
            skippedRows++;
            continue;
        }

        // Parse date
        const txnDate = parseAmexDate(dateValue);
        if (!txnDate) {
            skippedRows++;
            continue;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        // Handle amount - strip commas if present
        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedRows++;
            continue;
        }

        // Amex: positive = charge = money out, so negate
        const signedAmount = rawAmount.negated();

        // Format date as ISO
        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate, // Amex doesn't always have separate post date
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

        // Validate against schema (runtime check)
        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedRows++;
        }
    }

    // Add warning if rows were skipped
    if (skippedRows > 0) {
        warnings.push(`Skipped ${skippedRows} rows with invalid or missing dates`);
    }

    return { transactions, warnings, skippedRows };
}

/**
 * Parse Amex date value (Excel serial or string).
 * Returns date in UTC (00:00:00Z).
 */
function parseAmexDate(value: unknown): Date | null {
    if (value instanceof Date) {
        return isValidDate(value) ? value : null;
    }
    if (typeof value === 'number') {
        // Excel serial date
        return excelSerialToDate(value);
    }

    if (typeof value === 'string') {
        // Try MM/DD/YYYY format
        const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdyMatch) {
            const [, month, day, year] = mdyMatch;
            // Create UTC date
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            return isValidDate(date) ? date : null;
        }

        // Try YYYY-MM-DD format
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            // Create UTC date
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            return isValidDate(date) ? date : null;
        }
    }

    return null;
}

/**
 * Convert Excel serial date to JavaScript Date (UTC).
 */
function excelSerialToDate(serial: number): Date {
    // Excel serial: days since 1899-12-30 (accounting for 1900 leap year bug)
    const utcDays = serial - 25569; // Adjust to Unix epoch
    const utcMs = utcDays * 86400 * 1000;
    return new Date(utcMs);
}

/**
 * Check if date is valid.
 */
function isValidDate(date: Date): boolean {
    return !isNaN(date.getTime());
}

/**
 * Format date as ISO YYYY-MM-DD string using UTC components.
 */
function formatIsoDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
