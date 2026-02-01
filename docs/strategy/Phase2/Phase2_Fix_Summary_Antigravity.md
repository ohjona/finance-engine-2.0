# Phase 2 Fix Summary — Antigravity

This document summarizes the fixes applied to the Phase 2 Parser Module implementation to address blocking and non-blocking issues identified during consolidation.

## Fixed Issues

### B-4: CSV BOM Handling (Blocking)
- **Problem**: Some CSV exports from institutions include a UTF-8 Byte Order Mark (BOM) at the start of the file, which causes `XLSX.utils.sheet_to_json` to include the BOM in the first column's header key (e.g., `"\uFEFFPosting Date"`). This broke column matching.
- **Fix**: 
    - Created a shared utility `stripBom` in `packages/core/src/utils/csv.ts`.
    - Updated all CSV parsers (`chase-checking`, `boa-checking`, `boa-credit`, `fidelity`) to normalize row keys by stripping BOMs immediately after parsing.
- **Verification**: Added `should parse valid Chase CSV with BOM in header` test case to `chase-checking.test.ts`.

### S-1: BoA Checking Silently Skips $0 Rows
- **Problem**: Transactions with a $0 amount were being silently skipped during the cleanup phase, making it difficult to detect missing or placeholder data.
- **Fix**:
    - Updated `boa-checking.ts` to explicitly check for `rawAmount.isZero()`.
    - Added a descriptive warning: `Skipped transaction with $0 amount: {description}`.
    - Incremented `skippedRows` count for these instances.
- **Verification**: Added `should warn and skip $0 amount rows` test case to `boa-checking.test.ts`.

### X-1: Filename Convention Drift
- **Problem**: `detectParser` only matched `institution_type_accountId_date`, but legacy files used `institution_accountId_date`.
- **Fix**: Updated regex in `detect.ts` to support optional type suffixes and implemented BoA disambiguation (1xxx for Checking, 2xxx for Credit).
- **Verification**: Updated `detect.test.ts` with 4 new regression cases.

### X-2: Discover Multi-Table HTML Handling
- **Problem**: Discover exports could contain multiple HTML tables (summary + transactions), but the parser only looked at the first sheet.
- **Fix**: Updated `discover.ts` to scan all workbook sheets for the one matching required transaction headers.
- **Verification**: Added `should skip summary table and find transaction table` to `discover.test.ts`.

### X-3: BoA Checking Header False-Match Risk
- **Problem**: Fuzzy `includes` matching could false-match summary rows containing "Amount" or "Description".
- **Fix**: Tightened `findHeaderRow` in `boa-checking.ts` to require exact string equality for canonical headers.
- **Verification**: Added negative test `should not false-match summary rows` to `boa-checking.test.ts`.

## Impact & Regression Testing
- **Total Tests**: 92 passing (100%).
- **Build Status**: Successful (Clean `tsc` run).
- **Architectural Integrity**: Maintained Headless Core and Zero-I/O principles. All new utilities are pure functions.

---
*Gemini CLI, powered by Gemini 2.5 Pro*
