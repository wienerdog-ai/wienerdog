# ADR-0030: Bounded user-level process supervision — reap the findable descendant tree to quiescence; adversarial full-detach is A12

Status: Proposed
Date: 2026-07-19

> **OWNER-APPROVED IN PRINCIPLE (2026-07-19).** In the A10 Codex round-1 review
> the owner ratified this decision *in principle*: the nightly supervisor reaps
> the **findable** descendant tree to quiescence and does **not** claim closure
> against an adversarially full-detaching native process — that residual is
> A12's, mitigated meanwhile by the A1 hermetic runtime profiles. Following the
> ADR-0028 flow, this ADR stays **Proposed** until the owner ratifies it at the
> `Ready`-flip of the A10 WPs that cite it; a later WP ruling that changes a
> detail here lands as a dated amendment (the ADR-0024 convention). The A10 WPs
> (`WP-a10-reap-mechanism`, `WP-a10-escape-harness`) are the per-file
> design-of-record; this ADR is the durable boundary they cite instead of an
> in-spec residual note.

## Context

Wienerdog runs its nightly **dream** (memory consolidation) as a short-lived
scheduled job. **IRON RULE (ADR-0004): Wienerdog is just files** — a job's
children must **never** outlive it. The 2026-07-15 security audit action **A10**
("one supervisor/process group and reliable timeout cleanup") requires that
after a timeout no descendant of the job remains, including `setsid`/double-fork
escape attempts.

The scheduled `builtin:dream` path has **two nested, independently-detached
watchdogs**: the outer `run-job` supervisor spawns `dream.js` detached in its own
process group ("group A"); `dream.js` spawns the real `claude` brain **detached
again** in a *different* group ("group B") with its own inner watchdog. An
outer `kill(-A)` never reaches the brain in group B; and if the middle `dream.js`
process dies for any reason, its inner watchdog's timer dies with it and the
brain (group B) is orphaned and keeps running past the deadline (WP-a10 code
analysis, verified 2026-07-19: `run-job`'s `done` promise resolves on child
`'close'` and the `finally` clears the watchdog timer, so a middle-process death
currently fires **no** cleanup at all).

A single **user-level** supervisor can only find a descendant by two authoritative
signals: the **parent-process (`ppid`) ancestry** chain, and the **process
groups** that its descendants belong to. A process that **both** `setsid`s into a
new session/group **and** double-forks so it fully reparents to `init`/`launchd`
is, by construction, in **no** descendant group and is **no longer** a
ppid-descendant — it is indistinguishable from arbitrary same-user background
code and is unreachable by any user-level reap. This ADR fixes the reap's
findability guarantee and states that unreachable class honestly rather than
booking it as a silent per-spec residual.

## Decision

**1. Reap the findable descendant tree to quiescence.** The supervisor's cleanup
primitive (`src/core/reap.js`) reaps, on POSIX, (a) every transitive
`ppid`-descendant of the supervised pid and (b) every process group that any such
descendant belongs to, then **re-snapshots and re-kills in a bounded loop until
two consecutive sweeps observe zero remaining descendants** (a fork occurring
between snapshot and kill is caught on the next sweep; the loop is capped so it
never spins unbounded). This replaces single-snapshot reaping and closes the
snapshot→kill TOCTOU for every process the supervisor can find. A **second,
distinct** primitive, `reapGroup(pgid)`, serves the authenticated-PGID contract
(the handed-up brain group): it issues an explicit **negative-PGID**
`kill(-pgid)` that reaches surviving members even after the group leader has
exited, and is kept separate from `reapTree(pid)`'s PID-tree contract so a bare
pgid is never mis-handled as a pid. On win32 the OS PID-table `taskkill /T /F`
(absolute System32 only) remains the primitive.

