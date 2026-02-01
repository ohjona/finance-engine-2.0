# Phase 1 Code Review: Core Architecture & Amex Parser

**Reviewer:** Gemini (Peer Reviewer)
**Date:** 2026-01-31
**Verdict:** **Request Changes**

---

## Executive Summary

Phase 1 successfully establishes the headless core architecture and the "No I/O" constraint in `core`. The monorepo structure, parser registry pattern, and deterministic transaction ID generation are implemented correctly per the PRD and IK.

However, a **critical timezone bug** in Excel date parsing will cause data corruption (off-by-one errors) for users in Western timezones (US). This must be fixed before proceeding. Additionally, runtime validation using the defined Zod schemas is missing in the parser.

---

## 1. Code Quality

| File | Readable? | Idiomatic TS? | Error Handling | Notes |
|------|-----------|---------------|----------------|-------|
| `core/src/parser/amex.ts` | Good | Good | Adequate | **Critical:** Timezone bug in `excelSerialToDate`. Mixed error handling (throws on header, returns warnings on rows). |
| `core/src/utils/txn-id.ts` | Good | Good | N/A | Correctly implements logic from IK D2.12. |
| `core/src/parser/detect.ts` | Good | Good | Good | Clean regex usage. |
| `shared/src/schemas.ts` | Good | Good | N/A | Schemas match PRD/IK specs. |

**Observations:**
- **Timezone Bug:** In `amex.ts`, `excelSerialToDate` constructs a `Date` from UTC milliseconds (`new Date(utcMs)`), but `formatIsoDate` reads local components (`date.getDate()`).
    - *Scenario:* User in New York (UTC-5).
    - *Input:* Serial for `2026-01-15` -> `utcMs` = `2026-01-15T00:00:00Z`.
    - *Local Time:* `2026-01-14T19:00:00-05:00`.
    - *Output:* `formatIsoDate` returns `"2026-01-14"`. **Data Corruption.**
- **Missing Runtime Validation:** `TransactionSchema` is defined but not used. `parseAmex` manually constructs objects and casts them to `Transaction`. If normalization fails or regexes don't match, bad data enters the system.
- **Magic Numbers:** `amex.ts` hardcodes row skip (`6`) and column names.

---

## 2. Test Quality

| Test File | Happy Path | Edge Cases | Error Cases | Assertions |
|-----------|------------|------------|-------------|------------|
| `amex.test.ts` | ✅ | ✅ | ✅ | ⚠️ Weak |
| `txn-id.test.ts` | ✅ | ✅ | N/A | ✅ |
| `detect.test.ts` | ✅ | ✅ | ✅ | ✅ |

**Observations:**
- **Weak Date Assertion:** `amex.test.ts` checks `expect(result.transactions[0].effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)` for Excel dates. This masks the timezone bug. It should assert `toBe('2026-01-15')`.
- **Mocking Strategy:** `createAmexWorkbook` is a great pattern. It avoids binary fixtures in the repo while testing the real parser logic.

---

## 3. API Design

- **ParserFn Signature:** `(data: ArrayBuffer, ...)` correctly enforces the headless constraint.
- **ParseResult:** Including `warnings` and `skippedRows` allows for the "skip and warn" philosophy (IK D8.4).
- **Exports:** Clean re-exports from `core/index.ts`.

---

## 4. Documentation

- **IK References:** Correctly cited in headers (e.g., "Per IK D2.12").
- **Architecture Notes:** "ARCHITECTURAL NOTE: No console.* calls" in `amex.ts` is excellent for enforcement.

---

## 5. Project Configuration

- **ESLint:** `no-console` rule in `core` is a great safety rail.
- **Vitest:** Configured correctly for monorepo coverage.
- **TypeScript:** Strict mode enabled.

---

## Issues Found

| # | Issue | File | Severity | Category | Description |
|---|-------|------|----------|----------|-------------|
| P-1 | **Timezone Off-by-One Error** | `amex.ts` | **Must Fix** | Quality | `excelSerialToDate` creates UTC date; `formatIsoDate` reads local date. Will shift dates by -1 day in US timezones. |
| P-2 | **Missing Runtime Validation** | `amex.ts` | Should Fix | Quality | Parser does not use `TransactionSchema.parse()`. Invalid formats (e.g., date regex) could sneak through. |
| P-3 | **Weak Test Assertion** | `amex.test.ts` | Should Fix | Test | Test for Excel dates checks regex format only, not exact value. Fails to catch P-1. |
| P-4 | Magic Numbers | `amex.ts` | Minor | Quality | Row offset (6) and column names should be constants or config. |

---

## What Would You Change?

1.  **Fix Date Handling:** Use `date-fns` UTC helpers or consistently work in UTC.
    ```typescript
    // In excelSerialToDate:
    // Create date as UTC, then ensure we extract UTC components
    const date = new Date(utcMs);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    ```
2.  **Enforce Validation:**
    ```typescript
    // In parseAmex loop:
    const txn = TransactionSchema.parse({ ... });
    transactions.push(txn);
    ```
3.  **Strict Test:** Update `amex.test.ts` to assert `expect(txn.effective_date).toBe('2026-01-15')` for the Excel serial test case.

---

## Verdict
**Request Changes.** The timezone bug is a blocking data integrity issue.
