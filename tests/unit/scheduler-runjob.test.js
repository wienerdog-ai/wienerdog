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
const { allowAll } = require('../../src/core/safety-profile');

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

/** Build an isolated temp core (config+manifest) pointed at a caller-supplied vault
 *  path (e.g. a symlink) that already exists — unlike setup(), this never mkdirs the
 *  vault itself, so a test can pre-construct a symlinked vault or home before calling.
 *  @param {string} home value used for $HOME (may itself be a symlink)
 *  @param {string} vault absolute vault path to write into config.yaml */
function setupCoreWithVault(home, vault) {
  const env = { HOME: home, WIENERDOG_HOME: path.join(home, 'wd') };
  const paths = getPaths(env);
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
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
  return { env, paths };
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
  const keys = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_RUNJOB_TIMEOUT_MS', 'WIENERDOG_SECRET_TEST'];
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

/** WP-155: the JS-only fake-command seam (replaces the deleted env seam) —
 *  injected as runJob's opts.resolveCommand; always shell:false. */
const fakeResolve = (script) => () => ({ command: script, args: [], shell: false });

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
// killProcessTree — now a wrapper over the authoritative-table reapTree
// (WP-a10-reap-mechanism); POSIX table reap vs win32 ABSOLUTE taskkill
// -------------------------------------------------------------------------

/** Point process.env.SystemRoot at a fixture; when `withExe`, an (empty)
 *  `System32/taskkill.exe` exists there. Returns {taskkill, restore}. */
function fakeSystemRoot(withExe) {
  const systemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-sysroot-'));
  fs.mkdirSync(path.join(systemRoot, 'System32'), { recursive: true });
  const taskkill = path.join(systemRoot, 'System32', 'taskkill.exe');
  if (withExe) fs.writeFileSync(taskkill, 'fake');
  const saved = process.env.SystemRoot;
  process.env.SystemRoot = systemRoot;
  return {
    taskkill,
    restore: () => {
      if (saved === undefined) delete process.env.SystemRoot;
      else process.env.SystemRoot = saved;
    },
  };
}

test('scheduler-runjob: killProcessTree(win32) shells the ABSOLUTE System32 taskkill /PID <pid> /T /F — never a bare name', () => {
  const sr = fakeSystemRoot(true);
  try {
    /** @type {any[]} */ const spawnCalls = [];
    /** @type {any[]} */ const killCalls = [];
    const seams = {
      spawnSync: (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 }),
      kill: (...a) => (killCalls.push(a), undefined),
    };
    runjob.killProcessTree(4242, 'win32', seams);
    assert.deepEqual(spawnCalls, [[sr.taskkill, ['/PID', '4242', '/T', '/F']]], 'absolute System32 taskkill argv');
    assert.notEqual(spawnCalls[0][0], 'taskkill', 'a taskkill planted earlier on PATH is never consulted');
    assert.equal(killCalls.length, 0, 'never signals a POSIX process group on win32');
  } finally {
    sr.restore();
  }
});

test('scheduler-runjob: killProcessTree(POSIX) group-kills via the reap (legacy fallback on an unusable table), never taskkill', () => {
  for (const platform of ['linux', 'darwin']) {
    /** @type {any[]} */ const spawnCalls = [];
    /** @type {any[]} */ const killCalls = [];
    const seams = {
      spawnSync: (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 }),
      kill: (...a) => (killCalls.push(a), undefined),
      readTable: () => null, // unusable snapshot → the legacy negative-PID group-kill
    };
    runjob.killProcessTree(4242, platform, seams);
    assert.deepEqual(killCalls, [[-4242, 'SIGKILL']], `${platform}: negative-PID group SIGKILL`);
    assert.equal(spawnCalls.length, 0, `${platform}: never shells out to taskkill`);
  }
});

test('scheduler-runjob: killProcessTree reaps a RE-DETACHED grandchild via the real descendant tree, not only group A', () => {
  // The middle 100 (group A = 100) has a grandchild 200 that re-detached into
  // its OWN group (200) — the pre-A10 kill(-100) never reached it. The
  // authoritative-table reap enumerates the ppid-closure and kills both the
  // descendant pid AND its group.
  const table = [
    { pid: 100, ppid: 1, pgid: 100 },
    { pid: 200, ppid: 100, pgid: 200 }, // re-detached: own group, still a ppid-descendant
  ];
  let emptied = false;
  /** @type {any[]} */ const killCalls = [];
  runjob.killProcessTree(100, 'linux', {
    kill: (...a) => (killCalls.push(a), undefined),
    readTable: () => (emptied ? [] : ((emptied = true), table)),
    pollDelayMs: 0,
  });
  const targets = killCalls.map((c) => c[0]);
  assert.ok(targets.includes(-200), 'the re-detached grandchild GROUP is killed');
  assert.ok(targets.includes(200), 'the re-detached grandchild pid is killed');
  assert.ok(targets.includes(-100), 'group A is still killed too');
});

test('scheduler-runjob: killProcessTree never throws when its seam throws (child already gone)', () => {
  const throwingKill = () => {
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  };
  const throwingSpawn = () => {
    throw new Error('taskkill exploded');
  };
  assert.doesNotThrow(() => runjob.killProcessTree(999999, 'linux', { kill: throwingKill, readTable: () => null }));
  const sr = fakeSystemRoot(true);
  try {
    assert.doesNotThrow(() => runjob.killProcessTree(999999, 'win32', { spawnSync: throwingSpawn }));
  } finally {
    sr.restore();
  }
});

// -------------------------------------------------------------------------
// resolveCommand
// -------------------------------------------------------------------------

