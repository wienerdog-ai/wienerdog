---
id: WP-059
title: Close the watchdog-test pidfile race (bounded poll before asserting the kill)
status: In-Review
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/059-watchdog-pidfile-race
---

# WP-059: Close the watchdog-test pidfile race

## Context (read this, nothing else)

Wienerdog runs scheduled work through a short-lived **run-job** wrapper
(`src/cli/run-job.js`): it spawns the job, arms a **watchdog** timer, and if the
job overruns its timeout it kills the whole process group and records an error.
Nothing outlives the job (ADR-0004: Wienerdog is just files — no daemon).

`tests/unit/scheduler-runjob.test.js` has a test — **"scheduler-runjob: a hanging
job hits the watchdog, kills the tree, records error"** — that proves the
watchdog path. It spawns a fake job script that records its own PID to a file and
then `sleep 30`s (i.e. hangs); the run-job timeout is forced to **2000 ms** via
`WIENERDOG_RUNJOB_TIMEOUT_MS`. The test asserts the run **rejects with
`/timed out/`**, that the schedule state records `last_status: 'error'`, and then
reads the recorded PID from the pidfile and asserts that process is **dead**
(the watchdog killed the tree).

**The bug is in the test, not in `run-job.js`.** The final assertion reads the
pidfile *immediately* after the rejection:

```js
const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
```

Under parallel CPU contention (the full `npm test` suite pinning all cores) the
2000 ms watchdog can fire **before the shell child has run `echo $$ > pidFile`**,
so the pidfile does not exist yet and `fs.readFileSync` throws `ENOENT` — turning
a benign timing situation into a hard test failure. The test's correctness
depends on timing to guarantee the pidfile exists; that guarantee is false under
load. This is a **test-hermeticity** fix: **`run-job.js` is not suspected and must
not be touched.**

The fix must **close the race, not merely enlarge the timeout**: after the run
rejects with `/timed out/`, poll (bounded) for the pidfile to appear, and only
then read it and assert the kill. If the pidfile never appears within the bounded
wait, treat that distinctly as "the child never started far enough to record a
PID" — the watchdog firing is already proven by the `/timed out/` rejection and
the `last_status: 'error'` assertion, so there is simply no PID to check; do
**not** crash and do **not** silently pass a broken watchdog. The
`sleep 30` + watchdog-fires guarantee stays intact (the child, if it started,
outlives the 2000 ms timeout by far, so a live child at kill time genuinely tests
the kill).

## Current state

`tests/unit/scheduler-runjob.test.js` exists. The test lives at approximately
lines 254–288. Its current tail (the part you replace) reads:

```js
  const state = jobsLib.readScheduleState(paths);
  assert.equal(state.dream.last_status, 'error');

  // The child process group was killed — its pid is gone.
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  assert.ok(Number.isInteger(pid) && pid > 0, 'child recorded its pid');
  await new Promise((r) => setTimeout(r, 100)); // let SIGKILL land
  let alive;
  try {
    process.kill(pid, 0);
    alive = true; // no error → the process still exists
  } catch (e) {
    alive = e.code === 'EPERM'; // EPERM → exists but not ours; ESRCH → gone
  }
  assert.equal(alive, false, 'no child survives the watchdog timeout');
});
```

The fake job script and the `assert.rejects(..., /timed out/)` above this block,
and the `state.last_status === 'error'` assertion, are **correct and stay**. The
test function is already `async`, so `await`-ing a poll loop is fine. `fs`, `path`
and `assert` (as `node:assert/strict`) are already required at the top of the
file. The pidfile path is the local `const pidFile` already defined in the test.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | tests/unit/scheduler-runjob.test.js | replace only the pidfile-read tail of the "hanging job hits the watchdog" test with a bounded poll + distinct no-pidfile branch. No other test changes. |

### Exact contract

