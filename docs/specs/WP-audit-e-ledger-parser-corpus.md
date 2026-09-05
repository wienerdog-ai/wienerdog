---
id: WP-audit-e-ledger-parser-corpus
title: Ledger-parser correctness — three-state trust reader, null-prototype records, contract-complete hostile corpus
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0020, ADR-0022, ADR-0031, ADR-0042]
epic: audit-close
---

# WP-audit-e-ledger-parser-corpus: Ledger-parser correctness — three-state trust reader, null-prototype records, contract-complete hostile corpus

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Dispatch precondition (FIVE owner items; accepting all five recommendations changes no Deliverables row)

Each item gives the question, the recommendation, and the cost of overruling it.
What lets the session dispatch under them is the **process ruling** of
2026-09-05, not any one queue's item list: the owner's standing instruction of
that date — quoted verbatim in
`docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md`, whose §3
generalises it, and restated in `docs/HANDOVER.md`'s 2026-09-05 status pass #3 —
settles that *the maturing architect records a recommendation with the cost of
overruling it, and the session may dispatch under that recommendation, the owner
reversing any of them by dated amendment*.

This work package's **own** rulings record,
`docs/specs/logbook/2026-09-05-owner-rulings-audit-e-queue.md`, was written at
this spec's `Ready` flip and before dispatch. It names this work package and
rules all five items below under the standing instruction, each with the cost of
overruling it; the owner may reverse any of them by dated amendment.

1. **The duplicate-heading refusal covers all THREE reads of a ledger, not only
   the candidate.** Recommendation: **yes** — measured on `8c52808f`, a committed
   ledger carrying `## a.b` twice (first section `true`, last `false`)
   **authorizes a Tier-3 skill-body revision today** (Table C row C18), because
   that read takes the last-wins collapse and never runs the schema loop.
   **Overrule cost:** the authorization path keeps trusting a last-wins collapse
   of a ledger nothing validated.
2. **Raise-only fires on an INVALID baseline value but NOT on an absent one.**
   Recommendation: **yes** — INVALID is a present-but-unreadable assertion and may
   not be lowered; an absent bullet is no assertion at all, and firing on it would
   permanently mark every legacy entry lacking the bullet as untrusted.
   **Overrule cost:** either direction opens a hole (Table C rows C21/C23).
3. **`parseFrontmatter`'s record gains a null prototype, restating five shipped
   assertions across three test identities.** Recommendation: **yes** — measured,
   a promotion adding `__proto__: injected` to a SKILL.md is **allowed with no
   qualifying learning today** while any other added key is refused (rows
   C29/C30). The cost is bounded and Current state measures it: of six
   `assert.deepEqual` calls on `parseFrontmatter`, five fail and are restated to
   the three observables in Implementation notes — not to a keys-only comparison,
   which would drop one assertion's value check. **Overrule cost:** ADR-0020's
   "ANY other frontmatter change requires learning authorization" stays false for
   one key name.
4. **Size class `M`, one package, rather than a chain of three `S` packages.**
   Recommendation: **M** — all five fixes edit `parseLedgerEntries`'s return shape
   and its three call sites in one file, so a split would serialise three design
   loops over one function, which is the archive predecessor's failure mode rather
   than its cure. **Overrule cost:** three sequential design gates on one file, two
   blocked on the first.
5. **`headEntries`' initialiser becomes `Object.create(null)` although measured
   behaviourally inert.** Recommendation: **include** — that change alone leaves
   the suite at `2630/2618/0/12` with every driver verdict byte-identical.
   **Overrule cost:** the same variable stays null-prototype in one branch and a
   plain object in the other, and its present safety is a coincidence
   (`new Set(he ? he.sessionIds : [])` collapses both branches to an empty set),
   so any future read of `he` silently reopens the chain lookup.

## Context (read this, nothing else)

Wienerdog installs files and starts nothing that outlives its job (ADR-0004) —
nothing here starts a process, opens a socket or emits telemetry. Its nightly
**dream run** lets a model write into the user's vault; every write is then judged
by code, and that code is the only thing between a prompt-injected model and the
user's identity notes.

One of the things a dream run may write is a **learnings ledger** — a
`05-Skills/<skill>/LEARNINGS.md` of `## <pattern-key>` sections, each carrying
`- Field: value` bullets. ADR-0020 gives it two jobs. It is *evidence*: a record
of a recurring pattern accumulated across sessions. And it is *authority*: a
committed ledger entry is what authorizes a **Tier-3 skill-body revision** — the
dream rewriting the body of a synthesized skill, the highest-trust write the
system permits. The bullet `- derived_from_untrusted: <value>` decides whether an
entry may authorize anything at all: only an entry that is *not*
untrusted-derived is promotable.

Two code paths read that bullet, and they are not the same path.

- The **keep/revert path** (`ledgerViolation`) validates a candidate
  `LEARNINGS.md` against a schema before it may be promoted into the vault.
- The **authorization path** (`skillBodyViolation`) reads the **committed**
  ledger to decide whether a SKILL.md body revision is allowed. **It never runs
  the schema loop.** Anything the schema would have caught is invisible here.

The parser feeding both paths has two defects, and a third that only the
authorization path can see. All three are DRIVEN in Table C, not argued. Fixing
them is the whole of this work package, and its deliverable is a **corpus**: a
table of hostile inputs, each with the verdict the validator must return,
complete against the *contract* rather than against a list of spellings. That
framing is inherited and load-bearing: this work package's archive predecessor
ran **twelve** review rounds without closing (24→15→16→9→10→6→9→7→9→4→6→7
findings), and what ended it was switching every gate to a **behavioural** check
— run the validator on a corpus row, observe the verdict — instead of checking
the shape of the source. Every gate here is behavioural. There is no new grep and
no new script.

