---
id: WP-a10-supervisor-race-close
title: Close the nested-watchdog double-detach race — reap the real descendant tree (process-group + ppid sweep) on timeout, and add setsid/double-fork escape-negative tests
status: Draft
model: opus
size: M
depends_on: [WP-155, WP-157]
adrs: [ADR-0004, ADR-0028]
epic: audit-a10
---

# WP-a10-supervisor-race-close: One supervisor that reaps real descendants (audit A10)

## Context (read this, nothing else)

Wienerdog runs its nightly **dream** (memory consolidation) as a short-lived
scheduled job. **IRON RULE (ADR-0004): Wienerdog is just files** — a job's
children must **never outlive it**. On timeout, the supervisor must guarantee the
child tree is gone before it returns; a brain that keeps running past the
deadline is an ADR-0004 violation and burns the machine's resources unattended.

The 2026-07-15 audit action **A10** ("one supervisor/process group and reliable
timeout cleanup") requires:

> - "Remove the double-detached timeout race. Use one supervisor-owned process
>   group **or** an inner timeout strictly shorter than an outer supervisor which
>   can enumerate/kill real descendants."
> - "Test normal children plus `setsid`/double-fork escape attempts; after
>   timeout no descendant remains."

**Code reality (this is half-done — verify it, then close the rest).** Since
WP-141, `run-job.js` is explicitly the **single timeout authority** for a routine
(it sets `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0` and owns the watchdog), and its
`killProcessTree` already POSIX-group-kills (`kill(-pid, SIGKILL)`) / win32
`taskkill /T /F`. What remains is the two A10 bullets, on the **`builtin:dream`**
path:

**The double-detach race.** When the scheduler fires `builtin:dream`, there are
**two nested, independently-detached watchdogs**:

1. `src/cli/run-job.js` (**outer supervisor**) spawns the child
   `node …/wienerdog.js dream --yes` with `detached: platform !== 'win32'` (its
   own process group, "group A") and, on timeout, calls
   `killProcessTree(child.pid)` → `kill(-A, SIGKILL)`.
2. That child is `src/cli/dream.js`, whose `runBrainWithWatchdog` calls
   `spawnBrain` (`src/core/dream/brain.js`), which spawns the real `claude`
   **`detached: true`** — its **own** process group, "group B" — and installs its
   **own** inner watchdog that on timeout does `process.kill(-child.pid,
   'SIGKILL')` → `kill(-B, SIGKILL)`.

The brain is in **group B**, *not* group A. So the outer supervisor's
`kill(-A)` **never reaches the brain** — only the inner watchdog can. The race:
if the outer watchdog fires first (equal/racing timeouts, or the middle
`dream.js` process dies for any reason), the inner watchdog's timer dies with its
process before it fires, and **the brain (group B) and its subtree are orphaned
and keep running past the deadline**. The nested re-detach is exactly what lets a
descendant escape the supervisor's group-kill.

> **WP-157 note (dependency).** With the out-of-tree launcher (WP-157), the OS
> entry runs `launcher → run-job → dream.js → brain`. `run-job` remains the
> timeout supervisor (the launcher spawns it and waits); this WP reasons about
> the post-WP-157 tree. The launcher is an *ancestor* of `run-job`, not part of
> the reap target.

**The fix (chosen direction — recorded so nothing is left implicit).** Take the
ACTION-LIST's second branch: keep `run-job` as the single authority (WP-141) and
make the supervisor able to **enumerate and kill the real descendant tree**, not
just its own process group — so a child that re-detached into its own group
(the brain, the current leak) or `setsid`'d into a new session is still reaped.
Concretely, replace the group-only kill with a shared **`reapTree`** primitive
that, on POSIX, kills **both** (a) every process group that a descendant belongs
to **and** (b) every transitive `ppid`-descendant of the target — so it catches
a re-detached child (new group, still a ppid-descendant), a `setsid` child (new
session, `ppid` intact), and a double-fork child that reparented to `init` but
kept a descendant's process-group id. The inner `dream.js` watchdog uses the same
primitive (so standalone `wienerdog dream` also reaps a re-detached brain), which
dissolves the race: the brain is reaped whichever watchdog fires, because the
supervisor no longer depends on the brain being in *its* group.

**Honest boundary (state this; do not overclaim).** A process that **both**
`setsid`s into a new session/group **and** double-forks so it fully reparents to
`init` escapes *any* single-supervisor reap (it is in no descendant group and is
no longer a ppid-descendant) — that is indistinguishable from arbitrary
same-user background code and is **A12's** territory, not A10's. Critically, the
dream **brain is hermetically contained (A1): it has no Bash/shell**, so it
cannot `fork`/`setsid` anything — the escape tests exercise the *supervisor's*
robustness with synthetic children, and the combined setsid+double-fork case is
the documented residual. This is a `verify-then-reap` primitive at existing spawn
sites; it starts nothing that outlives the job (ADR-0004).

## Current state

**`src/cli/run-job.js`:**
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
Used in the watchdog: `spawn(command, args, { …, detached: platform !== 'win32',
… })`; on timeout `killProcessTree(child.pid, platform, opts)`. `killProcessTree`
is **exported** (so its tests and any caller keep working).

**`src/core/dream/brain.js`** `spawnBrain(o)` spawns the brain
`detached: true` ("own process group so WP-017 can group-kill the whole tree").
No watchdog here — the header says WP-017 (`dream.js`) wraps it.

**`src/cli/dream.js`** `runBrainWithWatchdog(o)`:
```js
const watchdog = new Promise((_resolve, reject) => {
  timer = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL'); } // group B only
    catch { /* already gone */ }
    reject(new WienerdogError(`dream timed out after …`));
  }, timeoutMs);
});
try { const result = await Promise.race([done, watchdog]); … }
finally { if (timer) clearTimeout(timer); }
```
`timeoutMs` here is `cfg.timeoutMs` (`dream_timeout_minutes`); `run-job`'s
watchdog uses `job.timeoutMinutes` (its own registration constant). The two are
independent — the race does not depend on which is longer, only on the brain
being in a group the firing watchdog does not kill.

Nothing today enumerates real descendants; both watchdogs kill a single process
group.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | src/core/reap.js | The shared reap primitive: `reapTree(pid, platform, seams)` — POSIX process-group-of-every-descendant + transitive-ppid-descendant SIGKILL, bounded re-sweep, best-effort/never-throws; win32 keeps `taskkill /T /F`. Pure, seam-injectable. |
| modify | src/cli/run-job.js | `killProcessTree` delegates to `reapTree` (keep the export + signature); the watchdog reaps the real tree of `child.pid`, not just group A. |
| modify | src/cli/dream.js | `runBrainWithWatchdog`'s timeout path calls `reapTree(child.pid, platform, seams)` instead of the inline `kill(-child.pid)`; thread a `platform` (inject, never mock `process.platform`) and an optional test seam. Standalone dream now reaps a re-detached brain too. |
| create | tests/unit/reap.test.js | `reapTree` unit cases: plain tree, re-detached child (own group), setsid child, double-fork-no-setsid (reparented, same group), win32 taskkill argv; injected `spawnSync`/`kill` seams + fake process table. |
| create | tests/integration/reap-escape.test.js | Live escape-negative harness (POSIX): a real supervised child that spawns each escape variant; after the watchdog fires, **zero** of the reachable descendants remain; the setsid+double-fork combined escapee is the asserted documented residual. |
| modify | tests/unit/scheduler-runjob.test.js | Assert `killProcessTree` now reaps via `reapTree` (the watchdog kills a re-detached grandchild, not only group A); the win32 branch still shells `taskkill /T /F`. |
| modify | tests/integration/dream.test.js | Assert the dream timeout path reaps a re-detached brain (no orphan after timeout) via the injected reap seam. |

### Exact contracts

**`src/core/reap.js`:**
```js
/** Reap a process and its real descendant tree. Best-effort; NEVER throws.
 *  win32: `taskkill /PID <pid> /T /F` (already tree-kills by the OS PID table).
 *  POSIX: SIGKILL (1) every process group that the target or any transitive
 *    ppid-descendant of the target belongs to, AND (2) every transitive
 *    ppid-descendant pid; then re-sweep (bounded) to catch fork races. This
 *    catches: a plain child tree; a child re-detached into its OWN process
 *    group (still a ppid-descendant — the dream-brain leak); a `setsid` child
 *    (new session, ppid intact); and a double-fork child that reparented to
 *    init but kept a descendant's process-group id. It does NOT catch a process
 *    that BOTH setsid's AND double-forks to fully detach (no descendant group,
 *    no ppid ancestry) — the documented A12 residual; the hermetic dream brain
 *    (A1, no shell) cannot produce one.
 *  @param {number} pid           the immediate supervised child's pid (group leader)
 *  @param {NodeJS.Platform} platform  inject it — never mock process.platform
 *  @param {{ kill?: typeof process.kill, spawnSync?: typeof import('child_process').spawnSync,
 *            maxSweeps?: number }} [seams]  test injection: `kill` (default
 *            process.kill), `spawnSync` (default child_process.spawnSync — used
 *            to read the process table AND for taskkill), `maxSweeps` (default 3).
 *  @returns {void} */
function reapTree(pid, platform, seams = {}) {}

module.exports = { reapTree };
```

**POSIX algorithm (the substance):**
1. **Snapshot the process table** via the injected `spawnSync` — e.g.
   `spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' })` —
   and parse `[pid, ppid, pgid]` triples. If the read fails/returns nothing,
   fall back to the legacy group-kill of `pid` alone (best-effort; never throw).
2. **Compute the descendant set** `S` = the transitive closure over `ppid` of
   `pid` (include `pid` itself).
3. **Compute the group set** `G` = `{ pgid of p : p ∈ S }`.
4. **Kill:** for each `g ∈ G`, `kill(-g, 'SIGKILL')`; for each `p ∈ S`,
   `kill(p, 'SIGKILL')`. Each kill is individually `try/catch`ed (a process may
   already be gone).
5. **Re-sweep** up to `maxSweeps` times (re-snapshot, recompute `S`/`G`, re-kill)
   to catch a child that forked between snapshot and kill; stop early when `S`
   becomes just `{pid}` or empty. Bounded — never loops unbounded.

Determinism/safety: the whole function is `try/catch`-wrapped so a malformed
`ps` output or a missing binary degrades to the legacy group-kill and never
throws. It must not kill `pid 1`, the supervisor's own pid, or anything outside
`S ∪ (groups of S)` — only descendants and their groups.

**`run-job.js` wiring.** `killProcessTree(pid, platform, seams)` becomes a thin
wrapper that calls `reapTree(pid, platform, seams)` (preserve the exported name +
signature; its `seams` already carry `{kill, spawnSync}`, which map straight onto
`reapTree`'s seams). The watchdog is otherwise unchanged.

**`dream.js` wiring.** In `runBrainWithWatchdog`, replace
`process.kill(-child.pid, 'SIGKILL')` with `reapTree(child.pid, platform,
seams)`, where `platform` is injected (default `process.platform`) and `seams`
is an optional test injection (default `{}`). Keep the `reject(new
WienerdogError(...))` and the `finally { clearTimeout(timer) }`.

### Escape-test matrix (the A10 acceptance)

`tests/integration/reap-escape.test.js` (POSIX; skip on win32 with a note) drives
a **real** supervised child (a tiny fixture script) that spawns, per case:
- **(a) plain grandchild** — a normal child that sleeps;
- **(b) re-detached grandchild** — spawned `detached:true` into its own group
  (the brain's exact pattern);
- **(c) setsid grandchild** — `setsid` into a new session, `ppid` intact;
- **(d) double-fork-no-setsid grandchild** — parent exits, grandchild reparents
  to `init` but keeps the group.

After the supervisor invokes `reapTree` (real, no seam), assert **each of
(a)–(d) is gone** (poll its pid until `kill(pid, 0)` throws `ESRCH`, bounded
timeout). Add a **non-vacuity baseline**: without the reap, at least one variant
survives (proves the test can fail). Add case **(e) setsid + double-fork
combined** asserted as the **documented residual** — it may survive; the test
records it as the honest A12 boundary, and the assertion is that the *contained*
tree (a)–(d) is fully reaped, not (e).

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step. Do not
  add a native process-tree library — `ps` (POSIX) + `taskkill` (win32) are the
  primitives, both already spawned elsewhere in the codebase.
- **`never mock process.platform`** — inject `platform` into `reapTree` and into
  `dream.js`'s watchdog (WP-038/049/051 rule). Tests select the OS branch via the
  argument and inject `spawnSync`/`kill`.
- **Single-authority stays true (WP-141).** `run-job` remains the timeout
  authority for a scheduled job; this WP does not add a new authority — it makes
  the existing supervisor's kill reach descendants that re-detached. The inner
  `dream.js` watchdog is retained for the **standalone** `wienerdog dream` path
  (no run-job wrapper) and now uses the same reap, so both paths reap correctly.
  Do **not** attempt to delete the inner watchdog or re-plumb which timeout
  "wins" — that is a larger re-architecture; the reap closes the race without it.
- **Best-effort, never fail the job on reap trouble.** A `ps` that is missing or
  returns garbage must degrade to the legacy group-kill; the watchdog's job is to
  raise the timeout `WienerdogError`, which must still happen. The reap must never
  throw into the watchdog.
- **Do not widen the kill.** The reap targets only `S` (ppid-descendants of the
  supervised child) and their process groups — never the supervisor's own pid,
  never `pid 1`, never an unrelated process. Guard explicitly.
- **Serialize after WP-155 and WP-157 (shared spawn/dispatch surface).** WP-155
  (In-Review) removes the test-exec env seams from `run-job.js`/`dream.js`/
  `brain.js` and establishes the `opts.resolveCommand` / `dream.run(argv, opts)`
  DI idiom; WP-157 (Ready) rewrites the OS entry to run through the launcher,
  changing the process chain this WP reasons about. Read the **actual
  post-WP-155/157** `run-job.js`/`dream.js` before editing — do not reintroduce a
  deleted seam, and thread reap seams via the established `opts`/`seams` pattern.
- **This is a durable timeout-model refinement of WP-141/ADR-0028.** It is
  scoped to complete the "single timeout authority" already ratified, not to
  introduce a new architectural fork, so it lives in this spec's notes rather than
  a new ADR — flag to the reviewer if the escape harness reveals the guarantee
  needs an OS-specific mechanism (cgroup/job-object) beyond `ps`+`taskkill`, as
  that *would* warrant an ADR.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] On timeout, the supervisor reaps every process the **contained** brain
      could produce — including a child re-detached into its own process group
      (the current leak) and a `setsid` child — leaving **zero** such descendants.
- [ ] The combined `setsid`+double-fork full-detach escapee is **documented** as
      the A12 residual (not silently claimed reaped); the hermetic brain (A1) has
      no shell to create one.
- [ ] `reapTree` kills only descendants of the supervised pid and their process
      groups — never the supervisor, `pid 1`, or an unrelated process — and never
      throws (a bad `ps` degrades to the legacy group-kill).

## Acceptance criteria (mapped to the A10 acceptance bullets)

- [ ] **[A10 — "Remove the double-detached timeout race."]** With the outer
      `run-job` watchdog firing while the brain is detached in its own group, the
      brain is reaped (no orphan) — asserted by a `dream.test.js` case that fires
      the reap against a re-detached fake brain and confirms no surviving pid.
- [ ] **[A10 — "Test normal children plus setsid/double-fork escape attempts;
      after timeout no descendant remains."]** `reap-escape.test.js` proves cases
      (a) plain, (b) re-detached, (c) setsid, (d) double-fork-no-setsid are all
      gone after `reapTree`; the non-vacuity baseline shows at least one survives
      without the reap; case (e) setsid+double-fork is the recorded residual.
- [ ] `reapTree` has direct unit coverage (fake process table via injected
      `spawnSync`; injected `kill` records the SIGKILL targets = exactly
      `S ∪ (−G)`); the win32 branch shells `taskkill /PID <pid> /T /F`.
- [ ] `killProcessTree` keeps its exported name/signature and now reaps the real
      tree; existing `scheduler-runjob` tests pass.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap|scheduler-runjob|dream-integration"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Re-architecting which watchdog "owns" the timeout, or deleting the inner
  `dream.js` watchdog — the reap closes the race without that; a single-watchdog
  redesign is a separate, larger change.
- Executable pinning / seam deletion / the launcher — **WP-154 / WP-155 /
  WP-156 / WP-157** (this WP depends on WP-155 + WP-157 and must not re-touch
  their concerns).
- A cgroup/PID-namespace (Linux) or job-object (win32) containment mechanism —
  out of scope; `ps`+`taskkill` is the "just files" primitive. If the escape
  harness shows it is required, flag it as an ADR-worthy follow-up, do not build
  it here.
- Defending against the combined setsid+double-fork full-detach escapee — that is
  the documented A12 residual (arbitrary same-user native code); the contained
  brain cannot produce one.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `fix(security): reap the real descendant tree on timeout — close the double-detach race (WP-a10-supervisor-race-close)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
