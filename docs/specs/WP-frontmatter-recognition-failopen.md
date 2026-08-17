---
id: WP-frontmatter-recognition-failopen
title: Close the frontmatter parser's recognition fail-open — recognize the artifact openers, fail closed on the rest
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
block structure**. It also requires that an anomalous exclusion is never
silent — a malformed block appears in the digest's `> [!warning]` banner
(ADR-0022 §4 and its Consequences). That requirement is load-bearing here.

The lexer has a **recognition** fail-open. `parse()` decides that a note has
frontmatter at all by comparing the first line byte-for-byte against `---`,
and it requires a byte-exact closing line. Every deviation — a BOM, CRLF, a
leading blank/space/tab, a trailing space, a fourth hyphen, a missing closer
— makes an explicitly written `derived_from_untrusted: true` invisible. Not
`malformed` (which fails closed and is visible), but "no frontmatter at
all", which reads as **trusted**. Measured on this tree: of fifteen
enumerated leading-delimiter shapes, **exactly one** is gated today (Table
A's probe).

Nothing in the product writes these notes: every writer is a model following
`skills/wienerdog-dream/SKILL.md:158` or a human with an ordinary editor.
Two deviations are environmental accidents (a Windows editor rewriting a
file); the rest are **selectable formatting** — the same untrusted material
that makes the flag necessary can influence the model that formats the note,
so any one left open is a one-keystroke bypass of every gate below.

This WP closes them all, in the two ways they deserve: the encoding-artifact
openers are **recognized**, and every other leading hyphen-run shape is
**fail-closed**. It also closes two consumer-side holes that would otherwise
make that fix unsafe or invisible (Table B, rows B2 and B7).

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

Three supporting measurements, all run on this tree (provenance: `7be88c0`):

- **The closer misses too.** In a CRLF file the closing line is `---\r`, so
  `:43` does not match either and `end` stays `-1`. Recognition cannot be
  repaired for CRLF by fixing the opener alone.
- **The baseline opener already collides with a thematic break.** An
  ordinary LF note whose body opens `---` / prose / `---` parses **today**
  as `delimited:true, malformed:true` — recognized and fail-closed. The
  markdown collision is not a new hazard introduced by widening; it is an
  accepted, shipped property of the exact-`---` opener. This is what decides
  Table A's rationale, so it is measured here rather than asserted there.
- **The product corpus is clean, measured by the predicates that matter.**
  The 48 `.md`/`.txt` files under `templates/`, `skills/`, `tests/golden/`
  and `tests/fixtures/` — the files Wienerdog ships or pins — scanned
  byte-wise. The scope excludes `docs/` and `memory/`, which are repo prose
  rather than vault-note corpus and which change with every logbook commit.
  Each count is the population of one classification change:

  | Predicate | Count |
  |---|---|
  | files in scope | 48 |
  | proper openers (first line is exactly `---`) — all stay RECOGNIZED | 27 |
  | …of those, with **no** tolerated closer (would become FAIL-CLOSED) | 0 |
  | leading hyphen-run candidates that are not proper openers (would become FAIL-CLOSED) | 0 |
  | BOM, empty first line, whitespace-indented opener, or any `\r` byte | 0 |

  **These counts bound the repo, not user vaults** — see the migration note
  under Implementation notes.

**Who inherits the defect.** `parse` has three direct `src/` consumers
(`src/core/digest.js:7`, `src/cli/memory.js:9`,
`src/core/dream/validate.js:13`). `src/core/layout.js` and
`src/core/dream/config.js` import only `coerceScalar` and are **not**
affected. Each consumer's measured exposure is Table B.

**Two consumer-side holes.** Neither is created by this WP; both would be
enlarged by it, so both are closed here.

- `src/core/dream/validate.js:161-178` builds its frontmatter view by
  iterating `fm.fields` and **never reads `fm.malformed`**. Measured: an LF
  block carrying floor-passing values *plus* a junk line yields
  `parse.malformed === true` and still presents a complete record that
  passes the Tier-3 floor (row B7).
- `src/core/digest.js:748` computes `r.note && extractSection(...)` and
  **discards `r.exclusion`**, so a provenance exclusion on the daily path is
  silent — no banner, no signal. ADR-0022's Consequences state that an
  anomalous exclusion can never be silent, so enlarging the malformed class
  without fixing this would ship an ADR contradiction (row B2).

**Where this is already recorded.** `docs/specs/done/WP-gate-vault-snapshot.md`
Residual 8 (`:430`) and its Table A Gate-2 row (`:259`) deliberately narrow
the snapshot gate's guarantee to "PARSER-RECOGNIZED leading frontmatter",
with the instruction *"Do not write the wider sentence anywhere."* That Done
spec is not edited; this spec records how far the sentence may now widen.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | the two delimiter decisions (`:40`, `:43`) per Table A; the docstring's recognition clause (`:14-16`), whose "missing close → no frontmatter" sentence Table A invalidates |
| modify | src/core/dream/validate.js | one guard: `parseFrontmatter` (`:161`) yields an empty record when `parse()` reports `malformed` (row B7) |
| modify | src/core/digest.js | the daily path (`:745-748`) surfaces an anomalous exclusion through the banner list that path already uses (row B2) |
| modify | src/core/vault-snapshot.js | comment only (`:129-134`): the Gate-2 narrowing note is replaced by what the gate now decides on |
| modify | docs/adr/0022-single-strict-frontmatter-parser.md | amendment: the recognition/fail-closed contract (Table A) + the uniqueness sentinel (see Exact contracts) |
| modify | tests/unit/frontmatter.test.js | parser-level coverage incl. Table A's boundary set; **two** existing tests assert the old contract and flip — see Exact contracts |
| modify | tests/unit/digest.test.js | both digest paths, incl. the daily banner |
| modify | tests/unit/vault-snapshot.test.js | the notes-slice gate under both outcome classes |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor, the raise-only guard, and the B7 guard |

**Nine deliverables — one over `docs/specs/README.md`'s "≤ 8 files touched"
heuristic, deliberately.** That is one of three sizing heuristics; the
primary one (≤ ~400 lines of new non-test content) is not approached — the
new non-test content is a few lines in three files. The ninth file is
`src/core/digest.js`, and it is here because ADR-0022 makes exclusion
visibility binding: splitting it out would leave the product contradicting a
cited ADR, with this WP creating the new instances. Stated rather than
quietly exceeded, so the exceedance is visible and arguable.

**Consumer edits: two, both named.** Every consumer reaches `parse` through
`parseNoteResult`, `parseFrontmatter` or `skillBody` and inherits the
recognition change without an edit — measured across all six validator call
sites (`validate.js:195, 317, 325, 343, 500, 1170`). The two exceptions are
the B7 guard and the B2 banner, neither of which is inherited because each
closes a defect in a consumer's own handling of the parse result, not in the
parse result.

### Exact contracts

**The parse signature does not change.** `parse(text) → {delimited,
malformed, fields, body}` keeps its shape, its field grammar, its
duplicate-key rule, and its typed accessors. What changes is delimiter
recognition, per Table A.

**A recognized block means what it always meant.** Same `fields`, same
`malformed`, and `body` = the text after the closing delimiter. In a CRLF
file the body's lines still carry their `\r` — this spec does **not**
normalize line endings in `body` (see Out of scope).

**Fail-closed is a property, not a representation.** For every input Table A
classifies FAIL-CLOSED, the required property is that `malformed` is true,
so `ok-to-trust` (`delimited && !malformed`) is false and `parseNoteResult`
returns the existing `'malformed'` exclusion. Whether `delimited` is true or
false, and how `fields` and `body` are populated, is the implementer's
choice within that property, with one obligation: `skillBody`
(`validate.js:343`) reads `body` **without** consulting `malformed`, so the
implementer must confirm that whatever is chosen produces no user-observable
difference on that path, and report it if it does.

**The B7 guard.** `parseFrontmatter` (`validate.js:161`) yields an empty
record when `parse()` reports `malformed`, so a malformed block can no
longer present fields to the Tier-3 floor, the registry/preservation checks,
or the raise-only guard. It keeps the existing
`'Tier-3 path missing provenance frontmatter (…)'` reason — no new reason
string.

**The B2 banner.** The daily path pushes onto the same `identityExclusions`
list it already uses at `digest.js:766`, with the same **code-owned** label
`'daily-summary'` (never note content — the banner's existing rule) and the
same reason strings the identity path uses at `:691-692`:
`'malformed frontmatter'` for `malformed`, `'unclear derived_from_untrusted
value'` for `untrusted-invalid`. `untrusted-exact` and an absent flag stay
**silent** — they are normal policy, not anomalies (ADR-0022 §4). No new
reason string, no new banner, no new mechanism.

**The ADR-0022 uniqueness sentinel names a property, not a command.**
ADR-0022 §1 names the literal expression `lines[0] !== '---'` as the grep
proving there is no second lexer in `src/core/`. That literal is one of the
lines this WP edits. An earlier draft proposed `grep -rn "'---'" src/core/`
and called it shape-independent; **that was wrong** — it is quote-dependent.
Widening it naively is no better: `grep -rnE -- "---" src/core/` returns 19
hits across 6 files, mostly prose in comments. The amendment states the
**property**: *no file under `src/core/` other than `frontmatter.js` may
compare a line against the `---` delimiter, in any quoting or regex form.*
Constructing a check that holds it without 19 false positives is the
implementer's job; AC9 fixes its both-directions proof obligation.

**Two existing tests assert the old contract and flip.** Neither is deleted;
each is re-aimed at the contract that replaces it.

- `tests/unit/frontmatter.test.js:21-27` — `'parse: an unclosed block is not
  delimited; body is the whole text'` asserts `delimited === false`,
  `fields.size === 0`, `body === text`. Under Table A a proper opener with
  no closer is FAIL-CLOSED.
- `tests/unit/frontmatter.test.js:29-34` — `'parse: the opening --- must be
  the FIRST line'` asserts, for the blank-first-line shape,
  `delimited === false` and `body === text`. Under Table A that is
  FAIL-CLOSED.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iii)** structured input parsing /
acceptance changes; **(iv)** reason-code behavior changes at three gates;
**(vi)** multiple downstream consumers inherit the contract.

### Table A — the recognition ruling

The dividing question is NOT whether a shape collides with markdown — the
baseline opener already collides, measurably, and that collision is accepted
(Current state). It is whether the deviation is an **environmental artifact**
the writer did not choose, or **selectable formatting** an attacker can ask
for.

**Normalization, used by every rule below.** A **BOM** is a `U+FEFF` at byte
0 of the file. A **tolerated closer** is a later line that, after a single
trailing `\r` is stripped, is exactly `---`.

**The classes are decided by three rules, first match wins.** This
precedence is the contract: an input matching more than one row's *prose*
is decided by the earliest rule, and there is no input that matches none.

| Rule | Predicate | Class | Examples |
|---|---|---|---|
| R1 | The file's FIRST line, after removing a BOM and a single trailing `\r`, is exactly `---` — **and** a tolerated closer exists | **RECOGNIZED** | exact `---`; BOM + `---`; CRLF `---\r`; mixed LF opener / CRLF closer |
| R2 | R1's first line matches but **no** tolerated closer exists; **or** the file's first line that is non-empty (after stripping a trailing `\r`), once any leading `U+FEFF` characters and surrounding `[ \t]` are removed, matches `-{3,}` | **FAIL-CLOSED** (`malformed`) | `---` with no closer; blank line, space, or tab before `---`; a trailing-space `---`; `----`; a blank line then a BOM then `---` |
| R3 | Everything else, including an empty file and an all-blank file | no frontmatter (unchanged) | plain prose; a `***` or `___` thematic break; empty string |

**Why R1 is narrow and R2 is wide.** R1 recognizes only what an editor can
produce without the author choosing it: a BOM and a line-ending convention.
Everything else in the leading hyphen-run family is selectable, so it fails
closed — including the two shapes an earlier draft of this table left
undefined (a trailing-space `---`, and `----`), which fell through to R3 and stayed trusted.
Deleting the closing delimiter is exactly as cheap as adding a leading
space, so R2 covers it too.

**Why R3 stops where it does.** A leading `***` or `___` break, or ordinary
prose, is not a frontmatter attempt in any convention, and a note with no
provenance block is trusted **by ADR-0022 §5's explicit decision** — treating
an absent flag as untrusted would empty the digest and break M2. R3 is that
decision, not a gap in this one.

**A3 is indivisible.** Tolerating the CRLF opener without the CRLF closer
leaves `delimited:false` (measured, Current state) — the fail-open is not
closed, only relocated. Both delimiter decisions move together.

**Measured cost.** On the product corpus, the population that changes
classification under R2 is **zero** files (Current state).

#### Table A — boundary probe

Run from the repo root. It classifies an enumerated boundary set by the
three rules above and prints each input's behaviour **today**, so the
partition is checkable (every input lands in exactly one class) and the
defect is visible (today only the first row is gated). The reference
classifier fixes the CLASS each input lands in; the representation
(`delimited`, `fields`, `body`) remains the implementer's, per Exact
contracts.

```bash
node -e '
const { parse } = require("./src/core/frontmatter");
const { parseNoteResult } = require("./src/core/digest");
const F = "derived_from_untrusted: true";
function classify(text) {
  const lines = text.split("\n");
  const closer = (from) => lines.slice(from + 1).some((l) => l.replace(/\r$/, "") === "---");
  const l0 = lines[0].replace(/^﻿/, "").replace(/\r$/, "");
  if (l0 === "---") return closer(0) ? "RECOGNIZED" : "FAIL-CLOSED";
  const ci = lines.findIndex((l) => l.replace(/\r$/, "") !== "");
  if (ci < 0) return "no frontmatter";
  const c = lines[ci].replace(/\r$/, "").replace(/^﻿+/, "").replace(/^[ \t]+|[ \t]+$/g, "");
  return /^-{3,}$/.test(c) ? "FAIL-CLOSED" : "no frontmatter";
}
const cases = {
  "R1 exact + closer": `---\n${F}\n---\nb\n`,
  "R1 BOM + closer": `﻿---\n${F}\n---\nb\n`,
  "R1 CRLF both": `---\n${F}\n---\nb\n`.replace(/\n/g, "\r\n"),
  "R1 mixed LF/CRLF closer": `---\n${F}\r\n---\r\nb\n`,
  "R2 blank line + closer": `\n---\n${F}\n---\nb\n`,
  "R2 space + closer": ` ---\n${F}\n---\nb\n`,
  "R2 tab + closer": `\t---\n${F}\n---\nb\n`,
  "R2 exact, NO closer": `---\n${F}\nno close\n`,
  "R2 trailing space": `--- \n${F}\n---\nb\n`,
  "R2 four hyphens": `----\n${F}\n---\nb\n`,
  "R2 blank + BOM + ---": `\n﻿---\n${F}\n---\nb\n`,
  "R3 all-blank": "\n\n\n",
  "R3 empty string": "",
  "R3 plain prose": "no frontmatter here\n",
  "R3 *** not hyphen-run": `***\n${F}\n---\nb\n`,
};
const seen = {};
for (const [k, v] of Object.entries(cases)) {
  const cls = classify(v); seen[cls] = (seen[cls] || 0) + 1;
  const r = parse(v);
  console.log(k.padEnd(26), "|", cls.padEnd(14), "| today", `${r.delimited}/${r.malformed}`.padEnd(12),
    "| excl", String(parseNoteResult(v).exclusion));
}
console.log("classified", Object.values(seen).reduce((a,b)=>a+b,0), "of", Object.keys(cases).length, JSON.stringify(seen));
'
```

**The widened sentence.** After this WP, and only this far: *a note whose
leading `---`…`---` block is RECOGNIZED and which flags untrusted derivation
is honoured at every gate in Table B; and a note whose leading text is
FAIL-CLOSED is excluded as malformed at those same gates, visibly, rather
than read as trusted.* The `WP-gate-vault-snapshot` Residual 8 prohibition
is discharged to exactly this sentence. The unconditional sentence ("a note
carrying the flag is skipped") is still not writable, because R3 is
genuinely untouched by ADR-0022 §5's own decision.

### Table B — measured per-path exposure, and what changes

**Every "today" cell carries its own reproduction command below the table** —
a cell without one is an inference, not a measurement, and there are none of
those here.

| # | Path | Today | After |
|---|---|---|---|
| B1 | Digest **identity injection** (`digest.js:689` → `parseNoteResult` `:190`) | every deviation: `exclusion` is `null` → the note body is injected **including its frontmatter text** | RECOGNIZED → `untrusted-exact`, omitted **silently** (normal policy). FAIL-CLOSED → `malformed`, omitted **with the existing banner** (`:784`) |
| B2 | Digest **daily summary** (`digest.js:747` → `readNoteBounded` `:265`) | flag invisible → the `## Summary` section is extracted and framed — **except under CRLF, which is masked**: `extractSection`'s heading match `/^##\s+(.*)$/` (`:327`) cannot match `## Summary\r`, because JS `.` never matches `\r`. And any exclusion here is **silent**: `:748` discards `r.exclusion` | excluded at the gate, and an anomalous exclusion now reaches the banner via the list this path already uses at `:766` — code-owned label, existing reason strings (Exact contracts). `untrusted-exact` stays silent |
| B3 | Snapshot **notes slice** (`vault-snapshot.js:151`) | every deviation: `exclusion === null` → the file's **raw bytes are copied** into the snapshot a routine reads | skip, reason `provenance gate: <class>` — `untrusted-exact` when RECOGNIZED, `malformed` when FAIL-CLOSED. Existing vocabulary verbatim; visible in the snapshot's `skipped` list |
| B4 | Dream **Tier-3 floor** (`validate.js:195`) | every deviation: `parseFrontmatter` → `{}` → `'Tier-3 path missing provenance frontmatter (…)'` → the write is reverted. **Fail-CLOSED** | RECOGNIZED: the floor is evaluated on the real values — accepted if it meets the floor, else `'Tier-3 floor not met (…)'`. **Recovered intent — see below.** FAIL-CLOSED: still rejected, now because the block is malformed rather than because it was invisible |
| B5 | Dream **raise-only + preservation guards** (`validate.js:317/325/332`) | every deviation: HEAD parses as `{}`, so `head.derived_from_untrusted === true` is false and the guard **cannot fire**: a revision may lower the flag undetected. `origin`/`created`/`id` preservation likewise compares `undefined === undefined` and passes | RECOGNIZED: the guard sees HEAD's `true` and fires; preservation compares real values. FAIL-CLOSED: the record stays empty, but the file is rejected upstream rather than silently accepted |
| B6 | `wienerdog memory approve` **evidence display** (`memory.js:134`) | no provenance lines printed, so the human ratifying the exact bytes cannot see the flag they are ratifying | RECOGNIZED: the four `EVIDENCE_FIELDS` print as today. Evidence only — never authorization (unchanged) |
| B7 | Dream **malformed-block handling** (`validate.js:161`) | `parseFrontmatter` never reads `fm.malformed`. Measured: an **exact-`---` LF** block with floor-passing values plus a junk line passes the Tier-3 floor today | the record is empty on `malformed`, so the write is rejected with the existing missing-provenance reason. **Observable for today's users on exact-`---` notes, not only on the deviations** |

#### Table B — per-row reproduction

Run from the repo root; each reproduces its row's "today" cell. `gateReason`
is not exported, so B3 reproduces the gate's decision **input** and cites
`vault-snapshot.js:151-153`, where the mapping to a reason string happens.

```bash
# B1 — identity injection: exclusion class, and whether the body is injected
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nbody\n";for(const[k,v]of Object.entries({R1:n(""),BOM:n("﻿"),BLANK:n("\n")})){const r=p(v);console.log(k,"exclusion="+r.exclusion,"bodyInjected="+!!r.note)}'

# B2 — daily summary: exclusion class, and whether extractSection finds the heading (digest.js:327)
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const H=/^##\s+(.*)$/;const n=s=>s+"---\nderived_from_untrusted: true\n---\n## Summary\nx\n";for(const[k,v]of Object.entries({BOM:n("﻿"),CRLF:n("").replace(/\n/g,"\r\n")})){const r=p(v);let f=false;if(r.note)for(const l of r.note.body.split("\n")){const m=l.match(H);if(m&&m[1].trim()==="Summary"){f=true;break}}console.log(k,"exclusion="+r.exclusion,"summaryFound="+f)}'

# B3 — snapshot gate INPUT; the exclusion→reason mapping is vault-snapshot.js:151-153
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({BOM:n("﻿"),BLANK:n("\n")})){const e=p(v).exclusion;console.log(k,"exclusion="+e,"=> reason="+(e===null?"(copied)":"provenance gate: "+e))}'

# B4 — Tier-3 floor; the predicate is validate.js:195-206
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=s=>s+"---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\n---\nb\n";for(const[k,v]of Object.entries({R1:n(""),CRLF:n("").replace(/\n/g,"\r\n")})){const f=P(v);const has="confidence"in f&&"recurrence"in f&&"derived_from_untrusted"in f;console.log(k,"hasAll="+has,"floorPasses="+(has&&f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))}'

# B5 — raise-only guard; the predicate is validate.js:332
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=(s,v)=>s+"---\nderived_from_untrusted: "+v+"\n---\nb\n";const cur=P(n("","false"));for(const[k,h]of Object.entries({R1:P(n("","true")),CRLF:P(n("","true").replace(/\n/g,"\r\n"))})){console.log(k,"guardFires="+(h.derived_from_untrusted===true&&cur.derived_from_untrusted!==true))}'

# B6 — memory approve evidence lines; the display loop is memory.js:134-140
node -e 'const{parse}=require("./src/core/frontmatter");const E=["derived_from_untrusted","source_sessions","confidence","recurrence"];const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({R1:n(""),BOM:n("﻿")})){const f=parse(v).fields;console.log(k,"evidenceLinesShown="+E.filter(x=>f.has(x)).length)}'

# B7 — the malformed field leak this WP closes; the view is validate.js:161
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85))'
```

**B4 is stated, never shipped silently.** Under a RECOGNIZED artifact opener
a Tier-3 skill file written by a Windows editor is rejected today with
"missing provenance frontmatter" even when its frontmatter is complete and
passing. After this WP it is read and judged on its merits — **recovered
intent, not a relaxation**: the floor's thresholds are untouched. The same
shape that made the validator lose a good write (B4) made it miss a bad one
(B5); one fix resolves both, in opposite directions.

**B7 costs today's users something.** A Tier-3 write with a malformed block
that currently slips through on its recognized fields starts being rejected
— fail-closed, matching ADR-0022 §4, on notes unrelated to the deviations.
Disclosed rather than folded in as a side effect.

**Reason-string vocabularies are preserved.** No row introduces a new reason
string, a new banner, or a new label. Every row changes *which existing
string fires*.

### Mirrored Surface Checklist

Table A's mirrors:

- [ ] `src/core/frontmatter.js` docstring `:14-16` (the "MUST open … FIRST line" and "missing close → no frontmatter" clauses)
- [ ] `src/core/vault-snapshot.js:129-134` (the Gate-2 comment)
- [ ] ADR-0022's recognition description
- [ ] The **two** re-aimed tests in `tests/unit/frontmatter.test.js`
- [ ] The boundary probe's enumerated case set
- [ ] The "widened sentence" paragraph
- [ ] Acceptance criteria AC1–AC3

Table B's mirrors:

- [ ] The Deliverables rows for `validate.js`, `digest.js` and the four test files
- [ ] The "Consumer edits: two, both named" paragraph
- [ ] The per-row reproduction block
- [ ] Acceptance criteria AC4–AC8 (B6 has no criterion by design — it is a display consumer, not a gate)
- [ ] Verification steps V2–V3

## Implementation notes & constraints

- **Grammar untouched.** Do not change the field grammar, the duplicate-key
  rule, `readBool`/`readNumber`, or `coerceScalar`.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc annotations only, no
  TypeScript; no build step. Nothing here starts a process (ADR-0004).
- **A BOM is one character, not three bytes, at this layer.** `parse`
  receives a decoded string, so a BOM appears as a single `U+FEFF`. Note
  R2's normalization strips leading `U+FEFF` characters wherever the
  candidate line begins, precisely so a BOM that is *not* at byte 0 cannot
  smuggle a delimiter past R1.
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
  existing vault, where a note matching R1's artifact openers or any R2 shape
  changes classification on the next read. Every changed outcome in Table B
  is either an exclusion (fail-closed, and now visible on every path) or a
  recovered acceptance (B4) — never a new admission of flagged content.
- **`tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer** and will diverge after this WP. Accepted residual: a
  scenario harness, not a security gate, outside ADR-0022's `src/core/`
  scope, and not run by `npm test`.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is two in-memory string comparisons
      inside `parse`, one guard in the validator, and one push of a
      **code-owned** label onto an existing banner list. No path, filename or
      command is constructed anywhere. The anchored-pattern rule has no
      subject here — stated rather than deleted so the absence is checkable.
- [ ] The B2 banner carries no note content: the label is the fixed string
      `'daily-summary'` and the reasons are the two fixed strings the
      identity path already uses — the same code-owned rule as `:784`.
- [ ] Every classification this WP changes moves a note from *trusted*
      toward *gated*, with exactly one exception in the opposite direction —
      B4, whose thresholds are untouched and which is disclosed in Table B.

## Acceptance criteria

- [ ] **AC1** — Every input in the boundary probe's enumerated set lands in
      exactly one Table A class, and the RECOGNIZED ones return
      `delimited:true` with the same `fields` and `malformed` as an exact
      opener, and `body` = the text after the closing delimiter. (Table A)
- [ ] **AC2** — Every FAIL-CLOSED input reports `malformed`, so
      `parseNoteResult` returns the `'malformed'` exclusion. This includes
      a trailing-space `---`, `----`, and a blank line followed by a BOM and
      `---` — the three an earlier draft left undefined. (Table A, R2)
- [ ] **AC3** — Every R3 input, including an empty file and an all-blank
      file, is unchanged from today (`delimited:false, malformed:false`,
      body = the whole text). (Table A, R3)
- [ ] **AC4** — A note carrying `derived_from_untrusted: true` is excluded by
      the digest at **both** its paths under R1 and R2; and for a FAIL-CLOSED
      note **both** paths emit the banner, the daily one via the code-owned
      `'daily-summary'` label. An `untrusted-exact` exclusion emits no banner
      on either path. (B1, B2)
- [ ] **AC5** — The snapshot notes-slice gate skips the file with reason
      `provenance gate: <class>`, the class being `untrusted-exact` when
      RECOGNIZED and `malformed` when FAIL-CLOSED; the reason vocabulary
      gains no new member. (B3)
- [ ] **AC6** — Under a RECOGNIZED artifact opener, a Tier-3 write whose
      frontmatter meets the floor is accepted, and one that does not is
      rejected with the floor's own reason string — not with "missing
      provenance frontmatter". (B4)
- [ ] **AC7** — Under a RECOGNIZED artifact opener, a skill revision that
      lowers `derived_from_untrusted` from a HEAD carrying `true` is rejected
      by the raise-only guard. (B5)
- [ ] **AC8** — A block reported `malformed` presents **no** fields to the
      validator, so a Tier-3 write with a malformed block and otherwise
      floor-passing values is rejected — including on an exact-`---` LF note,
      the pre-existing case. (B7)
- [ ] **AC9** — The one-lexer property holds and its check is proven in both
      directions: a second lexer written as `'---'`, as `"---"`, as a
      template literal, and as a delimiter regex each makes the check fail,
      and the check passes on the real tree. All four are required.
- [ ] **AC10** — The full suite and lint are green, and the golden fixtures
      are byte-unchanged (the corpus counts predict zero diff; a diff means
      the ruling reached further than Table A).

## Verification steps (run these; paste output in the PR)

Every new assertion added for AC1–AC9 is a NEW verification step, so each
must be observed **on both sides** — green on the finished state and red on
a deliberately broken one (revert the delimiter decisions, the B7 guard, and
the B2 push, each separately, and re-run). Paste both outputs.

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

- **Exclusion visibility beyond the daily path** — successor
  `WP-digest-exclusion-visibility`, now narrowed to what is genuinely
  separate work: the banner's noun ("some identity notes") is inaccurate for
  a daily-summary entry, and the snapshot's `skipped` list and the dream's
  enforcement report use their own reporting shapes. This WP adds the daily
  path's missing push and nothing else.
- **Line-ending normalization anywhere but the delimiter decisions.** In
  particular `extractSection`'s CRLF-blind heading match (`digest.js:327`,
  measured in B2) is left exactly as it is: fixing it would change which
  daily summaries are emitted for notes carrying no flag at all.
- **`tests/scenarios/run-scenarios.js`** — its duplicate lexer is an accepted
  residual (Implementation notes).
- **Any validator change beyond the B7 guard**, and any digest change beyond
  the B2 push. The Tier-3 thresholds, the ledger schema, the revision
  authorization rules, and the digest's identity path are untouched.
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
