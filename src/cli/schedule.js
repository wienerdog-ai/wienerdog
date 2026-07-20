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

/** Absolute path to the out-of-tree launcher the OS entries invoke (WP-157).
 *  @param {import('../core/paths').WienerdogPaths} paths @returns {string} */
function launcherPathFor(paths) {
  return path.join(paths.core, 'launcher', 'launch.js');
}

/**
 * Compute the per-job launcher binding for the OS entry (WP-157): the launcher
 * path, the descriptor path, and the entry-bound expect-digest (the re-derived
 * descriptor digest). The digest is BEST-EFFORT — an install without a vault or
 * a vendored app yet cannot derive it, so it degrades to '' (which the launcher
 * treats as a mismatch, refusing fail-closed at fire time until a real
 * `wienerdog sync` re-binds it). In production `sync` vendors the app before
 * registering, so the digest is real.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {string} name @param {NodeJS.Platform} platform
 * @returns {{launcher:string, descriptor:string, expectDigest:string}}
 */
function jobLaunchBinding(paths, name, platform) {
  const descriptor = require('../scheduler/descriptor');
  const job = jobsLib.findJob(paths, name);
  let expectDigest = '';
  try {
    if (job) expectDigest = descriptor.deriveDescriptorDigest(paths, job, { platform });
  } catch {
    expectDigest = ''; // fail-closed at fire time until sync re-binds a real digest
  }
  return { launcher: launcherPathFor(paths), descriptor: descriptor.descriptorPath(paths, name), expectDigest };
}

/** The catch-up entry's app-tree expect-digest (WP-157), best-effort ('' when
 *  no vendored app yet). @param {import('../core/paths').WienerdogPaths} paths
 *  @returns {string} */
function catchupExpectDigest(paths) {
  try {
    return require('../scheduler/descriptor').appTreeDigest(paths);
  } catch {
    return '';
  }
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
 * Write a regular `file` (WP-157 Windows env-scrub wrapper) idempotently and
 * record a `file` manifest entry once. Unlike ensureEntry (scheduler-entry), the
 * wrapper is plain content the OS entry's <Command> points at.
 * @param {import('../core/manifest').Manifest} manifest
 * @param {string} filePath @param {string|Buffer} content
 */
function ensureFile(manifest, filePath, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  let onDisk = false;
  try {
    onDisk = fs.readFileSync(filePath).equals(buf);
  } catch {
    onDisk = false;
  }
  const hasEntry = manifest.entries.some((e) => e.kind === 'file' && e.path === filePath);
  if (onDisk && hasEntry) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
  if (!hasEntry) manifestLib.record(manifest, { kind: 'file', path: filePath });
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
  const content = gen.catchupPlist({
    node: gen.nodePath(),
    launcher: launcherPathFor(paths),
    expectDigest: catchupExpectDigest(paths),
    home: paths.home,
    logDir,
  });
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
  // WP-157 F8: write the env-scrubbing cmd wrapper (manifest `file` entry) and
  // point the task's <Command> at it — the XML has no per-task env element.
  const wrapperPath = gen.windowsWrapperFile(paths, 'catchup');
  const wrapperContent = gen.windowsLauncherWrapper({
    node: gen.nodePath(),
    launcher: launcherPathFor(paths),
    home: paths.home,
    launchArgs: ['--catch-up', '--expect-digest', catchupExpectDigest(paths)],
  });
  ensureFile(manifest, wrapperPath, wrapperContent);
  const content = gen.windowsTaskXmlBytes(
    gen.windowsCatchupTaskXml({ wrapper: wrapperPath, userId })
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
  const res = registerPlatformEntries(paths, manifest, o, loader, platform);
  // A7 (WP-156, ADR-0028): capture the canonical digest-bound job descriptor —
  // the code-owned record of what this job is AUTHORIZED to run (run action,
  // profile, prompt/skill hash, effective timeout, model, vault root, WP-154
  // pins, app tree digest). Both register paths (`add` and sync's
  // repointSchedules) flow through here, so an explicit `wienerdog sync` is
  // exactly what re-derives and re-binds it. Best-effort by design: a
  // descriptor failure (e.g. no vault yet, app not vendored) degrades to a
  // notice and never blocks registration — WP-157 fails CLOSED at fire time
  // when the descriptor is missing/mismatched, so skipping here is fail-safe.
  // The OS entry argv is NOT touched here (that is WP-157's launcher rebind).
  const job = jobsLib.findJob(paths, o.name);
  if (job) {
    try {
      const descriptor = require('../scheduler/descriptor');
      const d = descriptor.writeDescriptor(paths, job, { platform });
      const exists = manifest.entries.some((e) => e.kind === 'file' && e.path === d.path);
      if (!exists) manifestLib.record(manifest, { kind: 'file', path: d.path });
    } catch (err) {
      process.stderr.write(
        `wienerdog: could not write the job descriptor for "${o.name}" (${err.message}) — ` +
          `run 'wienerdog sync' once the install is complete.\n`
      );
      // A4/F7: surface the failure so `sync` does not report success while a
      // descriptor failed to write (post-WP-157 a missing descriptor = silent
      // nightly fail-closed). The caller (repointSchedules) counts these.
      return { ...res, descriptorFailed: true };
    }
  }
  return res;
}

/** The platform-specific OS-entry registration body behind registerPlatform
 *  (same params/returns) — split out so the descriptor capture wraps every
 *  platform branch uniformly (WP-156). */
function registerPlatformEntries(paths, manifest, o, loader, platform = process.platform) {
  const node = gen.nodePath();
  // WP-157: the OS entry invokes the out-of-tree launcher with the descriptor
  // path + expect-digest, not the app bin directly.
  const b = jobLaunchBinding(paths, o.name, platform);

  if (platform === 'darwin') {
    const uid = process.getuid();
    const logDir = path.join(paths.logs, o.name);
    const label = gen.launchdLabel(o.name);
    const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const content = gen.launchdPlist({ ...o, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home, logDir });
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
    const serviceText = gen.systemdService({ name: o.name, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home });
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
    // WP-157 F8: write the env-scrubbing cmd wrapper (manifest `file` entry) and
    // point the task's <Command> at it — the XML has no per-task env element, so
    // this is the only fully-controlled place to clear NODE_OPTIONS/NODE_PATH and
    // bind HOME before node runs.
    const wrapperPath = gen.windowsWrapperFile(paths, o.name);
    const wrapperContent = gen.windowsLauncherWrapper({
      node,
      launcher: b.launcher,
      home: paths.home,
      launchArgs: [o.name, '--descriptor', b.descriptor, '--expect-digest', b.expectDigest],
    });
    ensureFile(manifest, wrapperPath, wrapperContent);
    const content = gen.windowsTaskXmlBytes(
      gen.windowsDreamTaskXml({
        name: o.name,
        hour: o.hour,
        minute: o.minute,
        wrapper: wrapperPath,
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
 * @returns {{repointed:number, changed:number, descriptorFailures:number, notices:string[]}}
 */
function repointSchedules(paths, manifest, opts = {}) {
  const loader = opts.loader || defaultLoader;
  const jobs = jobsLib.listJobs(paths);
  let repointed = 0;
  let changed = 0;
  let descriptorFailures = 0;
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
      if (res.descriptorFailed) descriptorFailures += 1;
      if (res.changed && !res.loaded) {
        notices.push(`"${job.name}" schedule file written but the OS scheduler did not accept it — run 'wienerdog doctor'.`);
      }
    } catch (err) {
      notices.push(`could not repoint "${job.name}": ${err.message}`);
    }
  }
  return { repointed, changed, descriptorFailures, notices };
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
