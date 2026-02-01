// Types (re-exported from shared)
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
} from './types/index.js';

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
} from './types/index.js';

// Utils
export { generateTxnId, resolveCollisions, buildCollisionMap } from './utils/index.js';
export { normalizeDescription } from './utils/index.js';

// Parsers
export { parseAmex } from './parser/index.js';
export { detectParser, extractAccountId, getSupportedParsers } from './parser/index.js';
export type { ParserFn, ParserDetectionResult } from './parser/index.js';
