'use strict';

// WP-043: `sync` migrates existing OS scheduler entries (written by older
// versions, embedding an npx-cache/checkout bin path) to the stable vendored
// bin. Fully hermetic: temp HOME + WIENERDOG_HOME, WIENERDOG_LOADER_NOOP=1 so the
// default loaders never spawn launchctl/systemctl, harnesses pointed at absent
// dirs, no vault (skips digest), no network.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const vendor = require('../../src/core/vendor');
const sync = require('../../src/cli/sync');
const descriptorMod = require('../../src/scheduler/descriptor');

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so systemd units resolve under the temp HOME, never a
// real dir — and so parallel test files never collide on a shared unit path.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

// Vault UNSET → sync skips the digest + managed block but still vendors and
// repoints. Harness dirs are set to absent paths in the env below.
const BASE_CONFIG = `# Wienerdog configuration
version: 1
vault:
harnesses:
  claude: true
  codex: false
memory_mode: standard
`;

// Only darwin and systemd-Linux can register a per-job entry; elsewhere sync
// still succeeds but repoints nothing (degrades to a notice).
const SCHED_SUPPORTED =
  process.platform === 'darwin' ||
  (process.platform === 'linux' &&
    (fs.existsSync('/run/systemd/system') || !spawnSync('systemctl', ['--version']).error));

/** Isolated temp core with config + matching manifest + absent harness dirs. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-repoint-'));
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.writeFileSync(paths.config, BASE_CONFIG);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(BASE_CONFIG) },
    ],
  };
  manifestLib.save(paths, manifest);
  return { root, env, paths };
}

/**
 * The primary scheduler-entry file for a job on the current platform: the
 * launchd plist on darwin, the systemd .service on Linux. WP-157: the entry
 * invokes the out-of-tree launcher, so `render(node)` produces that file's
 * content for a given NODE path (the absolute value repoint migrates now that
 * the launcher path is stable) — seed an OLD node to simulate a stale entry.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 * @param {{name:string, hour:number, minute:number}} o
 */
function primaryEntry(paths, o) {
  const launcher = path.join(paths.core, 'launcher', 'launch.js');
  const descriptor = path.join(paths.state, 'descriptors', `${o.name}.json`);
  const logDir = path.join(paths.logs, o.name);
  if (process.platform === 'darwin') {
    const label = gen.launchdLabel(o.name);
    const file = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const unload = ['launchctl', 'bootout', `gui/${process.getuid()}/${label}`];
    return { file, unload, render: (node) => gen.launchdPlist({ ...o, node, launcher, descriptor, expectDigest: '', logDir }) };
  }
  const unitBase = gen.systemdUnitBase(o.name);
  const dir = gen.systemdUserDir(paths.home, process.env);
  const file = path.join(dir, `${unitBase}.service`);
  return { file, unload: null, render: (node) => gen.systemdService({ name: o.name, node, launcher, descriptor, expectDigest: '' }) };
}

