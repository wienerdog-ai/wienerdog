# ADR-0031: Contract-dense specs extract each contract into one authoritative reference table; prose cites it, never restates it

Status: Proposed
Date: 2026-07-19

> **OWNER-APPROVED IN PRINCIPLE (2026-07-19).** Felho's own diagnosis, articulated
> during the A9/A10 security-audit spec-review loop. Stays **Proposed** until Felho
> ratifies at the close of the review round on this ADR — mirroring the ADR-0028 /
> ADR-0030 Proposed→Accepted flow. Extends ADR-0029's single-source-of-truth
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
settle-matrix table had been added, yet the old scattered three-reap statements survived
in **five** other mandatory locations, so the spec now contradicted itself — an
implementer could not satisfy both. **A table plus stale copies is worse than either
alone.** Extraction is only safe if it purges every scattered restatement.

This is the same-family prior art at the process level as ADR-0029, which retired
`ROADMAP.md` precisely because every lifecycle step wrote multiple hand-synced copies of
the same facts and drifted. ADR-0029 fixed drift in spec-lifecycle *bookkeeping*; the
A9/A10 rounds show the identical drift in in-spec *contract content*.

## Decision

**Core rule — one authority per contract; every other mention is subordinate to it.**
When a spec or contract-dense doc states three or more discrete contracts, give each
contract exactly **one designated authority**: a single reference table that states its
facts. Every other mention of that contract must be **subordinate** to that authority —
either **(a)** prose that explains or applies the contract while **citing** the table
("resolve the core (Table A)", "the Table D three-check conjunction"), or **(b)** across
documents, a **derived local copy** that ADR-0005's One-Document Rule requires, marked as
derived-from the owning table. There is one authority per contract *within that document*.

**The violation to eliminate is an INDEPENDENT NORMATIVE re-declaration** — a second
statement of a contract's facts that stands on its own as a rule and can silently
**drift** from the authority. *That* is what "never restate" targets, not textual
repetition as such. A citation of the table is not a copy; an applied worked example that
points at the table is not a copy; the ADR-0005 cross-document local copy (subordinate,
marked derived-from) is not a copy in the forbidden sense. A sentence that **re-asserts**
the contract's facts as if it were itself the source of truth **is** the forbidden copy
and must be rewritten as a citation. So read "purge every scattered copy" precisely: purge
every **independent normative re-statement** (each one a drift risk), not every mention.

**The R11-2 lesson, in these terms (non-negotiable).** Adding a reference table while
leaving independent normative copies of the same contract in place is the
self-contradiction to avoid: the table and the surviving copies can drift into mutual
contradiction that no implementer can satisfy — **strictly worse** than the original
scatter. Extraction is complete only when every independent normative re-statement of the
contract has been converted into a citation of its table; grep-verify that none survives.

**Scope: within a single document (the cross-document boundary).** This decision governs
*intra-document* presentation only. Across documents, ADR-0005's **One-Document Rule**
governs and takes precedence: each implementation spec must be shippable from that spec
plus CLAUDE.md alone, so a spec that depends on a contract owned by another spec **must
carry its own local copy of that contract** (typically its own copy of the table, or the
subset it needs). That local copy is **required self-containment, not a forbidden
restatement** — an implementer must never have to open a second spec. The boundary,
stated crisply:

- **Forbidden** — the *same* document restating one contract's facts in multiple prose
  places *outside* that document's table for it (the scatter that drove the A9/A10 rounds).
- **Allowed** — a *different* document carrying its own local copy of a contract it needs
  per ADR-0005; and, within one document, worked examples / applications of a contract that
  *cite* the table (e.g. "the Table D three-check conjunction") rather than independently
  re-asserting its facts.

**Examples, honestly — one clean, one cautionary.**

