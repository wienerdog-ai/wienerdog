'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildClaudeArgs, spawnBrain, DREAM_PROMPT, ensureBrainStaging } = require('../../src/core/dream/brain');
const { WienerdogError } = require('../../src/core/errors');

const DREAM_SKILL_BODY = fs.readFileSync(
  path.join(__dirname, '..', '..', 'skills', 'wienerdog-dream', 'SKILL.md'),
  'utf8'
);

/** The value that follows a flag in an argv. @param {string[]} args @param {string} flag @returns {string|undefined} */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

test('dream-brain: buildClaudeArgs composes the hermetic argv (WP-130), no model', () => {
  const args = buildClaudeArgs({
    vaultDir: '/v',
    scratchDir: '/s',
    date: '2026-07-02',
    model: null,
    settingsPath: '/set.json',
  });
  const joined = args.join(' ');

  assert.equal(flagValue(args, '--tools'), 'Read,Write,Edit,Glob,Grep');
  const deny = (flagValue(args, '--disallowedTools') || '').split(',');
  for (const t of ['Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Workflow', 'NotebookEdit']) {
    assert.ok(deny.includes(t), `--disallowedTools names ${t}`);
  }
  assert.equal(flagValue(args, '--permission-mode'), 'acceptEdits');
  assert.ok(joined.includes('--add-dir /v'));
  assert.ok(joined.includes('--add-dir /s'));
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(!args.includes('--mcp-config'), 'dream has zero MCP servers');

  // A1: NO ambient setting source — empty value, never 'user' — plus the
  // hook-free settings profile and the verified vendored skill body.
  assert.equal(flagValue(args, '--setting-sources'), '');
  assert.ok(!joined.includes('--setting-sources user'));
  assert.equal(flagValue(args, '--settings'), '/set.json');
  assert.equal(flagValue(args, '--append-system-prompt'), DREAM_SKILL_BODY);

  // Forbidden escape hatches must never appear.
  assert.ok(!joined.includes('--dangerously-skip-permissions'));
  assert.ok(!joined.includes('--bare'));
  assert.ok(!joined.includes('--safe-mode'));

  // Model omitted when null.
  assert.ok(!args.includes('--model'));

  // The prompt carries the paths (Bash is off; the skill reads them from text).
  const prompt = flagValue(args, '-p');
  assert.ok(prompt.includes('/wienerdog-dream'));
  assert.ok(prompt.includes('/s'));
  assert.ok(prompt.includes('/v'));
  assert.ok(prompt.includes('2026-07-02'));
});

test('dream-brain: DREAM_PROMPT tier lines are ABSOLUTE and vault-prefixed (D-DREAM-CWD)', () => {
  const prompt = DREAM_PROMPT('/s', '/v', '2026-07-03');

  // The three original path lines survive.
  assert.ok(prompt.includes('Scratch extracts directory (read-only inputs): /s'));
  assert.ok(prompt.includes('Vault directory (your only write target): /v'));
  assert.ok(prompt.includes("Today's date: 2026-07-03"));

  // Tier lines are absolute (the cwd is a neutral staging dir; a bare relative
  // name would resolve outside the --add-dir roots and the write would be lost).
  assert.ok(prompt.includes(`- Identity notes directory: ${path.join('/v', '06-Identity')}`));
  assert.ok(prompt.includes(`- Skills directory: ${path.join('/v', '05-Skills')}`));
  assert.ok(prompt.includes(`- Daily log file for today: ${path.join('/v', '07-Daily', '2026-07-03.md')}`));
  assert.ok(prompt.includes(`- Reports directory: ${path.join('/v', 'reports/dreams')}`));
  // No bare relative tier name appears as a write target.
  assert.ok(!prompt.includes(': 06-Identity'));
  assert.ok(!prompt.includes(': 07-Daily/2026-07-03.md'));
});

test('dream-brain: buildClaudeArgs embeds a non-default layout, allowlist unchanged', () => {
  // Power-user layout: renamed daily dir + nested filename pattern.
  const layout = {
    identity_dir: '06-Identity',
    daily_dir: '05-Daily',
    daily_filename: 'YYYY/MM/YYYY-MM-DD.md',
    projects_dir: '01-Projects',
    skills_dir: '05-Skills',
    reports_dir: 'reports/dreams',
    inbox_dir: '00-Inbox',
  };
  const args = buildClaudeArgs({
    vaultDir: '/v',
    scratchDir: '/s',
    date: '2026-07-03',
    model: null,
    layout,
    settingsPath: '/set.json',
  });

  // The resolved (nested, absolute) daily-log path lands in the prompt; the
  // default does not. (Asserted on the prompt, not the whole argv — the
  // appended skill body legitimately mentions default folder names.)
  const prompt = flagValue(args, '-p');
  assert.ok(prompt.includes(path.join('/v', '05-Daily', '2026', '07', '2026-07-03.md')));
  assert.ok(!prompt.includes('07-Daily'));

  // The tool allowlist is untouched by layout.
  assert.equal(flagValue(args, '--tools'), 'Read,Write,Edit,Glob,Grep');
});

