---
id: WP-006
title: Implement Claude Code adapter (managed block, hooks, skills registration)
status: In-Review
model: opus
size: M
depends_on: [WP-005]
adrs: [ADR-0004]
branch: wp/006-claude-adapter
---

# WP-006: Implement Claude Code adapter (managed block, hooks, skills registration)

## Context (read this, nothing else)

Wienerdog is a **compiler, not an application**: `wienerdog sync` reads the
canonical core (`~/.wienerdog/`) and writes per-harness config into the user's
AI CLI. This WP builds the **Claude Code adapter** — the half of `sync` that
targets `~/.claude/`. It does four things, all idempotent and manifest-tracked:

1. Writes a **managed block** — a sentinel-delimited region
   `<!-- wienerdog:begin -->` … `<!-- wienerdog:end -->` — into the user's
   `~/.claude/CLAUDE.md`, containing the rendered **digest** (who the user is,
   their preferences, active context). Wienerdog owns only this region; it
   never touches text outside the sentinels.
2. Registers two **hooks** in `~/.claude/settings.json`: a **SessionStart**
   hook that `cat`s the pre-rendered digest into the new session, and a
   **SessionEnd** hook that appends a capture hint to `~/.wienerdog/state/queue.jsonl`.
   The hook scripts are copied into `~/.wienerdog/bin/` and referenced by
   absolute path.
3. Symlinks the shipped **skills** into `~/.claude/skills/wienerdog-*`.
4. Records every write in the **manifest** so `wienerdog uninstall` reverses it
   exactly.

Two invariants bind this WP. **ADR-0004 — Wienerdog is just files:** the only
executables are the CLI (runs and exits) and hook scripts that must complete in
<200 ms with no computation (SessionStart only `cat`s a pre-rendered file). No
daemon, no process that outlives its job. **Hooks are enrichment, not the
capture mechanism:** the ground truth for capture is transcript scanning
(WP-007), which works with zero hooks. The managed block and the pre-rendered
digest give a Claude Code session its context even if the user disables the
SessionStart hook; the hook only makes the digest fresher between syncs. Say
this in code comments and never make correctness depend on a hook firing.

## Current state

These files exist from prior **Done** WPs. Treat their signatures as fixed contracts.

- **`bin/wienerdog.js`** (WP-003, extended by WP-005) — dispatches
  `init | doctor | uninstall | sync` to `src/cli/<cmd>.js`, each exporting
  `async function run(argv)`. Global flags `--dry-run`, `--yes`.
- **`src/core/paths.js`** (WP-003) —
  ```js
  /** @returns {{home, core, config, state, secrets, logs, manifest,
   *             claudeDir, codexDir, vault}} — core = $WIENERDOG_HOME || ~/.wienerdog */
  function getPaths(env = process.env)
  ```
  `claudeDir` resolves to `$CLAUDE_CONFIG_DIR` when set, else `~/.claude`
  (same override `detect.js` honors). `state` = `<core>/state`. **`core/bin`
  and `core/skills` are NOT returned by `getPaths` — derive them locally as
  `path.join(paths.core, 'bin')` and `path.join(paths.core, 'skills')`.** If you
  find `paths.claudeDir` does not honor `$CLAUDE_CONFIG_DIR`, note it under
  "Discovered issues" in the PR — do not fix `paths.js` (not in your Deliverables).
- **`src/core/manifest.js`** (WP-003) —
  ```js
  /** install-manifest.json: { version:1, createdAt:ISO, entries:[ {kind, path, ...} ] }
   *  load(paths) → manifest         record(manifest, entry) → void (mutates entries[])
   *  save(paths, manifest) → void   reverse(paths, manifest, {dryRun}) → {removed:string[], skipped:string[]}
   *  Existing reverse handles kind 'file' (unlink) and 'dir' (rmdir if empty),
   *  in reverse insertion order; UNKNOWN kinds are skipped with a warning. */
  ```
  You will **extend `reverse`** with three new kinds (below). `record` and
  `save` stay as-is.
- **`src/core/detect.js`** (WP-003) — `detectHarnesses(env) → {claude:{present,dir}, codex:{present,dir}}`.
- **`src/cli/sync.js`** (WP-005) — current behavior: reads `config.yaml` for the
  vault path, calls `renderDigest(vaultDir)` → string, writes it atomically to
  `<core>/state/digest.md` (temp file + rename), prints a 1-line byte-count
  confirmation, exits 1 if the vault is missing/unset. It does **not** load or
  save the manifest and does **not** touch `~/.claude`. You will extend it.
