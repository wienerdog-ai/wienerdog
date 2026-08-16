---
id: WP-frontmatter-recognition-failopen
title: Close the frontmatter parser's recognition fail-open for the two encoding-artifact openers
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0022, ADR-0004, ADR-0031]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: honour the untrusted flag through a BOM or a CRLF opener

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
human with an ordinary editor, so line-ending and encoding hygiene is
entirely outside Wienerdog's control. A Windows editor rewriting a note is
enough.

This WP rules on each of the five shapes and closes the two that have no
reading other than "the writer wrote a frontmatter block". It is
**recognition work only**: the field grammar, `readBool`'s fail-closed
accessors, and the malformed semantics are untouched (ADR-0022 stands).

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

**The measured defect** (run against this tree; a note carrying
`derived_from_untrusted: true` fed to the live `parse`):

| Opener shape | `delimited` | `malformed` | flag visible |
|---|---|---|---|
| baseline (`---\n`) | true | false | **true** |
| UTF-8 BOM before `---` | false | false | NO |
| blank first line | false | false | NO |
| leading space before `---` | false | false | NO |
| CRLF file (`---\r\n`) | false | false | NO |
| leading tab | false | false | NO |

Two supporting measurements on the same tree:

- **The closer misses too.** In a CRLF file the closing line is `---\r`, so
  `:43` does not match either and `end` stays `-1`. Recognition cannot be
  repaired for CRLF by fixing the opener alone. A mixed file (LF opener,
  CRLF closer) likewise yields `delimited:false`.
- **The shipped corpus is clean.** 453 `.md`/`.txt` files under
  `templates/`, `skills/`, `tests/golden/`, `tests/fixtures/`, `docs/` and
  `memory/` were scanned byte-wise for a BOM, an empty first line, a
  whitespace-indented `---` first line, or any `\r` byte anywhere: **zero
  hits**. Widening recognition changes no shipped file's parse.

**Who inherits the defect.** `parse` has three direct `src/` consumers
(`src/core/digest.js:7`, `src/cli/memory.js:9`,
`src/core/dream/validate.js:13`). `src/core/layout.js` and
`src/core/dream/config.js` import only `coerceScalar` and are **not**
affected. Each consumer's measured exposure is Table B. Three of them are
security gates, and one of the three — the dream validator — was not
previously on the record for this defect.

**Where this is already recorded.** `docs/specs/done/WP-gate-vault-snapshot.md`
Residual 8 (`:430`) and its Table A Gate-2 row (`:259`) deliberately narrow
the snapshot gate's guarantee to "PARSER-RECOGNIZED leading frontmatter",
with the instruction *"Do not write the wider sentence anywhere."* That Done
spec is not edited; this spec records how far the sentence may now widen
(Table A) and what stays open (R1). Residual 8 named three shapes; the
measurement above finds five.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | the two delimiter decisions (`:40`, `:43`) per Table A; the docstring's recognition clause (`:14-16`) |
| modify | src/core/vault-snapshot.js | comment only (`:129-134`): the Gate-2 narrowing note now names R1's three shapes, not five |
| modify | docs/adr/0022-single-strict-frontmatter-parser.md | amendment: recognition tolerance (Table A) + the uniqueness sentinel's literal (see Exact contracts) |
| modify | tests/unit/frontmatter.test.js | parser-level recognition coverage; the existing `:29` test is re-aimed, not deleted (see below) |
| modify | tests/unit/digest.test.js | the digest gate's two paths under the tolerated shapes |
| modify | tests/unit/vault-snapshot.test.js | the notes-slice gate under the tolerated shapes |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor and the raise-only guard under the tolerated shapes |

No `src/` consumer changes. Every consumer reaches `parse` through
`parseNoteResult`, `parseFrontmatter` or `skillBody` and inherits the fix
without an edit — this was measured across all six validator call sites
(`validate.js:195, 317, 325, 343, 500, 1170`) and is why the third protected
path costs no additional code.

### Exact contracts

**The parse signature does not change.** `parse(text) → {delimited,
malformed, fields, body}` keeps its shape, its field grammar, its duplicate-key
and malformed rules, and its typed accessors. Only the two delimiter
decisions move, per Table A.

**What a recognized block means is unchanged.** A tolerated opener produces
exactly the result the baseline opener would: same `fields`, same
`malformed`, and `body` = the text after the closing delimiter. In a CRLF
file the body's lines still carry their `\r` — this spec does **not**
normalize line endings in `body` (see Out of scope).

