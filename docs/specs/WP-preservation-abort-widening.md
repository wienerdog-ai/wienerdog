---
id: WP-preservation-abort-widening
title: Widen the only-copy abort trigger from the named case to its class
status: Ready
model: sonnet
size: S
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
row that already binds every party; P0–P5 make the gate, the promotion module
and the pipeline's own record of the rule agree with it.
That is a defect fix against an existing contract, not a product choice, and
holding it for a ruling nobody recorded would leave the measured data loss in
place. What needs a word from the owner is only its blast radius.

**The one question for the owner.** Rows P0–P3 make the *whole run* fail loud on
two arms that today only refuse one note, and P0b adds a third occasion: an
artifact that was written but does not hold the judged bytes. Confirm that blast
radius, or say the added arms should refuse-and-continue instead.

**Recommendation: confirm fail-loud, and it is close to free.** Q4 forbids
destroying the working copy, and the pipeline has no shape in which one note's
workspace survives while the run continues — teardown is all-or-nothing (P5).
The trigger is a broken quarantine directory, which fails *every* preserve in the
run, so any soft-finding note in the same run already aborts it today via P3;
the widening changes which note reports the failure far more often than whether
the run fails. P0b costs nothing extra in shape: a rejected artifact reports
failure like any other, so it flows into the arms above rather than opening a new
one. And the failure is recoverable by hand: the workspace is retained and the
transcript ledger is not advanced, so the sessions are retried next run.

**Do not dispatch until this is answered.** A "refuse-and-continue" answer
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
package. It is not a new product decision — it is making the gate, the promotion
module and the pipeline's own record of the rule agree with a canonical row that
already shipped.

## Current state

Every claim below was measured in this tree at `fc506110` on 2026-09-01.

**There are exactly two preservation steps on the dream path**, and both are in
the EP2 gate. `quarantinePreserve` is defined at `src/core/dream/validate.js:642`
and has exactly two call sites — `:1017` (`kind='redacted'`) and `:1040`
(`kind='withheld'`); no other module writes a durable copy of judged bytes.
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
durable artifact holds the judged bytes. The same gap makes the redact
fall-through's **recoverable escape** vacuous: `Buffer.compare(afterBytes,
redactCopy.bytes)` (`validate.js:1054`) compares `afterBytes` against the alias
of itself that `quarantinePreserve` returned, never against the artifact, so a
corrupt artifact counts as recovery. Both reviewers of round 1 reproduced this
independently. It is why Table P row **P0b** exists: "empty record" is only a
sound operationalization of Q4 once a non-empty record means a VERIFIED
artifact.

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
CONDITION is already the right test — it says so in terms, *"the condition is a
byte-identity test, not a copy-existence test"* — and Table P generalises its
SCOPE rather than replacing it. Amending G5 and Q18 while leaving B3b narrow
would leave Q4's cited condition owner contradicting the canonical table, so
B3b is amended in the same pass.

**What is and is not recorded about the ruling.** See **Dispatch
precondition**, above.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | Table P rows **P0**, **P0b**, **P1**–**P3** and the message discriminant. Both the verification of a preserved artifact and the abort trigger live in this file already (`quarantinePreserve` and `makeGates(…).secret`), so P0b adds no new surface |
| modify | src/core/dream/promote.js | Table P row **P4** |
| modify | src/cli/dream.js | Table P row **P5** — comment only, no behavior change |
| modify | tests/unit/dream-validate.test.js | evidence for Table P rows P0, P0b, P1–P3 and P6 |
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
`P3`'s both-failed arm reach `secretGateAbortMessage` with *identical*
observable inputs — same `rel`, no surviving `redacted/` basename, and the same
identity disposition — yet Table P gives them different values. Selecting on
"is there a `redacted/` basename", which is what the shipped helper does, cannot
tell them apart. So the helper's contract gains a fourth input: a **closed
enum** whose members are exactly Table P's three message rows, supplied by the
call site, and it is the only selector of that field.

```js
/** src/core/dream/validate.js
 *  @param {string} rel  vault-relative path
 *  @param {string|null} redactedName  the surviving `redacted/` basename, if any
 *  @param {string} identity  what the identity check could establish
 *  @param {'both-failed'|'only-withheld-failed'|'no-redaction-attempted'} which
 *         selects Table P's value for the "which preserves failed" field
 *  @returns {string} */
