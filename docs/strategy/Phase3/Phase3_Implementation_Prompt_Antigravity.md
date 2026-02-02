# Phase 3 Implementation Prompt — Categorizer Module

**Target:** Antigravity (Implementation Agent)
**Author:** Chief Architect (Claude Opus 4.5)
**Date:** 2026-02-01
**Branch:** `phase-3/categorizer`

---

## 1. Overview

Phase 3 implements the 4-layer categorization system that assigns expense categories to parsed transactions. Building on the parser infrastructure from Phases 1-2, this module provides the core business logic for automatic transaction categorization.

### What Phase 3 Builds

| Component | Description | File |
|-----------|-------------|------|
| `categorize()` | 4-layer rule matching with confidence | `categorizer/categorize.ts` |
| `categorizeAll()` | Batch categorization with stats | `categorizer/categorize.ts` |
| `matchesPattern()` | Substring and regex matching | `categorizer/match.ts` |
| `guessFromBankCategory()` | Bank raw_category → category_id | `categorizer/bank-category.ts` |
| `validatePattern()` | Min length, breadth check, empty rejection | `categorizer/validate.ts` |
| `checkPatternCollision()` | Warn on overlapping patterns | `categorizer/validate.ts` |

### Architectural Decisions

**Decision 1: Warning Handling (Headless Core)**
PRD §9.2 shows `console.warn` for invalid regex, but core prohibits console calls. Solution: Return warnings as data via `CategorizationOutput` wrapper type containing `{ result: CategorizationResult, warnings: string[] }`. This matches the `ParseResult` pattern from parsers.

**Decision 2: guessFromBankCategory() Mapping**
Core cannot do file I/O, so the bank category map is passed as a parameter. For Phase 3, provide infrastructure with empty default map. CLI (Phase 5) will populate mappings from config.

**Decision 3: Pattern Normalization**
IK D4.15 requires normalizing both description and pattern. For substring matching, apply `normalizeDescription()` to pattern. For regex matching, keep original pattern (user wrote explicit regex).

**Decision 4: validatePattern() as Standalone**
Validation is a pure utility function. The optional `transactions` parameter enables breadth checking. CLI (Phase 5) handles user prompts for validation failures.

---

## 2. Pre-Implementation Checklist

```bash
# 1. Pull latest main (Phase 2 merged)
git checkout main
git pull origin main

# 2. Create Phase 3 branch
git checkout -b phase-3/categorizer

# 3. Verify existing tests pass
pnpm install
pnpm test

# 4. Verify build succeeds
pnpm build
```

All must pass before proceeding.

---

## 3. Existing Infrastructure (Do NOT Redefine)

The following already exist in the codebase. Use them directly:

**From `packages/shared/src/schemas.ts`:**
- `TransactionSchema` with `raw_category: z.string().optional()`
- `CategorizationResultSchema` with source enum `'user' | 'shared' | 'base' | 'bank' | 'uncategorized'`
- `RuleSchema` with pattern, pattern_type, category_id, note, added_date, source
- `RuleSetSchema` with user_rules, shared_rules, base_rules

**From `packages/shared/src/constants.ts`:**
```typescript
export const UNCATEGORIZED_CATEGORY_ID = 4999;

export const CONFIDENCE = {
    USER_RULES: 1.0,
    SHARED_RULES: 0.9,
    LLM_APPROVED: 0.85,
    BASE_RULES: 0.8,
    LLM_INFERENCE: 0.7,
    BANK_CATEGORY: 0.6,
    UNCATEGORIZED: 0.3,
} as const;

export const PATTERN_VALIDATION = {
    MIN_LENGTH: 5,
    MAX_MATCH_PERCENT: 0.2,
    MAX_MATCHES_FOR_BROAD: 3,
} as const;
```

**From `packages/core/src/utils/normalize.ts`:**
```typescript
export function normalizeDescription(raw: string): string {
    return raw.toUpperCase().replace(/[*#]/g, ' ').replace(/\s+/g, ' ').trim();
}
```

---

## 4. Task Sequence

### Task 3.1: Schema Additions

