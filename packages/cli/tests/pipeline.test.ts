import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectFiles } from '../src/pipeline/steps/detect.js';
import { parseFiles } from '../src/pipeline/steps/parse.js';
import type { PipelineState } from '../src/pipeline/types.js';
import type { Workspace } from '../src/types.js';
import * as fs from 'node:fs/promises';
import { resolveWorkspace } from '../src/workspace/paths.js';

vi.mock('node:fs/promises');

describe('Pipeline Step: Detection & Parsing', () => {
    const workspace = resolveWorkspace('/fake/root');
    const month = '2026-01';

    let initialState: PipelineState;

    beforeEach(() => {
        initialState = {
            month,
            workspace,
            accounts: { accounts: {} } as any,
            options: { dryRun: false, force: false, yes: true, llm: false },
            files: [],
            parseResults: {},
            transactions: [],
            errors: [],
            warnings: [],
            statistics: {
                rawTransactionCount: 0,
                duplicateCount: 0,
                matchedPairCount: 0
            }
        };
        vi.clearAllMocks();
    });

    it('should detect and parse files correctly', async () => {
        // 1. Mock readdir to return some files
        vi.spyOn(fs, 'readdir').mockResolvedValue([
            'chase_1234_202601.csv' as any
        ]);

        // Mock stat
        vi.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as any);

        // 2. Mock readFile to return CSV content
        const csvContent = 'Posting Date,Description,Amount\n' +
            '01/01/2026,CHASE PAYROLL,1000.00';
        vi.spyOn(fs, 'readFile').mockResolvedValue(Buffer.from(csvContent) as any);

        // 3. Run Detection
        const stateAfterDetect = await detectFiles(initialState);
        expect(stateAfterDetect.files).toHaveLength(1);
        expect(stateAfterDetect.files[0].parserName).toBe('chase_checking');

        // 4. Run Parsing
        const stateAfterParse = await parseFiles(stateAfterDetect);
        expect(stateAfterParse.transactions).toHaveLength(1);
        expect(stateAfterParse.transactions[0].signed_amount).toBe('1000');
        expect(stateAfterParse.errors).toHaveLength(0);
    });

    it('should handle unidentifiable files with warnings', async () => {
        vi.spyOn(fs, 'readdir').mockResolvedValue([
            'unknown-file.txt' as any
        ]);
        vi.spyOn(fs, 'stat').mockResolvedValue({ isFile: () => true } as any);

        const state = await detectFiles(initialState);
        expect(state.files).toHaveLength(1); // One file found, but no parser
        expect(state.warnings[0]).toContain('File skipped (no parser found): unknown-file.txt');
    });
});
