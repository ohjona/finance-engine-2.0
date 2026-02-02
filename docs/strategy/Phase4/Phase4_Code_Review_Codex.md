# Phase 4 Adversarial Code Review (Codex) — D.2c

**Role:** Adversarial Reviewer  
**Scope:** Payment matching + double-entry journal generation (Phase 4)  
**Date:** 2026-02-02  

---

## Issues Found

| # | Issue | Attack Vector | Impact | Severity |
|---|-------|---------------|--------|----------|
| X-1 | **Greedy bank-order matching can bind the wrong bank withdrawal to the only CC payment** | Two bank withdrawals within tolerance for a single CC payment; input order determines which bank gets the match | Wrong bank transaction marked as matched; the real payment is left unmatched and silently becomes a normal expense | **Major** |
| X-2 | **No partial-payment detection (D6.4) — misclassified as “no CC export”** | Bank desc matches a pattern; CC payment exists but amount is a partial (or off by >$0.01) | Review reason incorrectly blames missing export; partial-payment review path never triggered | **Major** |
| X-3 | **Tie-break ignores amount delta — exact vs. $0.01 tolerance becomes “ambiguous”** | Two CC candidates same date distance; one exact amount, one within tolerance | False ambiguity; match suppressed even though exact match exists | **Major** |
| X-4 | **Pattern matching uses raw substring; short patterns like “BOA” can false-positive** | “PAYMENT BOAT RENTAL” (contains “BOA” + keyword) | Wrong CC match and incorrect ledger entry | **Major** |
| X-5 | **Pattern loop breaks on first ambiguous/no-candidate — later patterns never evaluated** | Description contains multiple patterns (e.g., “AMEX CHASE PAYMENT”) | Missed valid match or incorrect review flag | **Minor** |
| X-6 | **Matched-payment entry trusts `match.amount` without cross-checking txns** | Crafted/incorrect match object (amount ≠ bank/cc txn amounts) | Ledger entry amount can be wrong while still balancing | **Major** |

---

## Findings (by severity)

### 1) Greedy bank-order matching binds wrong bank txn
- **Where:** `packages/core/src/matcher/match-payments.ts:64-132`
- **Why:** The algorithm walks bank transactions in input order and permanently reserves a CC txn (`matchedCcTxnIds`) as soon as a match is found. There is no global reconciliation to choose the closest bank transaction when a CC payment can match multiple bank withdrawals.
- **Concrete attack:**
  - Bank: -$500 on Jan 10 and -$500 on Jan 20 (both pattern-matching).  
  - CC: +$500 on Jan 15.  
  - If input order is Jan 20 first, the match binds to Jan 20 even though Jan 10 is closer. No ambiguity is flagged.
- **Impact:** Wrong match → wrong bank-side entry; the actual payment is left unmatched and may be posted as a normal expense.

### 2) Partial-payment handling is missing
- **Where:** `packages/core/src/matcher/find-best-match.ts:37-45` + `packages/core/src/matcher/match-payments.ts:142-149`
- **Why:** Candidates with amount mismatch are discarded before any review reason is attached. A bank txn with a valid payment pattern and a real CC payment of a different amount is treated as “no candidate,” not “partial payment.”
- **Impact:** D6.4 violated; user is told CC export is missing when it’s actually a partial payment. Review workflow becomes misleading.

### 3) No tie-break on amount delta (exact vs tolerance)
- **Where:** `packages/core/src/matcher/find-best-match.ts:58-64`
- **Why:** When two candidates have the same date distance, the matcher returns ambiguous without considering which amount is closer (or exact). If one candidate is exact and the other is $0.01 off, it still flags ambiguity.
- **Impact:** False “ambiguous” → no match → matched payment missing from journal.

### 4) Substring-only payment pattern matching is too permissive
- **Where:** `packages/core/src/matcher/match-payments.ts:88-98`
- **Why:** `desc.includes(pattern)` with short patterns like “BOA” is vulnerable to word-fragment matches (“BOAT”, “ABOARD”). Keyword requirement doesn’t protect against this if the description includes “PAYMENT”.
- **Impact:** False match attempts → wrong CC matching + wrong double-entry.

### 5) Pattern loop stops early on ambiguous/no-candidate
- **Where:** `packages/core/src/matcher/match-payments.ts:133-150`
- **Why:** On ambiguity or no candidates, the code breaks out of the pattern loop and doesn’t evaluate other patterns that may match the same description. This is especially risky if patterns overlap or are noisy.
- **Impact:** Missed match or wrong review reason.

### 6) Matched-payment amount is not validated against transactions
- **Where:** `packages/core/src/ledger/generate.ts:21-63`
- **Why:** The entry uses `match.amount` without checking it equals `bankTxn`/`ccTxn` absolute amounts. A malformed match object (or bug upstream) can inject a bad amount and still pass validation.
- **Impact:** Journal entry balances but is wrong; silent corruption risk.

---

## Attack Vector Responses (key points)

- **Date tolerance boundaries:** `findBestMatch()` uses `>` and `daysBetween()` so exact 5 days **matches** (inclusive). (`packages/core/src/matcher/find-best-match.ts:41-43`)
- **Amount tolerance boundaries:** Amount difference uses `greaterThan()`, so **≤ $0.01 matches**. (`packages/core/src/matcher/find-best-match.ts:37-39`)
- **Ambiguous resolution:** Ties on date distance are flagged ambiguous even when one amount is exact. (`packages/core/src/matcher/find-best-match.ts:61-63`)
- **Double-match prevention:** CC txns are single-use via `matchedCcTxnIds`, but greedy order can mis-bind matches. (`packages/core/src/matcher/match-payments.ts:77-132`)
- **Matched payment journal:** CC side is skipped in generateJournal, so matched payments produce one entry (correct). (`packages/core/src/ledger/generate.ts:240-259`)

---

## Test Quality Audit

| Test | Claims to Test | Actually Tests? | Weakness |
|------|---------------|----------------|----------|
| `find-best-match.test.ts` | Date/amount tolerance, ambiguity | ✅ | No test for exact-amount vs tolerance tie on same date. |
| `match-payments.test.ts` | Ambiguity/no-candidate/keywords | ✅ | No test for partial payments (D6.4) or greedy order with two bank candidates. |
| `generate.test.ts` | Refund vs reward vs matched payment | ✅ | No test for malformed match amount; no test for transfer (D7.7) or special account category. |
| Integration matcher-ledger | End-to-end balance | ✅ | Doesn’t assert correct match selection when multiple bank withdrawals compete for one CC payment. |

Missing tests (high value):
- Partial payment detection (pattern match + CC candidate with amount mismatch → `partial_payment` review reason).
- Greedy ordering scenario with multiple bank candidates for the same CC payment.
- Tie-breaker on amount delta when date distance equals.
- False-positive pattern match (“BOA” inside unrelated word).

---

## Top 3 Concerns

1. Greedy bank-order matching can bind the wrong bank withdrawal to the only CC payment, silently corrupting the ledger.
2. Partial payments are not detected and are mislabeled as missing CC exports.
3. Ties ignore amount delta, causing false ambiguity and missing matches even when an exact match exists.

---

## Verdict

**Recommendation:** Request Changes

---

**Review signed by:**
- **Role:** Adversarial Reviewer
- **Model:** Codex
- **Date:** 2026-02-02
- **Review Type:** Code Review (D.2)
