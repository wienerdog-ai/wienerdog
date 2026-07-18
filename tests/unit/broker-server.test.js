'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PassThrough } = require('node:stream');
const { spawn } = require('node:child_process');

const { runBrokerServer } = require('../../src/gws/broker/server');
const {
  BROKER_SERVER_NAME,
  SUPPORTED_PROTOCOL_VERSIONS,
  CAPABILITY_CLASS,
} = require('../../src/gws/broker/constants');

const repoRoot = path.join(__dirname, '..', '..');
const bin = path.join(repoRoot, 'bin', 'wienerdog.js');

// Golden handshake frames MEASURED against the real client (SPIKE-mcp-framing,
// 2026-07-18, Claude Code 2.1.214): these pin OUR implementation; if these stay
// green while the live handshake breaks, the protocol drifted upstream.
const GOLDEN_INITIALIZE = {
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: { roots: { listChanged: true }, elicitation: {} },
    clientInfo: {
      name: 'claude-code',
      title: 'Claude Code',
      version: '2.1.214',
      description: "Anthropic's agentic coding tool",
      websiteUrl: 'https://claude.com/claude-code',
    },
  },
  jsonrpc: '2.0',
  id: 0,
};
const GOLDEN_INITIALIZED = { method: 'notifications/initialized', jsonrpc: '2.0' };
const GOLDEN_TOOLS_LIST = { method: 'tools/list', jsonrpc: '2.0', id: 1 };
const GOLDEN_TOOLS_CALL = {
  method: 'tools/call',
  params: {
    name: 'echo',
    arguments: { text: 'hello' },
    _meta: { 'claudecode/toolUseId': 'toolu_x', progressToken: 2 },
  },
  jsonrpc: '2.0',
  id: 2,
};

/** A fake BrokerRegistry recording every dispatch. */
function fakeRegistry() {
  const calls = [];
  return {
    calls,
    listTools: () => [
      { name: 'echo', description: 'echo text back', inputSchema: { type: 'object' } },
    ],
    callTool: async (name, args) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: `echo:${args.text}` }] };
    },
  };
}

/** Start a server on in-memory streams; returns helpers to drive/inspect it. */
function startServer(registry) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const responses = [];
  let lineBuf = '';
  stdout.on('data', (chunk) => {
    lineBuf += chunk.toString('utf8');
    let nl;
    while ((nl = lineBuf.indexOf('\n')) !== -1) {
      responses.push(JSON.parse(lineBuf.slice(0, nl)));
      lineBuf = lineBuf.slice(nl + 1);
    }
  });
  const done = runBrokerServer({ registry, stdin, stdout });
  const send = (msg) => stdin.write(`${JSON.stringify(msg)}\n`);
  const settle = () => new Promise((r) => setImmediate(r));
  return { stdin, stdout, responses, done, send, settle };
}

/** Drive the golden initialize handshake to completion. */
async function handshake(s) {
  s.send(GOLDEN_INITIALIZE);
  s.send(GOLDEN_INITIALIZED);
  await s.settle();
}

test('broker-server: constants expose the four capability classes and a supported-version set', () => {
  assert.deepEqual(Object.keys(CAPABILITY_CLASS).sort(), ['CALENDAR_WRITE', 'DRAFT', 'READ', 'SEND']);
  assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-11-25'));
  assert.equal(typeof BROKER_SERVER_NAME, 'string');
});

test('broker-server: initialize answers the golden frame with pinned version, tools capability, server info', async () => {
  const s = startServer(fakeRegistry());
  await handshake(s);
  assert.equal(s.responses.length, 1, 'one reply: the notification is never answered');
  const r = s.responses[0];
  assert.equal(r.jsonrpc, '2.0');
  assert.equal(r.id, 0);
  assert.equal(r.result.protocolVersion, '2025-11-25');
  assert.deepEqual(r.result.capabilities, { tools: {} });
  assert.equal(r.result.serverInfo.name, BROKER_SERVER_NAME);
  assert.equal(typeof r.result.serverInfo.version, 'string');
  s.stdin.end();
  await s.done;
});

test('broker-server: unsupported protocolVersion fails closed with the fixed mismatch error naming both versions', async () => {
  const s = startServer(fakeRegistry());
  s.send({ ...GOLDEN_INITIALIZE, params: { ...GOLDEN_INITIALIZE.params, protocolVersion: '1999-01-01' } });
  await s.settle();
  const r = s.responses[0];
  assert.ok(r.error, 'must be a JSON-RPC error');
  assert.match(r.error.message, /MCP protocol version mismatch/);
  assert.match(r.error.message, /1999-01-01/);
  assert.match(r.error.message, /2025-11-25/);
  await s.done; // fail closed: the server stops serving
});

test('broker-server: tools/list returns the injected registry tools', async () => {
  const s = startServer(fakeRegistry());
  await handshake(s);
  s.send(GOLDEN_TOOLS_LIST);
  await s.settle();
  const r = s.responses[1];
  assert.equal(r.id, 1);
  assert.equal(r.result.tools.length, 1);
  assert.equal(r.result.tools[0].name, 'echo');
});

