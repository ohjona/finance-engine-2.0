# Phase 5 Implementation Prompt: CLI Integration

**Role:** Chief Architect
**Model:** Claude Opus 4.5
**Date:** 2026-02-02
**Input Documents:** PRD v2.2, IK v1.2, Phase 1-4 merged codebase

---

## Overview

Phase 5 completes the Finance Engine v2.0 CLI implementation. Phases 1-4 built the headless core (parsers, categorizer, matcher, ledger). Phase 5 wires it all together with file I/O, config loading, Excel output, and CLI commands.

**What Phase 5 Builds:**
- Workspace auto-detection and path resolution
- Config loading (accounts.json, 3 YAML rules files)
- 10-step pipeline orchestrator (`process` command)
- Excel output writers (journal, review, analysis)
- YAML round-trip safe rule addition (`add-rule` command)
- Run manifest and input archiving

---

## Design Decisions

### 1. Phase Sizing: Single PR

**Decision:** Single PR (`phase-5/cli`)

**Rationale:**
- ~900 prod + ~600 test LOC is large but manageable in one review
- Components are tightly coupled — splitting creates artificial boundaries
- Phase 4 was ~500+400 LOC as a single PR
- CLI is the integration layer; E2E testing requires all pieces together

**Mitigation:** Use focused commits (8-10), clear PR description with component breakdown.

### 2. CLI Framework: `commander`

**Decision:** Use `commander` (lightweight CLI framework)

**Rationale:**
- Two subcommands (`process`, `add-rule`) and four flags is non-trivial
- `commander` provides automatic `--help`, `--version`, type validation
- ~40KB, widely adopted, excellent TypeScript support
- Raw `process.argv` would require manual flag parsing and help generation

**Add to package.json:**
```json
"dependencies": {
  "commander": "^11.0.0"
}
```

### 3. Excel Library: `exceljs`

**Decision:** Use `exceljs` for Excel output

**Rationale:**
- MIT license (no commercial concerns unlike SheetJS)
- Full formatting support (column widths, number formats, footer rows)
- Multiple sheets support (analysis.xlsx has 3 sheets)
- Good TypeScript support

**Add to package.json:**
```json
"dependencies": {
  "exceljs": "^4.4.0"
}
```

### 4. YAML Round-Trip: `yaml` package's `parseDocument()`

**Decision:** Use `yaml` package with document preservation

**Implementation:**
```typescript
import { parseDocument, stringify } from 'yaml';

async function appendRule(filePath: string, rule: Rule): Promise<void> {
  if (!existsSync(filePath)) {
    // Create with header comment
    const content = `# User categorization rules\n# Added by fineng add-rule\n\n`;
    const doc = parseDocument(content);
    doc.contents = doc.createNode([rule]);
    await writeFile(filePath, stringify(doc));
    return;
  }

  const content = await readFile(filePath, 'utf-8');
  const doc = parseDocument(content);

  if (!doc.contents || doc.contents.type === 'SCALAR' && doc.contents.value === null) {
    doc.contents = doc.createNode([rule]);
  } else {
    (doc.contents as any).add(doc.createNode(rule));
  }

  await writeFile(filePath, stringify(doc));
}
```

**Add to package.json:**
```json
"dependencies": {
  "yaml": "^2.3.0"
}
```

### 5. Pipeline Orchestration: State Object Pattern

**Decision:** Single state object passed through pipeline steps

```typescript
interface PipelineState {
  month: string;
  workspace: Workspace;
  options: ProcessOptions;

  // Accumulated during pipeline
  files: InputFile[];
  parseResults: ParseResult[];
  transactions: Transaction[];
  categorizationStats: CategorizationStats;
  matchResult: MatchResult;
  ledgerResult: LedgerResult;

  warnings: string[];
  errors: PipelineError[];
}

type PipelineStep = (state: PipelineState) => Promise<PipelineState>;
```

**Error handling:**
- Parse errors → collect, prompt user to continue (or auto-continue with `--yes`)
- Validation failure (DR != CR) → abort (hard error)
- `--dry-run` → run steps 1-8, skip 9-10 (export, archive)

### 6. Deduplication: CLI-level filter

**Decision:** Cross-file dedup is a CLI-level filter function

**Rationale:**
- Core's `resolveCollisions()` handles intra-file collisions (same txn_id → add `-02`)
- Cross-file dedup is different: same txn_id from different files = duplicate import
- This is I/O-context dependent, so belongs in CLI

```typescript
function deduplicateCrossFile(transactions: Transaction[]): {
  unique: Transaction[];
  duplicates: Transaction[];
} {
  const seen = new Map<string, Transaction>();
  const duplicates: Transaction[] = [];

  for (const txn of transactions) {
    if (seen.has(txn.txn_id)) {
      duplicates.push(txn);
    } else {
      seen.set(txn.txn_id, txn);
    }
  }

  return { unique: Array.from(seen.values()), duplicates };
}
```

### 7. File Hashing: Node.js crypto

```typescript
import { createHash } from 'node:crypto';

