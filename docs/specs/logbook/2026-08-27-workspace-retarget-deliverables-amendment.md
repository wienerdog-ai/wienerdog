---
title: Deliverables amendment — WP-dream-workspace-retarget
date: 2026-08-27
related_wps: [WP-dream-workspace-retarget]
---

# Deliverables amendment — WP-dream-workspace-retarget

Spec: `docs/specs/WP-dream-workspace-retarget.md`. Base: `main` @
`2cfb2b1d9bb47dbe44664ef49b40823d5deb7c26` (`2cfb2b1`). The spec was originally
pinned at `025021f`; it is re-pinned forward to `2cfb2b1` in the same pass, on
the measured ground that `git diff --name-only 025021f 2cfb2b1` yields twelve
paths and zero outside `docs/`.

## The dispatch-blocking defect, reported by the implementer

The implementer delivered all five original Deliverables files (branch
`wp/dream-workspace-retarget` @ `819bca9`, sibling worktree) and stopped on a
boundary violation instead of working around it. Measured on that branch,
**twenty tests fail across FOUR files** the Deliverables table did not list.
The count is pinned to this itemization and to nothing else:

| File | Failures | Cause |
|---|---:|---|
| `tests/unit/dream-brain.test.js` | 5 | the rename |
| `tests/unit/codex-adapter.test.js` | 2 | the rename |
| `tests/integration/dream.test.js` | 12 | the constructed child env |
| `tests/integration/reap-escape.test.js` | 1 | the constructed child env |
| **Total** | **20** | **four files** |

An earlier draft of this entry said "twenty tests fail in five files" and listed
`tests/integration/adopt-e2e.test.js` as the fifth. Both were wrong; the
correction is below.

Two independent causes, and neither has a workaround inside the original
boundary:

1. **The rename.** The spec's Exact contracts require `spawnBrain`'s
   write-target option to become `workspaceDir`. That breaks its existing call
   sites — eleven measured option-passing sites in `dream-brain.test.js`, three
   in `codex-adapter.test.js`, one in `dream.test.js` (`:1481`). The rename
   either happens or it does not.
2. **The constructed child env** (spec Table B, site 7) stops inheriting the
   ambient environment, which is the only channel the repo's fake-brain
   fixtures are steered through: `WIENERDOG_FAKE_BRAIN_MODE` (nine modes in
   `tests/fixtures/dream/fake-brain.js`), `WIENERDOG_FAKE_TODAY`
   (`fake-brain.js:16`, `fake-brain-mapped.js:15`), `WIENERDOG_HOME`
   (`fake-brain.js:66`) and `WD_SPAWN_VARIANT_MODE`/`_OUT`
   (`spawn-variant.js:49-50`).

## The A7 guard, stated at its measured strength

`tests/unit/a7-integrity-negatives.test.js:383` greps `src/` for exactly four
literal names:

    WIENERDOG_RUNJOB_CMD|WIENERDOG_DREAM_CMD|WIENERDOG_FAKE_TODAY|WIENERDOG_RUNJOB_TIMEOUT_MS

It does **not** forbid test-only names in `src/` in general, and an earlier
draft of the spec said it did. The distinction is load-bearing for the design
below: the guard would catch a re-added `WIENERDOG_FAKE_TODAY` and would catch
nothing at all about a newly-invented control name — a `WIENERDOG_DREAM_`-prefixed
one included. So the guard is a backstop for one of four names, never the reason
a new env seam is refused. The reason is that a name in `src/` existing only so
tests can steer the child IS the WP-155-class production test seam the audit
deleted.

## The contradiction, restated on the correct evidence

`tests/integration/dream.test.js` drives the fake brain through
`WIENERDOG_FAKE_TODAY` at two measured sites:

- `:226` — `runDream` assigns it into `process.env` before an in-process
  `dream.run`, which reaches `spawnBrain` with `env: process.env`
  (`src/cli/dream.js:145`);
- `:1486` — a direct `spawnBrain` call passes it in the explicit `env` option,
  which `brain.js:171` spreads into the child.

Both channels close when the child env is constructed. Restoring either by
putting `WIENERDOG_FAKE_TODAY` on the production allowlist puts that literal
back into `src/`, which is precisely what the A7 guard greps for. Within the
original boundary no implementation satisfies all three constraints.

## The adopt-e2e correction

The earlier draft named `tests/integration/adopt-e2e.test.js` as broken by this
WP and used it as the contradiction's evidence. Both are withdrawn.

- Measured, the file's failure delta against `main` is **+0**: its one failing
  test (`adopt-e2e: init → adopt → sync → dream through mapped tiers, one
  revertable commit`) is already red at the pinned base.
- The failure is environmental, not contractual. On a machine where a real
  `claude` is on `PATH`, `sync` pins that binary while the test's temp
  `.local/bin/claude` wins resolution at dream time, and the run is refused in
  `src/core/exec-identity.js:490` (`resolvePinnedSpawn`), reached from
  `src/core/dream/brain.js:208`.
