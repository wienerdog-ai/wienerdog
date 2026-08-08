---
date: 2026-08-08
title: Project-name sanitizer re-cut — round zero and two internal passes
related_wps: [WP-sanitize-project-display-names]
---

# Project-name sanitizer re-cut — round zero and two internal passes (2026-08-08)

**The spec was re-cut onto the reset `main` as a fresh file with no history**
(the twelve review-round commits stay on `wp/sanitize-project-display-names-pre-reset`,
because parts of that history are misleading — claims later corrected, directions
later withdrawn). This record covers what ran against the re-cut file before any
external round, and carries the dispositions the owner ruled, including the drops
that deliberately never reach the artifact.

## Round zero — template conformance

Run per the codex-review runbook: a throwaway executor in a clean context, given
exactly two inputs — the spec and `docs/specs/_TEMPLATE.md` — and told this is a
presence read, not a design critique. No external reviewer was used.

**Result: CLEAR.** All thirteen template sections present; no section needed an
`N/A —` marker. Two spec-only sections identified, both ruled to stay as additive
sections: `Mutation rows` and `Coverage`.

## The two internal passes

Two fresh contexts, neither of which took part in writing the file.

- **Fidelity** — old tip versus re-cut file: did anything of substance get lost,
  weakened or silently altered? Eight findings.
- **Coherence** — the finished file alone: do internal references resolve, do
  stated counts match real counts, do any two statements contradict each other?
  Fourteen findings.

After deduplication and after removing what the owner's own re-cut ruling had
already decided (the `status: Ready → Draft` flip and the deletion of the fork-era
`Size self-gates` section), seventeen findings went to disposition.

**Fifteen were ruled `fix` and are applied in the commit this record accompanies.**
Five of them were damage the restructure itself introduced; nine were pre-existing
defects that had survived eleven external rounds and an owner sign-off on the old
tip; one was a frontmatter completeness question.

The most consequential of the pre-existing nine: `G1`'s envelope accepted
`# pass ≥ 16` while the Deliverables table demands *exactly* the sixteen tests and
the **Not relaxed** line claims no envelope widens. Seventeen tests passed that
gate. It is now pinned to `16` with both directions red. The pin was measured
before it was written — `node --test` over a single file reports one `pass` per
top-level `test()` and adds no entry for the file itself — because a count pinned
by inference is how a gate becomes unpassable on a correct tree.

## The two drops, and why they are recorded here rather than in the spec

Per the runbook, a drop is noted in the round record and never in the artifact.

- **Promote `### Exact contracts` to `##`, and move the RES-1/2/3 blocks out from
  under Deliverables.** Dropped. `### Exact contracts` is a *subsection of
  Deliverables in the upstream template*; promoting it would break the conformance
  round zero had just certified. The observation about the residual blocks sitting
  under a heading that reads "permission boundary — touch ONLY these" is fair, but
  moving them is a restructure outside the ruling that authorised this re-cut.
- **Reorder the mutation table's last four rows** (they run `M10, M9, M8, M7`
  while the Definition of done lists them ascending). Dropped as style. The row
  set is complete, the union of the reddens cells still covers every one of
  T1–T16, and every reddens ∪ stays-green pair still sums to sixteen.

## One finding raised during execution and deliberately NOT applied

The `G1` envelope names its counters with a `#` prefix (`# fail 0`, `# pass`).
Measured on this tree, Node's default reporter prints `ℹ tests 7 / ℹ pass 7`; the
`#` form belongs to the TAP reporter. So the envelope, read literally, names a
prefix the documented command does not print. This is a pre-existing defect and it
was **not** in the ruled batch of fifteen, so it was not folded in silently — even
though the fix would have landed in a cell that was being edited anyway. It goes to
the external confirming round as a finding.

## Process note

Nine of the fifteen fixes were defects that eleven external rounds did not find,
and one of them was a live false-green vector. That says something about what the
external loop looks at rather than about this spec. The owner has queued the
proposal — make the internal coherence pass standing, at the same level as round
zero — as **Q13: candidate, not yet a rule.** The framing package's re-cut supplies
the second measurement; a measured recurrence is what would raise it to a rule.

## External confirming round — findings and dispositions

