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
 * <state>/digest.md. Never touches the real $HOME or ~/.codex — skills now
 * live under ~/.codex/skills, not ~/.agents/skills.
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

/** Mirror of shared.js's shellQuoteCommand (WP-090), for building the expected
 *  stored/recorded command string in assertions without importing an internal.
 *  @param {string} p @returns {string} */
function q(p) {
  return `'${String(p).replace(/\\/g, '/').replace(/'/g, `'\\''`)}'`;
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
  assert.equal(allCommands('SessionStart').filter((c) => c === q(startAbs)).length, 1);
  assert.equal(allCommands('Stop').filter((c) => c === q(stopAbs)).length, 1);
  assert.ok(res.notices.some((n) => n.includes('/hooks')), 'expected the /hooks trust notice');
  assert.ok(
    res.notices.some((n) => n.includes('/skills') && n.includes('$wienerdog-setup')),
    'expected the Codex skill-invocation notice'
  );

  // Second run: no duplicates.
  applyCodexAdapter(paths, { manifest });
  hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(allCommands('SessionStart').filter((c) => c === q(startAbs)).length, 1);
  assert.equal(allCommands('Stop').filter((c) => c === q(stopAbs)).length, 1);
  assert.ok(allCommands('Stop').includes('/usr/local/bin/other-stop.sh'));
});

test('backslash-seeded Stop converges to exactly one forward-slash entry (WP-077)', () => {
  const paths = setup();
  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const stopAbs = path.join(paths.core, 'bin', 'codex-session-end.sh');
  // Simulate a stock-broken 0.6.5 Windows machine: the Stop command was registered
  // with backslash separators (path.join on win32).
  const winStop = stopAbs.replace(/\//g, '\\');
  const preExisting = {
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: winStop, timeout: 10 }] },
        { hooks: [{ type: 'command', command: '/usr/local/bin/other-stop.sh', timeout: 30 }] },
      ],
    },
  };
  fs.writeFileSync(hooksPath, `${JSON.stringify(preExisting, null, 2)}\n`);
  const manifest = freshManifest();

  applyCodexAdapter(paths, { manifest });
  let hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const allCommands = (event) => (hooks.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));

  // Exactly one Stop command for our path, forward-slash AND shell-quoted, no
  // backslash variant left (WP-090 converges the WP-077 bare form too).
  assert.equal(allCommands('Stop').filter((c) => c === q(stopAbs)).length, 1);
  assert.ok(!allCommands('Stop').some((c) => c.includes('\\')), 'no backslash in any Stop command');
  // Unrelated user hook survives untouched.
  assert.ok(allCommands('Stop').includes('/usr/local/bin/other-stop.sh'), 'unrelated Stop hook survives');
  // SessionStart registered with forward slashes, shell-quoted.
  assert.ok(allCommands('SessionStart').includes(q(startAbs)), 'SessionStart quoted forward-slash command present');
  assert.ok(!allCommands('SessionStart').some((c) => c.includes('\\')), 'no backslash in any SessionStart command');

  // Recorded manifest commands are the quoted forward-slash forms.
  const entry = manifest.entries.find((e) => e.kind === 'settings-entry' && e.path === hooksPath);
  assert.ok(entry.commands.every((c) => !c.includes('\\')), 'manifest records forward-slash commands');
  assert.ok(entry.commands.includes(q(stopAbs)), 'manifest records the quoted Stop command');

  // Second apply is a no-op: hooks file reported unchanged, still one Stop entry for us.
  const res = applyCodexAdapter(paths, { manifest });
  assert.ok(res.unchanged.includes(hooksPath), 'idempotent second run leaves hooks unchanged');
  hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  assert.equal(allCommands('Stop').filter((c) => c === q(stopAbs)).length, 1);
});

test('an install root containing a space registers shell-quoted hooks end-to-end (WP-090)', () => {
  // WIENERDOG_HOME with a space in it (e.g. "My Files"), exercising the real
  // adapter rather than calling applySettings directly.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-codex-'));
  const env = {
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'My Files', 'wd'),
    CODEX_HOME: path.join(root, 'codex'),
  };
  const paths = getPaths(env);
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.codexDir, { recursive: true });
  fs.writeFileSync(path.join(paths.state, 'digest.md'), FIXED_DIGEST);

  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const startAbs = path.join(paths.core, 'bin', 'session-start.sh');
  const manifest = freshManifest();

  applyCodexAdapter(paths, { manifest });
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const allCommands = (event) => (hooks.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));

  assert.deepEqual(allCommands('SessionStart'), [q(startAbs)], 'quoted single-argument command');

  // Second run: idempotent, no-op.
  const res = applyCodexAdapter(paths, { manifest });
  assert.ok(res.unchanged.includes(hooksPath), 'idempotent second run leaves hooks unchanged');
});

test('applySettings converges a pre-existing bare (unquoted) Codex entry to exactly one quoted entry, leaving unrelated hooks untouched', () => {
  const { applySettings } = require('../../src/adapters/shared');
  const paths = setup();
  const hooksPath = path.join(paths.codexDir, 'hooks.json');
  const stopAbs = path.join(paths.core, 'bin', 'codex-session-end.sh');
  const preExisting = {
    hooks: {
      Stop: [
        { hooks: [{ type: 'command', command: stopAbs, timeout: 10 }] },
        { hooks: [{ type: 'command', command: '/usr/local/bin/other-stop.sh', timeout: 30 }] },
      ],
    },
  };
  fs.writeFileSync(hooksPath, `${JSON.stringify(preExisting, null, 2)}\n`);
  const manifest = freshManifest();
  const out = { changed: [], unchanged: [], notices: [] };

  applySettings(hooksPath, [['Stop', stopAbs]], false, manifest, out);
  const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const allCommands = (event) => (hooks.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.command));

  assert.deepEqual(
    allCommands('Stop').filter((c) => c === stopAbs || c === q(stopAbs)),
    [q(stopAbs)],
    'bare entry pruned; exactly one quoted entry remains'
  );
  assert.ok(allCommands('Stop').includes('/usr/local/bin/other-stop.sh'), 'unrelated user hook untouched');
});

test('skills symlink into <codexDir>/skills points at the core skill dir', () => {
  const paths = setup();
  const coreSkill = path.join(paths.core, 'skills', 'wienerdog-setup');
  fs.mkdirSync(coreSkill, { recursive: true });
  fs.writeFileSync(path.join(coreSkill, 'SKILL.md'), '# skill\n');

  applyCodexAdapter(paths, { manifest: freshManifest() });

  const linkPath = path.join(paths.codexDir, 'skills', 'wienerdog-setup');
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

  const linkPath = path.join(paths.codexDir, 'skills', 'wienerdog-setup');

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

  // WIENERDOG_LOADER_NOOP: `init --fresh-vault` schedules the nightly dream via
  // real launchd; its label is per-user-global (NOT HOME-scoped), so a temp-HOME
  // run would mutate the developer's real agent (WP-071).
  const subprocessEnv = { ...process.env, WIENERDOG_LOADER_NOOP: '1', HOME: home, WIENERDOG_HOME: core, WIENERDOG_VAULT: vault, CODEX_HOME: codexHome };
  delete subprocessEnv.CLAUDE_CONFIG_DIR;

  // 1. `wienerdog init --fresh-vault --yes` — Claude absent (no CLAUDE_CONFIG_DIR, no
  //    <home>/.claude), Codex present. --fresh-vault so a vault exists for sync (WP-027:
  //    plain `init` now defers vault creation).
  execFileSync('node', [bin, 'init', '--fresh-vault', '--yes'], { env: subprocessEnv, encoding: 'utf8' });

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
  assert.ok(sessionStartCmds.includes(q(startAbs)));
  assert.ok(stopCmds.includes(q(stopAbs)));

  const skillLink = path.join(codexHome, 'skills', 'wienerdog-setup');
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
