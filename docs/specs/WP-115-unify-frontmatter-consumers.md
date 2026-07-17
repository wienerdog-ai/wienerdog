---
id: WP-115
title: Unify the validator + config frontmatter consumers onto the shared strict parser (audit A4)
status: In-Review
model: opus
size: M
depends_on: [WP-114]
adrs: [ADR-0004, ADR-0022]
branch: wp/115-unify-frontmatter-consumers
---

# WP-115: Unify the validator + config frontmatter consumers onto the shared strict parser (audit A4)

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004): a memory **vault**, skills, hooks, scheduled
jobs. No daemons, no telemetry.

The 2026-07-15 security audit action **A4** requires that the **digest**, the dream
**validator**, and the **config** reader all read `key: value` frontmatter/scalars
through **one** lexer, so a byte sequence accepted as trusted at commit is never
interpreted differently downstream. WP-114 shipped that lexer —
`src/core/frontmatter.js` (`parse`, `readBool`, `readNumber`, `INVALID`) — and
migrated the digest's trust gate onto it, closing a fail-open. But **four** ad-hoc
copies still exist (two known at first scoping, two more surfaced by the grep gate
mid-implementation — see the spec-gap note below):

- `src/core/dream/validate.js` `parseFrontmatter` — its own `---…---` block
  splitter, key-line regex, and quote/boolean/`#`-comment coercion, used by
  `tier3Decision`, `skillBodyViolation`, `ledgerViolation`, and the new-skill
  registry read.
- `src/core/dream/config.js` `readScalar` — a delimiter-free top-level `key: value`
  reader for `config.yaml`, with the same quote + space-`#`-comment coercion.
- `src/core/dream/validate.js` `skillBody` — a body-only `---` splitter (same
  semantics as `parse().body`).
- `src/core/layout.js` `cleanValue` — a third copy of the quote + space-`#`-comment
  coercion, for vault-layout scalar values.

This WP is a **structural de-duplication with no observable behavior change for any
well-formed value**: it routes all four consumers through `frontmatter.js` so there
is exactly one place that lexes a `key: value` line, one place that coerces a scalar
value, and one place that splits a `---` block body. It changes no gate, threshold,
or output — with ONE intentional, owner-accepted exception: `config`/`layout` reading
a *malformed* quote-opened-plus-trailing-comment value (`"…" # c`) now follows the
validator's quote-first coercion order, because the three old copies genuinely
disagreed on ordering and unification must pick one (see contract 3b). The full
existing suite (889/0 at amendment time) staying green IS the acceptance signal.

## Current state

