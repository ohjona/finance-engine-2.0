/**
 * Pattern matching for categorization.
 * Per PRD §9.2, IK D4.4, D4.10, D4.15.
 *
 * ARCHITECTURAL NOTE: No console.* calls. Invalid regex returns warning in result.
 */

import { normalizeDescription } from '../utils/normalize.js';
import type { Rule } from '../types/index.js';
import type { MatchResult } from './types.js';

/**
 * Match normalized description against a rule pattern.
 *
 * Per IK D4.15: Normalize both description and pattern before comparison.
 * Per IK D4.10: Invalid regex returns false with warning, doesn't crash.
 *
 * @param normalizedDesc - Already normalized description (via normalizeDescription)
 * @param rule - Rule to match against
 * @returns Match result with optional warning for invalid regex
 */
export function matchesPattern(normalizedDesc: string, rule: Rule): MatchResult {
    const patternType = rule.pattern_type ?? 'substring';

    if (patternType === 'regex') {
        try {
            // For regex: use original pattern (user wrote explicit regex)
            // Case-insensitive flag for consistency
            const regex = new RegExp(rule.pattern, 'i');
            return { matched: regex.test(normalizedDesc) };
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            return {
                matched: false,
                warning: `Invalid regex pattern "${rule.pattern}": ${errorMsg}`,
            };
        }
    }

    // Substring: normalize pattern same as description
    // Per IK D4.15: always normalize both sides
    const normalizedPattern = normalizeDescription(rule.pattern);
    return { matched: normalizedDesc.includes(normalizedPattern) };
}

/**
 * Test if a pattern is valid (can be compiled).
 *
 * @param pattern - Pattern string
 * @param patternType - 'substring' or 'regex'
 * @returns true if pattern is valid
 */
export function isValidPattern(
    pattern: string,
    patternType: 'substring' | 'regex' = 'substring'
): boolean {
    if (patternType === 'regex') {
        try {
            new RegExp(pattern);
            return true;
        } catch {
            return false;
        }
    }
    return true; // Substring patterns are always valid syntactically
}