**The ADR-0022 uniqueness sentinel is restated shape-independently.**
ADR-0022 §1 currently names the literal expression `lines[0] !== '---'` as
the grep that proves there is no second lexer in `src/core/`. That literal
is one of the two lines this WP edits, so the sentinel must stop naming an
expression and name the property instead. The amendment states the sentinel
as:

```bash
grep -rn "'---'" src/core/
```

which on this tree returns only `src/core/frontmatter.js` (two lines, both
inside `parse`) and keeps returning only that file after the fix. This is an
amendment to a factual sentinel, not to the ADR's decision — the decision
(one lexer, never YAML, strict on values and block structure) stands
verbatim.

**The existing narrow-contract test is re-aimed, never deleted.**
`tests/unit/frontmatter.test.js:29-34` (`'parse: the opening --- must be the
FIRST line'`) asserts `delimited === false` for a leading blank line. Under
Table A that shape stays declined, so the assertion stays true — but its
name now overstates the contract, since two openers are no longer required
to be the literal first line. It is renamed to say what it now enforces, and
it becomes R1's enforcement.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iii)** structured input parsing /
acceptance changes; **(iv)** reason-code behavior changes at three gates;
**(vi)** multiple downstream consumers inherit the contract. Three of seven
— the discipline fires.

### Table A — per-shape disposition (the ruling)

The shapes are **not symmetrical**, and this table is the single place that
decides which are closed. The dividing question is whether the shape has any
reading other than "the writer wrote a frontmatter block".

| # | Opener shape | Disposition | Why this side of the line |
|---|---|---|---|
| A1 | `---` as the exact first line | recognized (unchanged) | the baseline |
| A2 | UTF-8 BOM (`U+FEFF`) immediately before `---` | **TOLERATE** | a BOM is an invisible encoding artifact, never content: the writer did write `---` as line 1. No competing markdown reading exists |
| A3 | CRLF delimiters — opener `---\r` **and** closer `---\r` | **TOLERATE** | same: the writer wrote `---`; `\r` is the file's line-ending convention (the Windows default). The module is already CRLF-tolerant on field lines (`:55`) and values (`:67`) — the delimiters are the inconsistency |
| A4 | blank first line before `---` | **DECLINE — residual R1** | `---` is also a markdown thematic break. A body legitimately opening with one would newly parse as a frontmatter attempt, almost always `malformed` → an innocent note visibly excluded |
| A5 | leading space(s) before `---` | **DECLINE — residual R1** | up to three leading spaces is still a valid thematic break in markdown — same collision as A4 |
| A6 | leading tab before `---` | **DECLINE — residual R1** | a tab-indented line is markdown code-block content, so tolerating it would recognize a delimiter inside what the writer wrote as code |

**A3 is indivisible.** Tolerating the CRLF opener without the CRLF closer
leaves `delimited:false` (measured, Current state) — the fail-open is not
closed, only relocated. Both delimiter decisions move together, which also
makes the mixed-ending file (LF opener, CRLF closer) recognize.

**Residual R1 — accepted, not closed.** A4/A5/A6 remain fail-open: a note
whose first line is blank, space-indented or tab-indented before its `---`
still reads as trusted at every gate in Table B. Accepted because closing
them trades a silent-trust failure for a visible-loss failure on ordinary
markdown, and the loss lands on innocent notes. Enforced by the re-aimed
test named in Exact contracts.