test('dream-brain: buildClaudeArgs includes --model when set', () => {
  const args = buildClaudeArgs({
    vaultDir: '/v',
    scratchDir: '/s',
    date: '2026-07-02',
    model: 'opus',
    settingsPath: '/set.json',
  });
  const i = args.indexOf('--model');
  assert.ok(i !== -1);
  assert.equal(args[i + 1], 'opus');
});

test('dream-brain: a tampered/missing dream skill aborts the build (fail closed, WP-129 seam)', () => {
  const base = { vaultDir: '/v', scratchDir: '/s', date: '2026-07-02', model: null, settingsPath: '/set.json' };
  assert.throws(
    () => buildClaudeArgs({ ...base, skillSeam: { digests: { 'wienerdog-dream': 'deadbeef' } } }),
    WienerdogError
  );
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  assert.throws(() => buildClaudeArgs({ ...base, skillSeam: { skillsRoot: emptyRoot } }), WienerdogError);
});


test('dream-brain: spawnBrain runs WIENERDOG_DREAM_CMD from the fresh staging cwd and passes the env', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  const core = path.join(root, 'core');
  const marker = path.join(root, 'marker.txt');
  const fakeCmd = path.join(root, 'fake-brain.sh');
  fs.writeFileSync(
    fakeCmd,
    ['#!/bin/sh', 'printf "%s\\n%s\\n%s\\n" "$WIENERDOG_DREAM_VAULT" "$WIENERDOG_DREAM_SCRATCH" "$(pwd)" > "$MARKER"', 'exit 7', ''].join('\n')
  );
  fs.chmodSync(fakeCmd, 0o755);

  const vaultDir = path.join(root, 'vault');
  const scratchDir = path.join(root, 'scratch');
  fs.mkdirSync(vaultDir);

  const { done } = spawnBrain({
    vaultDir,
    scratchDir,
    date: '2026-07-02',
    model: null,
    env: { ...process.env, WIENERDOG_DREAM_CMD: fakeCmd, MARKER: marker, WIENERDOG_HOME: core },
  });

  const result = await done;
  assert.equal(result.code, 7);
  assert.equal(typeof result.durationMs, 'number');

  const [gotVault, gotScratch, gotCwd] = fs.readFileSync(marker, 'utf8').trim().split('\n');
  assert.equal(gotVault, vaultDir);
  assert.equal(gotScratch, scratchDir);
  // D-DREAM-CWD: the brain runs from the fresh staging dir, NOT the vault.
  assert.equal(fs.realpathSync(gotCwd), fs.realpathSync(path.join(core, 'state', 'dream-run')));
  assert.notEqual(fs.realpathSync(gotCwd), fs.realpathSync(vaultDir));
});

test('dream-brain: ensureBrainStaging recreates an empty 0700 staging dir each run', { skip: process.platform === 'win32' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  const paths = { state: path.join(root, 'state') };
  const dir = ensureBrainStaging(paths);
  assert.equal(dir, path.join(root, 'state', 'dream-run'));
  fs.writeFileSync(path.join(dir, 'leftover.txt'), 'stale state');
  const again = ensureBrainStaging(paths);
  assert.equal(again, dir);
  assert.deepEqual(fs.readdirSync(dir), [], 'wiped empty on every run');
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

test('dream-brain: spawnBrain done resolves a stderrTail on nonzero exit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  const fakeCmd = path.join(root, 'fake-brain.sh');
  fs.writeFileSync(
    fakeCmd,
    ['#!/bin/sh', 'echo "brain boom: API drop mid-run" 1>&2', 'exit 4', ''].join('\n')
  );
  fs.chmodSync(fakeCmd, 0o755);

  const vaultDir = path.join(root, 'vault');
  const scratchDir = path.join(root, 'scratch');
  fs.mkdirSync(vaultDir);

  const { done } = spawnBrain({
    vaultDir,
    scratchDir,
    date: '2026-07-04',
    model: null,
    env: { ...process.env, WIENERDOG_DREAM_CMD: fakeCmd, WIENERDOG_HOME: path.join(root, 'core') },
  });

  const result = await done;
  assert.equal(result.code, 4);
  assert.equal(typeof result.stderrTail, 'string');
  assert.match(result.stderrTail, /brain boom: API drop mid-run/);
});

test('dream-brain: a secret in brain output is redacted in the teed log AND stderrTail (WP-124 EP3)', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-'));
  const fakeCmd = path.join(root, 'fake-brain.sh');
  fs.writeFileSync(
    fakeCmd,
    [
      '#!/bin/sh',
      'echo "stdout leak sk-ant-abcdefghijklmnopqrstuvwx0123 end"',
      'echo "Traceback: OPENAI_API_KEY=sk-proj-ABCDEF0123456789abcdef" 1>&2',
      'exit 4',
      '',
    ].join('\n')
  );
  fs.chmodSync(fakeCmd, 0o755);
  const vaultDir = path.join(root, 'vault');
  fs.mkdirSync(vaultDir);
  const logFile = path.join(root, 'run.log');
  const logStream = fs.createWriteStream(logFile);

  const { done } = spawnBrain({
    vaultDir,
    scratchDir: path.join(root, 'scratch'),
    date: '2026-07-04',
    model: null,
    env: { ...process.env, WIENERDOG_DREAM_CMD: fakeCmd, WIENERDOG_HOME: path.join(root, 'core') },
    logStream,
  });
  const result = await done;
  await new Promise((resolve) => logStream.end(resolve));

  assert.equal(result.code, 4);
  const log = fs.readFileSync(logFile, 'utf8');
  assert.ok(log.includes('[REDACTED:'), log);
  assert.ok(!log.includes('sk-ant-abcdefghijklmnopqrstuvwx0123'), 'stdout secret must not reach the log');
  assert.ok(!log.includes('sk-proj-ABCDEF0123456789abcdef'), 'stderr secret must not reach the log');
  assert.ok(result.stderrTail.includes('[REDACTED:'), result.stderrTail);
  assert.ok(!result.stderrTail.includes('sk-proj-ABCDEF0123456789abcdef'), 'secret must not reach stderrTail');
  assert.ok(result.stderrTail.includes('OPENAI_API_KEY='), 'non-secret context is preserved');
});

