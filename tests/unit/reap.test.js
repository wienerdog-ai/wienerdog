'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { reapTree, reapGroup, readProcessTable } = require('../../src/core/reap');

/** A recording kill seam. Calls are [target, signal] tuples. */
function killRecorder() {
  /** @type {any[][]} */ const calls = [];
  const kill = (target, signal) => {
    calls.push([target, signal]);
    return true;
  };
  return { calls, kill };
}

/** Build a fake /proc root: each entry {pid, ppid, pgid, comm} becomes
 *  `<root>/<pid>/stat` in the real kernel format (comm may contain spaces and
 *  parens — fields after comm are parsed after the LAST ')').
 *  @param {Array<{pid:number, ppid:number, pgid:number, comm?:string}>} rows
 *  @returns {string} the procRoot */
function fakeProc(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-proc-'));
  for (const r of rows) {
    const dir = path.join(root, String(r.pid));
    fs.mkdirSync(dir, { recursive: true });
    const comm = r.comm || 'proc';
    fs.writeFileSync(
      path.join(dir, 'stat'),
      `${r.pid} (${comm}) S ${r.ppid} ${r.pgid} ${r.pgid} 0 -1 4194304 100 0 0 0\n`
    );
  }
  return root;
}

/** Fixture SystemRoot for the win32 absolute-taskkill branch. When `withExe`,
 *  `<SystemRoot>/System32/taskkill.exe` exists. Returns {systemRoot, taskkill,
 *  restore} — call restore() to put process.env.SystemRoot back. */
function fakeSystemRoot(withExe) {
  const systemRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-sysroot-'));
  const sys32 = path.join(systemRoot, 'System32');
  fs.mkdirSync(sys32, { recursive: true });
  const taskkill = path.join(sys32, 'taskkill.exe');
  if (withExe) fs.writeFileSync(taskkill, 'fake-taskkill-binary');
  const saved = process.env.SystemRoot;
  process.env.SystemRoot = systemRoot;
  const restore = () => {
    if (saved === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = saved;
  };
  return { systemRoot, taskkill, restore };
}

// -------------------------------------------------------------------------
// readProcessTable — Linux /proc reader (no external binary)
// -------------------------------------------------------------------------

test('reap: readProcessTable(linux) parses /proc stat rows incl. comm with spaces and parens', () => {
  const procRoot = fakeProc([
    { pid: 100, ppid: 1, pgid: 100, comm: 'na me (weird) )' },
    { pid: 101, ppid: 100, pgid: 100 },
  ]);
  const table = readProcessTable('linux', { procRoot });
  assert.deepEqual(
    table.sort((a, b) => a.pid - b.pid),
    [
      { pid: 100, ppid: 1, pgid: 100 },
      { pid: 101, ppid: 100, pgid: 100 },
    ]
  );
});

test('reap: R7-3 — a mid-scan vanishing pid (ENOENT on its stat) is SKIPPED, the snapshot keeps the surviving rows', () => {
  // The numeric dir exists (the readdir saw it) but its stat file is gone by
  // the per-entry read — the exact churn shape of a process exiting mid-scan.
  const procRoot = fakeProc([
    { pid: 100, ppid: 1, pgid: 100 },
    { pid: 101, ppid: 100, pgid: 100 },
  ]);
  fs.mkdirSync(path.join(procRoot, '200')); // vanished pid: dir, no stat file
  const table = readProcessTable('linux', { procRoot });
  assert.ok(table, 'the whole table must NOT be nulled by one vanished, unrelated pid');
  assert.deepEqual(
    table.sort((a, b) => a.pid - b.pid),
    [
      { pid: 100, ppid: 1, pgid: 100 },
      { pid: 101, ppid: 100, pgid: 100 },
    ],
    'surviving rows returned; the vanished entry skipped'
  );
});

test('reap: R7-3 — the churn regression: the descendant reap still proceeds over the surviving rows (no legacy fallback)', () => {
  // Target 50 with descendant 60; unrelated pid 70 vanishes mid-scan. The reap
  // must still enumerate + kill the descendant tree (group AND pid kills),
  // NOT fall back to the legacy single group-kill (which would leak a
  // separately-detached descendant).
  const procRoot = fakeProc([
    { pid: 50, ppid: 1, pgid: 50 },
    { pid: 60, ppid: 50, pgid: 60 }, // re-detached: own group, still a ppid-descendant
  ]);
  fs.mkdirSync(path.join(procRoot, '70')); // mid-scan vanisher
  const { calls, kill } = killRecorder();
  reapTree(50, 'linux', { procRoot, kill, maxSweeps: 2, pollDelayMs: 0 });
  const targets = calls.map((c) => c[0]);
  assert.ok(targets.includes(-60), 'the re-detached descendant GROUP is killed (not only group A)');
  assert.ok(targets.includes(60), 'the descendant pid is killed');
  assert.ok(targets.includes(-50) && targets.includes(50), 'the target and its group are killed');
});

test('reap: readProcessTable(linux) → null ONLY when the snapshot is unusable as a whole', () => {
  // Unreadable procRoot (absent dir).
  assert.equal(readProcessTable('linux', { procRoot: '/nonexistent-wd-reap-root' }), null);
  // Zero usable rows: numeric dirs exist but every stat is garbage/absent.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-reap-empty-'));
  fs.mkdirSync(path.join(empty, '300'));
  fs.mkdirSync(path.join(empty, '301'));
  fs.writeFileSync(path.join(empty, '301', 'stat'), 'complete garbage with no paren');
  assert.equal(readProcessTable('linux', { procRoot: empty }), null, 'zero usable rows == unusable');
});

// -------------------------------------------------------------------------
// readProcessTable — darwin/BSD: verified ABSOLUTE /bin/ps, never bare `ps`
// -------------------------------------------------------------------------

test('reap: readProcessTable(darwin) spawns the ABSOLUTE /bin/ps (never a bare-name, PATH-winnable `ps`)', () => {
  /** @type {any[][]} */ const spawnCalls = [];
  const spawnSync = (cmd, args) => {
    spawnCalls.push([cmd, args]);
    return { status: 0, stdout: ' 10  1  10\n 11 10  10\nmalformed line here extra\n' };
  };
  const table = readProcessTable('darwin', {
    spawnSync,
    verifyPs: () => ({ ok: true }),
  });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0][0], '/bin/ps', 'argv[0] is the absolute /bin/ps');
  assert.notEqual(spawnCalls[0][0], 'ps', 'never the bare name');
  assert.deepEqual(spawnCalls[0][1], ['-A', '-o', 'pid=,ppid=,pgid=']);
  assert.deepEqual(table, [
    { pid: 10, ppid: 1, pgid: 10 },
    { pid: 11, ppid: 10, pgid: 10 },
  ], 'triples parsed; a single malformed line skipped, not fatal');
});

