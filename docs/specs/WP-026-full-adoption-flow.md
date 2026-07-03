---
id: WP-026
title: Full vault adoption — `wienerdog adopt` CLI, prerequisites, layout mapping
status: In-Review
model: opus
size: M
depends_on: [WP-024, WP-025]
adrs: [ADR-0004, ADR-0010]
branch: wp/026-full-adoption-flow
---

# WP-026: Full vault adoption — `wienerdog adopt` CLI, prerequisites, layout mapping

## Context (read this, nothing else)

Adoption is vault path 3 of ADR-0010 (read it): a power user tells Wienerdog to use
their **existing** vault in place as THE vault, instead of the fresh `~/wienerdog/`
that `wienerdog init` scaffolds. This unifies memory rather than building a second
parallel vault next to the user's mature second brain (the product's one-memory
thesis). WP-022 built the `vault_layout` config layer and layout-aware digest; WP-024
made the dream write path layout-aware; WP-025 rewrote the setup skill to point power
users here. This WP builds the **`wienerdog adopt <path>` CLI** that performs the
gated, reversible adoption.

Adoption is only as safe as git: the whole guarantee that auto-written memory is
recoverable is "one commit per dream → `git revert` undoes a night" (THREAT-MODEL T1).
So `adopt` enforces hard prerequisites before writing anything:

1. **Local, non-TCC disk path.** Refuse a path under a macOS TCC-protected location
   (Desktop/Documents/Downloads/iCloud) — unattended dream jobs hang forever on TCC
   prompts (the 4-hour-hang, ADR-0004). Reuse `src/scheduler/tccguard.js`.
2. **Git-initialized** — a hard prerequisite. If the vault is not a git repo, offer to
   `git init` + take an initial snapshot commit interactively; declining aborts.
3. **Layout mapping confirmed** — infer a `vault_layout` from the vault's real folder
   names + daily-note nesting, print it, require confirmation.
4. **Conservative memory_mode for the first week** — set `memory_mode: conservative`
   so the strictest gates apply while the user builds trust.

**Symlink-domain rule (binding):** every path handed to `tccguard.guard` must be
in the same symlink-resolution domain — call it as
`guard([fs.realpathSync(adoptedPath)], fs.realpathSync(paths.home))`. Comparing
a realpath'd vault path against a raw `paths.home` makes `path.relative` yield
`../…` under any symlinked home component (relocated homes, MDM setups, /tmp in
tests) and the guard silently fails OPEN — reproduced in PR #26 review. A test
must cover the symlinked-home refusal (macOS /tmp → /private/tmp makes this
directly testable).

**inferLayout hygiene (binding):** every proposal must be `trim()`ed and must
pass `isSafeRelativePath` before being emitted (explicit validation, not
safety-by-construction) — otherwise a folder named with surrounding whitespace
round-trips differently through `readVaultLayout`'s trim and the config points
at a different dir than adopt created.

Then `adopt` points config at the adopted path, writes the confirmed `vault_layout`
block, fills only the **missing** mapped directories (never overwriting existing
files — the standing `scaffoldVault` guarantee), records manifest entries that
`uninstall` will NOT remove (so an adopted vault is left exactly as found), and tells
the user to run `wienerdog sync`.

Invariants (do not weaken):

- **Wienerdog is just files (ADR-0004).** `adopt` is a short-lived CLI command; no
  daemon, no telemetry.
- **Never overwrite user files; never remove the user's vault.** Adoption seeds only
  MISSING mapped dirs, and records them under manifest kinds `uninstall` skips.
- **Idempotent + reversible.** Re-running `adopt` on an already-adopted vault must be
  refused cleanly (no partial rewrite); `uninstall` removes the core + config but
  leaves the adopted vault untouched.

Canonical terms (GLOSSARY): **vault**, **manifest**, **TCC-guard**, **memory_mode**,
**dream**, **digest**.

## Current state

### `src/cli/init.js` — the config-writing pattern to mirror

`init.js` renders `config.yaml` and, when it rewrites the `vault:` line, keeps the
manifest hash in sync so `uninstall` doesn't mistake the rewrite for a user edit:

```js
const updatedConfig = configContent.replace(/^vault: null.*$/m, `vault: ${paths.vault}`);
fs.writeFileSync(paths.config, updatedConfig);
const configEntry = manifest.entries.find((e) => e.kind === 'file' && e.path === paths.config);
if (configEntry) configEntry.hash = sha256(updatedConfig);
```

