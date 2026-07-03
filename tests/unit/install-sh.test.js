'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'install.sh');
const scriptText = fs.readFileSync(scriptPath, 'utf8');

// Absolute path to bash, resolved via the parent PATH. Tests that hand the
// child a restricted/exclusive PATH would otherwise strip `bash` itself from
// executable resolution; invoking it by absolute path sidesteps that.
const BASH =
  spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim() || 'bash';

/** Writes an executable bash shim at `dir/name` with the given body. */
function writeShim(dir, name, body) {
  const shimPath = path.join(dir, name);
  fs.writeFileSync(shimPath, `#!/usr/bin/env bash\n${body}\n`);
  fs.chmodSync(shimPath, 0o755);
  return shimPath;
}

/**
 * Like writeShim but with an absolute-path bash shebang, so the shim runs even
 * when the child's PATH is an exclusive stub dir with no `bash`/`env` on it.
 */
function writeShimAbs(dir, name, body) {
  const shimPath = path.join(dir, name);
  fs.writeFileSync(shimPath, `#!${BASH}\n${body}\n`);
  fs.chmodSync(shimPath, 0o755);
  return shimPath;
}

/** Writes a fake tty (a regular file whose first line is the injected answer). */
function writeFakeTty(dir, answer) {
  const ttyPath = path.join(dir, 'fake-tty');
  fs.writeFileSync(ttyPath, `${answer}\n`);
  return ttyPath;
}

/**
 * Runs install.sh with a stub PATH: `stubBin` first, then the real system PATH,
 * so `bash`/`uname` still resolve but our stub `node`/`npx` shims win.
 * @param {string} stubBin
 * @param {string[]} [args]
 */