test('reap: readProcessTable(darwin) refuses a relative psPath and a failed verification (→ null, no spawn)', () => {
  /** @type {any[][]} */ const spawnCalls = [];
  const spawnSync = (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0, stdout: '1 0 1\n' });
  // Relative psPath — never a PATH lookup.
  assert.equal(readProcessTable('darwin', { spawnSync, psPath: 'ps', verifyPs: () => ({ ok: true }) }), null);
  // Structural verification fails (e.g. a swapped/unowned binary) → null, no spawn.
  assert.equal(readProcessTable('darwin', { spawnSync, verifyPs: () => ({ ok: false, why: 'nope' }) }), null);
  assert.equal(spawnCalls.length, 0, 'an unverified ps is NEVER spawned');
});

test('reap: reapTree(darwin) degrades to the legacy group-kill when /bin/ps is unverifiable — and the degradation is VISIBLE', () => {
  const { calls, kill } = killRecorder();
  const d = reapTree(4242, 'darwin', {
    kill,
    verifyPs: () => ({ ok: false, why: 'planted' }),
    spawnSync: () => {
      throw new Error('must not be reached');
    },
    pollDelayMs: 0,
  });
  assert.deepEqual(calls, [[-4242, 'SIGKILL']], 'legacy single group-kill fallback');
  assert.equal(d.degraded, true, 'F1: best-effort degradation is surfaced, never silent');
  assert.match(d.why, /unavailable|fallback/i);
});

