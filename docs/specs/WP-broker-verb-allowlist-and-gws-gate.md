---
id: WP-broker-verb-allowlist-and-gws-gate
title: Broker server-side per-verb allowlist + fold the broker behind gws-use
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0026]
epic: p0-ungate
---

# WP-broker-verb-allowlist-and-gws-gate: Server-side per-verb allowlist + dual-gate the broker

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004). The **GWS capability broker** (ADR-0026) is the
per-job stdio MCP child a routine's `claude -p` spawns to reach Google. It holds the
credentials the model never sees, advertises a fixed set of typed **verbs**, and
dies with the routine. A routine profile declares the EXACT verbs it may call in
`profile.brokerVerbs`, which Wienerdog emits as client-side
`--allowedTools mcp__wienerdog-broker__<verb>`.

This WP is a cluster-N hardening folded into the 0.10.0 un-freeze, implementing
**ADR-0026 amendment 1** (two items the double-gate review surfaced):

1. **Server-side per-verb allowlist.** `buildRegistry` advertises ALL verbs
   (`Object.values(VERBS)`) and `callTool` dispatches any verb whose class credential
   loaded — the per-verb restriction is ONLY client-side. No escalation today, but a
   future *mutating* verb added to an already-loaded class would be executable
   server-side without a review of the routine's `brokerVerbs`. Fix: the broker
   advertises/executes ONLY the profile's declared `brokerVerbs`.
