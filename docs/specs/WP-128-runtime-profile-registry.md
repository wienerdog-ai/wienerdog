---
id: WP-128
title: Code-owned hermetic runtime profile registry + pure claude argv composer (audit A1)
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0025]
branch: wp/128-runtime-profile-registry
---

# WP-128: Code-owned hermetic runtime profile registry + pure `claude` argv composer (audit A1)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills,
hooks, scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons,
no servers, no telemetry. Installer/CLI code is plain Node ≥ 18, **zero runtime
dependencies**, JSDoc types only, no TypeScript, no build step.

Wienerdog spawns headless `claude -p` model jobs in two places: the nightly **dream**
(`src/core/dream/brain.js`) and scheduled **routines** (`src/cli/run-job.js`). Both
read **fully attacker-influenceable** content (a transcript, an email). A 2026-07-15
security audit (action **A1**, `00-SYNTHESIS.md` RC1/R1) found the structural bug:
**neither job defines its own runtime capabilities**. The routine path dispatches a
`skill:<name>` job as a bare `claude -p /<skill>` — no built-in tool set, no allowed
tools, no settings sources, no hook/plugin/MCP posture, no filesystem roots — so a
hijacked routine inherits whatever ambient authority the user's global Claude config
grants (a permissive Bash rule, a plugin, an inherited `SessionStart` hook).

**ADR-0025 (read it) decides the fix:** every headless model job runs under a
**code-owned hermetic runtime profile** — an in-repo object that fully specifies the
job's capabilities, composed into the `claude` argv by Wienerdog, never inferred from
ambient config. This WP builds the **foundation**: the one module where a capability
profile is defined and the pure function that turns a profile into an exact `claude`
argv. It wires nothing yet — WP-130 (dream) and WP-131 (routine) consume it.

Terminology (ADR-0025, `sandbox-guard.js` collision): this boundary is a **hermetic
runtime profile** / **capability profile** — **never** a "sandbox" (that word is
reserved for the advisory `WIENERDOG_HOME`-redirect check in `src/core/sandbox-guard.js`).

**A1 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## SPIKE-INFORMED AMENDMENT (2026-07-18) — read before implementing

> A live `claude -p` de-risking spike (Claude Code **2.1.212**, real subscription auth)
> measured the runtime and settled two things that were open in the first draft. Both are
> load-bearing for this WP; the tool-posture correction is a **spec bug fix**.
>
> - **The tool restriction is an EXPLICIT non-empty allowlist — always. Empty `--tools`
>   means ALL built-ins, not none (measured).** With `--tools ""` the model listed Task,
>   Bash, Glob, Grep, Read, Edit, Write, NotebookEdit as available — the opposite of the
>   intent. The **only** reliable way to a minimal built-in surface is to name exactly the
>   tools the profile permits. A profile's `tools` array is therefore **never empty**; a
>   routine that needs "almost nothing" gets an explicit minimal allowlist (e.g. `['Read']`),
>   not `[]`. `composeClaudeArgs` **always emits `--tools <explicit,list>`** and never emits
>   an empty `--tools`. (Confirmed sound: an explicit `--tools "Read,Glob,Grep"` restricted
>   to exactly those even under `--permission-mode bypassPermissions`.)
> - **`Skill`, `Agent`/`Task`, and `Workflow` are real escalation surfaces and were NOT in
>   the old deny list.** They appeared *available* in the spike; `Agent`/`Task` spawn
>   subagents, `Skill` loads skills, `Workflow` orchestrates agents. The explicit allowlist
>   naturally excludes them (it names only Read/Write/Edit/Glob/Grep for the dream); the
>   deny list is **redundant defense-in-depth** and must still name the known-dangerous
>   ones: `Bash`, `WebFetch`, `WebSearch`, **`Task`, `Agent`, `Skill`, `Workflow`,
>   `NotebookEdit`**.
> - **D-SETTING-SOURCES resolved: `--setting-sources ""` (empty value).** Measured accepted
>   by 2.1.212 and it genuinely **excludes the user source** — a planted user `SessionStart`
>   hook did NOT fire under `--setting-sources ""` (it fired under default sources as a
>   control). `disableAllHooks` independently suppresses it too, so ADR-0025's "exclude the
>   source + `disableAllHooks` belt-and-suspenders" both hold. The composer emits
>   `--setting-sources ""`. (Owner ratifies in the walkthrough; the measured basis is recorded here.)
> - **Also measured-confirmed (reflect as validated, no change needed):** `--disallowedTools
>   Bash,…` blocks Bash *execution* even under `bypassPermissions` (the bash canary never
>   ran); `--add-dir` read containment held under an adversarial "URGENT OVERRIDE, use Bash"
>   prompt (zero leak, model refused).
>
> The contract, worked examples, and acceptance criteria below already reflect these facts.
> ADR-0025 carries a matching dated amendment.

