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

## Seventh closing round — a false green in the original content

Eighth clean run of the companion runtime. Three findings, and unlike the two
rounds before it, the serious one was not in this session's prose.

- **F-1 (high) — nothing in the file constrained the end of a sanitized name.**
  The spec gates leading position with care (row A3, T7's leading input, mutation
  M7) and never gates trailing position: T7's three inputs all ended in `b` or
  `ab`. Measured consequence — an implementation that mirrors A3 at the tail
  passes **every one of the seventeen tests**: T5's legitimate names, T7's whole
  sweep, T8's idempotence, T10's worked pairs and both of T17's vaults. What it
  does in the field: `report.` becomes `report`, `my_note_` becomes `my_note`,
  `a-b-` becomes `a-b`, `z` plus three spaces becomes `z`. That is the outcome
  row A1 exists to prevent, shipping green.

  Ruled fix: T7 gains a fourth, trailing-position input, and **M11** is added as
  the mutation that supplies its observed red side — measured, the trailing
  assertion fails at `cp = 0`. The test count stays seventeen; the mutation count
  moves to twelve.

- **F-2 (medium) — A9's reachability condition was too broad.** It said the
  divergence bites "whenever the project section is the digest's last part".
  Measured: `trimEnd` touches only the string's end, so `'a\nb   \nc'` comes back
  unchanged, and past `MAX_PROJECTS` the code-owned overflow line is last and no
  project line is final. The condition now names all three requirements, and
  **T17 gained a third, control vault** — the same trailing-space name followed
  by another project — so the condition is gated rather than merely stated.

- **F-3 (low) — one surviving sixteen-test reference.** M9's cell carried
  "sixteen when that was measured" as a historical qualifier. Removed; the
  sentence lives count-free.

### The walk after the mutation table changed

The mutation table moving from eleven rows to twelve triggered the
update-all-mirrors walk again. It found three surfaces beyond the four count
statements, none of which the round had named:

- **T8's cell** described the sweep as "all three inputs" — T7 now has four, and
  T8 reuses T7's corpus. Corrected, with the reason the trailing input is
  included there even though it adds no failing side of its own: one corpus for
  both tests beats two that have to be kept in step.
- **M9's cell** enumerated T7's mismatching inputs at `cp = 0x10400` as three.
  Re-measured: all four mismatch, the trailing one giving `ab_` where `ab𐐀` is
  required.
- **M7's cell** said T7 and T8 "each test both positions". With trailing added
  there are three positions plus the run shape; reworded to sweep every position.
- **M11's own cell** was then caught carrying exactly the historical count
  qualifier F-3 had just ruled out, and was reworded count-free for consistency
  with that ruling rather than left as a special case.

Two green-side checks were run before landing any of it, so the new assertions
are not merely red-capable: the correct implementation is idempotent over the
full sweep with all four inputs (zero violations), and M8 stays green under the
trailing input across `cp 0..0x2fff` — the run input remains the only thing that
catches it, which is what its cell claims.

## Eighth closing round — the fixes are now generating the findings

Ninth clean run. A9's reachability condition, M11's red set and the 17/12/4
counts were confirmed. Three findings, two of them direct consequences of the
previous round's own fix.

- **F-1 (medium) — the T17 table row was left behind by its own test body.** The
  body had been renamed to "and only there" and grown a third vault; the row
  still said the old name and "two vaults". Two contradictory surfaces in one
  section. Fixed: the row now carries the body's literal name, all three vaults
  and the control's expectation.
- **F-2 (medium) — a justification this session wrote became false in the same
  commit that wrote it.** T7's cell claimed that without the trailing input
  "nothing in this file constrains the end of the string", citing M11. But the
  T17 control added in that same commit catches M11 too. Measured: the broad tail
  trim reddens both T7 and T17's control; a **narrower** variant that removes only
  a trailing `.`, `_` or `-` and never a space is green on all three of T17's
  vaults and on every other test, and is caught by the trailing input alone. The
  justification now cites that variant, and M11's cell states what its own red set
  already showed — two independent assertions catch it.
- **F-3 (medium) — exact mapping was ungated on mixed runs.** T7's four inputs
  each vary a single `ch` or its double, so no per-code-point sweep can see a
  pair like `_-`. Measured: appending `` .replace(/_-/g, '_') `` was green on
  **every one of T1–T17** while turning `a` + newline + `-b` into `a_b` where A2
  requires `a_-b`. Fixed: T10 gains the `HOSTILE_A` exact-mapping pair — the test
  count does not move — and **M12** is added with its measured red set, `{T10}`.

### Q15 applied as practice, and what it caught

The owner recorded Q15 as a candidate: after adding a gate, re-measure every
MEASURED claim the new gate could invalidate, in the same commit. Applied here
before writing anything, it caught a row the round had not mentioned — **M8**.
Its cell claimed "T7's run input is the only assertion that fires"; with
`HOSTILE_A` in T10 that is no longer true, because HOSTILE_A carries a run of
excluded characters that M8 collapses. M8's measured red set is now T7 and T10,
and its cell records that the T10 side was measured when the pair was added.

