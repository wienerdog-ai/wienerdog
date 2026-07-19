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
must **learn the brain's pid/pgid before the middle can die** — via a **per-run**
brain pidfile, not a single shared one:

- **Per-run token (round-2 finding).** The outer `run-job` supervisor mints a
  unique **run token** *before* it spawns the middle and passes it down; the
  middle (`dream.js`) may write/delete **only** the pidfile at its own token's
  path (`state/dream-brain.<token>.pid`); the reaper reads **only** its own run's
  pidfile. A single global `state/dream-brain.pid` was a cross-run hazard: a
  second, lock-losing concurrent dream would read+kill the **first** run's live
  brain. Per-run tokens make each supervisor reap exactly its own brain and never
  another run's. The pidfile is written **atomically immediately after spawn**
  (temp+rename via `writeFilePrivate`, `0600`) so the spawn→hand-up window shrinks
  to sub-ms; a middle that dies inside that sub-ms gap before the write is the
  **documented ADR-0030 residual** (non-adversarial only — no full handshake
  protocol is added).
- **Authenticated group reap by NEGATIVE PGID (round-2 finding).** The handed-up
  brain is a bare **pgid**, and by the time `run-job` reaps it the group leader
  may already have exited — so it must be killed with an explicit
  **negative-PGID** operation (`kill(-pgid)`), which reaps every surviving group
  member even with the leader gone. Feeding that pgid to `reapTree` (which treats
  its argument as a *pid* and does a ppid-closure table lookup + positive kill)
  would find nothing and **leak** the surviving members. So the mechanism gets a
  **second, distinct** primitive `reapGroup(pgid)` for the authenticated-PGID
  contract, separate from `reapTree(pid)`'s PID-tree contract.
- **Abnormal close reaps the FULL group-A tree — via BOTH primitives (round-2 +
  round-3 findings).** On an abnormal middle exit (timeout, `'error'`, or a
  non-clean `'close'`), `run-job` must reap the middle's **whole group-A
  descendant tree** (a group-A descendant the middle spawned can outlive it) **in
  addition to** `reapGroup(brain.pgid)` for the detached group-B brain. Group A
  must be reaped with **both** `reapTree(child.pid)` **and**
  `reapGroup(child.pid)`, because they cover different states: on the **timeout**
  path the middle is still alive, so `reapTree`'s ppid-closure sees the group-A
  descendants and kills them; but by the time `run-job` receives a `'close'`/
  `'error'`, the group-A leader (the middle, whose pid == group-A pgid because it
  was spawned `detached`) has **already exited** and vanished from the process
  table — so `reapTree(child.pid)` computes an **empty** ppid-descendant set and
  sends **no** kill, and a fully NON-adversarial sleeping group-A child that
  reparented to `init` (still carrying `child.pid` as its PGID) would survive.
  The explicit `reapGroup(child.pid)` closes that: its **negative-PGID**
  `kill(-child.pid)` reaches a leaderless reparented group-A member even with the
  leader gone. So the abnormal path issues three reaps: `reapTree(child.pid)` +
  `reapGroup(child.pid)` for group A, and `reapGroup(brain.pgid)` for group B.

**Platform scope: the leaderless-member guarantee is POSIX-only this release —
owner-approved, R5-2 (this is ordinary platform scope, NOT an ADR-0030
adversarial residual).** The leaderless-reparented-member reap above rests on the
POSIX **negative-PGID** `kill(-pgid)` semantics, which reach every surviving group
member even after the group leader has exited. **Windows has no equivalent.** On
win32, `reapGroup(pgid)` reduces to `taskkill /PID <pgid> /T /F`, which targets a
**live PID and its LIVE child tree** — once the middle (the group-A leader) has
exited (which, on the abnormal `'close'`/`'error'` path, it already has), that pid
is gone from the table, so `reapGroup(child.pid)` reaches **nothing** and does NOT
reap a surviving reparented group-A child. In other words, R4-B's leaderless-member
fix is a **no-op on win32**, and the sibling `WP-a10-escape-harness` SKIPS on
Windows, so the merge-gate cannot catch the gap. Owner decision for this release:
- **(a)** the non-adversarial reap-to-quiescence guarantee (a leaderless group-A
  member reaped after an abnormal close) is **scoped to POSIX** — Linux `/proc`,
  macOS `/bin/ps`.
