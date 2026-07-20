---
id: WP-a10-reap-mechanism
title: Reap the findable descendant tree to quiescence on every exit path — authoritative process table (no bare ps), brain-PID hand-up, kill–rescan loop
status: In-Review
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
- **Group A is reaped by TWO primitives that cover different paths — see the
  settle-path reap matrix (round-2 + round-3 + R10-2/R11-1 findings).** On every
  settle path `run-job` must reap the middle's **group-A** descendants (a group-A
  descendant the middle spawned can outlive it) **in addition to**
  `reapGroup(brain.pgid)` for the detached group-B brain. Two group-A primitives
  cover different states, and **which one runs on which path is stated once, in the
  authoritative settle-path reap matrix below — this bullet explains WHY, it does
  NOT restate a per-path set.** The **checked** `reapGroup(child.pid)` — an explicit
  **negative-PGID** `kill(-child.pid)` — runs on **every** settle path: once the
  group-A leader (the middle, whose pid == group-A pgid because it was spawned
  `detached`) has exited, a fully NON-adversarial sleeping group-A child that
  reparented to `init` (still carrying `child.pid` as its PGID) is a **leaderless**
  member, and the negative-PGID kill reaches it even with the leader gone.
  `reapTree(child.pid)` — a ppid-closure tree kill — is the **timeout-path**
  primitive only: while the middle is alive it enumerates and kills the group-A
  descendants (including a re-detached one), and it is a harmless **no-op** once the
  middle has exited (its ppid-closure is then empty and it sends no kill). **The
  timeout path does NOT guarantee the middle is still alive:** `run-job`'s
  completion promise resolves on the child's **`'close'`** event, and a descendant
  holding the inherited stdout/stderr pipe open can delay `'close'` past the
  middle's actual exit — so the watchdog timer can fire while the middle has
  **already** exited (verified against `run-job.js:589–603`, which races the timer
  against `'close'`, not `'exit'`). `reapTree` on the timeout row is therefore a
  **best-effort extra**, not a liveness-dependent guarantee; the group reaps
  (`reapGroup(child.pid)` group-A + `reapGroup(brain.pgid)` group-B) are what
  actually cover the non-adversarial case **regardless** of whether the middle is
  still alive. A group-A descendant that has re-detached into a **DIFFERENT** pgid
  (`setsid`) once the middle exited is in no descendant group and is no longer a
  ppid-descendant — that is the already-accepted **ADR-0030 adversarial-escape
  residual** (setsid+double-fork; the hermetic brain has no shell to produce one),
  **not** a new blocker.

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
| create | src/core/reap.js | `reapTree(pid, platform, seams)` — authoritative process-table read (Linux `/proc`, macOS verified absolute `/bin/ps`, **never** bare `ps`), real ppid-descendant + group SIGKILL, **kill–rescan to two consecutive zero sweeps** (bounded), best-effort/never-throws; win32 **absolute System32** `taskkill /T /F` with **no bare-name fallback**. `reapGroup(pgid, platform, seams)` — the authenticated-PGID primitive: POSIX **negative-PGID** `kill(-pgid, SIGKILL)` (works even if the group leader already exited) **then a bounded poll (`kill(-pgid, 0)` until ESRCH, `maxPolls` default 5) to VERIFIED quiescence**, returning a **CHECKED result `{ reaped: boolean }`** — `reaped:true` only when the group is verified empty, `reaped:false` on timeout with members still present (R7-2); win32 absolute `taskkill /PID <pgid> /T /F` returning `{ reaped: true }` best-effort — **win32 reaches only a live pid + its live tree, NO negative-PGID equivalent, so NO leaderless-member guarantee (R5-2; deferred to WP-a10-windows-reap)**; best-effort/never-throws. Also exports `readProcessTable` for direct unit coverage. Pure, seam-injectable. |
| modify | src/cli/run-job.js | (a) `killProcessTree` delegates to `reapTree` (keep the export + signature). (b) For `builtin:dream`, **mint a per-run token BEFORE spawn** and pass it to the child (env var), and compute the per-run pidfile path `state/dream-brain.<token>.pid`. (c) Reap on **every** child-exit path per the **settle-path reap matrix** (Exact contracts). On **every** settle path (timeout, `'error'`, abnormal `'close'`, clean `'close'`) reap **group A** with the **checked** `reapGroup(child.pid)` (the negative-PGID `kill(-child.pid)` that reaches a leaderless reparented group-A member once the middle/group-leader has exited). **Additionally, on the timeout path ONLY** (where the middle *may* still be alive — `reapTree` is a **best-effort extra**, a no-op once the middle has exited; the timer races the child's `'close'` event, not `'exit'`, so it can fire post-exit) reap group A with `reapTree(child.pid)` — while the middle is alive its ppid-closure enumerates the group-A descendants incl. a re-detached one. Do **NOT** run `reapTree(child.pid)` on the `'error'` / `'close'` rows: the leader has exited so its ppid-closure is empty (a pointless no-op). So the **checked** `reapGroup(child.pid)` group-A reap runs on **every** settle path, while `reapTree(child.pid)` runs on the **timeout path only** (R9-1/R10-2). A `{ reaped: false }` from the clean-close group-A reap takes the **same bounded FINAL escalation + fail-loud** rule as the abnormal path (R8-1) — never a silent clean completion. On **any** settle for `builtin:dream` read the per-token pidfile and, if present, `reapGroup(brain.pgid)`. **`run-job` is the FINAL backstop — no later run ever reads another run's token pidfile, so a retained pidfile is never re-read (R8-1).** Therefore a `{ reaped: false }` from a settle-path `reapGroup(child.pid)` (group A — abnormal **or** clean `'close'`, R9-1) or `reapGroup(brain.pgid)` (group B) must **NOT** silently complete the job: run-job performs a **bounded FINAL escalation** — one further bounded `reapGroup` re-poll/re-kill of **both** the still-non-empty group-A pgid (`child.pid`) **and** the brain group (`brain.pgid`) — and if a group is **STILL** non-empty (`{ reaped: false }` again) it **FAILS LOUD** via the existing `failLoud` path (a durable `state/alerts.jsonl` alert + a `last_status:'error'` / `last_error_at` watermark) and surfaces a **non-zero / error job outcome**, rather than certifying the job clean while a group may still be live (a live group surviving the job is the ADR-0004 "nothing survives the job" violation). **Do NOT specify an unbounded block-until-`ESRCH`: the escalation is bounded** (an unkillable D-state process cannot be reaped by SIGKILL until the kernel returns — blocking forever would itself violate the ADR-0004 no-persistent-process spirit; that unkillable case is the ADR-0030 residual — surfaced by this same loud alert, never silently leaked). Delete the per-token brain pidfile once its group is **verified empty** (`{ reaped: true }`); do not silently retain a hollow pidfile as a "diagnostic residual" — a group that will not reap ends in the loud alert, not in a never-read leftover file (R7-2/R8-1). **POSIX guarantee only: on win32 the group-reap authority does NOT activate — the win32 abnormal-close path keeps the pre-A10 timeout-path `taskkill /T /F` behavior, leaderless-member case deferred to WP-a10-windows-reap (R5-2); win32 `reapGroup` returns `{ reaped: true }` best-effort, so this fail-loud escalation is POSIX-only.** Reap work is otherwise best-effort and never throws into the watchdog (the watchdog must still raise its timeout `WienerdogError`); the **one** deliberate outcome change is the R8-1 final-backstop fail-loud when a findable group cannot be reaped to quiescence. |
| modify | src/cli/dream.js | `runBrainWithWatchdog` uses `reapTree(child.pid, platform, seams)` on timeout; when a run token is present (set by `run-job`), **write** the per-run brain pidfile (`state/dream-brain.<token>.pid`, `0600`, `{pid, pgid}`, **atomically** via `writeFilePrivate`) right after `spawnBrain`. **If that `writeFilePrivate` hand-up write THROWS (fallible I/O — disk-full / permission / temp→final rename) while the just-spawned brain is alive, immediately `reapGroup(child.pid)` the brain group and FAIL the run (throw `WienerdogError` → run-job fail-loud + error outcome); on `{ reaped: false }` do one bounded FINAL escalation (unified with R8-1, still holding `child.pid` — `run-job` has no pidfile to retry) and, if still non-empty, throw a survivor-specific `WienerdogError` naming the un-reaped brain group so it is surfaced LOUDLY; never proceed into the brain race as if supervised, never a silent exit (R10-1/R11-3) — distinct from the sub-ms spawn→write residual.** In `finally`, when a run token is present, **PROVE group-B quiescence BEFORE releasing the hand-up**: first `reapGroup(child.pid, platform, seams)` (the negative-PGID group kill reaps any surviving group-B member even after the brain leader has exited — brain pgid == `child.pid`), **then remove the pidfile ONLY if `reapGroup` returned `{ reaped: true }`** (the group is verified empty). On `{ reaped: false }` (the bounded poll timed out with a member still present) **RETAIN** the pidfile so `run-job`'s abnormal-settle backstop can retry `reapGroup(brain.pgid)` (R7-2) — never delete a pidfile whose group is not yet verified quiescent. Deleting the pidfile before that verified reap is the R6-2/R7-2 bug: on a non-timeout brain-leader **non-zero exit** with a surviving same-PGID group-B child, dream.js's `finally` would drop the pidfile before `run-job`'s abnormal-settle runs, and `run-job` only `reapGroup(brain.pgid)`s when the pidfile is present — so the survivor would leak. Standalone (no token) writes no hand-up pidfile. Thread `paths` + an injected `platform` (never mock `process.platform`) + optional reap seam + an injected `writeFilePrivate` seam (test-only, to exercise the R10-1 hand-up write-failure guard). |
| create | tests/unit/reap.test.js | `reapTree`/`reapGroup`/`readProcessTable` unit cases (fake `/proc` root + fake `/bin/ps`; classification of plain/re-detached/setsid/double-fork; kill–rescan quiescence; never-throws on a bad table; darwin reader uses absolute `/bin/ps`, never bare `ps`; **churn regression (R7-3): a mid-scan vanishing unrelated pid — a numeric `/proc` dir whose per-entry `stat` read throws `ENOENT` — is SKIPPED, the snapshot still returns the surviving rows (NOT null), and the descendant reap still proceeds; only an unreadable `<procRoot>` root or a zero-usable-row parse yields null**; `reapGroup` does a **negative-PGID** kill, **polls to verified quiescence** and returns the **checked `{ reaped }`** — `{ reaped: true }` when it reaps an **exited-leader-with-live-member** group to empty, `{ reaped: false }` when a bounded (`maxPolls`) poll times out with a member still present (R7-2); win32 uses the **absolute System32** `taskkill` and **never** a bare-name / PATH-planted `taskkill`). |
| modify | tests/unit/scheduler-runjob.test.js | `killProcessTree` reaps via `reapTree` (kills a re-detached grandchild, not only group A); per the **settle-path reap matrix**, on the **timeout** path group A is reaped via **both** `reapTree(child.pid)` and `reapGroup(child.pid)` (assert both seams are invoked on the timeout path); on **abnormal close** (`'error'` / non-clean `'close'`) group A is reaped via `reapGroup(child.pid)` **only** — assert `reapGroup(child.pid)` is invoked and `reapTree(child.pid)` is **NOT** on the abnormal-close path (its ppid-closure is empty once the leader has exited — a no-op; the `reapGroup(child.pid)` negative-PGID kill is what covers a leaderless reparented group-A member); on a **clean** `'close'` (exit 0) group A is still reaped via `reapGroup(child.pid)` **only** — assert `reapGroup(child.pid)` is invoked and `reapTree(child.pid)` is **NOT** on the clean-close path (R9-1), and that an injected `{ reaped: false }` on the clean-close group-A reap drives the same bounded final escalation + `failLoud` + error outcome (an initial `{ reaped: true }` settles clean); for `builtin:dream` the **per-token** brain pidfile group is reaped via `reapGroup(brain.pgid)` and the pidfile deleted when `reapGroup` returned `{ reaped: true }`; **R8-1 final-backstop**: assert that an injected `{ reaped: false }` that **persists across** the bounded final escalation drives `run-job` to `failLoud` + a `last_status:'error'` watermark + a non-zero/error outcome (run-job as the FINAL backstop does NOT silently complete nor rely on a never-read retained pidfile), while a `{ reaped: false }` the escalation **resolves** to `{ reaped: true }` (or an initial `{ reaped: true }`) settles clean and deletes the pidfile; a second, lock-losing concurrent run reaps **only its own** token pidfile and never the other run's live brain; win32 branch shells the absolute System32 `taskkill /T /F` (and its `{ reaped: true }` best-effort return does not trigger the POSIX fail-loud path). |
| modify | tests/integration/dream.test.js | `runBrainWithWatchdog` writes the **per-token** brain pidfile at spawn and removes it on normal completion; the timeout path reaps a re-detached fake brain (no orphan) via the injected reap seam; **on a brain-leader non-zero exit the `finally` invokes `reapGroup(child.pid)` BEFORE deleting the pidfile, and deletes it only on `{ reaped: true }`** (assert the reap seam is called and ordered before the pidfile unlink — R6-2 — and that an injected `{ reaped: false }` result RETAINS the pidfile — R7-2); a middle killed at the spawn→hand-up boundary is covered (the sub-ms residual documented, not asserted reaped); **R10-1/R11-3: a seam-injected `writeFilePrivate` that THROWS on the hand-up write drives `dream.js` to `reapGroup(child.pid)` the just-spawned brain group and FAIL the run — assert the reap seam is invoked on `child.pid` and a `WienerdogError` is thrown; and assert the checked-result branches — `{ reaped: true }` (reaped, run fails), `false → true` (one bounded escalation reaps, run fails), and `false → false` (still non-empty → survivor-specific `WienerdogError`, error outcome, NOT a silent pass), with the escalation call count bounded (never proceeding unsupervised with no pidfile handed up)**. |

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
 *  Linux: readdir `<procRoot>`, then for every numeric dir parse
 *    `<procRoot>/<pid>/stat` (pid = field 1, ppid = field 4, pgrp = field 5 —
 *    parse AFTER the last ')' because comm may contain spaces/parens). No external
 *    binary. **Per-PID disappearance is normal churn, NOT a failure (R7-3):** a
 *    process routinely exits between the readdir and the per-entry stat read, so a
 *    per-entry `ENOENT`/`ESRCH` (or an unreadable/empty single `stat` file) SKIPS
 *    that pid and CONTINUES the snapshot — it must NOT null the whole table.
 *    Nulling on one vanished, unrelated pid would drop the caller to the legacy
 *    single group-kill and leak the separately-detached group-B brain — a fully
 *    non-adversarial timeout leak.
 *  darwin/bsd: spawnSync(psPath, ['-A','-o','pid=,ppid=,pgid=']) ONLY after
 *    verifyExecutable(psPath) passes; psPath MUST be absolute ('/bin/ps'), never
 *    'ps' (no PATH lookup). Parse the [pid, ppid, pgid] triples; a single malformed
 *    line is skipped, not fatal.
 *  Return `null` ONLY when the snapshot is unusable AS A WHOLE — the `<procRoot>`
 *    readdir itself fails (unreadable `/proc` root), `/bin/ps` is
 *    missing/unverifiable or its spawn fails, or parsing yields ZERO usable rows. A
 *    table with SOME rows (individual entries skipped for per-PID races) is
 *    returned, never nulled. The caller falls back to the legacy group-kill only on
 *    `null`.
 *  @returns {Array<{pid:number, ppid:number, pgid:number}>|null} */
function readProcessTable(platform, seams = {}) {}

/** Reap an AUTHENTICATED process GROUP by its pgid — the handed-up brain group —
 *  and CONFIRM the group is empty before reporting success (R7-2). Distinct from
 *  reapTree: the input is a PGID, not a PID, and the group leader may already have
 *  exited. Best-effort; NEVER throws; returns a CHECKED result.
 *  POSIX: SIGKILL the group by NEGATIVE pgid — kill(-pgid, 'SIGKILL') reaps every
 *    surviving member even when the leader is gone (a positive-pid table lookup
 *    would find nothing and leak the members) — then BOUNDED-POLL the group to
 *    quiescence: probe kill(-pgid, 0) and re-SIGKILL until it throws ESRCH (no
 *    member of the group remains) or maxPolls is reached. A successful SIGKILL only
 *    means the signal was ACCEPTED, NOT that every member is gone; on an error it
 *    proves even less — so the direct signal alone is never treated as completion.
 *    This poll is what turns "signal accepted" into "group verified empty". Guarded
 *    so it never targets pgid 1 or process.pid.
 *  win32: absolute System32 `taskkill /PID <pgid> /T /F` (pgid == the detached
 *    brain's pid); no bare-name fallback. NOTE (R5-2): on win32 this reaches only a
 *    LIVE pid and its LIVE child tree — there is NO negative-PGID equivalent, so it
 *    does NOT reach a leaderless reparented member once the group leader has exited.
 *    win32 therefore provides NO leaderless-member guarantee; that case is deferred
 *    to WP-a10-windows-reap (see the Platform-scope note in Context). win32 returns
 *    `{ reaped: true }` best-effort after the taskkill — it cannot verify the
 *    leaderless case it explicitly does not cover.
 *  @param {number} pgid  the handed-up brain process-group id
 *  @param {NodeJS.Platform} platform  inject it — never mock process.platform
 *  @param {{ kill?: typeof process.kill,
 *            readTable?: () => Array<{pid:number, ppid:number, pgid:number}>,
 *            spawnSync?: typeof import('child_process').spawnSync,
 *            maxPolls?: number }} [seams]  maxPolls default 5
 *  @returns {{ reaped: boolean }}  reaped=true ONLY when the group reached VERIFIED
 *    quiescence (POSIX: kill(-pgid, 0) threw ESRCH within maxPolls; win32:
 *    best-effort after taskkill). reaped=false on a POSIX timeout with members
 *    still present — the caller MUST NOT delete a pidfile whose group is not yet
 *    verified empty (R7-2). The INNER caller (dream.js's finally) RETAINS the
 *    hand-up pidfile on reaped=false so run-job's backstop can retry. The FINAL
 *    caller (run-job's abnormal settle — the last backstop, no later reader) does
 *    NOT rely on retention: on reaped=false it does ONE bounded final escalation and,
 *    if still non-empty, FAILS LOUD (failLoud + error watermark + non-zero outcome)
 *    rather than certifying clean (R8-1). */
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

**`reapGroup` — poll to VERIFIED quiescence, then report (R7-2).** `reapGroup` must
not be a single fire-and-forget `kill(-pgid, SIGKILL)`: a successful signal only
proves the signal was accepted, not that every group member is `ESRCH`, and on
error it proves even less — so a caller that deletes the hand-up pidfile right after
the signal loses the brain's identity while a member may still be alive (the
outer backstop can then no longer find it). POSIX algorithm:
1. `kill(-pgid, 'SIGKILL')` (guarded: never `pgid === 1`, never
   `pgid === process.pgid`/`process.pid`); each kill `try/catch`ed.
