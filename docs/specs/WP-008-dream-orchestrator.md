---
id: WP-008
title: Implement dream input assembly and brain launch (config, lock, watermarks, scratch, invocation)
status: In-Review
model: opus
size: M
depends_on: [WP-007]
adrs: [ADR-0004, ADR-0005]
branch: wp/008-dream-orchestrator
---

# WP-008: Implement dream input assembly and brain launch (config, lock, watermarks, scratch, invocation)

## Context (read this, nothing else)

**Dreaming** is Wienerdog's nightly memory-consolidation job. It has two halves in
code: the **orchestrator front half** (this WP) assembles the inputs and knows how
to launch the "brain"; the **orchestrator back half** (WP-017) runs the brain under
a watchdog, validates its writes, and makes one git commit. The brain itself is a
prompt — `claude -p` running the `wienerdog-dream` skill (WP-009) — invoked under a
strict sandbox.

This WP builds the front half as a set of small, independently unit-tested library
modules. Given the per-harness **watermark** (what dreaming already processed), it:
reads the dream config knobs; acquires a lock so two dreams never overlap; selects
the transcripts modified since the watermark using WP-007's parsers; enforces a
total input-size cap; writes redacted **extracts** to a scratch directory for the
brain to read; and builds the exact tool-restricted `claude -p` invocation. It does
**not** run the brain in production, validate its output, or commit — WP-017 owns
the runtime pipeline (`wienerdog dream`), the watchdog, validation, and the commit.

Two product invariants govern this WP:

1. **Wienerdog is just files (ADR-0004).** No process outlives its job. This WP
   ships **no `wienerdog dream` command** — it exposes `spawnBrain()`, which starts
   the child in its own process group so WP-017's watchdog can kill the whole tree
   on timeout, but `spawnBrain` must never be run in production without that
   watchdog. Nothing here polls, listens, or persists.

2. **The headless brain runs sandboxed (Threat model T2).** The invocation this WP
   builds gives the brain **no Bash, no network, and write access to the vault
   only** (plus read access to the scratch dir). A hijacked dream can at worst emit
   markdown that WP-017's code validation then reverts — it can never execute or
   exfiltrate. Getting the invocation flags right is a security control, not a
   convenience.

The dream reads from **transcripts**, which always contain **untrusted-derived**
content (email bodies, web pages, files the model read during a session — carried
as `role: 'tool_result'` messages). This WP preserves that role tag in the extracts
it writes; the skill (WP-009) computes provenance from it and WP-017's code enforces
the gate. This WP itself makes no trust judgments — it only assembles and caps.

## Current state

Nothing under `src/core/dream/` exists — you are creating it. You build on these
**already-Ready** contracts (do not re-implement them):

**From WP-003 (`src/core/paths.js`), `getPaths(env = process.env)` returns:**
```js
{ home, core, config, state, secrets, logs, manifest, claudeDir, codexDir, vault }
// core   = $WIENERDOG_HOME || ~/.wienerdog   (dir)
// config = <core>/config.yaml                (file)  ← read vault path & knobs here
// state  = <core>/state                      (dir)   ← watermarks.json, dream.lock, dream-scratch/ live here
// vault  = $WIENERDOG_VAULT || ~/wienerdog   (dir)   ← real path is config.yaml `vault:`
// claudeDir = $CLAUDE_CONFIG_DIR || ~/.claude ; codexDir = $CODEX_HOME || ~/.codex
```
Also `src/core/errors.js` exports `class WienerdogError extends Error` — throw it
for expected failures; `bin/wienerdog.js` prints `wienerdog: <message>` and exits 1.

**From WP-007 (`src/core/transcripts/index.js`) — use ONLY these exports:**
```js
/** discover across both harnesses, merged, sorted ascending by mtimeMs.
 *  @param {ReturnType<import('../paths').getPaths>} paths
 *  @param {{since:number|null}} opts   // epoch ms; null = all files
 *  @returns {Array<{harness:'claude'|'codex', path:string, mtimeMs:number}>} */
function discover(paths, opts)

/** parse + redact + size-cap ONE discovered entry. The only entry point:
 *  extracts come out redacted (secret-looking strings stripped) and per-message/
 *  per-session capped. Pure: no writes, no network, no model.
 *  @param {{harness:'claude'|'codex', path:string}} entry @returns {Extract} */
function parse(entry)

/** redact secret-looking substrings — reuse it, do NOT re-implement. */
function redact(text)
```

