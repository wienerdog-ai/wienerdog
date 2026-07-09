---
id: WP-077
title: Register hook commands with forward-slash paths (Windows SessionEnd no longer ENOENTs)
status: In-Review
model: opus
size: M
depends_on: []
adrs: [ADR-0004]
branch: wp/077-hook-commands-forward-slash-on-win32
---

# WP-077: Register hook commands with forward-slash paths (Windows SessionEnd no longer ENOENTs)

## Context (read this, nothing else)

Wienerdog registers a small set of Claude Code / Codex CLI **hooks** so a harness
session enriches its context (SessionStart) and captures its transcript on exit
(SessionEnd / Stop). Registration means: copy the hook shell scripts into
`~\.wienerdog\bin\`, then merge `{type:'command', command:<absolute path>}` entries
into the harness's settings file (`~\.claude\settings.json` for Claude Code,
`~\.codex\hooks.json` for Codex). Both adapters build the command path with
`path.join(binDir, '<script>.sh')` and pass it to one shared writer,
`src/adapters/shared.js` `applySettings`.

On Windows, `path.join` yields **backslash** separators, so the registered command
becomes e.g. `C:\Users\<user>\.wienerdog\bin\session-end.sh`. Claude Code (and Codex)
execute `command` hooks **through bash** on Windows, and bash treats an unquoted
backslash as an **escape character** — the path collapses:
`C:\Users\<user>\…\session-end.sh` → `C:Users<user>…session-end.sh` → ENOENT. So the
hook fails at **every** session boundary even though the script file exists.

**Field evidence (verified).** Same external tester as WP-073/074/076 (Windows 11 Pro
hu-HU, non-elevated; wienerdog 0.6.5). Every session ended with:

```
SessionEnd hook [C:\Users\<user>\.wienerdog\bin\session-end.sh] failed:
bash: C:Users<user>.wienerdogbinsession-end.sh: No such file or directory
```

The file was present at that path. He edited `settings.json` by hand to use forward
slashes (`C:/Users/<user>/.wienerdog/bin/session-end.sh`) and the hook worked —
forward slashes are valid for **both** bash and the Windows filesystem API.

**Fix, in one place.** Both adapters route through `shared.applySettings`, which is
also where the command is (a) deduped against existing entries, (b) written to the
settings file, and (c) recorded into the uninstall manifest. Normalizing the command
to forward slashes **inside `applySettings`** fixes both harnesses, keeps the written
value and the recorded value consistent, and needs no change to `claude.js` or
`codex.js`. Forward slashes are correct on every OS, so we normalize
**unconditionally** — one code path, no platform branch. On POSIX the paths already
use `/`, so the normalization is a no-op there and nothing about macOS/Linux behavior
changes.

**Update-safety is a hard requirement.** After this ships, `wienerdog sync` must
**converge** any already-installed machine to the correct forward-slash state,
idempotently, from BOTH starting points:
- the tester's **hand-fixed** machine (settings already hold the forward-slash
  command) → must no-op (recognize it as already present);
- a **stock broken** 0.6.5 machine (settings hold the backslash command) → must
  replace the broken backslash entry with the forward-slash one, leaving **exactly
  one** working entry (not a second entry beside the still-broken one).

The second case is the subtle part: the current dedup compares command strings
exactly, so a forward-slash desired command is "not present" next to a backslash
entry and would be **appended**, leaving the broken entry firing forever. So
`applySettings` must **prune any existing hook whose command is a separator-variant of
our own desired command** before ensuring the forward-slash command is present.

**Product invariant.** Wienerdog is just files; it never starts a process that
outlives its job (ADR-0004). This WP only changes the string written into a settings
file and the string recorded in the manifest — no daemon, no dependency, no new file.

## Current state

`src/adapters/shared.js` `applySettings(settingsPath, events, dryRun, manifest, out)`
(lines 123–174). It: loads/parses the JSON (empty object if absent/malformed),
ensures `settings.hooks` is an object, then for each `[event, command]` pushes
`{matcher:'*', hooks:[{type:'command', command, timeout:10}]}` **iff** no existing
group already contains a hook with that exact `command`; finally writes the file (only
if changed) and records a `settings-entry` manifest entry with
`commands: events.map(([, command]) => command)`. Exact dedup + record excerpt:

```js
for (const [event, command] of events) {
  if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];
  const present = settings.hooks[event].some(
    (group) => group && Array.isArray(group.hooks) &&
      group.hooks.some((h) => h && h.command === command)
  );
  if (!present) {
    settings.hooks[event].push({ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] });
    changed = true;
  }
}
// …
recordOnce(manifest, { kind: 'settings-entry', path: settingsPath, createdFile,
  commands: events.map(([, command]) => command) });