2. **Probe:** `kill(-pgid, 0)`. If it throws `ESRCH`, the group is **verified
   empty** → return `{ reaped: true }`. If it returns (a member survives), re-SIGKILL
   and re-probe.
3. Repeat step 2 up to `maxPolls` (default 5, bounded — never spin). If the group is
   still non-empty after the cap → return `{ reaped: false }` (do **not** throw).
The **checked result gates pidfile deletion**: the caller deletes the per-run brain
pidfile **only** on `{ reaped: true }`; on `{ reaped: false }` it **retains** the
pidfile so `run-job`'s abnormal-settle backstop can retry the group reap. A
negative-pgid probe of an already-empty group is a harmless `ESRCH`, so calling
`reapGroup` on a group that is already gone returns `{ reaped: true }` at once.

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

**Settle-path reap matrix — single source of truth (R10-2).** `run-job`'s settle
logic issues exactly the reaps in this table for `builtin:dream`. This table is the
ONE authoritative statement of which reap runs on which settle path; the prose
bullets below and the two sibling docs (`WP-a10-escape-harness`, ADR-0030) **cite
this table rather than restate it**. Every `reapGroup` uses the **checked
`{ reaped }`** contract, and a `{ reaped: false }` on ANY row takes the uniform
R8-1 rule (one bounded FINAL escalation → fail-loud, never a silent clean
completion). **POSIX-only (R5-2):** on win32 the group-reap authority does not
activate — the win32 path keeps the pre-A10 timeout-path `taskkill /T /F` behavior
only, and this matrix's `reapGroup` cells are no-ops there.

