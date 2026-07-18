---
id: WP-136
title: GWS broker transport — hand-rolled MCP stdio JSON-RPC server + per-job lifecycle self-check (audit A2)
status: Draft
model: opus
size: M
depends_on: [WP-131]
adrs: [ADR-0004, ADR-0013, ADR-0025, ADR-0026]
branch: wp/136-broker-stdio-transport
---

# WP-136: GWS broker transport — hand-rolled MCP stdio JSON-RPC server + per-job lifecycle self-check (audit A2)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons, servers, or background
processes that outlive their job. Node ≥ 18, **zero runtime dependencies** (the single
ADR-approved exception is `googleapis`), JSDoc types, no TypeScript, no build step.

A 2026-07-15 security audit (action **A2**, deep-dive `04-gws-grants.md`) found that
Google access in Wienerdog is authenticated by **one combined OAuth token** that is
strictly more powerful than the CLI grant exposes: any process running as the user can
read the 0600 token and call `messages.send` / `events.delete` directly via
`googleapis`, never touching the grant check. The fix (**ADR-0026**) is a
**credential-holding capability broker**: a local process that alone loads OAuth
tokens and exposes only **fixed verbs** to the model; the model never sees a token, a
raw Google client, or a generic send.

A1 (ADR-0025) already contained the routine's model surface (`--tools Read`,
staging-only writes, no Bash) and left the broker as a **seam**:
`src/core/routine-runtime.js` composes a routine run with **exactly one** absolute-path
broker MCP config expected at `<core>/runtime/broker-mcp.json`; absent → the routine
fails closed. This WP builds the **transport half** of the broker that plugs into that
seam — the MCP **stdio server** the routine's `claude -p` spawns.

**The broker is a per-job stdio child, NOT a daemon (ADR-0004).** `claude -p` spawns
it as an MCP server over stdin/stdout for the duration of one routine run; it starts no
listener, opens no port, and must die when the routine process exits. **This lifecycle
is load-bearing and NOT confirmed by Claude Code's docs** (there are open orphaned-MCP-
child bug reports upstream), so this WP proves it with a **live self-check** before the
transport is trusted (below).

**Zero runtime deps → the MCP server is hand-rolled.** MCP's stdio transport is a
small JSON-RPC 2.0 subset (`initialize`, `tools/list`, `tools/call`); we implement it
in plain Node, not `@modelcontextprotocol/sdk` (D-SDK-EXCEPTION). This WP is the
**transport and lifecycle only** — the Google verbs, credentials, and grants are later
WPs; here the verb registry is an **injected** parameter (tests pass a fake).

**A2 opens NO capability gate.** `gws-use` and `external-content-routine` stay BLOCKED
in `src/core/safety-profile.js`. Nothing this WP adds is reachable in a production
routine (the broker is only spawned once WP-141 wires the seam AND a gate opens, which
A2 never does). `wienerdog safety` shows all five gates BLOCKED after this WP.

## Current state

- **`src/core/routine-runtime.js`** (WP-131) has `brokerMcpConfigPath(paths, profile)`:
  returns `<core>/runtime/broker-mcp.json` when `profile.mcp === 'broker'` **and** that
  file exists, else `null` → a broker routine fails closed. **This WP does not touch
  that file** — it builds the server the future config will point at.
- **`src/gws/client.js`** exposes `getServices(paths, {factory})` — a services object
  `{gmail, calendar, drive}` with a **test factory seam** (returns a fake instead of
  real googleapis). The broker will reuse this shape in later WPs; here the verb
  registry is fully injected, so no Google code is touched.
- **`src/scheduler/generators.js`** exposes `nodePath()` and `wienerdogBin(paths)` (the
  vendored `app/current` entry, ADR-0042) — used to spawn Wienerdog subcommands.
- **`bin/wienerdog.js`** is the CLI entry that dispatches subcommands. There is **no**
  broker subcommand or `src/gws/broker/` package yet — you are creating them.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/gws/broker/protocol.js | framed JSON-RPC 2.0 read/write over a stdio stream pair (SPIKE-mcp-framing) |
