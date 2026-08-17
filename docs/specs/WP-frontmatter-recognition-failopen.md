---
id: WP-frontmatter-recognition-failopen
title: Close the frontmatter parser's recognition fail-open — recognize two opener shapes, fail closed on the rest
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
against `---`, and it requires a byte-exact closing line. Six trivial
deviations — five opener shapes and a missing closer — each make an
explicitly written `derived_from_untrusted: true` invisible. Not `malformed`
(which fails closed and is at least partly visible), but "no frontmatter at
all", which reads as **trusted**. Nothing in the product writes these notes:
every writer is a model following `skills/wienerdog-dream/SKILL.md:158` or a
human with an ordinary editor. Two of the deviations are environmental
accidents (a Windows editor rewriting a file); the rest are **selectable
formatting** — the same untrusted material that makes the flag necessary can
influence the model that formats the note, so any one of them left open is a
one-keystroke bypass of every gate below.

This WP closes all six, in the two ways they deserve: the two
encoding-artifact openers are **recognized**, and every other
delimiter-shaped deviation is made **fail-closed** — classified malformed
rather than silently trusted. It also closes one consumer-side hole that
widening recognition would otherwise extend (Table B, row B7).

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

| Deviation | `delimited` | `malformed` | flag visible |
|---|---|---|---|
| none — baseline (`---\n` … `---\n`) | true | false | **true** |
| UTF-8 BOM before `---` | false | false | NO |
| blank first line | false | false | NO |
| leading space before `---` | false | false | NO |
| CRLF file (`---\r\n`) | false | false | NO |
| leading tab | false | false | NO |
| no closing delimiter | false | false | NO |

