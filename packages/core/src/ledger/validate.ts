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
