---
id: WP-010
title: Implement Codex CLI adapter (AGENTS.md block, hooks.json, skills discovery, codex-exec brain)
status: Done
model: sonnet
size: M
depends_on: [WP-006, WP-007, WP-008]
adrs: [ADR-0004]
branch: wp/010-codex-adapter
---

# WP-010: Implement Codex CLI adapter (AGENTS.md block, hooks.json, skills discovery, codex-exec brain)

## Context (read this, nothing else)

Wienerdog is a **compiler, not an application**: `wienerdog sync` reads the
canonical core (`~/.wienerdog/`) and writes per-harness config into the user's AI
CLI. WP-006 built the **Claude Code adapter** (`~/.claude/`). This WP builds the
**Codex CLI adapter** (`~/.codex/` + `~/.agents/skills/`), the second compile
target, plus the **`codex exec` option for the nightly dream brain**. Everything is
idempotent (second `sync` = zero diff) and manifest-tracked so `wienerdog uninstall`
reverses it exactly.

Wienerdog's iron rule (ADR-0004): **Wienerdog is just files. No daemon, no server,
no process that outlives its job.** The only executables are the CLI (runs and
exits) and short hook scripts that must complete in <200 ms with no computation.
**Hooks are enrichment, not the capture mechanism:** ground-truth capture is
rollout-file scanning (WP-007), which works with zero hooks. The AGENTS.md managed
block and the pre-rendered digest give a Codex session its context even if the user
never trusts the hooks. Correctness must never depend on a hook firing — say this
in comments.

**This WP was written against fresh research of the live Codex CLI surface**
(`memory/research/2026-07-03-codex-cli-config-surface.md`, all VERIFIED-CURRENT as
of 2026-07-03). Three findings override the naive design and are load-bearing:

1. **Codex skills are directory-discovered, not registered in `config.toml`.** Codex
   scans fixed locations for `SKILL.md` folders; the user-scope location is
   **`$HOME/.agents/skills/`** (independent of `$CODEX_HOME`). The only `config.toml`
   skills surface is `[[skills.config]]`, a *disable* toggle for an already-discovered
   skill — irrelevant to us (we want ours enabled, the default). **Therefore this WP
   writes NO `config.toml` and needs NO new `toml-entry` manifest kind.** It installs
   Codex skills by symlinking `<core>/skills/wienerdog-*` into `~/.agents/skills/`,
   reusing the existing `symlink` manifest kind — the same mechanism the Claude
   adapter uses for `~/.claude/skills/`.
2. **Codex `hooks.json` is deliberately schema-compatible with Claude Code's hooks**
   (OpenAI even sets `CLAUDE_PLUGIN_ROOT` for compat). The file at
   `~/.codex/hooks.json` has the exact shape `{"hooks":{"SessionStart":[{...}],"Stop":[{...}]}}`
   — the same `{event: [ {matcher?, hooks:[{type:"command", command, timeout}]} ]}`
   structure Claude's `settings.json` uses under `.hooks`. **Therefore the existing
   `settings-entry` manifest kind and the `applySettings` helper apply verbatim** —
   only the target file (`hooks.json`) and the event names (`SessionStart` + **`Stop`**,
   not `SessionEnd`) differ. One real constraint: a freshly installed Codex hook is
   **inert until the user trusts it** via `/hooks` in the CLI. That is exactly why the
   AGENTS.md managed block (which carries the whole digest) is the guaranteed baseline
   and the hook is enrichment only.
