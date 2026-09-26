---
date: 2026-09-26
title: "Paired pilot of candidate (i) for WP-dream-first-pass-novelty — and the artefact it exposed in the finding behind it"
related_wps: [WP-dream-first-pass-novelty, WP-dream-primary-dialogue-filter]
---

# The paired pilot (2026-09-26, late night)

Run under the owner's ruling accepting the advisor's three recommendations
(`2026-09-26-owner-rulings-advisor-three.md`) and the standing privacy
condition: everything with substance stayed in the disposable root `~/wd-eval/`
on the owner's machine; this record holds identities, counts and verdicts only.

## Setup

Two arms, identical inputs, identical starting vault, one difference: **arm A**
ran the shipped `skills/wienerdog-dream/SKILL.md` (digest identical to the
installed one); **arm B** ran a variant with two prose additions and nothing
else — in Phase 2, the novelty bullet gains *"Verify before you score it low: a
candidate is 'already captured' only when you have Read a vault note that
states that specific fact, decision, correction or open commitment. A daily-log
line, an earlier dream report, or a note saying that a session was consolidated
is not evidence that the specific candidate is recorded. If you cannot find the
note that holds it, its novelty is high."*; in Phase 1, one sentence keeping
rulings with reasons, corrections, constraints and unresolved commitments as
candidates in their own right (11 changed lines). Each arm was the dream brain
invoked as the dream invokes it (the same `claude -p` argv: tools
`Read,Write,Edit,Glob,Grep`, the hook-free settings, `--setting-sources ''`,
`--strict-mcp-config`, the dream prompt with the vault layout, the skill as the
appended system prompt; brain model `claude-opus-5-5`), writing into a git clone
of the vault that served as the workspace; no promotion gates ran, so the diffs
are the brain's raw output — the same for both arms. The scratch inputs were
byte-identical before and after each arm (sha256 checked). Judge: a separate
`claude-opus-5-5` at high effort, read-only, given both extracts, the pre-run
notes, both diffs and a `cost.json`; asked for losses per arm with an item-level
recovery table, unsupported claims, duplicates and dilution, cost, verdict.

## Pair 1 — a genuine first pass

Inputs: `claude:244e27e3-…` and `claude:42e1c6b4-…` (the two sessions the
offline evaluation found new to its baseline). Starting vault: the live vault at
`f590a3f`, the commit before the live dream that first consolidated them.

| measure | arm A | arm B | B ÷ A |
|---|---:|---:|---:|
| turns | 18 | 20 | 1.11 |
| tool calls (Read/Grep/Glob/Write/Edit) | 17 (7/2/3/2/3) | 19 (7/2/6/3/1) | 1.12 |
| output tokens | 10,870 | 11,036 | 1.02 |
| wall clock | 104 s | 105 s | 1.01 |
| characters added to notes (excl. report) | 7,708 | 9,558 | 1.24 |
| losses (judge) | 10 (0 high, 1 medium, 9 low) | 6 (0 high, 1 medium, 5 low) | — |
| unsupported claims | 1 low | 3 low | — |
| duplicates + dilution | 2 + 2 | 5 + 2 | — |

Judge, in substance: B captured all 5 of A's recoverable losses (1 medium,
4 low) and **introduced 1 new medium loss**; no medium or high unsupported
claim in either arm; duplicates worse in B (a new rulings note restated tap and
worktop requirements the vault already held); the extra work went into Globs
and a Write, not into verification reads (Read and Grep counts identical);
*"the variant's rule barely came into play"* because both arms correctly saw
the material as new. Judge cost: 20 turns, 208 s, 22,077 output tokens.

## Pair 2 — the re-shown case

Inputs: `claude:08f9001f-…` and `claude:95d5fe87-…` (the two sessions whose
first pass the baseline already held). Starting vault: `b817b12`, the live
dream commit that made that first pass — the offline evaluation's setup.

| measure | arm A | arm B | B ÷ A |
|---|---:|---:|---:|
| turns | 17 | 21 | 1.24 |
| tool calls (Read/Grep/Glob/Write/Edit) | 16 (6/3/6/1/0) | 20 (9/2/4/3/2) | 1.25 |
| output tokens | 4,513 | 12,175 | 2.70 |
| wall clock | 44 s | 117 s | 2.66 |
| characters added to notes (excl. report) | **0** | 9,253 | — |
| losses (judge, against the git baseline) | 22 (3 high, 9 medium, 10 low) | 4 low | — |
| unsupported claims | none (wrote nothing) | 3 low | — |
| duplicates + dilution | 0 | 7 + 2 | — |

