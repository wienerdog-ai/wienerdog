---
id: WP-022
title: Vault layout config layer + layout-aware digest render
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0010]
branch: wp/022-vault-layout-layer
---

# WP-022: Vault layout config layer + layout-aware digest render

## Context (read this, nothing else)

Wienerdog's file pipeline currently hardcodes the vault's folder names. The digest
renderer (`src/core/digest.js`) assumes identity notes live in `06-Identity/`,
daily logs are flat files at `07-Daily/YYYY-MM-DD.md`, and projects are
subdirectories of `01-Projects/`. The dream validator and the dream skill hardcode
the same constants. That is fine for a *fresh* vault (the default `~/wienerdog/`
Wienerdog scaffolds), but it blocks **adoption** — using a power user's existing
vault in place, where identity might be `06-Identity/` but daily notes are nested
`05-Daily/YYYY/MM/YYYY-MM-DD.md` (ADR-0010, read it).

This work package introduces the **`vault_layout` config layer**: a small module
that reads an optional `vault_layout:` block from `~/.wienerdog/config.yaml` and
resolves it to a plain object whose defaults are exactly today's hardcoded paths.
It then makes the **render path** (the digest) layout-aware. A sibling WP (WP-024)
makes the **write path** (dream validate + skill + brain prompt) layout-aware; the
adoption CLI (WP-026) writes a non-default `vault_layout` block. This WP touches the
render path only.

Two product invariants govern every line here:

- **Wienerdog is just files (ADR-0004).** This adds a config-reading module and a
  parameter; no process, no daemon, no telemetry.
- **Default layout = current behavior, byte-for-byte.** A config with no
  `vault_layout:` block (every existing install) must produce an identical digest.
  The existing golden test `tests/golden/digest-default.md` must still pass
  untouched.

Terminology is canonical (GLOSSARY): **vault**, **digest**, **dream**. Do not invent
synonyms.

## Current state

### `src/core/digest.js` — `renderDigest(vaultDir)` (the function you retrofit)

It takes ONE argument and hardcodes every path. The relevant excerpts:

```js
function renderDigest(vaultDir) {
  const idDir = path.join(vaultDir, '06-Identity');
  const identity = [
    ['profile.md', "# Who you're working with"],
    ['preferences.md', '## Preferences'],
    ['goals.md', '## Goals'],
    ['instructions.md', '## Standing instructions'],
  ];
  // ... renders each identity note ...
  const projects = listProjectDirs(path.join(vaultDir, '01-Projects'));
  // ...
  const daily = newestDaily(path.join(vaultDir, '07-Daily'));
  // ...
}
```

`newestDaily(dir)` currently reads **one flat directory** and filters
`YYYY-MM-DD.md`:

```js
function newestDaily(dir) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return null; }
  const daily = names.filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
  if (daily.length === 0) return null;
  const name = daily[daily.length - 1];
  return { path: path.join(dir, name), date: name.replace(/\.md$/, '') };
}
```

This cannot find a nested `05-Daily/2026/07/2026-07-02.md`. The identity note
FILENAMES (`profile.md`, `preferences.md`, `goals.md`, `instructions.md`) are a
Wienerdog convention and stay fixed; only the *directories* and the daily *nesting*
are layout-mapped.

### `src/cli/sync.js` — the digest caller you rewire

`sync.js` reads the vault path from config and renders the digest:

```js
const { renderDigest } = require('../core/digest');
// ...
const vaultPath = readVaultPath(paths.config);
// ...
const digest = renderDigest(vaultPath);
```

`sync.js` already has its own top-level scalar reader `readVaultPath(configPath)`
(a `^vault:[ \t]*(.*)$` regex). You will add a layout read alongside it.

### `src/core/dream/config.js` — the existing config reader to mirror

`readScalar(body, key)` reads a single **top-level** scalar and deliberately skips
indented lines (`if (/^\s/.test(line)) continue;`). The new `vault_layout:` block is
a **nested** map, so it needs its own small parser — do not try to extend
`readScalar`. Model your parser's quote/comment handling on it.

### `~/.wienerdog/config.yaml` — the file format