**2. Read the process table from an authoritative source, never a PATH-resolved
binary.** The nightly job PATH deliberately front-loads the user/agent-writable
`~/.local/bin` (ADR-0009), so a bare-name `ps` is the exact
executable-injection class ADR-0028/WP-154 closed — and worse here, because the
resolved binary is used as a **kill** authority. The reap therefore reads the
process table from Linux `/proc` directly (no external binary) and, on
macOS/BSD, from the **absolute, SIP-protected** `/bin/ps` verified structurally
before spawn (reusing the WP-154 `exec-identity` verification: regular file,
owner ∈ {current, root}, no group/other-writable ancestor). A `ps` planted
earlier on PATH can never be the reaper. The same rule binds the **kill** tool on
win32: only the **absolute System32 `taskkill.exe`** may execute as kill
authority — there is **no bare-name `taskkill` fallback** (the Windows clean-run
PATH front-loads the user-writable `~/.local/bin` ahead of System32, so a bare
name is the same injection class, and worse because it kills). An absent System32
`taskkill.exe` is a diagnosed no-op, never a bare-name spawn.

**3. Bound the guarantee — full closure for findable trees; adversarial
full-detach is A12.** The reap is a **total** guarantee for the process classes a
user-level supervisor can find: a plain child tree, a child re-detached into its
own process group (the dream-brain leak), a `setsid` child (new session, `ppid`
intact), and a double-fork-no-`setsid` child (reparented to init, group
retained). It is **not** a claim against a process that combines `setsid` **and**
double-fork to fully detach — that escapee is beyond user-level supervision.
Wienerdog does not leave that gap unmitigated: the dream **brain is hermetically
contained (A1, ADR-0025): it has no Bash/shell**, so it cannot `fork`/`setsid`
anything, and the combined escapee cannot be produced by the contained job.
Final closure of arbitrary same-user native code is **audit A12's** territory.

No sentence anywhere (docs, README, VISION) may claim the scheduled run is
tamper-proof against same-user native code, or that the reap defeats a full
setsid+double-fork detach.

## Honest boundary (the A10 residual)

- **Findable classes: closed.** After a timeout — or after the middle `dream.js`
  dies while the brain lives — the supervisor reaps the brain and every reachable
  descendant to quiescence, whichever watchdog fires and even when none does
  (the outer supervisor learns the brain's pid/pgid before the middle can die,
  so it can reap a reparented orphan). On an abnormal middle exit the supervisor
  reaps **two distinct groups** via the **checked** `reapGroup`: the middle's
  **group-A** group (`reapGroup(child.pid)` — the negative-PGID kill that reaches a
  leaderless reparented group-A member once the middle/group leader has exited) and
  the detached **group-B** brain group (`reapGroup(brain.pgid)`).
  `reapTree(child.pid)`'s ppid-closure tree kill is the **timeout-path** primitive
  (the sole path where the middle is still alive, so its closure is non-empty). The
  authoritative per-path statement is `WP-a10-reap-mechanism`'s **settle-path reap
  matrix**; this ADR cites it rather than restate a divergent subset. This is proven
  by the live escape harness, not by argv assertions.
- **Per-run isolation (cross-run safety).** The handed-up brain identity lives in
  a **per-run** pidfile keyed by a token the outer supervisor mints before spawn
  (`state/dream-brain.<token>.pid`), and each supervisor reaps **only** its own
  run's pidfile. A single shared pidfile was a cross-run hazard: a second,
  lock-losing concurrent dream would read and kill the first run's **live** brain.
  Per-run tokens close that.
- **Combined `setsid`+double-fork full-detach: open, mitigated, deferred.** The
  escapee is in no descendant group and has no ppid ancestry to the supervisor;
  it is the documented residual, mitigated by A1 (the contained brain has no
  shell to create one) and handed to A12 (arbitrary same-user native code).
- **Kill-induced late reparent: open, mitigated, deferred.** A known descendant
  that opens a **new session (`setsid`) AFTER the reap's first snapshot** and is
  then reparented to `init`/`launchd` by the reaper's **own** kill of its parent
  is, by the next sweep, in no descendant group and has no ppid ancestry — so it
  can survive both clean sweeps. No double-fork is required; the reparenting is
  **reaper-induced**, a self-inflicted sub-ms window. The non-adversarial findable-
  tree guarantee does **not** cover it. Closing it deterministically would need a
  kernel containment barrier (cgroup / PID-namespace), which ADR-0004 forbids; it
  is mitigated by A1 (the contained brain has no shell to `setsid`) and deferred to
  A12. The escape harness **records** this case; it does not force it with a
  deterministic snapshot/fork/setsid test barrier — disproportionate for a nightly
  note-taking job.
