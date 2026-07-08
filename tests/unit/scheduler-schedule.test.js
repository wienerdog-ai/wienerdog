'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const { WienerdogError } = require('../../src/core/errors');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const gen = require('../../src/scheduler/generators');
const vendor = require('../../src/core/vendor');
const schedule = require('../../src/cli/schedule');

// Hermeticity: CI sets XDG_CONFIG_HOME to the real ~/.config, which
// systemdUserDir() prefers over $HOME. Unset it (this file runs in its own
// `node --test` process) so systemd units resolve under the temp HOME, never a
// real dir — and so parallel test files never collide on a shared unit path.
delete process.env.XDG_CONFIG_HOME;

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

const BASE_CONFIG = `# Wienerdog configuration
version: 1
vault: /Users/ada/wienerdog
harnesses:
  claude: true
  codex: false
memory_mode: standard
`;

/** Build an isolated temp core with a config + matching manifest. */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sched-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
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
 * Run schedule.run with process.env pointed at the temp core (getPaths reads env).
 * @param {{HOME:string, WIENERDOG_HOME:string}} env
 * @param {string[]} argv
 * @param {(a:string[])=>{status:number}} loader
 */
async function runSchedule(env, argv, loader) {
  const saved = { HOME: process.env.HOME, WIENERDOG_HOME: process.env.WIENERDOG_HOME };
  process.env.HOME = env.HOME;
  process.env.WIENERDOG_HOME = env.WIENERDOG_HOME;
  try {
    await schedule.run(argv, { loader });
  } finally {
    process.env.HOME = saved.HOME;
    process.env.WIENERDOG_HOME = saved.WIENERDOG_HOME;
  }
}

/**
 * Run `fn` with WP-071's suite-wide hard scheduler guard
 * (WIENERDOG_TEST_NO_REAL_SCHEDULER) cleared, restoring it afterwards. The
 * marker-based reverse/remove tests below deliberately swap a benign in-process
 * `node -e` command in as the entry's `unload`, then assert it EXECUTED — so they
 * must let schedulerSpawn actually spawn (never a real launchctl/systemctl/schtasks
 * command). Await it even for synchronous `fn`.
 * @template T @param {() => (T | Promise<T>)} fn @returns {Promise<T>}
 */
async function withUnloadSpawnAllowed(fn) {
  const saved = process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
  delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER;
    else process.env.WIENERDOG_TEST_NO_REAL_SCHEDULER = saved;
  }
}

// Whether `schedule add` can register on this host (skip integration otherwise).
const SCHED_SUPPORTED =
  process.platform === 'darwin' ||
  (process.platform === 'linux' &&
    (fs.existsSync('/run/systemd/system') || !spawnSync('systemctl', ['--version']).error));

// -------------------------------------------------------------------------
// jobs.js: parseJobs / renderConfigWithJobs round-trip + coexistence
// -------------------------------------------------------------------------

