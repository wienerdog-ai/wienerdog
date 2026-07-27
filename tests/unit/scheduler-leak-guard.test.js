'use strict';

// Deterministic unit tests for tests/scenarios/scheduler-guard.js (WP-161).
// Runs under `npm test` (no WIENERDOG_RUN_SCENARIOS, no quota, no real
// scheduler): every assertion here operates entirely inside injected temp
// dirs and never reads or writes the real scheduler directory. `generators`
// is imported READ-ONLY, to assert `systemdUserDir` resolution against the
// same env `buildInitEnv` produces — no src/ file is modified by this WP.
//
// Every test name is prefixed `scheduler-leak-guard: ` so the spec's literal
// verification command — `npm test -- --test-name-pattern
// "scheduler-leak-guard"` — genuinely selects this whole file (a name-pattern
// that matches nothing passes vacuously).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scg = require('../scenarios/scheduler-guard');
const gen = require('../../src/scheduler/generators');

/** @param {string} prefix @returns {string} a fresh temp dir under the OS tmp root. */
function mkTemp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ── buildInitEnv ─────────────────────────────────────────────────────────

test('scheduler-leak-guard: buildInitEnv sets HOME/XDG_CONFIG_HOME/LOADER_NOOP/PATH+shim, passes every other baseEnv key through unchanged, and never mutates baseEnv', () => {
  const root = mkTemp('wd-sg-buildenv-');
  const shim = scg.makeLoaderShimDir(root);
  const baseEnv = {
    CLAUDE_CONFIG_DIR: '/real/claude-config',
    WIENERDOG_HOME: '/real/wd-home',
    PATH: '/usr/bin:/bin',
  };
  const baseEnvSnapshot = structuredClone(baseEnv);
  const initEnv = scg.buildInitEnv(baseEnv, root, shim);

  assert.equal(initEnv.HOME, root);
  assert.equal(initEnv.XDG_CONFIG_HOME, path.join(root, '.config'));
  assert.equal(initEnv.WIENERDOG_LOADER_NOOP, '1');
  assert.ok(initEnv.PATH.startsWith(shim.binDir + path.delimiter), `PATH must begin with shim.binDir: ${initEnv.PATH}`);
  assert.equal(initEnv.WD_SHIM_LOG, shim.logPath);
  // Every other baseEnv key passes through unchanged.
  assert.equal(initEnv.CLAUDE_CONFIG_DIR, '/real/claude-config');
  assert.equal(initEnv.WIENERDOG_HOME, '/real/wd-home');
  // No aliasing: buildInitEnv returns a NEW object and leaves baseEnv deep-
  // unchanged — this is what keeps the harnesses' auth-sensitive dream env
  // (run-scenarios.js / run-negative.js `runWienerdog(['dream', ...], env)`)
  // provably untouched by the init-env split.
  assert.deepEqual(baseEnv, baseEnvSnapshot, 'buildInitEnv must not mutate baseEnv');
});

test('scheduler-leak-guard: buildInitEnv Linux XDG-set branch — systemdUserDir resolves under root, NOT under the real XDG dir', () => {
  const root = mkTemp('wd-sg-xdgset-');
  const shim = scg.makeLoaderShimDir(root);
  const baseEnv = { XDG_CONFIG_HOME: '/real/xdg' };
  const initEnv = scg.buildInitEnv(baseEnv, root, shim);

  const dir = gen.systemdUserDir(root, initEnv);
  assert.ok(dir.startsWith(root + path.sep), `expected systemdUserDir under root, got ${dir}`);
  assert.ok(!dir.startsWith('/real/xdg'), `must not resolve under the real XDG dir, got ${dir}`);
});

test('scheduler-leak-guard: buildInitEnv Linux XDG-unset branch — systemdUserDir still resolves under root', () => {
  const root = mkTemp('wd-sg-xdgunset-');
  const shim = scg.makeLoaderShimDir(root);
  const baseEnv = {}; // no XDG_CONFIG_HOME at all
  const initEnv = scg.buildInitEnv(baseEnv, root, shim);

  const dir = gen.systemdUserDir(root, initEnv);
  assert.ok(dir.startsWith(root + path.sep), `expected systemdUserDir under root, got ${dir}`);
});

// ── loader shims (fail-closed tripwire) ─────────────────────────────────

test('scheduler-leak-guard: makeLoaderShimDir refuses a root whose shim dir would contain the PATH delimiter (fail-closed)', () => {
  const parent = mkTemp('wd-sg-delim-');
  // A directory NAME containing the PATH delimiter is legal on POSIX
  // filesystems (e.g. a TMPDIR with ':') but would split the PATH entry
  // buildInitEnv prepends — the guard must throw, not degrade.
  const badRoot = path.join(parent, `bad${path.delimiter}root`);
  assert.throws(() => scg.makeLoaderShimDir(badRoot), /PATH\s+delimiter/);
});