test('scheduler-runjob: resolveCommand maps builtin:dream, skill:*, and rejects unknown', () => {
  const { paths } = setup();
  const d = runjob.resolveCommand(paths, { name: 'dream', run: 'builtin:dream' });
  assert.deepEqual(d.args.slice(1), ['dream', '--yes']);
  // builtin:dream targets the stable vendored app/current bin (ADR-0013).
  assert.equal(d.args[0], path.join(paths.core, 'app', 'current', 'bin', 'wienerdog.js'));
  assert.equal(d.shell, false, 'every resolveCommand path is shell:false (WP-155)');
  // WP-131: the skill: branch (gate seam allowing) composes the HERMETIC
  // routine run — never a bare `claude -p /<skill>`. weekly-review is
  // mcp:'empty' so it composes; the broker routines fail closed until A2.
  const s = runjob.resolveCommand(paths, { name: 'x', run: 'skill:wienerdog-weekly-review' }, allowAll());
  assert.equal(s.command, 'claude');
  assert.equal(s.args[0], '-p');
  assert.equal(s.args[1], '/wienerdog-weekly-review');
  assert.ok(s.args.includes('--tools'), 'hermetic argv restricts built-ins');
  assert.ok(s.cwd.endsWith(path.join('routine-run', 'weekly-review')), 'spawn cwd is the staging dir');
  assert.equal(s.shell, false, 'skill composition is shell:false too');
  // Since WP-141 the composition WRITES the per-routine broker config, so a
  // broker routine composes too — with exactly one --mcp-config.
  const b = runjob.resolveCommand(paths, { name: 'x', run: 'skill:wienerdog-daily-digest' }, allowAll());
  assert.equal(b.args.filter((a) => a === '--mcp-config').length, 1);
  assert.throws(() => runjob.resolveCommand(paths, { name: 'x', run: 'builtin:frobnicate' }), /unknown builtin/);
  assert.throws(() => runjob.resolveCommand(paths, { name: 'x', run: 'weird:thing' }), /unknown job run kind/);
  // A0 pre-use freeze (WP-109/111): without a profile, the `skill:` branch is
  // refused BEFORE returning the `claude` argv — a hand-edited config.yaml
  // `skill:` job cannot spawn a model.
  assert.throws(
    () => runjob.resolveCommand(paths, { name: 'x', run: 'skill:wienerdog-daily-digest' }),
    /disabled in this release/
  );
});

test('scheduler-runjob: a set WIENERDOG_RUNJOB_CMD env var has ZERO effect — the seam no longer exists (WP-155)', () => {
  const { paths } = setup();
  const saved = process.env.WIENERDOG_RUNJOB_CMD;
  process.env.WIENERDOG_RUNJOB_CMD = '/bin/echo';
  try {
    const d = runjob.resolveCommand(paths, { name: 'dream', run: 'builtin:dream' });
    assert.notEqual(d.command, '/bin/echo', 'the env var is ignored — resolveCommand reads no env');
    assert.equal(d.args[0], path.join(paths.core, 'app', 'current', 'bin', 'wienerdog.js'));
    assert.equal(d.shell, false, 'no shell:true dispatch exists in the scheduler path');
  } finally {
    if (saved === undefined) delete process.env.WIENERDOG_RUNJOB_CMD;
    else process.env.WIENERDOG_RUNJOB_CMD = saved;
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

  await withRun(env, { WIENERDOG_SECRET_TEST: 'leak' }, ['dream'], {
    resolveCommand: fakeResolve(fake),
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
    withRun(env, {}, ['dream'], { resolveCommand: fakeResolve(fake), sendAlert, loader: noopLoader }),
    /exited 3/
  );

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'error');
  assert.ok(state.dream.last_error_at);
  assert.deepEqual(alerts, ['job dream failed'], 'fail-loud email attempted');
});

test('scheduler-runjob: the fail-loud email body carries NO raw log tail — code-owned reason + Details pointer only (WP-124)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'stderr-fail.sh', [
    '#!/bin/sh',
    'echo "brain boom: API drop mid-run" 1>&2',
    'echo "leaked GITHUB_TOKEN=ghp_a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2a1B2" 1>&2',
    'exit 3',
  ]);
  /** @type {string[]} */ const bodies = [];
  const sendAlert = (_p, _n, _subject, body) => (bodies.push(body), { status: 0 });

  await assert.rejects(
    withRun(env, {}, ['dream'], { resolveCommand: fakeResolve(fake), sendAlert, loader: noopLoader }),
    /exited 3/
  );

  assert.equal(bodies.length, 1, 'fail-loud email attempted');
  assert.match(bodies[0], /exited 3/, 'code-owned reason present');
  assert.match(bodies[0], /Details: .*logs.*dream/, 'log-location pointer present');
  assert.ok(!bodies[0].includes('brain boom: API drop mid-run'), 'raw log tail must not be in the email body');
  assert.ok(!bodies[0].includes('ghp_a1B2'), 'no secret bytes in the email body');
});

test('scheduler-runjob: the run-job log tee redacts a secret in child output (WP-124 EP3)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'leaky-ok.sh', [
    '#!/bin/sh',
    'echo "stdout leak sk-ant-abcdefghijklmnopqrstuvwx0123 end"',
    'echo "stderr OPENAI_API_KEY=sk-proj-ABCDEF0123456789abcdef" 1>&2',
    'exit 0',
  ]);
  const sendAlert = () => ({ status: 0 });

  await withRun(env, {}, ['dream'], { resolveCommand: fakeResolve(fake), sendAlert, loader: noopLoader });

  const logDir = path.join(paths.logs, 'dream');
  const logs = fs.readdirSync(logDir).filter((f) => f.endsWith('.log'));
  assert.equal(logs.length, 1);
  const log = fs.readFileSync(path.join(logDir, logs[0]), 'utf8');
  assert.ok(log.includes('[REDACTED:'), log);
  assert.ok(!log.includes('sk-ant-abcdefghijklmnopqrstuvwx0123'), 'stdout secret must not reach the run log');
  assert.ok(!log.includes('sk-proj-ABCDEF0123456789abcdef'), 'stderr secret must not reach the run log');
});

