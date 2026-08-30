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
  assert.match(warned.stdout, /\[warn\] .*digest\.md has wrong permissions \(expected 0700 for folders, 0600 for files\) — run 'wienerdog sync' to repair it/);
  assert.match(warned.stdout, /\[warn\] .*alerts\.jsonl has wrong permissions/);
  assert.match(warned.stdout, /\[warn\] .*state has wrong permissions/);
  // doctor never mutates (WP-070): modes are unchanged after the run.
  assert.equal(fs.statSync(path.join(state, 'digest.md')).mode & 0o777, 0o644);
  assert.equal(fs.statSync(state).mode & 0o777, 0o755);

  fs.chmodSync(state, 0o700);
  fs.chmodSync(path.join(state, 'digest.md'), 0o600);
  fs.chmodSync(path.join(state, 'alerts.jsonl'), 0o600);
  const clean = run(['doctor'], env);
  assert.ok(!clean.stdout.includes('has wrong permissions'), clean.stdout);
});

test('doctor: WARNs on loosened A9 artifacts — secrets/, a token, metadata — via the ONE unified predicate (WP-a9)', { skip: process.platform === 'win32' }, () => {
  const { env, core } = tempEnv();
  run(['init', '--yes'], env);
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.writeFileSync(path.join(secrets, 'google-token-read.json'), '{}', { mode: 0o644 });
  fs.chmodSync(secrets, 0o755);
  fs.chmodSync(path.join(core, 'config.yaml'), 0o644);

  const r = run(['doctor'], env);
  assert.equal(r.status, 0, 'wrong modes are warns, not hard fails');
  assert.match(r.stdout, /\[warn\] .*secrets has wrong permissions .*run 'wienerdog sync' to repair it/);
  assert.match(r.stdout, /\[warn\] .*google-token-read\.json has wrong permissions/);
  assert.match(r.stdout, /\[warn\] .*config\.yaml has wrong permissions/);
  // The dedicated secrets mode-comparison is GONE — no duplicate warn source.
  assert.doesNotMatch(r.stdout, /secrets directory permissions are/);
  assert.match(r.stdout, /\[ok\] secrets directory present/);
});

test('doctor: an OVER-TIGHT 000 secrets/ (broken store) is WARNed too, not passed as clean (WP-a9)', { skip: process.platform === 'win32' }, () => {
  const { env, core } = tempEnv();
  run(['init', '--yes'], env);
  const secrets = path.join(core, 'secrets');
  fs.mkdirSync(secrets, { recursive: true });
  fs.chmodSync(secrets, 0o000);

  const r = run(['doctor'], env);
  fs.chmodSync(secrets, 0o700); // restore for cleanup
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\] .*secrets has wrong permissions \(expected 0700 for folders, 0600 for files\)/);
});

test('doctor: a SYMLINKED secrets/ is WARNed as a not-repaired anomaly, distinct from wrong-permissions (WP-a9 G2)', { skip: process.platform === 'win32' }, () => {
  const { env, core } = tempEnv();
  run(['init', '--yes'], env);
  const secrets = path.join(core, 'secrets');
  const external = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ext-'));
  fs.rmSync(secrets, { recursive: true, force: true });
  fs.symlinkSync(external, secrets);

  const r = run(['doctor'], env);
  // Not a hard fail (the dir "exists" via the link), but a distinct anomaly warn.
  assert.match(r.stdout, /\[warn\] .*secrets is a symlink where Wienerdog expects a private file or folder — it was NOT repaired/);
  assert.doesNotMatch(r.stdout, /secrets has wrong permissions/, 'a symlink anomaly is not reported as a plain wrong-permissions entry');
});

test('doctor: a SYMLINKED core is WARNed as a not-repaired anomaly (WP-a9 G5)', { skip: process.platform === 'win32' }, () => {
  const { env, core, root } = tempEnv();
  run(['init', '--yes'], env);
  // Replace the real core with a symlink to an external copy of it, so the
  // private-modes predicate sees the core's final component as a symlink.
  const external = path.join(root, 'external-core');
  fs.renameSync(core, external);
  fs.symlinkSync(external, core);

  const r = run(['doctor'], env);
  assert.match(r.stdout, /\[warn\] .*wd is a symlink where Wienerdog expects a private file or folder — it was NOT repaired/);
});

test('doctor: a MISSING secrets directory still hard-fails (exit 1) (WP-a9 keeps the A5-era fail)', { skip: process.platform === 'win32' }, () => {
  const { env, core } = tempEnv();
  run(['init', '--yes'], env);
  fs.rmSync(path.join(core, 'secrets'), { recursive: true, force: true });

  const r = run(['doctor'], env);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[fail\] secrets directory missing/);
});

// --- Quarantine counts (WP-doctor-quarantine-counts) ------------------------

/** Write a fixed ledger under <core>/state/transcript-ledger.json.
 *  @param {string} core @param {Record<string, object>} files */
function seedLedger(core, files) {
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, 'transcript-ledger.json'),
    JSON.stringify({ version: 1, baseline_mtime: { claude: null, codex: null }, files }, null, 2)
  );
}

/** A single quarantined ledger record for `reason`. @param {string|undefined} [reason] */
function quarantinedRecord(reason) {
  const rec = { fingerprint: '1:1:1:1', outcome: 'quarantined', updated_at: '2026-01-01T00:00:00.000Z', harness: 'codex' };
  if (reason !== undefined) rec.reason = reason;
  return rec;
}

test('doctor: no ledger file → exactly the ok line, no pointer, exit 0', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[ok\] no session transcripts are being skipped$/m);
  assert.doesNotMatch(r.stdout, /which sessions, and why/);
});

