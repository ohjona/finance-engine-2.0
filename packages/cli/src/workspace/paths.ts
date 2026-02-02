import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Workspace } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Constructs a Workspace object from a root path.
 */
export function resolveWorkspace(root: string): Workspace {
    // shared-rules.yaml is bundled with the CLI package.
    // Assuming it's in a 'assets' or 'dist/assets' folder relative to the build.
    // For now, we'll try to find it relative to this file.
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
    // In dev, it might be in ../../assets/shared-rules.yaml
    // In prod, it should be relative to the package root.
    // For now, we'll look for it in a reasonable place.
    return join(__dirname, '..', '..', 'assets', 'shared-rules.yaml');
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
