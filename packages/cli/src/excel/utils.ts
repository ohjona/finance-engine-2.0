import exceljs from 'exceljs';
import type { Worksheet, Workbook } from 'exceljs';

/**
 * Creates a new workbook with standard metadata.
 */
export function createWorkbook(): Workbook {
    const workbook = new exceljs.Workbook();
    workbook.creator = 'Finance Engine';
    workbook.created = new Date();
    return workbook;
}

/**
 * Applies professional styling to the header row.
 */
export function formatHeaderRow(worksheet: Worksheet): void {
    const headerRow = worksheet.getRow(1);

    headerRow.font = {
        bold: true,
        color: { argb: 'FFFFFFFF' },
        size: 11
    };

    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' } // Professional Blue
    };

    headerRow.alignment = {
        vertical: 'middle',
        horizontal: 'center'
    };

    // Freeze the top row for better navigation
    worksheet.views = [
        { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];
}

/**
 * Attempts to auto-fit column widths based on cell content.
 */
export function autoFitColumns(worksheet: Worksheet): void {
    worksheet.columns.forEach(column => {
        let maxLen = 10;
        column.eachCell?.({ includeEmpty: false }, cell => {
            if (cell.value) {
                const len = cell.value.toString().length;
                if (len > maxLen) maxLen = len;
            }
        });
        // Add a bit of padding and cap at 100
        column.width = Math.min(maxLen + 2, 100);
    });
}

/**
 * Applies currency formatting to a range of cells.
 */
export function formatCurrencyCell(worksheet: Worksheet, col: string | number): void {
    const column = worksheet.getColumn(col);
    column.numFmt = '#,##0.00;[Red]-#,##0.00';
    column.alignment = { horizontal: 'right' };
}
