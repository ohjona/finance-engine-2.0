/**
 * Constants for Finance Engine.
 * Per IK D2.7, D4.2, D4.7, D4.8, D6.1, D6.2.
 */

/**
 * Category ID for uncategorized transactions.
 * Visually distinct from 4990 (Miscellaneous) to indicate categorization failure.
 * Per IK D2.7.
 */
export const UNCATEGORIZED_CATEGORY_ID = 4999;

/**
 * Confidence scores per categorization source.
 * Per IK D4.2.
 */
export const CONFIDENCE = {
    USER_RULES: 1.0,
    SHARED_RULES: 0.9,
    LLM_APPROVED: 0.85,
    BASE_RULES: 0.8,
    LLM_INFERENCE: 0.7,
    BANK_CATEGORY: 0.6,
    UNCATEGORIZED: 0.3,
} as const;

/**
 * Pattern matching validation thresholds.
 * Per IK D4.7, D4.8.
 */
export const PATTERN_VALIDATION = {
    MIN_LENGTH: 5,
    MAX_MATCH_PERCENT: 0.2,
    MAX_MATCHES_FOR_BROAD: 3,
} as const;

/**
 * Payment matching configuration.
 * Per IK D6.1, D6.2.
 */
export const MATCHING_CONFIG = {
    DATE_TOLERANCE_DAYS: 5,
    AMOUNT_TOLERANCE: '0.01',
} as const;

/**
 * Transaction ID configuration.
 * Per IK D2.3.
 */
export const TXN_ID = {
    LENGTH: 16,
    COLLISION_SUFFIX_START: 2,
} as const;
