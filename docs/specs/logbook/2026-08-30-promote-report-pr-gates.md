---
title: The two PR gates on PR #42 (WP-dream-promote-report)
date: 2026-08-30
related_wps: [WP-dream-promote-report, WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The two PR gates on PR #42

Run locally on the branch diff from merge base `14e2a70`. **GitHub CI is
unavailable** — the Actions billing block: every check failed in ~3s with zero
steps and the annotation "The job was not started because recent account
payments have failed or your spending limit needs to be increased." No job
started, so no check result on this PR is evidence about the branch. Every
blocked check was reproduced locally and the reproduction is recorded on the PR
(`#issuecomment-5470254046`).

Both gates dispatched read-only, each briefed with `WIENERDOG_LOADER_NOOP=1`
and instructed to prove `git status --porcelain` byte-identical before and
after — the hijack lesson from this family's earlier rounds, where a review
agent's temp-`HOME` init reached the owner's real launchd jobs.

## STOP CRITERION — pinned BEFORE either gate's output was read

This section was written and committed while both gates were still running, so
the criterion cannot have been shaped by what they returned. The module half's
record had to pin its criterion retroactively and recorded that as a finding
against itself; this is that lesson applied.

- **The loop CLOSES when a round finds nothing about the PRODUCT** — `src/`
  behaviour, the contract, anything a consumer or a user observes — **on a tip
  BOTH gates cleared.** Machinery findings alive at that point are fixed inside
  the existing surface or accepted as named residuals; they do not extend the
  loop.
- **BOTH GATES MUST BE CLEAN ON THE SAME TIP.** A fix that moves the tip after
  one gate cleared it re-opens that gate.
- **Weighted closure** (runbook): HEAVY — a finding whose fix changes what the
  product does — means fixes land and then a fresh full round for that gate.
  LIGHT — a finding about the verification machinery, tests, wording — means
  fixes land and are verified mechanically, with no fresh round. When in doubt,
  HEAVY.
- **Every finding gets exactly one disposition**: fix / residual / drop, each
  with a one-line reason. For every finding the reachability question is asked
  explicitly: **is this a blocker or a residual, and which workflow actually
  produces the shape it describes?** That question is what ended this family's
  eleven-round loop on PR #23.
- **The surface FREEZES.** Verification machinery may grow only to guard a
  product behaviour, and only in the smallest form that guards it. A finding
  about the machinery never justifies more machinery.
- **ESCALATION, three triggers, any one of which stops the loop and routes an
  owner question rather than another patch:** (i) two consecutive rounds land
  findings of the same KIND; (ii) a finding whose only honest fix re-imports a
  property this package was deliberately re-cut to exclude — a contract change
  is the owner's act, however small the patch looks; (iii) a round that would be
  the FOURTH. Three rounds is the budget.

## Rounds

| Round | Gate | Tip | Verdict | Findings | Raw |
|---|---|---|---|---|---|
| 1 | spec fidelity (wd-reviewer) | `aea77ef` | _pending_ | _pending_ | _pending_ |
| 1 | Codex rubric (gptsol) | `aea77ef` | _pending_ | _pending_ | _pending_ |

Raw output is committed BEFORE it is read or judged, and each row cites the raw
file's path AND the SHA of the commit that introduced it. A row without that SHA
is a round where that rule did not run.
