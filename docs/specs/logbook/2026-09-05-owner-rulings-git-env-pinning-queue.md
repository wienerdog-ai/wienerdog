---
date: 2026-09-05
title: "Rulings: the git-env-pinning queue and the night session's merge authorization"
related_wps: [WP-dream-git-env-pinning]
---

# Rulings: the git-env-pinning queue (2026-09-05, night session)

**One instruction from the owner governs this session.** It is quoted verbatim
so this record stands on its own.

At the session's resume, after a context clear and the orchestrator's report
that the queue head is `WP-dream-git-env-pinning` and that merge authorization
had not been restated:

```text
Great. Please proceed with the queue. Note that I will go to sleep soon, and you
will be on autopilot. Accordingly, try and get as much done as possible. You
have merge authorization for this session. And remember to follow the playbook
of the project, including the double gate reviews and using subagents.
```

**What it carries.** "Proceed with the queue" continues `docs/HANDOVER.md`'s
status pass #6 order (`WP-dream-git-env-pinning` first) under the process the
2026-09-05 rulings records settled: *the maturing architect records a
recommendation with the cost of overruling it, and the session may dispatch
under that recommendation, the owner reversing any of them by dated amendment.*
`WP-dream-git-env-pinning` is the first queue item whose stub names an **owner
product decision** as its item 1 — pin, don't pin, or pin-with-exceptions. The
owner was told, in the report this instruction answers, that this item is an
owner product decision dispatchable under a recommendation, and answered
"proceed"; so the decision is taken under the standing process, **recorded as a
recommendation adopted under standing authorization and not as a direct
ruling**, with its overrule cost stated where the decision is recorded (ADR
paragraph and spec). A direct ruling, if the owner gives one on waking, will be
recorded apart from this, as `2026-09-05-owner-rulings-audit-d-derived-headers.md`
was.

**Merges are authorized for this session only**; the next session needs it
restated, as every status pass since 2026-09-02 has recorded.

## Items dispatched under the standing process

Appended as the design loop parks them (escalation (ii) items, if any), each
with the recommendation adopted and the overrule cost as the spec states it.

### Appended 2026-09-05 after the maturing pass (spec revision `88172a13`)

Two items, both **recommendations adopted under the standing process above**, not
direct rulings. **Their text and their enumerated overrule costs live in ONE
place** — the spec's `## Dispatch precondition — owner items` — and are cited
here rather than restated, because the last queue's record had to amend itself
when the costs it quoted turned out understated. The owner reads them there
before reversing either.

1. **O1 — the product decision: PIN, by construction, at the pipeline seam.**
   The run's own git calls get an environment built from the named allowlist in
   the spec's **Table U**; every inherited `GIT_*` is thereby absent, and the
   run's own `GIT_INDEX_FILE` is added for the private-index shapes exactly as
   today. The principle drawn, and the reason it is not the hook suppression
   `WP-dream-promote-in-workspace` Table W row W1 rejects: git's **config files
   and hooks are the user's standing instructions and stay honoured** (`HOME` and
   `XDG_CONFIG_HOME` are carried), while the **launching process's environment**
   redirects our own act's target and is not a configuration surface. Measured
   support for the asymmetry: an environment-injected `core.hooksPath` fires a
   hook the user never configured, and an environment-injected `core.fsmonitor`
   **executes an arbitrary script** inside the run's own `write-tree`. Reversing
   this is the spec's overrule cost (a) or (b).
2. **O2 — the second git spawn point stays with a successor.**
   `assertGitRepo`'s call through `validate.js`'s own `git()` is a **named
   residual** of that WP, owned by the new Draft stub
   `WP-dream-git-env-validate-seam`, rather than folded in — which is what keeps
   the package at S and inside the `≤ 8 files` sizing bound. Measured: with
   `GIT_DIR` exported elsewhere that invocation exits 0 for a directory that is
   not a repository. Reversing this is the spec's overrule cost (c).

**No item was parked by the design loop under escalation (ii): round zero
produced no finding that argues against the recommendation.** The six round-zero
findings are all machinery or citations and are recorded, with what changed, in
`2026-09-05-git-env-pinning-design-gate-rounds.md`.