test('scheduler-leak-guard: loader shim records a mutation invocation to WD_SHIM_LOG and exits non-zero', { skip: process.platform === 'win32' }, () => {
  const root = mkTemp('wd-sg-shim-mutate-');
  const shim = scg.makeLoaderShimDir(root);
  const r = spawnSync(path.join(shim.binDir, 'launchctl'), ['bootstrap', 'gui/501', '/tmp/ai.wienerdog.dream.plist'], {
    env: { WD_SHIM_LOG: shim.logPath },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0, 'a real mutation attempt must fail closed');
  const log = fs.readFileSync(shim.logPath, 'utf8');
  assert.match(log, /launchctl bootstrap gui\/501 \/tmp\/ai\.wienerdog\.dream\.plist/);
});

test('scheduler-leak-guard: loader shim lets a lone --version pass through (exit 0, records nothing)', { skip: process.platform === 'win32' }, () => {
  const root = mkTemp('wd-sg-shim-version-');
  const shim = scg.makeLoaderShimDir(root);
  const r = spawnSync(path.join(shim.binDir, 'systemctl'), ['--version'], {
    env: { WD_SHIM_LOG: shim.logPath },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  // The log is PRE-CREATED empty at setup; --version must leave it empty.
  assert.equal(fs.readFileSync(shim.logPath, 'utf8'), '', '--version must not write to the log');
});

test('scheduler-leak-guard: loader shim falls back to <binDir>/shim.log when WD_SHIM_LOG is missing from its env', { skip: process.platform === 'win32' }, () => {
  const root = mkTemp('wd-sg-shim-fallback-');
  const shim = scg.makeLoaderShimDir(root);
  // Strip WD_SHIM_LOG from the shim's env (keep PATH for dirname/basename):
  // the shim must derive the log from its own location, so an env regression
  // cannot make the append vanish silently.
  const r = spawnSync(path.join(shim.binDir, 'launchctl'), ['bootstrap', 'gui/501', 'ai.wienerdog.dream'], {
    env: { PATH: '/usr/bin:/bin' },
    encoding: 'utf8',
  });
  assert.notEqual(r.status, 0, 'the mutation attempt still fails closed');
  const log = fs.readFileSync(shim.logPath, 'utf8');
  assert.match(log, /launchctl bootstrap gui\/501 ai\.wienerdog\.dream/, 'the invocation lands in <binDir>/shim.log');
  const failures = scg.assertNoLoaderInvoked(shim);
  assert.equal(failures.length, 1, 'assertNoLoaderInvoked reports the fallback-logged invocation');
});

// ── assertNoLoaderInvoked ────────────────────────────────────────────────

test('scheduler-leak-guard: assertNoLoaderInvoked — pre-created empty log is clean; a non-empty log yields one failure per line', () => {
  const root = mkTemp('wd-sg-invoked-');
  const shim = scg.makeLoaderShimDir(root);

  // makeLoaderShimDir pre-creates the log as an empty file — the clean state.
  assert.ok(fs.existsSync(shim.logPath), 'the log is pre-created at setup');
  assert.deepEqual(scg.assertNoLoaderInvoked(shim), [], 'pre-created empty log → no failures');

  fs.writeFileSync(
    shim.logPath,
    'launchctl bootstrap gui/501 ai.wienerdog.dream\nsystemctl --user enable wienerdog-dream.timer\n'
  );
  const failures = scg.assertNoLoaderInvoked(shim);
  assert.equal(failures.length, 2, 'one failure per recorded invocation line');
});

test('scheduler-leak-guard: assertNoLoaderInvoked — a MISSING pre-created log is a failure, never a false clean', () => {
  const root = mkTemp('wd-sg-missing-');
  const shim = scg.makeLoaderShimDir(root);
  // The log was pre-created at setup; deleting it simulates guard-state
  // deletion/tampering (or a shim whose append failed leaving no trace) —
  // absence must trip, not read as clean.
  fs.rmSync(shim.logPath);
  const failures = scg.assertNoLoaderInvoked(shim);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /MISSING/);
  assert.match(failures[0], /failing closed/);
});

test('scheduler-leak-guard: assertNoLoaderInvoked — an UNREADABLE log (non-ENOENT) is a failure, never a false clean', () => {
  const root = mkTemp('wd-sg-unreadable-');
  const shim = scg.makeLoaderShimDir(root);
  // Replace the pre-created log file with a DIRECTORY: readFileSync throws
  // EISDIR — a non-ENOENT error, so the tripwire is unverifiable and must
  // fail closed.
  fs.rmSync(shim.logPath);
  fs.mkdirSync(shim.logPath, { recursive: true });
  const failures = scg.assertNoLoaderInvoked(shim);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /could not read the loader-shim log/);
  assert.match(failures[0], /fail-closed/);
});

test('scheduler-leak-guard: assertNoLoaderInvoked — an UNWRITABLE log at assert time is a failure (a shim append would have failed silently)', {
  skip:
    process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0)
      ? 'needs POSIX permission enforcement (non-root)'
      : false,
}, () => {
  const root = mkTemp('wd-sg-unwritable-');
  const shim = scg.makeLoaderShimDir(root);
  fs.chmodSync(shim.logPath, 0o444);
  try {
    const failures = scg.assertNoLoaderInvoked(shim);
    assert.equal(failures.length, 1);
    assert.match(failures[0], /not WRITABLE/);
    assert.match(failures[0], /fail closed/);
  } finally {
    fs.chmodSync(shim.logPath, 0o644); // restore so tmp cleanup can proceed
  }
});

// ── assertNoRealSchedulerLeak: direct-injection contract (opts.dir) ────────

