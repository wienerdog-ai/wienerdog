---
id: WP-routine-containment-probe
title: Pre-routine live containment self-check (un-gate external-content-routine)
status: Done
model: opus
size: M
depends_on: [WP-broker-verb-allowlist-and-gws-gate]
adrs: [ADR-0004, ADR-0009, ADR-0025]
epic: p0-ungate
---

# WP-routine-containment-probe: Pre-routine live containment self-check

## Context (read this, nothing else)

Wienerdog is just files (ADR-0004); no daemons/servers/telemetry. Node ≥ 18, zero
runtime deps, JSDoc types, no build step.

**Routines** (daily digest, inbox triage, weekly review) are scheduled `claude -p`
jobs run by `wienerdog run-job <name>`. They run under a **code-owned hermetic
runtime profile** (ADR-0025): explicit non-empty `--tools` allowlist, expanded
`--disallowedTools` deny list, hook-free `--settings`, `--setting-sources ""`,
`--strict-mcp-config`, a fresh staging dir as the only writable root, and exactly
one broker MCP. The `external-content-routine` gate is BLOCKED (A0); this WP is part
of the 0.10.0 un-freeze, which opens it.

The dream got a **pre-dream live containment self-check** (WP-135, ADR-0025
Amendment 2): before it spawns its brain, a bounded `claude -p` canary probe of the
REAL hermetic composition verifies the *actually-installed* Claude still honors the
containment flags, and **fails closed** (HALT) if it cannot confirm. The reason: an
unverified hermetic runtime must not run over attacker-influenceable content, and
`--setting-sources ""` is an empirically-measured property of one Claude build
(2.1.212) a future Claude could regress. **ADR-0025 Amendment 3** decides that this
applies with MORE force to routines, which ingest genuinely hostile *external*
content (a poisoned email): a routine-side live probe is REQUIRED before un-gating.
WP-135 explicitly anticipated this ("If a routine is ever un-gated, wiring the same
probe into its spawn is a future WP").

This WP generalizes the existing dream probe to run against a **broker-free
containment-only canary profile** derived from the target routine's profile, and
runs it fail-closed at the single shared routine spawn locus.

**Design-gate R1 (leg B) rulings baked in below:**

- **The probe canary composes a dedicated BROKER-FREE profile, NOT the real
  broker-backed routine profile.** Routine profiles are `mcp:'broker'` with real
  `brokerVerbs`; reusing one for the canary would spawn the probe under live broker
  wiring/credentials, coupling the containment decision to broker availability and
  turning a probe failure into an ambiguous signal (containment break vs broker/
  launch-order problem). The canary carries ONLY the containment-relevant flags of
  the target routine profile, with `mcp:'empty'` and **no** `--mcp-config`. The
  canary never composes a broker MCP config and never calls a broker verb — the
  broker is orthogonal to the escape canary.
- **The probe runs at the single shared `runJob` spawn locus** that ALL routine
  spawn paths converge on (see the three production paths in Current state).

## Current state

`src/core/dream/containment-probe.js` `runContainmentProbe(paths, opts)` (WP-135):
- Hardcodes `const profile = getProfile('dream');` (l.174) and composes the dream
  argv via `composeClaudeArgs(profile, { prompt: probePrompt(...), addDirs:[allowedDir,
  stagingDir], settingsPath, mcpConfigPath: null, model, appendSystemPrompt: null })`
  plus bounding flags (`--max-turns`, `--output-format json`).
- Runs it in a temp workspace (staging + allowed add-dir + a forbidden dir holding a
  canary secret + an out-of-staging write target), asserts the static argv checks +
  ground-truth gates (canary token absent from `result`, out-of-staging write file
  absent) + `permission_denials` corroboration. Returns `{outcome:'pass'|'fail'|
  'inconclusive', claudeVersion, reason, checks}`; never throws. Skippable seam:
  `opts.probeCmd` (a fake). Spawns via `spawnPinnedSync('claude', …)` otherwise.

`src/cli/dream.js` runs it (~l.434) between the fast-path returns and the brain,
throwing `WienerdogError` on a non-`pass` outcome (fail-closed HALT).

`src/cli/run-job.js` `runJob(paths, job, opts)` is the **single shared spawn locus**
that ALL THREE production routine paths converge on:

1. **interactive** — `wienerdog run-job <name>` → `run(argv)` → `runJob`;
2. **scheduled/launcher** — the OS scheduler (launchd/systemd/schtasks) shells out to
   `wienerdog run-job <name>` → the same `run(argv)` → `runJob`;
3. **catch-up** — `run-job --catch-up` → `catchUp(paths, opts)` →
   `doRun = opts.runJob || runJob; await doRun(paths, job, opts)` (l.1088, 1101).

`runJob`:
- Calls `resolveCommand(paths, job, opts.profile)` (l.712). For a `skill:` job this
  calls `requireCapability(EXTERNAL_CONTENT_ROUTINE, opts.profile)` FIRST (blocked in
  production → throws before composition; `WP-broker-verb-allowlist-and-gws-gate`
  adds the `gws-use` gate here too), then `composeRoutineRun` → `{command, args, cwd,
  shell}`.
- Spawns at l.780 with the composed `cwd`. Test/harness seams: `opts.resolveCommand`
  (fake command), `opts.profile` (`allowAll()` code seam), `opts.runJob` (catch-up).

Placing the probe in `runJob` before the spawn therefore covers ALL THREE paths with
one call site. `runtime-profile.js` `getProfile(id)`, `PROFILES` describe each
routine (all three `mcp:'broker'`); `composeClaudeArgs(profile, ctx)` emits no
`--mcp-config` and requires no `brokerVerbs` when `profile.mcp === 'empty'`.
`routine-runtime.js` `profileIdForSkill(skillId)` maps a skill id to its profile id
(throws `RuntimeProfileError` on unknown).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/containment-probe.js | `runContainmentProbe(paths, {profileId='dream', …})`; a routine `profileId` composes a BROKER-FREE canary profile (`mcp:'empty'`, `mcpConfigPath:null`, no broker verb) carrying the routine's containment flags; probe prompt, temp add-dirs; dream path byte-unchanged |
| modify | src/cli/run-job.js | run the routine probe fail-closed in `runJob` before the `skill:` brain spawn (the single locus covering interactive + scheduled + catch-up); skippable via test seam; HALT on non-`pass` |
| modify | tests/unit/containment-probe.test.js | pass/fail/inconclusive for a routine `profileId` via the `probeCmd` fake; canary composes `mcp:'empty'` (no `--mcp-config`); dream default unchanged |
| modify | tests/unit/scheduler-runjob.test.js | a `skill:` spawn is gated on a probe `pass`; a fail/inconclusive halts (no spawn, fail-loud); assert the CATCH-UP path (`catchUp → runJob`) is gated too, not just the interactive branch |

### Exact contracts

**1. `runContainmentProbe` — generalize to a profile id via a BROKER-FREE canary.**
Add `opts.profileId` (default `'dream'`). Resolve the target profile, then derive a
containment-only **canary profile**: same containment flags (`tools`,
`disallowedTools`, `permissionMode`) but **`mcp:'empty'`** and never a broker MCP
config. The dream is already `mcp:'empty'`, so it is its own canary (byte-unchanged);
a routine's canary strips the broker wiring:

```js
// … inside runContainmentProbe, after building the temp workspace:
const target = getProfile(opts.profileId || 'dream');
// BROKER-FREE canary (design-gate R1 leg B): the containment envelope of the target
// profile with the broker removed. The broker is orthogonal to the escape canary; a
// live broker in the probe would couple the containment decision to broker
// availability and make a probe failure ambiguous. The canary carries ONLY the
// containment-relevant flags and NEVER composes a --mcp-config or calls a broker verb.
const profile = target.mcp === 'broker'
  ? { ...target, id: `${target.id}-canary`, mcp: 'empty' }   // brokerVerbs unused when mcp==='empty'
  : target;                                                   // dream: already broker-free
const composed = composeClaudeArgs(profile, {
  prompt: probePrompt(canaryPath, writePath),
  addDirs: [allowedDir, stagingDir],   // temp probe dirs mirroring the routine's staging+readable add-dir shape
  settingsPath,
  mcpConfigPath: null,                 // NEVER a broker config — mcp:'empty' emits no --mcp-config
  model,
  appendSystemPrompt: null,            // the probe prompt, never the routine skill body
});
```

`composeClaudeArgs` requires `brokerVerbs` and an `mcpConfigPath` ONLY when
`mcp === 'broker'`; with the canary's `mcp:'empty'` it emits no `--mcp-config` and no
`--allowedTools`, so no broker is composed. Everything else (temp workspace, static
argv checks, ground-truth gates, `permission_denials`, `finally` cleanup,
never-throws) is UNCHANGED. `argvStaticOk` already checks non-empty `--tools`, the
full deny list, `--strict-mcp-config`, and `--setting-sources ""` — all present in
the canary argv (they are the containment-relevant flags, identical to the routine's
minus the broker). The dream path (`profileId` absent/`'dream'`) is byte-for-byte
unchanged. `ensureBrokerMcpConfig` is NOT called by the probe.

**2. `run-job.js` — run the routine probe fail-closed before the spawn.** After
`resolveCommand` returns a routine composition (a `skill:` job) and before the
`spawn`, run the probe for that routine's profile and HALT on non-`pass`, mirroring
`dream.js`:

```js
// PRE-ROUTINE CONTAINMENT SELF-CHECK (WP-routine-containment-probe, ADR-0025 Amendment 3).
// Only reached for a real routine spawn (past requireCapability). Skipped under the
// test seams so `npm test` never spends quota / needs live Claude.
if (job.run.startsWith('skill:') && !opts.skipContainmentProbe) {
  const { runContainmentProbe } = require('../core/dream/containment-probe');
  const profileId = require('../core/routine-runtime').profileIdForSkill(job.run.slice(job.run.indexOf(':') + 1));
  const probe = runContainmentProbe(paths, { profileId, model: null, env, probeCmd: opts.probeCmd });
  if (probe.outcome !== 'pass') {
    const reason =
      `routine "${name}" halted: pre-routine containment self-check ${probe.outcome} on claude ` +
      `${probe.claudeVersion} — ${probe.reason}. The routine did not run. Re-run after updating/checking Claude.`;
    jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
    await failLoud(paths, name, reason, opts);
    throw new WienerdogError(reason);
  }
}
```

Place it in `runJob`, AFTER `resolveCmd(...)` (l.712) and BEFORE the `spawn` (l.780),
using the already-built `env`. This is the **single shared spawn locus** — all three
production routine paths (interactive `run-job`, scheduled/launcher `run-job`, and
`catchUp → runJob`) reach the spawn through here, so one call site gates all three.
The `builtin:dream` path is unaffected (its probe is in `dream.js`).
`opts.skipContainmentProbe`/`opts.probeCmd` are code seams (tests only); production
sets neither.

## Implementation notes & constraints

- **Fail-closed = HALT** (ADR-0025 Amendment 3, mirroring WP-135's
  D-PROBE-INCONCLUSIVE): a `fail` (containment BROKEN) OR `inconclusive` (unconfirmable)
  stops the routine with a durable fail-loud alert — an unverified hermetic runtime
  must not run over a poisoned email.
- **Cadence:** once per routine run (mirrors WP-135 D-PROBE-CADENCE; the owner
  accepted +1 small `claude -p` per dream — routines run ~daily). A per-version/day
  cache is the same deferred optimization noted in WP-135, NOT built here.
- **The probe never mutates the real config**, reads a real secret, or leaks the
  canary (temp-only, cleaned up in a `finally`) — inherited unchanged from WP-135.
- **The broker MCP is orthogonal to the escape canary; the canary is BROKER-FREE**
  (design-gate R1 leg B). The probe composes a `mcp:'empty'` canary derived from the
  routine profile's containment flags — it NEVER composes a `--mcp-config`, spawns
  the broker, or calls a broker verb. This keeps a probe failure meaning purely
  "containment envelope failure," decoupled from broker availability / launch order.
  The broker's credential containment is A2's boundary (proven live by
  `scenarios:broker-e2e`, LP2); the tool-inventory containment is WP-133's negative
  harness (LP1). This probe is NOT a hostile-content containment proof — it is the
  runtime tripwire on the containment envelope the real routine depends on.
- **Managed-policy residual (N1, ADR-0025 Amendment 3):** on a managed machine a
  routine still runs non-hermetically (WARN-and-proceed, WP-132); the probe does not
  change that trusted-admin case. Recorded, not blocked.
- Zero new deps; JSDoc types; no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] A routine brain spawns ⟺ the routine's containment probe returned `pass` on
      the actually-installed Claude; a `fail`/`inconclusive` HALTS the routine
      fail-closed (durable alert, no spawn), at the single `runJob` locus covering
      interactive + scheduled + catch-up. The probe composes a BROKER-FREE canary
      (`mcp:'empty'`, no `--mcp-config`, no broker verb) carrying the routine's
      containment flags (non-empty `--tools`, full deny list, `--strict-mcp-config`,
      `--setting-sources ""`, temp add-dirs) and asserts the escape ground truth
      (canary unread, no out-of-staging write). It never composes a broker, touches
      the real config, reads a real secret, or leaks the canary; it is skipped under
      the test seams so `npm test` spends no quota.

