---
title: The two PR gates on PR #30 (raw + dispositions), the promote split
date: 2026-08-29
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The two PR gates on PR #30

Run locally on the branch diff `36c2ce5...47d2dbf`; GitHub CI unavailable (no
Actions credit). **Both gates returned no-ship.** Both read-only, both verified
clean before and after.

| Gate | Verdict | Findings |
|---|---|---|
| spec fidelity (wd-reviewer) | REQUEST-CHANGES | **10** — 5 B, 5 C, **no A** |
| Codex rubric | "patch is incorrect", NO-MERGE | **2** — 1 B, 1 C |

## THE OVERLAP MEASUREMENT — decision-grade about the GATES

**The counting unit, named first, because an earlier form of this paragraph mixed
two units and was right in neither.** Counting RAW FINDINGS AS EACH GATE FILED
THEM: **12 filed (10 + 2), of which 1 is shared** — the Codex ownership finding,
which alone covers wd-reviewer's findings 3 and 4. Counting DEDUPLICATED ATOMIC
PROBLEMS: **11 distinct, of which 2 were found by both.** Either unit is
defensible; mixing them is not. The Codex gate's B (the module's Deliverables
note and its self-contradicting write criterion) is wd-reviewer's findings 3 and
4; its C (a stale lint file count in the PR body) wd-reviewer measured
independently but did not report, having been unable to read the PR body.

**That is materially different from this family's Part i, where thirteen findings
had ZERO overlap.** Here the two gates converged on one root cause — and both
still contributed uniquely: wd-reviewer found the dispatch-order defect, the
missing Current-state bullet, the unnamed redactor and the stale letter map;
Codex found the stale evidence number in the PR body, which wd-reviewer could not
reach. **Both remain load-bearing; running one would have shipped what the other
caught.**

## ONE ROOT CAUSE — the T1 cut was not swept across the family

**Nine of wd-reviewer's ten findings and the Codex B are the same failure:** the
cut moved report ownership out of the module half, and the move was not
propagated. The rule it violates is the one this arc has now paid for four times
(`spec-authoring.md`): *"Sweep for the CLAIM, not for any wording of it — and
across every spec in the family, not only the one being edited."*

**The aggravating detail, recorded because it is the useful part:** both stale
specs **registered this exact surface in their own Mirrored Surface Checklists.**
The discipline that should have caught it was present and was not run.

## Dispositions — all twelve ACCEPTED and FIXED

| # | Band | Fix |
|---|---|---|
| B1 | B | the pipeline's dispatch precondition said "three of the four"; there are **five** deps and **two** pending. Corrected, and it now states that dispatching after the module alone leaves rows G11/G12 consuming fields that do not exist |
| B2 | B | the pipeline's Current state had no bullet for the report package, though G11 and G12 consume what it adds. Added, citing its contract |
| B3 | B | a module criterion asserted a `report` return field the module explicitly does not have. Sentence cut |
| B4 | B | a module criterion contradicted itself in one cell — heading said "the REPORT included", body disclaimed report writes, RED case *was* a report write. Heading and RED case dropped; also `reports/dreams/<date>.md` → the layout value every other surface uses |
| B5 | B | **the redactor was named nowhere in the family** while the sanitiser was pinned three times. `redactOnly` (`secret-scan.js:314`, exported `:325`) now named in the report package's Current state, with the reason: an implementer told to "redact" with no function may write a second detector, which this repo already warns against |
| C6 | C | **the family letter map was restated in three specs and two were stale** — see the extraction below |
| C7 | C | Table V row V4 named the module as owner of the report row and Table R; corrected to the report package |
| C8 | C | Out of scope attributed the report to both packages; the module bullet now excludes it |
| C9 | C | the module's mirror checklist named the `report` union's arms as its own mirror; corrected to a cross-package citation |
| C10 | C | "Three further RED directions" followed by four; corrected |
| Codex B | B | same as B4/the Deliverables note; the note now says "for ordinary notes… NOT the report" |
| Codex C | C | the PR body's `539 files` was stale. **THIS DISPOSITION WAS FALSE WHEN WRITTEN: it said "Refreshed" and the body was never edited** — recorded here rather than silently corrected, because a disposition table claiming a fix that was not made is the same failure this whole record is about, committed inside it. Both gates caught it on re-run. The body is now actually updated, and the file COUNT was dropped from it entirely: it changes with every markdown file this PR adds (539 → 553 → 554 across three tips), so it is self-invalidating evidence and `0 error(s)` is the claim that holds |