test('scheduler-leak-guard: assertNoRealSchedulerLeak reports a tempRoot-referencing plist, ignores an unrelated one, and never deletes either', () => {
  const tempRoot = mkTemp('wd-sg-tmproot-');
  const scanDir = mkTemp('wd-sg-scandir-');
  const leaked = path.join(scanDir, 'ai.wienerdog.dream.plist');
  const unrelated = path.join(scanDir, 'ai.wienerdog.catchup.plist');
  fs.writeFileSync(leaked, `<plist>...${tempRoot}/core...</plist>`);
  fs.writeFileSync(unrelated, '<plist>...points at /Users/real/.wienerdog/core...</plist>');

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'darwin' });

  assert.equal(failures.length, 1);
  assert.match(failures[0], /ai\.wienerdog\.dream\.plist/);
  assert.match(failures[0], new RegExp(tempRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(fs.existsSync(leaked), 'observer never deletes the leaked file');
  assert.ok(fs.existsSync(unrelated), 'observer never deletes the unrelated file');
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak finds a tempRoot stored XML-ESCAPED in the plist body', () => {
  // A tempRoot containing XML-special chars (&, quotes) appears escaped in a
  // plist rendered by the product's xmlEscape/windowsXmlEscape — the literal
  // includes() alone would miss it. The root string need not exist on disk;
  // it is only the leak-signal the observer greps for.
  const parent = mkTemp('wd-sg-escroot-');
  const tempRoot = path.join(parent, 'a&b');
  const scanDir = mkTemp('wd-sg-escscan-');
  const leaked = path.join(scanDir, 'ai.wienerdog.dream.plist');
  const escaped = `${parent}/a&amp;b`; // how xmlEscape renders the root in a plist <string>
  fs.writeFileSync(leaked, `<plist><string>${escaped}/core</string></plist>`);

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'darwin' });
  assert.equal(failures.length, 1, 'the XML-escaped form of tempRoot must still be detected');
  assert.match(failures[0], /ai\.wienerdog\.dream\.plist/);
  assert.ok(fs.existsSync(leaked), 'observer never deletes the leaked file');
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak matches the PRODUCT 3-entity escape — root with & AND " (quote literal, ampersand escaped)', () => {
  // src/scheduler/generators.js `xmlEscape` (the launchd plist serializer)
  // escapes ONLY & < > and leaves quotes LITERAL. A root containing both `&`
  // and `"` therefore appears in a plist as neither the literal root nor its
  // 5-entity form — only the exact 3-entity variant matches it.
  const parent = mkTemp('wd-sg-esc3root-');
  const tempRoot = path.join(parent, 'a&b"c');
  const scanDir = mkTemp('wd-sg-esc3scan-');
  const leaked = path.join(scanDir, 'ai.wienerdog.dream.plist');
  const productEscaped = `${parent}/a&amp;b"c`; // xmlEscape output: & escaped, " literal
  fs.writeFileSync(leaked, `<plist><string>${productEscaped}/core</string></plist>`);

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'darwin' });
  assert.equal(failures.length, 1, 'the product-style 3-entity-escaped root must be detected');
  assert.match(failures[0], /ai\.wienerdog\.dream\.plist/);
  assert.ok(fs.existsSync(leaked), 'observer never deletes the leaked file');
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak matches the systemd escape — root with % appears %%-doubled in a .timer body', () => {
  // src/scheduler/generators.js `systemdQuote` doubles `%` (the systemd
  // specifier char) in every path it embeds in a .service/.timer body, so a
  // root containing `%` appears as `%%` — neither the literal nor any XML
  // variant matches it; only the systemd-escaped form does.
  const parent = mkTemp('wd-sg-sysdroot-');
  const tempRoot = path.join(parent, 'a%b');
  const scanDir = mkTemp('wd-sg-sysdscan-');
  const leaked = path.join(scanDir, 'wienerdog-dream.timer');
  const systemdEscaped = `${parent}/a%%b`; // systemdQuote's inner transform
  fs.writeFileSync(leaked, `[Service]\nExecStart="/usr/bin/node" "${systemdEscaped}/core/app/current/bin/wienerdog.js"\n`);

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'linux' });
  assert.equal(failures.length, 1, 'the systemd-escaped root must be detected');
  assert.match(failures[0], /wienerdog-dream\.timer/);
  assert.ok(fs.existsSync(leaked), 'observer never deletes the leaked file');
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak — an UNREADABLE scan dir (non-ENOENT) is a failure, never a false clean', () => {
  const tempRoot = mkTemp('wd-sg-baddir-');
  // Point the scan dir at a regular FILE: readdirSync throws ENOTDIR — a
  // non-ENOENT error, so the observer cannot see and must fail closed.
  const notADir = path.join(tempRoot, 'not-a-dir');
  fs.writeFileSync(notADir, 'x');
  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: notADir, platform: 'darwin' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /observer could not read/);
  assert.match(failures[0], /fail closed/);
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak — a Wienerdog-named symlink to a NON-regular target is reported without being read', { skip: process.platform === 'win32' }, () => {
  const tempRoot = mkTemp('wd-sg-nonreg-');
  const scanDir = mkTemp('wd-sg-nonregscan-');
  const targetDir = mkTemp('wd-sg-nonregtarget-');
  // Symlink resolves to a DIRECTORY: stat succeeds, isFile() is false — the
  // observer must report it and refuse to read (the same guard prevents a
  // blocking read on a symlink-to-FIFO; a directory makes it deterministic).
  fs.symlinkSync(targetDir, path.join(scanDir, 'ai.wienerdog.dream.plist'));

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'darwin' });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /non-regular scheduler entry/);
  assert.match(failures[0], /refusing to read/);
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak follows a Wienerdog-named SYMLINK whose target references tempRoot', { skip: process.platform === 'win32' }, () => {
  const tempRoot = mkTemp('wd-sg-symroot-');
  const scanDir = mkTemp('wd-sg-symscan-');
  const targetDir = mkTemp('wd-sg-symtarget-');
  const target = path.join(targetDir, 'real-plist-body');
  fs.writeFileSync(target, `<plist>...${tempRoot}/core...</plist>`);
  const link = path.join(scanDir, 'ai.wienerdog.dream.plist');
  fs.symlinkSync(target, link);
  // A dangling Wienerdog-named symlink must be silently skipped, not thrown on.
  fs.symlinkSync(path.join(targetDir, 'gone'), path.join(scanDir, 'ai.wienerdog.catchup.plist'));

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { dir: scanDir, platform: 'darwin' });
  assert.equal(failures.length, 1, 'the symlinked entry is followed and reported');
  assert.match(failures[0], /ai\.wienerdog\.dream\.plist/);
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'observer never deletes the symlink');
});

