---
id: WP-004
title: Implement vault skeleton generator + golden-file harness
status: Done
model: sonnet
size: M
depends_on: [WP-003]
adrs: [ADR-0004]
branch: wp/004-vault-skeleton
---

# WP-004: Implement vault skeleton generator + golden-file harness

## Context (read this, nothing else)

The **vault** is the user's markdown memory — the heart of the product. It lives by default at `~/wienerdog/` ($HOME root is deliberately NOT `~/Documents`: macOS TCC protects Documents/Desktop/iCloud and unattended scheduled jobs would hang on permission prompts; $HOME root is unprotected). It follows Obsidian conventions — PARA folders, atomic notes, `[[wikilinks]]`, YAML frontmatter — but requires no Obsidian. It is git-initialized at creation: later, the nightly dream job makes exactly one commit per run so any night is revertible.

This WP implements the vault scaffolder wired into `wienerdog init`, and introduces the **golden-file test harness** — the repo's core QA technique: generate into a temp dir, byte-compare against a checked-in fixture tree, so any product change shows up as a reviewable golden diff.

## Current state

WP-003 provides: `bin/wienerdog.js` dispatch, `src/cli/init.js` (creates `~/.wienerdog` core, prints plan, `--dry-run`/`--yes`), `src/core/paths.js` (`getPaths(env)` — extend it with `vault`), `src/core/manifest.js` (`record`/`reverse`), temp-HOME test pattern via `WIENERDOG_HOME` env. `config.yaml` contains `vault: null`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/vault.js | scaffolder |
| modify | src/core/paths.js | add `vault` default `~/wienerdog`, `$WIENERDOG_VAULT` override |
| modify | src/cli/init.js | vault step after core step |
| create | templates/vault/ | the skeleton source tree (all files below) |
| create | tests/golden/vault-default/ | fixture tree |
| create | tests/helpers/golden.js | compare helper |
| create | tests/unit/vault.test.js | |

### Exact contracts

```js
/** src/core/vault.js
 *  @param {string} targetDir  @param {{dryRun?: boolean, manifest?: object}} opts
 *  @returns {{created: string[], skipped: string[]}}
 *  Copies templates/vault/** to targetDir, creating dirs as needed. Existing
 *  files are NEVER overwritten (→ skipped). Runs `git init` + initial commit
 *  ("wienerdog: vault created") iff targetDir was not already a git repo (use
 *  `git -C <dir> rev-parse --git-dir` to check; spawn git, don't reimplement).
 *  Records every created path in the manifest when provided.
 *  Throws WienerdogError if git is not installed (message tells user to install it). */
async function scaffoldVault(targetDir, opts)
```

`templates/vault/` tree (create each file with exactly this content pattern; frontmatter dates use the literal placeholder `{{DATE}}` in templates, replaced with today's `YYYY-MM-DD` at scaffold time — in the golden fixture the placeholder stays literal because the golden test injects a fixed date):

```
templates/vault/
├── CLAUDE.md            # vault conventions for the model (content below)
├── .gitignore           # ".obsidian/workspace*" and ".DS_Store"
├── 00-Inbox/README.md
├── 01-Projects/README.md
├── 02-Areas/README.md
├── 03-Resources/README.md
├── 04-Archive/README.md
├── 05-Skills/README.md
├── 06-Identity/profile.md · preferences.md · goals.md · instructions.md   # empty scaffolds w/ frontmatter + section headings
├── 07-Daily/README.md
└── reports/dreams/README.md
```

`templates/vault/CLAUDE.md` must cover, briefly (~40 lines): what this vault is; PARA folder meanings (one line each); note format = atomic, one concept per file, kebab-case filename, `[[wikilinks]]` between related notes; the frontmatter schema (id, type: note|daily|moc|skill|identity, created, updated, tags, status: active|incubating|archived, and provenance fields origin/source_sessions/confidence/recurrence/derived_from_untrusted — mandatory on auto-written notes); rule that `06-Identity` is the source CLAUDE.md/AGENTS.md digests are rendered from; rule that machine state never lives here.

Each `README.md` is 3–6 lines: what belongs in this folder, one example filename. Identity scaffolds: frontmatter (`type: identity`, `origin: interview`, dates `{{DATE}}`) + empty sections the interview (WP-005) will fill (profile: Role/Background/Context; preferences: Communication/Tools/Workflow; goals: Now/This year; instructions: How to work with me).

`tests/helpers/golden.js`:
```js
/** compareTrees(actualDir, goldenDir) → {equal: boolean, diffs: string[]}
 *  Recursive byte comparison; diffs entries like "only-in-actual: x",
 *  "differs: y". Ignores .git/ entirely. */
```

`init` integration: after the core step, if `config.yaml` has `vault: null`, print the vault plan (target path from paths.vault), scaffold, then update `vault:` in config.yaml to the absolute path (string replace of the `vault: null` line — full YAML rewriting is out of scope) and record file creations in the manifest. If config already has a vault path, verify it exists and skip.

## Implementation notes & constraints

- Scaffold-time date injection: `{{DATE}}` replaced via env override `WIENERDOG_FAKE_TODAY` when set (tests/golden use `2026-01-01`); real runs use the actual date.
- The golden test runs `scaffoldVault` into a temp dir with `WIENERDOG_FAKE_TODAY=2026-01-01`, then `compareTrees` against `tests/golden/vault-default/` (which contains the rendered result with `2026-01-01`, not the placeholder — correcting the Context note: golden fixtures hold rendered output).
- Uninstall interplay: vault files are recorded in the manifest but `uninstall` (WP-003's reverse) must NOT remove them — extend nothing; instead record vault entries with kind `vault-file`, which WP-003's reverse already skips as unknown-kind with a warning. State this in your PR's "Decisions made".
- No new dependencies.

## Acceptance criteria

- [ ] Fresh temp HOME: `init --yes` creates core + vault; vault is a git repo with exactly one commit; `config.yaml` contains the absolute vault path.
- [ ] Re-running `init --yes` changes nothing (skipped list covers all files; no second git commit).
- [ ] A pre-existing file in the target (e.g. user's own `06-Identity/profile.md`) survives untouched.
- [ ] Golden test passes byte-for-byte; `npm test`, `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
export WIENERDOG_HOME=$(mktemp -d)/wd WIENERDOG_VAULT=$(mktemp -d)/vault
node bin/wienerdog.js init --yes && git -C $WIENERDOG_VAULT log --oneline
node bin/wienerdog.js init --yes   # second run: nothing to do
```

## Out of scope (do NOT do these)

- Existing-vault adoption interview flow and TCC-path warnings (WP-005/WP-006 territory). Digest rendering. Managed blocks. Any writes under `~/.claude`/`~/.codex`. Obsidian `.obsidian/` starter config (v1.1).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/004-vault-skeleton`; PR titled `feat(vault): implement vault skeleton generator (WP-004)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
