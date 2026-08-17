---
id: WP-frontmatter-recognition-failopen
title: Close the frontmatter recognition fail-open by failing closed — recognition itself never widens
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0022, ADR-0004, ADR-0031]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: close the fail-open by failing closed

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog vault notes carry **provenance frontmatter**: a leading
`---`…`---` block of flat `key: value` scalars. The security-bearing field is
`derived_from_untrusted`. When a note's support came from tool results
(email bodies, fetched web pages) rather than user-authored text, the writer
sets it to `true`, and every security gate is supposed to honour that: such a
note must not be injected into a session digest, must not be copied into a
vault snapshot a routine can read, and must not clear the dream's Tier-3
floor.

ADR-0022 makes one module, `src/core/frontmatter.js`, the **single lexer**
every security-bearing note read goes through. It is deliberately not a YAML
parser: YAML's interpretation flexibility is itself the attack surface.

That lexer has a **recognition** fail-open. `parse()` requires the first line
to be byte-exactly `---` and a later line to be byte-exactly `---`. Anything
else — a BOM, a CRLF file, a leading blank/space/tab, a trailing space, a
fourth hyphen, an invisible prefix, a missing closer, a non-LF line
separator — makes an explicitly written `derived_from_untrusted: true`
invisible. Not `malformed` (which fails closed and is visible), but "no
frontmatter at all", which reads as **trusted**.

**This WP closes that by failing closed, never by widening recognition.**
The recognized form stays exactly what it is today: a byte-exact `---`
opener with a byte-exact `---` closer. What changes is that a leading region
that is a *delimiter attempt* but not that exact form becomes `malformed` —
excluded, visibly — instead of silently trusted. It also closes two
consumer-side holes that make the fix unsafe or invisible (Table B, B2 and
B7).

**Why not tolerate the artifact openers.** An earlier ruling in this
package's design review recognized a BOM opener and a CRLF file, on the
grounds that neither is author-chosen. Five review rounds showed that
widening recognition cannot be closed over: each round found a shape outside
the previous round's enumeration, and two of the widening rules introduced
new bypasses of their own — a trim-tolerant closer that could end a block
before the security field, and an invisible-prefix exception justified by a
rendering path the text never travels. **That ruling is revoked.** Failing
closed costs a Windows-written note its content, visibly; it cannot cost the
product a silent admission, because nothing new is ever admitted.

## Current state

`src/core/frontmatter.js` is 139 lines with zero dependencies. `parse()`
makes exactly two delimiter decisions, and **both stay as they are**:

```js
// :40 — the opener
if (lines[0] !== '---') return { delimited: false, malformed: false, fields: new Map(), body: text };
// :43 — the closer scan
    if (lines[i] === '---') {
```

The change is **additive**: the `delimited:false` return above gains a
fail-closed branch for delimiter attempts. Everything inside a recognized
block — the field grammar, the duplicate-key rule, the CRLF tolerance on
field lines (`:55`) and values (`:67`) — is untouched.

**The measured defect.** Every one of these carries an explicit
`derived_from_untrusted: true`, and every one is trusted today:

| Leading region | today |
|---|---|
| byte-exact `---` … `---` | recognized, flag honoured |
| BOM, CRLF, blank first line, leading space, leading tab | `exclusion = null` — trusted |
| trailing-space `---`, `----`, whitespace-only line, NBSP, interleaved BOM | `exclusion = null` — trusted |
| ZWSP `U+200B` or BRAILLE BLANK `U+2800` prefix | `exclusion = null` — trusted |
| CR-only, NEL `U+0085`, VT, FF, LS `U+2028`, PS `U+2029` separators | `exclusion = null` — trusted |
| opener with no closer | `exclusion = null` — trusted |

**Supporting measurements** (provenance: `2424372`):

- **The renderer splits on eight separators `parse` does not.**
  `DAILY_LINE_BREAK` (`digest.js:56`) treats CRLF, LF, CR, NEL, VT, FF, LS
  and PS as line breaks. `parse` splits on LF only. Measured: all six non-LF
  forms yield `exclusion = null`. **Eight, measured from the constant** — an
  earlier draft of this spec said four and would have left NEL, VT and FF
  open.
