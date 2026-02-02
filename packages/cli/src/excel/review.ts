import type { Workbook } from 'exceljs';
import type { Transaction } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';

/**
 * Generates the review Excel report for transactions needing attention.
 * Matches PRD §11.2 requirements.
 */
export async function generateReviewExcel(transactions: Transaction[]): Promise<Workbook> {
    const workbook = createWorkbook();
    const sheet = workbook.addWorksheet('Review');

    sheet.columns = [
        { header: 'Date', key: 'date' },
        { header: 'Description', key: 'description' },
        { header: 'Amount', key: 'amount' },
        { header: 'CategoryID', key: 'category_id' },
        { header: 'NeedsReview', key: 'needs_review' },
        { header: 'Reasons', key: 'reasons' },
        { header: 'SourceFile', key: 'source_file' },
        { header: 'TxnID', key: 'txn_id' },
    ];

    for (const txn of transactions) {
        const row = sheet.addRow({
            date: txn.effective_date,
            description: txn.description,
            amount: parseFloat(txn.signed_amount),
            category_id: txn.category_id,
            needs_review: txn.needs_review ? 'YES' : 'no',
            reasons: txn.review_reasons.join(', '),
            source_file: txn.source_file,
            txn_id: txn.txn_id,
        });

        // Highlight rows that need review
        if (txn.needs_review) {
            row.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFFFEB9C' } // Light yellow warning
            };
        }
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'amount');
    autoFitColumns(sheet);

    return workbook;
}
