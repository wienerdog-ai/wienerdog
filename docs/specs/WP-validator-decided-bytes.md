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
`recurrence >= 3`. Frontmatter is the leading `---`…`---` block of flat
`key: value` scalars, lexed by the one shared strict parser
(`src/core/frontmatter.js` `parse`, ADR-0022). That parser reports two things a
consumer must separate: `delimited` (a block was found at all) and
**`malformed`** (a block was found but it broke a rule — an indented line, a
duplicate top-level key, or a line that is not `key: value`). ADR-0022's
Decision 4 already binds the answer: *a malformed block excludes the note
unconditionally, whether or not it carries the flag.* Its Consequences claim
the digest and the validator "classify identical bytes identically".

**The validator does not do that.** `parseFrontmatter` (`validate.js:161`)
builds the validator's view by iterating `fm.fields` and never reads
`fm.malformed`, so a malformed block whose junk sits beside floor-passing
values passes the floor. Runnable, and reproduced on this tree:

```bash
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";const f=P(t);console.log("parse.malformed="+parse(t).malformed,"fieldsExposed="+Object.keys(f).length,"floorPasses="+(f.derived_from_untrusted===false&&Number(f.confidence)>=0.85&&Number(f.recurrence)>=3))'
# parse.malformed=true fieldsExposed=3 floorPasses=true
```

**The second half is ordering, and it is why a check alone will not do.** The
Tier-3 decision reads a file, decides on what it read, and is then followed by
two more reads of the same path: registration re-reads it (`:1170`), and the
commit stages the working tree (`:1378`). Nothing binds those reads to each
other. The doctrine this pipeline breaks is already written down twice inside
the product — `digest.js:689` ("Parse the SAME bytes just hashed (no second
read → no TOCTOU window)", with the same rule at `:185`), and in this very
file, where `quarantinePreserve` returns the bytes it preserved precisely
because "reading the file a second time to obtain them is the TOCTOU this
return closes" (`:664-668`). This WP applies that doctrine to the Tier-3 path:
**decide once, and commit the bytes that were decided.**

This package is the validator half of the charter in
`docs/specs/done/WP-frontmatter-recognition-failopen.md` (`:332`, part A). Two
things ride along, because done specs are never edited: that charter cites the
doctrine comment at `digest.js:686-688`, and on this tree it sits at `:689`;
and the charter's `:186`/`:315` are `:187`/`:317` here. Every other citation in
it re-ran unchanged.

## Current state

`src/core/dream/validate.js` (1436 lines). `validateAndCommit` (`:1041`) runs
six steps: scratch integrity (`:1074`), classify each vault change (`:1111`),
the EP2 staged-output secret gate (`:1178`), append the dream report (`:1341`),
stage-and-commit (`:1378`), and record new skills in the ownership registry
(`:1410`). Six sites consult the shared parser, five through
`parseFrontmatter` and one through `skillBody`:

- `:195` — `tier3Decision` (`:187`) reads the working copy (`:189`) and applies
  the floor. It reads the **working tree only**; it never reads HEAD.
- `:317` / `:325` — `skillBodyViolation` (`:295`) parses HEAD and the current
  copy, then compares `id`, `origin`, `created` (`:327-330`), applies the
  raise-only rule (`:332`), and runs the promotion allowlist (`:346`).
- `:343` — `skillBody(curText) !== skillBody(headRes.stdout)`, the body
  comparison that decides whether a change needs an authorizing learning.
- `:500` — `ledgerViolation` (`:486`) matches the parent skill's `id` and
  `created` against the ownership registry.
- `:1170` — after the Tier-3 decision accepted the file at `:1161`,
  registration re-reads it to lift `id` and `created` for the registry.

`parseFrontmatter` is exported (`:1430`) and `tests/unit/frontmatter-unify.test.js`
asserts its plain-record return shape (`:61`, `:93-94`); `tier3Decision`,
`skillBodyViolation` and `ledgerViolation` are internal, called only from
`validateAndCommit`.

