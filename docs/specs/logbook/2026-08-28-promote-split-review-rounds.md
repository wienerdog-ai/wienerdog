---
title: Review rounds — the promote split pair
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-in-workspace]
---

# Review rounds — the promote split pair

Specs: `docs/specs/WP-dream-promote-module.md` and
`docs/specs/WP-dream-promote-in-workspace.md`. Base: `main` @ `36c2ce5`.

**No round history is inherited from the pre-split spec's ten rounds.** Those
findings were dispositioned against the unsplit text
(`2026-08-21-dream-promote-pair-review-rounds.md`); anything still applying had
to be re-found against these two.

## STOP CRITERION (pinned before the round, per the owner's ruling)

- **The owner authorised ONE external round** (2026-08-28), after round zero.
  **AMENDED 2026-08-28, same day: a SECOND round is authorised under the
  runbook's HEAVY rule** — round 1's fix changed `promote()`'s return type, and
  weighted closure says a HEAVY fix lands and then earns a full fresh external
  round. It runs **on the whole settled text**, not on the diff.
- **"CLEAN" IS DEFINED HERE, BEFORE THE ROUND RUNS, so the definition cannot be
  chosen after seeing the findings:** a round is clean when it returns **no
  A-band and no B-band finding**. C-band findings are spec hygiene by
  definition; per the runbook they are fixed or accepted as named residuals and
  **do not extend the loop**. This matches the runbook's own closure rule — the
  loop is done when a round finds nothing about the PRODUCT — and the A/B/C
  ruler the standing reporting rule already binds every round to.
- **A clean round is the owner's authorised trigger for the `Ready` flip and the
  PR** (owner, 2026-08-28). Not clean → disposition, and the loop rules below
  apply.
- **The family escalation, carried forward unchanged from the pre-split loop:**
  this family's characteristic failure is **a vault write that bypasses the
  promotion decision**, or **a decision made on bytes other than the ones that
  get published**. A round landing twice on that family returns to the owner
  with the seam on the table.
- **The Table R tripwire** (`2026-08-28-promote-split-owner-ruling.md`) is
  measured at the close of every round. It did not fire.

## Round zero — 2026-08-28 — internal, both disciplines

Full record: `2026-08-28-promote-split-round-zero.md`. **1 B, 4 C, zero A.** The
B: the pipeline half claimed three consumed-by-nothing modules where two already
have a module-level requirer. Fixed by quantifying over entry points.

## Round 1 — 2026-08-28 — reviewer: gptsol (Codex side), external

Raw output committed before adjudication:
`2026-08-28-promote-split-round-1-raw.md`. Verdict **needs-attention**, **one
finding, band B, zero scope objections**. Read-only verified independently
(`git status --porcelain` empty before and after).

### The finding, and why it is a good one

**The module's canonical return shape could not carry what its own prose
promised.** `@returns` typed `promoted:string[]` and `redacted:Array<{rel}>` —
paths only — while Table E's staged-bytes row said the module "supplies the
returned bytes in `promoted`", and the pipeline's row G8 required the commit to
carry "the bytes `promote()` returned". An implementer conforming to the
interface would have had three options: violate the interface, violate G8's
no-re-read rule, or invent an undocumented side channel. **The second of those
is the family failure this loop exists to catch** — staging by naming the path
re-reads the working tree, so a user save landing after the publish enters the
commit ungated.

**Reproduced independently by this author before acting**, per the runbook's
spot-check rule: `@returns` at `:210-215`, the Table E claim at `:365`, and row
G8's requirement all read as the finding describes.

**This defect is the split's own.** The pre-split spec had the same
`promoted:string[]`, but the commit rule lived in the same document, where no
interface had to carry it across a boundary. The split is what made the seam
load-bearing — and the split record's own claim to have "marked the commit rule
as a handoff" was true and insufficient: marking a handoff is not the same as
checking that the interface can carry it. **That is the reusable lesson.**

### Disposition

