---
id: WP-preservation-abort-widening
title: Widen the only-copy abort trigger from the named case to its class
status: In-Review
model: sonnet
size: M
depends_on: [WP-dream-promote-in-workspace, WP-secret-fence-ep2-redact-arm]
adrs: [ADR-0004, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-preservation-abort-widening: Widen the only-copy abort trigger from the named case to its class

## Dispatch precondition (one owner confirmation; changes no Deliverables row)

Read this first and then read on: the row ids it uses (**P0**, **P0b**,
**P1**–**P6**) are Table P's, under **Contract reference** below, and **Q4** is
the shipped only-copy invariant quoted in full in **Context**.

**What is recorded, and what is not.** The stub this spec replaces cited an owner
ruling that "widened the G5 trigger from the specific named case to the whole
class, on Q4's 'every party' binding". **That ruling text is not recorded
anywhere in this tree** — not in `docs/specs/`, `docs/specs/done/`,
`docs/specs/logbook/`, `docs/adr/`, `memory/`, or any commit message. What *is*
recorded is (a) the review-gate finding quoted in **Current state** below, which routes
the G5-vs-Q4 scope gap to the architect as an open decision, and (b)
`docs/HANDOVER.md:49-50`, which queues this work package by name and records the
sequencing half byte-exactly:

```text
3. `WP-preservation-abort-widening` then `WP-quarantine-banner-location` —
   two small, fully measured fixes; sequenced in that order by owner ruling.
```

The stub's third citation — "the Q18 message fields carry what the abort must
say" — resolves: Q18 exists, in `WP-secret-fence-ep2-redact-arm.md`'s Table Q,
not in `WP-dream-promote-in-workspace.md` where the stub pointed. The stub's
pointer is wrong; the citation is sound.

**The widening itself is deliberately NOT parked.** Q4 is a shipped canonical
row that already binds every party; P0–P5 bring the gate, the promotion module
and the pipeline's own record of the rule into line with **the part of Q4 this
WP enforces** — its VERIFIED-BYTE-IDENTITY subset. Q4's other conjunct, that the
artifact be **durable**, stays UNMET here and is
`WP-quarantine-preserve-durability`'s; it has never been met (no `fsync` exists
in the product), so nothing regresses. That is a defect fix against an existing
contract, not a product choice, and holding it for a ruling nobody recorded would
leave the measured data loss in place. What needs a word from the owner is only
its blast radius.

**The one question for the owner.** Rows P0–P3 make the *whole run* fail loud on
two arms that today only refuse one note; P0b adds a third occasion — an artifact
written but not holding the judged bytes — and Table D row **D3** a fourth,
narrower one: a rejected artifact that cannot be removed, where the run fails
loud rather than report a preservation failure that is not the whole truth.
Confirm that blast radius, or say the added arms should refuse-and-continue
instead.

**Recommendation: confirm fail-loud, and it is close to free.** Q4 forbids
destroying the working copy, and the pipeline has no shape in which one note's
workspace survives while the run continues — teardown is all-or-nothing (P5).
The trigger is a broken quarantine directory, which fails *every* preserve in the
run, so any soft-finding note in the same run already aborts it today via P3;
the widening changes which note reports the failure far more often than whether
the run fails. P0b costs almost nothing extra in shape: a rejected artifact
reports failure like any other, so it flows into the arms above rather than
opening a new one. Its one genuinely new abort — a removal that cannot be
completed — is a state in which the alternative is worse: telling the user
nothing was preserved while secret-bearing bytes sit in an unbannered
directory. And the failure is recoverable by hand: the workspace is retained and the
transcript ledger is not advanced, so the sessions are retried next run.

**One disclosure that is not a question.** This WP does not make preservation
crash-durable; that is `WP-quarantine-preserve-durability` (Draft), extracted
from this spec's round-3 gate. It changes nothing the owner already ruled — the
exposure is pre-existing and this WP reduces it (see Table D) — but the owner
sequenced `WP-preservation-abort-widening` then `WP-quarantine-banner-location`,
and where a third WP sits in that chain is the owner's call. **Recommendation:
after the banner.** The banner work is small, already measured, and unblocked by
this WP; durability is a new cross-cutting concern with an unsolved evidence
problem and no `fsync` anywhere in the product today.

**Do not dispatch until the question above is answered.** A "refuse-and-continue" answer
changes rows P0–P2 and their criteria (P0b is unaffected either way — it decides
what a preservation SUCCESS is, not what follows a failure); it changes no path
in the Deliverables table.

## Context (read this, nothing else)

The nightly **dream** consolidates recent sessions into the user's **vault**. It
no longer lets the model write into the vault at all: the run clones the vault
into a throwaway **workspace**, the model writes there, and only content that
passes four gates is promoted into the real vault through one write primitive.
The workspace is then destroyed on every exit path. **ADR-0004: Wienerdog is
just files** — nothing here starts a process that outlives its call, and this
work package adds none.

One of the four gates is the **EP2 secret gate** (ADR-0034). It scans the lines
this run added and returns one of three verdicts: pass, **withhold** (refuse to
promote), or **redact** (promote a sanitized form). Both refusing verdicts
**preserve** first: the gate copies the exact bytes it is judging into
`state/quarantine/` (or `state/quarantine/redacted/`) before refusing, so the
user still has the text the model wrote. That copy is the user's only route back
to those bytes — the workspace is deleted minutes later, and under promotion
those bytes were **never in the vault at all**.

That preservation is best-effort in two ways: `quarantinePreserve` returns
`null` on a failure it notices (unwritable state directory, a file where the
quarantine directory must be, a full disk), and it reports success without ever
looking at what it wrote. When it fails either way, the workspace holds the
**sole surviving copy**
of what the model wrote — and teardown then destroys it. The shipped contract
that forbids this is the **only-copy invariant**, `WP-dream-promote-module`
Table Q row **Q4**, quoted here so you need not open it:

> **nothing may destroy the working copy of a note unless some durable artifact
> byte-identically holds THE BYTES THAT ARE THERE NOW.** Not an earlier version:
> the note's owner can have saved it mid-run, and a copy of what it used to be
> is not a copy of what they wrote. […] **the invariant binds the pipeline's
> teardown too, and `WP-dream-promote-in-workspace` row G5 cites this row.** No
> surface may weaken it to "a copy was attempted"

