# D.2b: Alignment Code Review (Claude) — Phase 5

## Your Role

You are the **Alignment Reviewer**. Verify the code matches the specification exactly.

---

## What You're Reviewing

Phase 5 of Finance Engine v2.0: CLI implementation.

**Files Reviewed:**
- `packages/cli/src/index.ts` (31 lines) - Entry point
- `packages/cli/src/commands/process.ts` (71 lines) - Process command
- `packages/cli/src/commands/add-rule.ts` (70 lines) - Add-rule command
- `packages/cli/src/pipeline/runner.ts` (64 lines) - Pipeline orchestration
- `packages/cli/src/pipeline/steps/*.ts` - All 10 pipeline steps
- `packages/cli/src/excel/*.ts` - Excel export modules
- `packages/cli/src/workspace/*.ts` - Workspace detection and config
- `packages/cli/src/yaml/rules.ts` (35 lines) - YAML round-trip
- `packages/shared/src/schemas.ts` (RunManifestSchema)

---

## Focus Areas

### 1. IK §8 Compliance: Run Safety (D8.1-D8.8)

| IK Decision | Requirement | Code Complies? | Evidence |
|-------------|-------------|----------------|----------|
| D8.1 | Overwrite protection: default refuse, --force to overwrite | **PASS** | `manifest-check.ts:19`: `if (existsSync(manifestPath) && !state.options.force)` returns fatal error |
| D8.2 | Run manifest: correct JSON schema (month, run_timestamp, input_files with SHA-256, transaction_count, txn_ids, collision_map, version) | **PASS** | `export.ts:39-47` creates manifest with all required fields; `schemas.ts:351-359` defines `RunManifestSchema` |
| D8.3 | Input archiving: imports/YYYY-MM/ → archive/YYYY-MM/raw/ | **FAIL** | `archive.ts:29` uses `copyFile()` instead of move. Per IK D8.3: "move" to archive. Files remain in imports. |
| D8.4 | Error handling: skip-and-warn, then prompt "Continue with partial data?" | **FAIL** | No interactive prompt implemented. Errors are logged but no "Continue? [y/N]" prompt shown to user. |
| D8.5 | Non-interactive: --yes auto-continues | **FAIL** | `--yes` flag is defined (`index.ts:18`) but never checked. Related to D8.4 - no prompt to skip. |
| D8.6 | Dry-run: parse, categorize, match — write no files | **PASS** | `export.ts:15-17` and `archive.ts:11-14` both check `state.options.dryRun` and skip |
| D8.7 | Date validation: skip transactions with invalid dates, log count | **N/A** | Handled in core parsers, not CLI. Parsers return `skippedRows` count. |
| D8.8 | Hidden file filtering: skip files starting with . or ~ | **PASS** | `detect.ts:21`: `if (filename.startsWith('.') || filename.startsWith('~')) continue` |

### 2. IK §9 Compliance: Output Schemas (D9.1-D9.4)

| IK Decision | Requirement | Code Complies? | Evidence |
|-------------|-------------|----------------|----------|
| D9.1 | journal.xlsx columns: entry_id, date, description, account_id, account_name, debit, credit, txn_id. Footer: Total DR/CR | **PASS** | `journal.ts:13-22` defines columns in correct order; `journal.ts:48-58` adds footer with totals |
| D9.2 | review.xlsx columns: txn_id, effective_date, raw_description, signed_amount, account_name, suggested_category, confidence, review_reason, your_category_id. Sorted confidence ascending | **MINOR** | `review.ts:16-26` has columns but uses `date` not `effective_date`. Sorted correctly at line 29. |
| D9.3 | analysis.xlsx: 3 sheets (By Category, By Account, Summary) | **FAIL** | `analysis.ts` creates 3 sheets but named: "IncomeSpend", "CategorySummary", "AccountSummary". PRD specifies: "By Category", "By Account", "Summary" with specific columns. |
| D9.4 | Column preservation: never rename existing columns | **PASS** | No evidence of renamed columns. New implementation follows spec. |

**D9.2 Column Detail:**
- `txn_id` ✓
- `date` ✗ (should be `effective_date`)
- `raw_description` ✓
- `signed_amount` ✓
- `account_name` ✓
- `suggested_category` ✓
- `confidence` ✓
- `review_reason` ✓
- `your_category_id` ✓