## Current state

Measured on `8c52808f` (`origin/main`). Line numbers drift; each claim below names
the **construct** and quotes its current line, which is what to re-run at
dispatch. Baselines on that tree: `node tests/with-temp-root.js tests/run.js` →
`tests 2630 / pass 2618 / fail 0 / skipped 12`, exit 0; `npm run lint` → exit 0,
`0 error(s)` (its *file count* is not pinned — it grows with every markdown file
added, this spec and its rounds record included); `npm run red-proofs` →
`37 declared proof(s), 37 selected`, `RUN: PROVEN`, exit 0. `red-proofs` refuses
a symlinked `node_modules`, so it runs on a real checkout, not a docs worktree.

`src/core/frontmatter.js` is the ONE strict flat-frontmatter lexer (ADR-0022). It
already ships the three-state discipline this work package needs, but only at
**Map level** — the whole of `readBool`:

```js
function readBool(fields, key) {
  if (!fields.has(key)) return undefined;
  const raw = fields.get(key);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return INVALID;
}
```

Its `INVALID` sentinel is documented there as *"A security consumer treats
INVALID exactly like `true` — i.e. untrusted / fail closed."* `module.exports` is
currently `{ parse, coerceScalar, readBool, readNumber, INVALID }`.

`src/core/dream/validate.js` holds the ledger parser and both gates.
`parseLedgerEntries` is **module-private and mentioned in no other file in the
repository** (measured by a full `.js` sweep). Its collector and trust predicate:

```js
/** @type {Record<string, any>} */ const entries = {};
…
      entries[h[1]] = cur;
…
    else if (field === 'derived_from_untrusted') cur.untrusted = val === 'true';
```

The ledger does **not** run `coerceScalar`, so a quoted `"false"` and a
`false # comment` reach the predicate verbatim; `val` is `b[2].trim()`, so
surrounding whitespace is already gone. The three consumers of `entry.untrusted`:

```js
  if (typeof e.untrusted !== 'boolean') return 'missing/invalid derived_from_untrusted';   // schema check
      if (he.untrusted === true && ce.untrusted !== true) {                                // raise-only
    if (learning.untrusted !== false) return `authorizing learning ${key} is untrusted-derived (never promotable)`;
```

The pattern-key regex exists **twice**, and the two occurrences are byte-identical
(`/^[a-z0-9][a-z0-9.-]{0,63}$/`, measured — one inline in `skillBodyViolation`'s
`revision_pattern_key` check, one as `const PATTERN_KEY_RE`). `__proto__` does
**not** match it; `constructor` **does**, and it is the ONLY name on
`Object.prototype` that does (measured over `Object.getOwnPropertyNames`).

Two more plain-object records live in the same file: `parseFrontmatter`'s
`const data = {};` and `ledgerViolation`'s `let headEntries = {};`. The latter is
**not** overwritten unconditionally — it survives whenever `baselineLedgerBytes`
is absent.

ADR-0020 lists the ledger keep-conditions in prose spanning two source lines:
*"…every `##` entry validates against the schema; the diff is **append-only**
versus `HEAD`…"*. That claim is **false today** for the heading `__proto__`.

The harness that already drives both gates over hand-built inputs is the
`gates.ledger` / `gates.skillBody` adapter in `tests/unit/dream-validate.test.js`.
Six `assert.deepEqual` calls take a `parseFrontmatter` result, across **three**
test identities — `dream-validate: parseFrontmatter returns {} without a leading
block` (two calls) in that file, and in `tests/unit/frontmatter-unify.test.js`
`a no-separator-space line agrees with the spaced form on both consumers` (two)
and `validator semantics preserved: quoted booleans stay strings, absent block is
{}` (two). Measured on a scratch copy carrying the ruled design: **five of the six
calls fail, and exactly those three test identities**. The sixth survives because
it compares two `parseFrontmatter` results to *each other*, so both sides are
null-prototype.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | Table A row **A1** — add `boolFromRaw`, re-express `readBool` through it, export it. No other behaviour moves |
| modify | src/core/dream/validate.js | Table A rows **A1–A5 and A7** — the trust predicate, the three null-prototype records, the duplicate-heading rule with its return-shape change and all three call sites, the raise-only INVALID clause, the regex unification, and the bullet key match |
| modify | tests/unit/dream-validate.test.js | Table C, under the identities Table D names; plus the one shipped assertion Current state lists |
| modify | tests/unit/frontmatter-unify.test.js | The failing `deepEqual` calls Current state measures, repaired to the OBSERVABLES in Implementation notes — **not** by comparing keys, which would drop `:61`'s value check. Nothing else in this file changes |
| create | tests/red-proofs/ledger-parser-corpus.proofs.json | Table D — seven declarations, `suite` = `tests/unit/dream-validate.test.js` |
| modify | docs/adr/0020-skill-revision-lifecycle.md | Table A row **A6** — append the amendment verbatim from "Exact contracts". Nothing above it is edited |

### Exact contracts

**The shared value-level reader** (`src/core/frontmatter.js`). `readBool` becomes
a one-line wrapper over it and its observable behaviour does not move — the
shipped `readBool` tests stay byte-unmodified and green.