**The normalized `Extract` shape returned by `parse` (redacted, capped):**
```js
/** @typedef {Object} Extract
 *  @property {'claude'|'codex'} harness
 *  @property {string}      session_id
 *  @property {string|null} started      // ISO ts of first message, or null
 *  @property {string|null} cwd
 *  @property {string}      source_path  // absolute path of the transcript file
 *  @property {boolean}     truncated    // true if any WP-007 size cap fired
 *  @property {Array<{role:'user'|'assistant'|'tool_result', text:string, ts:string|null}>} messages
 */
```

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/dream/config.js | read `vault:` + optional dream knobs from `config.yaml` (minimal parser) |
| create | src/core/dream/lock.js | acquire / release `state/dream.lock` incl. stale-steal |
| create | src/core/dream/watermarks.js | read + write `state/watermarks.json` (atomic) |
| create | src/core/dream/scratch.js | select extracts since watermark, total-size cap, write + clean scratch |
| create | src/core/dream/brain.js | `buildClaudeArgs` (pure) + `spawnBrain` (spawn, `WIENERDOG_DREAM_CMD`) |
| create | tests/unit/dream-lock.test.js | acquire / stale-steal / release |
| create | tests/unit/dream-collect.test.js | config + watermarks + scratch selection/cap (temp transcripts) |
| create | tests/unit/dream-brain.test.js | `buildClaudeArgs` flags + `spawnBrain` via a fake cmd |

### Exact contracts

#### `src/core/dream/config.js`

```js
/** Read the vault path and optional dream knobs from config.yaml.
 *  Minimal line-based reader (no YAML dep — same approach the digest renderer
 *  used; note the future extraction in the PR "Decisions made").
 *  @param {string} configFile  // paths.config
 *  @returns {{vault:string, timeoutMs:number, maxInputBytes:number, model:string|null}}
 *  - vault: value of the top-level `vault:` line; throw WienerdogError
 *    ("no vault configured — run: npx wienerdog init") if null/missing/empty.
 *  - timeoutMs:      (dream_timeout_minutes || 20) * 60_000
 *  - maxInputBytes:   dream_max_input_bytes || 400_000
 *  - model:           dream_model || null
 *  The three dream_* keys are OPTIONAL top-level scalars; absent → default. Do
 *  NOT add them to the config.yaml template (out of scope). */
function readDreamConfig(configFile)
```

#### `src/core/dream/lock.js`

```js
/** Atomically create state/dream.lock. Contents (JSON):
 *    { pid, host, startedAt: <ISO>, deadline: <epoch ms> }
 *  - Create with fs open flag 'wx' (fails if the file exists) →
 *    {acquired:true, stolen:false}.
 *  - If it exists: read it. If now > deadline (or unparseable) the previous run
 *    is dead/hung → STEAL: overwrite the lock and return
 *    {acquired:true, stolen:true} (the caller logs a warning). Otherwise another
 *    dream is genuinely running → {acquired:false}.
 *  @param {string} stateDir @param {number} timeoutMs  (deadline = now + timeoutMs)
 *  @returns {{acquired:boolean, stolen:boolean}} */
function acquireLock(stateDir, timeoutMs)

/** Delete the lock IFF its pid matches process.pid (never delete someone else's).
 *  No-op if absent. Never throws. */
function releaseLock(stateDir)
```

#### `src/core/dream/watermarks.js`

```js
/** state/watermarks.json shape: { version:1, claude:<epochMs|null>, codex:<epochMs|null> }
 *  Missing/corrupt file → { version:1, claude:null, codex:null }. */
function readWatermarks(stateDir)   // → {claude:number|null, codex:number|null}

/** Atomically write watermarks (temp file + rename). Callers advance ONLY after a
 *  successful commit (that decision belongs to WP-017's pipeline, not here). */
function writeWatermarks(stateDir, {claude, codex})
```

#### `src/core/dream/scratch.js`

