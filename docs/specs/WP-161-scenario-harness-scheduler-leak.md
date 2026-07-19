---
id: WP-161-scenario-harness-scheduler-leak
title: Stop the live scenario harnesses from leaking real OS scheduler entries into the maintainer's machine
status: Ready
model: sonnet
size: M
depends_on: []
adrs: [ADR-0004, ADR-0009]
branch: wp/161-scenario-harness-scheduler-leak
---

# WP-161: Contain the scenario harnesses' real-scheduler leak

## Context (read this, nothing else)

**IRON RULE (ADR-0004): Wienerdog is just files.** The product installs
configuration; the only long-lived thing it may create is a job registered with
the **OS-native scheduler** (launchd / systemd user timers / Task Scheduler), and
that entry must always point at a real, current core. A **test harness must never
register a real OS scheduler entry on the maintainer's machine** — it is both a
broken-invariant leak and, once the harness's temp core is deleted, an orphaned
agent that fires nightly forever against a path that no longer exists.

Two of Wienerdog's **live scenario harnesses** run the real `wienerdog` bin as a
subprocess with `init --fresh-vault --yes`, which auto-schedules the nightly
dream. Because those harnesses deliberately leave `HOME` pointed at the
maintainer's **real** home (so the *separate* `claude -p` dream subprocess can
reach the subscription/Keychain OAuth — ADR-0009), the scheduler code resolves
the launchd/systemd directories to the **real** ones and:
1. **writes** `ai.wienerdog.dream.plist` + `ai.wienerdog.catchup.plist` (macOS) /
   `wienerdog-dream.timer` + `.service` (Linux) into the real scheduler dir
   (pointing at the harness's temp core), and
2. **runs the real loader** (`launchctl bootstrap` / `systemctl --user enable`),
   registering real agents.

When the temp core (`wd-scen-*` / `wd-negative-*`) is deleted at the end of the
run, those agents/plists are **orphaned** — they point at a nonexistent core and
would fire nightly at 03:30. This was confirmed on the maintainer's machine: two
`ai.wienerdog.{dream,catchup}` agents pointing at a long-deleted
`/var/folders/.../wd-negative-mLfL2g/core`, cleaned up by hand.

This WP is **test-infra only** and changes **no product `src/` code** — the
scheduler is already correct; the harnesses fed it the real `HOME`. The fix
isolates the ONE subprocess that schedules (`wienerdog init`) inside a fully
sandboxed env, leaving the auth-sensitive `claude -p` dream subprocess's env
**exactly as it is today**, and adds two fail-closed tripwires so a future
regression is caught before it can register anything real.

## Current state

### The two leaking harnesses

Both run the real bin via `runWienerdog(args, env)` =
`spawnSync(process.execPath, [WIENERDOG_BIN, ...args], { env, ... })`
(`run-scenarios.js` ~L268; `run-negative.js` ~L41). Both do **two** subprocess
runs against the same seeded core/vault: first `init --fresh-vault --yes` (which
schedules), then `dream --yes` (which spends model quota and needs auth).

**`tests/scenarios/run-scenarios.js`** builds the child env (~L311-325) and runs
`runWienerdog(['init', '--fresh-vault', '--yes'], env)` (~L331), then
`runWienerdog(['dream', '--yes'], env)` (~L371). The env sets `WIENERDOG_HOME`,
`WIENERDOG_VAULT`, `WIENERDOG_CLAUDE_DIR`, `CODEX_HOME`, `WIENERDOG_FAKE_TODAY`;
deletes `WIENERDOG_DREAM_CMD` and `ANTHROPIC_API_KEY`. It **deliberately does not
set `HOME` or `CLAUDE_CONFIG_DIR`** (comment ~L316: "Deliberately NOT set:
env.HOME (inherit the real one → default config + Keychain OAuth)"). Neither
`WIENERDOG_LOADER_NOOP` nor `WIENERDOG_TEST_NO_REAL_SCHEDULER` is set. `finally`
(~L460) restores a real-config skill, then `fs.rmSync(root, …)` (~L470).

> **The real-config skill install is harness-side, not via a subprocess.** At
> ~L351 the runner installs the dream skill into the real config dir, resolved
> from the runner's **own** `process.env`
> (`realConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.claude')`),
> so the DREAM subprocess (which inherits the real `HOME`) can find it via
> `--setting-sources user`. This is completely independent of the child `env`
> passed to `runWienerdog`, so sandboxing the **init** subprocess's env does not
> disturb it.

**`tests/scenarios/negative/run-negative.js`** — `buildEnv(root)` (~L209-221)
sets a **disposable, hostile** `CLAUDE_CONFIG_DIR` under `root` and, like the
other runner, never sets `HOME`. `runDream(env, canaries)` runs
`runWienerdog(['init', '--fresh-vault', '--yes'], env)` (~L365) then
`runWienerdog(['dream', '--yes'], env)` (~L377). `accountKeys()` (~L226) reads
`process.env.HOME` — the **runner's own process env**, not the child `env` — so
seeding the disposable config dir is unaffected by the child `env`. `main`'s
`finally` (~L439) does `fs.rmSync(root, …)` (~L440). Neither loader guard is set.

### Why the leak happens (product side — do NOT change any of this)

- `src/cli/init.js` (~L185): under `--fresh-vault` (`vaultStep`),
  `ensureDreamSchedule(paths)` is called. **`init` does not spawn `claude -p` and
  needs no subscription auth** — only `dream` does. (This is what makes the
  init-env split below safe.)
- `src/cli/schedule.js` `ensureDreamSchedule` (~L387) → `registerPlatform`
  (~L209) → `ensureCatchup` (~L151). File paths:
  - launchd plist → `path.join(gen.launchAgentsDir(paths.home), '<label>.plist')`
    (~L251, L160).
  - systemd timer/service → `gen.systemdUserDir(paths.home, process.env)` (~L269).
  - Windows XML → `gen.windowsTaskFile(paths, …)` = under `<core>/schedules`
    (WIENERDOG_HOME-scoped, already temp — no HOME involvement).
  Each then calls the default loader → `schedulerSpawn([...])`.
- `src/scheduler/generators.js`:
  - `launchAgentsDir(home)` (~L40) = `path.join(home, 'Library', 'LaunchAgents')`
    — **`HOME`-derived; no dedicated env override.**
  - `systemdUserDir(home, env)` (~L50) = `$XDG_CONFIG_HOME/systemd/user` **if
    `env.XDG_CONFIG_HOME` is set**, else `<home>/.config/systemd/user`. So on
    Linux, redirecting only `HOME` is **not enough** — an inherited
    `XDG_CONFIG_HOME` still points at the real dir. **(Codex Finding 1.)**
- `src/core/paths.js` (~L54): `home = env.HOME || os.homedir()`, so `paths.home`
  follows the child `env.HOME`.
- `src/scheduler/spawn.js` `schedulerSpawn(argv)`: `WIENERDOG_LOADER_NOOP` set →
  returns `{status:0}` and spawns **nothing** (no real
  `launchctl`/`systemctl`/`loginctl`/`schtasks`); `WIENERDOG_TEST_NO_REAL_SCHEDULER`
  set → **throws** (would fail `init`). Otherwise `spawnSync(argv[0], argv.slice(1))`
  — the command is a **bare name**, PATH-resolved, so a PATH shim intercepts it.
  Every scheduler **mutation** flows through this one chokepoint; the only
  non-chokepoint scheduler call is a harmless `spawnSync('systemctl', ['--version'])`
  **presence probe** (`schedule.js` ~L104).
- Loader mutation commands, all bare-name / PATH-resolved: `launchctl`
  (bootstrap/bootout), `systemctl` (`--user` daemon-reload / enable / disable),
  `loginctl` (enable-linger), `schtasks` (/create /delete).

### How the correct tests already avoid this (the pattern to copy)

- `tests/unit/uninstall.test.js` sets **both** `HOME` = temp **and**
  `WIENERDOG_LOADER_NOOP=1`.
- `tests/unit/scheduler-schedule.test.js` relies on the suite-wide
  `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` that `tests/run.js` injects into every
  `node --test` child. **The scenario runners are the gap: they are not launched
  via `tests/run.js`, so that guard never reaches them.**

### Not affected (investigated — do not touch)

- `tests/scenarios/broker-e2e/run-broker-e2e.js` builds its paths with
  `getPaths({ HOME: root, … })` (~L85) — it **already** redirects `HOME` to a
  temp root, and never runs `init`/`schedulerSpawn`/`ensureDreamSchedule` (its
  only subprocesses are `claude --version` and `lifecycle-selfcheck.js`). No leak.
- `tests/scenarios/broker/lifecycle-selfcheck.js`, `tests/scenarios/rubric.js`,
  negative fixtures — no `init`/scheduler path.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip) and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | tests/scenarios/scheduler-guard.js | The shared containment kit: `makeLoaderShimDir(root)`, `buildInitEnv(baseEnv, root, shim)`, `assertNoLoaderInvoked(shim)`, `assertNoRealSchedulerLeak(tempRoot, opts?)`. Quota-free; imports only `node:fs/os/path`. |
| modify | tests/scenarios/run-scenarios.js | Build a loader-shim dir + init-env once; run the `init` subprocess with the init-env (temp `HOME`+`XDG_CONFIG_HOME`, `LOADER_NOOP=1`, shim on `PATH`); **leave the `dream` subprocess call on the unchanged real `env`**; in `finally`, push `assertNoLoaderInvoked` + `assertNoRealSchedulerLeak` failures. No other behavior change. |
| modify | tests/scenarios/negative/run-negative.js | Same: shim dir + init-env for the `runWienerdog(['init',…])` call in `runDream`; `dream` stays on the unchanged `env`; assert both tripwires in `main`'s `finally`. No other behavior change. |
| create | tests/unit/scheduler-leak-guard.test.js | Deterministic (`npm test`, no `WIENERDOG_RUN_SCENARIOS`, no quota, no real scheduler): the `buildInitEnv`, shim, and observer contracts below, including the **Linux XDG-set and XDG-unset branches**. |

### The design (execute this — do not re-decide)

**Init-env split, not an auth-env change.** Only `wienerdog init` schedules, and
`init` needs no subscription auth. So sandbox **only the `init` subprocess's env**
and leave the `dream`/`claude -p` subprocess's env **byte-for-byte as it is
today**. This resolves the auth risk of the earlier `CLAUDE_CONFIG_DIR`-pin
approach (**Codex Finding 2**): the auth-sensitive env is never touched — no
`HOME` change, no `CLAUDE_CONFIG_DIR` pin, nothing.

**`buildInitEnv(baseEnv, root, shim)` → env** — the sandbox for the `init` call:
```js
return {
  ...baseEnv,
  HOME: root,                                   // launchAgentsDir → <root>/Library/LaunchAgents (temp)
  XDG_CONFIG_HOME: path.join(root, '.config'),  // systemdUserDir → <root>/.config/systemd/user (temp)  [Finding 1]
  WIENERDOG_LOADER_NOOP: '1',                    // schedulerSpawn spawns no real loader
  PATH: shim.binDir + path.delimiter + (baseEnv.PATH || ''), // fail-closed loader shims win  [Finding 3]
  WD_SHIM_LOG: shim.logPath,                     // where the shims record any mutation attempt
};
```
- `XDG_CONFIG_HOME` is **set explicitly** (not left to the `HOME` fallback) so the
  systemd file lands in temp whether or not the maintainer had `XDG_CONFIG_HOME`
  set — closing Finding 1 in both the inherited-XDG and unset-XDG cases.
- `WIENERDOG_HOME`/`WIENERDOG_VAULT`/`CLAUDE_CONFIG_DIR` etc. are inherited from
  `baseEnv` unchanged, so `init` still seeds the same temp core/vault. `init`'s
  own `sync` writes its skills/hooks under the sandboxed config dir (temp),
  which is *more* contained than today, and does not affect the harness-side
  real-config skill install used by the `dream` run.

**`makeLoaderShimDir(root)` → `{ binDir, logPath }`** (fail-closed tripwire —
**Finding 3**). Create `binDir = <root>/.loader-shims` and write an executable
POSIX `sh` shim as **each** of `launchctl`, `systemctl`, `loginctl`, `schtasks`:
```sh
#!/bin/sh
# A pure version probe is read-only — let it pass so the real scheduling path
# still executes into temp (needed for the Linux systemd presence probe).
if [ "$#" -eq 1 ] && [ "$1" = "--version" ]; then exit 0; fi
printf '%s %s\n' "$(basename "$0")" "$*" >> "$WD_SHIM_LOG"
exit 9   # fail-closed: any real mutation attempt is captured AND fails
```
`chmod 0o755`. These are a **safety net**: with `LOADER_NOOP=1` the shims never
fire in a correct run (the log stays empty). If a future edit drops
`LOADER_NOOP`, the shim **captures the mutation and makes it fail** before it can
register anything real. **The shim interceptor is POSIX-only (darwin/linux):** on
Windows it is skipped and there is no `schtasks` interceptor and no Task
Scheduler observer — `schtasks /create` registers a **global** Task Scheduler
task (not a file under a redirected dir), so on Windows only `LOADER_NOOP` guards
the real registration. This is a **deliberately accepted residual** — see
"Accepted residual (Windows)" below; do not write any code or comment implying
that WIENERDOG_HOME-scoping the task XML file makes Windows contained.

**`assertNoLoaderInvoked(shim)` → `string[]`**: if `shim.logPath` exists and is
non-empty, return one failure per recorded line (the loader was invoked despite
`LOADER_NOOP` — a regression). Empty/missing log → `[]`.

**`assertNoRealSchedulerLeak(tempRoot, opts?)` → `string[]`** — an **observer,
not a cleaner** (**Finding 3**). It **never deletes anything.** It scans the real
per-platform scheduler dir(s) and returns a failure for every Wienerdog-named
entry **whose file content references `tempRoot`** — i.e. a plist/timer/service
this run actually leaked (its `ProgramArguments`/`ExecStart` point at this run's
temp core). Contract:
- **Compute the real home with the SAME rule the product uses — `env.HOME ||
  os.homedir()`, where `env = opts.env || process.env`** — NOT `os.homedir()`
  alone. **(Codex Finding F5.)** The product derives `paths.home` as
  `env.HOME || os.homedir()` (`src/core/paths.js:54`) and the runner inherits the
  real `process.env.HOME`; if that differs from `os.homedir()` (sudo, CI, a
  custom `HOME`), a HOME-redirection regression would leak into
  `$HOME/Library/LaunchAgents` while an `os.homedir()`-based observer scanned a
  *different* directory and reported a false clean. `opts.env` is injectable so a
  unit test can pass a fake env whose `HOME` differs from `os.homedir()`.
- Scanned dir(s), from that home and `env` (unless `opts.dir` fully overrides,
  for direct-injection unit tests); `opts.platform` overrides `process.platform`.
  `darwin` → `<home>/Library/LaunchAgents`; `linux` → `env.XDG_CONFIG_HOME` set →
  `<xdg>/systemd/user`, else `<home>/.config/systemd/user` (mirroring product
  `systemdUserDir`); other → `[]` (no file-based dir to scan).
- "Wienerdog-named", **fully anchored**: `^ai\.wienerdog\.[a-z0-9.-]+\.plist$`
  (darwin) / `^wienerdog-[a-z0-9.-]+\.(timer|service)$` (linux).
- **Leak signal = content contains `tempRoot`.** This is precise to *this* run:
  a concurrent legitimate install references a *real* core, not `tempRoot`, so it
  can never be misreported as this harness's leak (**answers Finding 3's
  concurrency concern**). A Wienerdog entry that does *not* reference `tempRoot`
  is left untouched and unreported.
