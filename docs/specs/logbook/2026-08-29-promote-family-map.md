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

## The letter-space COLLISION this family must cite around

**Table letters are family-wide, and this family is not the only one that has
them.** `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — shipped, `Done`,
and the canonical owner of the EP2 secret gate's durable quarantine lifecycle —
carries **NINE tables of its own**, lettered **B, H, J, K, N, P, Q, R and T**
in its own letter-space (measured: `grep -E '^### Table [A-Z]'` over that spec).
**FIVE of those nine collide with a letter this family uses, and the table
immediately below is the one place that COLLISION SET is listed — nine is the
count of that spec's tables, five is the count of the collisions, and nothing
else on this page states either number** (clarified 2026-08-29, after a
coherence pass found a reader could take "the colliding letters" off the
nine-item list two lines above). No spec in this family restates the
list — a member list in a citing surface is the defect this family already
measured twice, and on 2026-08-29 the round-zero pass found four surfaces giving
three different answers, the canonical one among the wrong ones. Every collision:

| Letter | In THIS family | In `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` |
|---|---|---|
| **B** | the brain re-target, site by site (`WP-dream-workspace-retarget`) | the EP2 disposition contract |
| **H** | the vault-write primitive's filesystem discipline (`WP-dream-vault-write-primitive`) | what a DEFINITION is versus a REGISTRATION |
| **N** | the neutralisation contract (`WP-dream-promote-report`) | the retention contract for `state/quarantine/redacted/` |
| **Q** | the EP2 gate's result and what promotion does with it (`WP-dream-promote-module`) | the shipped user-facing claims about what EP2 does with a finding |
| **R** | the report's publish decision (`WP-dream-promote-report`) | the redact arm's outcome matrix |

**THE RULE THAT FOLLOWS: every citation of that package from this family names
the SPEC PATH, never a bare table letter.** A bare "Table N" inside a promote
spec means the neutralisation contract, and a reader who follows it to the
retention contract has been sent to the wrong document by a correct-looking
reference. The rule became load-bearing on 2026-08-29, when the Table Q
reconciliation pass turned three of the module half's rows into pointers at that
package (logbook: `2026-08-29-promote-table-q-reconciliation.md`).

**AND THE RULE REACHES ROW IDS, NOT ONLY TABLE LETTERS — added 2026-08-29,
because the round that wrote the rule above did not apply it where it was most
needed.** Both Table H letter-spaces number their rows H1 upward, and **`H7` and
`H9` exist in both and mean different things**: in the primitive they are the
surviving staging object and the directory unwind; in the EP2 package they are
"registration is a presence test" and "the step prints what it checked". **So a
citation of a Table H row inside this family names its owner — "the primitive's
H7", "Table H (the vault-write primitive), row H9" — never a bare `H7`.** The
hazard is the same for any other row id in a colliding letter, and the rule is
stated over the class rather than over the two ids that provoked it.

**The collision is recorded, not resolved.** Renaming letters in a `Done` spec
would rewrite a closed record, and renaming them here would invalidate every
cross-package citation already written. Naming the hazard and mandating
path-qualified citations is the cheaper half, and it is the same shape as the
`WP-dream-baseline-delta-primitive` Table C note in the table above.

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

**A contract can also leave the family entirely, and that is swept the same
way.** On 2026-08-29 the Table Q reconciliation pass found that the EP2 gate's
DURABLE quarantine lifecycle — the retention prune, the identity-gated deletion
of a redundant copy and the preservation-failure abort — was restated in
`WP-dream-promote-module`'s Table Q rows Q5 and Q6 while its canonical owner is
the shipped `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`, whose own
Table N forbids restating it by name — **and that path, rather than the bare WP
id, is how the rule above is obeyed by the surface that states it.** **No letter moved between the three live packages, so the
ownership table above is unchanged** — what changed is that all three specs'
Out-of-scope sections now name that lifecycle as outside the family. The lesson
is the general one: a stale ownership sentence is not always about a table this
map lists.
