import Decimal from 'decimal.js';
import type { Transaction, MatchConfig } from '@finance-engine/shared';
import type { MatchCandidate, BestMatchResult } from './types.js';
import { daysBetween } from './date-diff.js';

/**
 * Find best matching CC transaction for a bank withdrawal.
 *
 * Selection criteria per IK D6.1-D6.3:
 * 1. Amount within tolerance ($0.01)
 * 2. Date within tolerance (±5 days)
 * 3. Pick closest date if single best match
 * 4. Return null with 'ambiguous' flag if tie on date distance
 *
 * @param bankTxn - Bank withdrawal transaction
 * @param ccTxns - Available CC payment transactions
 * @param possibleAccounts - CC account IDs to consider
 * @param config - Matching configuration
 * @returns Best match or null with reason
 */
export function findBestMatch(
    bankTxn: Transaction,
    ccTxns: Transaction[],
    possibleAccounts: number[],
    config: MatchConfig
): BestMatchResult {
    const bankAmount = new Decimal(bankTxn.signed_amount).abs();
    const amountTolerance = new Decimal(config.amountTolerance);
    const dateToleranceDays = config.dateToleranceDays;

    const candidates: MatchCandidate[] = [];

    for (const ccTxn of ccTxns) {
        // Must be in possible accounts list
        if (!possibleAccounts.includes(ccTxn.account_id)) continue;

        // Amount must match within tolerance (IK D6.2)
        const ccAmount = new Decimal(ccTxn.signed_amount).abs();
        if (bankAmount.minus(ccAmount).abs().greaterThan(amountTolerance)) continue;

        // Date must be within window (IK D6.1)
        const dateDiff = daysBetween(bankTxn.effective_date, ccTxn.effective_date);
        if (dateDiff > dateToleranceDays) continue;

        candidates.push({ txn: ccTxn, dateDiff });
    }

    // No candidates found
    if (candidates.length === 0) {
        return { match: null, reason: 'no_candidates' };
    }

    // Single candidate — return it
    if (candidates.length === 1) {
        return { match: candidates[0].txn, reason: 'found' };
    }

    // Multiple candidates — pick closest date (IK D6.3)
    candidates.sort((a, b) => a.dateDiff - b.dateDiff);

    // Check for tie on closest date — ambiguous
    if (candidates[0].dateDiff === candidates[1].dateDiff) {
        return { match: null, reason: 'ambiguous' };
    }

    // Clear winner
    return { match: candidates[0].txn, reason: 'found' };
}