## THE STRUCTURAL FIX, per the gate's own ADR-0031 routing

wd-reviewer routed C6 as a **canonical extraction rather than six patches**, and
that is what was done: **the family-wide table-letter map now lives in ONE
LIVING surface** — `docs/specs/logbook/2026-08-29-promote-family-map.md` — and all
three specs CITE it. **It was first placed in `2026-08-28-promote-split.md` and
the next gate rejected that host as a dated execution record contradicting the
table; this sentence named the old host for one round after the move, which is a
mirror drifting inside the record about mirror drift.** **A cut that moves a table now updates one table**, and the letter-division
restatements are gone from all three specs. **The claim was over-sold in an
earlier form of this line and the next gate falsified it inside the same diff:**
each spec's **Out of scope** bullets still describe the other packages'
ownership in hand-maintained prose, and one had ALREADY drifted — saying "Table
G" where the map says "G and V". **A cut updates the map AND sweeps the
Out-of-scope bullets.** The extraction removes one class of restatement, not
every ownership sentence in the family.

## What the gates CONFIRMED rather than faulted

**No A-band from either.** wd-reviewer read Table N — the surface that produced
both of this loop's A-bands — as sound: the order ruled, the fail-closed default
as enforcement rather than a note, the RED direction correctly requiring an
*unwired* interpolation. Its Closed-Contract Drift Check came back clean: the cut
is a propagation failure, not a reinterpretation.

It also re-derived every logbook number independently and all of them held: the
95-element inventory as 76 + 19; T1 firing at 30 against 28, with **30 − 7
report-scoped = 23**, matching the module's measured count today; the flip line
23/3, 9/2, 24/6; nineteen findings across nine rounds, with every per-round band
breakdown summing to its own total. It ran the module spec's own verification
commands and confirmed the glossary check is **red** — non-vacuous — and the
consumed-by-nothing grep **green**. All 30 commit subjects conventional. ~32
`file:line` citations resolved with ranges checked at both ends.

**Both gates stated what they did NOT check** — wd-reviewer that it did not audit
the "sixteen priors fixed twice" claim prior-by-prior, and that it could not
verify the PR body's evidence at all; Codex that it ran no full-suite lint layers
absent locally. **A gate that names its own reach is worth more than one that
implies completeness.**

## A SCOPE OBJECTION THAT WAS WRONG, AND THE REAL GOTCHA UNDER IT

wd-reviewer objected that **"there is no PR #30 for this branch"** —
`gh pr list --head wp/promote-split-charter` returned `[]`.

**Measured: PR #30 exists, is OPEN, and its head IS this branch.** But the cause
of its error is real and worth keeping:

```
gh repo view --json nameWithOwner   →  wienerdog-ai/wienerdog
git remote get-url origin           →  git@github.com:felho/wienerdog.git
```

**`gh` resolves this checkout to a DIFFERENT repository than the git remote**, so
any `gh` command here without `--repo felho/wienerdog` silently queries the wrong
repo — and `gh pr view 30` in the resolved one returns an unrelated work package.
**That is a live trap for every future session and agent in this checkout**, and
it is the reason the gate could not read the PR body. Recorded here rather than
dismissed with the objection.

## THIRD GATE RUN on `4de2c6c` — THE READING PINNED BEFORE IT RUNS

