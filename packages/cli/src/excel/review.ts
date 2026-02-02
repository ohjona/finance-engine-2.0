import type { Workbook } from 'exceljs';
import type { Transaction, ChartOfAccounts } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';

/**
 * Generates the review Excel report for transactions needing attention.
 * Matches PRD §11.7 requirements (IK D9.2).
 */
export async function generateReviewExcel(
    transactions: Transaction[],
    accounts: ChartOfAccounts
): Promise<Workbook> {
    const workbook = createWorkbook();
    const sheet = workbook.addWorksheet('Review');

    sheet.columns = [
        { header: 'txn_id', key: 'txn_id' },
        { header: 'date', key: 'date' },
        { header: 'raw_description', key: 'raw_description' },
        { header: 'signed_amount', key: 'signed_amount' },
        { header: 'account_name', key: 'account_name' },
        { header: 'suggested_category', key: 'suggested_category' },
        { header: 'confidence', key: 'confidence' },
        { header: 'review_reason', key: 'review_reason' },
        { header: 'your_category_id', key: 'your_category_id' },
        { header: 'llm_suggested_category', key: 'llm_suggested_category' },
        { header: 'llm_reasoning', key: 'llm_reasoning' },
        { header: 'llm_confidence', key: 'llm_confidence' },
        { header: 'llm_suggested_pattern', key: 'llm_suggested_pattern' },
        { header: 'approval_status', key: 'approval_status' },
    ];

    // Filter to included ONLY transactions needing review (REQUIRED by spec)
    // Sort by confidence ascending (CA-1, REQUIRED by spec)
    const reviewTxns = transactions
        .filter(t => t.needs_review)
        .sort((a, b) => (a.confidence ?? 1) - (b.confidence ?? 1));

    for (const txn of reviewTxns) {
        sheet.addRow({
            txn_id: txn.txn_id,
            date: txn.effective_date,
            raw_description: txn.raw_description || txn.description,
            signed_amount: parseFloat(txn.signed_amount),
            account_name: getAccountName(txn.account_id, accounts),
            suggested_category: getCategoryName(txn.category_id, accounts),
            confidence: txn.confidence ?? 0,
            review_reason: txn.review_reasons.join('; '),
            your_category_id: '',
            llm_suggested_category: (txn as any).llm_suggested_category || '',
            llm_reasoning: (txn as any).llm_reasoning || '',
            llm_confidence: (txn as any).llm_confidence || '',
            llm_suggested_pattern: (txn as any).llm_suggested_pattern || '',
            approval_status: '',
        });
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'signed_amount');
    autoFitColumns(sheet);

    // Freeze ID and Date columns
    sheet.views = [
        { state: 'frozen', xSplit: 2, ySplit: 1 }
    ];

    return workbook;
}

function getAccountName(accountId: number, accounts: ChartOfAccounts): string {
    const acc = Object.entries(accounts.accounts).find(([id]) => parseInt(id) === accountId);
    return acc ? acc[1].name : `Account ${accountId}`;
}

function getCategoryName(categoryId: number | null, accounts: ChartOfAccounts): string {
    if (!categoryId) return 'Uncategorized';
    const cat = accounts.accounts[categoryId.toString()];
    return cat ? cat.name : `Category ${categoryId}`;
}
