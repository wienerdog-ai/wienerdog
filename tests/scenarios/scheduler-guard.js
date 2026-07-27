'use strict';

// Shared containment kit for the LIVE scenario harnesses (WP-161). The two
// harnesses (`tests/scenarios/run-scenarios.js`,
// `tests/scenarios/negative/run-negative.js`) run the real `wienerdog init
// --fresh-vault --yes` as a subprocess, which auto-schedules the nightly
// dream. Because those harnesses deliberately leave `HOME` pointed at the
// maintainer's REAL home (so the separate `claude -p` dream subprocess can
// reach the subscription/Keychain OAuth — ADR-0009), the scheduler code
// resolves the real launchd/systemd dirs and would register a REAL agent
// pointing at the harness's temp core — an orphan once that temp core is
// deleted. This module sandboxes only the `init` subprocess's env
// (`buildInitEnv`) and installs three fail-closed tripwires: a PATH-shim that
// captures + fails any real loader invocation (`makeLoaderShimDir` +
// `assertNoLoaderInvoked`); a report-only observer that scans the real
// scheduler dir(s) for anything this run actually leaked
// (`assertNoRealSchedulerLeak`); and a LOADED-RECORD observer that asks the OS
// what every Wienerdog-named registration will actually execute
// (`assertNoLoadedSchedulerLeak`).
//
// Zero deps, plain Node >= 18: node:fs/os/path plus node:child_process. The
// `child_process` import exists for the loaded-record observer, which has to
// ask the OS itself: a harness run that registers under an already-used
// launchd label OVERWRITES the loaded record for that per-user-global label
// and leaves the `.plist` file on disk untouched and perfectly correct, so no
// amount of file reading can see it. That observer is strictly read-only
// (`/bin/launchctl print` and nothing else) and reaches the OS through an
// injectable `opts.run` seam, so no unit test ever spawns a real loader. The
// shims themselves are still `sh` files written to disk, spawned only by the
// harnesses (via the real `init` subprocess) or by the unit test that
// exercises them.

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/** The absolute launchd client path. ABSOLUTE BY CONTRACT: the harness prepends
 *  a fail-closed loader-shim dir to the sandboxed init env's PATH, and a
 *  bare-name lookup could resolve to that shim — the guard would then observe
 *  its own containment machinery instead of the OS and report a false clean. */
const LAUNCHCTL_PATH = '/bin/launchctl';

/** Loaded-record label pattern. Deliberately looser than the product's
 *  `[a-z0-9-]` job-name charset: the guard must be able to SEE a foreign-shaped
 *  Wienerdog label, not only the ones we would have written. Fully anchored, no
 *  `m` flag. */
const LOADED_LABEL_PATTERN = /^ai\.wienerdog\.[a-z0-9.-]+$/;

/** The four bare-name loader commands the product's scheduler chokepoint
 *  (`src/scheduler/spawn.js`'s `schedulerSpawn`) may invoke. */
const LOADER_COMMANDS = ['launchctl', 'systemctl', 'loginctl', 'schtasks'];

/** Fully-anchored "is this a Wienerdog schedule entry" basename patterns,
 *  mirroring the basenames the product's generators write
 *  (`src/scheduler/generators.js` launchdLabel / systemdUnitBase). */
const DARWIN_ENTRY_PATTERN = /^ai\.wienerdog\.[a-z0-9.-]+\.plist$/;
const LINUX_ENTRY_PATTERN = /^wienerdog-[a-z0-9.-]+\.(timer|service)$/;

/**
 * Create a PATH-shim directory containing an executable POSIX `sh` stand-in
 * for every real loader command (Finding 3 — the fail-closed tripwire). A
 * pure `--version` probe passes through silently (needed for the Linux
 * systemd presence probe in `src/cli/schedule.js`); any other invocation is
 * recorded to the returned `logPath` and exits non-zero — captured AND
 * failed before it can register anything real. POSIX-only (darwin/linux):
 * on Windows this writes no shim files (no `schtasks` interceptor exists —
 * see the WP-161 spec's "Accepted residual (Windows)").
 * @param {string} root  the harness's temp root — the shim dir + log live under it
 * @returns {{binDir:string, logPath:string}}
 */
