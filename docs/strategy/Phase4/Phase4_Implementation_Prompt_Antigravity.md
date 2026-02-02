# Phase 4 Implementation Prompt: Matcher + Ledger Modules

**Role:** Chief Architect
**Model:** Claude Opus 4.5
**Date:** 2026-02-01
**For:** Antigravity (Gemini 2.0 Pro)
**Input Documents:** PRD v2.2, IK v1.2, Phase 1-3 merged codebase

---

## Overview

You are implementing Phase 4 of Finance Engine v2.0: **Payment Matching** and **Double-Entry Journal Generation**. This is the most financially sensitive phase — a bug in the ledger creates wrong accounting entries. The tolerance for error is zero.

### What You're Building

| Module | Responsibility | Key Function |
|--------|---------------|--------------|
| **Matcher** | Find CC payment pairs across bank/CC transactions | `matchPayments()` |
| **Ledger** | Convert transactions + matches → balanced journal entries | `generateJournal()` |

### Critical Architectural Decisions (Already Made)

| Decision | Resolution |
|----------|------------|
| **Mutation** | `matchPayments()` returns `{ matches, reviewUpdates }` — does NOT mutate. CLI applies updates. |
| **Internal transfers** | Deferred to Phase 5. Architecture supports later addition. |
| **Account resolution** | Pass `accounts: Map<number, AccountInfo>` as parameter to `generateJournal()`. |
| **Entry IDs** | Auto-assigned starting at 1, ordered by effective_date. |
| **Payment patterns** | Passed as parameter with sensible defaults (no hardcoded account IDs). |
| **Date arithmetic** | Native Date via `daysBetween()` function — no date-fns dependency. |

---

## Pre-Implementation Checklist

```bash
# 1. Verify on main with Phase 3 merged
git checkout main && git pull origin main

# 2. Create feature branch
git checkout -b phase-4/matcher-ledger

# 3. Verify existing tests pass
pnpm install && pnpm test

# 4. Verify build succeeds
pnpm build
```

**Expected:** 185 tests pass, build succeeds.

---

## Part 1: Schema Additions

### Task 1.1: Add Match and Ledger Schemas to Shared Package

**File:** `packages/shared/src/schemas.ts`

Add after the existing `JournalEntrySchema` definition:

```typescript
// ============================================================================
// Payment Matching Schemas (Phase 4)
// ============================================================================

/**
 * Payment pattern for matching bank withdrawals to CC payments.
 * Per PRD §10.3, IK D6.5.
 */
export const PaymentPatternSchema = z.object({
    keywords: z.array(z.string().min(1)),  // Required keywords (PAYMENT, AUTOPAY)
    pattern: z.string().min(1),             // Card identifier (AMEX, CHASE CARD)
    accounts: z.array(accountId),           // Possible CC account IDs
});

export type PaymentPattern = z.infer<typeof PaymentPatternSchema>;

/**
 * Match between bank withdrawal and CC payment.
 * Per PRD §10.3.
 */
export const MatchSchema = z.object({
    type: z.literal('payment'),
    bank_txn_id: txnId,
    cc_txn_id: txnId,
    amount: decimalString,
    date_diff_days: z.number().int().min(0),
});

export type Match = z.infer<typeof MatchSchema>;

/**
 * Review update descriptor — pure function pattern.
 * Describes mutations without performing them.
 */
export const ReviewUpdateSchema = z.object({
    txn_id: txnId,
    needs_review: z.boolean(),
    add_review_reasons: z.array(z.string()),
});

export type ReviewUpdate = z.infer<typeof ReviewUpdateSchema>;

/**
 * Matching statistics for transparency.
 */
export const MatchStatsSchema = z.object({
    total_bank_candidates: z.number().int().min(0),
    total_cc_candidates: z.number().int().min(0),
    matches_found: z.number().int().min(0),
    ambiguous_flagged: z.number().int().min(0),
    no_candidate_flagged: z.number().int().min(0),
});

export type MatchStats = z.infer<typeof MatchStatsSchema>;

/**
 * Result of payment matching operation.
 * Pure function pattern: returns data + side-effect descriptors.
 */
export const MatchResultSchema = z.object({
    matches: z.array(MatchSchema),
    reviewUpdates: z.array(ReviewUpdateSchema),
    warnings: z.array(z.string()),
    stats: MatchStatsSchema,
});

export type MatchResult = z.infer<typeof MatchResultSchema>;

/**
 * Configuration for matching operations.
 * Per IK D6.1, D6.2.
 */
export const MatchConfigSchema = z.object({
    dateToleranceDays: z.number().int().min(0).default(5),
    amountTolerance: decimalString.default('0.01'),
});

export type MatchConfig = z.infer<typeof MatchConfigSchema>;

// ============================================================================
// Ledger Generation Schemas (Phase 4)
// ============================================================================

/**
 * Result of journal validation.
 * Per IK D7.5.
 */
export const JournalValidationResultSchema = z.object({
    valid: z.boolean(),
    total_debits: decimalString,
    total_credits: decimalString,
    difference: decimalString,
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
});

export type JournalValidationResult = z.infer<typeof JournalValidationResultSchema>;

/**
 * Ledger generation statistics.
 */
export const LedgerStatsSchema = z.object({
    total_entries: z.number().int().min(0),
    total_lines: z.number().int().min(0),
    matched_payment_entries: z.number().int().min(0),
    regular_entries: z.number().int().min(0),
});

export type LedgerStats = z.infer<typeof LedgerStatsSchema>;

/**
 * Result of ledger generation.
 */
export const LedgerResultSchema = z.object({
    entries: z.array(JournalEntrySchema),
    validation: JournalValidationResultSchema,
    warnings: z.array(z.string()),
    stats: LedgerStatsSchema,
});

export type LedgerResult = z.infer<typeof LedgerResultSchema>;

/**
 * Account info for name resolution.
 * Passed as parameter per headless core design.
 */
export const AccountInfoSchema = z.object({
    id: accountId,
    name: z.string(),
    type: z.enum(['asset', 'liability', 'income', 'expense', 'special']),
});

export type AccountInfo = z.infer<typeof AccountInfoSchema>;
```

### Task 1.2: Add Constants to Shared Package

**File:** `packages/shared/src/constants.ts`

Add after existing constants:

```typescript
// ============================================================================
// Phase 4: Matching & Ledger Constants
// ============================================================================

/**
 * Default payment patterns for common card payments.
 * Per PRD §10.3, IK D6.5.
 *
 * NOTE: `accounts` arrays are EMPTY by default — caller must provide
 * actual account IDs from their chart of accounts.
 */
export const DEFAULT_PAYMENT_PATTERNS = [
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'DISCOVER', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'BOA', accounts: [] },
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'CITI', accounts: [] },
] as const;

/**
 * Account type ranges per IK D2.11.
 */
export const ACCOUNT_RANGES = {
    ASSET: { min: 1000, max: 1999 },
    LIABILITY: { min: 2000, max: 2999 },
    INCOME: { min: 3000, max: 3999 },
    EXPENSE: { min: 4000, max: 4999 },
    SPECIAL: { min: 5000, max: 5999 },
} as const;
```

### Task 1.3: Export New Types from Shared Package

**File:** `packages/shared/src/index.ts`

Add exports:

```typescript
// Phase 4: Matching
export {
    PaymentPatternSchema,
    MatchSchema,
    ReviewUpdateSchema,
    MatchStatsSchema,
    MatchResultSchema,
    MatchConfigSchema,
    AccountInfoSchema,
} from './schemas.js';

export type {
    PaymentPattern,
    Match,
    ReviewUpdate,
    MatchStats,
    MatchResult,
    MatchConfig,
    AccountInfo,
} from './schemas.js';

// Phase 4: Ledger
export {
    JournalValidationResultSchema,
    LedgerStatsSchema,
    LedgerResultSchema,
} from './schemas.js';

export type {
    JournalValidationResult,
    LedgerStats,
    LedgerResult,
} from './schemas.js';

// Phase 4: Constants
export { DEFAULT_PAYMENT_PATTERNS, ACCOUNT_RANGES } from './constants.js';
```

