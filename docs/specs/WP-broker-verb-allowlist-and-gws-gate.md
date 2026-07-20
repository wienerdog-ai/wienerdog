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
2. **Routine Google access is dual-gated: `external-content-routine` AND `gws-use`,
   both enforced at the PARENT spawn locus.** Today only `external-content-routine`
   gates the routine (in `run-job.js` `resolveCommand`); nothing requires `gws-use`,
   so the `gws-use` description ("reading or sending Gmail, Calendar, and Drive is
   disabled") overclaims. Fix: add `requireCapability(GWS_USE, profile)` in
   `run-job.js` `resolveCommand`'s `skill:` branch, right beside the existing
   `external-content-routine` gate, for a broker-backed routine — so both gates are
   enforced at the parent with the JS `profile` code seam (`allowAll()`-testable,
   consistent with every other gate). In the 0.10.0 flip both gates open together, so
   this changes nothing functionally now; it fixes the mapping and the description.

   > **Design-gate R1 (leg C) — the gate is NOT enforced inside the broker
   > subprocess.** An in-subprocess `requireCapability(GWS_USE)` in `gws _broker` was
   > REJECTED: the subprocess reads `FROZEN_PROFILE` with **no env/seam override by
   > design**, so it is **untestable while frozen** — `tests/unit/broker-wiring.test.js`
   > and `run-broker-e2e.js` spawn `gws _broker` directly and expect it to start, and a
   > subprocess cannot receive a JS `allowAll()` profile. Enforcing at the parent
   > (where the `profile` seam already lives) is the **testable equivalent** with
   > identical net semantics — the broker subprocess is only ever reachable via the
   > gated parent, so leaving its entry ungated is safe. The `broker-wiring` and
   > `broker-e2e` tests stay UNCHANGED. Recorded in ADR-0026 amendment 1.

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

`src/cli/run-job.js` `resolveCommand(paths, job, profile)` `skill:` branch (l.380-389):
```js
if (kind === 'skill') {
  requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile); // A0 freeze — parent gate, JS seam
  return require('../core/routine-runtime').composeRoutineRun(paths, job);
}
```
`rest` (= `job.run.slice(sep + 1)`) is the skill id. `routine-runtime.js`
`profileIdForSkill(skillId)` maps it to a profile id (throws `RuntimeProfileError` on
unknown); `runtime-profile.js` `getProfile(id)` returns the profile (with `.mcp`).
This branch is the parent spawn locus where the `profile` code seam is already
threaded — the testable place to add the `gws-use` gate.

`src/core/safety-profile.js` exports `requireCapability(name, profile?)`,
`CAPABILITY.GWS_USE` / `CAPABILITY.EXTERNAL_CONTENT_ROUTINE`, `allowAll()`. No
profile → production (currently frozen). `bin/wienerdog.js` routes `gws _broker`
to `gws-broker.run(rest)` with NO profile (a subprocess cannot receive a JS seam).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | `resolveCommand` `skill:` branch: add `requireCapability(GWS_USE, profile)` for a broker-backed routine, beside the existing `external-content-routine` gate (parent-site, JS seam) |
| modify | src/cli/gws-broker.js | pass `allowedVerbs: profile.brokerVerbs` to `buildRegistry` — NO startup `requireCapability` (leg C ruling) |
| modify | src/gws/broker/registry.js | accept `allowedVerbs`; `listTools` advertises only those; `callTool` rejects an undeclared verb before dispatch |
| modify | tests/unit/broker-registry.test.js | `listTools` == declared verbs only; an undeclared verb throws before dispatch |
| modify | tests/unit/scheduler-runjob.test.js | `resolveCommand` for a broker routine throws under a blocked `gws-use` (even with `external-content-routine` allowed); composes under `allowAll()` |

`tests/unit/broker-wiring.test.js` and `tests/scenarios/broker-e2e/` are
**UNCHANGED** — the broker subprocess entry stays ungated (reachable only via the
gated parent), so those direct-spawn tests keep passing.

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

**2. `run-job.js` `resolveCommand` — dual-gate at the parent (leg C).** Add the
`gws-use` gate beside the existing `external-content-routine` gate, for a
broker-backed routine, using the JS `profile` seam:

```js
if (kind === 'skill') {
  requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile); // A0 freeze, first
  // Dual gate (ADR-0026 amendment 1): a broker-backed routine uses Google, so it also
  // needs gws-use. Enforced HERE at the parent (the JS profile seam) — NOT inside the
  // gws _broker subprocess, which reads FROZEN_PROFILE with no seam and would be
  // untestable while frozen. Net semantics: routine Google access needs BOTH gates.
  const routineRt = require('../core/routine-runtime');
  const prof = require('../core/runtime-profile').getProfile(routineRt.profileIdForSkill(rest));
  if (prof.mcp === 'broker') requireCapability(CAPABILITY.GWS_USE, profile);
  return routineRt.composeRoutineRun(paths, job);
}
```

`rest` is the skill id (`job.run.slice(sep + 1)`). `profileIdForSkill` throws
`RuntimeProfileError` on an unknown skill (fail closed, unchanged). Both
`requireCapability` calls read the same `profile` seam (`allowAll()` in the harness,
none/frozen in production).

**3. `gws-broker.js` — pass the allowlist ONLY (no startup gate).** Add
`allowedVerbs` to the `buildRegistry` call; do NOT add a `requireCapability` — the
gate lives at the parent (contract 2), and the broker subprocess entry stays ungated
so the direct-spawn `broker-wiring`/`broker-e2e` tests are unchanged:

```js
// in assembleRegistry:
  const inner = buildRegistry({
    services: compositeServices(byClass),
    routineId: profile.id,
    allowedVerbs: profile.brokerVerbs,   // server-side per-verb allowlist
    grantCheck: (routineId, kind) => { /* unchanged */ },
  });
```

## Implementation notes & constraints

- **The `gws-use` gate is at the PARENT, not the broker subprocess** (leg C). The
  broker subprocess reads `FROZEN_PROFILE` with no env/seam override by design;
  gating it there would be untestable while frozen and break the direct-spawn
  `broker-wiring`/`broker-e2e` tests. The parent gate (JS `profile` seam, beside the
  `external-content-routine` gate) is the testable equivalent; the subprocess is only
  reachable via the gated parent, so its ungated entry is safe.
- **`gws-use` honesty holds without gating the retired interactive path.** The one
  other Google-touching path, `wienerdog grant`'s `authenticatedAddress → getProfile`
  (grant.js:96-105), can no longer reach Google because `getServices` is retired and
  throws (client.js:223-227) — it degrades to `null` (FIX-PLAN §8). So `gws-use`
  semantics stay honest: the live paths it governs are the broker (via the parent
  gate) and interactive `cal`/`_alert`; the dead interactive path reaches nothing.
- **The client-side `--allowedTools` stays** (WP-128/composeClaudeArgs) — the
  server-side allowlist is redundant defense-in-depth on the authoritative side.
- **No `safety-profile.js` change** — this WP reads the existing gate; the flip is
  the terminal WP.
- Zero new deps; plain Node ≥ 18; JSDoc types; no build step.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The broker advertises/executes a verb ⟺ it is in the profile's `brokerVerbs`
      AND its class credential loaded (asserted: undeclared verb → "unknown broker
      verb" before any dispatch). A broker-backed routine composes ⟺ BOTH
      `external-content-routine` AND `gws-use` are allowed, enforced at the parent
      `resolveCommand` with the JS seam (asserted: throws under a blocked `gws-use`).
      No untrusted identifier flows into a path/shell.

## Acceptance criteria

- [ ] `buildRegistry({…, allowedVerbs:['create_draft']}).listTools()` returns only
      `create_draft`; `callTool('send_digest_to_self', …)` throws "unknown broker
      verb" before any dispatch.
- [ ] `resolveCommand(paths, {run:'skill:wienerdog-daily-digest',…}, profile)` throws
      when `gws-use` is blocked even if `external-content-routine` is allowed;
      composes under `allowAll()`.
- [ ] The `gws _broker` subprocess entry is UNCHANGED (no `requireCapability` added);
      `broker-wiring` and `broker-e2e` tests pass unmodified.
- [ ] Each routine's real `brokerVerbs` still work end-to-end under `allowAll()`.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-registry|broker-wiring|run-job|scheduler"
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
