---
id: WP-quarantine-preserve-durability
title: Make a preserved quarantine artifact durable, and say honestly what that guarantees
status: Draft
model: opus
size: M
depends_on: [WP-preservation-abort-widening]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-preserve-durability: Make a preserved quarantine artifact durable, and say honestly what that guarantees

> **Draft stub, extracted 2026-09-02 from `WP-preservation-abort-widening`'s
> design gate under the pinned circuit-breaker** (two consecutive rounds landed
> on the same family: round 2 "no durability", round 3 "durability protocol
> incomplete"). The extraction is the design move; this stub is where the
> contract lands. It has NOT been through spec review — mature it to Ready
> before implementing, and re-measure every claim.

## Context (read this, nothing else)

The dream's EP2 secret gate preserves the bytes it is judging into
`state/quarantine/` (or `state/quarantine/redacted/`) before refusing to promote
them. Under promotion those bytes were never in the vault, and the run's
workspace — the only other place they exist — is destroyed on the way out. So
the quarantine artifact is the user's only route back to text the model wrote.

`WP-dream-promote-module` Table Q row **Q4**, the only-copy invariant, requires
that *"nothing may destroy the working copy of a note unless some **durable**
artifact byte-identically holds THE BYTES THAT ARE THERE NOW."*

`WP-preservation-abort-widening` established the **byte-identity** conjunct: a
preservation succeeds only if the artifact is read back and compared, and a
rejected artifact is disposed of under an ownership contract. It deliberately did
**not** establish the **durable** conjunct, and this WP is that conjunct.

**This is a REPAIR of a pre-existing gap in a shipped invariant, and it needs a
mechanism the product does not have.** Q4 has required durability since it
shipped; it has never been enforced. Measured at `fc506110`:
`grep -rn 'fsync\|fdatasync' src/ tests/` returns **nothing**. So the defect is
old and the remedy is new — a cross-cutting durability mechanism with no
precedent, no existing caller contract and no test idiom in this repository. That
combination is why it was extracted rather than carried inside an already-sized
package.

## What done means

1. One canonical **Table D — durable preservation** owning: the sync order (file
   before the rename, containing directory after it); the **recursively created
   directory** problem (`quarantine/` and `quarantine/redacted/` are created with
   `mkdirSync(..., {recursive:true})`, and syncing only the new directory does
   not persist its ENTRY in its parent — each newly created parent needs syncing
   bottom-up); a directory sync after an unlink, so a disposed artifact cannot
   reappear; and the disposition when a required flush errors or is unavailable
   (preservation failure, taking the abort that retains the workspace).
2. **An honest guarantee sentence, and no more than it.** Node/libuv attempts
   `F_FULLFSYNC` and falls back through `F_BARRIERFSYNC` to `fsync` **silently**,
   and Node documents the guarantee as OS- and device-specific. So the contract
   is *durability to the extent the platform's flush provides*, with the fallback
   documented and the supported filesystem semantics stated — never "on the
   medium" unconditionally.
3. Tests: the evidence problem is the hard part and must be solved before this is
   Ready. A crash cannot be staged inside `npm test`, so call-order assertions are
   the only cheap evidence and they prove the calls, not the guarantee. Decide,
   in the maturing pass, what evidence actually reaches — and if it does not
   reach, say so in the spec rather than asserting a proxy.

## Watch out

- **Sizing.** Two review rounds each surfaced a sub-property the previous round
  had not enumerated. Treat the surface as unknown until measured; splitting this
  again is the expected outcome, not a failure.
- **The iron rule (ADR-0004).** A durability step is a synchronous call that has
  returned before the function does. Nothing here may start anything that
  outlives its call.
- **Do not re-litigate the abort trigger.** The trigger class, the message
  taxonomy and the artifact-ownership contract are
  `WP-preservation-abort-widening`'s Table P and Table D; this WP cites them and
  restates neither.
- **Sequencing is not yet ruled.** The owner sequenced
  `WP-preservation-abort-widening` then `WP-quarantine-banner-location`; where
  this WP sits relative to the banner is an open owner question, raised in the
  predecessor's Dispatch precondition.
