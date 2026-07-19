---
id: WP-158
title: A7 integrity containment proof — end-to-end negative harness for the scheduler/app/executable anchors
status: In-Review
model: opus
size: M
depends_on: [WP-154, WP-155, WP-156, WP-157, WP-160]
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
- `src/core/exec-identity.js` — `createPins`, `verifyPin`, `spawnPinnedSync`/`spawnPinned`
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
| create | tests/unit/a7-integrity-negatives.test.js | The DETERMINISTIC negatives that run in `npm test` (no scenario gating): each tamper ⇒ `verifyAndResolve`/`spawnPinnedSync` refuses + the fake spawn recorded ZERO app/model launches; plus the non-vacuity baseline. |
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
   `spawnPinnedSync('claude', …)` throws (live command path ≠ pinned command
   path); the recorder shows the fake was **never** launched. *(bullet 4)*
6. **Pinned executable structural failure stops pre-spawn.** Repoint the pinned
   command symlink to a target outside the pinned install dir, or (on POSIX)
   change the target's owner, clear its exec bit, or make an ancestor dir
   group/other-writable; each ⇒ `spawnPinnedSync` throws before any spawn.
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

## Fix-pass amendments (2026-07-19)

Adversarial review (verified by execution) found the harness **substantially
vacuous** — the exact WP-082 canary class this project has a documented lesson
about. Full implementer contract + per-case mutations: `FIX-PLAN.md` cluster
**C4**. No new files (all edits within the listed Deliverables) except the shared
case module noted in A6.

**Root cause.** The launcher runs `findJob` (step 4) *before* the
descriptor-digest comparison (step 5), and `buildDescriptor` folds tree-digest
**and** stance into the digest — so the dedicated guards (containment,
tree-digest, stance) are individually redundant against the digest re-derivation,
and every case asserts only `exit==1 + zero-spawn + /integrity mismatch/` (the
last is unconditional in the alert template). Deleting any single guard leaves
the harness green.

**New binding acceptance property.** Each tamper case MUST fail if the guard it
targets is deleted — proven by asserting the **specific** refusal reason that
only that guard produces (not the generic `/integrity mismatch/`).

### A1 — targeted config poison [both, verified]
`poisonConfig` for `dream_model`/`dream_timeout_minutes` rewrites the whole
`config.yaml`, erasing the `jobs:` block, so the launcher refuses at `findJob`
before the digest check. Fix: mutate **only the target key**, preserving the
`jobs:` managed block; assert the specific descriptor-changed reason.

### A2 — guard isolation [both]
Each launcher-guard case asserts the distinct reason only that guard emits
(stance / containment / app-tree / descriptor-digest), so deleting that guard
changes the reason and fails the case.

### A3 — real manifest [both]
`buildProdInstall` writes a real `install-manifest.json` (pass `manifest` to
`vendorSelf` + `createPins`, then `save`); case 4 tampers the real manifest and
asserts refusal — not a swallowed ENOENT that degenerates to config drift.

### A4 — interrupted-update realism + positive path [both]
Case 7 uses a **valid different-version** v2 source (real `package.json` + tree)
so `vendorSelf` reaches staging; interruption is simulated **after staging
begins**; assert `current` retained + still verifies; AND add the required
**positive** clause — a completed re-vendor switches `current`, re-binds the entry
digest, and the next verify passes (exactly one spawn).

### A5 — foreign-owner row [both]
Execute the owner-uid tamper (`verifyExecutable` owner check) deterministically
via an injected/stubbed uid (no root needed); assert `spawnPinnedSync` throws
pre-spawn.

### A6 — one authoritative case list [spec]
Extract the tamper matrix into a single shared module consumed by BOTH
`a7-integrity-negatives.test.js` and `run-a7-integrity.js`; add the runner's
missing cases (2b sibling-repoint, 6a repoint-outside, 8 seams-nonexistence).
Add the new **`vault_layout` drift** tamper (from WP-156 A2) to the config-rewrite
group. The README "no gaps" claim is permitted only once one shared list covers
every launcher check and every digest-covered knob (`run`, `dream_model`,
`dream_timeout_minutes`, `vault_layout`) with an isolating case each.

### Acceptance additions
- Each tamper case fails if the guard it targets is deleted (specific-reason
  assertions) — a required, checked property.
- The `dream_model`/`dream_timeout_minutes`/`vault_layout` cases reach and trip
  the **descriptor-digest** check (not `findJob`).

### A7 — round-2 tamper-matrix additions (2026-07-19)

The round-2 design review expanded the digest coverage and split catch-up; the
shared case list (A6) must add:
- **[R2:F5]** drift cases for `dream_max_input_bytes` and the **outer**
  `timeout_minutes` (both now digest-covered), and a "seams deleted" cross-check
  for `WIENERDOG_FAKE_TODAY` / `WIENERDOG_RUNJOB_TIMEOUT_MS` (setting them has
  zero effect — same shape as case 8).
- **[R2:F1]** a **partial pin store** case: a store with git but no claude ⇒ the
  dream job does not bind/register (or `spawnPinnedSync('claude', …)` throws) —
  a planted `~/.local/bin/claude` never runs.
- **[R2:F10]** a **git-worktree dev** positive: a dev-stance install with `.git`
  as a **file** + a tracked-source edit still runs (config-fields-only dev digest).
