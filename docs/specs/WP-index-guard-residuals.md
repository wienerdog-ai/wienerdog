---
id: WP-index-guard-residuals
title: Close the three small measured residuals of the index guard
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: dream-promotion
---

# WP-index-guard-residuals: Close the three small measured residuals of the index guard

> **Draft stub from the 2026-08-31 handover.** Harvested from the closing
> rounds of `WP-dream-promote-in-workspace` (Done). Mature to Ready before
> implementing; re-measure every citation.

## Context (read this, nothing else)

The promote-in family closed with five residuals ruled RIDES (measured, none
producible). Two go to `WP-show-slot-own-value-kind`; the remaining three are
this stub:

1. **Relative `GIT_INDEX_FILE` frame mismatch.** git resolves a relative
   `GIT_INDEX_FILE` against `-C`, while the guard's path check resolves
   against the node process cwd — two different frames. Not producible today:
   `tmpIndex` is built on `stateDir`, which `assertSafeOverride` forces
   absolute. A one-line fix (resolve in git's frame, or assert absoluteness
   at the guard) closes it.
2. **`produces` attribute has no slot-side counterpart** in the canonical
   table, though the row's own rule says every kind stands at its slot — the
   same error class one level up.
3. **`dream.js:156` comment over-claims**: "every git invocation this
   pipeline makes goes through here", but `promote.js` resolves its own seam
   (it invokes only `merge-file`). Narrow the comment to what holds, or route
   promote's call through the shared seam — the latter is a design choice,
   record whichever with its reason.

## What done means

- Each item fixed with its own proof: item 1 with a RED (a relative override
  that the two frames resolve differently must go red); items 2–3 with the
  mirror rule (whichever copy moves, the other moves in the same commit) and
  a family-wide re-grep pasted into the PR body.
- No behavior change to the guard's matching discipline (strict
  shape-equality stands).
