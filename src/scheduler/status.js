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
 * Probe every registered scheduler entry. Read-only. The probe argv is
 * RE-DERIVED from each entry's basename identity (never the stored `unload` —
 * ADR-0027), and every entry is gated behind a scheduler-root containment check,
 * so an out-of-root poisoned entry is never probed. `opts.probe` is the injected
 * seam (default defaultProbe). `WIENERDOG_SCHEDULER_PROBE` — a JSON map
 * `{ "<name>": "loaded"|"missing"|"unknown" }` — overrides by name (subprocess
 * test seam, mirrors WIENERDOG_UPDATE_FETCH_CMD). Never throws.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{probe?: (argv:string[])=>('loaded'|'missing'|'unknown'),
 *          platform?: NodeJS.Platform}} [opts]
 * @returns {Array<{name:string, scheduler:string, status:'loaded'|'missing'|'unknown'}>}
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
  // Select whole words for the noun/verb/pronoun so pluralization can't drift on
  // spacing (a broken safety message is the WP-068 false-reassurance failure class).
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
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number},
 *          probe?: (argv:string[])=>('loaded'|'missing'|'unknown'),
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
  try { jobs = jobsLib.listJobs(paths); } catch { return { reloaded, failed }; }
  for (const job of jobs) {
    const canonical = canonicalProbePath(paths, job.name, platform);
    if (!canonical) continue; // unsupported platform → nothing to probe/heal
    const probeArgv = generators.deriveProbeArgv(canonical, platform);
    if (!probeArgv) continue; // unrecognized identity → never healed
    const status = envMap && Object.prototype.hasOwnProperty.call(envMap, job.name)
      ? envMap[job.name]
      : probe(probeArgv);
    if (status !== 'missing') continue;
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
