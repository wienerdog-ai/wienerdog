'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const init = require('../../src/cli/init');
const adopt = require('../../src/cli/adopt');
const sync = require('../../src/cli/sync');
const dream = require('../../src/cli/dream');
const { readVaultLayout } = require('../../src/core/layout');

const POWERUSER_FIXTURE = path.resolve(__dirname, '../fixtures/poweruser-vault');
const FAKE_BRAIN = path.resolve(__dirname, '../fixtures/adopt/fake-brain-mapped.js');
const INJ_FIXTURE = path.resolve(__dirname, '../fixtures/dream/transcripts/claude-injection.jsonl');
const DATE = '2026-07-03';

const ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY',
  'WIENERDOG_DREAM_CMD',
  'WIENERDOG_LOADER_NOOP',
];

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync(
    'git',
    ['-C', cwd, '-c', 'user.name=wienerdog-test', '-c', 'user.email=test@localhost', ...args],
    { encoding: 'utf8' }
  );
}

/** @param {string} vault @returns {number} number of commits on HEAD. */
function commitCount(vault) {
  return Number(git(vault, ['rev-list', '--count', 'HEAD']).trim());
}

test('adopt-e2e: init → adopt → sync → dream through mapped tiers, one revertable commit', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-e2e-'));
  const adopted = path.join(root, 'adopted');
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const defaultVault = path.join(root, 'default-vault');
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex-absent');

  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];

  const origLog = console.log;
  console.log = () => {};

  try {
    // 1. Copy the (non-git) power-user vault to a temp dir we will adopt.
    fs.cpSync(POWERUSER_FIXTURE, adopted, { recursive: true });
    // adopt realpath-resolves the path (macOS /var → /private/var); config stores that form.
    const adoptedReal = fs.realpathSync(adopted);
    fs.mkdirSync(home, { recursive: true });
    fs.mkdirSync(core, { recursive: true });
    // A transcript so the dream pipeline has input (the fake brain ignores it).
    const projDir = path.join(claude, 'projects', 'proj');
    fs.mkdirSync(projDir, { recursive: true });
    fs.copyFileSync(INJ_FIXTURE, path.join(projDir, 'inj.jsonl'));

    // 2. Apply env.
    Object.assign(process.env, {
      HOME: home,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: defaultVault,
      CLAUDE_CONFIG_DIR: claude,
      CODEX_HOME: codex,
      WIENERDOG_FAKE_TODAY: DATE,
      WIENERDOG_DREAM_CMD: FAKE_BRAIN,
      // WP-044: adopt now auto-schedules the nightly dream. Neutralize the real
      // OS scheduler so this test never spawns launchctl/systemctl (HOME is temp).
      WIENERDOG_LOADER_NOOP: '1',
    });

    const configPath = path.join(core, 'config.yaml');

    // 3. init → default vault + config.
    await init.run(['--yes']);
    assert.ok(fs.existsSync(configPath), 'config.yaml written by init');

    // 3a. Seed a pre-existing .gitignore with one custom line + one default line,
    //     to prove adopt appends (never overwrites) and skips the already-present default.
    const gitignorePath = path.join(adopted, '.gitignore');
    fs.writeFileSync(gitignorePath, 'my-secret-notes/\n.DS_Store\n');

    // 4. adopt the power-user vault.
    await adopt.run([adopted, '--yes']);

    // 4-gitignore. The starter .gitignore offer ran under --yes: all five defaults
    //     present, the custom line preserved, and .DS_Store not duplicated.
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');
    for (const l of [
      '.obsidian/plugins/*/bin/',
      '.smart-env/',
      '.obsidian/workspace*',
      '.DS_Store',
      '.trash/',
    ]) {
      assert.ok(gitignore.includes(l), `.gitignore contains default line ${l}`);
    }
    assert.ok(gitignore.includes('my-secret-notes/'), 'custom .gitignore line survives (append-not-overwrite)');
    assert.equal(gitignore.match(/\.DS_Store/g).length, 1, 'already-present default not duplicated');

    // 4a. The adopted dir is now a git repo with ≥1 commit.
    assert.ok(fs.existsSync(path.join(adopted, '.git')), 'adopted dir is a git repo');
    assert.ok(commitCount(adopted) >= 1, 'adopted dir has an initial commit');

    // 4b. Config points at the adopted vault, with the nested layout + conservative mode.
    const cfg = fs.readFileSync(configPath, 'utf8');
    assert.match(cfg, new RegExp(`^vault: ${adoptedReal}$`, 'm'));
    assert.match(cfg, /^memory_mode: conservative\b/m);
    const layout = readVaultLayout(configPath);
    assert.equal(layout.daily_dir, '05-Daily');
    assert.equal(layout.daily_filename, 'YYYY/MM/YYYY-MM-DD.md');
    assert.equal(layout.identity_dir, '06-Identity');

    // 4c. Manifest config hash resynced (no spurious "modified since install").
    const manifest = JSON.parse(fs.readFileSync(path.join(core, 'install-manifest.json'), 'utf8'));
    const cfgEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === configPath);
    const crypto = require('node:crypto');
    assert.equal(cfgEntry.hash, crypto.createHash('sha256').update(cfg).digest('hex'));

    // 4d. The user's own identity notes were NOT overwritten and no stubs seeded
    //     (identity dir already had notes).
    assert.match(fs.readFileSync(path.join(adopted, '06-Identity/profile.md'), 'utf8'), /Priya Nair/);

    // 4e. WP-044: adopt auto-scheduled the nightly dream. The job definition
    //     landed in config regardless of whether this platform can register an OS
    //     entry (ensureDreamSchedule persists the job before it registers), so the
    //     run completed without failing vault adoption either way.
    assert.match(cfg, /wienerdog:jobs/, 'adopt wrote the managed jobs block');
    assert.match(cfg, /name: dream/, 'adopt scheduled the nightly dream');
    assert.match(cfg, /at: "03:30"/, 'dream scheduled at 03:30');

    // 5. sync → digest rendered from the REAL identity notes. A0 pre-use freeze
    //    (WP-109/WP-112): daily-summary-injection is blocked in production — sync
    //    calls renderDigest with no profile, so the nested daily Summary is NOT
    //    injected even though it exists in the adopted vault.
    await sync.run([]);
    const digest = fs.readFileSync(path.join(core, 'state', 'digest.md'), 'utf8');
    assert.match(digest, /Priya Nair/, 'digest reflects the real identity profile');
    assert.doesNotMatch(
      digest,
      /Interviewed two coastal-town planners/,
      'nested daily Summary is NOT injected under the frozen default'
    );

    // 6. dream → writes through the mapped tiers, exactly one new commit.
    const before = commitCount(adopted);
    await dream.run(['--yes']);
    assert.equal(commitCount(adopted), before + 1, 'exactly one dream commit');

    const tracked = git(adopted, ['ls-files']);
    assert.ok(tracked.includes('06-Identity/adopted-fact.md'), 'mapped Tier-3 identity note committed');
    assert.ok(tracked.includes('05-Daily/2026/07/2026-07-03.md'), 'mapped Tier-1 nested daily committed');
    assert.ok(fs.existsSync(path.join(adopted, 'reports/dreams', `${DATE}.md`)), 'mapped report exists');

    // 7. git revert cleanly undoes the whole dream run.
    const sha = git(adopted, ['rev-parse', 'HEAD']).trim();
    git(adopted, ['revert', '--no-edit', sha]);
    assert.equal(fs.existsSync(path.join(adopted, '06-Identity/adopted-fact.md')), false);
    assert.equal(fs.existsSync(path.join(adopted, '05-Daily/2026/07/2026-07-03.md')), false);
    assert.equal(git(adopted, ['status', '--porcelain']).trim(), '', 'working tree clean after revert');
  } finally {
    console.log = origLog;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  'adopt-e2e: symlinked home — TCC guard refuses a Documents vault with zero writes',
  { skip: process.platform !== 'darwin' && 'TCC is macOS-only' },
  async () => {
    // macOS /tmp is a symlink to /private/tmp: a HOME under /tmp is in a
    // different symlink domain than the realpath'd adopted path, which is
    // exactly the asymmetry that made the guard fail OPEN (PR #26 review).
    const base = path.join('/tmp', `wd-adopt-tcc-${process.pid}-${Date.now()}`);
    const home = path.join(base, 'home'); // raw, symlinked-domain HOME
    const core = path.join(base, 'core');
    const vault = path.join(home, 'Documents', 'myvault');

    const saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];

    try {
      fs.mkdirSync(vault, { recursive: true });
      fs.mkdirSync(core, { recursive: true });
      fs.writeFileSync(path.join(vault, 'note.md'), '# my note\n');
      const configPath = path.join(core, 'config.yaml');
      const configBefore = 'version: 1\nvault: null\nmemory_mode: standard  # conservative | standard | eager\n';
      fs.writeFileSync(configPath, configBefore);
      fs.writeFileSync(
        path.join(core, 'install-manifest.json'),
        JSON.stringify({ version: 1, createdAt: 'x', entries: [{ kind: 'file', path: configPath, hash: 'x' }] })
      );

      Object.assign(process.env, { HOME: home, WIENERDOG_HOME: core });
      for (const k of ['WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete process.env[k];

      await assert.rejects(
        () => adopt.run([vault, '--yes']),
        /macOS-protected location/,
        'adopt must refuse a Documents vault even under a symlinked home'
      );

      // Zero writes: config untouched, vault untouched (no git init, no scaffold).
      assert.equal(fs.readFileSync(configPath, 'utf8'), configBefore, 'config unchanged');
      assert.deepEqual(fs.readdirSync(vault).sort(), ['note.md'], 'vault dir unchanged');
      assert.equal(fs.existsSync(path.join(vault, '.git')), false, 'no git init');
    } finally {
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
);
