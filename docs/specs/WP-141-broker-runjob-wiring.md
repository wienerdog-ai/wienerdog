---
id: WP-141
title: Wire the broker into the routine runtime — fill the broker-mcp.json seam, trusted launch descriptor, MCP tool allowlist, read-only vault snapshot, functional routine skills (audit A2)
status: Draft
model: opus
size: M
depends_on: [WP-137, WP-138, WP-139]
adrs: [ADR-0004, ADR-0007, ADR-0008, ADR-0025, ADR-0026]
branch: wp/141-broker-runjob-wiring
---

# WP-141: Wire the broker into the routine runtime — fill the broker-mcp.json seam, trusted launch descriptor, MCP tool allowlist, read-only vault snapshot, functional routine skills (audit A2)

## Context (read this, nothing else)

Wienerdog installs files. **IRON RULE (ADR-0004): Wienerdog is just files** — no
daemons/servers/telemetry; nothing outlives its job. Node ≥ 18, zero runtime deps (only
`googleapis`), JSDoc types, no build step.

A1 (ADR-0025) made every routine run under a **hermetic runtime profile** and left the
Google broker as a **seam**: `src/core/routine-runtime.js` composes a routine run with
**exactly one** absolute-path broker MCP config expected at
`<core>/runtime/broker-mcp.json`; absent → the routine fails closed (contained-and-inert).
A2 (ADR-0026) built the broker pieces: the **transport** (WP-136), the **verb registry**
(WP-137), the **least-scope credentials** (WP-138), and the **grant store** (WP-139).
**This WP wires them together** and fills the seam so a routine becomes
*contained-and-functional*:

1. write the **per-run broker MCP config** at the seam, embedding the routine's identity
   in the **broker's spawn argv** (the **trusted launch descriptor** — the broker learns
   "I am `daily-digest`" from Wienerdog's code, never from model input; closes audit F5);
2. assemble the **real** broker registry (verbs + credentials + grant check) in the
   `wienerdog gws _broker` entry;
3. extend the composition to **`--allowedTools mcp__<broker>__<verb>`** for exactly the
   routine's verbs (CONFIRMED: `--tools` governs built-ins only; MCP tools need their own
   allowlist), set a per-server `timeout`, and set `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`
   so the `run-job` supervisor stays the single timeout authority;
4. copy a **bounded, read-only vault snapshot** into a staging subdir and add it
   read-only via `--add-dir` (the "bounded input snapshots" deferred from WP-131
   D-ROUTINE-VAULT-READ);
5. **rewrite the three routine `SKILL.md` bodies** to call broker verbs instead of the
   now-removed `wienerdog gws` Bash CLI, and **regenerate their integrity digests**.

**A2 opens NO capability gate.** `external-content-routine` / `gws-use` stay BLOCKED
(`src/core/safety-profile.js` untouched): `run-job`'s `resolveCommand` still calls
`requireCapability(EXTERNAL_CONTENT_ROUTINE)` **first**, so a routine still fails closed
in production. This WP makes the composition *runnable-when-unblocked* and is exercised
only via unit tests + the WP-142 harness (the `allowAll()` code seam). `wienerdog safety`
shows all five BLOCKED after this WP.

## Current state

- **`src/core/routine-runtime.js`** (WP-131): `composeRoutineRun(paths, job)` →
  `{command,args,cwd,shell:false}`; `brokerMcpConfigPath(paths, profile)` returns
  `<core>/runtime/broker-mcp.json` **if it exists**, else `null` → `composeClaudeArgs`
  throws (fail closed). `ensureRoutineStaging(paths, routineId)` makes the fresh 0700
  staging cwd. `addDirs:[cwd]` today (staging only, no vault).
