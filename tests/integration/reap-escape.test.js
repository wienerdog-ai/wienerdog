'use strict';

// WP-a10-escape-harness — the LIVE escape-negative harness for the descendant
// reap (audit A10, ADR-0030). Everything here spawns REAL processes: real
// supervised "middle" children that spawn real escape variants, then the REAL
// reap primitives / the REAL run-job + dream.js settle paths, asserting ZERO
// reachable descendants afterwards by polling kill(pid, 0) to ESRCH. No argv
// assertions, no fake process tables.
//
// The ADR-0030 guarantee this file certifies: `reapTree` is TOTAL for the
// process classes a user-level supervisor can find — (a) a plain child tree,
// (b) a child re-detached into its own group (the dream-brain leak), (c) a
// setsid child (new session, ppid intact), (d) a double-fork-no-setsid child
// (reparented to init, group retained). It is explicitly NOT a claim against
// (e) the setsid + double-fork combined escapee — no descendant group, no ppid
// ancestry, beyond user-level supervision (A12's territory; mitigated by A1 /
// ADR-0025: the hermetic dream brain has no Bash/shell to produce one). Case
// (e) is RECORDED below as the honest residual, never asserted reaped.
// Likewise the kill-induced late reparent (finding 14): a grandchild that
// setsid's into a new session AFTER the first snapshot and is then reparented
// to init by the reaper's OWN kill of its parent can survive both clean
// sweeps — the self-induced kernel-level ADR-0030 residual. Per the owner's
// round-2 ruling, NO deterministic snapshot/fork/setsid test-barrier machinery
// is built to force that interleaving — a best-effort timer attack (the
// late-fork test) is sufficient for a nightly note-taking job, and the
// interleaving residual stays recorded, not asserted.
//
// Platform scope (R5-2, owner-approved — an explicit boundary, not a hidden
// gap): the reap's leaderless-reparented-member guarantee is POSIX-only this
// release (win32 taskkill has no negative-PGID equivalent, so the group-reap
// authority does not activate there). This harness's merge-gate is therefore
// POSIX-only BY DESIGN; the skipped win32 run is not a Windows proof — the
// live Windows merge-gate is owned by the follow-up WP-a10-windows-reap.
//
// Self-cleaning (ADR-0004): every fixture pid is tracked and group+pid
// SIGKILLed in a finally, even on assertion failure — a reap TEST that leaks
// processes would itself violate the IRON RULE. Every poll is bounded by a
// deadline so a stuck fixture fails the test rather than hanging CI. All paths
// live under mkdtemp sandboxes — the real ~/.wienerdog and user state are
// never touched.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync, execFileSync } = require('node:child_process');

const reapLib = require('../../src/core/reap');
const runjob = require('../../src/cli/run-job');
const dream = require('../../src/cli/dream');
const { getPaths } = require('../../src/core/paths');
const jobsLib = require('../../src/scheduler/jobs');
const { readAlerts } = require('../../src/core/alerts');

const FIXDIR = path.resolve(__dirname, '../fixtures/reap');
const SUPERVISED = path.join(FIXDIR, 'supervised-child.js');
const SPAWN_VARIANT = path.join(FIXDIR, 'spawn-variant.js');
const FAKE_PS = path.join(FIXDIR, 'fake-ps');
const INJ_FIXTURE = path.resolve(__dirname, '../fixtures/dream/transcripts/claude-injection.jsonl');

// POSIX-only merge-gate (R5-2): win32 post-parent-exit reaping and its own
// LIVE gate are owned by WP-a10-windows-reap — a skipped harness is not a
// Windows proof, and this note keeps the boundary explicit, never silent.
const WIN32_SKIP =
  process.platform === 'win32' &&
  'live POSIX escape harness — the leaderless-reparented-member guarantee is POSIX-only this ' +
    'release (R5-2: no negative-PGID equivalent on win32); the live Windows merge-gate is owned ' +
    'by WP-a10-windows-reap';

// ---------------------------------------------------------------------------
// Liveness + cleanup helpers (bounded polls; finally-cleanup for EVERY fixture)
// ---------------------------------------------------------------------------

/** @param {number} ms @returns {Promise<void>} */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** True while `pid` (or a zombie of it) still exists. EPERM counts as alive.
 *  @param {number} pid */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

/** Poll until `fn()` is truthy or the deadline passes (then throw `what`).
 *  Condition-polling, never a long fixed sleep — the anti-flake rule.
 *  @param {() => any} fn @param {number} ms @param {string} what */
async function waitFor(fn, ms, what) {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(20);
  }
}

/** Poll `pid` until kill(pid, 0) throws ESRCH (bounded). The ZERO-survivors
 *  assertion primitive: a pid that never reaches ESRCH fails the test.
 *  @param {number} pid @param {string} what @param {number} [ms] */
async function waitEsrch(pid, what, ms = 5000) {
  await waitFor(() => !isAlive(pid), ms, `${what} (pid ${pid}) to reach ESRCH`);
}

/** True while ANY member of process GROUP `pgid` still exists — the
 *  negative-PGID probe kill(-pgid, 0) succeeds. ESRCH (no member) → false;
 *  EPERM (a member exists but is unsignalable) counts as alive.
 *  @param {number} pgid */
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
}

/** Poll the whole process GROUP to ESRCH (kill(-pgid, 0) throws). The key
 *  anti-vacuity/anti-flake assertion: an UNRECORDED late member (the
 *  SIGKILL-before-record race) cannot hide behind a green test, because group
 *  quiescence is asserted at the group level, not only over recorded pids.
 *  @param {number} pgid @param {string} what @param {number} [ms] */
async function waitGroupEsrch(pgid, what, ms = 6000) {
  await waitFor(() => !groupAlive(pgid), ms, `${what} (pgid ${pgid}) to reach GROUP ESRCH`);
}

/** Fixture-pid tracker: everything spawned is registered and group+pid
 *  SIGKILLed in the test's finally — no orphan survives even a FAILED run. */
function tracker() {
  /** @type {Set<number>} */
  const pids = new Set();
  return {
    track(pid) {
      if (Number.isInteger(pid) && pid > 1) pids.add(pid);
      return pid;
    },
    cleanup() {
      for (const pid of pids) {
        try {
          process.kill(-pid, 'SIGKILL'); // the fixture's own group, if it leads one
        } catch {
          /* already gone */
        }
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }
    },
  };
}