3. **`codex exec` fences writes with `--cd <dir>`, not `--add-dir`** (open bug
   openai/codex#24214: `apply_patch` ignores `--add-dir`), and rejects
   `--ask-for-approval` *after* `exec` (open bug #26602 — use `-c approval_policy=never`
   instead). There is **no per-tool allowlist** analog to Claude's
   `--tools Read,Write,Edit,...`; the Codex sandbox is filesystem/network-boundary
   based. These two upstream bugs are open; the exact invocation is marked
   **UNVERIFIED-until-live-M4-test** below and must be re-checked against the shipping
   `codex --version` before M4 sign-off.

The M4 milestone this WP unlocks: **a Codex-only machine (no `~/.claude`, hooks
untrusted) gets full setup and a working dream from rollout files alone.** The
acceptance test below exercises exactly that on a temp dir.

## Current state

These files exist from **Done** WPs. Treat their signatures as fixed contracts.

- **`src/adapters/claude.js`** (WP-006) — exports `applyClaudeAdapter(paths, opts)`.
  Internally it holds several **module-private** helpers you will **extract and
  share**, because the Codex adapter needs the identical logic:
  ```js
  function recordOnce(manifest, entry)                 // dedup manifest by kind+path
  function buildBlock(digest)                           // BEGIN + digest.trimEnd() + END
  function applyManagedBlock(mdPath, digest, dryRun, manifest, out)
  function copyHookScript(src, dest, dryRun, manifest, out)   // copy to core/bin, mode 0755
  function applySettings(settingsPath, startAbs, endAbs, dryRun, manifest, out)  // hooks merge
  function applySkillLinks(skillsDir, targetSkillsDir, dryRun, manifest, out)    // already target-parameterized
  ```
  `BEGIN`/`END` sentinels are the exact bytes `<!-- wienerdog:begin -->` /
  `<!-- wienerdog:end -->`. `applyManagedBlock`: absent file → create with block+`\n`;
  file with both sentinels → replace the span in place (byte-identical → `unchanged`);
  file without sentinels → append with exactly one blank-line separator.
  `applySettings` currently hardcodes two events (SessionStart, SessionEnd) and merges
  into `settings.hooks.<Event>` (array of `{matcher, hooks:[{type,command,timeout}]}`
  groups), dedup by command path, rewrites `JSON.stringify(_, null, 2) + "\n"` only if
  changed, records `{kind:'settings-entry', path, createdFile, commands:[...]}`.
  `applySkillLinks` links each `<core>/skills/wienerdog-*` into a target skills dir
  (skips non-symlink user files with a notice; skips Windows with a notice), records
  `{kind:'symlink', path}`. `out = {changed:[], unchanged:[], notices:[]}`.
- **`src/cli/sync.js`** (WP-005/WP-006) — order: render+write `<state>/digest.md`
  atomically; `const manifest = manifestMod.load(paths)`; `stageSkills(...)` copies
  packaged `skills/wienerdog-*` into `<core>/skills/`; **if
  `detectHarnesses(process.env).claude.present`** call `applyClaudeAdapter(paths,
  {dryRun, manifest})` (else print "Claude Code not detected; skipping adapter.");
  `manifestMod.save(paths, manifest)` unless `--dry-run`; print
  `N changed, M unchanged` + notices. You add the symmetric Codex branch.
- **`src/core/manifest.js`** (WP-006) — `reverse(paths, manifest, {dryRun})` already
  handles kinds `file`, `dir`, `symlink`, `managed-block`, `settings-entry` (this last
  one prunes hook commands from a JSON file's `.hooks` and deletes the file if we
  created it and it became `{}`). **You do NOT modify manifest.js** — the Codex adapter
  reuses `managed-block`, `settings-entry`, `symlink`, `dir`, `file` unchanged.
- **`src/core/paths.js`** (WP-003) — `getPaths(env)` returns `{home, core, config,
  state, secrets, logs, manifest, claudeDir, codexDir, vault}`. `codexDir` =
  `$CODEX_HOME || ~/.codex`. `home` = `$HOME || os.homedir()`. **You do NOT modify
  paths.js.** Derive the Codex targets locally (below). The Codex user-scope skills
  dir is `path.join(paths.home, '.agents', 'skills')` — **not** under `codexDir`
  (research fact: `$HOME/.agents/skills`, independent of `$CODEX_HOME`).
- **`src/core/detect.js`** (WP-003) — `detectHarnesses(env).codex = {present, dir}`;
  `present` = `codexDir` exists.
- **`templates/hooks/session-start.sh`** (WP-006) — emits the SessionStart envelope
  `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":<digest>}}`.
  **Codex's SessionStart JSON contract is identical**, so this script is REUSED as-is
  for the Codex SessionStart hook — no Codex-specific start script.
- **`templates/hooks/session-end.sh`** (WP-006) — Claude SessionEnd: appends
  `{harness:"claude", session_path, cwd, ts}` to `<core>/state/queue.jsonl`, no stdout.
  Codex needs the analog for the **Stop** event with `harness:"codex"` (new script,
  below), because Codex's Stop event replaces Claude's SessionEnd.
- **`src/core/dream/brain.js`** (WP-008) — exports `buildClaudeArgs`, `spawnBrain`,
  `DREAM_PROMPT`. `DREAM_PROMPT(scratchDir, vaultDir, date)` returns the skill-trigger
  prompt (`/wienerdog-dream` + the two paths + date). `spawnBrain(o)` spawns
  `env.WIENERDOG_DREAM_CMD` if set (the test seam), else `claude` with
  `buildClaudeArgs`; `detached:true`, `cwd:vaultDir`, adds `WIENERDOG_DREAM_VAULT` /
  `WIENERDOG_DREAM_SCRATCH` to the child env; returns `{child, done}` where `done`
  resolves `{code, durationMs}`. You add `buildCodexArgs` and an optional `harness`
  selector to `spawnBrain` **without changing its default (`'claude'`) behavior**.
- **`src/core/transcripts/index.js`** (WP-007) — `discover(paths, {since})`,
  `parse(entry)`, `redact(text)`. Codex rollout files are
  `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<YYYY-MM-DDTHH-MM-SS>-<uuid>.jsonl`
  (VERIFIED against source; parser already handles them).
- **`src/core/dream/scratch.js`** (WP-008) — `collectExtracts(paths, watermarks,
  maxInputBytes)` → `{entries, scratchDir, maxMtime, droppedForSize, wrote}`; writes
  one redacted extract file per selected transcript into `<state>/dream-scratch/`.
- **`tests/unit/claude-adapter.test.js`** (WP-006) — the existing Claude adapter suite.
  **It is NOT in your Deliverables; it must keep passing byte-for-byte after your
  refactor.** It is your safety net for the shared-helper extraction.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/adapters/shared.js | extract the 6 shared helpers from claude.js (verbatim behavior) |
| modify | src/adapters/claude.js | delegate to shared.js; remove the now-duplicated private helpers |
| create | src/adapters/codex.js | the Codex CLI adapter (`applyCodexAdapter`) |
| modify | src/cli/sync.js | run the Codex adapter when Codex is present (symmetric to Claude) |
| modify | src/core/dream/brain.js | add `buildCodexArgs`; add optional `harness` to `spawnBrain` |
| create | templates/hooks/codex-session-end.sh | Codex **Stop** hook (queue append, `harness:"codex"`) |
| create | tests/unit/codex-adapter.test.js | unit + golden + idempotency + uninstall + codex-only dream integration + `buildCodexArgs` |
| create | tests/golden/codex-adapter/AGENTS.md | expected AGENTS.md for the fixed digest |

### Exact contracts

#### `src/adapters/shared.js` (extract — behavior-preserving)

Move these six functions **verbatim** out of `claude.js` into `shared.js` and export
them. **The only change** is generalizing `applySettings` to take an events list so
both adapters can use it:

```js
/** Merge command hooks into a JSON file's `.hooks`, dedup by command path.
 *  @param {string} settingsPath  target JSON file (Claude settings.json OR Codex hooks.json)
 *  @param {Array<[string, string]>} events  e.g. [['SessionStart', startAbs], ['Stop', stopAbs]]
 *  @param {boolean} dryRun @param {object} manifest
 *  @param {{changed:string[], unchanged:string[], notices:string[]}} out
 *  Reads+JSON.parses the file (or {} if absent); ensures settings.hooks is an object;
 *  for each [event, command] ensures settings.hooks[event] is an array and appends
 *  {matcher:"*", hooks:[{type:"command", command, timeout:10}]} unless a group already
 *  contains that command; writes JSON.stringify(_, null, 2)+"\n" only if changed;
 *  records once {kind:'settings-entry', path, createdFile, commands:[...all commands...]}. */
function applySettings(settingsPath, events, dryRun, manifest, out)
```

`recordOnce`, `buildBlock`, `applyManagedBlock`, `copyHookScript`, `applySkillLinks`
move unchanged (same signatures as in `claude.js` today). Export all six:
```js
module.exports = { recordOnce, buildBlock, applyManagedBlock, copyHookScript,
  applySettings, applySkillLinks };
```

#### `src/adapters/claude.js` (modify — delegate, behavior identical)

Replace the inline private helpers with `require('./shared')`. Update the one
`applySettings` call site to pass the events list:
```js
applySettings(settingsPath, [['SessionStart', startAbs], ['SessionEnd', endAbs]], dryRun, manifest, out);
```
`applyClaudeAdapter`'s external behavior and its exports must be **unchanged** —
`tests/unit/claude-adapter.test.js` and `tests/golden/claude-adapter/CLAUDE.md` must
pass with zero edits. If anything about them would change, your extraction is wrong.

#### `src/adapters/codex.js`

```js
/** Apply the Codex CLI adapter idempotently.
 *  @param {ReturnType<import('../core/paths').getPaths>} paths
 *  @param {{dryRun?: boolean, manifest?: object}} [opts]
 *  @returns {{changed: string[], unchanged: string[], notices: string[]}}
 *  Steps (each idempotent; on dryRun make NO writes, still report intended changes):
 *    1. Managed block in <codexDir>/AGENTS.md ← contents of <state>/digest.md.
 *       If <codexDir>/AGENTS.override.md exists, push a NOTICE: our AGENTS.md is
 *       silently shadowed by the override (research fact) — user must merge manually.
 *    2. Copy session-start.sh + codex-session-end.sh into <core>/bin/ (0755); register
 *       SessionStart + Stop command hooks in <codexDir>/hooks.json (settings-entry).
 *       Push a NOTICE: Codex requires trusting new hooks via `/hooks` before they run;
 *       the AGENTS.md block already carries the digest so context works regardless.
 *    3. Symlink each <core>/skills/wienerdog-* into <home>/.agents/skills/ (Codex
 *       user-scope skill-discovery dir; NOT config.toml — see the research memo).
 *  Never throws on a missing digest — if <state>/digest.md is absent, return early
 *  with a notice (sync writes it first). Records new entries in opts.manifest. */
function applyCodexAdapter(paths, opts = {})
module.exports = { applyCodexAdapter };
```

Derive inside the adapter:
```js
const binDir           = path.join(paths.core, 'bin');
const skillsDir        = path.join(paths.core, 'skills');
const agentsMd         = path.join(paths.codexDir, 'AGENTS.md');
const overridePath     = path.join(paths.codexDir, 'AGENTS.override.md');
const hooksPath        = path.join(paths.codexDir, 'hooks.json');
const agentsSkillsDir  = path.join(paths.home, '.agents', 'skills');   // NOT codexDir-relative
const digestPath       = path.join(paths.state, 'digest.md');
const startSrc = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'session-start.sh');
const stopSrc  = path.resolve(__dirname, '..', '..', 'templates', 'hooks', 'codex-session-end.sh');
const startAbs = path.join(binDir, 'session-start.sh');
const stopAbs  = path.join(binDir, 'codex-session-end.sh');
```
Then, using `shared`:
- read `<state>/digest.md`; on failure push notice `digest not found ...` and return.
- `shared.applyManagedBlock(agentsMd, digest, dryRun, manifest, out)`.
- if `fs.existsSync(overridePath)` → `out.notices.push('~/.codex/AGENTS.override.md exists — it shadows Wienerdog\'s AGENTS.md; merge the managed block manually or remove the override')`.
- ensure `binDir` exists (record `{kind:'dir', path: binDir}` once);
  `shared.copyHookScript(startSrc, startAbs, ...)`, `shared.copyHookScript(stopSrc, stopAbs, ...)`.
- `shared.applySettings(hooksPath, [['SessionStart', startAbs], ['Stop', stopAbs]], dryRun, manifest, out)`.
- push the `/hooks` trust notice (once).
- `shared.applySkillLinks(skillsDir, agentsSkillsDir, dryRun, manifest, out)`.

The `session-start.sh` script is copied by **whichever adapter runs**, so a
Codex-only machine gets it too (idempotent if the Claude adapter already copied it).

#### `src/cli/sync.js` (modify)

After the existing Claude branch, add the symmetric Codex branch:
```js
if (detectHarnesses(process.env).codex.present) {
  const res = applyCodexAdapter(paths, { dryRun, manifest });
  summary.changed.push(...res.changed);
  summary.unchanged.push(...res.unchanged);
  summary.notices.push(...res.notices);
} else {
  console.log('Codex CLI not detected; skipping adapter.');
}
```
`require('../adapters/codex')` at the top next to the Claude require. `--dry-run`
must still make zero writes. Nothing else in `sync.js` changes.

#### `src/core/dream/brain.js` (modify — add the Codex brain)

Add `buildCodexArgs` (pure — the unit-tested security surface, mirroring
`buildClaudeArgs`). **These flags are best-effort prevention; the guarantee is
WP-017's post-run diff validation.** Emit the flags, not the `//` reasons:

```js
/** Build the argv for the headless Codex brain, AFTER the "codex" name.
 *  UNVERIFIED-until-live-M4-test: two open upstream bugs shape this (see comments);
 *  wd-researcher must re-verify against the shipping `codex --version` before M4.
 *  @param {{vaultDir:string, scratchDir:string, date:string, model:string|null}} o
 *  @returns {string[]} */
function buildCodexArgs({ vaultDir, scratchDir, date, model }) {
  return [
    'exec',
    '--sandbox', 'workspace-write',
    '--cd', vaultDir,            // THE write fence: --add-dir does NOT fence apply_patch (openai/codex#24214)
    '--add-dir', scratchDir,     // best-effort read access to the extracts (see note)
    '-c', 'approval_policy=never',                        // NOT `--ask-for-approval never` after exec (#26602)
    '-c', 'sandbox_workspace_write.network_access=false', // no network
    '--skip-git-repo-check',     // the vault/scratch may not be a git repo
    ...(model ? ['--model', model] : []),
    DREAM_PROMPT(scratchDir, vaultDir, date),             // positional prompt (last)
  ];
}
```

Then thread a harness selector through `spawnBrain` **without changing its default**:
```js
/** @param {{vaultDir, scratchDir, date, model, harness?:'claude'|'codex',
 *           env?, logStream?}} o */
function spawnBrain(o) {
  // harness = o.harness || 'claude'
  // fakeCmd = env.WIENERDOG_DREAM_CMD  → command = fakeCmd, args = []  (test seam, unchanged)
  // else if harness === 'codex' → command = 'codex', args = buildCodexArgs({...})
  // else                         → command = 'claude', args = buildClaudeArgs({...})  (unchanged default)
  // everything else (detached, cwd, child env, done promise) unchanged.
}
module.exports = { buildClaudeArgs, buildCodexArgs, spawnBrain, DREAM_PROMPT };
```
`WIENERDOG_DREAM_CMD` still overrides regardless of `harness` (the test seam). The
existing `dream-brain.test.js` (WP-008) must keep passing unchanged — do not alter
`buildClaudeArgs` or `spawnBrain`'s Claude default.

Config-driven harness selection (reading a `dream_brain: claude|codex` key and
passing `harness`) belongs to the **WP-017 runtime pipeline**, not here; this WP only
provides `buildCodexArgs` and the `spawnBrain` param.

#### `templates/hooks/codex-session-end.sh` (exact content)

```bash
#!/usr/bin/env bash
# Wienerdog Codex Stop hook (enrichment, not capture): appends a capture hint to
# the queue. Ground-truth capture is rollout-file scanning (WP-007); this only
# speeds discovery. Fail-open. Stop hooks must not print plain text — this emits
# no stdout at all (exit 0 = success), which is valid.
set -euo pipefail

CORE="${WIENERDOG_HOME:-$HOME/.wienerdog}"
QUEUE="$CORE/state/queue.jsonl"
mkdir -p "$CORE/state"

# Codex passes hook JSON on stdin: {session_id, transcript_path, cwd, hook_event_name, ...}.
node -e '
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let j = {};
  try {
    j = JSON.parse(raw || "{}");
  } catch (e) {
    j = {};
  }
  const line = JSON.stringify({ harness: "codex", session_path: j.transcript_path || null, cwd: j.cwd || null, ts: new Date().toISOString() });
  require("fs").appendFileSync(process.argv[1], line + "\n");
});' "$QUEUE"
exit 0
```
Must pass `shellcheck` and `shfmt -i 2`. (If the M4 live test shows Codex rejects
no-output on `Stop`, the minimal fix is to emit `{"continue":true}` — note it and
defer; capture still works from rollout files either way.)

#### `tests/golden/codex-adapter/AGENTS.md` (exact expected bytes)

The test writes this fixed digest (identical to the Claude adapter's fixture) to
`<state>/digest.md`:
```
# Who you're working with
Ada Kovács — product lead.

## Standing instructions
Be concise.
```
Then applies the Codex adapter to a **non-existent** `AGENTS.md`. Expected result
(this golden file, trailing newline included):
```
<!-- wienerdog:begin -->
# Who you're working with
Ada Kovács — product lead.

## Standing instructions
Be concise.
<!-- wienerdog:end -->
```

#### `tests/unit/codex-adapter.test.js` — required cases

Use `node:test`, an `fs.mkdtemp` temp root, and env overrides so **nothing touches
real `$HOME`/`~/.codex`/`~/.agents`/`~/.claude`**: set `HOME`, `WIENERDOG_HOME`,
`WIENERDOG_VAULT`, `CODEX_HOME` under the temp root and **leave `CLAUDE_CONFIG_DIR`
unset with no `<HOME>/.claude`** so Claude is absent. (Because `agentsSkillsDir` =
`<paths.home>/.agents/skills`, setting `HOME` to the temp root keeps skill links
inside the sandbox.)

1. **AGENTS.md managed block, new file** — write the fixed digest to
   `<state>/digest.md`, run the adapter, byte-compare `<codexDir>/AGENTS.md` against
   `tests/golden/codex-adapter/AGENTS.md`.
2. **AGENTS.md preserves surrounding content** — pre-write `# My notes\n\ntext\n`,
   run, assert original text survives verbatim + block appended once with one
   blank-line separator; run again → block replaced in place, no second block.
3. **AGENTS.override.md warning** — create `<codexDir>/AGENTS.override.md`; run the
   adapter; assert a notice mentions the override shadowing.
4. **hooks.json merge preserves existing hooks** — pre-write a `hooks.json` with an
   unrelated `Stop` hook (different command); run; assert the unrelated hook survives
   AND both our commands (`session-start.sh` under SessionStart, `codex-session-end.sh`
   under Stop) are present exactly once; run again → no duplicates. Assert the
   `/hooks` trust notice is present.
5. **Skills symlink into `.agents/skills`** — create
   `<core>/skills/wienerdog-setup/SKILL.md`; run; assert
   `<home>/.agents/skills/wienerdog-setup` is a symlink to the core dir. Skip the
   symlink assertions on `process.platform === 'win32'`.
6. **Idempotency** — run twice against unchanged inputs; second run reports
   `changed: []`; AGENTS.md / hooks.json mtimes unchanged.
7. **Uninstall reverses everything** — build a manifest via the adapter, then
   `manifest.reverse(paths, manifest, {dryRun:false})`; assert the AGENTS.md block is
   gone (file deleted, since we created it), our hook entries are gone from hooks.json
   (file deleted, since we created it and it became `{}`) while a pre-existing
   unrelated hook (case 4) survives its file, and the skill symlink is unlinked.
8. **`buildCodexArgs` flags** — assert the argv contains `exec`,
   `--sandbox workspace-write`, `--cd <vault>`, `-c approval_policy=never`,
   `-c sandbox_workspace_write.network_access=false`, `--skip-git-repo-check`, the
   `/wienerdog-dream` prompt with both paths and the date; omits `--model` when null,
   includes it when set; and contains **no** `--ask-for-approval` and **no**
   `--dangerously-bypass-approvals-and-sandbox`/`--yolo`.
9. **Codex-only machine: full setup + working dream from rollout files alone**
   (the M4 criterion, as a temp-dir integration test):
   - `node bin/wienerdog.js init --yes` in the sandbox (Claude absent, Codex present);
     set the vault path; drop the WP-005 identity fixture into `<vault>/06-Identity/`.
   - Run `sync` (invoke `require('../../src/cli/sync').run([])`). Assert: `AGENTS.md`
     has the managed block with the digest; `hooks.json` has SessionStart + Stop with
     our commands; `<home>/.agents/skills/wienerdog-setup` is a symlink; and **no
     `<home>/.claude` was written** (Claude branch skipped).
   - Plant a Codex **rollout** file at
     `<CODEX_HOME>/sessions/2026/07/03/rollout-2026-07-03T09-00-00-<uuid>.jsonl`
     with real-shape lines (reuse WP-007's rollout line shape from
     `transcripts.test.js`). Call
     `collectExtracts(paths, {claude:null, codex:null}, 400000)`; assert one codex
     extract was written to scratch.
   - Write a fake `codex` executable (a shell script) to the temp dir that creates a
     note file inside the vault (e.g. `07-Daily/2026-07-03.md`) and exits 0. Call
     `spawnBrain({harness:'codex', vaultDir, scratchDir, date:'2026-07-03', model:null,
     env:{...process.env, WIENERDOG_DREAM_CMD:<fakeCodex>}})`; await `done`; assert the
     note now exists in the vault. This proves the codex path composes end to end
     (rollout → scratch → brain(codex) → vault write); the fake stands in for real
     `codex exec`, whose live sandbox behavior is manual-verification-at-M4.

## Implementation notes & constraints

- **Zero new npm dependencies.** Node stdlib only; JSDoc types; no TypeScript; no
  build step. Shell scripts pass `shellcheck` + `shfmt -i 2`.
- **The shared-helper extraction must be byte-behavior-preserving for Claude.** Run
  the full existing suite; `tests/unit/claude-adapter.test.js` and
  `tests/golden/claude-adapter/CLAUDE.md` must pass unedited. That is the guardrail —
  if they change, revert and re-extract more carefully.
- **No `config.toml` write, no `toml-entry` manifest kind** — Codex skills are
  directory-discovered from `~/.agents/skills/` (research memo, VERIFIED-CURRENT
  2026-07-03). Reuse `symlink`. If a future Codex version reintroduces TOML skill
  registration, that is a new WP.
- **The AGENTS.md block is the no-hooks baseline**, holding the whole digest, exactly
  like Claude's CLAUDE.md block. The Codex hook-trust gate (`/hooks`) means the
  SessionStart hook may never fire; the block still gives the session its context.
  Keeping the block ≤24h fresh is the nightly pipeline's job (WP-017 regenerates the
  digest and re-runs sync) — out of scope here.
- **Threat note (multi-user hosts):** Codex rollout files are world-readable by
  default (open issue openai/codex#21660). Wienerdog does not change that; single-user
  default installs are unaffected. No mitigation in this WP; noted for the M7 threat
  review.
- **The `codex exec` invocation is UNVERIFIED against a live binary.** Two open
  upstream bugs (#24214, #26602) drive the `--cd`/`-c approval_policy=never` choices;
  re-verify before M4. If either is fixed, prefer the cleaner flag and note it.
- Ambiguity → choose the simpler option and record it under "Decisions made" in the
  PR. Do NOT expand scope.

## Acceptance criteria

- [ ] `sync` writes a managed block into `~/.codex/AGENTS.md` matching the golden
      byte-for-byte for the fixed digest; content outside the sentinels is never
      modified.
- [ ] `sync` registers SessionStart + Stop in `~/.codex/hooks.json` without removing
      pre-existing hooks; second `sync` makes zero changes (idempotent).
- [ ] Shipped `skills/wienerdog-*` are symlinked into `~/.agents/skills/` (POSIX); a
      user's own non-symlink file there is left untouched.
- [ ] An existing `~/.codex/AGENTS.override.md` triggers a notice; a fresh hooks.json
      install triggers the `/hooks` trust notice.
- [ ] `uninstall` (via `manifest.reverse`) removes the AGENTS.md block, both hook
      entries (deleting the hooks.json we created), the copied scripts, and the
      symlinks, leaving unrelated user hooks/content intact.
- [ ] The Claude adapter is unchanged in behavior: `claude-adapter` tests + golden
      pass with no edits after the shared-helper extraction.
- [ ] `buildCodexArgs` produces the sandbox invocation above (case 8);
      `buildClaudeArgs`/`spawnBrain` Claude default behavior is unchanged.
- [ ] **Codex-only integration (case 9):** a machine with Codex present and Claude
      absent gets a complete AGENTS.md + hooks.json + skills setup from `sync`, and a
      dream composed from a planted rollout file writes to the vault via the
      `harness:'codex'` brain path.
- [ ] `npm test` and `npm run lint` pass (shellcheck + shfmt clean).

## Verification steps (run these; paste output in the PR)

```bash
npm test                     # full suite: claude-adapter (unchanged) + codex-adapter + dream-brain
npm test -- --test-name-pattern codex
npm run lint
node -e "const {buildCodexArgs}=require('./src/core/dream/brain'); console.log(buildCodexArgs({vaultDir:'/v',scratchDir:'/s',date:'2026-07-03',model:null}).join(' '))"
# Codex-only temp machine end-to-end (Claude absent):
export TMPROOT=$(mktemp -d)
export HOME=$TMPROOT WIENERDOG_HOME=$TMPROOT/wd WIENERDOG_VAULT=$TMPROOT/vault CODEX_HOME=$TMPROOT/.codex
unset CLAUDE_CONFIG_DIR
mkdir -p "$CODEX_HOME"
node bin/wienerdog.js init --yes
cp -R tests/fixtures/identity-filled/06-Identity/* "$WIENERDOG_VAULT/06-Identity/"   # WP-005 fixture
node bin/wienerdog.js sync
echo '--- AGENTS.md ---';   cat "$CODEX_HOME/AGENTS.md"
echo '--- hooks.json ---';  cat "$CODEX_HOME/hooks.json"
echo '--- .agents/skills ---'; ls -la "$HOME/.agents/skills/"
echo '--- no ~/.claude ---'; ls -la "$HOME/.claude" 2>/dev/null || echo "(no ~/.claude — Claude correctly skipped)"
node bin/wienerdog.js sync                 # second run: zero changes
node bin/wienerdog.js uninstall --yes
echo '--- after uninstall ---'; cat "$CODEX_HOME/AGENTS.md" 2>/dev/null || echo "(AGENTS.md removed)"
```

## Out of scope (do NOT do these)

- **Any `config.toml` write** (skills are directory-discovered; the `[[skills.config]]`
  toggle is not used) and **any new manifest kind** (reuse `managed-block`,
  `settings-entry`, `symlink`).
- **Config-driven dream-brain selection** (`dream_brain: claude|codex` in config.yaml,
  and passing `harness` from the pipeline) — WP-017. This WP ships `buildCodexArgs` +
  the `spawnBrain` param only.
- **The runtime dream pipeline, watchdog, diff validation, single commit, digest
  regeneration** — WP-017. **The dream skill** — WP-009.
- **Editing `src/core/paths.js`, `src/core/manifest.js`, `src/core/detect.js`,
  `src/cli/uninstall.js`, WP-007's parsers, or `tests/unit/claude-adapter.test.js`.**
- **Windows skill copy** (deferred; `applySkillLinks` already no-ops with a notice on
  `win32`). **Live `codex exec` sandbox verification** (manual, M4).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/010-codex-adapter`; PR titled `feat(adapter): implement Codex CLI adapter (WP-010)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