test('reap: F1 — a NON-ZERO-exit /bin/ps is never an authoritative table: null snapshot, legacy fallback, degradation surfaced', () => {
  // Execution-proven repro: a failing/interrupted ps that still emitted one
  // parseable partial row must NOT be treated as a complete snapshot — that
  // would skip the legacy kill and silently omit a separately-detached
  // descendant group.
  const partial = () => ({ status: 1, stdout: '4242 1 4242\n' });
  assert.equal(
    readProcessTable('darwin', { spawnSync: partial, verifyPs: () => ({ ok: true }) }),
    null,
    'exit 1 + parseable partial stdout → the whole snapshot is unusable'
  );
  // A signalled ps (status null) is equally unusable.
  assert.equal(
    readProcessTable('darwin', {
      spawnSync: () => ({ status: null, signal: 'SIGKILL', stdout: '1 0 1\n' }),
      verifyPs: () => ({ ok: true }),
    }),
    null,
    'a signalled ps yields no table'
  );
  // A spawn-level error object is unusable even with a zero status.
  assert.equal(
    readProcessTable('darwin', {
      spawnSync: () => ({ status: 0, error: new Error('EAGAIN'), stdout: '1 0 1\n' }),
      verifyPs: () => ({ ok: true }),
    }),
    null,
    'a spawn error yields no table'
  );
  // reapTree therefore takes the legacy group-kill fallback AND reports it.
  const { calls, kill } = killRecorder();
  const d = reapTree(4242, 'darwin', {
    kill,
    spawnSync: partial,
    verifyPs: () => ({ ok: true }),
    pollDelayMs: 0,
  });
  assert.deepEqual(calls, [[-4242, 'SIGKILL']], 'legacy fallback fired — the partial table was rejected');
  assert.equal(d.degraded, true, 'the degradation is observable in the returned diagnostic');
  assert.match(d.why, /unavailable|fallback/i);
});

// -------------------------------------------------------------------------
// reapTree — descendant classification + guards + quiescence
// -------------------------------------------------------------------------

test('reap: reapTree kills plain, re-detached, and setsid descendants, and covers double-fork via the group kill', () => {
  let emptied = false;
  const table = [
    { pid: 10, ppid: 1, pgid: 10 }, // the target (group-A leader)
    { pid: 11, ppid: 10, pgid: 10 }, // plain child
    { pid: 12, ppid: 10, pgid: 12 }, // re-detached: OWN group, still a ppid-descendant
    { pid: 13, ppid: 10, pgid: 13 }, // setsid child: new session, ppid intact
    { pid: 14, ppid: 1, pgid: 10 }, // double-fork-no-setsid: reparented to init, group retained
  ];
  const { calls, kill } = killRecorder();
  reapTree(10, 'linux', {
    kill,
    readTable: () => (emptied ? [] : ((emptied = true), table)),
    pollDelayMs: 0,
  });
  const targets = new Set(calls.map((c) => c[0]));
  // Groups: -10 (covers 10, 11, and the double-forked 14), -12, -13.
  for (const g of [-10, -12, -13]) assert.ok(targets.has(g), `group kill ${g}`);
  // Pids in the ppid-closure: 10, 11, 12, 13 (14 is NOT a ppid-descendant —
  // it is reached only through its retained group, -10).
  for (const p of [10, 11, 12, 13]) assert.ok(targets.has(p), `pid kill ${p}`);
  assert.ok(!targets.has(14), 'a reparented pid outside the closure gets no positive kill');
  // Nothing outside S ∪ (−G) is ever signalled.
  const allowed = new Set([-10, -12, -13, 10, 11, 12, 13]);
  for (const t of targets) assert.ok(allowed.has(t), `unexpected kill target ${t}`);
});

test('reap: reapTree closes the snapshot→kill fork race — a child forked between sweeps is caught by the re-scan', () => {
  // Sweep 1 sees the child 11; by sweep 2 a NEW child 12 (forked in the race
  // window) appears; the loop must kill it too and only stop after two
  // consecutive clean sweeps.
  const tables = [
    [{ pid: 10, ppid: 1, pgid: 10 }, { pid: 11, ppid: 10, pgid: 10 }],
    [{ pid: 12, ppid: 10, pgid: 12 }], // the racer (its parent row already gone)
    [],
    [],
  ];
  let i = 0;
  const { calls, kill } = killRecorder();
  reapTree(10, 'linux', { kill, readTable: () => tables[Math.min(i++, tables.length - 1)], pollDelayMs: 0 });
  const targets = calls.map((c) => c[0]);
  assert.ok(targets.includes(12), 'the mid-race forked child is killed on the re-sweep');
  assert.ok(targets.includes(-12), 'its group too');
  assert.ok(i >= 4, 'quiescence needs two consecutive clean snapshots');
});

