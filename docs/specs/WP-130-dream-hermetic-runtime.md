---
id: WP-130
title: Make the dream brain hermetic — compose from the profile, hook-free settings, staging cwd (audit A1)
status: In-Review
model: opus
size: M
depends_on: [WP-128, WP-129]
adrs: [ADR-0004, ADR-0012, ADR-0025]
branch: wp/130-dream-hermetic-runtime
---

# WP-130: Make the dream brain hermetic — compose from the profile, hook-free settings, staging cwd (audit A1)

## Context (read this, nothing else)

Wienerdog installs files: a memory **vault**, skills, hooks, scheduled jobs. **IRON
RULE (ADR-0004): Wienerdog is just files** — no daemons/servers/telemetry. Node ≥ 18,
zero runtime deps, JSDoc types, no build step.

The nightly **dream** (ADR-0012) is the one headless `claude -p` job **reachable
today** (routines are frozen behind the A0 `external-content-routine` gate). It reads
the redacted scratch extracts (WP-118 bounded) and writes consolidated notes into the
**vault**; WP-017 validates the diff and WP-069 gates the watermark on scratch-intact.

A 2026-07-15 security audit (action **A1**, `00-SYNTHESIS.md` RC1) found the dream is
**not yet hermetic**: `buildClaudeArgs` passes `--setting-sources user`, which imports
the user's **hooks and plugins**. A hook runs *outside* the `--tools` allowlist and can
have shell/network side effects. **ADR-0025 (read it)** decides the dream runs under its
**code-owned hermetic runtime profile** (WP-128), a **hook-free settings profile**
(WP-129), a **vendored, integrity-checked** dream skill (WP-129), and a **fresh staging
cwd** — not the vault, not a user project.

This WP wires the dream onto that machinery. It is the **highest-value A1 change**:
the dream is the only job an attacker can reach through today's frozen posture.

Terminology (ADR-0025): **hermetic runtime profile** — never "sandbox" (reserved for
`src/core/sandbox-guard.js`). Reuse `sandbox-guard.js`'s `physicalPath()`/`sameDir()`
for staging-containment path identity; do not reinvent, do not remove that module.

**A1 opens NO capability gate.** `wienerdog safety` must still show all five gates
BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

**`src/core/dream/brain.js`** — `buildClaudeArgs({vaultDir, scratchDir, date, model,
layout})` returns the argv shown in WP-128's Current state (`--tools
Read,Write,Edit,Glob,Grep`, `--strict-mcp-config`, **`--setting-sources user`**).
`spawnBrain(o)` spawns `claude` (or the `WIENERDOG_DREAM_CMD` fake) with
`cwd: vaultDir`, `detached:true`, and tees stdout/stderr through `redactOnly` (WP-124
EP3). `DREAM_PROMPT(scratchDir, vaultDir, date, layout)` is the `-p` text: it begins
`/wienerdog-dream` and lists the scratch/vault paths and the layout (Bash is off, so
the skill cannot read env — paths travel in the prompt). Exports: `buildClaudeArgs`,
`buildCodexArgs`, `spawnBrain`, `DREAM_PROMPT`.

**`src/cli/dream.js`** — `run(argv)` acquires the lock, collects extracts to
`sel.scratchDir` (`state/dream-scratch`), baselines the scratch, pre-commits session
edits, then `runBrainWithWatchdog({vaultDir, scratchDir: sel.scratchDir, date, model,
layout, timeoutMs, logStream})`, which calls `spawnBrain({..., env: process.env,
logStream})`. `printPlan` (dry-run) calls `buildClaudeArgs(...)` to echo the argv.

**WP-128** exports `getProfile('dream')` and `composeClaudeArgs(profile, ctx)`.
**WP-129** exports `ensureSettingsProfile(paths)` (→ absolute settings path) and
`loadVendoredSkill('wienerdog-dream')` (→ integrity-checked body, throws on tamper).

The Codex brain (`buildCodexArgs`) is **out of scope** (Codex containment is A11/P2,
latent until M4); leave it byte-unchanged.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/layout.js | `layoutPromptLines`/`resolveDailyPath` gain an OPTIONAL `vaultDir` param → absolute tier paths when passed; omit → today's relative paths (back-compat) — the D-DREAM-CWD absolute-tier-path seam |
| modify | src/core/dream/brain.js | `buildClaudeArgs` composes from `getProfile('dream')` + WP-129 settings/skill; `DREAM_PROMPT` passes `vaultDir` so tier paths are absolute; `spawnBrain` sets a fresh staging cwd + ensures the settings profile; drop `--setting-sources user` |
| modify | src/cli/dream.js | pass the staging dir to `spawnBrain`; keep `printPlan` echoing the composed argv |
| modify | tests/unit/layout.test.js | assert `layoutPromptLines`/`resolveDailyPath` return absolute vault-prefixed paths WITH `vaultDir` and unchanged relative paths WITHOUT it (back-compat) |
| modify | tests/unit/dream-brain.test.js | assert the composed argv (no `--setting-sources user`, has `--settings`, has `disallowedTools`, empty MCP) + staging cwd + integrity-fail aborts + the prompt's tier paths are absolute/vault-prefixed |
| modify | tests/unit/dream.test.js | update any argv/cwd expectations the wiring changes (reconcile intentionally) |

> If the exact test file names differ, use the existing brain/dream unit test files
> (`grep -l buildClaudeArgs tests/unit`); do not create parallel new ones. If a golden
> pins the old argv, reconcile it intentionally per CLAUDE.md (this spec authorizes it).

### Exact contracts

**1. Absolute tier paths — the `layout.js` seam + `DREAM_PROMPT` (D-DREAM-CWD entailment).**
Because the brain's cwd is now a neutral staging dir (not the vault), the prompt must hand
the skill **absolute** tier paths — a relative `06-Identity/…` would resolve under
`<staging>/…`, outside the `--add-dir` roots (write fails / silently lost). Add an
**optional** `vaultDir` param to the two path producers in `src/core/layout.js`:

```js
/** @param {VaultLayout} layout @param {string} date @param {string} [vaultDir]
 *  @returns {string} vault-relative POSIX path, OR — when vaultDir is passed — that path
 *  joined under vaultDir (absolute). Back-compat: omit vaultDir → today's behavior. */