- Reads `tempRoot` and the real dir only; never throws on a missing dir; returns
  a loud, actionable message per leak (name the file + `tempRoot` + "remove it
  manually and fix WP-161's env"). **No `rmSync`, no `launchctl bootout`, no
  `self-cleans` claim** — deleting a file would not unregister a loaded agent and
  could race a concurrent install, so the observer only reports.

### Runner wiring (both runners)

```js
const scg = require('./scheduler-guard');              // path adjusted per runner
const shim = scg.makeLoaderShimDir(root);
const initEnv = scg.buildInitEnv(env, root, shim);
// schedule-only subprocess → sandboxed env:
const initRes = runWienerdog(['init', '--fresh-vault', '--yes'], initEnv);
// auth-sensitive subprocess → UNCHANGED real env (do not touch):
const dreamRes = runWienerdog(['dream', '--yes'], env);
// ... in finally:
//   MANDATORY ORDER — the shim-log check reads shim.logPath, which lives under
//   root, so it MUST run BEFORE fs.rmSync(root) or a deleted log reads as a
//   false clean (F7):
failures.push(...scg.assertNoLoaderInvoked(shim));   // BEFORE the rm — non-negotiable
failures.push(...scg.assertNoRealSchedulerLeak(root)); // either side of the rm (reads the real dir)
// ... only now:
fs.rmSync(root, { recursive: true, force: true });
```
**Ordering is NOT uniformly free (Codex F7).** `assertNoLoaderInvoked` reads
`shim.logPath`, which lives **under `root`**, and a missing/empty log counts as
clean (`[]`); if it ran *after* `fs.rmSync(root)`, the wiped log would read as a
false clean and mask a `LOADER_NOOP` regression (the shim blocks the loader,
`init` can still exit 0 as "load-failed", then the deleted log hides it). So
`assertNoLoaderInvoked(shim)` **MUST run before `fs.rmSync(root)` in both
runners** — this is a required wiring contract, not a style preference. The
**observer** (`assertNoRealSchedulerLeak`) reads the *real* scheduler dir (not
`root`), so it alone is order-independent; run it either side. The observer
defaults `env` to the runner's own `process.env` — the real env (the `initEnv`
redirect only applies to the `init` child, never the runner process) — so it
scans `process.env.HOME || os.homedir()` per **F5**; pass no `env` in the wiring.
`shim.logPath` is exposed on the returned `shim` object precisely so this
before-delete ordering is obvious at the call site. `run-negative`'s `init` is inside `runDream`, which must return the two
tripwire failures (or the caller must have `root`/`shim` in scope to assert in
`main`'s `finally` — implementer's choice, recorded under "Decisions made").

