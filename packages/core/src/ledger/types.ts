import type { AccountInfo } from '@finance-engine/shared';

/**
 * Options for journal generation.
 */
export interface LedgerOptions {
    accounts: Map<number, AccountInfo>;  // Account ID -> info lookup
    startingEntryId?: number;            // Default: 1
}