Run with the plugin's own companion runtime, invoked programmatically as a plain
command: `codex-companion.mjs adversarial-review --wait --cwd <worktree>
--base main <focus>`. Not the human-only slash command, not the raw engine. The
call succeeded on its first attempt; nothing in the mechanics needed working
around. Raw stdout is preserved verbatim beside this file, committed before any
finding was adjudicated.

Verdict: needs-attention, three findings, all ruled **fix**. Every one of the
three was re-measured locally before disposition, not taken on the reviewer's
word.

- **R1 (high) — `G1`'s envelope was false-red and false-green at once.** False
  red: it named the counters with a `#` prefix, while the documented command
  prints `ℹ` under the default reporter, so a correct run failed the literal
  envelope. False green, and this one was new: sixteen passing cases plus a
  **failing** seventeenth marked `{todo: true}` reports `tests 17, pass 16,
  fail 0, skipped 0, cancelled 0, todo 1` and exits `0` — measured — which
  satisfied every condition the envelope listed while refuting the sentence
  beside it. Ruled: the prefix leaves the envelope (the numbers are the
  envelope, never the notation), and `tests` and `todo` join `pass` as pinned
  counters. That closes the over-count side from both directions.
- **R2 (high) — the `G2` red-run obligation contradicted its own constraint.**
  `G2` hashes one file at a fixed path and the current bytes already equal the
  pin, so a red side requires different bytes — while the Definition of done, as
  written in the previous commit, forbade any run that *writes* that path. Ruled
  option (i): the constraint narrows to "may not leave the tracked file in a
  modified state", which permits a temporary tip-observe-restore. The method
  stays the implementer's, so the spec still grows no methodology, and Q11's
  two-sided observation survives intact.
- **R3 (medium) — the Security checklist claimed more than row A9 decides.** It
  said the WP closes "structural forgery"; A9 decides line and section forging
  only, and RES-2 deliberately keeps one construct alive inside the bullet.
  Ruled: the claim narrows to what A9 gates, with the RES-2 residual named
  rather than implied.

Two of the three were defects the re-cut itself introduced, and the third — the
counter prefix — was the one flagged in this record and deliberately routed to
the external round instead of being folded in silently. The round found nothing
new in the content that had passed the old tip's eleven rounds; the nine
pre-existing defects had already been taken by the internal coherence pass.

## Closing round — findings and dispositions

Same mechanics, same preservation discipline: raw stdout committed before any
finding was adjudicated. The round returned **needs-attention, two findings**, so
the ruled closure criterion — a fresh round with zero findings — was NOT met and
the spec did not go to Ready on it. Both findings were re-measured locally before
disposition.

- **F1 (high) — the constraint on the golden said two different things in two
  places.** The confirming round's fix rewrote the Definition of done's copy and
  left the Verification steps copy at the older, stricter "no mutation may
  **write**". A reader taking the stricter one still cannot produce `G2`'s red
  side. This is an update-all-mirrors failure in a spec that carries that exact
  obligation — one mirror was updated, the other was not. Ruled fix: the
  Verification steps sentence now carries the Definition of done's wording.
- **F2 (medium) — row A9's line-count guarantee is false on a reachable path.**
  `renderDigest` ends in `capDigest` (120 lines / 32 KiB) and identity notes are
  assembled before the project section, so a large approved note pushes the block
  past the cap. Measured, with `K = 20` project directories and one approved
  identity note: at 100 note lines the shipped digest carries the heading and 17
  project lines; at 110, seven; at 150 the section is gone entirely. Two things
  the reviewer did not say and the measurement adds: in each of those renders row
  A11's boundary does not exist, so a fixture reaching that state would throw
  rather than pass vacuously — the falsehood is in the spec's claim, not in the
  gate — and no fixture reaches it, because identity injection needs a
  hash-matched approval the tests do not supply. Ruled fix, minimal: A9 gains a
  `capDigest`-survival condition in the same form as the EP4 condition it already
  carried; A10 inherits it explicitly and the Security checklist restates both.
  **No test is written for the truncated case** — `capDigest` is out of scope for
  this WP and stays so.

## Circuit breaker, and where the design question went

The runbook's breaker applies when two consecutive rounds land findings of the
same kind. It did: the confirming round's R3 and this round's F2 are one family —
**the spec asserts a security property more widely than its gate decides it**.
R3 was "structural forgery" claimed above what A9 gates; F2 was A9 itself claimed
above what the shipped digest satisfies. Patching a third instance in the same
shape would have been the wrong move.

