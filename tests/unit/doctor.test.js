'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Build an isolated temp HOME with env overrides that never touch real dirs. */
function tempEnv() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-doctor-'));
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

test('doctor after a plain init warns about the deferred vault and exits 0', () => {
  const { env } = tempEnv();
  run(['init', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[warn\]/);
  assert.match(r.stdout, /wienerdog-setup/);
  assert.doesNotMatch(r.stdout, /\[fail\]/);
});

test('doctor after init --fresh-vault reports the vault ready and exits 0', () => {
  const { env } = tempEnv();
  run(['init', '--fresh-vault', '--yes'], env);
  const r = run(['doctor'], env);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[ok\]/);
  assert.match(r.stdout, /vault ready/);
});

test('doctor with a set-but-missing vault fails and exits 1', () => {
  const { core, env } = tempEnv();
  run(['init', '--yes'], env);
  const configPath = path.join(core, 'config.yaml');
  const cfg = fs.readFileSync(configPath, 'utf8');
  fs.writeFileSync(configPath, cfg.replace(/^vault: null.*$/m, 'vault: /definitely/missing/dir'));
  const r = run(['doctor'], env);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[fail\].*vault/);
});