**Verification:**
```bash
pnpm build
pnpm test --filter=shared
```

**Commit:**
```
feat(shared): add Match and Ledger schemas for Phase 4

Adds schemas for payment matching and journal generation:
- PaymentPattern, Match, MatchResult for matcher module
- LedgerResult, JournalValidationResult for ledger module
- AccountInfo for account name resolution
- DEFAULT_PAYMENT_PATTERNS, ACCOUNT_RANGES constants

Per PRD §10, IK D6.1-D6.9, D7.1-D7.9.
```

---

## Part 2: Matcher Module

### File Structure

```
packages/core/src/matcher/
├── index.ts           # Public exports
├── types.ts           # Internal types
├── date-diff.ts       # Date arithmetic (native Date)
├── find-best-match.ts # Candidate selection
└── match-payments.ts  # Core matching orchestrator
```

### Task 2.1: Date Difference Utility

**File:** `packages/core/src/matcher/date-diff.ts`

```typescript
/**
 * Date arithmetic utilities using native Date.
 * No date-fns dependency per design decision.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Calculate absolute days between two ISO date strings.
 *
 * @param date1 - ISO date string (YYYY-MM-DD)
 * @param date2 - ISO date string (YYYY-MM-DD)
 * @returns Absolute difference in days
 */
export function daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1 + 'T00:00:00Z');
    const d2 = new Date(date2 + 'T00:00:00Z');
    const diff = Math.abs(d1.getTime() - d2.getTime());
    return Math.round(diff / MS_PER_DAY);
}

/**
 * Check if two dates are within tolerance.
 *
 * @param date1 - ISO date string
 * @param date2 - ISO date string
 * @param toleranceDays - Maximum allowed difference
 * @returns true if within tolerance (inclusive)
 */
export function isWithinDateTolerance(
    date1: string,
    date2: string,
    toleranceDays: number
): boolean {
    return daysBetween(date1, date2) <= toleranceDays;
}
```

**Test File:** `packages/core/tests/matcher/date-diff.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { daysBetween, isWithinDateTolerance } from '../../src/matcher/date-diff.js';

describe('daysBetween', () => {
    it('returns 0 for same day', () => {
        expect(daysBetween('2026-01-15', '2026-01-15')).toBe(0);
    });

    it('calculates correct days within same month', () => {
        expect(daysBetween('2026-01-15', '2026-01-20')).toBe(5);
    });

    it('calculates correct days across months', () => {
        expect(daysBetween('2026-01-30', '2026-02-04')).toBe(5);
    });

    it('handles leap year boundary', () => {
        expect(daysBetween('2024-02-28', '2024-03-01')).toBe(2); // 2024 is leap year
        expect(daysBetween('2025-02-28', '2025-03-01')).toBe(1); // 2025 is not
    });

    it('returns absolute value (order independent)', () => {
        expect(daysBetween('2026-01-20', '2026-01-15')).toBe(5);
        expect(daysBetween('2026-01-15', '2026-01-20')).toBe(5);
    });

    it('handles year boundary', () => {
        expect(daysBetween('2025-12-30', '2026-01-04')).toBe(5);
    });
});

describe('isWithinDateTolerance', () => {
    it('returns true when within tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-18', 5)).toBe(true);
    });

    it('returns true at exactly tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-20', 5)).toBe(true);
    });

    it('returns false when beyond tolerance', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-21', 5)).toBe(false);
    });

    it('returns true for same day', () => {
        expect(isWithinDateTolerance('2026-01-15', '2026-01-15', 5)).toBe(true);
    });
});
```

### Task 2.2: Internal Types

**File:** `packages/core/src/matcher/types.ts`

```typescript
import type { Transaction, PaymentPattern, MatchConfig } from '@finance-engine/shared';

/**
 * Options for matchPayments function.
 */
export interface MatcherOptions {
    config?: Partial<MatchConfig>;
    patterns?: PaymentPattern[];
    bankAccountIds?: number[];    // Asset accounts (checking/savings)
    ccAccountIds?: number[];      // Liability accounts (credit cards)
}

/**
 * Internal candidate representation.
 */
export interface MatchCandidate {
    txn: Transaction;
    dateDiff: number;
}

/**
 * Result of findBestMatch.
 */
export interface BestMatchResult {
    match: Transaction | null;
    reason: 'found' | 'no_candidates' | 'ambiguous';
}
```

### Task 2.3: Find Best Match

**File:** `packages/core/src/matcher/find-best-match.ts`

```typescript
import Decimal from 'decimal.js';
import type { Transaction, MatchConfig } from '@finance-engine/shared';
import type { MatchCandidate, BestMatchResult } from './types.js';
import { daysBetween } from './date-diff.js';

/**
 * Find best matching CC transaction for a bank withdrawal.
 *
 * Selection criteria per IK D6.1-D6.3:
 * 1. Amount within tolerance ($0.01)
 * 2. Date within tolerance (±5 days)
 * 3. Pick closest date if single best match
 * 4. Return null with 'ambiguous' flag if tie on date distance
 *
 * @param bankTxn - Bank withdrawal transaction
 * @param ccTxns - Available CC payment transactions
 * @param possibleAccounts - CC account IDs to consider
 * @param config - Matching configuration
 * @returns Best match or null with reason
 */
export function findBestMatch(
    bankTxn: Transaction,
    ccTxns: Transaction[],
    possibleAccounts: number[],
    config: MatchConfig
): BestMatchResult {
    const bankAmount = new Decimal(bankTxn.signed_amount).abs();
    const amountTolerance = new Decimal(config.amountTolerance);
    const dateToleranceDays = config.dateToleranceDays;

    const candidates: MatchCandidate[] = [];

    for (const ccTxn of ccTxns) {
        // Must be in possible accounts list
        if (!possibleAccounts.includes(ccTxn.account_id)) continue;

        // Amount must match within tolerance (IK D6.2)
        const ccAmount = new Decimal(ccTxn.signed_amount).abs();
        if (bankAmount.minus(ccAmount).abs().greaterThan(amountTolerance)) continue;

        // Date must be within window (IK D6.1)
        const dateDiff = daysBetween(bankTxn.effective_date, ccTxn.effective_date);
        if (dateDiff > dateToleranceDays) continue;

        candidates.push({ txn: ccTxn, dateDiff });
    }

    // No candidates found
    if (candidates.length === 0) {
        return { match: null, reason: 'no_candidates' };
    }

    // Single candidate — return it
    if (candidates.length === 1) {
        return { match: candidates[0].txn, reason: 'found' };
    }

    // Multiple candidates — pick closest date (IK D6.3)
    candidates.sort((a, b) => a.dateDiff - b.dateDiff);

    // Check for tie on closest date — ambiguous
    if (candidates[0].dateDiff === candidates[1].dateDiff) {
        return { match: null, reason: 'ambiguous' };
    }

    // Clear winner
    return { match: candidates[0].txn, reason: 'found' };
}
```

