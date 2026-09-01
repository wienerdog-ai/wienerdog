---
title: Design-gate round record — WP-criterion-red-harness
date: 2026-09-02
related_wps: [WP-criterion-red-harness]
---

# 2026-09-02 — design-gate rounds, WP-criterion-red-harness

Docs under review: `docs/specs/WP-criterion-red-harness.md` (Draft; flips to
Ready at loop close) and `docs/adr/0042-machine-run-red-proofs.md` (Proposed,
unsigned — the WP does not depend on the signature), matured from the
2026-08-31 handover stub (HANDOVER queue item 5) by wd-architect on
`docs/wp-criterion-red-harness` (base `49d3d467`), tip `56c5a99e` at round
zero.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material design finding on either channel — a way the runner
can report PROVEN for a proof whose mutation was not applied, was applied to
the working tree, or whose red was not the named assertion's; a vacuity guard
that can pass on nothing; a production seam borrowed by the runner; or a
Table C reach claim that over-states — and machinery/wording findings at that
point are fixed within the frozen surface or accepted as named residuals.
**Escalations:** (i) two consecutive rounds landing findings of the same
kind → a design question per ADR-0031; (ii) a finding whose only honest fix
puts ADR-0042's doctrine in force ahead of its signature (a spec-template
rule, a blocking CI job) is PARKED, never folded — those are named
successors. The one owner item (ratify ADR-0042) blocks the successors, not
this WP's dispatch.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round). Raw outputs committed BEFORE
adjudication (`2026-09-02-red-harness-gate-raw-round<N>-<channel>.txt`).

## Round zero (`56c5a99e`)

_(pending)_

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
