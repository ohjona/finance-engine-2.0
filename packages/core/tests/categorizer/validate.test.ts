import { describe, it, expect } from 'vitest';
import { validatePattern, checkPatternCollision } from '../../src/categorizer/validate.js';
import type { Rule, Transaction } from '../../src/types/index.js';

// Helper to create minimal transaction
function makeTxn(description: string): Transaction {
    return {
        txn_id: 'a1b2c3d4e5f67890',
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: description.toUpperCase(),
        raw_description: description,
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: 4999,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    };
}

describe('validatePattern', () => {
    describe('syntax validation', () => {
        it('rejects empty pattern', () => {
            const result = validatePattern('');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Pattern cannot be empty');
        });

        it('rejects whitespace-only pattern', () => {
            const result = validatePattern('   ');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Pattern cannot be empty');
        });

        it('rejects pattern shorter than MIN_LENGTH (5)', () => {
            const result = validatePattern('UBER');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 5 characters');
        });

        it('accepts pattern of exactly MIN_LENGTH', () => {
            const result = validatePattern('UBERX');
            expect(result.valid).toBe(true);
        });

        it('rejects invalid regex syntax', () => {
            const result = validatePattern('[invalid', 'regex');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid regex syntax');
        });

        it('accepts valid regex pattern', () => {
            const result = validatePattern('UBER|LYFT', 'regex');
            expect(result.valid).toBe(true);
        });
    });

    describe('breadth validation (with transactions)', () => {
        const transactions = [
            makeTxn('UBER TRIP 1'),
            makeTxn('UBER TRIP 2'),
            makeTxn('UBER TRIP 3'),
            makeTxn('UBER TRIP 4'),
            makeTxn('LYFT RIDE'),
            makeTxn('STARBUCKS'),
            makeTxn('AMAZON'),
            makeTxn('NETFLIX'),
            makeTxn('SPOTIFY'),
            makeTxn('TARGET'),
        ];

        it('warns when pattern matches >20% AND >3 transactions', () => {
            // UBER matches 4/10 = 40%
            const result = validatePattern('UBER ', 'substring', transactions);
            expect(result.valid).toBe(true); // Still valid, just warned
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('too broad');
            expect(result.matchCount).toBe(4);
            expect(result.matchPercent).toBe(0.4);
        });

        it('does not warn when matches <= threshold', () => {
            // LYFT matches 1/10 = 10%
            const result = validatePattern('LYFT ', 'substring', transactions);
            expect(result.warnings.length).toBe(0);
            expect(result.matchCount).toBe(1);
        });

        it('returns match statistics', () => {
            const result = validatePattern('STARBUCKS', 'substring', transactions);
            expect(result.matchCount).toBe(1);
            expect(result.matchPercent).toBe(0.1);
        });

        it('handles empty transactions array', () => {
            const result = validatePattern('VALID', 'substring', []);
            expect(result.valid).toBe(true);
            expect(result.matchCount).toBeUndefined();
        });
    });
});

describe('checkPatternCollision', () => {
    const existingRules: Rule[] = [
        { pattern: 'UBER', category_id: 4260, pattern_type: 'substring' },
        { pattern: 'UBER EATS', category_id: 4320, pattern_type: 'substring' },
        { pattern: 'AMAZON', category_id: 4310, pattern_type: 'substring' },
    ];

    it('detects exact match collision', () => {
        const result = checkPatternCollision('UBER', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER');
    });

    it('detects substring overlap (new contains existing)', () => {
        const result = checkPatternCollision('UBER TRIP', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER');
    });

    it('detects substring overlap (existing contains new)', () => {
        const result = checkPatternCollision('EATS', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER EATS');
    });

    it('returns no collision for unique pattern', () => {
        const result = checkPatternCollision('NETFLIX', 'substring', existingRules);
        expect(result.hasCollision).toBe(false);
        expect(result.collidingPatterns).toHaveLength(0);
    });

    it('handles empty existing rules', () => {
        const result = checkPatternCollision('ANYTHING', 'substring', []);
        expect(result.hasCollision).toBe(false);
    });
});
