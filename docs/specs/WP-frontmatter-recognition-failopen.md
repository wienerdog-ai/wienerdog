---
id: WP-frontmatter-recognition-failopen
title: Close the frontmatter parser's recognition fail-open — recognize two opener shapes, fail closed on three
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0022, ADR-0004, ADR-0031]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: close the recognition fail-open

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog vault notes carry **provenance frontmatter**: a leading
`---`…`---` block of flat `key: value` scalars. The security-bearing field
is `derived_from_untrusted`. When a note's support came from tool results
(email bodies, fetched web pages) rather than user-authored text, the writer
sets it to `true`, and every security gate in the product is supposed to
honour that: such a note must not be injected into a session digest, must
not be copied into a vault snapshot a routine can read, and must not clear
the dream's Tier-3 floor.

ADR-0022 makes one module, `src/core/frontmatter.js`, the **single lexer**
every security-bearing note read goes through, so that "a byte sequence
accepted as trusted at commit is never interpreted differently by the
digest". It is deliberately not a YAML parser: YAML's interpretation
flexibility is itself the attack surface. It is **formatting-tolerant on
the separator and surrounding whitespace, strict on value semantics and
block structure**.

That single lexer has a **recognition** fail-open. `parse()` decides that a
note has frontmatter at all by comparing the first line byte-for-byte
against `---`. Five trivial opener shapes fail that comparison, and each one
makes an explicitly written `derived_from_untrusted: true` invisible — not
`malformed` (which fails closed and is visible), but "no frontmatter at
all", which reads as **trusted**. Nothing in the product writes these notes:
every writer is a model following `skills/wienerdog-dream/SKILL.md:158` or a
human with an ordinary editor. Two of the five shapes are therefore
environmental accidents (a Windows editor rewriting a file); the other three
are **selectable formatting** — the same untrusted material that makes the
flag necessary can influence the model that formats the note, so leaving
them open leaves a one-keystroke bypass of every gate below.

This WP closes all five, in the two different ways they deserve: the two
encoding-artifact shapes are **recognized**, and the three whitespace shapes
are made **fail-closed** — visibly excluded as malformed rather than
silently trusted. It also closes one consumer-side hole that widening
recognition would otherwise extend (Table B, row B7).

## Current state

`src/core/frontmatter.js` is 139 lines with zero dependencies. `parse()`
makes exactly two delimiter decisions, and both are byte-exact:

```js
// :40 — the opener
if (lines[0] !== '---') return { delimited: false, malformed: false, fields: new Map(), body: text };
// :43 — the closer scan
    if (lines[i] === '---') {
```

Everything *inside* the block is already CRLF-tolerant: field lines strip
one trailing `\r` before lexing (`:55`, comment: "CRLF tolerance") and
stored values strip trailing `[ \t\r]+` (`:67`). **The two delimiter lines
are the only CRLF-blind part of the module** — an inconsistency, not a
doctrine.

**The measured defect.** A note carrying `derived_from_untrusted: true` fed
to the live `parse`:

| Opener shape | `delimited` | `malformed` | flag visible |
|---|---|---|---|
| baseline (`---\n`) | true | false | **true** |
| UTF-8 BOM before `---` | false | false | NO |
| blank first line | false | false | NO |
| leading space before `---` | false | false | NO |
| CRLF file (`---\r\n`) | false | false | NO |
| leading tab | false | false | NO |

Four supporting measurements, all run on this tree (provenance: `7be88c0`):

- **The closer misses too.** In a CRLF file the closing line is `---\r`, so
  `:43` does not match either and `end` stays `-1`. Recognition cannot be
  repaired for CRLF by fixing the opener alone. A mixed file (LF opener,
  CRLF closer) likewise yields `delimited:false`.
- **The baseline opener already collides with a thematic break.** An
  ordinary LF note whose body opens `---` / prose / `---` parses **today**
  as `delimited:true, malformed:true` — i.e. recognized and fail-closed.
  The markdown collision is not a new hazard introduced by widening; it is
  an accepted, shipped property of the exact-`---` opener. This measurement
  is what decides Table A's rationale, so it is stated here rather than
  asserted there.
- **A near-opener with no closer stays unrecognized.** `\n---\na: 1\nno
  close` (and the space and tab variants) yield `delimited:false` today, and
  must continue to: the fail-closed rule below fires only when a closer is
  actually present.