**Test File:** `packages/core/tests/matcher/find-best-match.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { findBestMatch } from '../../src/matcher/find-best-match.js';
import type { Transaction, MatchConfig } from '@finance-engine/shared';

// Helper to create minimal Transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'test-' + Math.random().toString(16).slice(2, 10),
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'Test Transaction',
        raw_description: 'TEST TRANSACTION',
        signed_amount: '-100.00',
        account_id: 1120,
        category_id: 4999,
        source_file: 'test.csv',
        confidence: 0.3,
        needs_review: false,
        review_reasons: [],
        ...overrides,
    };
}

const defaultConfig: MatchConfig = {
    dateToleranceDays: 5,
    amountTolerance: '0.01',
};

describe('findBestMatch', () => {
    it('returns no_candidates when no CC transactions', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', account_id: 1120 });
        const result = findBestMatch(bankTxn, [], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns no_candidates when no amount match', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00' });
        const ccTxn = makeTxn({
            signed_amount: '200.00',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns no_candidates when date outside tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-25', // 10 days away
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('returns single candidate when only one matches', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-match',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.match!.txn_id).toBe('cc-match');
        expect(result.reason).toBe('found');
    });

    it('picks closest date when multiple candidates', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-close',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-16', // 1 day
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-far',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-19', // 4 days
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.match!.txn_id).toBe('cc-close');
        expect(result.reason).toBe('found');
    });

    it('returns ambiguous when tie on date distance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn1 = makeTxn({
            txn_id: 'cc-tie-1',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days
        });
        const ccTxn2 = makeTxn({
            txn_id: 'cc-tie-2',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-17', // 2 days (same)
        });
        const result = findBestMatch(bankTxn, [ccTxn1, ccTxn2], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('ambiguous');
    });

    it('filters by possible accounts', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.00',
            account_id: 2130, // Chase Card
            effective_date: '2026-01-15',
        });
        // Looking for Amex (2122), not Chase (2130)
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('matches within $0.01 tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-penny-off',
            signed_amount: '100.01',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.reason).toBe('found');
    });

    it('rejects when amount beyond $0.01 tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            signed_amount: '100.02', // $0.02 off
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).toBeNull();
        expect(result.reason).toBe('no_candidates');
    });

    it('matches at exactly 5 day tolerance', () => {
        const bankTxn = makeTxn({ signed_amount: '-100.00', effective_date: '2026-01-15' });
        const ccTxn = makeTxn({
            txn_id: 'cc-5-days',
            signed_amount: '100.00',
            account_id: 2122,
            effective_date: '2026-01-20', // exactly 5 days
        });
        const result = findBestMatch(bankTxn, [ccTxn], [2122], defaultConfig);
        expect(result.match).not.toBeNull();
        expect(result.reason).toBe('found');
    });
});
```

### Task 2.4: Match Payments Orchestrator

**File:** `packages/core/src/matcher/match-payments.ts`

```typescript
import Decimal from 'decimal.js';
import type {
    Transaction,
    PaymentPattern,
    MatchResult,
    Match,
    MatchConfig,
} from '@finance-engine/shared';
import { MATCHING_CONFIG, DEFAULT_PAYMENT_PATTERNS } from '@finance-engine/shared';
import type { MatcherOptions } from './types.js';
import { findBestMatch } from './find-best-match.js';
import { daysBetween } from './date-diff.js';
import { normalizeDescription } from '../utils/normalize.js';

/**
 * Match CC payments between bank withdrawals and CC payments received.
 *
 * PURE FUNCTION: Does not mutate transactions. Returns matches and
 * review update descriptors for CLI/caller to apply.
 *
 * Per PRD §10, IK D6.1-D6.9.
 *
 * @param transactions - All transactions from parsing phase
 * @param options - Matcher configuration
 * @returns MatchResult with matches, review updates, warnings, stats
 */
export function matchPayments(
    transactions: Transaction[],
    options: MatcherOptions = {}
): MatchResult {
    const warnings: string[] = [];
    const matches: Match[] = [];
    const reviewUpdates: Array<{
        txn_id: string;
        needs_review: boolean;
        add_review_reasons: string[];
    }> = [];

    // Merge config with defaults
    const config: MatchConfig = {
        dateToleranceDays: options.config?.dateToleranceDays ?? MATCHING_CONFIG.DATE_TOLERANCE_DAYS,
        amountTolerance: options.config?.amountTolerance ?? MATCHING_CONFIG.AMOUNT_TOLERANCE,
    };

    // Get patterns
    const patterns: PaymentPattern[] = options.patterns ??
        DEFAULT_PAYMENT_PATTERNS.map(p => ({ ...p, accounts: p.accounts as number[] }));

    // Determine account ranges
    const bankAccountIds = options.bankAccountIds ?? [];
    const ccAccountIds = options.ccAccountIds ?? [];

    if (bankAccountIds.length === 0) {
        warnings.push('No bank account IDs provided to matchPayments');
    }
    if (ccAccountIds.length === 0) {
        warnings.push('No CC account IDs provided to matchPayments');
    }

    // Filter transactions
    // Bank: asset accounts with negative amount (withdrawal)
    const bankTxns = transactions.filter(t =>
        bankAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isNegative()
    );

    // CC: liability accounts with positive amount (payment received)
    const ccTxns = transactions.filter(t =>
        ccAccountIds.includes(t.account_id) &&
        new Decimal(t.signed_amount).isPositive()
    );

    // Track matched CC txns to prevent double-matching
    const matchedCcTxnIds = new Set<string>();

    let ambiguousFlagged = 0;
    let noCandidateFlagged = 0;

    // Process each bank transaction
    for (const bankTxn of bankTxns) {
        // Skip zero-amount (IK D6.9)
        if (new Decimal(bankTxn.signed_amount).isZero()) continue;

        const desc = normalizeDescription(bankTxn.raw_description);

        // Check each pattern
        for (const pattern of patterns) {
            // Must have BOTH keyword AND pattern (IK D6.5)
            const hasKeyword = pattern.keywords.some(kw =>
                desc.includes(kw.toUpperCase())
            );
            const hasPattern = desc.includes(pattern.pattern.toUpperCase());

            if (!hasKeyword || !hasPattern) continue;

            // Get possible CC accounts for this pattern
            const possibleAccounts = pattern.accounts.filter(id =>
                ccAccountIds.includes(id)
            );

            if (possibleAccounts.length === 0) {
                // Pattern matched but no accounts configured
                continue;
            }

            // Find available CC transactions (not already matched)
            const availableCcTxns = ccTxns.filter(t =>
                !matchedCcTxnIds.has(t.txn_id)
            );

            // Find best match
            const { match, reason } = findBestMatch(
                bankTxn,
                availableCcTxns,
                possibleAccounts,
                config
            );

            if (match) {
                matches.push({
                    type: 'payment',
                    bank_txn_id: bankTxn.txn_id,
                    cc_txn_id: match.txn_id,
                    amount: new Decimal(bankTxn.signed_amount).abs().toString(),
                    date_diff_days: daysBetween(bankTxn.effective_date, match.effective_date),
                });
                matchedCcTxnIds.add(match.txn_id);
                break; // Stop checking patterns for this bank txn
            } else if (reason === 'ambiguous') {
                // Flag for review (IK D6.3)
                reviewUpdates.push({
                    txn_id: bankTxn.txn_id,
                    needs_review: true,
                    add_review_reasons: ['ambiguous_match_candidates'],
                });
                ambiguousFlagged++;
                break;
            } else if (reason === 'no_candidates') {
                // Flag: pattern matched but no CC candidate (IK D6.6)
                reviewUpdates.push({
                    txn_id: bankTxn.txn_id,
                    needs_review: true,
                    add_review_reasons: ['payment_pattern_no_cc_match'],
                });
                noCandidateFlagged++;
                break;
            }
        }
    }

    return {
        matches,
        reviewUpdates,
        warnings,
        stats: {
            total_bank_candidates: bankTxns.length,
            total_cc_candidates: ccTxns.length,
            matches_found: matches.length,
            ambiguous_flagged: ambiguousFlagged,
            no_candidate_flagged: noCandidateFlagged,
        },
    };
}
```