| create | src/gws/broker/server.js | `runBrokerServer({registry, stdin, stdout, onExit})` — MCP `initialize`/`tools/list`/`tools/call` dispatch over `protocol.js`; injected verb registry; exits on stdin EOF |
| create | src/gws/broker/constants.js | `CAPABILITY_CLASS` (`READ`,`DRAFT`,`SEND`,`CALENDAR_WRITE`), `BROKER_SERVER_NAME`, protocol version constant |
| create | src/cli/gws-broker.js | hidden `wienerdog gws _broker` entry: wires real stdin/stdout to `runBrokerServer` with a (later-WP) registry; in THIS WP a stub/empty registry so the entry is testable end-to-end |
| modify | bin/wienerdog.js | dispatch `gws _broker` → `src/cli/gws-broker.js` (hidden; not shown in help) |
| create | tests/unit/broker-protocol.test.js | frame encode/decode round-trip, partial-read reassembly, oversize/malformed fail-closed |
| create | tests/unit/broker-server.test.js | handshake, tools/list from a fake registry, tools/call dispatch + unknown-method/unknown-tool JSON-RPC errors, EOF-exits |
| create | tests/scenarios/broker/lifecycle-selfcheck.js | LIVE self-check (gated): broker child is gone after parent normal-exit, parent-kill, parent-crash (SPIKE-stdio-lifecycle) |
| modify | package.json | add `npm run broker:selfcheck` (guarded by `WIENERDOG_RUN_SCENARIOS`, prints skip + exit 0 without it) |

### Exact contracts

**1. `protocol.js` — framed JSON-RPC transport.**

```js
/** Read framed JSON-RPC messages from `stream`, invoking `onMessage(obj)` per message.
 *  Bounded: a single message may not exceed MAX_MESSAGE_BYTES (fail closed — drop the
 *  connection with a JSON-RPC parse error, never buffer unboundedly). Reassembles
 *  partial reads. @param {NodeJS.ReadableStream} stream
 *  @param {(msg:object)=>void} onMessage @returns {{close():void}} */
function readMessages(stream, onMessage)

/** Serialize + frame one JSON-RPC message to `stream`.
 *  @param {NodeJS.WritableStream} stream @param {object} msg */
function writeMessage(stream, msg)
```

- **SPIKE-mcp-framing (resolve before Ready):** MCP stdio framing is not doc-stated.
  Measure the real `claude -p` wire format (newline-delimited JSON-RPC vs LSP-style
  `Content-Length:` headers) with a throwaway echo server and pin `protocol.js` to what
  the installed Claude actually sends/expects. Record the measured framing + Claude
  version in the PR. Implement the confirmed one; keep the other trivially swappable.
- `MAX_MESSAGE_BYTES` is a hard bound (e.g. 4 MB) — an oversized/garbage frame yields a
  JSON-RPC parse error and closes, never an unbounded buffer (ReDoS/DoS hygiene).

**2. `server.js` — the MCP server loop.**

```js
/** Run the broker MCP server until stdin EOF. PURE transport: it dispatches
 *  JSON-RPC to the injected registry and never loads a credential itself.
 *  @param {{ registry: BrokerRegistry, stdin?: NodeJS.ReadableStream,
 *            stdout?: NodeJS.WritableStream, onExit?: (code:number)=>void }} opts
 *  @returns {Promise<void>} resolves when stdin closes (the server exits) */
async function runBrokerServer(opts)

/** @typedef {Object} BrokerRegistry
 *  @property {() => Array<{name:string, description:string, inputSchema:object}>} listTools
 *  @property {(name:string, args:object) => Promise<{content:Array<{type:'text',text:string}>}>} callTool
 */
```

- Implements exactly three MCP methods:
  - `initialize` → returns the protocol version (`constants.js`), server name/version,
    and a `tools` capability. **SPIKE:** confirm the exact `initialize` result fields
    Claude Code requires against the live handshake; pin them.
  - `tools/list` → `{ tools: registry.listTools() }`.
  - `tools/call` → validate the method params shape, then `registry.callTool(name, args)`;
    map a thrown/rejected verb error to a JSON-RPC error object with a **fixed,
    secret-free** message (never the raw error / a token). An unknown tool → JSON-RPC
    error `-32601` (method/tool not found), **zero** side effect.
  - Any other method → JSON-RPC `-32601`. A malformed request → `-32700`/`-32600`.