- **No single character class covers the invisible prefixes.** ZWSP is `Cf`;
  BRAILLE BLANK `U+2800` is `So` — in no whitespace, control, format,
  surrogate or default-ignorable class, and not stripped by `trim()`. A
  shape-only predicate therefore cannot close this space, which is why the
  attempt predicate below keys on hyphens and the absence of letters, not on any
  character class.
- **`DAILY_INVISIBLE` cannot rescue it.** An earlier draft justified leaving
  ZWSP trusted because `digest.js:75` encodes it visibly. Measured, that is
  wrong twice: it does not cover `U+2800`, and it only ever runs on the
  **extracted Summary** — the opener line is never in the emitted text.
- **The product corpus is clean.** 48 `.md`/`.txt` files under `templates/`,
  `skills/`, `tests/golden/`, `tests/fixtures/` — the files Wienerdog ships
  or pins. Delimiter attempts that would newly fail closed: **0**. Separately
  measured, a content-keyed rule — the shape an earlier draft used — wrongly
  excluded **four** prose forms that the final structural predicate leaves
  untouched. These counts bound the repo, not user vaults — see
  Implementation notes.

**Who inherits the defect.** `parse` has three direct `src/` consumers
(`digest.js:7`, `cli/memory.js:9`, `dream/validate.js:13`). `layout.js` and
`dream/config.js` import only `coerceScalar` and are **not** affected.

**Two consumer-side holes.** Neither is created here; both would be enlarged.

- `dream/validate.js:161-178` iterates `fm.fields` and **never reads
  `fm.malformed`**. Measured: an exact-`---` LF block with floor-passing
  values plus a junk line passes the Tier-3 floor today (row B7).
- `digest.js:748` computes `r.note && extractSection(...)` and **discards
  `r.exclusion`**, so a provenance exclusion on the daily path is silent.
  ADR-0022's Consequences state an anomalous exclusion can never be silent,
  so enlarging the malformed class without this would ship an ADR
  contradiction (row B2).

**Already on the record.** `docs/specs/done/WP-gate-vault-snapshot.md`
Residual 8 (`:430`) and its Table A Gate-2 row (`:259`) narrow the snapshot
gate to "PARSER-RECOGNIZED leading frontmatter", with *"Do not write the
wider sentence anywhere."* That Done spec is not edited.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | ONE added branch: a delimiter attempt that is not the exact form returns `malformed`. The two delimiter comparisons (`:40`, `:43`) are unchanged; the docstring's "missing open / missing close" clause (`:14-16`) gains the new class |
| modify | src/core/dream/validate.js | one guard: `parseFrontmatter` (`:161`) yields an empty record when `parse()` reports `malformed` (B7) |
| modify | src/core/digest.js | the daily path (`:745-748`) surfaces an anomalous exclusion through the banner list it already uses at `:766`; the banner wording (`:784`) becomes accurate for a heterogeneous list (B2) |
| modify | src/core/vault-snapshot.js | comment only (`:129-134`): the Gate-2 note describes what the gate now decides on |
| modify | docs/adr/0022-single-strict-frontmatter-parser.md | amendment: the delimiter-attempt class. **The §1 uniqueness sentinel is NOT touched** — recognition is unchanged, so `lines[0] !== '---'` still reads literally |
| modify | tests/unit/frontmatter.test.js | the case corpus and the sweep; **two** existing tests assert the old contract and flip — see Exact contracts |
| modify | tests/unit/digest.test.js | both digest paths, incl. the daily banner and its wording |
| modify | tests/unit/vault-snapshot.test.js | the notes-slice gate under the new class |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor and the B7 guard |

**Nine deliverables — one over `docs/specs/README.md`'s "≤ 8 files touched"
heuristic, deliberately.** It is one of three heuristics; the primary one
(≤ ~400 lines of new non-test content) is nowhere near — the new non-test
content is one branch plus two small guards. The ninth file is `digest.js`,
and it is here because ADR-0022 makes exclusion visibility binding.

