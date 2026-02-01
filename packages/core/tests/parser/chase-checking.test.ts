import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseChaseChecking } from '../../src/parser/chase-checking.js';

describe('parseChaseChecking', () => {
    const accountId = 1120;
    const sourceFile = 'chase_1110_202601.csv';

    function createCsv(rows: any[]): ArrayBuffer {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        return XLSX.write(wb, { type: 'array', bookType: 'csv' });
    }

    it('should parse valid Chase Checking CSV', () => {
        const data = createCsv([
            { 'Posting Date': '01/15/2026', Description: 'PAYROLL', Amount: '5000.00', 'Details': 'Checking', 'Type': 'ACH_DEPOSIT', 'Balance': '5000.00', 'Check or Slip #': '' },
            { 'Posting Date': '01/16/2026', Description: 'STARBUCKS', Amount: '-5.75', 'Details': 'Checking', 'Type': 'DEBIT_CARD', 'Balance': '4994.25', 'Check or Slip #': '' }
        ]);

        const result = parseChaseChecking(data, accountId, sourceFile);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].description).toBe('PAYROLL');
        expect(result.transactions[0].signed_amount).toBe('5000');
        expect(result.transactions[1].description).toBe('STARBUCKS');
        expect(result.transactions[1].signed_amount).toBe('-5.75');
        expect(result.warnings).toHaveLength(0);
        expect(result.skippedRows).toBe(0);
    });

    it('should handle amounts with commas', () => {
        const data = createCsv([
            { 'Posting Date': '01/15/2026', Description: 'BIG SURPRISE', Amount: '1,234.56' }
        ]);

        const result = parseChaseChecking(data, accountId, sourceFile);
        expect(result.transactions[0].signed_amount).toBe('1234.56');
    });

    it('should return empty result for empty data', () => {
        const data = createCsv([]);
        const result = parseChaseChecking(data, accountId, sourceFile);
        expect(result.transactions).toHaveLength(0);
    });

    it('should throw error for missing columns', () => {
        const data = createCsv([
            { 'Wrong Date': '01/15/2026', Amount: '100.00' }
        ]);

        expect(() => parseChaseChecking(data, accountId, sourceFile)).toThrow(/Missing required columns/);
    });

    it('should skip rows with invalid dates', () => {
        const data = createCsv([
            { 'Posting Date': 'invalid-date', Description: 'BAD DATE', Amount: '100.00' },
            { 'Posting Date': '01/15/2026', Description: 'GOOD DATE', Amount: '200.00' }
        ]);

        const result = parseChaseChecking(data, accountId, sourceFile);
        expect(result.transactions).toHaveLength(1);
        expect(result.skippedRows).toBe(1);
        expect(result.warnings).toContain('Skipped 1 rows with invalid or missing dates');
    });

    it('should skip rows with invalid amounts', () => {
        const data = createCsv([
            { 'Posting Date': '01/15/2026', Description: 'BAD AMT', Amount: 'not-a-number' },
            { 'Posting Date': '01/16/2026', Description: 'GOOD AMT', Amount: '300.00' }
        ]);

        const result = parseChaseChecking(data, accountId, sourceFile);
        expect(result.transactions).toHaveLength(1);
        expect(result.skippedRows).toBe(1);
        expect(result.warnings).toContain('Skipped 1 rows with invalid amounts');
    });
});