**D9.3 Sheet Detail:**

| PRD Specification | Implementation | Match? |
|-------------------|----------------|--------|
| "By Category" sheet with category_id, category_name, total_amount, transaction_count | "CategorySummary" with CategoryID, TransactionCount, TotalAmount (missing category_name) | **PARTIAL** |
| "By Account" sheet with account_id, account_name, total_in, total_out, net | "AccountSummary" with AccountID, TransactionCount, TotalVolume (missing account_name, in/out/net breakdown) | **FAIL** |
| "Summary" sheet with Total income, total expenses, net savings, flagged count | "IncomeSpend" with Type, Amount rows (missing flagged count, net savings) | **PARTIAL** |

### 3. IK §10 Compliance: Configuration (D10.1-D10.9)

| IK Decision | Requirement | Code Complies? | Evidence |
|-------------|-------------|----------------|----------|
| D10.1 | YAML for rules files | **PASS** | `config.ts:41-57` loads YAML rules via `parse()` from yaml package |
| D10.2 | JSON for accounts | **PASS** | `config.ts:16-24` loads JSON via `JSON.parse()` |
| D10.5 | Workspace model: root, imports, outputs, archive, config | **PASS** | `paths.ts:10-28` defines `Workspace` with all required paths |
| D10.6 | Auto-detection: search for config/user-rules.yaml in cwd + parents; --workspace overrides | **PASS** | `detect.ts:8-22` bubbles up searching for config/user-rules.yaml; `process.ts:19` respects `--workspace` |
| D10.8 | add-rule workflow: validate, collision check, append with metadata (added_date, source: "manual"), YAML round-trip safe | **FAIL** | `add-rule.ts:52-57` adds pattern, category_id, note, added_date but **missing `source: "manual"`** |
| D10.9 | Shared rules: bundled shared-rules.yaml loaded | **PASS** | `paths.ts:30-35` resolves shared-rules.yaml from CLI assets; `config.ts:32` loads it |

### 4. IK §12 Compliance: Architecture (A12.1, A12.5, A12.8)

| IK Decision | Requirement | Code Complies? | Evidence |
|-------------|-------------|----------------|----------|
| A12.1 | 10-step pipeline in correct order: MANIFEST CHECK → DETECT → PARSE → DEDUP → CATEGORIZE → MATCH → JOURNAL → VALIDATE → EXPORT → ARCHIVE | **PASS** | `runner.ts:37-48` defines steps array in exact order |
| A12.5 | Headless core: no I/O in core package | **PASS** | `grep 'import.*from.*node:' packages/core/src/` returns no matches; `grep 'console\.'` returns only architectural comments |
| A12.8 | Serialization boundary: CLI parses YAML/JSON, passes objects to core. Core never touches files. YAML round-trip via yaml.parseDocument() | **PASS** | `config.ts` handles all file loading; `rules.ts:23` uses `parseDocument()` for round-trip |

**Pipeline Order Verification (runner.ts:37-48):**
```
1. manifestCheck      ✓ MANIFEST CHECK
2. detectFiles        ✓ DETECT
3. parseFiles         ✓ PARSE
4. deduplicateTransactions  ✓ DEDUP
5. categorizeTransactions   ✓ CATEGORIZE
6. matchTransactions  ✓ MATCH
7. generateLedger     ✓ JOURNAL
8. validateFinal      ✓ VALIDATE
9. exportResults      ✓ EXPORT
10. archiveRawFiles   ✓ ARCHIVE
```

### 5. PRD §15.B Compliance: Sample Session

