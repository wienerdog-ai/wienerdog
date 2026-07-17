'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  Limits,
  newRunBudget,
  streamLines,
  maxJsonDepth,
  OVERSIZED_RECORD_MARKER,
} = require('../../src/core/transcripts/stream');

/** @returns {string} a fresh temp dir */
function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wd-stream-'));
}

/** Write `content` (string|Buffer) to a fresh temp file, return {p, size}. */
function writeTmp(content) {
  const p = path.join(tmpDir(), 'file.jsonl');
  fs.writeFileSync(p, content);
  return { p, size: fs.statSync(p).size };
}

test('streamLines: delivers lines in order, trailing newline yields no extra empty line', () => {
  const { p, size } = writeTmp('alpha\nbeta\ngamma\n');
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(result, { outcome: 'ok', lines: 3, oversizedRecords: 0, runExhausted: false });
});

test('streamLines: a trailing line with no final newline is delivered', () => {
  const { p, size } = writeTmp('alpha\nomega');
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['alpha', 'omega']);
  assert.equal(result.lines, 2);
  assert.equal(result.outcome, 'ok');
});

test('streamLines: empty lines are delivered and counted', () => {
  const { p, size } = writeTmp('a\n\nb\n');
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['a', '', 'b']);
  assert.equal(result.lines, 3);
});

test('streamLines: \\r\\n is handled — the \\r stays on the line', () => {
  const { p, size } = writeTmp('a\r\nb\r\n');
  const calls = [];
  streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['a\r', 'b\r']);
});

test('streamLines: a line spanning many read chunks is reassembled intact', () => {
  const long = 'y'.repeat(Limits.READ_CHUNK_BYTES * 3 + 17); // > 3 chunks, < MAX_LINE_BYTES
  const { p, size } = writeTmp(`first\n${long}\nlast\n`);
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.equal(calls.length, 3);
  assert.equal(calls[0], 'first');
  assert.equal(calls[1], long);
  assert.equal(calls[2], 'last');
  assert.deepEqual(result, { outcome: 'ok', lines: 3, oversizedRecords: 0, runExhausted: false });
});

test('streamLines: worked example — oversized middle line becomes the marker, session keeps going', () => {
  const oversized = 'z'.repeat(Limits.MAX_LINE_BYTES + 100);
  const { p, size } = writeTmp(`line one\n${oversized}\nline three\n`);
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['line one', OVERSIZED_RECORD_MARKER, 'line three']);
  assert.deepEqual(result, { outcome: 'ok', lines: 3, oversizedRecords: 1, runExhausted: false });
});

test('streamLines: a line of exactly MAX_LINE_BYTES is NOT oversized', () => {
  const exact = 'e'.repeat(Limits.MAX_LINE_BYTES);
  const { p, size } = writeTmp(`${exact}\n`);
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.equal(calls.length, 1);
  assert.equal(calls[0], exact);
  assert.equal(result.oversizedRecords, 0);
});

test('streamLines: an oversized final line with no trailing newline still yields the marker', () => {
  const oversized = 'z'.repeat(Limits.MAX_LINE_BYTES + 1);
  const { p, size } = writeTmp(`ok\n${oversized}`);
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, ['ok', OVERSIZED_RECORD_MARKER]);
  assert.deepEqual(result, { outcome: 'ok', lines: 2, oversizedRecords: 1, runExhausted: false });
});

test('streamLines: size over PRE_READ_CEILING_BYTES → over-ceiling, file NEVER opened', () => {
  // The path does not exist: any open attempt would surface as read-error,
  // so getting over-ceiling proves the ceiling check runs before openSync.
  const ghost = path.join(tmpDir(), 'ghost.jsonl');
  const calls = [];
  const result = streamLines(ghost, Limits.PRE_READ_CEILING_BYTES + 1, newRunBudget(), (t) => calls.push(t));
  assert.deepEqual(calls, []);
  assert.deepEqual(result, { outcome: 'over-ceiling', lines: 0, oversizedRecords: 0, runExhausted: false });
});

