'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const {
  ensureBrokerMcpConfig,
  composeRoutineRun,
} = require('../../src/core/routine-runtime');
const { makeVaultSnapshot } = require('../../src/core/vault-snapshot');
const { getProfile, composeClaudeArgs, PROFILES } = require('../../src/core/runtime-profile');
const { RUNTIME_DIR } = require('../../src/core/runtime-settings');
const { BROKER_SERVER_NAME } = require('../../src/gws/broker/constants');
const { getPaths } = require('../../src/core/paths');

const POSIX = process.platform !== 'win32';
const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

/** Isolated temp paths with a vault dir. */
function tempPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brokerwire-'));
  return getPaths({
    HOME: root,
    WIENERDOG_HOME: path.join(root, 'wd'),
    WIENERDOG_VAULT: path.join(root, 'vault'),
  });
}

/** @param {string[]} args @param {string} flag @returns {string|undefined} */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// ------------------------------------------------- trusted launch descriptor

test('broker-wiring: ensureBrokerMcpConfig writes a per-routine 0600 config with the trusted --routine argv', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const dest = ensureBrokerMcpConfig(paths, getProfile('daily-digest'));
  assert.ok(path.isAbsolute(dest));
  assert.equal(dest, path.join(RUNTIME_DIR(paths), 'broker-mcp-daily-digest.json'));
  assert.equal(fs.statSync(dest).mode & 0o777, 0o600);

  const cfg = JSON.parse(fs.readFileSync(dest, 'utf8'));
  const server = cfg.mcpServers[BROKER_SERVER_NAME];
  assert.ok(server, 'single broker server under the canonical name');
  assert.equal(Object.keys(cfg.mcpServers).length, 1);
  assert.ok(path.isAbsolute(server.command), 'node command is absolute');
  const args = server.args;
  assert.equal(args[args.length - 4], 'gws');
  assert.equal(args[args.length - 3], '_broker');
  assert.equal(args[args.length - 2], '--routine');
  assert.equal(args[args.length - 1], 'daily-digest', 'identity is ARGV, written by our code (closes F5)');
  assert.equal(server.env.CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS, '0');
  assert.equal(server.env.WIENERDOG_HOME, paths.core);
  assert.equal(typeof server.timeout, 'number');
});

test('broker-wiring: per-routine filenames differ (D-BROKER-CONFIG-PATH — no identity race)', () => {
  const paths = tempPaths();
  const a = ensureBrokerMcpConfig(paths, getProfile('daily-digest'));
  const b = ensureBrokerMcpConfig(paths, getProfile('inbox-triage'));
  assert.notEqual(a, b);
  const cfgB = JSON.parse(fs.readFileSync(b, 'utf8'));
  assert.equal(cfgB.mcpServers[BROKER_SERVER_NAME].args.at(-1), 'inbox-triage');
});

test('broker-wiring: a non-broker profile gets no config (null)', () => {
  const paths = tempPaths();
  assert.equal(ensureBrokerMcpConfig(paths, getProfile('dream')), null);
});

// ----------------------------------------------------------- --allowedTools

test('broker-wiring: composeClaudeArgs emits --allowedTools naming exactly the profile verbs, no wildcard', () => {
  const cases = {
    'daily-digest': ['calendar_list', 'gmail_search', 'gmail_read', 'send_digest_to_self'],
    'inbox-triage': ['gmail_search', 'gmail_read', 'create_draft'],
    'weekly-review': ['create_draft'],
  };
  for (const [id, verbs] of Object.entries(cases)) {
    const profile = getProfile(id);
    assert.deepEqual([...profile.brokerVerbs], verbs, `${id} brokerVerbs`);
    const args = composeClaudeArgs(profile, {
      prompt: '/x',
      addDirs: ['/s'],
      settingsPath: '/settings.json',
      mcpConfigPath: '/broker.json',
      model: null,
      appendSystemPrompt: null,
    });
    const allowed = flagValue(args, '--allowedTools');
    assert.equal(allowed, verbs.map((v) => `mcp__${BROKER_SERVER_NAME}__${v}`).join(','));
    assert.ok(!allowed.includes('*'), 'never a wildcard');
    assert.equal(flagValue(args, '--tools'), 'Read', 'built-ins unchanged');
  }
});

