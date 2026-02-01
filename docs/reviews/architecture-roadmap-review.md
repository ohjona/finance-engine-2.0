---
id: architecture_roadmap_review
type: review
status: complete
date: 2026-01-27
reviewer: Claude Opus 4.5
reviewed_document: v2.0-architecture-roadmap.md
reference_documents:
  - finance-engine-2.0-PRD.md
  - institutional-knowledge.md
---

# Architecture Roadmap v2.0 Review: Analysis Against PRD and Institutional Knowledge

**Reviewed:** `finance-engine-2.0/docs/v2.0-architecture-roadmap.md`
**Reference:** `finance-engine-2.0/docs/finance-engine-2.0-PRD.md` (PRD v2.0), `institutional-knowledge.md` (IK)
**Date:** January 27, 2026
**Reviewer:** Claude Opus 4.5

---

## Executive Summary

The Architecture Roadmap v2.0 provides solid strategic direction for the TypeScript rewrite. Cross-referencing against the PRD and Institutional Knowledge Compendium reveals **3 critical issues**, **5 major gaps**, **4 medium issues**, and **2 minor issues**.

Two architectural decisions were escalated and resolved:
1. **4-layer rules model** - Roadmap is authoritative; PRD needs update
2. **Config format** - PRD (YAML/JSON) is authoritative; Roadmap needs update

**Verdict:** Roadmap needs targeted fixes, but overall direction is sound.

---

## User Decisions (Resolved)

| Decision | Choice | Action Required |
|----------|--------|-----------------|
| Rules Hierarchy | **4-layer (Roadmap)** | Update PRD Section 9.1 to add "Shared Standard" layer |
| Config Format | **YAML/JSON (PRD)** | Remove `.fineng.toml` from Roadmap Section 2.3 |

---

## Critical Issues

### C1: Rules Hierarchy — RESOLVED

**Issue:** Roadmap introduces a 4-layer model not in the PRD.

| Document | Model | Confidence Levels |
|----------|-------|-------------------|
| **Roadmap 3.1** | 4-layer | User (1.0) → Shared (0.9) → Base (0.8) → Bank (0.6) |
| **PRD 9.1** | 3-layer | User (1.0) → Base (0.8) → Bank (0.6) |

**Resolution:** User approved 4-layer model. Roadmap is authoritative.

**Follow-up Action:** Update PRD Section 9.1 to add "Shared Standard" layer at confidence 0.9.

---

### C2: PRD Version Reference Error

**Issue:** Roadmap Section 1.2 references "PRD v1.2" as source of truth.

**Current text:**
> The PRD v1.2 remains the **source of truth** for business logic

**Problem:** PRD is now at **v2.0**.

**Recommendation:** Update to:
> The PRD v2.0 remains the **source of truth** for business logic

---

### C3: Workspace Configuration Format — RESOLVED

**Issue:** Roadmap Section 2.3 introduces `.fineng.toml` for configuration.

| Document | Approach |
|----------|----------|
| **Roadmap 2.3** | `.fineng.toml` in workspace root |
| **PRD 6.1** | `workspace/config/accounts.json` + `rules.yaml` |

**Resolution:** User approved YAML/JSON. PRD is authoritative.

**Follow-up Action:** Remove `.fineng.toml` reference from Roadmap Section 2.3. Update to:
> CLI auto-detects workspace by looking for `config/rules.yaml` in current or parent directories.

---

## Major Gaps

### M1: Missing LLM Integration Details

**Issue:** Section 6 is missing critical decisions from IK Section 5.

| IK Decision | Topic | Roadmap Status |
|-------------|-------|----------------|
| D5.6 | Human-in-the-loop approval (NO auto-approve) | Missing |
| D5.5 | Batch processing (50 txns per LLM call) | Missing |
| D5.7 | Approval modes (`--interactive`, `--export-only`) | Missing |
| D5.9 | LLM failure isolation (retry, fallback rules) | Partial |
| D5.12 | V1 scope limitation | Missing |
| D5.13 | Review schema append-only | Missing |
| D5.14 | LLM response validation rules | Missing |

