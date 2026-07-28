# ADR-0031: A dense contract's single source of truth is one canonical reference table; registered mirrored surfaces defer to it and move with it

Status: Accepted
Date: 2026-07-19

> **OWNER-RATIFIED (2026-07-19).** Felho's own diagnosis, articulated during the
> A9/A10 security-audit spec-review loop, and ratified by Felho at the close of the
> review round on this ADR — mirroring the ADR-0028 / ADR-0030 Proposed→Accepted
> flow. The review took four rounds (the ADR's own two-consecutive-rounds
> circuit-breaker fired on the ADR itself), converging once the rule was reframed on
> the canonical-source model adapted from the pairflow project's Contract-Dense Task
> Gate. Extends ADR-0029's single-source-of-truth
> principle from spec-lifecycle bookkeeping to in-spec *contract* content; builds on
> ADR-0005's spec-driven workflow.

## Context

During the A9/A10 security-audit spec work, `WP-a9-incident-runbook` went through
**eight** Codex adversarial-review rounds in aggregate whose findings kept landing on
the same small set of contracts scattered through its operative prose. The clearest
signature: the **one** core-path-resolution contract (`core = $WIENERDOG_HOME || HOME ||
os.homedir()`, plus the set of `$CORE/…` artifact paths) drew **four findings across two
consecutive rounds (rounds 7 and 8)** — logbook `2026-07-19-codex-round-7…8`: R7-1 in
round 7 (add the step-0 core preamble); then R8-2, R8-3, R8-4 all in round 8 (persist it
across the mandated reboot; make every operative path carry the resolved `<core>` prefix,
not a bare relative `state/…`; read the core the way the code does, `HOME` before
`USERPROFILE`). Each finding caught a *different scattered instance* of the same underlying
fact. That is the diagnostic for a contract buried in prose: fixing one corner leaves
another wrong, a later fix can silently contradict a copy elsewhere, and the review loop
converges slowly — here, two straight rounds spent on one contract family before anyone
extracted it.

The remedy (logbook `2026-07-19-runbook-contract-extraction`) extracted the runbook's
five recurring contracts — path resolution, per-platform scheduler artifacts, restore
rules, the managed-block drill gate, `memory approve` allowed names — into a compact
"Contract reference" table section that the prose then cites ("resolve the core
(Table A)", "the Table D three-check conjunction"). The extraction was verified faithful
against both the post-R8 prose and the code, and the very next round (round 9) returned
**APPROVE / SHIPPABLE** with no material findings. The same disease reappeared in the
A10 reap mechanism's **settle-path matrix** (which reap primitive runs on which of four
exit paths), described in four drifting locations (round-10 R10-2); the remedy was again
to extract it to one authoritative table — but, as R11-2 below shows, that extraction was
left incomplete.

But round 11 (R11-2) exposed the failure mode of a *careless* extraction: the
settle-matrix table had been added and made canonical, yet **five** other mandatory
surfaces that mirror it — the Deliverables cells, the one-line unified rule, and several
acceptance criteria — were left **unregistered and independently authored**, and they had
drifted out of agreement with the table, so the spec now contradicted itself; an
implementer could not satisfy both. **A canonical table plus unregistered, drifting mirrors
is worse than either alone.** The fix was to bring every mirror back into agreement with the
table and keep the set registered — precisely the discipline this ADR names below (the
**Mirrored Surface Checklist**).

This is the same-family prior art at the process level as ADR-0029, which retired
`ROADMAP.md` precisely because every lifecycle step wrote multiple hand-synced copies of
the same facts and drifted. ADR-0029 fixed drift in spec-lifecycle *bookkeeping*; the
A9/A10 rounds show the identical drift in in-spec *contract content*.

## Decision

This adapts the **"Contract-Dense Task Gate"** proven in the pairflow project's
spec-authoring tooling; the mechanism is restated in full here so this ADR is
self-contained — a wienerdog reader needs nothing outside it.

**Core rule — one canonical source per contract; other surfaces may mirror it, but must
defer to it, never become a second independent authority.** When a document carries a
contract dense enough to trigger the discipline (activation below), designate **one
reference table as that contract's single canonical source of truth** — the one place its
facts are *decided*. Every *other* place the contract appears is a **mirrored surface**: it
MAY summarize or restate the contract, but only as a copy that **defers to the canonical
table** for its facts. The one thing forbidden is a **second, independently authored
statement of the contract that re-decides its facts** and can therefore silently **drift**
from the canonical table. Textual repetition is not the violation; an independent authority
is.

