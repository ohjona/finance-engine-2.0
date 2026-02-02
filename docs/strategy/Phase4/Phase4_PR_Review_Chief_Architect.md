# D.1: Chief Architect PR Review — Phase 4

**Role:** Chief Architect
**Model:** Claude Opus 4.5
**Date:** 2026-02-01
**Review Type:** PR First-Pass (D.1)

**PR:** https://github.com/ohjona/finance-engine-2.0/pull/4
**Branch:** `phase-4/matcher-ledger`

---

## Quick Checks

| Check | Result |
|-------|--------|
| `pnpm install` | ✅ Pass |
| `pnpm build` | ✅ Pass |
| `pnpm test` | ✅ 195 tests pass |
| No `node:` imports in core | ✅ Pass |
| No `console.*` calls in core | ✅ Pass |
| No `parseFloat/parseInt/Number()` on amounts | ✅ Pass |
| Phase 1-3 regression | ✅ Pass |

---

## Scope Compliance

| Check | Status |
|-------|--------|
| All matcher components implemented | ✅ |
| All ledger components implemented | ✅ |
| No scope creep (no CLI, no Excel output, no YAML I/O) | ✅ |
| No mutation of input Transactions (pure functions) | ✅ |
| Phase 1-3 code not modified without justification | ✅ |

**Files Changed:** 26 files, +4,301 lines

New modules created (no Phase 1-3 modifications):
- `packages/core/src/matcher/` (5 files)
- `packages/core/src/ledger/` (4 files)
- `packages/shared/src/schemas.ts` (+134 lines)
- `packages/shared/src/constants.ts` (+30 lines)
- Test files (6 files, 977 lines)

---

## Matcher Verification

### matchPayments()

| Check | Source | Status |
|-------|--------|--------|
| Filters bank txns: checking accounts + negative amounts | PRD §10.3 | ✅ |
| Filters CC txns: CC accounts + positive amounts | PRD §10.3 | ✅ |
| Requires BOTH keyword AND pattern match | PRD §10.3, IK D6.5 | ✅ |
| Keywords include PAYMENT, AUTOPAY | PRD §10.3 | ✅ |
| **RECV keyword included?** | IK D6.5 | ❌ **MISSING** |
| Matched CC txn removed from candidate pool | PRD §10.3 | ✅ |
| No-match flagged with 'payment_pattern_no_cc_match' | PRD §10.3, IK D6.6 | ✅ |
| Zero-amount transactions skipped | IK D6.9 | ✅ |
| Does NOT mutate input transactions | Architecture | ✅ |
| Returns matches + review info as data | CA decision | ✅ |

**Code Evidence (match-payments.ts:91-98):**
```typescript
const hasKeyword = pattern.keywords.some(kw =>
    desc.includes(kw.toUpperCase())
);
const hasPattern = desc.includes(pattern.pattern.toUpperCase());

if (!hasKeyword || !hasPattern) continue;
```

### findBestMatch()

| Check | Source | Status |
|-------|--------|--------|
| Date tolerance: ±5 days | IK D6.1 | ✅ |
| Amount tolerance: $0.01 | IK D6.2 | ✅ |
| Amount comparison uses Decimal, not floating point | Architecture | ✅ |
| Single candidate → returned | PRD §10.3 | ✅ |
| Multiple candidates, different dates → closest wins | PRD §10.3 | ✅ |
| Multiple candidates, same date distance → ambiguous, flagged | IK D6.3 | ✅ |
| No candidates → returns null | PRD §10.3 | ✅ |

**Code Evidence (find-best-match.ts:37-39):**
```typescript
const ccAmount = new Decimal(ccTxn.signed_amount).abs();
if (bankAmount.minus(ccAmount).abs().greaterThan(amountTolerance)) continue;
```

### Payment Patterns

| Check | Status |
|-------|--------|
| Amex pattern defined | ✅ |
| Chase Card pattern defined | ✅ |
| Discover pattern defined | ✅ |
| BoA pattern defined | ✅ |
| Citi pattern defined | ✅ |
| Patterns are configurable (empty accounts array by default) | ✅ |

**Current Definition (constants.ts:66-72):**
```typescript
export const DEFAULT_PAYMENT_PATTERNS = [
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'DISCOVER', accounts: [] },
    { keywords: ['PAYMENT'], pattern: 'BOA', accounts: [] },
    { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'CITI', accounts: [] },
] as const;
```

**Note:** Account IDs are empty by default — caller must provide actual account mappings. This is correct per headless core design.

---

## Ledger Verification

### generateJournal() — Transaction Type Routing

| Transaction Type | DR Account | CR Account | Source | Status |
|-----------------|-----------|-----------|--------|--------|
| Expense on CC (negative on CC) | Expense (category_id) | CC account | Appendix C | ✅ |
| Expense on checking (negative on checking) | Expense (category_id) | Checking account | Implied | ✅ |
| CC payment — matched | CC account | Checking account | §10.5, Appendix C | ✅ |
| Refund on CC (positive on CC, expense category) | CC account | Expense (category_id) | §10.4, D7.1 | ✅ |
| Reward/Cashback on CC (positive on CC, income category) | CC account | Income (category_id) | D7.2 | ✅ |
| Income on checking (positive on checking) | Checking account | Income (category_id) | Appendix C | ✅ |
| Uncategorized (4999) | 4999 | Source account | PRD | ✅ |