/** Run sync.run with process.env pointed at the temp core and the loader no-op set. */
async function runSync(env, argv = []) {
  const savedKeys = ['HOME', 'WIENERDOG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'WIENERDOG_LOADER_NOOP'];
  const saved = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
  Object.assign(process.env, env, { WIENERDOG_LOADER_NOOP: '1' });
  // Silence sync's chatty stdout.
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log;
  console.log = () => {};
  process.stdout.write = () => true;
  try {
    await sync.run(argv);
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('sync-repoint: rewrites a stale scheduler entry to the vendored bin, then is idempotent', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const job = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);

  // Seed an OLD-path entry as an older/moved install would have left it: the
  // file exists on disk, a manifest scheduler-entry tracks it, and its embedded
  // node points at a now-stale path.
  const oldNode = path.join(env.HOME, '.old', 'node-versions', 'v1.0.0', 'bin', 'node');
  const o = { name: job.name, hour: 3, minute: 30 };
  const entry = primaryEntry(paths, o);
  fs.mkdirSync(path.dirname(entry.file), { recursive: true });
  fs.writeFileSync(entry.file, entry.render(oldNode));
  const manifest = manifestLib.load(paths);
  const rec = { kind: 'scheduler-entry', path: entry.file };
  if (entry.unload) rec.unload = entry.unload;
  manifestLib.record(manifest, rec);
  manifestLib.save(paths, manifest);

  assert.ok(fs.readFileSync(entry.file, 'utf8').includes(oldNode), 'seeded file embeds the old node');

  await runSync(env);

  const stableNode = gen.nodePath();
  const launcher = path.join(paths.core, 'launcher', 'launch.js');
  const after = fs.readFileSync(entry.file, 'utf8');
  assert.ok(after.includes(stableNode), 'entry now targets the current node');
  assert.ok(after.includes(launcher), 'entry invokes the stable out-of-tree launcher');
  assert.ok(!after.includes(oldNode), 'the stale node path is gone');

  // A second sync leaves the entry byte-identical (content matches → no rewrite).
  const before = fs.readFileSync(entry.file);
  await runSync(env);
  assert.ok(fs.readFileSync(entry.file).equals(before), 'second sync is a no-op on the entry');
});

test('sync-repoint: after ONE real sync the dream descriptor has non-empty exec AND the entry binds the current digest — no drift (WP-156 F4/A1)', { skip: !SCHED_SUPPORTED }, async () => {
  // The F4/A1 ordering fix: createPins runs ABOVE repointSchedules, so the
  // descriptor written at repoint embeds the pins. Reverting the order (or
  // dropping the A1b gate) makes the FIRST sync bind exec:{} (or write no
  // descriptor), so a single sync would fail this — the classic "nightly
  // fail-closed until a 2nd sync" P1.
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wd-f4-')));
  const vaultDir = path.join(home, 'vault');
  fs.mkdirSync(vaultDir, { recursive: true });
  const env = {
    HOME: home,
    WIENERDOG_HOME: path.join(home, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(home, 'absent-claude'),
    CODEX_HOME: path.join(home, 'absent-codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  const cfg = `version: 1\nvault: ${vaultDir}\n`;
  fs.writeFileSync(paths.config, cfg);
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'dir', path: paths.core }, { kind: 'file', path: paths.config, hash: sha256(cfg) }],
  });

  // A resolvable fake `claude` on the clean job PATH (buildCleanEnv front-loads
  // ~/.local/bin); real `git` resolves from the system PATH the clean env keeps.
  const localBin = path.join(home, '.local', 'bin');
  fs.mkdirSync(localBin, { recursive: true });
  const fakeClaude = path.join(localBin, 'claude');
  fs.writeFileSync(fakeClaude, '#!/bin/sh\nexit 0\n');
  fs.chmodSync(fakeClaude, 0o755);

  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  await runSync(env);

  const desc = JSON.parse(fs.readFileSync(path.join(paths.state, 'descriptors', 'dream.json'), 'utf8'));
  assert.ok(desc.exec && desc.exec.claude, 'descriptor exec has claude after ONE sync');
  assert.ok(desc.exec.git, 'descriptor exec has git after ONE sync');

  // The digest re-derived NOW equals the one bound into the OS entry during the
  // same sync (inputs unchanged ⇒ no drift after a single sync).
  const job = jobsLib.findJob(paths, 'dream');
  const digest = descriptorMod.deriveDescriptorDigest(paths, job, { platform: process.platform });
  const entry = primaryEntry(paths, { name: 'dream', hour: 3, minute: 30 });
  const entryText = fs.readFileSync(entry.file, 'utf8');
  assert.ok(entryText.includes(digest), 'the OS entry binds the current descriptor digest (no drift after one sync)');
});

