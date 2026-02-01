import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseAmex } from '../../src/parser/amex.js';
import { UNCATEGORIZED_CATEGORY_ID } from '../../src/types/index.js';

describe('parseAmex', () => {
    /**
     * Create mock Amex XLSX data.
     * Amex format has 6 header rows before data.
     */
    function createAmexWorkbook(rows: Record<string, unknown>[]): ArrayBuffer {
        const headerRows = Array(6).fill(['', '', '', '', '']);
        const dataWithHeaders = [
            ['Date', 'Description', 'Amount', 'Category'],
            ...rows.map((r) => [r['Date'], r['Description'], r['Amount'], r['Category']]),
        ];

        const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataWithHeaders]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

        return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    }

    it('parses valid Amex transactions', () => {
        const data = createAmexWorkbook([
            { Date: '01/15/2026', Description: 'UBER *TRIP', Amount: '23.45', Category: 'Transportation' },
            { Date: '01/16/2026', Description: 'STARBUCKS', Amount: '5.00', Category: 'Restaurant' },
        ]);

        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result.transactions).toHaveLength(2);
        expect(result.warnings).toHaveLength(0);
        expect(result.skippedRows).toBe(0);

        // First transaction
        const txn1 = result.transactions[0];
        expect(txn1.effective_date).toBe('2026-01-15');
        expect(txn1.raw_description).toBe('UBER *TRIP');
        expect(txn1.description).toBe('UBER TRIP'); // Normalized
        expect(txn1.signed_amount).toBe('-23.45'); // Negated (charge = money out)
        expect(txn1.account_id).toBe(2122);
        expect(txn1.raw_category).toBe('Transportation');
        expect(txn1.txn_id).toHaveLength(16);
        expect(txn1.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);

        // Second transaction
        const txn2 = result.transactions[1];
        expect(txn2.effective_date).toBe('2026-01-16');
        expect(txn2.signed_amount).toBe('-5'); // Decimal normalizes
    });

    it('handles negative amounts (refunds)', () => {
        const data = createAmexWorkbook([
            { Date: '01/15/2026', Description: 'REFUND', Amount: '-50.00', Category: 'Other' },
        ]);

        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].signed_amount).toBe('50'); // -(-50) = 50 (money in)
    });

    it('returns empty result for empty file', () => {
        const data = createAmexWorkbook([]);
        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result.transactions).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
        expect(result.skippedRows).toBe(0);
    });

    it('generates deterministic txn_ids', () => {
        const data = createAmexWorkbook([
            { Date: '01/15/2026', Description: 'UBER *TRIP', Amount: '23.45', Category: 'Transportation' },
        ]);

        const result1 = parseAmex(data, 2122, 'amex_2122_202601.xlsx');
        const result2 = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result1.transactions[0].txn_id).toBe(result2.transactions[0].txn_id);
    });

    it('sets default values correctly', () => {
        const data = createAmexWorkbook([
            { Date: '01/15/2026', Description: 'TEST', Amount: '10.00', Category: '' },
        ]);

        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');
        const txn = result.transactions[0];

        expect(txn.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
        expect(txn.confidence).toBe(0);
        expect(txn.needs_review).toBe(false);
        expect(txn.review_reasons).toEqual([]);
    });

    it('skips rows with invalid dates and adds warning', () => {
        const data = createAmexWorkbook([
            { Date: '01/15/2026', Description: 'VALID', Amount: '10.00', Category: '' },
            { Date: 'invalid', Description: 'INVALID DATE', Amount: '20.00', Category: '' },
            { Date: '', Description: 'MISSING DATE', Amount: '30.00', Category: '' },
        ]);

        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result.transactions).toHaveLength(1);
        expect(result.skippedRows).toBe(2);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0]).toContain('Skipped 2 rows');
    });

    it('handles Excel serial dates', () => {
        // Excel serial for 2026-01-15 is approximately 46036
        const data = createAmexWorkbook([
            { Date: 46036, Description: 'EXCEL DATE', Amount: '10.00', Category: '' },
        ]);

        const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

        expect(result.transactions).toHaveLength(1);
        // Date should be parsed (exact date depends on Excel serial calculation)
        expect(result.transactions[0].effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('throws error for missing required columns', () => {
        // Create workbook with wrong columns
        const headerRows = Array(6).fill(['', '', '', '', '']);
        const ws = XLSX.utils.aoa_to_sheet([
            ...headerRows,
            ['WrongColumn1', 'WrongColumn2', 'WrongColumn3'],
            ['2026-01-15', 'TEST', '10.00'],
        ]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

        expect(() => parseAmex(data, 2122, 'amex_2122_202601.xlsx')).toThrow('Missing required columns');
    });
});