test('doctor: an empty ledger → the ok line, no pointer, exit 0', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedLedger(core, {});
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[ok\] no session transcripts are being skipped$/m);
  assert.doesNotMatch(r.stdout, /which sessions, and why/);
});

test('doctor: a corrupt (non-JSON) ledger → the ok line, no pointer, exit 0', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'transcript-ledger.json'), '{ not valid json');
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[ok\] no session transcripts are being skipped$/m);
  assert.doesNotMatch(r.stdout, /which sessions, and why/);
});

test('doctor: a ledger holding only processed/deferred records → the ok line, no pointer', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedLedger(core, {
    '/a/processed.jsonl': { fingerprint: '1:1:1:1', outcome: 'processed', updated_at: 'now', harness: 'codex' },
    '/a/deferred.jsonl': {
      fingerprint: '1:1:1:1',
      outcome: 'deferred',
      reason: 'secret-revert',
      deferrals: 1,
      updated_at: 'now',
      harness: 'codex',
    },
  });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[ok\] no session transcripts are being skipped$/m);
  assert.doesNotMatch(r.stdout, /which sessions, and why/);
});

test('doctor: every Table A reason class renders its exact message, in row order, with exact counts, zero-member groups omitted, and no name ever leaks', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  // A hostile key: newline, a callout, an ANSI escape, `..`, a path separator.
  // quarantineReport never reads ledger KEYS at all (only outcome/reason), so
  // this must not surface in any form.
  const hostileKey = 'evil\n> [!warning] pwn\x1b[31m/../traversal' + path.sep + 'x';
  seedLedger(core, {
    '/a/oc1.jsonl': quarantinedRecord('over-ceiling'),
    '/a/oc2.jsonl': quarantinedRecord('over-ceiling'),
    '/a/oc3.jsonl': quarantinedRecord('over-ceiling'),
    '/a/tml1.jsonl': quarantinedRecord('too-many-lines'),
    '/a/re1.jsonl': quarantinedRecord('read-error'),
    '/a/re2.jsonl': quarantinedRecord('read-error'),
    '/a/sre1.jsonl': quarantinedRecord('secret-revert-exhausted'),
    [hostileKey]: quarantinedRecord('some-unrecognized-future-reason'),
    '/a/missing-reason.jsonl': quarantinedRecord(undefined),
    '/a/nonstring-reason.jsonl': (() => {
      const rec = quarantinedRecord(undefined);
      rec.reason = 42;
      return rec;
    })(),
  });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  const lines = r.stdout.split('\n').filter(Boolean);
  const idxOC = lines.findIndex((l) => l.includes('the session file is bigger than Wienerdog will read'));
  const idxTML = lines.findIndex((l) => l.includes('the session file has too many lines to read'));
  const idxRE = lines.findIndex((l) => l.includes('the session file could not be read'));
  const idxSRE = lines.findIndex((l) => l.includes('withheld by the secret check too many times in a row'));
  const idxUnrec = lines.findIndex((l) => l.includes('are being skipped for a reason this version does not recognize'));
  assert.ok([idxOC, idxTML, idxRE, idxSRE, idxUnrec].every((i) => i >= 0), r.stdout);
  assert.ok(idxOC < idxTML && idxTML < idxRE && idxRE < idxSRE && idxSRE < idxUnrec, `Table A row order violated:\n${r.stdout}`);
  assert.equal(lines[idxOC], '[warn] 3 session transcript(s) are being skipped: the session file is bigger than Wienerdog will read');
  assert.equal(lines[idxTML], '[warn] 1 session transcript(s) are being skipped: the session file has too many lines to read');
  assert.equal(lines[idxRE], '[warn] 2 session transcript(s) are being skipped: the session file could not be read');
  assert.equal(
    lines[idxSRE],
    '[warn] 1 session transcript(s) are being skipped: the notes made from them were withheld by the secret check too many times in a row. The withheld copies are in state/quarantine/.'
  );
  // hostile key (unrecognized reason) + missing reason + non-string reason = 3
  assert.equal(lines[idxUnrec], '[warn] 3 session transcript(s) are being skipped for a reason this version does not recognize');
  assert.doesNotMatch(r.stdout, /evil|pwn|traversal|some-unrecognized-future-reason|oc1\.jsonl|missing-reason|nonstring-reason/);
  assert.doesNotMatch(r.stdout, /\x1b\[31m/);
});

test('doctor: counts come from the ledger, never from a stale/hand-edited/empty reports/warnings.md', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  seedLedger(core, {
    '/a/oc1.jsonl': quarantinedRecord('over-ceiling'),
    '/a/oc2.jsonl': quarantinedRecord('over-ceiling'),
  });
  const vaultDir = path.join(root, 'vault');
  fs.writeFileSync(path.join(vaultDir, 'reports', 'warnings.md'), ''); // stale/empty, disagrees with the ledger
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[warn\] 2 session transcript\(s\) are being skipped: the session file is bigger than Wienerdog will read$/m);
});

test('doctor: the pointer takes the info branch when reports/warnings.md is a readable non-symlink regular file, and renders exactly once', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
  const vaultDir = path.join(root, 'vault');
  fs.writeFileSync(path.join(vaultDir, 'reports', 'warnings.md'), '# warnings');
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[info\] which sessions, and why: reports\/warnings\.md in your vault$/m);
  assert.equal(
    r.stdout.split('\n').filter((l) => l.includes('which sessions, and why')).length,
    1,
    'the pointer line must render exactly once'
  );
});

test('doctor: the pointer warns when reports/warnings.md is absent (vault configured)', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /\[info\] which sessions/);
  assert.match(
    r.stdout,
    /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet; the next dream run writes it$/m
  );
});

