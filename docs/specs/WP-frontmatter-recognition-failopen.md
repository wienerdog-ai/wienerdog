---
id: WP-frontmatter-recognition-failopen
title: Honour a malformed block at the two consumers that ignore it — the recognition fail-open stays open, named
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0022, ADR-0004]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: the two consumer-side guards

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Read this first.** This package once tried to close the frontmatter
> **recognition** fail-open. Seven design-review rounds established that the
> recognition question could not be closed here, and the owner's pre-agreed
> fallback narrowed the package to the two consumer-side defects that were
> never in doubt. **The recognition fail-open is NOT closed by this WP.** It
> is stated as an open residual with its full evidence below, for the
> successor. The spec's `id` is kept so the seven rounds of logbook record
> stay attached to it; the title says what it now does.

## Context (read this, nothing else)

Wienerdog vault notes carry **provenance frontmatter**: a leading
`---`…`---` block of flat `key: value` scalars. The security-bearing field is
`derived_from_untrusted`. A note whose support came from tool results rather
than user-authored text is flagged `true`, and every security gate is
supposed to honour that: no digest injection, no vault-snapshot copy, no
clearing the dream's Tier-3 floor.

ADR-0022 makes `src/core/frontmatter.js` the **single lexer** every
security-bearing note read goes through, and it rules two things this package
depends on. **§4: a malformed block excludes a note unconditionally** — "fail
closed uniformly" — and compliance is driven by "**visibility, not
silence**". **Consequences: an anomalous exclusion can never be silent; it
appears in the digest banner.**

Two consumers break those rules today. One ignores `malformed` entirely and
lets a malformed block's fields through. The other drops a note silently
where the ADR requires a banner. Neither defect involves recognition, neither
is disputed, and both are closed here.

## Current state

**Hole 1 — the dream validator ignores `malformed`.**
`src/core/dream/validate.js:161-178` builds its frontmatter view by iterating
`fm.fields` and never reads `fm.malformed`. Measured: an exact-`---` LF block
carrying floor-passing values **plus a junk line** yields
`parse.malformed === true` and still presents a complete record that passes
the Tier-3 floor.

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))'
```

**Hole 2 — the digest's daily path drops a note silently.**
`src/core/digest.js:748` computes `r.note && extractSection(...)` and
**discards `r.exclusion`**. The identity path turns an anomalous exclusion
into a banner entry (`:691-692` → `:784`); the daily path has no such push
for provenance, only for a secret finding (`:766`). So a daily note excluded
as `malformed` or `untrusted-invalid` disappears with no signal —
contradicting ADR-0022's Consequences.

**And the banner's wording is already inaccurate for that list.** `:784`
reads "some identity notes were left out" and directs the user to
`wienerdog memory approve <note>`, which accepts only the four fixed identity
notes — measured, `src/cli/memory.js`'s `KNOWN` map is exactly `profile`,
`preferences`, `goals`, `instructions`. A `daily-summary` entry already
appears in that list today via `:766`, so the wrong noun and the impossible
remedy are a present defect, not one this WP introduces.

```bash
node -e 'const{parseNoteResult:p}=require("./src/core/digest");const t="---\nderived_from_untrusted: true\n---\n## Summary\nx\n";console.log("daily read exclusion =",String(p(t).exclusion),"— and digest.js:748 discards it")'
grep -n "KNOWN = {" -A 6 src/cli/memory.js
```

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/.
     Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | one guard: `parseFrontmatter` (`:161`) yields an empty record when `parse()` reports `malformed` |
| modify | src/core/digest.js | the daily path (`:745-748`) pushes an anomalous exclusion onto the banner list it already uses at `:766`; the banner wording (`:784`) becomes accurate for a heterogeneous list |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor, the preservation checks and the raise-only guard under a malformed block |
| modify | tests/unit/digest.test.js | the daily path's banner and its wording |

**`src/core/frontmatter.js` is deliberately NOT listed.** The parser is not
touched by this package. Recognition is unchanged in every respect, which is
why nothing here needs an ADR amendment and why ADR-0022's §1 uniqueness
sentinel is untouched.

### Exact contracts

**The validator guard.** `parseFrontmatter` (`validate.js:161`) yields an
empty record when `parse()` reports `malformed`, so a malformed block cannot
present fields to the Tier-3 floor (`:195`), the registry/preservation checks
(`:317`/`:325`/`:500`), the raise-only guard (`:332`), or the new-skill-draft
registration (`:1170`). It keeps the existing
`'Tier-3 path missing provenance frontmatter (…)'` reason — **no new reason
string**. This is ADR-0022 §4 applied where it was not.

**The daily banner.** The daily path pushes onto the same
`identityExclusions` list it already uses at `digest.js:766`, with the same
**code-owned** label `'daily-summary'` — never note content, the banner's
existing rule — and the reason strings the identity path already uses at
`:691-692`: `'malformed frontmatter'` for `malformed`, `'unclear
derived_from_untrusted value'` for `untrusted-invalid`. An `untrusted-exact`
exclusion and an absent flag stay **silent**: they are normal policy, not
anomalies (ADR-0022 §4). No new reason string, no new banner, no new
mechanism.

