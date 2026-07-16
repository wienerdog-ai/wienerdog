'use strict';

// WP-108: half-sandbox guard — WIENERDOG_HOME redirects the core but a detected
// harness config dir is not co-redirected. Covers the pure `sandboxMismatchWarning`
// function across all branches (including physical-identity alias cases), the
// `init`/`sync` subprocess wiring (warn placement, no double-print, TEMPORARY
// wording), and the sync single-snapshot/isDir-revalidation race guarantees.

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const { sandboxMismatchWarning } = require('../../src/core/sandbox-guard');
const { getPaths } = require('../../src/core/paths');
const { detectHarnesses } = require('../../src/core/detect');
const manifestLib = require('../../src/core/manifest');
const syncMod = require('../../src/cli/sync');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/**
 * @param {{claude?: string|false, codex?: string|false}} o
 * @returns {{claude:{present:boolean,dir:string}, codex:{present:boolean,dir:string}}}
 */
function mkHarnesses({ claude = false, codex = false } = {}) {
  return {
    claude: claude === false ? { present: false, dir: '' } : { present: true, dir: claude },
    codex: codex === false ? { present: false, dir: '' } : { present: true, dir: codex },
  };
}

// ---------------------------------------------------------------------------
// Pure-function cases — no disk needed (fake, wholly non-existent paths).
// ---------------------------------------------------------------------------

test('sandbox-guard: WIENERDOG_HOME unset returns null', () => {
  const home = '/home/u';
  const result = sandboxMismatchWarning(
    { core: path.join(home, '.wienerdog') },
    { HOME: home },
    mkHarnesses({ claude: path.join(home, '.claude') })
  );
  assert.equal(result, null);
});

test('sandbox-guard: WIENERDOG_HOME set to the default core path returns null', () => {
  const home = '/home/u';
  const core = path.join(home, '.wienerdog');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, '.claude') })
  );
  assert.equal(result, null);
});

test('sandbox-guard: redirected core + Claude present at default + Codex absent warns', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, '.claude') })
  );
  assert.notEqual(result, null);
  assert.match(result, /WARNING/);
  assert.ok(result.includes(core), 'includes the core path');
  assert.match(result, /Claude Code/);
});

test('sandbox-guard: redirected core + Claude present at a non-default (co-redirected) dir returns null', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, 'sandbox', '.claude') })
  );
  assert.equal(result, null);
});

test('sandbox-guard: redirected core + Codex present at default warns and names Codex CLI', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ codex: path.join(home, '.codex') })
  );
  assert.notEqual(result, null);
  assert.match(result, /Codex CLI/);
});

test('sandbox-guard: redirected core + Codex present at a non-default (co-redirected) dir returns null', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ codex: path.join(home, 'sandbox', '.codex') })
  );
  assert.equal(result, null);
});

test('sandbox-guard: redirected core + both harnesses present at their defaults names both', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, '.claude'), codex: path.join(home, '.codex') })
  );
  assert.notEqual(result, null);
  assert.match(result, /Claude Code/);
  assert.match(result, /Codex CLI/);
});

test('sandbox-guard: a harness absent (present:false), even with its dir equal to the default, does not expose', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const harnesses = {
    claude: { present: false, dir: path.join(home, '.claude') },
    codex: { present: false, dir: path.join(home, '.codex') },
  };
  const result = sandboxMismatchWarning({ core }, { HOME: home, WIENERDOG_HOME: core }, harnesses);
  assert.equal(result, null);
});

test('sandbox-guard: Finding 4 — CLAUDE_CONFIG_DIR set to the default path does not suppress', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const claudeDefault = path.join(home, '.claude');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core, CLAUDE_CONFIG_DIR: claudeDefault },
    mkHarnesses({ claude: claudeDefault })
  );
  assert.notEqual(result, null);
  assert.match(result, /Claude Code/);
});

test('sandbox-guard: Finding 4 — CODEX_HOME set to the default path does not suppress', () => {
  const home = '/home/u';
  const core = path.join(home, 'sandbox', 'wd');
  const codexDefault = path.join(home, '.codex');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core, CODEX_HOME: codexDefault },
    mkHarnesses({ codex: codexDefault })
  );
  assert.notEqual(result, null);
  assert.match(result, /Codex CLI/);
});

