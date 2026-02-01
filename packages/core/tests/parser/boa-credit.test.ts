import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBoaCredit } from '../../src/parser/boa-credit.js';

describe('parseBoaCredit', () => {
    const accountId = 2110;
    const sourceFile = 'boa_2110_202601.csv';

    function createCsv(rows: any[]): ArrayBuffer {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        return XLSX.write(wb, { type: 'array', bookType: 'csv' });
    }

    it('should parse valid BoA Credit CSV', () => {
        const data = createCsv([
            { 'Posted Date': '01/15/2026', 'Reference Number': '123', 'Payee': 'TARGET', 'Address': 'SF', 'Amount': '-50.75' },
            { 'Posted Date': '01/16/2026', 'Reference Number': '124', 'Payee': 'PAYMENT', 'Address': 'ONLINE', 'Amount': '200.00' }
        ]);

        const result = parseBoaCredit(data, accountId, sourceFile);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].description).toBe('TARGET');
        expect(result.transactions[0].signed_amount).toBe('-50.75');
        expect(result.transactions[1].description).toBe('PAYMENT');
        expect(result.transactions[1].signed_amount).toBe('200');
    });

    it('should throw error for missing columns', () => {
        const data = createCsv([{ 'Date': '01/15/2026', 'Amount': '10.00' }]);
        expect(() => parseBoaCredit(data, accountId, sourceFile)).toThrow(/Missing required columns/);
    });
});