The design question raised instead: must every Table A property row state its own
validity conditions inline — as A7 already did and A9 did not — or should the spec
carry one collected place naming every layer that can stand in front of a measured
property (`capDigest`, the EP4 omission, the approval gate)?

Owner ruling: recorded as **Q14, with a trigger.** The minimal per-row condition is
applied now; if a third instance of this family appears — the framing package's
re-cut is the next measurement point — the collected-layers form becomes mandatory.

## A pre-decision recorded for the specs that follow

This spec closes under the current all-or-nothing criterion: a fresh round with
zero findings. After it closes, the owner decides on a weighted closure rule for
the following specs, on the evidence of the full round-count series.

## Second closing round — one finding, and the structural answer to it

The round confirmed A9/A10's `capDigest` scoping as consistent and found no other
surface repeating the unconditional form, so that family is closed. It raised one
finding: a **third** statement of the golden constraint, in the Deliverables
paragraph. Two consecutive rounds had now landed the same kind — a rule living in
several places where each fix reaches one of them — so the breaker applied and the
answer was structural rather than a third patch.

**Owner ruling:** row **A12** becomes the single owner of the golden's status,
stating the invariance *and* the one bounded exception (a temporary tip is
permitted provided it is restored immediately; anything surviving into the final
worktree, commit or diff is a boundary violation). Every other surface cites A12
and none restates the rule. The Mirrored Surface Checklist additionally registers
the paragraph below the Deliverables table, which it had never covered — that
omission is why the rule could drift there unnoticed.

### The sweep, and why a longer list would not have been enough

The owner's instruction was explicit: sweep the whole file, do not work from the
previous list. That mattered. The list of five sites compiled from the round's
finding was itself incomplete — it missed the statement in **Current state**
("so the golden must not change"), which the advisor caught independently. A
keyword sweep over `golden`, `digest-default`, `byte-identical` and the pinned
sha found seventeen mentions in total.

Five of them stated the rule and are now A12 citations: Current state, the
Deliverables paragraph, the Verification-steps red-run bullet, the Out-of-scope
"Updating any golden fixture" item, and Definition of done item 1.

The remaining mentions do something other than state the rule, and are recorded
here rather than rewritten:

- **The `G2` command and its envelope** name the path and carry the pinned sha
  literally. A gate has to be checkable without following a cross-reference, so
  the literal stays. It is a *registered* mirror — the checklist covers
  Verification steps whole — so a change to A12 re-walks it by obligation.
- **The Not-relaxed line** ("one byte of difference in …") states what the
  envelope refuses to widen to, not what the implementer may do to the file.
- **Current state's remaining sentences** record which golden contains the
  section, how that was verified, and the byte-identical measurement. Evidence,
  not rule.
- **The `G3` criterion** names a different test inside `tests/unit/digest.test.js`.
- **Out of scope's "Changing the emitted line format"** notes that a backtick
  wrapper would change the golden. A consequence, not a permission.

A post-edit re-sweep with the same keywords confirms exactly one line in the file
still states the rule: A12 itself.

## Third closing round — three findings, one of them new territory

Fourth clean run of the companion runtime. Verdict: needs-attention, three
findings, all re-measured locally before disposition. The round-count series
went 17 → 3 → 2 → 1 → 3; the owner accepted the reading that this is not a
regression in the old content but a widening of the surface being examined —
one finding is territory neither the eleven earlier rounds nor the four here
had reached.

- **F-A (high) — the persisted managed block's last line violates row A9.**
  Measured chain: a directory named `~~~` sorts after `wienerdog` and empties
  under A2+A3, so it renders as a bare bullet; `buildBlock` ends in
  `safeDigest.trimEnd()`, so when the project section is the digest's LAST part
  — reachable whenever no daily note exists — that bullet persists as a lone
  `-`, which does not match A9's form. T4 cannot see it: the `vault()` helper
  writes a daily note unconditionally, precisely so the project block is never
  final. Ruled: the contract states the truth rather than the code being
  changed, since `src/adapters/shared.js` is outside the Deliverables table.
  A9 now records the divergence, and **T17** pins it.
