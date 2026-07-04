---
id: WP-038
title: Harden run-job clean env and log rotation; capture brain stderr tail
status: In-Review
model: opus
size: M
depends_on: [WP-020]
adrs: [ADR-0004]
branch: wp/038-runjob-production-hardening
---

# WP-038: Harden run-job clean env and log rotation; capture brain stderr tail

## Context (read this, nothing else)

Wienerdog registers OS-native scheduled jobs (launchd on macOS, systemd on
Linux). The OS launches each fire as `wienerdog run-job <name>` — a short-lived
wrapper that builds an explicit clean environment, guards macOS protected
folders, runs the job under a kill-tree watchdog, tees+rotates logs, fails loud
on error, and records a `last_success` watermark. **Iron rule (ADR-0004):
Wienerdog is just files — nothing it starts outlives its job. This WP adds no
process, daemon, or timer; it only changes how the wrapper builds its env and
prunes its own log files.**

On the first real scheduled night (2026-07-04, 03:30 launchd fire), the dream
job failed silently and retried 8 times over 10 hours. Three of the six root
causes are in the run-job wrapper's clean-room environment and log handling —
none in the dream logic. This WP fixes them. The dream job's process tree is:

```
launchd → `wienerdog run-job dream`            (this WP's file, run-job.js)
  └─ spawns `node wienerdog dream --yes`        (dream.js; stdout+stderr → the run-job per-run log)
       └─ spawns `claude -p /wienerdog-dream …` (the "brain"; its stdout+stderr → a SEPARATE daily log)
```

The three gaps this WP closes:

1. **Clean-env PATH omits `~/.local/bin`.** That is the Claude Code native
   installer's default location. launchd children inherit almost no env, so the
   wrapper builds `PATH` from a hardcoded list that lacks it → `spawn claude
   ENOENT` on any standard native install. (Live evidence: the per-run log held
   `Error: spawn claude ENOENT … path: 'claude'`.)

2. **Clean-env missing `USER`.** Claude Code's Keychain credential lookup fails
   with "Not logged in · Please run /login" when `USER` is unset — which it is in
   a launchd clean env. A two-line hotfix adding `USER: os.userInfo().username`
   is **already committed on main**; this WP formalizes it with tests and hardens
   the `os.userInfo()` throw case (some exotic environments — a UID with no
   passwd entry — make it throw, which would crash the whole job).

3. **`rotateLogs` destroys error evidence by lexical sort.** It keeps the newest
   14 `*.log` by lexical filename sort. The brain's daily output log is named
   `YYYY-MM-DD.log`; the wrapper's per-run logs are `YYYY-MM-DDT…Z.log`. Since
   `.` (0x2E) sorts below `T` (0x54), `2026-07-04.log` sorts *after* same-day run
   stamps in descending order — so once >14 run stamps pile up (exactly what 8
   failed retries produce), rotation deletes the daily log: the only file holding
   the brain's stderr. During the incident this destroyed the API-drop error
   text mid-investigation.

Additionally, this WP begins **surfacing the brain's stderr tail** so a failure
is diagnosable without opening the daily log. The brain's stderr currently goes
only to the daily log; the wrapper's per-run log shows only the terse
`dream brain exited N`. This WP makes the brain-spawn helper expose a bounded
tail of the brain's stderr on its completion result. WP-039 (which owns
`dream.js`) consumes that tail to enrich the `dream brain exited N` message so it
flows into the per-run log and the fail-loud alert. **The two halves of
"surface brain stderr" are split across WP-038 (capture, here) and WP-039
(surface into the dream message) deliberately, to keep each WP's file set and
tests self-contained.**

## Current state

### `src/cli/run-job.js` — `buildCleanEnv` (committed, incl. the USER hotfix)

```js
/** Env vars carried through from the launching env into the clean job env. */
const ENV_PASSTHROUGH = [
  'WIENERDOG_HOME', 'WIENERDOG_VAULT', 'CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'ANTHROPIC_API_KEY',
];

function buildCleanEnv(paths, name) {
  const env = {
    HOME: paths.home,
    // claude's Keychain credential lookup fails ("Not logged in") without USER.
    USER: os.userInfo().username,
    PATH: [
      path.dirname(process.execPath), // node
      '/opt/homebrew/bin',
      '/usr/local/bin', // common claude/codex install dirs
      '/usr/bin',
      '/bin',
      '/usr/sbin',
      '/sbin',
    ].join(':'),
    WIENERDOG_JOB: name, // WP-018's send resolves the routine from this
  };
  for (const k of ENV_PASSTHROUGH) {
    if (process.env[k]) env[k] = process.env[k];
  }
  return env;
}
```

