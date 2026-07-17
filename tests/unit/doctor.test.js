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

test('doctor reports [ok] Codex skills registered when Codex is present and links intact', () => {
  const { root, env } = tempEnv();
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  env.CODEX_HOME = codexHome;
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\] Codex skills registered \(\d+\)/);
});

test('doctor warns (exit 0) when a Codex skill link is removed', () => {
  const { root, env } = tempEnv();
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  env.CODEX_HOME = codexHome;
  run(['init', '--yes'], env);
  fs.rmSync(path.join(codexHome, 'skills', 'wienerdog-setup'), { recursive: true, force: true });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\] Codex skills need attention .*wienerdog-setup/);
});

test('doctor prints no Codex-skill line when Codex is not detected', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Codex skills/);
});

test('doctor reports [ok] Claude Code skills registered when Claude is present and links intact', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\] Claude Code skills registered \(\d+\)/);
});

test(
  'doctor warns (exit 0) when a Claude skill link is repointed at a foreign core',
  { skip: process.platform === 'win32' ? 'symlink-target test is POSIX-only' : false },
  () => {
    const { root, env } = tempEnv();
    const claudeHome = path.join(root, 'claude');
    fs.mkdirSync(claudeHome, { recursive: true });
    env.CLAUDE_CONFIG_DIR = claudeHome;
    run(['init', '--yes'], env);
    const foreign = path.join(root, 'foreign', 'wienerdog-setup');
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, 'SKILL.md'), 'x');
    const link = path.join(claudeHome, 'skills', 'wienerdog-setup');
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(foreign, link);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[warn\] Claude Code skills need attention .*wienerdog-setup \(points outside this install/);
  }
);

test(
  'doctor warns (exit 0) when a Claude skill link is dangling',
  { skip: process.platform === 'win32' ? 'symlink-target test is POSIX-only' : false },
  () => {
    const { root, env } = tempEnv();
    const claudeHome = path.join(root, 'claude');
    fs.mkdirSync(claudeHome, { recursive: true });
    env.CLAUDE_CONFIG_DIR = claudeHome;
    run(['init', '--yes'], env);
    const link = path.join(claudeHome, 'skills', 'wienerdog-dream');
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(path.join(root, 'gone', 'wienerdog-dream'), link);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[warn\] Claude Code skills need attention .*wienerdog-dream \(broken link/);
  }
);

test(
  'doctor warns (exit 0) when a Claude skill symlink resolves but the core copy lost its SKILL.md',
  { skip: process.platform === 'win32' ? 'symlink SKILL.md test is POSIX-only' : false },
  () => {
    const { root, core, env } = tempEnv();
    const claudeHome = path.join(root, 'claude');
    fs.mkdirSync(claudeHome, { recursive: true });
    env.CLAUDE_CONFIG_DIR = claudeHome;
    run(['init', '--yes'], env);
    fs.rmSync(path.join(core, 'skills', 'wienerdog-routines', 'SKILL.md'), { force: true });
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /\[warn\] Claude Code skills need attention .*wienerdog-routines/);
  }
);

test('doctor: copied-directory branch — real dir without SKILL.md warns; with SKILL.md registers', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const link = path.join(claudeHome, 'skills', 'wienerdog-dream');
  fs.rmSync(link, { recursive: true, force: true });
  fs.mkdirSync(link, { recursive: true });
  let r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\] Claude Code skills need attention .*wienerdog-dream \(no SKILL\.md/);

  fs.writeFileSync(path.join(link, 'SKILL.md'), 'x');
  r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /wienerdog-dream \(no SKILL\.md/);
  assert.match(r.stdout, /\[ok\] Claude Code skills registered/);
});

test('doctor: a deleted staged core skill is reported, not silently dropped', () => {
  const { root, core, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  fs.rmSync(path.join(core, 'skills', 'wienerdog-routines'), { recursive: true, force: true });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\] Claude Code skills need attention .*wienerdog-routines \(core copy missing/);
});

