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

## Round zero (`ade024b0` → fixes in `220de093`)

Template conformance (clean-context executor, sonnet): **CONFORMANT**.
Coherence pass (second clean-context executor, sonnet): every citation,
quoted fragment and count reproduced, the three-arm A/B/C measurement
re-driven byte-for-byte, V2/V3/V4 red on the untouched tree as predicted,
`npm test` 2444/0, lint green, the 209-test selection green; V5's mutations
COULD-NOT-RUN pre-implementation (they target code the WP adds). **8 findings
(2 B, 6 C), all FIX, applied in `220de093`:**

1. **B** — the "Discovered issues" claim that row V1 contradicts row G12 is
   FALSE on the current tree (V1 `:506` already states G12 keeps half (b)
   fail-loud and cites the fixing round; code agrees) — dropped, no
   replacement; G12's own cell re-read: no defect.
2. **B** — checklist shorthand `G5 → P5` (G5 cites Table P, the class, not
   row P5) and the P5 criterion bundling the two Done-spec amendment clauses
   — fixed and split.
3. **C** — `dream.js:947-963` → `:940-963` (catch at `:953`). 4. **C** — a
   backticked catch "literal" that exists nowhere → structural description
   with real lines. 5. **C** — Dispatch precondition moved after the title
   (four precedents). 6. **C** — `depends_on` gains the two amended Done
   specs; ADR-0012 dropped as partly superseded. 7. **C** — logbook citation
   `:83` → `:79-83`. 8. **C** — checklist category renamed to say every item
   is inside the Deliverables boundary.
   The architect's post-move re-read fixed three sentences the move
   falsified ("three code sites" → the gate, the module, the pipeline's
   record).

## Rounds

| Round | Verdicts (gate / shadow) | Raw files (committed in) | Findings → dispositions |
|-------|--------------------------|--------------------------|--------------------------|
