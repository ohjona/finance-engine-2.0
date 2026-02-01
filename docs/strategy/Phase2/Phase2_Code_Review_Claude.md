# D.2b: Alignment Code Review (Claude) — Phase 2

## Your Role

**Alignment Reviewer** verifying code matches specification and maintains architectural constraints.

**Review scope:** Phase 2 of Finance Engine v2.0 - Five new bank parsers plus detectParser expansion.

---

## 1. Sign Convention Compliance (IK D3.1)

**This is the single most important check.** A wrong sign convention means every transaction is inverted.

| Parser | IK D3.1 Spec | Code Implementation | Match? |
|--------|-------------|---------------------|--------|
| Amex (Phase 1) | positive = charge → negate | `signedAmount = rawAmount.negated()` | ✅ |
| Chase Checking | positive = deposit → direct | `signedAmount = rawAmount` (line 84) | ✅ |
| BoA Checking | positive = deposit → direct | `signedAmount = rawAmount` (line 123) | ✅ |
| BoA Credit | negative = purchase → direct | `signedAmount = rawAmount` (line 78) | ✅ |
| Fidelity | negative = charge → direct | `signedAmount = rawAmount` (line 80) | ✅ |
| Discover | ASSUMPTION: negative = purchase → direct | `signedAmount = rawAmount` (line 92) | ✅ |

### Code Path Verification

**Chase Checking** (`chase-checking.ts:83-84`):
```typescript
// Chase Checking: positive = deposit, negative = withdrawal (matches our convention)
const signedAmount = rawAmount;
```

**BoA Checking** (`boa-checking.ts:122-123`):
```typescript
// BoA Checking: positive = deposit, negative = withdrawal (matches our convention)
const signedAmount = rawAmount;
```

**BoA Credit** (`boa-credit.ts:77-78`):
```typescript
// BoA Credit: negative = purchase (matches our convention)
const signedAmount = rawAmount;
```

**Fidelity** (`fidelity.ts:79-80`):
```typescript
// Fidelity: negative = charge (matches our convention)
const signedAmount = rawAmount;
```

**Discover** (`discover.ts:91-92`):
```typescript
// ASSUMPTION: Discover follows credit card convention (negative = purchase)
const signedAmount = rawAmount;
```

**All sign conventions correctly implemented.**

---

## 2. Date Format Compliance (IK D3.9)

| Parser | Expected Format | Code Implementation | Match? |
|--------|----------------|---------------------|--------|
| Chase Checking | MM/DD/YYYY | `parseDateValue(dateValue, 'MDY')` (line 63) | ✅ |
| BoA Checking | MM/DD/YYYY | `parseDateValue(dateValue, 'MDY')` (line 95) | ✅ |
| BoA Credit | MM/DD/YYYY | `parseDateValue(dateValue, 'MDY')` (line 58) | ✅ |
| Fidelity | YYYY-MM-DD | `parseDateValue(dateValue, 'ISO')` (line 60) | ✅ |
| Discover | MM/DD/YYYY | `parseDateValue(dateValue, 'MDY')` (line 65) | ✅ |

**Fidelity correctly uses ISO format; all others use MDY.**

---

## 3. Special Handling Compliance

| Requirement | Source | Implemented? | Correctly? | Evidence |
|-------------|--------|--------------|------------|----------|
| BoA Checking: smart header detection | IK D3.5 | ✅ | ✅ | `findHeaderRow()` scans first 10 rows for 'date', 'description', 'amount' |
| BoA Checking: comma stripping | IK D3.10 | ✅ | ✅ | `cleanAmount = rawAmountStr.replace(/,/g, '')` (line 105) |
| All parsers: header validation | IK D3.4 | ✅ | ✅ | Each parser validates required columns and throws with expected vs actual |
| All parsers: account ID from filename | IK D3.2 | ✅ | ✅ | `extractAccountId()` finds first 4-digit number in filename parts |
| All parsers: raw_description preserved | IK D3.8 | ✅ | ✅ | All parsers store `raw_description: rawDesc` separate from normalized |
| Amex: raw_category stored | PRD §8.2 | ✅ | ✅ | Phase 1 Amex stores `raw_category` |
| Discover: raw_category stored | PRD §8.2 | ✅ | ✅ | `raw_category: row['Category'] ? String(row['Category']) : undefined` (line 106) |

