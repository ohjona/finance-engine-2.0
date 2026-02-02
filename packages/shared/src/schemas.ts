/**
 * Zod schemas for Finance Engine data structures.
 * Per PRD Section 7, IK D2.8-D2.11.
 *
 * IMPORTANT: Decimal values are stored as strings in schemas.
 * Convert to Decimal at computation boundaries, back to string at output.
 * Per IK D2.2.
 */

import { z } from 'zod';
import { TXN_ID } from './constants.js';

// ============================================================================
// Primitive Validators
// ============================================================================

/**
 * ISO date string format: YYYY-MM-DD
 */
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

/**
 * Decimal amount as string (never native number for money).
 * Per IK D2.2.
 */
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be valid decimal string');

/**
 * 4-digit account ID (1000-9999).
 * Per IK D2.11.
 */
const accountId = z.number().int().min(1000).max(9999);

/**
 * Transaction ID: 16-char hex, optionally with collision suffix.
 * Base: 16 hex chars. With suffix: 16 hex chars + "-" + 2 digits (e.g., "-02").
 * Per IK D2.3, D2.4.
 */
const txnId = z.string().regex(
    new RegExp(`^[0-9a-f]{${TXN_ID.LENGTH}}(-\\d{2})?$`),
    `Must be ${TXN_ID.LENGTH}-char hex, optionally with -NN suffix`
);

// ============================================================================
// Transaction Schema
// ============================================================================

/**
 * Normalized transaction - the common form all bank exports become.
 * Per PRD Section 7.1.
 */
export const TransactionSchema = z.object({
    txn_id: txnId,
    txn_date: isoDateString,
    post_date: isoDateString,
    effective_date: isoDateString,
    description: z.string(),
    raw_description: z.string(),
    signed_amount: decimalString,
    account_id: accountId,
    category_id: z.number().int(),
    raw_category: z.string().optional(),
    source_file: z.string(),
    confidence: z.number().min(0).max(1),
    needs_review: z.boolean(),
    review_reasons: z.array(z.string()),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// ============================================================================
// Categorization Schemas
// ============================================================================

/**
 * Categorization result - what categorize() returns.
 * Per PRD Section 9.2.
 */
export const CategorizationResultSchema = z.object({
    category_id: z.number().int(),
    confidence: z.number().min(0).max(1),
    source: z.enum(['user', 'shared', 'base', 'bank', 'uncategorized']),
    needs_review: z.boolean(),
    review_reasons: z.array(z.string()),
});

export type CategorizationResult = z.infer<typeof CategorizationResultSchema>;

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

/**
 * Rule schema for categorization patterns.
 * Per IK D2.10.
 */
export const RuleSchema = z.object({
    pattern: z.string().min(1),
    pattern_type: z.enum(['substring', 'regex']).default('substring'),
    category_id: z.number().int(),
    note: z.string().optional(),
    added_date: isoDateString.optional(),
    source: z.enum(['manual', 'llm_suggestion']).optional(),
});

export type Rule = z.infer<typeof RuleSchema>;

/**
 * RuleSet containing all rule layers.
 * Per IK D4.1 - 4-layer model.
 */
export const RuleSetSchema = z.object({
    user_rules: z.array(RuleSchema),
    shared_rules: z.array(RuleSchema),
    base_rules: z.array(RuleSchema),
});

export type RuleSet = z.infer<typeof RuleSetSchema>;

// ============================================================================
// Account Schemas
// ============================================================================

/**
 * Account definition.
 * Per PRD Section 7.3.
 */
export const AccountSchema = z.object({
    name: z.string(),
    type: z.enum(['asset', 'liability', 'income', 'expense', 'special']),
    institution: z.string().optional(),
    parent: z.string().optional(),
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * Chart of accounts map.
 */
export const ChartOfAccountsSchema = z.object({
    accounts: z.record(z.string(), AccountSchema),
});

export type ChartOfAccounts = z.infer<typeof ChartOfAccountsSchema>;

// ============================================================================
// Journal Schemas
// ============================================================================

/**
 * Journal entry line.
 * Per PRD Section 7.2.
 */
export const JournalLineSchema = z.object({
    account_id: accountId,
    account_name: z.string(),
    debit: decimalString.nullable(),
    credit: decimalString.nullable(),
    txn_id: txnId,
});

export type JournalLine = z.infer<typeof JournalLineSchema>;

/**
 * Complete journal entry with lines.
 * Per PRD Section 7.2.
 */
export const JournalEntrySchema = z.object({
    entry_id: z.number().int(),
    date: isoDateString,
    description: z.string(),
    lines: z.array(JournalLineSchema),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

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
    cc_txn_ids: z.array(txnId),
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
    partial_payment_flagged: z.number().int().min(0).optional(),
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

// ============================================================================
// Run Manifest Schema
// ============================================================================

/**
 * Run manifest for tracking processed files.
 * Per IK D8.2.
 */
export const RunManifestSchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
    run_timestamp: z.string(),
    input_files: z.record(z.string(), z.string()),
    transaction_count: z.number().int().min(0),
    txn_ids: z.array(z.string()),
    collision_map: z.record(z.string(), z.number().int()),
    version: z.string(),
});

export type RunManifest = z.infer<typeof RunManifestSchema>;

// ============================================================================
// Parser Result Schema
// ============================================================================

/**
 * Result returned by parser functions.
 * Parsers return data, not side effects. Warnings are returned as data.
 * Per architectural constraint: no console.* in core.
 */
export const ParseResultSchema = z.object({
    transactions: z.array(TransactionSchema),
    warnings: z.array(z.string()),
    skippedRows: z.number().int().min(0),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
