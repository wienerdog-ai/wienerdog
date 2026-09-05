---
id: WP-quarantine-preserve-durability
title: Make a preserved quarantine artifact durable, and say honestly what that guarantees
status: Draft
model: sonnet
size: M
depends_on: [WP-preservation-abort-widening, WP-quarantine-banner-location]
adrs: [ADR-0004, ADR-0031, ADR-0034, ADR-0042]
epic: dream-promotion
---

# WP-quarantine-preserve-durability: Make a preserved quarantine artifact durable, and say honestly what that guarantees

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Dispatch precondition (SIX owner items; accepting all six recommendations changes no Deliverables row)

**Every item below carries a recommendation and the cost of overruling it.**
The owner's standing instruction of 2026-09-05 —
`docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md`, *"let us go with
your recommendations"* — is what lets a dispatcher proceed under these
recommendations; it is not a reason to skip stating them, and a dispatcher who
records none of the six has not run this gate. **Accepting all six changes no
Deliverables row.**

**Item 1 — the platform scope, and it is the only one that changes what a user
on some machine gets.** Everything this package measures was measured on darwin:
a directory can be opened and flushed there, and so can a file. **Nothing here
was measured on win32, and nothing here claims what win32 does** — the pipeline
has no Windows host. Without a directory flush an artifact's bytes can be durable
under a name that is not, so a half-protocol is worse than a stated absence.
**Recommendation: the FLUSHES are POSIX-only. On win32 the protocol
issues no flush at all and claims no durability**, which is exactly today's
behaviour there, and the platform is branched on EXPLICITLY (Table F row **F5**)
rather than hidden behind a swallowed error. **The reopen and row F8's identity
check are not gated on the platform** — they are properties of the verification,
they add no failure mode win32 does not already have, and where a platform does
not distinguish inodes the check degenerates to no check, which is no worse than
the shipped pathname read-back. This is the repo's own
owner-approved win32 posture, not a new one: `src/core/private-fs.js` carries
*"win32 posture (OWNER-APPROVED 2026-07-17): POSIX modes do not exist there — chmod
is a best-effort no-op, the scan reports `{insecure: 0}`"*, and its
`scanPrivateModes` is documented `win32 → {insecure: 0} (POSIX-only guarantee,
owner-approved)`. **Cost of overruling:** requiring the flush on win32 makes an
unmeasured Node behaviour load-bearing on a platform nothing in this pipeline can
test, and it is fail-closed — if `fs.fsyncSync` on a file descriptor does not
behave there as it does here, EVERY dream run that withholds a note aborts on
Windows. It is one line of `src/core/dream/validate.js` and one sentence of the
guarantee, so the change is small; what it needs first is a measurement on a
Windows host, which is why the recommendation is to ship the scoped guarantee and
let a later package widen it with evidence.

**Item 2 — a new way for a dream run to fail loud.** After this package a flush
that does not complete is a preservation FAILURE (Table F row **F4**), and a
preservation failure on the withhold arm reaches the shipped only-copy abort. A
run that today completes and reports a preserved copy will, on a filesystem where
the flush errors, abort instead. **Recommendation: confirm**, on the owner's own
2026-09-02 reasoning for this same abort — `2026-09-02-owner-rulings-stub-queue.md`
item 2, *"fail-loud confirmed"*. Reporting a copy the product never flushed is the
same false statement `WP-preservation-abort-widening` removed when it stopped a
preservation reporting success over bytes it never verified, and the abort is the
cheap side of the trade: it retains the workspace, so the note stays exactly where
it is. **This package adds no new abort, no new message and no new field** — it
adds one more way to reach `quarantinePreserve` returning `null`, which Table P
row **P0** already carries. **Cost of overruling:** the alternative — report
success and note somewhere that the flush failed — has no carrier. The
preservation record's fields are fixed by `WP-dream-promote-module` Table Q row
Q9, whose rule is that a new fact about a preserved copy becomes a field on that
row, decided in that spec; adding one here would be exactly the second-carrier
move Q9 forbids.

**Item 3 — the per-record delivery stamp, routed here by
`WP-quarantine-banner-location`.** That package's Out of scope registers it:
*"whether a per-record delivery stamp on the transcript ledger is worth carrying
so a surface can tell a record whose run delivered from one whose run did not"*,
its third owner item having been ruled an accepted residual on 2026-09-05.
**Recommendation: DECLINE it, and file no successor for it.** Three reasons, and
the third is the one that decides it. (a) The class it would serve **cannot
grow**: every run after `WP-quarantine-banner-location` closes the window behind
it, so the set of unstamped-and-unsound records is fixed and shrinking. (b) Its
cost is one fruitless look, not bytes — that package measured it. (c) **A stamp
added later does not actually separate the classes.** Records written between
`WP-quarantine-banner-location` landing and a stamp landing are SOUND and
UNSTAMPED, so a surface that hedges for unstamped records would hedge for them
too — the stamp only works if it also carries a schema version that says "written
after the window closed", which is more durable state, on the ledger, for a set
that is already closed. **Cost of overruling:** a separate package
(`WP-ledger-delivery-stamp`) owning the transcript ledger's record schema and its
migration, plus a second rendered form of the pointer sentence in all four of
that package's carriers. It is not a Deliverables row here either way: this
package touches `src/core/dream/ledger.js` in neither case.

**Round 1 added no owner item, and that was a recorded check, not an omission:**
its four findings were adjudicated against escalation (ii) and none adds durable
state beyond the artifact, changes a shipped `best-effort` removal posture, changes
an owner-ruled value, or needs a Windows measurement. **Round 2 added ONE — item 5
below** — because the answer to its finding family is a boundary statement about
the threat model, which is the owner's document.

**Item 4 — THE SPLIT, and it is a re-cut of the stub the owner sequenced.** The
Draft stub put a directory sync after an unlink — *"so a disposed artifact cannot
reappear"* — inside this package's canonical table. It is not here. **Recommendation:
confirm the split**; `docs/specs/WP-quarantine-disposal-durability.md` is filed as
`Draft` and `depends_on` this package. The reason is not size alone: the two
halves enforce **different invariants with different dispositions**. This half
enforces `WP-dream-promote-module` Table Q row **Q4** — bytes must not be lost —
and its failure disposition is already ruled (item 2). The disposal half prevents
a secret-bearing artifact REAPPEARING, its three call sites are two shipped
`best-effort` contracts (`pruneRedactedOriginals`, the identity-gated delete) plus
one fail-loud one (Table D row D3), and a flush that fails there cannot take
"preservation failure" — the preservation has already failed — so it needs a fresh
disposition the owner has not been asked for. **Cost of overruling:** folding it
back adds three call sites, one new failure disposition, at least two more Table C
identities and their mutations, and a change to two shipped best-effort postures —
which is a contract change, and the runbook's *diff size does not measure contract
impact* rule makes a contract change the owner's act rather than a fold-in.

**Item 5 — WHERE THE ADVERSARY IS PINNED, and it is a threat-model statement, not
an implementation detail.** Two consecutive review rounds landed four findings in
one family: a same-UID process substituting an object this protocol depends on. The
pinned circuit-breaker (ADR-0031) makes the answer a CONTRACT rather than a third
pin, and Table F row **F10** is that contract: F8 and F9 defend against
**overlapping runs** (a lock stolen after its deadline; two same-day runs selecting
the same free name) and **the user's own hand** on the shelf, and **arbitrary
same-user native code is a NAMED RESIDUAL** citing `docs/THREAT-MODEL.md`'s class
**A12**, which states in its own words that Wienerdog is *"not a boundary against
arbitrary software already running as the same user"*.

**Recommendation: pin at A12, and cite the threat model.** The reason is decisive
rather than economic: **a process that can swap `qdir` aside during its flush can
also delete the preserved copy one instruction after this function returns**, so no
durability protocol can hold against it — and the threat model already says, of a
keyed MAC proposed for the same class, that it *"would only imply a false
guarantee"*. **Cost of overruling:** descriptor retention for every directory in
the chain, held open to the last gate, with a bigint `(dev, ino)` re-compare per
position; the no-clobber commit (already taken); and a race test per substitution
point — a permanent maintenance surface that still cannot stop a delete-after-
success, and which would move this package's claim from *what a success means* to
*what it prevents*, which is the over-claim the whole package is written against.
**It is not a Deliverables change either way:** the pins would live in
`src/core/dream/validate.js`, which is already the boundary's first row.

**Item 6 — WHETHER THIS CALL REMOVES BY PATHNAME AT ALL, which is the only way to
close row F10's destructive residual class.** Five consecutive rounds found windows
in the "user's own hand" class; the ones that remain are all the same shape.
**`quarantinePreserve` makes exactly three pathname removals** — `tmp` after a
successful commit, `tmp` on a write/commit failure, and `dest` on the failure path —
and **each is preceded by a separable ownership check that Node cannot fuse with the
act**, because there is no `unlinkat` and `rmSync`/`unlinkSync` take a name. A
substitution landing between the check and the act is deleted. On the first of the
three the run then reports **SUCCESS**, so that damage is silent.

**Recommendation: keep all three removals, disclose all three windows — and the
re-pricing over the full set makes the case STRONGER than it was at round 4, not
weaker.** Taking each in turn: **(i)** never removing `tmp` after a successful
commit leaves a second link to the artifact's inode at a **deterministic, pid-derived
name**, so the next invocation that reuses that pid and stem hits `EEXIST` on its
exclusive create and **fails a preservation that should have succeeded** — a
functional regression, not a hygiene one. **(ii)** and **(iii)** never removing on a
failure leaves this invocation's own secret-bearing bytes under a name no
preservation record, no cleanup pass and no abort message reaches, which is
`WP-preservation-abort-widening` Table D row **D3**'s stated hazard in its own words
and contradicts row **D2**. **And the trade still runs the wrong way:** every window
needs an adversary acting inside a microsecond gap during a locked run, while
"never remove" would leave an artifact behind on EVERY failed preservation and break
future ones. **Cost of overruling:** amending two canonical rows of a `Done` spec
whose disposal contract the owner ruled on 2026-09-02; a new retained-artifact state
with its own lifecycle, naming and disclosure; a cleanup pass that does not exist;
and, for (i), a collision-recovery path for a temp name that is never freed. **It is
not a Deliverables change either way** — the removals are three gated lines in
`src/core/dream/validate.js`.

**Do not dispatch until all SIX are answered** (the standing instruction answers
them by adopting the recommendations; record that it did). Overruling item 1
changes one constant and one sentence; item 2 has no honest alternative
implementation and would send the package back to design; item 3 opens a new
package and changes nothing here; item 4 re-widens this package and re-sizes it;
item 5 adds the pinning machinery priced above and rewrites rows F8 and F10; item 6
removes three gated lines and opens an amendment to two `Done`-spec rows.
**None of the six changes any path in the Deliverables table.**

## Context (read this, nothing else)

The nightly **dream** consolidates recent sessions into the user's **vault**. It
does not let the model write into the vault: the run clones the vault into a
throwaway **workspace**, the model writes there, and only content that passes four
gates is promoted into the real vault. **ADR-0004: Wienerdog is just files** —
nothing here starts a process that outlives its call, and every step this package
adds is a synchronous call that has returned before the function containing it
does.

One of the four gates is the **EP2 secret gate** (ADR-0034). On a refusing or
redacting verdict it **preserves** first — it copies the exact bytes it is judging
into the core's quarantine tree before refusing — because under promotion those
bytes were never in the vault and the workspace is destroyed minutes later, so the
preserved copy is the user's only route back to them. Both shelves,
`state/quarantine/` and `state/quarantine/redacted/`, live under the **core**
(`$WIENERDOG_HOME || ~/.wienerdog`, `src/core/paths.js`, `getPaths`), never in the
vault.

`docs/specs/done/WP-dream-promote-module.md` Table Q row **Q4** — the only-copy
invariant — requires that *"nothing may destroy the working copy of a note unless
some **durable** artifact byte-identically holds THE BYTES THAT ARE THERE NOW."*
That row is a pointer: it states the invariant and says the shipped enforcement is
decided in `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` (rows **B3b** and
**Q18**) and *"is restated NOWHERE here"*.

**Q4 has two conjuncts and only one of them is enforced today.**
`WP-preservation-abort-widening` established the **byte-identity** conjunct: a
preservation succeeds only if the artifact is read back and byte-compared, and a
rejected artifact is disposed of under an ownership contract (its Table P row
**P0b**, its Table D). It deliberately did **not** establish the **durable**
conjunct, and said so in its own words under Table D: *"the product contains no
`fsync` today … so the crash window is pre-existing and unchanged"*. **This package
is that conjunct**, and it is a REPAIR of a gap Q4 has carried since it shipped.

**One thing this package must not do is over-claim what it fixes.** A flush is not
a promise about a disk. Node documents no device-level guarantee for `fs.fsync`,
and — measured, below — the product cannot even ask for one or observe what it
got. So the contract is *durability to the extent the platform's flush provides*,
stated in one spec-owned sentence, and everything else this package says is scoped
to it.

**Do not re-litigate the abort trigger.** The trigger class, the message taxonomy
and the artifact-ownership contract are `WP-preservation-abort-widening`'s **Table
P** and **Table D**. This package cites them and restates neither: it adds one new
way to reach a preservation failure and changes nothing about what happens next.

## Current state

Every claim below was measured in this tree at `38562ec4` on 2026-09-05
(`origin/main` after PRs #218/#219, which merged `WP-quarantine-banner-location`
and moved its spec to `docs/specs/done/`). **The branch was rebased onto that
commit during the round-2 pass**, so `git diff --stat 38562ec4 HEAD -- src tests
scripts` is empty and no measurement here is owed a re-run for the base.

**Baselines.** `npm test` → `tests 2623 / pass 2611 / fail 0 / skipped 12`, exit
0. `npm run lint` → `Linting: 637 file(s)`, `0 error(s)`, `frontmatter check
passed: 267 spec(s), 4 agent(s)`, exit 0. `npm run red-proofs` on a pristine
`git archive` copy with a real `node_modules` → `11 declared proof(s), 11
selected`, nine `PROVEN` criteria roll-up lines, `RUN: PROVEN`, exit 0.

**There is no flush anywhere in the product.** `grep -rn 'fsync\|fdatasync\|F_FULLFSYNC'
src/ tests/ scripts/` returns **nothing**, exit 1. The same grep returned nothing
at `fc506110` when `WP-preservation-abort-widening` recorded it; it still does.

**The seam is ONE function, and it is not the one the Draft stub named.**
`quarantinePreserve` (`src/core/dream/validate.js`) has exactly two call sites,
both inside the EP2 gate in the same file — the redact arm's `'redacted'` preserve
and the withhold arm's `'withheld'` preserve. Its write path, in order:

```text
fs.mkdirSync(qdir, { recursive: true, mode: 0o700 })   qdir = quarantine/ or quarantine/redacted/
fs.chmodSync(qdir, 0o700)
  … the collision loop picks `dest` by `fs.existsSync(dest)` — NOT atomic with the commit
fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' })   EXCLUSIVE create (Table D row D1)
fs.chmodSync(tmp, 0o600)
fs.renameSync(tmp, dest)   REPLACES whatever is at `dest` — the ownership gap row F9 closes
fs.readFileSync(dest)  → Buffer.compare  → success, or removeOwnedQuarantinePath(dest) and null
```