/** Parse the shared out file into [{role, pid}] (ENOENT → []). @param {string} out */
function readRoles(out) {
  let raw;
  try {
    raw = fs.readFileSync(out, 'utf8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      /* torn line mid-append — the next poll re-reads */
    }
  }
  return rows;
}

/** Wait until every role in `want` has appeared in `out`; returns role→pid of
 *  the FIRST occurrence each and tracks every recorded pid.
 *  @param {string} out @param {string[]} want @param {ReturnType<typeof tracker>} t
 *  @returns {Promise<Record<string, number>>} */
async function waitRoles(out, want, t, ms = 6000) {
  const map = await waitFor(() => {
    const rows = readRoles(out);
    /** @type {Record<string, number>} */
    const m = {};
    for (const r of rows) if (!(r.role in m)) m[r.role] = r.pid;
    return want.every((w) => w in m) ? m : null;
  }, ms, `roles [${want.join(', ')}] in ${out}`);
  for (const r of readRoles(out)) t.track(r.pid);
  return map;
}

/** Fresh sandbox dir + out-file path (never the real user state). */
function tmpOut() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-esc-'));
  return { dir, out: path.join(dir, 'pids.jsonl') };
}

/** Spawn the supervised middle DETACHED (its pid IS the group-A pgid — exactly
 *  how run-job spawns its child) with argv-selected mode.
 *  @param {string} mode @param {string} out @param {string[]} extra
 *  @param {ReturnType<typeof tracker>} t @returns {number} the middle's pid */