- The server **never** exposes a generic/pass-through method — only what the registry
  advertises. This is the transport-level guarantee behind "no raw client surface."
- On stdin `end`/`close`, resolve (the process then exits). `onExit` is a test seam.
- **Protocol-drift detection (OWNER-ADDED 2026-07-18, D-SDK-EXCEPTION follow-up).** The
  transport must DISTINGUISH "the MCP protocol changed under us" from "our code is
  broken", programmatically:
  - `initialize` validates the client's requested `protocolVersion` against the
    code-owned supported set in `constants.js`; an unsupported version fails closed with
    a **fixed, distinct, secret-free** error naming both versions ("MCP protocol version
    mismatch: client <X>, broker supports <Y>") — the primary in-band drift signal. It
    surfaces through the run's fail-loud alert path, never as a silent failure.
  - An unparseable/unrecognized frame **before** a completed `initialize` handshake
    yields a distinct "framing not recognized — possible MCP protocol change" error,
    separate from the generic malformed-frame error after the handshake.
  - The transport unit tests pin OUR implementation against **recorded golden handshake
    frames** (from the SPIKE-mcp-framing measurement); the live self-check (contract 4)
    and the WP-142 harness exercise the real `claude -p` handshake. The DIFFERENTIAL is
    the discriminator: goldens green + live handshake red ⇒ the protocol drifted;
    goldens red ⇒ our own regression.

**3. `src/cli/gws-broker.js` — the hidden launcher (D-BROKER-LAUNCH).**

```js
/** `wienerdog gws _broker [--routine <id>]` — the per-job stdio broker entry Claude
 *  Code spawns as an MCP server. In THIS WP it builds an EMPTY/stub registry (real
 *  verbs are WP-137/138/141) and runs runBrokerServer on process.stdin/stdout. It
 *  reads its trusted routine id from --routine (the WP-141 launch descriptor; ignored
 *  here beyond parsing). NEVER prints to stdout except framed JSON-RPC (stdout is the
 *  MCP channel); diagnostics go to stderr. @param {string[]} argv @returns {Promise<void>} */
async function run(argv)
```

- **D-BROKER-LAUNCH — RESOLVED (OWNER-APPROVED 2026-07-18): the hidden subcommand.**
  The broker is launched as `node <wienerdogBin> gws _broker --routine <id>` (via
  `gen.nodePath()` + `gen.wienerdogBin(paths)`), reusing the vendored `app/current`
  entry (ADR-0013 vendored install) so an update repoints it automatically. The
  alternative (a standalone script) duplicates path/vendoring logic — rejected.
- Underscore-prefixed (`_broker`) and omitted from `--help`, mirroring `gws _alert`.

**4. `tests/scenarios/broker/lifecycle-selfcheck.js` — the SPIKE-stdio-lifecycle proof.**

A **live, gated** harness (WP-023/WP-133 pattern; `WIENERDOG_RUN_SCENARIOS=1`, else
print skip + exit 0). It spawns a parent that starts the real broker as a child writing
its PID to a temp file, then asserts the broker child is **gone** in three cases:
(a) parent exits normally, (b) parent is `SIGKILL`ed, (c) parent crashes (throws). If
any case leaves an orphan, this WP **fails loud** and the ADR-0026 §1 supervisor-reap
follow-up is required (recorded as a spec-gap, not smuggled in here). Record the
observed behavior + Claude/Node version in the PR.

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-SDK-EXCEPTION — RESOLVED (OWNER-APPROVED 2026-07-18): hand-roll.** The MCP stdio
  server is hand-rolled plain-Node JSON-RPC 2.0 (no `@modelcontextprotocol/sdk`): MCP
  stdio is a bounded JSON-RPC 2.0 subset (three methods), and the zero-runtime-dependency
  invariant (CLAUDE.md, ADR-0013) is a core product property; adding a transitive
  dependency tree for three methods is a poor trade, and it would keep the supply-chain
  surface of this security-critical component minimal. Counterargument (accepted risk):
  we own protocol drift if MCP changes — mitigated by pinning the measured
  framing/handshake (SPIKE-mcp-framing) and by WP-142's live proof.
- **D-BROKER-LAUNCH — RESOLVED (OWNER-APPROVED 2026-07-18): hidden subcommand.** See
  contract 3.

## SPIKEs (must be resolved with a live measurement before Ready)

- **SPIKE-mcp-framing** — the stdio wire framing (contract 1). Blocks pinning `protocol.js`.
- **SPIKE-stdio-lifecycle** — the broker dies with its parent (contract 4). Load-bearing
  for ADR-0004; if it orphans, a supervisor reap is required before A2 can proceed.
- **SPIKE-env-inheritance** — dump the broker child's `process.env` under the real
  composition and record whether it inherits the full parent env or a stripped subset.
  The design **must not rely on env inheritance either way**: the broker takes its
  identity from `--routine` (argv) and its credentials from files (later WPs), never
  from an inherited env var. Record the finding; if the parent env leaks secrets into the
  child, note it for WP-138's credential-load hygiene.

## Implementation notes & constraints

- **stdout is the MCP channel.** The broker must write **only** framed JSON-RPC to
  stdout; every diagnostic/log line goes to stderr. A stray `console.log` corrupts the
  protocol.
- **No credential code here.** The registry is injected; this WP never requires
  `client.js`/`googleapis`. Keep `src/gws/broker/` free of credential imports until WP-138.
- **Bounded + fail-closed everywhere.** Message size bound; unknown method/tool → a
  JSON-RPC error with zero side effect; a verb-handler throw → a fixed secret-free error.
- **Idempotent/reversible:** the broker writes nothing to disk in this WP (transport
  only). No manifest entry. Under the core, disposable by uninstall.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] The server exposes ONLY `initialize`/`tools/list`/`tools/call` and only the
      injected registry's advertised tools; there is no generic/pass-through method, no
      raw client surface, and no way for a `tools/call` to name a method the registry did
      not advertise. Message size is bounded; malformed/oversized frames fail closed with
      a JSON-RPC error and no side effect. The broker writes only framed JSON-RPC to
      stdout. The live self-check proves no broker process outlives its parent (ADR-0004).

