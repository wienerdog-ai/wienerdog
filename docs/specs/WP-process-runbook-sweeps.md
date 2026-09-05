---
id: WP-process-runbook-sweeps
title: Codify the paid-for review and sweep disciplines into the runbooks
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0031]
epic: spec-system
---

# WP-process-runbook-sweeps: Codify the paid-for review and sweep disciplines into the runbooks

## Context (read this, nothing else)

Wienerdog is an open-source tool that writes configuration files into a user's
AI CLI setup. **Wienerdog is just files (ADR-0004): no daemons, no servers, no
telemetry.** This work package is **docs-only** — it edits five process
documents and touches no product code at all.

How work happens here: an architect writes a **work package (WP)** spec in
`docs/specs/`; a design-review loop runs adversarial rounds against it; the spec
moves to `Ready`; a fresh implementer session builds exactly that spec; two
review gates run on the PR. The rules governing that pipeline live in exactly
five files, and those five are the only ones this WP may edit:
`docs/runbooks/codex-review.md` (the review-round contract),
`docs/runbooks/spec-authoring.md` (how a spec is written),
`docs/specs/_TEMPLATE.md` (the skeleton every spec is copied from), and the two
agent duty files `.claude/agents/wd-architect.md` and
`.claude/agents/wd-reviewer.md`.

During the 2026-07 → 2026-09 audit-remediation program a set of working
disciplines was **paid for by real failures** — false greens, a voided review
round, a spec that shipped still carrying the wrong `status:` line, three
"passing" mutation cells whose mutations had never been applied. Those lessons
live as bullets in `memory/lessons/inbox.md` and a summary in
`docs/HANDOVER.md`; both are **records, not process** — nobody reads them before
a review round, and nothing checks them. This WP moves the durable ones into the
five files above, **each into the file where it operationally binds**. The raw
bullets are then retired by the nightly dream job's consolidation; **this WP does
not edit `memory/lessons/inbox.md`** (CLAUDE.md forbids a WP branch from touching
it).

**The central constraint is that most of these rules are already bound, in whole
or in part.** `spec-authoring.md:47-50` states that a fact is stated once, in the
surface that owns it, and every other surface cites the owner rather than
restating it. `codex-review.md:65-69` states that every addition to the system
itself — a new rule, a document, a gate, a process step — earns its place by the
value it protects, named at the moment of adding, or it is not added. So the work
here is **not** "add thirteen rules": it is to measure what each rule's target
file already says, land only the delta, and land most of that delta by
**extending an existing sentence** rather than adding a new one. **Table A** is
the measurement; **Table B** is the delta. Both are this spec's canonical sources
— every other statement in this spec defers to them.

## Current state

Nothing about this WP's content exists yet as a landed rule; the five target
files exist and are the current process. The measurement behind Table A was run
on `98a8b49a` (`origin/main`) and its raw output is pasted in
`docs/specs/logbook/2026-09-05-process-runbook-sweeps-design-gate-rounds.md`.

The five files this WP edits, with the passages Table B names (each range below
was checked mechanically at both ends):

- `docs/runbooks/codex-review.md` (406 lines). Its "Finding disposition" section
  runs `:35-100` and carries 11 top-level bullets, among them the
  two-consecutive-rounds bullet at `:70-71` and the STOP CRITERION bullet at
  `:72-81`; its "Rules" section runs `:328-399` and carries 11. The other
  passages Table B names: item 2 of "When it runs" at `:14-17` (both gates run,
  and the owner merges only when both are clean); the both-ends range check at
  `:133-138` inside "Internal coherence pass"; the read-only
  `git status --porcelain` bullet at `:296-298`; the claim-to-be-RUN bullet at
  `:358-367`; the both-directions bullet at `:368-375`; the ADR-0031
  circuit-breaker at `:376-383`; and the exit-code bullet at `:384-390`, ending
  "read the VALUE the tool produced, not the value the pipeline last touched".
- `docs/runbooks/spec-authoring.md` (75 lines). The intra-cell re-read bullet at
  `:51-55`; the claim-sweep bullet at `:56-63` (claim-not-wording, family-wide,
  whitespace-flattened).
- `docs/specs/_TEMPLATE.md` (146 lines). The Mirrored Surface Checklist section
  at `:86-97`; its intro sentence at `:88-91` says a review finding "updates the
  table and all its mirrors **in one pass**".
- `.claude/agents/wd-architect.md` (27 lines). A `Rules:` list at `:16-23`.
- `.claude/agents/wd-reviewer.md` (21 lines). A single-paragraph
  "Contract-density detector (ADR-0031)" at `:21`.

