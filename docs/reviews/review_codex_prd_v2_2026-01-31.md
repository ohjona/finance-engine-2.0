---
id: review_codex_prd_v2_2026_01_31
reviewer: Codex (GPT-5)
date: 2026-01-31
scope:
  - finance-engine-2.0/docs/finance-engine-2.0-PRD.md
  - finance-engine-2.0/docs/institutional-knowledge.md
---

# PRD v2 Review — Codex (GPT-5)

**Author:** Codex (GPT-5)
**Filename:** review_codex_prd_v2_2026-01-31.md

## Goal
Ensure `finance-engine-2.0/docs/finance-engine-2.0-PRD.md` aligns with Institutional Knowledge (IK v1.2) and flag any critical flaws.

## Critical Alignment Issues

### 1) 3-layer vs 4-layer mismatch
**Where:**
- PRD Section 1.3: “3‑Layer Categorization”
- PRD Section 5.1: categorizer labeled “3-layer”

**IK baseline:** D4.1 is now 4-layer (user/shared/base/bank) with shared rules.

**Why it matters:**
This changes precedence, file layout, confidence scores, and default behavior. It is a core product decision.

**Fix:**
Update all PRD references to “4-layer,” and ensure shared rules are included in the categorization description.

---

### 2) Outdated `rules.yaml` references
**Where:**
- PRD Section 5.1 workspace config uses `rules.yaml`
- PRD Section 5.2 data flow step 5 mentions “rules.yaml lookup”

**IK baseline:** Rules are split across `user-rules.yaml`, `shared-rules.yaml`, `base-rules.yaml`.

**Why it matters:**
This will confuse implementation and break the CLI’s file expectations.

**Fix:**
Replace with the split rules files and describe the hierarchy explicitly.

---

### 3) Monetary precision wording still Python‑centric
**Where:**
- PRD Section 7.1: “decimal.Decimal — never float”

**IK baseline:** TypeScript uses `decimal.js`.

**Fix:**
Replace with `decimal.js` (or cross‑reference IK Appendix D).

---

### 4) Shared rules placement ambiguity
**Where:**
- PRD Section 6.1 shows `shared-rules.yaml` inside workspace.

**IK baseline:** Shared rules are bundled and curated; user rules live in workspace.

**Why it matters:**
If shared rules are bundled, the workspace layout should clarify whether the file is copied, overridden, or read‑only.

**Fix:**
Clarify whether `shared-rules.yaml` is bundled (read‑only) or duplicated into workspace on install.

---

## Important Consistency Fixes (Non‑Blocking)

- **Data flow step 5** should say “apply rule hierarchy (user/shared/base + bank category fallback)” instead of “rules.yaml lookup.”
- **Future expansion trigger** in 14.1 refers to `rules.yaml`; update to the combined rules file(s).
- **txn_id normalization**: PRD should reference IK D2.12 to clarify raw_description pre‑normalization and plain decimal formatting for hashing.
- **Manifest version field**: Ensure PRD’s `version: "2.0"` matches IK D8.2 if defined; otherwise move to IK or remove here.

## Assessment
The PRD update is close, but it still contains a few core mismatches with IK. Fix the 4‑layer model and rules file naming first; the rest are straightforward consistency edits.

