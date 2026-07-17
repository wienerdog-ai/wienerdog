'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  discover,
  parse,
  parseWithOutcome,
  redact,
  rebaseInvocations,
  MAX_MESSAGES,
  Limits,
  newRunBudget,
} = require('../../src/core/transcripts');
const { mapCodexItem } = require('../../src/core/transcripts/codex');

const fixturesDir = path.join(__dirname, '..', 'fixtures', 'transcripts');

/** @param {Object} extract @returns {Object} */
function withoutSourcePath(extract) {
  const { source_path, ...rest } = extract;
  return rest;
}

test('parse: Claude golden extract matches fixture', () => {
  const inputPath = path.join(fixturesDir, 'claude-session.jsonl');
  const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'claude-session.expected.json'), 'utf8'));

  const extract = parse({ harness: 'claude', path: inputPath });

  assert.deepEqual(withoutSourcePath(extract), expected);
  assert.equal(extract.source_path, inputPath);
});

test('parse: Claude skill-invocation extract matches fixture', () => {
  const inputPath = path.join(fixturesDir, 'claude-skill-invocation.jsonl');
  const expected = JSON.parse(
    fs.readFileSync(path.join(fixturesDir, 'claude-skill-invocation.expected.json'), 'utf8'),
  );
  const extract = parse({ harness: 'claude', path: inputPath });
  assert.deepEqual(withoutSourcePath(extract), expected);
  assert.equal(extract.source_path, inputPath);
});

test('parse: Codex golden extract matches fixture', () => {
  // Verified against codex-cli 0.144.1 + upstream openai/codex source
  // (memo memory/research/2026-07-13-codex-transcript-role-provenance.md)
  const inputPath = path.join(fixturesDir, 'codex-rollout.jsonl');
  const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'codex-rollout.expected.json'), 'utf8'));

  const extract = parse({ harness: 'codex', path: inputPath });

  assert.deepEqual(withoutSourcePath(extract), expected);
  assert.equal(extract.source_path, inputPath);
});

test('mapCodexItem: custom_tool_call_output (0.144.x primary shape) -> tool_result', () => {
  const result = mapCodexItem({
    type: 'custom_tool_call_output',
    call_id: 'c1',
    name: 'exec',
    content: [{ type: 'input_text', text: 'exec stdout: 3 files' }],
  });
  assert.deepEqual(result, { role: 'tool_result', text: 'exec stdout: 3 files', ts: null });
});

test('mapCodexItem: legacy function_call_output still works -> tool_result', () => {
  const result = mapCodexItem({ type: 'function_call_output', output: 'file bytes' });
  assert.deepEqual(result, { role: 'tool_result', text: 'file bytes', ts: null });
});

test('mapCodexItem: message role developer (trusted allowlist) -> user', () => {
  const result = mapCodexItem({
    type: 'message',
    role: 'developer',
    content: [{ type: 'input_text', text: 'sandbox read-only' }],
  });
  assert.deepEqual(result, { role: 'user', text: 'sandbox read-only', ts: null });
});

test('mapCodexItem: message role system -> FAIL CLOSED, dropped', () => {
  const result = mapCodexItem({
    type: 'message',
    role: 'system',
    content: [{ type: 'input_text', text: 'sys' }],
  });
  assert.equal(result, null);
});

test('mapCodexItem: message role unrecognized (e.g. "tool") -> FAIL CLOSED, dropped', () => {
  const result = mapCodexItem({
    type: 'message',
    role: 'tool',
    content: [{ type: 'input_text', text: 'MUST DROP' }],
  });
  assert.equal(result, null);
});

test('mapCodexItem: message role user (unchanged) -> user', () => {
  const result = mapCodexItem({
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: 'hi' }],
  });
  assert.deepEqual(result, { role: 'user', text: 'hi', ts: null });
});

test('mapCodexItem: message role assistant (unchanged) -> assistant', () => {
  const result = mapCodexItem({
    type: 'message',
    role: 'assistant',
    content: [{ type: 'output_text', text: 'yo' }],
  });
  assert.deepEqual(result, { role: 'assistant', text: 'yo', ts: null });
});

