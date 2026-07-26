'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const manifestLib = require('../core/manifest');
const generators = require('./generators');
const jobsLib = require('./jobs');

const STATUS_FILE = 'scheduler-status.json';

/** status.json path. @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function statusPath(paths) { return path.join(paths.state, STATUS_FILE); }

/** The known scheduler roots for `paths` (LaunchAgents / systemd user dir /
 *  <core>/schedules). @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {string[]} */
function schedulerRoots(paths) {
  return [
    generators.launchAgentsDir(paths.home),
    generators.systemdUserDir(paths.home, process.env),
    path.join(paths.core, 'schedules'),
  ];
}

/** Lexical (no-fs) containment: is `p` inside one of `roots`? Used to gate the
 *  read-only probe without requiring the schedule file to exist on disk (a
 *  registered-but-file-absent entry is still probeable). `platform` selects the
 *  path separator flavor so a win32 entry checked on POSIX resolves correctly.
 *  @param {string} p @param {string[]} roots @param {NodeJS.Platform} platform
 *  @returns {boolean} */
function lexicallyInRoot(p, roots, platform) {
  const P = platform === 'win32' ? path.win32 : path.posix;
  const abs = P.resolve(p);
  return roots.some((root) => {
    const rel = P.relative(P.resolve(root), abs);
    return rel !== '' && !rel.startsWith('..') && !P.isAbsolute(rel);
  });
}

/**
 * Describe one registered scheduler entry: the human name, the scheduler kind,
 * and the READ-ONLY probe argv — all RE-DERIVED from the file's basename
 * identity, NEVER from the untrusted stored `entry.unload` (audit A8, ADR-0027
 * amendment, WP-145 fix-pass F34). An unrecognized basename → null (skipped by
 * callers). No `reload` argv is produced here: the sync-time heal REGENERATES
 * canonical content from validated config (see reloadMissing → schedule.reloadJob),
 * never a reload command reconstructed from the manifest.
 * @param {{path:string}} entry
 * @param {NodeJS.Platform} [platform]  basename-separator flavor (default host)
 * @returns {{name:string, scheduler:'launchd'|'systemd'|'schtasks',
 *            probe:string[]}|null}
 */
function describeEntry(entry, platform = process.platform) {
  const probe = generators.deriveProbeArgv(entry.path, platform);
  if (!probe) return null;
  const base = (platform === 'win32' ? path.win32 : path.posix).basename(entry.path);
  if (base.endsWith('.plist')) {
    return { name: base.replace(/^ai\.wienerdog\./, '').replace(/\.plist$/, ''), scheduler: 'launchd', probe };
  }
  if (base.endsWith('.timer')) {
    return { name: base.replace(/^wienerdog-/, '').replace(/\.timer$/, ''), scheduler: 'systemd', probe };
  }
  if (base.endsWith('.xml')) {
    return { name: base.replace(/^wienerdog-/, '').replace(/\.xml$/, ''), scheduler: 'schtasks', probe };
  }
  return null;
}

/**
 * @typedef {'loaded'|'missing'|'mismatched'|'unverified'|'unknown'} EntryStatus
 */

/**
 * @typedef {{launcher:string, kind:'launchd'|'systemd'|'schtasks',
 *            identityArgv:string[]|null}} IdentityExpectation
 */

/** The statuses a `sync`-time heal re-registers. `loaded` and `unknown` are left
 *  alone: one is healthy, the other claims nothing. */
const HEAL_SET = new Set(['missing', 'mismatched', 'unverified']);

/** The real read-only spawn behind `defaultProbe`. Captures stdout (the identity
 *  query's output IS the answer) instead of the old `stdio:'ignore'`.
 *  @param {string[]} a @returns {{status:number|null, stdout?:string, error?:Error}} */
function defaultRun(a) {
  return spawnSync(a[0], a.slice(1), { encoding: 'utf8' });
}

/**
 * Read-only probe of ONE registered entry. A scheduler entry's health is the
 * IDENTITY of the program the OS will actually execute, not the fact that a
 * record exists: `launchctl print` exits 0 for a hijacked record, which is how a
 * catch-up agent fired 76 times against a deleted launcher while this probe
 * reported `loaded` (WP-scheduler-entry-identity).
 *
 * `expect` carries the identity query and the launcher this install owns; it is
 * MANDATORY — omitting it yields 'unverified', never 'loaded'. There is
 * deliberately NO presence-only mode and no default for `expect`: a probe that
 * cannot say WHAT will run must not claim health.
 * `opts.run` is the TEST-ONLY spawn seam so the identity logic is unit-testable
 * with canned scheduler output and NEVER touches a real scheduler. No production
 * caller passes it, which is why the two neutralizer checks below are gated on it
 * being absent: injecting the read seam IS the neutralization, so no test has to
 * delete WIENERDOG_TEST_NO_REAL_SCHEDULER and the mutation backstop stays armed.
 * Never throws.
 * @param {string[]} argv  the presence-probe argv (generators.deriveProbeArgv)
 * @param {IdentityExpectation|null} [expect]
 * @param {{run?: (argv:string[]) => {status:number|null, stdout?:string, error?:Error}}} [opts]
 * @returns {EntryStatus}
 */
