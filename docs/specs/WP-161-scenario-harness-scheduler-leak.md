---
id: WP-161-scenario-harness-scheduler-leak
title: Stop the live scenario harnesses from leaking real OS scheduler entries into the maintainer's machine
status: Ready
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0009]
branch: wp/161-scenario-harness-scheduler-leak
---

# WP-161: Contain the scenario harnesses' real-scheduler leak

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** The product installs
configuration; the only long-lived thing it may create is a job registered with
the **OS-native scheduler** (launchd / systemd user timers / Task Scheduler),
and that entry must always point at a real, current core. A **test harness must
never register a real OS scheduler entry on the maintainer's machine** — doing so
is both a broken-invariant leak and, once the harness's temp core is deleted, an
orphaned agent that fires nightly forever against a path that no longer exists.

Two of Wienerdog's **live scenario harnesses** run the REAL `wienerdog` bin as a
subprocess with `init --fresh-vault --yes`, which auto-schedules the nightly
dream. Because those harnesses deliberately leave `HOME` pointed at the
maintainer's **real** home (so the spawned `claude -p` can reach the
subscription/Keychain OAuth — ADR-0009), the scheduler code resolves the launchd
directory to the **real** `~/Library/LaunchAgents` and:
1. **writes** `ai.wienerdog.dream.plist` + `ai.wienerdog.catchup.plist` into the
   real LaunchAgents dir (pointing at the harness's temp core), and
2. **runs the real loader** (`launchctl bootstrap gui/<uid> <plist>`),
   registering real launchd agents.

When the temp core (`wd-scen-*` / `wd-negative-*`) is deleted at the end of the
run, those agents/plists are **orphaned** — they point at a nonexistent core and
would fire nightly at 03:30. This was confirmed on the maintainer's machine: two
`ai.wienerdog.{dream,catchup}` agents pointing at a long-deleted
`/var/folders/.../wd-negative-mLfL2g/core`, cleaned up by hand.

This WP is **test-infra only**. It makes both live harnesses (a) write NO
schedule file into any real scheduler dir and (b) fire NO real
`launchctl/systemctl/schtasks`, while **preserving** the subscription auth the
harnesses depend on (ADR-0009). It changes **no product `src/` code** — the
scheduler is already correct; the harnesses were feeding it the real `HOME`.

## Current state

### The two leaking harnesses

**`tests/scenarios/run-scenarios.js`** — builds the child env (~lines 311-325)
then runs the real bin at ~line 331:

```js
const env = { ...process.env };
env.WIENERDOG_HOME = core;
env.WIENERDOG_VAULT = vault;
env.WIENERDOG_CLAUDE_DIR = transcriptsDir; // collection reads fixtures from here
env.CODEX_HOME = codexDir;                 // isolate codex discovery (stays empty)
env.WIENERDOG_FAKE_TODAY = FAKE_TODAY;
delete env.WIENERDOG_DREAM_CMD;   // exercise the REAL brain
delete env.ANTHROPIC_API_KEY;     // ADR-0009: subscription only, never a key
// Deliberately NOT set: env.HOME (inherit the real one → default config +
// Keychain OAuth).
// Deliberately NOT set: env.CLAUDE_CONFIG_DIR (inherit the maintainer's
// real value, or none → ~/.claude; the brain authenticates against
// whatever their `claude` uses).
...
const initRes = runWienerdog(['init', '--fresh-vault', '--yes'], env);  // ~line 331
```

`runWienerdog` (~line 268) is `spawnSync(process.execPath, [WIENERDOG_BIN, ...args], { env, ... })`.
This runner does **not** redirect `CLAUDE_CONFIG_DIR` (it inherits the real one,
or none → the child resolves `~/.claude` from its own `HOME`), and it later
computes `realConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.claude')`
(~line 351) for its skill-install scenario. Its `finally` (~line 460) removes an
installed real-config skill and then `fs.rmSync(root, …)` (~line 470).
Neither `WIENERDOG_LOADER_NOOP` nor `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set.

**`tests/scenarios/negative/run-negative.js`** — `buildEnv(root)` (~lines
209-221) sets a **disposable, hostile** `CLAUDE_CONFIG_DIR` and, like the other
runner, never sets `HOME`:

```js
const env = { ...process.env };
env.WIENERDOG_HOME = core;
env.WIENERDOG_VAULT = vault;
env.WIENERDOG_CLAUDE_DIR = transcriptsDir;
env.CLAUDE_CONFIG_DIR = configDir; // hostile, disposable — real ~/.claude untouched
env.CODEX_HOME = codexDir;
env.WIENERDOG_FAKE_TODAY = FAKE_TODAY;
delete env.WIENERDOG_DREAM_CMD;    // exercise the REAL brain
delete env.ANTHROPIC_API_KEY;      // ADR-0009: subscription only
```

`runDream` runs `runWienerdog(['init', '--fresh-vault', '--yes'], env)` (~line
365). `accountKeys()` (~line 226) reads `process.env.HOME` — the **runner's own
process env**, not the child `env` — to copy the non-sensitive account keys into
the disposable `CLAUDE_CONFIG_DIR`; it is therefore unaffected by redirecting the
**child** `env.HOME`. The OAuth token lives in the OS Keychain
(config-dir/HOME-independent on macOS). `main`'s `finally` (~line 439)
`fs.rmSync(root, …)` (~line 440). Neither loader guard is set.

### Why the leak happens (product side — do NOT change this)

- `src/cli/init.js` (~line 185): under `--fresh-vault` (`vaultStep`),
  `ensureDreamSchedule(paths)` is called.
- `src/cli/schedule.js` `ensureDreamSchedule` (~line 387) → `registerPlatform`
  (~line 209) → `ensureCatchup` (~line 151); both write plists at
  `path.join(gen.launchAgentsDir(paths.home), '<label>.plist')` (~lines 251, 160)
  and then call the default loader (`schedulerSpawn(['launchctl','bootstrap',…])`).
- `src/scheduler/generators.js` `launchAgentsDir(home)` (~line 40) returns
  `path.join(home, 'Library', 'LaunchAgents')` — **`HOME`-derived only; there is
  no dedicated env override for this directory.**
- `src/core/paths.js` (~line 54): `home = env.HOME || os.homedir()`, so
  `paths.home` follows the child `env.HOME`. `paths.claudeDir` (~line 61) is
  `CLAUDE_CONFIG_DIR || path.join(home, '.claude')`.
- `src/scheduler/spawn.js` `schedulerSpawn(argv)` (~line 21) already honors two
  env knobs: **`WIENERDOG_LOADER_NOOP`** → returns `{status:0}` and fires **no**
  real `launchctl/systemctl/schtasks` (~line 22); `WIENERDOG_TEST_NO_REAL_SCHEDULER`
  → **throws** loudly (~line 23).
- `src/cli/run-job.js` (~lines 112, 156) sets the spawned `claude -p` child's
  `HOME: paths.home`. So the brain's `HOME` already follows `paths.home` — which
  is why auth must be preserved through `CLAUDE_CONFIG_DIR` + Keychain, not `HOME`
  (see the decision below).

### How the correct tests already avoid this (the pattern to copy)

- `tests/unit/uninstall.test.js` sets **both** `HOME` = temp **and**
  `WIENERDOG_LOADER_NOOP=1`.
- `tests/unit/scheduler-schedule.test.js` relies on the suite-wide
  `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` that `tests/run.js` injects into every
  `node --test` child. **The scenario runners are the gap: they are not launched
  via `tests/run.js`, so that guard never reaches them.**

### Not affected (investigated — do not touch)

- `tests/scenarios/broker-e2e/run-broker-e2e.js` builds its paths with
  `getPaths({ HOME: root, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault })` (~line
  85) — it **already** redirects `HOME` to the temp root, and it never runs
  `init`/`schedulerSpawn`/`ensureDreamSchedule` (its only subprocesses are
  `claude --version` and `lifecycle-selfcheck.js`). No scheduler leak.
- `tests/scenarios/broker/lifecycle-selfcheck.js`, `tests/scenarios/rubric.js`,
  `tests/scenarios/negative/*` fixtures — no `init`/scheduler path.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip) and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | tests/scenarios/scheduler-guard.js | Shared, quota-free guard: `snapshotRealSchedulerEntries(opts?)` + `assertNoRealSchedulerLeak(before, opts?)`. The regression tripwire + belt-and-suspenders cleanup. Injectable dir/platform for unit testing. |
| modify | tests/scenarios/run-scenarios.js | In the child-env block: pin `env.CLAUDE_CONFIG_DIR` to the real config dir, then set `env.HOME = root` and `env.WIENERDOG_LOADER_NOOP = '1'`. Snapshot real scheduler entries before the run; call `assertNoRealSchedulerLeak` in `finally` and push its failures. No other behavior change. |
| modify | tests/scenarios/negative/run-negative.js | In `buildEnv`: set `env.HOME = root` and `env.WIENERDOG_LOADER_NOOP = '1'` (its `CLAUDE_CONFIG_DIR` is already disposable+seeded). Snapshot before the run in `main`; call `assertNoRealSchedulerLeak` in `finally` and push its failures. No other behavior change. |
| create | tests/unit/scheduler-leak-guard.test.js | Deterministic (`npm test`, no `WIENERDOG_RUN_SCENARIOS`, no quota): plant a fake `ai.wienerdog.dream.plist` in an **injected temp dir** and prove the guard detects it, removes it, and returns a non-empty failure; a clean/unrelated dir returns empty; never touches the real home. |

### Exact contracts

**The decision (execute this — do not re-decide): harness-only fix, no `src/`
change.** Guarantee (a) *no file in a real scheduler dir* by redirecting
`paths.home` → `env.HOME = <temp root>` (so `launchAgentsDir`/`systemdUserDir`/
Windows-tasks resolve under the temp root). Guarantee (b) *no real loader call*
by setting `env.WIENERDOG_LOADER_NOOP = '1'` (the sanctioned no-op seam in
`spawn.js`; `init` still succeeds — the loader returns `{status:0}`, unlike
`WIENERDOG_TEST_NO_REAL_SCHEDULER`, which throws and would fail `init`).

**Preserve subscription auth (ADR-0009) — the reason `HOME` was left real.** Auth
resolves from `CLAUDE_CONFIG_DIR` (account keys) + the OS Keychain (OAuth,
`HOME`-independent), **not** from `HOME`:
- **run-negative:** `CLAUDE_CONFIG_DIR` is already a disposable dir seeded by
  `accountKeys()` (which reads the *runner's* `process.env.HOME`, not the child
  `env.HOME`). Redirecting the child `env.HOME` therefore leaves auth intact.
  **Set only** `env.HOME = root` and `env.WIENERDOG_LOADER_NOOP = '1'`; change
  `CLAUDE_CONFIG_DIR` **not at all**.
- **run-scenarios:** it does **not** redirect `CLAUDE_CONFIG_DIR`, so a bare
  `HOME=temp` would make the child `claude` resolve an **empty** `temp/.claude`
  and break auth. Prevent this by **pinning `CLAUDE_CONFIG_DIR` to the real
  config dir before redirecting `HOME`**, so the child's config resolution is
  byte-identical to today:
  ```js
  const realConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  env.CLAUDE_CONFIG_DIR = realConfigDir; // pin real config dir → auth is HOME-independent
  env.HOME = root;                       // redirect paths.home → temp LaunchAgents/systemd dir
  env.WIENERDOG_LOADER_NOOP = '1';       // no real launchctl/systemctl/schtasks
  ```
  This keeps `paths.claudeDir` = the real `~/.claude` exactly as today (so the
  existing skill-install scenario and its `realConfigDir` computation at ~line
  351 are unchanged), while `paths.home` moves to the temp root. Ordering
  matters: set `CLAUDE_CONFIG_DIR` **before** `HOME`.

**`tests/scenarios/scheduler-guard.js`** — quota-free, touches only the filesystem:

```js
/** Basenames of Wienerdog-owned scheduler entries currently in the REAL
 *  per-platform scheduler dir. Reads the real home (os.homedir()), NOT any
 *  child env. dir/platform are injectable for unit tests.
 *  @param {{dir?: string, platform?: NodeJS.Platform}} [opts]
 *  @returns {Set<string>} */
function snapshotRealSchedulerEntries(opts = {})

/** Compare the current real scheduler dir against `before`. Any NEW Wienerdog
 *  entry is a leak: REMOVE it (fs.rmSync, force) and return one failure string
 *  per removed entry. Empty array = no leak. Never throws on a missing dir.
 *  @param {Set<string>} before
 *  @param {{dir?: string, platform?: NodeJS.Platform}} [opts]
 *  @returns {string[]} failures */
function assertNoRealSchedulerLeak(before, opts = {})

module.exports = { snapshotRealSchedulerEntries, assertNoRealSchedulerLeak };
```

- Real dir by platform (from `os.homedir()` unless `opts.dir` overrides):
  `darwin` → `<home>/Library/LaunchAgents`; `linux` →
  `$XDG_CONFIG_HOME/systemd/user` else `<home>/.config/systemd/user`; other
  platforms → return an empty set / no-op (the guard is a safety net, not a
  Windows feature).
- "Wienerdog-owned" basename match, **fully anchored**:
  `^ai\.wienerdog\.[a-z0-9.-]+\.plist$` (darwin) /
  `^wienerdog-[a-z0-9.-]+\.(timer|service)$` (linux). Nothing else is ever
  matched, snapshotted, or removed — the guard must never touch a non-Wienerdog
  file or a legitimately-installed entry the maintainer already had (those are in
  `before`, so they are not "new").
- The diff is `current \ before`: a NEW Wienerdog entry ⇒ remove + one failure.
  Entries present in `before` are the maintainer's own install — left untouched.

**Runner wiring:** each runner takes `const before = snapshotRealSchedulerEntries()`
immediately before the first `runWienerdog(['init', …])`, and in its existing
`finally` (before/after the `fs.rmSync(root, …)` — either order; the guard reads
the real dir, not `root`) does
`failures.push(...assertNoRealSchedulerLeak(before))`. A leak therefore both
self-cleans and fails the run loudly.

## Implementation notes & constraints

- **No `src/` change.** The scheduler is correct; the harnesses fed it the real
  `HOME`. If you believe a `src/` change is required, STOP — that is a spec gap;
  do not widen scope.
- **`WIENERDOG_LOADER_NOOP`, not `WIENERDOG_TEST_NO_REAL_SCHEDULER`.** The latter
  throws and would fail `init --fresh-vault`; the runners need `init` to succeed.
  `HOME=temp` already prevents the file write, so `LOADER_NOOP` is the
  belt to `HOME`'s suspenders (and vice-versa) — set **both**.
- **Ordering (run-scenarios):** set `CLAUDE_CONFIG_DIR` before `HOME`, so the
  pinned real config dir is not re-derived from the temp `HOME`.
- **Do not change `ANTHROPIC_API_KEY` handling** — both runners still `delete`
  it (ADR-0009: subscription only). Do not add any new auth env.
- **Zero deps, plain Node ≥ 18, JSDoc only.** The guard uses only `node:fs`,
  `node:os`, `node:path`.
- **Keep the guard conservative.** A false positive (removing a file the guard
  did not create) is worse than a missed one — hence the fully-anchored basename
  match and the `before` snapshot. Never remove anything not in `current \ before`.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] After each harness's change, the child env sets `HOME` = the temp root
      **and** `WIENERDOG_LOADER_NOOP=1`, so `init --fresh-vault` writes its
      dream/catchup schedule files under the **temp** root and fires **no** real
      `launchctl/systemctl/schtasks`. No file lands in the real
      `~/Library/LaunchAgents` / `~/.config/systemd/user`.
- [ ] Subscription auth is preserved (ADR-0009): `ANTHROPIC_API_KEY` is still
      deleted; run-negative keeps its disposable seeded `CLAUDE_CONFIG_DIR`;
      run-scenarios pins `CLAUDE_CONFIG_DIR` to the real config dir so the child
      `claude`'s auth resolution is unchanged.
- [ ] The leak guard's basename patterns are **fully anchored**
      (`^ai\.wienerdog\.…\.plist$` / `^wienerdog-…\.(timer|service)$`), read the
      **real** home (never a child env), and remove only entries that are **new**
      since the pre-run snapshot — never a pre-existing or non-Wienerdog file.
- [ ] The deterministic unit test operates entirely inside an **injected temp
      dir** and never reads or writes the real scheduler directory.

## Acceptance criteria

- [ ] `npm test -- --test-name-pattern "scheduler-leak-guard"` passes: a planted
      `ai.wienerdog.dream.plist` in an injected temp dir is detected, removed, and
      reported; a clean dir and a dir with only a non-Wienerdog / pre-existing
      entry return no failures; the real home is never touched.
- [ ] `npm test` and `npm run lint` are green (the two runner edits are
      not exercised by `npm test`, which does not set `WIENERDOG_RUN_SCENARIOS`).
- [ ] **Live proof (gated, run manually and paste output):** with a clean real
      scheduler dir, `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative` (and
      the same for the main scenarios run) leaves
      `ls ~/Library/LaunchAgents | grep -i wienerdog` **empty** and
      `launchctl list | grep -i wienerdog` **empty** afterward, and the run does
      not report a scheduler-leak failure.
- [ ] Static check: `grep -n "env.HOME = root\|WIENERDOG_LOADER_NOOP" tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js`
      shows both keys set in both runners; the "Deliberately NOT set: env.HOME"
      comment in run-scenarios is replaced by a comment explaining the redirect +
      the `CLAUDE_CONFIG_DIR` pin.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "scheduler-leak-guard"
npm test
npm run lint
# Confirm the env keys are present in both runners:
grep -n "env.HOME = root\|WIENERDOG_LOADER_NOOP\|CLAUDE_CONFIG_DIR = realConfigDir" \
  tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js
# Optional live proof (spends real quota; only on the maintainer's machine):
#   WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative
#   ls ~/Library/LaunchAgents | grep -i wienerdog    # must be empty
#   launchctl list | grep -i wienerdog               # must be empty
```

## Out of scope (do NOT do these)

- Any change to product `src/` (scheduler, init, paths, run-job). A real
  containment gap there is a separate WP back to wd-architect.
- Adding an env override for the LaunchAgents/systemd/tasks directory in the
  scheduler layer — the harness-only `HOME` redirect makes it unnecessary; a
  dedicated override would widen scope into product code.
- `tests/scenarios/broker-e2e/run-broker-e2e.js` (already redirects `HOME`, never
  schedules) and the `tests/unit/*` adopt-e2e path (already fixed with
  `WIENERDOG_LOADER_NOOP`).
- Changing how the scenario runners authenticate or what quota they spend
  (ADR-0009 stands).

## Definition of done

1. All non-gated verification steps pass locally; output pasted into the PR body
   (state whether the optional gated live proof was run and its `ls`/`launchctl`
   results).
2. Branch `wp/161-scenario-harness-scheduler-leak`; conventional commits; PR
   titled `test(scenarios): stop live harnesses leaking real OS scheduler entries (WP-161)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
