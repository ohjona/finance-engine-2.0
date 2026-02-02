import { mkdir, copyFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { PipelineStep } from '../types.js';
import { getArchivePath } from '../../workspace/paths.js';

/**
 * Step 10: Archiving
 * Moves raw input files to the archive directory for historical preservation.
 * Per PRD §11.5 / IK D8.3: Must move, not copy.
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

            try {
                // Attempt atomic move (atomic rename)
                await rename(file.path, dest);
            } catch (err: any) {
                // Fallback for cross-device move (EXDEV)
                if (err.code === 'EXDEV') {
                    await copyFile(file.path, dest);
                    await unlink(file.path);
                } else {
                    throw err;
                }
            }
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
