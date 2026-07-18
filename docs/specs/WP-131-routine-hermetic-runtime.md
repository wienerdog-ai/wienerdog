---
id: WP-131
title: Hermetic routine runtime — code-owned profile lookup, staging dir, single broker MCP seam (audit A1)
status: Ready
model: opus
size: M
depends_on: [WP-128, WP-129]
adrs: [ADR-0004, ADR-0008, ADR-0025]
branch: wp/131-routine-hermetic-runtime
---

# WP-131: Hermetic routine runtime — code-owned profile lookup, staging dir, single broker MCP seam (audit A1)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Node ≥ 18,
zero runtime deps, JSDoc types, no build step.

**Routines** (GLOSSARY: **routine**; ADR-0008 catalog) are scheduled `claude -p` jobs
run by `wienerdog run-job <name>` from the OS scheduler: **daily digest**, **inbox
triage**, **weekly review**. A 2026-07-15 security audit (action **A1**,
`00-SYNTHESIS.md` RC1/R1) named the routine path the **defining containment defect**:
`run-job.js` `resolveCommand` dispatches a `skill:<name>` job as a bare
`claude -p /<skill>` — Wienerdog defines no tools, settings, hooks, MCP, or filesystem
roots, so a hijacked routine over a malicious email inherits whatever ambient authority
the user's global config grants (Bash, a plugin, an inherited hook). This is R1, "the
bridge that makes the same-user condition reachable from untrusted external content."

**ADR-0025 (read it, incl. its 2026-07-18 Amendment 1)** decides routines run under a
**code-owned hermetic runtime profile** (WP-128): a minimal built-in surface expressed as
an **explicit non-empty allowlist** (measured: empty `--tools` exposes ALL built-ins — so
"none" is `tools:['Read']`, never `[]`); no general Bash/WebFetch/WebSearch/Task/Agent/
Skill/Workflow/NotebookEdit; no generic Read-Write/HTTP/GWS-CLI; a hook-free settings
profile (WP-129); a fresh staging
directory as the only writable output; and **exactly one** absolute-path local
Wienerdog **broker** MCP (or none), whose implementation is **A2's** boundary — this WP
specs only the **seam**. There is **no arbitrary `skill:<string>` dispatch**: a routine
is resolved by name against the WP-128 registry, unknown → fail closed.

**A1 opens NO capability gate — critically here.** The `external-content-routine` gate
stays **BLOCKED** (A0/WP-111): `resolveCommand` still calls
`requireCapability(EXTERNAL_CONTENT_ROUTINE)` and still throws before any spawn. This WP
builds the hermetic composition a routine *would* run under and makes it fail-closed and
inspectable — it does **not** let a routine run in production. The composition is
exercised only by unit tests (argv) and the WP-133 live harness (via the code seam).

Terminology (ADR-0025): **hermetic runtime profile** — never "sandbox" (that word is
`src/core/sandbox-guard.js`, the redirect warning). Reuse its `physicalPath()`/`sameDir()`
for staging-containment path identity.

## Current state

**`src/cli/run-job.js`** `resolveCommand(paths, job, profile)`:

```js
if (kind === 'skill') {
  requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile); // A0 freeze — BLOCKED, throws
  return { command: 'claude', args: ['-p', `/${rest}`], shell: false }; // ← unreachable today, but the target
}
```

`runJob(paths, job, opts)` calls `resolveCommand(paths, job)` (no `profile` arg → the
frozen profile → the gate throws), then spawns `{command, args}` with a clean env
(`buildCleanEnv`), `cwd: vaultDir`, a watchdog, and the WP-124 redaction tee. The three
shipped routine skills currently *assume* ambient tools — e.g.
`skills/wienerdog-daily-digest/SKILL.md` says "You have the normal harness tools plus the
`wienerdog gws` and `wienerdog` CLIs" and calls `wienerdog gws gmail search …` (Bash).
Under A1 those Bash/CLI paths are gone; the routine's Google work moves behind the A2
broker MCP. That is expected — A1 contains; A2 makes routines functional again.

**WP-128** exports `getProfile(id)`, `listRoutineProfileIds()`, `composeClaudeArgs(profile,
ctx)`, `RuntimeProfileError`; routine profiles have an explicit **minimal non-empty**
`tools` allowlist (e.g. `['Read']`, never `[]` — empty `--tools` = ALL built-ins, measured),
`disallowedTools` = `[Bash,WebFetch,WebSearch,Task,Agent,Skill,Workflow,NotebookEdit]`, and
`mcp:'broker'|'empty'`.
**WP-129** exports `ensureSettingsProfile(paths)` and `loadVendoredSkill(skillId)`.

