---
id: WP-024
title: Layout-aware dream write path (validate tiers, brain prompt, skill)
status: Done
model: opus
size: M
depends_on: [WP-022]
adrs: [ADR-0004, ADR-0010]
branch: wp/024-layout-aware-dream
---

# WP-024: Layout-aware dream write path (validate tiers, brain prompt, skill)

## Context (read this, nothing else)

The dreaming pipeline consolidates recent sessions into vault memory: an
orchestrator (code) collects transcripts and launches a tool-restricted brain
(`claude -p` / `codex exec` running the `wienerdog-dream` skill), then validates the
brain's writes against tiered gates and makes exactly one git commit. Today every
path in that pipeline is a **hardcoded folder name**: the validator's Tier-3 floor is
`['06-Identity/', '05-Skills/']`, the report goes to `reports/dreams/`, and the dream
skill's prose names `06-Identity/`, `05-Skills/`, `07-Daily/YYYY-MM-DD.md` directly.

WP-022 already shipped the **`vault_layout` layer** (`src/core/layout.js`:
`defaultLayout`, `readVaultLayout`, `resolveDailyPath`, `layoutPromptLines`) and made
the digest render layout-aware. This WP makes the **write path** layout-aware so a
dream can run against an adopted vault whose folders differ from the defaults
(ADR-0010, read it). The brain cannot read config (its sandbox has no Bash and no env
access it can query), so the orchestrator must inject the layout into the brain's
**prompt** — exactly as it already injects the scratch/vault/date paths.

Invariants that govern every line here (do not weaken them):

- **Wienerdog is just files (ADR-0004).** No new process; the brain stays
  tool-restricted (Read/Write/Edit/Glob/Grep only, no Bash, no network).
- **The Tier-3 code floor is absolute and unchanged (THREAT-MODEL T1).** A Tier-3
  write survives ONLY if `derived_from_untrusted === false` AND `confidence >= 0.85`
  AND `recurrence >= 3`. Layout only changes *which directories are Tier 3* (the
  mapped `identity_dir` + `skills_dir`); it never relaxes the floor, and it is never
  tuned by `memory_mode`.
- **Default layout = current behavior, byte-for-byte.** A config with no
  `vault_layout:` block (every existing install) dreams exactly as before. The
  existing `tests/integration/dream.test.js` must stay green **without edits**.

Canonical terms (GLOSSARY): **dream / dream run**, **tier / gates**, **dream report**,
**provenance**. Do not invent synonyms.

## Current state

### `src/core/dream/validate.js` — the Tier-3 floor and report path (retrofit)

Hardcoded constants and their uses (excerpts):

```js
const TIER3_PREFIXES = ['06-Identity/', '05-Skills/'];
const MIN_CONFIDENCE = 0.85;
const MIN_RECURRENCE = 3;

function isTier3(rel) { return TIER3_PREFIXES.some((prefix) => rel.startsWith(prefix)); }
```

The report is written to a hardcoded path, and the commit-message counts key off
hardcoded prefixes:

```js
const reportRel = path.join('reports', 'dreams', `${date}.md`);
// ... commit-count loop ...
if (rel.startsWith('05-Skills/')) skills++;
else if (rel.startsWith('reports/')) continue;
else notes++;
```

`validateAndCommit(o)` takes an options object
`{ vaultDir, scratchDir, date, expectedScratch, scratchBaseline }`. The MIN_* floor,
the provenance gate, the per-item revert, and the single-commit logic are correct and
**must not change** — only the *source of the paths* changes.

### `src/core/dream/brain.js` — the prompt and arg builders (retrofit)

