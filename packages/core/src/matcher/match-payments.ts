import Decimal from 'decimal.js';
import type {
    Transaction,
    PaymentPattern,
    MatchResult,
    Match,
    MatchConfig,
} from '@finance-engine/shared';
import { MATCHING_CONFIG, DEFAULT_PAYMENT_PATTERNS } from '@finance-engine/shared';
import type { MatcherOptions } from './types.js';
import { findBestMatch } from './find-best-match.js';
import { daysBetween } from './date-diff.js';
import { normalizeDescription } from '../utils/normalize.js';

/**
 * Match CC payments between bank withdrawals and CC payments received.
 *
 * PURE FUNCTION: Does not mutate transactions. Returns matches and
 * review update descriptors for CLI/caller to apply.
 *
 * Per PRD §10, IK D6.1-D6.9.
 *
 * @param transactions - All transactions from parsing phase
 * @param options - Matcher configuration
 * @returns MatchResult with matches, review updates, warnings, stats
 */
export function matchPayments(
    transactions: Transaction[],
    options: MatcherOptions = {}
): MatchResult {
    const warnings: string[] = [];
    const matches: Match[] = [];
    const reviewUpdates: Array<{
        txn_id: string;
        needs_review: boolean;
        add_review_reasons: string[];
    }> = [];

    // Merge config with defaults
    const config: MatchConfig = {
        dateToleranceDays: options.config?.dateToleranceDays ?? MATCHING_CONFIG.DATE_TOLERANCE_DAYS,
        amountTolerance: options.config?.amountTolerance ?? MATCHING_CONFIG.AMOUNT_TOLERANCE,
    };

    // Get patterns
    const patterns: PaymentPattern[] = options.patterns ??
        DEFAULT_PAYMENT_PATTERNS.map(p => ({
            ...p,
            keywords: [...p.keywords],
            accounts: [...p.accounts]
        }));

    // Determine account ranges
    const bankAccountIds = options.bankAccountIds ?? [];
    const ccAccountIds = options.ccAccountIds ?? [];

    if (bankAccountIds.length === 0) {
        warnings.push('No bank account IDs provided to matchPayments');
    }
    if (ccAccountIds.length === 0) {
        warnings.push('No CC account IDs provided to matchPayments');
    }

    // Filter transactions
    // Bank: asset accounts with negative amount (withdrawal)
    const bankTxns = transactions.filter(t =>
        bankAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isNegative()
    );

    // CC: liability accounts with positive amount (payment received)
    const ccTxns = transactions.filter(t =>
        ccAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isPositive()
    );

    // Track matched CC txns to prevent double-matching
    const matchedCcTxnIds = new Set<string>();

    let ambiguousFlagged = 0;
    let noCandidateFlagged = 0;

    // Process each bank transaction
    for (const bankTxn of bankTxns) {
        // Skip zero-amount (IK D6.9)
        if (new Decimal(bankTxn.signed_amount).isZero()) continue;

        const desc = normalizeDescription(bankTxn.raw_description);

        // Check each pattern
        for (const pattern of patterns) {
            // Must have BOTH keyword AND pattern (IK D6.5)
            const hasKeyword = pattern.keywords.some(kw =>
                desc.includes(kw.toUpperCase())
            );
            const hasPattern = desc.includes(pattern.pattern.toUpperCase());

            if (!hasKeyword || !hasPattern) continue;

            // Get possible CC accounts for this pattern
            const possibleAccounts = pattern.accounts.filter(id =>
                ccAccountIds.includes(id)
            );

            if (possibleAccounts.length === 0) {
                // Pattern matched but no accounts configured
                continue;
            }

            // Find available CC transactions (not already matched)
            const availableCcTxns = ccTxns.filter(t =>
                !matchedCcTxnIds.has(t.txn_id)
            );

            // Find best match
            const { match, reason } = findBestMatch(
                bankTxn,
                availableCcTxns,
                possibleAccounts,
                config
            );

            if (match) {
                matches.push({
                    type: 'payment',
                    bank_txn_id: bankTxn.txn_id,
                    cc_txn_id: match.txn_id,
                    amount: new Decimal(bankTxn.signed_amount).abs().toString(),
                    date_diff_days: daysBetween(bankTxn.effective_date, match.effective_date),
                });
                matchedCcTxnIds.add(match.txn_id);
                break; // Stop checking patterns for this bank txn
            } else if (reason === 'ambiguous') {
                // Flag for review (IK D6.3)
                reviewUpdates.push({
                    txn_id: bankTxn.txn_id,
                    needs_review: true,
                    add_review_reasons: ['ambiguous_match_candidates'],
                });
                ambiguousFlagged++;
                break;
            } else if (reason === 'no_candidates') {
                // Flag: pattern matched but no CC candidate (IK D6.6)
                reviewUpdates.push({
                    txn_id: bankTxn.txn_id,
                    needs_review: true,
                    add_review_reasons: ['payment_pattern_no_cc_match'],
                });
                noCandidateFlagged++;
                break;
            }
        }
    }

    return {
        matches,
        reviewUpdates,
        warnings,
        stats: {
            total_bank_candidates: bankTxns.length,
            total_cc_candidates: ccTxns.length,
            matches_found: matches.length,
            ambiguous_flagged: ambiguousFlagged,
            no_candidate_flagged: noCandidateFlagged,
        },
    };
}