## Acceptance criteria

- [ ] `readMessages`/`writeMessage` round-trip a JSON-RPC message; a split/partial read
      reassembles; an oversized/garbage frame yields a parse error and closes (no
      unbounded buffer). (unit)
- [ ] `runBrokerServer` answers `initialize` with the pinned protocol version, lists a
      fake registry's tools, dispatches `tools/call` to it, returns JSON-RPC `-32601` for
      an unknown method/tool with zero side effect, and resolves on stdin EOF. (unit)
- [ ] `node bin/wienerdog.js gws _broker` starts, speaks the handshake over stdio, and
      exits on EOF (the stub empty registry lists zero tools). (unit/integration)
- [ ] `npm run broker:selfcheck` with `WIENERDOG_RUN_SCENARIOS` unset prints skip, exits
      0; the LIVE run (gated) shows no orphan broker in all three parent-death cases.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-protocol"
npm test -- --test-name-pattern "broker-server"
npm test
npm run lint
npm run broker:selfcheck        # prints skip, exits 0 (WIENERDOG_RUN_SCENARIOS unset)
node bin/wienerdog.js safety    # all five gates BLOCKED

# SPIKE / LIVE (record framing + lifecycle + env findings in the PR):
export WIENERDOG_RUN_SCENARIOS=1
npm run broker:selfcheck        # no orphan broker after normal exit / kill / crash
```

## Out of scope (do NOT do these)

- Any Google verb, credential, scope, or grant — **WP-137/WP-138/WP-139**.
- Writing/wiring `broker-mcp.json` or extending the routine profile — **WP-141**.
- The poisoned-email E2E containment proof — **WP-142**.
- Opening any capability gate — never in A2.

## Definition of done

1. All non-SPIKE verification steps pass locally; output pasted into the PR body. The
   SPIKE findings (framing, lifecycle, env) are recorded with the tested Claude/Node
   version; an orphaning lifecycle is flagged as a spec-gap, not patched over.
2. Branch `wp/136-broker-stdio-transport`; conventional commits; PR titled
   `feat(gws): hand-rolled MCP stdio broker transport + per-job lifecycle self-check (WP-136)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
