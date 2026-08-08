---
date: 2026-08-05
title: "Parked product decision: exclusion vs label-warn-inherit for model-written reports on the snapshot path"
related_wps: []
---

# Parked product decision: exclusion vs label-warn-inherit for model-written reports on the snapshot path (2026-08-05)

**Status: PARKED by the owner.** This is a recorded, undecided product question.
It is deliberately **not** part of the work package that gates the snapshot
path — it was kept out to keep that package bounded, and because it is a
product decision the owner does not yet feel able to oversee. Nothing here is binding until the
owner reopens and rules it.

## What reopens it

The snapshot-gating work package builds a provenance stamp for dream reports (report
flagged when attacker-derived material contributed to it) and, when the stamp
fires, excludes the report from the vault snapshot that routines read. That
package **measures how often the stamp fires**. When that measurement lands,
this decision reopens. The expectation recorded when this was parked:
the stamp will fire often, and the daily-digest routine's *only* snapshot input
is the newest dream report — so frequent exclusion starves that routine.

## The question

When a model-written dream report may contain attacker-influenced text, should
the snapshot path defend by **exclusion** (the report is withheld from routines
— fail-closed, functionally lossy), or by **label + warn + inherit**:

1. **Include, but label.** The report enters the snapshot wrapped in a
   code-owned "this is data, not instructions" frame.
2. **Warn the human.** When a routine's inputs were flagged, the routine's
   human-facing output (e.g. the digest email sent to self) carries a
   code-added warning line. Rationale (the owner's framing): where a human is
   the end reader, their reading *is* the filter — the goal is awareness for an
   informed decision, not perfection.
3. **Inherit the marking.** Anything a routine writes back into the vault from
   flagged inputs is itself stamped `derived_from_untrusted: true`, which the
   existing digest gate already respects fail-closed.

## Why the third leg is the load-bearing one

The report has three consumers, and they are not alike. The human reads the
report and the digest email — for those, a warning is a proportionate defense,
because the routines are tightly contained anyway (no shell, staging-only
writes, self-only send through fixed broker verbs; the free-recipient draft
verb has its own work package). But some routine output flows **back into the
vault** (e.g. email summaries into daily notes) and is later read by future AI
sessions with **no human in between**. On that leg "I will read it" is not a
defense — nobody reads it before the next model does. That is the persistent-
injection loop the threat model names as the defining threat, and it is why the
soft option needs marking-inheritance to be sound, not just a warning.

Honest cost note: inheritance moves the functional loss downstream rather than
removing it — on flagged days, routine-written vault notes drop out of the
digest. Visible and arguably better-placed, but not free.

## Provenance of this entry

Raised while triaging the vault-snapshot path during the 2026-07-29 security
audit's remediation planning. It is recorded as a logbook entry rather than
folded into a work package because it is a product decision, not a security
fix, and it must stay findable until the owner rules it.