This distinction is the whole reframe, and it is what makes the rule *satisfiable* under
wienerdog's mandatory spec structure. Every WP spec is *required* to carry a Deliverables
table and acceptance criteria, and those are themselves normative statements of contract
facts — so "zero restatements" is impossible for any real spec, and the earlier
"never restate; purge every copy" phrasing was literally unsatisfiable. Under the
canonical-source framing those mandatory sections are not violations: they are **legitimate
mirrored summaries** that defer to the canonical contract table. The rule bites only when a
surface stops deferring and starts independently re-deciding the facts.

**The Mirrored Surface Checklist (the discipline, made robust).** A triggered spec includes
a short checklist that names, for each canonical contract table, **every section of that
spec that mirrors it.** In wienerdog terms the mirrored surfaces to enumerate are:

- the **Deliverables-table cells** (e.g. `modify` / `create` notes that state a path or rule),
- the **acceptance criteria**,
- the **verification commands / greps**,
- the **Current-state description**,
- any **operative prose steps** that apply the contract.

Two obligations follow. **(a) Update-all-mirrors:** when a review finding changes a row of
a canonical table, the author (or implementer) updates **every mirrored surface the
checklist names** before handing the spec back — the table and its mirrors move together,
in one pass. **(b) Register-new-mirrors:** if a *new* mirrored surface appears during
review, **add it to the checklist** then and there, rather than rediscovering it round
after round. This is the correct, robust form of the R11-2 lesson: R11-2 was precisely an
*unregistered* mirror that had drifted from its table; a Mirrored Surface Checklist would
have caught it up front and kept every mirror in lockstep with the canonical source.

**Activation trigger (when the discipline applies).** Turn the discipline on for a document
when **two or more** of the following are true:

(i) an API / interface / result **shape** changes;
(ii) a **status or result taxonomy** changes or is introduced;
(iii) structured **input/output parsing, payload validation, or schema acceptance** changes;
(iv) **error / fallback / timeout / cancellation / precedence / reason-code** behavior changes;
(v) the task **crosses an authority boundary** — one component emits or records data but another owns its interpretation or lifecycle;
(vi) **multiple downstream consumers or successor specs** inherit the contract;
(vii) the **same contract must appear in multiple mirrored surfaces**.

This replaces the earlier, vaguer "3+ discrete contracts of five shapes" trigger: the
two-or-more-conditions test is concrete and catches the drift-prone cases directly (a
taxonomy plus multiple mirrors, an authority boundary plus successor specs, and so on).

**Examples, honestly — a table-extraction precedent and a cautionary drift case. The
Mirrored Surface Checklist is a new discipline this ADR introduces, and no existing spec
yet carries it; the first spec to demonstrate it is the follow-up `WP-contract-reference-tables`.**

- **Table-extraction precedent — `WP-a9-incident-runbook`.** Its five recurring contracts
  were pulled out of scattered operative prose into compact canonical reference tables
  (Tables A–E: path resolution, per-platform scheduler artifacts, restore rules, the
  managed-block drill gate, `memory approve` allowed names). The extraction was verified
  faithful against both the post-R8 prose and the code, and the very next round (round 9)
  returned **APPROVE / SHIPPABLE** with no material findings. That is the evidenced win —
  extract each scattered contract into one authoritative table and the review loop converges
  immediately — and it is the **extraction** half of this decision, standing on real
  evidence. What the runbook does **not** demonstrate is the Mirrored Surface Checklist: it
  was extracted **before** this ADR named the checklist, so its Deliverables cells and
  acceptance criteria restate the Tables A–E facts **without** being registered as mirrors or
  explicitly marked as deferring. Read it as the extraction precedent only — **not** as a
  checklist-compliant exemplar, and not as a spec whose mirrors are all registered.