Three supporting measurements, all run on this tree (provenance: `7be88c0`):

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
- **The product corpus is clean, measured by the predicates that matter.**
  The 48 `.md`/`.txt` files under `templates/`, `skills/`, `tests/golden/`
  and `tests/fixtures/` — the files Wienerdog ships or pins — were scanned
  byte-wise. The scope deliberately excludes `docs/` and `memory/`, which
  are repo prose rather than vault-note corpus and which change with every
  logbook commit. Each count is the population of one classification change,
  not a general "looks odd" category:

  | Predicate | Count |
  |---|---|
  | files in scope | 48 |
  | BOM, empty first line, whitespace-indented opener, or any `\r` byte | 0 |
  | delimiter-shaped opener with **no later closer** (what R2's closure newly catches) | 0 |
  | near-opener **with** a closer (what the A4–A6 rule newly catches) | 0 |

  A count of 27 files whose first non-blank line is `---` is **not** a
  false-positive population: those are ordinary frontmatter openers with
  closers, and Table A leaves them recognized. An earlier draft of this spec
  stated that category as zero, which was false as written.
  **These counts bound the repo, not user vaults** — see the migration note
  under Implementation notes.

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
recognition would extend its reach, so this WP closes it (row B7).

**Where this is already recorded.** `docs/specs/done/WP-gate-vault-snapshot.md`
Residual 8 (`:430`) and its Table A Gate-2 row (`:259`) deliberately narrow
the snapshot gate's guarantee to "PARSER-RECOGNIZED leading frontmatter",
with the instruction *"Do not write the wider sentence anywhere."* That Done
spec is not edited; this spec records how far the sentence may now widen.
Residual 8 named three shapes; the measurement above finds six deviations.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | the two delimiter decisions (`:40`, `:43`) per Table A; the docstring's recognition clause (`:14-16`), whose "missing close → no frontmatter" sentence Table A invalidates |
| modify | src/core/dream/validate.js | one guard: `parseFrontmatter` (`:161`) yields an empty record when `parse()` reports `malformed` (row B7) |
| modify | src/core/vault-snapshot.js | comment only (`:129-134`): the Gate-2 narrowing note is replaced by what the gate now decides on |
| modify | docs/adr/0022-single-strict-frontmatter-parser.md | amendment: the recognition/fail-closed contract (Table A) + the uniqueness sentinel (see Exact contracts) |
| modify | tests/unit/frontmatter.test.js | parser-level coverage; **two** existing tests assert the old contract and flip — see Exact contracts |
| modify | tests/unit/digest.test.js | the digest gate's two paths under both outcome classes |
| modify | tests/unit/vault-snapshot.test.js | the notes-slice gate under both outcome classes |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor, the raise-only guard, and the B7 malformed guard |

**Consumer edits: exactly one.** Every consumer reaches `parse` through
`parseNoteResult`, `parseFrontmatter` or `skillBody` and inherits the
recognition change without an edit — measured across all six validator call
sites (`validate.js:195, 317, 325, 343, 500, 1170`). The single exception is
the B7 guard above, which is not inherited because the defect it closes is
in the consumer's own view of the parse result, not in the parse result.
`src/core/digest.js` is deliberately **not** listed; see B2 and Out of scope.

### Exact contracts

**The parse signature does not change.** `parse(text) → {delimited,
malformed, fields, body}` keeps its shape, its field grammar, its
duplicate-key rule, and its typed accessors. What changes is the delimiter
recognition, per Table A.

**A recognized block means what it always meant.** A tolerated opener
produces exactly the result the baseline opener would: same `fields`, same
`malformed`, and `body` = the text after the closing delimiter. In a CRLF
file the body's lines still carry their `\r` — this spec does **not**
normalize line endings in `body` (see Out of scope).

**Fail-closed is a property, not a representation.** For every shape Table A
classifies FAIL-CLOSED, the required property is that `parse`'s result is one
every security-bearing consumer treats as excluded — concretely, `malformed`
is true, so `ok-to-trust` (`delimited && !malformed`) is false and
`parseNoteResult` returns the existing `'malformed'` exclusion. Whether
`delimited` is true or false, and how `fields` and `body` are populated, is
the implementer's choice within that property, with one obligation:
`skillBody` (`validate.js:343`) reads `body` **without** consulting
`malformed`, so the implementer must confirm that whatever is chosen
produces no user-observable difference on that path, and report it if it
does.

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
expression. A previous draft proposed `grep -rn "'---'" src/core/` and
called it shape-independent; **that was wrong** — it is quote-dependent.
Widening it naively is no better: `grep -rnE -- "---" src/core/` returns 19
hits across 6 files, most of them prose in comments.

The amendment therefore states the **property**: *no file under `src/core/`
other than `frontmatter.js` may compare a line against the `---` delimiter,
in any quoting or regex form.* Constructing a check that holds that property
without 19 false positives is the implementer's job; AC9 fixes its
both-directions proof obligation.

**Two existing tests assert the old contract and flip.** Neither is deleted;
each is re-aimed at the contract that replaces it.

- `tests/unit/frontmatter.test.js:21-27` — `'parse: an unclosed block is not
  delimited; body is the whole text'` asserts `delimited === false`,
  `fields.size === 0` and `body === text`. Under Table A an unclosed
  delimiter-shaped opener is FAIL-CLOSED.
- `tests/unit/frontmatter.test.js:29-34` — `'parse: the opening --- must be
  the FIRST line'` asserts, for the blank-first-line shape,
  `delimited === false` and `body === text`. Under Table A that shape is
  FAIL-CLOSED.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iii)** structured input parsing /
acceptance changes; **(iv)** reason-code behavior changes at three gates;
**(vi)** multiple downstream consumers inherit the contract. Three of seven
— the discipline fires.

### Table A — the recognition ruling

Every input falls into exactly one of three classes. The dividing question
for the delimiter-shaped inputs is NOT whether a shape collides with
markdown — the baseline opener already collides, measurably, and that
collision is accepted (Current state). It is whether the deviation is an
**environmental artifact** the writer did not choose, or **selectable
formatting** an attacker can ask for.

