---
id: WP-scheduler-replay-manifest-independent
title: Derive uninstall's scheduler reversal from the schedule files on disk, not from the manifest alone
status: Draft
model: opus
size: M
depends_on: [WP-scheduler-mutation-home-authority]
adrs: [ADR-0004, ADR-0019, ADR-0027, ADR-0038, ADR-0041]
epic: scheduler-domain-safety
---

# WP-scheduler-replay-manifest-independent: replay the scheduler from disk, not from the ledger

> **Draft stub from the 2026-09-01 owner ruling on issue #169.** This has **not
> been through spec review** — no Deliverables table, no acceptance criteria, no
> verification arms yet. It exists so the residual it closes has a named owner
> instead of living only in an ADR row. Mature it to Ready before dispatching:
> that means measuring the current tree, writing the contract tables, and putting
> it through the design gate like the rest of the family.

## Why this exists

`WP-scheduler-mutation-home-authority` gave `uninstall` a **deletion clearance**
predicate: scheduler authority, or a read-only probe of the live domain that
answers CLEAN. Authority **short-circuits** the probe, and that short-circuit is
deliberate — it is what lets subprocess test callers reach the gate hermetically
through the environment channel (that WP's Table T).

Round 6's design gate found the cost, from both channels independently: an
authority-present uninstall — which, through the coherence arm, is **every normal
default-home user** — replays only what the manifest holds. If a live job's
`scheduler-entry` record is missing (stripped, hand-edited, written by an older
format, or lost to a partial earlier run), **no unload is attempted for it at
all**, and `disposeCoreMechanics` then removes the core around it. The owner
ruled on 2026-09-01 that this is accepted as residual
**R-stripped-manifest-orphan** (ADR-0041's residual table) rather than closed
inside that WP — and that closing it properly is this work package.

## The idea, and the two things it must not become

**The idea:** `uninstall`'s scheduler reversal should be derived from the
**schedule files present in the known scheduler roots** (`~/Library/LaunchAgents`
on macOS, the systemd user dir on Linux, the Task Scheduler store on Windows),
recognized by the same fully-anchored basename patterns the generators write,
rather than from the manifest's entry list alone. The manifest keeps its
ADR-0038 role — narrowing *which files* a deletion touches — but stops being the
sole source of *what must be unloaded*.

This is attractive because the recovery information Wienerdog needs is already on
disk in a code-recognizable form, and ADR-0027 already re-derives the unregister
argv from a file's basename identity rather than trusting a stored argv. The gap
is only that nothing consults those files unless the ledger points at them.

**Two designs this must NOT collapse into**, both refuted by measurement at round
6 and recorded in ADR-0041's rejected options — do not re-derive either:

1. **Probing the live domain on every uninstall** (dropping the authority
   short-circuit). Measured: it breaks the subprocess-test hermeticity the
   parent WP's Table T depends on, because a subprocess cannot be handed a probe
   seam and the scheduler domain is per-user-global with no sandboxed
   equivalent. Of the 15 subprocess uninstall call sites, 13 run `init` first and
   2 plant a hand-built manifest, so results would diverge between a clean runner
   and a machine with live registrations — machine-dependent `npm test`.
2. **Self-unloading live identifiers the manifest does not cover.** Measured:
   coverage can only be evaluated by *identifier*, and identifiers are
   per-user-global while manifest paths are `HOME`-scoped — the premise of issue
   #169. A throwaway-`HOME` `init` mints `scheduler-entry` records for
   `ai.wienerdog.dream` and `ai.wienerdog.catchup`, byte-identical to the labels
   live on a maintainer machine, so a sandbox uninstall would read the real jobs
   as "covered by my own records" and derive bootout argv for them. That rule
   licenses the original incident rather than closing it.

The distinction that keeps this WP out of both traps: it derives what to unload
from **files inside roots this install owns**, never from identifiers observed in
a global namespace, and it changes nothing about *when* clearance is granted.

## What done will mean

To be written properly at maturation; the shape is:

1. An authority-present `uninstall` whose manifest is missing a `scheduler-entry`
   for a schedule file that exists in a known scheduler root still unloads that
   job and removes its file — no orphan, no manual recovery.
2. Nothing outside the known scheduler roots is ever unloaded or deleted by this
   path (`withinSchedulerRoot`'s existing boundary, `src/core/manifest.js`).
3. ADR-0027 is honored: the unregister argv is still **re-derived** from the
   file's basename identity, never read from any stored field.
4. ADR-0038 is honored in the same direction the parent WP established: file
   evidence may **widen what gets unloaded**, never widen what gets deleted
   outside the manifest's list — this WP must decide and state explicitly whether
   a recognized-but-unrecorded schedule file is also *removed*, or only
   *unloaded*, and that decision needs its own argument.
5. Consent integrity survives: whatever this adds to the reversal set must appear
   in the **disclosed plan** before the confirm, or the parent WP's
   disclose-before-consent rule (its Table U) is broken by the fix.
6. `R-stripped-manifest-orphan` is closed and struck from ADR-0041's residual
   table by a dated amendment, not by a silent edit.

## Relationship to R-failed-unload

`R-failed-unload` — a *failed or suppressed* unload still proceeds to delete — is
the sibling residual and is **not** closed by this WP. Its fix is transactional
uninstall (propagate the unload result, order scheduler entries first, abort
retaining recovery metadata), also its own work package. The two share an end
state and could reasonably be done together; whether to merge them is a sizing
decision for maturation, not a foregone conclusion. If merged, the result is
almost certainly too large for one WP and should be a chain.