**The stub's pointer at `src/core/private-fs.js` is wrong and is corrected here
rather than dropped.** The stub said the preservation writes go through
`writeFilePrivate`'s temp+rename shape. They do not: `src/core/dream/validate.js`
does not require `private-fs` at all (`grep -n 'writeFilePrivate\|private-fs'`
over that file returns nothing, exit 1), and `quarantinePreserve` writes with
`fs.writeFileSync` directly. `writeFilePrivate` is a different primitive with its
own `openSync`/`writeSync`/`renameSync` shape and, as it happens, no flush either —
but nothing in the preservation path calls it, so it is out of this package
entirely.

**Driven, not argued: a preservation issues ZERO flushes today.** Driving
`makeGates({ stateDir }).secret(…)` directly with a hard-secret finding, with
`fs.fsyncSync` and `fs.openSync` instrumented so every flush is resolved to the
path its descriptor names:

```text
ARM = hard (the withhold arm)
VERDICT = {"refuse":true,"preserved":[{"artifact":"2026-09-05-fp.md","location":"quarantine"}]}
mkdirSync    <T>/state/quarantine        returned="<T>/state/quarantine"
writeFileSync <T>/state/quarantine/.tmp-96183-fp.md
renameSync   <T>/state/quarantine/.tmp-96183-fp.md
readFileSync <T>/state/quarantine/2026-09-05-fp.md
--- fsync count = 0
```

A `{refuse:true}` verdict, a verified artifact on the record, and not one byte or
directory entry flushed. The redact arm is the same, one level down.

**The recursively created directories are real, and so are ancestors this call
did NOT create.** On the redact arm with a fresh state directory the trace shows
`mkdirSync <T>/state/quarantine/redacted returned="<T>/state/quarantine"` — Node's
`fs.mkdirSync(p, {recursive:true})` returns the topmost directory it created and
`undefined` when it created none (measured three ways on Node v25.9.0). **That
return value is NOT what Table F row F3 uses, and the reason is measured:**
`acquireLock(stateDir)` calls `fs.mkdirSync(stateDir, {recursive: true})`
(`src/core/dream/lock.js`) at the START of the same run, so on a first run `state/`
is created by an earlier step and `mkdirSync(qdir, …)` reports only `quarantine/`.
Driven with `acquireLock` first, a created-set derivation issues **three** flushes
and stops at `state/`, leaving the core directory that holds `state/`'s brand-new
entry unflushed; the fixed chain issues **four** and ends at the core. Five call
sites create `stateDir` lazily this way (`lock.js`, `ledger.js`,
`skill-registry.js`, `identity-approvals.js`, and `alerts.js` via `mkdirPrivate`),
so this is the ordinary path, not a corner.

**And `path.dirname(stateDir)` IS the core directory** — `src/core/paths.js`
builds `state: path.join(core, 'state')`, so row F3's anchor needs no new input to
`quarantinePreserve`.

**Two measurements decide the SHAPE of the fix, and both were run rather than
reasoned about.** On Node v25.9.0, darwin: **(1)** a descriptor opened on `tmp`
keeps its inode across `fs.linkSync(tmp, dest)`, and `dest` names that inode
(`nlink` 2, then 1 after `tmp` is unlinked); reads and `fsync` through that
descriptor keep working afterwards, and a substitution at `dest` leaves the
descriptor untouched while `lstat(dest)` stops matching it. **(2)**
`fs.readFileSync(fd)` immediately after `fs.writeFileSync(fd)` returns **empty** —
the position sits at EOF. **(1)** is why the artifact is an inode this call HOLDS
rather than a name it looks up; **(2)** is why both the write and the read-back use
EXPLICIT positions rather than the descriptor's own offset. **Neither is a reason to
keep a pathname write** — round 4 moved the write onto the exclusive-create
descriptor, and the measured cost of doing so is in the blast-radius paragraph
above.

**What the product can and cannot observe about a flush — the whole basis of the
honest guarantee sentence, measured.** On Node v25.9.0, darwin:

```text
fs.constants.F_FULLFSYNC   → undefined     (the strong barrier cannot be REQUESTED)
fs.fsyncSync(fd)           → undefined     (and nothing about what it did is RETURNED)
fs.openSync(dir, 'r')      → a number      (a directory CAN be opened and flushed here)
fs.constants.O_DIRECTORY   → number        O_NOFOLLOW → number
fs.writeFileSync(...)      → undefined     (it hands back no descriptor at all)
```

That last line is a fact about the SHIPPED call, and it is why row **F8**'s create
is `fs.openSync` rather than a write followed by an open: a call that returns no
descriptor cannot establish provenance.

**The stub's third claim, measured rather than inherited.** The stub said
Node/libuv falls back `F_FULLFSYNC` → `F_BARRIERFSYNC` → `fsync` silently. That is
upstream implementation detail this package cannot run, so it is **not asserted
anywhere in this spec**. What it was cited FOR — that the product cannot know what
the flush actually did — is established by the two measurements above, and the
guarantee sentence rests on those.

**The Draft stub's canonical table was called Table D, and that name is taken.**
`WP-preservation-abort-widening`'s **Table D** owns artifact ownership and
disposal, and this package cites it constantly. A second Table D in the same
family is the row-id collision `WP-quarantine-banner-location` had to write a
paragraph about for the two Table Qs. This package's canonical table is therefore
**Table F**, and every citation of "Table D" in this spec means the predecessor's.

**Two registered mirrors go false, and they are the whole of the doc surface.**
`WP-preservation-abort-widening`'s Table P row **P0b** ends *"This row establishes
byte-identity, NOT durability — see 'What this WP does not make durable' below
Table D"*, and that paragraph says the product has no `fsync` and that the whole
of the remaining gap is this package. Both halves move: the durable conjunct is
enforced, and the removals the paragraph also names are re-routed to
`WP-quarantine-disposal-durability`. `WP-secret-fence-ep2-redact-arm`'s row **B3b**
carries the 2026-09-02 clause *"The DURABLE conjunct is PRESERVED AS WRITTEN AND
EXPLICITLY DEFERRED: it has never been enforced — the product has no `fsync` … and
until that lands this row states a standing obligation rather than shipped
behaviour"* — a present-tense claim that this package falsifies. Rows **P0** and
**Q18** are checked and left alone: P0 says the durability conjunct *"is not
decided here"*, which stays true of that package, and Q18's own 2026-09-02 clause
is about the message taxonomy and is untouched.

**One in-file mirror goes false too.** The EP2 gate's `@throws` JSDoc says
*"only byte-identity is established (P0b); the durable conjunct stays deferred to
`WP-quarantine-preserve-durability`."*

**The blast radius on the existing suite is THIRTEEN TESTS, all of them injection
points, none of them an assertion, and EVERY ONE LOUD — measured, not hoped.** The
candidate fix this spec specifies, applied to a `git archive` scratch copy of
`38562ec4`, gives `npm test` → `tests 2623 / pass 2598 / fail 13`. They are the four
read-back injections (`patchFs('readFileSync')` on a pathname), the one commit
injection (`patchFs('renameSync')`), and **eight that inject a pathname WRITE**
(`patchFs('writeFileSync')`) — the D1 write-failure and post-create-failure tests,
the two ENOSPC aborts, and the redact-arm R0/R0b/R1 and corrupted-redacted tests.
All thirteen live in `tests/unit/dream-validate.test.js`, which is in the boundary.
**With the injection points migrated onto three seams — the exclusive CREATE, the
descriptor WRITE, and the descriptor READ matched by inode — and no assertion
touched, the suite returns to `2623 / 2611 / 0 / 12`, exit 0**; Table C's identities
take it to `2629 / 2617 / 0 / 12`. Also measured. If a fourteenth breaks, something
outside Table F moved and it is a finding, not a fixture to update.

**Two shipped `renameSync` injections do NOT break, and each for a reason worth
recording.** `(Table D row D1, herdr-shadow round 1 P1): a FOREIGN file already at
the tmp pathname` never reaches its rename injection — the exclusive create refuses
first, which is the property that test was written for. `(Table D row D3): a tmp that
cannot be removed after a failed rename fails LOUD` passes for a DIFFERENT but
equivalent reason under row F9: the commit succeeds, the post-commit gated temp
removal then hits its `rmSync` injection, and the same `WienerdogError` matching
`/\.tmp-/` is raised.

**AN UNMEASURED CLAIM THAT SURVIVED FOUR ROUNDS, corrected here by running it.**
Round zero recorded, and rounds 1–3 repeated, that moving the WRITE onto a
descriptor would *silently* stop the seven `patchFs('writeFileSync')` injections
intercepting while the suite stayed green — the failure mode that hides. **That was
never run, and it is false.** Measured: those tests assert a preservation FAILURE,
so an injection that stops firing makes them fail loudly, along with six others. The
cost of never having run it was three rounds of designing around a hazard that did
not exist — and the design it forced (a pathname write plus a separate identity
open) is exactly what round 4's create→open adoption finding then attacked.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | **all of Table F.** The byte-exact source forms under Implementation notes; the guarantee sentence; `quarantinePreserve`'s JSDoc; and the gate's `@throws` block, whose *"the durable conjunct stays deferred to `WP-quarantine-preserve-durability`"* this package makes false |
| modify | tests/unit/dream-validate.test.js | Table C's identities, AND the shipped injections rows **F8** and **F9** force to move (Implementation notes names them). **No existing ASSERTION changes** — only the seam each injection intercepts at, plus one test TITLE. Measured: the src fix alone gives `2623 / 2598 / 13`, the migration returns it to `2623 / 2611 / 0`, and the identities take it to `2629 / 2617 / 0 / 12` |
| create | tests/red-proofs/quarantine-preserve-durability.proofs.json | **Table C's declarations, inlined there in full** — copy the object; the count is the table's and is deliberately not repeated here |
| modify | docs/specs/done/WP-preservation-abort-widening.md | row **P0b** only, its byte-exact clause appended to **cell 5**. Nothing else in the file — no other row, no assertion, no paragraph |
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | row **B3b** only, its byte-exact clause appended to **cell 2**. Nothing else in the file |

**Explicitly NOT in the boundary**, each for a stated reason:

- `src/core/private-fs.js` — the preservation path does not call it (Current
  state). Its own writers' durability is nobody's package yet and is not this one's.
- `src/core/dream/promote.js`, `src/cli/dream.js` — this package changes no
  verdict, no record field, no message and no ordering. `promote()` and the
  pipeline see exactly what they see today, except that one more class of
  preservation returns `null`.
- `src/core/dream/ledger.js` and the four pointer-sentence carriers —
  `WP-quarantine-banner-location`'s, shipped. Item 3 of the Dispatch precondition
  declines the one thing that would have brought them back.
- `pruneRedactedOriginals`' evictions, `removeOwnedQuarantinePath`'s removals and
  the identity-gated delete — all three are in `src/core/dream/validate.js`, which
  IS in the boundary, so this must be read as a rule and not as a file list:
  **no removal in this file gains a flush in this package**, including the one row
  F4 performs. They are `WP-quarantine-disposal-durability` (Draft), and Table F
  row **F7(a)** says so.
- `docs/specs/done/WP-dream-promote-module.md` row **Q4** — a pure pointer at the
  enforcement, which lives in the two rows this package does amend. Nothing in it
  becomes false.
- Row **P0** of `WP-preservation-abort-widening` and row **Q18** of
  `WP-secret-fence-ep2-redact-arm` — both re-read whole and both still true
  (Current state).

### Exact contracts

`quarantinePreserve`'s **signature, return type and every existing meaning are
unchanged**:

```js
/** @returns {{name:string, bytes:Buffer}|null} the destination BASENAME actually
 *  written TOGETHER WITH THE VERIFIED BYTES READ BACK FROM IT, or `null` when the
 *  write, the rename, the verification, the flush — or now the identity check —
 *  failed. */
function quarantinePreserve(stateDir, content, rel, date, kind = 'withheld')
```

What changes is **when it may return non-`null`**: after this package it may do so
only once Table F's flushes have completed AND row **F8**'s identity check has
passed. `null` keeps every meaning it has — including
`WP-preservation-abort-widening` Table D row **D4**'s *"`null` means the owned path
is absent"*, which the flush-failure path satisfies by taking row **D2**'s existing
removal of `dest`. **Row F8's mismatch arm satisfies D4 differently and the
difference is stated rather than glossed:** it removes nothing, because the path no
longer names this invocation's artifact at all — the inode it owns has already been
unlinked by the replacement's own rename, and closing the descriptor releases it.
The owned path is absent in the sense D4 exists for; what sits at the name is
someone else's file, and Table D row D1's ownership rule forbids touching it.

**Nothing else in this package has a shape.** No new export, no new parameter, no
new field on the preservation record, no new message, no new verdict arm, no new
gating condition, and no change to the collision loop, the exclusive create or the
`chmod`s. **Two shipped calls change and both are named rows:** the read-back keeps
its meaning and changes only what it is bound to (row **F8**: the descriptor this
invocation holds, opened on `tmp` before the commit), and the commit keeps its
post-condition — one artifact at `dest`, holding the judged bytes — and changes only
how it refuses a name it did not create (row **F9**). ADR-0004: every step added is
a synchronous `openSync` / `readFileSync` / `fsyncSync` / `fstatSync` / `lstatSync` /
`linkSync` / `closeSync` call that has returned before `quarantinePreserve` does.

**THE SEQUENCE, because round 3's finding was in the ORDER and not in any
predicate.** Every pathname act after the write is gated on the identity the
descriptor carries:

```text
  fd = openSync(tmp, O_RDWR|O_CREAT|O_EXCL|O_NOFOLLOW, 0o600)   F8: PROVENANCE IS THE CREATE
  writeAllAt(fd, content)                                       explicit position
  fchmodSync(fd, 0o600)                                         through the descriptor
  linkSync(tmp, dest)                                           F9: no-clobber commit
   ── on any throw above ──
     ownedTmp = fd >= 0 && ownsName(tmp, fd)                    F8; no descriptor means
     close fd; if (ownedTmp) remove tmp; return null            nothing was created
  if (ownsName(tmp, fd)) removeOwnedQuarantinePath(tmp)         F9/F8: GATED
  readAllAt(fd, content.length) → Buffer.compare                through the HELD descriptor
    && flushPreservation(fd, …)                                 F1-F3, F6
    && ownsName(dest, fd)                                       F8: the last gate
  success → close fd, return {name, bytes}
  failure → owned = ownsName(dest, fd); close fd; if (owned) remove dest; return null
```

