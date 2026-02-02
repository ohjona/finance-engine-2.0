import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { Workspace } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Constructs a Workspace object from a root path.
 */
export function resolveWorkspace(root: string): Workspace {
    const sharedRulesPath = resolveSharedRulesPath();

    return {
        root,
        imports: join(root, 'imports'),
        outputs: join(root, 'outputs'),
        archive: join(root, 'archive'),
        config: {
            accountsPath: join(root, 'config', 'accounts.json'),
            userRulesPath: join(root, 'config', 'user-rules.yaml'),
            baseRulesPath: join(root, 'config', 'base-rules.yaml'),
            sharedRulesPath
        }
    };
}

function resolveSharedRulesPath(): string {
    // In dev: packages/cli/src/workspace/paths.ts -> __dirname = packages/cli/src/workspace
    // In dist: packages/cli/dist/workspace/paths.js -> __dirname = packages/cli/dist/workspace
    const pkgRoot = join(__dirname, '..', '..');
    const path = join(pkgRoot, 'assets', 'shared-rules.yaml');

    if (!existsSync(path)) {
        console.warn(`\n⚠️  Warning: Shared rules not found at ${path}`);
        console.warn('Proceeding without shared rules.\n');
    }

    return path;
}

export function getImportsPath(workspace: Workspace, month: string): string {
    return join(workspace.imports, month);
}

export function getOutputsPath(workspace: Workspace, month: string): string {
    return join(workspace.outputs, month);
}

export function getArchivePath(workspace: Workspace, month: string): string {
    return join(workspace.archive, month, 'raw');
}
