import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Searches for the workspace root by looking for 'config/user-rules.yaml'.
 * Starts at startPath and bubbles up to the root.
 */
export function detectWorkspaceRoot(startPath: string = process.cwd()): string | null {
    let current = resolve(startPath);
    while (true) {
        const configPath = join(current, 'config', 'user-rules.yaml');
        if (existsSync(configPath)) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return null;
}
