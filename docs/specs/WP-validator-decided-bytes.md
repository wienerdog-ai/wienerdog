---
id: WP-validator-decided-bytes
title: Refuse a malformed frontmatter block at every Tier-3 security decision
status: In-Review
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0020, ADR-0022, ADR-0031]
epic: audit-2026-07-29
---

# WP-validator-decided-bytes: refuse a malformed block at the decisions

**The `id` is historical**: it names the commit-ordering scope that rounds 1–3
moved to The charter, and it is kept because the review record cites it.

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). Once a night the **dream** runs a model
(the "brain") that reads session transcripts and writes notes and skills into
the user's vault, which is a git repository. The brain is not trusted: when it
exits, `validateAndCommit` (`src/core/dream/validate.js`) inspects everything
that changed, reverts what policy forbids, and makes exactly one commit.

The strictest policy is the **Tier-3 floor**. Files under the vault's identity
and skills directories are *Tier-3*: they reach a new AI session's standing
context, so the dream may only write one if its provenance frontmatter says
`derived_from_untrusted: false` with `confidence >= 0.85` and
`recurrence >= 3`. Frontmatter is lexed by the one shared strict parser
(`src/core/frontmatter.js` `parse`, ADR-0022), which separates `delimited` (a
block was found at all) from **`malformed`** (a block was found but broke a
rule — an indented line, a duplicate top-level key, or a line that is not
`key: value`). ADR-0022's Decision 4 binds the answer: *a malformed block
excludes the note unconditionally, whether or not it carries the flag*, and its
Consequences claim the digest and the validator "classify identical bytes
identically".

