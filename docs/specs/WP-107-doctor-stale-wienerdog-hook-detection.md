---
id: WP-107
title: doctor flags stale/foreign wienerdog session hooks whose script is gone
status: Ready
model: sonnet
size: S
depends_on: [WP-106]
adrs: [ADR-0004]
branch: wp/107-doctor-stale-wienerdog-hook-detection
---

# WP-107: doctor flags stale/foreign wienerdog session hooks whose script is gone

## Context (read this, nothing else)

`wienerdog doctor` (`src/cli/doctor.js`) prints one `[ok]`/`[warn]`/`[fail]` line per
health check and exits 1 only if a check **fails** (warnings never fail). It is
read-only. Wienerdog is just files; it never starts a process that outlives its job
(ADR-0004), and everything it writes to a user machine must stay reversible via the
install manifest.

**How Wienerdog registers session hooks.** Each harness adapter merges two command hooks
into the harness's settings file (`src/adapters/shared.js` → `applySettings`):
- Claude Code → `<claudeDir>/settings.json`, events `SessionStart` + `SessionEnd`,
  commands pointing at `<core>/bin/session-start.sh` and `<core>/bin/session-end.sh`.
- Codex CLI → `<codexDir>/hooks.json`, events `SessionStart` + `Stop`, commands pointing
  at `<core>/bin/session-start.sh` and `<core>/bin/codex-session-end.sh`.

Both files share one shape: `settings.hooks[event]` is an array of *groups*, each group
`{matcher, hooks:[{type:'command', command, timeout}]}`. The `command` string is the
script path, forward-slash-normalized and single-quoted (`shellQuoteCommand`, WP-077/090)
— e.g. `'/Users/me/.wienerdog/bin/session-end.sh'`.

`applySettings` keeps re-syncs clean by **pruning stale variants of its OWN canonical
command** — a bare/backslash/unquoted entry that re-quotes to the exact path it is about
to write. But it only recognizes *its own current path*. A wienerdog-**shaped** hook at a
**foreign** path (a different `<core>`) is indistinguishable from an unrelated user hook
and **survives every sync forever**.

**Why this WP exists — the 2026-07-12 → 07-16 dogfooding incident.** A demo re-record ran
the real installer with `WIENERDOG_HOME` pointed at a `mktemp -d` sandbox but did not
redirect the Claude config dir. Alongside repointing the skill symlinks (WP-106),
`applySettings` **added a second SessionStart/SessionEnd hook pair** into the real
`~/.claude/settings.json`, pointing at the temp core's `bin/session-{start,end}.sh`. The
temp dir was purged ~3 days later, and from then on **every Claude session logged
"SessionEnd hook failed: No such file or directory"** — indefinitely. `wienerdog doctor`
reported all-green throughout: it has no check for hooks at all.

**What this WP does.** Add one read-only `doctor` check: scan each present harness's
settings file for command hooks that (a) look like a Wienerdog session hook (the script
basename is one of ours) **and** (b) reference a script that **does not exist on disk**,
and emit a `[warn]` naming the exact settings file, event, and command, with a
plain-language manual-removal instruction. It is **notice-only** — `doctor` never edits
the settings file.

**Why detect-and-warn, not auto-fix (decision, recorded here per the local-decision
rule).** The broken hook lives at a foreign path we never recorded in the install
manifest, so we cannot *prove* ownership — only pattern-match it. Auto-editing a
user-owned settings file based on a heuristic would violate the reversibility posture
(ADR-0004: everything we write is manifest-tracked and reversible; we do not silently
mutate files we did not record). The safe, unambiguous signal is "a wienerdog-shaped hook
whose target script is gone" — which is definitely broken and almost certainly ours — so
we surface it loudly with an exact manual fix and let the user remove it. `wienerdog
sync` cannot safely remove it either (same ownership problem), so the remediation is
manual. An explicit `--fix` path is **out of scope** for v1 (recorded under Out of scope).

## Current state

**`src/cli/doctor.js`** `run(_argv)` builds a `check(status, msg)` closure and runs a
series of read-only checks. After the harness-detection summary it does the scheduler
checks, then (with WP-106) the skill-link checks, then `googleReadinessChecks`, then the
update notice (which stays last). `harnesses = detectHarnesses()` and `paths` are in
scope. `detectHarnesses()` returns `{ claude:{present,dir}, codex:{present,dir} }`.

