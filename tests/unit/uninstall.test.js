'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Isolated temp HOME with env overrides (never touches real config dirs). */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-uninstall-'));
  const core = path.join(root, 'wd');
  return {
    root,
    core,
    env: {
      ...process.env,
      // Isolate HOME so the PATH shim (~/.local/bin/wienerdog, WP-042) is written
      // to — and removed from — the temp tree, never the developer's real
      // ~/.local/bin. Detection uses the config-dir overrides below.
      HOME: root,
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

/** Snapshot every file under dir as path -> "size:mtime". */
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

test('uninstall --dry-run lists manifest contents and changes nothing', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const before = snapshot(core);
  const r = run(['uninstall', '--dry-run'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /config\.yaml/);
  assert.match(r.stdout, /\[dir\]/);
  assert.match(r.stdout, /would be removed/);
  assert.ok(fs.existsSync(core));
  assert.deepEqual(snapshot(core), before);
});

test('uninstall --yes removes the entire core', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Removed/);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall --yes removes the PATH shim (WP-042)', () => {
  const { root, core, env } = tempEnv();
  run(['init', '--yes'], env);
  const shim = path.join(root, '.local', 'bin', 'wienerdog');
  assert.ok(fs.existsSync(shim), 'init wrote the ~/.local/bin/wienerdog shim');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(shim), false, 'uninstall removed the shim');
  assert.equal(fs.existsSync(core), false);
});

test('uninstall keeps a user-modified config.yaml', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.writeFileSync(path.join(core, 'config.yaml'), 'edited by the user\n');
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.ok(fs.existsSync(path.join(core, 'config.yaml')));
  assert.match(r.stdout, /Skipped/);
});

test('uninstall exits 0 when some entries were already gone', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  fs.rmSync(path.join(core, 'logs'), { recursive: true });
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(core), false);
});

test('uninstall without an install errors (exit 1)', () => {
  const { env } = tempEnv();
  const r = run(['uninstall', '--yes'], env);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /wienerdog: .*nothing to uninstall/);
});