test('mapCodexItem: local_shell_call (source-only variant) -> recognized as tool_result, text unverified', () => {
  const result = mapCodexItem({ type: 'local_shell_call', status: 'completed', action: {} });
  assert.equal(result.role, 'tool_result');
});

test('redact: every REDACTIONS pattern fires, ordinary text untouched', () => {
  assert.equal(
    redact('-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----'),
    '[REDACTED:private-key]',
  );
  assert.equal(redact('key=sk-ant-abc123defghijklmnopqrstuvwx'), 'key=[REDACTED:anthropic-key]');
  assert.equal(redact('key=sk-abcdefghijklmnopqrstuvwxyz123456'), 'key=[REDACTED:openai-key]');
  assert.equal(redact('id=AKIAIOSFODNN7EXAMPLE'), 'id=[REDACTED:aws-key]');
  assert.equal(redact(`tok=ghp_${'a'.repeat(40)}`), 'tok=[REDACTED:github-token]');
  assert.equal(redact('slack=xoxb-1234567890-abcdefghij'), 'slack=[REDACTED:slack-token]');
  assert.equal(redact('oauth=ya29.abcdefghij'), 'oauth=[REDACTED:google-oauth]');
  assert.equal(
    redact(
      'jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dQw4w9WgXcQ',
    ),
    'jwt=[REDACTED:jwt]',
  );
  assert.equal(redact('password=hunter2secret1234567'), 'password=[REDACTED:generic-secret]');

  assert.equal(redact('the meeting is at 10:00'), 'the meeting is at 10:00');
});

test('redact: catches space-separated Authorization Bearer headers', () => {
  const out = redact('Authorization: Bearer myFreshBearerTokenValue12345 end');
  assert.ok(!out.includes('myFreshBearerTokenValue12345'), out);
  assert.ok(out.includes('[REDACTED:bearer-token]'), out);
  assert.equal(redact('the bearer of this letter is trusted'), 'the bearer of this letter is trusted');
});

test('parse: per-message char cap truncates and sets truncated', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-transcripts-'));
  const filePath = path.join(dir, 'huge.jsonl');
  const bigText = 'a'.repeat(5000);
  const line = JSON.stringify({
    type: 'user',
    sessionId: 'sess-huge',
    cwd: '/home/ada/proj',
    timestamp: '2026-01-01T10:00:00.000Z',
    message: { role: 'user', content: bigText },
  });
  fs.writeFileSync(filePath, `${line}\n`);

  const extract = parse({ harness: 'claude', path: filePath });

  assert.equal(extract.truncated, true);
  assert.equal(extract.messages.length, 1);
  assert.equal(extract.messages[0].text.startsWith('a'.repeat(4000)), true);
  assert.match(extract.messages[0].text, /\n…\[truncated 1000 chars\]$/);
});

test('parse: message-count cap keeps the last MAX_MESSAGES messages', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-transcripts-'));
  const filePath = path.join(dir, 'many.jsonl');
  const lines = [];
  const total = 2005;
  for (let i = 0; i < total; i += 1) {
    lines.push(
      JSON.stringify({
        type: 'user',
        sessionId: 'sess-many',
        cwd: '/home/ada/proj',
        timestamp: `2026-01-01T10:00:${String(i % 60).padStart(2, '0')}.000Z`,
        message: { role: 'user', content: `msg-${i}` },
      }),
    );
  }
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);

  const extract = parse({ harness: 'claude', path: filePath });

  assert.equal(extract.truncated, true);
  assert.equal(extract.messages.length, 2000);
  assert.equal(extract.messages[0].text, 'msg-5');
  assert.equal(extract.messages[extract.messages.length - 1].text, `msg-${total - 1}`);
});