async function hashFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return 'sha256:' + createHash('sha256').update(content).digest('hex');
}
```

### 8. TTY Detection: process.stdin.isTTY

```typescript
async function promptContinue(message: string, options: ProcessOptions): Promise<boolean> {
  if (options.yes) return true;

  if (!process.stdin.isTTY) {
    console.error('Non-interactive mode. Use --yes to continue on errors.');
    return false;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}
```

### 9. --llm Flag: Include with "not implemented" message

**Decision:** Include flag in CLI, output warning when used

```typescript
if (options.llm) {
  console.warn('⚠ LLM-assisted categorization is not yet implemented.');
  console.warn('  Proceeding with rule-based categorization only.');
}
```

### 10. Entry Point: Commander-based routing

The existing `packages/cli/src/index.ts` will be restructured:

```typescript
#!/usr/bin/env node
import { Command } from 'commander';
import { processMonth } from './commands/process.js';
import { addRule } from './commands/add-rule.js';

const program = new Command();

program
  .name('fineng')
  .description('Finance Engine CLI - Personal finance automation')
  .version('2.0.0');

program
  .command('process <month>')
  .description('Process a month of transactions (YYYY-MM format)')
  .option('--dry-run', 'Parse and analyze without writing files')
  .option('--force', 'Overwrite existing output for this month')
  .option('--yes', 'Auto-continue on errors (non-interactive)')
  .option('--llm', 'Enable LLM-assisted categorization')
  .option('--workspace <path>', 'Override workspace directory')
  .action(processMonth);

program
  .command('add-rule <pattern> <category>')
  .description('Add a categorization rule to user-rules.yaml')
  .option('--note <note>', 'Optional note for the rule')
  .option('--workspace <path>', 'Override workspace directory')
  .action(addRule);

program.parse();
```

---

## Pre-Implementation Checklist

- [ ] Pull latest main (Phase 4 merged)
- [ ] Create branch: `phase-5/cli`
- [ ] Verify `pnpm test` passes (210 tests)
- [ ] Verify `pnpm build` succeeds
- [ ] Add dependencies: `commander`, `exceljs`, `yaml`

---

## File Structure

```
packages/cli/src/
├── index.ts                    # Entry point with Commander setup
├── commands/
│   ├── process.ts              # process command implementation
│   └── add-rule.ts             # add-rule command implementation
├── pipeline/
│   ├── types.ts                # PipelineState, ProcessOptions, InputFile
│   ├── runner.ts               # Pipeline orchestration loop
│   └── steps/
│       ├── manifest-check.ts   # Step 1: Check for existing manifest
│       ├── detect.ts           # Step 2: Detect parsers for files
│       ├── parse.ts            # Step 3: Parse all files
│       ├── dedup.ts            # Step 4: Cross-file deduplication
│       ├── categorize.ts       # Step 5: Apply 4-layer categorization
│       ├── match.ts            # Step 6: Match CC payments
│       ├── journal.ts          # Step 7: Generate journal entries
│       ├── validate.ts         # Step 8: Validate DR = CR
│       ├── export.ts           # Step 9: Write Excel files
│       └── archive.ts          # Step 10: Move inputs to archive
├── workspace/
│   ├── detect.ts               # Auto-detect workspace root
│   ├── config.ts               # Load accounts.json, rules YAML files
│   └── paths.ts                # Path resolution helpers
├── excel/
│   ├── journal.ts              # Write journal.xlsx
│   ├── review.ts               # Write review.xlsx
│   ├── analysis.ts             # Write analysis.xlsx (3 sheets)
│   └── utils.ts                # Shared Excel utilities (formatting)
├── yaml/
│   └── rules.ts                # YAML round-trip operations
├── utils/
│   ├── hash.ts                 # SHA-256 file hashing
│   ├── prompt.ts               # TTY prompts
│   └── console.ts              # Formatted output helpers (✓, ⚠, →)
└── types.ts                    # CLI-specific types (Workspace, etc.)
```

---

## Task Sequence

### Foundation (Tasks 1-9)

| # | Task | File | Description |
|---|------|------|-------------|
| 1 | Add dependencies | `package.json` | Add commander, exceljs, yaml |
| 2 | CLI types | `src/types.ts` | Workspace, ProcessOptions interfaces |
| 3 | Console utilities | `src/utils/console.ts` | log(), warn(), success(), arrow() helpers |
| 4 | Workspace detection | `src/workspace/detect.ts` | Find config/user-rules.yaml in cwd/parents |
| 5 | Path resolution | `src/workspace/paths.ts` | importsPath(), outputsPath(), archivePath() |
| 6 | Config loading | `src/workspace/config.ts` | Load accounts.json, user/shared/base rules |
| 7 | File hashing | `src/utils/hash.ts` | SHA-256 for manifest |
| 8 | TTY prompts | `src/utils/prompt.ts` | promptContinue() with TTY detection |
| 9 | Entry point | `src/index.ts` | Commander setup, subcommand routing |

### Pipeline Steps (Tasks 10-19)

| # | Task | File | Description |
|---|------|------|-------------|
| 10 | Pipeline types | `src/pipeline/types.ts` | PipelineState, PipelineStep |
| 11 | Manifest check | `src/pipeline/steps/manifest-check.ts` | Refuse if exists (unless --force) |
| 12 | File detection | `src/pipeline/steps/detect.ts` | List files, match to parsers |
| 13 | Parse step | `src/pipeline/steps/parse.ts` | Read files, call core parsers |
| 14 | Dedup step | `src/pipeline/steps/dedup.ts` | Cross-file deduplication |
| 15 | Categorize step | `src/pipeline/steps/categorize.ts` | Call core categorizeAll() |
| 16 | Match step | `src/pipeline/steps/match.ts` | Call core matchPayments() |
| 17 | Journal step | `src/pipeline/steps/journal.ts` | Call core generateJournal() |
| 18 | Validate step | `src/pipeline/steps/validate.ts` | Verify DR = CR |
| 19 | Pipeline runner | `src/pipeline/runner.ts` | Execute steps in order |

### Excel Output (Tasks 20-24)

| # | Task | File | Description |
|---|------|------|-------------|
| 20 | Excel utilities | `src/excel/utils.ts` | Column formatting, number formats |
| 21 | journal.xlsx | `src/excel/journal.ts` | PRD §11.7 schema + footer totals |
| 22 | review.xlsx | `src/excel/review.ts` | Sort by confidence ASC |
| 23 | analysis.xlsx | `src/excel/analysis.ts` | 3 sheets: Category, Account, Summary |
| 24 | Export step | `src/pipeline/steps/export.ts` | Call Excel writers, write manifest |

### Commands (Tasks 25-28)

| # | Task | File | Description |
|---|------|------|-------------|
| 25 | Archive step | `src/pipeline/steps/archive.ts` | Move imports → archive |
| 26 | Process command | `src/commands/process.ts` | Wire pipeline, handle flags |
| 27 | YAML helpers | `src/yaml/rules.ts` | Round-trip safe append |
| 28 | Add-rule command | `src/commands/add-rule.ts` | Validate, check collision, append |

### Tests (Tasks 29-32)

| # | Task | Description |
|---|------|-------------|
| 29 | Unit tests | Workspace detection, config loading, YAML round-trip |
| 30 | Pipeline step tests | Each step with mock data |
| 31 | Excel output tests | Verify column schemas, formatting |
| 32 | E2E integration test | Full process with fixture files |

---

## Output Schemas (PRD §11.7)

### journal.xlsx

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

**Footer row:** `Total Debits: $X | Total Credits: $X` (must match)

### review.xlsx

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

### analysis.xlsx

| Sheet | Columns |
|-------|---------|
| By Category | category_id, category_name, total_amount, transaction_count |
| By Account | account_id, account_name, total_in, total_out, net |
| Summary | Total income, total expenses, net savings, flagged count, flagged total |

### run_manifest.json

```json
{
  "month": "YYYY-MM",
  "run_timestamp": "2026-01-15T10:30:00Z",
  "input_files": {
    "amex_2122_202601.xlsx": "sha256:abc123...",
    "chase_1120_202601.csv": "sha256:def456..."
  },
  "transaction_count": 147,
  "txn_ids": ["abc123...", "def456...", ...],
  "collision_map": { "abc123": 2 },
  "version": "2.0.0"
}
```

---

## Console Output Format (PRD §15.B)

Match this exact style:

```
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

---

## Core API Reference

The CLI calls these core functions:

```typescript
// Parsing
detectParser(filename: string): ParserDetectionResult | null
parseAmex(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult
// ... other parsers

// Transaction processing
resolveCollisions(transactions: Transaction[]): Transaction[]
buildCollisionMap(transactions: Transaction[]): Record<string, number>

// Categorization
categorizeAll(transactions: Transaction[], rules: RuleSet, options?: CategorizeOptions): {
  transactions: Transaction[];
  warnings: string[];
  stats: CategorizationStats;
}

// Matching
matchPayments(transactions: Transaction[], options?: MatcherOptions): MatchResult

// Ledger
generateJournal(transactions: Transaction[], matches: Match[], options: LedgerOptions): LedgerResult
validateJournal(entries: JournalEntry[]): JournalValidationResult

// Pattern validation (for add-rule)
validatePattern(pattern: string, patternType?: 'substring' | 'regex', transactions?: Transaction[]): PatternValidationResult
checkPatternCollision(pattern: string, patternType: 'substring' | 'regex', existingRules: Rule[]): CollisionResult
```

---

## Test Strategy

### Unit Tests

| Module | Test Cases |
|--------|------------|
| workspace/detect.ts | Finds config in cwd, searches parents, respects --workspace override |
| workspace/config.ts | Parses accounts.json, handles missing optional rules files |
| yaml/rules.ts | Round-trip preserves comments, handles empty file, creates new file |
| utils/hash.ts | Deterministic hashes |
| pipeline/steps/* | Each step with mock input/output |

### Integration Tests

| Test | Description |
|------|-------------|
| E2E dry-run | Full pipeline with `--dry-run`, no files written |
| E2E full run | Process fixture month, verify all outputs |
| add-rule E2E | Append rule, verify file preserves formatting |
| Error handling | Bad file → prompt → continue/abort |

### Test Fixtures

Create `packages/cli/tests/fixtures/`:
```
fixtures/
├── workspace/
│   ├── config/
│   │   ├── accounts.json
│   │   ├── user-rules.yaml
│   │   └── base-rules.yaml
│   └── imports/
│       └── 2026-01/
│           ├── amex_2122_202601.xlsx
│           └── chase_1120_202601.csv
└── expected/
    ├── journal.xlsx
    ├── review.xlsx
    └── analysis.xlsx
```

---

## Quality Checklist

### Completeness
- [ ] `npx fineng process YYYY-MM` works end-to-end
- [ ] `npx fineng add-rule PATTERN CATEGORY` works
- [ ] `--dry-run`, `--force`, `--yes`, `--workspace` flags work
- [ ] Workspace auto-detection works
- [ ] Config loading works (accounts + 3 rules files)
- [ ] journal.xlsx, review.xlsx, analysis.xlsx generated correctly
- [ ] run_manifest.json written correctly
- [ ] Input archiving works
- [ ] Error handling with prompts works
- [ ] Console output matches PRD §15.B sample session

### Correctness
- [ ] 10-step pipeline executes in correct order (IK A12.1)
- [ ] Overwrite protection works (refuse without --force)
- [ ] Cross-file dedup uses txn_id correctly
- [ ] Excel columns match PRD §11.7 exactly
- [ ] journal.xlsx footer totals match validateJournal()
- [ ] review.xlsx sorted by confidence ascending
- [ ] add-rule YAML round-trip preserves formatting
- [ ] add-rule validates min length (5 chars) and breadth
- [ ] Hidden files (.*, ~*) skipped
- [ ] Config precedence: flags > env > file > defaults

### Architecture
- [ ] All `node:*` imports confined to CLI package
- [ ] Core package unchanged (no new imports)
- [ ] Serialization boundary maintained (CLI parses YAML/JSON, passes objects to core)

### Quality
- [ ] Integration tests cover E2E flow
- [ ] Error messages are helpful and actionable
- [ ] Exit codes correct (0 success, 1 error)
- [ ] No hardcoded paths

---

## Regression Protocol

After implementation:
```bash
pnpm test                    # All packages: should pass 210+ tests
pnpm build                   # All packages: should succeed
pnpm --filter @finance-engine/cli test  # CLI-specific tests
```

---

## Final Verification & PR Preparation

1. Run full E2E test with fixture workspace
2. Verify all 3 Excel files have correct format
3. Verify manifest schema matches RunManifestSchema
4. Test `--dry-run` produces no file writes
5. Test `--force` overwrites existing month
6. Test error handling with malformed input file
7. Test add-rule preserves YAML comments
8. Create PR with conventional commit message:

```
feat(cli): complete Phase 5 CLI implementation

Implements Finance Engine CLI with full pipeline orchestration:

Process command:
- 10-step pipeline (manifest check → archive)
- Workspace auto-detection from config/user-rules.yaml
- Config loading (accounts.json, 3 YAML rules files)
- Excel output (journal, review, analysis)
- Run manifest with file hashes
- Input archiving to archive/YYYY-MM/raw/

Add-rule command:
- YAML round-trip safe appending
- Pattern validation (min length, breadth check)
- Collision detection with existing rules

Flags: --dry-run, --force, --yes, --workspace, --llm (placeholder)

All money arithmetic uses decimal.js. Core package unchanged.
Architecture: CLI handles all I/O, core remains headless.
```

---

**Review signed by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-02
- **Review Type:** Implementation Prompt (Phase 5)
