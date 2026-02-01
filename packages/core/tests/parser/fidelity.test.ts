import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseFidelity } from '../../src/parser/fidelity.js';

describe('parseFidelity', () => {
    const accountId = 2180;
    const sourceFile = 'fidelity_2180_202601.csv';

    function createCsv(rows: any[]): ArrayBuffer {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
        return XLSX.write(wb, { type: 'array', bookType: 'csv' });
    }

    it('should parse valid Fidelity CSV with ISO dates', () => {
        const data = createCsv([
            { 'Date': '2026-01-15', 'Transaction': 'CHARGE', 'Name': 'WHOLE FOODS', 'Memo': 'GROCERIES', 'Amount': '-120.50' },
            { 'Date': '2026-01-16', 'Transaction': 'CREDIT', 'Name': 'PAYMENT', 'Memo': 'THANK YOU', 'Amount': '500.00' }
        ]);

        const result = parseFidelity(data, accountId, sourceFile);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].txn_date).toBe('2026-01-15');
        expect(result.transactions[0].description).toBe('WHOLE FOODS');
        expect(result.transactions[0].signed_amount).toBe('-120.5');
        expect(result.transactions[1].txn_date).toBe('2026-01-16');
    });

    it('should skip rows with invalid dates', () => {
        const data = createCsv([
            { 'Date': 'invalid-date', 'Name': 'TEST', 'Amount': '-10.00' }
        ]);

        const result = parseFidelity(data, accountId, sourceFile);
        expect(result.transactions).toHaveLength(0);
        expect(result.skippedRows).toBe(1);
    });
});
