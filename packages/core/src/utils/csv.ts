/**
 * CSV parsing utilities.
 */

/**
 * Strip UTF-8 Byte Order Mark (BOM) from a string if present.
 * BOM (\uFEFF) can interfere with column header matching in CSVs.
 */
export function stripBom(value: string): string {
    if (value.startsWith('\uFEFF')) {
        return value.slice(1);
    }
    return value;
}