**What that ordering buys, and where it stops.** The shipped shape looked the
artifact up by pathname twice — once to write it, once to read it back — so a
substitution at either point was adopted, and the failure path then deleted whatever
it found. **Creating the descriptor and never looking the artifact up again removes
both lookups**: there is nothing left to race between the create and the last gate.
Measured — the descriptor's inode survives `linkSync` unchanged and `dest` names it
(`nlink` 2 → 1 after the gated temp removal), so the bytes written, compared and
flushed are one inode this invocation made. **What it does NOT buy is stated in row
F10 rather than implied here:** three residuals remain against a user editing the
shelf mid-run, one of which deletes a replacement, and none of them is a lookup this
ordering could remove — the last one is a check and an unlink on the same NAME, which
Node cannot fuse.

**The observable difference, measured by driving `makeGates({stateDir}).secret(…)`
on the rehearsal tree rather than predicted** — every flush resolved through its
descriptor to the path it names. The tree is `<T>/.wienerdog/state`, so
`<T>/.wienerdog` is the anchor:

```text
                                          hard (withheld)   soft (redact)
  quarantine/ and redacted/ ALREADY EXIST      4 flushes        5 flushes
  NOTHING under the core exists yet            4 flushes        5 flushes
  state/ created by acquireLock this run       4 flushes        5 flushes

ARM = hard — IDENTICAL IN ALL THREE STATES, which is what "fixed chain" means:
  fsync <T>/.wienerdog/state/quarantine/2026-09-05-fp.md
  fsync <T>/.wienerdog/state/quarantine
  fsync <T>/.wienerdog/state
  fsync <T>/.wienerdog

ARM = soft — IDENTICAL IN ALL THREE STATES:
  fsync <T>/.wienerdog/state/quarantine/redacted/2026-09-05-fp.md
  fsync <T>/.wienerdog/state/quarantine/redacted
  fsync <T>/.wienerdog/state/quarantine
  fsync <T>/.wienerdog/state
  fsync <T>/.wienerdog

ARM = hard, a DIRECTORY flush made to fail
  THREW   = the secret check stopped before changing "04-Atomic/fp.md": the withheld copy
            could not be saved; no redaction copy was attempted, …
  RM      = ["<T>/state/quarantine/2026-09-05-fp.md"]

ARM = soft, a DIRECTORY flush made to fail on BOTH shelves
  THREW   = … neither the redaction copy nor the withheld copy could be saved, …
  RM      = ["<T>/state/quarantine/redacted/2026-09-05-fp.md",
             "<T>/state/quarantine/2026-09-05-fp.md"]
```

The two abort messages are `WP-preservation-abort-widening` Table P's **P1/P2**
and **P3** values, unchanged and unedited — which is the whole point of item 2:
the new failure class reaches an abort that already exists.

**And the same driver on the round-zero created-set design, in the third state,
is what settled row F3** — `acquireLock(stateDir)` first, then the preservation:

```text
created-set derivation   3 flushes, stopping at  <T>/.wienerdog/state
fixed chain (specified)  4 flushes, ending at    <T>/.wienerdog
```

The core directory — the one holding the `state/` entry `acquireLock` had just
created — is flushed by one design and not by the other.

## Contract reference

Activation trigger (ADR-0031, 2-of-7): **(iv)** an error/failure disposition is
introduced — a flush that does not complete becomes a preservation failure;
**(v)** the gate performs the flush, `promote()` refuses on the record and the
pipeline's teardown is what Q4 binds, so three parties share one invariant;
**(vi)** `WP-quarantine-disposal-durability` inherits the same protocol and the
same guarantee sentence; **(vii)** the same facts appear in a source JSDoc, in
**Table C's** test identities and RED declarations, and in two `Done` specs'
canonical rows. Four of seven. **No count is written here** — Table C fixes the
identities and the mutations, and a number repeated in prose is a mirror that goes
stale the moment the table grows, which is what round 3 found in five places.

### Table F — canonical: the durability protocol for a preserved artifact

This table is the single place these facts are decided. Every other surface in
this spec cites it. **Table D and Table P below are always
`WP-preservation-abort-widening`'s** (Current state says why this table is F).

| # | Fact | Shipped at `38562ec4` (measured) | Required after this WP |
|---|---|---|---|
| **F0** | — the rule | a preservation reports SUCCESS on a verified read-back alone; nothing is flushed (Current state: `fsync count = 0`) | **A preservation reports SUCCESS only after the platform's flush has COMPLETED for the artifact AND for every directory entry the artifact depends on, and only if `dest` still names the inode those bytes were verified through.** Rows F1–F3 enumerate the flush set exhaustively, F6 fixes its order, F8 is the identity condition; anything less is row F4's failure. **The set is a CLOSED LIST derived from `stateDir` and `qdir` alone** — never a list anybody maintains, and never a derivation from what this call happened to create |
| **F1** | the artifact's BYTES | never flushed | flushed **through the ONE descriptor this invocation CREATED** (row F8) — the same descriptor the write, the read-back and the byte comparison go through. **`tmp` is opened once by the exclusive create, written through that descriptor at an explicit position, read back from position 0 through it, and never reopened by pathname**: after `linkSync` that descriptor's inode is exactly what `dest` names (measured), so "the artifact" is an INODE this function holds, not a name it looks up. **Explicit positions on both the write and the read are required, not stylistic** — measured, `readFileSync(fd)` immediately after `writeFileSync(fd)` returns EMPTY, because the descriptor's position sits at EOF |
| **F2** | the DIRECTORY ENTRY that names the artifact | never flushed | `qdir` — `state/quarantine/` or `state/quarantine/redacted/` — is flushed after the rename. Flushing F1 without F2 is the half-protocol that looks correct and is not: the bytes then survive under no name |
| **F3** | the REST of the directory chain the artifact depends on | nothing is flushed, and **nothing in the product ever has been**, so no ancestor's entry is known durable at any depth | **the FIXED chain, bottom-up, ending at the ANCHOR**: `qdir`, then `state/quarantine/` when `qdir` is the `redacted/` shelf, then `stateDir`, then **`path.dirname(stateDir)` — the core directory, and that is the anchor.** A closed list of **three or four** paths, flushed on EVERY successful preservation whether or not this call created any of it. A created-set derivation misses an ancestor another step of the SAME RUN created, and `acquireLock(stateDir)` — `fs.mkdirSync(stateDir, {recursive:true})` in `src/core/dream/lock.js` — is exactly that step (measured, Current state). **Where the chain stops and why is decided below this table, with the road not taken and its cost** |
| **F4** | disposition when a flush does not complete — **at ANY of F1, F2 or F3, and at either the `openSync` or the `fsyncSync`** | not reachable | **preservation FAILURE.** Return `null` — after Table D row **D2**'s existing removal of `dest`, which is the same disposal a failed read-back already takes, so no new disposal path is created and row D3 keeps its meaning. Table P row **P0** then carries it to the abort on the withhold arm, and row **P3** on the redact fall-through. **A flush error is never swallowed and never logged past, and this row is not about the artifact alone:** a directory flush has its own open, its own flags and its own failure modes, so an implementation that returns `false` correctly for the artifact while letting a directory's failure pass reports success over an unflushed entry |
| **F5** | platform | — | **The artifact descriptor is `O_RDWR`, and that is a portability requirement, not a preference:** `fsync(2)` on Linux returns `EBADF` for a descriptor not open for writing, and `fs.fsyncSync` surfaces that. Row F8's create-open is writable, so the flush is valid on every POSIX platform rather than on the one this session could measure. **What was measured here is darwin only** — this pipeline has no Linux host — so the Linux half is asserted from `fsync(2)`'s documented requirement and **proved by CI**, whose `test` job runs a `[ubuntu-latest, macos-latest]` matrix (`.github/workflows/ci.yml`): a read-only descriptor would fail the ubuntu leg on every preserving test. **The FLUSHES are POSIX-only, branched EXPLICITLY.** `process.platform === 'win32'` selects a branch that issues no flush and claims no durability — today's behaviour there, unchanged — following `src/core/private-fs.js`'s owner-approved win32 posture. Deliberately NOT expressed as a swallowed error: a caught error cannot tell "this platform has no such call" from "this flush really failed", and F4 must keep the second one loud. **The reopen and row F8's identity check are NOT gated on the platform** — they are properties of the VERIFICATION, not of durability, and they run everywhere. Dispatch precondition item 1 |
| **F6** | order | — | **the artifact's bytes (F1) before the directory entry that names them (F2), and F2 before the rest of F3's chain, bottom-up.** The whole protocol's order is fixed by row F8's identity: open `tmp` → commit → gated temp removal → read/compare/flush through that descriptor → the last gate. **The evidence asserts the artifact flush by INODE and the directory chain by PATH**, because the descriptor was opened under a name that is not `dest`. The reason is not the post-condition — at the moment success is reported every flush in the set has completed either way — it is what a crash MID-protocol leaves behind: with an entry flushed first, a crash can leave a durable, reachable artifact over bytes that were never flushed, i.e. a short file sitting on the shelf the user is told to restore from, which the next run's collision loop then preserves forever under a `-1` name. With F1 first, any artifact that survives a crash holds complete bytes |
| **F7** | what this table does NOT cover, stated rather than implied | — | **(a)** the REMOVAL of an artifact — Table D rows D1/D2, `pruneRedactedOriginals`' evictions and the identity-gated delete are not made crash-durable here; a disposed artifact can still reappear after a crash, **including one removed by row F4 in the instant before this function returns**. `WP-quarantine-disposal-durability` (Draft), Dispatch precondition item 4. **(b)** anything outside `quarantinePreserve`: the transcript ledger, the digest, the vault write and the git index are untouched. **(c)** the platform's own behaviour — see the guarantee sentence under Implementation notes, which is this package's only statement about what a flush achieves and which V1 pins byte-for-byte |
| **F8** | **WHICH INODE this invocation owns, and what it may act on** | the read-back is `fs.readFileSync(dest)`, **by pathname**; the commit is a replacing rename; the temp removal is unconditional. Nothing binds any of them to anything else, so every pathname act is an act on whatever happens to be at that name | **ACT ONLY ON THE INODE YOU CREATED — one predicate, used everywhere a pathname is acted on.** Provenance is established at the **exclusive create**: `tmp` is opened ONCE with `O_RDWR`, `O_CREAT` and `O_EXCL` (plus `O_NOFOLLOW` where the platform has it), the content is written through that descriptor at an explicit position, and the read-back and F1's flush go through the same one. **The descriptor is therefore the inode this invocation CREATED, not one it adopted from a name** — there is no second lookup between the write and the identity, so a substitution before the commit cannot be adopted. `ownsName(p, fd)` is `fs.lstatSync(p, {bigint:true})` against `fs.fstatSync(fd, {bigint:true})` on `dev` and `ino`, **plus `isFile()`**; three words are load-bearing and each answers a measured defeat — **`lstat`** (a FOLLOWING `stat` matches through a planted symlink), **`isFile()`** (only a regular file is what F9 committed), **`bigint`** (an inode number can exceed `Number.MAX_SAFE_INTEGER`). **The gated acts are: the temp removal after the commit; the temp removal in the shared `catch`; the last gate before success; and the failure path's removal of `dest`.** **And the catch's gate has TWO halves, because the create is ATOMIC.** `O_CREAT` with `O_EXCL` either allocates the entry and returns a descriptor or fails having created nothing, so **`fd < 0` means this invocation owns NO pathname and removes nothing** — the shipped `tmpOwned` disjunction is RETIRED with the call it reasoned about, `fs.writeFileSync`, which combined the create and the write and could therefore throw after allocating an entry. Where a descriptor DOES exist, the write or the commit is what threw and the gate is `ownsName(tmp, fd)`. A gate that fails means **remove NOTHING**. **The read-back needs no gate**, because it is not a pathname act at all. **What this row does NOT claim is decided in row F10** — it guarantees, discloses and prices separately, rather than asserting a window is closed |
| **F9** | **HOW `dest` COMES INTO EXISTENCE — the commit** | `fs.renameSync(tmp, dest)`, which **REPLACES** whatever is at `dest`. The collision loop's `fs.existsSync(dest)` looked earlier and is not atomic with it, so two overlapping runs can both find the name free: one commits, the other REPLACES it — destroying a copy that run already reported successful — and then, on the byte mismatch that follows, deletes what is left | **A NO-CLOBBER commit: `fs.linkSync(tmp, dest)`, then the gated temp removal.** `link(2)` fails with `EEXIST` if anything holds `dest`, so this invocation can never commit over a name it did not create; `EEXIST` is an ordinary preservation FAILURE taking the shipped Table D row D1 cleanup — fail-closed, the direction the owner ruled on 2026-09-02. **This is what makes row F8's rule DECIDABLE for the SUCCESS path**: a `dest` that names the created inode at the last gate was linked there by this invocation. The temp removal sits outside the commit's `catch`, so a removal that cannot be completed is Table D row **D3** and not a second cleanup attempt. **Named residual:** a filesystem without hard links makes `linkSync` throw, which is a preservation failure — fail-closed, the workspace retained, no copy lost |
| **F10** | **THE ADVERSARY — what this protocol GUARANTEES, what it DISCLOSES, and what is outside the boundary** | not stated anywhere, which is why FOUR consecutive review rounds each found another window in the same family | **GUARANTEED (1) — OVERLAPPING RUNS, which the product creates itself:** a lock stolen after its deadline while the superseded run still executes (`src/core/dream/lock.js`), and two same-day runs whose collision loops both see the same name free. **Closed by construction**: F9's commit refuses a name it did not create, and every verification is on an inode this invocation created, so two cooperating runs can never act on each other's objects. **GUARANTEED (2) — against the USER'S OWN HAND, in ONE direction:** no substitution, at any point, can make this invocation report SUCCESS over bytes it did not create, verify and flush. The gates are total on the success path. **DISCLOSED — one CLASS of residual against the user's own hand, with FOUR instances, and THREE of them destroy.** The class is a **check-then-unlink window**: every pathname removal this call makes is preceded by a separable ownership check, and Node exposes **no descriptor-relative unlink** — there is no `unlinkat`, and `fs.rmSync`/`fs.unlinkSync` take a NAME — so the check and the act are irreducibly two operations. **`quarantinePreserve` performs exactly three pathname removals, and each is one instance:** **(i) `tmp` after a successful commit** — a substitution landing between `ownsName(tmp, fd)` and the removal is deleted, **and the run then reports SUCCESS**, because `dest` and the descriptor are both intact; this is the only instance whose damage is silent; **(ii) `tmp` on a commit or write failure after a successful create** — the catch computes the gate, closes the descriptor, then removes by name; a substitution in between is deleted; **(iii) `dest` on the failure path** — the same window, the same cost. **The fourth instance is not a removal and does not destroy: (iv) `dest` substituted after the last gate on the SUCCESS path**, where success is reported for a name that no longer resolves to the artifact. **One non-destructive outcome completes the picture:** `tmp` substituted BEFORE the commit is caught by the gates — the preservation fails, nothing is deleted, and one spare directory entry to the user's own inode is left at `dest`. **Why none of (i)–(iii) is closed:** there is **no removal shape in Node ≥18 whose ownership test is not separable from its act** — every candidate (`rmSync`, `unlinkSync`, a re-`lstat` immediately before, a second gate) is another name lookup followed by another name-based unlink. The one mechanism that removes the class is to stop removing, and that is **Dispatch precondition item 6**. **The bound is the run's shape, and one earlier premise here was FALSE and is corrected:** the run holds the dream lock and `quarantinePreserve` executes in milliseconds — but **the temp name is NOT random and NOT unpublished.** It is `.tmp-${process.pid}-${stem}${ext}` (`src/core/dream/validate.js:720`), deterministic and predictable. **That same determinism is what keeps GUARANTEED (1) true**: two overlapping runs are two processes with distinct pids, so they never select the same temp name, and the only name they can contend for is `dest`, which F9's commit refuses. **OUTSIDE THE BOUNDARY, as a NAMED RESIDUAL: arbitrary same-user native code.** `docs/THREAT-MODEL.md` classes this as **A12** and says Wienerdog is *"not a boundary against arbitrary software already running as the same user"*. The reason is decisive rather than economic: a process that can swap `qdir` aside during its flush can also delete the preserved copy one instruction after this function returns, so **no durability protocol can hold against it** — and every pin added for it is machinery that, in the threat model's own phrase about a keyed MAC, *"would only imply a false guarantee"*. Dispatch precondition item **5** |

