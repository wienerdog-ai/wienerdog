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
| 1 | External adversarial (design), gptsol, English-pinned | `docs/specs/logbook/2026-08-21-dream-gate-inputs-baseline-delta-round-1-raw.md` | this commit | **NO-SHIP** — 3 findings in scope (2 HEAVY), 1 routed |

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

## Round 1 dispositions — PROPOSED, awaiting owner ruling

Backend `gptsol`, read-only verified both sides. The reviewer ran `npm test`
(2048/2039/0/9, exit 0) and `npm run lint` (exit 0) and reproduced its two
behavioural claims in throwaway repositories outside the checkout, so this verdict
is a run, not a reading. Every citation was re-run by the orchestrator before
anything was acted on; all four findings **CONFIRMED**, and two of them are sharper
than reported (see the raw record's spot-check).

| # | Finding | Family | Weight | Proposed disposition |
|---|---|---|---|---|
| 1 | A user commit landing mid-run breaks baseline == HEAD; `isNew` then diverges from `untracked` and the skill-body guard is SKIPPED where today it reverts | silently weakened gate | **HEAVY** | **Owner ruling requested.** The spec asserts the coincidence rather than enforcing it, and the finding is correct that nothing pins HEAD between `dream.js:494` and `:558`. Two shapes to rule between: (a) capture the expected HEAD identity with the baseline and fail closed — non-destructively — if it moved; (b) narrow the substitution so `isNew` is used ONLY where "absent from the baseline" is the intended question, and every site whose real question is git's index state keeps `untracked`. (b) is smaller and preserves behaviour by construction; (a) buys a genuine invariant the second package will need anyway |
| 1b | **Orchestrator addition:** `change.untracked` has seven consumers; Table C maps two. The unmapped `:1202` site gates **ownership-registry admission**, so the same race would register the user's own skill as dream-created and authorise every FUTURE dream to revise it | silently weakened gate | **HEAVY** | Folded into the ruling on 1. Whatever shape is chosen, Table C must enumerate **all seven** sites and state, per site, which fact it consumes. The current two-row mapping is the under-specification the finding exploited |
| 2 | The mandated divergence proof cannot detect an unsubstituted Tier-3 floor: diverging baseline from HEAD only moves the candidate list, and Tier-3's substitution is live-file-bytes → `afterBytes`, which the fixture leaves identical | silently weakened gate | **HEAVY** | **Accept in full.** This is precisely the failure the stop criterion names, and the spec's own proof was blind to it. The criterion must require a discriminator **per named substitution**, not per gate: for Tier-3 a state where `afterBytes` differs from the live file at decision time, with the negative showing that restoring the filesystem read flips the outcome |
| 3 | `skillBodyViolation` cited `:320-415` (ends `:413`); `ledgerViolation` cited `:516-615` (ends `:613`) — both ranges cross into the next function's JSDoc | citation drift | LIGHT | **Accept.** Correct to `:320-413` and `:516-613`. Round zero fixed twelve citations and these two survived it, because round zero checked the lines a claim NAMES and never checked that a cited RANGE ends where the construct ends. That gap is the lesson, not the two numbers |
| R1 | Routed: EP2 Step 3 cited `:1211-1345`; the step runs past it | citation drift | LIGHT, routed | **Accept the finding, reject its number.** The reviewer's `:1211-1364` is also short: the loop closes at `:1364` but Step 3 continues to `:1372`. Correct range is `:1211-1372`. Behavioural changes in that tail stay routed to part 2 |

### Family-escalation status — read this before ruling

The pinned family for this package is **"silently weakened gate"**. This round
landed on it **twice in one round** (findings 1/1b and 2). The criterion as written
fires on two consecutive ROUNDS, so it has **not** fired — but one round hitting the
pinned family twice is the signal the criterion exists to catch, and whether that
should count is an owner call, not the orchestrator's.

What the two have in common is worth stating plainly: both are places where the spec
asserted an equivalence instead of enforcing or proving one. `isNew ≈ untracked`
"in production", and "the fixture discriminates" for a gate whose substitution the
fixture cannot see. The scope rule held — the reviewer routed correctly and folded
nothing in — and the citation work is ordinary iteration. The design question is
whether a package whose central contract is an asserted equivalence can be made
Ready by tightening it, or whether the seam itself needs re-cutting.
