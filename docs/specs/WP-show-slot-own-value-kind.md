---
id: WP-show-slot-own-value-kind
title: Close the show option-position slot and re-sync the guard's drifted mirrors
status: Ready
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0031]
epic: dream-promotion
---

# WP-show-slot-own-value-kind: Close the show option-position slot and re-sync the guard's drifted mirrors

## Dispatch precondition

**ONE OWNER RULING, and it blocks dispatch.** The pinned call set is DECIDED in
row W1(c) of `docs/specs/done/WP-dream-promote-in-workspace.md` (Done). Its
**Mirrored Surface Checklist** (`:648-690` of that spec — a different section
from the row, and the home of every registration quoted in this spec) registers
the row and `KNOWN_CALLS` as a pair, and states that *"a shape added to the code
copy without the row is exactly the silent widening default-deny exists to
prevent"* (`:676-677`). It also registers, in as many words, that **the slot
kinds are part of the set and move with it** — *"the form the pair actually
drifted in"* — and that **no grep reaches a slot-kind drift** (`:678-690`). This
WP is exactly that drift form, and it closes it by amending a table that lives
in `done/`. The owner rules two things together:

1. **The slot-kind change** — shape (4)'s argument moves from FREE to a
   LITERAL (Change table, row C1; rationale and rejected alternatives below).
