'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const manifestLib = require('../core/manifest');
const jobsLib = require('../scheduler/jobs');
const gen = require('../scheduler/generators');
const { schedulerSpawn } = require('../scheduler/spawn');
const { requireCapability, CAPABILITY } = require('../core/safety-profile');

/**
 * Loader seam: the ONE place that registers/loads entries with the OS scheduler.
 * Tests inject a spy so they never touch real launchd/systemd.
 * @param {string[]} argv  e.g. ['launchctl','bootstrap','gui/501','<plist>']
 * @returns {{status:number}} real impl: spawnSync(argv[0], argv.slice(1)).
 */
function defaultLoader(argv) {
  return schedulerSpawn(argv);
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
 * @param {string|Buffer} content  string (UTF-8) or raw bytes (e.g. UTF-16 LE
 *   Windows task XML); compared and written byte-wise.
 * @param {string[]|null} unload  argv that unregisters the entry, or null.
 * @returns {boolean} true if the file was (re)written (i.e. an OS reload is due).
 */
function ensureEntry(manifest, filePath, content, unload) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let onDiskMatches = false;
  try {
    onDiskMatches = fs.readFileSync(filePath).equals(buf);
  } catch {
    onDiskMatches = false;
  }
  const hasEntry = manifest.entries.some(
    (e) => e.kind === 'scheduler-entry' && e.path === filePath
  );
  if (onDiskMatches && hasEntry) return false;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
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
 * @returns {{loaded:boolean}} loaded=true when nothing needed loading, else the
 *   status===0 of the bootstrap call.
 */
function ensureCatchup(paths, manifest, loader, uid) {
  const logDir = path.join(paths.logs, 'catchup');
  const content = gen.catchupPlist({ node: gen.nodePath(), bin: gen.wienerdogBin(paths), logDir });
  const label = 'ai.wienerdog.catchup';
  const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
  const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];
  if (ensureEntry(manifest, plistPath, content, unload)) {
    return { loaded: loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0 };
  }
  return { loaded: true };
}

/**
 * Ensure the Windows catch-up task XML exists and is registered (once,
 * idempotent). The Task Scheduler analog of `ensureCatchup`: ONLOGON + hourly
 * `run-job --catch-up`, the missed-run mechanism mirroring macOS.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {(argv:string[])=>{status:number}} loader
 * @returns {{loaded:boolean}} loaded=true when nothing needed loading, else the
 *   status===0 of the schtasks /create call.
 */
