/**
 * Formatted console output helpers
 */

export function log(message: string): void {
    console.log(message);
}

export function success(message: string): void {
    console.log(`✓ ${message}`);
}

export function warn(message: string): void {
    console.warn(`⚠ ${message}`);
}

export function arrow(message: string): void {
    console.log(`→ ${message}`);
}
