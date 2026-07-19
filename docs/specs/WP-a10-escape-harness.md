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
the pattern already used in `tests/integration/dream.test.js`). They spawn only
short-lived local fixture processes (a `sleep`-style Node child), never the real
`claude`; they must be **self-cleaning** (kill every fixture pid in a `finally`,
even on assertion failure) so a failed run leaves no stray process — an ADR-0004
posture the harness itself must honor.

## Current state

- **`src/core/reap.js`** (created by WP-a10-reap-mechanism) exports
  `reapTree(pid, platform, seams)` and `readProcessTable(platform, seams)`. On
  POSIX with no seams it reads the authoritative table (Linux `/proc`, macOS
  absolute verified `/bin/ps`) and SIGKILLs the real descendant tree + groups,
  re-sweeping to two consecutive clean sweeps.
- **`src/cli/run-job.js`** reaps on every child-exit path and, for
  `builtin:dream`, reaps the brain pidfile group (`state/dream-brain.pid`) even
  when the middle `dream.js` died.
- **`src/cli/dream.js`** writes/removes the brain pidfile and reaps via
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
| create | tests/fixtures/reap/supervised-child.js | A tiny Node fixture: a supervised "middle" that spawns a requested escape variant (env/argv-selected) and prints the grandchild pid on stdout, then sleeps; used as the reap target. |
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

1. **SIGKILL-the-middle-while-the-brain-lives (finding 6, mandatory).** Stand up
   the real chain: a `run-job`-style supervisor spawns the `supervised-child.js`
   middle, which spawns a re-detached long-sleeping "brain" and writes the brain
   pidfile (`state/dream-brain.pid`) — exactly the `builtin:dream` wiring. `SIGKILL`
   the **middle** so its inner watchdog can never fire; then run the supervisor's
   settle-path reap (reads the pidfile, `reapTree`s the brain group). Assert the
   brain pid is `ESRCH` and the pidfile is deleted → **zero survivors**. Drive
   this through the real `run-job` settle path (or a thin harness that invokes the
   same reap-on-close code), not a reimplementation.

2. **Fake-`ps`-in-PATH negative (finding 7).** Prepend `tests/fixtures/reap/` (or
   a temp dir holding `fake-ps`) to `PATH`, then run the **real** macOS reader
   path (or force the darwin branch on a POSIX runner via the injected
   `platform`) and assert the reap used the **absolute `/bin/ps`** (or `/proc` on
   Linux) and **never** invoked `fake-ps` — verified by the fake writing a marker
   file that must **not** appear, and by the reap still correctly killing a real
   re-detached child. Proves a planted `ps` cannot become the kill authority.

3. **Timed snapshot/fork/setsid interleaving attack (finding 8a).** A supervised
   child that, on a timer, **forks a new grandchild between the reap's first
   snapshot and its first kill** (simulate a child that spawns siblings during
   teardown). Assert the **kill–rescan-to-quiescence** loop still ends with zero
   reachable descendants — i.e. the late-forked grandchild is caught by a later
   sweep, closing the snapshot→kill TOCTOU. Bound the fixture's fork count so the
   loop terminates (it must, given `maxSweeps`), and assert the reap returns
   without exceeding its sweep cap.

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
- [ ] **[Middle-death, finding 6]** With the middle `SIGKILL`ed while the brain
      lives, the supervisor's settle-path reap (via the brain pidfile) leaves the
      brain `ESRCH` and deletes the pidfile — **zero survivors**.
- [ ] **[No bare ps, finding 7]** With a `fake-ps` earlier on `PATH`, the reap
      does not run it (marker absent) and still kills a real re-detached child.
- [ ] **[TOCTOU, finding 8a]** A grandchild forked between the reap's snapshot
      and kill is still gone after the kill–rescan loop; the loop terminates
      within `maxSweeps`.
- [ ] The harness skips cleanly on win32 with a note; `npm test` and `npm run
      lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "reap-escape"
npm test
npm run lint
# the residual and the middle-death/fake-ps/TOCTOU cases are present:
grep -nE "setsid|double-fork|residual|ESRCH|dream-brain\.pid|fake-ps|two consecutive|rescan|interleav" tests/integration/reap-escape.test.js
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