function ensureWindowsCatchup(paths, manifest, loader) {
  const userId = gen.windowsCurrentUserId();
  const content = gen.windowsTaskXmlBytes(
    gen.windowsCatchupTaskXml({ node: gen.nodePath(), bin: gen.wienerdogBin(paths), userId })
  );
  const xmlPath = gen.windowsTaskFile(paths, 'catchup');
  const taskName = gen.windowsTaskName('catchup'); // '\Wienerdog\catchup'
  const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
  if (ensureEntry(manifest, xmlPath, content, unload)) {
    return { loaded: loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']).status === 0 };
  }
  return { loaded: true };
}

/**
 * Register the per-job OS entry(ies) for the given platform.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{name:string, hour:number, minute:number}} o
 * @param {(argv:string[])=>{status:number}} loader
 * @param {NodeJS.Platform} [platform=process.platform]  injected for testability
 *   (WP-049/051/038 rule: never mock process.platform).
 * @returns {{platform:string, changed:boolean, loaded:boolean}} loaded=true when
 *   every mutation exited 0 (or nothing needed loading); false when a `changed`
 *   registration's primary loader call returned nonzero.
 */
function registerPlatform(paths, manifest, o, loader, platform = process.platform) {
  const node = gen.nodePath();
  const bin = gen.wienerdogBin(paths);

  if (platform === 'darwin') {
    const uid = process.getuid();
    const logDir = path.join(paths.logs, o.name);
    const label = gen.launchdLabel(o.name);
    const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const content = gen.launchdPlist({ ...o, node, bin, logDir });
    const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];
    let loaded = true;
    let changed = ensureEntry(manifest, plistPath, content, unload);
    if (changed) loaded = loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
    // Catch-up entry: login + hourly (macOS StartCalendarInterval misses power-off).
    const cu = ensureCatchup(paths, manifest, loader, uid);
    return { platform: 'launchd', changed, loaded: loaded && cu.loaded };
  }

  if (platform === 'linux') {
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
    let loaded = true;
    if (changed) {
      // Best-effort daemon-reload/linger are not gated; only `enable --now` counts.
      const reload = loader(['systemctl', '--user', 'daemon-reload']);
      // Treat a MISSING result (undefined result OR a nullish status) as a failure too —
      // absence of a result is not success. `!= null` catches both undefined and null, so
      // a `{status:null}` result warns and prints 'no result', never 'null'.
      if (!reload || reload.status == null || reload.status !== 0) {
        const s = reload && reload.status != null ? reload.status : 'no result';
        process.stderr.write(`wienerdog: warning — 'systemctl --user daemon-reload' returned ${s}; the timer may load from stale units. Run 'wienerdog doctor'.\n`);
      }
      loaded = loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;
      // Best-effort: let timers fire when the user is logged out.
      const user = process.env.USER || process.env.LOGNAME || '';
      if (user) {
        const linger = loader(['loginctl', 'enable-linger', user]);
        // Same nullish handling as daemon-reload: a `{status:null}` result warns and
        // prints 'no result', never 'null'.
        if (!linger || linger.status == null || linger.status !== 0) {
          const s = linger && linger.status != null ? linger.status : 'no result';
          process.stderr.write(`wienerdog: warning — 'loginctl enable-linger ${user}' returned ${s}; scheduled jobs may not run while you are logged out.\n`);
        }
      }
    }
    return { platform: 'systemd', changed, loaded };
  }

  if (platform === 'win32') {
    // Owner amendment (2026-07-06, WP-063 review): the job name MUST pass through
    // windowsTaskName — which validates ^[a-z0-9][a-z0-9-]*$ and throws on
    // anything else — BEFORE any XML is rendered or file written. The renderers
    // embed the name raw by design; we never rely on a bad name only failing
    // closed as malformed XML. A hostile name fails here, before any side effect.
    const taskName = gen.windowsTaskName(o.name); // '\Wienerdog\<name>'
    const userId = gen.windowsCurrentUserId();
    const dreamXmlPath = gen.windowsTaskFile(paths, o.name);
    const content = gen.windowsTaskXmlBytes(
      gen.windowsDreamTaskXml({
        name: o.name,
        hour: o.hour,
        minute: o.minute,
        node,
        bin,
        userId,
      })
    );
    const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
    const changed = ensureEntry(manifest, dreamXmlPath, content, unload);
    let loaded = true;
    if (changed) loaded = loader(['schtasks', '/create', '/tn', taskName, '/xml', dreamXmlPath, '/f']).status === 0;
    // Catch-up task (ONLOGON + hourly): the missed-run mechanism, mirroring macOS.
    const cu = ensureWindowsCatchup(paths, manifest, loader);
    return { platform: 'schtasks', changed, loaded: loaded && cu.loaded };
  }

  throw new WienerdogError(
    `scheduling is not supported on ${platform} yet (macOS and systemd Linux only)`
  );
}

/**
 * Re-register every defined job's OS scheduler entry (ADR-0013 migration): after
 * vendoring, this rewrites any entry that still embeds an old bin path so it
 * targets the stable vendored bin. Idempotent — registerPlatform rewrites+reloads
 * only when content changed. A job on a platform that cannot be scheduled
 * (unsupported OS / non-systemd Linux) is skipped with a notice, never a throw.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{loader?: (argv:string[])=>{status:number}}} [opts]
 * @returns {{repointed:number, changed:number, notices:string[]}}
 */
function repointSchedules(paths, manifest, opts = {}) {
  const loader = opts.loader || defaultLoader;
  const jobs = jobsLib.listJobs(paths);
  let repointed = 0;
  let changed = 0;
  /** @type {string[]} */ const notices = [];
  for (const job of jobs) {
    let hm;
    try {
      hm = gen.parseAt(job.at);
    } catch {
      notices.push(`skip "${job.name}": bad time ${job.at}`);
      continue;
    }
    try {
      const res = registerPlatform(paths, manifest, { name: job.name, hour: hm.hour, minute: hm.minute }, loader);
      repointed += 1;
      if (res.changed) changed += 1;
      if (res.changed && !res.loaded) {
        notices.push(`"${job.name}" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.`);
      }
    } catch (err) {
      notices.push(`could not repoint "${job.name}": ${err.message}`);
    }
  }
  return { repointed, changed, notices };
}

/**
 * Silently ensure the nightly dream is scheduled at 03:30 (ADR-0014). Idempotent:
 * if a `dream` job already exists, no-op. Degrades (no throw) on a platform where
 * scheduling is unsupported so vault creation never fails.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{loader?: (argv:string[])=>{status:number}, platform?: NodeJS.Platform}} [opts]
 * @returns {{scheduled:boolean, at?:string, reason?:string, message?:string}}
 */