**Code Evidence (generate.ts:119-134) — CC Expense:**
```typescript
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
```

### Matched Transaction Handling

| Check | Source | Status |
|-------|--------|--------|
| Matched pair produces ONE journal entry, not two | PRD §10.5 | ✅ |
| Bank withdrawal side → becomes part of matched entry | Logic | ✅ |
| CC payment received side → excluded from journal generation | Logic | ✅ |
| Matched txns excluded from category analysis | IK D6.7 | ✅ |

**Code Evidence (generate.ts:230-234):**
```typescript
// Skip CC side of matched payments (bank side generates the entry)
if (matchedTxnIds.has(txn.txn_id) && !matchByBankTxnId.has(txn.txn_id)) {
    continue;
}
```

### Account Name Resolution

| Check | Source | Status |
|-------|--------|--------|
| generateJournal() receives account chart as parameter | Headless core | ✅ |
| Each journal line has correct account_name | PRD §7.2 | ✅ |
| Unknown account_id flagged (not crashed) | IK D7.8 | ✅ |

### validateJournal()

| Check | Source | Status |
|-------|--------|--------|
| Uses Decimal for summing, not native number | Architecture | ✅ |
| Comparison is exact equality (not "close enough") | IK D7.5 | ✅ |
| Returns clear pass/fail with amounts on failure | Design | ✅ |
| Empty journal passes (edge case) | Design | ✅ |

**Code Evidence (validate.ts:37):**
```typescript
const valid = debitTotal.equals(creditTotal);
```

### JournalEntry Shape

| Check | Source | Status |
|-------|--------|--------|
| entry_id: sequential number | PRD §7.2 | ✅ |
| date: effective_date | PRD §7.2 | ✅ |
| description: transaction description | PRD §7.2 | ✅ |
| lines: debit/credit with account_id, account_name, txn_id | PRD §7.2 | ✅ |
| Each line has txn_id for traceability | IK D7.9 | ✅ |
| debit and credit are mutually exclusive (one null) | PRD §7.2 | ✅ |

---

## Test Coverage

| Component | Tests | Status |
|-----------|-------|--------|
| matchPayments | 10 | ✅ |
| findBestMatch | 12 | ✅ |
| daysBetween | 9 | ✅ |
| generateJournal | 14 | ✅ |
| validateJournal | 5 | ✅ |
| Integration (end-to-end) | 1 | ✅ |
| **Total** | **51** | ✅ |

**Coverage Analysis:**
- Keyword requirement: ✅ Tested (3 sub-tests)
- Ambiguous matches: ✅ Tested
- Zero-amount skip: ✅ Tested
- Pure function (no mutation): ✅ Tested
- Date/amount tolerance boundaries: ✅ Tested
- All transaction types: ✅ Tested (5 types)
- Matched pair → single entry: ✅ Tested
- Refund vs reward distinction: ✅ Tested
- Decimal precision (no drift): ✅ Tested (100 × $0.01)

---

## Regression

| Check | Status |
|-------|--------|
| Phase 1 utility tests pass | ✅ |
| Phase 2 parser tests pass | ✅ |
| Phase 3 categorizer tests pass | ✅ |
| Phase 1-3 schema tests pass | ✅ |
| Full build succeeds | ✅ |

**Test Breakdown:**
- Core: 195 tests (matcher: 31, ledger: 19, categorizer: 73, parser: 50, utils: 22)
- Integration: 1 test
- Total: 195 tests pass

---

## Issues Found

| # | Issue | Severity | File(s) | IK Reference |
|---|-------|----------|---------|--------------|
| CA-1 | Missing RECV keyword in DEFAULT_PAYMENT_PATTERNS | Major | `packages/shared/src/constants.ts:66-72` | IK D6.5 |

### CA-1: Missing RECV Keyword

**Requirement (IK D6.5):**
> "Require payment keyword (PAYMENT, AUTOPAY, **RECV**) for generic pattern matches."

**Current Implementation:**
```typescript
{ keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [] },
```

**Impact:** CC transactions with "RECV" in the description (e.g., "PAYMENT RECV", "ACH RECV") would NOT be recognized as payment patterns, potentially causing unmatched reconciliation transactions.

**Fix Required:** Add RECV to keywords arrays:
```typescript
{ keywords: ['PAYMENT', 'AUTOPAY', 'RECV'], pattern: 'AMEX', accounts: [] },
{ keywords: ['PAYMENT', 'RECV'], pattern: 'CHASE CARD', accounts: [] },
// etc.
```

---

## Summary

| Category | Status |
|----------|--------|
| Quick Checks | ✅ All pass |
| Architecture | ✅ Compliant |
| Scope | ✅ Clean |
| Matcher Logic | ⚠️ 1 issue (CA-1) |
| Ledger Logic | ✅ All correct |
| Test Coverage | ✅ Comprehensive |
| Regression | ✅ No breaks |

---

## Verdict

**Recommendation:** Needs fix first (CA-1)

The implementation is 99% correct with excellent test coverage and proper architecture. However, CA-1 (missing RECV keyword) is a **documented requirement** in IK D6.5 and should be fixed before Review Board.

**Fix effort:** ~5 minutes (add RECV to keywords arrays in constants.ts)

---

**Review signed by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-01
- **Review Type:** PR First-Pass (D.1)