Three things this table does **not** change, stated so no one infers them.
**One:** the trigger class, the message taxonomy, the artifact-ownership contract
and the abort's four fields are Table P and Table D, cited and unrestated — this
package adds one more way to reach a preservation failure and changes nothing
about what happens after one. **Two:** byte-identity. P0b's requirement — that a
success reports the bytes READ BACK from the artifact, compared against the judged
bytes — is untouched; F8 changes only WHAT THE READ IS BOUND TO, from a pathname
to a descriptor, which is strictly stronger. **Table D's row D1 and row D2 states
are unchanged in substance by row F9** — "the rename" becomes "the commit", the
path each state owns is the same one, and the P0b clause under Implementation
notes names the substitution rather than leaving a reader to infer it. **Three:** ADR-0004 — nothing is
started, nothing outlives its call, and no daemon, watcher, retry or background
flush is introduced. A flush is a call that has returned.

**WHERE THE CHAIN STOPS, and the road not taken.** The anchor is the **core
directory**, `path.dirname(stateDir)` — measured: `src/core/paths.js` builds
`state: path.join(core, 'state')`, so that one `dirname` IS the core and
`quarantinePreserve` needs no new input to reach it. It is the right stopping
point because the risk row F3 answers is *an ancestor created without a completed
flush at a moment this run can reason about*, and `state/` is exactly that — five
call sites create it lazily with `mkdirSync(…, {recursive:true})` and
`acquireLock` does so in the same run. The core directory is not: `wienerdog init`
creates it, and a dream cannot be scheduled before install. **The road not taken
is walking further up** — `$HOME`, then `/` — which would close one more condition
(a user who deletes the install between scheduling and the run, so `acquireLock`'s
`recursive:true` recreates the core too) at the price of flushing directories this
product does not own, on every preservation, forever. **That residual is named
rather than closed:** the core directory's own entry in its parent is not flushed
by this package. **Cost, measured, so the choice is not a guess:** one directory
`open`+`fsync`+`close` is **0.018 ms** on this machine's APFS volume (200
iterations, 3.7 ms total), and the fixed chain adds one to two flushes over a
created-set derivation — under a tenth of a millisecond per preserved note, on a
nightly job that preserves a handful.

### Table C — canonical: the machine-run RED proofs — their declarations, their mutations and their test identities

`scripts/red-proofs.js`'s `evaluateRed` requires the observed **own-body** failing
set to EQUAL the declaration's `expectRed`, so the suite's test identities are
contract and are decided here (ADR-0042; settled practice — the `Done`
`WP-instruction-basename-currency` and `WP-dot-segment-denial`, and the `Ready`
`WP-quarantine-banner-location`, carry the same shape). **The declaration is
INLINED IN FULL below**, because neither `scripts/red-proofs.js` nor any shipped
declaration is in the implementer's reading set (CLAUDE.md: this spec plus the
Deliverables files), so a semantic description of a mutation is not something an
implementer can turn into a valid declaration. Copy the object; do not re-derive it.

**Six identities, and one mutation per BRANCH plus one per CHAIN MEMBER — the
counts are Table C's own and are not repeated in prose.** Each identity is NARROW
on purpose: `evaluateRed`'s equality is a two-sided test, so an identity asserting
the whole protocol at once would go red under every mutation and the declared sets
would stop distinguishing anything. Each declaration's `expectRed` therefore names
exactly the identities its mutation moves — **and every one of those sets was
MEASURED by running the lane, not predicted.**

Every assertion inside an identity carries that identity's **band marker** in its
assertion MESSAGE, so each declaration's `signal` is a short string the author
writes rather than a guess about a diagnostic nobody has produced yet.

| # | Test identity — the exact top-level test name | Suite | Band marker | What it asserts | Table F row |
|---|---|---|---|---|---|
| **QPD-1** | `dream-validate: [QPD-1] a successful preservation flushes the artifact through the descriptor its bytes were verified through` | `tests/unit/dream-validate.test.js` | `[QPD-1]` | the FIRST flush is a descriptor whose `(dev, ino)` is the artifact's — **asserted by INODE, not by the name the descriptor was opened under**, which is row F8's whole point | F1, F8 |
| **QPD-2** | `dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort` | same | `[QPD-2]` | **THE COMPLETE DISTINCT-SITE MATRIX.** The flush protocol has ONE artifact site — its `fsync`, through the descriptor already held, which is why there is no separate artifact open — and TWO sites per directory in the chain (`openSync`, `fsyncSync`), over BOTH arms. Each asserts `null`, `dest` absent, and no temp left. **Then the three shipped abort ROUTES**: a withheld-arm artifact failure → Table P row P1/P2; an ANCHOR failure on the redact arm, which is on BOTH chains, so both preserves fail → row **P3**; a REDACTED-ONLY failure → **no abort**, the withhold arm succeeding on its own shelf | F4 |
| **QPD-3** | `dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor` | same | `[QPD-3]` | the artifact's INODE is flushed FIRST, then the flushed sequence **equals** `[state/quarantine, state, <core>]` — an ordered `deepEqual`, pinning membership, completeness AND order | F2, F3, F6 |
| **QPD-4** | `dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists` | same | `[QPD-4]` | the same, on the **redact arm** with neither directory present: `[state/quarantine/redacted, state/quarantine, state, <core>]`. The only identity that can see the intermediate shelf | F2, F3, F6 |
| **QPD-5** | `dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed` | same | `[QPD-5]` | **THREE substitutions.** (a) **from inside the commit itself** — the post-commit/pre-read window, where the bytes still compare EQUAL because the read goes through the held descriptor, so only the ownership gate can see it; (b) a regular file renamed over `dest` from inside the artifact flush; (c) a **hard link of the held inode into a directory the chain never flushes, then a symlink at `dest`** — the case a following `stat` accepts. Each asserts `null` **and that the substituted entry is still there, byte-unchanged** | F8 |
| **QPD-6** | `dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left` | same | `[QPD-6]` | **SIX cases, one per act row F8 gates plus the commit's own rule.** (a) a competing `dest` planted after the collision loop looked and before the commit: `null`, the other invocation's bytes intact, no temp left; (b) the temp name substituted **between the exclusive create and the commit**: the preservation FAILS and the user's file is untouched — provenance is the CREATED inode, so the substitute is caught rather than adopted; (c) the same substitution **with the commit then throwing**: the shared D1 `catch` must NOT delete it, because identity exists there; (d) the temp name substituted **after the commit, before its removal**: the preservation still SUCCEEDS and the name is NOT unlinked; (e) the ordinary success post-condition — exactly ONE name holds the artifact | F8, F9 |

Every identity above lives in ONE suite, so one declaration file carries them all
(`suite` is a top-level field and one declaration names one suite). A proof's `criterion` field
is the acceptance criterion it proves, so `rollUp` emits **seven** lines for this
WP, one per criterion 1–7; criteria 2, 3, 4, 6 and 7 each name more than one proof.

