'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PROFILES,
  getProfile,
  listRoutineProfileIds,
  composeClaudeArgs,
  RuntimeProfileError,
} = require('../../src/core/runtime-profile');
const { WienerdogError } = require('../../src/core/errors');

const DENY_TOOLS = ['Bash', 'WebFetch', 'WebSearch', 'Task', 'Agent', 'Skill', 'Workflow', 'NotebookEdit'];

/** Default compose context for the dream profile. @returns {object} */
function dreamCtx() {
  return {
    prompt: '/x',
    addDirs: ['/v', '/s'],
    settingsPath: '/s.json',
    mcpConfigPath: null,
    model: null,
    appendSystemPrompt: null,
  };
}

/** The value that follows a flag in an argv. @param {string[]} args @param {string} flag @returns {string|undefined} */
function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

// --- registry shape ---

test('runtime-profile: PROFILES is deeply frozen', () => {
  assert.ok(Object.isFrozen(PROFILES));
  assert.ok(Object.isFrozen(PROFILES.dream));
  assert.ok(Object.isFrozen(PROFILES.dream.tools));
  assert.ok(Object.isFrozen(PROFILES.dream.disallowedTools));
  for (const id of Object.keys(PROFILES)) {
    assert.ok(Object.isFrozen(PROFILES[id]), `${id} frozen`);
    assert.ok(Object.isFrozen(PROFILES[id].tools), `${id}.tools frozen`);
  }
  // A mutation attempt is a no-op (non-strict callers) — the profile is unchanged.
  assert.throws(() => {
    PROFILES.dream.tools.push('Bash');
  });
  assert.deepEqual(PROFILES.dream.tools, ['Read', 'Write', 'Edit', 'Glob', 'Grep']);
});

test('runtime-profile: dream profile has the exact tool posture', () => {
  const dream = getProfile('dream');
  assert.deepEqual(dream.tools, ['Read', 'Write', 'Edit', 'Glob', 'Grep']);
  for (const t of DENY_TOOLS) {
    assert.ok(dream.disallowedTools.includes(t), `deny list includes ${t}`);
  }
  assert.equal(dream.mcp, 'empty');
  assert.equal(dream.permissionMode, 'acceptEdits');
  assert.equal(dream.skillId, 'wienerdog-dream');
});

test('runtime-profile: every profile has a NON-EMPTY explicit tools allowlist and the full deny list', () => {
  for (const id of Object.keys(PROFILES)) {
    const p = PROFILES[id];
    assert.ok(Array.isArray(p.tools) && p.tools.length > 0, `${id}.tools is non-empty`);
    for (const t of DENY_TOOLS) {
      assert.ok(p.disallowedTools.includes(t), `${id} deny list includes ${t}`);
    }
  }
});

test('runtime-profile: routine profiles carry the explicit minimal allowlist', () => {
  assert.deepEqual(getProfile('daily-digest').tools, ['Read']);
  assert.deepEqual(getProfile('inbox-triage').tools, ['Read']);
  assert.deepEqual(getProfile('weekly-review').tools, ['Read']);
});

test('runtime-profile: every routine is mcp:broker since WP-141 (A2-RESTORE done); dream stays empty', () => {
  assert.equal(getProfile('daily-digest').mcp, 'broker');
  assert.equal(getProfile('inbox-triage').mcp, 'broker');
  assert.equal(getProfile('weekly-review').mcp, 'broker');
  assert.equal(getProfile('dream').mcp, 'empty');
});

test('runtime-profile: getProfile fails closed on an unknown id', () => {
  assert.throws(() => getProfile('nope'), RuntimeProfileError);
  assert.throws(() => getProfile(''), RuntimeProfileError);
  // Prototype keys must not resolve to a profile.
  assert.throws(() => getProfile('constructor'), RuntimeProfileError);
  assert.throws(() => getProfile('hasOwnProperty'), RuntimeProfileError);
  // RuntimeProfileError is a WienerdogError so the CLI's catch(→exit 1) applies.
  try {
    getProfile('nope');
    assert.fail('expected a throw');
  } catch (err) {
    assert.ok(err instanceof WienerdogError);
  }
});

