---
title: Round 3 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 3 raw — external adversarial review, relayed verbatim

Backend: a fresh gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`; focus text: Part A (verify the
four round-2 findings resolved) + Part B (attack the commit-time
reconciliation, sharpest edge: the on-disk Run-log carry as commit input).
Reviewed tip: `64866a2`. Committed before adjudication per
`docs/runbooks/codex-review.md`. Read-only verified (git status --porcelain
byte-identical before/after, both empty; asserted inside the payload).

---

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship yet. Commit-time reconciliation can commit user-controlled Run-log bytes while claiming that stray edits never enter the commit. A second gap allows the refresh and commit callers to use different dates without failing the specified gates.",
  "part_a": [
    {
      "finding": 1,
      "verdict": "FIXED",
      "evidence": "docs/specs/WP-quarantine-warnings-file.md:581-599 now requires rewrites only for rendered reason/size changes and explicitly requires no write for an mtime/dev/ino-only fingerprint change; the mirrored trigger text and executable wiring gate carry the same distinction."
    },
    {
      "finding": 2,
      "verdict": "FIXED",
      "evidence": "docs/specs/WP-quarantine-warnings-file.md:202-226 makes composeWarnings the canonical byte producer, while docs/specs/WP-dream-promote-in-workspace.md:286 commits that render directly; no reviewed surface still requires refreshWarnings to return or carry a commit buffer. The separate Run-log trust defect is reported below."
    },
    {
      "finding": 3,
      "verdict": "FIXED",
      "evidence": "docs/specs/WP-quarantine-warnings-file.md:392 and docs/specs/WP-dream-promote-in-workspace.md:513-534 specify and test render-versus-HEAD reconciliation. A point-2 write after run N's commit remains on disk; run N+1 starts from the post-point-2 ledger snapshot, composes the disk-carried log without a new delta, and includes it because it differs from HEAD. Point 3 follows the same path. The current tree confirms that ledger mutations at src/cli/dream.js:599-607 occur after the commit at lines 572-580, and the spec states the pinned-ledger rule as a contract."
    },
    {
      "finding": 4,
      "verdict": "FIXED",
      "evidence": "docs/specs/WP-dream-promote-module.md:353 now defines three commit classes and their byte sources, and docs/specs/WP-dream-promote-in-workspace.md:286 uses the same named set. The reviewed-surface search found the absolute \"only promoted paths\" wording only in clearly historical quotations and explicit prohibitions."
    }
  ],
  "findings": [
    {
      "file": "docs/specs/WP-quarantine-warnings-file.md",
      "line_start": 327,
      "line_end": 327,
      "confidence": 0.99,
      "body": "The carry rule makes the Run log user-controlled at commit time: composeWarnings reads the working-tree file and carries everything after the first exact `## Run log` marker verbatim. A user or hostile process can therefore insert arbitrary markdown below that marker. G8 then compares the composed document to HEAD and commits the composed bytes when they differ. The fixed header and ledger-rendered Current conditions cannot be influenced this way, but every carried Run-log byte can. This directly contradicts G8's claim that a stray user edit is never committed and weakens the trust construction of the file that the banner and doctor present as Wienerdog's durable record.",
      "recommendation": "Do not treat the working-tree Run log as trusted commit input. Give Run-log history a code-owned canonical source from which composeWarnings can derive it, or otherwise authenticate and validate the carried history before commit. Add an acceptance case that edits only bytes below `## Run log` and proves those bytes cannot enter the dream commit. If disk-carried user bytes are intentionally accepted instead, remove the code-owned and stray-edit safety claims and reassess whether other surfaces may point to this file as trustworthy."
    },
    {
      "file": "docs/specs/WP-dream-promote-in-workspace.md",
      "line_start": 513,
      "line_end": 534,
      "confidence": 0.93,
      "body": "The shared composer removes formatter and sort-order drift, but `date` remains an independent composeWarnings argument. The pinned-state contract pins only ledger and snapshot, and the pipeline acceptance cases never force the commit caller to pass the same run date as refreshWarnings. The current gates can therefore pass if refreshWarnings uses the run's date while G8 recomputes a date using another clock, timezone, or locale. This becomes observable when point 1 is refused and the commit-time composer must append the pending membership-delta line: the commit and the later point-2 disk refresh can record different dates for the same event, causing false durable history and a later reconciliation change.",
      "recommendation": "State explicitly in G8 that the commit caller passes the run's existing `date` value unchanged to composeWarnings. Add a pipeline-level acceptance test with a membership delta and a refused point-1 publish, then assert that the commit-time bytes and the later refresh bytes contain the identical run-date line. The test must fail if either caller reads a clock or derives the date independently."
    }
  ],
  "scope_objections": "none",
  "executed_vs_read": {
    "executed": [
      "Ran `git status --porcelain` before and after the review.",
      "Verified HEAD `64866a2ccbe2363d16edb00ea7d096314b150e2d` and branch `wp/quarantine-surface-split`.",
      "Ran targeted `rg` searches for Amendment 2, reopened specification sites, reconciliation terminology, superseded absolute commit wording, and relevant tests.",
      "Ran `git log` and inspected the specification diff from `9b2ac2b` through `64866a2`.",
      "Checked whether `src/core/dream/warnings.js` currently exists; it is absent, as expected for the unimplemented Draft package.",
      "No product code, verification gate, or test suite was executed."
    ],
    "read": [
      "Read ADR-0023 Amendment 2 in full.",
      "Read WP-quarantine-warnings-file.md, WP-doctor-quarantine-counts.md, WP-quarantine-banner-decay.md, and WP-dream-report-run-skips.md in full.",
      "Read only the user-authorized reopened portions of WP-dream-promote-in-workspace.md and WP-dream-promote-module.md.",
      "Read the relevant implementation ranges in src/cli/dream.js, src/core/dream/ledger.js, src/core/dream/scratch.js, src/core/dream/vault-write.js, src/core/dream/validate.js, src/cli/doctor.js, and src/core/digest.js.",
      "Read docs/GLOSSARY.md and inspected relevant tests under tests/unit and tests/integration through targeted searches; those tests were not executed."
    ]
  },
  "git_status_porcelain": {
    "before": "",
    "after": "",
    "byte_identical": true
  }
}
```