## Implementation notes & constraints

- **No `src/` change.** The scheduler is correct; the harnesses fed it the real
  `HOME`/`XDG_CONFIG_HOME`. The unit test may **import** `src/scheduler/generators.js`
  read-only (to assert `systemdUserDir` resolution) — importing is not modifying.
  If you believe a `src/` edit is required, STOP: that is a spec gap, not this WP.
- **Do not touch the `dream`/`claude -p` subprocess env** (ADR-0009). It keeps
  the real `HOME`, its (real or disposable) `CLAUDE_CONFIG_DIR`, and its deleted
  `ANTHROPIC_API_KEY` exactly as today. Only the `init` call gets `initEnv`.
- **`WIENERDOG_LOADER_NOOP`, not `WIENERDOG_TEST_NO_REAL_SCHEDULER`** — the latter
  throws and would fail `init --fresh-vault`.
- **Layered, defense-in-depth:** temp `HOME`+`XDG_CONFIG_HOME` prevents the file
  write; `LOADER_NOOP` prevents the loader call; the shim catches a `LOADER_NOOP`
  regression; the observer catches a `HOME`/`XDG` regression (its leaked file
  references `tempRoot`). No single layer is load-bearing alone.
- **Zero deps, plain Node ≥ 18, JSDoc only.** The guard uses only `node:fs`,
  `node:os`, `node:path`; the shims are `sh` files written to disk (no
  `child_process` needed in the guard module itself).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Accepted residual (Windows) — scoped, deliberate (Codex Finding F4)

