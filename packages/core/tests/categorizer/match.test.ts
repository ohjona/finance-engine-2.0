import { describe, it, expect } from 'vitest';
import { matchesPattern, isValidPattern } from '../../src/categorizer/match.js';
import { normalizeDescription } from '../../src/utils/normalize.js';
import type { Rule } from '../../src/types/index.js';

describe('matchesPattern', () => {
    describe('substring matching', () => {
        it('matches case-insensitively', () => {
            const rule: Rule = { pattern: 'UBER', category_id: 4260, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription('UBER TRIP'), rule).matched).toBe(true);
            expect(matchesPattern(normalizeDescription('uber trip'), rule).matched).toBe(true);
        });

        it('matches partial description', () => {
            const rule: Rule = { pattern: 'AMAZON', category_id: 4310, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription('AMZN MKTP US AMAZON.COM'), rule).matched).toBe(true);
        });

        it('normalizes pattern before matching', () => {
            // Pattern with special chars gets normalized
            const rule: Rule = { pattern: 'UBER*TRIP', category_id: 4260, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription('UBER TRIP HELP.UBER.COM'), rule).matched).toBe(true);
        });

        it('does not match when pattern not present', () => {
            const rule: Rule = { pattern: 'NETFLIX', category_id: 4610, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription('SPOTIFY PREMIUM'), rule).matched).toBe(false);
        });

        it('handles empty description', () => {
            const rule: Rule = { pattern: 'UBER', category_id: 4260, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription(''), rule).matched).toBe(false);
        });
    });

    describe('regex matching', () => {
        it('matches valid regex pattern', () => {
            const rule: Rule = {
                pattern: 'UBER|LYFT',
                pattern_type: 'regex',
                category_id: 4260,
            };
            expect(matchesPattern('UBER TRIP', rule).matched).toBe(true);
            expect(matchesPattern('LYFT RIDE', rule).matched).toBe(true);
            expect(matchesPattern('TAXI CAB', rule).matched).toBe(false);
        });

        it('supports complex regex', () => {
            const rule: Rule = {
                pattern: 'WHOLEFDS|WHOLE\\s*FOODS',
                pattern_type: 'regex',
                category_id: 4310,
            };
            expect(matchesPattern('WHOLEFDS MKT', rule).matched).toBe(true);
            expect(matchesPattern('WHOLE FOODS MARKET', rule).matched).toBe(true);
        });

        it('returns warning for invalid regex', () => {
            const rule: Rule = {
                pattern: '[invalid(regex',
                pattern_type: 'regex',
                category_id: 4260,
            };
            const result = matchesPattern(normalizeDescription('TEST'), rule);
            expect(result.matched).toBe(false);
            expect(result.warning).toContain('Invalid regex pattern');
        });

        it('does not crash on malformed regex', () => {
            const rule: Rule = {
                pattern: '(?!broken',
                pattern_type: 'regex',
                category_id: 4260,
            };
            // Should not throw
            const result = matchesPattern(normalizeDescription('TEST'), rule);
            expect(result.matched).toBe(false);
            expect(result.warning).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('defaults to substring when pattern_type not specified', () => {
            // Note: In real usage, Rule objects from DB/JSON will have defaults applied.
            // For manual test objects, we still cast to Rule.
            const rule = { pattern: 'TEST', category_id: 4990 } as Rule;
            expect(matchesPattern(normalizeDescription('TEST TRANSACTION'), rule).matched).toBe(true);
        });

        it('handles pattern with asterisks (normalized away)', () => {
            const rule: Rule = { pattern: 'AMZN*MKTP', category_id: 4310, pattern_type: 'substring' };
            expect(matchesPattern(normalizeDescription('AMZN MKTP US'), rule).matched).toBe(true);
        });
    });
});

describe('isValidPattern', () => {
    it('returns true for valid substring patterns', () => {
        expect(isValidPattern('UBER', 'substring')).toBe(true);
        expect(isValidPattern('', 'substring')).toBe(true);
    });

    it('returns true for valid regex patterns', () => {
        expect(isValidPattern('UBER|LYFT', 'regex')).toBe(true);
        expect(isValidPattern('^AMAZON.*$', 'regex')).toBe(true);
    });

    it('returns false for invalid regex patterns', () => {
        expect(isValidPattern('[invalid', 'regex')).toBe(false);
        expect(isValidPattern('(?!broken', 'regex')).toBe(false);
    });
});