A `job.run` is `skill:<name>` today; `<name>` is a skill id like `wienerdog-daily-digest`.
There is no mapping from a `job.run` skill id to a routine **profile id**
(`daily-digest`) yet, and no routine staging dir or broker MCP seam.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/routine-runtime.js | resolve a `job.run` → routine profile id (code-owned map, fail closed); `composeRoutineRun(paths, job)` → `{command,args,cwd}`; `ensureRoutineStaging`; broker-MCP seam |
| modify | src/cli/run-job.js | `resolveCommand` `skill:` branch delegates to `routine-runtime.js` (keeps the `requireCapability` freeze BEFORE composition); spawn uses the returned staging cwd |
| create | tests/unit/routine-runtime.test.js | profile-id mapping (known/unknown fail closed), composed argv (no Bash/ambient/user-settings, one broker MCP), staging cwd, gate-still-blocked |
| modify | tests/unit/run-job.test.js | reconcile `resolveCommand` expectations for the `skill:` branch |

### Exact contracts

**1. `src/core/routine-runtime.js`.** Maps a scheduled job to a code-owned routine
profile and composes its hermetic run. No spawn here — it returns command+args+cwd for
`run-job.js` to spawn (mirroring `resolveCommand`).

```js
'use strict';
const path = require('node:path');
const { getProfile, composeClaudeArgs, RuntimeProfileError } = require('./runtime-profile');
const { ensureSettingsProfile, loadVendoredSkill } = require('./runtime-settings');
const { mkdirPrivate } = require('./private-fs');

/** Code-owned skill-id → routine-profile-id map. The ONLY bridge from a config
 *  `skill:<id>` to a profile; an unmapped id fails closed (no arbitrary dispatch). */
const SKILL_TO_PROFILE = Object.freeze({
  'wienerdog-daily-digest': 'daily-digest',
  'wienerdog-inbox-triage': 'inbox-triage',
  'wienerdog-weekly-review': 'weekly-review',
});

/** @param {string} skillId @returns {string} routine profile id — throws
 *  RuntimeProfileError on an unmapped skill (fail closed; no arbitrary `skill:` dispatch). */
function profileIdForSkill(skillId) { /* SKILL_TO_PROFILE[skillId] or throw */ }

/** Fresh, empty, 0700 staging dir for ONE routine run: the routine's cwd AND its only
 *  writable output channel. Wiped+recreated per run. Under the core (disposable).
 *  @param {import('../core/paths').WienerdogPaths} paths @param {string} routineId @returns {string} */
function ensureRoutineStaging(paths, routineId) { /* mkdirPrivate(state/routine-run/<routineId>), wiped */ }

/** Absolute path to the routine's single broker MCP config, or null when the profile is
 *  mcp:'empty'. THE A2 SEAM: A2 writes this config (the credential-holding local stdio
 *  broker). Until A2, this returns a fixed sentinel path that does NOT exist, so a
 *  broker-requiring routine composed here fails closed in composeClaudeArgs (no
 *  --mcp-config → RuntimeProfileError) — the routine is contained AND inert until A2.
 *  @param {import('../core/paths').WienerdogPaths} paths @param {import('./runtime-profile').RuntimeProfile} profile @returns {string|null} */
function brokerMcpConfigPath(paths, profile) { /* profile.mcp==='broker' ? <A2 seam path> : null */ }

/**
 * Compose a routine's hermetic run (command + argv + cwd). Does NOT check the capability
 * gate — run-job.js does that FIRST (the A0 freeze). Fail closed on an unmapped skill or
 * a broker-requiring routine with no broker config (A2 not yet wired).
 * @param {import('../core/paths').WienerdogPaths} paths
 * @param {{name:string, run:string}} job   run == 'skill:<skillId>'
 * @returns {{command:string, args:string[], cwd:string, shell:false}}
 */
function composeRoutineRun(paths, job) {
  const skillId = job.run.slice(job.run.indexOf(':') + 1);
  const profile = getProfile(profileIdForSkill(skillId));         // fail closed on unknown
  const settingsPath = ensureSettingsProfile(paths);
  const cwd = ensureRoutineStaging(paths, profile.id);
  const args = composeClaudeArgs(profile, {
    prompt: `/${skillId}`,                                        // the routine trigger
    addDirs: [cwd],                                              // ONLY the staging dir is writable
    settingsPath,
    mcpConfigPath: brokerMcpConfigPath(paths, profile),          // broker (A2) or null → fail closed if required
    model: null,
    appendSystemPrompt: loadVendoredSkill(skillId),              // integrity-checked body (D-SKILL-LOAD)
  });
  return { command: 'claude', args, cwd, shell: false };
}

module.exports = { SKILL_TO_PROFILE, profileIdForSkill, ensureRoutineStaging, brokerMcpConfigPath, composeRoutineRun };
```