test('scheduler-leak-guard: assertNoRealSchedulerLeak — a missing scan dir yields no failures and never throws', () => {
  const tempRoot = mkTemp('wd-sg-nodir-');
  assert.doesNotThrow(() => {
    const failures = scg.assertNoRealSchedulerLeak(tempRoot, {
      dir: path.join(tempRoot, 'does-not-exist'),
      platform: 'darwin',
    });
    assert.deepEqual(failures, []);
  });
});

// ── assertNoRealSchedulerLeak: F5 differing-HOME derivation (no opts.dir) ──

test('scheduler-leak-guard: F5 macOS branch — derives the scan dir from opts.env.HOME, not os.homedir()', () => {
  const tempRoot = mkTemp('wd-sg-f5root-');
  const tmpHome = mkTemp('wd-sg-f5home-');
  assert.notEqual(tmpHome, os.homedir(), 'the injected HOME must differ from os.homedir() to prove F5');

  const launchAgentsDir = path.join(tmpHome, 'Library', 'LaunchAgents');
  fs.mkdirSync(launchAgentsDir, { recursive: true });
  const leaked = path.join(launchAgentsDir, 'ai.wienerdog.dream.plist');
  fs.writeFileSync(leaked, `<plist>...${tempRoot}/core...</plist>`);

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { platform: 'darwin', env: { HOME: tmpHome } });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /ai\.wienerdog\.dream\.plist/);
});

test('scheduler-leak-guard: F5 Linux HOME-fallback branch — no XDG_CONFIG_HOME → scans <HOME>/.config/systemd/user', () => {
  const tempRoot = mkTemp('wd-sg-f5lroot-');
  const tmpHome = mkTemp('wd-sg-f5lhome-');
  assert.notEqual(tmpHome, os.homedir());

  const systemdDir = path.join(tmpHome, '.config', 'systemd', 'user');
  fs.mkdirSync(systemdDir, { recursive: true });
  const leaked = path.join(systemdDir, 'wienerdog-dream.timer');
  fs.writeFileSync(leaked, `[Service]\nExecStart=... ${tempRoot}/core ...\n`);

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, { platform: 'linux', env: { HOME: tmpHome } });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /wienerdog-dream\.timer/);
});