2. **The home of the amendment** — W1(c) inside the Done spec is amended in
   place, rather than Table W being re-extracted into a live spec. Precedent
   for amending a `done/` spec to keep a registered pair in sync:
   `d5f31149` (*"docs(specs): register the warningsPointerStatus JSDoc as a
   mirror"*).

3. **The durable source-form check — permanent machinery, so the ratification
   is the owner's.** C1's whole value is a tripwire that fires on a FUTURE
   edit: the guard must red if anyone rewrites the pinned slot to interpolate
   `WARNINGS_REL`, because the two are identical at run time and every other
   check goes green. Four review rounds established that a proof living only in
   this spec's verification steps cannot do that — a later WP reads its own
   spec, so it would never meet the rule. **The spec therefore embodies the
   enforced design** (Exact contracts, "The durable source-form check"): a
   committed test beside `KNOWN_CALLS`, a digest constant next to it, and the
   re-pin rule written into W1(c). This follows the house doctrine that
   `WP-157`'s app-tree digest already sets — mechanical, not procedural.
   **What the owner ratifies is the permanent surface**: ~55 lines of checker
   in the guard file, one pinned constant, and a standing obligation on every
   future `KNOWN_CALLS` edit.
   **If the owner rules the other way — one-time evidence, no durable
   machinery — the strip-down is cheap and is pre-written here so the ruling
   needs no second pass:** delete "The durable source-form check" and its two
   code blocks, drop the checker and digest rows from Deliverables (the test
   file returns to four sites), delete acceptance criteria 11 and 12, remove
   the digest and re-pin entries from the Mirrored Surface Checklist and from
   the W1(c) instruction, and **narrow the claim in the same pass** — C1's
   "spelled literally" rationale then reads *"proved for this implementation
   only; the tripwire is not enforced against future edits"*, and the
   Implementation note's same-commit re-pin rule is deleted rather than left
   standing as a rule nothing carries. **A claim of future enforcement with no
   mechanism is the one outcome not available.**

Until all three are ruled, this spec stays undispatched. Nothing else here is
open.

## Context (read this, nothing else)

Wienerdog's nightly **dream** run reads session transcripts, has a model write
notes into a private **workspace**, promotes the admissible ones, and publishes
them as ONE commit in the user's vault git repository. **IRON RULE (ADR-0004):
Wienerdog is just files** — nothing this WP touches may start a process that
outlives its job. This WP starts nothing: it changes one test file and two
documentation surfaces, and no `src/` file at all.

**The contract this WP serves.** A dream run must never write the user's git
index. The run therefore builds its commit in a PRIVATE index
(`GIT_INDEX_FILE`, `src/cli/dream.js:230`) and publishes with `commit-tree` +
`update-ref`, never touching the user's own staging area. That claim is
enforced by **default-deny shape pinning**: a test substitutes the run's single
git seam and checks every invocation against `KNOWN_CALLS`, the run's own nine
pinned shapes. **An unknown shape is a violation.** The direction is
deliberate and was ruled by the owner on 2026-08-31: *enumerating the BAD is
unclosable because git's grammar is not ours; enumerating our OWN GOOD is
closable because the run's call set is ours.* Two measured refutations retired
the other direction (a verb allowlist that `git --attr-source log update-index
--chmod=+x f` walked straight through, and a configuration-derived target probe
that `read-tree --index-output=<user index>` walked straight through).

**Matching is strict shape-equality and nothing else**: same argument count,
every literal equal in position, and a placeholder admits one token. There are
two placeholder kinds today — a **FREE** slot (`ANY` in code) admitting one
token *without inspecting it*, and an **OWN-VALUE** slot (`RUN_VALUE` in code)
admitting one token only if it is a string this run was observed to produce.
Neither inspects the token. **Token classification is the retired direction and
may not return under a new name.**

**The three defects this WP closes.** All three are drift between what the
guard's canonical row decides and what the tree does, and each was found by a
review gate at the close of `WP-dream-promote-in-workspace`:

1. **The `show` slot is FREE in an OPTION POSITION.** `['show', ANY]` accepts
   any single token, and `git show --output=<user index path>` is a single
   token that corrupts the user's index. Not producible today — the run's only
   `show` carries a hardwired constant — but the guard exists to catch the edit
   that would make it producible.
2. **The own-value set's stated invariant is falsified by one of its own
   members.** The code says the set holds what the run *MINTED, never what it
   READ BACK from the user* — and `rev-parse HEAD` reads back the user's ref.
3. **A registered mirror pair drifted on the day it was registered.** Two prose
   surfaces still say the guard admits **six** own-value sources; the code
   admits **four**. The code fix landed first and the prose that describes it
   landed after, recording the pre-fix state.

## Current state

**Everything below was re-measured on `5d31a7dc` (main, 2026-09-01) with git
2.39.5 (Apple Git-154) and Node v25.9.0. Every stub figure was checked; where
the stub was incomplete it is corrected here.**

**The guard.** `watchIndexWrites(vault)` in
`tests/unit/dream-pipeline.test.js:230-292` returns
`{ spawnGit, violations, seen, classify }`. `classify(args, env)` returns
`null` for an admitted call and a reason string otherwise; the unknown-shape
reason is the literal `UNKNOWN SHAPE — not one of the run's pinned calls`
(`:258`). The matcher is `shapeMatches` (`:208-213`): length equality, then
per-position `ANY ? true : RUN_VALUE ? computed.has(token) : literal ===`.
`ANY` is defined at `:167`, `RUN_VALUE` at `:187`, `KNOWN_CALLS` at
`:190-201`. The guard runs inside one test, parameterized over three vault
layouts: `dream-pipeline: the run does not touch the user's git index — at
all, <plain|separate-git-dir|linked-worktree> vault (row G8)` (`:1551`).

**Defect 1 — the `show` slot.** `tests/unit/dream-pipeline.test.js:194` reads
exactly:

```js
  { env: 'unset',   args: ['show', ANY] },
```

The run's only `show` is `src/cli/dream.js:1004`:

```js
const headWarnings = gitIn(spawnGit, vaultDir, ['show', `HEAD:${WARNINGS_REL}`], { allowFail: true });
```

`WARNINGS_REL` is the module constant `'reports/warnings.md'`
(`src/core/dream/warnings.js:72`); `src/cli/dream.js:1032` calls the file
*"code-owned, layout-independent"*. So **the run's `show` argument is the fixed
string `HEAD:reports/warnings.md` on every layout and every run**, and the FREE
slot admits an infinity of tokens to pin one constant. The test already imports
`WARNINGS_REL` (`tests/unit/dream-pipeline.test.js:30`) — for its content
assertions, **not for the pin**, and the pin must not start using it (Change
table row C1, and the rejected option that names it).

**The exploit, re-measured today rather than inherited.** In a scratch repo:
`git show --output=<repo>/.git/index` exits **0** and overwrites the index with
the commit text. `git status` then fails with
`error: bad signature 0x6d6d6f63` / `fatal: index file corrupt` — the repository
is unusable to every index-reading command. The only recovery,
`rm .git/index && git reset`, restores usability and **destroys the user's
staged content**: measured, a path staged as `v2-staged` with `v3-worktree` in
the working tree came back staged as HEAD's `v1`. This is the same data-loss
class as the retired `read-tree --index-output` gap **plus** an unusable
repository until the user finds the manual recovery. It is **two tokens**, so
it matches `['show', ANY]` on arity, and it needs no `GIT_INDEX_FILE`, so it
satisfies the `env: 'unset'` disposition. `classify(['show', '--output=…'], {})`
returns `null` today.

**Not producible today (RIDES).** No `src/` file can emit that call: the only
`show` is `:1004` with its hardwired constant (`grep -rn "'show'" src/` finds
`src/gws/calendar.js:161`, an unrelated CLI subcommand name, and `:1004`).
The gap is a **pin** gap, not a live exploit: it is exactly the class the guard
was built to catch on a *future* edit.

**Defect 1's canonical prose — TWO sentences, and the RULE is the one that
matters.** W1(c)'s *"WHICH SLOTS TAKE THE PIN"* clause
(`docs/specs/done/WP-dream-promote-in-workspace.md:541`) states a **binary
rule** and then applies it to this slot by name:

> **WHICH SLOTS TAKE THE PIN — stated as the RULE and applied to every slot the
> rule reaches, not only to the one that was exploited.** A slot holding a value
> the run COMPUTED is `own`; a slot holding data the run merely carries — a
> mode, a path, a message — is FREE, because there is no observed value to
> compare it against. **`show «HEAD:path»` stays free although it reads like an
> object name:** that token is a string this run BUILDS out of a path, never a
> value it read back out of git, so no observation pins it. **The five shapes
> the rule reaches are (1), (3), (6), (8) and (9)**, and their `own` slots are
> marked above.

Both sentences are **correct about the OWN-VALUE rule and wrong as a
conclusion**. The own-value rule genuinely does not reach this slot — there is
no observed value to compare against — but "therefore FREE" does not follow: a
token the run BUILDS from a constant is pinnable as a LITERAL, the set's third
and oldest token kind. **The RULE sentence is the load-bearing one and C1
amends it**, because its partition is exhaustive over two kinds ("COMPUTED →
`own`; merely carried — a mode, a path, a message — → FREE") and shape (4)'s
token is a carried PATH, which the partition sends to FREE. C1 replaces it with
three clauses that partition every slot once — an own-value-set member (C2's
predicate) is `own`; of the rest, a token in a position git parses for options
must be a fixed literal; every other remaining slot stays FREE (Change table row
C1, which adjudicates all nine shapes' slots). **Nothing but the RULE sentence
and the "stays free" sentence changes:** the "five shapes the rule reaches"
sentence stays TRUE, since the own-value rule still reaches exactly those five.
The same row separately enumerates shape (4) as
`` **(4)** `unset` — `show «HEAD:path»` (`:1004`) `` with no `«own …»` marker.

**Defect 2 — the falsified invariant.** `tests/unit/dream-pipeline.test.js:179-181`
(the `RUN_VALUE` JSDoc) classes `head` among the run's products:

> It compares the token to values THIS RUN PRODUCED and the watcher watched it
> produce — the head from `rev-parse HEAD`, blobs from `hash-object`, the tree
> from `write-tree`, the commit from `commit-tree`.

and `:282-283` states the exclusion rule:

> The set must hold values the run MINTED, never values it READ BACK from the
> user.

`rev-parse HEAD` (`src/cli/dream.js:221`) reads back the user's ref, so **the
MINTED sentence is falsified by the first member the PRODUCED sentence lists.**
Harmless today (a 40-hex object id cannot be an option), but a stated invariant
that one of its own members violates cannot be used to decide the next slot.
**The drift is narrower than the stub's wording suggests, and this matters for
the sweep:** three surfaces say *PRODUCED* (`tests/unit/dream-pipeline.test.js:179`,
`docs/specs/done/WP-dream-promote-in-workspace.md:541`,
`docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:356-366`)
and exactly one says *MINTED* (`tests/unit/dream-pipeline.test.js:282-283`). It
is the MINTED sentence that is false; the PRODUCED sentences are merely too
loose to decide anything.

**Defect 3 — the six-vs-four drift. The stub says "a registered mirror"; there
are TWO, and both are stale.**

- `docs/specs/done/WP-dream-promote-in-workspace.md:541` (W1(c)'s residual
  clause): *"the shipped set is WIDER than the four sources the ruling names …
  The seam admits the single-line output of ANY pinned call it observed
  succeed … a row that says four sources while the code admits six would put
  this table back in the state it was extracted to end. **The remedy has a
  shape** — admit to the own-value set only the output of the shapes whose
  output IS an object name the run computed, which is (2), (5), (7) and (8) and
  excludes (1) and (4) — **and it is a change to the executable copy, so it is
  the owner's to schedule and not this recording pass's to make.**"*
- `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:409-426`
  (the `#### One residual, stated rather than closed` heading and its paragraph),
  the same claim: *"a row claiming four sources while the code admits six is the
  exact drift Table W was extracted to end."* The heading's tense changes with
  the paragraph under C3.

**The code already shipped the remedy those clauses defer.**
`tests/unit/dream-pipeline.test.js:284` learns only from shapes carrying
`produces: true` — `hash-object` (`:192`), `rev-parse HEAD` (`:195`),
`write-tree` (`:197`), `commit-tree` (`:198-199`): **four**, and exactly the
`(2), (5), (7), (8)` the row names as the remedy. Provenance, measured:
`b19121bb` (*"test(dream): the own-value set holds what the run MINTED, never
what it read back"*) is an **ancestor** of `53b1519b` (*"docs(specs): record the
own-value slot…"*), which wrote both stale prose surfaces. So the stub's
diagnosis — *a docs commit landed after the fix it describes and recorded the
pre-fix state* — is confirmed, for two mirrors rather than one.

**Two things measured while writing this spec, both with a named consumer here.**

- **`show` is the only FREE slot the set places in an option position** — the
  claim that scopes this WP to one shape. Measured against the
  `--index-output=`/`--output=` vector, per slot:
  - shape (1)'s FREE slot sits after `--`, so git reads it as a pathspec;
  - shape (3)'s two FREE slots behave **differently, and the difference is
    stated because the first measurement of it over-claimed**: the `«mode»`
    slot REJECTS an option string
    (`fatal: git update-index: --cacheinfo cannot add …`, exit 128, no index
    written), while the `«path»` slot **ACCEPTS one** —
    `update-index --add --cacheinfo 100644 <blob> --index-output=/tmp/x` exits
    **0** and stores `--index-output=/tmp/x` as a literal FILENAME in the index,
    writing no file at that path. *(An option string containing a `.git`
    segment is rejected as `error: Invalid path`, which is what made the first
    measurement read as a rejection: the vector aimed at `<repo>/.git/index`
    and died on the `.git` component, not on the option.)* **Neither slot
    redirects the index**, and shape (3) is `env: 'private'`, so the write it
    does make lands in the run's private index;
  - shapes (8) and (9) place their FREE slot as `-m`'s value, which git
    consumes verbatim (measured: `commit-tree … -m "--output=<index>"` exits 0
    and writes no index).

  **This is a measurement over enumerated vectors and not a proof over git's
  grammar** — the same epistemic W1(c) already states about the `read-tree`
  singularity. What decides is the RULE in Change table row C1, not the vector
  list; the corrected shape (3) evidence changes the reasoning, not the
  conclusion.
- **`--test-name-pattern` does not filter this suite.** Measured:
  `npm test -- tests/unit/dream-pipeline.test.js --test-name-pattern "zzz-nothing-matches-zzz"`
  reports `tests 43 / pass 43 / skipped 0` in 15s — the same as the unfiltered
  run. A green from that flag says nothing about which test ran, so it may not
  be used as a verification step here (see Verification steps).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/dream-pipeline.test.js | Change table rows C1 and C2, the arity-matched canary, and the durable source-form check. **SIX sites and no others:** `KNOWN_CALLS` shape (4) (`:194`); the `RUN_VALUE` JSDoc (`:168-186`); the `produces` comment (`:277-283`); the non-vacuity canary block inside the index test (`:1632-1658`); **NEW — the `KNOWN_CALLS_SOURCE_DIGEST` constant declared beside `KNOWN_CALLS`; NEW — the source-form test**, both spelled in Exact contracts. **The two new sites must sit OUTSIDE the `[ … ]` of the initializer** — the pinned digest hashes that span and nothing else, so a constant or comment placed before or after it leaves the digest valid (measured, both orders). **C3 needs NO code change** — the code already admits four; its `:277` sentence is only re-read whole after the C2 rewrite. **No other shape, slot kind, literal or disposition changes** — `shapeMatches` (`:208-213`) and the nine-shape count stand |
| modify | docs/specs/done/WP-dream-promote-in-workspace.md | **Row W1(c) ONLY** (all of Table W is on `:541`). The clauses that move are the ones the Mirrored Surface Checklist marks as moving under C1 and C3 — the FREE-slot RULE sentence, the "stays free" ruling, the pinned-set enumeration of shape (4), and the residual clause, which becomes a CLOSURE record naming `b19121bb`. **The checklist owns that list; this cell does not restate it as a count** (a number beside a list is what C3 retires). The C2 entry on this file is a registered NON-move. **No other row, no other table, no frontmatter, no status field** |
| modify | docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md | **THREE edits, all listed in the Mirrored Surface Checklist and nothing else in the file.** (a) the *"Applied to every slot the rule reaches"* passage (`:368-372`, C1): SHA-scoped past tense with the slot-kind spelling dropped, so its own deference sentence becomes true. (b) the `#### One residual, stated rather than closed` heading and paragraph (`:409-426`, C3): a SHA-pinned past-tense record plus a pointer to W1(c). (c) **the dead SHA at `:356` only** — a bare token substitution `5c5d082` → `c853245b` in *"THE RULING … shipped at"*, which names the same commit as (a); **the rest of that paragraph does not move** and stays the registered non-move the C2 checklist records. Listed here for exactness although `docs/specs/logbook/` is always allowed |

### Exact contracts

After this WP, shape (4) of the pinned call set is a fully literal shape with
no placeholder:

```js
  // The run's ONE `show`, and its argument is a CONSTANT the run builds: the
  // interpolated form of WARNINGS_REL at `cli/dream.js:1004`, with the constant
  // fixed at `core/dream/warnings.js:72`. SPELLED LITERALLY ON PURPOSE — do not
  // import WARNINGS_REL and do not interpolate it: the retyping is the tripwire
  // that makes a relocation loud. KNOWN_CALLS_SOURCE_DIGEST below pins this
  // whole initializer; changing any of it means re-pinning in the SAME commit
  // as the W1(c) row change. See Table W row W1(c).
  { env: 'unset',   args: ['show', 'HEAD:reports/warnings.md'] },
```

### The durable source-form check (ships in the test file)

The proof of the paragraph above must OUTLIVE this WP, or the guarantee is
one-shot: a later editor reads their own spec, rewrites the slot to interpolate
`WARNINGS_REL` for DRYness, watches the whole suite stay green, and the
relocation tripwire is gone with nothing to notice it. So the check is a
committed test, not a step someone ran once. It lives in
`tests/unit/dream-pipeline.test.js` **beside the set it pins**, reads its own
source via `__filename` (the file is CommonJS — `'use strict'` + `require`, and
`package.json` sets no `"type"`), and compares against a digest constant
declared next to `KNOWN_CALLS`, so a future editor's diff of the set and the
re-pin are the same diff.

```js
/** Pins the SOURCE FORM of KNOWN_CALLS below — see Table W row W1(c). Any edit
 *  to the set re-pins this in the SAME commit as the row change. */
const KNOWN_CALLS_SOURCE_DIGEST =
  '932b54256c3192572f294c5c1ac9aef25bc1e0daf3d5f149e9039074e8f27324';
```

```js
test('dream-pipeline: KNOWN_CALLS is the pinned canonical SOURCE FORM (Table W row W1(c))', () => {
  const src = fs.readFileSync(__filename, 'utf8');
  // (0) OUR OWN GOOD, asserted on raw bytes before any parsing and INDEPENDENT
  //     OF THE LEXER: this file declares KNOWN_CALLS exactly once. A verbatim
  //     COMPLIANT decoy would otherwise match the digest, so this is what
  //     closes the decoy class — not the digest.
  //     The needle is SPLIT because this check lives in the file it checks, and
  //     the boundary lookahead is why KNOWN_CALLS_SOURCE_DIGEST is not a second
  //     declaration. Both were measured: without them this test reds on its own
  //     deliverable.
  const N = 'const ' + 'KNOWN_CALLS';
  const DECL = new RegExp(N + '(?![A-Za-z0-9_$])', 'g');
  assert.equal((src.match(DECL) || []).length, 1,
    `"${N}" must occur exactly once as a whole identifier in this file`);
  // (1) LEXER over JS's LEXICAL grammar only — small, stable, ours to close,
  //     unlike its expression grammar. Two equal-length projections, so offsets
  //     need no mapping back:
  //       code — comments AND string content blanked: locating and bracket depth
  //       hash — comments blanked, string content KEPT: this is what is digested
  const code = src.split(''); const hash = src.split('');
  let st = 0; const stack = []; let esc = false;   // 0 code 1 line 2 block 3 sq 4 dq 5 tpl
  const blankBoth = (i) => { if (src[i] !== '\n') { code[i] = ' '; hash[i] = ' '; } };
  const blankCode = (i) => { if (src[i] !== '\n') code[i] = ' '; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i], d = src[i + 1];
    if (st === 0) {
      if (c === '/' && d === '/') { st = 1; blankBoth(i); blankBoth(i + 1); i += 1; continue; }
      if (c === '/' && d === '*') { st = 2; blankBoth(i); blankBoth(i + 1); i += 1; continue; }
      if (c === "'") { st = 3; blankCode(i); continue; }
      if (c === '"') { st = 4; blankCode(i); continue; }
      if (c === '`') { st = 5; blankCode(i); continue; }
      if (stack.length) { const f = stack[stack.length - 1];
        if (c === '{') f.braces += 1;
        else if (c === '}') { if (f.braces > 0) f.braces -= 1; else { stack.pop(); st = 5; blankCode(i); } } }
      continue;
    }
    if (st === 1) { if (c === '\n') { st = 0; continue; } blankBoth(i); continue; }
    if (st === 2) { blankBoth(i); if (c === '*' && d === '/') { blankBoth(i + 1); i += 1; st = 0; } continue; }
    blankCode(i);                                   // 3, 4, 5: content is not code
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (st === 3 && c === "'") { st = 0; continue; }
    if (st === 4 && c === '"') { st = 0; continue; }
    if (st === 5) {
      if (c === '`') { st = 0; continue; }
      if (c === '$' && d === '{') { blankCode(i + 1); stack.push({ braces: 0 }); st = 0; i += 1; }
    }
  }
  const CODE = code.join('');
  // (2) LOCATE the one declaration in CODE — boundary-aware for the same reason
  //     as (0). If the single raw occurrence is not also code, it was inside a
  //     comment or a string, and that reds.
  DECL.lastIndex = 0;
  const m = DECL.exec(CODE);
  assert.ok(m, `"${N}" does not occur in code (it is inside a comment or a string)`);
  const open = CODE.indexOf('[', m.index);
  assert.ok(open > 0, 'no "[" opens the KNOWN_CALLS initializer');
  let depth = 0, close = -1;
  for (let i = open; i < CODE.length; i++) {
    const c = CODE[i];
    if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) { close = i; break; } }
  }
  assert.ok(close > 0, 'the KNOWN_CALLS initializer is not closed by a matching "]"');
  let j = close + 1; while (j < CODE.length && /\s/.test(CODE[j])) j += 1;
  assert.equal(CODE[j], ';', 'the KNOWN_CALLS initializer is not terminated by ";"');
  // (3) DIGEST the canonical span: comments gone, string literals intact,
  //     whitespace runs collapsed so re-indentation is not a false red.
  const norm = hash.slice(open, close + 1).join('').replace(/\s+/g, ' ').trim();
  const got = require('node:crypto').createHash('sha256').update(norm, 'utf8').digest('hex');
  assert.equal(got, KNOWN_CALLS_SOURCE_DIGEST,
    'KNOWN_CALLS is not the pinned canonical source form. Any edit to the set '
      + 'must re-pin KNOWN_CALLS_SOURCE_DIGEST in the SAME commit as the Table W '
      + `row W1(c) change.\n  extracted span: ${norm}`);
});
```

**This exact code was run as a real test before being specced** (`5d31a7dc`):
assembled into a guard file carrying the canonical initializer plus the sibling
constant, `node --test` reports `pass 1`. Mutated, it reports `fail 1` — the
interpolation swap with the digest constant left unchanged fails with the
re-pin message above, and so does a tampered constant. **The self-reference
traps were confirmed the same way:** restoring the un-split needle fails with
*"must occur exactly once as a whole identifier"*, i.e. the check reds on its
own deliverable if the two notes below are ignored.

**The digest is not a copy of the set** (see the third-copy analysis below), so
it does not breach W1(c)'s two-copies rule — but it IS a registered surface that
moves in lockstep with the set, and it is registered as such in the Mirrored
Surface Checklist. **ADR-0004 re-checked: this runs inside `npm test` and starts
nothing** — it reads one file and hashes a string.

Observable behaviour of the shipped `classify`, in the same live fixture the
index test already builds:

| call | env | required verdict |
|---|---|---|
| `['show', 'HEAD:reports/warnings.md']` | `{}` | `null` (admitted) |
| `['show', '--output=<user index path>']` | `{}` | `UNKNOWN SHAPE — not one of the run's pinned calls` |
| `['rev-parse', 'HEAD']` | `{}` | `null` (the accept side must stay alive) |

