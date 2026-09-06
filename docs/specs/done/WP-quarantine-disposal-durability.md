---
id: WP-quarantine-disposal-durability
title: Decide whether a disposed quarantine artifact must be durably gone, and enforce whatever is decided
status: Superseded
model: opus
size: S
depends_on: [WP-quarantine-preserve-durability]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-quarantine-disposal-durability: the disposal half, and why it is not built

> **SUPERSEDED 2026-09-06 — never implemented; the value question this package
> was filed to ask answered NO, and the record is kept because the answer is the
> deliverable.** The package was split out of
> `docs/specs/done/WP-quarantine-preserve-durability.md` on 2026-09-05 (that
> spec's Dispatch precondition **item 4**) to decide whether a quarantine
> artifact this product deletes must be *durably* gone. It is not. **Two acts
> replace it, and both are in this commit:**
>
> 1. **The permanent exclusion.** `WP-quarantine-preserve-durability`'s **Table F
>    row F7(a)** — the row that names removal durability as out of that package's
>    scope — gains one dated clause recording that the exclusion is now permanent
>    rather than deferred. That row keeps the fact; this file keeps the reasoning.
> 2. **The one live question that rode along and is NOT a durability question** —
>    whether `pruneRedactedOriginals` may SELECT another still-running
>    invocation's fresh `redacted/` artifact for eviction — is answered here as
>    owner item **O9**, measured, and routed to its registered home.
>
> The measurements that decided both are
> `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`
> (probe ids `QD-P1`…`QD-P5`). The predecessor's own design-gate record, which
> routed the two questions here, is
> `docs/specs/logbook/2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`.

## Dispatch precondition — owner items

**TWO items. Both are recommendations recorded with the cost of overruling them,
under the standing process of 2026-09-05
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`): the
maturing architect records a recommendation with its overrule cost, the session
proceeds under it, and the owner reverses it by dated amendment. This section is
the ONE place their text and their costs live; the rulings record cites it.**
**Adopting both changes no `src/` line and no shipped contract.**

**O8 — THE VALUE QUESTION: a disposed quarantine artifact does NOT have to be
durably gone. Recommendation: accept, and close the package.** The reason is one
measured equivalence rather than a judgement about probability. **At every
removal Table M names, the state a crash leaves AFTER a non-durable removal is a
state a crash BEFORE that same removal already leaves** — the file is back under
its own name, in the same 0700 directory, with the same bytes — **and that
earlier state is accepted today at all of them**, with a designed response at
each (Table M's fourth column). A durable removal narrows a window inside an
accepted condition without changing the condition or its disposition. Two
measurements make that concrete and are why this is not an argument from rarity:
**the one removal whose leftover would be functionally harmful is already
durable** — the post-commit temp removal is followed, in the same call, by the
flush of the very directory that held the temp name (`QD-P5`, a run, not a
reading) — and **no crash can be staged**, so a package built here could only
ever assert flush CALLS, never the outcome they are wanted for (`QD-P1`).
**Cost of overruling:** a second flush protocol over the three call sites in
`src/core/dream/validate.js` — four removal acts, since row **M1** already needs
none — and the disposition it needs is where the cost really sits. At `removeOwnedQuarantinePath` a flush that does not complete has no
honest home but `WP-preservation-abort-widening` Table D row **D3**'s fail-loud
class, which turns a new class of filesystem error into an aborted dream; at the
other two sites a flush must stay best-effort to leave Table N row **N7** and the
identity-gated delete's shipped postures standing, and a best-effort flush buys a
probabilistic narrowing of an accepted, self-healing state. Measured cost per
removal on this host: **2.0–2.7 ms**, because the directory has a pending
unlink — not the 0.0016–0.0046 ms a clean-directory `fsync` costs (`QD-P2`).
Reversing this item re-opens the package, re-widens it to the three sites, and
puts two shipped `best-effort` contracts in front of the owner, which is the
contract change item 4 declined to fold in.

**O9 — THE PRUNE'S SELECTION RULE: ACCEPT AND NAME the residual now; the answer
belongs to `WP-quarantine-only-copy-shelf`, which already owns the class.
Recommendation: accept.** The finding is real and reachable, and both halves are
measured. `WP-secret-fence-ep2-redact-arm` Table N row **N3** defines the
eviction candidate set by an EXCLUSION — every basename *this run* created — and
an exclusion cannot cover an object this run knows nothing about, which is
exactly another live run's copy. **Measured against the shipped code (`QD-P3`,
`QD-P4`): the newest such copy is evicted if and only if the pruning run's own
`created` set has reached the cap**, the predicate holding across fourteen sweep
points at 0, 10, 48, 49, 50, 51 and 60 creations; at 51 and above the eviction
does not even reach the cap, so it destroys the other run's artifact and achieves
nothing. What it destroys can be the only copy of a note's pre-scrub content, and
the superseded run's dream report names it. **It is nonetheless not fixed here,
and the reason is that the tree carries no fact that distinguishes "another live
run's fresh copy" from "a stale original":** the lock file holds one pid and one
deadline, and after a steal it holds the stealer's
(`src/core/dream/lock.js:23-54`), so nothing records the superseded run at all.
Any predicate that closes the class must add durable per-artifact state plus a
liveness protocol — which is a product decision, and it is **already
registered**: `WP-quarantine-banner-location` routes the eviction of a
`redacted/` only-copy to the proposed-and-unfiled `WP-quarantine-only-copy-shelf`
in its own words (*"the eviction, not this sentence, is what lost them"*,
`docs/specs/done/WP-quarantine-banner-location.md:250-263`), and names being
"exempted from the retention cap" as one of the three answers that package must
choose between (`docs/specs/done/WP-quarantine-banner-location.md:1415-1426`).
**The smallest measured guard, recorded so that package does not re-derive it:**
refusing to prune while the run's own `created` set has reached the cap closes
exactly the measured case and nothing else — it is the predicate `QD-P4` pins, it
adds no state, and it is a strictly larger overshoot of a cap Table N row **N5**
already says yields. **Cost of overruling:** taking the guard here instead makes
`src/core/dream/validate.js` and its retention tests a Deliverables row of a
`Superseded` package, changes the behaviour Table N rows **N3** and **N5** decide
without amending them, and pre-empts one of the three answers
`WP-quarantine-only-copy-shelf` exists to choose between — while leaving the
larger half of the class (another run's copy that is NOT the newest) untouched,
because ordering alone cannot see it.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004)** — nothing is started and nothing outlives
its call; a flush is a call that has returned. The nightly **dream** consolidates
recent sessions into the user's **vault**, and its EP2 secret gate (ADR-0034)
preserves the bytes it is judging into `state/quarantine/` or
`state/quarantine/redacted/` before refusing to promote them.
`docs/THREAT-MODEL.md` records what those directories are: the flagged copy is
preserved into `state/quarantine/` — *"0700 dir, 0600 file, raw bytes intact"* —
and the pre-scrub original into `state/quarantine/redacted/`, *"same modes, same
raw bytes"* (`docs/THREAT-MODEL.md:124`). They are a deliberate secret shelf, not
an accident, and the same document places anything that can already read them
outside the boundary: Wienerdog is *"not a boundary against arbitrary software
already running as the same user"* — class **A12** (`docs/THREAT-MODEL.md:107`).

`WP-quarantine-preserve-durability` made a SUCCESSFUL preservation durable to the
extent its own guarantee sentence allows. **That sentence is spec-owned there,
pinned byte-for-byte by that package's V1, and is cited here and never copied**;
so are its **Table F** rows, which own the flush protocol, its order, its fixed
directory chain, its POSIX-only scope (**F5**), the no-clobber commit and the
descriptor-bound identity check. Row **F7(a)** is the one this package was filed
against: removal durability is excluded there, and until 2026-09-06 that
exclusion was deferred to this package.

Removal durability is a different invariant from preservation durability, which
is why the split happened at all. A flush that does not complete on the SUCCESS
path is a preservation failure — there is a failure to report and an abort to
take (`WP-preservation-abort-widening` Table **P**, cited, not restated). On a
DISPOSAL path there is not: the preservation has already failed, `null` has
already been decided, and no weaker outcome is left. So each removal needed an
answer of its own, and two of the three CALL SITES (Current state counts the
five removal ACTS they perform) carry shipped `best-effort` postures whose change
would be the owner's act rather than a fold-in.

**This package's answer is that none of them needs one.** What follows is the
enumeration that decides it, and the two owner items above are what it produced.

## Current state

Measured on this branch's base, `66b2b1f8`. **Three call sites remove a
quarantine artifact, and between them they perform five removal ACTS**, all in
`src/core/dream/validate.js`. Table M rows **M1**, **M2**, **M3**, **M4** and
**M6** are those five, one row each:

- `removeOwnedQuarantinePath(p)` — **l.674-687** — `WP-preservation-abort-widening`
  Table D's disposal primitive: `fs.rmSync(p, {force:true})`, then a re-check
  that `p` is gone, and a `WienerdogError` on either failure (Table D row **D3**,
  fail-loud, cited). It is called at **l.984** (the shared `catch`, removing
  `tmp`), **l.995** (after the commit, removing `tmp`) and **l.1020** (the
  failure path, removing `dest`). Each call is gated by `ownsName`
  (**l.772-783**), Table F row **F8**'s predicate.
- `pruneRedactedOriginals(stateDir, created)` — **l.1166-1191** — the eviction
  loop for `REDACTED_RETENTION_CAP = 50` (**l.663**), whose retention contract is
  `WP-secret-fence-ep2-redact-arm` **Table N** (rows N1–N7, cited). Its removal
  is `fs.rmSync` at **l.1186**; its one caller is the gate's `pruneRedacted`
  closure at **l.1549**.
- The identity-gated delete inside the gate's refusal arm — **l.1488-1491** —
  which removes the `redacted/` copy when a byte-identical withheld copy
  demonstrably exists, under the shipped comment
  `/* best-effort: a stale duplicate, not a hazard */`.

Two shipped surfaces decide what *"a name no record reaches"* means here, and
both were read rather than assumed. `src/core/digest.js`'s `listSecretQuarantine`
(**l.854-864**) lists the direct FILE entries of `state/quarantine/` for the
pending-review banner, **excluding dot-prefixed entries and the `redacted/`
subdirectory**; `docs/THREAT-MODEL.md:128` is where that banner is promised. And
`src/core/private-fs.js:667-672` walks every file in both directories for the
insecure-modes scan.

**Three RED-proof declarations pin a removal call-site line byte-for-byte**, in
`tests/red-proofs/quarantine-preserve-durability.proofs.json`:
`destination-removal-not-gated` (`find` = l.1020's whole line),
`tmp-removal-dropped` and `tmp-removal-not-gated` (both `find` = l.995's whole
line). All three declare `occurrences: 1`, so two of them break together on any
edit that touches or duplicates that one line — which is why the only
implementation shape this package ever considered would have put a flush INSIDE
`removeOwnedQuarantinePath`, and why no declaration joins the Deliverables below.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/specs/done/WP-quarantine-preserve-durability.md | ONE dated clause appended inside **Table F row F7(a)**'s cell, and nothing else in that file. **ALREADY WRITTEN by the architect in this spec's own commit — do not author it, do not revise it**; it is listed so the record is exhaustive and the boundary check permits it. Exactly one line of that file differs from `origin/main`, and it is its base row plus exactly the clause — asserted by V2, never by a deletion count |

This spec's own file also MOVES from `docs/specs/` to `docs/specs/done/`, which
`docs/specs/README.md` requires of a `Superseded` spec (*"also moves to `done/`,
carrying a header that names its replacement and the logbook entry explaining
why"*). **Named residual:** `WP-quarantine-preserve-durability`'s Dispatch
precondition **item 4** cites this file at its old path. That section is a
point-in-time dispatch record whose gate has already run, the amendment lives in
the canonical row that owns the fact (**F7(a)**, which names the new path), and
widening this package's boundary to a second edit in a `Done` spec to repair a
historical citation costs more than it returns.

### Exact contracts

**This package ships no code, no command and no file format.** Its ONE exact
contract is the byte-exact clause of Table M row **M0** — the text appended
inside Table F row F7(a)'s cell — and it is decided HERE, between the two
markers below, which is the structural key verification step V2 extracts it by.
Everything else in that row is `WP-quarantine-preserve-durability`'s and is
unchanged.

<!-- f7a-clause:begin -->
**AMENDED 2026-09-06 — the exclusion is PERMANENT, not deferred.** That successor is `Superseded` and filed at `docs/specs/done/WP-quarantine-disposal-durability.md`, and the `(Draft)` marker in the preceding sentence is withdrawn by this clause. Its value question answered NO, on one measured equivalence — the state a crash leaves AFTER a non-durable removal is a state a crash BEFORE that same removal already leaves, and that earlier state is accepted today at every removal named here; one of them, the post-commit temp removal, is in any case already covered by row **F2**'s flush of `qdir`, measured by running. The decided answer per removal, and the two owner items it produced, are that file's **Table M**; the measurements are `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`.
<!-- f7a-clause:end -->

**Exactly one space follows it** in the amended cell, before that cell's
existing `**(b)**` clause. V2 asserts it.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** a disposal/failure behaviour is decided
across five sites — decided as *unchanged*, which is still a decision a later
package must be able to read; **(vi)** `WP-quarantine-only-copy-shelf` inherits
O9's measurement and `WP-quarantine-preserve-durability`'s row F7(a) inherits
O8's. Two of seven.

**Table D and Table P are always `WP-preservation-abort-widening`'s; Table F and
Table C are `WP-quarantine-preserve-durability`'s; Table N is
`WP-secret-fence-ep2-redact-arm`'s.** This spec's canonical table is **M**. The
letter is a deliberate, documented collision: measured over `docs/specs/` and
`docs/adr/` at `66b2b1f8`, no letter is free tree-wide, and
`docs/specs/done/WP-dream-promote-report.md:356-372` settled that a further table
takes a documented collision mitigated by path-qualified citation. `M` collides
with `WP-147-managed-block-separator-roundtrip`,
`WP-launcher-no-self-resync-republish` and `WP-refusal-remedy-discriminator`,
none of which is in this family and none of which decides anything this spec
relies on. **Measured, and stated because naming them has a mechanical cost:**
`Table M` occurs zero times in the family's own documents
(`WP-quarantine-preserve-durability`, `WP-preservation-abort-widening`,
`WP-dream-promote-module`, `ADR-0034`), and `scripts/mirror-walk.js` reports
exactly one AMBIGUOUS reference — row **M5** against
`WP-launcher-no-self-resync-republish`'s Table M, which naming that spec above is
what pulled into scope. That tool reports ambiguity and never fails on it,
because prose qualification is what resolves a collision and no parser can check
one; the qualification is this paragraph, and every row id in this spec means a
row of THIS spec's Table M unless a path is given.

### Table M — canonical: the disposition act, the five removals, the one selection question, and what was decided at each

This table is the single place these facts are decided; every other surface in
this spec cites it. **It decides nothing about the SUCCESS path** — Table F owns
the flush protocol and the guarantee sentence, cited and unrestated.

| # | The removal, and its site | The crash window | What a crash AFTER a non-durable removal leaves — and what a crash BEFORE that same removal leaves | Decided |
|---|---|---|---|---|
| **M0** | — the act this package performs | — | — | **The exclusion in Table F row F7(a) becomes PERMANENT**, by one dated clause appended inside that cell. The clause is the Deliverables row above; the reasoning it points at is this table |
| **M1** | the post-commit removal of `tmp`, `validate.js:995` | **none this package could narrow.** Measured by RUNNING a real `quarantinePreserve` on both arms with `rmSync`, `openSync` and `fsyncSync` traced (`QD-P5`): the removal is followed, in the same call, by an `fsync` of the directory that held the temp name — `quarantine/` on the withheld arm, `redacted/` on the redact arm — because Table F row **F2** flushes `qdir` and `tmp` lives in `qdir`. POSIX-only, exactly as **F5** scopes it | not reachable: the unlink is inside the flushed set | **NOTHING TO DO.** Already covered by the preservation protocol — incidentally, but not accidentally: F2's chain starts at `qdir`. Any flush added here would be a second flush of the same directory |
| **M2** | the shared-`catch` removal of `tmp`, `validate.js:984` | between `rmSync` returning and any later flush of `qdir`; on this path there is none — the call returns `null` | this invocation's own bytes back at `.tmp-<pid>-<stem>`, **which the pending-review banner does not list** (`listSecretQuarantine` skips dot-prefixed entries) and which the insecure-modes scan does reach. A crash **before** l.984 leaves the identical file. That earlier state is not merely accepted, it is DESIGNED FOR: `quarantinePreserve`'s own JSDoc says a crash can leave such a file and that pids are reused, which is why the temp open is `O_CREAT` with `O_EXCL` and a collision is an ordinary preservation failure (Table F row **F8**) | **NO FLUSH.** The class is closed by the exclusive create, not by the unlink's durability, and durability could only shrink a window inside it |
| **M3** | the failure-path removal of `dest`, `validate.js:1020` | between `rmSync` returning and the function returning; nothing flushes afterwards | the artifact back under `<date>-<stem>`. On the **withheld** shelf the pending-review banner LISTS it and points the user at `state/quarantine/` — so *"a name no record reaches"* is measurably false there. On the **`redacted/`** shelf it is not listed, and it is instead a candidate for the retention cap (Table N), which evicts it in time. A crash **before** l.1020 leaves the identical file, and Table D row **D2**'s removal is the cleanup of an already-failed preservation, never of a copy anyone was told about | **NO FLUSH.** On either shelf the leftover is reached by a shipped surface or bounded by a shipped cap, and the pre-removal crash reaches the same state |
| **M4** | the retention eviction, `validate.js:1186` (one `rmSync` per evicted original, inside the loop) | between each `rmSync` and any later flush of `redacted/`; there is none | up to N evicted originals back, i.e. the shelf above `REDACTED_RETENTION_CAP`. That is a state the shipped contract already produces and already clears: Table N row **N5** says the cap YIELDS and a run creating more copies than the cap *"ends above"* it, and row **N6** bounds the overshoot's lifetime at the next redacting run. A crash **before** the prune leaves the same overshoot | **NO FLUSH.** Self-healing by the cap itself; a durable eviction would make the shelf reach the cap sooner and change nothing else. The SELECTION question row **M5** carries is a different question and is not answered by this row |
| **M5** | — **NOT a durability row: the SELECTION rule at M4's site** | not a crash window at all — an overlapping-run window | Table N row **N3** defines the candidates by EXCLUDING this run's own basenames, so another still-running invocation's fresh copy is a candidate. Measured against the shipped code (`QD-P3`, `QD-P4`): the newest such copy is evicted **iff the pruning run's own `created` set has reached the cap** — false at 0/10/48/49 creations, true at 50/51/60, and at 51 and above the eviction does not even reach the cap. What is destroyed can be the only copy of a note's pre-scrub content, named by the other run's dream report | **ACCEPT AND NAME, and route.** Owner item **O9** above carries the answer, the measured guard and the cost; the home is `WP-quarantine-only-copy-shelf`, which already owns this class by `WP-quarantine-banner-location`'s routing |
| **M6** | the identity-gated delete of the `redacted/` duplicate, `validate.js:1488-1491` | between `rmSync` and any later flush; there is none | a byte-identical duplicate of a copy that IS on the preservation record and IS retained — so the reappearance discloses no byte the retained copy does not, in the same 0700 directory. It lands on the capped shelf and is evicted in time (Table N). A crash **before** the delete leaves the same duplicate, which is what the shipped comment already prices as *"a stale duplicate, not a hazard"* | **NO FLUSH.** The shipped posture is correct as written and is not changed |

**What the evidence in this table can and cannot reach, stated once.** `QD-P5`
is a RUN and reaches row **M1**'s claim outright: it observes the real call order
of a real preservation on both arms. **Nothing here reaches a claim about what a
crash leaves**, and no test could: `QD-P1` removed a file under a 0700 directory
with no directory flush anywhere, 200 times with a clean `process.exit(0)` and
200 times with the removing process `SIGKILL`ed immediately after the unlink, on
darwin/APFS under Node v25.9.0 — **zero reappearances in all 400**, which
establishes only that a *process* crash is not the hazard. The hazard is a kernel
panic or a power loss, which cannot be staged on this host, so every crash-window
cell above is derived from the code and is labelled as such rather than dressed
as a measurement. The same probe re-confirmed that `fs.constants.F_FULLFSYNC` is
`undefined` and `fs.fsyncSync` returns `undefined`, so the product could not
observe which barrier it got even if it asked — the ground Table F row **F7(c)**
and its guarantee sentence already stand on.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table M, so a review finding updates the
table and all its mirrors in one pass and in the same commit:

- [ ] The Deliverables-table row (the one clause — row **M0**)
- [ ] Owner item **O8**, which states M1–M4 and M6's shared reason and cites M1's measurement
- [ ] Owner item **O9**, which states row **M5**'s answer, its guard and its cost
- [ ] The Current-state enumeration of the three call sites, their five removal acts and their line ranges
- [ ] Acceptance criteria **1**, **2**, **3** and **4**, and the verification steps V1–V4 that assert them
- [ ] Implementation notes' statement of what the evidence reaches
- [ ] Out of scope's list of what this disposition does NOT decide
- [ ] **External:** `WP-quarantine-preserve-durability` Table F row **F7(a)**'s dated clause, which is the durable half of row **M0** and governs the fact; a later change to M0 is carried there by a further dated clause, never by rewriting that one
- [ ] **External:** `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`'s O8 and O9 entries, which are citation-only and restate nothing from this table

## Implementation notes & constraints

- **Nothing is implemented.** No `src/` file, no test and no RED declaration is
  touched — which is also why the three declarations named in Current state do
  not join the Deliverables: nothing edits the lines their `find` strings pin.
- **What the evidence reaches is decided under Table M**, in the note that
  follows it, and is not restated here. The form is
  `WP-quarantine-preserve-durability`'s Implementation notes': a crash cannot be
  staged inside `npm test`, and a call-order assertion establishes the calls,
  never the guarantee.
- **The guarantee sentence is not here.** It is spec-owned by
  `WP-quarantine-preserve-durability`, pinned byte-for-byte by that package's V1,
  and a second copy anywhere would fail that check. This spec cites it and never
  reproduces it.
- **The abort is not re-litigated.** `WP-preservation-abort-widening`'s Table P
  and Table D own the trigger class, the message taxonomy and artifact ownership;
  they are cited above and restated nowhere.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — this package writes no
      code and constructs no path.** Every path named above is code-built from
      `stateDir` and an already-sanitized basename (`displayName`, WP-119/120),
      unchanged by this disposition.
- [ ] **The surface actually at issue is secret-bearing bytes reappearing on a
      0700 shelf.** Containment, as decided: at **M1** the removal is inside
      Table F's flushed set; at **M2**, **M3**, **M4** and **M6** the reappearing
      object is one a pre-removal crash already leaves, on the same shelf,
      reached by a shipped surface (the pending-review banner, the insecure-modes
      scan) or bounded by a shipped cap — and a reader who can open that
      directory is `docs/THREAT-MODEL.md`'s class **A12**, outside the boundary.
- [ ] **Two residuals, both named:** the pre-removal crash class itself, accepted
      here and unchanged from today; and row **M5**'s selection window, accepted
      as owner item **O9** and routed, not closed.

## Acceptance criteria

- [ ] **1.** `docs/specs/done/WP-quarantine-preserve-durability.md` carries the
      dated clause of **Table F row F7(a)** exactly once (V1).
- [ ] **2.** That file differs from `origin/main` in **exactly one line**, and
      that line is its BASE row plus exactly this spec's clause and one following
      space — nothing else on it moved, and nothing else in the file moved (V2).
- [ ] **3.** This spec's `status:` is `Superseded` and its file is under
      `docs/specs/done/`, per `docs/specs/README.md` (V3).
- [ ] **4.** No file under `src/` or `tests/` differs from `origin/main` in this
      commit — the disposition changes no behaviour (V4).
- [ ] **5.** `npm run lint` passes.
- [ ] **6.** Idempotence — **N/A: this package ships no command and writes
      nothing outside the repository.**

## Verification steps (run these; paste output in the PR)

```bash
set -e   # REQUIRED, and each assertion below is its OWN statement for the same
         # reason: bash exempts from errexit any command that is not the last in
         # an `&&` list, and any command whose status is inverted with `!`. Both
         # exemptions were MEASURED here — an earlier draft chained V1 and V3 as
         # AND-lists and read GREEN on three deliberately broken trees.

# V1 — the dated clause is in the amended file, exactly once. The `test -f` guard
#      is REQUIRED, not decorative: a counted grep over a MISSING file reads
#      greenest exactly where the work was never done. The key goes through a
#      QUOTED heredoc, never nested inline quotes, so a quoting accident cannot
#      change what the gate matched.
cat > /tmp/f7a-key.txt <<'LITERAL'
**AMENDED 2026-09-06 — the exclusion is PERMANENT, not deferred.**
LITERAL
test -f docs/specs/done/WP-quarantine-preserve-durability.md
test "$(grep -F -c -f /tmp/f7a-key.txt docs/specs/done/WP-quarantine-preserve-durability.md)" = 1

# V2 — that file differs from origin/main in EXACTLY ONE line, and that line is
#      its BASE row plus exactly this spec's clause and one following space. The
#      single comparison subsumes presence-in-full, placement in the right cell,
#      and — the thing a line-counting or deletion-counting check cannot see —
#      any edit ELSEWHERE ON THE SAME LINE. (A `--numstat` deletions-are-zero
#      gate is NOT usable here and was measured unsatisfiable: an edit INSIDE an
#      existing line is one deletion plus one addition, so that check can never
#      pass for this act.) The clause is EXTRACTED FROM THIS SPEC by its
#      f7a-clause markers, so the gate compares against what the spec decides and
#      never against a retyping; the paths pass through the ENVIRONMENT and
#      nothing is interpolated into the program text.
SPEC=docs/specs/done/WP-quarantine-disposal-durability.md \
AMENDED=docs/specs/done/WP-quarantine-preserve-durability.md \
BASE=origin/main \
node -e '
const fs = require("fs"), cp = require("child_process");
const spec = fs.readFileSync(process.env.SPEC, "utf8");
const RE = /<!-- f7a-clause:begin -->\n([\s\S]*?)\n<!-- f7a-clause:end -->/;
const found = spec.match(new RegExp(RE.source, "g")) || [];
if (found.length !== 1) { console.error("f7a-clause blocks: " + found.length + " (want 1)"); process.exit(1); }
const clause = RE.exec(spec)[1];
const now = fs.readFileSync(process.env.AMENDED, "utf8").split("\n");
const base = cp.execFileSync("git", ["show", process.env.BASE + ":" + process.env.AMENDED], { encoding: "utf8", maxBuffer: 1e8 }).split("\n");
if (now.length !== base.length) { console.error("line count moved: " + base.length + " -> " + now.length); process.exit(1); }
const moved = [];
for (let i = 0; i < now.length; i += 1) if (now[i] !== base[i]) moved.push(i + 1);
if (moved.length !== 1) { console.error("lines changed: " + JSON.stringify(moved) + " (want exactly 1)"); process.exit(1); }
const k = moved[0] - 1;
const hits = now[k].split(clause).length - 1;
if (hits !== 1) { console.error("the clause occurs " + hits + " times in the changed line (want 1)"); process.exit(1); }
if (now[k].replace(clause + " ", "") !== base[k]) { console.error("the changed line is NOT its base row plus exactly the clause"); process.exit(1); }
console.log("V2 OK: line " + moved[0] + " is its base row plus exactly the clause");
'

# V3 — the terminal status and the filing location (docs/specs/README.md).
#      The absence half is `test ! -e`, where the `!` is test's OWN operand and
#      never a shell `! test -f`, which errexit would exempt.
test -f docs/specs/done/WP-quarantine-disposal-durability.md
test ! -e docs/specs/WP-quarantine-disposal-durability.md
grep -qx 'status: Superseded' docs/specs/done/WP-quarantine-disposal-durability.md

# V4 — the disposition changes no behaviour: nothing under src/ or tests/ moved
test -z "$(git diff --name-only origin/main -- src tests)"

npm run lint
```

- V1–V4 are NEW steps and each is an ASSERTION: it exits non-zero when it fails
  rather than printing a number a reader has to judge. Paste a real green on the
  finished state AND a real red from each deliberately broken state: the clause
  deleted, the clause duplicated inside the row, a second line of the amended
  file edited, a byte changed elsewhere on the amended line, the status left
  `Draft`, the spec file left in `docs/specs/`, and a stray edit under `src/`.
- **What V2 does NOT reach:** whether the clause SAYS the right thing. It pins
  the bytes and their placement; the reasoning behind them is Table M, and no
  command checks that.

## Out of scope (do NOT do these)

- **Re-opening the success path.** Table F owns the flush protocol, its order,
  its fixed directory chain ending at the core anchor, its POSIX-only scope, the
  no-clobber commit, the descriptor-bound identity check and the guarantee
  sentence. This package changed none of them and reproduced none of them.
- **Re-litigating the abort.** `WP-preservation-abort-widening`'s Table D and
  Table P own the trigger class, the message taxonomy and artifact ownership.
- **Changing any of the three shipped disposal postures** — Table D row **D3**'s
  fail-loud removal, Table N row **N7**'s best-effort prune, and the
  identity-gated delete's *"a stale duplicate, not a hazard"*. Each is measured
  correct as written in Table M and none is amended.
- **Deciding what `WP-quarantine-only-copy-shelf` will decide.** Owner item
  **O9** hands it a measurement and the smallest guard that fits it; whether a
  `redacted/` only-copy is moved to the withheld shelf, recorded durably or
  exempted from the cap is that package's product decision, and one of the three
  is what row **M5** must not pre-empt.
- **Repairing the item-4 path citation** (the named residual under Deliverables)
  or `docs/HANDOVER.md` (the orchestrator's surface).

## Definition of done

This package is `Superseded`, so it is never dispatched and never implemented.
Done means the disposition act above has landed and is checkable:

1. The Table F row **F7(a)** clause is in place and is its base row plus exactly
   that clause (V1, V2), and the spec is filed under `docs/specs/done/` with
   `status: Superseded` (V3).
2. Nothing under `src/` or `tests/` moved (V4), and `npm run lint` passes.
3. Owner items **O8** and **O9** are recorded, citation-only, in
   `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`, with
   their text and their overrule costs left in this file's
   `## Dispatch precondition — owner items`, which governs.
4. The measurements are in
   `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`
   under the probe ids Table M cites, and that record states the STOP CRITERION
   pinned before any external round.
5. Both review gates have run on this diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
