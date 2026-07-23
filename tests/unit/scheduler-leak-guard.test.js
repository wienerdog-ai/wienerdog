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
