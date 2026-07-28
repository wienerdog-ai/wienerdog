# ADR-0036: A contract table's `mechanism` cell states its trigger separately from its patch, identifies every seam structurally, and states one mutation per row

Status: Proposed (amends ADR-0031)
Date: 2026-07-28

> **PROPOSED. WRITTEN BY THE ARCHITECT. NOT SIGNED BY THE OWNER. NOT IN FORCE.**
>
> **Where the owner's signature goes, stated exactly.** On its own line
> immediately below the `Date:` line above, in the plain form the other ratified
> ADRs in this directory carry in their header region — the ratification token, a
> separator, and an ISO date (ADR-0035 is the shape). **That line is deliberately
> absent, and the token is deliberately not written out anywhere in this file,
> not even as a template**: `WP-secret-fence-ep2-redact-arm`'s owner-signature-form
> row **S5** is that no agent ever writes it for any reason, and this repo has
> already shipped a ratification gate that passed on the sentence explaining the
> gate (`docs/specs/logbook/2026-07-26-derived-predicates-need-their-tools-registered.md`).
> The negative is spelled in words above for the same reason: writing `NOT <token>`
> re-creates the false positive.
>
> **Until that line exists, nothing here binds anyone.** No spec, no agent
> definition, no template and no runbook is governed by this ADR today, and no
> document may cite it as authority. Documents that cite it now cite it as a
> *proposal*, conditioned on signature.
>
> **Why a new indexed ADR rather than an appendix on ADR-0031.** Owner ruling,
> 2026-07-28: this follows the repo's dominant tradition — an indexed ADR that
> amends an earlier one (ADR-0011 amends 0006; ADR-0013 amends 0003 and 0006;
> ADR-0016 amends 0003, 0006 and 0013). An earlier draft of this content sat in
> an appendix inside ADR-0031 itself; that is withdrawn, ADR-0031 is byte-identical
> to what it was before, and this file is the only home.

## Context

**ADR-0031 governs *which* surface decides a contract's facts** — one canonical
reference table per dense contract, every other surface a registered mirror that
defers to it. It says nothing about the **shape of a cell inside** that table.
This ADR is the missing half, and it exists because one shape of cell has now
failed three times on one table, always *green*.

**The failing family: `WP-secret-fence-ep2-redact-arm`'s Table T** — canonical for
how every Table R row is produced and observed.

| when | what shipped | why nothing caught it |
|---|---|---|
| design-gate **round 6** | row **FI-19** with no fall-through trigger | the patch was never reached, so the arm completed on its success path; the row's own post-mortem reads *"the row asserted an outcome its own mechanism could not reach, and M-50 had nothing to redden"* |
| design-gate **round 8** | FI-19 repaired with a corrected **ordinal** — a let-through list of reads | the list is arithmetically wrong for the trigger the same row mandates: on that trigger the arm returns before one of the reads it counts, so the count is of a sequence that does not occur |
| the **PR #122** implementation round | round 8's error found, plus the same trigger omission on row **FI-10**, plus row **M-23** stating two independent mutations | all three were reported under *Discovered issues* and worked around by the implementer; the rows stayed wrong in a `Done` spec until the errata of 2026-07-28 |

**The rounds are 6, 8 and the PR round — not consecutive, measured rather than
assumed.** That matters: ADR-0031's two-consecutive-rounds circuit-breaker never
fired on this family, because the family skipped a round each time. A breaker that
watches for a contract a review keeps returning to *within* one loop cannot see a
defect that lands, goes quiet, and lands again. That is the argument for a schema
rather than for more of the existing gate.

**The prior art, and it is the same disease with the same cure.**
`docs/specs/done/WP-refusal-remedy-discriminator.md` carries a canonical
gate-evidence table (header `| gate | kind | verdict comes from | proved green on |
proved red on |`, at that file's line 1308 as measured 2026-07-28 — the header is
the anchor, the number is a convenience). Across its **five** review rounds that
table produced **seven** falsified claims:

1. round 2's sweep claim that *"every gate was proven in both directions"* — two gates were in none of its three buckets;
2. the **AC8 gate**'s recorded proof — vacuous, firing its marker on any tree once the branch was committed (line 1326);
3. the **README M2 gate**'s recorded proof — inverted, red on correct work and green on no work at all (line 1335);
4. round 3's verdict columns for the five stale-prose gates — recorded swapped, caught in round 4 (line 1315);
5. `npm test` recorded as having *"no WP-specific red input"* — false (line 1265);
6. `npm run lint`, same claim, same round, also false (line 1265);
7. the blanket *"the gates are complete"* claim — falsified in three separate rounds (line 1290).

**A column ended it.** That table gained a **`kind`** column — `completion` (red on
an untouched tree) versus `regression` (green on one) — and the judgement that had
been re-argued round after round became a field every row must fill, **measured by
running the gate on an untouched tree**. The spec states the resulting rule
directly: *"Never infer the kind from the command's shape; the last two rounds each
got it wrong that way."*

**The measurement is the whole lesson, not the column.** A field an author may
fill by assertion buys nothing; `kind` works because filling it requires a run.
This ADR's decision is written so that every clause has an exemption and **every
exemption has a measurement**, which is the property the two review rounds on this
ADR's own drafts kept finding missing.

## Decision