test('doctor: the pointer warns when no vault is configured yet (vaultPath is null)', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /\[info\] which sessions/);
  assert.match(
    r.stdout,
    /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet; the next dream run writes it$/m
  );
});

test('doctor: the pointer warns when reports/warnings.md is a directory, not a file', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
  const vaultDir = path.join(root, 'vault');
  fs.rmSync(path.join(vaultDir, 'reports', 'warnings.md'), { recursive: true, force: true });
  fs.mkdirSync(path.join(vaultDir, 'reports', 'warnings.md'), { recursive: true });
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /\[info\] which sessions/);
  assert.match(r.stdout, /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet/m);
});

test(
  'doctor: the pinned probe warns (never [info]) when reports/warnings.md is a symlink to a good file elsewhere (case a)',
  { skip: process.platform === 'win32' ? 'symlink test is POSIX-only' : false },
  () => {
    const { root, core, env } = tempEnv();
    run(['init', '--fresh-vault', '--yes'], env);
    seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
    const vaultDir = path.join(root, 'vault');
    const target = path.join(vaultDir, 'reports', 'warnings.md');
    fs.rmSync(target, { recursive: true, force: true });
    const elsewhere = path.join(root, 'elsewhere-warnings.md');
    fs.writeFileSync(elsewhere, '# real content, elsewhere');
    fs.symlinkSync(elsewhere, target);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[info\]/, 'a symlink to a good file must not be blessed as the trusted pointer');
    assert.match(r.stdout, /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet/m);
  }
);

test(
  'doctor: the pinned probe warns (never [info]) when reports/warnings.md is a dangling symlink (case b)',
  { skip: process.platform === 'win32' ? 'symlink test is POSIX-only' : false },
  () => {
    const { root, core, env } = tempEnv();
    run(['init', '--fresh-vault', '--yes'], env);
    seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
    const vaultDir = path.join(root, 'vault');
    const target = path.join(vaultDir, 'reports', 'warnings.md');
    fs.rmSync(target, { recursive: true, force: true });
    fs.symlinkSync(path.join(root, 'nowhere', 'gone.md'), target);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[info\]/, 'a dangling symlink must not be blessed as the trusted pointer');
    assert.match(r.stdout, /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet/m);
  }
);

test(
  'doctor: the pinned probe warns (never [info]) when reports/warnings.md will not open for reading (case c)',
  { skip: process.platform === 'win32' ? 'chmod 000 is POSIX-only' : false },
  (t) => {
    const { root, core, env } = tempEnv();
    run(['init', '--fresh-vault', '--yes'], env);
    seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
    const vaultDir = path.join(root, 'vault');
    const target = path.join(vaultDir, 'reports', 'warnings.md');
    fs.writeFileSync(target, '# warnings');
    fs.chmodSync(target, 0o000);
    let stillOpens = false;
    try {
      fs.closeSync(fs.openSync(target, 'r'));
      stillOpens = true;
    } catch {
      stillOpens = false;
    }
    if (stillOpens) {
      fs.chmodSync(target, 0o644);
      t.skip('this process can read a chmod 000 file (root, or a permissive filesystem) — cannot deny the owner here');
      return;
    }
    const r = run(['doctor'], env);
    fs.chmodSync(target, 0o644); // restore for cleanup
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[info\]/, 'an unreadable file must not be blessed as the trusted pointer');
    assert.match(r.stdout, /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet/m);
  }
);

test(
  'doctor: the pinned probe warns (never [info]) when reports/warnings.md is reached through a symlinked parent directory (case d)',
  { skip: process.platform === 'win32' ? 'symlink test is POSIX-only' : false },
  () => {
    const { root, core, env } = tempEnv();
    run(['init', '--fresh-vault', '--yes'], env);
    seedLedger(core, { '/a/oc1.jsonl': quarantinedRecord('over-ceiling') });
    const vaultDir = path.join(root, 'vault');
    const reportsPath = path.join(vaultDir, 'reports');
    fs.rmSync(reportsPath, { recursive: true, force: true });
    const outside = path.join(root, 'outside-reports');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'warnings.md'), '# real, but reached through a redirected parent');
    fs.symlinkSync(outside, reportsPath);
    const r = run(['doctor'], env);
    assert.equal(r.status, 0);
    assert.doesNotMatch(r.stdout, /\[info\]/, 'a symlinked reports/ directory must not be blessed as the trusted pointer, even though the leaf itself is an ordinary readable file');
    assert.match(r.stdout, /^\[warn\] which sessions, and why: reports\/warnings\.md in your vault — that file is not there yet/m);
  }
);

test('doctor: the quarantine group never fails and never mutates; running it twice creates nothing', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  seedLedger(core, {
    '/a/oc1.jsonl': quarantinedRecord('over-ceiling'),
    '/a/re1.jsonl': quarantinedRecord('read-error'),
  });
  const ledgerPath = path.join(core, 'state', 'transcript-ledger.json');
  const before = fs.readFileSync(ledgerPath);
  const vaultDir = path.join(root, 'vault');
  const warningsPath = path.join(vaultDir, 'reports', 'warnings.md');
  assert.ok(!fs.existsSync(warningsPath), 'sanity: warnings.md does not exist yet');

  const r1 = run(['doctor'], env);
  const r2 = run(['doctor'], env);
  assert.equal(r1.status, 0);
  assert.equal(r2.status, 0);
  assert.doesNotMatch(r1.stdout, /\[fail\]/);
  assert.deepEqual(fs.readFileSync(ledgerPath), before, 'doctor must never mutate the ledger');
  assert.ok(!fs.existsSync(warningsPath), 'doctor must never create reports/warnings.md');
});

