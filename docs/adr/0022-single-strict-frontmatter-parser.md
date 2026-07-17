# ADR-0022: One strict, fail-closed frontmatter parser for security-bearing notes

Status: Accepted
Date: 2026-07-17

## Context

Vault notes carry **provenance** frontmatter — a leading `---`…`---` block of flat
`key: value` scalars. The security-bearing field is `derived_from_untrusted`: when a
note's support originated in tool results (email bodies, web pages, fetched files)
rather than user-authored text, it is untrusted-derived and must NOT reach the
Tier-3 injected **digest** or clear the dream's Tier-3 floor.

The 2026-07-15 security audit (action **A4**) found that Wienerdog read this
frontmatter with **three separate ad-hoc parsers** that disagreed on exactly that
field:

- `src/core/digest.js` `splitFrontmatter` — excluded a note only when the value was
  the literal string `true` (`note.data.derived_from_untrusted === 'true'`), and
  stripped inline comments at the first `#` even mid-value.
- `src/core/dream/validate.js` `parseFrontmatter` — coerced unquoted `true`/`false`
  to booleans and stripped only a space-`#` (space-hash) comment.
- `src/core/dream/config.js` `readScalar` — a delimiter-free scalar reader with its
  own quote/comment handling.

**The motivating incident (fail-open).** Because the digest compared against the
literal string `'true'`, a note whose frontmatter said `derived_from_untrusted:
True`, `TRUE`, `"true"`, or `'true'` was **not excluded** — its untrusted-derived
content was injected into the standing, instruction-adjacent session context. The
dream validator, reading the *same bytes*, correctly treated them as untrusted. This
is precisely the audit's concern: "No byte sequence is accepted as trusted at commit
and interpreted differently by the digest." Divergent parsers of a security field
are a vulnerability, independent of any single parser's correctness.

This ADR records the design implemented by **WP-114** (the parser + the digest
migration that closed the fail-open) and **WP-115** (retiring the validator and
config duplicate lexers onto it).

## Decision

**Security-bearing vault-note frontmatter is read through exactly one module,
`src/core/frontmatter.js`, and its typed fail-closed accessors — never a bespoke
string compare or a private per-consumer lexer.**

1. **One lexer.** `frontmatter.js` exposes `parse(text) → {delimited, malformed,
   fields:Map<string,string>, body}`. Every consumer that reads `---`-delimited note
   frontmatter (the digest trust gate, the dream validator, and — for scalar-value
   coercion only — the config reader) routes through it. A `grep` for a second
   `lines[0] !== '---'` block or a second space-`#`-comment strip in `src/core/` returns
   only this module.