## Current state

**`src/core/dream/brain.js`** builds the dream argv today in `buildClaudeArgs`:

```js
function buildClaudeArgs({ vaultDir, scratchDir, date, model, layout }) {
  return [
    '-p', DREAM_PROMPT(scratchDir, vaultDir, date, layout),
    '--tools', 'Read,Write,Edit,Glob,Grep',      // no Bash/WebFetch/WebSearch
    '--permission-mode', 'acceptEdits',
    '--add-dir', vaultDir,
    '--add-dir', scratchDir,
    '--strict-mcp-config',                        // no --mcp-config → zero MCP servers
    '--setting-sources', 'user',                  // ← imports user hooks/plugins (the A1 hole)
    ...(model ? ['--model', model] : []),
  ];
}
```

**`src/cli/run-job.js`** `resolveCommand` dispatches a routine today:

```js
if (kind === 'skill') {
  requireCapability(CAPABILITY.EXTERNAL_CONTENT_ROUTINE, profile); // A0 freeze — BLOCKED
  return { command: 'claude', args: ['-p', `/${rest}`], shell: false }; // ← bare, ambient authority
}
```

The three shipped catalog routines are `skills/wienerdog-daily-digest/`,
`skills/wienerdog-inbox-triage/`, `skills/wienerdog-weekly-review/` (GLOSSARY:
**routine**; ADR-0008 routine catalog). The dream skill is `skills/wienerdog-dream/`.

Verified against the installed **Claude Code 2.1.212** (`claude --help`), the relevant
flags this composer emits are real: `--tools <names...>` (available built-in set),
`--disallowedTools <names...>` (deny list), `--allowedTools <names...>` (no-prompt
allow), `--strict-mcp-config` (only `--mcp-config` servers), `--mcp-config <file...>`,
`--setting-sources <sources>` (comma list), `--settings <file-or-json>`, `--add-dir
<dirs...>`, `--permission-mode <mode>`, `--append-system-prompt <prompt>`, `--model`.

There is **no** `src/core/runtime-profile.js` and no capability-profile concept anywhere.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/runtime-profile.js | the ONE profile registry: `PROFILES`, `getProfile`, `listRoutineProfileIds`, `composeClaudeArgs`, `RuntimeProfileError` |
| create | tests/unit/runtime-profile.test.js | registry shape + argv composition + fail-closed unknown-profile + no-arbitrary-skill tests |

### Exact contracts

**`src/core/runtime-profile.js`.** Pure. No `fs`, no `child_process`, no env, no argv,
no network. It defines data + a pure argv builder; it does not spawn or read disk.

