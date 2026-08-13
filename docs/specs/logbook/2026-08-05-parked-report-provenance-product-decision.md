---
date: 2026-08-05
title: "Parked product decision: exclusion vs label-warn-inherit for model-written reports on the snapshot path"
related_wps: []
---

# Parked product decision: exclusion vs label-warn-inherit for model-written reports on the snapshot path (2026-08-05)

**Status: RULED by the owner on 2026-08-14.** See the Resolution at the end of
this entry. Everything between here and that section is the record as it stood
while the question was parked, kept unchanged so the reasoning that led to the
ruling stays readable.

**Status while parked: PARKED by the owner.** This is a recorded, undecided
product question. It is deliberately **not** part of the work package that gates
the snapshot path — it was kept out to keep that package bounded, and because it
is a product decision the owner does not yet feel able to oversee. Nothing here
is binding until the owner reopens and rules it.

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

## Resolution (2026-08-14)

**Exclusion is REJECTED. The label + inherit direction is ADOPTED in its
always-on form, and no stamp is built.**

What reopened it, ahead of schedule: this entry expected the measurement to
arrive after the gating work package shipped. It arrived during that package's
design review instead, which was cheaper and decisive. Over 9,927 parseable
extracts on the maintainer's machine, the proposed stamp fired on **98.57% of
plausible runs** — and `daily-digest`'s only snapshot input is the newest dream
report, so exclusion would have starved that routine on essentially every run.
The full measurement is in
`docs/specs/logbook/2026-08-13-vault-snapshot-gating-design-blockers.md`.

The ruling, and the reasoning the owner recorded with it:

1. **Every file the snapshot mounts is untrusted-by-default.** The code-owned
   framing at mount stays, labelled honestly as defense in depth rather than as
   the load-bearing fix.
2. **Routine vault write-backs carry `derived_from_untrusted: true`
   unconditionally.** This is the load-bearing mechanism the soft option needed:
   it closes the persistent-injection loop — routine output read later by model
   sessions with no human in between — through the existing, code-enforced
   digest gate, and it depends on no per-run classification.
3. **No stamp is built.** In order of weight: the measured base rate means a
   signal firing on 98.57% of runs carries no information, so there is nothing
   left to differentiate. A repaired stamp — code-owned storage outside the
   model-writable report — was considered and rejected on price: it would buy a
   1.4% "trusted" class at the cost of new state with lifecycle and uninstall
   obligations, a cross-boundary truncation signal, and a new false-negative
   escape class, since a trusted class exists only to be wrongly entered. The
   storage defect found in review was real but fixable, and is explicitly NOT
   the ground for this ruling.
4. **No per-run warning line in routine output.** A warning that fires every day
   is noise and trains the reader to skip it. The residual is stated once, in
   documentation: routine inputs may contain externally-derived text; framing
   steers a model, it does not compel it; the hard containment is the capability
   broker and the write-back marking; and where a human is the end reader, their
   reading is the filter.
5. **Entry-level provenance stays deferred**, taken up in this same sitting per
   the recorded binding. The safe coarse default now extends from daily notes to
   reports. If a trusted class is ever wanted, line-level provenance at write
   time is its foundation — not an after-the-fact stamp.

**Value line.** The product stays alive — the daily routine gets input every
day — the defense weight moves to the two places code can enforce it (the
capability box and the unconditional write-back marking), and the system gets
simpler rather than more complex: one rule, "model-written vault content is data
everywhere", instead of a classifier plus its state.

**Implementation status of point 2, measured 2026-08-14.** There is no routine
vault write-back path in the tree today: routine output is written to
`state/routine-run/<id>/`, which the next run of that routine wipes, and no code
copies it into the vault. Point 2 therefore has nothing to attach to yet and
`WP-gate-vault-snapshot` implements no part of it; the rule stands as a binding
constraint on whoever builds that path. Recorded as that WP's Residual 6.
