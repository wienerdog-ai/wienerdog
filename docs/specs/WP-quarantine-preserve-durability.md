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

## Dispatch precondition (FOUR owner items; accepting all four recommendations changes no Deliverables row)

**Every item below carries a recommendation and the cost of overruling it.**
The owner's standing instruction of 2026-09-05 —
`docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md`, *"let us go with
your recommendations"* — is what lets a dispatcher proceed under these
recommendations; it is not a reason to skip stating them, and a dispatcher who
records none of the four has not run this gate. **Accepting all four changes no
Deliverables row.**

**Item 1 — the platform scope, and it is the only one that changes what a user
on some machine gets.** Everything this package measures was measured on darwin:
a directory can be opened and flushed there, and so can a file. **Nothing here
was measured on win32, and nothing here claims what win32 does** — the pipeline
has no Windows host. Without a directory flush an artifact's bytes can be durable
under a name that is not, so a half-protocol is worse than a stated absence.
**Recommendation: the guarantee is POSIX-only. On win32 the protocol
issues no flush at all and claims no durability**, which is exactly today's
behaviour there, and the platform is branched on EXPLICITLY (Table F row **F5**)
rather than hidden behind a swallowed error. This is the repo's own
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

**Do not dispatch until all FOUR are answered** (the standing instruction answers
them by adopting the recommendations; record that it did). Overruling item 1
changes one constant and one sentence; item 2 has no honest alternative
implementation and would send the package back to design; item 3 opens a new
package and changes nothing here; item 4 re-widens this package and re-sizes it.
**None of the four changes any path in the Deliverables table.**

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

