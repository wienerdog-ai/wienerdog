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

/**
 * Compute the base64url per-job digest MAP bound into the catch-up entry
 * (WP-catchup-per-job-authorization — macOS + Windows). `{ <jobName>: deriveDescriptorDigest }` over
 * EVERY configured job, from freshly-validated descriptors derived in THIS attended
 * run (never a retained source file or stale map). A job whose descriptor cannot be
 * derived is OMITTED — it is then treated as unauthorized (fail-closed ADD alert) at
 * catch-up rather than run without a verifiable anchor. The result is one opaque
 * token the catch-up runner decodes + union-authorizes against.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {NodeJS.Platform} platform
 * @returns {string} base64url(canonical JSON); base64url('{}') when no jobs derive
 */
function catchupJobDigests(paths, platform) {
  const descriptor = require('../scheduler/descriptor');
  /** @type {Record<string,string>} */ const map = {};
  for (const job of jobsLib.listJobs(paths)) {
    try {
      map[job.name] = descriptor.deriveDescriptorDigest(paths, job, { platform });
    } catch {
      /* omit → fail-closed (ADD alert) at catch-up */
    }
  }
  return gen.encodeJobDigests(map);
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
 * Read a LOADED Windows scheduled task back and decide whether its bound
 * Command/Arguments MATCH the canonical values (A7 hardening 2, ADR-0028). The
 * verified-registration postcondition rests on this: idempotency is keyed off the
 * LOADED task (the trust anchor stored in the Task Scheduler DB), NEVER the source
 * XML file alone — a scoped schedule-file writer cannot change the loaded task
 * without registration privilege, but CAN leave a stale mutable-wrapper task
 * loaded while the canonical file on disk matches. Returns true ONLY when the
 * loaded task verifiably equals canonical; any other state (task missing, query
 * failed, unreadable/UTF-16 output we cannot parse, or a real mismatch) ⇒ false,
 * so the caller force-registers (fail-safe — never trust an unverifiable state).
 * @param {(argv:string[])=>{status:number, stdout?:string}} loader
 * @param {string} taskName  '\Wienerdog\<name>'
 * @param {string} expectCommand  canonical <Command> (unescaped) — cmd.exe path
 * @param {string} expectArgline  canonical <Arguments> (unescaped)
 * @returns {boolean}
 */
function windowsLoadedTaskMatches(loader, taskName, expectCommand, expectArgline) {
  let r;
  try {
    r = loader(['schtasks', '/query', '/tn', taskName, '/xml']);
  } catch {
    return false;
  }
  if (!r || r.status !== 0 || typeof r.stdout !== 'string' || r.stdout === '') return false;
  const exec = gen.parseWindowsTaskExec(r.stdout);
  if (!exec) return false;
  return exec.command === expectCommand && exec.arguments === expectArgline;
}

/**
 * Register a Windows scheduled task as a VERIFIED postcondition, not fire-and-
 * forget (A7 hardening 2, ADR-0028). When the canonical XML bytes CHANGED, always
 * `/create /f`. When they did NOT change, do NOT skip on the source-file match
 * alone: VERIFY the LOADED task's Command/Arguments equal canonical and skip ONLY
 * on a verified match; otherwise (a stale legacy-wrapper task still loaded, a
 * `--job-digests`-stripped catch-up task, a prior `/create` that failed while an
 * old task stayed loaded) force-replace with `/create /f`. A subsequent sync that
 * still cannot verify a match re-issues `/create /f` again — the retry is the
 * next sync, so a stale loaded task is never silently left in place.
 * @param {(argv:string[])=>{status:number, stdout?:string}} loader
 * @param {string} taskName  '\Wienerdog\<name>'
 * @param {string} xmlPath  the canonical on-disk task XML
 * @param {{command:string, argline:string, changed:boolean}} o
 * @returns {boolean} true when the task is registered (the `/create` exited 0, or
 *   a verified-match skip).
 */
function ensureWindowsTaskRegistered(loader, taskName, xmlPath, o) {
  if (!o.changed && windowsLoadedTaskMatches(loader, taskName, o.command, o.argline)) {
    return true; // loaded task verifiably equals canonical → idempotent skip
  }
  return loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']).status === 0;
}

/**
 * Migration cleanup (A7 hardening 2, ADR-0028): remove any legacy Windows
 * scheduler WRAPPER file (`wienerdog-*.cmd` / `*.ps1` under `<core>/schedules`)
 * AND its manifest `file` entry. The inline-`<Arguments>` switch made such a
 * wrapper dead code, and a wrapper is a REOPENED mutable file at the scoped
 * schedule-write surface (it carried the env scrub + `--descriptor`/`--expect-digest`
 * /`--job-digests`), so leaving it is a live arbitrary-execution surface. Runs on
 * every Windows (re)register. Best-effort; returns whether anything was removed.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @returns {boolean}
 */
function sweepLegacyWindowsWrappers(paths, manifest) {
  const dir = gen.windowsTasksDir(paths);
  const isWrapper = (p) =>
    /^wienerdog-[a-z0-9][a-z0-9-]*\.(cmd|ps1)$/i.test(path.basename(p)) &&
    path.resolve(path.dirname(p)) === path.resolve(dir);
  let removed = false;
  const wrapperEntries = manifest.entries.filter((e) => e.kind === 'file' && isWrapper(e.path));
  if (wrapperEntries.length > 0) {
    manifest.entries = manifest.entries.filter((e) => !wrapperEntries.includes(e));
    removed = true;
  }
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (isWrapper(p)) {
        try {
          fs.rmSync(p, { force: true });
          removed = true;
        } catch {
          /* best-effort */
        }
      }
    }
  } catch {
    /* schedules dir may not exist yet */
  }
  return removed;
}