**One canonical table. This is the single place these three clauses are decided,
and every other statement of them anywhere — in this ADR, in any spec, in any
agent brief — is a mirrored summary that defers to it (ADR-0031's core rule,
applied to this ADR's own content).**

Scope: the family of canonical tables that tell an implementer how to **produce** a
state rather than what must be true of it — fault-injection tables, mutation
tables, and any table carrying a `mechanism`, `seam`, `how to produce it` or
equivalent column.

### Table A — canonical: the three clauses, their exemptions, and how each exemption is measured

| # | clause — what the cell must state | what it forbids | its exemption | how the exemption is MEASURED (an unmeasured exemption is not available) |
|---|---|---|---|---|
| **A1** | **A `mechanism` cell names at least two fields: a TRIGGER and a PATCH.** The **patch** is the fault itself — the stub, the stateful wrapper, the permission change. The **trigger** is what puts the system on the code path where that patch is reached | a cell that names only patches and leaves reachability implied. This is the round-6 FI-19 shape and the FI-10 shape: the patch is never reached, the assertion about the failure path is never evaluated, and the row is green either way | **`TRIGGER: none — the patch is reached on the ordinary path`** is a permitted value | **the row records the injection run and its own produced cell observed as ENTERED** — the failure-path assertion evaluated, not merely a suite that passed. An unverified *"none"* is the FI-10 defect written down rather than removed, because the claim is exactly what nobody checked. This cell is what gives A1 parity with the `kind` column, which is admissible only with the untouched-tree run behind it |
| **A2** | **EVERY seam the cell names — trigger AND patch — is identified structurally**, by the event that must have happened, not by a position in a sequence | an **ordinal** anywhere in the cell when a structural anchor is available. *"the first read after the withheld preserve's write failed"* survives a reordering; *"the third read"* is a standing claim about which calls run, falsified by any short-circuit on the path the row itself mandates. **The scope is every seam and not the trigger**, and that is the clause's whole point: FI-19's ordinal was never in its trigger — the trigger was a structural `spawnPinnedSync` wrapper — it was in the **patch**, a counter throwing on the *n*-th call. A rule reaching only triggers leaves the actual defect legal | **a COUNTED seam is admissible where no structural anchor exists**, provided the count is **relative to an arming event** rather than absolute over the run | **two legs, both required.** **(i) The arming event is itself identified STRUCTURALLY — by a named row of a canonical table, never by an ordinal.** The good precedent conforms: FI-2's counter arms at **Table K row K1**, a registered canonical row. An arming event stated as *"the second target read of the run"* is an absolute ordinal in a relative costume — 2 + 2 is still 4 — and readmits the round-8 defect one level down. **(ii) The row records WHAT STRUCTURAL ANCHOR WAS SOUGHT AND WHY NONE EXISTS.** Without this leg the exemption is author say-so while A1's is a measurement, and that asymmetry is what two review rounds on this ADR's drafts landed on |
| **A3** | **A mutation row states exactly one mutation**, and *one mutation* means **one independently-revertible change**, not one sentence | a row conjoining two changes either of which could be made without the other. Applied together, either half alone reddens the named check, so a green sweep is compatible with one clause being unenforced — nothing distinguishes "both held" from "one held". Two such changes are two rows and two ids | **a single coherent revert that necessarily moves two rows of the same contract together is ONE mutation** and may stay one row | **the row states why no half can be run alone**, naming the definitional dependency that couples them. Worked instance: `WP-secret-fence-ep2-redact-arm`'s **M-48** moves the prune from per-run to per-call, which violates Table N rows **N2** and **N3** — but N3's candidate set is *defined* as "every basename **this run** created", so per-call scoping collapses N3 as a consequence and there is no edit violating N2 alone. Contrast **M-23**, which conjoined an ordering change and an exclusion change: each is separately revertible, each reddens a **different** acceptance-criterion case, and the split was settled by running both halves |

**How the three clauses relate.** A1 makes reachability a stated field; A2 makes
every field's seam falsifiable rather than positional; A3 makes a row's claim
attributable to one change. A1 and A2 are about *mechanism* cells; A3 is about
*mutation* rows. A row can satisfy all three and still be a bad row — these are
completeness conditions on the cell, not a proof of the row's design.

## Consequences

- A recurring judgement becomes a field, and an empty or unmeasured field is
  visible in the table itself — the `kind`-column move, applied to `mechanism`.
- **Cost, stated honestly:** every exemption now carries a measurement, so a row
  that would previously have been written in one sentence needs a run behind it.
  That is the intended cost; the alternative is the three green failures above.
- **This is a presentation-and-evidence discipline, not a gate.** No tooling, no
  daemon, no telemetry, no CI step (ADR-0004 holds, on its own terms — it governs
  what Wienerdog installs on user machines, and this ADR installs nothing).
- Does **not** change ADR-0031's core rule, the One-Document Rule (ADR-0005), the
  Deliverables-table permission boundary, or
  acceptance-criteria-as-verification-commands.
- ADR-0031's Mirrored Surface Checklist governs Table A above like any other
  canonical table: a change to a row changes every registered mirror in the same
  pass.

## Implementation — deliberately none yet

**Nothing lands until the signature line described in the header exists.** When it
does, the surfaces that would carry Table A are `docs/specs/_TEMPLATE.md` and the
`wd-architect` / `wd-reviewer` definitions — the same three artifacts ADR-0031's
own Implementation section already routes through the follow-up WP
`WP-contract-reference-tables`. Table A therefore lands **in that WP or a
successor**, as a summary that points here, never as a direct edit and never as a
second independent statement of the three clauses.

**Registered mirrors of Table A as of 2026-07-28**, per ADR-0031's
register-new-mirrors obligation:

- `docs/specs/done/WP-secret-fence-ep2-redact-arm.md` — the post-Done errata block
  in Table T's preamble, and the Table T bullet of that spec's Mirrored Surface
  Checklist. Both are short summaries that name this table as canonical and state
  that this ADR is unsigned; neither restates a clause in full, because a mirror
  that reproduces a clause is a mirror that can drift from it.

There are no other mirrors. This list moves in the same pass as Table A.