```js
/** VALUE-LEVEL three-state boolean reader — the single place a stored scalar
 *  acquires boolean meaning. `readBool(fields, key)` is this over a Map lookup.
 *  @param {string|undefined} raw
 *  @returns {true|false|undefined|typeof INVALID}
 *    undefined = no value; false/true = exactly `false`/`true`; INVALID = anything else. */
function boolFromRaw(raw)
```

The export becomes `{ parse, coerceScalar, readBool, boolFromRaw, readNumber, INVALID }`.
`src/core/dream/validate.js` imports `boolFromRaw` **and** `INVALID` from it.

**The bullet key match** (`parseLedgerEntries`, Table A row **A7**). Deciding
that a line names a field must not depend on `.` consuming the rest of it. Match
the key prefix; the raw value is the remainder of the LF-delimited line, trimmed:

```text
line  "- derived_from_untrusted: <anything, including CR / U+2028 / U+2029>"
key    the `[A-Za-z_-]+` before the first `:`   → the field
value  the rest of that line, trimmed           → A1's three-state reader
```

**The parser's return shape** (`parseLedgerEntries`). It returns
`{entries, duplicateKeys}` — `entries` a null-prototype record keyed by heading
text, `duplicateKeys` the heading texts seen more than once, in first-repeat
order. All three call sites move with it; there is no consumer outside this file.

**The three refusal reasons this work package introduces**, verbatim — the first
two from `ledgerViolation`, the third from `skillBodyViolation`:

```text
learnings ledger has a repeated entry heading (<key>); each ## heading must appear once
learnings ledger's committed version has a repeated entry heading (<key>); the append-only history cannot be compared (fail closed)
skill change needs a qualifying learning but the committed ledger has a repeated entry heading (fail closed)
```

Every other refusal reason in Table C is a **shipped** string reached by new
inputs; none is reworded.

**The ADR-0020 amendment** (Table A row A6). The file has no `## Amendments`
section and does not gain one: it already carries
`## Revision (2026-07-12): adversarial-review hardening`, and this block is
inserted verbatim **immediately after that section ends and immediately before
`## Future work (parked, not specced)`**, so the revision history stays
contiguous and parked work stays last.

```markdown
## Amendment (2026-09-05): ledger-parser correctness (WP-audit-e-ledger-parser-corpus)

Three additive corrections to the ledger keep-conditions above. Nothing above
this amendment is edited; it stands as the historical record.

(a) The keep-condition "every `##` entry validates against the schema" was
    FALSE for the heading `__proto__`, which set the collector's prototype
    instead of becoming a key and was therefore skipped by every schema and
    history loop. It is true as of this work package.
(b) `derived_from_untrusted` is honoured only as the exact literals `true` and
    `false`. Any other value — a case variant, a quoted form, a number, an
    empty value — is a schema violation on the keep/revert path, and is treated
    as untrusted (fail closed) on the authorization path and by the raise-only
    comparison.
(c) A repeated `##` heading is a schema violation and a refusal reason at ALL
    THREE reads of a ledger: the candidate, the committed baseline used for the
    append-only comparison, and the committed read on the authorization path,
    which never runs the schema loop.
```

## Contract reference

The ADR-0031 trigger fires on four of the seven tests: (iii) structured input
parsing and schema acceptance change; (iv) error / reason-code behaviour changes;
(v) the work crosses an authority boundary — the dream *records* the trust flag,
the Tier-3 gate *interprets* it; (vii) the same contract appears on mirrored
surfaces. Four tables follow; the operative prose cites them and never restates
them.

### Table A — canonical: the five fixes

| id | Fix | Rule |
|----|-----|-----|
| **A1** | Trust is granted only by the exact literal `false` | `derived_from_untrusted`'s value goes through `boolFromRaw` (Exact contracts): `'true'`→`true`, `'false'`→`false`, **anything else**→`INVALID`. An absent bullet is untouched by this and keeps its `null` initialiser, so the two states stay distinguishable and today's correct absent-field behaviour is pinned rather than changed (Table B). **Do not lowercase, trim further, or coerce a value into acceptance** — accepting `TRUE` as `true` would be a second, opposite defect |
| **A2** | Every heading-keyed record is null-prototype | `parseLedgerEntries`' collector, `ledgerViolation`'s `headEntries` initialiser and `parseFrontmatter`'s record all become `Object.create(null)`. **Do not add a `__proto__` check by name** — the fix is the construction, and routing the heading into the existing `PATTERN_KEY_RE` is what makes it general. **Do not add `Object.hasOwn` guards** at `cur[key]` / `headEntries[key]`: a null prototype removes the chain those lookups traverse, so a guard would be redundant machinery |
| **A3** | A repeated `##` heading refuses, at all three reads | `parseLedgerEntries` reports `duplicateKeys`; the candidate read, the committed-baseline read and the authorization read each refuse on a non-empty list, with the three reasons in Exact contracts. Rejected alternative: a *warn*. The gates' entire vocabulary is one refusal string, so a warn channel is new machinery — and a silent last-wins overwrite destroys exactly the data the append-only and raise-only comparisons depend on. Detection is on the **NORMALISED heading key** — what `/^##\s+(.+?)\s*$/` captures — never on the raw line, so two headings differing only in trailing whitespace are one key and therefore a repeat. The contract is therefore **"detection on the key the parser CAPTURED"**, and row C40 witnesses it by quantifying over ECMAScript `\s` itself rather than over hand-picked members — four members let a detector strip exactly those four and authorize for the other twenty (measured). **The detector's shape is the implementer's** — lookup-based and Set-based both conform (Table D). Last-wins **field** semantics inside one section are unchanged and out of scope |
| **A4** | Raise-only fails closed on an INVALID committed value | The comparison fires when the baseline entry's value is `true` **or** `INVALID`; an absent (`null`) baseline value is unchanged (owner item 2) |
| **A5** | One pattern-key regex | `skillBodyViolation`'s inline literal becomes `PATTERN_KEY_RE`. The declaration stays where it is: the inline use sits in a function body evaluated long after module initialisation, so no hoisting problem exists. The property that matters is behavioural, and Table C row C28 pins it — the two sites accept exactly the same key set |
| **A7** | A bullet that NAMES a field is never read as ABSENT | The key match must not depend on `.` consuming the rest of the line: `.` never matches CR, U+2028 or U+2029, so an anchored `(.*)$` made a bullet that names the field read as **absent**, and absent is what A4 exempts. Match the key prefix only; the raw value is the remainder of the LF-delimited line, trimmed, and it goes to A1's reader — so an unparseable value is **INVALID**, never absent. **The widening is exactly this and no more** (measured): the only lines the shipped anchored form rejects and this one accepts are lines whose value contains CR, U+2028 or U+2029. One visible consequence, deliberate and rowed (C39): an otherwise-valid CRLF ledger now validates instead of being refused, which is the shipped `src/core/frontmatter.js` CRLF tolerance applied to the ledger rather than a new leniency |
| **A6** | ADR-0020 gains one additive amendment | The verbatim text in Exact contracts, appended. Rows A1–A3 are what make its three clauses true; it ships *with* them, never ahead of them |

