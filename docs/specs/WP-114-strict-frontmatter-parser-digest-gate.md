---
id: WP-114
title: Strict shared frontmatter parser + close the digest trust-gate fail-open (audit A4)
status: In-Review
model: opus
size: M
depends_on: [WP-112]
adrs: [ADR-0004, ADR-0022]
branch: wp/114-strict-frontmatter-parser-digest-gate
---

# WP-114: Strict shared frontmatter parser + close the digest trust-gate fail-open (audit A4)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**,
skills, hooks, scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** —
no daemons, no servers, no telemetry.

Every new AI session is bootstrapped with an injected **digest**
(`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`), built from the
vault's four injected **identity** files. A note carries **provenance**
frontmatter; the security-bearing flag is `derived_from_untrusted` — when a note's
support came from tool results (email bodies, web pages, fetched files) rather than
user-authored text, it is **untrusted-derived** and must NOT reach the Tier-3
digest.

A 2026-07-15 security audit (action **A4**) found that Wienerdog reads frontmatter
with **three different ad-hoc parsers** that disagree on exactly the security
field. The result is a fail-open bug **in the digest**: its trust gate excludes a
note only when the value is the literal string `true`:

```js
// src/core/digest.js today — readNote():
if (note.data.derived_from_untrusted === 'true') return null;
```

So a note whose frontmatter says `derived_from_untrusted: True`, `TRUE`,
`"true"`, or `'true'` is **NOT excluded** — its untrusted-derived content is
injected into the Tier-3 digest. (The dream validator, `src/core/dream/validate.js`
`parseFrontmatter`, coerces `true`/`false` to booleans and is already fail-closed
here; the two consumers interpret the *same bytes* differently — the audit's exact
worry: "No byte sequence is accepted as trusted at commit and interpreted
differently by the digest.")

This WP does two things, and nothing else:

1. Ship **one** strict flat-frontmatter parser (`src/core/frontmatter.js`) — NOT a
   YAML parser — with typed accessors that fail closed on any non-exact form
   (quoted, case-varied, indented, duplicate keys, junk).
2. Migrate the **digest**'s trust gate onto it, closing the fail-open, and prove
   with a **differential test** that the digest and the validator now give the
   same security-field interpretation to every byte form in a corpus.

The validator/config migration onto the shared parser (structural de-duplication)
is the follow-up **WP-115**; this WP leaves `validate.js`/`config.js` untouched and
only *compares against* the validator to prove agreement.

## Current state

**`src/core/digest.js`** has an inlined `splitFrontmatter(text)` →
`{data: Record<string,string>, body}` and `readNote(filePath)`:

```js
function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { data: {}, body: text };
  let end = -1;
  for (let i = 1; i < lines.length; i++) { if (lines[i] === '---') { end = i; break; } }
  if (end === -1) return { data: {}, body: text };
  const data = {};
  for (const raw of lines.slice(1, end)) {
    const m = raw.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2];
    const hash = value.indexOf('#');
    if (hash !== -1) value = value.slice(0, hash);   // strips at the FIRST '#', even inside a value
    data[m[1]] = value.trim();
  }
  return { data, body: lines.slice(end + 1).join('\n') };
}
function readNote(filePath) {
  let text; try { text = fs.readFileSync(filePath, 'utf8'); } catch { return null; }
  const note = splitFrontmatter(text);
  if (note.data.derived_from_untrusted === 'true') return null;  // ← fail-open string compare
  return note;
}
```

`readNote` is used only for the identity files and the daily note (daily is already
frozen by WP-112; identity notes legitimately **omit** `derived_from_untrusted`, so
absent-flag must keep injecting). `splitFrontmatter` is used **only** inside
`readNote`. The digest's other helpers (`compact`, `extractSection`,
`newestDaily`, `listProjectDirs`, `formatAlerts`, `renderDigest`) do NOT read
frontmatter and are out of scope.

**`src/core/dream/validate.js`** exports `parseFrontmatter(fileText)` →
`Record<string,string|boolean>` (coerces unquoted `true`/`false` to booleans;
strips a space-`#` inline comment on unquoted values; ignores indented lines; key regex
`[A-Za-z0-9_-]`). Its `tier3Decision` reads `fm.derived_from_untrusted === false`.
**This WP does not modify `validate.js`** — it only imports its `parseFrontmatter`
in the differential test to prove agreement.