- **F-B (high) — the A12 ownership leaked through a general clause.** The sweep
  that moved the golden rule into A12 found every *mention* of the file but not
  a rule that covers it without naming it: "Every other path this spec names is
  one the implementer reads, never writes" still forbade what A12 permits.
  Ruled fix: that clause carries an explicit A12 exception, and the Out-of-scope
  item's title defers too. **The lesson worth keeping: a keyword sweep finds
  mentions, not coverage.** A general sentence that never names the subject
  passes every sweep.
- **F-C (high) — `G2` claimed more than a content hash decides.** "a staged or
  committed change cannot pass it" is false: `shasum` reads the working tree, so
  a divergence staged while the working copy is restored passes. Ruled fix
  without widening the gate: the claim narrows to the working-tree bytes at run
  time, and names the real enforcer of the final state — `scripts/boundary-check.js`
  fails the PR on any changed file outside the Deliverables table — together
  with its one documented hole, the step being skipped when the PR body carries
  no `Spec:` line.

Two findings the round raised and the owner dropped, recorded here rather than in
the spec: the `G2` acceptance criterion and the **Not relaxed** line were flagged
as restating the golden rule. Neither is a permission rule — the first is a
statement about the required final state, which is exactly what A12 says, and the
second states what the envelope refuses to widen to.

### The count change T17 forced, and why it is in the same commit

A seventeenth test moves every statement of the test count, and the owner made
that a same-commit requirement rather than a follow-up: a split would have
guaranteed that the next round fired on the inconsistency. Updated together with
T17: the Deliverables Notes cell, the "seventeen tests" heading, the T-table, the
`G1` envelope (`tests` and `pass` from 16 to 17), the `G1` command comment, the
Mirrored Surface Checklist, the implementation-notes "do not add tests beyond"
line, and the Verification-steps observed-red sentence.

**T17's mutation partition was measured, not inferred, and is stated once rather
than added to twenty-two cells.** Measured against T17's fixture: it reddens
under M1, M7 and M10, and stays green under the other eight. The reasons are
recorded in the spec beside the table — including the measurement that
`scanAndRedact` returns zero findings on T17's raw form, its emitted form, and
M5's forbidden join, which is what keeps the three EP4 rows green for it. Adding
a seventeenth entry to every cell was declined for the same reason this spec
already dropped its per-section row index: the bookkeeping is the defect.

## Fourth closing round — and the mirror walk that should have run earlier

Fifth clean run of the companion runtime. The round confirmed T17 — its
behaviour against the tree, its observability, and its measured mutation
partition — and confirmed the A12/G2 correction. Four findings, all measured
locally before disposition.

Three of the four have one root cause, and it is not subtle: **row A9 was changed
and T17 was added without executing this spec's own update-all-mirrors
obligation.** The Mirrored Surface Checklist exists to make exactly that walk
mandatory, and it was skipped. The lesson recorded, owner-accepted: *a change to
a Table A row is not finished until the walk has run.*

- **F-2 (medium) — 16 and 17 stated in the same file.** Two MEASURED claims still
  carried the old denominator: T7's cell ("adding `+` … passes all sixteen
  tests") and M9's ("passed all sixteen tests"). Re-measured: T17 is green under
  both M8 and M9, so both statements are true of seventeen today. Fixed, and the
  mutation table's framing now states the division of labour outright — the cells
  carry T1–T16, the note below carries T17, and every one of T1–T17 has an
  observed red side across the two.
- **F-3 (medium) — row A11 excluded T17's own fixture.** A11 asserted "Every
  fixture vault carries a daily note"; T17's deliberately does not, which is the
  whole mechanism. Fixed: A11 scopes to fixtures that use `projectBlock` and
  names T17's exception.
- **F-4 (medium) — registered mirrors still promised the old persisted
  guarantee.** Ruled fix **with the full walk**, not with the three sites the
  round happened to see.
- **F-1 (medium) — the branch diff fails the spec's own boundary check.**
  Measured: `scripts/boundary-check.js` over this branch's file list exits **1**,
  naming the five round-log files, none of which is in the Deliverables table. In
  practice it does not fire — the CI step skips when the PR body carries no
  `Spec:` line, and a spec-authoring PR carries none. Owner ruling: **no change
  now; Q9 is armed with a deadline.** The round logs' canonical home, or their
  relationship to the boundary gate, is decided before the first `Spec:`-carrying
  PR, deliberately and preferably in an upstream-compatible form. The exit-1
  measurement is recorded in the plan.

