---
title: The two PR gates on PR #31, rounds 1–2 (WP-dream-promote-module)
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The two PR gates on PR #31

Run locally on the branch diff from merge base `dcd5777`; GitHub CI unavailable
(the Actions billing block — every check failed in 2–3s with zero steps and the
annotation "The job was not started because recent account payments have
failed"). Both gates read-only, both verified clean before and after. Raw
output committed before adjudication in every round.

**STOP CRITERION, stated late and recorded as such.** This loop began without a
pinned criterion — the rule exists and was not run, which is itself a finding
against me. Pinned now, retroactively, at the point the repeat-kind rule fired:
**the loop closes when a round finds nothing about the product; it ESCALATES to
an owner design question the moment two consecutive rounds land findings of the
same KIND.** That condition is now met, twice over, so this record closes the
loop rather than dispatching a round 3.

| Round | Gate | Tip | Verdict | Findings | Raw |
|---|---|---|---|---|---|
| 1 | Codex rubric (gptsol) | `db86d3e` | patch is incorrect | 1 (P1) | `2026-08-29-promote-module-pr-gate-round-1-gptsol-raw.txt` @ `b4a9e24` |
| 1 | spec fidelity (wd-reviewer) | `9d8daf3` | REQUEST-CHANGES | 9 | `...-round-1-wd-reviewer-raw.txt` @ `2f3d506` |
| 2 | spec fidelity (wd-reviewer) | `16c98e9` | REQUEST-CHANGES | 7 new | `...-round-2-wd-reviewer-raw.txt` @ `d79b125` |
| 2 | Codex rubric (gptsol) | `16c98e9` | patch is incorrect | 1 (P1) | `...-round-2-gptsol-raw.txt` @ `cbff493`'s parent |

## THE OVERLAP MEASUREMENT — decision-grade about the GATES

Counting raw findings as each gate filed them: **18 filed across two rounds
(1 + 9 + 7 + 1), of which ZERO are shared.** Not one finding was found by both
gates in either round.

**That is this family's Part-i result, not its Part-ii result.** The promote
split's PR #30 saw the two gates converge on one root cause with one shared
finding out of twelve. Here the separation is total, and it is not noise — it is
structural:

- The Codex rubric gate found **both** merge-cwd defects (round 1's ambient
  `TMPDIR`, round 2's relative-`TMPDIR` fail-open). Both are *executable*
  properties: it wrote a repro, ran it, and watched the cwd land inside the
  workspace. The spec-fidelity gate read the same code twice and did not see
  either.
- The spec-fidelity gate found **every** contract defect — the redact-then-refuse
  data-loss path, the two unimplementable criteria, the evaluation-order
  deviation, the mirror drift, and then the defect *my own mitigation*
  introduced. All of these require holding the spec's tables against the code;
  none is reachable by running anything.

**Running one gate would have shipped what the other caught, in both
directions.** That is the strongest evidence this repo has produced for keeping
both.

## Round 2 is the important one, and not because of its findings

Round 1's fixes **injected two new defects** — a rate right at the top of this
repo's measured 0.5–0.9 band:

- the merge-cwd guard I added in round 1 was itself bypassable (round 2's P1);
- the F1 mitigation I added in round 2's commit made one route **worse than
  leaving it alone** (N1): the pair refusal named the wrong file's quarantine
  copy first.

Neither was caught by the tests I wrote for those very fixes. Both were caught
by a gate. **A fix is not a closure; it is new code with the same defect rate as
the old code, and it needs the same gate.**

## TWO ROOT CAUSES, and both are the spec's, not the code's

### 1. The EP2 gate's result has no owner for its failure arms

Five findings across two rounds land here: F1 (no carrier for the artifact once
a redaction is refused), F2 (no field for Q4's three states), F3 (Q5/Q6 have
criteria but no surface), the `@param`/Table D disagreement, and **N1, which
exists only because of F1** — with no typed carrier, the mitigation had to
encode a structured fact into free prose, and immediately produced an ambiguous
string.

Table Q was extracted in pass (b) *because* four earlier rounds kept landing on
"what the EP2 gate produces besides a verdict". It settled the **success arm's
shape** and left the failure arms, the invariant's evidence, and the lifecycle
rows without owners inside this boundary. **Nine rounds have now landed on this
one question.** This is the ADR-0031 signal, and the answer is not a tenth
round.

### 2. A guard that asks "am I outside?" cannot borrow a helper that fails closed on "inside"

Both merge-cwd P1s are one mistake. `isAtOrBeneath` documents its fail-open
explicitly — "A NON-ABSOLUTE CANDIDATE IS NEVER INSIDE ANYTHING" — and that is
the **correct** answer at its original call site, where a relative layout value
grants no access. Reused in a guard whose safe answer is the opposite, the same
rule silently reports "outside" about a path that is inside.

The family's rule is "never re-implement containment; call the one helper". That
rule is right and I followed it. What no surface says is that **the helper's
fail-open direction is part of its contract**, and a consumer must check its
input's preconditions before trusting the answer. Worth a sentence in the
primitive's Table H or in `workspace.js`'s own JSDoc — the next consumer will
make this mistake too.

## Dispositions

### FIXED (implementer's, all with a proven RED)

| # | Round | Fix | Commit |
|---|---|---|---|
| P1 | 1 (rubric) | ambient `TMPDIR` could put the merge cwd inside the workspace; CLAIM 2b now CHECKED via `isAtOrBeneath`, fail-loud | `9d8daf3` |
| F4 | 1 | primitive-seam oracle was the return value; now the vault tree | `16c98e9` |
| F5a | 1 | C1 now evaluated first, per Table C's "top to bottom, first match decides" | `16c98e9` |
| F5b | 1 | a never-admissible path no longer feeds `secretDisposition.withheld`, so it no longer defers a transcript to re-refuse itself forever | `16c98e9` |
| F6 | 1 | spec Current-state amended: the `isAtOrBeneath` import authorised as a CONSUMER, not a second implementation | `16c98e9` |
| F7 | 1 | resolved-path test asserts the mechanism, not just the outcome | `16c98e9` |
| F8 | 1 | `layout` validated; unvalidated, a caller bug read as a quiet no-op | `16c98e9` |
| F9 | 1 | PR body refreshed to the reviewed tip | PR edit |
| P1 | 2 (rubric) | relative `TMPDIR` bypassed the guard (fail-open); root resolved before the check + explicit absoluteness assertion | `cbff493` |
| N1 | 2 | pair refusal named the WRONG file's quarantine copy first; clauses now attributed, pair built from the undecorated reason | `cbff493` |
| N2 | 2 | M2's cwd rule has two halves; `GIT_CEILING_DIRECTORIES` closes repository-local discovery | `cbff493` |
| N3 | 2 | stale `decisions` JSDoc — this project's only type surface | `cbff493` |
| N4 | 2 | duplicate refusal format string | `cbff493` |
| N7 | 2 | vault oracle made bidirectional | `cbff493` |

### PARTIAL, and labelled as such

**F1** — every refusal now names the preserved quarantine copy inside the
`reason` string, on all four refusal routes, each clause attributed to its own
path. This stays inside the `{rel, reason}` shape Table S row S3 fixes. **It is
not the fix**: the report package still has no typed field, so it must parse
prose. Escalated below.

### ESCALATED — owner's, because each is a contract change

| # | Question the owner must settle |
|---|---|
| F1 | Does the refused arm get a typed artifact carrier (a third arm, or a field S3's no-bytes rule tolerates), or does a Q-row rule that redact-then-refuse cannot occur? |
| F2 | Does Q1 gain a field saying whether the preserved copy byte-matches the current bytes, or does Q4's three-state criterion move to the package owning the gate? |
| F3 | Do Q5/Q6 belong in this spec at all, given row Q7 puts the state directory outside this module and `validate.js` outside its Deliverables? |
| N5 | One sentence in Table C's header stating that C1 precedes the four gates, and that a never-admissible path therefore does not feed `secretDisposition`. The code decided this; the table is still silent, which is the inversion ADR-0031 exists to prevent. |
| N6 | A consequence of that same ordering, for the ruling to see: the EP2 gate is no longer CALLED for a non-admitted path, so it no longer preserves a quarantine copy for one. A hard secret written to `.claude/settings.json` previously left a recoverable copy and now leaves none. Judged the right trade by both the reviewer and me — brain-authored content on a path that can never be promoted — but it is a quarantine-lifecycle behaviour change produced by an ordering no table states. |

**The recommendation both gates converge on:** run ONE reconciliation pass over
Table Q against Table S and `### Exact contracts`, settling the redact-then-refuse
arm, Q4's evidence field, and Q5/Q6's ownership in a single sitting — **before**
any round 3. A round 3 dispatched now would re-derive the same family for the
tenth time.

## What I got wrong, recorded because it is the useful part

- **I did not pin a stop criterion before round 1.** The rule is in the runbook,
  it is one line in a record I was already writing, and I skipped it.
- **I wrote tests for my own fixes that could not catch my own fixes' defects.**
  Twice. The RED proofs I ran were real, but each proved only the case I had
  already thought of — which is precisely what an adversarial gate is for.
- **I treated "use the family's one helper" as sufficient** rather than checking
  the helper's failure direction against my use. The rule protected me from
  re-implementing containment and did not protect me from misusing it.

## Rebase onto the reconciled main, 2026-08-30

PR #32 merged as `68ac5e9`, so this branch rebased off `dcd5777` onto it. Ten
commits replayed with **zero conflicts**; the two files both sides touched —
`docs/GLOSSARY.md` and this package's spec — merged cleanly because the two
lanes edited different regions of each.

**The re-verification was unconditional, not contingent.** Only ONE cited file
changed in the window: `WP-quarantine-warnings-file` added a `require` at
`validate.js:16` and a counting condition at `validate.js:1430`.

**The shift is not uniform, and the first form of this section said it was
("moving every line below the first by one"). The false clause is deleted
rather than re-worded.** Two insertions make three zones: old `1`–`15` → `+0`,
old `16`–`1428` → `+1`, old `1429`–`1469` → `+2`. Derived empirically, not
reasoned: every old line was matched against the new file at `+0`, `+1` and
`+2`, and the three zones came back contiguous and complete. All 73 carried
endpoints sit in the middle zone (highest: old `1409`), so the bump is right —
but the boundary matters, because a range citation ASTRIDE the second insertion
maps to non-contiguous lines, and the sibling spec has exactly one.

| What was checked | Result |
|---|---|
| Cited files compared byte-for-byte, authoring tree `36c2ce5` → merge base `dcd5777` | identical for all ten, so reading the base IS reading the authoring tree |
| Cited files compared `dcd5777` → `68ac5e9` | only `src/core/dream/validate.js` differs |
| `validate.js` citation tokens carried over | 50 — 47 in the spec, 3 in `promote.js` — naming 73 line endpoints |
| Endpoints matched one line down | 73 of 73 |
| Endpoints that ALSO matched in place | 0 — so no token was bumped on a coincidence |
| Bare `:NNN` citations owned by another file | 5, re-derived from the surrounding prose and deliberately NOT bumped (`:931-989` is the audit review, `:414-418`/`:867`/`:853-863` are `digest.js`, `:32-42` is `layout.js`) |
| Measurements re-taken | `validate.js` 1469 → 1471 lines; `vault-write.js` still 481 |
| Every referenced spec, logbook and WP id | resolves on the new tree; `WP-quarantine-warnings-file` is now `Done` and the one sentence naming it was already tense-neutral |
| `npm test` | 2219 pass, 1 fail — `tests/integration/adopt-e2e.test.js`, which fails identically on `68ac5e9` with this branch absent (a real `claude` on the machine defeats the fixture's pinned path). Environmental and pre-existing; recorded under Discovered issues, not fixed here |
| `npm run lint` | passed |
| `tests/unit/dream-promote.test.js` | 39 pass |

**The lesson the bare `:NNN` form taught, recorded because it nearly cost a
false bump:** a bare line citation inherits its file from the prose above it, so
a mechanical sweep cannot tell `validate.js`'s from `digest.js`'s. The owner map
had to be re-derived from the text — and it had to be re-derived a SECOND time
after the dispatch-block note shifted every spec line by fourteen, because the
first map was keyed by line number and silently pointed at the wrong lines. **A
citation index keyed by position goes stale the moment you edit above it.**

## Round 3 — both gates on the rebased tip

**Stop criterion, pinned before adjudication:** this round closes when both gates
are clean or every finding has a disposition on the SAME tip. A finding that
would require another package to change its text escalates; an implementer-owned
sweep does not.

| Gate | Raw output | Introduced by | Verdict on `6ec1ab5` |
|---|---|---|---|
| PR rubric (gptsol) | `2026-08-30-promote-module-pr-gate-round-3-gptsol-raw.txt` | `07947f0` | patch is incorrect — 2 × P2 |
| Spec fidelity (wd-reviewer) | `2026-08-30-promote-module-pr-gate-round-3-wd-reviewer-raw.txt` | `07947f0` | REQUEST-CHANGES — 1 contract-band, 2 C-band |

**Both gates independently confirmed the rebase re-verification** — the ten
byte-identical files, the 50 tokens, the 73 endpoints, the 1469→1471
measurement — each re-deriving the numbers rather than reading them.

### Dispositions

| # | Gate | Finding | Disposition |
|---|---|---|---|
| 1 | BOTH | `promote.js`'s public `@returns` declares the pre-reconciliation shape | **fix** — the two gates converged on this independently, and I reproduced it before touching anything |
| 2 | rubric | `date` is never validated, unlike the other six required inputs | **fix** — TDD, RED first |
| 3 | spec | "moving every line below the first by one" is over-general | **fix by DELETION**, per the owner's append-only rule |
| 4 | spec | `--exclude='promote.js'` and its rationale are vacuous | **fix** — flag dropped |

**Why finding 2 is a real defect and not a style complaint.** `date` reaches the
EP2 gate, which names the preserved unredacted copy `<date>-<basename>`. An
`undefined` shelves the user's ONLY route back to their original bytes under
`undefined-note.md` and reports that name to them — and the run promotes
normally, so nothing downstream notices. Six required inputs fail loud and the
seventh did not; the inconsistency was itself the trap.

**Finding 3 took the deletion arm on purpose.** The owner's rule of 2026-08-30 —
record fixes are append-only, deletion or subordinate correction, never in-place
re-wording — was issued after six consecutive in-place re-wordings each injected
a fresh false claim. Its REASON reaches this case exactly: this is the second
false description of the same measurement. A false generalisation has nothing to
preserve, so it was deleted and the measured three-zone map put in its place.

### What I got wrong this round

- **I walked no Mirrored Surface Checklist.** Every box was empty, and the one
  surface it names first is the one that was stale. The checklist existed, the
  spec pointed at it, and I did not run it — which is how a type contract went
  three commits out of date under two gates that had already passed the file.
- **I generalised a measurement I had just made precisely.** I derived a uniform
  `+1` from the citation set, which was true of the citations, and wrote it as
  true of the file, which it was not. The measurement was right and the sentence
  was wider than the measurement — the same shape as the four false revision
  descriptions this family has already produced.
- **I kept a flag whose rationale I never tested.** `--exclude='promote.js'`
  claimed to prevent a redness that the delivered file cannot produce. One
  ten-second grep would have shown it; the flag rode along because it was
  already written.

## Round 4 — the rubric gate clean, the spec gate escalating

**Stop criterion, pinned before adjudication:** clean or all-C on the same tip
closes the round. A contract-band finding of a kind already seen in a previous
round does NOT get another textual patch — it goes to the owner as a design
question, per the runbook's repeat-kind rule.

| Gate | Raw output | Introduced by | Verdict on `81c00a1` |
|---|---|---|---|
| PR rubric (gptsol) | `2026-08-30-promote-module-pr-gate-round-4-gptsol-raw.txt` | `f60f1f1` | **patch is correct — zero findings** |
| Spec fidelity (wd-reviewer) | `2026-08-30-promote-module-pr-gate-round-4-wd-reviewer-raw.txt` | `f60f1f1` | REQUEST-CHANGES — 5 contract-band, 2 C-band |

The rubric gate proved two round-3 fixes by MUTATION rather than by reading:
deleting the `date` guard reddens its test, and a planted `require('./promote')`
reddens the consumed-by-nothing assertion in its new form while the old
`--exclude` form stayed falsely green. The spec gate independently re-derived
the three-zone shift map from the hunk headers and confirmed it.

### Dispositions

| # | Finding | Band | Disposition |
|---|---|---|---|
| 1 | `:80` still said "the shift is uniform", contradicting `:67` eight lines above | contract | **fix by deletion** — the gate named the exact clause; no design judgment in it |
| 2 | The checklist was ticked 4 of 21 while claiming consistency over the whole | contract | **fix by narrowing** — the gate's own option (iii). Whether items 5–21 are walked before merge is ESCALATED |
| 3 | `GLOSSARY.md` said "only three" outcomes, omitting `redacted` | contract | **fix** |
| 4 | `GLOSSARY.md` said all four gates judge the landing bytes — false of EP2 | contract | **fix** |
| 5 | `date` is declared `date:string` with no shape, but is used as a path component | contract | **ESCALATED to the owner → wd-architect.** Not the implementer's to close by guessing a regex |
| 6 | The new `@returns` prose narrated Q9's split under a disclaimer saying it did not | C | **fix** — cite, don't narrate |
| 7 | The mirror said "EVERY arm" where the canonical enumerates "BOTH of these arms" | C | **fix** — match the canonical |

### The repeat-kind rule fired, and here is the kind

Findings 1, 2 and 7 are ONE defect wearing three costumes: **a correction placed
BESIDE a false claim instead of replacing it, and a certification whose scope is
wider than the evidence behind it.** Round 3 produced two of them while fixing
two of them. Counting the family's earlier rounds, this is the sixth window in
which a fix introduced a defect of the class it was closing.

**What was missing was not care — it was a mechanical step**, and the one that
works has already been proven twice in this package: *grep for the CLAIM, not
for the sentence.* Round 3's citation sweep succeeded because it grepped the
NUMBER being changed. Round 4's correction failed because it re-read the
paragraph it was editing instead of grepping the claim's distinguishing word.
Measured after the fact: `grep -n "uniform"` returns both sites — the correction
at `:67` and the survivor at `:80` — in one command. **The rule that follows:
when correcting a claim, grep the claim's distinguishing word across every
surface FIRST, delete every occurrence, and only then write the correction.**
Proposed as a runbook line, not adopted here — that is the owner's call.

### What is NOT decided here

- **Finding 5** is a genuine spec gap: `### Exact contracts` declares `date` a
  string and says nothing about its shape, while the shipped gate composes
  `<date>-<sanitized-basename>` — only the basename half is sanitized. A `date`
  carrying a path separator reaches a filename this module never builds and
  cannot see. The non-empty-string check is the right BUILD against the spec as
  written and stays; the contract needs an architect.
- **Items 5–21 of the checklist.** Narrowing the claim made it true. Walking
  them is a different question, and items *Table Q* and *Table S* reach five
  rows in two sibling packages.

### What I got wrong this round

- **I called it a deletion and deleted one of two copies.** The logbook got the
  treatment; the spec did not, and the surviving clause sat eight lines below
  its own correction, in the same paragraph.
- **I ticked four boxes and certified twenty-one.** I read the checklist through
  a grep window that showed four items, never saw the other seventeen, and wrote
  "the mirror is otherwise consistent" over all of them.
- **Two false claims in `GLOSSARY.md` survived three rounds** because the file is
  a Deliverable that no checklist item names. The gate found them by reading the
  canonical text against the code, which is what I should have done when I wrote
  the entry.

## The architect run of 2026-08-30 — findings 2 and 5, and nothing else

The owner scoped this run to two tasks against `2c264a5`: give `date` a shape
(round 4's finding 5) and walk exactly two of the seventeen unwalked checklist
items (round 4's finding 2, escalated half). No other spec text was touched, and
nothing outside `docs/specs/WP-dream-promote-module.md` and this directory was
editable.

### Finding 5 — `date` now has a shape, in ONE place

**The row: Table D, `The `date` INPUT'S SHAPE`.** Table D owns what the gates
are HANDED, and `date` is handed to two of them (`promote.js:819` to the EP2
gate, `:961` to the skill-body guard — corrected 2026-08-30 from `:812`/`:954`,
which landed on the call expressions' other arguments; the gate reported
`:816`/`:958`, true of the tree it read and moved by three lines when the same
commit rewrote this module's header), so the shape belongs
there rather than in
Table E, which owns the write, or in Table Q, which owns the gate's OUTPUT.

**The shape is `/^\d{4}-\d{2}-\d{2}$/`, not the weaker "no path separators".**
The pattern is a positive allowlist, so nobody has to enumerate what a path
separator is on which platform — the same argument row C9 already makes about
its own allowlist, and the same argument the containment lesson makes about
string answers to path questions. It also matches, rather than merely permits,
what the two owning surfaces already spell: the shipped preserving call's own
`@param` says `YYYY-MM-DD` (`validate.js:693`) while composing
`<date>-<sanitized-basename>` with only the basename sanitized (`:683`), and
`WP-dream-promote-report`'s report row names `<reports_dir>/<date>.md`.

**A third consumer was measured during the pass and is corroboration, not a
second owner:** the skill-body guard compares `cur.updated === date`
(`validate.js:282`) against a note's `updated` frontmatter, which the vault
writes in the same spelling — so the pattern is what keeps that comparison
meaningful too. Table D's skill-body row already named the run date among its
inputs, which is why the new row does NOT claim that no gate row names `date`.

**What the module must add:** the existing non-empty check becomes the pattern
test, same throw, same place. Nothing else moves.

**What was deliberately NOT added: an acceptance criterion.** No criterion in
this spec covers ANY of `promote()`'s seven argument checks — the `date` guard
that round 3 asked for landed with none either. Adding one only for `date` would
put a second statement of the pattern on a second surface, which is the exact
defect this package has produced six times. Whether the argument checks as a
CLASS get a criterion is an owner's call, recorded here rather than taken.

### Finding 2 — two items walked, and the arithmetic says two

Items *Table Q* and *Table S* were resolved mirror by mirror against the
repaired `@returns` and **both cleared**. The cross-package half was read on
`main` and reported, never edited: `WP-dream-promote-report`'s five Table N rows,
its two Table R rows, its Q1–Q3/Q8/Q9/Q10 criterion, its `report` union and its
Current-state paragraph; `WP-dream-promote-in-workspace`'s rows G5, G7, G8, G10
and V3 and row G7's acceptance criterion.

**The one thing the walk found, filed not fixed:** the report package's
Current-state paragraph attributes "the arms that carry the preservation record"
to row **Q1**. Q1 decides that for the GATE's three arms (`{ok}` / `{refuse}` /
`{redact}`); the rule for `promote()`'s RETURN arms is row **Q8**'s, with Table S
row S3 for `refused[]`. The shape it describes is correct, so this is a
citation-owner slip and not a drift — and it is one surface away from the
"corrected 2026-08-29, round 4's F-8" note in the same sentence, which fixed a
different mis-citation in the same clause.

**Fifteen items remain unwalked and the spec says fifteen.** The scope sentence
was rewritten to name them individually (5–12, 14, 15, 17–21) rather than by a
range that would drift if an item were ever inserted.

### One gap opened on purpose

The new `date` row and its one mirror are on NO checklist item. Registering it
would make the list twenty-two entries and falsify the six-of-twenty-one count
the owner fixed for this pass, so it is named in the section's own gap paragraph
and routed to the owner instead of taken quietly. This is the second such gap
recorded there; the first is `docs/GLOSSARY.md`.

## Round 5 — the code cleared, the registry escalated

**Note on the rounds-1-and-2 SHAs above.** The rebase onto `68ac5e9` rewrote
this branch, so the commits those earlier rows cite — `b4a9e24`, `2f3d506`,
`d79b125`, `16c98e9`, `cbff493`, `db86d3e`, `9d8daf3` — are **no longer
ancestors of this branch**. They still resolve in this clone's object store and
they were true when written, so the rows stay as the record they are. Checked
mechanically with `git merge-base --is-ancestor`, not assumed. **The rule the
raw-SHA convention protects still holds** — a SHA cannot be cited before its
commit exists, so a skipped raw-commit is still visible at adjudication time —
but a reader on a fresh clone will not be able to follow those seven. The
round-3 through round-5 SHAs (`07947f0`, `f60f1f1`, `e4c3a29`) are post-rebase
and are ancestors.

| Gate | Raw output | Introduced by | Verdict on `d548f5a` |
|---|---|---|---|
| PR rubric (gptsol) | `2026-08-30-promote-module-pr-gate-round-5-gptsol-raw.txt` | `e4c3a29` | patch is incorrect — 1 × P2 |
| Spec fidelity (wd-reviewer) | `2026-08-30-promote-module-pr-gate-round-5-wd-reviewer-raw.txt` | `e4c3a29` | REQUEST-CHANGES — 2 contract, 2 quality |

**All seven round-4 findings verified genuinely fixed**, and the spec gate said
of the deliverables: *"The shipped code is clean and I would approve it as it
stands."* It judged the new `date` contract correct in owner, citation,
uniqueness and strength, and probed the trailing-newline case **against its own
stated hypothesis** — expecting JS `$` to leak a newline the way Perl's does,
and reporting that it does not. A check that disproves the checker is the kind
this record should name.

### Dispositions

| # | Gate | Finding | Disposition |
|---|---|---|---|
| P2 | rubric | `promote.js:9` and spec `:130` still said the four gates judge the bytes that would actually land | **fix** |
| — | (sweep) | the SAME sentence enumerated three outcomes, omitting `redacted` | **fix** — found by sweeping the claim, not named by either gate |
| 4 | spec | two `promote.js` citations in the architect section resolved to the wrong lines | **fix** |
| 1 | spec | item *Table Q*'s mirror list says "Q3, Q8 and Q10" where the mirror asserts Q1–Q3, Q8, Q9, Q10 | **ESCALATED** — inside the checklist |
| 2 | spec | the `date` registry-gap paragraph says "one mirror"; measured, three cite the row | **ESCALATED** — inside the checklist |
| 3 | spec | `### Exact contracts` still narrates Q9 where `promote.js` was fixed to cite it | **ESCALATED** — the gate itself called it the architect's call |

### The eighth injection, and it was mine

The rubric gate named ONE false claim in that sentence. Sweeping the claim
found **two**, and the second is the one already fixed once this session:
`GLOSSARY.md`'s "only three" outcomes, omitting `redacted`, living on in the
module header and the spec summary in different words.

**The rule was written down, saved, and then not applied.** Round 4 recorded
"grep the claim's distinguishing word across every surface FIRST" and round 5's
sweep ran it for four claims — `uniform`, `otherwise consistent`,
`non-empty string`, `YYYY-MM-DD` — and not for the four-gates claim, because the
glossary fix was treated as finished at the instance that was named. **A named
instance is one example of the rule, never the whole of it.** The correction
that follows is not a new rule but the same one, applied to itself: after
fixing any claim, sweep for THAT claim, not only for the ones already on the
list.

Then the correction re-injected once more, in miniature: the logbook citations
were fixed to `:816`/`:958` — true of the tree the gate read — in the same
commit that added three lines to the module header and moved them to
`:819`/`:961`. Caught by measuring instead of trusting the arithmetic, and
recorded rather than smoothed over.

### The escalation the gate raised — ADR-0031 on the checklist

Two of this round's three substantive findings landed inside the **Mirrored
Surface Checklist**, and round 4's did too: three rounds deep on one section.
The gate's reading is that neither finding is a thinking error — both are what a
~250-line hand-maintained prose registry does — and that **the section is itself
the contract-dense prose ADR-0031 says to extract into a canonical table**: one
row per item, one column for the mirror set, one for the prohibitions, one for
walk state. The spec already names the consumer that will need it tabular
(`scripts/mirror-walk.js`).

Findings 1, 2 and 3 have their correct values already derived — in the walk
paragraph, in the gate's report, and in this record — so they can land inside
that pass without re-deriving anything. **Routing it is the owner's call; a
seventh consecutive prose patch to the same section is what the repeat-kind rule
exists to prevent.**

## The checklist extraction, and what it settled

Owner-ruled after round 5: the Mirrored Surface Checklist becomes an ADR-0031
canonical table rather than taking a seventh prose patch. Run record:
`2026-08-30-promote-module-checklist-extraction.md`.

**The form.** One row per registered contract, five columns — a stable id, the
contract, the mirror set, the prohibitions, the walk state. Tick boxes are gone;
**the Walk state column is the only place a walk is recorded**, and the section's
counts are now DERIVED from it by three greps printed in the preamble rather
than asserted beside the data. That is the structural answer to the defect that
produced this pass: a count written next to a list drifts from it, and a count
computed from the list cannot.

**Verified before accepting, and the greps were run verbatim with BOTH `grep` and
`/usr/bin/grep`** (the shim has produced a false absence in this repo before):
21 rows, 6 walked, 15 unwalked — the split the owner fixed, unchanged. The six
walked rows are `MS-01`–`MS-04`, `MS-13`, `MS-16`, which are the same six the
gate verified by position.

**The three findings landed with their derived values, not re-derived.** Round
5's finding 1 was folded in the errata form — the corrected cell names what it
used to say and why that named no criterion the sibling spec contains. Finding 2
now names all three surfaces that cite the `date` row plus the code that
implements it. Finding 3 was fixed AND generalised into a registered prohibition
on `MS-13`: **no block that disclaims restating row Q9 or Q10 may narrate a named
field's filler or its moment in the same breath.** Applying it found a SECOND
site the round-4 fix had missed, one block over — which is the "named instance is
never the whole ask" rule catching its own case.

**The named consumer cannot read the new form, and this is now measured rather
than assumed.** `scripts/mirror-walk.js` is not in this tree — it is unmerged on
`tools/mirror-walk` — and it recognises an entry only by a leading `- [ ]`, so it
parses the table as ZERO entries. It fails LOUDLY: the vacuity guard exits 1.
The change is confined to `checklistEntries`; verified on a scratch copy, all 21
rows resolve with 0 unresolved and the reverse index answers correctly. **The
table form also mitigates that script's known `stripFindingIds` defect** — `\s*`
does not cross a `|`, so a cell boundary terminates its runaway match.

**Two owner-calls the pass declined to discharge, and said so instead of
quietly resolving them:** registering `docs/GLOSSARY.md` (it carries TWO
contracts — the taxonomy and the gates' input split — so filing it under the
taxonomy row would misfile half of it, and a new row breaks the fixed
arithmetic), and registering Table D's `date` row (same arithmetic). Both are
recorded as refusals with reasons.

**One reported discovered issue was false and is not carried forward.** The run
reported the round-4 line-number defect (`promote.js:812`/`:954`) as still live.
Checked: the logbook was already corrected to `:819`/`:961`, and the string it
matched sits inside the errata clause recording that correction. An errata that
quotes what it fixed will match a grep for the thing it fixed — which is the
cost of the append-only form, and worth knowing before the next sweep.

## Queue — carried out of this work package

| # | Item | Why it is queued rather than done here |
|---|---|---|
| Q-1 | **The claim-sweep rule** into the runbook: when correcting a claim, grep its distinguishing WORD across every surface FIRST, deal with every occurrence, then re-run the grep as proof | a process rule; the owner adds runbook lines |
| Q-2 | **"A named instance is never the whole ask"** into the runbook beside Q-1: a gate reports what it FOUND, never the extent of what is there — after fixing any claim, sweep for THAT claim too, not only for the ones already on the list | same; this round paid for it twice |
| Q-3 | **`mirror-walk.js`'s `checklistEntries` taught to read the table form** — delimiter row opens, pipe rows are entries, blank line closes | the script is out of this package's boundary, unmerged on `tools/mirror-walk`, and needs its own PR and gate |
| Q-4 | **Structural parser check in the lint pipeline** (an unclosed fence once swallowed 764 lines under a green lint, because every check greps) | pipeline work, not this package's |
| Q-5 | **The branch-freeze rule** into the runbook: a branch under gate review is frozen until the verdict | process rule |
| Q-6 | **Registering `docs/GLOSSARY.md`** and **Table D's `date` row** on the registry | both need a row-count decision the owner fixed deliberately |
