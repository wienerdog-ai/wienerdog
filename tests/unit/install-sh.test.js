'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
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
function runInstallSh(stubBin, args = [], extraEnv = {}) {
  const result = spawnSync('bash', [scriptPath, ...args], {
    env: { ...process.env, PATH: `${stubBin}:${process.env.PATH}`, ...extraEnv },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

// Bash snippet that REDEFINES tty_dev to point at `ttyPath`. This is the ONLY
// way tests inject a fake terminal now that the WIENERDOG_TTY env seam is gone
// (WP-094): production tty_dev returns the literal /dev/tty and consults no
// environment, so a fake tty can only be introduced by executing code that
// redefines the function after sourcing the library — an ambient variable
// cannot. Prepended to the sourced body by sourceAndRun/sourceAndMain.
const ttyDevRedef = (ttyPath) => `tty_dev() { printf '%s' "${ttyPath}"; }\n`;

/**
 * Sources install.sh with WIENERDOG_INSTALL_LIB=1 (so `main` does NOT run),
 * then evaluates `body` (which drives one engine function). Returns the spawn
 * result. `env` is merged over a base that includes the stub PATH. When
 * `ttyDev` is given, a tty_dev redefinition pointing at it is prepended to the
 * body (fake-terminal injection without any env seam).
 * @param {string} body
 * @param {{ pathPrefix?: string, exclusivePath?: string, env?: object, ttyDev?: string }} [opts]
 */
function sourceAndRun(body, opts = {}) {
  const pathValue = opts.exclusivePath
    ? opts.exclusivePath
    : `${opts.pathPrefix ? opts.pathPrefix + ':' : ''}${process.env.PATH}`;
  const fullBody = (opts.ttyDev ? ttyDevRedef(opts.ttyDev) : '') + body;
  const result = spawnSync(
    BASH,
    ['-c', `WIENERDOG_INSTALL_LIB=1 source "${scriptPath}"\n${fullBody}`],
    {
      env: { ...process.env, PATH: pathValue, ...(opts.env || {}) },
      encoding: 'utf8',
    }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/**
 * Drives the WHOLE script via the sourcing seam: source the library (main does
 * NOT auto-run under WIENERDOG_INSTALL_LIB=1), redefine tty_dev to point at
 * `ttyDev` (fake terminal, or a nonexistent path to force no-tty), then call
 * `main "$@"`. This replaces `bash install.sh …` for full-script tests now that
 * the WIENERDOG_TTY env seam is gone: the terminal source can only be injected
 * by executing code, never by an environment variable.
 * @param {string[]} args positional args forwarded to main
 * @param {{ pathValue: string, ttyDev?: string, env?: object }} opts
 */
function sourceAndMain(args = [], opts = {}) {
  const body =
    `WIENERDOG_INSTALL_LIB=1 source "${scriptPath}"\n` +
    (opts.ttyDev ? ttyDevRedef(opts.ttyDev) : '') +
    'main "$@"';
  const result = spawnSync(BASH, ['-c', body, 'bash', ...args], {
    env: { ...process.env, PATH: opts.pathValue, ...(opts.env || {}) },
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkStub(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin);
  return { root, stubBin };
}

// --- WP-035: hermetic system-binary dir (usr-merge-safe PATH curation) -------
//
// Debian/Ubuntu's usr-merge makes `/bin` a symlink to `/usr/bin`, so any curated
// PATH that included either (e.g. `stubBin:/bin`) exposed the CI runner's REAL
// git/node and defeated the test's stubs — green on macOS (where `/bin` is
// genuinely minimal), red on ubuntu-latest. hermeticBinDir sidesteps this by
// symlinking ONLY the specific system binaries a test group legitimately needs,
// resolved via `command -v` against the outer (uncurated) PATH, into a fresh
// directory that is never named `/bin` or `/usr/bin`. git/node/npx/brew/sudo/PM
// binaries are never included here — those come from a test's own stub, or are
// deliberately left absent.

/**
 * @param {string[]} names system binaries to expose (e.g. 'mktemp', 'grep')
 * @returns {string} absolute path to a directory containing only those binaries
 */
function hermeticBinDir(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-hermetic-'));
  for (const name of names) {
    const resolved = spawnSync(BASH, ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();
    if (resolved) fs.symlinkSync(resolved, path.join(dir, name));
  }
  return dir;
}

// Sanity guard: the technique only works if a hermetic dir truly cannot resolve
// git or node. Self-tests that on THIS box, right now, before any test relies
// on it.
test('install-sh test harness: hermeticBinDir cannot resolve git or node (usr-merge sanity guard)', () => {
  const dir = hermeticBinDir(['mktemp', 'grep', 'head']);
  assert.doesNotMatch(dir, /(^|:)\/usr\/bin(:|$)/);
  assert.doesNotMatch(dir, /(^|:)\/bin(:|$)/);
  const probe = spawnSync(
    BASH,
    ['-c', 'command -v git >/dev/null 2>&1 && exit 0; command -v node >/dev/null 2>&1 && exit 0; exit 1'],
    { env: { PATH: dir }, encoding: 'utf8' }
  );
  assert.equal(probe.status, 1, 'neither git nor node may resolve under a hermetic PATH');
});

// --- WP-016 tests kept (1: missing/old Node, 2: recent-Node handoff, 3: root) --

test('install-sh: missing/old Node exits 1 with nodejs.org guidance (idempotent)', () => {
  const { root, stubBin } = mkStub('wd-install-old-');
  writeShim(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo "v16.0.0"; exit 0; fi\nexit 1');
  // Force no-tty (tty_dev → a nonexistent path) so the (now consented) macOS/
  // Linux install path deterministically falls through to print-the-command and
  // never blocks on the real /dev/tty.
  const run = () =>
    sourceAndMain([], {
      pathValue: `${stubBin}:${process.env.PATH}`,
      ttyDev: path.join(root, 'no-tty'),
    });

  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nodejs\.org/);

  // Idempotency: a second run with the same environment exits identically.
  const r2 = run();
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

  // No-tty (tty_dev → a nonexistent path) so the (now consented) CLT offer
  // declines to print-and-proceed rather than blocking on /dev/tty.
  const result = sourceAndMain([], {
    pathValue: stubBin,
    ttyDev: path.join(root, 'no-tty'),
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

// --- WP-094: network-integrity hardening (grep-assertable on the script text) --

// Every remote curl that fetches registry metadata, the tarball, or nodejs.org
// content pins the scheme with `--proto '=https' --proto-redir '=https'`, so a
// redirect to a non-HTTPS URL fails instead of enabling a checksum-valid
// downgrade. (The NodeSource nested-script hop is out of scope — WP-094.)
test('install-sh: registry/tarball/nodejs.org curls are pinned to HTTPS (--proto/--proto-redir)', () => {
  // The nodejs.org index scrape (resolve_node_pkg_url).
  assert.match(
    scriptText,
    /curl --proto '=https' --proto-redir '=https' -fsSL https:\/\/nodejs\.org\/dist\/latest\//
  );
  // The Node .pkg download (install_node_pkg) — to a LOCAL file, then installer.
  assert.match(
    scriptText,
    /curl --proto '=https' --proto-redir '=https' -fSL -o "\$pkg" "\$url"/
  );
  // The registry-tarball download (do_tarball_install).
  assert.match(
    scriptText,
    /curl --proto '=https' --proto-redir '=https' -fSL "\$url" -o "\$tmp\/wd\.tgz"/
  );
  // The registry metadata fetch (install_via_tarball).
  assert.match(
    scriptText,
    /curl --proto '=https' --proto-redir '=https' -fsSL "https:\/\/registry\.npmjs\.org\/wienerdog\/latest"/
  );
});

// The WIENERDOG_TTY env seam is GONE from the production script: tty_dev returns
// the literal /dev/tty and consults no environment, so no ambient variable can
// redirect the consent-prompt read to an attacker-prepared file.
test('install-sh: no WIENERDOG_TTY env seam remains; tty_dev returns literal /dev/tty', () => {
  assert.doesNotMatch(scriptText, /WIENERDOG_TTY/);
  assert.match(scriptText, /tty_dev\(\)\s*\{/);
  assert.match(scriptText, /printf '%s' "\/dev\/tty"/);
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
    ttyDev: ttyPath,
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

test('install-sh tty_reachable: a redefined tty_dev pointing at a regular file returns 0; nonexistent returns 1', () => {
  const { root } = mkStub('wd-tty-');
  const ttyPath = writeFakeTty(root, 'y');
  const reachable = sourceAndRun('if tty_reachable; then echo YES; else echo NO; fi', {
    ttyDev: ttyPath,
  });
  assert.match(reachable.stdout, /YES/);

  const missing = sourceAndRun('if tty_reachable; then echo YES; else echo NO; fi', {
    ttyDev: path.join(root, 'nope'),
  });
  assert.match(missing.stdout, /NO/);
});

// WP-094: production tty_dev consults NO environment — an ambient WIENERDOG_TTY
// (or any env var) can never redirect the consent-prompt read away from the real
// controlling terminal. Setting it here must have zero effect: tty_dev still
// prints the literal /dev/tty.
test('install-sh tty_dev: ignores any ambient WIENERDOG_TTY and returns literal /dev/tty', () => {
  const r = sourceAndRun('tty_dev; echo', {
    env: { WIENERDOG_TTY: path.join(os.tmpdir(), 'attacker-tty') },
  });
  assert.equal(r.stdout.trim(), '/dev/tty');
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

// --- WP-032: macOS consented auto-install actions ----------------------------
//
// These drive the full script with a curated PATH: `stubBin` first (so our
// fakes for uname/curl/sudo/installer/brew/xcode-select/node/npx/git win), then
// a minimal system path for real coreutils (mktemp/grep/head/rm/sleep). No test
// invokes real sudo/installer/xcode-select/brew or a real terminal.

/**
 * Runs install.sh with `stubBin:sysPath`; injects a fake terminal by redefining
 * tty_dev to `tty` (via the sourcing seam), so no WIENERDOG_TTY env seam is used.
 */
function runMacInstall(stubBin, sysPath, { tty, env = {} } = {}) {
  return sourceAndMain([], { pathValue: `${stubBin}:${sysPath}`, ttyDev: tty, env });
}

/** Shell snippet (for embedding in another shim) that writes a `node` shim. */
function nodeShim(dir, version) {
  return `cat > "${dir}/node" <<'NODE'\n#!${BASH}\nif [ "$1" = "-v" ]; then echo ${version}; fi\nNODE\nchmod +x "${dir}/node"`;
}

/** Writes a `node` shim file directly (a pre-existing, already-installed Node). */
function nodeShimFile(dir, version) {
  return writeShimAbs(dir, 'node', `if [ "$1" = "-v" ]; then echo ${version}; fi`);
}

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);

// Hermetic system-bin dirs (WP-035), replacing the old `/usr/bin:/bin` literals
// (which usr-merge turns into the same real directory on Ubuntu, leaking the
// runner's REAL git/node past every stub). Derived empirically: driving the
// affected tests with an empty PATH and adding exactly what failed to resolve.
// Node tests need `bash` (the curl/sudo/installer/brew shims below use
// `#!/usr/bin/env bash`, which resolves `bash` via PATH) plus the coreutils
// `install_node_pkg` shells out to. git/node/npx/brew/sudo/installer/curl/
// uname/xcode-select are never included — those come from a test's own stub,
// or are deliberately left absent so `command -v` fails until a fake install
// creates them.
const HERMETIC_SYS_BIN_NODE = hermeticBinDir(['bash', 'mktemp', 'grep', 'head', 'rm', 'rmdir']);
// The git-via-CLT tests below shim every binary the script touches with an
// absolute-path shebang (`writeShimAbs`), so no real system binary is needed at
// all — an empty hermetic dir keeps `command -v git` failing until the fake
// CLT install "creates" it, on macOS AND on usr-merged Ubuntu alike.
const HERMETIC_SYS_BIN_GIT = hermeticBinDir([]);

// WP-035 acceptance criterion: the curated PATHs actually used by the macOS/
// Linux test groups above must contain neither `/bin` nor `/usr/bin` — the two
// components that are the SAME real directory on usr-merged Ubuntu and would
// leak the runner's real git/node past every stub.
test('install-sh test harness: hermetic system-bin dirs exclude /bin and /usr/bin', () => {
  for (const dir of [HERMETIC_SYS_BIN_NODE, HERMETIC_SYS_BIN_GIT]) {
    assert.doesNotMatch(dir, /(^|:)\/usr\/bin(:|$)/);
    assert.doesNotMatch(dir, /(^|:)\/bin(:|$)/);
  }
});

// The two Node-install *success* tests drive `ensure_node` directly through the
// sourcing seam rather than the whole script: `resolve_bin`'s hardcoded macOS
// dirs (/opt/homebrew/bin, /usr/local/bin) may hold a REAL node on the test box,
// which would shadow the fake and let `main` exec the REAL `npx wienerdog` — a
// forbidden real install. Driving ensure_node stops at the (fake) install +
// resolve and never reaches the handoff. The npx handoff itself is proven
// cleanly by the git tests below, whose curated PATH excludes the real dirs.
test('install-sh macOS: Node via .pkg, consent yes → sudo installer -pkg … -target / invoked', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-yes-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  // curl: records argv; with -o it "downloads" (creates the target); else it
  // lists one .pkg (the index scrape resolve_node_pkg_url parses).
  writeShim(
    stubBin,
    'curl',
    `echo "$@" >> "${curlArgv}"\n` +
      'dl=""\nprev=""\nfor a in "$@"; do\n  if [ "$prev" = "-o" ]; then : > "$a"; dl=1; fi\n  prev="$a"\ndone\nif [ -n "$dl" ]; then exit 0; fi\necho "node-v26.4.0.pkg"'
  );
  writeShim(stubBin, 'sudo', `echo "$@" >> "${sudoArgv}"\nexec "$@"`);
  writeShim(
    stubBin,
    'installer',
    `echo "$@" >> "${installerArgv}"\n${nodeShim(stubBin, 'v22.4.1')}\nexit 0`
  );
  const tty = writeFakeTty(root, 'y');

  // Exclusive PATH: stubBin (fakes) + coreutils; no brew → the .pkg branch.
  const r = sourceAndRun('os=Darwin\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: `${stubBin}:${HERMETIC_SYS_BIN_NODE}`,
    ttyDev: tty,
  });
  assert.match(r.stdout, /RC=0/); // install succeeded, node resolved
  // WP-094 (+P2 round 2): the consent line is a SELF-CONTAINED, copy-paste-usable
  // two-step command — it makes its OWN temp via `mktemp`, quotes the dynamic path
  // as "$f" (so a whitespace/metachar TMPDIR is safe), quotes the resolved URL,
  // and references NO script-internal path that could already be cleaned up.
  // `installer -pkg` is fed a LOCAL file ("$f"), never a URL.
  const resolvedUrl = 'https://nodejs.org/dist/latest/node-v26.4.0.pkg';
  const urlRe = resolvedUrl.replace(/[./]/g, (c) => '\\' + c);
  // Self-contained temp creation with the resolved basename:
  assert.match(r.stderr, /f="\$\(mktemp -d\)\/node-v26\.4\.0\.pkg"/);
  // HTTPS-pinned download to the QUOTED "$f" from the QUOTED resolved URL:
  assert.match(
    r.stderr,
    new RegExp(`curl --proto '=https' --proto-redir '=https' -fSL -o "\\$f" "${urlRe}"`)
  );
  // installer runs on the LOCAL quoted "$f", never a URL, no leftover placeholder,
  // and no reference to the old script-internal pkg_file path:
  assert.match(r.stderr, /sudo installer -pkg "\$f" -target \//);
  assert.doesNotMatch(r.stderr, /installer -pkg https?:\/\//);
  assert.doesNotMatch(r.stderr, /pkg_file/);
  assert.doesNotMatch(r.stderr, /<official nodejs\.org/);
  const inst = readIf(installerArgv);
  assert.ok(inst, 'installer must have been invoked');
  assert.match(inst, /-pkg \S*\/node-v26\.4\.0\.pkg -target \//); // installed a LOCAL file
  assert.doesNotMatch(inst, /-pkg https?:\/\//); // never handed installer a URL
  assert.match(readIf(sudoArgv) || '', /installer/); // sudo carried the installer
  // …and the actual download fetched exactly the resolved URL into a local file.
  assert.match(readIf(curlArgv) || '', new RegExp(`-o \\S*/node-v26\\.4\\.0\\.pkg ${urlRe}`));
});

test('install-sh macOS: Node via .pkg, consent no → installer NOT run, fallback + exit 1', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-no-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Darwin');
  writeShimAbs(stubBin, 'git', 'exit 0');
  writeShimAbs(stubBin, 'curl', 'echo "node-v26.4.0.pkg"');
  writeShimAbs(stubBin, 'sudo', 'exec "$@"');
  writeShimAbs(stubBin, 'installer', `echo "$@" >> "${installerArgv}"\nexit 0`);
  const tty = writeFakeTty(root, 'n');

  const r = runMacInstall(stubBin, HERMETIC_SYS_BIN_NODE, { tty });
  assert.equal(r.status, 1);
  assert.equal(readIf(installerArgv), null); // installer never invoked
  assert.match(r.stderr, /sudo installer/);
  assert.match(r.stderr, /nodejs\.org/);
});

test('install-sh macOS: Node via .pkg, no tty → no prompt, installer NOT run, fallback + exit 1', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-notty-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Darwin');
  writeShimAbs(stubBin, 'git', 'exit 0');
  writeShimAbs(stubBin, 'installer', `echo "$@" >> "${installerArgv}"\nexit 0`);

  const r = runMacInstall(stubBin, HERMETIC_SYS_BIN_NODE, { tty: path.join(root, 'no-tty') });
  assert.equal(r.status, 1);
  assert.equal(readIf(installerArgv), null);
  assert.doesNotMatch(r.stderr, /About to run/);
  assert.match(r.stderr, /sudo installer/);
  assert.match(r.stderr, /nodejs\.org/);
});

test('install-sh macOS: Node via brew when brew present → `brew install node`, no .pkg', () => {
  const { root, stubBin } = mkStub('wd-mac-brew-');
  const brewArgv = path.join(root, 'brew-argv.txt');
  const installerArgv = path.join(root, 'installer-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  writeShim(
    stubBin,
    'brew',
    `echo "$@" >> "${brewArgv}"\nif [ "$1" = "install" ]; then\n${nodeShim(stubBin, 'v22.4.1')}\nfi\nexit 0`
  );
  // If the .pkg path were wrongly taken these would record; they must not.
  writeShim(stubBin, 'installer', `echo "$@" >> "${installerArgv}"\nexit 0`);
  writeShim(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\necho "node-v26.4.0.pkg"`);
  const tty = writeFakeTty(root, 'y');

  const r = sourceAndRun('os=Darwin\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: `${stubBin}:${HERMETIC_SYS_BIN_NODE}`,
    ttyDev: tty,
  });
  assert.match(r.stdout, /RC=0/);
  assert.match(readIf(brewArgv), /install node/);
  assert.equal(readIf(installerArgv), null); // .pkg path not taken
  assert.equal(readIf(curlArgv), null); // no nodejs.org download when brew present
});

test('install-sh macOS: Node install failure (installer non-zero) → fallback + exit 1', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-fail-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Darwin');
  writeShimAbs(stubBin, 'git', 'exit 0');
  writeShimAbs(
    stubBin,
    'curl',
    'dl=""\nprev=""\nfor a in "$@"; do\n  if [ "$prev" = "-o" ]; then : > "$a"; dl=1; fi\n  prev="$a"\ndone\nif [ -n "$dl" ]; then exit 0; fi\necho "node-v26.4.0.pkg"'
  );
  writeShimAbs(stubBin, 'sudo', 'exec "$@"');
  writeShimAbs(stubBin, 'installer', `echo "$@" >> "${installerArgv}"\nexit 1`); // install fails
  const tty = writeFakeTty(root, 'y');

  const r = runMacInstall(stubBin, HERMETIC_SYS_BIN_NODE, { tty });
  assert.equal(r.status, 1);
  assert.ok(readIf(installerArgv), 'installer was invoked but failed');
  assert.match(r.stderr, /sudo installer/);
  assert.match(r.stderr, /nodejs\.org/);
});

// Driven through the sourcing seam with HERMETIC_RESOLVE_BIN, like the Node
// success cases above (WP-036 class, macOS mirror): a full-script run would hit
// the real `resolve_bin git /usr/bin /usr/local/bin /opt/homebrew/bin`, and the
// GitHub macOS image preinstalls Homebrew git, so /opt/homebrew/bin — which also
// holds a REAL node + npx — gets prepended ahead of the stubs; main then execs
// the REAL `npx wienerdog@latest init` (a forbidden real install; it exits 254
// because npm can't spawn `sh` on the curated PATH). Green on dev boxes only
// when /opt/homebrew/bin happens to lack git. The npx handoff after ensure_git
// is proven by the CLT-timeout test below on a PATH that never gets real dirs
// prepended. The old shim also created git via `cat`/`chmod`, which are absent
// from the curated PATH — the redirection left a non-executable empty file that
// only "resolved" because bash's `command -v` matches non-executable files;
// printf (a builtin) plus a hermetic chmod now build a real executable fake.
test('install-sh macOS: git via CLT, consent yes, install completes → git resolves', () => {
  const { root, stubBin } = mkStub('wd-mac-clt-ok-');
  writeShimAbs(stubBin, 'sleep', 'exit 0'); // instant poll
  // `--install` makes git appear; `-p` reports the CLT path is present.
  writeShimAbs(
    stubBin,
    'xcode-select',
    `if [ "$1" = "-p" ]; then exit 0; fi\n` +
      `if [ "$1" = "--install" ]; then printf '#!%s\\nexit 0\\n' "${BASH}" > "${stubBin}/git"; chmod +x "${stubBin}/git"; fi\n` +
      `exit 0`
  );
  const tty = writeFakeTty(root, 'y');

  const r = sourceAndRun(
    HERMETIC_RESOLVE_BIN +
      'os=Darwin\nif ensure_git; then echo RC=0; else echo RC=$?; fi\ncommand -v git',
    {
      exclusivePath: `${stubBin}:${hermeticBinDir(['chmod'])}`,
      ttyDev: tty,
      env: { WIENERDOG_CLT_POLL: '1', WIENERDOG_CLT_TIMEOUT: '5' },
    }
  );
  assert.match(r.stdout, /RC=0/);
  // The fake CLT install created git and it resolves on the stub PATH.
  assert.ok(r.stdout.includes(`${stubBin}/git`), `git did not resolve to the stub: ${r.stdout}`);
  assert.doesNotMatch(r.stderr, /isn't installed/); // success path, not the note
});

test('install-sh macOS: git via CLT times out → note printed, still hands off (exit 0)', () => {
  const { root, stubBin } = mkStub('wd-mac-clt-timeout-');
  const npxArgv = path.join(root, 'npx-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Darwin');
  nodeShimFile(stubBin, 'v20.0.0');
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${npxArgv}"\nexit 0`);
  writeShimAbs(stubBin, 'sleep', 'exit 0');
  // `-p` never succeeds and git is never created → poll times out.
  writeShimAbs(stubBin, 'xcode-select', 'if [ "$1" = "-p" ]; then exit 1; fi\nexit 0');
  const tty = writeFakeTty(root, 'y');

  const r = runMacInstall(stubBin, HERMETIC_SYS_BIN_GIT, {
    tty,
    env: { WIENERDOG_CLT_POLL: '1', WIENERDOG_CLT_TIMEOUT: '1' },
  });
  // git alone NEVER causes exit 1 — Node is the only hard gate.
  assert.equal(r.status, 0);
  assert.equal(readIf(npxArgv).trim(), '--yes wienerdog@latest init');
  assert.match(r.stderr, /isn't installed/);
  assert.match(r.stderr, /xcode-select --install/);
});

// --- unit-drive the EXEC_FNs directly (failure branches) via the sourcing seam

test('install-sh macOS resolve_node_pkg_url: empty listing → no URL; install_node_pkg with no URL → non-zero', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-unit-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  writeShim(stubBin, 'curl', 'exit 0'); // index lists nothing → no .pkg found
  writeShim(stubBin, 'installer', `echo ran >> "${installerArgv}"\nexit 0`);
  // The resolver yields no URL when the index has no .pkg…
  const resolved = sourceAndRun('printf "[%s]" "$(resolve_node_pkg_url)"', { pathPrefix: stubBin });
  assert.match(resolved.stdout, /\[\]/);
  // …and install_node_pkg refuses (returns non-zero) when handed no URL, never
  // reaching sudo installer.
  const r = sourceAndRun('if install_node_pkg ""; then echo RC=0; else echo RC=$?; fi', {
    pathPrefix: stubBin,
  });
  assert.match(r.stdout, /RC=1/);
  assert.equal(readIf(installerArgv), null); // never reached sudo installer
});

// WP-094 P2 round 2 (#3): a `mktemp -d` failure during the .pkg install must NOT
// abort the script (set -e); install_node_pkg returns non-zero, so consent_run
// prints the self-contained manual fallback and ensure_node exits 1 cleanly.
test('install-sh macOS: mktemp failure during .pkg install → self-contained fallback, no abort, installer not run', () => {
  const { root, stubBin } = mkStub('wd-mac-pkg-mktemp-fail-');
  const installerArgv = path.join(root, 'installer-argv.txt');
  writeShim(stubBin, 'curl', 'echo "node-v26.4.0.pkg"'); // index scrape resolves the URL
  writeShim(stubBin, 'mktemp', 'exit 1'); // temp creation fails → install_node_pkg returns 1
  writeShim(stubBin, 'installer', `echo ran >> "${installerArgv}"\nexit 0`);
  const tty = writeFakeTty(root, 'y');

  const r = sourceAndRun('os=Darwin\nensure_node', {
    exclusivePath: `${stubBin}:${HERMETIC_SYS_BIN_NODE}`,
    ttyDev: tty,
  });
  assert.equal(r.status, 1); // printed the fallback and exited 1, did NOT abort abruptly
  // The printed fallback is the SELF-CONTAINED manual command (its own mktemp)…
  assert.match(r.stderr, /f="\$\(mktemp -d\)\/node-v26\.4\.0\.pkg"/);
  assert.match(r.stderr, /sudo installer -pkg "\$f" -target \//);
  assert.equal(readIf(installerArgv), null); // temp failed before any install
});

test('install-sh macOS install_git_macos: poll times out → returns 1 (bounded, no hang)', () => {
  const { stubBin } = mkStub('wd-mac-clt-unit-');
  writeShim(stubBin, 'xcode-select', 'if [ "$1" = "-p" ]; then exit 1; fi\nexit 0');
  writeShim(stubBin, 'sleep', 'exit 0'); // instant
  // Exclusive stub PATH so the real /usr/bin/git can't satisfy `command -v git`.
  const r = sourceAndRun('if install_git_macos; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
    env: { WIENERDOG_CLT_POLL: '1', WIENERDOG_CLT_TIMEOUT: '1' },
  });
  assert.match(r.stdout, /RC=1/);
});

// --- structural guarantees (ADR-0011: every install action is consent-gated) --

test('install-sh macOS: every install action is reached only via consent_run', () => {
  // Each real invocation (command at line start) appears exactly once — inside
  // its EXEC_FN. The DISPLAY strings are quoted/echoed, so they don't match.
  assert.equal((scriptText.match(/^\s*xcode-select --install\b/gm) || []).length, 1);
  assert.equal((scriptText.match(/^\s*brew install node\b/gm) || []).length, 1);
  assert.equal((scriptText.match(/^\s*sudo installer -pkg\b/gm) || []).length, 1);
  // …and each EXEC_FN is passed to consent_run.
  assert.match(scriptText, /consent_run[\s\S]{0,160}?install_git_macos/);
  assert.match(scriptText, /consent_run[\s\S]{0,160}?install_node_brew/);
  assert.match(scriptText, /consent_run[\s\S]{0,160}?install_node_pkg/);
});

test('install-sh macOS: Homebrew is never bootstrapped (no Homebrew-installer URL fetched)', () => {
  assert.doesNotMatch(scriptText, /Homebrew\/install/i);
  assert.doesNotMatch(scriptText, /brew\.sh\/install/i);
  assert.doesNotMatch(scriptText, /raw\.githubusercontent[^\n]*Homebrew/i);
});

// --- WP-033: Linux consented auto-install actions ----------------------------
//
// Like the macOS tests, but the OS is forced to Linux and a fake package manager
// + fake `sudo`/`curl` stand in for real installs. No test invokes real sudo, a
// real package manager, real network, or a real terminal.
//
// The Node-install cases drive `ensure_node` directly through the sourcing seam
// (not the whole script) and prepend HERMETIC_RESOLVE_BIN so the stub on the
// exclusive PATH wins: `resolve_bin`'s hardcoded dirs (/usr/bin, /usr/local/bin)
// DO hold a real recent `node` on ubuntu-latest (/usr/local/bin/node), which
// would otherwise shadow the fake. Driving ensure_node also stops before the npx
// handoff, which is proven cleanly by the git tests below, whose exclusive stub
// PATH excludes every real binary.

// Fake `sudo`: answers the passwordless probe, strips leading flags/env-var
// assignments (so `sudo VAR=v cmd` and `sudo -E cmd` work like the real thing),
// then execs the remaining command. Records every argv line for assertions.
function writeLinuxSudo(stubBin, sudoArgv) {
  writeShimAbs(
    stubBin,
    'sudo',
    `echo "$@" >> "${sudoArgv}"\n` +
      `if [ "$1" = "-n" ] && [ "$2" = "true" ]; then exit 0; fi\n` +
      `while [ "$#" -gt 0 ]; do case "$1" in -*|*=*) shift ;; *) break ;; esac; done\n` +
      `exec "$@"`
  );
}

// Fake `node` whose reported version is read from `verFile` (so a fake PM
// "install" can set the version by writing that file). Absent file → v0.0.0
// (an "old" Node), which routes ensure_node into the Linux install flow.
function writeNodeTemplate(stubBin, verFile) {
  writeShimAbs(
    stubBin,
    'node',
    `if [ "$1" = "-v" ]; then v="v0.0.0"; [ -e "${verFile}" ] && v="$(< "${verFile}")"; echo "$v"; fi`
  );
}

// ensure_node calls `resolve_bin node /usr/bin /usr/local/bin`, which scans those
// dirs *directly* (bypassing PATH) to pick up a freshly-installed binary. The
// ubuntu-latest runner ships a real Node at /usr/local/bin/node, so after a fake
// PM "install" leaves the stub reporting an OLD version, resolve_bin finds that
// real (recent) node, prepends /usr/local/bin to PATH, and node_is_recent turns
// true — silently skipping the old-Node NodeSource/fallback paths these tests
// exercise. Green on macOS only because no recent /usr/local/bin/node exists
// there. WP-035's PATH curation can't catch this (resolve_bin never consults
// PATH). Prepending this override makes the stub on the exclusive PATH
// authoritative — exactly how these tests already behave on macOS. resolve_bin's
// real dir-scan is covered by its own tests above. (Also used by the macOS
// git-via-CLT success test above — same class, mirrored: the macOS image
// preinstalls Homebrew git, so /opt/homebrew/bin with its real node/npx would
// get prepended.)
const HERMETIC_RESOLVE_BIN = 'resolve_bin() { command -v "$1"; }\n';

test('install-sh Linux node_is_recent: v18→0, v16→1, missing→1', () => {
  const { root, stubBin } = mkStub('wd-lin-nir-');
  writeShimAbs(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo v18.20.4; fi');
  let r = sourceAndRun('if node_is_recent; then echo OK; else echo NO; fi', {
    exclusivePath: stubBin,
  });
  assert.match(r.stdout, /OK/);

  writeShimAbs(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo v16.0.0; fi');
  r = sourceAndRun('if node_is_recent; then echo OK; else echo NO; fi', { exclusivePath: stubBin });
  assert.match(r.stdout, /NO/);

  const empty = path.join(root, 'empty');
  fs.mkdirSync(empty);
  r = sourceAndRun('if node_is_recent; then echo OK; else echo NO; fi', { exclusivePath: empty });
  assert.match(r.stdout, /NO/);
});

test('install-sh Linux: apt Node install, consent yes, repo ≥ 18 → PM install, no NodeSource', () => {
  const { root, stubBin } = mkStub('wd-lin-apt-ok-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const verFile = path.join(root, 'node-ver.txt');
  writeNodeTemplate(stubBin, verFile);
  writeLinuxSudo(stubBin, sudoArgv);
  // apt "install" makes node report a modern version (≥ 18).
  writeShimAbs(
    stubBin,
    'apt-get',
    `echo "$@" >> "${aptArgv}"\ncase "$1" in install) printf 'v18.20.4\\n' > "${verFile}" ;; esac\nexit 0`
  );
  writeShimAbs(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\nexit 0`);
  const tty = writeFakeTty(root, 'y');

  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
    ttyDev: tty,
  });
  assert.match(r.stdout, /RC=0/);
  assert.match(readIf(aptArgv), /install -y nodejs npm/);
  assert.equal(readIf(curlArgv), null); // NodeSource never reached
});

test('install-sh Linux: apt repo Node < 18 → NodeSource offered as a separate consented hop', () => {
  const { root, stubBin } = mkStub('wd-lin-ns-yes-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  const aptCount = path.join(root, 'apt-count.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const verFile = path.join(root, 'node-ver.txt');
  writeNodeTemplate(stubBin, verFile);
  writeLinuxSudo(stubBin, sudoArgv);
  // 1st apt install → old Node (v12); 2nd apt install (via NodeSource) → v20.
  writeShimAbs(
    stubBin,
    'apt-get',
    `echo "$@" >> "${aptArgv}"\n` +
      `if [ "$1" = "install" ]; then\n` +
      `  n=0; [ -e "${aptCount}" ] && n="$(< "${aptCount}")"\n` +
      `  n=$((n+1)); printf '%s' "$n" > "${aptCount}"\n` +
      `  if [ "$n" -ge 2 ]; then printf 'v20.15.0\\n' > "${verFile}"; else printf 'v12.22.0\\n' > "${verFile}"; fi\n` +
      `fi\nexit 0`
  );
  writeShimAbs(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\nexit 0`);
  // `curl … | sudo -E bash -` execs bash to run the (empty) setup script; on the
  // exclusive stub PATH there is no real bash, so shim a no-op one.
  writeShimAbs(stubBin, 'bash', 'exit 0');
  const tty = writeFakeTty(root, 'y'); // both hops read yes (reopened each time)

  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
    ttyDev: tty,
  });
  assert.match(r.stdout, /RC=0/);
  // The pinned NodeSource URL was shown before the second consent…
  assert.match(r.stderr, /deb\.nodesource\.com\/setup_20\.x/);
  // …and the NodeSource curl ran exactly once (the second hop), never auto-chained.
  assert.equal(readIf(curlArgv).trim().split('\n').length, 1);
  assert.match(readIf(aptArgv), /install -y nodejs npm/); // distro attempt first
  assert.match(readIf(aptArgv), /install -y nodejs\b/); // then NodeSource's install
});

test('install-sh Linux: NodeSource hop declined → curl NOT run, fallback printed, exit 1', () => {
  const { root, stubBin } = mkStub('wd-lin-ns-no-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const verFile = path.join(root, 'node-ver.txt');
  writeNodeTemplate(stubBin, verFile);
  writeLinuxSudo(stubBin, sudoArgv);
  // 1st (and only) apt install → old Node; then flip the fake-tty answer to "n"
  // so the *second* hop (NodeSource) is declined while the first was accepted.
  // The shim learns the fake-tty path from WD_FAKE_TTY — a test-only variable the
  // production script never reads (tty_dev, redefined below, is what routes the
  // prompt to this file).
  writeShimAbs(
    stubBin,
    'apt-get',
    `echo "$@" >> "${aptArgv}"\n` +
      `if [ "$1" = "install" ]; then printf 'v12.22.0\\n' > "${verFile}"; printf 'n\\n' > "$WD_FAKE_TTY"; fi\n` +
      `exit 0`
  );
  writeShimAbs(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\nexit 0`);
  const tty = writeFakeTty(root, 'y'); // hop1 reads yes; apt shim rewrites it to no

  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
    ttyDev: tty,
    env: { WD_FAKE_TTY: tty },
  });
  assert.equal(r.status, 1);
  assert.equal(readIf(curlArgv), null); // NodeSource script never fetched
  assert.match(r.stderr, /deb\.nodesource\.com/); // fallback shows the pinned URL
  assert.match(r.stderr, /nodejs\.org/); // …and the manual nodejs.org pointer
});

test('install-sh Linux: git via PM, consent yes → PM install of git, then npx handoff', () => {
  const { root, stubBin } = mkStub('wd-lin-git-yes-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const npxArgv = path.join(root, 'npx-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Linux');
  nodeShimFile(stubBin, 'v20.0.0'); // Node already satisfied → straight to ensure_git
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${npxArgv}"\nexit 0`);
  writeShimAbs(stubBin, 'apt-get', `echo "$@" >> "${aptArgv}"\nexit 0`);
  writeLinuxSudo(stubBin, sudoArgv);
  const tty = writeFakeTty(root, 'y');

  // Exclusive stub PATH: no real git/npx can leak in.
  const r = sourceAndMain([], { pathValue: stubBin, ttyDev: tty });
  assert.equal(r.status, 0);
  assert.match(readIf(aptArgv), /install -y git/);
  assert.equal(readIf(npxArgv).trim(), '--yes wienerdog@latest init');
});

test('install-sh Linux: git missing, consent no → note printed, still hands off (exit 0)', () => {
  const { root, stubBin } = mkStub('wd-lin-git-no-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const npxArgv = path.join(root, 'npx-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Linux');
  nodeShimFile(stubBin, 'v20.0.0');
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${npxArgv}"\nexit 0`);
  writeShimAbs(stubBin, 'apt-get', `echo "$@" >> "${aptArgv}"\nexit 0`);
  writeLinuxSudo(stubBin, sudoArgv);
  const tty = writeFakeTty(root, 'n'); // decline the git hop

  const r = sourceAndMain([], { pathValue: stubBin, ttyDev: tty });
  assert.equal(r.status, 0); // git alone NEVER causes exit 1
  assert.equal(readIf(npxArgv).trim(), '--yes wienerdog@latest init');
  assert.match(r.stderr, /isn't installed/);
  assert.equal(readIf(aptArgv), null); // install of git never attempted
});

test('install-sh Linux: git missing, no package manager → note printed, hands off (exit 0)', () => {
  const { root, stubBin } = mkStub('wd-lin-git-nopm-');
  const npxArgv = path.join(root, 'npx-argv.txt');
  writeShimAbs(stubBin, 'uname', 'echo Linux');
  nodeShimFile(stubBin, 'v20.0.0');
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${npxArgv}"\nexit 0`);
  // No PM, no sudo on the exclusive stub PATH → CAN_INSTALL is false.

  const r = sourceAndMain([], { pathValue: stubBin, ttyDev: path.join(root, 'no-tty') });
  assert.equal(r.status, 0);
  assert.equal(readIf(npxArgv).trim(), '--yes wienerdog@latest init');
  assert.match(r.stderr, /isn't installed/);
  assert.doesNotMatch(r.stderr, /About to run/); // no prompt when we can't install
});

test('install-sh Linux: no supported PM, Node missing → no prompt, fallback + exit 1', () => {
  const { stubBin } = mkStub('wd-lin-nopm-node-');
  // Exclusive, empty stub PATH: no node, no PM, no sudo.
  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nodejs\.org/);
  assert.doesNotMatch(r.stderr, /About to run/); // frozen case (d): no prompt
});

test('install-sh Linux: sudo unavailable & not root, Node missing → no prompt, fallback + exit 1', () => {
  const { root, stubBin } = mkStub('wd-lin-nosudo-node-');
  const aptArgv = path.join(root, 'apt-argv.txt');
  // PM present but NO sudo on the exclusive PATH → SUDO_MODE=none → frozen case (d).
  writeShimAbs(stubBin, 'apt-get', `echo "$@" >> "${aptArgv}"\nexit 0`);
  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nodejs\.org/);
  assert.doesNotMatch(r.stderr, /About to run/);
  assert.equal(readIf(aptArgv), null); // no install attempted
});

test('install-sh Linux: non-apt/dnf PM (pacman) with old repo Node → NodeSource NOT offered', () => {
  const { root, stubBin } = mkStub('wd-lin-pacman-');
  const pacArgv = path.join(root, 'pacman-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  const sudoArgv = path.join(root, 'sudo-argv.txt');
  const verFile = path.join(root, 'node-ver.txt');
  writeNodeTemplate(stubBin, verFile);
  writeLinuxSudo(stubBin, sudoArgv);
  writeShimAbs(stubBin, 'pacman', `echo "$@" >> "${pacArgv}"\nprintf 'v12.22.0\\n' > "${verFile}"\nexit 0`);
  writeShimAbs(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\nexit 0`);
  const tty = writeFakeTty(root, 'y');

  const r = sourceAndRun(HERMETIC_RESOLVE_BIN + 'os=Linux\nif ensure_node; then echo RC=0; else echo RC=$?; fi', {
    exclusivePath: stubBin,
    ttyDev: tty,
  });
  assert.equal(r.status, 1);
  assert.equal(readIf(curlArgv), null); // NodeSource (wrong family) never reached
  assert.doesNotMatch(r.stderr, /nodesource/i);
  assert.match(r.stderr, /nodejs\.org/);
});

// --- structural: every Linux install action is reached only via consent_run ---

test('install-sh Linux: PM install + NodeSource are reached only via consent_run', () => {
  // Each EXEC_FN is passed to consent_run (Node distro install, git, NodeSource).
  assert.match(scriptText, /consent_run[\s\S]{0,200}?install_pkg_linux \$pkgs/);
  assert.match(scriptText, /consent_run[\s\S]{0,200}?install_pkg_linux git/);
  assert.match(scriptText, /consent_run[\s\S]{0,260}?install_node_nodesource/);
  // The real nested curl|bash lives ONLY inside install_node_nodesource, never
  // auto-chained at top level after the distro attempt.
  assert.match(scriptText, /install_node_nodesource\(\)\s*\{/);
});

// --- WP-055: npm-less registry-tarball fallback (ADR-0016) -------------------
//
// These drive the FULL script with an exclusive stub PATH (stubBin + a hermetic
// coreutils dir), so no real npx/node leaks: `node` is a shim (`-v` → v20.0.0;
// `-e` → exec the REAL node so the sha512 is genuinely computed over the fixture
// bytes; anything else → record the handoff argv and exit), `npx` is deliberately
// ABSENT so `command -v npx` fails and the tarball branch is taken, `curl` is an
// arg-inspecting stub (serves the manifest JSON for /latest, writes the fixture
// tarball for a `-o` download), `git`/`uname` are trivial shims, and `tar` +
// coreutils are the REAL system binaries via hermeticBinDir — so extraction
// really happens. No test touches the live registry, a real npx, or runs init.

const REAL_NODE =
  spawnSync(BASH, ['-c', 'command -v node'], { encoding: 'utf8' }).stdout.trim();

// Coreutils the tarball path shells out to (printf/echo are builtins). tar is
// REAL so the fixture is genuinely extracted; npx/node are never included here.
// gzip/gunzip: GNU `tar -xzf` on Linux execs `gzip` for decompression (bsdtar on
// macOS decompresses in-process), so an exclusive PATH must expose it there too.
const HERMETIC_SYS_BIN_TARBALL = hermeticBinDir([
  'bash',
  'mktemp',
  'grep',
  'sed',
  'head',
  'rm',
  'mkdir',
  'mv',
  'dirname',
  'cp',
  'tar',
  'gzip',
  'gunzip',
]);

/** Builds an npm-shaped fixture tarball (package/ prefix) offline; returns {fixture, sri}. */
function buildFixtureTarball(root, version) {
  const pkgParent = path.join(root, 'pkg');
  const pkgDir = path.join(pkgParent, 'package');
  fs.mkdirSync(path.join(pkgDir, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, 'bin', 'wienerdog.js'),
    '#!/usr/bin/env node\n// fixture entrypoint\n'
  );
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'wienerdog', version }) + '\n'
  );
  const fixture = path.join(root, 'fixture.tgz');
  const r = spawnSync('tar', ['-czf', fixture, '-C', pkgParent, 'package'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `fixture tar build failed: ${r.stderr}`);
  const sri =
    'sha512-' + crypto.createHash('sha512').update(fs.readFileSync(fixture)).digest('base64');
  return { fixture, sri };
}

/**
 * Drives the full install.sh down the npm-less tarball branch.
 * @param {{version?:string, manifestVersion?:string, ttyAnswer?:string,
 *          noTty?:boolean, corrupt?:boolean, badManifest?:boolean,
 *          preInstalled?:boolean}} opts
 */
function runTarballScenario(opts = {}) {
  const version = opts.version || '0.4.0';
  // The `version` string the served manifest reports (defaults to the fixture's
  // version). Decoupled so a test can serve a hostile version (e.g. one with
  // path-traversal segments) while the fixture tarball + its integrity stay valid.
  const manifestVersion = opts.manifestVersion || version;
  const { root, stubBin } = mkStub('wd-tarball-');
  const { fixture, sri } = buildFixtureTarball(root, version);
  const core = path.join(root, 'core');
  const nodeArgv = path.join(root, 'node-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');

  // Optionally serve bytes whose sha512 != the manifest integrity.
  let served = fixture;
  if (opts.corrupt) {
    served = path.join(root, 'corrupt.tgz');
    fs.writeFileSync(served, 'not a real tarball\n');
  }

  writeShimAbs(
    stubBin,
    'node',
    `if [ "$1" = "-v" ]; then echo v20.0.0; exit 0; fi\n` +
      `if [ "$1" = "-e" ]; then shift; exec "${REAL_NODE}" -e "$@"; fi\n` +
      `echo "$@" >> "${nodeArgv}"\nexit 0`
  );
  writeShimAbs(stubBin, 'git', 'exit 0'); // git present → ensure_git returns at once
  writeShimAbs(stubBin, 'uname', 'echo Linux');

  const manifest = opts.badManifest
    ? '{"error":"Not found"}'
    : `{"version":"${manifestVersion}","dist":{"integrity":"${sri}"}}`;
  // curl: records argv; a `-o <file>` request writes the served bytes there, a
  // plain request prints the manifest JSON.
  writeShimAbs(
    stubBin,
    'curl',
    `echo "$@" >> "${curlArgv}"\n` +
      `out=""\nprev=""\nfor a in "$@"; do\n  if [ "$prev" = "-o" ]; then out="$a"; fi\n  prev="$a"\ndone\n` +
      `if [ -n "$out" ]; then cp "${served}" "$out"; exit 0; fi\n` +
      `printf '%s' '${manifest}'\nexit 0`
  );

  if (opts.preInstalled) {
    const binDir = path.join(core, 'app', version, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'wienerdog.js'), '// pre-existing\n');
  }

  const ttyPath = opts.noTty
    ? path.join(root, 'no-tty')
    : writeFakeTty(root, opts.ttyAnswer || 'y');

  const r = sourceAndMain(['init-extra-arg'], {
    pathValue: `${stubBin}:${HERMETIC_SYS_BIN_TARBALL}`,
    ttyDev: ttyPath,
    env: { WIENERDOG_HOME: core },
  });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    core,
    version,
    nodeArgv,
    curlArgv,
  };
}

test('install-sh tarball: npx absent, consent yes → verify+extract, node init handoff, exit 0', () => {
  const r = runTarballScenario({ ttyAnswer: 'y' });
  assert.equal(r.status, 0, r.stderr);
  const entry = path.join(r.core, 'app', r.version, 'bin', 'wienerdog.js');
  assert.ok(fs.existsSync(entry), 'extracted entrypoint must exist at app/<v>/bin/wienerdog.js');
  const handoff = readIf(r.nodeArgv);
  assert.ok(handoff, 'node handoff must have been recorded');
  assert.match(handoff, new RegExp(`${entry} init init-extra-arg`));
});

test('install-sh tarball: npx absent, consent no → no download, fallback + exit non-zero', () => {
  const r = runTarballScenario({ ttyAnswer: 'n' });
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(r.core, 'app', r.version)), 'app/<v> must not be created');
  assert.equal(readIf(r.nodeArgv), null); // no init handoff
  assert.match(r.stderr, /npx wienerdog@latest init/);
  assert.match(r.stderr, /nodejs\.org/);
  // The tarball itself was never downloaded (no `-o` curl call).
  assert.doesNotMatch(readIf(r.curlArgv) || '', /-o /);
});

test('install-sh tarball: npx absent, no tty → no prompt-read, fallback + exit non-zero', () => {
  const r = runTarballScenario({ noTty: true });
  assert.notEqual(r.status, 0);
  assert.ok(!fs.existsSync(path.join(r.core, 'app', r.version)));
  assert.equal(readIf(r.nodeArgv), null);
  assert.match(r.stderr, /No terminal available/);
  assert.match(r.stderr, /npx wienerdog@latest init/);
  assert.doesNotMatch(readIf(r.curlArgv) || '', /-o /);
});

test('install-sh tarball: checksum mismatch → nothing unpacked, fallback + exit non-zero', () => {
  const r = runTarballScenario({ ttyAnswer: 'y', corrupt: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Checksum mismatch/);
  assert.ok(!fs.existsSync(path.join(r.core, 'app', r.version)), 'nothing may be unpacked');
  assert.equal(readIf(r.nodeArgv), null); // never reached the init handoff
  assert.match(r.stderr, /npx wienerdog@latest init/);
});

test('install-sh tarball: bad/absent manifest → "Couldn\'t read" + fallback, no download', () => {
  const r = runTarballScenario({ ttyAnswer: 'y', badManifest: true });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Couldn't read/);
  assert.match(r.stderr, /npx wienerdog@latest init/);
  assert.ok(!fs.existsSync(path.join(r.core, 'app', r.version)));
  assert.doesNotMatch(readIf(r.curlArgv) || '', /-o /); // tarball never fetched
});

test('install-sh tarball: malicious manifest version with path traversal is rejected at the gate', () => {
  // Owner amendment (2026-07-05, WP-055 review): a manifest whose `version`
  // contains `/` or `..` must be REJECTED by the end-anchored strict-semver gate
  // BEFORE any curl/mkdir/mv, so the verified tarball can never be `mv`d outside
  // `<core>`. `<core>/app/1.2.3/../../../escaped-pwned` resolves lexically to
  // `<root>/escaped-pwned` — outside core — so a filesystem canary there proves
  // (non-vacuously) whether the escape happened. With the fix it never does.
  const r = runTarballScenario({
    ttyAnswer: 'y',
    manifestVersion: '1.2.3/../../../escaped-pwned',
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /Couldn't read/); // rejected at the validation gate
  assert.match(r.stderr, /npx wienerdog@latest init/);
  // Canary: nothing was written to the traversal target OUTSIDE core…
  const escapeTarget = path.join(r.core, '..', 'escaped-pwned');
  assert.ok(!fs.existsSync(escapeTarget), 'no file may escape core via `..` in the version');
  // …and no download/unpack happened at all (no `-o` curl, no app/ tree created).
  assert.doesNotMatch(readIf(r.curlArgv) || '', /-o /);
  assert.ok(!fs.existsSync(path.join(r.core, 'app')));
});

test('install-sh tarball: version already unpacked → straight to init, no re-download', () => {
  const r = runTarballScenario({ ttyAnswer: 'y', preInstalled: true });
  assert.equal(r.status, 0, r.stderr);
  const entry = path.join(r.core, 'app', r.version, 'bin', 'wienerdog.js');
  assert.match(readIf(r.nodeArgv), new RegExp(`${entry} init init-extra-arg`));
  // Idempotent short-circuit: no tarball download (no `-o` curl call).
  assert.doesNotMatch(readIf(r.curlArgv) || '', /-o /);
});

test('install-sh tarball: npx PRESENT still hands off to npx (tarball branch not taken)', () => {
  const { root, stubBin } = mkStub('wd-tarball-npx-');
  writeShimAbs(stubBin, 'uname', 'echo Linux');
  writeShimAbs(stubBin, 'git', 'exit 0');
  nodeShimFile(stubBin, 'v20.0.0');
  const npxArgv = path.join(root, 'npx-argv.txt');
  const curlArgv = path.join(root, 'curl-argv.txt');
  writeShimAbs(stubBin, 'npx', `echo "$@" > "${npxArgv}"\nexit 0`);
  writeShimAbs(stubBin, 'curl', `echo "$@" >> "${curlArgv}"\nexit 0`);

  const r = sourceAndMain([], {
    pathValue: `${stubBin}:${HERMETIC_SYS_BIN_TARBALL}`,
    ttyDev: path.join(root, 'no-tty'),
    env: { WIENERDOG_HOME: path.join(root, 'core') },
  });
  assert.equal(r.status, 0);
  assert.equal(readIf(npxArgv).trim(), '--yes wienerdog@latest init');
  assert.equal(readIf(curlArgv), null); // registry never consulted on the npx path
});