test('sandbox-guard: a core under os.tmpdir() escalates wording to TEMPORARY', () => {
  const home = '/home/u';
  const core = path.join(os.tmpdir(), 'wd-sandbox-guard-fake-core');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, '.claude') })
  );
  assert.notEqual(result, null);
  assert.match(result, /TEMPORARY/);
});

test('sandbox-guard: a core at a normal non-temp path does not mention TEMPORARY', () => {
  const home = '/home/u';
  const core = '/opt/custom/wd';
  const result = sandboxMismatchWarning(
    { core },
    { HOME: home, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(home, '.claude') })
  );
  assert.notEqual(result, null);
  assert.doesNotMatch(result, /TEMPORARY/);
});

// ---------------------------------------------------------------------------
// Physical-identity (alias) cases — real dirs under a temp HOME.
// ---------------------------------------------------------------------------

test('sandbox-guard: a symlink alias of the real config dir warns (round-3 fix)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-alias-'));
  const realClaude = path.join(root, '.claude');
  fs.mkdirSync(realClaude, { recursive: true });
  const aliasClaude = path.join(root, 'claude-link');
  fs.symlinkSync(realClaude, aliasClaude);
  const core = path.join(root, 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: root, WIENERDOG_HOME: core },
    mkHarnesses({ claude: aliasClaude })
  );
  assert.notEqual(result, null);
  assert.match(result, /Claude Code/);
});

/** Probe filesystem case-sensitivity under a fresh temp dir (self-contained,
 * independent of any other test's root). @returns {boolean} */
function probeCaseInsensitiveFs() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-case-probe-'));
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true });
  return fs.existsSync(path.join(d, '.CLAUDE'));
}
const CASE_INSENSITIVE_FS = probeCaseInsensitiveFs();

test(
  'sandbox-guard: a case alias of the real config dir warns on a case-insensitive filesystem',
  { skip: CASE_INSENSITIVE_FS ? false : 'case-insensitive filesystem only' },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-case-'));
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const core = path.join(root, 'wd');
    const result = sandboxMismatchWarning(
      { core },
      { HOME: root, WIENERDOG_HOME: core },
      mkHarnesses({ claude: path.join(root, '.Claude') })
    );
    assert.notEqual(result, null);
    assert.match(result, /Claude Code/);
  }
);

test('sandbox-guard: a real, non-default, non-aliased config dir (co-redirected) does not false-warn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-inverse-'));
  const sandboxClaude = path.join(root, 'sandbox', '.claude');
  fs.mkdirSync(sandboxClaude, { recursive: true });
  const core = path.join(root, 'wd');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: root, WIENERDOG_HOME: core },
    mkHarnesses({ claude: sandboxClaude })
  );
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// Core-side alias cases (round-4) — the trigger must use physical identity too.
// ---------------------------------------------------------------------------

test('sandbox-guard: a symlinked WIENERDOG_HOME alias of ~/.wienerdog is recognized as the default', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-corealias-'));
  const realCore = path.join(root, '.wienerdog');
  fs.mkdirSync(realCore, { recursive: true });
  const aliasCore = path.join(root, 'wd-link');
  fs.symlinkSync(realCore, aliasCore);
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const result = sandboxMismatchWarning(
    { core: aliasCore },
    { HOME: root, WIENERDOG_HOME: aliasCore },
    mkHarnesses({ claude: path.join(root, '.claude') })
  );
  assert.equal(result, null);
});

test(
  'sandbox-guard: a differently-cased WIENERDOG_HOME of ~/.wienerdog is recognized as the default on a case-insensitive FS',
  { skip: CASE_INSENSITIVE_FS ? false : 'case-insensitive filesystem only' },
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-corecase-'));
    fs.mkdirSync(path.join(root, '.wienerdog'), { recursive: true });
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
    const core = path.join(root, '.WIENERDOG');
    const result = sandboxMismatchWarning(
      { core },
      { HOME: root, WIENERDOG_HOME: core },
      mkHarnesses({ claude: path.join(root, '.claude') })
    );
    assert.equal(result, null);
  }
);

test('sandbox-guard: a fresh (not-yet-created) core under a symlinked HOME does not false-warn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-symhome-'));
  const physHome = path.join(root, 'phys');
  fs.mkdirSync(physHome, { recursive: true });
  const linkHome = path.join(root, 'link');
  fs.symlinkSync(physHome, linkHome);
  fs.mkdirSync(path.join(physHome, '.claude'), { recursive: true });
  const core = path.join(physHome, '.wienerdog');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: linkHome, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(linkHome, '.claude') })
  );
  assert.equal(result, null);
});