function resolveDailyPath(layout, date, vaultDir) {
  const rel = path.posix.join(layout.daily_dir, /* filename token-substituted as today */);
  return vaultDir ? path.join(vaultDir, rel) : rel;
}

/** @param {VaultLayout} layout @param {string} date @param {string} [vaultDir]
 *  @returns {string[]} the tier lines; each dir is joined under vaultDir (absolute) when
 *  vaultDir is passed, else the relative name (today's behavior). */
function layoutPromptLines(layout, date, vaultDir) {
  const dir = (d) => (vaultDir ? path.join(vaultDir, d) : d);
  return [
    `Identity notes directory: ${dir(layout.identity_dir)}`,
    `Skills directory: ${dir(layout.skills_dir)}`,
    `Daily log file for today: ${resolveDailyPath(layout, date, vaultDir)}`,
    `Projects directory: ${dir(layout.projects_dir)}`,
    `Inbox directory: ${dir(layout.inbox_dir)}`,
    `Reports directory: ${dir(layout.reports_dir)}`,
  ];
}
```

Then `DREAM_PROMPT(scratchDir, vaultDir, date, layout)` in `brain.js` passes `vaultDir`
into `layoutPromptLines(lay, date, vaultDir)` so every tier line is absolute and
vault-prefixed. **Traversal-safety is unchanged:** `readVaultLayout`/`isSafeRelativePath`
still store and validate only safe **relative** values; absolutization happens only here,
at prompt-build time, by joining an already-validated safe-relative tier under the trusted
`vaultDir`. **Back-compat:** the param is optional — `adopt.js`'s `resolveDailyPath(layout,
'2026-07-03')` (a human-readable example) and `brain.js`'s `WIENERDOG_DREAM_LAYOUT` env
`daily_today` (joined under the absolute `WIENERDOG_DREAM_VAULT` by the fake-brain seam)
pass no `vaultDir` and stay byte-identical.

**2. `buildClaudeArgs` — compose, don't hand-assemble.** Replace the literal flag list
with a call into WP-128's composer using the dream profile and WP-129's assets (the
`DREAM_PROMPT` it calls now emits absolute tier paths, per contract 1):

```js
const { getProfile, composeClaudeArgs } = require('../runtime-profile');
const { ensureSettingsProfile, loadVendoredSkill } = require('../runtime-settings');

