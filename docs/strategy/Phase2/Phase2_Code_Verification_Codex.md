# D.5: Codex Verification — Phase 2

**Role:** Adversarial Reviewer (Verification)  
**Model:** Codex  
**Date:** 2026-02-01  
**Review Type:** Fix Verification (D.5)

---

## Issue-by-Issue Verification

### X-1: Filename convention mismatch vs PRD

**Original issue:** `detectParser` only matched `*_checking`/`*_credit` naming, rejecting PRD/legacy `boa_1110_*`, `boa_2110_*`, `chase_1120_*`.  
**Consolidation status:** **Dismissed**  
**Antigravity’s fix:** Added backward-compatible patterns and BoA account‑range disambiguation.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (supports both naming schemes)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/detect.ts:42-55` supports legacy `chase_` + `boa_1xxx/2xxx`
- `packages/core/tests/parser/detect.test.ts` adds backward‑compatibility tests

**Verdict:** ✅ Fixed

---

### X-2: Discover multi-table HTML handling ignored

**Original issue:** Parser always used first table; PRD suggests table_index=1 in Python.  
**Consolidation status:** **Dismissed**  
**Antigravity’s fix:** Scan all sheets for required headers and select the matching table; add multi‑table test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (robust multi‑table detection)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/discover.ts:38-66` scans sheets for required headers
- `packages/core/tests/parser/discover.test.ts` adds multi‑table fixture test

**Verdict:** ✅ Fixed

---

### X-3: BoA Checking header false‑match risk

**Original issue:** Header detection used substring `includes()` and could false‑match summary rows.  
**Consolidation status:** **Dismissed**  
**Antigravity’s fix:** Tightened to exact canonical header matches; added negative test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed (exact match)
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/boa-checking.ts:33-38` uses exact header equality
- `packages/core/tests/parser/boa-checking.test.ts` adds false‑match negative test

**Verdict:** ✅ Fixed

---

### X-4: CSV BOM handling missing

**Original issue:** UTF‑8 BOM in headers caused missing columns.  
**Consolidation status:** **B-4 (Blocking)**  
**Antigravity’s fix:** Added `stripBom` utility and normalized header keys in CSV parsers; added BOM test.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/utils/csv.ts`
- `packages/core/src/parser/chase-checking.ts`, `boa-checking.ts`, `boa-credit.ts`, `fidelity.ts`
- `packages/core/tests/parser/chase-checking.test.ts` BOM case

**Verdict:** ✅ Fixed

---

### X-5: BoA Checking silently skips $0 amount rows

**Original issue:** $0 rows dropped silently.  
**Consolidation status:** **S-1 (Should Fix)**  
**Antigravity’s fix:** Warn + increment skip count on $0 amounts; test added.

**Verification:**
- [x] Code change is correct
- [x] Issue is actually fixed
- [x] No new issues introduced by the fix
- [x] Test added or updated to prevent regression

**Evidence:**
- `packages/core/src/parser/boa-checking.ts:137-141`
- `packages/core/tests/parser/boa-checking.test.ts` $0 warning test

**Verdict:** ✅ Fixed

---

## Issues Dismissed by Consolidation

| Your Issue ID | Dismissal Reason | Do You Accept? | Comment |
|---|---|---|---|
| X-1 | CA approved naming change | **Yes** | Backward‑compatibility added; risk removed. |
| X-2 | table_index considered pseudocode | **Yes** | Now robustly selects correct table by headers. |
| X-3 | false‑match unlikely | **Yes** | Exact header matching + negative test added. |

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

# Phase 1 regression
pnpm test -- packages/core/tests/parser/amex
pnpm test -- packages/core/tests/utils/
pnpm test -- packages/shared/tests/
```

| Check | Status |
|---|---|
| All tests pass | ❌ Not run (not executed in this environment) |
| Build succeeds | ❌ Not run (not executed in this environment) |
| Architecture constraints hold | ❌ Not run (not executed in this environment) |
| Phase 1 tests still pass | ❌ Not run (not executed in this environment) |
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

