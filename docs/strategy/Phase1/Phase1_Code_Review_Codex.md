# D.2c: Adversarial Code Review (Codex)

**Role:** Adversarial Reviewer  
**Model:** Codex  
**Date:** 2026-02-01  
**Review Type:** Code Review (D.2)

---

## Issues Found

| # | Issue | Attack Vector | Impact | Severity |
|---|-------|---------------|--------|----------|
| X-1 | Excel serial dates can shift by 1 day in non-UTC time zones because serials are converted to UTC but formatted with local getters (`getFullYear/getMonth/getDate`). | Input fuzzing: Excel serial date rows | Wrong `effective_date/txn_date/post_date` for entire file; cascades into wrong month bucketing, txn_id, and downstream matching. | **Critical** |
| X-2 | `resolveCollisions` allows suffixes beyond two digits (e.g., `-100`), which violates the txn_id schema regex (`-\d{2}`) and breaks validation after 99 collisions. | Hash/ID edge case: 100+ collisions | Schema validation fails, manifest + downstream pipelines reject transactions. | **Major** |
| X-3 | `parseAmex` warning message claims “invalid or missing dates” even when rows were skipped for **invalid amounts**. | Input fuzzing: non‑numeric amount | Misleading warnings; operators chase wrong issue, false QA signals. | **Minor** |
| X-4 | `parseAmexDate` ignores `Date` objects (possible output when XLSX is configured with `cellDates`), causing valid rows to be skipped. | Input fuzzing: Date-typed cells | Silent data loss when upstream XLSX parsing yields Date objects. | **Major** |
| X-5 | Amounts with leading/trailing whitespace are not trimmed before Decimal parsing. Some exports include padded amounts; these rows will be skipped as “invalid amount.” | Input fuzzing: whitespace amounts | Dropped transactions with a misleading warning; hard to diagnose. | **Minor** |

---

## Attack Matrix (Key Vectors)

### 1) Input Fuzzing (Parsers)

| Input | Expected Behavior | Handled? | Test Exists? |
|---|---|---|---|
| Empty ArrayBuffer | Return empty array or structured error | ❌ (XLSX.read throws) | ❌ |
| Valid XLSX, no data rows (only headers) | Return empty array | ✅ | ✅ |
| Valid XLSX, wrong columns (no “Amount”) | Throw descriptive error | ✅ (throws) | ✅ |
| Row with empty date | Skip row | ✅ | ✅ |
| Row with unparseable date string | Skip row + warning | ✅ (generic) | ✅ (generic) |
| Row with non-numeric amount (“N/A”) | Skip row + warning | ✅ | ❌ |
| Row with extremely large amount | Handle without overflow | ✅ (Decimal.js) | ❌ |
| Amount with leading/trailing whitespace | Parse correctly | ❌ (no trim) | ❌ |
| Description with Unicode characters | Preserve raw + normalize | ✅ | ❌ |
| Description empty string | Handle gracefully | ✅ | ✅ |
| File not actually XLSX | Throw descriptive message | ❌ (library error) | ❌ |
| Row with amount “0” or “-0” | Handle correctly | ? (Decimal.js behavior) | ❌ |

### 2) Hash/ID Edge Cases

| Scenario | Expected | Handled? | Test? |
|---|---|---|---|
| Two txns identical except account_id | Different IDs | ✅ | ✅ |
| Description with pipe `|` | Hash still deterministic | ✅ | ❌ |
| Amount `-0.00` vs `0.00` | Same or different? (document) | ? | ❌ |
| Very long description (>10K) | Doesn’t crash | ✅ (hash input) | ❌ |
| Description with null bytes | Doesn’t crash | ✅ (JS strings) | ❌ |
| 100+ collisions on same base ID | Suffix format still works | ❌ (suffix >2 digits) | ❌ |

### 3) resolveCollisions Attack

| Scenario | Expected | Actual |
|---|---|---|
| Empty array | Returns empty | ✅ |
| All unique IDs | Returns unchanged (new array) | ✅ |
| Two identical IDs | Second gets -02 | ✅ |
| Three identical IDs | Second -02, third -03 | ✅ |
| Original mutated? | Input array unchanged | ✅ |
| Suffix appended to 16-char ID | Schema accepts 16 + “-NN” | ✅ (until 99) |

### 4) normalizeDescription Attack

