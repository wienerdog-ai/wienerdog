---
id: WP-dream-projection-harness-user-records
title: Keep harness-authored Claude user records out of the primary dialogue
status: Draft
model: opus
size: S
depends_on: [WP-dream-primary-dialogue-projection]
adrs: [ADR-0004, ADR-0023, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-projection-harness-user-records: Keep harness-authored Claude user records out of the primary dialogue

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **NOT DISPATCHABLE. This is a backlog stub, filed 2026-09-26, and it is not a
> design.** It records **one measured gap** against a shipped contract, **one
> candidate closure with three open formulations**, and **one open design
> question** it deliberately does not answer. It has no Deliverables table,
> no acceptance criteria and no verification commands, and it has been through
> **no design round** — none was run and none was commissioned in the pass that
> filed it. **An implementer who reaches this file must stop and hand it
> back.** Only the architect or the owner matures it to `Ready`, and doing so
> means a design round first.
>
> **Why it exists.** It is one of the two replacements of the superseded
> `docs/specs/done/WP-dream-primary-dialogue-filter.md`, filed under the
> owner's ruling of 2026-09-26
> (`docs/specs/logbook/2026-09-26-owner-rulings-cas-window-and-filter.md`,
> item 2). Its evidence is the filter's offline evaluation,
> `docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`
> — cited below as **the evaluation record**. It is a **fix against a Done
> contract**, not a new feature: the shipped projection promises something the
> shipped code does not do.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** Nothing it writes starts a process or
outlives its call. The nightly **dream** reads recent session transcripts,
writes a bounded extract of each into a private scratch directory, and asks one
consolidation pass (the dream skill, `skills/wienerdog-dream/SKILL.md`) to
update a private copy of the user's **vault**; code then validates and promotes
what it wrote.

**Since `WP-dream-primary-dialogue-projection` (Done, PR #266, merge
`b46a3843`) the extract holds only primary dialogue.** That package's
contract, verbatim from
`docs/specs/done/WP-dream-primary-dialogue-projection.md:147-150`: *"genuine
user requests and corrections, plus the concluding assistant reply of each
exchange. Tool calls, tool results, reasoning text and intermediate progress
replies are not primary dialogue. Harness-authored and developer-authored
instructions are not dialogue."* The same promise opens the module that
implements it (`src/core/transcripts/primary-dialogue.js:3-11`), which adds:
*"There is no model call here and no heuristic over message CONTENT — every
decision below reads structure only (spec Table A)."* Collection into the
dream was switched over by `WP-dream-primary-dialogue-collection` (Done).

**Row A2 is the Claude acceptance rule, and it is structural.** Quoted from
that Done spec (`:458`), the user half: *"From a record whose top-level `type`
is exactly `"user"`, which has no `isMeta: true` and no `isSidechain: true`
(row A4), and whose `message.role` is exactly `"user"`: accept the whole of
`message.content` when it is a string; when it is an array, accept the `text`
value of each block whose `type` is exactly `"text"`, joined with `"\n\n"` in
source order, as one user message."* A user message accepted this way is
emitted with `derived_from_untrusted: false`, always, by role (row A5(a));
row A5b says that `false` claims only *"the harness attributed this record to
the user role"*, not that a human wrote it.

**The same Done spec already ruled against one content heuristic.** Its
implementation note on routine prompts (`:553-569`) measured that a `claude -p`
routine prompt carries the same top-level field set as a person's first
message, and ruled: *"Do not add a heuristic (a project-directory name, a
prompt prefix) to invent one … a wrong heuristic would be worse than the known
limitation."* That ruling is about routine prompts, which this stub leaves
alone; whether it also binds the records below is the design round's first
question (open formulation (C) and question 1).

## Current state

### The measured gap (the evaluation record, "What the low-value volume is made of")

Measured by the shipped 0.15.0 projection on a nine-session sample of the
owner's own sessions (six Claude, three Codex). Counts only — the record holds
no transcript text. **Denominator: 98,121 projected characters, 132 messages.**

