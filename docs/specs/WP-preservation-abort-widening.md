---
id: WP-preservation-abort-widening
title: Widen the only-copy abort trigger from the named case to its class
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0012, ADR-0031, ADR-0034]
epic: dream-promotion
---

# WP-preservation-abort-widening: Widen the only-copy abort trigger from the named case to its class

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

That preservation is best-effort: `quarantinePreserve` returns `null` on any
failure (unwritable state directory, a file where the quarantine directory must
be, a full disk). When it fails, the workspace holds the **sole surviving copy**
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
package. It is not a new product decision — it is making three code sites agree
with a canonical row that already shipped.

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
`docs/specs/logbook/2026-08-31-pr55-gate-raw-round2-wd-reviewer.txt:83`:

> `HARD SECRET  : THROWN null | WORKSPACE SURVIVES false | BYTES SURVIVE false`
> `UNSCANNABLE  : THROWN null | WORKSPACE SURVIVES false | BYTES SURVIVE false`
> […] Table Q row Q4 says the invariant "binds every party that could destroy a
> working copy". G5 scopes it to the redaction-AND-preservation cross-product,
> which is narrower than Q4. **Route to wd-architect** — the fix is a decision
> about G5's scope, not an implementer edit.

**The promotion module guards one arm and not the other.**
`src/core/dream/promote.js:1221` throws `the only-copy invariant is unsatisfied
and nothing is promoted` when the **redact** arm reports an empty preservation
record. The **refuse** arm at `:1195` reads the same record
(`readRecord(verdict.preserved, rel, 'refuse')`) and never checks it.

**The pipeline's teardown exception is already class-wide in code.**
`src/cli/dream.js:947-963` wraps the whole `promote()` call in
`catch (err) { retainWorkspace = true; throw err; }`, so *any* throw out of
`promote()` retains the workspace; `:1184` is the only teardown call
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
"which preserves failed" enumeration has exactly two values (mirrored in
`tests/unit/dream-validate.test.js:1843-1844` as `ABORT.bothFailed` and
`ABORT.onlyWithheldFailed`). Table P below adds the third and changes nothing
else about Q18.

**What is and is not recorded about the ruling.** See "Dispatch precondition".

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | in `makeGates(…).secret`: satisfy Table P rows P0–P3 (the trigger) and extend `secretGateAbortMessage`'s "which preserves failed" branch with P1/P2's value. Update the gate's `@throws` JSDoc, which today says "the one case" |
| modify | src/core/dream/promote.js | Table P row **P4**: give the `verdict.refuse` branch the empty-record check the `verdict.redact` branch already has, with P4's message |
| modify | src/cli/dream.js | Table P row **P5**, comment only: the `catch` at `:954-960` states the class, not the one named case. No behavior change — the `catch` is already arm-agnostic |
| modify | tests/unit/dream-validate.test.js | assert Table P rows P0–P3 and P6 (see Acceptance criteria); the `ABORT` map at `:1842` is a registered mirror of Table P's message column |
| modify | tests/unit/dream-promote.test.js | assert Table P row **P4** |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | row **G5** only: amend its only-copy sentence to cite Table P for the trigger class, with a dated amendment note. Follow the shape `WP-ep2-unscannable-preserve` used on `WP-dream-promote-module.md`. Change nothing else in that file |
| modify | docs/specs/done/WP-secret-fence-ep2-redact-arm.md | row **Q18** only: a dated amendment note appending Table P's third "which preserves failed" value. Q18's other three fields, its assertions and its mutation coverage are untouched |

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

```js
/** src/core/dream/validate.js — unchanged signature, one added branch.
 *  @param {string} rel  vault-relative path
 *  @param {string|null} redactedName  the surviving `redacted/` basename, if any
 *  @param {string} identity  what the on-disk check could establish
 *  @returns {string} */
function secretGateAbortMessage(rel, redactedName, identity)
```