test('reap: reapTree is BOUNDED — a table that never empties stops at maxSweeps and never throws', () => {
  const table = [{ pid: 10, ppid: 1, pgid: 10 }, { pid: 11, ppid: 10, pgid: 10 }];
  let snapshots = 0;
  const { kill } = killRecorder();
  assert.doesNotThrow(() =>
    reapTree(10, 'linux', { kill, readTable: () => (snapshots++, table), maxSweeps: 3, pollDelayMs: 0 })
  );
  assert.ok(snapshots <= 4, `bounded snapshots (got ${snapshots})`);
});

test('reap: reapTree never kills pid 1, process.pid, or anything outside the closure — even on a corrupt table', () => {
  // A hostile/corrupt table tries to pull pid 1 and the supervisor into S.
  const table = [
    { pid: 10, ppid: 1, pgid: 10 },
    { pid: 1, ppid: 10, pgid: 1 }, // corrupt: claims init is a child of the target
    { pid: process.pid, ppid: 10, pgid: process.pid }, // claims the supervisor is too
  ];
  let emptied = false;
  const { calls, kill } = killRecorder();
  reapTree(10, 'linux', { kill, readTable: () => (emptied ? [] : ((emptied = true), table)), pollDelayMs: 0 });
  const targets = calls.map((c) => c[0]);
  assert.ok(!targets.includes(1) && !targets.includes(-1), 'never pid/pgid 1');
  assert.ok(!targets.includes(process.pid) && !targets.includes(-process.pid), 'never the supervisor');
});

test('reap: reapTree never throws — bad table, throwing readTable, throwing kill', () => {
  const throwingKill = () => {
    throw Object.assign(new Error('gone'), { code: 'ESRCH' });
  };
  assert.doesNotThrow(() => reapTree(999999, 'linux', { kill: throwingKill, readTable: () => null }));
  assert.doesNotThrow(() =>
    reapTree(999999, 'linux', {
      kill: throwingKill,
      readTable: () => {
        throw new Error('table exploded');
      },
    })
  );
  assert.doesNotThrow(() =>
    reapTree(999999, 'linux', { kill: throwingKill, readTable: () => [{ garbage: true }], pollDelayMs: 0 })
  );
});

test('reap: reapTree falls back to the legacy group-kill on a null/empty table', () => {
  const { calls, kill } = killRecorder();
  reapTree(4242, 'linux', { kill, readTable: () => null });
  assert.deepEqual(calls, [[-4242, 'SIGKILL']]);
});

// -------------------------------------------------------------------------
// reapGroup — checked negative-PGID reap to VERIFIED quiescence (R7-2)
// -------------------------------------------------------------------------

test('reap: reapGroup reaps an exited-leader-with-live-member group to verified empty via the NEGATIVE pgid', async () => {
  // The group leader (pgid 500) has exited; one member survives. A positive-pid
  // table lookup would find nothing — the negative-PGID kill is what reaches
  // the member. Simulate: the member absorbs one SIGKILL round, then the group
  // is empty (probe throws ESRCH).
  let sigkills = 0;
  /** @type {any[][]} */ const calls = [];
  const kill = (target, signal) => {
    calls.push([target, signal]);
    assert.ok(target < 0, 'every reapGroup signal is negative-PGID');
    if (signal === 'SIGKILL') {
      sigkills += 1;
      return true;
    }
    // probe (signal 0): the member is gone after the second SIGKILL round
    if (sigkills >= 2) throw Object.assign(new Error('no such group'), { code: 'ESRCH' });
    return true;
  };
  const r = await reapGroup(500, 'linux', { kill, pollDelayMs: 0 });
  assert.deepEqual(r, { reaped: true }, 'checked result: verified empty');
  assert.equal(calls[0][0], -500, 'first kill is the negative pgid');
  assert.ok(calls.some((c) => c[1] === 0), 'polled with kill(-pgid, 0) to VERIFY quiescence');
});

test('reap: reapGroup on an already-empty group is a harmless ESRCH → { reaped: true } at once', async () => {
  /** @type {any[][]} */ const calls = [];
  const kill = (target, signal) => {
    calls.push([target, signal]);
    throw Object.assign(new Error('no such process'), { code: 'ESRCH' });
  };
  const r = await reapGroup(500, 'linux', { kill, pollDelayMs: 0 });
  assert.deepEqual(r, { reaped: true });
  assert.ok(calls.length <= 2, 'idempotent fast path: kill + one probe');
});

