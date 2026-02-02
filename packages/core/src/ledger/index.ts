/**
 * Ledger module: Double-entry journal generation and validation.
 * Per PRD §7.2, IK D7.1-D7.9.
 */

export { generateJournal, generateJournalEntry, generateMatchedPaymentEntry } from './generate.js';
export { validateJournal, validateEntry } from './validate.js';
export { resolveAccountName, getAccountType, isLiabilityAccount, isAssetAccount } from './account-resolve.js';
export type { LedgerOptions } from './types.js';