**`scripts/check-frontmatter.js`** has a fourth parser (specs/agents CI lint);
out of scope — it validates repo docs, not vault notes.

The digest tests are `tests/unit/digest.test.js`; the golden is
`tests/golden/digest-default.md`. The identity fixtures under
`tests/fixtures/identity-filled/06-Identity/*.md` have **no**
`derived_from_untrusted` field (trusted by default) and must keep rendering.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/frontmatter.js | the ONE strict flat-frontmatter parser + typed accessors |
| modify | src/core/digest.js | replace `splitFrontmatter`/`readNote`'s trust gate with the strict parser; close the fail-open |
| create | tests/unit/frontmatter.test.js | unit-test the parser + accessors (all branches, corpus) |
| create | tests/unit/frontmatter-digest-differential.test.js | prove digest and `validate.js` classify every corpus byte-form identically |
| modify | tests/unit/digest.test.js | add: malformed-without-flag→excluded+warned; INVALID (`True`)→excluded+warned; exact `true`→excluded SILENT; golden byte-unchanged (identity fixtures omit the flag → still render, no banner) |

### Exact contracts

**1. `src/core/frontmatter.js`.** Pure; no filesystem, no env, no argv.

```js
'use strict';

/**
 * The ONE strict flat-frontmatter parser (audit A4). NOT a YAML parser: it reads a
 * leading `---`…`---` block of top-level `key: value` scalars. It is the single
 * lexer every security-bearing note read must use, so a byte sequence accepted as
 * trusted at commit is never interpreted differently by the digest.
 *
 * Strictness — FORMATTING-TOLERANT on the separator/surrounding whitespace, STRICT
 * on value semantics and block structure (a security-bearing consumer treats a
 * malformed block as fail-closed):
 *  - The block MUST open with a line that is exactly `---` as the FIRST line and
 *    close with a later line that is exactly `---`. Missing open / missing close →
 *    { delimited:false } (no frontmatter present).
 *  - Between the delimiters: blank lines and lines whose first non-space char is
 *    `#` are ignored. Every OTHER line must be a top-level `key: value` line
 *    matching /^([A-Za-z0-9_-]+):[ \t]*(.*)$/ with NO leading whitespace. The space
 *    after the colon is OPTIONAL — `key:value` (no space) is accepted (owner
 *    decision 2026-07-17: a missing separator space is a trivial formatting slip,
 *    not a trust anomaly; this also matches the pre-A4 validator's `:\s*` regex).
 *    Any line that does not match (an indented line, a `- list item`, a tab-indented
 *    continuation, a line with no colon, junk) sets malformed = true.
 *  - A duplicate top-level key sets malformed = true (first value is kept).
 *  - The value is the text captured by `(.*)`, with SURROUNDING whitespace removed:
 *    leading spaces/tabs are consumed by the `[ \t]*` separator, and TRAILING
 *    whitespace (spaces, tabs, and a trailing `\r` for CRLF tolerance) is stripped.
 *    INTERIOR content, quotes, and `#` are preserved verbatim — NO comment
 *    stripping, NO quote removal, NO interior trim. Trailing-trim matches the old
 *    validator's `.trim()` and is what keeps the digest and validator agreeing on
 *    every byte (the differential gate). Typed reads are done by the accessors
 *    below, which fail closed on any non-exact value.
 *
 * @param {string} text
 * @returns {{delimited:boolean, malformed:boolean, fields:Map<string,string>, body:string}}
 *   delimited=false → no `---…---` block; fields empty, body = the whole text.
 *   ok-to-trust for a security consumer = delimited && !malformed (see readBool).
 */
function parse(text) { /* implement per the rules above */ }

/** Sentinel: the field is present but its value is not an exact boolean literal
 *  (quoted, case-varied, commented, or junk). A security consumer treats INVALID
 *  exactly like `true` — i.e. untrusted / fail closed. (A whitespace-padded
 *  `true`/`false` is NOT INVALID: the separator + trailing-trim normalize it to the
 *  exact literal — see parse.) */
const INVALID = Symbol('frontmatter.invalid');

/**
 * Typed boolean read. Fails closed on any non-exact form.
 * @param {Map<string,string>} fields
 * @param {string} key
 * @returns {true|false|undefined|typeof INVALID}
 *   undefined = key absent; false = raw is exactly `false`; true = raw is exactly
 *   `true`; INVALID = present but anything else (`True`, `TRUE`, `"true"`,
 *   `'false'`, `true # x`, `1`, ``). NOTE: a whitespace-padded `true`/`false` does
 *   NOT reach here as padded — parse already normalized it to the exact literal.
 */
function readBool(fields, key) {
  if (!fields.has(key)) return undefined;
  const raw = fields.get(key);
  if (raw === 'false') return false;
  if (raw === 'true') return true;
  return INVALID;
}

/**
 * Typed number read. Fails closed on any non-canonical numeric form.
 * @returns {number|undefined|typeof INVALID}
 *   undefined = absent; a finite number when raw is an exact decimal (optional
 *   leading `-`, digits, optional single `.` + digits) with no quotes/comment/
 *   padding/exponent; INVALID otherwise.
 */
function readNumber(fields, key) {
  if (!fields.has(key)) return undefined;
  const raw = fields.get(key);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return INVALID;
  return Number(raw);
}

module.exports = { parse, readBool, readNumber, INVALID };
```

Worked examples for `parse` (assert these in `frontmatter.test.js`):

| Input frontmatter body (between the `---`s)      | fields / malformed |
|--------------------------------------------------|--------------------|
| `a: 1\nb: two`                                    | `{a:'1', b:'two'}`, malformed=false |
| `a:1`                                             | `{a:'1'}`, malformed=false (no-space separator accepted) |
| `derived_from_untrusted: false`                   | `{derived_from_untrusted:'false'}` |
| `derived_from_untrusted:false`                    | `{...:'false'}` (readBool → false) |
| `derived_from_untrusted:  true`                   | `{...:'true'}` — separator absorbs the padding → exact `true` (readBool → true) |
| `derived_from_untrusted: false` + a trailing space | `{...:'false'}` — trailing whitespace stripped (readBool → false) |
| `derived_from_untrusted: True`                    | `{...:'True'}` (readBool → INVALID) |
| `derived_from_untrusted: "true"`                  | `{...:'"true"'}` (readBool → INVALID) |
| `a: 1\n  nested: x`                               | malformed=true (indented line) |
| `a: 1\na: 2`                                       | malformed=true, `a` kept as `'1'` |
| `# comment\na: 1`                                 | `{a:'1'}`, malformed=false |
| `a: value # not-a-comment`                        | `{a:'value # not-a-comment'}` (interior preserved; no strip) |

`parse('no frontmatter here')` → `{delimited:false, malformed:false, fields:empty,
body:'no frontmatter here'}`. `parse('---\na: 1\n(no closing)')` →
`{delimited:false, …, body: the whole text}` (unclosed = not delimited).

> **Absorption effect (record under "Decisions made").** With the optional-separator
> rule, a leading-space-padded value (`derived_from_untrusted:  true`) lexes to the
> raw exact `true`, and a trailing-space-padded value (`derived_from_untrusted:
> false` with a trailing space) lexes to exact `false` after the trailing-trim. So
> padded booleans become their exact literals:
> padded-`true` is excluded **silently** (normal policy), padded-`false` is
> **trusted**. This is a **return to parity** with the pre-A4 validator (which did
> `:\s*` + `.trim()`), NOT a loosening versus today — the same bytes were already
> treated this way by the validator; the amendment just makes the digest agree. The
> genuinely dangerous forms remain INVALID and fail-closed: quoted (`"true"`,
> `'false'`), case-varied (`True`, `TRUE`), commented (`true # x`), non-boolean junk.

**2. `src/core/digest.js`.** Replace `splitFrontmatter` + the `readNote` string
compare with the strict parser, and change `readNote` to return a **structured
result** so the exclusion reason reaches `renderDigest` (which surfaces anomalous
exclusions in the digest — owner decision, see below). Then `renderDigest` collects
WARN-class exclusions and prepends a fixed banner (same plain-text prefix pattern as
`formatAlerts`).

```js
const { parse, readBool, INVALID } = require('./frontmatter');

/**
 * @typedef {{data: Record<string,string>, body: string}} Note
 * @typedef {{note: Note|null,
 *            exclusion: null|'absent'|'untrusted-exact'|'untrusted-invalid'|'malformed'}} ReadNoteResult
 */

/**
 * Read a note, honouring the trust gate, and report WHY it was excluded so the
 * caller can decide whether the exclusion is anomalous (warn) or normal (silent).
 *
 * Exclusion classes:
 *  - 'absent'           — file missing/unreadable (silent).
 *  - 'malformed'        — the frontmatter block is malformed (indented line,
 *                         duplicate key, junk line). Excluded UNCONDITIONALLY —
 *                         regardless of whether it carries derived_from_untrusted
 *                         (owner decision 2026-07-17: fail-closed uniformity; a
 *                         malformed block on a human-authored identity file is a
 *                         typo, surfaced by the banner, not tolerated). WARN.
 *  - 'untrusted-invalid'— derived_from_untrusted present but NOT provably `false`
 *                         (`True`, `TRUE`, `"true"`, commented, junk → INVALID).
 *                         WARN.
 *  - 'untrusted-exact'  — derived_from_untrusted is exactly `true`. Normal policy;
 *                         SILENT.
 *  - null               — trusted (flag absent, or exactly `false`) → note returned.
 *
 * Trusted-by-default: a well-formed note that OMITS the flag (the human identity
 * notes) still renders.
 * @param {string} filePath
 * @returns {ReadNoteResult}
 */
function readNote(filePath) {
  let text;
  try { text = fs.readFileSync(filePath, 'utf8'); } catch { return { note: null, exclusion: 'absent' }; }
  const fm = parse(text);
  // Malformed block → exclude unconditionally (fail-closed uniformity), warn.
  if (fm.malformed) return { note: null, exclusion: 'malformed' };
  const t = readBool(fm.fields, 'derived_from_untrusted');
  if (t === true) return { note: null, exclusion: 'untrusted-exact' };     // normal → silent
  if (t === INVALID) return { note: null, exclusion: 'untrusted-invalid' }; // anomalous → warn
  // undefined (absent) or exactly false → trusted → render.
  const data = Object.fromEntries(fm.fields); // shape stability for the return type
  return { note: { data, body: fm.body }, exclusion: null };
}
```

Delete `splitFrontmatter` (its only caller was `readNote`).

**`renderDigest` — collect WARN-class exclusions and prepend a banner.** In the
identity loop, adapt to the new shape and record anomalous exclusions:

```js
  /** @type {Array<{file:string, reason:string}>} anomalous exclusions to warn about */
  const identityExclusions = [];
  for (const [file, header] of identity) {
    const r = readNote(path.join(idDir, file));
    if (!r.note) {
      if (r.exclusion === 'malformed') identityExclusions.push({ file, reason: 'malformed frontmatter' });
      else if (r.exclusion === 'untrusted-invalid') identityExclusions.push({ file, reason: 'unclear derived_from_untrusted value' });
      // 'absent' and 'untrusted-exact' are NORMAL → silent (no banner).
      continue;
    }
    const content = compact(r.note.body);
    if (!content) continue;
    parts.push(`${header}\n${content}`);
  }
```

Adapt the WP-112 daily-summary block to the new shape (no banner — daily is a
separate, frozen, non-identity surface):

```js
  if (daily && isCapabilityAllowed(CAPABILITY.DAILY_SUMMARY_INJECTION, opts.profile)) {
    const r = readNote(daily.path);
    const summary = r.note && extractSection(r.note.body, 'Summary');
    if (summary) parts.push(`## Latest daily log (${daily.date})\n${summary}`);
  }