Replace the block from the `// The child process group was killed…` comment
through the final `assert.equal(alive, false, …)` line (i.e. everything after the
`state.last_status` assertion, up to but not including the test's closing `});`)
with the following. Keep the `state.last_status === 'error'` assertion above it
unchanged.

```js
  // The child records its PID (`echo $$ > pidFile`) then `sleep 30`s. Under heavy
  // CPU contention the 2000 ms watchdog can fire and kill the process group
  // BEFORE the shell ran that echo, so the pidfile may not exist yet. Poll
  // briefly for it rather than reading immediately (the old ENOENT-crash race).
  const pidDeadline = Date.now() + 2000;
  let pidRaw = '';
  while (Date.now() < pidDeadline) {
    try {
      pidRaw = fs.readFileSync(pidFile, 'utf8').trim();
      if (pidRaw) break;
    } catch {
      /* pidfile not written yet */
    }
    await new Promise((r) => setTimeout(r, 25));
  }

  if (pidRaw) {
    // Child started and recorded its PID → assert the watchdog killed it.
    const pid = Number(pidRaw);
    assert.ok(Number.isInteger(pid) && pid > 0, 'child recorded its pid');
    await new Promise((r) => setTimeout(r, 100)); // let SIGKILL land
    let alive;
    try {
      process.kill(pid, 0);
      alive = true; // no error → the process still exists
    } catch (e) {
      alive = e.code === 'EPERM'; // EPERM → exists but not ours; ESRCH → gone
    }
    assert.equal(alive, false, 'no child survives the watchdog timeout');
  }
  // else: the child never got far enough to record a PID before the watchdog
  // killed it (rare, only under pathological scheduling). The watchdog firing is
  // already proven by the /timed out/ rejection and last_status === 'error'
  // above; there is no PID to assert on, so nothing more to check.
});
```

Behavior summary:

- **Common case** (child wrote its PID, then the watchdog killed it): the poll
  finds the pidfile within a few ms, reads the PID, and asserts the process is
  gone — exactly the assertion that exists today, just race-free.
- **Pathological case** (watchdog killed the child before it ran the `echo`): the
  poll times out after 2000 ms, `pidRaw` stays empty, the per-PID assertion is
  skipped. The test still **fails loudly** if the watchdog did not fire, because
  the earlier `assert.rejects(..., /timed out/)` and `assert.equal(...,'error')`
  are unchanged.

## Implementation notes & constraints

- **Do NOT touch `src/cli/run-job.js` or any file other than this one test.** The
  wrapper's watchdog behavior is not suspected; this is a test-only fix.
- **Do NOT just raise `WIENERDOG_RUNJOB_TIMEOUT_MS` or the `sleep 30`.** Enlarging
  the timeout does not close the race — it only makes it rarer while keeping the
  ENOENT crash reachable. The bounded poll is the fix.
- The poll bound (2000 ms, 25 ms interval) is generous relative to a shell `echo`
  and keeps the test fast in the common case (it breaks as soon as the file
  appears). Do not make the poll unbounded.
- Do not add new requires or helpers; `fs`, `path`, `assert` are already imported
  and the test is already `async`.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] The "hanging job hits the watchdog" test no longer reads the pidfile before
      it is guaranteed to exist; it polls (bounded ≤ 2000 ms) and only asserts on
      the PID when the pidfile appeared.
- [ ] When the pidfile appears, the test still asserts the recorded process is
      dead (unchanged semantics).
- [ ] When the pidfile never appears, the test does not throw `ENOENT` and does
      not silently pass a non-firing watchdog (the `/timed out/` rejection and
      `last_status: 'error'` assertions remain and still gate).
- [ ] No file other than `tests/unit/scheduler-runjob.test.js` is modified.
- [ ] The full suite passes, including a repeat run to demonstrate stability.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'hanging job hits the watchdog'
npm test
npm test  # run twice to show the race is closed (both green)
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `src/cli/run-job.js`, the watchdog, or the kill-tree logic.
- Any change to other tests in this file (stderr-tail, TCC-guard, durable-alert,
  buildCleanEnv, etc.).
- Adding a general polling helper for other tests — inline the loop here only.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/059-watchdog-pidfile-race`; conventional commits; PR titled
   `test(scheduler): close the watchdog pidfile race (WP-059)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
