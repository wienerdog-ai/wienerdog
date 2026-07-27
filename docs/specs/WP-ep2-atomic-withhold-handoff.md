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

**DATE CORRECTION — 2026-07-27, ROUND 8 OF THE DESIGN GATE, AND THE ERROR WAS
THE COORDINATOR'S.** This record carried **2026-07-28**, as did four records in
the predecessor. The ruling was taken in session on **2026-07-27**; the
round-7.5 brief that commissioned the transcription stated 07-28 and the
architect transcribed the brief's date rather than the session's. **Measured:**
`a516c77`, the commit that wrote all five stamps, is authored `2026-07-27
20:38:12 +0200` — a record cannot be dated after the commit that creates it.
**Only the DATE moved.** The verbatim quotation, the scope clause and the
transcription disclaimer are untouched, and no gate keys on this record.

> **OWNER-DECIDED IN SESSION — 2026-07-27 (TRANSCRIBED, NOT OWNER-TYPED).**
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
3. Restore or drop the vault path — **and this step is where the race moves
   rather than disappears; see immediately below.**

**A concurrent save resolves the safe way by construction ON THE CAPTURE.** An
editor that writes in place writes to the inode the gate holds — captured. An
editor that saves by atomic-rename creates a *new* file at the original path,
which is not the note the gate was withholding.

### The capture is atomic; the RESTORATION is not, and step 3 must say so

**Raised by the adversarial reviewer in round 8 of the design gate on the
predecessor, against this stub's own text.** Step 3 above originally read
*"tracked → `git checkout HEAD --`; untracked → the rename already removed it,
then drop the index entry"*, i.e. **exactly today's restoration**. That is not
safe after an atomic capture — it **moves** the race rather than closing it:

- the gate renames the note away, so the vault path is now **empty**;
- **the note's owner (or the editor's atomic-rename save, or any other writer)
  creates a file at that path in the window that follows** — which is precisely
  the shape the capture was designed to tolerate;
- the gate then runs `git checkout HEAD -- rel`, which **overwrites whatever is
  at that path with HEAD's content.** The replacement is destroyed, and no
  durable artefact holds it, because the gate preserved the *renamed* file and
  has never read the replacement.

**So the same read-then-destroy window survives, one step to the right.** The
capture removed the window between "the gate believes it has the bytes" and "the
gate destroys them"; it did not remove the window between "the gate believes the
path is empty" and "the gate writes over it".

**The design direction this stub mandates, therefore:**

> **Tracked restoration must never overwrite a path that has REAPPEARED since
> the capture.** Before restoring, the gate establishes that the vault path is
> still absent. If a file is there, the gate **aborts, preserving both
> versions** — the captured note is already in `state/quarantine/`, and the
> replacement is left exactly where it is, untouched — and it repairs the index
> entry **without writing to the working-tree path**. The predecessor's rule
> governs unchanged: *never destroy the working-tree file unless some durable
> artefact holds the bytes that are there now.*

**How the absence is established is the real spec's first decision**, and it is
flagged rather than answered here: a plain `fs.existsSync` before the checkout is
itself a check-then-act with a window, so the candidate answers are an
`O_CREAT|O_EXCL` placeholder taken at capture time and released after
restoration, restoring through the index rather than through the working tree, or
accepting a materially narrower window and disclosing it as a residual. **Prefer
the one that has no window; disclose it honestly if none is available — and note
that the placeholder candidate is NOT windowless, which round 9's walk found this
paragraph implying.** Between the capture rename and the `O_CREAT|O_EXCL` create
there is an instant in which the path is free and a writer can win it: the
placeholder narrows the window to two syscalls rather than closing it. Say so
where it is proposed, because a candidate that only looks windowless is worse
than one that is honest about its width.