Every claim below was measured in this tree at `0fd50422` on 2026-09-05
(`origin/main` after PR #217 merged `WP-quarantine-banner-location` at `Ready`).
`git diff --stat 0fd50422 HEAD -- src tests scripts` is empty on the branch that
carries this spec, so no measurement here is owed a re-run for the base.

**Baselines.** `npm test` → `tests 2618 / pass 2606 / fail 0 / skipped 12`, exit
0. `npm run lint` → `Linting: 637 file(s)`, `0 error(s)`, `frontmatter check
passed: 267 spec(s), 4 agent(s)`, exit 0. `npm run red-proofs` on a pristine
`git archive` copy with a real `node_modules` → `5 declared proof(s), 5
selected`, four `PROVEN` criteria roll-up lines, `RUN: PROVEN`, exit 0.

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
  … the collision loop picks `dest`; `tmp` = .tmp-<pid>-<stem><ext>
fs.writeFileSync(tmp, content, { mode: 0o600, flag: 'wx' })   EXCLUSIVE create (Table D row D1)
fs.chmodSync(tmp, 0o600)
fs.renameSync(tmp, dest)
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

**The recursively created directories are real, and `mkdirSync` says which ones.**
On the redact arm with a fresh state directory the same trace shows
`mkdirSync <T>/state/quarantine/redacted returned="<T>/state/quarantine"` — Node's
`fs.mkdirSync(p, {recursive:true})` returns **the topmost directory it created**,
and `undefined` when it created none (measured three ways on Node v25.9.0: a
two-level create returns the upper path, a repeat returns `undefined`, a
leaf-only create returns the leaf). So the set of newly created directories is
exactly that returned path and everything below it down to `qdir` — which is what
Table F row **F3** uses, and it means the set never has to be guessed.

**What the product can and cannot observe about a flush — the whole basis of the
honest guarantee sentence, measured.** On Node v25.9.0, darwin:

```text
fs.constants.F_FULLFSYNC   → undefined     (the strong barrier cannot be REQUESTED)
fs.fsyncSync(fd)           → undefined     (and nothing about what it did is RETURNED)
fs.openSync(dir, 'r')      → a number      (a directory CAN be opened and flushed here)
fs.constants.O_DIRECTORY   → number        O_NOFOLLOW → number
fs.writeFileSync(...)      → undefined     (it hands back no descriptor to flush)
```

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

**The blast radius on the existing suite is ZERO, and that is measured, not
hoped.** The candidate fix this spec specifies, applied to a `git archive` scratch
copy of `0fd50422`, gives `npm test` → `tests 2618 / pass 2606 / fail 0 / skipped
12`, exit 0. **No existing assertion changes**, and the reason is a design
constraint worth stating: seven existing failure injections in
`tests/unit/dream-validate.test.js` patch `fs.writeFileSync` and match on a STRING
path, so a fix that replaced that call with a descriptor-based write would have
silently stopped every one of them intercepting. The specified protocol leaves the
write untouched and flushes after the rename instead. If a test breaks, something
outside Table F moved and it is a finding, not a fixture to update.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | **all of Table F.** The five byte-exact source forms under Implementation notes; the guarantee sentence; `quarantinePreserve`'s JSDoc; and the gate's `@throws` block, whose *"the durable conjunct stays deferred to `WP-quarantine-preserve-durability`"* this package makes false |
| modify | tests/unit/dream-validate.test.js | Table C's five identities **QPD-1**–**QPD-5**. No existing assertion in this file changes — measured, the fix leaves the suite at `2618 / 2606 / 0 / 12` |
| create | tests/red-proofs/quarantine-preserve-durability.proofs.json | Table C's **five** declarations, inlined there in full |
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
  **no removal in this file gains a flush in this package.** They are
  `WP-quarantine-disposal-durability` (Draft), and Table F row **F7** says so.
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
 *  write, the rename, the verification — or now the flush — failed. */
function quarantinePreserve(stateDir, content, rel, date, kind = 'withheld')
```

What changes is **when it may return non-`null`**: after this package it may do so
only once Table F's flushes have completed. `null` keeps every meaning it has —
including `WP-preservation-abort-widening` Table D row **D4**'s *"`null` means the
owned path is absent"*, which the flush-failure path satisfies by taking row
**D2**'s existing removal of `dest`.

**Nothing else in this package has a shape.** No new export, no new parameter, no
new field on the preservation record, no new message, no new verdict arm, no new
gating condition, and no change to the collision loop, the exclusive create, the
`chmod`s, the rename or the read-back. ADR-0004: every step added is a synchronous
`openSync` / `fsyncSync` / `closeSync` triple that has returned before
`quarantinePreserve` does.

**The observable difference, measured on the rehearsal tree rather than
predicted.** Same driver as Current state, with the flushes resolved to the paths
their descriptors name:

```text
ARM = hard, quarantine/ ALREADY EXISTS
  FSYNCED = ["<T>/state/quarantine/2026-09-05-fp.md", "<T>/state/quarantine"]

ARM = hard, NOTHING under state/ exists yet
  FSYNCED = ["<T>/state/quarantine/2026-09-05-fp.md", "<T>/state/quarantine", "<T>/state"]

ARM = soft (the redact arm), NOTHING under state/ exists yet
  FSYNCED = ["<T>/state/quarantine/redacted/2026-09-05-fp.md",
             "<T>/state/quarantine/redacted", "<T>/state/quarantine", "<T>/state"]

ARM = hard, the DIRECTORY flush made to fail
  THREW   = the secret check stopped before changing "04-Atomic/fp.md": the withheld copy
            could not be saved; no redaction copy was attempted, …
  RM      = ["<T>/state/quarantine/2026-09-05-fp.md"]
  quarantine/ = ["redacted"]

ARM = soft, the DIRECTORY flush made to fail on BOTH shelves
  THREW   = … neither the redaction copy nor the withheld copy could be saved, …
  RM      = ["<T>/state/quarantine/redacted/2026-09-05-fp.md",
             "<T>/state/quarantine/2026-09-05-fp.md"]
```

The two abort messages are `WP-preservation-abort-widening` Table P's **P1/P2**
and **P3** values, unchanged and unedited — which is the whole point of item 2:
the new failure class reaches an abort that already exists.

## Contract reference

Activation trigger (ADR-0031, 2-of-7): **(iv)** an error/failure disposition is
introduced — a flush that does not complete becomes a preservation failure;
**(v)** the gate performs the flush, `promote()` refuses on the record and the
pipeline's teardown is what Q4 binds, so three parties share one invariant;
**(vi)** `WP-quarantine-disposal-durability` inherits the same protocol and the
same guarantee sentence; **(vii)** the same facts appear in a source JSDoc, five
test identities, five RED declarations and two `Done` specs' canonical rows. Four
of seven.

### Table F — canonical: the durability protocol for a preserved artifact

This table is the single place these facts are decided. Every other surface in
this spec cites it. **Table D and Table P below are always
`WP-preservation-abort-widening`'s** (Current state says why this table is F).

| # | Fact | Shipped at `0fd50422` (measured) | Required after this WP |
|---|---|---|---|
| **F0** | — the rule | a preservation reports SUCCESS on a verified read-back alone; nothing is flushed (Current state: `fsync count = 0`) | **A preservation reports SUCCESS only after the platform's flush has COMPLETED for the artifact AND for every directory entry the artifact depends on.** Rows F1–F3 enumerate that set exhaustively and F6 fixes its order; anything less is row F4's failure. The set is closed by construction — it is derived from `dest`, `qdir` and `mkdirSync`'s own return, never from a list anybody maintains |
| **F1** | the artifact's BYTES | never flushed | flushed. The artifact is `dest`, after the rename — not `tmp`, and not through a second write path: `fs.writeFileSync` returns no descriptor (measured), and replacing it with a descriptor-based write would silently break seven shipped failure injections that match a STRING path (Current state) |
| **F2** | the DIRECTORY ENTRY that names the artifact | never flushed | `qdir` — `state/quarantine/` or `state/quarantine/redacted/` — is flushed after the rename. Flushing F1 without F2 is the half-protocol that looks correct and is not: the bytes then survive under no name |
| **F3** | the directory entries this CALL created | `fs.mkdirSync(qdir, {recursive:true})` creates between zero and two directories per call and none of their entries is flushed. Syncing only the new directory does not persist its ENTRY in its parent | **every directory this call created is flushed BOTTOM-UP, by flushing each one's PARENT**: walk from `dirname(qdir)` upward to and including `dirname(firstCreated)`, where `firstCreated` is `mkdirSync`'s return value — **the topmost path it created, or `undefined` when it created none** (measured three ways, Current state). When it is `undefined` the walk does not run. The walk also stops at a filesystem root, which no reachable state hits and which is a guard, not a case |
| **F4** | disposition when a flush does not complete | not reachable | **preservation FAILURE.** Return `null` — after Table D row **D2**'s existing removal of `dest`, which is the same disposal a failed read-back already takes, so no new disposal path is created and row D3 keeps its meaning. Table P row **P0** then carries it to the abort on the withhold arm, and row **P3** on the redact fall-through. **A flush error is never swallowed and never logged past:** an unflushed artifact reported as a success is the false statement this table exists to prevent |
| **F5** | platform | — | **POSIX-only, branched EXPLICITLY.** `process.platform === 'win32'` selects a branch that issues no flush and claims no durability — today's behaviour there, unchanged — following `src/core/private-fs.js`'s owner-approved win32 posture. Deliberately NOT expressed as a swallowed error: a caught error cannot tell "this platform has no such call" from "this flush really failed", and F4 must keep the second one loud. Dispatch precondition item 1 |
| **F6** | order | — | **the artifact's bytes (F1) before the directory entry that names them (F2), and F2 before F3's walk.** The reason is not the post-condition — at the moment success is reported every flush in the set has completed either way — it is what a crash MID-protocol leaves behind: with the entry flushed first, a crash can leave a durable, reachable artifact over bytes that were never flushed, i.e. a short file sitting on the shelf the user is told to restore from, which the next run's collision loop then preserves forever under a `-1` name. With F1 first, any artifact that survives a crash holds complete bytes |
| **F7** | what this table does NOT cover, stated rather than implied | — | **(a)** the REMOVAL of an artifact — Table D rows D1/D2, `pruneRedactedOriginals`' evictions and the identity-gated delete are not made crash-durable here; a disposed artifact can still reappear after a crash. `WP-quarantine-disposal-durability` (Draft), Dispatch precondition item 4. **(b)** anything outside `quarantinePreserve`: the transcript ledger, the digest, the vault write and the git index are untouched. **(c)** the platform's own behaviour — see the guarantee sentence under Implementation notes, which is this package's only statement about what a flush achieves and which V1 pins byte-for-byte |

Three things this table does **not** change, stated so no one infers them.
**One:** the trigger class, the message taxonomy, the artifact-ownership contract
and the abort's four fields are Table P and Table D, cited and unrestated — this
package adds one more way to reach a preservation failure and changes nothing
about what happens after one. **Two:** byte-identity. P0b's read-back, its
comparison and the fact that a success reports the bytes READ BACK are untouched;
F1 flushes the artifact P0b verified. **Three:** ADR-0004 — nothing is started,
nothing outlives its call, and no daemon, watcher, retry or background flush is
introduced. A flush is a call that has returned.

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

**Five identities, one per row of Table F that a mutation can reach, and each is
NARROW on purpose.** `evaluateRed`'s equality is a two-sided test: an identity
that asserted the whole protocol at once would go red under every mutation, and
the declared set would stop distinguishing anything. So each identity observes one
fact, and each declaration's `expectRed` names exactly the identities its mutation
moves — which is what makes the four narrow proofs evidence and the fifth (the
full-set control) meaningful.

Every assertion inside an identity carries that identity's **band marker** in its
assertion MESSAGE, so each declaration's `signal` is a short string the author
writes rather than a guess about a diagnostic nobody has produced yet.

| # | Test identity — the exact top-level test name | Suite | Band marker | What it asserts | Table F row |
|---|---|---|---|---|---|
| **QPD-1** | `dream-validate: [QPD-1] a successful preservation flushes the artifact before it returns` | `tests/unit/dream-validate.test.js` | `[QPD-1]` | a successful `quarantinePreserve` flushed `dest` — the flush RESOLVED TO ITS PATH, not merely counted | F1 |
| **QPD-2** | `dream-validate: [QPD-2] a flush that does not complete is a preservation failure and takes the only-copy abort` | same | `[QPD-2]` | with the artifact flush made to fail: `quarantinePreserve` returns `null`, the shelf is empty afterwards, and the gate driven over the same failure raises the `WienerdogError` carrying Table P row P1/P2's value | F4 |
| **QPD-3** | `dream-validate: [QPD-3] the containing directory entry that names the artifact is flushed` | same | `[QPD-3]` | `qdir` is among the flushed paths | F2 |
| **QPD-4** | `dream-validate: [QPD-4] on a tree where the quarantine directories do not yet exist, every directory this call created is flushed` | same | `[QPD-4]` | driven on a tree where the shelf does NOT yet exist: the PARENT of the directory the call created is flushed too. **This identity is the only one that can see row F3 at all** — in the steady state the walk does not run | F3 |
| **QPD-5** | `dream-validate: [QPD-5] the artifact bytes are flushed before the directory entry that names them` | same | `[QPD-5]` | in the recorded flush SEQUENCE, `dest`'s index is less than `qdir`'s, and both are present | F6 |

All five live in one suite, so one declaration file carries them (`suite` is a
top-level field and one declaration names one suite). A proof's `criterion` field
is the acceptance criterion it proves, so `rollUp` emits **five** lines for this
WP, one per criterion 1–5, each naming its single proof id.

**How the identities OBSERVE a flush, because a count is not evidence.** A test
that counted `fs.fsyncSync` calls would pass under a protocol that flushed the
wrong object. The identities resolve each flush to the path its DESCRIPTOR names —
patch `fs.openSync` to record `fd → path`, patch `fs.fsyncSync` to look the
descriptor up — which is the property Table F's rows are stated in. The fixture
shapes, the helper and the injection mechanics beyond that are the implementer's
(`docs/runbooks/spec-authoring.md`); what Table C fixes is only what
`evaluateRed`'s equality makes contract.

#### `tests/red-proofs/quarantine-preserve-durability.proofs.json`

```json
{
  "suite": "tests/unit/dream-validate.test.js",
  "proofs": [
    {
      "id": "preservation-flush-removed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "1",
      "why": "restoring the shipped success path — a verified read-back reported as success with NO flush issued at all — must redden every identity in Table C at once: there is nothing left for any of them to observe. It is the positive control that the whole protocol is load-bearing, and the only proof whose expectRed is the full set",
      "file": "src/core/dream/validate.js",
      "find": "    if (flushPreservation(dest, qdir, firstCreated)) return { name, bytes: readBack };",
      "replace": "    return { name, bytes: readBack }; /* RP_MUT_QPD_NO_FLUSH */",
      "marker": "RP_MUT_QPD_NO_FLUSH",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[1-5]\\]",
      "expectRed": [
        { "test": ["dream-validate: [QPD-1] a successful preservation flushes the artifact before it returns"], "signal": "[QPD-1]" },
        { "test": ["dream-validate: [QPD-2] a flush that does not complete is a preservation failure and takes the only-copy abort"], "signal": "[QPD-2]" },
        { "test": ["dream-validate: [QPD-3] the containing directory entry that names the artifact is flushed"], "signal": "[QPD-3]" },
        { "test": ["dream-validate: [QPD-4] on a tree where the quarantine directories do not yet exist, every directory this call created is flushed"], "signal": "[QPD-4]" },
        { "test": ["dream-validate: [QPD-5] the artifact bytes are flushed before the directory entry that names them"], "signal": "[QPD-5]" }
      ]
    },
    {
      "id": "flush-failure-swallowed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "2",
      "why": "swallowing the artifact flush's failure makes an unflushed copy report SUCCESS, which is the false statement Table F row F4 forbids. Only QPD-2 moves: the call is still made, so an identity that merely observed the flush HAPPENING stays green here — which is why the disposition has an identity of its own",
      "file": "src/core/dream/validate.js",
      "find": "  if (!flushOne(dest, false)) return false;",
      "replace": "  flushOne(dest, false); /* RP_MUT_QPD_SWALLOW */",
      "marker": "RP_MUT_QPD_SWALLOW",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-2\\]",
      "expectRed": [
        { "test": ["dream-validate: [QPD-2] a flush that does not complete is a preservation failure and takes the only-copy abort"], "signal": "[QPD-2]" }
      ]
    },
    {
      "id": "directory-entry-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "3",
      "why": "flushing the artifact bytes and not the directory entry that names them is the half-protocol that looks correct and is not: the bytes survive under no name. QPD-3 and QPD-5 move — QPD-5 because the entry it orders against is absent — while QPD-4 stays green, because the created-ancestor walk still runs",
      "file": "src/core/dream/validate.js",
      "find": "  if (!flushOne(qdir, true)) return false;",
      "replace": "  /* RP_MUT_QPD_NO_DIR: the containing directory entry is left unflushed */",
      "marker": "RP_MUT_QPD_NO_DIR",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-[35]\\]",
      "expectRed": [
        { "test": ["dream-validate: [QPD-3] the containing directory entry that names the artifact is flushed"], "signal": "[QPD-3]" },
        { "test": ["dream-validate: [QPD-5] the artifact bytes are flushed before the directory entry that names them"], "signal": "[QPD-5]" }
      ]
    },
    {
      "id": "created-parents-not-flushed",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "4",
      "why": "THE ROW THIS PACKAGE WAS EXTRACTED FOR. Skipping the created-ancestor walk leaves a newly created quarantine/ whose own ENTRY in its parent was never flushed, so the whole shelf can be absent after a crash while every flush the call issued completed. It is INVISIBLE in the steady state — QPD-1, QPD-3 and QPD-5 all stay green — so only an identity driven on a tree where the shelf does not yet exist can see it",
      "file": "src/core/dream/validate.js",
      "find": "  if (typeof firstCreated !== 'string') return true;",
      "replace": "  return true; /* RP_MUT_QPD_NO_PARENTS: the created-ancestor walk is skipped */",
      "marker": "RP_MUT_QPD_NO_PARENTS",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-4\\]",
      "expectRed": [
        { "test": ["dream-validate: [QPD-4] on a tree where the quarantine directories do not yet exist, every directory this call created is flushed"], "signal": "[QPD-4]" }
      ]
    },
    {
      "id": "flush-order-inverted",
      "wp": "WP-quarantine-preserve-durability",
      "criterion": "5",
      "why": "flushing the directory entry before the artifact bytes leaves a window in which the entry is durable over bytes that are not, so an artifact that survives a crash can be short. Only QPD-5 moves: the flushed SET is unchanged, which is exactly why the order needs an identity that is not a set assertion",
      "file": "src/core/dream/validate.js",
      "find": "  if (!flushOne(dest, false)) return false;\n  if (!flushOne(qdir, true)) return false;",
      "replace": "  if (!flushOne(qdir, true)) return false; /* RP_MUT_QPD_ORDER */\n  if (!flushOne(dest, false)) return false;",
      "marker": "RP_MUT_QPD_ORDER",
      "occurrences": 1,
      "testNamePattern": "\\[QPD-5\\]",
      "expectRed": [
        { "test": ["dream-validate: [QPD-5] the artifact bytes are flushed before the directory entry that names them"], "signal": "[QPD-5]" }
      ]
    }
  ]
}
```

**Every `find` above is a substring of the byte-exact source forms under
Implementation notes, and all five were measured on a rehearsal tree**: each
`find` occurs exactly once in `src/core/dream/validate.js`, each `marker` is in
its own `replace` and absent from the pristine file, and each mutated file passes
`node --check` — a mutation that does not parse is a proof that can never run.
**And all five were then RUN**: with the five identities written on a rehearsal
tree and this declaration in place, the unfiltered lane reported
`10 declared proof(s), 10 selected`, all ten `PROVEN` and `RUN: PROVEN` — so the
declared `expectRed` sets are measured and not predicted. If a `find` does not
match, the source form was not written as prescribed: fix the source, never the
declaration.

**What these proofs do NOT establish, stated rather than implied.** They establish
that the protocol's flushes are issued, on the right objects, in the right order,
and that a flush which does not complete fails the preservation. **They do not
establish that anything survives a crash**, and no test in `npm test` can — see
the evidence paragraph under Implementation notes, which is where this package
draws that line.

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
      failure disposition, the platform scope, the order, a Table C identity, or
      the roll-up line count.
- [ ] **Verification commands** — V1 (a flush exists at all; the guarantee
      sentence, extracted from this spec and matched against the source with
      comment prefixes and hard wraps flattened), V2 (each amended `Done` row is
      its base row plus its clause in the named cell, and nothing else in either
      file moved), V3 (`npm run red-proofs` and its five roll-up lines), V4
      (`npm test`, `npm run lint`).
- [ ] **The five byte-exact source forms** under Implementation notes, which Table
      C's five `find` strings quote: a change to any of them changes the
      declaration that quotes it, in the same pass.
- [ ] **The guarantee sentence** under Implementation notes — decided once, quoted
      nowhere else in this spec, pinned by V1 and by acceptance criterion 6. Its
      SCOPE is also asserted by Table F rows F5 and F7(c).
- [ ] **Current state** — the zero-flush trace, the `mkdirSync`-return
      measurement, the five observability measurements, the seam census (two call
      sites, no `private-fs`), the two-false-mirrors paragraph, and the
      zero-blast-radius claim with its seven-injection reason.
- [ ] **Operative prose** — the Dispatch precondition's four items and its
      "changes no Deliverables row" claim (**the section HEADING carries the item
      COUNT and goes stale the moment an item is added**); "Exact contracts" and
      its five measured traces; the three "does not change" paragraphs under Table
      F; Table C's narrowness paragraph and its two residual paragraphs.
- [ ] **Mirrors outside this document** (all inside the Deliverables boundary) —
      `quarantinePreserve`'s JSDoc in `src/core/dream/validate.js`, the EP2 gate's
      `@throws` block in the same file (whose *"the durable conjunct stays deferred
      to `WP-quarantine-preserve-durability`"* this package falsifies), row **P0b**
      of `docs/specs/done/WP-preservation-abort-widening.md` and row **B3b** of
      `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`.
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
  A crash cannot be staged inside `npm test`. Table C's proofs and the five
  identities establish that the product **issues the platform's flush for the
  artifact and for every directory entry it depends on, in that order, and reports
  success only once each has returned** — and that a flush which does not complete
  fails the preservation. They establish nothing about the medium, and the reason
  is measured rather than argued: `fs.constants.F_FULLFSYNC` is `undefined` and
  `fs.fsyncSync` returns `undefined`, so the product can neither request the strong
  barrier nor observe which one it got (Current state). **So the claim this package
  makes is the smaller one**, and the guarantee sentence is where it is stated. Do
  not add a test named for crash survival, and do not let a call-order assertion be
  described as one — asserting a proxy is the failure mode this paragraph exists to
  prevent.

- **THE FIVE SOURCE FORMS TABLE C's `find` STRINGS QUOTE, and they are contract
  only for that reason.** Everything else about code structure is the
  implementer's; these five are byte-exact because a RED-proof declaration cannot
  be written against a shape nobody fixed. Write them exactly, and if a `find` then
  fails to match, the source form is what is wrong.

  **(a) the success path of `quarantinePreserve`**, replacing the shipped
  `return { name, bytes: readBack };` inside the existing verified-read-back `if`,
  at its existing four-space indent:

  ```js
    if (flushPreservation(dest, qdir, firstCreated)) return { name, bytes: readBack };
  ```

  The `removeOwnedQuarantinePath(dest); return null;` below it is unchanged and is
  what a failed flush now falls into — which is why row **F4** creates no new
  disposal path.

  **(b)** and **(c)**, the first two flushes of `flushPreservation`, contiguous and
  in this order (row **F6**), at two-space indent:

  ```js
    if (!flushOne(dest, false)) return false;
    if (!flushOne(qdir, true)) return false;
  ```

  **(d)** the created-ancestor walk's guard, immediately after them, at two-space
  indent:

  ```js
    if (typeof firstCreated !== 'string') return true;
  ```

  **(e)** `mkdirSync`'s return captured into a variable declared beside `tmp`,
  `dest` and `name` so it survives the `try` — as must `qdir`, which the shipped
  code declares with `const` inside the `try` and which rows F2/F3 need afterwards:

  ```js
      firstCreated = fs.mkdirSync(qdir, { recursive: true, mode: 0o700 });
  ```

- **The platform branch is a NAMED CONSTANT, not a caught error** (row **F5**).
  The repo's idiom is an explicit branch that names what is lost —
  `src/core/dream/vault-write.js` states it in those words for `O_NOFOLLOW`, and
  `src/core/dream/workspace.js` follows it, both *"deliberately not the
  `fs.constants.X || 0` idiom, which makes a missing flag look like a present
  one"*. Same reasoning here: `process.platform === 'win32'` decides, so a real
  POSIX flush failure stays loud.

- **Open the artifact for the flush with write access, and never-follow where the
  platform has it.** A read-only handle cannot be flushed everywhere; the
  directory handle is read-only and adds `O_DIRECTORY`. Both flags sets follow the
  same explicit-branch idiom for `O_NOFOLLOW`/`O_DIRECTORY` (measured present on
  darwin, Current state). Close every descriptor on both paths.

- **Amending a `Done` spec's canonical row is an established move here, and it has
  a shape.** `WP-preservation-abort-widening` and `WP-quarantine-banner-location`
  both did it: the row keeps its original text and gains a **bolded, dated,
  successor-naming clause**, appended inside ONE cell. Append only. Do not
  re-author a row, do not restate Table F's members inside one, and do not touch
  any other row, paragraph or assertion in either file.

- **WHERE EACH CLAUSE GOES — the rule is the CLAIM's cell, measured, not a fixed
  column number.** A clause whose sentence scopes a particular claim has to sit in
  the cell holding that claim, and **acceptance criterion 7 cannot catch a
  misplacement**, because these rows are one line each so a clause in the wrong
  cell is still "one changed line". Measured at `0fd50422` by splitting each row on
  `' | '`:

  | Row | file | cells | the claim being scoped | target cell |
  |---|---|---|---|---|
  | **P0b** | `WP-preservation-abort-widening.md` | 6 | *"This row establishes byte-identity, NOT durability — see 'What this WP does not make durable' below Table D"* | **5**, at its end |
  | **B3b** | `WP-secret-fence-ep2-redact-arm.md` | 3 | the 2026-09-02 clause's *"has never been enforced — the product has no `fsync`"* | **2**, at its end |

  **V2 checks this mechanically**, and it is the only check that can. Note that
  P0b's target is cell **5 of 6** — the clause does NOT go at the end of the line,
  and a check that appended at the end of the row would accept the wrong thing.

  Both clauses are byte-exact. **P0b first:**

  ```text
  **Amended 2026-09-05 (`WP-quarantine-preserve-durability`): the DURABLE conjunct is now ENFORCED, so the pointer in the sentence before this one resolves to a paragraph that is superseded as a forward-looking statement and stands as the record of the tree at `fc506110`. What is shipped is that spec's Table F: a preservation reports success only after the platform's flush has completed for the artifact AND for every directory entry it depends on — the containing directory, and every directory the call itself created, bottom-up — and a flush that does not complete is a preservation FAILURE, disposed of by this spec's Table D row D2 and carried to the abort by row P0. The guarantee is SCOPED, not absolute: durability to the extent the platform's flush provides, and POSIX-only. TWO of that paragraph's claims did NOT move and are re-routed rather than retired: D1's and D2's REMOVALS are still not crash-durable, and neither is `pruneRedactedOriginals`' eviction — those are `WP-quarantine-disposal-durability` (Draft), which `depends_on` the durability spec. This row's own text, its byte-identity requirement and every value in it are unchanged, and this clause restates no member of Table P or Table D.**
  ```

  **B3b:**

  ```text
  **Amended 2026-09-05 (`WP-quarantine-preserve-durability`): the DURABLE conjunct of this row's condition is now ENFORCED, and this row states shipped behaviour rather than a standing obligation. The 2026-09-02 clause above says it "has never been enforced — the product has no `fsync`"; that was measured at `fc506110` and stands as the record of that tree. A preservation now reports success only after the platform's flush has completed for the artifact and for every directory entry it depends on, and a flush that does not complete is a preservation FAILURE that reaches this row's condition the way every other one does — through `quarantinePreserve` returning `null`. The guarantee is SCOPED: durability to the extent the platform's flush provides, POSIX-only, and it does NOT cover the removal of a rejected artifact, which is `WP-quarantine-disposal-durability` (Draft). This row's condition, its two ways in and its disposition are unchanged, and this clause restates no field of row Q18.**
  ```

  Then re-read each amended cell WHOLE and report, in the PR body, any sentence the
  clause leaves false — the clause scopes the universals it names, and a cell can
  hold one it does not.

- **Why `depends_on` names `WP-quarantine-banner-location`, and it is not a
  re-decision of the sequencing.** The owner ruled the chain on 2026-09-02
  (`docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` item 2) and noted
  that this spec's `depends_on` *"gains nothing here — its sequencing is this
  record"*. What has changed since is mechanical, not editorial: **both packages
  amend `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`** — that one rows Q1,
  Q2 and Q9, this one row B3b — so merging them out of order puts two branches in
  the same file. Different rows, so no semantic conflict; the `depends_on` entry
  is there to make the tooling enforce the order the owner already ruled. V2 reads
  each base row with `git show main:`, which is correct on either order and stale
  on neither.

- **The stub said `size: M` and so does this spec, but the package is a re-cut
  one.** The stub's own Watch-out predicted the split and called it the expected
  outcome. What was measured: the SUCCESS half is one function, five source forms,
  zero broken tests and five proofs; the DISPOSAL half is three call sites, two
  shipped best-effort postures and a failure disposition nobody has ruled.
  Dispatch precondition item 4 states the split with its cost.

- **The `npm run red-proofs` lane refuses in a git worktree whose `node_modules`
  is a symlink**, with `ERROR: SNAPSHOT — unsupported entry type: symbolic link at
  node_modules`. That is the lane's containment rule, not a failure of the work:
  run V3 in a checkout with a real `node_modules`, or on a `git archive` copy.
  Recorded so the refusal is not read as a red.

- Test design, fixture shapes and the mechanics of each RED are the implementer's
  beyond what Table C fixes (`docs/runbooks/spec-authoring.md`). Table C fixes only
  what `evaluateRed`'s equality makes contract: the **five** identities, their
  markers, their mutations and the declaration file that carries them.

- No new npm dependencies; no `.ts` under `src/`; ADR-0004 — nothing started that
  outlives its call, and every call this package adds has returned before
  `quarantinePreserve` does.

- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] **No untrusted identifier enters any new path.** Every path the protocol
      opens is one this same call already computed — `dest` from the shipped
      collision loop over `displayName`'s `[A-Za-z0-9._-]` sanitizer, `qdir` from
      `path.join(stateDir, 'quarantine'[, 'redacted'])`, and the walk's ancestors
      from `path.dirname` applied to those. Nothing new is parsed, joined or
      derived from user input.
- [ ] **Never-follow where the platform has it.** The artifact and directory opens
      add `O_NOFOLLOW` (and `O_DIRECTORY` for a directory) through the repo's
      explicit-branch idiom, matching `src/core/dream/vault-write.js` and
      `src/core/dream/workspace.js`. A run holds the dream lock throughout and both
      shelves are 0700 under the core, so nothing else is writing that directory
      while this call decides.
- [ ] **Nothing is disclosed and nothing new is written.** The protocol reads
      descriptors and flushes them; it creates no file, writes no byte, and emits
      no message — the only user-visible effect is that one more class of failure
      reaches an abort message that already exists, whose four fields are Table P's
      and are unchanged.
- [ ] **The failure path removes exactly the one path this invocation owns.** Row
      F4 reuses Table D row **D2**'s existing removal of `dest`; it adds no removal,
      does not touch `tmp` (gone by definition after the rename) and does not touch
      a collision candidate.

## Acceptance criteria

- [ ] **1.** **The artifact's bytes are flushed** (Table F row **F1**). A
      successful `quarantinePreserve` has issued the platform's flush for `dest`,
      resolved to the path its descriptor names, before it returns. Evidence:
      Table C identity **QPD-1** and proof `preservation-flush-removed`.
- [ ] **2.** **A flush that does not complete is a preservation failure** (row
      **F4**). With the artifact flush made to fail: `quarantinePreserve` returns
      `null`, `dest` is gone, and the gate driven over the same failure raises the
      shipped only-copy abort carrying Table P row P1/P2's value. **No new message,
      no new field and no new disposal path.** Evidence: **QPD-2** and
      `flush-failure-swallowed`.
- [ ] **3.** **The directory entry that names the artifact is flushed** (row
      **F2**), after the rename. Evidence: **QPD-3** and
      `directory-entry-not-flushed`.
- [ ] **4.** **Every directory this call created is flushed, bottom-up** (row
      **F3**), driven on a tree where the shelf does not yet exist — the steady
      state cannot see this row at all. The set is derived from `mkdirSync`'s
      return, and when it created nothing the walk does not run. Evidence:
      **QPD-4** and `created-parents-not-flushed`.
- [ ] **5.** **The bytes are flushed before the entry that names them** (row
      **F6**). Evidence: **QPD-5** and `flush-order-inverted`.
- [ ] **6.** **The guarantee sentence is the one this spec decides, present exactly
      once** in `src/core/dream/validate.js`, wrapped or not, and no sentence in
      that file claims a preserved copy is on the medium. **V1 is this criterion's
      evidence**, and it is lexical by construction: what a flush achieves is not
      something a test can assert, which is why the sentence is spec-owned.
- [ ] **7.** **The two `Done` rows carry their byte-exact clause and nothing else
      moved.** `WP-preservation-abort-widening` row **P0b** in cell 5 and
      `WP-secret-fence-ep2-redact-arm` row **B3b** in cell 2; `git diff` shows
      exactly one changed line per file. **The placement half is V2's**, because
      each row is ONE line so a line-counting check cannot see a clause that landed
      in the wrong cell.
- [ ] **8.** **Nothing outside Table F moved.** `npm test` is
      `tests 2623 / pass 2611 / fail 0 / skipped 12` — the `0fd50422` baseline of
      `2618 / 2606` plus exactly this WP's five new tests, with **no existing
      assertion changed**. Measured on the full rehearsal tree, not predicted. A
      sixth changed assertion is a finding, not a fixture to update.
- [ ] **9.** **Machine-run RED (ADR-0042).** `npm run red-proofs` reports
      `10 declared proof(s), 10 selected`, `RUN: PROVEN`, and a Criteria roll-up
      carrying **five** lines for this WP — criteria `1`, `2`, `3`, `4` and `5` —
      each `PROVEN` and each naming its Table C proof id. Five and not one: each
      proof has its own `(wp, criterion)` pair. Measured on the full rehearsal
      tree, exit 0.
- [ ] **10.** Idempotence: `N/A`, and the reason is stated for what this package
      is. It ships no command and writes nothing outside the repo. Inside
      `quarantinePreserve` the added steps are descriptor flushes, which create no
      file and change no byte; running the gate twice over the same input does
      exactly what it does today, one more class of failure aside.
- [ ] **11.** `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# V1 — the durability protocol exists, and its guarantee sentence is the one
#      THIS SPEC decides, present exactly once. The `test -f` guards are
#      REQUIRED: a negated grep on a missing file exits 2 and the negation turns
#      that error into a pass, so the check would read greenest exactly where
#      the work was never done.
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

