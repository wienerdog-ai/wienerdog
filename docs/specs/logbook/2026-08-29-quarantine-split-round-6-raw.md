---
title: Round 6 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-30
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 6 raw — external adversarial review, relayed verbatim

Backend: a fresh gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`; focus text: Part A (verify the
two round-5 fixes) + Part B (final closure sweep), scope boundary carrying all
ten owner rulings. Reviewed tip: `d753276`. Committed before adjudication per
`docs/runbooks/codex-review.md`. Read-only verified (git status --porcelain
byte-identical before/after, both empty; asserted inside the payload).

---

```json
{
  "verdict": "needs-attention",
  "target": "quarantine-surface spec set, round 6, at d753276",
  "summary": "No-ship: the two targeted sites were repaired, but the explicit eight-file sweep still finds several unqualified claims that every dream-report count carries a warnings-file pointer. That contradicts the canonical capacity-only contract. No other material product-contract issue was found.",
  "part_a": [
    {
      "finding": 1,
      "verdict": "not-genuinely-fixed",
      "evidence": "ADR Amendment 2 correctly makes the render guarantee unconditional at lines 299-302, recasts brain authorship as a told-not-permission rule at lines 287-294, qualifies commit integrity on G8 at lines 302-306, and scopes the governing principle at lines 271-278; however, ADR lines 426-429 still say every implementation package \"counts and points at it,\" with the same flat claim mirrored in WP-quarantine-warnings-file lines 66-74, WP-doctor-quarantine-counts lines 40-43, and WP-quarantine-banner-decay lines 47-52."
    },
    {
      "finding": 2,
      "verdict": "fixed",
      "evidence": "WP-dream-report-run-skips Table A line 198 is the single canonical condition: the pointer renders iff newlyQuarantined or stillQuarantined is non-zero; the body, partial case, worked example, checklist, acceptance criterion, and gate defer to or assert that row, and the executed old-shape probe exited 1 because a capacity-only section emitted the pointer."
    }
  ],
  "findings": [
    {
      "title": "The whole-set sweep still contains a flat pointer contract that contradicts the capacity-only case",
      "body": "The ADR's implementation summary says each package \"counts and points at\" reports/warnings.md. That is false for the dream report when capacityDeferred is the only non-zero count: the canonical Table A contract requires a heading and capacity bullet with no pointer because the warnings file has no ledger record for those sessions. Equivalent unqualified statements remain in the warnings-file, doctor, and banner specs. An implementer or later architect following these higher-level summaries can restore the exact misleading capacity-only pointer that the round-5 fix removed, sending the user to a file that cannot enumerate any event reported by that section.",
      "affected_file": "docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md",
      "line_start": 426,
      "line_end": 429,
      "confidence": 0.99,
      "recommendation": "Qualify this summary and the remaining mirrors at WP-quarantine-warnings-file lines 66-74, WP-doctor-quarantine-counts lines 40-43, and WP-quarantine-banner-decay lines 47-52: pointers accompany quarantine counts only, while a capacity-deferred-only dream-report section has no pointer. Have each mirror defer explicitly to WP-dream-report-run-skips Table A for the condition."
    }
  ],
  "scope_objections": "none",
  "executed_vs_read": {
    "executed": [
      "git status --porcelain at the start and end",
      "git rev-parse to verify tip d753276",
      "rg and Python-based sweeps across all eight reviewed files for pointer, brain-authorship, render-integrity, and commit-integrity claims",
      "git log, git show, and git diff to inspect the round-5 fix commits and their exact changes",
      "A synthetic Node probe of the old heading-coupled pointer shape; it produced \"EXPECTED RED\" and exited 1 as expected"
    ],
    "read_only": [
      "ADR-0023 Amendment 2 and its governing-principle paragraph; the four quarantine specs in full; only the requested reopened sites of the two promote specs; docs/GLOSSARY.md; context source files (ledger.js, scratch.js, vault-write.js, dream.js, doctor.js, relevant portions of validate.js and digest.js); relevant tests located by search, not executed (the deliverables are unimplemented at this tip)"
    ]
  },
  "git_status_porcelain": { "before": "", "after": "", "byte_identical": true }
}
```
