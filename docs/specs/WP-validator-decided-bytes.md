---
id: WP-validator-decided-bytes
title: Reject a malformed Tier-3 block at the decision, and commit only bytes that were decided
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0020, ADR-0022, ADR-0024, ADR-0031]
epic: audit-2026-07-29
---

# WP-validator-decided-bytes: decide once, on the bytes that get committed

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

**The second half is ordering, and it is why a check alone will not do.** The
Tier-3 decision reads a file and decides on what it read; registration then
re-reads the same path (`:1170`), and Step 5 stages whatever is on disk at that
later moment (`:1378`). Nothing binds those to the decision. The doctrine this
breaks is written down twice inside the product — `digest.js:689` ("Parse the
SAME bytes just hashed (no second read → no TOCTOU window)", same rule at
`:185`) and at `quarantinePreserve` (`:664`), which returns the bytes it
preserved because a second read to obtain them "is the TOCTOU this return
closes". This WP applies it to the Tier-3 path: **decide once, and commit the
bytes that were decided.**

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

- `:195` — `tier3Decision` (`:187`) reads the working copy (`:190`) and applies
  the floor. It reads the **working tree only**; it never reads HEAD.
- `:317` / `:325` — `skillBodyViolation` (`:295`) parses HEAD and the current
  copy, then compares `id`, `origin`, `created` (`:327-330`), applies the
  raise-only rule (`:332`), and runs the promotion allowlist (`:346`).
- `:343` — `skillBody(curText) !== skillBody(headRes.stdout)`, the body
  comparison that decides whether a change needs an authorizing learning.
- `:500` — `ledgerViolation` (`:486`) matches the parent skill's `id` and
  `created` against the ownership registry. The path it reverts is
  `LEARNINGS.md`; the bytes it parses are the sibling `SKILL.md`'s.
- `:1170` — after the Tier-3 decision accepted the file at `:1161`,
  registration re-reads it to lift `id` and `created` for the registry.

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

The EP2 gate rewrites accepted working-tree bytes on exactly one path: the
redact arm scrubs added lines in place (`:1250`) and lets the note continue to
the commit. `quarantinePreserve` (`:670`) keeps a copy of working-tree bytes
before they are destroyed (`kind: 'withheld'` → `state/quarantine/`); when it
fails, the gate's shipped degraded path reverts anyway and appends
`' (quarantine copy failed)'` to the reason (`:1300`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec
     file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the malformed guard at the decision sites (Table A), the decide-once/commit-decided-bytes ordering (Table B), and the three reason strings (Table C) |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases and fixtures) |
| modify | tests/unit/frontmatter-digest-differential.test.js | extend the ADR-0022 parity gate to malformed blocks (AC6). Change no existing case |

`src/core/frontmatter.js` is deliberately absent — see Out of scope. Three more
files were **considered and declined**, so a later reader sees a decision rather
than an omission:

| Declined | Why |
|---|---|
| src/cli/dream.js | round 1 showed the draft's proposed abort left dirty bytes that the next run's `precommitSessionEdits` (`dream.js:493`) commits unvalidated. Fixed by deleting the abort (Table B), not by building recovery for it; the same exposure on the secret gate's shipped abort (`:1286`) is pre-existing |
| src/core/layout.js | layout disjointness is a separate product decision — see the nested-`reports_dir` residual (Security checklist) |
| src/core/secret-scan.js | see Discovered pre-existing defect |

### Exact contracts

Three contracts, canonical in Tables A–C. Everything below cites them.

**C1 — the guard is at the decisions, never in the view.** Each security
decision refuses a malformed block *before* it compares any field (Table A).
`parseFrontmatter`'s exported plain-record return shape is a preserved
contract — the parity gate and `frontmatter-unify.test.js` read it — so how a
decision site obtains `malformed` for the same bytes is the implementer's
choice, but it must be the same bytes.

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

**C2 — decide once.** The Tier-3 decision carries the bytes it accepted
forward to registration; there is no second *deciding* read of that path
(Table B). This alone fixes nothing observable — it removes a read whose only
power was to disagree — and is stated separately because C3′ depends on there
being exactly one decided version of each path.

**C3′ — commit only decided bytes, over the set this run decided.** For every
path on which this run made an **accepting Tier-3 decision**, the file's bytes
immediately before Step 5 stages are byte-identical to the bytes that decision
read; otherwise the path is preserved, reverted and reported with R2 (Table B).
The quantifier is the accepting-decision set Step 2 builds, **not** "every
Tier-3 path in the commit": Table B's *Outside C3′* row names the exception set
and the Security checklist states what each one leaves exposed. The EP2 redact
arm's in-place scrub is the one authorized rewrite and is exempt; **there is no
re-decision.**

