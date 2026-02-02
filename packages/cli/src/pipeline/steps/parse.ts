import { readFile } from 'node:fs/promises';
import { detectParser } from '@finance-engine/core';
import type { PipelineStep } from '../types.js';
import { promptContinue } from '../../utils/prompt.js';

/**
 * Step 3: Parsing
 * Reads identified files into memory and executes their corresponding parsers.
 */
export const parseFiles: PipelineStep = async (state) => {
    for (const file of state.files) {
        if (!file.parserName) {
            continue; // Skip files with no detected parser
        }

        try {
            const detection = detectParser(file.filename);
            if (!detection) {
                // Should not happen if Step 2 worked, but safety first.
                state.warnings.push(`Parser lost for file: ${file.filename}`);
                continue;
            }

            const buffer = await readFile(file.path);
            const arrayBuffer = buffer.buffer.slice(
                buffer.byteOffset,
                buffer.byteOffset + buffer.byteLength
            );

            // Parser returns ParseResult: { transactions: Transaction[], skippedRows: number, warnings: string[] }
            const result = detection.parser(arrayBuffer, detection.accountId, file.filename);

            state.parseResults[file.filename] = result;
            state.transactions.push(...result.transactions);

            // Forward parser warnings to pipeline state
            for (const warning of result.warnings) {
                state.warnings.push(`[${file.filename}] ${warning}`);
            }
        } catch (err) {
            state.errors.push({
                step: 'parse',
                message: `Failed to parse ${file.filename}: ${(err as Error).message}`,
                fatal: false, // Non-fatal by default, but subject to prompt below
                error: err
            });
        }
    }

    // Populate statistics for reconciliation
    state.statistics.rawTransactionCount = Object.values(state.parseResults).reduce(
        (acc, res) => acc + res.transactions.length,
        0
    );

    // D8.4 / D8.5: After parsing, if any errors, call promptContinue (unless --yes/non-TTY)
    if (state.errors.some(e => e.step === 'parse')) {
        const errorCount = state.errors.filter(e => e.step === 'parse').length;
        const shouldContinue = await promptContinue(
            `\n⚠️  ${errorCount} file(s) failed to parse. Some data will be missing.`,
            state.options
        );

        if (!shouldContinue) {
            state.errors.push({
                step: 'parse',
                message: 'Aborted by user after parse errors.',
                fatal: true
            });
        }
    }

    if (state.transactions.length === 0 && state.errors.length === 0) {
        state.warnings.push('No transactions found in any of the files.');
    }

    return state;
};
