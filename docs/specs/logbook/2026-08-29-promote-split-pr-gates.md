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
surface** — `2026-08-28-promote-split.md`, "THE CANONICAL TABLE-LETTER MAP" — and
all three specs CITE it. **A cut that moves a table now updates one table**, and the letter-division
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
