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

## Round zero (`39e52659` → fixes in `5bdaf755`)

Template conformance (clean-context executor, sonnet): **CONFORMANT**.
Coherence (second executor, sonnet): every citation, quoted fragment and count
reproduced; V1–V5 green as stated and every RED variant observed; V6 red on the
absent state; one stale range. **10 findings (4 B, 6 C), all FIX, applied in
`5bdaf755`:** V6 had no RED variant (now six, observed) and no E1/E2 distinction
(now a `RULING` switch); AC4's Table W row W1 and AC5's harness-refusal
patterns were unchecked (added — AC5's check is asymmetric, since the logbook
MUST carry the honesty paragraph); `isSafeRelativePath` is `:65-71`; AC6
aligned with V6; a judgment sentence moved out of the report-only Current
state into Table D; the "only tracking doc" universal gated by an exit-coded
uniqueness grep; the C3 stub's ADR-0004 tag earned in its body; the N/A
checkbox form restored. The architect's re-read caught a Deliverables cell
that presumed ruling E1.

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