/** @param {{vaultDir, scratchDir, date, model, layout, settingsPath}} o @returns {string[]} */
function buildClaudeArgs({ vaultDir, scratchDir, date, model, layout, settingsPath }) {
  const profile = getProfile('dream');
  return composeClaudeArgs(profile, {
    prompt: DREAM_PROMPT(scratchDir, vaultDir, date, layout),
    addDirs: [vaultDir, scratchDir],           // the ONLY tool roots (write vault, read scratch)
    settingsPath,                               // WP-129 hook-free profile (absolute)
    mcpConfigPath: null,                        // dream → empty MCP (--strict-mcp-config, no --mcp-config)
    model: model || null,
    appendSystemPrompt: loadVendoredSkill('wienerdog-dream'), // D-SKILL-LOAD (WP-129): integrity-checked body
  });
}
```

The resulting argv MUST: keep the explicit `--tools Read,Write,Edit,Glob,Grep` allowlist
(never an empty `--tools` — measured to expose ALL built-ins; WP-128 amendment); add
`--disallowedTools Bash,WebFetch,WebSearch,Task,Agent,Skill,Workflow,NotebookEdit` (the
expanded deny list — redundant defense-in-depth naming the escalation surfaces the spike
found available); keep `--permission-mode acceptEdits`; keep `--add-dir vault` +
`--add-dir scratch`; keep `--strict-mcp-config` with **no** `--mcp-config`; **replace
`--setting-sources user`** with `--setting-sources ""` (empty — measured-accepted,
source-excluding; D-SETTING-SOURCES resolved) + `--settings <settingsPath>`; append the
verified skill body.
`loadVendoredSkill` **throwing** (skill tampered/missing) MUST abort the run before the
spawn — do not catch-and-continue.

**3. `spawnBrain` — fresh staging cwd + ensure the settings profile.** The brain's `cwd`
becomes a fresh, empty, Wienerdog-owned staging dir (D-DREAM-CWD), NOT `vaultDir`. Ensure
the WP-129 settings profile exists and pass its path into `buildClaudeArgs`:

```js
// inside spawnBrain, before building args:
const paths = getPaths();                       // require('../paths')
const settingsPath = ensureSettingsProfile(paths);
const stagingDir = ensureBrainStaging(paths);   // fresh empty dir, e.g. state/dream-run/ (0700, wiped each run)
// ... args = buildClaudeArgs({ vaultDir, scratchDir, date, model, layout, settingsPath });
const child = spawn(command, args, { cwd: stagingDir, detached: true, stdio:['ignore','pipe','pipe'], env: childEnv });
```

`ensureBrainStaging(paths)` creates an empty 0700 dir the brain cannot mistake for a
project (no `.claude`, no `CLAUDE.md`, no git). Wipe+recreate it each run so no state
leaks between runs. The vault + scratch remain reachable ONLY via `--add-dir`. The
`WIENERDOG_DREAM_CMD` fake-brain seam still runs (its cwd is the staging dir too);
existing fake-brain tests that write to the vault via the env vars keep working because
the vault path still travels in `childEnv.WIENERDOG_DREAM_VAULT`.

**4. `dream.js` — pass the staging dir through; keep the dry-run plan honest.** If
`spawnBrain` now owns staging creation, `dream.js` needs no staging change; but
`printPlan`'s `buildClaudeArgs(...)` call must pass a `settingsPath` so the dry-run echo
matches the real argv. Ensure the settings profile in the dry-run path too (idempotent),
or pass a representative path and note it. The dry-run must NOT spawn a brain (unchanged).

### Worked example (dream argv after this WP, dream profile)

```
claude -p "/wienerdog-dream
Scratch extracts directory (read-only inputs): <scratch>
Vault directory (your only write target): <vault>
Today's date: <date>
Vault layout — write to these mapped locations ...:
- Identity notes directory: <vault>/06-Identity
- Skills directory: <vault>/05-Skills
- Daily log file for today: <vault>/07-Daily/<date>.md
- Projects directory: <vault>/01-Projects
- Inbox directory: <vault>/00-Inbox
- Reports directory: <vault>/reports/dreams" \
  --tools Read,Write,Edit,Glob,Grep \
  --disallowedTools Bash,WebFetch,WebSearch,Task,Agent,Skill,Workflow,NotebookEdit \
  --permission-mode acceptEdits \
  --add-dir <vault> --add-dir <scratch> \
  --strict-mcp-config \
  --setting-sources ""   (empty — loads nothing ambient; measured-accepted) \
  --settings <core>/runtime/settings.json \
  --append-system-prompt "<verified wienerdog-dream body>" \
  [--model <model>]
