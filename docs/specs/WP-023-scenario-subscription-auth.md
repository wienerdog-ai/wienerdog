---
id: WP-023
title: Rework the scenario harness to run on subscription auth (decouple fixture isolation from auth)
status: In-Review
model: sonnet
size: M
depends_on: [WP-015, WP-020]
adrs: [ADR-0004, ADR-0009]
branch: wp/023-scenario-subscription-auth
---

# WP-023: Rework the scenario harness to run on subscription auth (decouple fixture isolation from auth)

## Context (read this, nothing else)

Wienerdog's product claim is that it runs on the user's **own Claude subscription** via
`claude -p` — never an Anthropic API key (ADR-0004). But the project's own scenario test
harness (`tests/scenarios/`) broke that rule: it authenticated the real dream brain with
an `ANTHROPIC_API_KEY`. **ADR-0009 (new, read it) forbids API keys anywhere — in the
product OR its test infrastructure.** This work package makes the scenario harness run on
subscription auth, and demotes the API-key CI workflow to a dormant option.

**Why the harness needed a key at all.** The harness feeds three canned transcript
fixtures (one carrying a planted prompt injection) through the *real* `wienerdog dream`
pipeline with the *real* brain, then asserts the injection never reaches a Tier-3
destination. To make the pipeline discover its fixtures instead of the user's real
transcripts, the harness set `CLAUDE_CONFIG_DIR` to a temp dir (the dream pipeline scans
`<CLAUDE_CONFIG_DIR>/projects/**/*.jsonl`). But that same env var is inherited by the
`claude -p` brain the pipeline spawns — and subscription/OAuth credentials are
**Keychain-bound to the user's *default* config dir**, so an overridden `CLAUDE_CONFIG_DIR`
means the brain finds no credentials. Only an API key survived the override. (This was the
PR #19 review finding.) The bug is that **one env var was doing two unrelated jobs**:
pointing the pipeline at fixtures *and* choosing the brain's credentials.

**The fix: decouple the two.** Introduce a wienerdog-internal override
(`WIENERDOG_CLAUDE_DIR`) that only the transcript-collection phase honors, and point *that*
at the fixtures. Stop overriding `CLAUDE_CONFIG_DIR` and `HOME` for the harness, so the
brain child resolves the user's **real** default config dir and Keychain OAuth — i.e.,
subscription auth. The Haiku grader runs the same way. `ANTHROPIC_API_KEY` is actively
stripped from every child env so a stray key can never silently take over.

Product invariants that govern every line here:

- **Wienerdog is just files (ADR-0004).** The harness spawns short-lived children
  (`wienerdog dream`, `claude -p`) and exits; no daemon, server, or telemetry.
- **Subscription everywhere, no API keys (ADR-0009).** The harness authenticates the brain
  and the grader through the maintainer's subscription (`claude -p`), never a key.
- **`npm test` and accidental runs must never spend quota.** The existing hard env guard
  (`WIENERDOG_RUN_SCENARIOS=1`) stays exactly as is. This is non-negotiable.
- **Never read or write the user's real data.** All Wienerdog writes stay in temp dirs; the
  harness must not read the user's *real* transcripts, and its one deliberate touch of the
  real config dir (installing the dream skill so the brain can find it) is backed up and
  restored.

## Current state

Everything below already exists (WP-015 built the harness; WP-020 built run-job). Treat
these as the exact code you are modifying.

### `tests/scenarios/run-scenarios.js` — the isolation block being reworked

It creates temp dirs and builds the child env for `wienerdog dream` like this (lines ~240–279):

```js
root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-scenarios-'));
const home = path.join(root, 'home');
const core = path.join(root, 'core');
const vault = path.join(root, 'vault');
const claudeConfigDir = path.join(root, 'claude');
const codexDir = path.join(root, 'codex-absent');
fs.mkdirSync(home, { recursive: true });

const env = { ...process.env };
env.HOME = home;                              // ← isolates HOME (breaks OAuth)
env.WIENERDOG_HOME = core;
env.WIENERDOG_VAULT = vault;
env.CLAUDE_CONFIG_DIR = claudeConfigDir;      // ← isolates config dir (breaks OAuth)
env.CODEX_HOME = codexDir;
env.WIENERDOG_FAKE_TODAY = FAKE_TODAY;
delete env.WIENERDOG_DREAM_CMD;               // exercise the REAL brain (keep this)

// fixtures planted under the overridden config dir:
const projDir = path.join(claudeConfigDir, 'projects', 'scenario');
fs.mkdirSync(projDir, { recursive: true });
for (const f of FIXTURE_FILES) fs.copyFileSync(path.join(FIXTURES_DIR, f), path.join(projDir, f));

// dream skill copied into the overridden config dir's skills folder:
const skillsDest = path.join(claudeConfigDir, 'skills', 'wienerdog-dream');
fs.mkdirSync(path.dirname(skillsDest), { recursive: true });
fs.cpSync(DREAM_SKILL_SRC, skillsDest, { recursive: true });
```

The rest of `run-scenarios.js` (the assertions, the `finally { fs.rmSync(root) }`, the env
guard at the top) is correct and **must not change** except where this spec says so.
`runWienerdog(args, env)` runs `node bin/wienerdog.js <args>` with the given `env`.

### `src/core/paths.js` — how the config dir is resolved

```js
function getPaths(env = process.env) {
  const home = env.HOME || os.homedir();
  const claudeDir = env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  // ...
}
```

`paths.claudeDir` feeds transcript discovery: `src/core/transcripts/index.js` scans
`path.join(paths.claudeDir, 'projects')` with layout `<projects>/<oneDir>/<uuid>.jsonl`.
It is *also* used by `wienerdog init` adapters. In production `CLAUDE_CONFIG_DIR` is the
user's real value (usually unset → `~/.claude`).

### `src/core/dream/brain.js` — the brain child env (do NOT modify)

`spawnBrain(o)` builds the brain child env as `{ ...(o.env||process.env),
WIENERDOG_DREAM_VAULT, WIENERDOG_DREAM_SCRATCH }` and `dream.js` calls it with
`env: process.env`. So the brain child inherits whatever `HOME` / `CLAUDE_CONFIG_DIR` /
`ANTHROPIC_API_KEY` the `wienerdog dream` process was given. **You do not touch this file.**
You control the brain's auth entirely through the env you hand `wienerdog dream`.
`buildClaudeArgs` passes `--setting-sources user`, which loads **user-scoped** skills (from
`<config dir>/skills`) but not project/local skills — this is why the dream skill must be
installed into the *real* config dir's skills folder (below), not the vault.

### `tests/scenarios/rubric.js` — the Haiku grader (spawns `claude -p --model haiku`)

`gradeNote()` calls `spawnSync('claude', ['-p', prompt, '--model', 'haiku',
'--output-format', 'json'], { encoding: 'utf8', timeout: 120000 })` with **no `env`
option**, so it inherits the harness process's own env. It already uses `--model haiku`
with no key; it just must not inherit a stray `ANTHROPIC_API_KEY`.

### `src/cli/run-job.js` — for the scheduling example (do NOT modify)

`resolveCommand(job)` dispatches on `job.run`: `builtin:dream` → `node wienerdog dream
--yes`; any other `builtin:*` → error; `skill:<name>` → `claude -p /<name>`. **There is no
run-kind that runs an arbitrary script**, so the scenario harness cannot be scheduled as a
`wienerdog` routine today — this is a documented fact for the README, not a thing you fix
here. `buildCleanEnv` sets `HOME: paths.home` and passes through the allowlist
`['WIENERDOG_HOME','WIENERDOG_VAULT','CLAUDE_CONFIG_DIR','CODEX_HOME','ANTHROPIC_API_KEY']`.

### `.github/workflows/scenarios.yml` — the nightly CI workflow being demoted

Triggers on `schedule: cron "0 6 * * *"` + `workflow_dispatch`, installs the `claude` CLI,
and runs `npm run scenarios` with `WIENERDOG_RUN_SCENARIOS: "1"` and `ANTHROPIC_API_KEY:
${{ secrets.ANTHROPIC_API_KEY }}`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/paths.js | add `WIENERDOG_CLAUDE_DIR` as the highest-precedence source for `claudeDir` (collection-only override; unset in production) |
| create | tests/unit/paths.test.js | unit-test the `WIENERDOG_CLAUDE_DIR` precedence |
| modify | tests/scenarios/run-scenarios.js | rework the isolation/auth block: real `HOME` + un-overridden `CLAUDE_CONFIG_DIR`; `WIENERDOG_CLAUDE_DIR` for collection; strip `ANTHROPIC_API_KEY`; install the dream skill into the real config dir with backup/restore |
| modify | tests/scenarios/rubric.js | grader spawns with `ANTHROPIC_API_KEY` stripped (subscription, no key) |
| modify | tests/scenarios/README.md | local = subscription; CI = dormant/needs a key; privacy + scheduling example |
| modify | .github/workflows/scenarios.yml | demote to dormant: remove `schedule`, `workflow_dispatch` only, documented opt-in key path |

The ADR (`docs/adr/0009-subscription-everywhere.md`), the ADR index
(`docs/adr/README.md`), and `docs/specs/ROADMAP.md` are **already written by the architect**
— do not touch them. Do not modify `src/core/dream/brain.js`, `src/cli/dream.js`,
`src/cli/run-job.js`, the fixtures, or any other file.

### Exact contracts

#### 1. `src/core/paths.js` (modify — one line + JSDoc)

Change the `claudeDir` resolution so a wienerdog-internal override wins over
`CLAUDE_CONFIG_DIR`. `claude` itself never reads `WIENERDOG_CLAUDE_DIR`, so this decouples
"where the collect phase looks for transcripts" from "which config dir the brain
authenticates against":

```js
// WIENERDOG_CLAUDE_DIR (wienerdog-internal; the scenario harness sets it to a
// fixtures dir) takes precedence so transcript discovery can be redirected WITHOUT
// touching CLAUDE_CONFIG_DIR — which the spawned `claude -p` brain needs for its
// real subscription credentials (ADR-0009). Unset in production → identical behavior.
const claudeDir = env.WIENERDOG_CLAUDE_DIR || env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
```

Add `@property {string} claudeDir` note is unchanged; keep the existing typedef. No other
line of `paths.js` changes. `getPaths` still takes `env = process.env`.

#### 2. `tests/unit/paths.test.js` (create)

A `node:test` file. At least one `test(...)` whose name contains `paths` (so
`--test-name-pattern paths` selects it). Assert, using `getPaths(fakeEnv)` with explicit
env objects (never the real environment):

- `getPaths({ HOME: '/h', WIENERDOG_CLAUDE_DIR: '/wd', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir === '/wd'` (override wins).
- `getPaths({ HOME: '/h', CLAUDE_CONFIG_DIR: '/cc' }).claudeDir === '/cc'` (falls back to `CLAUDE_CONFIG_DIR`).
- `getPaths({ HOME: '/h' }).claudeDir === '/h/.claude'` (falls back to `<home>/.claude`).

Use `node:assert` and `require('../../src/core/paths')`. No new deps.

#### 3. `tests/scenarios/run-scenarios.js` (modify — the isolation/auth block only)

Replace the current isolation/auth block (shown in Current state) with the following
behavior. **Everything else in the file — the top-of-`main` env guard, the assertions
(steps 5–6), the `finally { fs.rmSync(root, ...) }` — stays exactly as it is.**

**a. Temp dirs (unchanged in spirit, but do NOT create/point at a temp `home` or a temp
claude config dir):**

```js
root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-scenarios-'));
const core = path.join(root, 'core');
const vault = path.join(root, 'vault');
const transcriptsDir = path.join(root, 'claude-transcripts'); // fixtures live here
const codexDir = path.join(root, 'codex-absent');
```

**b. Child env for `wienerdog dream` — real HOME, no config-dir/key override:**

```js
const env = { ...process.env };
env.WIENERDOG_HOME = core;
env.WIENERDOG_VAULT = vault;
env.WIENERDOG_CLAUDE_DIR = transcriptsDir;   // collection reads fixtures from here
env.CODEX_HOME = codexDir;                    // isolate codex discovery (stays empty)
env.WIENERDOG_FAKE_TODAY = FAKE_TODAY;
delete env.WIENERDOG_DREAM_CMD;               // exercise the REAL brain
delete env.ANTHROPIC_API_KEY;                 // ADR-0009: subscription only, never a key
// Deliberately NOT set: env.HOME (inherit the real one → default config + Keychain OAuth)
// Deliberately NOT set: env.CLAUDE_CONFIG_DIR (inherit the maintainer's real value, or
//   none → ~/.claude; the brain authenticates against whatever their `claude` uses).
```

Rationale to preserve as a comment: setting all four Wienerdog-scoped overrides
(`WIENERDOG_HOME`, `WIENERDOG_VAULT`, `WIENERDOG_CLAUDE_DIR`, `CODEX_HOME`) fully redirects
every Wienerdog write and read into temp dirs, so leaving `HOME` real is safe **and**
required — the brain needs the real `HOME` to resolve the default config dir where the
subscription/OAuth credential lives.

**c. Plant fixtures under the collection override (not the config dir):**

```js
const projDir = path.join(transcriptsDir, 'projects', 'scenario');
fs.mkdirSync(projDir, { recursive: true });
for (const f of FIXTURE_FILES) fs.copyFileSync(path.join(FIXTURES_DIR, f), path.join(projDir, f));
```

(Layout `<transcriptsDir>/projects/scenario/<file>.jsonl` matches
`discoverClaude(<claudeDir>/projects)`, which expects one dir level then files.)

**d. Install the dream skill into the REAL config dir so the brain finds it, with
backup/restore.** The brain resolves the real default config dir; `--setting-sources user`
loads user-scoped skills from `<real config dir>/skills`. Resolve that dir from the
**harness's own `process.env`** (NOT the child `env`), install the repo's skill, and
guarantee cleanup:

```js
const os = require('node:os'); // already imported
const realConfigDir = process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.claude');
const realSkillDest = path.join(realConfigDir, 'skills', 'wienerdog-dream');
let skillBackup = null;          // path we moved a pre-existing skill to, or null
let installedSkill = false;      // did we create realSkillDest?
```

Before running the dream (inside the `try`, after seeding):

```js
fs.mkdirSync(path.dirname(realSkillDest), { recursive: true });
if (fs.existsSync(realSkillDest)) {
  skillBackup = path.join(root, 'wienerdog-dream.preexisting');
  fs.renameSync(realSkillDest, skillBackup);   // set aside the maintainer's own copy
}
fs.cpSync(DREAM_SKILL_SRC, realSkillDest, { recursive: true });
installedSkill = true;
```

Cleanup — put this at the **start** of the existing `finally` block, before
`fs.rmSync(root, ...)`, wrapped so a cleanup error can never mask a scenario failure:

```js
try {
  if (installedSkill) fs.rmSync(realSkillDest, { recursive: true, force: true });
  if (skillBackup && fs.existsSync(skillBackup)) fs.renameSync(skillBackup, realSkillDest);
} catch (err) {
  console.error(`scenarios: WARNING — could not restore ${realSkillDest}: ${err.message}`);
}
```

Remove the old `skillsDest`/`claudeConfigDir`/`home` code entirely. Keep the
`baselineCommits` / `baselineSha` capture and everything downstream unchanged.

#### 4. `tests/scenarios/rubric.js` (modify — strip the key from the grader's env)

Build a grader env that drops `ANTHROPIC_API_KEY` and pass it to `spawnSync`, so the Haiku
grader authenticates on the maintainer's subscription like the brain does:

```js
const graderEnv = { ...process.env };
delete graderEnv.ANTHROPIC_API_KEY; // ADR-0009: subscription only

res = spawnSync('claude', ['-p', prompt, '--model', 'haiku', '--output-format', 'json'], {
  encoding: 'utf8',
  timeout: 120000,
  env: graderEnv,
});
```

Do **not** strip `CLAUDE_CONFIG_DIR` — a maintainer who runs `claude` under a custom config
dir has their OAuth bound to it; inherit it. No other change to `rubric.js`; the fail-safe
behavior (grader error → `{pass:false}`) stays.

#### 5. `tests/scenarios/README.md` (modify)

Rewrite the "Running locally" section and add the two new subsections below. The rest of
the file (why it exists, what each fixture represents, what the assertions prove) stays.

- **Running locally (subscription):** state that the harness runs on the maintainer's Claude
  **subscription**, not an API key. Preconditions: `claude` on `PATH` and already logged in
  interactively (so OAuth works in the shell you run from); run from a shell where a bare
  `claude -p "hi"` succeeds. It spends real quota. Commands:
  ```bash
  export WIENERDOG_RUN_SCENARIOS=1   # the hard guard; without it, npm run scenarios skips
  npm run scenarios
  ```
  Explicitly note: **do not set `ANTHROPIC_API_KEY`** — the harness strips it anyway
  (ADR-0009), but the intent is subscription-only.
- **How auth and fixture isolation are decoupled (short):** the harness points transcript
  collection at a temp fixtures dir via `WIENERDOG_CLAUDE_DIR`, and leaves `HOME` /
  `CLAUDE_CONFIG_DIR` untouched so the real `claude -p` brain uses the maintainer's default
  config dir and Keychain OAuth. It also temporarily installs the `wienerdog-dream` skill
  into the real config dir's `skills/` (backing up and restoring any pre-existing copy) so
  the brain can load it. It never reads the maintainer's real transcripts.
- **CI is dormant (needs a key):** state clearly that `.github/workflows/scenarios.yml` is
  **disabled by default** and runs on manual dispatch only, and that it is the *one* place
  an API key could appear — GitHub Actions cannot do subscription OAuth, so a future
  contributor who wants CI scenario runs must add an `ANTHROPIC_API_KEY` secret, which
  ADR-0009 excludes from the maintainer's own setup. Keep local (subscription) and CI (key)
  visually separated (two subsections).
- **Scheduling it as a weekly local routine (dogfooding the scheduler):** show the intended
  UX and the exact current limitation. State plainly:
  - The primary runner is a local schedule on the maintainer's machine, e.g. a weekly
    launchd/cron entry that runs, on subscription:
    ```bash
    WIENERDOG_RUN_SCENARIOS=1 npm run --prefix /path/to/wienerdog scenarios
    ```
  - Running it through Wienerdog's *own* scheduler (`wienerdog schedule add scenarios --at
    ...` + `run-job`) is the goal — it dogfoods the product's scheduler — **but is not wired
    yet**: `run-job`'s `resolveCommand` only dispatches `builtin:dream` and `skill:<name>`,
    and its clean-env allowlist does not pass `WIENERDOG_RUN_SCENARIOS` or
    `WIENERDOG_CLAUDE_DIR`, so the harness cannot run as a routine today. Wiring it (a new
    run-kind + env passthrough) is a **future WP**. Note `run-job` already sets `HOME` to
    the real home and resolves the default config dir, so it *is* subscription-compatible in
    principle; whether the login Keychain is reachable in a launchd session is verified at
    first live run, and `run-job`'s fail-loud alert (WP-020) covers a failure.

Keep prose plain (knowledge-worker readable, per CLAUDE.md). markdownlint must pass.

#### 6. `.github/workflows/scenarios.yml` (modify — demote to dormant)

- Remove the `schedule:` trigger entirely; keep only `workflow_dispatch: {}`.
- Add a top-of-file comment block stating it is **DORMANT under ADR-0009
  (subscription-everywhere)**: the project's primary scenario run is a local subscription
  routine on the maintainer's machine; this workflow is retained only as an optional path
  for a future contributor who accepts running scenarios under an `ANTHROPIC_API_KEY` secret
  in CI (GitHub Actions cannot do subscription OAuth), and it does nothing until such a
  contributor supplies the secret.
- Keep the job body and the `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` env line
  (this is the one sanctioned key location — CI has no subscription option). Do not add
  `secrets` inline anywhere else.

## Implementation notes & constraints

- **Zero new dependencies.** Node stdlib only. JSDoc types, no TypeScript, no build step.
- **The env guard is sacred.** Do not touch the `WIENERDOG_RUN_SCENARIOS !== '1'` check at
  the top of `main()`. `npm test` must remain unable to spend quota.
- **`brain.js`, `dream.js`, and `run-job.js` are not yours.** The brain's auth is controlled
  entirely by the env you pass `wienerdog dream`. If you feel the urge to edit `brain.js`,
  stop — inheriting real `HOME` + un-overridden `CLAUDE_CONFIG_DIR` from the dream process
  already gives the child subscription auth.
- **Never leave the real config dir mutated.** The skill install must back up a pre-existing
  `wienerdog-dream` skill and restore it, and delete the one it created — in a `finally`,
  wrapped so it cannot throw. A maintainer who dogfoods Wienerdog may already have this
  skill installed; do not clobber it permanently.
- **Do not read the maintainer's real transcripts.** Collection must read only the temp
  fixtures dir. This is guaranteed by pointing `WIENERDOG_CLAUDE_DIR` at the temp dir and
  never leaving it unset during a run.
- **VERIFY-AT-FIRST-LIVE-RUN (cannot be unit-tested here; the harness itself is the test).**
  These claims depend on Claude Code 2.1.x runtime behavior that this WP cannot statically
  prove; the harness fails loud (non-zero exit / failed assertions) if any is false, which
  is the intended verification:
  1. `claude -p` with the existing brain args (`--setting-sources user`) **discovers a
     user-scoped skill** installed at `<real config dir>/skills/wienerdog-dream`.
  2. `claude -p` with real `HOME` and an **un-overridden `CLAUDE_CONFIG_DIR`** authenticates
     against the subscription/Keychain OAuth credential (no API key).
  3. The Haiku grader authenticates the same way.
  Mark this block in the PR body under "Decisions made / verified live" with the result of
  the local run.
- **When uncertain: choose the simpler option** and record it under "Decisions made" in the
  PR. Do NOT expand scope — no new run-job run-kind, no `brain.js` edit, no productizing the
  harness, no Codex-brain scenario.

## Acceptance criteria

- [ ] `getPaths({...WIENERDOG_CLAUDE_DIR, ...CLAUDE_CONFIG_DIR}).claudeDir` returns the
      `WIENERDOG_CLAUDE_DIR` value; with only `CLAUDE_CONFIG_DIR` it returns that; with
      neither it returns `<home>/.claude`. Covered by `tests/unit/paths.test.js`.
- [ ] `npm run scenarios` with `WIENERDOG_RUN_SCENARIOS` unset prints the existing skip
      message and exits 0 (spends no quota); `npm test` does not run the harness.
- [ ] `run-scenarios.js` builds the `wienerdog dream` child env with `WIENERDOG_CLAUDE_DIR`
      set to the temp fixtures dir, **without** setting `HOME` or `CLAUDE_CONFIG_DIR`, and
      with `ANTHROPIC_API_KEY` deleted. Fixtures are planted under `WIENERDOG_CLAUDE_DIR`.
- [ ] The harness installs the dream skill into the real config dir's `skills/`, backing up
      any pre-existing copy, and its `finally` deletes the installed copy and restores the
      backup — verifiable by inspecting the code path and by a run leaving
      `<real config dir>/skills/wienerdog-dream` in its original state.
- [ ] `rubric.js` passes an env to `spawnSync` with `ANTHROPIC_API_KEY` deleted.
- [ ] `.github/workflows/scenarios.yml` has no `schedule:` trigger (dispatch-only) and a
      dormant/ADR-0009 header comment.
- [ ] `tests/scenarios/README.md` documents subscription-local vs dormant-CI (separated),
      the auth/isolation decoupling, the privacy guarantee, and the scheduling example with
      the exact `run-job` limitation.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
# Unit test for the paths precedence:
npm test -- --test-name-pattern paths

# Guard behaves (no quota spent) and npm test is unaffected:
npm run scenarios        # prints the skip message, exits 0 (WIENERDOG_RUN_SCENARIOS unset)
npm test                 # full unit suite; does NOT run the harness
npm run lint             # markdownlint covers tests/scenarios/README.md

# EXPENSIVE full run (real subscription quota; NO api key). Run from a shell where
# `claude -p "hi"` already works interactively on your subscription:
export WIENERDOG_RUN_SCENARIOS=1
unset ANTHROPIC_API_KEY
npm run scenarios        # PASS iff injection gated + notes grounded, on subscription auth
```

State in the PR whether the EXPENSIVE full run was executed locally on subscription and its
PASS/FAIL, and the result of the three VERIFY-AT-FIRST-LIVE-RUN claims. If not run, say so
— but note that under ADR-0009 there is no nightly CI fallback, so a maintainer should run
it locally before relying on the gating claim.

## Out of scope (do NOT do these)

- **Modifying `src/core/dream/brain.js`, `src/cli/dream.js`, or `src/cli/run-job.js`.** The
  brain's auth is controlled via the env the harness passes; do not edit the brain or the
  pipeline. Removing `ANTHROPIC_API_KEY` from `run-job`'s env allowlist is a **separate
  future WP** (noted in ADR-0009) — not here.
- **Adding a new `run-job` run-kind** (`builtin:scenarios` / a generic `exec:`) or making
  the scenario harness a shippable routine — future WP. Document the gap; do not fill it.
- **Editing the fixtures, the assertions, or the Haiku rubric prompt.** Only the env/auth
  plumbing in `run-scenarios.js` and `rubric.js` changes.
- **Touching `docs/adr/0009-*.md`, `docs/adr/README.md`, or `docs/specs/ROADMAP.md`** — the
  architect already wrote them.
- **Productizing the harness, Codex-brain scenarios, or Windows** — future.

## Definition of done

1. Non-EXPENSIVE verification steps pass locally; output pasted into the PR body. State
   whether the EXPENSIVE subscription run was executed and its result + the live-verify
   claims.
2. Branch `wp/023-scenario-subscription-auth`; PR titled `test(scenarios): run the scenario harness on subscription auth (WP-023)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
