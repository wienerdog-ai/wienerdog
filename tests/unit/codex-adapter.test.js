'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { getPaths } = require('../../src/core/paths');
const { applyCodexAdapter } = require('../../src/adapters/codex');
const manifestLib = require('../../src/core/manifest');
const { buildCodexArgs, spawnBrain } = require('../../src/core/dream/brain');
const { collectExtracts } = require('../../src/core/dream/scratch');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

const FIXED_DIGEST = ['# Who you\'re working with', 'Ada Kovács — product lead.', '', '## Standing instructions', 'Be concise.', ''].join('\n');

const GOLDEN = path.join(__dirname, '..', 'golden', 'codex-adapter', 'AGENTS.md');

/**
 * Fresh temp core + codex dir, with the fixed digest already written to
 * <state>/digest.md. Never touches the real $HOME, ~/.codex or ~/.agents.
 * CLAUDE_CONFIG_DIR is left unset with no <HOME>/.claude, so Claude is absent.
 * @returns {import('../../src/core/paths').WienerdogPaths}
 */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-codex-'));
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    CODEX_HOME: path.join(root, 'codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.codexDir, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), FIXED_DIGEST);
  return paths;
}

/** @returns {object} */
function freshManifest() {
  return { version: 1, createdAt: new Date().toISOString(), entries: [] };
}

test('AGENTS.md managed block, new file: matches the golden byte-for-byte', () => {
  const paths = setup();
  const agentsMd = path.join(paths.codexDir, 'AGENTS.md');
  applyCodexAdapter(paths, { manifest: freshManifest() });
  assert.equal(fs.readFileSync(agentsMd, 'utf8'), fs.readFileSync(GOLDEN, 'utf8'));
});

test('AGENTS.md preserves surrounding content and replaces in place', () => {
  const paths = setup();
  const agentsMd = path.join(paths.codexDir, 'AGENTS.md');
  fs.writeFileSync(agentsMd, '# My notes\n\ntext\n');
  const manifest = freshManifest();

  applyCodexAdapter(paths, { manifest });
  let content = fs.readFileSync(agentsMd, 'utf8');
  assert.ok(content.startsWith('# My notes\n\ntext\n'), 'original content survives verbatim');
  assert.ok(content.includes('text\n\n<!-- wienerdog:begin -->'));
  assert.equal(content.match(/wienerdog:begin/g).length, 1, 'exactly one block');

  applyCodexAdapter(paths, { manifest });
  content = fs.readFileSync(agentsMd, 'utf8');
  assert.ok(content.startsWith('# My notes\n\ntext\n'));
  assert.equal(content.match(/wienerdog:begin/g).length, 1, 'still exactly one block');
});

test('AGENTS.override.md existing triggers a shadowing notice', () => {
  const paths = setup();
  fs.writeFileSync(path.join(paths.codexDir, 'AGENTS.override.md'), '# override\n');

  const res = applyCodexAdapter(paths, { manifest: freshManifest() });
  assert.ok(
    res.notices.some((n) => n.includes('AGENTS.override.md') && n.toLowerCase().includes('shadow')),
    'expected an override-shadowing notice'
  );
});

test('hooks.json merge preserves existing hooks and dedups; /hooks trust notice present', () => {
  const paths = setup();
  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const preExisting = {
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: '/usr/local/bin/other-stop.sh', timeout: 30 }] }],
    },
  };
  fs.writeFileSync(hooksPath, `${JSON.stringify(preExisting, null, 2)}\n`);
  const manifest = freshManifest();

  const res = applyCodexAdapter(paths, { manifest });
  let hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const stopAbs = path.join(paths.core, 'bin', 'codex-session-end.sh');

  const allCommands = (event) => (hooks.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(allCommands('Stop').includes('/usr/local/bin/other-stop.sh'), 'unrelated hook survives');
  assert.equal(allCommands('SessionStart').filter((c) => c === startAbs).length, 1);
  assert.equal(allCommands('Stop').filter((c) => c === stopAbs).length, 1);
  assert.ok(res.notices.some((n) => n.includes('/hooks')), 'expected the /hooks trust notice');

  // Second run: no duplicates.
  applyCodexAdapter(paths, { manifest });
  hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(allCommands('SessionStart').filter((c) => c === startAbs).length, 1);
  assert.equal(allCommands('Stop').filter((c) => c === stopAbs).length, 1);
  assert.ok(allCommands('Stop').includes('/usr/local/bin/other-stop.sh'));
});

