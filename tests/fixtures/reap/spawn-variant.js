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
// argv[2] never selects there and mode selection falls back to the control file
// beside this copy of the fixture; `--version` anywhere in argv answers the
// run-evidence version probe immediately.
//
// Modes (argv[2] wins when it is not flag-shaped; else the control file):
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

/**
 * SCENARIO SELECTION — the control file, never the environment
 * (WP-dream-workspace-retarget, Table B's fixture-control row). The dream's
 * child environment is CONSTRUCTED, so the ambient WD_SPAWN_VARIANT_* pair a
 * test used to set can no longer reach a BRAIN-shaped invocation. What can is a
 * JSON file the installing test writes beside this copy of the fixture: the test
 * copies this file into its own temp bin dir and pins that path, so `__dirname`
 * here is that temp dir. Absent the file, the defaults below stand.
 * @returns {{mode?:string, out?:string}}
 */
function control() {
  try {
    return JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'wd-fixture-control.json'), 'utf8'));
  } catch {
    return {};
  }
}

// PRECEDENCE: argv WINS, the control file is only the fallback — and that is
// load-bearing, not tidiness. `spawnSleeper` below re-spawns THIS SAME script
// with 'sleep' as argv[2]; the child resolves the SAME __dirname and therefore
// reads the SAME control file, so an implementation in which the file OVERRODE
// argv would hand the child the parent's spawning mode and fork-bomb (ADR-0004).
// The two routes serve two different invocations: on a brain spawn brain.js owns
// every argv element and composes flag-shaped argv, so argv[2] never selects and
// the control file is the only route; on the self-re-spawn argv[2] is a literal
// mode name and it is the selector.
const ctl = control();
const rawArg = process.argv[2];
const argvSelects = Boolean(rawArg) && !rawArg.startsWith('-');
const mode = argvSelects ? rawArg : ctl.mode || 'sleep';
const out = argvSelects ? process.argv[3] : ctl.out;

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

/** Spawn THIS script again in `sleep` mode. The explicit `'sleep'` argv is what
 *  keeps a re-spawn from inheriting the parent's spawning mode: it takes
 *  precedence over the control file the child re-reads from the same __dirname,
 *  so a pinned-claude invocation can never fork-bomb.
 *  @param {boolean} detached @returns {import('node:child_process').ChildProcess} */
function spawnSleeper(detached) {
  const child = spawn(process.execPath, [__filename, 'sleep'], {
    detached,
    stdio: 'ignore',
    env: process.env,
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
