---
id: WP-013
title: Implement scheduler generators and the schedule command (launchd + systemd, reversible)
status: Ready
model: opus
size: M
depends_on: [WP-003]
adrs: [ADR-0004]
branch: wp/013-scheduler-generators
---

# WP-013: Implement scheduler generators and the schedule command (launchd + systemd, reversible)

## Context (read this, nothing else)

Wienerdog runs jobs (the nightly dream, a morning digest, …) on a schedule **without
a daemon**. The mechanism, per ADR-0004, is entirely OS-native: Wienerdog writes a
launchd plist (macOS) or a systemd user timer+service (Linux) that, when the clock
strikes, launches a **short-lived** `wienerdog run-job <name>` process which does its
work and exits. Nothing of Wienerdog's stays resident. This is the product's defining
safety claim: *Wienerdog is just files.*

This work package builds the **"generate and register" half** of the scheduler: the
`wienerdog schedule add|remove|list` command, the pure functions that render the
OS-native entry files, the storage of job definitions, and the manifest bookkeeping
that makes every scheduled entry **reversible** (uninstall unloads and removes it).
The **`run-job` execution wrapper** it points at — clean env, TCC-guard, watchdog,
logs, fail-loud, catch-up — is the sibling work package **WP-020**; this WP renders an
entry that *invokes* `wienerdog run-job <name>` but does not implement `run-job`
itself. (The two land in sequence before milestone M6; a registered entry that
invokes a not-yet-built `run-job` simply no-ops until WP-020 merges — acceptable in
this dependency order.)

Product invariants that govern every line here:

- **No daemon, no polling, nothing that outlives the job (ADR-0004).** You generate
  files and hand them to the OS scheduler. You never start a listener or a loop.
- **Everything is manifest-tracked and reversible (Threat model T5).** `uninstall`
  replays the manifest in reverse and must leave the machine with zero Wienerdog
  scheduler entries — both the files *and* the OS registration (a plist left loaded in
  launchd, or a timer left enabled in systemd, is executable residue). So a scheduler
  entry needs a manifest kind whose reverse **unloads then deletes**.
- **Idempotent (CLAUDE.md).** `schedule add` of a job that already exists updates it in
  place with zero spurious churn; running it twice makes no further change.

