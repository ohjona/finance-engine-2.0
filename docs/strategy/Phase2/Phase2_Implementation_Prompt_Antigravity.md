# Phase 2 Implementation Prompt — Parser Module

**Target:** Antigravity (Implementation Agent)
**Author:** Chief Architect (Claude Opus 4.5)
**Date:** 2026-02-01
**Branch:** `phase-2/parsers`

---

## 1. Overview

Phase 2 extends the parser module with 5 new parsers. The Amex parser from Phase 1 establishes the implementation pattern—all new parsers must follow it exactly.

### What Phase 2 Builds

| Parser | Format | Date Format | Sign Convention | Special Handling |
|--------|--------|-------------|-----------------|------------------|
| parseChaseChecking | CSV | MM/DD/YYYY | positive = deposit → `raw` | None |
| parseBoaChecking | CSV | MM/DD/YYYY | positive = deposit → `raw` | Smart header detection |
| parseBoaCredit | CSV | MM/DD/YYYY | negative = purchase → `raw` | None |
| parseFidelity | CSV | YYYY-MM-DD | negative = charge → `raw` | Different date format |
| parseDiscover | XLS (HTML) | MM/DD/YYYY | negative = purchase → `raw` | HTML-as-XLS parsing |

### Architectural Decisions

**Decision 1: Discover Sign Convention**
Discover is undocumented in IK D3.1. As a credit card, it follows the standard credit card convention:
- **Raw convention:** negative = purchase (money out)
- **Transformation:** `signed_amount = raw` (no transformation needed)
- **Status:** ASSUMPTION — validate against real Discover exports

**Decision 2: CSV Parsing**
Use the existing `xlsx` library. It handles CSV files via `XLSX.read(data, { type: 'array' })` and `sheet_to_json()`. This maintains consistency with Amex and requires no new dependencies.

**Decision 3: Discover XLS Parsing**
The `xlsx` library auto-detects format including HTML tables saved as .xls. Use the same `XLSX.read()` approach. If this fails, escalate—do not add Node-only HTML parsers.

**Decision 4: Amex Refinement**
Not needed. Phase 1 review fixes addressed all issues:
- UTC date handling (B-1 fix)
- Comma stripping in amounts
- Schema validation per row
- Separate skip counters with distinct warnings

---

## 2. Pre-Implementation Checklist

```bash
# 1. Pull latest main (Phase 1 merged)
git checkout main
git pull origin main

# 2. Create Phase 2 branch
git checkout -b phase-2/parsers

# 3. Verify Phase 1 tests pass
pnpm install
pnpm test

# 4. Verify build succeeds
pnpm build
```

All must pass before proceeding.

---

## 3. Reference: Phase 1 Parser Pattern

Study `packages/core/src/parser/amex.ts` as the canonical pattern. Key elements:

```typescript
// 1. Named constants at top
const PARSER_EXPECTED_COLUMNS = ['Date', 'Description', 'Amount'];

// 2. Function signature (must match ParserFn type)
export function parseBank(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult

// 3. File reading via xlsx
const workbook = XLSX.read(data, { type: 'array' });
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

// 4. Separate skip counters
let skippedDates = 0;
let skippedAmounts = 0;
let skippedSchema = 0;

// 5. Column validation
const missingColumns = EXPECTED_COLUMNS.filter(col => !(col in firstRow));
if (missingColumns.length > 0) {
    throw new Error(`Bank parser: Missing required columns: ${missingColumns.join(', ')}`);
}

// 6. Amount parsing with Decimal
const cleanAmount = rawAmountStr.replace(/,/g, '').trim();
const rawAmount = new Decimal(cleanAmount);

// 7. Sign transformation (varies by parser)
const signedAmount = rawAmount; // or rawAmount.negated() for Amex

// 8. Transaction construction
const txn: Transaction = {
    txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
    txn_date: effectiveDate,
    post_date: effectiveDate,
    effective_date: effectiveDate,
    description: normalizeDescription(rawDesc),
    raw_description: rawDesc,
    signed_amount: signedAmount.toString(),
    account_id: accountId,
    category_id: UNCATEGORIZED_CATEGORY_ID,
    raw_category: row['Category'] ? String(row['Category']) : undefined,
    source_file: sourceFile,
    confidence: 0,
    needs_review: false,
    review_reasons: [],
};

// 9. Schema validation per row
try {
    TransactionSchema.parse(txn);
    transactions.push(txn);
} catch (e) {
    warnings.push(`Schema validation failed for row: ${e}`);
    skippedSchema++;
}

// 10. Distinct warnings per skip reason
if (skippedDates) warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
if (skippedAmounts) warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);

// 11. Return ParseResult
return { transactions, warnings, skippedRows };
```

