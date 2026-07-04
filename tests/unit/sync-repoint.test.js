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
 * The primary scheduler-entry file for a job on the current platform whose
 * content embeds the wienerdog bin path (the migration target): the launchd
 * plist on darwin, the systemd .service on Linux. `render(bin)` produces that
 * file's content for a given bin so we can seed an OLD-path version.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 * @param {{name:string, hour:number, minute:number}} o
 */
function primaryEntry(paths, o) {
  const node = gen.nodePath();
  const logDir = path.join(paths.logs, o.name);
  if (process.platform === 'darwin') {
    const label = gen.launchdLabel(o.name);
    const file = path.join(gen.launchAgentsDir(paths.home), `${label}.plist`);
    const unload = ['launchctl', 'bootout', `gui/${process.getuid()}/${label}`];
    return { file, unload, render: (bin) => gen.launchdPlist({ ...o, node, bin, logDir }) };
  }
  const unitBase = gen.systemdUnitBase(o.name);
  const dir = gen.systemdUserDir(paths.home, process.env);
  const file = path.join(dir, `${unitBase}.service`);
  return { file, unload: null, render: (bin) => gen.systemdService({ name: o.name, node, bin }) };
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

  // Seed an OLD-path entry as an older Wienerdog version would have left it: the
  // file exists on disk, a manifest scheduler-entry tracks it, and its embedded
  // bin points at a now-stale npx-cache path.
  const oldBin = path.join(env.HOME, '.npm', '_npx', 'deadbeef', 'node_modules', 'wienerdog', 'bin', 'wienerdog.js');
  const o = { name: job.name, hour: 3, minute: 30 };
  const entry = primaryEntry(paths, o);
  fs.mkdirSync(path.dirname(entry.file), { recursive: true });
  fs.writeFileSync(entry.file, entry.render(oldBin));
  const manifest = manifestLib.load(paths);
  const rec = { kind: 'scheduler-entry', path: entry.file };
  if (entry.unload) rec.unload = entry.unload;
  manifestLib.record(manifest, rec);
  manifestLib.save(paths, manifest);

  assert.ok(fs.readFileSync(entry.file, 'utf8').includes(oldBin), 'seeded file embeds the old bin');

  await runSync(env);

  const stableBin = vendor.currentBin(paths);
  const after = fs.readFileSync(entry.file, 'utf8');
  assert.ok(after.includes(stableBin), 'entry now targets the stable vendored bin');
  assert.ok(!after.includes(oldBin), 'the stale bin path is gone');

  // A second sync leaves the entry byte-identical (content matches → no rewrite).
  const before = fs.readFileSync(entry.file);
  await runSync(env);
  assert.ok(fs.readFileSync(entry.file).equals(before), 'second sync is a no-op on the entry');
});

test('sync-repoint: --dry-run repoints nothing', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  const job = { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 };
  jobsLib.saveJob(paths, job);
  const oldBin = '/old/checkout/bin/wienerdog.js';
  const o = { name: job.name, hour: 3, minute: 30 };
  const entry = primaryEntry(paths, o);
  fs.mkdirSync(path.dirname(entry.file), { recursive: true });
  fs.writeFileSync(entry.file, entry.render(oldBin));
  const manifest = manifestLib.load(paths);
  const rec = { kind: 'scheduler-entry', path: entry.file };
  if (entry.unload) rec.unload = entry.unload;
  manifestLib.record(manifest, rec);
  manifestLib.save(paths, manifest);

  await runSync(env, ['--dry-run']);

  assert.ok(fs.readFileSync(entry.file, 'utf8').includes(oldBin), 'dry-run left the stale entry untouched');
});
