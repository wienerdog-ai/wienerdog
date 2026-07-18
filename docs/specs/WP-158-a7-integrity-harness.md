---
id: WP-158
title: A7 integrity containment proof — end-to-end negative harness for the scheduler/app/executable anchors
status: Draft
model: opus
size: M
depends_on: [WP-154, WP-155, WP-156, WP-157]
adrs: [ADR-0004, ADR-0009, ADR-0013, ADR-0028]
branch: wp/158-a7-integrity-harness
---

# WP-158: A7 end-to-end integrity containment harness (audit A7, part 5 of 6)

## Context (read this, nothing else)

A7 hardens the three integrity anchors of Wienerdog's unattended nightly run:
the **pinned external executables** (WP-154), the **inert test-exec seams**
(WP-155), the **canonical digest-bound job descriptor** (WP-156), and the
**out-of-tree launcher** that verifies the app + descriptor before spawning
(WP-157). **IRON RULE (ADR-0004): Wienerdog is just files.** The audit is
explicit that "a work package is not complete until its adversarial criteria
execute on the final bytes." This WP is that proof: an end-to-end **negative
harness** that drives the real launcher/run-job path against each tamper and
asserts **zero model/app spawn** (or the correct fail-safe), à la WP-133 /
WP-142 for the A1/A2 gates.

The harness never spends model quota and never touches the maintainer's real
config: it drives `src/scheduler/launcher.js` (`verifyAndResolve` + a spawn seam)
and the pin/descriptor modules against fixtures in a disposable temp `$HOME`/core,
using a **recording fake spawn** so a would-be model/app launch is captured, not
executed. A single spawn that should not happen is a **hard fail**. A
**non-vacuity control** (the WP-133/142 precedent) asserts the clean baseline
actually *would* spawn, so "zero spawn on tamper" can never pass because the
harness failed to run at all.

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH
the core and the OS scheduler can still replace both anchors. A7 protects
**scoped core writes** and **detects drift**; it is **NOT** a claim against
arbitrary same-user native malware — that is A12's territory. This harness
proves the *scoped-write* negatives (write `config.yaml`/`app/current`/
`~/.local/bin` but not the OS entry) and the *drift-detection* positives; it does
**not** assert protection against an actor who also rewrites the OS scheduler
entry and the launcher — the harness must not claim that.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

## Current state

The A7 mechanisms this harness exercises exist after its dependencies land:
- `src/core/exec-identity.js` — `createPins`, `verifyPin`, `resolvePinnedSpawn`
  (WP-154).
- `src/cli/run-job.js` `resolveCommand` + `src/core/dream/brain.js` fake-seam
  gates behind `WIENERDOG_TEST` (WP-155).
- `src/scheduler/descriptor.js` — `writeDescriptor`, `deriveDescriptorDigest`,
  `appTreeDigest` (WP-156).
- `src/scheduler/launcher.js` — `verifyAndResolve(paths, name, {descriptorPath,
  expectDigest, …})` returning `{ok, command, args}` | `{ok:false, reason}`, and
  `main(argv)` which spawns only on `ok` (WP-157).
- `src/core/vendor.js` — `vendorSelf`, `repointCurrent`, `verifyCurrentContainment`,
  `writeLauncher` (WP-157).