```

Callers (unchanged by this WP):
- `src/adapters/claude.js:73` — `shared.applySettings(settingsPath,
  [['SessionStart', startAbs], ['SessionEnd', endAbs]], …)` where `startAbs`/`endAbs`
  = `path.join(binDir, 'session-start.sh' | 'session-end.sh')`.
- `src/adapters/codex.js:84` — `shared.applySettings(hooksPath,
  [['SessionStart', startAbs], ['Stop', stopAbs]], …)` where `stopAbs` =
  `path.join(binDir, 'codex-session-end.sh')`.

Uninstall reversal (`src/core/manifest.js` `reverseSettingsEntry`, lines 148–180)
removes hooks whose `command` is in the recorded `commands` set. Recording the
**normalized** command (below) keeps a fresh install's uninstall correct. NOTE a
pre-existing residual on already-installed machines is called out under "Open decision
for the owner" — it is **out of scope here** and must not be silently resolved.

Tests that exercise these commands (POSIX CI):
- `tests/unit/claude-adapter.test.js` — computes `endAbs = path.join(paths.core,
  'bin', 'session-end.sh')` and asserts SessionEnd contains exactly that command; also
  has an "unrelated hook survives" case (`/usr/local/bin/other.sh`).
- `tests/unit/codex-adapter.test.js` — same shape for `Stop`/`codex-session-end.sh`
  and SessionStart, plus "unrelated Stop hook survives" (`/usr/local/bin/other-stop.sh`).
- `tests/integration/bootstrap-seam.test.js` asserts `startAbs` is registered. On
  POSIX `path.join` already yields `/`, and the normalization is a no-op, so this
  integration test passes **unchanged** — it is NOT in this WP's Deliverables; do not
  touch it.

There are **no golden fixtures for settings.json / hooks.json** (only the CLAUDE.md /
AGENTS.md managed-block goldens), so no golden update is in scope.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | add `toPosixCommand`; in `applySettings` normalize each event's command to `/`, prune any existing separator-variant of our own command, ensure the normalized command present, record normalized commands in the manifest |
| modify | tests/unit/claude-adapter.test.js | add convergence + forward-slash cases (backslash-seeded settings → exactly one forward-slash SessionEnd entry; unrelated hook survives; idempotent 2nd run) |
| modify | tests/unit/codex-adapter.test.js | same convergence cases for `Stop` (and a SessionStart forward-slash assertion) |

### Exact contracts

**1. Normalizer (new, exported for the tests).** Add to `src/adapters/shared.js`:

```js
/** Normalize a hook command's path separators to forward slashes. Claude Code and
 *  Codex run command hooks through bash on Windows, where an unquoted backslash is an
 *  escape char (C:\Users\… collapses to C:Users…, ENOENT). Forward slashes are valid
 *  for bash AND the Windows API, so we register the forward-slash form on EVERY
 *  platform — a no-op on POSIX, where paths already use '/'. One code path, no
 *  platform branch (WP-077). */