**Owner ruling, 2026-08-29.** Both gates re-run on the same tip, and **that tip
is `4de2c6c`, not the `351bbfd` the ruling named: committing this very section
moved the tip.** Measured, the substance is unaffected —
`git diff --name-only 351bbfd..4de2c6c -- docs/specs/WP-*.md` is empty, so both
gates judge identical spec content. **The SHA is corrected rather than left to
redirect**, because a self-invalidating identifier is the shape the file count
was removed for one section above. And **the
interpretation is fixed now so it cannot be chosen after seeing the findings** —
the same discipline this family applied to round 4's classification.

| The run returns | Reading | Consequence |
|---|---|---|
| **clean, or C-band ONLY** | the same-tip rule is **SATISFIED** | the merge decision follows |
| **any B-band** | not noise | **returns to the OWNER together with the materiality question — NOT an automatic fourth iteration** |

**The grounds, as ruled:** **zero A across two full gate rounds**, and
**decreasing amplitude** — first pass 12 findings filed with one root cause,
second pass no A and no B, its findings confined to this record's own over-claims
and a stale PR body. **What remains is the injection baseline**, and **its owner
is the post-merge implementation defence line**, not another spec iteration.

**Why the B branch is not automatic.** Three consecutive fix-and-regate cycles
have each produced defects in the fixes themselves, at a rate this program
measures at 0.5–0.9 per fix. **A fourth iteration is therefore not free and not
obviously convergent**, so a B-band finding is a decision about materiality — is
this worth another cycle's injected defects — and that decision is the owner's,
not the author's.

## RUN 2 (`da19609`) — dispositions

| Gate | Verdict | Findings |
|---|---|---|
| spec fidelity | REQUEST-CHANGES | 6 — 3 B, 3 C, no A |
| Codex rubric | NO-MERGE | 3 — all C, no A, no B |

**All nine accepted and fixed** in `351bbfd`: the map relocated to a living
surface (B2); the drifted `Table G` → `G and V` mirror and the narrowed
extraction claim (B3); the PR body's three stale statements and **the disposition
that claimed a fix never made** (B1); the two false universals (C4); both package
notes' two-package framing (C5); the heading level (C6); the mixed counting units;
and the "all five specs" citation claim.

## RUN 3 (`4de2c6c`) — dispositions, and the gates' verdicts

| Gate | Verdict | Findings |
|---|---|---|
| spec fidelity | **MERGE-READY** | 3 — **all C, no B, no A** |
| Codex rubric | **"patch is correct" / MERGE** | 1 — **C, no B, no A** |

**Under the reading pinned above, a C-only result SATISFIES the same-tip rule.**
Both gates judged `4de2c6c`; both re-audited every prior finding and ruled all of
them genuinely fixed; both independently re-derived 23/3, 9/2, 24/6.

| # | Gate | Band | Disposition |
|---|---|---|---|
| 1 | fidelity | C | this record named the map's OLD host, in the same commit that moved it. **FIXED** |
| 2 | fidelity | C | the pinned-reading heading named `351bbfd` while the section itself moved the tip to `4de2c6c`. **FIXED**, with the reason stated |
| 3 | fidelity | C | the PR body said the gates are "recorded in" this file while runs 2 and 3 appeared only as prose. **FIXED by making it true** — the two disposition blocks above are that record |
| 4 | Codex | C | **"a cut updates that one table and nothing else" survived in ALL THREE specs' citation block.** The narrowing landed in this record and not in the text the specs actually carry — *"the previous overclaim was relocated rather than genuinely removed"*. **FIXED in all three** |

**Two things the gates declined to file, worth as much as what they filed:**
fidelity checked the body's "15 logbook records" against 17 files and confirmed
it reconciles exactly (the two remainders are the living map and this record,
both described separately), then did NOT file it; and it noted `npm test` was not
re-run for budget, substituting the decisive check — the empty `src`/`tests`/`bin`
diff — which is what makes the pre-existing-failure attribution sound at all.

**The lint file count reached 555 on this run** — 539 → 553 → 554 → 555 across
four tips. Removing it rather than pinning it was the correct call, and this run
is the fourth consecutive proof of it.