function secretGateAbortMessage(rel, redactedName, identity, which)
```

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
| **P0** | The EP2 gate, as a whole | any preservation step leaves no durable artifact holding the bytes being judged | not a stated rule; enforced on one arm only | **THE RULE: the gate never returns a `{refuse:true}` verdict whose `preserved` record is empty. That state raises the Q18 abort instead.** An arm whose `redacted/` copy survives **and is verified per P0b** is NOT this state — that copy is on the record and the run continues, exactly as today | — |
| **P0b** | Every preserving arm — **what a successful preservation MEANS** | the write and rename succeed but the artifact does not hold the judged bytes: wrong bytes, a short write, or the file gone by the time anyone looks | **not checked at all.** `quarantinePreserve` returns the buffer it was handed (`validate.js:667-670`); measured, a corrupted write yields a non-empty record and no abort | **a preservation SUCCEEDS only if the artifact itself is shown to hold the judged bytes** — established by reading the artifact back after the rename and byte-comparing, never by returning the input buffer. A mismatch, or an artifact that cannot be read, **is a preservation failure**: it reports failure exactly as an unwritable directory does, and P0 then carries it to the abort. The bytes a successful preservation reports are **the bytes read back from the artifact**, and every later use of them — P3's recoverable escape included — uses that verified value, never the input alias | — |
| **P1** | Gate, hard-secret withhold arm (`hasHardFinding` true) | `quarantinePreserve(…,'withheld')` returns `null` | **refuses with `preserved: []`, does not throw**; the run continues, commits, and teardown destroys the sole copy | abort (P0) | `the withheld copy could not be saved; no redaction copy was attempted` |
| **P2** | Gate, unscannable withhold arm — two causes: the delta record's `binary === true`, and bytes that are not lossless UTF-8 (`WP-ep2-unscannable-preserve`, Table U) | same step, same failure | **same as P1** | abort (P0) | same value as P1 — the redact arm is not entered on either cause |
| **P3** | Gate, redact fall-through arm (`redactFellThrough`) | the `redacted/` preserve failed, or the scrub produced nothing, AND the withheld preserve failed | **aborts, unless a `redacted/` copy survives** (`validate.js:1042`) — but its recoverable escape compares `afterBytes` against the alias `quarantinePreserve` returned (`:1054`), not against the artifact, so a corrupt artifact counts as recovery | **the abort trigger is unchanged; the ESCAPE is re-grounded on P0b's verified value.** A `redacted/` copy that P0b verified still means recoverable and still does not abort; one that P0b rejected never existed as a success, so this arm never sees it | the two shipped values, unchanged: `neither the redaction copy nor the withheld copy could be saved` / `the withheld copy could not be saved; the redaction copy was saved` |
| **P4** | `promote()` — Q4's module share, against an INJECTED gate it may not trust | the gate reports an empty preservation record on a **refusal** | the **redact** branch throws (`promote.js:1221`); the **refuse** branch at `:1195` does not check | the refuse branch throws too, with: `` promote: the secret gate's withhold arm reported no preserved copy for `<rel>` — the only-copy invariant is unsatisfied and nothing is promoted `` — naming the **withhold** arm, never reusing the redact arm's wording. **What P4 can and cannot establish, stated so nobody over-claims it:** the gate is INJECTED, so all this module can see is that the record is non-empty. It cannot verify an artifact — it never touches the state directory (Q7) — so the byte-identity guarantee is **P0b's alone**, and a fabricated or stale record from a defective gate defeats P4 by construction. P4 is the module refusing an obviously-unsatisfied invariant, not a second enforcement of it | — |
| **P5** | The pipeline's teardown (row G5) | any of the above throws out of `promote()` | **already class-wide**: `dream.js:940-963` is one `try`/`catch` around the whole call and inspects nothing about the error, so it retains the workspace on ANY throw from `promote()`; `:1184` is the only teardown call | **no code change.** The comment at `:954-960` and row G5 state the class (this table), not the one named case | — |
| **P6** | The three message values above | — | two values, pairwise non-substring; `tests/unit/dream-validate.test.js:1859-1862` asserts each arm's value is present and **the others absent** | **the three values stay pairwise non-substring**, so that absence assertion keeps discriminating | — |

Three things this table does **not** change, stated so no one infers them.
**One:** `quarantinePreserve`'s destinations, naming and collision loop are
untouched — P0b changes only what its non-`null` return means, and it does not
conflict with that function's `ONE CAPTURED BUFFER` contract, which is about the
redact arm not re-reading the TARGET; reading back the ARTIFACT it just wrote is
a different read. **Two:** Q18's other three fields (path rendering, identity disposition, surviving
basename) are untouched — on P1 and P2 there is no `redacted/` copy, so the
identity disposition is the shipped `not performed, because there was no saved
copy to compare against` and no basename is rendered. **Three:** **the abort path
touches no user state** — it does not revert, remove, commit, or write into the
vault or the user's git index (ADR-0004; nothing under promotion was ever
written to the vault, so there is nothing to undo). P0b adds one read of a file
this gate itself just wrote inside `state/quarantine/`, and nothing else.

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
      three "does not change" paragraphs directly under Table P; the two
      byte-exact amendment clauses under Implementation notes.
- [ ] **Mirrors outside this document (all inside the Deliverables boundary)** —
      the gate's `@throws` JSDoc and `quarantinePreserve`'s `@returns` in
      `validate.js`, the promote-`catch` comment in `dream.js`, row **G5**
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
  **Amended 2026-09-01 (`WP-preservation-abort-widening`): the TRIGGER CLASS is that spec's Table P, which supersedes this row's scoping of the condition to a redact-arm fall-through. The byte-identity CONDITION this row decides is unchanged — Table P generalises it rather than replacing it — and this clause restates none of Table P's members.**
  ```

  ```text
  **Amended 2026-09-01 (`WP-preservation-abort-widening`): the TAXONOMY of the "which preserves failed" field — its value set, and which arm carries which value — is that spec's Table P, and the field is selected by an explicit discriminant rather than by whether a `redacted/` copy exists. This row's other three fields are unchanged. Every statement in this row and its holder list that quantifies over "all three arms" or over the R0/R0b enumeration is scoped to the arms that existed when it was written; Table P owns the current set. This clause restates no value.**
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
  `redacted/` copy the artifact check accepted has a durable artifact, so P0 is
  satisfied and there is nothing to abort.
- **What P0b's read-back does and does not establish, stated rather than
  implied.** It shows the artifact held the judged bytes at the moment it was
  written. It is not a durability guarantee against later corruption, and this
  spec claims none. It is at the right point regardless: Q4's obligation is about
  what this run may then DESTROY, and the run destroys the workspace within the
  same invocation.
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
      — metadata only, as Q18 requires. **P0b reads the artifact back but adds
      nothing to any surface**: the read-back's only output is a boolean, and
      neither the artifact's bytes nor the judged bytes are rendered, logged or
      recorded anywhere.

## Acceptance criteria

- [ ] **P0b**: a preservation whose write and rename succeed while the artifact
      does not hold the judged bytes — and one whose artifact cannot be read
      back — are both reported as preservation FAILURES, not successes. RED
      required: against the shipped `quarantinePreserve`, which returns the
      buffer it was handed, this evidence must fail.
- [ ] **P0b, second half**: the bytes a successful preservation reports are the
      artifact's, not the input alias, and P3's recoverable escape decides on
      that value. RED required: an escape re-grounded on the alias must fail.
- [ ] **P0** holds: the EP2 gate returns no `{refuse:true}` verdict with an
      empty `preserved` record. Driven on P1 (hard secret) and on **both** of
      P2's causes (`record.binary === true`; bytes that are not lossless UTF-8),
      with preservation made to fail, the gate **throws** instead of refusing.
- [ ] Each of those aborts carries Table P's P1/P2 value for "which preserves
      failed", carries neither of P3's two values, renders the path in its exact
      `JSON.stringify` form, states the identity disposition as not performed,
      and names no `redacted/` basename.
- [ ] The discriminant is what selects that field, shown by the only difference
      between a P1/P2 abort and a P3 both-failed abort being the discriminant
      itself: same path, same absent basename, same identity disposition,
      different value.
- [ ] **P3 is unchanged in both directions**: both-preserves-failed still aborts
      with its shipped value; a `redacted/` copy that P0b accepted still does
      **not** abort, still refuses the note, and still reports that copy on the
      preservation record.
- [ ] **P6**: the three "which preserves failed" values are pairwise
      non-substring, and each arm's evidence still shows the other two absent.
- [ ] **P4**: `promote()` throws on a refusal verdict carrying an empty
      preservation record, with a message naming the **withhold** arm; the
      redact arm's existing check and message are unchanged; nothing is
      published and the working copy is byte-unchanged.
- [ ] **P5**: the `src/cli/dream.js` promote-`catch` comment cites this WP and
      Table P's class, and no longer scopes the exception to the
      redaction-AND-preservation cross-product. That comment is the only carrier
      of the claim in `src/`, measured at `fc506110` by V4's sweep run over every
      `src/**/*.js`.
- [ ] Rows **G5**, **Q18** and **B3b** each carry their dated clause and no other
      edit; Q18's and B3b's are byte-exact per Implementation notes. `git diff`
      shows one changed line per row and no other line in either file.
- [ ] The abort path writes nothing outside `state/quarantine/`: no vault byte,
      no commit, no index change, and the note's own bytes are byte-identical
      after the abort.
- [ ] Idempotence: `N/A — this WP ships no command and writes nothing outside
      the repo; it changes an in-run refusal path.`
- [ ] `npm test` and `npm run lint` pass, and `npm test` reports strictly more
      tests than main's 2444 (measured at `fc506110`: 2444 tests, 2432 pass, 12
      skipped, 0 fail).

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

# V4 — P5, bound to the promote-`catch` BLOCK rather than to a string that also
#      occurs elsewhere in the file. `cb` extracts exactly that block; both its
#      delimiters are unique in the file (one `res = promote({`, one
#      `throw err;`). Deleting the comment makes the anchor red, which the
#      previous `ROW G5` anchor did not: that string also appears at teardown.
cb() { awk '/res = promote\(\{/{f=1} f{print} f && /throw err;/{exit}' src/cli/dream.js; }
flat() { sed 's://::g' | tr '\n' ' ' | tr -s ' '; }
test "$(cb | wc -l | tr -d ' ')" -ge 12          # the block was located at all
cb | grep -q 'WP-preservation-abort-widening'    # the comment cites this WP's class
! cb | flat | grep -Eqi 'both fail'              # no cross-product scoping survives
```

- **V2, V3 and V4 are lexical guards, and that is all they are.** Each exits
  non-zero on failure; none can establish that a comment *means* the class or
  that a literal is *asserted* rather than merely present. Those are the
  acceptance criteria's job and the review gates'. Observe and paste all three
  states for each: **absent** (rename the file away → red), **compliant**
  (→ green), **violating** (the literal reworded; the catch comment deleted;
  the cross-product wording still inside the catch → red). Measured at
  `fc506110`, before any edit: V2 red, V3's withhold line red, V4's anchor red
  and V4's stale check red.
- **V5 — the RED obligations.** For each of these, produce a tree in which that
  rule ALONE is undone and paste a real red run of the **full** `npm test` (not a
  name-filtered subset — a filter cannot select a test whose name this spec does
  not prescribe, and must not):
  1. P0b's artifact check removed → the P0b evidence goes red.
  2. P3's escape re-grounded on the input alias → the P0b second-half evidence
     goes red.
  3. P0's trigger narrowed back to the redact fall-through → the P1/P2 evidence
     goes red.
  4. P4's refuse-branch check removed → the P4 evidence goes red.
  5. P1/P2's message value made a substring of one of P3's → the P6 evidence
     goes red.
  How each tree is produced is the implementer's; what must be pasted is the
  red. The count check in the last acceptance criterion is the non-vacuity
  guard: it proves new tests actually ran, without constraining their names.

## Out of scope (do NOT do these)

- The quarantine banner's location and its self-falsifying text
  (`src/core/dream/ledger.js`, `src/core/digest.js`) —
  `WP-quarantine-banner-location`, which `depends_on` this WP.
- Any change to Q18's other three fields, to Q4 itself, or to any row of either
  `Done` spec other than G5, Q18 and B3b.
- Any durability guarantee beyond P0b's read-back — no `fsync`, no journal, no
  re-verification of an artifact after the run. See Implementation notes for what
  P0b does and does not establish.
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
   including V5's five red runs and the `npm test` count above main's 2444.
2. Conventional commits; PR titled
   `fix(dream): widen the only-copy abort trigger to its class (WP-preservation-abort-widening)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