- **The product corpus is clean.** 48 `.md`/`.txt` files under `templates/`,
  `skills/`, `tests/golden/` and `tests/fixtures/` — the files Wienerdog
  ships or pins — were scanned byte-wise for a BOM, an empty first line, a
  whitespace-indented `---` first line, any `\r` byte, and any first
  non-blank line that is a thematic break: **zero hits in every category**.
  The scope deliberately excludes `docs/` and `memory/`, which are repo
  prose rather than vault-note corpus and which change with every logbook
  commit. **This bounds the repo, not user vaults** — see the migration
  note under Implementation notes.

**Who inherits the defect.** `parse` has three direct `src/` consumers
(`src/core/digest.js:7`, `src/cli/memory.js:9`,
`src/core/dream/validate.js:13`). `src/core/layout.js` and
`src/core/dream/config.js` import only `coerceScalar` and are **not**
affected. Each consumer's measured exposure is Table B. Three of them are
security gates.

**One consumer already fails open on malformed.**
`src/core/dream/validate.js:161-178` builds its frontmatter view by
iterating `fm.fields` and **never reads `fm.malformed`**. Measured: an LF
block carrying floor-passing values *plus* a junk line yields
`parse.malformed === true` and still presents a complete record that passes
the Tier-3 floor. This hole exists today for exact-`---` notes; widening
recognition would extend its reach to the newly recognized shapes, so this
WP closes it (row B7).

**Where this is already recorded.** `docs/specs/done/WP-gate-vault-snapshot.md`
Residual 8 (`:430`) and its Table A Gate-2 row (`:259`) deliberately narrow
the snapshot gate's guarantee to "PARSER-RECOGNIZED leading frontmatter",
with the instruction *"Do not write the wider sentence anywhere."* That Done
spec is not edited; this spec records how far the sentence may now widen
(after Table A) and what stays open (R2). Residual 8 named three shapes; the
measurement above finds five.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | the two delimiter decisions (`:40`, `:43`) per Table A; the docstring's recognition clause (`:14-16`) |
| modify | src/core/dream/validate.js | one guard: `parseFrontmatter` (`:161`) yields an empty record when `parse()` reports `malformed` (row B7) |
| modify | src/core/vault-snapshot.js | comment only (`:129-134`): the Gate-2 narrowing note is replaced by what the gate now decides on |
| modify | docs/adr/0022-single-strict-frontmatter-parser.md | amendment: the recognition/fail-closed contract (Table A) + the uniqueness sentinel (see Exact contracts) |
| modify | tests/unit/frontmatter.test.js | parser-level coverage; the existing `:29` test asserts the OLD contract and flips — see Exact contracts |
| modify | tests/unit/digest.test.js | the digest gate's two paths under all five shapes |
| modify | tests/unit/vault-snapshot.test.js | the notes-slice gate under all five shapes |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor, the raise-only guard, and the B7 malformed guard |

**Consumer edits: exactly one.** Every consumer reaches `parse` through
`parseNoteResult`, `parseFrontmatter` or `skillBody` and inherits the
recognition change without an edit — measured across all six validator call
sites (`validate.js:195, 317, 325, 343, 500, 1170`). The single exception is
the B7 guard above, which is not inherited because the defect it closes is
in the consumer's own view of the parse result, not in the parse result.

### Exact contracts

**The parse signature does not change.** `parse(text) → {delimited,
malformed, fields, body}` keeps its shape, its field grammar, its
duplicate-key rule, and its typed accessors. What changes is which opener
shapes are recognized (A2, A3) and which are classified fail-closed
(A4–A6).

**A recognized block means what it always meant.** A tolerated opener
produces exactly the result the baseline opener would: same `fields`, same
`malformed`, and `body` = the text after the closing delimiter. In a CRLF
file the body's lines still carry their `\r` — this spec does **not**
normalize line endings in `body` (see Out of scope).

**A near-opener must be fail-closed at every security consumer.** For
A4–A6, the required property is that `parse`'s result is one every
security-bearing consumer treats as excluded — concretely, `malformed` is
true, so `ok-to-trust` (`delimited && !malformed`) is false and
`parseNoteResult` returns the existing `'malformed'` exclusion. How `fields`
and `body` are populated for such a block is the implementer's choice, with
one obligation: `skillBody` (`validate.js:343`) reads `body` **without**
consulting `malformed`, so the implementer must confirm that whatever is
chosen produces no user-observable difference on that path, and report it if
it does.