| # | Band | Disposition |
|---|---|---|
| R1-1 | B | **ACCEPTED and FIXED**, in the shape the reviewer's first option named — one field, no second mapping, per CLAUDE.md's simpler-option rule |

Applied:

- `@returns` now types `promoted:Array<{rel:string, bytes:Buffer}>` and
  `redacted:Array<{rel:string, bytes:Buffer}>`, with a `bytes` paragraph binding
  it to Table H's H6 and naming why it is in the interface rather than in prose.
  `report.bytes` is preserved for the separately accounted report outcome, as
  the reviewer recommended.
- Table E's staged-bytes handoff row now names the three fields.
- Pipeline row G8 now names the same three fields and cites where they are
  decided.
- A NEW Mirrored Surface Checklist entry in the module half registers the
  field-plus-rule pair, with the prohibition stated: **no surface may state the
  staged-bytes rule without the field that carries the bytes.** The pipeline's
  handoff bullet now names the fields too, so the two move together.
- The pipeline's decided-bytes acceptance criterion now asserts a REDACTED path
  as well as a promoted one — both carry `bytes`, both enter the commit, and the
  pre-fix criterion exercised only one of them.

**Counts after the fix: module half 24 acceptance criteria / 3 deliverables;
pipeline half 15 / 6.** Unchanged. The tripwire does not fire. `npm run lint`
exit 0.

### Weighted closure — the classification, and the one open question

The runbook's rule: a finding is **HEAVY** when fixing it changes what the
implementer builds in the product; HEAVY means "fixes land, then a full fresh
external round". **R1-1 is HEAVY.** It changes `promote()`'s return type, which
is `src/` behaviour and the pipeline's consumption of it — not verification
machinery.

**So the runbook asks for a second external round, and the owner authorised
one.** That is a genuine conflict between a standing rule and a specific
authorisation, and it is not the author's to resolve. It is recorded here and
put to the owner rather than settled by either silently running an unauthorised
round or silently skipping a standing rule.

The honest arguments on both sides, since the owner decides:

- **For a second round:** the fix touches the exact seam the family escalation
  names, and every fix in this program has injected 0.5–0.9 new defects. The fix
  also GREW the surface — one new checklist entry, one widened criterion, a new
  interface field — and the convergence condition is a frozen surface.
- **Against:** round 1 returned a single B and zero A, with zero scope
  objections, on text that had already passed round zero's two disciplines. The
  fix is the reviewer's own recommended shape, applied narrowly, and it makes a
  rule that was previously unimplementable implementable — it removes a degree
  of freedom rather than adding one. The specs stay `Draft`, so the PR gates and
  the implementer both still run on this text before anything ships.

## Round 2 — 2026-08-28 — reviewer: gptsol (Codex side), external, FRESH agent, WHOLE TEXT

Raw output committed before adjudication:
`2026-08-28-promote-split-round-2-raw.md`. Verdict **needs-attention**, **two
findings, both band B, zero scope objections.** Read-only verified
independently. Authorised by the owner under the runbook's HEAVY rule.

**NOT CLEAN** by the criterion pinned before the round: a clean round returns no
A-band and no B-band finding. Two B. **So the `Ready` flip and the PR do not
fire.** The definition was fixed in advance precisely so this could not be
argued after the fact.

### Prior findings, re-audited by the reviewer

| Prior | Reviewer's verdict |
|---|---|
| R1-1 | genuinely fixed **for ordinary and redacted notes** — with a surviving sibling on the report (its Finding 2) |
| Z1, Z2, Z3 | genuinely fixed, each with the current lines cited |

### The findings

| # | Band | Finding |
|---|---|---|
| R2-1 | **B** | **The pipeline drops the validator's post-commit skill-ownership registration.** Today `validateAndCommit` collects accepted NEW dream-created skill drafts (`validate.js:1200-1205`) and calls `recordSkills` after the commit (`:1443-1448`, Step 6). Table G replaced the validator's classification, gates, report and commit and assigned that side effect to **nobody** — Current state merely *acknowledged* Step 6. A conforming implementation leaves the old code and its passing unit test in place while production registration is dead: green tests, missing product. A committed-but-unregistered skill is not dream-owned, so every later autonomous revision of it fails closed |
| R2-2 | **B** | **`report.bytes` was still optional across the whole union**, so a conforming successful report outcome could omit the very bytes row G8 must stage — reintroducing, through the report, the exact decision-bytes-versus-committed-bytes race round 1 closed for ordinary notes |