### BoA Smart Header Detection (`boa-checking.ts:31-39`)
```typescript
function findHeaderRow(rows: unknown[][], maxScan: number = BOA_CHECKING_MAX_HEADER_SCAN): number {
    for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
        const cols = rows[i].map((c) => String(c ?? '').toLowerCase());
        if (BOA_CHECKING_HEADER_PATTERNS.every((h) => cols.some((c) => c.includes(h)))) {
            return i;
        }
    }
    throw new Error('BoA Checking parser: Could not find header row in first 10 rows');
}
```
**Correctly scans first 10 rows for canonical column names.**

---

## 4. detectParser Registry Compliance

| PRD §8.1 Pattern | Implemented Pattern | Correctly? |
|-------------------|---------------------|------------|
| `amex_*_*.xlsx` | `/^amex_\d{4}_\d{6}\.xlsx$/i` | ✅ |
| `chase_checking_*_*.csv` | `/^chase_checking_\d{4}_\d{6}\.csv$/i` | ✅ |
| `boa_checking_*_*.csv` | `/^boa_checking_\d{4}_\d{6}\.csv$/i` | ✅ |
| `boa_credit_*_*.csv` | `/^boa_credit_\d{4}_\d{6}\.csv$/i` | ✅ |
| `fidelity_*_*.csv` | `/^fidelity_\d{4}_\d{6}\.csv$/i` | ✅ |
| `discover_*_*.xls` | `/^discover_\d{4}_\d{6}\.xls$/i` | ✅ |

### Critical Question: Account ID Wildcards
**Q:** Does detection use `chase_\d{4}_*` (any account) or literal IDs?
**A:** Uses wildcards (`\d{4}`) - correctly works with any 4-digit account ID.

### extractAccountId Fixed (`detect.ts:111-120`)
```typescript
export function extractAccountId(filename: string): number | null {
    const parts = filename.split('_');
    // Find the first 4-digit number in the filename parts
    for (const part of parts) {
        if (/^\d{4}$/.test(part)) {
            return parseInt(part, 10);
        }
    }
    return null;
}
```
**Supports both filename formats:**
- `amex_2122_202601.xlsx` → account ID at position [1]
- `chase_checking_1120_202601.csv` → account ID at position [2]

---

## 5. Architecture Compliance

| Constraint | Status | Verification |
|------------|--------|-------------|
| Core: no `node:*` imports | ✅ | `grep "from 'node:" packages/core/src/` returns 0 matches |
| Core: no `console.*` calls | ✅ | Only match is a comment in amex.ts documenting the constraint |
| Core: pure functions | ✅ | All parsers: ArrayBuffer in → ParseResult out, no side effects |
| All amounts use decimal.js | ✅ | All parsers: `new Decimal(cleanAmount)` |
| New dependencies browser-compatible | ✅ | Only `xlsx` and `decimal.js` - both browser-compatible |

---

## 6. Implementation Prompt Compliance

| CA Decision | Followed? | Evidence |
|-------------|-----------|----------|
| Discover sign convention: ASSUMPTION documented | ✅ | Line 8-11 of discover.ts: "ASSUMPTION: Discover follows credit card convention" |
| CSV parsing: use xlsx library | ✅ | All parsers use `XLSX.read(data, { type: 'array' })` |
| Discover XLS (HTML table): xlsx auto-detect | ✅ | `XLSX.read(data, { type: 'array', cellDates: true })` handles HTML |
| Shared date utilities created | ✅ | `date-parse.ts` with `parseDateValue()` supporting 'MDY' and 'ISO' |
| Comma stripping in BoA | ✅ | All parsers strip commas for consistency |

---

## 7. Scope Check

| Present but shouldn't be | Absent but should be |
|--------------------------|---------------------|
| (none detected) | (none detected) |

**Scope correctly bounded:**
- Only 5 new parsers (Phase 2 scope)
- No categorization logic (Phase 3)
- No matching/ledger (Phase 4)
- detectParser registry updated correctly

---

## Uncomfortable Questions