Q4 binds every party that could destroy a working copy. The **implementation**
of it does not: it fires on one of the three ways the gate reaches its refusing
arm, and the other two lose the bytes silently. Closing that gap is this work
package. It is not a new product decision — it is bringing the gate, the
promotion module and the pipeline's own record of the rule into line with a
canonical row that already shipped.

**Read Q4's two requirements separately, because this WP satisfies one of them.**
Q4 asks for an artifact that is (i) **byte-identical** to the bytes on disk now
and (ii) **durable**. This WP establishes (i) and only (i): a preserved artifact
is read back and compared, which today it never is. It does not establish (ii),
and (ii) has never been established — the product contains no `fsync` at all
(`grep -rn 'fsync\|fdatasync' src/ tests/` returns nothing at `fc506110`). So
after this WP, Q4's durability conjunct remains **unmet and unregressed**, owned
by `WP-quarantine-preserve-durability` (Draft). Every claim below about Q4 is a
claim about subset (i); nowhere does this spec assert Q4 is satisfied whole.

## Current state

Every claim below was measured in this tree at `fc506110` on 2026-09-01.

**There are exactly two preservation steps on the dream path**, and both are in
the EP2 gate. `quarantinePreserve` is defined at `src/core/dream/validate.js:642`
and has exactly two call sites — `:1017` (`kind='redacted'`) and `:1040`
(`kind='withheld'`); no other module writes a copy of judged bytes anywhere
outside the workspace.
Runnable proof:

```bash
test "$(grep -c 'quarantinePreserve(' src/core/dream/validate.js)" = 3   # 1 def + 2 calls
test "$(grep -rl 'quarantinePreserve' src/ | wc -l | tr -d ' ')" = 1     # one file, no other party
```

**The gate's withhold arm is reached three ways**, and only one of them is
guarded. The guard is `src/core/dream/validate.js:1042`:

```js
if (redactFellThrough && !preserved) {
```

`redactFellThrough` is set only inside the soft-finding redact branch, so a
withhold that never entered that branch — a **hard secret**, or **unscannable
content** — leaves it `false`, the abort is skipped, and the gate returns
`{ refuse: true, reason, preserved: [] }`. Measured by driving `makeGates(…)
.secret` against a state directory whose `quarantine` path is a regular file, so
every preserve fails:

```
A hard-secret withhold : THREW=null            | refuse=true | preservedRecordLen=0
B unscannable (binary) : THREW=null            | refuse=true | preservedRecordLen=0
C redact fall-through  : THREW=WienerdogError  | (aborted before returning)
```

The same defect was measured independently by the PR #55 round-2 review gate and
routed to the architect —
`docs/specs/logbook/2026-08-31-pr55-gate-raw-round2-wd-reviewer.txt:79-83`:

> `HARD SECRET  : THROWN null | WORKSPACE SURVIVES false | BYTES SURVIVE false`
> `UNSCANNABLE  : THROWN null | WORKSPACE SURVIVES false | BYTES SURVIVE false`
> […] Table Q row Q4 says the invariant "binds every party that could destroy a
> working copy". G5 scopes it to the redaction-AND-preservation cross-product,
> which is narrower than Q4. **Route to wd-architect** — the fix is a decision
> about G5's scope, not an implementer edit.

**A preservation step can also fail SILENTLY, and that is a second form of the
same loss.** `quarantinePreserve` writes a temp file, renames it, and returns
`{ name, bytes: content }` (`validate.js:667-670`) — `content` is the buffer it
was HANDED. It never reads the artifact back, so a write that succeeds while
storing different bytes is reported as success. Measured, by patching
`fs.writeFileSync` to store `CORRUPT\n` for any path under `quarantine/` and
driving the ordinary redact arm:

```
D1 ordinary redact arm (scrub completes)
  THREW=null | recordLen=1 | artifacts=["quarantine/redacted/2026-09-01-d1.md"]
  ANY ARTIFACT BYTE-IDENTICAL TO JUDGED BYTES: false
```