**Residual:** On Windows the harness relies on `WIENERDOG_LOADER_NOOP` **alone** —
there is **no `schtasks` PATH interceptor and no Task Scheduler observer**. Unlike
launchd/systemd (file-based, redirected into temp via `HOME`/`XDG_CONFIG_HOME`),
`schtasks /create` registers a **global** Task Scheduler task, not a file under a
redirected directory. So a `WIENERDOG_LOADER_NOOP` regression on Windows could
leave a **real global task pointing at a deleted temp core**, and neither
tripwire in this WP would catch it. Do NOT claim otherwise anywhere in the code
or docs — WIENERDOG_HOME-scoping the task XML file does not contain the
registration.

**Why accepted (owner, 2026-07-19):** the live scenario runners run only on the
maintainer's macOS/Linux machines; Windows live-scenario runs are neither a used
nor a testable path here (Windows cannot even be exercised on this machine). The
POSIX shim + observer cover the platforms that actually run the harness.

**Follow-up (do NOT build in this WP):** a future Windows-hardening item should
add a `schtasks` interceptor with `PATHEXT`/`.cmd` handling **plus** a report-only
Task Scheduler observer (e.g. `schtasks /query` filtered to `\Wienerdog\*`,
reporting any task whose action references a nonexistent core). A Windows
contributor completes this later; recorded here so it is not lost.

