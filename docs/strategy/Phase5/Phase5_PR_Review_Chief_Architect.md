# D.1 Chief Architect PR Review — Phase 5

**PR:** https://github.com/ohjonathan/finance-engine-2.0/pull/5
**Branch:** `phase-5/cli-implementation`
**Reviewer:** Chief Architect (Claude Opus 4.5)
**Date:** 2026-02-02

---

## Quick Checks Summary

| Check | Status |
|-------|--------|
| `pnpm build` | ✓ Pass |
| `pnpm test` (core) | ✓ 210 tests pass |
| `pnpm test` (cli) | ✓ 11 tests pass |
| Node imports confined to CLI | ✓ Pass |
| No console calls in core | ✓ Pass |
| Serialization boundary intact | ✓ Pass |

---

## Scope Compliance

| Component | Expected | Status |
|-----------|----------|--------|
| CLI entry point | ✓ | ✓ `packages/cli/src/index.ts` |
| Workspace auto-detection | ✓ | ✓ `workspace/detect.ts` |
| Config loader | ✓ | ✓ `workspace/config.ts` |
| process command (10-step pipeline) | ✓ | ✓ `pipeline/runner.ts` |
| Cross-file deduplication | ✓ | ✓ `pipeline/steps/dedup.ts` |
| journal.xlsx output | ✓ | ⚠ Missing footer totals |
| review.xlsx output | ✓ | ❌ Schema mismatch |
| analysis.xlsx output | ✓ | ✓ 3 sheets present |
| run_manifest.json output | ✓ | ✓ `pipeline/steps/export.ts` |
| Input archiving | ✓ | ✓ `pipeline/steps/archive.ts` |
| add-rule command | ✓ | ⚠ Missing validations |
| --dry-run, --force, --yes flags | ✓ | ✓ Implemented |
| No modifications to core logic | ✓ | ✓ Only added `categorizeAll` export |
| No scope creep | ✓ | ✓ Clean |

---

## 10-Step Pipeline Verification

| Step | Name | Implemented | Notes |
|------|------|-------------|-------|
| 1 | MANIFEST CHECK | ✓ | Refuses overwrite without --force |
| 2 | DETECT | ✓ | Uses core `detectParser()` |
| 3 | PARSE | ✓ | Calls correct parser per file |
| 4 | DEDUP | ✓ | Cross-file txn_id dedup works |
| 5 | CATEGORIZE | ✓ | Loads rules, calls core |
| 6 | MATCH | ✓ | Calls `matchPayments()` |
| 7 | JOURNAL | ✓ | Calls `generateJournal()` |
| 8 | VALIDATE | ✓ | Basic validation |
| 9 | EXPORT | ✓ | Writes 3 xlsx + manifest |
| 10 | ARCHIVE | ✓ | Copies to archive |

**--dry-run behavior:** Steps 1-8 execute, steps 9-10 skip (correct per design)

---

## Serialization Boundary Verification

| Data Flow | CLI Responsibility | Core Receives | Correct? |
|-----------|-------------------|---------------|----------|
| Bank exports | Read file → ArrayBuffer | Raw data | ✓ |
| accounts.json | Read + JSON.parse | Account map | ✓ |
| user-rules.yaml | Read + YAML.parse | RuleSet | ✓ |
| base-rules.yaml | Read + YAML.parse | RuleSet | ✓ |
| shared-rules.yaml | Read + YAML.parse | RuleSet | ✓ |

---

## Issues Found

### CA-1: review.xlsx schema mismatch (Major)

**File:** `packages/cli/src/excel/review.ts`

**Expected (PRD §11.7 / IK D9.2):**
| Column | Expected |
|--------|----------|
| txn_id | Transaction hash |
| date | effective_date |
| raw_description | Original bank description |
| signed_amount | Decimal |
| account_name | Source account |
| suggested_category | Category name |
| confidence | 0.0-1.0 score |
| review_reason | Why flagged |
| your_category_id | Blank for user |

**Must be sorted by confidence ascending** (least certain first)

