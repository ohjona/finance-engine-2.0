# Phase 1 Implementation Prompt for Antigravity

**Author:** Chief Architect (Claude Opus 4.5)
**Date:** 2026-01-31
**Role:** Complete implementation guide for Antigravity
**Input Documents:** PRD v2.2, IK v1.2, Architecture Roadmap v2.2

---

## 1. Overview

### What Phase 1 Builds

Phase 1 establishes the complete monorepo foundation and proves the headless core architecture with a working end-to-end example: parsing one Amex file.

**When complete, Antigravity will have:**
1. A buildable, testable pnpm monorepo with 4 packages
2. Complete Zod schemas for core data types
3. Working `generateTxnId()`, `resolveCollisions()`, `normalizeDescription()`, `detectParser()`
4. Working `parseAmex()` parser
5. CLI proof-of-concept that reads a file and calls the core parser
6. Verified architecture constraints: core has no I/O imports, no `node:*` imports, no `console.*` calls

### Architecture Decision: Hashing Approach

**Problem:** `node:crypto.createHash()` is Node-only. Core must run in both Node.js and browser.

**Decision: Use `js-sha256` library**

| Option | Pros | Cons |
|--------|------|------|
| Web Crypto API | Standard, no deps | **Async** (`crypto.subtle.digest` returns Promise), ripples through all callers |
| `js-sha256` | **Sync**, small (2KB), works everywhere | External dependency |
| Build-time polyfill | No runtime dep | Complex build config, harder to test |

**Rationale:** `js-sha256` keeps `generateTxnId()` synchronous, which matches the Python v1.x behavior and simplifies usage. The library is tiny (2KB gzipped), well-maintained, and has zero dependencies. Making `generateTxnId` async would require changing the signature to return `Promise<string>`, which propagates to `parseAmex()` and all callers—unnecessary complexity for a hash function.

**Implementation:** `import { sha256 } from 'js-sha256';`

---

## 2. Pre-Implementation Setup

### Task 0.1: Create Branch

```bash
cd /Users/jonathanoh/Dev/finance-engine-2.0
git checkout -b phase-1/foundation
```

### Task 0.2: Create Root package.json

**File:** `package.json` — CREATE

```json
{
  "name": "finance-engine",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "eslint packages/*/src/**/*.ts",
    "format": "prettier --write \"packages/*/src/**/*.ts\"",
    "clean": "pnpm -r exec rm -rf dist",
    "typecheck": "pnpm -r typecheck",
    "verify:core-constraints": "node scripts/verify-core-constraints.mjs"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "eslint": "^8.55.0",
    "@typescript-eslint/eslint-plugin": "^6.13.0",
    "@typescript-eslint/parser": "^6.13.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

### Task 0.3: Create pnpm-workspace.yaml

**File:** `pnpm-workspace.yaml` — CREATE

```yaml
packages:
  - 'packages/*'
```

### Task 0.4: Create Root TypeScript Config

**File:** `tsconfig.json` — CREATE

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "composite": true,
    "noEmit": false,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

### Task 0.5: Create Vitest Config

**File:** `vitest.config.ts` — CREATE

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**/*.ts'],
    },
  },
});
```

### Task 0.6: Create ESLint Config

**File:** `eslint.config.js` — CREATE

```javascript
import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['packages/*/src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': 'error', // CRITICAL: Enforces no console.* in code
    },
  },
  {
    // Allow console in CLI package only
    files: ['packages/cli/src/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
];
```

### Task 0.7: Create Prettier Config

**File:** `.prettierrc` — CREATE

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Task 0.8: Update .gitignore

**File:** `.gitignore` — REPLACE

```
# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# OS files
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# Environment
.env
.env.local

# Coverage
coverage/

# Logs
*.log
npm-debug.log*

# Temp files
~$*

# Test fixtures (real bank data)
fixtures/real/
```

### Task 0.9: Create Architecture Constraint Verification Script

**File:** `scripts/verify-core-constraints.mjs` — CREATE

This script verifies ALL architectural constraints for the core package.

```javascript
#!/usr/bin/env node
/**
 * Verify @finance-engine/core architectural constraints.
 *
 * Constraints per IK A12.5, A12.8:
 * 1. No node:* imports (fs, path, process, crypto, etc.)
 * 2. No console.* calls (side effects)
 * 3. No require() calls
 *
 * Run: node scripts/verify-core-constraints.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const CORE_SRC = 'packages/core/src';

const FORBIDDEN_PATTERNS = [
  // Node.js built-in modules
  { pattern: /from\s+['"]node:/, message: 'node:* import' },
  { pattern: /from\s+['"]fs['"]/, message: 'fs import' },
  { pattern: /from\s+['"]path['"]/, message: 'path import' },
  { pattern: /from\s+['"]crypto['"]/, message: 'crypto import' },
  { pattern: /from\s+['"]process['"]/, message: 'process import' },
  { pattern: /require\s*\(\s*['"]/, message: 'require() call' },

  // Console side effects
  { pattern: /console\.(log|warn|error|info|debug)\s*\(/, message: 'console.* call' },

  // Process globals
  { pattern: /process\.(env|argv|cwd|exit)/, message: 'process.* access' },
];

function getAllFiles(dir, files = []) {
  const items = readdirSync(dir);
  for (const item of items) {
    const fullPath = join(dir, item);
    if (statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (item.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const { pattern, message } of FORBIDDEN_PATTERNS) {
      if (pattern.test(line)) {
        violations.push({
          file: filePath,
          line: lineNum,
          message,
          content: line.trim(),
        });
      }
    }
  }

  return violations;
}

function main() {
  console.log('Verifying @finance-engine/core architectural constraints...\n');

  const files = getAllFiles(CORE_SRC);
  console.log(`Checking ${files.length} TypeScript files...\n`);

  let allViolations = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations = allViolations.concat(violations);
  }

  if (allViolations.length === 0) {
    console.log('✓ All architectural constraints satisfied!\n');
    console.log('Verified:');
    console.log('  - No node:* imports');
    console.log('  - No fs/path/crypto imports');
    console.log('  - No console.* calls');
    console.log('  - No process.* access');
    console.log('  - No require() calls');
    process.exit(0);
  } else {
    console.log(`✗ Found ${allViolations.length} violation(s):\n`);
    for (const v of allViolations) {
      console.log(`  ${v.file}:${v.line}`);
      console.log(`    ${v.message}: ${v.content}\n`);
    }
    process.exit(1);
  }
}

main();
```

---

## 3. Package: @finance-engine/shared

### Task 1.1: Create Package Structure

**Directory structure:**
```
packages/shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── schemas.ts
│   └── constants.ts
└── tests/
    └── schemas.test.ts
```

### Task 1.2: Create package.json

**File:** `packages/shared/package.json` — CREATE

```json
{
  "name": "@finance-engine/shared",
  "version": "2.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.22.0"
  }
}
```

### Task 1.3: Create tsconfig.json

**File:** `packages/shared/tsconfig.json` — CREATE

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "dist"]
}
```

### Task 1.4: Create constants.ts

**File:** `packages/shared/src/constants.ts` — CREATE

```typescript
/**
 * Constants for Finance Engine.
 * Per IK D2.7, D4.2, D4.7, D4.8, D6.1, D6.2.
 */

/**
 * Category ID for uncategorized transactions.
 * Visually distinct from 4990 (Miscellaneous) to indicate categorization failure.
 * Per IK D2.7.
 */
export const UNCATEGORIZED_CATEGORY_ID = 4999;

/**
 * Confidence scores per categorization source.
 * Per IK D4.2.
 */
export const CONFIDENCE = {
  USER_RULES: 1.0,
  SHARED_RULES: 0.9,
  LLM_APPROVED: 0.85,
  BASE_RULES: 0.8,
  LLM_INFERENCE: 0.7,
  BANK_CATEGORY: 0.6,
  UNCATEGORIZED: 0.3,
} as const;