**What:** Add `CategorizationOutputSchema` and `PatternValidationResultSchema` to shared schemas.
**Why:** Return warnings as data (headless core constraint), standardize validation results.
**Package:** shared

**File:** `packages/shared/src/schemas.ts` — ADD after `CategorizationResultSchema` (around line 85):

```typescript
/**
 * Categorization output - wraps result with warnings.
 * Per architectural constraint: no console.* in core.
 */
export const CategorizationOutputSchema = z.object({
    result: CategorizationResultSchema,
    warnings: z.array(z.string()),
});

export type CategorizationOutput = z.infer<typeof CategorizationOutputSchema>;

/**
 * Pattern validation result.
 * Per IK D4.7, D4.8, D4.11.
 */
export const PatternValidationResultSchema = z.object({
    valid: z.boolean(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
    matchCount: z.number().int().min(0).optional(),
    matchPercent: z.number().min(0).max(1).optional(),
});

export type PatternValidationResult = z.infer<typeof PatternValidationResultSchema>;

/**
 * Pattern collision check result.
 */
export const CollisionResultSchema = z.object({
    hasCollision: z.boolean(),
    collidingPatterns: z.array(z.string()),
});

export type CollisionResult = z.infer<typeof CollisionResultSchema>;
```

**File:** `packages/shared/src/index.ts` — ADD exports:

```typescript
export {
    // ... existing exports ...
    CategorizationOutputSchema,
    PatternValidationResultSchema,
    CollisionResultSchema,
} from './schemas.js';

export type {
    // ... existing type exports ...
    CategorizationOutput,
    PatternValidationResult,
    CollisionResult,
} from './schemas.js';
```

**Commit:**
```
feat(shared): add CategorizationOutput and validation schemas
```

---

### Task 3.2: Internal Types

**What:** Create categorizer internal types.
**Package:** core

**File:** `packages/core/src/categorizer/types.ts` — CREATE:

```typescript
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
```

**Commit:**
```
feat(core): add categorizer internal types
```

---

### Task 3.3: Pattern Matching

**What:** Implement `matchesPattern()` with substring and regex support.
**Why:** PRD §9.2, IK D4.4, D4.10, D4.15
**Package:** core

**File:** `packages/core/src/categorizer/match.ts` — CREATE:

```typescript
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
```

**Test File:** `packages/core/tests/categorizer/match.test.ts` — CREATE:

```typescript
import { describe, it, expect } from 'vitest';
import { matchesPattern, isValidPattern } from '../../src/categorizer/match.js';
import type { Rule } from '../../src/types/index.js';

describe('matchesPattern', () => {
    describe('substring matching', () => {
        it('matches case-insensitively', () => {
            const rule: Rule = { pattern: 'UBER', category_id: 4260 };
            expect(matchesPattern('UBER TRIP', rule).matched).toBe(true);
            expect(matchesPattern('uber trip', rule).matched).toBe(true);
        });

        it('matches partial description', () => {
            const rule: Rule = { pattern: 'AMAZON', category_id: 4310 };
            expect(matchesPattern('AMZN MKTP US AMAZON.COM', rule).matched).toBe(true);
        });

        it('normalizes pattern before matching', () => {
            // Pattern with special chars gets normalized
            const rule: Rule = { pattern: 'UBER*TRIP', category_id: 4260 };
            expect(matchesPattern('UBER TRIP HELP.UBER.COM', rule).matched).toBe(true);
        });

        it('does not match when pattern not present', () => {
            const rule: Rule = { pattern: 'NETFLIX', category_id: 4610 };
            expect(matchesPattern('SPOTIFY PREMIUM', rule).matched).toBe(false);
        });

        it('handles empty description', () => {
            const rule: Rule = { pattern: 'UBER', category_id: 4260 };
            expect(matchesPattern('', rule).matched).toBe(false);
        });
    });

    describe('regex matching', () => {
        it('matches valid regex pattern', () => {
            const rule: Rule = {
                pattern: 'UBER|LYFT',
                pattern_type: 'regex',
                category_id: 4260,
            };
            expect(matchesPattern('UBER TRIP', rule).matched).toBe(true);
            expect(matchesPattern('LYFT RIDE', rule).matched).toBe(true);
            expect(matchesPattern('TAXI CAB', rule).matched).toBe(false);
        });

        it('supports complex regex', () => {
            const rule: Rule = {
                pattern: 'WHOLEFDS|WHOLE\\s*FOODS',
                pattern_type: 'regex',
                category_id: 4310,
            };
            expect(matchesPattern('WHOLEFDS MKT', rule).matched).toBe(true);
            expect(matchesPattern('WHOLE FOODS MARKET', rule).matched).toBe(true);
        });

        it('returns warning for invalid regex', () => {
            const rule: Rule = {
                pattern: '[invalid(regex',
                pattern_type: 'regex',
                category_id: 4260,
            };
            const result = matchesPattern('TEST', rule);
            expect(result.matched).toBe(false);
            expect(result.warning).toContain('Invalid regex pattern');
        });

        it('does not crash on malformed regex', () => {
            const rule: Rule = {
                pattern: '(?!broken',
                pattern_type: 'regex',
                category_id: 4260,
            };
            // Should not throw
            const result = matchesPattern('TEST', rule);
            expect(result.matched).toBe(false);
            expect(result.warning).toBeDefined();
        });
    });

    describe('edge cases', () => {
        it('defaults to substring when pattern_type not specified', () => {
            const rule: Rule = { pattern: 'TEST', category_id: 4990 };
            expect(matchesPattern('TEST TRANSACTION', rule).matched).toBe(true);
        });

        it('handles pattern with asterisks (normalized away)', () => {
            const rule: Rule = { pattern: 'AMZN*MKTP', category_id: 4310 };
            expect(matchesPattern('AMZN MKTP US', rule).matched).toBe(true);
        });
    });
});

describe('isValidPattern', () => {
    it('returns true for valid substring patterns', () => {
        expect(isValidPattern('UBER', 'substring')).toBe(true);
        expect(isValidPattern('', 'substring')).toBe(true);
    });

    it('returns true for valid regex patterns', () => {
        expect(isValidPattern('UBER|LYFT', 'regex')).toBe(true);
        expect(isValidPattern('^AMAZON.*$', 'regex')).toBe(true);
    });

    it('returns false for invalid regex patterns', () => {
        expect(isValidPattern('[invalid', 'regex')).toBe(false);
        expect(isValidPattern('(?!broken', 'regex')).toBe(false);
    });
});
```

**Commit:**
```
feat(core): add pattern matching for categorizer
```

---

### Task 3.4: Bank Category Mapping

**What:** Implement `guessFromBankCategory()` for Layer 4.
**Why:** PRD §9.1 Layer 4, uses raw_category from Amex/Discover
**Package:** core

**File:** `packages/core/src/categorizer/bank-category.ts` — CREATE:

```typescript
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
```

**Test File:** `packages/core/tests/categorizer/bank-category.test.ts` — CREATE:

```typescript
import { describe, it, expect } from 'vitest';
import {
    guessFromBankCategory,
    DEFAULT_BANK_CATEGORY_MAP,
} from '../../src/categorizer/bank-category.js';
import type { BankCategoryMap } from '../../src/categorizer/types.js';

describe('guessFromBankCategory', () => {
    const testMap: BankCategoryMap = {
        'RESTAURANT': 4320,
        'RESTAURANTS': 4320,
        'TRANSPORTATION': 4260,
        'GROCERIES': 4310,
        'SUPERMARKETS': 4310,
    };

    it('returns null with default empty map', () => {
        expect(guessFromBankCategory('Restaurant')).toBeNull();
    });

    it('matches exact category (case-insensitive)', () => {
        expect(guessFromBankCategory('RESTAURANT', testMap)).toBe(4320);
        expect(guessFromBankCategory('restaurant', testMap)).toBe(4320);
        expect(guessFromBankCategory('Restaurant', testMap)).toBe(4320);
    });

    it('matches partial category', () => {
        // "TRANSPORTATION-TAXI" contains "TRANSPORTATION"
        expect(guessFromBankCategory('Transportation-Taxi', testMap)).toBe(4260);
    });

    it('returns null for unmapped category', () => {
        expect(guessFromBankCategory('Entertainment', testMap)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(guessFromBankCategory('', testMap)).toBeNull();
    });

    it('returns null for undefined-like input', () => {
        expect(guessFromBankCategory('', testMap)).toBeNull();
    });

    it('handles whitespace in category', () => {
        expect(guessFromBankCategory('  RESTAURANT  ', testMap)).toBe(4320);
    });
});

describe('DEFAULT_BANK_CATEGORY_MAP', () => {
    it('is empty for Phase 3', () => {
        expect(Object.keys(DEFAULT_BANK_CATEGORY_MAP).length).toBe(0);
    });
});
```