test('sync-repoint: --dry-run repoints nothing', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const job = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);
  const oldNode = '/old/checkout/bin/node';
  const o = { name: job.name, hour: 3, minute: 30 };
  const entry = primaryEntry(paths, o);
  fs.mkdirSync(path.dirname(entry.file), { recursive: true });
  fs.writeFileSync(entry.file, entry.render(oldNode));
  const manifest = manifestLib.load(paths);
  const rec = { kind: 'scheduler-entry', path: entry.file };
  if (entry.unload) rec.unload = entry.unload;
  manifestLib.record(manifest, rec);
  manifestLib.save(paths, manifest);

  await runSync(env, ['--dry-run']);

  assert.ok(fs.readFileSync(entry.file, 'utf8').includes(oldNode), 'dry-run left the stale entry untouched');
});

// WP-157 A10/R3:#4 + R4: the scheduled execution environment is a defined
// allowlist. run-job's buildCleanEnv reconstructs the config roots
// DETERMINISTICALLY beneath the bound home, and CLAUDE_CONFIG_DIR / CODEX_HOME /
// ANTHROPIC_API_KEY are NO LONGER passed through — an in-scope scheduler-env
// writer cannot move the model account / credential root / config root without a
// digest drift. (Placed here because scheduler-runjob.test.js is outside WP-157's
// Deliverables; see the PR "Discovered issues".)
test('sync-repoint: buildCleanEnv drops ambient CLAUDE_CONFIG_DIR/CODEX_HOME/ANTHROPIC_API_KEY and rebuilds config roots under the bound home (A10)', () => {
  const runjob = require('../../src/cli/run-job');
  const { paths } = setup();
  const saved = {
    CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
    CODEX_HOME: process.env.CODEX_HOME,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  };
  // Simulate a hostile environment.d / launchctl setenv write.
  process.env.CLAUDE_CONFIG_DIR = '/evil/claude';
  process.env.CODEX_HOME = '/evil/codex';
  process.env.ANTHROPIC_API_KEY = 'sk-evil';
  try {
    const clean = runjob.buildCleanEnv(paths, 'dream');
    // Config roots are code-derived from the BOUND home, never the ambient value.
    assert.equal(clean.CLAUDE_CONFIG_DIR, path.join(paths.home, '.claude'), 'CLAUDE_CONFIG_DIR reconstructed under the bound home');
    assert.equal(clean.CODEX_HOME, path.join(paths.home, '.codex'), 'CODEX_HOME reconstructed under the bound home');
    assert.notEqual(clean.CLAUDE_CONFIG_DIR, '/evil/claude', 'ambient CLAUDE_CONFIG_DIR does not leak through');
    assert.notEqual(clean.CODEX_HOME, '/evil/codex', 'ambient CODEX_HOME does not leak through');
    // No inherited API key on the scheduled path (subscription-authed, ADR-0009).
    assert.equal(clean.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY is not carried into the scheduled env');
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('sync-repoint: buildCleanEnv(win32) pins config roots under the bound home so ambient APPDATA/CLAUDE_CONFIG_DIR cannot move them (A10)', () => {
  const runjob = require('../../src/cli/run-job');
  const { paths } = setup();
  const keys = ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'ANTHROPIC_API_KEY', 'APPDATA', 'SystemRoot'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  process.env.CLAUDE_CONFIG_DIR = 'C:\\evil\\claude';
  process.env.CODEX_HOME = 'C:\\evil\\codex';
  process.env.ANTHROPIC_API_KEY = 'sk-evil';
  process.env.APPDATA = 'C:\\Users\\Evil\\AppData\\Roaming';
  process.env.SystemRoot = 'C:\\Windows';
  try {
    const clean = runjob.buildCleanEnv(paths, 'dream', 'win32');
    assert.equal(clean.CLAUDE_CONFIG_DIR, path.join(paths.home, '.claude'));
    assert.equal(clean.CODEX_HOME, path.join(paths.home, '.codex'));
    assert.notEqual(clean.CLAUDE_CONFIG_DIR, 'C:\\evil\\claude');
    assert.equal(clean.ANTHROPIC_API_KEY, undefined);
    // APPDATA still passes through (PATH/tooling) but does NOT determine the config root.
    assert.equal(clean.APPDATA, 'C:\\Users\\Evil\\AppData\\Roaming');
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});