- **(b)** on win32 the **new group-reap authority MUST NOT activate**: the win32
  abnormal-close path **falls back to the existing pre-A10 single-timeout
  `taskkill /T /F` behavior** (`reapTree(child.pid)` on the **timeout** path only,
  while the middle is still alive so its live tree is killed) — **no regression**,
  but it is explicitly documented as **NOT providing** the leaderless-descendant
  guarantee. Do not wire the abnormal-close `reapGroup(child.pid)` /
  `reapGroup(brain.pgid)` group-reap as a win32 correctness guarantee — it cannot
  deliver one, and pretending it does would be a false claim.
- **(c)** Windows post-parent-exit reaping is **DEFERRED to a follow-up WP**
  (`WP-a10-windows-reap`, Draft). Closing it needs an **absolute-path Windows
  authoritative process-table enumeration** (e.g. absolute-path `tasklist` /
  `Get-CimInstance Win32_Process` walking `ParentProcessId`) **AND** a **live
  Windows merge-gate test** — a skipped harness is **not** proof. **Job Objects
  are explicitly OUT** (heavier OS containment we avoid — the same class as the
  cgroup/PID-namespace mechanism already ruled out).

This platform-scope boundary is recorded here, in this WP, as an explicit
owner-approved decision — it is **not** an ADR-0030 residual (ADR-0030 is only for
the *adversarial* escapee: the combined setsid+double-fork full-detach; this is
ordinary per-platform scope, an entirely non-adversarial surviving child).

