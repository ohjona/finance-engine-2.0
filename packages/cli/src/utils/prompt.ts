import { createInterface } from 'node:readline';
import type { ProcessOptions } from '../types.js';

/**
 * Prompts the user for confirmation if in a TTY.
 * If --yes is provided, returns true automatically.
 * If not a TTY and --yes is not provided, returns false.
 */
export async function promptContinue(message: string, options: ProcessOptions): Promise<boolean> {
    if (options.yes) return true;

    if (!process.stdin.isTTY) {
        console.error('Non-interactive mode. Use --yes to continue on errors.');
        return false;
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout });

    return new Promise((resolve) => {
        rl.question(`${message} [y/N] `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y');
        });
    });
}