test('scheduler-schedule: renderConfigWithJobs round-trips through parseJobs', () => {
  const jobs = [
    { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 },
    { name: 'daily-digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 },
  ];
  const withJobs = jobsLib.renderConfigWithJobs(BASE_CONFIG, jobs);
  assert.deepEqual(jobsLib.parseJobs(withJobs), jobs);
  // Exactly one blank line before the managed section.
  assert.match(withJobs, /memory_mode: standard\n\n# --- wienerdog:jobs/);
});

test('scheduler-schedule: content outside the jobs sentinels is byte-identical (grants coexist)', () => {
  const GRANTS = `# --- wienerdog:grants (managed) ---
grants:
  - gmail
# --- end wienerdog:grants ---
`;
  const configWithGrants = `${BASE_CONFIG}\n${GRANTS}`;
  const jobs = [{ name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 }];
  const withJobs = jobsLib.renderConfigWithJobs(configWithGrants, jobs);
  // Grants block survives verbatim.
  assert.ok(withJobs.includes(GRANTS));
  // Removing all jobs restores the exact input.
  const back = jobsLib.renderConfigWithJobs(withJobs, []);
  assert.equal(back, configWithGrants);
});

test('scheduler-schedule: removing all jobs removes the whole section', () => {
  const jobs = [{ name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 }];
  const withJobs = jobsLib.renderConfigWithJobs(BASE_CONFIG, jobs);
  const back = jobsLib.renderConfigWithJobs(withJobs, []);
  assert.equal(back, BASE_CONFIG);
  assert.ok(!back.includes('wienerdog:jobs'));
});

test('scheduler-schedule: saveJob upserts and re-syncs the manifest hash', () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  // Upsert (replace) same name.
  jobsLib.saveJob(paths, { name: 'dream', at: '04:00', run: 'builtin:dream', timeoutMinutes: 30 });
  assert.equal(jobsLib.listJobs(paths).length, 1);
  assert.equal(jobsLib.findJob(paths, 'dream').at, '04:00');
  // Manifest hash re-synced → matches on-disk config.
  const manifest = manifestLib.load(paths);
  const entry = manifest.entries.find((e) => e.path === paths.config);
  assert.equal(entry.hash, sha256(fs.readFileSync(paths.config, 'utf8')));
});

test('scheduler-schedule: removeJob is a no-op when the job is absent', () => {
  const { paths } = setup();
  const before = fs.readFileSync(paths.config, 'utf8');
  jobsLib.removeJob(paths, 'ghost');
  assert.equal(fs.readFileSync(paths.config, 'utf8'), before);
});

test('scheduler-schedule: schedule.json watermark read/write', () => {
  const { paths } = setup();
  assert.deepEqual(jobsLib.readScheduleState(paths), {});
  jobsLib.writeScheduleState(paths, 'dream', { last_success: '2026-07-03T03:30:12.000Z', last_status: 'ok' });
  jobsLib.writeScheduleState(paths, 'dream', { last_status: 'ok' });
  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_success, '2026-07-03T03:30:12.000Z');
  assert.equal(state.dream.last_status, 'ok');
});

// -------------------------------------------------------------------------
// manifest.js: scheduler-entry reverse (harmless marker command as the "spy")
// -------------------------------------------------------------------------

test('scheduler-schedule: reverseSchedulerEntry runs the stored unload then removes the file', async () => {
  const { root } = setup();
  const file = path.join(root, 'ai.wienerdog.x.plist');
  fs.writeFileSync(file, '<plist/>');
  const marker = path.join(root, 'unload-ran');
  const entry = {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  };
  const removed = [];
  const skipped = [];
  await withUnloadSpawnAllowed(() =>
    manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, new Set())
  );
  assert.ok(fs.existsSync(marker), 'unload argv was executed');
  assert.ok(!fs.existsSync(file), 'file removed');
  assert.deepEqual(removed, [file]);
});

test('scheduler-schedule: reverseSchedulerEntry --dry-run runs nothing but reports', () => {
  const { root } = setup();
  const file = path.join(root, 'ai.wienerdog.y.plist');
  fs.writeFileSync(file, '<plist/>');
  const marker = path.join(root, 'dry-marker');
  const entry = {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  };
  const removed = [];
  manifestLib.reverseSchedulerEntry(entry, true, removed, [], new Set());
  assert.ok(!fs.existsSync(marker), 'dry-run did not run the unload');
  assert.ok(fs.existsSync(file), 'dry-run did not remove the file');
  assert.deepEqual(removed, [file]);
});