## Contract reference

The ADR-0031 trigger fires on (ii) a slot-kind taxonomy changes and (vii) the
contract is mirrored across surfaces — two of seven, which is the threshold.
**(vi) does NOT fire on a strict reading and is not counted**: exactly one
successor inherits this contract (`WP-index-guard-residuals`, whose item 2
edits the same clause). `WP-dream-git-env-pinning` cites the Table W row for a
different obligation and inherits no slot kind, so it is not a second consumer.

**This table takes no family table-letter, deliberately.** W1(c) is and stays
the canonical decision surface for the pinned call set, and the Done spec's
Mirrored Surface Checklist (`:671-674`, not the row) states that the set has
**exactly two copies** — the row and `KNOWN_CALLS` — and that **no third
copy may be written, in prose or in code**. A letter here would claim a standing
table this package does not own and would owe an update to the LIVING letter map
(`docs/specs/logbook/2026-08-29-promote-family-map.md`). What follows is a
**change order**: it decides the three facts that MOVE and cites W1(c) for
everything that does not. It never restates the nine shapes. On merge, W1(c)
carries these three facts and this spec becomes their history.

### The change table — the three facts this WP moves

| # | Fact / rule | Value |
|---|-------------|-------|
| C1 | **A FREE slot that git parses as an OPTION POSITION is not a pin — and where the run's own token is a CONSTANT, the slot becomes a LITERAL rather than a new placeholder kind** | Shape (4)'s argument stops being FREE and becomes the literal `HEAD:reports/warnings.md`. **THE RULE THAT DECIDES IT, AND IT AMENDS W1(c)'s BINARY PARTITION RATHER THAN SITTING BESIDE IT.** W1(c) today partitions slots two ways — *"a slot holding a value the run COMPUTED is `own`; a slot holding data the run merely carries — a mode, a path, a message — is FREE"* — and shape (4)'s token is a carried PATH, so that partition sends it to FREE. **C1 REPLACES IT WITH THREE CLAUSES THAT PARTITION EVERY SLOT ONCE.** **(1)** a slot carrying an **own-value-set member** — *an object name git emitted as the whole stdout of one of this run's pinned PRODUCING shapes*, which is C2's predicate and nothing looser — is `own`; **(2)** of the REMAINING slots, one whose token sits **in a position git parses for OPTIONS** must be FIXED and spelled as a LITERAL — a value that varies has no place in an option position, and a FREE slot there is not a pin at all; **(3)** every other remaining slot — a token git consumes positionally, or as a named option's argument, or after `--` — stays FREE, and a fixed value there MAY be tightened to a literal as optional hardening but is **not required** to be. **CLAUSE (1) CITES C2's PREDICATE RATHER THAN SAYING "COMPUTED", AND THE REASON IS A MEASURED OVERLAP:** the run COMPUTES the commit message (`src/cli/dream.js:1041`) and DERIVES the mode from `ls-tree`'s stdout (`:238-239`), yet both slots are correctly FREE — so "computed" and "carried" overlap before position is even considered, and a partition built on the loose word classifies two existing slots two ways. C2's predicate does not overlap: neither value is an object name git emitted as a producing shape's whole stdout (`ls-tree` is not a producing shape, and its output is a composite line). **EVERY FREE SLOT IN THE SET, ADJUDICATED HERE so the rule is checkable rather than asserted:** shape (1)'s trailing `«path»` — after `--`, clause (3); shape (3)'s `«mode»` — derived from `ls-tree`, not an own-value member, clause (3), and its `«path»` — consumed positionally by `--cacheinfo`, clause (3); shape (4)'s slot — not an own-value member, and git parses `show`'s arguments for options, **clause (2), the one slot this WP moves**; shape (8)'s `«msg»` — computed by the run but never git's stdout, and consumed by `-m`, clause (3); shape (9)'s `«msg»` — a fixed constant (`:263`) consumed by `-m`, clause (3), so it stays FREE and this WP leaves it alone (Out of scope) **without contradicting the rule**. **THE SCOPE IS POSITION, NOT FIXEDNESS** — an earlier draft partitioned on fixed-versus-varying alone and shape (9) falsified it. **"OPTION POSITION" IS A DESIGN-TIME PREDICATE, NEVER A MATCH-TIME TEST.** It is applied by the human author of the row when a shape is added or changed — the same moment, and the same person, that already decides `own` versus FREE. `shapeMatches` is untouched: it still compares literals by equality and admits a placeholder without inspecting the token, so the retired classification direction does not return through this door. **What enforces it is what already enforces every slot kind: the reviewer's slot-by-slot comparison of the row against `KNOWN_CALLS`** — the Done spec's Mirrored Surface Checklist states in as many words that no grep reaches a slot-kind drift. **A future call needing a VARYING token in an option position is a design problem for that call** (re-shape it so git consumes the token positionally), not a licence for a fourth token kind. **That sentence in W1(c) must be rewritten in the same pass** — it is a registered mirror of this rule (checklist entry 1 under C1) and leaving it standing beside the new one is the intra-cell failure this WP's notes name as its likeliest way to ship broken. **No third placeholder kind is introduced and no matching rule changes** — `shapeMatches` already compares non-placeholder tokens by equality, so this is a slot-kind change inside the existing grammar. **SPELLED LITERALLY, NOT IMPORTED FROM `WARNINGS_REL`:** an interpolated constant makes the pin follow production silently, which is precisely the widening default-deny exists to prevent; spelled literally, relocating the warnings file reddens the guard and forces the owner-visible W1(c) amendment W1(c) requires. **The two forms are indistinguishable at run time, so this choice is provable only by the SOURCE-FORM check** (criterion 1) — without it the interpolation ships green and the relocation tripwire silently does not exist. **The `«own …»`/OWN-VALUE rule is untouched and still reaches only shapes (1), (3), (6), (8), (9)** — W1(c) is right that no observation pins this token; what changes is the conclusion drawn from that, not the rule |
| C2 | **The own-value set's membership invariant, restated so every member satisfies it** | A value joins the own-value set only if it is **an object name git itself emitted as the whole stdout of one of this run's pinned PRODUCING shapes** — never bytes read back out of a file in the user's vault, and never a composite line carrying user-supplied data. **All four members satisfy this**, `head` included: `rev-parse HEAD` returns git's own name for the user's current commit, not content from a file the user authored. **The two shapes excluded keep their exclusion and now have a stated reason each:** shape (4) `show HEAD:<path>` returns FILE CONTENT out of the user's vault history (the measured reason `b19121bb` narrowed the set), and shape (1) `ls-tree` returns a composite line embedding a user-controlled path. **The word MINTED is retired** — it is the sentence `head` falsifies. **This is a restatement, not a reclassification:** dropping `rev-parse HEAD` from the producing set was weighed and rejected below, because `head` feeds three own-value slots (`read-tree` `:234`, `ls-tree` `:238`, `commit-tree -p` `:261`) and its removal would redden every legitimate run |
| C3 | **The count of own-value sources is FOUR, and the prose surfaces stop carrying the count** | The code admits four (`produces: true` at `tests/unit/dream-pipeline.test.js:192, :195, :197, :198-199`), which is exactly the `(2), (5), (7), (8)` remedy W1(c) itself specified. **W1(c)'s residual clause becomes a CLOSURE record** — the remedy it deferred to the owner shipped at `b19121bb` — recorded WITH its cause, per Table W's own retirement discipline, never silently deleted. **The logbook paragraph becomes SHA-pinned and past-tense**, which restores it to the record exemption the Done spec's Mirrored Surface Checklist grants (`:665-666`, exemption (iii): *"a record loses the exemption the moment it drops its pin or its past tense"*), and it points at W1(c) instead of predicting it. **Neither prose surface may state a bare count again**: the count is a number beside a list, and the surface that owns it is the `produces` markers |

