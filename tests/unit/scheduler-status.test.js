'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const status = require('../../src/scheduler/status');

const isPosix = process.platform !== 'win32';

// Hermeticity: CI may set XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so scheduler roots resolve under the temp HOME.
delete process.env.XDG_CONFIG_HOME;

/**
 * Build an isolated temp core with a manifest holding the given scheduler + other
 * entries. `makeEntries` receives the temp home so entry paths can be rooted under
 * it without a TDZ on the destructured `root`. No real ~/.wienerdog is touched.
 * @param {((home:string)=>import('../../src/core/manifest').ManifestEntry[])} [makeEntries]
 */
function setup(makeEntries = () => []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sched-status-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [{ kind: 'dir', path: paths.core }, ...makeEntries(root)],
  });
  return { root, env, paths };
}

const launchdEntry = (home, name) => ({
  kind: 'scheduler-entry',
  path: path.join(home, 'Library', 'LaunchAgents', `ai.wienerdog.${name}.plist`),
  unload: ['launchctl', 'bootout', `gui/501/ai.wienerdog.${name}`],
});

// ---------------------------------------------------------------------------
// describeEntry — RE-DERIVES the read-only probe from the basename IDENTITY,
// never from the untrusted stored unload argv (ADR-0027, WP-145 fix-pass F34).
// No reload argv is produced here (the heal regenerates canonical content).
// ---------------------------------------------------------------------------

test('describeEntry re-derives the launchd probe from the basename (ignores unload); uid comes from process.getuid', () => {
  // A poisoned unload must be irrelevant — the probe is derived from the path.
  const entry = { ...launchdEntry('/home/ada', 'dream'), unload: ['/bin/sh', '-c', 'evil'] };
  const d = status.describeEntry(entry);
  assert.deepEqual(d, {
    name: 'dream',
    scheduler: 'launchd',
    probe: ['launchctl', 'print', `gui/${process.getuid()}/ai.wienerdog.dream`],
  });
});

test('describeEntry re-derives a systemd timer probe from the basename (probes the .timer)', () => {
  const entry = {
    kind: 'scheduler-entry',
    path: '/home/ada/.config/systemd/user/wienerdog-dream.timer',
    unload: ['/bin/sh', '-c', 'evil'], // ignored
  };
  assert.deepEqual(status.describeEntry(entry), {
    name: 'dream',
    scheduler: 'systemd',
    probe: ['systemctl', '--user', 'is-active', 'wienerdog-dream.timer'],
  });
});

test('describeEntry re-derives a schtasks probe from the basename', () => {
  const entry = {
    kind: 'scheduler-entry',
    path: '/c/core/schedules/wienerdog-dream.xml',
    unload: ['/bin/sh', '-c', 'evil'], // ignored
  };
  assert.deepEqual(status.describeEntry(entry), {
    name: 'dream',
    scheduler: 'schtasks',
    probe: ['schtasks', '/query', '/tn', '\\Wienerdog\\dream'],
  });
});

test('describeEntry returns null for an unrecognized basename (systemd .service or foreign)', () => {
  assert.equal(status.describeEntry({ path: '/x/wienerdog-dream.service' }), null);
  assert.equal(status.describeEntry({ path: '/x/com.apple.thing.plist' }), null);
  assert.equal(status.describeEntry({ path: '/x/foreign.txt' }), null);
});

// ---------------------------------------------------------------------------
// defaultProbe — exit-code → status mapping (the incident's read-only probe)
// ---------------------------------------------------------------------------

test('defaultProbe maps exit 0 → loaded, non-zero → missing, spawn error → missing', () => {
  const saved = {
    noop: process.env.WIENERDOG_LOADER_NOOP,
    guard: process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER,
  };
  delete process.env.WIENERDOG_LOADER_NOOP;
  delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
  try {
    const node = process.execPath; // harmless real spawn — never the OS scheduler
    assert.equal(status.defaultProbe([node, '-e', 'process.exit(0)']), 'loaded');
    assert.equal(status.defaultProbe([node, '-e', 'process.exit(3)']), 'missing');
    assert.equal(status.defaultProbe(['wd-no-such-binary-xyz-42']), 'missing');
  } finally {
    if (saved.noop !== undefined) process.env.WIENERDOG_LOADER_NOOP = saved.noop;
    if (saved.guard !== undefined) process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = saved.guard;
  }
});

