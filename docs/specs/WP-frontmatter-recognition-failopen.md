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
| modify | src/core/dream/validate.js | each security decision rejects a malformed block before comparing fields — six sites, see Exact contracts. NOT a guard inside `parseFrontmatter`: that shape was measured to be a regression |
| modify | src/core/digest.js | the daily path (`:745-748`) pushes an anomalous exclusion onto the banner list it already uses at `:766`; the banner wording (`:784`) becomes accurate for a heterogeneous list |
| modify | tests/unit/dream-validate.test.js | the Tier-3 floor, the preservation checks and the raise-only guard under a malformed block |
| modify | tests/unit/digest.test.js | the daily path's banner and its wording |

**`src/core/frontmatter.js` is deliberately NOT listed.** The parser is not
touched by this package. Recognition is unchanged in every respect, which is
why nothing here needs an ADR amendment and why ADR-0022's §1 uniqueness
sentinel is untouched.

### Exact contracts

**The validator guard — at the DECISIONS, not in the view.** An earlier draft
of this spec put the guard in `parseFrontmatter` (`validate.js:161`), making
it yield an empty record on `malformed`. **That is a regression and must not
be built.** Measured: with a malformed HEAD carrying protected `id`,
`origin`, `created` and an explicit `derived_from_untrusted: true`, against a
revision that omits all four, today's checks report **four** violations
(`id changed`, `origin changed`, `created changed`, `raise-only lowered`)
while the empty-record version reports **none** and admits the revision.
Emptying the view erases the difference between *absent* and *hidden*, and
every one of these checks reads absence as agreement.

The contract is therefore: **each security decision rejects a malformed block
before it compares any field.** `parse()` already reports `malformed`; the
decision sites must consult it.

| Site | Decision | On `malformed` |
|---|---|---|
| `:195` | Tier-3 floor | reject — the existing `'Tier-3 path missing provenance frontmatter (…)'` reason already covers it |
| `:317` / `:325` | skill-revision preservation, either side | reject before comparing `id`/`origin`/`created` |
| `:332` | raise-only guard | reject before comparing the flag; never treat an unreadable HEAD as "not `true`" |
| `:500` | learnings-ledger parent-skill identity | reject before comparing against the registry |
| `:1170` | new-skill-draft registration | reject; never register default values from an unreadable reread |
| `:343` | `skillBody` body comparison | out of scope: it compares bodies, not security fields, and this WP does not change what `body` is |

**This needs one new reason string**, on the revision path: the existing
vocabulary has no accurate way to say "this file's frontmatter block is
malformed", and reusing the Tier-3 or path-reuse reason there would report
the wrong cause. An earlier draft claimed no new reason string; that claim was
only true of the design that regressed.

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

Activation (ADR-0031's 2-of-7): **(iv)** error/reason-code behavior changes —
a new rejection reason on the revision path, and a changed outcome at five
decision sites; **(vi)** multiple consumers inherit the rule. Two of seven,
so the discipline fires. An earlier draft marked this section N/A on the
strength of the empty-record design, which introduced no reason code because
it also introduced a regression.

### Table A — where a malformed block is rejected

The canonical table is the six-row site table under **Exact contracts**. It is
not restated here; this section exists to point at it and to register its
mirrors.

### Mirrored Surface Checklist

- [ ] The Deliverables note for `src/core/dream/validate.js`
- [ ] Acceptance criteria AC1 and AC2
- [ ] The Security checklist's reason-string claim
- [ ] The Implementation-notes trap, which this contract now resolves rather
      than hands over

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
- **Why the guard is at the decisions and not in the view.** Every one of
  these checks compares two records, and `cur.id !== head.id` and friends read
  ABSENCE as agreement. A view that empties itself on `malformed` therefore
  silences the very checks it was meant to strengthen — measured, four
  violations became zero. The site table in Exact contracts is the resolution;
  do not reintroduce the view-level guard as a shortcut.
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is a set of rejection branches in
      the validator and one push of a code-owned label onto an existing
      banner list. No path, filename or command is constructed. The
      anchored-pattern rule has no subject here — stated rather than deleted
      so the absence is checkable.
- [ ] The banner carries no note content: a fixed label and two fixed reason
      strings, the same code-owned rule as `:784`.
- [ ] **Nothing rejected today becomes admitted — checked against the
      measured case, not asserted.** The AC2 regression input is the test:
      an earlier design of this same guard turned four detected violations
      into zero, so this box is only tickable by running that input.

## Acceptance criteria

- [ ] **AC1** — A Tier-3 write whose block is `malformed` is rejected with
      the existing missing-provenance reason, even when its readable fields
      would meet the floor.
- [ ] **AC2** — **The regression case is a required test.** A malformed HEAD
      carrying `id`, `origin`, `created` and `derived_from_untrusted: true`,
      against a revision that omits all four, is REJECTED. Today's code
      reports four violations on that input and the empty-record design
      reported none; the test must fail on the empty-record design. Each
      remaining decision site (`:195, 317, 325, 500, 1170`) is exercised with
      a malformed block on each side and asserted to reject before any field
      comparison. `:343` is excluded by the site table and needs no case.
- [ ] **AC2a** — No decision may reject by *coincidence*. For each site, the
      malformed case and a genuinely-absent-field case are asserted
      separately, so a rejection that comes from absence rather than from the
      malformed state is visible as a distinct assertion.
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
explicitly written `derived_from_untrusted: true` invisible**. This WP does
not change that. `WP-gate-vault-snapshot` Residual 8 already records the
defect; this residual supersedes its three-shape enumeration with what seven
rounds measured.

**Per consumer, because the outcome differs and an earlier draft of this
residual got it wrong.** Measured on this tree for a BOM opener, a CRLF
block, a leading blank line, and an opener with no closer:

| Consumer | Outcome for an unrecognized block |
|---|---|
| digest identity injection (`digest.js:689`) | **fails OPEN** — `exclusion` is `null`, the body is injected including its frontmatter text |
| digest daily summary (`digest.js:747`) | **fails OPEN** for the BOM, blank-line and no-closer shapes — the flag is invisible and the `## Summary` section is extracted. **Not for CRLF**, which is masked by a second, unrelated defect: `extractSection`'s heading match (`:327`) cannot match `## Summary\r`, so a CRLF daily note emits no summary either way |
| snapshot notes slice (`vault-snapshot.js:151`) | **fails OPEN** — raw bytes copied |
| dream Tier-3 floor (`validate.js:195`) | **fails CLOSED** — zero fields reach the view, `hasAll` is false, and the write is rejected as missing provenance |
| dream raise-only guard (`validate.js:332`) | **fails OPEN in effect** — an unrecognized HEAD cannot be seen to carry `true`, so a lowering revision is not caught, though the Tier-3 floor rejects the write on other grounds |

An earlier draft said these shapes "read as trusted at … the dream
validator". That was false and is corrected here: the dream gate rejects
them. Conflating the digest's trusted-by-default rule with the dream's
stricter schema would have handed the successor a wrong cross-consumer
invariant.

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
