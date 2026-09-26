---
id: WP-dream-projection-harness-user-records
title: Keep harness-authored Claude user records out of the primary dialogue — design recorded, one product question to the owner
status: Draft
model: opus
size: S
depends_on: [WP-dream-primary-dialogue-projection]
adrs: [ADR-0004, ADR-0023, ADR-0031, ADR-0042]
epic: dream-primary-dialogue
---

# WP-dream-projection-harness-user-records: Keep harness-authored Claude user records out of the primary dialogue — design recorded, one product question to the owner

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **CANDIDATE 0 — NOT DISPATCHABLE UNTIL THE OWNER ANSWERS ONE QUESTION.**
> Re-cut on 2026-09-26 under the stop criterion pinned before the design
> gate's round 1, after the Table G circuit-breaker pinned before revision 2
> (`950aaab7`) fired at round 3 (§0 rule 1). The design round, its three
> external rounds and every measurement are in
> `docs/specs/logbook/2026-09-26-projection-harness-user-records-design-review.md`
> (**the round record**); §7 there records why a fourth patch was refused.
> **This package builds nothing.** It records what three rounds converged on —
> Table H, the predicate, which is sound and measured; Table G, the safety
> net it needs, which is not closable inside the projection and the collector
> alone — and puts one product question to the owner (the section of that
> name). The last complete implementable draft is the spec at `f051e24a`; a
> successor package for option (i) or (ii) starts from it and from the round
> record, not from this file. Written against `main` at `8117e221`.

## Context (read this, nothing else)

**Wienerdog is just files (ADR-0004).** The nightly **dream** reads recent
session **transcripts**, writes a bounded extract of each into a private
scratch directory, and asks one consolidation pass to update a private copy of
the user's **vault**. Since `WP-dream-primary-dialogue-projection` (Done,
merged as PR #266) the extract holds only **primary dialogue**. That package's contract
says, at `docs/specs/done/WP-dream-primary-dialogue-projection.md:146-150`,
*"Harness-authored and developer-authored instructions are not dialogue"* —
but its Claude acceptance rule, row A2 (`:458`), accepts every `user` record
without `isMeta` or `isSidechain` whose `message.role` is `"user"`, so records
Claude Code writes itself reach the dream as the person's words, flagged
`derived_from_untrusted: false`.

**The gap, measured** (the round record §2.3; the owner's whole local corpus,
334 Claude files, Claude Code 2.1.232–2.1.283; counts only, no text read):
1,103 task notifications (4,682,631 characters before the per-message cap),
134 slash-command echoes, 8 `!`-command records and 9 compaction or
interruption records are accepted as the person's words, beside 705 real
prompts (240,048 characters). On the filter's offline evaluation sample the
same records were 16.4 % of the projected text
(`docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`,
"What the low-value volume is made of"). That evaluation found the
notification and interim-status blocks *"left no trace in the notes"*, and
attributed all five harm instances it did find to three machine-authored
(`claude -p`) sessions — records the designed rule keeps. **So the measured
cost of the gap is input volume and one provenance path — a subagent's
result, which may restate external content, reaching the dream flagged as the
person's words — and not an observed error in a note.**

**What three rounds established** (the round record §7):

1. **The predicate is sound.** Claude Code writes two top-level source fields
   on every `user` record, `promptSource` and `origin`. A closed accept-set
   over them (Table H below) separates every harness class from every prompt
   on the corpus, changes no assistant message or flag (a digest over all
   1,983 replies is identical), and — because it compares harness-declared
   fields by exact equality and never reads text — is not the content
   heuristic the Done spec ruled out.
2. **The rule needs a safety net, and the net is not closable inside the
   projection and the collector alone.** The fields are undocumented; a
   Claude Code release that renames them would make the rule decline every
   request, and a session consumed without its requests is marked processed
   and never read again. Revision 1 halted the run (defeated by one
   recognised session in the same night); revision 2 set sessions aside as a
   quarantine keyed on the raw timeline's user role (blind to an array-content
   request, which the raw parser never emits as `user` — round 3). A net that
   sees every declined request needs a text-free request indicator carried
   from the parser; a net that recovers what it set aside needs a one-time
   retry that a later release must remember to ship, which no code enforces.
3. **The same replies-without-requests failure is already shipped on the
   Codex arm, with no net.** 240 of 408 local Codex rollouts — every one
   written by Codex 0.144.1–0.147.0, whose user messages carry no
   `content_item_kinds` — project replies with no request, because row A3
   declines them (§2.8). All 240 are marked processed on this install's
   ledger, 238 of them on 2026-09-20/21, after the projection reached the
   collector in the repository (2026-09-18); whether the installed version
   then already carried it is not recorded, so their requests were most
   likely consumed as replies alone. Rollouts from Codex 0.151.0 onward carry
   the field.