function spawnMiddle(mode, out, extra, t) {
  const child = spawn(process.execPath, [SUPERVISED, mode, out, ...extra], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return t.track(child.pid);
}

// ---------------------------------------------------------------------------
// Escape-test matrix (the A10 acceptance): real grandchildren, real reapTree,
// liveness asserted by polling kill(pid, 0) to ESRCH.
// ---------------------------------------------------------------------------

/** Drive one matrix case: spawn the middle in `mode`, wait for the grandchild,
 *  run the REAL reapTree (no seams beyond platform), assert middle + grandchild
 *  reach ESRCH. @param {string} mode @param {string[]} alsoDead extra roles that must die */
async function runMatrixCase(mode, alsoDead = []) {
  const t = tracker();
  const { out } = tmpOut();
  try {
    const middle = spawnMiddle(mode, out, [], t);
    const roles = await waitRoles(out, ['middle', 'grandchild', ...alsoDead], t);
    assert.ok(isAlive(middle), 'the middle is alive before the reap');
    assert.ok(isAlive(roles.grandchild), 'the grandchild is alive before the reap');
    // The REAL reap: authoritative table (Linux /proc, macOS the verified
    // absolute /bin/ps), ppid-closure + group kills, re-sweeping until TWO
    // CONSECUTIVE clean sweeps (the kill–rescan-to-quiescence loop).
    const r = reapLib.reapTree(middle, process.platform);
    assert.equal(r.degraded, false, `reapTree quiescent within its sweep cap (why: ${r.why})`);
    await waitEsrch(middle, 'the middle');
    await waitEsrch(roles.grandchild, `the ${mode} grandchild`);
    for (const role of alsoDead) await waitEsrch(roles[role], `the ${mode} ${role}`);
    return roles;
  } finally {
    t.cleanup();
  }
}

test('reap-escape: (a) a real PLAIN grandchild tree is fully reaped — zero descendants (ESRCH)', { skip: WIN32_SKIP }, async () => {
  await runMatrixCase('plain');
});

test('reap-escape: (b) a real RE-DETACHED grandchild (own group — the dream-brain leak) is reaped to ESRCH', { skip: WIN32_SKIP }, async () => {
  await runMatrixCase('redetach');
});

test('reap-escape: (c) a real SETSID grandchild (new session, ppid ancestry intact) is reaped to ESRCH', { skip: WIN32_SKIP }, async () => {
  await runMatrixCase('setsid', ['holder']);
});

test('reap-escape: (d) a real DOUBLE-FORK-no-setsid grandchild (reparented to init, group retained) is reaped to ESRCH', { skip: WIN32_SKIP }, async () => {
  // The intermediate exits after spawning; the grandchild reparents to init
  // but RETAINS the middle's group — the group kill is what reaches it.
  await runMatrixCase('dfork');
});

test('reap-escape: (e) the setsid+double-fork combined escapee is the DOCUMENTED ADR-0030 / A12 residual — recorded, never asserted reaped', { skip: WIN32_SKIP }, async () => {
  const t = tracker();
  const { out } = tmpOut();
  try {
    const middle = spawnMiddle('dfork-setsid', out, [], t);
    const roles = await waitRoles(out, ['middle', 'intermediate', 'grandchild'], t);
    // Wait for the double-fork to COMPLETE (the setsid intermediate exits) so
    // the escapee is deterministically detached: ppid = init, its own new
    // session — in no descendant group and with no ppid ancestry.
    await waitEsrch(roles.intermediate, 'the setsid intermediate (double-fork step)');
    assert.ok(isAlive(roles.grandchild), 'the full escapee is alive and fully detached');
    const r = reapLib.reapTree(middle, process.platform);
    assert.equal(r.degraded, false, `reapTree still quiescent over what it CAN find (why: ${r.why})`);
    await waitEsrch(middle, 'the middle');
    // THE HONEST BOUNDARY (ADR-0030, A12): the combined escapee survives the
    // reap — user-level supervision cannot find it (no descendant group, no
    // ppid ancestry). We assert it is STILL ALIVE only to prove this harness
    // exercised a genuine full escape (the residual is real, not vacuous) —
    // never that the reap catches it. Mitigated in production by A1/ADR-0025:
    // the hermetic brain has no shell to build one. If a future mechanism DOES
    // catch this class, amend ADR-0030 and this recording together.
    assert.ok(isAlive(roles.grandchild), 'case (e) recorded as the residual: the escapee outlives reapTree');
  } finally {
    t.cleanup(); // the harness itself reaps the residual escapee (ADR-0004)
  }
});

test('reap-escape: NON-VACUITY baseline — without the reap, a legacy single group-kill leaves the re-detached grandchild ALIVE', { skip: WIN32_SKIP }, async () => {
  const t = tracker();
  const { out } = tmpOut();
  try {
    const middle = spawnMiddle('redetach', out, [], t);
    const roles = await waitRoles(out, ['middle', 'grandchild'], t);
    // The pre-A10 legacy kill: ONE negative-PGID SIGKILL of the middle's group
    // — no table read, no re-detached-group enumeration, no rescan.
    process.kill(-middle, 'SIGKILL');
    await waitEsrch(middle, 'the middle (legacy group-kill victim)');
    // The re-detached grandchild sits in its OWN group: the single group-kill
    // cannot reach it. Poll a few beats and assert it SURVIVES — proving this
    // harness detects a real escape and the matrix greens are not vacuous.
    for (let i = 0; i < 5; i++) {
      assert.ok(isAlive(roles.grandchild), 'the escaped grandchild survives the legacy kill');
      await sleep(40);
    }
  } finally {
    t.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Fake-ps-in-PATH negative (finding 7): a planted `ps` must never become the
// kill authority — the reap uses the verified ABSOLUTE /bin/ps.
// ---------------------------------------------------------------------------

test('reap-escape: fake-ps planted FIRST on PATH is never executed — the reap reads the absolute /bin/ps and still kills the re-detached child', { skip: WIN32_SKIP || (!fs.existsSync('/bin/ps') && 'no /bin/ps on this platform') }, async () => {
  const t = tracker();
  const { dir, out } = tmpOut();
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  const plantedPs = path.join(bin, 'ps');
  fs.copyFileSync(FAKE_PS, plantedPs);
  fs.chmodSync(plantedPs, 0o755);
  const marker = path.join(bin, 'fake-ps-invoked.marker');
  // Sanity (the negative must be falsifiable): the planted decoy DOES run and
  // DOES write its marker when executed — so an absent marker below means the
  // reap never invoked it, not that the plant was broken.
  const sanity = spawnSync(plantedPs, ['-A'], { encoding: 'utf8' });
  assert.equal(sanity.status, 0);
  assert.ok(fs.existsSync(marker), 'the decoy is executable and marker-writing');
  fs.rmSync(marker);

  const savedPath = process.env.PATH;
  process.env.PATH = bin + path.delimiter + savedPath; // front-load the decoy
  try {
    const middle = spawnMiddle('redetach', out, [], t);
    const roles = await waitRoles(out, ['middle', 'grandchild'], t);
    // Force the darwin reader branch (the injected-platform idiom — never mock
    // process.platform): on any POSIX runner this exercises the /bin/ps path
    // whose PATH-front-run this test attacks.
    const r = reapLib.reapTree(middle, 'darwin');
    assert.equal(r.degraded, false, `the absolute /bin/ps table was authoritative (why: ${r.why})`);
    assert.equal(fs.existsSync(marker), false, 'the PATH-planted fake-ps was NEVER consulted');
    await waitEsrch(middle, 'the middle');
    await waitEsrch(roles.grandchild, 'the re-detached grandchild (killed off the real table)');
  } finally {
    process.env.PATH = savedPath;
    t.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Late fork during teardown (findings 8a + 14) — WHAT THIS HARNESS HONESTLY
// PROVES, and the boundary it does not (Codex round-2 finding, addressed).
//
// The claim "reapTree's TWO-consecutive-clean-sweep rescan catches a late fork"
// CANNOT be gated by a LIVE test: reapTree's first sweep SIGKILLs the whole
// findable closure — including the ONLY process able to fork a still-findable
// child (any forker is itself a ppid-descendant, so it dies in sweep 0). A
// still-findable descendant appearing AFTER the first real group-kill is
// therefore impossible to produce on demand without freezing the reaper
// mid-loop — the deterministic snapshot/fork/setsid barrier the owner
// explicitly forbade (round-2). reapTree's rescan is a defensive race-closer
// for a kernel-scheduling window; it is gated deterministically at the UNIT
// level with an injected fake table in WP-a10-reap-mechanism
// (tests/unit/reap.test.js — "a child forked between sweeps is caught by the
// re-scan", asserting i >= 4 == two consecutive clean snapshots), where the
// one-sweep mutation genuinely bites (see the PR's mutation-proof).
//
// So the honest LIVE proof (Codex's sanctioned alternative): drive and certify
// the COMPLETE timeout settle path — the real run-job watchdog fires while the
// middle is STILL forking group-retaining sleepers, reapTree(child.pid) runs on
// the live middle (its best-effort timeout-row extra), and the settle-path
// reapGroup(child.pid) negative-PGID kill polls the whole group to VERIFIED
// quiescence. We then assert GROUP-LEVEL ESRCH (kill(-child.pid, 0) throws),
// which certifies EVERY member is gone — including an UNRECORDED late fork the
// SIGKILL removed before its record('late', pid) line ran (the flake/vacuity
// hole Codex named). The leaderless/late class is carried by reapGroup, exactly
// as the settle-path reap matrix + ADR-0030 state — never claimed for reapTree.
// ---------------------------------------------------------------------------

test('reap-escape: TOCTOU (finding 8a) — the COMPLETE timeout settle over a live-forking group-retaining middle reaches GROUP-level ESRCH, unrecorded late members included (reapTree closure + checked reapGroup poll both drain group A; the group-level probe is the anti-vacuity guarantee)', { skip: WIN32_SKIP }, async () => {
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  /** @type {number[]} */ const treeCalls = [];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['latefork', out]),
        timeoutMs: 350, // fires while the middle is still forking (30ms × 40 ≈ 1.2s)
        reapGroup: async (pgid, platform, seams) => {
          groupCalls.push(pgid);
          return reapLib.reapGroup(pgid, platform, seams); // the REAL checked group reap — the carrier
        },
        reapTree: (pid, platform) => {
          treeCalls.push(pid);
          return runjob.killProcessTree(pid, platform, {}); // the REAL timeout-row best-effort reapTree
        },
      })
      .then(
        () => null,
        (e) => e
      );
    // The middle is up and actively forking group-retaining sleepers.
    const roles = await waitRoles(out, ['middle'], t);
    await waitFor(() => readRoles(out).filter((r) => r.role === 'late').length >= 3, 6000, 'a live stream of group-retaining late forks');
    assert.ok(isAlive(roles.middle), 'the middle is still forking when the watchdog is about to fire');

    const thrown = await promise;
    assert.ok(thrown, 'the watchdog timeout fired while the middle was live-forking');
    assert.match(thrown.message, /timed out/);

    // Both settle primitives ran: the timeout-row reapTree(child.pid) over the
    // still-alive middle (a NON-empty ppid-closure here, so it does reap group
    // A — unlike the leaderless R11-1 case) AND the checked negative-PGID
    // reapGroup(child.pid) that polls the group to VERIFIED quiescence.
    // Defense-in-depth: measured with the mutation-proof, EITHER alone drains
    // this live-middle group A (reapTree no-op → reapGroup drains; reapGroup
    // lie → reapTree drains), so neither is uniquely load-bearing HERE — the
    // guarantee this case certifies is that the COMPLETE path reaches group
    // quiescence, not which primitive did it.
    assert.deepEqual(treeCalls, [roles.middle], 'the timeout row runs reapTree(child.pid) over the live middle');
    assert.ok(groupCalls.includes(roles.middle), 'the settle-path checked reapGroup(child.pid) also ran');

    // THE KEY ANTI-VACUITY / ANTI-FLAKE ASSERTION (Codex round-2): the whole
    // group A reaches ESRCH. This covers an UNRECORDED late member (SIGKILLed
    // before its record('late', pid) line ran) — a per-pid-only assertion would
    // miss it and green over a live process; the group-level probe cannot. It
    // bites a TOTAL reap failure (reapTree no-op AND reapGroup lie together
    // leave group A live → this assertion fails), verified in the mutation-proof.
    await waitGroupEsrch(roles.middle, 'the middle\'s process group A (all group-retaining late forks, recorded or not)');
    await waitEsrch(roles.middle, 'the middle');
    // Belt: every INDIVIDUALLY recorded group-retaining late fork is also gone.
    for (const row of readRoles(out)) {
      t.track(row.pid);
      if (row.role === 'late-setsid') continue; // finding-14 residual — recorded, never asserted (see below)
      await waitEsrch(row.pid, `recorded group-retaining late fork (${row.role})`);
    }
    // Finding 14 — kill-induced late reparent: the ONE 'late-setsid' child took
    // its OWN new session (detached), so it LEAVES group A and, once its
    // parent's exit reparents it to init, has no ppid ancestry — it can outlive
    // both the reapTree closure and the group A reapGroup. That is the
    // self-induced kernel-level ADR-0030 residual: RECORDED here, never asserted
    // reaped, and (owner round-2) no barrier machinery is built to force it. It
    // is OUTSIDE group A, so the GROUP-ESRCH assertion above is unaffected by
    // it. The tracker's finally reaps it (ADR-0004 — the harness leaks nothing).
  } finally {
    t.cleanup();
    for (const row of readRoles(out)) {
      try {
        process.kill(row.pid, 'SIGKILL'); // stragglers appended after the settle
      } catch {
        /* already gone */
      }
    }
  }
});

// ---------------------------------------------------------------------------
// run-job settle-path proofs — the REAL runJob code, a real middle, real kills.
// ---------------------------------------------------------------------------

/** Isolated temp core + config for direct runJob(paths, job, opts) calls —
 *  vault under a tmp HOME (TCC-safe), state/logs sandboxed, real user state
 *  never touched. */
function setupCore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-runjob-'));
  const env = { HOME: root, WIENERDOG_HOME: path.join(root, 'wd') };
  const paths = getPaths(env);
  const vault = path.join(root, 'wienerdog');
  fs.mkdirSync(paths.core, { recursive: true });
  fs.mkdirSync(paths.state, { recursive: true });
  fs.mkdirSync(paths.logs, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(paths.config, `version: 1\nvault: ${vault}\nupdate_check: false\n`);
  return { root, env, paths, vault };
}

/** The builtin:dream job shape (mints the per-run token on POSIX). */
const DREAM_JOB = { name: 'dream', at: '03:00', run: 'builtin:dream', timeoutMinutes: 5 };

/** Common hermetic runJob opts: no real alert email, no policy-hook scan. */
function baseJobOpts() {
  return {
    sendAlert: () => ({ status: 0 }),
    detectPolicyHooks: () => ({ present: false, sources: [] }),
    platform: process.platform,
  };
}

/** resolveCommand seam → spawn the supervised middle fixture. @param {string[]} argv */
const middleResolve = (argv) => () => ({ command: process.execPath, args: [SUPERVISED, ...argv], shell: false });

/** The single dream-brain.<token>.pid in a sandboxed state dir, or null. */
function findPidfile(paths) {
  const hits = fs.readdirSync(paths.state).filter((f) => f.startsWith('dream-brain.') && f.endsWith('.pid'));
  return hits.length === 1 ? path.join(paths.state, hits[0]) : null;
}

test('reap-escape: MIDDLE-DEATH — SIGKILLed middle with a live group-A descendant AND a live brain: the real post-\'close\' settle runs BOTH group reaps (reapGroup(child.pid) + reapGroup(brain.pgid)) to ESRCH, deletes the dream-brain pidfile — zero survivors', { skip: WIN32_SKIP }, async () => {
  // Findings 6 + 10 + R3-E/R4-B. SIGKILLing the middle means its inner
  // watchdog can never fire and the group-A leader is GONE from the table when
  // the reap runs — the group-A descendant is a leaderless REPARENTED member
  // still carrying child.pid as its PGID. Per the settle-path reap matrix this
  // abnormal-'close' row is TWO group operations, not three: the checked
  // negative-PGID reapGroup(child.pid) for group A plus reapGroup(brain.pgid)
  // for the per-token group B. reapTree(child.pid) is a no-op once the leader
  // has exited (empty ppid-closure) and is confined to the timeout row — it
  // must NOT run here.
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  /** @type {number[]} */ const treeCalls = [];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['middle-death', out, paths.state]),
        reapGroup: async (pgid, platform, seams) => {
          groupCalls.push(pgid);
          return reapLib.reapGroup(pgid, platform, seams); // the REAL checked group reap
        },
        reapTree: (pid, platform) => {
          treeCalls.push(pid);
          return runjob.killProcessTree(pid, platform, {});
        },
      })
      .then(
        () => null,
        (e) => e
      );
    const roles = await waitRoles(out, ['middle', 'groupA', 'brain', 'pidfile-written'], t);
    const pidfile = findPidfile(paths);
    assert.ok(pidfile && fs.existsSync(pidfile), 'the per-token dream-brain pidfile was handed up');
    assert.ok(isAlive(roles.groupA) && isAlive(roles.brain), 'group-A descendant and brain are live');
    process.kill(roles.middle, 'SIGKILL'); // the middle dies; its watchdog never runs
    const thrown = await promise;
    assert.ok(thrown, 'the SIGKILLed job settles as a failure (exited null)');
    assert.match(thrown.message, /exited null/);
    // BOTH matrix-mandated group reaps occurred — omitting reapGroup(child.pid)
    // would leave the leaderless group-A member alive and MUST fail this test.
    assert.deepEqual(groupCalls, [roles.middle, roles.brain],
      'reapGroup(child.pid) for group A AND reapGroup(brain.pgid) for group B — in matrix order');
    assert.equal(treeCalls.length, 0, 'reapTree is NOT run on the post-\'close\' row (empty closure — timeout row only)');
    await waitEsrch(roles.groupA, 'the leaderless reparented group-A member (reaped via reapGroup(child.pid))');
    await waitEsrch(roles.brain, 'the group-B brain');
    assert.equal(fs.existsSync(pidfile), false, 'the pidfile is deleted only after the verified group-B reap');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R9-1 — the middle exits 0 CLEANLY (stdio-ignore group-A child survives): the real clean-close settle reaps it via reapGroup(child.pid), NOT reapTree — zero survivors', { skip: WIN32_SKIP }, async () => {
  // The last uncovered settle path: a clean close does not prove group A is
  // empty. The middle spawns a plain same-pgid child with stdio 'ignore' (so
  // it does NOT hold the middle's stdout/stderr pipe open and 'close' fires
  // with exit 0), then exits cleanly; the child reparents to init still
  // carrying child.pid as its PGID — leaderless. The pre-R9-1 "clean close →
  // nothing to do" wiring would leave it alive and fail the ESRCH assert.
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  /** @type {number[]} */ const treeCalls = [];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['clean-exit', out]),
        reapGroup: async (pgid, platform, seams) => {
          groupCalls.push(pgid);
          return reapLib.reapGroup(pgid, platform, seams);
        },
        reapTree: (pid, platform) => {
          treeCalls.push(pid);
          return runjob.killProcessTree(pid, platform, {});
        },
      })
      .then(
        () => null,
        (e) => e
      );
    const roles = await waitRoles(out, ['middle', 'groupA'], t);
    const thrown = await promise;
    assert.equal(thrown, null, thrown && thrown.message);
    assert.deepEqual(groupCalls, [roles.middle], 'the clean-close(0) path reaps group A via reapGroup(child.pid)');
    assert.equal(treeCalls.length, 0, 'reapTree(child.pid) is NOT invoked on the clean-close row (no-op once the leader exited)');
    await waitEsrch(roles.groupA, 'the leaderless group-A survivor of the clean exit 0');
    const state = jobsLib.readScheduleState(paths);
    assert.equal(state[DREAM_JOB.name].last_status, 'ok', 'the verified-quiescent clean run settles ok');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R11-1 — the middle exits BEFORE the watchdog timeout while a group-A child holds the inherited stdio pipe: the timeout-path reapGroup(child.pid) reaps the leaderless member; reapTree is a no-op', { skip: WIN32_SKIP }, async () => {
  // run-job's completion promise resolves on 'close' (not 'exit'): the group-A
  // child INHERITS the middle's stdout/stderr pipe, so the middle's 'close' is
  // delayed past its real exit and the watchdog timer wins the race — with the
  // middle already exited, reapTree(child.pid)'s ppid-closure is empty. The
  // timeout-path guarantee must therefore come from the negative-PGID
  // reapGroup(child.pid); a wiring relying on reapTree alone (the pre-R11-1
  // leader-still-alive assumption) leaves the survivor alive and fails here.
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  /** @type {number[]} */ const treeCalls = [];
  let groupAPid = null;
  let aliveAfterReapTree = null;
  let settled = false;
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['pipe-hold', out]),
        timeoutMs: 5000,
        reapGroup: async (pgid, platform, seams) => {
          groupCalls.push(pgid);
          return reapLib.reapGroup(pgid, platform, seams);
        },
        reapTree: (pid, platform) => {
          treeCalls.push(pid);
          const r = runjob.killProcessTree(pid, platform, {}); // the REAL timeout-row reapTree
          // The leader exited long ago: the real reapTree found an empty
          // ppid-closure — the leaderless group-A member MUST still be alive
          // here, proving reapTree is NOT what reaps it on this row.
          aliveAfterReapTree = groupAPid !== null && isAlive(groupAPid);
          return r;
        },
      })
      .then(
        () => null,
        (e) => e
      )
      .finally(() => {
        settled = true;
      });
    const roles = await waitRoles(out, ['middle', 'groupA'], t);
    groupAPid = roles.groupA;
    // The middle exits on its own, well before the 5s timer...
    await waitEsrch(roles.middle, 'the promptly-exiting middle', 4000);
    // ...but the job has NOT settled: the pipe-holding group-A child delays
    // 'close', so the leader's real exit PRECEDES the timeout settle.
    assert.equal(settled, false, 'the middle exited BEFORE the timeout settle (the pipe holds \'close\' open)');
    const thrown = await promise;
    assert.ok(thrown, 'the watchdog timer won the race');
    assert.match(thrown.message, /timed out/);
    assert.deepEqual(treeCalls, [roles.middle], 'the timeout row still runs its best-effort reapTree(child.pid)');
    assert.equal(aliveAfterReapTree, true, 'reapTree was a no-op (empty closure) — NOT what reaps the survivor');
    assert.ok(groupCalls.includes(roles.middle), 'the checked reapGroup(child.pid) carries the timeout-path guarantee');
    await waitEsrch(roles.groupA, 'the leaderless group-A member (negative-PGID reap)');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R8-1 — a persistent { reaped: false } drives ONE bounded escalation then FAIL-LOUD (durable alert + error watermark + non-zero outcome), releasing the pidfile AFTER the loud record — never certified clean', { skip: WIN32_SKIP }, async () => {
  // Seam-injected control flow (the OS rarely produces { reaped: false }), on
  // the REAL runJob settle path: the middle exits 0 cleanly after handing up a
  // real re-detached brain, so the ONLY failure driver is the reap backstop —
  // a silent clean completion here would certify a job that left a live group
  // behind (the ADR-0004 violation R8-1 exists to prevent).
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['handup-clean-exit', out, paths.state]),
        reapGroup: async (pgid) => {
          groupCalls.push(pgid);
          return { reaped: false }; // a group that resists every reap (the D-state shape)
        },
      })
      .then(
        () => null,
        (e) => e
      );
    const roles = await waitRoles(out, ['middle', 'brain', 'pidfile-written'], t);
    const thrown = await promise;
    assert.ok(thrown, 'run-job did NOT silently certify the job clean');
    assert.match(thrown.message, /left a live process group behind/);
    assert.match(thrown.message, /bounded final escalation/);
    // ONE bounded FINAL escalation per group — the call count stays bounded,
    // never an unbounded block-until-ESRCH loop: A, B, then escalate A, B.
    assert.deepEqual(groupCalls, [roles.middle, roles.brain, roles.middle, roles.brain],
      'exactly one bounded escalation per still-non-empty group');
    // FAIL LOUD: the durable alert is written and the error watermark set.
    const alerts = readAlerts(paths);
    assert.ok(alerts.some((a) => /left a live process group behind/.test(a.reason)), 'durable state/alerts.jsonl alert');
    const state = jobsLib.readScheduleState(paths);
    assert.equal(state[DREAM_JOB.name].last_status, 'error', 'error watermark — not certified clean');
    assert.ok(state[DREAM_JOB.name].last_error_at, 'last_error_at set');
    assert.ok(!state[DREAM_JOB.name].last_success, 'no success watermark');
    // F3: the token pidfile is released AFTER the loud record — the alert is
    // the record; no later run reads this token, so retention would be a
    // never-read hollow leftover.
    assert.equal(findPidfile(paths), null, 'the retained token pidfile is released after failLoud');
  } finally {
    t.cleanup(); // the scripted seam never really reaped — the harness does (ADR-0004)
  }
});