A non-empty preservation record, a refusal or a promotion, no abort — and no
artifact anywhere holds the judged bytes. The same gap makes the redact
fall-through's **recoverable escape** vacuous: `Buffer.compare(afterBytes,
redactCopy.bytes)` (`validate.js:1054`) compares `afterBytes` against the alias
of itself that `quarantinePreserve` returned, never against the artifact, so a
corrupt artifact counts as recovery. Both reviewers of round 1 reproduced this
independently. It is why Table P row **P0b** exists: "empty record" is only a
sound operationalization of Q4's byte-identity conjunct once a non-empty record
means a VERIFIED artifact.

**One of the three message values is already dead code, and the tests say so.**
The abort's `redactedName` argument is `redactCopy ? redactCopy.name : null`, and
the abort is reached only when `recoverable` is false. `recoverable` is set by
`Buffer.compare(afterBytes, redactCopy.bytes)`, and `quarantinePreserve` returns
`{ name, bytes: content }` where `content` **is** the `afterBytes` object it was
handed — so that comparison is a buffer against itself and is always `0`.
Therefore `redactCopy` non-null implies recoverable implies no abort, and every
reachable abort passes `redactedName === null`. The value `the withheld copy
could not be saved; the redaction copy was saved` cannot be produced. The test
file records the same conclusion for the arms that used to produce it
(`tests/unit/dream-validate.test.js:1970-1978`): *"Both are UNREACHABLE after the
gate extraction … The extracted gate is HANDED the bytes it preserves, so the
copy holds them by construction — there is no second read to race, and no read
that can fail."* P0b does not revive it: a verified copy still recovers, and an
unverified one is a failure.

**A rejected artifact is a file that already exists.** `quarantinePreserve`
renames `tmp` to `dest` before anything could check it, and its `catch` removes
only `tmp` (`validate.js:648-675`). So a verification added after the rename
finds `dest` on disk, and returning `null` means no caller ever learns its name:
it enters neither `redactedCreated` nor the preservation record, so the
identity-gated cleanup at `:1072-1101` cannot see it and Q18 cannot name it.
Secret-bearing bytes would accumulate in an unbannered directory while the user
is told preservation failed. Table P row **P0b** therefore owns the rejected
artifact's disposal, not only its detection.

**The promotion module guards one arm and not the other.**
`src/core/dream/promote.js:1221` throws `the only-copy invariant is unsatisfied
and nothing is promoted` when the **redact** arm reports an empty preservation
record. The **refuse** arm at `:1195` reads the same record
(`readRecord(verdict.preserved, rel, 'refuse')`) and never checks it.

**The pipeline's teardown exception is already class-wide in code.**
`src/cli/dream.js:940-963` is one `try`/`catch` around the whole `promote()`
call: `try {` at `:940`, the call at `:941-952`, `} catch (err) {` at `:953`,
and — structurally, with seven comment lines interleaved at `:954-960` — the
catch body sets `retainWorkspace = true` (`:961`) and rethrows (`:962`). It
inspects nothing about the error, so *any* throw out of `promote()` retains the
workspace; `:1184` is the only teardown call
(`if (!retainWorkspace) destroyWorkspace(workspaceDir)`). **No pipeline code
change is needed.** What is narrow there is the comment at `:954-960`, which
names only `when a note's redaction AND its withheld preservation both failed`,
and row **G5** of `docs/specs/done/WP-dream-promote-in-workspace.md:465`, whose
teardown exception is scoped to `a workspace holding the sole surviving copy of
a note whose redaction and whose withheld preservation both failed`.

**The abort message is owned elsewhere and is cited, not restated.**
`secretGateAbortMessage` (`src/core/dream/validate.js:872`) composes it from four
fields decided by Table Q row **Q18** of
`docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1647`: the vault-relative path
in its exact `JSON.stringify` form; **which preserves failed**; what the on-disk
identity check could establish; and the surviving `redacted/` basename when one
exists. Q18 was written when only one arm could reach the abort, so its
"which preserves failed" enumeration has exactly two values, and the shipped
helper selects between them from whether a `redacted/` basename exists. Q18's
own text quantifies over "all three arms" and over the legacy `R0`/`R0b`
enumeration — universals an appended third value would leave false, which is why
its amendment (Implementation notes) delegates the taxonomy rather than
appending a literal.

**And Q18 is not the only owner this widens.** `WP-dream-promote-module` row Q4
names the OTHER half explicitly — *"its Table B row B3b decides the condition,
its Table Q row Q18 decides the message"* — and B3b
(`WP-secret-fence-ep2-redact-arm.md:1565`) still scopes that condition to
*"B3's OWN preserve returned `null` after ANY redact-arm fall-through"*. B3b's
CONDITION is already the right SHAPE — it says so in terms, *"the condition is a
byte-identity test, not a copy-existence test"* — so Table P generalises its
scope rather than replacing it. But that condition has **two conjuncts**, *"no
**durable** copy OF THE TARGET'S CURRENT BYTES"*, and this WP enforces only the
second: the byte-identity test moves from vacuous to real, while the durability
requirement stays where it has always been — written down and never enforced.
The amendment clause below therefore **defers that conjunct explicitly** rather
than calling the condition unchanged; saying "unchanged" would leave the amended
cell describing behaviour no code performs. Amending G5 and Q18 while leaving
B3b untouched would additionally leave Q4's cited condition owner contradicting
the canonical table, so B3b is amended in the same pass.

**What is and is not recorded about the ruling.** See **Dispatch
precondition**, above.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | Table P rows **P0**, **P0b**, **P1**–**P3**, the message discriminant and its pair rule, and **all of Table D**. Both the preservation primitive and the abort trigger live in this file already (`quarantinePreserve` and `makeGates(…).secret`), so neither table adds a new surface |
| modify | src/core/dream/promote.js | Table P row **P4** |
| modify | src/cli/dream.js | Table P row **P5** — the promote-`catch` comment replaced with the byte-exact text under Implementation notes. Comment only: no statement in this file changes, and V4 verifies the text |
| modify | tests/unit/dream-validate.test.js | evidence for Table P rows P0, P0b, P1–P3, P6 and for all of Table D. **Also: the commentary at `:1970-1978` and `:2040-2049` that this WP falsifies** — *"there is no second read to race, and no read that can fail"*, and the claim that the wrong-bytes and read-error arms are unreachable by construction. Under P0b there IS a read that can fail (the artifact read-back) and wrong bytes ARE detectable. Correct those passages to say what stays true: the arms retired were the VAULT-re-read arms, and the read P0b adds is of an artifact this gate just wrote |
| modify | tests/unit/dream-promote.test.js | evidence for Table P row **P4** |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | row **G5** only: a dated clause citing Table P for the trigger class. Nothing else in the file |
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | rows **Q18** and **B3b** only, each gaining the byte-exact clause given under Implementation notes. Nothing else in the file — no other row, no assertion, no mutation entry |

**Explicitly NOT in the boundary**, each for a stated reason:

- `tests/unit/dream-pipeline.test.js` — its row-G5 retention test at `:1276`
  stays correct and stays green. Its fixture is P3 and its comment describes
  that fixture, not the trigger; and the `catch` it exercises is arm-agnostic
  (Current state), so a second pipeline fixture would assert the same line
  twice.
- `src/core/dream/ledger.js` and `src/core/digest.js` — the banner and the
  `The withheld notes are in state/quarantine/.` line (`ledger.js:472`) need no
  edit: once P0 holds, no refusal reaches them with an empty record, so that
  sentence is true again. The banner's own defects are
  `WP-quarantine-banner-location`.
- `docs/THREAT-MODEL.md` — its T4 secret-lifecycle bullet promises preservation
  before withholding. This WP makes that promise enforced rather than
  best-effort; no sentence in it becomes false.

### Exact contracts

**The abort message needs a discriminant it does not have.** `P1`/`P2` and
`P3` reach `secretGateAbortMessage` with *identical* observable inputs — same
`rel`, no surviving `redacted/` basename, and the same identity disposition —
yet Table P gives them different values. Selecting on "is there a `redacted/`
basename", which is what the shipped helper does, cannot tell them apart. So the
helper's contract gains a fourth input: a **closed enum** whose members are
exactly Table P's **two active** message values, supplied by the call site, and
it is the only selector of that field.

```js
/** src/core/dream/validate.js
 *  @param {string} rel  vault-relative path
 *  @param {null} redactedName  ALWAYS null on a reachable abort (Table P row P3);
 *         a non-null value is a contract violation — see the pair rule below
 *  @param {string} identity  what the identity check could establish
 *  @param {'both-failed'|'no-redaction-attempted'} which
 *         selects Table P's value for the "which preserves failed" field
 *  @returns {string} */
function secretGateAbortMessage(rel, redactedName, identity, which)
```

**THE PAIR RULE, because four independent scalars can express states Table P
does not have.** Under P0b and P3 a surviving `redacted/` copy always recovers,
so no reachable abort has one. A call pairing either enum member with a non-null
`redactedName` is therefore not a message to render but a contract violation, and
it must **fail loud** rather than compose a message describing a copy that,
under this contract, cannot exist. `redactedName` is kept as a parameter rather
than deleted because Q18 — not this WP — owns that field; what this WP records is
that no arm it makes reachable supplies it.

`quarantinePreserve`'s signature is unchanged; what changes is what its
non-`null` return MEANS (Table P row **P0b**). The gate's verdict shape (`{ok}` /
`{refuse, reason, preserved}` / `{redact, sanitizedBytes, redaction, preserved}`)
is unchanged; what changes is that the `refuse` shape can no longer be returned
with an empty `preserved`.

