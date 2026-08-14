---
date: 2026-08-14
title: "Design question: does the snapshot read-path hardening belong in WP-gate-vault-snapshot, or in its own work package?"
related_wps: [WP-gate-vault-snapshot]
---

# Design question: the snapshot read-path hardening (2026-08-14)

**Status: OPEN — owner decision. Nothing is split or rescoped on this record.**

## Why this is being raised now

`docs/runbooks/codex-review.md` says: "When two consecutive rounds land findings
of the same kind, the next step is a design question, never another textual
patch." That condition is now met, so the loop is paused here instead of running
a fourth round.

The rounds, after the 2026-08-14 ruling unblocked the spec:

| Round | Result | Findings |
|---|---|---|
| Template conformance | CONFORMANT | — |
| Internal coherence | — | 6 product, 9 machinery; all fixed |
| External 1 | NO-SHIP | 4; all fixed |
| External 2 | NO-SHIP | 3 new; all fixed |

External rounds 1 and 2 landed findings of the **same kind**: both were about
the snapshot's file-read contract, not about the gates the work package exists
to add.

- Round 1 found that `makeVaultSnapshot` `lstat`s a path and later re-opens that
  same path. Reproduced: a file grown after its size check copied **262145 bytes
  past the 262144-byte cap** with an empty `skipped[]`; a file replaced by a
  symlink after its check copied an out-of-vault file.
- Round 2, against the descriptor-based contract written to fix that, found the
  read was unbounded (a growing file is slurped whole, then declined — after the
  allocation the cap exists to prevent), that `O_NOFOLLOW` does not exist on
  Windows and the repo's own `|| 0` idiom degrades it silently, and that the
  descriptor had no close/error contract.

All of it is fixed in the spec. The pattern is the point: the gates drew zero
findings across both rounds, and the read path drew seven.

## The question

**These are two different pieces of work, and only one of them is this package's
mission.** The mission is to gate the snapshot — secret scan, provenance gate on
the notes slice, framing at mount. The read-path defects are **pre-existing**:
they are in shipping code today, independent of any gate, and would still be
there if this work package were cancelled.

The two are separable. The gates need one read whose bytes feed both the gate
decision and the copy — that closes the gate→copy window, is new, and is
genuinely this package's business. They do NOT need the `lstat`→open window
closed, the read bounded, or a stated win32 posture; those harden a path that
today has no gates on it at all.

So: **does the read-path hardening stay here, or become its own work package?**

**Keeping it here** costs boundedness. The spec is now 636 lines at `size: M`,
and roughly a quarter of it is read-contract material — syscall-level
requirements, a platform posture, a descriptor lifecycle — that an implementer
must hold alongside the gate work. Two rounds running suggests that contract is
not yet cheap to get right.

**Splitting it** keeps this package close to its mission and gives the read
contract its own review, where the win32 question in particular gets the
attention it deserves rather than riding along. The cost is a second package and
a sequencing decision — the gates would land on today's read, and the hardening
after.

Recommendation, offered not taken: **split**. The evidence is that the gate
contract converged and the read contract did not, and they fail independently.

## What is NOT in question

- The gates themselves. No round found a fault in Table A's secret scan,
  notes-slice provenance gate, or Table B's mount framing.
- The 2026-08-14 ruling. Nothing here reopens exclusion, a stamp, or a
  classifier.
- Whether the read defects are real. They are reproduced, twice, on this tree.
  The question is only which package fixes them.

## Also open, from earlier in this package

- **The routine write-back marking** (the ruling's point 2) has no surface in
  this tree: routine output goes to `state/routine-run/<id>/`, which the next run
  wipes, and nothing copies it into the vault. Independently confirmed in review.
  Recorded as the spec's Residual 6.
- **A symlinked SOURCE DIRECTORY is still followed** — reproduced; an external
  file lands in the snapshot with an empty `skipped[]`. Deliberately not changed,
  because refusing it would break an ordinary layout (a user symlinking their
  daily-notes folder). Recorded as the spec's Residual 7.

## Discovered issues, recorded for whoever picks them up

- `activeQuarantines` (`src/core/dream/ledger.js`) and
  `renderSchedulerStatusLine` (`src/scheduler/status.js`) both read a value back
  out of a `state/` file and interpolate it into digest control-plane text
  without re-validating it. Reproduced: a scheduler job name containing a newline
  forges a line in the rendered callout. Both files are Wienerdog-written, so
  this is a robustness boundary rather than a live path — and
  `docs/THREAT-MODEL.md`'s rewritten T1 bullet now states it as such rather than
  claiming a validation that does not happen.
