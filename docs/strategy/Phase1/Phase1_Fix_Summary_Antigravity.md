# Phase 1 Fix Summary: Antigravity

### Summary

| Issue | Status | Commit |
|-------|--------|--------|
| B-1 | ✅ Fixed | `390b2ed`, `04557b6` |
| B-2 | ✅ Fixed | `349f236` |
| S-1 | ✅ Fixed | `390b2ed` |
| S-2 | ✅ Fixed | `390b2ed` |
| S-3 | ✅ Fixed | `04557b6` |
| S-4 | ✅ Fixed | `390b2ed` |
| M-1 | ✅ Fixed | `390b2ed` |
| M-2 | ✅ Fixed | `f240569` |

### Fixes Applied

#### B-1: Timezone Off-by-One in Excel Date Parsing
**Issue:** Excel serial date parsing was creating UTC dates but formatting them using local time getters, causing off-by-one errors in Western timezones.
**Fix:** Switched to using `getUTCDate`, `getUTCMonth`, and `getUTCFullYear` consistently for ISO formatting, and used `Date.UTC` for manual date construction.
**Files changed:**
- `packages/core/src/parser/amex.ts` — Updated `formatIsoDate` and string parsing logic.
- `packages/core/tests/parser/amex.test.ts` — Added strict date assertion to verify fix.
**Commit:** `390b2ed`, `04557b6`

#### B-2: Collision Suffix Overflow (>99 Collisions)
**Issue:** Suffixes could exceed two digits (e.g., `-100`), breaking the `txnId` Zod schema regex.
**Fix:** Added an explicit guard in `resolveCollisions` that throws an error if the collision count for a single ID exceeds 99.
**Files changed:**
- `packages/core/src/utils/txn-id.ts` — Added overflow throw.
- `packages/core/tests/utils/txn-id.test.ts` — Added overflow test case.
**Commit:** `349f236`

#### S-1: Runtime Schema Validation in Parser
**Issue:** Parsers were returning objects that weren't runtime-validated against the Zod schema.
**Fix:** Added `TransactionSchema.parse(txn)` in the parser loop to catch invalid data early.
**Files changed:**
- `packages/core/src/parser/amex.ts` — Added schema validation in loop.
**Commit:** `390b2ed`

#### S-2: Date Object Handling in Parser
**Issue:** The parser only handled numerical serials or strings, potentially failing if `XLSX` returned native `Date` objects.
**Fix:** Added a check for `Date` instances in `parseAmexDate`.
**Files changed:**
- `packages/core/src/parser/amex.ts` — Updated `parseAmexDate`.
**Commit:** `390b2ed`

#### S-4: Amount Whitespace Trimming
**Issue:** Leading/trailing whitespace in amount cells could break `Decimal.js` parsing.
**Fix:** Added `.trim()` to the amount string before conversion.
**Files changed:**
- `packages/core/src/parser/amex.ts` — Updated amount handling.
**Commit:** `390b2ed`

#### M-1/M-2: Named Constants and VERSION
**Issue:** Magic numbers used for header offsets and `version` export was lowercase.
**Fix:** Extracted `AMEX_HEADER_OFFSET` and `AMEX_EXPECTED_COLUMNS` as named constants; renamed `version` to `VERSION`.
**Files changed:**
- `packages/core/src/parser/amex.ts`
- `packages/web/src/index.ts`
**Commit:** `390b2ed`, `f240569`

### Issues Deferred
None. All blocking and high-priority non-blocking issues were addressed.

### Verification

```bash
# All tests pass (including in non-UTC timezone)
TZ="America/New_York" pnpm test

# Build succeeds
pnpm build

# Architecture constraints hold
pnpm verify:core-constraints

# Specific checks for fixed issues
grep -n "getUTCDate\|getUTCMonth\|getUTCFullYear" packages/core/src/parser/amex.ts # Found (L186-188)
grep -n "throw.*Collision overflow" packages/core/src/utils/txn-id.ts              # Found (L69)
```

**Ready for D.5: Codex Verification**
