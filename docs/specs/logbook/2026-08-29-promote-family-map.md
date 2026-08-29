---
title: The promote family — canonical table-letter map (LIVING)
date: 2026-08-29
related_wps: [WP-dream-workspace-retarget, WP-dream-vault-write-primitive, WP-dream-baseline-delta-primitive, WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->

# The promote family — canonical table-letter map

> **THIS IS A LIVING SURFACE, NOT AN EXECUTION RECORD.** Every other entry in
> this logbook is accurate to the day it was written and is never updated. **This
> one is the opposite: it is updated by any change that moves a table between
> packages, and it is wrong the moment it is stale.** It was moved here from
> `2026-08-28-promote-split.md` after a PR gate found that a dated execution
> record is a poor host for a table whose contract is "always current" — that
> file's own first two hundred lines describe the pre-T1 two-way split.

**Why one surface at all** (`docs/runbooks/spec-authoring.md`): *"A fact is
stated once, in the surface that owns it; every other surface cites the owner
instead of restating. A place that keeps going stale predicting another
surface's content stops predicting and points."* The map was restated in three
specs and **two were stale**, in specs that each REGISTERED that surface in their
own Mirrored Surface Checklists — the discipline was present and was not run.

| Package | Owns | Status |
|---|---|---|
| `WP-dream-workspace-retarget` | Tables **A, B, F** | Done |
| `WP-dream-vault-write-primitive` | Table **H** | Done |
| `WP-dream-baseline-delta-primitive` | its own Table C — a different letter-space, predating the convention | Done |
| `WP-dream-promote-module` | Tables **C, D, E, Q, S** | Ready; ships consumed by nothing |
| `WP-dream-promote-report` | Tables **N, R** and the report row | Ready; ships consumed by nothing |
| `WP-dream-promote-in-workspace` | Tables **G, V** | Ready; wires the run |

**Dispatch order is `depends_on`:** workspace → primitive → module → report →
pipeline.

## Who cites this, and what is NOT covered

**Cited by the three live specs** — `WP-dream-promote-module`,
`WP-dream-promote-report`, `WP-dream-promote-in-workspace`. **The three `Done`
packages cite nothing: they predate this surface and are closed records.** An
earlier form of this section claimed "all five specs" and "none restates it";
both were false, and both are the kind of ungated universal the authoring rules
forbid.

**What this map does NOT eliminate, stated because the claim was over-sold
once:** each spec's **Out of scope** bullets still describe what the OTHER
packages own, in prose, by hand. Those are mirrors and they can drift — one
already did, saying "Table G" where this map says "G and V". **A cut updates this
table AND sweeps the Out-of-scope bullets;** the map removes the letter-division
restatements, not every ownership sentence in the family.
