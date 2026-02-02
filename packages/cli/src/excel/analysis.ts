import type { Workbook, Worksheet } from 'exceljs';
import { Decimal } from 'decimal.js';
import type { Transaction } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';

/**
 * Generates the analysis Excel report with multiple summary sheets.
 * Matches PRD §11.3 requirements.
 */
export async function generateAnalysisExcel(transactions: Transaction[]): Promise<Workbook> {
    const workbook = createWorkbook();

    addIncomeSpendSheet(workbook, transactions);
    addCategorySummarySheet(workbook, transactions);
    addAccountSummarySheet(workbook, transactions);

    return workbook;
}

function addIncomeSpendSheet(workbook: Workbook, transactions: Transaction[]): void {
    const sheet = workbook.addWorksheet('IncomeSpend');
    sheet.columns = [
        { header: 'Type', key: 'type' },
        { header: 'Amount', key: 'amount' },
    ];

    let income = new Decimal(0);
    let spend = new Decimal(0);

    for (const txn of transactions) {
        const amt = new Decimal(txn.signed_amount);
        if (amt.isPositive()) {
            income = income.plus(amt);
        } else {
            spend = spend.plus(amt);
        }
    }

    sheet.addRow({ type: 'Total Income', amount: income.toNumber() });
    sheet.addRow({ type: 'Total Spend', amount: spend.toNumber() });
    sheet.addRow({ type: 'Net Cash Flow', amount: income.plus(spend).toNumber() });

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'amount');
    autoFitColumns(sheet);
}

function addCategorySummarySheet(workbook: Workbook, transactions: Transaction[]): void {
    const sheet = workbook.addWorksheet('CategorySummary');
    sheet.columns = [
        { header: 'CategoryID', key: 'id' },
        { header: 'TransactionCount', key: 'count' },
        { header: 'TotalAmount', key: 'total' },
    ];

    const categoryStats = new Map<number, { count: number; total: Decimal }>();

    for (const txn of transactions) {
        const stats = categoryStats.get(txn.category_id) || { count: 0, total: new Decimal(0) };
        stats.count++;
        stats.total = stats.total.plus(new Decimal(txn.signed_amount));
        categoryStats.set(txn.category_id, stats);
    }

    // Sort by ID for readability
    const sortedIds = Array.from(categoryStats.keys()).sort((a, b) => a - b);
    for (const id of sortedIds) {
        const stats = categoryStats.get(id)!;
        sheet.addRow({
            id,
            count: stats.count,
            total: stats.total.toNumber(),
        });
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'total');
    autoFitColumns(sheet);
}

function addAccountSummarySheet(workbook: Workbook, transactions: Transaction[]): void {
    const sheet = workbook.addWorksheet('AccountSummary');
    sheet.columns = [
        { header: 'AccountID', key: 'id' },
        { header: 'TransactionCount', key: 'count' },
        { header: 'TotalVolume', key: 'total' },
    ];

    const accountStats = new Map<number, { count: number; total: Decimal }>();

    for (const txn of transactions) {
        const stats = accountStats.get(txn.account_id) || { count: 0, total: new Decimal(0) };
        stats.count++;
        stats.total = stats.total.plus(new Decimal(txn.signed_amount).abs());
        accountStats.set(txn.account_id, stats);
    }

    const sortedIds = Array.from(accountStats.keys()).sort((a, b) => a - b);
    for (const id of sortedIds) {
        const stats = accountStats.get(id)!;
        sheet.addRow({
            id,
            count: stats.count,
            total: stats.total.toNumber(),
        });
    }

    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'total');
    autoFitColumns(sheet);
}
