---
id: WP-076
title: win32 clean-env PATH includes git (nightly dream no longer ENOENTs) — ship-blocker
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0018]
branch: wp/076-runjob-win32-git-on-clean-path
---

# WP-076: win32 clean-env PATH includes git (nightly dream no longer ENOENTs) — ship-blocker

## Context (read this, nothing else)

Wienerdog runs the nightly "dream" (memory-consolidation) job via
`wienerdog run-job dream`, a short-lived wrapper the OS scheduler launches. Because
a scheduled child (Windows Task Scheduler / launchd / systemd) inherits almost no
environment, `run-job` deliberately builds a **clean, deterministic env from
scratch** — it constructs `PATH` and `HOME` explicitly and carries through only a
small allowlist of variables. This determinism is a design invariant, not an
accident: the clean env must not depend on whatever the launching context happened
to expose (see `run-job.js`'s `WIN_ENV_PASSTHROUGH` comment block, lines 38–43).

The dream's git operations (`spawnSync('git', ['-C', vaultDir, …])` in
`src/core/dream/validate.js`) resolve `git` **from that clean PATH**. On Windows the
constructed PATH lists node, `~\.local\bin`, `%APPDATA%\npm`, `System32`,
`%SystemRoot%`, and WindowsPowerShell — but **no git directory**. Windows has no
standard "bin" folder where git lives; Git for Windows installs to its own dir. So
`git` ENOENTs and **every** dream exits 1 within seconds, forever, on Windows.

**Field evidence (verified).** External tester (Windows 11 Pro hu-HU, non-elevated;
wienerdog 0.6.5; Git for Windows at `C:\Program Files\Git\cmd`, on the machine-level
PATH, installed weeks before Wienerdog). Every scheduled and manual
`wienerdog run-job dream` produced a single log line and exit 1:

```
wienerdog: git could not run (rev-parse): spawnSync git ENOENT
```