**Existing harness conventions to mirror** (WP-133 / WP-142): scenario scripts
live under `tests/scenarios/<name>/`; the live/expensive path is hard-gated by
`WIENERDOG_RUN_SCENARIOS=1` (without it the runner prints a skip and exits 0);
the deterministic negatives run in `npm test` under `tests/unit/…` or the
scenario's own non-live test; `package.json` gets a `scenarios:*` script; a
`WIENERDOG_LOADER_NOOP` / injected loader keeps the real OS scheduler untouched.
No A7 harness exists yet.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | tests/scenarios/a7-integrity/run-a7-integrity.js | The end-to-end harness: build a temp core+app+pins+descriptor+entry, then run each tamper through the real launcher with a recording fake-spawn; assert zero spawn / correct fail-safe; non-vacuity baseline. Gated by `WIENERDOG_RUN_SCENARIOS`. |
| create | tests/scenarios/a7-integrity/fixtures/ | A minimal fake `app/current` tree, a fake `claude`/`git` executable, a poisoned `config.yaml` (`run` rewrite), a planted `~/.local/bin/claude`. |
| create | tests/scenarios/a7-integrity/README.md | What it proves (the six A7 acceptance bullets), how to run, the gating, the honest boundary (scoped-write negatives, not same-user-native). |
| create | tests/unit/a7-integrity-negatives.test.js | The DETERMINISTIC negatives that run in `npm test` (no scenario gating): each tamper ⇒ `verifyAndResolve`/`resolvePinnedSpawn` refuses + the fake spawn recorded ZERO app/model launches; plus the non-vacuity baseline. |
| modify | package.json | Add `scenarios:a7-integrity` (guarded identically to WP-133/142: skip + exit 0 without `WIENERDOG_RUN_SCENARIOS`). Do NOT change other scripts. |

### What the harness proves (each maps to an A7 acceptance bullet)

Using a **recording fake spawn** (a seam replacing the launcher's `spawn`, or
`WIENERDOG_TEST=1` + `WIENERDOG_RUNJOB_CMD` pointing at a recorder), against a
disposable temp `$HOME`/`WIENERDOG_HOME`:

0. **Non-vacuity baseline (control).** The clean, untampered fixture (matching
   pins + matching descriptor + intact app) makes `verifyAndResolve` return `ok`
   and the fake spawn records **exactly one** intended `node currentBin run-job
   <name>` launch — proving the harness truly drives the path (so every "zero
   spawn" below is meaningful).
1. **Config `run` rewrite ⇒ mismatch + zero spawn.** Rewrite `config.yaml`'s `run`
   action after the entry digest was bound; the launcher refuses (re-derived
   digest ≠ bound `--expect-digest`); a fixed alert is appended; **zero** recorded
   spawns. *(bullet 1)*
2. **App byte mutation / `current` repoint / out-of-root symlink ⇒ zero spawn.**
   Each of: flip a byte under `app/current`; repoint `current` to a sibling dir;
   make `current` a symlink to a dir outside `<core>/app`. Each ⇒ refuse, **zero**
   recorded spawns. *(bullet 2)*
3. **Manifest+config rewrite cannot defeat the unchanged descriptor.** With the OS
   entry's bound `--expect-digest` unchanged, rewriting both `config.yaml` and the
   manifest still refuses. *(bullet 3)*
4. **Fake `claude`/`git` earlier on PATH never executes.** With a valid claude
   pin, plant `<tmp>/.local/bin/claude` earlier on the job PATH;
   `resolvePinnedSpawn('claude', …)` throws (live command path ≠ pinned command
   path); the recorder shows the fake was **never** launched. *(bullet 4)*
5. **Pinned executable structural failure stops pre-spawn.** Repoint the pinned
   command symlink to a target outside the pinned install dir, or (on POSIX)
   change the target's owner, clear its exec bit, or make an ancestor dir
   group/other-writable; each ⇒ `resolvePinnedSpawn` throws before any spawn.
   (In-place byte mutation of the user-owned target is NOT detected — WP-154
   honest boundary.) *(bullet 5)*
6. **Valid update switches atomically; interrupted update retains the old version.**
   A completed re-vendor switches `current` + re-binds the entry digest and the
   next verify passes; an interrupted publish (staging dir removed before rename)
   leaves the prior valid `current` + entry verifying and runnable. *(bullet 6)*
7. **Production seam inertness (WP-155 cross-check).** With `WIENERDOG_TEST` unset,
   a set `WIENERDOG_RUNJOB_CMD` is ignored by `resolveCommand` — the recorder shows
   the real resolution, not the fake.

## Implementation notes & constraints

- **Gating is sacred (WP-023/133/142).** `WIENERDOG_RUN_SCENARIOS=1` hard-gates
  `scenarios:a7-integrity`; without it the runner prints skip + exits 0. The
  DETERMINISTIC negatives (`a7-integrity-negatives.test.js`) run in `npm test`
  with no gating and spend **no** quota (no real model, no real OS scheduler:
  `WIENERDOG_LOADER_NOOP`/injected loader; the fake spawn is a recorder).
- **Never touch the real config / never read real data (WP-133/142 model).** All
  `$HOME`/`WIENERDOG_HOME`/`CLAUDE_CONFIG_DIR` redirect to temp dirs removed in a
  `finally`; the fake `claude`/`git` are inert temp scripts; no `ANTHROPIC_API_KEY`
  reaches any child.
- **This proves WP-154..WP-157; it does not modify them.** A containment gap here
  is a **spec-gap** routed back to wd-architect for a dated amendment to the
  relevant WP — never a fix smuggled into the harness. (E.g. if `verifyAndResolve`
  misses the repoint case, that is a WP-157 bug.)
- **Fail loud.** Any unexpected recorded spawn, any missed refusal, any missing
  alert, any non-vacuity failure ⇒ non-zero exit with a clear message.
- **CI stays dormant (ADR-0009):** no scheduled CI; a `scenarios-a7-integrity.yml`,
  if added, is `workflow_dispatch`-only with the dormant header.
- **No `depends_on` on WP-144/145 is asserted here even though the launcher path
  touches the manifest indirectly** — this WP writes only test files + a
  `package.json` script; it depends on the four A7 WPs whose behavior it proves
  (which themselves carry the WP-144/145 deps). It edits none of `manifest.js`/
  `schedule.js`/`generators.js`.
- Zero deps, JSDoc only. When uncertain, choose the simpler option + record it.

## Security checklist

- [ ] The harness drives the REAL launcher/pin path (not a re-implementation) and
      fails loud if ANY of the six A7 tampers spawns the app/model, or if a fail-safe
      is missed. It spends no quota, never writes the maintainer's real config, and
      never touches the real OS scheduler.
- [ ] The non-vacuity baseline records exactly one intended spawn on the clean
      fixture, so "zero spawn on tamper" cannot pass vacuously.
- [ ] `wienerdog safety` (if invoked) shows all five P0 gates BLOCKED — this
      harness opens no gate.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] `npm test -- --test-name-pattern "a7-integrity-negatives"` passes: the
      config-rewrite (1), app-mutation/repoint/out-of-root (2), manifest+config (3),
      PATH-fake (4), pin structural failure — repoint/owner/mode/ancestor (5), and update-atomicity (6)
      negatives each refuse with **zero** recorded app/model spawn, plus the
      non-vacuity baseline (0) and the WP-155 seam-inertness cross-check (7).