test('scheduler-leak-guard: F6 Linux XDG-scan branch — the observer honors XDG_CONFIG_HOME over the HOME fallback', () => {
  const tempRoot = mkTemp('wd-sg-f6root-');
  const tmpHome = mkTemp('wd-sg-f6home-');
  const tmpXdg = mkTemp('wd-sg-f6xdg-');
  assert.notEqual(tmpHome, tmpXdg);

  const xdgSystemdDir = path.join(tmpXdg, 'systemd', 'user');
  fs.mkdirSync(xdgSystemdDir, { recursive: true });
  const leaked = path.join(xdgSystemdDir, 'wienerdog-dream.timer');
  fs.writeFileSync(leaked, `[Service]\nExecStart=... ${tempRoot}/core ...\n`);
  // Deliberately leave <tmpHome>/.config/systemd/user absent — an observer
  // that always looked at the HOME fallback would report a false clean here.

  const failures = scg.assertNoRealSchedulerLeak(tempRoot, {
    platform: 'linux',
    env: { HOME: tmpHome, XDG_CONFIG_HOME: tmpXdg },
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /wienerdog-dream\.timer/);
});

// ── assertNoLoadedSchedulerLeak: the LOADED-RECORD observer (tripwire 3) ──
//
// WHICH ARTIFACT THESE ASSERTIONS READ, AND WHY IT IS THE AUTHORITATIVE ONE:
// every test below drives the observer off the OS scheduler's OWN record of
// what it will execute — the `arguments = {` block of
// `launchctl print gui/<uid>/<label>` — supplied as canned `opts.run` output.
// The `.plist` file on disk is NOT authoritative and no assertion here reads
// one: throughout the 2026-07-22 incident that file was perfectly correct
// while the LOADED record for `ai.wienerdog.catchup` pointed at a deleted
// harness temp core and failed hourly with MODULE_NOT_FOUND. `opts.run` is
// injected in every test — none of them spawns a real `launchctl`.

const UID = 501;
const DOMAIN = `gui/${UID}`;

/** @param {string} stdout @returns {{status:number, stdout:string, stderr:string}} a successful canned call. */
function ok(stdout) {
  return { status: 0, stdout, stderr: '' };
}

/**
 * A canned `launchctl print gui/<uid>` stdout, in the shape observed live on
 * macOS 26.5: a `services = {` block of three-field rows (PID, Status, Label),
 * followed by a `disabled services = {` block that must NOT be mistaken for it.
 * @param {string[]} labels @returns {string}
 */
function domainPrint(labels) {
  return [
    'com.apple.xpc.launchd.domain.gui.501 = {',
    '\ttype = user',
    '\tservices = {',
    ...labels.map((l) => `\t\t       0      0 \t${l}`),
    '\t}',
    '\tdisabled services = {',
    '\t\t"com.google.keystone.user.xpcservice" => enabled',
    '\t}',
    '}',
  ].join('\n');
}

/**
 * A canned `launchctl print gui/<uid>/<label>` stdout whose `arguments = {`
 * block holds `args`, one per line — the live shape.
 * @param {string} label @param {string[]} args @returns {string}
 */
function recordPrint(label, args) {
  return [
    `${label} = {`,
    '\tactive count = 1',
    `\tpath = /Users/u/Library/LaunchAgents/${label}.plist`,
    '\targuments = {',
    ...args.map((a) => `\t\t${a}`),
    '\t}',
    '}',
  ].join('\n');
}

/**
 * The injected `opts.run` seam: records every argv it is handed and answers
 * from a target→result map. An unstubbed target throws, so a test can never
 * silently pass over a call it did not expect.
 * @param {string[][]} calls @param {Record<string, object>} byTarget
 * @returns {(argv:string[]) => object}
 */
function makeRun(calls, byTarget) {
  return (argv) => {
    calls.push([...argv]);
    const target = argv[2];
    if (!Object.prototype.hasOwnProperty.call(byTarget, target)) {
      throw new Error(`unexpected launchctl target in a canned run: ${target}`);
    }
    return byTarget[target];
  };
}

/**
 * The contracted LEAK message, reproduced HERE character for character rather
 * than imported from scheduler-guard.js — an imported template would move with
 * any mutation of the message and the equality assertion would be a tautology.
 * @param {string} label @param {string} program @returns {string}
 */
function expectedLeakMessage(label, program) {
  return [
    'scheduler-guard: LEAK — the LOADED launchd record ' +
      label +
      ' will execute ' +
      program +
      ', which is inside a temp directory. A harness run clobbered the real' +
      ' per-user label; the .plist FILE on disk is not the artifact at fault' +
      ' and may look clean. Repair, IN THIS ORDER:',
    '  1) wienerdog sync',
    '  2) only if a re-run still reports this record:',
    '     launchctl bootout gui/$(id -u)/' + label + ' ; wienerdog sync',
  ].join('\n');
}

/**
 * Run `fn` with the two product NEUTRALIZER env vars forced to the given
 * values, restoring the originals in a `finally` so the suite-wide setting
 * (WIENERDOG_TEST_NO_REAL_SCHEDULER=1 from tests/run.js) is not disturbed.
 * Same shape as tests/unit/scheduler-guard.test.js's `withEnv`.
 * @param {{guard?: string, noop?: string}} vals  undefined = delete the var
 * @param {() => void} fn
 */
function withGuardEnv(vals, fn) {
  const savedGuard = process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
  const savedNoop = process.env.WIENERDOG_LOADER_NOOP;
  const set = (k, v) => {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  };
  set('WIENERDOG_TEST_NO_REAL_SCHEDULER', vals.guard);
  set('WIENERDOG_LOADER_NOOP', vals.noop);
  try {
    fn();
  } finally {
    set('WIENERDOG_TEST_NO_REAL_SCHEDULER', savedGuard);
    set('WIENERDOG_LOADER_NOOP', savedNoop);
  }
}

const LEAK_PREFIX = 'scheduler-guard: LEAK — ';
const UNVERIFIABLE_PREFIX = 'scheduler-guard: UNVERIFIABLE — ';

test('scheduler-leak-guard: loaded-record observer FAILS on a record whose loaded argv is under the OS temp dir', () => {
  // The incident's own shape: a LOADED record executing a launcher inside a
  // harness temp core. The plist on disk is irrelevant and is never read.
  const tempRoot = path.join(os.tmpdir(), 'wd-negative-UezlJP');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/opt/homebrew/bin/node', program, 'dream'])
      ),
    }),
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].startsWith(LEAK_PREFIX), `expected a LEAK failure, got: ${out[0]}`);
  assert.ok(out[0].includes('ai.wienerdog.dream'), 'the failure names the label');
  assert.ok(out[0].includes(program), 'the failure names the offending argument');

  // Converse: the same record shape with no temp-origin argument is a
  // VERIFIED clean — the domain was reachable and every record was read.
  const cleanCalls = [];
  const clean = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(cleanCalls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/opt/homebrew/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'dream'])
      ),
    }),
  });
  assert.deepEqual(clean, []);
});

test('scheduler-leak-guard: loaded-record observer does not stop at the FIRST selected label', () => {
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-AC1b');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream', 'ai.wienerdog.catchup'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/usr/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'dream'])
      ),
      [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
        recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', program, 'catchup'])
      ),
    }),
  });
  assert.equal(out.length, 1, 'exactly one failure — the second, poisoned label');
  assert.ok(out[0].includes('ai.wienerdog.catchup'), `the failure must name the SECOND label: ${out[0]}`);
  const targets = calls.map((argv) => argv[2]);
  assert.deepEqual(targets, [DOMAIN, `${DOMAIN}/ai.wienerdog.dream`, `${DOMAIN}/ai.wienerdog.catchup`]);
});

