---
id: WP-132
title: Managed-policy hook preflight (warn + record) + hermetic-run evidence record (audit A1)
status: In-Review
model: opus
size: M
depends_on: [WP-130, WP-131]
adrs: [ADR-0004, ADR-0025]
branch: wp/132-policy-hook-preflight-and-run-evidence
---

# WP-132: Managed-policy hook preflight (warn + record) + hermetic-run evidence record (audit A1)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Node ≥ 18,
zero runtime deps, JSDoc types, no build step.

After WP-130 (dream) and WP-131 (routine), every headless `claude -p` job composes a
**code-owned hermetic runtime profile** (ADR-0025): no ambient setting source, a
hook-free `--settings` profile with `disableAllHooks`, an empty or single-broker MCP,
and a staging cwd. Two audit-**A1** items remain (points 7 and 8):

1. **Managed-policy hook preflight (point 7).** `disableAllHooks` and excluding the user
   setting source stop *user-scope* hooks (spike-confirmed on 2.1.214). But an
   **enterprise/admin managed policy** can inject hooks that a user/project/local
   `disableAllHooks` cannot override. That is the enterprise admin's own deliberate config,
   **not reachable by an attacker's transcript/email content** (setting one needs admin
   rights) — so it is trusted-computing-base, the same category as A12/A7, not an A1
   attacker vector. Preflight must **detect it, warn loudly, and record it** (a documented
   trusted-computing-base residual — managed hooks are the admin's config, not an attacker
   vector), rather than run non-hermetically and pretend it's contained. The run
   **proceeds** — it does not STOP (D-POLICY-HOOK, resolved WARNING; full rationale in the
   DECISION NEEDED block).
2. **Run evidence (point 8).** Every hermetic run must record, in durable evidence, the
   **Claude version, the resolved executable identity, the profile id, the argv, the
   settings digest, and the MCP digest** — so the run's actual runtime posture is
   auditable after the fact (and so the WP-133 harness and a human can confirm what
   really ran).

This WP adds both at the two spawn sites (dream `spawnBrain`, routine `runJob`), plus
two small pure-ish modules. It adds observability (a new record) and a visible warning for
the managed-hook residual; it never STOPs a run, opens no gate, and makes no routine runnable.

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
| modify | src/cli/run-job.js | preflight: when policy hooks present, emit a loud durable warning + flag it for evidence, then PROCEED (no STOP); record evidence per run |
| modify | src/core/dream/brain.js | record evidence for the dream run (version, exec path, profile, argv, digests) |
| create | tests/unit/policy-hooks.test.js | detection present/absent + read-only + never-throws |
| create | tests/unit/run-evidence.test.js | record shape, 0600, bounded, secret-free (no raw argv secret leak) |
| modify | tests/unit/run-job.test.js | policy-hook present → warns + records + proceeds-to-spawn (no throw); evidence recorded |

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
 * @property {{present:boolean, sources:string[]}} policyHooks  managed-policy detection at
 *                                    this run (always recorded, whether or not a warning fired)
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

**3. `run-job.js` preflight + evidence.** Before spawning (after the gate check, before
`buildCleanEnv`/spawn), detect managed-policy hooks and, if present, emit a **loud durable
warning** and flag it for the evidence record — then **PROCEED to the normal spawn**. There
is **NO** `throw`, **NO** refusal, and **NO** `writeScheduleState(...,'error')` for this
case (D-POLICY-HOOK → WARNING). A managed hook is the admin's trusted config, not an
attacker vector; the requirement is that the non-hermetic state be *visible*, not that the
run be stopped:

```js
const report = require('../core/policy-hooks').detectPolicyHooks(paths, process.env);
let policyHookWarned = false;
if (report.present) {
  // Loud, durable, secret-free warning on the SAME channel failLoud uses (appendAlert).
  // NOT a failure: no writeScheduleState('error'), no throw — the run proceeds.
  appendAlert(paths, {
    job: name,
    at: nowIso(),
    reason:
      `warning: a managed/admin policy defines Claude Code hooks that cannot be disabled ` +
      `(${report.sources.join(', ')}) — this run is NOT fully hermetic under that policy. ` +
      `Managed hooks are your administrator's config (trusted-computing-base residual, ` +
      `see the threat model), not an attacker vector; the run continues. ADR-0025.`,
  });
  policyHookWarned = true; // captured in the run-evidence record below
}
// … normal buildCleanEnv + spawn continues unchanged …
```

After a run completes, `recordRunEvidence(paths, {...})` with the captured version/exec/
argv/digests (argv free-text reduced to sha256 per the contract) **plus** a
`policyHooks: {present, sources}` field so the evidence always captures the current
managed-policy state whether or not the warning fired.

> **Alert-fatigue is a DEFERRED revisit, not built here (owner-flagged).** A managed hook
> is present on *every* run, so a per-run warning will fatigue the user. v1 ships the plain
> per-run warning above (owner: "do it now, revisit later based on experience"). Do **not**
> build the state-change/fingerprint dedup now; the one-line pointer to the likely tuning
> (warn only on a managed-policy STATE CHANGE, WP-070 cache-then-render pattern) lives in
> the DECISION NEEDED REVISIT note — do not add new machinery for it.

**4. `brain.js` evidence.** `spawnBrain` (or `dream.js` around it) records the dream run's
evidence with `job:'dream'`, `profileId:'dream'`, the resolved `claude` path, the argv
(skill body → sha256), and the settings/MCP digests. The scheduled dream runs as
`builtin:dream` under `runJob`, so its managed-policy warning is emitted once at the
`runJob` layer (contract 3) — `spawnBrain` only records evidence. Include the same
`policyHooks: {present, sources}` field in the dream's evidence so the record is uniform
across both spawn paths.

> **No attended/unattended STOP gate.** Because the managed-hook case is now a WARNING that
> always proceeds (not a STOP), there is no attended-vs-unattended refusal split. The
> warning surfaces on the durable `appendAlert` channel regardless of TTY, so a scheduled
> (no-TTY) run and an interactive run are treated identically. **`isUnattended` is dropped
> from this WP** — it existed only to gate the removed STOP. (If a later revisit wants to
> tune *where* the warning surfaces, that is part of the deferred alert-fatigue work, not v1.)

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-POLICY-HOOK — RESOLVED (OWNER-APPROVED 2026-07-18, research-informed): WARNING +
  evidence + documented residual, NOT a hard STOP.** The original recommendation was a hard
  STOP; a wd-researcher pass against the official Claude Code docs
  (`memory/research/2026-07-18-managed-settings-hooks-override.md`) inverted it.
  - **Research facts (official docs, high confidence):**
    1. Managed-settings paths confirmed: macOS `/Library/Application
       Support/ClaudeCode/managed-settings.json`, Linux `/etc/claude-code/managed-settings.json`,
       Windows `C:\Program Files\ClaudeCode\managed-settings.json` (+ a `managed-settings.d/`
       drop-in dir). No env var redirects the path. Managed settings load independently of
       `--setting-sources` (which only takes `user|project|local`; `managed` isn't a valid value).
    2. `disableAllHooks` set at user/project/local level **cannot** disable a managed hook
       (verbatim from the hooks reference); only managed-level `disableAllHooks` can. The
       dangerous inverse bug (user `disableAllHooks` bypassing managed org hooks, GH
       anthropics/claude-code#26637) was **fixed in 2.1.49**; this machine runs **2.1.214**
       (note: not 2.1.212 — fix the version elsewhere in the A1 specs, esp. WP-133 D-CLAUDE-PIN).
  - **Why WARNING, not STOP:** wienerdog's containment rests on disabling *user-scope*
    hooks, which works (spike-confirmed on 2.1.214). A *managed* hook is the enterprise
    admin's deliberate config — **not reachable by an attacker's transcript/email content**
    (setting one needs admin rights), so it is trusted-computing-base, the same category as
    A12 (arbitrary same-user native code) and A7 (executable integrity), NOT an A1 attacker
    vector. A hard STOP would treat the trusted admin as an attacker and **brick the dream on
    every enterprise-managed machine** for a non-threat. The audit's own point-7 wording
    ("STOP **unless that policy is explicitly accepted as part of the trusted runtime**")
    already concedes the policy can be trusted; it only requires the non-hermetic state be
    **visible, not silent**.
  - **Approved posture:**
    - `detectPolicyHooks` stays (read-only, the confirmed paths; malformed/unreadable →
      `present:true`, fail closed). It never STOPs the run.
    - A managed hook present → a **loud warning** on the durable channel + it is recorded in
      the run-evidence record. The run proceeds.
    - The managed-hook case is a **documented residual** in the THREAT-MODEL (WP-134), same
      shelf as A12/A7.
    - A formal "explicitly accept a managed-policy runtime as trusted" path is a **future WP**
      (as originally scoped) — not built here.
  - **⚠️ REVISIT (owner-flagged 2026-07-18) — alert fatigue.** A managed hook is present on
    *every* run, so a per-run loud warning would fatigue the user. v1 ships the plain
    warning (owner: "do it now, revisit later based on experience"). The likely tuning,
    recorded here for the revisit: **emit the loud warning only on a managed-policy STATE
    CHANGE** — fingerprint the detected managed hook set and warn only when it first appears
    or changes vs the last run's recorded fingerprint (the WP-070 cache-then-render /
    state-change pattern), while the run-evidence record ALWAYS captures the current state.
    This keeps the signal honest and durable without nightly noise. Not built in v1; noted
    for the experience-based revisit.
  - **Version-floor (optional, soft):** a `claude --version` < 2.1.49 check MAY warn, but the
    research tied that fix to *managed*-hook bypass (org security), NOT to the reliability of
    wienerdog's *user*-hook disabling — so do not oversell it as a hard STOP; a soft warning
    at most. (Owner did not require it.)

- **D-EVIDENCE — RESOLVED (OWNER-APPROVED 2026-07-18): version + path + digests, NO binary
  hash.** Record the Claude version + the resolved absolute executable path + the
  settings/MCP digests, but **NOT a content hash of the `claude` binary.**
  - **Rationale (owner-reinforced):** executable *integrity* (a fake `claude` earlier on
    PATH, a mutated binary) is **A7's** boundary; A1's evidence documents *what ran* so
    A7/audit can verify later. A binary hash would also be **noisy in normal operation**:
    Claude Code auto-updates frequently (daily or multiple times a day) — this machine went
    **2.1.212 → 2.1.214 within a day** — so the hash would churn constantly and carry no
    signal about tampering vs a routine update. Path + version is the right A1 depth.
  - **Counterargument (accepted):** without a binary hash the evidence can't by itself prove
    the executable wasn't swapped — but that proof is explicitly A7's job, and path+version
    is enough for A7 to build on. (This frequent-update reality also bears on WP-133's
    D-CLAUDE-PIN — an exact version pin that fails the harness on every auto-update would be
    equally noisy; carry this observation there.)

## Implementation notes & constraints

- **Secret-free evidence.** The argv contains the `-p` prompt (which can echo staged
  content) and the `--append-system-prompt` skill body. NEVER store those raw. Replace each
  free-text argv value with a `sha256:<hex>` placeholder before recording; the flags and
  fixed values (`--tools`, `--strict-mcp-config`, `--settings <path>`) are safe to record
  verbatim. A unit test plants a secret in a prompt and asserts it never appears in the
  evidence file (mirror the WP-124 secret-free-alert test).
- **Never fail the job for evidence/preflight/policy-detection.** `recordRunEvidence` and
  `detectPolicyHooks` never throw; a failure is swallowed. The managed-hook case emits a
  warning and **proceeds** — nothing in this WP throws or refuses a run (the STOP was
  removed; D-POLICY-HOOK → WARNING). The `maybeRefresh`/status-probe pattern in `run.js`
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

- [ ] When a managed/admin policy defines hooks, the run emits a loud durable warning
      (the secret-free `appendAlert` channel), records the managed-policy state in the
      evidence record, and **proceeds to spawn** — it never STOPs, throws, or writes an
      error watermark for this case. Detection is still fail-closed in the sense that a
      malformed/unreadable policy file is treated as `present:true` (warn), but present ≠
      stop. Run evidence is 0600, bounded, and **secret-free** — the prompt and skill body
      are reduced to sha256, never stored raw, so the evidence file cannot leak a staged
      secret. Neither the policy detection nor the evidence write can throw and fail the job.

## Acceptance criteria

- [ ] `detectPolicyHooks` returns `present:false` when no managed-settings file defines
      hooks, `present:true` with the source path(s) when one does, and `present:true`
      (fail closed) on a malformed/unreadable policy file; it performs no writes and never
      throws (assert via injected `readFile`/`locations` seams — never the real OS paths).
- [ ] A `run-job` with policy hooks present emits a loud durable warning, records the
      managed-policy state in the evidence record, and **PROCEEDS to spawn** (no throw, no
      error watermark); with policy hooks absent it proceeds with no warning. A
      malformed/unreadable policy file still detects as `present:true` (fail-closed
      detection) and likewise warns-and-proceeds (never STOPs).
- [ ] `recordRunEvidence` appends a JSONL record with the version/execPath/profileId/argv
      (free-text → sha256)/settingsDigest/mcpDigest **and `policyHooks:{present,sources}`**,
      0600, bounded; a planted secret in the prompt never appears in the file. No field is
      or implies a content hash of the `claude` binary (executable integrity is A7).
- [ ] The dream run records evidence with `job:'dream'`, `profileId:'dream'`, and the same
      `policyHooks` field.
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

- Verifying the `claude`/`git` executable integrity (hash/owner/PATH) — **A7**. No binary
  content hash is recorded here (D-EVIDENCE); evidence carries version + path + digests only.
- A reviewed "explicitly accept a managed-policy runtime as trusted" path — future WP.
- **Any STOP/refusal for the managed-hook case** — resolved to WARNING (D-POLICY-HOOK); the
  run always proceeds.
- **The alert-fatigue state-change/fingerprint dedup** — deferred experience-based revisit
  (owner-flagged); v1 ships the plain per-run warning only.
- **The optional soft version-floor warning** (`claude --version` < 2.1.49) — not built in
  v1 (owner did not require it; a soft warning at most, deferred). It must never be a STOP.
- The live negative harness — **WP-133** (it will assert canaries + inventory live).
- Any change to the composed argv itself — **WP-130/WP-131** own composition.
- Threat-model text for the managed-hook residual — **WP-134** owns it (this WP only hands
  it off; do not write THREAT-MODEL prose here).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/132-policy-hook-preflight-and-run-evidence`; conventional commits; PR titled
   `feat(runtime): managed-policy hook preflight + hermetic-run evidence (WP-132)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