**Consumer edits: two, both named.** Every consumer reaches `parse` through
`parseNoteResult`, `parseFrontmatter` or `skillBody` and inherits the new
class without an edit — across all six validator call sites
(`validate.js:195, 317, 325, 343, 500, 1170`). The exceptions are the B7
guard and the B2 push, each closing a defect in a consumer's own handling of
the parse result.

### Exact contracts

**Recognition does not change.** `parse` recognizes a block when line 0 is
byte-exactly `---` and a later line is byte-exactly `---`. No BOM tolerance,
no CRLF tolerance, no whitespace tolerance, on either delimiter. A block that
is recognized behaves exactly as today, including its `malformed` rules and
its `body`.

**The added class: a delimiter attempt fails closed.** When the input is not
recognized, it is a **delimiter attempt**, and a delimiter attempt must
produce a result every security consumer treats as excluded — concretely
`malformed` is true, so `ok-to-trust` (`delimited && !malformed`) is false
and `parseNoteResult` returns the existing `'malformed'` exclusion. Whether
`delimited` is true or false, and how `fields`/`body` are populated, is the
implementer's choice within that property, with one obligation: `skillBody`
(`validate.js:343`) reads `body` without consulting `malformed`, so confirm
no user-observable difference on that path, and report it if there is one.

**The delimiter-attempt predicate — one rule, purely structural.** Split the
leading region on exactly the renderer's `DAILY_LINE_BREAK` set
(`digest.js:56`; eight separators). Take the first line that is non-empty
after removing
`[\p{White_Space}\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]`. That
line is a delimiter attempt when it **contains a run of three or more
hyphens and contains no letter and no digit** (`\p{L}`, `\p{N}`).

Three things follow, and each was measured rather than reasoned:

- **Invisibles cannot evade it.** A prefix is irrelevant unless it is a
  letter or a digit, so `U+200B` (`Cf`) and `U+2800` (`So`, in no invisible
  class at all) are both caught by the same clause. An earlier draft needed
  a second, content-keyed trigger for exactly this and still missed a case;
  this predicate needs none.
- **Prose cannot trip it.** A line carrying any letter is not a candidate,
  so `> derived_from_untrusted: means the trust marker.`,
  `` `derived_from_untrusted`: … ``, `- derived_from_untrusted: false is
  required.` and `---title` all stay in the unchanged class. The earlier
  content-keyed trigger failed all four.
- **There is no window.** The predicate reads one line — the first non-empty
  one — so there is no bounded region for a flag to hide behind. An earlier
  reference implementation silently used a twelve-line window, and a note
  with `U+2800 + ---` on line 1 and the flag on line 13 slipped through it.

The predicate never widens recognition; it only ever moves an input from
trusted toward excluded.

**The B7 guard.** `parseFrontmatter` (`validate.js:161`) yields an empty
record when `parse()` reports `malformed`, so a malformed block cannot
present fields to the Tier-3 floor, the preservation checks, or the
raise-only guard. It keeps the existing `'Tier-3 path missing provenance
frontmatter (…)'` reason — no new reason string.

**The B2 banner and its wording.** The daily path pushes onto the same
`identityExclusions` list it already uses at `digest.js:766`, with the
**code-owned** label `'daily-summary'` and the identity path's existing
reason strings from `:691-692`. `untrusted-exact` and an absent flag stay
silent — normal policy, not anomalies (ADR-0022 §4). The banner's wording
must also become accurate: `:784` says "some identity notes were left out"
and directs the user to `wienerdog memory approve <note>`, which accepts only
the four fixed identity notes (`memory.js` `KNOWN`, measured). A noun
covering both kinds, and the approval sentence only when an identity entry is
present. All wording stays fixed-template and code-owned, so the
golden-frozen property at `:786-790` holds when the list is empty.

**Two existing tests assert the old contract and flip.** Neither is deleted.

- `tests/unit/frontmatter.test.js:21-27` — an unclosed block currently
  asserts `delimited === false`, `fields.size === 0`, `body === text`. It is
  a delimiter attempt.
- `tests/unit/frontmatter.test.js:29-34` — a blank first line before `---`
  asserts `delimited === false`, `body === text`. It is a delimiter attempt.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iii)** structured input parsing changes;
**(iv)** reason-code behavior changes at three gates; **(vi)** multiple
downstream consumers inherit the contract.