| # | Input | Class | Why |
|---|---|---|---|
| A1 | `---` exact first line, with a tolerated closer | **RECOGNIZED** | the baseline |
| A2 | UTF-8 BOM (`U+FEFF`) immediately before `---`, with a tolerated closer | **RECOGNIZED** | a BOM is an encoding artifact emitted by the editor, not by the author: the writer did write `---` as line 1. Recognizing it extends the baseline's already-accepted thematic-break collision to one more encoding; it creates no new collision class |
| A3 | CRLF delimiters — opener `---\r` **and** closer `---\r`, or mixed with LF | **RECOGNIZED** | same: the writer wrote `---`; `\r` is the file's line-ending convention (the Windows default). The module is already CRLF-tolerant on field lines (`:55`) and values (`:67`) — the delimiters are the inconsistency |
| A4 | blank first line before `---`, with a closer | **FAIL-CLOSED** (`malformed`) | the writer chose to put something before the delimiter, and that choice is selectable by whoever formats the note. Silently trusting it is a one-keystroke bypass of every gate in Table B |
| A5 | leading space(s) before `---`, with a closer | **FAIL-CLOSED** | same as A4 |
| A6 | leading tab before `---`, with a closer | **FAIL-CLOSED** | same as A4 |
| A7 | any of A1–A6's openers with **no** tolerated closer | **FAIL-CLOSED** | deleting the closing delimiter is exactly as cheap and exactly as selectable as adding a leading space. Leaving it open would leave the package's central claim hollow: the bypass would move from one keystroke to one deletion |
| A8 | first non-blank line is not delimiter-shaped | no frontmatter (unchanged) | nothing here looks like a block; this is the only path that still yields "trusted, no frontmatter" |

**A3 is indivisible.** Tolerating the CRLF opener without the CRLF closer
leaves `delimited:false` (measured, Current state) — the fail-open is not
closed, only relocated. Both delimiter decisions move together.

**Why fail-closed rather than recognize, for A4–A7.** Recognizing them would
make "where frontmatter starts" depend on leading whitespace or on guessing
an absent closer, which is exactly the interpretation flexibility ADR-0022
exists to refuse. Failing closed keeps the grammar strict and removes the
bypass. Measured cost on the product corpus: **zero files** change
classification in either newly-caught population (Current state).