The hook script basenames Wienerdog ever writes are exactly:
`session-start.sh`, `session-end.sh`, `codex-session-end.sh`
(confirmed: `templates/hooks/` holds only these three; the adapters register only these).

The command strings are single-quoted forward-slash paths. Reversing the quoting is the
inverse of `shellQuoteCommand`: strip one leading and trailing `'`, then replace `'\''`
with `'`. A path Wienerdog wrote always has that shape; a foreign wienerdog-shaped hook
written by the *same* installer (the incident) has it too.

**`tests/unit/doctor.test.js`** drives `doctor` as a subprocess against an isolated temp
`HOME`/`WIENERDOG_HOME`. `tempEnv()` points `CLAUDE_CONFIG_DIR` / `CODEX_HOME` at
non-existent dirs by default (harnesses "not found"); the WP-079/WP-106 tests show how to
make a harness present by creating a real dir and setting the env var before `init`.
After `init --yes` with a present Claude dir, `<claudeDir>/settings.json` holds
Wienerdog's real (valid) SessionStart/SessionEnd hooks — a good baseline to which a test
can append a stale/foreign entry.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/doctor.js | add `staleHookChecks(paths, harnesses)` returning `{status:'warn', msg}[]`; call it in `run` after the skill-link checks |
| modify | tests/unit/doctor.test.js | add cases: stale/foreign wienerdog hook (script missing) → `[warn]`, exit 0; only the valid current hooks → no stale-hook warn; a user's unrelated hook with a missing script → not flagged; Codex-side stale hook → `[warn]` |

### Exact contracts

**1. `staleHookChecks(paths, harnesses)` — new helper in `doctor.js`.** Pure and
read-only; returns an array of `{status:'warn', msg:string}` (only warns; empty when
nothing is stale). One line **per** stale hook (each names a specific settings entry) —
these are actionable and rare, so per-entry lines are worth it.

```js
// The EXACT (event → script basename) pairs Wienerdog registers, per settings file.
// A generic filename alone is NOT enough — a user's own SessionEnd hook could be named
// session-end.sh — so a hook is Wienerdog-shaped ONLY when BOTH the event AND the basename
// match a pair the corresponding adapter actually writes (src/adapters/{claude,codex}.js).
const WD_HOOK_PAIRS = {
  claude: { SessionStart: 'session-start.sh', SessionEnd: 'session-end.sh' },
  codex: { SessionStart: 'session-start.sh', Stop: 'codex-session-end.sh' },
};

/** Detect a Wienerdog-SHAPED session hook whose target SCRIPT no longer exists — the
 *  2026-07-12 demo-sandbox residue: a second SessionStart/SessionEnd pair was merged into
 *  the real ~/.claude/settings.json pointing at a temp core the OS later purged, so every
 *  session logged "SessionEnd hook failed". applySettings only prunes variants of its OWN
 *  current command path, so a foreign-path wienerdog hook survives forever. A match
 *  requires the EXACT (event, basename) pair Wienerdog registers for that harness AND a
 *  missing script — this refuses to claim a user's unrelated hook (a session-end.sh under
 *  PreToolUse, or a session-start.sh under SessionEnd, is NOT ours). Ownership still can't
 *  be PROVEN (the path is foreign/unrecorded), so the WARN is HEDGED ("possible leftover …
 *  if you didn't add this yourself") and NEVER auto-removed (reversibility, ADR-0004).
 *  Read-only; never throws.
 *  @param {import('../core/paths').WienerdogPaths} paths
 *  @param {{claude:{present:boolean}, codex:{present:boolean}}} harnesses
 *  @returns {{status:'warn', msg:string}[]} */
function staleHookChecks(paths, harnesses) { /* … */ }
```

Behavior:
1. Build the list of settings files to scan from present harnesses, each carrying **its
   own** pair map:
   - `harnesses.claude.present` → `{ settingsPath: path.join(paths.claudeDir, 'settings.json'), pairs: WD_HOOK_PAIRS.claude }`
   - `harnesses.codex.present` → `{ settingsPath: path.join(paths.codexDir, 'hooks.json'), pairs: WD_HOOK_PAIRS.codex }`