### Mirrored Surface Checklist

Every surface below was found by the whitespace-flattened claim sweep in
Verification steps — that command owns the pattern; this section does not
restate it — run over `git ls-files '*.md' '*.js'` at `5d31a7dc`. Re-run it
after editing; a hit that is neither corrected text nor a named non-move below
is unfinished work.

**C1 — the `show` slot's kind:**

- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — **W1(c)'s FREE-slot RULE sentence** (*"A slot holding a value the run COMPUTED is `own`; a slot holding data the run merely carries — a mode, a path, a message — is FREE …"*). **This is the entry that decides the others**: C1 replaces its two-way partition with C1's three clauses, in the SAME words the C1 cell uses — a slot carrying an own-value-set member (C2's predicate) → `own`; of the rest, one in a position git parses for options → fixed literal; every other remaining slot → FREE. **The shorthand "computed → own" may NOT be carried into W1(c)** — it overlaps "carried" for two existing slots (C1's adjudication), which is how this rewrite would have re-introduced the ambiguity it exists to remove. No presence-grep reaches this sentence; the sweep pattern `merely carries` exists for it alone
- [ ] `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:368-372` — *"Slots holding data the run did not compute — modes, paths, messages — stay `ANY`."* **Present tense, and C1 makes it false for a fixed carried token in an option position.** It sits beside that entry's own deference sentence (*"each slot's kind is Table W row W1(c)'s and this entry does not spell it"*), which the "stay `ANY`" clause violates by spelling. **Both are fixed together:** the passage becomes SHA-scoped past tense (what the rule reached at **`c853245b`**) and DROPS the slot-kind spelling, so the deference sentence becomes true and exemption (iii) is restored. The sweep pattern `` stay `ANY` `` exists for this sentence alone. **THE PIN IS `c853245b`, NOT THE `5c5d082` THIS SPEC CARRIED UNTIL ROUND 2:** that SHA does not resolve in this repository (`git cat-file -t 5c5d082` → `fatal: Not a valid object name`), almost certainly a fork-port history rewrite, and a pin that does not resolve cannot ground the record exemption it exists to earn. `c853245b` was verified by CONTENT, not by name alone — *"test(dream): pin the object-name slots to values the run itself computed"*, and its diff is the commit that introduces `RUN_VALUE` and the five own-value slots this passage describes
- [ ] `tests/unit/dream-pipeline.test.js:194` — `KNOWN_CALLS` shape (4), the executable copy
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — W1(c)'s pinned-set enumeration, item **(4)** (`` `unset` — `show «HEAD:path»` (`:1004`) ``)
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — W1(c)'s *"WHICH SLOTS TAKE THE PIN"* clause: the `` **`show «HEAD:path»` stays free …** `` sentence, which this WP makes false. Its "five shapes the rule reaches" sentence stays TRUE and must not be edited
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — the **MEASURED IN BOTH DIRECTIONS** sentence, which follows the one above and carries the SAME dead SHA `5c5d082`. **In scope because it is inside row W1(c)** — verified by offset: the occurrence sits between that cell's clause-(c) and clause-(d) markers. Correct it to `c853245b`, retire-with-cause — the measurement it pins is real and stays; only its name was lost to the history rewrite
- [ ] `tests/unit/dream-pipeline.test.js:1632-1658` — the non-vacuity canary block: gains the show canary (acceptance criterion 4)
- [ ] `tests/unit/dream-pipeline.test.js` — **the `KNOWN_CALLS_SOURCE_DIGEST` constant. REGISTERED, and the registration is the point.** It is not a copy of the set — the set cannot be read out of a hash — but it moves in byte-lockstep with it, so it belongs in this checklist exactly like the row/`KNOWN_CALLS` pair: **any edit to the initializer re-pins the constant in the same commit as the W1(c) row change.** Recorded here so the next editor meets the obligation in the registry as well as in the row
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — **W1(c) gains three sentences it does not have today**, because it is the surface where the set is decided and therefore the one a future editor consults: (i) the set's source form is pinned by `KNOWN_CALLS_SOURCE_DIGEST` in the guard file; (ii) any edit to the set re-pins that digest in the SAME commit as the row change; (iii) `const KNOWN_CALLS` may appear exactly once in that file, which is the constraint the check's decoy defence rests on. Without (i)–(iii) the rule exists only in a spec that a later WP never reads
- [ ] Verification greps in `docs/specs/done/WP-dream-promote-in-workspace.md:1469-1518` — **swept, no hit**: none spells a shape, a slot kind or a count. Recorded so a later gate does not re-derive it