`paths.home` is `env.HOME || os.homedir()` (from `src/core/paths.js`).
`os` is `require('node:os')`; `path` is `require('node:path')`.

### `src/cli/run-job.js` — `rotateLogs` (the defect)

```js
/** How many per-run *.log files to keep in a job's log dir. */
const LOG_KEEP = 14;

/** Keep only the newest LOG_KEEP *.log files in `dir` (ISO stamps sort lexically). */
function rotateLogs(dir) {
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.log'));
  } catch {
    return;
  }
  files.sort().reverse(); // newest run stamp first
  for (const f of files.slice(LOG_KEEP)) {
    try {
      fs.rmSync(path.join(dir, f), { force: true });
    } catch {
      // best-effort rotation
    }
  }
}
```

The per-run stamp is produced by `runStamp()`:
`new Date().toISOString().replace(/[:.]/g, '-')` → e.g. `2026-07-04T08-00-04-514Z`,
so per-run log files are `2026-07-04T08-00-04-514Z.log`. The dream daily log is
`YYYY-MM-DD.log`; launchd's redirect files are `launchd.out.log` /
`launchd.err.log`. All four kinds share the `logs/dream/` directory.

### `src/core/dream/brain.js` — `spawnBrain` (the capture point)

```js
const child = spawn(command, args, {
  cwd: vaultDir, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv,
});

// Tee child output to the caller's log stream (do not close it — the caller owns it).
if (logStream) {
  if (child.stdout) child.stdout.pipe(logStream, { end: false });
  if (child.stderr) child.stderr.pipe(logStream, { end: false });
}

const done = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, durationMs: Date.now() - startedAt }));
});

return { child, done };
```

`spawnBrain` is exercised in `tests/unit/dream-brain.test.js` and driven in
production by `src/cli/dream.js` (not touched here). A test seam
`WIENERDOG_DREAM_CMD` replaces `claude`/`codex` with a fake executable.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/cli/run-job.js | `buildCleanEnv` PATH + USER hardening; `rotateLogs` rewrite |
| modify | src/core/dream/brain.js | `spawnBrain` captures a bounded stderr tail; expose on `done` |
| modify | tests/unit/scheduler-runjob.test.js | clean-env assertions; rotation regression; stderr-in-fail-loud |
| modify | tests/unit/dream-brain.test.js | `done` resolves `stderrTail` on nonzero exit |

### Exact contracts

**`buildCleanEnv(paths, name)` — PATH.** Insert `path.join(paths.home,
'.local/bin')` into the `PATH` array **immediately after the Node dir** (index 1),
before the Homebrew/system dirs:

```js
PATH: [
  path.dirname(process.execPath),        // node — MUST stay first so the right node resolves
  path.join(paths.home, '.local/bin'),   // Claude Code native installer default (per-user)
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
].join(':'),
```

Ordering rationale (encode this in a code comment, do not leave it implicit): a
native `curl … | bash` Claude install lands in `~/.local/bin` and carries the
logged-in subscription credentials that ADR-0009 relies on; placing the per-user
native path ahead of Homebrew/system makes that install authoritative, and it
matches the incident's manual workaround (symlinking a native binary *into*
Homebrew because Homebrew lacked it). The Node dir must remain first. Use
`path.join(paths.home, '.local/bin')` — an absolute path — never a `~`-string
(launchd/systemd do not expand `~`).

**`buildCleanEnv(paths, name)` — USER.** Replace the unguarded
`USER: os.userInfo().username` with a resolution that never throws:

```js
/** Resolve the login username for the clean env. os.userInfo() throws on exotic
 *  environments (a UID with no passwd entry); fall back to env, then omit. */
function resolveUsername() {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USER || process.env.LOGNAME || null;
  }
}
```

In `buildCleanEnv`, set `USER` only when resolvable (do not set it to `undefined`
/ `null`, which would inject the string `"undefined"` or drop the key
inconsistently):

```js
const env = { HOME: paths.home, PATH: /* … */, WIENERDOG_JOB: name };
const user = resolveUsername();
if (user) env.USER = user;
```

Export `resolveUsername` from the module so the throw path is testable.

**`rotateLogs(dir)` — evidence-preserving rewrite.** Rotate ONLY per-run stamp
files; never touch the daily brain log or launchd redirect logs. This is
deterministic (no mtime — mtime ties are non-deterministic and the daily log's
mtime is stale during an ENOENT pile-up where the brain never wrote it).

