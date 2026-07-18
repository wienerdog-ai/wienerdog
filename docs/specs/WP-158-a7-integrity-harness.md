---
id: WP-158
title: A7 integrity containment proof — end-to-end negative harness for the scheduler/app/executable anchors
status: Ready
model: opus
size: M
depends_on: [WP-154, WP-155, WP-156, WP-157]
adrs: [ADR-0004, ADR-0009, ADR-0013, ADR-0028]
branch: wp/158-a7-integrity-harness
---

# WP-158: A7 end-to-end integrity containment harness (audit A7, part 5 of 6)

## Context (read this, nothing else)

A7 hardens the three integrity anchors of Wienerdog's unattended nightly run:
the **pinned external executables** (WP-154), the **deleted test-exec env seams**
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
`~/.local/bin` but NOT the launcher file or the OS entry) and the
*drift-detection* positives; it does **not** assert protection against an actor
who can overwrite the launcher itself (`<core>/launcher/launch.js`, a core-wide
write that defeats the launcher layer alone) or rewrite the OS scheduler entry —
the harness must not claim that.

> **ADR note:** `ADR-0028` records the A7 architectural decision — a **new ADR**
> (owner-assigned 2026-07-18), distinct from ADR-0027 (A8's re-derived scheduler
> *unload*). The ADR-0028 file is written as the A7 spec walkthrough concludes;
> until then this spec set is the design-of-record.

## Current state

The A7 mechanisms this harness exercises exist after its dependencies land:
- `src/core/exec-identity.js` — `createPins`, `verifyPin`, `resolvePinnedSpawn`
  (WP-154).
- `src/cli/run-job.js` `resolveCommand` + `src/core/dream/brain.js` with the
  test-exec env seams DELETED (WP-155): neither reads `WIENERDOG_RUNJOB_CMD`/
  `WIENERDOG_DREAM_CMD`; the run-job fake is a JS-only `opts.resolveCommand`
  injection and the dream brain is substituted only via the WP-154 pin store.
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
| create | tests/scenarios/a7-integrity/fixtures/ | A minimal fake `app/current` tree, a fake `claude`/`git` executable, a poisoned `config.yaml` (`run` \| `dream_model` \| `dream_timeout_minutes` rewrite), a planted `~/.local/bin/claude`, a planted `.git` dir inside the app tree (prod→dev stance downgrade). |
| create | tests/scenarios/a7-integrity/README.md | What it proves (the six A7 ACTION-LIST bullets plus the walkthrough-added timeout/model/stance drift cases), how to run, the gating, the honest boundary (scoped-write negatives, not same-user-native). |
| create | tests/unit/a7-integrity-negatives.test.js | The DETERMINISTIC negatives that run in `npm test` (no scenario gating): each tamper ⇒ `verifyAndResolve`/`resolvePinnedSpawn` refuses + the fake spawn recorded ZERO app/model launches; plus the non-vacuity baseline. |
| modify | package.json | Add `scenarios:a7-integrity` (guarded identically to WP-133/142: skip + exit 0 without `WIENERDOG_RUN_SCENARIOS`). Do NOT change other scripts. |

### What the harness proves (cases 1-8 map to the six A7 ACTION-LIST bullets + the walkthrough-added drift cases)

Using a **recording fake spawn** (a seam replacing the launcher's `spawn`, or a
JS-only `opts.resolveCommand` injection pointing at a recorder — there is no env
seam to abuse post-WP-155), against a
disposable temp `$HOME`/`WIENERDOG_HOME`. Most cases carry a `*(bullet N)*`
mapping to the audit's six A7 ACTION-LIST bullets; the walkthrough-added
timeout/model/stance drift cases map instead to the ratified WP-156/157 decisions
they prove end-to-end (there are still exactly six ACTION-LIST bullets — no new
bullet is invented; see the tamper-matrix OWNER-APPROVED marker below):