`init.js` also shows the `confirm(prompt)` readline helper and the `--dry-run` /
`--yes` argv handling you will reuse (copy the small helpers into `adopt.js`; do not
import them — `init.js` does not export them, and it is not in your deliverables).
The rendered config has flat top-level scalars including
`memory_mode: standard  # conservative | standard | eager` and a `vault:` line.

### `src/core/vault.js` — `scaffoldVault` and the "never overwrite" guarantee (extend)

`scaffoldVault(targetDir, opts)` copies `templates/vault/**` into the vault, **never
overwriting** existing files (`if (fs.existsSync(destPath)) { skipped.push(...);
continue; }`), records each created file as manifest kind **`vault-file`**, and
git-inits if the dir is not already a repo. You will ADD a sibling export,
`scaffoldMappedDirs`, that fills only the missing MAPPED dirs and (only if the mapped
identity dir has no notes) seeds the four identity stubs. It must NOT git-init
(adoption handles git as an explicit prerequisite step before scaffolding).

The identity stub templates live at
`templates/vault/06-Identity/{profile,preferences,goals,instructions}.md`.

### `src/scheduler/tccguard.js` — the local-path check (reuse)

```js
const TCC_PREFIXES = ['Desktop', 'Documents', 'Downloads', 'Library/Mobile Documents'];
function checkPath(p, home, platform = process.platform) { /* {protected, prefix} */ }
function guard(paths, home, platform = process.platform) { /* {ok, offending, prefix} */ }
module.exports = { TCC_PREFIXES, checkPath, guard };
```

`guard([absVaultPath], home)` returns `{ ok:false, offending, prefix }` if the path is
under a TCC prefix (macOS). Non-darwin → always `ok:true`. Use it verbatim.

### `src/core/layout.js` — the layout layer (reuse; do NOT modify)

```js
module.exports = { defaultLayout, readVaultLayout, resolveDailyPath, layoutPromptLines };
```

You will read the config's layout back with `readVaultLayout` in the e2e test and use
`defaultLayout()` as the base your inference overrides.

### `src/core/manifest.js` — reverse pass (reuse; do NOT modify)

`reverse()` handles kinds `file`/`dir`/`symlink`/`managed-block`/`settings-entry`/
`scheduler-entry`; any OTHER kind hits the `else` branch and is **skipped** (preserved)
with a one-line warning. `scaffoldVault` already relies on this for its `vault-file`
entries. Your `vault-file` (seeded stubs) and a new `vault-dir` (created dirs) kind are
likewise skipped → the adopted vault is never removed by `uninstall`. Do NOT add
handlers for these kinds (that is intentional; the harmless per-entry warning on
uninstall is the accepted behavior).

### `bin/wienerdog.js` — the command table (wire in)

```js
const commands = {
  init: () => require('../src/cli/init'),
  sync: () => require('../src/cli/sync'),
  dream: () => require('../src/cli/dream'),
  // ...
};
```

Add `adopt: () => require('../src/cli/adopt'),` and a `USAGE` line for it.

### `tests/integration/dream.test.js` + `tests/fixtures/dream/fake-brain.js` — the e2e pattern

Read `tests/integration/dream.test.js` for the exact recipe: temp `root` with
`home`/`core`/`vault`/`claude`/`codex-absent`, a config.yaml, a planted transcript
fixture under `<claude>/projects/<proj>/inj.jsonl`, `WIENERDOG_DREAM_CMD` pointed at a
fake brain, run the CLI in-process while swapping `process.env`, then assert on git
state. Your adoption e2e reuses this shape but drives `init → adopt → sync → dream`
across a NON-default (power-user) layout, with a fake brain that writes through the
MAPPED tiers (it reads the layout from `WIENERDOG_DREAM_LAYOUT`, which WP-024's
`spawnBrain` sets in the brain child env).

### `tests/fixtures/poweruser-vault/**` — the fixture you reuse (created by WP-022; read-only)

