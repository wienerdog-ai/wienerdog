---
id: WP-a10-windows-reap
title: Windows post-parent-exit reaping — absolute-path authoritative process table, ppid-closure descendant kill, live Windows merge-gate
status: Draft
model: opus
size: M
depends_on: [WP-a10-reap-mechanism]
adrs: [ADR-0004, ADR-0028, ADR-0030]
epic: audit-a10
---

# WP-a10-windows-reap: Reap a leaderless reparented descendant on Windows (audit A10, deferred win32 half)

## Context (read this, nothing else)

Wienerdog runs its nightly **dream** (memory consolidation) as a short-lived
scheduled job. **IRON RULE (ADR-0004): Wienerdog is just files** — a job's
children must **never** outlive it. On an abnormal exit the supervisor must reap
the whole findable descendant tree to quiescence, on every platform.

`WP-a10-reap-mechanism` built the reap for the **POSIX** case and deliberately
scoped the leaderless-descendant guarantee to POSIX for that release (owner
decision, R5-2). The reason is concrete: on POSIX the supervisor reaps a
**leaderless reparented** group-A member — a plain child the middle spawned that
outlives the middle, still carrying `child.pid` as its process-group id, reparented
to `init` once the middle (the group leader) has exited — with a **negative-PGID**
`kill(-child.pid, SIGKILL)`, which reaches every surviving group member even after
the leader is gone. **Windows has no negative-PGID equivalent.** On win32
`reapGroup(pgid)` reduces to `taskkill /PID <pgid> /T /F`, which targets a **live
PID and its LIVE child tree** only — once the middle has exited (exactly the
abnormal-close case) that pid is gone from the process table, so `taskkill` reaches
**nothing** and the reparented child survives. `WP-a10-reap-mechanism` therefore
keeps the **pre-A10 single-timeout `taskkill /T /F`** behavior on win32 (no
regression, but no leaderless-member guarantee) and defers the Windows fix here.

This WP closes the Windows gap. Two product invariants bound the solution:

- **No bare-name process tooling (ADR-0028 / WP-154).** The nightly job PATH
  front-loads the user/agent-writable `~/.local/bin` (Windows: an equivalent
  user-writable dir ahead of `System32`), so **any** bare-name `tasklist` /
  `powershell` / `taskkill` is the executable-injection class WP-154 closed — and
  worse here, because the resolved binary decides what gets **killed**. Every
  Windows process-table read and every kill must resolve to its **absolute**
  `System32` path, verified structurally (reuse `exec-identity.verifyExecutable`)
  before spawn, never a PATH lookup.
- **"Just files" containment only (ADR-0004 / ADR-0030).** The fix is
  `verify-then-reap` logic at the existing supervisor; it starts nothing that
  outlives the job. **Windows Job Objects are explicitly OUT** — that is the
  heavier OS-containment class (the same class as the Linux cgroup / PID-namespace
  mechanism ADR-0030 already rules out). The primitive here is an authoritative
  **process-table walk** + a **ppid-closure** kill, mirroring the POSIX `/proc`
  reader.

**A skipped harness is not proof.** `WP-a10-escape-harness` skips on win32, so its
merge-gate is POSIX-only. This WP's guarantee is not closed until a **live Windows**
test — real Windows processes on a Windows runner — proves the leaderless reparented
member ends up gone. That live Windows merge-gate is a required deliverable here.

## Current state

- **`src/core/reap.js`** (created by `WP-a10-reap-mechanism`) exports
  `reapTree(pid, platform, seams)`, `reapGroup(pgid, platform, seams)`, and
  `readProcessTable(platform, seams)`. On **POSIX** it reads the authoritative
  table (Linux `/proc`, macOS absolute verified `/bin/ps`), computes the
  transitive ppid-descendant closure + groups, SIGKILLs both, and re-sweeps to two
  consecutive clean sweeps. On **win32** both primitives shell the **absolute
  System32** `taskkill /PID <pid> /T /F` (no bare-name fallback), and
  `readProcessTable` has **no** win32 branch — win32 relies on `taskkill`'s own
  live-PID tree walk, which cannot reach a leaderless reparented member.
- **`src/cli/run-job.js`** reaps on every child-exit path. On POSIX the abnormal
  settle runs three reaps (`reapTree(child.pid)` + `reapGroup(child.pid)` for
  group A, `reapGroup(brain.pgid)` for group B). On **win32** the abnormal-close
  group-reap authority does **not** activate — it keeps the pre-A10 timeout-path
  `taskkill /T /F` behavior (documented, not a guarantee).