**C2 — the own-value membership invariant:**

- [ ] `tests/unit/dream-pipeline.test.js:168-186` — the `RUN_VALUE` JSDoc (*"values THIS RUN PRODUCED … the head from `rev-parse HEAD`"*)
- [ ] `tests/unit/dream-pipeline.test.js:277-283` — the `produces` comment; the **MINTED** sentence is the false one
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — W1(c)'s *"THE REPAIR DOES NOT INSPECT THE TOKEN"* clause, same PRODUCED phrasing. **Registered and deliberately NOT moved, decided rather than left open.** Two reasons, and the second is the one that settles it: (a) C2 does not falsify it — *PRODUCED* is loose, not false, and the clause even enumerates the correct four sources, so it survives the restatement; (b) the surface that would carry C2's sharpened membership rule inside W1(c) is the **slot-side counterpart to `produces`**, which the canonical row does not have today and which is `WP-index-guard-residuals` item 2's deliverable. Sharpening this clause here would do half that package's work in a cell it then re-edits. **Hand-off, stated so the obligation is not dropped:** that package lands C2's sharpened wording in W1(c) when it gives `produces` its slot-side representation
- [ ] `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:356-366` — the same PRODUCED phrasing. **The PROSE is registered and deliberately NOT moved**: it sits in a dated narrative describing that day's ruling and does not carry the false MINTED claim. **ITS DEAD SHA IS A DIFFERENT MATTER AND DOES MOVE** — `:356` pins the ruling to `5c5d082`, which does not resolve; it is corrected to `c853245b` and nothing else in the paragraph changes (Deliverables edit (c)). *Round 2 assumed this occurrence fell inside a passage this WP already rewrites; it does not — `:356` is outside both `:368-372` and `:409-426`, which is why it needed its own line here.* A dead pin in a record is not a stylistic matter: exemption (iii) is granted to a SHA-PINNED record, and a pin that resolves to nothing is not one
- [ ] `memory/lessons/inbox.md` (`WP-dream-promote-in-workspace:` bullet, *"An own-value set must hold what the run MINTED, never what it READ BACK"*) — **registered and deliberately NOT moved**: the lessons file is a record of what a round cost, not a contract mirror, and the lesson's direction (never admit read-back user content) is sound. Do not edit it

**C3 — the source count:**

