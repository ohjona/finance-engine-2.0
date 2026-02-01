---
id: PRD_v2
type: strategy
status: draft
depends_on:
  - institutional_knowledge_compendium
---

# Personal Finance Engine - Product Requirements Document

**Version:** 2.2
**Date:** January 31, 2026
**Author:** Jonathan Oh, with AI assistance (Claude, Gemini)
**Status:** Active — TypeScript Rewrite
**Companion Document:** [Institutional Knowledge Compendium](institutional-knowledge.md)
**Python v1.x PRD:** [Archived in /docs/archive/](../archive/)

---

## Table of Contents

1. [Design Philosophy & Decisions](#1-design-philosophy--decisions)
2. [Context & Background](#2-context--background)
3. [Problem Statement](#3-problem-statement)
4. [Vision](#4-vision)
5. [Architecture](#5-architecture)
6. [File & Directory Structure](#6-file--directory-structure)
7. [Data Structures](#7-data-structures)
8. [Parser Specifications](#8-parser-specifications)
9. [Categorization System](#9-categorization-system)
10. [Transaction Matching](#10-transaction-matching)
11. [Usage & Workflow](#11-usage--workflow)
12. [Chart of Accounts](#12-chart-of-accounts)
13. [Decisions Log](#13-decisions-log)
14. [Future Expansion Path](#14-future-expansion-path)
15. [Appendix](#appendix)

---

## 1. Design Philosophy & Decisions

### 1.1 Core Principle: Low Maintenance, High Expandability

This is a **personal** tool used maybe once a month. The architecture must optimize for:

- **Easy to understand** - Anyone (including future-you) can open a file and know what it does
- **Easy to fix** - When something breaks, you can debug it in minutes, not hours
- **Easy to extend** - Adding a new bank takes 30 minutes, not a day

### 1.2 What We Decided NOT to Build

| Rejected Feature | Reason |
|-----------------|--------|
| **SQLite Database** | Overhead for monthly use. Schema migrations, connection handling, query debugging - all ceremony that adds friction for a tool used 12 times a year. |
| **Full API Class (15+ methods)** | Forces you to understand an abstraction layer just to debug why December didn't parse right. You'd rather just open `parse_chase.py` and see exactly what's happening. |
| **Complex CLI with subcommands** | `finance process --month 2026-01 --exports ./path --no-match --dry-run` is harder to remember than `npx fineng process 2026-01`. |
| **Direct Excel Append** | Writing to the master 10-year ledger automatically is too risky. One bug = corrupted history. Copy-paste keeps the human as checkpoint. |

### 1.3 What We Decided TO Keep

| Feature | Why It's Worth It |
|---------|------------------|
| **4-Layer Categorization** | It's just YAML files + a simple lookup function. Write once, rarely touch. Low maintenance after initial setup. |
| **Transaction Matching** | Pattern matching logic in one function. Once "AMEX PAYMENT" works, you never touch it again. Logic doesn't rot. |
| **Parser Registry** | Each parser is a standalone function. Chase changes their CSV in 2027? Edit one function. The "registry" is just a dict. |
| **Run Safety** | Hash-based deduplication + manifest prevents double-entry accidents. Set up once, protects forever. |

### 1.4 Technology Choices

| Choice | Rationale |
|--------|-----------|
| **TypeScript** | Single codebase for CLI, web, and future mobile. Type safety prevents runtime errors. |
| **YAML config files** | Human-readable, supports comments, easy to edit frequently (rules). |
| **JSON for accounts** | Rarely edited, structured data. JSON is natural for account definitions. |
| **Excel output** | You already use Excel. Keep what works. |
| **`decimal.js`** | Never use native `number` for money. Prevents penny drift over thousands of transactions. |
| **No database (initially)** | Files are your database. Simpler to backup, share, and debug. |

### 1.5 Privacy-First Design

> **All transaction processing happens client-side. No data leaves user's machine.**

| Principle | Implementation |
|-----------|----------------|
| **Client-side only** | Core engine runs in browser or local Node.js. No server required. |
| **BYOT LLM** | If using LLM categorization, user provides their own API key. No data routed through our servers. |
| **Private repository** | Rules contain vendor names which reveal shopping habits. Repository must be private. |
| **No telemetry** | No analytics, crash reporting, or data collection unless explicitly opted in. |

### 1.6 Design for Future Expansion

```
Today (v1):              Future (v2+):
─────────────            ─────────────
YAML/JSON files   →      SQLite (if needed)
Python scripts    →      CLI wrapper (if needed)
Excel output      →      Web dashboard (if needed)
Manual exports    →      Plaid API (if needed)
```

**The key insight:** You can always add complexity. You can't easily remove it.

---

## 2. Context & Background

### 2.1 Who is the User?

Jonathan Oh - a professional who has been maintaining personal finances using a double-entry bookkeeping system in Excel since March 2015.

**Financial accounts:**
- Multiple credit cards (Amex Delta Reserve, Amex Platinum, Chase Freedom, BoA Cashback, Fidelity, Discover, etc.)
- Multiple bank accounts (Chase Checking, BoA Checking, Fidelity, joint accounts)
- Investment accounts (Interactive Brokers, Betterment, Robinhood, Coinbase, etc.)
- Work expenses tracked separately (McKinsey reimbursements)

**Existing system:**
- Comprehensive Excel-based accounting with 10+ years of history
- Monthly sheets with double-entry journal format
- Chart of accounts with PR (posting reference) codes

**Scope:** Cash + credit/debit cards only. Investments/crypto are a separate engine.

### 2.2 Current Workflow Pain Points

1. **Manual Data Entry:** Every month, download CSV/Excel exports from each institution and manually enter transactions into Excel accounting file.

2. **Inconsistent Formats:** Each bank has different export formats:
   - Different column structures
   - Different date formats (MM/DD/YYYY vs YYYY-MM-DD)
   - Different amount conventions (positive vs negative for charges)

3. **Double-Entry Complexity:** Each transaction requires two journal entries (debit and credit), making manual entry tedious and error-prone.

4. **No Learning:** Corrections made to categorizations are not remembered - the same vendor gets miscategorized every month.

5. **Cross-Account Matching:** Credit card payments appear in both checking account (outflow) and credit card (payment received) - manual reconciliation required.

---

## 3. Problem Statement

**Manual personal finance management is too tedious for something that happens 12 times a year.**

The tool should make monthly processing a 10-minute task instead of a 2-hour task, while being simple enough that you can fix it yourself when something breaks.

---

## 4. Vision

### 4.1 What Success Looks Like

```bash
# Every month, you do this:
$ npx fineng process 2026-01

# And you get:
✓ Parsed 6 export files (147 transactions)
✓ Categorized 141 transactions (96% confidence)
✓ Matched 4 CC payments
✓ Flagged 6 items for review

Output:
  → outputs/2026-01/analysis.xlsx
  → outputs/2026-01/journal.xlsx
  → outputs/2026-01/review.xlsx
  → outputs/2026-01/run_manifest.json
```

Then you:
1. Open `2026-01-review.xlsx`
2. Fix the 6 flagged items (sorted by confidence — least certain first)
3. Copy journal entries to your master Excel file
4. Done

### 4.2 Future Layers (Not Now)

```
┌─────────────────────────────────────────────────────────┐
│             FUTURE: USER INTERFACE LAYER                 │
│      (Dashboard, Chat, Reports, Mobile App)              │
│                [To be built later]                       │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│         >>> CURRENT SCOPE: SIMPLE ENGINE <<<             │
│                                                          │
│    Drop files in → Run script → Get Excel outputs        │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Architecture

### 5.1 High-Level Overview (v2.0 Monorepo)

```
finance-engine/
├── packages/
│   ├── core/                 # Pure TypeScript engine (no I/O)
│   │   ├── src/
│   │   │   ├── parser/      # Parser implementations
│   │   │   ├── categorizer/ # 4-layer categorization
│   │   │   ├── matcher/     # Payment matching
│   │   │   ├── ledger/      # Double-entry generation
│   │   │   └── types/       # Data structures (Zod schemas)
│   │   └── package.json
│   │
│   ├── cli/                  # Node.js CLI wrapper
│   │   ├── src/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── web/                  # Browser / PWA frontend
│   │   ├── src/
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── shared/               # Config schemas, constants
│       └── package.json
│
├── docs/                     # Documentation
└── workspace/                # User data (not in repo)
    ├── config/
    │   ├── accounts.json
    │   ├── user-rules.yaml   # Personal overrides (highest priority)
    │   └── base-rules.yaml   # Your general patterns
    ├── imports/
    ├── outputs/
    └── archive/
```

**Headless Core Pattern:** The `@finance-engine/core` package contains pure functions with no I/O:

```typescript
// Core exports pure functions
export function parseAmex(data: ArrayBuffer, accountId: number): Transaction[];
export function categorize(txn: Transaction, rules: RuleSet): CategorizedTransaction;
export function matchPayments(txns: Transaction[], config: MatchConfig): Match[];
export function generateJournal(txns: CategorizedTransaction[]): JournalEntry[];
```

I/O is handled by the consuming layer:
- **CLI:** Reads/writes files via Node.js `fs`
- **Web:** Uses FileReader API for uploads, IndexedDB for storage

**Serialization Responsibility (per IK A12.8):**

| Operation | Responsibility | Location |
|-----------|----------------|----------|
| Parse YAML rules | CLI/Web | `@finance-engine/cli` |
| Read config files | CLI/Web | `@finance-engine/cli` |
| Write updated rules | CLI/Web | `@finance-engine/cli` |
| YAML round-trip preservation | CLI/Web | Use `yaml.parseDocument()` |
| Rule mutation helpers | Core | Pure `RuleSet → RuleSet` transforms |

This ensures core package has no `fs` dependency and can run in browser.

### 5.2 Data Flow

```
┌─────────────┐
│   imports/  │     Drop files here monthly
│  (exports)  │     Filename format: {bank}_{accountID}_{YYYYMM}.{ext}
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│                    npx fineng process                    │
│                                                          │
│  1. Check run_manifest (refuse overwrite without --force)│
│  2. Detect file types (by filename pattern + validation) │
│  3. Parse each file → normalized transactions            │
│  4. Deduplicate (hash-based txn_id)                      │
│  5. Categorize (4-layer rule hierarchy)                  │
│  6. Match payments/transfers                             │
│  7. Generate double-entry journal                        │
│  8. Validate totals (debits = credits)                   │
│  9. Export to Excel                                      │
│  10. Archive raw inputs                                  │
│  11. Write run_manifest.json                             │
│                                                          │
└─────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────┐
│  outputs/   │     Pick up your files here
│  (Excel)    │
└─────────────┘
```

**File Processing Order:** Files are processed in lexicographic (ASCII byte order) sort of filename. This ensures deterministic collision suffixes (`-02`, `-03`) across platforms and re-runs.

Example order:
```
amex_2120_202601.xlsx
amex_2122_202601.xlsx
boa_1110_202601.csv
chase_1120_202601.csv
```

### 5.3 Why No Database?

For monthly personal use:

| Approach | Pros | Cons |
|----------|------|------|
| **SQLite** | Queryable, relational | Schema migrations, connection handling, backup complexity |
| **YAML/JSON files** | Human-readable, git-friendly, easy backup | No complex queries |

**Decision:** YAML/JSON files. If you need to query historical data, write a Python script. The overhead of SQLite isn't worth it for 12 uses per year.

---

## 6. File & Directory Structure

### 6.1 Workspace Structure

User data (not in repo) follows this layout:

```
workspace/
├── config/
│   ├── accounts.json           # Chart of accounts (rarely edited)
│   ├── user-rules.yaml         # User overrides (highest priority)
│   └── base-rules.yaml         # User's general patterns
│
├── imports/                    # Input directory (drop exports here)
│   └── 2026-01/
│       ├── amex_2122_202601.xlsx
│       ├── chase_1120_202601.csv
│       └── ...
│
├── outputs/                    # Generated files
│   └── 2026-01/
│       ├── analysis.xlsx
│       ├── journal.xlsx
│       ├── review.xlsx
│       └── run_manifest.json
│
└── archive/                    # Archived raw inputs
    └── 2026-01/
        └── raw/
            ├── amex_2122_202601.xlsx
            └── ...
```

> **Note on shared-rules.yaml:** This file is bundled with `@finance-engine/cli` (not stored in workspace). The CLI reads it from package assets. Users cannot edit it; to override, add rules to `user-rules.yaml`.

> **Note:** For code/package structure, see Section 5.1 (Monorepo).

### 6.2 Workspace Auto-Detection

CLI auto-detects workspace by searching for `config/user-rules.yaml` in current or parent directories.

**Search order:**
1. Current directory: `./config/user-rules.yaml`
2. Parent directories (up to root): `../config/user-rules.yaml`
3. Explicit `--workspace` flag overrides

**Fallback:** If no workspace found, prompt user or error.

This allows users to run CLI from any subdirectory within their workspace.

### 6.3 Module Size Estimates

| Module | Lines | Complexity |
|--------|-------|------------|
| `@finance-engine/core` | ~800 | Pure TypeScript engine |
| `@finance-engine/cli` | ~150 | Node.js wrapper |
| `@finance-engine/web` | ~500 | React/Svelte frontend |
| **Total** | ~1,500 | Manageable for one person |

---

## 7. Data Structures

### 7.1 Normalized Transaction (TypeScript)

Every transaction from any source becomes this:

```typescript
import Decimal from 'decimal.js';
import { z } from 'zod';

const TransactionSchema = z.object({
  txn_id: z.string().length(16),                    // SHA-256 hash (see 7.5)
  txn_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Transaction date from bank
  post_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // Posted/settled date
  effective_date: z.string(),                       // Date used for month bucketing
  description: z.string(),                           // Normalized (uppercase, trimmed)
  raw_description: z.string(),
  signed_amount: z.string(),                         // Decimal as string: "-23.45"
  account_id: z.number().int().min(1000).max(9999),
  category_id: z.number().int(),
  raw_category: z.string().optional(),
  source_file: z.string(),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string()),
});

type Transaction = z.infer<typeof TransactionSchema>;

// Example:
const txn: Transaction = {
  txn_id: "a1b2c3d4e5f67890",
  txn_date: "2026-01-15",
  post_date: "2026-01-16",
  effective_date: "2026-01-15",
  description: "UBER TRIP",
  raw_description: "UBER *TRIP HELP.UBER.COM",
  signed_amount: "-23.45",  // Use Decimal for arithmetic
  account_id: 2122,
  category_id: 4260,
  raw_category: "Transportation-Taxi & Limo",
  source_file: "amex_2122_202601.xlsx",
  confidence: 0.95,
  needs_review: false,
  review_reasons: [],
};
```

**Sign convention:**
- `signed_amount < 0` → Money out (charges, withdrawals, payments made)
- `signed_amount > 0` → Money in (deposits, refunds, payments received)

**Date bucketing rule:**
- `effective_date = txn_date` when available
- Fallback to `post_date` if `txn_date` is missing, with `review_reasons.append("date_fallback: txn_date unavailable")`
- Month processing uses `effective_date` for all bucketing

**Monetary precision:**
- All amounts use `decimal.js` — never native `number`
- Parse from string: `new Decimal(rawValue)` or `new Decimal("23.45")`
- See [IK Appendix D.1](institutional-knowledge.md#d1-decimal-handling) for TypeScript patterns

### 7.2 Journal Entry (for Excel output)

```typescript
const JournalEntrySchema = z.object({
  entry_id: z.number().int(),                // Sequential entry number
  date: z.string(),                          // effective_date
  description: z.string(),
  lines: z.array(z.object({
    account_id: z.number().int(),
    account_name: z.string(),
    debit: z.string().nullable(),            // Decimal as string or null
    credit: z.string().nullable(),
    txn_id: z.string(),                      // Traceability back to source
  })),
});

type JournalEntry = z.infer<typeof JournalEntrySchema>;

// Example:
const entry: JournalEntry = {
  entry_id: 1,
  date: "2026-01-15",
  description: "Uber Trip",
  lines: [
    {
      account_id: 4260,
      account_name: "Rideshare",
      debit: "23.45",
      credit: null,
      txn_id: "a1b2c3d4e5f67890",
    },
    {
      account_id: 2122,
      account_name: "Amex Delta",
      debit: null,
      credit: "23.45",
      txn_id: "a1b2c3d4e5f67890",
    },
  ],
};
```

### 7.3 Config: accounts.json

```json
{
    "accounts": {
        "1120": {
            "name": "Chase Checking 6917",
            "type": "asset",
            "institution": "Chase"
        },
        "2122": {
            "name": "Amex Delta Sky Reserve",
            "type": "liability",
            "institution": "Amex"
        },
        "4260": {
            "name": "Rideshare (Uber/Lyft)",
            "type": "expense",
            "parent": "4200 - Transportation"
        },
        "4999": {
            "name": "UNCATEGORIZED",
            "type": "expense",
            "parent": "4900 - Other"
        }
    }
}
```

### 7.4 Config: Rules Files

The 4-layer categorization model uses three rule files (the 4th layer is the bank category map, not a file):

**user-rules.yaml** (Layer 1 - highest priority):
```yaml
# Personal overrides - these always win
- pattern: "WARBY PARKER"
  category_id: 4550
  note: "Vision/eyewear - prescription glasses"
  added_date: "2026-01-18"
  source: "manual"

- pattern: "COSTCO"
  category_id: 4310    # Groceries (my usage - others may differ)
  added_date: "2026-01-20"
```

**base-rules.yaml** (Layer 3 - user's general patterns):
```yaml
# Your general patterns - these match after shared rules
- pattern: "UBER"
  category_id: 4260
- pattern: "LYFT"
  category_id: 4260
- pattern: "STARBUCKS"
  category_id: 4330
- pattern: "DOORDASH"
  category_id: 4340
- pattern: "AMAZON"
  category_id: 4490
- pattern: "CASHBACK"
  category_id: 3250    # Rewards income, not expense refund
- pattern: "REWARD"
  category_id: 3250
- pattern: "STATEMENT CREDIT"
  category_id: 3250
# Add new rules below. Comments explain edge cases.
```

**shared-rules.yaml** (Layer 2 - bundled, read-only):
```yaml
# Bundled with package - maintained by project, not user
# Universal patterns that work for most users
- pattern: "NETFLIX"
  category_id: 4610
- pattern: "SPOTIFY"
  category_id: 4610
- pattern: "AMAZON PRIME"
  category_id: 4610
# ... more universal patterns
```

### 7.5 Transaction ID Generation

```typescript
import { createHash } from 'crypto';
import Decimal from 'decimal.js';

/**
 * Deterministic hash for deduplication. Filename-independent.
 */
export function generateTxnId(
  effectiveDate: string,
  rawDescription: string,
  signedAmount: Decimal,
  accountId: number
): string {
  const payload = `${effectiveDate}|${rawDescription}|${signedAmount.toString()}|${accountId}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/**
 * Add suffix for same-fingerprint transactions (e.g., two $5 Starbucks same day).
 */
export function resolveCollisions(transactions: Transaction[]): void {
  const seen: Record<string, number> = {};
  
  for (const txn of transactions) {
    const baseId = txn.txn_id;
    if (seen[baseId]) {
      seen[baseId] += 1;
      txn.txn_id = `${baseId}-${String(seen[baseId]).padStart(2, '0')}`;
    } else {
      seen[baseId] = 1;
    }
  }
}
```

This ensures:
- Same transaction always produces same ID regardless of source filename (idempotent)
- Different transactions from same vendor on same day with same amount get deterministic suffixes (`-02`, `-03`)
- Re-running the script produces identical IDs (safe to compare)
- Collision map is stored in `run_manifest.json` for reproducibility

**Payload Normalization (per IK D2.12):**

| Field | Normalization |
|-------|---------------|
| `effectiveDate` | ISO 8601 format: `YYYY-MM-DD` |
| `rawDescription` | Raw bytes (NO normalization); hash exact input before any matching normalization |
| `signedAmount` | Plain decimal string, no trailing zeros: `"-23.45"` not `"-23.450"` |
| `accountId` | Integer as string: `"2122"` |

**Rationale:** Hashing raw description preserves source of truth. Normalizing before hash would change ID when bank format changes.

---

## 8. Parser Specifications

### 8.1 Parser Registry

```typescript
import { minimatch } from 'minimatch';

type ParserFn = (data: ArrayBuffer, accountId: number) => Transaction[];

const PARSERS: Record<string, { pattern: string; parser: ParserFn }> = {
  amex: { pattern: 'amex_*_*.xlsx', parser: parseAmex },
  chase_checking: { pattern: 'chase_1120_*.csv', parser: parseChaseChecking },
  boa_checking: { pattern: 'boa_1110_*.csv', parser: parseBoaChecking },
  boa_credit: { pattern: 'boa_2110_*.csv', parser: parseBoaCredit },
  fidelity: { pattern: 'fidelity_2180_*.csv', parser: parseFidelity },
  discover: { pattern: 'discover_2170_*.xls', parser: parseDiscover },
};

/**
 * Detect parser and account ID for a given filename.
 * Skip hidden files (e.g., .DS_Store, .gitkeep).
 */
export function detectParser(filename: string): { parser: ParserFn; accountId: number } | null {
  // Skip hidden files and temp files
  if (filename.startsWith('.') || filename.startsWith('~')) {
    return null;
  }
  
  for (const [name, { pattern, parser }] of Object.entries(PARSERS)) {
    if (minimatch(filename.toLowerCase(), pattern.toLowerCase())) {
      const accountId = extractAccountId(filename);
      if (accountId) {
        return { parser, accountId };
      }
    }
  }
  return null;
}

/**
 * Extract 4-digit account code from filename.
 * Expected format: {bank}_{accountID}_{YYYYMM}.{ext}
 */
function extractAccountId(filename: string): number | null {
  const parts = filename.split('_');
  if (parts.length >= 2 && /^\d{4}$/.test(parts[1])) {
    return parseInt(parts[1], 10);
  }
  return null;
}
```

**Filename convention:** `{institution}_{accountID}_{YYYYMM}.{ext}`
- Examples: `amex_2122_202601.xlsx`, `chase_1120_202601.csv`
- Account ID in filename is authoritative (no header parsing needed)

**Header validation (sanity check):**
After parsing, validate that expected columns exist. If a bank changes their format, the parser raises a clear error rather than silently producing garbage.

### 8.2 Format Specifications

#### Amex (Delta, Platinum, Blue Cash)

```yaml
Format: XLSX
Skip rows: 6
Date columns: Transaction date + post date (both available)
Amount convention:
  positive: charge (money out)
  negative: credit/refund (money in)
Has category: yes (Column 10)
Account ID: From filename (e.g., amex_2122_202601.xlsx → 2122)
```

**Parser example (Amex):**
```typescript
import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import { format, isValid } from 'date-fns';
import { normalizeDescription } from './normalize';

export function parseAmex(data: ArrayBuffer, accountId: number): Transaction[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6 });

  // Header validation
  const firstRow = rows[0];
  const expected = ['Date', 'Description', 'Amount'];
  if (!expected.every(col => col in (firstRow ?? {}))) {
    throw new Error(`Unexpected columns in Amex file`);
  }

  const transactions: Transaction[] = [];
  for (const row of rows) {
    const dateValue = row['Date'];
    if (!dateValue) continue;
    
    const txnDate = parseExcelDate(dateValue);
    if (!isValid(txnDate)) continue;  // Skip invalid dates
    
    const rawDesc = String(row['Description'] ?? '');
    const rawAmount = new Decimal(String(row['Amount']));

    transactions.push({
      txn_id: '',  // Generated later
      txn_date: format(txnDate, 'yyyy-MM-dd'),
      post_date: format(txnDate, 'yyyy-MM-dd'),  // Fallback to txn_date
      effective_date: format(txnDate, 'yyyy-MM-dd'),
      description: normalizeDescription(rawDesc),
      raw_description: rawDesc,
      signed_amount: rawAmount.negated().toString(),  // Amex: positive = charge = money out
      account_id: accountId,
      category_id: 4999,  // Will be categorized later
      raw_category: String(row['Category'] ?? ''),
      source_file: '',  // Set by caller
      confidence: 0,
      needs_review: false,
      review_reasons: [],
    });
  }
  return transactions;
}
```

#### Chase Checking

```yaml
Format: CSV
Skip rows: 0
Date format: MM/DD/YYYY
Amount convention:
  positive: deposit (money in)
  negative: withdrawal (money out)
Has category: no
Account ID: From filename (e.g., chase_1120_202601.csv → 1120)
```

**Signed amount:** `signed_amount = Decimal(str(row['Amount']))` (Chase convention matches our convention directly)

#### BoA Checking

```yaml
Format: CSV
Header row: DYNAMIC (use smart header detection)
Date format: MM/DD/YYYY
Amount convention:
  positive: deposit (money in)
  negative: withdrawal (money out)
Note: Numbers have commas ("7,933.55") - strip before Decimal conversion
Account ID: From filename (e.g., boa_1110_202601.csv → 1110)
```

**Smart Header Detection:** BoA Checking exports include summary rows before the transaction table. Scan first N rows (default 10) for the canonical header pattern (`Date,Description,Amount`) rather than assuming a fixed row offset.

```typescript
function findHeaderRow(rows: string[][], maxScan = 10): number {
  const headerPatterns = ['date', 'description', 'amount'];
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const cols = rows[i].map(c => c?.toString().toLowerCase());
    if (headerPatterns.every(h => cols.some(c => c?.includes(h)))) {
      return i;
    }
  }
  throw new Error('BoA: Could not find header row');
}
```

#### BoA Credit Card

```yaml
Format: CSV
Skip rows: 0
Amount convention:
  positive: payment received (money in to CC = reduces liability)
  negative: purchase (money out)
Account ID: From filename (e.g., boa_2110_202601.csv → 2110)
```

**Signed amount:** `signed_amount = Decimal(str(row['Amount']))` (BoA credit convention: negative = purchase = money out, matches ours)

#### Fidelity Credit Card

```yaml
Format: CSV
Date format: YYYY-MM-DD (DIFFERENT from others!)
Amount convention:
  positive: credit/refund (money in)
  negative: charge (money out)
Account ID: From filename (e.g., fidelity_2180_202601.csv → 2180)
```

**Signed amount:** `signed_amount = Decimal(str(row['Amount']))` (Fidelity: negative = charge = money out, matches ours)

#### Discover

```yaml
Format: XLS (actually HTML table)
Parse method: pd.read_html(), table_index=1
Has category: yes
Account ID: From filename (e.g., discover_2170_202601.xls → 2170)
```

---

## 9. Categorization System

### 9.1 Four-Layer Logic

```
INPUT: Transaction description "WARBY PARKER WARBYPARKER.COM"
       After normalization: "WARBY PARKER WARBYPARKER COM"

┌────────────────────────────────────────────────────────┐
│ LAYER 1: USER RULES (Highest Priority)                 │
│                                                        │
│ Check user-rules.yaml for pattern match                │
│ If found: return category, confidence=1.0              │
│ If not: continue to Layer 2                            │
└────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ LAYER 2: SHARED STANDARD (Bundled)                     │
│                                                        │
│ Check shared-rules.yaml (bundled with package)         │
│ Common patterns: AMAZON, UBER, NETFLIX, etc.           │
│ If found: return category, confidence=0.9              │
│ If not: continue to Layer 3                            │
└────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ LAYER 3: BASE RULES (User's General Patterns)          │
│                                                        │
│ Check base-rules.yaml for pattern match                │
│ If found: return category, confidence=0.8              │
│ If not: continue to Layer 4                            │
└────────────────────────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────┐
│ LAYER 4: BANK CATEGORY (if available)                  │
│                                                        │
│ Use bank's category field to guess                     │
│ "Restaurant-Restaurant" → 4320                         │
│ If matched: confidence=0.6                             │
│ If not: default to 4999 (UNCATEGORIZED), conf=0.3      │
│         FLAG FOR REVIEW                                │
└────────────────────────────────────────────────────────┘

OUTPUT: category_id=4550 (Vision), confidence=1.0
```

**Layer Summary:**

| Layer | Source | Confidence | Maintainer |
|-------|--------|------------|------------|
| 1. User Rules | `user-rules.yaml` | 1.0 | You (personal overrides) |
| 2. Shared Standard | `shared-rules.yaml` (bundled) | 0.9 | Project maintainer |
| 3. Base Rules | `base-rules.yaml` | 0.8 | You (general patterns) |
| 4. Bank Category | Raw export field | 0.6 | Bank |

### 9.2 Implementation

```typescript
import { normalizeDescription } from './normalize';

interface Rule {
  pattern: string;
  pattern_type?: 'substring' | 'regex';  // Default: substring
  category_id: number;
  note?: string;
}

interface RuleSet {
  user_rules: Rule[];     // Layer 1: Personal overrides
  shared_rules: Rule[];   // Layer 2: Bundled common patterns
  base_rules: Rule[];     // Layer 3: User's general patterns
}

interface CategorizationResult {
  category_id: number;
  confidence: number;
  source: 'user' | 'shared' | 'base' | 'bank' | 'uncategorized';
  needs_review: boolean;
  review_reasons: string[];
}

/**
 * Categorize a transaction using 4-layer rule hierarchy.
 * Rules are checked in order within each layer; more specific patterns should come first.
 */
export function categorize(transaction: Transaction, rules: RuleSet): CategorizationResult {
  const desc = normalizeDescription(transaction.raw_description);

  // Layer 1: User rules (highest priority, confidence 1.0)
  for (const rule of rules.user_rules) {
    if (matchesPattern(desc, rule)) {
      return { category_id: rule.category_id, confidence: 1.0, source: 'user', needs_review: false, review_reasons: [] };
    }
  }

  // Layer 2: Shared standard (bundled, confidence 0.9)
  for (const rule of rules.shared_rules) {
    if (matchesPattern(desc, rule)) {
      return { category_id: rule.category_id, confidence: 0.9, source: 'shared', needs_review: false, review_reasons: [] };
    }
  }

  // Layer 3: Base rules (confidence 0.8)
  for (const rule of rules.base_rules) {
    if (matchesPattern(desc, rule)) {
      return { category_id: rule.category_id, confidence: 0.8, source: 'base', needs_review: false, review_reasons: [] };
    }
  }

  // Layer 4: Bank category (confidence 0.6)
  if (transaction.raw_category) {
    const categoryId = guessFromBankCategory(transaction.raw_category);
    if (categoryId) {
      return { category_id: categoryId, confidence: 0.6, source: 'bank', needs_review: false, review_reasons: [] };
    }
  }

  // Default: UNCATEGORIZED, flag for review
  return { category_id: 4999, confidence: 0.3, source: 'uncategorized', needs_review: true, review_reasons: ['no_rule_match'] };
}

/**
 * Match description against pattern (substring or regex).
 * Regex errors are caught and logged; pattern is skipped.
 */
function matchesPattern(desc: string, rule: Rule): boolean {
  const patternType = rule.pattern_type ?? 'substring';
  
  if (patternType === 'regex') {
    try {
      const regex = new RegExp(rule.pattern, 'i');
      return regex.test(desc);
    } catch (e) {
      console.warn(`Invalid regex pattern: ${rule.pattern}`);
      return false;
    }
  }
  
  // Default: substring match (case-insensitive)
  return desc.includes(rule.pattern.toUpperCase());
}
```

**Rule ordering:** More specific patterns must come before general ones (e.g., "UBER EATS" before "UBER").

**Note on 4999 vs 4990:**
- `4999 UNCATEGORIZED` = categorization failed, needs human input. Visually distinct problem indicator.
- `4990 Miscellaneous` = intentionally categorized as misc (e.g., one-off purchases that don't fit elsewhere).

### 9.3 Description Normalization

```typescript
/**
 * Normalize transaction description for consistent matching.
 */
export function normalizeDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s+/g, ' ')        // Collapse whitespace
    .replace(/[*#]/g, ' ')       // Remove common separators
    .replace(/\s+/g, ' ')        // Re-collapse after removal
    .trim();
}
```

### 9.4 Adding Corrections

When you correct something, add it via CLI:

```bash
npx fineng add-rule "WARBY PARKER" 4550 --note "Vision/eyewear"
```

**Behavior (per IK D10.8):**
1. Validate pattern (min 5 chars, not too broad per IK D4.7/D4.8)
2. Check for collisions with existing rules (warn if overlap)
3. Append to `user-rules.yaml` with metadata
4. Preserve existing comments and formatting (round-trip safe)

This appends to `user-rules.yaml`:
```yaml
- pattern: "WARBY PARKER"
  category_id: 4550
  note: "Vision/eyewear"
  added_date: "2026-01-18"
  source: "manual"
```

Next month, WARBY PARKER automatically categorizes correctly.

### 9.5 Shared Rules Governance

Bundled `shared-rules.yaml` is curated by project maintainer:

| Aspect | Policy |
|--------|--------|
| **Curation** | Maintainer reviews suggestions before inclusion |
| **Submission** | Users can suggest via GitHub issue or opt-in telemetry |
| **Privacy** | Only pattern and category submitted, never descriptions or amounts |
| **Update frequency** | Bundled with each release |
| **Override** | User rules always take precedence |

**Scope:** Universal patterns (AMAZON, UBER, STARBUCKS, NETFLIX). Regional or niche vendors are NOT included.

### 9.6 LLM-Assisted Categorization (Optional)

LLM integration is an optional enhancement layer for handling uncategorized transactions. **The core pipeline must work without LLM.**

| Feature | Description |
|---------|-------------|
| Opt-in | Enabled via `--llm` flag; disabled by default |
| BYOT model | User provides their own API key (Gemini, OpenAI, or Ollama) |
| Human-in-the-loop | LLM suggestions require explicit approval; no auto-commit |
| Confidence | LLM-approved rules get `confidence: 0.85` |
| Isolation | LLM failures never break core pipeline |

> **For detailed LLM integration decisions (14 total), see [Institutional Knowledge Compendium, Section 5](institutional-knowledge.md#5-llm-integration).**

---

## 10. Transaction Matching

### 10.1 What We Match

| Type | Example | Logic |
|------|---------|-------|
| **CC Payment** | "AMEX AUTOPAY" in Chase checking | Links to Amex statement payment received |
| **Internal Transfer** | "Transfer to CHK...3975" | Links to deposit in joint account |

**Not matched in v1:** McKinsey reimbursements are treated as income (DR Cash, CR 3130 Income). Matching reimbursements to original expenses is a reporting feature deferred to post-v1.

### 10.2 Matching Configuration

```typescript
import Decimal from 'decimal.js';

const MATCHING_CONFIG = {
  dateToleranceDays: 5,           // ±5 days between bank sides
  amountTolerance: new Decimal('0.01'),  // Bank rounding tolerance
  cardDisambiguation: 'by_amount_vs_statement',
  partialPaymentHandling: 'flag_for_review',
} as const;

type MatchConfig = typeof MATCHING_CONFIG;
```

### 10.3 Implementation

```typescript
import { differenceInDays, parseISO } from 'date-fns';

interface PaymentPattern {
  keywords: string[];  // Must match at least one keyword (e.g., PAYMENT, AUTOPAY)
  pattern: string;     // Card identifier (e.g., AMEX)
  accounts: number[];  // Possible CC account IDs
}

const PAYMENT_PATTERNS: PaymentPattern[] = [
  { keywords: ['PAYMENT', 'AUTOPAY'], pattern: 'AMEX', accounts: [2122, 2120] },
  { keywords: ['PAYMENT'], pattern: 'CHASE CARD', accounts: [2130] },
  { keywords: ['PAYMENT'], pattern: 'DISCOVER', accounts: [2170] },
];

interface Match {
  type: 'payment';
  bank_txn: Transaction;
  cc_txn: Transaction;
  amount: Decimal;
}

/**
 * Find and link CC payments between bank withdrawals and CC payments received.
 * Requires payment keyword to prevent false positives on short patterns.
 */
export function matchPayments(transactions: Transaction[], config = MATCHING_CONFIG): Match[] {
  const matches: Match[] = [];
  
  const bankTxns = transactions.filter(
    t => [1110, 1120].includes(t.account_id) && new Decimal(t.signed_amount).isNegative()
  );
  
  const ccTxns = transactions.filter(
    t => [2110, 2120, 2122, 2130, 2170].includes(t.account_id) && new Decimal(t.signed_amount).isPositive()
  );
  
  const availableCcTxns = [...ccTxns];

  for (const bankTxn of bankTxns) {
    for (const { keywords, pattern, accounts } of PAYMENT_PATTERNS) {
      // Require payment keyword AND pattern match
      const hasKeyword = keywords.some(kw => bankTxn.description.includes(kw));
      const hasPattern = bankTxn.description.includes(pattern);
      
      if (hasKeyword && hasPattern) {
        const match = findBestMatch(bankTxn, availableCcTxns, accounts, config);
        if (match) {
          matches.push({
            type: 'payment',
            bank_txn: bankTxn,
            cc_txn: match,
            amount: new Decimal(bankTxn.signed_amount).abs(),
          });
          // Remove matched CC txn to prevent double-matching
          const idx = availableCcTxns.indexOf(match);
          if (idx > -1) availableCcTxns.splice(idx, 1);
        } else {
          // Flag when payment pattern matches but no CC candidate found (m5)
          bankTxn.needs_review = true;
          bankTxn.review_reasons.push('payment_pattern_no_cc_match');
        }
      }
    }
  }
  
  return matches;
}

function findBestMatch(
  bankTxn: Transaction,
  ccTxns: Transaction[],
  possibleAccounts: number[],
  config: MatchConfig
): Transaction | null {
  const bankAmount = new Decimal(bankTxn.signed_amount).abs();
  const bankDate = parseISO(bankTxn.effective_date);
  
  const candidates: Array<{ txn: Transaction; dateDiff: number }> = [];
  
  for (const ccTxn of ccTxns) {
    if (!possibleAccounts.includes(ccTxn.account_id)) continue;
    
    const ccAmount = new Decimal(ccTxn.signed_amount).abs();
    const ccDate = parseISO(ccTxn.effective_date);
    
    // Amount must match within tolerance
    if (bankAmount.minus(ccAmount).abs().greaterThan(config.amountTolerance)) continue;
    
    // Date must be within window
    const dateDiff = Math.abs(differenceInDays(bankDate, ccDate));
    if (dateDiff > config.dateToleranceDays) continue;
    
    candidates.push({ txn: ccTxn, dateDiff });
  }
  
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].txn;
  
  // Multiple candidates: pick closest date
  candidates.sort((a, b) => a.dateDiff - b.dateDiff);
  if (candidates[0].dateDiff < candidates[1].dateDiff) {
    return candidates[0].txn;
  }
  
  // Still ambiguous: flag for review, don't auto-match
  bankTxn.needs_review = true;
  bankTxn.review_reasons.push('ambiguous_match_candidates');
  return null;
}
```

### 10.4 Refund Handling

Refunds credit the **original expense account**, not income:

```
Transaction: +$50.00 refund from GAP on Amex Delta (signed_amount = +50.00 on CC)

Journal Entry:
  DR 2122  Amex Delta Sky Reserve   $50.00  (reduce liability - less owed)
  CR 4410  Clothing                  $50.00  (reduce expense - purchase reversed)
```

Refunds are identified by: `signed_amount > 0` on a credit card account where the description matches an expense category (not a payment pattern). The categorizer handles this naturally — "GAP" matches to 4410 Clothing via rules.

**Non-refund positive amounts (rewards, cashback, statement credits):** These are also `signed_amount > 0` on CC but will match reward-specific base_rules (CASHBACK, REWARD, STATEMENT CREDIT → 3250 Cashback/Rewards income). If no rule matches, they fall to 4999 UNCATEGORIZED and are flagged for review — preventing silent misclassification as expense refunds.

### 10.5 Double-Entry for Matched Payments

When a CC payment is matched:

```
Bank withdrawal: signed_amount = -$1,234.56 from Chase Checking
CC payment:      signed_amount = +$1,234.56 on Amex Delta

Journal Entry:
  DR 2122  Amex Delta Sky Reserve    $1,234.56  (reduce liability)
  CR 1120  Chase Checking 6917       $1,234.56  (reduce asset)
```

---

## 11. Usage & Workflow

### 11.1 Run Safety

**Transaction ID (txn_id):** Every parsed transaction gets a deterministic SHA-256 hash based on `effective_date + raw_description + signed_amount + account_id`. Same input always produces same ID regardless of source filename. Collisions (e.g., two identical charges same day) get deterministic suffixes (`-02`, `-03`).

**Run Manifest:** Each successful run writes `outputs/YYYY-MM/run_manifest.json`:
```json
{
    "month": "2026-01",
    "run_timestamp": "2026-01-20T14:32:00.000Z",
    "input_files": {
        "amex_2122_202601.xlsx": "sha256:abc123...",
        "chase_1120_202601.csv": "sha256:def456..."
    },
    "transaction_count": 147,
    "txn_ids": ["a1b2c3...", "d4e5f6...", "..."],
    "collision_map": {
        "a1b2c3d4e5f67890": 2
    },
    "version": "2.0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `collision_map` | object | Base txn_id → collision count (only for collisions) |
| `version` | string | Manifest schema version |

**Overwrite policy:** If `outputs/YYYY-MM/` already exists:
- Default: refuse to run, print warning with previous run timestamp
- `--force`: overwrite previous output
- Previous output is never silently destroyed

### 11.2 Monthly Workflow

```bash
# 1. Download exports from each institution
#    Save to: workspace/imports/2026-01/
#    Use naming: {bank}_{accountID}_{YYYYMM}.{ext}

# 2. Dry run (optional - see what would happen)
npx fineng process 2026-01 --dry-run

# 3. Run the processor
npx fineng process 2026-01

# 4. Review outputs
#    - workspace/outputs/2026-01/analysis.xlsx   (spending by category)
#    - workspace/outputs/2026-01/journal.xlsx    (double-entry ready to paste)
#    - workspace/outputs/2026-01/review.xlsx     (flagged items to check)

# 5. Fix any flagged items
#    Option A: Manually fix in review.xlsx, ignore for rules
#    Option B: Add rule for future:
npx fineng add-rule "NEW VENDOR" 4320 "This is a restaurant"

# 6. Copy journal entries to master Excel file
#    (human checkpoint - verify before pasting)
```

### 11.3 Error Handling

**Philosophy:** Skip and warn, then prompt.

```typescript
interface ParseResult {
  filename: string;
  transactions: Transaction[];
  skippedCount: number;
  invalidDates: number;
}

const errors: Array<{ filename: string; error: string }> = [];
const results: ParseResult[] = [];
let totalInvalidDates = 0;

for (const file of importFiles) {
  // Skip hidden files and temp files (m2)
  if (file.name.startsWith('.') || file.name.startsWith('~')) continue;
  
  try {
    const result = detectParser(file.name);
    if (!result) {
      console.warn(`⚠ Skipping unrecognized file: ${file.name}`);
      continue;
    }
    
    const { parser, accountId } = result;
    
    // Warn if account not in accounts.json
    if (accountId && !(accountId.toString() in accounts)) {
      console.warn(`⚠ Unknown account ${accountId} in ${file.name}`);
    }
    
    const parsed = parser(file.data, accountId);
    
    // Track skipped transactions with invalid dates (m6)
    totalInvalidDates += parsed.invalidDates ?? 0;
    
    // Flag transactions from unknown accounts
    if (accountId && !(accountId.toString() in accounts)) {
      for (const txn of parsed.transactions) {
        txn.needs_review = true;
        txn.review_reasons.push(`unknown_account: ${accountId}`);
      }
    }
    
    results.push(parsed);
    console.log(`✓ Parsed ${file.name}: ${parsed.transactions.length} transactions`);
  } catch (e) {
    errors.push({ filename: file.name, error: String(e) });
  }
}

// Report skipped dates (m6)
if (totalInvalidDates > 0) {
  console.warn(`⚠ Skipped ${totalInvalidDates} transactions with unparseable dates`);
}

if (errors.length > 0) {
  console.warn(`\n⚠ ${errors.length} file(s) had errors:`);
  for (const { filename, error } of errors) {
    console.error(`  ✗ ${filename}: ${error}`);
  }
  
  // Check for --yes flag or TTY for auto-continue
  if (!options.yes && process.stdin.isTTY) {
    const response = await promptUser('Continue with partial data? [y/N] ');
    if (response.toLowerCase() !== 'y') {
      process.exit(1);
    }
  }
}
```

### 11.4 Total Validation

Before writing output, verify accounting integrity:

```typescript
import Decimal from 'decimal.js';

function validateJournal(journal: JournalEntry[]): void {
  let totalDebits = new Decimal(0);
  let totalCredits = new Decimal(0);
  
  for (const entry of journal) {
    for (const line of entry.lines) {
      if (line.debit) totalDebits = totalDebits.plus(line.debit);
      if (line.credit) totalCredits = totalCredits.plus(line.credit);
    }
  }
  
  if (!totalDebits.equals(totalCredits)) {
    console.error(`ERROR: Books don't balance! DR=${totalDebits} CR=${totalCredits}`);
    console.error(`Difference: ${totalDebits.minus(totalCredits).abs()}`);
    process.exit(1);
  }
  
  console.log(`✓ Validated: Total DR = Total CR = $${totalDebits.toFixed(2)}`);
}
```

### 11.5 Input Archiving

After successful processing:
```
imports/2026-01/  →  archive/2026-01/raw/  (move)
```

Enables re-running from original files if needed (copy back from archive).

### 11.6 Command-Line Flags

```bash
npx fineng process YYYY-MM [--dry-run] [--force] [--yes] [--llm]
```

| Flag | Behavior |
|------|----------|
| `--dry-run` | Parse, categorize, match — print summary, write no files |
| `--force` | Overwrite existing output for this month |
| `--yes` | Auto-continue on errors (non-interactive/CI mode) |
| `--llm` | Enable LLM-assisted categorization (see Section 9.6) |
| (none) | Normal run; refuse if output exists |

> **For implementation lessons learned from v1.x, see [Institutional Knowledge Compendium, Section 11](institutional-knowledge.md#11-implementation-lessons).**

### 11.7 Output Schemas

#### journal.xlsx

| Column | Type | Description |
|--------|------|-------------|
| entry_id | int | Sequential entry number |
| date | date | effective_date of transaction |
| description | str | Normalized description |
| account_id | int | 4-digit account code |
| account_name | str | Human-readable account name |
| debit | Decimal | Debit amount (blank if credit) |
| credit | Decimal | Credit amount (blank if debit) |
| txn_id | str | Hash for traceability |

Footer row: `Total Debits: $X | Total Credits: $X` (must match)

#### review.xlsx

| Column | Type | Description |
|--------|------|-------------|
| txn_id | str | Transaction hash |
| date | date | effective_date |
| raw_description | str | Original bank description |
| signed_amount | Decimal | Signed amount |
| account_name | str | Source account |
| suggested_category | str | Best-guess category name |
| confidence | float | 0.0-1.0 confidence score |
| review_reason | str | Why this was flagged |
| your_category_id | str | (blank — user fills in) |

**Sorted by confidence ascending** (least certain items first).

#### analysis.xlsx

| Sheet | Content |
|-------|---------|
| By Category | category_id, category_name, total_amount, transaction_count |
| By Account | account_id, account_name, total_in, total_out, net |
| Summary | Total income, total expenses, net savings, flagged count, flagged total |

#### run_manifest.json

Written to `outputs/YYYY-MM/run_manifest.json` (see Section 11.1).

---

## 12. Chart of Accounts

### 12.1 Structure (4-digit, expandable)

```
1000s = ASSETS (what you own)
2000s = LIABILITIES (what you owe)
3000s = INCOME (money in)
4000s = EXPENSES (money out)
5000s = SPECIAL (family, work, equity)
```

### 12.2 Complete List

*(See accounts.json for full details)*

**1000 - ASSETS**
- 1100s: Cash & Checking (1110 BoA, 1120 Chase, etc.)
- 1200s: Investments (1240 Schwab, 1250 IBKR, etc.)
- 1300s: Receivables

**2000 - LIABILITIES**
- 2100s: Credit Cards (2110 BoA, 2120 Amex Plat, 2122 Amex Delta, etc.)
- 2200s: Payables
- 2300s: Loans

**3000 - INCOME**
- 3100s: Employment (3110 Salary, 3130 McKinsey Reimbursement)
- 3200s: Investment Income (3250 Cashback/Rewards)
- 3300s: Other Income

**4000 - EXPENSES**
- 4100s: Housing (4110 Rent, 4150 Utilities)
- 4200s: Transportation (4260 Rideshare, 4270 Transit, 4280 Flights)
- 4300s: Food (4310 Groceries, 4320 Restaurants, 4340 Delivery)
- 4400s: Shopping (4410 Clothing, 4420 Electronics)
- 4500s: Health (4520 Medical, 4550 Vision)
- 4600s: Entertainment (4610 Subscriptions)
- 4700s: Financial (4740 Tax Prep, 4750 Tax Payment)
- 4800s: Education (4860 Software Subscriptions)
- 4900s: Other (4910 Gifts Given, 4990 Miscellaneous, **4999 UNCATEGORIZED**)

**5000 - SPECIAL**
- 5100s: Family Joint Accounts
- 5200s: McKinsey Work

**Note on 4999:** Any amount in UNCATEGORIZED after review indicates unprocessed categorization. This should be zero in the final journal. It is visually distinct from 4990 Miscellaneous (which is a valid intentional category).

---

## 13. Decisions Log

These questions were raised during design and review. All are now resolved.

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| Q1 | File format for rules? | YAML | Frequently edited; supports comments for context |
| Q2 | Historical data migration? | Don't migrate | 10 years of Excel stays as-is. Tool is for going forward. |
| Q3 | Error handling? | Skip-and-warn + prompt | Personal tool shouldn't crash on one bad row |
| Q4 | Testing approach? | Parser tests only | Most likely to break (bank format changes). Keep sample files. |
| Q5 | Version control for rules? | Git track (private repo) | Vendor names can reveal sensitive info (health, legal). Repo must be private. Test fixtures use anonymized data. Audit trail is valuable. |
| Q6 | Output format? | Excel copy-paste | Safety: never let tool touch 10-year master ledger |
| Q7 | Duplicate imports? | Hash + manifest + refuse overwrite | Deterministic txn_id prevents double-entry |

### Implementation Decisions (resolved during review)

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Date handling | Use txn_date for bucketing; fallback post_date with flag | Matches bank's transaction date, not settlement |
| Amount precision | `decimal.js` throughout | Prevents penny drift |
| Foreign currency | Out of scope for v1 | All accounts are USD |
| Description normalization | Uppercase + strip whitespace/separators | Prevents matching failures |
| Reimbursements | Treat as income (not matched to expense) | Simpler; matching is a reporting feature |
| Refunds | Credit original expense account | Prevents budget inflation |
| Rewards/Cashback | Route to 3250 income via base_rules | Prevents misclassification as expense refunds |
| Unknown accounts | Warn + flag for review | account_id not in accounts.json is likely a typo; don't auto-create |

---

## 14. Future Expansion Path

### 14.1 If YAML Gets Unwieldy → SQLite

**Trigger:** When combined rules files exceed 200 rules, or you want to query historical transactions.

**Migration:**
1. Add `db/` folder with SQLite
2. Write migration script to import YAML
3. Update categorizer to read from DB
4. Keep YAML as backup/export format

### 14.2 If Manual Exports Get Tedious → Plaid

**Trigger:** When downloading 6+ files monthly becomes unbearable.

**Migration:**
1. Add Plaid API integration
2. Add `fetch_month.py` script
3. Keep parsers as fallback for institutions not in Plaid

### 14.3 If CLI Gets Complex → Click

**Trigger:** When you want `--verbose`, proper help text, multiple subcommands.

**Migration:**
1. Add Click dependency
2. Wrap existing functions in Click commands
3. Keep ability to call functions directly from Python

### 14.4 If You Want a Dashboard → Web UI

**Trigger:** When you want visualizations beyond Excel charts.

**Migration:**
1. Add Flask/FastAPI backend
2. Add React frontend
3. Engine becomes the API layer
4. CLI remains for automation

### 14.5 Deferred from Review (Post-v1)

| Feature | Source | Target | Notes |
|---------|--------|--------|-------|
| **Split transactions** | Gemini review | v2 | 1 transaction → N category line items. Requires data model change. |
| **Interactive review mode** | Gemini review | post-v1 | Terminal prompts for low-confidence items during processing. |
| **Cross-month unmatched state** | Gemini review | v2 | `unmatched_transfers.json` for payments that cross month boundaries. |

---

## 15. Appendix

### A. Dependencies (package.json)

```json
{
  "dependencies": {
    "decimal.js": "^10.4.0",
    "xlsx": "^0.18.0",
    "yaml": "^2.3.0",
    "date-fns": "^3.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

Minimal, focused dependencies. No heavy frameworks.

> **For TypeScript implementation patterns (decimal.js, yaml, date-fns equivalents to Python), see [Institutional Knowledge Compendium, Appendix D](institutional-knowledge.md#appendix-d-typescript-migration-notes).**

### B. Sample Session

```bash
$ npx fineng process 2026-01

Loading config...
✓ 126 accounts loaded
✓ 52 categorization rules loaded

Parsing imports/2026-01/...
✓ amex_2122_202601.xlsx: 23 transactions
✓ amex_2120_202601.xlsx: 8 transactions
✓ chase_1120_202601.csv: 45 transactions
✓ boa_1110_202601.csv: 31 transactions
✓ boa_2110_202601.csv: 12 transactions
✓ fidelity_2180_202601.csv: 6 transactions
✓ discover_2170_202601.xls: 22 transactions

Deduplicating...
✓ 147 unique transactions (0 duplicates removed)

Categorizing...
✓ 141/147 categorized with high confidence (96%)
⚠ 6 flagged for review (see review.xlsx, sorted by confidence)

Matching payments...
✓ 4 CC payments matched

Generating journal entries...
✓ 151 journal entries created
✓ Validated: Total DR = Total CR = $14,832.67

Exporting...
→ outputs/2026-01/analysis.xlsx
→ outputs/2026-01/journal.xlsx
→ outputs/2026-01/review.xlsx
→ outputs/2026-01/run_manifest.json

Archiving inputs...
→ imports/2026-01/ moved to archive/2026-01/raw/

Done! Review 6 flagged items in review.xlsx
```

### C. Double-Entry Examples

**Simple expense (restaurant):**
```
Transaction: signed_amount = -$47.23 at Olive Garden on Amex Delta

Journal Entry:
  DR 4320  Restaurants              $47.23
  CR 2122  Amex Delta Sky Reserve   $47.23
```

**CC payment:**
```
Transaction: signed_amount = -$1,234.56 Amex autopay from Chase

Journal Entry:
  DR 2122  Amex Delta Sky Reserve   $1,234.56  (reduce what you owe)
  CR 1120  Chase Checking 6917      $1,234.56  (reduce your cash)
```

**Transfer to joint account:**
```
Transaction: signed_amount = -$500.00 transfer to joint checking

Journal Entry:
  DR 5110  Chase Joint Checking     $500.00  (increase joint account)
  CR 1120  Chase Checking 6917      $500.00  (reduce personal account)
```

**McKinsey reimbursement received:**
```
Transaction: signed_amount = +$234.56 MCK CO INC deposit

Journal Entry:
  DR 1120  Chase Checking 6917      $234.56  (cash received)
  CR 3130  McKinsey Reimbursement   $234.56  (income)
```

**Refund on credit card:**
```
Transaction: signed_amount = +$50.00 GAP refund on Amex Delta

Journal Entry:
  DR 2122  Amex Delta Sky Reserve   $50.00  (reduce liability)
  CR 4410  Clothing                  $50.00  (reduce expense)
```

### D. Old PR Code Mapping

| Old | Old Name | New | New Name |
|-----|----------|-----|----------|
| 301 | Food, drinks | 4320 | Restaurants |
| 311 | Transportation | 4270 | Public Transit |
| 315 | Auto, car expense | 4260 | Rideshare |
| 336 | Office subscription | 4860 | Software Subscriptions |
| 398 | ETC Expense | 4990 | Miscellaneous Expense |
| 423 | Amex Delta Sky Reserve | 2122 | Amex Delta Sky Reserve |
| 455 | Chase Checking 6917 | 1120 | Chase Checking 6917 |

*(Full mapping in Chart_of_Accounts_v3_Migration.xlsx)*

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-18 | Initial PRD (overengineered) |
| 2.0 draft | 2026-01-18 | Lightweight revision - removed SQLite, simplified API |
| 1.1 | 2026-01-22 | Post-review revision: 3 LLM reviews incorporated. |
| 1.2 | 2026-01-22 | Final Python v1.x revision. See archived docs. |
| 2.0 | 2026-01-27 | TypeScript rewrite. Monorepo structure, headless core, Zod schemas, npm dependencies. All business logic preserved from v1.x per Institutional Knowledge Compendium. |
| 2.1 | 2026-01-31 | Aligned with IK v1.2: manifest schema (collision_map, version), txn_id normalization spec, file processing order, rules filename convention, workspace auto-detection, shared rules governance, core/CLI serialization boundary. |
| **2.2** | **2026-01-31** | **Codex review fixes:** 4-layer references throughout, rules.yaml cleanup, `decimal.js` syntax, shared rules bundling clarification. |

---

*This document is the implementation-ready specification for the v2.0 TypeScript rewrite. It prioritizes simplicity, cross-platform compatibility, and maintainability. The [Institutional Knowledge Compendium](institutional-knowledge.md) contains detailed decision rationale.*
