---
id: WP-frontmatter-recognition-failopen
title: Stop the digest dropping a daily note silently
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0022, ADR-0004]
epic: audit-2026-07-29
---

# WP-frontmatter-recognition-failopen: the silent daily exclusion

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **Read this first.** This package once tried to close the frontmatter
> **recognition** fail-open, then to guard two consumers that ignore
> `malformed`. Eleven design-review rounds narrowed it three times. **What ships here
> is one thing**: the digest's daily path stops dropping an anomalous
> exclusion silently, which ADR-0022's Consequences require. Three things it
> does NOT do, each stated with its evidence below — it does not close the
> recognition fail-open (`## Residual R-RECOGNITION`), it does not fix the
> dream validator's handling of `malformed`, and it does not fix the banner's
> remedy text (both `## Successors`). The spec's `id` is kept so the whole
> logbook record stays attached to it — eleven rounds, two round-zero passes
> and one aborted attempt; the title says what it now does.

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

**The banner's remedy text is inaccurate today, and this WP does not fix
it.** Six sites push onto that list — `:682`, `:691`, `:692`, `:711`, `:738`,
`:766` — and `:784`'s single template tells every one of them to "fix their
frontmatter" or run `wienerdog memory approve`. Measured: `memory approve`
records an exact-byte **hash** only (`memory.js:19-21`), so it cannot resolve
a malformed block, an unclear flag, or a secret; and `active-projects`
(`:738`) has no frontmatter to fix. **Every one of the six classes is offered
at least one remedy that cannot resolve it, and three of them — the secret
rows — are offered none that can** (the canonical table is in successor
charter B; this sentence is its mirror and must not diverge from it). Making it right is a six-class problem
with no connection to provenance, so it is chartered as a successor rather
than folded in here.

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
| modify | src/core/digest.js | the daily path (`:745-748`) pushes an anomalous exclusion onto the banner list it already uses at `:766`. The banner template at `:784` is **not** touched |
| modify | tests/unit/digest.test.js | the daily path against Table A |

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
exclusion and a **missing `derived_from_untrusted` key** stay **silent**:
they are normal policy, not anomalies (ADR-0022 §4). Note the collision of
words — this "missing key" sense is not Table A row 3's `absent`, which is the
exclusion class meaning *the file could not be opened*. Both are silent, for
different reasons. No new reason string, no new banner, no new
mechanism.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iv)** the daily path begins emitting a
banner entry it never emitted, and **(vii)** the same outcome contract appears
in the Deliverables cell, Current state, Exact contracts, the Security
checklist, the acceptance criteria and the verification steps. Two of seven.
An earlier revision marked this section N/A counting only (iv); the
mirrored-surface trigger was the one that had already produced a
self-contradicting acceptance criterion.

### Table A — the daily path, as an ORDERED decision

**First row whose condition holds decides; later rows are not reached.** The
order is the code's own (`digest.js:745-772`), not a reading of it — two
earlier revisions of this contract used independent tables and were defeated
by inputs that satisfied more than one, or none. Ordering makes the table
mutually exclusive and exhaustive by construction rather than by enumeration.

**Outcome only.** What the banner *says* — its noun and its remedy — is not
this WP's contract; see the successors.

| # | Condition, evaluated in this order | Summary block | Banner entry | Change |
|---|---|---|---|---|
| 1 | `newestDaily` finds no candidate | none | none | unchanged |
| 2 | `DAILY_SUMMARY_INJECTION` not allowed for the profile | none — **the note is never read** | none | unchanged. This is why a malformed note under a blocked capability stays silent |
| 3 | `readNoteBounded` → `absent` (the file could not be opened) | none | none | unchanged — an unreadable file is not a provenance anomaly |
| 4 | → `malformed` | none | **`daily-summary` / `malformed frontmatter`** | **NEW** |
| 5 | → `untrusted-invalid` | none | **`daily-summary` / `unclear derived_from_untrusted value`** | **NEW** |
| 6 | → `untrusted-exact` | none | none — normal policy, not an anomaly (ADR-0022 §4) | unchanged |
| 7 | `extractSection` finds no `## Summary`, or an empty one | none | none | unchanged. Includes the CRLF case, where the heading match cannot fire (`:327`) |
| 8 | the secret gate fires on the normalized summary (`:765-766`) | none | the **existing** `daily-summary` / `appears to contain a secret` | unchanged |
| 9 | otherwise | emitted, framed per ADR-0032 | none | unchanged |

**Rows 4 and 5 are the whole change.** Every other row states today's
behaviour so the implementer can see that it must not move, and so the
acceptance criteria have something exhaustive to assert against.

**The bounded read is a prefix, and that is not a new hazard.**
`readNoteBounded` reads at most `MAX_DAILY_READ_BYTES` and trims a partial
UTF-8 tail, so rows 4–9 all decide on a prefix. A `## Summary` beyond that
bound is invisible today and stays invisible; the classification in rows 4–6
is the prefix's classification, exactly as now.

### Table B — the cap, which this WP does make worse

| Fact | Value |
|---|---|
| `capDigest` reserves the prefix's lines first | `lineBudget = MAX_LINES - prefixLineCount` (`:583`) |
| and its bytes first | `bodyByteBudget = MAX_BYTES - prefixBytes - markerBytes` (`:599`) |
| so a new prefix line | **displaces body content** when the digest is at the cap |
| measured | adding the row-4 entry to a digest at the 120-line cap dropped two previously emitted identity body lines, truncation marker retained |

