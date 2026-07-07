'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const status = require('../../src/scheduler/status');

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
// describeEntry — derives probe + reload argv from the stored unload argv
// ---------------------------------------------------------------------------

test('describeEntry parses a launchd entry into read-only probe + reload argv', () => {
  const entry = launchdEntry('/home/ada', 'dream');
  const d = status.describeEntry(entry);
  assert.deepEqual(d, {
    name: 'dream',
    scheduler: 'launchd',
    probe: ['launchctl', 'print', 'gui/501/ai.wienerdog.dream'],
    reload: ['launchctl', 'bootstrap', 'gui/501', entry.path],
  });
});

test('describeEntry parses a systemd timer entry (probes the .timer, not the .service)', () => {
  const entry = {
    kind: 'scheduler-entry',
    path: '/home/ada/.config/systemd/user/wienerdog-dream.timer',
    unload: ['systemctl', '--user', 'disable', '--now', 'wienerdog-dream.timer'],
  };
  const d = status.describeEntry(entry);
  assert.deepEqual(d, {
    name: 'dream',
    scheduler: 'systemd',
    probe: ['systemctl', '--user', 'is-active', 'wienerdog-dream.timer'],
    reload: ['systemctl', '--user', 'enable', '--now', 'wienerdog-dream.timer'],
  });
});

test('describeEntry parses a schtasks entry', () => {
  const entry = {
    kind: 'scheduler-entry',
    path: '/c/core/schedules/wienerdog-dream.xml',
    unload: ['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f'],
  };
  const d = status.describeEntry(entry);
  assert.deepEqual(d, {
    name: 'dream',
    scheduler: 'schtasks',
    probe: ['schtasks', '/query', '/tn', '\\Wienerdog\\dream'],
    reload: ['schtasks', '/create', '/tn', '\\Wienerdog\\dream', '/xml', entry.path, '/f'],
  });
});

test('describeEntry returns null for an entry with no unload (systemd .service) or unknown shape', () => {
  assert.equal(status.describeEntry({ path: '/x/wienerdog-dream.service' }), null);
  assert.equal(status.describeEntry({ path: '/x/y', unload: [] }), null);
  assert.equal(status.describeEntry({ path: '/x/y', unload: ['weird', 'thing'] }), null);
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
// reloadMissing — the ONLY mutation; heals only entries that probe missing
// ---------------------------------------------------------------------------

test('reloadMissing calls the loader ONLY for entries that probe missing', () => {
  const { root, paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  /** @type {string[][]} */ const calls = [];
  const loader = (argv) => { calls.push(argv); return { status: 0 }; };
  const probe = (argv) => (argv[2].endsWith('dream') ? 'missing' : 'loaded');
  const res = status.reloadMissing(paths, { loader, probe });
  assert.deepEqual(res.reloaded, ['dream']);
  assert.equal(calls.length, 1, 'loaded entry is NOT reloaded');
  assert.deepEqual(calls[0], [
    'launchctl', 'bootstrap', 'gui/501',
    path.join(root, 'Library', 'LaunchAgents', 'ai.wienerdog.dream.plist'),
  ]);
});

test('reloadMissing reloads nothing when all entries are loaded', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream'), launchdEntry(home, 'catchup')]);
  let called = 0;
  const res = status.reloadMissing(paths, { loader: () => { called += 1; return { status: 0 }; }, probe: () => 'loaded' });
  assert.deepEqual(res.reloaded, []);
  assert.equal(called, 0);
});

test('reloadMissing never throws when the loader throws (best-effort heal)', () => {
  const { paths } = setup((home) => [launchdEntry(home, 'dream')]);
  const loader = () => { throw new Error('boom'); };
  let res;
  assert.doesNotThrow(() => { res = status.reloadMissing(paths, { loader, probe: () => 'missing' }); });
  assert.deepEqual(res.reloaded, []); // push happens only after a successful loader call
});