## Contract reference

Activation trigger (ADR-0031, 2-of-7): **(ii)** the abort message's
"which preserves failed" taxonomy gains a value; **(iv)** error/abort behavior
changes; **(v)** the gate preserves, the promotion module refuses and the
pipeline retains — three parties, one invariant; **(vii)** the trigger appears in
code, in tests, in two Done specs' canonical rows and in a code comment. Four of
seven.

### Table P — canonical: the only-copy preservation class, its trigger, and the abort message value each arm carries

This table is the single place these facts are decided. Every other surface in
this spec cites it.

| # | Party / arm | The failure | Shipped behavior at `fc506110` (measured) | Required after this WP | Abort message's "which preserves failed" value |
|---|---|---|---|---|---|
| **P0** | The EP2 gate, as a whole | any preservation step leaves no VERIFIED artifact holding the bytes being judged — **Q4's byte-identity conjunct, which is the subset this WP enforces; Q4's durability conjunct is not decided here** (see below Table D) | not a stated rule; enforced on one arm only | **THE RULE: the gate never returns a `{refuse:true}` verdict whose `preserved` record is empty. That state raises the Q18 abort instead.** An arm whose `redacted/` copy survives **and is verified per P0b** is NOT this state — that copy is on the record and the run continues, exactly as today | — |
| **P0b** | Every preserving arm — **what a successful preservation MEANS** | the artifact does not hold the judged bytes: wrong bytes, a short write, or a file gone by the time anyone looks | **nothing is checked.** `quarantinePreserve` writes, renames, and returns the buffer it was HANDED (`validate.js:667-670`); no read-back. Measured, a corrupted write yields a non-empty record and no abort | **a preservation SUCCEEDS only if the artifact itself is read back and byte-compares equal to the judged bytes.** A mismatch, or an artifact that cannot be read, is a preservation FAILURE, reported exactly as an unwritable directory is, and P0 carries it to the abort. **What happens to the file that failure leaves behind is Table D's**, not this row's. The bytes a SUCCESS reports are **the bytes read back from the artifact**; every later use — P3's escape included — uses that verified value, never the input alias. **This row establishes byte-identity, NOT durability** — see "What this WP does not make durable" below Table D | — |
| **P1** | Gate, hard-secret withhold arm (`hasHardFinding` true) | `quarantinePreserve(…,'withheld')` returns `null` | **refuses with `preserved: []`, does not throw**; the run continues, commits, and teardown destroys the sole copy | abort (P0) | `the withheld copy could not be saved; no redaction copy was attempted` |
| **P2** | Gate, unscannable withhold arm — two causes: the delta record's `binary === true`, and bytes that are not lossless UTF-8 (`WP-ep2-unscannable-preserve`, Table U) | same step, same failure | **same as P1** | abort (P0) | same value as P1 — the redact arm is not entered on either cause |
| **P3** | Gate, redact fall-through arm (`redactFellThrough`) | the `redacted/` preserve failed, or the scrub produced nothing, AND the withheld preserve failed | **aborts, unless a `redacted/` copy survives** (`validate.js:1042`) — but its recoverable escape compares `afterBytes` against the alias `quarantinePreserve` returned (`:1054`), not against the artifact, so a corrupt artifact counts as recovery | **the abort trigger is unchanged; the ESCAPE is re-grounded on P0b's verified value.** A `redacted/` copy that P0b verified still means recoverable and still does not abort; one that P0b rejected never existed as a success and its file is gone (P0b (3)), so this arm never sees it. **Consequence, stated because it decides P6:** a surviving `redacted/` copy ALWAYS recovers, so every reachable abort has none — `redactedName` is `null` on every abort this gate can raise | `neither the redaction copy nor the withheld copy could be saved` — **the only value this arm can produce** |
| **P4** | `promote()` — Q4's module share, against an INJECTED gate it may not trust | the gate reports an empty preservation record on a **refusal** | the **redact** branch throws (`promote.js:1221`); the **refuse** branch at `:1195` does not check | the refuse branch throws too, with: `` promote: the secret gate's withhold arm reported no preserved copy for `<rel>` — the only-copy invariant is unsatisfied and nothing is promoted `` — naming the **withhold** arm, never reusing the redact arm's wording. **What P4 can and cannot establish, stated so nobody over-claims it:** the gate is INJECTED, so all this module can see is that the record is non-empty. It cannot verify an artifact — it never touches the state directory (Q7) — so the byte-identity guarantee is **P0b's alone**, and a fabricated or stale record from a defective gate defeats P4 by construction. P4 is the module refusing an obviously-unsatisfied invariant, not a second enforcement of it | — |
| **P5** | The pipeline's teardown (row G5) | any of the above throws out of `promote()` | **already class-wide**: `dream.js:940-963` is one `try`/`catch` around the whole call and inspects nothing about the error, so it retains the workspace on ANY throw from `promote()`; `:1184` is the only teardown call | **no code change.** The comment at `:954-960` and row G5 state the class (this table), not the one named case | — |
| **P6** | The message taxonomy — **TWO active values, one retired** | — | three values are defined and one, `the withheld copy could not be saved; the redaction copy was saved`, is **already unreachable** in the shipped tree (Current state); `tests/unit/dream-validate.test.js:1859-1862` asserts each arm's value present and the others absent | **the ACTIVE set is exactly two** — P1/P2's and P3's — and they stay **pairwise non-substring** so that absence assertion keeps discriminating. The third is **RETIRED to Q18 as history**, not deleted from that row: it belongs to the R0b arms the gate extraction already retired, this WP does not revive them, and no code path may produce it | — |

