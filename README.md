# Finance Engine v2.0

**Personal finance automation for monthly bookkeeping**

[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/ohjonathan/finance-engine-2.0)
[![Tests](https://img.shields.io/badge/tests-246%20passing-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Finance Engine automates monthly bank statement processing. Parse exports from multiple banks, auto-categorize transactions, match credit card payments, and generate double-entry journal entries—all locally on your machine.

## Quick Start

```bash
git clone https://github.com/ohjonathan/finance-engine-2.0.git
cd finance-engine-2.0
pnpm install && pnpm build

# Process a month
npx fineng process 2026-01

# Add a rule
npx fineng add-rule "STARBUCKS" 4200 --note "Coffee"
```

## Features

### Supported Banks

| Institution | Format | Filename Pattern |
|-------------|--------|------------------|
| American Express | XLSX | `amex_{id}_{YYYYMM}.xlsx` |
| Chase Checking | CSV | `chase_checking_{id}_{YYYYMM}.csv` |
| Bank of America Checking | CSV | `boa_checking_{id}_{YYYYMM}.csv` |
| Bank of America Credit | CSV | `boa_credit_{id}_{YYYYMM}.csv` |
| Fidelity | CSV | `fidelity_{id}_{YYYYMM}.csv` |
| Discover | CSV | `discover_{id}_{YYYYMM}.csv` |

### 4-Layer Categorization

| Priority | Layer | Confidence | Source |
|----------|-------|------------|--------|
| 1 | User Rules | 1.0 | `config/user-rules.yaml` |
| 2 | Shared Rules | 0.9 | Bundled with CLI |
| 3 | Base Rules | 0.8 | `config/base-rules.yaml` |
| 4 | Bank Category | 0.6 | From export file |
| — | Uncategorized | 0.3 | Fallback (ID: 4999) |

### Payment Matching

Matches credit card payments in checking accounts to CC statements. Tolerance: 5 days, $0.01.

### Output Files

| File | Content |
|------|---------|
| `journal.xlsx` | Double-entry journal with debit/credit columns |
| `review.xlsx` | Transactions needing review (sorted by confidence) |
| `analysis.xlsx` | Summaries by category, account, and totals |

## Setup

### Workspace Structure

```
my-finances/
├── config/
│   ├── accounts.json      # Your chart of accounts
│   ├── user-rules.yaml    # Your categorization rules
│   └── base-rules.yaml    # General patterns
├── imports/2026-01/       # Drop bank exports here
├── outputs/2026-01/       # Generated files
└── archive/2026-01/       # Processed files moved here
```

The CLI auto-detects workspaces by looking for `config/user-rules.yaml`.

### Chart of Accounts

Create `config/accounts.json` mapping your accounts. Use the last 4 digits of account numbers as IDs:

```json
{
  "accounts": {
    "5678": { "name": "Chase Checking", "type": "asset", "institution": "Chase" },
    "1234": { "name": "Amex Gold", "type": "liability", "institution": "Amex" },
    "4100": { "name": "Groceries", "type": "expense" },
    "4200": { "name": "Dining", "type": "expense" },
    "4300": { "name": "Transportation", "type": "expense" }
  }
}
```

**ID Ranges:** 1000-1999 (assets), 2000-2999 (liabilities), 3000-3999 (income), 4000-4999 (expenses)

### Categorization Rules

Create `config/user-rules.yaml`:

```yaml
- pattern: "UBER EATS"
  category_id: 4200
  note: "Food delivery"

- pattern: "^AMAZON.*PRIME"
  pattern_type: regex
  category_id: 4500
```

Place specific patterns before general ones ("UBER EATS" before "UBER").

### File Naming

Name your bank exports: `{parser}_{accountID}_{YYYYMM}.{ext}`

Examples: `amex_1234_202601.xlsx`, `chase_checking_5678_202601.csv`

## CLI Commands

### Process Month

```bash
npx fineng process <YYYY-MM> [options]
```

| Flag | Description |
|------|-------------|
| `--dry-run` | Parse without writing files |
| `--force` | Overwrite existing output |
| `--yes` | Auto-continue on errors |
| `--workspace <path>` | Override workspace |

**Pipeline:**
1. **MANIFEST CHECK** — Prevent duplicate processing
2. **DETECT** — Find import files
3. **PARSE** — Normalize transactions
4. **DEDUP** — Remove duplicates by txn_id
5. **CATEGORIZE** — Apply 4-layer rules
6. **MATCH** — Link CC payments to bank withdrawals
7. **JOURNAL** — Generate double-entry entries
8. **VALIDATE** — Check accounting rules
9. **EXPORT** — Write Excel files
10. **ARCHIVE** — Move imports to archive

### Add Rule

```bash
npx fineng add-rule <PATTERN> <CATEGORY_ID> [--note "description"]
```

Pattern must be 5+ characters. Checks for collisions with existing rules.

## Architecture

```
packages/
├── core/      # Business logic (headless, no I/O)
├── shared/    # Types, schemas, constants
├── cli/       # File I/O, Excel output
└── web/       # Browser UI (future)
```

| Package | Purpose | I/O |
|---------|---------|-----|
| `@finance-engine/core` | Parsing, categorization, matching, ledger | None |
| `@finance-engine/shared` | Zod schemas, constants | None |
| `@finance-engine/cli` | Workspace, pipeline, Excel | Yes |

The core is headless—no file I/O or console output—enabling browser execution and pure function testing.

## Development

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests (246 total)
pnpm typecheck        # Type check
pnpm lint             # Lint
pnpm format           # Format
```

### Adding a Parser

1. Create `packages/core/src/parser/new-bank.ts`
2. Register in `packages/core/src/parser/detect.ts`
3. Add tests in `packages/core/tests/parser/`

## Testing

| Package | Tests |
|---------|-------|
| core | 210 |
| shared | 20 |
| cli | 16 |

## Roadmap

- [x] Phase 1-5: Core engine complete
- [ ] Phase 6: LLM-assisted categorization
- [ ] Web UI
- [ ] Mobile app

## Documentation

- [PRD](docs/finance-engine-2.0-PRD.md) — Product requirements
- [Architecture](docs/v2.0-architecture-roadmap.md) — Technical design
- [Institutional Knowledge](docs/institutional-knowledge.md) — Lessons learned

## License

MIT
