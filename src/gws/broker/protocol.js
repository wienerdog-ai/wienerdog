'use strict';

// Framed JSON-RPC 2.0 transport for the GWS broker's MCP stdio channel
// (WP-136, ADR-0026). Framing is PINNED to newline-delimited JSON-RPC —
// measured against the real Claude Code client (SPIKE-mcp-framing, 2026-07-18,
// Claude Code 2.1.214): one JSON object per \n-terminated line, no LSP-style
// Content-Length headers, multiple messages per read chunk. To swap framings,
// replace this module only — server.js sees parsed objects either way.

/**
 * Hard upper bound for a single framed message. An input line that grows past
 * this is a protocol violation or an attack, never legitimate traffic: the
 * reader fails closed instead of buffering unboundedly.
 */
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

/**
 * Read newline-framed JSON-RPC messages from `stream`, invoking
 * `onMessage(obj)` once per parsed message object. Reassembles messages split
 * across read chunks and delivers multiple messages arriving in one chunk.
 *
 * Fail-closed: a non-JSON / non-object line reports `{kind:'parse'}`, a line
 * exceeding MAX_MESSAGE_BYTES reports `{kind:'oversize'}` — in both cases the
 * reader closes and ignores all further input (the caller answers with a
 * JSON-RPC parse error and drops the connection).
 *
 * @param {NodeJS.ReadableStream} stream
 * @param {(msg: object) => void} onMessage
 * @param {(err: {kind: 'parse'|'oversize'}) => void} [onError]
 * @returns {{close(): void}}
 */
function readMessages(stream, onMessage, onError) {
  let buffer = Buffer.alloc(0);
  let closed = false;

  const fail = (kind) => {
    close();
    if (onError) onError({ kind });
  };

  const onData = (chunk) => {
    if (closed) return;
    buffer = Buffer.concat([buffer, chunk]);
    let nl;
    while (!closed && (nl = buffer.indexOf(0x0a)) !== -1) {
      const line = buffer.subarray(0, nl);
      buffer = buffer.subarray(nl + 1);
      if (line.length === 0) continue;
      if (line.length > MAX_MESSAGE_BYTES) {
        fail('oversize');
        return;
      }
      let msg;
      try {
        msg = JSON.parse(line.toString('utf8'));
      } catch {
        fail('parse');
        return;
      }
      if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
        fail('parse');
        return;
      }
      onMessage(msg);
    }
    if (!closed && buffer.length > MAX_MESSAGE_BYTES) fail('oversize');
  };

  function close() {
    if (closed) return;
    closed = true;
    buffer = Buffer.alloc(0);
    stream.removeListener('data', onData);
  }

  stream.on('data', onData);
  return { close };
}

/**
 * Serialize + frame one JSON-RPC message to `stream` (one JSON line).
 * @param {NodeJS.WritableStream} stream
 * @param {object} msg
 */
function writeMessage(stream, msg) {
  stream.write(`${JSON.stringify(msg)}\n`);
}

module.exports = { readMessages, writeMessage, MAX_MESSAGE_BYTES };