## Current state

Nothing is changed by this package. The facts the owner's question rests on,
each re-derived at `8117e221` and checked at both ends in the round record §3:

- `src/core/transcripts/primary-dialogue.js:179-202` is `acceptClaude` (rows
  A2/A4); its user half is `:183-193`. Table H would sit between `:185` and
  `:186`, before the content is read.
- `src/core/dream/scratch.js:77-264` is the collector; its per-candidate
  quarantine arm is `:188-191`. `src/core/transcripts/claude.js:153-171`, the
  raw parser's array-content branch, emits only `tool_result` messages.
- `src/core/dream/ledger.js`, `warnings.js` and `src/cli/doctor.js` carry the
  quarantine reasons and their surfaces; `reports/warnings.md` and `doctor`
  list quarantines only, never deferrals.
- `docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md`
  Amendment 4 is the one-time retry mechanism for a quarantine reason whose
  cause is our own code.
- The measurement script
  `docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js`
  (counts only) runs the tree's own parser and projection over a local
  transcript set and exits 1 when a file would be set aside under the recorded
  Table G.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

N/A — candidate 0 builds nothing and changes no file outside this spec and
the logbook, both always allowed. **No test is kept.** The pin allowed one
test pinning today's acceptance of a harness-authored record as dialogue; it
is not written, because it would assert as expected behaviour the exact
contract violation the Done spec's `:150` sentence rules out, and every
option (i) or (ii) successor would have to delete it first. The residual is
recorded instead by the errata routed under Out of scope.

### Exact contracts

N/A — nothing is built. The recorded design below, and the last complete
contract at `f051e24a`, are the inputs to whichever successor the owner
chooses.

## Contract reference (optional — mark N/A if this WP is not contract-dense)

N/A as a contract — candidate 0 decides no fact. Tables H and G are kept
below as **RECORDED DESIGN**: what three external rounds converged on, with
the round-3 gap written into G1. A successor re-opens them as contracts under
its own design gate.

### Contract table(s)

#### Table H — which Claude `user` records are dialogue (RECORDED DESIGN — sound)

Applies to a Claude record row A2's existing user-half gates already accept.
The predicate reads two top-level fields, `obj.promptSource` and
`obj.origin`, by exact equality against a code-owned set, and no content;
steps 2–3 of row A5e still validate and scan every record's blocks first. It
enumerates what is accepted.

| Row | The record's own top-level fields | Outcome |
|-----|-----------------------------------|---------|
| H1 | `promptSource` is exactly `"typed"`, `"queued"` or `"suggestion_accepted"` (`origin` is not read) | ACCEPT — the person's prompt |
| H2 | `promptSource` is exactly `"sdk"` **and** the record has no `origin` key | ACCEPT — a `claude -p` prompt (the 101 `sdk` task notifications carry an `origin`) |
| H3 | every other state | DECLINE at row A5e step 4: no message, and no taint added by the decline; any taint steps 2–3 set on the record stays (round 1, R1-2) |

Evidence on the corpus (round record §2.3), counts of records row A2 accepts
today: H1 411 / 8 / 29; H2 257; declined — 1,002 `system` and 101 `sdk` task
notifications, 132 command echoes, 8 `!`-command records, 9 compaction or
interruption records, 2 slash-command echoes with `origin.kind: "human"`. No
record with `promptSource` `"typed"`, `"queued"` or `"suggestion_accepted"`
is lost; every accepted record without `promptSource` is a harness kind.

#### Table G — the safety net (RECORDED DESIGN — NOT closed)

| Row | Revision 2's rule | State after round 3 |
|-----|-------------------|---------------------|
| G1 | Trigger: a Claude session whose projection has a reply and no user message, while its raw timeline has a `user`-role message | **OPEN (R3-1, band A).** The raw parser emits a `user` message only for string content; an array-content request (text beside an image) declined by Table H leaves no trace in the raw roles, so the session is admitted and marked processed. Closing it needs a text-free "request-shaped record present" indicator carried out of the parser path — through `parsePrimaryWithOutcome`'s return shape (a change to the Done projection spec's Table B) — which no round has reviewed |
| G2 | Disposition: quarantine with the new reason `no-request`, per session, before capacity is charged | sound in rounds 2–3 (R2-1, R2-3 closed) |
| G3 | Recording: the existing quarantine path in `dream.js`, unchanged | sound (R2-2 closed) |
| G4 | Lifecycle: skipped until the file changes; a later release that changes Table H retries `no-request` records once under an ADR-0023 Amendment 4 marker | **binding enforced by no code** — only Amendment 5's words |
| G5 | Surfaces: console, dream report, `reports/warnings.md` (own heading), `doctor` (own row), digest banner (INFORMATIONAL) | sound |
| G6 | Scope: Claude only; Codex not counted | leaves the Codex arm, which already loses requests (§2.8), without a net |