### Appended 2026-09-06 after design-gate round 1 — one PARKED item (escalation (ii))

Round 1's hermetic shadow (finding F2, band A) argued that carrying `HOME` and
`XDG_CONFIG_HOME` verbatim from the launching shell preserves an arbitrary-code
channel, since a selected config may carry `core.fsmonitor`. Two of its facts
were right and were fixed rather than argued with: `HOME` is now carried **as
`paths.home`**, the run's bound home, and `XDG_CONFIG_HOME` is **not carried**.
The second half is a product call, so it is parked here.

**O3 — `XDG_CONFIG_HOME` is NOT carried by the run's constructed git
environment** (the third item of this queue, numbered to continue the two
above). Recommendation adopted under the standing process above.
*Why:* `run-job`'s `ENV_PASSTHROUGH` does not carry it either, so dropping it
is exactly what makes *"a manual dream behaves like the scheduled one"* a
true sentence rather than an aspiration — and carrying it in the manual path
alone would recreate the divergence this WP exists to remove. *The cost, and
it is real:* a user whose global git config is relocated **only** by
`XDG_CONFIG_HOME` does not have it applied to the run's own git calls, in
either mode. That is already the scheduled run's behaviour today. A
`HOME`-resolved `~/.gitconfig` still applies, and this is measured in both
directions (carried → a `core.fsmonitor` in that config runs during the
pinned `update-index` and `write-tree`; not carried → it runs during none of
the nine). *Overrule cost:* the reversal is **"carry it in BOTH surfaces"**,
never in this one alone — `src/cli/run-job.js` joins the Deliverables with a
new `ENV_PASSTHROUGH` entry, Table U row U3 flips to CARRIED, AC1's key→value
map and its unset fixture change, and the ADR amendment and the design-gate
record follow. The spec's `## Dispatch precondition — owner items` carries
this text; it is cited here, not restated, for the reason the previous
append gives.

### Amendment, 2026-09-06 (after design-gate round 2) — the O1 entry above is superseded on one clause

Round 2's hermetic shadow (finding F2, band B) found that the **O1 entry above
still says `HOME` and `XDG_CONFIG_HOME` are carried**, which contradicts O3 and
Table U row U3 as adopted after round 1. This record is append-only, so the
sentence stands where it is and is corrected here.

**The adopted state, and the primary spec's `## Dispatch precondition — owner
items` governs it:** `HOME` is **carried, taken through `getPaths().home`** —
the one function that decides that value, and the same value `buildCleanEnv`
gives the scheduled child. (An earlier form of this sentence said the vault,
state directory and config roots all derive from it; that is true only where
their own overrides are absent, and the correction is in the spec's rationale
section, which governs.) `XDG_CONFIG_HOME` is **NOT carried** (owner item O3,
appended above).

**Two claims in the O1 entry's own reasoning are also withdrawn**, with the
measurements that falsified them recorded in the spec's *"Why Table U is what it
is"* section: that `HOME` is *never* the launching shell's string (with `HOME`
set, it is), and that an environment lying about `HOME` *relocates the whole
product* (measured: with the four `WIENERDOG_*`/`*_DIR` overrides set, changing
`HOME` leaves every root but `home` itself identical). **The recommendation O1
records is unchanged and the adoption stands on it, not on those two
sentences** — `HOME` is carried because it is where the user's own git
configuration lives and O1 declines to override the user's configuration. That
is a trust decision, stated as one.

### Appended 2026-09-06 after maturing `WP-dream-git-env-validate-seam` — two items, O4 and O5

`docs/specs/WP-dream-git-env-validate-seam.md` — the successor stub that
`WP-dream-git-env-pinning` routed its owner item O2 to — was matured under the
standing process above. Numbering continues this queue's: **O4** and **O5**. Both are
**recommendations adopted under the standing process, not direct rulings**, and
**their text and their enumerated overrule costs live in ONE place** — that
spec's `## Dispatch precondition — owner items` — and are cited here rather than
restated, for the reason the 2026-09-05 append gives. The measurements behind
them are in
`docs/specs/logbook/2026-09-06-git-env-validate-seam-design-gate-rounds.md`
under the probe ids named.