**The widened sentence.** After this WP, and only this far: *a note whose
leading `---`…`---` block is recognized — with or without a UTF-8 BOM, in
either line-ending convention — and which flags untrusted derivation, is
honoured at every gate in Table B; and a note whose leading text is
delimiter-shaped but deviant in any of the ways A4–A7 name is excluded
fail-closed at those same gates rather than read as trusted.* The
`WP-gate-vault-snapshot` Residual 8 prohibition is discharged to exactly
this sentence. The unconditional sentence ("a note carrying the flag is
skipped") is still not writable, because A8 is genuinely untouched: a note
that carries the flag somewhere other than in a leading delimiter-shaped
block was never gated and is not gated now.

### Table B — measured per-path exposure, and what changes

Rows B1–B6 are the consumers of the recognition change; B7 is the one
consumer-side fix. **Every "today" cell carries its own reproduction command
below the table** — a cell without one is an inference, not a measurement,
and there are none of those here.

| # | Path | Today | After |
|---|---|---|---|
| B1 | Digest **identity injection** (`digest.js:689` → `parseNoteResult` `:190`) | every deviation: `exclusion` is `null` → the note body is injected **including its frontmatter text** | RECOGNIZED → `untrusted-exact`, omitted **silently** (normal policy, ADR-0022 §4). FAIL-CLOSED → `malformed`, omitted **with the existing banner** (`digest.js:784`) |
| B2 | Digest **daily summary** (`digest.js:747` → `readNoteBounded` `:265`) | flag invisible → the `## Summary` section is extracted and framed — **except under CRLF, which is masked**: `extractSection`'s heading match `/^##\s+(.*)$/` (`:327`) cannot match `## Summary\r`, because JS `.` never matches `\r` | excluded at the gate — but **SILENTLY**. The daily path computes `r.note && extractSection(...)` (`:748`) and discards `r.exclusion`; only the identity path feeds the banner. A daily note that today emits a summary and is FAIL-CLOSED after this WP loses it with no signal. Pre-existing for malformed daily notes; this WP enlarges the class. See Out of scope |
| B3 | Snapshot **notes slice** (`vault-snapshot.js:151` → the digest's own exported gate) | every deviation: `exclusion === null` → the file's **raw bytes are copied** into the snapshot a routine reads | skip, reason `provenance gate: <class>` — `untrusted-exact` when RECOGNIZED, `malformed` when FAIL-CLOSED. The existing vocabulary verbatim, no new reason string. Visible in the snapshot's `skipped` list |
| B4 | Dream **Tier-3 floor** (`validate.js:195`) | every deviation: `parseFrontmatter` → `{}` → `'Tier-3 path missing provenance frontmatter (…)'` → the write is reverted. **Fail-CLOSED** | RECOGNIZED: the floor is evaluated on the real values — accepted if it meets the floor, else `'Tier-3 floor not met (…)'`. **Recovered intent — see below.** FAIL-CLOSED: still rejected, now because the block is malformed rather than because it was invisible |
| B5 | Dream **raise-only + preservation guards** (`validate.js:317/325/332`) | every deviation: HEAD parses as `{}`, so `head.derived_from_untrusted === true` is false and the guard **cannot fire**: a revision may lower the flag undetected. The `origin`/`created`/`id` preservation checks likewise compare `undefined === undefined` and pass | RECOGNIZED: the guard sees HEAD's `true` and fires (`'skill revision lowered derived_from_untrusted (raise-only)'`); preservation compares real values. FAIL-CLOSED: the record stays empty, but the file is now rejected upstream rather than silently accepted |
| B6 | `wienerdog memory approve` **evidence display** (`memory.js:134`) | no provenance lines are printed, so the human ratifying the exact bytes cannot see the flag they are ratifying | RECOGNIZED: the four `EVIDENCE_FIELDS` print as today. Evidence only — never authorization (unchanged) |
| B7 | Dream **malformed-block handling** (`validate.js:161`) | `parseFrontmatter` never reads `fm.malformed`. Measured: an **exact-`---` LF** block with floor-passing values plus a junk line passes the Tier-3 floor today | the record is empty on `malformed`, so the write is rejected with the existing missing-provenance reason. **Observable for today's users on exact-`---` notes, not only on the deviations** |

#### Table B — per-row reproduction

Run from the repo root. Each command reproduces its row's "today" cell on
this tree; every one was executed at `7be88c0`. `gateReason` is not
exported, so B3 reproduces the gate's decision **input** and cites the line
where the mapping to a reason string happens.

```bash
# B1 — identity injection: exclusion class, and whether the body is injected
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nbody\n";for(const[k,v]of Object.entries({A1:n(""),A2:n("﻿"),A4:n("\n")})){const r=p(v);console.log(k,"exclusion="+r.exclusion,"bodyInjected="+!!r.note)}'

# B2 — daily summary: exclusion class, and whether extractSection finds the heading (digest.js:327)
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const H=/^##\s+(.*)$/;const n=s=>s+"---\nderived_from_untrusted: true\n---\n## Summary\nx\n";for(const[k,v]of Object.entries({A2:n("﻿"),A3:n("").replace(/\n/g,"\r\n")})){const r=p(v);let f=false;if(r.note)for(const l of r.note.body.split("\n")){const m=l.match(H);if(m&&m[1].trim()==="Summary"){f=true;break}}console.log(k,"exclusion="+r.exclusion,"summaryFound="+f)}'

# B3 — snapshot gate INPUT; the exclusion→reason mapping is vault-snapshot.js:151-153
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({A2:n("﻿"),A4:n("\n")})){const e=p(v).exclusion;console.log(k,"exclusion="+e,"=> reason="+(e===null?"(copied)":"provenance gate: "+e))}'

# B4 — Tier-3 floor; the predicate is validate.js:195-206
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=s=>s+"---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\n---\nb\n";for(const[k,v]of Object.entries({A1:n(""),A3:n("").replace(/\n/g,"\r\n")})){const f=P(v);const has="confidence"in f&&"recurrence"in f&&"derived_from_untrusted"in f;console.log(k,"hasAll="+has,"floorPasses="+(has&&f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))}'

# B5 — raise-only guard; the predicate is validate.js:332
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=(s,v)=>s+"---\nderived_from_untrusted: "+v+"\n---\nb\n";const cur=P(n("","false"));for(const[k,h]of Object.entries({A1:P(n("","true")),A3:P(n("","true").replace(/\n/g,"\r\n"))})){console.log(k,"guardFires="+(h.derived_from_untrusted===true&&cur.derived_from_untrusted!==true))}'

# B6 — memory approve evidence lines; the display loop is memory.js:134-140
node -e 'const{parse}=require("./src/core/frontmatter");const E=["derived_from_untrusted","source_sessions","confidence","recurrence"];const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({A1:n(""),A2:n("﻿")})){const f=parse(v).fields;console.log(k,"evidenceLinesShown="+E.filter(x=>f.has(x)).length)}'

# B7 — the malformed field leak this WP closes; the view is validate.js:161
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85))'
```

**B4 is stated, never shipped silently.** Under A2/A3 a Tier-3 skill file
written by a Windows editor is rejected today with "missing provenance
frontmatter" even when its frontmatter is complete and passing. After this
WP it is read and judged on its merits. That is **recovered intent, not a
relaxation**: the floor's thresholds (`derived_from_untrusted === false`,
confidence ≥ 0.85, recurrence ≥ 3) are untouched. The same shape that made
the validator lose a good write (B4) made it miss a bad one (B5); one fix
resolves both, in opposite directions.

**B2 and B7 are the rows that cost today's users something.** B7: a Tier-3
write with a malformed block that currently slips through on its recognized
fields will start being rejected — fail-closed, matching ADR-0022 §4, on
notes unrelated to the six deviations. B2: a daily note that becomes
FAIL-CLOSED loses its summary with no banner, because the daily path has no
banner for provenance exclusions at all. Both are disclosed here rather than
folded in as side effects.

**Reason-string vocabularies are preserved.** No row introduces a new reason
string. Every row changes *which existing string fires*.

### Mirrored Surface Checklist

Table A's mirrors:

- [ ] `src/core/frontmatter.js` docstring `:14-16` (the "MUST open … FIRST line" and "missing close → no frontmatter" clauses)
- [ ] `src/core/vault-snapshot.js:129-134` (the Gate-2 comment — the fail-open it describes is closed; it must say what the gate now decides on)
- [ ] ADR-0022's recognition description
- [ ] The **two** re-aimed tests in `tests/unit/frontmatter.test.js`
- [ ] The "widened sentence" paragraph
- [ ] Acceptance criteria AC1–AC3

Table B's mirrors:

- [ ] The Deliverables rows for `src/core/dream/validate.js` and the four test files
- [ ] The "Consumer edits: exactly one" paragraph, incl. the digest.js exclusion
- [ ] The per-row reproduction block
- [ ] Acceptance criteria AC4–AC8 (B6 has no criterion by design — it is a display consumer, not a gate)
- [ ] Verification steps V2–V3
- [ ] The B2 entry under Out of scope

## Implementation notes & constraints

- **Grammar untouched.** Do not change the field grammar, the duplicate-key
  rule, `readBool`/`readNumber`, or `coerceScalar`. This WP changes which
  inputs are recognized and which are classified malformed; it does not
  change what a recognized block means.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc annotations only, no
  TypeScript; no build step. Nothing here starts a process (ADR-0004).
- **A BOM is one character, not three bytes, at this layer.** `parse`
  receives a decoded string, so the BOM appears as a single `U+FEFF`.
- **Do not let a tolerated artifact leak into the data.** A BOM must not
  become part of a field name and a `\r` must not become part of a stored
  value — `:67` already strips a trailing `\r` from values; confirm rather
  than assume.
- **Trap — `skillBody` ignores `malformed`.** See Exact contracts.
- **Trap — the migration moment.** ADR-0022's stability argument is that a
  byte sequence accepted at commit is not interpreted differently at read.
  The single-lexer doctrine keeps commit-time and read-time consistent
  *after* the change, because both go through this one function. What moves
  is the interpretation of notes committed before it. The corpus counts
  bound this for files **the repo ships**; they say nothing about a user's
  existing vault, where a note matching any Table A row other than A1 or A8
  changes classification on the next read. The sharpest case is a daily note
  that legitimately opens with a `---` thematic break and has no second
  `---`: it becomes FAIL-CLOSED and loses its summary silently (B2).
- **`tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer** and will diverge after this WP. Accepted residual: it is a
  scenario harness, not a security gate, it is outside ADR-0022's `src/core/`
  scope, and it is not run by `npm test`.
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
      after the closing delimiter. A3 holds for both-CRLF and for a mixed
      file (LF opener, CRLF closer). (Table A)
- [ ] **AC2** — For A4–A7, `parse` reports `malformed`, so `parseNoteResult`
      returns the `'malformed'` exclusion. (Table A)
- [ ] **AC3** — For A8, the result is unchanged from today
      (`delimited:false, malformed:false`, body = the whole text). (Table A)
- [ ] **AC4** — A note carrying `derived_from_untrusted: true` is excluded by
      the digest at **both** its paths — identity injection and the daily
      summary read — under every Table A class except A8; and the identity
      path emits the banner for FAIL-CLOSED while the daily path does not.
      (B1, B2)
- [ ] **AC5** — The snapshot notes-slice gate skips the file with reason
      `provenance gate: <class>`, the class being `untrusted-exact` when
      RECOGNIZED and `malformed` when FAIL-CLOSED; the reason vocabulary
      gains no new member. (B3)
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
      directions: a representative second lexer written as `'---'`, as
      `"---"`, as a template literal, and as a delimiter regex each makes the
      check fail, and the check passes on the real tree. All four forms are
      required — the template literal is the one an earlier draft missed.
- [ ] **AC10** — The full suite and lint are green, and the golden fixtures
      are byte-unchanged (the corpus counts predict zero diff; a diff means
      the ruling reached further than Table A).

## Verification steps (run these; paste output in the PR)

Every new assertion added for AC1–AC9 is a NEW verification step, so each
must be observed **on both sides** — green on the finished state and red on
a deliberately broken one (revert the delimiter decisions, and separately the
B7 guard, and re-run). Paste both outputs.

```bash
# V1 — the one-lexer property (AC9): the implementer's check plus its FOUR
# negative controls. A grep for a single quoting form is NOT sufficient.
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

- **The daily path's exclusion visibility** — successor
  `WP-digest-exclusion-visibility`. `renderDigest`'s daily path discards
  `r.exclusion` (`digest.js:748`), so a provenance exclusion there is silent
  today and stays silent after this WP (B2). Fixing it means editing
  `src/core/digest.js`, which would take this package to nine deliverables,
  past the sizing heuristic in `docs/specs/README.md`. The successor covers
  **every** daily exclusion class, pre-existing and new, which is a cleaner
  scope than bolting the new ones onto this package.
- **Line-ending normalization anywhere but the delimiter decisions.** In
  particular `extractSection`'s CRLF-blind heading match (`digest.js:327`,
  measured in B2) is left exactly as it is.
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