- **`src/core/exec-identity.js`** exports `verifyExecutable(realpath, platform,
  ctx)` → `{ ok, why }`. Reuse it to gate the absolute Windows enumeration/kill
  binaries before spawn.
- **`tests/integration/reap-escape.test.js`** (from `WP-a10-escape-harness`) is the
  POSIX live harness; it skips on win32. No live Windows reap test exists yet.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/reap.js | Add a **win32 authoritative process-table reader** to `readProcessTable`: enumerate `{pid, ppid}` (Win32 has no persistent process-group; the win32 table is a ppid forest) via an **absolute-path** System32 binary — `Get-CimInstance Win32_Process` (select `ProcessId,ParentProcessId`) through absolute `System32\WindowsPowerShell\v1.0\powershell.exe`, or absolute `System32\tasklist.exe /FO CSV /V` — spawned **only** after `verifyExecutable(<absolute path>)` passes; **never** a bare-name `tasklist`/`powershell`. Give `reapTree` (and the win32 abnormal-close group-reap) a **win32 ppid-closure descendant kill**: compute the transitive `ppid` closure of `pid` from that table and `taskkill /PID <each> /F` (absolute System32 `taskkill`) so a **leaderless reparented** descendant is reached even after the parent exited; re-sweep to two consecutive clean sweeps (bounded), never-throws → degrade to the current live-tree `taskkill /T /F`. Keep POSIX behavior unchanged. |