```

Build the banner (fixed, declarative, code-owned filenames only — never note
content, so no untrusted bytes enter the digest, same rule as `formatAlerts`), and
add it FIRST in the prefix (an identity note silently missing from the session is
the most urgent thing to surface):

```js
  const identityWarn = identityExclusions.length > 0
    ? `> [!warning] Wienerdog: some identity notes were left out of your session context — ${identityExclusions.map((e) => `${e.file} (${e.reason})`).join(', ')}. Fix their frontmatter, then run \`wienerdog sync\`.`
    : '';
  const prefix = [identityWarn, formatAlerts(opts.alerts || []), opts.schedulerLine || '', opts.updateLine || '']
    .filter((s) => s !== '')
    .join('\n\n');
```

`renderDigest` stays **pure and total** (never throws; the banner is part of its
returned text). The golden output is **byte-unchanged**: the identity fixtures have
no malformed blocks and omit the flag, so `identityExclusions` is empty → no banner.

> **Owner decision (2026-07-17), record under the PR "Decisions made".** (1) A
> malformed frontmatter block excludes the note **unconditionally** — dropping the
> earlier "only if it carries `derived_from_untrusted`" carve-out. Post-WP-112 the
> four identity files are human-authored only, so a malformed block is a typo, not
> an attack; the owner prefers fail-closed uniformity and drives compliance through
> **visibility** (the banner) rather than leniency. (2) Silent disappearance of a
> note is unacceptable, so anomalous exclusions (malformed, or an INVALID flag form)
> are surfaced in the digest via the banner; an **exact** `derived_from_untrusted:
> true` is normal policy and stays silent.

**3. `tests/unit/frontmatter-digest-differential.test.js`.** For a corpus of
`derived_from_untrusted` values, assert the digest and the validator agree on the
trust classification of the *same bytes*:

```js
const { parse, readBool } = require('../../src/core/frontmatter');
const { parseFrontmatter } = require('../../src/core/dream/validate');