```js
/** Select the transcripts to dream over (per-harness watermarks + a TOTAL input
 *  cap) and write redacted extracts to scratch.
 *  @param {ReturnType<import('../paths').getPaths>} paths
 *  @param {{claude:number|null, codex:number|null}} watermarks
 *  @param {number} maxInputBytes
 *  @returns {{ entries: Array<{harness, session_id, mtimeMs, scratchFile:string}>,
 *              scratchDir: string,
 *              maxMtime: {claude:number|null, codex:number|null},
 *              droppedForSize: number,
 *              wrote: string[] }}
 *
 *  Algorithm:
 *   1. since = the minimum of the two non-null watermarks; if EITHER is null,
 *      since = null. Call transcripts.discover(paths, {since}).
 *   2. Post-filter per harness: keep an entry only if
 *      entry.mtimeMs > (watermarks[entry.harness] ?? -Infinity).
 *      (discover applies ONE `since`; this restores per-harness precision.)
 *   3. transcripts.parse(entry) each kept entry → redacted, capped Extract.
 *   4. TOTAL cap: sum JSON.stringify(extract) byte length; process NEWEST-first
 *      (descending mtimeMs); stop once the running total would exceed
 *      maxInputBytes. Oldest overflow sessions are DROPPED (count in
 *      droppedForSize). Do NOT summarize — naive drop-oldest is the v1 behavior
 *      (chunk-and-summarize deferred; note it).
 *   5. scratchDir = <paths.state>/dream-scratch (mkdir -p; if it already exists
 *      from a crashed run, empty it first). Write each kept extract to
 *      scratchDir/<harness>-<sanitized session_id>.json (pretty JSON). Return the
 *      written file list in `wrote`.
 *   6. maxMtime = per-harness max mtimeMs among KEPT entries, else the incoming
 *      watermark (a harness with nothing new is unchanged). */
function collectExtracts(paths, watermarks, maxInputBytes)

/** rm -rf the scratch dir. WP-017 calls this in a finally block — always. */
function cleanScratch(stateDir)
```

#### `src/core/dream/brain.js`

```js
/** Build the argv for the headless brain (Claude), AFTER the "claude" name.
 *  Pure — this is the unit-tested security surface.
 *  @param {{vaultDir, scratchDir, date, model:string|null}} o @returns {string[]} */
function buildClaudeArgs({vaultDir, scratchDir, date, model})

/** Spawn the brain and return a handle + completion promise. NO watchdog here —
 *  WP-017 wraps this with the timeout kill. detached:true is REQUIRED so WP-017
 *  can kill the whole process group.
 *  @param {{vaultDir, scratchDir, date, model, env, logStream}} o
 *  @returns {{ child: import('child_process').ChildProcess,
 *              done: Promise<{code:number|null, durationMs:number}> }}
 *  - If env.WIENERDOG_DREAM_CMD is set, spawn THAT (a path to an executable)
 *    instead of claude, with the same env additions. This is the test seam.
 *  - Otherwise spawn `claude` with buildClaudeArgs(...).
 *  - spawn options: cwd = vaultDir; detached:true (own process group);
 *    stdio piped and tee'd to logStream.
 *  - Add to the child env: WIENERDOG_DREAM_VAULT=vaultDir,
 *    WIENERDOG_DREAM_SCRATCH=scratchDir, WIENERDOG_FAKE_TODAY (pass through). */
function spawnBrain(o)
```

**The literal production invocation** `buildClaudeArgs` must produce (researched
against `claude 2.1.198` on this machine, July 2026 — `claude --help`). Comments
explain *why each flag is load-bearing*; emit the flags, not the comments:

```js
[
  '-p', DREAM_PROMPT(scratchDir, vaultDir, date), // headless, non-interactive
  // AUTHORITATIVE built-in tool allowlist. Excludes Bash (no shell),
  // WebFetch/WebSearch (no network), and everything else:
  '--tools', 'Read,Write,Edit,Glob,Grep',
  '--permission-mode', 'acceptEdits',   // auto-approve edits so -p runs unattended
  '--add-dir', vaultDir,                // tool access: the writable vault
  '--add-dir', scratchDir,              // tool access: read the extracts (see note)
  '--strict-mcp-config',                // with NO --mcp-config → zero MCP servers (no MCP tools/network)
  '--setting-sources', 'user',          // ignore project/local settings under cwd (a repo can't widen tools)
  ...(model ? ['--model', model] : []), // omit → user's default model (subscription auth preserved)
]
```

`DREAM_PROMPT(scratchDir, vaultDir, date)` is a short string that triggers the
skill and passes the paths (the skill reads them from prompt text — Bash is off, so
it cannot read env vars):
```
/wienerdog-dream

Scratch extracts directory (read-only inputs): <scratchDir>
Vault directory (your only write target): <vaultDir>
Today's date: <date>
```

Sandbox notes (state these as comments in brain.js):
- `--add-dir scratchDir` grants read AND write to scratch; the brain must not write
  there. WP-017's scratch-integrity check reverts any brain write to scratch — this
  is exactly the out-of-vault case WP-017's fixture exercises.