function ensureDreamSchedule(paths, opts = {}) {
  const loader = opts.loader || defaultLoader;
  if (jobsLib.findJob(paths, 'dream')) return { scheduled: false, reason: 'exists' };
  const at = '03:30';
  const { hour, minute } = gen.parseAt(at);
  const job = { name: 'dream', at, run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);
  const manifest = manifestLib.load(paths);
  let res;
  try {
    res = registerPlatform(paths, manifest, { name: 'dream', hour, minute }, loader, opts.platform || process.platform);
  } catch (err) {
    // Unsupported platform / non-systemd Linux: keep the job definition, but do
    // not fail vault creation. The user can schedule later once supported.
    manifestLib.save(paths, manifest);
    return { scheduled: false, reason: 'unsupported', message: err.message };
  }
  manifestLib.save(paths, manifest);
  // The schedule file is written but the OS scheduler rejected it: surface truthfully.
  if (res.changed && !res.loaded) return { scheduled: false, reason: 'load-failed', at };
  return { scheduled: true, at };
}

/**
 * schedule add <name> --at HH:MM (--skill <s> | --job <builtin>) [--timeout <min>]
 * @param {string[]} argv
 * @param {(argv:string[])=>{status:number}} loader
 * @param {Record<string,string>} [profile] code seam for tests only (see safety-profile.js);
 *   production never passes one, so `--skill` stays frozen.
 */
function add(argv, loader, profile) {
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

  // A0 pre-use freeze (WP-109): skill-based (external-content) routines are disabled
  // until code-owned hermetic profiles exist (audit A1). Fail closed BEFORE writing
  // config.yaml or registering an OS entry. builtin:* (the dream) is unaffected.
  if (hasSkill) requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile);

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
  const { platform, changed, loaded } = registerPlatform(paths, manifest, { name, hour, minute }, loader);
  manifestLib.save(paths, manifest);

  if (changed && !loaded) {
    throw new WienerdogError(
      `wienerdog: registered "${name}"'s schedule file but the OS scheduler (${platform}) rejected it — ` +
      `it is NOT active. Run 'wienerdog doctor' for details.`
    );
  }
  if (!changed) {
    process.stdout.write(`wienerdog: "${name}" already scheduled at ${flags.at} — unchanged.\n`);
    return;
  }
  const suffix = platform === 'launchd' || platform === 'schtasks' ? '; catch-up ensured.' : '.';
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
    gen.windowsTaskFileName(name), // 'wienerdog-<name>.xml'
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
  // WP-145 (ADR-0027): the unregister argv is re-derived from the file's
  // basename identity + platform, never the stored entry.unload; the file
  // removal is bounded to the known scheduler roots.
  const schedulerOpts = {
    platform: process.platform,
    schedulerRoots: [
      gen.launchAgentsDir(paths.home),
      gen.systemdUserDir(paths.home, process.env),
      path.join(paths.core, 'schedules'),
    ],
  };
  for (const entry of matched) {
    manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, removedSet, schedulerOpts);
  }
  manifest.entries = manifest.entries.filter((e) => !matched.includes(e));
  manifestLib.save(paths, manifest);
  jobsLib.removeJob(paths, name);

  if (removed.length === 0) {
    // No schedule FILE was present to delete (already removed, or never registered).
    // But reverseSchedulerEntry runs the DERIVED unregister argv BEFORE checking
    // the file (WP-145: derive, then the root-bound/isFile guards), so a
    // best-effort OS-unregister command may still have RUN even with zero file
    // deletions. Report the count (0) AND the same best-effort qualifier as the
    // non-empty branch; do NOT assert the OS entry was "already gone" — that is
    // not known here.
    process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — deleted 0 schedule files and ran the derived OS-unregister command(s) best-effort (no schedule file was present to delete).\n`);
  } else {
    const fileWord = removed.length === 1 ? 'file' : 'files';
    const absentTail = skipped.length > 0
      ? `; ${skipped.length} file${skipped.length === 1 ? ' was' : 's were'} already absent`
      : '';
    process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — deleted ${removed.length} schedule ${fileWord} and ran the derived OS-unregister command(s) best-effort${absentTail}.\n`);
  }
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
 * @param {{loader?: (argv:string[])=>{status:number}, profile?: Record<string,string>}} [opts]
 * @returns {Promise<void>}
 */
async function run(argv, { loader = defaultLoader, profile } = {}) {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case 'add':
      add(rest, loader, profile);
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

module.exports = { run, defaultLoader, repointSchedules, ensureDreamSchedule, registerPlatform };