**Actual Implementation:**
| Column | Implemented |
|--------|-------------|
| Date | ✓ |
| Description | ✓ (but not raw) |
| Amount | ✓ |
| CategoryID | ✓ (but ID not name) |
| NeedsReview | Extra |
| Reasons | ✓ |
| SourceFile | Extra |
| TxnID | ✓ |

**Missing:** raw_description, account_name, suggested_category (name), confidence, your_category_id, sorting

---

### CA-2: journal.xlsx missing footer totals (Minor)

**File:** `packages/cli/src/excel/journal.ts`

**Expected (PRD §11.7):** Footer row: `Total Debits: $X | Total Credits: $X` (must match)

**Actual:** No footer row implemented

---

### CA-3: add-rule missing pattern validation (Major)

**File:** `packages/cli/src/commands/add-rule.ts`

**Missing per IK D4.7 / D4.8:**
1. Min pattern length validation (5 chars minimum)
2. Pattern collision check against existing rules
3. Should use `validatePattern()` and `checkPatternCollision()` from core

**Current behavior:** Accepts any pattern without validation

---

### CA-4: add-rule doesn't create file if missing (Minor)

**File:** `packages/cli/src/yaml/rules.ts:12`

**Issue:** `readFile(filePath)` throws ENOENT if user-rules.yaml doesn't exist.

**Expected:** Create file with header comment if missing (per design decision #4 in implementation prompt)

---

### CA-5: Test coverage gaps (Minor)

**Current:** 11 tests across 5 files

**File coverage:** ~18% (5 test files / 27 source files)

**Missing test coverage:**
- Pipeline steps: validate, archive, journal, match
- CLI commands: process handler, add-rule handler
- Error scenarios: malformed input, missing files
- Flag behavior: --force overwrite
- add-rule: pattern validation, collision detection

---

## Regression Check

| Check | Status |
|-------|--------|
| Phase 1 utility tests pass | ✓ |
| Phase 2 parser tests pass | ✓ |
| Phase 3 categorizer tests pass | ✓ |
| Phase 4 matcher/ledger tests pass | ✓ |
| Shared schema tests pass | ✓ |
| Full monorepo build succeeds | ✓ |

**Total:** 221 tests passing (210 core + 11 cli)

---

## Verdict

**Recommendation:** Needs fixes first

### Critical Fixes Required (before merge)

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| CA-1 | review.xlsx schema mismatch | Major | Fix column schema, add confidence sort |
| CA-3 | add-rule missing validation | Major | Add validatePattern/checkPatternCollision |

### Recommended Fixes (can be follow-up PR)

| # | Issue | Severity | Action |
|---|-------|----------|--------|
| CA-2 | journal.xlsx footer | Minor | Add totals row |
| CA-4 | add-rule file creation | Minor | Handle missing file |
| CA-5 | Test coverage | Minor | Add missing tests |

---

## Files to Modify

| Issue | File | Change |
|-------|------|--------|
| CA-1 | `packages/cli/src/excel/review.ts` | Rewrite columns per PRD, add sort |
| CA-2 | `packages/cli/src/excel/journal.ts` | Add footer row with totals |
| CA-3 | `packages/cli/src/commands/add-rule.ts` | Add validation calls |
| CA-4 | `packages/cli/src/yaml/rules.ts` | Handle missing file |
| CA-5 | `packages/cli/tests/*.test.ts` | Add coverage |

---

## Verification After Fixes

```bash
# Automated
pnpm test                    # All tests pass
pnpm build                   # Build succeeds

# Manual verification
npx fineng process 2026-01 --dry-run  # Pipeline completes
npx fineng add-rule "test" 101        # Should FAIL (too short)
npx fineng add-rule "starbucks" 101   # Should succeed

# Verify Excel schemas
# - review.xlsx has 9 columns in correct order
# - review.xlsx sorted by confidence ascending
# - journal.xlsx has footer totals row
```

---

**Review signed by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-02
- **Review Type:** PR First-Pass (D.1)

**Save as:** `Phase5_PR_Review_Chief_Architect.md`