Rendered by `wienerdog init` (`src/cli/init.js` `renderConfig`) as flat top-level
scalars, e.g.:

```yaml
version: 1
vault: /Users/ada/wienerdog
harnesses:
  claude: true
  codex: false
memory_mode: standard
```

There is **no** `vault_layout:` block in a fresh install — its absence means
"defaults". WP-026 (adoption) appends one. You are NOT modifying `init.js` or the
config template in this WP; you only READ the block if present.

### Existing tests that must stay green

- `tests/unit/digest.test.js` — asserts `renderDigest(FIXTURE)` equals
  `tests/golden/digest-default.md` byte-for-byte, and covers the tainted/missing
  cases. It calls `renderDigest` with ONE argument. Your signature change must keep
  this passing (layout parameter defaults to the default layout).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/layout.js | the `vault_layout` layer: `defaultLayout`, `readVaultLayout`, `resolveDailyPath`, `layoutPromptLines` |
| modify | src/core/digest.js | `renderDigest(vaultDir, layout = defaultLayout())`; resolve identity/projects/daily dirs from layout; recursive daily lookup |
| modify | src/cli/sync.js | read layout from config, pass it to `renderDigest` |
| create | tests/unit/layout.test.js | unit-test the reader, `resolveDailyPath`, `layoutPromptLines`, and a non-default-layout digest render on the power-user fixture |
| create | tests/fixtures/poweruser-vault/** | fixture vault: real identity notes, nested `05-Daily/YYYY/MM` dailies, a project, NO skills dir (files enumerated below) |

Do NOT touch `src/core/dream/validate.js`, `src/core/dream/brain.js`,
`src/cli/dream.js`, the dream skill, `src/cli/init.js`, `tests/unit/digest.test.js`,
or `tests/golden/`. Those belong to WP-024 (write path) and WP-026 (adoption).

### Exact contracts

#### 1. `src/core/layout.js` (create)

```js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {Object} VaultLayout
 * @property {string} identity_dir    identity notes dir      (default '06-Identity')
 * @property {string} daily_dir       daily-log dir           (default '07-Daily')
 * @property {string} daily_filename  daily filename pattern relative to daily_dir;
 *                                     may nest (default 'YYYY-MM-DD.md';
 *                                     power-user 'YYYY/MM/YYYY-MM-DD.md')
 * @property {string} projects_dir    project MOC dirs live under here (default '01-Projects')
 * @property {string} skills_dir      synthesized skills dir  (default '05-Skills')
 * @property {string} reports_dir     dream reports dir       (default 'reports/dreams')
 * @property {string} inbox_dir       capture-staging dir     (default '00-Inbox')
 */

/** @returns {VaultLayout} the built-in defaults (== today's hardcoded paths). */
function defaultLayout() { /* returns a fresh object each call */ }

/**
 * Read the optional `vault_layout:` block from a config.yaml file. Missing file,
 * missing block, or missing keys → the corresponding defaults. Only the seven keys
 * above are honored; unknown nested keys are ignored. Values are treated as trimmed
 * strings (one layer of surrounding quotes stripped; inline ` #` comment dropped on
 * unquoted values — same rules as dream/config.js readScalar).
 * @param {string} configFile  absolute path to config.yaml
 * @returns {VaultLayout}
 */
function readVaultLayout(configFile) { /* ... */ }

/**
 * The vault-relative path of the daily log for a given date, substituting into
 * daily_filename and joining under daily_dir. Tokens: 'YYYY'→year, 'MM'→month,
 * 'DD'→day, taken from a 'YYYY-MM-DD' date string.
 * resolveDailyPath(default, '2026-07-03')      === '07-Daily/2026-07-03.md'
 * resolveDailyPath(powerUser, '2026-07-03')    === '05-Daily/2026/07/2026-07-03.md'
 * @param {VaultLayout} layout
 * @param {string} date  'YYYY-MM-DD'
 * @returns {string} vault-relative POSIX-style path
 */
function resolveDailyPath(layout, date) { /* ... */ }

