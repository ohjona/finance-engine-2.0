import { describe, it, expect } from 'vitest';
import {
    TransactionSchema,
    RuleSchema,
    RuleSetSchema,
    AccountSchema,
    ChartOfAccountsSchema,
    ParseResultSchema,
} from '../src/schemas.js';

describe('TransactionSchema', () => {
    const validTransaction = {
        txn_id: 'a1b2c3d4e5f67890',
        txn_date: '2026-01-15',
        post_date: '2026-01-16',
        effective_date: '2026-01-15',
        description: 'UBER TRIP',
        raw_description: 'UBER *TRIP HELP.UBER.COM',
        signed_amount: '-23.45',
        account_id: 2122,
        category_id: 4260,
        raw_category: 'Transportation-Taxi',
        source_file: 'amex_2122_202601.xlsx',
        confidence: 0.95,
        needs_review: false,
        review_reasons: [],
    };

    it('validates a complete transaction', () => {
        const result = TransactionSchema.safeParse(validTransaction);
        expect(result.success).toBe(true);
    });

    it('accepts txn_id with collision suffix', () => {
        const withSuffix = { ...validTransaction, txn_id: 'a1b2c3d4e5f67890-02' };
        const result = TransactionSchema.safeParse(withSuffix);
        expect(result.success).toBe(true);
    });

    it('rejects invalid txn_id length', () => {
        const invalid = { ...validTransaction, txn_id: 'tooshort' };
        const result = TransactionSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('rejects invalid date format', () => {
        const invalid = { ...validTransaction, txn_date: '01/15/2026' };
        const result = TransactionSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('rejects account_id outside valid range', () => {
        const tooLow = { ...validTransaction, account_id: 999 };
        const tooHigh = { ...validTransaction, account_id: 10000 };
        expect(TransactionSchema.safeParse(tooLow).success).toBe(false);
        expect(TransactionSchema.safeParse(tooHigh).success).toBe(false);
    });

    it('rejects invalid decimal string', () => {
        const invalid = { ...validTransaction, signed_amount: 'not-a-number' };
        const result = TransactionSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it('accepts positive signed_amount (refunds)', () => {
        const refund = { ...validTransaction, signed_amount: '50.00' };
        const result = TransactionSchema.safeParse(refund);
        expect(result.success).toBe(true);
    });

    it('accepts zero signed_amount', () => {
        const zero = { ...validTransaction, signed_amount: '0' };
        const result = TransactionSchema.safeParse(zero);
        expect(result.success).toBe(true);
    });
});

describe('RuleSchema', () => {
    it('validates a basic rule with defaults', () => {
        const basic = { pattern: 'UBER', category_id: 4260 };
        const result = RuleSchema.safeParse(basic);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.pattern_type).toBe('substring');
        }
    });

    it('validates a complete rule', () => {
        const complete = {
            pattern: 'WARBY PARKER',
            pattern_type: 'substring' as const,
            category_id: 4550,
            note: 'Vision/eyewear',
            added_date: '2026-01-18',
            source: 'manual' as const,
        };
        const result = RuleSchema.safeParse(complete);
        expect(result.success).toBe(true);
    });

    it('validates regex pattern type', () => {
        const regex = {
            pattern: 'WHOLEFDS|WHOLE FOODS',
            pattern_type: 'regex' as const,
            category_id: 4310,
        };
        const result = RuleSchema.safeParse(regex);
        expect(result.success).toBe(true);
    });

    it('rejects empty pattern', () => {
        const empty = { pattern: '', category_id: 4260 };
        const result = RuleSchema.safeParse(empty);
        expect(result.success).toBe(false);
    });
});

describe('RuleSetSchema', () => {
    it('validates a complete ruleset', () => {
        const valid = {
            user_rules: [{ pattern: 'WARBY', category_id: 4550 }],
            shared_rules: [{ pattern: 'NETFLIX', category_id: 4610 }],
            base_rules: [{ pattern: 'UBER', category_id: 4260 }],
        };
        const result = RuleSetSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    it('validates empty ruleset', () => {
        const empty = { user_rules: [], shared_rules: [], base_rules: [] };
        const result = RuleSetSchema.safeParse(empty);
        expect(result.success).toBe(true);
    });
});

describe('AccountSchema', () => {
    it('validates asset account', () => {
        const asset = { name: 'Chase Checking 6917', type: 'asset' as const, institution: 'Chase' };
        expect(AccountSchema.safeParse(asset).success).toBe(true);
    });

    it('validates expense account with parent', () => {
        const expense = {
            name: 'Rideshare (Uber/Lyft)',
            type: 'expense' as const,
            parent: '4200 - Transportation',
        };
        expect(AccountSchema.safeParse(expense).success).toBe(true);
    });

    it('rejects invalid account type', () => {
        const invalid = { name: 'Test', type: 'invalid' };
        expect(AccountSchema.safeParse(invalid).success).toBe(false);
    });
});

describe('ChartOfAccountsSchema', () => {
    it('validates chart of accounts', () => {
        const valid = {
            accounts: {
                '1120': { name: 'Chase Checking', type: 'asset' as const, institution: 'Chase' },
                '2122': { name: 'Amex Delta', type: 'liability' as const, institution: 'Amex' },
                '4260': { name: 'Rideshare', type: 'expense' as const, parent: '4200 - Transportation' },
            },
        };
        expect(ChartOfAccountsSchema.safeParse(valid).success).toBe(true);
    });
});

describe('ParseResultSchema', () => {
    it('validates parse result with transactions', () => {
        const valid = {
            transactions: [
                {
                    txn_id: 'a1b2c3d4e5f67890',
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
                },
            ],
            warnings: ['Skipped 2 rows with invalid dates'],
            skippedRows: 2,
        };
        expect(ParseResultSchema.safeParse(valid).success).toBe(true);
    });

    it('validates empty parse result', () => {
        const empty = { transactions: [], warnings: [], skippedRows: 0 };
        expect(ParseResultSchema.safeParse(empty).success).toBe(true);
    });
});