The inner `dream.js` watchdog uses the same `reapTree`, so standalone `wienerdog
dream` also reaps a re-detached brain; standalone runs have no outer supervisor
and need no hand-up pidfile (the inner watchdog reaps the brain directly).

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
| create | src/core/reap.js | `reapTree(pid, platform, seams)` — authoritative process-table read (Linux `/proc`, macOS verified absolute `/bin/ps`, **never** bare `ps`), real ppid-descendant + group SIGKILL, **kill–rescan to two consecutive zero sweeps** (bounded), best-effort/never-throws; win32 **absolute System32** `taskkill /T /F` with **no bare-name fallback**. `reapGroup(pgid, platform, seams)` — the authenticated-PGID primitive: POSIX **negative-PGID** `kill(-pgid, SIGKILL)` (works even if the group leader already exited), win32 absolute `taskkill /PID <pgid> /T /F` — **win32 reaches only a live pid + its live tree, NO negative-PGID equivalent, so NO leaderless-member guarantee (R5-2; deferred to WP-a10-windows-reap)**; best-effort/never-throws. Also exports `readProcessTable` for direct unit coverage. Pure, seam-injectable. |
| modify | src/cli/run-job.js | (a) `killProcessTree` delegates to `reapTree` (keep the export + signature). (b) For `builtin:dream`, **mint a per-run token BEFORE spawn** and pass it to the child (env var), and compute the per-run pidfile path `state/dream-brain.<token>.pid`. (c) Reap on **every** child-exit path: on an **abnormal** settle (timeout / `'error'` / non-clean `'close'`) reap the group-A tree with **BOTH** `reapTree(child.pid)` **and** `reapGroup(child.pid)` (the negative-PGID group kill reaches a leaderless reparented group-A member once the middle/group-leader has exited — after `'close'` `reapTree`'s ppid-closure alone finds nothing); on **any** settle for `builtin:dream` read the per-token pidfile and `reapGroup(brain.pgid)` if present, then delete it. **POSIX guarantee only: on win32 the group-reap authority does NOT activate — the win32 abnormal-close path keeps the pre-A10 timeout-path `taskkill /T /F` behavior, leaderless-member case deferred to WP-a10-windows-reap (R5-2).** Best-effort; never change the job outcome/throw. |
| modify | src/cli/dream.js | `runBrainWithWatchdog` uses `reapTree(child.pid, platform, seams)` on timeout; when a run token is present (set by `run-job`), **write** the per-run brain pidfile (`state/dream-brain.<token>.pid`, `0600`, `{pid, pgid}`, **atomically** via `writeFilePrivate`) right after `spawnBrain` and **remove** it in `finally`. Standalone (no token) writes no hand-up pidfile. Thread `paths` + an injected `platform` (never mock `process.platform`) + optional reap seam. |
| create | tests/unit/reap.test.js | `reapTree`/`reapGroup`/`readProcessTable` unit cases (fake `/proc` root + fake `/bin/ps`; classification of plain/re-detached/setsid/double-fork; kill–rescan quiescence; never-throws on a bad table; darwin reader uses absolute `/bin/ps`, never bare `ps`; `reapGroup` does a **negative-PGID** kill and reaps an **exited-leader-with-live-member** group; win32 uses the **absolute System32** `taskkill` and **never** a bare-name / PATH-planted `taskkill`). |
| modify | tests/unit/scheduler-runjob.test.js | `killProcessTree` reaps via `reapTree` (kills a re-detached grandchild, not only group A); on abnormal close the **group-A tree** is reaped via **BOTH** `reapTree(child.pid)` **and** `reapGroup(child.pid)` (assert both seams are invoked — the `reapGroup(child.pid)` negative-PGID kill is what covers a leaderless reparented group-A member once the middle has exited); for `builtin:dream` the **per-token** brain pidfile group is reaped via `reapGroup(brain.pgid)` and the pidfile deleted; a second, lock-losing concurrent run reaps **only its own** token pidfile and never the other run's live brain; win32 branch shells the absolute System32 `taskkill /T /F`. |
| modify | tests/integration/dream.test.js | `runBrainWithWatchdog` writes the **per-token** brain pidfile at spawn and removes it on normal completion; the timeout path reaps a re-detached fake brain (no orphan) via the injected reap seam; a middle killed at the spawn→hand-up boundary is covered (the sub-ms residual documented, not asserted reaped). |

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

/** Reap an AUTHENTICATED process GROUP by its pgid — the handed-up brain group.
 *  Distinct from reapTree: the input is a PGID, not a PID, and the group leader
 *  may already have exited. Best-effort; NEVER throws.
 *  POSIX: kill(-pgid, 'SIGKILL') — a NEGATIVE-pgid signal reaps every surviving
 *    member of the group even when the leader is gone (a positive-pid table
 *    lookup would find nothing and leak the members). No ppid-closure, no
 *    rescan: this is the direct group signal, guarded so it never targets pgid 1
 *    or process.pid.
 *  win32: absolute System32 `taskkill /PID <pgid> /T /F` (pgid == the detached
 *    brain's pid); no bare-name fallback. NOTE (R5-2): on win32 this reaches only a
 *    LIVE pid and its LIVE child tree — there is NO negative-PGID equivalent, so it
 *    does NOT reach a leaderless reparented member once the group leader has exited.
 *    win32 therefore provides NO leaderless-member guarantee; that case is deferred
 *    to WP-a10-windows-reap (see the Platform-scope note in Context).
 *  @param {number} pgid  the handed-up brain process-group id
 *  @param {NodeJS.Platform} platform  inject it — never mock process.platform
 *  @param {{ kill?: typeof process.kill,
 *            spawnSync?: typeof import('child_process').spawnSync }} [seams]
 *  @returns {void} */
function reapGroup(pgid, platform, seams = {}) {}

module.exports = { reapTree, reapGroup, readProcessTable };
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

**win32 (no bare-name fallback, round-2 finding):** resolve `taskkill` to its
**absolute** System32 path
(`${process.env.SystemRoot || 'C:\\Windows'}\\System32\\taskkill.exe`), and spawn
it **only** if that absolute path exists, with `['/PID', String(pid), '/T',
'/F']`. If the absolute System32 `taskkill.exe` is **absent**, that is a **closed,
diagnosed cleanup failure** — do a best-effort no-op and return; **never** fall
back to a bare-name `taskkill` (the Windows clean-run PATH front-loads the
user-writable `~/.local/bin` ahead of System32, so a bare name is the same
executable-injection class as bare `ps`, and worse because it kills). Hold the
resolved path in a variable — do not write a bare-name string literal into any
`spawnSync` call. The OS PID table handles the tree; no re-sweep needed. `reapGroup`
uses the same absolute-only resolution.

**win32 leaderless-member limit (R5-2).** `taskkill /PID <pid> /T /F` kills a live
pid and its **live** child tree only; Windows has **no** negative-PGID equivalent,
so once the group leader has exited (the abnormal-close case) `reapGroup` on win32
reaches **nothing** and cannot reap a leaderless reparented member. Per the
owner-approved Platform-scope decision in Context, the win32 abnormal-close path
keeps the **pre-A10** single-timeout `taskkill /T /F` behavior and does **not**
activate the group-reap authority as a correctness guarantee; the leaderless-member
case is **deferred to WP-a10-windows-reap**. Do not add per-platform start-time or
Job-Object machinery here to close it (out of scope).

**`run-job.js` wiring.** `killProcessTree(pid, platform, seams)` becomes a thin
wrapper over `reapTree(pid, platform, seams)` (preserve the exported name +
signature; the existing `{kill, spawnSync}` seams map straight through).

- **Mint a per-run token before spawn (`builtin:dream` only).** Before spawning
  the middle, mint a unique token (e.g. `crypto.randomBytes(8).toString('hex')`),
  put it in the child's env (e.g. `WIENERDOG_DREAM_RUN_TOKEN`, added to the `env`
  already built for `spawn`), and compute this run's pidfile path
  `state/dream-brain.<token>.pid`. The reaper below reads **only** that path.
