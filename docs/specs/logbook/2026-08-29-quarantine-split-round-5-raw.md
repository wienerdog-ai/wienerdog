---
title: Round 5 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-30
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 5 raw — external adversarial review, relayed verbatim

Backend: a fresh gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`; focus text: Part A (verify the
round-4 dispositions landed — the named residual's honesty and the pinned
doctor probe) + Part B (closure sweep). Scope boundary carried all nine owner
rulings, including the unrecognized-reason exception with its rationale (the
round-4 relay error corrected). Reviewed tip: `2d9e662`. Committed before
adjudication per `docs/runbooks/codex-review.md`. Read-only verified (git
status --porcelain byte-identical before/after, both empty; asserted inside
the payload).

---

```json
{
  "verdict": "needs-attention",
  "summary": "Do not ship the quarantine-surface spec set at 2d9e662. Round-4 Finding 1 was documented correctly in the warnings-file spec, but Amendment 2 still makes the exact flat commit guarantee that the named residual invalidates. The closure sweep also found that the dream report points capacity-deferred sessions to a warnings file that cannot contain them.",
  "part_a_verdicts": [
    {
      "item": "Finding 1 — pre-promotion commit window",
      "verdict": "fail",
      "evidence": "The residual itself landed correctly in docs/specs/WP-quarantine-warnings-file.md:532-569: it names the window, states that integrity equals an ordinary vault note, cites G8 and its stray-edit acceptance case as the discharge, and rejects the transitional canonical re-stage guard. However, docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md:291-293 still says, without a G8 qualifier, that nothing on disk ever enters a commit and every committed byte is composed from the ledger. Line 285 also calls the file never brain-writable despite the accepted pre-promotion exposure."
    },
    {
      "item": "Finding 3 — doctor pointer probe",
      "verdict": "pass",
      "evidence": "docs/specs/WP-doctor-quarantine-counts.md:274-280 pins lstat of the exact leaf, rejection of every symlink, regular-file validation, and an open-for-reading proof. Lines 390-404 require readable-target symlink, dangling-symlink, and unreadable-regular-file cases and explicitly establish red behavior for the existing statSync-based fileExists helper. Lines 424-432 additionally make the static gate fail when the new lstat/open probe is replaced by that helper."
    }
  ],
  "findings": [
    {
      "title": "Amendment 2 still overclaims commit integrity during the accepted pre-promotion window",
      "severity": "blocking",
      "affected_file": "docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md",
      "line_start": 282,
      "line_end": 293,
      "confidence": 0.99,
      "body": "The owner-accepted residual says that until WP-dream-promote-in-workspace G8 lands, wholesale staging can commit arbitrary on-disk warnings-file bytes and the brain can write this vault path. Amendment 2 nevertheless says the file is never brain-writable and that nothing on disk is ever carried into a commit. That contradiction restores the exact guarantee round 4 ruled unavailable, so an implementer or reviewer can treat the transitional exposure as already closed.",
      "recommendation": "Keep the render guarantee unconditional, but qualify both brain-write and commit-integrity claims with the G8 landing. State explicitly that before G8 the accepted residual applies and after G8 only composeWarnings output can enter the commit."
    },
    {
      "title": "The dream report sends capacity-deferred sessions to a file that cannot name them",
      "severity": "blocking",
      "affected_file": "docs/specs/WP-dream-report-run-skips.md",
      "line_start": 175,
      "line_end": 191,
      "confidence": 0.98,
      "body": "Table A requires the 'Which sessions, and why' pointer whenever any of the three counts is non-zero, including a capacity-only run. Table B states that capacity-deferred transcripts have no ledger record, while reports/warnings.md is rendered only from active ledger quarantines. The promised destination therefore cannot identify those sessions. A capacity-only report will direct the user to a file containing none of the events the report just counted.",
      "recommendation": "Scope the pointer to the newlyQuarantined and stillQuarantined bullets and omit it for a capacity-only section, with wording that explicitly refers only to quarantined sessions. Update the worked example, partial-case contract, acceptance criteria, and formatter gate so a non-zero capacityDeferred count alone does not emit the warnings-file pointer."
    }
  ],
  "scope_objections": "none",
  "executed_vs_read": {
    "executed": [
      "Read-only repository inspection commands: git status --porcelain at the start and end, git rev-parse HEAD, git show --stat, git diff, rg searches, and wc -l.",
      "No product code, test suite, linter, package script, or work-package verification command was executed.",
      "No file was created, edited, deleted, staged, or committed."
    ],
    "only_read": [
      "Amendment 2 of the ADR; the four quarantine specs in full; the specified reopened sites in WP-dream-promote-in-workspace.md and the two specified sites in WP-dream-promote-module.md; the relevant source context in ledger.js, scratch.js, vault-write.js, dream.js, validate.js, doctor.js, digest.js; docs/GLOSSARY.md and relevant test references under tests/ located by read-only search."
    ]
  },
  "git_status_porcelain": { "before": "", "after": "", "byte_identical": true }
}
```
