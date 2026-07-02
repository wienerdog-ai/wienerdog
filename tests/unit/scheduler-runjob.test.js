'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { getPaths } = require('../../src/core/paths');
const manifestLib = require('../../src/core/manifest');
const jobsLib = require('../../src/scheduler/jobs');
const runjob = require('../../src/cli/run-job');

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

/** Build an isolated temp core with a config (vault under $HOME → TCC-safe) + manifest.
 *  @param {string} [vaultRel] relative-to-home vault dir (default 'wienerdog'). */
function setup(vaultRel = 'wienerdog') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  const vault = path.join(root, vaultRel);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  const config = `# Wienerdog configuration
version: 1
vault: ${vault}
`;
  fs.writeFileSync(paths.config, config);
  manifestLib.save(paths, {
    version: 1,
    createdAt: new Date().toISOString(),
    entries: [
      { kind: 'dir', path: paths.core },
      { kind: 'file', path: paths.config, hash: sha256(config) },
    ],
  });
  return { root, env, paths, vault };
}

/** Write an executable shell script and return its path. */
function writeScript(dir, name, lines) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, `${lines.join('\n')}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

/** Run runjob.run with process.env pointed at the temp core + seam overrides.
 *  @param {Record<string,string|undefined>} envOverrides
 *  @param {string[]} argv @param {object} opts */
async function withRun(env, envOverrides, argv, opts) {
  const keys = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_RUNJOB_CMD', 'WIENERDOG_RUNJOB_TIMEOUT_MS', 'WIENERDOG_SECRET_TEST'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  const all = { HOME: env.HOME, WIENERDOG_HOME: env.WIENERDOG_HOME, ...envOverrides };
  for (const k of keys) {
    if (all[k] === undefined) delete process.env[k];
    else process.env[k] = all[k];
  }
  try {
    await runjob.run(argv, opts);
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const noopLoader = () => ({ status: 0 });

// -------------------------------------------------------------------------
// buildCleanEnv (pure)
// -------------------------------------------------------------------------

test('scheduler-runjob: buildCleanEnv has absolute PATH+node dir, HOME, WIENERDOG_JOB, no leaks', () => {
  const { env, paths } = setup();
  const saved = {
    WIENERDOG_SECRET_TEST: process.env.WIENERDOG_SECRET_TEST,
    WIENERDOG_HOME: process.env.WIENERDOG_HOME,
  };
  process.env.WIENERDOG_SECRET_TEST = 'leak-me';
  process.env.WIENERDOG_HOME = env.WIENERDOG_HOME; // buildCleanEnv reads process.env for the allowlist
  try {
    const clean = runjob.buildCleanEnv(paths, 'dream');
    assert.equal(clean.HOME, paths.home);
    assert.equal(clean.WIENERDOG_JOB, 'dream');
    assert.ok(path.isAbsolute(clean.PATH.split(':')[0]));
    assert.ok(clean.PATH.split(':').includes(path.dirname(process.execPath)), 'PATH includes the node dir');
    assert.equal(clean.WIENERDOG_SECRET_TEST, undefined, 'non-allowlisted vars are not carried through');
    assert.equal(clean.WIENERDOG_HOME, env.WIENERDOG_HOME, 'allowlisted overrides pass through');
  } finally {
    for (const k of ['WIENERDOG_SECRET_TEST', 'WIENERDOG_HOME']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

// -------------------------------------------------------------------------
// resolveCommand
// -------------------------------------------------------------------------

test('scheduler-runjob: resolveCommand maps builtin:dream, skill:*, and rejects unknown', () => {
  const savedCmd = process.env.WIENERDOG_RUNJOB_CMD;
  delete process.env.WIENERDOG_RUNJOB_CMD;
  try {
    const d = runjob.resolveCommand({ name: 'dream', run: 'builtin:dream' });
    assert.deepEqual(d.args.slice(1), ['dream', '--yes']);
    const s = runjob.resolveCommand({ name: 'x', run: 'skill:wienerdog-daily-digest' });
    assert.equal(s.command, 'claude');
    assert.deepEqual(s.args, ['-p', '/wienerdog-daily-digest']);
    assert.throws(() => runjob.resolveCommand({ name: 'x', run: 'builtin:frobnicate' }), /unknown builtin/);
    assert.throws(() => runjob.resolveCommand({ name: 'x', run: 'weird:thing' }), /unknown job run kind/);
  } finally {
    if (savedCmd === undefined) delete process.env.WIENERDOG_RUNJOB_CMD;
    else process.env.WIENERDOG_RUNJOB_CMD = savedCmd;
  }
});

// -------------------------------------------------------------------------
// run-job <name> — success
// -------------------------------------------------------------------------

test('scheduler-runjob: a successful job writes last_success, tees a log, exits 0', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const marker = path.join(root, 'env-dump.txt');
  const fake = writeScript(root, 'ok.sh', [
    '#!/bin/sh',
    `printf '%s\\n%s\\n%s\\n%s\\n' "$PATH" "$HOME" "$WIENERDOG_JOB" "$WIENERDOG_SECRET_TEST" > ${JSON.stringify(marker)}`,
    'exit 0',
  ]);

  await withRun(env, { WIENERDOG_RUNJOB_CMD: fake, WIENERDOG_SECRET_TEST: 'leak' }, ['dream'], {
    loader: noopLoader,
  });

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'ok');
  assert.ok(state.dream.last_success, 'last_success watermark set');

  const logDir = path.join(paths.logs, 'dream');
  const logs = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));
  assert.equal(logs.length, 1, 'one per-run log file written');

  // The child ran under the clean env: WIENERDOG_JOB set, the secret NOT leaked.
  const [gotPath, gotHome, gotJob, gotSecret] = fs.readFileSync(marker, 'utf8').split('\n');
  assert.ok(gotPath.split(':').includes(path.dirname(process.execPath)));
  assert.equal(gotHome, paths.home);
  assert.equal(gotJob, 'dream');
  assert.equal(gotSecret, '', 'the non-allowlisted secret did not reach the child');
});

// -------------------------------------------------------------------------
// run-job <name> — non-zero exit
// -------------------------------------------------------------------------

test('scheduler-runjob: a non-zero exit records error, fails loud, throws', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 3']);
  /** @type {any[]} */ const alerts = [];
  const sendAlert = (_p, _n, subject) => (alerts.push(subject), { status: 0 });

  await assert.rejects(
    withRun(env, { WIENERDOG_RUNJOB_CMD: fake }, ['dream'], { sendAlert, loader: noopLoader }),
    /exited 3/
  );

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'error');
  assert.ok(state.dream.last_error_at);
  assert.deepEqual(alerts, ['job dream failed'], 'fail-loud email attempted');
});

// -------------------------------------------------------------------------
// run-job <name> — hang → watchdog kill-tree
// -------------------------------------------------------------------------

test('scheduler-runjob: a hanging job hits the watchdog, kills the tree, records error', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const pidFile = path.join(root, 'child.pid');
  const fake = writeScript(root, 'hang.sh', [
    '#!/bin/sh',
    `echo $$ > ${JSON.stringify(pidFile)}`,
    'sleep 30',
  ]);
  const sendAlert = () => ({ status: 0 });

  await assert.rejects(
    withRun(env, { WIENERDOG_RUNJOB_CMD: fake, WIENERDOG_RUNJOB_TIMEOUT_MS: '2000' }, ['dream'], {
      sendAlert,
      loader: noopLoader,
    }),
    /timed out/
  );

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'error');

  // The child process group was killed — its pid is gone.
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  assert.ok(Number.isInteger(pid) && pid > 0, 'child recorded its pid');
  await new Promise((r) => setTimeout(r, 100)); // let SIGKILL land
  let alive;
  try {
    process.kill(pid, 0);
    alive = true; // no error → the process still exists
  } catch (e) {
    alive = e.code === 'EPERM'; // EPERM → exists but not ours; ESRCH → gone
  }
  assert.equal(alive, false, 'no child survives the watchdog timeout');
});

// -------------------------------------------------------------------------
// TCC-guard refusal
// -------------------------------------------------------------------------

test('scheduler-runjob: a vault under a protected folder is refused before spawning', async () => {
  const { env, paths } = setup(path.join('Documents', 'vault'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  /** @type {any[]} */ const alerts = [];
  const sendAlert = (_p, _n, subject) => (alerts.push(subject), { status: 0 });

  await assert.rejects(
    withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
    /macOS protected folder \(Documents\)/
  );

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.digest.last_status, 'error');
  assert.deepEqual(alerts, ['job digest failed'], 'refusal fails loud');
  // No brain was spawned → no per-job log dir was created.
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

// -------------------------------------------------------------------------
// Fail-loud banner fallback
// -------------------------------------------------------------------------

test('scheduler-runjob: failLoud with no email prepends a banner to digest.md and never throws', async () => {
  const { paths } = setup();
  const digest = path.join(paths.state, 'digest.md');

  // Email fails → banner is created.
  await runjob.failLoud(paths, 'dream', 'brain exploded', 'tail...', { sendAlert: () => ({ status: 1 }) });
  let body = fs.readFileSync(digest, 'utf8');
  assert.match(body, /^> \[!warning\] Wienerdog job "dream" failed at .* — brain exploded\./);
  assert.match(body, /logs\/dream\/\.$/m);

  // A second failure prepends above the first (existing content preserved).
  fs.writeFileSync(digest, '# Existing digest\n');
  await runjob.failLoud(paths, 'dream', 'again', '', { sendAlert: () => ({ status: 1 }) });
  body = fs.readFileSync(digest, 'utf8');
  assert.match(body.split('\n')[0], /Wienerdog job "dream" failed/);
  assert.ok(body.includes('# Existing digest'), 'existing digest content preserved below the banner');

  // A throwing sendAlert must not escape failLoud (still falls back to banner).
  fs.rmSync(digest, { force: true });
  await runjob.failLoud(paths, 'dream', 'boom', '', {
    sendAlert: () => {
      throw new Error('alert crashed');
    },
  });
  assert.ok(fs.existsSync(digest), 'banner still written when the alert throws');
});

// -------------------------------------------------------------------------
// Log rotation
// -------------------------------------------------------------------------

test('scheduler-runjob: rotateLogs keeps only the newest 14 *.log files', () => {
  const { root } = setup();
  const dir = path.join(root, 'logdir');
  fs.mkdirSync(dir);
  const names = [];
  for (let i = 0; i < 20; i++) {
    const n = `2026-07-03T00-00-${String(i).padStart(2, '0')}-000Z.log`;
    names.push(n);
    fs.writeFileSync(path.join(dir, n), 'x');
  }
  fs.writeFileSync(path.join(dir, 'launchd.out.log'), 'keep-counts-too'); // 21 total *.log
  runjob.rotateLogs(dir);

  const remaining = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  assert.equal(remaining.length, 14);
  // The newest by name are kept; the oldest are gone.
  assert.ok(remaining.includes(names[19]), 'newest kept');
  assert.ok(!remaining.includes(names[0]), 'oldest deleted');
});

// -------------------------------------------------------------------------
// run-job --catch-up
// -------------------------------------------------------------------------

test('scheduler-runjob: --catch-up runs overdue jobs, skips fresh ones, updates watermarks', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'a', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  jobsLib.saveJob(paths, { name: 'b', at: '09:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });

  const now = new Date();
  now.setHours(10, 0, 0, 0); // after both 09:00 fires
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const todayAfterFire = new Date(now);
  todayAfterFire.setHours(9, 30, 0, 0);

  // a: last success yesterday → overdue. b: last success today 09:30 → NOT overdue.
  jobsLib.writeScheduleState(paths, 'a', { last_success: yesterday.toISOString(), last_status: 'ok' });
  jobsLib.writeScheduleState(paths, 'b', { last_success: todayAfterFire.toISOString(), last_status: 'ok' });

  const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
  await withRun(env, { WIENERDOG_RUNJOB_CMD: fake }, ['--catch-up'], {
    now,
    loader: noopLoader,
    sendAlert: () => ({ status: 0 }),
  });

  const state = jobsLib.readScheduleState(paths);
  // a re-ran: its watermark advanced past yesterday.
  assert.ok(new Date(state.a.last_success) > yesterday, 'overdue job a re-ran');
  assert.equal(state.a.last_status, 'ok');
  // b untouched: its watermark is still today 09:30.
  assert.equal(state.b.last_success, todayAfterFire.toISOString(), 'fresh job b was skipped');
});

test('scheduler-runjob: --catch-up does not abort the batch on a single job failure', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'a', at: '09:00', run: 'builtin:dream', timeoutMinutes: 20 });
  const now = new Date();
  now.setHours(10, 0, 0, 0);
  // No watermark → overdue.
  const fake = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 5']);

  // catchUp must resolve (not throw) even though the job fails.
  await withRun(env, { WIENERDOG_RUNJOB_CMD: fake }, ['--catch-up'], {
    now,
    loader: noopLoader,
    sendAlert: () => ({ status: 0 }),
  });

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.a.last_status, 'error', 'the failing job recorded its own error');
});

test('scheduler-runjob: run rejects an unknown job name', async () => {
  const { env } = setup();
  await assert.rejects(withRun(env, {}, ['ghost'], {}), /unknown job: ghost/);
});