- Claude `user` records whose text begins with **`<task-notification`** (a
  subagent's completion notice) or with **`<command-name`** /
  **`<local-command-stdout`** (slash-command echoes) carry **neither `isMeta`
  nor `isSidechain`**, so row A2 accepts them and they pass through as dialogue,
  flagged `derived_from_untrusted: false`.
- Task notifications: **15,090** characters (15.4 %). Local-command echoes:
  **1,009** (1.0 %). Together: **16,099 characters (16.4 %) and 35 of 132
  messages.**
- Cross-tabbed against the evaluation's judge verdicts: **13,544** of those
  characters sit in blocks the judge marked low-value, and **2,555** in blocks
  it kept — notifications the judge had grouped with a kept reply. **Nothing
  kept is lost by stripping them**: the kept material in those blocks is the
  reply, not the notification.
- The evaluation record calls this *"a gap against a shipped contract"*
  because of `:148-150` above, and proposed filing it as a fix against the
  projection's Done contract; the owner ruled that disposition on 2026-09-26.

### Where the rule lives in code

`src/core/transcripts/primary-dialogue.js`, inside `createPrimaryProjection`,
the closure `acceptClaude` (`:179`, JSDoc `:177-178`: *"Rows A2 and A4"*):

- `:180` — `if (obj.isSidechain === true) return null;`
- `:183` — `if (obj.type === 'user') {`
- `:184` — `if (obj.isMeta === true) return null;` — **the candidate site**:
  the new exclusion sits beside this test.
- `:185` — `if (message.role !== 'user') return null;`
- `:187` — string content: `return { role: 'user', text: content, ts };`
- `:191-192` — array content: `joinTextBlocks(content, '\n\n')`, dropped when
  empty.

A text-based test can only run once the text exists, so it has to cover
**both** returns (`:187` and `:192`), not only the `:184` line. `acceptClaude`
runs at step 4 of row A5e (`:299`), **after** step 3's taint scan (`:289-294`)
— so declining a record there never changes the taint state (row A5e step 4:
*"it is classified-and-declined; **no taint**"*; the code says the same at
`:296-297`).

### What already exists to extend

- Unit suite: `tests/unit/primary-dialogue.test.js`; fixtures:
  `tests/fixtures/primary-dialogue/`.
- ADR-0042 RED declarations for this module:
  `tests/red-proofs/primary-dialogue.proofs.json`.
- The default parser (`src/core/transcripts/claude.js`) is **not** involved:
  the projection is an observer, and the Done spec's AC5 keeps the default
  parse byte-identical.

## Deliverables (permission boundary — touch ONLY these)

N/A — stub; no permission boundary exists yet, and an implementer who reaches
this file stops (see the banner). The design round writes this table. The
surfaces the candidate closure would reach are listed under Current state and
in the Mirrored Surface Checklist below; that list is not a boundary.

### Exact contracts

N/A — undesigned. The contract is the design round's output (see Contract
reference).

## Contract reference (optional — mark N/A if this WP is not contract-dense)

**Activation trigger — expected to fire for the real spec** (to be re-assessed
by the design round): (iii) structured input parsing/acceptance changes — row
A2's acceptance set narrows; (vi) a downstream consumer inherits it —
`WP-dream-primary-dialogue-collection` feeds this projection's output to the
dream; (vii) the same contract appears on several mirrored surfaces (listed
below). Three of seven.

### Contract table(s)

**Draft, undesigned — records the shape of the good, not a decision.** Per the
architect brief, the table enumerates the records we **accept**, never a
forbidden set: a forbidden-set enumeration over a grammar that is not ours (the
Claude harness's envelope tags) cannot be closed.

#### Table H (DRAFT) — which Claude `user` records are primary dialogue

| Row | Record | Status in this stub |
|-----|--------|--------------------|
| H1 | A record row A2 accepts today **whose text is the person's own words** | **ACCEPT** — the whole purpose of A2; unchanged |
| H2 | A record row A2 accepts today that is a `claude -p` routine prompt | **ACCEPT, unchanged** — not distinguishable by structure (Done spec `:553-569`); 612 characters (0.6 %) in the sample; out of scope here |
| H3 | **How code decides H1 membership** for the text classes measured above | **OPEN** — formulations (A), (B), (C) below |

**The three formulations, recorded and NOT chosen.**

- **(A) A closed accept-set over the text's opening.** A user record is H1
  only when its text does not open with a markup tag (`<` followed by a tag
  name), unless that tag is on a code-owned list of tags we accept (empty
  today). *What it reaches:* every harness envelope, including ones not yet
  seen — fails closed, and states the good rather than the bad. *What it
  costs:* a message a person types that opens with markup (pasted HTML, XML)
  is dropped; how often that happens is **unmeasured**.
- **(B) A decided list of harness envelopes.** Decline exactly the
  code-owned prefix literals measured (`<task-notification`, `<command-name`,
  `<local-command-stdout`), accept everything else. *What it reaches:* exactly
  the 16.4 % measured. *What it does not:* a new or unmeasured envelope passes
  as dialogue — this is a forbidden list and cannot be closed; it fails open,
  which is today's behaviour for anything not on it. The evaluation counted
  these three prefixes only; it did not enumerate every leading envelope in
  the corpus.
- **(C) A structural discriminator, if one exists.** The Done spec's
  measurement found no field separating a routine prompt from a human one
  (`:556-562`), but it did not examine notification or echo records. Their top-level field
  set (for example `promptSource` or `userType`, both present on user records
  per `:557-559`) is **unmeasured**. If a field separates them, the fix stays
  inside the module's "structure only" rule (`primary-dialogue.js:9-11`) and
  the Done spec's heuristic ruling (`:563-567`) is not engaged. It must be
  measured before (A) or (B) is chosen, from field names only — no
  transcript text leaves the owner's machine (the evaluation record's
  privacy discipline).