/**
 * Human-readable lines describing the layout for the dream brain's prompt (WP-024
 * consumes this). Returns an array of plain-language lines mapping each tier to its
 * directory, plus the concrete daily-log path for `date`. Example lines:
 *   'Identity notes directory: 06-Identity'
 *   'Skills directory: 05-Skills'
 *   'Daily log file for today: 05-Daily/2026/07/2026-07-03.md'
 *   'Projects directory: 01-Projects'
 *   'Inbox directory: 00-Inbox'
 *   'Reports directory: reports/dreams'
 * @param {VaultLayout} layout
 * @param {string} date  'YYYY-MM-DD'
 * @returns {string[]}
 */
function layoutPromptLines(layout, date) { /* ... */ }

module.exports = { defaultLayout, readVaultLayout, resolveDailyPath, layoutPromptLines };
```

Parser requirements for `readVaultLayout`:

- Find the line that is exactly `vault_layout:` (no leading whitespace; a trailing
  comment after it is allowed). Then consume the following **indented** lines
  (leading whitespace) of the form `<key>: <value>` (two-space indented). Stop at the
  first non-indented, non-blank line (dedent) or EOF.
- Blank lines and `#`-comment lines inside the block are skipped, not stops.
- Strip one layer of matching surrounding quotes; on unquoted values drop an inline
  comment (a space followed by `#`); trim.
- Merge parsed keys over `defaultLayout()`; return the merged object. Any key not in
  the seven-key allowlist is ignored.
- Unreadable/absent file → `defaultLayout()`.

Example the parser must handle (WP-026 writes exactly this shape):

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

#### 2. `src/core/digest.js` (modify)

- Change the signature to `renderDigest(vaultDir, layout = defaultLayout())` and
  `require('./layout')` for the default. **No other caller change is forced** —
  `renderDigest(vaultDir)` keeps working with defaults, so `tests/unit/digest.test.js`
  and `tests/golden/digest-default.md` stay green.
- Resolve `idDir` from `layout.identity_dir`, projects from `layout.projects_dir`,
  daily from `layout.daily_dir`. The four identity FILENAMES stay fixed.
- Make `newestDaily(dir)` find nested dailies: walk `dir` **recursively**, collect
  files whose **basename** matches `^\d{4}-\d{2}-\d{2}\.md$`, and pick the newest by
  basename (lexical sort == chronological). Return `{ path, date }` where `date` is
  the basename minus `.md`. A missing `dir` still returns `null`. This handles both
  flat (`07-Daily/2026-07-03.md`) and nested (`05-Daily/2026/07/2026-07-03.md`)
  layouts with the same code; `daily_filename` is NOT needed for reading (only WP-024
  uses it, for writing).

#### 3. `src/cli/sync.js` (modify — two lines)

```js
const { renderDigest } = require('../core/digest');
const { readVaultLayout } = require('../core/layout');   // add
// ...
const layout = readVaultLayout(paths.config);            // add, after readVaultPath
const digest = renderDigest(vaultPath, layout);          // pass layout
```

Nothing else in `sync.js` changes.

#### 4. `tests/fixtures/poweruser-vault/**` (create)

