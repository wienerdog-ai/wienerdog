---
id: WP-132
title: Managed-policy hook preflight (STOP unattended) + hermetic-run evidence record (audit A1)
status: Draft
model: opus
size: M
depends_on: [WP-130, WP-131]
adrs: [ADR-0004, ADR-0025]
branch: wp/132-policy-hook-preflight-and-run-evidence
---

# WP-132: Managed-policy hook preflight (STOP unattended) + hermetic-run evidence record (audit A1)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Node ≥ 18,
zero runtime deps, JSDoc types, no build step.

After WP-130 (dream) and WP-131 (routine), every headless `claude -p` job composes a
**code-owned hermetic runtime profile** (ADR-0025): no ambient setting source, a
hook-free `--settings` profile with `disableAllHooks`, an empty or single-broker MCP,
and a staging cwd. Two audit-**A1** items remain (points 7 and 8):

1. **Managed-policy hook preflight (point 7).** `disableAllHooks` and excluding the user
   setting source stop *user-scope* hooks. But an **enterprise/admin managed policy** can
   inject hooks that the model-run cannot disable. If such a policy is present, an
   **unattended** hermetic run is no longer hermetic — so preflight must **detect it and
   STOP** the unattended run with a fixed, fail-loud alert, rather than run
   non-hermetically and pretend it's contained.
2. **Run evidence (point 8).** Every hermetic run must record, in durable evidence, the
   **Claude version, the resolved executable identity, the profile id, the argv, the
   settings digest, and the MCP digest** — so the run's actual runtime posture is
   auditable after the fact (and so the WP-133 harness and a human can confirm what
   really ran).

This WP adds both at the two spawn sites (dream `spawnBrain`, routine `runJob`), plus
two small pure-ish modules. It changes containment posture (a new STOP condition) and
observability (a new record); it opens no gate and makes no routine runnable.

Terminology (ADR-0025): **hermetic runtime profile** — never "sandbox" (that word is
`src/core/sandbox-guard.js`, the redirect warning).

**A1 opens NO capability gate.** `wienerdog safety` must still show all five gates
BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/cli/run-job.js`** `runJob` composes the run (WP-131 `resolveCommand`), builds the
clean env, and spawns under a watchdog with the WP-124 log tee, then fail-loud on
nonzero/timeout (durable `alerts.jsonl` via `appendAlert`, best-effort email). The clean
env is deterministic (`buildCleanEnv`). `gen.nodePath()`/`gen.wienerdogBin(paths)` resolve
absolute executables for the dream builtin.

**`src/core/dream/brain.js`** `spawnBrain` spawns `claude` (or the fake) with the
hermetic argv (WP-130) and the redaction tee, returning `{child, done}`.

**WP-129** exports `settingsDigest(settingsPath)` and `ensureSettingsProfile`.
**WP-128** exports `getProfile`/`composeClaudeArgs`. **WP-126** exports
`writeFilePrivate` (0600 atomic). `appendAlert(paths, {...})` (src/core/alerts.js) is the
durable, bounded, secret-free alert channel (WP-096 caps field sizes).

There is **no** managed-policy detection and **no** run-evidence record anywhere. The
`failLoud` path is the model for a durable, secret-free alert.

Managed-settings locations are OS-specific and version-dependent (see D-POLICY-HOOK).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/policy-hooks.js | `detectPolicyHooks(paths, env)` → `{present:boolean, sources:string[]}` (read-only, never throws) |
| create | src/core/run-evidence.js | `recordRunEvidence(paths, rec)` — append a bounded secret-free JSONL record (0600) |
| modify | src/cli/run-job.js | preflight STOP (fail-loud) when policy hooks present + attended-run carve-out; record evidence per run |
| modify | src/core/dream/brain.js | record evidence for the dream run (version, exec path, profile, argv, digests) |
| create | tests/unit/policy-hooks.test.js | detection present/absent + read-only + never-throws |
| create | tests/unit/run-evidence.test.js | record shape, 0600, bounded, secret-free (no raw argv secret leak) |
| modify | tests/unit/run-job.test.js | preflight STOP path + attended carve-out + evidence recorded |

### Exact contracts

**1. `src/core/policy-hooks.js`.** Read-only detection of admin/managed-policy hooks that
`disableAllHooks` may not override. Never writes, never spawns, never throws.

```js
'use strict';
/** @typedef {{present:boolean, sources:string[]}} PolicyHookReport */

/**
 * Detect whether an enterprise/admin MANAGED policy defines Claude Code hooks that a
 * model-run cannot disable. Reads only the KNOWN managed-settings locations for the
 * platform (D-POLICY-HOOK), parses defensively (a malformed file → treat as "cannot
 * prove absence" → present:true, fail closed), and returns the source paths that carried
 * a hook. NEVER throws (a read/parse error degrades to present:true with the path noted).
 * @param {import('./paths').WienerdogPaths} paths
 * @param {NodeJS.ProcessEnv} env
 * @param {{platform?:NodeJS.Platform, readFile?:(p:string)=>string, locations?:string[]}} [seams] test injection
 * @returns {PolicyHookReport}
 */