Two toolchain facts bound the verification. `npm run lint` runs markdownlint over
`docs/**/*.md` and `*.md` **but not** over `.claude/`, plus a frontmatter check
over 268 specs and 4 agent files — agent *frontmatter* only, bodies unchecked.
`AGENTS.md` is generated from `CLAUDE.md`, not from the agent duty files, so
editing an agent duty file does not desynchronize it.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec
     file itself, package-lock.json, memory/lessons/inbox.md, and
     docs/specs/logbook/. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/runbooks/codex-review.md | land the rules Table B assigns to this file (R01–R07, R11–R13, R16–R18), exactly as Table B specifies: insertion point, mode, anchor literals |
| modify | docs/runbooks/spec-authoring.md | land rule R08 per Table B |
| modify | docs/specs/_TEMPLATE.md | land rule R09 per Table B |
| modify | .claude/agents/wd-architect.md | land rule R14 per Table B |
| modify | .claude/agents/wd-reviewer.md | land rule R15 per Table B |

### Exact contracts

This WP ships no code, no command and no schema. Its entire contract is Tables A
and B below, plus this rule, which governs how every landed sentence is written:

> **Operative, not aspirational.** Each landed rule must be a statement a reader
> can check they followed — it names an action, an artifact, or a line in a
> record. "Be careful about X" is a rewrite failure; "X is stated in the round
> record before round 1" is operative. Each landed rule also carries a one-line
> **paid-for-by provenance** naming its source: an inbox bullet's `WP-` prefix,
> or the `docs/HANDOVER.md` line. The provenance may be a parenthetical inside
> the sentence; it does not need a line of its own.

## Contract reference

Activation (ADR-0031, 2-of-7): **(vi)** multiple downstream consumers inherit
this contract — every design-gate round of this WP, the two clean-context
executors and the implementer all read the same rule set; and **(vii)** the same
per-rule facts must appear in mirrored surfaces (Deliverables cells, acceptance
criteria, verification sentinels). Two conditions are true, so the discipline is
on.

### Table A — rule disposition (canonical)

The **unit is one atomic rule**, not one stub bullet: four of the thirteen
bullets this WP was drafted from are compounds whose clauses measured
differently, so they expand here. "Already binds at" cites the operative text
that states the rule *today*; where that cell is `—`, a mechanical
whitespace-flattened sweep of all 18 process surfaces returned zero hits (run
pasted in the round-zero record). `inbox` means `memory/lessons/inbox.md`.

