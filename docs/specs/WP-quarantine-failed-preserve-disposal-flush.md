---
id: WP-quarantine-failed-preserve-disposal-flush
title: Make the two owned-path removals on a failed preservation durable, so a completed run's record cannot be falsified by a crash
status: Draft
model: sonnet
size: S
depends_on: [WP-quarantine-preserve-durability, WP-preservation-abort-widening]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-failed-preserve-disposal-flush: make D4 true after a completed run

> **Draft stub, filed 2026-09-06 by `WP-quarantine-disposal-durability`'s
> design-gate ROUND 2, which measured that package's universal claim FALSE for
> exactly these two removal acts.** That package is `Superseded` for the other
> three; this one carries the two it could not dispose. **It has NOT been through
> its own design gate — mature it to Ready before implementing, and re-measure
> every claim.** The finding, the trace and the value question are
> `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
> section "Round 2", finding **R2-A**, probe **QD-P11**; the decision is that
> package's owner item **O11**.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004)** — nothing is started and nothing outlives
its call; a flush is a call that has returned. The nightly **dream**'s EP2 secret
gate (ADR-0034) preserves the bytes it is judging into `state/quarantine/` or
`state/quarantine/redacted/` (0700 dirs, 0600 files) before refusing to promote
them, via `quarantinePreserve` in `src/core/dream/validate.js`.

**`WP-preservation-abort-widening` Table D row D4 is the contract this package
enforces**, and it is quoted here because it is the whole reason the package
exists (`docs/specs/done/WP-preservation-abort-widening.md:417`):

> **`null` means the owned path is absent.** Every caller already treats `null`
> as "no artifact"; this row is what makes that true

Row **D1** names that owned path as `tmp` before the commit completes, row **D2**
as `dest` after it. On a failed preservation `quarantinePreserve` removes whichever
one it owns and returns `null`.

**`WP-quarantine-preserve-durability` Table F made a SUCCESSFUL preservation
durable and explicitly excluded removals (row F7(a)).** Its flush protocol is
POSIX-only (row **F5**), runs only on the success path, and its helper `flushDir`
already exists: it opens a directory, `fsync`s it, closes the descriptor on every
path, and returns a boolean. **Nothing in this package changes Table F, Table D or
Table P** — it makes D4 survive a crash, which is a durability property D4 never
had.

## Current state

Measured at `66b2b1f8`. Two removals in `src/core/dream/validate.js` are D4's
owned paths on the FAILURE arms:

- **`validate.js:984`** — `if (ownedTmp) removeOwnedQuarantinePath(tmp);` inside
  the shared `catch`, after the gate `ownedTmp = fd >= 0 && ownsName(tmp, fd)`.
- **`validate.js:1020`** — `if (ownedDest) removeOwnedQuarantinePath(dest);` on
  the post-commit failure path, after `ownedDest = ownsName(dest, fd)`.

**Neither is followed by any flush.** `flushPreservation` (`validate.js:857-864`)
runs only on the success path, returns before every `fsync` on win32
(`DURABILITY_AVAILABLE`, `validate.js:696`), and short-circuits on the first flush
that fails.

**The consequence is measured, not inferred (`QD-P11`).** Driving the shipped
`makeGates({stateDir}).secret(…)` through the redact-arm fall-through — the
`redacted/` preservation's artifact flush fault-injected, the withheld one left
working — the whole trace of one gate call is:

```text
rm quarantine/redacted/.tmp-<pid>-fp.md
fsync artifact #1 -> THROWS (injected: the redacted preserve fails)
rm quarantine/redacted/2026-07-02-fp.md
rm quarantine/.tmp-<pid>-fp.md
fsync artifact #2
fsync dir quarantine
fsync dir <stateDir>
fsync dir <core>
```

`fsyncs_of_redacted_dir_ANYWHERE: 0`, and the verdict's published record is
`[{artifact: "2026-07-02-fp.md", location: "quarantine"}]` — **the withheld copy
only**. So the run then completes, publishes that record and commits it, while the
`redacted/` entry it deleted has had no flush at all. A power loss afterwards can
restore it, and **D4 is then false for a run that already finished.**

The control flow after the failed preserve is a shipped, tested behaviour and is
not re-derived here: `tests/unit/dream-validate.test.js:1670` —
*"EP2 redact arm R1: the redacted/ preserve fails → withhold, no copy, index
cleared"* — asserts the fall-through, the withheld copy and the one-entry record.

**Three RED-proof declarations pin lines in this function**, in
`tests/red-proofs/quarantine-preserve-durability.proofs.json`:
`destination-removal-not-gated` (`find` = l.1020's whole line),
`tmp-removal-dropped` and `tmp-removal-not-gated` (`find` = l.995's whole line),
all with `occurrences: 1`. **This package inserts lines and edits none of them**,
so no declaration is re-targeted and none joins the Deliverables — verify that
before writing, not after.

## What this package must settle

1. **The value question first, and it may still answer "no".** What the fix buys
   is one thing, stated narrowly: **a run that COMPLETES and publishes a record
   cannot later be contradicted by a resurrected artifact it deleted.** Weigh that
   against one best-effort call per failure path. *"Not worth solving"* remains a
   legitimate outcome (`docs/runbooks/codex-review.md`), and the predecessor
   reached it for three sibling acts.
2. **The disposition of a flush that does not complete, which is the one genuinely
   open question.** `removeOwnedQuarantinePath` is fail-loud (Table D row **D3**),
   but D3 is about a REMOVAL that cannot be completed, not about a flush. **Raising
   here would abort a run that is currently recoverable** — at `:1020` on the
   redact arm the caller goes on to the withhold fallback (`validate.js:1429`),
   which is what keeps the note's bytes held. **The recommendation to weigh is
   BEST-EFFORT** — flush, ignore the boolean — which changes no shipped contract
   and is a strict improvement wherever it works. Whichever is chosen, say what
   win32 does: `DURABILITY_AVAILABLE` is false there and no flush is issued, which
   is today's behaviour and row **F5**'s posture, never called durable.
3. **Both acts or one.** The scope above is *the owned paths D4 names*, which is
   an acceptance predicate over the contract rather than a list of the leftovers
   anyone happened to notice. Narrowing to `:1020` alone would enforce D4 for
   `dest` and not for `tmp` — a half-true contract, and the question "which half?"
   is what a later round asks. Price both before choosing.
4. **One canonical table** with a Mirrored Surface Checklist (ADR-0031), and **no
   second Table D, F, M, N or P** — those are
   `WP-preservation-abort-widening`'s, `WP-quarantine-preserve-durability`'s,
   `WP-quarantine-disposal-durability`'s, `WP-secret-fence-ep2-redact-arm`'s and
   `WP-preservation-abort-widening`'s. The letter space is exhausted tree-wide;
   take a documented collision, as `docs/specs/done/WP-dream-promote-report.md:356-372`
   settled.

## Watch out

- **A crash cannot be staged.** `QD-P1` measured 400 unflushed unlinks across
  clean exits and `SIGKILL`s with zero reappearances, which establishes only that
  a PROCESS crash is not the hazard. Evidence here can reach the flush CALLS,
  their placement and their disposition — never what a power loss leaves. Say what
  each acceptance criterion reaches; do not name a test for crash survival.
- **The cost is the dirty-directory figure, not the clean one.** `QD-P2` measured
  an `fsync` of a directory with a pending unlink at **2.0–2.7 ms** on darwin/APFS,
  against **0.0016–0.0046 ms** for a clean one. Both failure paths are already
  heading for a preservation failure, so the cost lands on an arm that is not the
  common case — but price it from the right number.
- **Do not widen to the other three acts.** `WP-quarantine-disposal-durability`
  Table M rows **M1**, **M4** and **M6** are permanently excluded by
  `WP-quarantine-preserve-durability` Table F row **F7(a)**'s dated clause. Row M1
  in particular is already inside row F2's flush wherever that flush completes.
- **Measure the surface before sizing.** `size: S` is a guess until the two call
  sites, the tests that drive them and the declarations pinning nearby lines are
  counted.

## Deliverables

**None yet — this is a stub.** A Deliverables table is a permission boundary and
is written when the package is matured, after its value question has an answer.