- **`src/core/runtime-profile.js`** (WP-128): `PROFILES` with per-profile
  `tools`/`disallowedTools`/`mcp`/`permissionMode`/`skillId`; `composeClaudeArgs(profile,
  ctx)` emits `--tools`, `--disallowedTools`, `--permission-mode`, `--add-dir` per dir,
  `--strict-mcp-config`, optional `--mcp-config`, `--setting-sources ""`, `--settings`,
  optional `--append-system-prompt`/`--model`. **It emits NO `--allowedTools`.**
  `weekly-review` is `mcp:'empty'` with an explicit **"A2-RESTORE"** comment to flip to
  `'broker'` (it drafts email). `daily-digest`/`inbox-triage` are `mcp:'broker'`,
  `tools:['Read']`.
- **`src/cli/run-job.js`**: `buildCleanEnv(paths, name, platform)` sets `WIENERDOG_JOB`;
  `resolveCommand` delegates `skill:` to `composeRoutineRun` after the A0 freeze; spawn
  uses the returned `cwd`. Records run evidence (WP-132) for `skill:` jobs.
- **`src/cli/gws-broker.js`** (WP-136): the hidden `_broker` entry runs `runBrokerServer`
  with a **stub empty registry** — this WP fills it with the real registry.
- **`src/gws/broker/registry.js`** (WP-137) `buildRegistry({services, routineId,
  grantCheck, ...})`; **`credentials.js`** (WP-138) `loadCredentialServices(paths, class)`;
  **`grant-store.js`** (WP-139) `grantCheck(paths, routineId, kind)`.
- **`src/core/runtime-settings.js`** (WP-129): `loadVendoredSkill(skillId)` verifies the
  skill body against `runtime-skill-digests.json` (a byte change requires regenerating the
  digest). `RUNTIME_DIR(paths)` = `<core>/runtime`.
- **Routine `SKILL.md` bodies** currently instruct `wienerdog gws …` Bash calls — dead
  under A1 (no Bash). They must be rewritten for broker verbs.
- **CONFIRMED (wd-researcher 2026-07-18):** `mcp__<server>__<tool>` naming; `--tools` does
  not constrain MCP tools (need `--allowedTools`); `--mcp-config` is additive so
  `--strict-mcp-config` is required (WP-131 already emits it); per-server `timeout` honored
  since 2.1.203/2.1.206; `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` disables >2min auto-background
  (2.1.212).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/routine-runtime.js | `brokerMcpConfigPath` becomes a per-run WRITER of `broker-mcp.json` embedding the trusted `--routine <id>` descriptor + `env` + `timeout`; add the read-only vault snapshot into `--add-dir` |
| modify | src/core/runtime-profile.js | add `brokerVerbs` per routine profile + emit `--allowedTools mcp__<broker>__<verb>` for exactly those; flip `weekly-review` `mcp:'broker'` |
| modify | src/cli/gws-broker.js | assemble the REAL registry (verbs + per-class credentials + grant-store `grantCheck`) from the `--routine` descriptor; fail closed on an unknown routine |
| modify | src/cli/run-job.js | set `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` in the routine clean env; ensure the routine id reaches the descriptor writer |
| create | src/core/vault-snapshot.js | bounded, read-only vault snapshot copier (D-VAULT-SNAPSHOT: fixed dirs, byte/count caps, 0700 staging subdir) |
| modify | skills/wienerdog-daily-digest/SKILL.md | rewrite Google steps to broker verbs (no `wienerdog gws` Bash); read the snapshot via Read |
| modify | skills/wienerdog-inbox-triage/SKILL.md | rewrite to `gmail_search`/`gmail_read`/`create_draft` broker verbs |
| modify | skills/wienerdog-weekly-review/SKILL.md | rewrite to snapshot-read + `create_draft` broker verb |
| modify | src/core/runtime-skill-digests.json | regenerate the three routine skill digests (byte change → new sha256) |
| create | tests/unit/broker-wiring.test.js | seam-writer emits a config with the trusted `--routine` argv + timeout + env; `--allowedTools` names exactly the profile verbs; snapshot bounded + read-only; unknown routine fails closed |
| modify | tests/unit/routine-runtime.test.js | reconcile the seam-writer + snapshot behavior |
| modify | tests/unit/runtime-profile.test.js | reconcile `--allowedTools` + weekly-review broker flip |