test('reap: R7-2 — reapGroup returns the checked { reaped: false } when the bounded poll times out with a member still present', async () => {
  // A member that never dies (kernel D-state shape): the probe always succeeds.
  /** @type {any[][]} */ const calls = [];
  const kill = (target, signal) => (calls.push([target, signal]), true);
  const r = await reapGroup(500, 'linux', { kill, maxPolls: 3, pollDelayMs: 0 });
  assert.deepEqual(r, { reaped: false }, 'a successful SIGKILL alone is NEVER treated as completion');
  // Bounded: initial kill + per-poll (probe + re-kill) — never an unbounded
  // block-until-ESRCH.
  assert.ok(calls.length <= 1 + 3 * 2, `bounded poll (got ${calls.length} calls)`);
  assert.ok(calls.filter((c) => c[1] === 0).length === 3, 'exactly maxPolls probes');
});

test('reap: reapGroup guards — never targets pgid 1, process.pid, or the supervisor\'s own group; never throws', async () => {
  const { calls, kill } = killRecorder();
  assert.deepEqual(await reapGroup(1, 'linux', { kill }), { reaped: true });
  assert.deepEqual(await reapGroup(0, 'linux', { kill }), { reaped: true });
  assert.deepEqual(await reapGroup(-5, 'linux', { kill }), { reaped: true });
  assert.deepEqual(await reapGroup(NaN, 'linux', { kill }), { reaped: true });
  assert.deepEqual(await reapGroup(process.pid, 'linux', { kill }), { reaped: true });
  assert.equal(calls.length, 0, 'a guarded target is never signalled at all');
  // A kill seam that throws a non-ESRCH error never escapes (checked false).
  const r = await reapGroup(777777, 'linux', {
    kill: () => {
      throw new Error('EPERM-ish');
    },
    maxPolls: 2,
    pollDelayMs: 0,
  });
  assert.deepEqual(r, { reaped: false }, 'an unverifiable group is never reported reaped');
});

// -------------------------------------------------------------------------
// win32 — the ABSOLUTE System32 taskkill; NEVER a bare-name / PATH-planted one
// -------------------------------------------------------------------------

test('reap: win32 reapTree shells the ABSOLUTE System32 taskkill /T /F — a PATH-planted taskkill is never consulted', () => {
  const sr = fakeSystemRoot(true);
  try {
    /** @type {any[][]} */ const spawnCalls = [];
    const spawnSync = (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 });
    reapTree(4242, 'win32', { spawnSync });
    assert.equal(spawnCalls.length, 1);
    assert.equal(spawnCalls[0][0], sr.taskkill, 'the resolved absolute System32 path, held in a variable');
    assert.ok(path.isAbsolute(spawnCalls[0][0]), 'absolute — never resolved through the job PATH');
    assert.notEqual(spawnCalls[0][0], 'taskkill', 'never the bare name');
    assert.deepEqual(spawnCalls[0][1], ['/PID', '4242', '/T', '/F']);
  } finally {
    sr.restore();
  }
});

test('reap: F2 — win32 with System32 taskkill ABSENT: diagnosed { reaped: false }, zero spawns, NEVER a bare-name fallback', async () => {
  const sr = fakeSystemRoot(false); // System32 exists, taskkill.exe does not
  try {
    /** @type {any[][]} */ const spawnCalls = [];
    const spawnSync = (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 });
    const d = reapTree(4242, 'win32', { spawnSync });
    const g = await reapGroup(4242, 'win32', { spawnSync });
    assert.equal(spawnCalls.length, 0, 'nothing spawned — no bare-name taskkill fallback exists');
    assert.equal(g.reaped, false, 'the supervisor never claims the tree stopped when taskkill never ran');
    assert.match(g.why, /absent/i, 'diagnostic names the cause');
    assert.equal(d.degraded, true, 'reapTree surfaces the same degradation');
    // The false is a surfaced DIAGNOSTIC only — the POSIX R8-1 fail-loud
    // escalation does not activate on win32 (run-job never calls settleReaps
    // there; asserted in scheduler-runjob.test.js).
  } finally {
    sr.restore();
  }
});