| Settle path | `reapTree(child.pid)` — group A (ppid-closure tree kill) | `reapGroup(child.pid)` — checked, group A (negative-PGID kill) | `reapGroup(brain.pgid)` — checked, group B |
|---|---|---|---|
| **timeout** (watchdog fired) | **YES** (best-effort extra) — while the middle is alive its ppid-closure enumerates + kills the group-A descendants (incl. a re-detached one); a harmless **no-op** if the middle has already exited (the timer races the child's `'close'`, not `'exit'` — a descendant holding the inherited stdio pipe open can delay `'close'` past the middle's real exit, so the timer can fire post-exit). The guarantee rests on the group reaps, not on `reapTree`'s liveness. | **YES** | **YES** — `builtin:dream`, when the per-token pidfile is present |
| **`'error'`** (spawn failure) | **NO** — no live middle; the ppid-closure is empty (a no-op) | **YES** | **YES** — `builtin:dream`, when the per-token pidfile is present |
| **abnormal `'close'`** (non-zero / signal) | **NO** — the group-A leader (the middle) has already exited; the ppid-closure is empty (a no-op) | **YES** | **YES** — `builtin:dream`, when the per-token pidfile is present |
| **clean `'close'`** (exit 0) | **NO** — the leader cleanly exited; the ppid-closure is empty (a no-op) | **YES** | **YES** — `builtin:dream`, when the per-token pidfile is present |

