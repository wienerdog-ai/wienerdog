---
title: Owner ruling on the promote split — sizing accepted with a Table R tripwire
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

# Owner ruling on the promote split — sizing accepted with a Table R tripwire

The split was executed on the ruled seam (`2026-08-28-promote-split.md`) and its
one open item was escalated: the module half measures at the TOP of M — 24
acceptance criteria against 14 and 16 for its two shipped siblings, with six of
the 24 belonging to Table R.

## The ruling (2026-08-28)

1. **The sizing is ACCEPTED. The two-way split stands as executed.** No third
   package is cut now.
2. **A Table R tripwire is pinned instead**, below, before any review round runs
   — the same discipline this repo applies to a stop criterion: the condition is
   fixed while nobody knows which way it will go.
3. **Round zero runs now**, both disciplines.
4. **Then ONE external round, in the usual order.**

## The Table R tripwire — PINNED 2026-08-28, before round zero

**What it is for.** The measured pressure point of the module half is the
report: Table R, Table D's report row, and six of the twenty-four criteria. If
that pressure grows, the seam is already identified and must not be re-debated
from scratch under gate pressure — which is exactly what cost this family a
whole wave the first time. The tripwire fixes the condition and the resulting
shape in advance.

**Baseline, pinned at `dcc98d8`** (counted as the split record counts: `- [ ]`
items under `## Acceptance criteria`; Deliverables `create`/`modify` rows):

| Measure | Pinned value |
|---|---|
| `WP-dream-promote-module` acceptance criteria | **24** |
| of those, the report's (Table R + the report body) | **6** |
| `WP-dream-promote-module` deliverables | **3** |

**The tripwire FIRES when ANY of these is true:**

| # | Condition | Measured where |
|---|---|---|
| T1 | the module half's acceptance-criteria count exceeds **28** at the close of any review round | the spec, counted as above |
| T2 | the report's own criteria exceed **8** | the spec, counted as above |
| T3 | at implementation time `src/core/dream/promote.js` exceeds **600 lines** of non-test content | measured by the implementer, reported in the PR body |

**Why those numbers, rather than round ones.** T1's +4 is the growth budget the
runbook's frozen-surface rule already implies: verification machinery may grow
only to guard a product behaviour, and each fix injects 0.5–0.9 new defects, so
a surface that has grown by more than a sixth is no longer the surface that was
sized. T2's +2 is the same budget applied to the sub-table that carries the
pressure. T3's 600 is `vault-write.js`'s shipped 481 plus the same one-sixth
headroom, rounded to the README's own order of magnitude — the README's "~400
lines of new non-test content" is the M heuristic, and the primitive already
shipped over it with the owner's knowledge, so 600 is the honest ceiling for
this family rather than a fresh standard.

**What happens when it fires — no fresh seam debate.** Table R, Table D's report
row, and the report's acceptance criteria move OUT of `WP-dream-promote-module`
into a third, stacked package: **`WP-dream-promote-report`**, which depends on
the module half and is depended on by the pipeline half. The module half then
ships the decision, the four gates and the publish for ordinary notes; the
report package adds the report body's promotion, the code-authored second write,
and Table R's fallback. **That ordering is coherent because ordinary notes need
nothing from Table R**, and the module half already ships consumed by nothing —
so an intermediate state with no report handling regresses no running product.

**What does NOT fire the tripwire:** a finding count, a review round count, or
prose growth in a cell. The tripwire is about the size of the contract, not the
size of the argument about it.

**Who fires it:** whoever measures the condition — the round's author for T1/T2,
the implementer for T3 — states the measurement and cuts the package. It is not
a fresh escalation; the escalation already happened and this is its answer.
