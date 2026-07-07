---
id: WP-071
title: Hard test guard against real scheduler mutation (the root-cause structural fix)
status: Done
model: opus
size: M
depends_on: [WP-070]
adrs: [ADR-0004, ADR-0018]
branch: wp/071-test-guard-real-scheduler
---

# WP-071: Hard test guard against real scheduler mutation

## Context (read this, nothing else)

Wienerdog registers OS-native scheduler entries (launchd LaunchAgents, systemd
user timers, Windows Task Scheduler tasks) that all invoke a short-lived
`wienerdog run-job <name>`. The commands that **register/unregister** these
entries (`launchctl bootstrap`/`bootout`, `systemctl --user enable`/`disable`,
`schtasks /create`/`/delete`) go through a single **loader seam** in the codebase.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP adds no product
behavior; it is a **test-safety** structural fix.

### The root cause this closes (2026-07-07 incident)

On 2026-07-07 the user's launchd **dream and catchup agents were silently
UNLOADED** — plists intact on disk, but `launchctl` had no record, so 03:30 fired
nothing and no alert was raised (WP-070 makes that symptom visible). The probable
**cause**: a scheduler test running under a temp `HOME` still `launchctl
bootout`'d the **real** agent — because launchd labels (`ai.wienerdog.dream`,
`ai.wienerdog.catchup`), systemd unit names, and Task Scheduler task paths are
**per-user-global, NOT HOME-scoped**. Setting `HOME=<tempdir>` changes where the
plist *file* is written, but `launchctl bootout gui/<uid>/ai.wienerdog.dream`
targets the label in the user's **global** launchd domain — it unloads the real
agent regardless of `HOME`.

This is **confirmed present in the current test suite**. Several tests run the
real bin through `init --fresh-vault` / `uninstall` under a temp `HOME` **without**
setting `WIENERDOG_LOADER_NOOP` and **without** injecting a loader, so they reach
the real `defaultLoader` and spawn real scheduler commands:

- `tests/unit/uninstall.test.js` — `init --fresh-vault` then `uninstall` →
  `launchctl bootout gui/<uid>/ai.wienerdog.dream` **unloads the real dream agent.**
  This is the smoking gun.