Two hard platform facts this design rests on (verified 2026-07, ARCHITECTURE
§Scheduler; codified from the owner's claude-os production system):

1. **launchd plists do not expand `$HOME` or `$PATH`.** Every path in a plist must be
   **absolute** — the node binary, `bin/wienerdog.js`, and the log paths. A plist with
   `~` or `$HOME` in it silently fails to run.
2. **launchd `StartCalendarInterval` fires missed jobs on wake but NOT after a
   power-off.** The macOS fix (a login + hourly catch-up entry) belongs to WP-020's
   `run-job --catch-up`. systemd's `Persistent=true` (set here) catches up natively on
   Linux, so Linux needs no separate catch-up unit.

## Current state

These files exist from **Done** WPs. Treat their signatures as fixed contracts.

- **`bin/wienerdog.js`** — dispatches top-level commands via a `commands` map
  (`{init, sync, dream, doctor, uninstall}`), each value a loader `() =>
  require('../src/cli/<cmd>')` whose module exports `async function run(argv)`. Unknown
  command → prints `USAGE`, exit 2. A thrown `WienerdogError` → `bin` prints
  `wienerdog: <message>`, exit 1. You add one entry (`schedule`) and one `USAGE` line.
- **`src/core/paths.js`** — `getPaths(env = process.env)` →
  `{home, core, config, state, secrets, logs, manifest, claudeDir, codexDir, vault}`.
  `config` = `<core>/config.yaml`; `state`/`logs` are dirs. There is **no** scheduler
  or LaunchAgents path in `getPaths` — derive OS-scheduler dirs locally (below), the
  same way WP-011 derives token paths locally under `secrets`.
- **`src/core/errors.js`** — `class WienerdogError extends Error`. Throw it for every
  expected failure (bad `--at`, unknown job, unsupported OS). `bin` renders it.
- **`src/cli/init.js`** (reference, do NOT modify) — writes `config.yaml`, records it
  in the manifest with a content `hash`, and after re-writing it **re-syncs the
  recorded hash** (`init.js` lines ~150-156) so `uninstall` doesn't mistake Wienerdog's
  own edit for a user edit. **Mirror this hash re-sync whenever you write a job into
  `config.yaml`.**
- **`src/core/manifest.js`** — `load(paths)`, `record(manifest, entry)`,
  `save(paths, manifest)`, `reverse(paths, manifest, {dryRun})`. Existing entry kinds:
  `file`, `dir`, `symlink`, `managed-block`, `settings-entry`, each with a precise
  reverse. `reverse` iterates entries in reverse order; unknown kinds are skipped with
  a warning (forward-compat). **You add a `scheduler-entry` kind** (below) and export a
  small helper so `schedule remove` can reverse a single entry without reversing the
  whole manifest.
- **`config.yaml`** initial shape (WP-003), flat top-level YAML:
  ```yaml
  version: 1
  vault: /Users/ada/wienerdog
  harnesses:
    claude: true
    codex: false
  memory_mode: standard
  ```
  It is read elsewhere by a **minimal line-based reader that only parses un-indented
  `key: value` lines and ignores comments and indented lines** (`src/core/dream/config.js`
  `readScalar`). Your jobs block must not break that reader — it won't, because it lives
  under an indented `jobs:` key inside comment sentinels (same technique WP-018's grants
  block uses; the two managed sections coexist — each preserves everything outside its
  own sentinels byte-for-byte).

Nothing under `src/scheduler/` exists — you are creating it. No `state/schedule.json`
exists yet either.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/scheduler/generators.js | pure text renderers: per-job launchd plist, systemd timer+service, catch-up plist; absolute-path helpers |
| create | src/scheduler/jobs.js | job definitions (managed `jobs:` section in config.yaml, hash re-sync) + `state/schedule.json` watermark read/write |
| create | src/cli/schedule.js | `schedule add\|remove\|list`; platform dispatch; loader seam; manifest registration |
| modify | src/core/manifest.js | add `scheduler-entry` kind (reverse = unload then rm); export `reverseSchedulerEntry` |
| modify | bin/wienerdog.js | add `schedule` to the `commands` map + one usage line |
| create | tests/unit/scheduler-generators.test.js | golden plist / systemd / catch-up text; `--at` → Hour/Minute mapping |
| create | tests/unit/scheduler-schedule.test.js | add/remove/list with stubbed loader; jobs round-trip; manifest reverse; schedule.json |

### Exact contracts

#### Local path derivation (in `generators.js`, exported for `schedule.js`)

```js
/** Absolute path to the node binary that will run wienerdog under the scheduler.
 *  @returns {string} process.execPath (already absolute). */
function nodePath()

/** Absolute path to this install's bin/wienerdog.js (resolve from __dirname:
 *  path.resolve(__dirname, '..', '..', 'bin', 'wienerdog.js')). Never a relative
 *  path — launchd/systemd do not resolve cwd. @returns {string} */
function wienerdogBin()

/** macOS LaunchAgents dir: path.join(home, 'Library', 'LaunchAgents'). @param {string} home */
function launchAgentsDir(home)

/** systemd user unit dir: $XDG_CONFIG_HOME/systemd/user || path.join(home,'.config','systemd','user').
 *  @param {string} home @param {NodeJS.ProcessEnv} env */
function systemdUserDir(home, env)

/** launchd Label / systemd unit base for a job. name 'daily-digest' →
 *  launchd label 'ai.wienerdog.daily-digest'; systemd units
 *  'wienerdog-daily-digest.timer' / '.service'. @param {string} name */
function launchdLabel(name)        // → `ai.wienerdog.${name}`
function systemdUnitBase(name)     // → `wienerdog-${name}`
```

#### `--at HH:MM` parsing (in `generators.js`, exported)

```js
/** Parse a 24-hour "HH:MM" clock string. Throws WienerdogError('invalid --at ...')
 *  on anything not matching ^([01]?\d|2[0-3]):[0-5]\d$.
 *  @param {string} at @returns {{hour:number, minute:number}} */
function parseAt(at)
```

#### launchd plist renderer

```js
/** Render a per-job launchd plist. All paths ABSOLUTE (no $HOME/~).
 *  @param {{name:string, hour:number, minute:number, node:string, bin:string,
 *           logDir:string}} o  logDir = <core>/logs/<name> (absolute)
 *  @returns {string} the full plist XML */
function launchdPlist(o)
```

Exact expected output for `launchdPlist({name:'daily-digest', hour:7, minute:0,
node:'/usr/local/bin/node', bin:'/opt/wienerdog/bin/wienerdog.js',
logDir:'/Users/ada/.wienerdog/logs/daily-digest'})` — the golden the test asserts
byte-for-byte:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>ai.wienerdog.daily-digest</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>/opt/wienerdog/bin/wienerdog.js</string>
    <string>run-job</string>
    <string>daily-digest</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>7</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/ada/.wienerdog/logs/daily-digest/launchd.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/ada/.wienerdog/logs/daily-digest/launchd.err.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
```

#### catch-up launchd plist renderer

```js
/** Render the single macOS catch-up plist (login + hourly). It invokes
 *  `wienerdog run-job --catch-up` (WP-020). RunAtLoad true, plus hourly at minute 0.
 *  @param {{node:string, bin:string, logDir:string}} o  logDir = <core>/logs/catchup
 *  @returns {string} plist XML with Label 'ai.wienerdog.catchup' */
function catchupPlist(o)
```

The catch-up plist differs from a per-job plist only in: `Label`
`ai.wienerdog.catchup`; `ProgramArguments` end `run-job`, `--catch-up`;
`<key>RunAtLoad</key><true/>` present; `StartCalendarInterval` is a single
`<dict><key>Minute</key><integer>0</integer></dict>` (hourly, every hour at :00).

#### systemd timer + service renderers

```js
/** @param {{name:string, hour:number, minute:number}} o @returns {string} .timer unit text */
function systemdTimer(o)
/** @param {{name:string, node:string, bin:string}} o @returns {string} .service unit text */
function systemdService(o)
```

Exact `.timer` for `{name:'daily-digest', hour:7, minute:0}` (golden):

```ini
[Unit]
Description=Wienerdog job: daily-digest

[Timer]
OnCalendar=*-*-* 07:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Exact `.service` for `{name:'daily-digest', node:'/usr/bin/node',
bin:'/opt/wienerdog/bin/wienerdog.js'}` (golden):

```ini
[Unit]
Description=Wienerdog job: daily-digest

[Service]
Type=oneshot
ExecStart=/usr/bin/node /opt/wienerdog/bin/wienerdog.js run-job daily-digest
```

`OnCalendar` time is zero-padded `HH:MM:00`. `Persistent=true` is mandatory (native
catch-up). There is **no** separate systemd catch-up unit.

#### `src/scheduler/jobs.js`

Job **definitions** are stable config → stored in a managed section of `config.yaml`.
Job **run watermarks** (`last_success`, `last_status`) are frequently-changing machine
state → stored in `state/schedule.json` (never in `config.yaml`, whose manifest hash
must not churn on every run — ARCHITECTURE: machine state lives in `state/`).

Managed `jobs:` section format (sentinels are full lines including the leading `#`):

```yaml
# --- wienerdog:jobs (managed by `wienerdog schedule`; do not edit by hand) ---
jobs:
  - name: dream
    at: "03:30"
    run: builtin:dream
    timeout_minutes: 20
  - name: daily-digest
    at: "07:00"
    run: skill:wienerdog-daily-digest
    timeout_minutes: 15
# --- end wienerdog:jobs ---
```

`run` is `builtin:<name>` (a built-in Wienerdog job, e.g. `builtin:dream`, wrapping the
existing `wienerdog dream` pipeline) or `skill:<skill-name>` (a `claude -p`/skill job).
This is exactly how WP-020's `run-job` decides what to execute. The section is absent
when there are no jobs.

```js
/** Parse the jobs managed-section. Absent → []. Tolerant of the exact block this
 *  module writes; never parses arbitrary YAML.
 *  @param {string} configText
 *  @returns {Array<{name:string, at:string, run:string, timeoutMinutes:number}>} */
function parseJobs(configText)

/** Return configText with the jobs section replaced by `jobs` (removed entirely if
 *  empty). Everything OUTSIDE the sentinels — including a WP-018 grants section —
 *  is preserved byte-for-byte; the section is (re)written just before EOF with
 *  exactly one blank line before it. @param {string} configText
 *  @param {Array<{name,at,run,timeoutMinutes}>} jobs @returns {string} */
function renderConfigWithJobs(configText, jobs)

/** Upsert one job (add, or replace the job with the same name) and persist
 *  config.yaml, then re-sync the manifest hash (mirror init.js) so uninstall stays
 *  clean. @param {WienerdogPaths} paths
 *  @param {{name,at,run,timeoutMinutes}} job */
function saveJob(paths, job)

/** Remove the job with this name from config.yaml (+ re-sync manifest hash).
 *  No-op if absent. @param {WienerdogPaths} paths @param {string} name */
function removeJob(paths, name)

/** @param {WienerdogPaths} paths @param {string} name
 *  @returns {{name,at,run,timeoutMinutes}|null} */
function findJob(paths, name)

/** All defined jobs. @param {WienerdogPaths} paths @returns {Array<...>} */
function listJobs(paths)

/** Read state/schedule.json. Missing/corrupt → {}.
 *  @param {WienerdogPaths} paths
 *  @returns {Record<string,{last_success?:string,last_status?:string,last_error_at?:string}>} */
function readScheduleState(paths)

/** Merge one job's watermark and write state/schedule.json atomically (temp+rename).
 *  @param {WienerdogPaths} paths @param {string} name
 *  @param {{last_success?:string,last_status?:string,last_error_at?:string}} patch */
function writeScheduleState(paths, name, patch)

module.exports = { parseJobs, renderConfigWithJobs, saveJob, removeJob, findJob,
  listJobs, readScheduleState, writeScheduleState };
```

`timeout_minutes` default when `--timeout` is not given: 20 for `builtin:dream`, 15
otherwise (a modest default so a runaway skill job cannot burn quota indefinitely —
WP-020 enforces it).

#### `src/core/manifest.js` — new `scheduler-entry` kind

Add to the JSDoc typedef and to `reverse`. Entry shape:

```jsonc
{ "kind": "scheduler-entry", "path": "<absolute unit/plist file path>",
  "unload": ["launchctl", "bootout", "gui/501/ai.wienerdog.daily-digest"] }
```

`unload` is an **argv array** (command + args) that unregisters the entry from the OS
scheduler, or omitted/`null` when no unload is needed (e.g. a systemd `.service` file,
whose `.timer` sibling carries the unload). Reverse semantics (add a
`reverseSchedulerEntry(entry, {dryRun}, removed, skipped, removedSet)` helper mirroring
the existing `reverse*` helpers, wire it into the `reverse` dispatch, **and export it**
so `schedule remove` can reuse it for one job):

1. If `entry.unload` is a non-empty array and not `dryRun`: run it best-effort via
   `child_process.spawnSync(entry.unload[0], entry.unload.slice(1))` — **ignore a
   non-zero exit or error** (the job may already be unloaded; the goal is the file
   removal). On `dryRun`, print the unload argv instead of running it.
2. If the file at `entry.path` exists: `fs.rmSync(path, {force:true})` (skip on dryRun);
   push to `removed`. If it is already gone, push to `skipped`.

Keep `manifest.js` free of any launchd/systemd knowledge beyond running the stored
`unload` argv — the platform specifics live in `schedule.js`/`generators.js`, which
compute the `unload` argv at add time and store it in the entry.

#### `src/cli/schedule.js`

```js
/** wienerdog schedule <add|remove|list> ...
 *  @param {string[]} argv @returns {Promise<void>} */
async function run(argv)
```

- **`schedule add <name> --at HH:MM (--skill <skill> | --job <builtin>) [--timeout <min>]`**
  - Validate: exactly one of `--skill`/`--job`; `--at` via `parseAt`; `<name>` matches
    `^[a-z0-9][a-z0-9-]*$` (safe for filenames/labels). Missing/invalid → `WienerdogError`
    naming the problem.
  - `run` field = `skill:<skill>` or `builtin:<builtin>`. `saveJob(paths, {...})`.
  - Render the OS entry(ies) for the current platform, write the file(s) into the
    platform dir (mkdir -p), record a `scheduler-entry` manifest entry per file with
    the correct `unload` argv, then **load** them via the injectable loader (below).
    macOS: also `ensureCatchup(paths, {loader})` — write+register the catch-up plist
    once (idempotent; skip if its file already exists and is registered).
  - Idempotent: re-adding an existing job overwrites its file(s) with identical content
    and reloads; if content is byte-identical and already loaded, make no OS call and
    print "unchanged".
  - Unsupported platform (`win32`, or Linux without systemd): `WienerdogError` with a
    plain message (Windows `schtasks` is v1.1; non-systemd Linux fallback is out of
    scope).
- **`schedule remove <name>`** — find the job's `scheduler-entry` manifest entries
  (match by the file path prefix / label for `<name>`), call the exported
  `reverseSchedulerEntry` on each (unload + rm), drop those entries from the manifest
  and `save`, and `removeJob(paths, name)`. No-op with a notice if the job is unknown.
- **`schedule list`** — print each defined job: name, `at`, `run`, and its
  `last_success`/`last_status` from `readScheduleState`. `--json` → machine output.

**Loader seam (mandatory for testability).** All OS registration goes through one
injectable function so tests never touch real launchd/systemd:

```js
/** @param {string[]} argv  e.g. ['launchctl','bootstrap','gui/501','<plist>']
 *  @returns {{status:number}} — real impl: spawnSync(argv[0], argv.slice(1)). */
function defaultLoader(argv)
```

`run(argv, {loader = defaultLoader} = {})` — tests pass a spy loader and assert the
files written + manifest entries + the exact loader argvs, WITHOUT running launchctl/
systemctl. Load/unload argvs per platform:

- macOS load: `['launchctl','bootstrap',`gui/${uid}`,<plistPath>]` (uid = `process.getuid()`);
  unload (stored in the manifest entry): `['launchctl','bootout',`gui/${uid}/${label}`]`.
- Linux load: `['systemctl','--user','daemon-reload']` then
  `['systemctl','--user','enable','--now',`${unitBase}.timer`]`; also best-effort
  `['loginctl','enable-linger', <user>]` (so timers fire when logged out — best-effort,
  ignore failure). Unload (stored on the `.timer` entry):
  `['systemctl','--user','disable','--now',`${unitBase}.timer`]`. The `.service` entry
  stores no `unload`.

#### `bin/wienerdog.js` (modify)

Add `schedule: () => require('../src/cli/schedule')` to the `commands` map and one
`USAGE` line, aligned:

```text
  schedule    Add, remove, or list scheduled jobs (dream, routines)
```

### Example I/O

```
$ wienerdog schedule add dream --at 03:30 --job dream
wienerdog: scheduled "dream" (builtin:dream) at 03:30 via launchd; catch-up ensured.

$ wienerdog schedule add daily-digest --at 07:00 --skill wienerdog-daily-digest
wienerdog: scheduled "daily-digest" (skill:wienerdog-daily-digest) at 07:00 via launchd.

$ wienerdog schedule list --json
[
  { "name":"dream", "at":"03:30", "run":"builtin:dream",
    "last_success":"2026-07-03T03:30:12.000Z", "last_status":"ok" },
  { "name":"daily-digest", "at":"07:00", "run":"skill:wienerdog-daily-digest",
    "last_success":null, "last_status":null }
]

$ wienerdog schedule remove daily-digest
wienerdog: removed "daily-digest" (unloaded and deleted its schedule entry).
```

## Implementation notes & constraints

- **Zero new runtime dependencies.** Node stdlib only (`child_process` for the loader
  and manifest unload, `fs`, `path`, `os`, `crypto` for the config hash re-sync).
  JSDoc types, no TypeScript, no build step.
- **Absolute paths everywhere in generated entries** — the #1 launchd trap. No `~`, no
  `$HOME`, no relative paths. `nodePath()`/`wienerdogBin()` return absolute paths;
  logDir is `<paths.logs>/<name>` (absolute).
- **Platform dispatch** on `process.platform`: `darwin` → launchd, `linux` → systemd
  (detect systemd by the presence of `systemctl` on PATH or `/run/systemd/system`;
  absent → `WienerdogError`, non-systemd fallback out of scope), else → `WienerdogError`.
- **The loader is the only place that calls launchctl/systemctl.** Everything else
  (file write, manifest record, config write) is pure filesystem and is what the tests
  assert. Real OS registration is manual-verify-at-M6.
- **Reversibility is the acceptance bar (T5).** After `schedule add`, an `uninstall`
  (which calls `manifest.reverse`) must run each entry's `unload` argv and delete each
  file. Test this by asserting `reverseSchedulerEntry` runs the stored unload (spy) and
  removes the file; and that a full `manifest.reverse` on a manifest containing
  scheduler entries invokes unload and clears the files.
- **config.yaml coexistence:** `renderConfigWithJobs` must preserve a WP-018 grants
  section (and anything else) outside the jobs sentinels byte-for-byte. Test with a
  config that already contains a grants section: adding/removing a job leaves the grants
  bytes untouched.
- When uncertain: choose the simpler option and record it under "Decisions made". Do
  NOT expand scope (no Windows, no crontab fallback, no `run-job` implementation).

## Acceptance criteria

- [ ] `launchdPlist`, `catchupPlist`, `systemdTimer`, `systemdService` render exactly
      the golden text above (byte-for-byte) for the given inputs; all generated paths
      are absolute.
- [ ] `parseAt` accepts `00:00`–`23:59` and throws `WienerdogError` on anything else.
- [ ] `schedule add` (stubbed loader) writes the platform entry file(s), records one
      `scheduler-entry` manifest entry per file with the correct `unload` argv, saves
      the job into the `config.yaml` `jobs:` section, re-syncs the manifest hash, and on
      macOS ensures the catch-up plist once; a second identical `add` is idempotent.
- [ ] `parseJobs`/`renderConfigWithJobs` round-trip; content outside the jobs sentinels
      (including a pre-existing grants section) is byte-identical; removing all jobs
      removes the whole section.
- [ ] `schedule remove` (stubbed loader) runs the stored unload argv, deletes the
      file(s), drops the manifest entries, and removes the job from config.yaml.
- [ ] `manifest.reverse` on a manifest with `scheduler-entry` entries runs each stored
      `unload` (spy) then removes the file; `--dry-run` runs nothing but reports.
- [ ] After a job write, `manifest.reverse` still removes `config.yaml` (hash re-synced)
      — uninstall leaves no residue.
- [ ] `schedule list --json` reports each job with its `last_success`/`last_status`
      from `state/schedule.json`.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern scheduler-generators
npm test -- --test-name-pattern scheduler-schedule
npm run lint
# Generated-entry sanity (no OS registration; uses the stubbed loader path):
node -e "const g=require('./src/scheduler/generators'); process.stdout.write(g.launchdPlist({name:'demo',hour:7,minute:0,node:'/usr/local/bin/node',bin:'/opt/wienerdog/bin/wienerdog.js',logDir:'/Users/ada/.wienerdog/logs/demo'}))"
```

**Live OS registration (launchctl load on macOS / systemctl --user on Linux) is
manual-verify-at-M6** against a real machine; unit tests cover all generation,
config/manifest bookkeeping, and reverse logic with a stubbed loader.

## Out of scope (do NOT do these)

- **The `run-job` execution wrapper** — WP-020: clean env, TCC-guard, watchdog, log
  rotation, fail-loud, `last_success` writing, and `run-job --catch-up`. This WP only
  renders entries that *invoke* `wienerdog run-job <name>` / `--catch-up` and stores
  job definitions.
- **Windows `schtasks`** (v1.1) and **non-systemd Linux crontab fallback** — future.
- **Actually loading entries into real launchd/systemd in tests** — use the loader
  seam; real loading is manual-verify-at-M6.
- **The routine catalog / daily-digest skill** — WP-014.
- **Editing `src/cli/init.js`, `src/core/paths.js`, or the initial `config.yaml`
  template** — only append the managed jobs section at runtime and re-sync the hash;
  derive scheduler dirs locally.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/013-scheduler-generators`; PR titled `feat(scheduler): generators + schedule command, reversible entries (WP-013)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
