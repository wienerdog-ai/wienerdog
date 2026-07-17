---
id: WP-115
title: Unify the validator + config frontmatter consumers onto the shared strict parser (audit A4)
status: Draft
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
migrated the digest's trust gate onto it, closing a fail-open. But two ad-hoc
`key: value` line-lexers still exist:

- `src/core/dream/validate.js` `parseFrontmatter` — its own `---…---` block
  splitter, key-line regex, and quote/boolean/`#`-comment coercion, used by
  `tier3Decision`, `skillBodyViolation`, `ledgerViolation`, and the new-skill
  registry read.
- `src/core/dream/config.js` `readScalar` — a delimiter-free top-level `key: value`
  reader for `config.yaml`, with the same quote + space-`#`-comment coercion.

This WP is a **structural de-duplication with no observable behavior change**: it
routes both consumers through `frontmatter.js` so there is exactly one place that
lexes a `key: value` line and one place that coerces a scalar value. It does NOT
change any gate, threshold, or output. The full existing suite (865+ tests) staying
green IS the acceptance signal.

## Current state

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
142–185 of the current file.) `parseLedgerEntries`, `parseSessionArray`,
`skillBody` are **separate** parsers for the LEARNINGS ledger / session arrays /
body split — **out of scope**, leave them alone.

**`src/core/dream/config.js`** `readScalar(body, key)`: scans un-indented lines for
`^([A-Za-z0-9_]+):\s*(.*)$`, matches `key`, then for an unquoted value strips a
space-`#` inline comment and strips a single surrounding quote pair. No `---`
delimiters (config.yaml is a bare scalar document, not frontmatter).

Tests: `tests/unit/dream-validate.test.js`, `tests/unit/dream-config.test.js` (if
present), and every dream/skill/ledger test exercise these paths; they must all
stay green unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/frontmatter.js | add exported `coerceScalar(raw)` (quote-strip + space-`#`-comment strip); no change to `parse`/`readBool`/`readNumber` |
| modify | src/core/dream/validate.js | `parseFrontmatter` delegates to `parse` + `coerceScalar` + boolean coercion; delete its private `---`/line lexer |
| modify | src/core/dream/config.js | `readScalar`'s value handling delegates to `coerceScalar`; delete its private quote/comment logic |
| create | tests/unit/frontmatter-unify.test.js | prove the three consumers share one lexer/coercer and behavior is unchanged on a shared corpus |

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
`skillBody`, `tier3Decision`, and everything else are untouched.

> **Duplicate-key note (record under "Decisions made").** The old validator kept
> the **last** duplicate value; the shared `parse` keeps the **first** and flags
> `malformed`. No identity/skill/ledger note legitimately repeats a top-level key,
> so this is unobservable — verify by running the full suite. If any fixture relies
> on last-wins, STOP and report it as a spec gap rather than changing `parse`.

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

## Implementation notes & constraints

- **No behavior change is the whole point.** If a change here flips any existing
  assertion, you migrated wrong — the shared helpers must reproduce today's bytes.
  The full suite green is the gate.
- **`config.yaml` is NOT frontmatter** (no `---`), so `readScalar` cannot call
  `parse`; it shares only `coerceScalar`. This is faithful to the audit's "same
  lexical parser" intent (one definition of how a scalar value is read) without
  pretending config is a note. **Deviation from the audit's literal "config
  consumers use the same … parser" wording is OWNER-APPROVED (2026-07-17)** — it is a
  settled decision, not an open question.
- **Do not touch** `parseLedgerEntries`, `parseSessionArray`, `skillBody`,
  `scripts/check-frontmatter.js`, or `digest.js` (WP-114 already migrated it).
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After this WP there is exactly ONE lexer for `---…---` note frontmatter
      (`frontmatter.parse`) and ONE scalar-value coercer (`frontmatter.coerceScalar`);
      `validate.js` and `config.js` no longer carry private copies. A `grep -n` for a
      second `lines[0] !== '---'` block or a second space-`#`-comment strip in `src/core/`
      returns only `frontmatter.js`. No untrusted identifier flows into a path/shell
      here (pure text), so the anchoring checklist item does not apply.

## Acceptance criteria

- [ ] `validate.parseFrontmatter` returns byte-identical results to its pre-WP
      behavior on the existing `dream-validate.test.js` corpus (booleans for exact
      `true`/`false`, strings otherwise, quotes stripped, space-`#` comments stripped).
- [ ] `config.readScalar` returns byte-identical results (vault path + dream knobs
      read the same).
- [ ] `validate.js` and `config.js` no longer contain their own `---`/`key: value`
      lexer or quote/comment logic — both route through `frontmatter.js`.
- [ ] The full existing suite passes unchanged (no fixture edits, no golden edits).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "frontmatter"
npm test -- --test-name-pattern "dream-validate"
npm test -- --test-name-pattern "config"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any behavior change to a gate, threshold, or output (this is a pure dedup).
- The ledger/session-array/skill-body parsers (`parseLedgerEntries`,
  `parseSessionArray`, `skillBody`) — different grammars, not in A4's frontmatter
  scope.
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