## Security checklist

- [ ] The `init` subprocess runs with `HOME` **and** `XDG_CONFIG_HOME` under the
      temp root, so launchd plists **and** systemd timer/service files land in
      temp — never in the real `~/Library/LaunchAgents` or
      `$XDG_CONFIG_HOME/systemd/user`. **(Finding 1 closed for both the inherited
      and unset `XDG_CONFIG_HOME` cases.)**
- [ ] The `dream`/`claude -p` subprocess env is unchanged — no `HOME` redirect,
      no `CLAUDE_CONFIG_DIR` pin — so subscription auth (ADR-0009) is provably
      identical to today; `ANTHROPIC_API_KEY` is still deleted. **(Finding 2.)**
- [ ] `WIENERDOG_LOADER_NOOP=1` on the `init` env stops every real
      `launchctl`/`systemctl`/`loginctl`/`schtasks` mutation. **The fail-closed
      PATH-shim guarantee is POSIX (darwin/linux) only;** on Windows the harness
      is `LOADER_NOOP`-only, with the documented Accepted residual — no `schtasks`
      shim, no Task Scheduler observer. **(Finding 3 + F4.)**
- [ ] The filesystem observer is **report-only** (never `rmSync`, never
      `bootout`/`disable`), computes the real home as `env.HOME || os.homedir()`
      (matching `paths.js`, not `os.homedir()` alone — **F5**), keys its leak
      signal on file content referencing the run's `tempRoot` (immune to a
      concurrent legitimate install), and uses fully-anchored Wienerdog basename
      patterns. It covers the file-based schedulers (launchd/systemd); Windows
      Task Scheduler is out of scope per the Accepted residual. **(Finding 3 + F5 + F4.)**