/**
 * Pattern matching validation thresholds.
 * Per IK D4.7, D4.8.
 */
export const PATTERN_VALIDATION = {
  MIN_LENGTH: 5,
  MAX_MATCH_PERCENT: 0.2,
  MAX_MATCHES_FOR_BROAD: 3,
} as const;

/**
 * Payment matching configuration.
 * Per IK D6.1, D6.2.
 */
export const MATCHING_CONFIG = {
  DATE_TOLERANCE_DAYS: 5,
  AMOUNT_TOLERANCE: '0.01',
} as const;

/**
 * Transaction ID configuration.
 * Per IK D2.3.
 */
export const TXN_ID = {
  LENGTH: 16,
  COLLISION_SUFFIX_START: 2,
} as const;
```

### Task 1.5: Create schemas.ts

**File:** `packages/shared/src/schemas.ts` — CREATE

```typescript
/**
 * Zod schemas for Finance Engine data structures.
 * Per PRD Section 7, IK D2.8-D2.11.
 *
 * IMPORTANT: Decimal values are stored as strings in schemas.
 * Convert to Decimal at computation boundaries, back to string at output.
 * Per IK D2.2.
 */

import { z } from 'zod';
import { TXN_ID } from './constants.js';

// ============================================================================
// Primitive Validators
// ============================================================================

/**
 * ISO date string format: YYYY-MM-DD
 */
const isoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format');

/**
 * Decimal amount as string (never native number for money).
 * Per IK D2.2.
 */
const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be valid decimal string');

/**
 * 4-digit account ID (1000-9999).
 * Per IK D2.11.
 */
const accountId = z.number().int().min(1000).max(9999);

/**
 * Transaction ID: 16-char hex, optionally with collision suffix.
 * Base: 16 hex chars. With suffix: 16 hex chars + "-" + 2 digits (e.g., "-02").
 * Per IK D2.3, D2.4.
 */
const txnId = z.string().regex(
  new RegExp(`^[0-9a-f]{${TXN_ID.LENGTH}}(-\\d{2})?$`),
  `Must be ${TXN_ID.LENGTH}-char hex, optionally with -NN suffix`
);

// ============================================================================
// Transaction Schema
// ============================================================================

/**
 * Normalized transaction - the common form all bank exports become.
 * Per PRD Section 7.1.
 */
export const TransactionSchema = z.object({
  txn_id: txnId,
  txn_date: isoDateString,
  post_date: isoDateString,
  effective_date: isoDateString,
  description: z.string(),
  raw_description: z.string(),
  signed_amount: decimalString,
  account_id: accountId,
  category_id: z.number().int(),
  raw_category: z.string().optional(),
  source_file: z.string(),
  confidence: z.number().min(0).max(1),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string()),
});

export type Transaction = z.infer<typeof TransactionSchema>;

// ============================================================================
// Categorization Schemas
// ============================================================================

/**
 * Categorization result - what categorize() returns.
 * Per PRD Section 9.2.
 */
export const CategorizationResultSchema = z.object({
  category_id: z.number().int(),
  confidence: z.number().min(0).max(1),
  source: z.enum(['user', 'shared', 'base', 'bank', 'uncategorized']),
  needs_review: z.boolean(),
  review_reasons: z.array(z.string()),
});

export type CategorizationResult = z.infer<typeof CategorizationResultSchema>;

/**
 * Rule schema for categorization patterns.
 * Per IK D2.10.
 */
export const RuleSchema = z.object({
  pattern: z.string().min(1),
  pattern_type: z.enum(['substring', 'regex']).default('substring'),
  category_id: z.number().int(),
  note: z.string().optional(),
  added_date: isoDateString.optional(),
  source: z.enum(['manual', 'llm_suggestion']).optional(),
});

export type Rule = z.infer<typeof RuleSchema>;

/**
 * RuleSet containing all rule layers.
 * Per IK D4.1 - 4-layer model.
 */
export const RuleSetSchema = z.object({
  user_rules: z.array(RuleSchema),
  shared_rules: z.array(RuleSchema),
  base_rules: z.array(RuleSchema),
});

export type RuleSet = z.infer<typeof RuleSetSchema>;

// ============================================================================
// Account Schemas
// ============================================================================

/**
 * Account definition.
 * Per PRD Section 7.3.
 */
export const AccountSchema = z.object({
  name: z.string(),
  type: z.enum(['asset', 'liability', 'income', 'expense', 'special']),
  institution: z.string().optional(),
  parent: z.string().optional(),
});

export type Account = z.infer<typeof AccountSchema>;

/**
 * Chart of accounts map.
 */
export const ChartOfAccountsSchema = z.object({
  accounts: z.record(z.string(), AccountSchema),
});

export type ChartOfAccounts = z.infer<typeof ChartOfAccountsSchema>;

// ============================================================================
// Journal Schemas
// ============================================================================

/**
 * Journal entry line.
 * Per PRD Section 7.2.
 */
export const JournalLineSchema = z.object({
  account_id: accountId,
  account_name: z.string(),
  debit: decimalString.nullable(),
  credit: decimalString.nullable(),
  txn_id: txnId,
});

export type JournalLine = z.infer<typeof JournalLineSchema>;

/**
 * Complete journal entry with lines.
 * Per PRD Section 7.2.
 */
export const JournalEntrySchema = z.object({
  entry_id: z.number().int(),
  date: isoDateString,
  description: z.string(),
  lines: z.array(JournalLineSchema),
});

export type JournalEntry = z.infer<typeof JournalEntrySchema>;

// ============================================================================
// Run Manifest Schema
// ============================================================================

/**
 * Run manifest for tracking processed files.
 * Per IK D8.2.
 */
export const RunManifestSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  run_timestamp: z.string(),
  input_files: z.record(z.string(), z.string()),
  transaction_count: z.number().int().min(0),
  txn_ids: z.array(z.string()),
  collision_map: z.record(z.string(), z.number().int()),
  version: z.string(),
});

export type RunManifest = z.infer<typeof RunManifestSchema>;

// ============================================================================
// Parser Result Schema
// ============================================================================

/**
 * Result returned by parser functions.
 * Parsers return data, not side effects. Warnings are returned as data.
 * Per architectural constraint: no console.* in core.
 */
export const ParseResultSchema = z.object({
  transactions: z.array(TransactionSchema),
  warnings: z.array(z.string()),
  skippedRows: z.number().int().min(0),
});

export type ParseResult = z.infer<typeof ParseResultSchema>;
```

### Task 1.6: Create index.ts

**File:** `packages/shared/src/index.ts` — CREATE

```typescript
// Schemas
export {
  TransactionSchema,
  CategorizationResultSchema,
  RuleSchema,
  RuleSetSchema,
  AccountSchema,
  ChartOfAccountsSchema,
  JournalLineSchema,
  JournalEntrySchema,
  RunManifestSchema,
  ParseResultSchema,
} from './schemas.js';

// Types
export type {
  Transaction,
  CategorizationResult,
  Rule,
  RuleSet,
  Account,
  ChartOfAccounts,
  JournalLine,
  JournalEntry,
  RunManifest,
  ParseResult,
} from './schemas.js';

// Constants
export {
  UNCATEGORIZED_CATEGORY_ID,
  CONFIDENCE,
  PATTERN_VALIDATION,
  MATCHING_CONFIG,
  TXN_ID,
} from './constants.js';
```

### Task 1.7: Create schemas.test.ts

**File:** `packages/shared/tests/schemas.test.ts` — CREATE

```typescript
import { describe, it, expect } from 'vitest';
import {
  TransactionSchema,
  RuleSchema,
  RuleSetSchema,
  AccountSchema,
  ChartOfAccountsSchema,
  ParseResultSchema,
} from '../src/schemas.js';