test('scheduler-leak-guard: loaded-record observer inspects EVERY selected label, including the last', () => {
  // AC-1b alone is satisfied by `labels.slice(0, 2)`, a real implementation
  // shape that still skips a poisoned THIRD label. Only this test proves the
  // every-label property.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-AC1c');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream', 'ai.wienerdog.weekly', 'ai.wienerdog.catchup'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/usr/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'dream'])
      ),
      [`${DOMAIN}/ai.wienerdog.weekly`]: ok(
        recordPrint('ai.wienerdog.weekly', ['/usr/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'weekly'])
      ),
      [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
        recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', program, 'catchup'])
      ),
    }),
  });
  assert.equal(out.length, 1);
  assert.ok(out[0].includes('ai.wienerdog.catchup'), `the failure must name the THIRD label: ${out[0]}`);
  const targets = calls.map((argv) => argv[2]);
  assert.deepEqual(targets, [
    DOMAIN,
    `${DOMAIN}/ai.wienerdog.dream`,
    `${DOMAIN}/ai.wienerdog.weekly`,
    `${DOMAIN}/ai.wienerdog.catchup`,
  ]);
});

test('scheduler-leak-guard: loaded-record observer invokes the loader by ABSOLUTE path (domain print and record print)', () => {
  // The harness prepends a fail-closed loader-shim dir to PATH, so a bare
  // `launchctl` could resolve to the guard's OWN containment machinery.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-AC4');
  const calls = [];
  scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/usr/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'dream'])
      ),
    }),
  });
  assert.equal(calls.length, 2, 'one domain print plus one record print');
  for (const argv of calls) {
    assert.equal(argv[0], '/bin/launchctl', `every call must use the absolute loader path: ${JSON.stringify(argv)}`);
  }
});

test('scheduler-leak-guard: a print exit of 1 or 112 is a FAILURE, not a skip', () => {
  // 113 and ONLY 113 is tolerated. A blanket "any non-zero exit is a skip"
  // would fail open in a module whose whole doctrine is fail-closed.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M3');
  const label = 'ai.wienerdog.dream';
  const forRecord = (recordResult) => {
    const calls = [];
    return scg.assertNoLoadedSchedulerLeak(tempRoot, {
      platform: 'darwin',
      uid: UID,
      notice: () => {},
      run: makeRun(calls, { [DOMAIN]: ok(domainPrint([label])), [`${DOMAIN}/${label}`]: recordResult }),
    });
  };

  for (const status of [1, 112]) {
    const out = forRecord({ status, stdout: '', stderr: 'boom' });
    assert.equal(out.length, 1, `record print exit ${status} must be a failure, not a skip`);
    assert.ok(out[0].startsWith(UNVERIFIABLE_PREFIX), `exit ${status} → UNVERIFIABLE, got: ${out[0]}`);
    assert.ok(!out[0].startsWith(LEAK_PREFIX), `exit ${status} is not evidence of a leak`);
  }
});

test('scheduler-leak-guard: loaded-record observer fails closed when the domain cannot be enumerated', () => {
  // Table A's enumerate rows: there is NO path from "unreachable domain" to
  // []. 112 is the load-bearing one — a headless/SSH session with no
  // gui/<uid> domain must not print a green line over a domain it never saw.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M3b');
  const enumerateWith = (domainResult) => {
    const calls = [];
    const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
      platform: 'darwin',
      uid: UID,
      notice: () => {},
      run: makeRun(calls, { [DOMAIN]: domainResult }),
    });
    return { out, calls };
  };

  const unterminated = ['com.apple.xpc.launchd.domain.gui.501 = {', '\tservices = {', '\t\t       0      0 \tai.wienerdog.dream'].join('\n');
  const branches = [
    ['spawn error', { error: new Error('spawn /bin/launchctl ENOENT'), status: null }],
    ['exit 112 (no such domain — headless/SSH)', { status: 112, stdout: '', stderr: 'Could not find domain for user gui: 501' }],
    ['non-string stdout', { status: 0, stdout: undefined, stderr: '' }],
    ['unterminated services block', { status: 0, stdout: unterminated, stderr: '' }],
  ];
  for (const [name, domainResult] of branches) {
    const { out, calls } = enumerateWith(domainResult);
    assert.equal(out.length, 1, `${name} must yield exactly one failure`);
    assert.ok(out[0].startsWith(UNVERIFIABLE_PREFIX), `${name} → UNVERIFIABLE, got: ${out[0]}`);
    assert.ok(!out[0].startsWith(LEAK_PREFIX), `${name} is not evidence of a leak`);
    assert.equal(calls.length, 1, `${name} must make ZERO per-record calls`);
  }

  // The verified clean: the domain WAS reachable and WAS enumerated, and it
  // holds no Wienerdog registration.
  const clean = enumerateWith(ok(domainPrint(['com.apple.Finder', 'com.google.keystone.user.agent'])));
  assert.deepEqual(clean.out, []);
  assert.equal(clean.calls.length, 1, 'no record print is issued when no label matches');
});

test('scheduler-leak-guard: a disabled services block is NOT accepted as the services block', () => {
  // Exact trimmed EQUALITY on the opener. An `includes` implementation accepts
  // the `disabled services = {` block, extracts zero labels (every row's last
  // token is enabled/disabled) and returns a FALSE CLEAN where Table A
  // requires UNVERIFIABLE. Without this decoy the rule is unfalsifiable.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M3c');
  const decoy = [
    'com.apple.xpc.launchd.domain.gui.501 = {',
    '\ttype = user',
    '\tdisabled services = {',
    '\t\t"com.google.keystone.user.xpcservice" => enabled',
    '\t\t"ai.wienerdog.dream" => disabled',
    '\t}',
    '}',
  ].join('\n');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, { [DOMAIN]: ok(decoy) }),
  });
  assert.equal(out.length, 1, 'a domain print with no real services block is UNVERIFIABLE, never clean');
  assert.ok(out[0].startsWith(UNVERIFIABLE_PREFIX), `expected UNVERIFIABLE, got: ${out[0]}`);
  assert.equal(calls.length, 1, 'no record print may be issued');
});

