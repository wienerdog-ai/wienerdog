---
id: WP-062
title: run-job Windows reliability — win32 clean env + taskkill watchdog kill-tree
status: Done
model: opus
size: M
depends_on: []
adrs: [ADR-0018, ADR-0004]
branch: wp/062-runjob-windows-clean-env-and-watchdog
---

# WP-062: run-job Windows reliability — win32 clean env + taskkill watchdog kill-tree

## Context (read this, nothing else)

`wienerdog run-job <name>` (`src/cli/run-job.js`) is the short-lived wrapper the
OS scheduler launches. It turns a raw scheduled fire into a safe run: an explicit
**clean env**, a macOS TCC-guard, a hard **kill-tree watchdog**, teed+rotated
logs, a fail-loud alert, and a `last_success` watermark. Nothing it starts
outlives the job (ADR-0004 — Wienerdog is just files; no daemon).

Wienerdog is adding **Windows scheduled dreaming** (ADR-0018): the nightly dream
will be registered in Windows Task Scheduler and will invoke this same
`run-job dream`. Two of this file's code paths are **POSIX-shaped and will
silently break a scheduled Windows dream**, so they must be fixed *before*
scheduling is turned on (this WP is a dependency of the scheduler-dispatch WP,
WP-064):

1. **`buildCleanEnv` builds a POSIX env.** It joins PATH with `:` (Windows uses
   `;`), lists POSIX dirs (`/opt/homebrew/bin`, `/usr/bin`, …) that don't exist
   on Windows, and carries only `HOME` plus a tiny allowlist — omitting
   `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `SystemRoot`, `TEMP`/`TMP`,
   `PATHEXT`, `ComSpec`, etc. that a Windows child needs. On Windows the dream's
   Claude brain would be unfindable (garbage PATH) or credential-blind (no
   `USERPROFILE`/`APPDATA`). This is the Windows twin of the launchd
   USER/PATH incident (WP-038): only the first scheduled night exercises it.

2. **The watchdog kills the child by process GROUP** with
   `process.kill(-child.pid, 'SIGKILL')`. Windows has no POSIX process groups
   and no negative-PID kill — that call throws (`EINVAL`/`ESRCH`) *inside the
   watchdog's own handler*, so a wedged Windows dream would run unbounded (the
   exact failure the watchdog exists to prevent). The Windows tree-kill is
   `taskkill /PID <pid> /T /F`.

This WP adds win32 branches to both, and only those. `paths.js` is already
Windows-safe (`env.HOME || os.homedir()` → `os.homedir()` reads `USERPROFILE`
when `HOME` is unset) and is **out of scope**. Everything is testable on the
existing POSIX CI fleet via injected `platform` and kill/spawn seams — **never
mock `process.platform`** (the WP-049/051/038 rule: platform lies rot; inject
the varying value).

## Current state

`src/cli/run-job.js` exists and is the file you extend. Exact current shapes:

`buildCleanEnv` (lines 76-103) — POSIX-only:

```js
function buildCleanEnv(paths, name) {
  const env = {
    HOME: paths.home,
    PATH: [
      path.dirname(process.execPath), // node — MUST stay first
      path.join(paths.home, '.local/bin'),
      '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin',
    ].join(':'),
    WIENERDOG_JOB: name,
  };
  const user = resolveUsername();
  if (user) env.USER = user;
  for (const k of ENV_PASSTHROUGH) {         // WIENERDOG_HOME, WIENERDOG_VAULT,
    if (process.env[k]) env[k] = process.env[k]; // CLAUDE_CONFIG_DIR, CODEX_HOME, ANTHROPIC_API_KEY
  }
  return env;
}
```

`buildCleanEnv` is called by `runJob` (line 257) and `defaultSendAlert`
(line 191), and directly by tests as `runjob.buildCleanEnv(paths, 'dream')`.

The watchdog (lines 272-307) spawns the child and, on timeout, group-kills:

```js
const child = spawn(command, args, {
  cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env, shell,
});
// …
timer = setTimeout(() => {
  try {
    process.kill(-child.pid, 'SIGKILL'); // kill the process GROUP → whole tree
  } catch { /* already gone */ }
  reject(new WienerdogError(`job "${name}" timed out after ${job.timeoutMinutes} min`));
}, timeoutMs);
```

`runJob` already threads `opts.platform` (defaulting to `process.platform`) into
`tccguard.guard(...)` — reuse that same `opts.platform` here.

`tests/unit/scheduler-runjob.test.js` exists and calls `buildCleanEnv` as a pure
function; it asserts inline (there is no golden-file dir for the scheduler).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | win32 branch in `buildCleanEnv`; extract + platform-branch the watchdog kill into an exported `killProcessTree`; win32 spawn opts |
| modify | tests/unit/scheduler-runjob.test.js | add win32-shape env tests + `killProcessTree` both-branch tests |

### Exact contracts

**1. `buildCleanEnv(paths, name, platform = process.platform)`** — add a third
param defaulting to `process.platform`. `runJob` and `defaultSendAlert` pass the
run's platform (`const platform = opts.platform || process.platform;` in
`runJob`; `defaultSendAlert` may keep the default). Behavior:

- **Non-win32 (unchanged, byte-for-byte):** exactly today's output. The POSIX
  branch must not change at all.
- **win32:**
  ```js
  const env = {
    HOME: paths.home,          // harmless on Windows; Git-Bash respects it
    USERPROFILE: paths.home,   // deterministic homedir for children / os.homedir()
    PATH: [
      path.dirname(process.execPath),                     // node — MUST stay first
      path.join(paths.home, '.local', 'bin'),             // Claude Code native install (Windows)
      path.join(process.env.APPDATA || path.join(paths.home, 'AppData', 'Roaming'), 'npm'), // npm-global claude.cmd
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32'),
      process.env.SystemRoot || 'C:\\Windows',
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0'),
    ].join(';'),
    WIENERDOG_JOB: name,
  };
  ```
  Then carry through, **only if present in `process.env`**, this Windows-essential
  allowlist (in addition to the existing `ENV_PASSTHROUGH`):
  `APPDATA`, `LOCALAPPDATA`, `SystemRoot`, `windir`, `TEMP`, `TMP`, `PATHEXT`,
  `ComSpec`, `SystemDrive`, `HOMEDRIVE`, `HOMEPATH`, `ProgramData`,
  `ProgramFiles`, `ProgramFiles(x86)`, `PUBLIC`, `USERNAME`, `USERDOMAIN`,
  `PROCESSOR_ARCHITECTURE`, `NUMBER_OF_PROCESSORS`.
  Define this list as a module const `WIN_ENV_PASSTHROUGH` next to
  `ENV_PASSTHROUGH`. On win32 do **not** set `USER` (that's a POSIX/Keychain
  concern); `USERNAME`/`USERDOMAIN` come through the passthrough instead.
  The existing `ENV_PASSTHROUGH` loop still runs on both platforms.

  Note the explicit `USERPROFILE: paths.home` line sets it before the passthrough
  loop; the passthrough must **not** overwrite it (skip `USERPROFILE` in the
  win32 passthrough list — it is set explicitly above; it is not in the list
  anyway, keep it that way).

**2. `killProcessTree(pid, platform, seams = {})`** — extract the kill into an
exported pure-ish helper so both branches are CI-testable on POSIX. Signature &
behavior:

```js
/** Kill a job's child process tree. POSIX: signal the process GROUP (negative
 *  pid). Windows: taskkill /PID <pid> /T /F (no POSIX process groups exist).
 *  Best-effort — never throws (the child may already be gone).
 *  @param {number} pid           child.pid
 *  @param {NodeJS.Platform} platform
 *  @param {{kill?: typeof process.kill, spawnSync?: typeof spawnSync}} [seams]  test injection */