### Table B — canonical: `entry.untrusted`'s four states, and what each consumer does

The rule under it, stated once: **INVALID is treated exactly like `true` at every
security consumer** — which is `src/core/frontmatter.js`'s own shipped stance for
the sentinel, applied here rather than re-decided.

| `entry.untrusted` | Reached by | Schema check (candidate) | Raise-only (baseline vs candidate) | Authorization (committed) |
|---|---|---|---|---|
| `null` | the bullet is absent | **refuse** `missing/invalid derived_from_untrusted` (unchanged) | no constraint (unchanged) | **refuse** `…is untrusted-derived (never promotable)` (unchanged) |
| `true` | exactly `true` | pass | candidate must be `true` (unchanged) | **refuse** `…is untrusted-derived (never promotable)` (unchanged) |
| `false` | exactly `false` (after the bullet's own trim) | pass | no constraint (unchanged) | **authorize** (unchanged) |
| `INVALID` | the bullet is present and its value, after the trim in Table C's class rule, is neither literal — **including a value the shipped anchored regex could not capture at all** (CR / U+2028 / U+2029; **A7**) | **refuse** `missing/invalid derived_from_untrusted` (**new reach, no new code** — `typeof INVALID !== 'boolean'`) | candidate must be `true` (**A4**) | **refuse** `…is untrusted-derived (never promotable)` (**new reach, no new code** — `INVALID !== false`) |

Considered and dropped, so a re-proposal routes as a scope objection rather than
reopening the design. A **distinct refusal message** for INVALID on the
authorization path: it buys one branch and one more RED proof to say "malformed"
where the shipped string already says the operative thing, while the keep/revert
path already emits the precise diagnostic. And **mapping non-exact values to
`null`** (the archive predecessor's choice): it collapses "bullet absent" into
"bullet unreadable", making the first and fourth rows above indistinguishable.

### Table C — canonical: the corpus

**Every verdict below was MEASURED** — on `8c52808f` for the "today" column, and
on a `git archive` scratch copy carrying the ruled design for the "REQUIRED"
column. Neither is a prediction. Test design is the implementer's: what is
contract here is the input, the path and the verdict.

*Path* — **K** = the keep/revert path, `gates.ledger(…)` on a candidate
`05-Skills/foo/LEARNINGS.md`; **A** = the authorization path,
`gates.skillBody(…)` on a Tier-3 SKILL.md **body** revision whose
`revision_pattern_key` names the entry, with the row's ledger as
`baselineLedgerBytes`. `keep` / `authorize` means the gate returned no reason.
Rows C1–C16 and C31–C38 vary ONE thing: the `- derived_from_untrusted:`
bullet of an otherwise-valid entry keyed `a.b`.

**The class rule — this is what makes the table complete against the contract,
and the rows below are WITNESSES of its classes, not an enumeration of
spellings.** The bullet's raw value is the remainder of its LF-delimited line
(**A7**), trimmed. `String.prototype.trim` removes ECMAScript *WhiteSpace* and
*LineTerminator*, so ASCII space, TAB, NBSP (U+00A0), BOM (U+FEFF), U+2028 and
U+2029 **padding** all normalise away. What survives is `true`, `false`, or
INVALID: there is **no case folding, no quote stripping, no comment stripping, no
YAML type coercion, no Unicode normalisation and no homoglyph folding**, so every
other spelling is INVALID. The classes the rows witness are exactly: exact
literal (C1–C4), padding-normalises (C5), case variant (C6–C9), quoted (C10),
comment (C11), YAML-ish word (C12, C31), YAML null (C32), YAML tag (C33), homoglyph
(C34), interior invisible character (C35), numeric (C13), empty (C14),
unparseable line (C36–C38), and absent (C15/C16) — which is not the same state
(Table B).

| id | Input | Path | Today (`8c52808f`) | REQUIRED |
|----|-------|------|--------------------|----------|
| C1 | `true` | K | keep | keep |
| C2 | `true` | A | refuse `authorizing learning a.b is untrusted-derived (never promotable)` | unchanged |
| C3 | `false` | K | keep | keep |
| C4 | `false` | A | authorize | authorize |
| C5 | the PADDING class: `false` padded with ASCII space, TAB, NBSP (U+00A0) or BOM (U+FEFF) — measured, all four | K | keep | keep — padding normalises to the exact literal (class rule); this is not a new leniency and not INVALID |
| C6 | `False` | K | **keep** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` |
| C7 | `False` | A | **authorize** | refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C8 | `TRUE` | K | **keep** | refuse (as C6) |
| C9 | `TRUE` | A | **authorize** — a ledger that literally says TRUE authorizes a Tier-3 body revision | refuse (as C7) |
| C10 | `"false"` (quoted) | K | **keep** | refuse (as C6) — the ledger runs no `coerceScalar` |
| C11 | the COMMENT class: `false # ok` and `false‹tab›# ok` — measured, both | K | **keep** | refuse (as C6) — the ledger strips no inline comment, unlike frontmatter's `coerceScalar` |
| C12 | `yes` | K / A | **keep** / **authorize** | refuse (as C6) / refuse (as C7) |
| C13 | `1` | K / A | **keep** / **authorize** | refuse (as C6) / refuse (as C7) |
| C14 | empty value | K / A | **keep** / **authorize** | refuse (as C6) / refuse (as C7) |
| C15 | bullet ABSENT | K | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` | **unchanged — regression pin, do not "fix"** |
| C16 | bullet ABSENT | A | refuse `authorizing learning a.b is untrusted-derived (never promotable)` | **unchanged — regression pin** |
| C17 | `## a.b`(true), `## c.d`, `## a.b`(false) — a non-adjacent duplicate, as the candidate | K | **keep** | refuse `learnings ledger has a repeated entry heading (a.b); each ## heading must appear once` |
| C18 | the same ledger as the COMMITTED baseline | A | **authorize** | refuse `skill change needs a qualifying learning but the committed ledger has a repeated entry heading (fail closed)` |
| C19 | the same ledger as the committed baseline, candidate carrying **both** `a.b` and `c.d` so the ONLY complaint can be the baseline duplicate | K | **keep** — a committed ledger whose shadowed first section is invisible passes the append-only comparison unnoticed | refuse `learnings ledger's committed version has a repeated entry heading (a.b); the append-only history cannot be compared (fail closed)` |
| C20 | a clean baseline and a clean candidate | K | keep | keep — the green control for C17–C19 |
| C21 | baseline `False`, candidate `false` | K | **keep** | refuse `learnings ledger lowered derived_from_untrusted of a.b (raise-only)` |
| C22 | baseline `False`, candidate `true` | K | keep | keep — the green control for C21 |
| C23 | baseline bullet ABSENT, candidate `false` | K | keep | **unchanged** (owner item 2) |
| C24 | `## __proto__` alone | K | refuse `learnings ledger has no valid entries` | refuse `learnings ledger entry __proto__: Pattern-Key heading is not a valid area.symptom slug` |
| C25 | `## __proto__` plus one valid entry | K | **keep — the `__proto__` entry is invisible to every loop** | refuse (as C24) |
| C26 | `## constructor`, a fully valid entry | K / A | keep / authorize | unchanged — `constructor` is the only `Object.prototype` name the pattern-key regex admits, and a valid entry may legitimately be called that |
| C27 | baseline `## constructor` + `## a.b`; candidate deleted `constructor` | K | refuse `learnings ledger changed First-Seen of constructor (immutable)` — the append-only check was skipped and the next comparison refused by accident | refuse `learnings ledger deleted an existing entry (constructor); ledger is append-only` |
| C28 | one shared sample of **heading-shaped** keys, at both pattern-key sites: the `##` heading check and `revision_pattern_key` (`a.b`, `a`, `0`, `a-b`, `a.b-c.d`, `A.b`, `_x`, `__proto__`, `constructor`, `toString`, `.a`, `-a`, `a b`, `a/b`, `a..b`, 64×`z`, 65×`z`, `a#b`, `a:b` — the empty key is excluded because `^##\s+(.+?)\s*$` never forms a heading from it) | K + A | **1 disagreement** — `__proto__` is refused as a `revision_pattern_key` but accepted as a heading, because the heading never becomes a key | 0 disagreements (**A5**). **Assert each key's exact verdict, not the agreement count alone** — Table D's LPC-B moves individual verdicts, and an agreement-only assertion cannot see that |
| C29 | promotion `incubating`→`active` adding `tags: injected` | A | refuse `skill change needs a qualifying learning but has no valid revision_pattern_key` | unchanged — the green control for C30 |
| C30 | promotion `incubating`→`active` adding `__proto__: injected` | A | **allowed with no qualifying learning** | refuse (as C29) |
| C31 | the YAML-ISH WORD class: `on`, `off` (`yes` is C12) | K / A | **keep** / **authorize** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` / refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C32 | the YAML NULL class: `~`, `null` | K / A | **keep** / **authorize** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` / refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C33 | the YAML TAG class: `!!bool false` | K / A | **keep** / **authorize** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` / refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C34 | the HOMOGLYPH class: fullwidth `ｆａｌｓｅ` (U+FF46 U+FF41 U+FF4C U+FF53 U+FF45) | K / A | **keep** / **authorize** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` / refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C35 | the INTERIOR-INVISIBLE class: `fal​se` with U+200B, which is NOT trimmable whitespace | K / A | **keep** / **authorize** | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` / refuse `authorizing learning a.b is untrusted-derived (never promotable)` |
| C36 | the UNPARSEABLE-LINE class as the CANDIDATE: the value contains CR, U+2028 or U+2029 (`fal se`) — measured, all three | K | refuse `learnings ledger entry a.b: missing/invalid derived_from_untrusted` | **unchanged — regression pin.** The schema check already refuses; the hole is C37, not here |
| C37 | the same three values on the **committed baseline**, with the candidate saying `false` | K | **keep — and the round-ZERO design kept it too**: the bullet is skipped, the field reads ABSENT, and A4 exempts absent, so the malformed assertion is laundered into `false`, and the laundered ledger authorizes on a later run | refuse `learnings ledger lowered derived_from_untrusted of a.b (raise-only)` (**A7** makes it INVALID, so **A4** fires) — measured for all three characters |
| C38 | the same three values on the **committed** ledger | A | refuse `authorizing learning a.b is untrusted-derived (never promotable)` | **unchanged — regression pin.** `null !== false` already refuses; A7 changes the state, not the verdict |
| C39 | a whole ledger with CRLF line endings, otherwise valid | K | refuse `learnings ledger entry a.b: Pattern-Key bullet does not match the heading` — every bullet is skipped, so the entry is empty | **keep** — **A7**'s one deliberate widening: a trailing CR is padding under the class rule, which is `src/core/frontmatter.js`'s shipped CRLF tolerance applied to the ledger |
| C40 | **GENERATED MATRIX, not hand-picked members.** For **every** non-LF code point matched by ECMAScript `\s`, the ledger `## a.b` / `## c.d` / `## a.b‹cp›` — a non-adjacent repeat differing only by that trailing code point — on **all three reads**. The generator IS the definition and is a one-line probe: `\s` minus LF enumerates **24** code points, measured `U+0009 U+000B U+000C U+000D U+0020 U+00A0 U+1680 U+2000`–`U+200A U+2028 U+2029 U+202F U+205F U+3000 U+FEFF`. Asserted under **three identities, one per read**, so Table D's LPC-D and LPC-E stay distinguishable | K + A | **keep / authorize for all 24** | the exact refusal for that read — candidate `learnings ledger has a repeated entry heading (a.b); each ## heading must appear once`; committed-baseline `learnings ledger's committed version has a repeated entry heading (a.b); the append-only history cannot be compared (fail closed)`; authorization `skill change needs a qualifying learning but the committed ledger has a repeated entry heading (fail closed)`. Measured: all 24 × all three |
| C41 | whitespace **INSIDE** a heading rather than trailing: `## a‹U+00A0›b`. The capture keeps it, so the key is `a b` — not a duplicate of anything, and not stripped | K | refuse `learnings ledger entry a b: Pattern-Key heading is not a valid area.symptom slug` | unchanged — the boundary control for C40: C40 quantifies over TRAILING code points, and this is what makes "trailing" load-bearing |
| C42 | a Unicode-bearing hostile heading that is NOT whitespace: fullwidth `## ａ.ｂ`, and `## a‹U+200B›b` (U+200B is not matched by `\s`) | K | refuse `learnings ledger entry <key>: Pattern-Key heading is not a valid area.symptom slug` | unchanged — the witness that the pattern-key regex, not a character allowlist, is what decides a Unicode heading |
| C43 | `## prototype`, a fully valid entry | K / A | keep / authorize | unchanged — the green control for the inherited-name class: `prototype` is not an own property of `Object.prototype`, so it was never hazardous. Measured over `Object.getOwnPropertyNames(Object.prototype)`, `constructor` is still the only admitted name that is |

### Table D — canonical: the RED proofs

`scripts/red-proofs.js` requires the observed own-body failing set to EQUAL each
declaration's `expectRed`. **`expectRed` is MEASURED after implementation, never
predicted**; a mutation whose observed set exceeds its declaration is restated,
never widened into. Each declaration's `find` / `replace` pair is the shipped
form and the ruled form of the same construct, and both are already given — in
Current state and in Table A. `suite` is `tests/unit/dream-validate.test.js`.

Three rules govern this table, and all three were learned by running it.

**1. Every corpus row asserts its EXACT refusal string, never merely "refused".**
LPC-B leaves rows C24/C25/C27 *refusing*, with a different reason — a row
asserting only that something was refused stays green, and `evaluateRed` then
rejects the declaration as non-discriminating.

**2. TOTAL REACH and SELECTED WITNESSES are different things, and only the second
is declared.** A mutation's total reach is what it actually reddens; some of that
is unstable across implementations this spec deliberately leaves open, and some
belongs to a different mutation's contract. `evaluateRed` demands exact equality
against everything that RAN, so *omitting* an unstable row from `expectRed` does
not help — the runner still sees it fail and rejects the declaration with
"failed in its OWN BODY but is not declared". The facility that does work is
`testNamePattern`, which `scripts/red-proofs.js` passes to **BASELINE, RED and
CONTROL alike**: an identity the pattern does not select never runs in any phase,
so it can neither fail undeclared nor be missed in the baseline. **Each
declaration therefore carries a `testNamePattern` selecting exactly its declared
witnesses**, and this table records both columns so the difference is visible
rather than inferred. Two constraints follow, and the implementer needs both:
every declared identity MUST be selected by its own pattern (BASELINE requires
each to RUN and PASS), and **each corpus row needs an individually selectable
test identity** — a stable per-row tag in the title — or a pattern cannot scope
to it.

**3. A SELECTED witness must be stable across CONFORMING implementations.**
Measured on three conforming duplicate detectors — lookup (`entries[key] !==
undefined`), Set, and array `indexOf` — which agree on every corpus row when the
collector is null-prototype.

| id | Reverts | TOTAL REACH (measured; may vary by conforming implementation) | SELECTED WITNESSES (declared, graded by `evaluateRed`) |
|----|---------|------------------------------------------------------------|-------------------------------------------------------|
| **LPC-A** | the trust predicate, back to `cur.untrusted = val === 'true'` | C6–C14, C31–C35, **C21, C36, C37, C38** — reverting it makes INVALID unreachable everywhere, which reaches the raise-only and unparseable-line rows too | C6–C14, C31–C35 |
| **LPC-B** | `parseLedgerEntries`' collector, back to `{}` | C24, C25, C27, C28 under all three detectors; **C26 additionally under the lookup detector only** — a first-and-only `## constructor` is misreported as a repeat | C24, C25, C27, C28 |
| **LPC-C** | `parseFrontmatter`'s record, back to `{}` | C30 | C30 |
| **LPC-D** | the duplicate-heading refusal at the candidate read only | C17, C40's candidate-read identity | C17, C40 (candidate read) |
| **LPC-E** | the duplicate-heading refusal at the two committed-baseline reads only | C18, C19, C40's other two read identities | C18, C19, C40 (committed-baseline and authorization reads) |
| **LPC-F** | the raise-only `INVALID` clause, back to `he.untrusted === true` | C21, **C37** | C21 |
| **LPC-G** | the bullet key match, back to the shipped anchored `/^-\s*([A-Za-z_-]+):\s*(.*)$/` (**A7**) | C37, C39 | C37, C39 |

C36 and C38 appear in no SELECTED column: they already refuse on the shipped
tree, which makes them regression pins rather than proofs. The green controls
(C5, C20, C22, C23, C26, C29, C41, C42, C43) are green on the compliant design
and nothing selects them. **C39 is not among them** — it is green on the
compliant design and intentionally RED under LPC-G, which is what makes it a
witness rather than a control.

Two ruled changes carry **no** declaration, stated rather than omitted.
`headEntries`' initialiser (A2) is measured behaviourally inert, so no mutation of
it can redden anything. Reverting the regex unification (A5) changes no verdict
either — the two literals are byte-identical today — so C28 guards only against
future divergence, which is the only thing it can guard.

### Mirrored Surface Checklist

- **Table A** — Deliverables rows for `src/core/frontmatter.js`,
  `src/core/dream/validate.js` and `docs/adr/0020-*.md`; "Exact contracts"
  (`boolFromRaw`, the bullet key match, the return shape, the three reasons, the
  amendment text); acceptance criteria 1–6, 2b and 3b (A4 lands in criterion 1 via
  Table C row C21; A7 in criterion 2b); Current state's quoted constructs; Out of
  scope's "do not add" list.
- **Table B** — Table A rows A1, A4 and A7; Table C's class rule; Table C rows
  C1–C16, C21–C23 and C31–C38; acceptance criterion 1; the amendment's clause (b).
- **Table C** — the class rule that closes it (in its own preamble, which is the
  surface that owns it); acceptance criteria 1–5, 2b and 3b; Table D's reddening
  column; verification step 1; Dispatch-precondition items 1–3.
- **The three `parseFrontmatter` observables** (Implementation notes owns them) —
  Current state's measured six-calls/five-failures/three-identities split; the
  `tests/unit/frontmatter-unify.test.js` Deliverables cell; acceptance criterion
  3b; **Dispatch-precondition item 3**, which round 1 found stale precisely
  because it was an unregistered mirror.
- **Table D** — the Deliverables row creating
  `tests/red-proofs/ledger-parser-corpus.proofs.json`; acceptance criterion 7 (its
  proof count, the `testNamePattern` selection contract, and the 37 → 44 total);
  verification step 3; Table C row C28's "assert the exact verdict" clause and row
  C40's three-identities-one-per-read clause, both of which Table D depends on;
  acceptance criterion 1's per-row selectable-identity requirement.
- **The green-control list** (Table D owns it) — acceptance criterion 1. C39 is
  deliberately NOT on it: green on the compliant design, red under LPC-G.

## Implementation notes & constraints

- Zero new npm dependencies; plain Node ≥ 18; JSDoc types only; no build step.
- `parseLedgerEntries`' return shape changes — move all three call sites in the
  same commit; there is no consumer outside `src/core/dream/validate.js`.
- **A null-prototype record is not `deepEqual` to `{}`.** That is A2's whole cost
  on the test side, and Current state measures it exactly. **What must stay true
  is the OBSERVABLE, not any particular repair** — a keys-only rewrite is a trap:
  at `frontmatter-unify.test.js:61` the assertion is about a VALUE, and comparing
  keys alone would accept `{k: 'wrong'}`. The three observables to preserve:
  (i) a document with no frontmatter block, and one with an unclosed block, yield
  a record with **zero own keys**; (ii) the no-separator-space document
  (`---\nk:v\n---`) yields a record whose own keys are exactly `['k']` **with
  `k === 'v'`**; (iii) the spaced and unspaced forms remain **deeply equivalent**
  to each other — that assertion needs no repair at all (both sides are
  null-prototype) and must not be weakened by one. Change nothing else in
  `tests/unit/frontmatter-unify.test.js`.
- The ledger deliberately runs no `coerceScalar` (rows C10, C11). If you find
  yourself adding it so a quoted value passes, stop — that is the opposite of A1.
- `Object.create(null)` records are safe under `Object.entries` and `Object.keys`,
  which is every way this file iterates them.
- Ambiguity → take the simpler option and record it under "Decisions made" in the
  PR body. Do not expand scope to resolve it.

## Security checklist

The untrusted input here is ledger text a model wrote, and the identifiers it
carries (`##` heading text, `Pattern-Key`, `Session-IDs`) are compared and
pattern-matched — **none of them reaches a filesystem path or a shell command**,
so the template's anchored-pattern item is `N/A — no untrusted identifier in this
work package flows into a path or a command`. The discipline that does apply, and
that Table B states as its rule: an unreadable value is treated as the unsafe
value at every security consumer, never as the safe one and never silently.

## Acceptance criteria

- [ ] 1. Every Table C row's REQUIRED verdict is observed by running the gate its
      Path column names — including the `unchanged` regression pins (C15, C16,
      C36, C38) and the green controls (C5, C20, C22, C23, C26, C29, C41, C42, C43).
      Each refusing row asserts its **exact** reason string (Table D), and each row carries an individually selectable test identity so Table D's patterns can scope to it.
- [ ] 2. `parseLedgerEntries` returns `{entries, duplicateKeys}`, and all three
      call sites refuse on a non-empty `duplicateKeys` with the reasons in Exact
      contracts. Duplicates are decided on the key the parser CAPTURED (A3),
      witnessed by row C40's generated matrix over all 24 non-LF code points matched by `\s` × all three reads; the detector's shape is not constrained.
- [ ] 2b. A bullet naming a field is consumed as that field whatever follows the
      colon (**A7**), so an unparseable value is INVALID and never absent — rows
      C36–C38, with C39 as the one deliberate widening.
- [ ] 3. `src/core/frontmatter.js` exports `boolFromRaw`, and `readBool`'s shipped
      tests are byte-unmodified and green.
- [ ] 3b. The three `parseFrontmatter` observables in Implementation notes hold:
      zero own keys for a missing/unclosed block; exactly `['k']` **with value
      `'v'`** for the no-separator document; spaced and unspaced deeply
      equivalent.
- [ ] 4. The three heading-keyed records of Table A row A2 are built with
      `Object.create(null)`, and no `__proto__`-by-name check and no
      `Object.hasOwn` guard was added.
- [ ] 5. `skillBodyViolation` uses `PATTERN_KEY_RE`, so the literal
      `/^[a-z0-9][a-z0-9.-]{0,63}$/` occurs exactly once in
      `src/core/dream/validate.js` (a review check on the finished diff, not a
      shipped gate — C28 is the behavioural criterion).
- [ ] 6. `docs/adr/0020-skill-revision-lifecycle.md` carries the amendment
      verbatim, and nothing above it changed.
- [ ] 7. `tests/red-proofs/ledger-parser-corpus.proofs.json` declares Table D's
      **seven** proofs, each carrying a `testNamePattern` that selects exactly its
      SELECTED WITNESSES column and nothing else, and `npm run red-proofs` reports
      every one PROVEN with the totals rising from 37 to 44.
- [ ] 8. Idempotence: `N/A — this work package ships no command and writes nothing
      outside the repository.`

## Verification steps (run these; paste output in the PR)

No new gate, script or grep is introduced, so there is no new verification step
to prove in three states. All three commands below are shipped and were run on
the pinned base; their baselines are quoted in Current state.

```bash
node tests/with-temp-root.js tests/run.js   # expect fail 0; the total rises from 2630
npm run lint                                # expect exit 0
npm run red-proofs                          # expect 44 declared, 44 selected, RUN: PROVEN
```

## Out of scope (do NOT do these)

- Anything under `src/gws/`, `src/cli/gws-broker.js` or
  `src/core/runtime-profile.js` — the live `WP-audit-d-code-derived-recipients`
  design loop owns those files.
- Any other change to `src/core/dream/validate.js`: the quarantine and
  preservation machinery, the secret gate, the invocation-window trust
  derivation. Sequential by rule — nothing else touching this file runs
  concurrently with this package.
- Duplicate **field bullets** inside one section: last-wins stays (Table A row A3).
- Whether a well-formed entry is *honest*. The schema checks shape, never truth;
  session-binding is ADR-0020's invocation-window derivation, already shipped.
- Ledgers a user hand-writes outside a dream run: they are not validated at all,
  and that is unchanged.
- Adding `coerceScalar` to the ledger, a `__proto__`-by-name check, `Object.hasOwn`
  guards, a warn channel, a distinct authorization-path INVALID message, or any
  source-shape grep gate. Each was considered and rejected with its reason in
  Table A, Table B or Table D.
- Narrowing **A7** to `derived_from_untrusted` alone, or constraining the
  duplicate detector's shape (**A3**). Both were considered: A7's widening is
  measured and bounded to exactly three characters with one rowed consequence
  (C39), and a special-cased field would be a second parsing rule for no measured
  gain; A3 is stated as an observable precisely so two conforming detectors both
  pass (Table D).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(dream): ledger-parser correctness and hostile corpus (WP-audit-e-ledger-parser-corpus)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
