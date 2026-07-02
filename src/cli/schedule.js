'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const manifestLib = require('../core/manifest');
const jobsLib = require('../scheduler/jobs');
const gen = require('../scheduler/generators');

/**
 * Loader seam: the ONE place that registers/loads entries with the OS scheduler.
 * Tests inject a spy so they never touch real launchd/systemd.
 * @param {string[]} argv  e.g. ['launchctl','bootstrap','gui/501','<plist>']
 * @returns {{status:number}} real impl: spawnSync(argv[0], argv.slice(1)).
 */
function defaultLoader(argv) {
  const r = spawnSync(argv[0], argv.slice(1));
  return { status: r.status == null ? 1 : r.status };
}

/** @param {string} p @returns {boolean} */
function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Parse `--flag value` and bare-positional argv. Returns positionals plus a flag
 * map (flags with no following value → true).
 * @param {string[]} argv
 * @param {Set<string>} valueFlags  flags that take a value
 * @returns {{positionals:string[], flags:Record<string,string|boolean>}}
 */
function parseArgs(argv, valueFlags) {
  /** @type {string[]} */ const positionals = [];
  /** @type {Record<string,string|boolean>} */ const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      if (valueFlags.has(key)) {
        flags[key] = argv[++i];
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}

/** @returns {boolean} true when this Linux host runs systemd. */
function hasSystemd() {
  if (fs.existsSync('/run/systemd/system')) return true;
  const r = spawnSync('systemctl', ['--version']);
  return !r.error;
}

/**
 * Write `content` to `filePath` and record a scheduler-entry (once) in the
 * manifest. Idempotent: if the file already exists with identical content AND a
 * manifest entry already tracks it, nothing is written and false is returned.
 * @param {import('../core/manifest').Manifest} manifest
 * @param {string} filePath
 * @param {string} content
 * @param {string[]|null} unload  argv that unregisters the entry, or null.
 * @returns {boolean} true if the file was (re)written (i.e. an OS reload is due).
 */
function ensureEntry(manifest, filePath, content, unload) {
  const identical = isFile(filePath) && fs.readFileSync(filePath, 'utf8') === content;
  const hasEntry = manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === filePath
  );
  if (identical && hasEntry) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  if (!hasEntry) {
    /** @type {import('../core/manifest').ManifestEntry} */
    const entry = { kind: 'scheduler-entry', path: filePath };
    if (unload) entry.unload = unload;
    manifestLib.record(manifest, entry);
  }
  return true;
}

/**
 * Ensure the macOS catch-up plist exists and is registered (once, idempotent).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {(argv:string[])=>{status:number}} loader
 * @param {number} uid
 */
function ensureCatchup(paths, manifest, loader, uid) {
  const logDir = path.join(paths.logs, 'catchup');
  const content = gen.catchupPlist({ node: gen.nodePath(), bin: gen.wienerdogBin(), logDir });
  const label = 'ai.wienerdog.catchup';
  const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
  const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];
  if (ensureEntry(manifest, plistPath, content, unload)) {
    loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
  }
}

/**
 * Register the per-job OS entry(ies) for the current platform.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{name:string, hour:number, minute:number}} o
 * @param {(argv:string[])=>{status:number}} loader
 * @returns {{platform:string, changed:boolean}}
 */
function registerPlatform(paths, manifest, o, loader) {
  const node = gen.nodePath();
  const bin = gen.wienerdogBin();

  if (process.platform === 'darwin') {
    const uid = process.getuid();
    const logDir = path.join(paths.logs, o.name);
    const label = gen.launchdLabel(o.name);
    const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const content = gen.launchdPlist({ ...o, node, bin, logDir });
    const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];
    let changed = ensureEntry(manifest, plistPath, content, unload);
    if (changed) loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
    // Catch-up entry: login + hourly (macOS StartCalendarInterval misses power-off).
    ensureCatchup(paths, manifest, loader, uid);
    return { platform: 'launchd', changed };
  }

  if (process.platform === 'linux') {
    if (!hasSystemd()) {
      throw new WienerdogError(
        'this Linux system does not run systemd — scheduling needs systemd user timers (non-systemd fallback is not yet supported)'
      );
    }
    const unitBase = gen.systemdUnitBase(o.name);
    const dir = gen.systemdUserDir(paths.home, process.env);
    const timerPath = path.join(dir, `${unitBase}.timer`);
    const servicePath = path.join(dir, `${unitBase}.service`);
    const timerText = gen.systemdTimer(o);
    const serviceText = gen.systemdService({ name: o.name, node, bin });
    const timerUnload = ['systemctl', '--user', 'disable', '--now', `${unitBase}.timer`];
    const timerChanged = ensureEntry(manifest, timerPath, timerText, timerUnload);
    const serviceChanged = ensureEntry(manifest, servicePath, serviceText, null);
    const changed = timerChanged || serviceChanged;
    if (changed) {
      loader(['systemctl', '--user', 'daemon-reload']);
      loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]);
      // Best-effort: let timers fire when the user is logged out.
      const user = process.env.USER || process.env.LOGNAME || '';
      if (user) loader(['loginctl', 'enable-linger', user]);
    }
    return { platform: 'systemd', changed };
  }

  throw new WienerdogError(
    `scheduling is not supported on ${process.platform} yet (macOS and systemd Linux only)`
  );
}

