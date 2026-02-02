# Phase 5 Fix Implementation Prompt

**Role:** Antigravity (Implementation)
**Input:** Phase5_PR_Review_Chief_Architect.md (CA-1 through CA-5)
**Branch:** `phase-5/cli-implementation`
**Date:** 2026-02-02

---

## Overview

The Chief Architect PR Review identified 5 issues in the Phase 5 CLI implementation. This prompt provides detailed instructions to fix the 2 critical issues (CA-1, CA-3) and 3 minor issues (CA-2, CA-4, CA-5).

**Priority:**
1. CA-1: review.xlsx schema (Major) - REQUIRED
2. CA-3: add-rule validation (Major) - REQUIRED
3. CA-2: journal.xlsx footer (Minor) - Recommended
4. CA-4: YAML file creation (Minor) - Recommended
5. CA-5: Test coverage (Minor) - Recommended

---

## Fix CA-1: review.xlsx Schema Mismatch

**File:** `packages/cli/src/excel/review.ts`

### Problem
The current review.xlsx schema doesn't match PRD §11.7 / IK D9.2 requirements.

### Required Changes

1. **Update columns to match PRD spec:**

```typescript
sheet.columns = [
    { header: 'txn_id', key: 'txn_id' },
    { header: 'date', key: 'date' },
    { header: 'raw_description', key: 'raw_description' },
    { header: 'signed_amount', key: 'signed_amount' },
    { header: 'account_name', key: 'account_name' },
    { header: 'suggested_category', key: 'suggested_category' },
    { header: 'confidence', key: 'confidence' },
    { header: 'review_reason', key: 'review_reason' },
    { header: 'your_category_id', key: 'your_category_id' },
];
```

2. **Sort transactions by confidence ascending BEFORE adding rows:**

```typescript
const sortedTxns = [...transactions].sort((a, b) =>
    (a.confidence ?? 1) - (b.confidence ?? 1)
);
```

3. **Update row data mapping:**

```typescript
for (const txn of sortedTxns) {
    sheet.addRow({
        txn_id: txn.txn_id,
        date: txn.effective_date,
        raw_description: txn.raw_description ?? txn.description,
        signed_amount: parseFloat(txn.signed_amount),
        account_name: getAccountName(txn.account_id, accounts), // Need accounts param
        suggested_category: getCategoryName(txn.category_id, accounts), // Need lookup
        confidence: txn.confidence ?? 0,
        review_reason: txn.review_reasons.join('; '),
        your_category_id: '', // Blank for user input
    });
}
```

4. **Update function signature** to accept accounts for name lookup:

```typescript
export async function generateReviewExcel(
    transactions: Transaction[],
    accounts: ChartOfAccounts
): Promise<Workbook>
```

5. **Add helper functions** for name lookups:

```typescript
function getAccountName(accountId: number, accounts: ChartOfAccounts): string {
    return accounts.accounts.find(a => a.id === accountId)?.name ?? `Account ${accountId}`;
}

function getCategoryName(categoryId: number | null, accounts: ChartOfAccounts): string {
    if (!categoryId) return 'Uncategorized';
    const cat = accounts.categories?.find(c => c.id === categoryId);
    return cat?.name ?? `Category ${categoryId}`;
}
```

6. **Update call site** in `pipeline/steps/export.ts`:

```typescript
const reviewWb = await generateReviewExcel(state.transactions, state.accounts);
```

### Test Verification
```typescript
// In excel.test.ts
it('review.xlsx columns match PRD schema', async () => {
    const wb = await generateReviewExcel(mockTxns, mockAccounts);
    const sheet = wb.getWorksheet('Review');
    const headers = sheet.getRow(1).values;
    expect(headers).toContain('confidence');
    expect(headers).toContain('your_category_id');
});

it('review.xlsx sorted by confidence ascending', async () => {
    const wb = await generateReviewExcel(mockTxns, mockAccounts);
    const sheet = wb.getWorksheet('Review');
    const confidences = [];
    sheet.eachRow((row, idx) => {
        if (idx > 1) confidences.push(row.getCell('confidence').value);
    });
    expect(confidences).toEqual([...confidences].sort((a, b) => a - b));
});
```