**Test File:** `packages/core/tests/matcher/match-payments.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { matchPayments } from '../../src/matcher/match-payments.js';
import type { Transaction, PaymentPattern } from '@finance-engine/shared';

// Helper to create minimal Transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'txn-' + Math.random().toString(16).slice(2, 10),
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'Test Transaction',
        raw_description: 'TEST TRANSACTION',
        signed_amount: '-100.00',
        account_id: 1120,
        category_id: 4999,
        source_file: 'test.csv',
        confidence: 0.3,
        needs_review: false,
        review_reasons: [],
        ...overrides,
    };
}

const testPatterns: PaymentPattern[] = [
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [2122] },
    { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [2130] },
];

describe('matchPayments', () => {
    describe('IK D6.5 - Keyword Requirement', () => {
        it('requires both keyword AND pattern to match', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                txn_id: 'cc-1',
                raw_description: 'PAYMENT RECEIVED',
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].bank_txn_id).toBe('bank-1');
            expect(result.matches[0].cc_txn_id).toBe('cc-1');
        });

        it('rejects match with pattern but no keyword', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX CARD SERVICES', // No PAYMENT keyword
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
        });

        it('rejects match with keyword but no pattern', () => {
            const bankTxn = makeTxn({
                raw_description: 'CREDIT CARD PAYMENT', // No AMEX
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
        });
    });

    describe('IK D6.6 - No Candidate Visibility', () => {
        it('flags when pattern matches but no CC candidate exists', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX AUTOPAY',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            // No CC transactions

            const result = matchPayments([bankTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(1);
            expect(result.reviewUpdates[0].txn_id).toBe('bank-1');
            expect(result.reviewUpdates[0].add_review_reasons).toContain('payment_pattern_no_cc_match');
        });
    });

    describe('IK D6.3 - Ambiguous Resolution', () => {
        it('flags for review when multiple candidates with same date distance', () => {
            const bankTxn = makeTxn({
                txn_id: 'bank-1',
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
                effective_date: '2026-01-15',
            });
            const ccTxn1 = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
                effective_date: '2026-01-17', // 2 days
            });
            const ccTxn2 = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
                effective_date: '2026-01-17', // 2 days (same)
            });

            const result = matchPayments([bankTxn, ccTxn1, ccTxn2], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(1);
            expect(result.reviewUpdates[0].add_review_reasons).toContain('ambiguous_match_candidates');
            expect(result.stats.ambiguous_flagged).toBe(1);
        });
    });

    describe('IK D6.9 - Zero Amount', () => {
        it('skips zero-amount transactions', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '0.00', // Zero
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '0.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.matches).toHaveLength(0);
            expect(result.reviewUpdates).toHaveLength(0);
        });
    });

    describe('Pure Function Behavior', () => {
        it('does not mutate input transactions', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
                needs_review: false,
                review_reasons: [],
            });
            const originalNeedsReview = bankTxn.needs_review;
            const originalReasons = [...bankTxn.review_reasons];

            // No CC transactions - will trigger no_candidate flag
            matchPayments([bankTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            // Original should be unchanged
            expect(bankTxn.needs_review).toBe(originalNeedsReview);
            expect(bankTxn.review_reasons).toEqual(originalReasons);
        });
    });

    describe('Multiple Patterns', () => {
        it('matches different CC payments to correct patterns', () => {
            const amexBankTxn = makeTxn({
                txn_id: 'bank-amex',
                raw_description: 'AMEX AUTOPAY',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const chaseBankTxn = makeTxn({
                txn_id: 'bank-chase',
                raw_description: 'CHASE CARD PAYMENT',
                signed_amount: '-300.00',
                account_id: 1120,
            });
            const amexCcTxn = makeTxn({
                txn_id: 'cc-amex',
                signed_amount: '500.00',
                account_id: 2122,
            });
            const chaseCcTxn = makeTxn({
                txn_id: 'cc-chase',
                signed_amount: '300.00',
                account_id: 2130,
            });

            const result = matchPayments(
                [amexBankTxn, chaseBankTxn, amexCcTxn, chaseCcTxn],
                {
                    patterns: testPatterns,
                    bankAccountIds: [1120],
                    ccAccountIds: [2122, 2130],
                }
            );

            expect(result.matches).toHaveLength(2);

            const amexMatch = result.matches.find(m => m.bank_txn_id === 'bank-amex');
            expect(amexMatch?.cc_txn_id).toBe('cc-amex');

            const chaseMatch = result.matches.find(m => m.bank_txn_id === 'bank-chase');
            expect(chaseMatch?.cc_txn_id).toBe('cc-chase');
        });
    });

    describe('Statistics', () => {
        it('reports correct stats', () => {
            const bankTxn = makeTxn({
                raw_description: 'AMEX PAYMENT',
                signed_amount: '-500.00',
                account_id: 1120,
            });
            const ccTxn = makeTxn({
                signed_amount: '500.00',
                account_id: 2122,
            });

            const result = matchPayments([bankTxn, ccTxn], {
                patterns: testPatterns,
                bankAccountIds: [1120],
                ccAccountIds: [2122],
            });

            expect(result.stats.total_bank_candidates).toBe(1);
            expect(result.stats.total_cc_candidates).toBe(1);
            expect(result.stats.matches_found).toBe(1);
        });
    });
});
```

### Task 2.5: Matcher Module Index

**File:** `packages/core/src/matcher/index.ts`

```typescript
/**
 * Matcher module: Payment matching between bank and CC transactions.
 * Per PRD §10, IK D6.1-D6.9.
 */

export { matchPayments } from './match-payments.js';
export { findBestMatch } from './find-best-match.js';
export { daysBetween, isWithinDateTolerance } from './date-diff.js';
export type { MatcherOptions, MatchCandidate, BestMatchResult } from './types.js';
```

**Verification:**
```bash
pnpm test --filter=core -- matcher
```

**Commit:**
```
feat(core): implement matcher module with payment matching

Implements payment matching per PRD §10, IK D6.1-D6.9:
- matchPayments() orchestrates CC payment matching
- findBestMatch() selects best candidate with date/amount tolerance
- daysBetween() for native Date arithmetic (no date-fns)
- Pure function pattern: returns matches + review updates, no mutation

Key behaviors:
- Date tolerance: ±5 days (IK D6.1)
- Amount tolerance: $0.01 (IK D6.2)
- Ambiguous matches flagged, not auto-resolved (IK D6.3)
- Payment keyword required to prevent false positives (IK D6.5)
- Zero-amount transactions skipped (IK D6.9)
```

---

## Part 3: Ledger Module

### File Structure

```
packages/core/src/ledger/
├── index.ts           # Public exports
├── types.ts           # Internal types
├── account-resolve.ts # Account name lookup
├── validate.ts        # Debit/credit validation
└── generate.ts        # Journal entry generation
```

### Task 3.1: Internal Types

**File:** `packages/core/src/ledger/types.ts`

```typescript
import type { AccountInfo } from '@finance-engine/shared';

/**
 * Options for journal generation.
 */
export interface LedgerOptions {
    accounts: Map<number, AccountInfo>;  // Account ID -> info lookup
    startingEntryId?: number;            // Default: 1
}
```

### Task 3.2: Account Resolution

**File:** `packages/core/src/ledger/account-resolve.ts`

```typescript
import type { AccountInfo } from '@finance-engine/shared';
import { ACCOUNT_RANGES } from '@finance-engine/shared';

/**
 * Get account type from ID range.
 * Per IK D2.11.
 */
export function getAccountType(
    accountId: number
): 'asset' | 'liability' | 'income' | 'expense' | 'special' | 'unknown' {
    if (accountId >= ACCOUNT_RANGES.ASSET.min && accountId <= ACCOUNT_RANGES.ASSET.max) {
        return 'asset';
    }
    if (accountId >= ACCOUNT_RANGES.LIABILITY.min && accountId <= ACCOUNT_RANGES.LIABILITY.max) {
        return 'liability';
    }
    if (accountId >= ACCOUNT_RANGES.INCOME.min && accountId <= ACCOUNT_RANGES.INCOME.max) {
        return 'income';
    }
    if (accountId >= ACCOUNT_RANGES.EXPENSE.min && accountId <= ACCOUNT_RANGES.EXPENSE.max) {
        return 'expense';
    }
    if (accountId >= ACCOUNT_RANGES.SPECIAL.min && accountId <= ACCOUNT_RANGES.SPECIAL.max) {
        return 'special';
    }
    return 'unknown';
}

/**
 * Check if account ID is a liability (credit card).
 */
export function isLiabilityAccount(accountId: number): boolean {
    return getAccountType(accountId) === 'liability';
}

/**
 * Check if account ID is an asset (checking/savings).
 */
export function isAssetAccount(accountId: number): boolean {
    return getAccountType(accountId) === 'asset';
}

/**
 * Resolve account name from ID.
 *
 * Per IK D7.8: Warn on unknown account, don't auto-create.
 *
 * @param accountId - 4-digit account ID
 * @param accounts - Account lookup map
 * @returns Account name or fallback string with warning
 */
export function resolveAccountName(
    accountId: number,
    accounts: Map<number, AccountInfo>
): { name: string; warning?: string } {
    const account = accounts.get(accountId);
    if (account) {
        return { name: account.name };
    }
    return {
        name: `Unknown (${accountId})`,
        warning: `Unknown account ID: ${accountId}`,
    };
}
```