test('discover: finds files under both harness layouts, honors since, missing dirs -> []', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-transcripts-'));
  const claudeDir = path.join(root, 'claude');
  const codexDir = path.join(root, 'codex');
  const paths = { claudeDir, codexDir };

  fs.mkdirSync(path.join(claudeDir, 'projects', 'p1'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'projects', 'p1', 'a.jsonl'), '{}\n');

  fs.mkdirSync(path.join(codexDir, 'sessions', '2026', '01', '01'), { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'sessions', '2026', '01', '01', 'rollout-x.jsonl'), '{}\n');

  const all = discover(paths, { since: null });
  assert.equal(all.length, 2);
  const harnesses = all.map((e) => e.harness).sort();
  assert.deepEqual(harnesses, ['claude', 'codex']);

  const future = discover(paths, { since: Date.now() + 1000 });
  assert.deepEqual(future, []);

  const missing = discover({ claudeDir: path.join(root, 'nope-claude'), codexDir: path.join(root, 'nope-codex') }, { since: null });
  assert.deepEqual(missing, []);
});

test('rebaseInvocations: shifts survivors and drops fallen-off invocations', () => {
  const inv = [
    { skill: 'a', index: 1, resultIndex: 2, errored: false },   // dropped: 1-5 < 0
    { skill: 'b', index: 7, resultIndex: 8, errored: false },   // survives → 2, 3
    { skill: 'c', index: 9, resultIndex: null, errored: false },// survives → 4, null result kept
  ];
  assert.deepEqual(rebaseInvocations(inv, 5), [
    { skill: 'b', index: 2, resultIndex: 3, errored: false },
    { skill: 'c', index: 4, resultIndex: null, errored: false },
  ]);
});

test('parse: skill_invocations are rebased to the retained messages under the cap', () => {
  // Build a transcript with >MAX_MESSAGES leading text turns, then ONE Skill
  // invocation + its result as the final events. After the front-truncation the
  // surviving invocation's index/resultIndex must point at the retained tail.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-cap-'));
  const p = path.join(dir, 'big.jsonl');
  const lines = [];
  const pad = MAX_MESSAGES + 5; // this many leading user text messages
  for (let i = 0; i < pad; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:00.000Z', message: { role: 'user', content: `pad ${i}` } }));
  }
  lines.push(JSON.stringify({ type: 'assistant', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'run it' }, { type: 'tool_use', id: 'toolu_z', name: 'Skill', input: { skill: 'foo' } }] } }));
  lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:02.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_z', is_error: false, content: [{ type: 'text', text: 'done' }] }] } }));
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const extract = parse({ harness: 'claude', path: p });
  assert.equal(extract.messages.length, MAX_MESSAGES);
  assert.equal(extract.skill_invocations.length, 1);
  const si = extract.skill_invocations[0];
  // Rebased onto the retained tail: index/resultIndex are in-range and the paired
  // result lands on the real 'done' tool_result (not a stale raw offset).
  assert.ok(Number.isInteger(si.index) && si.index >= 0 && si.index < MAX_MESSAGES);
  assert.ok(Number.isInteger(si.resultIndex) && si.resultIndex < MAX_MESSAGES);
  assert.equal(extract.messages[si.resultIndex].text, 'done');
});

