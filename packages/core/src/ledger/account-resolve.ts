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