function makeLoaderShimDir(root) {
  const binDir = path.join(root, '.loader-shims');
  const logPath = path.join(binDir, 'shim.log');
  // Fail-closed: a binDir containing the PATH delimiter (e.g. a TMPDIR with
  // ':' on POSIX) would SPLIT the PATH entry buildInitEnv prepends, so the
  // shims would silently stop winning resolution. A guard that cannot
  // guarantee interception must refuse to run, not degrade.
  if (binDir.includes(path.delimiter)) {
    throw new Error(
      `scheduler-guard: refusing to build the loader-shim dir — ${binDir} contains the PATH ` +
        `delimiter (${JSON.stringify(path.delimiter)}), so the PATH-shim tripwire could not ` +
        'guarantee interception. Use a temp root without that character.'
    );
  }
  fs.mkdirSync(binDir, { recursive: true });
  // Pre-create the log as an EMPTY file. If a shim's append later failed
  // (e.g. the dir went read-only), the log would otherwise stay ABSENT and an
  // absence-is-clean reader would report a false clean. With pre-creation,
  // absence at check time can only mean the guard state was deleted or
  // tampered with — assertNoLoaderInvoked treats ENOENT as a failure.
  fs.writeFileSync(logPath, '');
  if (process.platform !== 'win32') {
    const script = `#!/bin/sh
# A pure version probe is read-only — let it pass so the real scheduling path
# still executes into temp (needed for the Linux systemd presence probe).
if [ "$#" -eq 1 ] && [ "$1" = "--version" ]; then exit 0; fi
# Derive the log from this shim's OWN location when the env var is missing —
# an env regression that drops WD_SHIM_LOG must not make the append vanish
# silently. makeLoaderShimDir names the log <binDir>/shim.log, so the
# fallback and the exported path always agree.
LOG="\${WD_SHIM_LOG:-$(dirname "$0")/shim.log}"
printf '%s %s\\n' "$(basename "$0")" "$*" >> "$LOG"
exit 9   # fail-closed: any real mutation attempt is captured AND fails
`;
    for (const name of LOADER_COMMANDS) {
      const shimPath = path.join(binDir, name);
      fs.writeFileSync(shimPath, script);
      fs.chmodSync(shimPath, 0o755);
    }
  }
  return { binDir, logPath };
}

/**
 * Build the sandboxed env for the ONE subprocess that schedules
 * (`wienerdog init --fresh-vault --yes`). Init-env split, not an auth-env
 * change: only `init` schedules and it needs no subscription auth, so this
 * redirects `HOME` + `XDG_CONFIG_HOME` into `root` (defense layer 1 — the
 * file write lands in temp), sets `WIENERDOG_LOADER_NOOP=1` (layer 2 — the
 * loader call is neutered), and prepends the fail-closed shim dir to `PATH`
 * (layer 3 — a `LOADER_NOOP` regression is caught, not silently real). Every
 * other `baseEnv` key (WIENERDOG_HOME, WIENERDOG_VAULT, CLAUDE_CONFIG_DIR,
 * etc.) passes through unchanged. Do NOT use this for the `dream`/`claude -p`
 * subprocess — that env must stay byte-for-byte as the harness built it
 * (ADR-0009).
 * @param {NodeJS.ProcessEnv} baseEnv  the harness's already-built child env
 * @param {string} root  the harness's temp root
 * @param {{binDir:string, logPath:string}} shim  from makeLoaderShimDir(root)
 * @returns {NodeJS.ProcessEnv}
 */
function buildInitEnv(baseEnv, root, shim) {
  return {
    ...baseEnv,
    HOME: root,
    XDG_CONFIG_HOME: path.join(root, '.config'),
    WIENERDOG_LOADER_NOOP: '1',
    PATH: shim.binDir + path.delimiter + (baseEnv.PATH || ''),
    WD_SHIM_LOG: shim.logPath,
  };
}