### Table A — the three classes

| Class | Predicate | Result |
|---|---|---|
| **RECOGNIZED** | line 0 byte-exactly `---`, and a later line byte-exactly `---` | unchanged from today, in every respect |
| **FAIL-CLOSED** | not recognized, and the delimiter-attempt predicate fires (Exact contracts) | `malformed` — excluded, visibly, at every gate in Table B |
| **no frontmatter** | everything else, including an empty and an all-blank file | unchanged from today |

**The direction property is the contract.** No input moves from a gated
outcome toward a trusted one. Nineteen of the accumulated cases move from
trusted to gated; **zero** move the other way. This is the property the
sweep asserts, and it is the one an earlier draft of this spec violated: a
trim-tolerant closer could end a block before the security field, leaving
the flag in trusted body text.

**Cost.** A note that is a delimiter attempt loses its content, visibly, on
every gate in Table B. On the product corpus that is 0 files. A user's
Windows-written note is excluded rather than read — the stated price of this
ruling.

#### Table A — case corpus and enforcing sweep

Two blocks, both required. Control characters are **escapes, never
literals**: a literal does not survive a copy/paste round trip and a probe
that loses its characters reports a healthy-looking wrong answer — observed
while writing this spec.

The **case corpus** carries every input the five design-review rounds
produced, each with its expected class, plus the direction check against the
live parser. The **sweep** is the part an enumeration cannot give: it
asserts four properties over generated inputs and **exits non-zero** when any
is violated. An earlier draft's sweep only printed its counters, so mutants
producing 39,619 unclassified inputs still exited 0.

The four asserted properties, and the mutant each one catches:

| Property | Catches |
|---|---|
| P1 totality — every input gets exactly one of the three classes | a classifier missing a branch |
| P2 direction — nothing gated by today's `parse` becomes trusted | a tolerance that admits a currently excluded note |
| P3 no attempt reaches "no frontmatter" | a leak of a delimiter attempt to the trusted class |
| P4 conservation — a non-attempt, non-recognized input classifies exactly as today | an over-broad classifier that fails closed on ordinary prose |
| **P5 recognition is frozen** — `class === RECOGNIZED` **if and only if** today's byte-exact predicate holds, computed independently | a classifier that widens recognition, or that drops a currently recognized input into another class |
| **P6 an attempt is exactly FAIL-CLOSED**, not merely "not trusted" | a classifier that promotes an attempt to RECOGNIZED |

**P5 and P6 exist because P1–P4 did not express this ruling's central
claim.** Measured: a mutant mapping every attempt to RECOGNIZED, and one
mapping every recognized input to FAIL-CLOSED, both passed P1–P4 with every
counter at zero. P5 is the biconditional that closes it; it must be computed
from an independent implementation of today's predicate, not from the
classifier under test.

**The generator must actually produce recognized inputs, and this must be
asserted.** Measured: a flat token generator produced **0** recognized inputs
in 50,000, which would make P5 and P6 vacuous while showing green. Report the
count of recognized inputs the sweep saw, and fail if it is zero. A balanced
generator — roughly half structured blocks built from an opener, fields, a
closer and a separator, half free-form noise including prose that quotes the
field name — produced 387 in 50,000, enough for P5 to catch both recognition
mutants.

The implementer builds both from the contract above; the reference form used
to measure this spec's own claims is committed alongside the round-5 record
in `docs/specs/logbook/`. **Run each with a deliberately broken classifier
and paste the red output** — P4 in particular is the one that an earlier
design could not express.

### Table B — measured per-path exposure, and what changes

Every "today" cell carries its reproduction command below the table.