2. For each `{settingsPath, pairs}`: read + `JSON.parse` inside a try (unreadable/invalid →
   skip that file, no line). Let `hooks = settings.hooks` if it is a non-null non-array
   object, else skip.
3. For each `event` key with an array value, for each `group` with an array `group.hooks`,
   for each `h` with a string `h.command`:
   - **Pair gate first:** `const expectedBase = pairs[event];` if `!expectedBase` → skip
     (Wienerdog registers no hook for this event in this file — so a `session-end.sh` under
     `PreToolUse` is skipped outright).
   - `scriptPath = unquoteCommand(h.command)` (see below).
   - `base = scriptPath.replace(/\\/g, '/').split('/').pop()` — normalize separators to
     `/` first, then take the last segment. Do **not** use `path.basename`: on POSIX it
     does not split on backslashes, so a `C:\…\session-end.sh` command would yield the
     whole string and be missed. The regex-split handles both separators on every platform.
   - If `base !== expectedBase` → skip (wrong basename for this event — e.g. a
     `session-start.sh` under `SessionEnd`, or a user's `my-hook.sh`).
   - If `fs.existsSync(scriptPath)` → skip (the script is present — a healthy hook,
     including our current one; we only flag a hook whose target is GONE).
   - Else → **flag**: push
     ``{status:'warn', msg:`possible leftover Wienerdog session hook in ${settingsPath} (${event}): its script is gone, so it fails every session — if you didn't add this hook yourself, remove this entry: ${h.command}`}``.
4. Return all findings (possibly empty).

`unquoteCommand(command)` — inverse of `shellQuoteCommand`:

```js
/** Recover the script path from a hook command. Wienerdog writes single-quoted
 *  forward-slash paths (shellQuoteCommand); undo that. A bare/unquoted command (older
 *  or foreign) is returned as-is. @param {string} command @returns {string} */
function unquoteCommand(command) {
  const c = String(command).trim();
  if (c.length >= 2 && c.startsWith("'") && c.endsWith("'")) {
    return c.slice(1, -1).replace(/'\\''/g, "'");
  }
  return c;
}
```

**2. Wire into `run`.** After the skill-link checks (WP-106) and before
`googleReadinessChecks`:

```js
// Stale/foreign Wienerdog session hooks: a wienerdog-shaped hook whose target script no
// longer exists (e.g. a since-purged temp core merged into the real settings). Read-only;
// warn with a manual-removal hint — we never edit a settings file we did not record.
for (const c of staleHookChecks(paths, harnesses)) check(c.status, c.msg);
```

### Tests (`tests/unit/doctor.test.js`)

Reuse the existing `run`/`tempEnv` helpers. Make Claude present by creating a real
`claudeHome` and setting `env.CLAUDE_CONFIG_DIR = claudeHome` **before** `init --yes` (so
Wienerdog's real, valid hooks are written to `claudeHome/settings.json`). A small helper
to append a hook group to a settings file:

```js
function appendHook(settingsPath, event, command) {
  const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  s.hooks = s.hooks || {};
  s.hooks[event] = s.hooks[event] || [];
  s.hooks[event].push({ matcher: '*', hooks: [{ type: 'command', command, timeout: 10 }] });
  fs.writeFileSync(settingsPath, `${JSON.stringify(s, null, 2)}\n`);
}
```

- **Baseline: valid current hooks only → no leftover-hook warn.** claudeHome + `init`;
  `run(['doctor'], env)`; assert `r.status === 0` and `r.stdout` does **not** match
  `/possible leftover Wienerdog session hook/`.
- **Foreign wienerdog hook, correct pair, missing script → `[warn]`, exit 0.** After
  `init`, append a stale entry pointing at a non-existent temp core:
  ``appendHook(path.join(claudeHome,'settings.json'), 'SessionEnd',
  `'${path.join(root,'gone-temp','wd','bin','session-end.sh')}'`)`` (the exact
  Claude `SessionEnd → session-end.sh` pair). Run `doctor`; assert `r.status === 0` and
  `r.stdout` matches
  `/\[warn\] possible leftover Wienerdog session hook in .*settings\.json \(SessionEnd\): its script is gone/`.
- **Unrelated basename (my-hook.sh), missing → NOT flagged.** Append
  ``appendHook(..., 'SessionEnd', `'${path.join(root,'gone','my-hook.sh')}'`)``. Run
  `doctor`; assert `r.stdout` does **not** match `/possible leftover Wienerdog session hook/`.
- **Right basename, WRONG event → NOT flagged (pair boundary; Finding 3).** Append
  ``appendHook(..., 'PreToolUse', `'${path.join(root,'gone','x','session-end.sh')}'`)`` —
  `session-end.sh` is ours, but Wienerdog never registers a `PreToolUse` hook, so a user's
  missing `PreToolUse/session-end.sh` must NOT be claimed. Run `doctor`; assert `r.stdout`
  does **not** match `/possible leftover Wienerdog session hook/`.
- **Wrong basename for the event → NOT flagged (pair boundary; Finding 3).** Append
  ``appendHook(..., 'SessionEnd', `'${path.join(root,'gone','x','session-start.sh')}'`)``
  — `session-start.sh` under `SessionEnd` is not a pair Wienerdog writes. Assert `r.stdout`
  does **not** match `/possible leftover Wienerdog session hook/`.
- **Codex-side stale hook (Stop → codex-session-end.sh), missing → `[warn]`, exit 0.**
  Create a real `codexHome`, set `env.CODEX_HOME`, `init`, then append a stale entry to
  `codexHome/hooks.json` for event `Stop` with command
  `'…/gone/bin/codex-session-end.sh'` at a non-existent path. Assert `r.status === 0` and a
  matching `[warn] possible leftover Wienerdog session hook in .*hooks\.json \(Stop\)` line.
- **Codex wrong pair (Stop → session-end.sh), missing → NOT flagged.** Append to
  `hooks.json` a `Stop` hook whose script is `…/gone/session-end.sh` (Codex's `Stop` pair
  is `codex-session-end.sh`, not `session-end.sh`). Assert `r.stdout` does **not** match
  `/possible leftover Wienerdog session hook/`.

## Implementation notes & constraints

- **Notice-only; never edit the settings file.** `doctor` prints the exact
  settings-file path, event, and command, and tells the user to remove that entry. It
  does not, and no future part of this WP does, delete the entry. `sync` is not modified
  by this WP.
- **The missing-script test is the whole ownership proof.** Do not flag a
  wienerdog-shaped hook whose script *exists* (that is a healthy hook — including our
  current one, and including a legitimately-relocated core the user is mid-migrating). A
  foreign-but-present hook is ambiguous and left alone by design.
- **Basename allowlist is the only pattern.** Match strictly on the three script
  basenames Wienerdog writes; never on directory substrings like `.wienerdog` (a user
  could legitimately name a dir that). Normalize separators before taking the basename so
  a backslash path resolves correctly.
- **Never throws / never fails.** An unreadable or non-JSON settings file → skip it (no
  line). A stale hook is a `warn`; it must never flip `doctor`'s exit code.
- Depends on **WP-106** only because both edit `src/cli/doctor.js` and
  `tests/unit/doctor.test.js` — land WP-106 first to avoid a merge conflict. No runtime
  dependency on WP-106's code.
- Do not touch `src/adapters/shared.js`, `sync`, or the manifest. Zero new dependencies;
  JSDoc types only.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] No untrusted input reaches a shell or a mutation. The scan reads harness settings
      files (JSON), extracts command strings, unquotes them, and `existsSync`es the
      resulting path — no `spawn`/`exec`, no write. A hook command is printed verbatim
      inside a warn line (control-plane text only); it is never executed by `doctor`. The
      basename allowlist is a fixed `Set` of three literals. Parsing is wrapped so a
      malformed settings file cannot throw out of `doctor`.

## Acceptance criteria

- [ ] A hook matching an EXACT Wienerdog (event, basename) pair — Claude
      `SessionStart→session-start.sh` / `SessionEnd→session-end.sh`, Codex
      `SessionStart→session-start.sh` / `Stop→codex-session-end.sh` — whose target script
      does **not** exist produces a hedged `[warn]` ("possible leftover … if you didn't add
      this hook yourself, remove this entry") naming the settings file, event, and command;
      `doctor` **still exits 0**.
- [ ] Wienerdog's own valid current hooks (script present) produce **no** leftover-hook
      warn.
- [ ] Ownership-boundary negatives are **not** flagged, even with a missing script: an
      unrelated basename (`my-hook.sh`); a Wienerdog basename under an event Wienerdog does
      not register (`PreToolUse/session-end.sh`); a Wienerdog basename under the wrong
      event (`SessionEnd/session-start.sh`); and the wrong Codex pair
      (`Stop/session-end.sh`).
- [ ] The check runs for both Claude (`settings.json`) and Codex (`hooks.json`) when the
      harness is present; an unreadable/absent settings file produces no line and no
      crash.
- [ ] `doctor` performs no filesystem mutation.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern doctor
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Auto-removing the stale hook (`doctor` `--fix`, or a `sync` prune of foreign-path
  hooks). We cannot prove ownership of a hook we never manifest-recorded; a heuristic
  auto-delete of a user-owned settings file is declined for v1 (ADR-0004 reversibility).
  If ever wanted, it is a separate WP with its own ownership design.
- Detecting a foreign wienerdog hook whose script still **exists** (ambiguous with a
  second legitimate install) — not flagged.
- The skill-link target validation — that is **WP-106** (this WP depends on it).
- The half-sandbox root-cause guard — that is **WP-108**.
- Surfacing this in the session digest — separate concern, not scoped here.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/107-doctor-stale-wienerdog-hook-detection`; conventional commits; PR titled
   `feat(doctor): flag stale Wienerdog session hooks whose script is gone (WP-107)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Design-review record

- **Round 1 (2026-07-16, wd-architect self-review — Codex plugin unavailable).** Verified
  `unquoteCommand` as the exact inverse of `shellQuoteCommand` (single-quote wrap + `'\''`
  escaping, `src/adapters/shared.js`), the `settings.hooks[event][].hooks[].command` shape
  for both Claude `settings.json` and Codex `hooks.json`, and the hook basenames against
  `templates/hooks/`. Applied one **P3**: the basename-extraction step contradicted itself
  (`path.basename` does not split backslash paths on POSIX) — rewritten to
  `scriptPath.replace(/\\/g,'/').split('/').pop()`.
- **Round 2 (2026-07-16, genuine Codex adversarial review, orchestrator session).** One
  finding, verified accurate and applied:
  - **P2** — matching on generic basenames under *any* event could flag a user's own hook
    (e.g. a missing `PreToolUse/session-end.sh`) with authoritative "remove this" wording.
    Fixed: matching now requires the **exact per-harness (event → basename) pair**
    Wienerdog registers (`WD_HOOK_PAIRS`: Claude `SessionStart→session-start.sh` /
    `SessionEnd→session-end.sh`; Codex `SessionStart→session-start.sh` /
    `Stop→codex-session-end.sh`), and the warning is **hedged** ("possible leftover … if
    you didn't add this hook yourself, remove this entry") since ownership of a
    foreign/unrecorded hook still can't be proven. Added four ownership-boundary negative
    tests (unrelated basename; Wienerdog basename under a non-registered event; wrong event
    for the basename; wrong Codex pair).
- **Round 3 (2026-07-16, genuine Codex adversarial review, orchestrator session).** The
  round-2 fix confirmed against source — Codex verified the `WD_HOOK_PAIRS` (event →
  basename) pairs match what both adapters (`src/adapters/{claude,codex}.js`) actually
  register. No new findings on this spec.
- **Round 7 cross-check (2026-07-16).** A round-7 finding on the sibling WP-108 (harness
  detected for the guard vs. re-detected at adapter-write time) prompted a check of this
  spec. `doctor` is **read-only** and already uses a **single** `harnesses = detectHarnesses()`
  snapshot for all its checks (including this spec's stale-hook scan); it never writes, so the
  double-detection write race does not apply here. No change.
- **Status:** **Ready** (owner sign-off, 2026-07-16). Codex-clean since round 3, re-confirmed
  by the round-7 cross-check; held at Draft only while the sibling WP-108 completed its
  eleven-round review loop (round 11: APPROVE). Flipped to Ready alongside WP-106/108.