---

## Fix CA-2: journal.xlsx Footer Totals

**File:** `packages/cli/src/excel/journal.ts`

### Problem
Missing footer row with total debits and credits.

### Required Changes

Add after the data rows (before formatting):

```typescript
import Decimal from 'decimal.js';

// Calculate totals
let totalDebits = new Decimal(0);
let totalCredits = new Decimal(0);

for (const entry of entries) {
    for (const line of entry.lines) {
        if (line.debit) totalDebits = totalDebits.plus(line.debit);
        if (line.credit) totalCredits = totalCredits.plus(line.credit);
    }
}

// Add empty row for spacing
sheet.addRow({});

// Add totals row
const totalsRow = sheet.addRow({
    entry_id: null,
    date: null,
    description: 'TOTALS',
    account_id: null,
    account_name: null,
    debit: totalDebits.toNumber(),
    credit: totalCredits.toNumber(),
    txn_id: null,
});

// Style totals row
totalsRow.font = { bold: true };
totalsRow.getCell('description').alignment = { horizontal: 'right' };
```

---

## Fix CA-3: add-rule Pattern Validation

**File:** `packages/cli/src/commands/add-rule.ts`

### Problem
No validation of pattern length or collision checking.

### Required Changes

1. **Import validation functions from core:**

```typescript
import { validatePattern, checkPatternCollision } from '@finance-engine/core';
```

2. **Add validation before appending:**

```typescript
export async function addRule(pattern: string, category: string, options: AddRuleOptions): Promise<void> {
    const categoryId = parseInt(category, 10);
    if (isNaN(categoryId)) {
        console.error('\n✖ Error: Category must be a numeric ID (e.g. 101).');
        process.exit(1);
    }

    // 1. Validate pattern length (min 5 chars per IK D4.7)
    const validation = validatePattern(pattern);
    if (!validation.valid) {
        console.error(`\n✖ Error: ${validation.reason}`);
        process.exit(1);
    }

    // 2. Workspace detection
    const root = options.workspace || detectWorkspaceRoot();
    if (!root) {
        console.error('\n✖ Error: Workspace not found.');
        process.exit(1);
    }
    const workspace = resolveWorkspace(root);
    const rulesPath = workspace.config.userRulesPath;

    // 3. Load existing rules for collision check
    const existingRules = await loadExistingRules(rulesPath);
    const collision = checkPatternCollision(pattern, 'substring', existingRules);
    if (collision.hasCollision) {
        console.error(`\n✖ Error: Pattern collision detected.`);
        console.error(`  Your pattern "${pattern}" conflicts with existing rule:`);
        console.error(`  "${collision.conflictingRule?.pattern}" → category ${collision.conflictingRule?.category_id}`);
        process.exit(1);
    }

    // 4. Perform addition (existing code)
    // ...
}
```

3. **Add helper to load existing rules:**

```typescript
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'yaml';

async function loadExistingRules(filePath: string): Promise<Rule[]> {
    if (!existsSync(filePath)) return [];
    try {
        const content = await readFile(filePath, 'utf8');
        const doc = parse(content);
        return doc?.rules ?? [];
    } catch {
        return [];
    }
}
```

### Test Verification
```bash
# Should fail - pattern too short
npx fineng add-rule "abc" 101
# Expected: ✖ Error: Pattern must be at least 5 characters

# Should fail - collision with existing
npx fineng add-rule "existing-pattern" 101
# Expected: ✖ Error: Pattern collision detected

# Should succeed
npx fineng add-rule "new-merchant-name" 101
# Expected: ✓ Rule successfully added!
```

---

## Fix CA-4: YAML File Creation

**File:** `packages/cli/src/yaml/rules.ts`

### Problem
`readFile()` throws if file doesn't exist.

### Required Changes

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseDocument, isSeq } from 'yaml';