**The banner wording.** `:784` must be accurate for a list that already
mixes identity notes and a daily-summary entry: a noun covering both, and
the `memory approve` sentence only when an identity entry is present. All
wording stays fixed-template and code-owned, so the golden-frozen property
at `:786-790` holds when the list is empty.

## Contract reference

N/A — with recognition out of scope this WP changes no API shape, no status
taxonomy, no parsing, and introduces no reason code. It applies two existing
contracts (ADR-0022 §4 and its Consequences) at two consumers that do not.
Fewer than two of ADR-0031's seven criteria fire.

## Implementation notes & constraints

- **Do not touch `src/core/frontmatter.js`.** Recognition is out of scope by
  ruling, not by omission — see the residual below.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc only; no build step.
  Nothing starts a process (ADR-0004).
- **Trap — the guard changes behaviour for today's users.** A Tier-3 write
  with a malformed block whose recognized fields meet the floor is accepted
  today and rejected after. That direction is fail-closed and is what
  ADR-0022 §4 requires, but it is a real change on notes that have nothing to
  do with any parsing edge case. It must be visible in the PR body.
- **Trap — an empty record must not make a check vacuously pass.** The
  preservation checks compare `cur.id !== head.id` and friends; with both
  sides empty those comparisons succeed. Verify each call site fails closed
  rather than falling through, and report any that cannot.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is one guard and one push of a
      code-owned label onto an existing banner list. No path, filename or
      command is constructed. The anchored-pattern rule has no subject here —
      stated rather than deleted so the absence is checkable.
- [ ] The banner carries no note content: a fixed label and two fixed reason
      strings, the same code-owned rule as `:784`.
- [ ] Both changes move notes toward exclusion or toward visibility. Neither
      admits anything that is excluded today.

## Acceptance criteria

- [ ] **AC1** — A block reported `malformed` presents **no** fields to the
      validator, so a Tier-3 write with a malformed block and otherwise
      floor-passing values is rejected with the existing missing-provenance
      reason.
- [ ] **AC2** — The empty record does not make any preservation, registry or
      raise-only check pass vacuously: each of the six call sites
      (`:195, 317, 325, 343, 500, 1170`) is exercised with a malformed block
      and asserted to fail closed.
- [ ] **AC3** — A daily note excluded as `malformed` or `untrusted-invalid`
      produces a banner entry labelled `daily-summary` with the identity
      path's existing reason string; an `untrusted-exact` exclusion and an
      absent flag produce none.
- [ ] **AC4** — The banner's text is accurate for a list containing a daily
      entry: no identity-only noun, and no `memory approve` instruction
      unless an identity entry is present.