- [ ] `tests/unit/dream-pipeline.test.js:190-201` — the four `produces: true` markers, which own this fact
- [ ] `tests/unit/dream-pipeline.test.js:277` — *"from the four shapes that produce an object name, and no others"*: **correct today**, re-read it whole after the C2 rewrite
- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:541` — W1(c)'s residual clause. **STALE**
- [ ] `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:409-426` — **STALE**
- [ ] `docs/specs/logbook/2026-08-31-index-refresh-dropped-with-its-cause.md:432-437` — the *"six `unset`-disposition shapes"* sentence. **Registered as a NON-hit**: it counts dispositions, not own-value sources, and is TRUE. Do not touch it; it is the near-miss a count-shaped sweep will surface

**Surfaces this WP does NOT move, measured rather than assumed:**

- [ ] `docs/specs/done/WP-dream-promote-in-workspace.md:545` — **THREE more dead `5c5d082` references, in row W5 (THE RETIREMENT REGISTER), and they are NOT fixed here.** Measured contexts: *"Both forms are measured RED at"*, *"ACCEPTED by the set of that date — see the … cells below"*, *"ONE CELL WAS ADDED AT"*. **Deliverables scopes this WP to row W1(c), and W5 is a different row**, so fixing them would breach the permission boundary this spec exists to define. **They go in the PR body under "Discovered issues", naming the correct SHA (`c853245b`) and this line, so the next package can take them** — CLAUDE.md's rule for exactly this case. The sweep pattern `5c5d082` surfaces them on every future run until someone does
- [ ] `src/core/dream/warnings.js:63-66` — **KNOWN-FALSIFIED-BY-DESIGN, and dispositioned rather than left to be re-found.** Its JSDoc says `WARNINGS_REL` is *"the ONE place it is decided"* and that anything naming the path imports it rather than retyping it. **C1 deliberately retypes it in the guard, and the retyping IS the tripwire** — an importing pin would follow a relocation silently, which is the whole reason C1 rejects it. The JSDoc's claim narrows to PRODUCTION consumers; the guard is not one. **`src/` is frozen in this WP, so nothing is edited here**; the one-line JSDoc narrowing rides the queued architect follow-up batch. Owner ruling of 2026-09-01, following the mode-pin precedent of registering a known-stale comment rather than widening a package to chase it

- [ ] `docs/adr/0012-dream-run-lifecycle.md:274-281` — states W1's substance (no index write) and explicitly defers the mechanism to Table W. A slot-kind change does not reach it
- [ ] `docs/THREAT-MODEL.md`, `docs/adr/0010-vault-adoption-paths.md`, `tests/integration/dream.test.js`, `tests/integration/adopt-e2e.test.js` — registered Table W mirrors that carry no claim from any family above (sweep: zero hits)
- [ ] `src/` — **nothing.** The production call at `src/cli/dream.js:1004` is already the pinned literal; this WP changes no behaviour
- [ ] `docs/specs/WP-index-guard-residuals.md` — **registered NON-move.** It hits two patterns because its item 2 quotes C2's sharpened invariant in the hand-off this WP gives it (see the C2 checklist above). It is a Draft stub describing future work, not a mirror of the shipped contract, and its text is correct as written
- [ ] **This spec file, and `docs/specs/logbook/2026-09-01-show-slot-design-gate-rounds.md`** — both quote the pre-change text on purpose, as a change order and a round record must, and those quotations stay true as history. Excluded from the sweep for that reason and no other. **The round record is the coordinator's file: do not edit it**

## Implementation notes & constraints

- **The source-form proof asserts OUR OWN CANONICAL BYTES and enumerates no bad
  form. Do not turn it back into a shape check.** Three rounds, each a patch to
  a matcher, each one spelling short — which is this repo's central measured
  result arriving one level up: *enumerating the BAD is unclosable when the
  grammar is not ours; enumerating our OWN GOOD is closable*. Round 1 shipped
  no discriminator; round 2's greps inverted their exit status (`grep -c` exits
  1 on a zero count, so the pipeline read COMPLIANT as failure) and scored a
  comment-decoy-plus-concatenation 1/0/0; round 3's regex checker exited 0 on
  three measured evasions — a compliant decoy initializer in a block comment,
  a duplicate `show` shape with a double-quoted verb, and a `proof:` decoy
  property beside an interpolated `args`. Each fix would have been one more
  clause in **JavaScript's expression grammar, which is not ours**. The
  digest ends that: any deviation is a mismatch, with nothing to enumerate.
- **The uniqueness assertion (0) is not optional and is not redundant with the
  digest.** A verbatim COMPLIANT decoy — the round-3 comment evasion — produces
  a MATCHING digest if the locator lands on it, so the digest alone does not
  close that class; assertion (0) does, and it holds without the lexer being
  perfect. It costs one real constraint: `const KNOWN_CALLS` may appear exactly
  once in that file, in any context, so no comment may quote the declaration.
- **Any future WP that edits `KNOWN_CALLS` must re-pin the digest in the same
  commit that changes the row.** That coupling is the feature — it is the
  owner-visibility W1(c) wants and previously had no mechanism for. **The rule
  is carried by three surfaces, not by this note**, because a later WP reads
  its own spec and never this one: the committed test (which reds), the
  constant sitting in the same diff hunk as the set, and W1(c)'s own sentences.
  A rule that lives only here is the finding round 4 raised.
- **TWO MEASURED TRAPS in putting the check inside the file it checks, both of
  which red on the WP's own deliverable if missed.** (i) `const
  KNOWN_CALLS_SOURCE_DIGEST` CONTAINS the substring `const KNOWN_CALLS`, so a
  naive count sees two declarations — hence the identifier-boundary lookahead
  in assertion (0) **and in the locator**, which must agree or the locator
  lands on the constant when it is declared first. (ii) The checker's own
  needle would be a third occurrence, so it is built as `'const ' +
  'KNOWN_CALLS'`. Do not "clean up" either: both were measured failing, and
  the natural adjacent name is worth the two lines it costs.
- **The retired direction may not return.** Do not add a slot kind that
  inspects a token — a `NOT_OPTION` slot, a leading-dash check, a prefix rule
  or any grammar-aware tolerance. Rejected options below records why each is
  refused; re-proposing one is a spec violation, not a design discussion.
- **Nine shapes stay nine.** This WP changes one slot's kind. Any sentence
  counting the shapes (W1's residual on hook-firing, W1(c)'s set preamble)
  stays true and must not be edited.
- **The guard must notice its own death.** The canary block asserts both
  directions — a shape that must be REJECTED and a shape that must be ACCEPTED
  — because a decision that rejects everything passes a reject-only probe. An
  earlier form of this guard sat at 3 pass / 0 fail while enforcing nothing.
- **After rewriting any canonical cell, re-read that cell WHOLE.** W1(c) is one
  markdown table cell of roughly 41 KB on a single line (`:541`); no mirror
  checklist can see inside it, and the failure mode is the new sentence landing
  while the old one stays. This is the single most likely way this WP ships
  broken.
- **`docs/specs/done/` is not always-allowed** — `scripts/boundary-check.js`
  admits only `package-lock.json`, `memory/lessons/inbox.md`,
  `docs/specs/logbook/` and the spec itself without listing. The Done spec is
  listed in Deliverables for that reason.
- **No new logbook entry is required for this WP** (architect ruling): the
  closure belongs in W1(c), where the residual was recorded, and the drift
  lesson belongs in `memory/lessons/inbox.md` as a PR-body bullet per CLAUDE.md.
  A new dated entry would create a fourth surface for a fact that now has one.
- **Ambiguity → the simpler option, recorded under "Decisions made".** Do not
  expand scope to resolve it.

### Rejected options, recorded so they are not re-proposed

| Option | Why rejected |
|---|---|
| **A third placeholder kind that rejects option-looking tokens** (`NOT_OPTION`, a leading-`-` check) | It classifies the token by lexical form, which is the direction two measured refutations retired. It is also unclosable in the same way: git's option grammar is not ours (`--output=<f>`, attached short forms, future spellings), so the check can always be one form short — and one form short HERE grants by omission at the exact layer that refuses to grant by omission |
| **A MATCH-TIME pin-rule change making every FREE slot reject option-looking tokens** | Same classification defect: it is `shapeMatches` judging a token's form at run time. **This is the option C1 must not be confused with** — C1's clause (2) is a DESIGN-TIME predicate about the slot's POSITION, decided by the row's author once, and it changes no matcher. The match-time version is also unnecessary: it would police four more slots that measurement shows do not need it — none of them redirects the index (Current state, the per-slot measurement) — and it puts a fuzzy matcher in the one place the contract forbids one |
| **Extending OWN-VALUE to the `show` slot** | W1(c) is right that the rule does not reach it: the token is BUILT by the run, never observed coming back from git, so there is no observation to compare against. Implementing it would mean seeding the `computed` set with strings the guard constructs — which is a literal pin wearing a placeholder's name, with an indirection added |
| **Interpolating `WARNINGS_REL` into the pin** (`` `HEAD:${WARNINGS_REL}` ``) | The guard would follow production silently: relocating the warnings file would change the run's call set with no red and no W1(c) amendment — exactly the silent widening W1(c) names. The literal makes that change loud and owner-visible, which is the intended cost |
| **Splitting shape (4) into two shapes** (one per legitimate argument) | There is only one legitimate argument. A second shape would be a shape the run cannot make, which default-deny exists to forbid |
| **Reclassifying `head` out of the own-value set** (drop `produces` from `rev-parse HEAD`) — the alternative to C2's restatement | `head` feeds three own-value slots — `read-tree` (`src/cli/dream.js:234`), `ls-tree` (`:238`) and `commit-tree -p` (`:261`). With it absent from `computed`, every legitimate run fails those slots and the guard reddens on correct behaviour. The invariant is what was wrong, not the membership |
| **Deleting the stale residual clause and the stale logbook paragraph** | Table W records every retirement WITH its cause so that none reads as a silent weakening. A closed residual becomes a closure record naming the commit that closed it; a stale narrative becomes a pinned past-tense one. Deletion loses the paid-for finding twice |
| **Re-extracting Table W into a live spec instead of amending the Done one** | It would move a canonical table mid-stream, obsolete every registered citation of `WP-dream-promote-in-workspace`'s W-rows across ADR-0012, two integration tests and the logbook, and owe an update to the LIVING letter map — a far larger change than the three sentences at issue. Parked as the owner's second dispatch-precondition question rather than decided here |

## Security checklist

- [ ] N/A — this WP introduces no untrusted identifier flowing into a filesystem
      path or a shell command; it changes a test-side guard and two prose
      surfaces, and no `src/` file.
- [ ] **The one security-relevant property**: the change may only NARROW what
      the guard admits. After the change, every call the unmodified run makes
      is still admitted (the accept side of criterion 4), and one call class
      that was admitted is now rejected. No shape, disposition or slot may be
      widened.

## Acceptance criteria

- [ ] 1. `KNOWN_CALLS` shape (4) is the fully literal
      `{ env: 'unset', args: ['show', 'HEAD:reports/warnings.md'] }`, with no
      placeholder symbol in it and no interpolation of `WARNINGS_REL`.
      **Proved by the SOURCE-FORM SCRIPT in Verification steps — its EXIT CODE
      is the verdict, and nothing else can prove this.** Any expression that
      resolves to the same token (the interpolated form of `WARNINGS_REL`, or
      `'HEAD:' + WARNINGS_REL` split across lines) produces an identical
      runtime token, so the whole RED/GREEN matrix, the index test and every
      sweep pattern go green under it; `WARNINGS_REL` is already imported at
      `tests/unit/dream-pipeline.test.js:30`, which puts that false green one
      edit away. The relocation tripwire that motivates C1's choice rests
      entirely on this script. **The initializer must match the pinned digest
      exactly**, so the shipped form is the canonical one down to quote style;
      a red prints the extracted span, and conforming to it is the fix.
- [ ] 2. `classify(['show', '--output=<user index path>'], {})` returns
      `UNKNOWN SHAPE — not one of the run's pinned calls`, and
      `classify(['show', 'HEAD:reports/warnings.md'], {})` returns `null`.