export async function appendRuleToYaml(
    filePath: string,
    rule: { pattern: string; category_id: number; note?: string; added_date?: string }
): Promise<void> {
    // Handle missing file - create with header
    if (!existsSync(filePath)) {
        const header = `# User categorization rules\n# Added via fineng add-rule\n\nrules:\n`;
        const doc = parseDocument(header);
        const rules = doc.get('rules');
        if (isSeq(rules)) {
            rules.add(rule);
        }
        await writeFile(filePath, doc.toString());
        return;
    }

    // Handle empty file
    const content = await readFile(filePath, 'utf8');
    if (!content.trim()) {
        const header = `# User categorization rules\n# Added via fineng add-rule\n\nrules:\n`;
        const doc = parseDocument(header);
        const rules = doc.get('rules');
        if (isSeq(rules)) {
            rules.add(rule);
        }
        await writeFile(filePath, doc.toString());
        return;
    }

    // Existing logic for non-empty file
    const doc = parseDocument(content);
    const rules = doc.get('rules');

    if (!rules) {
        doc.set('rules', [rule]);
    } else if (isSeq(rules)) {
        rules.add(rule);
    } else {
        throw new Error(`Invalid YAML structure in ${filePath}: "rules" must be a list.`);
    }

    await writeFile(filePath, doc.toString());
}
```

---

## Fix CA-5: Test Coverage

**Files:** `packages/cli/tests/`

### New Tests to Add

1. **add-rule.test.ts:**
```typescript
describe('add-rule command', () => {
    it('rejects patterns shorter than 5 chars');
    it('detects collision with existing rules');
    it('creates file if missing');
    it('appends to existing rules');
});
```

2. **pipeline-steps.test.ts:**
```typescript
describe('pipeline steps', () => {
    describe('validate step', () => {
        it('flags transactions needing review');
        it('reports ledger balance issues');
    });

    describe('archive step', () => {
        it('copies files to archive directory');
        it('skips archive in dry-run mode');
    });

    describe('journal step', () => {
        it('generates journal entries from transactions');
        it('includes footer totals');
    });
});
```

3. **excel-schemas.test.ts:**
```typescript
describe('Excel output schemas', () => {
    describe('review.xlsx', () => {
        it('has correct column order per PRD');
        it('sorts by confidence ascending');
        it('includes your_category_id blank column');
    });

    describe('journal.xlsx', () => {
        it('has footer row with totals');
        it('totals DR equals CR');
    });
});
```

---

## Implementation Order

1. **CA-1** (review.xlsx) - Highest impact, affects user workflow
2. **CA-3** (add-rule validation) - Prevents bad data entry
3. **CA-2** (journal footer) - Quick win
4. **CA-4** (file creation) - Edge case fix
5. **CA-5** (tests) - After all fixes

---

## Verification Checklist

After implementing fixes:

```bash
# 1. Build
pnpm build

# 2. Run all tests
pnpm test

# 3. Verify review.xlsx schema
npx fineng process 2026-01 --dry-run
# Check output mentions correct columns

# 4. Test add-rule validation
npx fineng add-rule "ab" 101        # Should fail (too short)
npx fineng add-rule "starbucks" 101 # Should succeed (or collision if exists)

# 5. Check journal totals (manual)
# Open journal.xlsx and verify footer row exists
```

---

## Commit Message

```
fix(cli): address Phase 5 PR review issues CA-1 through CA-5

CA-1: Fix review.xlsx schema to match PRD §11.7
- Correct column order: txn_id, date, raw_description, etc.
- Add confidence column and sort ascending
- Add your_category_id blank column for user input
- Add account_name and suggested_category lookups

CA-2: Add footer totals to journal.xlsx
- Calculate total debits and credits
- Add styled totals row at bottom

CA-3: Add pattern validation to add-rule command
- Validate minimum 5 character length
- Check for collision with existing rules
- Clear error messages for both cases

CA-4: Handle missing user-rules.yaml in add-rule
- Create file with header comment if missing
- Handle empty file case

CA-5: Add missing test coverage
- Excel schema tests
- Pipeline step tests
- add-rule validation tests

Closes review items from Phase5_PR_Review_Chief_Architect.md
```

---

**Prompt prepared by:**
- **Role:** Chief Architect
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-02
- **Type:** Fix Implementation Prompt