> **Implementation-discovered spec gap (2026-07-17).** Mid-implementation, the
> security-checklist grep gate turned up **two** duplicate-parser copies the
> original scope missed: `src/core/layout.js` `cleanValue` (a THIRD copy of the
> quote-pair + space-`#`-comment coercion — its own comment even says "same rules as
> dream/config.js readScalar"), and `src/core/dream/validate.js` `skillBody` (a
> body-only `---` splitter the grep's `lines[0] !== '---'` clause hits). Both are now
> in scope by trivial, behavior-identical delegation (owner in the loop) — recorded
> here rather than absorbed as silent scope growth. The rest of the WP was already
> complete and green (coerceScalar shipped; validator + config delegated; unify test
> passing; full suite 889/0) before this amendment.

**`src/core/frontmatter.js`** (from WP-114) exports `parse(text) →
{delimited, malformed, fields:Map<string,string>, body}` where `fields` holds RAW
verbatim values (no quote/comment stripping), plus `readBool`/`readNumber`/
`INVALID`. It has **no** scalar-coercion helper yet.

**`src/core/dream/validate.js`** `parseFrontmatter(fileText)` →
`Record<string,string|boolean>`: splits `---…---`, matches
`^([A-Za-z0-9_-]+):\s*(.*)$` on un-indented lines, ignores blank/`#`-only/indented
lines, keeps **last** value on a duplicate key, then per value: if surrounded by a
single quote pair → strip quotes → string; else strip a space-`#` inline comment, then
coerce exact `true`/`false` → boolean, otherwise trimmed string. (See lines
142–185 of the current file.) The same file's `skillBody(text)` (~line 224) is a
body-only `---` splitter — `lines[0] !== '---'` → whole text; delimited → text after
the closing `---` — whose semantics are **exactly** `parse(String(text)).body`; it is
now in scope for a one-line delegation. `parseLedgerEntries` and `parseSessionArray`
(LEARNINGS ledger / session arrays) remain **out of scope** — different grammars.

**`src/core/dream/config.js`** `readScalar(body, key)`: scans un-indented lines for
`^([A-Za-z0-9_]+):\s*(.*)$`, matches `key`, then for an unquoted value strips a
space-`#` inline comment and strips a single surrounding quote pair. No `---`
delimiters (config.yaml is a bare scalar document, not frontmatter).

**`src/core/layout.js`** `cleanValue(raw)` (~line 49, NOT exported): the THIRD copy
of the scalar coercion — `raw.trim()`, then (unquoted only) strip a space-`#`
comment, then strip one surrounding quote pair. It coerces vault-layout scalar
values read by `readVaultLayout` (line 125: `const value = cleanValue(match[2])`).
Its algorithm is the same as `coerceScalar`; delegating is a behavior-identical dedup
(see the one ordering nuance in the contract below).

Tests: `tests/unit/dream-validate.test.js`, `tests/unit/dream-config.test.js` (if
present), and every dream/skill/ledger test exercise these paths; they must all
stay green unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | add exported `coerceScalar(raw)` (quote-strip + space-`#`-comment strip); no change to `parse`/`readBool`/`readNumber` |
| modify | src/core/dream/validate.js | `parseFrontmatter` delegates to `parse` + `coerceScalar` + boolean coercion (delete its private `---`/line lexer); `skillBody` delegates to `parse(String(text)).body` (delete its private `---` splitter) |
| modify | src/core/dream/config.js | `readScalar`'s value handling delegates to `coerceScalar`; delete its private quote/comment logic |
| modify | src/core/layout.js | `cleanValue` delegates to `frontmatter.coerceScalar(raw).value`; delete its private quote/comment logic |
| create | tests/unit/frontmatter-unify.test.js | prove the FOUR consumers (validator, config, layout, skill-body split) share the one lexer/coercer and behavior is unchanged on a shared corpus |

### Exact contracts

**1. `src/core/frontmatter.js` — add `coerceScalar`.** Byte-faithful to the
existing validate/config value handling (they already agree on the space-`#` rule):

```js
/**
 * Coerce ONE raw scalar value string (as stored by `parse`, or the raw text after
 * `key:` in a bare config line) to its config/validator string value. NOT boolean
 * coercion — the caller decides whether to further map `true`/`false`.
 *  - Trim surrounding whitespace first.
 *  - If the trimmed value is wrapped in a single matching `"…"` or `'…'` pair,
 *    return the inner text verbatim with quoted=true (NO comment stripping inside).
 *  - Otherwise strip a space-`#` (space-hash) inline comment and re-trim; quoted=false.
 * @param {string} raw
 * @returns {{value:string, quoted:boolean}}
 */
function coerceScalar(raw) {
  let value = String(raw).trim();
  const quoted = value.length >= 2 &&
    ((value[0] === '"' && value[value.length - 1] === '"') ||
     (value[0] === "'" && value[value.length - 1] === "'"));
  if (quoted) return { value: value.slice(1, -1), quoted: true };
  const hash = value.indexOf(' #');
  if (hash !== -1) value = value.slice(0, hash).trim();
  return { value, quoted: false };
}
```

Export it alongside the existing members. `parse` is unchanged (it still stores
raw values — coercion is the consumer's choice, which is exactly the "one lexer,
consumer-specific schema" shape the audit asks for).

**2. `src/core/dream/validate.js` — `parseFrontmatter` delegates.** Same output
type and semantics as today (booleans for exact `true`/`false`, strings otherwise),
now built on the shared lexer + coercer:

```js
const { parse, coerceScalar } = require('../frontmatter');

function parseFrontmatter(fileText) {
  if (typeof fileText !== 'string') return {};
  const fm = parse(fileText);            // shared lexer: delimiters + key-line rules
  /** @type {Record<string, string|boolean>} */
  const data = {};
  for (const [k, raw] of fm.fields) {    // fm.fields is first-wins; see note below
    const { value, quoted } = coerceScalar(raw);
    if (!quoted && value === 'true') { data[k] = true; continue; }
    if (!quoted && value === 'false') { data[k] = false; continue; }
    data[k] = value;
  }
  return data;
}
```

Delete the old inline `---`/line-scanning body (lines 142–185). Keep
`parseFrontmatter` in `module.exports`. `parseLedgerEntries`, `parseSessionArray`,
`tier3Decision`, and everything else (except `skillBody`, below) are untouched.

> **Duplicate-key note (record under "Decisions made").** The old validator kept
> the **last** duplicate value; the shared `parse` keeps the **first** and flags
> `malformed`. No identity/skill/ledger note legitimately repeats a top-level key,
> so this is unobservable — verify by running the full suite. If any fixture relies
> on last-wins, STOP and report it as a spec gap rather than changing `parse`.

**2b. `src/core/dream/validate.js` — `skillBody` delegates to the shared body rule.**
Its `lines[0] !== '---'` splitter is byte-identical to `parse`'s body semantics (no
open / no closing `---` → whole text; delimited → text after the closing `---`):

```js
// skillBody already reaches `parse` via the require at the top of the file.
function skillBody(text) { return parse(String(text)).body; }
```

Delete the old `split('\n')` splitter body. `skillBody`'s callers
(`skillBodyViolation`'s two `skillBody(...) !== skillBody(...)` comparisons) see
identical bytes, so their behavior is unchanged.

**3. `src/core/dream/config.js` — `readScalar` value handling delegates.** Keep the
delimiter-free line scan (config.yaml has no `---`), but replace the inline
quote/comment logic with `coerceScalar`:

```js
const { coerceScalar } = require('../frontmatter');
// … inside readScalar, after matching the key line into `match[2]`:
  return coerceScalar(match[2]).value;
```

Behavior is byte-identical (config already used the same space-`#`-comment + single-quote
rules).

