---
id: review_codex_feedback_2026_01_31
reviewer: Codex (GPT-5)
date: 2026-01-31
scope:
  - Ontos_Context_Map.md
  - finance-engine-2.0/docs/institutional-knowledge.md
  - docs/strategy/PRD.md
  - finance-engine-2.0/docs/finance-engine-2.0-PRD.md
  - finance-engine-2.0/docs/v2.0-architecture-roadmap.md
---

# Review Feedback — Codex (GPT-5)

**Author:** Codex (GPT-5)
**Filename:** review_codex_feedback_2026-01-31.md

## Goal
Verify that `finance-engine-2.0/docs/institutional-knowledge.md` captures the essence of the PRD (v1), PRD v2, and v2 Architecture Roadmap, and flag gaps/contradictions that will affect the TypeScript rewrite.

## Summary (High-Level)
Institutional Knowledge (IK) is strong and covers most v1 decisions, but there are material contradictions and under-specified invariants that will create implementation drift in v2. The largest issue is the rules hierarchy (3-layer vs 4-layer) and the lack of normalization/order specs for deterministic txn_id generation. Several v2 architecture decisions are missing or ambiguously represented in IK.

## Findings (Ordered by Impact)

### 1) Rules Hierarchy Contradiction (3-layer vs 4-layer)
**Where:**
- IK Section 4 (Categorization System) states a 3-layer model (user/base/bank + uncategorized).
- v2 Architecture Roadmap Section 3 defines a 4-layer model (user/shared/base/bank).
- PRD v2 oscillates between 3-layer and 4-layer references.

**Why this matters:**
This is a core product behavior affecting rule priority, confidence scoring, and file structure (shared rules). If unresolved, CLI/web behavior will diverge from spec and tests won’t be aligned.

**Suggestion:**
- Decide definitively whether v2 is 3-layer or 4-layer. If 4-layer is the v2 target, update IK to make it authoritative and mark the change as a v2 override from v1.
- Align PRD v2 and the Roadmap to match IK’s decision verbatim.

---

### 2) Deterministic txn_id Normalization is Under-Specified
**Where:**
- IK defines payload fields but does not specify canonical normalization of description, amounts, or date strings.

**Why this matters:**
If normalization rules differ across Node/web/OS, txn_id will not be stable, breaking deduplication and manifest safety. This is a critical invariant.

**Suggestion:**
Add an explicit normalization spec to IK:
- Normalize `raw_description` for hashing: trim, collapse whitespace, Unicode NFKC, remove common separators (or explicitly do NOT normalize and hash raw bytes).
- Define amount formatting: use Decimal string with fixed scale or full precision; specify exact formatting.
- Specify date format as ISO `YYYY-MM-DD` only.

---

### 3) Collision Handling Depends on Deterministic Ordering (Undefined)
**Where:**
- IK says apply suffixes for duplicates and “process files in consistent order” but does not define the ordering rule.

**Why this matters:**
Different filesystem ordering or locale sorting will produce different suffixes and break deterministic re-runs.

**Suggestion:**
Define ordering in IK, e.g., lexicographic filename sort using ASCII/byte order; stable parser order; explicit tiebreakers.

---

### 4) Headless Core vs YAML Round-Trip Ambiguity
**Where:**
- IK Appendix D recommends `yaml` parseDocument for round-trip preservation.
- v2 roadmap says core is “headless” and should have no I/O or side effects.

**Why this matters:**
Round-trip YAML edits imply string serialization, which may be core responsibility or not. Unclear boundaries will cause architecture drift.

**Suggestion:**
Clarify in IK whether YAML edit functions live in:
- Core (pure string-in/string-out helpers), or
- CLI/Web layer only (core never serializes).

---

### 5) PRD v2 Contains Python-centric References Not Aligned with v2 Scope
**Where:**
- PRD v2 still references `process_month.py` in the data flow diagram.

**Why this matters:**
This contradicts the TypeScript rewrite intent and misleads implementers. IK doesn’t flag this mismatch.

**Suggestion:**
Update PRD v2 data flow to reference `@finance-engine/cli` (or `npx fineng process`) and remove Python script references.

---

## Coverage Gaps (Important but Secondary)

### A) Rule Add Workflow is Missing in IK
**Where:**
- PRD v1 defines `add_correction.py` behavior; v2 will need an equivalent CLI flow.

**Why this matters:**
This impacts UX, YAML round-trip handling, and shared rules governance. IK should capture the workflow.

**Suggestion:**
Add an IK decision that defines how rules are added in v2 (CLI command, file mutation rules, comment preservation).

---

### B) Manifest Schema Not Captured in IK
**Where:**
- PRD v1 includes manifest schema; IK mentions run safety but not the schema.

**Why this matters:**
Manifest is a critical safety feature. If IK is authoritative, it should contain the schema (or explicitly defer to PRD v2).

**Suggestion:**
Add a concise manifest schema to IK (fields, required keys, hash format).

---

### C) Shared Rules Governance Missing from IK
**Where:**
- Roadmap defines shared rules and suggestion pipeline; IK focuses on personal rules.

**Why this matters:**
Shared rules affect rule precedence, privacy, and update channels. If v2 intends shared rules, IK should cover the decision and constraints.

**Suggestion:**
Add a decision section about shared rules governance (curation policy, opt-in, privacy constraints, update cadence).

---

### D) Workspace Auto-Detection Policy Missing from IK
**Where:**
- Roadmap defines `.fineng.toml` or workspace auto-detect.

**Why this matters:**
This affects CLI UX and integration tests.

**Suggestion:**
Add a workspace detection rule to IK or explicitly mark as Roadmap-only until adopted.

---

## Suggested Alignment Actions (Concrete)

1) **IK authoritative update:** Add a short “v2 overrides” section capturing differences from v1 (4-layer rules, headless core boundary, shared rules).
2) **Normalization spec:** Add a decision entry for hash payload normalization and collision ordering.
3) **PRD v2 cleanup:** Remove `process_month.py` references; mirror v2 command names and package structure.
4) **Roadmap alignment:** Ensure roadmap and PRD v2 reference the same rule hierarchy and workspace detection.

## Files Reviewed
- `Ontos_Context_Map.md`
- `finance-engine-2.0/docs/institutional-knowledge.md`
- `docs/strategy/PRD.md`
- `finance-engine-2.0/docs/finance-engine-2.0-PRD.md`
- `finance-engine-2.0/docs/v2.0-architecture-roadmap.md`