Identity at `06-Identity` (real notes), dailies nested at
`05-Daily/YYYY/MM/YYYY-MM-DD.md`, a `01-Projects/field-study/index.md`, and NO
`05-Skills` dir. It is NOT a git repo. Your e2e copies it to a temp dir, then adopts
that copy (so the git-init offer path is exercised). Do not edit the fixture.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/cli/adopt.js | the `wienerdog adopt <path>` command: prereqs, git offer, layout confirm, config write, scaffold, manifest |
| create | src/core/layout-infer.js | `inferLayout(vaultDir)` — heuristic `vault_layout` from real folder names + daily nesting |
| modify | src/core/vault.js | add `scaffoldMappedDirs(targetDir, layout, opts)` export; fill missing mapped dirs, seed identity stubs if identity dir empty; never overwrite; no git-init |
| modify | bin/wienerdog.js | register the `adopt` subcommand + USAGE line |
| create | tests/unit/layout-infer.test.js | `inferLayout` on the power-user fixture returns the expected mapping |
| create | tests/fixtures/adopt/fake-brain-mapped.js | fake dream brain that writes through the mapped tiers (reads `WIENERDOG_DREAM_LAYOUT`) |
| create | tests/integration/adopt-e2e.test.js | init → adopt → sync (digest from REAL identity) → dream (mapped tiers) → `git revert` undoes |

Do NOT modify `src/core/layout.js`, `src/core/digest.js`, `src/core/dream/*`,
`src/cli/init.js`, `src/cli/dream.js`, `src/core/manifest.js`,
`src/scheduler/tccguard.js`, the setup skill, or `tests/fixtures/poweruser-vault/`.

### Exact contracts

#### 1. `src/core/layout-infer.js` (create)

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { defaultLayout } = require('./layout');

/**
 * Infer a vault_layout from an existing vault's real structure. Pure, read-only,
 * deterministic. For each slot, pick the first EXISTING top-level directory whose
 * name contains the keyword (case-insensitive); otherwise the default. Detect daily
 * nesting by probing the chosen daily dir.
 * @param {string} vaultDir
 * @returns {import('./layout').VaultLayout}
 */
function inferLayout(vaultDir) { /* ... */ }

module.exports = { inferLayout };
```

Rules (start from `defaultLayout()`, override where evidence exists):

- `identity_dir`: first top-level dir whose lowercased name includes `identity`, else
  default `06-Identity`.
- `projects_dir`: includes `projects`, else `01-Projects`.
- `skills_dir`: includes `skills`, else `05-Skills` (may not exist — created lazily).
- `inbox_dir`: includes `inbox`, else `00-Inbox`.
- `daily_dir`: includes `daily`, else `07-Daily`.
- `daily_filename`: probe the chosen `daily_dir`:
  - if it directly contains any file matching `^\d{4}-\d{2}-\d{2}\.md$` → `YYYY-MM-DD.md`;
  - else if it contains a `\d{4}` subdir → a `\d{2}` subdir → a `YYYY-MM-DD.md` file →
    `YYYY/MM/YYYY-MM-DD.md`;
  - else default `YYYY-MM-DD.md`.
- `reports_dir`: if `reports/dreams` exists → `reports/dreams`; else if a top-level dir
  includes `reports` → `<that>/dreams`; else `reports/dreams`.

On the power-user fixture this returns: `identity_dir '06-Identity'`,
`daily_dir '05-Daily'`, `daily_filename 'YYYY/MM/YYYY-MM-DD.md'`,
`projects_dir '01-Projects'`, `skills_dir '05-Skills'`, `inbox_dir '00-Inbox'`,
`reports_dir 'reports/dreams'`. All returned paths use POSIX `/` separators.

#### 2. `src/core/vault.js` — add `scaffoldMappedDirs` (modify)

```js
/**
 * Fill ONLY the missing mapped directories of an adopted vault, without laying down
 * the full default template and WITHOUT git-init (adoption handles git separately).
 * Existing files are never touched. Manifest entries use kinds `uninstall` skips
 * (vault-dir / vault-file), so the adopted vault is never removed on uninstall.
 * @param {string} targetDir  the adopted vault
 * @param {import('./layout').VaultLayout} layout
 * @param {{dryRun?: boolean, manifest?: object}} [opts]
 * @returns {{createdDirs: string[], seededFiles: string[], skipped: string[]}}
 */
