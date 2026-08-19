---
id: WP-validator-decided-bytes
title: Refuse a malformed frontmatter block at every Tier-3 security decision
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0020, ADR-0022, ADR-0031]
epic: audit-2026-07-29
---

# WP-validator-decided-bytes: refuse a malformed block at the decisions

**The `id` is deliberately unchanged.** It no longer matches the title: rounds 1
and 2 split the commit-ordering half out of this package (see The charter), and
the id is the identifier three logbook files, the round record and the branch
already cite. Renaming it would orphan that record to fix a cosmetic mismatch.

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

**This package closes exactly that, and nothing more.** Two adversarial review
rounds established that the pipeline's read/decide/commit ordering is a larger
and partly different problem — it contains an authorization gap this package
does not touch — so it is chartered out rather than half-solved here (see The
charter). **Read the charter before you assume any ordering property**: what
this WP guarantees is narrower than its history suggests, and both narrowings
are stated in C1 and C2 as measured limits, not as caveats.

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
  registration re-reads it to lift `id` and `created` for the registry.

**The reads of a current file are four, not one** (`:190`, `:321`, `:496`,
`:506`), and no two are bound to each other. Which fire depends on the path:
a *tracked* skill revision is read at `:321` then `:190`; an *untracked* new
draft skips `skillBodyViolation` and is read at `:190` then `:1170`. `:496`
reads a **different** file — the parent `SKILL.md` of a `LEARNINGS.md` under
validation — and `:506` reads that ledger itself. Table B says what C2 does and
does not do about this; the gap between `:321` and `:190` is the charter's.

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
| modify | src/core/dream/validate.js | the malformed guard at the five decision sites (Table A), removing the `:1170` re-read (Table B), and the two reason strings (Table C) |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases and fixtures) |
| modify | tests/unit/frontmatter-digest-differential.test.js | extend the ADR-0022 parity gate to malformed blocks (AC5). Change no existing case |

Two files are **deliberately absent**: `src/core/frontmatter.js` (Out of scope)
and `src/core/secret-scan.js` (The charter). Round 1 also weighed
`src/cli/dream.js` and `src/core/layout.js`; both were needed only by the
commit-ordering contract this package no longer carries, so they are moot here
and belong to the charter's successor.

### Exact contracts

Two contracts, canonical in Tables A–C. Everything below cites them.

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

**C2 — registration uses the bytes the floor decided on.** The Tier-3 decision
carries the bytes it accepted forward to registration; the `:1170` re-read is
removed (Table B). On the new-draft path that is the whole of the second read,
so the ownership registry can no longer record an `id`/`created` that the
accepting decision never saw.

**What C2 does NOT claim.** It does not make "one read per path" true. Three
reads of a current file remain (`:190`, `:321`, `:496`), none bound to another,
and the window between `:321` and `:190` on a tracked skill revision is an
**authorization gap**, not a durability one — measured, and the charter's second
hole. No surface in this spec may describe C2 as decide-once.

## Contract reference

