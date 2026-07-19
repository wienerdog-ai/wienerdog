---
id: WP-a10-escape-harness
title: Live escape-negative harness for the reap — setsid/double-fork matrix, SIGKILL-the-middle-while-brain-lives, fake-ps-in-PATH negative, timed fork/setsid interleaving attack
status: Draft
model: opus
size: M
depends_on: [WP-a10-reap-mechanism]
adrs: [ADR-0004, ADR-0025, ADR-0030]
epic: audit-a10
---

# WP-a10-escape-harness: Prove the reap with real processes (audit A10, live negative harness)

## Context (read this, nothing else)

Wienerdog's nightly **dream** must leave **no descendant** running after a
timeout — an orphaned brain past the deadline violates the IRON RULE (ADR-0004:
Wienerdog is just files, no process outlives its job). The 2026-07-15 audit
action **A10** requires proof by real processes, not argv assertions:

> "Test normal children plus `setsid`/double-fork escape attempts; after timeout
> no descendant remains."

The sibling **WP-a10-reap-mechanism** built the supervisor's `reapTree`
primitive (`src/core/reap.js`) and wired it into `run-job`/`dream` on every
exit path, with unit coverage over a **fake** process table. **A unit test that
feeds a synthetic table does not prove the real OS behaves as modeled** — the
audit is explicit that a finding is not closed by asserting argv strings. This WP
adds the **live** negative harness: real supervised children that spawn real
escape variants, asserting that after the reap **zero** reachable descendants
remain — and recording the one class that is honestly out of reach.