### Task 3.3: Journal Validation

**File:** `packages/core/src/ledger/validate.ts`

```typescript
import Decimal from 'decimal.js';
import type { JournalEntry, JournalValidationResult } from '@finance-engine/shared';

/**
 * Validate a single journal entry balances.
 *
 * @param entry - Single journal entry
 * @returns Validation result for this entry
 */
export function validateEntry(entry: JournalEntry): {
    valid: boolean;
    debit_total: string;
    credit_total: string;
    error?: string;
} {
    let debitTotal = new Decimal(0);
    let creditTotal = new Decimal(0);

    for (const line of entry.lines) {
        if (line.debit) {
            debitTotal = debitTotal.plus(new Decimal(line.debit));
        }
        if (line.credit) {
            creditTotal = creditTotal.plus(new Decimal(line.credit));
        }
    }

    const valid = debitTotal.equals(creditTotal);

    return {
        valid,
        debit_total: debitTotal.toString(),
        credit_total: creditTotal.toString(),
        error: valid ? undefined : `Entry ${entry.entry_id} unbalanced: debits=${debitTotal}, credits=${creditTotal}`,
    };
}

/**
 * Validate that journal entries balance.
 *
 * Per IK D7.5: sum(debits) == sum(credits), abort if unbalanced.
 * Uses Decimal for precise comparison.
 *
 * @param entries - Journal entries to validate
 * @returns Validation result with totals and any errors
 */
export function validateJournal(entries: JournalEntry[]): JournalValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    for (const entry of entries) {
        const entryResult = validateEntry(entry);

        if (!entryResult.valid && entryResult.error) {
            errors.push(entryResult.error);
        }

        totalDebits = totalDebits.plus(new Decimal(entryResult.debit_total));
        totalCredits = totalCredits.plus(new Decimal(entryResult.credit_total));
    }

    const difference = totalDebits.minus(totalCredits).abs();
    const valid = difference.isZero() && errors.length === 0;

    if (!difference.isZero()) {
        errors.push(`Journal unbalanced: total debits=${totalDebits}, total credits=${totalCredits}, difference=${difference}`);
    }

    return {
        valid,
        total_debits: totalDebits.toString(),
        total_credits: totalCredits.toString(),
        difference: difference.toString(),
        errors,
        warnings,
    };
}
```

**Test File:** `packages/core/tests/ledger/validate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateJournal, validateEntry } from '../../src/ledger/validate.js';
import type { JournalEntry } from '@finance-engine/shared';

describe('validateEntry', () => {
    it('returns valid=true for balanced entry', () => {
        const entry: JournalEntry = {
            entry_id: 1,
            date: '2026-01-15',
            description: 'Test',
            lines: [
                { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                { account_id: 2122, account_name: 'Amex', debit: null, credit: '50.00', txn_id: 'test-1' },
            ],
        };

        const result = validateEntry(entry);
        expect(result.valid).toBe(true);
        expect(result.debit_total).toBe('50');
        expect(result.credit_total).toBe('50');
    });

    it('returns valid=false for unbalanced entry', () => {
        const entry: JournalEntry = {
            entry_id: 1,
            date: '2026-01-15',
            description: 'Test',
            lines: [
                { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                { account_id: 2122, account_name: 'Amex', debit: null, credit: '40.00', txn_id: 'test-1' },
            ],
        };

        const result = validateEntry(entry);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('unbalanced');
    });
});

describe('validateJournal', () => {
    it('returns valid=true for balanced journal', () => {
        const entries: JournalEntry[] = [
            {
                entry_id: 1,
                date: '2026-01-15',
                description: 'Expense 1',
                lines: [
                    { account_id: 4320, account_name: 'Restaurants', debit: '50.00', credit: null, txn_id: 'test-1' },
                    { account_id: 2122, account_name: 'Amex', debit: null, credit: '50.00', txn_id: 'test-1' },
                ],
            },
            {
                entry_id: 2,
                date: '2026-01-16',
                description: 'Expense 2',
                lines: [
                    { account_id: 4260, account_name: 'Transport', debit: '25.00', credit: null, txn_id: 'test-2' },
                    { account_id: 2122, account_name: 'Amex', debit: null, credit: '25.00', txn_id: 'test-2' },
                ],
            },
        ];

        const result = validateJournal(entries);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('75');
        expect(result.total_credits).toBe('75');
        expect(result.difference).toBe('0');
    });

    it('handles empty journal', () => {
        const result = validateJournal([]);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('0');
        expect(result.total_credits).toBe('0');
    });

    it('uses Decimal precision (no floating point drift)', () => {
        // Many small amounts that would cause drift with floats
        const entries: JournalEntry[] = [];
        for (let i = 0; i < 100; i++) {
            entries.push({
                entry_id: i + 1,
                date: '2026-01-15',
                description: `Entry ${i}`,
                lines: [
                    { account_id: 4320, account_name: 'Expense', debit: '0.01', credit: null, txn_id: `test-${i}` },
                    { account_id: 2122, account_name: 'CC', debit: null, credit: '0.01', txn_id: `test-${i}` },
                ],
            });
        }

        const result = validateJournal(entries);
        expect(result.valid).toBe(true);
        expect(result.total_debits).toBe('1'); // Exactly 1.00, no drift
        expect(result.total_credits).toBe('1');
    });
});
```

### Task 3.4: Journal Generation

**File:** `packages/core/src/ledger/generate.ts`