test('scheduler-schedule: manifest.reverse handles scheduler-entry (unload + rm)', async () => {
  const { paths, root } = setup();
  const file = path.join(root, 'ai.wienerdog.z.plist');
  fs.writeFileSync(file, '<plist/>');
  const marker = path.join(root, 'reverse-ran');
  const manifest = manifestLib.load(paths);
  manifestLib.record(manifest, {
    kind: 'scheduler-entry',
    path: file,
    unload: [process.execPath, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`],
  });
  manifestLib.save(paths, manifest);
  const { removed } = await withUnloadSpawnAllowed(() =>
    manifestLib.reverse(paths, manifestLib.load(paths))
  );
  assert.ok(fs.existsSync(marker), 'reverse ran the stored unload');
  assert.ok(!fs.existsSync(file), 'reverse removed the entry file');
  assert.ok(removed.includes(file));
});

// -------------------------------------------------------------------------
// schedule.js: add / list / remove with a stubbed loader
// -------------------------------------------------------------------------

test('scheduler-schedule: add validates name, --at, and exactly-one-of skill/job', async () => {
  const { env } = setup();
  const loader = () => ({ status: 0 });
  await assert.rejects(runSchedule(env, ['add', 'Bad_Name', '--at', '07:00', '--job', 'dream'], loader));
  await assert.rejects(runSchedule(env, ['add', 'dream', '--at', '99:99', '--job', 'dream'], loader));
  await assert.rejects(runSchedule(env, ['add', 'dream', '--at', '07:00'], loader)); // neither skill nor job
  await assert.rejects(
    runSchedule(env, ['add', 'dream', '--at', '07:00', '--job', 'dream', '--skill', 's'], loader)
  ); // both
});

test('scheduler-schedule: add registers the platform entry, records manifest, saves the job', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const loader = (argv) => {
    calls.push(argv);
    return { status: 0 };
  };

  await runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], loader);

  // Job persisted with skill:<...> run and default timeout 15.
  assert.deepEqual(jobsLib.findJob(paths, 'daily-digest'), {
    name: 'daily-digest',
    at: '07:00',
    run: 'skill:wienerdog-daily-digest',
    timeoutMinutes: 15,
  });

  const manifest = manifestLib.load(paths);
  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  // Every recorded scheduler file exists on disk.
  for (const e of schedEntries) assert.ok(fs.existsSync(e.path), `${e.path} exists`);
  // At least one loader call happened (bootstrap / enable).
  assert.ok(calls.length >= 1);

  if (process.platform === 'darwin') {
    const uid = process.getuid();
    const label = 'ai.wienerdog.daily-digest';
    const plistPath = path.join(paths.home, 'Library', 'LaunchAgents', `${label}.plist`);
    const jobEntry = schedEntries.find((e) => e.path === plistPath);
    assert.ok(jobEntry, 'per-job plist entry recorded');
    assert.deepEqual(jobEntry.unload, ['launchctl', 'bootout', `gui/${uid}/${label}`]);
    assert.deepEqual(calls[0], ['launchctl', 'bootstrap', `gui/${uid}`, plistPath]);
    // Catch-up plist ensured once.
    const catchPath = path.join(paths.home, 'Library', 'LaunchAgents', 'ai.wienerdog.catchup.plist');
    assert.ok(schedEntries.some((e) => e.path === catchPath), 'catch-up entry recorded');
    assert.ok(fs.readFileSync(plistPath, 'utf8').includes('<string>run-job</string>'));
  } else {
    const base = 'wienerdog-daily-digest';
    const dir = gen.systemdUserDir(paths.home, process.env);
    const timerPath = path.join(dir, `${base}.timer`);
    const servicePath = path.join(dir, `${base}.service`);
    const timerEntry = schedEntries.find((e) => e.path === timerPath);
    const serviceEntry = schedEntries.find((e) => e.path === servicePath);
    assert.ok(timerEntry && serviceEntry);
    assert.deepEqual(timerEntry.unload, ['systemctl', '--user', 'disable', '--now', `${base}.timer`]);
    assert.equal(serviceEntry.unload, undefined, 'the .service entry carries no unload');
    assert.deepEqual(calls[0], ['systemctl', '--user', 'daemon-reload']);
  }
});

test('scheduler-schedule: a second identical add is idempotent (no OS call)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env } = setup();
  const calls1 = [];
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (a) => (calls1.push(a), { status: 0 }));
  assert.ok(calls1.length >= 1);
  const calls2 = [];
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], (a) => (calls2.push(a), { status: 0 }));
  assert.equal(calls2.length, 0, 'no loader calls on an unchanged re-add');
});

test('scheduler-schedule: add then manifest.reverse still removes config.yaml (hash re-synced)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));
  assert.ok(fs.existsSync(paths.config));
  // Rewrite scheduler-entry unloads to harmless markers so reverse never calls launchctl/systemctl.
  const manifest = manifestLib.load(paths);
  for (const e of manifest.entries) {
    if (e.kind === 'scheduler-entry') e.unload = [process.execPath, '-e', '0'];
  }
  manifestLib.save(paths, manifest);
  manifestLib.reverse(paths, manifestLib.load(paths));
  assert.ok(!fs.existsSync(paths.config), 'config.yaml removed — not mistaken for a user edit');
});

test('scheduler-schedule: remove runs the unload, deletes files, drops entries and the job', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths, root } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));

  // Replace the per-job entry's unload with a marker command (avoid real launchctl/systemctl).
  const marker = path.join(root, 'remove-unload-ran');
  const manifest = manifestLib.load(paths);
  const jobBasenames = new Set([
    'ai.wienerdog.dream.plist',
    'wienerdog-dream.timer',
    'wienerdog-dream.service',
  ]);
  const jobFiles = [];
  for (const e of manifest.entries) {
    if (e.kind === 'scheduler-entry' && jobBasenames.has(path.basename(e.path))) {
      jobFiles.push(e.path);
      if (e.unload) {
        e.unload = [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x')`];
      }
    }
  }
  manifestLib.save(paths, manifest);

  await withUnloadSpawnAllowed(() => runSchedule(env, ['remove', 'dream'], () => ({ status: 0 })));

  assert.ok(fs.existsSync(marker), 'stored unload ran during remove');
  for (const f of jobFiles) assert.ok(!fs.existsSync(f), `${f} deleted`);
  assert.equal(jobsLib.findJob(paths, 'dream'), null, 'job dropped from config');
  const after = manifestLib.load(paths);
  const remainingJob = after.entries.filter(
    (e) => e.kind === 'scheduler-entry' && jobBasenames.has(path.basename(e.path))
  );
  assert.equal(remainingJob.length, 0, 'per-job scheduler entries removed from manifest');
});