**The unified rule in one line:** `reapTree(child.pid)` runs on the **timeout path
ONLY** — the sole path on which the middle/group-A leader *may* still be alive, so
its ppid-closure *may* be non-empty. It is a **best-effort extra**, not a
liveness-dependent guarantee: the timeout fires when the timer wins the race against
the child's **`'close'`** event (not `'exit'`), and a descendant holding the
inherited stdio pipe open can delay `'close'` past the middle's real exit — so the
timer can fire while the middle has **already** exited, leaving `reapTree`'s
ppid-closure empty (a harmless no-op). The **checked** `reapGroup(child.pid)` group-A
reap runs on **EVERY** settle path and is what carries the guarantee: once the leader
is gone the negative-PGID `kill(-child.pid)` is the only primitive that reaches a
leaderless reparented group-A member (what `reapTree`'s empty closure cannot). The
**checked** `reapGroup(brain.pgid)` group-B reap runs on **every** settle path for
`builtin:dream` when the per-token pidfile is present. Rationale for confining
`reapTree` to the timeout row: after the middle exits (on `'error'` or any
`'close'`), `reapTree(child.pid)`'s ppid-closure finds nothing and issues no kill, so
it is pointless on those rows — a table read for zero effect; a group-A descendant
that re-detached into a **different** pgid (`setsid`) once the middle exited is the
ADR-0030 adversarial residual, not a `reapTree` gap. Any `{ reaped: false }` cell →
the R8-1 bounded FINAL escalation + fail-loud; `run-job` never certifies a job clean
while a findable group is live (ADR-0004 "nothing survives the job").

- **Mint a per-run token before spawn (`builtin:dream` only).** Before spawning
  the middle, mint a unique token (e.g. `crypto.randomBytes(8).toString('hex')`),
  put it in the child's env (e.g. `WIENERDOG_DREAM_RUN_TOKEN`, added to the `env`
  already built for `spawn`), and compute this run's pidfile path
  `state/dream-brain.<token>.pid`. The reaper below reads **only** that path.
- **Reap on every exit path**, with two distinct targets:
  - Reap **group A** per the **settle-path reap matrix** above (the authoritative
    per-path statement — do not restate a divergent subset). On **every** settle
    path run the **checked** `reapGroup(child.pid, platform, opts)` (the explicit
    **negative-PGID** `kill(-child.pid)` that reaches a leaderless reparented group-A
    member once the middle — the group-A **leader**, whose pid **is** the group-A
    pgid because it was spawned `detached` — has exited). **Additionally, on the
    timeout path ONLY** (where the middle *may* still be alive; `reapTree` is a
    **best-effort extra**, a no-op once the middle has exited — the timer races the
    child's `'close'`, not `'exit'`, so it can fire post-exit) run
    `reapTree(child.pid, platform, opts)`, whose ppid-closure — while the middle is
    alive — enumerates and kills the group-A descendants including a re-detached one. Do **NOT** run
    `reapTree(child.pid)` on the `'error'` / `'close'` rows: the leader has already
    exited and left the process table, so its ppid-closure is **empty** and issues no
    kill — a pointless no-op there. (These group-A reaps are distinct from the
    group-B `reapGroup(brain.pgid)` below.) **POSIX-only (R5-2):** on win32
    `reapGroup`'s `taskkill` cannot reach a leaderless reparented member (no
    negative-PGID equivalent — see the Platform-scope note in Context), so on win32
    the path keeps the **pre-A10 behavior**: the timeout-path `reapTree(child.pid)`
    (absolute `taskkill /PID <child.pid> /T /F` while the middle is still alive)
    only, with **no** leaderless-descendant guarantee. Do not present the win32
    `reapGroup` calls as delivering that guarantee; the Windows post-parent-exit case
    is deferred to **WP-a10-windows-reap**.
  - After the child settles by **any** path, for `builtin:dream` read **this run's**
    `state/dream-brain.<token>.pid`; if present, `reapGroup(brain.pgid, platform,
    opts)` to kill the detached group-B brain (covers a brain orphaned by a dead
    middle), and **delete the pidfile once that `reapGroup` returned `{ reaped:
    true }`** (the group is verified empty). On the **normal brain-leader-exit** path
    `dream.js`'s own `finally` has already `reapGroup`ed group B to verified
    quiescence and removed the pidfile (R6-2/R7-2), so this read is a best-effort
    no-op; `run-job`'s reap here is the **backstop** for the *other* leak path — a
    middle that died **before** `dream.js`'s `finally` could run (or whose `finally`
    reap timed out and RETAINED the pidfile), leaving the pidfile behind for
    `run-job` to find and retry.
  - **`run-job` is the FINAL backstop — escalate, do not silently certify clean
    (R8-1).** There is **no later reader** of a retained token pidfile (each run
    reads only its own), so a `{ reaped: false }` here is a live group that will
    survive the job unless run-job acts now. On any `{ reaped: false }` from a
    settle-path `reapGroup(child.pid)` (group A — on **every** settle path,
    abnormal **or** clean `'close'`, per R9-1) or `reapGroup(brain.pgid)`
    (group B), run-job performs **one bounded FINAL escalation** — a further bounded
    `reapGroup` re-poll/re-kill of the still-non-empty group(s) — and, if a group is
    **STILL** non-empty afterward, **FAILS LOUD**: it calls the existing `failLoud`
    (durable `state/alerts.jsonl` alert), writes the `last_status:'error'` /
    `last_error_at` watermark, and surfaces a non-zero / error job outcome — it never
    reports the job clean while a findable group is live (that would be the ADR-0004
    "nothing survives the job" violation). **The escalation is BOUNDED — never an
    unbounded block-until-`ESRCH`:** a process wedged in an uninterruptible kernel
    sleep (D-state) cannot be reaped by SIGKILL until the kernel returns, and
    blocking forever on it would itself violate ADR-0004's no-persistent-process
    spirit; that unkillable case is the ADR-0030 residual — it is surfaced by this
    same loud alert (never silently leaked as a hollow retained pidfile).
