---
id: WP-show-slot-own-value-kind
title: Close the show option-position slot and re-sync the guard's drifted mirrors
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: dream-promotion
---

# WP-show-slot-own-value-kind: Close the show option-position slot and re-sync the guard's drifted mirrors

> **Draft stub from the 2026-08-31 handover.** Context, traps and
> done-definition are harvested from the closing review rounds of
> `WP-dream-promote-in-workspace` (Done). Mature to Ready via wd-architect
> before implementing. All figures below were measured at family close;
> re-measure on the current tree before relying on them.

## Context (read this, nothing else)

The dream run's git invocations are guarded by default-deny shape pinning
(Table W in `docs/specs/done/WP-dream-promote-in-workspace.md`): every call
must match one of the run's own pinned shapes; unknown shapes are violations.
Both final review gates independently found the same residual and classified
it RIDES (not producible today): the `['show', ANY]` shape accepts ANY in an
option position, and `show --output=<user index path>` matches it while
corrupting the user's index (measured: "bad signature" — worse than the
retired read-tree gap, which only emptied it). It is not producible because
the run's single `show` carries the hardwired `WARNINGS_REL` constant.

Two adjacent items belong in the same pass (both gates recommended closing
them together):

- The **RUN_VALUE contradiction**: the JSDoc classes `head` (from
  `rev-parse HEAD`) among "values THIS RUN PRODUCED", while the pinning
  comment says the set never holds what was READ BACK from the user —
  `rev-parse HEAD` reads the user's ref. Harmless today (40-hex cannot be an
  option) but the stated invariant is falsified by one of its own members.
- The **six-vs-four mirror drift**: a registered mirror still says the guard
  admits "six sources" where the code admits four — a docs commit landed
  after the fix it describes and recorded the pre-fix state.

## What done means

1. The `['show', ANY]` option-position gap is closed by a spec decision:
   either a third slot kind or a pin-rule change. Note the trap: W1(c)
   exempts this slot BY NAME because its value is a built string, not a
   read-back — the existing RUN_VALUE pattern does not apply unmodified.
2. The RUN_VALUE invariant is restated so all its members satisfy it (or the
   member is reclassified), and the canonical row + JSDoc + test comments
   agree.
3. The six-vs-four mirror matches the code, and whichever copy moves, the
   other moves in the same commit (registered-mirror rule).
4. Every fix carries its own applied-and-verified mutation (RED proof); a
   canary must match the exploit's ARITY (a three-token canary against a
   two-token gap proves nothing — measured lesson).

## Watch out

- Strict shape-equality is the ruled matching discipline; do not reintroduce
  token classification (that direction was retired by measurement).
- The guard's non-vacuity probe must notice its own death (a dead probe once
  passed 3/0).
