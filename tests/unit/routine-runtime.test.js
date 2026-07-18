'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  SKILL_TO_PROFILE,
  profileIdForSkill,
  ensureRoutineStaging,
  brokerMcpConfigPath,
  composeRoutineRun,
} = require('../../src/core/routine-runtime');
const { getProfile, RuntimeProfileError } = require('../../src/core/runtime-profile');
const { RUNTIME_DIR } = require('../../src/core/runtime-settings');
const runjob = require('../../src/cli/run-job');
const { getPaths } = require('../../src/core/paths');
const { allowAll } = require('../../src/core/safety-profile');

const POSIX = process.platform !== 'win32';

const DENY_TOOLS = ['Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Workflow', 'NotebookEdit'];

/** Isolated temp paths. @returns {import('../../src/core/paths').WienerdogPaths} */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-routine-'));
  return getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
}

/** The value that follows a flag in an argv. @param {string[]} args @param {string} flag @returns {string|undefined} */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// --- profile-id mapping ---

test('routine-runtime: profileIdForSkill maps exactly the three shipped skills', () => {
  assert.equal(profileIdForSkill('wienerdog-daily-digest'), 'daily-digest');
  assert.equal(profileIdForSkill('wienerdog-inbox-triage'), 'inbox-triage');
  assert.equal(profileIdForSkill('wienerdog-weekly-review'), 'weekly-review');
  assert.deepEqual(Object.keys(SKILL_TO_PROFILE).length, 3);
});

test('routine-runtime: an unmapped skill fails closed (no arbitrary skill dispatch)', () => {
  assert.throws(() => profileIdForSkill('anything-else'), RuntimeProfileError);
  assert.throws(() => profileIdForSkill('wienerdog-dream'), RuntimeProfileError, 'the dream is not a routine');
  assert.throws(() => profileIdForSkill(''), RuntimeProfileError);
  assert.throws(() => profileIdForSkill('constructor'), RuntimeProfileError);
});

// --- staging ---

test('routine-runtime: ensureRoutineStaging recreates an empty 0700 dir per run', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const dir = ensureRoutineStaging(paths, 'weekly-review');
  assert.equal(dir, path.join(paths.state, 'routine-run', 'weekly-review'));
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  fs.writeFileSync(path.join(dir, 'leftover.txt'), 'stale');
  const again = ensureRoutineStaging(paths, 'weekly-review');
  assert.equal(again, dir);
  assert.deepEqual(fs.readdirSync(dir), [], 'wiped empty on every run');
});

// --- broker seam ---

test('routine-runtime: brokerMcpConfigPath is null until A2 wires the seam file', () => {
  const paths = tempPaths();
  assert.equal(brokerMcpConfigPath(paths, getProfile('daily-digest')), null, 'broker profile, seam absent');
  assert.equal(brokerMcpConfigPath(paths, getProfile('weekly-review')), null, 'mcp:empty profile');
  // A2 writes the seam file → the broker profile picks it up (the ONE plug-in point).
  const seam = path.join(RUNTIME_DIR(paths), 'broker-mcp.json');
  fs.mkdirSync(RUNTIME_DIR(paths), { recursive: true });
  fs.writeFileSync(seam, '{}');
  assert.equal(brokerMcpConfigPath(paths, getProfile('daily-digest')), seam);
  assert.equal(brokerMcpConfigPath(paths, getProfile('weekly-review')), null, 'mcp:empty stays null');
});

// --- composition ---