test('reap-escape: R8-1 on the ABNORMAL settle — a SIGKILLed middle plus a brain group stuck { reaped: false } across the escalation: fail-loud alert + error watermark, the reap failure appended to the job failure', { skip: WIN32_SKIP }, async () => {
  // The spec's literal abnormal-settle R8-1 case (the clean-exit variant above
  // is the stronger silent-certification proof; this one pins the same bounded
  // escalation + fail-loud behavior on a non-clean 'close'). The group-A reap
  // is scripted { reaped: true } (the middle really is gone); ONLY the group-B
  // brain resists — so the assertions isolate the backstop's escalation and
  // loud failure, and the pidfile release after the durable record (F3).
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const brainCalls = [];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['middle-death', out, paths.state]),
        reapGroup: async (pgid, platform, seams) => {
          // Really reap (self-cleaning), but SCRIPT the group-B checked result:
          // { reaped: false } from both the initial reap and the escalation.
          await reapLib.reapGroup(pgid, platform, seams);
          const brain = readRoles(out).find((r) => r.role === 'brain');
          if (brain && pgid === brain.pid) {
            brainCalls.push(pgid);
            return { reaped: false };
          }
          return { reaped: true };
        },
      })
      .then(
        () => null,
        (e) => e
      );
    const roles = await waitRoles(out, ['middle', 'groupA', 'brain', 'pidfile-written'], t);
    process.kill(roles.middle, 'SIGKILL'); // the abnormal (signal) 'close'
    const thrown = await promise;
    assert.ok(thrown, 'the job fails — and does not certify the reap clean either');
    assert.match(thrown.message, /exited null/, 'the original abnormal-settle failure stays surfaced');
    assert.match(thrown.message, /left a live process group behind/, 'the reap failure is appended to it');
    assert.equal(brainCalls.length, 2, 'initial group-B reap + exactly ONE bounded FINAL escalation');
    assert.ok(readAlerts(paths).some((a) => /left a live process group behind/.test(a.reason)),
      'the durable fail-loud alert names the surviving group');
    assert.equal(jobsLib.readScheduleState(paths)[DREAM_JOB.name].last_status, 'error');
    assert.equal(findPidfile(paths), null, 'F3: the token pidfile is released after the loud record');
    await waitEsrch(roles.groupA, 'the group-A descendant (really reaped by the wrapper)');
    await waitEsrch(roles.brain, 'the brain (really reaped by the wrapper — only its RESULT was scripted)');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R8-1 mirror — the bounded escalation resolves to { reaped: true }: the job settles CLEAN, pidfile deleted, no fail-loud', { skip: WIN32_SKIP }, async () => {
  const t = tracker();
  const { out } = tmpOut();
  const { paths } = setupCore();
  /** @type {number[]} */ const groupCalls = [];
  const script = [{ reaped: false }, { reaped: false }, { reaped: true }, { reaped: true }];
  try {
    const promise = runjob
      .runJob(paths, DREAM_JOB, {
        ...baseJobOpts(),
        resolveCommand: middleResolve(['handup-clean-exit', out, paths.state]),
        reapGroup: async (pgid) => {
          groupCalls.push(pgid);
          return script.shift() || { reaped: true };
        },
      })
      .then(
        () => null,
        (e) => e
      );
    const roles = await waitRoles(out, ['middle', 'brain', 'pidfile-written'], t);
    const thrown = await promise;
    assert.equal(thrown, null, thrown && thrown.message);
    assert.deepEqual(groupCalls, [roles.middle, roles.brain, roles.middle, roles.brain],
      'both groups escalate once and verify empty');
    const state = jobsLib.readScheduleState(paths);
    assert.equal(state[DREAM_JOB.name].last_status, 'ok', 'clean settle after the escalation reaped');
    assert.deepEqual(readAlerts(paths), [], 'no fail-loud on the mirror path');
    assert.equal(findPidfile(paths), null, 'the pidfile is deleted once the escalation verified empty');
  } finally {
    t.cleanup(); // the scripted seam never killed the real brain — the harness does
  }
});

