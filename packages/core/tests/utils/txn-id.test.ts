import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { generateTxnId, resolveCollisions, buildCollisionMap } from '../../src/utils/txn-id.js';
import type { Transaction } from '../../src/types/index.js';

describe('generateTxnId', () => {
    it('generates 16-character hex string', () => {
        const id = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        expect(id).toHaveLength(16);
        expect(id).toMatch(/^[0-9a-f]{16}$/);
    });

    it('is deterministic - same input produces same output', () => {
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        expect(id1).toBe(id2);
    });

    it('produces different IDs for different dates', () => {
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-16', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        expect(id1).not.toBe(id2);
    });

    it('produces different IDs for different descriptions', () => {
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'LYFT *RIDE', new Decimal('-23.45'), 2122);
        expect(id1).not.toBe(id2);
    });

    it('produces different IDs for different amounts', () => {
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-25.00'), 2122);
        expect(id1).not.toBe(id2);
    });

    it('produces different IDs for different accounts', () => {
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2120);
        expect(id1).not.toBe(id2);
    });

    it('handles positive amounts (refunds)', () => {
        const id = generateTxnId('2026-01-15', 'REFUND', new Decimal('50.00'), 2122);
        expect(id).toHaveLength(16);
    });

    it('handles zero amount', () => {
        const id = generateTxnId('2026-01-15', 'ZERO', new Decimal('0'), 2122);
        expect(id).toHaveLength(16);
    });

    it('normalizes trailing zeros in amount', () => {
        // Per IK D2.12: amounts should be normalized
        const id1 = generateTxnId('2026-01-15', 'TEST', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'TEST', new Decimal('-23.450'), 2122);
        expect(id1).toBe(id2);
    });

    it('uses raw description for hash (not normalized)', () => {
        // Per IK D2.12: hash uses raw_description, not normalized
        const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
        const id2 = generateTxnId('2026-01-15', 'UBER TRIP', new Decimal('-23.45'), 2122);
        expect(id1).not.toBe(id2); // Different because raw description differs
    });
});

describe('resolveCollisions', () => {
    const makeTxn = (id: string): Transaction => ({
        txn_id: id,
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'TEST',
        raw_description: 'TEST',
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: 4999,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    });

    it('returns new array (does not mutate input)', () => {
        const original = [makeTxn('aaaa111111111111')];
        const result = resolveCollisions(original);
        expect(result).not.toBe(original);
        expect(result[0]).not.toBe(original[0]);
    });

    it('leaves unique IDs unchanged', () => {
        const txns = [
            makeTxn('aaaa111111111111'),
            makeTxn('bbbb222222222222'),
            makeTxn('cccc333333333333'),
        ];

        const result = resolveCollisions(txns);

        expect(result[0].txn_id).toBe('aaaa111111111111');
        expect(result[1].txn_id).toBe('bbbb222222222222');
        expect(result[2].txn_id).toBe('cccc333333333333');
    });

    it('adds suffix to duplicate IDs', () => {
        const txns = [
            makeTxn('aaaa111111111111'),
            makeTxn('aaaa111111111111'),
            makeTxn('aaaa111111111111'),
        ];

        const result = resolveCollisions(txns);

        expect(result[0].txn_id).toBe('aaaa111111111111');
        expect(result[1].txn_id).toBe('aaaa111111111111-02');
        expect(result[2].txn_id).toBe('aaaa111111111111-03');
    });

    it('handles mixed unique and duplicate IDs', () => {
        const txns = [
            makeTxn('aaaa111111111111'),
            makeTxn('bbbb222222222222'),
            makeTxn('aaaa111111111111'),
            makeTxn('cccc333333333333'),
            makeTxn('aaaa111111111111'),
        ];

        const result = resolveCollisions(txns);

        expect(result[0].txn_id).toBe('aaaa111111111111');
        expect(result[1].txn_id).toBe('bbbb222222222222');
        expect(result[2].txn_id).toBe('aaaa111111111111-02');
        expect(result[3].txn_id).toBe('cccc333333333333');
        expect(result[4].txn_id).toBe('aaaa111111111111-03');
    });

    it('preserves all other transaction fields', () => {
        const txn = makeTxn('aaaa111111111111');
        txn.description = 'ORIGINAL';
        txn.signed_amount = '-99.99';

        const result = resolveCollisions([txn, makeTxn('aaaa111111111111')]);

        expect(result[0].description).toBe('ORIGINAL');
        expect(result[0].signed_amount).toBe('-99.99');
    });
});

describe('buildCollisionMap', () => {
    const makeTxn = (id: string): Transaction => ({
        txn_id: id,
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'TEST',
        raw_description: 'TEST',
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: 4999,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    });

    it('returns empty map for no collisions', () => {
        const txns = [makeTxn('aaaa111111111111'), makeTxn('bbbb222222222222')];
        const map = buildCollisionMap(txns);
        expect(map).toEqual({});
    });

    it('includes collision counts for duplicates', () => {
        const txns = [
            makeTxn('aaaa111111111111'),
            makeTxn('aaaa111111111111-02'),
            makeTxn('aaaa111111111111-03'),
            makeTxn('bbbb222222222222'),
        ];

        const map = buildCollisionMap(txns);
        expect(map).toEqual({ aaaa111111111111: 3 });
    });

    it('handles multiple collision groups', () => {
        const txns = [
            makeTxn('aaaa111111111111'),
            makeTxn('aaaa111111111111-02'),
            makeTxn('bbbb222222222222'),
            makeTxn('bbbb222222222222-02'),
        ];

        const map = buildCollisionMap(txns);
        expect(map).toEqual({
            aaaa111111111111: 2,
            bbbb222222222222: 2,
        });
    });
});