test('defaultProbe returns unknown (neutralized) when a test seam is set', () => {
  const saved = process.env.WIENERDOG_LOADER_NOOP;
  process.env.WIENERDOG_LOADER_NOOP = '1';
  try {
    assert.equal(status.defaultProbe(['launchctl', 'print', 'gui/501/x']), 'unknown');
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_LOADER_NOOP;
    else process.env.WIENERDOG_LOADER_NOOP = saved;
  }
});

// ---------------------------------------------------------------------------
// probeAll — iterates manifest scheduler-entries via the injected probe seam
// ---------------------------------------------------------------------------

test('probeAll probes every registered scheduler-entry; skips no-unload + non-scheduler', () => {
  const { paths } = setup((home) => [
    launchdEntry(home, 'dream'),
    launchdEntry(home, 'catchup'),
    { kind: 'scheduler-entry', path: '/x/wienerdog-dream.service' }, // no unload → skipped
    { kind: 'file', path: '/x/config.yaml' }, // non-scheduler → skipped
  ]);
  const probe = (argv) => (argv[2].endsWith('dream') ? 'loaded' : 'missing');
  const res = status.probeAll(paths, { probe });
  assert.deepEqual(res, [
    { name: 'dream', scheduler: 'launchd', status: 'loaded' },
    { name: 'catchup', scheduler: 'launchd', status: 'missing' },
  ]);
});

test('probeAll honors the WIENERDOG_SCHEDULER_PROBE env map (overrides by name)', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  const saved = process.env.WIENERDOG_SCHEDULER_PROBE;
  process.env.WIENERDOG_SCHEDULER_PROBE = JSON.stringify({ dream: 'missing', catchup: 'loaded' });
  try {
    const res = status.probeAll(paths, { probe: () => 'unknown' });
    assert.deepEqual(res, [
      { name: 'dream', scheduler: 'launchd', status: 'missing' },
      { name: 'catchup', scheduler: 'launchd', status: 'loaded' },
    ]);
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_SCHEDULER_PROBE;
    else process.env.WIENERDOG_SCHEDULER_PROBE = saved;
  }
});

// ---------------------------------------------------------------------------
// doctorSchedulerChecks — one line per entry (LIVE probe)
// ---------------------------------------------------------------------------

test('doctorSchedulerChecks: loaded → ok, missing → warn, unknown → omitted', () => {
  const { paths } = setup((home) => [
    launchdEntry(home, 'dream'),
    launchdEntry(home, 'catchup'),
    launchdEntry(home, 'digest'),
  ]);
  const probe = (argv) => {
    if (argv[2].endsWith('dream')) return 'loaded';
    if (argv[2].endsWith('catchup')) return 'missing';
    return 'unknown';
  };
  const out = status.doctorSchedulerChecks(paths, { probe });
  assert.deepEqual(out, [
    { status: 'ok', msg: "scheduled job 'dream' is loaded (launchd)" },
    {
      status: 'warn',
      msg: "scheduled job 'catchup' is configured but NOT loaded in launchd — run 'wienerdog sync' to reload it",
    },
  ]);
});

// ---------------------------------------------------------------------------
// refresh + read + render — the cache-then-render split
// ---------------------------------------------------------------------------

test('refreshSchedulerStatus writes the cache atomically; readSchedulerStatus round-trips', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  const probe = (argv) => (argv[2].endsWith('dream') ? 'loaded' : 'missing');
  status.refreshSchedulerStatus(paths, { probe });
  assert.ok(fs.existsSync(status.statusPath(paths)), 'cache file written');
  const cached = status.readSchedulerStatus(paths);
  assert.ok(typeof cached.checked_at === 'string');
  assert.deepEqual(cached.entries, [
    { name: 'dream', scheduler: 'launchd', status: 'loaded' },
    { name: 'catchup', scheduler: 'launchd', status: 'missing' },
  ]);
});

test('refreshSchedulerStatus is no-op-safe with no scheduler entries and never throws', () => {
  const { paths } = setup();
  assert.doesNotThrow(() => status.refreshSchedulerStatus(paths));
  assert.deepEqual(status.readSchedulerStatus(paths).entries, []);
});

test('readSchedulerStatus returns {entries:[]} on a missing/corrupt cache', () => {
  const { paths } = setup();
  assert.deepEqual(status.readSchedulerStatus(paths), { entries: [] });
  fs.writeFileSync(status.statusPath(paths), 'not json');
  assert.deepEqual(status.readSchedulerStatus(paths), { entries: [] });
});