### The walk itself, section by section

Every section the Mirrored Surface Checklist registers, walked against A9's
changed row. Recorded so the next walk can be checked rather than trusted.

**Affected, and now updated (seven):**

- **Current state** — "passes every other line through unchanged" was incomplete;
  it now names the `trimEnd` exception.
- **Exact contracts, the `vault()` helper comment** — it explained why every
  fixture carries a daily note; it now names T17 as the test that deliberately
  uses neither the helper nor that vault.
- **Exact contracts, the `SHAPE-PB` comment** — it claimed "the same property on
  the persisted managed block" without qualification; it now scopes to a project
  block that is not the digest's last part and points at T17 for the rest.
- **Acceptance criteria, `G1`** — "holds on both surfaces" now distinguishes the
  rendered digest from the persisted copy and names the final-position divergence.
- **Verification steps, the Not-relaxed line** — it could be read as forbidding
  the very line T17 requires; it now says explicitly what it does not forbid.
- **Coverage** — "the same bytes as persisted on disk" now carries the exception.
- **Out of scope** — a new item forbids closing the divergence by touching
  `src/adapters/shared.js`, which is not in the Deliverables table.

**Examined and genuinely unaffected (five):**

- **Context** — states that the digest is persisted and that a folder name's
  forgery persists with it. No claim about byte-identity or line form.
- **Deliverables** — the two Notes cells and the paragraph below the table speak
  about paths and about the test file's contents, not about the persisted form.
- **RES-1, RES-2, RES-3** — splice-site completeness, the surviving ordered-list
  marker, and shape-not-meaning. None asserts anything about persistence. A
  fourth residual for the divergence was considered and not written: a residual
  is for what is *not* gated, and this one is gated by T17.
- **Mutation rows** — already carried the divergence, in M1's and M7's reasons
  inside the T17 note.
- **Implementation notes & constraints** — its only "persisted" sentence is the
  ADR-0004 statement about not persisting beyond bytes already written.

## Fifth closing round — two findings, and Q9 decided

Sixth clean run of the companion runtime. The round confirmed the test count
consistent at seventeen and A11/T17 in agreement.

- **F-2 (medium) — the divergence is wider than it was written.** A9 described
  only the empty-name case; `trimEnd` removes **every** trailing whitespace
  character from the last line, and A1 admits U+0020 anywhere in a name. Two
  sub-cases, both measured: a name ending in spaces keeps A9's line form and
  loses only bytes; an empty-sanitizing name loses the bullet space and leaves
  the form. Ruled fix: the contract states the wider truth, the seven mirror
  sections take it via a second walk, and **T17 builds two vaults in one test**
  so both sub-cases are gated without moving the test count.

  A note worth keeping: the wider T17 is a strictly better test. Re-measured, it
  now reddens under **M2** as well — a total-rejecting sanitizer empties the
  trailing-space name too, so the last line becomes `-` where `- z` is required.
  With only the empty-name vault, M2 was green. The partition is now M1, M2, M7,
  M10 red and seven green.

  Two mistakes were made writing it and are recorded because both are the kind
  this spec has been bitten by before. First, the assertion messages were written
  with English possessives inside single-quoted JS literals, which breaks the
  literal — the same seam that the old spec recorded for shell payloads. Second,
  the fixture literal was meant to use escape sequences precisely so that no
  formatter can silently trim invisible trailing spaces, but the escapes did not
  survive the editing channel: measured, the line came out with real spaces and
  zero escape sequences. It was rewritten by building the backslash from its
  character code, and verified by **evaluating** the literal — length 4 — rather
  than by looking at it, since the display collapses the escapes either way.

- **F-1 (high) — the branch could not pass its own boundary check.** Recurring,
  and this time it was blocking: the review targets the `main...HEAD` diff, which
  structurally contains the round logs, so the ruled closure criterion of zero
  findings was unreachable regardless of the spec's quality.

### Q9 decided: the boundary check learns about process records