test('doctor: every quarantine-report line matches the doctor grammar — no headings, no blank lines, no indentation', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  seedLedger(core, {
    '/a/oc1.jsonl': quarantinedRecord('over-ceiling'),
    '/a/tml1.jsonl': quarantinedRecord('too-many-lines'),
    '/a/re1.jsonl': quarantinedRecord('read-error'),
    '/a/sre1.jsonl': quarantinedRecord('secret-revert-exhausted'),
  });
  const r = run(['doctor'], env);
  const lines = r.stdout.replace(/\n$/, '').split('\n');
  assert.ok(lines.length > 0);
  for (const line of lines) {
    assert.match(line, /^\[(ok|warn|info)\] /, `line violates the doctor grammar: ${JSON.stringify(line)}`);
  }
  // The unrecognized-reason class has zero members here: it must not print a
  // zero-count line, and exactly the four seeded classes render.
  assert.doesNotMatch(r.stdout, /does not recognize/);
  assert.equal(lines.filter((l) => l.includes('are being skipped')).length, 4);
});

test('doctor: the quarantine group sits immediately after Google readiness and immediately before the update notice', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  plantDamagedToken(core, 'not json');
  seedNewerVersion(core);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  const lines = r.stdout.split('\n').filter(Boolean);
  const idxGoogle = lines.findIndex((l) => l.includes('Google sign-in file looks damaged'));
  const idxOk = lines.findIndex((l) => l === '[ok] no session transcripts are being skipped');
  const idxUpdate = lines.findIndex((l) => l.includes('a newer Wienerdog is available'));
  assert.ok(idxGoogle >= 0 && idxOk >= 0 && idxUpdate >= 0, r.stdout);
  assert.equal(idxOk, idxGoogle + 1, `quarantine group must sit immediately after Google readiness, got:\n${r.stdout}`);
  assert.equal(idxUpdate, idxOk + 1, `update notice must sit immediately after the quarantine group, got:\n${r.stdout}`);
  // Pre-existing lines are still present and unchanged shape (byte-identical
  // messages) when there are no quarantines: the vault-deferred warn, the
  // manifest/config/core [ok] lines, and the harness summary.
  assert.match(r.stdout, /^\[ok\] core directory exists \(/m);
  assert.match(r.stdout, /^\[ok\] install manifest parses$/m);
  assert.match(r.stdout, /^\[ok\] config\.yaml exists and is non-empty$/m);
  assert.match(r.stdout, /^\[warn\] no memory vault yet — run \/wienerdog-setup/m);
});

// ---------------------------------------------------------------------------
// Managed-block drift against the current digest (WP-doctor-digest-block-drift).
// One test per Table D row; fixtures start from `init --yes --fresh-vault`
// with the harness config dir created so detectHarnesses reports it present.

const { buildBlock } = require('../../src/adapters/shared');

/** tempEnv plus an EXISTING Claude config dir (harness present). */
function tempEnvWithClaude() {
  const t = tempEnv();
  fs.mkdirSync(t.env.CLAUDE_CONFIG_DIR, { recursive: true });
  return t;
}

test('doctor: no digest (plain init --yes) → no block line at all, even with a present harness (D1)', () => {
  const { core, env } = tempEnvWithClaude();
  run(['init', '--yes'], env);
  // Fixture fact: a no-vault init writes no state/digest.md.
  assert.equal(fs.existsSync(path.join(core, 'state', 'digest.md')), false);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^\[ok\] AI tools — Claude Code: found/m); // non-vacuity: D1, not D2
  assert.doesNotMatch(r.stdout, /Wienerdog block in/);
});