/**
 * schedule add <name> --at HH:MM (--skill <s> | --job <builtin>) [--timeout <min>]
 * @param {string[]} argv
 * @param {(argv:string[])=>{status:number}} loader
 */
function add(argv, loader) {
  const { positionals, flags } = parseArgs(
    argv,
    new Set(['at', 'skill', 'job', 'timeout'])
  );
  const name = positionals[0];
  if (!name) throw new WienerdogError('schedule add: missing job <name>');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new WienerdogError(
      `invalid job name ${JSON.stringify(name)} — use lowercase letters, digits and hyphens (must start alphanumeric)`
    );
  }
  if (typeof flags.at !== 'string') throw new WienerdogError('schedule add: --at HH:MM is required');
  const { hour, minute } = gen.parseAt(flags.at);

  const hasSkill = typeof flags.skill === 'string';
  const hasJob = typeof flags.job === 'string';
  if (hasSkill === hasJob) {
    throw new WienerdogError('schedule add: provide exactly one of --skill <name> or --job <builtin>');
  }
  const run = hasSkill ? `skill:${flags.skill}` : `builtin:${flags.job}`;

  let timeoutMinutes;
  if (typeof flags.timeout === 'string') {
    timeoutMinutes = Number(flags.timeout);
    if (!Number.isInteger(timeoutMinutes) || timeoutMinutes <= 0) {
      throw new WienerdogError(`invalid --timeout ${JSON.stringify(flags.timeout)} — expected a positive integer (minutes)`);
    }
  } else {
    timeoutMinutes = run === 'builtin:dream' ? 20 : 15;
  }

  const paths = getPaths();
  const job = { name, at: flags.at, run, timeoutMinutes };
  // Persist the job definition first (config write + manifest hash re-sync),
  // then register OS entries on top of the up-to-date manifest.
  jobsLib.saveJob(paths, job);

  const manifest = manifestLib.load(paths);
  const { platform, changed } = registerPlatform(paths, manifest, { name, hour, minute }, loader);
  manifestLib.save(paths, manifest);

  if (!changed) {
    process.stdout.write(`wienerdog: "${name}" already scheduled at ${flags.at} — unchanged.\n`);
    return;
  }
  const suffix = platform === 'launchd' && process.platform === 'darwin' ? '; catch-up ensured.' : '.';
  process.stdout.write(`wienerdog: scheduled "${name}" (${run}) at ${flags.at} via ${platform}${suffix}\n`);
}

/**
 * schedule remove <name>
 * @param {string[]} argv
 * @param {(argv:string[])=>{status:number}} loader  (unused; reverse runs the stored unload)
 */
function remove(argv, loader) {
  const { positionals } = parseArgs(argv, new Set());
  const name = positionals[0];
  if (!name) throw new WienerdogError('schedule remove: missing job <name>');

  const paths = getPaths();
  const manifest = manifestLib.load(paths);
  const basenames = new Set([
    `${gen.launchdLabel(name)}.plist`,
    `${gen.systemdUnitBase(name)}.timer`,
    `${gen.systemdUnitBase(name)}.service`,
  ]);
  const matched = manifest.entries.filter(
    (e) => e.kind === 'scheduler-entry' && basenames.has(path.basename(e.path))
  );
  const job = jobsLib.findJob(paths, name);

  if (matched.length === 0 && !job) {
    process.stdout.write(`wienerdog: no scheduled job named "${name}".\n`);
    return;
  }

  const removed = [];
  const skipped = [];
  const removedSet = new Set();
  for (const entry of matched) {
    manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, removedSet);
  }
  manifest.entries = manifest.entries.filter((e) => !matched.includes(e));
  manifestLib.save(paths, manifest);
  jobsLib.removeJob(paths, name);

  process.stdout.write(`wienerdog: removed "${name}" (unloaded and deleted its schedule entry).\n`);
}

/**
 * schedule list [--json]
 * @param {string[]} argv
 */
function list(argv) {
  const { flags } = parseArgs(argv, new Set());
  const paths = getPaths();
  const jobs = jobsLib.listJobs(paths);
  const state = jobsLib.readScheduleState(paths);

  const rows = jobs.map((j) => ({
    name: j.name,
    at: j.at,
    run: j.run,
    last_success: (state[j.name] && state[j.name].last_success) || null,
    last_status: (state[j.name] && state[j.name].last_status) || null,
  }));

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return;
  }
  if (rows.length === 0) {
    process.stdout.write('wienerdog: no scheduled jobs.\n');
    return;
  }
  for (const r of rows) {
    const status = r.last_status ? `${r.last_status}${r.last_success ? ` @ ${r.last_success}` : ''}` : 'never run';
    process.stdout.write(`  ${r.name}  ${r.at}  ${r.run}  (${status})\n`);
  }
}

/**
 * wienerdog schedule <add|remove|list> ...
 * @param {string[]} argv
 * @param {{loader?: (argv:string[])=>{status:number}}} [opts]
 * @returns {Promise<void>}
 */
async function run(argv, { loader = defaultLoader } = {}) {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case 'add':
      add(rest, loader);
      return;
    case 'remove':
      remove(rest, loader);
      return;
    case 'list':
      list(rest);
      return;
    default:
      throw new WienerdogError('usage: wienerdog schedule <add|remove|list> ...');
  }
}

module.exports = { run, defaultLoader };