1. **O4 — extend the constructed environment to the second git spawn point.**
   `src/core/dream/validate.js`'s module-private `git()` builds its child
   environment with the same `buildGitEnv` the pipeline seam uses: one
   construction, no second allowlist, **no new row in Table U**, which stays
   canonical for the channel set. Measured (**VS-P1**), through the real
   `assertGitRepo` rather than a bare `git` invocation: with `GIT_DIR` exported
   to a repository elsewhere the shipped guard **accepts** a directory that is
   not a repository; under `buildGitEnv()` the identical argv exits 128
   (**VS-P2**). The predecessor's Table W row W1(c)(i) standing trigger does
   **not** fire — the argv is byte-identical at all four call sites and no call
   site is added, so no tenth pinned shape is surfaced — and the spec asserts
   that mechanically rather than by assurance. Reversing this withdraws the WP;
   the cost is the spec's O4.

2. **O5 — the nested vault: ACCEPT AND NAME IT.** `assertGitRepo` establishes
   that the vault is **inside** a repository, not that it **is** one; that is
   now stated in its own contract instead of being implied. **The measurement is
   what selects this answer over the two hardening ones** (**VS-P4**): running
   the real `wienerdog adopt --yes` against a directory that is a subdirectory of
   an existing repository and has no `.git` of its own **succeeds** — adopt's own
   `isGitRepo` is the same `rev-parse --git-dir` predicate, so it reads "inside a
   repository" as "already a repo", skips `git init`, and writes that path into
   `config.yaml`. The nested case is therefore reachable through the product's
   own front door and supported today, so requiring
   `rev-parse --show-toplevel == vault`, or setting `GIT_CEILING_DIRECTORIES`,
   would stop a currently-working vault from dreaming. **Both hardening answers
   are PARKED as this item's overrule cost, not dropped**, each with what it
   would change; a hardening proposal with a user-visible cost becomes text only
   on an explicit owner yes. *The cost of accepting, stated:* a dream in such a
   vault reads against the ancestor repository (**VS-P2**, **VS-P3**), and that
   it would then commit there is inferred from the code rather than measured.

**No item was parked by the design loop under escalation (ii): round zero
produced no finding that argues against either recommendation.** Its six
findings (Y1–Y6) are machinery, citations or an id collision, and are recorded
with what changed in
`2026-09-06-git-env-validate-seam-design-gate-rounds.md`.

### Amendment, 2026-09-06 (after `WP-dream-git-env-validate-seam`'s design-gate round 1) — the O4/O5 entries are reduced to citations, and O6 is added

Round 1's hermetic shadow (finding F6, band C) found that the 2026-09-06 append
**says** O4 and O5 live in one place and are cited here, and then **restates**
them — J0's construction rule and J5's nested-vault behaviour — in an entry the
primary spec's Mirrored Surface Checklist did not register. Table J and every
listed mirror could therefore move while this record silently disagreed. This
record is append-only, so the restating sentences stand where they are and are
corrected here, exactly as this queue's 2026-09-06 amendment did for the
predecessor's O1 entry.

**WITHDRAWN, in favour of the citation:** every sentence of the entry above that
states what O4 or O5 *decides* — the construction rule, the no-argv-change
claim, the nested-vault verdict and its cost. **The governing text is
`docs/specs/WP-dream-git-env-validate-seam.md`'s
`## Dispatch precondition — owner items`**, together with its Table J for the
facts and its design-gate record for the probes. The append's remaining function
is to say, for the owner, that **O4 and O5 were adopted under the standing
process of 2026-09-05 and not as direct rulings, and that their enumerated
overrule costs are in that section.** That spec now registers this record as an
external Table J mirror, so a change to J0 or J5 is carried here by a dated
amendment paragraph naming the spec as governing — never by editing an entry in
place.