**One mutation per BRANCH and one per CHAIN MEMBER — not one per site, and round 3
is why that distinction is written down.** The implementation has **one** failure
branch for every directory (`flushDir`'s result, checked once in the loop), so a
per-site mutation would have to invent a per-site branch — machinery guarding
machinery. What IS path-specific is chain MEMBERSHIP: dropping a member makes that
member's injection sites unreachable, so QPD-2 reddens along with the sequence
identities. Round 3 added the two gates row F8 introduced — the destination gate
and the temp gate — each with a mutation that removes it and a mutation that
ungates the removal it protects, because **detecting a substitution and refusing to
delete it are different behaviours and a single proof cannot see both.** Round 4
added the two acts that had none: the shared D1 `catch` where a descriptor exists
(`d1-cleanup-not-gated`), and **provenance itself** —
`provenance-adopted-not-created` reverts the exclusive-create descriptor to a
pathname write followed by a separate open, the only mutation that can take away the
property that the held inode is the one this invocation MADE.

#### `tests/red-proofs/quarantine-preserve-durability.proofs.json`

```json
{
  "suite": "tests/unit/dream-validate.test.js",
  "proofs": [
    {
      "id": "preservation-flush-removed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "1",
      "why": "restoring a success path that reports a verified read-back with NO flush issued at all must redden every flush identity at once — QPD-5's flush-time substitutions included, since they are injected from inside a flush that no longer happens. QPD-6 stays green: the commit and the temp removal are not flushes, which is what makes ownership a contract of its own",
      "file": "src/core/dream/validate.js",
      "find": " && flushPreservation(fd, stateDir, qdir)",
      "replace": " /* RP_MUT_QPD_NO_FLUSH */",
      "marker": "RP_MUT_QPD_NO_FLUSH",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[12345]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-1] a successful preservation flushes the artifact through the descriptor its bytes were verified through"
          ],
          "signal": "[QPD-1]"
        },
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor"
          ],
          "signal": "[QPD-3]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        },
        {
          "test": [
            "dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed"
          ],
          "signal": "[QPD-5]"
        }
      ]
    },
    {
      "id": "artifact-flush-failure-swallowed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "2",
      "why": "swallowing the ARTIFACT flush's failure makes an unflushed copy report SUCCESS, the false statement Table F row F4 forbids. Only QPD-2 moves: the call is still made and the flushed sequence is unchanged",
      "file": "src/core/dream/validate.js",
      "find": "  if (!flushFd(fd)) return false;",
      "replace": "  flushFd(fd); /* RP_MUT_QPD_SWALLOW_FD */",
      "marker": "RP_MUT_QPD_SWALLOW_FD",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[2]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        }
      ]
    },
    {
      "id": "directory-flush-failure-swallowed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "2",
      "why": "the DIRECTORY branch has its own failure path — distinct open flags, distinct filesystem behaviour — and this is the ONE branch every directory site shares, which is why the site MATRIX lives in QPD-2 and the mutation lives here",
      "file": "src/core/dream/validate.js",
      "find": "    if (!flushDir(dir)) return false;",
      "replace": "    flushDir(dir); /* RP_MUT_QPD_SWALLOW_DIR */",
      "marker": "RP_MUT_QPD_SWALLOW_DIR",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[2]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        }
      ]
    },
    {
      "id": "containing-directory-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "3",
      "why": "flushing the artifact bytes and not the directory entry that names them is the half-protocol that looks correct and is not: the bytes survive under no name",
      "file": "src/core/dream/validate.js",
      "find": "  const chain = [qdir];",
      "replace": "  const chain = []; /* RP_MUT_QPD_NO_QDIR */",
      "marker": "RP_MUT_QPD_NO_QDIR",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[234]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor"
          ],
          "signal": "[QPD-3]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        }
      ]
    },
    {
      "id": "intermediate-shelf-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "3",
      "why": "THE TWO-LEVEL CASE, invisible on the withheld arm where qdir IS the shelf. QPD-4 moves, and QPD-2 with it — its redacted-arm shelf sites lose the flush they fail — while QPD-3 stays green, which is exactly the per-arm discrimination round 2 required",
      "file": "src/core/dream/validate.js",
      "find": "  if (qdir !== shelf) chain.push(shelf);",
      "replace": "  /* RP_MUT_QPD_NO_SHELF */",
      "marker": "RP_MUT_QPD_NO_SHELF",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[24]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        }
      ]
    },
    {
      "id": "state-directory-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "4",
      "why": "the middle of the chain, and the one entry always present on both arms: dropping stateDir leaves quarantine/'s own entry unflushed",
      "file": "src/core/dream/validate.js",
      "find": "  chain.push(stateDir);",
      "replace": "  /* RP_MUT_QPD_NO_STATEDIR */",
      "marker": "RP_MUT_QPD_NO_STATEDIR",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[234]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor"
          ],
          "signal": "[QPD-3]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        }
      ]
    },
    {
      "id": "anchor-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "4",
      "why": "THE ROUND-1 ANCHOR FINDING. Dropping the anchor leaves state/'s own entry unflushed, and acquireLock creates state/ with mkdirSync(recursive) earlier in the SAME run",
      "file": "src/core/dream/validate.js",
      "find": "  if (anchor !== stateDir) chain.push(anchor);",
      "replace": "  /* RP_MUT_QPD_NO_ANCHOR */",
      "marker": "RP_MUT_QPD_NO_ANCHOR",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[234]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor"
          ],
          "signal": "[QPD-3]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        }
      ]
    },
    {
      "id": "flush-order-inverted",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "5",
      "why": "flushing the directory chain before the artifact leaves a window in which an entry is durable over bytes that are not. The flushed SET is identical, so only the two sequence identities move — and they see it as the FIRST flush no longer being the held inode",
      "file": "src/core/dream/validate.js",
      "find": "  if (!flushFd(fd)) return false;\n  for (const dir of quarantineDirChain(stateDir, qdir)) {\n    if (!flushDir(dir)) return false;\n  }",
      "replace": "  for (const dir of quarantineDirChain(stateDir, qdir)) { /* RP_MUT_QPD_ORDER */\n    if (!flushDir(dir)) return false;\n  }\n  if (!flushFd(fd)) return false;",
      "marker": "RP_MUT_QPD_ORDER",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[34]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-3] the withheld arm flushes the exact fixed chain, bottom-up, ending at the anchor"
          ],
          "signal": "[QPD-3]"
        },
        {
          "test": [
            "dream-validate: [QPD-4] the redacted arm flushes the two-level chain, with the intermediate shelf, on a tree where neither directory exists"
          ],
          "signal": "[QPD-4]"
        }
      ]
    },
    {
      "id": "destination-ownership-gate-removed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "6",
      "why": "THE ROUND-1 AND ROUND-3 FINDING TOGETHER. Without the last gate the function reports success although `dest` no longer names the inode it verified and flushed — and because the read now goes THROUGH that inode's descriptor, the byte comparison can no longer mask it, so this gate is the only thing that can",
      "file": "src/core/dream/validate.js",
      "find": " && ownsName(dest, fd)",
      "replace": " /* RP_MUT_QPD_NO_DEST_GATE */",
      "marker": "RP_MUT_QPD_NO_DEST_GATE",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[5]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed"
          ],
          "signal": "[QPD-5]"
        }
      ]
    },
    {
      "id": "destination-removal-not-gated",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "6",
      "why": "THE ROUND-3 DATA-LOSS PATH. Ungating the failure-path removal makes this invocation delete whatever is at `dest` — including a file the user restored there during the run, which Table F row F10 puts squarely IN scope",
      "file": "src/core/dream/validate.js",
      "find": "  if (owned) removeOwnedQuarantinePath(dest);",
      "replace": "  removeOwnedQuarantinePath(dest); /* RP_MUT_QPD_UNGATED_DEST_RM */",
      "marker": "RP_MUT_QPD_UNGATED_DEST_RM",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[5]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed"
          ],
          "signal": "[QPD-5]"
        }
      ]
    },
    {
      "id": "ownership-check-follows-symlinks",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "6",
      "why": "THE ROUND-2 SYMLINK FINDING, now in the shared predicate. A FOLLOWING stat matches through a symlink planted at the name, so a hard link of the held inode in a directory the chain never flushes would pass",
      "file": "src/core/dream/validate.js",
      "find": "    const named = fs.lstatSync(p, { bigint: true });",
      "replace": "    const named = fs.statSync(p, { bigint: true }); /* RP_MUT_QPD_FOLLOW */",
      "marker": "RP_MUT_QPD_FOLLOW",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[5]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed"
          ],
          "signal": "[QPD-5]"
        }
      ]
    },
    {
      "id": "commit-clobbers-destination",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "THE ROUND-2 OWNERSHIP FINDING. A replacing rename lets this invocation commit over a destination another run already holds. linkSync refuses with EEXIST instead — and, because both substitution identities take that call as their seam, restoring the rename also strands them",
      "file": "src/core/dream/validate.js",
      "find": "    fs.linkSync(tmp, dest);",
      "replace": "    fs.renameSync(tmp, dest); /* RP_MUT_QPD_CLOBBER */",
      "marker": "RP_MUT_QPD_CLOBBER",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[56]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-5] a substitution at dest, at ANY point after the commit, FAILS the preservation and is never removed"
          ],
          "signal": "[QPD-5]"
        },
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    },
    {
      "id": "tmp-removal-dropped",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "the no-clobber commit leaves the bytes under TWO names, and the temp one is a secret-bearing file no preservation record, no cleanup pass and no abort message reaches — Table D row D3's own hazard",
      "file": "src/core/dream/validate.js",
      "find": "  if (ownsName(tmp, fd)) removeOwnedQuarantinePath(tmp);",
      "replace": "  /* RP_MUT_QPD_KEEP_TMP */",
      "marker": "RP_MUT_QPD_KEEP_TMP",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[26]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-2] a flush that does not complete at ANY required target, on EITHER arm, is a preservation failure and takes the shipped abort"
          ],
          "signal": "[QPD-2]"
        },
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    },
    {
      "id": "tmp-removal-not-gated",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "THE ROUND-3 SECOND WINDOW. Ungating the temp removal makes this invocation unlink whatever now sits at its temp name — a path it may no longer own after an in-scope shelf edit. Only the substitution case of QPD-6 can see it; the ordinary success path removes the same name either way",
      "file": "src/core/dream/validate.js",
      "find": "  if (ownsName(tmp, fd)) removeOwnedQuarantinePath(tmp);",
      "replace": "  removeOwnedQuarantinePath(tmp); /* RP_MUT_QPD_UNGATED_TMP_RM */",
      "marker": "RP_MUT_QPD_UNGATED_TMP_RM",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[6]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    },
    {
      "id": "d1-cleanup-not-gated",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "THE ROUND-4 CONVERGED FINDING. The shared D1 catch also runs when the COMMIT throws — a state in which identity EXISTS — so an ungated cleanup there deletes a temp name this invocation no longer owns. Only QPD-6's failed-commit case can see it: on the ordinary D1 path the gate and the shipped flag agree",
      "file": "src/core/dream/validate.js",
      "find": "    const ownedTmp = fd >= 0 && ownsName(tmp, fd);",
      "replace": "    const ownedTmp = fd >= 0; /* RP_MUT_QPD_UNGATED_D1 */",
      "marker": "RP_MUT_QPD_UNGATED_D1",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[6]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    },
    {
      "id": "provenance-adopted-not-created",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "THE ROUND-4 PROVENANCE FINDING. Reverting to a pathname write followed by a separate open ADOPTS whatever name resolves to at that instant instead of holding the inode this invocation created — so a substitution between the two is written over, linked as the artifact and reported as a success. The exclusive create IS the provenance, and this is the only mutation that can take it away",
      "file": "src/core/dream/validate.js",
      "find": "    fd = fs.openSync(tmp, TEMP_CREATE_FLAGS, 0o600);",
      "replace": "    fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' }); /* RP_MUT_QPD_ADOPT */\n    fd = fs.openSync(tmp, fs.constants.O_RDWR);",
      "marker": "RP_MUT_QPD_ADOPT",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[6]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    },
    {
      "id": "create-failure-removes-unowned",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "7",
      "why": "THE ROUND-5 INHERITED-INFERENCE FINDING. The shipped `tmpOwned` disjunction existed because `writeFileSync` combined the create and the write, so a post-create write failure could leave an entry behind. A standalone `O_CREAT|O_EXCL` open is atomic: a throw creates nothing. Carrying the old heuristic makes a non-EEXIST create failure remove whatever is at the temp name — a file this invocation never created. Only QPD-6's create-failure case can see it; every other case has a descriptor",
      "file": "src/core/dream/validate.js",
      "find": "    const ownedTmp = fd >= 0 && ownsName(tmp, fd);",
      "replace": "    const ownedTmp = fd >= 0 ? ownsName(tmp, fd) : true; /* RP_MUT_QPD_INHERITED_OWN */",
      "marker": "RP_MUT_QPD_INHERITED_OWN",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[6]\\]",
      "expectRed": [
        {
          "test": [
            "dream-validate: [QPD-6] the commit is no-clobber, every temp-name act is gated on the inode this invocation CREATED, and exactly one name is left"
          ],
          "signal": "[QPD-6]"
        }
      ]
    }
  ]
}
```

**Every `find` above is a substring of the byte-exact source forms under
Implementation notes, and all of them were measured on a rehearsal tree**: each
`find` occurs exactly once in `src/core/dream/validate.js`, each `marker` is in
its own `replace` and absent from the pristine file, and each mutated file passes
`node --check` — a mutation that does not parse is a proof that can never run.
**And every one was then RUN**: with Table C's identities and the migrated
injections written on a rehearsal tree and this declaration in place, the
unfiltered lane reported `28 declared proof(s), 28 selected`, all twenty-eight
`PROVEN`, seven `PROVEN` criteria lines for this WP and `RUN: PROVEN`, exit 0 — so
every declared `expectRed` set is measured and not predicted, `evaluateRed`'s
own-body equality included. If a `find` does not match, the source form was not
written as prescribed: fix the source, never the declaration.

**What these proofs do NOT establish, stated rather than implied.** They establish
that the protocol's flushes are issued, on the right objects, in the right order;
that a flush which does not complete at ANY site on EITHER arm fails the
preservation and takes the route Table P assigns it; that a substitution at `dest`
— at the commit, during the flush, regular file or symlink-to-hard-link — is
detected and left alone; that a substituted TEMP name is not unlinked in any of the
three states that can reach one; and that a destination another invocation holds is
never committed over. **They do not
establish that anything survives a crash**, and no test in `npm test` can — see the
evidence paragraph under Implementation notes. **They also do not — and cannot — cover row F10's three DISCLOSED residuals**, and
that is deliberate rather than a gap. Residuals (a) and (b) are outcomes the gates
produce correctly, and QPD-5 and QPD-6 pin them. **Every instance of the check-then-unlink CLASS is untested BY DESIGN** — all three
pathname removals, not only the one on the failure path: a test could stage each,
but pinning a disclosed residual would enshrine the behaviour the package would
rather be rid of. **QPD-6 substitutes only BEFORE a gate, and its row and criterion
7 both say so**, so nothing here claims a substitution is safe at every point. Row
F10 discloses the class; Dispatch precondition item 6 prices the only mechanism that
removes it. **And they establish nothing against row F10's
out-of-scope adversary** — a same-UID process that swaps a directory aside mid-flush
passes every one of them, and by F10's ruling that is a boundary statement rather
than a gap.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table F or Table C. A review finding
updates the table and all of these in one pass; a new mirror found in review is
added here on the spot.

- [ ] **Deliverables cells** — the `src/core/dream/validate.js` row (all of Table F),
      the test row, the declaration row and the two `docs/specs/done/` rows, plus
      the six "explicitly NOT in the boundary" bullets, of which the
      `pruneRedactedOriginals` one states row **F7(a)** as a RULE over a file that
      IS in the boundary.
- [ ] **Acceptance criteria** — every criterion naming a flushed object, the
      failure disposition and its Table P route, the fixed chain or its anchor, the
      platform scope, the order, the identity pin, **the commit**, a Table C
      identity, a suite total, or the roll-up line count.
- [ ] **Verification commands** — V1 (a flush exists at all; the guarantee
      sentence, extracted from this spec by a TWO-STAGE key and matched against the
      source with comment prefixes and hard wraps flattened), V2 (each amended
      `Done` row is its base row plus its clause in the named cell, and nothing else
      in either file moved), V3 (`npm run red-proofs` and its seven roll-up lines),
      V4 (`npm test`, `npm run lint`). **V1's `on the medium` count and criterion 8's
      narrowed claim are one fact in two places** — what V1 measures is what the
      criterion may say.
- [ ] **The byte-exact source forms** under Implementation notes, which Table C's
      `find` strings quote: a change to any of them changes every declaration that
      quotes it, in the same pass. **The migrated injections** named beside them are
      a mirror too — rows F8 and F9 decide that the artifact is created, written, read
      and committed through one descriptor, and those tests are where the product's
      own suite states it. Their COUNT is Current state's, which measures it. **The SEQUENCE block under Exact contracts is a mirror as well**:
      it is the same order the source forms fix, written once as a whole.
- [ ] **The guarantee sentence** under Implementation notes — decided once, quoted
      nowhere else in this spec, pinned by V1 and by acceptance criterion 8. Its
      SCOPE is also asserted by Table F rows F5 and F7(c), and its two-stage
      extraction key is part of V1 rather than of the sentence.
- [ ] **Row F10's adversary** — decided in F10 and mirrored in FOUR places: Dispatch
      precondition item **5**, the Security checklist's same-UID bullet, Table C's
      closing "what these proofs do not establish" paragraph, and Out of scope's
      declined-pinning bullet. An owner ruling on item 5 updates the row first.
- [ ] **Row F8's ownership predicate** — decided in F8 and mirrored in the source
      forms (its `lstat` line and its gated call sites), criteria **6** and **7**,
      identities **QPD-5** and **QPD-6**, the SEQUENCE block, the Security checklist's
      removal bullets, and both `Done`-spec clauses. **The gated acts are enumerated
      in F8 and nowhere else** — round 4 added one (the shared D1 `catch` where a
      descriptor exists), exactly the growth a prose count would have hidden.
- [ ] **Row F10's GUARANTEED / DISCLOSED / OUTSIDE split** — decided in F10 and
      mirrored in Dispatch precondition items **5** and **6**, the Security
      checklist's same-UID bullet, Table C's closing paragraph, criterion **6**'s
      closing clause, and Out of scope's two declined-mechanism bullets. **A residual
      moving between tiers is a contract change**, and every one of those surfaces
      names the tier it is in.
- [ ] **Current state** — the zero-flush trace, the `mkdirSync`-return measurement
      AND the `acquireLock` measurement that makes it non-load-bearing, the
      `dirname(stateDir)`-is-the-core measurement, the five observability
      measurements, the seam census (two call sites, no `private-fs`), the
      two-false-mirrors paragraph, the FIVE-test blast-radius claim with its
      two-seams reason and its two non-breaking `renameSync` injections, and the
      shipped write path's `existsSync`/`renameSync` annotations.
- [ ] **Operative prose** — the Dispatch precondition's items, its "changes
      no Deliverables row" claim and its round-1/round-2 item checks (**the section
      HEADING carries the item COUNT and goes stale the moment an item is added**);
      "Exact contracts", its measured traces and its created-set comparison; the
      "where the chain stops" paragraph with the road not taken and its cost; the
      three "does not change" paragraphs under Table F; Table C's narrowness
      paragraph, its one-mutation-per-branch paragraph and its two residual
      paragraphs.
- [ ] **Security checklist** — the bullet naming what mode 0700 and the dream lock
      do NOT exclude (which now DEFERS to row **F10** rather than deciding), the
      bullet forbidding the mismatch arm from removing anything (row **F8**), and
      the bullet on the no-clobber commit (row **F9**).