---

## 4. Shared Utilities

### 4.1 Date Parsing Utility

Create a shared date parsing module since 4 parsers use MM/DD/YYYY and 1 uses YYYY-MM-DD.

**File:** `packages/core/src/utils/date-parse.ts`

```typescript
/**
 * Date parsing utilities for transaction parsers.
 * All dates returned as UTC (00:00:00Z).
 */

/**
 * Parse MM/DD/YYYY date string to Date (UTC).
 * Used by: Chase, BoA Checking, BoA Credit, Discover
 */
export function parseMdyDate(value: string): Date | null {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return null;

    const [, month, day, year] = match;
    const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    return isValidDate(date) ? date : null;
}

/**
 * Parse YYYY-MM-DD date string to Date (UTC).
 * Used by: Fidelity
 */
export function parseIsoDate(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
    return isValidDate(date) ? date : null;
}

/**
 * Format Date as ISO YYYY-MM-DD string (UTC).
 */
export function formatIsoDate(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Check if date is valid.
 */
export function isValidDate(date: Date): boolean {
    return !isNaN(date.getTime());
}
```

**Export from:** `packages/core/src/utils/index.ts`

**Commit:**
```
feat(core): add shared date parsing utilities
```

---

## 5. Task Sequence

### Task 1: Chase Checking Parser

**What:** Implement parseChaseChecking following the established pattern
**Why:** PRD §8.2, IK D3.1 (positive = deposit → raw)
**Package:** core

**Sign convention:** `signed_amount = raw` (no transformation)
**Date format:** MM/DD/YYYY
**Columns:** Date, Description, Amount

**File:** `packages/core/src/parser/chase-checking.ts`

```typescript
/**
 * Chase Checking transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - CSV format
 * - No header rows to skip
 * - Amount convention: positive = deposit (money in), negative = withdrawal (money out)
 *
 * Per IK D3.1: Chase positive = deposit, so signed_amount = raw (no transformation)
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseMdyDate, formatIsoDate } from '../utils/date-parse.js';

const CHASE_CHECKING_EXPECTED_COLUMNS = ['Details', 'Posting Date', 'Description', 'Amount', 'Type', 'Balance', 'Check or Slip #'];

/**
 * Parse Chase Checking transaction export.
 *
 * @param data - File contents as ArrayBuffer
 * @param accountId - 4-digit account ID from filename
 * @param sourceFile - Original filename for traceability
 * @returns ParseResult with transactions, warnings, and skip count
 */
export function parseChaseChecking(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Posting Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Chase Checking parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Posting Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseMdyDate(String(dateValue));
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        // Parse amount - strip commas
        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // Chase Checking: positive = deposit, negative = withdrawal (matches our convention)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
```

**Test File:** `packages/core/tests/parser/chase-checking.test.ts`

Test cases:
- Valid CSV with typical transactions (deposits and withdrawals)
- Empty file (no data rows)
- Missing required columns
- Invalid dates (not MM/DD/YYYY)
- Invalid amounts (non-numeric)
- Amounts with commas (should work)

**Commit:**
```
feat(core): add Chase Checking parser
```

---

