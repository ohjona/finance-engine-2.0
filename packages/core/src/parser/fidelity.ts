/**
 * Fidelity Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - CSV format
 * - Date format: YYYY-MM-DD (DIFFERENT from other parsers!)
 * - Amount convention: positive = credit/refund (money in), negative = charge (money out)
 *
 * Per IK D3.1: Fidelity negative = charge, so signed_amount = raw (no transformation)
 * Per IK D3.9: Fidelity uses YYYY-MM-DD date format
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseDateValue, formatIsoDate } from '../utils/date-parse.js';
import { stripBom } from '../utils/csv.js';

const FIDELITY_EXPECTED_COLUMNS = ['Date', 'Name', 'Amount'];

/**
 * Parse Fidelity Credit Card transaction export.
 */
export function parseFidelity(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet).map(row => {
        const clean: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
            clean[stripBom(k)] = v;
        }
        return clean;
    });

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation (rows are already cleaned)
    const firstRow = rows[0];
    const requiredColumns = FIDELITY_EXPECTED_COLUMNS;
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Fidelity parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        // Fidelity uses YYYY-MM-DD format
        const txnDate = parseDateValue(dateValue, 'ISO');
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Name'] ?? '');
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

        // Fidelity: negative = charge (matches our convention)
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