/**
 * Tripwire 1: did a real loader command run despite `WIENERDOG_LOADER_NOOP`?
 * Reads `shim.logPath`, which makeLoaderShimDir PRE-CREATED as an empty file:
 * an EMPTY existing log that is still WRITABLE is the only clean state.
 * ENOENT is a FAILURE — the pre-created guard state was deleted or tampered
 * with, so the tripwire is unverifiable. Any other read error (EACCES,
 * EISDIR, …) is likewise a failure, and so is a log that exists but is no
 * longer writable at assert time (a shim's append would have failed
 * silently). MUST be called before the caller's `fs.rmSync(root)`: the log
 * lives under `root`, and a deleted log must trip, not read as clean (F7).
 *
 * Accepted residual: this tripwire cannot distinguish "the shims never
 * fired" from "a shim fired but its append failed" — whether that append
 * failure comes from active in-process sabotage or from resource exhaustion
 * (ENOSPC/EDQUOT on a full filesystem), the log reads empty and writable at
 * assert time, which is indistinguishable from clean. The writability check
 * below narrows this window but does not eliminate it. Load-bearing context:
 * the shim's PREVENTION function is unaffected by a failed append — it exits
 * 9 without exec'ing the real loader regardless, so in every such scenario
 * the real scheduler registration is still blocked. What degrades is
 * detection redundancy (learning that LOADER_NOOP regressed), and the
 * layered defenses (the temp HOME/XDG redirect + the observer) remain in
 * force. Honest residual, accurately scoped — a detector has a floor.
 * @param {{binDir:string, logPath:string}} shim
 * @returns {string[]} one failure per recorded invocation; `[]` if clean
 */
function assertNoLoaderInvoked(shim) {
  let content;
  try {
    content = fs.readFileSync(shim.logPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return [
        `scheduler-guard: the loader-shim log ${shim.logPath} is MISSING — it was ` +
          'pre-created at setup, so its absence means the guard state was deleted or ' +
          'tampered with. The tripwire is unverifiable; failing closed.',
      ];
    }
    return [
      `scheduler-guard: could not read the loader-shim log ${shim.logPath} ` +
        `(${err && err.code ? err.code : err}) — the tripwire itself is unverifiable, ` +
        'so this counts as a failure (fail-closed).',
    ];
  }
  const failures = [];
  try {
    fs.accessSync(shim.logPath, fs.constants.W_OK);
  } catch {
    failures.push(
      `scheduler-guard: the loader-shim log ${shim.logPath} is not WRITABLE at assert ` +
        'time — a shim append would have failed silently; guard state tampered — ' +
        'unverifiable, fail closed.'
    );
  }
  failures.push(
    ...content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .map((line) => `scheduler-guard: the real loader was invoked despite WIENERDOG_LOADER_NOOP: ${line}`)
  );
  return failures;
}

/**
 * The real per-platform, file-based scheduler dir(s) to scan, derived the
 * SAME way the product does (`src/core/paths.js`'s `env.HOME || os.homedir()`
 * and `src/scheduler/generators.js`'s `systemdUserDir`). Windows Task
 * Scheduler is not file-based under a redirected dir, so `win32` (and any
 * other platform) scans nothing — the WP-161 spec's accepted Windows residual.
 * @param {NodeJS.Platform} platform
 * @param {NodeJS.ProcessEnv} env
 * @returns {Array<{dir:string, pattern:RegExp}>}
 */
function realSchedulerDirs(platform, env) {
  const home = env.HOME || os.homedir();
  if (platform === 'darwin') {
    return [{ dir: path.join(home, 'Library', 'LaunchAgents'), pattern: DARWIN_ENTRY_PATTERN }];
  }
  if (platform === 'linux') {
    const xdg = env.XDG_CONFIG_HOME;
    const base = xdg && xdg !== '' ? xdg : path.join(home, '.config');
    return [{ dir: path.join(base, 'systemd', 'user'), pattern: LINUX_ENTRY_PATTERN }];
  }
  return [];
}

/**
 * 3-entity XML escape (& < > only, & first) — exact inline mirror of
 * `src/scheduler/generators.js` `xmlEscape`, the serializer for launchd plist
 * `<string>` bodies (and systemd values pass through it unescaped-quoted).
 * Replicated read-only: scenario infra must not import the product code it
 * guards. NOTE: `"` and `'` stay LITERAL here, matching the product.
 * @param {string} s @returns {string}
 */