**Recommendation:** Add Section 6.4 "LLM Workflow" covering:
1. Human-in-the-loop requirement (NO auto-approval)
2. Approval modes (`--interactive`, `--export-only`)
3. Batch processing (50 txns per call)
4. Failure isolation rules
5. Reference to IK Section 5 for full details

---

### M2: Missing Pattern Matching Details

**Issue:** Section 3 doesn't document pattern matching from IK Section 4.

| IK Decision | Topic | Status |
|-------------|-------|--------|
| D4.4 | `pattern_type: "substring" \| "regex"` | Missing |
| D4.5 | Rule ordering (UBER EATS before UBER) | Missing |
| D4.10 | Regex error handling (try/catch) | Missing |
| D4.7 | Pattern validation thresholds | Missing |
| D4.8 | Minimum pattern length (5 chars) | Missing |

**Recommendation:** Add Section 3.4 "Pattern Matching":
```typescript
interface Rule {
  pattern: string;
  pattern_type?: 'substring' | 'regex';  // Default: substring
  category_id: number;
  note?: string;
}
```

Note: Rules are checked in order. More specific patterns (e.g., "UBER EATS") must appear before general patterns (e.g., "UBER").

---

### M3: Incomplete Confidence Levels

**Issue:** Section 3.1 confidence table is missing LLM-related levels.

| Source | Roadmap | IK D4.2 |
|--------|---------|---------|
| User rules | 1.0 | 1.0 |
| Shared rules | 0.9 | (new) |
| **LLM-approved rules** | Missing | **0.85** |
| Base rules | 0.8 | 0.8 |
| **LLM inference** | Missing | **0.7** |
| Bank category | 0.6 | 0.6 |
| **UNCATEGORIZED** | Missing | **0.3** |

**Recommendation:** Update Section 3.1 table to include:
- LLM-approved rules: 0.85
- LLM inference: 0.7
- UNCATEGORIZED: 0.3

---

### M4: Missing CLI Flags

**Issue:** Section 4.1 shows CLI usage but doesn't document flags.

**PRD Section 11.6 documents:**

| Flag | Behavior |
|------|----------|
| `--dry-run` | Parse, categorize, match — print summary, write no files |
| `--force` | Overwrite existing output for this month |
| `--yes` | Auto-continue on errors (non-interactive/CI mode) |
| `--llm` | Enable LLM-assisted categorization |

**Recommendation:** Add Section 4.4 "CLI Flags" with the above table.

---

### M5: Missing Error Handling Philosophy

**Issue:** Roadmap doesn't document error handling approach.

**PRD Section 11.3 philosophy:** "Skip and warn, then prompt"

**IK Section 8 decisions:**
- D8.1: Skip-and-warn, collect errors, prompt to continue
- D8.5: `--yes` for auto-continue in CI
- D8.7: Skip invalid dates, log count at end
- D8.8: Skip hidden files (`.DS_Store`, etc.)

**Recommendation:** Add to Section 7 "Error Handling":
> **Philosophy:** Skip and warn. Collect all errors, then prompt user to continue or abort. Use `--yes` flag for non-interactive mode.

---

## Medium Issues

### m1: Privacy/Telemetry Alignment

**Issue:** Section 5.1 mentions "Optional telemetry endpoint" which could be misread.

**PRD Section 1.5:** "No telemetry unless explicitly opted in."

**IK D10.7:** Private repository requirement (vendor names reveal shopping habits).

**Recommendation:** Strengthen Section 5.2 language:
- Telemetry is **off by default**
- User must explicitly opt in
- Add note: "Rules repository must be private (vendor names reveal sensitive info)"

---

### m2: Missing Implementation Lessons Reference

**Issue:** Roadmap doesn't reference IK Section 11 (13 implementation lessons).

**Key lessons:**
- L11.3: UBER EATS shadowed by UBER
- L11.6: OpenAI returns array vs object
- L11.7: Ollama uses `/api/chat` endpoint
- L11.10: Interactive prompts break in CI

