'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dream = require('../../src/cli/dream');
const { acquireLock } = require('../../src/core/dream/lock');

const FAKE_BRAIN = path.resolve(__dirname, '../fixtures/dream/fake-brain.js');
const INJ_FIXTURE = path.resolve(__dirname, '../fixtures/dream/transcripts/claude-injection.jsonl');
const DATE = '2026-07-02';

const ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY',
  'WIENERDOG_DREAM_CMD',
  'WIENERDOG_FAKE_BRAIN_MODE',
];

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** @param {string} base @param {string} rel @param {string} content */
function writeFile(base, rel, content) {
  const full = path.join(base, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

/** @param {string} vault @returns {number} number of commits on HEAD. */
function commitCount(vault) {
  return Number(git(vault, ['rev-list', '--count', 'HEAD']).trim());
}

/**
 * Build a temp home + core + clean vault git repo + config.yaml, and (unless
 * disabled) plant the injection transcript so the pipeline has input to dream on.
 * @param {{timeoutMinutes?:number, withTranscript?:boolean}} [opts]
 */
function setup(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-dream-int-'));
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const vault = path.join(root, 'vault');
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex-absent');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(core, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });

  // Seed the vault: a README plus a canonical identity file (so the regenerated
  // digest has content to reflect), then commit to a clean baseline.
  writeFile(vault, 'README.md', '# vault\n');
  writeFile(vault, '06-Identity/profile.md', '---\nderived_from_untrusted: false\n---\n\n# Who\n\nAda, a product designer.\n');
  git(vault, ['init', '-q']);
  git(vault, ['config', 'user.name', 'test']);
  git(vault, ['config', 'user.email', 'test@test']);
  git(vault, ['add', '-A']);
  git(vault, ['commit', '-q', '-m', 'seed']);

  writeFile(core, 'config.yaml', `vault: ${vault}\ndream_timeout_minutes: ${opts.timeoutMinutes ?? 5}\n`);

  if (opts.withTranscript !== false) {
    const projDir = path.join(claude, 'projects', 'proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.copyFileSync(INJ_FIXTURE, path.join(projDir, 'inj.jsonl'));
  }

  return { root, home, core, vault, claude, codex };
}

/**
 * Apply env, run `dream`, capture stdout/stderr text and any thrown error, then
 * restore env — all in-process (no real claude, no network).
 * @param {ReturnType<typeof setup>} ctx
 * @param {string[]} argv
 * @param {Record<string,string>} [extraEnv]
 */
async function runDream(ctx, argv, extraEnv = {}) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, {
    HOME: ctx.home,
    WIENERDOG_HOME: ctx.core,
    WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude,
    CODEX_HOME: ctx.codex,
    WIENERDOG_FAKE_TODAY: DATE,
    WIENERDOG_DREAM_CMD: FAKE_BRAIN,
    ...extraEnv,
  });
  if (extraEnv.WIENERDOG_FAKE_BRAIN_MODE === undefined) delete process.env.WIENERDOG_FAKE_BRAIN_MODE;

  const logs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  let thrown = null;
  try {
    await dream.run(argv);
  } catch (e) {
    thrown = e;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { output: logs.join('\n'), thrown };
}

// ── the full happy path + all gate outcomes ─────────────────────────────────

test('dream-integration: full run commits valid tiers, reverts injection + weak skill, deletes out-of-vault, one revertable commit', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // Exactly one new commit, correct message shape.
  assert.equal(commitCount(ctx.vault), before + 1);
  const msg = git(ctx.vault, ['log', '-1', '--pretty=%s']).trim();
  assert.match(msg, /^dream: \d{4}-\d{2}-\d{2} — \d+ notes, \d+ skills$/);

  const tracked = git(ctx.vault, ['ls-files']);
  assert.ok(tracked.includes('06-Identity/valid-identity.md'));
  assert.ok(tracked.includes('03-Resources/valid-note.md'));
  assert.ok(!tracked.includes('06-Identity/injected.md'));
  assert.ok(!tracked.includes('05-Skills/weak-skill/SKILL.md'));

  // The injected instruction never lands under 06-Identity in the committed tree.
  let matches = '';
  try {
    matches = git(ctx.vault, ['grep', '-rl', 'attacker@evil.com']);
  } catch (e) {
    if (e.status !== 1) throw e; // exit 1 = no match
  }
  assert.equal(matches.trim(), '');

  // The report's enforcement section lists every intervention.
  const report = fs.readFileSync(path.join(ctx.vault, 'reports/dreams', `${DATE}.md`), 'utf8');
  assert.ok(report.includes('## Reverted by orchestrator (policy enforcement)'));
  assert.ok(report.includes('06-Identity/injected.md'));
  assert.ok(report.includes('05-Skills/weak-skill/SKILL.md'));
  assert.ok(report.includes('EVIL.json'));

  // Watermarks advanced (claude got a real mtime).
  const wm = JSON.parse(fs.readFileSync(path.join(ctx.core, 'state', 'watermarks.json'), 'utf8'));
  assert.equal(typeof wm.claude, 'number');

  // Digest regenerated over the vault (reflects the identity content).
  const digest = fs.readFileSync(path.join(ctx.core, 'state', 'digest.md'), 'utf8');
  assert.ok(digest.includes('Ada, a product designer.'));

  // Scratch is gone.
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);

  // Summary output present.
  assert.match(output, /dream committed/);

  // `git revert` cleanly undoes the whole run.
  const sha = git(ctx.vault, ['rev-parse', 'HEAD']).trim();
  git(ctx.vault, ['revert', '--no-edit', sha]);
  assert.equal(fs.existsSync(path.join(ctx.vault, '06-Identity/valid-identity.md')), false);
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');
});