- [ ] 3. The whole index test — all three vault layouts — is green, i.e. the
      unmodified run's every call is still admitted and `violations` is empty.
- [ ] 4. **C1 carries an observed RED against a deliberately broken state, and
      its vector is TWO tokens.** A canary that differs from its exploit in
      ARITY dies on length equality before reaching the slot under test and
      certifies a rejection the set never made — the measured lesson of the
      `read-tree` gap. Both sides are observed and both are pasted: RED with
      the slot reverted to `ANY` (the two-token show vector is admitted), GREEN
      with the literal in place, and the accept side (`['rev-parse', 'HEAD']`,
      and the run's own `show`) still admitted in both.
      **C2 and C3 are prose and carry NO red, deliberately** — C2 rewrites two
      comments and C3 needs no code change at all, so a mutation there reddens
      nothing and any red produced for them would be synthetic. Their proof is
      criterion 6, criterion 7 and the whole-cell re-read, not a test run.
- [ ] 5. **THREE applied mutations for C1, each with its diff shown before its
      outcome is believed.** (a) the slot reverted to `ANY` — reddens the
      runtime matrix (criterion 4); (b) the slot replaced by the interpolated
      form of `WARNINGS_REL`; (c) the slot replaced by the concatenation
      `'HEAD:' + WARNINGS_REL` **split across two lines**. For (b) and (c) the
      **runtime suite stays GREEN and the source-form script exits nonzero** —
      that asymmetry is the whole point of having it. **The digest arm reds on
      EVERY non-canonical form, so these two are required as evidence of the
      asymmetry, not as an enumeration of what the checker catches** — the
      twelve-state matrix beside the script is that record, and it must be
      re-run, not merely cited.
- [ ] 6. The `RUN_VALUE` JSDoc and the `produces` comment state the C2
      invariant, all four members satisfy it as stated, and the word MINTED no
      longer appears in `tests/unit/dream-pipeline.test.js`.
- [ ] 7. W1(c) and the logbook paragraph state C3, neither states a bare count
      of own-value sources, and W1(c) names `b19121bb` as the commit that
      closed the residual. **Every SHA this WP writes resolves** — the
      `git cat-file -e` steps pass — and `5c5d082` no longer appears anywhere
      this WP is permitted to edit. Its three surviving occurrences in row W5
      are reported under "Discovered issues" in the PR body, with `c853245b`
      named as the correct SHA, and are NOT fixed.
- [ ] 8. The whitespace-flattened sweep of the claim families (Mirrored Surface
      Checklist) is re-run over the whole tree and every hit is either
      corrected text or one of the registered non-moves. Paste the sweep
      output. This spec and the round record are excluded — both quote the
      pre-change text by construction (see the command's comment). The command
      runs **one pattern per pass** because a single alternation with context
      windows matches non-overlapping and swallows adjacent hits; do not
      collapse it back into one regex.
- [ ] 9. `npm test` and `npm run lint` pass; `boundary-check` is clean.
- [ ] 10. Idempotency: `N/A — this WP ships no command and writes nothing
      outside the repository.`
- [ ] 11. **The source-form check is COMMITTED and runs in `npm test`** — the
      test and the `KNOWN_CALLS_SOURCE_DIGEST` constant are in
      `tests/unit/dream-pipeline.test.js`, the constant holds
      `932b54256c3192572f294c5c1ac9aef25bc1e0daf3d5f149e9039074e8f27324`, and
      the guard-file suite is green with it. No `/tmp` script is created by
      this WP; there is one home for this proof.
- [ ] 12. **THE DURABLE ARM IS SHOWN ALIVE — the canary discipline applies to
      it too.** Two observed states, both making the SUITE red, not a
      standalone script: (a) the slot swapped to the interpolated form with the
      digest constant left UNCHANGED — this is the future-editor scenario the
      whole design exists for; (b) the digest constant tampered while the set
      is canonical. Paste both. **A durable check nobody has watched fail is
      the 3-pass/0-fail guard again**, one layer out.

## Verification steps (run these; paste output in the PR)

```bash
# The guard's own file — the discriminating run, and the home of the SOURCE-FORM
# check (criterion 1). There is no separate script to create: the checker and
# its pinned digest SHIP in tests/unit/dream-pipeline.test.js (Exact contracts),
# so the source-form proof is one of these tests. Capture the exit code as its
# own statement, never behind a pipe, which reports the pipe's end.
npm test -- tests/unit/dream-pipeline.test.js
echo "guard-file suite exit=$?"

# The whole suite and the lint pipeline.
npm test
npm run lint

# The SHA pins this WP writes must resolve in this repository — a pin that does
# not resolve cannot ground the record exemption it is there to earn.
git cat-file -e c853245b^{commit} && echo "c853245b resolves"
git cat-file -e b19121bb^{commit} && echo "b19121bb resolves"

# The permission boundary. Run on the IMPLEMENTATION branch, whose diff is the
# WP's own; on a spec-only branch it reports the spec-family files this WP does
# not list, which is the gate being pointed at the wrong diff, not a violation.
node scripts/boundary-check.js docs/specs/WP-show-slot-own-value-kind.md \
  $(git diff --name-only main...HEAD)

# The claim sweep (criterion 8) — whitespace-flattened, so a hard wrap cannot
# hide a hit. ONE PATTERN PER PASS, as fixed literals: an alternation with
# context windows matches non-overlapping, so an earlier window SWALLOWS a
# later hit inside it (measured: the `read back out of` occurrence in the Done
# spec was eaten by the `stays free` window and the sweep reported five hits
# where there are six). Per-pattern passes cannot swallow, `-F` needs no
# escaping, and `| wc -l` counts the same under every grep — `-c` does not
# (BSD grep counts LINES, and the flattened file is one line).
#
# EXCLUDED, and nothing else is: this spec and the round record, both of which
# QUOTE the pre-change text on purpose (`['show', ANY]`, MINTED, "four
# sources") and would otherwise read as a wall of un-swept hits. (The gate's
# raw `.txt` captures quote it too and are outside this glob already — do not
# add them to the glob to sweep them.)
PATTERNS=('four sources' 'admits six' 'single-line output of' 'stays free' \
          'merely carries' 'stay `ANY`' "'show', ANY" 'show «HEAD' 'MINTED' \
          'read back out of' 'values THIS RUN PRODUCED' '5c5d082' \
          'KNOWN_CALLS_SOURCE_DIGEST' '932b54256c31')
for f in $(git ls-files '*.md' '*.js' | grep -v node_modules \
             | grep -v WP-show-slot-own-value-kind \
             | grep -v show-slot-design-gate-rounds); do
  flat=$(tr '\n' ' ' < "$f" | tr -s ' ')
  for p in "${PATTERNS[@]}"; do
    n=$(printf '%s' "$flat" | grep -oF "$p" | wc -l | tr -d ' ')
    if [ "$n" -gt 0 ]; then printf '%s :: %s :: %s\n' "$f" "$p" "$n"; fi
  done
done
```

Each reported hit is adjudicated by opening the file: it must be corrected
text or one of the registered non-moves below. Two patterns exist for one
sentence each, because no presence-grep for a placeholder symbol reaches
either: `merely carries` for W1(c)'s FREE-slot rule, and `` stay `ANY` `` for
the logbook's contradicting slot-kind clause (checklist entries 1 and 2 under
C1). **`KNOWN_CALLS_SOURCE_DIGEST` and the digest prefix `932b54256c31` are
patterns for the new registered surface**: after this WP each should report the
guard file (constant + assertion message) and nothing else, so a hit anywhere
a third surface has appeared. **`5c5d082` is a pattern for a DEAD SHA**: after this WP it must survive
only in row W5, whose three occurrences are a registered Discovered issue this
package may not touch — so that pattern is expected to keep reporting `:545`
and nothing else. A hit anywhere else is unfinished work.

**THE PIN, and its derivation.** The digest covers the WHOLE normalized
initializer, not the one slot:

`932b54256c3192572f294c5c1ac9aef25bc1e0daf3d5f149e9039074e8f27324`

Derived at `5d31a7dc` from the post-change initializer — the tree's
`tests/unit/dream-pipeline.test.js` with `:194` replaced by the Exact-contracts
line and **no other difference** (`diff` reports exactly `194c194`) — then
comment-stripped, whitespace-collapsed and trimmed. The normalized span it
hashes is auditable by eye and begins:

```text
[ { env: 'unset', args: ['ls-tree', RUN_VALUE, '--', ANY] }, { env: 'unset', args:
['hash-object', '-w', '--stdin'], produces: true }, … { env: 'unset', args: ['show',
'HEAD:reports/warnings.md'] }, … ]
```

The digest was re-derived independently of the script (`shasum -a 256` over the
printed span) and agrees. **No string literal in the set contains a whitespace
run**, visible in that span, so collapsing runs is lossless here; a future
member whose literal held two adjacent spaces would need this stated again.

**Observed in TWELVE states at spec time** (`5d31a7dc`, running the Exact-contracts
checker standalone over scratch copies of the guard file, before it had a home
in the tree), each exit captured as its own statement rather than behind a
pipe. **This table is a spec-time measurement record, not a verification step:**
the implementer re-proves the same property through the COMMITTED test
(criteria 11 and 12), which is the only home the check has:

| state of the initializer | exit | reads |
|---|---|---|
| absent — today's `['show', ANY]` | 1 | **RED** |
| **canonical — the pinned form** | **0** | **GREEN** |
| **pure re-indentation of the canonical form** | **0** | **GREEN** |
| double-quoted literal in the slot | 1 | **RED** |
| identifier interpolation — the template form | 1 | **RED** |
| multiline `'HEAD:' + WARNINGS_REL` with a decoy comment carrying the literal | 1 | **RED** |
| a duplicate `show` shape, single-quoted verb | 1 | **RED** |
| round 3: a compliant decoy initializer inside a block comment before the real one | 1 | **RED** |
| round 3: a duplicate `show` shape with a **double-quoted verb** | 1 | **RED** |
| round 3: a `proof:` decoy property carrying the literal while `args` interpolates | 1 | **RED** |
| a compliant decoy initializer inside a **string literal** | 1 | **RED** |
| the nine shapes **reordered** | 1 | **RED** |
| the digest constant declared **before** the set, canonical initializer | 0 | **GREEN** |
| the digest constant declared **after** the set, canonical initializer | 0 | **GREEN** |
| the digest constant present and **tampered** | 1 | **RED** |
| the digest constant unchanged, slot **swapped to interpolation** — the future-editor case | 1 | **RED** |

Three of these are the round-3 evasions, each reproduced against the previous
checker (all exited 0) before being fixed. **The last four are the durable
arm**: they confirm that a sibling constant in either position leaves the pinned
span — and therefore the digest — unchanged, and that the tripwire fires on both
the tampered-pin and the future-editor case. **Two behaviours changed
deliberately and are stated because an earlier round of this spec said the
opposite:** the double-quoted literal now REDS — the contract is no longer "a
string literal with that raw value" but "the canonical byte sequence", and an
implementer who writes double quotes gets a red naming the extracted span and
conforms; and re-indentation PASSES, which is the whitespace collapse earning
its place.

The absent state reads red rather than green because the check is a required
POSITIVE assertion, not a negated grep — a `! grep` here would pass hardest
exactly where the work was never done.

**WHY A DIGEST IS NOT A THIRD COPY OF THE SET** — answered here so review does
not re-derive it. The Done spec's Mirrored Surface Checklist says the pinned
set has exactly two copies, the row and `KNOWN_CALLS`, and that no third may be
written in prose or in code. **A digest is not a copy: the set cannot be read
out of it.** What it adds is byte-lockstep — every future edit to the set must
arrive with a new digest beside the row change, which is precisely the
owner-visibility W1(c) asks for and could not previously get, since no grep
reaches a slot-kind drift. House precedent for a content hash as a
verification root of trust is `WP-157`'s app-tree digest
(`memory/lessons/inbox.md`, the `WP-157 impl` bullet; the mechanism is live in
`src/scheduler/descriptor.js` and `src/core/manifest.js`). That lesson's own
warning — *two copies of the digest computation would drift* — does not apply
here: there is one computation, in one script, in one place.

**WHAT THIS CHECKER DOES NOT DEFEND AGAINST, stated so it is not asked for
again.** It guards the pin's source form against drift and against
DRY-minded rewrites that would make the guard follow production. An editor
deliberately restructuring the file to defeat verification is the PR review
gates' threat, not this script's. **Lexer imprecision cannot produce a false
green:** any mislocation yields a different span and therefore a mismatch, and
the one mislocation that WOULD match — landing on a verbatim compliant decoy —
is refused by assertion (0), which is lexer-independent. That is why (0) exists
and why it runs first.

**Do NOT verify with `--test-name-pattern`.** Measured on this tree at
`5d31a7dc` (Node v25.9.0):
`npm test -- tests/unit/dream-pipeline.test.js --test-name-pattern "zzz-nothing-matches-zzz"`
reports `tests 43 / pass 43 / skipped 0` — identical to the unfiltered run. The
flag filters nothing here, so a green from it attributes nothing.

## Out of scope (do NOT do these)

- **The three other index-guard residuals** — the relative `GIT_INDEX_FILE`
  frame mismatch, the `produces` attribute having no slot-side counterpart in
  the canonical row, and `src/cli/dream.js:156`'s over-claiming seam comment.
  They are `WP-index-guard-residuals`, which **must land after this WP**: its
  item 2 edits the same W1(c) cell this WP rewrites, and it rebases on the
  corrected text. Its `depends_on` names this package.
- **Tightening shape (9)'s `«msg»` slot to the literal `wienerdog dream`.**
  Production passes a constant there (`src/cli/dream.js:263`), so a literal is
  available. **This is NOT an exception to C1's partition — it is clause (3)
  applying**: the slot is `-m`'s consumed value, not a position git parses for
  options, so a fixed value there is optional hardening rather than a gap, and
  the amended W1(c) rule says so in as many words. Leaving it FREE keeps the
  row and `KNOWN_CALLS` consistent on merge. Named here so review does not file
  it as a missed mirror. If wanted, it is a separate S package.
- **Any change to `src/`.** The production call is already the pinned literal.
- **Any change to `shapeMatches`, the disposition clauses, the endpoint
  diagnostic, the projection message, or the number of pinned shapes.**
- **`WP-dream-git-env-pinning`** (the git-env product-hardening candidate) and
  **`WP-criterion-red-harness`** (the general vacuity harness). This WP proves
  its own three fixes by hand; it does not build a harness.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including C1's RED and its applied-mutation diff (criteria 4 and 5) and the
   sweep of criterion 8. C2 and C3 carry no red by design — do not manufacture
   one.
2. Conventional commits; PR titled
   `test(dream): close the show option-position slot and re-sync the guard's mirrors (WP-show-slot-own-value-kind)`.
3. PR template filled, including "Decisions made" (or "none"),
   `Generated-by:`, and **"Discovered issues" naming row W5's three dead
   `5c5d082` references** (criterion 7) — found by this package, out of its
   boundary, and left for the next one.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.