**3b. `src/core/layout.js` — `cleanValue` delegates.** Replace its private trim +
comment + quote logic with the shared coercer:

```js
const { coerceScalar } = require('./frontmatter');   // sibling module in src/core
function cleanValue(raw) { return coerceScalar(raw).value; }
```

`cleanValue` stays a private (un-exported) helper; only its body changes.
`readVaultLayout` (line 125) keeps calling it. **Forced-ordering edge (record under
"Decisions made"):** the three copies did NOT all share one order — the validator
checked **quotes first**, while `config`/`layout` stripped the **comment first**.
Unifying onto one `coerceScalar` forces a single order; this WP adopts the
validator's **quote-first** order. They agree on every well-formed value (plain,
`"quoted"`, `'quoted'`, `unquoted # comment`). They diverge ONLY on a malformed value
that is quote-**opened** AND carries a trailing space-`#` comment (`"x" # c`): old
comment-first `cleanValue` → `"07-Custom" # note`; new quote-first → `"07-Custom"`.
Do NOT claim this is unobservable — `readVaultLayout` does **not** check path
existence (`isSafeRelativePath` rejects only empty/absolute/backslash/`..`), so BOTH
values pass and are stored; the returned layout value genuinely changes. Both the old
and new outputs are differently-broken values that retain the literal leading quote
(neither is the clean `07-Custom`), no well-formed config produces this form, and no
fixture exercises it — so the OWNER ACCEPTS the convergence onto the validator's
quote-first order (2026-07-17). The same class reaches `readDreamConfig` via
`readScalar` (e.g. `vault: "/p" # c`) and is accepted on the same basis. Verify
`tests/unit/layout.test.js` and the config tests stay green; if a fixture exercises
the `"…" # c` form, STOP and report it rather than papering over it.

**4. `tests/unit/frontmatter-unify.test.js`.** For a shared corpus of raw values
(`plain`, `"quoted"`, `'quoted'`, `val # comment`, `"has # inside"`, `true`,
`false`, a surrounding-space-padded value, `[a, b]`), assert `coerceScalar`
produces the value each old consumer produced, and that `validate.parseFrontmatter`
on a small `---…---` doc and `config.readScalar` on the same lines through a bare doc
both round-trip through the one `coerceScalar`. This locks the "one coercer" property
structurally.

Also include a **no-separator-space** must-agree case (WP-114's optional-separator
rule): `validate.parseFrontmatter('---\nk:v\n---')` yields `{k:'v'}` — identical to
`validate.parseFrontmatter('---\nk: v\n---')` — and `config.readScalar('k:v', 'k')`
=== `config.readScalar('k: v', 'k')` === `'v'`. The pre-A4 validator's `:\s*` regex
already accepted `key:value`, so this is parity, not a new behavior; the shared
`parse` (post-WP-114) preserves it.

Cover the two newly-unified consumers too:
- **layout** (`cleanValue` is not exported → assert through `readVaultLayout`): write
  a temp `config.yaml` with well-formed layout scalars (e.g. `identity_dir:
  "07-Custom"` and `daily_dir: 07-Daily # note`) and assert `readVaultLayout` returns
  the coerced values (`07-Custom`, `07-Daily`) — i.e. the exact `coerceScalar(...).value`
  outputs. Use only well-formed values (avoid the `"x" # c` nuance above).