// -------------------------------------------------------------------------
// run-job <name> — hang → watchdog kill-tree
// -------------------------------------------------------------------------

test('scheduler-runjob: a hanging job hits the watchdog (opts.timeoutMs); a set WIENERDOG_RUNJOB_TIMEOUT_MS has ZERO effect (WP-155)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const pidFile = path.join(root, 'child.pid');
  const fake = writeScript(root, 'hang.sh', [
    '#!/bin/sh',
    `echo $$ > ${JSON.stringify(pidFile)}`,
    'sleep 30',
  ]);
  const sendAlert = () => ({ status: 0 });

  // The outer timeout comes from the JS-only opts.timeoutMs seam. A large
  // WIENERDOG_RUNJOB_TIMEOUT_MS env var (the deleted seam) is IGNORED — the job
  // still times out at 2s. Mutation: reintroduce the env read → resolveTimeoutMs
  // returns 600000 → the job does not time out in the window → /timed out/ never
  // rejects → this test fails.
  await assert.rejects(
    withRun(env, { WIENERDOG_RUNJOB_TIMEOUT_MS: '600000' }, ['dream'], {
      resolveCommand: fakeResolve(fake),
      timeoutMs: 2000,
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
// WP-a10-reap-mechanism: the settle-path reap matrix + the per-token brain
// pidfile hand-up + the R8-1 final-backstop escalation (audit A10, ADR-0030)
// -------------------------------------------------------------------------

const REAP_SKIP_WIN32 = process.platform === 'win32' && 'POSIX group-reap semantics (R5-2: win32 authority deferred to WP-a10-windows-reap)';

/** Injected reap seams: recorders + a scripted reapGroup result sequence
 *  (defaults to { reaped: true } once the script runs out). */
function reapSeams(groupResults = []) {
  /** @type {number[]} */ const treeCalls = [];
  /** @type {number[]} */ const groupCalls = [];
  const results = [...groupResults];
  return {
    treeCalls,
    groupCalls,
    reapTree: (pid, platform) => {
      treeCalls.push(pid);
      runjob.killProcessTree(pid, platform, {}); // still really reap — no orphan survives the test
    },
    reapGroup: (pgid) => {
      groupCalls.push(pgid);
      return results.length > 0 ? results.shift() : { reaped: true };
    },
  };
}

test(
  'scheduler-runjob: TIMEOUT settle reaps group A via BOTH reapTree(child.pid) AND the checked reapGroup(child.pid) (matrix timeout row)',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'hang.sh', ['#!/bin/sh', 'sleep 30']);
    const seams = reapSeams();
    await assert.rejects(
      withRun(env, {}, ['dream'], {
        resolveCommand: fakeResolve(fake),
        timeoutMs: 1500,
        sendAlert: () => ({ status: 0 }),
        loader: noopLoader,
        reapTree: seams.reapTree,
        reapGroup: seams.reapGroup,
      }),
      /timed out/
    );
    assert.equal(seams.treeCalls.length, 1, 'reapTree runs on the timeout row (best-effort extra while the middle may live)');
    assert.ok(Number.isInteger(seams.treeCalls[0]) && seams.treeCalls[0] > 1, 'reapTree got the child pid');
    assert.deepEqual(seams.groupCalls, [seams.treeCalls[0]], 'the checked reapGroup(child.pid) ALSO runs on timeout');
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'error');
  }
);

test(
  'scheduler-runjob: an ABNORMAL close (non-zero exit) reaps group A via reapGroup(child.pid) ONLY — reapTree is NOT invoked (matrix)',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    // Once the group-A leader has exited, reapTree's ppid-closure is empty (a
    // pointless no-op); the negative-PGID reapGroup(child.pid) is what reaches
    // a leaderless reparented group-A member.
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 3']);
    const seams = reapSeams();
    await assert.rejects(
      withRun(env, {}, ['dream'], {
        resolveCommand: fakeResolve(fake),
        sendAlert: () => ({ status: 0 }),
        loader: noopLoader,
        reapTree: seams.reapTree,
        reapGroup: seams.reapGroup,
      }),
      /exited 3/
    );
    assert.equal(seams.treeCalls.length, 0, 'reapTree is NOT run on the abnormal-close row');
    assert.equal(seams.groupCalls.length, 1, 'the checked reapGroup(child.pid) reaps group A');
    assert.ok(seams.groupCalls[0] > 1, 'reapGroup got the child pid (group-A pgid)');
  }
);

test(
  'scheduler-runjob: R9-1 — a CLEAN close (exit 0) STILL reaps group A via reapGroup(child.pid), and NOT via reapTree (matrix)',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    // A clean middle exit does not prove group A is empty: a plain group-A
    // child that did not inherit the stdio pipe can survive it, reparented to
    // init and still carrying child.pid as its PGID. (This run writes NO brain
    // pidfile, which also exercises the spawn→hand-up-boundary shape: a
    // missing per-token pidfile is a best-effort no-op — the documented
    // ADR-0030 sub-ms residual, not asserted reaped.)
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
    const seams = reapSeams();
    await withRun(env, {}, ['dream'], {
      resolveCommand: fakeResolve(fake),
      sendAlert: () => ({ status: 0 }),
      loader: noopLoader,
      reapTree: seams.reapTree,
      reapGroup: seams.reapGroup,
    });
    assert.equal(seams.treeCalls.length, 0, 'reapTree is NOT run on the clean-close row');
    assert.equal(seams.groupCalls.length, 1, 'reapGroup(child.pid) runs on EVERY settle path — clean close included');
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'ok', 'an initial { reaped: true } settles clean');
  }
);

