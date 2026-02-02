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
import { findBestMatch, isPotentialCandidate } from './find-best-match.js';
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
/**
 * Checks if a search string matches text, using word boundaries for short strings
 * to avoid false positives (e.g., 'BOA' matching 'BOAT').
 */
function matchesWithBoundary(text: string, search: string): boolean {
    const uppercaseSearch = search.toUpperCase();
    if (search.length <= 4) {
        // Use word boundary for short strings
        // \b matches start/end of string or position between word and non-word char
        const regex = new RegExp(`\\b${uppercaseSearch}\\b`);
        return regex.test(text);
    }
    return text.includes(uppercaseSearch);
}

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

    // B-2: Rank bank transactions by potential candidate count to solve greediness.
    // 1. Identify which bank transactions match a pattern and find ALL their potential CC candidates.
    interface BankAttempt {
        bankTxn: Transaction;
        possibleAccounts: number[];
        initialCandidatesCount: number;
    }

    const attempts: BankAttempt[] = [];

    for (const bankTxn of bankTxns) {
        // Skip zero-amount (IK D6.9)
        if (new Decimal(bankTxn.signed_amount).isZero()) continue;

        const desc = normalizeDescription(bankTxn.raw_description);

        // Find matching pattern
        for (const pattern of patterns) {
            const hasKeyword = pattern.keywords.some(kw => matchesWithBoundary(desc, kw));
            const hasPattern = matchesWithBoundary(desc, pattern.pattern);

            if (hasKeyword && hasPattern) {
                const possibleAccounts = pattern.accounts.filter(id => ccAccountIds.includes(id));
                if (possibleAccounts.length > 0) {
                    // Count potential candidates initially
                    const candidatesCount = ccTxns.filter(ccTxn =>
                        isPotentialCandidate(bankTxn, ccTxn, possibleAccounts, config)
                    ).length;

                    attempts.push({ bankTxn, possibleAccounts, initialCandidatesCount: candidatesCount });
                    break; // Pick first matching pattern
                }
            }
        }
    }

    // 2. Sort attempts - fewer candidates first (clear winners first)
    attempts.sort((a, b) => a.initialCandidatesCount - b.initialCandidatesCount);

    // Track matched CC txns to prevent double-matching
    const matchedCcTxnIds = new Set<string>();
    let ambiguousFlagged = 0;
    let noCandidateFlagged = 0;

    // 3. Process each attempt in sorted order
    for (const attempt of attempts) {
        const { bankTxn, possibleAccounts } = attempt;

        // Find available CC transactions (not already matched)
        const availableCcTxns = ccTxns.filter(t => !matchedCcTxnIds.has(t.txn_id));

        // Find best match among available
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
                cc_txn_ids: [match.txn_id],
                amount: new Decimal(bankTxn.signed_amount).abs().toString(),
                date_diff_days: daysBetween(bankTxn.effective_date, match.effective_date),
            });
            matchedCcTxnIds.add(match.txn_id);
        } else if (reason === 'no_candidates') {
            // B-3: Check for 1:N match if no single candidate found
            // If the sum of ALL potential (available) candidates equals the bank amount,
            // we treat it as a multi-statement payment.
            const potCandidates = availableCcTxns.filter(t =>
                isPotentialCandidate(bankTxn, t, possibleAccounts, config, true)
            );

            if (potCandidates.length >= 2) {
                const totalPotAmount = potCandidates.reduce(
                    (sum, t) => sum.plus(new Decimal(t.signed_amount).abs()),
                    new Decimal(0)
                );

                if (totalPotAmount.equals(new Decimal(bankTxn.signed_amount).abs())) {
                    matches.push({
                        type: 'payment',
                        bank_txn_id: bankTxn.txn_id,
                        cc_txn_ids: potCandidates.map(t => t.txn_id),
                        amount: totalPotAmount.toString(),
                        // Use max date diff for the set
                        date_diff_days: Math.max(...potCandidates.map(t =>
                            daysBetween(bankTxn.effective_date, t.effective_date)
                        )),
                    });
                    potCandidates.forEach(t => matchedCcTxnIds.add(t.txn_id));
                    continue; // Success
                }
            }

            reviewUpdates.push({
                txn_id: bankTxn.txn_id,
                needs_review: true,
                add_review_reasons: ['payment_pattern_no_cc_match'],
            });
            noCandidateFlagged++;
        } else if (reason === 'ambiguous') {
            reviewUpdates.push({
                txn_id: bankTxn.txn_id,
                needs_review: true,
                add_review_reasons: ['ambiguous_match_candidates'],
            });
            ambiguousFlagged++;
        }
    }

    return {
        matches,
        reviewUpdates,
        warnings,
        stats: {
            total_bank_candidates: attempts.length, // Bank txns that matched a pattern
            total_cc_candidates: ccTxns.length,
            matches_found: matches.length,
            ambiguous_flagged: ambiguousFlagged,
            no_candidate_flagged: noCandidateFlagged,
        },
    };
}
