---
id: institutional_knowledge_compendium
type: reference
version: 1.2
status: authoritative
supersedes:
  - decisions-ledger.md
date: 2026-01-26
purpose: Authoritative reference for TypeScript rewrite - captures all strategic decisions from finance-engine v1.x
depends_on:
  - PRD_v2
---

# Finance Engine: Institutional Knowledge Compendium

**Purpose:** Capture all architectural, strategic, and implementation decisions made during v1.x development. This document is the authoritative reference for the TypeScript v2.0 rewrite.

**Supersedes:** `decisions-ledger.md` (which contained ~40 decisions; this document expands to 140+)

**Source Documents:**
- PRD v1.2 (Final)
- PRD Review Response (22 issues, 3 reviewers)
- PRD Verification Response (5 additional issues)
- LLM Categorization Implementation Spec (Phases A/B)
- Spec Architect Verification (blocking issues resolved)
- Session Logs (implementation lessons)
- v2.0 Architecture Roadmap

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Data Model](#2-data-model)
3. [Parser Conventions](#3-parser-conventions)
4. [Categorization System](#4-categorization-system)
5. [LLM Integration](#5-llm-integration)
6. [Payment Matching](#6-payment-matching)
7. [Accounting Logic](#7-accounting-logic)
8. [Run Safety](#8-run-safety)
9. [Output Schemas](#9-output-schemas)
10. [Configuration](#10-configuration)
11. [Implementation Lessons](#11-implementation-lessons)
12. [Architecture Patterns](#12-architecture-patterns)
13. [Deferred Decisions](#13-deferred-decisions)
14. [Anti-Patterns & Rejected Approaches](#14-anti-patterns--rejected-approaches)
15. [Testing Decisions](#15-testing-decisions)
16. [v2.0 Overrides](#16-v20-overrides)

**Appendices:**
- [A: Decision Template](#appendix-a-decision-template)
- [B: Source Document Index](#appendix-b-source-document-index)
- [C: Cross-Reference Matrix](#appendix-c-cross-reference-matrix)
- [D: TypeScript Migration Notes](#appendix-d-typescript-migration-notes)

---

## 1. Design Philosophy

### P1.1: Core Principle — Low Maintenance, High Expandability

**Decision:** Optimize architecture for ease of understanding, ease of fixing, and ease of extending.

**Rationale:** This is a personal tool used ~12 times per year. The overhead of complex abstractions outweighs their benefits. Future-you should be able to open any file and understand what it does within minutes.

**Alternatives Considered:**
- Full ORM/database architecture — Rejected: schema migrations, connection handling add friction for monthly use
- Complex CLI framework — Rejected: harder to remember than simple scripts

**Source:** PRD 1.1

**Implementation Notes:**
- Adding a new bank parser should take ~30 minutes
- Debugging a parse failure should take minutes, not hours
- Each module should be independently understandable

---

### P1.2: What We Decided NOT to Build

**Decision:** Explicitly reject certain architectural patterns despite their theoretical benefits.

| Rejected Feature | Reason |
|-----------------|--------|
| SQLite Database | Schema migrations, connection handling, query debugging — all ceremony for 12 uses/year |
| Full API Class (15+ methods) | Forces understanding an abstraction layer just to debug why December didn't parse |
| Complex CLI with subcommands | `finance process --month 2026-01 --exports ./path --no-match --dry-run` is harder to remember than `python process_month.py 2026-01` |
| Direct Excel Append | Writing to master 10-year ledger automatically is too risky; one bug = corrupted history |

**Rationale:** You can always add complexity later. You can't easily remove it.

**Source:** PRD 1.2, PRD Review Response Contradiction #1

**Implementation Notes:**
- These patterns may be reconsidered for v2+ if pain is felt
- Document the trigger conditions for reconsidering each

---

### P1.3: What We Decided TO Keep

**Decision:** Certain features provide sufficient value despite their complexity.

| Feature | Why Worth It |
|---------|--------------|
| 3-Layer Categorization | Write once in YAML, rarely touch; low maintenance after initial setup |
| Transaction Matching | Pattern matching logic in one function; once working, never needs updates |
| Parser Registry | Each parser is standalone; bank changes format? Edit one function |
| Run Safety | Hash-based deduplication + manifest prevents accidents; set up once, protects forever |

**Source:** PRD 1.3

---

### P1.4: Technology Choices

**Decision:** Use simple, widely-known technologies.

| Choice | Rationale |
|--------|-----------|
| Python scripts | Most widely known; easy to debug; Googleable problems |
| YAML config (rules) | Human-readable, supports comments, frequently edited |
| JSON config (accounts) | Rarely edited, structured data |
| Excel output | Already using Excel; keep what works |
| `decimal.Decimal` | Never use floats for money; prevents penny drift |
| No database (initially) | Files are the database; simpler to backup, share, debug |

**Alternatives Considered:**
- TypeScript from start — Rejected for v1: Python faster to prototype; TypeScript for v2

**Source:** PRD 1.4

**Implementation Notes:**
- TypeScript equivalent for Decimal: use `decimal.js`
- TypeScript equivalent for YAML: use `yaml` package with round-trip preservation

---

### P1.5: Privacy-First Design

**Decision:** All transaction processing happens client-side. No data leaves user's machine.

**Rationale:** Bank data is sensitive. Users should not need to trust a server.

**Alternatives Considered:**
- Cloud processing with encryption — Rejected: still requires trust

**Source:** v2.0 Architecture Roadmap

**Implementation Notes:**
- Server (if any) only provides: static assets, shared rules, optional telemetry
- LLM calls use user-provided API keys (BYOT model)

---

### P1.6: Telemetry Constraints

**Decision:** If telemetry is collected, it must be opt-in and anonymized.

**Allowed:**
- Category usage frequency
- Rule match rates
- Error types

**NOT Allowed:**
- Transaction amounts
- Descriptions
- Account IDs

**Source:** v2.0 Architecture Roadmap

---

### P1.7: Copy-Paste Safety Checkpoint

**Decision:** Never let the tool write directly to the master ledger file.

**Rationale:** One bug = 10 years of corrupted history. Copy-paste keeps the human as a verification checkpoint.

**Alternatives Considered:**
- Append to "Ingest" tab in master Excel — Rejected (Gemini suggestion)

**Source:** PRD Review Response Contradiction #1

---

### P1.8: Future Expansion Philosophy

**Decision:** Design for today, but document upgrade paths.

| Today (v1) | Future (v2+) | Trigger |
|------------|--------------|---------|
| YAML/JSON files | SQLite | >200 rules or query needs |
| Python scripts | CLI wrapper (Click) | Need --verbose, subcommands |
| Excel output | Web dashboard | Visualization needs |
| Manual exports | Plaid API | Download fatigue |

**Source:** PRD 14

---

## 2. Data Model

### D2.1: Signed Amount Convention

**Decision:** Use single `signed_amount` field with cash-flow semantics.

| Sign | Meaning |
|------|---------|
| Positive | Money in (deposits, refunds, payments received) |
| Negative | Money out (charges, withdrawals, payments made) |

**Rationale:** "Debit/credit" is ambiguous depending on account type. Cash-flow semantics are universally understood.

**Alternatives Considered:**
- Separate `amount` + `direction` fields — Rejected: semantically ambiguous
- Always-positive with `is_debit` boolean — Rejected: requires mental translation

**Source:** PRD Review Response Issue #1 (unanimous across 3 reviewers)

**Implementation Notes:**
- All parsers must normalize to this convention
- Amex: positive raw = charge → negate to `signed_amount = -raw`
- Chase: positive raw = deposit → `signed_amount = raw` (direct)

---

### D2.2: Decimal Precision for Money

**Decision:** Use arbitrary-precision decimal arithmetic. Never use floating-point.

**Rationale:** `0.1 + 0.2 = 0.30000000000000004`. Over thousands of transactions, penny drift accumulates.

**Alternatives Considered:**
- Integer cents — Rejected: less readable, still need conversion
- Native float — Rejected: accumulates errors

**Source:** PRD Review Response Issue #4 (unanimous)

**Implementation Notes:**
- Python: `decimal.Decimal`
- TypeScript: `decimal.js` or similar library
- Parse from string: `Decimal(str(raw_value))`
- Quantize to 2 decimals only at output boundary

---

### D2.3: Transaction ID Generation

**Decision:** Generate deterministic `txn_id` via SHA-256 hash of `effective_date + raw_description + signed_amount + account_id`.

**Properties:**
- 16-character hex string
- Filename-independent (idempotent)
- Same transaction always produces same ID

**Rationale:** Enables deduplication and safe re-runs.

**Alternatives Considered:**
- Include source_file in hash — Rejected: breaks idempotency when files renamed
- UUID — Rejected: not deterministic

**Source:** PRD 7.5, PRD Verification Response V1

**Implementation Notes:**
```
payload = f"{effective_date}|{raw_description}|{signed_amount}|{account_id}"
txn_id = sha256(payload)[:16]
```

---

### D2.4: Collision Handling

**Decision:** Same-day duplicate transactions get deterministic suffixes: `-02`, `-03`, etc.

**Rationale:** Two $5 Starbucks charges on the same day are different transactions.

**Alternatives Considered:**
- Reject duplicates — Rejected: legitimate same-day duplicates exist
- Random suffix — Rejected: breaks determinism

**Source:** PRD 7.5

**Implementation Notes:**
- Track seen IDs in a dict during processing
- Apply suffix before adding to final list
- Process files in consistent order for reproducibility

---

### D2.5: Date Fields — Three-Field Model

**Decision:** Maintain three date fields: `txn_date`, `post_date`, `effective_date`.

| Field | Meaning |
|-------|---------|
| `txn_date` | When transaction occurred (from bank) |
| `post_date` | When transaction settled |
| `effective_date` | Date used for month bucketing |

**Source:** PRD Review Response Issue #5

---

### D2.6: Date Bucketing Rule

**Decision:** Use `txn_date` for month assignment. Fallback to `post_date` if unavailable, with review flag.

**Rationale:** Transaction date represents when user made the purchase, which is more intuitive for budgeting.

**Alternatives Considered:**
- Always use post_date — Rejected: December purchase posting in January feels wrong

**Source:** PRD Review Response Issue #5

**Implementation Notes:**
- When falling back: `review_reasons.append("date_fallback: txn_date unavailable")`

---

### D2.7: UNCATEGORIZED Sentinel

**Decision:** Use `category_id: 4999` for uncategorized. Keep `4990` as intentional "Miscellaneous".

| Code | Meaning |
|------|---------|
| 4990 | Miscellaneous — intentional categorization |
| 4999 | UNCATEGORIZED — system couldn't categorize, needs review |

**Rationale:** Visually distinct sentinel; `4999` clearly indicates a problem, not a choice.

**Alternatives Considered:**
- `category_id: None` — Rejected: breaks downstream logic (`cat_id // 1000`)

**Source:** PRD Review Response Issue #11, Spec Architect Verification B3

**Implementation Notes:**
- Never use `None` for category_id
- After review, no transactions should remain at 4999

---

### D2.8: Normalized Transaction Schema

**Decision:** Every transaction from any source becomes this structure:

```python
{
    "txn_id": "a1b2c3...",              # 16-char hex hash
    "txn_date": "2026-01-15",           # ISO format
    "post_date": "2026-01-16",
    "effective_date": "2026-01-15",
    "description": "UBER TRIP",          # Normalized (uppercase, trimmed)
    "raw_description": "UBER *TRIP HELP.UBER.COM",
    "signed_amount": Decimal("-23.45"),
    "account_id": 2122,
    "category_id": 4260,
    "raw_category": "Transportation-Taxi",
    "source_file": "amex_2122_202601.xlsx",
    "confidence": 0.95,
    "needs_review": False,
    "review_reasons": []
}
```

**Source:** PRD 7.1

---

### D2.9: Journal Entry Schema

**Decision:** Each journal entry contains balanced debit/credit lines.

```python
{
    "entry_id": 1,
    "date": "2026-01-15",
    "description": "Uber Trip",
    "lines": [
        {"account_id": 4260, "account_name": "Rideshare", "debit": Decimal("23.45"), "credit": None, "txn_id": "a1b2c3..."},
        {"account_id": 2122, "account_name": "Amex Delta", "debit": None, "credit": Decimal("23.45"), "txn_id": "a1b2c3..."}
    ]
}
```

**Source:** PRD 7.2

---

### D2.10: Rule Schema

**Decision:** Rules contain pattern, type, category, and optional metadata.

```yaml
- pattern: "UBER EATS"
  pattern_type: "substring"   # or "regex"
  category_id: 4340
  source: "manual"            # or "llm_suggestion"
  confidence: 1.0             # 0.85 for LLM-sourced
  approved_date: null
  original_description: null
  llm_reasoning: null
```

**Source:** LLM Implementation Spec 3.1

---

### D2.11: Account Structure

**Decision:** 4-digit account codes with semantic prefixes.

| Range | Type |
|-------|------|
| 1xxx | Assets (checking, investments, receivables) |
| 2xxx | Liabilities (credit cards, loans) |
| 3xxx | Income (salary, dividends, rewards) |
| 4xxx | Expenses (categorized spending) |
| 5xxx | Special (joint accounts, work) |

**Source:** PRD 12

---

### D2.12: txn_id Payload Normalization

**Decision:** Normalize payload components before hashing to ensure deterministic IDs across platforms.

| Field | Normalization |
|-------|---------------|
| `effective_date` | ISO 8601 format: `YYYY-MM-DD` |
| `raw_description` | Raw bytes (NO normalization); hash the exact input **before** any matching normalization |
| `signed_amount` | Plain decimal string (no exponent), no trailing zeros: `"-23.45"` not `"-23.450"` |
| `account_id` | Integer as string: `"2122"` |

**Payload format:**
```
"{effective_date}|{raw_description}|{signed_amount}|{account_id}"
```

**Rationale:**
- `raw_description`: Normalizing before hash would lose information; hash the source of truth
- Decimal precision: Avoid exponent form; use a stable plain-decimal formatter

**Alternatives Considered:**
- Normalize description (Unicode NFKC, trim, collapse whitespace) — Rejected: changes hash when bank format changes
- Include locale in hash — Rejected: breaks cross-machine determinism

**Source:** Codex Feedback 2026-01-31, Finding #2

---

### D2.13: File Processing Order for Deterministic Collisions

**Decision:** Process files in lexicographic (ASCII byte order) sort of filename.

**Example:**
```
amex_2120_202601.xlsx
amex_2122_202601.xlsx
boa_1110_202601.csv
chase_1120_202601.csv
```

**Rationale:** Filesystem order varies by OS and locale. Explicit sort ensures reproducible `-02`, `-03` suffixes.

**Implementation Notes:**
- Sort filenames using a stable byte-wise comparator (no locale compare)
- Within each file, process rows in original order

**Source:** Codex Feedback 2026-01-31, Finding #3

---

## 3. Parser Conventions

### D3.1: Sign Normalization Per Source

**Decision:** Each parser normalizes to signed_amount convention.

| Parser | Raw Convention | Transformation |
|--------|---------------|----------------|
| Amex | positive = charge | `signed_amount = -raw` |
| Chase Checking | positive = deposit | `signed_amount = raw` |
| BoA Checking | positive = deposit | `signed_amount = raw` |
| BoA Credit | negative = purchase | `signed_amount = raw` |
| Fidelity | negative = charge | `signed_amount = raw` |

**Source:** PRD 8.2, Phase 1 Spec

---

### D3.2: Account ID from Filename

**Decision:** Account ID is extracted from filename, not parsed from file headers.

**Rationale:** More robust than header parsing; banks change column names.

**Alternatives Considered:**
- Parse from header — Rejected: banks change formats
- Prompt user — Rejected: friction for monthly workflow

**Source:** PRD Review Response Issue #12

---

### D3.3: Filename Convention

**Decision:** `{institution}_{accountID}_{YYYYMM}.{ext}`

Examples:
- `amex_2122_202601.xlsx`
- `chase_1120_202601.csv`

**Source:** PRD 8.1

---

### D3.4: Header Validation

**Decision:** After parsing, validate expected columns exist. Raise error on unexpected format.

**Rationale:** Detect bank format changes early rather than silently producing garbage.

**Source:** PRD 8.1

**Implementation Notes:**
- Check for required columns before processing
- Provide clear error message with expected vs actual columns

---

### D3.5: Smart Header Detection (BoA Checking)

**Decision:** Scan first N rows for canonical header pattern before assuming row 0 is header.

**Rationale:** BoA Checking exports include summary rows before transaction table.

**Source:** Feedback doc `boa_checking_header_detection.md`

**Implementation Notes:**
- Look for `Date,Description,Amount` pattern
- Skip "Beginning balance" rows with empty Amount
- Handle optional 4th column (`Running Bal.`)

---

### D3.6: Parser Registry Pattern

**Decision:** Use dict mapping filename patterns to parser functions.

```python
PARSERS = {
    "amex": ("amex_*_*.xlsx", parse_amex),
    "chase_checking": ("chase_1120_*.csv", parse_chase_checking),
    ...
}
```

**Rationale:** Simple, explicit, debuggable. No OOP inheritance hierarchy needed.

**Source:** PRD 5.1

---

### D3.7: Flexible Parser Detection (Year Mode)

**Decision:** Support keyword-based detection for bulk processing with arbitrary filenames.

**Rationale:** Year-end bulk imports may have non-standard filenames.

**Source:** Phase 1 Spec, process_year.py implementation

---

### D3.8: Description Normalization

**Decision:** Normalize before pattern matching: uppercase, strip `*#`, collapse whitespace.

```python
def normalize_description(raw: str) -> str:
    desc = raw.upper()
    desc = re.sub(r'[*#]', ' ', desc)
    desc = re.sub(r'\s+', ' ', desc).strip()
    return desc
```

**Rationale:** Prevents matching failures from inconsistent formatting.

**Source:** PRD Review Response Issue #17

---

### D3.9: Date Format Handling

**Decision:** Each parser handles its source's date format.

| Source | Format |
|--------|--------|
| Chase | MM/DD/YYYY |
| BoA | MM/DD/YYYY |
| Fidelity | YYYY-MM-DD |
| Amex | Excel date serial |

**Source:** PRD 8.2

---

### D3.10: Comma Stripping in Amounts

**Decision:** Strip commas before Decimal conversion for BoA amounts.

**Example:** `"7,933.55"` → `Decimal("7933.55")`

**Source:** PRD 8.2

---

## 4. Categorization System

### D4.1: Four-Layer Hierarchy (v2.0 UPDATE)

**Decision:** Categorization priority order:

| Priority | Layer | Confidence | Source File |
|----------|-------|------------|-------------|
| 0 (highest) | user_rules | 1.0 | `user-rules.yaml` |
| 1 | shared_rules | 0.9 | `shared-rules.yaml` (bundled) |
| 2 | base_rules | 0.8 | `base-rules.yaml` |
| 3 | bank_category_map | 0.6 | Raw export field |
| 4 (lowest) | UNCATEGORIZED | 0.3 | (fallback) |

**v2.0 Change:** Added "Shared Standard" layer for bundled community patterns (AMAZON, UBER, NETFLIX, etc.). User approved 2026-01-27.

**Source:** PRD v2.0 Section 9.1, v2.0 Architecture Roadmap Section 3.1

---

### D4.2: Confidence Scores

**Decision:** Assign confidence based on match source.

| Source | Confidence |
|--------|------------|
| user_rules | 1.0 |
| shared_rules | 0.9 |
| LLM-approved rules | 0.85 |
| base_rules | 0.8 |
| LLM inference | 0.7 |
| bank_category_map | 0.6 |
| UNCATEGORIZED | 0.3 |

**Rationale:** Human-created rules should outrank LLM suggestions.

**Source:** PRD 9.1, Spec Architect Verification B5

---

### D4.3: LLM-Sourced Rule Confidence

**Decision:** LLM-suggested rules, when approved, get `confidence: 0.85` (not 1.0).

**Rationale:** Distinguishes human-created from LLM-suggested rules in priority.

**Source:** Spec Architect Verification B5

---

### D4.4: Pattern Matching Types

**Decision:** Support both substring (default) and regex patterns.

```yaml
- pattern: "UBER"
  pattern_type: "substring"  # default

- pattern: "WHOLEFDS|WHOLE FOODS"
  pattern_type: "regex"
```

**Source:** LLM Implementation Spec 3.1

---

### D4.5: Rule Ordering — Specific Before General

**Decision:** More specific patterns must appear before general patterns.

**Example:** `UBER EATS` must precede `UBER` in rules list.

**Rationale:** First match wins; generic pattern would shadow specific ones.

**Alternatives Considered:**
- Longest match wins — Rejected: adds complexity
- Weighted scoring — Rejected: over-engineering

**Source:** LLM Spec Review Consolidation, Session Log `fix-rules-reorder-uber-eats`

**Implementation Notes:**
- Document this requirement in rules file comments
- Consider adding a linter/validator

---

### D4.6: Pattern Collision Warning

**Decision:** Warn when new pattern overlaps existing rule.

**Rationale:** Prevents accidentally shadowing existing rules.

**Source:** LLM Spec Review Consolidation Theme G

---

### D4.7: Pattern Validation Thresholds

**Decision:** Reject patterns that are too broad.

**Criteria:** Pattern matches >20% of transactions AND >3 matches = too broad.

**Rationale:** Patterns like "THE" would match everything.

**Source:** Spec Architect Verification B4

**Implementation Notes:**
- Context is current run's transactions, not historical
- Log rejected patterns with reason

---

### D4.8: Minimum Pattern Length

**Decision:** Minimum 5 characters for patterns.

**Rationale:** Short patterns are likely too generic.

**Source:** LLM Implementation Spec 5.3

---

### D4.9: Pattern Validation Context

**Decision:** Validate against current run's transactions, not all historical data.

**Rationale:** Keeps validation fast and predictable.

**Source:** Spec Architect Verification B4

---

### D4.10: Regex Error Handling

**Decision:** Wrap regex matching in try/except. On error: warn and return False.

**Rationale:** Invalid regex should not crash the pipeline.

**Source:** Session Log `fix-rules-reorder-uber-eats`

**Implementation Notes:**
```python
try:
    return bool(re.search(pattern, description, re.IGNORECASE))
except re.error as e:
    logger.warning(f"Invalid regex '{pattern}': {e}")
    return False
```

---

### D4.11: Empty Regex Rejection

**Decision:** Empty patterns are rejected; they would match everything.

**Source:** Session Log, Spec Architect Verification

---

### D4.12: Round-Trip Safe YAML

**Decision:** When modifying rules files, preserve unknown fields (note, added_date, source).

**Rationale:** Don't lose user annotations when tool rewrites file.

**Source:** LLM Spec I6

**Implementation Notes:**
- Use `ruamel.yaml` (Python) or equivalent that preserves structure
- Preserve comments where possible

---

### D4.13: LLM Rules Storage Location

**Decision:** Store LLM-approved rules in `user_rules` section with `source: llm_suggestion`.

**Alternatives Considered:**
- Separate `llm_rules` section — Rejected: simpler to have one section

**Source:** LLM Spec Open Decision D1

---

### D4.14: Config Precedence

**Decision:** CLI flags > environment variables > config file > defaults.

**Source:** LLM Spec Review Consolidation I3

---

### D4.15: Normalize Before Matching

**Decision:** Always normalize both description and pattern before comparison.

**Source:** Spec Architect Verification I4

---

## 5. LLM Integration

### D5.1: Six-Layer Categorization with LLM

**Decision:** When LLM is enabled, categorization has 6 layers:

| Priority | Layer | Confidence |
|----------|-------|------------|
| 0 | user_rules | 1.0 |
| 1 | learned_rules (LLM-approved) | 0.9 |
| 2 | base_rules | 0.8 |
| 3 | bank_category_map | 0.6 |
| 4 | LLM inference | 0.7 |
| 5 | UNCATEGORIZED | 0.3 |

**Source:** LLM RFC Proposal

---

### D5.2: LLM is Optional

**Decision:** LLM integration is opt-in via `--llm` flag.

**Rationale:** Core functionality must work without LLM.

**Source:** LLM Implementation Spec 4.1

---

### D5.3: BYOT Model (Bring Your Own Token)

**Decision:** User provides their own API key. No bundled credentials.

**Rationale:** Privacy; cost transparency; user controls provider choice.

**Source:** v2.0 Architecture Roadmap

---

### D5.4: Provider Abstraction

**Decision:** Abstract LLM provider interface with implementations for Gemini, OpenAI, Ollama.

**Source:** LLM Implementation Spec 4.3

---

### D5.5: Batch Processing

**Decision:** Process uncategorized transactions in batches of 50 per LLM call.

**Rationale:** Reduces API calls and cost; efficient use of context window.

**Source:** LLM Implementation Spec 5.4

---

### D5.6: Human-in-the-Loop Approval

**Decision:** NO automatic approval of LLM suggestions. Human must explicitly approve.

**Removed:** `--batch` flag that bypassed review.

**Added:** `--export-only` for async review workflow.

**Source:** Spec Architect Verification B1

---

### D5.7: Approval Modes

**Decision:** Two approval modes:
- `--interactive` (default): Prompt for each category group
- `--export-only`: Write suggestions to file for manual review

**Source:** Spec Architect Verification B1

---

### D5.8: Category-Grouped Approval UX

**Decision:** When reviewing, group suggestions by category.

```
Category: Restaurants (4320) - 34 suggestions
  Sample: "SHAKE SHACK", "CHIPOTLE", "FIVE GUYS"
  (a)pprove all, (r)eject all, (v)iew details, (s)kip: a
```

**Rationale:** Reviewing 127 items individually is tedious.

**Source:** Spec Architect Verification I5

---

### D5.9: LLM Failure Isolation

**Decision:** LLM failures MUST NOT break core functionality.

| Failure | Behavior |
|---------|----------|
| Timeout | Retry 3x, then skip LLM layer |
| Rate limit | Wait Retry-After, retry |
| Auth error | Log error, skip LLM, continue |
| Malformed JSON | Skip batch, log warning, continue |
| Invalid category | Reject that suggestion, keep valid ones |

**Source:** LLM Implementation Spec 2.2, 6.1

---

### D5.10: Invalid Suggestion Handling

**Decision:** Reject invalid suggestions individually; keep valid ones from same batch.

**Source:** LLM Implementation Spec 6.2

---

### D5.11: Malformed JSON Handling

**Decision:** Skip entire batch on JSON parse error, log warning, continue with other batches.

**Source:** LLM Implementation Spec 6.2

---

### D5.12: V1 Scope Limitation

**Decision:** LLM integration in V1 is `process_year.py` only. `process_month.py` deferred to V2.

**Rationale:** Year mode was original use case; scope control.

**Source:** Spec Architect Verification B2

---

### D5.13: Review Schema — Append Only

**Decision:** When adding LLM columns to review.xlsx, preserve existing column names. Append new columns at end.

New columns:
- `llm_suggested_category`
- `llm_reasoning`
- `llm_confidence`
- `llm_suggested_pattern`
- `approval_status`

**Rationale:** Don't break downstream tools and tests.

**Source:** Spec Architect Verification B6

---

### D5.14: LLM Response Validation

**Decision:** Validate each suggestion before attaching:
- Category ID exists in accounts.json
- Pattern meets minimum length (5 chars)
- Pattern is not too broad (<20% match rate)
- Confidence is 0.0-1.0 (clamp if out of range)

**Source:** LLM Implementation Spec 5.3

---

## 6. Payment Matching

### D6.1: Date Tolerance

**Decision:** Match payments within ±5 days.

**Rationale:** Bank processing and statement timing can cause drift.

**Source:** PRD 10.2

---

### D6.2: Amount Tolerance

**Decision:** Match amounts within $0.01.

**Rationale:** Bank rounding, export truncation.

**Source:** PRD 10.2

---

### D6.3: Ambiguous Match Resolution

**Decision:** When multiple matches exist with same date distance, flag for human review. Don't auto-pick.

**Rationale:** Incorrect matching creates wrong journal entries.

**Source:** PRD 10.3

---

### D6.4: Partial Payment Handling

**Decision:** Partial payments are flagged for review.

**Source:** PRD 10.2

---

### D6.5: Payment Keyword Requirement

**Decision:** Require payment keyword (PAYMENT, AUTOPAY, RECV) for generic pattern matches.

**Rationale:** Prevents false positives on short patterns like "AMEX".

**Source:** Phase 2 Code Review

---

### D6.6: No-Candidate Visibility

**Decision:** Flag bank transaction if payment pattern matches but no CC candidate exists.

**Rationale:** Helps identify missing CC exports.

**Source:** Phase 2 Code Review

---

### D6.7: Matched Transactions Excluded from Analysis

**Decision:** CC payments are internal transfers, not income/expense. Exclude from category analysis.

**Rationale:** Otherwise payment would appear as both expense (bank outflow) and income (CC inflow).

**Source:** PRD 10.4

---

### D6.8: Cross-Month Unmatched State

**Decision:** Deferred to v2. V1 processes each month independently.

**Rationale:** Adds statefulness complexity.

**Source:** PRD Review Response Issue #21, Deferred

---

### D6.9: Zero-Amount Transactions

**Decision:** Skip zero-amount transactions in matching.

**Rationale:** Avoid divide-by-zero; zero-amount has no payment meaning.

**Source:** Implementation lesson

---

## 7. Accounting Logic

### D7.1: Refund Handling

**Decision:** Refunds credit the **original expense account**, not income.

**Example:** GAP refund → CR 4410 Clothing (reduce expense), NOT CR 3xxx Income.

**Rationale:** Otherwise budgets inflate (expense + refund both counted).

**Source:** PRD Review Response Issue #14

---

### D7.2: Rewards and Cashback

**Decision:** Route to income account (3250) via explicit rules, not as expense refunds.

**Patterns:** CASHBACK, REWARD, STATEMENT CREDIT → 3250

**Source:** PRD 10.4

---

### D7.3: Reimbursements

**Decision:** Treat as income, not matched to original expense.

**Rationale:** Matching reimbursements to expenses is a reporting feature, not core accounting. Deferred to v2.

**Source:** PRD Review Response Issue #8

---

### D7.4: Double-Entry Requirement

**Decision:** Every transaction produces a debit/credit pair.

**Source:** PRD 7.2

---

### D7.5: Total Validation

**Decision:** Before writing output, verify `sum(debits) == sum(credits)`. Abort if unbalanced.

**Rationale:** Essential accounting sanity check.

**Source:** PRD Review Response Issue #18

---

### D7.6: CC Payment Double-Entry

**Decision:** CC payment creates:
- DR Credit Card (reduce liability)
- CR Checking (reduce asset)

**Source:** PRD Appendix C

---

### D7.7: Internal Transfer Double-Entry

**Decision:** Transfer creates:
- DR Destination account
- CR Source account

**Source:** PRD Appendix C

---

### D7.8: Unknown Account Handling

**Decision:** Warn + flag transactions for review. Don't auto-create accounts.

**Rationale:** Unknown account_id is likely a typo.

**Source:** PRD Review Response Issue #22

---

### D7.9: txn_id Traceability

**Decision:** Every journal line links back to source transaction via txn_id.

**Rationale:** Enables audit trail.

**Source:** PRD 7.2

---

## 8. Run Safety

### D8.1: Overwrite Protection

**Decision:** Default behavior refuses to overwrite existing output. Require `--force` flag.

**Rationale:** Prevents accidental double-entry.

**Source:** PRD 11.1

---

### D8.2: Run Manifest

**Decision:** Each run writes `run_manifest.json` with deterministic structure:

```json
{
  "month": "2026-01",
  "run_timestamp": "2026-01-20T14:32:00.000Z",
  "input_files": {
    "amex_2122_202601.xlsx": "sha256:abc123...",
    "chase_1120_202601.csv": "sha256:def456..."
  },
  "transaction_count": 147,
  "txn_ids": ["a1b2c3d4e5f67890", "..."],
  "collision_map": {
    "a1b2c3d4e5f67890": 2
  },
  "version": "2.0"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `month` | string | Processing month `YYYY-MM` |
| `run_timestamp` | string | ISO 8601 UTC timestamp |
| `input_files` | object | Filename → SHA-256 hash |
| `transaction_count` | number | Total transactions processed |
| `txn_ids` | array | All transaction IDs (including suffixed) |
| `collision_map` | object | Base ID → count (only for collisions) |
| `version` | string | Manifest schema version |

**Source:** PRD 11.1, Codex Feedback 2026-01-31 Gap B

---

### D8.3: Input Archiving

**Decision:** After successful processing, move imports to archive directory.

**Path:** `imports/YYYY-MM/` → `archive/YYYY-MM/raw/`

**Rationale:** Enables re-runs from original data.

**Source:** PRD Review Response Issue #19

---

### D8.4: Error Handling Philosophy

**Decision:** Skip-and-warn, then prompt.

1. Parse all files, collecting errors
2. If any file fails, warn and ask: "Continue with partial data? [y/N]"
3. Unknown accounts: warn + flag, don't abort

**Source:** PRD Review Response Issue #22

---

### D8.5: Non-Interactive Mode

**Decision:** Require `--yes` flag to auto-continue on errors in non-interactive mode.

**Source:** Implementation lesson

---

### D8.6: Dry-Run Support

**Decision:** `--dry-run` flag parses, categorizes, matches, but writes no files.

**Rationale:** Test rule changes without modifying output.

**Source:** PRD Review Response Issue #16

---

### D8.7: Date Validation

**Decision:** Skip transactions with invalid dates, log warning count.

**Source:** Implementation lesson

---

### D8.8: Hidden File Filtering

**Decision:** Skip files starting with `.` (hidden files, temp files).

**Source:** Implementation lesson

---

## 9. Output Schemas

### D9.1: Journal Output Columns

**Decision:** journal.xlsx columns:
- entry_id
- date
- description
- account_id
- account_name
- debit
- credit
- txn_id

Footer row: `Total Debits: $X | Total Credits: $X` (must match)

**Source:** PRD 11.7

---

### D9.2: Review Output Columns

**Decision:** review.xlsx columns (existing + LLM):
- txn_id
- effective_date
- raw_description
- signed_amount
- account_name
- suggested_category
- confidence
- review_reason
- your_category_id
- llm_suggested_category (NEW)
- llm_reasoning (NEW)
- llm_confidence (NEW)
- llm_suggested_pattern (NEW)
- approval_status (NEW)

**Sort order:** Confidence ascending (least certain first).

**Source:** PRD 11.7, LLM Spec 3.5

---

### D9.3: Analysis Output Sheets

**Decision:** analysis.xlsx contains:
- By Category: category_id, name, total, count
- By Account: account_id, name, in, out, net
- Summary: Total income, expenses, savings, flagged count

**Source:** PRD 11.7

---

### D9.4: Column Preservation

**Decision:** Never rename existing columns. Append new columns at end.

**Rationale:** Breaking change for tests and downstream tools.

**Source:** Spec Architect Verification B6

---

## 10. Configuration

### D10.1: YAML for Rules

**Decision:** Use YAML (not JSON) for rules file.

**Rationale:** Human-frequently-edited; supports comments.

**Source:** PRD Review Response Issue #6

---

### D10.2: JSON for Accounts

**Decision:** Use JSON for chart of accounts.

**Rationale:** Rarely edited; structured data.

**Source:** PRD 1.4

---

### D10.3: LLM Config File

**Decision:** LLM settings in `config/llm_config.yaml`.

```yaml
provider: gemini
batch_size: 50
max_retries: 3
timeout_seconds: 30
min_pattern_length: 5
max_pattern_match_percent: 0.20
enabled: false
```

**Source:** LLM Implementation Spec 7.1

---

### D10.4: Environment Variables for API Keys

**Decision:** API keys via environment variables.

| Variable | Provider |
|----------|----------|
| GEMINI_API_KEY | Gemini |
| OPENAI_API_KEY | OpenAI |
| OLLAMA_HOST | Ollama |

**Source:** LLM Implementation Spec 4.4

---

### D10.5: Workspace Model (v2 PLANNED)

**Decision:** Configurable workspace root with derived paths.

```typescript
interface Workspace {
  root: string;
  imports: string;   // ${root}/imports/
  outputs: string;   // ${root}/outputs/
  archive: string;   // ${root}/archive/
  config: WorkspaceConfig;
}
```

**Source:** v2.0 Architecture Roadmap 2.3

---

### D10.6: Auto-Detection (v2 PLANNED)

**Decision:** CLI auto-detects workspace by searching for `config/user-rules.yaml` in current or parent directories.

**Search order:**
1. Current directory: `./config/user-rules.yaml`
2. Parent directories (up to root): `../config/user-rules.yaml`
3. Explicit `--workspace` flag overrides

**Fallback:** If no workspace found, prompt user or error.

**Rationale:** Users can run CLI from any subdirectory within workspace.

**Source:** v2.0 Architecture Roadmap 2.3

---

### D10.7: Private Repository Requirement

**Decision:** Rules and config must be stored in a private repository.

**Rationale:** Vendor names in rules can reveal sensitive information (health providers, legal services, personal patterns).

**Alternatives Considered:**
- Public repo with sanitized examples — Rejected: too easy to accidentally commit real rules

**Source:** PRD Section 13, Q5

**Implementation Notes:**
- Git-track rules for version control benefits
- Repository must remain private
- Consider `.gitignore` for any local overrides

---

### D10.8: Rule Add Workflow (v2.0)

**Decision:** CLI command to add categorization rules:

```bash
npx fineng add-rule "WARBY PARKER" 4550 --note "Vision/eyewear"
```

**Behavior:**
1. Validate pattern using D4.7/D4.8 thresholds
2. Check for collisions with existing rules (warn if overlap)
3. Append to `user-rules.yaml` with metadata:
   ```yaml
   - pattern: "WARBY PARKER"
     category_id: 4550
     note: "Vision/eyewear"
     added_date: "2026-01-27"
     source: "manual"
   ```
4. Preserve existing comments and formatting (round-trip safe)

**Alternatives Considered:**
- Edit YAML directly — Still supported; CLI is convenience
- Separate approval flow — Rejected: user rules don't need approval

**Source:** PRD v1 `add_correction.py`, Codex Feedback 2026-01-31 Gap A

---

### D10.9: Shared Rules Governance (v2.0)

**Decision:** Bundled `shared-rules.yaml` is curated by project maintainer.

| Aspect | Policy |
|--------|--------|
| **Curation** | Maintainer reviews suggestions before inclusion |
| **Submission** | Users can suggest via opt-in telemetry or GitHub issue |
| **Privacy** | Only pattern and category submitted, never descriptions or amounts |
| **Update frequency** | Bundled with each release |
| **Override** | User rules always take precedence |

**Scope of shared rules:**
- Universal patterns (AMAZON, UBER, STARBUCKS, NETFLIX)
- NOT regional or niche vendors

**Rationale:** Reduces setup friction for new users; common patterns work out of box.

**Source:** v2.0 Architecture Roadmap Section 3.3, Codex Feedback 2026-01-31 Gap C

---

## 11. Implementation Lessons

Lessons learned from actual implementation, captured in session logs.

### L11.1: BoA Smart Header Detection

**Lesson:** BoA Checking exports include summary rows before transaction table. Parser must scan for header row.

**Fix:** Scan first N rows for canonical header pattern.

**Source:** Feedback `boa_checking_header_detection.md`

---

### L11.2: Regex Crash Handling

**Lesson:** Invalid regex patterns can crash the pipeline.

**Fix:** Wrap regex matching in try/except, log warning, return False.

**Source:** Session Log `fix-rules-reorder-uber-eats`

---

### L11.3: Rule Ordering Critical

**Lesson:** `UBER EATS` must precede `UBER` in rules list.

**Fix:** Document requirement; more specific patterns first.

**Source:** Session Log `fix-rules-reorder-uber-eats`

---

### L11.4: Missing Import Bugs

**Lesson:** Forgot `from openpyxl import load_workbook` in approval CLI.

**Fix:** Always verify imports work before shipping.

**Source:** Session Log `fix-approve-add-missing-load-workbook-import`

---

### L11.5: Test Fixture Alignment

**Lesson:** Validation rule changes broke existing test fixtures.

**Fix:** Update fixtures when changing validation rules.

**Source:** Session Log `align-tests-with-new-validation-rules`

---

### L11.6: OpenAI Response Format Variation

**Lesson:** OpenAI returns different JSON structures (array vs object with array).

**Fix:** Handle both formats in response parsing.

**Source:** Phase B Fix Summary

---

### L11.7: Ollama Endpoint Difference

**Lesson:** Ollama uses `/api/chat`, not same endpoint as OpenAI.

**Fix:** Provider-specific endpoint configuration.

**Source:** Phase B Fix Summary

---

### L11.8: HTTPError None Response Guard

**Lesson:** `e.response` can be None on network errors.

**Fix:** Guard `e.response` before accessing attributes.

**Source:** Phase B Fix Summary

---

### L11.9: Retry-After Parsing

**Lesson:** Retry-After header can be numeric seconds or HTTP date.

**Fix:** Handle both formats; cap at 60s max.

**Source:** Phase B Fix Summary

---

### L11.10: Non-TTY Handling

**Lesson:** Interactive prompts break in non-TTY environments (CI, cron).

**Fix:** Check `stdin.isatty()` before prompting.

**Source:** Phase B Fix Summary

---

### L11.11: Exit Codes

**Lesson:** CLI scripts should exit non-zero on errors.

**Fix:** Explicit `sys.exit(1)` on error conditions.

**Source:** Phase B Fix Summary

---

### L11.12: InvalidFileException

**Lesson:** Opening corrupted Excel files raises `InvalidFileException`.

**Fix:** Catch `InvalidFileException`, provide clear error message.

**Source:** Phase B Fix Summary

---

### L11.13: Symlinks in Repo

**Lesson:** Absolute symlinks break on other machines.

**Context:** During development, symlinks to sample data were committed with absolute paths (e.g., `/Users/developer/data/samples`). Other developers couldn't run tests because paths didn't exist on their machines.

**Fix:** Remove symlinks from repo; use relative paths or copies.

**Source:** Phase B Fix Summary

---

## 12. Architecture Patterns

### A12.1: 10-Step Pipeline

**Decision:** Main processing follows deterministic sequence:

1. MANIFEST CHECK — Refuse overwrite without --force
2. DETECT — Identify parser from filename
3. PARSE — Extract transactions
4. DEDUP — Cross-file deduplication by txn_id
5. CATEGORIZE — Apply rule hierarchy
6. MATCH — Link CC payments
7. JOURNAL — Generate double-entry
8. VALIDATE — Verify DR = CR
9. EXPORT — Write Excel files
10. ARCHIVE — Move inputs to archive

**Source:** PRD 5.2

---

### A12.2: Parser Registry Pattern

**Decision:** Dict mapping filename patterns to parser functions.

**Rationale:** Simple, explicit, no inheritance hierarchy.

**Source:** PRD 8.1

---

### A12.3: Strategy Pattern for LLM Providers

**Decision:** Abstract base class with concrete implementations.

```python
class LLMProvider(ABC):
    @abstractmethod
    def suggest_categories(self, transactions, categories, batch_size) -> List[Dict]:
        pass
```

**Source:** LLM Implementation Spec 4.3

---

### A12.4: Manifest/Ledger Safety Pattern

**Decision:** Hash inputs, track outputs, refuse overwrite.

**Rationale:** Prevents accidental data corruption.

**Source:** PRD 11.1

---

### A12.5: Headless Core Design (v2)

**Decision:** Core package is pure functions, no I/O.

**Rationale:** Enables browser execution; I/O handled by CLI or web wrapper.

**Source:** v2.0 Architecture Roadmap 2.2

---

### A12.6: Monorepo Structure (v2)

**Decision:** Packages structure:
- `@finance-engine/core` — Pure TypeScript engine
- `@finance-engine/cli` — Node.js CLI
- `@finance-engine/web` — Browser/PWA
- `@finance-engine/shared` — Config schemas

**Source:** v2.0 Architecture Roadmap 2.1

---

### A12.7: Failure Isolation

**Decision:** LLM failures never break core pipeline. Graceful degradation.

**Source:** LLM Implementation Spec 2.2

---

### A12.8: Core/CLI Serialization Boundary (v2.0)

**Decision:** Core package (`@finance-engine/core`) is pure functions with no I/O. Serialization responsibility:

| Operation | Responsibility | Location |
|-----------|----------------|----------|
| Parse YAML rules | CLI/Web | `@finance-engine/cli` |
| Read config files | CLI/Web | `@finance-engine/cli` |
| Write updated rules | CLI/Web | `@finance-engine/cli` |
| YAML round-trip preservation | CLI/Web | Use `yaml.parseDocument()` |
| Rule mutation helpers | Core | Pure `RuleSet → RuleSet` transforms |

**Rationale:** Keeping core headless enables browser execution (no `fs` dependency).

**Source:** v2.0 Architecture Roadmap Section 2.2, Codex Feedback 2026-01-31 Finding #4

---

## 13. Deferred Decisions

Explicitly deferred to future versions.

| ID | Feature | Rationale | Target |
|----|---------|-----------|--------|
| DEF13.1 | Split transactions (1 txn → N categories) | Requires data model change | v2 |
| DEF13.2 | Interactive terminal review mode | Validate confidence system first | post-v1 |
| DEF13.3 | Cross-month unmatched transfer state | Adds statefulness complexity | v2 |
| DEF13.4 | Reimbursement-to-expense matching | Reporting feature, not core accounting | v2 |
| DEF13.5 | process_month.py LLM integration | Ship year-mode first | v2 |
| DEF13.6 | SQLite migration | Trigger: >200 rules or query needs | when pain felt |
| DEF13.7 | Plaid API integration | Trigger: manual exports unbearable | when pain felt |
| DEF13.8 | Complex CLI (Click) | Trigger: need --verbose, subcommands | when pain felt |
| DEF13.9 | Web dashboard | Trigger: visualizations beyond Excel | when pain felt |
| DEF13.10 | Multi-currency support | All accounts currently USD | future |

**Source:** PRD 14, Spec Architect Verification

---

## 14. Anti-Patterns & Rejected Approaches

Approaches explicitly considered and rejected.

| ID | Rejected Approach | Why Rejected | Proposed By |
|----|-------------------|--------------|-------------|
| R14.1 | SQLite database | Overhead for monthly use; schema migrations | PRD design |
| R14.2 | Full API class (15+ methods) | Forces abstraction understanding to debug | PRD design |
| R14.3 | Complex CLI with subcommands | Harder to remember than simple script | PRD design |
| R14.4 | Direct Excel append to master | One bug = 10 years corruption | Gemini |
| R14.5 | Auto-approve LLM suggestions | Human must explicitly approve | Review |
| R14.6 | `--batch` flag for bulk approve | Reintroduces auto-approve | Architect |
| R14.7 | `category_id: None` for uncategorized | Breaks downstream (`cat_id // 1000`) | Review |
| R14.8 | Column renames in review.xlsx | Breaks existing tests | Review |
| R14.9 | Wildcards in patterns | Substring + regex covers cases | Architect |
| R14.10 | Separate `llm_rules` section | Simpler to merge into `user_rules` | Design |
| R14.11 | Float for money | `0.1 + 0.2 = 0.30000000000000004` | Review |
| R14.12 | UUID for txn_id | Not deterministic; breaks idempotency | Design |

**Source:** Various review documents

---

## 15. Testing Decisions

### T15.1: Parser Tests Only (v1)

**Decision:** Focus testing on parsers; defer comprehensive unit tests for business logic.

**Rationale:** Parser format assumptions are highest-risk unknowns. Validate these against real bank exports before investing in full test coverage.

**Source:** PRD Review Response Q4 (Option B selected)

---

### T15.2: No Filesystem Mocking (v1)

**Decision:** Tests use real file I/O, not mocked filesystem.

**Rationale:** Simplicity; real files catch encoding issues, path handling edge cases.

**Alternatives Considered:**
- Mock filesystem with `pyfakefs` — Rejected: adds dependency and abstraction layer

**Source:** Implementation decision

---

### T15.3: Test Fixture Anonymization

**Decision:** Test fixtures must use anonymized/synthetic data, not real transactions.

**Rationale:** Privacy; real data may contain sensitive vendor names.

**Implementation Notes:**
- Use synthetic descriptions like "MERCHANT A", "STORE 123"
- Use round-number amounts
- Never commit real bank exports to repo

**Source:** PRD Section 13

---

### T15.4: Sample Files Per Parser

**Decision:** Maintain sample input files for each parser type in `tests/fixtures/`.

**Rationale:** Enables regression testing when bank formats change.

**Implementation Notes:**
- One valid sample per parser
- Include edge cases (empty file, malformed rows)
- Keep samples small (<20 rows)

**Source:** Implementation decision

---

### T15.5: Integration Test Coverage

**Decision:** End-to-end tests cover: parse → categorize → match → journal → export.

**Rationale:** Validates full pipeline; catches integration issues between modules.

**Source:** PRD Review Response Q4

---

## 16. v2.0 Overrides

Decisions that differ from v1.x, explicitly documented for clarity.

| ID | v1.x | v2.0 | Rationale |
|----|------|------|-----------|
| D4.1 | 3-layer (user/base/bank) | 4-layer (user/shared/base/bank) | Bundled community rules reduce friction |
| D10.6 | Hardcoded `.fineng.toml` | Workspace auto-detection via `config/user-rules.yaml` | CLI UX improvement |
| A12.5 | Python scripts | Headless TypeScript core | Browser execution, cross-platform |
| A12.6 | Flat directory structure | Monorepo packages (`core/cli/web`) | Separation of concerns |
| D10.8 | `add_correction.py` | `npx fineng add-rule` CLI | Cross-platform consistency |

**Purpose:** This section helps implementers understand what has changed from v1.x to v2.0 without reading the entire document.

**Source:** Codex Feedback 2026-01-31 (Suggested Alignment Actions)

---

## Appendix A: Decision Template

Use this format for adding new decisions:

```markdown
### D{section}.{number}: {Title}

**Decision:** {Concise statement of what was decided}

**Rationale:** {Why this decision was made}

**Alternatives Considered:**
- Option A: {description} — Rejected: {reason}
- Option B: {description} — Rejected: {reason}

**Source:** {Document reference(s)}

**Implementation Notes:**
- {Language-agnostic guidance}
- {Edge cases to handle}
- {Test cases to include}
```

---

## Appendix B: Source Document Index

| Document | Path | Content |
|----------|------|---------|
| PRD v1.2 | `/docs/strategy/PRD.md` | Business requirements |
| PRD Review Response | `/docs/archive/reviews/prd/Response.md` | 22-issue triage |
| PRD Verification | `/docs/archive/reviews/prd/Verification_Response.md` | 5 additional issues |
| LLM Impl Spec | `/docs/archive/rfcs/llm-categorization/llm-categorization-implementation-spec.md` | Phase A/B technical spec |
| Architect Verification | `/docs/archive/rfcs/llm-categorization/spec-architect-verification.md` | Blocking issues resolved |
| v2.0 Roadmap | `/docs/strategy/v2.0-architecture-roadmap.md` | TypeScript rewrite plan |
| Phase B Fix Summary | `/docs/archive/reviews/phase-b-fix-summary.md` | Implementation fixes |
| BoA Header Feedback | `/docs/feedback/boa_checking_header_detection.md` | Parser enhancement |
| Session Logs | `/docs/archive/logs/*.md` | Implementation lessons |

---

## Appendix C: Cross-Reference Matrix

| Decision | PRD | Review | LLM Spec | Architect | Log |
|----------|-----|--------|----------|-----------|-----|
| D2.1 Signed Amount | 7.1 | #1 | — | — | — |
| D2.2 Decimal | 7.1 | #4 | — | — | — |
| D2.3 txn_id | 7.5 | #3 | — | — | — |
| D2.7 UNCATEGORIZED | 9 | #11 | 5.2 | B3 | — |
| D4.5 Rule Ordering | — | — | — | — | fix-rules |
| D4.10 Regex Errors | — | — | — | — | fix-rules |
| D5.6 Human Approval | — | — | 4.2 | B1 | — |
| D5.9 LLM Isolation | — | — | 2.2, 6.1 | — | — |
| D7.1 Refunds | 10.3 | #14 | — | — | — |
| D8.1 Overwrite | 11.1 | #3 | — | — | — |
| L11.1 BoA Header | — | — | — | — | feedback |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-26 | Initial comprehensive consolidation from all source documents |
| 1.1 | 2026-01-27 | Added Section 15 (Testing), Appendix D (TypeScript), D10.7 (Private Repo); fixed typos per Antigravity review |
| 1.2 | 2026-01-31 | Codex review integration: D4.1 updated to 4-layer model, D2.12-D2.13 txn_id normalization and collision ordering, A12.8 Core/CLI boundary, D8.2 manifest schema, D10.8-D10.9 rule workflow and governance, Section 16 v2.0 overrides |

---

## Appendix D: TypeScript Migration Notes

Consolidated guidance for implementing these decisions in TypeScript v2.0.

### D.1: Decimal Handling

**Python:** `decimal.Decimal`
**TypeScript:** Use `decimal.js` or `big.js`

```typescript
import Decimal from 'decimal.js';
const amount = new Decimal('123.45');
const total = amount.plus('10.00');
```

**Notes:**
- Never use native `number` for money
- Parse from string to avoid float conversion
- Quantize at output boundary: `amount.toFixed(2)`

---

### D.2: YAML Handling

**Python:** `ruamel.yaml` (round-trip safe)
**TypeScript:** Use `yaml` package with `parseDocument()` for round-trip

```typescript
import { parseDocument, stringify } from 'yaml';
const doc = parseDocument(yamlString);
// Modify doc.contents
const output = stringify(doc);
```

**Notes:**
- Preserves comments and formatting
- Don't use `parse()`/`JSON.stringify()` — loses comments

---

### D.3: Date Handling

**Python:** `datetime.date`, `dateutil.parser`
**TypeScript:** Use `date-fns` or native `Date` with care

```typescript
import { parse, format, isValid } from 'date-fns';
const date = parse('01/15/2026', 'MM/dd/yyyy', new Date());
const iso = format(date, 'yyyy-MM-dd');
```

**Notes:**
- Always store as ISO string (`YYYY-MM-DD`)
- Validate dates before use: `isValid(date)`
- Be aware of timezone issues with `new Date()`

---

### D.4: Excel Reading/Writing

**Python:** `openpyxl`, `pandas`
**TypeScript:** Use `xlsx` (SheetJS) or `exceljs`

```typescript
import * as XLSX from 'xlsx';
const workbook = XLSX.readFile('file.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);
```

**Notes:**
- `xlsx` is smaller, read-focused
- `exceljs` has better write formatting support
- For browser: use `xlsx` with proper bundling

---

### D.5: Type Validation

**Python:** `TypedDict`, runtime duck typing
**TypeScript:** Use `zod` for runtime validation

```typescript
import { z } from 'zod';

const TransactionSchema = z.object({
  txn_id: z.string().length(16),
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  signed_amount: z.string(), // Decimal as string
  account_id: z.number().int().min(1000).max(9999),
});

type Transaction = z.infer<typeof TransactionSchema>;
```

**Notes:**
- Define schemas once, infer types
- Validate at I/O boundaries (file read, API response)
- Use `.safeParse()` for error handling

---

### D.6: Hashing

**Python:** `hashlib.sha256`
**TypeScript:** Use `crypto` (Node) or `crypto-js` (browser)

```typescript
// Node.js
import { createHash } from 'crypto';
const hash = createHash('sha256')
  .update(payload)
  .digest('hex')
  .slice(0, 16);

// Browser
import { SHA256 } from 'crypto-js';
const hash = SHA256(payload).toString().slice(0, 16);
```

---

### D.7: File System

**Python:** `pathlib.Path`, `os.path`
**TypeScript (Node):** Use `node:fs/promises` and `node:path`

```typescript
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const content = await readFile(filepath, 'utf-8');
```

**Notes:**
- Core package should be headless (no fs imports)
- CLI wrapper handles all I/O
- Web version uses File API / IndexedDB

---

### D.8: Regex

**Python:** `re.search()`, `re.IGNORECASE`
**TypeScript:** Native RegExp with `i` flag

```typescript
const pattern = new RegExp(rule.pattern, 'i');
const matches = pattern.test(description);
```

**Notes:**
- Wrap in try/catch for invalid patterns
- Use `i` flag for case-insensitivity

---

### D.9: Configuration

**Python:** `os.environ`, `argparse`
**TypeScript:** Use `dotenv` + custom config loader

```typescript
import 'dotenv/config';
const apiKey = process.env.GEMINI_API_KEY;
```

**Notes:**
- CLI flags > env vars > config file > defaults
- Use `zod` to validate config shape

---

*This document is the authoritative reference for decisions that must be preserved in the TypeScript rewrite. Any deviation should be explicitly discussed and documented.*