The three "which preserves failed" values are decided in Table P. The gate's
verdict shape (`{ok}` / `{refuse, reason, preserved}` / `{redact, sanitizedBytes,
redaction, preserved}`) is unchanged; what changes is that the `refuse` shape can
no longer be returned with an empty `preserved`.

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
| **P0** | The EP2 gate, as a whole | any preservation step leaves no durable artifact holding the bytes being judged | not a stated rule; enforced on one arm only | **THE RULE: the gate never returns a `{refuse:true}` verdict whose `preserved` record is empty. That state raises the Q18 abort instead.** An arm whose `redacted/` copy survives and is byte-identical to the judged bytes is NOT this state — that copy is on the record and the run continues, exactly as today | — |
| **P1** | Gate, hard-secret withhold arm (`hasHardFinding` true) | `quarantinePreserve(…,'withheld')` returns `null` | **refuses with `preserved: []`, does not throw**; the run continues, commits, and teardown destroys the sole copy | abort (P0) | `the withheld copy could not be saved; no redaction copy was attempted` |
| **P2** | Gate, unscannable withhold arm — two causes: the delta record's `binary === true`, and bytes that are not lossless UTF-8 (`WP-ep2-unscannable-preserve`, Table U) | same step, same failure | **same as P1** | abort (P0) | same value as P1 — the redact arm is not entered on either cause |
| **P3** | Gate, redact fall-through arm (`redactFellThrough`) | the `redacted/` preserve failed, or the scrub produced nothing, AND the withheld preserve failed | **aborts, unless a byte-identical `redacted/` copy survives** (`validate.js:1042`) | **UNCHANGED in behavior**, including the recoverable escape | the two shipped values, unchanged: `neither the redaction copy nor the withheld copy could be saved` / `the withheld copy could not be saved; the redaction copy was saved` |
| **P4** | `promote()` — Q4's module share, against an INJECTED gate it may not trust | the gate reports an empty preservation record on a **refusal** | the **redact** branch throws (`promote.js:1221`); the **refuse** branch at `:1195` does not check | the refuse branch throws too, with: `` promote: the secret gate's withhold arm reported no preserved copy for `<rel>` — the only-copy invariant is unsatisfied and nothing is promoted `` — naming the **withhold** arm, never reusing the redact arm's wording | — |
| **P5** | The pipeline's teardown (row G5) | any of the above throws out of `promote()` | **already class-wide**: `dream.js:947-963` retains the workspace on ANY throw from `promote()`; `:1184` is the only teardown call | **no code change.** The comment at `:954-960` and row G5 state the class (this table), not the one named case | — |
| **P6** | The three message values above | — | two values, pairwise non-substring; `tests/unit/dream-validate.test.js:1859-1862` asserts each arm's value is present and **the others absent** | **the three values stay pairwise non-substring**, so that absence assertion keeps discriminating | — |

Two things this table does **not** change, stated so no one infers them:
Q18's other three fields (path rendering, identity disposition, surviving
basename) are untouched — on P1 and P2 there is no `redacted/` copy, so the
identity disposition is the shipped `not performed, because there was no saved
copy to compare against` and no basename is rendered. And **the abort path
touches no user state**: it does not revert, remove, commit, or write into the
vault or the user's git index (ADR-0004; nothing under promotion was ever
written to the vault, so there is nothing to undo).

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table P. A review finding updates the
table and all of these in one pass; a new mirror found in review is added here
on the spot.

- [ ] **Deliverables cells** — the `src/core/dream/validate.js` row (P0–P3 +
      message), the `src/core/dream/promote.js` row (P4), the
      `src/cli/dream.js` row (P5), both test rows, and both `docs/specs/done/`
      rows (G5 → P5, Q18 → the message column).
- [ ] **Acceptance criteria** — every criterion below that names an arm, a
      message value, or the empty-record rule.