- **`src/core/digest.js`** (WP-005) — `renderDigest(vaultDir) → string`. Not
  touched here; `sync` already calls it.
- **`skills/wienerdog-setup/SKILL.md`** (WP-005) — the one shipped skill so far.
  More `skills/wienerdog-*/` folders arrive in later WPs; your code must glob,
  not hardcode `wienerdog-setup`.
- **`config.yaml`** (WP-003) contains `harnesses: { claude: <bool>, codex: <bool> }`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/adapters/claude.js | the Claude Code adapter |
| modify | src/cli/sync.js | stage skills into core; run adapter; manifest load/save |
| modify | src/core/manifest.js | extend `reverse` for kinds `symlink`, `managed-block`, `settings-entry` |
| create | templates/hooks/session-start.sh | SessionStart hook (copied to core/bin) |
| create | templates/hooks/session-end.sh | SessionEnd hook (copied to core/bin) |
| create | tests/unit/claude-adapter.test.js | unit + golden + idempotency + uninstall |
| create | tests/golden/claude-adapter/CLAUDE.md | expected CLAUDE.md for the fixed digest below |

## Exact contracts

### `src/adapters/claude.js`

```js
/** Apply the Claude Code adapter idempotently.
 *  @param {ReturnType<import('../core/paths').getPaths>} paths
 *  @param {{dryRun?: boolean, manifest?: object}} opts
 *  @returns {{changed: string[], unchanged: string[], notices: string[]}}
 *  Steps (each idempotent; on dryRun make NO writes, still report intended changes):
 *    1. Managed block in <claudeDir>/CLAUDE.md ← contents of <state>/digest.md
 *    2. Copy hook scripts to <core>/bin/; register SessionStart + SessionEnd in
 *       <claudeDir>/settings.json (merge, never clobber the user's other hooks)
 *    3. Symlink each <core>/skills/wienerdog-* into <claudeDir>/skills/
 *  Records new entries in opts.manifest (never duplicates an existing kind+path).
 *  `changed` / `unchanged` list absolute paths acted on; `notices` are warnings
 *  (e.g. a user file left untouched). Never throws on a missing digest — if
 *  <state>/digest.md is absent, return early with a notice (sync writes it first). */
function applyClaudeAdapter(paths, opts = {})
```

Derive inside the adapter: `const binDir = path.join(paths.core, 'bin')`,
`const skillsDir = path.join(paths.core, 'skills')`,
`const claudeMd = path.join(paths.claudeDir, 'CLAUDE.md')`,
`const settingsPath = path.join(paths.claudeDir, 'settings.json')`,
`const claudeSkillsDir = path.join(paths.claudeDir, 'skills')`,
`const digestPath = path.join(paths.state, 'digest.md')`.
Resolve hook-script sources from the package:
`path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-start.sh')`
(and `session-end.sh`).

#### Step 1 — managed block

Sentinels (exact bytes): `<!-- wienerdog:begin -->` and `<!-- wienerdog:end -->`.
Block = begin sentinel, newline, `digest.trimEnd()`, newline, end sentinel.

Algorithm on `<claudeDir>/CLAUDE.md`:
- File absent → create the directory if needed, write exactly the block + `\n`.
  Manifest: `{kind:'managed-block', path: claudeMd, createdFile: true}`.
- File present **with** both sentinels → replace everything from the begin
  sentinel through the end sentinel (inclusive) with the new block. Leave all
  bytes before/after untouched. If the resulting file is byte-identical to the
  current file → `unchanged` (no write). Manifest entry already exists → do not
  re-record.
- File present **without** sentinels → append `\n` + block + `\n` to the end,
  guaranteeing exactly one blank line between the prior content and the begin
  sentinel. Manifest: `{kind:'managed-block', path: claudeMd, createdFile: false}`.

#### Step 2 — hooks

Copy `templates/hooks/session-start.sh` → `<core>/bin/session-start.sh` and
`session-end.sh` → `<core>/bin/session-end.sh`, mode `0755`. Create `<core>/bin`
first if missing (manifest `{kind:'dir', path: binDir}`). Each copied script is
`{kind:'file', path: <dest>}`. Idempotent: if the destination already exists
with byte-identical content, `unchanged`; if content differs (upgrade), rewrite
(`changed`) but do not add a duplicate manifest entry.

