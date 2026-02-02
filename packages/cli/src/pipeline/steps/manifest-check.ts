import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineStep } from '../types.js';
import { getOutputsPath } from '../../workspace/paths.js';

/**
 * Step 1: Manifest Check
 * Prevents accidental overwrite of a processed month unless --force is used.
 * Per Codex/PRD: Checks for any output files, not just the manifest.
 */
export const manifestCheck: PipelineStep = async (state) => {
    // If we're already in a dry run, we don't care about overwriting.
    if (state.options.dryRun || state.options.force) {
        return state;
    }

    const outputPath = getOutputsPath(state.workspace, state.month);

    // Files to check for existing output protection
    const criticalFiles = [
        'run_manifest.json',
        'analysis.xlsx',
        'journal.xlsx',
        'review.xlsx'
    ];

    const existingFiles = criticalFiles.filter(f => existsSync(join(outputPath, f)));

    if (existingFiles.length > 0) {
        state.errors.push({
            step: 'manifest-check',
            message: `Output for ${state.month} already exists (found: ${existingFiles.join(', ')}). Use --force to overwrite.`,
            fatal: true
        });
    }

    return state;
};
