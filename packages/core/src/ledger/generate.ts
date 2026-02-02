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
    ccTxns: Transaction[],
    entryId: number,
    accounts: Map<number, AccountInfo>
): { entry: JournalEntry; warnings: string[] } {
    const warnings: string[] = [];
    const amount = new Decimal(match.amount);

    // B-6: Validate match amount against transactions
    const bankAmount = new Decimal(bankTxn.signed_amount).abs();
    const ccAmountSum = ccTxns.reduce(
        (sum, t) => sum.plus(new Decimal(t.signed_amount).abs()),
        new Decimal(0)
    );

    if (!amount.equals(bankAmount) || !amount.equals(ccAmountSum)) {
        const ccIds = ccTxns.map(t => t.txn_id).join(', ');
        throw new Error(
            `Match amount mismatch: match=${match.amount}, bank=${bankAmount}, ccSum=${ccAmountSum}. ` +
            `Transactions: ${bankTxn.txn_id}, CCs: [${ccIds}]`
        );
    }

    const lines: JournalLine[] = [];

    // DR Credit Cards (reduce liability)
    for (const ccTxn of ccTxns) {
        const ccAccount = resolveAccountName(ccTxn.account_id, accounts);
        if (ccAccount.warning) warnings.push(ccAccount.warning);

        lines.push({
            account_id: ccTxn.account_id,
            account_name: ccAccount.name,
            debit: new Decimal(ccTxn.signed_amount).abs().toString(),
            credit: null,
            txn_id: ccTxn.txn_id,
        });
    }

    // CR Bank (reduce asset)
    const bankAccount = resolveAccountName(bankTxn.account_id, accounts);
    if (bankAccount.warning) warnings.push(bankAccount.warning);

    lines.push({
        account_id: bankTxn.account_id,
        account_name: bankAccount.name,
        debit: null,
        credit: amount.toString(),
        txn_id: bankTxn.txn_id,
    });

    return {
        entry: {
            entry_id: entryId,
            date: bankTxn.effective_date,
            description: `Payment match - ${bankTxn.description}`,
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
        match.cc_txn_ids.forEach(id => matchedTxnIds.add(id));
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
            const ccTxns: Transaction[] = [];
            for (const id of match.cc_txn_ids) {
                const ct = txnById.get(id);
                if (ct) {
                    ccTxns.push(ct);
                } else {
                    warnings.push(`Match references unknown CC txn: ${id}`);
                }
            }

            if (ccTxns.length === 0) continue;

            const { entry, warnings: entryWarnings } = generateMatchedPaymentEntry(
                match, txn, ccTxns, nextEntryId, options.accounts
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
