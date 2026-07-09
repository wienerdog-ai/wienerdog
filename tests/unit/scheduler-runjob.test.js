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
const { readAlerts, ALERTS_FILE } = require('../../src/core/alerts');

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
  // update_check: false keeps every run-job test hermetic — run() calls
  // maybeRefresh at its start, and this opt-out short-circuits it before any
  // network fetch. The one wiring test below overrides this to true and injects
  // a fetch seam.
  const config = `# Wienerdog configuration
version: 1
vault: ${vault}
update_check: false
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
    const pathDirs = clean.PATH.split(':');
    assert.ok(path.isAbsolute(pathDirs[0]));
    assert.equal(pathDirs[0], path.dirname(process.execPath), 'node dir stays first');
    assert.equal(pathDirs[1], path.join(paths.home, '.local/bin'), '~/.local/bin at index 1');
    assert.equal(clean.USER, os.userInfo().username, 'USER resolves to the login name');
    assert.equal(clean.WIENERDOG_SECRET_TEST, undefined, 'non-allowlisted vars are not carried through');
    assert.equal(clean.WIENERDOG_HOME, env.WIENERDOG_HOME, 'allowlisted overrides pass through');
  } finally {
    for (const k of ['WIENERDOG_SECRET_TEST', 'WIENERDOG_HOME']) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('scheduler-runjob: resolveUsername falls back to env when os.userInfo throws', () => {
  const realUserInfo = os.userInfo;
  const savedUser = process.env.USER;
  const savedLogname = process.env.LOGNAME;
  os.userInfo = () => {
    throw new Error('no passwd entry for uid');
  };
  try {
    // Falls back to USER, then LOGNAME.
    process.env.USER = 'fallback-user';
    delete process.env.LOGNAME;
    assert.equal(runjob.resolveUsername(), 'fallback-user');
    delete process.env.USER;
    process.env.LOGNAME = 'fallback-logname';
    assert.equal(runjob.resolveUsername(), 'fallback-logname');
    // Neither set → null, and buildCleanEnv omits USER (never sets "undefined").
    delete process.env.USER;
    delete process.env.LOGNAME;
    assert.equal(runjob.resolveUsername(), null);
    const { paths } = setup();
    let clean;
    assert.doesNotThrow(() => {
      clean = runjob.buildCleanEnv(paths, 'dream');
    });
    assert.ok(!('USER' in clean), 'USER absent when unresolvable');
  } finally {
    os.userInfo = realUserInfo;
    if (savedUser === undefined) delete process.env.USER;
    else process.env.USER = savedUser;
    if (savedLogname === undefined) delete process.env.LOGNAME;
    else process.env.LOGNAME = savedLogname;
  }
});

test('scheduler-runjob: buildCleanEnv(win32) builds the ;-PATH Windows shape, USERPROFILE, no USER', () => {
  const { paths } = setup();
  // Inject the Windows env vars the win32 branch reads/passes through. Saved and
  // restored so no other test observes them (we run on a POSIX host).
  const keys = [
    'APPDATA',
    'SystemRoot',
    'LOCALAPPDATA',
    'USERNAME',
    'PATHEXT',
    'WIENERDOG_SECRET_TEST',
    'ProgramFiles',
  ];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  process.env.APPDATA = 'C:\\Users\\Ada\\AppData\\Roaming';
  process.env.SystemRoot = 'C:\\Windows';
  process.env.LOCALAPPDATA = 'C:\\Users\\Ada\\AppData\\Local';
  process.env.USERNAME = 'Ada';
  process.env.PATHEXT = '.COM;.EXE;.BAT;.CMD';
  process.env.WIENERDOG_SECRET_TEST = 'leak-me';
  process.env.ProgramFiles = 'C:\\Program Files';
  try {
    const clean = runjob.buildCleanEnv(paths, 'dream', 'win32');

    // Homedir is deterministic and explicit; HOME kept too (Git-Bash respects it).
    assert.equal(clean.USERPROFILE, paths.home);
    assert.equal(clean.HOME, paths.home);
    assert.equal(clean.WIENERDOG_JOB, 'dream');
    assert.ok(!('USER' in clean), 'no USER on win32 (Keychain is a POSIX concern)');

    // PATH is ;-separated, node dir first, then ~/.local/bin, then %APPDATA%\npm.
    const pathDirs = clean.PATH.split(';');
    assert.equal(pathDirs[0], path.dirname(process.execPath), 'node dir stays first');
    assert.equal(pathDirs[1], path.join(paths.home, '.local', 'bin'));
    assert.equal(pathDirs[2], path.join(process.env.APPDATA, 'npm'));
    assert.equal(pathDirs[3], path.join(process.env.SystemRoot, 'System32'));
    assert.equal(pathDirs[4], process.env.SystemRoot);
    assert.equal(pathDirs[5], path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0'));
    assert.equal(pathDirs[6], path.join(process.env.ProgramFiles, 'Git', 'cmd'));
    assert.equal(
      pathDirs[7],
      path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd')
    );
    assert.equal(pathDirs.length, 8, 'six base win32 entries + two Git-for-Windows dirs');

    // Windows-essential passthrough vars carried when present.
    assert.equal(clean.APPDATA, 'C:\\Users\\Ada\\AppData\\Roaming');
    assert.equal(clean.LOCALAPPDATA, 'C:\\Users\\Ada\\AppData\\Local');
    assert.equal(clean.SystemRoot, 'C:\\Windows');
    assert.equal(clean.USERNAME, 'Ada');
    assert.equal(clean.PATHEXT, '.COM;.EXE;.BAT;.CMD');
    // The explicit USERPROFILE is not overwritten (it is not in the passthrough).
    assert.equal(clean.USERPROFILE, paths.home);
    // Non-allowlisted vars still do not leak.
    assert.equal(clean.WIENERDOG_SECRET_TEST, undefined, 'non-allowlisted vars are not carried through');
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('scheduler-runjob: buildCleanEnv(win32) falls back to defaults when APPDATA/SystemRoot are unset', () => {
  const { paths } = setup();
  const keys = ['APPDATA', 'SystemRoot'];
  const saved = {};
  for (const k of keys) saved[k] = process.env[k];
  delete process.env.APPDATA;
  delete process.env.SystemRoot;
  try {
    const clean = runjob.buildCleanEnv(paths, 'dream', 'win32');
    const pathDirs = clean.PATH.split(';');
    assert.equal(pathDirs[2], path.join(path.join(paths.home, 'AppData', 'Roaming'), 'npm'), 'APPDATA fallback');
    assert.equal(pathDirs[3], path.join('C:\\Windows', 'System32'), 'SystemRoot fallback');
    assert.ok(!('APPDATA' in clean), 'unset APPDATA is not carried through');
    assert.ok(!('SystemRoot' in clean), 'unset SystemRoot is not carried through');
  } finally {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
});

test('scheduler-runjob: buildCleanEnv POSIX shape is byte-identical for the 2-arg call and explicit linux/darwin', () => {
  const { paths } = setup();
  const base = runjob.buildCleanEnv(paths, 'dream'); // default platform = process.platform (POSIX on CI)
  assert.deepEqual(runjob.buildCleanEnv(paths, 'dream', 'linux'), base, 'linux == default POSIX shape');
  assert.deepEqual(runjob.buildCleanEnv(paths, 'dream', 'darwin'), base, 'darwin == default POSIX shape');
  assert.ok(base.PATH.includes(':'), 'POSIX PATH is :-separated');
  assert.ok(base.PATH.includes('/opt/homebrew/bin'), 'POSIX PATH keeps its dirs');
});

// -------------------------------------------------------------------------
// killProcessTree — POSIX group-kill vs win32 taskkill (both CI-testable via seams)
// -------------------------------------------------------------------------

test('scheduler-runjob: killProcessTree(win32) invokes taskkill /PID <pid> /T /F and nothing else', () => {
  /** @type {any[]} */ const spawnCalls = [];
  /** @type {any[]} */ const killCalls = [];
  const seams = {
    spawnSync: (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 }),
    kill: (...a) => (killCalls.push(a), undefined),
  };
  runjob.killProcessTree(4242, 'win32', seams);
  assert.deepEqual(spawnCalls, [['taskkill', ['/PID', '4242', '/T', '/F']]], 'taskkill argv');
  assert.equal(killCalls.length, 0, 'never signals a POSIX process group on win32');
});

test('scheduler-runjob: killProcessTree(POSIX) signals the process GROUP and never taskkill', () => {
  for (const platform of ['linux', 'darwin']) {
    /** @type {any[]} */ const spawnCalls = [];
    /** @type {any[]} */ const killCalls = [];
    const seams = {
      spawnSync: (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 }),
      kill: (...a) => (killCalls.push(a), undefined),
    };
    runjob.killProcessTree(4242, platform, seams);
    assert.deepEqual(killCalls, [[-4242, 'SIGKILL']], `${platform}: negative-PID group SIGKILL`);
    assert.equal(spawnCalls.length, 0, `${platform}: never shells out to taskkill`);
  }
});

test('scheduler-runjob: killProcessTree never throws when its seam throws (child already gone)', () => {
  const throwingKill = () => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  };
  const throwingSpawn = () => {
    throw new Error('taskkill missing');
  };
  assert.doesNotThrow(() => runjob.killProcessTree(1, 'linux', { kill: throwingKill }));
  assert.doesNotThrow(() => runjob.killProcessTree(1, 'win32', { spawnSync: throwingSpawn }));
});

// -------------------------------------------------------------------------
// resolveCommand
// -------------------------------------------------------------------------

test('scheduler-runjob: resolveCommand maps builtin:dream, skill:*, and rejects unknown', () => {
  const { paths } = setup();
  const savedCmd = process.env.WIENERDOG_RUNJOB_CMD;
  delete process.env.WIENERDOG_RUNJOB_CMD;
  try {
    const d = runjob.resolveCommand(paths, { name: 'dream', run: 'builtin:dream' });
    assert.deepEqual(d.args.slice(1), ['dream', '--yes']);
    // builtin:dream targets the stable vendored app/current bin (ADR-0013).
    assert.equal(d.args[0], path.join(paths.core, 'app', 'current', 'bin', 'wienerdog.js'));
    const s = runjob.resolveCommand(paths, { name: 'x', run: 'skill:wienerdog-daily-digest' });
    assert.equal(s.command, 'claude');
    assert.deepEqual(s.args, ['-p', '/wienerdog-daily-digest']);
    assert.throws(() => runjob.resolveCommand(paths, { name: 'x', run: 'builtin:frobnicate' }), /unknown builtin/);
    assert.throws(() => runjob.resolveCommand(paths, { name: 'x', run: 'weird:thing' }), /unknown job run kind/);
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

test('scheduler-runjob: a failing child\'s stderr tail reaches the fail-loud alert body', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'stderr-fail.sh', [
    '#!/bin/sh',
    'echo "brain boom: API drop mid-run" 1>&2',
    'exit 3',
  ]);
  /** @type {string[]} */ const bodies = [];
  const sendAlert = (_p, _n, _subject, body) => (bodies.push(body), { status: 0 });

  await assert.rejects(
    withRun(env, { WIENERDOG_RUNJOB_CMD: fake }, ['dream'], { sendAlert, loader: noopLoader }),
    /exited 3/
  );

  assert.equal(bodies.length, 1, 'fail-loud email attempted');
  assert.match(bodies[0], /brain boom: API drop mid-run/, 'the child stderr tail is in the alert body');
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

  // The child records its PID (`echo $$ > pidFile`) then `sleep 30`s. Under heavy
  // CPU contention the 2000 ms watchdog can fire and kill the process group
  // BEFORE the shell ran that echo, so the pidfile may not exist yet. Poll
  // briefly for it rather than reading immediately (the old ENOENT-crash race).
  const pidDeadline = Date.now() + 2000;
  let pidRaw = '';
  while (Date.now() < pidDeadline) {
    try {
      pidRaw = fs.readFileSync(pidFile, 'utf8').trim();
      if (pidRaw) break;
    } catch {
      /* pidfile not written yet */
    }
    await new Promise((r) => setTimeout(r, 25));
  }

  if (pidRaw) {
    // Child started and recorded its PID → assert the watchdog killed it.
    const pid = Number(pidRaw);
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
  }
  // else: the child never got far enough to record a PID before the watchdog
  // killed it (rare, only under pathological scheduling). The watchdog firing is
  // already proven by the /timed out/ rejection and last_status === 'error'
  // above; there is no PID to assert on, so nothing more to check.
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
// Fail-loud durable alert (alerts.jsonl) — append on failure, clear on success
// -------------------------------------------------------------------------

test('scheduler-runjob: failLoud always appends a durable alert and never throws', async () => {
  const { paths } = setup();

  // Email delivered → the durable alert is still recorded (independent of email).
  await runjob.failLoud(paths, 'dream', 'brain exploded', 'tail...', { sendAlert: () => ({ status: 0 }) });
  let alerts = readAlerts(paths);
  assert.equal(alerts.length, 1, 'one durable alert even when the email is delivered');
  assert.equal(alerts[0].job, 'dream');
  assert.equal(alerts[0].reason, 'brain exploded');
  assert.match(alerts[0].log_hint, /logs\/dream\/$/, 'log hint points at the job log dir');
  assert.match(alerts[0].at, /^\d{4}-\d{2}-\d{2}T/, 'ISO timestamp recorded');

  // A second failure appends (does not overwrite).
  await runjob.failLoud(paths, 'dream', 'again', '', { sendAlert: () => ({ status: 1 }) });
  alerts = readAlerts(paths);
  assert.equal(alerts.length, 2, 'second failure appends');

  // A throwing sendAlert must not escape failLoud — and the alert is still recorded.
  await runjob.failLoud(paths, 'dream', 'boom', '', {
    sendAlert: () => {
      throw new Error('alert crashed');
    },
  });
  assert.equal(readAlerts(paths).length, 3, 'alert recorded even when the email throws');
});

test('scheduler-runjob: a failing run appends exactly one alert; a later success clears it', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });

  // 1. A failing run appends exactly one alert (and still fails loud + throws).
  const fail = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 3']);
  await assert.rejects(
    withRun(env, { WIENERDOG_RUNJOB_CMD: fail }, ['dream'], { sendAlert: () => ({ status: 0 }), loader: noopLoader }),
    /exited 3/
  );
  const alerts = readAlerts(paths);
  assert.equal(alerts.length, 1, 'exactly one alert appended on failure');
  assert.equal(alerts[0].job, 'dream');

  // 2. A subsequent successful run of the same job clears its alerts.
  const ok = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
  await withRun(env, { WIENERDOG_RUNJOB_CMD: ok }, ['dream'], { sendAlert: () => ({ status: 0 }), loader: noopLoader });
  assert.deepEqual(readAlerts(paths), [], 'success cleared the alert');
  assert.ok(!fs.existsSync(path.join(paths.state, ALERTS_FILE)), 'alerts.jsonl removed when empty');
});

// -------------------------------------------------------------------------
// Log rotation
// -------------------------------------------------------------------------

test('scheduler-runjob: rotateLogs keeps 14 run-stamp logs and never deletes the daily/launchd logs', () => {
  const { root } = setup();
  const dir = path.join(root, 'logdir');
  fs.mkdirSync(dir);
  const names = [];
  for (let i = 0; i < 20; i++) {
    const n = `2026-07-04T00-00-${String(i).padStart(2, '0')}-000Z.log`;
    names.push(n);
    fs.writeFileSync(path.join(dir, n), 'x');
  }
  // The incident's lexical pile-up: the brain's daily log (YYYY-MM-DD.log) sorts
  // AFTER same-day run stamps ('.' < 'T'), so the old rotation deleted it. It and
  // the launchd redirect logs must survive regardless of run-stamp count.
  fs.writeFileSync(path.join(dir, '2026-07-04.log'), 'brain-stderr-evidence');
  fs.writeFileSync(path.join(dir, 'launchd.err.log'), 'launchd-err');
  fs.writeFileSync(path.join(dir, 'launchd.out.log'), 'launchd-out');
  runjob.rotateLogs(dir);

  const remaining = fs.readdirSync(dir);
  const runStamps = remaining.filter((f) => /Z\.log$/.test(f));
  assert.equal(runStamps.length, 14, 'exactly 14 run-stamp logs kept');
  // The newest run stamps are kept; the oldest are gone.
  assert.ok(runStamps.includes(names[19]), 'newest run stamp kept');
  assert.ok(!runStamps.includes(names[0]), 'oldest run stamp deleted');
  // The three non-run-stamp logs are never rotation candidates — all survive.
  assert.ok(remaining.includes('2026-07-04.log'), 'daily brain log survives the pile-up');
  assert.ok(remaining.includes('launchd.err.log'), 'launchd.err.log survives');
  assert.ok(remaining.includes('launchd.out.log'), 'launchd.out.log survives');
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

// -------------------------------------------------------------------------
// Update-check wiring (WP-046): run-job refreshes the cache via the injected
// fetch seam — never the real registry.
// -------------------------------------------------------------------------

test('scheduler-runjob: with update_check on, run-job refreshes the cache via the injected fetch (no network)', async () => {
  const { env, vault, paths } = setup();
  // Opt in to the update check for this test only; keep the vault line intact.
  fs.writeFileSync(paths.config, `# Wienerdog configuration
version: 1
vault: ${vault}
update_check: true
`);

  // --catch-up with no jobs is "nothing overdue"; maybeRefresh still runs first.
  await withRun(env, {}, ['--catch-up'], { fetchLatest: async () => '9.9.9' });

  const cache = JSON.parse(fs.readFileSync(path.join(paths.state, 'update-check.json'), 'utf8'));
  assert.equal(cache.latest, '9.9.9', 'injected fetch populated the cache');
  assert.ok(cache.last_check, 'attempt was stamped');
});