// ---------------------------------------------------------------------------
// dream.js live proofs — the REAL runBrainWithWatchdog settle paths, driven
// through dream.run with the pinned fake brain being a REAL process fixture.
// ---------------------------------------------------------------------------

/** A well-formed per-run token exactly as run-job mints it (16 hex chars). */
const TOKEN = 'feedfacecafe0042';

const DREAM_ENV_KEYS = [
  'HOME',
  'WIENERDOG_HOME',
  'WIENERDOG_VAULT',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'WIENERDOG_DREAM_RUN_TOKEN',
  'PATH',
  'WD_SPAWN_VARIANT_MODE',
  'WD_SPAWN_VARIANT_OUT',
];

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

/** Resolve `name` on `searchPath` (first executable regular file wins). */
function resolveOnPath(name, searchPath) {
  for (const dir of String(searchPath).split(path.delimiter).filter(Boolean)) {
    const cand = path.join(dir, name);
    try {
      const st = fs.statSync(cand);
      if (st.isFile() && (st.mode & 0o111) !== 0) {
        return { commandPath: cand, installDir: path.dirname(fs.realpathSync(cand)) };
      }
    } catch {
      /* keep walking */
    }
  }
  return null;
}

/** Sandboxed dream setup: temp home/core/claude + a clean vault git repo + the
 *  injection transcript, with spawn-variant.js PINNED as `claude` (the WP-154
 *  front door — the dream's brain is then a REAL process fixture) and the real
 *  git pinned off the same live PATH. */
