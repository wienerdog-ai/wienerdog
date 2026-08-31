---
id: WP-dream-git-env-pinning
title: Decide and (if ruled) implement git-environment pinning for the dream run
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012]
epic: dream-promotion
---

# WP-dream-git-env-pinning: Decide and (if ruled) implement git-environment pinning for the dream run

> **Draft stub from the 2026-08-31 handover.** This is a REGISTERED
> product-hardening CANDIDATE, not a ruled fix: it was found during gate
> review and explicitly not taken then ("no product change under gate
> pressure"). It needs an owner/maintainer product decision first.

## Context (read this, nothing else)

Measured during the promote-in family's final rounds: the dream run spawns
git with `{...process.env, GIT_INDEX_FILE: tmpIndex}` (at the time,
`dream.js:230`). A user whose shell exports `GIT_DIR` or `GIT_WORK_TREE`
therefore propagates repository redirection into every one of the run's git
calls today — the redirection half of a known exploit shape is live; only
the `GIT_INDEX_FILE` half is pinned. The run's guard and tests handle the
redirection correctly on the TEST side; the question is whether the PRODUCT
should pin its git environment (explicitly set/clear `GIT_DIR`,
`GIT_WORK_TREE`, and decide about the rest of git's env surface) for its own
spawned calls.

The trade to weigh, honestly: pinning protects a scheduled nightly job from
a broken-by-environment failure mode and narrows an attack surface — but a
user who exports `GIT_DIR` globally breaks far more than Wienerdog, and
silently overriding user environment cuts against the same principle that
rejected hook suppression (a just-files product does not silently override
the user's git configuration). The resolution may well differ for env vars
(which redirect OUR calls) vs hooks (which are the user's own code) — that
asymmetry is the crux of the decision.

## What done means

1. An owner decision is recorded (logbook or ADR paragraph): pin, don't pin,
   or pin-with-exceptions — with the hook-suppression rejection distinguished
   by name.
2. If pinned: implemented at the single spawn seam (never per-call), with a
   RED proving an exported `GIT_DIR` no longer redirects a run call, and the
   canonical Table W row updated (registered mirrors move together).
3. If not pinned: the residual is stated in the canonical table the same way
   the hook residual is — named, neither suppressed nor detected.