Three things this table does **not** change, stated so no one infers them.
**One:** `quarantinePreserve`'s destinations, naming and collision loop are
untouched — P0b changes only what its non-`null` return means, and it does not
conflict with that function's `ONE CAPTURED BUFFER` contract, which is about the
redact arm not re-reading the TARGET; reading back the ARTIFACT it just wrote is
a different read. **Two:** Q18's path and identity fields are untouched — on
every arm this WP makes reachable there is no `redacted/` copy, so the identity
disposition is the shipped `not performed, because there was no saved copy to
compare against` and no basename is rendered. **Three:** **the abort path
touches no USER state** — it does not revert, remove, commit, or write into the
vault or the user's git index (ADR-0004; nothing under promotion was ever
written to the vault, so there is nothing to undo). Everything P0b adds is
confined to `state/quarantine/` and to files this gate itself just wrote there:
one read-back, and — only on a failure — the removal of the one path this
invocation owns (Table D). **The collision loop is why D1 forbids touching
`dest` before the rename:** `-1`, `-2` suffixes exist because an EARLIER run may
already hold `<date>-<stem>.md`, so a pre-rename `dest` can name a file this
invocation never created. A run holds the dream lock throughout, so no second
dream is writing that directory while this one decides.

### Table D — canonical: artifact ownership and disposal

Table P row **P0b** decides WHEN a preservation fails. This table decides **which
file that failure leaves behind and who removes it** — a separate contract, with
its own states, and the one the round-3 gate found scattered across P0b's prose.
`quarantinePreserve` computes `tmp`, writes it, then renames it onto `dest`
(`validate.js:666-670`); its `catch` removes `tmp` best-effort and swallows any
failure to do so.

| # | State — what this invocation OWNS | Reached when | Shipped behavior at `fc506110` | Required after this WP |
|---|---|---|---|---|
| **D0** | **nothing** | before the temp write is attempted (no `stateDir`, a non-Buffer payload, `mkdir`/`chmod` threw) | returns `null`; nothing was created | unchanged — report failure, remove nothing |
| **D1** | **`tmp`** | the temp write was ATTEMPTED, and the rename has NOT completed — so a partial or complete secret-bearing temp file may exist | `catch` calls `rmSync(tmp, {force:true})` inside a `try {} catch {}` that **suppresses failure**, then returns `null` | remove `tmp` and **confirm it is absent**. `dest` is NOT owned in this state and **must not be touched**: the collision loop may have pointed `dest` at a candidate name, and an earlier run's artifact can sit there |
| **D2** | **`dest`** | the rename COMPLETED — `tmp` no longer exists under that name | no disposal path exists at all: nothing after the rename can fail today | remove `dest` and **confirm it is absent**. `tmp` is gone by definition and must not be chased |
| **D3** | — (any state) | the removal D1 or D2 requires cannot be completed | not reachable | **fail loud: a `WienerdogError` naming the path that could not be removed.** A suppressed failure is forbidden here — reporting "preservation failed" while secret-bearing bytes remain on disk under a name no preservation record, no cleanup pass and no abort message can reach is the false statement this table exists to prevent |
| **D4** | — | a preservation reports failure (returns `null`) | `null` means only "something went wrong" | **`null` means the owned path is absent.** Every caller already treats `null` as "no artifact"; this row is what makes that true |

**What this WP does not make durable, stated plainly rather than as an
out-of-scope note.** Neither P0b's read-back nor D1/D2's removal is crash-durable:
a read can be served from cache before the bytes and the directory entry are on
the medium, and an unlink is not durable until the containing directory is
flushed. That is the whole of `WP-quarantine-preserve-durability` (Draft), which
`depends_on` this WP and owns the sync protocol, the recursively-created-directory
entry problem, the platform's silent `F_FULLFSYNC` → `F_BARRIERFSYNC` → `fsync`
fallback, and the honest guarantee sentence. **This WP enforces Q4's
byte-identity conjunct and leaves its durability conjunct unmet; it weakens
nothing and widens no exposure:** the product contains no `fsync` today
(`grep -rn 'fsync\|fdatasync' src/ tests/` returns nothing at `fc506110`), so the
crash window is pre-existing and unchanged, while this WP strictly *reduces* it —
more runs now abort, and an abort retains the workspace instead of destroying the
sole copy. What is new is only that a preservation can no longer report success
over bytes it never verified.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table P. A review finding updates the
table and all of these in one pass; a new mirror found in review is added here
on the spot.

- [ ] **Deliverables cells** — the `src/core/dream/validate.js` row (P0, P0b,
      P1–P3, the discriminant), the `src/core/dream/promote.js` row (P4), the
      `src/cli/dream.js` row (P5), both test rows, and both `docs/specs/done/`
      rows (G5 → Table P's trigger class; Q18 + B3b → the clauses under
      Implementation notes).
- [ ] **Acceptance criteria** — every criterion below that names an arm, a
      message value, the empty-record rule, or P0b's verified artifact.