**The widened sentence.** After this WP, and only this far: *a note whose
frontmatter opens with `---` as its first line — optionally preceded by a
UTF-8 BOM, and with either line-ending convention — and which flags
untrusted derivation, is honoured at every gate in Table B.* The
`WP-gate-vault-snapshot` Residual 8 prohibition is discharged to exactly
this sentence and no further; R1 is why the unconditional sentence ("a note
carrying the flag") still may not be written anywhere.

### Table B — measured per-path exposure, and what changes

Every "today" cell was measured on this tree. Rows are the three security
gates plus the one display consumer.

| # | Path | Today, under A2/A3 | After |
|---|---|---|---|
| B1 | Digest **identity injection** (`digest.js:689` → `parseNoteResult` `:190`) | flag invisible → `exclusion` is `null` → the note body is injected **including its frontmatter text** | `untrusted-exact` → omitted **silently** (normal policy, ADR-0022 §4); `malformed` / `untrusted-invalid` → omitted **with the existing banner** |
| B2 | Digest **daily summary** (`digest.js:747` → `readNoteBounded` `:265`) | A2: flag invisible → the `## Summary` section is extracted and framed. **A3: no change — masked.** `extractSection`'s heading match `/^##\s+(.*)$/` (`:327`) cannot match `## Summary\r`, because JS `.` never matches `\r`, so a CRLF daily note emits no summary today either way | A2: excluded at the gate. A3: still no summary, now because the gate excludes it rather than because the heading missed |
| B3 | Snapshot **notes slice** (`vault-snapshot.js:151` → the digest's own exported gate) | flag invisible → `exclusion === null` → the file's **raw bytes are copied** into the snapshot a routine reads | skip, reason `provenance gate: <class>` — the existing vocabulary verbatim, no new reason string |
| B4 | Dream **Tier-3 floor** (`validate.js:195`) | `parseFrontmatter` → `{}` → `'Tier-3 path missing provenance frontmatter (needs confidence, recurrence, derived_from_untrusted)'` → the write is reverted. **Fail-CLOSED** | the floor is evaluated on the real values: the write is accepted if it meets the floor, else `'Tier-3 floor not met (…)'`. **This is a behavior change and it is recovered intent — see below** |
| B5 | Dream **raise-only + preservation guards** (`validate.js:317/325/332`) | HEAD parses as `{}`, so `head.derived_from_untrusted === true` is false and the guard **cannot fire**: a revision may lower the flag from `true` to `false` undetected. The `origin`/`created`/`id` preservation checks likewise compare `undefined === undefined` and pass | the guard sees HEAD's `true` and fires: `'skill revision lowered derived_from_untrusted (raise-only)'`; the preservation checks compare real values |
| B6 | `wienerdog memory approve` **evidence display** (`memory.js:134`) | no provenance lines are printed, so the human ratifying the exact bytes cannot see the flag they are ratifying | the four `EVIDENCE_FIELDS` print as today. Evidence only — never authorization (unchanged) |

**B4 is stated, never shipped silently.** Under A3 a Tier-3 skill file
written by a Windows editor is rejected today with "missing provenance
frontmatter" even when its frontmatter is complete and passing. After this
WP it is read and judged on its merits. That is **recovered intent, not a
relaxation**: the floor's thresholds (`derived_from_untrusted === false`,
confidence ≥ 0.85, recurrence ≥ 3) are untouched, and a file that fails them
is rejected with the floor's own reason string. The same shape that made the
validator lose a good write (B4) made it miss a bad one (B5); one fix
resolves both, in opposite directions, which is the point.

**Reason-string vocabularies are preserved.** No row introduces a new reason
string. B1, B3, B4 and B5 change *which existing string fires* for the
tolerated shapes; that is the disclosure this table exists to make.

### Mirrored Surface Checklist

Table A's mirrors:

- [ ] `src/core/frontmatter.js` docstring `:14-16` (the "MUST open … FIRST line" clause)
- [ ] `src/core/vault-snapshot.js:129-134` (the Gate-2 narrowing comment — must name three shapes, not five)
- [ ] ADR-0022's recognition description
- [ ] The re-aimed test in `tests/unit/frontmatter.test.js`
- [ ] The "widened sentence" paragraph above, and R1 beside it
- [ ] Verification step V1

Table B's mirrors:

- [ ] The Deliverables rows for the three consumer test files
- [ ] Acceptance criteria AC3–AC6
- [ ] Verification steps V2–V3

## Implementation notes & constraints

- **Recognition only.** Do not touch the field grammar, the duplicate-key
  rule, the malformed semantics, `readBool`/`readNumber`, or `coerceScalar`.
  ADR-0022's strictness on value semantics and block structure is binding.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc annotations only, no
  TypeScript; no build step. Nothing here starts a process (ADR-0004).
- **A BOM is one character, not three bytes, at this layer.** `parse`
  receives a decoded string, so the BOM appears as a single `U+FEFF`. Do not
  reach for a byte-level check.
- **Do not let a tolerated artifact leak into the data.** A BOM must not
  become part of a field name and a `\r` must not become part of a stored
  value — `:67` already strips a trailing `\r` from values; confirm rather
  than assume.
- **Trap — the migration moment.** ADR-0022's stability argument is that a
  byte sequence accepted at commit is not interpreted differently at read.
  The single-lexer doctrine keeps commit-time and read-time consistent
  *after* the change, because both go through this one function. What moves
  is the interpretation of notes committed before it. The shipped-corpus
  measurement (zero hits in 453 files) bounds that migration to user vault
  content only, and Table B states what those users observe.
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
      comparisons inside `parse`, and adds no path, filename or command
      construction anywhere. The anchored-pattern rule therefore has no
      subject here — stated rather than deleted so the absence is checkable.
- [ ] The change only ever moves a note from *trusted* toward *gated*: no
      shape that is excluded today becomes included, except B4, which is
      disclosed in Table B and whose thresholds are untouched.

## Acceptance criteria

- [ ] **AC1** — For A2 and A3, `parse` returns `delimited:true` with the same
      `fields` and `malformed` as the baseline opener, and `body` = the text
      after the closing delimiter. (Table A)
- [ ] **AC2** — A3 recognizes when opener and closer are both `---\r`, and
      also when the file mixes conventions (LF opener, CRLF closer).
- [ ] **AC3** — Under A2 and A3, a note carrying `derived_from_untrusted: true`
      is excluded by the digest at **both** its paths — identity injection
      and the daily summary read. (B1, B2)
- [ ] **AC4** — Under A2 and A3, the same note is skipped by the snapshot
      notes-slice gate with reason `provenance gate: untrusted-exact`; the
      reason vocabulary gains no new member. (B3)
- [ ] **AC5** — Under A2 and A3, a Tier-3 write whose frontmatter meets the
      floor is accepted, and one that does not is rejected with the floor's
      own reason string — not with "missing provenance frontmatter". (B4)
- [ ] **AC6** — Under A2 and A3, a skill revision that lowers
      `derived_from_untrusted` from a HEAD that carries `true` is rejected by
      the raise-only guard. (B5)
- [ ] **AC7** — A4, A5 and A6 still return `delimited:false, malformed:false`
      (residual R1 holds, and is asserted, not merely unmentioned).
- [ ] **AC8** — The full suite and lint are green, and the golden fixtures are
      byte-unchanged (the corpus measurement predicts zero diff; a diff means
      the ruling reached further than Table A).

## Verification steps (run these; paste output in the PR)

Every new assertion added for AC1–AC7 is a NEW verification step, so each
must be observed **on both sides** — green on the finished state and red on
a deliberately broken one (revert the two delimiter decisions and re-run).
Paste both outputs.

```bash
# V1 — the one-lexer sentinel still holds, in its shape-independent form.
# Must list only src/core/frontmatter.js.
grep -rn "'---'" src/core/

# V2 — the parser and the three protected paths.
node --test tests/unit/frontmatter.test.js tests/unit/frontmatter-unify.test.js \
  tests/unit/frontmatter-digest-differential.test.js tests/unit/digest.test.js \
  tests/unit/vault-snapshot.test.js tests/unit/dream-validate.test.js

# V3 — full suite (golden fixtures must be byte-unchanged) and lint.
npm test
npm run lint
git diff --stat -- tests/golden/
```

## Out of scope (do NOT do these)

- **Line-ending normalization anywhere but the two delimiter decisions.** In
  particular `extractSection`'s CRLF-blind heading match (`digest.js:327`,
  measured in B2) is left exactly as it is: fixing it would change which
  daily summaries are emitted for notes that carry no flag at all, which is
  a different contract from this WP's.
- **A4/A5/A6** — declined by Table A as residual R1, not deferred to a
  successor.
- **`tests/scenarios/run-scenarios.js`** — its duplicate lexer is an accepted
  residual (Implementation notes).
- The scan-limit guard and `WP-alert-producer-freeform-residual` — queued
  behind this package.
- The snapshot's reports-slice exemption and the 2026-08-14 no-stamp ruling —
  settled; nothing here reopens model-declared classification.
- Editing `docs/specs/done/WP-gate-vault-snapshot.md`. Done specs are never
  edited; its Residual 8 is discharged by Table A's "widened sentence"
  paragraph in this spec.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red run for the new assertions.
2. Conventional commits; PR titled
   `fix(frontmatter): honour the untrusted flag through a BOM or CRLF opener (WP-frontmatter-recognition-failopen)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