2. **Not a YAML parser — deliberately.** It reads only a flat block of top-level
   `key: value` scalars. YAML's flexibility (anchors, aliases, multi-doc, implicit
   typing, block/flow duality, quoting rules, coercion quirks) is itself the attack
   surface: it multiplies the ways a hostile or malformed value can be interpreted,
   and it is exactly where the three ad-hoc parsers diverged. A minimal, explicit
   grammar removes that ambiguity. It also keeps the installer's zero-runtime-dep
   rule (no YAML library). The grammar is **formatting-tolerant on the separator and
   surrounding whitespace, but strict on value semantics and block structure**: the
   space after the colon is optional (`key:value` is accepted, matching the pre-A4
   validator's `:\s*`), and leading/trailing whitespace around a value is normalized
   away — a trivial formatting slip is not a trust anomaly. What stays strict is the
   *meaning* of a value (only exact boolean literals are `true`/`false`; quoted,
   case-varied, commented, or junk forms are `INVALID`) and the *block structure*
   (delimiters, top-level keys only, no duplicates, no indentation).

3. **Raw values, typed accessors.** `parse` stores each value **verbatim except for
   surrounding whitespace**: leading whitespace is consumed by the separator and
   trailing whitespace (incl. a trailing `\r`) is stripped — matching the old
   validator's `.trim()` and keeping the digest and validator agreeing on every byte
   — while interior content, quotes, and `#` are preserved (no comment stripping, no
   quote removal, no interior trim). Meaning is assigned by the typed accessors, so
   interpretation lives in one place:
   - `readBool(fields, key)` → `false` only for the exact stored `false`, `true` only
     for the exact stored `true`, `undefined` when absent, and the `INVALID` sentinel
     for every other present form (`True`, `TRUE`, `"true"`, `'false'`, commented,
     junk). A whitespace-padded `true`/`false` is NOT `INVALID` — `parse` already
     normalized it to the exact literal (return-to-parity with the old validator).
   - `readNumber(fields, key)` → a finite number only for an exact decimal, else
     `INVALID`/`undefined`.
   - `coerceScalar(raw)` (WP-115) → the one definition of quote-strip + space-`#`-comment
     strip, shared by the validator's string/boolean coercion and the config
     reader (`config.yaml` is not `---`-delimited, so it shares the coercer, not
     `parse`).
   A security consumer treats `INVALID` exactly like `true` — fail closed.

4. **Malformed → exclude, unconditionally, with visibility.** A malformed
   frontmatter block (an indented line, a duplicate top-level key, a non-`key: value`
   junk line) causes a security-bearing note to be **excluded regardless of whether
   it carries `derived_from_untrusted`**. Rationale (owner decision, 2026-07-17):
   after the WP-112 freeze the four injected identity files are human-authored only,
   so a malformed block is a typo, not an attack — but fail-closed uniformity is
   preferred over per-field leniency, and compliance is driven by **visibility, not
   silence**: `renderDigest` surfaces anomalous exclusions (a malformed block, or a
   present-but-`INVALID` flag) in the returned digest via a fixed
   `> [!warning] Wienerdog: …` banner (the same plain-text prefix pattern as the
   failure-alert banner). An **exact** `derived_from_untrusted: true` is normal policy
   and is excluded **silently**.

5. **Trusted-by-default for a well-formed note.** A well-formed note that **omits**
   `derived_from_untrusted` renders. The injected identity files legitimately omit
   the flag (they are user-authored), and treating an absent flag as untrusted would
   empty the digest and break M2 ("a new session demonstrably knows the user"). Only
   a *present, not-provably-`false`* value — or a malformed block — excludes. (The
   dream validator's Tier-3 floor keeps its stricter schema — it *requires* an exact
   `derived_from_untrusted: false` to accept a brain-written Tier-3 note. Consumers
   may have their own schemas; what is shared and identical is the *interpretation of
   a given value*.)

## Boundary statement

This ADR governs how frontmatter **values** are lexed and typed. It does not by
itself authorize any content — the digest's identity injection is additionally gated
on the exact-byte trust registry (ADR-0021), and the dream's writes on the Tier-3
floor and the WP-112 freeze. The parser is a fail-closed reader, not a trust anchor.
`scripts/check-frontmatter.js` (the specs/agents CI-lint parser) validates repo docs,
not vault notes, and is out of this convention's scope.

## Consequences

- The digest fails closed on every non-exact `derived_from_untrusted` form and on any
  malformed block; a differential/property test proves the digest and the validator
  classify identical bytes identically (the audit's "no byte interpreted differently"
  gate).
- Any **future** consumer that reads security-bearing note frontmatter MUST use
  `frontmatter.js` — adding a fourth private lexer is a defect.
- An anomalous exclusion can never be silent: it appears in the digest banner. A
  proactive `wienerdog doctor` vault-frontmatter check was considered and deferred as
  a follow-up.
- Implemented by WP-114 (parser + digest migration + banner) and WP-115 (validator +
  config consumers unified onto the module).

## Alternatives considered

- **Keep three parsers, just fix the digest's compare.** Rejected: correctness of one
  parser does not prevent the next divergence; a single lexer is the structural fix
  the audit asked for.
- **Adopt a real YAML library.** Rejected: it violates the zero-runtime-dependency
  rule (ADR-0003/CLAUDE.md) and, more importantly, re-introduces the interpretation
  ambiguity that caused the incident. The threat model wants *less* parsing
  flexibility for security fields, not more.
- **Fail closed on a missing/absent flag too.** Rejected: identity files omit the
  flag by design; treating absence as untrusted empties the digest and breaks M2.
  Absence is trusted; a present-but-unclear value and a malformed block are not.
- **Exclude malformed only when it carries the flag.** Rejected by the owner in
  favor of unconditional exclusion + the visibility banner (see Decision 4).
