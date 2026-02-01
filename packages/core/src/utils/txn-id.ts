/**
 * Transaction ID generation and collision handling.
 * Per PRD Section 7.5, IK D2.3, D2.4, D2.12.
 *
 * ARCHITECTURAL NOTE: Uses js-sha256 for cross-platform compatibility.
 * Node's crypto module is not available in browser.
 */

import { sha256 } from 'js-sha256';
import Decimal from 'decimal.js';
import type { Transaction } from '../types/index.js';
import { TXN_ID } from '../types/index.js';

/**
 * Generate deterministic transaction ID via SHA-256 hash.
 *
 * Payload format: "{effective_date}|{raw_description}|{signed_amount}|{account_id}"
 *
 * Per IK D2.3: 16-character hex string, filename-independent.
 * Per IK D2.12:
 *   - effective_date: ISO 8601 YYYY-MM-DD
 *   - raw_description: raw bytes (NO normalization before hash)
 *   - signed_amount: plain decimal string, no trailing zeros
 *   - account_id: integer as string
 *
 * @param effectiveDate - ISO date string YYYY-MM-DD
 * @param rawDescription - Raw description (NOT normalized)
 * @param signedAmount - Amount as Decimal
 * @param accountId - 4-digit account ID
 * @returns 16-character hex transaction ID
 */
export function generateTxnId(
    effectiveDate: string,
    rawDescription: string,
    signedAmount: Decimal,
    accountId: number
): string {
    // Normalize amount to plain decimal string (no trailing zeros, no exponent)
    // Decimal.toFixed() without args removes trailing zeros
    const amountStr = signedAmount.toFixed();

    const payload = `${effectiveDate}|${rawDescription}|${amountStr}|${accountId}`;
    return sha256(payload).slice(0, TXN_ID.LENGTH);
}

/**
 * Resolve collisions by adding deterministic suffixes.
 *
 * Per IK D2.4: Same-day duplicate transactions get -02, -03, etc.
 * Per IK D2.13: Files must be processed in lexicographic sort order for determinism.
 *
 * PURE FUNCTION: Returns new array with updated IDs. Does not mutate input.
 *
 * @param transactions - Array of transactions (not mutated)
 * @returns New array with collision suffixes applied to txn_id
 */
export function resolveCollisions(transactions: readonly Transaction[]): Transaction[] {
    const seen: Record<string, number> = {};
    const result: Transaction[] = [];

    for (const txn of transactions) {
        const baseId = txn.txn_id;

        if (seen[baseId]) {
            seen[baseId] += 1;

            // B-2: Cap at 99 collisions to match schema regex (-\d{2})
            if (seen[baseId] > 99) {
                throw new Error(`Collision overflow: ${baseId} has reached max limit of 99 duplicates`);
            }

            // Suffix format: -02, -03, etc.
            const suffix = String(seen[baseId]).padStart(2, '0');
            result.push({
                ...txn,
                txn_id: `${baseId}-${suffix}`,
            });
        } else {
            seen[baseId] = 1;
            result.push({ ...txn });
        }
    }

    return result;
}

/**
 * Build collision map for run manifest.
 * Returns map of base ID -> count for IDs with collisions (count > 1).
 *
 * @param transactions - Array of transactions (after collision resolution)
 * @returns Map of base txn_id to collision count
 */
export function buildCollisionMap(transactions: readonly Transaction[]): Record<string, number> {
    const counts: Record<string, number> = {};

    for (const txn of transactions) {
        // Extract base ID (remove suffix if present)
        const baseId = txn.txn_id.includes('-')
            ? txn.txn_id.substring(0, TXN_ID.LENGTH)
            : txn.txn_id;

        counts[baseId] = (counts[baseId] || 0) + 1;
    }

    // Only return entries with collisions (count > 1)
    const collisionMap: Record<string, number> = {};
    for (const [id, count] of Object.entries(counts)) {
        if (count > 1) {
            collisionMap[id] = count;
        }
    }

    return collisionMap;
}
