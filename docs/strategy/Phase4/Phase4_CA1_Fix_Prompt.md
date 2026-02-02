# Phase 4 Fix Prompt: CA-1 Missing RECV Keyword

**Issue:** CA-1
**Severity:** Major
**Source:** D.1 Chief Architect PR Review
**Branch:** `phase-4/matcher-ledger`

---

## Problem

IK D6.5 requires three payment keywords: **PAYMENT**, **AUTOPAY**, **RECV**.

The current implementation only includes PAYMENT and AUTOPAY:

```typescript
// packages/shared/src/constants.ts:66-72
export const DEFAULT_PAYMENT_PATTERNS = [
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'DISCOVER', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'BOA', accounts: [] },
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'CITI', accounts: [] },
] as const;
```

**Impact:** CC transactions with "RECV" in the description (e.g., "ACH RECV AMEX") would NOT be recognized as payment patterns, causing unmatched reconciliation transactions.

---

## Fix Required

Update `packages/shared/src/constants.ts` lines 66-72:

```typescript
export const DEFAULT_PAYMENT_PATTERNS = [
    { keywords: ['PAYMENT', 'AUTOPAY', 'RECV'], pattern: 'AMEX', accounts: [] },
    { keywords: ['PAYMENT', 'RECV'], pattern: 'CHASE CARD', accounts: [] },
    { keywords: ['PAYMENT', 'RECV'], pattern: 'DISCOVER', accounts: [] },
    { keywords: ['PAYMENT', 'RECV'], pattern: 'BOA', accounts: [] },
    { keywords: ['PAYMENT', 'AUTOPAY', 'RECV'], pattern: 'CITI', accounts: [] },
] as const;
```

**Logic:**
- AMEX and CITI support AUTOPAY, so they get all three keywords
- Chase, Discover, BoA typically don't use AUTOPAY terminology, so they get PAYMENT + RECV

---

## Test Requirements

Add test case to `packages/core/src/matcher/__tests__/match-payments.test.ts`:

```typescript
it('matches on RECV keyword (IK D6.5)', () => {
    const bankTxn = makeTxn({
        txn_id: 'bank1',
        account_id: 1001, // checking
        signed_amount: '-500.00',
        description: 'ACH RECV AMEX',
        effective_date: '2024-01-15',
    });
    const ccTxn = makeTxn({
        txn_id: 'cc1',
        account_id: 2001, // CC
        signed_amount: '500.00',
        description: 'PAYMENT RECEIVED',
        effective_date: '2024-01-15',
    });

    const result = matchPayments({
        transactions: [bankTxn, ccTxn],
        accounts,
        patterns: [
            { keywords: ['PAYMENT', 'AUTOPAY', 'RECV'], pattern: 'AMEX', accounts: [2001] },
        ],
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].bankTxnId).toBe('bank1');
    expect(result.matches[0].ccTxnId).toBe('cc1');
});
```

---

## Verification

After fix:

```bash
pnpm test --filter @finance-engine/core
```

Expected: All 195+ tests pass (existing + new RECV test).

---

## References

- **IK D6.5:** "Require payment keyword (PAYMENT, AUTOPAY, RECV) for generic pattern matches."
- **PRD §10.3:** Payment matching logic
- **D.1 Review:** `docs/strategy/Phase4/Phase4_PR_Review_Chief_Architect.md`