Arm A wrote only its report — the shipped skill trusted the 09-24 report's
statement that the sessions had written their own notes. Arm B read the project
note, found nothing from those sessions in it, and wrote 18 of the 22 items
(3/3 high, 9/9 medium, 6/10 low), with no new loss and no medium/high
unsupported claim, at 2.7× the tokens and time. Judge cost: 15 turns, 130 s,
13,959 output tokens. **The judge's stated doubt:** *"the sessions themselves
say they wrote to the vault, so the material may exist in another vault copy,
which would make these losses an artefact of vault drift."*

## The doubt, checked — the finding was largely an artefact

Three facts, measured on the owner's machine, no content read:

1. **The dream reads the vault's working tree, not a commit.**
   `src/core/dream/workspace.js` builds the workspace by copying files
   (`fs.copyFileSync`, `:293-295`); nothing checks out `HEAD`.
2. **Sessions write notes into the vault directly, and those notes were
   uncommitted at the baseline.** The live commit `f590a3f` (the 09-25 dream)
   added 258 lines to `01-Projects/templom-koz-20/current-state.md` that carry
   **no dream marker at all** (0 lines matching `READ FIRST`, `origin: dream`,
   "written by the dream") and 8 lines dated 09-23 — the 09-23 session's own
   entries, swept into the dream's commit. At `b817b12` the same file held
   nothing from 09-23 (the pair-2 judge measured "last updated 08-28").
3. **Every item pair 2 "recovered" is in the live working-tree notes today.**
   Keyword counts, git baseline `b817b12` → live working tree:
   `BE.1` 0→2, `V03` 0→36, `porszórt|lakkozott` 0→2, `lamell` 0→4, `Gábor` 0→2,
   `617` 0→1, `196` 0→8, `csempe|parketta` 0→2 in the project note; in
   `01-Projects/ubs-ea/current-state.md`: `Sander` 0→5, `34 ` 0→8, `57` 0→7,
   `expir` 0→1, `USDJPY` 0→5.

So when the live 09-24 dream scored those sessions' material as already
recorded, the material **was** in the vault it read — written there by the
sessions themselves. The offline evaluation compared against a git commit that
excluded those uncommitted notes, and so did pair 2. The 12 "live first-pass
omissions" of the evaluation record (Findings A) and the 22 "losses" of pair 2
are, in the main, that artefact. What survives as a genuine finding is the
first-pass case: the evaluation's 4 losses on rows 2 and 3 (3 medium, 1 low),
and pair 1's 10 (1 medium, 9 low), where the variant recovered 5 and lost 1.

## Against the accepted decisions

- **Retention:** on the genuine first-pass case, the variant recovers little
  (1 medium net zero, 4 low), adds duplicates, and costs 1.1× — the "unchecked
  assumption" it targets is rarely wrong in production, because the notes it
  would verify against are the ones the sessions wrote.
- **Omission records:** unchanged — keep the report.
- **Success criterion:** pair 1 meets "no added medium/high unsupported
  claims" and fails "useful omissions recovered" on net (one medium recovered,
  one medium newly lost). Pair 2 meets both but on an artificial state. Cost:
  1.1× on the real case, 2.7× on the artificial one; both within the assumed
  ceiling for the real case only.

**Recommendation (orchestrator; the owner rules):** do not run the design
round for `WP-dream-first-pass-novelty` on this evidence. Keep the stub
`Draft`, annotated with this result, or supersede it — the owner's call. The
work that is actually indicated is smaller and different: **the evaluation
method** must snapshot the vault's working tree, never a commit, as its
baseline — recorded as an erratum on the evaluation record and as a lesson.

## Observations worth keeping

- The variant's extra reads were not verification reads in pair 1 (Read and
  Grep identical); in pair 2 they were (9 vs 6 Reads, 2 Edits). A prose rule
  changes behaviour only where the assumption it targets is present.
- Duplicates are the variant's real cost: it writes a standalone rulings note
  that restates context the vault already holds, three times in one run in pair
  1 (new note, project-note addendum, daily log).
- Six brains and two judges ran tonight in the disposable root; all their
  harness transcripts were moved to `~/wd-eval/harness-transcripts/` so the
  live dream never sees them.
