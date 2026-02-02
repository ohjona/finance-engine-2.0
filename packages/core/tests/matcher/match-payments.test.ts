import { describe, it, expect } from 'vitest';
import { matchPayments } from '../../src/matcher/match-payments.js';
import type { Transaction, PaymentPattern } from '@finance-engine/shared';

// Helper to create minimal Transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'txn-' + Math.random().toString(16).slice(2, 10),
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'Test Transaction',
        raw_description: 'TEST TRANSACTION',
        signed_amount: '-100.00',
        account_id: 1120,
        category_id: 4999,
        source_file: 'test.csv',
        confidence: 0.3,
        needs_review: false,
        review_reasons: [],
        ...overrides,
    };
}

const testPatterns: PaymentPattern[] = [
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [2122] },
    { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [2130] },
];

describe('matchPayments', () => {
    describe('IK D6.5 - Keyword Requirement', () => {
        it('requires both keyword AND pattern to match', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                txn_id: 'cc-1',
                raw_description: 'PAYMENT RECEIVED',
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].bank_txn_id).toBe('bank-1');
            expect(result.matches[0].cc_txn_ids[0]).toBe('cc-1');
        });

        it('rejects match with pattern but no keyword', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX CARD SERVICES', // No PAYMENT keyword
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
        });

        it('rejects match with keyword but no pattern', () => {
            const bankTxn = makeTxn({
                raw_description: 'CREDIT CARD PAYMENT', // No AMEX
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
        });

        it('matches on RECV keyword (IK D6.5)', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank1',
                account_id: 1120, // checking
                signed_amount: '-500.00',
                description: 'ACH RECV AMEX',
                raw_description: 'ACH RECV AMEX',
                effective_date: '2024-01-15',
            });
            const ccTxn = makeTxn({
                txn_id: 'cc1',
                account_id: 2122, // CC
                signed_amount: '500.00',
                description: 'PAYMENT RECEIVED',
                raw_description: 'PAYMENT RECEIVED',
                effective_date: '2024-01-15',
            });

            const result = matchPayments([bankTxn, ccTxn], {
                bankAccountIds: [1120],
                ccAccountIds: [2122],
                patterns: [
                    { keywords: ['PAYMENT', 'AUTOPAY', 'RECV'], pattern: 'AMEX', accounts: [2122] },
                ],
            });

            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].bank_txn_id).toBe('bank1');
            expect(result.matches[0].cc_txn_ids[0]).toBe('cc1');
        });
    });

    describe('IK D6.6 - No Candidate Visibility', () => {
        it('flags when pattern matches but no CC candidate exists', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX AUTOPAY',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            // No CC transactions

            const result = matchPayments([bankTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(1);
            expect(result.reviewUpdates[0].txn_id).toBe('bank-1');
            expect(result.reviewUpdates[0].add_review_reasons).toContain('payment_pattern_no_cc_match');
        });
    });

    describe('IK D6.3 - Ambiguous Resolution', () => {
        it('flags for review when multiple candidates with same date distance', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
                effective_date: '2026-01-15',
            });
            const ccTxn1 = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
                effective_date: '2026-01-17', // 2 days
            });
            const ccTxn2 = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
                effective_date: '2026-01-17', // 2 days (same)
            });

            const result = matchPayments([bankTxn, ccTxn1, ccTxn2], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(1);
            expect(result.reviewUpdates[0].add_review_reasons).toContain('ambiguous_match_candidates');
            expect(result.stats.ambiguous_flagged).toBe(1);
        });
    });

    describe('IK D6.9 - Zero Amount', () => {
        it('skips zero-amount transactions', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '0.00', // Zero
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '0.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(0);
        });
    });

    describe('Pure Function Behavior', () => {
        it('does not mutate input transactions', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
                needs_review: false,
                review_reasons: [],
            });
            const originalNeedsReview = bankTxn.needs_review;
            const originalReasons = [...bankTxn.review_reasons];

            // No CC transactions - will trigger no_candidate flag
            matchPayments([bankTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            // Original should be unchanged
            expect(bankTxn.needs_review).toBe(originalNeedsReview);
            expect(bankTxn.review_reasons).toEqual(originalReasons);
        });
    });

    describe('Multiple Patterns', () => {
        it('matches different CC payments to correct patterns', () => {
            const amexBankTxn = makeTxn({
                txn_id: 'bank-amex',
                raw_description: 'AMEX AUTOPAY',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const chaseBankTxn = makeTxn({
                txn_id: 'bank-chase',
                raw_description: 'CHASE CARD PAYMENT',
                signed_amount: '-300.00',
                account_id: 1120,
            });
            const amexCcTxn = makeTxn({
                txn_id: 'cc-amex',
                signed_amount: '500.00',
                account_id: 2122,
            });
            const chaseCcTxn = makeTxn({
                txn_id: 'cc-chase',
                signed_amount: '300.00',
                account_id: 2130,
            });

            const result = matchPayments(
                [amexBankTxn, chaseBankTxn, amexCcTxn, chaseCcTxn],
                {
                    patterns: testPatterns,
                    bankAccountIds: [1120],
                    ccAccountIds: [2122, 2130],
                }
            );

            expect(result.matches).toHaveLength(2);

            const amexMatch = result.matches.find(m => m.bank_txn_id === 'bank-amex');
            expect(amexMatch?.cc_txn_ids[0]).toBe('cc-amex');

            const chaseMatch = result.matches.find(m => m.bank_txn_id === 'bank-chase');
            expect(chaseMatch?.cc_txn_ids[0]).toBe('cc-chase');
        });
    });

    describe('Statistics', () => {
        it('reports correct stats', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.stats.total_bank_candidates).toBe(1);
            expect(result.stats.total_cc_candidates).toBe(1);
            expect(result.stats.matches_found).toBe(1);
        });
    });

    describe('B-5 - Short Pattern Substring matching', () => {
        it('rejects substring match for short patterns (e.g. BOA vs BOAT)', () => {
            const bankTxn = makeTxn({
                raw_description: 'PAYMENT FOR BOAT RENTAL',
                signed_amount: '-100.00',
            });
            const result = matchPayments([bankTxn], {
                patterns: [{ keywords: ['PAYMENT'], pattern: 'BOA', accounts: [2122] }],
                bankAccountIds: [1120],
            });
            expect(result.matches).toHaveLength(0);
        });

        it('still matches short patterns with word boundaries (e.g. BOA-123)', () => {
            const bankTxn = makeTxn({
                raw_description: 'PAYMENT TO BOA-1234',
                signed_amount: '-100.00',
            });
            const ccTxn = makeTxn({ signed_amount: '100.00', account_id: 2122 });
            const result = matchPayments([bankTxn, ccTxn], {
                patterns: [{ keywords: ['PAYMENT'], pattern: 'BOA', accounts: [2122] }],
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });
            expect(result.matches).toHaveLength(1);
        });
    });

    it('solves greedy matching by ranking candidates (B-2)', () => {
        // bank1 window: Jan 10-20. Matches: cc1 (15), cc2 (19). cc1 is closer.
        const bank1 = makeTxn({
            txn_id: 'bank-1',
            signed_amount: '-100.00',
            raw_description: 'PAYMENT AMEX',
            effective_date: '2026-01-15'
        });
        // bank2 window: Jan 05-15. Matches only cc1 (15).
        const bank2 = makeTxn({
            txn_id: 'bank-2',
            signed_amount: '-100.00',
            raw_description: 'PAYMENT AMEX',
            effective_date: '2026-01-10'
        });

        const cc1 = makeTxn({
            txn_id: 'cc-1',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-15'
        });
        const cc2 = makeTxn({
            txn_id: 'cc-2',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-19'
        });

        // If processing bank1 first greedily, it would take cc1 (closer date), leaving bank2 with nothing.
        // Ranking by candidate count should process bank2 first.

        const result = matchPayments([bank1, bank2, cc1, cc2], {
            patterns: [{ keywords: ['PAYMENT'], pattern: 'AMEX', accounts: [2122] }],
            bankAccountIds: [1120],
            ccAccountIds: [2122]
        });

        expect(result.matches.length).toBe(2);
        const bank1Match = result.matches.find(m => m.bank_txn_id === 'bank-1');
        const bank2Match = result.matches.find(m => m.bank_txn_id === 'bank-2');

        expect(bank2Match?.cc_txn_ids[0]).toBe('cc-1');
        expect(bank1Match?.cc_txn_ids[0]).toBe('cc-2');
    });

    it('matches one bank withdrawal to multiple CC payments (B-3)', () => {
        const bankTxn = makeTxn({
            txn_id: 'bank-batch',
            signed_amount: '-1000.00',
            raw_description: 'PAYMENT AMEX',
            effective_date: '2026-01-15'
        });

        const cc1 = makeTxn({
            txn_id: 'cc-1',
            signed_amount: '600.00',
            account_id: 2122,
            effective_date: '2026-01-15'
        });
        const cc2 = makeTxn({
            txn_id: 'cc-2',
            signed_amount: '400.00',
            account_id: 2122,
            effective_date: '2026-01-15'
        });

        const result = matchPayments([bankTxn, cc1, cc2], {
            patterns: [{ keywords: ['PAYMENT'], pattern: 'AMEX', accounts: [2122] }],
            bankAccountIds: [1120],
            ccAccountIds: [2122]
        });

        expect(result.matches).toHaveLength(1);
        expect(result.matches[0].cc_txn_ids).toHaveLength(2);
        expect(result.matches[0].cc_txn_ids).toContain('cc-1');
        expect(result.matches[0].cc_txn_ids).toContain('cc-2');
        expect(result.matches[0].amount).toBe('1000');
    });
});