test('dream-integration: a second run with no new transcripts makes no commit and no watermark change', async () => {
  const ctx = setup();
  await runDream(ctx, ['--yes']);
  const afterFirst = commitCount(ctx.vault);
  const wmFirst = fs.readFileSync(path.join(ctx.core, 'state', 'watermarks.json'), 'utf8');

  const { output } = await runDream(ctx, ['--yes']);
  assert.match(output, /nothing new to dream/);
  assert.equal(commitCount(ctx.vault), afterFirst);
  assert.equal(fs.readFileSync(path.join(ctx.core, 'state', 'watermarks.json'), 'utf8'), wmFirst);
});

test('dream-integration: --dry-run prints the plan and resolved argv, runs no brain, makes no commit', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const { output, thrown } = await runDream(ctx, ['--dry-run']);
  assert.equal(thrown, null);
  assert.match(output, /dry-run/);
  assert.match(output, /brain argv: claude -p/);
  assert.ok(output.includes(ctx.vault));
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.vault, '06-Identity/injected.md')), false);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
});

test('dream-integration: a dirty vault is pre-committed, then the dream proceeds (starvation fix)', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  // An ordinary interactive session left the vault dirty (uncommitted edits).
  fs.writeFileSync(path.join(ctx.vault, 'uncommitted.md'), 'session edit\n');

  const { thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);

  // Two new commits: the pre-commit of the user's edits, then the dream commit.
  assert.equal(commitCount(ctx.vault), before + 2);
  const subjects = git(ctx.vault, ['log', '-2', '--pretty=%s']).trim().split('\n');
  assert.match(subjects[0], /^dream: \d{4}-\d{2}-\d{2} — \d+ notes, \d+ skills$/);
  assert.equal(subjects[1], 'vault: session edits before dream');

  // The previously-uncommitted file is now tracked.
  assert.ok(git(ctx.vault, ['ls-files']).includes('uncommitted.md'));
  // The dream's own writes still landed and the tree is clean.
  assert.ok(git(ctx.vault, ['ls-files']).includes('06-Identity/valid-identity.md'));
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');
});

test('dream-integration: a crashed brain restores the vault, releases the lock, advances no watermark', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const { output, thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'crash' });

  // The run fails loud, surfacing the brain's stderr tail.
  assert.ok(thrown);
  assert.match(thrown.message, /dream brain exited 1/);
  assert.match(thrown.message, /API connection dropped/);

  // No dream commit, watermarks not advanced.
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'watermarks.json')), false);

  // The brain's partial write is gone and the tree is byte-clean.
  assert.equal(fs.existsSync(path.join(ctx.vault, '00-Inbox/partial-note.md')), false);
  assert.equal(git(ctx.vault, ['status', '--porcelain']).trim(), '');

  // Lock released and scratch wiped (the outer finally ran after the restore).
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream.lock')), false);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
  assert.ok(!/dream committed/.test(output));
});

test('dream-integration: the watchdog kills a hanging brain, exits with a timeout error, no commit, no scratch left', async () => {
  const ctx = setup({ timeoutMinutes: 0.02 }); // ~1.2s watchdog
  const before = commitCount(ctx.vault);
  const { thrown } = await runDream(ctx, ['--yes'], { WIENERDOG_FAKE_BRAIN_MODE: 'hang' });
  assert.ok(thrown);
  assert.match(thrown.message, /timed out/);
  assert.equal(commitCount(ctx.vault), before);
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream-scratch')), false);
  // Lock released (finally ran).
  assert.equal(fs.existsSync(path.join(ctx.core, 'state', 'dream.lock')), false);
});

test('dream-integration: a live concurrent lock yields "another dream in progress" and no commit', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  // Plant a live foreign lock (future deadline, different pid).
  const state = path.join(ctx.core, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(
    path.join(state, 'dream.lock'),
    JSON.stringify({ pid: process.pid + 99999, host: 'other', startedAt: new Date().toISOString(), deadline: Date.now() + 600000 })
  );

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null);
  assert.match(output, /another dream is in progress/);
  assert.equal(commitCount(ctx.vault), before);
  // The foreign lock was not deleted.
  assert.equal(fs.existsSync(path.join(state, 'dream.lock')), true);
});

test('dream-integration: a stale lock past its deadline is stolen with a warning and the run proceeds', async () => {
  const ctx = setup();
  const before = commitCount(ctx.vault);
  const state = path.join(ctx.core, 'state');
  // Pre-seed a stale lock (deadline in the past) using the real helper.
  acquireLock(state, -1);

  const { output, thrown } = await runDream(ctx, ['--yes']);
  assert.equal(thrown, null, thrown && thrown.message);
  assert.match(output, /stole a stale dream lock/);
  assert.equal(commitCount(ctx.vault), before + 1);
});