test('runtime-profile: listRoutineProfileIds returns the three catalog routines, sorted', () => {
  assert.deepEqual(listRoutineProfileIds(), ['daily-digest', 'inbox-triage', 'weekly-review']);
});

// --- argv composition ---

test('runtime-profile: composeClaudeArgs dream argv is fully hermetic', () => {
  const args = composeClaudeArgs(getProfile('dream'), dreamCtx());
  assert.equal(flagValue(args, '-p'), '/x');
  assert.equal(flagValue(args, '--tools'), 'Read,Write,Edit,Glob,Grep');
  const deny = flagValue(args, '--disallowedTools');
  for (const t of DENY_TOOLS) {
    assert.ok(deny.split(',').includes(t), `--disallowedTools names ${t}`);
  }
  assert.equal(flagValue(args, '--permission-mode'), 'acceptEdits');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(!args.includes('--mcp-config'), 'dream has zero MCP servers');
  assert.equal(flagValue(args, '--setting-sources'), '', '--setting-sources is the EMPTY value');
  assert.notEqual(flagValue(args, '--setting-sources'), 'user');
  assert.equal(flagValue(args, '--settings'), '/s.json');
  // Both add-dirs present as separate --add-dir flags.
  const dirs = args.flatMap((a, i) => (a === '--add-dir' ? [args[i + 1]] : []));
  assert.deepEqual(dirs, ['/v', '/s']);
  // No model / append-system-prompt when null.
  assert.ok(!args.includes('--model'));
  assert.ok(!args.includes('--append-system-prompt'));
});

test('runtime-profile: composeClaudeArgs never emits an empty --tools', () => {
  for (const id of Object.keys(PROFILES)) {
    const p = PROFILES[id];
    const ctx = { ...dreamCtx(), mcpConfigPath: p.mcp === 'broker' ? '/broker.json' : null };
    const args = composeClaudeArgs(p, ctx);
    const tools = flagValue(args, '--tools');
    assert.ok(typeof tools === 'string' && tools.length > 0, `${id} emits a non-empty --tools`);
  }
});

test('runtime-profile: composeClaudeArgs emits model and appendSystemPrompt when set', () => {
  const args = composeClaudeArgs(getProfile('dream'), {
    ...dreamCtx(),
    model: 'claude-opus-4-8',
    appendSystemPrompt: 'SKILL BODY',
  });
  assert.equal(flagValue(args, '--model'), 'claude-opus-4-8');
  assert.equal(flagValue(args, '--append-system-prompt'), 'SKILL BODY');
});

test('runtime-profile: a broker profile without an mcpConfigPath fails closed', () => {
  assert.throws(
    () => composeClaudeArgs(getProfile('daily-digest'), dreamCtx()),
    RuntimeProfileError
  );
  // A relative path is not an absolute broker config either.
  assert.throws(
    () => composeClaudeArgs(getProfile('daily-digest'), { ...dreamCtx(), mcpConfigPath: 'broker.json' }),
    RuntimeProfileError
  );
});

test('runtime-profile: a broker profile with an absolute config emits exactly one --mcp-config', () => {
  const args = composeClaudeArgs(getProfile('daily-digest'), {
    ...dreamCtx(),
    mcpConfigPath: '/etc/wd/broker.json',
  });
  assert.equal(args.filter((a) => a === '--mcp-config').length, 1);
  assert.equal(flagValue(args, '--mcp-config'), '/etc/wd/broker.json');
  assert.ok(args.includes('--strict-mcp-config'), '--strict-mcp-config is ALWAYS emitted');
});

test('runtime-profile: an mcp:empty profile refuses a supplied mcpConfigPath', () => {
  assert.throws(
    () => composeClaudeArgs(getProfile('dream'), { ...dreamCtx(), mcpConfigPath: '/broker.json' }),
    RuntimeProfileError
  );
});

// --- durable A2 trace ---

test('runtime-profile: the A2-RESTORE marker records the WP-141 broker flip in the module source', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'core', 'runtime-profile.js'),
    'utf8'
  );
  assert.ok(src.includes('A2-RESTORE done'), 'the A2-RESTORE trace records the flip happened (WP-141)');
});
