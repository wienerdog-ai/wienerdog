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

| 3 | Codex rubric (gptsol) | `3ac951b` | **patch is CORRECT — clean** | **0** | `2026-08-30-promote-report-pr-gate-round-3-gptsol-raw.txt` @ `941d490` |
| 3 | spec fidelity (wd-reviewer) | `3ac951b` | REQUEST-CHANGES | 5 — **0 about the PRODUCT** | `2026-08-30-promote-report-pr-gate-round-3-wd-reviewer-raw.txt` @ `941d490` |

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

---

# OWNER RULING, 2026-08-30 — THE CONTRACT, NOT THE PATCH

**The trigger stands; the owner declined to override it.** Ruled:

> The contract, not the patch — the trigger stands, I am not overriding it.
> A wd-architect round: the caller-side path contract (`reportRel` derivation
> with a SINGLE OWNER, the delta-record identity definition, collision
> authority) in canonical form, with the two gates' SHARED findings as input.
> Then the fix against the contract, and round 3 measures the settled form.
> Let the record preserve the "two rounds, two fixes, two new defects" curve —
> this is Table S's prehistory one level over, and the patch would only have
> looked cheaper.

## The sequence this pins

1. **wd-architect** writes the canonical contract. Not the implementer, and not
   inline in the fix.
2. **The fix lands against the CONTRACT**, not against the last gate's example.
3. **Round 3 measures the SETTLED form** — both gates, on one tip.

## THE CURVE, preserved by ruling

| Round | What was fixed | What the fix produced |
|---|---|---|
| 1 | `reportRel` built by a naive join — an empty segment throws in the primitive | A fix that closed ONE of `splitRel`'s three rejected segment shapes |
| 1 | The body matched by literal `===` — NFC/NFD writes the report twice | A folded predicate that **OVER**-matches, so two spellings in one run leave BOTH delta records with no carrier |
| 2 | — | Both gates, independently, on the same two lines |

**Two rounds, two fixes, two new defects, one contract family.** Every
individual fix was correct about the case in front of it and wrong about the
contract behind it, because there is no contract behind it — the caller-side half
of Table H row H1 exists in no spec, so each fix could only be measured against
the last example rather than against a rule.

**This is Table S's prehistory one level over, and naming that is the point of
recording it.** Table S was extracted by the ADR-0031 circuit-breaker after two
consecutive external rounds landed a finding on ONE contract — round 1's R1-1
(the interface typed paths where the prose promised bytes) and round 2's F2 (the
same defect surviving on the report's arm of the same interface). The breaker's
rule was to stop patching finding-by-finding and pull the contract into one
canonical table with registered mirrors. **The shape here is identical, one level
down the same call:** there the contract was WHICH BYTES cross `promote()`'s
return; here it is WHICH PATH `promote()` derives and matches. Same family, same
two-round signature, same remedy.

**And the patch only looked cheaper.** Measured: round 1's fix was two
expressions and produced two defects that cost a full round on both gates. The
third expression would have been cheaper still to write and had no better prior.

## Table-letter space, measured for the architect

`grep -rhoE '^### Table [A-Z]' docs/specs/` over the whole tree:

```
used : A B C D E F G H J K L M N O P Q R S T U V W Y
free : I X Z
```

The constraints Table Y's own preamble already recorded still bind: **`I` is
rejected** because its row ids (`I1`) are misread as `11` or `Il` in prose, and
**`X` is rejected** because this family uses `### Table X` as its metasyntactic
placeholder for "some table"
(`2026-08-29-promote-family-design-round-zero-raw.txt:164`). That leaves **`Z`**,
which Y's preamble deliberately preserved so it would not be "spent on a table
that is not last" — a consideration the architect now has to weigh against
having no alternative. Rows in Table R or Table Y remain the other option and
cost no letter at all.

**Whatever is chosen, the canonical map
(`docs/specs/logbook/2026-08-29-promote-family-map.md`) is a LIVING surface and a
new letter is a change to it** — plus a sweep of each spec's Out-of-scope
ownership prose, which stays hand-maintained.

---

# ROUND 3 — THE LOOP CLOSES. The contract worked.

**The pinned criterion's closing condition is met: this round found NOTHING
ABOUT THE PRODUCT.** The rubric gate returned `patch is correct` with zero
findings. The spec-fidelity gate returned REQUEST-CHANGES on five items, of which
**zero are behaviour** — every Table Z row was verified CORRECT BY EXECUTION, and
its two mutation survivors were assertion gaps.

