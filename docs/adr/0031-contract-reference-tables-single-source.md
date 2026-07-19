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
exit paths), described in four drifting locations (round-10 R10-2); extracting it to one
authoritative table resolved it.

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

**When a spec or contract-dense doc states three or more discrete contracts, extract each
contract into a single authoritative reference table and have the prose cite the table
rather than restate the contract facts inline. There is one source of truth per contract
*within that document*.**

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

The A9/A10 evidence read through this boundary: the genuine single-source win is the
settle-path reap matrix **within `WP-a10-reap-mechanism`** — that one document's four
drifting prose descriptions of which reap runs on which exit path collapsed to one
authoritative table it now cites everywhere. The sibling `WP-a10-escape-harness` (a
*separate* document) legitimately keeps a **local copy** of that matrix and restates the
per-exit-path reap operations in its Current-state, live-proof, and acceptance sections —
that is ADR-0005 self-containment doing its job, not a violation, because the harness must
be implementable without opening the reap-mechanism spec.

**Contract-dense trigger (operational).** Use reference tables when the document states
**3+** discrete contracts of these shapes:
(a) a set of paths/artifacts derived from a base (e.g. `$CORE/…`);
(b) per-platform / per-config variants of the same fact (launchd vs. systemd vs. schtasks);
(c) allow-vs-block / valid-vs-invalid rule sets;
(d) argument / enum allowlists;
(e) source-of-truth / restore / mapping rules.

**Purge-all-copies discipline (the R11-2 lesson, non-negotiable).** Extraction is
complete only when no independent restatement of the same contract survives outside the
table. When you extract, grep-verify that every scattered copy is gone and the prose now
*references* the table — a table alongside stale inline copies is a self-contradiction
worse than the original scatter.

**When NOT to tabularize — a CONTRACT-level exception, not a spec-level one (the honest
counter-case).** The exemption is scoped to a **single contract**, never to a whole spec.
A spec-level carve-out would swallow everything: the repo template *requires* every WP to
carry acceptance criteria and verification steps, so "has an acceptance test or a harness"
describes nearly every spec and the policy would almost never apply — and the ADR's own
successes contradict a spec-level reading (the incident-runbook was tabularized *despite* a
mandatory three-config end-to-end dry-run gate; the settle-path matrix was tabularized
*despite* a live merge-gate harness). So: **a specific contract is exempt from
tabularization only when a runnable gate enforces every one of its facts exhaustively and
directly** — the gate itself is the single source of truth for that contract, so a table
would be redundant. A general acceptance test or live harness does **not** exempt a spec's
*other* contracts: a harness that proves runtime behavior does not prove that every
scattered prose copy of a path or rule agrees with the others (that is precisely the drift
the tables kill). Read this way the examples are consistent: the runbook and the
settle-path matrix were tabularized because their scattered contracts were **not** each
exhaustively, directly gate-enforced — the dry-run and the harness prove behavior, not
prose agreement. The honest core still holds: genuinely *progressive* design work (each
finding builds on the last) is real design churn, not scattered-contract thrash, and is not
a tabularization target. In the same A9/A10 session the A10 reap **code** contracts largely
stayed prose for exactly that reason — progressive findings — and only their one genuinely
contract-dense, drift-prone element, the settle-path matrix, got a table.

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
- **Cost/risk:** the extraction itself is real work and **must** purge every scattered
  copy (R11-2) or it makes things strictly worse. Over-tabularizing a progressive or
  exhaustively-gate-enforced *contract* is waste (the counter-case) — the trigger and the
  contract-level "when NOT to" clause exist to bound this.
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