/**
 * Ensure the macOS catch-up plist exists and is registered (once, idempotent).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {(argv:string[])=>{status:number}} loader
 * @param {number} uid
 * @param {string} [jobDigests]  base64url per-job digest map (WP-catchup-per-job-authorization) bound
 *   into the entry argv; recomputed on every mint so the loaded entry always
 *   carries the authorized set for the current jobs.
 * @returns {{loaded:boolean}} loaded=true when nothing needed loading, else the
 *   status===0 of the bootstrap call.
 */
function ensureCatchup(paths, manifest, loader, uid, jobDigests) {
  const logDir = path.join(paths.logs, 'catchup');
  const content = gen.catchupPlist({
    node: gen.nodePath(),
    launcher: launcherPathFor(paths),
    expectDigest: catchupExpectDigest(paths),
    jobDigests,
    home: paths.home,
    core: paths.core,
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
 * @param {string} [jobDigests]  base64url per-job digest map (WP-catchup-per-job-authorization) bound
 *   into the wrapper's launch argv as `--job-digests <b64>`.
 * @returns {{loaded:boolean}} loaded=true when nothing needed loading, else the
 *   status===0 of the schtasks /create call.
 */
function ensureWindowsCatchup(paths, manifest, loader, jobDigests) {
  const userId = gen.windowsCurrentUserId();
  // A7 hardening pass (ADR-0028 R16): the catch-up authorization command — the env
  // scrub/bind AND node+launcher with the app-tree expect-digest + the per-job
  // digest MAP — is bound into the REGISTERED task's <Arguments> (cmd.exe as
  // <Command>), not a reopened wrapper file. Stripping/editing --job-digests then
  // needs registration privilege (schtasks /create), closing the legacy bypass.
  const launchArgs = ['--catch-up', '--expect-digest', catchupExpectDigest(paths)];
  if (typeof jobDigests === 'string' && jobDigests !== '') launchArgs.push('--job-digests', jobDigests);
  const argline = gen.windowsCmdArguments({
    node: gen.nodePath(),
    launcher: launcherPathFor(paths),
    home: paths.home,
    core: paths.core,
    launchArgs,
  });
  const content = gen.windowsTaskXmlBytes(
    gen.windowsCatchupTaskXml({ command: gen.windowsCmdExePath(), argline, userId })
  );
  const xmlPath = gen.windowsTaskFile(paths, 'catchup');
  const taskName = gen.windowsTaskName('catchup'); // '\Wienerdog\catchup'
  const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
  // A7 hardening 2 (ADR-0028): register as a VERIFIED postcondition. Never skip
  // /create on a source-XML match alone — a stale loaded catch-up task with the
  // `--job-digests` map stripped would otherwise survive. Verify the loaded task's
  // Command/Arguments equal canonical; force /create /f on any mismatch.
  const changed = ensureEntry(manifest, xmlPath, content, unload);
  return {
    loaded: ensureWindowsTaskRegistered(loader, taskName, xmlPath, {
      command: gen.windowsCmdExePath(),
      argline,
      changed,
    }),
  };
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
    const content = gen.launchdPlist({ ...o, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home, core: paths.core, logDir });
    const unload = ['launchctl', 'bootout', `gui/${uid}/${label}`];
    let loaded = true;
    let changed = ensureEntry(manifest, plistPath, content, unload);
    if (changed) loaded = loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
    // Catch-up entry: login + hourly (macOS StartCalendarInterval misses power-off).
    // MINT the per-job digest map from freshly-derived descriptors (WP-catchup-per-job-authorization) —
    // this attended register path is one of the four authorized mint callers.
    const cu = ensureCatchup(paths, manifest, loader, uid, catchupJobDigests(paths, platform));
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
    const serviceText = gen.systemdService({ name: o.name, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home, core: paths.core });
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
    // A7 hardening pass (ADR-0028 R16): the COMPLETE authorization command — the
    // env scrub/bind (WIENERDOG_HOME, HOME, NODE_OPTIONS, …) AND node+launcher with
    // the bound descriptor/expect-digest — is bound into the REGISTERED task's
    // <Arguments> (cmd.exe as <Command>), stored in the Task Scheduler DB at
    // /create. It is NOT a reopened wrapper file a scoped config-writer could edit
    // without registration privilege.
    const argline = gen.windowsCmdArguments({
      node,
      launcher: b.launcher,
      home: paths.home,
      core: paths.core,
      launchArgs: [o.name, '--descriptor', b.descriptor, '--expect-digest', b.expectDigest],
    });
    const content = gen.windowsTaskXmlBytes(
      gen.windowsDreamTaskXml({
        name: o.name,
        hour: o.hour,
        minute: o.minute,
        command: gen.windowsCmdExePath(),
        argline,
        userId,
      })
    );
    const unload = ['schtasks', '/delete', '/tn', taskName, '/f'];
    const changed = ensureEntry(manifest, dreamXmlPath, content, unload);
    // A7 hardening 2 (ADR-0028): remove any dead legacy .cmd/.ps1 wrapper (file +
    // manifest entry) — the inline-<Arguments> switch left them a live mutable
    // execution surface.
    sweepLegacyWindowsWrappers(paths, manifest);
    // Verified-registration postcondition (A7 hardening 2): never skip /create on a
    // source-XML match alone. When unchanged, verify the LOADED task equals canonical
    // and force /create /f on any mismatch (a stale legacy-wrapper task, a failed
    // prior /create) — the loaded task is the trust anchor, not the source file.
    const loaded = ensureWindowsTaskRegistered(loader, taskName, dreamXmlPath, {
      command: gen.windowsCmdExePath(),
      argline,
      changed,
    });
    // Catch-up task (ONLOGON + hourly): the missed-run mechanism, mirroring macOS.
    // MINT the per-job digest map from freshly-derived descriptors (WP-catchup-per-job-authorization).
    const cu = ensureWindowsCatchup(paths, manifest, loader, catchupJobDigests(paths, platform));
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
 * WP-catchup-per-job-authorization [R6]: `repointSchedules` is the SOLE catch-up REPAIR + TEARDOWN
 * owner. After repointing per-job entries it (a) tears the catch-up entry + map
 * down cleanly when no jobs remain, or (b) repairs a LOADED catch-up registration
 * the OS silently dropped (file/manifest can be intact) by regenerating the
 * canonical entry with the correct bound base64url map and forcing a reload. The
 * generic `reloadMissing` heal never touches the catch-up entry.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{loader?: (argv:string[])=>{status:number}, platform?: NodeJS.Platform,
 *          probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {{repointed:number, changed:number, descriptorFailures:number, notices:string[]}}
 */
function repointSchedules(paths, manifest, opts = {}) {
  const loader = opts.loader || defaultLoader;
  const platform = opts.platform || process.platform;
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
      const res = registerPlatform(paths, manifest, { name: job.name, hour: hm.hour, minute: hm.minute }, loader, platform);
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
  try {
    const cu = repairCatchup(paths, manifest, { loader, platform, probe: opts.probe });
    if (cu.notice) notices.push(cu.notice);
  } catch {
    /* catch-up repair/teardown is best-effort — never fails a sync */
  }
  return { repointed, changed, descriptorFailures, notices };
}

/**
 * WP-catchup-per-job-authorization [R6/R8]: the catch-up REPAIR + TEARDOWN body owned solely by
 * `repointSchedules`. macOS (catchupPlist) + Windows (schtasks) only — Linux has no
 * separate catch-up registration (its per-job `.timer Persistent=true` replays the
 * already-descriptor-authorized per-job `.service`), so this is a no-op there.
 *   - NO jobs remain → tear the catch-up entry + map down cleanly (gen.teardownCatchup).
 *   - jobs remain → the per-job register loop already re-minted the map; if the LOADED
 *     registration is missing (a system update can drop it while the file stays),
 *     regenerate the canonical entry with the current bound map and force a reload.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/manifest').Manifest} manifest
 * @param {{loader?: (argv:string[])=>{status:number}, platform?: NodeJS.Platform,
 *          probe?: (argv:string[])=>('loaded'|'missing'|'unknown')}} [opts]
 * @returns {{notice?:string}}
 */
function repairCatchup(paths, manifest, opts = {}) {
  const platform = opts.platform || process.platform;
  if (platform !== 'darwin' && platform !== 'win32') return {}; // Linux: no catch-up map
  const loader = opts.loader || defaultLoader;
  const jobs = jobsLib.listJobs(paths);

  if (jobs.length === 0) {
    const t = gen.teardownCatchup(paths, manifest, { loader, platform });
    return t.removed ? { notice: 'catch-up entry torn down — no scheduled jobs remain.' } : {};
  }

  const jobDigests = catchupJobDigests(paths, platform);
  const roots = schedulerRootsFor(paths);
  const probe = opts.probe || require('../scheduler/status').defaultProbe;

  if (platform === 'darwin') {
    const uid = process.getuid();
    const plistPath = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');
    const probeArgv = gen.deriveProbeArgv(plistPath, platform);
    if (!probeArgv || probe(probeArgv) !== 'missing') return {};
    const content = gen.catchupPlist({
      node: gen.nodePath(),
      launcher: launcherPathFor(paths),
      expectDigest: catchupExpectDigest(paths),
      jobDigests,
      home: paths.home,
      core: paths.core,
      logDir: path.join(paths.logs, 'catchup'),
    });
    if (!writeCanonicalSchedule(plistPath, content) || !manifestLib.withinSchedulerRoot(plistPath, roots)) return {};
    const loaded = loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
    return loaded ? { notice: 'restored the missing catch-up registration.' } : { notice: "catch-up entry rewritten but the OS scheduler did not accept it — run 'wienerdog doctor'." };
  }

  // win32
  const userId = gen.windowsCurrentUserId();
  const xmlPath = gen.windowsTaskFile(paths, 'catchup');
  const probeArgv = gen.deriveProbeArgv(xmlPath, platform);
  if (!probeArgv || probe(probeArgv) !== 'missing') return {};
  const launchArgs = ['--catch-up', '--expect-digest', catchupExpectDigest(paths)];
  if (jobDigests) launchArgs.push('--job-digests', jobDigests);
  const argline = gen.windowsCmdArguments({
    node: gen.nodePath(),
    launcher: launcherPathFor(paths),
    home: paths.home,
    core: paths.core,
    launchArgs,
  });
  const content = gen.windowsTaskXmlBytes(gen.windowsCatchupTaskXml({ command: gen.windowsCmdExePath(), argline, userId }));
  if (!writeCanonicalSchedule(xmlPath, content) || !manifestLib.withinSchedulerRoot(xmlPath, roots)) return {};
  const loaded = loader(['schtasks', '/create', '/tn', gen.windowsTaskName('catchup'), '/xml', xmlPath, '/f']).status === 0;
  return loaded ? { notice: 'restored the missing catch-up registration.' } : { notice: "catch-up task rewritten but the OS scheduler did not accept it — run 'wienerdog doctor'." };
}

/** The known scheduler roots for `paths` (LaunchAgents / systemd user dir /
 *  <core>/schedules). Mirrors the set reverse() bounds scheduler deletes to.
 *  @param {import('../core/paths').WienerdogPaths} paths @returns {string[]} */
function schedulerRootsFor(paths) {
  return [
    gen.launchAgentsDir(paths.home),
    gen.systemdUserDir(paths.home, process.env),
    path.join(paths.core, 'schedules'),
  ];
}

/**
 * Write REGENERATED canonical scheduler content to a CODE-DERIVED path for the
 * heal path (WP-145 fix-pass R2:F34). The path itself is trusted (built from a
 * validated job name under our own dirs), but the FILE at it is UNTRUSTED: refuse
 * to write onto anything that is not already a regular non-symlink file (a
 * planted symlink / directory / special → fail closed), so the heal can never be
 * tricked into registering an attacker's artifact. A truly-absent file (ENOENT)
 * is written fresh. Atomic temp+rename, then byte-verify the on-disk bytes.
 * @param {string} filePath @param {string|Buffer} content @returns {boolean}
 *   true when the canonical file now holds exactly `content`.
 */
function writeCanonicalSchedule(filePath, content) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  try {
    if (!fs.lstatSync(filePath).isFile()) return false; // symlink / dir / special → refuse
  } catch (err) {
    if (err.code !== 'ENOENT') return false;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.heal.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
  return fs.readFileSync(filePath).equals(buf); // byte-verify
}

/**
 * HEAL one CONFIGURED job's OS registration by REGENERATING its canonical
 * scheduler file from validated config and (re)registering it — never trusting a
 * found-on-disk artifact (WP-145 fix-pass R2:F34, ADR-0027 amendment). The OS can
 * silently drop a registration (a system update) while the file stays on disk;
 * `repointSchedules` no-ops on identical content, so this forces the reload.
 *
 * Security: the canonical path is code-derived from a validated job name;
 * `writeCanonicalSchedule` refuses to replace anything but a regular non-symlink
 * file (planted symlink/dir → fail closed), atomically replaces it and
 * byte-verifies; the path is re-checked in-root (realpath containment) IMMEDIATELY
 * before the register spawn. A STATIC planted file is thereby defeated; the
 * verify→register reopen race (a concurrent writer at heal time) is an accepted
 * A12 residual (see ADR-0028 / WP-159). This heals ONLY the named per-job entry;
 * the catch-up registration is owned by `repointSchedules` and is never touched.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, at:string}} job  a validated config job
 * @param {(argv:string[])=>{status:number}} loader
 * @param {NodeJS.Platform} platform  injected (never mock process.platform)
 * @returns {boolean} true when the OS accepted the reload.
 */
function reloadJob(paths, job, loader, platform) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(job.name)) return false;
  const { hour, minute } = gen.parseAt(job.at); // throws on a bad time → caller treats as failed
  const node = gen.nodePath();
  const b = jobLaunchBinding(paths, job.name, platform);
  const roots = schedulerRootsFor(paths);

  if (platform === 'darwin') {
    const uid = process.getuid();
    const logDir = path.join(paths.logs, job.name);
    const label = gen.launchdLabel(job.name);
    const plistPath = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const content = gen.launchdPlist({ name: job.name, hour, minute, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home, core: paths.core, logDir });
    if (!writeCanonicalSchedule(plistPath, content)) return false;
    if (!manifestLib.withinSchedulerRoot(plistPath, roots)) return false;
    return loader(['launchctl', 'bootstrap', `gui/${uid}`, plistPath]).status === 0;
  }

  if (platform === 'linux') {
    const unitBase = gen.systemdUnitBase(job.name);
    const dir = gen.systemdUserDir(paths.home, process.env);
    const timerPath = path.join(dir, `${unitBase}.timer`);
    const servicePath = path.join(dir, `${unitBase}.service`);
    const timerText = gen.systemdTimer({ name: job.name, hour, minute });
    const serviceText = gen.systemdService({ name: job.name, node, launcher: b.launcher, descriptor: b.descriptor, expectDigest: b.expectDigest, home: paths.home, core: paths.core });
    if (!writeCanonicalSchedule(servicePath, serviceText)) return false;
    if (!writeCanonicalSchedule(timerPath, timerText)) return false;
    if (!manifestLib.withinSchedulerRoot(timerPath, roots)) return false;
    loader(['systemctl', '--user', 'daemon-reload']); // best-effort
    return loader(['systemctl', '--user', 'enable', '--now', `${unitBase}.timer`]).status === 0;
  }

  if (platform === 'win32') {
    const taskName = gen.windowsTaskName(job.name); // validates + throws on a hostile name
    const userId = gen.windowsCurrentUserId();
    const argline = gen.windowsCmdArguments({ node, launcher: b.launcher, home: paths.home, core: paths.core, launchArgs: [job.name, '--descriptor', b.descriptor, '--expect-digest', b.expectDigest] });
    const xmlPath = gen.windowsTaskFile(paths, job.name);
    const content = gen.windowsTaskXmlBytes(gen.windowsDreamTaskXml({ name: job.name, hour, minute, command: gen.windowsCmdExePath(), argline, userId }));
    if (!writeCanonicalSchedule(xmlPath, content)) return false;
    if (!manifestLib.withinSchedulerRoot(xmlPath, roots)) return false;
    return loader(['schtasks', '/create', '/tn', taskName, '/xml', xmlPath, '/f']).status === 0;
  }

  return false;
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
  // F35 (WP-145 fix-pass): `schedule remove` is a 2nd production caller of the
  // shared reverser — teardown is DELEGATED to reverseSchedulerEntry with the
  // SAME scheduler-root set uninstall uses (via the shared schedulerRootsFor),
  // so containment + validate-before-spawn (F33) can never diverge from
  // uninstall. The unregister argv is re-derived from the file's basename
  // identity, never the stored entry.unload (ADR-0027).
  const schedulerOpts = { platform: process.platform, schedulerRoots: schedulerRootsFor(paths) };
  for (const entry of matched) {
    manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, removedSet, schedulerOpts);
  }
  manifest.entries = manifest.entries.filter((e) => !matched.includes(e));
  jobsLib.removeJob(paths, name);
  // WP-catchup-per-job-authorization [R8]: `schedule remove` DELEGATES catch-up teardown to
  // `repointSchedules` (the sole teardown owner) rather than tearing it down
  // directly — removing the FINAL job tears the catch-up entry + map down cleanly;
  // a non-final removal re-mints the map without the removed job. Best-effort: the
  // job and its per-job entries are already gone regardless.
  try {
    repointSchedules(paths, manifest, { loader });
  } catch {
    /* catch-up teardown/rebind is best-effort */
  }
  manifestLib.save(paths, manifest);

  if (removed.length === 0) {
    // Validate-before-spawn (F33): reverseSchedulerEntry now unregisters ONLY a
    // recognized in-root schedule file that is present — so zero deletions means
    // no derived OS-unregister command ran either (nothing was there to act on).
    process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — no schedule file was present to unregister or delete (already absent).\n`);
  } else {
    const fileWord = removed.length === 1 ? 'file' : 'files';
    process.stdout.write(`wienerdog: removed "${name}" from Wienerdog's schedule — unregistered and deleted ${removed.length} schedule ${fileWord} best-effort.\n`);
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

module.exports = { run, defaultLoader, repointSchedules, ensureDreamSchedule, registerPlatform, reloadJob };
