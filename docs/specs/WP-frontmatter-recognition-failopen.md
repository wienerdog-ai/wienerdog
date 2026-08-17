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

Five supporting measurements, all run on this tree (provenance: `7be88c0`
for the first three, `74550a9` for the last two):

- **The digest renderer already splits on eight separators that `parse` does
  not.** `DAILY_LINE_BREAK` (`digest.js:56`) treats CRLF, LF, CR, NEL
  `U+0085`, VT `U+000B`, FF `U+000C`, LS `U+2028` and PS `U+2029` as line
  breaks, with a comment saying exactly why. `parse` splits on LF only, so a
  leading `---` / flag / `---` region built from any of the other six is one
  parser line: measured, **all six** yield `exclusion = null`, i.e. trusted,
  while the renderer would show them as separate visual lines. This is the
  product disagreeing with itself about what a line is, inside the one
  module ADR-0022 made the single lexer.
- **`trim()` covers the whitespace family but not NEL.** Measured:
  `String.prototype.trim()` strips BOM, NBSP, every Unicode space, VT, FF,
  CR, LS and PS — but **not** NEL `U+0085`, and not ZWSP `U+200B`. It is a
  fixed point. That gap is why Table A's contract is a *composition* of
  splitting and trimming rather than either alone.

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
| modify | src/core/digest.js | the daily path (`:745-748`) surfaces an anomalous exclusion through the banner list that path already uses, and the banner's wording (`:784`) becomes accurate for a heterogeneous list (row B2, Exact contracts) |
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

**The B2 banner, and its wording.** The daily path pushes onto the same
`identityExclusions` list it already uses at `digest.js:766`, with the same
**code-owned** label `'daily-summary'` (never note content — the banner's
existing rule) and the same reason strings the identity path uses at
`:691-692`: `'malformed frontmatter'` for `malformed`, `'unclear
derived_from_untrusted value'` for `untrusted-invalid`. `untrusted-exact`
and an absent flag stay **silent** — normal policy, not anomalies
(ADR-0022 §4). No new reason string, no new mechanism.

The banner's **wording** must also become accurate, because it is now
assembled from a heterogeneous list. Today `:784` says "some identity notes
were left out" and directs the user to `wienerdog memory approve <note>` —
and that command accepts only the four fixed identity notes (`memory.js`'s
`KNOWN` map, measured: `profile`, `preferences`, `goals`, `instructions`).
A daily-summary entry therefore gets a wrong noun and an impossible remedy.
The fix is within this file: a noun that covers both kinds, and the
approval sentence included only when an identity entry is actually present.
All wording stays code-owned and fixed-template, so the golden-frozen
property at `:786-790` is preserved when the list is empty.

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

**The classification is a TOTAL function, proved by construction — not by
enumeration.** Three earlier drafts of this table enumerated deviant shapes
and were each defeated by a shape outside the enumeration (whitespace
combinations, then a trailing space and a fourth hyphen, then non-LF line
separators). The contract below therefore fixes the *shape of the proof*:
a normalization with a named character set, a single `if / else if / else`
whose branches are exhaustive because they are the only branches, and a
generated-input sweep instead of a case list.

**Step 1 — split the leading region.** Split on **exactly the character set
the digest renderer treats as a line break**: `DAILY_LINE_BREAK`
(`digest.js:56`) — CRLF as one, then LF, CR, NEL `U+0085`, VT `U+000B`,
FF `U+000C`, LS `U+2028`, PS `U+2029`. **Eight separators, measured from the
constant, not assumed**: an earlier draft of this rule said "all four" and
would have left NEL, VT and FF open. The two sets **must be identical** —
where the constant lives is the implementer's choice (`frontmatter.js` cannot
require `digest.js`; that would be circular), but a test must assert the
equality so the two cannot drift.

**Step 2 — normalize each leading line with `String.prototype.trim()`.**
That is the named character set: ECMAScript WhiteSpace ∪ LineTerminator ∪
`U+FEFF`. One anchored operation, not ordered replacements, and a fixed
point (`s.trim() === s.trim().trim()`). It covers BOM, NBSP `U+00A0`, and
every Unicode space. `trim()` alone does **not** strip NEL — measured — but
NEL is a Step-1 separator, so the composition has no gap on the renderer's
set. Neither step alone is sufficient; the contract is the pair.