function dreamSetup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-dream-'));
  const home = path.join(root, 'home');
  const core = path.join(root, 'core');
  const vault = path.join(root, 'vault');
  const claude = path.join(root, 'claude');
  const codex = path.join(root, 'codex-absent');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(core, { recursive: true });
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(vault, 'README.md'), '# vault\n');
  git(vault, ['init', '-q']);
  git(vault, ['config', 'user.name', 'test']);
  git(vault, ['config', 'user.email', 'test@test']);
  git(vault, ['add', '-A']);
  git(vault, ['commit', '-q', '-m', 'seed']);
  fs.writeFileSync(path.join(core, 'config.yaml'), `vault: ${vault}\ndream_timeout_minutes: 5\n`);
  const projDir = path.join(claude, 'projects', 'proj');
  fs.mkdirSync(projDir, { recursive: true });
  fs.copyFileSync(INJ_FIXTURE, path.join(projDir, 'inj.jsonl'));

  // Pin spawn-variant.js as the `claude` the REAL spawnBrain front door runs
  // (realpath first: macOS /var → /private/var keeps the pin's string checks).
  const realRoot = fs.realpathSync(root);
  const binDir = path.join(realRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const cmd = path.join(binDir, 'claude');
  fs.copyFileSync(SPAWN_VARIANT, cmd);
  fs.chmodSync(cmd, 0o755);
  const pins = {
    claude: { commandPath: cmd, installDir: binDir, version: 'fake', pinnedAt: new Date().toISOString() },
  };
  const livePath = binDir + path.delimiter + process.env.PATH;
  const gitHit = resolveOnPath('git', livePath);
  if (gitHit) {
    pins.git = { commandPath: gitHit.commandPath, installDir: gitHit.installDir, version: 'fake', pinnedAt: new Date().toISOString() };
  }
  const stateDir = path.join(core, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'exec-pins.json'), JSON.stringify({ schema: 1, pins }), { mode: 0o600 });
  return { root, home, core, vault, claude, codex, livePath };
}