test('scheduler-schedule: remove of an unknown job is a no-op notice', async () => {
  const { env } = setup();
  await runSchedule(env, ['remove', 'nope'], () => ({ status: 0 })); // must not throw
});

// -------------------------------------------------------------------------
// schedule.js: win32 dispatch via the injected `platform` seam (no real
// schtasks; POSIX-runnable). Covers the owner amendment (validator-before-
// renderer), the two-task registration/argv, idempotency, and remove().
// -------------------------------------------------------------------------

test('scheduler-schedule: win32 dispatch rejects a hostile job name BEFORE rendering XML or writing a file', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => (calls.push(a), { status: 0 });
  const schedulesDir = gen.windowsTasksDir(paths);

  assert.throws(
    () => schedule.registerPlatform(paths, manifest, { name: 'foo&<bar>', hour: 3, minute: 30 }, loader, 'win32'),
    (err) => err instanceof WienerdogError
  );
  // Validator ran before any side effect: no XML written, no manifest entry, no loader call.
  const wrote = fs.existsSync(schedulesDir) && fs.readdirSync(schedulesDir).length > 0;
  assert.ok(!wrote, 'no XML file was written for the hostile name');
  assert.equal(
    manifest.entries.filter((e) => e.kind === 'scheduler-entry').length,
    0,
    'no scheduler-entry recorded for the hostile name'
  );
  assert.equal(calls.length, 0, 'the loader was never invoked');
});

test('scheduler-schedule: win32 dispatch writes both XMLs, records reversible entries, calls loader, returns schtasks', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  /** @type {string[][]} */ const calls = [];
  const loader = (a) => (calls.push(a), { status: 0 });

  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.deepEqual(res, { platform: 'schtasks', changed: true, loaded: true });

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const catchupXml = gen.windowsTaskFile(paths, 'catchup');
  assert.equal(path.dirname(dreamXml), gen.windowsTasksDir(paths));
  assert.ok(fs.existsSync(dreamXml) && fs.existsSync(catchupXml), 'both XML artifacts written under <core>/schedules');
  // Both files are UTF-16 LE with a BOM (schtasks rejects UTF-8): leading 0xFF 0xFE.
  const dreamBytes = fs.readFileSync(dreamXml);
  const catchupBytes = fs.readFileSync(catchupXml);
  assert.equal(dreamBytes[0], 0xff);
  assert.equal(dreamBytes[1], 0xfe);
  assert.equal(catchupBytes[0], 0xff);
  assert.equal(catchupBytes[1], 0xfe);
  // Decoding past the BOM yields the renderer strings (UTF-16 declaration, no LogonTrigger).
  const dreamText = dreamBytes.slice(2).toString('utf16le');
  const catchupText = catchupBytes.slice(2).toString('utf16le');
  assert.ok(dreamText.startsWith('<?xml version="1.0" encoding="UTF-16"?>'));
  assert.ok(dreamText.includes('<URI>\\Wienerdog\\dream</URI>'));
  assert.ok(catchupText.includes('run-job --catch-up'));
  assert.ok(!catchupText.includes('<LogonTrigger>'), 'catchup task carries no LogonTrigger');

  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  const dreamEntry = schedEntries.find((e) => e.path === dreamXml);
  const catchupEntry = schedEntries.find((e) => e.path === catchupXml);
  assert.ok(dreamEntry && catchupEntry, 'two scheduler entries recorded');
  assert.deepEqual(dreamEntry.unload, ['schtasks', '/delete', '/tn', '\\Wienerdog\\dream', '/f']);
  assert.deepEqual(catchupEntry.unload, ['schtasks', '/delete', '/tn', '\\Wienerdog\\catchup', '/f']);

  assert.deepEqual(calls, [
    ['schtasks', '/create', '/tn', '\\Wienerdog\\dream', '/xml', dreamXml, '/f'],
    ['schtasks', '/create', '/tn', '\\Wienerdog\\catchup', '/xml', catchupXml, '/f'],
  ]);
});