- **Cautionary case — `WP-a10-reap-mechanism`.** Its **settle-path matrix** is the correct
  canonical source for which reap primitive runs on which of the four exit paths. But R11-2
  found several mirrors of it — the Deliverables `modify` cells, the "unified rule in one
  line" prose, and several acceptance criteria — that were **unregistered and independently
  authored, and had drifted** out of agreement with the matrix, so the spec contradicted
  itself. The fix R11-2 applied — bring every stray mirror back into agreement with the
  matrix — is exactly what a Mirrored Surface Checklist enforces *up front*. Present this
  honestly as a spec **moving toward** the discipline, **not** a finished single-source
  exemplar. (The sibling `WP-a10-escape-harness` is a *separate* document that keeps its own
  derived local copy of the matrix, which ADR-0005 self-containment *requires*; under this
  framing that copy is a legitimate cross-document mirrored summary that defers to the owning
  table — see the boundary below.)

The ADR does **not** need a single spec that already shows both halves to be sound. The
**extraction** half is evidenced by the runbook (round 9 returned clean immediately after
its tables landed); the **drift** half — the failure that motivates the Mirrored Surface
Checklist — is evidenced by R11-2 itself (an unregistered mirror that drifted from its
canonical table). The Mirrored Surface Checklist is therefore a **new** discipline this ADR
introduces to close that drift gap, so far **unproven by any existing spec**: the runbook
predates it and demonstrates only extraction, and its first application and demonstration is
the follow-up `WP-contract-reference-tables`. The absence of one already-complete exemplar
is thus explicit and intentional, not an oversight.

**The single exception — a contract whose facts are all gate-enforced.** A specific
**contract** — never a whole spec — is exempt from having a canonical table **only when a
runnable gate enforces every one of its facts exhaustively and directly**; the gate is then
that contract's canonical source, so a table would be redundant. **This is the sole
exception.** A spec-level carve-out would swallow everything — the repo template *requires*
every WP to carry acceptance criteria and verification steps, so "has an acceptance test or
a harness" describes nearly every spec — and the ADR's own cases contradict a spec-level
reading: the incident-runbook was tabularized *despite* a mandatory three-config end-to-end
dry-run gate, and the settle-path matrix *despite* a live merge-gate harness. A general
acceptance test or live harness therefore does **not** exempt a spec's *other* contracts: a
harness proves runtime behavior, not that every mirror of a path or rule still agrees with
the canonical source — and that drift is exactly what the canonical table kills.

**Pre-contract design notes — and only until a contract appears.** Genuinely *progressive*
design work (each finding builds on the last) is real design churn, not scattered-contract
thrash — but this leniency is scoped strictly to **pre-contract design notes that do not
yet state a discrete contract**. The moment a triggered document states discrete contract
facts, the leniency ends and **only the exhaustive-runnable-gate exception applies**; there
is no second, subjective "progressive design stays prose" carve-out for content that has
already hardened into a contract. In the A9/A10 session the A10 reap **code** contracts
stayed prose while they were still progressive design notes; the one element that had
hardened into a discrete, drift-prone contract — the settle-path matrix — correctly got a
canonical table.

**Scope: within one document; the cross-document boundary.** This discipline governs
*intra-document* presentation. Across documents, ADR-0005's **One-Document Rule** governs
and takes precedence: each implementation spec must be shippable from that spec plus
CLAUDE.md alone, so a spec that needs a contract owned by another spec **must carry its own
local copy** of it. Under this framing that local copy is a **legitimate cross-document
mirrored summary** — a copy in a different document that defers to the owning table, not a
forbidden second authority. Crisply:

- **Forbidden** — the *same* document carrying a second, independently authored statement of
  a contract *outside* that document's canonical table for it (the drift that drove the
  A9/A10 rounds).
- **Allowed** — a *different* document carrying its own derived local copy of a contract it
  needs per ADR-0005; and, within one document, worked examples that defer to the canonical
  table rather than re-deciding its facts.

**How we enforce it (four-point process integration).**

1. **Spec template** (`docs/specs/_TEMPLATE.md`) — add an *optional* "Contract reference"
   section, the **Mirrored Surface Checklist**, and the activation trigger. Strongest
   preventive: it sits where the architect starts, in view every time.
2. **wd-architect = owner of the pattern** — recognize when the trigger fires, author
   canonical contract tables from the start, and maintain the Mirrored Surface Checklist so
   every mirror defers to its table.
