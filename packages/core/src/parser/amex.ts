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
import { UNCATEGORIZED_CATEGORY_ID } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';

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

    // Convert to JSON, skipping first 6 rows
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6 });

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedRows = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows };
    }

    // Header validation - check first row has expected columns
    const firstRow = rows[0];
    const requiredColumns = ['Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

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
        const rawAmountStr = String(row['Amount'] ?? '0');

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

        transactions.push(txn);
    }

    // Add warning if rows were skipped
    if (skippedRows > 0) {
        warnings.push(`Skipped ${skippedRows} rows with invalid or missing dates`);
    }

    return { transactions, warnings, skippedRows };
}

/**
 * Parse Amex date value (Excel serial or string).
 */
function parseAmexDate(value: unknown): Date | null {
    if (typeof value === 'number') {
        // Excel serial date
        return excelSerialToDate(value);
    }

    if (typeof value === 'string') {
        // Try MM/DD/YYYY format
        const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (mdyMatch) {
            const [, month, day, year] = mdyMatch;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            return isValidDate(date) ? date : null;
        }

        // Try YYYY-MM-DD format
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const [, year, month, day] = isoMatch;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            return isValidDate(date) ? date : null;
        }
    }

    return null;
}

/**
 * Convert Excel serial date to JavaScript Date.
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
 * Format date as ISO YYYY-MM-DD string.
 */
function formatIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
