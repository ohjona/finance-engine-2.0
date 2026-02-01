# D.5: Codex Verification — Phase 1 Foundation

**Role:** Adversarial Reviewer (Verification)  
**Model:** Codex  
**Date:** 2026-02-01  
**Review Type:** Fix Verification (D.5)

---

## Issue-by-Issue Verification

### X-1: Excel serial dates shift by 1 day in non-UTC time zones

**Original issue:** Excel serials were converted in UTC but formatted with local getters, producing off-by-one dates in Western timezones.  
**Consolidation status:** **B-1 (Blocking)**  
**Antigravity’s fix:** Use UTC getters in `formatIsoDate` and create UTC dates for string parsing; add strict test assertion.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (UTC getters + UTC date creation)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/amex.ts:195` uses `getUTCFullYear/getUTCMonth/getUTCDate`
- `packages/core/src/parser/amex.ts:155` uses `Date.UTC` for string dates
- `packages/core/tests/parser/amex.test.ts` asserts exact date for Excel serial

**Verdict:** ✅ Fixed

---

### X-2: Collision suffix overflow (>99) breaks txn_id schema

**Original issue:** `resolveCollisions` emits `-100`, exceeding `-\d{2}` schema.  
**Consolidation status:** **B-2 (Blocking)**  
**Antigravity’s fix:** Throw on overflow when count exceeds 99; add test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (guard at >99)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/utils/txn-id.ts:67` throws on `> 99`
- `packages/core/tests/utils/txn-id.test.ts` adds overflow test

**Verdict:** ✅ Fixed

---

### X-3: Warnings conflate invalid amounts with invalid dates

**Original issue:** Skipped rows due to invalid amount still produce “invalid or missing dates” warning.  
**Consolidation status:** **S-5 (Deferred)**  
**Antigravity’s fix:** Split skip counters and emit per-reason warnings; add test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (separate warnings)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/amex.ts:123` now emits per-reason warnings
- `packages/core/tests/parser/amex.test.ts` asserts distinct warnings

**Verdict:** ✅ Fixed

---

### X-4: Date objects skipped (XLSX `cellDates`)

**Original issue:** `parseAmexDate` ignored `Date` objects, silently dropping valid rows.  
**Consolidation status:** **S-2 (Should Fix)**  
**Antigravity’s fix:** Added `instanceof Date` handling and enabled `cellDates` in XLSX.read; added test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/amex.ts:34` uses `cellDates: true`
- `packages/core/src/parser/amex.ts:143` handles `Date` instances
- `packages/core/tests/parser/amex.test.ts` adds Date-typed cell test

**Verdict:** ✅ Fixed

---

### X-5: Amounts with leading/trailing whitespace are not trimmed

**Original issue:** Amount strings like `" 10.00 "` failed Decimal parsing and got dropped.  
**Consolidation status:** **S-4 (Should Fix)**  
**Antigravity’s fix:** Trim amount string before parsing; add test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/amex.ts:77` uses `.trim()` on amount string
- `packages/core/tests/parser/amex.test.ts` adds whitespace amount test

**Verdict:** ✅ Fixed

---

## Issues Dismissed by Consolidation

| Your Issue ID | Dismissal Reason | Do You Accept? | Comment |
|---|---|---|---|
| — | — | — | No D.2c issues were dismissed. |

---

## Regression Check

```
# Full test suite
pnpm test

# Full build
pnpm build

# Architecture constraints
grep -rn "from 'node:" packages/core/src/ && echo "❌ FAIL" || echo "✓ Pass"
grep -rn "console\." packages/core/src/ && echo "❌ FAIL" || echo "✓ Pass"
```

| Check | Status |
|---|---|
| All tests pass | ❌ Not run (not executed in this environment) |
| Build succeeds | ❌ Not run (not executed in this environment) |
| Architecture constraints hold | ❌ Not run (not executed in this environment) |
| No new regressions | ⚠️ Unverified (tests not run) |

---

## New Issues

| # | New Issue | Introduced By Fix | Severity |
|---|---|---|---|
| N-1 | None | — | — |

---

## Verdict

**Recommendation:** **Approve for merge** (pending test/build execution)

**Remaining required items:**
- Run `pnpm test`, `pnpm build`, and architecture greps to complete regression validation.

---

**Review signed by:**
- **Role:** Adversarial Reviewer (Verification)
- **Model:** Codex
- **Date:** 2026-02-01
- **Review Type:** Fix Verification (D.5)