**The guarantee this harness certifies (ADR-0030, Proposed — owner ratifies at
this WP's `Ready`-flip).** `reapTree` is a **total** guarantee for the process
classes a user-level supervisor can find: a plain child tree, a child re-detached
into its own process group (the dream-brain leak), a `setsid` child (new session,
`ppid` intact), and a double-fork-no-`setsid` child (reparented to `init`, group
retained). It is **not** a claim against a process that combines `setsid` **and**
double-fork to fully detach — that escapee is in no descendant group and has no
`ppid` ancestry, so it is beyond user-level supervision (**A12's** territory). It
is **mitigated** in Wienerdog by A1 (ADR-0025): the dream **brain is hermetically
contained and has no Bash/shell**, so it cannot `fork`/`setsid` anything. This
harness therefore exercises the *supervisor's* robustness with synthetic children
and **records** the combined escapee as the documented residual — it does not
claim to reap it.

**Live-test posture (match the repo convention).** These are real-process tests,
POSIX-only. Skip on win32 with a note (`{ skip: process.platform === 'win32' }`,
the pattern already used in `tests/integration/dream.test.js`). **The win32 skip is
an accepted, owner-approved platform-scope boundary, not a hidden gap (R5-2):** the
reap's leaderless-reparented-member guarantee is **POSIX-only** this release (win32
`taskkill` has no negative-PGID equivalent, so the group-reap authority does not
activate there — see `WP-a10-reap-mechanism`'s Platform-scope note), so **this
harness's merge-gate is POSIX-only this release by design**. Windows post-parent-exit
reaping — and its own **live** Windows merge-gate (a skipped harness is not proof) —
is owned by the follow-up `WP-a10-windows-reap`. State the skip reason inline in the
test note so the boundary is explicit, never silent. They spawn only
short-lived local fixture processes (a `sleep`-style Node child), never the real
`claude`; they must be **self-cleaning** (kill every fixture pid in a `finally`,
even on assertion failure) so a failed run leaves no stray process — an ADR-0004
posture the harness itself must honor.

## Current state

- **`src/core/reap.js`** (created by WP-a10-reap-mechanism) exports
  `reapTree(pid, platform, seams)`, `reapGroup(pgid, platform, seams)` (the
  authenticated-PGID negative-`kill(-pgid)` primitive), and
  `readProcessTable(platform, seams)`. On POSIX with no seams `reapTree` reads the
  authoritative table (Linux `/proc`, macOS absolute verified `/bin/ps`) and
  SIGKILLs the real descendant tree + groups, re-sweeping to two consecutive clean
  sweeps.
- **`src/cli/run-job.js`** reaps on every child-exit path: on an abnormal settle
  it reaps the middle's **group-A tree with BOTH** `reapTree(child.pid)` **and**
  `reapGroup(child.pid)` (the negative-PGID group kill reaches a leaderless
  reparented group-A member once the middle/group-leader has exited — after
  `'close'`, `reapTree`'s ppid-closure alone finds nothing), and for
  `builtin:dream` it `reapGroup`s the **per-token** brain pidfile group
  (`state/dream-brain.<token>.pid`, group B) even when the middle `dream.js` died —
  three reap operations, two group-A targets sharing `child.pid` plus one group-B.
- **`src/cli/dream.js`** writes/removes the per-token brain pidfile and reaps via
  `reapTree` on the timeout path.
- **`tests/integration/dream.test.js`** already uses `{ skip: process.platform
  === 'win32' }` for POSIX-only integration cases — reuse that idiom.
- No live escape harness exists yet; the mechanism WP proved the primitive only
  against injected fake tables.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself and package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| create | tests/integration/reap-escape.test.js | The live POSIX escape-negative harness: escape matrix (a)–(e), non-vacuity baseline, the SIGKILL-the-middle-while-brain-lives test, the fake-`ps`-in-PATH negative, and the timed snapshot/fork/setsid interleaving attack test. Skips on win32. |
| create | tests/fixtures/reap/supervised-child.js | A tiny Node fixture: a supervised "middle" that spawns a requested escape variant (env/argv-selected) and prints the grandchild pid on stdout, then sleeps; used as the reap target. For the middle-death proof it can spawn **both** a group-A descendant and a re-detached brain and write the per-token brain pidfile. |
| create | tests/fixtures/reap/spawn-variant.js | Spawns one grandchild per variant — plain / re-detached (`detached:true`) / `setsid` / double-fork-no-setsid / setsid+double-fork — each a long `sleep`; prints its pid. Pure Node (use `child_process` + `process.setsid` via a `setsid`-style re-exec; no external `setsid` binary required, but if used it must be the absolute `/usr/bin/setsid` where present, else the Node `detached`+new-session technique). |
| create | tests/fixtures/reap/fake-ps | An executable fake `ps` (marker-writing / bogus-output) for the PATH-injection negative test — proves the reap never runs it. |

### Escape-test matrix (the A10 acceptance)

`tests/integration/reap-escape.test.js` drives a **real** supervised child (the
`supervised-child.js` fixture) that spawns, per case, one long-sleeping
grandchild; the test then invokes the **real** `reapTree(childPid,
process.platform)` (no seam) and asserts liveness by polling `kill(pid, 0)` until
it throws `ESRCH` (bounded timeout):

- **(a) plain grandchild** — a normal child that sleeps → **gone** after reap.
- **(b) re-detached grandchild** — `detached:true` into its own group (the
  brain's exact pattern) → **gone**.
- **(c) setsid grandchild** — new session, `ppid` intact → **gone**.
- **(d) double-fork-no-setsid grandchild** — parent exits, grandchild reparents
  to `init` but keeps the group → **gone**.
- **(e) setsid + double-fork combined** — asserted as the **documented ADR-0030 /
  A12 residual**: it **may survive**; the test records it as the honest boundary
  and asserts only that the *contained* variants (a)–(d) are fully reaped, never
  that (e) is.

**Non-vacuity baseline (the test must be able to fail).** Without the reap (e.g.
a single `kill(-childPgid)` legacy group-kill instead of `reapTree`), assert at
least one of (b)–(d) **survives** — proving the harness detects a real escape and
is not vacuously green.

### The three additional live proofs

1. **SIGKILL-the-middle-while-a-group-A-descendant AND the brain live (findings 6,
   10, and R3-E/R4-B — mandatory).** Stand up the real chain: a `run-job`-style
   supervisor mints a run token and spawns the `supervised-child.js` middle, which
   spawns **both** a long-sleeping **group-A descendant** (a plain child in the
   middle's own group — so once the middle dies this descendant is a **leaderless
   reparented** group-A member, still carrying `child.pid` as its PGID) **and** a
   re-detached long-sleeping "brain" (group B), and writes the per-token brain
   pidfile (`state/dream-brain.<token>.pid`) — exactly the `builtin:dream` wiring.
   `SIGKILL` the **middle** so its inner watchdog can never fire **and** so the
   group-A leader is gone from the process table by the time the reap runs; then run
   the supervisor's settle-path reap. On the abnormal `'close'` path that reap is
   **three** operations (matching `WP-a10-reap-mechanism`): `reapTree(child.pid)`
   **and** `reapGroup(child.pid)` for **group A** (two distinct group-A targets
   sharing `child.pid` — `reapTree`'s ppid-closure finds nothing once the leader has
   exited, so the **negative-PGID** `reapGroup(child.pid)` is what reaches the
   leaderless reparented member), **and** `reapGroup(brain.pgid)` for the per-token
   **group-B** brain pidfile. The test must drive the **REAL** post-`'close'` reap
   path (the actual `run-job` settle code, or a thin harness invoking the exact same
   reap-on-close function — not a reimplementation), and assert: **all three reap
   operations occur**; the group-A descendant pid, having been reaped **via
   `reapGroup(child.pid)`**, reaches `ESRCH`; the brain pid reaches `ESRCH`; and the
   pidfile is deleted → **zero survivors**. (A two-call sequence that omits
   `reapGroup(child.pid)` would leave the leaderless group-A member alive and make
   this merge-gate hollow — the test must fail in that case.)

2. **Fake-`ps`-in-PATH negative (finding 7).** Prepend `tests/fixtures/reap/` (or
   a temp dir holding `fake-ps`) to `PATH`, then run the **real** macOS reader
   path (or force the darwin branch on a POSIX runner via the injected
   `platform`) and assert the reap used the **absolute `/bin/ps`** (or `/proc` on
   Linux) and **never** invoked `fake-ps` — verified by the fake writing a marker
   file that must **not** appear, and by the reap still correctly killing a real
   re-detached child. Proves a planted `ps` cannot become the kill authority.

3. **Late-fork-during-teardown, best-effort (findings 8a + 14).** A supervised
   child that, on a timer, **forks a new grandchild while the reap is sweeping**
   (simulate a child that spawns siblings during teardown). Two cases, and only
   the first is a required green:
   - **Group-retaining late fork (required green).** The late grandchild keeps its
     parent's group (no `setsid`), so it is a findable descendant. Assert the
     **kill–rescan-to-quiescence** loop still ends with zero reachable descendants
     — the late-forked grandchild is caught by a later sweep, closing the
     snapshot→kill TOCTOU. Bound the fixture's fork count so the loop terminates
     (it must, given `maxSweeps`), and assert the reap returns without exceeding
     its sweep cap.
   - **Kill-induced late reparent (DOCUMENTED RESIDUAL — not a required green,
     finding 14).** A late grandchild that `setsid`s into a **new session AFTER the
     first snapshot** and is then reparented to `init` by the reaper's **own** kill
     of its parent is, by the next sweep, in no descendant group and has no ppid
     ancestry — it can survive both clean sweeps. This is the self-induced,
     kernel-level residual named in ADR-0030; the contained brain has no shell to
     produce it. **Record it as the honest boundary; do NOT assert it reaped, and
     do NOT build the deterministic snapshot/fork/setsid test-barrier machinery to
     force the interleaving** (owner, round-2) — a best-effort timer is sufficient
     for a nightly note-taking job.

## Security checklist

- [ ] The harness proves, with **real** processes, that a re-detached child
      (group B) and a `setsid` child are reaped — the exact leak classes A10
      names — leaving **zero** descendants.
- [ ] The fake-`ps`-in-PATH case proves the reap never runs a PATH-resolved `ps`
      as its kill authority (marker file absent; absolute `/bin/ps` / `/proc`
      used).
- [ ] The combined setsid+double-fork escapee is **recorded** as the ADR-0030 /
      A12 residual (case (e)) — never asserted reaped.
- [ ] The harness is self-cleaning: every fixture pid is killed in a `finally`,
      so a failed run leaves no stray process (ADR-0004).

## Acceptance criteria (mapped to the A10 acceptance bullet + ADR-0030)

- [ ] **[A10 — "Test normal children plus setsid/double-fork escape attempts;
      after timeout no descendant remains."]** `reap-escape.test.js` proves cases
      (a) plain, (b) re-detached, (c) setsid, (d) double-fork-no-setsid are all
      `ESRCH` after `reapTree`; the non-vacuity baseline shows at least one
      survives without the reap; case (e) setsid+double-fork is the recorded
      residual.
- [ ] **[Middle-death, findings 6 + 10 + R3-E/R4-B]** With the middle `SIGKILL`ed
      while **both** a group-A descendant and the brain live, the supervisor's
      **real** post-`'close'` settle-path reap runs **all three** operations —
      `reapTree(child.pid)` **and** `reapGroup(child.pid)` for group A (the
      negative-PGID group kill is what reaches the now-**leaderless reparented**
      group-A member once the middle has exited) **plus** `reapGroup(brain.pgid)`
      for the group-B brain via the per-token pidfile — asserted to all occur; the
      leaderless group-A member and the brain both reach `ESRCH` and the pidfile is
      deleted **before** fixture cleanup — **zero survivors**. (Omitting
      `reapGroup(child.pid)` must fail this test.)
- [ ] **[No bare ps, finding 7]** With a `fake-ps` earlier on `PATH`, the reap
      does not run it (marker absent) and still kills a real re-detached child.
- [ ] **[TOCTOU group-retaining, finding 8a]** A **group-retaining** grandchild
      forked while the reap sweeps is still gone after the kill–rescan loop; the
      loop terminates within `maxSweeps`.
- [ ] **[Kill-induced late reparent, finding 14]** The setsid-after-snapshot,
      reparent-via-kill case is **recorded** as the ADR-0030 residual — not
      asserted reaped, and no deterministic test-barrier machinery is built.
- [ ] The harness skips cleanly on win32 with a note; `npm test` and `npm run
      lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap-escape"
npm test
npm run lint
# the residual and the middle-death/fake-ps/TOCTOU/group-A cases are present:
grep -nE "setsid|double-fork|residual|ESRCH|dream-brain|reapGroup|group-A|fake-ps|two consecutive|rescan|reparent|interleav" tests/integration/reap-escape.test.js
# R4-B: the middle-death proof drives BOTH group-A reaps (reapTree + reapGroup on
# child.pid) so the leaderless reparented member is proven ESRCH:
grep -nE "reapTree|reapGroup|leaderless|child\.pid" tests/integration/reap-escape.test.js
```

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18; no build step. Fixtures are plain Node
  scripts + one executable shell/Node `fake-ps` (must pass `shellcheck`/`shfmt` if
  written in bash; a Node fake-ps avoids that).
- **`never mock process.platform`** — where a test must force the darwin reader on
  a Linux CI runner, pass `platform` to `reapTree` and inject `psPath`/`spawnSync`
  as the mechanism WP's seams allow; do not monkeypatch `process.platform`.
- **Self-cleaning is mandatory.** Track every spawned fixture pid and kill it in a
  `finally` (both group and pid), even on assertion failure — a reap **test** that
  leaks processes would itself violate ADR-0004. Bound every poll with a timeout so
  a stuck fixture fails the test rather than hanging CI.
- **Drive the real code paths.** The middle-death case must exercise the real
  `run-job` settle-path reap (or the exact same function), not a reimplementation —
  the point is to prove the shipped wiring, not a copy.
- **ADR-0030 is the boundary of record.** Case (e) and the "user-level supervision
  bound" are ADR-0030's; cite it. If the harness reveals a *findable* class that
  survives (a real bug in the mechanism), that is a mechanism-WP fix, not a new
  residual — report it under "Discovered issues" and do not weaken an assertion to
  make it pass.
- **Do not modify `src/`.** This WP is tests + fixtures only; if the harness
  cannot pass without a mechanism change, the mechanism WP is wrong — flag it, do
  not patch `src/reap.js`/`run-job.js`/`dream.js` here (they are not in this
  Deliverables table).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Out of scope (do NOT do these)

- Any `src/` change — the reap primitive + wiring are **WP-a10-reap-mechanism**;
  this WP only proves them. A needed `src/` fix is a mechanism-WP change, flagged
  under "Discovered issues".
- Re-architecting the watchdog ownership or deleting the inner `dream.js`
  watchdog — out of scope for A10 entirely.
- A cgroup/PID-namespace or job-object containment mechanism — if the harness
  shows it is required, flag an ADR-0030 amendment; do not build it.
- Claiming the combined setsid+double-fork escapee is reaped — it is the
  documented ADR-0030 / A12 residual.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `test(security): live escape-negative harness for the descendant reap (WP-a10-escape-harness)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