- [ ] **AC5** — The full suite and lint are green. Golden fixtures change
      only if a banner is actually emitted; with an empty exclusion list the
      digest bytes are unchanged.

## Verification steps (run these; paste output in the PR)

Each new assertion must be observed on both sides — green on the finished
state, red with the guard and the push reverted separately. Paste both.

```bash
node --test tests/unit/dream-validate.test.js tests/unit/digest.test.js
npm test
npm run lint
git diff --stat -- tests/golden/
```

## Out of scope (do NOT do these)

- **The recognition fail-open — the named residual this package leaves
  open.** See below. Nothing in `src/core/frontmatter.js` is touched.
- **A product-wide shared notion of a line** — successor
  `WP-shared-line-boundary`.
- **Exclusion visibility beyond the daily path** — the snapshot's `skipped`
  list and the dream's enforcement report use their own reporting shapes.
- The scan-limit guard and `WP-alert-producer-freeform-residual`.

## Residual R-RECOGNITION — open, with its evidence

`parse()` recognizes frontmatter only when line 0 is byte-exactly `---` and a
later line is byte-exactly `---`. **Every other leading shape makes an
explicitly written `derived_from_untrusted: true` invisible**, and the note
reads as trusted at the digest's two paths, the snapshot notes slice, and the
dream validator. This WP does not change that. `WP-gate-vault-snapshot`
Residual 8 already records the defect; this residual supersedes its
three-shape enumeration with what seven rounds measured.

Shapes measured to be trusted today, each carrying an explicit `true`:

| Family | Members |
|---|---|
| encoding artifacts | UTF-8 BOM opener; CRLF file (opener and closer) |
| leading whitespace | blank first line; leading space; leading tab; whitespace-only line before `---` |
| near-delimiters | trailing-space `---`; `----`; interleaved BOM and space; NBSP |
| invisible prefixes | ZWSP `U+200B`; BRAILLE BLANK `U+2800`, on the opener line or on a line of its own |
| line separators | CR-only, NEL `U+0085`, VT, FF, LS `U+2028`, PS `U+2029` — the renderer's `DAILY_LINE_BREAK` (`digest.js:56`) splits on all eight, `parse` on LF only |
| structure | opener with no closer |

**What the successor must know, so it does not re-derive it:**

- **Widening recognition was tried and abandoned.** Tolerating an opener
  shape introduces its own bypasses: a `trim()`-tolerant closer can end a
  block before the security field, leaving the flag in trusted body text.
- **Failing closed on a shape predicate was tried and abandoned.** Two
  predicates were built and both were defeated — one by an invisible
  character in no Unicode invisible class (`U+2800` is `So`), the other by
  moving that character onto its own line so a one-line predicate never
  reached the delimiter. A hyphen-run predicate also excludes ordinary
  leading dividers: a bare horizontal rule, `+-----+`, `|---|---|` and
  em-dash decoration all measured as false positives.
- **Keying on the field name was tried and abandoned.** It excludes prose
  that merely quotes `derived_from_untrusted:` near the top of a note, and it
  makes a structural decision depend on content, against ADR-0022.
- **A generated-input proof needs an independent oracle.** A sweep whose
  property computes its expected value from the same helper the classifier
  uses is a tautology: measured, widening recognition inside the shared
  helper left the property reporting zero violations.
- **The product corpus is not the migration bound.** 48 shipped/pinned files
  show zero affected either way; user vaults are unmeasured, and every
  candidate rule so far has had a false-positive class that only user content
  would reveal.

The raw record of all seven rounds, and the reference implementations that
were measured, are in `docs/specs/logbook/` under
`2026-08-1{6,7}-frontmatter-recognition-*`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs.
2. Conventional commits; PR titled
   `fix(dream,digest): honour malformed blocks and stop silent daily exclusions (WP-frontmatter-recognition-failopen)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`.