test('doctor: fresh-vault install → the block matches the current digest (D7)', () => {
  const { env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.ok(
    r.stdout.includes(`[ok] the Wienerdog block in ${claudeMd} matches the current digest`),
    r.stdout
  );
});

test('doctor: digest rewritten after the last sync → out-of-date warn, exit 0, and doctor mutates nothing (D6, D9, no-mutation)', () => {
  const { core, env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  const digestPath = path.join(core, 'state', 'digest.md');
  fs.appendFileSync(digestPath, 'a new line the block does not carry\n');
  // AC9: doctor never mutates — snapshot both files before the run.
  const beforeBlock = { bytes: fs.readFileSync(claudeMd), mtime: fs.statSync(claudeMd).mtimeMs };
  const beforeDigest = { bytes: fs.readFileSync(digestPath), mtime: fs.statSync(digestPath).mtimeMs };
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.ok(
    r.stdout.includes(`[warn] the Wienerdog block in ${claudeMd} is out of date — run 'wienerdog sync'`),
    r.stdout
  );
  assert.deepEqual(fs.readFileSync(claudeMd), beforeBlock.bytes);
  assert.deepEqual(fs.readFileSync(digestPath), beforeDigest.bytes);
  assert.equal(fs.statSync(claudeMd).mtimeMs, beforeBlock.mtime);
  assert.equal(fs.statSync(digestPath).mtimeMs, beforeDigest.mtime);
});

test('doctor: CLAUDE.md without any sentinel line → no-block warn, exit 0 (D4)', () => {
  const { env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  fs.writeFileSync(claudeMd, '# my own instructions\n\nnothing wienerdog-shaped here\n');
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.ok(
    r.stdout.includes(`[warn] no Wienerdog block in ${claudeMd} — run 'wienerdog sync'`),
    r.stdout
  );
});

test('doctor: CLAUDE.md deleted → the same no-block warn, exit 0 (D3)', () => {
  const { env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  fs.rmSync(claudeMd);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.ok(
    r.stdout.includes(`[warn] no Wienerdog block in ${claudeMd} — run 'wienerdog sync'`),
    r.stdout
  );
});

test('doctor: ambiguous sentinels → the WienerdogError message verbatim, exit 0 (D5)', () => {
  const { core, env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  const digest = fs.readFileSync(path.join(core, 'state', 'digest.md'), 'utf8');
  const block = buildBlock(digest);
  fs.writeFileSync(claudeMd, `${block}\n${block}\n`);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.ok(
    r.stdout.includes(
      `[warn] ambiguous wienerdog managed-block markers in ${claudeMd} — refusing to edit (resolve by hand)`
    ),
    r.stdout
  );
});

test('doctor: both harnesses present → one line per harness, Claude first, each independently resolved (D8)', () => {
  const { core, env } = tempEnvWithClaude();
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  run(['init', '--yes', '--fresh-vault'], env);
  const claudeMd = path.join(env.CLAUDE_CONFIG_DIR, 'CLAUDE.md');
  const agentsMd = path.join(env.CODEX_HOME, 'AGENTS.md');
  // Make the Codex block stale: rewrite AGENTS.md from a DIFFERENT digest.
  assert.ok(fs.existsSync(agentsMd), 'fixture: sync must have written AGENTS.md');
  fs.writeFileSync(agentsMd, `${buildBlock('# some other digest\n\nnot the current one\n')}\n`);
  // Keep the Claude side untouched so the two harnesses resolve differently.
  const digest = fs.readFileSync(path.join(core, 'state', 'digest.md'), 'utf8');
  assert.ok(fs.readFileSync(claudeMd, 'utf8').includes(buildBlock(digest)));
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  const okLine = `[ok] the Wienerdog block in ${claudeMd} matches the current digest`;
  const warnLine = `[warn] the Wienerdog block in ${agentsMd} is out of date — run 'wienerdog sync'`;
  assert.ok(r.stdout.includes(okLine), r.stdout);
  assert.ok(r.stdout.includes(warnLine), r.stdout);
  assert.ok(r.stdout.indexOf(okLine) < r.stdout.indexOf(warnLine), `Claude line must come first:\n${r.stdout}`);
});

test('doctor: the block group sits after the skill-link lines and before the quarantine line (AC12)', () => {
  const { core, env } = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], env);
  fs.appendFileSync(path.join(core, 'state', 'digest.md'), 'drift\n');
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  const lines = r.stdout.split('\n').filter(Boolean);
  const idxSkills = lines.findIndex((l) => l.includes('Claude Code skills registered'));
  const idxBlock = lines.findIndex((l) => l.startsWith('[warn] the Wienerdog block in '));
  const idxQuarantine = lines.findIndex((l) => l === '[ok] no session transcripts are being skipped');
  assert.ok(idxSkills >= 0 && idxBlock >= 0 && idxQuarantine >= 0, r.stdout);
  assert.ok(idxSkills < idxBlock, `block line must follow the skill-link lines:\n${r.stdout}`);
  assert.ok(idxBlock < idxQuarantine, `block line must precede the quarantine line:\n${r.stdout}`);
});

// ---------------------------------------------------------------------------
// WP-hook-doctor-inspection-read-hardening — the doctor rows of Tables B and D.
// digestBlockChecks reads every path (targets AND its own digest.md) through a
// descriptor-based bounded reader: open O_RDONLY|O_NONBLOCK|O_NOCTTY → fstat
// the SAME fd → refuse non-regular → EOF-bounded read stopping at ceiling+1.
// Only a clean ENOENT is absence; every other failure is doubt, said out loud.
// Every potentially-blocking fixture runs doctor as a timeout-bounded child
// with an explicit did-not-time-out assertion. POSIX-only fixtures skip win32.

const { spawnSync } = require('node:child_process');

const POSIX_SKIP = process.platform === 'win32' ? 'POSIX fixtures (mkfifo/symlink/chmod)' : false;
const ROOT_SKIP =
  process.platform === 'win32' ? 'POSIX fixtures (chmod)'
  : (typeof process.getuid === 'function' && process.getuid() === 0)
    ? 'EACCES fixtures cannot be produced as root' : false;
const CEILING = 4194304; // Table C row C1; AC12 asserts parity with both homes

/** Like run(), but the child is timeout-bounded and the result says whether it
 *  timed out — a blockable path must FAIL, not hang the suite. */
function runBounded(args, env) {
  const r = spawnSync(process.execPath, [bin, ...args], { env, encoding: 'utf8', timeout: 15000 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', signal: r.signal, error: r.error };
}

/** The explicit did-not-time-out assertion plus the B6 exit-code contract. */
function assertPromptOk(r) {
  assert.equal(r.error, undefined, `doctor child errored: ${r.error}`);
  assert.equal(r.signal, null, 'doctor child must not be killed by the timeout');
  assert.equal(r.status, 0, `doctor must exit 0 (B6), stderr: ${r.stderr}`);
}

function makeFifo(p) {
  const r = spawnSync('mkfifo', [p], { encoding: 'utf8' });
  assert.equal(r.status, 0, `mkfifo failed: ${r.stderr}`);
}

/** Fresh-vault world with a present Claude harness; returns its key paths. */
function hardenedWorld() {
  const t = tempEnvWithClaude();
  run(['init', '--yes', '--fresh-vault'], t.env);
  return {
    ...t,
    claudeMd: path.join(t.env.CLAUDE_CONFIG_DIR, 'CLAUDE.md'),
    digestPath: path.join(t.core, 'state', 'digest.md'),
  };
}

/** Write the fstat-underreport shim (--require) and return env additions that
 *  make fstat report `fakeSize` for descriptors opened on `target` — the
 *  deterministic stand-in for the procfs virtual-regular class (Table C row
 *  C2a) on platforms without procfs. */
function underreportEnv(w, target, fakeSize = 0) {
  const shim = path.join(w.root, 'underreport-shim.js');
  fs.writeFileSync(shim, [
    "'use strict';",
    'const fs = require("fs");',
    'const target = process.env.WD_UNDERREPORT_PATH;',
    'if (target) {',
    '  const fakeSize = Number(process.env.WD_UNDERREPORT_SIZE || "0");',
    '  const realOpen = fs.openSync;',
    '  const tracked = new Set();',
    '  fs.openSync = function (p, ...rest) {',
    '    const fd = realOpen.call(fs, p, ...rest);',
    '    try { if (String(p) === target) tracked.add(fd); } catch (e) { /* ignore */ }',
    '    return fd;',
    '  };',
    '  const realFstat = fs.fstatSync;',
    '  fs.fstatSync = function (fd, ...rest) {',
    '    const st = realFstat.call(fs, fd, ...rest);',
    '    if (tracked.has(fd)) Object.defineProperty(st, "size", { value: fakeSize });',
    '    return st;',
    '  };',
    '  const realClose = fs.closeSync;',
    '  fs.closeSync = function (fd) { tracked.delete(fd); return realClose.call(fs, fd); };',
    '}',
    '',
  ].join('\n'));
  return {
    ...w.env,
    NODE_OPTIONS: `--require ${shim}`,
    WD_UNDERREPORT_PATH: target,
    WD_UNDERREPORT_SIZE: String(fakeSize),
  };
}

// ---- B2: non-regular targets warn without a content read, promptly ---------

test('doctor: CLAUDE.md is a FIFO with no writer → cannot-inspect warn, exit 0, no timeout (B2, B6, B8)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  fs.rmSync(w.claudeMd);
  makeFifo(w.claudeMd);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — it is not a regular file`), r.stdout);
  assert.doesNotMatch(r.stdout, /\[fail\]/);
});

test('doctor: CLAUDE.md is a symlink to a FIFO → cannot-inspect warn, no timeout (B2)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  fs.rmSync(w.claudeMd);
  const fifo = path.join(w.root, 'somewhere.fifo');
  makeFifo(fifo);
  fs.symlinkSync(fifo, w.claudeMd);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — it is not a regular file`), r.stdout);
});

test('doctor: CLAUDE.md is a directory → cannot-inspect warn (B2)', () => {
  const w = hardenedWorld();
  fs.rmSync(w.claudeMd);
  fs.mkdirSync(w.claudeMd);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — it is not a regular file`), r.stdout);
});

// ---- B3: any non-ENOENT open failure is doubt, named ------------------------

test('doctor: CLAUDE.md unreadable (EACCES) → cannot-inspect warn naming the code (B3, D-E3)', { skip: ROOT_SKIP }, () => {
  const w = hardenedWorld();
  fs.chmodSync(w.claudeMd, 0o000);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — reading it failed (EACCES)`), r.stdout);
});