**2. `src/cli/run-job.js` — `resolveCommand` delegates, freeze stays first.** The
`skill:` branch keeps `requireCapability(EXTERNAL_CONTENT_ROUTINE, profile)` as its FIRST
statement (unchanged A0 freeze — throws before any composition), then delegates to
`composeRoutineRun`. `resolveCommand`'s return type gains an optional `cwd` so the spawn
uses the routine staging dir instead of `vaultDir`:

```js
if (kind === 'skill') {
  requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile); // A0 freeze FIRST — still BLOCKED
  return require('../core/routine-runtime').composeRoutineRun(paths, job); // {command,args,cwd,shell:false}
}
```

In `runJob`, if `resolveCommand` returns a `cwd`, spawn with that cwd (the staging dir);
otherwise keep `cwd: vaultDir` (the `builtin:dream` path is unchanged). The clean env
(`buildCleanEnv`), watchdog, log tee, and fail-loud are unchanged.

### Worked example (routine argv the composition would produce, gate hypothetically open)

```
claude -p "/wienerdog-daily-digest" \
  --tools Read   (explicit MINIMAL allowlist — NEVER an empty --tools, which would expose ALL built-ins) \
  --disallowedTools Bash,WebFetch,WebSearch,Task,Agent,Skill,Workflow,NotebookEdit \
  --add-dir <core>/state/routine-run/daily-digest   (ONLY writable root) \
  --strict-mcp-config --mcp-config <A2 broker config> \
  --setting-sources ""   (empty — loads nothing ambient; measured-accepted, WP-128 amendment) \
  --settings <core>/runtime/settings.json \
  --append-system-prompt "<verified wienerdog-daily-digest body>"
# cwd = <core>/state/routine-run/daily-digest (fresh, empty, 0700). No vault write access.
# In PRODUCTION this argv is NEVER reached — requireCapability(EXTERNAL_CONTENT_ROUTINE) throws first.
# weekly-review has mcp:'empty' → no --mcp-config, cwd staging only.
```

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-BROKER-SEAM (A1 side) — RESOLVED (OWNER-APPROVED 2026-07-18): fail closed on a
  non-existent A2 sentinel.** A broker-requiring routine (`daily-digest`, `inbox-triage`)
  needs a `--mcp-config`; A2 has not built the broker.
  - **Approved: `brokerMcpConfigPath` returns a fixed, non-existent A2 sentinel path
    for a `mcp:'broker'` profile, so `composeClaudeArgs` fails closed** (WP-128 throws
    `RuntimeProfileError` when `mcp:'broker'` but no usable config) — the routine is
    *contained and inert* until A2 wires a real broker at that seam. The seam path and
    the "A2 owns this" contract are recorded here so A2 has one place to plug in.
  - **Counterargument (accepted):** a non-existent config path means the unit test for a
    broker-routine composition asserts a *throw*, not a full argv — slightly less
    coverage of the broker argv shape now. Mitigation: the composer's `--mcp-config`
    emission is already unit-tested in WP-128 with a synthetic absolute path; here we
    additionally assert the fail-closed behavior, which is the security-relevant property
    pre-A2. The alternative (write a stub empty MCP config so composition succeeds) risks
    a routine appearing runnable-but-toothless and masking the "A2 not wired" state — the
    owner rejected it for exactly that reason.

- **D-ROUTINE-VAULT-READ — RESOLVED (OWNER-APPROVED 2026-07-18): staging-only, no vault,
  snapshot deferred to A2.** Weekly review's shipped skill reads `<vault>/reports/dreams/`
  and writes notes; daily digest reads the latest dream report. Under A1 the routine gets
  neither.
  - **Approved: NO vault access and NO snapshot in the A1 routine profile** — the routine's
    only root is its staging dir. Rationale: giving a routine `--add-dir <vault>` would let
    a hijacked routine read/rewrite memory notes — exactly the ambient-filesystem authority
    A1 removes. Containment holds even with zero vault access; the routine simply cannot do
    its job until A2, which is correct — production routines stay BLOCKED regardless.
  - **A2 owns restoring routine FUNCTION as one coherent, reviewed unit.** The bounded
    read-only vault-snapshot machinery (audit A1 point 3, "bounded input snapshots") is
    deferred to A2 and wired there **together with the broker** — so a routine regains its
    vault-read and its Google access in the same reviewed change, not in A1 fragments. This
    is the durable A2 hand-off: A1 contains (wraps the routine inert); A2 uncontains-and-
    enables (snapshot + broker + the eventual gate/go decision). Recorded so A2 picks it up.
  - **Counterargument (accepted):** staging bounded snapshots are extra machinery A1 does
    not need to *contain*; shipping A1 staging-only keeps the containment WP small and
    honest and avoids pre-empting A2's snapshot+broker design.