On the corpus, revision 2's trigger fires on 0 of 321 Claude files with a
reply today and on 321 of 321 when every user record is declined (round
record §2.7, §2.9).

#### ADR-0023 Amendment 5 — DRAFT, attached to option (i) (and to option (ii)'s first package)

Not applied by this package. Status to be set by the owner's ruling.

```text
### Amendment 5 (<DATE>) — a session the dream would read without any of the person's messages is set aside, under a reason whose cause may be our own code

Status: **<STATUS — set by the owner's ruling on WP-dream-projection-harness-user-records>**

**The case.** The primary-dialogue projection accepts a Claude `user` record as the person's words only when the harness's own source fields say so. If a Claude Code release renames or drops those fields, every request is declined, and the dream would receive replies with no request — and a session the dream consumes is marked processed and never read again, so the loss would be permanent.

**The decision.** The collector sets such a session aside instead of admitting it: a session whose projected dialogue holds a reply and no user message, while the parser saw a request-shaped record that the accept rule declined, is quarantined with the new reason `no-request`. This supersedes the "no new quarantine reason" of Amendments 3 and 4 for this one reason. In every other respect it is an ordinary quarantine: skipped until the file changes, listed in `reports/warnings.md`, counted by `wienerdog doctor`, and INFORMATIONAL under Amendment 2 — one stray session must not pin a warning forever, while a harness change that sets sessions aside every night keeps the sentence fresh.

**Its cause may be our own code, so Amendment 4 applies to it.** A release that changes the accept rule ships, with the change, a one-time retry of every `no-request` record under a marker of its own, exactly as Amendment 4 retried `parse-threw`. Amendments 1–4 remain in force. No command, flag, runtime dependency or daemon is introduced. ADR-0004 remains intact.
```

### Mirrored Surface Checklist

N/A — no canonical table is decided here. The recorded tables' mirrors, as
registered at `f051e24a`, travel with the successor.

## Implementation notes & constraints

N/A — nothing is implemented. For a successor: the last complete contract
(Deliverables, sweeps S1–S5, acceptance criteria, verification commands, the
Done-spec errata blocks) is the spec at `f051e24a`; the nine RED shapes that
contract declared were run `PROVEN` on a simulated tree (round record §4.4);
41 existing projection and collection tests, 4 pipeline tests and 1 ledger
test depend on fixtures a field-keyed rule must sweep.

## Security checklist (delete only if the WP touches no untrusted input)

N/A — this package touches no code and reads no input. The provenance path
the owner's question weighs (subagent output reaching the dream flagged
`false`) is stated in Context and priced in the question.

## Acceptance criteria

- [ ] The owner has answered the product question below, and the answer is
      recorded in a dated logbook entry.
- [ ] Idempotence: `N/A` — candidate 0 builds nothing.

## Verification steps (run these; paste output in the PR)

Nothing is built, so there is nothing to verify. The one runnable evidence
refresh the owner may ask for (counts only, no text, no path):

```bash
node docs/specs/logbook/2026-09-26-projection-harness-user-records-measure.js --days 5
npm run lint
```

## Out of scope (do NOT do these)

- **Any `src/` change** — the owner decides first.
- **Errata 8 and 9 against the Done projection spec**, routed as findings: a
  **separate S docs package**, filed by the architect after the owner answers,
  because Erratum 7's wording (the `:150` sentence "enforced from <date>"
  versus "not true of Claude harness records — a recorded gap") depends on the
  answer. What is true today whatever the answer: **Erratum 8** — the Done
  spec's "no field can tell a `claude -p` routine prompt from a human one"
  (`:562-563`, row A5b `:462`) was measured on field names; the
  `promptSource` value distinguishes them on Claude Code 2.1.232–2.1.283.
  **Erratum 9** — its literal worked example's third record (a `tool_result`
  and the person's text in one record) occurs in 0 of 11,884 array-valued
  `user` records on the corpus. If the owner wants the true-today part sooner,
  Erratum 8 can land alone now.
- **The Codex arm's pre-0.151 rollouts** (§2.8): routed as its own candidate
  package; option (ii) below would cover it.