- **The ordering claim an earlier draft used here is WITHDRAWN.** That draft said
  the refusal happens "before any child env is composed". Measured, the order is
  the reverse: `spawnBrain` composes the child env FIRST
  (`src/core/dream/brain.js:169-178`) and only then hands it to `spawnPinned`
  (`:208`, `env: childEnv` at `:213`); the re-reviewer's stack trace shows the
  refusal inside that call. Never restate the ordering claim.
- **What actually insulates the test is PATH RESOLUTION, and it survives site 7.**
  `spawnPinned` resolves the harness on the `PATH` in the env it is HANDED
  (`src/core/exec-identity.js:621-627` → `:486` → `verifyPin`'s
  `resolveExecutable` at `:451`). Site 7's contract sanitises that `PATH` by
  removing components at or beneath the vault. The test's temp bin dir is
  `<home>/.local/bin` (`tests/integration/adopt-e2e.test.js:75`, `:105`) while
  both of its vaults are SIBLING temp directories (`:74`, `:77`) — neither the
  bin dir's ancestor nor its descendant — so the
  sanitiser leaves the dir on `PATH` and the pre-existing drift refusal is
  unchanged. Measured against the implementer's branch at `819bca9`: failure
  delta **+0**. No contract in this WP moves that verdict.
- Consequence: the test file is **not** granted. Its fixture
  (`tests/fixtures/adopt/fake-brain-mapped.js`) is, because the fixture's own
  ambient input has to move; see the mechanism below, which is chosen so that
  the fixture needs no test-side change.

## The ruling (owner, 2026-08-27)

**Seven precise FILE rows, not three directory rows.** The first draft of this
amendment granted `tests/unit/`, `tests/integration/` and `tests/fixtures/`
using `scripts/boundary-check.js`'s trailing-slash rule. That is withdrawn: the
three prefixes open 133 files, including every security-guard test and
`tests/unit/a7-integrity-negatives.test.js` itself — the guard this WP's design
exists to satisfy. A boundary that can edit its own guard is not a boundary.
The rows are exactly:

    tests/unit/dream-brain.test.js
    tests/unit/codex-adapter.test.js
    tests/integration/dream.test.js
    tests/integration/reap-escape.test.js
    tests/fixtures/dream/fake-brain.js
    tests/fixtures/adopt/fake-brain-mapped.js
    tests/fixtures/reap/spawn-variant.js

Also withdrawn: the first draft's claim that eight file rows "would put the
table at 13 rows against the ten-row hard cap." **There is no ten-row cap.**
Exhaustive grep over the repo finds the phrase only in that draft;
`scripts/boundary-check.js` parses every `|`-delimited row under
`## Deliverables` with no bound. The row count was never a reason for anything,
and the duplicate-grant problem it created (a file covered by both a directory
prefix and its own row) disappears with it.

Verified against the live script before ruling: the four always-allowed paths
are the spec file, `package-lock.json`, `memory/lessons/inbox.md` and
`docs/specs/logbook/` — tests are not among them, so the widening is required.

**`tests/golden/` stays out.** Golden fixtures change only when a spec
explicitly says so; a blanket `tests/` grant would silently retire that
protection.

## The PATH ruling (owner, 2026-08-27)

Round 3's finding F7 established that the constructed child env must keep
`PATH` — `spawnPinned` re-resolves the logical harness name through the env it
is handed (`src/core/exec-identity.js:451-472`, `:621-627`), so dropping `PATH`
breaks pin verification before the child starts, while copying it verbatim can
carry a vault-rooted component and break CLAIM 1. What F7 did NOT settle was
what the kept `PATH` is BUILT FROM, and the spec and the implementation drifted
apart on exactly that: the spec's site-7 cell said "built from the system
defaults with every component at or beneath the vault removed", the
implementation built the job's own `PATH` with those components filtered out
(`src/core/dream/brain.js:264-265`, `sanitizeBrainPath` at `:277-283`, branch
`wp/dream-workspace-retarget` @ `819bca9`).

**Ruled: the implementer's wording binds — the child `PATH` is THE JOB'S OWN
`PATH` with every component at or beneath the vault removed. Sanitised, not
omitted; filtered, not rebuilt.** Three grounds, recorded so the reading is not
re-litigated:

1. **The system-defaults reading would break the product on the primary
   platform — measured, not argued.** The pinned harness lives in a
   version-manager bin directory that the system defaults do not contain. On the
   authoring machine the pin store's own path proves it; from the adopt-e2e run
   quoted below, verbatim:

       the pinned command path is /Users/felho/.local/share/fnm/node-versions/v24.18.0/installation/bin/claude

   A `PATH` rebuilt from the system defaults contains no such component, so
   `verifyPin`'s `resolveExecutable` (`src/core/exec-identity.js:451`) would find
   the harness NOWHERE and refuse with "no longer resolves on the job PATH"
   (`:453`) — every dream run, on every such machine. A fence that stops the
   product from running is not a fence.
2. **The security goal is untouched by the choice.** What CLAIM 1 asserts is
   that no vault-derived component reaches the child's `PATH`. The filter
   delivers that identically under either reading — the difference is only which
   NON-vault components survive.
