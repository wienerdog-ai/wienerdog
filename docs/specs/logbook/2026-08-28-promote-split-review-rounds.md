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
