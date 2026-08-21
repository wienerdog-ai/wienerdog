---
title: Review rounds — the promote-in stacked pair
date: 2026-08-21
---

# Review rounds — WP-dream-workspace-retarget + WP-dream-promote-in-workspace

Specs: `docs/specs/WP-dream-workspace-retarget.md` (Part i),
`docs/specs/WP-dream-promote-in-workspace.md` (Part ii). Base:
`wp/dream-promote-in-workspace` @ `4dfd1e8` (src/ byte-identical to the pinned
`025021f`). Round zero: see
`2026-08-21-dream-promote-pair-round-zero.md` — closed GREEN after fixes;
nothing from it carries review credit here.

**Round counter starts at ONE.** The external reviewer is the other model
family (Codex side), per the 1a precedent. Rounds run on the Draft specs on
this branch; `Ready` comes after the loop closes.

## STOP CRITERION (pinned before the first adversarial round)

- **Closes:** one external adversarial round returns no finding about the
  PRODUCT — nothing that changes what the implementer builds in `src/` or
  `tests/`.
- **THE FAMILY ESCALATION for this package:** its characteristic failure is
  **a vault write that bypasses the promotion decision** — the whole inversion
  exists so the vault is reachable only through promotion, so any path that
  reaches it otherwise (a spawn-seam leak, a merge writing in place, a
  publish outside the compare-window guard, an abort path touching the vault)
  is the family to watch. If a round lands twice on that family, it returns to
  the owner as a ruling request with the split seam itself on the table.
- **Otherwise:** two consecutive rounds on any other same contract family →
  contract extraction, not another patch. Two consecutive rounds on an owner
  ruling → owner.

## Round log (append per round)

<!-- Round N: date, reviewer, findings count by severity, dispositions,
     commit that applies the fixes. -->