test('scheduler-schedule: a second identical win32 dispatch is idempotent (no rewrite, no loader call)', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');
  manifestLib.save(paths, manifest);

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const mtimeBefore = fs.statSync(dreamXml).mtimeMs;

  /** @type {string[][]} */ const calls = [];
  const manifest2 = manifestLib.load(paths);
  const res = schedule.registerPlatform(
    paths,
    manifest2,
    { name: 'dream', hour: 3, minute: 30 },
    (a) => (calls.push(a), { status: 0 }),
    'win32'
  );
  assert.equal(res.changed, false, 'unchanged re-register reports changed:false');
  assert.equal(calls.length, 0, 'no loader calls on an unchanged re-register');
  assert.equal(fs.statSync(dreamXml).mtimeMs, mtimeBefore, 'the XML file was not rewritten');
});

test('scheduler-schedule: ensureDreamSchedule(platform:win32) schedules the dream (not "unsupported")', () => {
  const { paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), { status: 0 }), platform: 'win32' });
  assert.deepEqual(res, { scheduled: true, at: '03:30' });
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  const manifest = manifestLib.load(paths);
  const schedEntries = manifest.entries.filter((e) => e.kind === 'scheduler-entry');
  assert.ok(schedEntries.some((e) => e.path === gen.windowsTaskFile(paths, 'dream')), 'dream task registered');
  assert.ok(schedEntries.some((e) => e.path === gen.windowsTaskFile(paths, 'catchup')), 'catch-up task registered');
  assert.ok(calls.length >= 2, 'both schtasks /create argvs issued');

  // Second call is idempotent at the job level.
  const res2 = schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }), platform: 'win32' });
  assert.deepEqual(res2, { scheduled: false, reason: 'exists' });
});

test('scheduler-schedule: registerPlatform reports loaded:false when the schtasks /create is rejected', () => {
  const { paths } = setup();
  const manifest = manifestLib.load(paths);
  // Reject only the PRIMARY create (dream); the catch-up create succeeds — loaded
  // must still be false because ONE mutation failed.
  const loader = (a) => ({ status: a.includes('\\Wienerdog\\dream') ? 1 : 0 });
  const res = schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, loader, 'win32');
  assert.deepEqual(res, { platform: 'schtasks', changed: true, loaded: false });
});

test('scheduler-schedule: ensureDreamSchedule returns reason:load-failed when the OS scheduler rejects the task', () => {
  const { paths } = setup();
  const loader = () => ({ status: 1 }); // every schtasks /create is rejected
  const res = schedule.ensureDreamSchedule(paths, { loader, platform: 'win32' });
  assert.deepEqual(res, { scheduled: false, reason: 'load-failed', at: '03:30' });
  // The job definition is still persisted (it can be retried via sync/doctor).
  assert.ok(jobsLib.findJob(paths, 'dream'), 'dream job persisted despite the load failure');
});

test('scheduler-schedule: add fails loud (throws) when the OS scheduler rejects the new task', { skip: !SCHED_SUPPORTED }, async () => {
  const { env } = setup();
  const loader = () => ({ status: 1 }); // schtasks/launchctl/systemctl rejects it
  await assert.rejects(
    runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], loader),
    (err) => err instanceof WienerdogError && /NOT active/.test(err.message)
  );
});

