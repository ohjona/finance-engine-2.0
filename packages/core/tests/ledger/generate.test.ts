import { describe, it, expect } from 'vitest';
import { generateJournal, generateJournalEntry, generateMatchedPaymentEntry } from '../../src/ledger/generate.js';
import type { Transaction, Match, AccountInfo } from '@finance-engine/shared';

// Helper to create account map
function makeAccountMap(): Map<number, AccountInfo> {
    return new Map([
        [1120, { id: 1120, name: 'Chase Checking', type: 'asset' }],
        [2122, { id: 2122, name: 'Amex Delta', type: 'liability' }],
        [3130, { id: 3130, name: 'Reimbursement Income', type: 'income' }],
        [3250, { id: 3250, name: 'Cashback/Rewards', type: 'income' }],
        [4320, { id: 4320, name: 'Restaurants', type: 'expense' }],
        [4410, { id: 4410, name: 'Clothing', type: 'expense' }],
        [4999, { id: 4999, name: 'UNCATEGORIZED', type: 'expense' }],
    ]);
}

// Helper to create transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'txn-' + Math.random().toString(16).slice(2, 10),
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'Test Transaction',
        raw_description: 'TEST TRANSACTION',
        signed_amount: '-50.00',
        account_id: 2122,
        category_id: 4320,
        source_file: 'test.csv',
        confidence: 0.8,
        needs_review: false,
        review_reasons: [],
        ...overrides,
    };
}

describe('generateJournalEntry', () => {
    const accounts = makeAccountMap();

    describe('CC Expenses', () => {
        it('generates DR Expense, CR Liability for CC charge', () => {
            const txn = makeTxn({
                signed_amount: '-47.23',
                account_id: 2122,
                category_id: 4320,
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();
            expect(entry!.lines).toHaveLength(2);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(4320); // Expense
            expect(debitLine?.debit).toBe('47.23');

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(2122); // CC
            expect(creditLine?.credit).toBe('47.23');
        });
    });

    describe('IK D7.1 - Refund Handling', () => {
        it('generates DR Liability, CR Expense for CC refund', () => {
            const txn = makeTxn({
                signed_amount: '+50.00', // Positive on CC = refund
                account_id: 2122,
                category_id: 4410, // Clothing (expense)
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(2122); // Liability
            expect(debitLine?.debit).toBe('50');

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(4410); // Expense
            expect(creditLine?.credit).toBe('50');
        });
    });

    describe('IK D7.2 - Rewards/Cashback', () => {
        it('generates DR Liability, CR Income for CC reward', () => {
            const txn = makeTxn({
                signed_amount: '+25.00', // Positive on CC
                account_id: 2122,
                category_id: 3250, // Cashback/Rewards (income)
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(2122); // Liability

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(3250); // Income
        });
    });

    describe('Bank Transactions', () => {
        it('generates DR Expense, CR Asset for bank expense', () => {
            const txn = makeTxn({
                signed_amount: '-100.00',
                account_id: 1120, // Checking
                category_id: 4320, // Restaurants
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(4320); // Expense

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(1120); // Asset
        });

        it('generates DR Asset, CR Income for bank deposit', () => {
            const txn = makeTxn({
                signed_amount: '+234.56',
                account_id: 1120, // Checking
                category_id: 3130, // Reimbursement
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(1120); // Asset

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(3130); // Income
        });
    });

    describe('IK D7.9 - txn_id Traceability', () => {
        it('includes txn_id on every journal line', () => {
            const txn = makeTxn({ txn_id: 'trace-12345678' });
            const { entry } = generateJournalEntry(txn, 1, accounts);

            for (const line of entry!.lines) {
                expect(line.txn_id).toBe('trace-12345678');
            }
        });
    });

    describe('IK D7.8 - Unknown Account', () => {
        it('warns on unknown account_id but continues', () => {
            const txn = makeTxn({
                account_id: 1199, // Asset range but not in map
                category_id: 4320,
            });

            const { entry, warnings } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();
            expect(warnings.some(w => w.includes('1199'))).toBe(true);
        });
    });
});

describe('generateMatchedPaymentEntry', () => {
    const accounts = makeAccountMap();

    it('generates DR CC, CR Checking for matched payment (IK D7.6)', () => {
        const match: Match = {
            type: 'payment',
            bank_txn_id: 'bank-123',
            cc_txn_ids: ['cc-456'],
            amount: '1234.56',
            date_diff_days: 2,
        };
        const bankTxn = makeTxn({
            txn_id: 'bank-123',
            signed_amount: '-1234.56',
            account_id: 1120,
        });
        const ccTxn = makeTxn({
            txn_id: 'cc-456',
            signed_amount: '1234.56',
            account_id: 2122,
        });

        const { entry } = generateMatchedPaymentEntry(match, bankTxn, [ccTxn], 1, accounts);

        expect(entry.lines).toHaveLength(2);

        const debitLine = entry.lines.find(l => l.debit !== null);
        expect(debitLine?.account_id).toBe(2122); // CC
        expect(debitLine?.debit).toBe('1234.56');

        const creditLine = entry.lines.find(l => l.credit !== null);
        expect(creditLine?.account_id).toBe(1120); // Checking
        expect(creditLine?.credit).toBe('1234.56');
    });

    it('throws error on match amount mismatch (B-6)', () => {
        const match: Match = {
            type: 'payment',
            bank_txn_id: 'b',
            cc_txn_ids: ['c'],
            amount: '100.00',
            date_diff_days: 0,
        };
        const bankTxn = makeTxn({ signed_amount: '-101.00' });
        const ccTxn = makeTxn({ signed_amount: '100.00' });

        expect(() =>
            generateMatchedPaymentEntry(match, bankTxn, [ccTxn], 1, accounts)
        ).toThrow(/Match amount mismatch/);
    });
});

describe('generateJournal', () => {
    const accounts = makeAccountMap();

    it('generates single entry for matched payment (not two)', () => {
        const bankTxn = makeTxn({
            txn_id: 'bank-payment',
            raw_description: 'AMEX AUTOPAY',
            signed_amount: '-500.00',
            account_id: 1120,
            effective_date: '2026-01-15',
        });
        const ccTxn = makeTxn({
            txn_id: 'cc-payment',
            signed_amount: '500.00',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const match: Match = {
            type: 'payment',
            bank_txn_id: 'bank-payment',
            cc_txn_ids: ['cc-payment'],
            amount: '500.00',
            date_diff_days: 0,
        };

        const { entries, stats } = generateJournal([bankTxn, ccTxn], [match], { accounts });

        expect(entries).toHaveLength(1); // One combined entry
        expect(stats.matched_payment_entries).toBe(1);
        expect(stats.regular_entries).toBe(0);
    });

    it('assigns sequential entry IDs ordered by date', () => {
        const txn1 = makeTxn({ effective_date: '2026-01-15' });
        const txn2 = makeTxn({ effective_date: '2026-01-10' });
        const txn3 = makeTxn({ effective_date: '2026-01-20' });

        const { entries } = generateJournal([txn1, txn2, txn3], [], { accounts });

        expect(entries[0].date).toBe('2026-01-10');
        expect(entries[0].entry_id).toBe(1);
        expect(entries[1].date).toBe('2026-01-15');
        expect(entries[1].entry_id).toBe(2);
        expect(entries[2].date).toBe('2026-01-20');
        expect(entries[2].entry_id).toBe(3);
    });

    it('validates journal balance', () => {
        const txn = makeTxn({});
        const { validation } = generateJournal([txn], [], { accounts });

        expect(validation.valid).toBe(true);
        expect(validation.difference).toBe('0');
    });
});
