import Decimal from 'decimal.js';
import type { Transaction, MatchConfig } from '@finance-engine/shared';
import type { MatchCandidate, BestMatchResult } from './types.js';
import { daysBetween } from './date-diff.js';

/**
 * Checks if a CC transaction is a potential candidate for a bank withdrawal.
 */
export function isPotentialCandidate(
    bankTxn: Transaction,
    ccTxn: Transaction,
    possibleAccounts: number[],
    config: MatchConfig,
    allowAmountMismatch: boolean = false
): boolean {
    // Must be in possible accounts list
    if (!possibleAccounts.includes(ccTxn.account_id)) return false;

    // Date must be within window (IK D6.1)
    const dateDiff = daysBetween(bankTxn.effective_date, ccTxn.effective_date);
    if (dateDiff > config.dateToleranceDays) return false;

    if (!allowAmountMismatch) {
        const bankAmount = new Decimal(bankTxn.signed_amount).abs();
        const amountTolerance = new Decimal(config.amountTolerance);

        // Amount must match within tolerance (IK D6.2)
        const ccAmount = new Decimal(ccTxn.signed_amount).abs();
        const amountDiff = bankAmount.minus(ccAmount).abs();
        if (amountDiff.greaterThan(amountTolerance)) return false;
    }

    return true;
}

export function findBestMatch(
    bankTxn: Transaction,
    ccTxns: Transaction[], // Available transactions for matching
    possibleAccounts: number[],
    config: MatchConfig,
    allCcTxns: Transaction[] // All transactions for diagnostics (IK D6.4)
): BestMatchResult {
    const bankAmount = new Decimal(bankTxn.signed_amount).abs();
    const candidates: MatchCandidate[] = [];

    for (const ccTxn of ccTxns) {
        if (!isPotentialCandidate(bankTxn, ccTxn, possibleAccounts, config)) continue;

        const ccAmount = new Decimal(ccTxn.signed_amount).abs();
        const amountDiff = bankAmount.minus(ccAmount).abs();
        const dateDiff = daysBetween(bankTxn.effective_date, ccTxn.effective_date);
        candidates.push({ txn: ccTxn, dateDiff, amountDiff });
    }

    // No candidates found among AVAILABLE
    if (candidates.length === 0) {
        // Distinguish between no candidates at all vs. partial payment (IK D6.4)
        // Check ALL transactions (including already matched) for the diagnostic reason.
        const hasDateMatch = allCcTxns.some(ccTxn =>
            isPotentialCandidate(bankTxn, ccTxn, possibleAccounts, config, true)
        );
        return { match: null, reason: hasDateMatch ? 'partial_payment' : 'no_candidates' };
    }

    // Single candidate — return it
    if (candidates.length === 1) {
        return { match: candidates[0].txn, reason: 'found' };
    }

    // Multiple candidates — pick closest date (IK D6.3)
    // Secondary tie-break: pick closest amount (B-4)
    candidates.sort((a, b) => {
        if (a.dateDiff !== b.dateDiff) {
            return a.dateDiff - b.dateDiff;
        }
        return a.amountDiff.minus(b.amountDiff).toNumber();
    });

    // Check for tie on BOTH closest date and amount — ambiguous
    if (candidates[0].dateDiff === candidates[1].dateDiff &&
        candidates[0].amountDiff.equals(candidates[1].amountDiff)) {
        return { match: null, reason: 'ambiguous' };
    }

    // Clear winner (either by date or tie-broken by amount)
    return { match: candidates[0].txn, reason: 'found' };
}
