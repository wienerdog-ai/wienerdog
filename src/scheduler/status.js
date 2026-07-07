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