- **The interim assistant replies**: both positional rules the evaluation
  tried were measured unsafe; no structural rule for them is known.

## Dispatch precondition — the owner's product question

**Citations.** Written against `main` at `8117e221`; re-run every `file:line`
citation, at both ends, before any successor is dispatched
(`docs/runbooks/codex-review.md`, "Dispatch-time re-verification").

**One question, for the owner to decide.** The architect's recommendation and
the cost of overruling it follow; nothing in this document ratifies an answer.

> **Harness-authored Claude records — task notifications, command echoes,
> compaction summaries — reach the dream today as your own words. A rule that
> keys on Claude Code's own source fields removes them exactly, but it needs a
> safety net against Claude Code changing those fields, and three design rounds
> showed that net needs a change to the transcript parser and a retry promise
> that no code enforces. Which do you want?**
>
> **(i) Build the rule and its net together.** One package, size M at its top:
> six source files (the five of revision 2 — `primary-dialogue.js`,
> `scratch.js`, `ledger.js`, `warnings.js`, `doctor.js` — plus the carrier of a
> text-free request indicator, `src/core/transcripts/index.js` — or
> `claude.js`, if the next design round decides the raw parser should compute
> it — with a change to the Done projection spec's return-shape Table B),
> about thirty
> Deliverables rows, ADR-0023 Amendment 5, and the one-time-retry binding on
> every later change to the rule. The indicator is a fourth net design no round
> has reviewed, so it starts a fresh design gate. Removes the 16.4 % of input
> volume and the provenance path. The Codex arm stays without a net.
>
> **(ii) Build the net first, on both harnesses, then the rule.** Package 1
> (size M): the `no-request` set-aside with the request indicator, its reason
> and surfaces, and Amendment 5, for Claude **and** Codex — inert on Claude
> today (0 of 321); a Codex trigger of the same shape would set aside a
> rollout like the 240 pre-0.151 ones instead of consuming it (all 240 are
> already consumed on this install, so it protects the next such file, not
> those). Package 2 (size S):
> Table H, its fixture sweeps and the Done-spec errata, depending on package
> 1. Two design gates; the net is reviewed and landed before the rule that
> needs it; same retry binding as (i).
>
> **(iii) Build nothing.** Harness records keep reaching the dream as your
> words: 16.4 % of the evaluation sample's text, and every subagent's result
> flagged as yours. The evaluation found no note error caused by these records
> (the notification blocks "left no trace"; all five harm instances came from
> `claude -p` sessions, which the rule would keep). No drift risk arises,
> because no field-keyed rule is added. The Done spec's `:150` sentence stays
> false and is corrected by the docs package. The Codex arm stays without a
> net.

**Architect's recommendation: (iii) now, and put the one non-volume risk — a
subagent's result reaching the dream flagged as your words — to a separate,
narrower design.** Reasons, from the round evidence: the measured harm of the
gap is volume, not note quality; both build options carry a part that is
either unreviewed (the request indicator) or unenforceable (the retry
binding); and the provenance risk does not need Table H at all. It can be
closed by flagging, rather than declining, the records Claude Code positively
labels as task notifications (`origin.kind: "task-notification"`) as
`derived_from_untrusted: true` — a rule that, if Claude Code renames the
field, falls back to exactly today's behaviour instead of losing requests, so
it needs no net. **That alternative has had no design round**; it is named
here so the owner can commission it, not as a decided design. (It amends the
Done spec's row A5(a), whose owner item 3 priced tainting user messages in
general; this would taint one positively labelled class.)

**Cost of overruling the recommendation.** Choosing **(i)** or **(ii)** buys
the 16.4 % volume reduction and closes the provenance path by removal, at a
size-M package (two packages for (ii)), a fresh design gate on an unreviewed
net, a transcript-parser change, a new quarantine reason and an ADR amendment,
and a retry obligation every future change to the rule must remember. **(ii)**
additionally puts a net on the Codex arm, the only arm where the failure has
already happened. Choosing **(iii) without** commissioning the narrower design
leaves every subagent's result reaching the dream flagged as your words — the
one part of this gap that could matter for identity and skills notes, whose
writes require `derived_from_untrusted: false`.

## Definition of done

1. The owner's answer is recorded in a dated logbook entry, verbatim.
2. The architect then files what the answer calls for — the successor
   package(s) from `f051e24a` and the round record, or the narrower
   provenance design, and in every case the Done-spec docs package — and
   marks this spec `Superseded` with a pointer, in the same pass.
3. No PR is opened for this spec on its own: it builds nothing.
