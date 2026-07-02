'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { discover, parse, redact } = require('../../src/core/transcripts');

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

test('parse: Codex golden extract matches fixture', () => {
  // UNVERIFIED against live Codex CLI — re-verify at M4 (WP-010)
  const inputPath = path.join(fixturesDir, 'codex-rollout.jsonl');
  const expected = JSON.parse(fs.readFileSync(path.join(fixturesDir, 'codex-rollout.expected.json'), 'utf8'));

  const extract = parse({ harness: 'codex', path: inputPath });

  assert.deepEqual(withoutSourcePath(extract), expected);
  assert.equal(extract.source_path, inputPath);
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
