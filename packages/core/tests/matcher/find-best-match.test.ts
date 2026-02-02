import { describe, it, expect } from 'vitest';
import { findBestMatch } from '../../src/matcher/find-best-match.js';
import type { Transaction, MatchConfig } from '@finance-engine/shared';

// Helper to create minimal Transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'test-' + Math.random().toString(16).slice(2, 10),
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

const defaultConfig: MatchConfig = {
    dateToleranceDays: 5,
    amountTolerance: '0.01',
};

describe('findBestMatch', () => {
    it('returns no_candidates when no CC transactions', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', account_id: 1120 });
        const result = findBestMatch(bankTxn, [], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns no_candidates when no amount match', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00' });
        const ccTxn = makeTxn({
            signed_amount: '200.00',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns no_candidates when date outside tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-25', // 10 days away
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns single candidate when only one matches', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-match',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.match!.txn_id).toBe('cc-match');
        expect(result.reason).toBe('found');
    });

    it('picks closest date when multiple candidates', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-close',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-16', // 1 day
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-far',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-19', // 4 days
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.match!.txn_id).toBe('cc-close');
        expect(result.reason).toBe('found');
    });

    it('returns ambiguous when tie on date distance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-tie-1',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-tie-2',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days (same)
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('ambiguous');
    });

    it('filters by possible accounts', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.00',
            account_id: 2130, // Chase Card
            effective_date: '2026-01-15',
        });
        // Looking for Amex (2122), not Chase (2130)
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('matches within $0.01 tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-penny-off',
            signed_amount: '100.01',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.reason).toBe('found');
    });

    it('rejects when amount beyond $0.01 tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.02', // $0.02 off
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('matches at exactly 5 day tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-5-days',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-20', // exactly 5 days
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.reason).toBe('found');
    });

    it('tie-breaks by amount delta when dates are equal (B-4)', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-exact',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-tolerance',
            signed_amount: '100.01',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days (same)
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.match!.txn_id).toBe('cc-exact');
        expect(result.reason).toBe('found');
    });

    it('returns ambiguous when both date and amount delta are tied (B-4)', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-tied-1',
            signed_amount: '100.01',
            account_id: 2122,
            effective_date: '2026-01-17',
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-tied-2',
            signed_amount: '100.01',
            account_id: 2122,
            effective_date: '2026-01-17',
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('ambiguous');
    });
});