- [ ] **Verification commands** — V2 (P1/P2's message value), V3 (P4's
      message), V4 (P5's catch-comment sweep), V5 (the full-suite RED
      obligations, P0b's included).
- [ ] **Current state** — the three-arm measurement, the corrupt-artifact
      measurement and the alias claim about `:1054`, the `:1042` guard quote,
      the `promote.js:1195`/`:1221` asymmetry, and the `dream.js` arm-agnostic
      `catch` claim.
- [ ] **Operative prose** — the "Exact contracts" discriminant paragraph and its
      note that a `refuse` verdict can no longer carry an empty `preserved`; the
      three "does not change" paragraphs directly under Table P; the "what this
      WP does not make durable" paragraph under Table D; the two byte-exact
      amendment clauses under Implementation notes.
- [ ] **Mirrors outside this document (all inside the Deliverables boundary)** —
      the gate's `@throws` JSDoc and `quarantinePreserve`'s `@returns` in
      `validate.js`, the promote-`catch` comment in `dream.js` (byte-exact,
      Implementation notes), the now-false commentary at
      `tests/unit/dream-validate.test.js:1970-1978` and `:2040-2049`, row **G5**
      (`WP-dream-promote-in-workspace.md:465`), row **Q18**
      (`WP-secret-fence-ep2-redact-arm.md:1647`) and row **B3b** (same file,
      `:1565`).

## Implementation notes & constraints

- **Amending a `Done` spec's canonical row is an established move here, and it
  has a shape.** `WP-ep2-unscannable-preserve` amended `WP-dream-promote-module`
  the same way: the row keeps its original text and gains a **bolded, dated,
  successor-naming clause** — e.g. `(amended 2026-08-31;
  WP-ep2-unscannable-preserve, Table U owns the class)`. Append only. Do not
  re-author a row, do not restate Table P's members inside one, and do not touch
  any other row or any assertion in either file.
- **G5's clause is yours to word** (one sentence, dated, citing this WP and
  Table P for the trigger class). **Q18's and B3b's are not**, because both cells
  carry universals an append would silently falsify — `WP-dream-promote-module`
  row Q4 names **B3b** as the owner of the abort CONDITION, and B3b still scopes
  that condition to a redact-arm fall-through; Q18's holder list quantifies over
  "all three arms" and enumerates R0/R0b. Append these two clauses **byte-exactly**,
  each at the end of the row's first content cell:

  ```text
  **Amended 2026-09-02 (`WP-preservation-abort-widening`): the TRIGGER CLASS is that spec's Table P, which supersedes this row's scoping of the condition to a redact-arm fall-through. This row's condition has TWO conjuncts and they are now enforced separately. The BYTE-IDENTITY conjunct is ENFORCED for the first time: row P0b requires a preserved copy to be read back from the artifact and byte-compared, where this gate previously compared a buffer against itself. The DURABLE conjunct is PRESERVED AS WRITTEN AND EXPLICITLY DEFERRED: it has never been enforced — the product has no `fsync` — and `WP-preservation-abort-widening` does not enforce it either; it is `WP-quarantine-preserve-durability`'s, and until that lands this row states a standing obligation rather than shipped behaviour. Nothing here permits a teardown that this row's full condition forbids that was not already permitted. This clause restates none of Table P's members.**
  ```

  ```text
  **Amended 2026-09-02 (`WP-preservation-abort-widening`): the TAXONOMY of the "which preserves failed" field — its value set, and which arm carries which value — is that spec's Table P, and the field is selected by an explicit discriminant rather than by whether a `redacted/` copy exists. Table P's active set has TWO members; the value this row wrote for the R0b arms is RETIRED HISTORY, unreachable since the gate extraction retired those arms, and is kept here as the record of what they said rather than as a value any code path may produce. The surviving-`redacted/`-basename field is likewise unreachable on every arm Table P makes reachable, and is retained by this row for the same reason. The path and identity fields are unchanged. Every statement in this row and its holder list that quantifies over "all three arms" or over the R0/R0b enumeration is scoped to the arms that existed when it was written; Table P owns the current set. This clause restates no value.**
  ```

  Then re-read each amended cell WHOLE and report, in the PR body, any sentence
  the clause leaves false — the clause scopes the universals it names, and a
  cell can hold one it does not.
- **The gate is injected into `promote()`** (`promote.js` imports nothing from
  `validate.js`). P4 is therefore not redundant with P0 — it is the module
  refusing to trust a gate it does not own, which is exactly why the redact
  branch's check exists. Keep both.
- **P6 is load-bearing.** The existing message assertions require each arm's
  value to be present *and the other values absent*. A third value that is a
  substring of another would let that shape pass on the wrong message.
- The `recoverable` escape in P3 must survive, now grounded on P0b: an arm whose
  `redacted/` copy the artifact check accepted holds the judged bytes, so P0 is
  satisfied and there is nothing to abort.
- **The `src/cli/dream.js` comment is spec-owned prose, and this is its text.**
  Everything else about test and code design is the implementer's; this one
  string is a contract surface, because it is a registered mirror of Table P and
  because V4 verifies it byte-exactly. Replace the current comment body inside
  the promote-`catch` with exactly these ten lines, indentation included:

  ```text
        // ROW G5's SECOND teardown exception, and it is the only-copy invariant
        // (`WP-dream-promote-module`, Table Q row Q4). Under promotion the
        // destruction risk moved from the vault to the WORKSPACE rather than
        // vanishing: whenever a preservation step leaves no verified artifact
        // holding the bytes the gate judged, the workspace holds the sole
        // surviving copy of what the brain wrote, and removing it is the data
        // loss the abort exists to refuse. The trigger class is Table P of
        // `WP-preservation-abort-widening`; this catch names no member of it,
        // and inspects no error, so it holds for every member. The run fails
        // loud with the tree intact.
  ```

