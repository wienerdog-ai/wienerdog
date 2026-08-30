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
`validate.js:16` and a counting condition at `validate.js:1430`, moving every
line below the first by one.

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