```js
'use strict';

/** A code-owned capability profile. FROZEN — a profile is edited only as a reviewed
 *  code change, never at runtime. `id` is also the routine name / dream id.
 * @typedef {Object} RuntimeProfile
 * @property {string} id                 'dream' | 'daily-digest' | 'inbox-triage' | 'weekly-review'
 * @property {'dream'|'routine'} kind
 * @property {string[]} tools            authoritative available built-in allowlist. ALWAYS NON-EMPTY and
 *                                       EXPLICIT (empty --tools = ALL built-ins — measured; see the amendment).
 *                                       dream: ['Read','Write','Edit','Glob','Grep']; a routine: an explicit
 *                                       minimal set (e.g. ['Read']), never [].
 * @property {string[]} disallowedTools  explicit deny (redundant defense-in-depth behind the allowlist):
 *                                       always includes 'Bash','WebFetch','WebSearch','Task','Agent','Skill','Workflow','NotebookEdit'
 * @property {'empty'|'broker'} mcp      dream → 'empty' (zero servers); routine → 'broker' (exactly one A2 broker MCP) or 'empty'
 * @property {string} permissionMode     'acceptEdits' for dream; routines per their profile
 * @property {string} skillId            the vendored skill this profile runs (e.g. 'wienerdog-dream', 'wienerdog-daily-digest')
 */

/** Thrown on an unknown profile id or a malformed profile. Extends WienerdogError so
 *  callers' existing catch(→exit 1) handling applies. */
class RuntimeProfileError extends require('./errors').WienerdogError {}

/** THE registry. The ONLY place a capability profile is defined. Object.freeze at
 *  every level so no caller can mutate a profile in-process. */
const PROFILES = Object.freeze({
  // The shared deny list — redundant defense-in-depth behind each profile's explicit
  // allowlist; names every known escalation surface the spike found available (Skill,
  // Agent/Task, Workflow) plus Bash/WebFetch/WebSearch/NotebookEdit.
  // DENY = Object.freeze(['Bash','WebFetch','WebSearch','Task','Agent','Skill','Workflow','NotebookEdit'])
  dream: Object.freeze({
    id: 'dream', kind: 'dream',
    tools: Object.freeze(['Read', 'Write', 'Edit', 'Glob', 'Grep']), // explicit allowlist — the dream's real needs
    disallowedTools: DENY,
    mcp: 'empty', permissionMode: 'acceptEdits', skillId: 'wienerdog-dream',
  }),
  // Routines: an EXPLICIT MINIMAL allowlist (never []). Under A1 a routine has no vault
  // access and its external effect flows through the broker MCP (A2), so its built-in
  // needs are minimal — 'Read' (read a staged input snapshot) is the placeholder minimal
  // set; the exact per-routine allowlist is finalized when A2 makes routines functional,
  // with WP-133's harness asserting the live inventory. If a genuinely ZERO-built-in run
  // is ever wanted, WP-133 determines the argv shape that yields zero (NOT empty --tools)
  // and it lands as a dated amendment.
  'daily-digest':  /* routine: tools:['Read'], disallowedTools:DENY, mcp:'broker', permissionMode per profile, skillId:'wienerdog-daily-digest' */,
  'inbox-triage':  /* routine: tools:['Read'], disallowedTools:DENY, mcp:'broker', skillId:'wienerdog-inbox-triage' */,
  // A2-RESTORE: mcp is 'empty' ONLY because A1 wires no broker; weekly-review drafts
  // email via gws, so re-evaluate (likely flip to 'broker') when A2 wires the broker.
  'weekly-review': /* routine: tools:['Read'], disallowedTools:DENY, mcp:'empty' (no broker wired under A1), skillId:'wienerdog-weekly-review' */,
});

/** @param {string} id @returns {RuntimeProfile} — throws RuntimeProfileError (fail
 *  closed) on an unknown id. NEVER falls back to a default profile. */
function getProfile(id) { /* frozen lookup or throw */ }

/** @returns {string[]} the routine profile ids, sorted (for the harness + catalog). */
function listRoutineProfileIds() { /* ids where kind==='routine' */ }

/**
 * Build the exact `claude` argv (AFTER the "claude" name) for a hermetic run.
 * PURE — every flag is derived from the profile + ctx, nothing from ambient config.
 * @param {RuntimeProfile} profile
 * @param {{ prompt:string, addDirs:string[], settingsPath:string,
 *           mcpConfigPath:string|null, model:string|null,
 *           appendSystemPrompt:string|null }} ctx
 *   settingsPath   the WP-129 hook-free settings file (absolute)
 *   mcpConfigPath  absolute broker MCP config (required iff profile.mcp==='broker'); else null
 *   appendSystemPrompt  the vendored skill body iff D-SKILL-LOAD resolves to append-system-prompt (else null)
 * @returns {string[]}
 * @throws RuntimeProfileError if profile.mcp==='broker' but mcpConfigPath is null (fail closed)
 */
function composeClaudeArgs(profile, ctx) {
  // Shape (dream example):
  //   ['-p', prompt,
  //    '--tools', profile.tools.join(','),            // ALWAYS an explicit non-empty allowlist (empty = ALL — measured)
  //    '--disallowedTools', profile.disallowedTools.join(','),  // redundant defense-in-depth (Skill/Agent/Task/Workflow/...)
  //    '--permission-mode', profile.permissionMode,
  //    ...addDirs.flatMap(d => ['--add-dir', d]),
  //    '--strict-mcp-config',                          // ALWAYS present (audit A1 point 5)
  //    ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []),  // routine broker; dream → absent → empty MCP
  //    '--setting-sources', '',                        // empty value — loads NOTHING ambient (measured-accepted, source-excluding; D-SETTING-SOURCES)
  //    '--settings', settingsPath,                     // the hook-free profile (disableAllHooks)
  //    ...(appendSystemPrompt ? ['--append-system-prompt', appendSystemPrompt] : []),
  //    ...(model ? ['--model', model] : [])]
}

module.exports = { PROFILES, getProfile, listRoutineProfileIds, composeClaudeArgs, RuntimeProfileError };
```

### Worked examples (assert in the test)