**THE ARM ASYMMETRY THIS DESIGN INTRODUCES, named because the stub did not name
it (round 9).** After an atomic capture the two arms are no longer symmetric. On
a **tracked** target the gate still performs a restoration, so a reappearance is
something it can observe and abort on. On an **untracked** target the rename has
already removed the path and there is **nothing left to restore** — the gate
proceeds to Step 5's unconditional `git add -A`, and a file that reappeared at
that path is **not observed at all**: it is simply staged and committed, which is
the outcome this whole epic exists to prevent. **The predecessor discloses the
underlying race as inherited; this asymmetry is NEW and is created by the
rename-first design.** The real spec either observes the untracked path before
Step 5 or discloses the gap as its own residual. It does not inherit it.

**THE DETERMINISTIC TEST, and round 9 corrected the seam it names.** The round-8
form patched the tracked `git checkout` **and `fs.rmSync`** — while this same stub
says `fs.rmSync` **disappears** on the untracked arm, so half the test was
anchored to a call the design removes. **An injection barrier, not a call
wrapper:** the real spec exposes one seam **after the atomic capture and before
any restoration or index repair**, and the test installs a file at the original
vault path there. It is implementation-independent by construction — a race-free
implementation still has that point, whereas `git checkout` and `fs.rmSync` may
not survive the change, and a test anchored to them either becomes impossible or
pressures the implementer into keeping obsolete destructive calls, which is the
seam-disappearance failure this section already rejects. **Exercised on BOTH
arms**, asserting at each restoration boundary: the gate **aborted** (tracked) or
**observed the reappearance** (untracked); the replacement is **still on disk,
byte-identical to what the barrier wrote**; the captured note is in
`state/quarantine/`; the index entry was repaired without touching the working
tree; and **no artefact claims the replacement was preserved**.

**This is a change to the SHIPPED withhold path for every severity**, which is
exactly why it is not in the predecessor: that WP's "Out of scope" forbids
changing the withhold path beyond three named exceptions, and this is a fourth.

## Scope

1. **The rename-first capture** in `quarantinePreserve` / the B3 withhold path,
   for `quarantine`-severity findings, unscannable binaries, and every
   redact-arm fall-through alike.
2. **The predecessor's residual and its pinning test are re-derived, and the
   tripwire is re-aimed.** `RP-1` pins the race as *present*: it patches the
   destructive call's seam to write over the target immediately before
   delegating, and asserts the save is destroyed. When this WP lands that row
   must stop passing, and the accepted residual it pins is retired in the same
   pass, together with the predecessor's Table K, Table R and Table B cells that
   describe the check-then-destroy ordering.

   **CORRECTED IN ROUND 8: "RP-1 fails, therefore the race is closed" is not a
   sound inference, and this stub previously made it.** RP-1's seam is the
   *shipped* destructive call. This WP **removes or relocates that call** —
   `fs.rmSync` on the untracked arm disappears entirely, since the rename already
   removed the path — so **RP-1 can fail simply because its seam no longer
   exists**, with the race intact one step to the right (see "The capture is
   atomic; the RESTORATION is not"). A tripwire that fires on the disappearance
   of its own hook proves nothing about the property it was watching.

   **So the obligation on the real spec is stated as a property, not as a red
   row:** when this WP lands, the predecessor's residual is retired **only if a
   test asserts the race is CLOSED — that a write landing in the window is
   preserved or aborted on, not destroyed** — and the replacement-during-
   restoration test above is one half of that assertion. **RP-1 going red is a
   prompt to check, never the evidence.** If the real spec finds it cannot make
   that assertion, the residual stays open and says why.
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
2b. **How does the gate establish that the vault path is still ABSENT before it
   restores?** This is the question "The capture is atomic; the RESTORATION is
   not" raises and does not answer, and it is the first thing the real spec
   decides — an `O_CREAT|O_EXCL` placeholder held across the window, restoration
   through the index rather than the working tree, or a disclosed residual. **A
   plain existence check before the checkout is not an answer**: it is the same
   check-then-act shape one step down.
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
