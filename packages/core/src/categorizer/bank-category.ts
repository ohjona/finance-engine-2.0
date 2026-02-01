/**
 * Bank category mapping for Layer 4 categorization.
 * Per PRD §9.1.
 *
 * Only Amex and Discover provide raw_category fields.
 * Mapping is intentionally sparse for Phase 3 - CLI (Phase 5) can extend.
 */

import type { BankCategoryMap } from './types.js';

/**
 * Default bank category map.
 * Empty for Phase 3 - will be populated via config in Phase 5.
 *
 * Keys should be uppercase normalized bank category strings.
 * Values are category_ids from chart of accounts.
 */
export const DEFAULT_BANK_CATEGORY_MAP: BankCategoryMap = {
    // Phase 3: Infrastructure only, no mappings
    // Phase 5 will add config-based mappings like:
    // 'RESTAURANT': 4320,
    // 'TRANSPORTATION': 4260,
    // 'MERCHANDISE': 4990,
};

/**
 * Guess category_id from bank-provided category string.
 *
 * @param rawCategory - Bank's category string (e.g., "Transportation-Taxi")
 * @param map - Category mapping (defaults to DEFAULT_BANK_CATEGORY_MAP)
 * @returns category_id if mapped, null otherwise
 */
export function guessFromBankCategory(
    rawCategory: string,
    map: BankCategoryMap = DEFAULT_BANK_CATEGORY_MAP
): number | null {
    if (!rawCategory) return null;

    const normalized = rawCategory.toUpperCase().trim();

    // Try exact match first
    if (normalized in map) {
        return map[normalized];
    }

    // Try partial match (category contains key or key contains category)
    for (const [key, categoryId] of Object.entries(map)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return categoryId;
        }
    }

    return null;
}
