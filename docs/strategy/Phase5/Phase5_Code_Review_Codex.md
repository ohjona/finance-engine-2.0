# D.2c: Adversarial Code Review (Codex) — Phase 5

## Issues Found

| # | Issue | Attack Vector | Impact | Severity |
|---|-------|---------------|--------|----------|
| X-1 | `process.ts` contains an `addRule()` stub and **imports after executable code**, which breaks TS module syntax | Build/compile the CLI | CLI fails to build or run at all; `process` command unusable | **Critical** |
| X-2 | Cross‑file deduplication uses `state.files[i]` with `state.parseResults[i]` **index alignment that breaks when any file is skipped or fails to parse** | Mix of parseable + unparseable files; or a parse error in one file | Transactions silently dropped or mis‑deduped; collision suffixes assigned to wrong file data | **Critical** |
| X-3 | `appendRuleToYaml()` **corrupts top‑level sequence rules files** (common format) by overwriting with `rules:` mapping | add-rule on a YAML file that is a top‑level array | Existing user rules can be lost or rewritten; data loss | **Critical** |
| X-4 | Journal validation failure is **non‑fatal** and still exports outputs | Any imbalance in journal (e.g., from ledger bug) | Corrupt journal.xlsx + manifest written as “success” | **Critical** |
| X-5 | Output schemas do **not match PRD/IK** (journal/review/analysis) | Any run | Generated Excel files fail downstream expectations; tests and consumers break | **Major** |
| X-6 | `review.xlsx` includes **all transactions**, not just flagged; LLM columns missing | Mixed month with many non‑flagged items | Review file bloated, user misses review scope; schema mismatch (D9.2/D9.4) | **Major** |
| X-7 | `analysis.xlsx` sheets/columns are wrong (IncomeSpend/CategorySummary/AccountSummary vs By Category/By Account/Summary) | Any run | Output does not meet PRD §11.7 / IK D9.3 | **Major** |
| X-8 | Archiving **copies** instead of **moves** inputs; no protection against duplicate re‑processing | Re-run after “archive” | Imports remain in place → duplicate processing on next run, user thinks files were archived | **Major** |
| X-9 | Overwrite protection only checks for `run_manifest.json`, not other existing output files | Prior run failed mid‑export or partial output exists | `--force` not required, files overwritten/merged silently | **Major** |
| X-10 | `--yes` / TTY prompts are **implemented but never used** | Any parse error / partial read | CLI continues with partial data without confirmation; in non‑TTY there’s no abort | **Major** |
| X-11 | `loadAccounts()` errors are **uncaught** in `processMonth()` | Missing/invalid accounts.json | Unhandled exception, stack trace instead of user error | **Major** |
| X-12 | Shared rules path resolution likely wrong (`src/workspace/paths.ts` → `dist/assets`), so shared rules are never loaded | Normal runs | Shared rules silently missing; categorization quality drops | **Major** |
| X-13 | `add-rule` treats collisions as fatal errors (spec says warn + allow) and does not validate category_id exists | Rule collides or bad category | UX mismatch; rules added to non‑existent categories | **Minor** |
| X-14 | Month validation only checks `YYYY-MM` regex (allows `2026-13`) | `npx fineng process 2026-13` | Invalid month accepted; downstream path invalid | **Minor** |

---

## Attack Vector Notes (Examples)

### Matching Schema Violations
- **Journal columns** are `EntryID/AccountID` etc, but PRD requires `entry_id/account_id` and specific ordering. This is a hard schema mismatch.
- **Review columns** missing LLM fields from IK D9.2 (must be appended), violating D9.4 column preservation.
- **Analysis sheets** and columns do not align with PRD §11.7 (By Category / By Account / Summary with specific fields).

### Data Loss / Corruption Scenarios
- **Parse error in one file** shifts `parseResults[]` alignment. Example: first file corrupt → its parse result is missing; dedup step assigns file2’s transactions to file1’s slot and skips last file entirely.
- **add-rule on top‑level array** converts file into `rules:` mapping and discards the existing sequence, corrupting user rules.
- **Unbalanced journal** still writes output files, so users can import corrupted journals.

### Run Safety Gaps
- **No prompt handling** on partial data; `--yes` is defined but never used.
- **Manifest check only** allows overwriting partial outputs without `--force`.
- **Archive is copy**, not move; re-running doubles data unless user manually cleans imports.

---

## Top 3 Concerns
1. **Dedup misalignment (X‑2)** → silent transaction loss or duplication across files.
2. **YAML add‑rule corruption (X‑3)** → destroys user rule set.
3. **Exports proceed on invalid journal (X‑4)** → corrupt financial records written to disk.

---

## What the Architect Isn’t Seeing
- A single skipped/failed import file can **shift parseResults indexing**, causing later files to disappear without any fatal error.
- The YAML round‑trip helper **does not handle top‑level sequences**, so add‑rule can wipe a user’s rules file.
- The CLI can **emit invalid Excel outputs** even when the ledger is out of balance.
- Shared rules are effectively **disabled** if the asset path is wrong in production builds.

---

## Verdict

**Recommendation:** Request Changes

---

**Review signed by:**
- **Role:** Adversarial Reviewer
- **Model:** Codex
- **Date:** 2026-02-02
- **Review Type:** Code Review (D.2)

