import { describe, it, expect } from 'vitest';
import { validateJournal, validateEntry } from '../../src/ledger/validate.js';
import type { JournalEntry } from '@finance-engine/shared';

describe('validateEntry', () => {
    it('returns valid=true for balanced entry', () => {
        const entry: JournalEntry = {
            entry_id: 1,
            date: '2026-01-15',
            description: 'Test',
            lines: [
                { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                { account_id: 2122, account_name: 'Amex', debit: null, credit: '50.00', txn_id: 'test-1' },
            ],
        };

        const result = validateEntry(entry);
        expect(result.valid).toBe(true);
        expect(result.debit_total).toBe('50');
        expect(result.credit_total).toBe('50');
    });

    it('returns valid=false for unbalanced entry', () => {
        const entry: JournalEntry = {
            entry_id: 1,
            date: '2026-01-15',
            description: 'Test',
            lines: [
                { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                { account_id: 2122, account_name: 'Amex', debit: null, credit: '40.00', txn_id: 'test-1' },
            ],
        };

        const result = validateEntry(entry);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unbalanced');
    });
});

describe('validateJournal', () => {
    it('returns valid=true for balanced journal', () => {
        const entries: JournalEntry[] = [
            {
                entry_id: 1,
                date: '2026-01-15',
                description: 'Expense 1',
                lines: [
                    { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                    { account_id: 2122, account_name: 'Amex', debit: null, credit: '50.00', txn_id: 'test-1' },
                ],
            },
            {
                entry_id: 2,
                date: '2026-01-16',
                description: 'Expense 2',
                lines: [
                    { account_id: 4260, account_name: 'Transport', debit: '25.00', credit: null, txn_id: 'test-2' },
                    { account_id: 2122, account_name: 'Amex', debit: null, credit: '25.00', txn_id: 'test-2' },
                ],
            },
        ];

        const result = validateJournal(entries);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('75');
        expect(result.total_credits).toBe('75');
        expect(result.difference).toBe('0');
    });

    it('handles empty journal', () => {
        const result = validateJournal([]);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('0');
        expect(result.total_credits).toBe('0');
    });

    it('uses Decimal precision (no floating point drift)', () => {
        // Many small amounts that would cause drift with floats
        const entries: JournalEntry[] = [];
        for (let i = 0; i < 100; i++) {
            entries.push({
                entry_id: i + 1,
                date: '2026-01-15',
                description: `Entry ${i}`,
                lines: [
                    { account_id: 4320, account_name: 'Expense', debit: '0.01', credit: null, txn_id: `test-${i}` },
                    { account_id: 2122, account_name: 'CC', debit: null, credit: '0.01', txn_id: `test-${i}` },
                ],
            });
        }

        const result = validateJournal(entries);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('1'); // Exactly 1.00, no drift
        expect(result.total_credits).toBe('1');
    });
});
