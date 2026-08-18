---
id: WP-frontmatter-recognition-failopen
title: Stop the digest dropping a daily note silently, and make its banner accurate
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0022, ADR-0004]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: the digest banner half

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Read this first.** This package once tried to close the frontmatter
> **recognition** fail-open, then to guard two consumers that ignore
> `malformed`. Nine design-review rounds narrowed it twice. **What ships here
> is the digest half only**: the daily path's silent exclusion and the
> banner's inaccurate wording. Two things it does NOT do, both stated with
> their evidence below — it does not close the recognition fail-open
> (`## Residual R-RECOGNITION`), and it does not fix the dream validator's
> handling of `malformed` (`## Successor — the validator half`). The spec's
> `id` is kept so nine rounds of logbook record stay attached to it; the
> title says what it now does.

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

Two consumers break those rules today. The dream validator ignores
`malformed` entirely; the digest's daily path drops a note silently where the
ADR requires a banner. **This package closes the second.** The first turned
out to need the validator's read/decide/commit ordering in scope, which this
package does not have — it goes to the successor named at the end.

## Current state

**Not here: the dream validator's `malformed` hole.** It is real and
measured, and it is the successor's — see the last section. Nothing in this
package touches `src/core/dream/validate.js`.

**The defect: the digest's daily path drops a note silently.**
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
| modify | src/core/digest.js | the daily path (`:745-748`) pushes an anomalous exclusion onto the banner list it already uses at `:766`; the banner wording (`:784`) becomes accurate for a heterogeneous list |
| modify | tests/unit/digest.test.js | the daily path's banner and its wording |

**Two files, both in the digest.** `src/core/frontmatter.js` is not listed:
recognition is unchanged, so nothing here needs an ADR amendment and
ADR-0022's §1 uniqueness sentinel is untouched. `src/core/dream/validate.js`
is not listed either: its `malformed` hole needs the commit pipeline's
read/decide/commit ordering in scope, which this package does not have.

### Exact contracts

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

N/A — one of ADR-0031's seven criteria fires, not two. The daily path begins
emitting a banner entry it never emitted **(iv)**, but it introduces no new
reason string, no new label, no shape change, no taxonomy, and no second
consumer: it reuses the identity path's existing strings on the list that
path already writes. An earlier revision of this spec marked this section
active on the strength of a validator contract that has since left the
package.

## Implementation notes & constraints

- **Do not touch `src/core/frontmatter.js`.** Recognition is out of scope by
  ruling, not by omission — see the residual below.
- **Zero new dependencies**; plain Node ≥ 18; JSDoc only; no build step.
  Nothing starts a process (ADR-0004).
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier introduced by this WP flows into a filesystem
      path or a shell command: the change is one push of a code-owned label
      onto an existing banner list, plus that banner's fixed template text.
      No path, filename or command is constructed. The anchored-pattern rule
      has no subject here — stated rather than deleted so the absence is
      checkable.
- [ ] The banner carries no note content: a fixed label and two fixed reason
      strings, the same code-owned rule as `:784`.
- [ ] Nothing that reaches the digest today stops reaching it, and nothing
      that is omitted today starts reaching it: this package changes only
      whether an omission is *announced*, never whether it happens.

## Acceptance criteria

- [ ] **AC1** — A daily note excluded as `malformed` or `untrusted-invalid`
      produces a banner entry labelled `daily-summary` carrying the identity
      path's existing reason string; an `untrusted-exact` exclusion and an
      absent flag produce **none**.
- [ ] **AC2** — The daily note's summary is absent from the digest in exactly
      the cases AC1 banners, and present otherwise. A banner without the
      omission, or an omission without the banner, both fail.
- [ ] **AC3** — The banner's text is accurate for a list containing a daily
      entry: no identity-only noun, and no `memory approve` instruction
      unless an identity entry is present. Asserted on all three list shapes
      — identity-only, daily-only, and mixed.
- [ ] **AC4** — The banner carries no note content: with a daily note whose
      body and frontmatter contain banner-shaped text, the emitted banner
      contains only the fixed label and the fixed reason.
- [ ] **AC5** — The full suite and lint are green. Golden fixtures change
      only where a banner is actually emitted; with an empty exclusion list
      the digest bytes are unchanged.

## Verification steps (run these; paste output in the PR)

Each new assertion must be observed on both sides — green on the finished
state, red with the guard and the push reverted separately. Paste both.