function detectPolicyHooks(paths, env, seams = {}) { /* read known managed-settings paths, hooks present? */ }

module.exports = { detectPolicyHooks };
```

**2. `src/core/run-evidence.js`.** Append one bounded, secret-free record per hermetic run.

```js
'use strict';
const path = require('node:path');
const { appendFilePrivate } = require('./private-fs'); // if absent, use writeFilePrivate-style append; see notes

/** @typedef {Object} RunEvidence
 * @property {string} at            ISO timestamp
 * @property {string} job           'dream' | routine name
 * @property {string} profileId     the hermetic profile id
 * @property {string} claudeVersion output of `claude --version` (captured by the caller)
 * @property {string} execPath      resolved absolute path of the spawned executable
 * @property {string[]} argv        the composed argv (the appended skill body is REPLACED by its sha256 — see notes)
 * @property {string} settingsDigest  sha256 of the --settings file (WP-129 settingsDigest)
 * @property {string} mcpDigest       sha256 of the --mcp-config file, or 'none'
 */

/**
 * Append a RunEvidence record to core/state/run-evidence.jsonl at 0600, bounded (cap the
 * file like alerts.jsonl / WP-096; drop the oldest when over the cap) and SECRET-FREE:
 * the caller MUST pass an argv whose free-text fields (the `--append-system-prompt` skill
 * body and the `-p` prompt, which can echo staged content) are already reduced to a
 * sha256 placeholder — this module NEVER stores raw prompt/skill bytes. Never throws
 * (evidence is best-effort; a failure must not fail the job).
 * @param {import('./paths').WienerdogPaths} paths @param {RunEvidence} rec
 */
function recordRunEvidence(paths, rec) { /* mkdirPrivate(state), append JSONL 0600, bounded */ }

