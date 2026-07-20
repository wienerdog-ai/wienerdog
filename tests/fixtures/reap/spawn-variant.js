#!/usr/bin/env node
'use strict';

// Escape-variant spawner for the live reap harness (WP-a10-escape-harness).
//
// Spawns one grandchild per escape variant — plain / re-detached
// (`detached:true`) / setsid / double-fork-no-setsid / setsid+double-fork —
// each a long "sleep" (an event-loop keep-alive; killed by the reap or by the
// test's finally-cleanup, never left behind). Node's `detached:true` IS the
// setsid technique on POSIX (libuv calls setsid() for a detached child): the
// spec-allowed "Node detached+new-session technique" — no external
// /usr/bin/setsid binary is needed (macOS has none).
//
// It is ALSO the pinned fake "claude" brain for the dream.js live proofs
// (R6-2 / R10-1 / R11-3): spawnBrain invokes it with claude-shaped argv, so
// mode selection falls back to the WD_SPAWN_VARIANT_MODE env var when argv[2]
// is flag-shaped, and `--version` anywhere in argv answers the run-evidence
// version probe immediately.
//
// Modes (argv[2] wins when it is not flag-shaped; else WD_SPAWN_VARIANT_MODE):
//   sleep                          keep-alive forever (the sleeper leaf).
//   setsid-holder <out>            spawn a setsid (detached:true) sleeper, stay
//                                  alive — a new-session grandchild whose ppid
//                                  ancestry stays intact (escape class (c)).
//   double-fork <out>              spawn a group-RETAINING sleeper then exit 0 —
//                                  the sleeper reparents to init but keeps the
//                                  caller's pgid (escape class (d)).
//   double-fork-setsid <out>       spawn a setsid sleeper then exit 0 — with a
//                                  setsid caller this builds the FULL
//                                  setsid+double-fork escapee (class (e), the
//                                  ADR-0030 / A12 residual).
//   brain-leader-exit <out>        R6-2 brain: spawn a plain SAME-pgid group-B
//                                  member, record both pids, exit NON-ZERO (3)
//                                  — a leaderless surviving group-B member.
//
// Every spawned pid is appended to <out> as a JSON line {role, pid} so the
// test can find and (in its finally) kill every fixture process.

const fs = require('node:fs');
const { spawn } = require('node:child_process');

// Answer the pinned-exec version probe (spawnPinnedSync claude --version).
if (process.argv.includes('--version')) {
  process.stdout.write('0.0.0 (wienerdog reap-harness fake claude)\n');
  process.exit(0);
}

const rawArg = process.argv[2];
const mode = rawArg && !rawArg.startsWith('-') ? rawArg : process.env.WD_SPAWN_VARIANT_MODE || 'sleep';
const out = rawArg && !rawArg.startsWith('-') ? process.argv[3] : process.env.WD_SPAWN_VARIANT_OUT;

/** Append a {role, pid} JSON line to the shared out file. */
function record(role, pid) {
  if (out) fs.appendFileSync(out, `${JSON.stringify({ role, pid })}\n`);
}

/** Keep the process alive — but BOUNDED (ADR-0004: no fixture may outlive its
 *  job): normally killed long before by the reap or the test's finally-cleanup;
 *  if both ever failed, the fixture self-terminates after 10 minutes. */
function keepAlive() {
  setTimeout(() => process.exit(0), 10 * 60 * 1000);
}

/** Spawn THIS script again in `sleep` mode. Env mode vars are cleared so a
 *  pinned-claude invocation can never fork-bomb through inherited env.
 *  @param {boolean} detached @returns {import('node:child_process').ChildProcess} */
function spawnSleeper(detached) {
  const child = spawn(process.execPath, [__filename, 'sleep'], {
    detached,
    stdio: 'ignore',
    env: { ...process.env, WD_SPAWN_VARIANT_MODE: '', WD_SPAWN_VARIANT_OUT: '' },
  });
  child.unref();
  return child;
}

switch (mode) {
  case 'sleep':
    keepAlive();
    break;

  case 'setsid-holder': {
    // New session via Node's detached:true (the setsid technique); this holder
    // stays alive so the grandchild's ppid ancestry remains intact.
    const g = spawnSleeper(true);
    record('grandchild', g.pid);
    keepAlive();
    break;
  }

  case 'double-fork': {
    // Group-retaining double fork: the sleeper inherits THIS process's pgid,
    // then this middle parent exits — the sleeper reparents to init but keeps
    // the group, so the reap's group kill still reaches it.
    const g = spawnSleeper(false);
    record('grandchild', g.pid);
    process.exit(0);
    break;
  }

  case 'double-fork-setsid': {
    // The sleeper takes its OWN new session (detached:true) and this parent
    // exits: combined with a setsid caller this is the full escapee — no ppid
    // ancestry, no shared group (the documented ADR-0030 / A12 residual).
    const g = spawnSleeper(true);
    record('grandchild', g.pid);
    process.exit(0);
    break;
  }

  case 'brain-leader-exit': {
    // R6-2: the brain LEADER spawns a plain same-pgid group-B member (which
    // sleeps on independently), records both pids, then exits NON-ZERO — so at
    // settle time the leader is gone but a leaderless group-B member survives,
    // and only dream.js's finally reapGroup(child.pid) can remove it.
    const member = spawnSleeper(false); // detached:false — SAME pgid as the brain
    record('brain-leader', process.pid);
    record('groupB-member', member.pid);
    process.exit(3);
    break;
  }

  default:
    process.stderr.write(`spawn-variant: unknown mode ${JSON.stringify(mode)}\n`);
    process.exit(2);
}
