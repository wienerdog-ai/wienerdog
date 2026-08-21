---
title: Review rounds — WP-dream-gate-inputs-baseline-delta
date: 2026-08-21
---

# Review rounds — WP-dream-gate-inputs-baseline-delta

Spec: `docs/specs/WP-dream-gate-inputs-baseline-delta.md`. Base: `main` @ `e648284`.

**Round counter starts at ZERO.** This package is the first half of direction (A)'s
two-package split. No round history is inherited from the two superseded Draft halves
(`WP-dream-denied-object-disposal`, `WP-dream-fence-candidate-set`) or from their
parent: their records are EVIDENCE for measurements this spec carries, never review
credit. Anything from those rounds that still applies must be re-found here.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the PRODUCT —
  nothing that changes what the implementer builds in `src/`.
- **THE FAMILY ESCALATION for this package:** its characteristic failure is a
  **silently weakened gate** — a substitution that passes because the fixture lets
  both sources agree. If a round lands twice on that family, it returns to the owner
  as a ruling request with the split seam itself on the table.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction, not another patch. Two consecutive rounds on an owner ruling → owner
  ruling request.
- **Surface frozen:** the three new assertions in Verification steps are the entire
  machinery budget. No new source-level greps; the discrimination requirement is
  carried by the behavioural divergence proof, which does not grow.
- **Scope frozen:** this package is behaviour-preserving. A finding about the
  workspace as the brain's write target, the promotion policy, the EP2 **enforcement**
  half, or any gate's policy values is ROUTED to the second (A) package, never folded
  in. The two second-package obligations are already named in Out of scope so they
  cannot arrive later as an acceptance criterion.

## Rounds

| Round | Kind | Raw record | Commit that introduced the raw | Verdict |
|---|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-21-dream-gate-inputs-baseline-delta-r0-template-conformance-raw.md` | this commit | CONFORMANT — 0 blocking, 3 non-blocking |
| 0b | Internal coherence + runnable criteria | `docs/specs/logbook/2026-08-21-dream-gate-inputs-baseline-delta-r0-internal-coherence-raw.md` | this commit | 15 findings, all fixed |
| 1 | External adversarial (design) | — | — | NOT YET RUN |

## Round 0 dispositions

**0a — three non-blocking observations, all ACCEPTED as-is, no edit:**

1. The template's `### Contract table(s)` heading appears as three headings
   `### Table A/B/C …`. Accepted: the template asks for one canonical table per dense
   contract and names them by role; the worked example
   (`docs/specs/done/WP-daily-summary-per-line-framing.md`) sets the same precedent.
2. Instruction parentheticals dropped from the `## Contract reference` and
   `## Security checklist` headings. Accepted: they are template instructions to the
   author, not section titles; the worked example drops them likewise.
3. Two extra unheaded blocks (the dispatch-precondition paragraph, the post-fence
   commentary under Verification steps). Accepted: extra sections are permitted, both
   were named, and the second is required by the authoring runbook's both-sides rule.

**0b — fifteen findings, all FIXED before this commit:**

| # | Finding | Class | Weight |
|---|---|---|---|
| 1–12 | Twelve stale `file:line` citations (`:210`, `:348`, `:521`, `:524`, `:553`, `:1146`, `:1174`, `:1191-1193`, `:1302`, `:752-765`, `:1136-1143`, `:1329-1331`) | citation drift | LIGHT |
| 13 | "no real brain is spawned by any test" — an ungated universal, false as written: the `npm run scenarios` harnesses do spawn a real `claude` | Current-state accuracy | LIGHT |
| 14 | The Deliverables rows permitted touching two test files while an acceptance criterion forbade editing existing assertions — the two surfaces disagreed on what an implementer may do | contradiction | **HEAVY** (by the when-in-doubt rule: it bounds what gets built) |
| 15 | The first form of the `changedPaths` gate (`grep -c … -le 1`) passes when the definition is deleted and the caller left in place — it could not discriminate the thing it asserts | verification machinery | LIGHT |

**Root cause recorded, not excused (findings 1–12).** The citations were assembled
across several reading passes and some were transcribed from a block's opening line
rather than re-run at the line the claim names. Twelve of roughly thirty-five drifted.
Finding 8 is the sharp one: `:1191-1193` did not merely drift, it pointed at the
previous branch's tail instead of the ordering comment it claimed to cite. **Every
`file:line` in a spec is re-run at the line it names, at write time — not carried
forward from an earlier read of the same region.**

**Weighted closure.** One HEAVY finding (14) landed, so the next step is a full fresh
external adversarial round (round 1), not a mechanical re-check. All fifteen fixes are
re-measured against the tree in §5 of the internal-coherence record.