- [ ] `npm run scenarios:a7-integrity` with `WIENERDOG_RUN_SCENARIOS` unset prints
      skip and exits 0 (no quota); `npm test` does not run the gated scenario.
- [ ] `tests/scenarios/a7-integrity/README.md` states what is proven, how to run,
      the gating, and the honest scoped-write-vs-same-user-native boundary.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "a7-integrity-negatives"
npm run scenarios:a7-integrity     # prints skip, exits 0 (WIENERDOG_RUN_SCENARIOS unset)
npm test
npm run lint
# optional gated run (still no model quota — the fake spawn is a recorder):
WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:a7-integrity
```

## Out of scope (do NOT do these)

- Changing any A7 mechanism (`exec-identity.js`, `run-job.js`, `brain.js`,
  `descriptor.js`, `launcher.js`, `vendor.js`, `generators.js`, `schedule.js`) — a
  gap is a spec-gap back to wd-architect for **WP-154..WP-157**.
- Spending real model quota or touching the real OS scheduler / real `~/.claude`.
- A7 documentation prose — **WP-159**.

## Definition of done

1. All non-gated verification steps pass locally; output pasted into the PR body
   (state whether the optional gated run was executed and its result).
2. Branch `wp/158-a7-integrity-harness`; conventional commits; PR titled
   `test(scenarios): A7 scheduler/app/executable integrity containment proof (WP-158)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