test('streamLines: unreadable file (within ceiling) → read-error', () => {
  const ghost = path.join(tmpDir(), 'ghost.jsonl');
  const result = streamLines(ghost, 10, newRunBudget(), () => {
    throw new Error('onLine must not be called');
  });
  assert.equal(result.outcome, 'read-error');
  assert.equal(result.lines, 0);
});

test('streamLines: stops with too-many-lines when MAX_LINES would be exceeded', () => {
  const { p, size } = writeTmp('{"n":1}\n'.repeat(Limits.MAX_LINES + 1));
  let calls = 0;
  const result = streamLines(p, size, newRunBudget(), () => {
    calls += 1;
  });
  assert.equal(result.outcome, 'too-many-lines');
  assert.equal(result.lines, Limits.MAX_LINES);
  assert.equal(calls, Limits.MAX_LINES);
});

test('streamLines: drained shared budget mid-file → outcome ok + runExhausted (deferred, not quarantine)', () => {
  // ~200 KB of lines, but only ~70 KB of run budget: streaming must stop
  // mid-file with the already-emitted lines kept.
  const line = 'q'.repeat(99); // 100 bytes with the newline
  const total = 2000;
  const { p, size } = writeTmp(`${line}\n`.repeat(total));
  const budget = { remaining: 70 * 1024 };
  const calls = [];
  const result = streamLines(p, size, budget, (t) => calls.push(t));
  assert.equal(result.outcome, 'ok');
  assert.equal(result.runExhausted, true);
  assert.ok(calls.length > 0 && calls.length < total, `delivered ${calls.length}`);
  assert.ok(budget.remaining <= 0);
});

test('streamLines: budget is shared across calls — an already-drained budget delivers nothing', () => {
  const { p, size } = writeTmp('a\nb\n');
  const budget = { remaining: 0 };
  const calls = [];
  const result = streamLines(p, size, budget, (t) => calls.push(t));
  assert.deepEqual(calls, []);
  assert.equal(result.outcome, 'ok');
  assert.equal(result.runExhausted, true);
});

test('streamLines: budget landing exactly on EOF (no trailing newline) → full read, final line delivered, NOT runExhausted', () => {
  // Review finding (WP-118): a binding budget always lands exactly on 0 because
  // reads are clamped to the remaining budget. When that coincides with EOF the
  // file WAS read in full — the trailing no-newline line must still be
  // delivered and the file must not be reported capacity-deferred.
  const { p, size } = writeTmp('aa\nbb\ncc'); // 8 bytes, no trailing newline
  const budget = { remaining: size };
  const calls = [];
  const result = streamLines(p, size, budget, (t) => calls.push(t));
  assert.deepEqual(calls, ['aa', 'bb', 'cc']);
  assert.deepEqual(result, { outcome: 'ok', lines: 3, oversizedRecords: 0, runExhausted: false });
  assert.equal(budget.remaining, 0);
});

test('streamLines: budget landing exactly on EOF (trailing newline) → NOT runExhausted', () => {
  const { p, size } = writeTmp('aa\nbb\ncc\n');
  const budget = { remaining: size };
  const calls = [];
  const result = streamLines(p, size, budget, (t) => calls.push(t));
  assert.deepEqual(calls, ['aa', 'bb', 'cc']);
  assert.deepEqual(result, { outcome: 'ok', lines: 3, oversizedRecords: 0, runExhausted: false });
  assert.equal(budget.remaining, 0);
});

test('streamLines: bytes read are subtracted from the shared budget', () => {
  const { p, size } = writeTmp('abc\ndef\n');
  const budget = newRunBudget();
  streamLines(p, size, budget, () => {});
  assert.equal(budget.remaining, Limits.MAX_RUN_BYTES - size);
});

