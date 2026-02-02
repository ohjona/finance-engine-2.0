import { matchPayments } from '@finance-engine/core';
import type { PipelineStep } from '../types.js';

/**
 * Step 6: Payment Matching
 * Matches bank withdrawals to CC payments and flags discrepancies.
 */
export const matchTransactions: PipelineStep = async (state) => {
    // matchPayments is a core function (pure).
    // It returns matches and review updates that need to be applied.
    const result = matchPayments(state.transactions);

    state.matchResult = result;

    // Apply review updates to the transactions in state.
    // matchPayments identifies which transactions need review (e.g. unmatched payments).
    for (const update of result.reviewUpdates) {
        const txn = state.transactions.find(t => t.txn_id === update.txn_id);
        if (txn) {
            txn.needs_review = update.needs_review;
            txn.review_reasons = [...new Set([...txn.review_reasons, ...update.add_review_reasons])];
        }
    }

    // Forward warnings
    for (const warning of result.warnings) {
        state.warnings.push(warning);
    }

    return state;
};