| PRD Sample Line | Implemented? | Deviation |
|----------------|-------------|-----------|
| "Loading config..." | **FAIL** | Not shown. Only "Detecting workspace..." |
| "✓ 126 accounts loaded" | **FAIL** | No account count shown after loading |
| "✓ 52 categorization rules loaded" | **FAIL** | No rule count shown |
| "Parsing imports/2026-01/..." | **FAIL** | Shows "→ Step 3/10: Parsing..." but not directory path |
| "✓ {filename}: {count} transactions" per file | **FAIL** | Not shown per-file |
| "Deduplicating..." + result | **PARTIAL** | Shows step name but not "✓ 147 unique transactions" |
| "Categorizing..." + result with confidence % | **FAIL** | Shows step name but not "✓ 141/147 categorized (96%)" |
| "⚠ {n} flagged for review" | **PARTIAL** | Shown in summary but not during categorization step |
| "Matching payments..." + count | **FAIL** | Shows step name but not "✓ 4 CC payments matched" |
| "Generating journal entries..." + count | **FAIL** | Shows step name but not "✓ 151 journal entries created" |
| "✓ Validated: Total DR = Total CR = ${amount}" | **FAIL** | Not shown. Only warning if out-of-balance. |
| "Exporting..." with file paths | **FAIL** | Shows step name but not individual file paths |
| "Archiving inputs..." with path | **FAIL** | Shows step name but not "moved to archive/..." |
| "Done! Review {n} flagged items in review.xlsx" | **PARTIAL** | Shows "Processing complete" and "Needs review: N" but not the exact format |

**Console Output Assessment:** The implementation shows basic step progression (`→ Step N/10: Name...`) but lacks the detailed success messages with counts that the PRD §15.B sample session specifies. This is a **significant UX deviation**.

### 6. Implementation Prompt Compliance

| CA Decision | Followed? | Evidence |
|-------------|-----------|----------|
| CLI framework choice | **PASS** (commander) | `index.ts:2`: `import { Command } from 'commander'` |
| Excel library choice | **PASS** (exceljs) | `journal.ts:1`, `review.ts:1`, `analysis.ts:1` all import from 'exceljs' |
| Pipeline data passing design | **PASS** (State Object Pattern) | `runner.ts:25-35` creates `PipelineState` that flows through all steps |
| Dedup location (core vs CLI) | **PASS** (CLI-level cross-file, core for intra-file) | `dedup.ts:27` calls core's `resolveCollisions()` per file, then CLI filters cross-file |
| --llm flag handling | **PASS** (stub/placeholder) | `categorize.ts:25-27` warns "not yet implemented" and falls back to rules |
| Sub-phasing decision | **PASS** (single PR) | All CLI code in one implementation |
| Entry point / bin config | **PASS** | `index.ts:1` has `#!/usr/bin/env node`; package.json defines `bin` |

### 7. PRD §9.4 add-rule Compliance

Trace for: `npx fineng add-rule "WARBY PARKER" 4550 --note "Vision/eyewear"`

| Step | Requirement | Implemented? | Evidence |
|------|-------------|--------------|----------|
| 1 | Validate pattern (D4.7/D4.8 thresholds) | **PASS** | `add-rule.ts:17-21` calls `validatePattern()` from core |
| 2 | Check for collisions with existing rules | **PASS** | `add-rule.ts:40-46` calls `checkPatternCollision()` |
| 3 | Append to user-rules.yaml with metadata | **PASS** | `add-rule.ts:52-57` calls `appendRuleToYaml()` |
| 4 | Metadata includes: pattern, category_id, note, added_date, source | **FAIL** | Missing `source: "manual"` - only has pattern, category_id, note, added_date |
| 5 | Round-trip safe (preserves comments) | **PASS** | `rules.ts:23` uses `parseDocument()` from yaml package |

---

## Uncomfortable Questions

### 1. If the workspace has no imports/YYYY-MM/ directory for the requested month, what happens?

**Answer:** `detect.ts:58-64` catches the error and pushes a fatal error: "Error scanning directory {path}". The pipeline stops cleanly.

**Assessment:** **PASS** - Clear error, no crash.

### 2. If accounts.json has an account_id that doesn't exist in the chart of accounts, does anything break downstream?

**Answer:** In the ledger module (`account-resolve.ts`), unknown accounts return `{ name: "Unknown (${accountId})", warning: "..." }`. The CLI accumulates warnings but continues processing.

**Assessment:** **PASS** - Graceful degradation.

### 3. If a parser returns 0 transactions for a file, is that treated as success or warning?

**Answer:** `parse.ts:49-51` adds a warning "No transactions found in any of the files" only if ALL files return 0 and there are no errors. Individual empty files are treated as success.