test('streamLines: invalid UTF-8 bytes decode to U+FFFD, never throw', () => {
  const buf = Buffer.concat([
    Buffer.from('ok\n'),
    Buffer.from([0xff, 0xfe, 0x80]),
    Buffer.from('\nok2\n'),
  ]);
  const { p, size } = writeTmp(buf);
  const calls = [];
  const result = streamLines(p, size, newRunBudget(), (t) => calls.push(t));
  assert.equal(result.outcome, 'ok');
  assert.equal(calls.length, 3);
  assert.equal(calls[0], 'ok');
  assert.ok(calls[1].includes('�'));
  assert.equal(calls[2], 'ok2');
});

test('streamLines: oversized line is never buffered whole (constrained-heap child completes)', () => {
  // A ~40 MB single line under a 48 MB old-space heap: the whole-file / whole-line
  // approach (readFileSync + split) cannot survive this; the bounded streamer must.
  const dir = tmpDir();
  const big = path.join(dir, 'big.jsonl');
  const fd = fs.openSync(big, 'w');
  fs.writeSync(fd, '{"a":1}\n');
  const mb = Buffer.alloc(1024 * 1024, 0x78); // 'x'
  for (let i = 0; i < 40; i += 1) fs.writeSync(fd, mb);
  fs.writeSync(fd, '\n{"b":2}\n');
  fs.closeSync(fd);
  const size = fs.statSync(big).size;

  const streamPath = require.resolve('../../src/core/transcripts/stream');
  const script = [
    `const { streamLines, newRunBudget, OVERSIZED_RECORD_MARKER } = require(${JSON.stringify(streamPath)});`,
    'const calls = [];',
    `const res = streamLines(${JSON.stringify(big)}, ${size}, newRunBudget(), (t) => calls.push(t.length > 50 ? 'LONG' : t));`,
    'console.log(JSON.stringify({ res, calls }));',
  ].join('\n');
  const child = spawnSync(process.execPath, ['--max-old-space-size=48', '-e', script], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, `child failed: ${child.stderr}`);
  const out = JSON.parse(child.stdout);
  assert.deepEqual(out.calls, ['{"a":1}', OVERSIZED_RECORD_MARKER, '{"b":2}']);
  assert.deepEqual(out.res, { outcome: 'ok', lines: 3, oversizedRecords: 1, runExhausted: false });
});

test('maxJsonDepth: counts nesting, ignores brackets inside strings and escapes', () => {
  assert.equal(maxJsonDepth(''), 0);
  assert.equal(maxJsonDepth('"flat string"'), 0);
  assert.equal(maxJsonDepth('{"a":1}'), 1);
  assert.equal(maxJsonDepth('{"a":{"b":[1,2]}}'), 3);
  assert.equal(maxJsonDepth('{"a":"}}}]]][[[{{{"}'), 1);
  assert.equal(maxJsonDepth('{"a":"x\\"[","b":[]}'), 2);
  assert.equal(maxJsonDepth('['.repeat(100) + ']'.repeat(100)), 100);
});

test('maxJsonDepth: Limits.MAX_JSON_DEPTH boundary', () => {
  const atLimit = '['.repeat(Limits.MAX_JSON_DEPTH) + ']'.repeat(Limits.MAX_JSON_DEPTH);
  const overLimit = '['.repeat(Limits.MAX_JSON_DEPTH + 1) + ']'.repeat(Limits.MAX_JSON_DEPTH + 1);
  assert.equal(maxJsonDepth(atLimit), Limits.MAX_JSON_DEPTH);
  assert.ok(maxJsonDepth(overLimit) > Limits.MAX_JSON_DEPTH);
});

test('Limits: OWNER-APPROVED 2026-07-17 values', () => {
  assert.equal(Limits.PRE_READ_CEILING_BYTES, 50 * 1024 * 1024);
  assert.equal(Limits.MAX_LINE_BYTES, 1 * 1024 * 1024);
  assert.equal(Limits.MAX_LINES, 500000);
  assert.equal(Limits.MAX_RUN_BYTES, 200 * 1024 * 1024);
  assert.equal(Limits.READ_CHUNK_BYTES, 64 * 1024);
  assert.equal(Limits.MAX_JSON_DEPTH, 64);
  assert.deepEqual(newRunBudget(), { remaining: Limits.MAX_RUN_BYTES });
});