test('doctor prints no Claude-skill line when Claude is not detected', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Claude Code skills/);
});

/** Plant a WORKING fake googleapis under <core>/app/deps (resolves AND loads). */
function plantDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = { google: {} };\n');
}

/** Plant a CORRUPT fake googleapis: resolves fine, but its entry point throws on require. */
function plantCorruptDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), "throw new Error('corrupt googleapis entry point');\n");
}

/** Plant a SHAPE-BROKEN fake googleapis: resolves AND requires cleanly, but exports
 *  no `.google` (zero-byte / stub index.js → {}). The false-[ok] case the WP-102
 *  load-probe shape check must catch (PR-gate P2). */
function plantShapelessDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = {};\n');
}

/** Plant a MAINLESS fake googleapis: package.json present but NO index.js —
 *  depsPresent true, but req.resolve throws. isInstalled would read FALSE here;
 *  the probe must still label it BROKEN, not missing (round-6 P2). */
function plantMainlessDeps(core) {
  const pkgDir = path.join(core, 'app', 'deps', 'node_modules', 'googleapis');
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'googleapis', version: '173.0.0', main: 'index.js' }));
  // deliberately NO index.js
}

/** Plant a VALID token (JSON + refresh_token) so the core reads as "connected". */
function plantToken(core) {
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token.json'),
    JSON.stringify({ access_token: 'a', refresh_token: 'r' }));
}

/** Plant a DAMAGED token file (malformed / missing refresh_token). */
function plantDamagedToken(core, content) {
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token.json'), content);
}

test('doctor prints no Google-readiness line when Google is not connected', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /Google connected|Google is connected but|Google sign-in file/);
});

const damagedTokenVariants = [
  ['malformed JSON', 'not json'],
  ['missing refresh_token', JSON.stringify({ access_token: 'a' })],
  ['wrong-type refresh_token', JSON.stringify({ refresh_token: true })],
  ['whitespace-only refresh_token', JSON.stringify({ refresh_token: '   ' })],
  ['zero-byte file', ''],
];

for (const [label, content] of damagedTokenVariants) {
  test(`doctor warns (exit 0) on a damaged Google token: ${label}`, () => {
    const { core, env } = tempEnv();
    run(['init', '--yes'], env);
    plantDamagedToken(core, content);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0, 'a damaged token is a warn, not a hard fail');
    assert.match(r.stdout, /\[warn\] Google sign-in file looks damaged/);
    assert.doesNotMatch(r.stdout, /\[ok\] Google connected/);
  });
}

test('doctor warns (exit 0) when Google is connected but the client library is missing', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  plantToken(core);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0, 'a missing library is a warn, not a hard fail');
  assert.match(
    r.stdout,
    /\[warn\] Google is connected but its client library is missing — the next .?wienerdog gws.? command will offer to install it/
  );
  assert.doesNotMatch(r.stdout, /gws auth/);
});

test('doctor warns (exit 0) when the client library is broken (resolves but fails to load)', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  plantToken(core);
  plantCorruptDeps(core);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0, 'a broken library is a warn, not a hard fail');
  assert.match(
    r.stdout,
    /\[warn\] Google is connected but its client library is broken \(installed but not loadable\) — delete the folder /
  );
  assert.ok(r.stdout.includes(path.join(core, 'app', 'deps')), 'names the deps folder');
  assert.doesNotMatch(r.stdout, /will offer to install/, 'the broken state does not self-heal');
  assert.doesNotMatch(r.stdout, /\[ok\] Google connected/);
});

/**
 * ORDERING NOTE (closing PR-gate, WP-102 + WP-103): the shape-broken fix lives in
 * WP-102's deps.js — loadGoogleapis there rejects a module with no truthy `.google`
 * — and the doctor probe merely INHERITS it (no doctor.js change). This branch
 * still carries main's deps.js, where the shapeless stub requires cleanly and
 * reads as usable, so the case below would falsely FAIL standalone here; it only
 * turns green once WP-102 merges. Probe the behavior (not the branch): plant a
 * shapeless module in a throwaway core and see whether loadGoogleapis rejects it.
 */