### Mirrored Surface Checklist

Surfaces that state what primary dialogue is. The real spec updates the
canonical table and every mirror in one pass (ADR-0031); this list registers
them now so none is missed:

- [ ] `docs/specs/done/WP-dream-primary-dialogue-projection.md` row A2
      (`:458`) and the contract sentence (`:147-150`) — by a **dated erratum**
      in that Done file, as its existing errata block does (opening at `:14`), never by
      a silent edit.
- [ ] `src/core/transcripts/primary-dialogue.js:3-11` (module header) and the
      `acceptClaude` JSDoc (`:177-178`).
- [ ] `skills/wienerdog-dream/SKILL.md:53` (*"the person's requests and
      corrections"*) — expected to stay true without an edit; an edit would
      change the dream job's `promptHash` (`src/scheduler/descriptor.js:102-103`).
- [ ] Deliverables-table cells, acceptance criteria and verification greps of
      the real spec (none yet).

## Implementation notes & constraints

**Open design questions — this stub takes no decision on any of them.**

1. **Which formulation of H3?** (A), (B) or (C) above, and whether the
   Done spec's ruling against a prompt-prefix heuristic (`:563-567`) binds a
   harness-envelope test. Measure (C) first.
2. **The interim replies those records create — NO DECISION.** Each accepted
   notification opens a new exchange whose concluding reply is often an
   interim status line. In the sample: **34 interim assistant replies, 8,947
   characters**. The evaluation tried two positional rules and both are
   **unsafe**: *"keep only the last reply before the next real user message"*
   removed **6,441** characters of kept material, including replies that
   carry a ruling; *"drop every reply whose nearest preceding user record is a
   notification"* removed **23,430** characters of kept material, because the
   reply after a notification is often the synthesis. Stripping the user
   records alone leaves these replies in place; that is the stub's baseline.
3. **Does a declined notification taint?** A task notification carries a
   subagent's result. Today it is a user message, `false` by role, and it does
   not set the taint state. Declining it at step 4 keeps that (row A5e). Row
   A5c-why's principle is *"taint on an unrecognised value exactly where the
   harness signals tool output"*; whether a subagent's result is that signal
   is a provenance question the design round must answer on the record, not
   by default.
4. **Where exactly the test runs:** on the joined text (both returns, `:187`
   and `:192`), with what treatment of leading whitespace — decided by the
   chosen formulation.

**What a RED proof (ADR-0042) would have to show.** A declaration beside
`tests/red-proofs/primary-dialogue.proofs.json` that mutates the new exclusion
in two directions: **(1) disable it** — the assertion that a notification- or
echo-opening user record yields no message must redden; **(2) widen it** (for
example to every user record) — a control assertion that an ordinary user
record, including one that mentions a tag name mid-text, is still accepted
must redden. A proof that only disables the rule cannot tell an exclusion from
a deletion.

**Invariants the fix must keep** (from the Done spec): the learnings-ledger
gate reads a text-free projection of the **original** timeline, not the
dialogue, so removing dialogue cannot change its verdicts (`:157-166`); the
default parse stays byte-identical (AC5); taint is monotonic and nothing lowers
it (row A5e).

**Sizing — S, provisionally.** One predicate in one module, its tests and
RED declaration, and one Done-spec erratum. If the design round chooses (A)
and has to measure person-typed markup, or takes a decision on question 2,
re-derive the size; a size on an undesigned package is an estimate.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] Transcript records are untrusted input. The new test reads record text
      and must never throw, coerce, or invent dialogue on a malformed value —
      the same discipline as `joinTextBlocks` (`primary-dialogue.js:81-86`).
- [ ] Question 3 above is a provenance question; it must be answered on the
      record before `Ready`.

## Acceptance criteria

- [ ] N/A — stub; the design round writes them.
- [ ] Idempotence: N/A — the eventual package ships a pure projection change,
      no command and no write outside the repo.

## Verification steps (run these; paste output in the PR)

N/A — stub; no verification commands until the design round.

## Out of scope (do NOT do these)

- **The interim assistant replies** (question 2): recorded, not decided.
- **Routine prompts** (row H2): the Done spec's ruling stands.
- **The first-pass novelty finding** — its own candidate package,
  `docs/specs/WP-dream-first-pass-novelty.md`.
- **Any model call or relevance stage** — the superseded
  `docs/specs/done/WP-dream-primary-dialogue-filter.md`.
- **Codex rollouts** — row A3/A4 already decides them structurally.

## Definition of done

**Not yet written.** This stub is complete when the architect replaces it with
a full spec: a design round first, then a Deliverables table, the canonical
Table H, acceptance criteria, RED declarations and literal verification
commands. **It stays `status: Draft`** and does not move to `Ready` until it has
been through the double gate (`docs/runbooks/codex-review.md` plus
wd-reviewer). Only the architect or the owner flips it.