test('parse: under the cap, a trailing Skill invocation with no later message is dropped (right edge)', () => {
  // A transcript exceeding MAX_MESSAGES whose FINAL raw event is a Skill
  // tool_use (no paired result, no later message): its raw index equals the
  // raw messages length, so after rebasing it would equal MAX_MESSAGES —
  // outside the retained array. It must be dropped while an earlier rebased
  // invocation survives.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-cap-edge-'));
  const p = path.join(dir, 'edge.jsonl');
  const lines = [];
  const pad = MAX_MESSAGES + 5;
  for (let i = 0; i < pad; i++) {
    lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:00.000Z', message: { role: 'user', content: `pad ${i}` } }));
  }
  lines.push(JSON.stringify({ type: 'assistant', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:01.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'run it' }, { type: 'tool_use', id: 'toolu_z', name: 'Skill', input: { skill: 'foo' } }] } }));
  lines.push(JSON.stringify({ type: 'user', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:02.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_z', is_error: false, content: [{ type: 'text', text: 'done' }] }] } }));
  // Final event: assistant turn carrying a Skill tool_use, nothing after it.
  lines.push(JSON.stringify({ type: 'assistant', sessionId: 's', cwd: '/x', timestamp: '2026-02-01T00:00:03.000Z', message: { role: 'assistant', content: [{ type: 'text', text: 'tail' }, { type: 'tool_use', id: 'toolu_y', name: 'Skill', input: { skill: 'bar' } }] } }));
  fs.writeFileSync(p, lines.join('\n') + '\n');
  const extract = parse({ harness: 'claude', path: p });
  assert.equal(extract.messages.length, MAX_MESSAGES);
  // Only 'foo' survives; the trailing 'bar' (rebased index === MAX_MESSAGES) is dropped.
  assert.deepEqual(extract.skill_invocations.map((si) => si.skill), ['foo']);
  const si = extract.skill_invocations[0];
  assert.ok(si.index >= 0 && si.index < MAX_MESSAGES);
  assert.ok(si.resultIndex >= 0 && si.resultIndex < MAX_MESSAGES);
  assert.equal(extract.messages[si.resultIndex].text, 'done');
});

// ── WP-118: bounded streaming intake ────────────────────────────────────────

test('parseWithOutcome: oversized record → no message, session kept, truncated (Claude)', () => {
  // Tiny checked-in fixture; the test expands the @@PAD@@ placeholder past
  // MAX_LINE_BYTES at write time so the repo stays lean (spec fixtures note).
  const template = fs.readFileSync(path.join(fixturesDir, 'claude-oversized-record.jsonl'), 'utf8');
  const expanded = template.replace('@@PAD@@', 'x'.repeat(Limits.MAX_LINE_BYTES));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-oversize-'));
  const p = path.join(dir, 'oversize.jsonl');
  fs.writeFileSync(p, expanded);
  const size = fs.statSync(p).size;

  const { extract, parse: outcome } = parseWithOutcome({ harness: 'claude', path: p, size }, newRunBudget());

  assert.equal(outcome.outcome, 'ok');
  assert.equal(outcome.oversizedRecords, 1);
  assert.equal(extract.truncated, true);
  assert.deepEqual(
    extract.messages.map((m) => m.text),
    ['before the bomb', 'after the bomb'],
  );
  assert.deepEqual(extract.skill_invocations, []);
});

test('parseWithOutcome: oversized record → no message, session kept, truncated (Codex)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-oversize-cx-'));
  const p = path.join(dir, 'rollout-oversize.jsonl');
  const pad = 'x'.repeat(Limits.MAX_LINE_BYTES);
  const lines = [
    JSON.stringify({ type: 'session_meta', payload: { id: 'cx-1', timestamp: '2026-01-02T00:00:00.000Z', cwd: '/w' } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi codex' }] } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'custom_tool_call_output', content: [{ type: 'input_text', text: pad }] } }),
    JSON.stringify({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done codex' }] } }),
  ];
  fs.writeFileSync(p, `${lines.join('\n')}\n`);
  const size = fs.statSync(p).size;

  const { extract, parse: outcome } = parseWithOutcome({ harness: 'codex', path: p, size }, newRunBudget());

  assert.equal(outcome.outcome, 'ok');
  assert.equal(outcome.oversizedRecords, 1);
  assert.equal(extract.truncated, true);
  assert.equal(extract.session_id, 'cx-1');
  assert.deepEqual(
    extract.messages.map((m) => m.text),
    ['hi codex', 'done codex'],
  );
});

test('parseWithOutcome: over-ceiling file → valid empty extract + quarantine signal, never read', () => {
  // The path does not exist: any open attempt would yield read-error, so the
  // over-ceiling outcome proves the file was never opened.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-ceiling-'));
  const ghost = path.join(dir, 'ghost.jsonl');
  const entry = { harness: 'claude', path: ghost, size: Limits.PRE_READ_CEILING_BYTES + 1 };

  const { extract, parse: outcome } = parseWithOutcome(entry, newRunBudget());

  assert.equal(outcome.outcome, 'over-ceiling');
  assert.deepEqual(extract.messages, []);
  assert.equal(extract.truncated, true);
  assert.equal(extract.session_id, 'ghost');
  assert.equal(extract.harness, 'claude');
});

test('parseWithOutcome: drained run budget → deferred (outcome ok), not quarantine', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-budget-'));
  const p = path.join(dir, 'a.jsonl');
  fs.writeFileSync(
    p,
    `${JSON.stringify({ type: 'user', sessionId: 's', message: { role: 'user', content: 'hello' } })}\n`,
  );
  const entry = { harness: 'claude', path: p, size: fs.statSync(p).size };

  const { extract, parse: outcome } = parseWithOutcome(entry, { remaining: 0 });

  assert.equal(outcome.outcome, 'ok');
  assert.equal(outcome.runExhausted, true);
  assert.deepEqual(extract.messages, []);
  assert.equal(extract.truncated, true);
});

test('parse: deeply-nested JSON line is skipped, surrounding lines still parse, no throw', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-deep-'));
  const p = path.join(dir, 'deep.jsonl');
  const deep = '['.repeat(Limits.MAX_JSON_DEPTH + 36) + ']'.repeat(Limits.MAX_JSON_DEPTH + 36);
  const lines = [
    JSON.stringify({ type: 'user', sessionId: 's', message: { role: 'user', content: 'one' } }),
    deep,
    JSON.stringify({ type: 'user', sessionId: 's', message: { role: 'user', content: 'two' } }),
  ];
  fs.writeFileSync(p, `${lines.join('\n')}\n`);

  const extract = parse({ harness: 'claude', path: p }); // no size → back-compat stat path

  assert.deepEqual(extract.messages.map((m) => m.text), ['one', 'two']);
});