### Exact contracts

**1. Per-run broker MCP config (the trusted launch descriptor).** `brokerMcpConfigPath`
becomes `ensureBrokerMcpConfig(paths, profile)`: for a `mcp:'broker'` profile it WRITES
`<core>/runtime/broker-mcp.json` (0600, atomic) and returns its absolute path; for
`mcp:'empty'` returns `null`. The written config points the single broker server at the
Wienerdog bin with the routine id **in the broker's argv**:

```json
{
  "mcpServers": {
    "wienerdog-broker": {
      "command": "<node abs path>",
      "args": ["<wienerdog bin abs path>", "gws", "_broker", "--routine", "daily-digest"],
      "env": { "WIENERDOG_HOME": "<core>", "CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS": "0" },
      "timeout": <ms>
    }
  }
}
```

- The `--routine <id>` in `args` is the **trusted launch descriptor**: written by
  Wienerdog code, never model-suppliable. The broker (`gws-broker.js`) reads its identity
  from there (closes F5). **The design does NOT rely on env inheritance** (ADR-0026
  SPIKE-env-inheritance): identity is argv; credentials are files; the `env` block only
  re-asserts `WIENERDOG_HOME` + the auto-background-off flag.
- Per-run rewrite is safe: `ensureRoutineStaging` already wipes per run; the config is
  regenerated each run so a stale routine id can never leak across runs. (If two routines
  can run concurrently — catch-up — write per-routine filenames `broker-mcp-<id>.json` and
  return that; **D-BROKER-CONFIG-PATH**, recommend per-routine filename for concurrency
  safety.)

**2. `--allowedTools` for MCP verbs.** `runtime-profile.js` gains `brokerVerbs: string[]`
per routine profile (the exact WP-137 verb names the routine may call):
- `daily-digest`: `['calendar_list','gmail_search','gmail_read','send_digest_to_self']`
- `inbox-triage`: `['gmail_search','gmail_read','create_draft']`
- `weekly-review`: `['create_draft']`
`composeClaudeArgs` emits `--allowedTools mcp__wienerdog-broker__calendar_list,mcp__wienerdog-broker__gmail_search,…`
for exactly those (never a wildcard `mcp__*`). The built-in `--tools`/`--disallowedTools`
stay as A1 set them (`Read` allowed; Bash/etc denied). **SPIKE-permission-modes:** confirm
the headless permission-mode value that makes an exact `--allowedTools` non-interactive
against `code.claude.com/docs/en/permission-modes` before pinning it into the composer;
routine verbs must not be `requiresUserInteraction` (denied headlessly).

**3. `gws-broker.js` real registry.** The `_broker` entry parses `--routine <id>`, maps it
to a profile (reuse `profileIdForSkill`/`getProfile`), loads the per-capability credentials
its `brokerVerbs` need (`loadCredentialServices(paths, class)` for each class in use), and
builds the registry via `buildRegistry({services, routineId, grantCheck:(rid,kind)=>
grantStore.grantCheck(paths,rid,kind).allowed})`. An unknown routine id, a missing
credential, or a scope-verification failure → the broker refuses that verb (fail closed);
a fatal setup error exits non-zero (the routine then fails loud via run-job). The broker
still writes ONLY framed JSON-RPC to stdout.

**4. `src/core/vault-snapshot.js` (D-VAULT-SNAPSHOT).**