| # | Path | Today | After |
|---|---|---|---|
| B1 | Digest **identity injection** (`digest.js:689` → `parseNoteResult` `:190`) | every attempt: `exclusion` is `null` → the body is injected **including its frontmatter text** | FAIL-CLOSED → `malformed`, omitted **with the existing banner** (`:784`). RECOGNIZED unchanged |
| B2 | Digest **daily summary** (`digest.js:747` → `readNoteBounded` `:265`) | flag invisible → the `## Summary` section is extracted and framed. Any exclusion here is **silent**: `:748` discards `r.exclusion` | excluded at the gate, and the anomaly reaches the banner via the list this path already uses at `:766` |
| B3 | Snapshot **notes slice** (`vault-snapshot.js:151`) | every attempt: `exclusion === null` → the file's **raw bytes are copied** into the snapshot a routine reads | skip, reason `provenance gate: malformed`. Existing vocabulary verbatim; visible in the `skipped` list |
| B4 | Dream **Tier-3 floor** (`validate.js:195`) | every attempt: `parseFrontmatter` → `{}` → `'Tier-3 path missing provenance frontmatter (…)'` → reverted | **unchanged in outcome** — still rejected, now because the block is malformed rather than because it was invisible. No recovered-intent claim: this ruling does not recognize artifact openers |
| B5 | Dream **raise-only + preservation guards** (`validate.js:317/325/332`) | HEAD parses as `{}`, so the guard cannot fire and a revision may lower the flag undetected | the file is rejected upstream as malformed rather than silently accepted. The guard itself still cannot fire on an unrecognized HEAD — stated, not claimed fixed |
| B6 | `wienerdog memory approve` **evidence display** (`memory.js:134`) | no provenance lines printed for an attempt | unchanged — this WP recognizes nothing new, so nothing new is displayable. Evidence only, never authorization |
| B7 | Dream **malformed-block handling** (`validate.js:161`) | `parseFrontmatter` never reads `fm.malformed`. Measured: an **exact-`---` LF** block with floor-passing values plus a junk line passes the floor today | the record is empty on `malformed`. **Observable for today's users on exact-`---` notes**, not only on attempts |

#### Table B — per-row reproduction

Run from the repo root. `gateReason` is not exported, so B3 reproduces the
gate's decision **input** and cites `vault-snapshot.js:151-153` for the
mapping.

```bash
# B1 — identity injection: exclusion class, and whether the body is injected
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nbody\n";for(const[k,v]of Object.entries({exact:n(""),BOM:n("﻿"),blank:n("\n")})){const r=p(v);console.log(k,"exclusion="+r.exclusion,"bodyInjected="+!!r.note)}'

# B2 — daily summary: exclusion class, and whether extractSection finds the heading (digest.js:327)
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const H=/^##\s+(.*)$/;const n=s=>s+"---\nderived_from_untrusted: true\n---\n## Summary\nx\n";for(const[k,v]of Object.entries({BOM:n("﻿"),CRLF:n("").replace(/\n/g,"\r\n")})){const r=p(v);let f=false;if(r.note)for(const l of r.note.body.split("\n")){const m=l.match(H);if(m&&m[1].trim()==="Summary"){f=true;break}}console.log(k,"exclusion="+r.exclusion,"summaryFound="+f)}'

# B3 — snapshot gate INPUT; the exclusion→reason mapping is vault-snapshot.js:151-153
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({BOM:n("﻿"),blank:n("\n")})){const e=p(v).exclusion;console.log(k,"exclusion="+e,"=> reason="+(e===null?"(copied)":"provenance gate: "+e))}'

# B4 — Tier-3 floor; the predicate is validate.js:195-206
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=s=>s+"---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\n---\nb\n";for(const[k,v]of Object.entries({exact:n(""),CRLF:n("").replace(/\n/g,"\r\n")})){const f=P(v);const has="confidence"in f&&"recurrence"in f&&"derived_from_untrusted"in f;console.log(k,"hasAll="+has)}'

# B5 — raise-only guard; the predicate is validate.js:332
node -e 'const{parseFrontmatter:P}=require("./src/core/dream/validate");const n=(s,v)=>s+"---\nderived_from_untrusted: "+v+"\n---\nb\n";const cur=P(n("","false"));for(const[k,h]of Object.entries({exact:P(n("","true")),CRLF:P(n("","true").replace(/\n/g,"\r\n"))})){console.log(k,"guardFires="+(h.derived_from_untrusted===true&&cur.derived_from_untrusted!==true))}'

# B6 — memory approve evidence lines; the display loop is memory.js:134-140
node -e 'const{parse}=require("./src/core/frontmatter");const E=["derived_from_untrusted","source_sessions","confidence","recurrence"];const n=s=>s+"---\nderived_from_untrusted: true\n---\nb\n";for(const[k,v]of Object.entries({exact:n(""),BOM:n("﻿")})){const f=parse(v).fields;console.log(k,"evidenceLinesShown="+E.filter(x=>f.has(x)).length)}'

# B7 — the malformed field leak this WP closes; the view is validate.js:161
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length)'
```

