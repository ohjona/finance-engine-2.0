import type { PipelineStep } from '../types.js';

/**
 * Step 8: Final Validation
 * Performs high-level checks across the entire month's processing results.
 * Identifies if manual intervention is likely required in review.xlsx.
 */
export const validateFinal: PipelineStep = async (state) => {
    // 1. Transaction-level review flags
    // These come from categorization (no match) or matcher (payment discrepancy).
    const reviewCount = state.transactions.filter(t => t.needs_review).length;
    if (reviewCount > 0) {
        state.warnings.push(`${reviewCount} transactions flagged for manual review. (See review.xlsx)`);
    }

    // 2. Ledger-level results
    if (state.ledgerResult) {
        const { validation } = state.ledgerResult;
        if (!validation.valid) {
            state.warnings.push(`JOURNAL WARNING: Out of balance by ${validation.difference}.`);
        }
    }

    // 3. Parser-level coverage
    if (state.transactions.length === 0 && state.errors.length === 0) {
        state.errors.push({
            step: 'validate',
            message: 'No transactions were processed. Is the input directory empty or misnamed?',
            fatal: true
        });
    }

    return state;
};