## Acceptance criteria

- [ ] `runContainmentProbe(paths, {profileId:'daily-digest', probeCmd: fake})`
      returns `pass`/`fail`/`inconclusive` from the fake exactly as the dream path,
      and NEVER throws; the composed canary argv has NO `--mcp-config` (broker-free);
      the dream default (`profileId` absent) is unchanged.
- [ ] `runJob` for a `skill:` job runs the probe before spawning; a probe `pass`
      proceeds, a `fail`/`inconclusive` throws `WienerdogError` (no spawn) and fails
      loud; the probe is skipped under `opts.skipContainmentProbe`.
- [ ] The CATCH-UP path is gated: `catchUp` (→ `runJob`) for a `skill:` job runs the
      probe and halts on a `fail`/`inconclusive` (asserted, not just the interactive
      `run-job <name>` branch).
- [ ] `builtin:dream` dispatch and the dream's own WP-135 probe are unchanged.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass (no live Claude, no quota).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "containment-probe"
npm test -- --test-name-pattern "run-job"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED at this WP
```

## Out of scope (do NOT do these)

- Opening `external-content-routine` — `WP-flip-frozen-profile-allowed`.
- The negative-harness broker-verb fix — `WP-negative-harness-broker-verbs`.
- A per-version probe cache (deferred optimization, WP-135).
- Managed-policy hook handling (WP-132, WARN-not-STOP).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(runtime): pre-routine live containment self-check (WP-routine-containment-probe)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