test('sandbox-guard: an absent differently-cased WIENERDOG_HOME suffix WARNS (pins the no-fold behavior; round-6)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-nofold-'));
  // Do NOT create .wienerdog (default core absent).
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const core = path.join(root, '.WIENERDOG');
  const result = sandboxMismatchWarning(
    { core },
    { HOME: root, WIENERDOG_HOME: core },
    mkHarnesses({ claude: path.join(root, '.claude') })
  );
  assert.notEqual(result, null);
  assert.match(result, /Claude Code/);
});

// ---------------------------------------------------------------------------
// Integration (subprocess) — mirrors doctor.test.js's run(args, env).
// ---------------------------------------------------------------------------

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function run(args, env) {
  try {
    const stdout = execFileSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** Isolated temp HOME env for the half-sandbox subprocess cases: WIENERDOG_HOME
 * redirected, no CLAUDE_CONFIG_DIR/CODEX_HOME/WIENERDOG_CLAUDE_DIR overrides —
 * so the harness config dirs sit at their real default relative to the temp HOME.
 * @returns {{root: string, env: NodeJS.ProcessEnv}} */
function exposedEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-cli-'));
  fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
  const env = {
    ...process.env,
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    WIENERDOG_VAULT: path.join(root, 'vault'),
    WIENERDOG_LOADER_NOOP: '1',
  };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.CODEX_HOME;
  delete env.WIENERDOG_CLAUDE_DIR;
  return { root, env };
}

test('sandbox-guard: init --dry-run warns on a half-sandbox', () => {
  const { env } = exposedEnv();
  const r = run(['init', '--dry-run'], env);
  assert.match(r.stdout, /WIENERDOG_HOME points the core at/);
  assert.match(r.stdout, /Claude Code \(/);
});

test('sandbox-guard: init --dry-run is silent when co-redirected', () => {
  const { root, env } = exposedEnv();
  const claudeCfg = path.join(root, 'claude-cfg');
  const codexCfg = path.join(root, 'codex-cfg');
  fs.mkdirSync(claudeCfg, { recursive: true });
  fs.mkdirSync(codexCfg, { recursive: true });
  env.CLAUDE_CONFIG_DIR = claudeCfg;
  env.CODEX_HOME = codexCfg;
  const r = run(['init', '--dry-run'], env);
  assert.doesNotMatch(r.stdout, /WIENERDOG_HOME points the core/);
});

test('sandbox-guard: sync warns on a half-sandbox (standalone-sync wiring)', () => {
  const { env } = exposedEnv();
  run(['init', '--yes'], env);
  const r = run(['sync'], env);
  assert.match(r.stdout, /WIENERDOG_HOME points the core at/);
  assert.match(r.stdout, /Claude Code \(/);
});

test('sandbox-guard: init --yes prints the warning exactly once (Finding 5)', () => {
  const { env } = exposedEnv();
  const r = run(['init', '--yes'], env);
  assert.equal(r.stdout.split('WIENERDOG_HOME points the core at').length - 1, 1);
});

test('sandbox-guard: an env var set to the default path still warns (Finding 4, subprocess)', () => {
  const { root, env } = exposedEnv();
  env.CLAUDE_CONFIG_DIR = path.join(root, '.claude');
  const r = run(['init', '--dry-run'], env);
  assert.match(r.stdout, /WIENERDOG_HOME points the core at/);
  assert.match(r.stdout, /Claude Code \(/);
});

// ---------------------------------------------------------------------------
// Snapshot-consistency (rounds 7-8) — in-process sync.run with an injected
// snapshot. Mirrors the hermetic sync harness from tests/unit/sync-repoint.test.js.
// ---------------------------------------------------------------------------

/** @param {string} c @returns {string} */
function sha256(c) {
  return crypto.createHash('sha256').update(c).digest('hex');
}

// Vault UNSET → sync skips the digest + managed block but still stages skills
// and applies adapters.
const BASE_CONFIG = `# Wienerdog configuration
version: 1
vault:
harnesses:
  claude: true
  codex: false
memory_mode: standard
`;

/** Build an isolated temp core with config + matching manifest. @returns {{root:string, paths: import('../../src/core/paths').WienerdogPaths}} */
function setupHermeticCore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-sbx-snap-'));
  const paths = getPaths({ HOME: root, WIENERDOG_HOME: path.join(root, 'wd') });
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
  return { root, paths };
}

/** No-op scheduler loader (WIENERDOG_LOADER_NOOP='1' already neutralizes real
 * loader spawns; passed for parity with the spec's injected-opts contract). */
function noopLoader() {
  return { status: 0 };
}

/**
 * Point process.env at a hermetic core (round-8 Finding 1: CLAUDE_CONFIG_DIR
 * must resolve to `claudeDir`, not an absent path, and WIENERDOG_CLAUDE_DIR
 * must be cleared, or getPaths() prefers the stale absent override). Restores
 * the previous values in `finally`.
 * @param {string} root
 * @param {string} claudeDir
 * @param {string} codexDir
 * @param {() => Promise<void>} fn
 */
async function withHermeticEnv(root, claudeDir, codexDir, fn) {
  const savedKeys = ['HOME', 'WIENERDOG_HOME', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'WIENERDOG_CLAUDE_DIR', 'WIENERDOG_LOADER_NOOP'];
  const saved = Object.fromEntries(savedKeys.map((k) => [k, process.env[k]]));
  process.env.HOME = root;
  process.env.WIENERDOG_HOME = path.join(root, 'wd');
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
  delete process.env.WIENERDOG_CLAUDE_DIR;
  process.env.CODEX_HOME = codexDir;
  process.env.WIENERDOG_LOADER_NOOP = '1';
  const origLog = console.log;
  const origWrite = process.stdout.write.bind(process.stdout);
  try {
    await fn();
  } finally {
    console.log = origLog;
    process.stdout.write = origWrite;
    for (const k of savedKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('sandbox-guard: (a) upper bound — present:false snapshot skips even when a fresh detect would be present', async () => {
  const { root } = setupHermeticCore();
  const claudeDir = path.join(root, '.claude');
  const codexDir = path.join(root, '.codex');
  fs.mkdirSync(claudeDir, { recursive: true });

  await withHermeticEnv(root, claudeDir, codexDir, async () => {
    assert.equal(detectHarnesses(process.env).claude.present, true, 'fresh detect sees the dir');

    console.log = () => {};
    process.stdout.write = () => true;

    await syncMod.run(['sync'], {
      loader: noopLoader,
      interactive: false,
      suppressSandboxWarning: true,
      harnesses: {
        claude: { present: false, dir: claudeDir },
        codex: { present: false, dir: codexDir },
      },
    });
  });

  assert.equal(fs.existsSync(path.join(claudeDir, 'settings.json')), false);
  assert.equal(fs.existsSync(path.join(claudeDir, 'skills')), false);
});

test('sandbox-guard: (b) revalidation — present:true snapshot with the dir gone succeeds without writing', async () => {
  const { root } = setupHermeticCore();
  const claudeDir = path.join(root, '.claude'); // never created
  const codexDir = path.join(root, '.codex');

  await withHermeticEnv(root, claudeDir, codexDir, async () => {
    console.log = () => {};
    process.stdout.write = () => true;

    await assert.doesNotReject(() =>
      syncMod.run(['sync'], {
        loader: noopLoader,
        interactive: false,
        suppressSandboxWarning: true,
        harnesses: {
          claude: { present: true, dir: claudeDir },
          codex: { present: false, dir: codexDir },
        },
      })
    );
  });

  assert.equal(fs.existsSync(claudeDir), false, 'not recreated');
  assert.equal(fs.existsSync(path.join(claudeDir, 'settings.json')), false);
});

test('sandbox-guard: (c) intersection — present:true with the dir there runs the adapter', async () => {
  const { root } = setupHermeticCore();
  const claudeDir = path.join(root, '.claude');
  const codexDir = path.join(root, '.codex');
  fs.mkdirSync(claudeDir, { recursive: true });

  await withHermeticEnv(root, claudeDir, codexDir, async () => {
    console.log = () => {};
    process.stdout.write = () => true;

    await syncMod.run(['sync'], {
      loader: noopLoader,
      interactive: false,
      suppressSandboxWarning: true,
      harnesses: {
        claude: { present: true, dir: claudeDir },
        codex: { present: false, dir: codexDir },
      },
    });
  });

  assert.equal(fs.existsSync(path.join(claudeDir, 'settings.json')), true);
});