// classification a security consumer must agree on:
//   'trusted'   → the value proves derived_from_untrusted is exactly false
//   'untrusted' → present but not provably-false (true / quoted / case-varied / junk)
//   'absent'    → field not present
// Includes whitespace-padded (leading/trailing) forms — the separator + trailing-trim
// normalize them to exact booleans (return-to-parity with the old validator).
const CORPUS = ['false', 'true', 'True', 'TRUE', 'False', '"true"', "'false'",
  ' true', ' false', 'false ', 'true ', 'true # note', 'no', '0', '1', 'yes',
  'FALSE', ''];
```

For each value V, build a note `---\nderived_from_untrusted: <V>\n---\nbody`, and
assert: digest-side (`readBool(parse(note).fields, 'derived_from_untrusted')`
mapped to trusted iff `=== false`) equals validator-side
(`parseFrontmatter(note).derived_from_untrusted === false`). Both must classify as
trusted exactly the values that normalize to the boolean `false` — the exact `false`
and its whitespace-padded forms (leading or trailing) — and NOTHING else; every
other form (incl. padded `true`, quoted, case-varied, junk) as not-trusted.
**Additionally assert a no-separator-space line** agrees:
`---\nderived_from_untrusted:false\n---` is trusted on both sides, and
`---\nderived_from_untrusted:true\n---` is untrusted on both sides (the template
above always inserts a colon-then-space, so cover the no-space form with these two
explicit extra notes). This is the audit's "same security-field interpretation" gate
and its "no byte accepted as trusted at commit, interpreted differently by the
digest" gate.

## Implementation notes & constraints

- **This implements the convention recorded in ADR-0022** (its canonical home;
  reference it in the module header). One-line summary: security-bearing vault-note
  frontmatter is read exclusively through `src/core/frontmatter.js` and its
  fail-closed typed accessors (`readBool`/`readNumber`/`INVALID`; `coerceScalar`
  arrives in WP-115) — never a bespoke string compare or a private lexer, and never a
  YAML library (YAML's interpretation flexibility is the attack surface). WP-115
  retires the duplicate parsers in `validate.js`/`config.js` onto this module; do NOT
  touch them here.
- **Trusted-by-default is deliberate and must be preserved.** Identity notes omit
  `derived_from_untrusted`; excluding absent-flag notes would empty the digest and
  break M2. A well-formed note excludes only on a *present, not-provably-false*
  value; a *malformed block* excludes unconditionally (owner decision above).
- **Visibility, not silence.** Anomalous exclusions (malformed block, or an INVALID
  flag form) MUST appear in the returned digest via the banner; an exact
  `derived_from_untrusted: true` is normal policy and stays silent. The banner lives
  entirely inside `renderDigest`'s returned text — no other surface changes, no
  alerts.jsonl write, no throw. Keep its `> [!warning] Wienerdog: …` wording and
  first-in-prefix placement consistent with `formatAlerts` and WP-116's
  hash-mismatch banner (which feeds the SAME `identityExclusions` list).
- **Raw values, no comment stripping.** The old `splitFrontmatter` stripped at the
  first `#` even mid-value (so `id: a#b` lost `#b`). The strict parser stores the
  raw value; the typed accessors decide meaning. This is a behavior change only for
  values containing `#`; no security field legitimately contains one, and the
  identity/daily fixtures do not, so the golden is unchanged (verify).