**The validator does not do that.** `parseFrontmatter` (`validate.js:161`)
builds the validator's view by iterating `fm.fields` and never reads
`fm.malformed`, so a malformed block whose junk sits beside floor-passing
values passes the floor. Runnable, and reproduced on this tree:

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))'
# parse.malformed=true fieldsExposed=3 floorPasses=true
```

**This package closes exactly that, and nothing more.** Three adversarial review
rounds established that the pipeline's read/decide/commit ordering is a larger
and partly different problem — it contains an authorization gap this package
does not touch — so all of it is chartered out rather than half-solved here (see
The charter). What remains is one contract, C1. **Read the charter before you
assume any ordering, registration or commit-side property**: this WP guarantees
less than its history suggests, and the limit is stated in C1 as a measured
fact, not a caveat.

This package is the validator half of the charter in
`docs/specs/done/WP-frontmatter-recognition-failopen.md` (`:332`, part A). Done
specs are never edited, so two drifts ride here: that charter's
`digest.js:686-688` is `:689` here, and its `:186`/`:315` are `:187`/`:317`.
Every other citation in it re-ran unchanged.

## Current state

`src/core/dream/validate.js` (1436 lines). `validateAndCommit` (`:1041`) runs
six steps: scratch integrity (`:1074`), classify each vault change (`:1111`),
the EP2 staged-output secret gate (`:1178`), append the dream report (`:1341`),
stage-and-commit (`:1378`), and record new skills in the ownership registry
(`:1410`). Six sites consult the shared parser, five through
`parseFrontmatter` and one through `skillBody`:

- `:195` — `tier3Decision` (`:187`) parses the working copy it read at `:190`
  and applies the floor. It reads the **working tree only**; never HEAD.
- `:317` / `:325` — `skillBodyViolation` (`:295`) parses HEAD and the current
  copy it read at `:321`, then compares `id`, `origin`, `created` (`:328-330`),
  applies the raise-only rule (`:332`), and runs the promotion allowlist
  (`:353`).
- `:343` — `skillBody(curText) !== skillBody(headRes.stdout)`, the body
  comparison that decides whether a change needs an authorizing learning.
- `:500` — `ledgerViolation` (`:486`) parses the parent skill it read at `:496`
  and matches its `id` and `created` against the ownership registry. The path
  it reverts is `LEARNINGS.md`; the bytes it parses are the sibling
  `SKILL.md`'s.
- `:1170` — after the Tier-3 decision accepted the file at `:1161`,
  registration re-reads it to lift `id` and `created` for the registry. **This
  read stays exactly as it is** (Out of scope); Table A explains why no check
  can live here, and The charter carries what is wrong with it.

`parseFrontmatter` is exported (`:1430`) and `tests/unit/frontmatter-unify.test.js`
asserts its plain-record return shape (`:61`, `:93-94`); `tier3Decision`,
`skillBodyViolation` and `ledgerViolation` are internal, called only from
`validateAndCommit`.

`tests/unit/frontmatter-digest-differential.test.js` is the ADR-0022 parity
gate. Its corpus (`:19`) is twenty **value** forms of `derived_from_untrusted`
inside a well-formed block; nothing in the file makes `parse` report
`malformed`, so the ADR's malformed-parity consequence is unexercised. The
digest-side classifier a test can call without editing `digest.js` is the
exported `parseNoteResult`, which returns
`{note: null, exclusion: 'malformed'}` (`:193`).

The EP2 gate rewrites accepted working-tree bytes on one path: the redact arm
scrubs added lines in place (`:1250`) and lets the note continue to the commit.
That rewrite runs **after every decision above** and is the subject of the
charter's first hole.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec
     file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the malformed guard at the five decision sites (Table A) and the two reason strings (Table C). Nothing else — no read is added, moved or removed |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases and fixtures) |
| modify | tests/unit/frontmatter-digest-differential.test.js | extend the ADR-0022 parity gate to malformed blocks (AC4). Change no existing case |

Two files are **deliberately absent**: `src/core/frontmatter.js` (Out of scope)
and `src/core/secret-scan.js` (The charter). Round 1 also weighed
`src/cli/dream.js` and `src/core/layout.js`, and round 3 removed the last
registration work; all of it was needed only by contracts this package no longer
carries, so those files are moot here and belong to the charter's successor.

### Exact contracts

One contract, canonical in Tables A and C. Everything below cites them.

**C1 — the guard is at the decisions, never in the view.** Each of the five
security decisions in Table A refuses a malformed block *before* it compares any
field. `parseFrontmatter`'s exported plain-record return shape is a preserved
contract — the parity gate and `frontmatter-unify.test.js` read it — so how a
decision site obtains `malformed` for the same bytes is the implementer's
choice, but it must be the same bytes.

**What C1 does NOT claim.** It does not make "no invalid Tier-3 block can be
committed" true, and no surface in this spec may say so. Measured and reproduced
independently: the EP2 redact arm rewrites frontmatter **after every decision
has run**, two independent ways — redacting a high-entropy frontmatter *key*
turns a well-formed block malformed, and redacting a hexadecimal *floor value*
leaves a well-formed block that fails the floor. Both commit with
`reverted: []`. C1's guarantee is exactly *"these five decisions refuse a
malformed block"* — see The charter, hole 1.

Putting the guard in the view instead (emptying `parseFrontmatter`'s record on
`malformed`) is a **regression and must not be built**: it erases the
difference between a field that is *absent* and one that is *hidden*, and every
preservation check reads absence as agreement. Measured in the predecessor's
round 8 (`docs/specs/logbook/2026-08-17-frontmatter-recognition-round-8-raw.md`):
a malformed HEAD carrying `id`, `origin`, `created` and an explicit
`derived_from_untrusted: true`, against a revision omitting all four, is
rejected today and **admitted** under that design — visible only when the
registry entry's `id` is absent, since a healthy entry rejects at
`cur.id !== entry.id` (`:328`). AC2 pins that registry state.

## Contract reference

Activation (ADR-0031's 2-of-7) is now **one of seven** — **(iv)** two new reason
strings and a changed outcome at five decision sites. Trigger (vi) went with the
registration contract in round 3, so the threshold is **not** met.

**The tables stay anyway, and not by inertia.** Table A is not a summary of the
contract, it *is* the contract: "these five sites and no others" is only
checkable as a per-site disposition list, and the two rows marked *Refined* carry
the reason a site's outcome differs from the predecessor's ruling. Table C is a
byte-exact literal registry that a verification step greps. The Mirrored Surface
Checklist stays for the same reason — the mirrors exist whether or not a
threshold named them.

### Table A — where a malformed block is rejected

Inherited from the predecessor's round-8 placement ruling, with two rows
refined; each refinement is marked and its cause given.

| Site | Decision | On `malformed` |
|---|---|---|
| `:195` | Tier-3 floor | **reject** with R1. *Refined:* round 8 reused the existing `'Tier-3 path missing provenance frontmatter (…)'` reason here. On the repro above all three fields are present, so that reason states a falsehood and sends the user to add fields that are already there |
| `:317` / `:325` | skill-revision preservation, either side | **reject** with R1 before comparing `id` / `origin` / `created`. A malformed side is not evidence of agreement |
| `:332` | raise-only guard | **reject** with R1 before comparing the flag. A malformed HEAD must never read as "not `true`" — the absence-as-agreement hole |
| `:353` | promotion allowlist | covered by the `:317`/`:325` rejection: the loop is reached only after both sides parsed clean |
| `:500` | learnings-ledger parent-skill identity | **reject** with **R1L** before comparing against the ownership registry. *Refined:* the path this site reverts is `LEARNINGS.md` but the malformed bytes are the sibling `SKILL.md`'s, so R1's wording would point the user at the wrong file |
| `:1170` | new-skill-draft registration | **no decision here, and the read stays.** Round 9 measured why a check here cannot work: the file is already accepted and no caller converts a reason into a revert, so `if (parse(text).malformed) continue` skips only the registry insert while Steps 3 and 5 still commit the malformed bytes — `reverted: []`, a committed and ownerless Tier-3 skill |
| `:343` | `skillBody` body comparison | **out of scope, deliberately.** It compares bodies, not security fields, and this WP does not change what `body` is |

The five rejecting decision sites above are the whole of the guard: no other
site in the file reads a frontmatter field to make a security decision. They are
also its whole **extent** — a rewrite that happens after all five (the redact
arm) is not covered, by measurement and not by omission.

### Table C — the reason-string vocabulary

The validator's existing reason strings are a preserved contract; this WP adds
two and changes none. Byte-exact, code-owned, never containing note content.

| Id | Reason string | Fired at |
|---|---|---|
| R1 | `malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:195`, `:317`/`:325`, `:332` rows |
| R1L | `malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:500` row |

### Mirrored Surface Checklist

- [ ] The Deliverables row for `src/core/dream/validate.js` (cites A and C) and
      the absent/moot-files paragraph beneath it (cites Out of scope and The
      charter)
- [ ] The title, the H1, and the Context paragraph that scopes this package —
      none of which may promise a commit-side, registration or ordering property
- [ ] C1's "does NOT claim" paragraph, and the four Security-checklist residuals
      that carry the limits it names
- [ ] Acceptance criteria AC1–AC3 and AC6 (Table A), AC5 (Table C, including
      R1L's site)
- [ ] The verification steps' greps for the R1 / R1L literals
- [ ] The Current-state list of the six parse sites — Table A dispositions each
      of them, including the two that make no decision

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step; no
  process outlives its job (ADR-0004, CLAUDE.md).
- **No ADR amendment is needed and none may be written.** ADR-0022's Decision 4
  already binds malformed → exclude, and its Consequences already claim
  digest/validator parity. This WP makes an accepted decision true at five
  sites; it does not change one, and it does not fully deliver the parity
  Consequence — the charter's hole 1 is the remaining gap.
- **Do not widen the guard to compensate for what the charter holds.** A check
  added after the redact arm, a re-scan at staging, or a second changed-path
  scan are all the successor's, and adding one here re-creates the package two
  rounds just split apart.
- When uncertain: choose the simpler option and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — this WP constructs no
      new filesystem path and no shell command.** It adds refusals at existing
      decision sites and changes nothing else.
- [ ] The surface is **untrusted brain-written bytes reaching a Tier-3 path**,
      standing context for every later AI session. Containment added here: the
      five decisions in Table A refuse a malformed block instead of comparing
      fields across one. That is the whole claim — see the next two items.
- [ ] Named residual — **an invalid Tier-3 block can still be committed**, two
      independent ways. The EP2 redact arm rewrites frontmatter after all five
      decisions: a redacted *key* makes the block **malformed**, and a redacted
      hexadecimal *floor value* leaves a well-formed block that **fails the
      floor** (`recurrence` as well as `confidence`). Both commit with
      `reverted: []`. Measured; The charter, hole 1.
- [ ] Named residual — **the reads between decisions are unbound, and that is
      an authorization gap.** Bytes swapped between `:321` and `:190` commit an
      `id` the immutable-field check never saw. Measured; The charter, hole 2.
      This is the most serious of the residuals and is the successor's first
      duty.
- [ ] Named residual — **registration keeps a re-read that can in principle
      disagree with the decision.** `:1170` re-reads an accepted path to lift
      `id`/`created`. Removing it was carried through three rounds and dropped:
      the window it closes contains no scheduling point, and the read carries an
      `ENOENT` fail-stop that removing it would delete. Measured; The charter,
      hole 2.
- [ ] Named residual — **`{id: '', created: <run date>}` ships as-is.** The floor
      requires only the three provenance fields, so a floor-passing skill with no
      `id`/`created` is registered with an empty id and the run date — a value
      never present in the bytes the decision read. Measured; The charter,
      hole 2.
- [ ] Named residual — **R1 does not say which side of a revision is
      malformed.** The remedies differ (repair the working copy vs. commit a
      repair over a malformed HEAD), and distinguishing them costs a third
      literal. Accepted as a reporting-precision cost, **not** on the ground
      that malformed Tier-3 commits are impossible — round 2 measured that they
      are not, and the earlier rationale saying otherwise was false.
- [ ] No reason string carries note content; both new ones are fixed code-owned
      literals (Table C).
- [ ] Named residual, not reopened — **recognition still fails open.** A block
      `parse` does not *recognize* (`delimited: false` — a BOM opener, a leading
      blank line, CRLF, an opener with no closer) is a different defect,
      owner-ruled open in the predecessor; this WP neither widens nor narrows
      what counts as a block. At the floor an unrecognized block already fails
      `hasAll` (`:196`); an unrecognized **HEAD** in the revision guard is the
      open half, and it stays open.

## Acceptance criteria

- [ ] AC1 — A Tier-3 write whose block is malformed is reverted with R1 and is
      absent from the commit, for each rule that makes `parse` report
      `malformed` (indented line, duplicate top-level key, non-`key: value`
      line), including the repro above, whose three floor fields are all present
      and floor-passing.
- [ ] AC2 — The regression in C1 does not ship. **This criterion is a
      discrimination, not a revert**: it is met only if the test would FAIL on
      the view-level design C1 forbids. Fixture — an ownership-registry entry for
      the skill whose `id` is **absent**; a committed HEAD whose block is
      **malformed** and carries `id`, `origin`, `created` and
      `derived_from_untrusted: true`; and a revision that omits `id`, `origin`
      and `created` but **carries `derived_from_untrusted: false`,
      `confidence: 0.9` and `recurrence: 3`**, with its body change authorized so
      that no unrelated branch does the rejecting. Required outcome: the
      view-level design **admits and commits** that revision; C1 **reverts** it
      with R1. How the forbidden design is exhibited is the implementer's choice.
      **Do not weaken this to "the revision is reverted."** Measured: with the
      revision also omitting `derived_from_untrusted`, the floor's `hasAll`
      (`:196`) rejects it under *both* designs — `'Tier-3 path missing provenance
      frontmatter …'` — so the assertion goes green on the very design it exists
      to forbid. That wording was inherited from the predecessor's round-8
      finding and survived four review rounds here before it was measured.