```
getProfile('dream').tools               → ['Read','Write','Edit','Glob','Grep']
getProfile('daily-digest').tools        → ['Read']      // explicit MINIMAL allowlist, NEVER [] (empty = ALL built-ins)
getProfile('daily-digest').tools.length > 0             // no profile ever has an empty allowlist
getProfile('daily-digest').disallowedTools includes 'Bash','WebFetch','WebSearch','Task','Agent','Skill','Workflow','NotebookEdit'
getProfile('nope')                      → throws RuntimeProfileError (fail closed, no default)
listRoutineProfileIds()                 → ['daily-digest','inbox-triage','weekly-review']

composeClaudeArgs(getProfile('dream'), {prompt:'/x', addDirs:['/v','/s'],
   settingsPath:'/s.json', mcpConfigPath:null, model:null, appendSystemPrompt:null})
  → contains '--tools','Read,Write,Edit,Glob,Grep' (never an empty --tools),
    contains '--disallowedTools' naming Task,Agent,Skill,Workflow,NotebookEdit (+ Bash,WebFetch,WebSearch),
    contains '--setting-sources','' (empty), '--strict-mcp-config', does NOT contain '--mcp-config',
    does NOT contain '--setting-sources','user', contains '--settings','/s.json'

composeClaudeArgs(getProfile('daily-digest'), {... mcpConfigPath:null ...})
  → throws RuntimeProfileError   // mcp:'broker' requires an absolute broker config
```

## DECISION NEEDED (resolve in the walkthrough; each becomes a dated OWNER-APPROVED line before Ready)

- **D-SETTING-SOURCES — RESOLVED by the 2026-07-18 spike: `--setting-sources ""` (empty
  value).** Measured accepted by Claude Code 2.1.212 and it genuinely excludes the user
  source (a planted user `SessionStart` hook did not fire under it; it fired under default
  sources as a control). The composer emits `--setting-sources ""` as a module constant,
  and the vendored skill arrives via `--append-system-prompt` (D-SKILL-LOAD), so the
  composer depends on no ambient source. **OWNER-APPROVED 2026-07-18** (ratified in the
  walkthrough on the measured basis in the SPIKE-INFORMED AMENDMENT block above). *(The
  earlier open counterargument — "empty may be rejected / may revert to defaults" — is
  retired by the measurement.)*

- **D-BROKER-SEAM — RESOLVED (OWNER-APPROVED 2026-07-18).** *(Unaffected by the
  empty-tools finding — this is the MCP posture, independent of the tool allowlist, which
  is now settled: every routine carries an explicit minimal `tools:['Read']`, never `[]`.)*
  A routine that needs Google (daily-digest, inbox-triage) declares `mcp:'broker'`;
  the composer requires an absolute `mcpConfigPath` or fails closed. The broker itself
  is **A2**, not built here.
  - **Approved: `mcp:'broker'` for daily-digest and inbox-triage; `mcp:'empty'` for
    weekly-review.** A1 ships the *requirement* + fail-closed enforcement; a `broker`
    profile with no config (the state until A2 supplies one) fails closed — contained
    and inert, which is the intended A1 posture (the `external-content-routine` gate
    stays BLOCKED regardless).
  - **⚠️ A2-RESTORE — this is a deliberate temporary downgrade, not a final state.**
    weekly-review's shipped skill also drafts email via `wienerdog gws`, so it will need
    the broker once A2 restores routine function. It is marked `mcp:'empty'` now **only**
    because A1 wires no broker and, under A1, the routine has no Bash and no gws CLI — its
    draft path is dead until A2 regardless. The owner explicitly directed that this
    downgrade **must leave a durable trace so A2 revisits it** and does not mistake the
    `empty` marking for a reviewed "weekly-review needs no Google" decision. Two traces
    are therefore REQUIRED (both are deliverables of this WP, not optional prose):
    1. **In the spec** — this OWNER-APPROVED block.
    2. **In the code** — the `weekly-review` profile object in `runtime-profile.js` MUST
       carry an inline `// A2-RESTORE:` comment stating that `mcp` is to be re-evaluated
       (likely flipped to `'broker'`) when A2 wires the credential broker, so the A2
       implementer sees it at the exact edit site. The unit test asserts the marker
       string is present in the module source (a grep-style check), so the trace cannot
       be silently dropped in a future refactor.

## Implementation notes & constraints

- **This is the ONE profile registry (ADR-0025).** After this WP, a capability profile
  is defined nowhere else. `composeClaudeArgs` is the ONE place a `claude` containment
  argv is built; WP-130/WP-131 call it, they do not hand-assemble flags.
- **Fail closed, never a default profile.** `getProfile` on an unknown id throws — it
  never returns a "safe default." An arbitrary `skill:<string>` has no profile, so it
  cannot compose an argv: that is how "no arbitrary skill dispatch" (audit A1 point 1)
  is enforced structurally.