**Step 3 — classify. First match wins; the three branches are total.**

| Rule | Predicate | Class |
|---|---|---|
| R1 | Line 0, after removing a `U+FEFF` at byte 0, is exactly `---`; a **tolerated closer** exists (a later leading line whose `trim()` is `---`); and every separator inside the block is LF or CRLF | **RECOGNIZED** |
| R2 | Line 0 matches R1's first clause but there is no tolerated closer, or a separator inside the block is not LF/CRLF; **or** the first leading line whose `trim()` is non-empty has a `trim()` matching `-{3,}` | **FAIL-CLOSED** (`malformed`) |
| R3 | Everything else, including an empty file and an all-blank file | no frontmatter (unchanged) |

**Why R1 requires an LF/CRLF-delimited block.** The field lexer still splits
on LF. A block delimited by CR-only, NEL, VT, FF, LS or PS cannot have its
fields lexed, so recognizing it would produce a block whose contents we
cannot read — it fails closed instead. Making the whole parser agree on what
a line is belongs to the successor WP (Out of scope), and R2 holds the
boundary until it lands.

**Why R1 is narrow and R2 is wide.** R1 recognizes only what an editor
produces without the author choosing it: a BOM and an LF/CRLF convention.
Every other leading hyphen-run is selectable by whoever formats the note, so
it fails closed.

**Why R3 stops where it does, and the one invisible it keeps.** A leading
`***` or `___` break, or ordinary prose, is not a frontmatter attempt in any
convention, and a note with no provenance block is trusted **by ADR-0022
§5's explicit decision** — treating an absent flag as untrusted would empty
the digest and break M2. One invisible survives `trim()` and therefore lands
in R3: ZWSP `U+200B`. That is not an oversight — measured, `DAILY_INVISIBLE`
(`digest.js:75`) **encodes** it, so a ZWSP-prefixed line renders visibly as
`<U+200B>---` and is not a silent delimiter to a human either. Any future
invisible that is neither trimmed nor encoded would be a real gap, and the
sweep below is what would find it.

**Measured cost.** On the product corpus, the population that changes
classification is **zero** files (Current state).

#### Table A — totality probe and generated sweep

This is the *reference* classifier, not the implementation: it fixes which
class each input lands in, while the representation (`delimited`, `fields`,
`body`) stays the implementer's per Exact contracts. Two things it must
show, and the second is the one an enumeration cannot give you:

1. a worked set landing in exactly one class each, and
2. a **generated sweep** over an alphabet of hyphens, all eight separators,
   trim-set whitespace, BOM, ZWSP and field text, asserting **totality**
   (every input gets one of the three classes) and the **leak property**
   (no input whose first non-blank leading line trims to a hyphen run is
   classified R3).

It goes through a quoted heredoc, not an inline one-liner — a pattern passed
through nested quotes silently changes what it matched
(`docs/runbooks/codex-review.md`, Rules). **Every control character is an
escape**: a literal one does not survive a copy/paste round trip, and a probe
that loses its characters reports the wrong class while looking healthy —
observed once while writing this spec.