| # | Rule (atomic) | Disposition | Already binds at | Paid for by |
|---|---------------|-------------|------------------|-------------|
| R01 | The proof of a fix is the re-grep/re-run, never the edit; report what the tool printed | PARTIAL | `codex-review.md:358-367` binds it for claims about **tool behaviour** only; `:122-132` for **acceptance criteria** only | `docs/HANDOVER.md:342-343` |
| R02 | Read the tool's own summary; never substitute your own recount of its output | PARTIAL | `codex-review.md:384-390` ends with the general form ("read the VALUE the tool produced, not the value the pipeline last touched"), but is about `$?` being clobbered | `inbox` WP-dream-promote-in-workspace; `docs/HANDOVER.md:344` |
| R03 | A `+0` test delta on a test that dies before your change proves nothing — check where it dies | UNBOUND | — | `docs/HANDOVER.md:345-346` |
| R04 | `+0/−0` beside a claimed content change is a failure signature; prove the commit, not the working tree | UNBOUND | — | `inbox` WP-dream-promote-in-workspace (3rd occurrence: PRs #19, #24, #61) and WP-launcher-no-self-resync-republish; `docs/HANDOVER.md:347-349` |
| R05 | Prove a mutation was applied (grep the injected marker) before believing its matrix | UNBOUND | — | `inbox` WP-dream-promote-in-workspace; `docs/HANDOVER.md:350-351` |
| R06 | A guard must notice its own death | UNBOUND | — | `docs/HANDOVER.md:351` only — no inbox bullet states this rule (measured) |
| R07 | A canary that differs from the exploit by arity proves nothing | UNBOUND | — | `inbox` WP-dream-promote-in-workspace and WP-show-slot-own-value-kind (two payments) |
| R08 | A claim sweep is pronoun-aware, and a claim's scope citation sits adjacent to the claim | PARTIAL | `spec-authoring.md:56-63` binds claim-not-wording, family-wide and whitespace-flattened; neither clause here | `inbox` WP-dream-promote-in-workspace; `docs/HANDOVER.md:362-363` |
| R09 | Whichever copy of a registered mirror pair moves, the other moves in the same commit | PARTIAL | `_TEMPLATE.md:88-91` and ADR-0031 bind "in one pass"; nothing binds commit-level atomicity | `inbox` WP-dream-promote-in-workspace |
| R10 | Two consecutive rounds on one contract family → contract extraction, never a third patch | **ALREADY BOUND — this WP does nothing** | `codex-review.md:376-383` (operative and complete); `.claude/agents/wd-reviewer.md:21` | ADR-0031 (its rounds 7–8); `docs/HANDOVER.md:359-361` |
| R11 | Every review round's findings carry a materiality band, A/B/C as Table B defines them | UNBOUND | — | `docs/HANDOVER.md:364-366` |
| R12 | The pinned criterion maps each materiality band to an outcome | PARTIAL | `codex-review.md:72-81` already binds the **pinning** half operatively: a STOP CRITERION in the round record BEFORE the first adversarial round, stating "which outcome closes the loop, and which outcome escalates". The missing delta is the band→outcome mapping | `docs/HANDOVER.md:371-372` |
| R13 | Separate form insufficiency from a predicate defect before reopening a loop as design | UNBOUND | — | `inbox` WP-dream-promote-in-workspace; `docs/HANDOVER.md:355-358` |
| R14 | Enumerate your own good, not the bad, wherever the grammar is not yours | UNBOUND | — | `inbox` WP-dream-promote-in-workspace, WP-scheduler-mutation-home-authority, WP-audit-d-code-derived-recipients (three payments) |
| R15 | A reviewer judges the whole cell, never the grep window that matched | PARTIAL | `spec-authoring.md:51-55` binds the **author's** post-rewrite intra-cell re-read; nothing binds the **reviewer's** read | `inbox` quarantine-surface (names wd-reviewer, PR #33) |
| R16 | Follow a citation by grepping the cited text; the line number only disambiguates | PARTIAL | `codex-review.md:133-138` checks a cited range at both ends when it is **written**; `:185-190` re-runs line-number citations at **dispatch**; nothing governs **reading** one | `inbox` WP-quarantine-banner-location and WP-index-guard-residuals; `docs/HANDOVER.md:298` |
| R17 | The tip is frozen for a round: nothing writes into a worktree a gate is reading | PARTIAL | `codex-review.md:296-298` binds the **reviewer** not to mutate the checkout; nothing binds anyone else | `inbox` WP-quarantine-banner-location (a round-4 verdict voided by one untracked file) and WP-dream-promote-in-workspace |
| R18 | Both gates run on the same tip, and each verdict names the tip it ran on | PARTIAL | `codex-review.md:14-17` binds that both run, and calls Codex "an independent second opinion on the **same diff**"; it binds neither one tip nor a verdict that names it | `docs/HANDOVER.md:370-371` |
| R19 | Declined owner grants surface loudly | **UNPAID — not landed** | the id-aligned re-derivation returns one hit, `gws-broker.md` on the capability broker refusing to send and telling you to re-grant — a **product** behaviour, not a review-round rule, so it binds nothing here | **none**: a sweep of `inbox` and `docs/HANDOVER.md` for this claim returned zero hits (round-zero and round-1 records). See Out of scope and owner item O4 |

### Table B — landing contract (canonical)

One row per rule Table A marks PARTIAL or UNBOUND. **Insertion point** names the
existing construct; **mode** is `EXTEND` (add clauses to that construct — it
keeps its current meaning and gains the delta) or `NEW` (a new bullet immediately
after it). **Anchor literals** must appear byte-exact in the named file; the
implementer writes the sentence around them.

| # | File | Insertion point · mode | Operative content the landed text must carry | Anchor literals (byte-exact) |
|---|------|------------------------|----------------------------------------------|------------------------------|
| R01 | codex-review.md | `:358-367` claim-to-be-RUN bullet · EXTEND | The same rule covers a claim that a fix landed: the re-grep or re-run is the proof and the edit is not; report the tool's printed output | `the proof of a fix is the re-run` |
| R02 | codex-review.md | `:384-390` exit-code bullet · EXTEND | Its general form also forbids recounting output the tool already summarized; take the tool's own figure | `not your own recount` |
| R03 | codex-review.md | after `:390` (end of the exit-code bullet) · NEW bullet | A zero can report where the run stopped rather than what changed: a `+0` test delta from a test that died before reaching your change proves nothing | `dies relative to what you touched` |
| R04 | codex-review.md | the same NEW bullet as R03 | `+0/−0` beside a claimed content change is that same shape in git: read the committed blob, not the worktree | `prove the commit, not the working tree` |
| R05 | codex-review.md | after `:375` (end of the both-directions bullet) · NEW bullet | A mutation matrix is evidence only once each cell proves its own mutation reached the code under test | `grep the injected marker` |
| R06 | codex-review.md | the same NEW bullet as R05 | A guard that has stopped guarding must fail, not pass silently | `notice its own death` |
| R07 | codex-review.md | the same NEW bullet as R05 | A canary whose argument count differs from the exploit's dies on shape before reaching the slot under test | `arity proves nothing` |
| R08 | spec-authoring.md | `:56-63` claim-sweep bullet · EXTEND | The sweep pattern must also match the claim stated pronominally, and a claim's scope must be written next to the claim so one pattern catches both | `pronoun-aware` · `adjacent to the claim` |
| R09 | _TEMPLATE.md | `:88-91` checklist intro · EXTEND | "In one pass" is made concrete: the canonical table and every registered mirror land in one commit, so no commit exists in which they disagree | `in the same commit` |
| R11 | codex-review.md | before `:37` (head of Finding disposition's bullet list) · NEW bullet | Every finding carries a band beside its disposition — **A**: silent wrong behavior with a data-loss or security consequence; **B**: caught downstream; **C**: hygiene. A round reported as counts without bands is not decision-grade. The band grades the finding's CONSEQUENCE and is orthogonal to LIGHT/HEAVY (`:140-152`), which grades its FIX; R12 binds the criterion that uses both | `materiality band` · `C: hygiene` |
| R12 | codex-review.md | `:72-81` STOP CRITERION bullet · EXTEND | The pinned criterion must map each materiality band to an outcome. Reconcile the two taxonomies in place: **A/B/C bands grade a finding's CONSEQUENCE**; **LIGHT/HEAVY (`:140-152`) grades whether its FIX changes the product**, and therefore whether a fresh round is owed. They are orthogonal, and a pinned criterion names its outcomes in terms of both | `maps each band to an outcome` |
| R13 | codex-review.md | after `:71` (end of the two-consecutive-rounds bullet) · NEW bullet | **The bullet must OPEN by naming the precedence**, because it sits under an unconditional rule: this distinction routes a SINGLE finding and never suspends the repeat rules — two consecutive rounds on the same kind still escalate under `:70-71`, and two on the same contract family still fire the ADR-0031 breaker at `:376-383`, however each finding was classified. Within one finding: form insufficiency = the deciding facts never reach the observation point, and reopens as design; a predicate defect = the facts are there and the question is wrong, and is a fix | `never suspends the repeat rules` · `form insufficiency` · `predicate defect` |
| R14 | wd-architect.md | after `:23` (end of the `Rules:` list) · NEW rule line | When designing any guard, allowlist or acceptance check over a grammar that is not ours, enumerate our own intended objects rather than the forbidden ones; a forbidden-set enumeration cannot be closed | `enumerate your own good` |
| R15 | wd-reviewer.md | `:21` contract-density paragraph · EXTEND | Judge the whole cell, never the grep window a mirror walk matched: a grep is blind to intra-cell falsification and to a restatement in different vocabulary | `the whole cell, never the grep window` |
| R16 | codex-review.md | `:133-138` both-ends range bullet · EXTEND | When *following* a citation, grep for the cited text; a line number is trustworthy for existence, not for position, and serves only to disambiguate multiple hits | `grep for the cited text` |
| R17 | codex-review.md | `:296-298` read-only bullet · EXTEND | The obligation is symmetric: while a gate is reading a worktree, nothing else writes into it — one untracked file voids the verdict, however clean the diff | `nothing writes into a worktree a gate is reading` |
| R18 | codex-review.md | `:14-17` item 2 · EXTEND | Both gates run on one tip and each verdict names that tip; two verdicts on different trees are not two verdicts on the same work | `on the same tip` |

### Mirrored Surface Checklist

Every surface below mirrors Table A or Table B and **defers** to it. A finding
that changes a table row updates every surface named here in the same commit
(update-all-mirrors); a new mirror found in review is added to this list on the
spot (register-new-mirrors).

- [ ] Deliverables-table cells — each `modify` row's Notes names the rule ids
      landing in that file; Table B's File column decides which
- [ ] Acceptance criteria — the anchor-literal criterion quantifies over Table B;
      the untouched-text criterion covers BOTH Table A's ALREADY BOUND row (R10)
      and the pre-existing bound anchors of two PARTIAL rows, which are also
      Table B insertion points (R16's `A cited RANGE is checked at BOTH ends`,
      R15's `Contract-density detector (ADR-0031)`)
- [ ] Verification steps — the DATA block is one line per Table B anchor literal,
      in Table B's order, and `DECLARED` equals that count
- [ ] **The screen's own description**, which is restated in five places and must
      move together: the Verification-steps prose, the script's header comment,
      Implementation notes ("why the anchor literals are pinned"), the
      anchor-literal acceptance criterion, and Definition of done item 1
- [ ] Current-state description — the passages Table B's Insertion-point column
      names, and their line ranges
- [ ] Out of scope — Table A's ALREADY BOUND (R10) and UNPAID (R19) rows
- [ ] Implementation notes and owner items O1–O4 — they mirror Table B's File
      column for R14 (O1) and R15 (O2), and Table A's disposition for R19 (O4);
      **O3 additionally restates Table A's whole PARTIAL/ALREADY-BOUND list**
      ("R10 entirely, and the bound halves of R01, R02, R08, R09, R15–R18"), so a
      disposition change moves that sentence too

## Implementation notes & constraints

- **Docs-only.** No file under `src/`, `tests/`, `scripts/` or `bin/` is touched.
  No new npm dependency, no new command, no scheduled job — Wienerdog is just
  files (ADR-0004), and this WP does not even ship a file.
- **No new runbook file.** Every rule lands in a file that already owns its
  subject, so no new document is created. A new document would itself be an
  addition that must name the value it protects (`codex-review.md:65-69`), and
  none of these rules needs a home the five existing files cannot give it.
- **The aggregate question, faced.** `codex-review.md:65-69` requires the
  aggregate cost of an addition to be weighed, not only each addition alone.
  Aggregate here: seventeen rules land through **fourteen edit points** — nine
  EXTEND an existing construct and five add one. `codex-review.md` gains **four**
  new bullets (Rules +2, Finding disposition +2) on top of the 11 and 11 it
  already carries; `wd-architect.md` gains one rule line; `wd-reviewer.md`,
  `spec-authoring.md` and `_TEMPLATE.md` gain no new construct at all. Each
  rule's protected value is its Table A "Paid for by" cell — a real failure, and
  for five rules a repeat one.
- **Why the anchor literals are pinned, and what that buys.** Normally a spec
  states the contract and leaves the words to the implementer
  (`spec-authoring.md:7-14`). Here the words *are* the deliverable, and an
  unpinned sentence cannot be checked mechanically. One short literal per clause
  is the minimum that makes a check runnable; the surrounding sentence stays the
  implementer's. **What it buys is presence, not correctness**: the screen in
  Verification steps confirms each anchor landed in the committed file and is
  blind to meaning, placement and polarity — an inverted sentence carrying an
  anchor passes it (measured, round 1). The rules themselves are certified by the
  reviewer's whole-construct read against Table B.
- **Placement principle** (used to fill Table B's File column; stated once, here):
  a rule binds in the file whose reader must act on it. Round conduct →
  `codex-review.md`; how a spec is written → `spec-authoring.md`; what every new
  spec inherits → `_TEMPLATE.md`; what one agent must do that no orchestrator can
  do for it → that agent's duty file.
- **ADR-0031 is not amended.** R09 makes `_TEMPLATE.md` say "in one pass **and in
  the same commit**". ADR-0031 says "in one pass"; one commit satisfies one pass,
  so this is a strictly stronger operationalization, not a contradiction, and it
  needs no owner-signed ADR amendment.
- **R19 has no acceptance criterion, deliberately (round-zero finding X7).** An
  earlier criterion asserted that R19 "does not appear as a landed rule in any of
  the five files" and supplied no runnable form, which is itself a round-zero
  finding (`codex-review.md:122-132`). The fix is deletion, not a grep: R19 has no
  landed text, so any pattern for it would be phrase-shaped by construction — the
  exact failure `codex-review.md:391-399` and this WP's own R08 name, where a
  sweep finds only the wording its author imagined and reports a clean all-clear
  for every other one. A check that cannot fail is machinery guarding nothing
  (`codex-review.md:154-164`). The prohibition lives in Out of scope and owner
  item O4, and the reviewer's read carries it.
- **The Security checklist keeps its heading with an `N/A —` line** rather than
  being deleted, though the template's heading says "delete only if". The runbook
  governs: a template section is never deleted silently, and one
  `N/A — <one-line reason>` line stays in its place so absence is visible and
  checkable (`spec-authoring.md:25-27`). The disagreement between that heading's
  older phrasing and the runbook is a real residual, but it belongs to whoever
  next edits `_TEMPLATE.md`'s section headings — not to this WP, whose only
  template edit is R09.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Dispatch precondition — owner items

Four placement/scope calls the owner may want. Each carries a **recommendation**
(dispatchable under the owner's standing "go with your recommendations") and the
**cost of overruling it**. None of these is a ruling; a ruling would be recorded
as such.

- **O1 — R14 lands in an agent duty file, not a runbook.** *Recommendation:*
  `.claude/agents/wd-architect.md`. "Enumerate your own good" constrains guard
  *design*, and the architect is who designs guards; the alternatives are
  `docs/ARCHITECTURE.md` (not a process file, and outside this WP's Deliverables)
  or a new design-principles runbook (a new document, which
  `codex-review.md:65-69` forbids without a named protected value). *Cost of
  overruling — every canonical and mirrored edit it implies:* **Table B**'s R14
  File cell (canonical); the **Deliverables** row for `wd-architect.md` (dropped
  if nothing else lands there) and one added or amended for the new file;
  **Current state**'s per-file bullet for both files; the **DATA** line's path;
  the **Implementation-notes aggregate counts** (edit points per file, and
  "`wd-architect.md` gains one rule line"); the **five-file scope** sentence in
  Context if the file count changes; and **this owner item**. The rule's wording
  and its anchor are unaffected.
- **O2 — R15 lands in `.claude/agents/wd-reviewer.md`, not `codex-review.md`.**
  *Recommendation:* the duty file. Its provenance bullet names wd-reviewer
  explicitly, and the duty file is what a reviewer session actually loads;
  `codex-review.md` is read by the orchestrator, who is not the actor here.
  *Cost of overruling — every canonical and mirrored edit it implies:* **Table
  B**'s R15 File and insertion-point cells (canonical — `codex-review.md` has no
  contract-density paragraph, so a new insertion point must be chosen);
  **Table A**'s R15 "already binds at" cell if the new host already says
  something; the **Deliverables** row for `wd-reviewer.md`, which this WP would
  then stop touching, **reducing the WP to four files**; **Current state**'s
  bullets for both files; the **DATA** line's path; the **already-bound
  non-regression grep** for `Contract-density detector (ADR-0031)`, which stops
  being about a deliverable; the **Implementation-notes aggregate counts**; the
  **five-file scope** sentence in Context and the "exactly five files" acceptance
  criterion; and **this owner item**. Note also that `.claude/` is not
  markdownlinted, so moving it into `docs/` brings it under markdownlint — a
  small gain, not a reason on its own.
- **O3 — the already-bound halves (R10 entirely, and the bound halves of R01,
  R02, R08, R09, R15–R18) get no retroactive "paid for by" provenance line.**
  *Recommendation:* do not add them. That text already carries its own measured
  evidence inline, and a provenance line added to text nobody is otherwise
  changing is an addition with no protected value. *Cost of overruling — every
  canonical and mirrored edit it implies:* the bound halves do **not** all live in
  `codex-review.md`, so an earlier "roughly six lines in `codex-review.md`"
  understated it. Provenance lines would land in **`codex-review.md`** (R01, R02,
  R10, R12, R16, R17, R18), **`spec-authoring.md`** (R08, R15's author-side half),
  **`_TEMPLATE.md`** (R09) and **`.claude/agents/wd-reviewer.md`** (R10's mirror)
  — four files, one of them (`_TEMPLATE.md`) inherited by every future spec. It
  also adds a **Table B row per newly-edited construct**, a **DATA line** per
  added provenance anchor, **Deliverables** notes, the **Implementation-notes
  aggregate counts**, and **this owner item**. Order 20-30 lines across four
  files, not six in one.
- **O4 — R19 ("declined owner grants surface loudly") is not landed.**
  *Recommendation:* drop it. A mechanical sweep of both named source documents
  returned zero hits for the claim, so it cannot be given a paid-for-by
  provenance and would land as the one aspirational rule in the set. *Cost of
  overruling:* the owner supplies the incident, and the WP reopens with one more
  Table B row, one landed sentence and one sentinel; Table A already reserves the
  id.

## Security checklist

- [ ] **N/A — this WP touches no untrusted input.** It edits five checked-in
      markdown documents and constructs no filesystem path, no shell command and
      no identifier from any external value.

## Acceptance criteria

- [ ] Exactly the five files in the Deliverables table are modified; no file
      outside it (and outside the always-allowed set) is created or changed.
- [ ] For **every row of Table B**, the **committed** file that row names
      contains **every** anchor literal that row lists, byte-exact. This is an
      anchor-presence screen only; it is blind to meaning, placement and polarity,
      and the two criteria below are what assert those.
- [ ] Each landed rule is operative, not aspirational, per the rule under "Exact
      contracts": it names an action, an artifact, or a line in a record that a
      reader can check they produced.
- [ ] Each landed rule carries a one-line paid-for-by provenance naming its
      source, matching that rule's Table A "Paid for by" cell.
- [ ] Every `EXTEND` row leaves its insertion point's existing claim intact: the
      construct still says what it said, and the change at that point is
      additive. Across the whole PR, the only deleted lines are lines an EXTEND
      rewrote in place — no bullet, sentence or rule is removed.
- [ ] The text behind Table A's ALREADY BOUND row and the bound halves this WP
      must not disturb is still present: `codex-review.md` still contains
      `Loop circuit-breaker (ADR-0031)` and `A cited RANGE is checked at BOTH
      ends`, and `.claude/agents/wd-reviewer.md` still contains
      `Contract-density detector (ADR-0031)`.
- [ ] `memory/lessons/inbox.md` is not modified by this PR.
- [ ] `npm run lint` passes: markdownlint reports 0 errors, and the frontmatter
      check passes, still reporting 4 agent(s) — the two agent-file edits are
      body-only and must not disturb their frontmatter.
- [ ] **Idempotence: N/A — docs-only, ships no command and writes nothing outside
      the repo.**

## Verification steps (run these; paste output in the PR)

**What the gate is, exactly: an ANCHOR-PRESENCE SCREEN over the commit.** It
proves that each Table B anchor literal is present in the **committed** file, and
it proves nothing else. It does not read meaning, placement or polarity: a
sentence that *rejects* a rule still contains the rule's words and still passes
(measured — round-1 record). What Table B was actually implemented is carried by
the reviewer's read against Table B, which is what the "operative, not
aspirational", "EXTEND leaves the existing claim intact" and "only EXTEND
rewrites are deleted" criteria assert. **Do not read 21 PASS as evidence that the
rules are right — only that their anchors landed.**

Three properties make the screen worth its size. It runs **from a file**, never
as an inline one-liner: a pattern passed through nested quotes silently changes
what the gate matched (`codex-review.md:350-357`). It reads the **committed
blob** (`git show HEAD:<path>`) and refuses to run on a dirty tree, because a
verification that greps the working tree while the claim is about the commit is
the exact failure R04 lands and `inbox` WP-frontmatter-recognition-failopen
records; an unstaged anchor passes a worktree read and fails this one (measured).
And it **fails closed on its own input**: the loop's heredoc propagates failure
and the run is rejected unless exactly the declared number of anchors was
processed, so a shell that cannot deliver the DATA cannot certify anything
(reproduced in both round-1 review sandboxes; not reproducible on the authoring
host — round-1 record). Matching is whitespace-flattened with markdown emphasis
marks stripped, so a hard wrap or a bolded word inside an anchor cannot fail a
correctly written rule — R08's own discipline applied to R08's gate.

```bash
cat > /tmp/wd-sweeps-sentinels.sh <<'SCRIPT'
#!/usr/bin/env bash
# ANCHOR-PRESENCE SCREEN over the COMMITTED tree. Proves each Table B anchor
# literal is present in the committed file. Proves NOTHING about meaning,
# placement or polarity — an inverted sentence containing an anchor PASSES.
DECLARED=21
if [ -n "$(git status --porcelain)" ]; then
  echo 'REFUSED: the working tree is dirty. This screen reads the COMMITTED blob,'
  echo 'so a result now would describe files nobody will merge. Commit, then re-run.'
  git status --porcelain
  exit 1
fi
rc=0
n=0
while IFS= read -r line; do
  [ -n "$line" ] || continue
  n=$((n + 1))
  f=${line%% :: *}
  lit=${line#* :: }
  if ! blob=$(git show "HEAD:$f" 2>/dev/null); then
    printf 'FAIL(absent)  %s :: %s\n' "$f" "$lit"
    rc=1
    continue
  fi
  # Flatten: drop * _ ` , join every line, squeeze runs of spaces.
  if printf '%s' "$blob" | tr -d '*_`' | tr '\n' ' ' | tr -s ' ' | grep -qF -- "$lit"; then
    printf 'PASS  %s :: %s\n' "$f" "$lit"
  else
    printf 'FAIL  %s :: %s\n' "$f" "$lit"
    rc=1
  fi
done <<'DATA' || exit 1
docs/runbooks/codex-review.md :: the proof of a fix is the re-run
docs/runbooks/codex-review.md :: not your own recount
docs/runbooks/codex-review.md :: dies relative to what you touched
docs/runbooks/codex-review.md :: prove the commit, not the working tree
docs/runbooks/codex-review.md :: grep the injected marker
docs/runbooks/codex-review.md :: notice its own death
docs/runbooks/codex-review.md :: arity proves nothing
docs/runbooks/spec-authoring.md :: pronoun-aware
docs/runbooks/spec-authoring.md :: adjacent to the claim
docs/specs/_TEMPLATE.md :: in the same commit
docs/runbooks/codex-review.md :: materiality band
docs/runbooks/codex-review.md :: C: hygiene
docs/runbooks/codex-review.md :: maps each band to an outcome
docs/runbooks/codex-review.md :: never suspends the repeat rules
docs/runbooks/codex-review.md :: form insufficiency
docs/runbooks/codex-review.md :: predicate defect
.claude/agents/wd-architect.md :: enumerate your own good
.claude/agents/wd-reviewer.md :: the whole cell, never the grep window
docs/runbooks/codex-review.md :: grep for the cited text
docs/runbooks/codex-review.md :: nothing writes into a worktree a gate is reading
docs/runbooks/codex-review.md :: on the same tip
DATA
printf 'anchors processed=%s declared=%s\n' "$n" "$DECLARED"
if [ "$n" -ne "$DECLARED" ]; then
  printf 'FAIL: processed %s of %s declared anchors — the input transport failed\n' "$n" "$DECLARED"
  exit 1
fi
printf 'sentinels exit=%s\n' "$rc"
exit "$rc"
SCRIPT
bash /tmp/wd-sweeps-sentinels.sh
rc=$?
printf 'sentinel gate rc=%s\n' "$rc"

# Already-bound text this WP must NOT disturb (each must stay present)
grep -qF -- 'Loop circuit-breaker (ADR-0031)' docs/runbooks/codex-review.md
grep -qF -- 'A cited RANGE is checked at BOTH ends' docs/runbooks/codex-review.md
grep -qF -- 'Contract-density detector (ADR-0031)' .claude/agents/wd-reviewer.md

# The lesson inbox is untouched by this PR (empty output = pass)
git diff --stat main -- memory/lessons/inbox.md

# Deletions per file. EXTEND rewrites lines in place, so a nonzero deletion count
# is expected; read the numbers against the diff, do not assume them.
git diff --numstat main -- docs/runbooks/codex-review.md docs/runbooks/spec-authoring.md docs/specs/_TEMPLATE.md .claude/agents/wd-architect.md .claude/agents/wd-reviewer.md

npm run lint
```

The screen is a NEW verification step, so it is trusted only after being observed
on **six** states, all outputs pasted (the round-1 record holds the architect's
runs of every one):

| State | Expected |
|-------|----------|
| untouched tree, committed | red — 21 FAIL |
| hand-built compliant commit | green — 21 PASS |
| violating commit (one anchor reworded) | red — exactly 1 FAIL |
| deliverable absent from the commit | red — `FAIL(absent)` |
| anchor present but only UNSTAGED | red — the commit read does not see it |
| dirty tree | `REFUSED`, exit 1, no verdict issued |

And one state is recorded as a **disclosed limit, not a proof**: a commit whose
sentence *inverts* a rule while preserving its anchor returns **PASS**. That is
what an anchor-presence screen is; it is why the reviewer's whole-construct read
against Table B is the thing that certifies the rules, and why this list stops
here rather than growing polarity or insertion-point parsing (`codex-review.md:154-164`
— machinery grows only in the smallest form that guards a behavior).

## Out of scope (do NOT do these)

- **R10 (the ADR-0031 circuit breaker).** Already bound and operative at
  `codex-review.md:376-383` and `.claude/agents/wd-reviewer.md:21`. Do not
  restate it: a fact is stated once, in the surface that owns it
  (`spec-authoring.md:47-50`).
- **R19 ("declined owner grants surface loudly").** No provenance exists for it
  in either source document (owner item O4). Do not land it, and do not invent a
  provenance line for it.
- **Editing `memory/lessons/inbox.md` or `docs/HANDOVER.md`.** The inbox is
  retired by the dream job's consolidation, not by this WP, and CLAUDE.md forbids
  a WP branch from editing it. `docs/HANDOVER.md` is a handover record, not
  process.
- **Amending ADR-0031, ADR-0005 or ADR-0029.** R09 strengthens the template's
  operationalization of ADR-0031's "one pass"; it does not change the ADR, and an
  ADR amendment is the owner's act.
- **Editing `CLAUDE.md`, `AGENTS.md`, `docs/specs/README.md`, or the vendored
  review prompts under `docs/runbooks/review-prompts/`.** The prompts are frozen
  verbatim upstream copies (`codex-review.md:267-273`); improvements ride in the
  contract, which is `codex-review.md` itself.
- **Any product change, test, script or tooling to enforce these rules.**
  Nothing enforces them automatically and nothing should: each is one more line
  in a record that is already being written (`codex-review.md:79-81`).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The
   anchor-presence screen is run **after committing** — it reads the committed
   blob and refuses a dirty tree — and its PASS lines are never reported as
   evidence that a rule is correct, only that its anchor landed.
2. Conventional commits; PR titled
   `docs(process): codify the paid-for review and sweep disciplines (WP-process-runbook-sweeps)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