3. **wd-reviewer = detector** — flag contract-dense prose and recurring same-contract
   findings, and recommend a canonical table. Fold in a light **Closed-Contract Drift
   Check** (adapted from pairflow's companion check): on a refinement, the reviewer confirms
   it does not silently reinterpret an already-settled canonical contract or promote a
   mirror to primary — a settled contract's facts change only by editing its table and every
   registered mirror together. This is a one-paragraph reviewer check, not a second gate.
4. **codex-review runbook** (`docs/runbooks/codex-review.md`) — keep the loop
   circuit-breaker: if two consecutive review rounds land a finding on the *same* contract
   family, stop finding-by-finding fixing and do a canonical-extraction pass. The
   core-resolution evidence *is* exactly this trigger — its four findings fell in two
   consecutive rounds (7 and 8), so the breaker would have fired at the round-8 finding.
   Note the ordering: the **Mirrored Surface Checklist is the stronger day-to-day
   mechanism** (it keeps mirrors in lockstep up front); the circuit-breaker is the backstop
   for when a contract slips through unregistered.

This is a **presentation discipline**, not a new gate. It does not change the One-Document
Rule (ADR-0005), the Deliverables-table permission boundary, or
acceptance-criteria-as-verification-commands — canonical tables and their mirrors live
inside those constraints.

## Consequences

- Contract-dense specs converge under review in fewer rounds — evidence: round 9 returned
  clean immediately after the runbook extraction; the settle-matrix table closed R10-2.
- A contract fix touches one canonical table cell plus its registered mirrors, moved in the
  same pass — not N independently drifting sentences; a dry-run or validation step gets an
  obvious target (validate the canonical table against the real system).
- **Cost/risk:** the discipline is real work — a canonical table is safe only if every
  mirror is *registered and deferring* (R11-2); a canonical table plus an unregistered,
  drifting mirror is the self-contradiction, strictly worse than the original scatter.
  Over-tabularizing a **pre-contract design note** or an **exhaustively-gate-enforced
  contract** is waste — the activation trigger and the single contract-level exception exist
  to bound this.
- Does **not** change the One-Document Rule, the Deliverables-table permission boundary,
  or acceptance-criteria-as-verification-commands. No new tooling, no daemon, no telemetry
  (ADR-0004 holds).
- Extends ADR-0029's one-source-of-truth principle to contract content; both descend from
  ADR-0005.

## Implementation

This ADR records the decision only; the four integration edits land separately, and are
**not** made in this pass. Recommendation on how they land:

- `docs/runbooks/codex-review.md` is maintained directly today (it is not a WP-gated
  deliverable), so the circuit-breaker rule (point 4) can be a **direct edit** by the
  orchestrator/owner.
- `docs/specs/_TEMPLATE.md` and the `wd-architect` / `wd-reviewer` agent definitions
  (points 1–3) are load-bearing process artifacts whose edits deserve the spec gate and a
  reviewable diff. **Recommend a single follow-up WP** (`WP-contract-reference-tables`,
  slug id, `depends_on: []`, size **S**) that makes those three edits together — the
  template's new "Contract reference" section plus Mirrored Surface Checklist and activation
  trigger, and the two agents' new duties (wd-architect maintains the checklist; wd-reviewer
  runs the Closed-Contract Drift Check) — each verified against this ADR. That WP should ship
  *after* this ADR is ratified to Accepted.

## Appendix — the amendment record (nothing below this line has been ratified)

**Everything above this heading is the ratified content of this ADR** — the `Status` line,
the owner-ratification note, Context, Decision, Consequences and Implementation. It is
byte-unchanged by everything below, and the repo rule it lives under is unchanged too:
*"Accepted ADRs are immutable — supersede with a new ADR, never edit"*
(`docs/adr/README.md`). This appendix adds no exception to that rule. It is where a proposed
amendment is written down and left visible while it waits for the owner, which is the
alternative to an architect silently editing a ratified Decision — the form ADR-0034's own
appendix established for this repo (*"this appendix is where every future amendment goes",
`docs/adr/0034-accidental-persistence-threat-model.md`*).

### Amendment A1 — 2026-07-28: a `mechanism` column states its trigger separately from its patch, and a mutation row states exactly one mutation

