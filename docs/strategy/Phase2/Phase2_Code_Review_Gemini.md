# Phase 2 Code Review: Bank Parsers (Gemini)

**Reviewer:** Gemini (Peer Reviewer)
**Date:** 2026-01-31
**Verdict:** **Approve** (with Fixes Applied)

---

## Executive Summary

Phase 2 implements 5 new bank parsers (Chase, BoA Checking, BoA Credit, Fidelity, Discover) and expands the detection registry. The implementation is highly consistent, leveraging shared utilities for date parsing and transaction ID generation.

**Key Achievements:**
- **Consistency:** All parsers follow the established pattern (imports -> constants -> parser fn -> validation -> loop).
- **Robustness:** BoA Checking parser correctly handles summary rows and comma-formatted amounts.
- **Accuracy:** Discover parser handles HTML-in-XLS format and date fallbacks correctly (after fix).
- **Date Handling:** Centralized `date-parse.ts` utility ensures consistent UTC handling across all parsers.

---

## 1. Cross-Parser Consistency

| Aspect | Consistent? | Notes |
|--------|-------------|-------|
| Function signature | ✅ | `(data, accountId, sourceFile) => ParseResult` |
| Return type | ✅ | `ParseResult` with transactions/warnings |
| Header validation | ✅ | All parsers verify required columns using constants. |
| Date parsing | ✅ | All use `parseDateValue` / `formatIsoDate` from utils. |
| Amount parsing | ✅ | All handle comma stripping and Decimal conversion. |
| Validation | ✅ | All use `TransactionSchema.parse()` for runtime safety. |

**Refactoring Applied:**
- Extracted column expectations to constants (`CHASE_CHECKING_EXPECTED_COLUMNS`, `FIDELITY_EXPECTED_COLUMNS`, etc.) in all files to match `boa-checking.ts` style.

---

## 2. Code Quality

| Parser | Rating | Notes |
|--------|--------|-------|
| `chase-checking.ts` | Good | Clean implementation. |
| `boa-checking.ts` | Excellent | "Smart header detection" logic is robust and well-tested. |
| `boa-credit.ts` | Good | Standard CSV implementation. |
| `fidelity.ts` | Good | Correctly handles `YYYY-MM-DD` date format. |
| `discover.ts` | Good | Handles HTML/XLS complexity. |

**Fixes Applied:**
- **Discover Date Logic:** Fixed `effective_date` logic to prioritize `Trans. Date` over `Post Date` per IK D2.6.
- **Discover Constants:** Enforced usage of `DISCOVER_EXPECTED_COLUMNS` constant.

---

## 3. Code Reuse

- **Date Parsing:** `packages/core/src/utils/date-parse.ts` is a strong addition. It centralizes logic for MDY, ISO, and Excel Serial formats, ensuring consistent UTC handling.
- **CSV Parsing:** `xlsx` library is used consistently, avoiding "split by comma" pitfalls.

---

## 4. Test Quality

- **Coverage:** All parsers have dedicated test suites covering happy paths and error cases.
- **Edge Cases:**
    - BoA Checking: Tested summary rows, empty rows, "Beginning balance".
    - Discover: Tested HTML table parsing and date fallback.
    - Date Utils: Tested rounding of fractional Excel serials.
- **Fixes Applied:** Updated `discover.test.ts` to use realistic mock data (empty strings vs missing keys) to pass strict header validation.

---

## 5. API Design

- `detectParser` registry is clean and easily extensible.
- `extractAccountId` regex is robust for the new filename patterns.

---

## Verdict

The implementation meets all requirements of PRD v2.2 and IK v1.2. Issues identified during review (Discover date logic, hardcoded constants) have been fixed and verified with tests.

**Status:** Ready for Phase 3.
