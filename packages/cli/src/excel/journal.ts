import type { Workbook } from 'exceljs';
import type { JournalEntry } from '@finance-engine/shared';
import { createWorkbook, formatHeaderRow, autoFitColumns, formatCurrencyCell } from './utils.js';

/**
 * Generates the professional journal Excel report.
 * Matches PRD §11.1 requirements.
 */
export async function generateJournalExcel(entries: JournalEntry[]): Promise<Workbook> {
    const workbook = createWorkbook();
    const sheet = workbook.addWorksheet('Journal');

    sheet.columns = [
        { header: 'EntryID', key: 'entry_id' },
        { header: 'Date', key: 'date' },
        { header: 'Description', key: 'description' },
        { header: 'AccountID', key: 'account_id' },
        { header: 'AccountName', key: 'account_name' },
        { header: 'Debit', key: 'debit' },
        { header: 'Credit', key: 'credit' },
        { header: 'TxnID', key: 'txn_id' },
    ];

    for (const entry of entries) {
        for (const line of entry.lines) {
            sheet.addRow({
                entry_id: entry.entry_id,
                date: entry.date,
                description: entry.description,
                account_id: line.account_id,
                account_name: line.account_name,
                debit: line.debit ? parseFloat(line.debit) : null,
                credit: line.credit ? parseFloat(line.credit) : null,
                txn_id: line.txn_id,
            });
        }
    }

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