Owner ruling: `scripts/boundary-check.js` gains a narrow exception for
`docs/specs/logbook/**`. A logbook entry records how a decision or a review round
went; it is never an implementation surface, so no spec should ever list one as a
deliverable. This is the first code change on `main` since the reset, taken as a
separate deliberate commit (`6ae7a0c`) with an upstream-compatible message.

**Q11 two-sided observation, as required, on the real invocation:**

- **Red first**, before the change: the new allow-case failed against the
  unchanged script, exit 1 naming the logbook path.
- **Green after**: the file list `scripts/lint.js` plus a logbook record exits
  **0**.
- **Red after**: the same list plus `src/core/digest.js` exits **1**, printing
  only `src/core/digest.js` — which shows the exception is narrow rather than a
  blanket pass.
- Unit level: `tests/unit/boundary-check.test.js` runs 9/9, including a new guard
  that `docs/specs/logbookish.md` stays rejected, so the trailing slash is pinned
  and `docs/specs/` at large — the ADR-0029 ROADMAP case — is untouched.
- Full suite on `main`: tests 1938, pass 1929, fail 0, cancelled 0, skipped 9,
  todo 0. Lint green (394 files, 0 errors); shellcheck and PSScriptAnalyzer were
  skipped locally for want of the binaries and run in CI.

`main` was then merged into this branch and the check re-run over the branch's
own file list: **exit 0**. The obstacle is gone as a fact, not as an exemption —
the closure criterion was never relaxed.

One deviation noticed while doing this and not corrected retroactively: the
commits on this branch carry a `Generated-by:` trailer, while `main` and upstream
both use `Co-Authored-By:`. The `main` commit uses the upstream form; the branch
history was left alone rather than rewritten.

## Sixth closing round — three findings, all in this session's own prose

Seventh clean run of the companion runtime. The round confirmed T17's two vaults
observe both sub-cases, confirmed the M1/M2/M7/M10 partition, and confirmed the
test count consistent at seventeen. Every one of the three findings was in text
written during this run of fixes, not in the spec's original content.

- **F-1 (medium) — the managed-block baseline was inaccurate.** Current state
  claimed `buildBlock` "neutralizes only lines exactly equal to its own BEGIN/END
  sentinel". The code compares `line.trim()` against the sentinel, so a padded
  sentinel is neutralized too. Inherited wording, but touched this session when
  the `trimEnd` clause went in, without checking the sentence around it. Fixed to
  say what the code does, plus the fact that settles it for this surface: A1
  excludes `<`, `>` and `!`, so a sanitized project name cannot spell a sentinel.
- **F-2 (medium) — the sub-case boundary was drawn on the wrong side.** A9 said
  "a name ending in spaces sanitizes unchanged". Measured counterexamples: `'   '`
  and `'---   '` both end in spaces and both sanitize to the **empty** string,
  because A3 deletes the whole leading run. They are case (b), not (a), so the
  two sub-cases overlapped and (a) was false for real inputs. The boundary now
  sits on the sanitized **output**: (a) is non-empty and ends in U+0020, (b) is
  empty.
- **F-3 (low) — four mirrors carried a weaker wording than A9.** A9 said "every
  trailing whitespace character"; the Security checklist, the Not-relaxed line,
  Coverage and Out of scope all said "space". Same contract, two forces, in
  registered mirrors.

### The structural answer, applied a second time

F-3 was the third appearance of one family: a canonical row changes and its prose
mirrors drift. Ruled: apply the A12 pattern to A9 rather than align the wording a
third time.

A9 now owns the mechanism outright and states it once — `trimEnd` strips every
trailing whitespace character, and on this surface only U+0020 is reachable
because A1 admits no other whitespace, mapping tab, U+00A0 and U+3000 alike to
`_`. Every prose surface was reduced to a bare citation carrying no mechanism at
all: "row A9's recorded final-position divergence". Text with no content in it
cannot go stale, which is the whole point.

Measured after the change: the mechanism is named in exactly two places in the
file — row A9, and T17 itself, which has to be concrete because it is the gate.
Current state, the SHAPE-PB comment, the Security checklist, the Not-relaxed
line, Coverage and Out of scope now all point rather than describe.

Two canonical owners now hold the two contracts that drew the most review
traffic: **A12** for the golden fixture, **A9** for the persisted-surface
divergence.
