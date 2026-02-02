import { categorizeAll } from '@finance-engine/core';
import type { PipelineStep } from '../types.js';
import { loadRules } from '../../workspace/config.js';

/**
 * Step 5: Categorization
 * Applies rule-based categorization to all unique transactions.
 */
export const categorizeTransactions: PipelineStep = async (state) => {
    // 1. Load rules from workspace (user, shared, base)
    let rules;
    try {
        rules = loadRules(state.workspace);
    } catch (err) {
        state.errors.push({
            step: 'categorize',
            message: `Failed to load rules: ${(err as Error).message}`,
            fatal: true,
            error: err
        });
        return state;
    }

    // 2. Handle --llm flag placeholder per PRD/Spec
    if (state.options.llm) {
        state.warnings.push('LLM-assisted categorization is not yet implemented. Falling back to rule-based.');
    }

    // 3. Perform categorization
    // categorizeAll is a core function that handles the 4-layer hierarchy.
    const result = categorizeAll(state.transactions, rules);

    state.transactions = result.transactions;
    state.categorizationStats = result.stats;

    // Aggregate warnings
    for (const warning of result.warnings) {
        state.warnings.push(warning);
    }

    return state;
};
