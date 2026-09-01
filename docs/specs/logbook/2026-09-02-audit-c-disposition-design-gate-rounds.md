---
title: Design-gate round record — WP-audit-c-close-disposition
date: 2026-09-02
related_wps: [WP-audit-c-close-disposition]
---

# 2026-09-02 — design-gate rounds, WP-audit-c-close-disposition

Doc under review: `docs/specs/WP-audit-c-close-disposition.md`, matured from
the 2026-08-31 handover stub (HANDOVER queue item 4) by wd-architect on
`docs/wp-audit-c-close-disposition` (base `49d3d467`), tip `39e52659` at round
zero. A DISPOSITION pass: the architect measured M7/M9/M10 on the current tree
and wrote the measurements into Current state so the implementer re-runs and
records; C3 (layout dot-prefix) is measurably OPEN and gets its own Draft
stub as a Deliverable.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material finding against a DISPOSITION (a mooted finding
whose mechanism still exists, or an open finding wrongly closed) on either
channel; machinery or wording findings at that point are fixed within the
frozen surface or accepted as named residuals. **Escalations:** (i) two
consecutive rounds landing findings of the same kind → a design question per
ADR-0031; (ii) any finding whose honest fix is a product change (a fix inside
this WP) is routed to a new Draft stub, never folded — this WP writes no
`src/` or `tests/`. The closure of group C is PARKED as the owner's
ratification (Dispatch precondition; Table E pre-writes both Status-cell
texts) — it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round). Raw outputs committed BEFORE
adjudication (`2026-09-02-audit-c-gate-raw-round<N>-<channel>.txt`).

## Round zero (`39e52659`)

Pending — template conformance by a clean-context executor; coherence pass re-running every executable claim.

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