- **THE CIRCUIT-BREAKER FIRED, AND THIS SPLIT IS WHAT IT BOUGHT (2026-09-02).**
  Two consecutive design-gate rounds landed on preservation durability — round 2
  "no durability", round 3 "durability protocol incomplete" — so the next move was
  a design move, not a third patch: the ownership contract that IS this WP's was
  pulled into **Table D**, and durability was extracted whole into
  `WP-quarantine-preserve-durability` (Draft). The round records carry the rest.
  **Why extracted rather than tabled here:** the architect's own sizing rule
  (`.claude/agents/wd-architect.md:17`) is *"If you can't write literal
  verification commands for it, split it."*, and crash
  durability has none — a crash cannot be staged inside `npm test`, so the only
  cheap evidence is a call-order assertion, which round 3 itself showed proves
  nothing (libuv degrades `F_FULLFSYNC` → `F_BARRIERFSYNC` → `fsync` silently, so
  even a successful call does not establish the guarantee). Every other row in
  both tables has real black-box evidence. Two rounds each surfaced a durability
  sub-property the previous had not enumerated, which is the signature of a
  contract whose surface is not yet known — and an unbounded surface inside an S
  package is what the circuit-breaker exists to stop.
- **The one window that remains even after verification, grounded rather than
  waved away.** P0b's read-back does not detect an artifact mutated or removed
  between that read and teardown. Closing it would need a re-verification at
  teardown, which would move `src/cli/dream.js` from comment-only to code and
  widen this boundary. **It is a named, already-accepted residual rather than a
  new one:** the only actor that can reach `state/quarantine/` (0700, user-owned)
  between those two points is arbitrary same-user native code, which
  `docs/THREAT-MODEL.md:425` places outside the trust boundary in terms —
  *"Any code running as the same OS user can already read the 0600 tokens and
  rewrite the 0600 grant store; that is the same file-permission trust boundary
  as T4, deliberately not raised above it in v1."* That is the **A12** residual
  the threat model carries throughout, and this WP inherits it without widening
  it.
- Test design, fixture shapes and the mechanics of each required RED are the
  implementer's (`docs/runbooks/spec-authoring.md`). This spec states the
  observable contracts and what evidence must exist; it names no test.
- No new npm dependencies; no `.ts` under `src/`; ADR-0004 — nothing started
  that outlives its call.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] The abort message renders `rel`, a path chosen by whatever wrote the note
      and therefore **attacker-influenceable**, and on P1/P2 this message is the
      only surface that reaches the user. Q18 already decides the defense —
      `JSON.stringify(rel)`, quotes included, never raw bytes and never a lossy
      sanitizer — and the new arms go through the same
      `secretGateAbortMessage`. Required property, evidence required, mechanism
      left open: for a `rel` carrying a newline and an ANSI escape, the rendered
      message contains **no raw newline and no ESC byte** and still identifies
      the note. (JS `$`-anchoring is not involved; no value here reaches a shell
      or a filesystem path.)
- [ ] No preserved byte, matched secret, or line of the note enters the message
      — metadata only, as Q18 requires. **P0b reads the artifact back and keeps
      the buffer, but nothing new reaches a user surface**: the read-back buffer
      is internal to the gate — it becomes the value a successful preservation
      reports, and is used by the scrub and by P3's escape — and neither it nor
      the judged bytes are rendered, logged, or recorded anywhere. The only new
      user-visible effect is that a preservation can now fail where it used to
      claim success.

## Acceptance criteria

- [ ] **P0b verification**: a preservation whose artifact does not hold the
      judged bytes, and one whose artifact cannot be read back, are both reported
      as FAILURES.
- [ ] **P0b's reported bytes**: the bytes a successful preservation reports are
      the artifact's, not the input alias, and P3's recoverable escape decides on
      that value.
- [ ] **Table D, state D1** (write attempted, rename not completed — a failing
      write, and a failing rename): `tmp` is removed and confirmed absent, and
      `dest` is **not touched**. Evidence must include the case where a
      collision candidate already occupies `dest`, showing that file survives
      byte-unchanged.
- [ ] **Table D, state D2** (rename completed, verification then failed):
      `dest` is removed and confirmed absent, on both the mismatch and the
      read-error path.
- [ ] **Table D, D3**: a removal that cannot be completed raises a
      `WienerdogError` naming the path, rather than returning a preservation
      failure. No cleanup failure is suppressed.
- [ ] **Table D, D4**, as the property that ties D0–D2 together, and scoped to
      **the paths this invocation owns** — not to the quarantine tree at large,
      which legitimately holds earlier runs' artifacts: after **any** preservation
      failure, the `tmp` this call wrote and the `dest` it renamed onto are both
      absent, and **every pre-existing file in the quarantine tree — the D1
      collision candidate included — is byte-identical to what it was before the
      call**. Evidence must run against a NON-EMPTY quarantine: an empty-fixture
      test satisfies the first half vacuously and cannot see the second at all.
- [ ] **P0** holds: the EP2 gate returns no `{refuse:true}` verdict with an empty
      `preserved` record. Driven on P1 (hard secret) and on **both** of P2's
      causes (`record.binary === true`; bytes that are not lossless UTF-8), with
      preservation made to fail, the gate **throws** instead of refusing.
- [ ] Each of those aborts carries Table P's P1/P2 value, does not carry P3's,
      renders the path in its exact `JSON.stringify` form, states the identity
      disposition as not performed, and names no `redacted/` basename.
- [ ] The discriminant is what selects that field: the only difference between a
      P1/P2 abort and a P3 abort is the discriminant itself — same path, same
      absent basename, same identity disposition, different value.
- [ ] **The pair rule**: a call pairing either enum member with a non-null
      `redactedName` fails loud instead of rendering a message.
- [ ] **P3 in both directions**: both-preserves-failed still aborts with its
      shipped value; a `redacted/` copy that P0b accepted still does **not**
      abort, still refuses the note, and still reports that copy on the
      preservation record.
- [ ] **P6**: the two ACTIVE values are pairwise non-substring and each arm's
      evidence shows the other absent. No code path produces the retired third
      value, and no evidence asserts it.
- [ ] **P4**: `promote()` throws on a refusal verdict carrying an empty
      preservation record, with a message naming the **withhold** arm; the redact
      arm's existing check and message are unchanged; nothing is published and
      the working copy is byte-unchanged.
- [ ] **P5**: the promote-`catch` comment in `src/cli/dream.js` is byte-identical
      to the ten lines under Implementation notes.