**Commit:**
```
feat(core): add bank category mapping for Layer 4
```

---

### Task 3.5: Pattern Validation

**What:** Implement `validatePattern()` and `checkPatternCollision()`.
**Why:** IK D4.7 (breadth), D4.8 (min length), D4.6 (collision), D4.11 (empty)
**Package:** core

**File:** `packages/core/src/categorizer/validate.ts` — CREATE:

```typescript
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
```

**Test File:** `packages/core/tests/categorizer/validate.test.ts` — CREATE:

```typescript
import { describe, it, expect } from 'vitest';
import { validatePattern, checkPatternCollision } from '../../src/categorizer/validate.js';
import type { Rule, Transaction } from '../../src/types/index.js';

// Helper to create minimal transaction
function makeTxn(description: string): Transaction {
    return {
        txn_id: 'a1b2c3d4e5f67890',
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: description.toUpperCase(),
        raw_description: description,
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: 4999,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    };
}

describe('validatePattern', () => {
    describe('syntax validation', () => {
        it('rejects empty pattern', () => {
            const result = validatePattern('');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Pattern cannot be empty');
        });

        it('rejects whitespace-only pattern', () => {
            const result = validatePattern('   ');
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Pattern cannot be empty');
        });

        it('rejects pattern shorter than MIN_LENGTH (5)', () => {
            const result = validatePattern('UBER');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('at least 5 characters');
        });

        it('accepts pattern of exactly MIN_LENGTH', () => {
            const result = validatePattern('UBERX');
            expect(result.valid).toBe(true);
        });

        it('rejects invalid regex syntax', () => {
            const result = validatePattern('[invalid', 'regex');
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid regex syntax');
        });

        it('accepts valid regex pattern', () => {
            const result = validatePattern('UBER|LYFT', 'regex');
            expect(result.valid).toBe(true);
        });
    });

    describe('breadth validation (with transactions)', () => {
        const transactions = [
            makeTxn('UBER TRIP 1'),
            makeTxn('UBER TRIP 2'),
            makeTxn('UBER TRIP 3'),
            makeTxn('UBER TRIP 4'),
            makeTxn('LYFT RIDE'),
            makeTxn('STARBUCKS'),
            makeTxn('AMAZON'),
            makeTxn('NETFLIX'),
            makeTxn('SPOTIFY'),
            makeTxn('TARGET'),
        ];

        it('warns when pattern matches >20% AND >3 transactions', () => {
            // UBER matches 4/10 = 40%
            const result = validatePattern('UBER ', 'substring', transactions);
            expect(result.valid).toBe(true); // Still valid, just warned
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings[0]).toContain('too broad');
            expect(result.matchCount).toBe(4);
            expect(result.matchPercent).toBe(0.4);
        });

        it('does not warn when matches <= threshold', () => {
            // LYFT matches 1/10 = 10%
            const result = validatePattern('LYFT ', 'substring', transactions);
            expect(result.warnings.length).toBe(0);
            expect(result.matchCount).toBe(1);
        });

        it('returns match statistics', () => {
            const result = validatePattern('STARBUCKS', 'substring', transactions);
            expect(result.matchCount).toBe(1);
            expect(result.matchPercent).toBe(0.1);
        });

        it('handles empty transactions array', () => {
            const result = validatePattern('VALID', 'substring', []);
            expect(result.valid).toBe(true);
            expect(result.matchCount).toBeUndefined();
        });
    });
});

describe('checkPatternCollision', () => {
    const existingRules: Rule[] = [
        { pattern: 'UBER', category_id: 4260 },
        { pattern: 'UBER EATS', category_id: 4320 },
        { pattern: 'AMAZON', category_id: 4310 },
    ];

    it('detects exact match collision', () => {
        const result = checkPatternCollision('UBER', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER');
    });

    it('detects substring overlap (new contains existing)', () => {
        const result = checkPatternCollision('UBER TRIP', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER');
    });

    it('detects substring overlap (existing contains new)', () => {
        const result = checkPatternCollision('EATS', 'substring', existingRules);
        expect(result.hasCollision).toBe(true);
        expect(result.collidingPatterns).toContain('UBER EATS');
    });

    it('returns no collision for unique pattern', () => {
        const result = checkPatternCollision('NETFLIX', 'substring', existingRules);
        expect(result.hasCollision).toBe(false);
        expect(result.collidingPatterns).toHaveLength(0);
    });

    it('handles empty existing rules', () => {
        const result = checkPatternCollision('ANYTHING', 'substring', []);
        expect(result.hasCollision).toBe(false);
    });
});
```