test('routine-runtime: composeRoutineRun (weekly-review, mcp:empty) is fully hermetic', () => {
  const paths = tempPaths();
  const job = { name: 'weekly', run: 'skill:wienerdog-weekly-review' };
  const r = composeRoutineRun(paths, job);

  assert.equal(r.command, 'claude');
  assert.equal(r.shell, false);
  assert.equal(r.cwd, path.join(paths.state, 'routine-run', 'weekly-review'));
  assert.deepEqual(fs.readdirSync(r.cwd), [], 'staging is empty');

  const args = r.args;
  assert.equal(flagValue(args, '-p'), '/wienerdog-weekly-review');
  assert.equal(flagValue(args, '--tools'), 'Read', 'explicit MINIMAL allowlist, never empty');
  const deny = (flagValue(args, '--disallowedTools') || '').split(',');
  for (const t of DENY_TOOLS) assert.ok(deny.includes(t), `deny list names ${t}`);
  assert.equal(flagValue(args, '--setting-sources'), '', 'empty — loads nothing ambient');
  assert.ok(!args.join(' ').includes('--setting-sources user'));
  assert.equal(flagValue(args, '--settings'), path.join(RUNTIME_DIR(paths), 'settings.json'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(!args.includes('--mcp-config'), 'mcp:empty → no MCP server');

  // The ONLY writable root is the staging dir — never the vault/home.
  const addDirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []));
  assert.deepEqual(addDirs, [r.cwd]);

  // The verified vendored skill body is appended (D-SKILL-LOAD).
  const body = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'wienerdog-weekly-review', 'SKILL.md'),
    'utf8'
  );
  assert.equal(flagValue(args, '--append-system-prompt'), body);
});

test('routine-runtime: a broker routine with no A2 config fails closed (D-BROKER-SEAM)', () => {
  const paths = tempPaths();
  assert.throws(
    () => composeRoutineRun(paths, { name: 'digest', run: 'skill:wienerdog-daily-digest' }),
    RuntimeProfileError
  );
  assert.throws(
    () => composeRoutineRun(paths, { name: 'triage', run: 'skill:wienerdog-inbox-triage' }),
    RuntimeProfileError
  );
});

test('routine-runtime: a broker routine composes exactly one --mcp-config once A2 wires the seam', () => {
  const paths = tempPaths();
  const seam = path.join(RUNTIME_DIR(paths), 'broker-mcp.json');
  fs.mkdirSync(RUNTIME_DIR(paths), { recursive: true });
  fs.writeFileSync(seam, '{}');
  const r = composeRoutineRun(paths, { name: 'digest', run: 'skill:wienerdog-daily-digest' });
  assert.equal(r.args.filter((a) => a === '--mcp-config').length, 1);
  assert.equal(flagValue(r.args, '--mcp-config'), seam);
  assert.ok(r.args.includes('--strict-mcp-config'));
});

test('routine-runtime: an unmapped skill: job cannot compose (fail closed before any argv)', () => {
  const paths = tempPaths();
  assert.throws(
    () => composeRoutineRun(paths, { name: 'evil', run: 'skill:attacker-skill' }),
    RuntimeProfileError
  );
});

// --- the A0 gate stays first ---

test('routine-runtime: in production the gate throws BEFORE composing — no staging created', () => {
  const paths = tempPaths();
  const savedCmd = process.env.WIENERDOG_RUNJOB_CMD;
  delete process.env.WIENERDOG_RUNJOB_CMD;
  try {
    assert.throws(
      () => runjob.resolveCommand(paths, { name: 'digest', run: 'skill:wienerdog-weekly-review' }),
      /disabled in this release/
    );
    assert.ok(
      !fs.existsSync(path.join(paths.state, 'routine-run')),
      'no staging dir was created — the freeze fired before composition'
    );
    assert.ok(
      !fs.existsSync(path.join(RUNTIME_DIR(paths), 'settings.json')),
      'no settings profile was written — the freeze fired before composition'
    );
  } finally {
    if (savedCmd === undefined) delete process.env.WIENERDOG_RUNJOB_CMD;
    else process.env.WIENERDOG_RUNJOB_CMD = savedCmd;
  }
});

test('routine-runtime: with the test-only allowAll seam, resolveCommand returns the hermetic composition', () => {
  const paths = tempPaths();
  const savedCmd = process.env.WIENERDOG_RUNJOB_CMD;
  delete process.env.WIENERDOG_RUNJOB_CMD;
  try {
    const r = runjob.resolveCommand(paths, { name: 'weekly', run: 'skill:wienerdog-weekly-review' }, allowAll());
    assert.equal(r.command, 'claude');
    assert.equal(r.cwd, path.join(paths.state, 'routine-run', 'weekly-review'));
    assert.equal(flagValue(r.args, '--setting-sources'), '');
  } finally {
    if (savedCmd === undefined) delete process.env.WIENERDOG_RUNJOB_CMD;
    else process.env.WIENERDOG_RUNJOB_CMD = savedCmd;
  }
});