**STATUS: PROPOSED. WRITTEN BY THE ARCHITECT. NOT SIGNED BY THE OWNER. NOT IN FORCE.**

*The status line above deliberately spells "not signed by the owner" in words rather than
negating the ratification token, so that no bare `grep` for that token matches this
paragraph. Writing `NOT <token>` is how a ratification gate ends up passing on the sentence
that explains it — a mistake this repo has already made and recorded.*

**Where the owner's signature goes, stated exactly.** On its own line immediately below this
status line, in the same plain form the other ratified ADRs in `docs/adr/` carry in their
header region: the ratification token, a separator, and an ISO date. **That line is
deliberately absent, and it is deliberately not written out here even as a template** —
`WP-secret-fence-ep2-redact-arm`'s owner-signature-form row **S5** is that no agent ever
writes that token, for any reason, including to show where it would go; and this repo has
already shipped a ratification gate that passed on the sentence explaining the gate
(`docs/specs/logbook/2026-07-26-derived-predicates-need-their-tools-registered.md`). So the
slot is described and left empty. **Until the owner writes that line, this amendment binds
nobody**: it changes no obligation in the Decision above, no agent definition, no spec
template, and no runbook. The architect authored it; the owner has not seen it.

**If the owner prefers the strict reading of the immutability rule**, the correct landing
form is a new ADR that amends this one, and this block is then its draft rather than its
home. Either way the choice is the owner's and is not made here.

#### What A1 would add to the Decision

The Decision above governs *which* surface decides a contract's facts (the canonical table)
and *which* surfaces merely mirror it. It says nothing about the **shape of a cell inside**
the canonical table. A1 adds one column schema and one row rule, for the family of canonical
tables that tell an implementer how to *produce* a state rather than what must be true of it
— fault-injection tables, mutation tables, and any table with a `mechanism`, `seam`,
`how to produce it` or equivalent column:

1. **A `mechanism` cell carries at least two named fields: a TRIGGER and a PATCH.** The
   **patch** is the fault itself — the stub, the stateful wrapper, the permission change. The
   **trigger** is what puts the system on the code path where that patch is reached. What is
   forbidden is a cell that names only patches and leaves reachability implied.
   **`TRIGGER: none` is a permitted value and it is a measured one.** A cell may say *"none —
   the patch is reached on the ordinary path"* only when the row also records the observation
   that shows it: the injection run, and the row's own cell observed as **entered** — the
   assertion about the failure path evaluated, not merely a green test. An unverified
   *"none"* is the FI-10 defect written down rather than removed, because a row whose patch is
   never reached is green either way and the claim is exactly what nobody checked. **This is
   the clause that gives the rule its parity with the `kind` column below**, which is
   admissible only with the untouched-tree run behind it; without this clause A1 would be
   strictly weaker than the precedent it cites.
2. **Every seam a `mechanism` cell names — trigger or patch — is identified structurally,
   never by an ordinal, whenever both forms are available.** *"the first read after X failed"*
   survives a reordering; *"the third read"* is a standing claim about which calls run, and it
   is falsified by any short-circuit on the very path the row mandates. **The scope is "every
   seam" and not "the trigger", and that is the whole point of the clause**: FI-19's ordinal
   was never in its trigger — the trigger was a structural `spawnPinnedSync` wrapper — it was
   in the **patch**, a read counter that throws on the *n*-th call. A rule reaching only
   triggers leaves the actual defect legal, and both of this clause's worked examples above
   are patches. Neither field is exempt.
   **The boundary, stated so the clause does not over-reach.** *"Whenever both forms are
   available"* is load-bearing: some seams genuinely have no structural anchor, and for those
   a **counted** seam is admissible provided the count is **relative to a named arming
   event** rather than absolute over the run, and the row says what arms it. That is a
   weaker guarantee and the row carries the reason it settled for it. What this clause
   forbids is an ordinal chosen when a structural anchor was there to be used — which is
   FI-19's case exactly: the structural anchor (the first target read after the withheld
   preserve's write failed) existed the whole time and is what the implementation shipped.
3. **A mutation row states exactly one mutation.** A row conjoining two independent changes
   cannot demonstrate that both are held: applied together, either half alone reddens the
   named check, so a green sweep is compatible with one clause being unenforced. Two changes
   are two rows and two ids. **"One mutation" means one independently-revertible change, not
   one sentence** — a single coherent design revert that necessarily moves two rows of the
   same contract together is one mutation, and a row relying on that reading says so.

