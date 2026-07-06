'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
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
      // Isolate HOME so the PATH shim sync writes (~/.local/bin/wienerdog, WP-042)
      // lands in the temp tree, never the developer's real ~/.local/bin. Detection
      // uses the config-dir overrides below, so overriding HOME is safe.
      HOME: root,
      WIENERDOG_HOME: core,
      WIENERDOG_VAULT: path.join(root, 'vault'),
      CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
      CODEX_HOME: path.join(root, 'absent-codex'),
      // Neutralize the real OS scheduler (WP-044 auto-schedules the dream on the
      // fresh-vault path): the default loader no-ops instead of spawning
      // launchctl/systemctl. Plist/timer files still land under the temp HOME.
      WIENERDOG_LOADER_NOOP: '1',
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
  assert.match(cfg, /update_check: true/);
});

test('init --yes defers the vault (vault: null, no vault dir, next-step output)', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0);
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.match(cfg, /^vault: null/m);
  assert.equal(fs.existsSync(env.WIENERDOG_VAULT), false, 'default vault dir must not be created');
  assert.match(r.stdout, /no vault yet/i);
  assert.match(r.stdout, /wienerdog-setup/);
});

test('init --fresh-vault --yes scaffolds the default vault as a git repo', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--fresh-vault', '--yes'], env);
  assert.equal(r.status, 0);
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.match(cfg, new RegExp(`^vault: ${env.WIENERDOG_VAULT}$`, 'm'));
  assert.ok(fs.statSync(env.WIENERDOG_VAULT).isDirectory(), 'vault dir should exist');
  const count = execFileSync('git', ['-C', env.WIENERDOG_VAULT, 'rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  assert.equal(count, '1', 'vault should be a git repo with exactly one commit');
});

test('init --fresh-vault schedules the nightly dream and surfaces it (ADR-0014)', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--fresh-vault', '--yes'], env);
  assert.equal(r.status, 0);
  // The summary surfaces dreaming — scheduled, or degraded on an unschedulable
  // platform; either way the user is told.
  assert.match(r.stdout, /dreaming/i);
  // The catch-up reassurance is surfaced alongside the schedule (WP-066): users
  // must never think they have to leave the machine on overnight. Both CI OSes
  // (macOS, ubuntu) support scheduling, so d.scheduled is true and this prints.
  assert.match(r.stdout, /catches up automatically/i);
  // The dream job definition landed in config regardless of platform support:
  // ensureDreamSchedule persists the job before registering the OS entry.
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.match(cfg, /wienerdog:jobs/);
  assert.match(cfg, /name: dream/);
  assert.match(cfg, /at: "03:30"/);
  assert.match(cfg, /run: builtin:dream/);
});

test('plain init (no vault) does NOT schedule a dream', () => {
  const { core, env } = tempEnv();
  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0);
  const cfg = fs.readFileSync(path.join(core, 'config.yaml'), 'utf8');
  assert.ok(!cfg.includes('wienerdog:jobs'), 'no jobs block without a vault');
  assert.doesNotMatch(r.stdout, /dreaming/i);
});

test('a second init --fresh-vault makes zero changes and says so', () => {
  const { core, env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  const before = snapshot(core);
  const r = run(['init', '--fresh-vault', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /already installed/i);
  assert.deepEqual(snapshot(core), before);
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

test('init without --yes proceeds on bare Enter (defaultYes wired)', () => {
  const { root, core, env } = tempEnv();
  const tty = path.join(root, 'answer');
  fs.writeFileSync(tty, '\n'); // empty answered line
  const r = spawnSync('node', [bin, 'init'], {
    env: { ...env, WIENERDOG_PROMPT_TTY: tty },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /Proceed\? \[Y\/n\]/); // label shown, on stderr in mode 2
  assert.doesNotMatch(r.stdout, /Aborted\./);
  assert.match(r.stdout, /core installed/); // it actually installed
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
});

test('init without --yes aborts on explicit n', () => {
  const { root, core, env } = tempEnv();
  const tty = path.join(root, 'answer');
  fs.writeFileSync(tty, 'n\n');
  const r = spawnSync('node', [bin, 'init'], {
    env: { ...env, WIENERDOG_PROMPT_TTY: tty },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(r.stdout, /Aborted\./);
  assert.ok(!fs.existsSync(path.join(core, 'config.yaml')));
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
