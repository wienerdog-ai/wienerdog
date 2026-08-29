---
title: Round 2 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 2 raw — external adversarial review, relayed verbatim

Backend: a fresh gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`; focus text: Part A (verify the
four round-1 findings are genuinely fixed) + Part B (attack the revision-2
mechanisms and assess the Table E residual). Reviewed tip: `4d423ca`.
Committed before adjudication per `docs/runbooks/codex-review.md`. Read-only
verified (git status --porcelain byte-identical before/after, both empty;
asserted inside the payload).

---

```json
{
  "verdict": "needs-attention",
  "summary": "No ship. The selection-pass skip count and the provisional-spec mechanism are sound, and the write-if-absent pairing is at-most-once. However, the warnings rewrite criteria contradict the rendered-content trigger, the warnings writer does not return the bytes G8 must commit, two refresh paths can remain uncommitted indefinitely under the new pipeline, and Table E contradicts G8's expanded commit set.",
  "part_a": [
    {
      "finding": 1,
      "verdict": "FIXED",
      "evidence": "The snapshot now separates membership keys from the byte-exact output of renderConditions; membership alone drives the Run log while rendered Current-conditions bytes drive rewrites. All currently rendered data—fixed reason heading, sanitized display name, group count, remediation line, and over-ceiling size—is inside that renderer. No operative text still limits rewrites to set changes, although one acceptance criterion now overreaches in the opposite direction as finding 1 below."
    },
    {
      "finding": 2,
      "verdict": "FIXED",
      "evidence": "stillQuarantined is now sel.skippedQuarantined, counted only for discovered files whose single selection result is skip-quarantined. A changed prior quarantine is selected instead, a vanished file is not discovered, and the acceptance criterion explicitly asserts that no file contributes twice and that the three counts do not exceed discovered-file count."
    },
    {
      "finding": 3,
      "verdict": "RE-WORDED-NOT-FIXED",
      "evidence": "The dependency and G8 clause were added, but G8 commits warnings only when the current run rewrote them. A post-commit refresh or idle write-if-absent refresh can therefore leave the file dirty; the next unchanged run does not rewrite it and is explicitly required to omit it. In addition, refreshWarnings does not return the exact published bytes that G8 says it must commit."
    },
    {
      "finding": 4,
      "verdict": "FIXED",
      "evidence": "The READ-THIS block, Deliverables preamble, mirrored-surface checklist, and Definition of done all require wd-architect to re-derive and commit this spec before dispatch; the dispatch message records only the committed SHA. The scratch.js rows are legitimately STABLE because WP-dream-promote-in-workspace explicitly excludes that module from modification."
    }
  ],
  "findings": [
    {
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog-165/docs/specs/WP-quarantine-warnings-file.md",
      "line_start": 512,
      "line_end": 525,
      "confidence": 0.99,
      "body": "The acceptance criterion requires a rewrite whenever the same key's fingerprint changes while its reason stays the same, but Table C says rewrites are driven exclusively by a byte change in renderConditions. Most fingerprint components are not rendered: changing mtimeMs, dev, or ino on a read-error record leaves Current conditions byte-identical. An implementation must therefore either violate the no-churn/content-snapshot contract or fail the acceptance criterion. The separate rendered-size case already covers the one fingerprint component that can affect output.",
      "recommendation": "Delete the generic fingerprint-change case. Require rewrites only when renderConditions changes, retaining the explicit over-ceiling size-change case as the fingerprint-derived rendered change."
    },
    {
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog-165/docs/specs/WP-quarantine-warnings-file.md",
      "line_start": 202,
      "line_end": 213,
      "confidence": 0.99,
      "body": "refreshWarnings returns only written, current, and reason; it does not return the exact Buffer published by writeIntoVault. G8 later requires the warnings file's committed bytes to be the bytes the run wrote while preserving a user save that lands after publication. The pipeline cannot obtain those bytes by re-reading the path without reopening exactly that race, and it cannot reconstruct them reliably because refreshWarnings alone owns the carried Run log. WP-dream-promote-in-workspace also cannot repair this interface because warnings.js is outside its Deliverables.",
      "recommendation": "Extend the successful refreshWarnings return arm to include the exact Buffer returned by writeIntoVault, carry that buffer through dream.js until commit construction, and add acceptance coverage showing that a post-publish user save remains uncommitted and intact while the returned bytes enter the commit."
    },
    {
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog-165/docs/specs/WP-dream-promote-in-workspace.md",
      "line_start": 283,
      "line_end": 283,
      "confidence": 1,
      "body": "G8 commits reports/warnings.md only when this run rewrote it. That does not inherit two of the three refresh paths. Refresh point 2 runs after the run's single commit, and refresh point 3 writes on an idle path that makes no commit. On the next run, an unchanged present file is a no-op under Table C, so the current run did not rewrite it and the G8 acceptance criterion requires leaving it out. A stable quarantine set can consequently leave warnings.md uncommitted indefinitely after either path, directly contradicting the named residual's claim that G8 replaces the removed precommit sweep.",
      "recommendation": "Define an explicit pending-commit handoff for successful post-commit and idle refreshes, including their decided bytes, and make the next commit consume it even when that next run does not rewrite the file. Alternatively, redesign the ordering so every successful refresh covered by G8 occurs before the one commit; do not key eligibility solely on whether the committing run performed the write."
    },
    {
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog-165/docs/specs/WP-dream-promote-module.md",
      "line_start": 353,
      "line_end": 353,
      "confidence": 1,
      "body": "Table E states an absolute commit contract: only promoted paths and their decided bytes. G8 now requires a named set containing promoted paths, the separately modeled report, and reports/warnings.md, which is not a promote() outcome at all. This is not harmless shorthand: Table E is declared to own the rule, while G8 is its discharging consumer, and both contracts cannot be satisfied literally.",
      "recommendation": "Revise Table E to scope its rule to the complete named commit set and identify the decided-byte source for each class: promoted/redacted outcomes, the published report arm, and a successful warnings refresh. Update the Table E mirrors so no canonical surface retains the narrower absolute wording."
    }
  ],
  "table_e_residual_verdict": "Contract contradiction requiring a fix. The phrase “only promoted paths” cannot include reports/warnings.md because that file is written independently of promote() and is absent from every promoted, redacted, refused, and report return arm. G8 is not merely refining an unspecified set; it expands a set that Table E declares exhaustive. Table E must be narrowed or updated before dispatch.",
  "scope_objections_(routed_to_the_owner,_not_counted)": "none",
  "executed_vs_read": {
    "executed": [
      "git status --porcelain at the start and end; both produced zero bytes.",
      "git rev-parse --short=7 HEAD; verified 4d423ca.",
      "git show --stat --oneline --decorate --no-renames HEAD; verified the tip commit.",
      "git log --oneline 9b2ac2b..4d423ca.",
      "Read-only git diff commands over the specification revisions.",
      "/usr/bin/grep -a searches for stale membership-only rewrite claims and targeted revision terms."
    ],
    "not_executed": [
      "No tests, Node programs, linters, application commands, or verification gates were executed.",
      "No files were created, edited, staged, committed, or otherwise mutated."
    ],
    "read": [
      "All documents under review were read from /Users/felho/dev/repos-to-learn-from/wienerdog-165, with only Amendment 2 treated as review scope in ADR-0023 and only the named reopen sites treated as review scope in WP-dream-promote-in-workspace.",
      "Grounding code read: src/core/dream/ledger.js, src/core/dream/scratch.js, src/cli/dream.js, src/core/dream/validate.js, src/cli/doctor.js, src/core/digest.js, and src/core/dream/vault-write.js.",
      "Additional grounding read: docs/GLOSSARY.md, WP-dream-promote-module.md Table E and Table S, WP-dream-promote-report.md, and relevant portions of tests/unit and tests/integration."
    ]
  },
  "git_status_porcelain": {
    "before": "",
    "after": "",
    "byte_identical": true
  }
}
```
