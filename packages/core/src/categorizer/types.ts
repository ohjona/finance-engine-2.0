/**
 * Internal types for categorizer module.
 */

/**
 * Result of pattern matching against a single rule.
 */
export interface MatchResult {
    matched: boolean;
    warning?: string;
}

/**
 * Bank category to category_id mapping.
 * Keys are normalized bank category strings (uppercase).
 */
export type BankCategoryMap = Record<string, number>;

/**
 * Options for categorize() function.
 */
export interface CategorizeOptions {
    bankCategoryMap?: BankCategoryMap;
}

/**
 * Statistics from batch categorization.
 */
export interface CategorizationStats {
    total: number;
    bySource: {
        user: number;
        shared: number;
        base: number;
        bank: number;
        uncategorized: number;
    };
    needsReview: number;
}