- **Clean success precedent — `WP-a9-incident-runbook`.** Its five recurring contracts'
  scattered prose copies were **actually reduced to citations** of a compact
  Contract-reference table ("resolve the core (Table A)", "the Table D three-check
  conjunction"); the extraction was verified faithful against both the post-R8 prose and
  the code, and the very next round (round 9) returned **APPROVE / SHIPPABLE**. This is
  what the discipline looks like when it is complete.
- **Cautionary / in-progress case — `WP-a10-reap-mechanism`.** Its **settle-path reap
  matrix** is the correct **authority** for which reap primitive runs on which of the four
  exit paths, but the spec **still carries independent normative re-declarations** of those
  same per-path facts *outside* that table — the Deliverables `modify` cells, the "unified
  rule in one line" prose, and several acceptance criteria each re-state which primitive
  runs on which settle path. That is exactly the **R11-2 danger** (a table plus surviving
  normative copies) caught mid-remediation; completing the discipline means turning each of
  those re-statements into a **citation** of the matrix. Treat this as a spec **moving
  toward** the discipline, **not** a finished single-source exemplar — the ADR does not
  claim it is clean. (The sibling `WP-a10-escape-harness`, a *separate* document, keeps its
  own **derived local copy** of the matrix, which ADR-0005 self-containment *requires* so
  the harness is implementable without opening the reap-mechanism spec — that copy is
  subordinate and legitimate, a different thing from the reap-mechanism's own out-of-table
  re-declarations.)

**Contract-dense trigger (operational).** Use reference tables when the document states
**3+** discrete contracts of these shapes:
(a) a set of paths/artifacts derived from a base (e.g. `$CORE/…`);
(b) per-platform / per-config variants of the same fact (launchd vs. systemd vs. schtasks);
(c) allow-vs-block / valid-vs-invalid rule sets;
(d) argument / enum allowlists;
(e) source-of-truth / restore / mapping rules.

**Grep-verify at extraction time (the R11-2 discipline in practice).** Because the danger
is a *surviving* independent normative copy, not a mention, an extraction is done only
after a grep confirms every independent re-statement of the contract now cites the table
rather than re-asserting its facts. The reviewer and architect own this check (below).

**When NOT to tabularize — ONE contract-level exception.** A specific **contract** —
never a whole spec — is exempt from tabularization **only when a runnable gate enforces
every one of its facts exhaustively and directly**; the gate is then that contract's single
authority, so a table would be redundant. **This is the sole exception.** A spec-level
carve-out would swallow everything — the repo template *requires* every WP to carry
acceptance criteria and verification steps, so "has an acceptance test or a harness"
describes nearly every spec — and the ADR's own successes contradict a spec-level reading:
the incident-runbook was tabularized *despite* a mandatory three-config end-to-end dry-run
gate, and the settle-path matrix *despite* a live merge-gate harness. A general acceptance
test or live harness therefore does **not** exempt a spec's *other* contracts: a harness
proves runtime behavior, not that every scattered prose copy of a path or rule agrees with
the others — and that drift is exactly what the tables kill. Read this way the examples are
consistent: the runbook and the settle-path matrix were tabularized precisely because their
scattered contracts were **not** each exhaustively, directly gate-enforced.

**Pre-contract design notes, and only until a contract appears.** Genuinely *progressive*
design work (each finding builds on the last) is real design churn, not scattered-contract
thrash — but this leniency is scoped strictly to **pre-contract design notes that do not
yet state a discrete contract**. **The moment a triggered document states discrete contract
facts** (any of the five shapes above), the leniency ends and **only the
exhaustive-runnable-gate exception applies**; there is no second, subjective "progressive
design stays prose" carve-out for content that has already hardened into a contract. In the
A9/A10 session the A10 reap **code** contracts stayed prose while they were still
progressive design notes; the one element that had hardened into a discrete, drift-prone
contract — the settle-path matrix — correctly got a table.

**How we enforce it (four-point process integration).**

1. **Spec template** (`docs/specs/_TEMPLATE.md`) — add an *optional* "Contract reference"
   section plus the 3+-contracts trigger note. Strongest preventive: it sits where the
   architect starts, in view every time.
2. **wd-architect = owner of the pattern** — recognize contract-density, author tabular
   contracts *from the start* when the trigger fires, and know the remedial extraction
   move including the purge-all-copies discipline.
3. **wd-reviewer = detector** — flag contract-dense inline prose and recurring
   same-contract findings, and recommend extraction. The reviewer flags; the architect
   extracts.
4. **codex-review runbook** (`docs/runbooks/codex-review.md`) — add a loop
   circuit-breaker: if two consecutive review rounds produce a finding on the *same*
   contract family, stop the finding-by-finding fixing and do a contract-extraction pass
   instead. The core-resolution evidence *is* exactly this trigger — its four findings fell
   in two consecutive rounds (7 and 8), i.e. ~2 rounds on one contract family before anyone
   extracted; the circuit-breaker would have fired at the round-8 finding.

This is a **presentation discipline**, not a new gate. It does not change the
One-Document Rule (ADR-0005), the Deliverables-table permission boundary, or
acceptance-criteria-as-verification-commands — tables live inside those constraints.

## Consequences

- Contract-dense specs converge under review in fewer rounds — evidence: round 9 returned
  clean immediately after the runbook extraction; the settle-matrix table closed R10-2.
- A contract fix touches one table cell, not N prose sentences; a dry-run or validation
  step gets an obvious target (validate the table against the real system).
- **Cost/risk:** the extraction itself is real work and **must** convert every independent
  normative re-statement of the contract into a citation of its table (R11-2), or it makes
  things strictly worse — a table plus a surviving normative copy is the self-contradiction,
  not a partial win. Over-tabularizing a **pre-contract design note** or an
  **exhaustively-gate-enforced contract** is waste — the trigger and the single
  contract-level "when NOT to" exception exist to bound this.
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
  slug id, `depends_on: []`, size **S**) that makes those three edits together, with the
  template's new section and the two agents' new duties verified against this ADR. That WP
  should ship *after* this ADR is ratified to Accepted.
