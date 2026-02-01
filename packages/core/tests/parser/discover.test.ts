import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDiscover } from '../../src/parser/discover.js';

describe('parseDiscover', () => {
    const accountId = 2170;
    const sourceFile = 'discover_2170_202601.xls';

    function createHtmlWorkbook(rows: any[]): ArrayBuffer {
        // Create an actual HTML table string to simulate Discover's "XLS"
        let htmlSnippet = '<table><tr>';
        const headers = Object.keys(rows[0]);
        headers.forEach(h => htmlSnippet += `<th>${h}</th>`);
        htmlSnippet += '</tr>';

        rows.forEach(row => {
            htmlSnippet += '<tr>';
            headers.forEach(h => htmlSnippet += `<td>${row[h]}</td>`);
            htmlSnippet += '</tr>';
        });
        htmlSnippet += '</table>';

        const wb = XLSX.read(htmlSnippet, { type: 'string' });
        return XLSX.write(wb, { type: 'array', bookType: 'xls' });
    }

    it('should parse Discover "XLS" (HTML table)', () => {
        const data = createHtmlWorkbook([
            { 'Trans. Date': '01/15/2026', 'Post Date': '01/16/2026', 'Description': 'AMAZON', 'Amount': '-45.00', 'Category': 'Shopping' },
            { 'Trans. Date': '01/17/2026', 'Post Date': '01/17/2026', 'Description': 'SHELL', 'Amount': '-60.00', 'Category': 'Gas' }
        ]);

        const result = parseDiscover(data, accountId, sourceFile);

        expect(result.transactions).toHaveLength(2);
        expect(result.transactions[0].txn_date).toBe('2026-01-15');
        expect(result.transactions[0].post_date).toBe('2026-01-16');
        expect(result.transactions[0].raw_category).toBe('Shopping');
        expect(result.transactions[1].description).toBe('SHELL');
    });

    it('should handle missing Post Date by falling back to Trans. Date', () => {
        const data = createHtmlWorkbook([
            { 'Trans. Date': '01/15/2026', 'Description': 'NO POST DATE', 'Amount': '-10.00' }
        ]);

        const result = parseDiscover(data, accountId, sourceFile);
        expect(result.transactions[0].post_date).toBe('2026-01-15');
    });
});