describe('TransactionSchema', () => {
  const validTransaction = {
    txn_id: 'a1b2c3d4e5f67890',
    txn_date: '2026-01-15',
    post_date: '2026-01-16',
    effective_date: '2026-01-15',
    description: 'UBER TRIP',
    raw_description: 'UBER *TRIP HELP.UBER.COM',
    signed_amount: '-23.45',
    account_id: 2122,
    category_id: 4260,
    raw_category: 'Transportation-Taxi',
    source_file: 'amex_2122_202601.xlsx',
    confidence: 0.95,
    needs_review: false,
    review_reasons: [],
  };

  it('validates a complete transaction', () => {
    const result = TransactionSchema.safeParse(validTransaction);
    expect(result.success).toBe(true);
  });

  it('accepts txn_id with collision suffix', () => {
    const withSuffix = { ...validTransaction, txn_id: 'a1b2c3d4e5f67890-02' };
    const result = TransactionSchema.safeParse(withSuffix);
    expect(result.success).toBe(true);
  });

  it('rejects invalid txn_id length', () => {
    const invalid = { ...validTransaction, txn_id: 'tooshort' };
    const result = TransactionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const invalid = { ...validTransaction, txn_date: '01/15/2026' };
    const result = TransactionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects account_id outside valid range', () => {
    const tooLow = { ...validTransaction, account_id: 999 };
    const tooHigh = { ...validTransaction, account_id: 10000 };
    expect(TransactionSchema.safeParse(tooLow).success).toBe(false);
    expect(TransactionSchema.safeParse(tooHigh).success).toBe(false);
  });

  it('rejects invalid decimal string', () => {
    const invalid = { ...validTransaction, signed_amount: 'not-a-number' };
    const result = TransactionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts positive signed_amount (refunds)', () => {
    const refund = { ...validTransaction, signed_amount: '50.00' };
    const result = TransactionSchema.safeParse(refund);
    expect(result.success).toBe(true);
  });

  it('accepts zero signed_amount', () => {
    const zero = { ...validTransaction, signed_amount: '0' };
    const result = TransactionSchema.safeParse(zero);
    expect(result.success).toBe(true);
  });
});

describe('RuleSchema', () => {
  it('validates a basic rule with defaults', () => {
    const basic = { pattern: 'UBER', category_id: 4260 };
    const result = RuleSchema.safeParse(basic);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pattern_type).toBe('substring');
    }
  });

  it('validates a complete rule', () => {
    const complete = {
      pattern: 'WARBY PARKER',
      pattern_type: 'substring' as const,
      category_id: 4550,
      note: 'Vision/eyewear',
      added_date: '2026-01-18',
      source: 'manual' as const,
    };
    const result = RuleSchema.safeParse(complete);
    expect(result.success).toBe(true);
  });

  it('validates regex pattern type', () => {
    const regex = {
      pattern: 'WHOLEFDS|WHOLE FOODS',
      pattern_type: 'regex' as const,
      category_id: 4310,
    };
    const result = RuleSchema.safeParse(regex);
    expect(result.success).toBe(true);
  });

  it('rejects empty pattern', () => {
    const empty = { pattern: '', category_id: 4260 };
    const result = RuleSchema.safeParse(empty);
    expect(result.success).toBe(false);
  });
});

