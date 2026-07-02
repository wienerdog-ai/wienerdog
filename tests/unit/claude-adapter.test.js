'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { getPaths } = require('../../src/core/paths');
const { applyClaudeAdapter } = require('../../src/adapters/claude');
const manifestLib = require('../../src/core/manifest');

const FIXED_DIGEST = ['# Who you\'re working with', 'Ada Kovács — product lead.', '', '## Standing instructions', 'Be concise.', ''].join('\n');

const GOLDEN = path.join(__dirname, '..', 'golden', 'claude-adapter', 'CLAUDE.md');

/**
 * Fresh temp core + claude dir, with the fixed digest already written to
 * <state>/digest.md. Never touches the real $HOME or ~/.claude.
 * @returns {import('../../src/core/paths').WienerdogPaths}
 */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-claude-'));
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CLAUDE_CONFIG_DIR: path.join(root, 'claude'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.claudeDir, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), FIXED_DIGEST);
  return paths;
}

/** @param {import('../../src/core/paths').WienerdogPaths} paths */
function freshManifest() {
  return { version: 1, createdAt: new Date().toISOString(), entries: [] };
}

test('managed block, new file: matches the golden byte-for-byte', () => {
  const paths = setup();
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  applyClaudeAdapter(paths, { manifest: freshManifest() });
  assert.equal(fs.readFileSync(claudeMd, 'utf8'), fs.readFileSync(GOLDEN, 'utf8'));
});

test('managed block preserves surrounding content and replaces in place', () => {
  const paths = setup();
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  fs.writeFileSync(claudeMd, '# My notes\n\ntext\n');
  const manifest = freshManifest();

  applyClaudeAdapter(paths, { manifest });
  let content = fs.readFileSync(claudeMd, 'utf8');
  assert.ok(content.startsWith('# My notes\n\ntext\n'), 'original content survives verbatim');
  // Exactly one blank line between prior content and the begin sentinel.
  assert.ok(content.includes('text\n\n<!-- wienerdog:begin -->'));
  assert.equal(content.match(/wienerdog:begin/g).length, 1, 'exactly one block');

  // Second run replaces in place, no second block, original text intact.
  applyClaudeAdapter(paths, { manifest });
  content = fs.readFileSync(claudeMd, 'utf8');
  assert.ok(content.startsWith('# My notes\n\ntext\n'));
  assert.equal(content.match(/wienerdog:begin/g).length, 1, 'still exactly one block');
});

test('settings.json merge preserves existing hooks and dedups', () => {
  const paths = setup();
  const settingsPath = path.join(paths.claudeDir, 'settings.json');
  const preExisting = {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: '/usr/local/bin/other.sh', timeout: 5 }] },
      ],
    },
  };
  fs.writeFileSync(settingsPath, `${JSON.stringify(preExisting, null, 2)}\n`);
  const manifest = freshManifest();

  applyClaudeAdapter(paths, { manifest });
  let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const endAbs = path.join(paths.core, 'bin', 'session-end.sh');

  const allCommands = (event) =>
    (settings.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(allCommands('SessionStart').includes('/usr/local/bin/other.sh'), 'unrelated hook survives');
  assert.equal(allCommands('SessionStart').filter((c) => c === startAbs).length, 1);
  assert.equal(allCommands('SessionEnd').filter((c) => c === endAbs).length, 1);

  // Second run: no duplicates.
  applyClaudeAdapter(paths, { manifest });
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(allCommands('SessionStart').filter((c) => c === startAbs).length, 1);
  assert.equal(allCommands('SessionEnd').filter((c) => c === endAbs).length, 1);
  assert.ok(allCommands('SessionStart').includes('/usr/local/bin/other.sh'));
});

test('hook scripts are copied to core/bin mode 0755', () => {
  const paths = setup();
  applyClaudeAdapter(paths, { manifest: freshManifest() });
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const endAbs = path.join(paths.core, 'bin', 'session-end.sh');
  assert.ok(fs.existsSync(startAbs) && fs.existsSync(endAbs));
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(startAbs).mode & 0o777, 0o755);
    assert.equal(fs.statSync(endAbs).mode & 0o777, 0o755);
  }
});