// --- A7 (WP-154): the brain is spawned by its verified pinned absolute path ---

/** A fake `claude` that answers --version and records its own invoked path. */
function writePinnableClaude(binDir) {
  const p = path.join(binDir, 'claude');
  fs.writeFileSync(
    p,
    [
      '#!/bin/sh',
      'if [ "$1" = "--version" ]; then echo "9.9.9 (Fake Claude)"; exit 0; fi',
      'echo "$0" > "$WD_TEST_MARKER"',
      'exit 0',
      '',
    ].join('\n')
  );
  fs.chmodSync(p, 0o755);
  return p;
}

test('dream-brain: spawnBrain spawns the pinned ABSOLUTE claude path, never the bare name (WP-154)', { skip: process.platform === 'win32' }, async () => {
  const { createPins } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-pin-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  const fake = writePinnableClaude(bin);
  const marker = path.join(root, 'marker.txt');
  const vaultDir = path.join(root, 'vault');
  fs.mkdirSync(vaultDir);

  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    PATH: `${bin}:/usr/bin:/bin`,
    WD_TEST_MARKER: marker,
  };
  createPins(getPaths(env), { env, platform: process.platform });

  const { done } = spawnBrain({ vaultDir, scratchDir: path.join(root, 'scratch'), date: '2026-07-18', model: null, env });
  const result = await done;
  assert.equal(result.code, 0);
  assert.equal(fs.readFileSync(marker, 'utf8').trim(), fs.realpathSync(fake), 'spawned by absolute realpath');
});

test('dream-brain: spawnBrain fails safe on pin drift — a fake claude earlier on PATH never spawns (WP-154)', { skip: process.platform === 'win32' }, () => {
  const { createPins } = require('../../src/core/exec-identity');
  const { getPaths } = require('../../src/core/paths');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brain-pin-'));
  const bin = path.join(root, 'bin');
  const evil = path.join(root, 'evil');
  fs.mkdirSync(bin, { recursive: true, mode: 0o700 });
  fs.mkdirSync(evil, { recursive: true, mode: 0o700 });
  writePinnableClaude(bin);
  const marker = path.join(root, 'evil-marker.txt');
  const vaultDir = path.join(root, 'vault');
  fs.mkdirSync(vaultDir);

  const pinEnv = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd'), PATH: `${bin}:/usr/bin:/bin` };
  createPins(getPaths(pinEnv), { env: pinEnv, platform: process.platform });

  // Plant the fake FIRST on the job PATH; give it the marker so an accidental
  // spawn would be visible.
  const evilClaude = path.join(evil, 'claude');
  fs.writeFileSync(evilClaude, `#!/bin/sh\necho pwned > "${marker}"\nexit 0\n`);
  fs.chmodSync(evilClaude, 0o755);
  const env = { ...pinEnv, PATH: `${evil}:${bin}:/usr/bin:/bin`, WD_TEST_MARKER: marker };

  assert.throws(
    () => spawnBrain({ vaultDir, scratchDir: path.join(root, 'scratch'), date: '2026-07-18', model: null, env }),
    (err) => err instanceof WienerdogError && /wienerdog sync/.test(err.message) && /claude/.test(err.message)
  );
  assert.equal(fs.existsSync(marker), false, 'the planted fake was never executed');
});