test('broker-wiring: weekly-review is mcp:broker with exactly create_draft (A2-RESTORE done)', () => {
  const p = getProfile('weekly-review');
  assert.equal(p.mcp, 'broker');
  assert.deepEqual([...p.brokerVerbs], ['create_draft']);
});

test('broker-wiring: the dream profile emits NO --allowedTools (no MCP surface)', () => {
  const args = composeClaudeArgs(getProfile('dream'), {
    prompt: '/x',
    addDirs: ['/s'],
    settingsPath: '/settings.json',
    mcpConfigPath: null,
    model: null,
    appendSystemPrompt: null,
  });
  assert.ok(!args.includes('--allowedTools'));
});

test('broker-wiring: every broker profile declares a non-empty brokerVerbs of real registry verbs', () => {
  const { VERBS } = require('../../src/gws/broker/verbs');
  for (const p of Object.values(PROFILES)) {
    if (p.mcp !== 'broker') continue;
    assert.ok(Array.isArray(p.brokerVerbs) && p.brokerVerbs.length > 0, `${p.id} has verbs`);
    for (const v of p.brokerVerbs) assert.ok(VERBS[v], `${p.id} verb ${v} exists in the registry`);
  }
});

// ------------------------------------------------------------ vault snapshot

test('broker-wiring: makeVaultSnapshot copies the fixed per-routine slice, 0700/0600, mirrored layout', { skip: !POSIX }, () => {
  const paths = tempPaths();
  fs.mkdirSync(path.join(paths.vault, 'reports', 'dreams'), { recursive: true });
  fs.writeFileSync(path.join(paths.vault, 'reports', 'dreams', '2026-07-16.md'), 'older');
  fs.writeFileSync(path.join(paths.vault, 'reports', 'dreams', '2026-07-17.md'), 'newest report');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));

  const { snapshotDir, skipped } = makeVaultSnapshot(paths, 'daily-digest', staging);
  assert.equal(snapshotDir, path.join(staging, 'vault-snapshot'));
  assert.equal(fs.statSync(snapshotDir).mode & 0o777, 0o700);
  const copied = path.join(snapshotDir, 'reports', 'dreams', '2026-07-17.md');
  assert.equal(fs.readFileSync(copied, 'utf8'), 'newest report');
  assert.equal(fs.statSync(copied).mode & 0o777, 0o600);
  assert.ok(!fs.existsSync(path.join(snapshotDir, 'reports', 'dreams', '2026-07-16.md')), 'daily-digest takes ONLY the newest');
  assert.deepEqual(skipped, []);
});

test('broker-wiring: weekly-review takes the last 7 daily notes + last 7 dream reports', () => {
  const paths = tempPaths();
  fs.mkdirSync(path.join(paths.vault, '07-Daily'), { recursive: true });
  fs.mkdirSync(path.join(paths.vault, 'reports', 'dreams'), { recursive: true });
  for (let d = 1; d <= 9; d++) {
    fs.writeFileSync(path.join(paths.vault, '07-Daily', `2026-07-0${d}.md`), `day ${d}`);
  }
  fs.writeFileSync(path.join(paths.vault, 'reports', 'dreams', '2026-07-09.md'), 'r');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));

  const { snapshotDir } = makeVaultSnapshot(paths, 'weekly-review', staging);
  const dailies = fs.readdirSync(path.join(snapshotDir, '07-Daily')).sort();
  assert.equal(dailies.length, 7, 'last 7 daily notes');
  assert.ok(!dailies.includes('2026-07-01.md'));
  assert.ok(!dailies.includes('2026-07-02.md'));
  assert.ok(dailies.includes('2026-07-09.md'));
});

test('broker-wiring: inbox-triage gets NO snapshot', () => {
  const paths = tempPaths();
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));
  const { snapshotDir, skipped } = makeVaultSnapshot(paths, 'inbox-triage', staging);
  assert.equal(snapshotDir, null);
  assert.deepEqual(skipped, []);
});

test('broker-wiring: an over-cap file is skipped VISIBLY, never silently, never failing the run', () => {
  const paths = tempPaths();
  fs.mkdirSync(path.join(paths.vault, 'reports', 'dreams'), { recursive: true });
  fs.writeFileSync(path.join(paths.vault, 'reports', 'dreams', '2026-07-17.md'), 'x'.repeat(300 * 1024));
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));
  const { snapshotDir, skipped } = makeVaultSnapshot(paths, 'daily-digest', staging);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].file, /2026-07-17\.md/);
  assert.match(skipped[0].reason, /cap|exceeds/i);
  assert.ok(!fs.existsSync(path.join(snapshotDir, 'reports', 'dreams', '2026-07-17.md')));
});