0. **Non-vacuity baseline (control).** The clean, untampered fixture (matching
   pins + matching descriptor + intact app) makes `verifyAndResolve` return `ok`
   and the fake spawn records **exactly one** intended `node currentBin run-job
   <name>` launch — proving the harness truly drives the path (so every "zero
   spawn" below is meaningful).
1. **Config authorized-field rewrite (`run` | `dream_model` | `dream_timeout_minutes`)
   ⇒ mismatch + zero spawn.** After the OS entry's `--expect-digest` was bound,
   rewrite — as **three separate tampers** — the job's `run` action, then the
   `dream_model` key, then the `dream_timeout_minutes` key in `config.yaml`. Each
   makes the launcher re-derive a descriptor digest ≠ the bound `--expect-digest`,
   so `verifyAndResolve` refuses; a fixed alert is appended; **zero** recorded
   spawns per tamper. The `run` tamper is the audit's bullet-1 negative; the
   `dream_model` and `dream_timeout_minutes` tampers are the fire-time end-to-end
   proof of the WP-156 model and effective-timeout decisions (WP-156's unit tests
   prove the digest *changes*; this proves the launcher *refuses* at fire time).
   *(bullet 1 + WP-156 model/timeout decisions)*
2. **App byte mutation / `current` repoint / out-of-root symlink ⇒ zero spawn.**
   Each of: flip a byte under `app/current`; repoint `current` to a sibling dir;
   make `current` a symlink to a dir outside `<core>/app`. Each ⇒ refuse, **zero**
   recorded spawns. *(bullet 2)*
3. **prod/dev stance downgrade (planted `.git`) ⇒ refuse + zero spawn.** With a
   `prod`-stance descriptor + entry, plant a `.git` dir inside the temp
   `app/current` tree so the live tree now looks like a dev checkout
   (`isDevCheckout` true). `verifyAndResolve` refuses on the **stance mismatch**
   (prod entry over a dev-looking tree) — it does **not** silently downgrade to the
   unverified `dev` path — **zero** recorded spawns. This is the exact WP-157 attack
   ("an attacker cannot plant a `.git` to downgrade a prod install to unverified
   `dev`"), and it closes the one launcher check (prod/dev stance) that previously
   had no harness case. *(WP-157 prod/dev stance check — no distinct ACTION-LIST bullet)*
4. **Manifest+config rewrite cannot defeat the unchanged descriptor.** With the OS
   entry's bound `--expect-digest` unchanged, rewriting both `config.yaml` and the
   manifest still refuses. *(bullet 3)*
5. **Fake `claude`/`git` earlier on PATH never executes.** With a valid claude
   pin, plant `<tmp>/.local/bin/claude` earlier on the job PATH;
   `resolvePinnedSpawn('claude', …)` throws (live command path ≠ pinned command
   path); the recorder shows the fake was **never** launched. *(bullet 4)*
6. **Pinned executable structural failure stops pre-spawn.** Repoint the pinned
   command symlink to a target outside the pinned install dir, or (on POSIX)
   change the target's owner, clear its exec bit, or make an ancestor dir
   group/other-writable; each ⇒ `resolvePinnedSpawn` throws before any spawn.
   (In-place byte mutation of the user-owned target is NOT detected — WP-154
   honest boundary.) *(bullet 5)*
7. **Valid update switches atomically; interrupted update retains the old version.**
   A completed re-vendor switches `current` + re-binds the entry digest and the
   next verify passes; an interrupted publish (staging dir removed before rename)
   leaves the prior valid `current` + entry verifying and runnable. *(bullet 6)*
8. **Test-exec seams do not exist (WP-155 cross-check).** Setting
   `WIENERDOG_RUNJOB_CMD` and `WIENERDOG_DREAM_CMD` has **no effect** —
   `resolveCommand`/`spawnBrain` read neither, and `grep -rn
   'WIENERDOG_RUNJOB_CMD\|WIENERDOG_DREAM_CMD' src/` is empty. The recorder shows
   the real resolution regardless of the env vars.

> **RESOLVED (OWNER-APPROVED 2026-07-18, A7 walkthrough) — tamper matrix completed
> (timeout/model drift + stance downgrade).** Three cases were added so the harness
> is gap-free across every fire-time check the launcher performs: (a) a
> `dream_timeout_minutes` rewrite and (b) a `dream_model` rewrite — folded into case
> 1 as separate tampers — give the end-to-end fire-time proof of the WP-156
> effective-timeout and model decisions (WP-156's unit tests prove the digest
> *changes*; this harness proves the launcher's fire-time *refusal*); and (c) case
> 3, a planted-`.git` prod→dev **stance downgrade**, closes the one WP-157 launcher
> check (prod/dev stance) that previously had no harness case. **Completeness
> rationale:** the matrix now covers all **four** launcher checks — current
> containment (case 2), app `treeDigest` (case 2), descriptor digest (cases 1, 4),
> and prod/dev stance (case 3) — and all **three** digest-covered config knobs —
> `run`, `dream_model`, `dream_timeout_minutes` (case 1) — with **no gaps**.
> **Mapping honesty (for the Codex review):** the audit ACTION-LIST still has
> exactly **six** A7 bullets; these three added cases map to the already-ratified
> WP-156/157 decisions, **not** to any newly-invented ACTION-LIST bullet — case 1's
> model/timeout tampers to WP-156's `model`/effective-timeout markers, case 3 to
> WP-157's prod/dev stance check.

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
      fails loud if ANY tamper in the matrix — the six ACTION-LIST negatives plus the
      walkthrough-added timeout/model/stance drift cases — spawns the app/model, or if
      a fail-safe is missed. It spends no quota, never writes the maintainer's real
      config, and never touches the real OS scheduler.
- [ ] The non-vacuity baseline records exactly one intended spawn on the clean
      fixture, so "zero spawn on tamper" cannot pass vacuously.
- [ ] `wienerdog safety` (if invoked) shows all five P0 gates BLOCKED — this
      harness opens no gate.

## Acceptance criteria (mapped to the A7 acceptance bullets)

- [ ] `npm test -- --test-name-pattern "a7-integrity-negatives"` passes: the
      config authorized-field rewrite — `run`/`dream_model`/`dream_timeout_minutes` (1),
      app-mutation/repoint/out-of-root (2), prod/dev stance downgrade — planted `.git` (3),
      manifest+config (4), PATH-fake (5), pin structural failure —
      repoint/owner/mode/ancestor (6), and update-atomicity (7) negatives each refuse
      with **zero** recorded app/model spawn, plus the non-vacuity baseline (0) and the
      WP-155 seams-do-not-exist cross-check (8).
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
