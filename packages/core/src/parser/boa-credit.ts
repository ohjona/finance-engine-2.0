/**
 * Bank of America Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - CSV format
 * - No header rows to skip
 * - Amount convention: positive = payment/credit (money in), negative = purchase (money out)
 *
 * Per IK D3.1: BoA Credit negative = purchase, so signed_amount = raw (no transformation)
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseDateValue, formatIsoDate } from '../utils/date-parse.js';

/**
 * Parse Bank of America Credit Card transaction export.
 */
export function parseBoaCredit(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
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
    const requiredColumns = ['Posted Date', 'Payee', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `BoA Credit parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Posted Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseDateValue(dateValue, 'MDY');
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Payee'] ?? '');
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

        // BoA Credit: negative = purchase (matches our convention)
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