```bash
cat > /tmp/wd-tableA.js <<'PROBE'
'use strict';
const SEP = new RegExp('(\\r\\n|[\\n\\r\\u0085\\u000B\\u000C\\u2028\\u2029])');
const NEL='', VT='', FF='', LS=' ', PS=' ';
const BOM='﻿', NBSP=' ', ZWSP='​';
function splitLeading(t){const p=String(t).split(SEP),l=[],s=[];
  for(let i=0;i<p.length;i+=2){l.push(p[i]);s.push(p[i+1]);}return{lines:l,seps:s};}
const LF_LIKE=(s)=>s==='\n'||s==='\r\n';
function classify(text){
  const {lines,seps}=splitLeading(text);
  if(lines[0].replace(/^﻿/,'')==='---'){
    let end=-1; for(let i=1;i<lines.length;i++) if(lines[i].trim()==='---'){end=i;break;}
    if(end===-1) return 'FAIL-CLOSED';
    for(let i=0;i<end;i++) if(!LF_LIKE(seps[i])) return 'FAIL-CLOSED';
    return 'RECOGNIZED';
  }
  const ci=lines.findIndex((l)=>l.trim()!=='');
  if(ci<0) return 'no frontmatter';
  return /^-{3,}$/.test(lines[ci].trim())?'FAIL-CLOSED':'no frontmatter';
}
console.log('constants:',[NEL,VT,FF,LS,PS,BOM,NBSP,ZWSP]
  .map((c)=>'U+'+c.codePointAt(0).toString(16).toUpperCase()).join(' '));
const F='derived_from_untrusted: true';
const cases={
  'R1 exact + closer':'---\n'+F+'\n---\nb\n',
  'R1 BOM + closer':BOM+'---\n'+F+'\n---\nb\n',
  'R1 CRLF both':'---\r\n'+F+'\r\n---\r\nb\r\n',
  'R1 mixed LF/CRLF':'---\n'+F+'\r\n---\r\nb\n',
  'R2 space-only line':' \n---\n'+F+'\n---\nb\n',
  'R2 tab-only line':'\t\n---\n'+F+'\n---\nb\n',
  'R2 space BOM ---':' '+BOM+'---\n'+F+'\n---\nb\n',
  'R2 BOM space BOM ---':BOM+' '+BOM+'---\n'+F+'\n---\nb\n',
  'R2 NBSP ---':NBSP+'---\n'+F+'\n---\nb\n',
  'R2 NEL block':['---',F,'---','b'].join(NEL)+'\n',
  'R2 VT block':['---',F,'---','b'].join(VT)+'\n',
  'R2 FF block':['---',F,'---','b'].join(FF)+'\n',
  'R2 CR-only block':['---',F,'---','b'].join('\r')+'\n',
  'R2 LS block':['---',F,'---','b'].join(LS)+'\n',
  'R2 PS block':['---',F,'---','b'].join(PS)+'\n',
  'R2 four hyphens':'----\n'+F+'\n---\nb\n',
  'R2 trailing space':'--- \n'+F+'\n---\nb\n',
  'R2 no closer':'---\n'+F+'\nno close\n',
  'R3 ZWSP ---':ZWSP+'---\n'+F+'\n---\nb\n',
  'R3 all-blank':'\n\n\n',
  'R3 empty':'',
  'R3 plain prose':'no frontmatter here\n',
  'R3 asterisk break':'***\n'+F+'\n---\nb\n',
};
const seen={};
for(const [k,v] of Object.entries(cases)){const c=classify(v);seen[c]=(seen[c]||0)+1;
  console.log(k.padEnd(24),'->',c);}
console.log('\nworked set:',Object.values(seen).reduce((a,b)=>a+b,0),'of',
  Object.keys(cases).length,JSON.stringify(seen));
const ALPH=['-','---','----',' ','\t',NBSP,BOM,ZWSP,'\n','\r\n','\r',NEL,VT,FF,LS,PS,'k: v','x'];
function rnd(seed){let s=seed;return()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;}
const r=rnd(20260817); let n=0,bad=0,leak=0;
for(let i=0;i<50000;i++){
  let t=''; const len=1+Math.floor(r()*10);
  for(let j=0;j<len;j++) t+=ALPH[Math.floor(r()*ALPH.length)];
  const c=classify(t); n++;
  if(!['RECOGNIZED','FAIL-CLOSED','no frontmatter'].includes(c)) bad++;
  const {lines}=splitLeading(t); const ci=lines.findIndex((l)=>l.trim()!=='');
  if(ci>=0 && /^-{3,}$/.test(lines[ci].trim()) && c==='no frontmatter') leak++;
}
console.log('\nsweep:',n,'inputs | unclassified:',bad,'| hyphen-run leaks to R3:',leak);
PROBE
node /tmp/wd-tableA.js
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
- [ ] The totality probe's worked set AND its sweep properties
- [ ] `DAILY_LINE_BREAK` (`digest.js:56`) — Step 1's set must equal it, and
      the equality test is the mirror that keeps them from drifting
- [ ] The "widened sentence" paragraph
- [ ] Acceptance criteria AC1–AC3b

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
  receives a decoded string, so a BOM appears as a single `U+FEFF`. Step 2's
  `trim()` removes it wherever it sits in a leading line, precisely so a BOM
  that is *not* at byte 0 cannot smuggle a delimiter past R1.
- **The separator constant cannot simply be imported.** `digest.js` requires
  `frontmatter.js`, so the reverse require would be circular. Where the
  shared constant lives is your call within the listed files; what is not
  optional is the test asserting the two sets are identical (Table A, Step 1).
- **The sweep's generator is your call, and belongs in "Decisions made".**
  A property-based library would be a devDependency (permitted — CLAUDE.md
  bars *runtime* deps), and a seeded PRNG in the test file avoids the
  question entirely. Either is acceptable; state which you chose and why.
  What the spec fixes is the two properties the sweep must assert
  (totality, no hyphen-run leak to R3), not the machinery that asserts them.
- **Write control characters as escapes, never literals.** Both in tests and
  in anything pasted into the PR. A literal NEL/VT/FF does not survive a
  copy/paste round trip, and a probe that silently loses its characters
  reports a healthy-looking wrong answer — this happened once while writing
  this spec and cost a re-measurement.
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

- [ ] **AC1** — RECOGNIZED inputs return `delimited:true` with the same
      `fields` and `malformed` as an exact opener, and `body` = the text
      after the closing delimiter. RECOGNIZED requires an LF/CRLF-delimited
      block: a block whose separators include CR-only, NEL, VT, FF, LS or PS
      is NOT recognized. (Table A, R1)
- [ ] **AC2** — Every FAIL-CLOSED input reports `malformed`, so
      `parseNoteResult` returns the `'malformed'` exclusion. This covers, at
      minimum, the three families earlier drafts left open: the
      whitespace/BOM combinations (a whitespace-only line before `---`, a
      space before an embedded BOM, interleaved BOM and space, NBSP), the
      near-delimiter shapes (a trailing-space `---`, `----`), and a leading
      delimiter region built from any of the six non-LF separators.
      (Table A, R2)
- [ ] **AC3** — Every R3 input, including an empty file, an all-blank file,
      and a ZWSP-prefixed `---`, is unchanged from today
      (`delimited:false, malformed:false`, body = the whole text).
      (Table A, R3)
- [ ] **AC3a** — **Totality and no-leak, under a generated sweep, not an
      enumeration.** Over randomized inputs drawn from an alphabet of
      hyphens, all eight separators, trim-set whitespace, BOM, ZWSP and field
      text: every input receives exactly one of the three classes, and no
      input whose first non-blank leading line trims to a hyphen run is
      classified R3. This is the criterion that three enumerated case lists
      failed to provide. (Table A probe)
- [ ] **AC3b** — The leading-region separator set is **identical** to the
      renderer's `DAILY_LINE_BREAK` (`digest.js:56`), asserted by a test that
      compares the two rather than restating either. (Table A, Step 1)
- [ ] **AC4** — A note carrying `derived_from_untrusted: true` is excluded by
      the digest at **both** its paths under R1 and R2; for a FAIL-CLOSED
      note **both** paths emit the banner, the daily one via the code-owned
      `'daily-summary'` label; an `untrusted-exact` exclusion emits no banner
      on either path; and the banner's text is accurate for a list containing
      a daily entry — no identity-only noun, and no approval instruction
      unless an identity entry is present. (B1, B2)
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

Every new assertion added for AC1–AC9 (including AC3a and AC3b) is a NEW
verification step, so each must be observed **on both sides** — green on the
finished state and red on a deliberately broken one (revert the delimiter
decisions, the B7 guard, the B2 push, and the banner wording, each
separately, and re-run). Paste both outputs. For AC3a, "red" means a
classifier missing one of the three branches, or one that lets a hyphen-run
input reach R3 — the sweep must actually catch both, or it is decorative.

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

- **A product-wide shared notion of a line** — successor
  `WP-shared-line-boundary`. `parse` splits on LF, `DAILY_LINE_BREAK`
  (`digest.js:56`) on eight separators, `extractSection` (`:327`) on LF with
  a CRLF-blind heading match, and the secret scanner has its own rules that
  span breaks. This WP makes the **leading region** agree with the renderer,
  which is what closes the classification bypass; it does **not** unify the
  field lexer, the body, `extractSection`, or the scanner. Carry these
  measurements over: all six non-LF separators yield `exclusion = null`
  today; `trim()` does not strip NEL; `DAILY_INVISIBLE` (`:75`) encodes ZWSP
  but not LS/PS (they are split on instead, per the coexistence note at
  `:69-70`).
- **Exclusion visibility beyond the daily path** — the snapshot's `skipped`
  list and the dream's enforcement report use their own reporting shapes and
  are not touched here. This WP adds the daily path's missing push and the
  banner wording that push makes inaccurate, and nothing else.
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
