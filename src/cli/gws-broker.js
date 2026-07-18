'use strict';

// `wienerdog gws _broker --routine <id>` — the hidden per-job stdio broker
// entry Claude Code spawns as an MCP server (WP-136 transport, WP-141 wiring).
// Routed in bin/wienerdog.js BEFORE the gws dispatch: the GWS_USE gate guards
// interactive Google CLI use; the broker's reachability is governed by the
// EXTERNAL_CONTENT_ROUTINE gate upstream (run-job refuses to compose a routine
// at all while it is BLOCKED), and the broker itself holds the credentials the
// model never sees.
//
// Identity comes from the TRUSTED LAUNCH DESCRIPTOR: the `--routine <id>` argv
// written into the per-routine broker-mcp config by Wienerdog code (closes
// audit F5). The broker never trusts WIENERDOG_JOB or any env for identity.
//
// stdout is the MCP channel — NOTHING may be written to it except framed
// JSON-RPC; every diagnostic goes to stderr.

const { getPaths } = require('../core/paths');
const { WienerdogError } = require('../core/errors');
const { runBrokerServer } = require('../gws/broker/server');
const { buildRegistry } = require('../gws/broker/registry');
const { VERBS } = require('../gws/broker/verbs');
const { loadCredentialServices } = require('../gws/broker/credentials');
const grantStore = require('../gws/broker/grant-store');

/**
 * Parse the trusted launch descriptor out of argv. Only `--routine <id>` is
 * recognized. Unknown flags are ignored — the broker must never die over an
 * argv detail mid-handshake.
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
 * Build one least-scope services view per METHOD from the per-class service
 * objects: reads route to the READ credential, drafts.create to DRAFT,
 * getProfile + messages.send to SEND. A method whose class credential was not
 * loaded simply does not exist — the verb fails closed. (No broker verb uses
 * CALENDAR_WRITE in v1; that class belongs to the interactive `cal add-event`.)
 * @param {Partial<Record<string, {gmail?:object, calendar?:object, drive?:object}>>} byClass
 * @returns {{gmail?:object, calendar?:object, drive?:object}}
 */
function compositeServices(byClass) {
  /** @type {{gmail?:object, calendar?:object, drive?:object}} */
  const services = {};
  const read = byClass.READ;
  if (read) {
    if (read.calendar) services.calendar = read.calendar;
    if (read.drive) services.drive = read.drive;
  }
  const users = {};
  const messages = {};
  if (read && read.gmail) {
    messages.list = (p) => read.gmail.users.messages.list(p);
    messages.get = (p) => read.gmail.users.messages.get(p);
  }
  const send = byClass.SEND;
  if (send && send.gmail) {
    messages.send = (p) => send.gmail.users.messages.send(p);
    users.getProfile = (p) => send.gmail.users.getProfile(p);
  }
  if (Object.keys(messages).length > 0) users.messages = messages;
  const draft = byClass.DRAFT;
  if (draft && draft.gmail) {
    users.drafts = { create: (p) => draft.gmail.users.drafts.create(p) };
  }
  if (Object.keys(users).length > 0) services.gmail = { users };
  return services;
}

/**
 * Assemble the routine's real broker registry: its profile's verbs, the
 * least-scope credentials those verbs' capability classes need, and the
 * grant-store check. A class whose credential fails to load (missing token,
 * scope bleed, expired refresh) is reported on stderr and its verbs refuse
 * fail-closed — the rest of the registry keeps working.
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {import('../core/runtime-profile').RuntimeProfile} profile
 * @returns {Promise<import('../gws/broker/server').BrokerRegistry>}
 */
async function assembleRegistry(paths, profile) {
  const classes = [...new Set(profile.brokerVerbs.map((v) => VERBS[v].capabilityClass))];
  /** @type {Record<string, object>} */
  const byClass = {};
  for (const cls of classes) {
    try {
      byClass[cls] = await loadCredentialServices(paths, cls);
    } catch (err) {
      const msg = err instanceof WienerdogError ? err.message : 'credential load failed';
      process.stderr.write(`wienerdog broker: ${cls} credential unavailable — ${msg}\n`);
    }
  }
  const loaded = new Set(Object.keys(byClass));

  const inner = buildRegistry({
    services: compositeServices(byClass),
    routineId: profile.id,
    grantCheck: (routineId, kind) => {
      const decision = grantStore.grantCheck(paths, routineId, kind);
      if (decision.alert) process.stderr.write(`wienerdog broker: ${decision.alert}\n`);
      return decision.allowed;
    },
  });

  return {
    listTools: () => inner.listTools(),
    callTool: async (name, args) => {
      const verb = VERBS[name];
      if (verb && !loaded.has(verb.capabilityClass)) {
        // Fixed, secret-free refusal: the class credential never loaded.
        throw new WienerdogError(`the ${verb.capabilityClass} credential is not available in this run`);
      }
      return inner.callTool(name, args);
    },
  };
}

/**
 * Run the broker until stdin EOF. A fatal setup problem (unknown/non-broker
 * routine) exits non-zero BEFORE any MCP byte is spoken — the routine then
 * fails loud via run-job. Exits promptly on SIGINT/SIGTERM/SIGHUP; together
 * with exit-on-stdin-EOF this is the whole ADR-0004 no-orphan story
 * (SPIKE-stdio-lifecycle: a SIGKILLed parent delivers NO signal; only EOF).
 * @param {string[]} argv
 * @returns {Promise<void>}
 */
async function run(argv) {
  const { routine } = parseArgs(argv);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(sig, () => process.exit(0));
  }

  let profile;
  try {
    // Lazy require: runtime-profile is only needed here, and a load error must
    // surface as the fixed fail-closed message below, never a stack on stdout.
    profile = require('../core/runtime-profile').getProfile(String(routine));
  } catch {
    profile = null;
  }
  if (!profile || profile.kind !== 'routine' || profile.mcp !== 'broker') {
    process.stderr.write(
      `wienerdog broker: unknown or non-broker routine "${String(routine).slice(0, 64)}" — refusing to start\n`
    );
    process.exitCode = 1;
    return;
  }

  const registry = await assembleRegistry(getPaths(), profile);
  await runBrokerServer({ registry });
}

module.exports = { run };
