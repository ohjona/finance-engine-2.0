# D.2c: Adversarial Code Review (Codex) — Phase 2

**Role:** Adversarial Reviewer  
**Model:** Codex  
**Date:** 2026-02-01  
**Review Type:** Code Review (D.2)

---

## Issues Found

| # | Issue | Attack Vector | Impact | Severity |
|---|-------|---------------|--------|----------|
| X-1 | Filename convention mismatch vs PRD: `detectParser` requires `chase_checking_*`, `boa_checking_*`, `boa_credit_*`, but PRD and examples use `chase_1120_*`, `boa_1110_*`, `boa_2110_*`. | detectParser attacks; PRD §8.1 | Real input files won’t match parsers; ingestion fails even with valid exports. | **Critical** |
| X-2 | Discover parser ignores PRD’s `table_index=1` for HTML‑as‑XLS; always parses the first table. | Discover HTML‑as‑XLS, multi‑table input | Wrong table parsed → header mismatch or silent data corruption. | **Major** |
| X-3 | BoA Checking header detection can false‑match summary rows because it uses substring `includes()` on any cell with “date/description/amount”. | Smart header detection | Wrong header row → column misalignment, silently wrong data. | **Major** |
| X-4 | CSV BOM in header will cause “missing required columns” for all CSV parsers (e.g., `\uFEFFDate`), because no BOM stripping exists. | CSV parsing attacks (BOM) | Hard failure on common CSV exports; looks like “wrong columns” even though file is valid. | **Major** |
| X-5 | BoA Checking silently skips any row with amount `0` (and doesn’t count it as skipped). | Amount parsing attacks | Data loss if $0 rows exist (adjustments, reversals); no visibility. | **Minor** |
| X-6 | Discover sign convention is an unverified assumption (“negative = purchase”), with no test proving behavior. | Sign convention verification | Potential systemic sign inversion for Discover → downstream math wrong. | **Major** |

---

## Attack Matrix (Highlights)

### 1) CSV Parsing Attacks

All CSV parsers (`Chase`, `BoA Checking`, `BoA Credit`, `Fidelity`) rely on `XLSX.read(..., type: 'array')` → `sheet_to_json`. There are no tests for BOMs, quoted commas, or quoted newlines. The most concrete defect is BOM handling (X‑4): a UTF‑8 BOM will change the header key (e.g., `"\uFEFFDate"`), causing “missing required columns.”

### 2) Amount Parsing Attacks

- Comma‑thousands are stripped across all parsers (good).  
- Dollar‑sign `$` values will throw and be skipped (not mentioned in PRD; no tests).  
- BoA Checking explicitly drops `cleanAmount === '0'` without warning (X‑5).

### 3) Date Parsing Attacks

`parseDateValue` is strict (good), but **BOM** and **header detection** issues can prevent date parsing from being reached. Fidelity uses ISO only; MDY is rejected.

### 4) BoA Checking Smart Header Detection

`findHeaderRow` uses substring matching (`includes`) across **any** cell. Summary rows containing phrases like “Amount” or “Description” can be mistaken as header. There is no test for false‑match or header casing differences. See `packages/core/src/parser/boa-checking.ts:31`.

### 5) Discover HTML‑as‑XLS

PRD specifies `pd.read_html(table_index=1)` (second table). The current implementation ignores table selection and always uses the first worksheet after `XLSX.read`. This is a correctness gap if Discover exports include a summary table before the transactions table. See `packages/core/src/parser/discover.ts:33`.

### 6) detectParser Disambiguation

Current patterns require `chase_checking_*`, `boa_checking_*`, `boa_credit_*`. PRD expects `chase_1120_*`, `boa_1110_*`, `boa_2110_*`. There is no compatibility layer for legacy/PRD naming. See `packages/core/src/parser/detect.ts:37`.

---

## Test Quality Audit (Representative)

| Test | Claims to Test | Actually Tests? | Weakness |
|---|---|---|---|
| `parseBoaChecking` “summary rows” | Header detection with pre‑rows | ✅ | Doesn’t test false‑matches or header casing; uses ideal header row. (`packages/core/tests/parser/boa-checking.test.ts`) |
| `parseDiscover` “HTML table” | Discover HTML‑as‑XLS parsing | ⚠️ | Only single table. No multi‑table test (table_index=1). (`packages/core/tests/parser/discover.test.ts`) |
| `parseChaseChecking` “valid CSV” | Parser correctness | ⚠️ | CSV is built from JSON, not real CSV edge cases (BOM, quoted commas/newlines). (`packages/core/tests/parser/chase-checking.test.ts`) |
| `detectParser` | Naming patterns | ⚠️ | Tests only the new `*_checking`/`*_credit` naming. Doesn’t cover PRD filenames like `boa_1110_*.csv`. (`packages/core/tests/parser/detect.test.ts`) |

---

## Top 3 Concerns

1. **Parser detection will reject PRD‑compliant filenames** (X‑1). This is a hard blocker for real usage.
2. **Discover multi‑table HTML handling is missing** (X‑2). High risk of wrong table parsing.
3. **BoA Checking header detection can false‑match summary rows** (X‑3). Silent data corruption risk.

---

## What’s the Architect Not Seeing?

- **Filename convention drift:** Code expects `*_checking` and `*_credit`, but PRD and examples still use `boa_1110_*.csv` / `chase_1120_*.csv`. That mismatch will break ingestion and looks like “no parser found.”
- **Discover table index assumption:** The PRD explicitly references `table_index=1`; code always takes the first table. If Discover prepends a summary table, you parse the wrong data.
- **Header detection fragility:** Substring matching across all cells is a recipe for false positives when summary rows contain words like “amount” or “description.”

---

## Verdict

**Recommendation:** **Request Changes**

---

## References (Files)

- `packages/core/src/parser/detect.ts` (filename patterns)
- `packages/core/src/parser/boa-checking.ts` (header detection + zero amount skip)
- `packages/core/src/parser/discover.ts` (HTML table handling)
- `packages/core/tests/parser/*` (test gaps)

