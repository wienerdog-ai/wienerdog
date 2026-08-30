---
title: Round 1 — external adversarial review (raw), the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

# Round 1 — external adversarial review (raw)

Reviewer: gptsol (Codex side, `gpt-5.6-sol`), external. Backend selected per
`docs/runbooks/codex-review.md` → "Backend selection" (gptsol available in this
session, so gptsol). Reviewer instructions: the vendored
`docs/runbooks/review-prompts/adversarial.md`, unedited; everything of ours rode
in the focus text. Targets: `docs/specs/WP-dream-promote-module.md` and
`docs/specs/WP-dream-promote-in-workspace.md` at `7005e31`, base `main` @
`36c2ce5`.

**Committed BEFORE adjudication, verbatim.** Dispositions live in the round
record, not here. The only alteration is this header. Note: `&lt;` `&gt;` `&amp;`
in the body are transport escaping from the agent channel, not the reviewer's
characters.

**Read-only, verified independently by this author**: `git status --porcelain`
was empty in the reviewed checkout before dispatch and empty after — the round's
own final proof agrees.

## Raw output

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the module’s exact return contract drops the decided bytes that the pipeline contract requires for race-safe staging. The two work packages cannot satisfy their seam as written.",
  "findings": [
    {
      "materiality_band": "B",
      "affected_file": "docs/specs/WP-dream-promote-module.md",
      "line_start": 210,
      "line_end": 215,
      "confidence": 0.99,
      "what_can_go_wrong": "A conforming promote() implementation returns promoted and redacted paths without their published bytes. The pipeline then cannot stage the decided bytes without re-reading the vault path, which row G8 explicitly forbids because a concurrent user save could replace the approved bytes in the commit.",
      "why_vulnerable": "The exact return shape defines promoted as string[] and redacted as Array&lt;{rel:string}&gt;; only report has an optional bytes field. However, Table E line 365 says the module supplies the primitive-returned bytes in promoted, and the pipeline’s G8 contract says the committed bytes must be the bytes promote() returned. The prose handoff therefore promises data that the canonical interface cannot carry. This is a direct cross-package seam contradiction, not an implementation-detail gap.",
      "likely_impact": "The implementer must either violate the exact module interface, violate the pipeline’s no-reread rule, or invent an undocumented side channel. The path-reread option can commit ungated user bytes written after promotion. This should be caught during implementation or downstream review, so it is band B rather than band A.",
      "concrete_recommendation": "Change the canonical promote() return contract so every successfully published ordinary or redacted path carries the exact Buffer returned by writeIntoVault—for example, promoted:Array&lt;{rel:string,bytes:Buffer}&gt; and redacted:Array&lt;{rel:string,bytes:Buffer}&gt;—or add one explicit decidedBytes mapping covering both outcomes. Update Table E’s handoff and pipeline G8 to cite that exact field. Preserve report.bytes for the separately accounted report outcome."
    }
  ],
  "scope_objections": [],
  "execution_report": {
    "ran": [
      {
        "command": "cd <checkout> && git rev-parse HEAD && git rev-parse main && git status --porcelain",
        "exit_status": 0,
        "result": "HEAD 7005e317bf4ed48b2bde79017c1795b4f81a4a70; main 36c2ce51562aadb3eea83ccfe51a40bc728d9680; initial status empty."
      },
      {
        "command": "cat docs/specs/_TEMPLATE.md; cat docs/runbooks/spec-authoring.md; cat docs/specs/README.md; cat CLAUDE.md",
        "exit_status": 0
      },
      {
        "command": "cat docs/specs/done/WP-dream-vault-write-primitive.md; cat docs/specs/done/WP-dream-workspace-retarget.md; cat docs/specs/done/WP-dream-baseline-delta-primitive.md",
        "exit_status": 0
      },
      {
        "command": "grep -n -A120 -B20 '^### Exact contracts\\|^### Table H' docs/specs/done/WP-dream-vault-write-primitive.md",
        "exit_status": 0
      },
      {
        "command": "sed -n '1040,1100p;1130,1210p;1210,1370p;1370,1420p' src/core/dream/validate.js; sed -n '400,425p;855,875p' src/core/digest.js; sed -n '500,525p' src/core/dream/delta.js; sed -n '130,305p;480,620p' src/cli/dream.js",
        "exit_status": 0
      },
      {
        "command": "grep -nEi 'report.*(last|after all|complete)|complete.*record|enforcement record|write order|writes second|after promotion' <both specs>",
        "exit_status": 0
      },
      {
        "command": "sed -n '1,70p;450,535p' src/core/reap.js; sed -n '135,300p' src/cli/dream.js",
        "exit_status": 0
      },
      {
        "command": "grep -nE 'sanitized(Bytes| candidate)|redact|merge' docs/specs/WP-dream-promote-module.md",
        "exit_status": 0
      },
      {
        "command": "sed -n '1210,1305p' src/core/dream/validate.js; sed -n '1035,1080p' src/core/dream/validate.js; grep -n 'scrubAddedLines' src/core/dream/validate.js",
        "exit_status": 0
      },
      {
        "command": "cat the three 2026-08-28 promote-split logbook entries",
        "exit_status": 0
      },
      {
        "command": "nl -ba docs/specs/WP-dream-promote-module.md | sed -n '176,228p;304,366p;552,606p'; nl -ba docs/specs/WP-dream-promote-in-workspace.md | sed -n '249,262p;402,418p'",
        "exit_status": 0
      },
      {
        "command": "CHECK 1 target specs are the only spec changes from base; CHECK 2 exact return shape carries no bytes for promoted/redacted notes; CHECK 3 handoff claims those missing bytes are supplied; CHECK 4 pipeline requires decided bytes rather than reread; CHECK 5 npm run lint; CHECK 6 git status --porcelain",
        "exit_status": 0,
        "result": "The return-shape contradiction and the G8 requirement were reproduced directly. npm run lint passed: markdownlint 0 errors; frontmatter 231 specs passed. shellcheck and PSScriptAnalyzer were skipped because their local binaries are absent. Status was empty."
      },
      {
        "command": "git status --porcelain",
        "exit_status": 0,
        "output": ""
      }
    ],
    "read_via_dedicated_reader": [
      "docs/runbooks/review-prompts/adversarial.md",
      "docs/specs/WP-dream-promote-module.md",
      "docs/specs/WP-dream-promote-in-workspace.md"
    ],
    "not_run": [
      "npm test",
      "The specs’ implementation verification commands, because the specified deliverables do not exist yet and this was a read-only design review."
    ],
    "final_read_only_proof": {
      "command": "git status --porcelain",
      "exit_status": 0,
      "output": ""
    }
  }
}
```

## Author's note on the execution report

The reviewer states plainly what it did NOT run: `npm test`, and the specs' own
verification commands (correctly — their deliverables do not exist). It RAN its
own six-check reproduction of the finding plus `npm run lint`, with exit status
captured, and its read-only proof matches this author's independent before/after
check. Under the runbook's rule that "a verdict whose tests did not run is a
reading, and must say so", this verdict discloses its basis: the finding itself
was reproduced by execution, and the wider suite was not run because the round
is a design review of two documents whose code does not yet exist.