function defaultProbe(argv, expect, opts = {}) {
  const run = typeof opts.run === 'function' ? opts.run : null;
  const RUN = run || defaultRun; // bound ONCE — steps 3 and 7 must use the SAME one
  if (!run && process.env.WIENERDOG_LOADER_NOOP) return 'unknown'; // 1
  if (!run && process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER) return 'unknown'; // 2
  const r = RUN(argv); // 3
  if (r.error || r.status !== 0) return 'missing'; // 4
  if (!expect || !expect.kind || !expect.launcher) return 'unverified'; // 5 — fail CLOSED
  if (expect.identityArgv == null) return 'unknown'; // 6 — kind recognized, query unimplemented
  const r2 = RUN(expect.identityArgv); // 7 — the SAME RUN, never a bare run(…)
  if (r2.error || r2.status !== 0 || typeof r2.stdout !== 'string') return 'unverified';
  const { verdict, exec } = generators.loadedEntryTargets(r2.stdout, expect.kind, expect.launcher); // 8
  if (verdict === 'mismatch') return 'mismatched';
  if (verdict === 'indeterminate') return 'unverified';
  // 8b — a `match` proves only that OUR launcher sits in the launcher position.
  // The program the OS will actually START is `exec`; when it no longer exists
  // (a `brew upgrade node && brew cleanup` deletes the version-pinned execPath
  // the entry was registered with) every fire dies in posix_spawn before a line
  // of Wienerdog code runs. That is a definite failure, so it is `mismatched`
  // (heal + doctor fail), not `loaded` and not `unverified`. existsSync never
  // throws — it returns false on every error, the fail-closed direction.
  if (typeof exec === 'string' && exec !== '' && fs.existsSync(exec)) return 'loaded';
  return 'mismatched';
}

/** Build the identity expectation for one schedule file. null when the basename
 *  is one `deriveIdentityArgv` does not recognize — `defaultProbe` step 5 then
 *  fails closed to 'unverified' rather than claiming health.
 *  @param {import('../core/paths').WienerdogPaths} paths @param {string} schedulePath
 *  @param {NodeJS.Platform} platform @returns {IdentityExpectation|null} */
function identityExpectation(paths, schedulePath, platform) {
  const idn = generators.deriveIdentityArgv(schedulePath, platform);
  if (!idn) return null;
  return { launcher: generators.launcherPath(paths), kind: idn.kind, identityArgv: idn.argv };
}

/**
 * Probe every registered scheduler entry. Read-only. The probe argv is
 * RE-DERIVED from each entry's basename identity (never the stored `unload` —
 * ADR-0027), and every entry is gated behind a scheduler-root containment check,
 * so an out-of-root poisoned entry is never probed. Each entry's IDENTITY
 * expectation is built here (the launcher this install owns + the re-derived
 * identity query) and passed to the probe — the line whose absence reproduced the
 * incident. `opts.probe` is the injected seam (default defaultProbe) and
 * `opts.run` is defaultProbe's read seam, forwarded unchanged.
 * `WIENERDOG_SCHEDULER_PROBE` — a JSON map `{ "<name>": <EntryStatus> }` —
 * overrides by name (subprocess test seam, mirrors WIENERDOG_UPDATE_FETCH_CMD);
 * its values are used verbatim and are not validated. Never throws.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: (argv:string[], expect:IdentityExpectation|null, opts:object)=>EntryStatus,
 *          run?: (argv:string[])=>{status:number|null, stdout?:string, error?:Error},
 *          platform?: NodeJS.Platform}} [opts]
 * @returns {Array<{name:string, scheduler:string, status:EntryStatus}>}
 */
function probeAll(paths, opts = {}) {
  const platform = opts.platform || process.platform;
  const probe = opts.probe || defaultProbe;
  let envMap = null;
  try { envMap = JSON.parse(process.env.WIENERDOG_SCHEDULER_PROBE || 'null'); } catch { envMap = null; }
  let manifest;
  try { manifest = manifestLib.load(paths); } catch { return []; }
  const roots = schedulerRoots(paths);
  const out = [];
  for (const e of manifest.entries || []) {
    if (e.kind !== 'scheduler-entry') continue;
    if (!lexicallyInRoot(e.path, roots, platform)) continue; // out-of-root → no probe
    const d = describeEntry(e, platform);
    if (!d) continue;
    const expect = identityExpectation(paths, e.path, platform);
    const status = envMap && Object.prototype.hasOwnProperty.call(envMap, d.name)
      ? envMap[d.name]
      : probe(d.probe, expect, { run: opts.run });
    out.push({ name: d.name, scheduler: d.scheduler, status });
  }
  return out;
}