test('scheduler-schedule: remove after a win32 register reverses the dream entry, leaves the shared catch-up', async () => {
  const { env, paths, root } = setup();
  const manifest = manifestLib.load(paths);
  schedule.registerPlatform(paths, manifest, { name: 'dream', hour: 3, minute: 30 }, () => ({ status: 0 }), 'win32');
  manifestLib.save(paths, manifest);
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  const dreamXml = gen.windowsTaskFile(paths, 'dream');
  const catchupXml = gen.windowsTaskFile(paths, 'catchup');

  // Swap the dream entry's unload for a marker so remove never spawns a real schtasks.
  const marker = path.join(root, 'win32-remove-unload-ran');
  const m2 = manifestLib.load(paths);
  for (const e of m2.entries) {
    if (e.kind === 'scheduler-entry' && e.path === dreamXml) {
      e.unload = [process.execPath, '-e', `require('fs').appendFileSync(${JSON.stringify(marker)}, 'x')`];
    }
  }
  manifestLib.save(paths, m2);

  await withUnloadSpawnAllowed(() => runSchedule(env, ['remove', 'dream'], () => ({ status: 0 })));

  assert.ok(fs.existsSync(marker), 'the stored schtasks-delete unload ran during remove');
  assert.ok(!fs.existsSync(dreamXml), 'the dream XML was deleted');
  assert.ok(fs.existsSync(catchupXml), 'the shared catch-up XML remains until uninstall');
  assert.equal(jobsLib.findJob(paths, 'dream'), null, 'the dream job was dropped from config');
  const after = manifestLib.load(paths);
  assert.ok(!after.entries.some((e) => e.kind === 'scheduler-entry' && e.path === dreamXml), 'dream entry gone');
  assert.ok(after.entries.some((e) => e.kind === 'scheduler-entry' && e.path === catchupXml), 'catch-up entry kept');
});

// -------------------------------------------------------------------------
// schedule.js: repointSchedules (ADR-0013 migration) — idempotent re-register,
// stale-path rewrite, unsupported-platform degrade.
// -------------------------------------------------------------------------

/**
 * The primary scheduler-entry file for a job on the current platform whose
 * content embeds the wienerdog bin path: the launchd plist on darwin, the
 * systemd .service on Linux.
 * @param {import('../../src/core/paths').WienerdogPaths} paths
 * @param {string} name
 * @returns {string}
 */
function primaryEntryFile(paths, name) {
  if (process.platform === 'darwin') {
    return path.join(gen.launchAgentsDir(paths.home), `${gen.launchdLabel(name)}.plist`);
  }
  return path.join(gen.systemdUserDir(paths.home, process.env), `${gen.systemdUnitBase(name)}.service`);
}

test('scheduler-schedule: repointSchedules after add is a no-op (changed:0, no OS call)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));

  const calls = [];
  const manifest = manifestLib.load(paths);
  const res = schedule.repointSchedules(paths, manifest, { loader: (a) => (calls.push(a), { status: 0 }) });

  assert.equal(res.repointed, 1, 'the one defined job was re-registered');
  assert.equal(res.changed, 0, 'content already targets the stable bin — nothing rewritten');
  assert.deepEqual(res.notices, []);
  assert.equal(calls.length, 0, 'no OS reload on an unchanged repoint');
});

test('scheduler-schedule: repointSchedules rewrites a stale bin path (changed:1)', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));

  // Simulate an older version's entry: hand-edit the embedded bin to a stale path.
  const file = primaryEntryFile(paths, 'dream');
  const stableBin = vendor.currentBin(paths);
  const oldBin = '/old/npx-cache/node_modules/wienerdog/bin/wienerdog.js';
  const stale = fs.readFileSync(file, 'utf8').split(stableBin).join(oldBin);
  assert.ok(stale.includes(oldBin) && !stale.includes(stableBin), 'seeded a stale entry');
  fs.writeFileSync(file, stale);

  const calls = [];
  const manifest = manifestLib.load(paths);
  const res = schedule.repointSchedules(paths, manifest, { loader: (a) => (calls.push(a), { status: 0 }) });

  assert.equal(res.changed, 1, 'the stale entry was rewritten');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.includes(stableBin) && !after.includes(oldBin), 'entry now targets the stable bin');
  assert.ok(calls.length >= 1, 'the OS scheduler was reloaded');
});