function killProcessTree(pid, platform, seams = {}) {
  const kill = seams.kill || process.kill;
  const sspawn = seams.spawnSync || spawnSync;
  try {
    if (platform === 'win32') {
      sspawn('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      kill(-pid, 'SIGKILL');   // process GROUP → whole tree
    }
  } catch {
    // already gone / not killable — best-effort
  }
}
```
Export it in `module.exports`. The watchdog's timeout handler calls
`killProcessTree(child.pid, platform, opts)` (passing `opts` as the seams object
is fine — `opts.kill`/`opts.spawnSync` are undefined in production so the real
implementations are used; tests can inject them). `platform` here is the same
`opts.platform || process.platform` computed in `runJob`.

**3. Windows spawn opts.** In `runJob`'s `spawn(command, args, {...})`, make the
child options platform-aware:
- `detached: platform !== 'win32'` — on Windows `detached:true` only spawns a
  visible console window and buys nothing (tree-kill uses the PID table, not a
  process group).
- add `windowsHide: true` — suppress the console-window flash on scheduled runs.
Everything else (`cwd`, `stdio`, `env`, `shell`) is unchanged.

### Example input → output (win32 buildCleanEnv)

Given `paths.home = 'C:\\Users\\Ada'`, `process.execPath =
'C:\\Program Files\\nodejs\\node.exe'`, `process.env.APPDATA =
'C:\\Users\\Ada\\AppData\\Roaming'`, `process.env.SystemRoot = 'C:\\Windows'`,
`process.env.USERNAME = 'Ada'`, name `'dream'`:

- `env.PATH` === `'C:\\Program Files\\nodejs;C:\\Users\\Ada\\.local\\bin;C:\\Users\\Ada\\AppData\\Roaming\\npm;C:\\Windows\\System32;C:\\Windows;C:\\Windows\\System32\\WindowsPowerShell\\v1.0'`
- `env.USERPROFILE` === `'C:\\Users\\Ada'`, `env.HOME` === `'C:\\Users\\Ada'`
- `env.USERNAME` === `'Ada'`, `env.WIENERDOG_JOB` === `'dream'`
- `env.USER` is **absent**

## Implementation notes & constraints

- No new npm deps. Plain Node ≥ 18, JSDoc types only.
- The POSIX branch of `buildCleanEnv` must be **byte-identical** to today —
  diff it to confirm you only *added* a win32 branch, not reshaped the POSIX one.
- Do not touch `resolveCommand` (skill-job `claude` resolution on Windows is a
  separate, later concern — the dream uses `builtin:dream` = `node.exe` +
  absolute `.js`, which resolves fine). Out of scope here.
- Do not touch `paths.js` (already Windows-safe) or the darwin catch-up backstop
  at line 318 (`if (process.platform === 'darwin')` — Windows needs no per-run
  backstop; its catch-up task is installed once by the scheduler WP).
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR. Do NOT expand scope.

## Security checklist

- [ ] `pid` flows into a `taskkill` argv as `String(pid)`; `child.pid` is an
      integer from Node, never untrusted text — no injection surface. `name`
      flows only into `WIENERDOG_JOB` (an env value, not a path/command). No
      untrusted identifier reaches a filesystem path or shell in this WP, so no
      anchored-pattern validation is required here.

## Acceptance criteria

- [ ] `buildCleanEnv(paths, 'dream', 'win32')` returns the Windows shape above:
      `;`-separated PATH with node dir first, `USERPROFILE` set, no `USER`, and
      the Windows-essential passthrough vars carried when present.
- [ ] `buildCleanEnv(paths, 'dream', 'linux'|'darwin')` (and the 2-arg call) is
      byte-identical to the pre-change POSIX output (existing tests still pass).
- [ ] `killProcessTree(pid, 'win32', seams)` invokes
      `spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'])` and nothing else.
- [ ] `killProcessTree(pid, 'linux', seams)` invokes `kill(-pid, 'SIGKILL')` and
      never `taskkill`.
- [ ] `killProcessTree` never throws when its seam throws.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern runjob
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Windows Task Scheduler registration / XML — WP-063 (generators) and WP-064
  (dispatch).
- `resolveCommand` / skill-routine `claude` resolution on Windows.
- Any change to `paths.js`, `tccguard.js`, `manifest.js`, `schedule.js`,
  `generators.js`.
- A per-run Windows catch-up backstop in the success path (the scheduler WP
  installs the catch-up task once).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch from frontmatter; conventional commits; PR titled
   `fix(run-job): Windows clean env + taskkill watchdog (WP-062)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