test('doctor: CLAUDE.md is a symlink loop (ELOOP) → cannot-inspect warn naming the code (B3, D-E4)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  fs.rmSync(w.claudeMd);
  fs.symlinkSync(w.claudeMd, w.claudeMd); // self-loop
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — reading it failed (ELOOP)`), r.stdout);
});

// ---- B5: over-ceiling is actionable, sized, and never sends the user to sync

test('doctor: CLAUDE.md larger than the ceiling → warn with the observed st_size and the ceiling, no sync suggestion (B5)', () => {
  const w = hardenedWorld();
  const size = CEILING + 7;
  fs.writeFileSync(w.claudeMd, 'x'.repeat(size));
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  const line = r.stdout.split('\n').find((l) => l.includes('too large to inspect'));
  assert.ok(line, r.stdout);
  assert.ok(line.includes(w.claudeMd), line);
  assert.ok(line.includes(`${size} bytes`), `must carry the observed st_size: ${line}`);
  assert.ok(line.includes(`${CEILING}-byte ceiling`), `must carry the ceiling: ${line}`);
  assert.ok(line.includes('re-run doctor'), `must tell the user to trim and re-run: ${line}`);
  assert.ok(!line.includes('wienerdog sync'), `must NOT suggest sync (it cannot shrink the file): ${line}`);
});

test('doctor: st_size-underreporting over-ceiling CLAUDE.md → warn says "larger than", no number it cannot know (B5 slow tier, B7)', () => {
  const w = hardenedWorld();
  fs.writeFileSync(w.claudeMd, 'x'.repeat(CEILING + 7));
  const r = runBounded(['doctor'], underreportEnv(w, w.claudeMd, 0));
  assertPromptOk(r);
  const line = r.stdout.split('\n').find((l) => l.includes('too large to inspect'));
  assert.ok(line, r.stdout);
  assert.ok(line.includes(`larger than ${CEILING} bytes`), `slow tier must not claim an exact size: ${line}`);
  assert.ok(!line.includes('wienerdog sync'), line);
});

// ---- B9/B10/B11: doctor's own digest read is inside the same guard ----------

test('doctor: digest.md is a FIFO → one digest warn, NO target inspected, exit 0, no timeout (B9)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  fs.rmSync(w.digestPath);
  makeFifo(w.digestPath);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.digestPath} — it is not a regular file`), r.stdout);
  assert.doesNotMatch(r.stdout, /Wienerdog block in/);
});