- **Pure + zero deps.** Plain Node ≥ 18, JSDoc types only, no new npm deps, no build
  step. No I/O in `frontmatter.js`.
- **Do not touch `validate.js`, `config.js`, or `scripts/check-frontmatter.js`.**
  That is WP-115 (and check-frontmatter is out of scope entirely).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The digest's trust gate fails closed on every non-exact form of
      `derived_from_untrusted` (`True`, `TRUE`, `"true"`, `'true'`, padded,
      commented) AND on any malformed frontmatter block **unconditionally** (whether
      or not it carries the flag) — proven by `digest.test.js` cases AND the
      differential test that the digest and the dream validator classify identical
      bytes identically. Every anomalous exclusion (malformed / INVALID flag) is
      surfaced in the returned digest banner so a note can never silently vanish; an
      exact `derived_from_untrusted: true` is normal policy and stays silent. No
      untrusted identifier flows into a path or shell here (pure text parsing) and
      the banner names only code-owned filenames — never note content — so no
      untrusted bytes reach the digest.

## Acceptance criteria

- [ ] `parse` returns `delimited:false` for text without a well-formed `---…---`
      block (missing open OR missing close); `malformed:true` for an indented line,
      a duplicate key, or a non-`key: value` junk line inside the block. A
      `key:value` line with NO space after the colon lexes successfully (NOT
      malformed) → `{key:'value'}`.