## Contract reference

Activation (ADR-0031's 2-of-7), three of seven: **(iv)** three new reason
strings and a changed outcome at five decision sites; **(v)** the run crosses an
authority boundary — the Tier-3 decision accepts bytes the staging step, a
different owner, commits; **(vi)** the ownership registry and the dream report
both inherit the contract.

### Table A — where a malformed block is rejected

Inherited from the predecessor's round-8 placement ruling, with two rows
refined; each refinement is marked and its cause given.

| Site | Decision | On `malformed` |
|---|---|---|
| `:195` | Tier-3 floor | **reject** with R1. *Refined:* round 8 reused the existing `'Tier-3 path missing provenance frontmatter (…)'` reason here. On the repro above all three fields are present, so that reason states a falsehood and sends the user to add fields that are already there |
| `:317` / `:325` | skill-revision preservation, either side | **reject** with R1 before comparing `id` / `origin` / `created`. A malformed side is not evidence of agreement |
| `:332` | raise-only guard | **reject** with R1 before comparing the flag. A malformed HEAD must never read as "not `true`" — the absence-as-agreement hole |
| `:346` | promotion allowlist | covered by the `:317`/`:325` rejection: the loop is reached only after both sides parsed clean |
| `:500` | learnings-ledger parent-skill identity | **reject** with **R1L** before comparing against the ownership registry. *Refined:* the path this site reverts is `LEARNINGS.md` but the malformed bytes are the sibling `SKILL.md`'s, so R1's wording would point the user at the wrong file |
| `:1170` | new-skill-draft registration | **no decision here** — under C2 this read does not exist. Round 9 measured why a check here cannot work: the file is already accepted and no caller converts a reason into a revert, so `if (parse(text).malformed) continue` skips only the registry insert while Steps 3 and 5 still commit the malformed bytes — `reverted: []`, a committed and ownerless Tier-3 skill |
| `:343` | `skillBody` body comparison | **out of scope, deliberately.** It compares bodies, not security fields, and this WP does not change what `body` is |

The five rejecting decision sites above are the whole of the guard: no other
site in the file reads a frontmatter field to make a security decision.

### Table B — the read/decide/commit ordering

| Fact / rule | Value |
|---|---|
| Deciding reads per accepted Tier-3 path | exactly one, at `:195`. The `:1170` re-read is removed (C2). A read that only *compares* bytes is a verification read, not a deciding one, and is permitted |
| What registration records | `id` and `created` from the bytes `:195` decided on — never from a fresh read |
| The commit invariant (C3′) | quantified over the paths this run made an **accepting Tier-3 decision** on — Tier-3 only (`isTier3`, `:1056`). For each, the file's bytes immediately before Step 5 stages are byte-identical to the bytes that decision read |
| Which side of git the comparison is on | working tree to working tree, both pre-filter. This WP makes **no claim about the committed blob's bytes**: `.gitattributes`, `core.autocrlf` and clean filters transform what git stores, exactly as they do today |
| The one authorized rewrite | the EP2 redact arm's in-place scrub (`:1250`). A path the arm scrubbed is **exempt** and keeps today's behaviour. **No re-decision**: the rewrite is code-owned and its own gate already decided it |
| **Outside C3′** (the exception set) | `LEARNINGS.md` (under `skills_dir`, so `isTier3`, but accepted by `ledgerViolation`, never by `:195`); the Step-4 report (`:1341`), code-owned and written after the check; any Tier-3 path with no accepting decision, including one that appeared after `changedPaths` (`:987`) ran. Each is disclosed in the Security checklist; none is closed here |
| On a violation | `quarantinePreserve(…, 'withheld')` (`:670`), then revert, then record R2. Reverting without preserving is forbidden while preservation is possible: the user can save a vault file mid-dream, and the bytes on disk may be the only copy of what they wrote |
| When preservation fails | revert anyway and append the shipped `' (quarantine copy failed)'` suffix (`:1300`) — the degraded path the secret gate already ships for the identical situation. **No new abort**, no new reason string |
| Why Tier-1/2 is out | those notes are never decided against a floor, so there is no decided version to compare them to (AC8) |
| Preserved unchanged | the thresholds, the identity freeze (`:1142`), the revision guard's rules, the secret gate's classification and both arms, the retention pruning, the single commit, and registry-after-commit (`:1410`) |

### Table C — the reason-string vocabulary

The validator's existing reason strings are a preserved contract; this WP adds
three and changes none. Byte-exact, code-owned, never containing note content.

| Id | Reason string | Fired at |
|---|---|---|
| R1 | `malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:195`, `:317`/`:325`, `:332` rows |
| R1L | `malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)` | Table A's `:500` row |
| R2 | `changed after it was checked, so what would be committed is not what passed the checks; not committed` | Table B's commit invariant |

R2 carries the preserved-copy suffix the secret gate already appends to its own
reasons, naming the copy in `state/quarantine/`; when preservation failed it
carries `' (quarantine copy failed)'` instead (Table B).

### Mirrored Surface Checklist

- [ ] The Deliverables row for `src/core/dream/validate.js` (cites A, B and C)
      and the declined-files table beneath it (cites Table B, the Security
      checklist and the Discovered pre-existing defect)
- [ ] Acceptance criteria AC1–AC5 and AC8 (Table A and Table B facts), AC7
      (Table C, including R1L's site)
- [ ] The verification steps' greps for the R1 / R1L / R2 literals
- [ ] The Current-state list of the six parse sites — Table A dispositions each
      of them, plus the two decisions (`:332`, `:346`) that reuse those parses
- [ ] Implementation notes: the redact-arm carve-out, the verification-read
      rule, the residual staging window, and the ordering trap
- [ ] Security checklist: the reason-string claim, and one residual per entry in
      Table B's *Outside C3′* row plus the no-blob-claim residual

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step; no
  process outlives its job (ADR-0004, CLAUDE.md).
- **No ADR amendment is needed and none may be written.** ADR-0022's Decision 4
  already binds malformed → exclude, and its Consequences already claim
  digest/validator parity. This WP makes an accepted decision true.
- **C3′'s comparison is a verification read, not a deciding one.** Comparing the
  file's current bytes against the buffer `:195` decided on (a `Buffer.compare`,
  no parse) neither violates C2 nor trips C2's grep, which matches
  `parseFrontmatter(fs.readFileSync`; only a read that *decides* is the one C2
  removes. Its residual window is named honestly: a write landing between the
  comparison and `git add -A` is not caught. The window shrinks from the whole
  run to the staging step, and closing it further needs index plumbing that
  costs more than it buys.
- **The ordering trap.** Step 4 (`:1341`) writes the dream report between the
  secret gate and the commit, so a C3′ check placed after it cannot get its own
  reverts into the report the user reads. A check placed before the redact arm
  has finished will fight it — and the arm's output is exempt, so it must not be
  compared at all. Table B states the outcome; where the code goes is yours.
- **Do not separate the retention pair.** The queued
  `WP-ep2-retention-prune-timing-test` has a dispatch gate that asserts, over
  `validate.js`, that the comment `Retention, once per run…` and the call
  `if (secretRedactions > 0) pruneRedactedOriginals(stateDir,
  redactedCreated);` (`:1332-1333`) are **adjacent**, that the call appears
  exactly once, and that it sits after the `scanTokens` loop's closing brace.
  Your C3′ check lands near there. Inserting anything between that comment and
  that call, or moving the call inside the loop, blocks that WP; nothing here
  requires either. That WP also delivers `tests/unit/dream-validate.test.js`, so
  keep your additions additive.
- When uncertain: choose the simpler option and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — this WP constructs no
      new filesystem path and no shell command.** Vault-relative paths come from
      `changedPaths` (git's output) and reach `quarantinePreserve`, whose
      `displayName` basename sanitizer (`:685`) is unchanged.
- [ ] The surface is **untrusted brain-written bytes reaching a Tier-3 path**,
      standing context for every later AI session. Containment after this WP: a
      malformed block is refused at every decision that would compare a field
      across it (Table A), and the bytes committed for a path this run accepted
      are the bytes that acceptance read (Table B).
- [ ] No reason string carries note content; all three new ones are fixed
      code-owned literals (Table C).
- [ ] Named residual — **no blob-identity claim.** C3′ compares working tree to
      working tree (Table B); git's own filters may transform what is stored,
      identically before and after this WP.
- [ ] Named residual — **`LEARNINGS.md` is outside C3′** (Table B). It has no
      decided version to compare against, so its bytes can change between
      `ledgerViolation` and the commit. Pre-existing; unchanged in both
      directions here.
- [ ] Named residual — **a nested `reports_dir` is outside C3′** (Table B).
      `layout.js` does not require `reports_dir` to be disjoint from the
      identity/skills directories, so configuring it under one makes the
      code-owned Step-4 report a Tier-3 write with no decision. Pre-existing;
      noted, not fixed.
- [ ] Named residual — **R1 does not say which side of a revision is
      malformed.** After this WP no dream can commit a malformed Tier-3 block,
      so a malformed HEAD can only be a pre-existing artifact; distinguishing it
      would add a fourth literal for a state the product can no longer create.
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
- [ ] AC4 — Decide-once holds (C2, and only C2): an accepted new skill draft is
      registered with the `id` and `created` of the bytes its Tier-3 decision
      read, and no *deciding* read of that path happens after the decision. What
      happens when the file is replaced mid-run belongs to AC5, not here.
- [ ] AC5 — C3′ holds: a Tier-3 path whose bytes change after its accepting
      decision is **not committed**, is **reported as reverted** with R2, is
      **preserved** in `state/quarantine/` before the revert, and leaves no
      ownership-registry entry; when preservation fails it is still reverted and
      the reason carries `' (quarantine copy failed)'`. A run in which nothing
      changes after its decision commits exactly what it commits today —
      including a note the EP2 redact arm scrubbed in place, which is exempt.
- [ ] AC6 — The ADR-0022 parity gate is no longer vacuous with respect to
      malformed blocks: for inputs `parse` reports as malformed, the digest-side
      classifier (`parseNoteResult` → `exclusion: 'malformed'`) and the
      validator's Tier-3 decision both refuse. Existing cases are unchanged.
- [ ] AC7 — Exactly the three literals in Table C are added to the validator's
      reason vocabulary, no existing reason string changes, and the
      learnings-ledger site fires **R1L** — naming the parent `SKILL.md` — not
      R1, because the path it reverts is not the path whose bytes are malformed.
- [ ] AC8 — A malformed **Tier-1/2** note (a daily log, a report, an ordinary
      note) is committed exactly as it is today: Table B's invariant is
      Tier-3-scoped and this WP adds no floor where there was none.
- [ ] AC9 — `npm test` and `npm run lint` pass, and running the dream twice over
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

# Table B (C2): no second DECIDING read of a decided Tier-3 path survives at
# registration. A tripwire for the exact expression removed, not a proof of C2 —
# AC4's behavioural case is what asserts it.
! grep -n 'parseFrontmatter(fs.readFileSync' src/core/dream/validate.js

# Table C: all three literals are present, byte for byte (a quoted heredoc, so
# no quoting accident can change what is matched).
cat > /tmp/wd-reasons.txt <<'LITERAL'
malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)
malformed frontmatter block in the parent skill SKILL.md (a duplicate key, an indented line, or a line that is not key: value)
changed after it was checked, so what would be committed is not what passed the checks; not committed
LITERAL
test "$(grep -Fof /tmp/wd-reasons.txt src/core/dream/validate.js | sort -u | wc -l | tr -d ' ')" = 3

# The queued-WP pair stays adjacent (Implementation notes).
grep -A1 'Retention, once per run' src/core/dream/validate.js | grep -qF 'pruneRedactedOriginals(stateDir, redactedCreated)'
```

The last four are NEW steps and each is an assertion — non-zero exit on failure,
never a number for a reader to judge. Measured at `2f952e6` before any work: the
C2 tripwire and the literal count exit **1** (they assert the fix); the fixture
guard and the retention-adjacency check exit **0** (they assert a subject and a
neighbour, not the fix). Paste a real green on the finished state **and** a real
red from a deliberately broken state, one recipe per step: the fixture's junk
line repaired; the `:1170` re-read restored; one reason literal reworded; a line
inserted between the retention comment and its call.

## Out of scope (do NOT do these)

- `src/core/frontmatter.js`. Recognition — what counts as a block at all — stays
  byte-for-byte, by ruling and not by omission (Security checklist). No
  widening, no narrowing, no ADR-0022 amendment.
- The `:343` body comparison (Table A's last row).
- The redacted-id divergence below: noted, not fixed.
- The digest banner's remedy accuracy — the charter's successor **B**
  (`docs/specs/done/WP-frontmatter-recognition-failopen.md:383`), a six-class
  problem with no connection to this one. Nothing in `src/core/digest.js` is
  edited here; this WP only reads its doctrine comment.
- The scan-limit guard, `WP-alert-producer-freeform-residual`, and the
  product-wide line-concept question — queued separately.
- Any Tier-1/2 floor (AC8), and any change to the EP2 gate's own
  classification, its redact/withhold arms or its retention pruning — the queued
  `WP-ep2-retention-prune-timing-test` and `WP-ep2-atomic-withhold-handoff` own
  that surface.

## Discovered pre-existing defect — the redacted-id divergence

Found while designing this WP and reproduced at `2f952e6` with the validator
**unmodified**, so CLAUDE.md's note-don't-fix rule applies. C2 does not move it
either way: `:1170`'s read and `:195`'s decided bytes are both pre-redaction.

A new skill whose `id` holds an unbroken run of ≥ 24 characters over
`[A-Za-z0-9+=/]` at ≥ 3.5 Shannon bits/char (`ScanLimits.ENTROPY_MIN_LEN`,
`ENTROPY_MIN_BITS_PER_CHAR` — `src/core/secret-scan.js:23-24`) is registered in
Step 2 and redacted in Step 3; the `secretReverted` splice (`:1335-1337`)
removes only secret-**reverted** rels from `newSkills`, never redacted ones:

```text
=== is the registry/commit id divergence reachable TODAY (pre-WP)? ===
reverted: []
secretRedactions: 1   secretReverts: 0
registry entry: {"created":"2026-07-11","id":"q7PmXz4KvR9tWc2LbN8dYfGh"}
committed blob id line: id: [REDACTED:high-entropy]
DIVERGENCE: true

=== does it fail CLOSED on a later revision? ===
run2 reverted: [{"path":"05-Skills/hotid/SKILL.md",
  "reason":"skill id does not match the ownership registry (path reuse)"}]
run3 reverted: [{"path":"05-Skills/hotid/LEARNINGS.md",
  "reason":"learnings ledger parent skill id does not match the registry (path reuse)"}]
```

**Value, so the successor does not re-derive it.** It fails closed both ways
(`:328`, `:501`), so it is not an authorization bypass. What it costs is
durability and honesty: the skill is committed into standing context and is then
permanently unrevisable and un-ledgerable, and the reason the user reads —
`path reuse` — **is false**; no path was reused. The trigger is not exotic:
`onboardingredesignproject`, 25 plain-English characters with no hyphen, is
redacted, so one missing hyphen produces a dead skill. The shipped id corpus is
clean, which bounds nothing — the predecessor measured that too
(`docs/specs/done/WP-frontmatter-recognition-failopen.md:321`: *"The product
corpus is not the migration bound… every candidate rule so far has had a
false-positive class that only user content would reveal."*)

## Successor — chartered, not specced

Closing the divergence needs its own package with its own value measurement.
Three candidates; the successor weighs them rather than inheriting a choice.

| Candidate | Mechanism | Measured cost |
|---|---|---|
| **(A) bind the output** | registration reads `id`/`created` from the committed blob at Step 6 | simulated and it works — the skill becomes revisable via the ordinary ADR-0020 route. But it adds a second read of a path to a package whose doctrine is *decide once*, and it makes distinct skills share an id (two different hot ids both commit as `[REDACTED:high-entropy]`) |
| **(D) constrain the input** | validate the `id`'s shape at the Tier-3 decision so the scanner cannot rewrite it | the grammar must encode a max-unbroken-run bound below `ENTROPY_MIN_LEN` plus the entropy floor — two constants owned by another module — and no pattern in `src/` carries such a bound (`transcripts/claude.js:73`, `cli/schedule.js:968`/`:1060`, `validate.js:364`/`:422` all admit `onboardingredesignproject`). It is the rule class `:321` warns about |
| **(E) decline the rewrite** | the redact arm sends a Tier-3 path with a redact-severity finding to the withhold arm instead of scrubbing it | removes the divergence at its source — no grammar, no second read, no cross-module constant; costs a user-visible behaviour change on a surface the queued EP2 packages own |

## Definition of done

1. All verification steps pass locally; output pasted into the PR body,
   including the deliberately-broken red runs.
2. Conventional commits; PR titled
   `fix(dream): reject a malformed Tier-3 block and commit only decided bytes (WP-validator-decided-bytes)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — defined in `docs/runbooks/codex-review.md`. `In-Review`
   marks the START of review: this list is complete only when review is.