function depsShapeCheckPresent() {
  const deps = require('../../src/gws/deps');
  const probeCore = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-shape-probe-'));
  try {
    plantShapelessDeps(probeCore);
    try {
      deps.loadGoogleapis({ core: probeCore, secrets: path.join(probeCore, 'secrets') });
      return false; // shapeless module returned as usable → pre-WP-102 deps.js
    } catch {
      return true; // rejected → WP-102's shape check is in place
    }
  } finally {
    fs.rmSync(probeCore, { recursive: true, force: true });
  }
}

test(
  'doctor warns (exit 0) when the client library is shape-broken (loads but exports no google)',
  { skip: depsShapeCheckPresent() ? false : 'needs WP-102 deps.js shape check — valid only post-WP-102 merge' },
  () => {
    const { core, env } = tempEnv();
    run(['init', '--yes'], env);
    plantToken(core);
    plantShapelessDeps(core);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0, 'a shape-broken library is a warn, not a hard fail');
    assert.match(
      r.stdout,
      /\[warn\] Google is connected but its client library is broken \(installed but not loadable\)/
    );
    assert.doesNotMatch(r.stdout, /\[ok\] Google connected/);
  }
);

/**
 * ORDERING NOTE (round-6 P2, WP-102 + WP-103): `depsPresent` is exported by
 * WP-102's deps.js and lands here only when that branch merges. This branch
 * still carries main's deps.js, so the doctor probe falls back to `isInstalled`,
 * which reads FALSE for a mainless tree (package.json present, no entry point) —
 * the case below would falsely report "missing" and FAIL standalone here; it
 * only turns green once WP-102 merges. Probe the behavior (not the branch):
 * check that deps.js exports `depsPresent` AND that it reads a mainless tree as
 * physically present.
 */
function depsPresenceKeyAvailable() {
  const deps = require('../../src/gws/deps');
  if (typeof deps.depsPresent !== 'function') return false;
  const probeCore = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-presence-probe-'));
  try {
    plantMainlessDeps(probeCore);
    return deps.depsPresent({ core: probeCore, secrets: path.join(probeCore, 'secrets') }) === true;
  } finally {
    fs.rmSync(probeCore, { recursive: true, force: true });
  }
}

test(
  'doctor warns broken, not missing, when the library tree is present but mainless',
  { skip: depsPresenceKeyAvailable() ? false : 'needs WP-102 deps.js depsPresent — valid only post-WP-102 merge' },
  () => {
    const { core, env } = tempEnv();
    run(['init', '--yes'], env);
    plantToken(core);
    plantMainlessDeps(core);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0, 'a mainless library tree is a warn, not a hard fail');
    assert.match(
      r.stdout,
      /\[warn\] Google is connected but its client library is broken \(installed but not loadable\)/
    );
    assert.doesNotMatch(r.stdout, /is missing/, 'a present-but-mainless tree is broken, not missing');
    assert.doesNotMatch(r.stdout, /\[ok\] Google connected/);
  }
);

test('doctor reports [ok] when Google is connected and the client library is installed', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  plantToken(core);
  plantDeps(core);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\] Google connected and its client library is installed/);
});

/** Append a hook group to a harness settings file. @param {string} settingsPath
 *  @param {string} event @param {string} command */
function appendHook(settingsPath, event, command) {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  s.hooks = s.hooks || {};
  s.hooks[event] = s.hooks[event] || [];
  s.hooks[event].push({ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] });
  fs.writeFileSync(settingsPath, `${JSON.stringify(s, null, 2)}\n`);
}

test('doctor: valid current hooks only → no leftover-hook warn', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /possible leftover Wienerdog session hook/);
});

