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

/** Writes an executable bash shim at `dir/name` with the given body. */
function writeShim(dir, name, body) {
  const shimPath = path.join(dir, name);
  fs.writeFileSync(shimPath, `#!/usr/bin/env bash\n${body}\n`);
  fs.chmodSync(shimPath, 0o755);
  return shimPath;
}

/**
 * Runs install.sh with a stub PATH: `dir/bin` (containing the shims) first,
 * then the real system PATH, so `bash`/`uname` still resolve but our stub
 * `node`/`npx` shims win.
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

test('install-sh: missing/old Node exits 1 with nodejs.org guidance', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-install-old-'));
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin);
  writeShim(stubBin, 'node', 'if [ "$1" = "-v" ]; then echo "v16.0.0"; exit 0; fi\nexit 1');

  const r = runInstallSh(stubBin);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /nodejs\.org/);
});

test('install-sh: recent Node hands off to npx wienerdog@latest init', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-install-recent-'));
  const stubBin = path.join(root, 'bin');
  fs.mkdirSync(stubBin);
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
// root-check line is present in the script text (see spec WP-016, "Exact
// contracts" step 2, and "Decisions made" in the PR body).
test('install-sh: script text contains a root-user check', () => {
  assert.match(scriptText, /EUID/);
  assert.match(scriptText, /root/i);
});

// Acceptance criterion: the script never invokes sudo or a package manager
// itself. We assert those words only ever appear inside comments or
// echo/printf strings (i.e. explanatory text), never as a command.
test('install-sh: sudo/apt/brew only appear in comments or echoed guidance, never invoked', () => {
  const forbidden = /\b(sudo|apt|apt-get|brew)\b/;
  for (const rawLine of scriptText.split('\n')) {
    const line = rawLine.trim();
    if (!forbidden.test(line)) continue;
    const isComment = line.startsWith('#');
    const isEchoOrPrintf = /^(echo|printf)\b/.test(line);
    assert.ok(
      isComment || isEchoOrPrintf,
      `line invokes a forbidden command outside of a comment/echo: "${line}"`
    );
  }
});