test("scheduler-leak-guard: loaded-record observer catches a STALE leak from another run's temp root", () => {
  // The 2026-07-22 record belonged to an EARLIER run: a tempRoot-only prefix
  // set would report it clean, which is exactly how it survived for weeks.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-THISRUN');
  const staleRoot = path.join(os.tmpdir(), 'wd-negative-UezlJP');
  const program = path.join(staleRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.catchup'])),
      [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
        recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', program, 'catchup'])
      ),
    }),
  });
  assert.equal(out.length, 1, "a leak under a SIBLING run's root must still be caught");
  assert.ok(out[0].startsWith(LEAK_PREFIX));
  assert.ok(out[0].includes(program));

  // The converse pins Table D's single mechanism: a `wd-` path SEGMENT is not
  // a temp marker (WIENERDOG_HOME=~/wd-dev is a legitimate install), so
  // re-introducing a `wd-` rule turns this half red instead of shipping.
  const cleanCalls = [];
  const clean = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    prefixes: ['/nonexistent-root'],
    run: makeRun(cleanCalls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream', 'ai.wienerdog.catchup'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: ok(
        recordPrint('ai.wienerdog.dream', ['/usr/bin/node', '/Users/u/.wienerdog/launcher/launch.js', 'dream'])
      ),
      [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
        recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', '/Users/u/wd-dev/launcher/launch.js', 'catchup'])
      ),
    }),
  });
  assert.deepEqual(clean, [], 'Table D has exactly one, location-shaped mechanism — no `wd-` segment rule');
});

test("scheduler-leak-guard: the product's neutralizer env vars do NOT silence the observer", () => {
  // WIENERDOG_LOADER_NOOP and WIENERDOG_TEST_NO_REAL_SCHEDULER neutralize the
  // PRODUCT's loader. Honoring them here would let the leaking configuration
  // disable its own detector — and tests/run.js sets the second one for the
  // whole suite, so such a guard would be dead under CI.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M5');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  withGuardEnv({ guard: '1', noop: '1' }, () => {
    assert.equal(process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER, '1');
    assert.equal(process.env.WIENERDOG_LOADER_NOOP, '1');
    const calls = [];
    const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
      platform: 'darwin',
      uid: UID,
      notice: () => {},
      run: makeRun(calls, {
        [DOMAIN]: ok(domainPrint(['ai.wienerdog.catchup'])),
        [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
          recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', program, 'catchup'])
        ),
      }),
    });
    assert.equal(out.length, 1, 'the neutralizers must not silence the observer');
    assert.ok(out[0].startsWith(LEAK_PREFIX));
  });
});

test('scheduler-leak-guard: the loaded-record observer reads NO scheduler artifact file', () => {
  // The clean-looking plist must not be able to satisfy the observer: it was
  // correct for the whole incident. fs.realpathSync(os.tmpdir()) is outside
  // the spied set on purpose — it resolves a directory NAME and reads no
  // content.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M6');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const run = makeRun(calls, {
    [DOMAIN]: ok(domainPrint(['ai.wienerdog.catchup'])),
    [`${DOMAIN}/ai.wienerdog.catchup`]: ok(
      recordPrint('ai.wienerdog.catchup', ['/usr/bin/node', program, 'catchup'])
    ),
  });
  const realReadFileSync = fs.readFileSync;
  const realReaddirSync = fs.readdirSync;
  const realOpenSync = fs.openSync;
  let fsReads = 0;
  let out;
  try {
    fs.readFileSync = (...a) => {
      fsReads += 1;
      return realReadFileSync(...a);
    };
    fs.readdirSync = (...a) => {
      fsReads += 1;
      return realReaddirSync(...a);
    };
    fs.openSync = (...a) => {
      fsReads += 1;
      return realOpenSync(...a);
    };
    out = scg.assertNoLoadedSchedulerLeak(tempRoot, { platform: 'darwin', uid: UID, notice: () => {}, run });
  } finally {
    fs.readFileSync = realReadFileSync;
    fs.readdirSync = realReaddirSync;
    fs.openSync = realOpenSync;
  }
  assert.equal(fsReads, 0, 'the observer must consult no scheduler artifact file');
  assert.equal(out.length, 1);
  assert.ok(out[0].startsWith(LEAK_PREFIX));
});

test("scheduler-leak-guard: opts.platform 'linux' does not take the darwin arm", () => {
  // The operator-precedence trap: `(opts.platform || process.platform === 'darwin')`
  // is truthy for ANY non-empty opts.platform, including 'linux'.
  const notices = [];
  const calls = [];
  const run = (argv) => {
    calls.push([...argv]);
    throw new Error('the non-darwin arm must not invoke launchctl');
  };
  const notice = (m) => notices.push(m);

  const linux = scg.assertNoLoadedSchedulerLeak('/tmp/wd-nonexistent', { platform: 'linux', uid: UID, run, notice });
  assert.deepEqual(linux, []);
  assert.equal(calls.length, 0, "opts.platform 'linux' must not take the darwin arm");
  assert.equal(notices.length, 1, 'exactly one notice naming the linux residual');

  const win = scg.assertNoLoadedSchedulerLeak('/tmp/wd-nonexistent', { platform: 'win32', uid: UID, run, notice });
  assert.deepEqual(win, []);
  assert.equal(calls.length, 0);
  assert.equal(notices.length, 2, 'exactly one notice per call');
});

