import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectWorkspaceRoot } from '../src/workspace/detect.js';
import { resolveWorkspace, getImportsPath, getOutputsPath, getArchivePath } from '../src/workspace/paths.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mocking fs to avoid actual disk I/O in simple unit tests
vi.mock('node:fs');

describe('Workspace Detection', () => {
    it('should detect workspace root when user-rules.yaml exists', () => {
        const mockCwd = '/Users/test/projects/my-finance';
        vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);

        // Mock existence of the config file
        vi.spyOn(fs, 'existsSync').mockImplementation((p: fs.PathLike) => {
            return p.toString().endsWith('config/user-rules.yaml');
        });

        const root = detectWorkspaceRoot();
        expect(root).toBe(mockCwd);
    });

    it('should return null if no workspace is found in parents', () => {
        vi.spyOn(process, 'cwd').mockReturnValue('/');
        vi.spyOn(fs, 'existsSync').mockReturnValue(false);

        const root = detectWorkspaceRoot();
        expect(root).toBeNull();
    });
});

describe('Path Resolution', () => {
    const root = '/work';
    const workspace = resolveWorkspace(root);

    it('should resolve standard paths correctly', () => {
        expect(workspace.root).toBe(root);
        expect(workspace.imports).toBe(path.join(root, 'imports'));
        expect(workspace.outputs).toBe(path.join(root, 'outputs'));
        expect(workspace.archive).toBe(path.join(root, 'archive'));
    });

    it('should generate monthly paths', () => {
        expect(getImportsPath(workspace, '2026-01')).toBe(path.join(root, 'imports/2026-01'));
        expect(getOutputsPath(workspace, '2026-01')).toBe(path.join(root, 'outputs/2026-01'));
        expect(getArchivePath(workspace, '2026-01')).toBe(path.join(root, 'archive/2026-01/raw'));
    });
});
