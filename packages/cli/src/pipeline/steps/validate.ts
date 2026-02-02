import type { PipelineStep } from '../types.js';
import { log, warn } from '../../utils/console.js';

/**
 * Step 8: Final Validation
 * Performs high-level checks across the entire month's processing results.
 * Identifies if manual intervention is likely required in review.xlsx.
 * Includes transaction reconciliation (Codex Spec).
 */
export const validateFinal: PipelineStep = async (state) => {
    // 1. Transaction Reconciliation (Codex Requirement)
    const N = state.statistics.rawTransactionCount;
    const D = state.statistics.duplicateCount;
    const M = state.statistics.matchedPairCount;
    const currentTxns = state.transactions.length;

    // Expected current transactions = (N - D)
    const expectedCurrent = N - D;

    log(`\n--- Transaction Reconciliation ---`);
    log(`Raw Input:      ${N}`);
    log(`Duplicates:     ${D}`);
    log(`Matched Pairs:  ${M}`);
    log(`Unique Current: ${currentTxns}`);

    if (currentTxns !== expectedCurrent) {
        state.warnings.push(`Reconciliation discrepancy: Expected ${expectedCurrent} unique transactions, but found ${currentTxns}.`);
    }

    // 2. Transaction-level review flags
    const reviewCount = state.transactions.filter(t => t.needs_review).length;
    if (reviewCount > 0) {
        state.warnings.push(`${reviewCount} transactions flagged for manual review. (See review.xlsx)`);
    }

    // 3. Ledger-level results
    if (state.ledgerResult) {
        const { validation } = state.ledgerResult;

        // Expected journal entries = (N - D) - M
        // Since each matched pair (2 txns) becomes 1 entry (-1)
        const journalEntries = state.ledgerResult.entries.length;
        const expectedJournal = expectedCurrent - M;

        log(`Journal Entries: ${journalEntries}`);
        if (journalEntries !== expectedJournal) {
            state.warnings.push(`Journal Entry mismatch: Expected ${expectedJournal} entries, but found ${journalEntries}.`);
        }

        if (!validation.valid) {
            state.errors.push({
                step: 'validate',
                message: `JOURNAL FATAL: Out of balance by ${validation.difference}.`,
                fatal: true
            });
        }
    }

    // 4. Parser-level coverage
    if (state.transactions.length === 0 && state.errors.length === 0) {
        state.errors.push({
            step: 'validate',
            message: 'No transactions were processed. Is the input directory empty or misnamed?',
            fatal: true
        });
    }

    return state;
};
