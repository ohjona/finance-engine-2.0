# Finance Engine v2.0

**Personal finance automation for monthly bookkeeping**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ohjona/finance-engine-2.0)
[![Tests](https://img.shields.io/badge/tests-246%20passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## Overview

Finance Engine v2.0 is a TypeScript-based personal finance automation tool that transforms monthly bank statement processing from a 2-hour manual task into a 10-minute automated workflow.

**Key features:**
- Parse bank exports from 6 institutions (Amex, Chase, BoA, Fidelity, Discover)
- Auto-categorize transactions using a 4-layer rule hierarchy
- Match credit card payments to bank withdrawals
- Generate double-entry journal entries
- Output Excel files ready for your accounting system

**Privacy-first:** All processing happens locally on your machine. No data is sent to any server.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/ohjona/finance-engine-2.0.git
cd finance-engine-2.0

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Process a month of transactions
npx fineng process 2026-01

# Add a categorization rule
npx fineng add-rule "STARBUCKS" 4200 --note "Coffee"
```

---

## Features

### Bank Parsers

| Institution | File Format | Example Filename |
|-------------|-------------|------------------|
| American Express | XLSX | `amex_2122_202601.xlsx` |
| Chase Checking | CSV | `chase_checking_1110_202601.csv` |
| Bank of America Checking | CSV | `boa_checking_1120_202601.csv` |
| Bank of America Credit | CSV | `boa_credit_2130_202601.csv` |
| Fidelity | CSV | `fidelity_1140_202601.csv` |
| Discover | CSV | `discover_2150_202601.csv` |

### 4-Layer Categorization

| Priority | Layer | Confidence | Source |
|----------|-------|------------|--------|
| 1 (highest) | User Rules | 1.0 | `config/user-rules.yaml` |
| 2 | Shared Rules | 0.9 | Bundled with CLI |
| 3 | Base Rules | 0.8 | `config/base-rules.yaml` |
| 4 | Bank Category | 0.6 | From bank export |
| Fallback | Uncategorized | 0.3 | Category ID: 4999 |

### Payment Matching

Automatically matches credit card payments in your checking account to the corresponding payment received on your credit card statement:

- Date tolerance: 5 days
- Amount tolerance: $0.01
- Supported patterns: AMEX, CHASE CARD, DISCOVER, and more

### Excel Output

| File | Description |
|------|-------------|
| `journal.xlsx` | Double-entry journal entries with debit/credit columns and footer totals |
| `review.xlsx` | Transactions needing review, sorted by confidence (lowest first) |
| `analysis.xlsx` | Summary sheets: By Category, By Account, Summary |
| `run_manifest.json` | Processing metadata with file hashes and transaction IDs |

---

## Workspace Setup

Finance Engine expects a workspace with the following structure:

```
my-finances/
├── config/
│   ├── accounts.json       # Chart of accounts (required)
│   ├── user-rules.yaml     # Your personal categorization rules
│   └── base-rules.yaml     # General categorization patterns
├── imports/
│   └── 2026-01/            # Monthly import folders
│       ├── amex_2122_202601.xlsx
│       ├── chase_checking_1110_202601.csv
│       └── ...
├── outputs/
│   └── 2026-01/            # Generated output files
│       ├── journal.xlsx
│       ├── review.xlsx
│       ├── analysis.xlsx
│       └── run_manifest.json
└── archive/
    └── 2026-01/raw/        # Archived source files
```

The CLI auto-detects your workspace by looking for `config/user-rules.yaml` in the current or parent directories.

---

## Configuration

### Chart of Accounts (`config/accounts.json`)

```json
{
  "accounts": {
    "1110": {
      "name": "Chase Checking",
      "type": "asset",
      "institution": "Chase"
    },
    "2122": {
      "name": "Amex Delta Reserve",
      "type": "liability",
      "institution": "American Express"
    },
    "4200": {
      "name": "Dining",
      "type": "expense"
    }
  }
}
```

**Account ID ranges:**
- `1000-1999`: Assets (checking, savings)
- `2000-2999`: Liabilities (credit cards)
- `3000-3999`: Income
- `4000-4999`: Expenses
- `5000-5999`: Special (transfers, matched payments)

### Categorization Rules (`config/user-rules.yaml`)

```yaml
# Personal rules - highest priority
- pattern: "UBER EATS"
  category_id: 4200
  pattern_type: substring
  note: "Food delivery"

- pattern: "^AMAZON.*PRIME"
  category_id: 4500
  pattern_type: regex
  note: "Amazon Prime subscription"

- pattern: "STARBUCKS"
  category_id: 4200
```

**Rule fields:**
| Field | Required | Description |
|-------|----------|-------------|
| `pattern` | Yes | Substring or regex pattern to match |
| `category_id` | Yes | Target category ID |
| `pattern_type` | No | `substring` (default) or `regex` |
| `note` | No | Human-readable description |

**Rule ordering:** More specific patterns should appear before general ones. For example, "UBER EATS" should come before "UBER" to prevent the general pattern from matching first.

### Bank Export File Naming

Files must follow this convention:
```
{institution}_{accountID}_{YYYYMM}.{ext}
```

| Institution | Prefix | Extension |
|-------------|--------|-----------|
| American Express | `amex` | `.xlsx` |
| Chase Checking | `chase_checking` | `.csv` |
| Bank of America Checking | `boa_checking` | `.csv` |
| Bank of America Credit | `boa_credit` | `.csv` |
| Fidelity | `fidelity` | `.csv` |
| Discover | `discover` | `.csv` |

---

## CLI Commands

### Process Month

```bash
npx fineng process <YYYY-MM> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--dry-run` | Parse and analyze without writing output files |
| `--force` | Overwrite existing output for this month |
| `--yes` | Auto-continue on errors (non-interactive mode) |
| `--workspace <path>` | Override workspace directory |
| `--llm` | Enable LLM-assisted categorization (Phase 6, placeholder) |

**10-Step Pipeline:**
1. **MANIFEST CHECK** - Verify no duplicate processing
2. **DETECT** - Find import files matching parser patterns
3. **PARSE** - Parse files into normalized transactions
4. **DEDUP** - Remove duplicate transactions by txn_id
5. **CATEGORIZE** - Apply 4-layer rule-based categorization
6. **MATCH** - Match CC payments to bank withdrawals
7. **JOURNAL** - Generate double-entry journal entries
8. **VALIDATE** - Verify accounting rules and data integrity
9. **EXPORT** - Write Excel files and manifest
10. **ARCHIVE** - Move processed imports to archive

### Add Rule

```bash
npx fineng add-rule <PATTERN> <CATEGORY_ID> [options]
```

**Options:**
| Flag | Description |
|------|-------------|
| `--note <text>` | Add a description to the rule |
| `--workspace <path>` | Override workspace directory |

**Validation:**
- Pattern must be at least 5 characters
- Collision detection against existing rules

**Example:**
```bash
npx fineng add-rule "TRADER JOE" 4100 --note "Groceries"
```

---

## Architecture

### Monorepo Structure

```
finance-engine-2.0/
├── packages/
│   ├── core/               # @finance-engine/core
│   │   ├── src/
│   │   │   ├── parser/     # Bank-specific parsers
│   │   │   ├── categorizer/# 4-layer categorization
│   │   │   ├── matcher/    # Payment matching
│   │   │   ├── ledger/     # Double-entry generation
│   │   │   └── utils/      # Shared utilities
│   │   └── tests/          # 210 tests
│   │
│   ├── shared/             # @finance-engine/shared
│   │   ├── src/
│   │   │   ├── schemas.ts  # Zod validation schemas
│   │   │   └── constants.ts# Configuration constants
│   │   └── tests/          # 20 tests
│   │
│   ├── cli/                # @finance-engine/cli
│   │   ├── src/
│   │   │   ├── commands/   # CLI command handlers
│   │   │   ├── pipeline/   # 10-step pipeline
│   │   │   ├── workspace/  # Workspace detection
│   │   │   ├── excel/      # Excel output generation
│   │   │   └── yaml/       # YAML file handling
│   │   └── tests/          # 16 tests
│   │
│   └── web/                # @finance-engine/web (future)
│
├── docs/                   # Documentation
│   ├── finance-engine-2.0-PRD.md
│   ├── institutional-knowledge.md
│   └── v2.0-architecture-roadmap.md
│
└── scripts/                # Build utilities
```

### Package Responsibilities

| Package | Purpose | I/O |
|---------|---------|-----|
| `@finance-engine/core` | Business logic (parsing, categorization, matching, ledger) | None (headless) |
| `@finance-engine/shared` | Types, schemas, constants | None |
| `@finance-engine/cli` | File I/O, Excel output, user interaction | Yes |
| `@finance-engine/web` | Browser-based UI (future) | Yes |

### Serialization Boundary

The core package is **headless** - it has no file I/O or console output. This enables:
- Browser execution without Node.js dependencies
- Pure function testing
- Platform-agnostic business logic

| Layer | Responsibility |
|-------|---------------|
| CLI/Web | Read files, parse YAML/JSON, handle user input |
| Core | Process data, return results as objects |
| CLI/Web | Write output files, display results |

---

## Development

### Prerequisites

- Node.js 20+
- pnpm 9+

### Scripts

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run all tests (246 total)
pnpm test

# Run tests for a specific package
pnpm -F @finance-engine/core test
pnpm -F @finance-engine/cli test

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Formatting
pnpm format

# Clean build artifacts
pnpm clean

# Verify architecture constraints (no node: imports in core)
pnpm verify:core-constraints
```

### Adding a New Parser

1. Create parser file in `packages/core/src/parser/`:
```typescript
// new-bank.ts
import type { Transaction } from '@finance-engine/shared';

export function parseNewBank(
    data: ArrayBuffer,
    accountId: number,
    filename: string
): Transaction[] {
    // Parse implementation
}
```

2. Register in `packages/core/src/parser/detect.ts`:
```typescript
const PARSER_REGISTRY = {
    // ... existing parsers
    'new_bank': { parser: parseNewBank, extensions: ['.csv'] },
};
```

3. Add tests in `packages/core/tests/parser/new-bank.test.ts`

---

## Testing

**Framework:** Vitest

**Test counts:**
| Package | Tests |
|---------|-------|
| `@finance-engine/core` | 210 |
| `@finance-engine/shared` | 20 |
| `@finance-engine/cli` | 16 |
| **Total** | **246** |

**Running tests:**
```bash
# All tests
pnpm test

# Single package
pnpm -F @finance-engine/core test

# Watch mode
pnpm -F @finance-engine/core test -- --watch
```

---

## Roadmap

### Completed (v2.0)
- [x] Phase 1: Utilities (hashing, date parsing, normalization)
- [x] Phase 2: Parsers (6 bank parsers)
- [x] Phase 3: Categorizer (4-layer rule system)
- [x] Phase 4: Matcher & Ledger (payment matching, double-entry)
- [x] Phase 5: CLI (workspace management, pipeline, Excel output)

### Planned
- [ ] Phase 6: LLM-assisted categorization (BYOT - Bring Your Own Token)
- [ ] Web UI for browser-based processing
- [ ] Mobile app via React Native

---

## Documentation

| Document | Description |
|----------|-------------|
| [PRD v2.2](docs/finance-engine-2.0-PRD.md) | Product requirements and design decisions |
| [Architecture Roadmap](docs/v2.0-architecture-roadmap.md) | Technical architecture and package design |
| [Institutional Knowledge](docs/institutional-knowledge.md) | Lessons learned and implementation details |

---

## Contributing

This is a personal project, but contributions are welcome:

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Ensure all tests pass (`pnpm test`)
5. Submit a pull request

---

## License

MIT

---

*Built with TypeScript, Vitest, and a commitment to privacy-first personal finance automation.*
