import { describe, it, expect } from 'vitest';
import { generateAnalysisExcel } from '../src/excel/analysis.js';
import { generateReviewExcel } from '../src/excel/review.js';
import { generateJournalExcel } from '../src/excel/journal.js';
import type { Transaction, ChartOfAccounts, JournalEntry } from '@finance-engine/shared';

describe('Excel Generation', () => {
    const mockAccounts: ChartOfAccounts = {
        accounts: {
            "1234": { name: "Chase Checking", type: "asset" },
            "101": { name: "Groceries", type: "expense" }
        }
    };

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
            category_id: 101,
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
            description: 'Low confidence item',
            raw_description: 'UNKNOWN',
            signed_amount: '-10.00',
            account_id: 1234,
            category_id: 0,
            source_file: 'chase_1234_202601.csv',
            confidence: 0.2, // Lower confidence
            needs_review: true,
            review_reasons: ['Low confidence']
        }
    ];

    it('should generate analysis workbook with 3 sheets', async () => {
        const wb = await generateAnalysisExcel(mockTxns, mockAccounts);
        expect(wb.worksheets).toHaveLength(3);
    });

    it('should generate review workbook with exact spec headers (PRD §11.7)', async () => {
        const wb = await generateReviewExcel(mockTxns, mockAccounts);
        const sheet = wb.getWorksheet('Review')!;

        // Exact 14 columns in order (IK D9.2/D9.4)
        const headers = (sheet.getRow(1).values as any[]).slice(1); // ExcelJS values are 1-indexed
        const expectedHeaders = [
            'txn_id',
            'date',
            'raw_description',
            'signed_amount',
            'account_name',
            'suggested_category',
            'confidence',
            'review_reason',
            'your_category_id',
            'llm_suggested_category',
            'llm_reasoning',
            'llm_confidence',
            'llm_suggested_pattern',
            'approval_status'
        ];
        expect(headers).toEqual(expectedHeaders);

        // Check content: Only 1 transaction should be in review (txn_id: '2')
        expect(sheet.actualRowCount).toBe(2); // Header + 1 data row

        const dataRow = sheet.getRow(2).values as any;
        expect(dataRow[sheet.getColumn('txn_id').number]).toBe('2');
        expect(dataRow[sheet.getColumn('date').number]).toBe('2026-01-02');
        expect(dataRow[sheet.getColumn('raw_description').number]).toBe('UNKNOWN');
        expect(dataRow[sheet.getColumn('signed_amount').number]).toBe(-10.00);
        expect(dataRow[sheet.getColumn('account_name').number]).toBe('Chase Checking');
        expect(dataRow[sheet.getColumn('suggested_category').number]).toBe('Uncategorized');
        expect(dataRow[sheet.getColumn('review_reason').number]).toBe('Low confidence');

        // LLM columns should exist
        expect(dataRow[sheet.getColumn('llm_suggested_category').number]).toBeDefined();
    });

    it('should generate journal workbook with footer totals (CA-2)', async () => {
        const mockEntries: JournalEntry[] = [{
            entry_id: 1,
            date: '2026-01-01',
            description: 'Test',
            lines: [
                { account_id: 1000, account_name: 'Cash', debit: '100.00', credit: null, txn_id: 'A' },
                { account_id: 4000, account_name: 'Sales', debit: null, credit: '100.00', txn_id: 'A' }
            ]
        }];

        const wb = await generateJournalExcel(mockEntries);
        const sheet = wb.getWorksheet('Journal')!;
        const lastRow = sheet.getRow(sheet.actualRowCount).values as any;

        expect(lastRow).toContain('TOTALS');
        expect(lastRow).toContain(100); // Debit total
        expect(lastRow).toContain(100); // Credit total
    });
});