```typescript
import Decimal from 'decimal.js';
import type {
    Transaction,
    Match,
    JournalEntry,
    JournalLine,
    LedgerResult,
    AccountInfo,
} from '@finance-engine/shared';
import type { LedgerOptions } from './types.js';
import { validateJournal } from './validate.js';
import { resolveAccountName, getAccountType } from './account-resolve.js';

/**
 * Generate journal entry for a matched payment.
 *
 * Per PRD §10.5, IK D7.6:
 * DR Credit Card (reduce liability)
 * CR Checking (reduce asset)
 */
export function generateMatchedPaymentEntry(
    match: Match,
    bankTxn: Transaction,
    ccTxn: Transaction,
    entryId: number,
    accounts: Map<number, AccountInfo>
): { entry: JournalEntry; warnings: string[] } {
    const warnings: string[] = [];
    const amount = new Decimal(match.amount);

    // Resolve account names
    const ccAccount = resolveAccountName(ccTxn.account_id, accounts);
    if (ccAccount.warning) warnings.push(ccAccount.warning);

    const bankAccount = resolveAccountName(bankTxn.account_id, accounts);
    if (bankAccount.warning) warnings.push(bankAccount.warning);

    const lines: JournalLine[] = [
        {
            account_id: ccTxn.account_id,
            account_name: ccAccount.name,
            debit: amount.toString(),
            credit: null,
            txn_id: ccTxn.txn_id,
        },
        {
            account_id: bankTxn.account_id,
            account_name: bankAccount.name,
            debit: null,
            credit: amount.toString(),
            txn_id: bankTxn.txn_id,
        },
    ];

    return {
        entry: {
            entry_id: entryId,
            date: bankTxn.effective_date,
            description: `CC Payment: ${ccAccount.name}`,
            lines,
        },
        warnings,
    };
}

/**
 * Generate journal entry for a regular (non-matched) transaction.
 *
 * Per PRD §7.2, Appendix C, IK D7.1-D7.2:
 * - CC expense: DR Expense, CR Liability
 * - CC refund (positive, expense category): DR Liability, CR Expense
 * - CC reward (positive, income category): DR Liability, CR Income
 * - Bank expense: DR Expense, CR Asset
 * - Bank income: DR Asset, CR Income
 */
export function generateJournalEntry(
    transaction: Transaction,
    entryId: number,
    accounts: Map<number, AccountInfo>
): { entry: JournalEntry | null; warnings: string[] } {
    const warnings: string[] = [];
    const amount = new Decimal(transaction.signed_amount).abs();
    const isInflow = new Decimal(transaction.signed_amount).isPositive();

    // Resolve accounts
    const sourceAccount = resolveAccountName(transaction.account_id, accounts);
    if (sourceAccount.warning) warnings.push(sourceAccount.warning);

    const categoryAccount = resolveAccountName(transaction.category_id, accounts);
    if (categoryAccount.warning) warnings.push(categoryAccount.warning);

    const sourceType = getAccountType(transaction.account_id);
    const categoryType = getAccountType(transaction.category_id);

    const lines: JournalLine[] = [];

    if (sourceType === 'liability') {
        // Credit card transaction
        if (isInflow) {
            // Positive on CC: refund or reward
            // DR Liability (reduce what we owe)
            // CR Category (either expense reduction or income)
            lines.push({
                account_id: transaction.account_id,
                account_name: sourceAccount.name,
                debit: amount.toString(),
                credit: null,
                txn_id: transaction.txn_id,
            });
            lines.push({
                account_id: transaction.category_id,
                account_name: categoryAccount.name,
                debit: null,
                credit: amount.toString(),
                txn_id: transaction.txn_id,
            });
        } else {
            // Negative on CC: charge
            // DR Category (expense incurred)
            // CR Liability (increase what we owe)
            lines.push({
                account_id: transaction.category_id,
                account_name: categoryAccount.name,
                debit: amount.toString(),
                credit: null,
                txn_id: transaction.txn_id,
            });
            lines.push({
                account_id: transaction.account_id,
                account_name: sourceAccount.name,
                debit: null,
                credit: amount.toString(),
                txn_id: transaction.txn_id,
            });
        }
    } else if (sourceType === 'asset') {
        // Bank account transaction
        if (isInflow) {
            // Deposit/income
            // DR Asset (increase cash)
            // CR Category (income)
            lines.push({
                account_id: transaction.account_id,
                account_name: sourceAccount.name,
                debit: amount.toString(),
                credit: null,
                txn_id: transaction.txn_id,
            });
            lines.push({
                account_id: transaction.category_id,
                account_name: categoryAccount.name,
                debit: null,
                credit: amount.toString(),
                txn_id: transaction.txn_id,
            });
        } else {
            // Withdrawal/expense
            // DR Category (expense incurred)
            // CR Asset (reduce cash)
            lines.push({
                account_id: transaction.category_id,
                account_name: categoryAccount.name,
                debit: amount.toString(),
                credit: null,
                txn_id: transaction.txn_id,
            });
            lines.push({
                account_id: transaction.account_id,
                account_name: sourceAccount.name,
                debit: null,
                credit: amount.toString(),
                txn_id: transaction.txn_id,
            });
        }
    } else {
        warnings.push(`Unexpected source account type for txn ${transaction.txn_id}: ${sourceType}`);
        return { entry: null, warnings };
    }

    return {
        entry: {
            entry_id: entryId,
            date: transaction.effective_date,
            description: transaction.description,
            lines,
        },
        warnings,
    };
}

/**
 * Generate double-entry journal from categorized transactions and matches.
 *
 * Per PRD §7.2, IK D7.1-D7.9:
 * - Each transaction produces balanced debit/credit entry
 * - Matched payments produce ONE combined entry (not two)
 * - Entry IDs auto-assigned starting at 1, ordered by effective_date
 * - Every line includes txn_id for traceability (IK D7.9)
 *
 * @param transactions - Categorized transactions
 * @param matches - Payment matches from matcher module
 * @param options - Ledger configuration including account lookup
 * @returns LedgerResult with entries, validation, warnings, stats
 */
export function generateJournal(
    transactions: Transaction[],
    matches: Match[],
    options: LedgerOptions
): LedgerResult {
    const warnings: string[] = [];
    const entries: JournalEntry[] = [];

    const startingId = options.startingEntryId ?? 1;
    let nextEntryId = startingId;

    // Build lookup of matched txn_ids
    const matchedTxnIds = new Set<string>();
    const matchByBankTxnId = new Map<string, Match>();
    for (const match of matches) {
        matchedTxnIds.add(match.bank_txn_id);
        matchedTxnIds.add(match.cc_txn_id);
        matchByBankTxnId.set(match.bank_txn_id, match);
    }

    // Build txn lookup
    const txnById = new Map<string, Transaction>();
    for (const txn of transactions) {
        txnById.set(txn.txn_id, txn);
    }

    // Sort by effective_date for sequential entry IDs
    const sortedTxns = [...transactions].sort((a, b) =>
        a.effective_date.localeCompare(b.effective_date) ||
        a.txn_id.localeCompare(b.txn_id)
    );

    let matchedPaymentEntries = 0;
    let regularEntries = 0;

    for (const txn of sortedTxns) {
        // Skip CC side of matched payments (bank side generates the entry)
        if (matchedTxnIds.has(txn.txn_id) && !matchByBankTxnId.has(txn.txn_id)) {
            continue;
        }

        // Is this a matched payment?
        const match = matchByBankTxnId.get(txn.txn_id);
        if (match) {
            const ccTxn = txnById.get(match.cc_txn_id);
            if (!ccTxn) {
                warnings.push(`Match references unknown CC txn: ${match.cc_txn_id}`);
                continue;
            }

            const { entry, warnings: entryWarnings } = generateMatchedPaymentEntry(
                match, txn, ccTxn, nextEntryId, options.accounts
            );
            warnings.push(...entryWarnings);
            entries.push(entry);
            nextEntryId++;
            matchedPaymentEntries++;
        } else {
            // Regular transaction
            const { entry, warnings: entryWarnings } = generateJournalEntry(
                txn, nextEntryId, options.accounts
            );
            warnings.push(...entryWarnings);
            if (entry) {
                entries.push(entry);
                nextEntryId++;
                regularEntries++;
            }
        }
    }

    // Validate
    const validation = validateJournal(entries);

    return {
        entries,
        validation,
        warnings,
        stats: {
            total_entries: entries.length,
            total_lines: entries.reduce((sum, e) => sum + e.lines.length, 0),
            matched_payment_entries: matchedPaymentEntries,
            regular_entries: regularEntries,
        },
    };
}
```