describe('RuleSetSchema', () => {
  it('validates a complete ruleset', () => {
    const valid = {
      user_rules: [{ pattern: 'WARBY', category_id: 4550 }],
      shared_rules: [{ pattern: 'NETFLIX', category_id: 4610 }],
      base_rules: [{ pattern: 'UBER', category_id: 4260 }],
    };
    const result = RuleSetSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('validates empty ruleset', () => {
    const empty = { user_rules: [], shared_rules: [], base_rules: [] };
    const result = RuleSetSchema.safeParse(empty);
    expect(result.success).toBe(true);
  });
});

describe('AccountSchema', () => {
  it('validates asset account', () => {
    const asset = { name: 'Chase Checking 6917', type: 'asset' as const, institution: 'Chase' };
    expect(AccountSchema.safeParse(asset).success).toBe(true);
  });

  it('validates expense account with parent', () => {
    const expense = {
      name: 'Rideshare (Uber/Lyft)',
      type: 'expense' as const,
      parent: '4200 - Transportation',
    };
    expect(AccountSchema.safeParse(expense).success).toBe(true);
  });

  it('rejects invalid account type', () => {
    const invalid = { name: 'Test', type: 'invalid' };
    expect(AccountSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('ChartOfAccountsSchema', () => {
  it('validates chart of accounts', () => {
    const valid = {
      accounts: {
        '1120': { name: 'Chase Checking', type: 'asset' as const, institution: 'Chase' },
        '2122': { name: 'Amex Delta', type: 'liability' as const, institution: 'Amex' },
        '4260': { name: 'Rideshare', type: 'expense' as const, parent: '4200 - Transportation' },
      },
    };
    expect(ChartOfAccountsSchema.safeParse(valid).success).toBe(true);
  });
});

describe('ParseResultSchema', () => {
  it('validates parse result with transactions', () => {
    const valid = {
      transactions: [
        {
          txn_id: 'a1b2c3d4e5f67890',
          txn_date: '2026-01-15',
          post_date: '2026-01-15',
          effective_date: '2026-01-15',
          description: 'TEST',
          raw_description: 'TEST',
          signed_amount: '-10.00',
          account_id: 2122,
          category_id: 4999,
          source_file: 'test.xlsx',
          confidence: 0,
          needs_review: false,
          review_reasons: [],
        },
      ],
      warnings: ['Skipped 2 rows with invalid dates'],
      skippedRows: 2,
    };
    expect(ParseResultSchema.safeParse(valid).success).toBe(true);
  });

  it('validates empty parse result', () => {
    const empty = { transactions: [], warnings: [], skippedRows: 0 };
    expect(ParseResultSchema.safeParse(empty).success).toBe(true);
  });
});
```

---

## 4. Package: @finance-engine/core

### Task 2.1: Create Package Structure

**Directory structure:**
```
packages/core/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── types/
│   │   └── index.ts
│   ├── utils/
│   │   ├── index.ts
│   │   ├── txn-id.ts
│   │   └── normalize.ts
│   └── parser/
│       ├── index.ts
│       ├── amex.ts
│       └── detect.ts
└── tests/
    ├── utils/
    │   ├── txn-id.test.ts
    │   └── normalize.test.ts
    └── parser/
        ├── amex.test.ts
        └── detect.test.ts
```

### Task 2.2: Create package.json

**File:** `packages/core/package.json` — CREATE

```json
{
  "name": "@finance-engine/core",
  "version": "2.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@finance-engine/shared": "workspace:*",
    "decimal.js": "^10.4.0",
    "js-sha256": "^0.11.0",
    "xlsx": "^0.18.0"
  }
}
```

### Task 2.3: Create tsconfig.json

**File:** `packages/core/tsconfig.json` — CREATE

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "dist"],
  "references": [{ "path": "../shared" }]
}
```

### Task 2.4: Create types/index.ts

**File:** `packages/core/src/types/index.ts` — CREATE

```typescript
/**
 * Re-export all types from shared package.
 * Core package uses these types but doesn't define them.
 */
export type {
  Transaction,
  CategorizationResult,
  Rule,
  RuleSet,
  Account,
  ChartOfAccounts,
  JournalLine,
  JournalEntry,
  RunManifest,
  ParseResult,
} from '@finance-engine/shared';

export {
  TransactionSchema,
  CategorizationResultSchema,
  RuleSchema,
  RuleSetSchema,
  AccountSchema,
  ChartOfAccountsSchema,
  JournalLineSchema,
  JournalEntrySchema,
  RunManifestSchema,
  ParseResultSchema,
  UNCATEGORIZED_CATEGORY_ID,
  CONFIDENCE,
  PATTERN_VALIDATION,
  MATCHING_CONFIG,
  TXN_ID,
} from '@finance-engine/shared';
```

### Task 2.5: Create utils/txn-id.ts

**File:** `packages/core/src/utils/txn-id.ts` — CREATE

**CRITICAL:** This uses `js-sha256` instead of `node:crypto`. Pure function, no side effects.

```typescript
/**
 * Transaction ID generation and collision handling.
 * Per PRD Section 7.5, IK D2.3, D2.4, D2.12.
 *
 * ARCHITECTURAL NOTE: Uses js-sha256 for cross-platform compatibility.
 * Node's crypto module is not available in browser.
 */

import { sha256 } from 'js-sha256';
import Decimal from 'decimal.js';
import type { Transaction } from '../types/index.js';
import { TXN_ID } from '../types/index.js';

/**
 * Generate deterministic transaction ID via SHA-256 hash.
 *
 * Payload format: "{effective_date}|{raw_description}|{signed_amount}|{account_id}"
 *
 * Per IK D2.3: 16-character hex string, filename-independent.
 * Per IK D2.12:
 *   - effective_date: ISO 8601 YYYY-MM-DD
 *   - raw_description: raw bytes (NO normalization before hash)
 *   - signed_amount: plain decimal string, no trailing zeros
 *   - account_id: integer as string
 *
 * @param effectiveDate - ISO date string YYYY-MM-DD
 * @param rawDescription - Raw description (NOT normalized)
 * @param signedAmount - Amount as Decimal
 * @param accountId - 4-digit account ID
 * @returns 16-character hex transaction ID
 */
export function generateTxnId(
  effectiveDate: string,
  rawDescription: string,
  signedAmount: Decimal,
  accountId: number
): string {
  // Normalize amount to plain decimal string (no trailing zeros, no exponent)
  // Decimal.toFixed() without args removes trailing zeros
  const amountStr = signedAmount.toFixed();

  const payload = `${effectiveDate}|${rawDescription}|${amountStr}|${accountId}`;
  return sha256(payload).slice(0, TXN_ID.LENGTH);
}

/**
 * Resolve collisions by adding deterministic suffixes.
 *
 * Per IK D2.4: Same-day duplicate transactions get -02, -03, etc.
 * Per IK D2.13: Files must be processed in lexicographic sort order for determinism.
 *
 * PURE FUNCTION: Returns new array with updated IDs. Does not mutate input.
 *
 * @param transactions - Array of transactions (not mutated)
 * @returns New array with collision suffixes applied to txn_id
 */
export function resolveCollisions(transactions: readonly Transaction[]): Transaction[] {
  const seen: Record<string, number> = {};
  const result: Transaction[] = [];

  for (const txn of transactions) {
    const baseId = txn.txn_id;

    if (seen[baseId]) {
      seen[baseId] += 1;
      // Suffix format: -02, -03, etc.
      const suffix = String(seen[baseId]).padStart(2, '0');
      result.push({
        ...txn,
        txn_id: `${baseId}-${suffix}`,
      });
    } else {
      seen[baseId] = 1;
      result.push({ ...txn });
    }
  }

  return result;
}

/**
 * Build collision map for run manifest.
 * Returns map of base ID -> count for IDs with collisions (count > 1).
 *
 * @param transactions - Array of transactions (after collision resolution)
 * @returns Map of base txn_id to collision count
 */
export function buildCollisionMap(transactions: readonly Transaction[]): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const txn of transactions) {
    // Extract base ID (remove suffix if present)
    const baseId = txn.txn_id.includes('-')
      ? txn.txn_id.substring(0, TXN_ID.LENGTH)
      : txn.txn_id;

    counts[baseId] = (counts[baseId] || 0) + 1;
  }

  // Only return entries with collisions (count > 1)
  const collisionMap: Record<string, number> = {};
  for (const [id, count] of Object.entries(counts)) {
    if (count > 1) {
      collisionMap[id] = count;
    }
  }

  return collisionMap;
}
```

### Task 2.6: Create utils/normalize.ts

**File:** `packages/core/src/utils/normalize.ts` — CREATE

```typescript
/**
 * Description normalization for pattern matching.
 * Per PRD Section 9.3, IK D3.8.
 *
 * NOTE: This is for matching, NOT for txn_id generation.
 * txn_id uses raw_description per IK D2.12.
 */

/**
 * Normalize transaction description for consistent pattern matching.
 *
 * Transformations:
 * - Convert to uppercase
 * - Replace * and # with space (common bank separators)
 * - Collapse multiple whitespace to single space
 * - Trim leading/trailing whitespace
 *
 * @param raw - Raw description string
 * @returns Normalized description for matching
 */
export function normalizeDescription(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
```

### Task 2.7: Create utils/index.ts

**File:** `packages/core/src/utils/index.ts` — CREATE

```typescript
export { generateTxnId, resolveCollisions, buildCollisionMap } from './txn-id.js';
export { normalizeDescription } from './normalize.js';
```

### Task 2.8: Create parser/amex.ts

**File:** `packages/core/src/parser/amex.ts` — CREATE

**CRITICAL:** No `console.*` calls. Returns warnings as data in ParseResult.

```typescript
/**
 * Amex transaction parser.
 * Per PRD Section 8.2.
 *
 * Format:
 * - XLSX format
 * - Skip 6 header rows
 * - Amount convention: positive = charge (money out), negative = credit/refund
 * - Has category column
 *
 * Per IK D3.1: Amex positive = charge, so signed_amount = -raw
 *
 * ARCHITECTURAL NOTE: No console.* calls. Warnings returned in ParseResult.
 */

import * as XLSX from 'xlsx';
import Decimal from 'decimal.js';
import type { Transaction, ParseResult } from '../types/index.js';
import { UNCATEGORIZED_CATEGORY_ID } from '../types/index.js';
import { generateTxnId } from '../utils/txn-id.js';
import { normalizeDescription } from '../utils/normalize.js';

/**
 * Parse Amex transaction export.
 *
 * @param data - File contents as ArrayBuffer
 * @param accountId - 4-digit account ID from filename
 * @param sourceFile - Original filename for traceability
 * @returns ParseResult with transactions, warnings, and skip count
 */
export function parseAmex(data: ArrayBuffer, accountId: number, sourceFile: string): ParseResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  // Convert to JSON, skipping first 6 rows
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { range: 6 });

  const warnings: string[] = [];
  const transactions: Transaction[] = [];
  let skippedRows = 0;

  if (rows.length === 0) {
    return { transactions, warnings, skippedRows };
  }

  // Header validation - check first row has expected columns
  const firstRow = rows[0];
  const requiredColumns = ['Date', 'Description', 'Amount'];
  const missingColumns = requiredColumns.filter((col) => !(col in firstRow));

  if (missingColumns.length > 0) {
    throw new Error(
      `Amex parser: Missing required columns: ${missingColumns.join(', ')}. ` +
        `Found: ${Object.keys(firstRow).join(', ')}`
    );
  }

  for (const row of rows) {
    const dateValue = row['Date'];
    if (!dateValue) {
      skippedRows++;
      continue;
    }

    // Parse date
    const txnDate = parseAmexDate(dateValue);
    if (!txnDate) {
      skippedRows++;
      continue;
    }

    const rawDesc = String(row['Description'] ?? '');
    const rawAmountStr = String(row['Amount'] ?? '0');

    // Handle amount - strip commas if present
    const cleanAmount = rawAmountStr.replace(/,/g, '');
    let rawAmount: Decimal;
    try {
      rawAmount = new Decimal(cleanAmount);
    } catch {
      warnings.push(`Invalid amount "${rawAmountStr}" in row, skipping`);
      skippedRows++;
      continue;
    }

    // Amex: positive = charge = money out, so negate
    const signedAmount = rawAmount.negated();

    // Format date as ISO
    const effectiveDate = formatIsoDate(txnDate);

    const txn: Transaction = {
      txn_id: generateTxnId(effectiveDate, rawDesc, signedAmount, accountId),
      txn_date: effectiveDate,
      post_date: effectiveDate, // Amex doesn't always have separate post date
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

    transactions.push(txn);
  }

  // Add warning if rows were skipped
  if (skippedRows > 0) {
    warnings.push(`Skipped ${skippedRows} rows with invalid or missing dates`);
  }

  return { transactions, warnings, skippedRows };
}

/**
 * Parse Amex date value (Excel serial or string).
 */
function parseAmexDate(value: unknown): Date | null {
  if (typeof value === 'number') {
    // Excel serial date
    return excelSerialToDate(value);
  }

  if (typeof value === 'string') {
    // Try MM/DD/YYYY format
    const mdyMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (mdyMatch) {
      const [, month, day, year] = mdyMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return isValidDate(date) ? date : null;
    }

    // Try YYYY-MM-DD format
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return isValidDate(date) ? date : null;
    }
  }

  return null;
}

/**
 * Convert Excel serial date to JavaScript Date.
 */
function excelSerialToDate(serial: number): Date {
  // Excel serial: days since 1899-12-30 (accounting for 1900 leap year bug)
  const utcDays = serial - 25569; // Adjust to Unix epoch
  const utcMs = utcDays * 86400 * 1000;
  return new Date(utcMs);
}

/**
 * Check if date is valid.
 */
function isValidDate(date: Date): boolean {
  return !isNaN(date.getTime());
}

/**
 * Format date as ISO YYYY-MM-DD string.
 */
function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

### Task 2.9: Create parser/detect.ts

**File:** `packages/core/src/parser/detect.ts` — CREATE

```typescript
/**
 * Parser detection from filename.
 * Per PRD Section 8.1.
 *
 * Filename convention: {institution}_{accountID}_{YYYYMM}.{ext}
 * Example: amex_2122_202601.xlsx
 */

import type { ParseResult } from '../types/index.js';
import { parseAmex } from './amex.js';

/**
 * Parser function signature.
 * Takes ArrayBuffer (not file path) to keep core headless.
 */
export type ParserFn = (data: ArrayBuffer, accountId: number, sourceFile: string) => ParseResult;

/**
 * Parser registry entry.
 */
interface ParserEntry {
  /** Regex pattern to match filename */
  pattern: RegExp;
  /** Parser function */
  parser: ParserFn;
}

/**
 * Registry of parsers.
 * Per PRD Section 8.1, filename convention: {institution}_{accountID}_{YYYYMM}.{ext}
 */
const PARSERS: Record<string, ParserEntry> = {
  amex: {
    pattern: /^amex_\d{4}_\d{6}\.xlsx$/i,
    parser: parseAmex,
  },
  // Remaining parsers will be added in Phase 2:
  // chase_checking, boa_checking, boa_credit, fidelity, discover
};

/**
 * Detection result returned by detectParser.
 */
export interface ParserDetectionResult {
  parser: ParserFn;
  accountId: number;
  parserName: string;
}

/**
 * Detect parser for a given filename.
 *
 * Per PRD Section 8.1:
 * - Skip hidden files (start with .)
 * - Skip temp files (start with ~)
 * - Extract account ID from filename
 *
 * @param filename - Base filename (not full path)
 * @returns Detection result or null if no parser matches
 */
export function detectParser(filename: string): ParserDetectionResult | null {
  // Per IK D8.8: Skip hidden and temp files
  if (filename.startsWith('.') || filename.startsWith('~')) {
    return null;
  }

  for (const [name, { pattern, parser }] of Object.entries(PARSERS)) {
    if (pattern.test(filename)) {
      const accountId = extractAccountId(filename);
      if (accountId !== null) {
        return { parser, accountId, parserName: name };
      }
    }
  }

  return null;
}

/**
 * Extract 4-digit account ID from filename.
 * Expected format: {institution}_{accountID}_{YYYYMM}.{ext}
 *
 * @param filename - Filename to parse
 * @returns 4-digit account ID or null if not found
 */
export function extractAccountId(filename: string): number | null {
  const parts = filename.split('_');
  if (parts.length >= 2) {
    const idStr = parts[1];
    if (/^\d{4}$/.test(idStr)) {
      return parseInt(idStr, 10);
    }
  }
  return null;
}

/**
 * Get list of supported parser names.
 */
export function getSupportedParsers(): string[] {
  return Object.keys(PARSERS);
}
```

### Task 2.10: Create parser/index.ts

**File:** `packages/core/src/parser/index.ts` — CREATE

```typescript
export { parseAmex } from './amex.js';
export { detectParser, extractAccountId, getSupportedParsers } from './detect.js';
export type { ParserFn, ParserDetectionResult } from './detect.js';
```

### Task 2.11: Create index.ts

**File:** `packages/core/src/index.ts` — CREATE

```typescript
// Types (re-exported from shared)
export type {
  Transaction,
  CategorizationResult,
  Rule,
  RuleSet,
  Account,
  ChartOfAccounts,
  JournalLine,
  JournalEntry,
  RunManifest,
  ParseResult,
} from './types/index.js';

export {
  TransactionSchema,
  CategorizationResultSchema,
  RuleSchema,
  RuleSetSchema,
  AccountSchema,
  ChartOfAccountsSchema,
  JournalLineSchema,
  JournalEntrySchema,
  RunManifestSchema,
  ParseResultSchema,
  UNCATEGORIZED_CATEGORY_ID,
  CONFIDENCE,
  PATTERN_VALIDATION,
  MATCHING_CONFIG,
  TXN_ID,
} from './types/index.js';

// Utils
export { generateTxnId, resolveCollisions, buildCollisionMap } from './utils/index.js';
export { normalizeDescription } from './utils/index.js';

// Parsers
export { parseAmex } from './parser/index.js';
export { detectParser, extractAccountId, getSupportedParsers } from './parser/index.js';
export type { ParserFn, ParserDetectionResult } from './parser/index.js';
```

### Task 2.12: Create tests/utils/txn-id.test.ts

**File:** `packages/core/tests/utils/txn-id.test.ts` — CREATE

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { generateTxnId, resolveCollisions, buildCollisionMap } from '../../src/utils/txn-id.js';
import type { Transaction } from '../../src/types/index.js';

describe('generateTxnId', () => {
  it('generates 16-character hex string', () => {
    const id = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic - same input produces same output', () => {
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    expect(id1).toBe(id2);
  });

  it('produces different IDs for different dates', () => {
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-16', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    expect(id1).not.toBe(id2);
  });

  it('produces different IDs for different descriptions', () => {
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'LYFT *RIDE', new Decimal('-23.45'), 2122);
    expect(id1).not.toBe(id2);
  });

  it('produces different IDs for different amounts', () => {
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-25.00'), 2122);
    expect(id1).not.toBe(id2);
  });

  it('produces different IDs for different accounts', () => {
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2120);
    expect(id1).not.toBe(id2);
  });

  it('handles positive amounts (refunds)', () => {
    const id = generateTxnId('2026-01-15', 'REFUND', new Decimal('50.00'), 2122);
    expect(id).toHaveLength(16);
  });

  it('handles zero amount', () => {
    const id = generateTxnId('2026-01-15', 'ZERO', new Decimal('0'), 2122);
    expect(id).toHaveLength(16);
  });

  it('normalizes trailing zeros in amount', () => {
    // Per IK D2.12: amounts should be normalized
    const id1 = generateTxnId('2026-01-15', 'TEST', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'TEST', new Decimal('-23.450'), 2122);
    expect(id1).toBe(id2);
  });

  it('uses raw description for hash (not normalized)', () => {
    // Per IK D2.12: hash uses raw_description, not normalized
    const id1 = generateTxnId('2026-01-15', 'UBER *TRIP', new Decimal('-23.45'), 2122);
    const id2 = generateTxnId('2026-01-15', 'UBER TRIP', new Decimal('-23.45'), 2122);
    expect(id1).not.toBe(id2); // Different because raw description differs
  });
});

describe('resolveCollisions', () => {
  const makeTxn = (id: string): Transaction => ({
    txn_id: id,
    txn_date: '2026-01-15',
    post_date: '2026-01-15',
    effective_date: '2026-01-15',
    description: 'TEST',
    raw_description: 'TEST',
    signed_amount: '-10.00',
    account_id: 2122,
    category_id: 4999,
    source_file: 'test.xlsx',
    confidence: 0,
    needs_review: false,
    review_reasons: [],
  });

  it('returns new array (does not mutate input)', () => {
    const original = [makeTxn('aaaa111111111111')];
    const result = resolveCollisions(original);
    expect(result).not.toBe(original);
    expect(result[0]).not.toBe(original[0]);
  });

  it('leaves unique IDs unchanged', () => {
    const txns = [
      makeTxn('aaaa111111111111'),
      makeTxn('bbbb222222222222'),
      makeTxn('cccc333333333333'),
    ];

    const result = resolveCollisions(txns);

    expect(result[0].txn_id).toBe('aaaa111111111111');
    expect(result[1].txn_id).toBe('bbbb222222222222');
    expect(result[2].txn_id).toBe('cccc333333333333');
  });

  it('adds suffix to duplicate IDs', () => {
    const txns = [
      makeTxn('aaaa111111111111'),
      makeTxn('aaaa111111111111'),
      makeTxn('aaaa111111111111'),
    ];

    const result = resolveCollisions(txns);

    expect(result[0].txn_id).toBe('aaaa111111111111');
    expect(result[1].txn_id).toBe('aaaa111111111111-02');
    expect(result[2].txn_id).toBe('aaaa111111111111-03');
  });

  it('handles mixed unique and duplicate IDs', () => {
    const txns = [
      makeTxn('aaaa111111111111'),
      makeTxn('bbbb222222222222'),
      makeTxn('aaaa111111111111'),
      makeTxn('cccc333333333333'),
      makeTxn('aaaa111111111111'),
    ];

    const result = resolveCollisions(txns);

    expect(result[0].txn_id).toBe('aaaa111111111111');
    expect(result[1].txn_id).toBe('bbbb222222222222');
    expect(result[2].txn_id).toBe('aaaa111111111111-02');
    expect(result[3].txn_id).toBe('cccc333333333333');
    expect(result[4].txn_id).toBe('aaaa111111111111-03');
  });

  it('preserves all other transaction fields', () => {
    const txn = makeTxn('aaaa111111111111');
    txn.description = 'ORIGINAL';
    txn.signed_amount = '-99.99';

    const result = resolveCollisions([txn, makeTxn('aaaa111111111111')]);

    expect(result[0].description).toBe('ORIGINAL');
    expect(result[0].signed_amount).toBe('-99.99');
  });
});

describe('buildCollisionMap', () => {
  const makeTxn = (id: string): Transaction => ({
    txn_id: id,
    txn_date: '2026-01-15',
    post_date: '2026-01-15',
    effective_date: '2026-01-15',
    description: 'TEST',
    raw_description: 'TEST',
    signed_amount: '-10.00',
    account_id: 2122,
    category_id: 4999,
    source_file: 'test.xlsx',
    confidence: 0,
    needs_review: false,
    review_reasons: [],
  });

  it('returns empty map for no collisions', () => {
    const txns = [makeTxn('aaaa111111111111'), makeTxn('bbbb222222222222')];
    const map = buildCollisionMap(txns);
    expect(map).toEqual({});
  });

  it('includes collision counts for duplicates', () => {
    const txns = [
      makeTxn('aaaa111111111111'),
      makeTxn('aaaa111111111111-02'),
      makeTxn('aaaa111111111111-03'),
      makeTxn('bbbb222222222222'),
    ];

    const map = buildCollisionMap(txns);
    expect(map).toEqual({ aaaa111111111111: 3 });
  });

  it('handles multiple collision groups', () => {
    const txns = [
      makeTxn('aaaa111111111111'),
      makeTxn('aaaa111111111111-02'),
      makeTxn('bbbb222222222222'),
      makeTxn('bbbb222222222222-02'),
    ];

    const map = buildCollisionMap(txns);
    expect(map).toEqual({
      aaaa111111111111: 2,
      bbbb222222222222: 2,
    });
  });
});
```

### Task 2.13: Create tests/utils/normalize.test.ts

**File:** `packages/core/tests/utils/normalize.test.ts` — CREATE

```typescript
import { describe, it, expect } from 'vitest';
import { normalizeDescription } from '../../src/utils/normalize.js';

describe('normalizeDescription', () => {
  it('converts to uppercase', () => {
    expect(normalizeDescription('uber trip')).toBe('UBER TRIP');
  });

  it('replaces * with space', () => {
    expect(normalizeDescription('UBER*TRIP')).toBe('UBER TRIP');
  });

  it('replaces # with space', () => {
    expect(normalizeDescription('STORE#123')).toBe('STORE 123');
  });

  it('collapses multiple spaces', () => {
    expect(normalizeDescription('UBER   TRIP')).toBe('UBER TRIP');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeDescription('  UBER TRIP  ')).toBe('UBER TRIP');
  });

  it('handles complex real-world descriptions', () => {
    expect(normalizeDescription('UBER *TRIP HELP.UBER.COM')).toBe('UBER TRIP HELP.UBER.COM');
    expect(normalizeDescription('AMZN*1A2B3C4D5E AMZN.COM/BILL')).toBe(
      'AMZN 1A2B3C4D5E AMZN.COM/BILL'
    );
  });

  it('handles empty string', () => {
    expect(normalizeDescription('')).toBe('');
  });

  it('handles string with only special characters', () => {
    expect(normalizeDescription('***###')).toBe('');
  });

  it('preserves other punctuation', () => {
    expect(normalizeDescription('HELP.UBER.COM')).toBe('HELP.UBER.COM');
    expect(normalizeDescription('AMAZON-PRIME')).toBe('AMAZON-PRIME');
  });
});
```

### Task 2.14: Create tests/parser/amex.test.ts

**File:** `packages/core/tests/parser/amex.test.ts` — CREATE

```typescript
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseAmex } from '../../src/parser/amex.js';
import { UNCATEGORIZED_CATEGORY_ID } from '../../src/types/index.js';

describe('parseAmex', () => {
  /**
   * Create mock Amex XLSX data.
   * Amex format has 6 header rows before data.
   */
  function createAmexWorkbook(rows: Record<string, unknown>[]): ArrayBuffer {
    const headerRows = Array(6).fill(['', '', '', '', '']);
    const dataWithHeaders = [
      ['Date', 'Description', 'Amount', 'Category'],
      ...rows.map((r) => [r['Date'], r['Description'], r['Amount'], r['Category']]),
    ];

    const ws = XLSX.utils.aoa_to_sheet([...headerRows, ...dataWithHeaders]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  it('parses valid Amex transactions', () => {
    const data = createAmexWorkbook([
      { Date: '01/15/2026', Description: 'UBER *TRIP', Amount: '23.45', Category: 'Transportation' },
      { Date: '01/16/2026', Description: 'STARBUCKS', Amount: '5.00', Category: 'Restaurant' },
    ]);

    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result.transactions).toHaveLength(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.skippedRows).toBe(0);

    // First transaction
    const txn1 = result.transactions[0];
    expect(txn1.effective_date).toBe('2026-01-15');
    expect(txn1.raw_description).toBe('UBER *TRIP');
    expect(txn1.description).toBe('UBER TRIP'); // Normalized
    expect(txn1.signed_amount).toBe('-23.45'); // Negated (charge = money out)
    expect(txn1.account_id).toBe(2122);
    expect(txn1.raw_category).toBe('Transportation');
    expect(txn1.txn_id).toHaveLength(16);
    expect(txn1.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);

    // Second transaction
    const txn2 = result.transactions[1];
    expect(txn2.effective_date).toBe('2026-01-16');
    expect(txn2.signed_amount).toBe('-5'); // Decimal normalizes
  });

  it('handles negative amounts (refunds)', () => {
    const data = createAmexWorkbook([
      { Date: '01/15/2026', Description: 'REFUND', Amount: '-50.00', Category: 'Other' },
    ]);

    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].signed_amount).toBe('50'); // -(-50) = 50 (money in)
  });

  it('returns empty result for empty file', () => {
    const data = createAmexWorkbook([]);
    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result.transactions).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.skippedRows).toBe(0);
  });

  it('generates deterministic txn_ids', () => {
    const data = createAmexWorkbook([
      { Date: '01/15/2026', Description: 'UBER *TRIP', Amount: '23.45', Category: 'Transportation' },
    ]);

    const result1 = parseAmex(data, 2122, 'amex_2122_202601.xlsx');
    const result2 = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result1.transactions[0].txn_id).toBe(result2.transactions[0].txn_id);
  });

  it('sets default values correctly', () => {
    const data = createAmexWorkbook([
      { Date: '01/15/2026', Description: 'TEST', Amount: '10.00', Category: '' },
    ]);

    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');
    const txn = result.transactions[0];

    expect(txn.category_id).toBe(UNCATEGORIZED_CATEGORY_ID);
    expect(txn.confidence).toBe(0);
    expect(txn.needs_review).toBe(false);
    expect(txn.review_reasons).toEqual([]);
  });

  it('skips rows with invalid dates and adds warning', () => {
    const data = createAmexWorkbook([
      { Date: '01/15/2026', Description: 'VALID', Amount: '10.00', Category: '' },
      { Date: 'invalid', Description: 'INVALID DATE', Amount: '20.00', Category: '' },
      { Date: '', Description: 'MISSING DATE', Amount: '30.00', Category: '' },
    ]);

    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(2);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Skipped 2 rows');
  });

  it('handles Excel serial dates', () => {
    // Excel serial for 2026-01-15 is approximately 46036
    const data = createAmexWorkbook([
      { Date: 46036, Description: 'EXCEL DATE', Amount: '10.00', Category: '' },
    ]);

    const result = parseAmex(data, 2122, 'amex_2122_202601.xlsx');

    expect(result.transactions).toHaveLength(1);
    // Date should be parsed (exact date depends on Excel serial calculation)
    expect(result.transactions[0].effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('throws error for missing required columns', () => {
    // Create workbook with wrong columns
    const headerRows = Array(6).fill(['', '', '', '', '']);
    const ws = XLSX.utils.aoa_to_sheet([
      ...headerRows,
      ['WrongColumn1', 'WrongColumn2', 'WrongColumn3'],
      ['2026-01-15', 'TEST', '10.00'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const data = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

    expect(() => parseAmex(data, 2122, 'amex_2122_202601.xlsx')).toThrow('Missing required columns');
  });
});
```

### Task 2.15: Create tests/parser/detect.test.ts

**File:** `packages/core/tests/parser/detect.test.ts` — CREATE

```typescript
import { describe, it, expect } from 'vitest';
import { detectParser, extractAccountId, getSupportedParsers } from '../../src/parser/detect.js';

describe('detectParser', () => {
  it('detects Amex parser from valid filename', () => {
    const result = detectParser('amex_2122_202601.xlsx');

    expect(result).not.toBeNull();
    expect(result!.parserName).toBe('amex');
    expect(result!.accountId).toBe(2122);
    expect(typeof result!.parser).toBe('function');
  });

  it('detects Amex parser case-insensitively', () => {
    const result = detectParser('AMEX_2122_202601.XLSX');
    expect(result).not.toBeNull();
    expect(result!.parserName).toBe('amex');
  });

  it('returns null for hidden files', () => {
    expect(detectParser('.DS_Store')).toBeNull();
    expect(detectParser('.gitkeep')).toBeNull();
  });

  it('returns null for temp files', () => {
    expect(detectParser('~$amex_2122_202601.xlsx')).toBeNull();
  });

  it('returns null for unrecognized files', () => {
    expect(detectParser('unknown_file.csv')).toBeNull();
    expect(detectParser('random.txt')).toBeNull();
  });

  it('returns null for invalid account ID format', () => {
    expect(detectParser('amex_12_202601.xlsx')).toBeNull(); // Too short
    expect(detectParser('amex_12345_202601.xlsx')).toBeNull(); // Too long
    expect(detectParser('amex_abcd_202601.xlsx')).toBeNull(); // Not numeric
  });
});

describe('extractAccountId', () => {
  it('extracts 4-digit account ID', () => {
    expect(extractAccountId('amex_2122_202601.xlsx')).toBe(2122);
    expect(extractAccountId('chase_1120_202601.csv')).toBe(1120);
    expect(extractAccountId('boa_1110_202601.csv')).toBe(1110);
  });

  it('returns null for invalid formats', () => {
    expect(extractAccountId('invalid')).toBeNull();
    expect(extractAccountId('amex_12_202601.xlsx')).toBeNull();
    expect(extractAccountId('amex_12345_202601.xlsx')).toBeNull();
  });
});

describe('getSupportedParsers', () => {
  it('returns list of parser names', () => {
    const parsers = getSupportedParsers();
    expect(parsers).toContain('amex');
    expect(Array.isArray(parsers)).toBe(true);
  });
});
```

---

## 5. Package: @finance-engine/cli

### Task 3.1: Create Package Structure

**Directory structure:**
```
packages/cli/
├── package.json
├── tsconfig.json
└── src/
    └── index.ts
```

### Task 3.2: Create package.json

**File:** `packages/cli/package.json` — CREATE

```json
{
  "name": "@finance-engine/cli",
  "version": "2.0.0",
  "type": "module",
  "bin": {
    "fineng": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "start": "node ./dist/index.js"
  },
  "dependencies": {
    "@finance-engine/core": "workspace:*",
    "@finance-engine/shared": "workspace:*"
  }
}
```

### Task 3.3: Create tsconfig.json

**File:** `packages/cli/tsconfig.json` — CREATE

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["tests", "dist"],
  "references": [{ "path": "../shared" }, { "path": "../core" }]
}
```

### Task 3.4: Create index.ts

**File:** `packages/cli/src/index.ts` — CREATE

```typescript
#!/usr/bin/env node
/**
 * Finance Engine CLI - Phase 1 Proof of Concept
 *
 * This minimal CLI demonstrates the headless core architecture:
 * - CLI handles all file I/O (uses node:fs)
 * - Core receives ArrayBuffer, returns ParseResult
 * - Core has no file system access, no console.* calls
 *
 * Full implementation will be added in Phase 5.
 */

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { detectParser, resolveCollisions, type ParseResult } from '@finance-engine/core';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Finance Engine CLI v2.0.0');
    console.log('');
    console.log('Phase 1 Proof of Concept');
    console.log('Usage: fineng <amex-file.xlsx>');
    console.log('');
    console.log('Example:');
    console.log('  fineng amex_2122_202601.xlsx');
    process.exit(0);
  }

  const filePath = args[0];
  const filename = basename(filePath);

  // Detect parser from filename
  const detection = detectParser(filename);
  if (!detection) {
    console.error(`Error: No parser found for file: ${filename}`);
    console.error('Expected format: {institution}_{accountID}_{YYYYMM}.{ext}');
    console.error('Example: amex_2122_202601.xlsx');
    process.exit(1);
  }

  console.log(`Detected parser: ${detection.parserName}`);
  console.log(`Account ID: ${detection.accountId}`);
  console.log('');

  // CLI handles file I/O - reads file to ArrayBuffer
  let fileBuffer: Buffer;
  try {
    fileBuffer = readFileSync(filePath);
  } catch (err) {
    console.error(`Error reading file: ${(err as Error).message}`);
    process.exit(1);
  }

  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );

  // Core receives ArrayBuffer, returns ParseResult (no I/O in core)
  let result: ParseResult;
  try {
    result = detection.parser(arrayBuffer, detection.accountId, filename);
  } catch (err) {
    console.error(`Error parsing file: ${(err as Error).message}`);
    process.exit(1);
  }

  // CLI handles warnings from core (core doesn't log them)
  for (const warning of result.warnings) {
    console.warn(`Warning: ${warning}`);
  }

  // Handle collisions (pure function, returns new array)
  const transactions = resolveCollisions(result.transactions);

  console.log(`Parsed ${transactions.length} transactions:`);
  console.log('');

  // Display transactions
  for (const txn of transactions) {
    const amount = txn.signed_amount.padStart(10);
    const desc = txn.description.slice(0, 40).padEnd(40);
    console.log(`${txn.effective_date} | ${amount} | ${desc}`);
  }

  console.log('');
  console.log(`Skipped rows: ${result.skippedRows}`);
  console.log('');
  console.log('✓ Phase 1 PoC complete - headless core architecture verified.');
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
```

---

## 6. Package: @finance-engine/web (Scaffold)

### Task 4.1: Create Package Structure

**Directory structure:**
```
packages/web/
├── package.json
├── tsconfig.json
├── src/
│   └── index.ts
└── README.md
```

### Task 4.2: Create package.json

**File:** `packages/web/package.json` — CREATE

```json
{
  "name": "@finance-engine/web",
  "version": "2.0.0",
  "type": "module",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@finance-engine/core": "workspace:*",
    "@finance-engine/shared": "workspace:*"
  }
}
```

### Task 4.3: Create tsconfig.json

**File:** `packages/web/tsconfig.json` — CREATE

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist"],
  "references": [{ "path": "../shared" }, { "path": "../core" }]
}
```

### Task 4.4: Create index.ts

**File:** `packages/web/src/index.ts` — CREATE

```typescript
/**
 * @finance-engine/web
 *
 * Browser/PWA frontend for Finance Engine.
 * OUT OF SCOPE for initial release.
 *
 * The core package is designed to run in browser without modification.
 */

export const VERSION = '2.0.0';
export const STATUS = 'scaffold';
```

### Task 4.5: Create README.md

**File:** `packages/web/README.md` — CREATE

```markdown
# @finance-engine/web

Browser/PWA frontend for Finance Engine.

## Status

**OUT OF SCOPE** for initial v2.0 release.

This package is scaffolded for future implementation. The `@finance-engine/core` package is designed to run in browser without modification.

## Planned Features

- File upload interface (drag & drop)
- Transaction review UI
- Category management
- Report generation and visualization
- IndexedDB for local storage
- Optional sync to cloud folders

## Architecture

The web package will:
1. Use File API to read uploaded bank exports
2. Pass ArrayBuffer to core parsers (same as CLI)
3. Display transactions for review
4. Export results as Excel downloads

All processing happens client-side. No transaction data leaves the browser.
```

---

## 7. Final Verification

### Task 5.1: Install Dependencies

```bash
cd /Users/jonathanoh/Dev/finance-engine-2.0
pnpm install
```

### Task 5.2: Build All Packages

```bash
pnpm build
```

### Task 5.3: Run All Tests

```bash
pnpm test
```

### Task 5.4: Verify Architecture Constraints

```bash
pnpm verify:core-constraints
```

Expected output:
```
Verifying @finance-engine/core architectural constraints...

Checking N TypeScript files...

✓ All architectural constraints satisfied!

Verified:
  - No node:* imports
  - No fs/path/crypto imports
  - No console.* calls
  - No process.* access
  - No require() calls
```

### Task 5.5: Manual Verification Checklist

- [ ] `pnpm install` succeeds with no errors
- [ ] `pnpm build` compiles all 4 packages
- [ ] `pnpm test` passes all tests
- [ ] `pnpm verify:core-constraints` reports no violations
- [ ] `packages/core/src/` contains no `node:*` imports
- [ ] `packages/core/src/` contains no `console.*` calls
- [ ] `resolveCollisions` returns new array (check test passes)
- [ ] `generateTxnId` uses `js-sha256` (check import in txn-id.ts)

---

## 8. Commit History

Execute commits in this order:

```bash
# 1. Infrastructure
git add package.json pnpm-workspace.yaml tsconfig.json vitest.config.ts eslint.config.js .prettierrc .gitignore scripts/
git commit -m "feat(infra): add monorepo configuration and build tooling"

# 2. Shared package
git add packages/shared/
git commit -m "feat(shared): add Zod schemas and type definitions"

# 3. Core utilities
git add packages/core/package.json packages/core/tsconfig.json packages/core/src/types/ packages/core/src/utils/
git commit -m "feat(core): add txn-id generation and description normalization"

# 4. Core parser
git add packages/core/src/parser/ packages/core/src/index.ts
git commit -m "feat(core): add Amex parser with detection"

# 5. Core tests
git add packages/core/tests/
git commit -m "test(core): add comprehensive test suites"

# 6. CLI
git add packages/cli/
git commit -m "feat(cli): add minimal proof-of-concept CLI"

# 7. Web scaffold
git add packages/web/
git commit -m "feat(web): add scaffold package"
```

---

## 9. PR Template

**Branch:** `phase-1/foundation`
**Title:** `feat(phase-1): Foundation scaffold with proof of architecture`

**Body:**
```markdown
## Summary

Phase 1 of Finance Engine v2.0 TypeScript rewrite. Establishes complete monorepo infrastructure and proves the headless core architecture with a working Amex parser.

## Key Decisions

- **Hashing:** Uses `js-sha256` for cross-platform compatibility (not `node:crypto`)
- **Pure functions:** `resolveCollisions` returns new array, no mutation
- **No side effects in core:** Parsers return warnings in `ParseResult`, no `console.*`

## Changes

- Monorepo setup with pnpm workspaces
- TypeScript project references for incremental builds
- Vitest for testing, ESLint with no-console rule
- Architecture constraint verification script
- `@finance-engine/shared`: Zod schemas matching PRD v2.2
- `@finance-engine/core`: Transaction ID, normalization, Amex parser
- `@finance-engine/cli`: Minimal PoC demonstrating headless core
- `@finance-engine/web`: Scaffold (out of scope for v2.0)

## Architecture Verification

- [x] Core has no `node:*` imports
- [x] Core has no `console.*` calls
- [x] Core functions are pure (no mutation)
- [x] All monetary values use decimal.js
- [x] Zod schemas match PRD Section 7

## Test Plan

- [x] `pnpm build` succeeds
- [x] `pnpm test` passes
- [x] `pnpm verify:core-constraints` reports no violations

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## Critical Files Summary

| Package | File | Purpose |
|---------|------|---------|
| root | `scripts/verify-core-constraints.mjs` | Verifies ALL architectural constraints |
| shared | `src/schemas.ts` | All Zod schemas - source of truth |
| shared | `src/constants.ts` | Confidence scores, validation thresholds |
| core | `src/utils/txn-id.ts` | Transaction ID (uses js-sha256), collision handling (pure) |
| core | `src/utils/normalize.ts` | Description normalization |
| core | `src/parser/amex.ts` | Amex parser (returns ParseResult with warnings) |
| core | `src/parser/detect.ts` | Parser detection from filename |
| cli | `src/index.ts` | PoC CLI demonstrating headless core |