- **Unkillable (kernel D-state) descendant: found, surfaced loudly, not silently
  leaked.** A descendant that is a findable ppid/group member but is wedged in an
  **uninterruptible kernel sleep** (D-state, e.g. blocked in a hung syscall) cannot
  be reaped by SIGKILL until the kernel returns — repeated `kill` has no effect and
  the bounded quiescence loop / bounded `reapGroup` poll will exhaust its cap with
  the member still present. This is beyond user-level supervision — the **same
  family** as the adversarial full-detach and kill-induced-late-reparent boundaries:
  a process the reaper cannot terminate. The mechanism must **NOT** block forever
  waiting for it (an unbounded block-until-`ESRCH` would itself be a
  persistent-process ADR-0004 violation) and must **NOT** silently certify the job
  clean. Instead the FINAL backstop (`run-job`'s abnormal settle) does one **bounded
  final escalation** and, if the group is still non-empty, **FAILS LOUD** — a durable
  `state/alerts.jsonl` alert plus a `last_status:'error'` watermark plus a non-zero
  job outcome — so an un-reapable survivor is always **surfaced**, never leaked as a
  hollow retained pidfile. Final closure of an arbitrary unkillable same-user process
  belongs with the other kernel-level residuals to **audit A12**; it is mitigated
  meanwhile by A1 (the contained brain has no shell to wedge one deliberately).
- **PID/PGID reuse.** The handed-up brain group is reaped with an explicit
  **negative-PGID** signal (`kill(-pgid)` via `reapGroup`), which reaches surviving
  members even after the group leader has exited — a positive-pid table lookup
  would find nothing and leak them. No per-platform process **start-time** check is
  added (owner decision): an unrelated process that reuses the exited brain's
  pid/pgid within a running reap window is not group-killed unless it deliberately
  joined that pgid — an astronomically unlikely, self-inflicted micro-window. The
  per-token pidfile is written fresh at spawn and removed on clean completion, so
  the stale window is small. This, and the sub-ms **spawn→hand-up gap** (a middle
  that dies between `spawnBrain` and the atomic pidfile write hands up nothing —
  no full handshake protocol is added, only an atomic immediate-post-spawn write),
  are stated, accepted, non-adversarial residuals.

## Consequences

- The nightly supervisor's cleanup reaches descendants that re-detached or
  `setsid`'d, and reaches a reparented orphan after a middle-process death — the
  defining A10 gap for unattended use — while starting nothing that outlives the
  job (ADR-0004): the reap is verify-then-kill logic at existing spawn sites.
- The reap never trusts a PATH-resolved binary as a kill authority; adding a new
  supported OS means adding an authoritative process-table reader, not shelling a
  bare tool.
- The A10 guarantee is stated as a **bound**, not an absolute: reviewers and docs
  can point at one durable record for "what the supervisor does and does not
  promise," and the combined full-detach escapee is an explicit A12 hand-off
  rather than a residual re-litigated per spec.
- Accepted cost: the reap's quiescence loop and process-table read run on every
  timeout/abnormal termination; both are bounded and best-effort, and a failed
  read degrades to the legacy group-kill so the watchdog always still raises its
  timeout error.

## Relations to prior ADRs

- **Completes ADR-0028 / WP-141's "single timeout authority" (A7).** `run-job`
  stays the timeout authority; this ADR makes its kill reach re-detached
  descendants and adds the cross-process brain-pid hand-up. It introduces no new
  timeout owner.
- **Reuses ADR-0028 / WP-154 executable-identity verification** for the macOS
  `/bin/ps` reaper — the same structural checks, applied to the reap's own tool.
- **Depends on the ADR-0025 (A1) hermetic runtime profiles** as the mitigation
  for the unclosable residual: the contained brain has no shell, so it cannot
  produce the combined full-detach escapee.
- **Honors ADR-0004 (no-daemon invariant).** The reap is files and
  verify-then-kill logic; nothing added here outlives its job.
