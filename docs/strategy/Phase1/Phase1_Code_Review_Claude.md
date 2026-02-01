# D.2b: Alignment Code Review (Claude)

## Your Role

**Alignment Reviewer** verifying code matches specification and maintains architectural constraints.

**Review scope:** Phase 1 of Finance Engine v2.0 - TypeScript monorepo establishing infrastructure and proving headless core architecture with Amex parser.

---

## 1. PRD Compliance

| PRD Section | Requirement | Implemented? | Correctly? | Notes |
|-------------|-------------|--------------|------------|-------|
| §7.1 | Transaction schema | ✅ | ✅ | All fields present: txn_id, dates, amounts, account_id, category_id, confidence, review fields |
| §7.2 | JournalEntry/JournalLine schemas | ✅ | ✅ | Schemas defined in shared/schemas.ts |
| §7.3 | Account/ChartOfAccounts schemas | ✅ | ✅ | Includes type enum: asset/liability/income/expense/special |
| §7.5 | Transaction ID generation | ✅ | ⚠️ | Uses `js-sha256` instead of Node `crypto` - intentional for browser compat |
| §8.1 | Parser detection/registry | ✅ | ✅ | PARSERS registry with pattern matching, account ID extraction |
| §8.2 | Amex parser | ✅ | ✅ | Skips 6 rows, negates amounts (positive=charge), handles Excel serial dates |
| §9.3 | Description normalization | ✅ | ✅ | Uppercase, replace `*#` with space, collapse whitespace, trim |

### Field Verification Details

**TransactionSchema:**
- `txn_id`: 16-char hex + optional collision suffix (-02, -03) ✅
- `account_id`: int 1000-9999 ✅
- `signed_amount`: decimal string (not native number) ✅
- `confidence`: 0-1 range ✅
- `review_reasons`: string array ✅

---

## 2. IK Decision Compliance

| IK Decision | Requirement | Code Complies? | Evidence |
|-------------|-------------|----------------|----------|
| D2.2 | Decimal for all money | ✅ | `decimal.js` used in core/parser/amex.ts, amounts stored as strings in schemas |
| D2.3 | txn_id: 16-char SHA-256 hex | ✅ | `core/utils/txn-id.ts:generateTxnId()` returns `.slice(0, 16)` |
| D2.4 | Collision suffix: -02, -03 | ✅ | `resolveCollisions()` adds `-02`, `-03` suffixes starting at second occurrence |
| D2.7 | UNCATEGORIZED = 4999 | ✅ | `shared/constants.ts:UNCATEGORIZED_CATEGORY_ID = 4999` |
| D2.11 | Account ID: 4-digit (1000-9999) | ✅ | `shared/schemas.ts:accountId = z.number().int().min(1000).max(9999)` |
| D2.12 | Hash uses raw_description | ✅ | `generateTxnId(effectiveDate, rawDescription, ...)` - uses raw, not normalized |
| D2.13 | Lexicographic file ordering | N/A | Phase 1 CLI is single-file PoC; multi-file ordering is Phase 5 scope |
| D3.1 | Amex: positive = charge = negate | ✅ | `parseAmex()`: `signedAmount = rawAmount.negated()` |
| D3.8 | Normalization: uppercase, replace *, collapse ws | ✅ | `normalizeDescription()` in `core/utils/normalize.ts` |
| D4.2 | Confidence scores per layer | ✅ | `CONFIDENCE` object in constants with all values: USER=1.0, SHARED=0.9, etc. |
| A12.5 | Core has no I/O | ✅ | Verified: zero `node:fs` imports, zero `console.*` calls in core |
| A12.8 | Serialization boundary | ✅ | Core receives ArrayBuffer, returns ParseResult; CLI handles file I/O |

---

## 3. Architecture Compliance

| Constraint | Source | Status | Verification |
|------------|--------|--------|-------------|
| Core: no `node:*` imports | Roadmap §2.1, IK A12.5 | ✅ | Grep confirms zero fs/path imports in core/src/ |
| Core: no console calls | Implementation Prompt | ✅ | No console.log/warn/error in any core files |
| Core: pure functions | Implementation Prompt | ✅ | All functions documented as deterministic, no side effects |
| Package dependency: shared ← core ← cli | Roadmap §2.1 | ✅ | tsconfig.json references confirm dependency chain |
| Web package: scaffold only | Phasing Plan | ✅ | Only exports: version, status, getStatus() |

### Headless Core Verification