test('renderSchedulerStatusLine: singular missing job', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  status.refreshSchedulerStatus(paths, { probe: (a) => (a[2].endsWith('dream') ? 'missing' : 'loaded') });
  const line = status.renderSchedulerStatusLine(paths);
  assert.match(line, /^> \[!warning\] Wienerdog: the scheduled job "dream" is set up but not currently active/);
  assert.match(line, /Run 'wienerdog sync' to reactivate it\./);
  assert.doesNotMatch(line, /jobs/);
});

test('renderSchedulerStatusLine: plural missing jobs', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  status.refreshSchedulerStatus(paths, { probe: () => 'missing' });
  const line = status.renderSchedulerStatusLine(paths);
  assert.match(line, /the scheduled jobs "dream", "catchup" are set up/);
  assert.match(line, /reactivate them\./);
});

test('renderSchedulerStatusLine: empty when nothing is missing', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream')]);
  status.refreshSchedulerStatus(paths, { probe: () => 'loaded' });
  assert.equal(status.renderSchedulerStatusLine(paths), '');
});

// ---------------------------------------------------------------------------
// reloadMissing — the ONLY mutation. It heals ONLY configured, code-recognized
// jobs by REGENERATING canonical content (ADR-0027, WP-145 fix-pass F34), never
// by iterating manifest entries or executing a stored unload argv, and never
// touches the catch-up entry [R5/R6].
// ---------------------------------------------------------------------------

/** Write a minimal config so jobsLib can read/upsert jobs. */
function withConfig(paths, jobs = []) {
  fs.writeFileSync(paths.config, 'version: 1\nvault: /x/vault\n');
  for (const j of jobs) jobsLib.saveJob(paths, { at: '03:30', run: 'builtin:dream', timeoutMinutes: 20, ...j });
}

const laPath = (paths, name) =>
  path.join(paths.home, 'Library', 'LaunchAgents', `ai.wienerdog.${name}.plist`);

test('reloadMissing REGENERATES the canonical plist for a configured missing job; the poisoned entry.unload never runs (F34)', () => {
  const { root, paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  // A real in-root dream plist with ATTACKER bytes, plus a manifest entry
  // carrying a poisoned unload argv the heal must never read or execute.
  const plistPath = laPath(paths, 'dream');
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, '<plist>ATTACKER</plist>\n');
  const canary = path.join(root, 'canary.txt');
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: plistPath, unload: ['/bin/sh', '-c', `touch ${canary}`] });
  manifestLib.save(paths, manifest);

  /** @type {string[][]} */ const calls = [];
  const res = status.reloadMissing(paths, { loader: (a) => (calls.push(a), { status: 0 }), probe: () => 'missing', platform: 'darwin' });

  assert.deepEqual(res.reloaded, ['dream']);
  assert.ok(!fs.existsSync(canary), 'the stored unload argv is NEVER executed (ADR-0027)');
  assert.deepEqual(calls, [['launchctl', 'bootstrap', `gui/${process.getuid()}`, plistPath]]);
  const after = fs.readFileSync(plistPath, 'utf8');
  assert.ok(!after.includes('ATTACKER'), 'the found file is NOT registered — canonical content is regenerated');
  assert.ok(after.includes('<key>Label</key>') && after.includes('ai.wienerdog.dream'), 'canonical plist was written');
});

test('reloadMissing heals ONLY configured jobs — a recognized in-root non-configured plist is never registered (F34)', () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const laDir = path.join(paths.home, 'Library', 'LaunchAgents');
  fs.mkdirSync(laDir, { recursive: true });
  const evil = path.join(laDir, 'ai.wienerdog.evil.plist');
  fs.writeFileSync(evil, '<plist>EVIL</plist>\n');
  // A manifest attacker also records a scheduler-entry for it — irrelevant, the
  // heal iterates CONFIGURED jobs, not manifest entries.
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, { kind: 'scheduler-entry', path: evil, unload: ['launchctl', 'bootout', 'gui/0/ai.wienerdog.evil'] });
  manifestLib.save(paths, manifest);

  /** @type {string[][]} */ const calls = [];
  const res = status.reloadMissing(paths, { loader: (a) => (calls.push(a), { status: 0 }), probe: () => 'missing', platform: 'darwin' });

  assert.deepEqual(res.reloaded, ['dream']);
  assert.ok(calls.every((a) => !a.some((x) => String(x).includes('evil'))), 'the non-configured evil plist is never registered');
  assert.equal(fs.readFileSync(evil, 'utf8'), '<plist>EVIL</plist>\n', 'the evil plist is left untouched (not healed)');
});