test('doctor: digest.md over the ceiling → digest warn, NO target inspected (B9)', () => {
  const w = hardenedWorld();
  fs.writeFileSync(w.digestPath, 'x'.repeat(CEILING + 1));
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(
    r.stdout.includes(`[warn] cannot inspect ${w.digestPath} — it is larger than the ${CEILING}-byte inspection ceiling`),
    r.stdout
  );
  assert.doesNotMatch(r.stdout, /Wienerdog block in/);
});

test('doctor: digest.md unreadable (EACCES) → digest warn naming the code, NO target inspected (B9)', { skip: ROOT_SKIP }, () => {
  const w = hardenedWorld();
  fs.chmodSync(w.digestPath, 0o000);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.digestPath} — reading it failed (EACCES)`), r.stdout);
  assert.doesNotMatch(r.stdout, /Wienerdog block in/);
});

test('doctor: digest.md cleanly absent after a vault existed → no block line at all (B10)', () => {
  const w = hardenedWorld();
  fs.rmSync(w.digestPath);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.doesNotMatch(r.stdout, /Wienerdog block in/);
  assert.doesNotMatch(r.stdout, /cannot inspect/);
});

// ---- C3: symlinks to regular files keep working on both reads (AC4) --------

test('doctor: CLAUDE.md is a symlink to a regular file with the fresh block → still [ok] (C3)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  const real = path.join(w.root, 'real-claude.md');
  fs.renameSync(w.claudeMd, real);
  fs.symlinkSync(real, w.claudeMd);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[ok] the Wienerdog block in ${w.claudeMd} matches the current digest`), r.stdout);
});

test('doctor: digest.md is a symlink to a regular file → comparison still runs, [ok] (C3, B11)', { skip: POSIX_SKIP }, () => {
  const w = hardenedWorld();
  const real = path.join(w.root, 'real-digest.md');
  fs.renameSync(w.digestPath, real);
  fs.symlinkSync(real, w.digestPath);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[ok] the Wienerdog block in ${w.claudeMd} matches the current digest`), r.stdout);
});

// ---- AC16 (C2a): st_size is never a length ----------------------------------

test('doctor: fstat underreports digest.md as size 0 → the block still reads as matching, not empty (AC16, C2a)', () => {
  const w = hardenedWorld();
  const r = runBounded(['doctor'], underreportEnv(w, w.digestPath, 0));
  assertPromptOk(r);
  // An st_size-as-length reader would build want = buildBlock("") and report
  // the block out of date; the EOF-bounded loop reads the real bytes.
  assert.ok(r.stdout.includes(`[ok] the Wienerdog block in ${w.claudeMd} matches the current digest`), r.stdout);
});

test('doctor procfs (Linux): digest.md → /proc/version (virtual regular, st_size 0) read to EOF, block matches (AC16, AC14)', { skip: process.platform !== 'linux' ? 'procfs is Linux-only' : false }, () => {
  const w = hardenedWorld();
  const content = fs.readFileSync('/proc/version', 'utf8');
  assert.ok(content.length > 0, 'fixture: /proc/version must yield bytes');
  fs.rmSync(w.digestPath);
  fs.symlinkSync('/proc/version', w.digestPath);
  assert.equal(fs.statSync(w.digestPath).size, 0, 'fixture: procfs must report st_size 0');
  fs.writeFileSync(w.claudeMd, `${buildBlock(content)}\n`);
  const r = runBounded(['doctor'], w.env);
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[ok] the Wienerdog block in ${w.claudeMd} matches the current digest`), r.stdout);
});

// ---- D-E8 structural: EMFILE/EIO and every unlisted errno fall to doubt -----

test('doctor structural: only a clean ENOENT is absence; the reader is descriptor-based with O_NONBLOCK|O_NOCTTY (D-E8, C2)', () => {
  const src = fs.readFileSync(path.join(repoRoot, 'src', 'cli', 'doctor.js'), 'utf8');
  assert.match(src, /err\.code === 'ENOENT'\) return \{ kind: 'absent' \}/, 'only ENOENT maps to absence');
  assert.match(src, /O_RDONLY \| fs\.constants\.O_NONBLOCK \| fs\.constants\.O_NOCTTY/, 'descriptor flags');
  assert.match(src, /fstatSync\(fd\)/, 'fstat on the SAME descriptor');
  assert.match(src, /isFile\(\)/, 'non-regular refusal');
});

// ---- Post-open ENOENT is doubt, not absence (Codex gate FIX 1) --------------
// Only an OPEN-time ENOENT is the clean path-absence Table D row D-E1 means.
// An ENOENT thrown by fstat or read AFTER the open succeeded (FUSE/network
// fs, descriptor-lifetime anomalies) must land in the doubt arm: the digest
// warns instead of going silent, and a target warns instead of the confident
// "no Wienerdog block … run 'wienerdog sync'". The shim injects the errno at
// a chosen phase on descriptors opened on one path, and can also drop a
// marker file whenever content is actually read from a watched path.

/** Env additions arming the phase-error / read-marker shim.
 *  @param {{root:string, env:NodeJS.ProcessEnv}} w
 *  @param {{errPath?:string, errPhase?:'fstat'|'read', errCode?:string,
 *           markPath?:string, markOut?:string}} opts */
