import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCollisionMap } from '@finance-engine/core';
import type { PipelineStep } from '../types.js';
import { getOutputsPath } from '../../workspace/paths.js';
import { generateJournalExcel } from '../../excel/journal.js';
import { generateReviewExcel } from '../../excel/review.js';
import { generateAnalysisExcel } from '../../excel/analysis.js';

/**
 * Step 9: Export
 * Generates and saves Excel reports and the processing manifest.
 */
export const exportResults: PipelineStep = async (state) => {
    if (state.options.dryRun) {
        state.warnings.push('Dry run: Skipping file export.');
        return state;
    }

    const outputPath = getOutputsPath(state.workspace, state.month);

    try {
        await mkdir(outputPath, { recursive: true });

        // 1. Export Excel Reports
        if (state.ledgerResult) {
            const journalWb = await generateJournalExcel(state.ledgerResult.entries);
            await journalWb.xlsx.writeFile(join(outputPath, 'journal.xlsx'));
        }

        const reviewWb = await generateReviewExcel(state.transactions);
        await reviewWb.xlsx.writeFile(join(outputPath, 'review.xlsx'));

        const analysisWb = await generateAnalysisExcel(state.transactions);
        await analysisWb.xlsx.writeFile(join(outputPath, 'analysis.xlsx'));

        // 2. Export Run Manifest
        // Matches RunManifestSchema in @finance-engine/shared
        const manifest = {
            month: state.month,
            run_timestamp: new Date().toISOString(),
            input_files: Object.fromEntries(state.files.map(f => [f.filename, f.hash])),
            transaction_count: state.transactions.length,
            txn_ids: state.transactions.map(t => t.txn_id),
            collision_map: buildCollisionMap(state.transactions),
            version: '2.0.0'
        };

        await writeFile(
            join(outputPath, 'run_manifest.json'),
            JSON.stringify(manifest, null, 2)
        );

    } catch (err) {
        state.errors.push({
            step: 'export',
            message: `Failed to export results to ${outputPath}: ${(err as Error).message}`,
            fatal: true,
            error: err
        });
    }

    return state;
};
