import { describe, it, expect } from 'vitest';
import { categorize, categorizeAll } from '../../src/categorizer/categorize.js';
import { CONFIDENCE, UNCATEGORIZED_CATEGORY_ID } from '../../src/types/index.js';
import type { Transaction, RuleSet, Rule } from '../../src/types/index.js';
import type { BankCategoryMap } from '../../src/categorizer/types.js';

// Helper to create minimal transaction
function makeTxn(description: string, rawCategory?: string): Transaction {
    return {
        txn_id: 'a1b2c3d4e5f67890',
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: description.toUpperCase(),
        raw_description: description,
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: UNCATEGORIZED_CATEGORY_ID,
        raw_category: rawCategory,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    };
}

const emptyRules: RuleSet = {
    user_rules: [],
    shared_rules: [],
    base_rules: [],
};

describe('categorize', () => {
    describe('layer priority', () => {
        const rules: RuleSet = {
            user_rules: [{ pattern: 'UBER', category_id: 1001, pattern_type: 'substring' }],
            shared_rules: [{ pattern: 'UBER', category_id: 2001, pattern_type: 'substring' }],
            base_rules: [{ pattern: 'UBER', category_id: 3001, pattern_type: 'substring' }],
        };

        it('user_rules takes precedence over shared_rules', () => {
            const txn = makeTxn('UBER TRIP');
            const { result } = categorize(txn, rules);
            expect(result.category_id).toBe(1001);
            expect(result.source).toBe('user');
        });

        it('shared_rules takes precedence over base_rules', () => {
            const rulesNoUser: RuleSet = {
                user_rules: [],
                shared_rules: [{ pattern: 'UBER', category_id: 2001, pattern_type: 'substring' }],
                base_rules: [{ pattern: 'UBER', category_id: 3001, pattern_type: 'substring' }],
            };
            const txn = makeTxn('UBER TRIP');
            const { result } = categorize(txn, rulesNoUser);
            expect(result.category_id).toBe(2001);
            expect(result.source).toBe('shared');
        });

        it('base_rules takes precedence over bank_category', () => {
            const rulesBaseOnly: RuleSet = {
                user_rules: [],
                shared_rules: [],
                base_rules: [{ pattern: 'UBER', category_id: 3001, pattern_type: 'substring' }],
            };
            const bankMap: BankCategoryMap = { 'TRANSPORTATION': 4001 };
            const txn = makeTxn('UBER TRIP', 'Transportation');
            const { result } = categorize(txn, rulesBaseOnly, { bankCategoryMap: bankMap });
            expect(result.category_id).toBe(3001);
            expect(result.source).toBe('base');
        });

        it('bank_category used when no rules match', () => {
            const bankMap: BankCategoryMap = { 'TRANSPORTATION': 4001 };
            const txn = makeTxn('RANDOM TAXI', 'Transportation');
            const { result } = categorize(txn, emptyRules, { bankCategoryMap: bankMap });
            expect(result.category_id).toBe(4001);
            expect(result.source).toBe('bank');
        });

        it('returns UNCATEGORIZED when nothing matches', () => {
            const txn = makeTxn('RANDOM TRANSACTION');
            const { result } = categorize(txn, emptyRules);
            expect(result.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
            expect(result.source).toBe('uncategorized');
        });
    });

    describe('confidence scores', () => {
        it('returns 1.0 for user_rules match', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260, pattern_type: 'substring' }],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER TRIP'), rules);
            expect(result.confidence).toBe(CONFIDENCE.USER_RULES);
        });

        it('returns 0.9 for shared_rules match', () => {
            const rules: RuleSet = {
                user_rules: [],
                shared_rules: [{ pattern: 'NETFLIX', category_id: 4610, pattern_type: 'substring' }],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('NETFLIX SUBSCRIPTION'), rules);
            expect(result.confidence).toBe(CONFIDENCE.SHARED_RULES);
        });

        it('returns 0.8 for base_rules match', () => {
            const rules: RuleSet = {
                user_rules: [],
                shared_rules: [],
                base_rules: [{ pattern: 'AMAZON', category_id: 4310, pattern_type: 'substring' }],
            };
            const { result } = categorize(makeTxn('AMAZON PURCHASE'), rules);
            expect(result.confidence).toBe(CONFIDENCE.BASE_RULES);
        });

        it('returns 0.6 for bank_category match', () => {
            const bankMap: BankCategoryMap = { 'GROCERIES': 4310 };
            const txn = makeTxn('WHOLE FOODS', 'Groceries');
            const { result } = categorize(txn, emptyRules, { bankCategoryMap: bankMap });
            expect(result.confidence).toBe(CONFIDENCE.BANK_CATEGORY);
        });

        it('returns 0.3 for UNCATEGORIZED', () => {
            const { result } = categorize(makeTxn('RANDOM'), emptyRules);
            expect(result.confidence).toBe(CONFIDENCE.UNCATEGORIZED);
        });
    });

    describe('needs_review flag', () => {
        it('sets needs_review=true for UNCATEGORIZED', () => {
            const { result } = categorize(makeTxn('RANDOM'), emptyRules);
            expect(result.needs_review).toBe(true);
            expect(result.review_reasons).toContain('no_rule_match');
        });

        it('sets needs_review=false for rule matches', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260, pattern_type: 'substring' }],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER TRIP'), rules);
            expect(result.needs_review).toBe(false);
            expect(result.review_reasons).toHaveLength(0);
        });
    });

    describe('warning collection', () => {
        it('collects invalid regex warnings', () => {
            const rules: RuleSet = {
                user_rules: [
                    { pattern: '[invalid', pattern_type: 'regex', category_id: 4260 },
                    { pattern: 'UBER', category_id: 4260, pattern_type: 'substring' },
                ],
                shared_rules: [],
                base_rules: [],
            };
            const { result, warnings } = categorize(makeTxn('UBER TRIP'), rules);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('Invalid regex');
            // Should still match UBER rule
            expect(result.category_id).toBe(4260);
        });

        it('returns empty warnings when all rules valid', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260, pattern_type: 'substring' }],
                shared_rules: [],
                base_rules: [],
            };
            const { warnings } = categorize(makeTxn('UBER TRIP'), rules);
            expect(warnings).toHaveLength(0);
        });
    });

    describe('rule ordering', () => {
        it('first matching rule wins (UBER EATS before UBER)', () => {
            const rules: RuleSet = {
                user_rules: [
                    { pattern: 'UBER EATS', category_id: 4320, pattern_type: 'substring' }, // Dining
                    { pattern: 'UBER', category_id: 4260, pattern_type: 'substring' }, // Transport
                ],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER EATS ORDER'), rules);
            expect(result.category_id).toBe(4320);
        });

        it('user rule shadows shared rule for same pattern', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'NETFLIX', category_id: 9999, pattern_type: 'substring' }],
                shared_rules: [{ pattern: 'NETFLIX', category_id: 4610, pattern_type: 'substring' }],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('NETFLIX'), rules);
            expect(result.category_id).toBe(9999);
            expect(result.source).toBe('user');
        });
    });
});