**The B7 guard.** `parseFrontmatter` (`validate.js:161`) yields an empty
record when `parse()` reports `malformed`, so a malformed block can no
longer present fields to the Tier-3 floor, the registry/preservation checks,
or the raise-only guard. It keeps the existing
`'Tier-3 path missing provenance frontmatter (…)'` reason — no new reason
string. This aligns the validator with ADR-0022 §4's "malformed → exclude,
unconditionally" and is observable for today's users (row B7).

**The ADR-0022 uniqueness sentinel names a property, not a command.**
ADR-0022 §1 currently names the literal expression `lines[0] !== '---'` as
the grep that proves there is no second lexer in `src/core/`. That literal
is one of the two lines this WP edits, so the sentinel must stop naming an
expression. A previous draft of this spec proposed
`grep -rn "'---'" src/core/` and called it shape-independent; **that was
wrong** — it is quote-dependent, and a second lexer written with `"---"`, a
template literal or `/^---$/` passes it silently. Widening it naively is no
better: `grep -rnE -- "---" src/core/` returns 19 hits across 6 files, most
of them prose in comments.

The amendment therefore states the **property**: *no file under `src/core/`
other than `frontmatter.js` may compare a line against the `---` delimiter,
in any quoting or regex form.* Constructing a check that holds that property
without 19 false positives is the implementer's job; it must be proven in
both directions (a representative duplicate lexer in each of the three forms
makes it fail) and it must live in the existing test surface, not in new CI
machinery.

**The existing narrow-contract test flips and must be re-aimed.**
`tests/unit/frontmatter.test.js:29-34` (`'parse: the opening --- must be the
FIRST line'`) asserts, for the A4 shape, `delimited === false` and
`body === text`. Under Table A **both assertions become false**. The test is
not deleted: it is re-aimed to assert the fail-closed outcome for that same
input, which is the contract that replaces it.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iii)** structured input parsing /
acceptance changes; **(iv)** reason-code behavior changes at three gates;
**(vi)** multiple downstream consumers inherit the contract. Three of seven
— the discipline fires.

### Table A — per-shape disposition (the ruling)

The shapes are **not symmetrical**, and this table is the single place that
decides each one. The dividing question is NOT whether a shape collides with
markdown — the baseline opener already collides, measurably, and that
collision is accepted (Current state). It is whether the shape is an
**environmental artifact** the writer did not choose, or **selectable
formatting** an attacker can ask for.

| # | Opener shape | Disposition | Why this side of the line |
|---|---|---|---|
| A1 | `---` as the exact first line | recognized (unchanged) | the baseline |
| A2 | UTF-8 BOM (`U+FEFF`) immediately before `---` | **RECOGNIZE** | a BOM is an encoding artifact emitted by the editor, not by the author: the writer did write `---` as line 1. Recognizing it extends the baseline's already-accepted thematic-break collision to one more encoding; it creates no new collision class |
| A3 | CRLF delimiters — opener `---\r` **and** closer `---\r` | **RECOGNIZE** | same: the writer wrote `---`; `\r` is the file's line-ending convention (the Windows default). The module is already CRLF-tolerant on field lines (`:55`) and values (`:67`) — the delimiters are the inconsistency |
| A4 | blank first line before `---`, with a closer present | **FAIL CLOSED** (`malformed`) | the writer chose to put something before the delimiter, and that choice is selectable by whoever formats the note. Silently trusting it is a one-keystroke bypass of every gate in Table B; excluding it visibly costs at most an innocent note, which is the cost the baseline opener already pays |
| A5 | leading space(s) before `---`, with a closer present | **FAIL CLOSED** (`malformed`) | same as A4 |
| A6 | leading tab before `---`, with a closer present | **FAIL CLOSED** (`malformed`) | same as A4 |

**A3 is indivisible.** Tolerating the CRLF opener without the CRLF closer
leaves `delimited:false` (measured, Current state) — the fail-open is not
closed, only relocated. Both delimiter decisions move together, which also
makes the mixed-ending file (LF opener, CRLF closer) recognize.

**A4–A6 require a closer.** With no closing delimiter the file is unchanged
(`delimited:false`, measured) — the same rule the baseline opener already
follows. The fail-closed classification fires only on a complete
near-opener…closer region.