test('skills symlink into .agents/skills points at the core skill dir', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  applyCodexAdapter(paths, { manifest: freshManifest() });

  const linkPath = path.join(paths.home, '.agents', 'skills', 'wienerdog-setup');
  if (process.platform === 'win32') return; // symlinking skipped on Windows in v1
  assert.ok(fs.lstatSync(linkPath).isSymbolicLink());
  assert.equal(fs.readlinkSync(linkPath), coreSkill);
});

test('idempotency: second run reports no changes and does not touch mtimes', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');
  const manifest = freshManifest();
  const agentsMd = path.join(paths.codexDir, 'AGENTS.md');
  const hooksPath = path.join(paths.codexDir, 'hooks.json');

  applyCodexAdapter(paths, { manifest });
  const mdMtime = fs.statSync(agentsMd).mtimeMs;
  const hooksMtime = fs.statSync(hooksPath).mtimeMs;

  const res = applyCodexAdapter(paths, { manifest });
  assert.deepEqual(res.changed, []);
  assert.equal(fs.statSync(agentsMd).mtimeMs, mdMtime);
  assert.equal(fs.statSync(hooksPath).mtimeMs, hooksMtime);
});

test('uninstall reverses everything, keeping unrelated hooks and user content', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  const agentsMd = path.join(paths.codexDir, 'AGENTS.md');
  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const preExisting = {
    hooks: {
      Stop: [{ hooks: [{ type: 'command', command: '/usr/local/bin/other-stop.sh', timeout: 30 }] }],
    },
  };
  fs.writeFileSync(hooksPath, `${JSON.stringify(preExisting, null, 2)}\n`);

  const manifest = freshManifest();
  applyCodexAdapter(paths, { manifest });
  fs.writeFileSync(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.mkdirSync(paths.core, { recursive: true });

  const linkPath = path.join(paths.home, '.agents', 'skills', 'wienerdog-setup');

  manifestLib.reverse(paths, manifest, { dryRun: false });

  // Managed block gone; because AGENTS.md was created by us and had only the
  // block, the file is removed.
  assert.equal(fs.existsSync(agentsMd), false, 'created AGENTS.md removed');

  // Our hook entries gone, unrelated hook survives.
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const stopAbs = path.join(paths.core, 'bin', 'codex-session-end.sh');
  const stopCmds = (hooks.hooks.Stop || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(stopCmds.includes('/usr/local/bin/other-stop.sh'), 'unrelated hook survives');
  assert.ok(!stopCmds.includes(stopAbs), 'our Stop hook removed');
  assert.ok(!('SessionStart' in hooks.hooks), 'SessionStart array pruned');

  // Symlink unlinked; copied hook scripts gone.
  if (process.platform !== 'win32') {
    assert.equal(fs.existsSync(linkPath), false, 'symlink unlinked');
  }
  assert.equal(fs.existsSync(startAbs), false, 'copied session-start.sh removed');
});

test('buildCodexArgs produces the sandboxed invocation', () => {
  const argsNoModel = buildCodexArgs({ vaultDir: '/v', scratchDir: '/s', date: '2026-07-03', model: null });
  const joined = argsNoModel.join(' ');

  assert.ok(argsNoModel.includes('exec'));
  assert.ok(joined.includes('--sandbox workspace-write'));
  assert.ok(joined.includes('--cd /v'));
  assert.ok(joined.includes('-c approval_policy=never'));
  assert.ok(joined.includes('-c sandbox_workspace_write.network_access=false'));
  assert.ok(argsNoModel.includes('--skip-git-repo-check'));
  assert.ok(joined.includes('/wienerdog-dream'));
  assert.ok(joined.includes('/s'));
  assert.ok(joined.includes('/v'));
  assert.ok(joined.includes('2026-07-03'));

  // Model omitted when null.
  assert.ok(!argsNoModel.includes('--model'));

  // Forbidden/rejected flags must never appear.
  assert.ok(!joined.includes('--ask-for-approval'));
  assert.ok(!joined.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(!joined.includes('--yolo'));

  const argsModel = buildCodexArgs({ vaultDir: '/v', scratchDir: '/s', date: '2026-07-03', model: 'gpt-5.5' });
  const i = argsModel.indexOf('--model');
  assert.ok(i !== -1);
  assert.equal(argsModel[i + 1], 'gpt-5.5');
});

test('Codex-only machine: full setup + working dream from rollout files alone', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-codex-int-'));
  const home = path.join(root, 'home');
  const core = path.join(root, 'wd');
  const vault = path.join(root, 'vault');
  const codexHome = path.join(root, 'codex');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });

  const subprocessEnv = { ...process.env, HOME: home, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault, CODEX_HOME: codexHome };
  delete subprocessEnv.CLAUDE_CONFIG_DIR;

  // 1. `wienerdog init --yes` — Claude absent (no CLAUDE_CONFIG_DIR, no <home>/.claude), Codex present.
  execFileSync('node', [bin, 'init', '--yes'], { env: subprocessEnv, encoding: 'utf8' });

  // 2. Drop the WP-005 identity fixture into <vault>/06-Identity/.
  const identitySrc = path.join(repoRoot, 'tests', 'fixtures', 'identity-filled', '06-Identity');
  const identityDest = path.join(vault, '06-Identity');
  fs.mkdirSync(identityDest, { recursive: true });
  for (const f of fs.readdirSync(identitySrc)) {
    fs.copyFileSync(path.join(identitySrc, f), path.join(identityDest, f));
  }

  // 3. Run `sync` in-process (mutating process.env like the dream integration test does,
  // since sync.js/getPaths() read process.env directly).
  const ENV_KEYS = ['HOME', 'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME'];
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  Object.assign(process.env, { HOME: home, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault, CODEX_HOME: codexHome });
  delete process.env.CLAUDE_CONFIG_DIR;

  const origLog = console.log;
  console.log = () => {};
  try {
    await require('../../src/cli/sync').run([]);
  } finally {
    console.log = origLog;
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }

  // Assert: AGENTS.md has the managed block; hooks.json has SessionStart + Stop;
  // skill symlinked; no ~/.claude written.
  const agentsMd = path.join(codexHome, 'AGENTS.md');
  const hooksPath = path.join(codexHome, 'hooks.json');
  assert.ok(fs.readFileSync(agentsMd, 'utf8').includes('<!-- wienerdog:begin -->'));

  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const startAbs = path.join(core, 'bin', 'session-start.sh');
  const stopAbs = path.join(core, 'bin', 'codex-session-end.sh');
  const sessionStartCmds = (hooks.hooks.SessionStart || []).flatMap((g) => g.hooks.map((h) => h.command));
  const stopCmds = (hooks.hooks.Stop || []).flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(sessionStartCmds.includes(startAbs));
  assert.ok(stopCmds.includes(stopAbs));

  const skillLink = path.join(home, '.agents', 'skills', 'wienerdog-setup');
  if (process.platform !== 'win32') {
    assert.ok(fs.lstatSync(skillLink).isSymbolicLink());
  }

  assert.equal(fs.existsSync(path.join(home, '.claude')), false, 'Claude correctly skipped');

  // 4. Plant a Codex rollout file with real-shape lines (WP-007's fixture).
  const rolloutDir = path.join(codexHome, 'sessions', '2026', '07', '03');
  fs.mkdirSync(rolloutDir, { recursive: true });
  const rolloutFixture = path.join(repoRoot, 'tests', 'fixtures', 'transcripts', 'codex-rollout.jsonl');
  const rolloutPath = path.join(rolloutDir, 'rollout-2026-07-03T09-00-00-11111111-1111-1111-1111-111111111111.jsonl');
  fs.copyFileSync(rolloutFixture, rolloutPath);

  const paths = getPaths({ HOME: home, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault, CODEX_HOME: codexHome });
  const collected = collectExtracts(paths, { claude: null, codex: null }, 400000);
  assert.equal(collected.entries.filter((e) => e.harness === 'codex').length, 1, 'one codex extract written to scratch');

  // 5. A fake `codex` executable that writes a note into the vault, standing in
  // for real `codex exec` (manual-verification-at-M4).
  const fakeCodex = path.join(root, 'fake-codex.sh');
  fs.writeFileSync(
    fakeCodex,
    ['#!/bin/sh', 'mkdir -p "$WIENERDOG_DREAM_VAULT/07-Daily"', 'echo "# note" > "$WIENERDOG_DREAM_VAULT/07-Daily/2026-07-03.md"', 'exit 0', ''].join('\n')
  );
  fs.chmodSync(fakeCodex, 0o755);

  const { done } = spawnBrain({
    harness: 'codex',
    vaultDir: vault,
    scratchDir: collected.scratchDir,
    date: '2026-07-03',
    model: null,
    env: { ...process.env, WIENERDOG_DREAM_CMD: fakeCodex },
  });
  const result = await done;
  assert.equal(result.code, 0);
  assert.ok(fs.existsSync(path.join(vault, '07-Daily', '2026-07-03.md')), 'the codex-path brain wrote to the vault');
});
