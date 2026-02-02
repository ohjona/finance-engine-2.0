import { mkdir, copyFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { PipelineStep } from '../types.js';
import { getArchivePath } from '../../workspace/paths.js';

/**
 * Step 10: Archiving
 * Copies raw input files to the archive directory for historical preservation.
 */
export const archiveRawFiles: PipelineStep = async (state) => {
    if (state.options.dryRun) {
        state.warnings.push('Dry run: Skipping archival.');
        return state;
    }

    // Only archive if there are no fatal errors in previous steps.
    if (state.errors.some(e => e.fatal)) {
        state.warnings.push('Archival skipped due to previous fatal errors.');
        return state;
    }

    const archivePath = getArchivePath(state.workspace, state.month);

    try {
        await mkdir(archivePath, { recursive: true });

        for (const file of state.files) {
            const dest = join(archivePath, file.filename);
            await copyFile(file.path, dest);
        }
    } catch (err) {
        state.errors.push({
            step: 'archive',
            message: `Failed to archive files to ${archivePath}: ${(err as Error).message}`,
            fatal: false, // Archival failure is bad but doesn't invalidate the output.
            error: err
        });
    }

    return state;
};