This is a real user-visible consequence and it is **authorized, not denied**:
the prefix-first policy is existing, deliberate (`:580-582` says the prefix
"can never be squeezed out by the body's line budget"), and this WP adds one
line to it. What must not change is the cap's constants, its algorithm, its
truncation marker, and the list's ordering.

### Mirrored Surface Checklist

- [ ] The Deliverables cell for `src/core/digest.js`
- [ ] Current state's description of the silent drop
- [ ] Exact contracts' "The daily banner" paragraph
- [ ] The Security checklist's no-note-content claim and its cap wording
- [ ] Acceptance criteria AC1–AC5
- [ ] The verification steps

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
- [ ] **Admission is unchanged; the cap is not.** No note that is admitted
      today becomes omitted, and none omitted today becomes admitted — Table
      A's rows 1-3 and 6-9 are all "unchanged". But an added prefix line
      **does** displace body content when the digest is at its cap (Table B,
      measured), so the claim is bounded to admission decisions before
      `capDigest`. An earlier revision of this box claimed nothing stops
      reaching the digest, which the cap's prefix-first policy makes false.

## Acceptance criteria

- [ ] **AC1** — **Every row of Table A is asserted, in order.** Each of the
      nine rows produces exactly the summary presence and the banner entry it
      states. Rows 4 and 5 are the only ones whose "after" differs from
      today; the other seven are regression assertions.
- [ ] **AC2** — **The ordering itself is asserted, not just the rows.** At
      least three inputs satisfying more than one row's condition are tested
      and land on the earlier row: a malformed note under a blocked
      capability (row 2 wins over row 4), a malformed note with no `##
      Summary` (row 4 wins over row 7), and a malformed note whose summary
      would trip the secret gate (row 4 wins over row 8). An earlier revision
      of this contract used independent tables and could be satisfied by
      choosing fixtures that never overlapped.
- [ ] **AC3** — The emitted entry carries no note content: with a daily note
      whose body and frontmatter contain banner-shaped text, the entry is the
      fixed label and the fixed reason and nothing else.
- [ ] **AC4** — The banner template at `:784` is byte-unchanged, and the cap's
      constants, algorithm, truncation marker and list ordering are unchanged.
      Body displacement under cap pressure is **expected**, per Table B, and
      is pinned by a line-cap and a byte-cap assertion rather than denied.
- [ ] **AC5** — The full suite and lint are green. Golden fixtures change
      only where a banner entry is newly emitted; with an empty exclusion
      list the digest bytes are unchanged.

## Verification steps (run these; paste output in the PR)

Each new assertion must be observed on both sides — green on the finished
state, and red with the push reverted — and, separately, with each of its two
branches reverted on its own, since either alone must be non-vacuous. Paste
each red run. There is no second artifact to revert: round 10 narrowed this
package to the push alone.

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
- **The banner's remedy accuracy across all six exclusion classes** — also
  chartered at the end. `digest.js:784` is byte-unchanged here.
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

The raw record of all eleven rounds, and the reference implementations that
were measured, are in `docs/specs/logbook/` under
`2026-08-1{6,7}-frontmatter-recognition-*`.

## Successors — chartered, not specced

### A. The validator half

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

### B. The banner's remedy accuracy

`digest.js:784` renders one fixed template for a list six different sites
write to, and its remedy is inaccurate for **every one of them** today, before this
WP — in two different degrees, set out in the table.
This WP adds a seventh writer and leaves the template byte-unchanged; making
the template accurate is a separate, six-class problem with no connection to
provenance.

Measured, so the successor does not re-derive it. `memory approve` records an
exact-byte **hash** and nothing else (`src/cli/memory.js:19-21`), and its
allowlist is exactly `profile`, `preferences`, `goals`, `instructions`
(`memory.js:27-32`).

| Push site | Entry | Reason | What the template tells the user | Valid? |
|---|---|---|---|---|
| `:682` | an identity note | not yet approved / changed since approval | fix frontmatter, **or** `memory approve` | the `memory approve` half is correct; "fix their frontmatter" is not |
| `:691` | an identity note | `malformed frontmatter` | both | "fix frontmatter" is correct; `memory approve` cannot help |
| `:692` | an identity note | `unclear derived_from_untrusted value` | both | same as `:691` |
| `:711` | an identity note | `appears to contain a secret` | both | **neither** — the secret must be removed |
| `:738` | `active-projects` | `appears to contain a secret` | both | **neither**, and it has no frontmatter to fix |
| `:766` | `daily-summary` | `appears to contain a secret` | both | **neither** |
| *new here* | `daily-summary` | provenance (Table A) | both | "fix frontmatter" is correct; `memory approve` cannot help |

**Two degrees, counted explicitly** — an earlier draft said "wrong for four
of six" without stating its unit, and no reading of the table produced four.
Every one of the six existing rows is offered at least one remedy that cannot
resolve it. Three of them — the secret rows `:711`, `:738`, `:766` — are
offered **no** valid remedy at all.

**The charter.** Remedy text is a function of the reason class, not of the
banner. Either key it per class, or replace it with one sentence that is true
for every member. Keep every string code-owned and fixed-template — the
banner's existing rule (`:782-784`) is that no note content may enter it, and
that rule is not in question.

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