```js
/** Per-run log basename shape produced by runStamp(): 2026-07-04T08-00-04-514Z.log */
const RUN_STAMP_LOG_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log$/;

/** Keep only the newest LOG_KEEP per-run stamp logs in `dir`. The dream daily log
 *  (YYYY-MM-DD.log) and launchd.*.log are the brain's error-evidence sink and are
 *  NEVER rotated (that lexical-sort deletion destroyed evidence mid-incident). */
function rotateLogs(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return;
  }
  const candidates = files.filter((f) => RUN_STAMP_LOG_RE.test(f));
  candidates.sort().reverse(); // ISO run stamps: lexical == chronological, newest first
  for (const f of candidates.slice(LOG_KEEP)) {
    try {
      fs.rmSync(path.join(dir, f), { force: true });
    } catch {
      // best-effort rotation
    }
  }
}
```

Update the `LOG_KEEP` docstring / the `rotateLogs` comment accordingly.

**`spawnBrain(o)` — expose `stderrTail` on `done`.** Attach a bounded rolling
buffer to `child.stderr` (in addition to the existing tee to `logStream`; both
consumers receive the chunks in flowing mode). Cap it at the last 4096 bytes.
Resolve `done` with the tail on close:

```js
const STDERR_TAIL_MAX = 4096;
let stderrTail = '';
if (child.stderr) {
  child.stderr.on('data', (chunk) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-STDERR_TAIL_MAX);
  });
}
// … keep the existing `.pipe(logStream, { end: false })` for stdout and stderr …

const done = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, durationMs: Date.now() - startedAt, stderrTail }));
});
```

The `done` result type becomes `{code:number|null, durationMs:number,
stderrTail:string}`. Update the JSDoc `@returns`. On a spawn `error` (ENOENT),
`done` still rejects unchanged — there is no stderr to capture; that path is out
of scope here (gap 2's PATH fix removes the ENOENT cause).

## Implementation notes & constraints

- No new npm dependencies; plain Node ≥ 18; JSDoc types only (CLAUDE.md).
- Do NOT change `dream.js`, `validate.js`, `failLoud`, or the fail-loud/alert
  mechanism — those are WP-039/WP-041. This WP only makes `brain.js` *expose*
  the tail; consuming it in the `dream brain exited N` message is WP-039.
- Keep `LOG_KEEP = 14`. This WP intentionally changes rotation semantics: the
  daily log and `launchd.*.log` are now OUTSIDE the keep-count and always
  preserved. The existing rotation test asserted `launchd.out.log` counts toward
  the 14 — that assertion must be replaced (see below); this behavior change is
  the fix, not a regression.
- `resolveUsername`'s throw path is tested by temporarily monkeypatching
  `os.userInfo` on the shared `node:os` singleton (save/restore in a `finally`).
  If you prefer another seam, choose the simpler one and record it under
  "Decisions made".

## Acceptance criteria

- [ ] `buildCleanEnv().PATH` contains `<home>/.local/bin` at index 1 (right after
      the Node dir) and still contains the Node dir at index 0.
- [ ] `buildCleanEnv().USER === os.userInfo().username` in a normal environment.
- [ ] When `os.userInfo()` throws, `buildCleanEnv` does not throw and `USER`
      falls back to `process.env.USER || process.env.LOGNAME`, or is absent if
      neither is set.
- [ ] `rotateLogs` on a dir with 20 run-stamp logs + `2026-07-04.log` +
      `launchd.err.log` + `launchd.out.log` leaves exactly 14 run-stamp logs AND
      all three non-run-stamp logs; the daily log survives, the oldest run stamps
      are deleted.
- [ ] `spawnBrain`'s `done` resolves `{code, durationMs, stderrTail}` and
      `stderrTail` contains the brain's stderr text on a nonzero exit.
- [ ] A run-job whose child writes to stderr and exits nonzero passes that stderr
      tail into the fail-loud alert body.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'scheduler-runjob'
npm test -- --test-name-pattern 'dream-brain'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Dirty-vault pre-commit, crash recovery, and consuming `stderrTail` in the
  `dream brain exited N` message — **WP-039**.
- Persistent failure alerts / `alerts.jsonl` / digest alert block — **WP-041**.
- Note-update provenance in the dream skill — **WP-040**.
- Prettifying the raw ENOENT spawn-error stack — not needed once the PATH fix
  removes the ENOENT cause (note under "Discovered issues" if you disagree).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/038-runjob-production-hardening`; conventional commits;
   PR titled `fix(run-job): clean-env + rotation + brain stderr tail (WP-038)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