### Task 2: BoA Checking Parser (with Smart Header Detection)

**What:** Implement parseBoaChecking with smart header detection per IK D3.5
**Why:** PRD §8.2, IK D3.5 (dynamic header row)
**Package:** core

**Sign convention:** `signed_amount = raw` (no transformation)
**Date format:** MM/DD/YYYY
**Special:** Smart header detection (scan first 10 rows), comma stripping per IK D3.10

**File:** `packages/core/src/parser/boa-checking.ts`

```typescript
/**
 * Bank of America Checking transaction parser.
 * Per PRD Section 8.2, IK D3.5.
 *
 * Format:
 * - CSV format
 * - DYNAMIC header row (summary rows before transactions)
 * - Amount convention: positive = deposit (money in), negative = withdrawal (money out)
 * - Amounts may have commas ("7,933.55") - strip before parsing
 *
 * Per IK D3.1: BoA Checking positive = deposit, so signed_amount = raw
 * Per IK D3.5: Use smart header detection (scan first 10 rows)
 * Per IK D3.10: Strip commas from amounts
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseMdyDate, formatIsoDate } from '../utils/date-parse.js';

const BOA_CHECKING_HEADER_PATTERNS = ['date', 'description', 'amount'];
const BOA_CHECKING_MAX_HEADER_SCAN = 10;

/**
 * Find header row by scanning for canonical column names.
 * Per IK D3.5: BoA exports include summary rows before transaction table.
 */
function findHeaderRow(rows: unknown[][], maxScan: number = BOA_CHECKING_MAX_HEADER_SCAN): number {
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
        const cols = rows[i].map((c) => String(c ?? '').toLowerCase());
        if (BOA_CHECKING_HEADER_PATTERNS.every((h) => cols.some((c) => c.includes(h)))) {
            return i;
        }
    }
    throw new Error('BoA Checking parser: Could not find header row in first 10 rows');
}

/**
 * Parse Bank of America Checking transaction export.
 *
 * @param data - File contents as ArrayBuffer
 * @param accountId - 4-digit account ID from filename
 * @param sourceFile - Original filename for traceability
 * @returns ParseResult with transactions, warnings, and skip count
 */
export function parseBoaChecking(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Get raw rows to find header
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

    if (rawRows.length === 0) {
        return { transactions: [], warnings: [], skippedRows: 0 };
    }

    // Smart header detection
    const headerRowIndex = findHeaderRow(rawRows);

    // Re-parse with correct range
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: headerRowIndex });

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `BoA Checking parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseMdyDate(String(dateValue));
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        // Per IK D3.10: Strip commas before Decimal conversion
        const cleanAmount = rawAmountStr.replace(/,/g, '');

        // Skip "Beginning balance" rows with empty Amount
        if (cleanAmount === '' || cleanAmount === '0') {
            continue;
        }

        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // BoA Checking: positive = deposit, negative = withdrawal (matches our convention)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
```

**Test cases:**
- Valid CSV with transactions
- CSV with summary rows before header (smart detection)
- Header not found within first 10 rows → error
- Amounts with commas ("7,933.55")
- Empty amounts (should skip)

**Commit:**
```
feat(core): add BoA Checking parser with smart header detection
```

---

### Task 3: BoA Credit Parser

**What:** Implement parseBoaCredit
**Why:** PRD §8.2, IK D3.1
**Package:** core

**Sign convention:** `signed_amount = raw` (negative = purchase)
**Date format:** MM/DD/YYYY

**File:** `packages/core/src/parser/boa-credit.ts`

```typescript
/**
 * Bank of America Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - CSV format
 * - No header rows to skip
 * - Amount convention: positive = payment/credit (money in), negative = purchase (money out)
 *
 * Per IK D3.1: BoA Credit negative = purchase, so signed_amount = raw (no transformation)
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseMdyDate, formatIsoDate } from '../utils/date-parse.js';

const BOA_CREDIT_EXPECTED_COLUMNS = ['Posted Date', 'Reference Number', 'Payee', 'Address', 'Amount'];

/**
 * Parse Bank of America Credit Card transaction export.
 */
