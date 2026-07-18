'use strict';

// `wienerdog gws _broker [--routine <id>]` — the hidden per-job stdio broker
// entry Claude Code spawns as an MCP server (WP-136, D-BROKER-LAUNCH). Routed
// in bin/wienerdog.js BEFORE the gws dispatch: this entry is pure transport
// (no Google code, no credential, no capability), so the GWS_USE gate — which
// guards actual Google access — is checked by the verbs, not the channel.
//
// In THIS WP the registry is an EMPTY stub (zero tools): the entry is testable
// end-to-end but nothing is callable. Real verbs arrive with WP-137/138/141.
//
// stdout is the MCP channel — NOTHING may be written to it except framed
// JSON-RPC; every diagnostic goes to stderr.

const { runBrokerServer } = require('../gws/broker/server');

/** The WP-136 stub registry: advertises zero tools, so no call can dispatch. */
const EMPTY_REGISTRY = {
  listTools: () => [],
  callTool: async () => {
    throw new Error('no tools registered');
  },
};

/**
 * Parse the trusted launch descriptor out of argv. Only `--routine <id>` is
 * recognized (the WP-141 descriptor); it is parsed but unused in this WP.
 * Unknown flags are ignored — the broker must never die over an argv detail
 * mid-handshake.
 * @param {string[]} argv
 * @returns {{routine: string|null}}
 */
function parseArgs(argv) {
  let routine = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--routine') routine = argv[++i] ?? null;
  }
  return { routine };
}

/**
 * Run the broker until stdin EOF. Exits promptly on SIGINT/SIGTERM/SIGHUP —
 * together with exit-on-stdin-EOF this is the whole ADR-0004 no-orphan story
 * (SPIKE-stdio-lifecycle: a SIGKILLed parent delivers NO signal; only EOF).
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function run(argv) {
  parseArgs(argv);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => process.exit(0));
  }
  await runBrokerServer({ registry: EMPTY_REGISTRY });
}

module.exports = { run };