test(
  'scheduler-runjob: R9-1/R8-1 — a clean close whose group-A reap stays { reaped: false } escalates once, then FAILS LOUD (error outcome)',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
    // { reaped: false } persisting ACROSS the bounded final escalation.
    const seams = reapSeams([{ reaped: false }, { reaped: false }]);
    /** @type {string[]} */ const alerts = [];
    await assert.rejects(
      withRun(env, {}, ['dream'], {
        resolveCommand: fakeResolve(fake),
        sendAlert: (_p, _n, subject) => (alerts.push(subject), { status: 0 }),
        loader: noopLoader,
        reapTree: seams.reapTree,
        reapGroup: seams.reapGroup,
      }),
      /live process group|could not be reaped/,
      'run-job does NOT silently certify the job clean while a findable group is live'
    );
    assert.equal(seams.groupCalls.length, 2, 'initial reap + exactly ONE bounded final escalation (never unbounded)');
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'error', 'error watermark written (R8-1)');
    assert.deepEqual(alerts, ['job dream failed'], 'failLoud fired');
    const durable = readAlerts(paths);
    assert.equal(durable.length, 1, 'durable alerts.jsonl record');
    assert.match(durable[0].reason, /could not be reaped to quiescence/);
  }
);

test(
  'scheduler-runjob: R8-1 — a { reaped: false } that the bounded escalation RESOLVES to { reaped: true } settles clean',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
    const seams = reapSeams([{ reaped: false }, { reaped: true }]); // false → true
    await withRun(env, {}, ['dream'], {
      resolveCommand: fakeResolve(fake),
      sendAlert: () => ({ status: 0 }),
      loader: noopLoader,
      reapTree: seams.reapTree,
      reapGroup: seams.reapGroup,
    });
    assert.equal(seams.groupCalls.length, 2, 'one escalation call, then done');
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'ok', 'a resolved escalation is a clean settle');
  }
);

test(
  'scheduler-runjob: builtin:dream mints a per-run token, and the settle reaps the handed-up brain group + deletes the pidfile on { reaped: true }',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const tokenMarker = path.join(root, 'token.txt');
    // The fake middle hands up a brain identity exactly like dream.js would:
    // it writes state/dream-brain.<its own token>.pid with a {pid, pgid} body.
    const fake = writeScript(root, 'mid.sh', [
      '#!/bin/sh',
      `printf '%s' "$WIENERDOG_DREAM_RUN_TOKEN" > ${JSON.stringify(tokenMarker)}`,
      'printf \'{"pid": 55555, "pgid": 55555}\' > "$WIENERDOG_HOME/state/dream-brain.$WIENERDOG_DREAM_RUN_TOKEN.pid"',
      'exit 0',
    ]);
    const seams = reapSeams();
    await withRun(env, {}, ['dream'], {
      resolveCommand: fakeResolve(fake),
      sendAlert: () => ({ status: 0 }),
      loader: noopLoader,
      reapTree: seams.reapTree,
      reapGroup: seams.reapGroup,
    });
    const token = fs.readFileSync(tokenMarker, 'utf8').trim();
    assert.match(token, /^[a-f0-9]{16}$/, 'a fresh per-run token was minted BEFORE spawn and passed via env');
    assert.ok(seams.groupCalls.includes(55555), 'the handed-up brain group (group B) is reaped via reapGroup(brain.pgid)');
    assert.equal(
      fs.existsSync(path.join(paths.state, `dream-brain.${token}.pid`)),
      false,
      'the per-token pidfile is deleted once its group is VERIFIED empty ({ reaped: true })'
    );
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'ok');
  }
);

test(
  'scheduler-runjob: R8-1 — a brain group that stays { reaped: false } across the final escalation drives failLoud + error outcome (the FINAL backstop)',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    const fake = writeScript(root, 'mid.sh', [
      '#!/bin/sh',
      'printf \'{"pid": 55555, "pgid": 55555}\' > "$WIENERDOG_HOME/state/dream-brain.$WIENERDOG_DREAM_RUN_TOKEN.pid"',
      'exit 0',
    ]);
    // Group A and group B both stay non-empty across the escalation.
    const seams = reapSeams([{ reaped: false }, { reaped: false }, { reaped: false }, { reaped: false }]);
    await assert.rejects(
      withRun(env, {}, ['dream'], {
        resolveCommand: fakeResolve(fake),
        sendAlert: () => ({ status: 0 }),
        loader: noopLoader,
        reapTree: seams.reapTree,
        reapGroup: seams.reapGroup,
      }),
      /could not be reaped/,
      'no later run ever reads another run\'s token pidfile — the FINAL backstop must not rely on retention, it fails LOUD'
    );
    // Bounded: initial A + initial B + ONE escalation each — never an unbounded block-until-ESRCH.
    assert.equal(seams.groupCalls.length, 4, 'bounded final escalation');
    assert.ok(seams.groupCalls.includes(55555), 'the brain group was retried in the escalation');
    assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'error');
    assert.equal(readAlerts(paths).length, 1, 'durable fail-loud alert recorded');
    // F3 (fix-pass): the durable alert IS the record — the never-again-read
    // token pidfile is released AFTER failLoud, never retained as a hollow
    // leftover (no later run reads this run's token).
    const leftover = fs.readdirSync(paths.state).filter((f) => f.startsWith('dream-brain.'));
    assert.deepEqual(leftover, [], 'the token pidfile is deleted once the failure is loudly recorded');
  }
);