### 1. Are there any parsers where the sign convention looks right in the comment but wrong in the code?
**Answer:** No. All 6 parsers have comments that match the actual code. Verified by tracing each `signedAmount` assignment.

### 2. Does the BoA smart header detection actually work if the summary section has different numbers of rows?
**Answer:** Yes. The `findHeaderRow()` function scans up to 10 rows looking for the canonical pattern. It adapts to variable summary section lengths.

### 3. If a bank adds a new column to their export, does the parser break or gracefully ignore it?
**Answer:** Gracefully ignores. Parsers only validate that required columns exist - extra columns are silently ignored.

### 4. Is the Discover HTML-as-XLS parsing tested with realistic data, or just a trivial example?
**Answer:** Uses xlsx library's auto-format detection which handles HTML tables. The ASSUMPTION about sign convention is documented and needs validation with real Discover exports.

### 5. Can the BoA checking/credit detection ever misfire (wrong parser for the file)?
**Answer:** No. Patterns are distinct:
- `boa_checking_\d{4}_\d{6}.csv` vs `boa_credit_\d{4}_\d{6}.csv`
- The `_checking_` vs `_credit_` substring ensures correct parser selection.

---

## Issues Found

| # | Issue | Type | Severity | Source |
|---|-------|------|----------|--------|
| (none) | No blocking issues found | — | — | — |

### Notes (Non-Issues)

1. **Discover sign convention is documented as ASSUMPTION** - This is correct handling of undocumented behavior. Needs validation with real exports but is not a code defect.

2. **All parsers strip commas** - Implementation Prompt specified this for BoA only, but applying uniformly is harmless and defensive.

---

## Verdict

**Recommendation:** Approve

### No Blocking Issues
All Phase 2 requirements are correctly implemented.

### Summary
Phase 2 implementation is well-architected and fully compliant with PRD v2.2 and IK v1.2 specifications:

- **Sign conventions:** All 6 parsers correctly implement bank-specific sign transformations
- **Date formats:** Fidelity correctly uses ISO; all others correctly use MDY
- **Special handling:** BoA smart header detection works, comma stripping applied
- **detectParser:** Registry updated with wildcard patterns, extractAccountId handles both filename formats
- **Architecture:** Zero I/O in core, pure functions, decimal.js throughout
- **Discover:** ASSUMPTION documented for sign convention (credit card standard assumed)

---

## Verification Steps

```bash
# 1. Build and test all packages
pnpm build && pnpm test

# 2. Verify no node:* imports in core
grep -r "from 'node:" packages/core/src/ && echo "FAIL" || echo "PASS"

# 3. Verify no console.* calls in core (except comments)
grep -r "console\." packages/core/src/ | grep -v "// " && echo "FAIL" || echo "PASS"

# 4. Test detectParser for all 6 formats
node -e "
const { detectParser } = require('./packages/core/dist/parser/detect.js');
const files = [
  'amex_2122_202601.xlsx',
  'chase_checking_1120_202601.csv',
  'boa_checking_1110_202601.csv',
  'boa_credit_2110_202601.csv',
  'fidelity_2180_202601.csv',
  'discover_2170_202601.xls'
];
files.forEach(f => {
  const result = detectParser(f);
  console.log(f, result ? '✅' : '❌', result?.parserName, result?.accountId);
});
"
```

---

## Files Reviewed

| File | Purpose | Lines |
|------|---------|-------|
| `packages/core/src/parser/chase-checking.ts` | Chase Checking parser | 126 |
| `packages/core/src/parser/boa-checking.ts` | BoA Checking parser (smart header) | 165 |
| `packages/core/src/parser/boa-credit.ts` | BoA Credit parser | 120 |
| `packages/core/src/parser/fidelity.ts` | Fidelity parser (ISO dates) | 122 |
| `packages/core/src/parser/discover.ts` | Discover parser (HTML-as-XLS) | 135 |
| `packages/core/src/parser/detect.ts` | Parser registry + detection | 128 |

---

**Review signed by:**
- **Role:** Alignment Reviewer
- **Model:** Claude Opus 4.5
- **Date:** 2026-02-01
- **Review Type:** Code Review (D.2)