test('scheduler-leak-guard: a listed-then-unloaded label is skipped WITH a notice', () => {
  // 113 is launchd's "could not find service … in domain" — a genuine race
  // between the domain print and the record print. It is the ONLY tolerated
  // non-zero exit, and no disposition in Table A is silent.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M9');
  const notices = [];
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: (m) => notices.push(m),
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint(['ai.wienerdog.dream'])),
      [`${DOMAIN}/ai.wienerdog.dream`]: {
        status: 113,
        stdout: '',
        stderr: 'Could not find service "ai.wienerdog.dream" in domain for user gui: 501',
      },
    }),
  });
  assert.deepEqual(out, [], 'exit 113 is a skip, not a failure');
  assert.equal(notices.length, 1, 'the skip must PRINT');
  assert.ok(notices[0].includes('ai.wienerdog.dream'), `the notice names the label: ${notices[0]}`);
  assert.ok(notices[0].includes('113'), `the notice names the exit code: ${notices[0]}`);
});

test('scheduler-leak-guard: a temp-origin argument is classed LEAK, an unreadable record UNVERIFIABLE', () => {
  // The two class prefixes are how a human tells "your machine is poisoned"
  // from "this observer could not see". Both fail the run.
  const tempRoot = path.join(os.tmpdir(), 'wd-scenarios-M11');
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const label = 'ai.wienerdog.catchup';
  const forRecord = (recordResult) => {
    const calls = [];
    return scg.assertNoLoadedSchedulerLeak(tempRoot, {
      platform: 'darwin',
      uid: UID,
      notice: () => {},
      run: makeRun(calls, { [DOMAIN]: ok(domainPrint([label])), [`${DOMAIN}/${label}`]: recordResult }),
    });
  };

  const leak = forRecord(ok(recordPrint(label, ['/usr/bin/node', program, 'catchup'])));
  assert.equal(leak.length, 1);
  assert.ok(leak[0].startsWith(LEAK_PREFIX), `a temp-origin argument is a LEAK, got: ${leak[0]}`);

  const unreadable = [
    ['spawn error', { error: new Error('spawn /bin/launchctl EAGAIN'), status: null }],
    ['non-string stdout', { status: 0, stdout: undefined, stderr: '' }],
    ['no arguments block', ok([`${label} = {`, '\tactive count = 1', '}'].join('\n'))],
    ['unterminated arguments block', ok([`${label} = {`, '\targuments = {', `\t\t${program}`].join('\n'))],
  ];
  for (const [name, recordResult] of unreadable) {
    const out = forRecord(recordResult);
    assert.equal(out.length, 1, `${name} must yield exactly one failure`);
    assert.ok(out[0].startsWith(UNVERIFIABLE_PREFIX), `${name} → UNVERIFIABLE, got: ${out[0]}`);
    assert.ok(!out[0].startsWith(LEAK_PREFIX), `${name} is not evidence of a leak`);
  }
});

test('scheduler-leak-guard: two calls on the same canned input return identical results', () => {
  // Idempotent and read-only. A bare deepEqual(first, second) does NOT catch a
  // module-scope accumulator: both calls would return the SAME array object,
  // so `first` IS `second` and the comparison passes. Hence the snapshot, the
  // explicit cardinality, and notStrictEqual.
  const tempRoot = path.join(os.tmpdir(), 'wd-negative-UezlJP');
  const label = 'ai.wienerdog.catchup';
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const responses = {
    [DOMAIN]: ok(domainPrint([label])),
    [`${DOMAIN}/${label}`]: ok(recordPrint(label, ['/opt/homebrew/bin/node', program, 'catchup'])),
  };

  const callsA = [];
  const first = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(callsA, responses),
  });
  const firstSnapshot = structuredClone(first);
  const firstCalls = structuredClone(callsA);
  assert.equal(firstSnapshot.length, 1);
  assert.equal(firstSnapshot[0], expectedLeakMessage(label, program));

  const callsB = [];
  const second = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(callsB, responses),
  });
  assert.notStrictEqual(first, second, 'each call must return a FRESH array');
  assert.equal(second.length, 1);
  assert.deepEqual(second, firstSnapshot);
  assert.deepEqual(callsB, firstCalls);
});

test('scheduler-leak-guard: the LEAK message equals its contracted text exactly', () => {
  // EQUALITY, not properties of the string. Three earlier review rounds each
  // shipped a property-shaped assertion (source grep, absence-of-&&, marker
  // slicing) and each was evaded by a message that still stranded the user.
  // Equality subsumes the bootstrap-first ordering AND the unconditional `;`
  // separator without restating either, and no substring satisfiable from
  // elsewhere in the message can defeat it.
  const tempRoot = path.join(os.tmpdir(), 'wd-negative-UezlJP');
  const label = 'ai.wienerdog.catchup';
  const program = path.join(tempRoot, 'core', 'launcher', 'launch.js');
  const calls = [];
  const out = scg.assertNoLoadedSchedulerLeak(tempRoot, {
    platform: 'darwin',
    uid: UID,
    notice: () => {},
    run: makeRun(calls, {
      [DOMAIN]: ok(domainPrint([label])),
      [`${DOMAIN}/${label}`]: ok(recordPrint(label, ['/opt/homebrew/bin/node', program, 'catchup'])),
    }),
  });
  assert.equal(out.length, 1);
  assert.equal(out[0], expectedLeakMessage(label, program));
});