/** @param {ReturnType<typeof dreamSetup>} ctx */
function tokenPidfile(ctx) {
  return path.join(ctx.core, 'state', `dream-brain.${TOKEN}.pid`);
}

/** Swap env to the sandbox, run the REAL dream.run (probe skipped via the
 *  JS-only seam), capture the thrown error, restore env. Console is silenced.
 *  @param {ReturnType<typeof dreamSetup>} ctx
 *  @param {Record<string,string|undefined>} extraEnv @param {object} opts */
async function runDreamLive(ctx, extraEnv, opts) {
  const saved = {};
  for (const k of DREAM_ENV_KEYS) saved[k] = process.env[k];
  const next = {
    HOME: ctx.home,
    WIENERDOG_HOME: ctx.core,
    WIENERDOG_VAULT: ctx.vault,
    CLAUDE_CONFIG_DIR: ctx.claude,
    CODEX_HOME: ctx.codex,
    PATH: ctx.livePath,
    ...extraEnv,
  };
  for (const k of DREAM_ENV_KEYS) {
    if (next[k] === undefined) delete process.env[k];
    else process.env[k] = next[k];
  }
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  let thrown = null;
  try {
    await dream.run(['--yes'], { skipContainmentProbe: true, ...opts });
  } catch (e) {
    thrown = e;
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    for (const k of DREAM_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
  return { thrown };
}

test('reap-escape: R6-2 — the brain leader exits NON-ZERO while a real same-pgid group-B child survives: dream.js\'s finally reapGroup(child.pid) reaps it to ESRCH BEFORE the dream-brain pidfile is deleted', { skip: WIN32_SKIP }, async () => {
  // The REAL dream.js runBrainWithWatchdog finally — not a reimplementation.
  // The pinned brain (a real process) spawns a plain same-pgid group-B member
  // that sleeps on independently, then the brain leader exits 3: at settle
  // time the leader is gone but a leaderless group-B member survives. Neither
  // the inner watchdog (timeout-only) nor run-job's backstop (pidfile-gated)
  // would reap it if the finally dropped the pidfile first — the reap/unlink
  // ORDER is the mechanism guarantee (R7-2): reapGroup to verified quiescence
  // FIRST, pidfile unlink only on { reaped: true }.
  const t = tracker();
  const { out } = tmpOut();
  const ctx = dreamSetup();
  const pidfile = tokenPidfile(ctx);
  /** @type {{pgid:number, pidfilePresentAtReap:boolean, memberAliveAtReap:boolean,
   *          reaped:boolean, pidfilePresentAfterVerifiedEmpty:boolean}[]} */
  const calls = [];
  try {
    const { thrown } = await runDreamLive(
      ctx,
      {
        WIENERDOG_DREAM_RUN_TOKEN: TOKEN,
        WD_SPAWN_VARIANT_MODE: 'brain-leader-exit',
        WD_SPAWN_VARIANT_OUT: out,
      },
      {
        reapGroup: async (pgid, platform, seams) => {
          for (const row of readRoles(out)) t.track(row.pid);
          const member = readRoles(out).find((r) => r.role === 'groupB-member');
          const pidfilePresentAtReap = fs.existsSync(pidfile);
          const memberAliveAtReap = !!member && isAlive(member.pid);
          const r = await reapLib.reapGroup(pgid, platform, seams); // the REAL verified-quiescence reap
          calls.push({
            pgid,
            pidfilePresentAtReap,
            memberAliveAtReap,
            reaped: r.reaped,
            // { reaped: true } == the group probed ESRCH (survivor dead) — and
            // at THIS instant the pidfile must still be on disk: quiescence is
            // verified strictly BEFORE the hand-up is released.
            pidfilePresentAfterVerifiedEmpty: fs.existsSync(pidfile),
          });
          return r;
        },
      }
    );
    assert.ok(thrown, 'the run fails on the brain leader\'s non-zero exit');
    assert.match(thrown.message, /dream brain exited 3/);
    assert.equal(calls.length, 1, 'the finally reaps group B exactly once');
    const roles = await waitRoles(out, ['brain-leader', 'groupB-member'], t, 500);
    assert.equal(calls[0].pgid, roles['brain-leader'], 'reapGroup(child.pid) — the brain leader\'s pgid');
    assert.equal(calls[0].memberAliveAtReap, true,
      'the group-B member SURVIVED its leader — the leader\'s exit alone did not remove it (non-vacuity)');
    assert.equal(calls[0].pidfilePresentAtReap, true, 'the reap is ordered BEFORE the pidfile unlink');
    assert.equal(calls[0].reaped, true, 'verified quiescence — kill(-pgid, 0) reached ESRCH');
    assert.equal(calls[0].pidfilePresentAfterVerifiedEmpty, true,
      'the survivor was verified dead while the pidfile STILL existed — ESRCH strictly before delete');
    await waitEsrch(roles['groupB-member'], 'the leaderless group-B member');
    assert.equal(fs.existsSync(pidfile), false, 'the pidfile is deleted only AFTER the verified { reaped: true }');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R10-1 — the hand-up writeFilePrivate write-fail reaps the REAL just-spawned brain to ESRCH and fails the run — never left unsupervised', { skip: WIN32_SKIP }, async () => {
  // Fallible durable I/O (disk-full / permission / temp→final rename), NOT the
  // accepted sub-ms spawn→hand-up-window residual: the write itself throws
  // AFTER a real re-detached brain is alive. No identity was handed up, so
  // run-job's pidfile-gated backstop can never retry this group — dream.js's
  // guard is the only reaper holding child.pid. Without the guard the real
  // brain would keep running unsupervised; this test must fail in that case.
  const t = tracker();
  const ctx = dreamSetup();
  /** @type {{pgid:number, brainAliveAtGuard:boolean}[]} */ const calls = [];
  try {
    const { thrown } = await runDreamLive(
      ctx,
      { WIENERDOG_DREAM_RUN_TOKEN: TOKEN, WD_SPAWN_VARIANT_MODE: 'sleep' },
      {
        writeFilePrivate: () => {
          throw new Error('disk full (injected hand-up write-fail)');
        },
        reapGroup: async (pgid, platform, seams) => {
          t.track(pgid);
          calls.push({ pgid, brainAliveAtGuard: isAlive(pgid) });
          return reapLib.reapGroup(pgid, platform, seams); // the REAL guard reap
        },
      }
    );
    assert.ok(thrown, 'the run FAILS — never a silent unsupervised continuation');
    assert.equal(thrown.constructor.name, 'WienerdogError');
    assert.match(thrown.message, /could not record the brain's process id/);
    assert.equal(calls.length, 1, 'the guard reaps once when the first reap verifies empty');
    assert.equal(calls[0].brainAliveAtGuard, true, 'a REAL live brain existed when the write failed (non-vacuity)');
    await waitEsrch(calls[0].pgid, 'the just-spawned brain (guard-reaped)');
    assert.equal(fs.existsSync(tokenPidfile(ctx)), false, 'no pidfile was ever handed up');
  } finally {
    t.cleanup();
  }
});

test('reap-escape: R11-3 — guard { reaped: false → true }: exactly ONE bounded escalation on the same live brain group, and the run still fails (the hand-up broke)', { skip: WIN32_SKIP }, async () => {
  // Seam-injected checked-result sequence (the OS rarely produces the false):
  // the REAL dream.js guard, a REAL sleeping brain, a scripted reapGroup. The
  // escalation call count must stay bounded — never an unbounded
  // block-until-ESRCH — and the run fails even though the group finally reaped.
  const t = tracker();
  const ctx = dreamSetup();
  /** @type {number[]} */ const calls = [];
  const script = [{ reaped: false }, { reaped: true }];
  try {
    const { thrown } = await runDreamLive(
      ctx,
      { WIENERDOG_DREAM_RUN_TOKEN: TOKEN, WD_SPAWN_VARIANT_MODE: 'sleep' },
      {
        writeFilePrivate: () => {
          throw new Error('rename failed (injected)');
        },
        reapGroup: async (pgid) => {
          t.track(pgid);
          calls.push(pgid);
          return script.shift() || { reaped: true };
        },
      }
    );
    assert.ok(thrown);
    assert.match(thrown.message, /could not record the brain's process id/);
    assert.ok(!/could not be reaped to quiescence/.test(thrown.message),
      'the escalation reached { reaped: true } — no survivor claim in the failure');
    assert.equal(calls.length, 2, 'guard reap + exactly ONE bounded FINAL escalation — the count is bounded');
    assert.equal(calls[0], calls[1], 'the escalation retries the SAME brain group while still holding child.pid');
  } finally {
    t.cleanup(); // the scripted seam never really reaped the live brain — the harness does
  }
});

test('reap-escape: R11-3 — guard { reaped: false → false }: one bounded escalation then a SURVIVOR-SPECIFIC WienerdogError naming the un-reaped brain group — never a silent pass', { skip: WIN32_SKIP }, async () => {
  // The findable-but-un-reapable group (the ADR-0030 D-state residual shape),
  // surfaced LOUDLY: a silent exit, an unbounded loop, or a missing escalation
  // must fail this test.
  const t = tracker();
  const ctx = dreamSetup();
  /** @type {number[]} */ const calls = [];
  try {
    const { thrown } = await runDreamLive(
      ctx,
      { WIENERDOG_DREAM_RUN_TOKEN: TOKEN, WD_SPAWN_VARIANT_MODE: 'sleep' },
      {
        writeFilePrivate: () => {
          throw new Error('EDQUOT (injected)');
        },
        reapGroup: async (pgid) => {
          t.track(pgid);
          calls.push(pgid);
          return { reaped: false };
        },
      }
    );
    assert.ok(thrown, 'NOT a silent pass — the survivor is surfaced loudly (error outcome)');
    assert.equal(thrown.constructor.name, 'WienerdogError');
    assert.match(thrown.message, /could not be reaped to quiescence/, 'survivor-specific failure');
    assert.ok(thrown.message.includes(String(calls[0])), 'names the un-reaped brain group (child.pid)');
    assert.equal(calls.length, 2, 'exactly one bounded escalation — the call count never grows unbounded');
  } finally {
    t.cleanup(); // the scripted seam left the real brain alive — the harness reaps it
  }
});
