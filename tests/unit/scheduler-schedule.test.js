'use strict';

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
const schedule = require('../../src/cli/schedule');

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

test('scheduler-schedule: reverseSchedulerEntry runs the stored unload then removes the file', () => {
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
  manifestLib.reverseSchedulerEntry(entry, false, removed, skipped, new Set());
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

test('scheduler-schedule: manifest.reverse handles scheduler-entry (unload + rm)', () => {
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
  const { removed } = manifestLib.reverse(paths, manifestLib.load(paths));
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

  await runSchedule(env, ['remove', 'dream'], () => ({ status: 0 }));

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