```bash
node --test tests/unit/digest.test.js
npm test
npm run lint
git diff --stat -- tests/golden/
```

## Out of scope (do NOT do these)

- **The recognition fail-open — the named residual this package leaves
  open.** See below. Nothing in `src/core/frontmatter.js` is touched.
- **The dream validator's `malformed` hole** — chartered as a successor at
  the end of this spec. Nothing in `src/core/dream/validate.js` is touched.
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
| dream Tier-3 floor, **unrecognized current revision** (`validate.js:195`) | **fails CLOSED** — zero fields reach the view, `hasAll` is false, the write is rejected as missing provenance |
| dream Tier-3 floor, **unrecognized HEAD** | **does not apply.** `tier3Decision` reads only the working tree (`fs.readFileSync`, `:186`); it never reads HEAD. A recognized, floor-passing revision passes the floor no matter what HEAD looks like |
| dream raise-only guard (`validate.js:332`) | **fails OPEN** — an unrecognized HEAD cannot be seen to carry `true`, so a lowering revision is not caught. An earlier draft of this row added "though the Tier-3 floor rejects the write on other grounds"; that was false, per the row above. A healthy ownership registry may still reject some such revisions through the id-preservation checks, which is a different mechanism and must not be described as a floor outcome |

Two earlier drafts of this table were wrong in opposite directions, which is
why it is split by *which version* is unrecognized. The first said these
shapes "read as trusted at … the dream validator" — false; the floor rejects
an unrecognized current revision. The second said the floor rejects an
unrecognized HEAD — also false; the floor never reads HEAD at all.

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

## Successor — the validator half, chartered not specced

Two rounds established that the dream validator's `malformed` hole cannot be
closed by adding checks to this package. It needs its own WP, and that WP's
scope must **include the commit pipeline's read/decide/commit ordering** —
which is precisely what this package lacked. This section is a charter, not a
design: the successor gets its own design-review loop before it goes `Ready`.

**The defect.** `src/core/dream/validate.js:161-178` builds its frontmatter
view by iterating `fm.fields` and never reads `fm.malformed`. Measured: an
exact-`---` LF block carrying floor-passing values plus a junk line yields
`parse.malformed === true` and still passes the Tier-3 floor.

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))'
```

**The charter — the doctrine to build on.** `src/core/digest.js:686-688`
already states the rule this pipeline breaks: *"Parse the SAME bytes just
hashed (no second read → no TOCTOU window)."* The validator's registration
step re-reads a file it has already decided on. The successor's starting
hypothesis is therefore **byte reuse, not a new rejection branch**: carry the
bytes the Tier-3 decision accepted forward to registration, so there is no
second read to disagree with the first.

**Three findings the successor must not re-derive.** Their raw record is
`docs/specs/logbook/2026-08-17-frontmatter-recognition-round-{8,9}-raw.md`.

- **A view-level guard is a regression, not a fix.** Emptying
  `parseFrontmatter`'s record on `malformed` erases the difference between
  *absent* and *hidden*, and every preservation check reads absence as
  agreement. Measured: a malformed HEAD carrying `id`/`origin`/`created` and
  an explicit `true`, against a revision omitting all four, is rejected today
  and **admitted** under the empty-record design. The regression is only
  visible when the ownership-registry entry's `id` is absent — with a healthy
  entry the revision is rejected by `cur.id !== entry.id` and the test passes
  by coincidence. Any regression fixture must pin that registry state.
- **`:1170` cannot reject.** By registration the Tier-3 decision has already
  accepted an earlier read, and there is no reason-returning helper whose
  caller reverts. `if (parse(text).malformed) continue` skips only the
  registry insert; Step 3 still stages and Step 5 still commits the malformed
  bytes, leaving an ADR-0022-invalid Tier-3 skill committed and unowned.
- **The Tier-3 floor never reads HEAD.** `tier3Decision` reads the working
  tree only (`:186`). Any claim that the floor rejects an unrecognized or
  malformed HEAD is false; HEAD is read separately at `:315`.

**One correction to carry.** An earlier statement of the first finding said
the validator "reports four violations" on that input. It does not: it
returns the **first** reason. Four invariants are independently violated; one
reason comes back.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs.
2. Conventional commits; PR titled
   `fix(digest): announce a daily-note exclusion instead of dropping it silently (WP-frontmatter-recognition-failopen)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`.