test(
  'scheduler-runjob: cross-run isolation — a run reaps ONLY its own token pidfile, never another run\'s live brain',
  { skip: REAP_SKIP_WIN32 },
  async () => {
    const { root, env, paths } = setup();
    jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
    // A concurrent (first) run's live hand-up under a DIFFERENT token.
    const foreign = path.join(paths.state, 'dream-brain.ffffffffffffffff.pid');
    fs.writeFileSync(foreign, '{"pid": 77777, "pgid": 77777}');
    const fake = writeScript(root, 'mid.sh', [
      '#!/bin/sh',
      'printf \'{"pid": 55555, "pgid": 55555}\' > "$WIENERDOG_HOME/state/dream-brain.$WIENERDOG_DREAM_RUN_TOKEN.pid"',
      'exit 0',
    ]);
    const seams = reapSeams();
    await withRun(env, {}, ['dream'], {
      resolveCommand: fakeResolve(fake),
      sendAlert: () => ({ status: 0 }),
      loader: noopLoader,
      reapTree: seams.reapTree,
      reapGroup: seams.reapGroup,
    });
    assert.ok(seams.groupCalls.includes(55555), 'own brain group reaped');
    assert.ok(!seams.groupCalls.includes(77777), 'the OTHER run\'s live brain is never touched');
    assert.ok(fs.existsSync(foreign), 'the other run\'s token pidfile is left for ITS supervisor');
  }
);