**Commit:**
```
feat(core): add pattern validation and collision detection
```

---

### Task 3.6: Main Categorize Function

**What:** Implement `categorize()` and `categorizeAll()` with 4-layer logic.
**Why:** PRD §9.1, §9.2 - core categorization pipeline
**Package:** core

**File:** `packages/core/src/categorizer/categorize.ts` — CREATE:

```typescript
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
```

**Test File:** `packages/core/tests/categorizer/categorize.test.ts` — CREATE:

```typescript
import { describe, it, expect } from 'vitest';
import { categorize, categorizeAll } from '../../src/categorizer/categorize.js';
import { CONFIDENCE, UNCATEGORIZED_CATEGORY_ID } from '../../src/types/index.js';
import type { Transaction, RuleSet, Rule } from '../../src/types/index.js';
import type { BankCategoryMap } from '../../src/categorizer/types.js';

// Helper to create minimal transaction
function makeTxn(description: string, rawCategory?: string): Transaction {
    return {
        txn_id: 'a1b2c3d4e5f67890',
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: description.toUpperCase(),
        raw_description: description,
        signed_amount: '-10.00',
        account_id: 2122,
        category_id: UNCATEGORIZED_CATEGORY_ID,
        raw_category: rawCategory,
        source_file: 'test.xlsx',
        confidence: 0,
        needs_review: false,
        review_reasons: [],
    };
}

const emptyRules: RuleSet = {
    user_rules: [],
    shared_rules: [],
    base_rules: [],
};

describe('categorize', () => {
    describe('layer priority', () => {
        const rules: RuleSet = {
            user_rules: [{ pattern: 'UBER', category_id: 1001 }],
            shared_rules: [{ pattern: 'UBER', category_id: 2001 }],
            base_rules: [{ pattern: 'UBER', category_id: 3001 }],
        };

        it('user_rules takes precedence over shared_rules', () => {
            const txn = makeTxn('UBER TRIP');
            const { result } = categorize(txn, rules);
            expect(result.category_id).toBe(1001);
            expect(result.source).toBe('user');
        });

        it('shared_rules takes precedence over base_rules', () => {
            const rulesNoUser: RuleSet = {
                user_rules: [],
                shared_rules: [{ pattern: 'UBER', category_id: 2001 }],
                base_rules: [{ pattern: 'UBER', category_id: 3001 }],
            };
            const txn = makeTxn('UBER TRIP');
            const { result } = categorize(txn, rulesNoUser);
            expect(result.category_id).toBe(2001);
            expect(result.source).toBe('shared');
        });

        it('base_rules takes precedence over bank_category', () => {
            const rulesBaseOnly: RuleSet = {
                user_rules: [],
                shared_rules: [],
                base_rules: [{ pattern: 'UBER', category_id: 3001 }],
            };
            const bankMap: BankCategoryMap = { 'TRANSPORTATION': 4001 };
            const txn = makeTxn('UBER TRIP', 'Transportation');
            const { result } = categorize(txn, rulesBaseOnly, { bankCategoryMap: bankMap });
            expect(result.category_id).toBe(3001);
            expect(result.source).toBe('base');
        });

        it('bank_category used when no rules match', () => {
            const bankMap: BankCategoryMap = { 'TRANSPORTATION': 4001 };
            const txn = makeTxn('RANDOM TAXI', 'Transportation');
            const { result } = categorize(txn, emptyRules, { bankCategoryMap: bankMap });
            expect(result.category_id).toBe(4001);
            expect(result.source).toBe('bank');
        });

        it('returns UNCATEGORIZED when nothing matches', () => {
            const txn = makeTxn('RANDOM TRANSACTION');
            const { result } = categorize(txn, emptyRules);
            expect(result.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
            expect(result.source).toBe('uncategorized');
        });
    });

    describe('confidence scores', () => {
        it('returns 1.0 for user_rules match', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260 }],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER TRIP'), rules);
            expect(result.confidence).toBe(CONFIDENCE.USER_RULES);
        });

        it('returns 0.9 for shared_rules match', () => {
            const rules: RuleSet = {
                user_rules: [],
                shared_rules: [{ pattern: 'NETFLIX', category_id: 4610 }],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('NETFLIX SUBSCRIPTION'), rules);
            expect(result.confidence).toBe(CONFIDENCE.SHARED_RULES);
        });

        it('returns 0.8 for base_rules match', () => {
            const rules: RuleSet = {
                user_rules: [],
                shared_rules: [],
                base_rules: [{ pattern: 'AMAZON', category_id: 4310 }],
            };
            const { result } = categorize(makeTxn('AMAZON PURCHASE'), rules);
            expect(result.confidence).toBe(CONFIDENCE.BASE_RULES);
        });

        it('returns 0.6 for bank_category match', () => {
            const bankMap: BankCategoryMap = { 'GROCERIES': 4310 };
            const txn = makeTxn('WHOLE FOODS', 'Groceries');
            const { result } = categorize(txn, emptyRules, { bankCategoryMap: bankMap });
            expect(result.confidence).toBe(CONFIDENCE.BANK_CATEGORY);
        });

        it('returns 0.3 for UNCATEGORIZED', () => {
            const { result } = categorize(makeTxn('RANDOM'), emptyRules);
            expect(result.confidence).toBe(CONFIDENCE.UNCATEGORIZED);
        });
    });

    describe('needs_review flag', () => {
        it('sets needs_review=true for UNCATEGORIZED', () => {
            const { result } = categorize(makeTxn('RANDOM'), emptyRules);
            expect(result.needs_review).toBe(true);
            expect(result.review_reasons).toContain('no_rule_match');
        });

        it('sets needs_review=false for rule matches', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260 }],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER TRIP'), rules);
            expect(result.needs_review).toBe(false);
            expect(result.review_reasons).toHaveLength(0);
        });
    });

    describe('warning collection', () => {
        it('collects invalid regex warnings', () => {
            const rules: RuleSet = {
                user_rules: [
                    { pattern: '[invalid', pattern_type: 'regex', category_id: 4260 },
                    { pattern: 'UBER', category_id: 4260 },
                ],
                shared_rules: [],
                base_rules: [],
            };
            const { result, warnings } = categorize(makeTxn('UBER TRIP'), rules);
            expect(warnings.length).toBeGreaterThan(0);
            expect(warnings[0]).toContain('Invalid regex');
            // Should still match UBER rule
            expect(result.category_id).toBe(4260);
        });

        it('returns empty warnings when all rules valid', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'UBER', category_id: 4260 }],
                shared_rules: [],
                base_rules: [],
            };
            const { warnings } = categorize(makeTxn('UBER TRIP'), rules);
            expect(warnings).toHaveLength(0);
        });
    });

    describe('rule ordering', () => {
        it('first matching rule wins (UBER EATS before UBER)', () => {
            const rules: RuleSet = {
                user_rules: [
                    { pattern: 'UBER EATS', category_id: 4320 }, // Dining
                    { pattern: 'UBER', category_id: 4260 }, // Transport
                ],
                shared_rules: [],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('UBER EATS ORDER'), rules);
            expect(result.category_id).toBe(4320);
        });

        it('user rule shadows shared rule for same pattern', () => {
            const rules: RuleSet = {
                user_rules: [{ pattern: 'NETFLIX', category_id: 9999 }],
                shared_rules: [{ pattern: 'NETFLIX', category_id: 4610 }],
                base_rules: [],
            };
            const { result } = categorize(makeTxn('NETFLIX'), rules);
            expect(result.category_id).toBe(9999);
            expect(result.source).toBe('user');
        });
    });
});

describe('categorizeAll', () => {
    const rules: RuleSet = {
        user_rules: [{ pattern: 'WARBY', category_id: 4550 }],
        shared_rules: [{ pattern: 'NETFLIX', category_id: 4610 }],
        base_rules: [{ pattern: 'UBER', category_id: 4260 }],
    };

    it('processes all transactions', () => {
        const transactions = [
            makeTxn('WARBY PARKER'),
            makeTxn('NETFLIX'),
            makeTxn('UBER TRIP'),
            makeTxn('RANDOM'),
        ];

        const { transactions: result } = categorizeAll(transactions, rules);

        expect(result).toHaveLength(4);
        expect(result[0].category_id).toBe(4550);
        expect(result[1].category_id).toBe(4610);
        expect(result[2].category_id).toBe(4260);
        expect(result[3].category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
    });

    it('returns stats by source', () => {
        const transactions = [
            makeTxn('WARBY PARKER'),
            makeTxn('NETFLIX'),
            makeTxn('UBER TRIP'),
            makeTxn('RANDOM'),
        ];

        const { stats } = categorizeAll(transactions, rules);

        expect(stats.total).toBe(4);
        expect(stats.bySource.user).toBe(1);
        expect(stats.bySource.shared).toBe(1);
        expect(stats.bySource.base).toBe(1);
        expect(stats.bySource.uncategorized).toBe(1);
    });

    it('counts needsReview transactions', () => {
        const transactions = [
            makeTxn('RANDOM 1'),
            makeTxn('RANDOM 2'),
            makeTxn('UBER TRIP'),
        ];

        const { stats } = categorizeAll(transactions, rules);

        expect(stats.needsReview).toBe(2);
    });

    it('aggregates warnings from all categorizations', () => {
        const rulesWithBadRegex: RuleSet = {
            user_rules: [{ pattern: '[bad', pattern_type: 'regex', category_id: 1 }],
            shared_rules: [],
            base_rules: [],
        };

        const transactions = [makeTxn('A'), makeTxn('B'), makeTxn('C')];

        const { warnings } = categorizeAll(transactions, rulesWithBadRegex);

        // Should dedupe - only one warning even though 3 transactions
        expect(warnings.length).toBe(1);
    });
});
```