function scaffoldMappedDirs(targetDir, layout, opts = {}) { /* ... */ }
```

Behavior:

- Ensure these mapped dirs exist: `identity_dir`, `daily_dir`, `projects_dir`,
  `inbox_dir`, `skills_dir`, `reports_dir`. For each that does not exist:
  `fs.mkdirSync(abs, { recursive: true })` (skip on dryRun) and record
  `manifest.record(manifest, { kind: 'vault-dir', path: abs })` (skip on dryRun).
  Push to `createdDirs`. An already-present dir → `skipped`.
- Seed identity stubs ONLY IF the mapped `identity_dir` contains no `*.md` file:
  copy each of `templates/vault/06-Identity/{profile,preferences,goals,instructions}.md`
  into `<identity_dir>/`, substituting `{{DATE}}` (reuse the existing `today()`
  helper), recording each as `{ kind: 'vault-file', path }`. Push to `seededFiles`.
  If the identity dir already has notes (the adoption case for a real vault), seed
  nothing — the user's own identity notes stay.
- Never overwrite an existing file (mirror `scaffoldVault`'s existence check).
- Do NOT call git in this function.

Add `scaffoldMappedDirs` to `module.exports` alongside `scaffoldVault`. `scaffoldVault`
itself is unchanged.

#### 3. `src/cli/adopt.js` (create)

```
Usage: wienerdog adopt <path> [--dry-run] [--yes]
```

Steps, in order (exit non-zero via `throw new WienerdogError(...)` on any hard failure;
`bin/wienerdog.js` prints it as `wienerdog: <message>` and exits 1):

1. **Parse args.** First non-flag arg = the vault path (resolve to an absolute,
   realpath'd path). `--dry-run` prints the plan and stops before any write; `--yes`
   skips all confirmations. Missing `<path>` → error with usage.
2. **Require an existing install.** `getPaths()`; if `paths.config` is not a file →
   error "run `npx wienerdog init` first". Load the manifest (`manifestLib.load`).
3. **Path must be an existing directory** → else error.
4. **Refuse re-adoption.** If the current config already contains a `vault_layout:`
   block (use `readVaultLayout` vs `defaultLayout()` is NOT sufficient — check the raw
   text for a `^vault_layout:` line), error: "this install already has a vault_layout;
   edit `config.yaml` or reinstall to re-adopt." Keeps the rewrite atomic.
5. **TCC / local-disk check.** `tccguard.guard([adoptedPath], paths.home)`. If
   `!ok` → error naming the offending TCC location and recommending they move the
   vault out of it (or use guided import instead). (`paths.home` is the user's home.)
6. **Git prerequisite.** Check `git -C <adoptedPath> rev-parse --git-dir`
   (spawnSync, allow failure). If not a repo:
   - print why git is required (the revert safety guarantee);
   - unless `--yes`, `confirm("Initialize a git repository here and take an initial snapshot? [y/N] ")`;
     if declined → error "adoption needs a git repo; aborted." (git is a hard
     prerequisite — do NOT proceed without it).
   - if confirmed/`--yes`: `git init`, `git add -A`,
     `git -c user.name=wienerdog -c user.email=wienerdog@localhost commit -m "wienerdog: adopt — initial snapshot"`.
   If already a repo: leave it as-is (do not commit the user's uncommitted changes;
   just proceed — the first dream's clean-tree check will surface a dirty tree later,
   which is out of scope here).
7. **Infer + confirm layout.** `const layout = inferLayout(adoptedPath);` Print the
   mapping in plain language (one line per slot, e.g. "Daily notes: 05-Daily,
   filenames like 2026/07/2026-07-03.md"). Unless `--yes`,
   `confirm("Use this folder mapping? [y/N] ")`; if declined → error "layout not
   confirmed; aborted — re-run and confirm, or edit config.yaml after adopting."
8. **--dry-run stop point.** If `--dry-run`, after printing the prereq results,
   the inferred layout, and the list of dirs/files `scaffoldMappedDirs` WOULD create
   (call it with `{ dryRun: true }`), print "--dry-run: no changes made." and return.
   Make NO writes (no git init either — so run the git step's checks but guard the
   actual `git init`/commit behind `!dryRun`; for dry-run just report whether a git
   init would be offered).
9. **Write config.** Read `paths.config`; produce updated content:
   - replace the `^vault:.*$` line value with `vault: <adoptedPath>`;
   - replace the `^memory_mode:.*$` line value with
     `memory_mode: conservative  # set by adopt — strict gates for the first week`;
   - append a `vault_layout:` block with the confirmed seven keys, 2-space indented,
     in the exact shape `readVaultLayout` parses (see below).
   Write it, then keep the manifest config hash in sync exactly as `init.js` does
   (`sha256` the new content, update the `kind:'file'` entry for `paths.config`).
10. **Scaffold missing mapped dirs.**
    `scaffoldMappedDirs(adoptedPath, layout, { manifest })`.
11. **Persist manifest** (`manifestLib.save`).
12. **Print next steps.** Tell the user: adoption complete; `memory_mode` set to
    conservative; the previously-created default vault at `~/wienerdog` (if any) is now
    unused and can be deleted; run `wienerdog sync` to render the digest from their
    vault.

The `vault_layout:` block appended to config MUST be exactly parseable by
`readVaultLayout`:

```yaml
vault_layout:
  identity_dir: 06-Identity
  daily_dir: 05-Daily
  daily_filename: YYYY/MM/YYYY-MM-DD.md
  projects_dir: 01-Projects
  skills_dir: 05-Skills
  reports_dir: reports/dreams
  inbox_dir: 00-Inbox
```

Copy the `confirm(prompt)`, `dirExists`, `fileExists`, and `sha256(content)` helpers
from `init.js` into `adopt.js` (small, self-contained; init does not export them).
Use `spawnSync('git', ['-C', dir, ...])` for git; do not import vault.js's private
git helpers.

#### 4. `bin/wienerdog.js` (modify — two lines)

Add `adopt: () => require('../src/cli/adopt'),` to the `commands` map and an `adopt`
line to the `USAGE` block (aligned with the existing command list), reading:
"adopt — Use an existing vault in place as your Wienerdog vault".

#### 5. `tests/fixtures/adopt/fake-brain-mapped.js` (create)

An executable node script (shebang + it will be spawned via `WIENERDOG_DREAM_CMD`).
It reads `WIENERDOG_DREAM_VAULT`, `WIENERDOG_DREAM_SCRATCH`, `WIENERDOG_FAKE_TODAY`,
and **`WIENERDOG_DREAM_LAYOUT`** (JSON that WP-024's `spawnBrain` sets, containing the
layout plus `daily_today` = the resolved nested daily path). It writes, through the
MAPPED tiers:

- a valid Tier-3 identity note at `<identity_dir>/adopted-fact.md` with frontmatter
  `confidence: 0.9`, `recurrence: 3`, `derived_from_untrusted: false` (satisfies the
  floor → must survive);
- a Tier-1 daily entry at the `daily_today` path (create parent dirs), with any
  frontmatter (`type: daily`, `derived_from_untrusted: false`);
- the dream report at `<reports_dir>/<date>.md`.

Keep it minimal; mirror the style of `tests/fixtures/dream/fake-brain.js` (which you
may read for reference; do not edit it).

#### 6. `tests/unit/layout-infer.test.js` (create)

`node:test`; a test name contains `layout-infer`. Assert `inferLayout(POWERUSER_FIXTURE)`
returns the expected mapping (all seven keys, especially
`daily_dir === '05-Daily'` and `daily_filename === 'YYYY/MM/YYYY-MM-DD.md'`, and
`skills_dir === '05-Skills'` by default since the fixture has none). Add a temp-dir
case with a flat daily dir (`Daily/2026-07-03.md`) → `daily_filename === 'YYYY-MM-DD.md'`
and `daily_dir === 'Daily'`.

#### 7. `tests/integration/adopt-e2e.test.js` (create)

`node:test`; test names contain `adopt-e2e`. Follow the env-swap recipe from
`tests/integration/dream.test.js`. In one test:

1. Temp `root`; copy `tests/fixtures/poweruser-vault` → `root/adopted` (recursively).
   Create `root/home`, `root/core`, `root/default-vault`, `root/claude/projects/proj/`
   with a copied transcript fixture so the dream has input (reuse
   `tests/fixtures/dream/transcripts/claude-injection.jsonl` or the poweruser fixture
   — whichever gives the fake brain something to run against; the fake brain writes a
   fixed set regardless of input, so any non-empty transcript works).
2. Set `process.env` (save/restore like the dream integration test): `HOME=root/home`,
   `WIENERDOG_HOME=root/core`, `WIENERDOG_VAULT=root/default-vault`,
   `CLAUDE_CONFIG_DIR=root/claude`, `CODEX_HOME=root/codex-absent`,
   `WIENERDOG_FAKE_TODAY='2026-07-03'`,
   `WIENERDOG_DREAM_CMD=<abs path to fake-brain-mapped.js>`.
3. Run `require('../../src/cli/init').run(['--yes'])` → default vault scaffolded at
   `WIENERDOG_VAULT`, config written.
4. Run `require('../../src/cli/adopt').run([root/adopted, '--yes'])`. Assert:
   - the adopted dir is now a git repo with ≥1 commit;
   - `config.yaml` `vault:` points at `root/adopted`;
   - `readVaultLayout(config)` reports `daily_dir === '05-Daily'` and the nested
     `daily_filename`;
   - `config.yaml` `memory_mode` is `conservative`.
