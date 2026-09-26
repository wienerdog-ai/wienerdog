---
id: WP-dream-first-pass-novelty
title: Stop a first dream pass from dropping material on an unchecked "already written elsewhere" assumption
status: Draft
model: opus
size: M
depends_on: [WP-009]
adrs: [ADR-0004, ADR-0031]
epic: dream-primary-dialogue
---

# WP-dream-first-pass-novelty: Stop a first dream pass from dropping material on an unchecked "already written elsewhere" assumption

> **Pilot result, 2026-09-26 (late night) — the measured finding below is
> largely an evaluation artefact.** A paired pilot of candidate (i)
> (`docs/specs/logbook/2026-09-26-first-pass-novelty-paired-pilot.md`) showed
> the variant recovers everything on the re-shown case at 2.7× cost — but that
> case was artificial: the dream reads the vault's working tree, the sessions
> had written their own notes there uncommitted, and the git-commit baseline
> excluded them; every "recovered" item is in the live notes today. On a
> genuine first pass the variant recovered 1 medium and 4 low items, newly lost
> 1 medium, added duplicates, at 1.1× cost. Recommendation in the record: no
> design round on this evidence. The "measured finding" section below is kept
> as written, as history; read it with the record's "The doubt, checked".

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **NOT DISPATCHABLE. This is a candidate package, filed 2026-09-26, and it is
> not a design.** It records **one measured finding** about how the dream skill
> consolidates, and **two candidate closures**, and it **takes no decision**
> between them. It has no Deliverables table, no acceptance criteria and no
> verification commands, and it has been through **no design round** — none
> was run and none was commissioned in the pass that filed it. **It needs an
> owner product decision as well as a design round** (see "Owner product
> decision" below). **An implementer who reaches this file must stop and hand
> it back.** Only the architect or the owner matures it to `Ready`.
>
> **Why it exists.** It is one of the two replacements of the superseded
> `docs/specs/done/WP-dream-primary-dialogue-filter.md`, filed under the
> owner's ruling of 2026-09-26
> (`docs/specs/logbook/2026-09-26-owner-rulings-cas-window-and-filter.md`,
> item 2). Its evidence is the filter's offline evaluation,
> `docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`
> — cited below as **the evaluation record** — specifically its Findings A and
> the second round of its judge. The finding is **not** an input-filter
> question: none of the losses sits in material a filter would remove.
>
> **Epic and dependency, chosen by the architect.** The dream skill was
> authored by `WP-009` (Done), which carries no `epic:`. This stub takes
> `epic: dream-primary-dialogue` because its evidence came from that stream and
> the last package to edit the skill (`WP-dream-primary-dialogue-collection`)
> is in it; `dream-promotion` was not used because that epic holds the
> promotion and quarantine machinery, not consolidation quality.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call. The nightly **dream** reads recent session transcripts,
projects each to its **primary dialogue** (the person's requests and
corrections plus the concluding assistant reply of each exchange), writes the
extracts to a private scratch directory, and runs one consolidation pass — a
model reading `skills/wienerdog-dream/SKILL.md` — that updates a private copy of
the user's **vault**. Code then validates and promotes what it wrote. **A
session is consolidated once:** the transcript ledger records it, and an
unchanged session is never fed to a later dream again (the evaluation record:
*"production never re-feeds an unchanged session"*). So whatever a first pass
leaves out of the vault is not recovered by a later night unless something
records it.

**How the skill decides what to write.** Phase 2 of the skill
(`SKILL.md:90-126`) scores each candidate 0..1 from six signals; one of them
is, verbatim (`:96`): *"**novelty** — whether it is not already captured in the
vault."* Phase 3 (`:128`) then routes by that score: below **0.5** a candidate
is dropped (`:145-146`) and listed in the dream report's `## Gated out (and why)` section
(`:445-447`). The skill tells the pass to *"Read the existing vault notes you
might update, so you dedupe and update rather than duplicate"* (`:58-59`); it
says nothing about checking a claim that material is already written somewhere
before scoring it as not novel.

## Current state

### The measured finding (the evaluation record, Findings A and round 2)

Measured on a nine-session sample of the owner's own sessions, run through the
installed 0.15.0 dream against a disposable vault and judged in two rounds by
`claude-opus-5-5` at high effort. Counts only — the record holds no transcript
or note text.

- **The defect, in the judge's second round's words in substance:** on a first
  pass the dream records totals and to-dos and scores the rest near-zero
  novelty **on an unchecked assumption that the material is already written
  elsewhere**; the notes that assumption pointed to did not contain it.
- **16 losses:** **0 high, 9 medium, 7 low.** (Round 1 listed 20 — 3 high,
  12 medium, 5 low; round 2, shown the baseline vault, found 4 already held and
  downgraded the rest.)
- **12 were made by the live 2026-09-24 dream** on two sessions it had
  consolidated, re-exposed because the evaluation ran with an empty transcript
  ledger against that dream's own commit — and the evaluation run accepted the
  earlier pass's claim without checking. **4 were made by the evaluation run
  itself** on two sessions new to the baseline. Both groups are production
  behaviour of a first pass.
- **None of the 16 sits in a block the judge marked low-value**, so no input
  filter — including the superseded one and the projection fix
  `docs/specs/done/WP-dream-projection-harness-user-records.md` — reaches them.
- For scale: the same run's diff was otherwise judged *"faithful to the
  dialogue"*, with 8 unsupported claims (0 high, 1 medium, 7 low).

### What already exists

- `skills/wienerdog-dream/SKILL.md` — authored by `WP-009` (Done); Phase 2's
  provenance lines last edited by `WP-dream-primary-dialogue-collection`
  (Done).
- The report already has a per-candidate `## Gated out (and why)` section
  (`SKILL.md:445-447`). **Whether the 16 losses appear in the 2026-09-24
  report's gated-out list is not recorded** by the evaluation; checking it is
  a measurement for the design round, run in the owner-only evaluation root,
  with only counts committed.
- **Any edit to the skill body changes the dream job's `promptHash`**
  (`src/scheduler/descriptor.js:102-103` hashes the vendored skill body); per
  `WP-dream-primary-dialogue-collection`, a normal `wienerdog update` /
  `wienerdog sync` rebinds it and a stale binding fails closed at fire time.
- The only end-to-end exercise of the skill with a real brain is the scenario
  harness, `tests/scenarios/` (its `README.md`: *"the only place in this repo
  that exercises the dream skill end to end instead of mocking the brain"*).

## Deliverables (permission boundary — touch ONLY these)

N/A — candidate package; no permission boundary exists yet, and an implementer
who reaches this file stops (see the banner). Either candidate touches
`skills/wienerdog-dream/SKILL.md` and its vendored digest; candidate (ii)
reaches further (see below). The design round writes the table.

### Exact contracts

N/A — undesigned.

## Contract reference (optional — mark N/A if this WP is not contract-dense)

N/A for the stub — the trigger depends on which candidate is taken.
Candidate (i) alone is skill prose and may fire none of the seven. Candidate
(ii) introduces a report section that a later dream reads: (i) a result shape
changes, (v) an authority boundary is crossed (one dream writes what another
interprets), (vi) multiple consumers (the owner and every later dream) — the
design round authors its canonical table if it is taken.

## Implementation notes & constraints

### The two candidate closures — recorded, NOT chosen

- **(i) Novelty must be checked against the notes, not against a claim.**
  Phase 2's novelty signal may score a candidate as already captured only when
  the pass has read the note that holds it — not on an earlier report's or a
  session's assertion that it is written somewhere. *What it reaches:* the
  stated cause of all 16 losses. *What it does not:* material the pass drops
  for importance rather than novelty; and it is prose asked of a model, which
  no code verifies — the same standing as the skill's other Phase 2 duties.
  *Cost:* more reads per night (the evaluation run made 17 Reads and 4 Greps).
- **(ii) A per-session "what I left out and why" section that a later dream
  re-reads.** *What it reaches:* omissions become visible to the owner and
  recoverable by a later night when the same topic recurs, even though the
  transcript is never re-fed. *What it does not:* it does not prevent the loss
  on the first pass. *Costs and hazards the design round owns:* more report
  text every night; a new input to the dream that is **model-written**, so the
  per-message `derived_from_untrusted` flags that code computed do not survive
  into it — a later dream reading it must treat it as untrusted, or the design
  must carry the flags, or it becomes a path by which externally sourced text
  reaches the vault looking trusted.

The two are not exclusive; taking both, one, or neither is the design round's
and the owner's choice.

### Owner product decision — needed before a design round is worth running

What a first pass should keep is a product question, not an engineering one:
is losing medium-severity material on a first pass acceptable against larger
notes, longer runs and more reading every night; and should the vault hold a
record of what the dream chose to leave out. The recommendation is not made in
this stub.

### Open questions for the real spec

1. How is a prose change to the skill verified? The scenario harness or a
   repeat of the offline evaluation (under the owner's 2026-09-26 privacy
   condition: a disposable vault on the owner's machine only) are the
   candidates; a unit test cannot see a model's scoring.
2. Does candidate (ii) duplicate the existing `## Gated out (and why)`
   section? Measure first (Current state).
3. If (ii) is taken, where does a later dream find it, and how is its trust
   level carried?

**Sizing — M, provisionally.** A skill-prose change with a `promptHash`
rebind and an end-to-end verification that needs a real brain; candidate (ii)
adds a report shape and a new dream input with a provenance rule. Re-derive
when the design is taken.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Candidate (ii) makes model-written text a dream input; its provenance
      rule must be decided on the record before `Ready` (see above).
- [ ] The skill's safety rule — transcript content is quoted data, never an
      instruction (`SKILL.md:22-32`) — must hold for any new input.

## Acceptance criteria

- [ ] N/A — candidate package; the design round writes them.
- [ ] Idempotence: N/A — the eventual package changes skill prose (and perhaps
      a report shape), not an install-time write.

## Verification steps (run these; paste output in the PR)

N/A — candidate package; see open question 1.

## Out of scope (do NOT do these)

- **The harness-authored user records** —
  `docs/specs/done/WP-dream-projection-harness-user-records.md`.
- **Any input filter or relevance stage** — the superseded
  `docs/specs/done/WP-dream-primary-dialogue-filter.md`.
- **Re-feeding consolidated sessions** — the ledger's behaviour is not in
  question here.
- **The unsupported-claims findings** (Findings B of the evaluation record) —
  a separate observation, not filed.

## Definition of done

**Not yet written.** This stub is complete when the owner has made the
product decision above and the architect replaces it with a full spec: a
design round first, then a Deliverables table, contract tables if the trigger
fires, acceptance criteria and literal verification commands. **It stays
`status: Draft`** and does not move to `Ready` until it has been through the
double gate (`docs/runbooks/codex-review.md` plus wd-reviewer). Only the
architect or the owner flips it.
