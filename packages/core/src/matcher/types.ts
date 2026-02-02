import type { Transaction, PaymentPattern, MatchConfig } from '@finance-engine/shared';

/**
 * Options for matchPayments function.
 */
export interface MatcherOptions {
    config?: Partial<MatchConfig>;
    patterns?: PaymentPattern[];
    bankAccountIds?: number[];    // Asset accounts (checking/savings)
    ccAccountIds?: number[];      // Liability accounts (credit cards)
}

/**
 * Internal candidate representation.
 */
export interface MatchCandidate {
    txn: Transaction;
    dateDiff: number;
}

/**
 * Result of findBestMatch.
 */
export interface BestMatchResult {
    match: Transaction | null;
    reason: 'found' | 'no_candidates' | 'ambiguous';
}