- **Clean `'close'` (exit 0) STILL reaps group A — via `reapGroup(child.pid)`
  ONLY, never `reapTree` (R9-1); see the settle-path reap matrix above.** A clean
  middle exit does **not** prove group A is empty: on POSIX a plain group-A child
  the middle spawned that did **not** inherit the stdout/stderr pipe (so it does not
  hold the `'close'` event open) can keep running after the middle exits 0, then
  reparent to `init` still carrying `child.pid` as its PGID. `run-job` watermarks
  `code === 0` as success and clears the alert, so leaving that child behind is a
  **false success** and an ADR-0004 "nothing outlives the job" violation. Per the
  matrix, the clean-close row runs the **checked** `reapGroup(child.pid)` (the
  **negative-PGID** `kill(-child.pid)` that reaches the leaderless reparented member)
  and **not** `reapTree` (pointless after a clean leader exit — `reapTree` stays on
  the timeout row only). `reapGroup` is **idempotent**: with no surviving member the
  negative-PGID probe is a harmless `ESRCH` and it returns `{ reaped: true }` at
  once, so the common clean path costs nothing. On `{ reaped: false }` the same
  bounded FINAL escalation + fail-loud rule (R8-1) applies uniformly — run-job never
  certifies a job clean while a findable group-A member is live. **POSIX-only
  (R5-2):** on win32 `reapGroup`'s `taskkill` reaches only a live pid and its live
  tree, so the win32 clean-close path keeps the pre-A10 no-op (leaderless-member case
  deferred to `WP-a10-windows-reap`). The per-token brain pidfile was already removed
  by `dream.js` on a clean brain exit, so the group-B read here is a best-effort
  no-op.
- All reap work is best-effort and never throws into the watchdog (the watchdog
  must still raise its timeout `WienerdogError`): a missing/stale pidfile is a
  no-op, a bad table degrades to the legacy group-kill. The **one** deliberate
  exception is the R8-1 final-backstop fail-loud — when the bounded final
  escalation still leaves a findable group non-empty, run-job **does** surface a
  non-zero / error outcome via `failLoud`, because a live group surviving the job
  is a real ADR-0004 failure worth raising, not reap "trouble" to swallow.

**`dream.js` wiring.** In `runBrainWithWatchdog`: after `spawnBrain` returns
`{child}`, **if** a run token is present in env (set by `run-job`), write
`state/dream-brain.<token>.pid` = `{ pid: child.pid, pgid: child.pid }` (the brain
is `detached`, so its pid is its pgid) **atomically** via `writeFilePrivate`
(`0600`, temp+rename — the write happens immediately post-spawn so the hand-up
window is sub-ms); `reapTree(child.pid, platform, seams)` on the timeout path
(replacing the inline `process.kill(-child.pid)`); keep `reject(new
WienerdogError(...))` and `finally { clearTimeout(timer) }`.

**Write-failure guard on the hand-up (R10-1).** `writeFilePrivate` is **fallible**
— on a disk-full, permission, or temp→final rename failure it **throws AFTER** the
brain has already been spawned. If that hand-up write throws, the middle can exit
with an error **without** a pidfile on disk, and `run-job`'s outer backstop (which
`reapGroup(brain.pgid)`s **only** when the per-token pidfile is present) never learns
the brain's identity — so the detached group-B brain survives the job, unsupervised
and unreaped. Therefore the hand-up write MUST run under a **cleanup guard**: **if the
`writeFilePrivate` write throws, `dream.js` immediately runs the checked
`reapGroup(child.pid, platform, seams)` on the just-spawned brain group and, whether
or not it reaps, treats the run as a FAILURE** — throw a `WienerdogError` so the
run-job supervisor records its durable fail-loud alert + error watermark + non-zero
outcome — and does **NOT** proceed into the brain race as if the hand-up succeeded.
**Define the `{ reaped: false }` branch explicitly, unified with the R8-1
final-backstop rule (do NOT invent a divergent one).** Because the pidfile write
FAILED, no identity was handed up, so `run-job`'s outer backstop can **never** retry
this group (it `reapGroup(brain.pgid)`s **only** when the pidfile is present) — this
guard is the **only** reaper that holds `child.pid`, so it must finish the job here,
not defer to a backstop that will never see it. On a `{ reaped: false }` from the
immediate guard reap, `dream.js` performs **one bounded FINAL escalation** — a
further bounded `reapGroup(child.pid, platform, seams)` re-poll/re-kill **while it
still holds `child.pid`** — and then:
- if the escalation reaches `{ reaped: true }` (the group is now verified empty),
  throw the `WienerdogError` (the run still FAILS — the brain was reaped, but the
  hand-up broke, so the run is not certified clean);
- if the escalation **still** returns `{ reaped: false }` (a findable but un-reapable
  group — the kernel D-state / ADR-0030 residual), throw a **survivor-specific**
  `WienerdogError` that names the un-reaped brain group (`child.pid`) so `run-job`'s
  fail-loud alert + error watermark + non-zero outcome **surface the surviving group
  LOUDLY** — never a silent exit that leaves an unsupervised brain unrecorded.
