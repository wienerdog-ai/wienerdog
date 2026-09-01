---
title: Design-gate round record — WP-preservation-abort-widening
date: 2026-09-01
related_wps: [WP-preservation-abort-widening]
---

# 2026-09-01 — design-gate rounds, WP-preservation-abort-widening

Doc under review: `docs/specs/WP-preservation-abort-widening.md`, matured from
the 2026-08-31 handover stub (HANDOVER queue item 3a) by wd-architect on
`docs/wp-preservation-abort-widening` (base `fc506110`), tip `ade024b0` at
round zero. Runs in parallel with the `WP-index-guard-residuals` loop (its own
record, same date); the two touch disjoint files.

**STOP CRITERION (pinned before round 1):** the loop closes when an external
round returns no material product finding on either channel; machinery or
wording findings at that point are fixed within the frozen surface or accepted
as named residuals. **Escalations, pinned in advance:** (i) two consecutive
rounds landing findings of the same kind → a design question per ADR-0031,
never a third textual patch; (ii) a finding whose only honest fix changes a
shipped canonical row's CONTRACT beyond Table P's stated amendments (Q4's
invariant, Q18's other three fields, G5 beyond its only-copy sentence) is
PARKED as an owner ruling in the spec's Dispatch precondition, never folded.
**The spec already parks ONE owner question** (blast radius: whole-run
fail-loud on the two new arms vs refuse-and-continue; recommendation:
fail-loud) — it blocks dispatch, not the loop.

**Channels:** gate = Codex plugin (`codex-companion.mjs adversarial-review
--base main`, run from this worktree); shadow = herdr-spawned hermetic Codex
(`CODEX_HOME=~/.codex-review-home`, `-s read-only`, detached worktree at the
round's tip, fresh thread per round via `/new`). Raw outputs are committed
BEFORE adjudication, one file per channel per round
(`2026-09-01-preservation-abort-gate-raw-round<N>-<channel>.txt`).

## Round zero (`ade024b0`)

_(pending — template conformance by a clean-context executor; coherence pass
re-running every executable claim.)_

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