- [ ] The deterministic unit test operates entirely inside injected temp dirs and
      never reads or writes the real scheduler directory.

## Acceptance criteria

- [ ] `npm test -- --test-name-pattern "scheduler-leak-guard"` passes:
  - `buildInitEnv` returns `HOME=root`, `XDG_CONFIG_HOME` under `root`,
    `WIENERDOG_LOADER_NOOP='1'`, and a `PATH` that begins with `shim.binDir`,
    while every other `baseEnv` key (e.g. `CLAUDE_CONFIG_DIR`, `WIENERDOG_HOME`)
    is passed through unchanged.
  - **Linux XDG-set branch:** with `baseEnv.XDG_CONFIG_HOME = '/real/xdg'`,
    `generators.systemdUserDir(root, buildInitEnv(baseEnv, root, shim))` resolves
    **under `root`** and NOT under `/real/xdg`.
  - **Linux XDG-unset branch:** with `baseEnv` having no `XDG_CONFIG_HOME`, the
    same call still resolves **under `root`**.
  - The shim records a mutation invocation to `WD_SHIM_LOG` and exits non-zero,
    but exits 0 and records nothing for a lone `--version`; `assertNoLoaderInvoked`
    returns a failure for a non-empty log and `[]` for an empty/missing one.
  - `assertNoRealSchedulerLeak(tempRoot, {dir, platform})` against an injected dir
    **reports** a planted `ai.wienerdog.dream.plist` whose content contains
    `tempRoot`, **ignores** a Wienerdog entry whose content references a
    different (real) path, and — asserted explicitly — **leaves both files on
    disk** (observer, not cleaner).
  - **F5 differing-HOME derivation (no `opts.dir`; inject `opts.env` with `HOME`
    set to a temp dir ≠ `os.homedir()`):**
    - **macOS branch:** with `opts.platform='darwin'` and
      `opts.env.HOME='<tmpHome>'`, plant a `tempRoot`-referencing plist under
      `<tmpHome>/Library/LaunchAgents`; the observer scans **that** dir (derived
      from `env.HOME`, not `os.homedir()`) and reports the leak.
    - **Linux HOME-fallback branch:** with `opts.platform='linux'`,
      `opts.env.HOME='<tmpHome>'`, and no `XDG_CONFIG_HOME`, plant a leaked
      `.timer` under `<tmpHome>/.config/systemd/user`; the observer scans that
      dir and reports it. Assert both derive from the injected `env.HOME`, so a
      HOME-redirection regression could not hide in a dir the observer skipped.
    - **Linux XDG-scan branch (Codex F6 — proves the OBSERVER itself honors
      `XDG_CONFIG_HOME`, not just `buildInitEnv`):** with `opts.platform='linux'`
      and `opts.env` carrying `HOME='<tmpHome>'` **and** `XDG_CONFIG_HOME='<tmpXdg>'`
      pointing at **different** temp dirs, plant the leaked `.timer` **only** under
      `<tmpXdg>/systemd/user` (leave `<tmpHome>/.config/systemd/user` empty or
      absent). The observer must scan `<tmpXdg>/systemd/user` and **report** the
      leak. This fails an observer that always looks at `<HOME>/.config/systemd/user`
      — so it proves the observer's Linux dir derivation matches `systemdUserDir`
      exactly (XDG preferred over the HOME fallback), closing the gap where a leak
      on an XDG machine would be missed while every other branch still passed.