**B7 costs today's users something.** A Tier-3 write with a malformed block
that currently slips through on its recognized fields starts being rejected —
fail-closed, matching ADR-0022 §4, on notes unrelated to the attempts.

**Reason-string vocabularies are preserved.** No row introduces a new reason
string, banner or label. Every row changes which existing string fires.

### Mirrored Surface Checklist

Table A's mirrors:

- [ ] `src/core/frontmatter.js` docstring `:14-16` (the "missing open / missing close" clause gains the new class)
- [ ] `src/core/vault-snapshot.js:129-134` (the Gate-2 comment)
- [ ] ADR-0022's amendment — **and the §1 sentinel, which must remain untouched**
- [ ] The **two** re-aimed tests in `tests/unit/frontmatter.test.js`
- [ ] `DAILY_LINE_BREAK` (`digest.js:56`) — the predicate's split set must equal it, asserted by a test
- [ ] Acceptance criteria AC1–AC4

Table B's mirrors:

- [ ] The Deliverables rows for `validate.js`, `digest.js` and the four test files
- [ ] The "Consumer edits: two" paragraph
- [ ] The per-row reproduction block
- [ ] Acceptance criteria AC5–AC9 (B6 has no criterion — it is a display consumer and unchanged here)
- [ ] Verification steps V1–V2

## Implementation notes & constraints

- **Recognition is frozen.** Do not make either delimiter comparison
  tolerant. Every tolerance this package tried was defeated; the ruling is
  that nothing new is recognized.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc only; no build step.
  Nothing starts a process (ADR-0004).
- **The separator constant cannot be imported.** `digest.js` requires
  `frontmatter.js`, so the reverse would be circular. Where the shared
  constant lives is your call within the listed files; the test asserting the
  two sets are identical is not optional.
- **The sweep's generator is your call, and belongs in "Decisions made".** A
  property-based library would be a devDependency (permitted — CLAUDE.md
  bars *runtime* deps); a seeded PRNG in the test file avoids the question.
  What the spec fixes is the four properties, not the machinery.
- **Write control characters as escapes, never literals**, in tests and in
  anything pasted into the PR.
- **Trap — `skillBody` ignores `malformed`.** See Exact contracts.
- **Trap — the migration moment.** The corpus counts bound files **the repo
  ships**; they say nothing about a user's existing vault, where any
  delimiter attempt changes classification on the next read. Every changed
  outcome is an exclusion, and every exclusion is visible on every path in
  Table B.
- **`tests/scenarios/run-scenarios.js:68,111` holds a private clone of the
  pre-fix lexer.** Accepted residual: a scenario harness, not a security
  gate, outside ADR-0022's `src/core/` scope, not run by `npm test`.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is one classification branch, one
      validator guard, and one push of a code-owned label onto an existing
      banner list. No path, filename or command is constructed. The
      anchored-pattern rule has no subject here — stated rather than deleted
      so the absence is checkable.
- [ ] The B2 banner carries no note content: a fixed label and two fixed
      reason strings, the same code-owned rule as `:784`.
- [ ] **Every classification this WP changes moves toward gating. There is no
      exception** — asserted by sweep property P2, not merely claimed.

## Acceptance criteria

- [ ] **AC1** — A byte-exact `---` opener with a byte-exact `---` closer
      behaves exactly as today, including `fields`, `malformed` and `body`.
      No delimiter tolerance is introduced. (Table A)
- [ ] **AC2** — Every delimiter attempt reports `malformed`, so
      `parseNoteResult` returns `'malformed'`. Coverage includes each family
      the design review produced: BOM; CRLF; leading blank/space/tab;
      whitespace-only line; NBSP; interleaved BOM; trailing-space `---`;
      `----`; ZWSP; `U+2800`; each of the six non-LF separators; and an
      opener with no closer; and the case where an invisible prefix sits on the
      opener while the flag sits many lines below it, which an earlier windowed
      rule let through. (Table A, the delimiter-attempt predicate)