**core/src/** files analyzed:
- `utils/txn-id.ts` - Pure: SHA-256 hash generation, collision resolution
- `utils/normalize.ts` - Pure: string transformation
- `parser/amex.ts` - Pure: ArrayBuffer → ParseResult (no file I/O)
- `parser/detect.ts` - Pure: filename pattern matching

**All core functions are:**
- Input-dependent only (no globals, no filesystem)
- Deterministic (same input → same output)
- Side-effect free (no console, no file writes)

---

## 4. Implementation Prompt Compliance

| Instruction | Followed? | Deviation |
|-------------|-----------|-----------|
| SHA-256 hashing | ⚠️ | Uses `js-sha256` instead of Node `crypto` - **intentional for browser** |
| resolveCollisions returns new array | ✅ | Returns new array, doesn't mutate input (improvement over PRD example) |
| Parser returns warnings as data | ✅ | `ParseResult` schema includes `warnings: string[]`, `skippedRows: number` |
| File creation order matches task sequence | ✅ | Commits show: root config → shared → core/utils → core/parser → cli → web |
| Commit history matches expected | ✅ | 4 recent commits match phase-1 implementation pattern |

---

## 5. Scope Creep Check

| Present but shouldn't be | Absent but should be |
|--------------------------|---------------------|
| (none detected) | (none detected - Phase 1 scope respected) |

**Scope correctly bounded:**
- Only Amex parser implemented (other 5 parsers are Phase 2)
- No categorization logic (Phase 3)
- No matching/ledger (Phase 4)
- Web is scaffold only (Phase 5+)

---

## Issues Found

| # | Issue | Type | Severity | Source |
|---|-------|------|----------|--------|
| A-1 | PRD §7.5 schema shows `.length(16)` but collision suffixes make txn_id longer | PRD Doc | Minor | PRD §7.5 vs implementation |
| A-2 | PRD example uses `crypto.createHash` but implementation uses `js-sha256` | Deviation | Minor | PRD §7.5 - intentional for A12.5 |
| A-3 | PRD `resolveCollisions` mutates in-place but implementation returns new array | Deviation | Minor | PRD §7.5 - improved immutability |

### Issue Details

#### A-1: txn_id Schema Length (Minor - Documentation)
**Location:** PRD §7.5 vs `shared/schemas.ts`
**Problem:** PRD shows `txn_id: z.string().length(16)` but collision-suffixed IDs are 19+ chars (`abc123...def-02`)
**Implementation:** Correctly handles with regex allowing optional suffix
**Action:** Update PRD example code to match implementation

#### A-2: Hashing Library (Minor - Intentional Deviation)
**Location:** PRD §7.5 vs `core/utils/txn-id.ts`
**Problem:** PRD example uses Node.js `crypto.createHash`
**Implementation:** Uses `js-sha256` for browser compatibility
**Rationale:** Required by A12.5 (headless core, no Node dependencies)
**Action:** Document in PRD that browser-compatible hashing is required

#### A-3: Immutable resolveCollisions (Minor - Improved)
**Location:** `core/utils/txn-id.ts`
**Problem:** PRD example mutates input array; implementation returns new array
**Assessment:** Implementation is BETTER - follows functional programming best practices
**Action:** Update PRD example to match improved implementation

#### Note: File Ordering (IK D2.13)
**Status:** Not applicable to Phase 1
**Reason:** Phase 1 CLI is a single-file PoC. Multi-file processing with lexicographic ordering is Phase 5 scope. When implementing Phase 5, ensure `files.sort()` is called before processing loop.

---

## Uncomfortable Questions

### 1. Are there any IK decisions that the code violates without acknowledgment?
**Answer:** No. IK D2.13 (lexicographic file ordering) is not applicable to Phase 1 which is a single-file PoC. This requirement applies to Phase 5 when multi-file processing is implemented.

### 2. Are there type mismatches between Zod schemas and the code that uses them?
**Answer:** No significant mismatches found. The `txnId` regex correctly allows collision suffixes that the PRD example omitted.

### 3. Does the hashing approach actually work in a browser?
**Answer:** Yes. `js-sha256` is a pure JavaScript implementation with no Node dependencies. This was the correct choice for headless core.

### 4. Are there hidden dependencies on Node.js beyond obvious imports?
**Answer:** Checked for `Buffer`, `process.env`, `__dirname` in core - none found. The CLI correctly isolates Node-specific code.

---

## Verdict

**Recommendation:** Approve

### No Blocking Issues
All Phase 1 requirements are correctly implemented.

### Non-Blocking (Documentation Only)
- **A-1:** PRD txn_id schema example should show collision suffix handling
- **A-2:** PRD should note browser-compatible hashing requirement (js-sha256 vs crypto)
- **A-3:** PRD resolveCollisions example should show immutable pattern (return new array)

### Summary
Phase 1 implementation is well-architected and fully compliant with PRD v2.2 and IK v1.2 specifications. The headless core design is correctly implemented with:
- Zero I/O dependencies in core (no fs, no console)
- Pure functions throughout
- Proper decimal handling with decimal.js
- Correct Amex parser with sign normalization
- Deterministic transaction ID generation
- Collision handling with suffixes

The minor documentation discrepancies do not affect correctness and can be addressed in a separate PRD update.

---

## Verification Steps

To confirm Phase 1 compliance:

```bash
# 1. Build and test all packages
pnpm build && pnpm test

# 2. Verify no fs imports in core
grep -r "from 'node:fs'" packages/core/src/ && echo "FAIL" || echo "PASS"
grep -r "from 'fs'" packages/core/src/ && echo "FAIL" || echo "PASS"

# 3. Verify no console in core
grep -r "console\." packages/core/src/ && echo "FAIL" || echo "PASS"

# 4. Test CLI with sample Amex file
pnpm --filter @finance-engine/cli start fixtures/amex_2122_202601.xlsx
```

All verification steps have been confirmed to pass during this review.

---

**Review signed by:**
- **Role:** Alignment Reviewer
- **Model:** Claude Opus 4.5
- **Date:** 2026-01-31
- **Review Type:** Code Review (D.2)
