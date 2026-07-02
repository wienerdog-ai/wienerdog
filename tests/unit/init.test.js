'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/**
 * Build an isolated temp HOME with env overrides that never touch the real
 * ~/.wienerdog, ~/.claude or ~/.codex. Claude/Codex dirs point at absent paths
 * so detection is deterministically false unless a test creates them.
 */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-init-'));
  const core = path.join(root, 'wd');
  return {
    root,
    core,
    env: {
      ...process.env,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: path.join(root, 'vault'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
    },
  };
}

/**
 * @param {string[]} args
 * @param {NodeJS.ProcessEnv} env
 * @returns {{status: number, stdout: string, stderr: string}}
 */
function run(args, env) {
  try {
    const stdout = execFileSync('node', [bin, ...args], { env, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    return { status: err.status, stdout: err.stdout || '', stderr: err.stderr || '' };
  }
}

/** Snapshot every file under dir as path -> "size:mtime" for change detection. */
function snapshot(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const s = fs.statSync(full);
        out[full] = `${s.size}:${s.mtimeMs}`;
      }
    }
  };
  walk(dir);
  return out;
}

test('init --yes creates the core, config, and manifest', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
  assert.ok(fs.existsSync(path.join(core, 'install-manifest.json')));
  for (const d of ['state', 'secrets', 'logs']) {
    assert.ok(fs.statSync(path.join(core, d)).isDirectory(), `${d} should exist`);
  }
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.match(cfg, /^version: 1$/m);
  assert.match(cfg, /claude: false/);
  assert.match(cfg, /codex: false/);
  assert.match(cfg, /memory_mode: standard/);
});

test('secrets directory is created with mode 0700', { skip: process.platform === 'win32' }, () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const mode = fs.statSync(path.join(core, 'secrets')).mode & 0o777;
  assert.equal(mode, 0o700);
});

test('a second init makes zero changes and says so', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const before = snapshot(core);
  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already installed/i);
  assert.deepEqual(snapshot(core), before);
});

test('init --dry-run creates nothing', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--dry-run'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /no changes made/i);
  assert.equal(fs.existsSync(core), false);
});

test('init reflects a detected Claude harness in config', () => {
  const { core, env } = tempEnv();
  fs.mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
  run(['init', '--yes'], env);
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.match(cfg, /claude: true/);
  assert.match(cfg, /codex: false/);
});

test('an unknown command prints usage and exits 2', () => {
  const { env } = tempEnv();
  const r = run(['bogus-command'], env);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Usage:/);
});

test('help prints usage and exits 0', () => {
  const { env } = tempEnv();
  const r = run(['--help'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage:/);
});
