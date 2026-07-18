'use strict';

// The broker's MCP server loop (WP-136, ADR-0026): PURE transport. It speaks
// exactly three MCP methods (initialize / tools/list / tools/call) over the
// newline-framed JSON-RPC channel and dispatches to an INJECTED verb registry.
// It never loads a credential, never exposes a generic or pass-through method,
// and writes nothing to stdout but framed JSON-RPC.

const { readMessages, writeMessage } = require('./protocol');
const { BROKER_SERVER_NAME, SUPPORTED_PROTOCOL_VERSIONS } = require('./constants');

const BROKER_SERVER_VERSION = require('../../../package.json').version;

/**
 * @typedef {Object} BrokerRegistry
 * @property {() => Array<{name:string, description:string, inputSchema:object}>} listTools
 * @property {(name:string, args:object) => Promise<{content:Array<{type:'text',text:string}>}>} callTool
 */

/**
 * Run the broker MCP server until stdin EOF. Resolves when the channel closes
 * (normal end-of-job) or after a fail-closed protocol error; the process then
 * exits — exit-on-stdin-EOF is the SOLE orphan guard when the parent is
 * SIGKILLed (SPIKE-stdio-lifecycle) and is load-bearing for ADR-0004.
 *
 * @param {{ registry: BrokerRegistry, stdin?: NodeJS.ReadableStream,
 *           stdout?: NodeJS.WritableStream, onExit?: (code:number)=>void }} opts
 * @returns {Promise<void>}
 */
async function runBrokerServer(opts) {
  const { registry, stdin = process.stdin, stdout = process.stdout, onExit } = opts;

  let initialized = false;

  await new Promise((resolve) => {
    let settled = false;
    /** @param {number} code */
    const finish = (code) => {
      if (settled) return;
      settled = true;
      reader.close();
      if (onExit) onExit(code);
      resolve(undefined);
    };

    /** @param {*} id @param {number} code @param {string} message */
    const replyError = (id, code, message) => {
      writeMessage(stdout, { jsonrpc: '2.0', id: id === undefined ? null : id, error: { code, message } });
    };

    /** @param {object} msg */
    const handle = async (msg) => {
      const { id, method, params } = msg;
      const isRequest = id !== undefined && id !== null;

      if (typeof method !== 'string') {
        // Never answer a malformed notification; a malformed request gets -32600.
        if (isRequest) replyError(id, -32600, 'invalid request');
        return;
      }

      if (method.startsWith('notifications/')) return; // never answer a notification

      switch (method) {
        case 'initialize': {
          const requested =
            params && typeof params.protocolVersion === 'string' ? params.protocolVersion : '(none)';
          if (!SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
            // The primary in-band protocol-drift signal: fixed, distinct,
            // secret-free, names both versions, then fail closed.
            const message =
              `MCP protocol version mismatch: client ${requested}, ` +
              `broker supports ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')}`;
            process.stderr.write(`wienerdog broker: ${message}\n`);
            if (isRequest) replyError(id, -32602, message);
            finish(1);
            return;
          }
          initialized = true;
          if (isRequest) {
            writeMessage(stdout, {
              jsonrpc: '2.0',
              id,
              result: {
                protocolVersion: requested,
                capabilities: { tools: {} },
                serverInfo: { name: BROKER_SERVER_NAME, version: BROKER_SERVER_VERSION },
              },
            });
          }
          return;
        }
        case 'tools/list': {
          if (isRequest) writeMessage(stdout, { jsonrpc: '2.0', id, result: { tools: registry.listTools() } });
          return;
        }
        case 'tools/call': {
          if (!isRequest) return;
          const name = params && typeof params.name === 'string' ? params.name : null;
          const args =
            params && params.arguments !== null && typeof params.arguments === 'object'
              ? params.arguments
              : {};
          // Only tools the registry ADVERTISES are callable — the transport-level
          // "no raw client surface" guarantee. Unknown tool: error, zero side effect.
          if (name === null || !registry.listTools().some((t) => t.name === name)) {
            replyError(id, -32601, 'unknown tool');
            return;
          }
          try {
            const result = await registry.callTool(name, args);
            writeMessage(stdout, { jsonrpc: '2.0', id, result });
          } catch {
            // Fixed, secret-free message — never the raw error (it may carry a token).
            replyError(id, -32000, 'broker verb failed');
          }
          return;
        }
        default:
          replyError(id, -32601, 'method not found');
      }
    };

    const reader = readMessages(
      stdin,
      (msg) => {
        handle(msg);
      },
      (err) => {
        // Fail closed on framing errors, distinguishing "the protocol changed
        // under us" (pre-handshake) from "malformed traffic" (post-handshake).
        const message = !initialized
          ? 'framing not recognized — possible MCP protocol change'
          : err.kind === 'oversize'
            ? 'parse error: message exceeds size bound'
            : 'parse error';
        process.stderr.write(`wienerdog broker: ${message}\n`);
        replyError(null, -32700, message);
        finish(1);
      }
    );

    stdin.on('end', () => finish(0));
    stdin.on('close', () => finish(0));
  });
}

module.exports = { runBrokerServer };
