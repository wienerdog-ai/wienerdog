'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const {
  readMessages,
  writeMessage,
  MAX_MESSAGE_BYTES,
} = require('../../src/gws/broker/protocol');

/** Collect messages/errors from readMessages on a fresh PassThrough. */
function collector() {
  const stream = new PassThrough();
  const messages = [];
  const errors = [];
  const reader = readMessages(
    stream,
    (msg) => messages.push(msg),
    (err) => errors.push(err)
  );
  return { stream, messages, errors, reader };
}

test('broker-protocol: writeMessage → readMessages round-trips one JSON-RPC message', async () => {
  const { stream, messages, errors } = collector();
  const msg = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  writeMessage(stream, msg);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(messages, [msg]);
  assert.equal(errors.length, 0);
});

test('broker-protocol: writeMessage frames as one newline-terminated JSON line', () => {
  const stream = new PassThrough();
  writeMessage(stream, { jsonrpc: '2.0', id: 7, result: {} });
  const raw = stream.read().toString('utf8');
  assert.ok(raw.endsWith('\n'), 'frame must end with \\n');
  assert.ok(!raw.includes('Content-Length'), 'no LSP-style headers');
  assert.deepEqual(JSON.parse(raw), { jsonrpc: '2.0', id: 7, result: {} });
});

test('broker-protocol: multiple messages in a single chunk are all delivered (measured Claude Code behavior)', async () => {
  const { stream, messages } = collector();
  // SPIKE-mcp-framing: notifications/initialized + tools/list arrived in ONE chunk.
  const a = { method: 'notifications/initialized', jsonrpc: '2.0' };
  const b = { method: 'tools/list', jsonrpc: '2.0', id: 1 };
  stream.write(`${JSON.stringify(a)}\n${JSON.stringify(b)}\n`);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(messages, [a, b]);
});

test('broker-protocol: a message split across chunk boundaries reassembles', async () => {
  const { stream, messages } = collector();
  const msg = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'echo' } };
  const line = `${JSON.stringify(msg)}\n`;
  stream.write(line.slice(0, 10));
  await new Promise((r) => setImmediate(r));
  assert.equal(messages.length, 0, 'no message before the newline arrives');
  stream.write(line.slice(10));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(messages, [msg]);
});

test('broker-protocol: a garbage (non-JSON) line reports a parse error, no message', async () => {
  const { stream, messages, errors } = collector();
  stream.write('this is not json\n');
  await new Promise((r) => setImmediate(r));
  assert.equal(messages.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].kind, 'parse');
});

test('broker-protocol: an oversized frame fails closed without buffering it whole', async () => {
  const { stream, messages, errors } = collector();
  assert.ok(MAX_MESSAGE_BYTES >= 1024 * 1024, 'bound exists and is sane');
  // Feed > MAX bytes with no newline: must error out mid-stream, not buffer forever.
  const chunk = Buffer.alloc(1024 * 1024, 0x61); // 1 MB of 'a'
  const chunks = Math.ceil(MAX_MESSAGE_BYTES / chunk.length) + 1;
  for (let i = 0; i < chunks && errors.length === 0; i++) {
    stream.write(chunk);
    await new Promise((r) => setImmediate(r));
  }
  assert.equal(messages.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].kind, 'oversize');
});

test('broker-protocol: after an error the reader is closed — later valid frames are ignored', async () => {
  const { stream, messages, errors } = collector();
  stream.write('garbage\n');
  await new Promise((r) => setImmediate(r));
  assert.equal(errors.length, 1);
  stream.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/list' })}\n`);
  await new Promise((r) => setImmediate(r));
  assert.equal(messages.length, 0, 'connection dropped fail-closed');
});

test('broker-protocol: close() stops delivery', async () => {
  const { stream, messages, reader } = collector();
  reader.close();
  stream.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' })}\n`);
  await new Promise((r) => setImmediate(r));
  assert.equal(messages.length, 0);
});

test('broker-protocol: non-object JSON lines (arrays/scalars) report parse errors', async () => {
  const { stream, messages, errors } = collector();
  stream.write('[1,2,3]\n');
  await new Promise((r) => setImmediate(r));
  assert.equal(messages.length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].kind, 'parse');
});