**Recommendation:** Add to Section 10:
> **Implementation Notes:** See [Institutional Knowledge Compendium, Section 11](institutional-knowledge.md#11-implementation-lessons) for lessons learned from v1.x development.

---

### m3: Missing Run Safety Details

**Issue:** Section 1.2 mentions run safety briefly but lacks detail.

**PRD Section 11.1 documents:**
- txn_id: 16-char SHA-256 hash of `effective_date|raw_description|signed_amount|account_id`
- Run manifest with input file hashes
- Overwrite protection (refuse without `--force`)

**Recommendation:** Add Section 7.2 "Run Safety" or reference PRD Section 11.1.

---

### m4: Missing 4999 UNCATEGORIZED

**Issue:** Roadmap doesn't document the sentinel value distinction.

**IK D2.7:**

| Code | Meaning |
|------|---------|
| 4990 | Miscellaneous — intentional categorization |
| 4999 | UNCATEGORIZED — system couldn't categorize, needs review |

**Recommendation:** Add note in Section 3: "4999 UNCATEGORIZED is a sentinel indicating categorization failure. After review, no transactions should remain at 4999."

---

## Minor Issues

### n1: Missing Smart Header Detection

**Issue:** BoA Checking's smart header detection (IK D3.5) not mentioned.

**Recommendation:** If expanding parser documentation, note: "BoA Checking requires dynamic header detection (scan first N rows for 'Date,Description,Amount' pattern)."

---

### n2: Outdated Document History

**Issue:** Document history shows only "2.0-draft" from 2026-01-26.

**Recommendation:** Update to reflect review completion and PRD v2.0 alignment.

---

## Summary Matrix

| ID | Issue | Severity | Status | Action |
|----|-------|----------|--------|--------|
| C1 | Rules hierarchy 4-layer | Critical | Resolved | Roadmap authoritative; update PRD |
| C2 | PRD version reference | Critical | Open | Fix: v1.2 → v2.0 |
| C3 | Config format (.toml) | Critical | Resolved | PRD authoritative; update Roadmap |
| M1 | Missing LLM details | Major | Open | Add Section 6.4 |
| M2 | Missing pattern_type | Major | Open | Add Section 3.4 |
| M3 | Missing confidence levels | Major | Open | Update Section 3.1 |
| M4 | Missing CLI flags | Major | Open | Add Section 4.4 |
| M5 | Missing error handling | Major | Open | Add to Section 7 |
| m1 | Privacy alignment | Medium | Open | Strengthen language |
| m2 | Missing lessons ref | Medium | Open | Add reference |
| m3 | Missing run safety | Medium | Open | Add Section 7.2 |
| m4 | Missing 4999 | Medium | Open | Add note |
| n1 | Smart header detection | Minor | Open | Optional note |
| n2 | Document history | Minor | Open | Update |

---

## Follow-up Actions

### Immediate (Roadmap fixes)

1. **C2:** Update Section 1.2 PRD reference from v1.2 to v2.0
2. **C3:** Remove `.fineng.toml` from Section 2.3

### Short-term (PRD update)

3. **C1:** Update PRD Section 9.1 to add "Shared Standard" layer at confidence 0.9

### Recommended Enhancements (Roadmap)

4. Add Section 3.4 "Pattern Matching" with `pattern_type` documentation
5. Add Section 4.4 "CLI Flags"
6. Add Section 6.4 "LLM Workflow"
7. Update Section 3.1 confidence table (add 0.85, 0.7, 0.3)
8. Add error handling philosophy to Section 7
9. Add implementation lessons reference to Section 10

---

## Conclusion

The Architecture Roadmap v2.0 provides solid strategic direction. The two critical architectural decisions have been resolved:

1. **4-layer rules model approved** — Enables bundled "Shared Standard" rules for common vendors
2. **YAML/JSON config retained** — Maintains PRD's rationale for human-readable, comment-supporting config

The remaining issues are documentation gaps that should be addressed to ensure alignment between the Roadmap, PRD, and Institutional Knowledge before implementation begins.

**Recommended next step:** Apply the immediate fixes (C2, C3) and short-term PRD update (C1), then proceed with implementation.

---

*This review was conducted by comparing the Architecture Roadmap against the PRD v2.0 and Institutional Knowledge Compendium to ensure strategic alignment before TypeScript implementation.*