function xmlEscape3(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * 5-entity XML escape — exact inline mirror of `src/scheduler/generators.js`
 * `windowsXmlEscape`, the serializer for Task Scheduler XML (adds " and ' to
 * the 3-entity form). Replicated read-only, same reason as xmlEscape3.
 * @param {string} s @returns {string}
 */
function xmlEscape5(s) {
  return xmlEscape3(s).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/**
 * systemd body escape — exact inline mirror of the INNER byte transform of
 * `src/scheduler/generators.js` `systemdQuote` (order matters: `\` doubled
 * first, then `%` → `%%`, then `"` → `\"`), which quotes every path embedded
 * in a rendered .service/.timer body (`ExecStart=`, `Environment=` lines).
 * The surrounding double quotes are NOT included here: `tempRoot` is a PREFIX
 * of a longer quoted path (`<root>/core/...`), so only the inner transform
 * surrounds it in the file. Replicated read-only, same reason as xmlEscape3.
 * @param {string} s @returns {string}
 */
function systemdEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/%/g, '%%').replace(/"/g, '\\"');
}

/**
 * The distinct textual forms `tempRoot` can take inside a rendered scheduler
 * entry: literal, 3-entity-escaped (launchd plists via `xmlEscape`),
 * 5-entity-escaped (Windows task XML via `windowsXmlEscape`), and
 * systemd-escaped (.service/.timer bodies via `systemdQuote`'s inner
 * transform). Variants equal to an earlier form are skipped.
 * @param {string} tempRoot @returns {string[]}
 */
function tempRootVariants(tempRoot) {
  const variants = [tempRoot];
  for (const escaped of [xmlEscape3(tempRoot), xmlEscape5(tempRoot), systemdEscape(tempRoot)]) {
    if (!variants.includes(escaped)) variants.push(escaped);
  }
  return variants;
}

/**
 * Tripwire 2 (report-only observer, Finding 3): scan the real per-platform
 * scheduler dir(s) for a Wienerdog-named entry whose file content references
 * `tempRoot` — i.e. a plist/timer/service THIS run actually leaked (its
 * ProgramArguments/ExecStart point at this run's temp core). Never deletes
 * anything (deleting a file would not unregister a loaded agent and could
 * race a concurrent install — the caller/maintainer must act on the reported
 * failure). A Wienerdog entry that does not reference `tempRoot` (e.g. a
 * concurrent legitimate install) is left untouched and unreported. Never
 * throws: a MISSING dir/file (ENOENT) reads as clean (nothing was written
 * there), but any OTHER fs error is returned as a failure — an observer that
 * cannot see is not allowed to report clean (fail-closed).
 * @param {string} tempRoot  this run's temp root (the leak signal)
 * @param {{dir?:string, platform?:NodeJS.Platform, env?:NodeJS.ProcessEnv}} [opts]
 *   `opts.dir` fully overrides the scanned dir (direct-injection unit tests);
 *   `opts.platform` overrides `process.platform`; `opts.env` overrides
 *   `process.env` for the home/XDG derivation (Codex Finding F5) — defaults
 *   to the runner's own `process.env`, never the sandboxed `init` env.
 * @returns {string[]} one loud, actionable failure per leaked entry; `[]` if clean
 */
function assertNoRealSchedulerLeak(tempRoot, opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const targets = opts.dir
    ? [{ dir: opts.dir, pattern: platform === 'linux' ? LINUX_ENTRY_PATTERN : DARWIN_ENTRY_PATTERN }]
    : realSchedulerDirs(platform, env);

  // A tempRoot containing a serializer-special char appears escaped in a
  // rendered entry, so a literal includes() alone would miss the leak — match
  // every form the PRODUCT's serializers can emit (literal / xmlEscape /
  // windowsXmlEscape / systemdQuote's inner transform; Codex review,
  // strengthens the spec's literal "content contains tempRoot" contract).
  const variants = tempRootVariants(tempRoot);
  const failures = [];
  for (const { dir, pattern } of targets) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (err) {
      if (err && err.code === 'ENOENT') continue; // no dir = nothing was ever written there
      failures.push(
        `scheduler-guard: observer could not read ${dir} ` +
          `(${err && err.code ? err.code : err}) — unverifiable, fail closed.`
      );
      continue;
    }
    for (const name of names) {
      // Every NAME-matched entry is classified by fd — no Dirent type filter
      // (readdir can report DT_UNKNOWN on some filesystems, which a
      // Dirent-based filter would silently skip).
      if (!pattern.test(name)) continue;
      const full = path.join(dir, name);
      // fd-based classify-then-read: open once (O_NONBLOCK makes a FIFO open
      // return immediately instead of blocking), fstat the SAME fd, then read
      // that SAME fd — there is no name-based stat→read window for a swap, by
      // construction. Symlinks are followed by open; a dangling one is ENOENT.
      let fd;
      try {
        fd = fs.openSync(full, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
      } catch (err) {
        if (err && err.code === 'ENOENT') continue; // dangling symlink
        failures.push(
          `scheduler-guard: observer could not open ${full} ` +
            `(${err && err.code ? err.code : err}) — unverifiable, fail closed.`
        );
        continue;
      }
      try {
        if (!fs.fstatSync(fd).isFile()) {
          failures.push(
            `scheduler-guard: ${full} is a non-regular scheduler entry — refusing to read, fail closed.`
          );
          continue;
        }
        const content = fs.readFileSync(fd, 'utf8');
        if (variants.some((v) => content.includes(v))) {
          failures.push(
            `scheduler-guard: LEAK — ${full} references this run's temp core (${tempRoot}); ` +
              'remove it manually and fix WP-161\'s env.'
          );
        }
      } catch (err) {
        failures.push(
          `scheduler-guard: observer could not read ${full} ` +
            `(${err && err.code ? err.code : err}) — unverifiable, fail closed.`
        );
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  return failures;
}

/**
 * Tripwire 3: the LOADED-RECORD observer. Reads what the OS scheduler will
 * ACTUALLY EXECUTE for every Wienerdog-named registration, and fails the run
 * when any of it points into a temp directory. Deliberately takes NO `env`
 * parameter — it must never be handed the sandboxed init env; the default
 * `run` inherits the RUNNER's own environment.
 * Reads NO scheduler artifact file: not the plist, not the systemd unit, not
 * the manifest. That artifact was clean throughout the incident this exists to
 * catch (the loaded record for `ai.wienerdog.catchup` pointed at a deleted
 * harness temp core for weeks while its `.plist` on disk stayed correct).
 * (`fs.realpathSync(os.tmpdir())` in the prefix step is a directory-name
 * resolution, not an artifact read.)
 *
 * darwin: enumerate the loaded labels from the `services = {` block of
 * `launchctl print gui/<uid>` — the SAME domain every record is then read
 * from, so a domain this process cannot see fails closed instead of reporting
 * an unexamined clean — then read each `ai.wienerdog.*` record's
 * `arguments = {` block via `launchctl print gui/<uid>/<label>`. Every
 * unverifiable condition is a failure; the single tolerated non-zero exit is
 * `113` (launchd's "could not find service … in domain": a genuine
 * listed-then-unloaded race), which is skipped WITH a printed notice.
 * linux / win32 / anything else: returns `[]` and prints one notice naming the
 * residual — a `systemd --user` manager's unit search path cannot be moved by
 * a child process, and no `schtasks` interceptor exists.
 *
 * Failures carry one of exactly two class prefixes: `scheduler-guard: LEAK — `
 * (a record was read and an argument is temp-origin — this machine is
 * genuinely poisoned) or `scheduler-guard: UNVERIFIABLE — ` (the observer
 * could not establish what a record will execute). Both fail the run.
 *
 * Strictly read-only: never issues `bootstrap`, `bootout` or any other
 * mutation, and nothing it starts outlives the call (ADR-0004).
 * @param {string} tempRoot  this run's temp root
 * @param {{platform?:NodeJS.Platform,
 *          run?: (argv:string[]) => {status:number|null, stdout?:string, error?:Error},
 *          uid?: number, prefixes?: string[],
 *          notice?: (msg:string) => void}} [opts]
 * @returns {string[]} one loud, actionable failure per offending record; [] if clean
 */
function assertNoLoadedSchedulerLeak(tempRoot, opts = {}) {
  const notice = opts.notice || ((m) => console.log(m));
  // Parenthesised on purpose: `(opts.platform || process.platform === 'darwin')`
  // parses as `opts.platform || (process.platform === 'darwin')`, which is
  // truthy for ANY non-empty opts.platform — including 'linux'.
  const isDarwin = (opts.platform || process.platform) === 'darwin';
  if (!isDarwin) {
    const platform = opts.platform || process.platform;
    notice(
      platform === 'linux'
        ? 'scheduler-guard: note — the loaded-record observer is a no-op on linux. A running ' +
            "`systemd --user` manager's unit search path is fixed when the MANAGER starts and is " +
            "not moved by a child process's XDG_CONFIG_HOME, so a harness cannot load a unit from " +
            'its temp dir; the only reachable leak shape is a unit FILE in the real user dir, ' +
            'which assertNoRealSchedulerLeak already catches.'
        : `scheduler-guard: note — the loaded-record observer is a no-op on ${platform}. ` +
            'Accepted residual (WP-161): there is no schtasks PATH interceptor and no Windows CI runner.'
    );
    return [];
  }

  const run = opts.run || ((argv) => spawnSync(argv[0], argv.slice(1), { encoding: 'utf8' }));
  const uid = opts.uid ?? process.getuid();
  const domain = `gui/${uid}`;

  // Table D — the ONE temp-origin mechanism, location-shaped. The whole OS temp
  // base is in the prefix set (not just tempRoot) because a record poisoned by
  // an EARLIER harness run sits under a SIBLING of this run's root; os.tmpdir()
  // and its realpath differ on macOS and the poisoned argv used the non-realpath
  // form, so both must be present.
  let prefixes = opts.prefixes;
  if (!prefixes) {
    prefixes = [tempRoot, os.tmpdir()];
    try {
      prefixes.push(fs.realpathSync(os.tmpdir()));
    } catch {
      // Unresolvable realpath: just omit that third entry.
    }
  }
  const bases = [];
  for (const p of prefixes) {
    const stripped = String(p).replace(/\/+$/, '');
    if (stripped !== '' && !bases.includes(stripped)) bases.push(stripped);
  }
  const isTempOrigin = (a) => bases.some((p) => a === p || a.startsWith(`${p}/`));

  /** @param {string} why @returns {string} */
  const unverifiable = (why) => `scheduler-guard: UNVERIFIABLE — ${why}`;

  /**
   * Extract the body rows of the first block whose OPENING line trims to
   * exactly `opener`, up to the next line trimming to exactly `}`.
   * @param {string} stdout @param {string} opener
   * @returns {{ok:boolean, reason?:string, rows?:string[]}}
   */
  const block = (stdout, opener) => {
    const lines = stdout.split('\n');
    // Exact trimmed EQUALITY, never includes(): the same output carries a
    // `disabled services = {` block whose rows end in enabled/disabled, which
    // would yield zero labels and a FALSE CLEAN.
    const open = lines.findIndex((l) => l.trim() === opener);
    if (open === -1) return { ok: false, reason: `no line whose trimmed content is exactly \`${opener}\`` };
    for (let i = open + 1; i < lines.length; i += 1) {
      if (lines[i].trim() === '}') return { ok: true, rows: lines.slice(open + 1, i) };
    }
    return { ok: false, reason: `the \`${opener}\` block is never closed by a line trimming to \`}\`` };
  };

  // ── Enumerate, from the SAME domain the records are read from ────────────
  const enumerated = run([LAUNCHCTL_PATH, 'print', domain]);
  if (enumerated && enumerated.error) {
    return [
      unverifiable(
        `could not enumerate the LOADED launchd records in domain ${domain}: spawning ` +
          `${LAUNCHCTL_PATH} failed (${enumerated.error.message}). The observer could not start, so ` +
          'nothing behind it may be reported clean. This is NOT evidence of a leak.'
      ),
    ];
  }
  if (!enumerated || enumerated.status !== 0) {
    const status = enumerated ? enumerated.status : null;
    return [
      unverifiable(
        `could not enumerate the LOADED launchd records in domain ${domain} ` +
          `(launchctl print exit ${status}). The observer cannot see this domain at all, so it ` +
          'fails closed rather than reporting clean. This is NOT evidence of a leak: exit 112 is ' +
          '"no such domain", which is what a headless/SSH session with no gui/<uid> domain ' +
          'produces. Re-run from a GUI login session.'
      ),
    ];
  }
  if (typeof enumerated.stdout !== 'string') {
    return [
      unverifiable(
        `could not enumerate the LOADED launchd records in domain ${domain}: launchctl print ` +
          'exited 0 but produced no readable stdout. Fail-closed; NOT evidence of a leak.'
      ),
    ];
  }
  const services = block(enumerated.stdout, 'services = {');
  if (!services.ok) {
    return [
      unverifiable(
        `could not enumerate the LOADED launchd records in domain ${domain}: ${services.reason}. ` +
          'The domain answered but its service list could not be located — an unparsed list is ' +
          'not an empty list. Fail-closed; NOT evidence of a leak.'
      ),
    ];
  }

  const labels = [];
  for (const row of services.rows) {
    const trimmed = row.trim();
    if (trimmed === '') continue;
    // Observed live on macOS 26.5: every services row splits into exactly three
    // whitespace-separated fields (PID, Status, Label), so the label is the last.
    const label = trimmed.split(/\s+/).pop();
    if (LOADED_LABEL_PATTERN.test(label)) labels.push(label);
  }

  // ── Read EVERY selected label's record — never stop at the first ─────────
  const failures = [];
  for (const label of labels) {
    const record = run([LAUNCHCTL_PATH, 'print', `${domain}/${label}`]);
    if (record && record.error) {
      failures.push(
        unverifiable(
          `could not read the LOADED launchd record ${label}: spawning ${LAUNCHCTL_PATH} failed ` +
            `(${record.error.message}). Fail-closed; NOT evidence of a leak.`
        )
      );
      continue;
    }
    if (!record || record.status !== 0) {
      const status = record ? record.status : null;
      if (status === 113) {
        // The ONLY tolerated non-zero exit: launchd's "could not find service …
        // in domain" — the label was listed a moment ago and is no longer
        // loaded, i.e. a genuine race. It prints; no disposition here is silent.
        notice(
          `scheduler-guard: note — label ${label} was listed but is no longer loaded ` +
            '(launchctl print exit 113); skipped.'
        );
        continue;
      }
      failures.push(
        unverifiable(
          `could not read the LOADED launchd record ${label} (launchctl print exit ${status}). ` +
            'Only exit 113 ("no such service in domain", a listed-then-unloaded race) is tolerated; ' +
            'every other exit — 112 (no such domain), 64 (malformed target) — leaves what this ' +
            'record will execute unknown. Fail-closed; NOT evidence of a leak.'
        )
      );
      continue;
    }
    if (typeof record.stdout !== 'string') {
      failures.push(
        unverifiable(
          `could not read the LOADED launchd record ${label}: launchctl print exited 0 but ` +
            'produced no readable stdout. Fail-closed; NOT evidence of a leak.'
        )
      );
      continue;
    }
    const args = block(record.stdout, 'arguments = {');
    if (!args.ok) {
      failures.push(
        unverifiable(
          `could not read what the LOADED launchd record ${label} will execute: ${args.reason}. ` +
            'The record exists but its exec identity could not be read. Fail-closed; NOT evidence ' +
            'of a leak.'
        )
      );
      continue;
    }
    for (const row of args.rows) {
      const program = row.trim();
      if (program === '' || !isTempOrigin(program)) continue;
      failures.push(
        [
          `scheduler-guard: LEAK — the LOADED launchd record ${label}` +
            ` will execute ${program}` +
            ', which is inside a temp directory. A harness run clobbered the real' +
            ' per-user label; the .plist FILE on disk is not the artifact at fault' +
            ' and may look clean. Repair, IN THIS ORDER:',
          '  1) wienerdog sync',
          '  2) only if a re-run still reports this record:',
          `     launchctl bootout gui/$(id -u)/${label} ; wienerdog sync`,
        ].join('\n')
      );
      break; // one failure per offending record
    }
  }
  return failures;
}

module.exports = {
  makeLoaderShimDir,
  buildInitEnv,
  assertNoLoaderInvoked,
  assertNoRealSchedulerLeak,
  assertNoLoadedSchedulerLeak,
};