- [ ] AC3 — A malformed HEAD cannot launder a lowering: the raise-only guard
      rejects rather than reading the absent flag as "not `true`".
- [ ] AC4 — The ADR-0022 parity gate is no longer vacuous with respect to
      malformed blocks: for inputs `parse` reports as malformed, the digest-side
      classifier (`parseNoteResult` → `exclusion: 'malformed'`) and the
      validator's Tier-3 decision both refuse. Existing cases are unchanged.
- [ ] AC5 — Exactly the two literals in Table C are added to the validator's
      reason vocabulary, no existing reason string changes, and the
      learnings-ledger site fires **R1L** — naming the parent `SKILL.md` — not
      R1, because the path it reverts is not the path whose bytes are malformed.
- [ ] AC6 — The guard does not leak below Tier-3: a malformed Tier-1/2 note (a
      daily log, a report, an ordinary note) is committed exactly as it is
      today. Table A is a list of Tier-3 decision sites and this WP adds no
      floor where there was none.
- [ ] AC7 — `npm test` and `npm run lint` pass, and running the dream twice over
      an unchanged vault is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream-validate|frontmatter"
npm test
npm run lint

# Fixture guard: the Context repro's input is still malformed, so AC1's test
# still has a subject. (That the floor now REJECTS it is AC1, asserted by the
# test suite above, not by this line.)
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";if(!parse(t).malformed)throw new Error("fixture is no longer malformed — the test lost its subject");console.log("parse.malformed=true, fieldsExposed="+Object.keys(P(t)).length)'

