---
id: WP-quarantine-only-copy-shelf
title: Decide what the redacted shelf owes a copy that is the only one of a note's pre-scrub content
status: Draft
model: opus
size: S
depends_on: [WP-quarantine-banner-location]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-only-copy-shelf: what the `redacted/` shelf owes an only-copy

> **Draft stub, filed 2026-09-06.** It was PROPOSED but never filed by
> `WP-quarantine-banner-location` (2026-09-05), which routed one question to it;
> `WP-quarantine-disposal-durability`'s design-gate round 1 found that a second,
> MEASURED data-loss class was being routed to the same name with no file behind
> it, and filing the stub is that finding's fix. **It has NOT been through spec
> review — mature it to Ready before implementing, and re-measure every claim.**
> `depends_on` names only `WP-quarantine-banner-location` because that is the
> package whose Out of scope registered this one; the disposal package that
> routed the second question is `Superseded` and is a record, not a dependency.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004)** — nothing is started and nothing outlives
its call. The nightly **dream** consolidates recent sessions into the user's
**vault**, and its EP2 secret gate (ADR-0034) preserves the bytes it is judging
before refusing to promote them. Two shelves exist under the user's core, both
0700 with 0600 files (`docs/THREAT-MODEL.md:124`):

- `state/quarantine/` — the **withheld** shelf, holding the flagged copy of a note
  the gate refused. `WP-secret-fence-ep2-redact-arm` **Table N row N1** leaves it
  **unbounded**, and `src/core/digest.js`'s `listSecretQuarantine`
  (`src/core/digest.js:854-864`) lists its direct file entries for the
  pending-review banner.
- `state/quarantine/redacted/` — the **pre-scrub original** of a note the gate
  rewrote and committed. **Table N** bounds it at **50** (row N1), prunes it only
  when a future run completes at least one redaction and only while it exceeds the
  cap (rows N2, N5, N6), makes the prune best-effort (row N7), and defines the
  eviction candidate set as *every date-prefixed file MINUS the basenames this run
  created* (row N3). **The banner deliberately does not announce this shelf**, and
  outside `src/core/dream/validate.js` the only reader of it in `src/` is
  `src/core/private-fs.js:667-672`'s insecure-modes scan, which reads modes and
  not names.

**The asymmetry that makes this shelf different.** A withheld copy is a second
copy: the note is still in the vault, reverted. A `redacted/` copy is often the
ONLY copy of the note's pre-scrub content — the vault holds the scrubbed version
and the workspace is destroyed — so evicting one destroys bytes the user cannot
get back. `src/core/dream/validate.js:1401-1405` says so in the code's own words:
never redact a note whose original could not be preserved, because that is *"the
permanent-corruption outcome this design exists to avoid."*

## What this package must settle

**Three questions land here. They share one subject — what the bounded shelf owes
a copy that is irreplaceable — and each needs its own answer.**

1. **The BANNER question, routed by `WP-quarantine-banner-location`
   (`docs/specs/done/WP-quarantine-banner-location.md:1415-1426`).** That package
   registered this one in its own words: `listSecretQuarantine` *"excludes
   subdirectories by design and the preservation record is never persisted, so
   nothing durable knows that file is an only-copy"*, and it named the three
   candidate answers — *"whether such a copy is moved to the withheld shelf,
   recorded durably, or exempted from the retention cap."* Its **second owner
   item** also parked a related sentence: the pending-review notice's closing
   *"this notice clears when no withheld copies are left"* is false in one measured
   state, and that package accepted it as a residual rather than fixing it here.
2. **The SELECTION question, routed by `WP-quarantine-disposal-durability` owner
   item O9** (`docs/specs/done/WP-quarantine-disposal-durability.md`, its
   `## Dispatch precondition — owner items`; measurements in
   `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
   probes **QD-P3** and **QD-P4**). Table N row **N3** defines the candidate set by
   an EXCLUSION — this run's own basenames — and an exclusion cannot cover an
   object the pruning run knows nothing about. **Measured against the shipped
   `pruneRedactedOriginals`: a lock-stealing overlapping run evicts ANOTHER still-
   running invocation's NEWEST `redacted/` copy if and only if the pruning run's own
   `created` set has reached the cap** — false at 0/10/48/49 creations, true at
   50/51/60, the predicate holding across fourteen sweep points; at 51 and above
   the eviction does not even reach the cap, so it is pure loss. The other run's
   preservation record (`src/core/dream/validate.js:1421`) and dream report
   (`src/core/dream/promote.js:657-661`) then name an artifact that is gone.
   **That package recorded the smallest measured guard rather than taking it** —
   refusing to prune while the run's own `created` set has reached the cap closes
   exactly the measured case — **and explicitly left the choice here**, because
   taking it would pre-empt one of question 1's three answers.
3. **The PERSISTENCE question, routed by that package's owner item O10** (same
   section; probe **QD-P9**). Rows M3, M4 and M6 of its Table M each leave a
   secret-bearing copy on this shelf that no record names, no banner lists, and —
   measured — no prune is scheduled to remove: a shelf of 20 and a shelf of exactly
   50 are never pruned at all. That package's recommendation is ACCEPT AND NAME,
   with its cost stated; the answer is the owner's and its home is here.

## What done means

1. **The value question first, per contract, and it may answer "no" for any of the
   three.** The predecessor packages both reached "not worth solving" for at least
   one routed question, and that is a legitimate outcome
   (`docs/runbooks/codex-review.md`). Measure before specifying.
2. **One answer per question**, and any answer that changes Table N — the candidate
   set (N3), the precedence (N5) or the best-effort posture (N7) — is a CONTRACT
   change to a `Done` spec and therefore an owner item with a recommendation and
   the cost of overruling it, never a fold-in.
3. **No new durable state without pricing it.** Two of the three candidate answers
   to question 1 (record it durably; move it to the withheld shelf) add state or
   move bytes between shelves, and the third (exempt it from the cap) needs a way
   to know an only-copy when it sees one — which is the same missing fact. Whatever
   is chosen, ADR-0004 holds: files only, nothing that keeps running.
4. **One canonical table** with a Mirrored Surface Checklist (ADR-0031). **Do not
   open a second Table N, D, F, P or M** — those belong to
   `WP-secret-fence-ep2-redact-arm`, `WP-preservation-abort-widening`,
   `WP-quarantine-preserve-durability` and `WP-quarantine-disposal-durability`
   respectively. The letter space is exhausted tree-wide; take a documented
   collision, as `docs/specs/done/WP-dream-promote-report.md:356-372` settled.

## Watch out

- **Do not re-litigate the cap's VALUE.** `REDACTED_RETENTION_CAP = 50` is
  owner-approved and Table N row N1 owns it. What is open is what the cap owes an
  only-copy, not what the number should be.
- **A crash is not stageable and neither is a power loss.** If any answer here
  rests on durability, read `WP-quarantine-disposal-durability`'s Table M and its
  design-gate record first: that question is already decided and permanently
  excluded by `WP-quarantine-preserve-durability` Table F row **F7(a)**.
- **Measure the surface before sizing.** `size: S` above is a guess until the
  shelf's readers, the prune's tests (five in
  `tests/unit/dream-validate.test.js`) and any RED declarations pinning them are
  counted.

## Deliverables

**None yet — this is a stub.** A Deliverables table is written when the package is
matured, and not before: it is a permission boundary, and a boundary drawn around
three unanswered product questions would be a guess.