**Commit:**
```
feat(core): add 4-layer categorization logic
```

---

### Task 3.7: Module Exports

**What:** Create categorizer index and update core exports.
**Package:** core

**File:** `packages/core/src/categorizer/index.ts` — CREATE:

```typescript
// Main categorization
export { categorize, categorizeAll } from './categorize.js';

// Pattern matching
export { matchesPattern, isValidPattern } from './match.js';

// Bank category
export { guessFromBankCategory, DEFAULT_BANK_CATEGORY_MAP } from './bank-category.js';

// Validation
export { validatePattern, checkPatternCollision } from './validate.js';

// Types
export type {
    MatchResult,
    BankCategoryMap,
    CategorizeOptions,
    CategorizationStats,
} from './types.js';
```

**File:** `packages/core/src/index.ts` — ADD exports:

```typescript
// ... existing exports ...

// Categorizer
export {
    categorize,
    categorizeAll,
    matchesPattern,
    isValidPattern,
    guessFromBankCategory,
    DEFAULT_BANK_CATEGORY_MAP,
    validatePattern,
    checkPatternCollision,
} from './categorizer/index.js';

export type {
    MatchResult,
    BankCategoryMap,
    CategorizeOptions,
    CategorizationStats,
} from './categorizer/index.js';
```

**File:** `packages/core/src/types/index.ts` — ADD re-exports from shared:

```typescript
// Add to existing re-exports
export type {
    CategorizationOutput,
    PatternValidationResult,
    CollisionResult,
} from '@finance-engine/shared';

export {
    CategorizationOutputSchema,
    PatternValidationResultSchema,
    CollisionResultSchema,
} from '@finance-engine/shared';
```

**Commit:**
```
chore(core): export categorizer module
```

---

## 5. Test Strategy Summary

| Test File | Coverage |
|-----------|----------|
| `match.test.ts` | Substring matching, regex matching, invalid regex handling, edge cases |
| `bank-category.test.ts` | Exact match, partial match, case handling, empty map |
| `validate.test.ts` | Empty/short patterns, regex syntax, breadth check, collision detection |
| `categorize.test.ts` | Layer priority, confidence scores, needs_review, warning collection, batch processing |

**Expected test count:** ~50 new tests

---

## 6. Regression Protocol

After each task:
```bash
# Run all tests
pnpm test

# Verify build
pnpm build

# Check architecture constraints
grep -rn "from 'node:" packages/core/src/ && echo "FAIL" || echo "Pass: no node imports"
grep -rn "console\." packages/core/src/ && echo "FAIL" || echo "Pass: no console calls"
```

---

## 7. Final Verification

```bash
# Full test suite
pnpm test

# Full build
pnpm build

# Architecture constraints
grep -rn "from 'node:" packages/core/src/
grep -rn "console\." packages/core/src/

# Phase 1-2 regression
pnpm test -- packages/core/tests/parser/
pnpm test -- packages/core/tests/utils/
pnpm test -- packages/shared/tests/

# Verify categorizer exports
node -e "
const { categorize, categorizeAll, matchesPattern, validatePattern } = require('./packages/core/dist/index.js');
console.log('categorize:', typeof categorize);
console.log('categorizeAll:', typeof categorizeAll);
console.log('matchesPattern:', typeof matchesPattern);
console.log('validatePattern:', typeof validatePattern);
"
```

