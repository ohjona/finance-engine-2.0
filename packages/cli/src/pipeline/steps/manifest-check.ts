import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { PipelineStep } from '../types.js';
import { getOutputsPath } from '../../workspace/paths.js';

/**
 * Step 1: Manifest Check
 * Prevents accidental overwrite of a processed month unless --force is used.
 */
export const manifestCheck: PipelineStep = async (state) => {
    // If we're already in a dry run, we don't care about overwriting.
    if (state.options.dryRun) {
        return state;
    }

    const outputPath = getOutputsPath(state.workspace, state.month);
    const manifestPath = join(outputPath, 'run_manifest.json');

    if (existsSync(manifestPath) && !state.options.force) {
        state.errors.push({
            step: 'manifest-check',
            message: `Output for ${state.month} already exists at ${outputPath}. Use --force to overwrite.`,
            fatal: true
        });
    }

    return state;
};