Both reproduced independently by this author before acting, per the runbook's
spot-check rule: the two `validate.js` ranges, the `WP-083` acceptance criteria,
the absence of any registry obligation in Table G / the criteria / Out of scope,
and the optional `bytes?:Buffer` in the report union all read as reported.

### TWO LOOP MECHANISMS FIRED, and both were followed

**1. The ADR-0031 circuit-breaker.** R1-1 and R2-2 are the SAME contract in two
places — *the decided bytes must reach the commit, and the interface must carry
them across the package boundary*. Two consecutive external rounds on one
contract family is the breaker's trigger, and its rule is explicit: **stop
fixing finding-by-finding and do a contract-EXTRACTION pass instead.**

Done. **Table S — the decided bytes, and what may be derived from them** is now
the single canonical place that contract is decided, with its mirrors registered
in both specs' Mirrored Surface Checklists. `### Exact contracts`, Table E's
staged-bytes row and rows G8/G10 all CITE it; none restates it.

**The extraction earned its keep immediately, which is the evidence the
diagnosis was right:** row **S4** generalises the rule from "the staged content"
to *every fact a consumer derives about a published path* — and that
generalisation is exactly what R2-1's registry entry needed, since today's code
reads `id` and `created` by re-reading the vault path (`validate.js:1203`). One
extraction covers round 1's finding, round 2's second finding, and the derivation
half of round 2's first. Row **S5** then names the consumers as a closed list and
makes an unowned consumer a finding by construction — the shape R2-1 arrived in.

**2. The family escalation pinned in this record's STOP CRITERION.** The pinned
text: *this family's characteristic failure is a vault write that bypasses the
promotion decision, or a decision made on bytes other than the ones that get
published; a round landing twice on that family returns to the owner with the
seam on the table.* R1-1 and R2-2 are both that family. **It fires. It is
escalated below rather than absorbed.**

### Dispositions

| # | Disposition |
|---|---|
| R2-1 | **ACCEPTED and FIXED.** New Table G row **G10** assigns the obligation, and it is not a port: (i) "NEW" can no longer be `change.untracked` (`validate.js:1202`) — a git INDEX fact, the same class of evidence whose absence made this family's predecessor `Superseded` — so newness comes from the delta status `added` for a path the outcome shows PUBLISHED; (ii) `id`/`created` derive from the decided bytes per Table S row S4, never from a re-read; (iii) the call still runs only after the commit succeeds. A new acceptance criterion asserts the entry for an ordinary AND a redacted acceptance, with three negatives, proven RED against a pipeline that never calls `recordSkills`. `skill-registry.js` is called, not modified, and is named in Out of scope |
| R2-2 | **ACCEPTED and FIXED**, in the reviewer's own recommended shape: `report` is now a DISCRIMINATED UNION whose published arms require `bytes` and whose refused arm cannot carry them. Table S row S2 states the rule as a SHAPE rule and says why — twice now the prose was right and the type was not. A new module criterion asserts bytes per outcome, proven RED against a return omitting them on the report's published arms |

### Defects this round's own fixes introduced, found and fixed in the same pass

Recorded rather than quietly corrected, because the 0.5–0.9-per-fix injection
rate is this loop's convergence argument and hiding an instance weakens it:

- **Row G10 was inserted BEFORE G9**, leaving the table reading G8, G10, G9.
  Caught by a mechanical row-order check, swapped back.
- **The family-letter division went stale in five surfaces** the moment Table S
  existed (both package notes, two Deliverables cells, two checklist bullets, one
  Out of scope bullet). All updated; the owner's seam ruling is quoted verbatim
  where it appears and deliberately NOT rewritten — S adds no subject, it gives
  an existing one an owner, and both specs now say so.
