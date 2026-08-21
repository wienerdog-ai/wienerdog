---
title: Review rounds — WP-dream-baseline-delta-primitive
date: 2026-08-21
---

# Review rounds — WP-dream-baseline-delta-primitive

Spec: `docs/specs/WP-dream-baseline-delta-primitive.md`. Base: `main` @ `e648284`.

**Round counter starts at ZERO.** This package is successor 1 of the superseded
`docs/specs/done/WP-dream-gate-inputs-baseline-delta.md`. That document's three
rounds are EVIDENCE for the measurements this spec carries — above all the reason the
primitive makes no freshness claim — and are **never review credit**. Nothing found
there counts as reviewed here.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the PRODUCT.
- **THE FAMILY, inherited and re-pinned:** the predecessor died of *snapshot
  substituted for a live read*. This package's whole defence is that it substitutes
  nothing — it has no consumer. **A round that finds this package implying, assuming
  or requiring any freshness property returns to the owner**, because that is the
  failure that already cost one package.
- **Otherwise:** two consecutive rounds on any other same contract family → contract
  extraction. Two consecutive rounds on an owner ruling → owner ruling request.
- **Surface frozen:** the two new assertions in Verification steps are the entire
  machinery budget. Everything else is proven behaviourally.
- **Scope frozen:** additive by ruling. A finding that asks for a consumer, a wiring
  step, a freshness check, a generation invariant, or any policy about which files
  matter is ROUTED to successor 2, never folded in.

## Rounds

| Round | Kind | Raw record | Verdict |
|---|---|---|---|
| 0a | Template conformance (clean context, two inputs, no external reviewer) | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-r0-template-conformance-raw.md` | CONFORMANT — 0 blocking, 4 non-blocking |
| 0b | Internal coherence + runnable criteria | `docs/specs/logbook/2026-08-21-dream-baseline-delta-primitive-r0-internal-coherence-raw.md` | 5 findings, all fixed |
| 1 | External adversarial (design) | — | NOT YET RUN |

## Round 0 dispositions

**0a — four non-blocking observations, all ACCEPTED as-is**: the per-contract table
headings (the template's own body invites them, and the worked example sets the
precedent), the paraphrased-and-extended security item, and the two extra unheaded
blocks (both named; the post-fence commentary is required by the authoring runbook's
both-sides rule).

**0b — five findings, all FIXED before this commit:**

| # | Finding | Class | Weight |
|---|---|---|---|
| 1-3 | Three stale range citations — `hashScratch` `:44-56`→`:44-55`, `changedPaths` `:1020-1033`→`:1020-1034`, `private-fs.js:620-668`→`listPrivateEntries` `:619-669` (wrong at both ends) | citation drift | LIGHT |
| 4 | **The git-free assertion was a FALSE GREEN on a missing deliverable.** `! grep …` succeeds when `grep` exits 2 on a nonexistent file, so the gate passed hardest exactly when the module was never written. Hardened with `test -f` first and proven in three directions (absent → red, clean → green, dirty → red) | verification machinery | **HEAVY** — a gate that cannot fail is worse than no gate |
| 5 | `captureBaseline` returned `{Baseline}` while Table A promised anomalies reporting, so a symlink met at capture had nowhere to go and would have been dropped silently — in a module whose entire value is that its baseline is complete | contradiction | **HEAVY** |

**The range check earned its place immediately.** It was added to this spec's dispatch
precondition because the same defect recurred three times in the predecessor. Applied
to this spec's own first draft it caught three more, one of them wrong at both ends.
Five of seven ranges were already correct — the check pays for itself on the other
two.

**Weighted closure:** two HEAVY findings landed, so the next step is a full fresh
external adversarial round, not a mechanical re-check.
