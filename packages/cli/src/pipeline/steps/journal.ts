import { generateJournal } from '@finance-engine/core';
import type { AccountInfo } from '@finance-engine/shared';
import type { PipelineStep } from '../types.js';
import { loadAccounts } from '../../workspace/config.js';

/**
 * Step 7: Journal Generation
 * Converts categorized transactions and matches into double-entry journal entries.
 */
export const generateLedger: PipelineStep = async (state) => {
    // 1. Load chart of accounts
    let chart;
    try {
        chart = loadAccounts(state.workspace);
    } catch (err) {
        state.errors.push({
            step: 'journal',
            message: `Failed to load accounts: ${(err as Error).message}`,
            fatal: true,
            error: err
        });
        return state;
    }

    // 2. Prepare account lookup map for core
    const accountMap = new Map<number, AccountInfo>();
    for (const [idStr, acc] of Object.entries(chart.accounts)) {
        const id = parseInt(idStr, 10);
        accountMap.set(id, {
            id,
            name: acc.name,
            type: acc.type
        });
    }

    // 3. Generate journal
    // matchResult.matches should already be available from Step 6.
    const result = generateJournal(
        state.transactions,
        state.matchResult?.matches || [],
        {
            accounts: accountMap,
            startingEntryId: 1 // TODO: Could be configurable or based on previous months
        }
    );

    state.ledgerResult = result;

    // Forward warnings
    for (const warning of result.warnings) {
        state.warnings.push(warning);
    }

    // If validation failed, add a non-fatal error (user can still see the result if they --force)
    if (!result.validation.valid) {
        state.errors.push({
            step: 'journal',
            message: `Journal validation failed: ${result.validation.difference} difference.`,
            fatal: false
        });
    }

    return state;
};