module.exports = { recordRunEvidence };
```

**3. `run-job.js` preflight + evidence.** Before spawning a routine (after the gate check,
before `buildCleanEnv`/spawn):

```js
const report = require('../core/policy-hooks').detectPolicyHooks(paths, process.env);
if (report.present && isUnattended(opts)) {
  const reason = `refused: a managed/admin policy defines hooks that cannot be disabled ` +
    `(${report.sources.join(', ')}) — an unattended hermetic run is not contained under this policy. ` +
    `See ADR-0025; accepting a managed-policy runtime is a future reviewed decision.`;
  jobsLib.writeScheduleState(paths, name, { last_status: 'error', last_error_at: nowIso() });
  await failLoud(paths, name, reason, opts);
  throw new WienerdogError(`job "${name}" ${reason}`);
}
```

After a run completes, `recordRunEvidence(paths, {...})` with the captured version/exec/
argv/digests (argv free-text reduced to sha256 per the contract).

**4. `brain.js` evidence.** `spawnBrain` (or `dream.js` around it) records the dream run's
evidence with `job:'dream'`, `profileId:'dream'`, the resolved `claude` path, the argv
(skill body → sha256), and the settings/MCP digests. The dream is attended-or-scheduled;
the policy preflight for the dream lives in `run-job.js` (the dream runs as
`builtin:dream` under `runJob`), so `spawnBrain` only records evidence — the STOP is at
the `runJob` layer for both paths. Confirm the dream's scheduled invocation flows through
`runJob` (it does: `run:'builtin:dream'`); a direct `wienerdog dream` (attended) is
carved out by `isUnattended`.

### `isUnattended(opts)` (attended carve-out)

An unattended run is one launched by the OS scheduler (`run-job`); an attended run is a
human at a terminal (`wienerdog dream` with a TTY, or `run-job` invoked interactively).
Recommended signal: treat a run as **unattended** when it is not on a TTY
(`process.stdout.isTTY` false) — the scheduler child has no TTY. A human debugging at a
terminal (TTY present) is attended and the STOP downgrades to a **loud warning** (they
chose to run it). Record the exact predicate under "Decisions made" (D-POLICY-HOOK covers
the policy posture; this is the attended/unattended split).

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-POLICY-HOOK — managed-policy posture + detection locations.**
  - **Recommended: a managed-policy hook is a HARD STOP for unattended runs, with NO
    runtime accept-opt in v1** (consistent with the A0 no-override posture); an attended
    TTY run downgrades to a loud warning. Detection reads the known managed-settings
    locations — on macOS `/Library/Application Support/ClaudeCode/managed-settings.json`,
    on Linux `/etc/claude-code/managed-settings.json` (the documented enterprise policy
    paths) — plus any location a quick wd-researcher check confirms for the pinned Claude
    version; a hook key present there → STOP. A read/parse failure fails closed (treated
    as present).
  - **Counterargument:** (a) the exact managed-settings paths and whether `disableAllHooks`
    actually fails to override them are **version-dependent runtime facts** — this needs a
    short **wd-researcher** confirmation against Claude Code 2.1.212 before the locations
    are hard-coded, and the WP-133 live harness should include a managed-policy fixture if
    feasible; (b) a hard STOP with no accept-opt means an enterprise-managed machine
    cannot run the dream at all until a future release — which is the *safe* default but
    may frustrate a legitimately-managed user. Recommend shipping the hard STOP now
    (fail-closed is the audit's posture) and treating "a reviewed accept path" as a future
    WP if a real managed user hits it.
  - *(If wd-researcher finds `disableAllHooks` DOES override managed hooks on the pinned
    version, this preflight becomes a belt-and-suspenders WARNING instead of a STOP —
    record that finding as the ruling.)*

- **D-EVIDENCE — executable-identity depth.**
  - **Recommended: record the Claude version + the resolved absolute executable path (and
    the settings/MCP digests), but NOT a content hash of the `claude` binary.** Executable
    *integrity* (a fake `claude` earlier on PATH, a mutated binary) is **A7's** boundary;
    A1's evidence documents *what ran* so A7/audit can verify later. Hashing the binary
    every run is expensive and churns on every Claude update.
  - **Counterargument:** without a binary hash, the evidence can't by itself prove the
    executable wasn't swapped — but that proof is explicitly A7's job, and recording the
    path+version is enough for A7 to build on. Recommend path+version now; A7 adds the hash.

## Implementation notes & constraints

- **Secret-free evidence.** The argv contains the `-p` prompt (which can echo staged
  content) and the `--append-system-prompt` skill body. NEVER store those raw. Replace each
  free-text argv value with a `sha256:<hex>` placeholder before recording; the flags and
  fixed values (`--tools`, `--strict-mcp-config`, `--settings <path>`) are safe to record
  verbatim. A unit test plants a secret in a prompt and asserts it never appears in the
  evidence file (mirror the WP-124 secret-free-alert test).
- **Never fail the job for evidence/preflight-read errors.** `recordRunEvidence` and
  `detectPolicyHooks` never throw; a failure is swallowed (the preflight STOP is a
  *deliberate* throw, not an error). The `maybeRefresh`/status-probe pattern in `run.js`
  (try/catch that never alters the exit code) is the model.
- **Bounded like alerts.jsonl.** `run-evidence.jsonl` is capped (drop oldest over the cap,
  reuse the WP-096 bounding approach); 0600 via private-fs. If `appendFilePrivate` does
  not exist, read-cap-rewrite atomically with `writeFilePrivate` (note which you used).
- **Reuse, don't reinvent.** Version capture = `spawnSync('claude', ['--version'])` with
  the clean env, bounded, best-effort (`'unknown'` on failure). Exec path = the resolved
  command (absolute where `gen.*` provides it; else the spawned name).
- **Do NOT open a gate**; `safety-profile.js` untouched.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] An unattended scheduled run STOPs fail-loud when a managed/admin policy defines
      hooks (fail closed on a malformed policy file too); an attended TTY run downgrades to
      a loud warning. Run evidence is 0600, bounded, and **secret-free** — the prompt and
      skill body are reduced to sha256, never stored raw, so the evidence file cannot leak a
      staged secret. Neither the preflight read nor the evidence write can throw and fail
      the job (only the deliberate policy STOP throws).

## Acceptance criteria

- [ ] `detectPolicyHooks` returns `present:false` when no managed-settings file defines
      hooks, `present:true` with the source path(s) when one does, and `present:true`
      (fail closed) on a malformed/unreadable policy file; it performs no writes and never
      throws (assert via injected `readFile`/`locations` seams — never the real OS paths).
- [ ] An unattended `run-job` with policy hooks present throws a `WienerdogError` after a
      durable fail-loud alert and creates no spawn; with policy hooks absent it proceeds;
      an attended (TTY) run warns and proceeds.
- [ ] `recordRunEvidence` appends a JSONL record with the version/execPath/profileId/argv
      (free-text → sha256)/settingsDigest/mcpDigest, 0600, bounded; a planted secret in the
      prompt never appears in the file.
- [ ] The dream run records evidence with `job:'dream'`, `profileId:'dream'`.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "policy-hooks"
npm test -- --test-name-pattern "run-evidence"
npm test -- --test-name-pattern "run-job"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Verifying the `claude`/`git` executable integrity (hash/owner/PATH) — **A7**.
- A reviewed "accept a managed-policy runtime" path — future WP.
- The live negative harness — **WP-133** (it will assert canaries + inventory live).
- Any change to the composed argv itself — **WP-130/WP-131** own composition.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/132-policy-hook-preflight-and-run-evidence`; conventional commits; PR titled
   `feat(runtime): managed-policy hook preflight + hermetic-run evidence (WP-132)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