test('scheduler-runjob: R5-2 — on win32 the group-reap authority does NOT activate (pre-A10 behavior kept; POSIX-only guarantee)', async () => {
  // The leaderless-member reap rests on negative-PGID kill semantics that
  // win32 lacks; the win32 settle path keeps the pre-A10 timeout-only
  // taskkill /T /F behavior and never invokes the checked group reap (its
  // best-effort { reaped: true } could also never drive the fail-loud path).
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const tokenMarker = path.join(root, 'token.txt');
  const fake = writeScript(root, 'ok.sh', [
    '#!/bin/sh',
    `printf '%s' "$WIENERDOG_DREAM_RUN_TOKEN" > ${JSON.stringify(tokenMarker)}`,
    'exit 0',
  ]);
  const seams = reapSeams();
  await withRun(env, {}, ['dream'], {
    resolveCommand: fakeResolve(fake),
    platform: 'win32',
    sendAlert: () => ({ status: 0 }),
    loader: noopLoader,
    reapTree: seams.reapTree,
    reapGroup: seams.reapGroup,
  });
  assert.equal(seams.groupCalls.length, 0, 'no reapGroup on win32 — the authority does not activate');
  assert.equal(seams.treeCalls.length, 0, 'no timeout fired, so no tree reap either');
  assert.equal(fs.readFileSync(tokenMarker, 'utf8').trim(), '', 'no per-run token is minted on win32');
  assert.equal(jobsLib.readScheduleState(paths).dream.last_status, 'ok');
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

// These cases build real symlinks; stock Windows (no Developer Mode) throws EPERM on
// symlink creation, so they are skipped there. The darwin TCC-guard logic itself is
// exercised on every platform via the platform:'darwin' opt in the non-symlink
// "a vault under a protected folder is refused" test above.
const SKIP_WIN32_SYMLINK = process.platform === 'win32' && 'POSIX symlink semantics (Windows lacks unprivileged symlinks)';

test(
  'scheduler-runjob: a vault whose FINAL component symlinks into a protected folder is refused (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-symvault-'));
  const protectedDir = path.join(root, 'Documents', 'vault');
  fs.mkdirSync(protectedDir, { recursive: true });
  // Literal vault path is NOT under a protected prefix — only following the symlink
  // reveals it sits under Documents (scheduler #3: the defect this WP closes). The
  // component-wise walk reads the link target and guards it before any stat, never
  // realpath, so guarding it never stats inside Documents and can't trigger the TCC prompt.
  const vaultLink = path.join(root, 'vault');
  fs.symlinkSync(protectedDir, vaultLink);
  const { env, paths } = setupCoreWithVault(root, vaultLink);
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
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a symlinked vault is refused even when home itself is reached via a symlinked component (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-symhome-'));
  const realHome = path.join(root, 'realhome');
  fs.mkdirSync(realHome, { recursive: true });
  // home is itself a symlink (e.g. a real /var/home -> /home shape). The component-wise
  // walk canonicalizes both the vault and home, and guards each vault component against
  // BOTH the literal- and resolved-home domains, so the resolved Documents/vault is
  // caught even though home is reached via a symlinked component (round-2 domain-matched
  // intent — kept here via the check-before-access walk, never realpath).
  const home = path.join(root, 'home');
  fs.symlinkSync(realHome, home);
  const protectedDir = path.join(realHome, 'Documents', 'vault');
  fs.mkdirSync(protectedDir, { recursive: true });
  // Literal vault path (via the symlinked home) is NOT under a protected prefix.
  const vaultLink = path.join(home, 'vault');
  fs.symlinkSync(path.join(home, 'Documents', 'vault'), vaultLink);
  const { env, paths } = setupCoreWithVault(home, vaultLink);
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
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a symlinked ANCESTOR into a protected folder is refused WITHOUT stat-ing inside it (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-ancestor-'));
  // alias -> Documents (a symlinked ANCESTOR). Vault is configured as ~/alias/vault.
  // A whole-path lstat(~/alias/vault) would traverse `alias` INTO Documents to stat
  // `vault` — touching the protected dir before any guard runs (the 2nd defect this WP
  // closes). The component-wise walk resolves `alias` to Documents and refuses BEFORE
  // ever stat-ing Documents.
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(path.join(documents, 'vault'), { recursive: true });
  fs.symlinkSync(documents, path.join(root, 'alias'));
  const vaultCfg = path.join(root, 'alias', 'vault');
  const { env, paths } = setupCoreWithVault(root, vaultCfg);
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  // Spy on fs.lstatSync (the module under test uses this same fs object) and assert the
  // guard never stat-ed a path inside the protected Documents dir (either spelling —
  // macOS tmp resolves through /private/var). readlink of `alias` in home is fine; a
  // stat INSIDE Documents is the failure we prove absent.
  const realLstat = fs.lstatSync;
  const realDocuments = fs.realpathSync(documents);
  /** @type {string[]} */ const statted = [];
  fs.lstatSync = (p, ...a) => {
    statted.push(String(p));
    return realLstat.call(fs, p, ...a);
  };
  try {
    await assert.rejects(
      withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
      /macOS protected folder \(Documents\)/
    );
  } finally {
    fs.lstatSync = realLstat;
  }

  const under = (p, base) => p === base || p.startsWith(base + path.sep);
  const insideProtected = statted.filter((p) => under(p, documents) || under(p, realDocuments));
  assert.deepEqual(insideProtected, [], 'guard never stats inside the protected Documents dir');
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a LOWERCASE-cased symlink target of a protected dir is refused, no stat inside it (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-case-'));
  // The real protected dir is canonically-cased ~/Documents/vault. The vault symlink's
  // target is spelled LOWERCASE (~/documents/vault). On macOS's default case-insensitive
  // FS the OS resolves `documents` to the same inode as `Documents`, so a case-SENSITIVE
  // guard would pass `documents` and then lstat it — hitting the real protected dir (the
  // 3rd defect this WP closes). checkPath now compares protected prefixes case-
  // insensitively, so the walk refuses `~/documents` BEFORE stat-ing it.
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(path.join(documents, 'vault'), { recursive: true });
  fs.symlinkSync(path.join(root, 'documents', 'vault'), path.join(root, 'link'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'link'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  const realLstat = fs.lstatSync;
  const realDocuments = fs.realpathSync(documents);
  /** @type {string[]} */ const statted = [];
  fs.lstatSync = (p, ...a) => {
    statted.push(String(p));
    return realLstat.call(fs, p, ...a);
  };
  try {
    await assert.rejects(
      withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
      /macOS protected folder \(Documents\)/
    );
  } finally {
    fs.lstatSync = realLstat;
  }

  // Case-INSENSITIVE containment check: prove no stat landed inside the protected dir
  // under EITHER the 'Documents' or 'documents' spelling (same inode on this FS).
  const underCI = (p, base) => {
    const P = p.toLowerCase();
    const B = base.toLowerCase();
    return P === B || P.startsWith(B + path.sep);
  };
  const insideProtected = statted.filter((p) => underCI(p, documents) || underCI(p, realDocuments));
  assert.deepEqual(insideProtected, [], 'guard never stats inside the protected dir (any casing)');
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a symlink target that varies a HOME component casing is refused, no stat inside the protected dir (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-homecase-'));
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(path.join(documents, 'vault'), { recursive: true });
  // The vault symlink's target varies the CASING of a HOME component: flip the case of
  // every letter in root's basename (same dir on macOS's case-insensitive FS, a distinct
  // non-existent path on a case-sensitive one). A case-SENSITIVE path.relative(home, p)
  // then classifies the target as OUTSIDE home and the prefix check never runs → the
  // walker would lstat the (case-insensitively real) protected Documents (the 4th defect
  // this WP closes). The now case-insensitive containment refuses it before any lstat.
  const flipCase = (s) =>
    [...s].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join('');
  const homeVariant = path.join(path.dirname(root), flipCase(path.basename(root)));
  assert.notEqual(homeVariant, root, 'the variant must differ in case to exercise the gap');
  const targetVariant = path.join(homeVariant, 'Documents', 'vault');
  fs.symlinkSync(targetVariant, path.join(root, 'link'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'link'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  const realLstat = fs.lstatSync;
  const realDocuments = fs.realpathSync(documents);
  /** @type {string[]} */ const statted = [];
  fs.lstatSync = (p, ...a) => {
    statted.push(String(p));
    return realLstat.call(fs, p, ...a);
  };
  try {
    await assert.rejects(
      withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
      /macOS protected folder \(Documents\)/
    );
  } finally {
    fs.lstatSync = realLstat;
  }

  const underCI = (p, base) => {
    const P = p.toLowerCase();
    const B = base.toLowerCase();
    return P === B || P.startsWith(B + path.sep);
  };
  const insideProtected = statted.filter((p) => underCI(p, documents) || underCI(p, realDocuments));
  assert.deepEqual(insideProtected, [], 'guard never stats inside the protected dir (home-casing variant)');
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a symlink target using the APFS Data-volume firmlink spelling is refused, no stat inside the protected dir (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-firmlink-'));
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(path.join(documents, 'vault'), { recursive: true });
  // The vault symlink's target uses the Data-volume FIRMLINK spelling of the protected
  // dir: /System/Volumes/Data + <root>/Documents/vault. On macOS this names the same
  // inode as <root>/Documents/vault, so a guard that only knows the plain spelling sees
  // it as outside home and the walker lstats the real protected dir (the 5th defect this
  // WP closes). checkPath strips the firmlink prefix, so the walk refuses it before lstat.
  const firmlinkTarget = '/System/Volumes/Data' + path.join(root, 'Documents', 'vault');
  fs.symlinkSync(firmlinkTarget, path.join(root, 'link'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'link'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  const realLstat = fs.lstatSync;
  const realDocuments = fs.realpathSync(documents);
  /** @type {string[]} */ const statted = [];
  fs.lstatSync = (p, ...a) => {
    statted.push(String(p));
    return realLstat.call(fs, p, ...a);
  };
  try {
    await assert.rejects(
      withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
      /macOS protected folder \(Documents\)/
    );
  } finally {
    fs.lstatSync = realLstat;
  }

  // Normalize statted paths the SAME way the guard does (strip firmlink → NFC → lower)
  // so a stat under ANY spelling of the protected dir is caught.
  const stripData = (s) =>
    s === '/System/Volumes/Data' ? '/' : s.startsWith('/System/Volumes/Data/') ? s.slice('/System/Volumes/Data'.length) : s;
  const norm = (s) => stripData(s).normalize('NFC').toLowerCase();
  const underN = (p, base) => {
    const P = norm(p);
    const B = norm(base);
    return P === B || P.startsWith(B + path.sep);
  };
  const insideProtected = statted.filter((p) => underN(p, documents) || underN(p, realDocuments));
  assert.deepEqual(insideProtected, [], 'guard never stats inside the protected dir (firmlink spelling)');
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a CASE-VARIANT firmlink-prefix target is refused, no stat inside the protected dir (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-fwcase-'));
  const documents = path.join(root, 'Documents');
  fs.mkdirSync(path.join(documents, 'vault'), { recursive: true });
  // The Data-volume firmlink prefix itself is spelled in LOWERCASE (/system/volumes/data).
  // Without folding case BEFORE the firmlink strip, checkPath fails to strip it → the
  // target lands outside the lowercased home → the walker lstats the real protected dir
  // (the round-6 ordering bug). The reordered pipeline strips it and refuses before lstat.
  const firmlinkTarget = '/system/volumes/data' + path.join(root, 'Documents', 'vault');
  fs.symlinkSync(firmlinkTarget, path.join(root, 'link'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'link'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  const realLstat = fs.lstatSync;
  const realDocuments = fs.realpathSync(documents);
  /** @type {string[]} */ const statted = [];
  fs.lstatSync = (p, ...a) => {
    statted.push(String(p));
    return realLstat.call(fs, p, ...a);
  };
  try {
    await assert.rejects(
      withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
      /macOS protected folder \(Documents\)/
    );
  } finally {
    fs.lstatSync = realLstat;
  }

  // Normalize statted paths the same way the guard does (case → firmlink → NFC) so a
  // stat inside the protected dir is caught under any spelling (incl. lowercase firmlink).
  const norm = (s) => {
    const lc = s.normalize('NFC').toLowerCase();
    const fw = '/system/volumes/data';
    return lc === fw ? '/' : lc.startsWith(fw + '/') ? lc.slice(fw.length) : lc;
  };
  const underN = (p, base) => {
    const P = norm(p);
    const B = norm(base);
    return P === B || P.startsWith(B + path.sep);
  };
  const insideProtected = statted.filter((p) => underN(p, documents) || underN(p, realDocuments));
  assert.deepEqual(insideProtected, [], 'guard never stats inside the protected dir (case-variant firmlink)');
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a final symlink with a TRAILING SLASH into a protected folder is refused (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-trailing-'));
  const protectedDir = path.join(root, 'Documents', 'vault');
  fs.mkdirSync(protectedDir, { recursive: true });
  fs.symlinkSync(protectedDir, path.join(root, 'vault'));
  // Configured vault carries a trailing separator (~/vault/) — the walk must strip it
  // and still follow the final symlink into Documents.
  const vaultCfg = path.join(root, 'vault') + path.sep;
  const { env, paths } = setupCoreWithVault(root, vaultCfg);
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  await assert.rejects(
    withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
    /macOS protected folder \(Documents\)/
  );
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a CHAINED symlink (a -> b -> protected) is refused (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-chain-'));
  const protectedDir = path.join(root, 'Documents', 'vault');
  fs.mkdirSync(protectedDir, { recursive: true });
  // a -> b, b -> Documents/vault. Vault configured as ~/a.
  fs.symlinkSync(path.join(root, 'b'), path.join(root, 'a'));
  fs.symlinkSync(protectedDir, path.join(root, 'b'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'a'));
  jobsLib.saveJob(paths, { name: 'digest', at: '07:00', run: 'skill:wienerdog-daily-digest', timeoutMinutes: 15 });
  const sendAlert = () => ({ status: 0 });

  await assert.rejects(
    withRun(env, {}, ['digest'], { platform: 'darwin', sendAlert, loader: noopLoader }),
    /macOS protected folder \(Documents\)/
  );
  assert.equal(jobsLib.readScheduleState(paths).digest.last_status, 'error');
  assert.ok(!fs.existsSync(path.join(paths.logs, 'digest')), 'the job never spawned');
});

test(
  'scheduler-runjob: a legitimately non-protected symlinked vault still runs (WP-095)',
  { skip: SKIP_WIN32_SYMLINK },
  async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-runjob-oksym-'));
  // link -> projects/vault (NOT under a protected prefix) → must run normally.
  const realVault = path.join(root, 'projects', 'vault');
  fs.mkdirSync(realVault, { recursive: true });
  fs.symlinkSync(realVault, path.join(root, 'link'));
  const { env, paths } = setupCoreWithVault(root, path.join(root, 'link'));
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);

  await withRun(env, {}, ['dream'], {
    resolveCommand: fakeResolve(fake),
    platform: 'darwin',
    sendAlert: () => ({ status: 0 }),
    loader: noopLoader,
  });

  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'ok', 'non-protected symlinked vault runs');
  assert.ok(state.dream.last_success, 'watermark set');
});

// -------------------------------------------------------------------------
// Fail-loud durable alert (alerts.jsonl) — append on failure, clear on success
// -------------------------------------------------------------------------

test('scheduler-runjob: failLoud always appends a durable alert and never throws', async () => {
  const { paths } = setup();

  // Email delivered → the durable alert is still recorded (independent of email).
  await runjob.failLoud(paths, 'dream', 'brain exploded', { sendAlert: () => ({ status: 0 }) });
  let alerts = readAlerts(paths);
  assert.equal(alerts.length, 1, 'one durable alert even when the email is delivered');
  assert.equal(alerts[0].job, 'dream');
  assert.equal(alerts[0].reason, 'brain exploded');
  assert.match(alerts[0].log_hint, /logs\/dream\/$/, 'log hint points at the job log dir');
  assert.match(alerts[0].at, /^\d{4}-\d{2}-\d{2}T/, 'ISO timestamp recorded');

  // A second failure appends (does not overwrite).
  await runjob.failLoud(paths, 'dream', 'again', { sendAlert: () => ({ status: 1 }) });
  alerts = readAlerts(paths);
  assert.equal(alerts.length, 2, 'second failure appends');

  // A throwing sendAlert must not escape failLoud — and the alert is still recorded.
  await runjob.failLoud(paths, 'dream', 'boom', {
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
    withRun(env, {}, ['dream'], { resolveCommand: fakeResolve(fail), sendAlert: () => ({ status: 0 }), loader: noopLoader }),
    /exited 3/
  );
  const alerts = readAlerts(paths);
  assert.equal(alerts.length, 1, 'exactly one alert appended on failure');
  assert.equal(alerts[0].job, 'dream');

  // 2. A subsequent successful run of the same job clears its alerts.
  const ok = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
  await withRun(env, {}, ['dream'], { resolveCommand: fakeResolve(ok), sendAlert: () => ({ status: 0 }), loader: noopLoader });
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
  await withRun(env, {}, ['--catch-up'], {
    resolveCommand: fakeResolve(fake),
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
  await withRun(env, {}, ['--catch-up'], {
    resolveCommand: fakeResolve(fake),
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

// -------------------------------------------------------------------------
// WP-132: managed-policy hook preflight + run evidence
// -------------------------------------------------------------------------

const { EVIDENCE_FILE } = require('../../src/core/run-evidence');

/** @param {object} paths @returns {object[]} parsed run-evidence records */
function readEvidence(paths) {
  const file = path.join(paths.state, EVIDENCE_FILE);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l));
}

test('scheduler-runjob: managed policy hooks present → warns, records evidence, PROCEEDS (WP-132)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'weekly', at: '07:00', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 15 });
  const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);
  const detect = () => ({ present: true, sources: ['/etc/claude-code/managed-settings.json'] });

  // No throw, no error watermark — the run PROCEEDS to a normal success.
  await withRun(env, {}, ['weekly'], {
    resolveCommand: fakeResolve(fake),
    loader: noopLoader,
    detectPolicyHooks: detect,
    sendAlert: () => ({ status: 0 }),
  });
  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.weekly.last_status, 'ok', 'managed hooks are a WARNING, never a STOP');

  // The evidence record captures the managed-policy state either way.
  const records = readEvidence(paths);
  assert.equal(records.length, 1);
  const rec = records[0];
  assert.equal(rec.job, 'weekly');
  assert.equal(rec.profileId, 'weekly-review');
  // The random temp-dir segment may be scrubbed by the uniform redaction pass
  // (a test-env artifact — production exec paths are stable); the executable
  // identity itself must survive.
  assert.ok(rec.execPath.endsWith('/ok.sh'), rec.execPath);
  assert.equal(rec.claudeVersion, 'unknown', 'a test fake is never version-probed');
  assert.deepEqual(rec.policyHooks, { present: true, sources: ['/etc/claude-code/managed-settings.json'] });
});

test('scheduler-runjob: the managed-hook warning lands on the durable alert channel (WP-132)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'weekly', at: '07:00', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 15 });
  // A FAILING run keeps alerts.jsonl intact (a success clears the job's alerts),
  // so the durable warning is observable here alongside the failure alert.
  const fake = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 3']);
  const detect = () => ({ present: true, sources: ['/x/managed-settings.json'] });

  await assert.rejects(
    withRun(env, {}, ['weekly'], {
      resolveCommand: fakeResolve(fake),
      loader: noopLoader,
      detectPolicyHooks: detect,
      sendAlert: () => ({ status: 0 }),
    }),
    /exited 3/
  );
  const warnings = readAlerts(paths).filter((a) => a.reason.includes('managed/admin policy'));
  assert.equal(warnings.length, 1, 'one durable managed-hook warning');
  assert.ok(warnings[0].reason.includes('/x/managed-settings.json'), 'names the source');
  assert.ok(warnings[0].reason.includes('the run continues'), 'states it is not a stop');
});

test('scheduler-runjob: no managed hooks → no warning, evidence still recorded for a skill run (WP-132)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'weekly', at: '07:00', run: 'skill:wienerdog-weekly-review', timeoutMinutes: 15 });
  const fake = writeScript(root, 'fail.sh', ['#!/bin/sh', 'exit 3']);
  const detect = () => ({ present: false, sources: [] });

  await assert.rejects(
    withRun(env, {}, ['weekly'], {
      resolveCommand: fakeResolve(fake),
      loader: noopLoader,
      detectPolicyHooks: detect,
      sendAlert: () => ({ status: 0 }),
    }),
    /exited 3/
  );
  const warnings = readAlerts(paths).filter((a) => a.reason.includes('managed/admin policy'));
  assert.equal(warnings.length, 0, 'no warning when no managed policy is present');
  const records = readEvidence(paths);
  assert.equal(records.length, 1, 'evidence recorded on failure too');
  assert.deepEqual(records[0].policyHooks, { present: false, sources: [] });
});

test('scheduler-runjob: builtin:dream under run-job records no duplicate evidence at this layer (WP-132)', async () => {
  const { root, env, paths } = setup();
  jobsLib.saveJob(paths, { name: 'dream', at: '03:30', run: 'builtin:dream', timeoutMinutes: 20 });
  const fake = writeScript(root, 'ok.sh', ['#!/bin/sh', 'exit 0']);

  await withRun(env, {}, ['dream'], {
    resolveCommand: fakeResolve(fake),
    loader: noopLoader,
    detectPolicyHooks: () => ({ present: false, sources: [] }),
  });
  assert.deepEqual(readEvidence(paths), [], 'the dream layer (spawnBrain) owns the dream evidence');
});
