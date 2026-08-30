---
title: The two PR gates on PR #42 (WP-dream-promote-report)
date: 2026-08-30
related_wps: [WP-dream-promote-report, WP-dream-promote-module, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The two PR gates on PR #42

Run locally on the branch diff from merge base `14e2a70`. **GitHub CI is
unavailable** — the Actions billing block: every check failed in ~3s with zero
steps and the annotation "The job was not started because recent account
payments have failed or your spending limit needs to be increased." No job
started, so no check result on this PR is evidence about the branch. Every
blocked check was reproduced locally and the reproduction is recorded on the PR
(`#issuecomment-5470254046`).

Both gates dispatched read-only, each briefed with `WIENERDOG_LOADER_NOOP=1`
and instructed to prove `git status --porcelain` byte-identical before and
after — the hijack lesson from this family's earlier rounds, where a review
agent's temp-`HOME` init reached the owner's real launchd jobs.

## STOP CRITERION — pinned BEFORE either gate's output was read

This section was written and committed while both gates were still running, so
the criterion cannot have been shaped by what they returned. The module half's
record had to pin its criterion retroactively and recorded that as a finding
against itself; this is that lesson applied.

- **The loop CLOSES when a round finds nothing about the PRODUCT** — `src/`
  behaviour, the contract, anything a consumer or a user observes — **on a tip
  BOTH gates cleared.** Machinery findings alive at that point are fixed inside
  the existing surface or accepted as named residuals; they do not extend the
  loop.
- **BOTH GATES MUST BE CLEAN ON THE SAME TIP.** A fix that moves the tip after
  one gate cleared it re-opens that gate.
- **Weighted closure** (runbook): HEAVY — a finding whose fix changes what the
  product does — means fixes land and then a fresh full round for that gate.
  LIGHT — a finding about the verification machinery, tests, wording — means
  fixes land and are verified mechanically, with no fresh round. When in doubt,
  HEAVY.
- **Every finding gets exactly one disposition**: fix / residual / drop, each
  with a one-line reason. For every finding the reachability question is asked
  explicitly: **is this a blocker or a residual, and which workflow actually
  produces the shape it describes?** That question is what ended this family's
  eleven-round loop on PR #23.
- **The surface FREEZES.** Verification machinery may grow only to guard a
  product behaviour, and only in the smallest form that guards it. A finding
  about the machinery never justifies more machinery.
- **ESCALATION, three triggers, any one of which stops the loop and routes an
  owner question rather than another patch:** (i) two consecutive rounds land
  findings of the same KIND; (ii) a finding whose only honest fix re-imports a
  property this package was deliberately re-cut to exclude — a contract change
  is the owner's act, however small the patch looks; (iii) a round that would be
  the FOURTH. Three rounds is the budget.

## Rounds

| Round | Gate | Tip | Verdict | Findings | Raw |
|---|---|---|---|---|---|
| 1 | Codex rubric (gptsol) | `aea77ef` | patch is incorrect | 2 (both P2, both PRODUCT) | `2026-08-30-promote-report-pr-gate-round-1-gptsol-raw.txt` @ `80e0f84` |
| 1 | spec fidelity (wd-reviewer) | `aea77ef` | REQUEST-CHANGES | 9 | `2026-08-30-promote-report-pr-gate-round-1-wd-reviewer-raw.txt` @ `410b67c` |
| 2 | spec fidelity (wd-reviewer) | `795f904` | REQUEST-CHANGES | 4 (1 BLOCKER, 1 product, 2 residual) | `2026-08-30-promote-report-pr-gate-round-2-wd-reviewer-raw.txt` @ `c43d63c` |
| 2 | Codex rubric (gptsol) | `795f904` | patch is incorrect | 2 (both P2, both PRODUCT) | `2026-08-30-promote-report-pr-gate-round-2-gptsol-raw.txt` @ `1952499` |

Raw output is committed BEFORE it is read or judged, and each row cites the raw
file's path AND the SHA of the commit that introduced it. A row without that SHA
is a round where that rule did not run.

**The tip moved twice during round 1, both times through logbook-only commits**
(`fbe2949`, the pinned criterion above; then the two raw-output commits). The
wd-reviewer gate DETECTED this itself and reported it rather than silently
reviewing a moved target — the correct behaviour, and worth recording as
evidence the read-only check works. Both round-1 gates reviewed `aea77ef`;
`docs/specs/logbook/` is an always-allowed boundary path and the code diff was
byte-identical throughout, which the rubric gate verified with
`git diff --exit-code aea77ef fbe2949 -- <the three deliverables>` (exit 0).

## THE OVERLAP MEASUREMENT — decision-grade about the GATES, not about the diff

**Round 1: 11 findings filed across the two gates (2 + 9), of which ZERO are
shared.** Not one finding was found by both.

**That reproduces the module half's Part-i result exactly** — 18 filed across two
rounds, zero shared — and it is not noise. The two gates look at different
things and the separation is total:

- The **rubric gate** found both PRODUCT defects, and found them by PROBING the
  code with inputs the tests never supplied — a config value with a trailing
  slash, an NFD spelling of an NFC path. Neither is visible by reading the diff
  against the spec, because the spec says nothing about either: they are defects
  against the TREE, not against the contract.
- The **spec-fidelity gate** found zero product defects and instead measured the
  TESTS, running 14 mutations and finding three that the suite passed 54/54.
  Those are defects against the contract's ASSERTIONS, invisible to a reviewer
  probing behaviour, because the behaviour was correct — only unguarded.

**The lesson this round adds:** "both gates clean" is not redundancy, it is
coverage of two disjoint failure modes. A pipeline that dropped either gate
would have shipped this package with a crash on a legitimate config, or with
three acceptance criteria that assert nothing.

## Round 1 dispositions

Every finding was reproduced by the implementer before being acted on — the
runbook's spot-check rule — and none was taken on the reviewer's word.

### Rubric gate (gptsol)

| # | Finding | Weight | Disposition |
|---|---|---|---|
| P2-1 | `reports_dir` with a trailing slash yields `reports/dreams//<date>.md`; the primitive's segment validation throws, failing EVERY run | **HEAVY** | **FIX.** Reproduced: `readVaultLayout` accepts and PRESERVES a trailing slash (`isSafeRelativePath` does not reject one), and a bare run crashes with `` `rel` has an empty path segment ``. Empty segments are now dropped exactly as `isUnder` already reads a layout directory — the module's own existing convention, not a new one |
| P2-2 | The body was matched by literal `===`, so an NFD spelling of the layout's NFC path folds it into `promoted[]` while the fallback fires as though no body existed | **HEAVY** | **FIX.** Reproduced: `report.outcome = 'fallback'` with the report path sitting in `promoted[]`, i.e. the report written twice. Matching now canonicalises then case-folds — `fold`, the same predicate row C9 uses and for the same measured reasons. The second write additionally targets `reportBody.rel`, the path the FIRST write published to: a fix that matched loosely but wrote to the layout's spelling would publish the section to a different file on a case-sensitive filesystem |

**Both are defects this commit INTRODUCED** — `promote()` constructed no report
path before it — so neither is the pre-existing kind the rubric excludes. Row C9
admission was measured and is unaffected in both cases: `isUnder` filters empty
segments and `makeAdmit` already folds, which is precisely why the module's own
conventions were the right place to take both fixes from.

### Spec-fidelity gate (wd-reviewer)

| # | Finding | Weight | Disposition |
|---|---|---|---|
| 1 | The primitive-refusal route never asserts the body stays out of `refused[]`; mutation I passes 54/54 | LIGHT | **FIX.** The one-sided hole: the gate-refusal twin (mutation I2) was caught. Case (ii) now gives the body a gate-preserved copy and asserts both the exclusion and a non-empty `report.preserved` |
| 2 | Criterion (b)'s "COMPLETE record" clause is satisfied by a record truncated to its heading; mutation L passes 54/54 | LIGHT | **FIX.** The case-(b) scenario carried no redaction and no preserved copy, so the clause had nothing to bite on. It now redacts the body, redacts a sibling and refuses a third path, each with its own copy, and asserts the lines by CONTENT |
| 3 | Table Y row Y7 unasserted; mutation M passes 54/54 | LIGHT | **FIX**, folded into finding 2's scenario |
| 4 | Two user-facing headings no spec pins, one replacing the shipped `## Reverted by orchestrator (policy enforcement)` | — | **RESIDUAL + ROUTE to wd-architect.** Condition (a) was already met before the gate ran — the PR body's "Decisions made" #5 records the choice and names the shipped string it replaces. Condition (b), pinning both headings in the report row or a Table Y/R row, is wd-architect's and is **blocking for `WP-dream-promote-in-workspace`**, which makes one of them the live string. Nothing user-visible changes here: this package ships consumed by nothing and `validate.js` still writes the old heading |
| 5 | Table N has no row for the report body's own refusal reason, nor for `report.reason` on the refused arm | — | **RESIDUAL + ROUTE to wd-architect.** The gate states it itself: no implementation defect follows — the first is neutralised and the catch-all row plus the fail-closed guard cover both (its mutation A: 2 fail). This is the table being incomplete against the shape this package ships, and Table N's own ground says a channel with no row is indistinguishable from one nobody thought about. `reportRel` itself is worth a third row stating it is code-derived and NOT attacker-influenceable |
| 6 | `scripts/mirror-walk.js` does not exist; the checklist dropped a hand-maintained count on the strength of it | — | **RESIDUAL + ROUTE to wd-architect.** PRE-EXISTING and already filed: the module half's round-3 gate raised it naming `report:596` specifically, and it survived that spec's round-6 close. Out of this PR's blast radius — the spec is touched here for the status flip only. Either land `tools/mirror-walk` or restore the counts |
| 7 | `composeRecord`'s `@param` writes out the field lists of the module half's `refused[]` and `redacted[]` | LIGHT | **FIX** rather than the offered drop, because the file was already open: both are now `ReturnType<typeof promote>[...]`, which removes the second structural statement without inventing a name |
| 8 | The appended section can land with its heading directly under a paragraph line when the base has no trailing newline | **HEAVY** | **FIX** rather than the offered residual: the base on R3 is a USER's vault document, the shipped append guaranteed a `\n`-terminated base, and the fix is one expression. R3's fixture deliberately keeps its missing trailing newline and now asserts the guarantee — preserving the user's bytes and normalising the SEPARATOR are different things, and the test says so |
| 9 | The `readVaultNow` error branch is a fifth fallback case Table R does not enumerate | — | **RESIDUAL, recorded.** An unreadable report path is a READ failure before any write — R4-shaped but not R4. Failing closed to `refused` with the record delivered is the simpler option per CLAUDE.md and is recorded in the PR body's "Decisions made" #9 |

### Every fix re-verified by mutation, not by reading

The three previously-green mutations (I, L, M) now fail. Each product fix was
also reverted in place and its regression test went red: the naive join reddens
the trailing-slash test, literal equality reddens the canonical-identity test,
and the un-normalised separator reddens R3. The round-1 RED probes were re-run
on the changed surface and still discriminate — an unwired interpolation still
makes composition refuse, and sanitise-first still leaks.

---

# ROUND 2 — ESCALATION TRIGGER (i) HAS FIRED. THE LOOP STOPS HERE.

**The pinned criterion is met, and it was pinned before either gate's output was
readable precisely so this could not be rationalised past.** Trigger (i): *two
consecutive rounds land findings of the same KIND.*

| | Round 1 | Round 2 |
|---|---|---|
| Gate | Codex rubric | **BOTH** |
| Findings on **report-path derivation and identity** | 2 of 2 (rubric) | 2 of 2 (rubric) + 3 of 4 (spec fidelity) |

- **Round 1**: `reportRel` built by a naive join (empty segment → the primitive
  throws); the body matched by literal `===` (NFC/NFD → the report written twice).
- **Round 2**: the derivation is STILL not H1-valid (a `.` segment throws, from
  three `reports_dir` values `readVaultLayout` really returns); the matching
  predicate OVER-matches (two spellings in one run → both delta records lose
  their carrier entirely); and the derived path and the matched path DISAGREE at
  the record on the fallback arm.

**Round 2's first two findings are defects in round 1's own fixes.** That is the
treadmill this repo has twice been through, and the runbook names the exit:
*"When two consecutive rounds land findings of the same kind, the next step is a
design question, never another textual patch."*

## Both round-2 product findings independently reproduced

Neither was taken on the gate's word.

```
readVaultLayout(".")             -> "."                 << PRESERVED
readVaultLayout("reports/./dreams") -> "reports/./dreams"  << PRESERVED
readVaultLayout("./reports")     -> "./reports"          << PRESERVED

promote(reports_dir="reports/dreams/")  -> outcome = fallback          (round 1's fix holds)
promote(reports_dir="reports//dreams")  -> outcome = fallback          (round 1's fix holds)
promote(reports_dir=".")                -> THREW: `rel` has a "." path segment
promote(reports_dir="reports/./dreams") -> THREW: `rel` has a "." path segment
promote(reports_dir="./reports")        -> THREW: `rel` has a "." path segment
```

`splitRel` (`src/core/dream/vault-write.js`) rejects **three** segment shapes —
empty, `.`, `..` — and `isSafeRelativePath` (`src/core/layout.js:65-71`) filters
only **two** of them — absolute and `..`. The caller must close the other two,
and round 1's fix closed one.

The identity over-match, reproduced with a cloned delta record (this Mac's
tmpdir is case-insensitive and cannot hold both spellings):

```
delta rels                = [ 'reports/dreams/2026-08-29.md', 'reports/Dreams/2026-08-29.md' ]
promoted/redacted/refused = 0 0 0
records with NO carrier   = [ 'reports/dreams/2026-08-29.md', 'reports/Dreams/2026-08-29.md' ]
```

Both records match `isReport`, `reportBody` is assigned twice and the second
assignment silently discards the first. **That is the exact state the module
throws for one branch earlier** — `promote: no outcome was decided for …` —
reached without the throw.

## WHY A THIRD PATCH IS THE WRONG MOVE, stated as a measurement rather than a preference

The gate grepped all four family specs — `WP-dream-promote-report`,
`WP-dream-promote-module`, `WP-dream-promote-in-workspace`,
`WP-dream-vault-write-primitive` — for the derivation and the identity rule.
**No row anywhere pins either one.** The family pins the primitive's
OBLIGATION (Table H, row H1) and leaves the caller-side half of that contract to
be invented by an implementer — which has now happened twice, both times under
gate pressure, and both inventions were defective.

**The mirror is the evidence.** `promote.js`'s own comment states the rule as
"empty segments are dropped, exactly as `isUnder` reads a layout directory". That
is a true statement of the code and a PARTIAL statement of H1's rule: the surface
it mirrors rejects three segment shapes and this one handles one. The test
repeats the same partial rule — and spends its one case on `'/reports/dreams'`,
an input `readVaultLayout` **cannot return**, while missing all three reachable
broken ones. A mirror that has fallen out of agreement with its canonical table,
and it is the same mirror both product defects came through.

A third invention has the same expected defect rate as the first two. The fix
must land against a CONTRACT, not against the last gate's example.

## THE OWNER QUESTION

**Pin the caller-side path contract before `promote.js` is touched again.** Three
facts, and they are wd-architect's to write, not the implementer's:

1. **DERIVATION** — how `reportRel` is built from `layout.reports_dir` and
   `<date>.md`, and its standing obligation to satisfy row H1. Name which shapes
   `readVaultLayout` already guarantees (absolute, `..`) and which the CALLER must
   drop (`.`, empty), so the next implementer is not re-deriving the split.
2. **IDENTITY** — the predicate matching a delta record to the report body, its
   folding rule, and **what happens when MORE THAN ONE record matches**. Today
   that case silently drops both.
3. **AUTHORITY** — which path the record NAMES and which the fallback TARGETS on
   the `published:false` arm. After round 1's fix these are two different values
   and no surface says which is authoritative.

**The mechanical fix for finding 1 is one expression and is known** — adding
`s !== '.'` to the filter — and it is deliberately NOT applied here. Applying it
would be the third textual patch on the contract the loop keeps hitting, which is
what the trigger exists to prevent.

**Nobody is exposed while this sits.** The module ships consumed by nothing (the
consumed-by-nothing grep exits 0 in both rounds), the PR is unmergeable with both
gates requesting changes, and `reports_dir` is a hand-edited config key whose
default (`reports/dreams`) is unaffected by either defect.

## THE SECOND OVERLAP MEASUREMENT — the gates CONVERGED, and that settles the escalation

**Round 2: 6 findings filed across the two gates (2 + 4), of which TWO are
shared — and they are the same two.** Both gates independently filed the dot
segment and the folded-identity over-match, at the same two code locations, in
the same round, having run different probes.

| | Findings filed | Shared |
|---|---|---|
| Module half, rounds 1–2 | 18 | **0** |
| This package, round 1 | 11 | **0** |
| **This package, round 2** | **6** | **2 — both PRODUCT defects** |

**Why this is decision-grade rather than a curiosity.** Every prior measurement
in this family showed total separation, and the round-1 record concluded from it
that the two gates cover disjoint failure modes. That conclusion still holds —
but convergence carries information the separation did not: **when both gates,
running different methods, land on the same two lines, the defect is in the
ARTIFACT rather than in either reviewer's lens.**

It also removes the one reading that could have kept the loop running. A single
gate repeating a finding is consistent with that gate having a fixed idea; two
independent gates reaching it from different probes is not. **The escalation is
therefore not one reviewer's judgement about my fix — it is a measurement, taken
twice, that the caller-side path contract does not exist and cannot be inferred
correctly.** The rubric gate even names the same remedy shape as the
spec-fidelity gate — "normalize or reject dot segments … as is already done for
empty segments", "detect multiple matching records" — which is precisely the
contract the owner question asks to have pinned.

Both gates also independently confirmed that **round 1's two fixes are genuinely
gone**, so the escalation is about the REMAINDER of the contract, not about a
regression.