**O6 — DISPOSE OF TABLE W ROW W1(c)(i)'s STANDING TRIGGER BY A DATED AMENDMENT
INSIDE THAT ROW, RATHER THAN BY READING IT NARROWLY. Recommendation adopted
under the standing process above.** Round 1's shadow (finding F1, band B) found
that the successor was narrowing *"any change to what `validate.js` spawns"* to
argv and call-site count **on its own authority** — and the environment handed to
`spawnPinnedSync` is part of what is spawned. The finding did not challenge O4;
it challenged the unapproved conclusion that O4 leaves the prior trigger
undisposed. The answer adopted is to dispose of it as an act:
`docs/specs/done/WP-dream-promote-in-workspace.md` joins that WP's Deliverables
for **one dated amendment inside row W1(c)(i) and nowhere else**, recording that
the trigger's subject is the SHAPE, that the successor changes no shape and adds
no call (asserted mechanically against the branch's merge-base), that the
environment is constructed per ADR-0012's 2026-09-05 amendment, and that **the
election's admissibility measurement was RE-MEASURED under that environment and
holds** — the exact `rev-parse --git-dir` argv issued from a stale-stat index
leaves `.git/index` byte-identical, with a `status --porcelain` control in the
same state moving it.

*Overrule cost, and it is the largest in this queue.* The owner may instead rule
that **the trigger FIRES on an environment change**. Then this work package
stops and is superseded: the remedy row W1(c)(i) names is *close the seam AND
bring the new shape to the owner*, so threading the pipeline's `spawnGit` into
`assertGitRepo` and admitting `rev-parse --git-dir` as a **TENTH pinned shape**
both become owner business and a change to Table W row W1(c) itself.
`tests/unit/dream-pipeline.known-calls.js` joins Deliverables, the pinned-shape
count moves from nine to ten in **every** surface that states it, and the
package is no longer an S. The text and the full statement of this item live in
the spec's `## Dispatch precondition — owner items`; this entry cites them and
does not restate them.

### Correction, 2026-09-06 (after design-gate round 2) — the O6 entry above is reduced to its adoption status and a citation

Round 2 found, in both channels, that the O6 entry appended above **restates**
what it claims to cite: the trigger's subject, the no-shape/no-call claim, the
constructed-environment rule, the stale-stat result and the whole overrule cost —
and then closes by saying it cites the spec and does not restate it, which
contradicts the paragraphs immediately before it and the primary spec's
citation-only checklist. Two substantive copies of O6 would have to be kept
aligned in an append-only record. This is the same defect the 2026-09-06
amendment corrected for O4 and O5, one entry later.

**WITHDRAWN, in favour of the citation:** every sentence of the O6 entry above
that states what O6 *decides* or what overruling it *costs* — including its
closing sentence claiming citation-only treatment, which was false of the text it
closed.

**What stands, and it is the whole of this record's function for O6:** **O6 was
adopted under the standing process of 2026-09-05, as a recommendation and not as
a direct owner ruling, and the owner may reverse it by dated amendment.** Its
text, its four required amendment statements and its enumerated overrule cost —
the largest in this queue — are in
`docs/specs/WP-dream-git-env-validate-seam.md`'s
`## Dispatch precondition — owner items`, which governs. That spec registers this
record as an external mirror, so a change to O6 is carried here by a dated
amendment paragraph naming the spec as governing, never by editing an entry in
place.

### Appended 2026-09-06 — O7, the E2 disposition act that closes audit group C

**O7 — TAKE `WP-audit-c-close-disposition` TABLE E ROW **E2**: audit group C is
CLOSED, every mechanism retired or accepted. Recommendation adopted under the
standing process above, never a direct owner ruling.**

Citation-only, as the 2026-09-06 corrections to O4/O5 and O6 established for this
record. **The governing text is
`docs/specs/done/WP-audit-c-close-disposition.md`'s dated section "E2 disposition
act, 2026-09-06"**, and the measurement it rests on is
`docs/specs/logbook/2026-09-06-audit-group-c-closure.md` — the four owner WPs
Done with their own verification re-run green on `eedd8783`, the retiring code
cited at both ends, and the three residuals **accepted rather than retired** with
the home that owns each. This entry restates none of it.

*Overrule cost, as that section enumerates it:* group C reopens with the residual
named — the ruling returns to E1, `docs/HANDOVER.md`'s row C returns to an open
cell, and the residual argued unaccepted acquires an owner WP of its own instead
of the home that already carries it.

### Correction, 2026-09-06 (after the E2 closure review round) — the O7 entry above is reduced to adoption status and pointers

The round's hermetic shadow (finding F2, band C) found that the O7 append
declares itself citation-only and then restates the governing act: the four-WP
green measurement, the retiring-code evidence, the three accepted residuals, and
the full overrule cost copied from the spec. **That is the same append-only drift
this record's 2026-09-06 corrections withdrew for O4/O5 and again for O6** — a
substantive copy that a later change to the governing text would have to chase.
This record is append-only, so the original entry stands where it is and is
corrected here.

**WITHDRAWN, in favour of the pointers:** every sentence of the O7 entry above
that states what the act MEASURED, what it retired or accepted, or what
overruling it costs.

**What stands, and it is the whole of this record's function for O7:** **O7 was
adopted under the standing process of 2026-09-05, as a recommendation and not as
a direct owner ruling, and the owner may reverse it by dated amendment.** Two
pointers, and nothing else:

- the governing act — `docs/specs/done/WP-audit-c-close-disposition.md`, section
  **"E2 disposition act, 2026-09-06"**, which carries the decision, the
  `<LOGBOOK>` resolution and the enumerated overrule cost;
- the measurement it rests on —
  `docs/specs/logbook/2026-09-06-audit-group-c-closure.md`.

### Appended 2026-09-06 after maturing `WP-quarantine-disposal-durability` — two items, O8 and O9

Numbering continues this queue's. Both are **recommendations adopted under the
standing process of 2026-09-05, not direct owner rulings, and the owner may
reverse either by dated amendment.**

**CITATION-ONLY**, in the form this record's 2026-09-06 corrections to O4/O5, to
O6 and to O7 established: adoption status plus pointers, and nothing about what
either item decides or what overruling it costs. Three entries in this file had
to correct themselves this session for restating governing text; these two do not
restate any.

- **O8** — the value question of `WP-quarantine-disposal-durability`.
- **O9** — the retention prune's selection rule.

Two pointers each, and nothing else:

- **The governing text for both** —
  `docs/specs/done/WP-quarantine-disposal-durability.md`'s
  `## Dispatch precondition — owner items`, which carries each item's decision
  and its enumerated overrule cost, and that spec's **Table M** for the facts.
- **The measurements they rest on** —
  `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
  probe ids `QD-P1`…`QD-P5`.

That spec registers this record as an external mirror, so a change to O8 or O9 is
carried here by a dated amendment paragraph naming the spec as governing, never
by editing this entry in place.

### Appended 2026-09-06 after `WP-quarantine-disposal-durability`'s design-gate round 1 — one item, O10

Numbering continues this queue's. **O10 was adopted under the standing process of
2026-09-05, as a recommendation and not as a direct owner ruling, and the owner
may reverse it by dated amendment.** It exists because round 1's hermetic shadow
(finding F3, band A) falsified two sentences in that spec's canonical table; the
correction is a fix, but the product question it exposed is about a shipped
retention posture and therefore the owner's.

**CITATION-ONLY**, as this record's 2026-09-06 corrections to O4/O5, to O6 and to
O7 established. Two pointers, and nothing else:

- **The governing text** — `docs/specs/done/WP-quarantine-disposal-durability.md`'s
  `## Dispatch precondition — owner items`, which carries **O10**'s decision and
  its enumerated overrule cost, and that spec's **Table M** for the facts.
- **The measurement it rests on** —
  `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
  section "Round 1", probe `QD-P9`.

**One citation in the earlier entry is corrected here rather than in place, as
this record requires:** it names the measurements as probe ids `QD-P1`…`QD-P5`;
round 1 added `QD-P6`…`QD-P10`, so the range is **`QD-P1`…`QD-P10`**. The pointer
itself — that design-gate record — is unchanged and still governs.

The **O8** and **O9** entries appended earlier today stand: round 1 re-derived O8
rather than reversing it, and O9's routing now names a filed `Draft` stub,
`docs/specs/WP-quarantine-only-copy-shelf.md`. Neither entry's text changes, for
the reason this record's corrections give — the spec governs, and a change to any
of the three is carried here by a dated amendment paragraph naming it, never by
editing an entry in place.

### Appended 2026-09-06 after `WP-quarantine-disposal-durability`'s design-gate round 2 — one item, O11

Numbering continues this queue's. **O11 was adopted under the standing process of
2026-09-05, as a recommendation and not as a direct owner ruling, and the owner
may reverse it by dated amendment.** It exists because round 2 was the THIRD
consecutive round to land a finding on one spanning sentence, so the repeat-kind
rule made the answer a design change rather than another patch: that spec's
disposition is now its Table M's per-act column, and two of the five acts fall
outside it and need a decision of their own.

**CITATION-ONLY**, as this record's 2026-09-06 corrections to O4/O5, to O6 and to
O7 established. Two pointers, and nothing else:

- **The governing text** — `docs/specs/done/WP-quarantine-disposal-durability.md`'s
  `## Dispatch precondition — owner items`, which carries **O11**'s decision and
  the enumerated price of BOTH options, and that spec's **Table M** for the facts.
- **The measurement it rests on** —
  `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
  section "Round 2", finding **R2-A**, probe `QD-P11`.

**Two consequences the owner should see without opening the spec, stated as status
and not as contract.** The `Superseded` outcome **narrows**: that package disposes
three of its five removal acts, and the other two move to a new `Draft` stub,
`docs/specs/WP-quarantine-failed-preserve-disposal-flush.md`, which has not run its
own design gate. And **O8 is no longer a rule**: the same section records that its
universal sentence was withdrawn rather than reworded.

**O10 is qualified by the same round** (finding R2-C) — the withheld twin is not
retained forever, and the lifetime equivalence that entry's governing text once
carried is withdrawn there. That is a change to the governing text, not to this
record's O10 entry, which was citation-only and stays as it is.

**And one citation in the entries above is corrected here rather than in place,
as this record requires:** the 2026-09-06 O10 append gave the measurement range as
probe ids `QD-P1`…`QD-P10`. Round 2 added `QD-P11`, so the range is
**`QD-P1`…`QD-P11`**. The pointer itself — that design-gate record — is unchanged
and still governs, for O8, O9, O10 and O11 alike.

### Appended 2026-09-06 after `WP-quarantine-disposal-durability`'s design-gate round 3 — no new item; O10 and O11 are amended in their governing text

**No O12.** Round 3 landed four findings, all decision SUPPORT, and **none reversed
O8, O9, O10 or O11**. Two of them changed what those items SAY, which this record
carries as a dated pointer rather than by editing an entry in place:

- **O11 is RE-LABELLED and RE-PRICED.** Option (b) is a **best-effort** flush, not
  a closure of the class, and option (a)'s cost is no longer stated as a shipped
  contract becoming false. The governing text is the spec's
  `## Dispatch precondition — owner items`, which carries both halves.
- **O10 is EXTENDED** to name and price the exact state row **M6** now accepts.
  Its decision did not move; what moved is that the acceptance is priced instead of
  resting on an equivalence. Same governing text.

Both remain **adopted under the standing process of 2026-09-05, as recommendations
and not direct owner rulings**, and the owner may reverse either by dated
amendment. The measurements are
`docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`,
section "Round 3", probe `QD-P12` (added in that round), so the range named in the
earlier appends is now **`QD-P1`…`QD-P12`**.

### Appended 2026-09-06 after `WP-quarantine-disposal-durability`'s design-gate round 4 — no new item; THE LOOP IS CLOSED

**No O12, and no change to O8, O9, O10 or O11.** Round 4's two findings were both
sentences OUTSIDE the governing rows, both fixed by deletion, and both channels
reported that no Table M decision was falsified and no measured claim is false.
The loop closed on the criterion pinned before round 1.

**What the owner has in front of them, as status and not as contract:** four
recommendations adopted under the standing process of 2026-09-05, each reversible
by dated amendment, whose text and enumerated overrule costs live in ONE place —
`docs/specs/done/WP-quarantine-disposal-durability.md`'s
`## Dispatch precondition — owner items` — with that spec's **Table M** for the
facts and
`docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md`
for the measurements (`QD-P1`…`QD-P12`) and the closure call.

Two `Draft` successors were filed by this loop and neither has run its own design
gate: `docs/specs/WP-quarantine-only-copy-shelf.md` (**O9**) and
`docs/specs/WP-quarantine-failed-preserve-disposal-flush.md` (**O11**).