test('scheduler-schedule: repointSchedules degrades on an unsupported platform (notice, no throw)', async () => {
  const { paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'sunos', configurable: true });
  try {
    const manifest = manifestLib.load(paths);
    const res = schedule.repointSchedules(paths, manifest, { loader: () => ({ status: 0 }) });
    assert.equal(res.repointed, 0, 'nothing registered on an unschedulable platform');
    assert.equal(res.changed, 0);
    assert.equal(res.notices.length, 1, 'the job is collected as a notice, not a throw');
    assert.match(res.notices[0], /could not repoint "dream"/);
  } finally {
    Object.defineProperty(process, 'platform', orig);
  }
});

// -------------------------------------------------------------------------
// schedule.js: ensureDreamSchedule (ADR-0014) — schedules once at 03:30,
// idempotent, degrades on an unsupported platform without throwing.
// -------------------------------------------------------------------------

test('scheduler-schedule: ensureDreamSchedule schedules dream once at 03:30', { skip: !SCHED_SUPPORTED }, () => {
  const { paths } = setup();
  /** @type {string[][]} */ const calls = [];
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), { status: 0 }) });

  assert.deepEqual(res, { scheduled: true, at: '03:30' });
  // Job persisted with builtin:dream + 20-minute timeout.
  assert.deepEqual(jobsLib.findJob(paths, 'dream'), {
    name: 'dream',
    at: '03:30',
    run: 'builtin:dream',
    timeoutMinutes: 20,
  });
  // config.yaml gained the managed jobs block.
  assert.match(fs.readFileSync(paths.config, 'utf8'), /wienerdog:jobs/);
  // A scheduler-entry was recorded, and the OS loader was called at least once.
  const manifest = manifestLib.load(paths);
  assert.ok(manifest.entries.some((e) => e.kind === 'scheduler-entry'), 'scheduler-entry recorded');
  assert.ok(calls.length >= 1, 'the OS scheduler was invoked');
});

test('scheduler-schedule: ensureDreamSchedule is idempotent (second call no-ops)', { skip: !SCHED_SUPPORTED }, () => {
  const { paths } = setup();
  schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }) });
  /** @type {string[][]} */ const calls = [];
  const res = schedule.ensureDreamSchedule(paths, { loader: (a) => (calls.push(a), { status: 0 }) });
  assert.deepEqual(res, { scheduled: false, reason: 'exists' });
  assert.equal(calls.length, 0, 'no OS call when the dream job already exists');
  assert.equal(jobsLib.listJobs(paths).filter((j) => j.name === 'dream').length, 1, 'still exactly one dream job');
});

test('scheduler-schedule: ensureDreamSchedule degrades on an unsupported platform (no throw)', () => {
  const { paths } = setup();
  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'sunos', configurable: true });
  let res;
  try {
    res = schedule.ensureDreamSchedule(paths, { loader: () => ({ status: 0 }) });
  } finally {
    Object.defineProperty(process, 'platform', orig);
  }
  assert.equal(res.scheduled, false);
  assert.equal(res.reason, 'unsupported');
  assert.ok(res.message, 'a plain-language reason is surfaced');
  // The job definition is retained so the user can schedule it later once supported.
  assert.ok(jobsLib.findJob(paths, 'dream'), 'dream job definition kept despite the unschedulable platform');
});

test('scheduler-schedule: list --json reports jobs with watermarks', { skip: !SCHED_SUPPORTED }, async () => {
  const { env, paths } = setup();
  await runSchedule(env, ['add', 'dream', '--at', '03:30', '--job', 'dream'], () => ({ status: 0 }));
  await runSchedule(env, ['add', 'daily-digest', '--at', '07:00', '--skill', 'wienerdog-daily-digest'], () => ({ status: 0 }));
  jobsLib.writeScheduleState(paths, 'dream', { last_success: '2026-07-03T03:30:12.000Z', last_status: 'ok' });

  let out = '';
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (s) => ((out += s), true);
  try {
    await runSchedule(env, ['list', '--json'], () => ({ status: 0 }));
  } finally {
    process.stdout.write = orig;
  }
  const parsed = JSON.parse(out);
  const dream = parsed.find((j) => j.name === 'dream');
  const digest = parsed.find((j) => j.name === 'daily-digest');
  assert.equal(dream.last_success, '2026-07-03T03:30:12.000Z');
  assert.equal(dream.last_status, 'ok');
  assert.equal(digest.last_success, null);
  assert.equal(digest.last_status, null);
});
