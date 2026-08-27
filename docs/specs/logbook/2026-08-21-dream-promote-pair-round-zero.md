---
title: Round zero — the promote-in stacked pair
date: 2026-08-21
---

# Round zero — WP-dream-workspace-retarget + WP-dream-promote-in-workspace

Post-split round zero on the stacked pair, run as three clean-context passes:
per-spec template conformance + internal coherence (each reviewer saw ONE spec
plus the template, the authoring runbook, `docs/specs/README.md`, the schema
and CLAUDE.md — deliberately NOT the sibling, so self-containedness failures
surface as findings), and a pair-level pass (completeness diff against the
unsplit spec at `6e1f355`, cross-citation resolution, contradiction scan,
letter-space, frontmatter).

**Round counter starts at ZERO for each half.** The pre-split round zero's
findings were dispositioned against the unsplit text; nothing carries.

Base: `wp/dream-promote-in-workspace` @ `8bcf23c` (src/ tree byte-identical to
the pinned `025021f`). Result: **2 blockers, 10 findings, 13 notes — all
dispositioned; fixes applied in the commit that adds this file.**

## Blockers (both fixed)

- **Part i — the symlink-exclusion rationale misstated the dependency, and
  Table F contradicted it.** The spec claimed the dependency's capture "refuses"
  / "throws" on a symlink; measured, `captureBaseline` records a
  `{rel, kind:'symlink'}` anomaly and RETURNS a complete baseline (its
  `@throws` covers only unreadable entries). An implementer could have relied
  on a fail-closed that does not exist. Fix: the exclusions row states the
  measured behaviour; `createWorkspace`'s contract now fails closed on a
  non-empty `anomalies` list (contract, Table A, security checklist and the
  fail-closed acceptance criterion all updated); Table F's static-symlink
  wording aligned to the anomaly semantics.
- **Part ii — the `promote()` `gates` JSDoc said "each takes candidate bytes",
  contradicting Table D on the data-loss-critical point** (the EP2 gate judges
  delta added-lines BEFORE the merge; the skill guard also takes the baseline
  ledger). The drifted mirror is rewritten to state per-gate inputs and defer
  to Table D.

## Findings (all fixed)

- Vacuously green verification commands, both specs: `--test-name-pattern`
  with zero matches exits 0 (measured, Node 24), so every pattern run against
  a created test file is now guarded by `test -f` — the guard is what makes
  the deliverable-absent state red.
- Part ii had no runnable command for pipeline-level CLAIM 1 / CLAIM 2b (pair
  pass): added, with fixed test names `claim-1-pipeline` and `claim-2b`.
- Deliverables without criteria: GLOSSARY (both halves), ADR-0012 (Part ii) —
  criteria plus guarded greps added.
- Part i package note over-attributed ("the mechanisms that close them ship
  here"): now names what ships where (pair pass).
- Identifier collision: audit findings C2/C3/M9 vs Table C row ids — audit ids
  now carry the "audit finding" prefix (Part ii).
- One-Document gaps: M7/M10 now defined in Part i with the audit citation; the
  sibling's API signatures routed by code path in Part ii's Current state
  (cited, not restated, so they cannot drift); the M2 constructed-environment
  recipe now points at the Done dependency spec on main and
  `src/core/exec-identity.js`; the caller invariant is stated in one sentence
  where Part ii discharges it.
- Table B's env-var row justified the re-point with a Claude-arm-only fact;
  now states both arms (the Codex arm CAN read env — its own Table F row).
- `import('../paths').Paths` → `WienerdogPaths` (the only typedef that exists).
- Precision: the transitional call site is `:144-145` (call opens `:144`,
  write-target argument at `:145`); `SKILL.md:52` → `:52-54`; the reap verdict
  is "consumed only to gate the pidfile unlink, never surfaced to the caller"
  rather than "discarded".

## Dispositions without a text change

- H1 subtitle differing from the frontmatter title: follows main precedent
  (`done/WP-dream-baseline-delta-primitive.md` does the same).
- "War-room" / "intent brief" references: follow main precedent (both Done
  dream specs carry one); each spec now qualifies them once as records kept
  outside this repo.
- Local `main` ref stale (`0d7de7c`): the branch's `src/` tree is
  byte-identical to `025021f`; "at authoring time" keeps the claim honest. The
  dispatch re-verifier should fetch before re-running citations.
- Table D's three non-gate rows riding the gate table: internally explained,
  left as is.
- Sizing: Part ii sits exactly at the 8-file cap; recorded, accepted.

## Pair-level verdict (unchanged by the fixes)

No original normative content silently lost; every cross-reference between the
halves resolves with matching content; no contradictions; letter-space and
frontmatter dependencies coherent. The completeness inventory lives in the
round's raw output (war-room side); this file records the verdicts.

Round zero closes GREEN after fixes. Next: the external adversarial review
rounds run on the Draft specs on this branch (round counter from 1, stop
criterion pinned in the review-rounds entry BEFORE the first round — the 1a
precedent); `Ready` comes after that loop closes and is the owner's flip,
Part i first; the two PR review gates then run on each PR's diff.