5. Run `require('../../src/cli/sync').run([])`. Assert `~/.wienerdog/state/digest.md`
   (i.e. `root/core/state/digest.md`) includes the REAL identity content from the
   fixture (a distinctive phrase from `poweruser-vault/06-Identity/profile.md`) AND
   the nested daily's `## Summary` line — proving the digest renders from the adopted
   vault's real notes via the mapped layout.
6. Run `require('../../src/cli/dream').run(['--yes'])`. Assert:
   - exactly one new commit in the adopted vault;
   - the mapped Tier-3 identity note `06-Identity/adopted-fact.md` is committed;
   - the Tier-1 daily at `05-Daily/2026/07/2026-07-03.md` is committed;
   - the report at `reports/dreams/2026-07-03.md` exists.
7. `git -C root/adopted revert --no-edit HEAD`; assert the dream's files are gone and
   `git status --porcelain` is clean — the whole run is revertible (the adoption
   safety guarantee).

Restore `process.env` in a `finally` and `fs.rmSync(root, { recursive: true, force:
true })`. This test runs under `npm test` with NO quota (the fake brain replaces the
real one via `WIENERDOG_DREAM_CMD`).

## Implementation notes & constraints

- **Zero new dependencies.** Node stdlib; JSDoc types; no build step.
- **Reversibility is the whole point.** Adoption must record adopted-vault artifacts
  ONLY under `vault-file` / `vault-dir` (skipped by `manifest.reverse`); never
  `file`/`dir` (which would delete them). The core (`~/.wienerdog`) + config ARE
  removed on uninstall as usual — only the adopted vault is preserved.
- **Do not git-init inside `scaffoldMappedDirs`.** Adoption's git step (with the
  interactive offer) is the single place git is touched. `scaffoldMappedDirs` only
  makes dirs/files.
- **TCC check is macOS-only by design** (tccguard returns `ok:true` off darwin). Do
  not add a bespoke "local disk" mount check — "not TCC-protected" is v1's definition
  of an acceptable local path; note this under "Decisions made."
- **The orphaned default vault is expected.** `init` already scaffolded
  `~/wienerdog`; adopting elsewhere leaves it unused. Do NOT delete it (uninstall
  preserves it as `vault-file` entries too); just tell the user it is unused.
- **The uninstall warning for `vault-dir`/`vault-file` kinds is accepted** (manifest's
  else-branch). Do NOT modify `manifest.js` to silence it — that is out of scope.
- **`init flag vs subcommand` — decision made:** adoption is a **separate
  `wienerdog adopt <path>` subcommand**, not an `init` flag, because it presupposes an
  existing install (config + manifest) and has a distinct interactive prerequisite
  flow; folding it into `init` would tangle two different lifecycles. Recorded here so
  the implementer does not re-litigate it.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope (no doctor changes, no assisted migration, no re-adopt
  editing, no Windows-specific path logic).

## Acceptance criteria

- [ ] `wienerdog adopt <tcc-path>` on macOS refuses with a TCC message and writes
      nothing.
- [ ] `wienerdog adopt <non-git-dir> --yes` initializes git with an initial commit
      before writing config; `adopt` on a non-git dir with the offer declined aborts
      and writes nothing.
- [ ] After `adopt`, `config.yaml` has `vault:` = the adopted path, a
      `vault_layout:` block matching the inferred mapping, and
      `memory_mode: conservative`; the manifest config hash is in sync.
- [ ] `scaffoldMappedDirs` creates only missing mapped dirs, seeds identity stubs only
      when the identity dir is empty, never overwrites, and records `vault-dir` /
      `vault-file` entries only.
- [ ] `inferLayout(poweruser-fixture)` returns the nested-daily mapping.
- [ ] The end-to-end test passes: init → adopt → sync (digest from the REAL identity
      notes + nested daily) → dream (writes through mapped Tier-3/Tier-1 + mapped
      report, one commit) → `git revert` cleanly undoes the run.
- [ ] Re-running `adopt` on an already-adopted install is refused cleanly.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern layout-infer
npm test -- --test-name-pattern adopt-e2e
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `vault_layout` reader, digest, or dream-path code (WP-022, WP-024) — reuse it.
- The setup-skill import path (WP-025).
- Modifying `manifest.js`, `tccguard.js`, `init.js`, `dream.js`, or the layout module.
- A `doctor` check for adopted vaults in TCC/iCloud, assisted migration, re-adoption
  editing, or Windows-specific handling — future WPs. Refuse cleanly where relevant.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/026-full-adoption-flow`; conventional commits; PR titled
   `feat(cli): full vault adoption — wienerdog adopt (WP-026)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