# Table C: both literals are present, byte for byte (a quoted heredoc, so no
# quoting accident can change what is matched).
cat > /tmp/wd-reasons.txt <<'LITERAL'
malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)
malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)
LITERAL
test "$(grep -Fof /tmp/wd-reasons.txt src/core/dream/validate.js | sort -u | wc -l | tr -d ' ')" = 2
```

The last two are NEW steps and each is an assertion — non-zero exit on failure,
never a number for a reader to judge. Measured at `c575605` before any work: the
literal count exits **1** (it asserts the fix); the fixture guard exits **0** (it
asserts a subject, not the fix). Paste a real green on the finished state **and**
a real red from a deliberately broken state, one recipe per step: the fixture's
junk line repaired; one reason literal reworded.

## Out of scope (do NOT do these)

- **The whole read/decide/commit ordering** — The charter. Nothing in this WP
  binds a read to another read, to staging, or to the commit.
- **Registration's byte reuse.** Do **not** remove or alter the `:1170` re-read.
  Removing it was this package's C2 through three rounds and was chartered out in
  round 3: the window it closes contains no scheduling point, and the read
  carries an `ENOENT` fail-stop against a path that vanishes after acceptance.
  The registry's absent-metadata and commit-membership semantics go with it.
- `src/core/frontmatter.js`. Recognition — what counts as a block at all — stays
  byte-for-byte, by ruling and not by omission (Security checklist). No
  widening, no narrowing, no ADR-0022 amendment.
- The `:343` body comparison (Table A's last row).
- The digest banner's remedy accuracy — the predecessor's successor **B**
  (`docs/specs/done/WP-frontmatter-recognition-failopen.md:383`), a six-class
  problem with no connection to this one.
- The scan-limit guard, `WP-alert-producer-freeform-residual`, and the
  product-wide line-concept question — queued separately.
- The EP2 gate's classification, its redact/withhold arms and its retention
  pruning — the queued `WP-ep2-retention-prune-timing-test` and
  `WP-ep2-atomic-withhold-handoff` own that surface today, and The charter's
  candidate (E) would change it.

## The charter — the commit pipeline, chartered not specced

Rounds 1 and 2 tried to carry the ordering in this package and failed twice; the
pre-pinned fallback fired and the owner ruled the split. This section is a
charter, not a design: the successor gets its own design-review loop. Its
subject is **two holes**, both measured at `390ebe3` with the validator
unmodified. Everything else here — late-arriving paths, the working-tree/blob
question, the failed-preservation hazard — is context for them, not a separate
programme.

### Hole 1 — the redact arm produces invalid Tier-3 commits

The EP2 redact arm (`validate.js:1250`) scrubs added lines in place **after
every decision in Table A has run**, and frontmatter lines are added lines like
any other. It breaks Tier-3 validity **two independent ways, and neither check
catches the other**: limb A leaves a malformed block, limb B leaves a
*well-formed* block that fails the floor. A successor that closes only one has
closed half the hole.

**Limb A — a redacted KEY makes the block malformed.**

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{scanAndRedact}=require("./src/core/secret-scan");const b="---\ntype: skill\nid: keyskill\ncreated: 2026-07-11\norigin: dream\nconfidence: 0.9\nrecurrence: 3\nderived_from_untrusted: false\nq7PmXz4KvR9tWc2LbN8dYfGh: harmless\n---\n\nbody\n";console.log("before.malformed="+parse(b).malformed+" after.malformed="+parse(scanAndRedact(b).text).malformed)'
# before.malformed=false after.malformed=true
```