Activation (ADR-0031's 2-of-7), two of seven: **(iv)** two new reason strings
and a changed outcome at five decision sites; **(vi)** the ownership registry
inherits C2's byte-reuse contract.

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
| `:1170` | new-skill-draft registration | **no decision here** — under C2 this read does not exist. Round 9 measured why a check here cannot work: the file is already accepted and no caller converts a reason into a revert, so `if (parse(text).malformed) continue` skips only the registry insert while Steps 3 and 5 still commit the malformed bytes — `reverted: []`, a committed and ownerless Tier-3 skill |
| `:343` | `skillBody` body comparison | **out of scope, deliberately.** It compares bodies, not security fields, and this WP does not change what `body` is |

The five rejecting decision sites above are the whole of the guard: no other
site in the file reads a frontmatter field to make a security decision. They are
also its whole **extent** — a rewrite that happens after all five (the redact
arm) is not covered, by measurement and not by omission.

### Table B — the reads, and exactly what C2 changes

| Fact / rule | Value |
|---|---|
| Reads of a current file today | four sites, none bound to another: `:190` (floor), `:321` (revision guard), `:496` (a ledger's parent skill — a different path), `:506` (the ledger itself). Plus `:1170`, the registration re-read |
| Which fire per path | a *tracked* skill revision: `:321` then `:190`. An *untracked* new draft: `:190` then `:1170` (`skillBodyViolation` returns null for new ADDs) |
| What C2 removes | the `:1170` re-read only. Registration takes `id` and `created` from the bytes `:195` decided on |
| What C2 therefore guarantees | the ownership registry cannot record an `id`/`created` that the accepting Tier-3 decision never saw |
| What C2 does NOT guarantee | one read per path. The `:321`→`:190` window remains and is an **authorization gap**: bytes swapped there pass the immutable-field, raise-only and authorization checks on one version and commit another. Measured — The charter, hole 2 |
| Not in this package | any invariant over what reaches the commit. Late-arriving Tier-3 paths, the working-tree/blob question and the redact arm's rewrite are all the charter's |
| Preserved unchanged | the Tier-3 thresholds, the identity freeze (`:1142`), the revision guard's own rules, the secret gate's classification and both arms, the retention pruning, the single commit, and registry-after-commit (`:1410`) |

### Table C — the reason-string vocabulary

The validator's existing reason strings are a preserved contract; this WP adds
two and changes none. Byte-exact, code-owned, never containing note content.

| Id | Reason string | Fired at |
|---|---|---|
| R1 | `malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:195`, `:317`/`:325`, `:332` rows |
| R1L | `malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:500` row |

### Mirrored Surface Checklist

- [ ] The Deliverables row for `src/core/dream/validate.js` (cites A, B and C)
      and the absent/moot-files paragraph beneath it (cites Out of scope and
      The charter)
- [ ] The title, the H1, and the Context paragraph that scopes this package —
      none of which may promise a commit-side or decide-once property
- [ ] C1's and C2's "does NOT claim" paragraphs, and the two Security-checklist
      residuals that carry the same two limits
- [ ] Acceptance criteria AC1–AC3 and AC7 (Table A), AC4 (Table B), AC6
      (Table C, including R1L's site)
- [ ] The verification steps' greps for the R1 / R1L literals and for the
      removed `:1170` expression
- [ ] The Current-state list of the six parse sites and the four read sites —
      Table A dispositions each parse site, Table B each read site

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
      decision sites and removes one read.
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
      This is the more serious of the two and is the successor's first duty.
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
- [ ] AC2 — The regression in C1 does not ship: with an ownership-registry entry
      whose `id` is absent, a malformed committed HEAD carrying `id`, `origin`,
      `created` and `derived_from_untrusted: true`, and a floor-passing revision
      omitting all four, the revision is reverted.
- [ ] AC3 — A malformed HEAD cannot launder a lowering: the raise-only guard
      rejects rather than reading the absent flag as "not `true`".
- [ ] AC4 — C2 holds, and only C2: an accepted new skill draft is registered
      with the `id` and `created` of the bytes its Tier-3 decision read, and no
      read of that path happens after the decision. A test asserting anything
      about bytes changing *between other* decisions belongs to the charter, not
      here.
- [ ] AC5 — The ADR-0022 parity gate is no longer vacuous with respect to
      malformed blocks: for inputs `parse` reports as malformed, the digest-side
      classifier (`parseNoteResult` → `exclusion: 'malformed'`) and the
      validator's Tier-3 decision both refuse. Existing cases are unchanged.
- [ ] AC6 — Exactly the two literals in Table C are added to the validator's
      reason vocabulary, no existing reason string changes, and the
      learnings-ledger site fires **R1L** — naming the parent `SKILL.md` — not
      R1, because the path it reverts is not the path whose bytes are malformed.
- [ ] AC7 — The guard does not leak below Tier-3: a malformed Tier-1/2 note (a
      daily log, a report, an ordinary note) is committed exactly as it is
      today. Table A is a list of Tier-3 decision sites and this WP adds no
      floor where there was none.
- [ ] AC8 — `npm test` and `npm run lint` pass, and running the dream twice over
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

# Table B: the `:1170` registration re-read is gone. A tripwire for the exact
# expression removed, not a proof of C2 — AC4's behavioural case asserts that.
! grep -n 'parseFrontmatter(fs.readFileSync' src/core/dream/validate.js

# Table C: both literals are present, byte for byte (a quoted heredoc, so no
# quoting accident can change what is matched).
cat > /tmp/wd-reasons.txt <<'LITERAL'
malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)
malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)
LITERAL
test "$(grep -Fof /tmp/wd-reasons.txt src/core/dream/validate.js | sort -u | wc -l | tr -d ' ')" = 2
```

The last three are NEW steps and each is an assertion — non-zero exit on
failure, never a number for a reader to judge. Measured at `390ebe3` before any
work: the `:1170` tripwire and the literal count exit **1** (they assert the
fix); the fixture guard exits **0** (it asserts a subject, not the fix). Paste a
real green on the finished state **and** a real red from a deliberately broken
state, one recipe per step: the fixture's junk line repaired; the `:1170`
re-read restored; one reason literal reworded.

## Out of scope (do NOT do these)

- **The whole read/decide/commit ordering** — The charter. Nothing in this WP
  binds a read to another read, to staging, or to the commit.
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

**The boundary, measured, so the successor does not re-derive it.** Only the
hexadecimal form reaches limb B. **Decimal cannot:** a floor-passing decimal
`confidence` is digits-only, and a digits-only run caps at `log2(10) = 3.3219`
bits/char — below `ScanLimits.ENTROPY_MIN_BITS_PER_CHAR = 3.5`
(`src/core/secret-scan.js:24`). `0b…` (alphabet of 2) and `0o…` (alphabet of 8)
are floor-passing but clean for the same reason, and hex at 23 characters is
clean because it is under `ENTROPY_MIN_LEN = 24` (`:23`). Eight
`Number()`-parsable forms were measured; exactly the two hex forms of 24
characters or more are redacted. The obvious decimal constructions do not work,
and that is why the limb reads as impossible until you try a radix prefix.

### Hole 2 — the reads between decisions are unbound (an authorization gap)

`:190`, `:321` and `:496` are separate reads of a current file, and no two are
bound. On a tracked skill revision the order is `:321` (the revision guard, which
owns the immutable-field, raise-only and authorization checks) then `:190` (the
floor). Bytes replaced in that window are checked in one version and committed in
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