3. **The `+0` measurement was taken against the filtered-own-`PATH`
   implementation.** It was measured at `819bca9` — the filtered reading — not
   against the defaults reading, so it does not transfer to a defaults-built
   `PATH`. Re-run fresh at both ends while applying this revision, one test file,
   `node --test tests/integration/adopt-e2e.test.js`:

   | Tree | tests | pass | fail | failing test |
   |---|---:|---:|---:|---|
   | base (`2cfb2b1` src/tests) | 5 | 4 | 1 | `adopt-e2e: init → adopt → sync → dream through mapped tiers, one revertable commit` |
   | impl (`819bca9`) | 5 | 4 | 1 | the same one |

   Delta **+0**, and the failure is the drift refusal quoted in ground 1 — whose
   stack is `resolvePinnedSpawn` (`exec-identity.js:490`) ← `spawnPinned`
   (`:624`) ← `spawnBrain`, confirming once more that the refusal happens INSIDE
   the pinned-spawn call the composed env is handed to.

Site 7's cell now states the ruled wording, and the spec's two adopt-e2e
surfaces — the boundary paragraph and the Out-of-scope bullet — state the
insulation on the sanitiser's rule rather than on any ordering claim.

## The fixture-control mechanism (decision)

The design constraint: **no new environment name may enter the constructed
child env in `src/`.** Candidates were evaluated against the tree at `2cfb2b1`.

- **Rejected — fixture arguments baked into the brain command's argv.**
  `tests/fixtures/reap/spawn-variant.js:48-50` already selects a mode from
  `argv[2]`, so the route looked available. It is not: on a brain spawn
  `src/core/dream/brain.js` composes every argv element, and the pin store
  record carries NO argv slot — measured, its fields are exactly `commandPath`,
  `installDir`, `version` and `pinnedAt`
  (`tests/integration/dream.test.js:189`) — so there is no slot through which a
  test argument reaches the child. `spawn-variant.js`
  documents this itself (`:14-18`).
- **Rejected — widening the constructed env.** See the A7 section: a
  test-control name in `src/` is a WP-155-class seam whether or not the guard's
  four literals happen to catch it.
- **CHOSEN — two channels, neither of them the ambient environment.**
  1. **Run inputs travel the way the real brain receives them.** Vault, scratch
     and layout already arrive in the three constructed `WIENERDOG_DREAM_*`
     values (`brain.js:169-178`). The run DATE arrives in the PROMPT, which is
     an argv element on both arms — Claude `src/core/runtime-profile.js:189`
     (`'-p', prompt`), Codex `brain.js:129` (positional, last) — and
     `brain.js:58` composes the literal line `Today's date: ${date}`. A fixture
     parses its own `process.argv`; `spawn-variant.js:43` already reads argv
     this way for `--version`. **This is what keeps `adopt-e2e` whole**: the
     mapped fixture's only ambient input is the date (`fake-brain-mapped.js:15`),
     so it needs no control file and its test needs no edit.
  2. **Scenario selection travels in a control file** the installing test writes
     beside the pinned command, resolved by the fixture from its own
     `__dirname`. Every fixture brain is installed by copying it into a
     test-owned temp bin dir and pinning that path
     (`tests/integration/dream.test.js:186-187`,
     `tests/integration/reap-escape.test.js:868-869`,
     `tests/integration/adopt-e2e.test.js:107-108`), so the fixture's
     `__dirname` at run time is that temp dir and never the repo. Owner: the
     installing test. Absent the file, a fixture keeps its present defaults.
     **The control file is the FALLBACK, never an override: a fixture's own argv
     selection takes precedence over it.** Measured, `spawn-variant.js:49`
     already prefers `argv[2]` when it is not flag-shaped and consults the
     ambient env only otherwise; the control file replaces the ENV in that
     fallback, not `argv[2]`. That precedence is load-bearing, not cosmetic:
     `spawnSleeper` re-spawns the SAME script with `'sleep'` as `argv[2]` and
     clears the env mode vars to stop a fork bomb (`spawn-variant.js:64-72`),
     but the re-spawned child resolves the SAME `__dirname` and so re-reads the
     SAME control file. Under argv precedence it still runs `sleep`; under
     control-file precedence it would inherit the parent's spawning mode and
     fork-bomb. The ADR-0004 "no fixture outlives its job" guard therefore
     survives BY argv precedence, and the spec's canonical row says so.

Neither channel touches `src/`. The canonical statement is the spec's Table B
fixture-control row; the Deliverables `Notes` cells, the acceptance criteria and
the A7 verification step are registered as its mirrors in the Mirrored Surface
Checklist (ADR-0031).

## Scope of this amendment

The spec's Deliverables table and its surrounding prose, Table B's new
fixture-control row and its site-count cell, the Mirrored Surface Checklist,
two acceptance criteria, the verification steps, the Current-state
child-env sentence, the Out-of-scope list, the dispatch-precondition re-pin,
Table B site 7's `PATH` sentence and its env citation (the PATH ruling above) —
and this logbook entry. Nothing else: the implementation continues on the
implementer's branch once this lands on `main`.
