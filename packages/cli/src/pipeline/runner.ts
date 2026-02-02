import type { PipelineState, PipelineStep } from './types.js';
import { manifestCheck } from './steps/manifest-check.js';
import { detectFiles } from './steps/detect.js';
import { parseFiles } from './steps/parse.js';
import { deduplicateTransactions } from './steps/dedup.js';
import { categorizeTransactions } from './steps/categorize.js';
import { matchTransactions } from './steps/match.js';
import { generateLedger } from './steps/journal.js';
import { validateFinal } from './steps/validate.js';
import { exportResults } from './steps/export.js';
import { archiveRawFiles } from './steps/archive.js';
import type { Workspace, ProcessOptions } from '../types.js';
import type { ChartOfAccounts } from '@finance-engine/shared';

/**
 * Orchestrates the execution of the processing pipeline.
 * Runs each step sequentially, stopping if a fatal error occurs.
 */
export async function runPipeline(
    month: string,
    workspace: Workspace,
    accounts: ChartOfAccounts,
    options: ProcessOptions
): Promise<PipelineState> {
    let state: PipelineState = {
        month,
        workspace,
        accounts,
        options,
        files: [],
        parseResults: {}, // B-1: Initialized as object
        transactions: [],
        warnings: [],
        errors: [],
        statistics: {
            rawTransactionCount: 0,
            duplicateCount: 0,
            matchedPairCount: 0
        }
    };

    const steps: { name: string; fn: PipelineStep }[] = [
        { name: 'Manifest Check', fn: manifestCheck },
        { name: 'File Detection', fn: detectFiles },
        { name: 'Parsing', fn: parseFiles },
        { name: 'Deduplication', fn: deduplicateTransactions },
        { name: 'Categorization', fn: categorizeTransactions },
        { name: 'Payment Matching', fn: matchTransactions },
        { name: 'Journal Generation', fn: generateLedger },
        { name: 'Final Validation', fn: validateFinal },
        { name: 'Export Results', fn: exportResults },
        { name: 'Archiving', fn: archiveRawFiles },
    ];

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        console.log(`\n→ Step ${i + 1}/${steps.length}: ${step.name}...`);

        state = await step.fn(state);

        if (state.errors.some(e => e.fatal)) {
            console.error(`\n✖ Fatal error in step "${step.name}". Stopping.`);
            break;
        }
    }

    return state;
}