- **[R2:F12]** a **catch-up file-forge** negative (belongs with **WP-160** once
  it lands): editing `config.yaml` + the per-job entry **source file** (without
  reload) still refuses at catch-up — the loaded-registration map is the anchor.
  Until WP-160 lands, mark this case pending and note it in the README. (WP-158
  now `depends_on: WP-160`, so the harness ships with this case executable.)
- **[R3:#3]** an **`at`-only schedule rewrite** case: rewriting a job's `at` in
  `config.yaml` (no other change) ⇒ digest drift ⇒ refuse at both the normal fire
  and catch-up (not run, not silently suppressed). Fails if `schedule` is dropped
  from the digest.
- **[R3:#4]** **scheduled-environment** negatives: an `environment.d`/`launchctl`
  change to `CLAUDE_CONFIG_DIR`/`CODEX_HOME`/`ANTHROPIC_API_KEY` (+ Windows
  `APPDATA`) does NOT alter the authorized execution context — the recorded child
  sees the canonical wienerdog config roots and no ambient key. Fails if
  `ENV_PASSTHROUGH` still carries them.
- **[R4:#2]** **hostile-HOME** negative: a hostile ambient `HOME`/`USERPROFILE`
  (with otherwise-authorized core/vault) does NOT move the child's config/
  credential root — the child resolves the **bound** home. Fails if the roots
  reconstruct from `env.HOME||os.homedir()`.
- **[R4:#1]** **catch-up job-removal / at-rewrite alert** cases (belong with
  **WP-160**): removing an authorized job, or rewriting its `at` to a future time,
  each produces a durable **alert** with zero spawn — NOT silent suppression
  (proves authorization precedes due-filtering).
- **[R4:#3 / R8:#2]** **catch-up transport** cases (WP-160), **macOS + Windows
  only**: the base64url `--job-digests` round-trips; a malformed/oversized value ⇒
  durable alert + zero spawn (no parse crash). **On Linux there is NO map** —
  assert instead that the per-job `.timer Persistent=true` invokes the NORMAL
  per-job `.service` carrying its own `--expect-digest`, and that **no separate
  all-job catch-up registration exists** on Linux.
- **[R5]** **runtime-mint** negative (WP-160): statically add/modify job B in
  `config.yaml`, then let unchanged authorized job A succeed on its normal fire ⇒
  A's success does NOT reload the catch-up entry and does NOT authorize B; the
  next catch-up **refuses B** (alert + zero spawn). Plus an attended-`sync`
  positive: removing a job (incl. the final job) cleanly refreshes/tears down the
  map. Fails if the runtime post-success `ensureCatchup` still re-binds from
  config.
- **[R6]** **missing-registration heal** (WP-160): source file + manifest intact
  and canonical but the LOADED catch-up registration missing ⇒ ONE attended
  `sync` restores it with the correct bound base64url map (assert the loaded
  entry's argv); and the generic `reloadMissing`, run alone, NEVER creates/
  authorizes the catch-up entry. Fails if repoint doesn't repair, or if
  `reloadMissing` touches catch-up.
- **[R10/R11/R12/R13]** **interpreter hijack closed by ENCAPSULATION** (WP-154): a
  pinned executable with a `#!/usr/bin/env <non-node>` shebang + a fake `<x>`
  planted FIRST on the job PATH ⇒ the plant records **ZERO executions**
  (spy/marker) at **all** exec sites, which now all go through
  `spawnPinnedSync`/`spawnPinned` (the only public exec API): fire, `createPins`,
  `createPins({dryRun:true})`, adopt's preflight, and `captureClaudeVersion`.
  **[R13]** Plus: (i) a **recursive** case — an absolute interpreter whose own
  shebang is `#!/usr/bin/env x` + planted `x` ⇒ refuse, `x` never runs; (ii) the
  **[R15] execution-only boundary canary** (`tests/unit/pinned-exec-canary.test.js`)
  in `npm test`: `exec-identity.js` public exports equal the EXACT path-free list
  `{createPins, loadPins, spawnPinnedSync, spawnPinned, EXEC_PINS_PATH}`; no module
  outside it imports an internal exec-path helper; no module feeds a pin-state field
  into a `spawn*`/`exec*`; and `spawnPinned*` returns carry no `spawnfile`/
  `spawnargs`. Mutation: any site reverted to a raw `spawnSync(realpath)`, an
  internal helper exported/imported, or a raw `ChildProcess`/`spawnfile` returned ⇒
  the zero-execution / boundary / leak assertion fails.
- **[R15] One tamper case PER digest-covered field** (the WP-156 authoritative
  set): the harness must include a single-field tamper for **each** of `run`,
  `model`, `timeoutMs` (inner), `outerTimeoutMs`, `maxInputBytes`, `vaultLayout`,
  `vaultRoot`, `home`, `schedule` (`at`+tz), `promptHash` (mutate the vendored
  dream-skill/template body), each `exec` pin, and `appRelease` bytes — each ⇒
  digest drift ⇒ refuse + zero spawn (dev-stance cases exclude `treeDigest`/`version`
  per the reduction). (`profileId` is code-derived from `run`, so the `run` case
  covers it — no separate tamper.) Drop any field from the descriptor ⇒ its tamper
  stops drifting ⇒ that case fails (proving the field is digest-covered).