test('broker-server: tools/call dispatches to the registry, tolerating the extra _meta field', async () => {
  const reg = fakeRegistry();
  const s = startServer(reg);
  await handshake(s);
  s.send(GOLDEN_TOOLS_CALL);
  await s.settle();
  const r = s.responses[1];
  assert.equal(r.id, 2);
  assert.deepEqual(r.result.content, [{ type: 'text', text: 'echo:hello' }]);
  assert.deepEqual(reg.calls, [{ name: 'echo', args: { text: 'hello' } }]);
});

test('broker-server: unknown tool → -32601, ZERO side effect on the registry', async () => {
  const reg = fakeRegistry();
  const s = startServer(reg);
  await handshake(s);
  s.send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'shell', arguments: {} } });
  await s.settle();
  const r = s.responses[1];
  assert.equal(r.error.code, -32601);
  assert.equal(reg.calls.length, 0, 'unknown tool must never reach callTool');
});

test('broker-server: a throwing verb maps to a fixed secret-free error, never the raw message', async () => {
  const reg = fakeRegistry();
  reg.callTool = async () => {
    throw new Error('token ya29.SECRET leaked in stack');
  };
  const s = startServer(reg);
  await handshake(s);
  s.send(GOLDEN_TOOLS_CALL);
  await s.settle();
  const r = s.responses[1];
  assert.ok(r.error);
  assert.ok(!JSON.stringify(r).includes('SECRET'), 'raw error must not surface');
});

test('broker-server: unknown method → -32601; request without method → -32600; notifications never answered', async () => {
  const s = startServer(fakeRegistry());
  await handshake(s);
  s.send({ jsonrpc: '2.0', id: 6, method: 'resources/list' });
  s.send({ jsonrpc: '2.0', id: 7 });
  s.send({ jsonrpc: '2.0', method: 'notifications/cancelled' });
  await s.settle();
  assert.equal(s.responses.length, 3, 'two errors + initialize; notifications unanswered');
  assert.equal(s.responses[1].error.code, -32601);
  assert.equal(s.responses[2].error.code, -32600);
});

test('broker-server: garbage BEFORE the handshake yields the distinct framing-drift error', async () => {
  const s = startServer(fakeRegistry());
  s.stdin.write('NOT JSON AT ALL\n');
  await s.settle();
  const r = s.responses[0];
  assert.equal(r.error.code, -32700);
  assert.match(r.error.message, /framing not recognized/);
  assert.match(r.error.message, /possible MCP protocol change/);
  await s.done;
});

test('broker-server: garbage AFTER the handshake yields the generic parse error, not the drift error', async () => {
  const s = startServer(fakeRegistry());
  await handshake(s);
  s.stdin.write('{{{{\n');
  await s.settle();
  const r = s.responses[1];
  assert.equal(r.error.code, -32700);
  assert.ok(!/framing not recognized/.test(r.error.message));
  await s.done;
});

test('broker-server: resolves on stdin EOF and reports exit code via the onExit seam', async () => {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let exitCode = null;
  const done = runBrokerServer({
    registry: fakeRegistry(),
    stdin,
    stdout,
    onExit: (code) => {
      exitCode = code;
    },
  });
  stdin.end();
  await done;
  assert.equal(exitCode, 0);
});

test('broker-server: `wienerdog gws _broker` speaks the handshake over real stdio and exits on EOF', async () => {
  // Since WP-141 the entry assembles the REAL registry for a known routine
  // (an isolated temp core: no credentials → verbs advertise but refuse).
  const os = require('node:os');
  const fs = require('node:fs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-brokercli-'));
  const child = spawn(process.execPath, [bin, 'gws', '_broker', '--routine', 'daily-digest'], {
    env: { ...process.env, HOME: root, WIENERDOG_HOME: path.join(root, 'wd') },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout.on('data', (c) => {
    out += c.toString('utf8');
  });
  child.stdin.write(`${JSON.stringify(GOLDEN_INITIALIZE)}\n`);
  child.stdin.write(`${JSON.stringify(GOLDEN_INITIALIZED)}\n`);
  child.stdin.write(`${JSON.stringify(GOLDEN_TOOLS_LIST)}\n`);
  child.stdin.end();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 0);
  const replies = out
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.equal(replies.length, 2, 'initialize + tools/list replies, nothing else on stdout');
  assert.equal(replies[0].result.protocolVersion, '2025-11-25');
  assert.equal(replies[0].result.serverInfo.name, BROKER_SERVER_NAME);
  assert.ok(replies[1].result.tools.length >= 8, 'the real WP-137 registry is advertised');
});

test('broker-server: `gws _broker` stays hidden — absent from `wienerdog help` output', async () => {
  const child = spawn(process.execPath, [bin, 'help'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => {
    out += c.toString('utf8');
  });
  await new Promise((resolve) => child.on('close', resolve));
  assert.ok(!out.includes('_broker'));
});