---

## 8. PR Preparation

**Branch:** `phase-3/categorizer`

**PR Title:** `feat(phase-3): complete categorizer module with 4-layer hierarchy`

**Expected commits:**
1. `feat(shared): add CategorizationOutput and validation schemas`
2. `feat(core): add categorizer internal types`
3. `feat(core): add pattern matching for categorizer`
4. `feat(core): add bank category mapping for Layer 4`
5. `feat(core): add pattern validation and collision detection`
6. `feat(core): add 4-layer categorization logic`
7. `chore(core): export categorizer module`

---

## Appendix: Quality Checklist

**Completeness:**
- [ ] categorize() implements all 4 layers in correct priority order
- [ ] matchesPattern() handles both substring and regex
- [ ] guessFromBankCategory() has infrastructure for mapping
- [ ] validatePattern() checks min length, emptiness, and breadth
- [ ] checkPatternCollision() detects overlapping patterns
- [ ] All functions have comprehensive test files
- [ ] ~50 new tests added

**Correctness:**
- [ ] Confidence scores match IK D4.2 exactly (1.0, 0.9, 0.8, 0.6, 0.3)
- [ ] UNCATEGORIZED fallback uses category_id 4999 (IK D2.7)
- [ ] needs_review = true only for uncategorized
- [ ] Pattern normalization covers both description and pattern (IK D4.15)
- [ ] Regex errors caught and surfaced as warnings (headless core)
- [ ] First match within a layer wins (IK D4.5)
- [ ] source field correctly identifies which layer matched

**Architecture:**
- [ ] Zero `node:*` imports in any new core file
- [ ] Zero `console.*` calls in any new core file
- [ ] All functions are pure (no input mutation except categorizeAll)
- [ ] CategorizationOutput wrapper returns warnings as data
- [ ] Bank category map received as parameter (no config I/O)

**Patterns:**
- [ ] File naming follows existing convention
- [ ] Exports added to categorizer/index.ts and core/index.ts
- [ ] Warning handling consistent with Phase 1-2 parser pattern

---

**Prompt signed by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-01
- **Input Documents:** PRD v2.2, IK v1.2, Phase 1-2 merged codebase
