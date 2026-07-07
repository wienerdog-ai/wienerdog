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
      // Hermeticity (WP-070): init runs sync, whose scheduling touches the loader.
      // NOOP neutralizes any real launchctl/systemctl spawn under this temp HOME —
      // the incident vector (a bootout of the real per-user-global agent).
      WIENERDOG_LOADER_NOOP: '1',
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

/** Inject a launchd-style scheduler-entry into the install manifest so doctor has
 *  a registered entry to probe. describeEntry recognizes the `launchctl bootout`
 *  shape regardless of host platform; the WIENERDOG_SCHEDULER_PROBE map overrides
 *  the status by name, so NO real launchctl is ever spawned. @param {string} core */
function injectSchedulerEntry(core, home) {
  const manifestPath = path.join(core, 'install-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.entries.push({
    kind: 'scheduler-entry',
    path: path.join(home, 'Library', 'LaunchAgents', 'ai.wienerdog.dream.plist'),
    unload: ['launchctl', 'bootout', 'gui/501/ai.wienerdog.dream'],
  });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test('doctor warns (exit 0) when a registered scheduler entry probes not-loaded', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  injectSchedulerEntry(core, root);
  // Force the read-only probe result by name — no real scheduler is touched.
  env.WIENERDOG_SCHEDULER_PROBE = JSON.stringify({ dream: 'missing' });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0, 'a not-loaded job is a warn, not a hard fail');
  assert.match(r.stdout, /\[warn\] scheduled job 'dream' is configured but NOT loaded in launchd — run 'wienerdog sync' to reload it/);
});

test('doctor reports [ok] when a registered scheduler entry probes loaded', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  injectSchedulerEntry(core, root);
  env.WIENERDOG_SCHEDULER_PROBE = JSON.stringify({ dream: 'loaded' });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\] scheduled job 'dream' is loaded \(launchd\)/);
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