**Test File:** `packages/core/tests/ledger/generate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateJournal, generateJournalEntry, generateMatchedPaymentEntry } from '../../src/ledger/generate.js';
import type { Transaction, Match, AccountInfo } from '@finance-engine/shared';

// Helper to create account map
function makeAccountMap(): Map<number, AccountInfo> {
    return new Map([
        [1120, { id: 1120, name: 'Chase Checking', type: 'asset' }],
        [2122, { id: 2122, name: 'Amex Delta', type: 'liability' }],
        [3130, { id: 3130, name: 'Reimbursement Income', type: 'income' }],
        [3250, { id: 3250, name: 'Cashback/Rewards', type: 'income' }],
        [4320, { id: 4320, name: 'Restaurants', type: 'expense' }],
        [4410, { id: 4410, name: 'Clothing', type: 'expense' }],
        [4999, { id: 4999, name: 'UNCATEGORIZED', type: 'expense' }],
    ]);
}

// Helper to create transaction
function makeTxn(overrides: Partial<Transaction>): Transaction {
    return {
        txn_id: 'txn-' + Math.random().toString(16).slice(2, 10),
        txn_date: '2026-01-15',
        post_date: '2026-01-15',
        effective_date: '2026-01-15',
        description: 'Test Transaction',
        raw_description: 'TEST TRANSACTION',
        signed_amount: '-50.00',
        account_id: 2122,
        category_id: 4320,
        source_file: 'test.csv',
        confidence: 0.8,
        needs_review: false,
        review_reasons: [],
        ...overrides,
    };
}

describe('generateJournalEntry', () => {
    const accounts = makeAccountMap();

    describe('CC Expenses', () => {
        it('generates DR Expense, CR Liability for CC charge', () => {
            const txn = makeTxn({
                signed_amount: '-47.23',
                account_id: 2122,
                category_id: 4320,
            });

            const { entry, warnings } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();
            expect(entry!.lines).toHaveLength(2);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(4320); // Expense
            expect(debitLine?.debit).toBe('47.23');

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(2122); // CC
            expect(creditLine?.credit).toBe('47.23');
        });
    });

    describe('IK D7.1 - Refund Handling', () => {
        it('generates DR Liability, CR Expense for CC refund', () => {
            const txn = makeTxn({
                signed_amount: '+50.00', // Positive on CC = refund
                account_id: 2122,
                category_id: 4410, // Clothing (expense)
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(2122); // Liability
            expect(debitLine?.debit).toBe('50');

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(4410); // Expense
            expect(creditLine?.credit).toBe('50');
        });
    });

    describe('IK D7.2 - Rewards/Cashback', () => {
        it('generates DR Liability, CR Income for CC reward', () => {
            const txn = makeTxn({
                signed_amount: '+25.00', // Positive on CC
                account_id: 2122,
                category_id: 3250, // Cashback/Rewards (income)
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(2122); // Liability

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(3250); // Income
        });
    });

    describe('Bank Transactions', () => {
        it('generates DR Expense, CR Asset for bank expense', () => {
            const txn = makeTxn({
                signed_amount: '-100.00',
                account_id: 1120, // Checking
                category_id: 4320, // Restaurants
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(4320); // Expense

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(1120); // Asset
        });

        it('generates DR Asset, CR Income for bank deposit', () => {
            const txn = makeTxn({
                signed_amount: '+234.56',
                account_id: 1120, // Checking
                category_id: 3130, // Reimbursement
            });

            const { entry } = generateJournalEntry(txn, 1, accounts);

            const debitLine = entry!.lines.find(l => l.debit !== null);
            expect(debitLine?.account_id).toBe(1120); // Asset

            const creditLine = entry!.lines.find(l => l.credit !== null);
            expect(creditLine?.account_id).toBe(3130); // Income
        });
    });

    describe('IK D7.9 - txn_id Traceability', () => {
        it('includes txn_id on every journal line', () => {
            const txn = makeTxn({ txn_id: 'trace-12345678' });
            const { entry } = generateJournalEntry(txn, 1, accounts);

            for (const line of entry!.lines) {
                expect(line.txn_id).toBe('trace-12345678');
            }
        });
    });

    describe('IK D7.8 - Unknown Account', () => {
        it('warns on unknown account_id but continues', () => {
            const txn = makeTxn({
                account_id: 9999, // Unknown
                category_id: 4320,
            });

            const { entry, warnings } = generateJournalEntry(txn, 1, accounts);

            expect(entry).not.toBeNull();
            expect(warnings.some(w => w.includes('9999'))).toBe(true);
        });
    });
});

describe('generateMatchedPaymentEntry', () => {
    const accounts = makeAccountMap();

    it('generates DR CC, CR Checking for matched payment (IK D7.6)', () => {
        const match: Match = {
            type: 'payment',
            bank_txn_id: 'bank-123',
            cc_txn_id: 'cc-456',
            amount: '1234.56',
            date_diff_days: 2,
        };
        const bankTxn = makeTxn({
            txn_id: 'bank-123',
            signed_amount: '-1234.56',
            account_id: 1120,
        });
        const ccTxn = makeTxn({
            txn_id: 'cc-456',
            signed_amount: '1234.56',
            account_id: 2122,
        });

        const { entry } = generateMatchedPaymentEntry(match, bankTxn, ccTxn, 1, accounts);

        expect(entry.lines).toHaveLength(2);

        const debitLine = entry.lines.find(l => l.debit !== null);
        expect(debitLine?.account_id).toBe(2122); // CC
        expect(debitLine?.debit).toBe('1234.56');

        const creditLine = entry.lines.find(l => l.credit !== null);
        expect(creditLine?.account_id).toBe(1120); // Checking
        expect(creditLine?.credit).toBe('1234.56');
    });
});

describe('generateJournal', () => {
    const accounts = makeAccountMap();

    it('generates single entry for matched payment (not two)', () => {
        const bankTxn = makeTxn({
            txn_id: 'bank-payment',
            raw_description: 'AMEX AUTOPAY',
            signed_amount: '-500.00',
            account_id: 1120,
            effective_date: '2026-01-15',
        });
        const ccTxn = makeTxn({
            txn_id: 'cc-payment',
            signed_amount: '500.00',
            account_id: 2122,
            effective_date: '2026-01-15',
        });
        const match: Match = {
            type: 'payment',
            bank_txn_id: 'bank-payment',
            cc_txn_id: 'cc-payment',
            amount: '500.00',
            date_diff_days: 0,
        };

        const { entries, stats } = generateJournal([bankTxn, ccTxn], [match], { accounts });

        expect(entries).toHaveLength(1); // One combined entry
        expect(stats.matched_payment_entries).toBe(1);
        expect(stats.regular_entries).toBe(0);
    });

    it('assigns sequential entry IDs ordered by date', () => {
        const txn1 = makeTxn({ effective_date: '2026-01-15' });
        const txn2 = makeTxn({ effective_date: '2026-01-10' });
        const txn3 = makeTxn({ effective_date: '2026-01-20' });

        const { entries } = generateJournal([txn1, txn2, txn3], [], { accounts });

        expect(entries[0].date).toBe('2026-01-10');
        expect(entries[0].entry_id).toBe(1);
        expect(entries[1].date).toBe('2026-01-15');
        expect(entries[1].entry_id).toBe(2);
        expect(entries[2].date).toBe('2026-01-20');
        expect(entries[2].entry_id).toBe(3);
    });

    it('validates journal balance', () => {
        const txn = makeTxn({});
        const { validation } = generateJournal([txn], [], { accounts });

        expect(validation.valid).toBe(true);
        expect(validation.difference).toBe('0');
    });
});
```

### Task 3.5: Ledger Module Index

**File:** `packages/core/src/ledger/index.ts`

```typescript
/**
 * Ledger module: Double-entry journal generation and validation.
 * Per PRD §7.2, IK D7.1-D7.9.
 */

export { generateJournal, generateJournalEntry, generateMatchedPaymentEntry } from './generate.js';
export { validateJournal, validateEntry } from './validate.js';
export { resolveAccountName, getAccountType, isLiabilityAccount, isAssetAccount } from './account-resolve.js';
export type { LedgerOptions } from './types.js';
```

**Commit:**
```
feat(core): implement ledger module with journal generation

Implements double-entry journal generation per PRD §7.2, IK D7.1-D7.9:
- generateJournal() produces balanced entries from transactions + matches
- generateJournalEntry() handles regular expenses, income, refunds, rewards
- generateMatchedPaymentEntry() creates single entry for matched CC payments
- validateJournal() verifies sum(debits) == sum(credits) using Decimal

Key behaviors:
- Refunds credit expense account, not income (IK D7.1)
- Rewards route to income account (IK D7.2)
- Matched payments produce ONE entry, not two (IK D7.6)
- Every line includes txn_id for traceability (IK D7.9)
- Unknown accounts warned but processing continues (IK D7.8)
```

---

## Part 4: Integration

### Task 4.1: Update Core Package Exports

**File:** `packages/core/src/index.ts`

Add after existing exports:

```typescript
// Phase 4: Matcher
export { matchPayments, findBestMatch, daysBetween, isWithinDateTolerance } from './matcher/index.js';
export type { MatcherOptions, MatchCandidate, BestMatchResult } from './matcher/types.js';

// Phase 4: Ledger
export {
    generateJournal,
    generateJournalEntry,
    generateMatchedPaymentEntry,
    validateJournal,
    validateEntry,
    resolveAccountName,
    getAccountType,
    isLiabilityAccount,
    isAssetAccount,
} from './ledger/index.js';
export type { LedgerOptions } from './ledger/types.js';
```

