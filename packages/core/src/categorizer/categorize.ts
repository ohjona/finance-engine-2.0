/**
 * Transaction categorization with 4-layer rule hierarchy.
 * Per PRD §9.1, §9.2.
 *
 * Layer priority (first match wins):
 * 1. user_rules (confidence 1.0)
 * 2. shared_rules (confidence 0.9)
 * 3. base_rules (confidence 0.8)
 * 4. bank_category (confidence 0.6)
 * 5. UNCATEGORIZED fallback (confidence 0.3)
 *
 * ARCHITECTURAL NOTE: No console.* calls. Warnings returned in result.
 */

import { normalizeDescription } from '../utils/normalize.js';
import { matchesPattern } from './match.js';
import { guessFromBankCategory } from './bank-category.js';
import {
    CONFIDENCE,
    UNCATEGORIZED_CATEGORY_ID,
} from '../types/index.js';
import type {
    Transaction,
    RuleSet,
    Rule,
    CategorizationResult,
    CategorizationOutput,
} from '../types/index.js';
import type { CategorizeOptions, CategorizationStats, BankCategoryMap } from './types.js';

/**
 * Categorize a single transaction using 4-layer rule hierarchy.
 *
 * @param transaction - Transaction to categorize
 * @param rules - RuleSet containing user_rules, shared_rules, base_rules
 * @param options - Optional configuration (bankCategoryMap)
 * @returns CategorizationOutput with result and any warnings
 */
export function categorize(
    transaction: Transaction,
    rules: RuleSet,
    options: CategorizeOptions = {}
): CategorizationOutput {
    const warnings: string[] = [];
    const desc = normalizeDescription(transaction.raw_description);

    /**
     * Try matching against a rule array.
     * Returns result if matched, null otherwise.
     */
    function tryLayer(
        ruleList: Rule[],
        source: 'user' | 'shared' | 'base',
        confidence: number
    ): CategorizationResult | null {
        for (const rule of ruleList) {
            const { matched, warning } = matchesPattern(desc, rule);
            if (warning) {
                warnings.push(warning);
            }
            if (matched) {
                return {
                    category_id: rule.category_id,
                    confidence,
                    source,
                    needs_review: false,
                    review_reasons: [],
                };
            }
        }
        return null;
    }

    // Layer 1: User rules (confidence 1.0)
    let result = tryLayer(rules.user_rules, 'user', CONFIDENCE.USER_RULES);
    if (result) return { result, warnings };

    // Layer 2: Shared rules (confidence 0.9)
    result = tryLayer(rules.shared_rules, 'shared', CONFIDENCE.SHARED_RULES);
    if (result) return { result, warnings };

    // Layer 3: Base rules (confidence 0.8)
    result = tryLayer(rules.base_rules, 'base', CONFIDENCE.BASE_RULES);
    if (result) return { result, warnings };

    // Layer 4: Bank category (confidence 0.6)
    if (transaction.raw_category) {
        const categoryId = guessFromBankCategory(
            transaction.raw_category,
            options.bankCategoryMap
        );
        if (categoryId !== null) {
            return {
                result: {
                    category_id: categoryId,
                    confidence: CONFIDENCE.BANK_CATEGORY,
                    source: 'bank',
                    needs_review: false,
                    review_reasons: [],
                },
                warnings,
            };
        }
    }

    // Default: UNCATEGORIZED (confidence 0.3)
    return {
        result: {
            category_id: UNCATEGORIZED_CATEGORY_ID,
            confidence: CONFIDENCE.UNCATEGORIZED,
            source: 'uncategorized',
            needs_review: true,
            review_reasons: ['no_rule_match'],
        },
        warnings,
    };
}

/**
 * Apply categorization result to transaction.
 * Mutates transaction in place.
 */
function applyCategorization(txn: Transaction, result: CategorizationResult): void {
    txn.category_id = result.category_id;
    txn.confidence = result.confidence;
    txn.needs_review = result.needs_review;
    txn.review_reasons = result.review_reasons;
}

/**
 * Categorize all transactions in a batch.
 *
 * @param transactions - Array of transactions to categorize
 * @param rules - RuleSet for categorization
 * @param options - Optional configuration
 * @returns Object with categorized transactions, aggregated warnings, and stats
 */
export function categorizeAll(
    transactions: Transaction[],
    rules: RuleSet,
    options: CategorizeOptions = {}
): {
    transactions: Transaction[];
    warnings: string[];
    stats: CategorizationStats;
} {
    const allWarnings: string[] = [];
    const stats: CategorizationStats = {
        total: transactions.length,
        bySource: {
            user: 0,
            shared: 0,
            base: 0,
            bank: 0,
            uncategorized: 0,
        },
        needsReview: 0,
    };

    for (const txn of transactions) {
        const { result, warnings } = categorize(txn, rules, options);

        // Apply categorization
        applyCategorization(txn, result);

        // Aggregate warnings (dedupe)
        for (const w of warnings) {
            if (!allWarnings.includes(w)) {
                allWarnings.push(w);
            }
        }

        // Update stats
        stats.bySource[result.source]++;
        if (result.needs_review) {
            stats.needsReview++;
        }
    }

    return { transactions, warnings: allWarnings, stats };
}