test('reap: F2/G1 — win32 reapGroup trusts ONLY taskkill exit 0; exit 128 (and any other non-zero) is { reaped: false }', async () => {
  const sr = fakeSystemRoot(true);
  try {
    const withStatus = (status) => () => ({ status });
    assert.deepEqual(await reapGroup(555, 'win32', { spawnSync: withStatus(0) }), { reaped: true }, 'exit 0 = killed');
    // G1: 128 (ERROR_WAIT_NO_CHILDREN) can be an init failure BEFORE any kill —
    // a live tree can exit 128, so it must NOT falsely certify a reap.
    const notFound = await reapGroup(555, 'win32', { spawnSync: withStatus(128) });
    assert.equal(notFound.reaped, false, 'exit 128 is NOT trusted as "already gone" — a live tree can exit 128');
    assert.match(notFound.why, /exited 128|only exit 0/i);
    const failed = await reapGroup(555, 'win32', { spawnSync: withStatus(5) });
    assert.equal(failed.reaped, false, 'a non-zero taskkill exit is NOT success');
    assert.match(failed.why, /exited 5/);
    const signalled = await reapGroup(555, 'win32', { spawnSync: () => ({ status: null, signal: 'SIGTERM' }) });
    assert.equal(signalled.reaped, false, 'a signalled taskkill is NOT success');
  } finally {
    sr.restore();
  }
});

test('reap: win32 reapGroup shells the absolute taskkill; { reaped: true } only on a checked success — NO leaderless-member guarantee (R5-2)', async () => {
  // win32 has no negative-PGID equivalent: taskkill reaches only a LIVE pid +
  // its LIVE tree, so the leaderless reparented member is NOT covered here
  // (deferred to WP-a10-windows-reap); F2: the result is checked against the
  // taskkill exit, not an unconditional best-effort true.
  const sr = fakeSystemRoot(true);
  try {
    /** @type {any[][]} */ const spawnCalls = [];
    /** @type {any[][]} */ const killCalls = [];
    const spawnSync = (cmd, args) => (spawnCalls.push([cmd, args]), { status: 0 });
    const kill = (...a) => (killCalls.push(a), true);
    const r = await reapGroup(555, 'win32', { spawnSync, kill });
    assert.deepEqual(r, { reaped: true });
    assert.equal(spawnCalls[0][0], sr.taskkill);
    assert.deepEqual(spawnCalls[0][1], ['/PID', '555', '/T', '/F']);
    assert.equal(killCalls.length, 0, 'no POSIX signal path on win32');
  } finally {
    sr.restore();
  }
});

test('reap: win32 branch never throws when taskkill spawn fails', async () => {
  const sr = fakeSystemRoot(true);
  try {
    const boom = () => {
      throw new Error('spawn failed');
    };
    assert.doesNotThrow(() => reapTree(1, 'win32', { spawnSync: boom }));
    const g = await reapGroup(99, 'win32', { spawnSync: boom });
    assert.equal(g.reaped, false, 'F2: a taskkill spawn failure is never reported as a reaped tree');
    assert.match(g.why, /spawn/i);
  } finally {
    sr.restore();
  }
});

// -------------------------------------------------------------------------
// R11-3 escalation-shape sanity: the checked result drives the callers'
// bounded escalation (false → true / false → false); the primitive itself
// stays bounded and never throws (the caller-side wiring is asserted in
// scheduler-runjob.test.js and dream.test.js).
// -------------------------------------------------------------------------

test('reap: repeated reapGroup calls (a caller\'s bounded escalation) stay independent and bounded — false → true is expressible', async () => {
  // First call: the member survives the whole bounded poll → { reaped: false }.
  // Second call (the caller's ONE bounded final escalation): the member is
  // gone → { reaped: true }. The survivor case (false → false) is simply two
  // timed-out polls; no unbounded blocking anywhere.
  let dead = false;
  const kill = (target, signal) => {
    if (signal === 0 && dead) throw Object.assign(new Error('gone'), { code: 'ESRCH' });
    return true;
  };
  const first = await reapGroup(600, 'linux', { kill, maxPolls: 2, pollDelayMs: 0 });
  assert.deepEqual(first, { reaped: false });
  dead = true;
  const second = await reapGroup(600, 'linux', { kill, maxPolls: 2, pollDelayMs: 0 });
  assert.deepEqual(second, { reaped: true }, 'the escalation call verifies quiescence independently');
});
