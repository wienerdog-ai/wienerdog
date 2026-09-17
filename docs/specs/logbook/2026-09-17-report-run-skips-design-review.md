---
title: WP-dream-report-run-skips design review round 1 — dispositions
date: 2026-09-17
related_wps: [WP-dream-report-run-skips, WP-dream-filtered-input-budget, WP-quarantine-warnings-file, WP-dream-promote-module]
---

# WP-dream-report-run-skips design review round 1 — dispositions

Independent design gate against tip `5dc06883`, verdict **needs-attention**, six
findings. The raw result is preserved unaltered beside this file as
`2026-09-17-report-run-skips-design-r1-raw.json`, with its focus and meta notes;
it was committed before adjudication. **Nothing here records the owner accepting
anything** — the two questions this round raised for the owner are parked as
owner items 4 and 5 in the spec, undecided.

All six are fixed or dispositioned in one revision; none is dropped. Four changed
a contract row, so the surface goes back for a full fresh external round rather
than a delta read.

| # | Finding | Band | Weight | Disposition |
|---|---------|------|--------|-------------|
| F1 | Quarantine counts disappear whenever no session is admitted | high | heavy | **FIX THE CLAIM, not the product** |
| F2 | The oversized-session promise omits real retry conditions | high | heavy | **FIX** — the byte-exact bullet is rewritten |
| F3 | Acceptance criterion 5 requires an impossible collector state | high | light | **FIX** — split into two runs |
| F4 | The warnings pointer can target a missing or stale file | medium | heavy | **NAMED RESIDUAL + owner item** — the cheap fix is not available |
| F5 | The code-owned heading is not reserved from brain-authored content | medium | heavy | **MIRROR THE EXISTING RULE** — which is: no rule. Pinned by fixtures, routed |
| F6 | The inline integers-only gate accepts plausible coercion bugs | medium | light | **FIX** — full-string expectation, unsafe integer, third RED proof |

## F1 — the claim was false; the product stays the size it was

The reviewer is right and its recommendation is out of scope. The spec's coverage
boundary said the throw path "carries every exclusion count" and let
`reports/warnings.md` and `doctor` stand in for the rest. Both halves are wrong:
`exclusions` is built from the four collector counts alone
(`src/cli/dream.js:683-700`), so **every quarantine-only run takes the idle return
at `:746-757`** — no report, `stillQuarantined` emitted nowhere, `newlyQuarantined`
surviving only as a count of console lines — and the standing surfaces carry the
ledger's set *as it stands*, which is not this run's per-run counts.

