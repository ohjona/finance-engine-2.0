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
/**
 * Escapes regex metacharacters in a string.
 */
function escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks if a search string matches text, using word boundaries for short strings
 * to avoid false positives (e.g., 'BOA' matching 'BOAT').
 */
function matchesWithBoundary(text: string, search: string): boolean {
    const uppercaseSearch = search.toUpperCase();
    const escapedSearch = escapeRegex(uppercaseSearch);
    if (search.length <= 4) {
        // Use word boundary for short strings
        const regex = new RegExp(`\\b${escapedSearch}\\b`);
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
    const bankTxns = transactions.filter(t =>
        bankAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isNegative()
    );

    const ccTxns = transactions.filter(t =>
        ccAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isPositive()
    );

    // B-2: Rank bank transactions by potential candidate count to solve greediness.
    interface BankAttempt {
        bankTxn: Transaction;
        possibleAccounts: number[];
        initialCandidatesCount: number;
        minDateDiff: number;
        minAmountDiff: Decimal;
        candidateIds: string[];
    }

    const attempts: BankAttempt[] = [];

    for (const bankTxn of bankTxns) {
        if (new Decimal(bankTxn.signed_amount).isZero()) continue;

        const desc = normalizeDescription(bankTxn.raw_description);

        for (const pattern of patterns) {
            const hasKeyword = pattern.keywords.some(kw => matchesWithBoundary(desc, kw));
            const hasPattern = matchesWithBoundary(desc, pattern.pattern);

            if (hasKeyword && hasPattern) {
                const possibleAccounts = pattern.accounts.filter(id => ccAccountIds.includes(id));
                if (possibleAccounts.length > 0) {
                    const candidates = ccTxns.filter(ccTxn =>
                        isPotentialCandidate(bankTxn, ccTxn, possibleAccounts, config)
                    );

                    let minDateDiff = Infinity;
                    let minAmountDiff = new Decimal(Infinity);

                    if (candidates.length > 0) {
                        minDateDiff = Math.min(...candidates.map(c =>
                            daysBetween(bankTxn.effective_date, c.effective_date)
                        ));
                        minAmountDiff = Decimal.min(...candidates.map(c =>
                            new Decimal(bankTxn.signed_amount).abs().minus(new Decimal(c.signed_amount).abs()).abs()
                        ));
                    }

                    attempts.push({
                        bankTxn,
                        possibleAccounts,
                        initialCandidatesCount: candidates.length,
                        minDateDiff,
                        minAmountDiff,
                        candidateIds: candidates.map(c => c.txn_id)
                    });
                    break;
                }
            }
        }
    }

    // 2. Sort attempts - Tie-aware fallback (Option B)
    attempts.sort((a, b) => {
        if (a.initialCandidatesCount !== b.initialCandidatesCount) {
            return a.initialCandidatesCount - b.initialCandidatesCount;
        }
        if (a.minDateDiff !== b.minDateDiff) {
            return a.minDateDiff - b.minDateDiff;
        }
        return a.minAmountDiff.minus(b.minAmountDiff).toNumber();
    });

    const matchedCcTxnIds = new Set<string>();
    const ambiguousTxnIds = new Set<string>();

    // 2.5 Identify multi-way ties (IK D6.3 refined)
    // We group contiguous attempts with identical metrics.
    // If any pair within the group overlaps on candidates, all in the group are ambiguous.
    let groupStart = 0;
    while (groupStart < attempts.length) {
        let groupEnd = groupStart + 1;
        while (groupEnd < attempts.length) {
            const a = attempts[groupStart];
            const b = attempts[groupEnd];
            if (a.initialCandidatesCount === b.initialCandidatesCount &&
                a.minDateDiff === b.minDateDiff &&
                a.minAmountDiff.equals(b.minAmountDiff) &&
                a.initialCandidatesCount > 0) {
                groupEnd++;
            } else {
                break;
            }
        }

        if (groupEnd - groupStart > 1) {
            // Check for any overlap within the group
            let hasAnyOverlap = false;
            for (let i = groupStart; i < groupEnd; i++) {
                for (let j = i + 1; j < groupEnd; j++) {
                    const overlap = attempts[i].candidateIds.some(id => attempts[j].candidateIds.includes(id));
                    if (overlap) {
                        hasAnyOverlap = true;
                        break;
                    }
                }
                if (hasAnyOverlap) break;
            }

            if (hasAnyOverlap) {
                for (let i = groupStart; i < groupEnd; i++) {
                    ambiguousTxnIds.add(attempts[i].bankTxn.txn_id);
                }
            }
        }
        groupStart = groupEnd;
    }

    let ambiguousFlagged = 0;
    let noCandidateFlagged = 0;
    let partialPaymentFlagged = 0;

    // 3. Process each attempt
    for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        const { bankTxn, possibleAccounts } = attempt;

        if (ambiguousTxnIds.has(bankTxn.txn_id)) {
            reviewUpdates.push({
                txn_id: bankTxn.txn_id,
                needs_review: true,
                add_review_reasons: ['ambiguous_match_candidates'],
            });
            ambiguousFlagged++;
            continue;
        }

        const availableCcTxns = ccTxns.filter(t => !matchedCcTxnIds.has(t.txn_id));

        const { match, reason } = findBestMatch(
            bankTxn,
            availableCcTxns,
            possibleAccounts,
            config,
            ccTxns // Pass ALL for diagnostic preservation
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
        } else if (reason === 'partial_payment' || reason === 'no_candidates') {
            // Check for 1:N match
            // 1:N filtering: only include CC txns that look like payment receipts (not rewards/refunds)
            const potCandidates = availableCcTxns.filter(t => {
                const looksLikePayment = patterns.some(p => {
                    const matchingPatterns = p.accounts.some(accId => possibleAccounts.includes(accId));
                    if (!matchingPatterns) return false;

                    const desc = normalizeDescription(t.raw_description);
                    const hasKeyword = p.keywords.some(kw => matchesWithBoundary(desc, kw));
                    const hasPattern = matchesWithBoundary(desc, p.pattern);
                    return hasKeyword || hasPattern;
                });
                return looksLikePayment && isPotentialCandidate(bankTxn, t, possibleAccounts, config, true);
            });

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
                        date_diff_days: Math.max(...potCandidates.map(t =>
                            daysBetween(bankTxn.effective_date, t.effective_date)
                        )),
                    });
                    potCandidates.forEach(t => matchedCcTxnIds.add(t.txn_id));
                    continue;
                }
            }

            const isPartial = reason === 'partial_payment' || potCandidates.length > 0;
            reviewUpdates.push({
                txn_id: bankTxn.txn_id,
                needs_review: true,
                add_review_reasons: [isPartial ? 'partial_payment' : 'payment_pattern_no_cc_match'],
            });
            if (isPartial) partialPaymentFlagged++;
            else noCandidateFlagged++;
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
            total_bank_candidates: attempts.length,
            total_cc_candidates: ccTxns.length,
            matches_found: matches.length,
            ambiguous_flagged: ambiguousFlagged,
            no_candidate_flagged: noCandidateFlagged,
            partial_payment_flagged: partialPaymentFlagged,
        },
    };
}