| Input | Expected Output | Actual |
|---|---|---|
| `"UBER *TRIP HELP.UBER.COM"` | `"UBER TRIP HELP.UBER.COM"` | ✅ |
| `"  spaces  everywhere  "` | `"SPACES EVERYWHERE"` | ✅ |
| `"###MULTIPLE###HASHES###"` | `"MULTIPLE HASHES"` | ✅ |
| `""` | `""` | ✅ |
| `"already UPPER"` | `"ALREADY UPPER"` | ✅ |
| `"café résumé"` | `"CAFÉ RÉSUMÉ"` | ✅ |
| `"\t\n\r"` | `""` | ✅ |

### 5) detectParser Attack

| Filename | Expected | Actual |
|---|---|---|
| `"amex_2122_202601.xlsx"` | Match amex, account 2122 | ✅ |
| `"amex_2122_202601.XLSX"` | Match (case-insensitive) | ✅ |
| `"AMEX_2122_202601.xlsx"` | Match | ✅ |
| `".amex_2122_202601.xlsx"` | Skip (hidden) | ✅ |
| `"~amex_2122_202601.xlsx"` | Skip (temp) | ✅ |
| `"amex_21_202601.xlsx"` | Reject | ✅ |
| `"amex_21220_202601.xlsx"` | Reject | ✅ |
| `"amex_2122_202601.csv"` | Reject | ✅ |
| `"chase_6917_202601.csv"` | No parser registered | ✅ |
| `"unknown_1234_202601.xlsx"` | No match | ✅ |

---

## Test Quality Audit (Representative)

| Test | Claims to Test | Actually Tests? | Weakness |
|---|---|---|---|
| `parseAmex` “handles Excel serial dates” | Proper Excel serial parsing | ❌ | Only asserts date *format* (regex), not correct day. Time zone off‑by‑one would pass. (`packages/core/tests/parser/amex.test.ts`) |
| `parseAmex` “skips rows with invalid dates and adds warning” | Accurate warning + skip logic | ❌ | Warning message doesn’t distinguish invalid **amount** vs invalid date; test doesn’t cover invalid amount. (`packages/core/tests/parser/amex.test.ts`) |
| `resolveCollisions` “adds suffix” | Correct suffix formatting | ✅ | No test for collisions >= 100; schema allows only 2 digits. (`packages/core/tests/utils/txn-id.test.ts`) |
| `generateTxnId` “normalizes trailing zeros” | Amount normalization spec | ⚠️ | Only tests `-23.45` vs `-23.450`. No test ensuring cents aren’t dropped (e.g., `-23.40` vs `-23.00`). (`packages/core/tests/utils/txn-id.test.ts`) |
| `detectParser` hidden/temp files | Hidden/temp filtering | ✅ | No test for `.amex_...` or `~amex_...` but current logic covers. (`packages/core/tests/parser/detect.test.ts`) |

---

## Cross-Cutting Concerns

| Concern | Status |
|---|---|
| `Decimal.toFixed()` behavior for txn_id hashing | **Unverified** (no tests proving fractional cents preserved) |
| `xlsx` throws on corrupt file | **Not caught in core**; CLI catches but error message not controlled |
| Locale dependence (date handling) | **Yes** for Excel serial dates (local getters) |
| CLI handles missing file | ✅ (try/catch around readFileSync) |
| Concurrency/race conditions | Not applicable in Phase 1 (pure functions) |

---

## Top 3 Concerns

1. **Excel serial dates are time-zone sensitive** → off-by-one day in many locales. (X-1)
2. **Collision suffix >99 breaks schema** → validation failure for dense duplicates. (X-2)
3. **Date-object cells skipped silently** → potential data loss for XLSX configs. (X-4)

---

## What’s the Architect Not Seeing?

- The “obvious” Excel edge cases: time-zone conversions and Date-typed cells are silent correctness killers. This code assumes serials are always numeric strings and that local time zone doesn’t matter.
- The collision suffix format is overconfident: the schema caps to two digits but `resolveCollisions` doesn’t enforce it or report overflow.
- Warnings are treated as a single “dates” bucket, hiding non-date failures (invalid amount, parsing errors). That undermines debugging and QA in real runs.

---

## Verdict

**Recommendation:** **Request Changes**

---

## References (Files/Lines)

- `packages/core/src/parser/amex.ts:31` (XLSX read + date handling + warnings)
- `packages/core/src/parser/amex.ts:153` (Excel serial conversion)
- `packages/core/src/parser/amex.ts:170` (local date formatting)
- `packages/core/src/utils/txn-id.ts:57` (collision suffix width)
- `packages/core/tests/parser/amex.test.ts` (insufficient Excel serial verification)