- **Reap on every exit path**, with two distinct targets:
  - On an **abnormal** settle — the timeout fired, or the child emitted `'error'`,
    or it `'close'`d with a non-zero code / signal — reap the middle's **group-A
    descendant tree** with **BOTH** primitives: `reapTree(child.pid, platform,
    opts)` **and** `reapGroup(child.pid, platform, opts)`. Both are needed because
    they cover different live states. On the **timeout** path the middle is still
    running, so `reapTree`'s ppid-closure enumerates and kills its group-A
    descendants. But once `run-job` observes `'close'`/`'error'`, the middle (the
    group-A **leader** — its pid **is** the group-A pgid, since it was spawned
    `detached`) has **already exited** and left the process table, so
    `reapTree(child.pid)` computes an **empty** descendant set and issues **no**
    kill; a non-adversarial sleeping group-A child reparented to `init` (still in
    pgid `child.pid`) would then survive. `reapGroup(child.pid)`'s explicit
    **negative-PGID** `kill(-child.pid)` reaches that leaderless reparented member.
    (These two group-A reaps are distinct from the group-B `reapGroup(brain.pgid)`
    below — three reaps, two group-A targets sharing `child.pid`, one group-B.)
    **This three-reap abnormal-close authority is POSIX-only (R5-2).** On win32
    `reapGroup`'s `taskkill` cannot reach a leaderless reparented member (no
    negative-PGID equivalent — see the Platform-scope note in Context), so on win32
    the abnormal-close path keeps the **pre-A10 behavior**: the timeout-path
    `reapTree(child.pid)` (absolute `taskkill /PID <child.pid> /T /F` while the
    middle is still alive) only, with **no** leaderless-descendant guarantee. Do
    not present the win32 `reapGroup` calls as delivering that guarantee; the
    Windows post-parent-exit case is deferred to **WP-a10-windows-reap**.
  - After the child settles by **any** path, for `builtin:dream` read **this run's**
    `state/dream-brain.<token>.pid`; if present, `reapGroup(brain.pgid, platform,
    opts)` to kill the detached group-B brain (covers a brain orphaned by a dead
    middle), then delete the pidfile.
