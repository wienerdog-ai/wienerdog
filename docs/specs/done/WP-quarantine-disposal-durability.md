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

> **SUPERSEDED 2026-09-06 — never implemented. The value question this package was
> filed to ask answered NO for THREE of its five removal acts and YES for two, and
> the record is kept because that split is the deliverable.** The package was split
> out of
> `docs/specs/done/WP-quarantine-preserve-durability.md` on 2026-09-05 (that
> spec's Dispatch precondition **item 4**) to decide whether a quarantine
> artifact this product deletes must be *durably* gone. **The answer is per act,
> not per package** — design-gate round 2 withdrew the universal claim after
> measuring it false — and **Table M's last column IS the disposition**. **Four
> acts replace this package, and all four are in this branch:**
>
> 1. **The SPLIT exclusion.** `WP-quarantine-preserve-durability`'s **Table F row
>    F7(a)** — the row that names removal durability as out of that package's
>    scope — gains one dated clause: the exclusion is **permanent** for rows
>    **M1**, **M4** and **M6**, and **lifted** for rows **M2** and **M3**. That row
>    keeps the fact; this file keeps the reasoning.
> 2. **The successor for the two acts that are NOT excluded:**
>    `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md`, filed as a
>    `Draft` stub in this branch. Round 2 measured that a failed preservation's
>    removal can be followed by a run that COMPLETES and publishes a record, with
>    no flush anywhere — so Table D row **D4** (*"`null` means the owned path is
>    absent"*) becomes false for a finished run. Owner item **O11** carries the
>    decision and prices both options.
> 3. **The one live question that rode along and is NOT a durability question** —
>    whether `pruneRedactedOriginals` may SELECT another still-running
>    invocation's fresh `redacted/` artifact for eviction — is answered here as
>    owner item **O9**, measured, and routed to a FILED home.
> 4. **That home:** `docs/specs/WP-quarantine-only-copy-shelf.md`, filed as a
>    `Draft` stub in this branch. It was proposed and never filed by
>    `WP-quarantine-banner-location`; design-gate round 1 found that O9 was
>    routing a measured data-loss class to a name with no file behind it, and
>    filing the stub is that finding's fix. It also carries owner item **O10**.
>
> The measurements that decided all four are
> `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`
> (probe ids `QD-P1`…`QD-P11`; `QD-P6`…`QD-P10` were added by round 1 and
> `QD-P11` by round 2). The
> predecessor's own design-gate record, which routed the first two questions
> here, is
> `docs/specs/logbook/2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`.

## Dispatch precondition — owner items

**FOUR items. All are recommendations recorded with the cost of overruling them,
under the standing process of 2026-09-05
(`docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`): the
maturing architect records a recommendation with its overrule cost, the session
proceeds under it, and the owner reverses it by dated amendment. This section is
the ONE place their text and their costs live; the rulings record cites it.**
**Adopting all four changes no `src/` line and no shipped contract HERE** — O11's
answer changes `src/`, but in a successor package with its own gate, not in this
one. **O10 was added by design-gate round 1 and O11 by round 2**
(`docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`),
whose findings R1-B and R2-A each falsified a sentence these rows had rested on.

**O8 — THE VALUE QUESTION, AND ITS ANSWER IS NOW A COLUMN RATHER THAN A
SENTENCE. Recommendation: accept Table M's per-act decisions as they stand.
VERDICT AFTER ROUND 2: the disposition SURVIVES for three acts and is WITHDRAWN
for two.**

**THE DESIGN ANSWER, and it is why this item no longer states a rule.** Three
consecutive rounds landed findings on the SENTENCE this item used to open with —
round 1 on its coverage clause and its "designed response" clause, round 2 on its
pricing and on the temporal equivalence itself. The runbook's repeat-kind rule
says that when two consecutive rounds land findings of the same kind the next step
is a design question, never another textual patch. **The design question is
whether a claim spanning five removal acts can be true at all, and round 2
answered it: it cannot.** So the universal sentence is WITHDRAWN, not reworded,
and **the disposition of this package is exactly Table M's last column** — each
act decided on its own comparison of the crash-before and crash-after states, with
no claim spanning them. The F7(a) clause and this file's header cite that column.

**What survives, per act, and each stands on its own row's measurement.**
**M1** — the window closes inside the call wherever the flush completes, so there
is no post-completion state; where it does not, the act becomes M2's. **M4** — the
prune runs after `promote()` has returned, so the record is already produced in
both states and neither falsifies it. **M6** — the duplicate is present in both
states and the record omits it in both, because the `if (identical)` branch never
records it. **Those three are the permanent exclusion.**

**What does NOT survive: M2 and M3, and the reason is a shipped contract rather
than a preference.** Round 2 measured (`QD-P11`) that a failed preservation's
removal can be followed by a run that COMPLETES and publishes a record, with no
flush of that directory anywhere in the call. `tmp` and `dest` are the two paths
Table D row **D4** calls *the owned path*, and D4 says *"`null` means the owned
path is absent"* (`docs/specs/done/WP-preservation-abort-widening.md:417`). **A
resurrection there makes D4 false for a run that already finished** — which is not
an untidy leftover but a shipped contract becoming untrue after the product
reported success at its own task. Those two acts are decided **(b), close them**,
and move to a successor; owner item **O11** carries that choice and prices both
options.

**No crash can be staged** (`QD-P1`), so nothing here — in this package or its
successor — may assert what a power loss leaves. What the evidence reaches is
stated under Table M.

**Cost of overruling this item** is now per act, because the item is. Overruling
the three permanent exclusions re-opens a flush protocol over acts whose two
states are measured identical, and at `pruneRedactedOriginals` and the
identity-gated delete a flush must stay best-effort to leave Table N row **N7**
and the shipped *"a stale duplicate, not a hazard"* posture standing — which is a
contract change and the owner's act, and the runbook's *diff size does not measure
contract impact* rule is why. Overruling M2/M3's move is **O11**'s cost, stated
there.
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
nothing. What it destroys can be the only copy of a note's pre-scrub content —
the redact arm's own preservation record (`src/core/dream/validate.js:1421`) and
the dream report's redaction line, which renders that record
(`src/core/dream/promote.js:657-661`), both name it. **It is nonetheless not fixed here,
and the reason is that the tree carries no fact that distinguishes "another live
run's fresh copy" from "a stale original":** the lock file holds one pid and one
deadline, and after a steal it holds the stealer's
(`src/core/dream/lock.js:23-54`), so nothing records the superseded run at all.
Any predicate that closes the class must add durable per-artifact state plus a
liveness protocol — which is a product decision, and it now has a FILED home.
**Round 1's finding R1-C was that this item routed a data-loss class to a name
rather than to a file; `docs/specs/WP-quarantine-only-copy-shelf.md` is filed as
a `Draft` stub in this same commit and carries it.**
`WP-quarantine-banner-location` had already routed the eviction of a
`redacted/` only-copy to that package
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

**O10 — THE PERSISTENCE OF AN UNRECORDED `redacted/` ARTIFACT: ACCEPT AND NAME
IT. Recommendation: accept. Added by design-gate round 1, whose finding R1-B is
what made the question visible.** Rows **M3**, **M4** and **M6** each leave a
secret-bearing copy on the `redacted/` shelf that no preservation record names,
that the pending-review banner does not list (`listSecretQuarantine` excludes the
subdirectory by design) and that — measured, `QD-P9` — **may persist
indefinitely**: Table N makes a prune happen only when a future run completes at
least one redaction and only while the shelf exceeds the cap, so a shelf of 20
and a shelf of exactly 50 are never pruned. **That is true whichever entrance
reached the state, which is why it is not O8's question and does not disturb its
verdict** — but calling it acceptable is a statement about the shipped retention
posture, and that is the owner's. **Why ACCEPT is the recommendation, in the
product's own terms:** the object persisting is one the `redacted/` shelf already
holds by design for an unbounded time — Table N row **N1** bounds the shelf by
COUNT and not by age — and `docs/GLOSSARY.md:141-144` names that shelf's contents
*"disposable"* in the product's own vocabulary. **Round 2's finding R2-C removed
the second half of this argument and it is not restored:** an earlier draft said
the M6 copy is byte-identical to a twin *retained forever*. It is not. The twin
exists **at the identity check**; `state/quarantine/` has no automatic cap, but
GLOSSARY:141-144 says a withheld copy is kept *"for as long as the owner leaves it
there"* and `src/core/dream/promote.js:600-603` renders guidance instructing the
owner to *"delete that copy"*. **So once the owner deletes the twin, a resurrected
`redacted/` copy is no longer a duplicate of retained bytes**, and this item claims
no equivalence of lifetime or of disclosure — only that the shelf's own contract
already tolerates such a file. **Cost of accepting, stated
rather than implied:** a user who inspects `state/quarantine/redacted/` can find a
copy that no report, banner or record accounts for, and nothing tells them which
it is. **Cost of overruling:** the only mechanism that removes the class is a
reconciliation pass that enumerates the shelf and deletes what no record names —
and there IS no such record (`WP-quarantine-banner-location` row **L5** measured
that the preservation record is never persisted), so it would need new durable
state per artifact, plus a delete pass over a RECOVERY directory, which is the
destructive-by-default shape this family has refused three times. Making the
prune fail loud instead — amending Table N row **N7** — does not touch this class
at all: a loud prune failure removes no file a crash left behind. **It is not a
Deliverables change either way**, and its natural home if the owner overrules is
`WP-quarantine-only-copy-shelf`, which already owns the shelf's retention
question.

**O11 — THE TWO ACTS THIS PACKAGE COULD NOT DISPOSE: CLOSE THEM, option (b).
Recommendation: accept (b) and dispatch the successor. Added by design-gate
round 2, whose finding R2-A is what made the choice necessary.** Rows **M2** and
**M3** are Table D row **D4**'s two owned paths, removed on `quarantinePreserve`'s
failure arms. **Both options were priced and the record shows both.**

**(a) ACCEPT AND NAME, as O10's class reached after a COMPLETED run.** Cost: a
`redacted/` or `.tmp-` artifact the product deleted can come back after a run that
finished and published a record omitting it, so Table D row **D4** — *"`null`
means the owned path is absent"* — is false for that finished run, and the
product's own published statement is the thing a crash contradicts. Nothing
enumerates the shelf, so nobody finds out.

**(b) CLOSE IT — one best-effort directory flush after each of the two failure-path
removals, POSIX-only. This is the recommendation.** **Reachable:** both removals
sit inside `quarantinePreserve` with `qdir` in scope, each inside its own
`if (owned…)` branch, and the existing helper `flushDir` already opens, `fsync`s
and closes a directory and returns a boolean — **zero new machinery**. **Cost:**
one dirty-directory `fsync` per failure path, **2.0–2.7 ms** (`QD-P2`), on an arm
that is already failing; the common case pays nothing. **Disposition of a flush
that does not complete: BEST-EFFORT** — flush, ignore the boolean. Raising would
abort a run that is currently recoverable: at `:1020` on the redact arm the caller
goes on to the withheld fallback (`validate.js:1429`), which is what keeps the
note's bytes held. Best-effort changes no shipped contract, because Table D row
**D3** is about a REMOVAL that cannot be completed, not about a flush. **On
win32:** `DURABILITY_AVAILABLE` is false, no flush is issued, and that is today's
behaviour and row **F5**'s posture — never called durable. **What (b) does NOT
close:** the interval between the `rmSync` and the `fsync` completing. That
residual is reachable only by a crash that also precedes the published record —
which is the crash-before state these acts already accept.

**Why BOTH acts and not `dest` alone.** The scope is *the owned paths D4 names* —
an acceptance predicate over the contract, not a list of the leftovers a review
happened to notice. **`QD-P11` shows both leftovers in one trace of one run.**
Enforcing D4 for `dest` and not for `tmp` leaves the contract half-true, and
"which half?" is the question the next round asks. **Cost of the narrower
alternative:** one line saved, one split contract bought.

**Cost of overruling O11** (taking (a)): `WP-quarantine-failed-preserve-disposal-flush`
is withdrawn, rows **M2** and **M3** return to this table's permanent exclusion,
the F7(a) clause loses its "NOT EXCLUDED" half, and **D4 acquires a disclosed
durability residual it does not have today** — which is an amendment to a `Done`
spec's canonical row, and therefore the owner's act rather than a fold-in.

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
enumeration that decides it, and the four owner items above are what it produced.
**It is an enumeration and not a rule:** design-gate round 2 withdrew the one
sentence that spanned the acts, so what decides this package is Table M's last
column, act by act.

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
| create | docs/specs/WP-quarantine-failed-preserve-disposal-flush.md | the `Draft` stub owner item **O11** moves rows **M2** and **M3** to, filed by design-gate round 2's finding R2-A. **ALREADY WRITTEN by the architect in this branch** — a stub, so it carries no Deliverables table of its own |
| create | docs/specs/WP-quarantine-only-copy-shelf.md | the `Draft` stub owner item **O9** routes to, filed by design-gate round 1's finding R1-C. **ALREADY WRITTEN by the architect in this branch** — a stub, so it carries no Deliverables table of its own |
| modify | docs/specs/done/WP-quarantine-preserve-durability.md | THREE lines, and nothing else in that file. **(1)** one dated clause appended inside **Table F row F7(a)**'s cell; **(2)** and **(3)** the two live pointers to this spec — Dispatch precondition item 4, and the Mirrored Surface Checklist entry that registers this spec's Context paragraph as an external mirror — repathed to `docs/specs/done/`, because this spec MOVED and a checklist entry naming a path that no longer exists makes `scripts/mirror-walk.js` exit 1 (round 1's finding **R1-D**, self-found). **ALL THREE ARE ALREADY WRITTEN by the architect in this spec's own commit — do not author them, do not revise them**; the row is listed so the record is exhaustive and the boundary check permits it. V2 asserts exactly these three edits and no fourth, by reconstruction and never by a deletion count |

This spec's own file also MOVES from `docs/specs/` to `docs/specs/done/`, which
`docs/specs/README.md` requires of a `Superseded` spec (*"also moves to `done/`,
carrying a header that names its replacement and the logbook entry explaining
why"*). **Both live pointers to it inside the predecessor move with it** — that is
edits (2) and (3) above, and round 1 is why they are not a residual: a Mirrored
Surface Checklist entry naming a path that no longer exists makes
`scripts/mirror-walk.js` exit 1, which a scoped walk cannot see because the entry
lives in another spec. **Disclosed and NOT repaired, because it is outside this
package and predates it:** the unscoped walk reports **14** unresolved entries on
`origin/main` itself, all of the same shape (a spec that moved to `done/` after a
checklist named it), and this branch leaves that set byte-identical — measured by
diffing the walk's UNRESOLVED block between `66b2b1f8` and this tip.

### Exact contracts

**This package ships no code, no command and no file format.** Its ONE exact
contract is the byte-exact clause of Table M row **M0** — the text appended
inside Table F row F7(a)'s cell — and it is decided HERE, between the two
markers below, which is the structural key verification step V2 extracts it by.
Everything else in that row is `WP-quarantine-preserve-durability`'s and is
unchanged.

<!-- f7a-clause:begin -->
**AMENDED 2026-09-06 — the exclusion is PART permanent and PART superseded, and the split is PER REMOVAL ACT.** The successor is `Superseded` and filed at `docs/specs/done/WP-quarantine-disposal-durability.md`, and the `(Draft)` marker in the preceding sentence is withdrawn by this clause. Its **Table M** decides each removal act on its own measured state comparison and **makes no claim that spans them** — design-gate round 2 withdrew the universal one, having falsified it. **PERMANENTLY EXCLUDED, rows M1, M4 and M6:** `pruneRedactedOriginals`' evictions and the identity-gated delete are not made crash-durable, and neither is the post-commit temp removal, which is inside row **F2**'s flush wherever that flush COMPLETES and on POSIX only (row **F5**). **NOT EXCLUDED, rows M2 and M3:** the two paths Table D row **D4** calls *the owned path*, removed on `quarantinePreserve`'s FAILURE arms, because a resurrection there makes **D4** false for a run that has already completed and published a record omitting the artifact — measured. They are `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (Draft). The measurements are `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`.
<!-- f7a-clause:end -->

**Exactly one space follows it** in the amended cell, before that cell's
existing `**(b)**` clause. V2 asserts it.

## Contract reference

Activation (ADR-0031, 2-of-7): **(iv)** a disposal/failure behaviour is decided
across five sites — decided as *unchanged*, which is still a decision a later
package must be able to read; **(vi)** `WP-quarantine-only-copy-shelf` inherits
O9's and O10's measurements and `WP-quarantine-preserve-durability`'s row F7(a)
inherits O8's. Two of seven.

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
`WP-dream-promote-module`, `ADR-0034`). **The collision has a mechanical cost, and NO COUNT OF IT IS WRITTEN HERE —
round 2's finding R2-E is exactly why.** An earlier draft said the scoped
`scripts/mirror-walk.js` reported "exactly one" ambiguous reference; by then it
reported nine, and after this round's own checklist edits it reports more again. A
number beside a list is a number waiting to be falsified, so **the count lives
where it is produced**: the design-gate record pastes the run's own output beside
the tip it ran on. What is stable and therefore stated here is the SHAPE — every
`Table M` and `M<n>` reference in this spec is ambiguous to that tool against
`WP-launcher-no-self-resync-republish`, `WP-147-managed-block-separator-roundtrip`,
`WP-refusal-remedy-discriminator` and `WP-dream-promote-module`, all of which
naming them above is what pulled into scope. **That tool
reports ambiguity and never fails on it**, because prose qualification is what
resolves a collision and no parser can check one; the qualification is this
paragraph, and **every row id in this spec means a row of THIS spec's Table M
unless a path is given**.

### Table M — canonical: each removal act, its own state comparison, and its own decision

This table is the single place these facts are decided; every other surface in
this spec cites it. **It decides nothing about the SUCCESS path** — Table F owns
the flush protocol and the guarantee sentence, cited and unrestated.

**THE DISPOSITION IS THE LAST COLUMN AND NOTHING ELSE — design-gate round 2's
design answer, taken after THREE consecutive rounds landed findings on a sentence
that spanned the acts.** Each act is decided on ITS OWN comparison of two states:
what a crash BEFORE the removal leaves, against what a crash AFTER a non-durable
removal leaves. **No claim in this spec spans the acts, and the comparison is not
always an equivalence** — at rows **M2** and **M3** it measurably is not, and
those two are therefore NOT disposed here.

| # | The removal, and its site | The crash window | THE TWO STATES COMPARED — a crash BEFORE the removal, against a crash AFTER a non-durable one | Decided |
|---|---|---|---|---|
| **M0** | — the act this package performs | — | — | **Table F row F7(a)'s exclusion becomes PART permanent and PART superseded, split PER ACT**, by one dated clause appended inside that cell: permanent for **M1**, **M4** and **M6**; LIFTED for **M2** and **M3**, which move to `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (Draft). The clause is the Deliverables row above; the reasoning it points at is this table |
| **M1** | the post-commit removal of `tmp`, `validate.js:995` | **OPEN from the unlink until `qdir`'s flush COMPLETES, and CONDITIONALLY** — round 1's finding, and the earlier cell's *"not reachable"* is withdrawn. On POSIX, when the whole flush set completes, the window CLOSES inside the same call: measured by running a real `quarantinePreserve` on both arms with `rmSync`, `openSync` and `fsyncSync` traced (`QD-P5`), the unlink is followed by an `fsync` of the directory that held the temp name, because Table F row **F2** flushes `qdir` and `tmp` lives in `qdir`. Its measured width is **3.5–4.1 ms** (median, `QD-P10`), which is 3–6× the **0.66–1.03 ms** for which `tmp` existed BEFORE the unlink. **It does NOT close on three paths, all executed (`QD-P6`, `QD-P7`):** `flushPreservation` (`validate.js:857-864`) SHORT-CIRCUITS, so an artifact-`fsync` failure or a `qdir` open/`fsync` failure returns before any completed directory flush — reproduced on BOTH arms, `rm .tmp` → failed `fsync` → `rm dest` → `null`; and on **win32** `DURABILITY_AVAILABLE` is false, so a SUCCESSFUL preservation issues **zero** `fsync` calls (`QD-P7`, with `process.platform` forced before load) | on the three non-closing paths, exactly the leftover row **M2** owns, and with M2's disposition | **NOTHING TO DO.** Where the flush COMPLETES the window closes INSIDE the call, by a flush this package did not have to add, so this act has no post-completion state to compare. Where it does not, the leftover and its name are **M2**'s and M2's row decides it. **A dedicated flush here would not reach zero either:** it would replace a 3.5–4.1 ms unflushed window with the 2.0–2.7 ms its own dirty-directory `fsync` takes (`QD-P2`) — a factor of ~1.6. **THAT RATIO IS THIS ROW'S AND NO OTHER ROW'S** (round 2's finding **R2-B**): it exists only because an application flush already ENDS this interval, and no other row has one |
| **M2** | the shared-`catch` removal of `tmp`, `validate.js:984` | from `rmSync` returning, and **UNBOUNDED BY ANY APPLICATION FLUSH** (round 2, **R2-B**): nothing this product runs ever flushes `qdir` on this path, so the interval ends only at the platform's own writeback, which this product neither requests nor observes and which is not measured here | this invocation's own bytes back at `.tmp-<pid>-<stem>`, **which the pending-review banner does not list** (`listSecretQuarantine` skips dot-prefixed entries) and which the insecure-modes scan does reach. A crash **before** l.984 leaves the identical file. That earlier state is not merely accepted, it is DESIGNED FOR, and round 1 asked for the design to be verified rather than asserted. **Measured (`QD-P8`), by planting a leftover at the deterministic `.tmp-<pid>-<stem>` name this process owns and calling the shipped `quarantinePreserve`: it returns `null` — an ordinary preservation FAILURE — and the leftover is NOT removed** (row F8 and Table D row **D1** forbid removing a name this call did not create), so it persists and the failure takes Table P's shipped route for a `null` preserve, which that table owns and this row does not restate. **This row also receives M1's three non-closing paths**, since the leftover and its name are the same | **NOT DISPOSED HERE — MOVED.** Round 2's finding **R2-A** measured that the two states are NOT the same: a crash before the removal ends the run, while a crash after it can follow a run that COMPLETED and published a record — and `tmp` is one of the two paths Table D row **D4** calls *the owned path*, so a resurrection makes **D4** false for a finished run. Decided **(b), close it**, with the act owned by `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (Draft); owner item **O11** carries the choice and both prices |
| **M3** | the failure-path removal of `dest`, `validate.js:1020` | from `rmSync` returning, and it **DOES NOT END AT THE FUNCTION RETURN** — round 2's finding **R2-A**, and the earlier cell's bound is withdrawn. Measured (`QD-P11`), driving the shipped `makeGates(…).secret(…)` through the redact-arm fall-through: `fsyncs_of_redacted_dir_ANYWHERE: 0` across the whole gate call. **UNBOUNDED BY ANY APPLICATION FLUSH** | the artifact back under `<date>-<stem>`. On the **withheld** shelf the pending-review banner LISTS it and points the user at `state/quarantine/` — so *"a name no record reaches"* is measurably false there. On the **`redacted/`** shelf it is not listed by any user-facing surface — measured: outside `validate.js` the only reader of that directory in `src/` is `private-fs.js:667-672`'s insecure-modes scan, which reads modes and not names — and it is merely **ELIGIBLE** for eviction, never scheduled for it: Table N rows **N1**, **N2**, **N5** and **N6** make a prune happen only when a FUTURE run completes at least one redaction, only while the shelf exceeds the cap, and oldest-first, with the overshoot explicitly not time-bounded. **Round 1's finding, and the earlier cell's *"evicts it in time"* is withdrawn: measured (`QD-P9`), a shelf of 20 and a shelf of exactly 50 are not pruned at all, and above the cap only the oldest go — so such a copy may persist INDEFINITELY.** A crash **before** l.1020 leaves the identical file, on the identical terms | **NOT DISPOSED HERE — MOVED, and this is the row that broke the universal claim.** The two states are DIFFERENT: a crash before `:1020` ends the run before the withheld fallback (`validate.js:1429`) and before any report; a crash after it can follow a run that completed, published a record naming only the withheld copy (`validate.js:1463`, measured `[{artifact, location: "quarantine"}]`) and committed it. **`dest` is Table D row D4's owned path, so a resurrection makes D4 FALSE for a finished run** — the only act in this table where a resurrection falsifies a shipped contract rather than leaving an untidy file. Decided **(b), close it**, with the act owned by `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (Draft); owner item **O11** carries the choice and both prices |
| **M4** | the retention eviction, `validate.js:1186` (one `rmSync` per evicted original, inside the loop) | from each `rmSync`, and **UNBOUNDED BY ANY APPLICATION FLUSH** (round 2, **R2-B**): nothing flushes `redacted/` afterwards, so no interval width and no narrowing ratio can be derived for this row — M1's figures are M1's | up to N evicted originals back, i.e. the shelf above `REDACTED_RETENTION_CAP` — a state the shipped contract already produces and does NOT bound in time. **Round 1's finding, and the earlier cell's *"self-healing"* is withdrawn:** Table N row **N5** says the cap YIELDS, and row **N6** puts the overshoot's lifetime at *the next run that completes at least one redaction* — which is not a schedule, and `QD-P9` measures the two states in which no prune runs at all. A crash **before** the prune leaves the same overshoot, on the same terms | **NO FLUSH.** Here the two states ARE the same, and for a reason peculiar to this act: the prune runs AFTER `promote()` has returned, so the run's record is already produced either way and neither state falsifies it — the shelf is over the cap in both. A durable eviction only makes the shelf reach the cap sooner on the runs that would have pruned anyway. The SELECTION question row **M5** carries is a different question and is not answered by this row; the PERSISTENCE question is owner item **O10** |
| **M5** | — **NOT a durability row: the SELECTION rule at M4's site** | not a crash window at all — an overlapping-run window | Table N row **N3** defines the candidates by EXCLUDING this run's own basenames, so another still-running invocation's fresh copy is a candidate. Measured against the shipped code (`QD-P3`, `QD-P4`): the newest such copy is evicted **iff the pruning run's own `created` set has reached the cap** — false at 0/10/48/49 creations, true at 50/51/60, and at 51 and above the eviction does not even reach the cap. What is destroyed can be the only copy of a note's pre-scrub content, which the other run's own preservation record and dream report both name | **ACCEPT AND NAME, and route.** Owner item **O9** above carries the answer, the measured guard and the cost; the home is `WP-quarantine-only-copy-shelf`, which already owns this class by `WP-quarantine-banner-location`'s routing |
| **M6** | the identity-gated delete of the `redacted/` duplicate, `validate.js:1488-1491` | from `rmSync`, and **UNBOUNDED BY ANY APPLICATION FLUSH** (round 2, **R2-B**) | a byte-identical duplicate of a copy that IS on the preservation record and that exists **AT THE IDENTITY CHECK**. **Round 2's finding R2-C withdrew the lifetime claim that stood here:** `state/quarantine/` has no automatic cap (Table N row **N1**), but that is not permanence — `docs/GLOSSARY.md:141-144` says a withheld copy is kept *"for as long as the owner leaves it there"*, and `src/core/dream/promote.js:600-603` renders remediation guidance that instructs the owner to *"delete that copy"*. **So after the owner deletes the twin, a later resurrected `redacted/` copy is no longer a duplicate of retained bytes**, and no equivalence of lifetime or of disclosure is claimed. What holds at the moment of the delete is that the bytes are the twin's. It lands on the capped shelf, where Table N makes it ELIGIBLE for a future qualifying prune and nothing more (**M3**'s cell carries the measurement; the earlier cell's *"evicted in time"* is withdrawn). A crash **before** the delete leaves the same duplicate, which is what the shipped comment already prices as *"a stale duplicate, not a hazard"* | **NO FLUSH.** The two states are the same for this act — the duplicate is present either way and the record omits it either way, because the `if (identical)` branch never records it — so a resurrection falsifies no published statement. The shipped posture is correct as written and is not changed; the duplicate's PERSISTENCE, and what it means once the owner has deleted the twin, are owner item **O10**'s subject |

**PLATFORM SCOPE, stated once and applying to every row.** Every flush this
table mentions is Table F row **F5**'s, which is **POSIX-only**. On win32
`flushPreservation` returns before issuing any `fsync` (`validate.js:857-864`),
and a successful preservation there issues **zero** — measured, `QD-P7`. So on
win32 NO removal in this table is ever covered by a flush, and none is called
durable: what carries win32 is the same equivalence that carries every other row,
never a coverage claim.

**What the evidence in this table can and cannot reach, stated once.** `QD-P5`
through `QD-P11` are RUNS against the shipped functions and reach exactly what
their cells say — a call order, a short-circuit, a platform branch, a collision
outcome, a prune outcome, two window widths, and (`QD-P11`) the whole
`makeGates(…).secret(…)` trace through the redact-arm fall-through, in which
`redacted/` is fsynced **zero** times and the published record names the withheld
copy alone. **Nothing here reaches a claim about what a
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
- [ ] Owner item **O10**, which states the persistence rows **M4** and **M6** leave, cites `QD-P9`, and carries R2-C's qualification of the withheld twin's lifetime
- [ ] Owner item **O11**, which states rows **M2** and **M3**'s decision and prices both options
- [ ] The platform-scope paragraph under Table M, which applies **F5** to every row
- [ ] The Current-state enumeration of the three call sites, their five removal acts and their line ranges
- [ ] Acceptance criteria **1**, **2**, **3** and **4**, and the verification steps V1–V4 that assert them
- [ ] Implementation notes' statement of what the evidence reaches
- [ ] Out of scope's list of what this disposition does NOT decide
- [ ] **External:** `WP-quarantine-preserve-durability` Table F row **F7(a)**'s dated clause, which is the durable half of row **M0** and governs the fact; a later change to M0 is carried there by a further dated clause, never by rewriting that one
- [ ] **External:** `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`'s O8, O9 and O10 entries, which are citation-only and restate nothing from this table
- [ ] **External, and it is a mirrored SUMMARY rather than a citation — round 2's finding R2-E, registered honestly:** `docs/specs/WP-quarantine-only-copy-shelf.md`'s "What this package must settle" **locally repeats** row **M4**'s and **M6**'s persistence result and row **M5**'s `QD-P3`/`QD-P4` predicate and guard, because a stub a later reader opens cold cannot be a bare pointer. It cites **M4**, **M5** and **M6** by id. **A change to any of those three rows changes that file too**, and this entry is what says so
- [ ] **External:** `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md`, which owns rows **M2** and **M3**'s acts and restates D4, `QD-P11`'s trace and the two call sites — also a mirrored SUMMARY, for the same reason

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
      Table F's flushed set **wherever that set completes, and on POSIX only**
      (`QD-P6`, `QD-P7`), falling back to M2's state otherwise; at **M2** and
      **M3** containment is NOT decided here at all — those acts move to
      `WP-quarantine-failed-preserve-disposal-flush` (owner item **O11**), because
      a resurrection there falsifies Table D row **D4** for a finished run; at
      **M4** and **M6** the reappearing
      object is one a pre-removal crash already leaves, on the same shelf, on the
      same terms — reached on the withheld shelf by the pending-review banner, and
      on the `redacted/` shelf by nothing user-facing and **by no schedule**
      (round 1's finding; Table N makes it ELIGIBLE for a future qualifying prune
      and nothing more, so it may persist — owner item **O10**). A reader who can
      open that directory is `docs/THREAT-MODEL.md`'s class **A12**, outside the
      boundary.
- [ ] **Three residuals, all named, and one thing that is NOT a residual.** The
      residuals: the pre-removal crash class itself, accepted and unchanged from
      today; row **M5**'s selection window, owner item **O9**, routed to a filed
      stub; and the indefinite, unbannered, unrecorded persistence of a
      `redacted/` copy, owner item **O10** — the shelf's own retention contract,
      not something this disposition creates. **Not a residual:** rows **M2** and
      **M3**, which are decided **(b), close it** and moved to a successor rather
      than accepted (owner item **O11**).

## Acceptance criteria

- [ ] **1.** `docs/specs/done/WP-quarantine-preserve-durability.md` carries the
      dated clause of **Table F row F7(a)** exactly once (V1).
- [ ] **2.** That file differs from `origin/main` in **exactly three lines**, and
      each is its BASE line plus exactly one intended edit — one is the base row
      plus this spec's clause and one following space, two are the base line with
      the moved spec path substituted — so nothing else on any of them moved, and
      nothing else in the file moved (V2). `node scripts/mirror-walk.js` names no
      unresolved entry that this branch introduced.
- [ ] **3.** This spec's `status:` is `Superseded` and its file is under
      `docs/specs/done/`, per `docs/specs/README.md`; and both successors exist —
      `docs/specs/WP-quarantine-only-copy-shelf.md` (owner item **O9**) and
      `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (owner item
      **O11**) — so neither routes to a name (V3).
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
**AMENDED 2026-09-06 — the exclusion is PART permanent and PART superseded, and the split is PER REMOVAL ACT.**
LITERAL
test -f docs/specs/done/WP-quarantine-preserve-durability.md
test "$(grep -F -c -f /tmp/f7a-key.txt docs/specs/done/WP-quarantine-preserve-durability.md)" = 1

# V2 — that file differs from origin/main in EXACTLY THREE lines, and each is its
#      BASE line plus exactly one intended edit: ONE line is the base row plus
#      this spec's clause and one following space, and TWO are the base line with
#      the moved spec path substituted and nothing else. The reconstruction is
#      what sees an edit ELSEWHERE ON THE SAME LINE, which no count can. (A
#      `--numstat` deletions-are-zero gate is NOT usable here and was measured
#      unsatisfiable: an edit INSIDE an existing line is one deletion plus one
#      addition, so that check can never pass for this act.) The clause is
#      EXTRACTED FROM THIS SPEC by its f7a-clause markers, so the gate compares
#      against what the spec decides and never against a retyping; the paths pass
#      through the ENVIRONMENT and nothing is interpolated into the program text.
SPEC=docs/specs/done/WP-quarantine-disposal-durability.md \
AMENDED=docs/specs/done/WP-quarantine-preserve-durability.md \
BASE=origin/main \
node -e '
const fs = require("fs"), cp = require("child_process");
const OLDP = "`docs/specs/WP-quarantine-disposal-durability.md`";
const NEWP = "`docs/specs/done/WP-quarantine-disposal-durability.md`";
const spec = fs.readFileSync(process.env.SPEC, "utf8");
const RE = /<!-- f7a-clause:begin -->\n([\s\S]*?)\n<!-- f7a-clause:end -->/;
const found = spec.match(new RegExp(RE.source, "g")) || [];
if (found.length !== 1) { console.error("f7a-clause blocks: " + found.length + " (want 1)"); process.exit(1); }
const clause = RE.exec(spec)[1];
const now = fs.readFileSync(process.env.AMENDED, "utf8").split("\n");
const base = cp.execFileSync("git", ["show", process.env.BASE + ":" + process.env.AMENDED], { encoding: "utf8", maxBuffer: 1e8 }).split("\n");
if (now.length !== base.length) { console.error("line count moved: " + base.length + " -> " + now.length); process.exit(1); }
const moved = [];
for (let i = 0; i < now.length; i += 1) if (now[i] !== base[i]) moved.push(i);
if (moved.length !== 3) { console.error("lines changed: " + JSON.stringify(moved.map((i) => i + 1)) + " (want exactly 3)"); process.exit(1); }
let clauseLines = 0, pathLines = 0;
for (const i of moved) {
  const isClause = now[i].split(clause).length - 1 === 1 && now[i].replace(clause + " ", "") === base[i];
  const isPath = base[i].split(OLDP).length - 1 === 1 && now[i] === base[i].split(OLDP).join(NEWP);
  if (isClause) clauseLines += 1;
  else if (isPath) pathLines += 1;
  else { console.error("line " + (i + 1) + " is NOT its base line plus exactly one intended edit"); process.exit(1); }
}
if (clauseLines !== 1 || pathLines !== 2) { console.error("edit kinds: " + clauseLines + " clause, " + pathLines + " path (want 1 and 2)"); process.exit(1); }
console.log("V2 OK: lines " + moved.map((i) => i + 1).join(", ") + " — one base row plus the clause, two base lines plus the moved path");
'
# V3 — the terminal status and the filing location (docs/specs/README.md).
#      The absence half is `test ! -e`, where the `!` is test's OWN operand and
#      never a shell `! test -f`, which errexit would exempt. The last line is
#      round 1's finding R1-C, folded INTO this step rather than added as a fifth
#      one: the round rule freezes the verification surface, and a routing that
#      names a file is a record property, not a product behaviour. Round 2 added
#      the second successor to the SAME step for the same reason — the surface
#      did not grow, the step's target did.
test -f docs/specs/done/WP-quarantine-disposal-durability.md
test ! -e docs/specs/WP-quarantine-disposal-durability.md
grep -qx 'status: Superseded' docs/specs/done/WP-quarantine-disposal-durability.md
test -f docs/specs/WP-quarantine-only-copy-shelf.md
test -f docs/specs/WP-quarantine-failed-preserve-disposal-flush.md

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
- **Specifying the flush rows M2 and M3 need.** Owner item **O11** decides THAT
  they are closed and prices how; the contract, the disposition of a flush that
  does not complete and the acceptance criteria are
  `WP-quarantine-failed-preserve-disposal-flush`'s, and that package has its own
  design gate to run.
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
3. Owner items **O8**, **O9**, **O10** and **O11** are recorded, citation-only, in
   `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`, with
   their text and their overrule costs left in this file's
   `## Dispatch precondition — owner items`, which governs.
4. The measurements are in
   `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`
   under the probe ids Table M cites, that record states the STOP CRITERION
   pinned before any external round, and it carries the Round 1 section with each
   raw file's path and the SHA of the commit that introduced it.
5. Both successor stubs exist as `Draft` specs —
   `docs/specs/WP-quarantine-only-copy-shelf.md` (**O9**) and
   `docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (**O11**) — so
   neither routing names a proposal.
6. Both review gates have run on this diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