function runInstallSh(stubBin, args = []) {
  const result = spawnSync('bash', [scriptPath, ...args], {
    env: { ...process.env, PATH: `${stubBin}:${process.env.PATH}` },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Sources install.sh with WIENERDOG_INSTALL_LIB=1 (so `main` does NOT run),
 * then evaluates `body` (which drives one engine function). Returns the spawn
 * result. `env` is merged over a base that includes the stub PATH.
 * @param {string} body
 * @param {{ pathPrefix?: string, exclusivePath?: string, env?: object }} [opts]
 */
function sourceAndRun(body, opts = {}) {
  const pathValue = opts.exclusivePath
    ? opts.exclusivePath
    : `${opts.pathPrefix ? opts.pathPrefix + ':' : ''}${process.env.PATH}`;
  const result = spawnSync(
    BASH,
    ['-c', `WIENERDOG_INSTALL_LIB=1 source "${scriptPath}"\n${body}`],
    {
      env: { ...process.env, PATH: pathValue, ...(opts.env || {}) },
      encoding: 'utf8',
    }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkStub(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin);
  return { root, stubBin };
}

// --- WP-016 tests kept (1: missing/old Node, 2: recent-Node handoff, 3: root) --

test('install-sh: missing/old Node exits 1 with nodejs.org guidance (idempotent)', () => {
  const { stubBin } = mkStub('wd-install-old-');
  writeShim(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo "v16.0.0"; exit 0; fi\nexit 1');

  const r = runInstallSh(stubBin);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nodejs\.org/);

  // Idempotency: a second run with the same environment exits identically.
  const r2 = runInstallSh(stubBin);
  assert.equal(r2.status, 1);
  assert.match(r2.stderr, /nodejs\.org/);
});

test('install-sh: recent Node hands off to npx wienerdog@latest init', () => {
  const { root, stubBin } = mkStub('wd-install-recent-');
  writeShim(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo "v20.0.0"; exit 0; fi\nexit 1');
  const argvFile = path.join(root, 'npx-argv.txt');
  writeShim(stubBin, 'npx', `echo "$@" > "${argvFile}"\nexit 0`);

  const r = runInstallSh(stubBin);
  assert.equal(r.status, 0);
  const recordedArgv = fs.readFileSync(argvFile, 'utf8').trim();
  assert.equal(recordedArgv, '--yes wienerdog@latest init');
});

// Running install.sh as EUID 0 isn't testable here without sudo/root, which
// CI does not have and this suite must not require. Instead we assert the
// root-check line is present in the script text.
test('install-sh: script text contains a root-user check', () => {
  assert.match(scriptText, /EUID/);
  assert.match(scriptText, /root/i);
});

// --- git is non-blocking: missing git still hands off (exit 0) with a note ----

test('install-sh: missing git prints a note but still hands off (exit 0)', () => {
  const { root, stubBin } = mkStub('wd-install-nogit-');
  // A curated PATH containing ONLY the stub bin: node/npx/uname are shimmed
  // (absolute shebang so they run with no bash on PATH), and git is
  // deliberately absent so `command -v git` fails.
  writeShimAbs(stubBin, 'uname', 'echo "Darwin"');
  writeShimAbs(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo "v20.0.0"; exit 0; fi\nexit 1');
  const argvFile = path.join(root, 'npx-argv.txt');
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${argvFile}"\nexit 0`);

  const result = spawnSync(BASH, [scriptPath], {
    env: { ...process.env, PATH: stubBin },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(argvFile, 'utf8').trim(), '--yes wienerdog@latest init');
  assert.match(result.stderr, /isn't installed/);
  assert.match(result.stderr, /xcode-select --install/);
});

// --- ADR-0011: no password capture (replaces the old forbidden-word test) ----

// The WP-016 "sudo/apt/brew never appear as commands" invariant is superseded
// by ADR-0011: the engine legitimately probes `sudo -n true` and detects
// `apt-get` via `command -v`. The binding invariant now is that the script
// never pipes a password to sudo (never `sudo -S`).
test('install-sh: never captures a password (no `sudo -S`)', () => {
  assert.doesNotMatch(scriptText, /sudo\s+-S\b/);
});

// --- consent_run branch matrix (fake tty + fake executor via sourcing seam) ---

/**
 * Drives consent_run once. `answer` is the tty content (or null for no tty),
 * `execRc` is the exit code the fake executor returns. Reports whether the
 * executor ran (marker file) and consent_run's return code.
 */
function driveConsentRun({ answer, execRc, noTty }) {
  const { root, stubBin } = mkStub('wd-consent-');
  const marker = path.join(root, 'ran.marker');
  const ttyPath = noTty
    ? path.join(root, 'does-not-exist')
    : writeFakeTty(root, answer);
  const body = [
    `fake_exec() { touch "${marker}"; return ${execRc}; }`,
    `if consent_run "Install Node 18+ now?" "sudo apt-get install -y nodejs npm" fake_exec; then`,
    `  echo "RC=0"`,
    `else`,
    `  echo "RC=$?"`,
    `fi`,
  ].join('\n');
  const r = sourceAndRun(body, {
    pathPrefix: stubBin,
    env: { WIENERDOG_TTY: ttyPath },
  });
  return { ...r, ranExec: fs.existsSync(marker) };
}

test('install-sh consent_run: answer "y" runs the executor and returns 0', () => {
  const r = driveConsentRun({ answer: 'y', execRc: 0 });
  assert.equal(r.ranExec, true);
  assert.match(r.stdout, /RC=0/);
});

test('install-sh consent_run: empty answer defaults to yes (executor runs)', () => {
  const r = driveConsentRun({ answer: '', execRc: 0 });
  assert.equal(r.ranExec, true);
  assert.match(r.stdout, /RC=0/);
});

test('install-sh consent_run: answer "n" declines — executor does not run, fallback printed', () => {
  const r = driveConsentRun({ answer: 'n', execRc: 0 });
  assert.equal(r.ranExec, false);
  assert.match(r.stdout, /RC=1/);
  assert.match(r.stderr, /To do this yourself/);
  assert.match(r.stderr, /sudo apt-get install -y nodejs npm/);
});

test('install-sh consent_run: unreachable tty — no prompt, executor does not run, fallback printed', () => {
  const r = driveConsentRun({ noTty: true, execRc: 0 });
  assert.equal(r.ranExec, false);
  assert.match(r.stdout, /RC=1/);
  assert.doesNotMatch(r.stderr, /About to run/);
  assert.match(r.stderr, /To do this yourself/);
  assert.match(r.stderr, /sudo apt-get install -y nodejs npm/);
});

test('install-sh consent_run: executor fails — fallback printed, returns 1', () => {
  const r = driveConsentRun({ answer: 'y', execRc: 1 });
  assert.equal(r.ranExec, true); // executor was invoked...
  assert.match(r.stdout, /RC=1/); // ...but failed, so consent_run returns 1
  assert.match(r.stderr, /To do this yourself/);
  assert.match(r.stderr, /sudo apt-get install -y nodejs npm/);
});

// --- detect_pm ---------------------------------------------------------------

test('install-sh detect_pm: apt-get on PATH wins the cascade', () => {
  const { stubBin } = mkStub('wd-pm-');
  writeShim(stubBin, 'apt-get', 'exit 0');
  const r = sourceAndRun('detect_pm; echo "$PM"', { pathPrefix: stubBin });
  assert.match(r.stdout, /^apt-get$/m);
});

// --- detect_sudo_mode (all three states) -------------------------------------

test('install-sh detect_sudo_mode: passwordless when `sudo -n true` succeeds', () => {
  const { stubBin } = mkStub('wd-sudo-pw-');
  writeShim(stubBin, 'sudo', 'exit 0');
  const r = sourceAndRun('detect_sudo_mode; echo "$SUDO_MODE"', { pathPrefix: stubBin });
  assert.match(r.stdout, /^passwordless$/m);
});

test('install-sh detect_sudo_mode: needs-password when `sudo -n true` fails', () => {
  const { stubBin } = mkStub('wd-sudo-np-');
  writeShim(stubBin, 'sudo', 'exit 1');
  const r = sourceAndRun('detect_sudo_mode; echo "$SUDO_MODE"', { pathPrefix: stubBin });
  assert.match(r.stdout, /^needs-password$/m);
});

test('install-sh detect_sudo_mode: none when sudo is absent from PATH', () => {
  // Exclusive PATH of an empty stub dir → `command -v sudo` fails.
  const { stubBin } = mkStub('wd-sudo-none-');
  const r = sourceAndRun('detect_sudo_mode; echo "$SUDO_MODE"', { exclusivePath: stubBin });
  assert.match(r.stdout, /^none$/m);
});

// --- tty_reachable -----------------------------------------------------------

test('install-sh tty_reachable: regular-file WIENERDOG_TTY returns 0; nonexistent returns 1', () => {
  const { root } = mkStub('wd-tty-');
  const ttyPath = writeFakeTty(root, 'y');
  const reachable = sourceAndRun('if tty_reachable; then echo YES; else echo NO; fi', {
    env: { WIENERDOG_TTY: ttyPath },
  });
  assert.match(reachable.stdout, /YES/);

  const missing = sourceAndRun('if tty_reachable; then echo YES; else echo NO; fi', {
    env: { WIENERDOG_TTY: path.join(root, 'nope') },
  });
  assert.match(missing.stdout, /NO/);
});

// --- resolve_bin -------------------------------------------------------------

test('install-sh resolve_bin: prints the absolute path when NAME is in a given DIR', () => {
  const { root } = mkStub('wd-resolve-');
  const binDir = path.join(root, 'nodebin');
  fs.mkdirSync(binDir);
  writeShim(binDir, 'node', 'echo v20');
  const r = sourceAndRun(`resolve_bin node "${binDir}"`, {});
  assert.match(r.stdout.trim(), new RegExp(`${binDir}/node$`));
  assert.equal(r.status, 0);
});

test('install-sh resolve_bin: returns non-zero when NAME is nowhere', () => {
  const { root, stubBin } = mkStub('wd-resolve-miss-');
  const emptyDir = path.join(root, 'empty');
  fs.mkdirSync(emptyDir);
  // Exclusive PATH of an empty stub dir so no real `node` resolves either.
  const r = sourceAndRun(`resolve_bin node "${emptyDir}"`, { exclusivePath: stubBin });
  assert.notEqual(r.status, 0);
});