test('broker-wiring: a symlink in a snapshot source is skipped visibly (never followed)', { skip: !POSIX }, () => {
  const paths = tempPaths();
  const dreams = path.join(paths.vault, 'reports', 'dreams');
  fs.mkdirSync(dreams, { recursive: true });
  const secret = path.join(paths.vault, 'secret.txt');
  fs.writeFileSync(secret, 'private');
  fs.symlinkSync(secret, path.join(dreams, '2026-07-18.md'));
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));
  const { snapshotDir, skipped } = makeVaultSnapshot(paths, 'daily-digest', staging);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0].reason, /regular file/i);
  assert.ok(!fs.existsSync(path.join(snapshotDir, 'reports', 'dreams', '2026-07-18.md')));
});

test('broker-wiring: an absent vault dir yields an empty snapshot without error', () => {
  const paths = tempPaths();
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-staging-'));
  const { snapshotDir, skipped } = makeVaultSnapshot(paths, 'daily-digest', staging);
  assert.equal(snapshotDir, path.join(staging, 'vault-snapshot'));
  assert.deepEqual(skipped, []);
});

// ---------------------------------------------------------- full composition

test('broker-wiring: composeRoutineRun for a broker routine fills the seam and adds ONLY staging + snapshot', () => {
  const paths = tempPaths();
  fs.mkdirSync(path.join(paths.vault, 'reports', 'dreams'), { recursive: true });
  fs.writeFileSync(path.join(paths.vault, 'reports', 'dreams', '2026-07-17.md'), 'r');

  const r = composeRoutineRun(paths, { name: 'digest', run: 'skill:wienerdog-daily-digest' });
  const args = r.args;

  const mcpConfig = flagValue(args, '--mcp-config');
  assert.equal(mcpConfig, path.join(RUNTIME_DIR(paths), 'broker-mcp-daily-digest.json'));
  assert.ok(fs.existsSync(mcpConfig), 'the seam is WRITTEN by the composition');

  const addDirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []));
  assert.deepEqual(addDirs, [r.cwd, path.join(r.cwd, 'vault-snapshot')]);
  assert.ok(!addDirs.includes(paths.vault), 'the live vault is NEVER added');

  const allowed = flagValue(args, '--allowedTools') || '';
  assert.ok(allowed.includes(`mcp__${BROKER_SERVER_NAME}__send_digest_to_self`));
});

// ----------------------------------------------------- broker CLI fail-closed

test('broker-wiring: gws _broker with an unknown routine exits non-zero and never speaks MCP', async () => {
  const paths = tempPaths();
  const child = spawn(process.execPath, [bin, 'gws', '_broker', '--routine', 'not-a-routine'], {
    env: { ...process.env, HOME: paths.home, WIENERDOG_HOME: paths.core },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => {
    out += c;
  });
  child.stdin.write('{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}\n');
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.notEqual(code, 0, 'fatal setup error exits non-zero');
  assert.equal(out, '', 'no server started — nothing on stdout');
});

test('broker-wiring: gws _broker for a known routine advertises the registry but refuses uncredentialed verbs', async () => {
  const paths = tempPaths();
  const child = spawn(process.execPath, [bin, 'gws', '_broker', '--routine', 'daily-digest'], {
    env: { ...process.env, HOME: paths.home, WIENERDOG_HOME: paths.core },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => {
    out += c;
  });
  const send = (m) => child.stdin.write(`${JSON.stringify(m)}\n`);
  send({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'gmail_search', arguments: { query: 'x' } } });
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  const replies = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(replies[0].result.protocolVersion, '2025-11-25');
  const tools = replies[1].result.tools.map((t) => t.name);
  assert.ok(tools.includes('gmail_search'), 'the real registry is advertised');
  assert.ok(replies[2].error, 'no READ credential in this temp core → the verb refuses fail-closed');
  assert.ok(!/token|ya29/.test(JSON.stringify(replies[2])), 'secret-free');
});