## Implementation notes & constraints

- **The gate check stays FIRST and unchanged.** `requireCapability(EXTERNAL_CONTENT_ROUTINE)`
  must run before ANY composition/staging/spawn. A reviewer will confirm a routine still
  fails closed in production; the composition below the gate is only reachable via the
  code seam (tests/harness pass an `allowAll()`/profile seam — never env/argv).
- **No arbitrary skill dispatch.** `profileIdForSkill` maps only the three shipped skill
  ids; an unmapped `skill:<x>` throws `RuntimeProfileError` (fail closed) — a hand-edited
  `config.yaml` job with a novel skill name cannot compose an argv, let alone spawn.
- **Staging is the only writable root.** `--add-dir` lists ONLY the staging dir; a routine
  cannot write the vault, `~/.wienerdog`, or home. Reuse `physicalPath()`/`sameDir()` if
  you assert staging distinctness. Wipe+recreate staging per run (no cross-run leakage).
- **A2 is the broker's home.** Do not build the broker, load OAuth, or make a routine
  functional. Leave the three routine `SKILL.md` bodies **unchanged** — rewriting them for
  the broker verbs is A2's job; changing them here would touch files outside this WP's
  region and pre-empt A2's design.
- **Idempotent, reversible.** Staging + settings live under the core (disposable by
  uninstall, WP-068/ADR-0019); no manifest entry.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] A config-supplied `skill:<name>` is resolved by exact match against the code-owned
      `SKILL_TO_PROFILE` map; an unmapped name throws (fail closed) with no spawn. The
      composed routine argv restricts built-ins to an explicit minimal allowlist (never an
      empty `--tools`, which would expose ALL built-ins), denies
      Bash/WebFetch/WebSearch/Task/Agent/Skill/Workflow/NotebookEdit, loads no ambient
      setting source (`--setting-sources ""`), uses the hook-free
      `--settings` profile, has exactly one broker MCP (or none) as its only external-effect
      surface, and writes only its staging dir — no vault/home/secrets access. The
      `external-content-routine` gate still throws before any of this runs in production.

## Acceptance criteria

- [ ] `profileIdForSkill('wienerdog-daily-digest') === 'daily-digest'`;
      `profileIdForSkill('anything-else')` throws `RuntimeProfileError` (fail closed).
- [ ] `composeRoutineRun` (invoked with the gate seam allowing it, in a test) returns a
      `cwd` under `state/routine-run/<id>` (0700, empty), args with `--setting-sources ""`
      (never `user`), an explicit non-empty minimal `--tools` allowlist (never empty),
      the expanded deny list, `--settings <hook-free>`, and — for a broker profile with no
      A2 config — **throws** (fail closed) per D-BROKER-SEAM.
- [ ] In production (frozen profile), `resolveCommand` for a `skill:` job **throws** at
      `requireCapability(EXTERNAL_CONTENT_ROUTINE)` before composing/staging/spawning
      (assert the throw and that no staging dir is created).
- [ ] `builtin:dream` dispatch is unchanged (still `node wienerdog dream --yes`, cwd vault).
- [ ] The three routine `SKILL.md` files are byte-unchanged.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "routine-runtime"
npm test -- --test-name-pattern "run-job"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
git diff --stat skills/wienerdog-daily-digest skills/wienerdog-inbox-triage skills/wienerdog-weekly-review  # empty — skills untouched
```

## Out of scope (do NOT do these)

- The dream path (`brain.js`/`dream.js`) — **WP-130**.
- Building the A2 GWS broker, OAuth, credential handling, or rewriting the routine skill
  bodies for broker verbs — **A2**.
- Bounded vault-snapshot machinery for routines — deferred to **A2** per D-ROUTINE-VAULT-READ.
- Opening the `external-content-routine` gate — a future reviewed release, never this WP.
- Managed-policy preflight + run evidence — **WP-132**.
- The live negative harness — **WP-133**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/131-routine-hermetic-runtime`; conventional commits; PR titled
   `feat(runtime): hermetic routine composition — code-owned profiles, staging, broker seam (WP-131)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