- [ ] `parse` normalizes surrounding whitespace: `derived_from_untrusted:  true`
      (leading pad) and `derived_from_untrusted: false` followed by a trailing space
      both store the exact `true`/`false`; interior content (`value # x`) is preserved.
- [ ] `readBool` returns `false` only for the exact stored `false`, `true` only for
      the exact stored `true`, `undefined` for an absent key, and `INVALID` for every
      other present form (`True`, `TRUE`, `"true"`, `'false'`, `true # x`, `1`,
      empty). (Padded booleans do not reach `readBool` as padded — `parse`
      normalized them.)
- [ ] `renderDigest(FIXTURE)` is byte-identical to the current golden (clean fixtures
      → no exclusions → no banner); the golden file is unchanged.
- [ ] **malformed-without-flag → excluded + warned:** a profile note whose block is
      malformed (e.g. an indented line) but carries NO `derived_from_untrusted` is
      excluded AND the digest contains the identity-exclusion banner naming
      `profile.md (malformed frontmatter)`.
- [ ] **INVALID flag → excluded + warned:** a profile note with
      `derived_from_untrusted: True` (and separately `"true"`, `'true'`, `true # x`)
      is excluded AND the banner names `profile.md (unclear derived_from_untrusted
      value)` — where the old string compare would have injected it. (A
      whitespace-padded `true` is NOT this case — it normalizes to exact `true` and
      is excluded silently.)
- [ ] **exact `true` → excluded SILENTLY:** a profile note with
      `derived_from_untrusted: true` (exact) is excluded and the digest contains NO
      identity-exclusion banner.
- [ ] A profile note with `derived_from_untrusted: false` and one that omits the flag
      (well-formed) both render, with no banner.
- [ ] The differential test passes: for the whole corpus the digest and
      `validate.js` `parseFrontmatter` agree on trusted-vs-not for `derived_from_untrusted`.
- [ ] `npm test` and `npm run lint` pass; no existing test changes behavior except
      the digest cases added here.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "frontmatter"
npm test -- --test-name-pattern "digest"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Migrating `src/core/dream/validate.js` `parseFrontmatter` or
  `src/core/dream/config.js` `readScalar` onto the shared parser — that is **WP-115**
  (structural de-duplication; this WP only proves agreement via the differential
  test).
- `scripts/check-frontmatter.js` (the specs/agents CI lint parser) — separate
  concern, not a vault-note reader.
- The identity exact-byte trust registry / digest hash-gate (audit A3) — **WP-116**.
- Any change to the WP-112 daily-summary or identity-freeze gates.
- **A `wienerdog doctor` vault-frontmatter check** (proactively flagging a malformed
  identity note before a session starts) — considered and **deliberately deferred**
  as a follow-up (owner, 2026-07-17). Do NOT add `doctor.js` to this WP. The
  in-digest banner is the visibility surface for now.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/114-strict-frontmatter-parser-digest-gate`; conventional commits; PR
   titled `feat(frontmatter,digest): strict parser + close the trust-gate fail-open (WP-114)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