- [ ] `npm test` and `npm run lint` are green. (The two runner edits are not
      exercised by `npm test`, which does not set `WIENERDOG_RUN_SCENARIOS`.)
- [ ] Static check: `grep -n "buildInitEnv\|assertNoRealSchedulerLeak\|assertNoLoaderInvoked" tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js`
      shows the init-env + both tripwires wired in both runners, and the `dream`
      call still receives the original `env` (not `initEnv`).
- [ ] **Ordering (Codex F7):** in **both** runners, `assertNoLoaderInvoked(shim)`
      runs **before** `fs.rmSync(root)` (the shim log lives under `root`; checking
      it after the delete would read the wiped log as a false clean and mask a
      `LOADER_NOOP` regression). Assert this by source ordering — the
      `assertNoLoaderInvoked` call precedes the `fs.rmSync(root, …)` call in each
      runner's `finally`. (The observer may run either side — it reads the real dir.)
- [ ] **Live proof (gated; run manually, paste output):** on a clean machine,
      `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative` (and the main
      scenarios run) leaves `ls ~/Library/LaunchAgents | grep -i wienerdog`
      **empty**, `launchctl list | grep -i wienerdog` **empty** (macOS) /
      `ls "${XDG_CONFIG_HOME:-$HOME/.config}"/systemd/user | grep -i wienerdog`
      **empty** (Linux), and the run reports no loader-invoked / leak failure.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "scheduler-leak-guard"
npm test
npm run lint
grep -n "buildInitEnv\|assertNoRealSchedulerLeak\|assertNoLoaderInvoked" \
  tests/scenarios/run-scenarios.js tests/scenarios/negative/run-negative.js
# Optional live proof (spends real quota; maintainer's machine only):
#   WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:negative
#   ls ~/Library/LaunchAgents | grep -i wienerdog          # macOS: must be empty
#   launchctl list | grep -i wienerdog                     # macOS: must be empty
#   ls "${XDG_CONFIG_HOME:-$HOME/.config}"/systemd/user | grep -i wienerdog  # Linux: empty
```

## Out of scope (do NOT do these)

- Any change to product `src/` (scheduler, init, paths, run-job, generators). A
  real containment gap there is a separate WP back to wd-architect.
- Adding an env override for the scheduler directories in the product scheduler
  layer — the init-env `HOME`+`XDG_CONFIG_HOME` redirect makes it unnecessary.
- `tests/scenarios/broker-e2e/run-broker-e2e.js` (already redirects `HOME`, never
  schedules) and the `tests/unit/*` adopt-e2e path (already uses `LOADER_NOOP`).
- Any change to how the scenario runners authenticate or what quota they spend
  (ADR-0009 stands) — the `dream` subprocess env is untouched.
- A destructive post-hoc cleaner that removes real scheduler entries or files.

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