- **"The two rows it DOES discharge"** became ambiguous once G10 existed. Now
  stated as two DIFFERENT counts that happen to share a member: two handoffs
  (G7, G8) and two decided-bytes consumers (G8, G10), with G10 named as a
  consumer and not a handoff.

### Measurements after the round

| Measure | Value | Tripwire |
|---|---|---|
| module half acceptance criteria | **25** (was 24) | T1 fires above 28 — **not fired** |
| of those, the report's | **6** (unchanged) | T2 fires above 8 — **not fired** |
| module half deliverables | **3** | — |
| pipeline half acceptance criteria / deliverables | **16** / **6** | — |

`npm run lint` exit 0.

## ESCALATED TO THE OWNER — the family escalation fired

The pinned criterion is not discretionary, so this is stated as a fact and not
as a recommendation, and the seam question is put on the table as the criterion
requires. **What the owner is being asked to rule is whether the seam stays as
ruled.** The author's own reading, given plainly and without advocacy:

**The evidence that the seam CAUSED these findings.** Both R1-1 and R2-2 are
failures of a contract to cross a package boundary. Pre-split, the decided-bytes
rule and the commit that consumes it lived in ONE document, where no interface
had to carry anything; nothing could go stale between them because there was no
"between". The split created the boundary and therefore created the defect class.
Two rounds, two instances, and the second survived the first's fix.

**The evidence that the seam is nonetheless SOUND.** Every instance was found,
and found cheaply, by exactly the mechanisms the repo has for this — an external
round, then a circuit-breaker that converted the second instance into a
canonical table rather than a third patch. R2-1, the round's other finding, is
NOT a seam defect at all: the validator's Step 6 was unowned in the pre-split
spec too, and it went unnoticed there because one document made "who owns this"
un-askable. **The seam did not create R2-1; it exposed it.** And the split's own
reason has not moved: the pre-split package measured L, and "L is forbidden" is
house law.

**What has changed since the seam was ruled** is that the boundary now has a
named contract with an owner and registered mirrors, which it did not have when
either finding was written. Whether that is enough is the owner's call, not the
author's.

**No `Ready` flip and no PR.** The round was not clean, and the trigger the
owner set was a clean round.

### OWNER RULING on the escalation (2026-08-28)

**THE SEAM STANDS.** Two reasons, in the owner's terms:

1. **Table S IS the boundary's contract.** The thing that was missing when both
   findings were written now exists, is owned, and has registered mirrors. A
   boundary with a named contract is not the same object as a boundary without
   one, and it is the latter that produced R1-1 and R2-2.
2. **R2-1 is exposed inheritance, not a seam defect.** The validator's Step 6 was
   unowned before the split as well; the seam made "who owns this" an askable
   question and the question got asked. A boundary that surfaces a pre-existing
   gap is doing its job, not creating work.

**Consequence for this record's STOP CRITERION — stated so the next round does
not re-escalate a settled question.** The family escalation has now FIRED and
been ANSWERED. A third finding on the decided-bytes family therefore no longer
means "the seam is suspect"; that is ruled. It would mean **Table S is not
working as the boundary's contract**, which is a different claim with a different
remedy — the table's own rows, mirrors and prohibitions — and it returns to the
owner as that, not as a seam question. **The seam is closed to re-litigation
absent new evidence of a kind neither round produced.**

## Round 3 — authorised 2026-08-28

**Authorised by the owner under the runbook's HEAVY rule**, on the same terms as
round 2: the **whole settled text**, not the diff, and **the clean definition
pinned above stands unchanged** — no A-band and no B-band finding. Round 2's
fixes were larger than round 1's (a new canonical table, a new Table G row, two
new acceptance criteria, and five stale mirrors repaired), which is precisely
what the HEAVY rule exists to re-test.

**A clean round 3 is the owner's authorised trigger for the `Ready` flip on both
specs and the PR** (owner: "tiszta = Ready-flip + PR #30").
