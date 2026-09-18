---
id: WP-doctor-recognizes-parse-threw
title: Teach `wienerdog doctor` to name the parse-threw skip instead of calling it unrecognized
status: Done
model: sonnet
size: S
depends_on: [WP-dream-collect-parse-throw-quarantine]
adrs: [ADR-0004, ADR-0005, ADR-0023, ADR-0031, ADR-0042]
epic: transcript-fault-boundary
---

# WP-doctor-recognizes-parse-threw: Teach `wienerdog doctor` to name the parse-threw skip instead of calling it unrecognized

> **Errata, 2026-09-18 (post-merge) — NONE. The fidelity gate recorded
> *"No drift; no errata for the done-flip."***
>
> **Landed in PR #288** (merge `cc1d63be`, 2026-09-18 13:59:48 UTC), tip
> `1e0d4c9e`. **Both PR gates are clean on that tip, in ONE round:** wd-reviewer
> returned APPROVE with executed evidence, and the independent gate (Codex
> plugin `review` on `gpt-6-astra`) returned *"The change correctly counts and
> renders parse-threw quarantines while preserving the catch-all and preventing
> false all-clear output."*; CI seven checks pass.
>
> **Numbers on `1e0d4c9e`.** The fidelity gate, in its own detached worktree:
> `npm test` 2906 tests / 2894 pass / **0 fail** / 12 skipped; `npm run lint`
> clean; `boundary-check` exit 0. The implementer's **UNFILTERED**
> `npm run red-proofs` on that tip: **104 declared proof(s), 104 selected**,
> `RUN: PROVEN`, **104 PROVEN**, and **zero** `FAILED`, `VACUOUS`,
> `UNCONTROLLED`, `FILTERED` or `ERROR` — read from the implementer's own
> unfiltered log, not inferred.
>
> **What the gate executed, so the "no errata" verdict is legible.** Both
> `grep` gates and the three-state render gate reproduce the PR body
> byte-for-byte — state (a) by reverting `src/cli/doctor.js` to base, (b) by
> dropping `parseThrew` from `total`, (c) on the tip. The six-line *"being
> skipped"* block rendered through `bin/wienerdog.js doctor` is byte-exact to
> this spec's Exact-contracts block **including order**; row **A5** sits after
> `read-error` and before `secret-exhausted`; row **A8**'s catch-all still counts
> 3; the all-zero healthy line is covered by four pre-existing tests;
> `tests/golden/` is untouched and no golden renders this surface (measured).
> The RED mutation `dpt-arm-removed-falls-to-unrecognized` was hand-applied —
> `--test-name-pattern='\[PT-1\]'` selects exactly one test and reddens
> `ERR_ASSERTION` with the signal in the diagnostic — and every declaration in
> both `doctor` proofs files still matches its `occurrences`. The four touched
> files are byte-identical between this spec's pin `08de2bc3` and the merge-base
> `4b5d2655`.
>
> **Reviewer notes, non-errata — three non-blocking observations the gate
> recorded for a future pass.** None falsifies a spec sentence and none is a
> defect in what shipped; they are recorded here rather than dropped, per the
> standing rule that a gate finding is fixed or dispositioned, never silently
> lost.
>
> 1. **`tests/unit/doctor.test.js:794`'s test title no longer observes one of
>    the things it claims.** The title ends *"…, zero-member groups omitted, and
>    no name ever leaks"*, but after this package the fixture that test drives
>    has no zero-member group left to omit. The assertion it does make is
>    correct; the title over-states its own reach. A future pass either restores
>    a zero-member group to the fixture or drops that clause from the title.
> 2. **`[PT-2]`'s anchor in `tests/unit/doctor.test.js` also pins `[ok]`.** The
>    anchor chosen for the parse-threw-only-ledger case incidentally constrains
>    the neighbouring `[ok]` text, so an unrelated change to the `[ok]` line can
>    redden a test whose subject is the parse-threw arm. Narrowing the anchor is
>    a test-side edit with no contract consequence.
> 3. **Five intended test-side spellings of the Table A row A4 literal.** A4
>    pins the message literal to **one site in `src/`**, which is what the `grep`
>    gate asserts and what shipped. The literal is additionally spelled five
>    times on the **test** side, deliberately — each an independent pin — but no
>    surface says so, so a reader counting occurrences repo-wide finds six and
>    cannot tell which count A4 governs. A future pass states the test-side
>    multiplicity beside A4.

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog's core function is the **dream**: a nightly, scheduled run that reads
the session transcripts two AI coding harnesses leave on disk — Claude Code's
`~/.claude/projects/<project>/<uuid>.jsonl` and Codex CLI's
`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` — and consolidates them into the
user's markdown memory vault. **Wienerdog is just files (ADR-0004):** every
command runs and exits; there is no daemon, no server and no telemetry, and
nothing in this work package may introduce one. There are no runtime npm
dependencies; this package adds none.

