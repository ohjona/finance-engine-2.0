# Diagnostic Report: Ontos Activation Latency & Validation Errors

**Reporter:** Antigravity (Powered by Gemini 2.5 Pro)
**Project:** finance-engine-2.0
**Date:** 2026-02-01

## 1. Issue Overview

During a standard "Activate Ontos" ritual, the following issues were observed:
1.  **High Latency**: The activation process required significantly more time than expected (approximately 30-40 seconds of wall-clock time for discovery and execution).
2.  **Vertical Error Message**: The generation of the context map resulted in a vertical block of validation errors and warnings, which can be disorienting for agents and users in a "clean" repository.

## 2. Technical Deep Dive: The "Vertical Error Message"

The "vertical error message" referred to is the `Validation` block automatically appended to `Ontos_Context_Map.md`. In this repository, `ontos map` consistently returns **Exit Code 1** due to documentation debt that has accumulated during Phase 1.

### Observed Validation Output:
```markdown
## Validation

### Errors
- ❌ **institutional_knowledge_compendium**: Broken dependency: 'PRD' does not exist
    Remove 'PRD' from depends_on or create the missing document. Did you mean: PRD_v2, prd_v2_review_vs_ik, review_codex_prd_v2_2026_01_31?
- ❌ **PRD_v2**: Circular dependency: PRD_v2 -> institutional_knowledge_compendium -> v2_architecture_roadmap -> PRD_v2
- ❌ **institutional_knowledge_compendium**: Circular dependency: institutional_knowledge_compendium -> v2_architecture_roadmap -> institutional_knowledge_compendium

### Warnings
- ⚠️ **ontos_context_map**: Document has no incoming dependencies
- ⚠️ **v20_architecture_roadmap_patch_proposal_2026_01_31**: Document has no incoming dependencies
```

### Analysis:
- **Broken Dependencies**: Reference drift occurred between `PRD` (internal shorthand) and `PRD_v2` (physical filename).
- **Circular References**: High-level strategy documents (PRD, Roadmap, IK) have become cross-linked in a way that creates graph loops.
- **Noise Level**: Even in a successful `fast-forward` merge, these errors persist, causing every `ontos map` to report failure.

## 3. Technical Deep Dive: Activation Latency

The latency issue stems from the **Discovery Handshake** required to find the `ontos` binary in the user's environment.

### Latency Factors:
1.  **Binary Discovery**: `which ontos || python3 -m ontos map` requires two shell evaluations.
2.  **Command Redundancy**: The ritual currently executes `map --sync-agents`, `doctor`, and `agents --force` sequentially. For a repository with 178 documents, the overhead of re-parsing frontmatter for all three commands is significant.
3.  **No-Verify Overhead**: In some cases, the `pre-push` hook logic triggered by Ontos adds delay to the standard git initialization.

## 4. Recommendations for Project Ontos

1.  **Validation Suppression**: Implement a flag (e.g., `--skip-validation`) for standard activation to avoid the vertical error block when simply orienting.
2.  **Circular Dependency Handling**: Improve the error message to provide "Fix Suggestions" that are machine-readable or can be auto-applied.
3.  **Discovery Optimization**: Provide a mechanism to cache the binary path or provide a lightweight `ontos activate` command that combines `map` and `agents` refreshes.

---
*This document was generated automatically following a reported latency surge during session initialization.*