test('doctor warns (exit 0) on a foreign Wienerdog hook (correct pair) whose script is gone', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const settingsPath = path.join(claudeHome, 'settings.json');
  appendHook(settingsPath, 'SessionEnd', `'${path.join(root, 'gone-temp', 'wd', 'bin', 'session-end.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /\[warn\] possible leftover Wienerdog session hook in .*settings\.json \(SessionEnd\): its script is gone/
  );
});

test('doctor: unrelated basename with a missing script is NOT flagged', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const settingsPath = path.join(claudeHome, 'settings.json');
  appendHook(settingsPath, 'SessionEnd', `'${path.join(root, 'gone', 'my-hook.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /possible leftover Wienerdog session hook/);
});

test('doctor: right basename under an event Wienerdog never registers is NOT flagged', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const settingsPath = path.join(claudeHome, 'settings.json');
  appendHook(settingsPath, 'PreToolUse', `'${path.join(root, 'gone', 'x', 'session-end.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /possible leftover Wienerdog session hook/);
});

test('doctor: right basename under the wrong event for that basename is NOT flagged', () => {
  const { root, env } = tempEnv();
  const claudeHome = path.join(root, 'claude');
  fs.mkdirSync(claudeHome, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeHome;
  run(['init', '--yes'], env);
  const settingsPath = path.join(claudeHome, 'settings.json');
  appendHook(settingsPath, 'SessionEnd', `'${path.join(root, 'gone', 'x', 'session-start.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /possible leftover Wienerdog session hook/);
});

test('doctor warns (exit 0) on a Codex-side stale hook (Stop → codex-session-end.sh)', () => {
  const { root, env } = tempEnv();
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  env.CODEX_HOME = codexHome;
  run(['init', '--yes'], env);
  const hooksPath = path.join(codexHome, 'hooks.json');
  appendHook(hooksPath, 'Stop', `'${path.join(root, 'gone', 'bin', 'codex-session-end.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(
    r.stdout,
    /\[warn\] possible leftover Wienerdog session hook in .*hooks\.json \(Stop\)/
  );
});

test('doctor: Codex wrong pair (Stop → session-end.sh) is NOT flagged', () => {
  const { root, env } = tempEnv();
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(codexHome, { recursive: true });
  env.CODEX_HOME = codexHome;
  run(['init', '--yes'], env);
  const hooksPath = path.join(codexHome, 'hooks.json');
  appendHook(hooksPath, 'Stop', `'${path.join(root, 'gone', 'session-end.sh')}'`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /possible leftover Wienerdog session hook/);
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

test('doctor: WARNs on world-readable A5 artifacts and is clean once private; never mutates (WP-126)', { skip: process.platform === 'win32' }, () => {
  const { env, core } = tempEnv();
  run(['init', '--yes'], env);
  const state = path.join(core, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'digest.md'), 'd', { mode: 0o644 });
  fs.writeFileSync(path.join(state, 'alerts.jsonl'), '{}\n', { mode: 0o644 });
  fs.chmodSync(state, 0o755);

  const warned = run(['doctor'], env);
  assert.match(warned.stdout, /\[warn\] .*digest\.md is readable by other users — run 'wienerdog sync' to harden it/);
  assert.match(warned.stdout, /\[warn\] .*alerts\.jsonl is readable by other users/);
  assert.match(warned.stdout, /\[warn\] .*state is readable by other users/);
  // doctor never mutates (WP-070): modes are unchanged after the run.
  assert.equal(fs.statSync(path.join(state, 'digest.md')).mode & 0o777, 0o644);
  assert.equal(fs.statSync(state).mode & 0o777, 0o755);

  fs.chmodSync(state, 0o700);
  fs.chmodSync(path.join(state, 'digest.md'), 0o600);
  fs.chmodSync(path.join(state, 'alerts.jsonl'), 0o600);
  const clean = run(['doctor'], env);
  assert.ok(!clean.stdout.includes('is readable by other users'), clean.stdout);
});