describe('categorizeAll', () => {
    const rules: RuleSet = {
        user_rules: [{ pattern: 'WARBY', category_id: 4550, pattern_type: 'substring' }],
        shared_rules: [{ pattern: 'NETFLIX', category_id: 4610, pattern_type: 'substring' }],
        base_rules: [{ pattern: 'UBER', category_id: 4260, pattern_type: 'substring' }],
    };

    it('processes all transactions', () => {
        const transactions = [
            makeTxn('WARBY PARKER'),
            makeTxn('NETFLIX'),
            makeTxn('UBER TRIP'),
            makeTxn('RANDOM'),
        ];

        const { transactions: result } = categorizeAll(transactions, rules);

        expect(result).toHaveLength(4);
        expect(result[0].category_id).toBe(4550);
        expect(result[1].category_id).toBe(4610);
        expect(result[2].category_id).toBe(4260);
        expect(result[3].category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
    });

    it('returns stats by source', () => {
        const transactions = [
            makeTxn('WARBY PARKER'),
            makeTxn('NETFLIX'),
            makeTxn('UBER TRIP'),
            makeTxn('RANDOM'),
        ];

        const { stats } = categorizeAll(transactions, rules);

        expect(stats.total).toBe(4);
        expect(stats.bySource.user).toBe(1);
        expect(stats.bySource.shared).toBe(1);
        expect(stats.bySource.base).toBe(1);
        expect(stats.bySource.uncategorized).toBe(1);
    });

    it('counts needsReview transactions', () => {
        const transactions = [
            makeTxn('RANDOM 1'),
            makeTxn('RANDOM 2'),
            makeTxn('UBER TRIP'),
        ];

        const { stats } = categorizeAll(transactions, rules);

        expect(stats.needsReview).toBe(2);
    });

    it('aggregates warnings from all categorizations', () => {
        const rulesWithBadRegex: RuleSet = {
            user_rules: [{ pattern: '[bad', pattern_type: 'regex', category_id: 1 }],
            shared_rules: [],
            base_rules: [],
        };

        const transactions = [makeTxn('A'), makeTxn('B'), makeTxn('C')];

        const { warnings } = categorizeAll(transactions, rulesWithBadRegex);

        // Should dedupe - only one warning even though 3 transactions
        expect(warnings.length).toBe(1);
    });
});
