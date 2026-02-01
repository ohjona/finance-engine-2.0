/**
 * Description normalization for pattern matching.
 * Per PRD Section 9.3, IK D3.8.
 *
 * NOTE: This is for matching, NOT for txn_id generation.
 * txn_id uses raw_description per IK D2.12.
 */

/**
 * Normalize transaction description for consistent pattern matching.
 *
 * Transformations:
 * - Convert to uppercase
 * - Replace * and # with space (common bank separators)
 * - Collapse multiple whitespace to single space
 * - Trim leading/trailing whitespace
 *
 * @param raw - Raw description string
 * @returns Normalized description for matching
 */
export function normalizeDescription(raw: string): string {
    return raw
        .toUpperCase()
        .replace(/[*#]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
