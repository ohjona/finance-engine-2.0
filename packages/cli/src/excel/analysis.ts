import type { Workbook } from 'exceljs';
import { Decimal } from 'decimal.js';
import type { Transaction, ChartOfAccounts } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';

/**
 * Generates the analysis Excel report with multiple summary sheets.
 * Matches PRD §11.7 / IK D9.3 (Codex Alignment).
 */
export async function generateAnalysisExcel(
    transactions: Transaction[],
    accounts: ChartOfAccounts
): Promise<Workbook> {
    const workbook = createWorkbook();

    addCategorySheet(workbook, transactions, accounts);
    addAccountSheet(workbook, transactions, accounts);
    addSummarySheet(workbook, transactions);

    return workbook;
}

/**
 * Sheet: By Category
 * Columns: category_id, category_name, total_amount, transaction_count
 */
function addCategorySheet(
    workbook: Workbook,
    transactions: Transaction[],
    accounts: ChartOfAccounts
): void {
    const sheet = workbook.addWorksheet('By Category');
    sheet.columns = [
        { header: 'category_id', key: 'category_id' },
        { header: 'category_name', key: 'category_name' },
        { header: 'total_amount', key: 'total_amount' },
        { header: 'transaction_count', key: 'transaction_count' },
    ];

    const categoryStats = new Map<number | null, { count: number; total: Decimal }>();

    for (const txn of transactions) {
        const stats = categoryStats.get(txn.category_id) || { count: 0, total: new Decimal(0) };
        stats.count++;
        stats.total = stats.total.plus(new Decimal(txn.signed_amount));
        categoryStats.set(txn.category_id, stats);
    }

    for (const [id, stats] of categoryStats) {
        sheet.addRow({
            category_id: id || 'N/A',
            category_name: getCategoryName(id, accounts),
            total_amount: stats.total.toNumber(),
            transaction_count: stats.count,
        });
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'total_amount');
    autoFitColumns(sheet);
}

/**
 * Sheet: By Account
 * Columns: account_id, account_name, total_in, total_out, net
 */
function addAccountSheet(
    workbook: Workbook,
    transactions: Transaction[],
    accounts: ChartOfAccounts
): void {
    const sheet = workbook.addWorksheet('By Account');
    sheet.columns = [
        { header: 'account_id', key: 'account_id' },
        { header: 'account_name', key: 'account_name' },
        { header: 'total_in', key: 'total_in' },
        { header: 'total_out', key: 'total_out' },
        { header: 'net', key: 'net' },
    ];

    const accountStats = new Map<number, { total_in: Decimal; total_out: Decimal }>();

    for (const txn of transactions) {
        const stats = accountStats.get(txn.account_id) || { total_in: new Decimal(0), total_out: new Decimal(0) };
        const amount = new Decimal(txn.signed_amount);
        if (amount.isPositive()) {
            stats.total_in = stats.total_in.plus(amount);
        } else {
            // total_out sum absolute value of negative (IK D9.3)
            stats.total_out = stats.total_out.plus(amount.abs());
        }
        accountStats.set(txn.account_id, stats);
    }

    for (const [id, stats] of accountStats) {
        sheet.addRow({
            account_id: id,
            account_name: getAccountName(id, accounts),
            total_in: stats.total_in.toNumber(),
            total_out: stats.total_out.toNumber(),
            net: stats.total_in.minus(stats.total_out).toNumber(),
        });
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'total_in');
    formatCurrencyCell(sheet, 'total_out');
    formatCurrencyCell(sheet, 'net');
    autoFitColumns(sheet);
}

/**
 * Sheet: Summary
 * Rows: Total income, Total expenses, Net savings, Flagged count, Flagged total
 */
function addSummarySheet(workbook: Workbook, transactions: Transaction[]): void {
    const sheet = workbook.addWorksheet('Summary');
    sheet.columns = [
        { header: 'Metric', key: 'metric' },
        { header: 'Value', key: 'value' },
    ];

    let totalIn = new Decimal(0);
    let totalOut = new Decimal(0);
    let flaggedCount = 0;
    let flaggedTotal = new Decimal(0);

    for (const txn of transactions) {
        const amount = new Decimal(txn.signed_amount);
        if (amount.isPositive()) {
            totalIn = totalIn.plus(amount);
        } else {
            totalOut = totalOut.plus(amount.abs());
        }

        if (txn.needs_review) {
            flaggedCount++;
            flaggedTotal = flaggedTotal.plus(amount.abs());
        }
    }

    sheet.addRow({ metric: 'Total income', value: totalIn.toNumber() });
    sheet.addRow({ metric: 'Total expenses', value: totalOut.toNumber() });
    sheet.addRow({ metric: 'Net savings', value: totalIn.minus(totalOut).toNumber() });
    sheet.addRow({ metric: 'Flagged count', value: flaggedCount });
    sheet.addRow({ metric: 'Flagged total', value: flaggedTotal.toNumber() });

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'value');
    autoFitColumns(sheet);
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
