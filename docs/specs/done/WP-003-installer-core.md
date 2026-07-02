---
id: WP-003
title: Implement installer core (init, doctor, uninstall, manifest)
status: Done
model: opus
size: M
depends_on: [WP-001]
adrs: [ADR-0003, ADR-0004]
branch: wp/003-installer-core
---

# WP-003: Implement installer core (init, doctor, uninstall, manifest)

## Context (read this, nothing else)

Wienerdog installs configuration files into a user's machine: a canonical core at `~/.wienerdog/` (config, state, logs, secrets dirs) and, in later WPs, a memory vault, managed blocks in the user's CLAUDE.md/AGENTS.md, hooks, and schedules. The defining constraints: everything written must be **idempotent** (second run = zero changes), **manifest-tracked** (every file created and config entry added is recorded), and **fully reversible** (`uninstall` replays the manifest in reverse). Wienerdog never starts long-running processes (ADR-0004): the CLI runs and exits.

This WP builds the CLI skeleton and the three lifecycle commands, plus harness detection. It deliberately does NOT create the vault (WP-004) or touch any harness config (WP-006) — `init` at this stage creates only the canonical core and reports what it found.

## Current state

`bin/wienerdog.js` is a stub that prints a pre-release message and exits 1. `src/` does not exist. WP-001 provides `npm run lint`, node:test wiring, and CI.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | bin/wienerdog.js | subcommand dispatch |
| create | src/cli/init.js | |
| create | src/cli/doctor.js | |
| create | src/cli/uninstall.js | |
| create | src/core/paths.js | all path resolution, overridable for tests |
| create | src/core/manifest.js | |
| create | src/core/detect.js | harness detection |
| create | src/core/errors.js | WienerdogError |
| create | tests/unit/manifest.test.js | |
| create | tests/unit/init.test.js | uses temp HOME |
| create | tests/unit/uninstall.test.js | uses temp HOME |

### Exact contracts

`bin/wienerdog.js`: dispatch `init | doctor | uninstall` to `src/cli/<cmd>.js` (each exports `async function run(argv)`), global flags `--dry-run`, `--yes`. Unknown command → usage text, exit 2. Errors of class WienerdogError print `wienerdog: <message>` and exit 1; unexpected errors re-throw (stack visible).

`src/core/paths.js`:
```js
/** All filesystem locations, computed from env for testability.
 *  @returns {{home, core, config, state, secrets, logs, manifest,
 *             claudeDir, codexDir}} — core = $WIENERDOG_HOME || ~/.wienerdog */
function getPaths(env = process.env)
```

`src/core/manifest.js`:
```js
/** install-manifest.json shape:
 *  { version: 1, createdAt: ISO, entries: [
 *      {kind: 'dir'|'file', path: string}                      // created by us
 *  ] }
 *  API: load(paths), record(manifest, entry), save(paths, manifest),
 *  reverse(paths, manifest, {dryRun}) → {removed: string[], skipped: string[]}
 *  reverse removes files we created (only if kind 'file'), then dirs (only if
 *  empty), in reverse order. Files that changed since install are still ours
 *  to remove EXCEPT config.yaml which is skipped with a notice. Unknown kinds:
 *  skip with warning (forward compat for 'settings-entry' etc. in later WPs). */
```

`src/core/detect.js`:
```js
/** @returns {{claude: {present: boolean, dir: string},
 *             codex:  {present: boolean, dir: string}}}
 *  claude.present = dir ~/.claude exists; codex.present = ~/.codex exists.
 *  Respect $CLAUDE_CONFIG_DIR and $CODEX_HOME overrides when set. */
function detectHarnesses(env = process.env)
```

`init` behavior: print a plan (list of dirs/files to create + detected harnesses); with `--dry-run` stop there; else after confirmation (`--yes` skips the prompt; prompt via readline) create `~/.wienerdog/{state,secrets,logs}` dirs, `config.yaml` (literal initial content below), and the manifest recording all of it. `secrets/` gets mode 0700. Re-running `init` when everything exists prints "already installed, nothing to do" and exits 0 with zero changes.

Initial `config.yaml` (literal):
```yaml
# Wienerdog configuration — https://github.com/wienerdog-ai/wienerdog
version: 1
vault: null            # set by vault setup (WP-004)
harnesses:
  claude: false        # set true by init when detected
  codex: false
memory_mode: standard  # conservative | standard | eager
```
(with the two booleans reflecting detection results).

`doctor` checks, each printing `ok`/`warn`/`fail` + one-line detail, exit 1 if any `fail`: core dir exists; manifest parses; config.yaml parses (hand-rolled flat-YAML subset parser in `src/core/config.js`? NO — config parsing belongs to later WPs; for now doctor only checks the file exists and is non-empty); secrets dir mode is 0700 (skip on Windows); harness detection summary (informational).

`uninstall` behavior: load manifest; print exactly what will be removed; `--dry-run` stops; confirmation required unless `--yes`; then `manifest.reverse()`; print summary. Never touches anything not in the manifest. Exits 0 even if some entries were already gone (reported in `skipped`).

## Implementation notes & constraints

- Node stdlib only. No prompts library — plain `readline`.
- All fs writes go through small helpers so `--dry-run` is enforced in one place.
- Tests: set `WIENERDOG_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` to dirs under a `fs.mkdtemp` temp root — never touch the real `$HOME`.
- Trap: `fs.rmdir` on non-empty dirs — use `fs.rmSync(p, {recursive: false})` semantics deliberately (dirs only removed when empty; that's the spec).

## Acceptance criteria

- [ ] Fresh temp HOME: `init --yes` creates core + config + manifest; second `init --yes` makes zero changes (verify via mtime/dir snapshot) and says so.
- [ ] `init --dry-run` creates nothing (dir snapshot identical).
- [ ] `uninstall --dry-run` lists exactly the manifest contents; `uninstall --yes` removes everything except nothing remains under the temp core (config.yaml skip rule applies only when it was user-modified after install — compare content hash recorded in manifest).
- [ ] `doctor` exits 0 on a healthy install, 1 when manifest is corrupted (test both).
- [ ] `npm test` and `npm run lint` pass on macOS and Linux.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
WIENERDOG_HOME=$(mktemp -d)/wd node bin/wienerdog.js init --yes
WIENERDOG_HOME=<same> node bin/wienerdog.js init --yes        # prints nothing-to-do
WIENERDOG_HOME=<same> node bin/wienerdog.js doctor
WIENERDOG_HOME=<same> node bin/wienerdog.js uninstall --dry-run
WIENERDOG_HOME=<same> node bin/wienerdog.js uninstall --yes
```

## Out of scope (do NOT do these)

- Vault creation (WP-004). Managed blocks / hooks / settings entries in `~/.claude` or `~/.codex` (WP-006, WP-010) — detect only, write nothing there. `sync` command. Golden-file harness (arrives with WP-004 where file trees get interesting). Windows-specific testing (CI is macOS+Linux; keep code path-separator-safe via `path.join`).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/003-installer-core`; PR titled `feat(cli): implement installer core (WP-003)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
