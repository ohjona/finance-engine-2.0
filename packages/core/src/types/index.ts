/**
 * Re-export all types from shared package.
 * Core package uses these types but doesn't define them.
 */
export type {
    Transaction,
    CategorizationResult,
    Rule,
    RuleSet,
    Account,
    ChartOfAccounts,
    JournalLine,
    JournalEntry,
    RunManifest,
    ParseResult,
} from '@finance-engine/shared';

export {
    TransactionSchema,
    CategorizationResultSchema,
    RuleSchema,
    RuleSetSchema,
    AccountSchema,
    ChartOfAccountsSchema,
    JournalLineSchema,
    JournalEntrySchema,
    RunManifestSchema,
    ParseResultSchema,
    UNCATEGORIZED_CATEGORY_ID,
    CONFIDENCE,
    PATTERN_VALIDATION,
    MATCHING_CONFIG,
    TXN_ID,
} from '@finance-engine/shared';
