import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { detectParser } from '@finance-engine/core';
import type { PipelineStep, InputFile } from '../types.js';
import { getImportsPath } from '../../workspace/paths.js';
import { hashFile } from '../../utils/hash.js';

/**
 * Step 2: File Detection
 * Lists files in the imports directory, hashes them, and detects appropriate parsers.
 */
export const detectFiles: PipelineStep = async (state) => {
    const importsPath = getImportsPath(state.workspace, state.month);

    try {
        const entries = (await readdir(importsPath)).sort();
        const files: InputFile[] = [];

        for (const filename of entries) {
            // Skip hidden and temporary files
            if (filename.startsWith('.') || filename.startsWith('~')) {
                continue;
            }

            const filePath = join(importsPath, filename);
            const s = await stat(filePath);

            if (!s.isFile()) {
                continue; // Skip directories and other non-file entries
            }

            const hash = await hashFile(filePath);
            const detection = detectParser(filename);

            files.push({
                path: filePath,
                filename,
                hash,
                parserName: detection?.parserName,
                accountId: detection?.accountId
            });

            if (!detection) {
                state.warnings.push(`File skipped (no parser found): ${filename}`);
            }
        }

        state.files = files;

        const parseableFiles = files.filter(f => !!f.parserName);
        if (parseableFiles.length === 0) {
            state.errors.push({
                step: 'detect',
                message: `No parseable files found in ${importsPath}. Expected {bank}_{accountID}_{YYYYMM}.{ext}`,
                fatal: true
            });
        }
    } catch (err) {
        state.errors.push({
            step: 'detect',
            message: `Error scanning directory ${importsPath}: ${(err as Error).message}`,
            fatal: true,
            error: err
        });
    }

    return state;
};