**Why a schema rather than more care.** A mechanism cell with no trigger fails *green*. The
injected fault is never reached, the arm completes on its success path, and the assertion
about the failure path is simply never evaluated — so the row, the test and the sweep are all
green while the row proves nothing. That is the same shape as an unregistered mirror: not a
wrong statement, an *absent* one, and absence is what a schema catches and re-reading does
not.

#### The evidence, and why this ADR rather than one spec's Implementation notes

**This defect shape landed three separate times on one table** —
`WP-secret-fence-ep2-redact-arm`'s Table T, the canonical testability table:

- **design-gate round 6** shipped row **FI-19** with no fall-through trigger. The row's own
  post-mortem: *"the row asserted an outcome its own mechanism could not reach, and M-50 had
  nothing to redden."*
- **design-gate round 8** repaired FI-19 with a corrected *ordinal* — a let-through list of
  reads. That list is arithmetically wrong for the trigger the same row mandates: on that
  trigger the arm returns before one of the reads it counts.
- **the PR #122 implementation round** found both the round-8 error and the same omission on
  row **FI-10**, plus row **M-23** stating two independent mutations. All three were reported
  under *Discovered issues* / *Decisions made* and worked around; the rows were corrected in
  the post-Done errata of 2026-07-28.

The rounds are **not consecutive** — 6, 8 and the PR round, measured rather than assumed — so
ADR-0031's two-consecutive-rounds circuit-breaker did not fire on it. That is itself the
argument for a schema: the breaker catches a contract family a review keeps returning to
*within* one loop, and this family skipped a round each time.

**The same disease, and the same cure, in a different family.**
`docs/specs/done/WP-refusal-remedy-discriminator.md` carries a canonical **gate-evidence
table** (header `| gate | kind | verdict comes from | proved green on | proved red on |`, at
that file's line 1308 as measured 2026-07-28 — the header is the anchor, the number is a
convenience). Across its **five** review rounds that table produced **seven** falsified
claims:

1. round 2's sweep claim that *"every gate was proven in both directions"* — two gates were in
   none of its three buckets;
2. the **AC8 gate**'s recorded proof — the command was vacuous, firing its marker on any tree
   once the branch was committed (that spec's line 1326);
3. the **README M2 gate**'s recorded proof — inverted, red on correct work and green on no
   work at all (line 1335);
4. round 3's verdict columns for the five stale-prose gates — recorded swapped, and caught in
   round 4 (line 1315);
5. `npm test` recorded as having *"no WP-specific red input"* — false (line 1265);
6. `npm run lint`, same claim, same round, also false (line 1265);
7. the blanket *"the gates are complete"* claim — falsified in three separate rounds, by an
   acceptance criterion with no gate, a gate anchored on a string the correct text keeps, and
   a command with no row in the table at all (line 1290).

**A column ended it.** That table gained a **`kind`** column — `completion` (red on an
untouched tree) versus `regression` (green on one) — and the property that had been argued
round after round became a field every row had to fill, measured by running the gate on an
untouched tree. The spec states the resulting rule directly: *"Never infer the kind from the
command's shape; the last two rounds each got it wrong that way."* A1 is that move, applied
to the `mechanism` column: **the recurring judgement becomes a field, and an empty field is
visible in the table.**

#### Scope, and what A1 does not do

- It adds **no gate, no tooling, no daemon, no telemetry** (ADR-0004 holds). It is a cell
  schema in a table an architect writes by hand.
- It does **not** widen the activation trigger. A document that does not carry a canonical
  contract table carries no `mechanism` column either.
- It does **not** change the One-Document Rule (ADR-0005), the Deliverables-table permission
  boundary, or acceptance-criteria-as-verification-commands.
- **Process integration, if signed.** `docs/specs/_TEMPLATE.md` and the `wd-architect` /
  `wd-reviewer` definitions are the surfaces that would carry A1, and the Implementation
  section above already routes those three edits through `WP-contract-reference-tables`. A1
  therefore lands in that WP (or a successor), **not** by a direct edit — and not at all
  until the signature line above exists. Nothing in this pass touched that spec.
