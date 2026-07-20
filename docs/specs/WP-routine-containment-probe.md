---
id: WP-routine-containment-probe
title: Pre-routine live containment self-check (un-gate external-content-routine)
status: Draft
model: opus
size: M
depends_on: []
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

This WP generalizes the existing dream probe to any capability profile and runs it
fail-closed before every routine brain spawn.

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

`src/cli/run-job.js` `runJob(paths, job, opts)`:
- Calls `resolveCommand(paths, job, opts.profile)` (l.712). For a `skill:` job this
  calls `requireCapability(EXTERNAL_CONTENT_ROUTINE, opts.profile)` FIRST (blocked in
  production → throws before composition), then `composeRoutineRun` → `{command, args,
  cwd, shell}`.
- Spawns at l.780 with the composed `cwd`. Test/harness seams: `opts.resolveCommand`
  (fake command), `opts.profile` (`allowAll()` code seam).

`src/core/routine-runtime.js` exports `composeRoutineRun(paths, job)` and
`ensureBrokerMcpConfig(paths, profile)` (writes the per-run broker MCP config,
returns its absolute path, or null for `mcp:'empty'`). `runtime-profile.js`
`getProfile(id)` and `PROFILES` describe each routine (all three are `mcp:'broker'`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/containment-probe.js | `runContainmentProbe(paths, {profileId='dream', …})`; a routine profile composes its containment argv (real broker MCP config via `ensureBrokerMcpConfig`), probe prompt, temp add-dirs; dream path byte-unchanged |
| modify | src/cli/run-job.js | run the routine probe fail-closed before the `skill:` brain spawn (after `resolveCommand`, before `spawn`); skippable via test seam; HALT on non-`pass` |
| modify | tests/unit/containment-probe.test.js | pass/fail/inconclusive for a routine `profileId` via the `probeCmd` fake; dream default unchanged |
| modify | tests/unit/scheduler-runjob.test.js | a `skill:` spawn is gated on a probe `pass`; a fail/inconclusive halts (no spawn, fail-loud) |

### Exact contracts

**1. `runContainmentProbe` — generalize to a profile id.** Add `opts.profileId`
(default `'dream'`). Resolve `const profile = getProfile(opts.profileId)`. For a
`mcp:'broker'` profile, compose with the real per-run broker config so the probe
tests the EXACT production MCP posture (the canary prompt never calls a broker verb,
so no credential is exercised; the broker child is bounded and reaped with the
probe):

```js
const { ensureBrokerMcpConfig } = require('../routine-runtime');
// … inside runContainmentProbe, after building the temp workspace:
const profile = getProfile(opts.profileId || 'dream');
const mcpConfigPath = profile.mcp === 'broker' ? ensureBrokerMcpConfig(paths, profile) : null;
const composed = composeClaudeArgs(profile, {
  prompt: probePrompt(canaryPath, writePath),
  addDirs: [allowedDir, stagingDir],   // temp probe dirs, not the routine's real staging
  settingsPath,
  mcpConfigPath,
  model,
  appendSystemPrompt: null,            // the probe prompt, never the routine skill body
});
```

Everything else (temp workspace, static argv checks, ground-truth gates,
`permission_denials`, `finally` cleanup, never-throws) is UNCHANGED. `argvStaticOk`
already checks non-empty `--tools`, the full deny list, `--strict-mcp-config`, and
`--setting-sources ""` — all present in a routine argv too. The dream path
(`profileId` absent/`'dream'`) is byte-for-byte unchanged.

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

Place it AFTER `resolveCmd(...)` (l.712) and BEFORE the `spawn` (l.780), using the
already-built `env`. The `builtin:dream` path is unaffected (its probe is in
`dream.js`). `opts.skipContainmentProbe`/`opts.probeCmd` are code seams (tests only);
production sets neither.

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
- **The broker MCP is orthogonal to the escape canary** — the probe proves the
  escape-containment flags hold WITH the routine's MCP posture loaded; the broker's
  credential containment is A2's boundary (proven by `scenarios:broker-e2e`) and the
  tool-inventory containment is WP-133's negative harness.
- **Managed-policy residual (N1, ADR-0025 Amendment 3):** on a managed machine a
  routine still runs non-hermetically (WARN-and-proceed, WP-132); the probe does not
  change that trusted-admin case. Recorded, not blocked.
- Zero new deps; JSDoc types; no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] A routine brain spawns ⟺ the routine's containment probe returned `pass` on
      the actually-installed Claude; a `fail`/`inconclusive` HALTS the routine
      fail-closed (durable alert, no spawn). The probe composes the routine's REAL
      hermetic argv (non-empty `--tools`, full deny list, `--strict-mcp-config`,
      `--setting-sources ""`, temp add-dirs) and asserts the escape ground truth
      (canary unread, no out-of-staging write). It never touches the real config,
      reads a real secret, or leaks the canary; it is skipped under the test seams
      so `npm test` spends no quota.

## Acceptance criteria

- [ ] `runContainmentProbe(paths, {profileId:'daily-digest', probeCmd: fake})`
      returns `pass`/`fail`/`inconclusive` from the fake exactly as the dream path,
      and NEVER throws; the dream default (`profileId` absent) is unchanged.
- [ ] `runJob` for a `skill:` job runs the probe before spawning; a probe `pass`
      proceeds, a `fail`/`inconclusive` throws `WienerdogError` (no spawn) and fails
      loud; the probe is skipped under `opts.skipContainmentProbe`.
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