/**
 * Refresh state/scheduler-status.json from a live probe. Bounded, NEVER throws.
 * Atomic temp+rename (mirrors update-check.writeState). No-op-safe when there are
 * no scheduler entries.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: Function, run?: Function, platform?: NodeJS.Platform}} [opts]
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

/** Whole-word pluralization helpers for the callout templates. Never per-character
 *  suffixes — a broken safety message is the WP-068 false-reassurance class.
 *  @param {string[]} names @returns {{names:string, one:boolean}} */
function nameList(names) {
  return { names: names.map((n) => `"${n}"`).join(', '), one: names.length === 1 };
}

/**
 * Fixed-template digest callouts from the cache (control-plane text only, no
 * untrusted input — the names are our own `[a-z0-9-]` job names). One callout per
 * non-empty bucket, in the order mismatched (F), unverified (U), missing (M),
 * joined by a BLANK LINE: consecutive `>` lines separated by a single newline are
 * ONE Obsidian blockquote, which would merge three different remediations under
 * one title. '' when all three buckets are empty. Mirrors renderUpdateLine
 * (cache-only, no probe).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @returns {string}
 */
function renderSchedulerStatusLine(paths) {
  const entries = readSchedulerStatus(paths).entries;
  const bucket = (s) => entries.filter((e) => e.status === s).map((e) => e.name);
  const out = [];

  const f = bucket('mismatched');
  if (f.length > 0) {
    const { names, one } = nameList(f);
    out.push(`> [!warning] Wienerdog: the scheduled ${one ? 'job' : 'jobs'} ${names} ` +
      `${one ? 'is' : 'are'} registered in your computer's scheduler, but the program ` +
      `${one ? 'it' : 'they'} would run is either not part of this Wienerdog installation or no longer ` +
      `on this computer, so ${one ? 'it' : 'they'} cannot run. Run 'wienerdog sync' to re-register ` +
      `${one ? 'it' : 'them'} from this installation.`);
  }

  const u = bucket('unverified');
  if (u.length > 0) {
    const { names, one } = nameList(u);
    out.push('> [!warning] Wienerdog: Wienerdog could not read back what your computer\'s scheduler will ' +
      `actually run for the scheduled ${one ? 'job' : 'jobs'} ${names}, so it cannot confirm ` +
      `${one ? 'it is' : 'they are'} still wired to this installation. Run 'wienerdog sync' to re-register ` +
      `${one ? 'it' : 'them'}, then run 'wienerdog doctor'.`);
  }

  const m = bucket('missing');
  if (m.length > 0) {
    const { names, one } = nameList(m);
    out.push(`> [!warning] Wienerdog: the scheduled ${one ? 'job' : 'jobs'} ${names} ${one ? 'is' : 'are'} ` +
      'set up but not currently active in your computer\'s scheduler. Run \'wienerdog sync\' to reactivate ' +
      `${one ? 'it' : 'them'}. (This can happen after some system updates.)`);
  }

  return out.join('\n\n');
}

/**
 * doctor lines: one per registered entry, LIVE read-only probe. 'loaded' → ok,
 * 'missing'/'unverified' → warn (actionable), 'mismatched' → FAIL (the entry
 * cannot work — a foreign launcher, or an execution position that no longer
 * exists), 'unknown' → omitted (no verdict is attempted by design). Read-only.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: Function, run?: Function, platform?: NodeJS.Platform}} [opts]
 * @returns {Array<{status:'ok'|'warn'|'fail', msg:string}>}
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
    } else if (e.status === 'mismatched') {
      out.push({
        status: 'fail',
        msg: `scheduled job '${e.name}' is registered in ${e.scheduler} but the program it would run is not ` +
          'this Wienerdog install\'s, or no longer exists on this computer, so it cannot work — ' +
          'run \'wienerdog sync\' to re-register it from this install',
      });
    } else if (e.status === 'unverified') {
      out.push({
        status: 'warn',
        msg: `scheduled job '${e.name}' is registered in ${e.scheduler} but Wienerdog could not read back ` +
          'the program it runs, so it cannot confirm the entry belongs to this install — ' +
          'run \'wienerdog sync\' to re-register it, then \'wienerdog doctor\' again',
      });
    } // 'unknown' → no line
  }
  return out;
}

/** The canonical (probed) schedule file for a job on `platform`: the launchd
 *  plist, the systemd .timer, or the Windows task XML. Code-derived from the job
 *  name — never read from the manifest. Unsupported platform → null.
 *  @param {import('../core/paths').WienerdogPaths} paths @param {string} name
 *  @param {NodeJS.Platform} platform @returns {string|null} */