- [ ] **AC3** — Inputs in the "no frontmatter" class, including an empty
      file, an all-blank file, and prose containing a `---` thematic break
      that is not a leading delimiter attempt, classify exactly as today.
- [ ] **AC4** — The sweep asserts P1–P6 and **exits non-zero** when any is
      violated, demonstrated against SIX deliberately broken classifiers: a
      missing branch, a leak to "no frontmatter", an over-broad fail-closed
      classifier, one returning a non-class, one promoting every attempt to
      RECOGNIZED, and one demoting every recognized input to FAIL-CLOSED.
      Paste all six red runs. The sweep also reports how many RECOGNIZED
      inputs it generated and fails if that count is zero — otherwise P5 and
      P6 are vacuous while showing green.
- [ ] **AC5** — The predicate's split set is **identical** to
      `DAILY_LINE_BREAK` (`digest.js:56`), asserted by a test comparing the
      two rather than restating either.
- [ ] **AC6** — A note carrying `derived_from_untrusted: true` in a
      delimiter attempt is excluded by the digest at **both** its paths, and
      both emit the banner — the daily one via the code-owned
      `'daily-summary'` label. The banner's text is accurate for a list
      containing a daily entry: no identity-only noun, and no approval
      instruction unless an identity entry is present. (B1, B2)
- [ ] **AC7** — The snapshot notes-slice gate skips such a file with reason
      `provenance gate: malformed`; the vocabulary gains no new member. (B3)
- [ ] **AC8** — A block reported `malformed` presents **no** fields to the
      validator, so a Tier-3 write with a malformed block and otherwise
      floor-passing values is rejected — including on an exact-`---` LF note,
      the pre-existing case. (B7)
- [ ] **AC9** — The full suite and lint are green, and the golden fixtures
      are byte-unchanged (the corpus counts predict zero diff).

## Verification steps (run these; paste output in the PR)

Every new assertion is a NEW verification step, so each must be observed on
both sides — green on the finished state and red on a deliberately broken
one (revert the classification branch, the B7 guard, the B2 push, and the
banner wording, each separately). Paste both outputs. For AC4 the red runs
are the six mutants, and their non-zero exit codes are the evidence.

```bash
# V1 — the parser and the four protected paths.
node --test tests/unit/frontmatter.test.js tests/unit/frontmatter-unify.test.js \
  tests/unit/frontmatter-digest-differential.test.js tests/unit/digest.test.js \
  tests/unit/vault-snapshot.test.js tests/unit/dream-validate.test.js

# V2 — full suite (golden fixtures must be byte-unchanged) and lint.
npm test
npm run lint
git diff --stat -- tests/golden/
```

## Out of scope (do NOT do these)

- **Recognizing anything new.** No BOM, CRLF, whitespace or near-closer
  tolerance. This is the ruling, not a deferral.
- **A product-wide shared notion of a line** — successor
  `WP-shared-line-boundary`. `parse` splits on LF, `DAILY_LINE_BREAK` on
  eight separators, `extractSection` (`:327`) on LF with a CRLF-blind
  heading match, and the secret scanner has its own rules spanning breaks.
  The predicate makes the ATTEMPT TEST agree with the renderer; it does
  not unify the field lexer, the body, `extractSection`, or the scanner.
- **Exclusion visibility beyond the daily path** — the snapshot's `skipped`
  list and the dream's enforcement report use their own reporting shapes.
- **Any validator change beyond the B7 guard**, and any digest change beyond
  the B2 push and its banner wording.
- The scan-limit guard and `WP-alert-producer-freeform-residual` — queued
  behind this package.
- The snapshot's reports-slice exemption and the 2026-08-14 no-stamp ruling.
- Editing `docs/specs/done/WP-gate-vault-snapshot.md`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs and AC4's six mutant runs.
2. Conventional commits; PR titled
   `fix(frontmatter): close the recognition fail-open by failing closed (WP-frontmatter-recognition-failopen)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`. `In-Review`
   marks the START of review: this list is complete only when review is.
