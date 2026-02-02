import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/**
 * Computes a SHA-256 hash of a file's content.
 * Returns the hash prefixed with 'sha256:'.
 */
export async function hashFile(filePath: string): Promise<string> {
    const content = await readFile(filePath);
    const hash = createHash('sha256').update(content).digest('hex');
    return `sha256:${hash}`;
}