The job never once succeeded since install; no dream commit was ever created. After
the tester added `%ProgramFiles%\Git\cmd` to the win32 PATH array, the scheduled
task completed end-to-end: dream commit created, `last_success` watermark written,
alert cleared. **This is a ship-blocker.** The tester patched his *vendored* 0.6.5
copy under `~\.wienerdog\app\`; the next `wienerdog update`/`sync` overwrites that
copy, so the fix cannot durably live on the user's machine — it must ship upstream in
the next release.

**Design principle this WP establishes:** *the clean PATH must cover every binary
Wienerdog itself spawns.* Those are: `node` (execPath dir), `claude` (`~\.local\bin`,
`%APPDATA%\npm`), PowerShell (System32/…), and **`git`**. The POSIX branch already
satisfies this by luck — its hardcoded `/usr/bin`, `/opt/homebrew/bin`, `/usr/local/bin`
list happens to cover every typical git install location — so the POSIX branch needs
no change. The win32 branch must name git's install dirs **explicitly**.

**Product invariants that bind this WP.** Wienerdog is just files; it never starts a
process that outlives its job (ADR-0004). This WP only edits the string that becomes
`PATH` for the (already-existing, already-short-lived) job child and enriches one
error message — no daemon, no new dependency, no process. Windows scheduled dreaming
(ADR-0018) is the feature this reliability fix completes.

## Current state

`src/cli/run-job.js` `buildCleanEnv(paths, name, platform)` (exported; takes an
explicit `platform` arg so tests exercise the win32 branch on POSIX **without**
mocking `process.platform`). The win32 branch (lines 106–132) builds PATH as exactly
these six entries, `;`-joined:

```js
PATH: [
  path.dirname(process.execPath),                          // node — MUST stay first
  path.join(paths.home, '.local', 'bin'),                  // Claude Code native install (Windows)
  path.join(process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'), 'npm'),
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
  process.env.SystemRoot || 'C:\\Windows',
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'),
].join(';'),
```

`WIN_ENV_PASSTHROUGH` (lines 44–64) already carries `ProgramFiles` and `LOCALAPPDATA`
through into the child env, and `buildCleanEnv` may freely read them from
`process.env` at build time (both fall back to well-known defaults below when unset).

`src/core/dream/validate.js` `git(vaultDir, args, opts)` (lines 29–38) is the internal
git runner. Its ENOENT surface is:

```js
const res = spawnSync('git', ['-C', vaultDir, ...args], { encoding: 'utf8' });
if (res.error) {
  throw new WienerdogError(`git could not run (${args[0]}): ${res.error.message}`);
}
```

This function is **not exported** and `spawnSync` is not seamed, so this branch has
no unit test; the message change below is verified by code-read + lint (its real
payoff — the ENOENT ceasing to happen — is covered by the PATH fix's manual gate).

Existing test: `tests/unit/scheduler-runjob.test.js`. Its win32 test
(`buildCleanEnv(win32) builds the ;-PATH Windows shape…`, ~line 150) **pins the PATH
to exactly six entries** via `assert.equal(pathDirs.length, 6, 'exactly the six win32
PATH entries — no POSIX dirs appended')` and index assertions on `pathDirs[2..5]`.
This test MUST be updated by this WP (the count and the two new indices). Injected env
keys in that test today: `APPDATA`, `SystemRoot`, `LOCALAPPDATA`, `USERNAME`,
`PATHEXT`, `WIENERDOG_SECRET_TEST` (note: `ProgramFiles` is **not** injected — this WP
adds it). The POSIX byte-identical test (~line 222) and the fallback test (~line 200,
asserts only `pathDirs[2]`/`pathDirs[3]`, no length) are unaffected.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | append the two Git-for-Windows dirs to the win32 clean-env PATH; add the "cover every binary we spawn" principle comment |
| modify | src/core/dream/validate.js | enrich the `git()` ENOENT error message to be plain-language actionable (ENOENT case only) |
| modify | tests/unit/scheduler-runjob.test.js | update the win32 PATH test: inject `ProgramFiles`, assert the two new git entries, change `pathDirs.length` 6 → 8 |

### Exact contracts

**1. `src/cli/run-job.js` — win32 PATH.** Append exactly two git dirs after the
existing six (indices 6 and 7). Node stays index 0. Do not reorder existing entries.

```js
PATH: [
  path.dirname(process.execPath),                          // 0 node — MUST stay first
  path.join(paths.home, '.local', 'bin'),                  // 1 Claude Code native install (Windows)
  path.join(process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'), 'npm'), // 2 npm-global claude.cmd
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),                        // 3
  process.env.SystemRoot || 'C:\\Windows',                                               // 4
  path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'), // 5
  // git — the clean PATH must cover EVERY binary Wienerdog itself spawns (node,
  // claude, powershell, git). Windows has no standard bin dir, so name git's install
  // dirs explicitly: an all-users (admin) Git-for-Windows install lands in
  // %ProgramFiles%\Git\cmd; a per-user ("only for me") install lands in
  // %LOCALAPPDATA%\Programs\Git\cmd. Without these the nightly dream's
  // spawnSync('git', …) ENOENTs and every dream exits 1 (WP-076). A PATH dir that
  // doesn't exist on a given machine is simply ignored by the OS, so listing both is
  // safe. The POSIX branch already covers git via /usr/bin, /opt/homebrew/bin, etc.
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd'),              // 6
  path.join(process.env.LOCALAPPDATA || path.join(paths.home, 'AppData', 'Local'), 'Programs', 'Git', 'cmd'), // 7
].join(';'),
```

Fallbacks mirror the existing convention (`process.env.X || '<well-known default>'`).
`ProgramFiles` → `'C:\\Program Files'`; `LOCALAPPDATA` → `path.join(paths.home,
'AppData', 'Local')` (same fallback shape the `%APPDATA%\npm` entry uses).

**2. `src/core/dream/validate.js` — actionable ENOENT message.** Enrich ONLY the
`res.error` branch, and add the hint ONLY when the error is ENOENT (git genuinely not
found). Do not change the throw type, the non-error path, or any other message. Use a
platform-neutral install URL (this branch can fire on any OS):

```js
if (res.error) {
  const hint =
    res.error.code === 'ENOENT'
      ? ' — git was not found on the job PATH. Install git (https://git-scm.com/downloads)' +
        ' or make sure it is on your PATH, then re-run the dream.'
      : '';
  throw new WienerdogError(`git could not run (${args[0]}): ${res.error.message}${hint}`);
}
```

**3. `tests/unit/scheduler-runjob.test.js` — win32 PATH assertions.** In the win32
test: add `ProgramFiles` to the saved/injected env keys and set it to a deterministic
value (e.g. `process.env.ProgramFiles = 'C:\\Program Files';`). Then change the length
assertion and add the two index assertions:

```js
assert.equal(pathDirs[6], path.join(process.env.ProgramFiles, 'Git', 'cmd'));
assert.equal(
  pathDirs[7],
  path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'cmd')
);
assert.equal(pathDirs.length, 8, 'six base win32 entries + two Git-for-Windows dirs');
```

(`LOCALAPPDATA` is already injected in that test as `'C:\\Users\\Ada\\AppData\\Local'`.)
Restore `ProgramFiles` in the test's `finally`/cleanup alongside the other saved keys.

## Implementation notes & constraints

- **Do NOT touch the POSIX branch.** It already covers git; changing it is out of
  scope and would churn the byte-identical POSIX test.
- **Only two git dirs.** `%ProgramFiles%\Git\cmd` (admin/all-users) and
  `%LOCALAPPDATA%\Programs\Git\cmd` (per-user) are the two real-world Git-for-Windows
  install locations and match the field-verified fix. `%ProgramFiles(x86)%\Git\cmd`
  (32-bit git on 64-bit Windows) is **deliberately omitted** — Git for Windows is
  64-bit by default and that combination is vanishingly rare; a future WP can add it
  if a report ever shows it. Do not add it now.
- The `git.exe` binary lives in `<install>\cmd\` (that is the dir Git for Windows adds
  to PATH), not `\bin` — use `\cmd`.
- Zero new dependencies; no build step (CLAUDE.md).
- When uncertain, choose the simpler option and record it under "Decisions made" in
  the PR. Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] No untrusted identifier is introduced. The two appended PATH segments are built
      from `process.env.ProgramFiles` / `process.env.LOCALAPPDATA` (OS-provided, not
      user-supplied) plus fixed literals `'Git'`, `'cmd'`, `'Programs'`. No new value
      flows into a shell command or a filesystem write path.

## Acceptance criteria

- [ ] `buildCleanEnv(paths, 'dream', 'win32').PATH` split on `;` has exactly 8 entries;
      entry 0 is the node dir; entries 6 and 7 are `%ProgramFiles%\Git\cmd` and
      `%LOCALAPPDATA%\Programs\Git\cmd` (with the documented fallbacks).
- [ ] The POSIX branch output is byte-identical to before (existing POSIX test green).
- [ ] `validate.js`'s `git()` ENOENT throw includes the plain-language install hint;
      the non-ENOENT error path and all other git messages are unchanged.
- [ ] Running `buildCleanEnv` twice with the same env is idempotent (pure function;
      no state).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern buildCleanEnv
npm test
npm run lint
```

### Manual Windows verification (owner/tester gate — CI has no Windows runner)

CI cannot exercise a real Windows git resolution. Before merge, on a **stock Windows
machine with Git for Windows installed** (e.g. the reporting tester's, Git at
`C:\Program Files\Git\cmd`), confirm from a build of this branch:

1. `wienerdog run-job dream` completes and exits 0 (no `spawnSync git ENOENT`); a
   dream commit is created and the per-run log under `~\.wienerdog\logs\dream\` shows
   success.
2. `~\.wienerdog\state\` shows the dream's `last_success` watermark advanced and any
   prior fail-loud alert cleared.

Paste the console/log output into the PR under "Manual verification" (or explicitly
defer to the owner/tester with these steps, per the WP-073/074 precedent).

## Out of scope (do NOT do these)

- The SessionEnd hook backslash-path fix — **WP-077**.
- Any change to the POSIX PATH branch, the passthrough allowlists, the watchdog, or
  the fail-loud/alert machinery.
- Persisting a resolved git path in config, or scanning the parent PATH for git at
  env-build time (both rejected: see Decisions — they reintroduce non-determinism the
  clean env exists to avoid; a scheduled child's parent PATH is nearly empty anyway).
- Adding `%ProgramFiles(x86)%\Git\cmd` (deliberately omitted, above).

## Decisions already made (record, do not re-litigate)

- **Chosen: hardcode well-known Git-for-Windows dirs (option a).** Rejected: (b)
  resolve git from the parent PATH at env-build time — a scheduled Task-Scheduler
  child inherits a nearly-empty PATH, so git often isn't there to find, and it
  reintroduces exactly the launching-context dependency the clean env is designed to
  eliminate; (c) resolve+persist git's dir at init/sync time — adds config surface,
  a migration, and staleness if git moves, for no benefit over hardcoding the two
  canonical install dirs. Option (a) is deterministic and mirrors the POSIX branch's
  own hardcoded-dirs philosophy.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body. The manual
   Windows check is completed or explicitly deferred to the owner/tester with the
   reproduction steps above.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(run-job): win32 clean-env PATH includes git (WP-076)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