# NOTE: no `--setting-sources user`, no `--mcp-config`. cwd = fresh staging dir, not the
# vault — so the tier paths in the prompt are ABSOLUTE and vault-prefixed (contract 1), never
# bare relative names that would resolve under the staging cwd and be lost.
```

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-DREAM-CWD — RESOLVED (OWNER-APPROVED 2026-07-18): fresh staging cwd.** The audit
  (A1 point 3) says run from a fresh staging directory, "not the vault or a user project."
  The dream's legitimate write target IS the vault (reached via `--add-dir`).
  - **Approved: cwd = a fresh, empty, Wienerdog-owned staging dir** (e.g.
    `state/dream-run/`, wiped+recreated each run, 0700), with the vault and scratch
    reachable only through `--add-dir`. Rationale: with a neutral empty cwd, Claude Code
    can never discover a project/local `settings.json`, `.claude/`, or `CLAUDE.md` under
    the cwd — closing the last ambient-inheritance vector that isn't covered by dropping
    `--setting-sources user`. This matters specifically because the vault is a git repo
    the dream itself writes to: a hijacked dream could otherwise plant `<vault>/CLAUDE.md`
    or `<vault>/.claude/settings.json` that a later `cwd=vault` run would load. The vault
    stays the write target; WP-017's diff validation (orchestrator's own `spawnSync('git',
    …)` against the vault, not the brain's cwd) is unaffected.
  - **ENTAILED SPEC-GAP — absolute tier paths: RESOLVED (architect amendment, 2026-07-18).**
    Verified in the walkthrough: the dream prompt hands the skill the **absolute** vault dir
    but **vault-RELATIVE** tier directory names (`identity_dir:'06-Identity'`,
    `skills_dir:'05-Skills'`, `resolveDailyPath` → `07-Daily/…`, `projects_dir:'01-Projects'`,
    `inbox_dir:'00-Inbox'`, `reports_dir:'reports/dreams'`, via `layoutPromptLines` in
    `src/core/layout.js`). Today those relative names resolve correctly ONLY because
    `cwd=vaultDir`. Moving cwd to a neutral staging dir would make a relative tier write land
    in `<staging>/…` (outside the `--add-dir` roots → the write fails or is silently lost
    when staging is wiped) — the "latent relative-path assumption" this decision's
    counterargument named, now confirmed real. The staging-cwd decision therefore **entails**
    handing the skill ABSOLUTE tier paths.
    - **Seam chosen (architect, 2026-07-18): option (a) — a `layout.js` seam.**
      `layoutPromptLines(layout, date, vaultDir)` and `resolveDailyPath(layout, date,
      vaultDir)` take an **optional** `vaultDir`; when it is passed, each returned tier path
      is joined under `vaultDir` (absolute); when it is omitted, behavior is **byte-identical
      to today** (relative POSIX paths). `brain.js`'s `DREAM_PROMPT` passes `vaultDir` so the
      prompt carries absolute tier paths; every other caller passes nothing and is unchanged.
      **Rationale:** the absolutization is a pure, unit-testable path transform that belongs
      next to the layout model it derives from (not string-shaped inside `brain.js`), and one
      seam keeps the two path producers (`layoutPromptLines`, `resolveDailyPath`) consistent.
      Cost: `src/core/layout.js` + its test join WP-130's Deliverables (see the table).
      Option (b) — absolutizing inside `brain.js` — was rejected as string-fragile and
      because it would duplicate join logic the layout module already owns.
    - **Traversal-safety contract is intact:** the stored/validated layout values stay safe
      relative paths (`isSafeRelativePath` unchanged; `readVaultLayout` still rejects
      absolute/`..`/backslash values). Absolutization happens only at PROMPT-BUILD time by
      joining an already-validated safe-relative tier under the trusted `vaultDir` — it does
      not change what is stored, validated, or accepted from config.
    - **Back-compat confirmed (all callers checked):** `resolveDailyPath` callers —
      `brain.js:33`/`layoutPromptLines` (opts into `vaultDir`), `brain.js:125`
      (`WIENERDOG_DREAM_LAYOUT` env `daily_today`: stays RELATIVE — the fake-brain seam joins
      it under the absolute `WIENERDOG_DREAM_VAULT` env, so unchanged), and `adopt.js:95`
      (`exampleDaily` — a human-readable example string, must stay relative, unchanged).
      `layoutPromptLines` caller — only `brain.js:33` (opts in) and the layout unit test.
      No other consumer exists; the optional param is additive.
  - *(Also consumes D-SETTING-SOURCES and D-SKILL-LOAD from WP-128/WP-129 — this WP plugs
    their resolved values into the composer.)*

## Implementation notes & constraints

- **Codex is untouched.** `buildCodexArgs` and the Codex spawn path stay byte-identical
  (A11/P2). Only the Claude dream path becomes hermetic here.
- **Reuse `physicalPath()`/`sameDir()`** from `sandbox-guard.js` if you assert the
  staging dir is distinct from the vault/scratch (symlink/case-alias safe). Do not add a
  second path-identity helper.
- **Absolute tier paths are load-bearing, not cosmetic.** Moving cwd off the vault WITHOUT
  absolutizing the prompt's tier paths silently loses every dream write (they land under the
  wiped staging dir). Contract 1 (the `layout.js` `vaultDir` seam) MUST land in the same WP
  as the cwd move; the layout `vaultDir` param stays OPTIONAL so no other caller changes.
- **The EP3 redaction tee (WP-124) stays.** `spawnBrain` still pipes stdout/stderr
  through `redactOnly` into the log/stderrTail — do not remove or reorder that.
- **Fail closed on skill integrity.** A tampered/missing dream skill (WP-129
  `loadVendoredSkill` throws) aborts the run before the spawn; `dream.js`'s existing
  error path (restore vault, fail loud via run-job) handles a thrown build.
- **Idempotent settings + staging.** `ensureSettingsProfile` (WP-129) and
  `ensureBrainStaging` write identical/empty state on every run — no cross-run leakage,
  no manifest entry (core subtree disposed by uninstall, WP-068/ADR-0019).
- **Do NOT open a gate.** No change to `safety-profile.js`; the dream was never gated,
  and this WP keeps it that way while making it hermetic.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] The composed dream argv loads **no** ambient setting source (`--setting-sources ""`,
      never `user`), supplies the hook-free `--settings` profile, restricts built-ins to the
      explicit `Read,Write,Edit,Glob,Grep` allowlist (never an empty `--tools`), denies
      Bash/WebFetch/WebSearch/Task/Agent/Skill/Workflow/NotebookEdit,
      uses an empty MCP config, and runs from a fresh staging cwd that contains no
      project/local settings — so an inherited user hook/plugin/MCP or a permissive Bash
      rule cannot reach the hijacked dream. The prompt's tier write targets are ABSOLUTE and
      vault-prefixed (so a neutral cwd loses no write), while `readVaultLayout`'s
      traversal-safety over stored relative values is unchanged. The vendored skill is
      integrity-checked before use; a tampered skill aborts the run. (Live-proven in WP-133; the argv/cwd
      is unit-asserted here.)

## Acceptance criteria

- [ ] `buildClaudeArgs` output contains `--tools Read,Write,Edit,Glob,Grep` (never an empty
      `--tools`), `--disallowedTools` naming Bash/WebFetch/WebSearch/Task/Agent/Skill/
      Workflow/NotebookEdit, `--setting-sources ""`, `--strict-mcp-config`, `--settings
      <core/runtime/settings.json>`, and the appended verified skill body; it does **not**
      contain `--setting-sources user` or `--mcp-config`.
- [ ] `spawnBrain` spawns with `cwd` = the fresh staging dir (not `vaultDir`); the vault
      and scratch are present as `--add-dir` roots; the staging dir is empty/0700 and
      recreated each run.
- [ ] The `DREAM_PROMPT` tier lines are **absolute and vault-prefixed** (e.g.
      `<vault>/06-Identity`, `<vault>/07-Daily/<date>.md`); no bare relative tier name
      (`06-Identity`, `07-Daily/…`) appears as a write target in the prompt.
- [ ] `layoutPromptLines(layout, date, vaultDir)` and `resolveDailyPath(layout, date,
      vaultDir)` return absolute vault-prefixed paths WITH `vaultDir`, and byte-identical
      relative paths WITHOUT it (back-compat); `readVaultLayout`/`isSafeRelativePath` are
      unchanged and still reject absolute/`..`/backslash config values.
- [ ] A forced dream-skill integrity mismatch (WP-129 seam) makes `buildClaudeArgs`/the
      dream run throw before spawning a brain (fail closed).
- [ ] The dry-run plan (`wienerdog dream --dry-run`) echoes the new composed argv and
      spawns no brain.
- [ ] Existing dream unit/golden tests pass after intentional argv/cwd reconciliation;
      the `WIENERDOG_DREAM_CMD` fake-brain path still writes the vault correctly.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "brain"
npm test -- --test-name-pattern "dream"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
grep -n "setting-sources" src/core/dream/brain.js || echo "no --setting-sources user in brain.js — OK"
```

## Out of scope (do NOT do these)

- The routine path (`run-job.js`) — **WP-131**.
- `buildCodexArgs` / Codex containment — **A11/P2**.
- Managed-policy preflight + run evidence — **WP-132** (this WP just makes the argv
  hermetic; WP-132 adds the preflight STOP and the evidence record at the spawn site).
- The live negative harness that proves containment at runtime — **WP-133**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/130-dream-hermetic-runtime`; conventional commits; PR titled
   `feat(runtime): hermetic dream brain — profile-composed argv, hook-free settings, staging cwd (WP-130)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