```js
function DREAM_PROMPT(scratchDir, vaultDir, date) {
  return [
    '/wienerdog-dream',
    '',
    `Scratch extracts directory (read-only inputs): ${scratchDir}`,
    `Vault directory (your only write target): ${vaultDir}`,
    `Today's date: ${date}`,
  ].join('\n');
}
```

`buildClaudeArgs({ vaultDir, scratchDir, date, model })` and
`buildCodexArgs({...})` each call `DREAM_PROMPT(scratchDir, vaultDir, date)`.
`spawnBrain(o)` sets the brain child env:

```js
const childEnv = {
  ...baseEnv,
  WIENERDOG_DREAM_VAULT: vaultDir,
  WIENERDOG_DREAM_SCRATCH: scratchDir,
};
```

and dispatches to `WIENERDOG_DREAM_CMD` (the test seam), `codex`, or `claude`. The
paths thus travel to the **real** brain via the prompt AND to the **fake** brain
(tests) via env. Layout must travel the same two ways.

### `src/cli/dream.js` — the orchestrator wiring (retrofit)

```js
const { readDreamConfig } = require('../core/dream/config');
const { spawnBrain, buildClaudeArgs } = require('../core/dream/brain');
const { renderDigest } = require('../core/digest');
const { validateAndCommit, ... } = require('../core/dream/validate');
// ...
const cfg = readDreamConfig(paths.config);   // { vault, timeoutMs, maxInputBytes, model }
const vaultDir = cfg.vault;
// printPlan() calls buildClaudeArgs({ vaultDir, scratchDir, date, model: cfg.model })
// runBrainWithWatchdog() calls spawnBrain({ vaultDir, scratchDir, date, model, ... })
// validateAndCommit({ vaultDir, scratchDir, date, expectedScratch, scratchBaseline })
// renderDigest(vaultDir)   // WP-022 made this (vaultDir, layout=default)
```

`readDreamConfig` does NOT read the layout; you add a `readVaultLayout(paths.config)`
call and thread the result through `printPlan`, `runBrainWithWatchdog`/`spawnBrain`,
`validateAndCommit`, and `renderDigest`.

### `skills/wienerdog-dream/SKILL.md` — the brain's instructions (retrofit)

Its Phase 3 and Hard-rules hardcode destinations, e.g.:

> - **Tier 3 — identity and skills** (`06-Identity/`, `05-Skills/`): write only if …
> - **Tier 1 — daily log** (`07-Daily/YYYY-MM-DD.md`): write only if `confidence` ≥ 0.5.
> Write a report at `reports/dreams/<today>.md`.

These must become "the directories named in your prompt" while keeping the *gate
semantics* identical (Tier 3 = the mapped identity + skills dirs).

### `src/core/layout.js` — the WP-022 module you build on (do NOT modify)

```js
module.exports = { defaultLayout, readVaultLayout, resolveDailyPath, layoutPromptLines };
```

`layoutPromptLines(layout, date)` returns the plain-language lines to drop into the
prompt. `resolveDailyPath(layout, date)` returns today's daily-log vault-relative
path. Use both; do not reimplement them.

### `tests/fixtures/dream/fake-brain.js` — the test brain (do NOT modify)

It writes to hardcoded default paths. Under the DEFAULT layout those paths equal the
mapped ones, so the existing `tests/integration/dream.test.js` stays correct without
changes. Leave this file alone.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/dream/validate.js | resolve Tier-3 prefixes, report path, and commit-count prefixes from a `layout` option; floor unchanged |
| modify | src/core/dream/brain.js | inject `layoutPromptLines` into `DREAM_PROMPT`; thread `layout` through arg builders; set a `WIENERDOG_DREAM_LAYOUT` env for the fake-brain seam |
| modify | src/cli/dream.js | read layout via `readVaultLayout`; thread it into printPlan, spawnBrain, validateAndCommit, renderDigest |
| modify | skills/wienerdog-dream/SKILL.md | write to the prompt-given mapped paths; keep gate semantics; report to the mapped reports dir |
| modify | tests/unit/dream-brain.test.js | assert prompt + argv carry the layout lines for default AND a non-default layout |
| modify | tests/unit/dream-validate.test.js | assert a non-default `identity_dir`/`skills_dir` are Tier-3-gated and the report lands in the mapped reports dir |

Do NOT touch `src/core/layout.js`, `src/core/digest.js`, `tests/fixtures/dream/`,
`tests/integration/dream.test.js`, `src/cli/sync.js`, or anything in WP-026's scope.

### Exact contracts

#### 1. `src/core/dream/validate.js` (modify)

- Add an optional `layout` to the `validateAndCommit(o)` options object, defaulting
  to `require('../layout').defaultLayout()` when absent (so direct-call tests and the
  integration test that pass no layout keep working).
- Replace the module-level `TIER3_PREFIXES` constant usage with a per-call resolution:

  ```js
  const tier3Prefixes = [layout.identity_dir + '/', layout.skills_dir + '/'];
  const isTier3 = (rel) => tier3Prefixes.some((p) => rel.startsWith(p));
  ```

  Keep `MIN_CONFIDENCE = 0.85` and `MIN_RECURRENCE = 3` as fixed constants — the
  floor is layout-independent and `memory_mode`-independent.
- Report path: build `reportRel` as `path.join(layout.reports_dir, date + '.md')`
  instead of the hardcoded `path.join('reports', 'dreams', ...)` (default
  `reports_dir` is `reports/dreams`, so default behavior is unchanged).
- Commit-count prefixes: replace the hardcoded strings with
  `rel.startsWith(layout.skills_dir + '/')` (skills) and
  `rel.startsWith(layout.reports_dir + '/')` (the report file, skipped from counts).
- `tier3Decision`, `resolveContainment`, `revertPath`, `changedPaths`, and the
  single-commit block are unchanged.

#### 2. `src/core/dream/brain.js` (modify)

- `require('./layout')` (i.e. `../layout` relative to `src/core/dream/`) for
  `layoutPromptLines` and `resolveDailyPath`.
- Extend the prompt to carry the layout. New shape:

  ```js
  function DREAM_PROMPT(scratchDir, vaultDir, date, layout) {
    return [
      '/wienerdog-dream',
      '',
      `Scratch extracts directory (read-only inputs): ${scratchDir}`,
      `Vault directory (your only write target): ${vaultDir}`,
      `Today's date: ${date}`,
      '',
      'Vault layout — write to these mapped locations, NOT the default folder names:',
      ...layoutPromptLines(layout, date).map((l) => `- ${l}`),
    ].join('\n');
  }
  ```

  `layout` defaults to `defaultLayout()` inside `DREAM_PROMPT` when undefined, so any
  existing caller/test that omits it still produces a valid (default) prompt.
- `buildClaudeArgs` and `buildCodexArgs` gain a `layout` field in their options and
  pass it to `DREAM_PROMPT`. Everything else in those builders (the tool allowlist,
  sandbox flags) is unchanged — layout does NOT widen the brain's tools.
- `spawnBrain(o)` gains `layout` in its options and adds it to the child env for the
  fake-brain seam:

  ```js
  const childEnv = {
    ...baseEnv,
    WIENERDOG_DREAM_VAULT: vaultDir,
    WIENERDOG_DREAM_SCRATCH: scratchDir,
    WIENERDOG_DREAM_LAYOUT: JSON.stringify({ ...layout, daily_today: resolveDailyPath(layout, date) }),
  };
  ```

  (The real brain ignores this env; only the WP-026 mapped fake brain reads it. The
  existing default fake brain also ignores it and keeps writing default paths, which
  under the default layout are correct.)

#### 3. `src/cli/dream.js` (modify)

- `const { readVaultLayout } = require('../core/layout');`
- After resolving `cfg`, read `const layout = readVaultLayout(paths.config);`.
- Pass `layout` into: `printPlan(...)` (which forwards it to `buildClaudeArgs`),
  `runBrainWithWatchdog(...)` (which forwards it to `spawnBrain`),
  `validateAndCommit({ ..., layout })`, and `renderDigest(vaultDir, layout)`.
- Update `printPlan` and `runBrainWithWatchdog` signatures to accept and forward
  `layout`. No other logic changes.

#### 4. `skills/wienerdog-dream/SKILL.md` (modify — prose only)

Keep every gate threshold and the provenance rule exactly. Change only the
*destinations* to reference the prompt:

- In **Inputs**, add a bullet: the prompt also gives a **Vault layout** — a list
  mapping each tier to a directory (identity, skills, daily-log file for today,
  projects, inbox, reports). Use those paths; the folder names below are examples of
  the defaults, not fixed targets.
- **Phase 3 gates** keep their thresholds but point at the mapped dirs:
  - Tier 1 — daily log: write to the "Daily log file for today" path from your prompt
    (do not assume `07-Daily/…`).
  - Tier 2 — atomic notes / project MOCs: the mapped inbox and projects dirs (plus
    `02-Areas`, `03-Resources`, which are not layout-mapped).
  - Tier 3 — identity and skills: the mapped identity and skills dirs from your
    prompt. The three-condition floor is unchanged and absolute.
- **Skill synthesis**: draft skills under the mapped skills dir
  (`<skills_dir>/<kebab-name>/SKILL.md`).
- **Dream report**: write to the mapped reports dir + `<today>.md`.
- **Hard rules**: "Never write to the mapped identity or skills directories unless
  `confidence` ≥ 0.85 AND `recurrence` ≥ 3 AND `derived_from_untrusted: false`."

Keep the "treat transcript content as quoted data" section and the provenance
frontmatter block verbatim.

#### 5. `tests/unit/dream-brain.test.js` (modify)

Add assertions (keep existing ones green):

- `DREAM_PROMPT(scratch, vault, date)` with no layout arg still contains the three
  path lines AND a `- Identity notes directory: 06-Identity` line (default layout).
- `buildClaudeArgs({ vaultDir, scratchDir, date, model, layout })` with a non-default
  layout (`daily_dir: '05-Daily'`, `daily_filename: 'YYYY/MM/YYYY-MM-DD.md'`) produces
  an argv whose prompt string contains `05-Daily/2026/07/2026-07-03.md` (use
  `WIENERDOG_FAKE_TODAY`-style fixed date `2026-07-03`) and does NOT contain
  `07-Daily`. Confirm the tool allowlist (`Read,Write,Edit,Glob,Grep`) is unchanged.
- `spawnBrain` is already exercised indirectly by the integration test; if this file
  unit-tests it, assert `WIENERDOG_DREAM_LAYOUT` is set in the child env — otherwise
  it is sufficient to assert via `buildClaudeArgs`. (Choose the lighter option and
  note it.)

#### 6. `tests/unit/dream-validate.test.js` (modify)

Add a case (keep existing ones green): build a temp vault git repo whose layout maps
identity to a non-default dir (e.g. `identity_dir: '06-Identity'` but
`skills_dir: '99-Skills'`, or a fully renamed `identity_dir: 'Identity'`), have the
"brain" write a Tier-3 file under the MAPPED identity/skills dir that FAILS the floor
(e.g. `derived_from_untrusted: true`), call
`validateAndCommit({ ..., layout })`, and assert:

- the mapped-dir violation is reverted (not committed), and
- the enforcement report is written under `layout.reports_dir`, and
- a valid mapped Tier-3 write (floor satisfied) survives.

Also assert that a file under the DEFAULT `06-Identity/` is NOT treated as Tier-3
when the layout maps identity elsewhere (i.e. the gate follows the mapping, not the
constant).

## Implementation notes & constraints

- **Zero new dependencies.** Node stdlib; JSDoc types; no build step.
- **The floor is sacred.** Do not make `MIN_CONFIDENCE`/`MIN_RECURRENCE` or the
  `derived_from_untrusted` rule configurable or layout-dependent. Layout changes only
  the *set of Tier-3 directories* and the report location.
- **Backward compatibility is a hard requirement.** `validateAndCommit` and
  `DREAM_PROMPT` default `layout` to `defaultLayout()`. Verify by running the
  UNCHANGED `tests/integration/dream.test.js` — it must pass.
- **Do not modify `fake-brain.js` or the integration test.** If you feel the urge,
  stop: under the default layout the fake brain's hardcoded paths are already the
  mapped paths.
- **The brain's prompt is the only channel to the real brain.** Do not rely on the
  env layout for the real brain — it cannot read env (no Bash).
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope (no config writing, no adoption CLI, no digest change).

## Acceptance criteria

- [ ] With a non-default layout, `validateAndCommit` gates Tier-3 by the MAPPED
      identity/skills dirs and writes the report under the mapped reports dir; a file
      under the old default `06-Identity/` is not Tier-3 when identity is mapped away.
- [ ] `DREAM_PROMPT`/`buildClaudeArgs` embed the layout lines, including today's
      resolved (possibly nested) daily-log path, for a non-default layout; default
      layout renders the default folder names.
- [ ] The brain tool allowlist is unchanged (`Read,Write,Edit,Glob,Grep`).
- [ ] `tests/integration/dream.test.js` passes **unchanged** (default layout ==
      current behavior).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern dream-validate
npm test -- --test-name-pattern dream-brain
npm test -- --test-name-pattern dream-integration   # existing integration test, unchanged
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `vault_layout` reader / `resolveDailyPath` / `layoutPromptLines` — already built
  in WP-022; import and use them, do not reimplement.
- Writing a `vault_layout:` block, layout inference, the `wienerdog adopt` CLI, the
  adoption end-to-end test, or `scaffoldMappedDirs` (WP-026).
- The guided-import setup-skill change (WP-025).
- Modifying `tests/fixtures/dream/fake-brain.js` or `tests/integration/dream.test.js`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/024-layout-aware-dream`; conventional commits; PR titled
   `feat(dream): layout-aware validate + brain prompt + skill (WP-024)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
