import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoaChecking } from '../../src/parser/boa-checking.js';

describe('parseBoaChecking', () => {
    const accountId = 1110;
    const sourceFile = 'boa_1110_202601.csv';

    function createCsv(rows: any[][]): ArrayBuffer {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        return XLSX.write(wb, { type: 'array', bookType: 'csv' });
    }

    it('should parse valid BoA Checking CSV with summary rows', () => {
        const data = createCsv([
            ['Account Name', 'CHECKING'],
            ['Ending Balance', '1000.00'],
            [],
            ['Date', 'Description', 'Amount', 'Running Balance'],
            ['01/15/2026', 'PAYROLL', '5,000.00', '6000.00'],
            ['01/16/2026', 'ATM WITHDRAWAL', '-200.00', '5800.00']
        ]);

        const result = parseBoaChecking(data, accountId, sourceFile);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].description).toBe('PAYROLL');
        expect(result.transactions[0].signed_amount).toBe('5000');
        expect(result.transactions[1].description).toBe('ATM WITHDRAWAL');
        expect(result.transactions[1].signed_amount).toBe('-200');
    });

    it('should skip Beginning Balance rows', () => {
        const data = createCsv([
            ['Date', 'Description', 'Amount'],
            ['01/01/2026', 'Beginning balance', '1000.00'],
            ['01/15/2026', 'PAYROLL', '5000.00']
        ]);

        const result = parseBoaChecking(data, accountId, sourceFile);
        expect(result.transactions).toHaveLength(1);
        expect(result.transactions[0].description).toBe('PAYROLL');
    });

    it('should throw error if header is not found', () => {
        const data = createCsv([
            ['Some', 'Random', 'Data'],
            ['More', 'Garbage', 'Rows']
        ]);

        expect(() => parseBoaChecking(data, accountId, sourceFile)).toThrow(/Could not find header row/);
    });

    it('should handle amounts with commas', () => {
        const data = createCsv([
            ['Date', 'Description', 'Amount'],
            ['01/15/2026', 'BIG CHECK', '7,933.55']
        ]);

        const result = parseBoaChecking(data, accountId, sourceFile);
        expect(result.transactions[0].signed_amount).toBe('7933.55');
    });
});
