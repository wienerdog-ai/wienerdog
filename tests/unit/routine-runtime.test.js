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
  ensureBrokerMcpConfig,
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

test('routine-runtime: ensureBrokerMcpConfig WRITES the per-routine seam (WP-141) and stays null for dream', () => {
  const paths = tempPaths();
  const seam = ensureBrokerMcpConfig(paths, getProfile('daily-digest'));
  assert.equal(seam, path.join(RUNTIME_DIR(paths), 'broker-mcp-daily-digest.json'));
  assert.ok(fs.existsSync(seam), 'the seam file is written, not merely located');
  const cfg = JSON.parse(fs.readFileSync(seam, 'utf8'));
  assert.deepEqual(cfg.mcpServers['wienerdog-broker'].args.slice(-2), ['--routine', 'daily-digest']);
  assert.equal(ensureBrokerMcpConfig(paths, getProfile('dream')), null, 'mcp:empty profile stays null');
});

// --- composition ---

test('routine-runtime: composeRoutineRun (weekly-review) is fully hermetic with the broker wired', () => {
  const paths = tempPaths();
  const job = { name: 'weekly', run: 'skill:wienerdog-weekly-review' };
  const r = composeRoutineRun(paths, job);

  assert.equal(r.command, 'claude');
  assert.equal(r.shell, false);
  assert.equal(r.cwd, path.join(paths.state, 'routine-run', 'weekly-review'));
  assert.deepEqual(fs.readdirSync(r.cwd), ['vault-snapshot'], 'staging holds only the read-only snapshot');

  const args = r.args;
  assert.equal(flagValue(args, '-p'), '/wienerdog-weekly-review');
  assert.equal(flagValue(args, '--tools'), 'Read', 'explicit MINIMAL allowlist, never empty');
  const deny = (flagValue(args, '--disallowedTools') || '').split(',');
  for (const t of DENY_TOOLS) assert.ok(deny.includes(t), `deny list names ${t}`);
  assert.equal(flagValue(args, '--setting-sources'), '', 'empty — loads nothing ambient');
  assert.ok(!args.join(' ').includes('--setting-sources user'));
  assert.equal(flagValue(args, '--settings'), path.join(RUNTIME_DIR(paths), 'settings.json'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.equal(
    flagValue(args, '--mcp-config'),
    path.join(RUNTIME_DIR(paths), 'broker-mcp-weekly-review.json'),
    'weekly-review is mcp:broker since WP-141 (A2-RESTORE done)'
  );
  assert.equal(flagValue(args, '--allowedTools'), 'mcp__wienerdog-broker__create_draft');

  // The ONLY writable root is the staging dir — never the vault/home; the
  // snapshot subdir is added for read intent only.
  const addDirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []));
  assert.deepEqual(addDirs, [r.cwd, path.join(r.cwd, 'vault-snapshot')]);
  assert.ok(!addDirs.includes(paths.vault), 'the live vault is NEVER added');

  // The verified vendored skill body is appended (D-SKILL-LOAD).
  const body = fs.readFileSync(
    path.join(__dirname, '..', '..', 'skills', 'wienerdog-weekly-review', 'SKILL.md'),
    'utf8'
  );
  assert.equal(flagValue(args, '--append-system-prompt'), body);
});

test('routine-runtime: a broker routine composes exactly one --mcp-config, written by the composition itself', () => {
  const paths = tempPaths();
  const r = composeRoutineRun(paths, { name: 'digest', run: 'skill:wienerdog-daily-digest' });
  assert.equal(r.args.filter((a) => a === '--mcp-config').length, 1);
  const seam = flagValue(r.args, '--mcp-config');
  assert.equal(seam, path.join(RUNTIME_DIR(paths), 'broker-mcp-daily-digest.json'));
  assert.ok(fs.existsSync(seam), 'the WP-141 composition writes the seam per run');
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
  // WP-155 deleted resolveCommand's env seam, so no env save/restore is needed.
  const paths = tempPaths();
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
});

test('routine-runtime: with the test-only allowAll seam, resolveCommand returns the hermetic composition', () => {
  const paths = tempPaths();
  const r = runjob.resolveCommand(paths, { name: 'weekly', run: 'skill:wienerdog-weekly-review' }, allowAll());
  assert.equal(r.command, 'claude');
  assert.equal(r.cwd, path.join(paths.state, 'routine-run', 'weekly-review'));
  assert.equal(flagValue(r.args, '--setting-sources'), '');
});