## What the contract bought, measured

| | Round 1 | Round 2 | **Round 3** |
|---|---|---|---|
| Product defects | 2 | 2 | **0** |
| Filed by both gates | 0 | 2 | — |
| Rubric verdict | incorrect | incorrect | **CORRECT** |
| Mutations killed | — | — | **24 of 26** |

**Rounds 1 and 2 each fixed a defect and produced a new one in the same family.
Round 3, the first round in which the fix landed against a CONTRACT rather than
against the previous round's example, produced none.** The two rounds of patching
cost four product defects; the one round of contract cost zero. That is the whole
argument for the escalation, and it is now a measurement rather than a
prediction.

Round 3 also re-ran the full prior mutation battery: **zero regressions, four
mutations strengthened**, and the wired-channel green control (`G`) still
measures 0 fail — the fail-closed guard has never once false-fired on a correctly
wired channel across three rounds.

## Round 3 dispositions

| # | Finding | Weight | Disposition |
|---|---|---|---|
| 1 | `rel` unasserted on the `promoted` arm's `published:false` form | LIGHT | **FIX, test-only.** The one arm-form of the owner-ruled interface nothing measured — and per Table Y row **Y12**, precisely the form the pipeline's G8 commits from. Verified alive, then killed |
| 2 | The `readVaultNow` error branch entirely unexercised | LIGHT | **FIX, test-only.** Round 2 accepted this branch as a residual BEFORE Table Z existed; row **Z5(e)** then made a positive claim over it, so it needed a case. Proved reachable with a directory where the report belongs — `refused`, the derived path, EISDIR named, record delivered, vault object untouched |
| 3 | `WP-dream-promote-in-workspace` row **G8** is a registered Table Z mirror that has not been walked — that spec has zero occurrences of `report.rel` | — | **ROUTE to wd-architect.** Mirror drift created by this round's owner-ruled interface change, and **blocking for the pipeline package**. The implementer cannot fix it: the file is outside this package's Deliverables |
| 4 | The collision reason's punctuation is destroyed by `neutralise` — `(`, `)` and `;` all become `_` | — | **NAMED RESIDUAL.** The gate confirmed the mangling class is PRE-EXISTING AND ACCEPTED (`EP2:` → `EP2_`, `not admitted:` → `not admitted_`), so this is a new INSTANCE of a shipped class rather than a new KIND, and it does not re-open the loop. **The reword was deliberately NOT taken**: the string is user-observable, so changing it is HEAVY under this record's own weighted-closure rule and would cost a full fresh round on both gates — for a message on a path reachable only when the brain writes two case-variants of the report in one run. The one-expression form is recorded for whoever next opens the file: drop `(`, `)` and `;` in favour of em-dashes |
| 5 | Round 2's finding 4 (empty base → two leading blank lines) | — | **DROP, and the gate judged NOT taking it in round 2 was RIGHT** — measured, not argued: reachable only when the user truncates run 1's report, no spec row governs the separator on an empty base, byte-preservation holds trivially over zero bytes, and every markdown renderer ignores leading blanks |

## The closing tip, stated rather than glossed

**The rubric gate cleared `3ac951b`. The two LIGHT fixes landed on top of it as
`d7603d8`, and `src/` is BYTE-IDENTICAL between the two** —
`git diff 3ac951b -- src/` is empty, verified. Under the runbook's weighted
closure a LIGHT finding's fix "lands and is verified mechanically; the loop closes
without another external round", and mechanical verification is what was done:
each survivor was confirmed alive on the cleared tip, then confirmed killed.

**This is stated rather than left implicit because this record's own criterion
says both gates must be clean on the SAME tip.** The honest position is that the
final tip carries test-only changes neither gate saw, with the code they reviewed
provably unchanged. Whether that satisfies the same-tip rule is the maintainer's
call at merge, and the evidence for it is one command.

## What is NOT closed, carried forward

- **Finding 3 above** — G8's Table Z mirror, blocking for `WP-dream-promote-in-workspace`.
- **Round 1's findings 4, 5 and 6** — the two unpinned section headings (blocking
  for the pipeline package, which makes one of them live), Table N's two missing
  channel rows, and `scripts/mirror-walk.js` not existing.
- **Row Z3's named residual** — `isUnder` does not drop `.`, so
  `reports_dir: reports/./dreams` admits nothing. Verified fail-closed by the
  round-3 gate: the record still reaches the caller. Widening row C9 is a change
  to a `Done` spec and needs its own work package.
- **Finding 4's reword**, above.
