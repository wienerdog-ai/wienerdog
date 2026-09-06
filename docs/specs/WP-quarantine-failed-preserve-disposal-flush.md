---
id: WP-quarantine-failed-preserve-disposal-flush
title: Add a best-effort directory flush after each owned-path removal on a failed preservation, and price what a failed flush still leaves
status: Draft
model: sonnet
size: S
depends_on: [WP-quarantine-preserve-durability, WP-preservation-abort-widening]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-failed-preserve-disposal-flush: a best-effort flush after a failed preservation's removal

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
ADDS A DURABILITY PROPERTY TO — it enforces nothing that exists today**, and it is
quoted here because it names the two paths whose scope this package takes
(`docs/specs/done/WP-preservation-abort-widening.md:417`):

> **`null` means the owned path is absent.** Every caller already treats `null`
> as "no artifact"; this row is what makes that true

Row **D1** names that owned path as `tmp` before the commit completes, row **D2**
as `dest` after it. On a failed preservation `quarantinePreserve` removes whichever
one it owns and returns `null`.

**AND D4 CARRIES NO DURABILITY REQUIREMENT — read this before writing a sentence
that says it does.** The paragraph immediately after it
(`docs/specs/done/WP-preservation-abort-widening.md:419-433`) states in its own
words that *"Neither P0b's read-back nor D1/D2's removal is crash-durable"*, and
`WP-quarantine-preserve-durability` row **F7(a)** already discloses resurrection
after a failure-path removal. **So this package proposes an ADDITION**, and its
value question is whether that addition is worth its cost — never whether an
existing guarantee is being repaired.

**`WP-quarantine-preserve-durability` Table F made a SUCCESSFUL preservation
durable and explicitly excluded removals (row F7(a)).** Its flush protocol is
POSIX-only (row **F5**), runs only on the success path, and its helper `flushDir`
already exists: it opens a directory, `fsync`s it, closes the descriptor on every
path, and returns a boolean. **Nothing in this package changes Table F, Table D or
Table P.** It proposes to give a removal a durability property no shipped row
requires, and to say honestly where that property does and does not reach.

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

**THE ACCEPTANCE PREDICATE — what this package would actually deliver, stated
before any measurement so no later sentence can inflate it.** A **BEST-EFFORT**
directory flush after each of the two removals. **A COMPLETED POSIX flush closes
that removal's post-completion window.** **A flush that does not complete, and
every win32 run, RETAIN the residual** — `flushDir` catches its own open and
`fsync` failures and returns `false`, and this proposal ignores that boolean, so
the caller carries on and the run can publish and commit exactly as it does today;
on win32 `DURABILITY_AVAILABLE` is false and no flush is issued at all. **That
retained residual is real and is this package's to price, not to omit** — it is the
same class `WP-quarantine-disposal-durability`'s owner item **O10** parks. Nothing
here is a closure of the class.

**The consequence is measured, not inferred (`QD-P11` for `dest`, `QD-P12` for
`tmp`).** Driving the shipped
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
restore it — **a POST-COMPLETION residual nothing in the product prices today.**
It does NOT make row **D4** false: D4 requires no durability, as the paragraph
quoted above says.

**That trace is `dest`'s: its first `rm` is `validate.js:995` and its second is
`:1020`. The shared catch at `:984` — `tmp` — returns before any `fsync` and is NOT
in it.** `QD-P12` reaches that branch instead, by making the first `linkSync` throw
so the redacted COMMIT fails: `reached_M2_shared_catch_at_984: true` with no `dest`
removal, `fsyncs_of_redacted_dir_ANYWHERE: 0`, the withheld fallback succeeding,
and the same withheld-only published record. It also measures what the leftover
then costs: a resurrected `.tmp-<pid>-<stem>` makes the NEXT `redacted` preserve
return `null` (`later_preserve_returned: "null"`) and is itself not removed.

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
   is exactly the acceptance predicate above and nothing wider: **only a COMPLETED
   supported-POSIX directory flush closes that act's post-completion window; a
   flush that does not complete, and every win32 run, RETAIN the priced
   post-completion residual.** Weigh that against one best-effort call per failure
   path. *"Not worth solving"* remains a legitimate outcome
   (`docs/runbooks/codex-review.md`), and the predecessor reached it for three
   sibling acts.
2. **The disposition of a flush that does not complete, which is the one genuinely
   open question.** `removeOwnedQuarantinePath` is fail-loud (Table D row **D3**),
   but D3 is about a REMOVAL that cannot be completed, not about a flush. **Raising
   here would abort a run that is currently recoverable** — at `:1020` on the
   redact arm the caller goes on to the withhold fallback (`validate.js:1429`),
   which is what keeps the note's bytes held. **The recommendation to weigh is
   BEST-EFFORT** — flush, ignore the boolean — which changes no shipped contract
   and is a strict improvement wherever the flush COMPLETES, while retaining the
   residual priced above wherever it does not. **The alternative was deliberately
   NOT decided by the package that filed this one, and it is THIS gate's to
   weigh:** giving an incomplete flush a disposition that stops the run adds a new
   failure class on an arm that is already failing, and its cost is a preservation
   that today falls through to the withhold arm instead aborting the whole run.
   Whichever is chosen, say what
   win32 does: `DURABILITY_AVAILABLE` is false there and no flush is issued, which
   is today's behaviour and row **F5**'s posture, never called durable.
3. **Both acts or one.** The scope above is *the owned paths D4 names*, which is
   an acceptance predicate over the contract rather than a list of the leftovers
   anyone happened to notice. Narrowing to `:1020` alone would add the property
   for `dest` and not for `tmp` — a half-covered pair, and the question "which
   half?" is what a later round asks.
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