End to end through `validateAndCommit` that note commits: `reverted: []`,
`secretRedactions: 1`, and the committed blob's `parse().malformed` is `true`.
The rewritten line is `[REDACTED:high-entropy]: harmless`. This directly
violates ADR-0022's unconditional malformed exclusion.

**Limb B — a redacted floor VALUE makes the floor fail.** The floor is
`Number(fm.confidence) >= 0.85` and `Number(fm.recurrence) >= 3` (`:203-206`),
and **`Number()` parses hexadecimal**. A 24-character hex literal is worth
`2.07698809136909e+26` — comfortably floor-passing — while clearing both
`ENTROPY_MIN_LEN` and the 3.5-bit entropy floor:

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{scanAndRedact}=require("./src/core/secret-scan");const{parseFrontmatter:P}=require("./src/core/dream/validate");const f=(t)=>{const m=P(t);return JSON.stringify({malformed:parse(t).malformed,ok:m.derived_from_untrusted===false&&Number(m.confidence)>=0.85&&Number(m.recurrence)>=3,conf:m.confidence})};const b="---\ntype: skill\nid: v\ncreated: 2026-07-11\norigin: dream\nconfidence: 0xABCDEF0123456789ABCDEF\nrecurrence: 3\nderived_from_untrusted: false\n---\n\nbody\n";console.log("BEFORE "+f(b));console.log("AFTER  "+f(scanAndRedact(b).text))'
# BEFORE {"malformed":false,"ok":true,"conf":"0xABCDEF0123456789ABCDEF"}
# AFTER  {"malformed":false,"ok":false,"conf":"[REDACTED:high-entropy]"}
```

End to end through `validateAndCommit`, for `confidence` and for `recurrence`
alike: `reverted: []`, `secretRedactions: 1`, committed, `parse().malformed`
**false**, and the committed bytes no longer pass the floor. **`recurrence` is
measured, not assumed** — it takes `Number()` on the same line and has the same
exposure. A malformed check never sees limb B.

**Limb B's reach was NOT enumerated, and a broad syntax label alone does not
determine scanner behaviour.** Redaction is a predicate on the literal's
*characters* — an unbroken run of ≥ 24 over `[A-Za-z0-9+=/]` whose Shannon
entropy is ≥ 3.5 bits/char. `Number()` acceptance is a predicate on the literal's
*syntax*. The two are independent, so naming a syntax class settles nothing by
itself. The decisive pair — one syntax class, both floor-passing, opposite
outcomes:

```text
10293847561029384756E+12   len 24, 3.522 bits/char  ->  REDACTED
102938475610293847561E12   len 24, 3.387 bits/char  ->  clean
```

The `+` is what lifts the first over the entropy floor: `ENTROPY_CORE_CLASS` is
`A-Za-z0-9+=`, so a sign is a candidate character like any other.

**Measured positive classes — evidence, not an inventory.** 24-character
hexadecimal, upper (`0xABCDEF0123456789ABCDEF`, 4.002 bits/char) and lower; and
scientific notation carrying a `+`, with either `E` or `e` (3.522 bits/char).

**Proven negative classes — these ARE uniform, because each carries a
character-level bound.** A class *can* be characterized when its alphabet or its
length is bounded, and these four are:

| Class | Bound | Why it is uniformly clean |
|---|---|---|
| ordinary decimal digit run | alphabet ≤ 10 | max `log2(10) = 3.3219` bits/char, under the 3.5 floor |
| `0b…` binary literal | alphabet ≤ 3 (`0`, `1`, `b`) | max `log2(3) = 1.5850` |
| `0o…` octal literal | alphabet ≤ 9 (`0`–`7`, `o`) | max `log2(9) = 3.1699` |
| any candidate under 24 characters | length | below `ENTROPY_MIN_LEN = 24` (`:23`) — not a candidate at all |

Measured at the maximal end of each rather than on one instance: a 122-character
binary literal (1.060 bits/char) and a 98-character octal literal (3.051) are
clean, while a 90-character hexadecimal literal (4.496) is redacted.
**Hexadecimal has no such bound** — its 23-symbol alphabet allows up to 4.5236
bits/char, above the floor — which is why it appears in the positive list.

**The rule for the successor.** Use the **character-level predicate** — an
unbroken run of ≥ 24 over `[A-Za-z0-9+=/]` at ≥ 3.5 bits/char — **unless you can
supply a bound proof for a narrower class, as the table above does.** The
positive classes are evidence, not an inventory: the intersection of
`Number()`-accepted syntax with the scanner's candidate grammar was never
computed. Three earlier drafts of this paragraph each asserted a boundary —
"decimal only", then "hexadecimal only", then "no class can be characterized at
all" — and each was falsified by the next review round. The first two were too
narrow; the third was too broad, and this table is the counterexample to it.

### Hole 2 — the reads between decisions are unbound (an authorization gap)

There are four reads of a current file — `:190` (the floor), `:321` (the revision
guard), `:496` (a *ledger's parent skill*, a different path) and `:506` (the
ledger itself) — plus `:1170`, the registration re-read, and **no two are bound
to each other.** Which fire depends on the path: a *tracked* skill revision is
read at `:321` then `:190`; an *untracked* new draft skips `skillBodyViolation`
and is read at `:190` then `:1170`. On a tracked revision `:321` owns the
immutable-field, raise-only and authorization checks and runs *before* the floor,
so bytes replaced in that window are checked in one version and committed in
another:

```bash
grep -n "fs.readFileSync(path.join(vaultDir, rel), 'utf8')" src/core/dream/validate.js
# 190:  (tier3Decision)   321:  (skillBodyViolation)   506:  (ledgerViolation, the ledger itself)
```

Measured with a compliant promotion (`status: incubating`→`active`, body
identical) served to `:321` and a version whose `id` changed `foo`→`bar` left on
disk for `:190`:

```text
reads of that path: 2
reverted: []
COMMITTED "id: bar" | registry id: "foo"
```

**This is an authorization gap, not a durability one** — the immutable-field,
raise-only and authorization checks are all bypassable — and it is the more
serious of the two holes.

#### The registration facts, measured in round 3

"Registration reuses the decided bytes" was this package's C2 through three
rounds and was removed in round 3 as measurably not worth its cost. What was
measured about it belongs here, because the ownership registry is the
tamper-resistant write-origin marker that authorizes every later revision.

**(i) The registry already records values that were never in the decided
bytes.** The floor requires only `confidence`, `recurrence` and
`derived_from_untrusted`; `id` and `created` may be absent, and `:1171`
synthesizes both — `String(fm.id || '')` and `String(fm.created || date)`.
Measured end to end on a floor-passing skill carrying only the three provenance
fields: `reverted: []`, committed, registry entry
`{"created":"2026-08-19","id":""}` — the run date, never present in the bytes the
decision read. Byte reuse alone does not fix this; the absent-metadata semantics
have to be decided.

**(ii) The `:1170` read is load-bearing beyond its stated purpose.** Its
`readFileSync` throws `ENOENT` if the accepted path vanished between the floor
and registration, and nothing catches it — that throw is the only fail-stop
against a vanished-after-acceptance path reaching Step 6. Measured with an `fs`
seam that deletes the path after the floor read: `reads: 2`, then
`ENOENT: no such file or directory, open …` propagating out of
`validateAndCommit`. **A successor that removes this read must replace the guard
deliberately.** Three review rounds and two reviewers missed it.

**(iii) Commit-membership and registry-membership can disagree in both
directions.** Round 3 compiled a scratch mutant of the literal carry-forward:
when the accepted path *disappears* after the floor, Step 5 commits nothing for
it while Step 6 still registers it; when it *moves*, the new path is committed
unchecked while the registry records the old one. Round 3's own fix — register
only when the accepted rel is present as an added/modified path in the completed
commit — is candidate **(A)** under another name, which is why this belongs in
the charter and not in a byte-reuse package.

**(iv) And the window byte reuse would have closed is the narrowest in the
file.** Between the floor's read (`:190`) and the registration read (`:1170`) on
the accepting path there are **zero** subprocesses and no I/O other than the
`:1170` read itself — pure synchronous straight-line code with no scheduling
point. By contrast `:321`→`:190` spans a `git show HEAD:<rel>` subprocess, and
`:190`→Step 5's `git add -A` spans the whole EP2 gate (**6** `git()` call sites).
The reachable registry defect is the redacted-id divergence below, which comes
from the redact arm — not from this window. Fix the wide windows first.

### Context the successor inherits, not separate problems

- **Late-arriving Tier-3 paths.** A malformed `05-Skills/late/SKILL.md` created
  during Step 4 is committed with `reverted: []` — Step 2's `changedPaths`
  (`:987`) never saw it and Step 5 stages everything. Measured.
- **Working tree vs blob.** Any invariant stated as "the committed blob equals
  the decided bytes" is false under `.gitattributes` / `core.autocrlf` / clean
  filters. Round 1 measured a 74-byte working file staging as a 73-byte blob.
  State such an invariant on the working-tree side or not at all.
- **Failed preservation is a live hazard, not a footnote.** Round 2's finding
  against the round-1 design: requiring a revert when `quarantinePreserve`
  returns `null` destroys bytes that may be the user's only copy of a mid-dream
  save, and appending `' (quarantine copy failed)'` reports the loss after the
  fact. Round 1 had deleted an abort to avoid the next run's
  `precommitSessionEdits` (`src/cli/dream.js:493`) committing dirty bytes
  unvalidated. **Both directions are unacceptable**; the successor must find a
  third, and this pair is why the ordering needs its own package.
- **The redacted-id divergence** (found in round 1, folded in here because
  candidate (E) closes it too). A new skill whose `id` holds an unbroken run of
  ≥ 24 characters over `[A-Za-z0-9+=/]` at ≥ 3.5 bits/char is registered in
  Step 2 and redacted in Step 3; the `secretReverted` splice (`:1335-1337`)
  removes only secret-**reverted** rels from `newSkills`, never redacted ones.
  Measured: registry `q7PmXz4KvR9tWc2LbN8dYfGh`, committed blob
  `id: [REDACTED:high-entropy]`, `reverted: []`. It fails closed both ways
  (`:328`, `:501`), so it is not a bypass — it costs durability and honesty: the
  skill becomes permanently unrevisable and un-ledgerable, and the reason the
  user reads, `path reuse`, **is false**. The trigger is not exotic:
  `onboardingredesignproject`, 25 plain-English characters with no hyphen, is
  redacted.

### Candidates, (E) first

| Candidate | Mechanism | Why it ranks here |
|---|---|---|
| **(E) decline the rewrite** | route every Tier-3 redact-severity finding to the withhold arm instead of scrubbing in place | **first candidate.** The one branch that closes hole 1 and the id divergence together, at their source — no grammar, no extra read, no cross-module constant. Costs a user-visible behaviour change on a surface the queued EP2 packages own |
| **(A) bind the output** | registration reads `id`/`created` from the committed blob at Step 6 | closes the id divergence only, not hole 1. Adds a read to a package whose doctrine is byte reuse, and makes distinct skills share an id (two different hot ids both commit as `[REDACTED:high-entropy]`) |
| **(D) constrain the input** | validate the `id`'s shape at the Tier-3 decision so the scanner cannot rewrite it | closes the id divergence only. The grammar must encode a max-unbroken-run bound below `ENTROPY_MIN_LEN` plus the entropy floor — two constants owned by another module — and no pattern in `src/` carries such a bound (`transcripts/claude.js:73`, `cli/schedule.js:968`/`:1060`, `validate.js:364`/`:422` all admit `onboardingredesignproject`). It is the rule class `WP-frontmatter-recognition-failopen.md:321` warns about |

Hole 2 is not addressed by any of the three. Its shape is a single captured
buffer passed to every current-version check and to staging — round 2's own
recommendation — and it is the successor's first duty because it is the only
authorization gap of the set.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs.
2. Conventional commits; PR titled
   `fix(dream): refuse a malformed frontmatter block at every Tier-3 decision (WP-validator-decided-bytes)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`. `In-Review`
   marks the START of review: this list is complete only when review is.