| modify | src/cli/run-job.js | **Activate** the win32 abnormal-close group-reap authority now that the win32 reader exists: on win32 the abnormal settle uses the win32 ppid-closure reap for the group-A leaderless member (replacing the pre-A10 fallback restriction). Keep the POSIX path unchanged; best-effort, never change the job outcome/throw. |
| modify | tests/unit/reap.test.js | win32 unit cases: `readProcessTable('win32', …)` uses the **absolute** System32 enumeration binary (never bare `tasklist`/`powershell`), verified via `exec-identity`; the win32 ppid-closure kill reaches a **leaderless reparented** descendant (fake table: parent gone, child's ppid now points at a dead/init pid); a `tasklist`/`taskkill` planted earlier on PATH is never invoked; never-throws on a bad table (degrades to `taskkill /T /F`). |
| create | tests/integration/reap-windows.test.js | The **live Windows** merge-gate: real Windows processes — a supervised middle spawns a long-lived grandchild in the middle's tree, the middle is killed so the grandchild is **leaderless/reparented**, then the **real** win32 abnormal-close reap runs and the grandchild is polled to gone (`taskkill`/`Get-Process` absence, bounded timeout). Skips on non-win32 with an explicit note; self-cleaning (kill every fixture pid in `finally`). A skipped run is **not** a pass — this must execute on a Windows runner to close the gate. |

### Exact contracts

Extend `readProcessTable` (`src/core/reap.js`) with a win32 branch:

```js
/** win32: enumerate {pid, ppid} via an ABSOLUTE System32 binary
 *  (Get-CimInstance Win32_Process ProcessId/ParentProcessId, or tasklist /FO CSV),
 *  spawned ONLY after verifyExecutable(<absolute path>) passes — never a bare name.
 *  Win32 has no persistent process group, so the win32 table carries pgid == pid
 *  (the ppid forest is authoritative for descendancy). On any failure → null
 *  (caller degrades to the live-tree `taskkill /T /F`).
 *  @returns {Array<{pid:number, ppid:number, pgid:number}>|null} */
```

win32 `reapTree(pid, …)` gains a table-driven path: read the win32 table, compute
the transitive `ppid` closure of `pid` (include `pid`), `taskkill /PID <p> /F`
(absolute System32) for each `p` in the closure, re-sweep to two consecutive clean
sweeps (bounded by `maxSweeps`), guarded so it never targets `pid` 0/4 (System) or
`process.pid`; degrade to the current `taskkill /T /F` on any failure. No Job
Objects. `reapGroup` on win32 (fed the group-A `child.pid` on the abnormal path)
uses the same ppid-closure reap so a leaderless reparented member is reached.

## Security checklist

- [ ] Every Windows process-table read and every kill resolves to an **absolute
      System32** path (`powershell.exe` / `tasklist.exe` / `taskkill.exe`),
      verified via `exec-identity.verifyExecutable` before spawn; a
      `tasklist`/`powershell`/`taskkill` planted earlier on PATH is **never**
      invoked (unit-asserted; the live PATH-plant negative is covered by the
      Windows harness where feasible).
- [ ] The win32 ppid-closure kill targets only the transitive descendants of the
      supervised `pid` — never `pid` 0/4 (System/idle) or `process.pid` — and never
      throws (a bad table degrades to `taskkill /T /F`).

## Acceptance criteria

- [ ] `readProcessTable('win32', …)` enumerates `{pid, ppid}` via an **absolute
      System32** binary (never bare-name), verified via `exec-identity`; returns
      `null` (→ degrade) on any failure.
- [ ] On win32, `reapTree`/the abnormal-close reap reaches a **leaderless
      reparented** descendant (parent already exited) via the **ppid-closure**
      kill — the exact case the pre-A10 `taskkill /T /F` misses — proven both in a
      unit test (fake win32 table) and in the **live Windows** harness.
- [ ] `tests/integration/reap-windows.test.js` runs on a **Windows runner** (not
      merely skipped) and proves, with **real** processes, that a leaderless
      reparented grandchild ends up gone after the reap; it is self-cleaning.
- [ ] `run-job.js` activates the win32 abnormal-close group-reap authority
      (removing the `WP-a10-reap-mechanism` pre-A10 fallback restriction on win32);
      the POSIX path is unchanged.
- [ ] **No Job Objects / no PID-namespace containment** is introduced — the fix is
      the authoritative process-table walk + ppid-closure kill only.
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap|reap-windows"
npm test
npm run lint
# absolute-only Windows enumeration/kill — no bare-name literal is ever spawned:
! grep -nE "spawnSync\(\s*['\"](ps|taskkill|tasklist|powershell)['\"]" src/core/reap.js && echo "no bare-name literal — OK"
# the win32 authoritative reader + ppid-closure reap are present:
grep -nE "Win32_Process|tasklist|System32|ppid|ParentProcessId" src/core/reap.js
# the live Windows merge-gate exists and is win32-gated (not silently skipped):
grep -nE "process\.platform|win32|leaderless|reparent|ESRCH|taskkill" tests/integration/reap-windows.test.js
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only; no build step. The
  Windows primitives are absolute-path `Get-CimInstance`/`tasklist` + `taskkill` —
  no native process-tree library, no Job Objects.
- **`never mock process.platform`** — inject `platform` into `readProcessTable` /
  `reapTree`; tests select the win32 branch via the argument and inject the
  enumeration `spawnSync` + `verifyExecutable` seams (the seam idiom
  `WP-a10-reap-mechanism` established).
- **Reuse `exec-identity.verifyExecutable`** for the absolute Windows binaries — do
  not reinvent the structural check.
- **Serialize after `WP-a10-reap-mechanism`.** Read the actual shipped `reap.js` /
  `run-job.js` before editing; extend the win32 branch, do not re-architect the
  POSIX path or the single-authority timeout wiring (WP-141).
- **ADR-0030 stays the boundary of record** for the *adversarial* escapee
  (setsid+double-fork). This WP is ordinary platform scope, not an adversarial
  residual; if the live Windows harness reveals a findable class that still
  survives, that is a bug to fix here, not a new residual.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Out of scope (do NOT do these)

- The POSIX reap primitive + wiring — **WP-a10-reap-mechanism** (this WP depends on
  it and must not re-touch the POSIX path).
- The POSIX live escape harness — **WP-a10-escape-harness**.
- Windows Job Objects / PID-namespace / any heavier OS containment — explicitly out
  (ADR-0030); the authoritative process-table walk is the "just files" primitive.
- Re-architecting which watchdog owns the timeout — out of scope for A10 entirely.

## Definition of done

1. **MERGE-GATE: the win32 group-reap authority may NOT activate in production
   until the live Windows harness (`reap-windows.test.js`) passes on a Windows
   runner.** A skipped or absent live Windows test is a hard block on activating the
   win32 wiring — mirroring the POSIX merge-gate in `WP-a10-reap-mechanism`.
2. All verification steps pass locally (and the Windows harness on a Windows
   runner); output pasted into the PR body.
3. Conventional commits; PR titled
   `fix(security): windows post-parent-exit reaping (WP-a10-windows-reap)`.
4. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
5. This spec's `status:` flipped to `In-Review` in the same PR.
