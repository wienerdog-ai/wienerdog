---
id: WP-070
title: Scheduler-load health check — doctor + digest surface "configured but not loaded", sync heals
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0013, ADR-0015, ADR-0018]
branch: wp/070-scheduler-load-health-check
---

# WP-070: Scheduler-load health check (doctor + digest surface "configured but not loaded")

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly **dream** at 03:30, plus opt-in routines like
`daily-digest`) through **OS-native scheduler entries** that all invoke
`wienerdog run-job <name>` — a short-lived process. On macOS these are launchd
LaunchAgents (`~/Library/LaunchAgents/ai.wienerdog.<name>.plist`, plus one
`ai.wienerdog.catchup.plist`); on Linux they are systemd user units
(`wienerdog-<name>.timer` + `.service`); on Windows they are Task Scheduler XML
tasks (`\Wienerdog\<name>`, plus `\Wienerdog\catchup`). Every one of these is
recorded in the install manifest as a `scheduler-entry` (see "Current state").

**IRON RULE (ADR-0004): Wienerdog is just files.** No daemons, no servers, no
process that outlives its job, no telemetry. This WP starts nothing that keeps
running: it adds a **read-only probe** of the OS scheduler that runs only inside
already-short-lived commands (`sync`, `run-job`), plus one heal step in `sync`.

### The incident this closes (2026-07-07, confirmed in production)

The user's launchd **dream and catchup agents were silently UNLOADED** — the
`.plist` files were intact on disk, but `launchctl` had **no record** of them
(exit 113 on `launchctl print`). So at 03:30 nothing fired: no dream ran, no
failure alert was raised (the fail-loud path only triggers on a job that *runs*
and *fails*), and the whole thing was discovered only because a morning report
was missing. Probable trigger: a scheduler test running under a temp `HOME` still
`launchctl bootout`'d the real agent, because the launchd label `ai.wienerdog.dream`
is **per-user-global, not HOME-scoped** (WP-071 fixes the test-side root cause; this
WP makes the *symptom* — a configured-but-not-loaded job — visible so it can never
again be invisible).

### The three invariants that shape this WP

1. **Read-only from doctor and digest.** `wienerdog doctor` and the injected
   session digest must **never mutate** the OS scheduler — they only *observe*
   (`launchctl print`, `systemctl is-active`, `schtasks /query`). The single place
   that *reloads* an unloaded entry is `wienerdog sync` (below), never doctor,
   never the digest, never a headless job.
2. **Cache-then-render for the digest (mirror ADR-0015 / the update-check split).**
   The SessionStart hook that injects the digest must stay <200ms with **no
   subprocess/network budget** — it only `cat`s a pre-rendered file
   (`state/digest.md`). Therefore the scheduler probe (a subprocess) runs during
   `sync`/`run-job` (which already spawn things), writes its result to a **state
   cache** (`state/scheduler-status.json`), and the digest renders **from that
   cache only**. This is exactly how the "update available" notice works today:
   `maybeRefresh` writes `state/update-check.json` in `run-job`; `renderUpdateLine`
   reads that cache and returns a line; callers pass it into `renderDigest`.
3. **Honest, working remediation.** The message doctor/digest show must quote a
   command that **actually reloads** the entry. Verified: plain `wienerdog sync`
   does **not** reload an unloaded-but-file-intact entry today, because
   `ensureEntry` short-circuits when the on-disk content is identical and a
   manifest entry exists (it never calls the loader). This WP adds a **heal step
   to `sync`** so that `wienerdog sync` *does* re-load any registered entry the OS
   has lost — making the quoted remediation true.

## Current state

All paths below exist and were read for this spec.

### Manifest `scheduler-entry` shape — the source of truth for "what should be loaded"

`src/core/manifest.js` records one entry per registered OS scheduler artifact:

```
{ kind: 'scheduler-entry', path: '<abs file>', unload?: ['<argv>', ...] }
```

The `unload` argv is the exact command that *unregisters* the entry, stored at
registration time. It fully determines the platform and the OS identifier:

| Platform | entry.path (example) | entry.unload |
|---|---|---|
| launchd | `~/Library/LaunchAgents/ai.wienerdog.dream.plist` | `['launchctl','bootout','gui/<uid>/ai.wienerdog.dream']` |
| launchd (catch-up) | `.../ai.wienerdog.catchup.plist` | `['launchctl','bootout','gui/<uid>/ai.wienerdog.catchup']` |
| systemd | `~/.config/systemd/user/wienerdog-dream.timer` | `['systemctl','--user','disable','--now','wienerdog-dream.timer']` |
| schtasks | `<core>/schedules/wienerdog-dream.xml` | `['schtasks','/delete','/tn','\\Wienerdog\\dream','/f']` |

The systemd `.service` entry is recorded with **no** `unload` (`ensureEntry(...,
null)`) — it is not an independently-triggerable unit, so this WP **skips any
`scheduler-entry` that has no `unload`**. Iterating manifest entries (not
`config.yaml` `jobs:`) is deliberate: it covers the **catchup** agent, which was
part of the incident and is not a `jobs:` entry.

Load the manifest with `manifestLib.load(paths)` → `{ entries: [...] }`.

### `src/core/update-check.js` — the cache-then-render pattern to MIRROR

- `maybeRefresh(paths, opts)` (called in `run-job`): bounded, opt-out, **never
  throws**, writes `state/update-check.json`.
- `readState(paths)`: `JSON.parse` of the cache; missing/corrupt → `{}`.
- `writeState(paths, obj)`: atomic temp+rename; creates `state/`.
- `getUpdateNotice(paths)` / `renderUpdateLine(paths)`: **cache-only** (no network),
  return a fixed-template digest line or `''`.
- Env test seam: `WIENERDOG_UPDATE_FETCH_CMD` short-circuits the real network so
  tests are hermetic. This WP mirrors that with `WIENERDOG_SCHEDULER_PROBE`.

### `src/core/digest.js` — `renderDigest(vaultDir, layout=defaultLayout(), opts={})`

Deterministic, paths-free, pure. Prefix blocks are passed in by callers and
prepended in a fixed order. Today:

```js
const prefix = [formatAlerts(opts.alerts || []), opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
return prefix ? `${prefix}\n\n${body}` : body;
```

`opts` is `{ alerts?: [...], updateLine?: string }`. **Only `sync.js` and
`dream.js` call `renderDigest`.** `dream.js` is owned by the in-flight **WP-069**
and is **out of scope here** (see Out of scope).

### `src/cli/doctor.js` — `run(_argv)`

Prints one `[ok]`/`[warn]`/`[fail]` line per check via a local `check(status, msg)`
helper (`fail` sets `process.exitCode = 1`). Already computes `paths` and loads
the manifest. It prints the cache-only update notice near the end:

```js
const upd = getUpdateNotice(paths);
if (upd.available) console.log(`[info] a newer Wienerdog is available ...`);
```

### `src/cli/sync.js` — `run(argv, opts={})`

The compiler pass. Already: vendors, calls `repointSchedules(paths, manifest,
{loader: opts.loader})`, then (when a vault is configured) renders the digest:

```js
const digest = renderDigest(vaultPath, layout,
  { alerts: readAlerts(paths), updateLine: renderUpdateLine(paths) });
```

