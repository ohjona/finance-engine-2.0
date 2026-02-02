/**
 * Pattern validation utilities.
 * Per IK D4.6, D4.7, D4.8, D4.11.
 *
 * ARCHITECTURAL NOTE: No console.* calls. Results returned as data.
 */

import { normalizeDescription } from '../utils/normalize.js';
import { matchesPattern, isValidPattern } from './match.js';
import { PATTERN_VALIDATION } from '../types/index.js';
import type { Rule, Transaction, PatternValidationResult, CollisionResult } from '../types/index.js';

/**
 * Validate a pattern before adding as a rule.
 *
 * Per IK D4.7: Pattern matches >20% of transactions AND >3 = too broad
 * Per IK D4.8: Pattern < 5 chars = rejected
 * Per IK D4.11: Empty pattern = rejected
 * Per IK D4.9: Validate against current run's transactions only
 *
 * @param pattern - Pattern string to validate
 * @param patternType - 'substring' or 'regex'
 * @param transactions - Optional transaction list for breadth check
 * @returns Validation result with errors and warnings
 */
export function validatePattern(
    pattern: string,
    patternType: 'substring' | 'regex' = 'substring',
    transactions?: Transaction[]
): PatternValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // IK D4.11: Empty pattern rejected
    if (!pattern || pattern.trim() === '') {
        errors.push('Pattern cannot be empty');
        return { valid: false, errors, warnings };
    }

    // IK D4.8: Minimum length check
    if (pattern.length < PATTERN_VALIDATION.MIN_LENGTH) {
        errors.push(
            `Pattern must be at least ${PATTERN_VALIDATION.MIN_LENGTH} characters (got ${pattern.length})`
        );
        return { valid: false, errors, warnings };
    }

    // Regex syntax validation
    if (patternType === 'regex' && !isValidPattern(pattern, 'regex')) {
        errors.push(`Invalid regex syntax: "${pattern}"`);
        return { valid: false, errors, warnings };
    }

    // If no transactions provided, can only do syntax validation
    if (!transactions || transactions.length === 0) {
        return { valid: true, errors, warnings };
    }

    // IK D4.7: Breadth check
    const rule: Rule = { pattern, pattern_type: patternType, category_id: 0 };
    let matchCount = 0;

    for (const txn of transactions) {
        const normalizedDesc = normalizeDescription(txn.raw_description);
        const { matched } = matchesPattern(normalizedDesc, rule);
        if (matched) matchCount++;
    }

    const matchPercent = matchCount / transactions.length;

    // IK D4.7: >20% AND >3 matches = too broad
    if (
        matchPercent > PATTERN_VALIDATION.MAX_MATCH_PERCENT &&
        matchCount > PATTERN_VALIDATION.MAX_MATCHES_FOR_BROAD
    ) {
        warnings.push(
            `Pattern "${pattern}" is too broad: matches ${matchCount} transactions ` +
            `(${(matchPercent * 100).toFixed(1)}% > ${PATTERN_VALIDATION.MAX_MATCH_PERCENT * 100}%)`
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
        matchCount,
        matchPercent,
    };
}

/**
 * Check if a new pattern collides with existing rules.
 *
 * Per IK D4.6: Warn on overlapping patterns.
 *
 * @param pattern - New pattern to check
 * @param patternType - 'substring' or 'regex'
 * @param existingRules - Existing rules to check against
 * @returns Collision result with list of colliding patterns
 */
export function checkPatternCollision(
    pattern: string,
    patternType: 'substring' | 'regex',
    existingRules: Rule[]
): CollisionResult {
    const collidingPatterns: string[] = [];
    const normalizedNew = normalizeDescription(pattern);

    for (const rule of existingRules) {
        const normalizedExisting = normalizeDescription(rule.pattern);

        // Check for substring overlap
        if (patternType === 'substring' && (rule.pattern_type ?? 'substring') === 'substring') {
            // One contains the other
            if (normalizedNew.includes(normalizedExisting) || normalizedExisting.includes(normalizedNew)) {
                collidingPatterns.push(rule.pattern);
            }
        }

        // Exact match is always a collision
        if (normalizedNew === normalizedExisting) {
            if (!collidingPatterns.includes(rule.pattern)) {
                collidingPatterns.push(rule.pattern);
            }
        }
    }

    return {
        hasCollision: collidingPatterns.length > 0,
        collidingPatterns,
    };
}
