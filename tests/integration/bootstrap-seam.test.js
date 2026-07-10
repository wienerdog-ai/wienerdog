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
 * Run wienerdog as a subprocess with a fully isolated env.
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

/** A fresh temp root; never touches the real $HOME, ~/.claude, ~/.codex or ~/.agents. */
function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-seam-'));
}

/** Every hook command string registered under an event in a settings/hooks file. */
function hookCommands(filePath, event) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return (parsed.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));
}

test('Claude present, plain init: skills + hooks registered, NO memory', () => {
  const root = tempRoot();
  const wd = path.join(root, 'wd');
  const claudeDir = path.join(root, 'claude');
  const env = {
    ...process.env,
    // Never touch the real OS scheduler: `init --fresh-vault` registers the
    // nightly dream via real launchd, whose label is per-user-global (NOT
    // HOME-scoped) — a temp-HOME run would still mutate the developer's real
    // agent (WP-071). Uniform across the init variants here.
    WIENERDOG_LOADER_NOOP: '1',
    HOME: root,
    WIENERDOG_HOME: wd,
    WIENERDOG_VAULT: path.join(root, 'vault'),
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  fs.mkdirSync(claudeDir, { recursive: true }); // Claude detected

  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0, r.stderr);

  const cfg = fs.readFileSync(path.join(wd, 'config.yaml'), 'utf8');
  assert.match(cfg, /^vault: null/m, 'vault deferred');
  assert.equal(fs.existsSync(env.WIENERDOG_VAULT), false, 'no vault dir');
  assert.equal(fs.existsSync(path.join(wd, 'state', 'digest.md')), false, 'no digest');
  assert.equal(fs.existsSync(path.join(claudeDir, 'CLAUDE.md')), false, 'no managed block');

  const startAbs = path.join(wd, 'bin', 'session-start.sh');
  assert.ok(
    hookCommands(path.join(claudeDir, 'settings.json'), 'SessionStart').includes(startAbs),
    'session-start.sh registered'
  );

  if (process.platform !== 'win32') {
    const link = path.join(claudeDir, 'skills', 'wienerdog-setup');
    assert.ok(fs.lstatSync(link).isSymbolicLink(), 'setup skill symlinked');
  }
});

test('Claude present, init --fresh-vault: everything incl. digest + managed block', () => {
  const root = tempRoot();
  const wd = path.join(root, 'wd');
  const vault = path.join(root, 'vault');
  const claudeDir = path.join(root, 'claude');
  const env = {
    ...process.env,
    // Never touch the real OS scheduler: `init --fresh-vault` registers the
    // nightly dream via real launchd, whose label is per-user-global (NOT
    // HOME-scoped) — a temp-HOME run would still mutate the developer's real
    // agent (WP-071). Uniform across the init variants here.
    WIENERDOG_LOADER_NOOP: '1',
    HOME: root,
    WIENERDOG_HOME: wd,
    WIENERDOG_VAULT: vault,
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: path.join(root, 'absent-codex'),
  };
  fs.mkdirSync(claudeDir, { recursive: true });

  const r = run(['init', '--fresh-vault', '--yes'], env);
  assert.equal(r.status, 0, r.stderr);

  assert.ok(fs.statSync(vault).isDirectory(), 'vault dir exists');
  const count = execFileSync('git', ['-C', vault, 'rev-list', '--count', 'HEAD'], {
    encoding: 'utf8',
  }).trim();
  assert.equal(count, '1', 'vault is a git repo with one commit');

  assert.ok(fs.existsSync(path.join(wd, 'state', 'digest.md')), 'digest rendered');
  const claudeMd = fs.readFileSync(path.join(claudeDir, 'CLAUDE.md'), 'utf8');
  assert.ok(claudeMd.includes('<!-- wienerdog:begin -->'), 'managed block written');

  const startAbs = path.join(wd, 'bin', 'session-start.sh');
  assert.ok(
    hookCommands(path.join(claudeDir, 'settings.json'), 'SessionStart').includes(startAbs),
    'session-start.sh registered'
  );
  if (process.platform !== 'win32') {
    const link = path.join(claudeDir, 'skills', 'wienerdog-setup');
    assert.ok(fs.lstatSync(link).isSymbolicLink(), 'setup skill symlinked');
  }
});

test('Codex present, plain init: skills + hooks under <CODEX_HOME>/skills, NO memory', () => {
  const root = tempRoot();
  const wd = path.join(root, 'wd');
  const codexDir = path.join(root, 'codex');
  const env = {
    ...process.env,
    // Never touch the real OS scheduler: `init --fresh-vault` registers the
    // nightly dream via real launchd, whose label is per-user-global (NOT
    // HOME-scoped) — a temp-HOME run would still mutate the developer's real
    // agent (WP-071). Uniform across the init variants here.
    WIENERDOG_LOADER_NOOP: '1',
    HOME: root,
    WIENERDOG_HOME: wd,
    WIENERDOG_VAULT: path.join(root, 'vault'),
    CODEX_HOME: codexDir,
    CLAUDE_CONFIG_DIR: path.join(root, 'absent-claude'),
  };
  fs.mkdirSync(codexDir, { recursive: true }); // Codex detected

  const r = run(['init', '--yes'], env);
  assert.equal(r.status, 0, r.stderr);

  assert.equal(fs.existsSync(env.WIENERDOG_VAULT), false, 'no vault dir');
  assert.equal(fs.existsSync(path.join(wd, 'state', 'digest.md')), false, 'no digest');
  assert.equal(fs.existsSync(path.join(codexDir, 'AGENTS.md')), false, 'no managed block');

  const startAbs = path.join(wd, 'bin', 'session-start.sh');
  assert.ok(
    hookCommands(path.join(codexDir, 'hooks.json'), 'SessionStart').includes(startAbs),
    'session-start.sh registered in hooks.json'
  );

  if (process.platform !== 'win32') {
    const link = path.join(codexDir, 'skills', 'wienerdog-setup');
    assert.ok(fs.lstatSync(link).isSymbolicLink(), 'setup skill symlinked under .agents');
  }
});