```js
/** Copy a BOUNDED, read-only slice of the vault into a staging subdir for a routine to
 *  Read. Fixed source dirs per profile (e.g. the newest reports/dreams file; the last N
 *  07-Daily notes), hard byte + file-count caps, 0700 dir / 0600 files, symlink-safe
 *  (reuse physicalPath/sameDir). Returns the snapshot dir to add read-only via --add-dir
 *  plus the list of files skipped for exceeding a cap (D-VAULT-SNAPSHOT exceed behavior:
 *  skip VISIBLY, never silently, never fail the run) — the caller records skips in the
 *  WP-132 run evidence and stages them for the digest's state-driven warning banner
 *  (WP-125 precedent).
 *  A hijacked routine can read the snapshot but never the live vault (no write, bounded).
 *  @param {import('./paths').WienerdogPaths} paths @param {string} routineId
 *  @param {string} stagingDir
 *  @returns {{snapshotDir:string, skipped:Array<{file:string, reason:string}>}} */
function makeVaultSnapshot(paths, routineId, stagingDir)
```

`composeRoutineRun` calls it and adds the snapshot dir to `addDirs` (read intent only —
the staging cwd stays the sole WRITE target). The vault itself is never in `--add-dir`
(a hijacked routine cannot read/rewrite live memory notes — the WP-131 D-ROUTINE-VAULT-READ
guarantee, now with a bounded read-only copy instead of nothing).

**5. Routine SKILL rewrites.** Replace every `wienerdog gws …` Bash instruction with the
corresponding broker verb (a tool call, not Bash) and every vault path read with a Read of
the snapshot dir. The daily-digest send step becomes `send_digest_to_self` (no recipient —
the broker resolves self). Regenerate each skill's `runtime-skill-digests.json` sha256 in
the same commit (WP-129's integrity gate refuses a body that does not match its digest).

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-BROKER-CONFIG-PATH (recommend per-routine filename).** Fixed `broker-mcp.json`
  regenerated per run vs per-routine `broker-mcp-<id>.json`. Recommend **per-routine
  filename** so two concurrent routines (catch-up) never share/clobber a config; update
  `ensureBrokerMcpConfig`/`brokerMcpConfigPath` accordingly.
- **D-VAULT-SNAPSHOT — RESOLVED (OWNER-APPROVED 2026-07-18): fixed dirs + caps +
  visible skip.** daily-digest → the single newest `reports/dreams/*.md`; weekly-review
  → the last 7 `07-Daily/*.md` + last 7 `reports/dreams/*.md`; inbox-triage → none. Hard
  caps: ≤ 32 files, ≤ 2 MB total, per-file ≤ 256 KB (bounded like the WP-118 transcript
  intake; ~100× above realistic legit sizes). **Exceed behavior (owner-mandated): an
  over-cap file is skipped, never silently** — recorded in the WP-132 run evidence and
  surfaced on the next digest via the existing state-driven warning-banner mechanism
  (WP-125 exclusion-banner precedent). Never fail the whole run for one oversized file.
- **D-SKILL-REWRITE-OWNER (recommend here, atomic with the digest).** Whether the SKILL
  prose rewrites live here (atomic with the digest regen, needed for function) or in the
  WP-143 docs WP. Recommend **here**: a byte change to a skill MUST regenerate its integrity
  digest in the same commit, and WP-142's positive functional check needs broker-calling
  skills; WP-143 refines user-facing prose but does not re-freeze digests.

## SPIKEs (resolve with a live measurement before Ready)

- **SPIKE-permission-modes** — the exact headless permission-mode that pairs with an exact
  `--allowedTools` (contract 2). Confirm against the official permission-modes doc.
- **SPIKE-mcp-tool-naming** — confirm the live `mcp__<server>__<verb>` names Claude Code
  actually exposes for this broker match what `--allowedTools` lists (a mismatch silently
  blocks every verb). WP-142's live harness is the backstop.

## Implementation notes & constraints

- **The A0 freeze stays FIRST.** `resolveCommand` still calls
  `requireCapability(EXTERNAL_CONTENT_ROUTINE)` before any composition — production
  routines fail closed. Nothing here reaches production; tests use the `allowAll()`/code
  seam.
- **Trusted descriptor is argv, never env** (SPIKE-env-inheritance is thus irrelevant to
  identity integrity). The broker never trusts `WIENERDOG_JOB` for identity (F5).
- **Exact `--allowedTools`, never a wildcard.** List each verb; do not use `mcp__*`.
- **Broker is a per-job child (ADR-0004).** WP-136's lifecycle self-check must hold; if the
  runtime orphans the child, the supervisor-reap follow-up is required before A2 proceeds
  (a spec-gap, not patched here).
- **Idempotent/reversible:** the per-run config + snapshot live under the core (disposable
  by uninstall). Regenerated per run; no manifest entry. Skill digest regen is deterministic.
- **This is the largest A2 WP (integration).** If the reviewer cannot run a literal command
  for any deliverable, that is a split signal — flag it back to wd-architect, do not paper over.
- Zero deps, JSDoc only. When uncertain, choose simpler + record it.

## Security checklist

- [ ] A routine's Google access flows ONLY through the single broker MCP whose config is
      Wienerdog-written with the routine identity in the broker's argv (not model-suppliable;
      not env-derived — closes F5). The composition allowlists EXACTLY the routine's broker
      verbs via `--allowedTools` (never a wildcard), keeps built-ins at `Read` + the A1 deny
      list, and adds only a bounded read-only vault snapshot to `--add-dir` (never the live
      vault; staging stays the sole write target). An unknown routine / missing credential /
      grant/integrity failure fails closed. The `external-content-routine` gate still throws
      first in production. The broker leaves no orphan (ADR-0004).