Transcript content is fully attacker-influenceable, so every read is bounded and
a file the reader cannot handle is recorded in
`~/.wienerdog/state/transcript-ledger.json` as **quarantined** — skipped on every
later run until the file changes (ADR-0023). A quarantine record is
`{fingerprint, outcome:'quarantined', reason, updated_at, harness}`, keyed by the
case-folded absolute path. Quarantines surface to the user in exactly three
places: an exact count in the digest banner, an exact count in
`wienerdog doctor`, and the full enumeration in `reports/warnings.md` in the
vault, which is the enumeration's **one home** (ADR-0023 Amendment 2). `doctor`
counts; it never names a file, a path, a session id or a stored `reason` string.

`WP-dream-collect-parse-throw-quarantine` (PR #271, merged `900dd6d4`) added a
**fourth** intake quarantine reason, `parse-threw`: a transcript whose
preparation throws inside the dream collector is now set aside under that reason
instead of ending the whole run. It wired the new reason into the ledger
(`INFORMATIONAL_QUARANTINE_REASONS`) and into `reports/warnings.md` (a `GROUPS`
row), but **not** into `wienerdog doctor` — its own Table A row A7 and its Out of
scope both declined `src/cli/doctor.js`, and its owner item 3 recorded the
consequence in advance. So today `doctor` tells the user that N transcripts are
*"being skipped for a reason this version does not recognize"* about a reason
this version itself emits: the count is truthful, the sentence is not. **This
package fixes exactly that sentence**, and nothing else.

## Current state

**Base: `08de2bc335baa4a97bba2f33bca224f2f3a28517`** (`main` after PR #274).
Every citation below was derived **construct by construct** at that tip, both
ends of every range checked.

**`src/cli/doctor.js`** — `quarantineReport(stateDir, vaultPath)` is declared at
`:498` and is the only surface this package touches. Its JSDoc (`:487-497`)
states the surface's standing rule in terms: *"No basename, path, session id or
stored `reason` string is ever rendered: the unrecognized-reason row is a fixed
message, and the enumeration's one home is that vault warnings file — never this
surface."* The function is read-only: it never throws, never writes, never
migrates, and reads the ledger — never the vault warnings file, which is derived
from it and can legitimately lag by one dream run.

Its body has four parts, in this order:

1. **Five counters**, `:505-509` — `overCeiling`, `tooManyLines`, `readError`,
   `secretExhausted`, `unrecognized`, each `let … = 0;` on its own line.
2. **One `switch (rec.reason)`**, `:514-529`, inside a loop over the ledger's
   records that skips any record that is not a plain object (`:512`) and any
   whose `outcome` is not `'quarantined'` (`:513`). The arms, in file order, are
   `case 'over-ceiling':` (`:515-517`), `case 'too-many-lines':` (`:518-520`),
   `case 'read-error':` (`:521-523`), `case SECRET_REVERT_EXHAUSTED_REASON:`
   (`:524-526`) and `default: unrecognized++;` (`:527-528`). **There is no
   `case 'parse-threw':` arm, so a `parse-threw` record falls to `default`.**
3. **The zero gate**, `:532-535` —
   `const total = overCeiling + tooManyLines + readError + secretExhausted + unrecognized;`
   and, when `total === 0`, an early return of the single `ok` line
   `no session transcripts are being skipped`. **Every counter that exists is an
   addend of `total`**; a counter left out of it would make its own records
   invisible and, when they are the only quarantines, would make `doctor` claim
   there are none.
4. **Five `if (<counter> > 0)` render blocks**, in fixed order, each pushing one
   `{status:'warn', msg}`: over-ceiling (`:538-543`), too-many-lines
   (`:544-549`), read-error (`:550-555`), secret-exhausted (`:556-561`) and
   unrecognized (`:562-567`). Then one pointer line (`:569`) and `return out`
   (`:570`). The three intake messages are, verbatim:

```
${overCeiling} session transcript(s) are being skipped: the session file is bigger than Wienerdog will read
${tooManyLines} session transcript(s) are being skipped: the session file has too many lines to read
${readError} session transcript(s) are being skipped: the session file could not be read
```

and the catch-all message at `:565` is, verbatim:

```
${unrecognized} session transcript(s) are being skipped for a reason this version does not recognize
```

**`src/core/dream/warnings.js`** — `GROUPS` (`:108-124`) maps reason → heading
for `reports/warnings.md`, in emission order. It already carries the row this
package mirrors: `:116` is
`{ reason: 'parse-threw', heading: 'Something in the session file stopped Wienerdog from reading it' },`
and it sits **after** the `read-error` row (`:115`) and **before** the
`SECRET_REVERT_EXHAUSTED_REASON` row (`:117-122`), with the catch-all
`{ reason: null, … }` last (`:123`). **No edit is made to this file** — it is
cited because it is where the wording and the position this package adopts were
already decided.

**`src/core/dream/ledger.js:47`** —
`const INFORMATIONAL_QUARANTINE_REASONS = Object.freeze(['over-ceiling', 'too-many-lines', 'read-error', 'parse-threw']);`
— `parse-threw` is already a member, so the digest banner already covers it.
**No edit is made to this file.**

**`tests/unit/doctor.test.js`** — the suite already pins this surface's whole
render. The test at `:794`, *"doctor: every Table A reason class renders its
exact message, in row order, with exact counts, zero-member groups omitted, and
no name ever leaks"*, seeds a ledger with three `over-ceiling`, one
`too-many-lines`, two `read-error`, one `secret-revert-exhausted`, one
unrecognized-reason record under a hostile key, one record with a missing
`reason` and one whose `reason` is the number `42`; it reads the five rows'
indices out of the output (`:820-824`), asserts all five were found and that
their **order** is `idxOC < idxTML < idxRE < idxSRE < idxUnrec` (`:825-826`),
asserts each row's **byte-exact** message (`:827-833`, `:835`), and asserts that
no key, reason string or ANSI escape leaks (`:836-837`). Its unrecognized count
is **3** (`:835`) — the hostile key, the missing reason and the non-string
reason. `quarantinedRecord(<reason>)` and `seedLedger(core, {…})` are the
suite's existing helpers.

**`tests/red-proofs/quarantine-banner-location-doctor.proofs.json`** — an
existing ADR-0042 declaration file whose `suite` is `tests/unit/doctor.test.js`.
It carries **two** declarations, and exactly one of them mutates the file this
package edits: `pointer-derivation-doctor` mutates `src/core/dream/ledger.js`,
which is not in the Deliverables, while
`doctor-shelf-claim-restored` mutates `src/cli/doctor.js` with
the exact-substring `find`
`` "too many times in a row. ${PRESERVED_COPIES_POINTER}`," `` at
`occurrences: 1` — which is the tail of the secret-exhausted message at `:559`.
**This package must not re-spell that line**, or that declaration becomes
unapplicable and the unfiltered proof run reports `ERROR`. Inserting a whole new
block **before** `:556` does not touch it; that is the checked condition under
"Verification steps".

**Golden fixtures: none render this surface, measured.** `tests/golden/` holds
exactly `claude-adapter/CLAUDE.md`, `codex-adapter/AGENTS.md`,
`digest-default.md` and `vault-default/` — harness-config, digest and vault
outputs. `grep -rl "being skipped" tests/golden/` returns **nothing** at this
tip. **No golden file changes in this package, and none may.** That is asserted
as acceptance criterion 5.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | Table A in full — rows A1–A6 only. `quarantineReport` only; no other function in the file changes |
| modify | tests/unit/doctor.test.js | Whatever the acceptance criteria require in this file. Criteria 1–4 all observe this surface; criterion 2 is an assertion about the **existing** test at `:794`, whose seeded ledger and whose row-order and count assertions both move |
| create | tests/red-proofs/doctor-recognizes-parse-threw.proofs.json | Table B — `suite` is `tests/unit/doctor.test.js`. A second declaration file for the same suite is normal here: `tests/unit/dream-pipeline.test.js` already carries five |

### Exact contracts

`quarantineReport`'s signature and return type are **unchanged**:

```js
/** @param {string} stateDir   the core state dir (getPaths().state)
 *  @param {string|null} vaultPath  readVaultPath(paths.config)
 *  @returns {Array<{status:'ok'|'warn'|'info', msg:string}>} */
function quarantineReport(stateDir, vaultPath)
```

**The whole `wienerdog doctor` quarantine block**, as it must render for a
ledger holding one quarantine of every class — one `over-ceiling`, one
`too-many-lines`, one `read-error`, one `parse-threw`, one
`secret-revert-exhausted` and one record whose `reason` is a value this version
does not know. Six lines, in this order, each prefixed by `doctor`'s own
`[warn]` marker (the secret-exhausted line is shown with its pointer elided as
`<PRESERVED_COPIES_POINTER>`, which is `ledger.js`'s exported constant and is
not re-spelled by this package):

```
[warn] 1 session transcript(s) are being skipped: the session file is bigger than Wienerdog will read
[warn] 1 session transcript(s) are being skipped: the session file has too many lines to read
[warn] 1 session transcript(s) are being skipped: the session file could not be read
[warn] 1 session transcript(s) are being skipped: something in the session file stopped Wienerdog from reading it
[warn] 1 session transcript(s) are being skipped: the notes made from them were withheld by the secret check too many times in a row. <PRESERVED_COPIES_POINTER>
[warn] 1 session transcript(s) are being skipped for a reason this version does not recognize
```

The fourth line is the only new one. Its literal is decided by **Table A row
A4** and its position by **Table A row A5**.

## Contract reference

The ADR-0031 activation trigger fires on **three** of the seven tests, so the
discipline is on: (ii) a **status/result taxonomy** changes — `doctor`'s render
taxonomy gains a fifth recognized class and its catch-all loses a member;
(iv) **fallback behavior** changes — a reason that fell to `default:` now has
its own arm; (vii) the **same contract appears in multiple mirrored surfaces**,
enumerated in the checklist below. Operative prose cites the tables rather than
restating them.

### Contract table(s)

**Table A — the `parse-threw` row in `wienerdog doctor`.** The single place its
facts are decided. Rows A6 and A7 are decisions that a surface is **not**
changed; they are in the table because "no edit" is a fact the review must be
able to check in one place.

| Row | Fact / rule | Value |
|-----|-------------|-------|
| A1 | The counter | One new `let` counter in `quarantineReport`, beside the five at `src/cli/doctor.js:505-509`. Name and placement are the implementer's; everything else about it is decided by rows A2, A3 and A5. |
| A2 | The `switch` arm | One new `case 'parse-threw':` arm in the `switch (rec.reason)` at `:514-529`, incrementing row A1's counter and `break`ing, exactly as the three sibling intake arms do. The reason literal `parse-threw` is **code-owned** — it is written here as a literal and is never derived from, interpolated with, or compared against anything read out of the ledger record beyond `rec.reason` itself. |
| A3 | The zero gate | Row A1's counter is added to the `total` sum at `:532`. **This is load-bearing, not bookkeeping:** without it, a ledger whose only quarantines are `parse-threw` records makes `total === 0` and `doctor` returns the single `ok` line `no session transcripts are being skipped` — a false all-clear. Acceptance criterion 3 is this row. |
| A4 | The message literal | Exactly, and byte for byte: `` `${<counter>} session transcript(s) are being skipped: something in the session file stopped Wienerdog from reading it` ``. It is the three sibling intake messages' register — `N session transcript(s) are being skipped: <lowercase clause>` — carrying the same words `src/core/dream/warnings.js:116` already uses as this reason's heading in `reports/warnings.md`, lowercased into the clause position. The two surfaces say the same thing in the same words on purpose: a user who reads the `doctor` line and then opens the warnings file must not have to work out that they are about the same condition. |
| A5 | The row's position | The new `if (<counter> > 0)` render block sits **after** the `read-error` block (`:550-555`) and **before** the `secret-exhausted` block (`:556-561`), which mirrors `GROUPS`' order in `src/core/dream/warnings.js:115-117` exactly. The rendered order becomes over-ceiling, too-many-lines, read-error, **parse-threw**, secret-exhausted, unrecognized. |
| A6 | What is never rendered | **Unchanged rule, newly applicable.** `quarantineReport`'s JSDoc (`:487-497`) already binds this surface: no basename, path, session id or stored `reason` string is ever rendered. The new row renders **one integer plus fixed text** and nothing else. In particular it does not render `rec.reason`, even though the arm matched on it. |
| A7 | Surfaces that do **not** change | `src/core/dream/warnings.js` (the `GROUPS` row already exists, `:116`), `src/core/dream/ledger.js` (`parse-threw` is already in `INFORMATIONAL_QUARANTINE_REASONS`, `:47`), `src/core/dream/scratch.js`, `src/cli/dream.js`, every file under `tests/golden/`, and `tests/red-proofs/quarantine-banner-location-doctor.proofs.json`. None is in the Deliverables. |
| A8 | The catch-all still catches | **Unchanged code, and it must stay observable.** `default: unrecognized++;` (`:527-528`) and its render block (`:562-567`) are not touched. A reason this version does not know — including a missing `reason` and a non-string `reason` — still lands there and still renders the `:565` message. Acceptance criterion 4 is this row. |
| A9 | ADR status | **No ADR amendment.** ADR-0023 Amendment 2 already assigns `doctor` an exact count per reason class and assigns the enumeration to `reports/warnings.md` alone; this package adds one class to a taxonomy that is already the ADR's, introduces no record field, no counter in the ledger, no new state and no new surface. |

**Table B — the declared RED proof (ADR-0042).** One file,
`tests/red-proofs/doctor-recognizes-parse-threw.proofs.json`, whose `suite` is
`tests/unit/doctor.test.js`.

| Proof id | Criterion | Mutation (exact-substring, in `src/cli/doctor.js`) | What it proves |
|----------|-----------|-----------------------------------------------------|----------------|
| `dpt-arm-removed-falls-to-unrecognized` | 1 | remove Table A row A2's `case 'parse-threw':` arm — the mutation's `find` is that arm's exact text and its `replace` is a comment marker, so a `parse-threw` record falls back to `default:` and its count re-joins the unrecognized row | the assertion observes the **new row's literal and the unrecognized row's count together**, not merely that some warn line appeared. Under the mutation `doctor` still exits 0, still reports the right **total**, and still prints five warn lines — only the wording changes. A test that counted lines, or matched `/being skipped/`, would stay green over exactly the defect this package exists to fix |

**`expectRed` is MEASURED, never predicted.** The `expectRed` test-name set
above is left to the implementer to measure by hand-applying the mutation and
running the suite under the declaration's own `testNamePattern`; the Criterion
column is an authoring intent, not a measurement.
`WP-dream-collect-parse-throw-quarantine` shipped a Criterion column that two of
its four declarations then falsified (its Erratum 2), for a mechanical reason
that applies here too: **`testNamePattern` selects a whole tagged suite, not the
one criterion a mutation was written for**, so a mutation reddens every selected
test that observes the mutated fact. Derive the set from the filtered run.

**Binding on every test in this package, not a suggestion:**
`scripts/red-proofs.js:1655` refuses any red whose failure `code` is not
`ERR_ASSERTION` — *"a thrown error is not an assertion failure"*. And
`scripts/red-proofs.js:716-717` refuses an empty `signal`: each `expectRed`
entry's `signal` must be a non-empty substring that appears in the failing
**assertion message** (`:1658-1659` searches the diagnostic text for it), so
every assertion this package's proof declares must carry its tag in its own
message string, not only in the test name.

### Mirrored Surface Checklist

Every surface below defers to its canonical table. A review finding updates the
table and all its mirrors **in the same commit** — no commit exists in which the
canonical table and a registered mirror disagree (update-all-mirrors) — and any
new mirror found in review is added here on the spot (register-new-mirrors):

- [ ] Deliverables-table cells that restate a path or rule — `doctor.js` → Table
      A rows A1–A6; `doctor.test.js` → the acceptance criteria; the proofs file
      → Table B
- [ ] Acceptance criteria that assert its facts — criterion 1 asserts Table A
      rows A2 and A4 (row **A5**, the row's position, is criterion 2's, not
      criterion 1's); criterion 2 asserts Table A rows A5 and A6 through the
      existing whole-render test; criterion 3 asserts Table A row A3; criterion
      4 asserts Table A row A8; criterion 5 asserts Table A row A7; criterion 6
      asserts Table B
- [ ] Verification commands / greps — the `node -e` render gate asserts Table A
      rows A3, A4, A5, A6 and A8 on a real seeded ledger; the two `grep` gates
      assert Table A row A4's **one site** and Table A row A7's untouched
      secret-exhausted line; `npm test` carries every criterion's suite
      assertions; the **UNFILTERED** `npm run red-proofs` asserts Table B
- [ ] Current-state description — the counter list, the `switch` arms and the
      absent `parse-threw` arm (Table A rows A1, A2, A8), the `total` sum and
      the zero gate (row A3), the three sibling message literals and the
      catch-all literal (rows A4, A8), the five render blocks in fixed order
      (row A5), `quarantineReport`'s JSDoc rule (row A6), `GROUPS` and
      `INFORMATIONAL_QUARANTINE_REASONS` (row A7), the existing whole-render
      test at `doctor.test.js:794` (criterion 2), the existing doctor proofs
      file (row A7), and the measured absence of any golden that renders this
      surface (row A7) — all pinned to base `08de2bc3`
- [ ] Operative prose steps that apply it — **walked, in document order**:
      - Context's closing paragraph ("fixes exactly that sentence, and nothing
        else") → Table A rows A7 and A9
      - "Exact contracts"' six-line block → Table A rows A4 and A5; its
        `<PRESERVED_COPIES_POINTER>` elision → Table A row A7 and Implementation
        notes' re-spelling trap
      - the Contract-reference preamble's three ADR-0031 tests → Table A rows
        A2/A4 (taxonomy), row A8 (fallback) and this checklist (mirrored
        surfaces)
      - Implementation notes' "do not re-spell the secret-exhausted line" bullet
        → Table A row A7; its "the counter must reach `total`" bullet → Table A
        row A3; its "one integer plus fixed text" bullet → Table A row A6
      - the Security checklist's bullets → Table A rows A2 and A6
      - Out of scope's entries → Table A rows A7 and A9

## Implementation notes & constraints

- **No new npm dependencies** (CLAUDE.md), no TypeScript, JSDoc annotations
  only, nothing that outlives the process (ADR-0004). This package adds one
  `let`, one `case` arm, one addend and one `if` block.
- **The counter must reach `total` (Table A row A3).** The easiest wrong version
  of this change adds the arm and the render block and forgets `:532`. It passes
  a test that seeds a mixed ledger and fails only for a ledger whose quarantines
  are *all* `parse-threw` — where it produces a false all-clear. Criterion 3
  exists for that case; write it.
- **Do not re-spell the secret-exhausted message (Table A row A7).** Before
  committing, grep every `tests/red-proofs/*.proofs.json` whose `file` is
  `src/cli/doctor.js` and confirm each declaration's `find` still occurs its
  declared number of times. At this tip there is exactly one:
  `quarantine-banner-location-doctor.proofs.json`'s `doctor-shelf-claim-restored`,
  whose `find` is the tail of `:559` at `occurrences: 1`. A `parse-threw` block
  inserted **before** `:556` leaves it alone; re-indenting or re-wrapping the
  secret-exhausted block would not. This is a repeat of
  `WP-dream-collect-parse-throw-quarantine`'s Erratum 5, where an
  implementation note that re-spelled a pinned line silently disarmed a sibling
  package's guarantee and surfaced only in the **unfiltered** proof run.
- **One integer plus fixed text (Table A row A6).** The arm matches on
  `rec.reason`, and `rec.reason` must not travel from the match into the output.
  The message is a template literal over the counter alone.
- **The existing whole-render test moves, and that is expected.**
  `tests/unit/doctor.test.js:794` asserts the rendered rows' order by index and
  each row's byte-exact text; adding a row changes what that test must assert.
  Criterion 2 is that it is updated rather than weakened — the index-ordering
  assertion keeps every pair it has today and gains the new row in its Table A
  row A5 position, and the unrecognized count stays **3**.
- When uncertain: choose the simpler option and note it in the PR description
  under "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] Any untrusted identifier (version, name, path segment, filename) that flows
      into a filesystem path or a shell command is validated with a **fully
      anchored** pattern that rejects `/`, `\`, and `..`, in **every** language it
      passes through (e.g. JS `isSemver` AND the bash/PowerShell regex). A
      start-anchored-only check accepts `1.2.3/../../x` and becomes an
      arbitrary-write primitive (WP-022, WP-055). **Anchor correctly per engine:**
      in .NET/PowerShell `^…$` still matches *before* a trailing newline — use
      `\A…\z`; in JS `$` without the `m` flag is safe; in POSIX `grep` remember it
      is line-oriented (a multiline value with one valid line matches `^…$`), so
      confirm the value cannot contain a newline (WP-057).
- [ ] **Applied here: nothing in this package reaches a path or a shell.**
      `quarantineReport` reads the ledger and returns strings; it opens no file
      it did not already open and builds no path from any value it read.
- [ ] **No attacker-chosen byte becomes rendered output (Table A row A6).** The
      ledger's keys and `reason` values are attacker-influenceable — a crafted
      transcript decides which key gets a record. The new row renders one integer
      and a code-owned literal. Confirm by the `node -e` render gate, which
      seeds a ledger under a hostile key carrying newlines, a markdown callout,
      an ANSI escape, `..` and a path separator, and asserts none of it appears
      in the output.
- [ ] **The new arm is a positive match on our own literal, not a rejection of
      anything.** `case 'parse-threw':` names one value we intend to recognize;
      every other value — present, absent, non-string, or invented later — keeps
      falling to `default:` (Table A row A8). No forbidden set is enumerated
      anywhere in this change.

## Acceptance criteria

- [ ] 1. **A `parse-threw` quarantine renders its own named row.** For a ledger
      holding one or more `parse-threw` quarantine records, `wienerdog doctor`
      prints a `[warn]` line whose text is byte-exactly Table A row A4's
      message with the exact count, **and** prints no
      `for a reason this version does not recognize` line attributable to those
      records (Table A rows A2, A4).
- [ ] 2. **The whole render is still ordered and still leaks nothing.** The
      existing whole-render test at `tests/unit/doctor.test.js:794` covers all
      six classes, asserts their order by index in Table A row A5's sequence,
      asserts each row's byte-exact message, and still asserts that no ledger
      key, `reason` string or ANSI escape reaches the output (Table A rows A5,
      A6).
- [ ] 3. **A `parse-threw`-only ledger is not a false all-clear.** For a ledger
      whose ONLY quarantine records are `parse-threw`, `wienerdog doctor` does
      **not** print `no session transcripts are being skipped`, and prints
      Table A row A4's line with the exact count (Table A row A3).
- [ ] 4. **The catch-all still catches.** A ledger holding a record with an
      unknown `reason`, one with no `reason` and one whose `reason` is not a
      string still renders the `:565` unrecognized message with a count of 3,
      alongside the `parse-threw` row (Table A row A8).
- [ ] 5. **Nothing outside the Deliverables changed.** `git diff --name-only`
      against the merge base lists only paths in the Deliverables table (plus
      the always-allowed set), and in particular no file under `tests/golden/`
      and no other `tests/red-proofs/*.proofs.json` (Table A row A7).
- [ ] 6. **The declared RED proof is `PROVEN`.** The **UNFILTERED**
      `npm run red-proofs` reports `RUN: PROVEN`, with `PROVEN` for the Table B
      declaration and no `FILTERED`, `VACUOUS`, `UNCONTROLLED`, `FAILED` or
      `ERROR` verdict anywhere in the run — including every declaration this
      package did not write (Table B).
- [ ] 7. N/A — this WP ships no new command and writes nothing outside the
      repo; `wienerdog doctor` is read-only by its own contract
      (`src/cli/doctor.js:487`) and this package does not change that.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
npm run red-proofs   # UNFILTERED. See the note below before reaching for --wp.
```

**The red-proofs line is the unfiltered run, and that is not a preference.**
`--wp <id>` leaves every other package's declarations unselected;
`rollUp` (`scripts/red-proofs.js:2152-2154`) marks any pair with a left-out
declaration `FILTERED`, the run verdict is the worst pair verdict, and the exit
code is `verdict === 'PROVEN' ? 0 : 1` (`:1893`). So a scoped run reports
`RUN: FILTERED` and exits **1** however green its selected proofs are, and
criterion 6 can only be read off the unfiltered run. The `--wp` form is a fast
non-gating reading while iterating. The unfiltered run takes 15–20 minutes:
redirect its whole output to a file, wait on its own PID, and read the `RUN:`
line from the file.

```bash
# Both gates below FAIL LOUDLY and exit non-zero. Each is guarded with
# `test -f` first: an unguarded grep over a missing file exits 2, and a bare
# `&&` chain would then simply print nothing — reading greenest exactly where
# the work was never done.

# Table A row A4: the new message literal has exactly ONE site, and it is in
# doctor.js.
{ test -f src/cli/doctor.js \
  && test "$(grep -c 'something in the session file stopped Wienerdog from reading it' src/cli/doctor.js)" = 1 \
  && echo "ONE SITE OK"; } || { echo "ONE SITE FAILED"; exit 1; }

# Table A row A7: the secret-exhausted line that an existing RED declaration
# pins is byte-unchanged, so quarantine-banner-location-doctor.proofs.json stays
# applicable.
{ test -f src/cli/doctor.js \
  && test "$(grep -cF 'too many times in a row. ${PRESERVED_COPIES_POINTER}`,' src/cli/doctor.js)" = 1 \
  && echo "PINNED LINE INTACT OK"; } || { echo "PINNED LINE FAILED"; exit 1; }
```

```bash
# The render gate: Table A rows A3, A4, A5, A6 and A8, over real seeded ledgers
# in throwaway temp directories. Run from the repo root.
# Case 2 is the one that fails when the counter never reaches `total`.
node -e "
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const bad=[];
const A4=/^\[warn\] (\d+) session transcript\(s\) are being skipped: something in the session file stopped Wienerdog from reading it$/;
const rec=(reason)=>{const r={fingerprint:'1:1:1:1',outcome:'quarantined',updated_at:'2026-01-01T00:00:00.000Z',harness:'codex'};if(reason!==undefined)r.reason=reason;return r;};
// The env mirrors tests/unit/doctor.test.js's own tempEnv() helper. The two
// non-obvious members are load-bearing: WIENERDOG_VAULT keeps the vault inside
// the temp root, and WIENERDOG_LOADER_NOOP=1 neutralizes the real
// launchctl/systemctl spawn that \`init\` would otherwise make (WP-070).
const doctor=(files)=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'wd-dpt-'));
  const core=path.join(root,'wd');
  const env={...process.env,HOME:root,WIENERDOG_HOME:core,WIENERDOG_VAULT:path.join(root,'vault'),CLAUDE_CONFIG_DIR:path.join(root,'absent-claude'),CODEX_HOME:path.join(root,'absent-codex'),WIENERDOG_LOADER_NOOP:'1'};
  const sh=(args)=>{try{return execFileSync(process.execPath,['bin/wienerdog.js',...args],{env,encoding:'utf8'});}catch(e){return e.stdout||'';}};
  sh(['init','--yes']);
  const state=path.join(core,'state');fs.mkdirSync(state,{recursive:true});
  fs.writeFileSync(path.join(state,'transcript-ledger.json'),JSON.stringify({version:1,baseline_mtime:{claude:null,codex:null},files},null,2));
  return sh(['doctor']);
};
// CASE 1 - every class at once: the new row is present, in position, and the
// catch-all still holds its three.
const hostile='evil\n> [!warning] pwn\x1b[31m/../traversal'+path.sep+'x';
let out=doctor({
  '/a/oc.jsonl':rec('over-ceiling'),'/a/tml.jsonl':rec('too-many-lines'),
  '/a/re.jsonl':rec('read-error'),
  '/a/pt1.jsonl':rec('parse-threw'),'/a/pt2.jsonl':rec('parse-threw'),
  '/a/sre.jsonl':rec('secret-revert-exhausted'),
  [hostile]:rec('some-unrecognized-future-reason'),
  '/a/noreason.jsonl':rec(undefined),
  '/a/numreason.jsonl':(()=>{const r=rec(undefined);r.reason=42;return r;})(),
});
let lines=out.split('\n').filter(Boolean);
const iRE=lines.findIndex((l)=>l.includes('the session file could not be read'));
const iPT=lines.findIndex((l)=>A4.test(l));
const iSRE=lines.findIndex((l)=>l.includes('withheld by the secret check too many times in a row'));
const iUN=lines.findIndex((l)=>l.includes('for a reason this version does not recognize'));
if(iPT<0)bad.push('case 1: the parse-threw row is missing entirely');
else{
  if(!(iRE<iPT&&iPT<iSRE&&iSRE<iUN))bad.push('case 1: row order violated (read-error < parse-threw < secret-exhausted < unrecognized): '+JSON.stringify([iRE,iPT,iSRE,iUN]));
  const m=lines[iPT].match(A4);
  if(!m||m[1]!=='2')bad.push('case 1: the parse-threw row does not carry the exact count 2: '+JSON.stringify(lines[iPT]));
}
if(!/^\[warn\] 3 session transcript\(s\) are being skipped for a reason this version does not recognize$/m.test(out))bad.push('case 1: the catch-all lost its three unrecognized records');
for(const leak of ['evil','pwn','traversal','some-unrecognized-future-reason','parse-threw','noreason','numreason'])
  if(out.includes(leak))bad.push('case 1: '+JSON.stringify(leak)+' leaked into doctor output');
if(/\x1b\[31m/.test(out))bad.push('case 1: an ANSI escape from a ledger key reached the output');
// CASE 2 - a parse-threw-ONLY ledger must not read as an all-clear. This is the
// case that fails when the new counter never reaches \`total\`.
out=doctor({'/a/pt1.jsonl':rec('parse-threw')});
if(out.includes('no session transcripts are being skipped'))bad.push('case 2: a parse-threw-only ledger renders a FALSE ALL-CLEAR — the new counter is not an addend of total');
if(!out.split('\n').some((l)=>A4.test(l)))bad.push('case 2: the parse-threw row is missing for a parse-threw-only ledger');
if(bad.length){console.error(bad.join(' | '));process.exit(1);}
console.log('DOCTOR PARSE-THREW ROW OK');"
```

**Before trusting the gate above, observe it red.** It is a NEW verification
step, so run it in three states and paste all three: (a) on the base tip, where
case 1 must fail on the missing row; (b) with the render block present but the
counter left out of `total` at `:532`, where case 2 must fail; (c) on the
finished change, where it must print `DOCTOR PARSE-THREW ROW OK`.

## Out of scope (do NOT do these)

- **Hardening the transcript parsers** — the four text-value joins in
  `src/core/transcripts/codex.js` and `src/core/transcripts/claude.js`. That is
  `WP-transcript-parsers-harden-text-values`, drafted alongside this one. The
  two packages share no file and impose no order on each other.
- **Any change to `src/core/dream/warnings.js`, `src/core/dream/ledger.js`,
  `src/core/dream/scratch.js` or `src/cli/dream.js`** — each already carries
  `parse-threw` correctly (Table A row A7).
- **Any other `doctor` check.** `quarantineReport` is the only function in
  `src/cli/doctor.js` this package touches; the surrounding checks, their order
  and their exit-code behavior are unchanged.
- **Widening what `doctor` renders.** It counts; `reports/warnings.md` is the
  enumeration's one home (ADR-0023 Amendment 2). Do not add a basename, a path,
  a session id or a `reason` string to any row (Table A row A6).
- **An ADR-0023 amendment** (Table A row A9), and **editing
  `docs/specs/done/WP-dream-collect-parse-throw-quarantine.md`** — a filed spec
  is a record; its owner item 3 already predicted this package in its own dated
  OUTCOME note, and nothing further is owed to it.

## Definition of done

0. **DISPATCH PRECONDITION.** (a) **The design gate is CLOSED at round 3**
   (`docs/runbooks/codex-review.md`, "Weighted closure"): rounds 1 and 2 carried
   HEAVY findings and round 3 returned **approve with no findings**. Each
   round's raw and focus were committed **before adjudication** — `8e2c0cef`
   (round 1), `d8bc9a57` (round 2), `0cf82f96` (round 3) — and the dispositions
   table is
   `docs/specs/logbook/2026-09-18-parse-threw-successors-design-review.md`.
   **This is a review gate, not owner approval:** nothing in this repository
   records the owner approving, accepting, ratifying or signing this package. Round 1's findings on this package were LIGHT (citation and count corrections); rounds 2 and 3 re-opened nothing in it. (b) There are **no owner
   items** in this package: every judgment it contains is settled by a table
   above, and the one question that could have been an owner item — the message
   wording — is decided by Table A row A4 as a mirror of a literal already on
   `main` in `src/core/dream/warnings.js:116`, so there is nothing left to
   recommend. (c) Every cite is pinned to base `08de2bc3` and was derived by
   construct. Re-run the Current-state reading before writing code; if anything
   has landed in `src/cli/doctor.js` or `tests/unit/doctor.test.js` since, re-derive
   those cites construct by construct rather than by adding a delta.
   (d) Branch `wp/doctor-recognizes-parse-threw`.
1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(doctor): name the parse-threw skip instead of calling it unrecognized (WP-doctor-recognizes-parse-threw)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
