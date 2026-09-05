---
id: WP-dream-git-env-validate-seam
title: Give the dream's second git spawn point the same constructed environment
status: Draft
model: sonnet
size: S
depends_on: [WP-dream-git-env-pinning]
adrs: [ADR-0004, ADR-0012, ADR-0042]
epic: dream-promotion
---

# WP-dream-git-env-validate-seam: the `assertGitRepo` spawn point

> **Draft stub, created 2026-09-05 by `WP-dream-git-env-pinning`'s design pass
> as that WP's NAMED RESIDUAL (its owner item O2).** It is not a ruled fix and
> it carries no owner decision of its own: the product decision — an environment
> built from a named allowlist rather than inherited — is already recorded in
> `WP-dream-git-env-pinning` and in ADR-0012's 2026-09-05 amendment. What is
> open here is only whether that decision is extended to the second spawn point,
> and at what cost.

## Context

The dream run makes git calls from **two** places. The pipeline's nine pinned
shapes go through `gitIn` in `src/cli/dream.js`; that seam is
`WP-dream-git-env-pinning`'s subject. The other is
`assertGitRepo(vaultDir)` (`src/cli/dream.js:587`), which runs
`git -C <vault> rev-parse --git-dir` through `validate.js`'s own module-private
`git()` (`src/core/dream/validate.js:64-81`) — a spawn point
`WP-dream-promote-in-workspace` Table W row W1(c)(i) names explicitly, and
whose election it records: *leave it, admissible only on the measurement that
`rev-parse` is index-safe.* That clause carries a **standing trigger**: any
change to what `validate.js` spawns falsifies the election.

**This WP does not change what it spawns — only the environment it spawns
under.** That distinction is the first thing its design pass must confirm
against row W1(c)(i), because if the trigger does fire, closing the seam
becomes a two-part change of which one part is owner business (it would surface
a tenth pinned shape).

**Measured, 2026-09-05, git 2.50.1** (recorded in
`docs/specs/logbook/2026-09-05-git-env-pinning-design-gate-rounds.md`): with
`GIT_DIR` exported to another repository, `git -C <dir> rev-parse --git-dir`
exits **0** for a directory that is not a repository at all — so the guard's
verdict is the launching environment's, not the vault's. With
`WP-dream-git-env-pinning` landed the consequence is bounded: the pipeline's own
calls no longer follow the redirection, so a wrongly-passing guard costs a late,
loud failure at `rev-parse HEAD` in the vault instead of the early, friendly
*"vault is not a git repository — run `npx wienerdog init` first"*. It is never a
commit into the wrong repository.

## What done means

1. `validate.js`'s `git()` builds its child environment with the same
   `buildGitEnv` that `WP-dream-git-env-pinning` creates — the environment is
   decided in ONE place, and this WP adds no second construction and no second
   allowlist. `WP-dream-git-env-pinning`'s **Table U** stays canonical for the
   channel set; this WP restates none of it.
2. The change is confirmed against `WP-dream-promote-in-workspace` Table W row
   W1(c)(i): either the standing trigger does not fire (the argv is unchanged,
   so no tenth shape is surfaced) — stated with the reasoning — or it does, and
   the WP stops and goes to the owner rather than widening the pinned set.
3. **REQUIRED VERIFICATION.** A RED proof, declared in a
   `tests/red-proofs/*.proofs.json` whose `suite` is
   `tests/unit/dream-validate.test.js` (one declaration file per suite), whose
   mutation reintroduces `GIT_DIR` inheritance at that spawn point and which
   reddens an assertion that `assertGitRepo` **refuses** a non-repository vault
   while `GIT_DIR` is exported to a real repository elsewhere. The proof is what
   makes item 1 checkable; an existence grep over `buildGitEnv` is not.
4. `WP-dream-git-env-pinning`'s owner item O2 and its "Out of scope" bullet are
   left as the record of why this was a successor rather than a fold-in; neither
   is rewritten.

## Expected shape (not yet a Deliverables table)

`src/core/dream/validate.js`, `tests/unit/dream-validate.test.js`, one new
`tests/red-proofs/*.proofs.json`. Roughly three files — an S — which is exactly
the split that kept `WP-dream-git-env-pinning` inside
`docs/specs/README.md`'s ≤8-files sizing heuristic.