- Do NOT use `--dangerously-skip-permissions` (re-enables everything), `--bare`
  (forces API-key auth, breaking the user's subscription that ADR-0004 relies on),
  or `--safe-mode` (disables skills, so the dream skill wouldn't load).
- **These CLI flags are best-effort prevention. The guarantee is WP-017's code
  validation** (Threat model: "code, not the model, enforces the boundary").
- **wd-researcher must re-verify these exact flags against the current `claude`
  CLI before M3 sign-off** (per ARCHITECTURE: platform claims are re-verified before
  each milestone that depends on them) — flag names/semantics can drift between
  Claude Code versions.

## Implementation notes & constraints

- **Zero new npm dependencies.** Node stdlib only (`child_process`, `fs`, `path`).
  JSDoc types, no TypeScript, no build step. Follow CLAUDE.md conventions.
- **No process outlives the job (ADR-0004).** `spawnBrain` sets `detached:true`
  precisely so WP-017's watchdog can group-kill; this WP ships no command that runs
  the brain unattended. Its unit test uses a fast fake cmd that exits promptly.
- **Atomic writes**: watermarks.json via temp file + `fs.renameSync`; the lock via
  `fs.openSync(..., 'wx')`.
- Reading config: reuse the minimal line-based frontmatter/scalar parser approach
  the digest renderer used (WP-005) — do not add a YAML dependency.
- Tests: set `WIENERDOG_HOME`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME` to dirs under an
  `fs.mkdtemp` root; never touch the real `$HOME`. `dream-collect.test.js` writes
  temp `.jsonl` transcripts (reuse WP-007's real-shape lines) rather than shipping
  new fixture files.
- When uncertain: choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

## Acceptance criteria

- [ ] `readDreamConfig` returns the vault path and knob defaults (20 min, 400000
      bytes, null model), overridden when the optional keys are present; throws on
      a null/missing `vault:`.
- [ ] `acquireLock` on an empty state dir acquires; a second call while the lock is
      live returns `{acquired:false}`; a lock past its `deadline` is stolen
      (`stolen:true`). `releaseLock` removes only our own lock.
- [ ] `readWatermarks` tolerates a missing/corrupt file (→ nulls); `writeWatermarks`
      round-trips atomically.
- [ ] `collectExtracts`: with two temp transcripts (one claude, one codex), returns
      both when watermarks are null; honors per-harness watermarks (raise one → that
      harness's older file excluded); writes one scratch file per kept extract; sets
      `maxMtime` per harness; drops oldest sessions past `maxInputBytes`
      (`droppedForSize` > 0) with a small cap.
- [ ] `buildClaudeArgs` contains `--tools Read,Write,Edit,Glob,Grep`, both
      `--add-dir` entries, `--permission-mode acceptEdits`, `--strict-mcp-config`,
      `--setting-sources user`, and NO `--dangerously-skip-permissions`/`--bare`/
      `--safe-mode`; omits `--model` when model is null and includes it otherwise.
- [ ] `spawnBrain` with `WIENERDOG_DREAM_CMD` pointing at a fake cmd resolves with
      that command's exit code and passes `WIENERDOG_DREAM_VAULT`/`_SCRATCH` in the
      child env (the fake cmd writes them to a marker file the test reads).
- [ ] `npm test`, `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern dream-lock
npm test -- --test-name-pattern dream-collect
npm test -- --test-name-pattern dream-brain
npm run lint
node -e "const {buildClaudeArgs}=require('./src/core/dream/brain'); console.log(buildClaudeArgs({vaultDir:'/v',scratchDir:'/s',date:'2026-07-02',model:null}).join(' '))"
```

## Out of scope (do NOT do these)

- **The runtime pipeline and `wienerdog dream` command, the watchdog (timeout
  kill-tree), post-run git-diff validation, the Tier-3 code gate, the single
  commit, digest regeneration, and watermark advancement** — all WP-017. This WP
  provides the modules WP-017's pipeline consumes; it wires no CLI and touches
  `bin/wienerdog.js` not at all.
- **The dream skill** (`skills/wienerdog-dream/SKILL.md`) — WP-009.
- **The fake-brain integration fixtures and the injection transcript** — WP-017.
- **`run-job` wrapper, scheduler, fail-loud email/banner** — WP-013.
- **Editing WP-007's parsers/`redact()`, `renderDigest`, or the config template.**

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/008-dream-orchestrator`; PR titled `feat(dream): implement dream input assembly and brain launch (WP-008)`.
3. PR template filled, including "Decisions made" and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