Then merge into `<claudeDir>/settings.json`. **This is the exact JSON shape**
(verified against a live `~/.claude/settings.json`): `settings.hooks.<Event>` is
an array of groups; each group has an optional `matcher` and a `hooks` array of
`{type:"command", command, timeout}`:

```json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "<core>/bin/session-start.sh", "timeout": 10 } ] }
    ],
    "SessionEnd": [
      { "matcher": "*", "hooks": [ { "type": "command", "command": "<core>/bin/session-end.sh", "timeout": 10 } ] }
    ]
  }
}
```

Merge algorithm:
- Read + `JSON.parse` the file, or start from `{}` if absent
  (`createdFile: true`).
- Ensure `settings.hooks` is an object; ensure `settings.hooks.SessionStart`
  and `.SessionEnd` are arrays (create only the ones you need, preserve any
  existing array contents — the live machine already has a SessionStart hook you
  must not remove).
- For each of the two events: **dedup by command path** — if no existing group
  contains a `hooks[]` entry whose `command` equals our absolute script path,
  append our group `{matcher:"*", hooks:[{type:"command", command:<abs>, timeout:10}]}`.
- If anything changed, write `JSON.stringify(settings, null, 2) + "\n"`.
  (This reformats the file to 2-space JSON; that is acceptable and stays
  idempotent — the second sync produces byte-identical output. Note it under
  "Decisions made".)
- Manifest (record once): `{kind:'settings-entry', path: settingsPath,
  createdFile:<bool>, commands:[<startAbs>, <endAbs>]}`.

`matcher:"*"` is included for both events for shape consistency; Claude Code
ignores the matcher for events that have no tool to match (SessionEnd).

#### Step 3 — skills symlinks

Create `<claudeDir>/skills` if missing (manifest `{kind:'dir', path: claudeSkillsDir}`).
For each directory matching `<core>/skills/wienerdog-*`:
- Target link path = `<claudeDir>/skills/<basename>`.
- If it does not exist → create a symlink pointing at the absolute core skill
  dir (`fs.symlinkSync(coreSkillDir, linkPath)`). Manifest
  `{kind:'symlink', path: linkPath}`. `changed`.
- If it exists and `fs.lstat` says it is a symlink already pointing at the
  correct absolute target → `unchanged`.
