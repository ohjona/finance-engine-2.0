import { describe, it, expect } from 'vitest';
import { categorize } from '../../src/categorizer/categorize.js';
import { matchPayments } from '../../src/matcher/match-payments.js';
import { generateJournal } from '../../src/ledger/generate.js';
import type { Transaction, RuleSet, ChartOfAccounts, AccountInfo } from '@finance-engine/shared';

describe('Matcher-Ledger Integration', () => {
    it('successfully processes bank and CC transactions into a balanced journal', () => {
        // 1. Setup Data
        const chart: ChartOfAccounts = {
            accounts: {
                '1120': { name: 'Chase Checking', type: 'asset' },
                '2122': { name: 'Amex Delta', type: 'liability' },
                '4320': { name: 'Restaurants', type: 'expense' },
                '4410': { name: 'Clothing', type: 'expense' },
            },
        };

        const accountMap = new Map<number, AccountInfo>();
        for (const [idStr, acc] of Object.entries(chart.accounts)) {
            const id = parseInt(idStr, 10);
            accountMap.set(id, { id, ...acc });
        }

        const rules: RuleSet = {
            user_rules: [
                { pattern: 'CHIPOTLE', category_id: 4320, pattern_type: 'substring' },
                { pattern: 'ZARA', category_id: 4410, pattern_type: 'substring' },
            ],
            shared_rules: [],
            base_rules: [],
        };

        const transactions: Transaction[] = [
            // CC Charges
            {
                txn_id: 'cc-1',
                txn_date: '2026-01-10',
                post_date: '2026-01-10',
                effective_date: '2026-01-10',
                description: 'CHIPOTLE 123',
                raw_description: 'CHIPOTLE 123',
                signed_amount: '-15.42',
                account_id: 2122,
                category_id: 4999, // Uncategorized initially
                source_file: 'amex.csv',
                confidence: 0,
                needs_review: false,
                review_reasons: [],
            },
            {
                txn_id: 'cc-2',
                txn_date: '2026-01-12',
                post_date: '2026-01-12',
                effective_date: '2026-01-12',
                description: 'ZARA NEW YORK',
                raw_description: 'ZARA NEW YORK',
                signed_amount: '-89.99',
                account_id: 2122,
                category_id: 4999,
                source_file: 'amex.csv',
                confidence: 0,
                needs_review: false,
                review_reasons: [],
            },
            // CC Payment Received
            {
                txn_id: 'cc-pay',
                txn_date: '2026-01-15',
                post_date: '2026-01-15',
                effective_date: '2026-01-15',
                description: 'PAYMENT RECEIVED',
                raw_description: 'PAYMENT RECEIVED',
                signed_amount: '105.41',
                account_id: 2122,
                category_id: 4999,
                source_file: 'amex.csv',
                confidence: 0,
                needs_review: false,
                review_reasons: [],
            },
            // Bank Withdrawal (the payment)
            {
                txn_id: 'bank-pay',
                txn_date: '2026-01-17',
                post_date: '2026-01-17',
                effective_date: '2026-01-17',
                description: 'AMEX AUTOPAY',
                raw_description: 'AMEX AUTOPAY',
                signed_amount: '-105.41',
                account_id: 1120,
                category_id: 4999,
                source_file: 'chase.csv',
                confidence: 0,
                needs_review: false,
                review_reasons: [],
            },
        ];

        // 2. Step 1: Categorize
        const categorizedTxns = transactions.map(t => {
            const result = categorize(t, rules);
            return { ...t, ...result.result };
        });

        expect(categorizedTxns.find(t => t.txn_id === 'cc-1')?.category_id).toBe(4320);
        expect(categorizedTxns.find(t => t.txn_id === 'cc-2')?.category_id).toBe(4410);

        // 3. Step 2: Match Payments
        const matchResult = matchPayments(categorizedTxns, {
            bankAccountIds: [1120],
            ccAccountIds: [2122],
            patterns: [
                { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [2122] },
            ],
        });

        expect(matchResult.matches).toHaveLength(1);
        expect(matchResult.matches[0].bank_txn_id).toBe('bank-pay');
        expect(matchResult.matches[0].cc_txn_ids[0]).toBe('cc-pay');

        // 4. Step 3: Generate Ledger
        const ledgerResult = generateJournal(categorizedTxns, matchResult.matches, {
            accounts: accountMap,
        });

        // Should have 3 entries:
        // 1. Chipotle charge (DR 4320, CR 2122)
        // 2. Zara charge (DR 4410, CR 2122)
        // 3. Combined CC Payment (DR 2122, CR 1120)
        expect(ledgerResult.entries).toHaveLength(3);
        expect(ledgerResult.validation.valid).toBe(true);
        expect(ledgerResult.stats.matched_payment_entries).toBe(1);
        expect(ledgerResult.stats.regular_entries).toBe(2);

        // Verify totals
        // Debits: 15.42 + 89.99 + 105.41 = 210.82
        expect(ledgerResult.validation.total_debits).toBe('210.82');
        expect(ledgerResult.validation.total_credits).toBe('210.82');
    });
});