The subject of this package is the dream **report**. Carrying counts through a path
that writes no report means either writing a vault file on a run that makes no
commit (ADR-0012's one-run-one-commit) or editing the failure message ADR-0012's
2026-09-15 amendment fixed. Either is a separate package with its own ADR question.
So: the row now states, path by path, what is carried and what is not; a residual
names it; acceptance criterion 12 pins it; it is routed under Discovered issues;
and owner item 4 asks whether zero-admission runs should get durable accounting,
recommending yes-but-not-here.

## F2 — the user-facing sentence has to be true

Row B3 already said the memo is invalidated by a fingerprint **or package-version**
change and that the skip holds only while the measurement exceeds the **current**
limit. The rendered bullet said "every night until the session file changes or you
raise dream_max_input_bytes" — which omits the version release, implies any rise in
the limit helps, and promises nothing about re-measurement. Final text:

> `- N session transcript(s) are too big to dream over on their own. Wienerdog will
> keep passing over them until the session changes, until Wienerdog is updated, or
> until dream_max_input_bytes in config.yaml is raised past their size; after any of
> those it measures them again, and may still find them too big.`

Both worked examples, the inline gate's `B3` literal, row B3, the Context
paragraph, the claim register, acceptance criterion 3, owner item 1 and RED proof
2's `find` moved in the same commit. The wording keeps the two properties the gate
depends on: no apostrophe, and the word *skipped* still appears only in the two
quarantine bullets and the pointer.

## F3 — an unsatisfiable criterion

Confirmed by reading: the capacity stop (`scratch.js:91-94`, `:124-127`) and the
deadline stop (`:95-98`) each `break` the one admission loop, so whichever fires
first excludes the other and no run exhibits five arms. Criterion 5 now asserts the
partition over **two** runs — one ending in a capacity stop, one in a deadline stop
— each exercising the three *continuing* arms (quarantine, oversized, read-deferred)
before its stop.

## F4 — measured, and the cheap fix is not available

`refreshWarnings` never throws; a refused or unreadable `reports/warnings.md` comes
back as `{written:false, reason}` and the run continues
(`src/core/dream/warnings.js:230-311`). So the pointer can name an absent or stale
file while its counts are exact. The proposed fix — one boolean on `runSkips` —
needs the refresh result **before** `promote()`, and the ordering gives it only
half the time: refresh point 1 (`src/cli/dream.js:729`) runs pre-promotion but
**only when the run minted a new quarantine**; point 3 (`:755`) is on the idle path
that returns; point 2 (`:1187`) runs after the commit. A
`stillQuarantined`-only run — the 191-session case this package exists for — has no
refresh result at composition time, so the flag would be false there and would
delete the pointer from the main use case. Honest alternatives (a fourth refresh
call site; moving point 2 ahead of the commit) restructure another package's
surface and ADR-0012's ordering. Recorded as a named residual with its bound (the
ledger stays ground truth; the next successful refresh repairs the file) and owner
item 5.

## F5 — the existing rule is that there is no rule

Measured at `545df8bd`: `ENFORCEMENT_HEADING`, `REDACTION_HEADING` and
`PRESERVED_HEADING` (`src/core/dream/promote.js:584-591`) appear **only** where they
are emitted (`:708`, `:737`, `:751`). Nothing scans the candidate body, strips a
prior code-owned block or dedupes. Two consequences already ship: a brain that
writes `## Refused by policy (promotion enforcement)` into its body gets a second
one appended beneath it, and a second run on the same date appends a second copy of
the whole accounting block. Giving the new heading an ownership rule would leave
three shipped headings without one and put two document models in one composer. So
this package applies the identical (absent) rule, **pins** the behaviour with
criterion 11's two fixtures — a same-day second run, and a candidate body
containing the exact heading — and routes the shared gap under Discovered issues
for whichever package owns `composeRecord`'s document model. A later fix now has to
move a fixture, which is the point of pinning it.

## F6 — the gate was enumerating the bad

The old hostile assertion scanned the render for `passwd|1\.5|-1|NaN`. Measured:
a guard rewritten as `Number.isFinite(Number(v)) … Math.floor(Number(v))` renders
`oversized: 1.5` as a plausible `1` and `Number.MAX_SAFE_INTEGER + 1` in full, and
the old gate stayed **green** through both. The gate now compares the hostile render
and a new unsafe-integer render to hand-written expected strings, and Table C gains
a third RED proof whose mutation is exactly that guard rewrite, declared against
T3. This is the repo's own rule arriving one level down: **enumerate your own good,
never the forbidden set.** Table A also pins the guard as byte-identical to
`secretRevertSummaryLine`'s (`ledger.js:500`), which is both a no-drift contract and
the literal that proof 3 mutates.

## Evidence for this revision

Run in a uniquely named scratch subdirectory against a stub exporting the
formatter, both directions: compliant → exit 0; module absent → exit 1; and four
violating states — coerce-and-floor guard, pointer tied to the heading, oversized
bullet reworded, pointer sentence reworded — each → exit 1; compliant again → exit
0. Separately, the spec's two worked-example fences were re-derived from the stub
and compared byte for byte, and each proof's `find` was checked against both
renders: proof 1 reaches the six-count render only, proof 2 both, proof 3 neither
(it is a code mutation, so reaching a render would mean it could redden T1/T2 for
the wrong reason).