- If it exists as a symlink pointing elsewhere → unlink and recreate (`changed`).
- If it exists as a regular file/dir (the user's own) → **do not touch**; add a
  `notices` entry and skip. Never clobber non-symlink user content.
- On `process.platform === 'win32'`: skip symlinking entirely, add one notice
  ("skill linking unsupported on Windows in v1"), continue. (Windows copy is
  deferred; CI is macOS + Linux.) Note this under "Decisions made".

### `src/cli/sync.js` (modify)

Extend the existing flow. New order:
1. (existing) read config vault path; `renderDigest`; write `<state>/digest.md` atomically.
2. `const manifest = manifestMod.load(paths)`.
3. **Stage skills into core** — copy packaged `skills/wienerdog-*` folders into
   `<core>/skills/` (idempotent; create `<core>/skills` first, manifest `dir`;
   each copied file manifest `file`; skip byte-identical files). Package skills
   root = `path.resolve(__dirname, '..', '..', 'skills')`. This step is
   vendor-neutral so the future Codex adapter (WP-010) reuses it. Skip files
   already identical so re-sync is zero-change.
4. If Claude Code is present (`detectHarnesses(process.env).claude.present`),
   call `applyClaudeAdapter(paths, {dryRun, manifest})`. If absent, print
   "Claude Code not detected; skipping adapter." and continue.
5. `manifestMod.save(paths, manifest)` (skip on `--dry-run`).
6. Print a summary: N changed, M unchanged (and any notices).

`--dry-run` must make zero writes anywhere (digest, core/skills, bin, claude dir,
manifest) and only print the plan.

### `src/core/manifest.js` (modify `reverse` only)

Extend `reverse(paths, manifest, {dryRun})` so that, iterating entries in reverse
insertion order, these kinds are handled (all non-`dir` kinds first, then `dir`
entries removed only if empty — the existing two-phase order):

- **`symlink`** — `fs.lstatSync(path)`: if it is a symlink → `fs.unlinkSync`
  (add to `removed`); if it exists but is **not** a symlink (user replaced it)
  or is missing → add to `skipped`.
- **`managed-block`** — read the file; if both sentinels present, remove the
  block and any single blank line immediately preceding the begin sentinel that
  we may have inserted. If `entry.createdFile === true` and the remaining
  content is empty or whitespace-only → delete the file; else write the
  remaining content back. If sentinels are absent (user removed the block) or
  the file is missing → `skipped`. Add the file path to `removed` when a change
  is made.
- **`settings-entry`** — read + `JSON.parse` the file; for each event array
  under `hooks`, drop any `hooks[]` entry whose `command` is in
  `entry.commands`, then drop groups whose `hooks[]` became empty, then drop
  event arrays that became empty, then drop the `hooks` key if it became empty.
  If `entry.createdFile === true` and the object is now `{}` → delete the file;
  else write `JSON.stringify(settings, null, 2) + "\n"`. Missing file →
  `skipped`. Add the file path to `removed` when a change is made.
- `dryRun`: compute and report the same `removed`/`skipped` lists but perform no
  writes/unlinks.
- Unknown kinds (e.g. `vault-file` from WP-004) keep the existing
  skip-with-warning behavior.

### `templates/hooks/session-start.sh` (exact content)

```bash
#!/usr/bin/env bash
# Wienerdog SessionStart hook (enrichment, not capture): injects the
# pre-rendered digest into a new Claude Code session. Fast, fail-open
# (always exit 0), no computation — just read one file and JSON-encode it.
set -euo pipefail

# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
DIGEST="$CORE/state/digest.md"
[ -f "$DIGEST" ] || exit 0

# Emit the Claude Code SessionStart envelope. node (>=18, always present since
# Wienerdog is a Node CLI) does the JSON-safe encoding — no jq dependency.
node -e 'const fs=require("fs");const t=fs.readFileSync(process.argv[1],"utf8");process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:t}}));' "$DIGEST"
exit 0
```

### `templates/hooks/session-end.sh` (exact content)

```bash
#!/usr/bin/env bash
# Wienerdog SessionEnd hook (enrichment): appends a capture hint to the queue.
# Ground-truth capture is transcript scanning (WP-007); this only speeds
# discovery. Fail-open.
set -euo pipefail

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
QUEUE="$CORE/state/queue.jsonl"
mkdir -p "$CORE/state"

# Claude Code passes hook JSON on stdin: {session_id, transcript_path, cwd, ...}.
node -e '
let raw="";
process.stdin.on("data", d => raw += d);
process.stdin.on("end", () => {
  let j = {};
  try { j = JSON.parse(raw || "{}"); } catch (e) { j = {}; }
  const line = JSON.stringify({harness:"claude", session_path:j.transcript_path||null, cwd:j.cwd||null, ts:new Date().toISOString()});
  require("fs").appendFileSync(process.argv[1], line + "\n");
});' "$QUEUE"
exit 0
```

Both scripts must pass `shellcheck` and be formatted with `shfmt -i 2`.

### `tests/golden/claude-adapter/CLAUDE.md` (exact expected bytes)

The adapter test writes this fixed digest to `<state>/digest.md`:

```
# Who you're working with
Ada Kovács — product lead.

## Standing instructions
Be concise.
```

Then applies the adapter to a **non-existent** `CLAUDE.md`. Expected result
(this golden file), trailing newline included:

```
<!-- wienerdog:begin -->
# Who you're working with
Ada Kovács — product lead.

## Standing instructions
Be concise.
<!-- wienerdog:end -->
```

### `tests/unit/claude-adapter.test.js` — required cases

Use `node:test`, a `fs.mkdtemp` temp root, and env overrides
`WIENERDOG_HOME`, `CLAUDE_CONFIG_DIR` pointing under it. Never touch the real
`$HOME` or `~/.claude`.

1. **Managed block, new file** — write the fixed digest to `<state>/digest.md`,
   run the adapter, byte-compare `<claudeDir>/CLAUDE.md` against
   `tests/golden/claude-adapter/CLAUDE.md`.
2. **Managed block preserves surrounding content** — pre-write a `CLAUDE.md`
   with `# My notes\n\ntext\n`, run the adapter, assert the original text
   survives verbatim and the block is appended once with exactly one blank-line
   separator; run again → the block is replaced in place, original text still
   intact, no second block.
3. **settings.json merge preserves existing hooks** — pre-write a settings.json
   containing an unrelated SessionStart hook (a different command path); run the
   adapter; assert the unrelated hook survives AND both our commands are present
   exactly once; run again → no duplicates (idempotent).
4. **Skills symlink** — create a `<core>/skills/wienerdog-setup/SKILL.md`; run
   the adapter; assert `<claudeDir>/skills/wienerdog-setup` is a symlink to the
   core dir. Skip the symlink assertions on `process.platform === 'win32'`.
5. **Idempotency** — run the adapter twice against unchanged inputs; assert the
   second run reports `changed: []` and mtimes of CLAUDE.md/settings.json are
   unchanged.
6. **Uninstall reverses everything** — build a manifest via the adapter, then
   call `manifest.reverse(paths, manifest, {dryRun:false})`; assert the managed
   block is gone from CLAUDE.md (file deleted if we created it), our hook
   entries are gone from settings.json while the pre-existing unrelated hook
   survives, and the skill symlink is unlinked.

## Implementation notes & constraints

- Node stdlib only; zero new dependencies. JSDoc types, no TypeScript, no build step.
- All fs writes funnel through the same `dryRun` guard the adapter uses, so
  `--dry-run` cannot leak a write.
- The managed block holds the **whole** digest (`digest.trimEnd()`), not a
  pointer. The block is the no-hooks baseline; the SessionStart hook is the
  fresh-between-syncs enrichment. Redundant on purpose — do not "optimize" one
  away.
- Idempotent manifest recording: before `record`, check `manifest.entries` for
  an existing entry with the same `kind` and `path`; skip if present.
- Do not read or trust the file's prior formatting for JSON files — parse,
  mutate, re-serialize with `JSON.stringify(_, null, 2) + "\n"`. Same output on
  every run = idempotent.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope.

## Acceptance criteria

- [ ] `sync` writes a managed block into `~/.claude/CLAUDE.md` (temp) matching
      the golden byte-for-byte for the fixed digest.
- [ ] Content outside the sentinels is never modified (test case 2).
- [ ] `sync` registers SessionStart + SessionEnd in settings.json without
      removing pre-existing hooks (test case 3).
- [ ] Hook scripts are copied to `<core>/bin/`, mode 0755, referenced by
      absolute path in settings.json.
- [ ] Shipped `skills/wienerdog-*` are symlinked into `~/.claude/skills/`
      (POSIX); a user's own non-symlink file there is left untouched.
- [ ] Second `sync` with unchanged inputs makes zero changes (idempotent).
- [ ] `uninstall` (via `manifest.reverse`) removes the block, both hook
      entries, the copied scripts, and the symlinks, leaving unrelated user
      hooks and CLAUDE.md content intact.
- [ ] `npm test` and `npm run lint` pass (shellcheck + shfmt clean hooks).

## Verification steps (run these; paste output in the PR)

```bash
npm test
npm run lint
export WIENERDOG_HOME=$(mktemp -d)/wd WIENERDOG_VAULT=$(mktemp -d)/vault CLAUDE_CONFIG_DIR=$(mktemp -d)/claude
node bin/wienerdog.js init --yes
cp -R tests/fixtures/identity-filled/06-Identity/* "$WIENERDOG_VAULT/06-Identity/"   # fixture from WP-005
node bin/wienerdog.js sync
echo '--- CLAUDE.md ---';   cat "$CLAUDE_CONFIG_DIR/CLAUDE.md"
echo '--- settings.json ---'; cat "$CLAUDE_CONFIG_DIR/settings.json"
echo '--- skills ---';        ls -la "$CLAUDE_CONFIG_DIR/skills/"
echo '--- bin ---';           ls -la "$WIENERDOG_HOME/bin/"
node bin/wienerdog.js sync                 # second run: reports zero changes
node bin/wienerdog.js uninstall --yes
echo '--- after uninstall ---'; cat "$CLAUDE_CONFIG_DIR/CLAUDE.md" 2>/dev/null || echo "(CLAUDE.md removed)"
```

## Out of scope (do NOT do these)

- The Codex adapter — `~/.codex/AGENTS.md` block, `config.toml [skills]`,
  `hooks.json` (WP-010).
- Modifying `src/core/paths.js`, `src/cli/uninstall.js`, `src/core/digest.js`,
  or `src/cli/init.js` (not in Deliverables). `uninstall` already calls the
  `reverse` you extend — nothing else there changes.
- Transcript scanning / capture-queue consumption (WP-007, WP-008).
- Windows symlink/copy support (deferred).
- Reworking the digest renderer or the interview skill (WP-005).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/006-claude-adapter`; PR titled `feat(adapter): implement Claude Code adapter (WP-006)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