A vault modeled on a real power-user layout: identity at `06-Identity` (same as
default), dailies **nested** at `05-Daily/YYYY/MM/YYYY-MM-DD.md`, one project, and
**no** `05-Skills` directory. Create exactly these files (this fixture is also reused
by WP-026's adoption test, so keep it faithful and do not make it a git repo):

- `06-Identity/profile.md` — frontmatter incl. `derived_from_untrusted: false`, a
  `# Profile` title, and `## Role` / `## Background` / `## Context` sections with
  real content for a distinct persona (NOT "Ada Kovács" — pick another, e.g. a
  freelance researcher, so the test can't accidentally match the default golden).
- `06-Identity/preferences.md` — `## Communication` / `## Tools` / `## Workflow`.
- `06-Identity/goals.md` — `## Now` / `## This year`.
- `06-Identity/instructions.md` — `## How to work with me`.
- `05-Daily/2026/07/2026-07-02.md` — frontmatter `type: daily`, a `## Summary`
  section with one line of content (digest reads the `Summary` section of the newest
  daily).
- `01-Projects/field-study/index.md` — a project MOC (so the digest lists
  `field-study` under Active projects).

Match the frontmatter/section shape of `tests/fixtures/identity-filled/` (read it for
reference; it is NOT in your deliverables — do not edit it).

#### 5. `tests/unit/layout.test.js` (create)

A `node:test` file; at least one test name contains `layout` (for
`--test-name-pattern layout`). Cover:

- `defaultLayout()` returns the seven documented defaults; two calls return
  independent objects (mutating one must not affect the other).
- `readVaultLayout` on a temp config with NO block → all defaults.
- `readVaultLayout` on a temp config with the power-user block above → the mapped
  values (`daily_dir === '05-Daily'`, `daily_filename === 'YYYY/MM/YYYY-MM-DD.md'`,
  etc.), unspecified keys still defaulted.
- `readVaultLayout` ignores an unknown nested key and stops at a dedented line
  (e.g. a `memory_mode: eager` line after the block is NOT swallowed).
- `resolveDailyPath` for default and power-user layouts (the two examples above).
- `layoutPromptLines(powerUser, '2026-07-03')` includes a line with
  `05-Daily/2026/07/2026-07-03.md` and one naming `06-Identity` as identity.
- `renderDigest(POWERUSER_FIXTURE, powerUserLayout)` (require both modules) INCLUDES
  the fixture's identity content, lists `field-study` under Active projects, and
  includes the nested daily's `## Summary` content — proving the nested-daily walk
  and the identity/projects mapping. Assert with `.includes(...)` (mirroring
  `digest.test.js`), not a golden file.
- Control: `renderDigest(POWERUSER_FIXTURE)` (default layout, no second arg) does NOT
  include the daily summary (it looks in `07-Daily`, which the fixture lacks) —
  proving the layout argument is what routes the lookup.

## Implementation notes & constraints

- **Zero new dependencies.** Node stdlib only; JSDoc types; no TypeScript; no build
  step. No YAML library — hand-parse the block as specified.
- **Do not extend `dream/config.js readScalar`** to read the nested block — it is
  deliberately top-level-only and other WPs rely on that. Write the block parser in
  `layout.js`.
- **`resolveDailyPath` returns POSIX-style separators** (use `path.posix.join` or
  normalize `\` → `/`), because the value is written into config and prompts and must
  be stable across OSes. Reading (`newestDaily`) uses normal `path`/`fs`.
- **Keep `renderDigest` pure and deterministic** — same inputs, identical bytes (an
  existing digest.test.js assertion).
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope (no config writing, no dream-path changes here).

## Acceptance criteria

- [ ] `readVaultLayout` returns all defaults for a config with no `vault_layout:`
      block, and the mapped values for the power-user block; unknown keys ignored;
      a dedented line after the block is not consumed.
- [ ] `resolveDailyPath(default,'2026-07-03') === '07-Daily/2026-07-03.md'` and
      `resolveDailyPath(powerUser,'2026-07-03') === '05-Daily/2026/07/2026-07-03.md'`.
- [ ] `renderDigest(fixture, powerUserLayout)` renders identity + nested-daily
      summary + the project; `renderDigest(fixture)` (default) omits the daily.
- [ ] `tests/unit/digest.test.js` and `tests/golden/digest-default.md` still pass
      unchanged (default-layout render is byte-identical).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern layout      # the new layout + non-default digest tests
npm test -- --test-name-pattern digest      # existing golden digest test still green
npm test                                    # full suite unaffected
npm run lint
```

## Out of scope (do NOT do these)

- The dream write path — tier-prefix resolution in `validate.js`, the brain prompt in
  `brain.js`, `dream.js` wiring, the dream skill (WP-024).
- Writing a `vault_layout:` block, `init.js`, or the adoption CLI (WP-026).
- The guided-import skill (WP-025).
- Any change to `tests/golden/` or `tests/fixtures/identity-filled/`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/022-vault-layout-layer`; conventional commits; PR titled
   `feat(core): vault layout config layer + layout-aware digest (WP-022)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