- **skill-body split** (`skillBody` is exported? — it is NOT; assert via its public
  effect or add a minimal direct check): for a `---\nk: v\n---\nBODY` string and for a
  no-frontmatter string, assert the value `skillBodyViolation` compares equals
  `parse(String(text)).body`. Simplest: a direct unit assertion that
  `parse('---\nk: v\n---\nBODY').body === 'BODY'` and `parse('plain text').body ===
  'plain text'`, mirroring the delegation.

## Implementation notes & constraints

- **No observable behavior change for any well-formed value; one malformed
  quoted+commented edge intentionally converges on the validator's quote-first
  order.** If a change here flips any existing assertion on a well-formed value, you
  migrated wrong — the shared helpers must reproduce today's bytes. The sole accepted
  difference is `config`/`layout` reading a malformed `"…" # c` value (quote-opened
  with a trailing comment): the three old copies did not share one ordering, so
  unification forces one, and this WP picks the validator's quote-first order (see
  contract 3b). The full suite green is the gate.
- **`config.yaml` is NOT frontmatter** (no `---`), so `readScalar` cannot call
  `parse`; it shares only `coerceScalar`. This is faithful to the audit's "same
  lexical parser" intent (one definition of how a scalar value is read) without
  pretending config is a note. **Deviation from the audit's literal "config
  consumers use the same … parser" wording is OWNER-APPROVED (2026-07-17)** — it is a
  settled decision, not an open question.
- **Do not touch** `parseLedgerEntries`, `parseSessionArray`,
  `scripts/check-frontmatter.js`, or `digest.js` (WP-114 already migrated it).
  (`skillBody` IS in scope now — the one-line delegation in contract 2b.)
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After this WP there is exactly ONE lexer for `---…---` note frontmatter
      (`frontmatter.parse`) and ONE scalar-value coercer (`frontmatter.coerceScalar`);
      `validate.js` (both `parseFrontmatter` AND `skillBody`), `config.js`, and
      `layout.js` no longer carry private copies. The acceptance gate is a `grep -n`
      over `src/core/`: both `!== '---'` (block/body splitter) and `indexOf(' #')`
      (space-`#`-comment strip) return **only** `src/core/frontmatter.js`. (Before
      this amendment the same grep also hit `dream/validate.js` `skillBody` and
      `layout.js` `cleanValue` — the two copies this WP now retires.) No untrusted
      identifier flows into a path/shell here (pure text), so the anchoring checklist
      item does not apply.

## Acceptance criteria

- [ ] `validate.parseFrontmatter` returns byte-identical results to its pre-WP
      behavior on the existing `dream-validate.test.js` corpus (booleans for exact
      `true`/`false`, strings otherwise, quotes stripped, space-`#` comments stripped).
- [ ] `config.readScalar` returns byte-identical results for every well-formed value
      (vault path + dream knobs read the same). The one accepted difference is a
      malformed quote-opened-plus-trailing-comment value (`vault: "/p" # c`), which
      now follows the validator's quote-first order — no fixture exercises it.
- [ ] `validate.js` (`parseFrontmatter` + `skillBody`), `config.js`, and `layout.js`
      no longer contain their own `---`/`key: value` lexer, `---` body splitter, or
      quote/comment logic — all route through `frontmatter.js`.
- [ ] `layout.readVaultLayout` reads well-formed layout scalars identically (quoted
      and `# comment` forms yield the same coerced path as before); `skillBody`
      returns bytes identical to `parse(String(text)).body`.
- [ ] The grep gate returns only `frontmatter.js` (see the two commands below).
- [ ] The full existing suite passes unchanged (no fixture edits, no golden edits).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# Grep gate — both patterns must return ONLY src/core/frontmatter.js:
grep -rn "!== '---'" src/core/
grep -rn "indexOf(' #')" src/core/
npm test -- --test-name-pattern "frontmatter"
npm test -- --test-name-pattern "dream-validate"
npm test -- --test-name-pattern "config"
npm test -- --test-name-pattern "layout"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any behavior change to a gate, threshold, or output (this is a pure dedup).
- The ledger / session-array parsers (`parseLedgerEntries`, `parseSessionArray`) —
  different grammars, not in A4's frontmatter scope. (`skillBody` was reclassified
  IN scope by the 2026-07-17 spec-gap amendment — a body-only `---` split identical
  to `parse().body`.)
- `scripts/check-frontmatter.js` (specs/agents CI lint) — separate concern.
- The identity exact-byte trust registry (audit A3) — WP-116/WP-117.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/115-unify-frontmatter-consumers`; conventional commits; PR titled
   `refactor(frontmatter): unify validator + config consumers onto the shared parser (WP-115)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