- Do **not** `reapTree(child.pid)` after a **clean** `'close'` (exit 0): the group
  leader exited and re-reaping is pointless; the per-token brain pidfile was
  already removed by `dream.js`, and reading a stale one is a best-effort no-op.
- All reap work is best-effort: a missing/stale pidfile is a no-op, and reap
  trouble never changes the job outcome or throws into the watchdog (the watchdog
  must still raise its timeout `WienerdogError`).

**`dream.js` wiring.** In `runBrainWithWatchdog`: after `spawnBrain` returns
`{child}`, **if** a run token is present in env (set by `run-job`), write
`state/dream-brain.<token>.pid` = `{ pid: child.pid, pgid: child.pid }` (the brain
is `detached`, so its pid is its pgid) **atomically** via `writeFilePrivate`
(`0600`, temp+rename — the write happens immediately post-spawn so the hand-up
window is sub-ms); `reapTree(child.pid, platform, seams)` on the timeout path
(replacing the inline `process.kill(-child.pid)`); keep `reject(new
WienerdogError(...))` and `finally { clearTimeout(timer) }`; in the same
`finally`, **remove** this run's pidfile (best-effort). A **standalone** `wienerdog
dream` (no run token) writes no hand-up pidfile — its inner watchdog reaps the
brain directly. Thread `paths`, an injected `platform` (default
`process.platform`), and an optional reap seam from the caller (`dream.js`'s
`run(argv, opts)` already carries a JS-only `opts` seam idiom — WP-155).

## Security checklist

- [ ] The reap NEVER resolves `ps`/`taskkill` by bare name through the job PATH:
      Linux reads `/proc` with no external binary; macOS spawns the **absolute**
      `/bin/ps` only after `verifyExecutable('/bin/ps')` passes; win32 uses the
      absolute System32 `taskkill` **with no bare-name fallback** (an absent
      System32 `taskkill.exe` is a diagnosed no-op, never a bare-name spawn). A
      `ps`/`taskkill` planted earlier on PATH is never consulted (unit-asserted;
      the live PATH-plant negatives are the sibling harness WP).
- [ ] `reapTree` kills only members of `S` and their groups `−G` — never
      `pid 1`, never `process.pid`, never an unrelated process — and never throws
      (a bad table degrades to the legacy group-kill).
- [ ] The handed-up brain is reaped by `reapGroup` via an explicit
      **negative-PGID** `kill(-pgid)` (reaches surviving members even after the
      group leader exited), never by feeding the pgid to `reapTree` as a pid. The
      PID/PGID-reuse window is the stated ADR-0030 residual (no start-time check).

## Acceptance criteria (mapped to the A10 acceptance bullets + ADR-0030)

- [ ] **[A10 — "Remove the double-detached timeout race."]** With the outer
      `run-job` watchdog firing while the brain is detached in its own group, the
      brain is reaped (no orphan) — asserted by a `dream.test.js` case firing the
      reap against a re-detached fake brain (no surviving pid).
- [ ] **[Middle-death close, ADR-0030]** `dream.js` writes the **per-token**
      `state/dream-brain.<token>.pid` at spawn and removes it on clean completion;
      `run-job`, on an unexpected-close/child-error for `builtin:dream`, reaps that
      token's group via `reapGroup` and deletes the file — asserted in
      `scheduler-runjob.test.js` (the full SIGKILL-the-middle live proof is the
      sibling harness WP).
- [ ] **[Cross-run isolation, round-2]** A second, lock-losing concurrent dream
      run reaps **only its own** token pidfile and never reads or kills the first
      run's live brain — unit-asserted with two distinct tokens.
- [ ] **[Abnormal-close group-A, round-2 + round-3, POSIX]** On timeout /
      `'error'` / non-clean `'close'` on **POSIX**, `run-job` reaps the middle's
      **group-A** tree with **both** `reapTree(child.pid)` **and**
      `reapGroup(child.pid)` (distinct from the group-B `reapGroup(brain.pgid)`) —
      unit-asserted that both are invoked on the abnormal path. Because a
      post-`'close'` `reapTree(child.pid)` sees an exited group-A leader and issues
      no kill, the `reapGroup(child.pid)` **negative-PGID** kill is what reaps a
      **leaderless reparented group-A member**; the sibling live harness must prove,
      on the real post-`'close'` path, that such a member ends up **ESRCH** (the
      unit test asserts the call wiring; the live proof is `WP-a10-escape-harness`).
- [ ] **[Platform scope: POSIX-only, win32 does not activate, R5-2]** The
      leaderless-reparented-member guarantee is **POSIX-only** this release. On
      **win32** the abnormal-close **group-reap authority does NOT activate**: the
      spec (Context Platform-scope note + `reapGroup` win32 JSDoc + win32 prose)
      states that `taskkill` reaches only a live pid and its live tree, has **no**
      negative-PGID equivalent, and therefore provides **no** leaderless-member
      guarantee; the win32 abnormal-close path keeps the **pre-A10 single-timeout
      `taskkill /T /F`** behavior (no regression), and the Windows post-parent-exit
      case is **deferred to `WP-a10-windows-reap`**. This is an owner-approved
      platform-scope boundary, **not** an ADR-0030 residual.
- [ ] **[Authenticated-PGID, round-2]** `reapGroup(pgid)` issues a **negative-PGID**
      `kill(-pgid)` and reaps an **exited-group-leader-with-live-member** group;
      the recycled-id case is the documented ADR-0030 residual (no test asserts it
      reaped).
- [ ] **[Quiescence]** `reapTree` re-sweeps until two consecutive clean sweeps
      (bounded by `maxSweeps`); a fake table that "spawns" a child between the
      first snapshot and the first kill is fully reaped by the loop — unit-tested
      with an injected table generator.
- [ ] **[No bare ps / no bare taskkill]** `readProcessTable` on darwin invokes
      `spawnSync` with `argv[0] === '/bin/ps'` (absolute) and never `'ps'`; on
      linux it reads `<procRoot>/<pid>/stat`; the win32 branch spawns the
      **absolute System32** `taskkill` and, with a `taskkill` planted earlier on
      PATH, never invokes it (and does a diagnosed no-op when System32 `taskkill`
      is absent).
- [ ] `killProcessTree` keeps its exported name/signature and now reaps the real
      tree; existing `scheduler-runjob` tests pass; win32 shells absolute System32
      `taskkill /PID <pid> /T /F`.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap|scheduler-runjob|dream-integration"
npm test
npm run lint
# no bare-name ps/taskkill literal is ever spawned (the resolved path is held in
# a variable; assert no bare-name literal appears as a spawnSync arg):
! grep -nE "spawnSync\(\s*['\"](ps|taskkill)['\"]" src/core/reap.js && echo "no bare ps/taskkill literal — OK"
# authoritative sources + the two primitives + negative-pgid group kill are present:
grep -nE "/bin/ps|/proc|System32|reapGroup|kill\(\s*-" src/core/reap.js
# the per-run token pidfile + reapGroup wiring is present:
grep -nE "dream-brain\.|WIENERDOG_DREAM_RUN_TOKEN|reapGroup|reapTree" src/cli/run-job.js src/cli/dream.js
# R5-2: the win32 leaderless-member scope boundary is carried into code comments
# (win32 group-reap provides no leaderless guarantee; POSIX-only this release):
grep -niE "leaderless|no negative-pgid|windows-reap|pre-A10|POSIX-only" src/core/reap.js src/cli/run-job.js
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
- **PID/PGID reuse (stated residual, ADR-0030).** The brain group is reaped by
  its **pgid** via `reapGroup`'s negative-PGID `kill(-pgid)`, so an unrelated
  process that reuses the brain's exited pid is not group-killed unless it
  deliberately joined that pgid — an astronomically unlikely, self-inflicted case.
  The per-token pidfile is written fresh at spawn and removed on clean completion,
  so the stale window is small. **Do NOT add per-platform process start-time
  verification** (owner, round-2) — the group-reap + short window is the accepted
  bound; the recycled-id micro-window is a documented ADR-0030 residual.
- **Spawn→hand-up gap (stated residual, ADR-0030).** A middle that dies in the
  sub-ms window between `spawnBrain` and the atomic pidfile write hands up nothing,
  so its brain is unreaped. No full handshake protocol is added (owner, round-2);
  the atomic immediate-post-spawn write shrinks the window to sub-ms and it is a
  documented non-adversarial residual.
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
- **ADR-0030 is the boundary of record.** The combined setsid+double-fork residual,
  the kill-induced late-reparent window, the PID/PGID-reuse window, and the
  spawn→hand-up gap live in ADR-0030 (Proposed; owner ratifies at this WP's
  `Ready`-flip), not as an in-spec residual note. Cite it; do not restate a
  competing residual. If the sibling escape harness reveals the guarantee needs an
  OS-specific containment mechanism (cgroup/job-object) beyond `/proc`+`ps`, flag
  it as an ADR-0030 amendment — do not build it here.
- **Merge-gate coupling with the escape harness is intentional and one-directional
  in frontmatter (round-2 finding 13).** `WP-a10-escape-harness` `depends_on` this
  WP because it exercises this WP's `reap.js`; this WP does **not** add a reverse
  `depends_on` (that would be a frontmatter cycle). The coupling that gates this
  WP's *production activation* on the harness passing is expressed as the
  Definition-of-Done merge-gate above, not as a dependency edge. Land the reap.js
  primitive + unit tests, let the harness validate it, and activate the
  run-job/dream wiring only once the live harness is green.
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
- **Windows post-parent-exit reaping (the leaderless reparented group-A member on
  win32) — DEFERRED to `WP-a10-windows-reap` (R5-2).** win32 `taskkill` has no
  negative-PGID equivalent, so this WP does **not** provide the leaderless-member
  guarantee on Windows; it keeps the pre-A10 timeout-path `taskkill /T /F` behavior
  there. Closing the Windows gap needs an absolute-path Windows authoritative
  process-table walk + a **live** Windows merge-gate test (Job Objects explicitly
  out); that is the follow-up WP, not this one.
- The **log-stream `0600` fix** in `run-job.js`/`dream.js` — **WP-a9-private-
  modes-repair** owns that (a different line in the same files).

## Definition of done

1. **MERGE-GATE (round-2 finding 13): the new kill authority may NOT activate in
   production until the live escape harness passes.** The reap.js primitive
   (`reapTree`/`reapGroup`/`readProcessTable`) and its **unit** tests may build and
   merge first, but the **production wiring** — the `run-job.js`/`dream.js` reap
   activation that makes the scheduled `builtin:dream` path use this kill authority
   — MUST NOT merge to `main` until **WP-a10-escape-harness** is green against this
   WP's reap.js on the same branch/stack. Treat a red or absent live harness as a
   hard block on activating the wiring. (This is a Definition-of-Done gate, not a
   `depends_on` frontmatter edge — a frontmatter cycle with the harness, which
   `depends_on` this WP for the code, is disallowed; see the coordination note in
   Implementation notes.)
2. All verification steps pass locally; output pasted into the PR body.
3. Conventional commits; PR titled
   `fix(security): reap the findable descendant tree to quiescence on every exit path (WP-a10-reap-mechanism)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