- **`--strict-mcp-config` is ALWAYS emitted** (audit A1 point 5): dream → no
  `--mcp-config` → zero servers; routine → exactly one `--mcp-config` (the broker).
- **`--tools` is ALWAYS an explicit, non-empty allowlist — MEASURED, do not re-litigate.**
  The 2026-07-18 live spike (Claude Code 2.1.212) proved `--tools ""` (empty) exposes ALL
  built-ins (Task, Bash, Glob, Grep, Read, Edit, Write, NotebookEdit) — the opposite of the
  intent. The only reliable minimal surface is naming exactly the permitted tools. So every
  profile's `tools` is non-empty and `composeClaudeArgs` never emits an empty `--tools`; a
  routine that needs almost nothing gets `['Read']`, not `[]`. The deny list is redundant
  defense-in-depth behind the allowlist and names the known escalation tools
  (`Bash,WebFetch,WebSearch,Task,Agent,Skill,Workflow,NotebookEdit`) the spike found
  available. (If a genuinely-zero-built-in run is ever wanted, WP-133's harness determines
  the argv shape that yields zero — never empty `--tools` — as a dated amendment.)
- Pure module: no `fs`/`child_process`/env. `RuntimeProfileError extends WienerdogError`.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] Any untrusted identifier (a job's `run` string, a routine name from config) that
      would select a runtime profile is resolved by **exact match against the frozen
      code-owned registry**; an unknown/config-supplied value throws `RuntimeProfileError`
      (fail closed) and never composes an argv. There is no default-profile fallback and
      no path from a mutable config string to an arbitrary `claude -p /<skill>`.

## Acceptance criteria

- [ ] `PROFILES` is deeply frozen; a mutation attempt throws / is a no-op (assert
      `Object.isFrozen` on the registry and a profile, and that `tools` is frozen).
- [ ] `getProfile('dream')` returns the Read/Write/Edit/Glob/Grep tool set with
      `disallowedTools` including Bash/WebFetch/WebSearch **and Task/Agent/Skill/Workflow/
      NotebookEdit** and `mcp:'empty'`; **every** routine profile has a NON-EMPTY explicit
      `tools` allowlist (e.g. `['Read']`, never `[]`) with the same deny list.
- [ ] No profile has an empty `tools` array, and `composeClaudeArgs` never emits an empty
      `--tools` value (it always emits `--tools <explicit,comma,list>`).
- [ ] `getProfile('<unknown>')` throws `RuntimeProfileError`; `listRoutineProfileIds()`
      returns exactly the three catalog routine ids, sorted.
- [ ] `composeClaudeArgs` for the dream profile emits `--tools Read,Write,Edit,Glob,Grep`,
      `--disallowedTools` naming Task/Agent/Skill/Workflow/NotebookEdit, `--setting-sources
      ''` (empty), `--strict-mcp-config`, omits `--mcp-config`, omits `--setting-sources
      user`, and includes `--settings <path>`.
- [ ] `composeClaudeArgs` for a `mcp:'broker'` profile with `mcpConfigPath:null` throws
      `RuntimeProfileError` (fail closed); with an absolute path it emits exactly one
      `--mcp-config <path>`. `daily-digest` and `inbox-triage` are `mcp:'broker'`;
      `weekly-review` is `mcp:'empty'`.
- [ ] The `weekly-review` profile in `runtime-profile.js` carries the `A2-RESTORE:` inline
      marker (D-BROKER-SEAM), and a test asserts that marker string is present in the module
      source so the deliberate temporary `mcp:'empty'` downgrade cannot be silently lost.
- [ ] `wienerdog safety` shows all five gates BLOCKED (`safety-profile.js` untouched).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "runtime-profile"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
```

## Out of scope (do NOT do these)

- Wiring the dream onto the composer — **WP-130**.
- Wiring routines onto the composer + the staging directory — **WP-131**.
- The hook-free settings file + vendored-skill integrity — **WP-129**.
- Managed-policy preflight + run evidence — **WP-132**.
- The live negative harness — **WP-133**.
- Building the A2 GWS broker or any OAuth/credential work — **A2**.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/128-runtime-profile-registry`; conventional commits; PR titled
   `feat(runtime): code-owned hermetic runtime profile registry + argv composer (WP-128)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** in this private security fork, work lands directly on `main` per
> `docs/security-audit/2026-07-15/WORKING-NOTES.md`; the `branch:`/PR fields are kept for
> template/upstream-porting fidelity.