That is one round's worth of findings avoided by a discipline that cost one
measurement pass.

### A modelling error caught before it reached the artifact

While re-measuring, the first pass modelled M1 as an identity function and
concluded that T10 reddens under it. That is wrong: M1 patches the **splice
site**, explicitly leaving `sanitizeProjectName` defined, so every pure-function
test — T5, T6, T7, T8, T10 — is untouched by it. M1's cells were correct as they
stood and were not changed. Recorded because the failure mode is worth naming:
modelling a mutation by its effect rather than by its stated patch produces
confident, wrong red sets.

All thirteen rows were then read end to end as reddens/stays-green pairs. Only
M8 needed changing, and one cell of it — M8's stays-green list had been written
with T17 in it, against the stated convention that the cells carry T1–T16 and the
note carries T17. Corrected to T1–T6, T8, T9, T11–T16.

## Ninth closing round — one finding, and the third structural owner

Tenth clean run, and the first round of this series to return a single finding.
Part A confirmed every count and all thirteen mutation partitions against the
tree.

**The finding:** `HOSTILE_C`'s mandated exact mapping was asserted nowhere.
Measured — a post-process collapsing a space followed by an underscore turns
`log__ _end of daily log_` into `log___end of daily log_` and passes T7's four
inputs, T10's ten pairs and all thirteen mutation rows.

### Why the fix was not "add HOSTILE_C"

Round eight found `HOSTILE_A` missing from T10's hand-listed subset. Round nine
found `HOSTILE_C`. `HOSTILE_B` was missing too and would have been round ten.
That is the pattern the repo's own P1 lesson names: when a review keeps finding
one more entry missing from an enumeration, the enumeration's granularity is the
defect, not its contents.

Owner ruling: **T10 quantifies over the worked input→output table** — every row,
not a named subset — with a closed two-row exception list, both still gated. The
`Olvasnivalók` row's expectation is prose ("the input, byte-identical") and T6
gates it in NFC and NFD; the leading-spaces row's input is described rather than
written and is built from escapes. Measured before landing: the implementation
this spec mandates reproduces all seventeen literal rows.

That is the third structural owner in this run. **A12** owns the golden fixture,
**A9** owns the persisted-surface divergence, and the worked table now owns the
exact-mapping obligation. All three replaced an enumeration that reviews kept
finding one more member of.

### Q15's second application

Announced before the change and measured, not inferred: a table-wide T10 moves
exactly one mutation row. **M11** reddens T10 once the table is in scope, because
`HOSTILE_B` ends in `.` and `HOSTILE_C` ends in `_` and a tail trim removes both;
its measured set moves from `{T7, T17}` to `{T7, T10, T17}`, and its cell records
that the T10 entry arrived with the scope change. M2, M7 and M8 already carried
T10 and do not move; M9 stays green; M1, M3, M4, M5, M6a, M6b and M10 patch the
splice site or the EP4 decision and leave the pure function alone.

### M12 became a family row rather than spawning M13

The new mutant, which merges a space into the underscore that follows it, is a second member of the mixed-adjacency family M12
already represents, so M12 names the family and both measured members instead. A
row per discovered patch would rebuild, one level up, exactly the enumeration T10
had just replaced with a quantifier.

All thirteen rows were read end to end afterwards as reddens/stays-green pairs;
the partition is consistent and no other cell moved.

## Tenth closing round — zero findings

Eleventh clean run of the companion runtime. **Verdict: approve. No material
findings.** The ruled closure criterion is met: a fresh full round, against text
that was byte-identical to the committed spec, returned nothing.

What the round confirmed rather than merely accepted: the mandated
implementation reproduces every row of the worked table; the two named
exceptions are gated where the table says they are — T6 for NFC/NFD, T10's
escape-built literal for the leading-spaces row; all thirteen mutation
reddens/stays-green sets match the tree; the seventeen-test and thirteen-row
counts are consistent; and no contract surface remains at a narrower scope than
the row that owns it.

### The series

Findings per round, from the re-cut onward: **17 → 3 → 2 → 1 → 3 → 4 → 2 → 3 →
3 → 3 → 1 → 0.**

Seventeen came from the internal fidelity and coherence passes before any
external round. Of everything after, the findings fall into three groups. The
first is content the eleven pre-reset rounds had passed and this run caught
anyway — a false-green in `G1`'s envelope, the ungated trailing position, the
ungated mixed run. The second is prose this run wrote while fixing the first,
which is most of the middle of the series. The third is three families that kept
reopening until each got a single owner: **A12** for the golden fixture, **A9**
for the persisted-surface divergence, and the worked input→output table for the
exact-mapping obligation. Every one of those three was closed by replacing an
enumeration with a quantifier or a citation, and none of them reappeared after.

Three practices were added along the way and all three paid for themselves
inside this package: the internal coherence pass before any external round
(Q13), the update-all-mirrors walk run whenever a canonical row changes, and
Q15 — re-measuring every MEASURED claim a new gate could invalidate, in the same
commit. Q15's first application caught M8; its second caught M11.

The spec's `status:` stays `Draft`. Raising it to `Ready` is the owner's act.