function phaseShimEnv(w, opts) {
  const shim = path.join(w.root, 'phase-shim.js');
  fs.writeFileSync(shim, [
    "'use strict';",
    'const fs = require("fs");',
    'const errPath = process.env.WD_ERR_PATH;',
    'const errPhase = process.env.WD_ERR_PHASE;',
    'const errCode = process.env.WD_ERR_CODE || "ENOENT";',
    'const markPath = process.env.WD_READMARK_PATH;',
    'const markOut = process.env.WD_READMARK_OUT;',
    'const realOpen = fs.openSync;',
    'const errFds = new Set();',
    'const markFds = new Set();',
    'fs.openSync = function (p, ...rest) {',
    '  const fd = realOpen.call(fs, p, ...rest);',
    '  try {',
    '    if (errPath && String(p) === errPath) errFds.add(fd);',
    '    if (markPath && String(p) === markPath) markFds.add(fd);',
    '  } catch (e) { /* ignore */ }',
    '  return fd;',
    '};',
    'const realFstat = fs.fstatSync;',
    'fs.fstatSync = function (fd, ...rest) {',
    '  if (errPhase === "fstat" && errFds.has(fd)) {',
    '    const e = new Error(errCode + " injected at fstat"); e.code = errCode; throw e;',
    '  }',
    '  return realFstat.call(fs, fd, ...rest);',
    '};',
    'const realRead = fs.readSync;',
    'fs.readSync = function (fd, ...rest) {',
    '  if (markFds.has(fd) && markOut) fs.appendFileSync(markOut, "content-read\\n");',
    '  if (errPhase === "read" && errFds.has(fd)) {',
    '    const e = new Error(errCode + " injected at read"); e.code = errCode; throw e;',
    '  }',
    '  return realRead.call(fs, fd, ...rest);',
    '};',
    'const realClose = fs.closeSync;',
    'fs.closeSync = function (fd) { errFds.delete(fd); markFds.delete(fd); return realClose.call(fs, fd); };',
    '',
  ].join('\n'));
  const env = { ...w.env, NODE_OPTIONS: `--require ${shim}` };
  if (opts.errPath) {
    env.WD_ERR_PATH = opts.errPath;
    env.WD_ERR_PHASE = opts.errPhase;
    env.WD_ERR_CODE = opts.errCode || 'ENOENT';
  }
  if (opts.markPath) {
    env.WD_READMARK_PATH = opts.markPath;
    env.WD_READMARK_OUT = opts.markOut;
  }
  return env;
}

for (const phase of ['fstat', 'read']) {
  test(`doctor: post-open ENOENT at ${phase} on CLAUDE.md → doubt warn, never the confident no-block message (FIX 1, D-E1/D-E2)`, () => {
    const w = hardenedWorld();
    const r = runBounded(['doctor'], phaseShimEnv(w, { errPath: w.claudeMd, errPhase: phase }));
    assertPromptOk(r);
    assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.claudeMd} — reading it failed (ENOENT)`), r.stdout);
    assert.doesNotMatch(r.stdout, /no Wienerdog block in/, 'post-open ENOENT must not read as clean absence');
  });

  test(`doctor: post-open ENOENT at ${phase} on digest.md → B9 doubt warn, not silence, no target inspected (FIX 1)`, () => {
    const w = hardenedWorld();
    const r = runBounded(['doctor'], phaseShimEnv(w, { errPath: w.digestPath, errPhase: phase }));
    assertPromptOk(r);
    assert.ok(r.stdout.includes(`[warn] cannot inspect ${w.digestPath} — reading it failed (ENOENT)`), r.stdout);
    assert.doesNotMatch(r.stdout, /Wienerdog block in/, 'no target may be inspected without a trustworthy digest');
  });
}

// ---- The over-cap fast path reads ZERO content bytes (Codex gate FIX 2) -----
// The marker control first proves the shim sees ordinary content reads; the
// over-cap runs then prove the fast path performs none.

test('doctor: read-marker control — a normal target read IS observed by the shim (FIX 2 fixture sanity)', () => {
  const w = hardenedWorld();
  const mark = path.join(w.root, 'read-marker.log');
  const r = runBounded(['doctor'], phaseShimEnv(w, { markPath: w.claudeMd, markOut: mark }));
  assertPromptOk(r);
  assert.ok(r.stdout.includes(`[ok] the Wienerdog block in ${w.claudeMd} matches the current digest`), r.stdout);
  assert.ok(fs.existsSync(mark), 'the shim must record content reads on an inspected target');
});

test('doctor: over-cap CLAUDE.md fast path → B5 warn with st_size and ZERO content reads (FIX 2, A-H7 fast tier)', () => {
  const w = hardenedWorld();
  const size = CEILING + 7;
  fs.writeFileSync(w.claudeMd, 'x'.repeat(size));
  const mark = path.join(w.root, 'read-marker.log');
  const r = runBounded(['doctor'], phaseShimEnv(w, { markPath: w.claudeMd, markOut: mark }));
  assertPromptOk(r);
  const line = r.stdout.split('\n').find((l) => l.includes('too large to inspect'));
  assert.ok(line && line.includes(`${size} bytes`), r.stdout);
  assert.ok(!fs.existsSync(mark), 'the fast path must refuse with zero content bytes read');
});

test('doctor: over-cap digest.md fast path → B9 warn and ZERO content reads of the digest (FIX 2)', () => {
  const w = hardenedWorld();
  fs.writeFileSync(w.digestPath, 'x'.repeat(CEILING + 1));
  const mark = path.join(w.root, 'read-marker.log');
  const r = runBounded(['doctor'], phaseShimEnv(w, { markPath: w.digestPath, markOut: mark }));
  assertPromptOk(r);
  assert.ok(
    r.stdout.includes(`[warn] cannot inspect ${w.digestPath} — it is larger than the ${CEILING}-byte inspection ceiling`),
    r.stdout
  );
  assert.ok(!fs.existsSync(mark), 'the digest fast path must refuse with zero content bytes read');
});