function canonicalProbePath(paths, name, platform) {
  if (platform === 'darwin') {
    return path.join(generators.launchAgentsDir(paths.home), `${generators.launchdLabel(name)}.plist`);
  }
  if (platform === 'linux') {
    return path.join(generators.systemdUserDir(paths.home, process.env), `${generators.systemdUnitBase(name)}.timer`);
  }
  if (platform === 'win32') {
    return generators.windowsTaskFile(paths, name);
  }
  return null;
}

/**
 * HEAL: re-register any CONFIGURED job whose OS registration the scheduler has
 * lost. The ONLY mutation in this module — used by `sync`, never by
 * doctor/digest/run-job. Never throws.
 *
 * ADR-0027 amendment + WP-145 fix-pass F34 (R2/R5/R6): the heal
 *   1. enumerates CONFIGURED, code-recognized jobs from validated config
 *      (`jobs.js`) — it NEVER iterates manifest entries to decide what to heal,
 *      so an attacker-planted in-root `ai.wienerdog.evil.plist` (or a symlink) is
 *      never healed, and the stored `entry.unload` is never read into any argv;
 *   2. probes each job's canonical registration with the RE-DERIVED read-only
 *      probe argv (deriveProbeArgv), gated behind the scheduler-root check;
 *   3. for a missing one, delegates to `schedule.reloadJob`, which REGENERATES
 *      the canonical plist/unit/xml from validated config, atomically replaces +
 *      byte-verifies a regular non-symlink in-root file, and registers from that
 *      path (the verify→register reopen race is an accepted A12 residual).
 * The catch-up registration is NOT a configured job, so it is excluded here
 * ENTIRELY [R5/R6] — its repair/teardown is owned solely by `repointSchedules`.
 *
 * The heal set is `{missing, mismatched, unverified}`: a record that exists but
 * runs the wrong program is exactly as broken as an absent one, and on darwin the
 * replacement is bootstrap-first, so a working-but-unverifiable entry is only torn
 * down after launchd itself refuses the bootstrap.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number}, probe?: Function, run?: Function,
 *          platform?: NodeJS.Platform}} [opts]
 * @returns {{reloaded:string[], failed:string[]}}
 */
function reloadMissing(paths, opts = {}) {
  const platform = opts.platform || process.platform;
  const schedule = require('../cli/schedule');
  const loader = opts.loader || schedule.defaultLoader;
  const probe = opts.probe || defaultProbe;
  let envMap = null;
  try { envMap = JSON.parse(process.env.WIENERDOG_SCHEDULER_PROBE || 'null'); } catch { envMap = null; }
  /** @type {string[]} */ const reloaded = [];
  /** @type {string[]} */ const failed = [];
  let jobs;
  let markerAttempted = false;
  try { jobs = jobsLib.listJobs(paths); } catch { return { reloaded, failed }; }
  for (const job of jobs) {
    const canonical = canonicalProbePath(paths, job.name, platform);
    if (!canonical) continue; // unsupported platform → nothing to probe/heal
    const probeArgv = generators.deriveProbeArgv(canonical, platform);
    if (!probeArgv) continue; // unrecognized identity → never healed
    const expect = identityExpectation(paths, canonical, platform);
    const status = envMap && Object.prototype.hasOwnProperty.call(envMap, job.name)
      ? envMap[job.name]
      : probe(probeArgv, expect, { run: opts.run });
    if (!HEAL_SET.has(status)) continue;
    // Pre-destructive durable marker (ADR-0018, 2026-07-25 amendment decision 2),
    // UNCONDITIONAL and once per call, before the FIRST replacement call. The
    // observed status does not predict whether a destructive step is reached: a
    // TRANSIENT presence-query failure grades a still-loaded label `missing`, and
    // the replacement then boots it out. BEST-EFFORT — refreshSchedulerStatus
    // swallows every write error, hence `markerAttempted`, never `markerWritten`.
    if (!markerAttempted) {
      refreshSchedulerStatus(paths, opts);
      markerAttempted = true;
    }
    let ok = false;
    try { ok = schedule.reloadJob(paths, job, loader, platform); } catch { ok = false; }
    if (ok) reloaded.push(job.name);
    else failed.push(job.name);
  }
  return { reloaded, failed };
}

module.exports = {
  STATUS_FILE, statusPath, describeEntry, defaultProbe, probeAll,
  refreshSchedulerStatus, readSchedulerStatus, renderSchedulerStatusLine,
  doctorSchedulerChecks, reloadMissing,
};