function toPosixCommand(command) {
  return String(command).replace(/\\/g, '/');
}
```

**2. `applySettings` — normalize + converge.** Replace the per-event loop so that,
for each `[event, rawCommand]`:

- `const command = toPosixCommand(rawCommand);` — use the normalized form for the
  dedup, the write, AND the manifest record.
- **Prune stale separator-variants of OUR command.** In `settings.hooks[event]`, for
  each group, filter out any hook `h` where `toPosixCommand(h.command) === command`
  **and** `h.command !== command` (i.e. the same path written with the other
  separator — our own broken backslash entry). If a group's `hooks` becomes empty as a
  result, drop that group. If any hook/group was removed, set `changed = true`. This
  targets **only** our exact command path; a user's unrelated hook never normalizes to
  our `bin/<script>.sh` path, so it is never touched.
- **Ensure present.** Then run the existing `present` check against the normalized
  `command`; if absent, push `{matcher:'*', hooks:[{type:'command', command, timeout:10}]}`
  and set `changed = true`.

Record the normalized commands: `commands: events.map(([, c]) => toPosixCommand(c))`.

Convergence truth table (per hook, one `sync`):

| existing settings entry for this hook | after applySettings |
|---------------------------------------|---------------------|
| none | one entry, forward-slash |
| forward-slash (tester's hand-fix) | unchanged — one entry, forward-slash (no-op, `out.unchanged`) |
| backslash (stock broken 0.6.5) | backslash pruned, one entry forward-slash (`out.changed`) |
| unrelated user hook (`/usr/local/bin/other.sh`) | untouched (never matches our path) |

`dryRun`, the `createdFile` bookkeeping, empty-object file deletion semantics, and the
`out.changed`/`out.unchanged` reporting all keep their current behavior — only the
command string and the prune step change.

**3. Tests.** For `tests/unit/claude-adapter.test.js`, add a case that:
- computes `endAbs = path.join(paths.core, 'bin', 'session-end.sh')` and the simulated
  Windows form `const winEnd = endAbs.replace(/\//g, '\\');`
- pre-seeds `settings.json` with a SessionEnd group whose command is `winEnd`, plus an
  unrelated SessionStart hook (`/usr/local/bin/other.sh`)
- runs `applyClaudeAdapter`, then asserts:
  - `allCommands('SessionEnd')` equals exactly `[endAbs]` (one entry, forward-slash,
    no backslash variant remaining) — `assert.ok(!allCommands('SessionEnd')[0].includes('\\'))`
  - the unrelated SessionStart hook still present
  - a second `applyClaudeAdapter` reports the settings file `unchanged` (idempotent)

Mirror this in `tests/unit/codex-adapter.test.js` for `Stop` /
`path.join(paths.core, 'bin', 'codex-session-end.sh')`, keeping the existing
`other-stop.sh` survival assertion. (On POSIX `endAbs` is already forward-slash, so the
existing exact-equality assertions continue to pass unchanged.)

## Implementation notes & constraints

- **Fix lives in `shared.applySettings` only.** Do NOT edit `claude.js`/`codex.js`
  (they pass native `path.join` paths and the chokepoint normalizes) and do NOT touch
  the copied hook **script** file paths — those are real filesystem writes where Node
  accepts native separators fine; only the settings **command string** needs `/`.
- **Prune only our own command.** Match strictly on `toPosixCommand(h.command) ===
  command`. Never prune on a looser heuristic (e.g. "any hook containing our bin dir")
  — that could delete a user's legitimately different hook.
- Preserve group order and unrelated groups; mirror the empty-group pruning that
  `manifest.js` `reverseSettingsEntry` already does (drop a group whose `hooks` array
  is emptied).
- Zero new dependencies; no build step (CLAUDE.md).
- When uncertain, choose the simpler option and record it under "Decisions made".

### Open decision for the owner (do NOT resolve in this WP)

On a machine **already installed** at 0.6.5, the uninstall manifest's `settings-entry`
already records the **backslash** commands, and `recordOnce` dedups by `kind+path`, so
it will **not** overwrite that entry when `sync` later writes forward-slash commands.
Result: a subsequent `wienerdog uninstall` on such a machine would fail to remove
Wienerdog's (now forward-slash) hook, leaving one stray hook line in the user's
settings (the vault and everything else still uninstall cleanly — cosmetic, not a data
risk). This WP fixes the **runtime** bug (SessionEnd works after one `sync`) and does
NOT address this uninstall residual, to keep the file set disjoint from WP-076 and the
manifest/uninstall subsystem. Recommended follow-up (owner's call): make
`src/core/manifest.js` `reverseSettingsEntry` match hooks by **normalized** command
(smallest durable fix; CI-testable on POSIX), OR accept the residual. Flag left for the
owner; not scoped here.

## Security checklist

- [ ] No new untrusted identifier. The command path is built by the adapters from
      `paths.core` + fixed script basenames; this WP only rewrites `\` → `/` in that
      already-trusted path and prunes entries matching our own exact command. No value
      flows into a shell command or a new filesystem path.

## Acceptance criteria

- [ ] The command written into settings/hooks for every registered hook contains no
      backslash (`\`) on any platform.
- [ ] Backslash-seeded settings converge to exactly one forward-slash entry per hook
      after one apply; the prior backslash entry is removed (not left beside it).
- [ ] Forward-slash-seeded settings are a no-op (reported `unchanged`); a second apply
      is idempotent from any starting point.
- [ ] Unrelated user hooks (different command path) are never pruned or altered.
- [ ] The recorded manifest `commands` are the forward-slash forms.
- [ ] Existing claude/codex adapter and `bootstrap-seam` assertions still pass on POSIX
      (normalization is a no-op there).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern adapter
npm test
npm run lint
```

### Manual Windows verification (owner/tester gate — CI has no Windows runner)

Before merge, on a **stock Windows machine** (the reporting tester's, or equivalent),
from a build of this branch:

1. Fresh install: after `wienerdog init`/`sync`, `~\.claude\settings.json` shows the
   SessionEnd command with forward slashes; starting and ending a Claude Code session
   produces **no** `SessionEnd hook … failed: bash: … No such file or directory`.
2. Convergence: on the tester's machine that had the **backslash** entry, one
   `wienerdog sync` rewrites it to forward slashes and leaves exactly one SessionEnd
   entry; a second `sync` changes nothing.

Paste the `settings.json` before/after excerpt and the clean session-end console into
the PR under "Manual verification" (or defer to the owner/tester with these steps, per
the WP-073/074 precedent).

## Out of scope (do NOT do these)

- The win32 clean-env git-on-PATH fix — **WP-076**.
- Any change to `claude.js`, `codex.js`, the hook **script** contents, or the
  copied-script filesystem paths.
- The uninstall manifest-command residual on already-installed machines — flagged
  above as an owner decision; NOT scoped here.
- Golden fixtures (none pin settings/hooks command strings).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The manual
   Windows check is completed or explicitly deferred to the owner/tester with the
   reproduction steps above.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(adapters): register hook commands with forward-slash paths (WP-077)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