**Assessment:** **PASS** - Reasonable behavior.

### 4. If all files fail to parse and the user continues with --yes, does the pipeline crash on an empty transaction list?

**Answer:** `validate.ts:25-30` catches this case and pushes a fatal error: "No transactions were processed." This stops the pipeline cleanly in Step 8.

**Assessment:** **PASS** - No crash, clean error.

### 5. If archiving fails (permissions, disk full), does the user lose their import files?

**Answer:** `archive.ts:35` marks archive errors as `fatal: false`, so processing results are still saved. Import files are COPIED (not moved), so they remain in place even if archive fails.

**Assessment:** **PASS** - No data loss. However, see Issue A-1 (should be move, not copy).

### 6. If the user runs add-rule twice with the same pattern, what happens?

**Answer:** `add-rule.ts:40-46` checks for collisions via `checkPatternCollision()`. If the pattern already exists, it returns an error: "Pattern collision detected" and exits without adding.

**Assessment:** **PASS** - Duplicate prevention works.

### 7. Does the manifest txn_ids array include collision-suffixed IDs (abc123-02) or only base IDs?

**Answer:** `export.ts:44` uses `state.transactions.map(t => t.txn_id)` which includes the fully resolved IDs with collision suffixes. The collision_map at line 45 via `buildCollisionMap()` tracks the base IDs and their collision counts.

**Assessment:** **PASS** - Both are tracked correctly.

---

## Issues Found

| # | Issue | Type | Severity | Source |
|---|-------|------|----------|--------|
| A-1 | Input archiving uses `copyFile()` instead of move. Files remain in imports/ | IK D8.3 | **Major** | `archive.ts:29` |
| A-2 | No "Continue with partial data? [y/N]" prompt on parse errors | IK D8.4 | **Major** | Missing in all pipeline steps |
| A-3 | `--yes` flag defined but never used for auto-continue | IK D8.5 | **Major** | Flag unused in codebase |
| A-4 | add-rule missing `source: "manual"` metadata field | IK D10.8 | **Minor** | `add-rule.ts:52-57` |
| A-5 | review.xlsx column `date` should be `effective_date` | IK D9.2 | **Minor** | `review.ts:18` |
| A-6 | analysis.xlsx sheet names don't match PRD ("IncomeSpend" vs "Summary", etc.) | IK D9.3 | **Major** | `analysis.ts:21,49,82` |
| A-7 | analysis.xlsx missing columns: category_name, account_name, total_in/out/net breakdown | IK D9.3 | **Major** | `analysis.ts` |
| A-8 | Console output doesn't match PRD §15.B sample session (missing counts, file paths, detailed messages) | PRD §15.B | **Major** | `process.ts`, all step files |
| A-9 | `process.ts:3-6` contains dead code (stub addRule function) | Code Quality | **Minor** | `process.ts:3-6` |

---

## Verdict

**Recommendation:** **REQUEST CHANGES**

The Phase 5 implementation demonstrates solid architectural compliance:
- ✓ 10-step pipeline in correct order (A12.1)
- ✓ Headless core maintained (A12.5)
- ✓ Serialization boundary respected (A12.8)
- ✓ Commander + ExcelJS as specified
- ✓ YAML round-trip preservation
- ✓ Workspace auto-detection works

However, several IK and PRD requirements are not met:

**Critical Fixes Required:**
1. **A-1, A-2, A-3:** Run safety features incomplete - archiving should MOVE files, error handling should prompt user, --yes should enable auto-continue
2. **A-6, A-7:** analysis.xlsx doesn't match PRD specification - sheet names and columns differ significantly
3. **A-8:** Console output missing detailed progress messages per PRD §15.B

**Minor Fixes:**
4. **A-4:** add-rule missing `source: "manual"` metadata
5. **A-5:** review.xlsx column name mismatch
6. **A-9:** Dead code in process.ts

The architecture is sound, but the user-facing behavior (console output, Excel schemas) needs alignment with specifications before approval.

---

**Review signed by:**
- **Role:** Alignment Reviewer
- **Model:** Claude (Opus 4.5)
- **Date:** 2026-02-02
- **Review Type:** Code Review (D.2b)