The escalation is **bounded** (never an unbounded block-until-`ESRCH` — that would
itself violate ADR-0004's no-persistent-process spirit); the un-reapable case is the
same ADR-0030 residual as R8-1's, surfaced by the same loud path (R11-3).
The failing write is reachable in tests via an injected `writeFilePrivate` seam
(thread it through `dream.js`'s JS-only `opts`, same idiom as the reap seam). The
standalone path (no run token) writes no hand-up pidfile and needs no guard (its
inner watchdog reaps the brain directly). **This is a durable I/O-failure path that
must be GUARDED, distinct from the accepted sub-ms spawn→hand-up-window residual (a
middle that dies BEFORE the atomic write, in the sub-ms gap — ADR-0030):** there the
write never runs and there is nothing to guard; here the **write itself fails** while
the brain is alive, a reachable non-adversarial I/O condition the reap must cover,
not book as a timing residual.

**In the same `finally`, when a run token is present, PROVE group-B quiescence
BEFORE releasing the hand-up (R6-2/R7-2).** Order is load-bearing: **first**
`reapGroup(child.pid, platform, seams)` — the **negative-PGID** `kill(-child.pid)`
that reaps any surviving group-B member even after the brain leader has exited
(the brain is `detached`, so its pgid **is** `child.pid`), and which now **polls to
verified quiescence and returns a checked `{ reaped }`** (R7-2) — **then** remove
this run's pidfile **only when it reported `{ reaped: true }`**. On `{ reaped:
false }` (the bounded poll timed out with a group-B member still present)
**RETAIN** the pidfile so `run-job`'s abnormal-settle backstop can retry
`reapGroup(brain.pgid)`; never release the hand-up while the group is not yet
verified empty. **Removing the pidfile before that verified reap is the bug:**
on a **non-timeout brain-leader non-zero exit** (the brain `'close'`s non-zero →
`runBrainWithWatchdog` throws its `WienerdogError` → this `finally` runs), a
same-PGID group-B child the brain spawned can survive the leader. If the `finally`
deletes the pidfile *before* proving quiescence, then by the time `run-job`'s
outer abnormal-settle runs the pidfile is gone — and `run-job` only
`reapGroup(brain.pgid)`s **when the pidfile is present** — so that surviving
group-B member leaks unreaped. Neither the inner watchdog (it fires **only** on
timeout, not on a brain-leader exit) nor `run-job` would reap it on this path. So
`dream.js` itself must guarantee **verified** group-B quiescence via
`reapGroup(child.pid)` before it deletes the pidfile, on **every** settle where the
brain leader has exited — not only on timeout. (`reapGroup` is best-effort and never
throws; a negative-PGID kill+probe of an already-empty group returns `{ reaped:
true }` at once — a harmless `ESRCH` — so running it unconditionally in the
token-present `finally` is safe.) The outer `run-job` abnormal-settle remains the
**backstop** for the *other* leak path — a middle that dies **before** this
`finally` runs, **or** a `finally` reap that timed out (`{ reaped: false }`) and
RETAINED the pidfile — leaving the pidfile behind for `run-job` to find and retry
`reapGroup(brain.pgid)`.

A **standalone** `wienerdog dream` (no run token) writes no hand-up pidfile and
does no `reapGroup` in `finally` — its inner watchdog reaps the brain directly.
Thread `paths`, an injected `platform` (default `process.platform`), and an
optional reap seam from the caller (`dream.js`'s `run(argv, opts)` already carries
a JS-only `opts` seam idiom — WP-155).

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
- [ ] **[R7-2]** `reapGroup` **polls to VERIFIED quiescence** (POSIX: re-SIGKILL +
      `kill(-pgid, 0)` until `ESRCH` or `maxPolls`) and returns a **checked `{ reaped:
      boolean }`** — never a single fire-and-forget kill. Callers delete the per-run
      hand-up pidfile **only** on `{ reaped: true }`; on `{ reaped: false }`
      `dream.js` **retains** it for `run-job`'s backstop retry. A successful SIGKILL
      alone (or an error) is never treated as completion.
- [ ] **[R8-1]** `run-job` is the **FINAL** backstop — no later run reads another
      run's token pidfile — so on a `{ reaped: false }` from its abnormal-settle
      `reapGroup(child.pid)` / `reapGroup(brain.pgid)` it does **NOT** silently
      complete: it performs one **bounded** FINAL escalation of both groups and, if a
      group is still non-empty, **FAILS LOUD** (`failLoud` alert + error watermark +
      non-zero outcome) rather than certifying the job clean while a findable group
      is live. The escalation is bounded (never an unbounded block-until-`ESRCH`); a
      group that repeated SIGKILL cannot reap (kernel D-state) is the ADR-0030
      residual, surfaced by the same loud alert, never a hollow retained pidfile.

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
- [ ] **[Group-B quiescence before hand-up release, R6-2/R7-2]** On a **brain-leader
      non-zero exit** (not a timeout) with a surviving same-PGID group-B member,
      `dream.js`'s `finally` calls `reapGroup(child.pid)` **before** it deletes the
      per-token pidfile, and deletes the pidfile **only** when that `reapGroup`
      returned `{ reaped: true }` (verified-empty group); on `{ reaped: false }` it
      **retains** the pidfile for `run-job`'s backstop — asserted in `dream.test.js`
      that the reap seam is invoked and ordered strictly before the pidfile unlink,
      and that a `{ reaped: false }` result leaves the pidfile in place. (Deleting
      the pidfile before a verified reap would let a surviving group-B child escape
      both `dream.js` and `run-job`'s pidfile-gated backstop.) The live
      post-`'close'` proof — the surviving member reaching `ESRCH` **before** the
      pidfile is deleted — is on the POSIX gate in `WP-a10-escape-harness`.
- [ ] **[Hand-up write-failure guard, R10-1 + R11-3]** When the per-token pidfile
      `writeFilePrivate` hand-up write **throws** (fallible I/O — disk-full /
      permission / temp→final rename failure) while the just-spawned brain is alive,
      `dream.js` **immediately** `reapGroup(child.pid)`s the brain group and **fails
      the run** (throws `WienerdogError` → `run-job` fail-loud + error watermark +
      non-zero outcome) rather than proceeding into the brain race with no pidfile
      handed up — which would leave the detached group-B brain unsupervised
      (`run-job`'s backstop only `reapGroup(brain.pgid)`s when the pidfile is present,
      and here the failed write handed up nothing, so `run-job` can never retry this
      group; this guard is the only reaper holding `child.pid`). On a
      `{ reaped: false }` from the guard reap, `dream.js` does **one bounded FINAL
      escalation** (unified with R8-1) while still holding `child.pid`, then throws —
      **survivor-specific** when the group is still non-empty, so the un-reaped brain
      is surfaced LOUDLY, never a silent exit. Unit-asserted in `dream.test.js` with a
      seam-injected `writeFilePrivate` that throws, across the checked-result
      sequences: `{ reaped: true }` (reaped, run fails), `false → true` (escalation
      reaps, run fails), and `false → false` (still non-empty → survivor-specific
      `WienerdogError`, error outcome, NOT a silent pass); the reap seam is invoked on
      `child.pid` and the escalation call count stays bounded. This is a durable I/O
      path, **distinct** from the accepted sub-ms spawn→hand-up-window residual
      (ADR-0030). The **live** proof — a real
      surviving brain child reaching `ESRCH` via the guard reap — is on the POSIX
      gate in `WP-a10-escape-harness`.
- [ ] **[Cross-run isolation, round-2]** A second, lock-losing concurrent dream
      run reaps **only its own** token pidfile and never reads or kills the first
      run's live brain — unit-asserted with two distinct tokens.
- [ ] **[Abnormal-close group-A, round-2 + round-3 + R11-2, POSIX]** Per the
      **settle-path reap matrix**, on `'error'` / non-clean `'close'` on **POSIX**
      `run-job` reaps the middle's **group-A** members via the **checked**
      `reapGroup(child.pid)` **only** (distinct from the group-B
      `reapGroup(brain.pgid)`); `reapTree(child.pid)` is **NOT** invoked on those rows
      (its ppid-closure is empty once the group-A leader has exited — a no-op).
      It is the `reapGroup(child.pid)` **negative-PGID** kill that reaps a
      **leaderless reparented group-A member**. Unit-asserted in
      `scheduler-runjob.test.js` that on the abnormal-close path `reapGroup(child.pid)`
      is invoked and `reapTree(child.pid)` is **not**; the live proof that such a
      member ends up **ESRCH** on the real post-`'close'` path is
      `WP-a10-escape-harness`. (`reapTree(child.pid)` is asserted on the **timeout**
      row only — where the middle may still be alive — per the matrix.)
- [ ] **[Clean-close group-A, R9-1, POSIX]** On a **clean** `'close'` (exit 0) on
      **POSIX**, `run-job` still reaps group A via `reapGroup(child.pid)` (the
      negative-PGID group kill) and **not** `reapTree` — so a plain group-A child
      the middle spawned that did not inherit the stdio pipe and survived the clean
      middle exit is reaped to `ESRCH` rather than left behind under a false
      `code === 0` success. On `{ reaped: false }` the same bounded final escalation
      + fail-loud (R8-1) applies. This completes the settle-path matrix — timeout,
      `'error'`, non-clean `'close'`, **and** clean `'close'` all reap group A (and,
      for `builtin:dream`, group B) to verified quiescence. Unit-asserted in
      `scheduler-runjob.test.js` that `reapGroup(child.pid)` is invoked and
      `reapTree(child.pid)` is **not** on the clean-close path; the live
      leaderless-survivor → `ESRCH` proof on the real clean-`'close'` path is
      `WP-a10-escape-harness`.
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
- [ ] **[Authenticated-PGID, round-2 + R7-2]** `reapGroup(pgid)` issues a
      **negative-PGID** `kill(-pgid)`, **polls to verified quiescence**
      (`kill(-pgid, 0)` until `ESRCH`, bounded by `maxPolls`), and reaps an
      **exited-group-leader-with-live-member** group — returning `{ reaped: true }`
      only when the group is verified empty and `{ reaped: false }` on a bounded
      timeout with a member still present (unit-asserted with an injected table/kill
      seam for both outcomes). The recycled-id case is the documented ADR-0030
      residual (no test asserts it reaped).
- [ ] **[R8-1 — final backstop escalates + fails loud, never certifies clean]**
      On an abnormal settle for `builtin:dream`, when the backstop
      `reapGroup(child.pid)` or `reapGroup(brain.pgid)` returns `{ reaped: false }`,
      `run-job` performs **one bounded FINAL escalation** (a further bounded
      `reapGroup` of the still-non-empty group(s)) and, if a group is **still**
      non-empty, calls `failLoud` (durable `state/alerts.jsonl` alert), writes the
      `last_status:'error'` / `last_error_at` watermark, and surfaces a non-zero /
      error outcome — it does **not** silently complete nor rely on a never-read
      retained pidfile. Unit-asserted in `scheduler-runjob.test.js`: an injected
      `{ reaped: false }` (persisting across the escalation) drives `failLoud` and an
      error outcome; a `{ reaped: true }` (or a `{ reaped: false }` that the
      escalation resolves) does not. The escalation is bounded — no unbounded
      block-until-`ESRCH` — and the unkillable (kernel D-state) group is the
      ADR-0030 residual surfaced by that same alert. POSIX-only (win32 `reapGroup`
      returns `{ reaped: true }`, so this path does not activate there — R5-2).
- [ ] **[Quiescence]** `reapTree` re-sweeps until two consecutive clean sweeps
      (bounded by `maxSweeps`); a fake table that "spawns" a child between the
      first snapshot and the first kill is fully reaped by the loop — unit-tested
      with an injected table generator.
- [ ] **[R7-3 — per-PID churn does not null the snapshot]** `readProcessTable`
      handles per-PID disappearance races: on Linux a numeric `<procRoot>` dir whose
      per-entry `stat` read throws `ENOENT`/`ESRCH` (the process exited between the
      readdir and the read) is **SKIPPED** and the walk CONTINUES, returning the
      surviving rows — it does **not** null the whole table. `null` is returned only
      when the snapshot is unusable as a whole (unreadable `<procRoot>` root,
      missing/unverifiable `/bin/ps`, or zero usable rows). Unit-asserted with a fake
      `/proc` whose one entry vanishes mid-scan: the reap still enumerates and kills
      the real descendant tree rather than falling back to the legacy group-kill.
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
# R9-1: group-A reapGroup(child.pid) runs on EVERY settle path — including a clean
# close (exit 0) — while reapTree(child.pid) is confined to the timeout path ONLY
# (never run once the leader has exited — 'error', abnormal 'close', or clean 'close'):
grep -nE "clean.*close|every settle|reapGroup\(.*child\.pid" src/cli/run-job.js
grep -nE "R9-1|clean.?close|reapGroup\(.*child\.pid|reapTree.*NOT|not.*reapTree" tests/unit/scheduler-runjob.test.js
# R6-2: dream.js's finally reaps group B (reapGroup child.pid) BEFORE deleting the
# pidfile, so a brain-leader non-zero exit cannot leak a surviving group-B member:
grep -nE "reapGroup\(.*child\.pid" src/cli/dream.js
# R10-1: the hand-up pidfile write is GUARDED — a failed writeFilePrivate reaps the
# just-spawned brain group (reapGroup child.pid) and fails the run (throw), so no
# unsupervised brain is left with no pidfile handed up:
grep -nE "writeFilePrivate|reapGroup\(.*child\.pid|R10-1" src/cli/dream.js
grep -nE "R10-1|write.?fail|writeFilePrivate|reapGroup|throw" tests/integration/dream.test.js
# R11-3: the R10-1 guard's { reaped: false } branch does one bounded FINAL escalation
# (still holding child.pid — run-job has no pidfile to retry) and then throws a
# survivor-specific fail-loud, never a silent exit:
grep -nE "reaped|escalat|survivor|bounded|R11-3" src/cli/dream.js
grep -nE "R11-3|reaped.*false|false.*true|escalat|survivor|bounded" tests/unit/reap.test.js tests/integration/dream.test.js
# R5-2: the win32 leaderless-member scope boundary is carried into code comments
# (win32 group-reap provides no leaderless guarantee; POSIX-only this release):
grep -niE "leaderless|no negative-pgid|windows-reap|pre-A10|POSIX-only" src/core/reap.js src/cli/run-job.js
# R7-2: reapGroup polls to VERIFIED quiescence (probe kill(-pgid, 0)/re-kill until
# ESRCH, bounded by maxPolls) and returns a CHECKED { reaped } result — not a single
# fire-and-forget kill:
grep -nE "reaped|maxPolls|kill\(\s*-?[^,]+,\s*0\)|ESRCH" src/core/reap.js
# R7-2: dream.js and run-job.js delete the hand-up pidfile ONLY on { reaped: true }
# and RETAIN it on a timed-out reap for the backstop:
grep -nE "reaped|retain|only.*reaped|unlink" src/cli/dream.js src/cli/run-job.js
# R8-1: run-job (the FINAL backstop) does a bounded final escalation on { reaped: false }
# and FAILS LOUD (failLoud + error watermark) rather than certifying clean — it does
# NOT rely on a never-read retained pidfile:
grep -nE "failLoud|final escalation|last_status|backstop|not certify|reaped: false" src/cli/run-job.js
grep -nE "R8-1|failLoud|escalat|reaped" tests/unit/scheduler-runjob.test.js
# R7-3: readProcessTable skips a per-PID disappearance (ENOENT/ESRCH on a single
# /proc entry) and continues the snapshot rather than nulling the whole table:
grep -nE "ENOENT|ESRCH|continue|skip" src/core/reap.js
# R7-3: the churn-regression test asserts a mid-scan vanishing pid does not abort
# the descendant reap:
grep -nE "ENOENT|vanish|churn|mid-scan|skip" tests/unit/reap.test.js
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

## Fix-pass amendment (2026-07-20)

Adversarial review of the In-Review implementation (wd-reviewer APPROVE with
reconciliations; Codex NO-SHIP with two execution-proven fail-open findings).
Contract deltas only — the design narrative above is unchanged.

1. **`reapGroup` is async** — `Promise<{ reaped: boolean, why?: string }>`,
   with the inter-poll delay awaited on the event loop. A synchronous poll
   blocks libuv's `waitpid`, so the supervisor's OWN just-SIGKILLed direct
   child stays a zombie — and a zombie still counts as a live group member for
   `kill()` — meaning `kill(-pgid, 0)` could never reach `ESRCH` and **every
   timeout would spuriously report `{ reaped: false }`**. The checked-result
   semantics, bounds (`maxPolls`), and never-throws contract are unchanged; all
   callers (`run-job` settle, `dream.js` finally and the R10-1 guard) `await`
   it.
2. **The verification seam is `verifyPs`, reimplemented locally in `reap.js`**
   (identical structural checks: regular file, execute bit, owner ∈ {uid,
   root}, no group/other-writable non-root ancestor). The spec's original
   "reuse `exec-identity.verifyExecutable`" is unimplementable as written: the
   WP-154 fix-pass made every exec-path helper module-internal and the
   pinned-exec canary **bans the `verifyExecutable` identifier outside
   `exec-identity.js`** (execution-only encapsulation, R13/R15).
3. **win32 `taskkill` is CHECKED, and ONLY exit 0 is success** (replaces the
   Exact-contract clause "win32 returns `{ reaped: true }` best-effort after
   the taskkill"). `taskkillTree` returns `{ ok, why }`: success is **exit `0`
   ONLY**. Every non-zero exit — **including `128`** — a terminating signal, a
   spawn throw/error, and an **absent** System32 `taskkill.exe` are failures
   with a diagnostic. **G1 (2026-07-20):** exit `128` is NOT treated as
   "already gone": Win32 error 128 is `ERROR_WAIT_NO_CHILDREN`, and an
   executable can return 128 on an init failure (desktop-access / resource
   exhaustion) BEFORE killing anything, so a LIVE tree can exit 128 — taskkill
   publishes no exit-code contract making 128 uniquely "already gone". Since
   win32 is POSIX-deferred (no leaderless guarantee; `settleReaps` / the R8-1
   fail-loud escalation never run on win32), a false-negative `{ reaped: false }`
   on a genuinely-gone tree is a harmless surfaced diagnostic while a
   false-positive `{ reaped: true }` on a live tree is the real hazard — the
   conservative exit-0-only rule is the safe one. win32 `reapGroup` returns
   `{ reaped: true }` only on exit 0, else `{ reaped: false, why }`; win32
   `reapTree` surfaces the same failure via its diagnostic (item 5). The
   supervisor never claims the tree stopped when taskkill never ran or failed.
   **Scope unchanged:** the win32 `{ reaped: false }` is a surfaced diagnostic
   only — the R8-1 fail-loud escalation stays POSIX-only, and an authoritative
   Windows liveness check (distinguishing "already gone" from "init-failed
   live") is deferred to `WP-a10-windows-reap`.
4. **The R8-1 final-fail-loud path RELEASES the token pidfile after the loud
   record — but ONLY when that record actually persisted (G2, 2026-07-20).**
   When the bounded final escalation still leaves a group `{ reaped: false }`,
   `run-job` deletes the retained token pidfile **after** `failLoud` has
   appended the durable alert — the alert is the record, and no later run ever
   reads this run's token, so retention would be a never-read hollow leftover.
   **But `failLoud` now returns whether the durable `appendAlert` actually
   persisted** (it catches an append failure and still resolves); if
   `state/alerts.jsonl` could not be written (disk exhaustion), the token
   pidfile is the SOLE surviving record of the survivor's recovery identity
   (its PGID), so `run-job` **RETAINS** it as the fallback rather than delete a
   never-recorded survivor. (I chose to thread the boolean back from `failLoud`
   — additive; its other callers ignore the return — over re-checking
   `appendAlert` at the `runJob` layer, as the smaller honest change.) R7-2's
   retain-for-backstop rule is unchanged where a later reader exists:
   `dream.js`'s finally (retains for run-job) and run-job's pre-escalation
   stage.
5. **A non-zero / signalled / errored `/bin/ps` yields a `null` table.**
   `readTablePs` requires `status === 0`, no termination signal, and no spawn
   error; a failing/interrupted ps that emitted parseable *partial* rows is
   NOT an authoritative snapshot (accepting it would skip the legacy fallback
   and silently omit a separately-detached descendant group — execution-proven).
   `null` → the legacy group-kill fallback, and the degradation is **visible**:
   `reapTree` now returns a diagnostic `{ degraded: boolean, why }` (legacy
   fallback, table lost mid-sweep, quiescence not observed within `maxSweeps`,
   or a failed win32 taskkill) instead of `void` — still best-effort,
   never-throws.