- [ ] **Verification commands** — V2 (P1/P2's message value), V3 (P4's
      message), V4 (P5's stale comment sweep), V5 (the narrow-back mutations).
- [ ] **Current state** — the three-arm measurement table, the `:1042` guard
      quote, the `promote.js:1195`/`:1221` asymmetry, and the `dream.js`
      arm-agnostic `catch` claim.
- [ ] **Operative prose** — the "Exact contracts" note that a `refuse` verdict
      can no longer carry an empty `preserved`; the two "does not change"
      paragraphs directly under Table P.
- [ ] **Out-of-spec mirrors this WP must move** — the `ABORT` map at
      `tests/unit/dream-validate.test.js:1842`, the gate's `@throws` JSDoc in
      `validate.js`, the `dream.js:954-960` comment, row **G5**
      (`WP-dream-promote-in-workspace.md:465`) and row **Q18**
      (`WP-secret-fence-ep2-redact-arm.md:1647`).

## Dispatch precondition (one owner confirmation; changes no Deliverables row)

**What is recorded, and what is not.** The stub this spec replaces cited an owner
ruling that "widened the G5 trigger from the specific named case to the whole
class, on Q4's 'every party' binding". **That ruling text is not recorded
anywhere in this tree** — not in `docs/specs/`, `docs/specs/done/`,
`docs/specs/logbook/`, `docs/adr/`, `memory/`, or any commit message. What *is*
recorded is (a) the review-gate finding quoted under Current state, which routes
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
row that already binds every party; P0–P5 make three code sites conform to it.
That is a defect fix against an existing contract, not a product choice, and
holding it for a ruling nobody recorded would leave the measured data loss in
place. What needs a word from the owner is only its blast radius.

**The one question for the owner.** Rows P0–P3 make the *whole run* fail loud on
two arms that today only refuse one note. Confirm that blast radius, or say the
two new arms should refuse-and-continue instead.

**Recommendation: confirm fail-loud, and it is close to free.** Q4 forbids
destroying the working copy, and the pipeline has no shape in which one note's
workspace survives while the run continues — teardown is all-or-nothing (P5).
The trigger is a broken quarantine directory, which fails *every* preserve in the
run, so any soft-finding note in the same run already aborts it today via P3;
the widening changes which note reports the failure far more often than whether
the run fails. And the failure is recoverable by hand: the workspace is retained
and the transcript ledger is not advanced, so the sessions are retried next run.

**Do not dispatch until this is answered.** A "refuse-and-continue" answer
changes rows P0–P2 and their criteria; it changes no path in the Deliverables
table.

## Implementation notes & constraints

- **Amending a `Done` spec's canonical row is an established move here, and it
  has a shape.** `WP-ep2-unscannable-preserve` amended `WP-dream-promote-module`
  the same way: the row keeps its original text and gains a **bolded, dated,
  successor-naming clause** — e.g. `(amended 2026-08-31;
  WP-ep2-unscannable-preserve, Table U owns the class)`. Do that for **G5** and
  **Q18** and nothing more: do not re-author either row, do not restate Table P
  inside them, and do not touch any other row or any assertion in either file.
- **The gate is injected into `promote()`** (`promote.js` imports nothing from
  `validate.js`). P4 is therefore not redundant with P0 — it is the module
  refusing to trust a gate it does not own, which is exactly why the redact
  branch's check exists. Keep both.
- **P6 is load-bearing.** The existing assertion helper asserts each arm's
  message value is present *and the other values absent*. A third value that is
  a substring of another would make that helper pass on the wrong message.
- The `recoverable` escape in P3 must survive: an arm whose `redacted/` copy is
  byte-identical to the judged bytes has a durable artifact, so P0 is satisfied
  and there is nothing to abort.
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
      `secretGateAbortMessage`. Assert on a P1 or P2 fixture with a hostile
      `rel` containing a newline and an ESC byte that the rendered message
      contains **neither a raw newline nor an ESC byte** and still identifies
      the note. (JS `$`-anchoring is not involved; no value here reaches a shell
      or a filesystem path.)
- [ ] No preserved byte, matched secret, or line of the note enters the message
      — metadata only, as Q18 requires.

## Acceptance criteria

- [ ] **P0** holds: the EP2 gate returns no `{refuse:true}` verdict with an empty
      `preserved` record. Driven on P1 (hard secret) and on **both** of P2's
      causes (`record.binary === true`; bytes that are not lossless UTF-8), with
      preservation made to fail, the gate **throws** instead of refusing.
- [ ] Each of those aborts carries Table P's P1/P2 value for "which preserves
      failed", carries neither of P3's two values, renders the path in its exact
      `JSON.stringify` form, states the identity disposition as not performed,
      and names no `redacted/` basename.
- [ ] **P3 is unchanged in both directions**: both-preserves-failed still
      aborts with its shipped value; a surviving byte-identical `redacted/` copy
      still does **not** abort, still refuses the note, and still reports that
      copy on the preservation record.
- [ ] **P6**: the three "which preserves failed" values are pairwise
      non-substring, and each arm's assertion still shows the other two absent.
- [ ] **P4**: `promote()` throws on a refusal verdict carrying an empty
      preservation record, with a message naming the **withhold** arm; the
      redact arm's existing check and message are unchanged; nothing is
      published and the working copy is byte-unchanged.
- [ ] **P5**: the `src/cli/dream.js` comment no longer describes the teardown
      exception as the redaction-AND-preservation cross-product — that file is
      the only carrier of the claim in `src/`, measured at `fc506110` by the
      flattened sweep in V4 run over every `src/**/*.js`. Row G5 and row Q18
      carry their dated amendment clauses and no other edit.
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

# V2 — P1/P2's message value exists once in the gate and is asserted in tests
test "$(grep -Fc 'no redaction copy was attempted' src/core/dream/validate.js)" = 1
test "$(grep -Fc 'no redaction copy was attempted' tests/unit/dream-validate.test.js)" -ge 1

# V3 — P4's message exists in the module and is asserted, and the redact arm's
#      wording was not reused for it
test "$(grep -Fc "withhold arm reported no preserved copy" src/core/dream/promote.js)" = 1
test "$(grep -Fc "redact arm reported no preserved copy" src/core/dream/promote.js)" = 1
test "$(grep -Fc "withhold arm reported no preserved copy" tests/unit/dream-promote.test.js)" -ge 1

# V4 — P5's stale mirror sweep. The claim WRAPS ACROSS COMMENT LINES, so a
#      line-oriented grep cannot see it: strip `//`, flatten, squeeze. The
#      second command is the non-vacuity anchor — without it a moved or emptied
#      file makes the negated grep read greenest exactly where the work was
#      never done. Scoped to src/cli/dream.js: tests/unit/dream-pipeline.test.js
#      legitimately describes its own P3 fixture in these words.
flat() { sed 's://::g' "$1" | tr '\n' ' ' | tr -s ' '; }
test -f src/cli/dream.js
flat src/cli/dream.js | grep -Fq "ROW G5"
! flat src/cli/dream.js | grep -Fq "withheld preservation both failed"

# V5 — THE NARROW-BACK PROOF. Apply each mutation, run the suite, observe RED,
#      then revert. Paste all three outputs.
#   (a) restore the old guard in src/core/dream/validate.js:
#       `if (redactFellThrough && !preserved) {`   -> must FAIL
#   (b) delete P4's empty-record check from promote.js's refuse branch
#                                                  -> must FAIL
#   (c) change P1/P2's message value to `the withheld copy could not be saved`
#       (a substring of P3's second value, breaking P6)
#                                                  -> must FAIL
npm test -- --test-name-pattern "EP2|only-copy|Q4|dream-promote"
```

- V2, V3 and V4 are **new** steps and each is an assertion that exits non-zero
  on failure. Observe and paste all three states for each: **absent** (rename
  the file away → red), **compliant** (→ green), **violating** (the literal
  reworded, or the cross-product wording left in the `dream.js` comment → red).
  Measured at `fc506110`, before any edit: V2 red, V3's withhold line red, V4's
  third command red — so none of them is a check that cannot fail.
- V5 is the both-directions proof for the behavior itself: the suite must be
  green on the finished state and red under each of (a), (b) and (c).

## Out of scope (do NOT do these)

- The quarantine banner's location and its self-falsifying text
  (`src/core/dream/ledger.js`, `src/core/digest.js`) —
  `WP-quarantine-banner-location`, which `depends_on` this WP.
- Any change to Q18's other three fields, to Q4, or to any row of either `Done`
  spec other than G5 and Q18.
- A second pipeline-level fixture in `tests/unit/dream-pipeline.test.js` — see
  the Deliverables exclusions.
- The criterion→test-name mapping harness — `WP-criterion-red-harness`.
- **Discovered issues to report in the PR body, not to fix here** (all measured
  at `fc506110`, all previously routed to the architect and none of them this
  WP's subject): `neutralise()` is duplicated in `src/cli/dream.js` and
  `src/core/dream/promote.js` with no single owner; row **V1** of
  `WP-dream-promote-in-workspace.md` contradicts row **G12** on the
  changed-extract record, and the code follows G12, so V1's "Inherited by" cell
  is the stale mirror.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including V5's three red runs.
2. Conventional commits; PR titled
   `fix(dream): widen the only-copy abort trigger to its class (WP-preservation-abort-widening)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
