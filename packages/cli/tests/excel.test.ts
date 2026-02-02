import { describe, it, expect } from 'vitest';
import { generateAnalysisExcel } from '../src/excel/analysis.js';
import { generateReviewExcel } from '../src/excel/review.js';
import type { Transaction } from '@finance-engine/shared';

describe('Excel Generation', () => {
    const mockTxns: Transaction[] = [
        {
            txn_id: '1',
            txn_date: '2026-01-01',
            post_date: '2026-01-01',
            effective_date: '2026-01-01',
            description: 'Grocery store',
            raw_description: 'GROCERY STORE',
            signed_amount: '-50.75',
            account_id: 1234,
            category_id: 101, // Mock category
            source_file: 'chase_1234_202601.csv',
            confidence: 1,
            needs_review: false,
            review_reasons: []
        },
        {
            txn_id: '2',
            txn_date: '2026-01-02',
            post_date: '2026-01-02',
            effective_date: '2026-01-02',
            description: 'Unknown outflow',
            raw_description: 'UNKNOWN',
            signed_amount: '-10.00',
            account_id: 1234,
            category_id: 0, // Uncategorized
            source_file: 'chase_1234_202601.csv',
            confidence: 0,
            needs_review: true,
            review_reasons: ['Low confidence']
        }
    ];

    it('should generate analysis workbook with 3 sheets', async () => {
        const wb = await generateAnalysisExcel(mockTxns);

        expect(wb.worksheets).toHaveLength(3);
        expect(wb.getWorksheet('IncomeSpend')).toBeDefined();
        expect(wb.getWorksheet('CategorySummary')).toBeDefined();
        expect(wb.getWorksheet('AccountSummary')).toBeDefined();

        const isSheet = wb.getWorksheet('IncomeSpend')!;
        expect(isSheet.getRow(1).values).toContain('Type');
        expect(isSheet.getRow(1).values).toContain('Amount');
    });

    it('should generate review workbook with low confidence items', async () => {
        const wb = await generateReviewExcel(mockTxns);

        const sheet = wb.getWorksheet('Review')!;
        expect(sheet).toBeDefined();

        // Header + 2 data rows
        expect(sheet.rowCount).toBeGreaterThanOrEqual(2);

        const row2Values = sheet.getRow(2).values as any[];
        expect(row2Values).toContain('Grocery store'); // Row 2 is the first item
    });
});