`opts.loader` is the scheduler-loader seam (defaults to `require('./schedule').defaultLoader`).
`repointSchedules` re-registers each `jobs:` entry **only when content changed** —
it does NOT reload an entry the OS silently lost (that is what this WP's heal fixes).

### `src/cli/run-job.js` — `run(argv, opts={})`

The wrapper the OS scheduler launches. At the top of `run()` it already does the
bounded, never-throws update refresh:

```js
try { await maybeRefresh(paths, { fetchLatest: opts.fetchLatest }); }
catch { /* never affects the job */ }
```

This WP adds the scheduler-status refresh right beside it, with the same
"bounded, never throws, never alters exit code" discipline.

### `src/cli/schedule.js` — `defaultLoader(argv)` (the loader seam; NOT modified here)

```js
function defaultLoader(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return { status: 0 };
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}
```

`WIENERDOG_LOADER_NOOP` neutralizes real scheduler spawns in tests. The reload in
this WP goes through this same seam (passed as `opts.loader`), so it inherits the
NOOP kill-switch and (once WP-071 lands) the hard test guard.

### Tests to be aware of

- `tests/unit/digest.test.js` — has a golden byte-for-byte test and an explicit
  **prefix-order** test (`alerts → updateLine → body`). This WP updates that order
  to `alerts → schedulerLine → updateLine → body` and adds a backward-compat case.
- `tests/unit/doctor.test.js` — runs the **real bin** as a subprocess via
  `execFileSync`. Its `tempEnv()` does **not** set `WIENERDOG_LOADER_NOOP`, so its
  `init --fresh-vault` test currently spawns real `launchctl` under a temp HOME (a
  pre-existing leak — the incident vector). This WP adds `WIENERDOG_LOADER_NOOP: '1'`
  to `tempEnv()` (hermeticity) and adds a scheduler-status subprocess test using
  the `WIENERDOG_SCHEDULER_PROBE` seam.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/scheduler/status.js | probe + refresh + cache read + digest line + doctor checks + `reloadMissing` heal |
| modify | src/core/digest.js | add `opts.schedulerLine`; prefix order `alerts → schedulerLine → updateLine → body` |
| modify | src/cli/doctor.js | one `[ok]`/`[warn]` check per registered scheduler entry (LIVE read-only probe) |
| modify | src/cli/sync.js | heal (`reloadMissing`) + refresh cache + pass `schedulerLine` into `renderDigest` |
| modify | src/cli/run-job.js | bounded, never-throws `refreshSchedulerStatus` call beside `maybeRefresh` |
| modify | docs/adr/0018-windows-scheduled-dreaming.md | dated amendment: read-only health check + cache-then-render + per-user-global-labels invariant |
| create | tests/unit/scheduler-status.test.js | unit tests for status.js (injected probe/loader; no real scheduler) |
| modify | tests/unit/digest.test.js | schedulerLine prepend + order + empty-is-golden backward-compat |
| modify | tests/unit/doctor.test.js | `WIENERDOG_LOADER_NOOP` in `tempEnv()`; scheduler-status subprocess test via `WIENERDOG_SCHEDULER_PROBE` |

**Do NOT modify** `src/cli/dream.js`, `src/core/dream/*`, `src/cli/schedule.js`,
`src/scheduler/generators.js`, `src/core/manifest.js`, or any other test file. The
digest line in the **dream** write path is deliberately deferred (see Out of scope).
If you believe another file needs changing, that is a spec bug — stop and say so.

### Exact contract — `src/scheduler/status.js`

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifestLib = require('../core/manifest');

const STATUS_FILE = 'scheduler-status.json';

/** status.json path. @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function statusPath(paths) { return path.join(paths.state, STATUS_FILE); }

/**
 * Describe one registered scheduler entry from its manifest record: the human
 * name, the scheduler kind, and the READ-ONLY probe + RELOAD argv derived from
 * the stored `unload` argv and file path. Entries with no `unload` (the systemd
 * .service) or an unrecognized shape → null (skipped by callers).
 * @param {{path:string, unload?:string[]}} entry
 * @returns {{name:string, scheduler:'launchd'|'systemd'|'schtasks',
 *            probe:string[], reload:string[]}|null}
 */
function describeEntry(entry) {
  const u = entry.unload;
  if (!Array.isArray(u) || u.length === 0) return null;
  const base = path.basename(entry.path);
  if (u[0] === 'launchctl' && u[1] === 'bootout') {
    // u[2] = 'gui/<uid>/<label>'
    return {
      name: base.replace(/^ai\.wienerdog\./, '').replace(/\.plist$/, ''),
      scheduler: 'launchd',
      probe: ['launchctl', 'print', u[2]],
      reload: ['launchctl', 'bootstrap', u[2].split('/').slice(0, 2).join('/'), entry.path],
    };
  }
  if (u[0] === 'systemctl') {
    const unit = u[u.length - 1]; // '<unitBase>.timer'
    return {
      name: base.replace(/^wienerdog-/, '').replace(/\.timer$/, ''),
      scheduler: 'systemd',
      probe: ['systemctl', '--user', 'is-active', unit],
      reload: ['systemctl', '--user', 'enable', '--now', unit],
    };
  }
  if (u[0] === 'schtasks' && u[1] === '/delete') {
    const taskName = u[3]; // '\Wienerdog\<name>'
    return {
      name: base.replace(/^wienerdog-/, '').replace(/\.xml$/, ''),
      scheduler: 'schtasks',
      probe: ['schtasks', '/query', '/tn', taskName],
      reload: ['schtasks', '/create', '/tn', taskName, '/xml', entry.path, '/f'],
    };
  }
  return null;
}

/**
 * Default read-only probe: run `argv` and map the exit code. Honors the test
 * seams so a test NEVER touches the real OS scheduler:
 *   - WIENERDOG_LOADER_NOOP set        → 'unknown' (neutralized, mirrors the loader)
 *   - WIENERDOG_TEST_NO_REAL_SCHEDULER → 'unknown' (WP-071's guard; read-only, so
 *                                        we skip rather than throw)
 * Otherwise spawnSync (read-only): exit 0 → 'loaded'; any other exit / spawn error
 *   → 'missing'. Never throws.
 * @param {string[]} argv
 * @returns {'loaded'|'missing'|'unknown'}
 */
function defaultProbe(argv) {
  if (process.env.WIENERDOG_LOADER_NOOP) return 'unknown';
  if (process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) return 'unknown';
  const r = spawnSync(argv[0], argv.slice(1), { stdio: 'ignore' });
  if (r.error) return 'missing';
  return r.status === 0 ? 'loaded' : 'missing';
}

/**
 * Probe every registered scheduler entry. Read-only. `opts.probe` is the injected
 * seam (default defaultProbe). `WIENERDOG_SCHEDULER_PROBE` — a JSON map
 * `{ "<name>": "loaded"|"missing"|"unknown" }` — overrides by name (subprocess
 * test seam, mirrors WIENERDOG_UPDATE_FETCH_CMD). Never throws.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {Array<{name:string, scheduler:string, status:'loaded'|'missing'|'unknown'}>}
 */
function probeAll(paths, opts = {}) {
  const probe = opts.probe || defaultProbe;
  let envMap = null;
  try { envMap = JSON.parse(process.env.WIENERDOG_SCHEDULER_PROBE || 'null'); } catch { envMap = null; }
  let manifest;
  try { manifest = manifestLib.load(paths); } catch { return []; }
  const out = [];
  for (const e of manifest.entries || []) {
    if (e.kind !== 'scheduler-entry') continue;
    const d = describeEntry(e);
    if (!d) continue;
    const status = envMap && Object.prototype.hasOwnProperty.call(envMap, d.name)
      ? envMap[d.name]
      : probe(d.probe);
    out.push({ name: d.name, scheduler: d.scheduler, status });
  }
  return out;
}

/**
 * Refresh state/scheduler-status.json from a live probe. Bounded, NEVER throws.
 * Atomic temp+rename (mirrors update-check.writeState). No-op-safe when there are
 * no scheduler entries.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {void}
 */
function refreshSchedulerStatus(paths, opts = {}) {
  try {
    const entries = probeAll(paths, opts);
    fs.mkdirSync(paths.state, { recursive: true });
    const file = statusPath(paths);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify({ checked_at: new Date().toISOString(), entries }, null, 2)}\n`);
    fs.renameSync(tmp, file);
  } catch { /* status is best-effort; never blocks the caller */ }
}

/** Cache-only read. Missing/corrupt → {entries:[]}.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {{checked_at?:string, entries:Array<{name:string,scheduler:string,status:string}>}} */
function readSchedulerStatus(paths) {
  try {
    const o = JSON.parse(fs.readFileSync(statusPath(paths), 'utf8'));
    return { checked_at: o.checked_at, entries: Array.isArray(o.entries) ? o.entries : [] };
  } catch { return { entries: [] }; }
}

/**
 * Fixed-template digest callout from the cache (control-plane text only, no
 * untrusted input — the names are our own `[a-z0-9-]` job names). '' when no
 * entry is 'missing'. Mirrors renderUpdateLine (cache-only, no probe).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string}
 */
function renderSchedulerStatusLine(paths) {
  const missing = readSchedulerStatus(paths).entries.filter((e) => e.status === 'missing').map((e) => e.name);
  if (missing.length === 0) return '';
  const names = missing.map((n) => `"${n}"`).join(', ');
  // Amendment (2026-07-07, from the WP-070 review): select whole words for the
  // noun/verb/pronoun so pluralization can't drift on spacing. The prior
  // `job ${''|'s'}${names}` produced the broken `job s"dream", "catchup"`.
  const noun = missing.length === 1 ? 'job' : 'jobs';
  const verb = missing.length === 1 ? 'is' : 'are';
  const pronoun = missing.length === 1 ? 'it' : 'them';
  return `> [!warning] Wienerdog: the scheduled ${noun} ${names} ${verb} ` +
    `set up but not currently active in your computer's scheduler. Run 'wienerdog sync' to reactivate ` +
    `${pronoun}. (This can happen after some system updates.)`;
}

/**
 * doctor lines: one per registered entry, LIVE read-only probe. 'loaded' → ok,
 * 'missing' → warn (actionable, NOT a hard fail), 'unknown' → omitted (can't
 * determine — unsupported platform or neutralized). Read-only.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {Array<{status:'ok'|'warn', msg:string}>}
 */
function doctorSchedulerChecks(paths, opts = {}) {
  const out = [];
  for (const e of probeAll(paths, opts)) {
    if (e.status === 'loaded') {
      out.push({ status: 'ok', msg: `scheduled job '${e.name}' is loaded (${e.scheduler})` });
    } else if (e.status === 'missing') {
      out.push({
        status: 'warn',
        msg: `scheduled job '${e.name}' is configured but NOT loaded in ${e.scheduler} — run 'wienerdog sync' to reload it`,
      });
    } // 'unknown' → no line
  }
  return out;
}

/**
 * HEAL: re-load any registered entry the OS has lost. The ONLY mutation in this
 * module — used by `sync`, never by doctor/digest/run-job. For each entry that
 * probes 'missing', run its reload argv through the loader seam (defaultLoader,
 * which honors WIENERDOG_LOADER_NOOP and WP-071's guard). Never throws.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number},
 *          probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {{reloaded:string[]}}
 */
function reloadMissing(paths, opts = {}) {
  const loader = opts.loader || require('../cli/schedule').defaultLoader;
  const probe = opts.probe || defaultProbe;
  let envMap = null;
  try { envMap = JSON.parse(process.env.WIENERDOG_SCHEDULER_PROBE || 'null'); } catch { envMap = null; }
  /** @type {string[]} */ const reloaded = [];
  let manifest;
  try { manifest = manifestLib.load(paths); } catch { return { reloaded }; }
  for (const e of manifest.entries || []) {
    if (e.kind !== 'scheduler-entry') continue;
    const d = describeEntry(e);
    if (!d) continue;
    const status = envMap && Object.prototype.hasOwnProperty.call(envMap, d.name) ? envMap[d.name] : probe(d.probe);
    if (status !== 'missing') continue;
    try { loader(d.reload); reloaded.push(d.name); } catch { /* best-effort heal */ }
  }
  return { reloaded };
}

module.exports = {
  STATUS_FILE, statusPath, describeEntry, defaultProbe, probeAll,
  refreshSchedulerStatus, readSchedulerStatus, renderSchedulerStatusLine,
  doctorSchedulerChecks, reloadMissing,
};
```

### Exact contract — `src/core/digest.js`

Extend `opts` to `{ alerts?, updateLine?, schedulerLine? }` and prepend the
scheduler line **between alerts and updateLine** (a not-loaded scheduled job is
more urgent than an available update, less than an active failure alert):

```js
const prefix = [formatAlerts(opts.alerts || []), opts.schedulerLine || '', opts.updateLine || '']
  .filter((s) => s !== '')
  .join('\n\n');
return prefix ? `${prefix}\n\n${body}` : body;
```

Update the JSDoc `@param` for `opts` to document `schedulerLine`. When
`schedulerLine` is absent/empty the byte output is unchanged (the golden stays
valid).

### Exact contract — `src/cli/doctor.js`

After the harness-detection summary and **before** the update notice, add:

```js
const { doctorSchedulerChecks } = require('../scheduler/status');
for (const c of doctorSchedulerChecks(paths)) check(c.status, c.msg);
```

(`check` already prints `[ok]`/`[warn]` and only `fail` sets exit 1 — a missing
job is a `warn`, so doctor still exits 0. This matches the owner's "actionable
warn, not hard fail" ruling.)

### Exact contract — `src/cli/sync.js`

1. When **not** `dryRun`, right after the existing `repointSchedules(...)` block
   (which registers/repoints the `jobs:` entries), heal any entry the OS lost and
   refresh the cache:

   ```js
   const status = require('../scheduler/status');
   const heal = status.reloadMissing(paths, { loader: opts.loader });
   if (heal.reloaded.length > 0) {
     console.log(`wienerdog: reloaded ${heal.reloaded.length} scheduled job(s) the OS had dropped: ${heal.reloaded.join(', ')}.`);
   }
   status.refreshSchedulerStatus(paths);
   ```

   (Heal **before** refresh so the cache reflects the post-heal, clean state.)
   On `dryRun`, do neither (no writes, no OS calls).

2. Pass the cached line into `renderDigest`:

   ```js
   const digest = renderDigest(vaultPath, layout, {
     alerts: readAlerts(paths),
     schedulerLine: status.renderSchedulerStatusLine(paths),
     updateLine: renderUpdateLine(paths),
   });
   ```

### Exact contract — `src/cli/run-job.js`

In `run(argv, opts)`, immediately after the existing `maybeRefresh` try/catch,
add the bounded, never-throws scheduler-status refresh (keep the cache fresh on
the hourly catch-up run — the same freshness driver as the update check):

```js
try {
  require('../scheduler/status').refreshSchedulerStatus(paths, { probe: opts.probe });
} catch { /* never affects the job */ }
```

(`refreshSchedulerStatus` already swallows its own errors; the extra try/catch is
belt-and-suspenders and MUST never alter the job's exit code. `opts.probe` is an
optional test seam — production passes nothing → live read-only probe.)

## Implementation notes & constraints

- **Plain Node ≥ 18, zero runtime deps.** No new imports beyond node builtins and
  existing core modules.
- **Read-only from doctor/digest; the ONLY mutation is `sync` → `reloadMissing`.**
  Do not call `reloadMissing` from doctor, the digest, or `run-job`.
- **Iterate manifest `scheduler-entry` records, not `config.yaml` jobs.** This is
  what makes the **catchup** agent (the incident) covered — it is a manifest entry,
  not a `jobs:` entry. Skip any entry with no `unload` (the systemd `.service`) and
  any entry whose `unload` shape is unrecognized (`describeEntry` → null).
- **Frozen per-OS read-only probes** (exit 0 = loaded; anything else = missing):
  - launchd: `launchctl print gui/<uid>/<label>` (the exact probe from the
    incident; the observed not-loaded exit was 113 — do **not** special-case 113,
    treat any non-zero as missing).
  - systemd: `systemctl --user is-active <unitBase>.timer` (probe the `.timer`, not
    the `.service`; a unit whose file exists but the manager has no record returns
    non-zero, exactly the launchd-bootout analog).
  - schtasks: `schtasks /query /tn "\Wienerdog\<name>"`.
  All three derived from the stored `unload` argv + `entry.path` — no re-derivation
  of labels/units from job names (single source of truth). **Do not** guard the
  read-only `--version`/probe calls from `hasSystemd` — that lives in `schedule.js`
  and is out of scope.
- **Reload argv drift risk (record a lesson).** `reloadMissing`'s `reload` argv
  (launchctl bootstrap / systemctl enable --now / schtasks /create /xml) mirrors
  the load argv in `schedule.js`/`generators.js`. If those ever change how they
  load, `describeEntry` must be kept in sync. Note this in your PR "Decisions made".
- **Cache-then-render, mirroring update-check exactly.** The digest reads only the
  cache (`renderSchedulerStatusLine`). The probe runs in `sync`/`run-job`. Do not
  add a probe to `renderDigest` (it must stay pure/paths-free and <200ms-safe).
- **Test hermeticity (critical — this is the incident vector).** No test may spawn
  the real OS scheduler. Use the injected `probe`/`loader` seams in unit tests; use
  the `WIENERDOG_SCHEDULER_PROBE` JSON-map env + `WIENERDOG_LOADER_NOOP: '1'` in
  subprocess (`execFileSync`) tests. Add `WIENERDOG_LOADER_NOOP: '1'` to
  `doctor.test.js`'s `tempEnv()` (it currently leaks a real `launchctl` call on
  `init --fresh-vault`).
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope.

## Security checklist

- [ ] The digest line and doctor messages are **fixed-template control-plane text**.
      The only interpolated value is the job **name**, which originates from our own
      config/manifest (validated `^[a-z0-9][a-z0-9-]*$` at `schedule add` time) — no
      transcript/tool-result/untrusted content reaches the injected digest (ADR-0012
      part 3 / WP-041 separation). It is declarative status, never an instruction.
- [ ] `WIENERDOG_SCHEDULER_PROBE` is a **test-only** env seam parsed with a guarded
      `JSON.parse` (malformed → ignored). It selects a canned status by our own job
      name; it never flows into a path or a shell command.
- [ ] The probe and reload argv are built from the stored `unload` argv (Wienerdog-
      authored), not from user input; no untrusted identifier reaches `spawnSync`.

## Acceptance criteria

- [ ] `wienerdog doctor` prints `[ok] scheduled job '<name>' is loaded (<scheduler>)`
      for a loaded entry and `[warn] scheduled job '<name>' is configured but NOT
      loaded in <scheduler> — run 'wienerdog sync' to reload it` for a lost entry;
      a lost entry keeps doctor's exit code at 0 (warn, not fail).
- [ ] `renderDigest` prepends `opts.schedulerLine` between the alerts block and the
      update line; absent/empty `schedulerLine` leaves the golden byte-identical.
- [ ] `renderSchedulerStatusLine` returns a fixed-template `[!warning]` line naming
      exactly the entries whose cached status is `missing`, and `''` otherwise.
- [ ] `refreshSchedulerStatus` writes `state/scheduler-status.json` atomically and
      never throws; `run-job` and `sync` call it without affecting their behavior.
- [ ] `reloadMissing` calls the loader seam only for entries that probe `missing`,
      returns the reloaded names, and never throws; `sync` reports what it reloaded.
- [ ] Doctor/digest never mutate the scheduler; only `sync` reloads.
- [ ] No test spawns the real OS scheduler (verified: unit tests inject seams;
      subprocess tests set `WIENERDOG_SCHEDULER_PROBE` + `WIENERDOG_LOADER_NOOP`).
- [ ] Running `sync` twice with everything loaded is idempotent (second run:
      reloads nothing, cache re-written identical modulo `checked_at`).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "scheduler-status"
npm test -- --test-name-pattern "doctor"
npm test -- --test-name-pattern "digest"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- **The digest line in the DREAM write path.** `src/cli/dream.js` also renders the
  digest (its step 15) and is owned by the in-flight **WP-069**. Wiring the
  identical `schedulerLine: renderSchedulerStatusLine(paths)` into that one call is
  a trivial follow-up that must land **after** WP-069 (tracked in ROADMAP as the
  WP-070 follow-up note). Until then: `sync` carries the digest line, and `doctor`
  (a LIVE probe) is the authoritative surface that catches even the all-jobs-
  unloaded case (where nothing re-renders the digest). Do NOT touch `dream.js`.
- Making `run-job`/catch-up **heal** (reload) entries — heal stays in `sync` only.
- The test-suite guard that makes real scheduler mutation impossible — that is
  **WP-071** (this WP only makes its own tests hermetic via the seams).
- Any change to `schedule.js`, `generators.js`, `manifest.js`, or the load/unload
  argv those modules already produce.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/070-scheduler-load-health-check`; conventional commits;
   PR titled `feat(scheduler): surface configured-but-not-loaded jobs in doctor + digest (WP-070)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
