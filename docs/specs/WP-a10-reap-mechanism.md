---
id: WP-a10-reap-mechanism
title: Reap the findable descendant tree to quiescence on every exit path — authoritative process table (no bare ps), brain-PID hand-up, kill–rescan loop
status: Draft
model: opus
size: M
depends_on: [WP-155, WP-157]
adrs: [ADR-0004, ADR-0028, ADR-0030]
epic: audit-a10
---

# WP-a10-reap-mechanism: One supervisor that reaps real descendants to quiescence (audit A10, mechanism + wiring)

## Context (read this, nothing else)

Wienerdog runs its nightly **dream** (memory consolidation) as a short-lived
scheduled job. **IRON RULE (ADR-0004): Wienerdog is just files** — a job's
children must **never** outlive it. On timeout — or if the middle process dies —
the supervisor must guarantee the child tree is gone before it returns; a brain
that keeps running past the deadline is an ADR-0004 violation and burns the
machine's resources unattended.

The 2026-07-15 audit action **A10** ("one supervisor/process group and reliable
timeout cleanup") requires:

> - "Remove the double-detached timeout race. Use one supervisor-owned process
>   group **or** an inner timeout strictly shorter than an outer supervisor which
>   can enumerate/kill real descendants."
> - "Test normal children plus `setsid`/double-fork escape attempts; after
>   timeout no descendant remains."

**Code reality (verified 2026-07-19 at 08d898a; this is half-done — close the
rest).** Since WP-141, `run-job.js` is the **single timeout authority** for a
routine and its `killProcessTree` POSIX-group-kills (`kill(-pid, SIGKILL)`) /
win32 `taskkill /T /F`. Three concrete gaps remain on the **`builtin:dream`**
path:

1. **The double-detach race.** When the scheduler fires `builtin:dream`, there
   are **two nested, independently-detached watchdogs**. The outer
   `src/cli/run-job.js` spawns the child `node …/wienerdog.js dream --yes`
   `detached` (its own group, "group A") and, on timeout, calls
   `killProcessTree(child.pid)` → `kill(-A)`. That child, `src/cli/dream.js`,
   spawns the real `claude` brain **`detached: true`** — its **own** group,
   "group B" (`src/core/dream/brain.js:191`) — and installs its own inner
   watchdog that on timeout does `process.kill(-child.pid, 'SIGKILL')` →
   `kill(-B)` (`src/cli/dream.js:126`). The brain is in **group B**, not group A,
   so `kill(-A)` **never reaches it** — only the inner watchdog can.

2. **A middle-process death fires NO cleanup at all.** `run-job`'s completion
   promise resolves on the child's `'close'` event and its `finally` clears the
   watchdog timer (`run-job.js:589–604`). So if the middle `dream.js` dies for
   any reason (crash, OOM, SIGKILL), the inner watchdog's timer dies with its
   process before it fires, `run-job` sees `'close'`, clears its own timer, and
   **reaps nothing** — the brain (group B) reparents to `init` and keeps running.
   The current wiring only reaps on the **timeout** path; child-error and
   unexpected-close paths run no reap.

3. **The process table is read with a PATH-winnable bare `ps` — and used as a
   KILL authority.** The nightly job PATH deliberately front-loads the
   user/agent-writable `~/.local/bin` (ADR-0009; `run-job.js:157–159`), so any
   `spawnSync('ps', …)` resolves through it — the exact bare-name
   executable-injection class ADR-0028/WP-154 just closed, and worse here because
   the resolved binary decides what gets **killed**. A planted fake `ps` could
   feed a doctored table and misdirect the SIGKILLs.

**The fix (ADR-0030, Proposed — owner ratifies at this WP's `Ready`-flip).**
Keep `run-job` as the single timeout authority (WP-141) and give the supervisor a
shared **`reapTree`** primitive that:

- reads the process table from an **authoritative** source — Linux `/proc`
  directly (no external binary); macOS/BSD the **absolute, SIP-protected**
  `/bin/ps` **verified structurally before spawn** (reusing WP-154's
  `exec-identity` verification) — **never** a PATH-resolved bare `ps`;
- computes the **real descendant tree** (transitive `ppid` closure) and every
  **process group** those descendants belong to, and SIGKILLs both — so it
  catches a re-detached child (new group, still a ppid-descendant, the current
  brain leak), a `setsid` child (new session, ppid intact), and a
  double-fork-no-`setsid` child (reparented to init, group retained);
- **re-snapshots and re-kills in a bounded loop until two consecutive sweeps
  find zero descendants**, closing the snapshot→kill TOCTOU for every findable
  process; and
- **never throws** — a failed table read degrades to the legacy group-kill so
  the watchdog always still raises its timeout error.

To reap a brain whose middle process already died (gap 2), the outer supervisor
must **learn the brain's pid/pgid before the middle can die**: `dream.js` writes a
small **brain pidfile** under `state/` at spawn, and `run-job` reaps that group on
**every** child-exit path. The inner `dream.js` watchdog uses the same `reapTree`,
so standalone `wienerdog dream` also reaps a re-detached brain.

**Honest boundary (ADR-0030, cite it — do NOT bury a residual in this spec).** A
process that **both** `setsid`s into a new session **and** double-forks to fully
reparent to `init` is in no descendant group and is no longer a ppid-descendant —
it escapes *any* user-level reap. That escapee is **A12's** territory. It is
**mitigated** here by A1 (ADR-0025): the dream **brain is hermetically contained,
has no Bash/shell**, so it cannot `fork`/`setsid` anything; the escape tests
(the sibling `WP-a10-escape-harness`) exercise the *supervisor's* robustness with
synthetic children and record the combined escapee as the documented A12 residual.
This is `verify-then-reap` logic at existing spawn sites; it starts nothing that
outlives the job (ADR-0004).

## Current state

**`src/cli/run-job.js`** (`killProcessTree`, exported; used only in the watchdog):
```js
function killProcessTree(pid, platform, seams = {}) {
  const kill = seams.kill || process.kill;
  const sspawn = seams.spawnSync || spawnSync;
  try {
    if (platform === 'win32') sspawn('taskkill', ['/PID', String(pid), '/T', '/F']);
    else kill(-pid, 'SIGKILL'); // kill the process GROUP → whole tree
  } catch { /* already gone — best-effort */ }
}
```
The watchdog spawns `detached: platform !== 'win32'` and calls
`killProcessTree(child.pid, platform, opts)` **only** on timeout. Completion:
```js
const done = new Promise((resolve, reject) => {
  child.on('error', reject);
  child.on('close', (c) => resolve(c));
});
let timer = null;
const watchdog = new Promise((_resolve, reject) => {
  timer = setTimeout(() => {
    killProcessTree(child.pid, platform, opts);
    reject(new WienerdogError(`job "${name}" timed out after ${job.timeoutMinutes} min`));
  }, timeoutMs);
});
try { code = await Promise.race([done, watchdog]); }
finally { if (timer) clearTimeout(timer); }
```
`run-job` has `paths` and knows the job kind (`job.run === 'builtin:dream'`).

**`src/core/dream/brain.js`** `spawnBrain(o)` spawns the brain `detached: true`
(`:191`, "own process group so WP-017 can group-kill the whole tree"); no
watchdog here. Returns `{ child, done }`.

**`src/cli/dream.js`** `runBrainWithWatchdog(o)` (`:114`) races `done` vs a
watchdog that does `process.kill(-child.pid, 'SIGKILL')` (`:126`) on timeout and
`clearTimeout(timer)` in `finally`. It does not currently receive `paths`.

**`src/core/exec-identity.js`** exports the structural verifier
`verifyExecutable(realpath, platform, ctx)` → `{ ok, why }` (regular file,
execute bit, owner uid ∈ {current, root}, no group/other-writable ancestor). Reuse
it to gate `/bin/ps` before spawning it.

Nothing today enumerates real descendants; both watchdogs kill a single group,
only on timeout.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/reap.js | `reapTree(pid, platform, seams)` — authoritative process-table read (Linux `/proc`, macOS verified absolute `/bin/ps`, **never** bare `ps`), real ppid-descendant + group SIGKILL, **kill–rescan to two consecutive zero sweeps** (bounded), best-effort/never-throws; win32 absolute `taskkill /T /F`. Pure, seam-injectable. Also exports `readProcessTable` for direct unit coverage. |
| modify | src/cli/run-job.js | (a) `killProcessTree` delegates to `reapTree` (keep the export + signature). (b) Reap on **every** child-exit path, not just timeout: on timeout reap `child.pid`'s real tree; on child-error and unexpected close reap the **brain pidfile** group if present; for `builtin:dream`, after the child settles by ANY path, read `state/dream-brain.pid` and `reapTree` that pgid, then delete the pidfile. Best-effort; never change the job outcome/throw. |
| modify | src/cli/dream.js | `runBrainWithWatchdog` uses `reapTree(child.pid, platform, seams)` on timeout; **write** the brain pidfile (`state/dream-brain.pid`, `0600`, `{pid, pgid}`) right after `spawnBrain` and **remove** it in `finally`. Thread `paths` + an injected `platform` (never mock `process.platform`) + optional reap seam. |
| create | tests/unit/reap.test.js | `reapTree`/`readProcessTable` unit cases (fake `/proc` root + fake `/bin/ps`; classification of plain/re-detached/setsid/double-fork; kill–rescan quiescence; never-throws on a bad table; darwin reader uses absolute `/bin/ps`, never bare `ps`; win32 `taskkill` argv). |
| modify | tests/unit/scheduler-runjob.test.js | `killProcessTree` reaps via `reapTree` (kills a re-detached grandchild, not only group A); reap runs on timeout **and** on unexpected-close/child-error; the `builtin:dream` brain-pidfile group is reaped and the pidfile deleted; win32 branch still shells `taskkill /T /F`. |
| modify | tests/integration/dream.test.js | `runBrainWithWatchdog` writes the brain pidfile at spawn and removes it on normal completion; the timeout path reaps a re-detached fake brain (no orphan) via the injected reap seam. |

### Exact contracts

**`src/core/reap.js`:**
```js
/** Reap a process and its real descendant tree to quiescence. Best-effort;
 *  NEVER throws.
 *  win32: absolute `taskkill /PID <pid> /T /F` (OS PID-table tree-kill).
 *  POSIX: read the process table from an AUTHORITATIVE source (Linux /proc;
 *    macOS/BSD the verified absolute /bin/ps — never a PATH-resolved `ps`),
 *    then SIGKILL (1) every process group that the target or any transitive
 *    ppid-descendant belongs to, AND (2) every transitive ppid-descendant pid;
 *    re-snapshot and re-kill until TWO CONSECUTIVE sweeps find zero descendants
 *    (bounded by maxSweeps). Catches: a plain child tree; a child re-detached
 *    into its OWN group (still a ppid-descendant — the dream-brain leak); a
 *    `setsid` child (new session, ppid intact); a double-fork-no-setsid child
 *    (reparented to init, group retained). Does NOT catch a process that BOTH
 *    setsid's AND double-forks to fully detach — the ADR-0030 / A12 residual;
 *    the hermetic brain (A1) has no shell to produce one.
 *  @param {number} pid           the immediate supervised child's pid (or a
 *                                handed-up brain pid/pgid)
 *  @param {NodeJS.Platform} platform  inject it — never mock process.platform
 *  @param {{ kill?: typeof process.kill,
 *            readTable?: () => Array<{pid:number, ppid:number, pgid:number}>,
 *            spawnSync?: typeof import('child_process').spawnSync,
 *            procRoot?: string, psPath?: string,
 *            verifyExecutable?: typeof import('./exec-identity').verifyExecutable,
 *            maxSweeps?: number }} [seams]
 *            test injection: `readTable` overrides the platform reader outright;
 *            `procRoot` (default '/proc') and `psPath` (default '/bin/ps') point
 *            the default reader at fixtures; `maxSweeps` default 5.
 *  @returns {void} */
function reapTree(pid, platform, seams = {}) {}

/** Read the process table from the authoritative source for `platform`.
 *  Linux: parse `<procRoot>/<pid>/stat` for every numeric dir (pid = field 1,
 *    ppid = field 4, pgrp = field 5 — parse AFTER the last ')' because comm may
 *    contain spaces/parens). No external binary.
 *  darwin/bsd: spawnSync(psPath, ['-A','-o','pid=,ppid=,pgid=']) ONLY after
 *    verifyExecutable(psPath) passes; psPath MUST be absolute ('/bin/ps'), never
 *    'ps' (no PATH lookup). Parse the [pid, ppid, pgid] triples.
 *  On any failure/empty result → return null (caller falls back to group-kill).
 *  @returns {Array<{pid:number, ppid:number, pgid:number}>|null} */
function readProcessTable(platform, seams = {}) {}

module.exports = { reapTree, readProcessTable };
```

**POSIX algorithm (the substance):**
1. **Snapshot** via `readProcessTable`. If it returns `null`/empty → `kill(-pid,
   'SIGKILL')` once (legacy fallback) and return; never throw.
2. **Descendant set** `S` = transitive `ppid` closure of `pid` (include `pid`).
3. **Group set** `G` = `{ pgid of p : p ∈ S }`.
4. **Kill:** for each `g ∈ G`, `kill(-g, 'SIGKILL')`; for each `p ∈ S`,
   `kill(p, 'SIGKILL')`. Each kill individually `try/catch`ed. **Never** kill
   `pid 1`, `process.pid` (the supervisor), or anything outside `S ∪ (−G)` —
   guard explicitly before every `kill`.
5. **Re-sweep** (re-snapshot, recompute `S`): repeat kill until **two consecutive
   sweeps** observe `S ⊆ {pid}` (zero remaining descendants), or `maxSweeps` is
   reached (bounded — never spin). The two-consecutive-clean condition closes the
   snapshot→kill fork race (a child forked between snapshot and kill is caught on
   the next sweep).

Determinism/safety: the whole function is `try/catch`-wrapped; a malformed table,
a missing/unverifiable `/bin/ps`, or an unreadable `/proc` degrades to the legacy
group-kill and never throws.

**win32:** resolve `taskkill` to its **absolute** System32 path
(`${process.env.SystemRoot || 'C:\\Windows'}\\System32\\taskkill.exe`, existence-
guarded, falling back to bare `taskkill` only if the absolute path is absent) and
spawn `['/PID', String(pid), '/T', '/F']`. The OS PID table handles the tree; no
re-sweep needed.

**`run-job.js` wiring.** `killProcessTree(pid, platform, seams)` becomes a thin
wrapper over `reapTree(pid, platform, seams)` (preserve the exported name +
signature; the existing `{kill, spawnSync}` seams map straight through). **Reap on
every exit path**, not only timeout:
- On **timeout**: `reapTree(child.pid, platform, opts)` (child known alive) —
  unchanged trigger, real-tree reap.
- After the child settles by **any** path (timeout, `'error'`, or `'close'`): if
  `job.run === 'builtin:dream'`, read `state/dream-brain.pid`; if present,
  `reapTree(brain.pgid, platform, opts)` to kill group B (covers a brain
  orphaned by a dead middle), then delete the pidfile. All best-effort — a
  missing/stale pidfile is a no-op, and reap trouble never changes the job
  outcome or throws into the watchdog (the watchdog must still raise its timeout
  `WienerdogError`).

Do **not** `reapTree(child.pid)` after a clean `'close'` (the group leader has
exited; re-reaping a possibly-reused pid is a hazard) — on a clean close the
brain pidfile was already removed by `dream.js`, so there is nothing to reap.

**`dream.js` wiring.** In `runBrainWithWatchdog`: after `spawnBrain` returns
`{child}`, write `state/dream-brain.pid` = `{ pid: child.pid, pgid: child.pid }`
(the brain is `detached`, so its pid is its pgid) via `writeFilePrivate` (`0600`);
`reapTree(child.pid, platform, seams)` on the timeout path (replacing the inline
`process.kill(-child.pid)`); keep `reject(new WienerdogError(...))` and `finally {
clearTimeout(timer) }`; in the same `finally`, **remove** the pidfile
(best-effort). Thread `paths`, an injected `platform` (default `process.platform`),
and an optional reap seam from the caller (`dream.js`'s `run(argv, opts)` already
carries a JS-only `opts` seam idiom — WP-155).

## Security checklist

- [ ] The reap NEVER resolves `ps`/`taskkill` by bare name through the job PATH:
      Linux reads `/proc` with no external binary; macOS spawns the **absolute**
      `/bin/ps` only after `verifyExecutable('/bin/ps')` passes; win32 uses the
      absolute System32 `taskkill`. A `ps` planted earlier on PATH is never
      consulted (unit-asserted; the live PATH-plant negative is the sibling
      harness WP).
- [ ] `reapTree` kills only members of `S` and their groups `−G` — never
      `pid 1`, never `process.pid`, never an unrelated process — and never throws
      (a bad table degrades to the legacy group-kill).
- [ ] The handed-up brain is reaped by its **group** (`kill(-pgid)`), not a bare
      pid; the PID-reuse window is the stated ADR-0030 residual.

## Acceptance criteria (mapped to the A10 acceptance bullets + ADR-0030)

- [ ] **[A10 — "Remove the double-detached timeout race."]** With the outer
      `run-job` watchdog firing while the brain is detached in its own group, the
      brain is reaped (no orphan) — asserted by a `dream.test.js` case firing the
      reap against a re-detached fake brain (no surviving pid).
- [ ] **[Middle-death close, ADR-0030]** `dream.js` writes `state/dream-brain.pid`
      at spawn and removes it on clean completion; `run-job`, on an
      unexpected-close/child-error for `builtin:dream`, reaps the pidfile group
      and deletes the file — asserted in `scheduler-runjob.test.js` (the full
      SIGKILL-the-middle live proof is the sibling harness WP).
- [ ] **[Quiescence]** `reapTree` re-sweeps until two consecutive clean sweeps
      (bounded by `maxSweeps`); a fake table that "spawns" a child between the
      first snapshot and the first kill is fully reaped by the loop — unit-tested
      with an injected table generator.
- [ ] **[No bare ps]** `readProcessTable` on darwin invokes `spawnSync` with
      `argv[0] === '/bin/ps'` (absolute) and never `'ps'`; on linux it reads
      `<procRoot>/<pid>/stat`; both return the correct `[pid,ppid,pgid]` triples
      from a fixture.
- [ ] `killProcessTree` keeps its exported name/signature and now reaps the real
      tree; existing `scheduler-runjob` tests pass; win32 shells absolute
      `taskkill /PID <pid> /T /F`.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap|scheduler-runjob|dream-integration"
npm test
npm run lint
# no bare-name ps/taskkill anywhere in the reap primitive:
! grep -nE "spawnSync\(\s*['\"](ps|taskkill)['\"]" src/core/reap.js && echo "no bare ps/taskkill — OK"
grep -n "/bin/ps\|/proc\|System32" src/core/reap.js
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step. Do not
  add a native process-tree library — `/proc` (Linux) + absolute `/bin/ps`
  (macOS) + absolute `taskkill` (win32) are the primitives.
- **`never mock process.platform`** — inject `platform` into `reapTree`,
  `readProcessTable`, and `dream.js`'s watchdog (WP-038/049/051 rule). Tests
  select the OS branch via the argument and inject `readTable`/`spawnSync`/
  `procRoot`/`psPath`/`kill`.
- **Reuse WP-154's `exec-identity.verifyExecutable`** to gate `/bin/ps` — do not
  reinvent the structural check. Inject it via the `verifyExecutable` seam so a
  test can force a verification failure and assert the fallback.
- **Single-authority stays true (WP-141/ADR-0028).** `run-job` remains the
  timeout authority; this WP does not add a new authority — it makes the existing
  supervisor's kill reach re-detached descendants and adds the brain-pid hand-up.
  The inner `dream.js` watchdog is retained for the **standalone** `wienerdog
  dream` path and now uses the same reap. Do **not** delete the inner watchdog or
  re-plumb which timeout "wins" — the reap closes the race without that
  re-architecture (explicitly out of scope).
- **PID reuse (stated residual, ADR-0030).** The brain pidfile is reaped by its
  **pgid** (`kill(-pgid)`), so an unrelated process that reuses the brain's exited
  pid is not group-killed unless it deliberately joined that pgid — an
  astronomically unlikely, self-inflicted case. Written fresh at spawn, removed on
  clean completion, so the stale window is small. Do not attempt a heavier
  liveness/identity check — the group-reap + short window is the accepted bound.
- **Best-effort, never fail the job on reap trouble.** A missing `/proc`, an
  unverifiable `/bin/ps`, a garbage table, or a missing pidfile must degrade to
  the legacy group-kill / be a no-op; the watchdog's job is to raise the timeout
  `WienerdogError`, which must still happen.
- **Serialize after WP-155 and WP-157 (shared spawn/dispatch surface).** WP-155
  establishes the `opts.resolveCommand` / `dream.run(argv, opts)` DI idiom; WP-157
  rewrites the OS entry through the launcher (`launcher → run-job → dream.js →
  brain`; the launcher is an *ancestor* of `run-job`, not a reap target). Read the
  **actual post-WP-155/157** `run-job.js`/`dream.js` before editing — do not
  reintroduce a deleted seam; thread reap seams via the established `opts`/`seams`
  pattern.
- **Shared-surface coordination with `WP-a9-private-modes-repair`.** That WP edits
  the **log-stream open** lines in these same two files (`run-job.js:552` /
  `dream.js:340`), disjoint from the watchdog region this WP edits — do not land
  both on one branch; rebase and re-locate the exact lines before editing.
- **ADR-0030 is the boundary of record.** The combined setsid+double-fork residual
  and the PID-reuse window live in ADR-0030 (Proposed; owner ratifies at this
  WP's `Ready`-flip), not as an in-spec residual note. Cite it; do not restate a
  competing residual. If the sibling escape harness reveals the guarantee needs an
  OS-specific containment mechanism (cgroup/job-object) beyond `/proc`+`ps`, flag
  it as an ADR-0030 amendment — do not build it here.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Out of scope (do NOT do these)

- The **live escape-negative harness** (setsid/double-fork matrix, the
  SIGKILL-the-middle-while-brain-lives live test, the fake-`ps`-in-PATH negative,
  the timed snapshot/fork/setsid interleaving attack, the non-vacuity baseline) —
  **WP-a10-escape-harness**, which depends on this WP.
- Re-architecting which watchdog "owns" the timeout, or deleting the inner
  `dream.js` watchdog — the reap closes the race without that.
- Executable pinning / seam deletion / the launcher — **WP-154 / WP-155 / WP-156
  / WP-157** (this WP depends on WP-155 + WP-157 and must not re-touch them).
- A cgroup/PID-namespace (Linux) or job-object (win32) containment mechanism —
  out of scope; `/proc`+`ps`+`taskkill` is the "just files" primitive. If the
  harness shows it is required, flag an ADR-0030 amendment; do not build it here.
- Defending against the combined setsid+double-fork full-detach escapee — the
  documented ADR-0030 / A12 residual (the contained brain cannot produce one).
- The **log-stream `0600` fix** in `run-job.js`/`dream.js` — **WP-a9-private-
  modes-repair** owns that (a different line in the same files).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(security): reap the findable descendant tree to quiescence on every exit path (WP-a10-reap-mechanism)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
