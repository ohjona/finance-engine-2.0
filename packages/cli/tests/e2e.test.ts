import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../src/pipeline/runner.js';
import type { Workspace } from '../src/types.js';
import * as fsPromises from 'node:fs/promises';
import * as fs from 'node:fs';
import { resolveWorkspace } from '../src/workspace/paths.js';
import * as path from 'node:path';

vi.mock('node:fs/promises');
vi.mock('node:fs');

describe('E2E Pipeline Integration', () => {
    const root = '/fake/project';
    const workspace = resolveWorkspace(root);
    const month = '2026-01';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should run the full pipeline without fatal errors', async () => {
        // Mocking synchronous fs calls used in loading accounts/rules
        vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
            if (p.includes('run_manifest.json')) return false;
            return true;
        });
        vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
            if (p.includes('accounts.json')) return JSON.stringify({
                accounts: {
                    "1234": { name: "Chase Checking", type: "asset" },
                    "101": { name: "Groceries", type: "expense" }
                }
            });
            if (p.includes('user-rules.yaml')) return 'rules: []';
            if (p.includes('base-rules.yaml')) return 'rules: []';
            if (p.includes('shared-rules.yaml')) return 'rules: []';
            return '';
        });

        // Mocking asynchronous fs/promises calls
        vi.spyOn(fsPromises, 'readFile').mockImplementation((p: any) => {
            if (p.includes('run_manifest.json')) throw new Error('ENOENT');
            if (p.includes('chase_1234_202601.csv')) return Promise.resolve(Buffer.from('Posting Date,Description,Amount\n01/01/2026,Lunch,12.50'));
            return Promise.resolve(Buffer.from(''));
        });

        vi.spyOn(fsPromises, 'readdir').mockImplementation((p: any) => {
            if (p.includes('imports/2026-01')) return Promise.resolve(['chase_1234_202601.csv'] as any);
            return Promise.resolve([]);
        });
        vi.spyOn(fsPromises, 'stat').mockResolvedValue({ isFile: () => true } as any);
        vi.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
        vi.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);
        vi.spyOn(fsPromises, 'rename').mockResolvedValue(undefined);

        const options = { dryRun: true, force: false, yes: true, llm: false };
        const state = await runPipeline(month, workspace, options);

        expect(state.errors.filter(e => e.fatal)).toHaveLength(0);
        expect(state.transactions).toHaveLength(1);
        expect(state.transactions[0].description).toBe('LUNCH');
        expect(state.files).toHaveLength(1);
    });
});