`tests/unit/frontmatter-digest-differential.test.js` is the ADR-0022 parity
gate. Its corpus (`:19`) is twenty **value** forms of `derived_from_untrusted`
inside a well-formed block; no input in the file makes `parse` report
`malformed`, so the ADR's malformed-parity consequence is not exercised there.
`digest.js` `parseNoteResult` is exported and returns
`{note: null, exclusion: 'malformed'}` (`:193`) — the digest-side classifier a
test can call without editing `digest.js`.

The EP2 gate rewrites accepted working-tree bytes on one path: the redact arm
scrubs added lines in place (`:1250`) and lets the note continue to the commit.
`quarantinePreserve` (`:670`) is the existing mechanism for keeping a copy of
working-tree bytes before they are destroyed (`kind: 'withheld'` →
`state/quarantine/`), and the gate aborts the whole run with a
`WienerdogError` (`:1286`) rather than destroy bytes it could not preserve.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec
     file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | the malformed guard at the decision sites (Table A), the decide-once/commit-decided-bytes ordering (Table B), and the three reason strings (Table C) |
| modify | tests/unit/dream-validate.test.js | cover the acceptance criteria below (the implementer designs the cases and fixtures) |
| modify | tests/unit/frontmatter-digest-differential.test.js | extend the ADR-0022 parity gate to malformed blocks (AC6). Change no existing case |

`src/core/frontmatter.js` is deliberately **not** here — see Out of scope.

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
difference between a field that is *absent* and one that is *hidden*, and
every preservation check reads absence as agreement. Measured in the
predecessor's round 8 (`docs/specs/logbook/2026-08-17-frontmatter-recognition-round-8-raw.md`):
a malformed HEAD carrying `id`, `origin`, `created` and an explicit
`derived_from_untrusted: true`, against a revision omitting all four, is
rejected today and **admitted** under the empty-record design. That regression
is only visible when the ownership-registry entry's `id` is absent — with a
healthy entry the revision is rejected by `cur.id !== entry.id` (`:328`) and a
test passes by coincidence (round 9).

**C2 — decide once.** The Tier-3 decision carries the bytes it accepted
forward to registration; there is no second read of that path (Table B). This
alone fixes nothing observable — it removes a read whose only power was to
disagree — and is stated separately because C3 depends on there being exactly
one decided version of each path.

**C3 — commit only decided bytes.** For every Tier-3 path in the commit, the
committed blob is byte-identical to the bytes of an accepting decision made
during that run (Table B). This is the contract that closes the ordering hole,
and it is what makes C2 safe: byte reuse *without* it would register an `id`
lifted from bytes that are not the bytes committed.

## Contract reference