- `tests/unit/codex-adapter.test.js` — `init --fresh-vault` → real `launchctl bootstrap`.
- `tests/integration/bootstrap-seam.test.js` — `init --fresh-vault` → real `launchctl bootstrap`.
- `tests/unit/doctor.test.js` — `init --fresh-vault` → real `launchctl` (this one is
  fixed by **WP-070**, which adds `WIENERDOG_LOADER_NOOP` to its `tempEnv()`; it is
  therefore NOT in this WP's Deliverables).

These "pass" today only because callers ignore the loader's return status — so the
real mutation happens silently. On CI (fresh runners) it is harmless; on a
developer/dogfooding machine (exactly the 2026-07-07 case) it corrupts the real
user's scheduler.

### The fix

A **hard guard**: when the test-run environment variable
`WIENERDOG_TEST_NO_REAL_SCHEDULER` is set, any attempt to invoke a real scheduler
**mutation** through the loader seam **throws a loud error** naming the argv,
instead of spawning. It is the belt to the existing suspenders (the injected-loader
and `WIENERDOG_LOADER_NOOP` seams): even if a test forgets to neutralize the
scheduler, the guard fires instead of hitting the real OS. Read-only *probes*
(WP-070's `launchctl print`, `systemctl is-active`, `schtasks /query`) are safe
and already return `'unknown'` under the guard (they do not mutate), so the guard
targets **mutations only**.

The test runner sets `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` for the whole suite via a
tiny zero-dependency wrapper, so the guard is active for **every** test process
without each test having to remember it.

## Current state

All paths below exist and were read for this spec.

### `src/cli/schedule.js` — `defaultLoader` (mutation seam #1)

```js
const { spawnSync } = require('node:child_process');
// ...
function defaultLoader(argv) {
  // Test/CI kill-switch (ADR-0013): higher-level flows that repoint schedules
  // (sync, and WP-044's init/adopt) must never spawn the real scheduler.
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}
```

Also in this file, `hasSystemd()` does `spawnSync('systemctl', ['--version'])` —
a **read-only capability probe**, NOT a mutation. It is **out of scope** for the
guard (do not touch it): guarding it would break `hasSystemd` on real systemd CI.

### `src/scheduler/generators.js` — `defaultCatchupLoader` (mutation seam #2)

```js
const { spawnSync } = require('node:child_process');
// ...
function defaultCatchupLoader(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}
```

These two are the **only** two functions in the codebase that spawn a real
scheduler mutation. Every registration/unregistration/reload flows through one of
them (`schedule add/remove`, `sync`/`repointSchedules`, `ensureCatchup`,
`ensureDreamSchedule`, `uninstall`'s `reverseSchedulerEntry` — which runs the
stored `unload` argv directly via `spawnSync` in `manifest.js`; see the note
below). WP-070's `reloadMissing` also routes its reload through `defaultLoader`.

### `src/core/manifest.js` — `reverseSchedulerEntry` (the uninstall unload path)

`uninstall` reverses a `scheduler-entry` by running its stored `unload` argv:

```js
// in reverseSchedulerEntry(entry, dryRun, ...)
if (Array.isArray(entry.unload) && entry.unload.length > 0) {
  if (dryRun) { process.stdout.write(`wienerdog: would run: ${entry.unload.join(' ')}\n`); }
  else {
    try { spawnSync(entry.unload[0], entry.unload.slice(1)); } catch { /* best-effort */ }
  }
}
```

**This is the actual smoking-gun path** (`uninstall.test.js` → real `launchctl
bootout`). It does NOT go through `defaultLoader`. The guard must cover it too.
Because routing this through a shared chokepoint is the clean way to make the guard
un-bypassable, this WP introduces `src/scheduler/spawn.js` and routes all three
mutation points through it.

### Test seams already in use

- Injected loader: `runSchedule(env, argv, loader)` / `withRun(..., { loader })`
  pass a `noopLoader = () => ({ status: 0 })`. These never reach `defaultLoader`.
- `WIENERDOG_LOADER_NOOP: '1'`: set in `init.test.js`, `sync-repoint.test.js`,
  `adopt-e2e.test.js`, `uninstall-core-e2e.test.js` — those are already safe.
- The forgetful tests listed above set **neither**.

### `package.json`

```json
"scripts": { "test": "node --test", "lint": "node scripts/lint.js", ... }
```

`npm test -- --test-name-pattern X` forwards `--test-name-pattern X` to
`node --test`. The wrapper this WP adds MUST preserve that forwarding.

### Non-issue (verified, do not "fix")

- `tests/integration/dream.test.js` (WP-069's file) sets up its vault with a
  **direct `git init`**, not `wienerdog init`, and `src/cli/dream.js` never calls
  the scheduler — so it reaches no scheduler mutation and the guard does not affect
  it. **Do not touch `dream.test.js` or `dream.js`** (WP-069 owns them).
- `tests/unit/scheduler-schedule.test.js` and `tests/unit/scheduler-runjob.test.js`
  already inject `loader`/`noopLoader` on every register/run call — safe under the
  guard. `tests/unit/scheduler-generators.test.js` tests only pure renderers — safe.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/scheduler/spawn.js | `schedulerSpawn(argv)` — the single mutation chokepoint; NOOP + guard + real spawn |
| modify | src/cli/schedule.js | `defaultLoader` delegates to `schedulerSpawn` |
| modify | src/scheduler/generators.js | `defaultCatchupLoader` delegates to `schedulerSpawn` |
| modify | src/core/manifest.js | `reverseSchedulerEntry`'s `unload` spawn delegates to `schedulerSpawn` |
| create | tests/run.js | zero-dep test entry: sets `WIENERDOG_TEST_NO_REAL_SCHEDULER=1`, forwards argv to `node --test` |
| modify | package.json | `"test": "node tests/run.js"` |
| create | tests/unit/scheduler-guard.test.js | proves the guard throws on mutation, no-ops under NOOP, allows read-only |
| modify | tests/unit/codex-adapter.test.js | add `WIENERDOG_LOADER_NOOP: '1'` to its subprocess env |
| modify | tests/unit/uninstall.test.js | add `WIENERDOG_LOADER_NOOP: '1'` to its `tempEnv()` (the smoking-gun test) |
| modify | tests/integration/bootstrap-seam.test.js | add `WIENERDOG_LOADER_NOOP: '1'` to its subprocess env |
| modify | tests/unit/scheduler-schedule.test.js | DISCOVERED (WP-071 impl): the spec's "safe under the guard" claim missed that its marker-based reverse/remove tests assert the stored `unload` argv EXECUTES (via a benign in-process `node -e` marker, never a real scheduler call), and the remove path runs the stored unload directly, NOT through the injected loader. NOOP cannot satisfy them (it skips the spawn); they clear the guard locally around the benign marker spawn via a `withUnloadSpawnAllowed` helper. |

**Do NOT modify** `src/cli/dream.js`, `tests/integration/dream.test.js`,
`src/scheduler/status.js` (WP-070's — its `defaultProbe` already self-guards),
`tests/unit/doctor.test.js` (WP-070 makes it hermetic), or `hasSystemd` in
`schedule.js`. If you believe another file needs the NOOP env, run the suite under
the guard and add it — but first confirm it is not already injecting a loader.

### Exact contract — `src/scheduler/spawn.js`

```js
'use strict';
const { spawnSync } = require('node:child_process');
const { WienerdogError } = require('../core/errors');

/**
 * The ONE chokepoint for spawning a real OS-scheduler MUTATION (launchctl
 * bootstrap/bootout, systemctl enable/disable, schtasks /create /delete, and the
 * uninstall `unload` argv). Ordering:
 *   1. WIENERDOG_LOADER_NOOP set → return {status:0} (existing neutralizer; a test
 *      that has deliberately opted out of real scheduling).
 *   2. WIENERDOG_TEST_NO_REAL_SCHEDULER set → THROW loudly. The hard guard: a test
 *      reached a real scheduler mutation without neutralizing it. Fail the test with
 *      a message that names the argv and the fix, instead of mutating the real
 *      per-user-global scheduler (launchd/systemd/schtasks identifiers are NOT
 *      HOME-scoped — a temp-HOME test still hits the real agent).
 *   3. Otherwise → real spawnSync (production).
 * @param {string[]} argv  e.g. ['launchctl','bootout','gui/501/ai.wienerdog.dream']
 * @returns {{status:number}}
 */
function schedulerSpawn(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  if (process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) {
    throw new WienerdogError(
      `refusing to invoke the real OS scheduler in a test: ${argv.join(' ')} — ` +
        'inject a loader or set WIENERDOG_LOADER_NOOP. (launchd/systemd/schtasks ' +
        'identifiers are per-user-global, not HOME-scoped: a temp-HOME test would ' +
        'still mutate the real user agent.)'
    );
  }
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}

module.exports = { schedulerSpawn };
```

### Exact contract — the three delegations

`src/cli/schedule.js`:

```js
const { schedulerSpawn } = require('../scheduler/spawn'); // add near the top requires
// ...
function defaultLoader(argv) {
  return schedulerSpawn(argv);
}
```

`src/scheduler/generators.js`:

```js
const { schedulerSpawn } = require('./spawn'); // add near the top requires
// ...
function defaultCatchupLoader(argv) {
  return schedulerSpawn(argv);
}
```

`src/core/manifest.js` — in `reverseSchedulerEntry`, replace the direct
`spawnSync(entry.unload[0], entry.unload.slice(1))` in the non-dry-run branch with
`require('../scheduler/spawn').schedulerSpawn(entry.unload)`. Keep the surrounding
`try/catch` (uninstall reversal stays best-effort). Do not change the dry-run
branch or any other behavior. (Require lazily inside the function to avoid a
core↔scheduler load cycle if one exists; a top-level require is fine if it does
not — the implementer picks and notes it.)

### Exact contract — `tests/run.js`

```js
'use strict';
// Zero-dep test entry. Activates the hard scheduler guard for the WHOLE suite
// (env inherits to every `node --test` per-file child process) and forwards argv
// so `npm test -- --test-name-pattern X` still works. Cross-platform (no shell
// env syntax).
const { spawnSync } = require('node:child_process');
const env = { ...process.env, WIENERDOG_TEST_NO_REAL_SCHEDULER: '1' };
const r = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
});
process.exit(r.status == null ? 1 : r.status);
```

`package.json`: `"test": "node tests/run.js"`. (`npm run lint` unchanged. `npm run
scenarios` unchanged — the guard is deliberately NOT set for the scenario harness,
which is a separate script.)

### Exact contract — `tests/unit/scheduler-guard.test.js`

Prove the guard behavior directly against `schedulerSpawn`, with the env toggled
inside the test (save/restore around each case so the suite-wide setting is not
disturbed):

- With `WIENERDOG_TEST_NO_REAL_SCHEDULER='1'` and `WIENERDOG_LOADER_NOOP` unset:
  `schedulerSpawn(['launchctl','bootout','gui/0/ai.wienerdog.dream'])` **throws**
  `WienerdogError` whose message includes the argv.
- With `WIENERDOG_LOADER_NOOP='1'` set (regardless of the guard): returns
  `{status:0}` and does **not** throw (NOOP wins — precedence check).
- Prove the delegations: `require('../../src/cli/schedule').defaultLoader`
  and `require('../../src/scheduler/generators').defaultCatchupLoader` throw under
  the guard (env set, NOOP unset).

## Implementation notes & constraints

- **Plain Node ≥ 18, zero runtime deps.** `spawn.js` is ~20 lines.
- **Guard mutations only, never read-only probes.** WP-070's read-only probes
  (`launchctl print`, etc.) are safe and already return `'unknown'` under the
  guard. `hasSystemd`'s `systemctl --version` is a read-only capability check — do
  NOT route it through `schedulerSpawn` (it must keep working on systemd CI).
- **Precedence: NOOP before guard.** A test that set `WIENERDOG_LOADER_NOOP`
  deliberately opted out — it must keep no-op'ing (return `{status:0}`), not throw.
  The guard only catches tests that neutralized **nothing**.
- **Why a chokepoint, not a `child_process` monkeypatch.** A suite-wide
  monkeypatch of `child_process` would also intercept legitimate non-scheduler
  spawns (git, node, tar, npx) and the read-only `systemctl --version`, forcing
  fragile allow-listing. Routing the **three** mutation points through one
  `schedulerSpawn` is un-bypassable for every existing mutation and cannot break a
  non-scheduler spawn. A future new mutation seam MUST route through
  `schedulerSpawn` — record that as the invariant (below).
- **BINDING LESSON (for the inbox at archival).** *launchd/systemd/schtasks
  identifiers are per-user-global, NOT HOME-scoped — a temp-HOME test still hits
  the real scheduler; every scheduler mutation MUST go through `schedulerSpawn`,
  and every scheduler test MUST use an injected loader OR `WIENERDOG_LOADER_NOOP`
  (the suite guard `WIENERDOG_TEST_NO_REAL_SCHEDULER` is the belt that fails loudly
  if it forgets).* Put this bullet (prefixed `WP-071:`) in your PR body's lessons
  section.
- **Enabling the guard surfaces the forgetful tests.** After wiring `tests/run.js`
  and `package.json`, run `npm test`. Any test that throws
  `WienerdogError: refusing to invoke the real OS scheduler` is a forgetful test —
  add `WIENERDOG_LOADER_NOOP: '1'` to its subprocess/`tempEnv` env. The three in
  the Deliverables table are the known set (`doctor.test.js` is handled by WP-070).
  If a fourth appears, it is a Discovered issue — add the NOOP env (it is a test
  file) and note it; do NOT change product code to accommodate it.
- **Depends on WP-070.** The guard, once enabled suite-wide, would make
  `doctor.test.js`'s `init --fresh-vault` throw; WP-070 already adds
  `WIENERDOG_LOADER_NOOP` to that file's `tempEnv()`. Landing this WP after WP-070
  means this WP does not touch `doctor.test.js` (no file overlap). It also means
  WP-070's `status.js` already exists with a self-guarding `defaultProbe`.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope.

## Security checklist (delete only if the WP touches no untrusted input)

- [ ] No untrusted identifier is introduced. `schedulerSpawn` receives argv built
      by Wienerdog's own scheduler code (labels/units/task-paths validated
      `^[a-z0-9][a-z0-9-]*$` upstream). The guard adds a pre-spawn throw; it does not
      change how argv is constructed. The env vars (`WIENERDOG_TEST_NO_REAL_SCHEDULER`,
      `WIENERDOG_LOADER_NOOP`) are test-run controls, never user input.

## Acceptance criteria

- [ ] `schedulerSpawn(argv)` throws `WienerdogError` (message includes the argv)
      when `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set and `WIENERDOG_LOADER_NOOP` is
      not; returns `{status:0}` when `WIENERDOG_LOADER_NOOP` is set; spawns for real
      otherwise.
- [ ] `defaultLoader`, `defaultCatchupLoader`, and `reverseSchedulerEntry`'s unload
      spawn all route through `schedulerSpawn` (proven for the two loaders in the
      guard test; the manifest path proven by `uninstall.test.js` passing under the
      guard once NOOP is set).
- [ ] `npm test` sets `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` for every test process
      and passes with zero real scheduler mutations; `npm test -- --test-name-pattern
      X` still filters correctly.
- [ ] `tests/unit/uninstall.test.js`, `tests/unit/codex-adapter.test.js`, and
      `tests/integration/bootstrap-seam.test.js` set `WIENERDOG_LOADER_NOOP: '1'`
      and pass under the guard (they no longer reach a real `launchctl`).
- [ ] `hasSystemd`'s `systemctl --version` is unaffected (systemd CI still detects
      systemd).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "scheduler-guard"
npm test -- --test-name-pattern "uninstall"
npm test -- --test-name-pattern "codex-adapter"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The doctor/digest scheduler-status surface and `sync` heal — that is **WP-070**.
- A `child_process` monkeypatch (rejected above in favor of the chokepoint).
- Guarding read-only probes / `hasSystemd`'s `--version` (they do not mutate).
- Any change to `dream.js`, `dream.test.js`, or WP-070's `status.js`.
- Setting the guard for `npm run scenarios` (the live scenario harness may schedule
  legitimately; it is a separate command and out of scope).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/071-test-guard-real-scheduler`; conventional commits;
   PR titled `test(scheduler): hard guard against real scheduler mutation in tests (WP-071)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