test('parse: invalid-UTF-8 line is skipped, surrounding lines still parse, no throw', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-utf8-'));
  const p = path.join(dir, 'bad.jsonl');
  const good1 = Buffer.from(`${JSON.stringify({ type: 'user', sessionId: 's', message: { role: 'user', content: 'one' } })}\n`);
  const garbage = Buffer.from([0xff, 0xfe, 0x80, 0x81]);
  const good2 = Buffer.from(`\n${JSON.stringify({ type: 'user', sessionId: 's', message: { role: 'user', content: 'two' } })}\n`);
  fs.writeFileSync(p, Buffer.concat([good1, garbage, good2]));

  const extract = parse({ harness: 'claude', path: p });

  assert.deepEqual(extract.messages.map((m) => m.text), ['one', 'two']);
});

test('discover: records size, dev, ino on every entry (both harnesses)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-disc-meta-'));
  const claudeDir = path.join(root, 'claude');
  const codexDir = path.join(root, 'codex');
  fs.mkdirSync(path.join(claudeDir, 'projects', 'p1'), { recursive: true });
  fs.writeFileSync(path.join(claudeDir, 'projects', 'p1', 'a.jsonl'), '{}\n');
  fs.mkdirSync(path.join(codexDir, 'sessions', '2026', '01', '01'), { recursive: true });
  fs.writeFileSync(path.join(codexDir, 'sessions', '2026', '01', '01', 'rollout-x.jsonl'), '{}\n');

  const all = discover({ claudeDir, codexDir }, { since: null });

  assert.equal(all.length, 2);
  for (const e of all) {
    assert.ok(Number.isFinite(e.size) && e.size > 0, `size on ${e.harness}`);
    assert.ok(Number.isFinite(e.dev), `dev on ${e.harness}`);
    assert.ok(Number.isFinite(e.ino) && e.ino > 0, `ino on ${e.harness}`);
  }
  const claudeEntry = all.find((e) => e.harness === 'claude');
  assert.equal(claudeEntry.size, 3); // '{}\n'
});

test('parse: back-compat — equals parseWithOutcome(entry, fresh budget).extract', () => {
  const inputPath = path.join(fixturesDir, 'claude-session.jsonl');
  const viaOld = parse({ harness: 'claude', path: inputPath });
  const viaNew = parseWithOutcome({ harness: 'claude', path: inputPath }, newRunBudget());
  assert.deepEqual(viaOld, viaNew.extract);
  assert.equal(viaNew.parse.outcome, 'ok');
  assert.equal(viaOld.parse, undefined); // parse() returns a bare Extract
});