**Why fail-closed rather than recognize, for A4–A6.** Recognizing them would
make the parser's notion of "where frontmatter starts" depend on leading
whitespace, which is exactly the interpretation flexibility ADR-0022 exists
to refuse. Failing closed keeps the grammar strict and still removes the
bypass: the note is excluded, and — unlike today — the exclusion is
**visible**, because `malformed` raises the digest's existing
`> [!warning] Wienerdog: …` banner (ADR-0022 §4) rather than passing
silently. Measured cost on the product corpus: **zero files** change
classification (Current state).

**The widened sentence.** After this WP, and only this far: *a note whose
leading `---`…`---` block is recognized — with or without a UTF-8 BOM, in
either line-ending convention — and which flags untrusted derivation, is
honoured at every gate in Table B; and a note whose first non-blank line is
a blank-, space- or tab-preceded `---` followed by a closer is excluded
fail-closed at those same gates rather than read as trusted.* The
`WP-gate-vault-snapshot` Residual 8 prohibition is discharged to exactly
this sentence. R2 below is why the unconditional sentence ("a note carrying
the flag is skipped") still may not be written anywhere.

**Residual R2 — an unclosed block still hides the flag.** A block that opens
but never closes parses as no frontmatter at all, so a
`derived_from_untrusted: true` inside it is invisible and the note reads as
trusted. Measured on this tree: `---\nderived_from_untrusted: true\nno
closing delimiter here` yields `delimited:false, malformed:false` and a
digest exclusion of `null`. This is ADR-0022's documented "missing open /
missing close → no frontmatter" rule, and it applies identically to the
baseline opener, so it is not a shape this WP created or narrowed. Named
here so the widened sentence is not read as unconditional; ruling on it is
not in this package.

### Table B — measured per-path exposure, and what changes

Every "today" cell was measured on this tree. Rows B1–B6 are the consumers
of the recognition change; B7 is the one consumer-side fix.

| # | Path | Today | After |
|---|---|---|---|
| B1 | Digest **identity injection** (`digest.js:689` → `parseNoteResult` `:190`) | all five shapes: flag invisible → `exclusion` is `null` → the note body is injected **including its frontmatter text** | A2/A3 → `untrusted-exact`, omitted **silently** (normal policy, ADR-0022 §4). A4–A6 → `malformed`, omitted **with the existing banner** |
| B2 | Digest **daily summary** (`digest.js:747` → `readNoteBounded` `:265`) | A2/A4/A5/A6: flag invisible → the `## Summary` section is extracted and framed. **A3: no change — masked.** `extractSection`'s heading match `/^##\s+(.*)$/` (`:327`) cannot match `## Summary\r`, because JS `.` never matches `\r`, so a CRLF daily note emits no summary today either way | A2 → excluded at the gate; A4–A6 → excluded at the gate, with the banner. A3 → still no summary, now because the gate excludes it rather than because the heading missed |
| B3 | Snapshot **notes slice** (`vault-snapshot.js:151` → the digest's own exported gate) | all five: `exclusion === null` → the file's **raw bytes are copied** into the snapshot a routine reads | skip, reason `provenance gate: <class>` — `untrusted-exact` for A2/A3, `malformed` for A4–A6. The existing vocabulary verbatim, no new reason string |
| B4 | Dream **Tier-3 floor** (`validate.js:195`) | all five: `parseFrontmatter` → `{}` → `'Tier-3 path missing provenance frontmatter (…)'` → the write is reverted. **Fail-CLOSED** | A2/A3: the floor is evaluated on the real values — accepted if it meets the floor, else `'Tier-3 floor not met (…)'`. **Recovered intent — see below.** A4–A6: still rejected, now because the block is malformed rather than because it was invisible |
| B5 | Dream **raise-only + preservation guards** (`validate.js:317/325/332`) | all five: HEAD parses as `{}`, so `head.derived_from_untrusted === true` is false and the guard **cannot fire**: a revision may lower the flag from `true` to `false` undetected. The `origin`/`created`/`id` preservation checks likewise compare `undefined === undefined` and pass | A2/A3: the guard sees HEAD's `true` and fires (`'skill revision lowered derived_from_untrusted (raise-only)'`); preservation compares real values. A4–A6: the record stays empty, but the file is now rejected upstream rather than silently accepted |
| B6 | `wienerdog memory approve` **evidence display** (`memory.js:134`) | no provenance lines are printed, so the human ratifying the exact bytes cannot see the flag they are ratifying | A2/A3: the four `EVIDENCE_FIELDS` print as today. Evidence only — never authorization (unchanged) |
| B7 | Dream **malformed-block handling** (`validate.js:161`) | `parseFrontmatter` never reads `fm.malformed`. Measured: an **exact-`---` LF** block with floor-passing values plus a junk line passes the Tier-3 floor today | the record is empty on `malformed`, so the write is rejected with the existing missing-provenance reason. **This is observable for today's users on exact-`---` notes, not only on the newly recognized shapes** |

**B4 is stated, never shipped silently.** Under A2/A3 a Tier-3 skill file
written by a Windows editor is rejected today with "missing provenance
frontmatter" even when its frontmatter is complete and passing. After this
WP it is read and judged on its merits. That is **recovered intent, not a
relaxation**: the floor's thresholds (`derived_from_untrusted === false`,
confidence ≥ 0.85, recurrence ≥ 3) are untouched, and a file that fails them
is rejected with the floor's own reason string. The same shape that made the
validator lose a good write (B4) made it miss a bad one (B5); one fix
resolves both, in opposite directions, which is the point.

**B7 is the row that costs today's users something.** A Tier-3 write with a
malformed block that currently slips through on its recognized fields will
start being rejected. That direction is fail-closed and matches ADR-0022 §4,
but it is a real behavior change on notes that have nothing to do with the
five shapes, and it is disclosed here rather than folded in as a side effect
of the recognition work.

**Reason-string vocabularies are preserved.** No row introduces a new reason
string. Every row changes *which existing string fires*; that is the
disclosure this table exists to make.

### Mirrored Surface Checklist

Table A's mirrors:

- [ ] `src/core/frontmatter.js` docstring `:14-16` (the "MUST open … FIRST line" clause)
- [ ] `src/core/vault-snapshot.js:129-134` (the Gate-2 comment — the fail-open it describes is closed; it must say what the gate now decides on)
- [ ] ADR-0022's recognition description
- [ ] The re-aimed test in `tests/unit/frontmatter.test.js`
- [ ] The "widened sentence" paragraph, and R2 beside it
- [ ] Verification step V1

Table B's mirrors:

- [ ] The Deliverables rows for `src/core/dream/validate.js` and the four test files
- [ ] The "Consumer edits: exactly one" paragraph
- [ ] Acceptance criteria AC4–AC8 (AC3 mirrors Table A, not Table B; B6 has
      no criterion by design — it is a display consumer, not a gate)
- [ ] Verification steps V2–V3

## Implementation notes & constraints

- **Grammar untouched.** Do not change the field grammar, the duplicate-key
  rule, `readBool`/`readNumber`, or `coerceScalar`. This WP changes which
  opener shapes are recognized and which are classified malformed; it does
  not change what a recognized block means.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc annotations only, no
  TypeScript; no build step. Nothing here starts a process (ADR-0004).
- **A BOM is one character, not three bytes, at this layer.** `parse`
  receives a decoded string, so the BOM appears as a single `U+FEFF`. Do not
  reach for a byte-level check.
- **Do not let a tolerated artifact leak into the data.** A BOM must not
  become part of a field name and a `\r` must not become part of a stored
  value — `:67` already strips a trailing `\r` from values; confirm rather
  than assume.
- **Trap — `skillBody` ignores `malformed`.** See Exact contracts: whatever
  `body` a near-opener block yields, `validate.js:343` will compare it. Show
  that no user-observable difference results, or report it.
- **Trap — the migration moment.** ADR-0022's stability argument is that a
  byte sequence accepted at commit is not interpreted differently at read.
  The single-lexer doctrine keeps commit-time and read-time consistent
  *after* the change, because both go through this one function. What moves
  is the interpretation of notes committed before it. The corpus measurement
  bounds this for files **the repo ships**; it says nothing about a user's
  existing vault, where a note in any of the five shapes will change
  classification on the next read. Table B is the statement of what those
  users observe, and every changed outcome there is either an exclusion
  (fail-closed) or a recovered acceptance (B4) — never a new admission of
  flagged content.
- **`tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer** and will diverge after this WP. Accepted residual: it is a
  scenario harness, not a security gate, it is outside ADR-0022's `src/core/`
  scope, and it is not run by `npm test`. Noted here rather than fixed, to
  keep this package's boundary at the one lexer.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is confined to two in-memory string
      comparisons inside `parse` plus one guard in the validator, and adds no
      path, filename or command construction anywhere. The anchored-pattern
      rule therefore has no subject here — stated rather than deleted so the
      absence is checkable.
- [ ] Every classification this WP changes moves a note from *trusted*
      toward *gated*, with exactly one exception in the opposite direction —
      B4, whose thresholds are untouched and which is disclosed in Table B.

## Acceptance criteria

- [ ] **AC1** — For A2 and A3, `parse` returns `delimited:true` with the same
      `fields` and `malformed` as the baseline opener, and `body` = the text
      after the closing delimiter. (Table A)
- [ ] **AC2** — A3 recognizes when opener and closer are both `---\r`, and
      also when the file mixes conventions (LF opener, CRLF closer).
- [ ] **AC3** — For A4, A5 and A6 **with a closer**, `parse` reports
      `malformed`; **without a closer** the result is unchanged from today
      (`delimited:false, malformed:false`). (Table A)
- [ ] **AC4** — Under A2 and A3, a note carrying `derived_from_untrusted: true`
      is excluded by the digest at **both** its paths — identity injection
      and the daily summary read — and under A4–A6 the same note is excluded
      as `malformed`, with the banner. (B1, B2)
- [ ] **AC5** — Under all five shapes the snapshot notes-slice gate skips the
      file with reason `provenance gate: <class>`, the class being
      `untrusted-exact` for A2/A3 and `malformed` for A4–A6; the reason
      vocabulary gains no new member. (B3)
- [ ] **AC6** — Under A2 and A3, a Tier-3 write whose frontmatter meets the
      floor is accepted, and one that does not is rejected with the floor's
      own reason string — not with "missing provenance frontmatter". (B4)
- [ ] **AC7** — Under A2 and A3, a skill revision that lowers
      `derived_from_untrusted` from a HEAD that carries `true` is rejected by
      the raise-only guard. (B5)
- [ ] **AC8** — A block reported `malformed` presents **no** fields to the
      validator, so a Tier-3 write with a malformed block and otherwise
      floor-passing values is rejected — including on an exact-`---` LF note,
      which is the pre-existing case. (B7)
- [ ] **AC9** — The one-lexer property holds and its check is proven in both
      directions: a representative second lexer written with `'---'`, with
      `"---"`, and as a delimiter regex each makes the check fail.
- [ ] **AC10** — The full suite and lint are green, and the golden fixtures
      are byte-unchanged (the corpus measurement predicts zero diff; a diff
      means the ruling reached further than Table A).

## Verification steps (run these; paste output in the PR)

Every new assertion added for AC1–AC9 is a NEW verification step, so each
must be observed **on both sides** — green on the finished state and red on
a deliberately broken one (revert the delimiter decisions, and separately the
B7 guard, and re-run). Paste both outputs.

```bash
# V1 — the one-lexer property (AC9). Run the check the implementer built,
# then its three negative controls. A grep for a single quoting form is NOT
# sufficient; see Exact contracts.
node --test tests/unit/frontmatter.test.js

# V2 — the parser and the four protected paths.
node --test tests/unit/frontmatter.test.js tests/unit/frontmatter-unify.test.js \
  tests/unit/frontmatter-digest-differential.test.js tests/unit/digest.test.js \
  tests/unit/vault-snapshot.test.js tests/unit/dream-validate.test.js

# V3 — full suite (golden fixtures must be byte-unchanged) and lint.
npm test
npm run lint
git diff --stat -- tests/golden/
```

## Out of scope (do NOT do these)

- **Line-ending normalization anywhere but the delimiter decisions.** In
  particular `extractSection`'s CRLF-blind heading match (`digest.js:327`,
  measured in B2) is left exactly as it is: fixing it would change which
  daily summaries are emitted for notes that carry no flag at all, which is
  a different contract from this WP's.
- **Residual R2** — the unclosed-block case (Table A). Named and measured,
  not ruled on here.
- **`tests/scenarios/run-scenarios.js`** — its duplicate lexer is an accepted
  residual (Implementation notes).
- **Any validator change beyond the B7 guard.** The Tier-3 thresholds, the
  ledger schema, and the revision authorization rules are untouched.
- The scan-limit guard and `WP-alert-producer-freeform-residual` — queued
  behind this package.
- The snapshot's reports-slice exemption and the 2026-08-14 no-stamp ruling —
  settled; nothing here reopens model-declared classification.
- Editing `docs/specs/done/WP-gate-vault-snapshot.md`. Done specs are never
  edited; its Residual 8 is discharged by Table A's "widened sentence"
  paragraph in this spec.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs for the new assertions.
2. Conventional commits; PR titled
   `fix(frontmatter): close the recognition fail-open (WP-frontmatter-recognition-failopen)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