- [ ] The commentary at `tests/unit/dream-validate.test.js:1970-1978` and
      `:2040-2049` no longer claims that no preservation read can fail or that
      wrong-byte and read-error cases are unreachable.
- [ ] Rows **G5**, **Q18** and **B3b** each carry their dated clause and no other
      edit; Q18's and B3b's are byte-exact per Implementation notes. `git diff`
      shows one changed line per row and no other line in either file.
- [ ] The abort path writes nothing outside `state/quarantine/`: no vault byte,
      no commit, no index change, and the note's own bytes are byte-identical
      after the abort.
- [ ] Idempotence: `N/A — this WP ships no command and writes nothing outside
      the repo; it changes an in-run refusal path.`
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# V1
npm test
npm run lint

# V2 — P1/P2's message value reaches the gate and the tests. `grep -oF | wc -l`
#      counts OCCURRENCES; `grep -Fc` counts matching LINES and would accept two
#      copies on one line.
test "$(grep -oF 'no redaction copy was attempted' src/core/dream/validate.js | wc -l | tr -d ' ')" = 1
test "$(grep -oF 'no redaction copy was attempted' tests/unit/dream-validate.test.js | wc -l | tr -d ' ')" -ge 1

# V3 — P4's message exists and the redact arm's wording was not reused for it
test "$(grep -oF "withhold arm reported no preserved copy" src/core/dream/promote.js | wc -l | tr -d ' ')" = 1
test "$(grep -oF "redact arm reported no preserved copy" src/core/dream/promote.js | wc -l | tr -d ' ')" = 1
test "$(grep -oF "withhold arm reported no preserved copy" tests/unit/dream-promote.test.js | wc -l | tr -d ' ')" -ge 1

# V4 — P5. NOT a phrase sweep: the comment is spec-owned text (Implementation
#      notes), so this compares it byte-for-byte. `cb` extracts the promote-catch
#      block; both delimiters are unique in the file (one `res = promote({`, one
#      `throw err;`). A deleted comment, a moved file, a reworded sentence and a
#      synonym of the old cross-product claim are all RED, which no substring
#      check achieved.
cb() { awk '/res = promote\(\{/{f=1} f{print} f && /throw err;/{exit}' src/cli/dream.js; }
cb | sed -n '/} catch (err) {/,$p' | grep '^ *//' > /tmp/wd-catch-actual.txt
sed -n '/^        \/\/ ROW G5.s SECOND teardown exception/,/^        \/\/ loud with the tree intact\.$/p' \
  docs/specs/WP-preservation-abort-widening.md > /tmp/wd-catch-expected.txt
test "$(wc -l < /tmp/wd-catch-expected.txt | tr -d ' ')" = 10   # the literal was found in the spec
diff -u /tmp/wd-catch-expected.txt /tmp/wd-catch-actual.txt
```

- **V2 and V3 are lexical guards, and that is all they are.** Neither can
  establish that a literal is *asserted* rather than merely present; that is the
  acceptance criteria's job and the review gates'. V4 is different in kind: it
  compares spec-owned text to the tree, so it establishes exactly its claim.
  Observe and paste all three states for each: **absent** (rename the file away
  → red), **compliant** (→ green), **violating** (the literal reworded; the catch
  comment deleted, reworded, or replaced by a synonym of the old cross-product
  claim → red). Measured at `fc506110`, before any edit: V2 red, V3's withhold
  line red, V4's diff red; and on a simulated compliant tree V4's diff green.
- **V5 — the behaviours that need counterfactual evidence.** Against a
  full-suite baseline that is GREEN on the finished state, produce for each
  behaviour below a tree in which that behaviour alone is undone, run the
  **full** `npm test` (no name filter — a filter cannot select a test whose name
  this spec must not prescribe), and paste a real red **that names a failing
  assertion in this WP's own changed test deliverables**. That last requirement
  is the non-vacuity proof, and it replaces any global test-count floor: a count
  moves when main moves and proves nothing about this diff.
  1. The trigger cannot be silently narrowed back to the redact fall-through.
  2. P4's refuse-branch check cannot be removed unnoticed.
  3. P6's two active values still discriminate.
  4. P0b's read-back is load-bearing.
  5. Table D's disposal is load-bearing in **both** owned states — the
     pre-rename `tmp` and the post-rename `dest` — and neither cleanup failure
     can be suppressed.
  How each counterfactual tree is produced is the implementer's.

## Out of scope (do NOT do these)

- The quarantine banner's location and its self-falsifying text
  (`src/core/dream/ledger.js`, `src/core/digest.js`) —
  `WP-quarantine-banner-location`, which `depends_on` this WP.
- Any change to Q18's other three fields, to Q4 itself, or to any row of either
  `Done` spec other than G5, Q18 and B3b.
- **Making preservation crash-durable** — the sync protocol, the
  recursively-created-directory entry, the platform's silent `F_FULLFSYNC`
  fallback, the honest guarantee sentence, and a directory sync after an unlink.
  All of it is `WP-quarantine-preserve-durability` (Draft, `depends_on` this WP),
  extracted under the circuit-breaker; the paragraph under Table D states what
  this WP therefore does and does not establish, and why the exposure is
  unchanged rather than widened.
- Re-verifying a preserved artifact at teardown. It would move
  `src/cli/dream.js` from comment-only to code and widen this boundary, and the
  window it would close is the A12 same-user-native residual the threat model
  already carries — grounded, with its sentence quoted, under Implementation
  notes.
- A second pipeline-level fixture in `tests/unit/dream-pipeline.test.js` — see
  the Deliverables exclusions.
- The criterion→test-name mapping harness — `WP-criterion-red-harness`.
- **Discovered issue to report in the PR body, not to fix here** (measured at
  `fc506110`, previously routed to the architect, not this WP's subject):
  `neutralise()` is duplicated in `src/cli/dream.js` and
  `src/core/dream/promote.js` with no single owner — one security contract, two
  code carriers.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including V4's three states and V5's green baseline plus one red per
   behaviour, each red naming a failing assertion in this WP's own tests.
2. Conventional commits; PR titled
   `fix(dream): widen the only-copy abort trigger to its class (WP-preservation-abort-widening)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
