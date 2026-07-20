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
// WP-155: the WIENERDOG_FAKE_TODAY env seam is deleted from production; inject
// the clock via dream.run's JS-only opts.now (local noon → resolveDate yields
// DATE in any timezone). The env var is still set for the fake-brain FIXTURE.
const [DY, DM, DD] = DATE.split('-').map(Number);
const NOW = new Date(DY, DM - 1, DD, 12, 0, 0);

const ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_FAKE_TODAY',
  'WIENERDOG_LOADER_NOOP',
  'PATH', // the fake claude's ~/.local/bin dir is prepended (WP-155)
];

/** A `#!/bin/sh` executable named `name` in `dir` (mode 0700 dir, 0755 file). */
function writeShExec(dir, name, body = 'exit 0') {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(p, 0o755);
  return p;
}

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

    // 1b. WP-155: the env seam is gone — install the fake brain LEGITIMATELY at
    //     <home>/.local/bin/claude, the dir the job clean PATH front-loads, so
    //     sync's createPins (WP-154) pins it. The same dir is prepended to
    //     process.env.PATH so the in-process dream's resolvePinnedSpawn (which
    //     resolves on process.env.PATH) hits the SAME command path — pin-time
    //     and spawn-time resolution must agree or the dream fails safe.
    const localBin = path.join(home, '.local', 'bin');
    fs.mkdirSync(localBin, { recursive: true });
    fs.copyFileSync(FAKE_BRAIN, path.join(localBin, 'claude'));
    fs.chmodSync(path.join(localBin, 'claude'), 0o755);

    // 2. Apply env.
    Object.assign(process.env, {
      HOME: home,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: defaultVault,
      CLAUDE_CONFIG_DIR: claude,
      CODEX_HOME: codex,
      WIENERDOG_FAKE_TODAY: DATE,
      PATH: localBin + path.delimiter + process.env.PATH,
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

    // 6. dream → writes through the mapped tiers, exactly one new commit. The
    //    brain is the PINNED fake claude (sync pinned it above); the probe is
    //    skipped via the JS-only opts seam (a fake brain cannot satisfy it).
    const before = commitCount(adopted);
    await dream.run(['--yes'], { skipContainmentProbe: true, now: NOW });
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
  'adopt-e2e: adopting over an ALREADY-scheduled dream rebinds the per-job digest + catch-up map to the ADOPTED vault (no follow-up sync) — A7 hardening fix #3',
  { skip: process.platform === 'win32' && 'the fake sh brain is POSIX-only' },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-rebind-'));
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
      fs.cpSync(POWERUSER_FIXTURE, adopted, { recursive: true });
      const adoptedReal = fs.realpathSync(adopted);
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(core, { recursive: true });
      const localBin = path.join(home, '.local', 'bin');
      fs.mkdirSync(localBin, { recursive: true });
      fs.copyFileSync(FAKE_BRAIN, path.join(localBin, 'claude'));
      fs.chmodSync(path.join(localBin, 'claude'), 0o755);

      Object.assign(process.env, {
        HOME: home,
        WIENERDOG_HOME: core,
        WIENERDOG_VAULT: defaultVault,
        CLAUDE_CONFIG_DIR: claude,
        CODEX_HOME: codex,
        PATH: localBin + path.delimiter + process.env.PATH,
        // Neutralize the real OS scheduler; the ENTRY FILES are still written with
        // the bound digest/map, which is what we assert.
        WIENERDOG_LOADER_NOOP: '1',
      });
      delete process.env.WIENERDOG_FAKE_TODAY;

      const { getPaths } = require('../../src/core/paths');
      const gen = require('../../src/scheduler/generators');
      const jobsLib = require('../../src/scheduler/jobs');
      const descriptorMod = require('../../src/scheduler/descriptor');
      const paths = getPaths(process.env);

      // init --fresh-vault schedules the nightly dream (against the DEFAULT vault) —
      // so when adopt runs, a dream JOB ALREADY exists (the pre-existing-job path
      // that ensureDreamSchedule no-ops on). Without the fix, adopt's
      // ensureDreamSchedule no-ops and NEVER re-derives/writes the descriptor bound
      // to the adopted vault (it would refuse fire-closed until a separate `sync`).
      await init.run(['--yes', '--fresh-vault']);
      assert.ok(jobsLib.findJob(paths, 'dream'), 'precondition: dream job already scheduled by init');

      // adopt the power-user vault — WITHOUT any follow-up `sync`.
      await adopt.run([adopted, '--yes']);

      // The descriptor is re-derived + re-registered to the ADOPTED vault via
      // repointSchedules (the fix) — not the create-only ensureDreamSchedule that
      // no-ops on the pre-existing job. Without the fix this file is absent.
      const descPath = descriptorMod.descriptorPath(paths, 'dream');
      const postDesc = JSON.parse(fs.readFileSync(descPath, 'utf8'));
      assert.equal(postDesc.vaultRoot, adoptedReal, 'descriptor rebound to the adopted vault after adopt (no sync)');

      // The LOADED per-job digest (bound into the OS entry) reflects the adopted vault.
      const adoptedJob = jobsLib.findJob(paths, 'dream');
      const adoptedDigest = descriptorMod.deriveDescriptorDigest(paths, adoptedJob, { platform: process.platform });
      const readEntry = (p) => {
        const buf = fs.readFileSync(p);
        return buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString('utf16le') : buf.toString('utf8');
      };
      let perJobEntry;
      let catchupEntry = null;
      if (process.platform === 'darwin') {
        perJobEntry = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.dream.plist');
        catchupEntry = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');
      } else {
        // linux: the systemd .service carries --expect-digest; no separate catch-up map.
        perJobEntry = path.join(gen.systemdUserDir(paths.home, process.env), 'wienerdog-dream.service');
      }
      const perJobText = readEntry(perJobEntry);
      assert.ok(perJobText.includes(adoptedDigest), 'the per-job OS entry binds the ADOPTED-vault expect-digest');

      if (catchupEntry) {
        const catchupText = readEntry(catchupEntry);
        const m = catchupText.match(/--job-digests[\s\S]*?([A-Za-z0-9_-]{16,})/);
        assert.ok(m, 'the catch-up entry binds a --job-digests map');
        const decoded = gen.decodeJobDigests(m[1]);
        assert.equal(decoded.ok, true, 'the bound catch-up map decodes');
        assert.equal(decoded.map.dream, adoptedDigest, 'the catch-up map authorizes the ADOPTED-vault dream digest');
      }
    } finally {
      console.log = origLog;
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

test(
  'adopt-e2e: a FAILED existing-schedule rebind is SURFACED (not silent success) + entries still bind the adopted vault, and a subsequent sync-heal RETRIES the reload — A7 hardening 2 fix #2',
  { skip: process.platform === 'win32' && 'the fake sh brain is POSIX-only' },
  async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-rebindfail-'));
    const adopted = path.join(root, 'adopted');
    const home = path.join(root, 'home');
    const core = path.join(root, 'core');
    const defaultVault = path.join(root, 'default-vault');
    const claude = path.join(root, 'claude');
    const codex = path.join(root, 'codex-absent');

    const saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    const origLog = console.log;
    /** @type {string[]} */ const logs = [];

    try {
      fs.cpSync(POWERUSER_FIXTURE, adopted, { recursive: true });
      const adoptedReal = fs.realpathSync(adopted);
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(core, { recursive: true });
      const localBin = path.join(home, '.local', 'bin');
      fs.mkdirSync(localBin, { recursive: true });
      fs.copyFileSync(FAKE_BRAIN, path.join(localBin, 'claude'));
      fs.chmodSync(path.join(localBin, 'claude'), 0o755);

      Object.assign(process.env, {
        HOME: home,
        WIENERDOG_HOME: core,
        WIENERDOG_VAULT: defaultVault,
        CLAUDE_CONFIG_DIR: claude,
        CODEX_HOME: codex,
        PATH: localBin + path.delimiter + process.env.PATH,
        // init's own scheduling loads cleanly under NOOP; the adopt rebind below is
        // driven by an INJECTED loader (opts.loader), so NOOP does not mask it.
        WIENERDOG_LOADER_NOOP: '1',
      });
      delete process.env.WIENERDOG_FAKE_TODAY;

      const { getPaths } = require('../../src/core/paths');
      const gen = require('../../src/scheduler/generators');
      const jobsLib = require('../../src/scheduler/jobs');
      const descriptorMod = require('../../src/scheduler/descriptor');
      const status = require('../../src/scheduler/status');
      const paths = getPaths(process.env);

      // init schedules the nightly dream against the DEFAULT vault (dream job now exists).
      console.log = () => {};
      await init.run(['--yes', '--fresh-vault']);
      assert.ok(jobsLib.findJob(paths, 'dream'), 'precondition: dream job scheduled by init');

      // adopt with an injected scheduler loader that FAILS every reload (status 1).
      logs.length = 0;
      console.log = (...a) => logs.push(a.join(' '));
      await adopt.run([adopted, '--yes'], { loader: () => ({ status: 1 }) });
      console.log = origLog;
      const out = logs.join('\n');

      // (a) The rebind failure is SURFACED loudly with the `wienerdog sync`
      //     remediation — NOT swallowed as unqualified success. Mutation: revert
      //     adopt to discard the repointSchedules result → no WARNING → this fails.
      assert.match(out, /WARNING: your already-scheduled jobs could not be fully re-activated/, out);
      assert.match(out, /wienerdog sync/, 'the remediation names `wienerdog sync`');

      // (b) The canonical entries were STILL rewritten to the adopted vault (idempotency
      //     will not suppress a later retry): the loaded per-job digest + catch-up map
      //     reflect the ADOPTED vault, so `sync` only needs to reload.
      const adoptedJob = jobsLib.findJob(paths, 'dream');
      const adoptedDigest = descriptorMod.deriveDescriptorDigest(paths, adoptedJob, { platform: process.platform });
      const descPath = descriptorMod.descriptorPath(paths, 'dream');
      assert.equal(JSON.parse(fs.readFileSync(descPath, 'utf8')).vaultRoot, adoptedReal, 'descriptor rebound to the adopted vault');

      const readEntry = (p) => {
        const buf = fs.readFileSync(p);
        return buf[0] === 0xff && buf[1] === 0xfe ? buf.slice(2).toString('utf16le') : buf.toString('utf8');
      };
      let perJobEntry;
      let catchupEntry = null;
      if (process.platform === 'darwin') {
        perJobEntry = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.dream.plist');
        catchupEntry = path.join(gen.launchAgentsDir(paths.home), 'ai.wienerdog.catchup.plist');
      } else {
        perJobEntry = path.join(gen.systemdUserDir(paths.home, process.env), 'wienerdog-dream.service');
      }
      assert.ok(readEntry(perJobEntry).includes(adoptedDigest), 'per-job entry binds the ADOPTED-vault digest even though the reload failed');
      if (catchupEntry) {
        const m = readEntry(catchupEntry).match(/--job-digests[\s\S]*?([A-Za-z0-9_-]{16,})/);
        assert.ok(m && gen.decodeJobDigests(m[1]).map.dream === adoptedDigest, 'catch-up map binds the ADOPTED-vault dream digest');
      }

      // (c) A subsequent invocation RETRIES the rebind: sync's heal reloads the entry
      //     the OS did not accept (probe reports it missing) — idempotency does not
      //     suppress it. The reload targets the ADOPTED-vault entry.
      /** @type {string[][]} */ const retryCalls = [];
      const heal = status.reloadMissing(paths, {
        loader: (a) => { retryCalls.push(a); return { status: 0 }; },
        probe: () => 'missing',
        platform: process.platform,
      });
      assert.deepEqual(heal.reloaded, ['dream'], 'the subsequent sync-heal reloaded the dream (retry, not suppressed)');
      assert.ok(retryCalls.length >= 1, 'the retry actually issued an OS reload');
      assert.ok(readEntry(perJobEntry).includes(adoptedDigest), 'the reloaded entry still binds the ADOPTED-vault digest');
    } finally {
      console.log = origLog;
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
);

test(
  'adopt-e2e: A5 pin preflight — claude unresolvable ⇒ adopt ABORTS before any mutation (vault/config/manifest/pin-store byte-identical)',
  { skip: process.platform === 'win32' && 'the fake sh exec is POSIX-only' },
  async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-adopt-preflight-'));
    const home = path.join(base, 'home');
    const core = path.join(base, 'core');
    const vault = path.join(base, 'vault');
    // A PATH with git but NO claude — the dry preflight must fail closed on claude.
    const gitbin = path.join(base, 'gitbin');

    const saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    const origLog = console.log;
    console.log = () => {};

    try {
      fs.mkdirSync(home, { recursive: true });
      fs.mkdirSync(core, { recursive: true });
      fs.mkdirSync(vault, { recursive: true });
      fs.writeFileSync(path.join(vault, 'note.md'), '# note\n');
      writeShExec(gitbin, 'git', 'echo "git version 2.0.0"'); // resolvable git, no claude

      const configPath = path.join(core, 'config.yaml');
      const configBefore = 'version: 1\nvault: null\nmemory_mode: standard\n';
      fs.writeFileSync(configPath, configBefore);
      const manifestPath = path.join(core, 'install-manifest.json');
      const manifestBefore = JSON.stringify({
        version: 1,
        createdAt: 'x',
        entries: [{ kind: 'file', path: configPath, hash: 'x' }],
      });
      fs.writeFileSync(manifestPath, manifestBefore);

      Object.assign(process.env, { HOME: home, WIENERDOG_HOME: core, PATH: gitbin });
      for (const k of ['WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME']) delete process.env[k];

      await assert.rejects(() => adopt.run([vault, '--yes']), /needs a working claude/);

      // Fail-closed: NOTHING mutated (transactional abort before the first write).
      assert.equal(fs.readFileSync(configPath, 'utf8'), configBefore, 'config byte-identical');
      assert.equal(fs.readFileSync(manifestPath, 'utf8'), manifestBefore, 'manifest byte-identical');
      assert.equal(fs.existsSync(path.join(core, 'state', 'exec-pins.json')), false, 'no pin store written');
      assert.deepEqual(fs.readdirSync(vault).sort(), ['note.md'], 'vault dir untouched');
      assert.equal(fs.existsSync(path.join(vault, '.git')), false, 'no git snapshot taken');
    } finally {
      console.log = origLog;
      for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
      fs.rmSync(base, { recursive: true, force: true });
    }
  }
);

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