2. **The broker is dual-gated behind `gws-use` too.** `gws-broker.js` never calls
   `requireCapability(GWS_USE)`; the broker's reachability is governed only by
   `external-content-routine` upstream, so the `gws-use` description ("reading or
   sending Gmail, Calendar, and Drive is disabled") overclaims. Fix: the broker
   requires `gws-use` at startup, so routine Google access needs BOTH gates —
   defense-in-depth against a future partial un-gate and an honest description. In the
   0.10.0 flip both gates open together, so this changes nothing functionally now.

## Current state

`src/cli/gws-broker.js`:
- `run(argv)` (l.134-158) parses `--routine <id>`, resolves the profile, and calls
  `assembleRegistry(getPaths(), profile)` → `runBrokerServer({ registry })`. It does
  NOT call `requireCapability`.
- `assembleRegistry(paths, profile)` (l.88-123) loads per-class credentials, then
  `buildRegistry({ services: compositeServices(byClass), routineId: profile.id,
  grantCheck })` — it passes NO verb filter.
- Imports include `getPaths`, `WienerdogError`, `buildRegistry`, `VERBS`,
  `loadCredentialServices`, `grantStore`. `CAPABILITY_CLASS`/`BROKER_SERVER_NAME`
  come from `./broker/constants`.

`src/gws/broker/registry.js` `buildRegistry(deps)` (l.30-79):
- `listTools()` returns `Object.values(VERBS).map(...)` — ALL verbs.
- `callTool(name, args)` looks up `VERBS[name]` and dispatches any verb whose service
  is provided and grant/limits pass.

`src/core/safety-profile.js` exports `requireCapability(name, profile?)`,
`CAPABILITY.GWS_USE`, `allowAll()`. No profile → production (currently frozen).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/gws-broker.js | `requireCapability(GWS_USE)` at startup (fail closed before any MCP byte); pass `allowedVerbs: profile.brokerVerbs` to `buildRegistry`; add an `opts.profile` code seam |
| modify | src/gws/broker/registry.js | accept `allowedVerbs`; `listTools` advertises only those; `callTool` rejects an undeclared verb before dispatch |
| modify | tests/unit/broker-registry.test.js | `listTools` == declared verbs only; an undeclared verb throws before dispatch |
| modify | tests/unit/gws-broker.test.js | broker refuses to start when `gws-use` is blocked (code seam); starts under `allowAll()` |

### Exact contracts

**1. `registry.js` — server-side per-verb allowlist.** `buildRegistry(deps)` takes
`deps.allowedVerbs` (array of verb names). Absent/empty ⇒ advertise nothing (fail
closed — a broker profile always supplies its verbs):

```js
function buildRegistry(deps) {
  const { services, routineId, grantCheck } = deps;
  const allowed = new Set(Array.isArray(deps.allowedVerbs) ? deps.allowedVerbs : []);
  const limitsState = deps.limitsState || createLimitsState();
  return {
    listTools() {
      return Object.values(VERBS)
        .filter((v) => allowed.has(v.name))
        .map((v) => ({ name: v.name, description: v.description, inputSchema: v.inputSchema }));
    },
    async callTool(name, args) {
      if (!allowed.has(name)) throw new WienerdogError('unknown broker verb');
      const verb = VERBS[name];
      if (!verb) throw new WienerdogError('unknown broker verb');
      // … existing service-availability / validate / limits / grant / dispatch unchanged …
    },
  };
}
```

The undeclared-verb rejection is BEFORE any service/validate/dispatch — zero side
effect. Everything after the allowlist check is unchanged.

**2. `gws-broker.js` — dual-gate + pass the allowlist.** Require `gws-use` at
startup and pass `allowedVerbs`:

```js
const { requireCapability, CAPABILITY } = require('../core/safety-profile');

async function run(argv, opts = {}) {
  // Dual gate (ADR-0026 amendment 1): routine Google access needs BOTH
  // external-content-routine (upstream, run-job) AND gws-use (here). Fail closed
  // BEFORE any MCP byte — a throw exits non-zero pre-handshake. opts.profile is a
  // code seam for tests only; production (bin/wienerdog.js) passes none.
  requireCapability(CAPABILITY.GWS_USE, opts.profile);
  // … existing signal handlers + profile resolution unchanged …
}

// in assembleRegistry:
  const inner = buildRegistry({
    services: compositeServices(byClass),
    routineId: profile.id,
    allowedVerbs: profile.brokerVerbs,   // server-side per-verb allowlist
    grantCheck: (routineId, kind) => { /* unchanged */ },
  });
```

`requireCapability` throws a `WienerdogError` when `gws-use` is blocked; the throw
propagates to `bin/wienerdog.js` (stderr + exit 1) — nothing is written to stdout
(the MCP channel), so the fail-closed refusal is clean.

## Implementation notes & constraints

- **The `gws-use` refusal must precede any stdout write** (stdout is the framed
  JSON-RPC channel). Place `requireCapability` at the very top of `run`.
- **`opts.profile` is a code seam only** — `bin/wienerdog.js` calls `run(rest)` with
  no opts, so production reads the real profile (frozen → refuses; post-flip →
  allowed). Tests pass `{ profile: allowAll() }` to exercise the started path.
- **The client-side `--allowedTools` stays** (WP-128/composeClaudeArgs) — the
  server-side allowlist is redundant defense-in-depth on the authoritative side.
- **No `safety-profile.js` change** — this WP reads the existing gate; the flip is
  the terminal WP.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The broker advertises/executes a verb ⟺ it is in the profile's
      `brokerVerbs` AND its class credential loaded AND `gws-use` is allowed at
      startup (asserted: undeclared verb → "unknown broker verb" before dispatch;
      broker refuses to start under a blocked `gws-use`). No untrusted identifier
      flows into a path/shell; the `gws-use` refusal precedes any stdout byte.

## Acceptance criteria

- [ ] `buildRegistry({…, allowedVerbs:['create_draft']}).listTools()` returns only
      `create_draft`; `callTool('send_digest_to_self', …)` throws "unknown broker
      verb" before any dispatch.
- [ ] `gws-broker.run(['--routine','daily-digest'])` refuses (exit non-zero / throws)
      when `gws-use` is blocked; under `{ profile: allowAll() }` it proceeds to start
      the server.
- [ ] Each routine's real `brokerVerbs` still work end-to-end under `allowAll()` (the
      broker-e2e proof is unaffected — declared verbs are advertised).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-registry|gws-broker|broker"
npm test
npm run lint
node bin/wienerdog.js safety   # gates unchanged at this WP
```

## Out of scope (do NOT do these)

- The negative-harness allowlist fix — `WP-negative-harness-broker-verbs` (depends on this).
- The dead interactive send-path retirement — `WP-gws-retire-dead-send-path`.
- Opening any capability gate — `WP-flip-frozen-profile-allowed`.
- Any change to the verb table (`verbs.js`) or credentials.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(broker): server-side per-verb allowlist + dual-gate behind gws-use (WP-broker-verb-allowlist-and-gws-gate)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
