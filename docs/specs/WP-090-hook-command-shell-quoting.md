---
id: WP-090
title: Shell-quote hook command paths so an install path with spaces/metacharacters produces valid hooks
status: In-Review
model: opus
size: M
depends_on: [WP-089]
adrs: []
branch: wp/090-hook-command-shell-quoting
---

# WP-090: Shell-quote hook command paths

## Context (read this, nothing else)

Both harnesses run Wienerdog's session hooks as **shell commands**. The Claude and
Codex adapters register a hook by storing an absolute script path as the hook's
`command` string in a JSON settings file (`~/.claude/settings.json`,
`$CODEX_HOME/hooks.json`), and the harness executes that string through **bash**.
Registration flows through one choke point: `applySettings`
(`src/adapters/shared.js`).

The **verified defect (P1, robustness):** the command is stored as the **bare**
path with no shell quoting. WP-077 normalizes backslashes to forward slashes (so
the path is bash-valid character-wise), but forward-slash normalization does **not**
solve **tokenization**: a legitimate install path containing a space or shell
metacharacter — e.g. `/Users/ada/My Files/.wienerdog/app/current/bin/session-end.sh`
— is split by bash, which then tries to run `/Users/ada/My` and the hook ENOENTs at
every session. Install paths with spaces are ordinary on macOS/Windows.

The fix is to store a **shell-quoted** command at the same choke point. This must
stay consistent with WP-077's existing idempotency/prune logic (which compares the
normalized command to detect and remove stale separator-variants) so that one
`sync` converges any prior entry to exactly one working, quoted entry.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
this is settings-file editing done by `sync`. Idempotent + reversible: a second
`sync` makes zero changes; uninstall removes exactly the entry added.

## Current state

`src/adapters/shared.js`:

```js
function toPosixCommand(command) {           // WP-077 — backslash → forward slash
  return String(command).replace(/\\/g, '/');
}

function applySettings(settingsPath, events, dryRun, manifest, out) {
  // …load/normalize settings.hooks…
  for (const [event, rawCommand] of events) {
    const command = toPosixCommand(rawCommand);      // ← bare, unquoted path
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];

    // Prune stale separator-variants of OUR command: match when the NORMALIZED
    // path equals ours but the raw string differs.
    // …filter (h) => !(toPosixCommand(h.command) === command && h.command !== command)…

    const present = settings.hooks[event].some(
      (group) => group && Array.isArray(group.hooks) && group.hooks.some((h) => h && h.command === command)
    );
    if (!present) {
      settings.hooks[event].push({ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] });
      changed = true;
    }
  }
  // …write settings; record { kind:'settings-entry', path, createdFile,
  //    commands: events.map(([, c]) => toPosixCommand(c)) }…
}
```

The manifest records `commands` as the `toPosixCommand`-normalized strings; the
uninstall reverser (`manifest.js reverseSettingsEntry`) removes hooks whose
`command` is in that recorded set. **The stored command and the recorded
`commands` must be the same string** for uninstall to match.

The adapters pass the raw path in `events`, e.g. `claude.js`:
`[['SessionStart', startAbs], ['Stop', stopAbs]]` and similarly `codex.js`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/adapters/shared.js | add `shellQuoteCommand`; store the quoted command; prune prior unquoted/separator-variants of our command; record the quoted string in the manifest `commands` |
| modify | tests/unit/claude-adapter.test.js | test: a path with a space registers ONE quoted hook; a second run is a no-op; a prior bare entry is converged |
| modify | tests/unit/codex-adapter.test.js | same for the Codex adapter path |
| modify | tests/integration/bootstrap-seam.test.js | its 3 bare-path hook-command assertions (SessionStart under Claude settings.json / Codex hooks.json) are updated to expect the quoted canonical form — a direct, mechanical consequence of the always-quote contract below (orchestrator-authorized scope addition; see Implementation notes) |

### Exact contracts

**`shellQuoteCommand(path)`** — produce a bash-safe single-argument command from
an already forward-slash-normalized path. Single-quote the path and escape any
embedded single quote with the standard `'\''` idiom. Applied ON TOP of
`toPosixCommand` so backslash normalization still happens first:

```js
/** Wrap a (forward-slash-normalized) script path so bash runs it as ONE argument
 *  even when it contains spaces or shell metacharacters. Single-quotes are the
 *  strongest bash quoting (no interpolation); an embedded ' is closed, escaped,
 *  reopened. Valid on POSIX bash AND the bash the Windows harnesses shell out to
 *  (WP-077). Idempotent input → identical output, so prune/present comparisons and
 *  the recorded manifest command all use this one canonical form.
 *  @param {string} rawCommand @returns {string} */
function shellQuoteCommand(rawCommand) {
  const p = toPosixCommand(rawCommand);
  return `'${p.replace(/'/g, `'\\''`)}'`;
}
```

**In `applySettings`,** replace the bare `command` with the quoted canonical form
and keep every comparison consistent with it:

```js
for (const [event, rawCommand] of events) {
  const command = shellQuoteCommand(rawCommand);   // canonical: quoted
  if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];

  // Prune any prior variant of OUR command: an entry whose command, once
  // shell-quoted+normalized, equals `command` but whose stored string differs
  // (an old bare/backslash/forward-slash-unquoted entry). A user's unrelated hook
  // never re-quotes to our path, so it is never touched.
  // …filter (h) => !(shellQuoteCommand(h.command) === command && h.command !== command)…

  const present = settings.hooks[event].some(
    (group) => group && Array.isArray(group.hooks) && group.hooks.some((h) => h && h.command === command)
  );
  if (!present) {
    settings.hooks[event].push({ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] });
    changed = true;
  }
}
// record { …, commands: events.map(([, c]) => shellQuoteCommand(c)) }
```

Crucial consistency requirements:
- The stored `command`, the `present` check, the prune predicate, and the recorded
  manifest `commands` **all** use `shellQuoteCommand` — so idempotency holds
  (second `sync` = no change) and uninstall's set-membership match still works.
- The prune must apply `shellQuoteCommand` to `h.command` for comparison so that a
  pre-existing **bare** entry (`/path/x.sh`) written by an older version is
  recognized as our command's stale variant and converged to the single quoted
  entry — never leaving both a broken bare entry and the quoted one.
- A `h.command` that is ALREADY the quoted canonical form re-quotes to itself
  (`shellQuoteCommand('\'/p/x.sh\'')` must NOT double-wrap into
  `'\''/p/x.sh'\''`). Because `shellQuoteCommand` first runs `toPosixCommand` then
  wraps, an already-quoted string would be re-wrapped. **Handle this:** the prune
  predicate's `h.command !== command` guard means an already-canonical entry is
  detected as `present` (equality against `command`) and is neither pruned nor
  re-added — verify with a "second run is a no-op" test. (Do NOT attempt to
  unwrap; rely on the exact-equality `present`/`!==` guards, and pin the no-op with
  a test.)

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Depends on WP-089 (shares `src/adapters/shared.js`) — sequence after it to avoid
  a merge conflict.
- Do NOT change the settings load/normalize logic, the managed-block code, or the
  skill-links code. Only `applySettings`' command construction + the new helper.
- The manifest's recorded `commands` change from bare to quoted for NEW installs;
  already-installed machines carry bare recorded commands (uninstall on them leaves
  the bare hook, which this same-session quoted entry supersedes only after a
  `sync`). Flag this pre-existing-manifest residual under "Decisions made" — do not
  attempt a manifest migration here.
- No golden fixture pins the hook command string. However, the always-quote
  contract necessarily changes the canonical stored command from the bare path to
  the single-quoted form, so `tests/integration/bootstrap-seam.test.js`'s three
  bare-path hook-command assertions (SessionStart under Claude `settings.json` and
  Codex `hooks.json`) must be updated to expect the quoted form — the same `q()`
  mirror-helper pattern used in the two unit test files. This is an
  orchestrator-authorized scope addition (that file is added to the Deliverables
  table); do NOT weaken the contract to conditional quoting to avoid it.

## Security checklist

- [ ] The command path is shell-quoted with the strongest bash quoting
      (single-quote + `'\''` escape) at the single `applySettings` choke point, so a
      path containing a space or shell metacharacter produces exactly one valid
      single-argument hook — no word-splitting, and no metacharacter is interpreted.
- [ ] Only OUR command's prior variants are pruned (match on the re-quoted path
      equalling ours AND the raw string differing); an unrelated user hook never
      matches, so user hooks are never touched.

## Acceptance criteria

- [ ] Registering a hook whose script path contains a space yields a single hook
      whose `command` is the single-quoted path; a second `applySettings` run makes
      no change (idempotent) and reports `unchanged`.
- [ ] A settings file pre-seeded with a prior **bare** (unquoted) variant of our
      command converges to exactly one quoted entry (the bare one is pruned).
- [ ] An unrelated user hook (different command) is left untouched.
- [ ] Uninstall via `reverseSettingsEntry` removes the quoted entry (the recorded
      `commands` match the stored `command`) — proved by a settings-entry reverse test.
- [ ] Both adapter tests (Claude + Codex) pass; `bootstrap-seam` integration passes.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "adapter|settings|hook"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Managed-block marker robustness — **WP-091** (shares this file).
- Preserving non-object settings shapes / exact-duplicate convergence / malformed-
  JSON handling (adapters #5/#6/#11) — separate hardening, not this WP.
- A manifest migration that rewrites already-installed machines' recorded bare
  commands to quoted form.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/090-hook-command-shell-quoting`; conventional commits; PR titled
   `fix(adapters): shell-quote hook command paths (WP-090)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