# V3 — the machine-run RED lane (criteria 1-5 and 9). REGRESSION-kind on the
#      untouched tree: it exits 0 there with the already-declared proofs PROVEN.
#      What discriminates is the CONTENT — the FIVE roll-up lines naming this WP,
#      which cannot appear until the declaration file and the five identities
#      exist. Run it where `node_modules` is a real directory: the lane refuses a
#      symlinked one by design (Implementation notes).
npm run red-proofs

# V4
npm test
npm run lint
```

- **V1 is a lexical guard and that is all it is.** It cannot establish that a
  flush reaches anything; criteria 1–5 and Table C's proofs are what establish the
  protocol, and nothing establishes crash survival (Implementation notes).
  **V2 makes ONE decision**: each amended row is its base row plus its clause, in
  the named cell. Everything it might have checked separately — presence in full,
  placement — is a consequence of that byte comparison, and so is the thing a
  line-counting check cannot see: an edit ELSEWHERE ON THE SAME LINE. It cannot
  judge whether a clause is *correct*, only that nothing but the clause moved.

- **Both were extracted from the fenced block above and RUN in TEN trees**, each a
  scratch git repo whose `main` is a pristine `0fd50422` and each carrying THIS
  spec file, so the clause and sentence extractions run against the real document
  and the shipped escaping is exercised rather than described. Observe and paste at
  least the three the runbook requires — **deliverable absent**, **compliant**,
  **violating** — and the WRAPPED compliant state:

  | tree | V1/V2 says | rc |
  |---|---|---|
  | untouched | `V1 NO FLUSH IS ISSUED AT ALL`, `V1 GUARANTEE SENTENCE APPEARS 0 TIME(S)`, both V2 rows `IS NOT ITS BASE ROW PLUS ITS CLAUSE`, both `DIFF IS empty, expected 1/1` | 1 |
  | **compliant** (the fix + both clauses in their named cells) | `V1 OK`, `V2 OK` | 0 |
  | **compliant, the guarantee sentence HARD-WRAPPED over four JSDoc lines** | `V1 OK`, `V2 OK` | 0 |
  | `src/core/dream/validate.js` removed | `V1 MISSING DELIVERABLE: …` | 1 |
  | the guarantee sentence REWORDED into an over-claim | `V1 GUARANTEE SENTENCE APPEARS 0 TIME(S) … expected 1` | 1 |
  | the guarantee sentence RETYPED a second time in the file | `V1 GUARANTEE SENTENCE APPEARS 2 TIME(S) … expected 1` | 1 |
  | the sentence present but `fs.fsyncSync` removed | `V1 NO FLUSH IS ISSUED AT ALL` | 1 |
  | **P0b's clause in cell 2** (the end-of-first-content-cell reading) | `V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5` | 1 |
  | compliant + one unrelated edited line in the widening spec | `V2 WP-preservation-abort-widening.md DIFF IS 2/2, expected 1/1` | 1 |
  | compliant + P0b's cell 5 REAUTHORED before its clause | `V2 ROW P0b IS NOT ITS BASE ROW PLUS ITS CLAUSE IN CELL 5` | 1 |

  **The WRAPPED tree is the state that matters most**, and it is the one a
  red-before-work run cannot distinguish: a check that punished the implementer for
  wrapping a JSDoc sentence would look identical from the red side. **The last two
  are why a numstat check alone is not enough:** both keep the file at one changed
  line.

- **The five RED proofs were RUN, not designed, and so were V3 and V4.** With the
  five identities written on a rehearsal tree and the declaration file in place,
  the unfiltered lane reported `10 declared proof(s), 10 selected`, **all ten
  `PROVEN`**, five `PROVEN` criteria lines for this WP and `RUN: PROVEN`, exit 0 —
  so each mutation reddens exactly its declared `expectRed` set under its
  `testNamePattern`, `evaluateRed`'s equality included, and the four pre-existing
  proofs are undisturbed. `npm test` on the same tree: `2623 / 2611 / 0 / 12`,
  exit 0. (A `--wp WP-quarantine-preserve-durability` run of the same tree reports
  `RUN: FILTERED` and exits non-zero — that is the filter reporting a partial run,
  not a failure. V3 runs the lane unfiltered.)

- **Two traps found by running the seam rather than reasoning about it.**
  (i) `fs.writeFileSync` hands back no descriptor (measured), so the artifact's
  flush cannot ride the write; it happens after the rename, on `dest`. Rewriting
  the write to a descriptor-based one would have broken **seven** existing failure
  injections that match a STRING path — measured as the reason the specified shape
  leaves the write alone. (ii) A test that COUNTS `fs.fsyncSync` calls proves
  nothing about which object was flushed; the identities resolve each descriptor to
  its path, which is how Table F's rows are stated.

## Out of scope (do NOT do these)

- **Making the DISPOSAL of a quarantine artifact crash-durable** — Table F row
  **F7(a)**. `removeOwnedQuarantinePath`'s removals (Table D rows D1/D2),
  `pruneRedactedOriginals`' evictions and the identity-gated delete all live in
  `src/core/dream/validate.js`, which is inside this boundary, so this is a rule
  and not a file exclusion: **no removal in this file gains a flush here.** It is
  `WP-quarantine-disposal-durability` (Draft), which `depends_on` this package, and
  Dispatch precondition item 4 states the split with the cost of overruling it.
- **A durable per-record delivery stamp on the transcript ledger** —
  `WP-quarantine-banner-location` routed the question here and this package
  DECLINES it, with reasons, in Dispatch precondition item 3. No successor is
  filed; overruling opens `WP-ledger-delivery-stamp`.
- **Durability for anything the preservation does not write** — the transcript
  ledger, the digest, `reports/warnings.md`, the vault write and the git index.
  None of them holds a note's only copy, which is the invariant this package
  serves.
- **Widening the guarantee to win32** — Dispatch precondition item 1. It needs a
  measurement on a Windows host that nothing in this pipeline can take.
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
   V1's three states (absent, compliant, violating) and the WRAPPED compliant
   state, V2's five states, and V3's five roll-up lines.
2. Conventional commits; PR titled
   `fix(dream): make a preserved quarantine artifact durable (WP-quarantine-preserve-durability)`.
3. PR template filled, including "Decisions made" (or "none"), "Discovered issues",
   and `Generated-by:`. Report there any sentence the two amended cells still leave
   false after their clause (Implementation notes).
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully dispositioned —
   they are defined in `docs/runbooks/codex-review.md` and not restated here.
   `In-Review` marks the START of review: this list is complete only when review
   is.