Activation (ADR-0031's 2-of-7): **(iv)** reason-code behavior changes — three
new reason strings and a changed outcome at five decision sites; **(v)** the
run crosses an authority boundary — the Tier-3 decision accepts bytes that the
staging step, a different owner, actually commits; **(vi)** the ownership
registry and the dream report both inherit the contract. Three of seven.

### Table A — where a malformed block is rejected

Inherited from the predecessor's round-8 placement ruling, with one row
refined; the refinement is marked and its cause given.

| Site | Decision | On `malformed` |
|---|---|---|
| `:195` | Tier-3 floor | **reject**, with the new malformed reason (Table C, R1). *Refined:* round 8 reused the existing `'Tier-3 path missing provenance frontmatter (…)'` reason here. On the repro above all three fields are present, so that reason states a falsehood and sends the user to add fields that are already there — the inaccurate-remedy defect this repo is already tracking as the charter's successor B |
| `:317` / `:325` | skill-revision preservation, either side | **reject** before comparing `id` / `origin` / `created` (R1). A malformed side is not evidence of agreement |
| `:332` | raise-only guard | **reject** before comparing the flag (R1). A malformed HEAD must never read as "not `true`" — the absence-as-agreement hole |
| `:346` | promotion allowlist | covered by the `:317`/`:325` rejection: the loop is reached only after both sides parsed clean |
| `:500` | learnings-ledger parent-skill identity | **reject** before comparing against the ownership registry (R1) |
| `:1170` | new-skill-draft registration | **no decision here.** Under C2 this read does not exist; the bytes come from `:195`'s decision. Round 9 measured why a check here cannot work: by `:1170` the file is already accepted, no caller converts a reason into a revert, and `if (parse(text).malformed) continue` skips only the registry insert while Step 3 stages and Step 5 commits the malformed bytes — `reverted: []`, a committed and ownerless Tier-3 skill |
| `:343` | `skillBody` body comparison | **out of scope, deliberately.** It compares bodies, not security fields, and this WP does not change what `body` is |

The four rejecting rows above — five parse sites — are the whole of the
guard: no other site in the file reads a frontmatter field to make a security
decision.

### Table B — the read/decide/commit ordering

| Fact / rule | Value |
|---|---|
| Reads per accepted Tier-3 path | exactly one, made by the decision at `:195`. The `:1170` re-read is removed (C2) |
| What registration records | `id` and `created` taken from the bytes `:195` decided on — never from a fresh read |
| The commit invariant (C3) | for every Tier-3 path present in the run's commit, the committed blob is byte-identical to the bytes of an accepting decision made during that run. A path with **no** accepting decision — including one that appeared after `changedPaths` (`:987`) ran, so Step 2 never saw it — fails this invariant |
| The one code-owned rewriter | the EP2 redact arm (`:1250`), which scrubs a note in place after its decision. When the path it rewrote is Tier-3, its rewritten bytes are **re-decided** by the same Tier-3 decision rather than exempted; the doctrine is that committed bytes were decided, and a rewrite makes new bytes. A re-decision that fails reverts on its own reason (Table A / Table C) |
| On a violation | preserve the working-tree bytes with `quarantinePreserve(…, 'withheld')` (`:670`), then revert the path, and record R2 or R3 (Table C) naming the preserved copy. Reverting without preserving is forbidden: the user can save a vault file mid-dream, and the bytes on disk may be the only copy of what they wrote |
| When preservation fails | abort the run with a `WienerdogError`, exactly as the secret gate does at `:1286`. The two duties — never destroy unpreserved user bytes, never commit undecided bytes — cannot both be met, and the run stops rather than silently choosing one |
| Scope of the invariant | Tier-3 paths only (`isTier3`, `:1056`). Tier-1/2 notes, daily logs and reports are never decided against a floor, so there is no decided version to compare them to; this WP does not give them one |
| Preserved unchanged | the Tier-3 thresholds, the identity freeze (`:1142`), the revision guard's own rules, the secret gate's classification and its redact/withhold arms, the single commit, and the registry-after-commit ordering (`:1410`) |

### Table C — the reason-string vocabulary

The validator's existing reason strings are a preserved contract; this WP adds
three and changes none. Byte-exact, code-owned, and they never contain note
content.

| Id | Reason string | Fired at |
|---|---|---|
| R1 | `malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)` | every rejecting row of Table A |
| R2 | `changed after it was checked, so what would be committed is not what passed the checks; not committed` | Table B's commit invariant, for a path that had an accepting decision |
| R3 | `appeared after the change scan and was never checked; not committed` | Table B's commit invariant, for a path with no accepting decision |

R2 and R3 carry the preserved-copy suffix the secret gate already appends to
its own reasons, naming the copy in `state/quarantine/`. A path whose
preservation failed is never reverted at all, so no reason is recorded for it —
the run aborts instead (Table B).

### Mirrored Surface Checklist

- [ ] The Deliverables row for `src/core/dream/validate.js` (cites A, B and C)
- [ ] Acceptance criteria AC1–AC5 and AC8 (Table A and Table B facts), AC7
      (Table C)
- [ ] The verification steps' greps for the R1–R3 literals
- [ ] The Current-state list of the six parse sites (Table A's rows)
- [ ] Implementation notes: the redact-arm interaction and the ordering trap
- [ ] Security checklist: the reason-string and containment claims

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; JSDoc types only; no build step; no
  process outlives its job (ADR-0004, CLAUDE.md).
- **No ADR amendment is needed and none may be written.** ADR-0022's Decision 4
  already binds malformed → exclude, and its Consequences already claim
  digest/validator parity. This WP makes an accepted decision true; it does not
  change one.
- **The ordering trap.** Step 4 (`:1341`) writes the dream report between the
  secret gate and the commit. A C3 check placed after the report is written
  cannot get its own reverts into the report the user reads. A check placed
  before the redact arm has finished rewriting will fight it. Table B states
  the outcome; where the code goes is yours, but both traps are real.
- **Do not separate the retention pair.** The queued
  `WP-ep2-retention-prune-timing-test` has a dispatch gate that asserts, over
  `validate.js`, that the comment `Retention, once per run…` and the call
  `if (secretRedactions > 0) pruneRedactedOriginals(stateDir,
  redactedCreated);` (`:1332-1333`) are **adjacent**, that the call appears
  exactly once, and that it sits after the `scanTokens` loop's closing brace.
  Your C3 check lands near there. Inserting anything between that comment and
  that call, or moving the call inside the loop, blocks that WP; nothing in
  this spec requires either. That WP also delivers
  `tests/unit/dream-validate.test.js`, so keep your additions additive.
- When uncertain: choose the simpler option and record it under "Decisions
  made" in the PR body. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] The template's untrusted-identifier item is **N/A — this WP constructs no
      new filesystem path and no shell command.** Vault-relative paths come
      from `changedPaths` (git's own output) and reach `quarantinePreserve`,
      which already sanitizes the destination basename through `displayName`
      (`:685`); that call is unchanged.
- [ ] The surface is **untrusted brain-written bytes reaching a Tier-3 path**,
      which is standing context for every later AI session. Containment after
      this WP: a malformed block is refused at every decision that would
      otherwise compare a field across it (Table A), and the bytes committed to
      a Tier-3 path are the bytes some decision accepted (Table B).
- [ ] No reason string carries note content; all three new ones are fixed
      code-owned literals (Table C) — the rule the report and the digest banner
      already follow.
- [ ] Named residual, not reopened: **recognition** still fails open. A block
      that `parse` does not *recognize* (`delimited: false` — a BOM opener, a
      leading blank line, CRLF, an opener with no closer) is a different defect,
      owner-ruled open in the predecessor. It is unaffected in both directions
      here: this WP neither widens nor narrows what counts as a block. At the
      Tier-3 floor an unrecognized block already exposes no fields and fails
      `hasAll` (`:196`); an unrecognized **HEAD** in the revision guard is the
      open half, and it stays open.

## Acceptance criteria

- [ ] AC1 — A Tier-3 write whose block is malformed is reverted with R1 and is
      absent from the commit, for each rule that makes `parse` report
      `malformed` (indented line, duplicate top-level key, non-`key: value`
      line), including the repro above, whose three floor fields are all
      present and floor-passing.
- [ ] AC2 — The regression in C1 does not ship: with an ownership-registry
      entry whose `id` is absent, a malformed committed HEAD carrying `id`,
      `origin`, `created` and `derived_from_untrusted: true`, and a
      floor-passing revision omitting all four, the revision is reverted. This
      criterion is only meaningful with that registry state — a healthy entry
      makes it pass on the empty-record design too.
- [ ] AC3 — A malformed HEAD cannot launder a lowering: the raise-only guard
      rejects rather than reading the absent flag as "not `true`".
- [ ] AC4 — Decide-once holds: an accepted new skill draft is registered with
      the `id` and `created` of the bytes its Tier-3 decision read, and the run
      does not read that path again after the decision — replacing the file
      between the decision and registration changes neither the registry entry
      nor the commit.
- [ ] AC5 — The commit invariant holds in both of Table B's shapes: a Tier-3
      path whose bytes change after its accepting decision, and a Tier-3 path
      that appears only after the change scan, are each **not committed**,
      **reported as reverted** with R2 / R3, **preserved** in
      `state/quarantine/` before the revert, and — for the first shape — leave
      no ownership-registry entry. A run where nothing changes after its
      decision commits exactly what it commits today.
- [ ] AC6 — The ADR-0022 parity gate is no longer vacuous with respect to
      malformed blocks: for inputs that `parse` reports as malformed, the digest-side
      classifier (`parseNoteResult` → `exclusion: 'malformed'`) and the
      validator's Tier-3 decision both refuse. Existing cases are unchanged.
- [ ] AC7 — Exactly the three literals in Table C are added to the validator's
      reason vocabulary, and no existing reason string changes.
- [ ] AC8 — A malformed **Tier-1/2** note (a daily log, a report, an ordinary
      note) is committed exactly as it is today: Table B's invariant is
      Tier-3-scoped and this WP does not add a floor where there was none.
- [ ] AC9 — `npm test` and `npm run lint` pass, and running the dream twice
      over an unchanged vault is idempotent (second run: zero changes).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "dream-validate|frontmatter"
npm test
npm run lint

# Fixture guard: the Context repro's input is still malformed, so AC1's test
# still has a subject. (That the floor now REJECTS it is AC1, asserted by the
# test suite above, not by this line.)
node -e 'const{parse}=require("./src/core/frontmatter");const{parseFrontmatter:P}=require("./src/core/dream/validate");const t="---\nconfidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\njunk line\n---\nb\n";if(!parse(t).malformed)throw new Error("fixture is no longer malformed — the test lost its subject");console.log("parse.malformed=true, fieldsExposed="+Object.keys(P(t)).length)'

# Table A: no second read of a decided Tier-3 path survives at registration.
! grep -n 'parseFrontmatter(fs.readFileSync' src/core/dream/validate.js

# Table C: all three literals are present, byte for byte (a quoted heredoc, so
# no quoting accident can change what is matched).
cat > /tmp/wd-reasons.txt <<'LITERAL'
malformed frontmatter block (a duplicate key, an indented line, or a line that is not key: value)
changed after it was checked, so what would be committed is not what passed the checks; not committed
appeared after the change scan and was never checked; not committed
LITERAL
test "$(grep -Fof /tmp/wd-reasons.txt src/core/dream/validate.js | sort -u | wc -l | tr -d ' ')" = 3

# The queued-WP pair stays adjacent (Implementation notes).
grep -A1 'Retention, once per run' src/core/dream/validate.js | grep -qF 'pruneRedactedOriginals(stateDir, redactedCreated)'
```

The last four are NEW steps and each is an assertion — it exits non-zero on
failure rather than printing a number a reader must judge. Paste a real green
on the finished state **and** a real red from a deliberately broken state (the
`:1170` re-read restored; one reason literal reworded; a line inserted between
the retention comment and its call), so a check that cannot fail is caught
before anyone believes it.

## Out of scope (do NOT do these)

- `src/core/frontmatter.js`. Recognition — what counts as a block at all —
  stays byte-for-byte as it is, by ruling and not by omission (Security
  checklist, last item). No widening, no narrowing, no ADR-0022 amendment.
- The `:343` body comparison (Table A's last row).
- The digest banner's remedy accuracy — the charter's successor **B**
  (`docs/specs/done/WP-frontmatter-recognition-failopen.md:383`), a six-class
  problem with no connection to this one. Nothing in `src/core/digest.js` is
  edited here; this WP only reads its doctrine comment.
- The scan-limit guard, `WP-alert-producer-freeform-residual`, and the
  product-wide line-concept question — queued separately.
- Any Tier-1/2 floor (AC8), and any change to the EP2 gate's own
  classification, its redact/withhold arms or its retention pruning — the
  queued `WP-ep2-retention-prune-timing-test` and
  `WP-ep2-atomic-withhold-handoff` own that surface.

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