- [ ] **Mirrors outside this document** (all inside the Deliverables boundary) —
      `quarantinePreserve`'s JSDoc in `src/core/dream/validate.js`, the EP2 gate's
      `@throws` block in the same file (whose *"the durable conjunct stays deferred
      to `WP-quarantine-preserve-durability`"* this package falsifies), row **P0b**
      of `docs/specs/done/WP-preservation-abort-widening.md` and row **B3b** of
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`.
- [ ] **COUNTS ARE REGISTERED BY SHAPE, NOT BY NUMBER — a round-3 rule.** A count
      that appears in prose is a mirror of a table, and three review rounds moved
      these tables three times; round 3 found **five** stale prose counts at once
      (identities, RED declarations, mutations, owner items, and a criterion
      number). **The rule: outside a table cell, name the table instead of the
      number.** The only numbers this spec still writes in prose are the ones an
      acceptance criterion or a verification step must ASSERT — the suite totals
      (criterion 10), the declared-proof total and the roll-up line count
      (criterion 11), and the Dispatch precondition's item count in its own heading
      — and each of those is itself listed here as a mirror.
- [ ] **NAMED RESIDUAL, not a mirror** — `scripts/boundary-check.js` is
      file-level, so once this spec file is touched for the `status:` flip any
      further edit to it is admitted. The diff to this spec file should be exactly
      the one-line `status:` change; a second hunk in it is anomalous and is a
      contract change to be judged as one.

## Implementation notes & constraints

- **THE GUARANTEE SENTENCE IS SPEC-OWNED, and this is its text.** Everything else
  about code and test design is the implementer's; this one sentence is a contract
  surface, because it is the only statement this package makes about what a flush
  achieves and because V1 compares it byte for byte. Put it in
  `flushPreservation`'s JSDoc. You MAY hard-wrap it across comment lines — V1
  flattens the ` * ` prefixes and the line breaks before comparing, and that was
  measured green on a wrapped form. You may NOT reword it, and it may appear
  exactly once:

  ```text
  Durability here is what the platform's flush provides and no more: Node documents no device-level guarantee for `fs.fsync` and exposes no way to request or observe one, so nothing in this file may state that a preserved copy is on the medium.
  ```

- **WHAT THE EVIDENCE ACTUALLY REACHES, and it is the hard part of this package.**
  A crash cannot be staged inside `npm test`. Table C's proofs and its
  identities establish that the product **issues the platform's flush for the
  artifact and for every directory entry it depends on, in that order, and reports
  success only once each has returned**; that a flush which does not complete at
  ANY of them fails the preservation; and that a replacement at `dest` is detected
  and left alone. They establish nothing about the medium, and the reason is
  measured rather than argued: `fs.constants.F_FULLFSYNC` is `undefined` and
  `fs.fsyncSync` returns `undefined`, so the product can neither request the strong
  barrier nor observe which one it got (Current state). **So the claim this package
  makes is the smaller one**, and the guarantee sentence is where it is stated. Do
  not add a test named for crash survival, and do not let a call-order assertion be
  described as one — asserting a proxy is the failure mode this paragraph exists to
  prevent.

- **THE SOURCE FORMS TABLE C's `find` STRINGS QUOTE, and they are contract only
  for that reason.** Everything else about code structure is the implementer's;
  these are byte-exact because a RED-proof declaration cannot be written against a
  shape nobody fixed. Write them exactly, and if a `find` then fails to match, the
  source form is what is wrong. **Every fence below shows its REAL indent** — round
  zero found the previous draft's fences carrying a list margin, so they are
  written flush here and the indent is stated in words.

  **(a)** row **F8**'s exclusive create — the ONE open, at **four-space** indent,
  replacing the shipped inner `try`/`catch` around
  `fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' });` **and that
  `catch`'s `tmpOwned` disjunction with it**. `let tmpOwned` is DELETED: the create
  is atomic, so the descriptor IS the ownership record. **`fd` is declared beside
  `tmp`, `dest`, `name` and `qdir`** so it survives the outer `try`:

```js
    fd = fs.openSync(tmp, TEMP_CREATE_FLAGS, 0o600);
```

  **(b)** the write and the mode, both through that descriptor, and row **F9**'s
  commit, at **four-space** indent, replacing the shipped `chmodSync` and
  `renameSync`:

```js
    writeAllAt(fd, content);
    fs.fchmodSync(fd, 0o600);
    fs.linkSync(tmp, dest);
```

  **(c)** the shared `catch`'s gate, at **four-space** indent, replacing the shipped
  bare `if (tmpOwned) removeOwnedQuarantinePath(tmp);`. **`fd < 0` means the create
  itself threw, and `O_CREAT` with `O_EXCL` is atomic — nothing was created, so
  nothing is removed. With a descriptor, the write or the commit is what threw and
  the temp name is removed only while it still names the created inode:**

```js
    const ownedTmp = fd >= 0 && ownsName(tmp, fd);
    closeQuietly(fd);
    fd = -1;
    if (ownedTmp) removeOwnedQuarantinePath(tmp);
```

  **(d)** row **F9**'s gated temp removal, at **two-space** indent, immediately
  after that `catch` — outside it, so a removal that cannot be completed is Table D
  row D3:

```js
  if (ownsName(tmp, fd)) removeOwnedQuarantinePath(tmp);
```

  **(e)** the whole verified-read-back gate, at **four-space** indent — one `if`
  carrying the byte comparison, the flush protocol AND row F8's last gate, in that
  order. **It reads through `fd` from position 0, one byte MORE than expected, so a
  longer artifact is detectable:**

```js
    const readBack = readAllAt(fd, content.length);
```

```js
    if (Buffer.compare(readBack, content) === 0 && flushPreservation(fd, stateDir, qdir) && ownsName(dest, fd)) {
```

  **(f)** row **F8**'s gated failure-path removal, at **two-space** indent. The gate
  is evaluated BEFORE the descriptor is closed and the removal after, because
  `ownsName` needs the descriptor and `removeOwnedQuarantinePath` can throw:

```js
  const owned = ownsName(dest, fd);
```

```js
  if (owned) removeOwnedQuarantinePath(dest);
```

  **(g)** `ownsName`'s identity read, at **four-space** indent. `lstat`, not `stat`;
  `bigint`, not the default; and the `isFile()` guard beside it in the comparison:

```js
    const named = fs.lstatSync(p, { bigint: true });
```

  **(h)** `flushPreservation`'s artifact flush and its chain loop, contiguous and in
  this order (row **F6**), at **two-space** indent, after the
  `DURABILITY_AVAILABLE` branch:

```js
  if (!flushFd(fd)) return false;
  for (const dir of quarantineDirChain(stateDir, qdir)) {
    if (!flushDir(dir)) return false;
  }
```

  **(i)**–**(l)**, the four lines of the chain builder, at **two-space** indent —
  the first element, the intermediate shelf, the state directory and the anchor:

```js
  const chain = [qdir];
```

```js
  if (qdir !== shelf) chain.push(shelf);
```

```js
  chain.push(stateDir);
```

```js
  if (anchor !== stateDir) chain.push(anchor);
```

  **`mkdirSync`'s return value is NOT captured and NOT used** — the chain is fixed
  (row **F3**), which is what round 1 replaced the created-set derivation with.

- **THE SHIPPED INJECTIONS THAT MUST MOVE, and their assertions must NOT.** Row F8
  creates, writes and reads the artifact through a descriptor and row F9 commits
  with `linkSync`, so a set of shipped injections stops intercepting — **measured in
  Current state as the only failures the change causes, all in this one file, and
  every one LOUD.** **Migrate the injection point, change no assertion.** Four seams
  do it, and the census is by SEAM because that is what an implementer acts on: the
  exclusive CREATE (`openSync` on a `.tmp-` basename) for the injections that made a
  pathname write fail; the descriptor WRITE (`writeSync`) for the two that let the
  create succeed and then failed or corrupted the write; the descriptor READ
  (`readSync`, matched by the INODE `dest` names) for the read-back injections; and
  `patchFs('linkSync')` in place of `patchFs('renameSync')` for the single commit
  injection. **That last one's TITLE says "rename" and is the one identity string
  this package changes** — to "the commit fails after a successful write", which no
  declaration names. Every `assert` in all of them stays byte-identical.

- **The platform branch is a NAMED CONSTANT, not a caught error** (row **F5**).
  The repo's idiom is an explicit branch that names what is lost —
  `src/core/dream/vault-write.js` states it in those words for `O_NOFOLLOW`, and
  `src/core/dream/workspace.js` follows it, both *"deliberately not the
  `fs.constants.X || 0` idiom, which makes a missing flag look like a present
  one"*. Same reasoning here: `process.platform === 'win32'` decides, so a real
  POSIX flush failure stays loud. **It gates the FLUSHES only** — the reopen, the
  read-back and F8's identity check run on every platform.

- **ONE descriptor for the artifact, and it is WRITABLE for a portability reason,
  not a stylistic one.** The create-open is `O_RDWR|O_CREAT|O_EXCL` plus
  `O_NOFOLLOW` where the platform has it: `O_CREAT|O_EXCL` because provenance is the
  create, and `O_RDWR` because **`fsync(2)` on Linux returns `EBADF` for a
  descriptor not open for writing** (row **F5**). Only darwin was measured here;
  CI's `test` job runs `[ubuntu-latest, macos-latest]`, so the ubuntu leg is where
  the Linux half is proved. The directory handles stay `O_RDONLY` and add
  `O_DIRECTORY`.

- **Positions are EXPLICIT on both the write and the read.** `writeAllAt` writes at
  an offset and `readAllAt` reads from position 0, so the descriptor's own file
  offset is never load-bearing — measured: `fs.readFileSync(fd)` right after
  `fs.writeFileSync(fd)` returns EMPTY, because the position sits at EOF. `readAllAt`
  asks for one byte MORE than expected, so an artifact that is LONGER than the judged
  bytes fails the comparison rather than passing on a prefix. Both flag sets follow the same explicit-branch idiom for
  `O_NOFOLLOW`/`O_DIRECTORY` (measured present on darwin, Current state).

- **Amending a `Done` spec's canonical row is an established move here, and it has
  a shape.** `WP-preservation-abort-widening` and `WP-quarantine-banner-location`
  both did it: the row keeps its original text and gains a **bolded, dated,
  successor-naming clause**, appended inside ONE cell. Append only. Do not
  re-author a row, do not restate Table F's members inside one, and do not touch
  any other row, paragraph or assertion in either file.

- **WHERE EACH CLAUSE GOES — the rule is the CLAIM's cell, measured, not a fixed
  column number.** A clause whose sentence scopes a particular claim has to sit in
  the cell holding that claim, and **acceptance criterion 8 cannot catch a
  misplacement**, because these rows are one line each so a clause in the wrong
  cell is still "one changed line". Measured at `38562ec4` by splitting each row on
  `' | '` (round-trip byte-exact, since `' | '` is the separator no cell can
  contain):

  | Row | file | cells | the claim being scoped | target cell |
  |---|---|---|---|---|
  | **P0b** | `WP-preservation-abort-widening.md` | 6 | *"This row establishes byte-identity, NOT durability — see 'What this WP does not make durable' below Table D"* | **5**, at its end |
  | **B3b** | `WP-secret-fence-ep2-redact-arm.md` | 3 | the 2026-09-02 clause's *"has never been enforced — the product has no `fsync`"* | **2**, at its end |

  **V2 checks this mechanically**, and it is the only check that can. Note that
  P0b's target is cell **5 of 6** — the clause does NOT go at the end of the line,
  and a check that appended at the end of the row would accept the wrong thing.

  Both clauses are byte-exact. **P0b first:**

  ```text
  **Amended 2026-09-05 (`WP-quarantine-preserve-durability`): the DURABLE conjunct is now ENFORCED, so the pointer in the sentence before this one resolves to a paragraph that is superseded as a forward-looking statement and stands as the record of the tree at `fc506110`. What is shipped is that spec's Table F: a preservation reports success only after the platform's flush has completed for the artifact AND for a FIXED chain of directory entries — the containing directory, the shelf above it on the redacted arm, the state directory, and the core directory that names it — and only if `dest` is still a regular file naming the inode those bytes were verified through — the read-back, that flush and the identity all going through ONE descriptor, opened before the commit and never reopened by name. The COMMIT is no-clobber — a link that refuses an existing name — so this invocation can never write over a destination another invocation already holds; "the rename" in rows D1 and D2 is that commit, and each row still owns the same path it always did. **EVERY pathname act after the commit is gated on that descriptor's identity**: the removal of the temp name, the last gate before success, and the failure path's removal of `dest`. A flush that does not complete at any target is a preservation FAILURE, disposed of by this spec's Table D row D2 and carried to the abort by row P0; a gate that fails is a failure that removes NOTHING, because what is then at that name is not this invocation's — which is how row D4's "the owned path is absent" is satisfied when the name itself has been taken. The guarantee is SCOPED, not absolute: durability to the extent the platform's flush provides, POSIX-only for the flushes, and the identity check narrows the replacement window without closing it. TWO of that paragraph's claims did NOT move and are re-routed rather than retired: D1's and D2's REMOVALS are still not crash-durable, and neither is `pruneRedactedOriginals`' eviction — those are `WP-quarantine-disposal-durability` (Draft), which `depends_on` the durability spec. This row's own text, its byte-identity requirement and every value in it are unchanged, and this clause restates no member of Table P or Table D.**
  ```

  **B3b:**

  ```text
  **Amended 2026-09-05 (`WP-quarantine-preserve-durability`): the DURABLE conjunct of this row's condition is now ENFORCED, and this row states shipped behaviour rather than a standing obligation. The 2026-09-02 clause above says it "has never been enforced — the product has no `fsync`"; that was measured at `fc506110` and stands as the record of that tree. A preservation now reports success only after the platform's flush has completed for the artifact and for the fixed chain of directory entries above it, and only if the artifact's name still resolves to the inode whose bytes were verified — one descriptor carrying the read-back, the flush and the identity, and every pathname act gated on it; a flush that does not complete, or an identity that no longer holds, is a preservation FAILURE that reaches this row's condition the way every other one does — through `quarantinePreserve` returning `null`. The guarantee is SCOPED: durability to the extent the platform's flush provides, POSIX-only for the flushes, and it does NOT cover the removal of a rejected artifact, which is `WP-quarantine-disposal-durability` (Draft). This row's condition, its two ways in and its disposition are unchanged, and this clause restates no field of row Q18.**
  ```

  Then re-read each amended cell WHOLE and report, in the PR body, any sentence the
  clause leaves false — the clause scopes the universals it names, and a cell can
  hold one it does not.

- **`depends_on` names `WP-quarantine-banner-location`, and that dependency is now
  SATISFIED.** The owner ruled the chain on 2026-09-02
  (`docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` item 2). The entry
  was added because both packages amend
  `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — that one rows Q1, Q2 and Q9,
  this one row B3b — so an out-of-order merge would have put two branches in one
  file. That package shipped in PRs #218/#219 and its spec now lives in
  `docs/specs/done/`; **measured on the rebased base, row B3b is byte-unchanged by
  it (three cells, same bytes at `0fd50422`, at `38562ec4` and here)**, so this
  package's clause still applies to the row it was written against. V2 reads each
  base row with `git show main:`, so it is correct against whatever `main` holds at
  dispatch.

- **The stub said `size: M` and so does this spec, but the package is a re-cut
  one.** The stub's own Watch-out predicted the split and called it the expected
  outcome. What was measured: the SUCCESS half is ONE function — its byte-exact
  source forms, the migrated injections and Table C's proofs; the DISPOSAL half is
  three call sites, two shipped best-effort postures, a failure disposition nobody
  has ruled, and now a live-run ownership question of its own.
  Dispatch precondition item 4 states the split with its cost.

- **The `npm run red-proofs` lane refuses in a git worktree whose `node_modules`
  is a symlink**, with `ERROR: SNAPSHOT — unsupported entry type: symbolic link at
  node_modules`. That is the lane's containment rule, not a failure of the work:
  run V3 in a checkout with a real `node_modules`, or on a `git archive` copy.
  Recorded so the refusal is not read as a red.

- Test design, fixture shapes and the mechanics of each RED are the implementer's
  beyond what Table C fixes (`docs/runbooks/spec-authoring.md`). Table C fixes only
  what `evaluateRed`'s equality makes contract — **the identities, the mutations,
  their markers and the declaration file that carries them, as Table C enumerates
  them.** No count is repeated here: round 3 found five prose mirrors each naming a
  number the table had already moved past.

- No new npm dependencies; no `.ts` under `src/`; ADR-0004 — nothing started that
  outlives its call, and every call this package adds has returned before
  `quarantinePreserve` does.

- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] **No untrusted identifier enters any new path.** Every path the protocol
      opens is one this same call already computed — `dest` from the shipped
      collision loop over `displayName`'s `[A-Za-z0-9._-]` sanitizer, `qdir` from
      `path.join(stateDir, 'quarantine'[, 'redacted'])`, and the chain's remaining
      entries from `path.join`/`path.dirname` over `stateDir`. Nothing new is
      parsed, joined or derived from user input, and no path outside the core is
      opened: the anchor is `path.dirname(stateDir)`, which is the core itself.
- [ ] **Never-follow where the platform has it.** The artifact and directory opens
      add `O_NOFOLLOW` (and `O_DIRECTORY` for a directory) through the repo's
      explicit-branch idiom, matching `src/core/dream/vault-write.js` and
      `src/core/dream/workspace.js`.
- [ ] **WHAT MODE 0700 AND THE DREAM LOCK DO NOT EXCLUDE — and this bullet no
      longer decides it, row F10 does.** Mode 0700 excludes other USERS. The dream
      lock excludes cooperating dream runs, and only until its deadline, after which
      `acquireLock` STEALS it while the superseded process may still be running
      (`src/core/dream/lock.js`). `O_NOFOLLOW` refuses a symlink at the open but not
      a regular file committed over `dest`, and a following `stat` would not refuse
      a symlink at the check either. **Row F10 is where the adversary is decided, and
      after round 4 it GUARANTEES, DISCLOSES and PRICES separately** rather than
      calling a class closed: overlapping runs are closed by construction; the user's
      own hand is guaranteed in ONE direction — no substitution can produce a false
      SUCCESS — and carries **three disclosed residuals**, one of which deletes a
      replacement and which Node's lack of a descriptor-relative unlink makes
      unclosable; arbitrary same-user native code is OUT, citing
      `docs/THREAT-MODEL.md`'s class **A12**. This bullet cites that row and decides
      nothing of its own — the round-2 correction, sharpened by round 4: a security
      checklist that asserts an exclusion the product does not have is the assumption
      reviewers break, and so is a contract that calls a partly-closed class closed.
- [ ] **Nothing is disclosed and nothing new is written.** The protocol reads
      descriptors and flushes them; it creates no file, writes no byte, and emits
      no message — the only user-visible effect is that one more class of failure
      reaches an abort message that already exists, whose four fields are Table P's
      and are unchanged.
- [ ] **The identity check reads, and never writes or removes.** Row F8's mismatch
      arm disposes of nothing. A design that removed the file it found at `dest`
      would give a same-UID process a way to make this run delete a file of their
      choosing at a name they control — the inverse of the hazard, created by the
      fix for it. `destination-removal-not-gated` is the RED proof that this guard
      is load-bearing, and `tmp-removal-not-gated` is its twin at the temp name.
- [ ] **The commit never destroys what it did not create** (row **F9**). `linkSync`
      refuses with `EEXIST`; the shipped replacing `renameSync` did not, so an
      overlapping run could commit over — and then, on the byte mismatch that
      followed, delete — a copy another run had already reported successful. That is
      a DATA-LOSS path against an adversary this product creates itself, which is why
      it is closed here rather than routed. It also retires the shipped collision
      loop's non-atomic `existsSync(dest)` window, which the round-2 shadow routed as
      an ownership race: the window still exists, and the commit no longer acts on
      it.
- [ ] **The failure path removes exactly the one path this invocation owns.** Row
      F4 reuses Table D row **D2**'s existing removal of `dest`; it adds no removal,
      does not touch `tmp` (gone by definition after the rename) and does not touch
      a collision candidate.

## Acceptance criteria

- [ ] **1.** **The artifact's bytes are flushed, through the descriptor they were
      verified through** (Table F rows **F1**/**F8**), resolved through that
      descriptor to `dest` and never merely counted. Evidence: **QPD-1**, proof
      `preservation-flush-removed`.
- [ ] **2.** **A flush that does not complete at ANY required target, on EITHER
      arm, is a preservation failure** (row **F4**) — the complete distinct-site
      matrix: every chain member × `openSync` and `fsyncSync`, on the withheld and
      the redacted arm, each asserting `null`, `dest` absent and no temp left. **And
      each failure takes the route Table P assigns it, unchanged:** P1/P2 on the
      withheld arm; **P3** when the failing target is on BOTH chains so the redact
      arm falls through and the withhold also fails; **no abort at all** when only
      the redacted shelf fails and the withhold arm succeeds. **No new message, no
      new field and no new disposal path.** Evidence: **QPD-2**, proofs
      `artifact-flush-failure-swallowed` and `directory-flush-failure-swallowed`.
- [ ] **3.** **The directory entry that names the artifact is flushed** (row
      **F2**), and **on the redacted arm the shelf above it is too** — which the
      withheld arm cannot show because there `qdir` IS the shelf. Evidence:
      **QPD-3** and **QPD-4**, proofs `containing-directory-not-flushed` and
      `intermediate-shelf-not-flushed`.
- [ ] **4.** **The chain is FIXED and ends at the anchor** (row **F3**): every
      successful preservation flushes `qdir`, the shelf when distinct, `stateDir`
      and `path.dirname(stateDir)` — the core directory — whether or not this call
      created any of them. **Not a created-set derivation:** `acquireLock` creates
      `state/` earlier in the same run, so a created-set would leave the core
      unflushed (measured, Exact contracts). Evidence: **QPD-3** and **QPD-4**'s
      ordered sequences, proofs `state-directory-not-flushed` and
      `anchor-not-flushed`.
- [ ] **5.** **The order is the artifact, then the chain bottom-up** (row **F6**),
      asserted as an ordered SEQUENCE and not as a set. Evidence: **QPD-3** and
      **QPD-4**, proof `flush-order-inverted`.
- [ ] **6.** **ACT ONLY ON THE INODE YOU HOLD, at `dest`** (row **F8**). A
      substitution at `dest` — **at the commit itself**, or during the flush, a
      regular file or a symlink to a hard link of the held inode — makes
      `quarantinePreserve` return `null`, **and the substituted entry is still
      there, byte-unchanged.** The post-commit case is the one a byte comparison
      cannot catch: the read goes through the held descriptor, so the bytes still
      match and only the gate sees it. The check is `lstat` + `isFile()` + bigint
      `(dev, ino)`; a FOLLOWING stat is a defect, and so is an UNGATED removal.
      Evidence: **QPD-5**, proofs `destination-ownership-gate-removed`,
      `destination-removal-not-gated` and `ownership-check-follows-symlinks`.
      **This criterion does not claim the class is closed, and it says so in row
      F10's own vocabulary:** what is GUARANTEED is that no substitution produces a
      false SUCCESS; what is DISCLOSED is one CLASS of check-then-unlink window with
      an instance at each of this call's three pathname removals — three of which
      destroy a replacement, one of them while the run still reports SUCCESS — plus
      the after-gate success window; and what is OUTSIDE is A12. Dispatch
      precondition item **6** prices the one mechanism that removes the class.
- [ ] **7.** **The commit is no-clobber, and EVERY temp-name act is gated on the
      inode this invocation CREATED** (rows **F9**, **F8**). A destination another
      invocation already holds is never committed over — `EEXIST` is an ordinary
      preservation failure — and is never removed. **A temp name substituted BEFORE
      a gate is never unlinked**, in each of the four states that can reach one:
      before the commit (the preservation fails and the file is untouched —
      provenance is the created inode, so a substitute is caught rather than
      adopted); with the commit then throwing (the shared `catch` is gated, because
      identity exists there); after the commit and before its gate (the preservation
      still succeeds); and after a create FAILURE, where `fd < 0` means this
      invocation created nothing and therefore removes nothing. On the ordinary path
      exactly one name holds the artifact afterwards, the temp being removed under
      Table D row **D3**'s fail-loud rule. **THIS CRITERION IS SCOPED TO
      SUBSTITUTIONS BEFORE A GATE and claims nothing about one landing after it** —
      those are row **F10**'s disclosed check-then-unlink windows, priced in Dispatch
      precondition item 6 and untested by the same rule that keeps the rest of that
      class untested. Evidence: **QPD-6**, proofs `commit-clobbers-destination`,
      `tmp-removal-dropped`, `tmp-removal-not-gated`, `d1-cleanup-not-gated`,
      `provenance-adopted-not-created` and `create-failure-removes-unowned`.
- [ ] **8.** **The guarantee sentence is the one this spec decides, present exactly
      once** in `src/core/dream/validate.js`, wrapped or not, **and the phrase `on
      the medium` appears in that file exactly once — inside it.** **That is the
      whole of what V1 measures, and this criterion claims no more.** A lexical
      check cannot prove the ABSENCE of a differently worded over-claim; that
      obligation is discharged by the PR gates under Definition of done, not here.
- [ ] **9.** **The two `Done` rows carry their byte-exact clause and nothing else
      moved.** `WP-preservation-abort-widening` row **P0b** in cell 5 and
      `WP-secret-fence-ep2-redact-arm` row **B3b** in cell 2; `git diff` shows
      exactly one changed line per file. **The placement half is V2's**, because
      each row is ONE line so a line-counting check cannot see a clause that landed
      in the wrong cell.
- [ ] **10.** **Nothing outside Table F moved, and the migrated injections changed
      no assertion.** `npm test` is `tests 2629 / pass 2617 / fail 0 / skipped 12` —
      the `38562ec4` baseline of `2623 / 2611` plus exactly this WP's six new tests.
      The shipped tests named under Implementation notes keep every `assert`
      byte-identical and move only their injection point; **the src fix alone leaves
      the suite at `2623 / 2598 / fail 13`, all thirteen loud, all in that one
      file.** Measured on the full rehearsal tree. A fourteenth changed assertion is
      a finding, not a fixture to update.
- [ ] **11.** **Machine-run RED (ADR-0042).** `npm run red-proofs` reports
      `28 declared proof(s), 28 selected`, `RUN: PROVEN`, and a Criteria roll-up
      carrying **seven** lines for this WP — criteria `1` to `7` — each `PROVEN` and
      each naming its Table C proof id(s). Seven roll-up lines, not one per proof:
      criteria 2, 3, 4, 6 and 7 each carry more than one proof sharing a
      `(wp, criterion)` pair. Measured on the full rehearsal tree, exit 0.
- [ ] **12.** Idempotence: `N/A`, and the reason is stated for what this package
      is. It ships no command and writes nothing outside the repo. Inside
      `quarantinePreserve` the added steps are one extra open, a read, descriptor
      flushes and two `stat`s; the commit creates the same single artifact it
      created before, under one name. Running the gate twice over the same input
      does exactly what it does today, one more class of failure aside.
- [ ] **13.** `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the durability protocol exists, and its guarantee sentence is the one
#      THIS SPEC decides, present exactly once — AND the phrase `on the medium`
#      appears in the file exactly once, inside it. That last count is the only
#      over-claim this step can catch: it rejects the direct contradiction (the
#      approved sentence PLUS "a preserved copy is on the medium") and NOTHING
#      ELSE. A differently worded over-claim passes; acceptance criterion 8 says
#      so, and Definition of done routes the absence obligation to the PR gates.
#      The `test -f` guards are REQUIRED: a negated grep on a missing file exits
#      2 and the negation turns that error into a pass, so the check would read
#      greenest exactly where the work was never done.
F=src/core/dream/validate.js
SPEC=docs/specs/WP-quarantine-preserve-durability.md
v1=0
if [ ! -f "$F" ] || [ ! -f "$SPEC" ]; then
  echo "V1 MISSING DELIVERABLE: $F or $SPEC"; v1=1
else
  n=$(grep -oF 'fs.fsyncSync(' "$F" | wc -l | tr -d ' ')
  if [ "$n" = 0 ]; then echo "V1 NO FLUSH IS ISSUED AT ALL in $F"; v1=1; fi
  # TWO-STAGE, and the second stage is not decoration: this line ITSELF contains
  # the first key, so a single grep matches the extractor as well as the sentence
  # and reports two. The second key appears only in the sentence.
  sent=$(grep -F 'Durability here is what the platform' "$SPEC" \
         | grep -F 'is on the medium.' | sed 's/^ *//')
  if [ "$(printf '%s\n' "$sent" | grep -c .)" != 1 ]; then
    echo "V1 THIS SPEC DOES NOT CARRY EXACTLY ONE GUARANTEE SENTENCE"; v1=1
  else
    # Flatten JSDoc prefixes and hard wraps: the implementer may WRAP the
    # sentence and may not REWORD it.
    flat=$(sed 's/^[[:space:]]*\*[[:space:]]\{0,1\}//' "$F" | tr '\n' ' ' | tr -s ' ')
    m=$(printf '%s' "$flat" | grep -oF "$sent" | wc -l | tr -d ' ')
    if [ "$m" != 1 ]; then echo "V1 GUARANTEE SENTENCE APPEARS $m TIME(S) IN $F, expected 1"; v1=1; fi
    # The DIRECT contradiction, and only that one: the approved sentence is the
    # file's single use of the phrase.
    o=$(grep -oF 'on the medium' "$F" | wc -l | tr -d ' ')
    if [ "$o" != 1 ]; then echo "V1 'on the medium' APPEARS $o TIME(S) IN $F, expected 1 (inside the approved sentence)"; v1=1; fi
  fi
fi
[ "$v1" = 0 ] && echo "V1 OK"

# V2 — each amended row must be its BASE row plus exactly its clause, in the
#      cell that carries the claim the clause scopes, and nothing else in either
#      file may move. The base row is read with `git show main:<file>`, the
#      clause is EXTRACTED FROM THIS SPEC by a structural key, and the candidate
#      row is compared BYTE FOR BYTE against the reconstruction. That single
#      comparison subsumes presence-in-full, placement in the right cell, and —
#      the thing a line-counting check cannot see — any edit ELSEWHERE ON THE
#      SAME LINE. The cell split/rejoin is byte-exact (' | ' is the separator, so
#      no cell can contain it) and runs through `node -e` with the values passed
#      in the ENVIRONMENT, never interpolated into the program text.
v2=0
for triple in \
  "docs/specs/done/WP-preservation-abort-widening.md|P0b|5|the DURABLE conjunct is now ENFORCED" \
  "docs/specs/done/WP-secret-fence-ep2-redact-arm.md|B3b|2|the DURABLE conjunct of this row's condition"
do
  f=${triple%%|*}; rest=${triple#*|}
  r=${rest%%|*}; rest=${rest#*|}
  cell=${rest%%|*}; key=${rest#*|}
  if [ ! -f "$f" ] || [ ! -f "$SPEC" ]; then echo "V2 MISSING DELIVERABLE: $f or $SPEC"; v2=1; continue; fi
  clause=$(grep -F "$key" "$SPEC" | grep -F 'Amended 2026-09-05 (`WP-quarantine-preserve-durability`)' | sed 's/^ *//')
  if [ "$(printf '%s\n' "$clause" | grep -c .)" != 1 ]; then
    echo "V2 THIS SPEC DOES NOT CARRY EXACTLY ONE CLAUSE FOR $r"; v2=1; continue
  fi
  base=$(git show "main:$f" | grep -F "| **$r** |")
  cand=$(grep -F "| **$r** |" "$f")
  if [ "$(printf '%s\n' "$base" | grep -c .)" != 1 ] || [ "$(printf '%s\n' "$cand" | grep -c .)" != 1 ]; then
    echo "V2 ROW $r IS NOT EXACTLY ONE LINE AT BASE AND IN THE CANDIDATE"; v2=1; continue
  fi
  rebuilt=$(BASE="$base" CLAUSE="$clause" CELL="$cell" node -e 'const c=process.env.BASE.split(" | ");const i=Number(process.env.CELL)-1;if(i<0||i>=c.length){process.stderr.write("cell out of range");process.exit(3);}c[i]=c[i]+" "+process.env.CLAUSE;process.stdout.write(c.join(" | "));')
  rc=$?
  if [ "$rc" != 0 ]; then echo "V2 ROW $r HAS NO CELL $cell"; v2=1; continue; fi
  if [ "$cand" != "$rebuilt" ]; then
    echo "V2 ROW $r IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL $cell — the clause is missing, truncated, in another cell, or something else on that line changed"; v2=1
  fi
  ns=$(git diff --numstat main -- "$f" | awk '{print $1"/"$2}')
  if [ "$ns" != "1/1" ]; then echo "V2 ${f##*/} DIFF IS ${ns:-empty}, expected 1/1"; v2=1; fi
done
[ "$v2" = 0 ] && echo "V2 OK"

# V1/V2 VERDICT. Without this line the block prints its findings and still exits
# 0 — a check that can never fail.
[ "$v1" = 0 ] && [ "$v2" = 0 ] || { echo "V1/V2 RED"; exit 1; }

# V3 — the machine-run RED lane (criteria 1-7 and 11). REGRESSION-kind on the
#      untouched tree: it exits 0 there with the already-declared proofs PROVEN.
#      What discriminates is the CONTENT — the SEVEN roll-up lines naming this WP,
#      which cannot appear until the declaration file and Table C's identities
#      exist. Run it where `node_modules` is a real directory: the lane refuses a
#      symlinked one by design (Implementation notes).
npm run red-proofs

# V4
npm test
npm run lint
```

- **V1 is a lexical guard and that is all it is.** It cannot establish that a
  flush reaches anything; criteria 1–7 and Table C's proofs are what establish the
  protocol, and nothing establishes crash survival (Implementation notes).
  **V2 makes ONE decision**: each amended row is its base row plus its clause, in
  the named cell. Everything it might have checked separately — presence in full,
  placement — is a consequence of that byte comparison, and so is the thing a
  line-counting check cannot see: an edit ELSEWHERE ON THE SAME LINE. It cannot
  judge whether a clause is *correct*, only that nothing but the clause moved.

- **Both were extracted from the fenced block above and RUN in TWELVE trees**, each
  a scratch git repo whose `main` is a pristine `38562ec4` and each carrying THIS
  spec file, so the clause and sentence extractions run against the real document
  and the shipped escaping is exercised rather than described. **Re-run in full at
  round 3**, against the round-3 candidate and the re-worded clauses — the third
  consecutive round in which the clauses moved, which is why re-running rather than
  re-reading is the standing rule here. Observe and paste at least the three the runbook requires —
  **deliverable absent**, **compliant**, **violating** — plus the WRAPPED compliant
  state and the OVER-CLAIM state:

  | tree | V1/V2 says | rc |
  |---|---|---|
  | untouched | `V1 NO FLUSH IS ISSUED AT ALL`, `GUARANTEE SENTENCE APPEARS 0 TIME(S)`, `'on the medium' APPEARS 0 TIME(S)`, both V2 rows `IS NOT ITS BASE ROW PLUS ITS CLAUSE`, both `DIFF IS empty, expected 1/1` | 1 |
  | **compliant** (the fix + both clauses in their named cells) | `V1 OK`, `V2 OK` | 0 |
  | **compliant, the guarantee sentence HARD-WRAPPED over four JSDoc lines** | `V1 OK`, `V2 OK` | 0 |
  | `src/core/dream/validate.js` removed | `V1 MISSING DELIVERABLE: …` | 1 |
  | **the round-2 shadow's OVER-CLAIM fixture** — the approved sentence, one `fsyncSync`, plus `A preserved copy is on the medium.` | `V1 'on the medium' APPEARS 2 TIME(S) … expected 1` | 1 |
  | the guarantee sentence REWORDED away | `GUARANTEE SENTENCE APPEARS 0 TIME(S)` + `'on the medium' APPEARS 0 TIME(S)` | 1 |
  | the guarantee sentence RETYPED a second time in the file | `GUARANTEE SENTENCE APPEARS 2 TIME(S) … expected 1` | 1 |
  | the sentence present but `fs.fsyncSync` removed | `V1 NO FLUSH IS ISSUED AT ALL` | 1 |
  | **P0b's clause in cell 2** (the end-of-first-content-cell reading) | `V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5` | 1 |
  | compliant + one unrelated edited line in the widening spec | `V2 WP-preservation-abort-widening.md DIFF IS 2/2, expected 1/1` | 1 |
  | compliant + P0b's cell 5 REAUTHORED before its clause | `V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5` | 1 |
  | **compliant + a DIFFERENTLY WORDED over-claim** — `The preserved copy is safely on disk and will survive a crash.` | **`V1 OK`, `V2 OK`** | **0** |

  **The WRAPPED tree and the LAST tree are the two that matter most, in opposite
  directions.** The wrapped one is the state a red-before-work run cannot reach: a
  check that punished the implementer for hard-wrapping a JSDoc sentence would look
  identical from the red side. **The last one is GREEN and is meant to be** — it is
  the measured bound on what V1 can do, it is why acceptance criterion 8 claims only
  the count, and it is why the absence obligation lives in Definition of done item 2
  instead. **The two rows before it are why a numstat check alone is not enough:**
  both keep the file at one changed line.

- **EVERY RED proof was RUN, not designed, and so were V3 and V4.** With the six
  identities and the migrated injections written on a rehearsal tree and the
  declaration file in place, the unfiltered lane reported
  `28 declared proof(s), 28 selected`, **all twenty-eight `PROVEN`**, seven `PROVEN`
  criteria lines for this WP and `RUN: PROVEN`, exit 0 — so each mutation reddens
  exactly its declared `expectRed` set under its `testNamePattern`, `evaluateRed`'s
  own-body equality included, and the pre-existing proofs are undisturbed.
  `npm test` on the same tree: `2629 / 2617 / 0 / 12`, exit 0. **Every `expectRed`
  set was correct on the first run**, including the two that cross identities —
  restoring the replacing rename strands BOTH substitution identities, because each
  takes the commit call as its seam; and dropping the temp removal reddens QPD-2 as
  well as QPD-6, because the matrix asserts that no temp is left behind on a failure
  path too.

- **THE ORDER OF THE LAST TWO STATEMENTS IS CONTRACT, and it is easy to get
  backwards.** `ownsName` needs the descriptor, and `removeOwnedQuarantinePath` can
  raise Table D row D3. So the gate is evaluated, THEN the descriptor is closed,
  THEN the removal runs. Closing first makes the gate return `false` for every
  failure — which looks like a safe default and is exactly the bug that leaves this
  invocation's own `dest` behind, breaking Table D row D4.

- **The traps found by running the seam rather than reasoning about it, enumerated
  rather than counted.**
  (i) `fs.writeFileSync` hands back no descriptor (measured), so it cannot be the
  call that establishes provenance; row **F8**'s create is `fs.openSync` for exactly
  that reason.
  (ii) Every seam this package moves — the CREATE, the WRITE, the READ-BACK and the
  COMMIT — breaks shipped injections LOUDLY, and the census is in Current state.
  Rounds zero through three recorded the opposite for the write seam without ever
  running it; see trap (vii).
  (iii) A test that COUNTS `fs.fsyncSync` calls proves nothing about which object
  was flushed; the identities resolve each descriptor to its path, and QPD-3/QPD-4
  pin the whole ordered sequence.
  (iv) **Two of the three shipped `renameSync` injections do NOT break** — one is
  never reached because the exclusive `wx` create refuses first, and one passes for
  an equivalent reason under row F9 (Current state). Predicting them from the call
  name alone would have been wrong in both directions.
  (v) **`readFileSync(fd)` immediately after `writeFileSync(fd)` returns EMPTY** —
  the descriptor's position sits at EOF. That is why both the write and the read use
  EXPLICIT positions, not why the write stays a pathname call: round 4 moved it onto
  the descriptor anyway.
  (vi) **The descriptor's inode survives `linkSync` unchanged, and `dest` names it**
  (`nlink` 2, then 1 after the temp removal) — measured with `fstat` before and
  after. That is what makes "the artifact" an inode this function HOLDS rather than
  a name it looks up.
  (vii) **Moving the WRITE onto the descriptor breaks THIRTEEN shipped tests, and
  every one fails LOUDLY.** Rounds zero through three all repeated an unmeasured
  claim that those injections would stop intercepting *silently*; round 4 ran it. The
  claim was wrong, the migration is mechanical, and the cost of never having run it
  was three rounds of designing around a hazard that did not exist.

## Out of scope (do NOT do these)

- **Making the DISPOSAL of a quarantine artifact crash-durable** — Table F row
  **F7(a)**. `removeOwnedQuarantinePath`'s removals (Table D rows D1/D2),
  `pruneRedactedOriginals`' evictions and the identity-gated delete all live in
  `src/core/dream/validate.js`, which is inside this boundary, so this is a rule
  and not a file exclusion: **no removal in this file gains a flush here.** It is
  `WP-quarantine-disposal-durability` (Draft), which `depends_on` this package, and
  Dispatch precondition item 4 states the split with the cost of overruling it.
  **Round 1's shadow channel routed one case there rather than counting it, and it
  is confirmed covered:** a crash after row F4's D2 removal of `dest` but before
  this function returns can let the removed artifact reappear, because the unlink
  is not directory-flushed. It cannot make THIS call report success and it cannot
  destroy an only copy — the call has already decided to fail — so it is an
  orphaned extra artifact, which is exactly the successor's subject.
- **A durable per-record delivery stamp on the transcript ledger** —
  `WP-quarantine-banner-location` routed the question here and this package
  DECLINES it, with reasons, in Dispatch precondition item 3. No successor is
  filed; overruling opens `WP-ledger-delivery-stamp`.
- **Durability for anything the preservation does not write** — the transcript
  ledger, the digest, `reports/warnings.md`, the vault write and the git index.
  None of them holds a note's only copy, which is the invariant this package
  serves.
- **Widening the FLUSHES to win32** — Dispatch precondition item 1. It needs a
  measurement on a Windows host that nothing in this pipeline can take. (Row
  **F8**'s identity check is not gated on the platform and is not affected.)
- **Closing row F8's substitution window rather than narrowing it.** Nothing can:
  the only mechanism would be excluding a same-UID process from the shelf, which
  neither mode 0700 nor the steal-able dream lock does. F8 states what a success
  MEANS instead of what it prevents; a proposal to widen that claim is a contract
  change, not a fix.
- **RE-DECIDING Table D row D1's OWN RULE — out; what this package changes is only
  the INFERENCE that rule was applied through.** D1 says this invocation removes
  what IT created, and ownership begins at the successful exclusive create. That
  stands. What is retired is the shipped `tmpOwned` disjunction — *"every OTHER
  failure here happened AFTER the exclusive create allocated the directory entry"* —
  which was reasoning about `fs.writeFileSync`, a call that combines the create and
  the write. **Row F8's create is a standalone `O_CREAT`+`O_EXCL` open, which is
  atomic: a throw allocates nothing**, so `fd < 0` means D1's own rule has nothing
  to act on. The create-failure disposal therefore stays D1's **only where a file
  was provably created — which, with `O_EXCL`, is never on a throw.** Where a
  descriptor exists the write or the commit threw, identity is available, and F8
  gates the removal (`d1-cleanup-not-gated`, `create-failure-removes-unowned`).
- **A FIFTH PATHNAME CHECK for row F10's residual (c) — declined, and the reason is
  arithmetic rather than taste.** Each of rounds 1–4 found a window and each was
  closed by binding an act to the held inode; (c) cannot be, because `check(name)`
  and `unlink(name)` are two operations and Node has no `unlinkat`. Adding a sixth
  check would move the window, not remove it — and would let the spec claim a
  closure it does not have, which is the failure mode this package is written
  against. Row **F10** discloses it; Dispatch precondition item **6** prices the one
  mechanism that would close it.
- **PINNING THE DIRECTORY INODES OF THE CHAIN — declined, and row F10 is the
  reason.** Retaining a descriptor for every directory in the chain to the last gate
  and re-comparing each against the pathname then occupying its position would
  defend against a same-UID process swapping `qdir` aside mid-flush and restoring it
  — an **A12** actor, whom `docs/THREAT-MODEL.md` places outside the boundary and
  who can in any case delete the preserved copy after this function returns. Every
  pin added for that actor is machinery that implies a guarantee the product does
  not have. **This is a Dispatch-precondition item (5), not a silent decline**, and
  it carries the overrule cost.
- **The collision loop's `existsSync(dest)` window.** Row **F9** does not remove
  the window; it removes the loop's ability to act on it, because the commit refuses
  a name it did not create. Making the SELECTION atomic — a create-or-retry loop
  over the numbered candidates — is a different contract, it belongs to whoever owns
  the naming rule, and nothing in this package needs it. The round-2 shadow routed
  this as an ownership race; it is ABSORBED to the extent that no copy can be
  destroyed by it, and the residue is a preservation that fails instead of picking
  the next free name.
- **Anything about which copies exist, where the gate writes them, when a
  preservation fails for a NON-flush reason, or what happens after one** —
  `WP-preservation-abort-widening` Tables P and D, both shipped. This package cites
  them and restates neither.
- **The four pointer-sentence carriers and the digest's pending-review banner** —
  `WP-quarantine-banner-location`, shipped. Its own Out of scope routes what it
  left open (`WP-quarantine-only-copy-shelf`, proposed and not filed), and none of
  it is this package's.
- **Any change to `WP-preservation-abort-widening` other than row P0b, any change
  to `WP-secret-fence-ep2-redact-arm` other than row B3b, and any change at all to
  `WP-dream-promote-module`.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, including
   V1's three states (absent, compliant, violating), the WRAPPED compliant state and
   the OVER-CLAIM state, every V2 state in the table under the fenced block, and
   V3's seven roll-up lines.
2. **The no-over-claim obligation, which V1 cannot discharge.** List in the PR body
   every sentence of durability-related prose this diff adds to
   `src/core/dream/validate.js` outside the approved guarantee sentence. **A claim
   that a preserved copy is on the medium, safely on disk, or will survive a crash
   is a blocking finding for both review gates** — acceptance criterion 8 says V1
   catches only the direct `on the medium` contradiction, and this item is where the
   rest is caught. Stated here rather than left implied, because a lexical check
   cannot prove semantic absence and the spec no longer claims it can.
3. Conventional commits; PR titled
   `fix(dream): make a preserved quarantine artifact durable (WP-quarantine-preserve-durability)`.
4. PR template filled, including "Decisions made" (or "none"), "Discovered issues",
   and `Generated-by:`. Report there any sentence the two amended cells still leave
   false after their clause (Implementation notes).
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
   `In-Review` marks the START of review: this list is complete only when review
   is.