test('skills symlink points at the core skill dir', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  applyClaudeAdapter(paths, { manifest: freshManifest() });

  const linkPath = path.join(paths.claudeDir, 'skills', 'wienerdog-setup');
  if (process.platform === 'win32') return; // symlinking skipped on Windows in v1
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink());
  assert.equal(fs.readlinkSync(linkPath), coreSkill);
});

test('skills symlink leaves a user non-symlink file untouched', () => {
  const paths = setup();
  if (process.platform === 'win32') return;
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  const claudeSkills = path.join(paths.claudeDir, 'skills');
  fs.mkdirSync(claudeSkills, { recursive: true });
  const userFile = path.join(claudeSkills, 'wienerdog-setup');
  fs.writeFileSync(userFile, 'user owns this\n');

  const res = applyClaudeAdapter(paths, { manifest: freshManifest() });
  assert.equal(fs.readFileSync(userFile, 'utf8'), 'user owns this\n');
  assert.ok(res.notices.some((n) => n.includes('wienerdog-setup')));
});

test('idempotency: second run reports no changes and does not touch mtimes', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  const manifest = freshManifest();
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  const settingsPath = path.join(paths.claudeDir, 'settings.json');

  applyClaudeAdapter(paths, { manifest });
  const mdMtime = fs.statSync(claudeMd).mtimeMs;
  const settingsMtime = fs.statSync(settingsPath).mtimeMs;

  const res = applyClaudeAdapter(paths, { manifest });
  assert.deepEqual(res.changed, []);
  assert.equal(fs.statSync(claudeMd).mtimeMs, mdMtime);
  assert.equal(fs.statSync(settingsPath).mtimeMs, settingsMtime);
});

test('dry-run makes no writes but reports intended changes', () => {
  const paths = setup();
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  const res = applyClaudeAdapter(paths, { dryRun: true, manifest: freshManifest() });
  assert.ok(res.changed.includes(claudeMd));
  assert.equal(fs.existsSync(claudeMd), false, 'no file written on dry-run');
  assert.equal(fs.existsSync(path.join(paths.core, 'bin', 'session-start.sh')), false);
});

test('missing digest: returns early with a notice, no throw', () => {
  const paths = setup();
  fs.rmSync(path.join(paths.state, 'digest.md'));
  const res = applyClaudeAdapter(paths, { manifest: freshManifest() });
  assert.deepEqual(res.changed, []);
  assert.ok(res.notices.some((n) => n.includes('digest not found')));
});

test('uninstall reverses everything, keeping unrelated hooks and user content', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  // Pre-existing unrelated CLAUDE.md content and settings hook.
  const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md');
  const settingsPath = path.join(paths.claudeDir, 'settings.json');
  const preExisting = {
    hooks: {
      SessionStart: [
        { matcher: '*', hooks: [{ type: 'command', command: '/usr/local/bin/other.sh', timeout: 5 }] },
      ],
    },
  };
  fs.writeFileSync(settingsPath, `${JSON.stringify(preExisting, null, 2)}\n`);

  const manifest = freshManifest();
  applyClaudeAdapter(paths, { manifest });
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(paths.core, { recursive: true });

  const linkPath = path.join(paths.claudeDir, 'skills', 'wienerdog-setup');

  manifestLib.reverse(paths, manifest, { dryRun: false });

  // Managed block gone; because CLAUDE.md was created by us and had only the
  // block, the file is removed.
  assert.equal(fs.existsSync(claudeMd), false, 'created CLAUDE.md removed');

  // Our hooks gone, unrelated hook survives.
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const cmds = (settings.hooks.SessionStart || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.includes('/usr/local/bin/other.sh'), 'unrelated hook survives');
  assert.ok(!cmds.includes(startAbs), 'our hook removed');
  assert.ok(!('SessionEnd' in settings.hooks), 'SessionEnd array pruned');

  // Symlink unlinked; copied hook scripts gone.
  if (process.platform !== 'win32') {
    assert.equal(fs.existsSync(linkPath), false, 'symlink unlinked');
  }
  assert.equal(fs.existsSync(startAbs), false, 'copied hook script removed');
});
