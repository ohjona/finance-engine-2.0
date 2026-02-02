import { resolveCollisions } from '@finance-engine/core';
import type { Transaction } from '@finance-engine/shared';
import type { PipelineStep } from '../types.js';

/**
 * Step 4: Deduplication
 * Handles both intra-file collisions (same-day identical transactions)
 * and cross-file duplications (overlapping date exports).
 */
export const deduplicateTransactions: PipelineStep = async (state) => {
    const globalSeen = new Set<string>();
    const unique: Transaction[] = [];
    let duplicatesRemoved = 0;

    // We process each file's parse results in order (sorted by filename in Step 2).
    // This ensures deterministic collision suffix assignment (-02, -03).
    for (const file of state.files) {
        const result = state.parseResults[file.filename];

        if (!result) {
            continue;
        }

        // 1. Resolve internal collisions for THIS file first.
        // This ensures that two $5 Starbucks in ONE file get id and id-02.
        const resolvedInFile = resolveCollisions(result.transactions);

        for (const txn of resolvedInFile) {
            // 2. Check if this resolved ID has already been seen in a PREVIOUS file.
            // If so, it's a cross-file duplicate (e.g. overlapping exports).
            if (globalSeen.has(txn.txn_id)) {
                duplicatesRemoved++;
            } else {
                globalSeen.add(txn.txn_id);
                unique.push(txn);
            }
        }
    }

    state.transactions = unique;
    state.statistics.duplicateCount = duplicatesRemoved;

    if (duplicatesRemoved > 0) {
        state.warnings.push(`${duplicatesRemoved} duplicate transactions removed across files.`);
    }

    return state;
};