export function parseBoaCredit(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Posted Date', 'Payee', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `BoA Credit parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Posted Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseMdyDate(String(dateValue));
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Payee'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // BoA Credit: negative = purchase (matches our convention)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
```

**Commit:**
```
feat(core): add BoA Credit parser
```

---

### Task 4: Fidelity Parser

**What:** Implement parseFidelity
**Why:** PRD §8.2, IK D3.1
**Package:** core

**Sign convention:** `signed_amount = raw` (negative = charge)
**Date format:** YYYY-MM-DD (different from others!)

**File:** `packages/core/src/parser/fidelity.ts`

```typescript
/**
 * Fidelity Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - CSV format
 * - Date format: YYYY-MM-DD (DIFFERENT from other parsers!)
 * - Amount convention: positive = credit/refund (money in), negative = charge (money out)
 *
 * Per IK D3.1: Fidelity negative = charge, so signed_amount = raw (no transformation)
 * Per IK D3.9: Fidelity uses YYYY-MM-DD date format
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseIsoDate, formatIsoDate } from '../utils/date-parse.js';

const FIDELITY_EXPECTED_COLUMNS = ['Date', 'Transaction', 'Name', 'Memo', 'Amount'];

/**
 * Parse Fidelity Credit Card transaction export.
 */
export function parseFidelity(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Date', 'Name', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Fidelity parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        // Fidelity uses YYYY-MM-DD format
        const txnDate = parseIsoDate(String(dateValue));
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        const rawDesc = String(row['Name'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // Fidelity: negative = charge (matches our convention)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(txnDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: effectiveDate,
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
```

**Test cases:**
- Valid CSV with YYYY-MM-DD dates
- Invalid dates (MM/DD/YYYY should fail)

**Commit:**
```
feat(core): add Fidelity parser
```

---

### Task 5: Discover Parser

**What:** Implement parseDiscover for XLS (HTML table) format
**Why:** PRD §8.2
**Package:** core

**Sign convention:** `signed_amount = raw` (ASSUMPTION: negative = purchase)
**Date format:** MM/DD/YYYY
**Special:** Has category column, XLS file is actually HTML table

**File:** `packages/core/src/parser/discover.ts`

```typescript
/**
 * Discover Credit Card transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - XLS file (actually HTML table)
 * - Has category column
 * - Amount convention: ASSUMED negative = purchase (credit card standard)
 *
 * ASSUMPTION: Discover follows credit card convention (negative = purchase).
 * This needs validation against real Discover exports.
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID, TransactionSchema } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';
import { parseMdyDate, formatIsoDate } from '../utils/date-parse.js';

const DISCOVER_EXPECTED_COLUMNS = ['Trans. Date', 'Post Date', 'Description', 'Amount', 'Category'];

/**
 * Parse Discover Credit Card transaction export.
 *
 * NOTE: Discover exports .xls files that are actually HTML tables.
 * The xlsx library handles this transparently via format detection.
 */
export function parseDiscover(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
    // xlsx auto-detects format including HTML tables saved as .xls
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

    const warnings: string[] = [];
    const transactions: Transaction[] = [];
    let skippedDates = 0;
    let skippedAmounts = 0;
    let skippedSchema = 0;

    if (rows.length === 0) {
        return { transactions, warnings, skippedRows: 0 };
    }

    // Header validation
    const firstRow = rows[0];
    const requiredColumns = ['Trans. Date', 'Description', 'Amount'];
    const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

    if (missingColumns.length > 0) {
        throw new Error(
            `Discover parser: Missing required columns: ${missingColumns.join(', ')}. ` +
            `Found: ${Object.keys(firstRow).join(', ')}`
        );
    }

    for (const row of rows) {
        const dateValue = row['Trans. Date'];
        if (!dateValue) {
            skippedDates++;
            continue;
        }

        const txnDate = parseMdyDate(String(dateValue));
        if (!txnDate) {
            skippedDates++;
            continue;
        }

        // Use Post Date if available, otherwise Trans. Date
        let postDate = txnDate;
        if (row['Post Date']) {
            const parsed = parseMdyDate(String(row['Post Date']));
            if (parsed) postDate = parsed;
        }

        const rawDesc = String(row['Description'] ?? '');
        const rawAmountStr = String(row['Amount'] ?? '0').trim();

        const cleanAmount = rawAmountStr.replace(/,/g, '');
        let rawAmount: Decimal;
        try {
            rawAmount = new Decimal(cleanAmount);
        } catch {
            warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
            skippedAmounts++;
            continue;
        }

        // ASSUMPTION: Discover follows credit card convention (negative = purchase)
        const signedAmount = rawAmount;

        const effectiveDate = formatIsoDate(postDate);

        const txn: Transaction = {
            txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
            txn_date: formatIsoDate(txnDate),
            post_date: effectiveDate,
            effective_date: effectiveDate,
            description: normalizeDescription(rawDesc),
            raw_description: rawDesc,
            signed_amount: signedAmount.toString(),
            account_id: accountId,
            category_id: UNCATEGORIZED_CATEGORY_ID,
            raw_category: row['Category'] ? String(row['Category']) : undefined,
            source_file: sourceFile,
            confidence: 0,
            needs_review: false,
            review_reasons: [],
        };

        try {
            TransactionSchema.parse(txn);
            transactions.push(txn);
        } catch (e) {
            warnings.push(`Schema validation failed for row: ${e}`);
            skippedSchema++;
        }
    }

    if (skippedDates) {
        warnings.push(`Skipped ${skippedDates} rows with invalid or missing dates`);
    }
    if (skippedAmounts) {
        warnings.push(`Skipped ${skippedAmounts} rows with invalid amounts`);
    }
    if (skippedSchema) {
        warnings.push(`Skipped ${skippedSchema} rows that failed schema validation`);
    }

    const skippedRows = skippedDates + skippedAmounts + skippedSchema;
    return { transactions, warnings, skippedRows };
}
```

**Test cases:**
- Valid XLS (HTML table format)
- Has category column (should populate raw_category)
- Separate Trans. Date and Post Date handling

**Commit:**
```
feat(core): add Discover parser

ASSUMPTION: Sign convention follows credit card standard (negative = purchase).
Needs validation against real Discover exports.
```

---

### Task 6: Update Parser Registry

**What:** Add all 5 new parsers to detect.ts
**Package:** core

**File:** `packages/core/src/parser/detect.ts` (modify)

Add imports:
```typescript
import { parseChaseChecking } from './chase-checking.js';
import { parseBoaChecking } from './boa-checking.js';
import { parseBoaCredit } from './boa-credit.js';
import { parseFidelity } from './fidelity.js';
import { parseDiscover } from './discover.js';
```

Update PARSERS registry:
```typescript
const PARSERS: Record<string, ParserEntry> = {
    amex: {
        pattern: /^amex_\d{4}_\d{6}\.xlsx$/i,
        parser: parseAmex,
    },
    chase_checking: {
        pattern: /^chase_\d{4}_\d{6}\.csv$/i,
        parser: parseChaseChecking,
    },
    boa_checking: {
        pattern: /^boa_1\d{3}_\d{6}\.csv$/i,  // Account IDs 1000-1999
        parser: parseBoaChecking,
    },
    boa_credit: {
        pattern: /^boa_2\d{3}_\d{6}\.csv$/i,  // Account IDs 2000-2999
        parser: parseBoaCredit,
    },
    fidelity: {
        pattern: /^fidelity_\d{4}_\d{6}\.csv$/i,
        parser: parseFidelity,
    },
    discover: {
        pattern: /^discover_\d{4}_\d{6}\.xls$/i,
        parser: parseDiscover,
    },
};
```

**NOTE:** BoA Checking and BoA Credit are distinguished by account ID range:
- 1xxx = checking accounts
- 2xxx = credit cards

**Test File:** Update `packages/core/tests/parser/detect.test.ts`

Add tests for all 6 filename patterns:
- `amex_2122_202601.xlsx` → amex
- `chase_1120_202601.csv` → chase_checking
- `boa_1110_202601.csv` → boa_checking
- `boa_2110_202601.csv` → boa_credit
- `fidelity_2180_202601.csv` → fidelity
- `discover_2170_202601.xls` → discover

**Commit:**
```
feat(core): expand parser registry with 5 new parsers
```

---

### Task 7: Update Exports

**File:** `packages/core/src/parser/index.ts` (modify)

Add exports:
```typescript
export { parseChaseChecking } from './chase-checking.js';
export { parseBoaChecking } from './boa-checking.js';
export { parseBoaCredit } from './boa-credit.js';
export { parseFidelity } from './fidelity.js';
export { parseDiscover } from './discover.js';
```

**File:** `packages/core/src/index.ts` (modify)

Ensure parser exports are re-exported.

**Commit:**
```
chore(core): export all parsers
```

---

## 6. Regression Protocol

After each parser:
```bash
# Run all tests
pnpm test

# Verify build
pnpm build

# Check architecture constraints
grep -rn "from 'node:" packages/core/src/
grep -rn "console\." packages/core/src/
```

All must pass before proceeding to next parser.

---

## 7. Final Verification

```bash
# Full test suite
pnpm test

# Full build
pnpm build

# Architecture constraint check
pnpm verify:core-constraints

# Verify all 6 parsers detected
node -e "
const { detectParser } = require('./packages/core/dist/index.js');
const files = [
  'amex_2122_202601.xlsx',
  'chase_1120_202601.csv',
  'boa_1110_202601.csv',
  'boa_2110_202601.csv',
  'fidelity_2180_202601.csv',
  'discover_2170_202601.xls'
];
files.forEach(f => {
  const result = detectParser(f);
  console.log(f, '=>', result?.parserName ?? 'NOT FOUND');
});
"
```

---

## 8. PR Preparation

**Branch:** `phase-2/parsers`

**PR Title:** `feat(phase-2): complete parser module with 6 bank support`

**Expected commits:**
1. `feat(core): add shared date parsing utilities`
2. `feat(core): add Chase Checking parser`
3. `feat(core): add BoA Checking parser with smart header detection`
4. `feat(core): add BoA Credit parser`
5. `feat(core): add Fidelity parser`
6. `feat(core): add Discover parser`
7. `feat(core): expand parser registry with 5 new parsers`
8. `chore(core): export all parsers`

---

## Appendix: Quality Checklist

**Completeness:**
- [ ] All 5 new parsers have complete file contents
- [ ] All 5 new parsers have test files
- [ ] detectParser has entries for all 6 banks
- [ ] detectParser tests for all 6 filename patterns
- [ ] Date parsing utility created and tested

**Correctness:**
- [ ] Chase: signed_amount = raw
- [ ] BoA Checking: signed_amount = raw, smart header detection
- [ ] BoA Credit: signed_amount = raw
- [ ] Fidelity: signed_amount = raw, YYYY-MM-DD dates
- [ ] Discover: signed_amount = raw (ASSUMPTION documented)
- [ ] All parsers call generateTxnId with raw_description
- [ ] All parsers set category_id to UNCATEGORIZED_CATEGORY_ID
- [ ] Discover stores raw_category

**Architecture:**
- [ ] Zero `node:*` imports in any new core file
- [ ] Zero `console.*` calls in any new core file
- [ ] No new Node-only dependencies
- [ ] All parsers are pure functions

---

**Prompt signed by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-01
- **Input Documents:** PRD v2.2, IK v1.2, Phase 1 merged codebase
