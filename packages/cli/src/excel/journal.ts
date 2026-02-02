import type { Workbook } from 'exceljs';
import type { JournalEntry } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';
import { Decimal } from 'decimal.js';

/**
 * Generates the professional journal Excel report.
 * Matches PRD §11.7 requirements (Exact snake_case headers).
 */
export async function generateJournalExcel(entries: JournalEntry[]): Promise<Workbook> {
    const workbook = createWorkbook();
    const sheet = workbook.addWorksheet('Journal');

    sheet.columns = [
        { header: 'entry_id', key: 'entry_id' },
        { header: 'date', key: 'date' },
        { header: 'description', key: 'description' },
        { header: 'account_id', key: 'account_id' },
        { header: 'account_name', key: 'account_name' },
        { header: 'debit', key: 'debit' },
        { header: 'credit', key: 'credit' },
        { header: 'txn_id', key: 'txn_id' },
    ];

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    for (const entry of entries) {
        for (const line of entry.lines) {
            // Ensure positive numbers only for journals (IK D9.1)
            const debit = line.debit ? new Decimal(line.debit).abs() : null;
            const credit = line.credit ? new Decimal(line.credit).abs() : null;

            if (debit) totalDebits = totalDebits.plus(debit);
            if (credit) totalCredits = totalCredits.plus(credit);

            sheet.addRow({
                entry_id: entry.entry_id,
                date: entry.date,
                description: entry.description,
                account_id: line.account_id,
                account_name: line.account_name,
                debit: debit ? debit.toNumber() : null,
                credit: credit ? credit.toNumber() : null,
                txn_id: line.txn_id,
            });
        }
    }

    // Add footer row (CA-2)
    const footerRow = sheet.addRow({
        account_name: 'TOTALS',
        debit: totalDebits.toNumber(),
        credit: totalCredits.toNumber(),
    });
    footerRow.font = { bold: true };
    footerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' } // Light gray
    };

    // Professional touch: Formatting
    formatHeaderRow(sheet);
    formatCurrencyCell(sheet, 'debit');
    formatCurrencyCell(sheet, 'credit');
    autoFitColumns(sheet);

    // Freeze ID and Date columns for scrolling
    sheet.views = [
        { state: 'frozen', xSplit: 2, ySplit: 1 }
    ];

    return workbook;
}
