---
id: WP-ep2-atomic-withhold-handoff
title: Capture the withheld note by taking its path, not by reading it — close the pre-revert race for every severity
status: Draft
model: opus
size: M
depends_on: [WP-secret-fence-ep2-redact-arm]
adrs: [ADR-0004, ADR-0024, ADR-0034]
epic: secret-lifecycle
---

# WP-ep2-atomic-withhold-handoff: stop the EP2 withhold destroying a save it never captured

**This is a DRAFT STUB.** It records a decided mandate and its scope so the
follow-on is not lost; it is **not implementable as written** and carries no
Deliverables table, no contract tables, no acceptance criteria and no
verification steps yet. The architect writes those in a later pass. **Do not
dispatch this WP.**

## Why this exists — the owner's ruling, not an architect's proposal

Round 6 of the design gate on `WP-secret-fence-ep2-redact-arm` raised a timing
race in that WP's own guard. The architect analysed it, found the race
**inherited rather than created there**, recommended keeping the fall-through
and closing the race properly in a separate WP, and put the alternative to the
owner. Recorded in the established form:

> **OWNER-DECIDED IN SESSION — 2026-07-28 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér answered in conversation; this record was written by the
> architect, not by him. It records that the decision was taken — it is **not**
> his signature and must never be treated as one, and **no gate keys on it**.
> Verbatim: *"architect recommendation approved."* **Scope: option A** — the
> redact-arm fall-through to withhold is kept, the pre-revert race is disclosed
> as an accepted residual in the predecessor, and **this WP is the named
> follow-on that closes it.**

## The problem, stated once

**Every EP2 withhold ends in a destructive operation, and everything that makes
it safe happens earlier.** `quarantinePreserve` reads the working-tree file at
`src/core/dream/validate.js:654`; the gate then reverts — `git checkout HEAD --
rel` on a tracked file, `fs.rmSync` on an untracked one. **A save landing
between the read and the revert is destroyed**, and every durable artifact holds
only the pre-save bytes. On an untracked note the loss is irreversible.

**No check closes this.** The check is at T0 and the destruction at T1; a second
read only moves T0. The predecessor's `K4` identity comparison narrows the
window — it turns a *known* stale copy into an abort — and cannot close it.

**It is not new.** This is shipped behaviour on `main` for **every withhold, at
every severity, since WP-123**, verified by reading the shipped code rather than
inferred. `WP-secret-fence-ep2-redact-arm` adds paths that reach the withhold; it
does not add the race, and it discloses it as an accepted residual with a
residual-pinning test (`RP-1`).

## The design direction

**Capture the file by REMOVING ITS PATH, not by reading it and trusting the
read.** Instead of `read → … → destroy`, the withhold becomes:

1. `fs.renameSync(<vault>/<rel>, <a path this gate owns>)` — a single atomic
   syscall. After it the vault path no longer holds the note, so **there is no
   window in which the gate believes it has the bytes and does not**.
2. Preserve into `state/quarantine/` from the file the gate now owns.
3. Restore or drop the vault path as today (tracked → `git checkout HEAD --`;
   untracked → the rename already removed it, then drop the index entry).

**A concurrent save then resolves the safe way by construction.** An editor that
writes in place writes to the inode the gate holds — captured. An editor that
saves by atomic-rename creates a *new* file at the original path, which is not
the note the gate was withholding and which the gate leaves alone.

**This is a change to the SHIPPED withhold path for every severity**, which is
exactly why it is not in the predecessor: that WP's "Out of scope" forbids
changing the withhold path beyond three named exceptions, and this is a fourth.

## Scope

1. **The rename-first capture** in `quarantinePreserve` / the B3 withhold path,
   for `quarantine`-severity findings, unscannable binaries, and every
   redact-arm fall-through alike.
2. **The predecessor's residual and its pinning test are re-derived.** `RP-1`
   pins the race as *present*; when this WP lands, that row must fail. **It is
   meant to** — the accepted residual it pins is retired in the same pass, and
   the predecessor's Table K, Table R and Table B cells that describe the
   check-then-destroy ordering are rewritten to the capture-then-destroy one.
3. **The failure modes of the rename itself** — a cross-device `EXDEV`, a
   read-only vault, a path the gate cannot write beside — need their own outcome
   rows, because a failed capture must not fall back to the old read-and-trust
   path silently.

## Out of scope

- **The detector and the EP2 severity branch.** Both legs of the secret fence are
  done by the time this runs.
- **Retention, the redaction report, the digest banner.** The predecessor's
  Tables N, Q and B keep their contracts.
- **`state/quarantine/`'s disposal on uninstall** — that is
  `WP-adr-0019-quarantine-uninstall-export`, a sibling follow-on from the same
  epic and a different question.

## Open questions for the real spec

1. **Where does the gate move the file to?** A staging name inside
   `state/quarantine/` is the obvious answer and makes step 2 a local rename —
   but `state/` and the vault may be on different filesystems, and `rename(2)`
   fails `EXDEV` across them. A staging name **inside the vault directory**
   avoids that and must then survive Step 5's `git add -A`.
2. **What does a failed rename do?** Almost certainly abort, on the predecessor's
   own rule — *never destroy the working-tree file unless some durable artefact
   holds the bytes that are there now* — but it needs its own row.
3. **Does the same treatment extend to the redact arm's `scrubAddedLines`?** Its
   pre-rename comparison has the same shape, and the predecessor's residual
   covers that window too.
4. **Is the predecessor's `K4` identity read still needed** once capture is
   atomic, or does it become machinery whose reason has gone? *Prefer the
   smaller design.*

## Definition of done

**Not yet written.** This stub is complete when the architect replaces it with a
full spec: a Deliverables table, contract tables for the capture ordering and its
failure modes, acceptance criteria, mutation rows and verification steps.

**This spec stays `status: Draft`** and does not move to `Ready` until it is a
real spec and has been through the double gate
(`docs/runbooks/codex-review.md` plus wd-reviewer). Only the architect or the
owner flips it.
