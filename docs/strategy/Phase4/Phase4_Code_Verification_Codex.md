# D.5: Codex Verification — Phase 4

**Role:** Adversarial Reviewer (Verification)  
**Model:** Codex  
**Date:** 2026-02-02  

---

## Issue-by-Issue Verification

#### X-1: Greedy bank-order matching can bind wrong bank withdrawal

**Original issue:** Bank-order matching can pair the wrong bank withdrawal with the only CC payment; true payment left unmatched.  
**Consolidation status:** B-2 (Blocking)  
**Antigravity's fix:** Rank bank candidates by potential candidate count before matching.

**Verification:**
- [x] Code change is correct
- [ ] Issue is actually fixed, not papered over
- [ ] No new issues introduced
- [x] Test coverage added

**Notes:** `match-payments.ts` now computes candidate counts and sorts attempts by count. This reduces some greedy failures but does **not** guarantee optimal pairing when candidate counts tie; order can still misbind. This is a partial mitigation, not a full fix.  
**Verdict:** ⚠️ Partially Fixed

---

#### X-2: No partial-payment detection (D6.4)

**Original issue:** Pattern match + CC payment exists but amount mismatch (> $0.01) is flagged as “no CC export” instead of “partial payment.”  
**Consolidation status:** B-3 (Blocking)  
**Antigravity's fix:** “Support 1:N payment matching.”

**Verification:**
- [ ] Code change is correct
- [ ] Issue is actually fixed, not papered over
- [ ] No new issues introduced
- [ ] Test coverage added

**Notes:** The change adds 1:N matching when multiple CC payments sum to the bank amount, but it does **not** detect or label partial payments. If amounts don’t sum to the bank withdrawal, the code still flags `payment_pattern_no_cc_match`. No `partial_payment` reason exists.  
**Verdict:** ❌ Not Fixed

---

#### X-3: Tie-break ignores amount delta

**Original issue:** Same date distance + exact vs $0.01 tolerance → flagged ambiguous.  
**Consolidation status:** B-4 (Blocking)  
**Antigravity's fix:** Tie-break by amount delta when date distances equal.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed, not papered over
- [x] No new issues introduced
- [x] Test coverage added

**Verdict:** ✅ Fixed

---

#### X-4: Short pattern substring false positives (“BOA” in “BOAT”)

**Original issue:** `includes()` on short patterns causes false positives.  
**Consolidation status:** B-5 (Blocking)  
**Antigravity's fix:** Word-boundary matching for short strings.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed, not papered over
- [ ] No new issues introduced
- [x] Test coverage added

**Notes:** Fix is effective for “BOA” vs “BOAT.” However, regex is built from unescaped user input for short strings; a pattern containing regex metacharacters (e.g., `+`, `.`) will alter matching behavior.  
**Verdict:** ⚠️ Partially Fixed

---

#### X-5: Pattern loop breaks on first ambiguous/no-candidate

**Original issue:** Later patterns are not evaluated if an earlier pattern triggers ambiguous/no-candidate.  
**Consolidation status:** S-2 (Deferred)  
**Antigravity's fix:** None (deferred).

**Verification:**
- [ ] Code change is correct
- [ ] Issue is actually fixed, not papered over
- [ ] No new issues introduced
- [ ] Test coverage added

**Verdict:** ❌ Not Fixed (Deferred)

---

#### X-6: Matched-payment amount not validated against txns

**Original issue:** Ledger trusts `match.amount`, allowing malformed matches to corrupt entries.  
**Consolidation status:** B-6 (Blocking)  
**Antigravity's fix:** Validate match amount vs bank/CC sum, throw on mismatch.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed, not papered over
- [x] No new issues introduced
- [x] Test coverage added

**Verdict:** ✅ Fixed

---

## Issues Dismissed by Consolidation

| Your Issue ID | Dismissal Reason | Accept? | Comment |
|---------------|-----------------|---------|---------|
| X-5 | Deferred (S-2) | Yes | Not blocking, but still a known limitation. |

---

## Accounting Spot Check

#### Spot Check 1: Regular CC expense
```
Input: Transaction { account_id: 2122, signed_amount: "-47.23", category_id: 4320 }
Trace: generateJournal() → generateJournalEntry() → sourceType=liability, isInflow=false
Output: DR 4320 $47.23, CR 2122 $47.23
```
Correct? ✅

#### Spot Check 2: Matched CC payment
```
Input pair: bank(-$1234.56, 1120) matched with cc(+$1234.56, 2122)
Trace: generateJournal() builds matchByBankTxnId; skips CC-side txn; calls generateMatchedPaymentEntry()
Output: ONE entry: DR 2122 $1234.56, CR 1120 $1234.56
```
CC-side transaction excluded from standalone entries? ✅  
Correct? ✅

#### Spot Check 3: Refund vs Reward
```
Refund:  Transaction { account_id: 2122, signed_amount: "+50.00", category_id: 4410 }
Reward:  Transaction { account_id: 2122, signed_amount: "+25.00", category_id: 3250 }
Trace: generateJournalEntry() → sourceType=liability, isInflow=true
Refund Output: DR 2122 $50.00, CR 4410 $50.00
Reward Output: DR 2122 $25.00, CR 3250 $25.00
```
Are these correctly distinguished? ✅ (by category account)

---

## Regression Check

```
pnpm test
pnpm build

rg -n "from 'node:" packages/core/src/ && echo "❌ FAIL" || echo "✓ Pass"
rg -n "console\." packages/core/src/ && echo "❌ FAIL" || echo "✓ Pass"

pnpm test -- packages/core/tests/utils/
pnpm test -- packages/core/tests/parser/
pnpm test -- packages/core/tests/categorizer/
pnpm test -- packages/shared/tests/
```

| Check | Status |
|-------|--------|
| All tests pass | ❌ (web/cli packages have no tests, vitest exits 1) |
| Build succeeds | ✅ |
| Architecture constraints hold | ⚠️ `console.` grep hits comments only, but command reports FAIL |
| Phase 1-3 tests still pass | ❌ (pnpm -r test fails due to shared package filter; no tests found) |
| No new regressions | ⚠️ Cannot confirm (test command failures above) |

---

## New Issues

| # | New Issue | Introduced By Fix | Severity |
|---|----------|-------------------|----------|
| N-1 | Regex boundary matching does not escape user-provided short patterns/keywords, so metacharacters change match semantics | B-5 fix | Minor |
| N-2 | Candidate-count ranking reduces greediness but still fails when candidate counts tie (order-dependent) | B-2 fix | Major |
| N-3 | Partial-payment review reason still missing (no `partial_payment` path) | B-3 fix | Major |

---

## Verdict

**Recommendation:** Request further fixes

---

**Review signed by:**
- **Role:** Adversarial Reviewer (Verification)
- **Model:** Codex
- **Date:** 2026-02-02
- **Review Type:** Fix Verification (D.5)
