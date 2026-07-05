'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Build an isolated temp HOME with env overrides that never touch real dirs. */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-doctor-'));
  const core = path.join(root, 'wd');
  return {
    root,
    core,
    env: {
      ...process.env,
      // Isolate HOME: init runs sync, which writes the PATH shim to ~/.local/bin (WP-042).
      HOME: root,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: path.join(root, 'vault'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
    },
  };
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function run(args, env) {
  try {
    // Use the running node by absolute path so tests may override PATH (to make
    // the npx-availability switch deterministic) without losing the interpreter.
    const stdout = execFileSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** A temp dir holding an executable `npx` stub. Host-independent. */
function dirWithNpx() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-npx-'));
  const name = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  fs.writeFileSync(path.join(d, name), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(d, name), 0o755);
  return d;
}

/** Does directory `d` contain an npx-like executable? Mirrors npxAvailable. */
function npxInDir(d) {
  const names = process.platform === 'win32' ? ['npx.cmd', 'npx.exe', 'npx'] : ['npx'];
  return names.some((n) => {
    try {
      if (process.platform === 'win32') return fs.existsSync(path.join(d, n));
      fs.accessSync(path.join(d, n), fs.constants.X_OK);
      return true;
    } catch { return false; }
  });
}

/** The host PATH with every npx-containing dir stripped out — keeps git/node etc.
 *  available while guaranteeing `npxAvailable` reports false. */
function pathWithoutNpx() {
  return (process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)
    .filter((d) => !npxInDir(d))
    .join(path.delimiter);
}

test('doctor after a plain init warns about the deferred vault and exits 0', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\]/);
  assert.match(r.stdout, /wienerdog-setup/);
  assert.doesNotMatch(r.stdout, /\[fail\]/);
});

test('doctor after init --fresh-vault reports the vault ready and exits 0', () => {
  const { env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\]/);
  assert.match(r.stdout, /vault ready/);
});

/** Seed the update-check cache with a greater `latest` (doctor reads cache only,
 *  no network). @param {string} core */
function seedNewerVersion(core) {
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'update-check.json'),
    JSON.stringify({ last_check: new Date().toISOString(), current: '0.0.1', latest: '999.0.0' }, null, 2)
  );
}

test('doctor prints the npx update command when npx is on PATH (no network)', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedNewerVersion(core);
  // Prepend an npx stub so the availability switch is deterministic regardless of host.
  env.PATH = `${dirWithNpx()}${path.delimiter}${process.env.PATH || ''}`;
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[info\] a newer Wienerdog is available \(.* → 999\.0\.0\) — update: npx wienerdog@latest sync/);
});

test('doctor prints `wienerdog update` when npx is NOT on PATH (no network)', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedNewerVersion(core);
  // Strip npx-containing dirs from PATH; node/git stay available.
  env.PATH = pathWithoutNpx();
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[info\] a newer Wienerdog is available \(.* → 999\.0\.0\) — update: wienerdog update/);
});

test('doctor with a set-but-missing vault fails and exits 1', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const configPath = path.join(core, 'config.yaml');
  const cfg = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(configPath, cfg.replace(/^vault: null.*$/m, 'vault: /definitely/missing/dir'));
  const r = run(['doctor'], env);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[fail\].*vault/);
});