test('reloadMissing refuses to heal onto a symlink at the canonical path (fail closed, zero register)', { skip: !isPosix }, () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const plistPath = laPath(paths, 'dream');
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  const target = path.join(paths.home, 'evil-target');
  fs.writeFileSync(target, 'x');
  fs.symlinkSync(target, plistPath); // planted symlink at the canonical name

  /** @type {string[][]} */ const calls = [];
  const res = status.reloadMissing(paths, { loader: (a) => (calls.push(a), { status: 0 }), probe: () => 'missing', platform: 'darwin' });

  assert.deepEqual(res.failed, ['dream']);
  assert.equal(calls.length, 0, 'a planted symlink is never registered');
  assert.equal(fs.lstatSync(plistPath).isSymbolicLink(), true, 'the symlink is left as-is (not followed or overwritten)');
});

test('reloadMissing NEVER creates or registers the catch-up entry [R5/R6]', () => {
  const { paths } = setup((home) => [
    // A manifest catch-up scheduler-entry with a poisoned unload — must be ignored.
    { kind: 'scheduler-entry', path: path.join(home, 'Library', 'LaunchAgents', 'ai.wienerdog.catchup.plist'), unload: ['/bin/sh', '-c', 'evil'] },
  ]);
  withConfig(paths, [{ name: 'dream' }]); // catch-up is NOT a configured job
  /** @type {string[][]} */ const calls = [];
  const res = status.reloadMissing(paths, { loader: (a) => (calls.push(a), { status: 0 }), probe: () => 'missing', platform: 'darwin' });
  assert.deepEqual(res.reloaded, ['dream']);
  assert.ok(calls.every((a) => !a.some((x) => String(x).includes('catchup'))), 'the heal never reloads the catch-up entry');
  assert.equal(fs.existsSync(laPath(paths, 'catchup')), false, 'the heal never writes a catch-up plist');
});

test('reloadMissing does zero probe/reload when there is no configured job (out-of-root manifest entry is never consulted)', () => {
  const { paths } = setup((home) => [
    { kind: 'scheduler-entry', path: '/tmp/ai.wienerdog.evil.plist', unload: ['/bin/sh', '-c', 'evil'] },
  ]);
  withConfig(paths, []); // no jobs
  let probes = 0;
  let loads = 0;
  const res = status.reloadMissing(paths, { loader: () => (loads++, { status: 0 }), probe: () => (probes++, 'missing'), platform: 'darwin' });
  assert.deepEqual(res, { reloaded: [], failed: [] });
  assert.equal(probes, 0, 'nothing configured → nothing probed (manifest entries are never iterated for heal)');
  assert.equal(loads, 0, 'nothing reloaded');
});

test('reloadMissing reloads nothing when every configured job is loaded', () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  let called = 0;
  const res = status.reloadMissing(paths, { loader: () => (called++, { status: 0 }), probe: () => 'loaded', platform: 'darwin' });
  assert.deepEqual(res.reloaded, []);
  assert.equal(called, 0);
});

test('reloadMissing never throws when the loader throws (best-effort heal)', () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }]);
  const loader = () => { throw new Error('boom'); };
  let res;
  assert.doesNotThrow(() => { res = status.reloadMissing(paths, { loader, probe: () => 'missing', platform: 'darwin' }); });
  assert.deepEqual(res.reloaded, []);
  assert.deepEqual(res.failed, ['dream']);
});

test('reloadMissing splits reloaded vs failed on the loader exit status', () => {
  const { paths } = setup();
  withConfig(paths, [{ name: 'dream' }, { name: 'digest', at: '07:00' }]);
  const loader = (argv) => ({ status: argv[argv.length - 1].endsWith('ai.wienerdog.dream.plist') ? 1 : 0 });
  const res = status.reloadMissing(paths, { loader, probe: () => 'missing', platform: 'darwin' });
  assert.deepEqual(res.reloaded, ['digest']);
  assert.deepEqual(res.failed, ['dream']);
});