### Task 4.2: Integration Test

**File:** `packages/core/tests/integration/matcher-ledger.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { matchPayments } from '../../src/matcher/index.js';
import { generateJournal } from '../../src/ledger/index.js';
import type { Transaction, PaymentPattern, AccountInfo } from '@finance-engine/shared';

describe('Matcher + Ledger Integration', () => {
    const accounts = new Map<number, AccountInfo>([
        [1120, { id: 1120, name: 'Chase Checking', type: 'asset' }],
        [2122, { id: 2122, name: 'Amex Delta', type: 'liability' }],
        [4320, { id: 4320, name: 'Restaurants', type: 'expense' }],
    ]);

    const patterns: PaymentPattern[] = [
        { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [2122] },
    ];

    function makeTxn(overrides: Partial<Transaction>): Transaction {
        return {
            txn_id: 'txn-' + Math.random().toString(16).slice(2, 10),
            txn_date: '2026-01-15',
            post_date: '2026-01-15',
            effective_date: '2026-01-15',
            description: 'Test',
            raw_description: 'TEST',
            signed_amount: '-50.00',
            account_id: 2122,
            category_id: 4320,
            source_file: 'test.csv',
            confidence: 0.8,
            needs_review: false,
            review_reasons: [],
            ...overrides,
        };
    }

    it('end-to-end: transactions -> match -> ledger with balanced journal', () => {
        // Setup: 2 regular CC expenses + 1 matched CC payment
        const expense1 = makeTxn({
            txn_id: 'expense-1',
            signed_amount: '-50.00',
            effective_date: '2026-01-10',
        });
        const expense2 = makeTxn({
            txn_id: 'expense-2',
            signed_amount: '-25.00',
            effective_date: '2026-01-12',
        });
        const bankPayment = makeTxn({
            txn_id: 'bank-pay',
            raw_description: 'AMEX AUTOPAY',
            signed_amount: '-500.00',
            account_id: 1120,
            effective_date: '2026-01-15',
        });
        const ccPaymentReceived = makeTxn({
            txn_id: 'cc-pay',
            signed_amount: '500.00',
            account_id: 2122,
            effective_date: '2026-01-15',
        });

        const transactions = [expense1, expense2, bankPayment, ccPaymentReceived];

        // Step 1: Match payments
        const matchResult = matchPayments(transactions, {
            patterns,
            bankAccountIds: [1120],
            ccAccountIds: [2122],
        });

        expect(matchResult.matches).toHaveLength(1);
        expect(matchResult.matches[0].bank_txn_id).toBe('bank-pay');
        expect(matchResult.matches[0].cc_txn_id).toBe('cc-pay');

        // Step 2: Generate journal
        const ledgerResult = generateJournal(transactions, matchResult.matches, { accounts });

        // Should have 3 entries: 2 expenses + 1 matched payment
        expect(ledgerResult.entries).toHaveLength(3);
        expect(ledgerResult.stats.regular_entries).toBe(2);
        expect(ledgerResult.stats.matched_payment_entries).toBe(1);

        // Journal should be balanced
        expect(ledgerResult.validation.valid).toBe(true);
        expect(ledgerResult.validation.difference).toBe('0');
    });

    it('matched CC transactions excluded from double journal generation', () => {
        const bankPayment = makeTxn({
            txn_id: 'bank-pay',
            raw_description: 'AMEX AUTOPAY',
            signed_amount: '-500.00',
            account_id: 1120,
        });
        const ccPaymentReceived = makeTxn({
            txn_id: 'cc-pay',
            signed_amount: '500.00',
            account_id: 2122,
        });

        const matchResult = matchPayments([bankPayment, ccPaymentReceived], {
            patterns,
            bankAccountIds: [1120],
            ccAccountIds: [2122],
        });

        const ledgerResult = generateJournal(
            [bankPayment, ccPaymentReceived],
            matchResult.matches,
            { accounts }
        );

        // Only 1 entry for the matched payment (not 2 separate entries)
        expect(ledgerResult.entries).toHaveLength(1);
        expect(ledgerResult.stats.matched_payment_entries).toBe(1);
        expect(ledgerResult.stats.regular_entries).toBe(0);
    });
});
```

---

## Part 5: Verification & PR

### Final Verification

```bash
# 1. Run all tests
pnpm test

# Expected: ~225 tests pass (185 existing + ~40 new)

# 2. Build all packages
pnpm build

# 3. Lint
pnpm lint

# 4. Type check
pnpm tsc --noEmit
```

### PR Preparation

**Branch:** `phase-4/matcher-ledger`

**PR Title:** `feat(core): Phase 4 Matcher + Ledger modules`

**PR Body:**
```markdown
## Summary

Implements payment matching and double-entry journal generation for Finance Engine v2.0.

### Matcher Module (`packages/core/src/matcher/`)
- `matchPayments()` finds CC payment pairs between bank withdrawals and CC payments
- `findBestMatch()` selects best candidate with date/amount tolerance
- Pure function pattern: returns matches + review updates, does not mutate transactions

### Ledger Module (`packages/core/src/ledger/`)
- `generateJournal()` produces balanced double-entry journal from transactions + matches
- `validateJournal()` verifies sum(debits) == sum(credits) using Decimal precision
- Handles all transaction types: expenses, refunds, rewards, matched payments

### Key Behaviors (per PRD §10, IK D6/D7)
- Date tolerance: ±5 days (IK D6.1)
- Amount tolerance: $0.01 (IK D6.2)
- Ambiguous matches flagged, not auto-resolved (IK D6.3)
- Payment keyword required (IK D6.5)
- Refunds credit expense account (IK D7.1)
- Rewards route to income account (IK D7.2)
- Matched payments produce ONE entry (IK D7.6)
- All lines include txn_id for traceability (IK D7.9)

## Test Plan
- [ ] `pnpm test` passes (~225 tests)
- [ ] `pnpm build` succeeds
- [ ] New matcher tests cover all IK D6.1-D6.9 requirements
- [ ] New ledger tests cover all IK D7.1-D7.9 requirements
- [ ] Integration test verifies match → ledger flow produces balanced journal
```

---

## Quality Checklist

### Completeness
- [ ] matchPayments() finds CC payment pairs
- [ ] findBestMatch() implements date/amount tolerance with ambiguity handling
- [ ] generateJournal() handles ALL transaction types from Appendix C
- [ ] validateJournal() confirms debits == credits using Decimal
- [ ] Matched transactions produce one combined entry, not two
- [ ] Payment keyword requirement enforced (IK D6.5)
- [ ] Zero-amount transactions skipped in matching (IK D6.9)

### Correctness (Accounting)
- [ ] DR/CR sides correct for every transaction type
- [ ] Refunds credit expense account, not income (IK D7.1)
- [ ] Rewards route to income (IK D7.2)
- [ ] Matched CC payments: DR CC, CR Checking (IK D7.6)
- [ ] validateJournal uses Decimal, not floating point
- [ ] All amounts use decimal.js

### Correctness (Matching)
- [ ] Date tolerance: ±5 days (IK D6.1)
- [ ] Amount tolerance: $0.01 (IK D6.2)
- [ ] Ambiguous matches flagged (IK D6.3)
- [ ] Payment keyword required (IK D6.5)
- [ ] No-candidate flagged (IK D6.6)
- [ ] Zero-amount skipped (IK D6.9)

### Architecture
- [ ] Zero `node:*` imports in new files
- [ ] Zero `console.*` calls in new files
- [ ] matchPayments() does not mutate inputs
- [ ] generateJournal() does not mutate inputs
- [ ] Account chart received as parameter

---

## Deferred to Phase 5

| Feature | Reason |
|---------|--------|
| Internal transfers | Requires transfer pattern detection; architecture supports later addition |
| Cross-month matching | Adds statefulness (IK D6.8) |
| CLI integration | Phase 5 scope |

---

**Document Version:** 1.0
**Created:** 2026-02-01
**Author:** Chief Architect (Claude Opus 4.5)