## Acceptance criteria

- [ ] `ensureBrokerMcpConfig` writes a 0600 config whose broker `args` contain
      `--routine <profile-id>`, a `timeout`, and `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0`;
      the returned path is absolute; a `mcp:'empty'` profile returns null. (unit)
- [ ] `composeClaudeArgs` for a routine emits `--allowedTools` naming exactly the profile's
      `brokerVerbs` (as `mcp__wienerdog-broker__<verb>`), never a wildcard; built-ins
      unchanged. (unit)
- [ ] `weekly-review` is `mcp:'broker'`; its `brokerVerbs` is `['create_draft']`. (unit)
- [ ] `gws _broker --routine <known>` assembles a registry from the real verbs +
      credentials + grant store; an unknown routine fails closed with no server started. (unit)
- [ ] `makeVaultSnapshot` produces a bounded (≤ caps), 0700/0600, read-only snapshot; the
      live vault is never added to `--add-dir`; staging stays the sole write target. (unit)
- [ ] The three routine `SKILL.md` bodies call broker verbs (no `wienerdog gws` Bash) and
      their `runtime-skill-digests.json` entries match the new bytes (loadVendoredSkill
      passes). (unit + grep)
- [ ] In production (frozen profile), a `skill:` job still throws at
      `requireCapability(EXTERNAL_CONTENT_ROUTINE)` before composing. (unit)
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "broker-wiring"
npm test -- --test-name-pattern "routine-runtime"
npm test -- --test-name-pattern "runtime-profile"
npm test
npm run lint
node bin/wienerdog.js safety     # all five gates BLOCKED
grep -rn "wienerdog gws" skills/wienerdog-daily-digest skills/wienerdog-inbox-triage skills/wienerdog-weekly-review  # empty — no Bash CLI left
```

## Out of scope (do NOT do these)

- Broker transport/verbs/credentials/grant internals — **WP-136..WP-139** (a gap there is a
  spec-gap back to wd-architect).
- The live negative + poisoned-email E2E proof — **WP-142** (this WP makes it runnable).
- Threat-model/README/GLOSSARY prose + the 7-day-expiry posture doc — **WP-143**.
- Opening the `external-content-routine` / `gws-use` gate — never in A2.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body, with the SPIKE
   findings (permission-mode, MCP tool naming) and tested Claude version.
2. Branch `wp/141-broker-runjob-wiring`; conventional commits; PR titled
   `feat(runtime): wire the GWS broker into the routine runtime — seam, descriptor, verbs, snapshot (WP-141)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
