#!/usr/bin/env node
'use strict';

// The supervised "middle" for the live reap harness (WP-a10-escape-harness).
//
// Plays the role run-job's direct child plays in production (the `wienerdog
// dream` middle): it is spawned detached (its pid IS the group-A pgid) and
// spawns a requested escape variant, records every pid to the shared out file
// (JSON lines {role, pid} — more robust than stdout when run-job pipes stdout
// into its run log), then sleeps or exits per mode. Used as the real reap
// target by tests/integration/reap-escape.test.js.
//
// argv: <mode> <outFile> [stateDir]
//
// Matrix modes (middle records itself, spawns one grandchild, sleeps):
//   plain          plain child tree (escape class (a)).
//   redetach       grandchild detached:true — its own new group/session, ppid
//                  intact: the dream-brain leak shape (class (b)).
//   setsid         a setsid-holder intermediate whose setsid grandchild keeps
//                  live ppid ancestry (class (c)).
//   dfork          double-fork-no-setsid: the intermediate exits, the sleeper
//                  reparents to init but RETAINS the middle's group (class (d)).
//   dfork-setsid   setsid + double-fork combined: full detach — the recorded
//                  ADR-0030 / A12 residual (class (e)).
//   latefork       THIS middle keeps forking group-retaining sleepers on a
//                  tight timer while the reap sweeps (the TOCTOU late-fork
//                  attack, finding 8a). The middle is the reap-target ROOT, so
//                  a grandchild forked between the snapshot and the kill stays
//                  findable (ppid = this middle, group retained) and is caught
//                  by a later rescan. It also spawns ONE timed setsid child
//                  mid-teardown (recorded as 'late-setsid') — the best-effort
//                  fork/setsid interleaving probe for the kill-induced
//                  late-reparent residual (finding 14, ADR-0030): recorded,
//                  never asserted reaped, no test-barrier machinery.
//
// run-job settle-path modes:
//   middle-death <out> <stateDir>   spawn BOTH a plain same-group-A sleeper AND
//                                   a re-detached brain (group B), write the
//                                   per-token pidfile state/dream-brain.<token>.pid
//                                   (token from WIENERDOG_DREAM_RUN_TOKEN), sleep
//                                   until SIGKILLed — the builtin:dream wiring.
//   handup-clean-exit <out> <stateDir>  spawn the re-detached brain + write the
//                                   per-token pidfile, then exit 0 (for the R8-1
//                                   seam cases where run-job holds the backstop).
//   clean-exit <out>                spawn a plain same-group-A sleeper with
//                                   stdio 'ignore' (it does NOT hold the middle's
//                                   stdout/stderr pipe open), then exit 0 — the
//                                   R9-1 clean-close leaderless survivor.
//   pipe-hold <out>                 spawn a plain same-group-A sleeper that
//                                   INHERITS the middle's stdout/stderr pipe
//                                   (delaying run-job's 'close' past the middle's
//                                   real exit), then exit 0 promptly — the R11-1
//                                   leader-exited-at-timeout shape.

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const SPAWN_VARIANT = path.join(__dirname, 'spawn-variant.js');
const mode = process.argv[2];
const out = process.argv[3];
const stateDir = process.argv[4];

/** Append a {role, pid} JSON line to the shared out file. */
function record(role, pid) {
  fs.appendFileSync(out, `${JSON.stringify({ role, pid })}\n`);
}

/** Keep the middle alive — but BOUNDED (ADR-0004: no fixture may outlive its
 *  job): normally killed long before by the reap or the test's finally-cleanup;
 *  if both ever failed, the fixture self-terminates after 10 minutes. */
function keepAlive() {
  setTimeout(() => process.exit(0), 10 * 60 * 1000);
}

/** Spawn spawn-variant.js with `args`. Env mode vars are cleared so nothing
 *  inherited can redirect the variant.
 *  @param {string[]} args @param {boolean} detached
 *  @param {import('node:child_process').StdioOptions} [stdio]
 *  @returns {import('node:child_process').ChildProcess} */
function spawnVariant(args, detached, stdio = 'ignore') {
  const child = spawn(process.execPath, [SPAWN_VARIANT, ...args], {
    detached,
    stdio,
    env: { ...process.env, WD_SPAWN_VARIANT_MODE: '', WD_SPAWN_VARIANT_OUT: '' },
  });
  child.unref();
  return child;
}

/** Write the per-token brain hand-up pidfile exactly as dream.js hands it up
 *  ({pid, pgid} — the brain is detached, so its pid IS its pgid).
 *  @param {number} brainPid */
function writeBrainPidfile(brainPid) {
  const token = process.env.WIENERDOG_DREAM_RUN_TOKEN;
  if (!stateDir || typeof token !== 'string' || !/^[a-f0-9]{16}$/.test(token)) return;
  const pidfile = path.join(stateDir, `dream-brain.${token}.pid`);
  fs.writeFileSync(pidfile, `${JSON.stringify({ pid: brainPid, pgid: brainPid })}\n`);
  record('pidfile-written', brainPid);
}

record('middle', process.pid);

switch (mode) {
  case 'plain': {
    const g = spawnVariant(['sleep'], false);
    record('grandchild', g.pid);
    keepAlive();
    break;
  }

  case 'redetach': {
    const g = spawnVariant(['sleep'], true); // own group/session, ppid intact — the brain leak
    record('grandchild', g.pid);
    keepAlive();
    break;
  }

  case 'setsid': {
    const holder = spawnVariant(['setsid-holder', out], false);
    record('holder', holder.pid); // the holder appends the setsid grandchild pid
    keepAlive();
    break;
  }

  case 'dfork': {
    const inter = spawnVariant(['double-fork', out], false);
    record('intermediate', inter.pid); // exits after spawning the group-retaining sleeper
    keepAlive();
    break;
  }

  case 'dfork-setsid': {
    // The intermediate takes a new session AND its sleeper double-forks with
    // its own new session — the full setsid+double-fork escapee (class (e)).
    const inter = spawnVariant(['double-fork-setsid', out], true);
    record('intermediate', inter.pid);
    keepAlive();
    break;
  }

  case 'latefork': {
    // TOCTOU (finding 8a): THIS middle — the reap-target root, whose pid is in
    // the reap's closure set S by definition even once it is a zombie — keeps
    // forking group-retaining sleepers on a tight timer WHILE the reap sweeps.
    // A grandchild spawned between the snapshot and the kill keeps ppid = this
    // middle and the middle's own pgid, so a later rescan finds and kills it.
    // BOUNDED (40 forks) so the kill–rescan loop always terminates.
    let n = 0;
    const t = setInterval(() => {
      if (n >= 40) {
        clearInterval(t);
        return;
      }
      n += 1;
      const g = spawnVariant(['sleep'], false); // group-retaining: the middle's own pgid
      record('late', g.pid);
      if (n === 3) {
        // Finding 14 (best-effort timer, owner round-2): ONE setsid child
        // spawned mid-teardown — the fork/setsid interleaving probe for the
        // kill-induced late-reparent ADR-0030 residual. Recorded only; the
        // harness never asserts it reaped and builds no barrier machinery.
        const s = spawnVariant(['sleep'], true);
        record('late-setsid', s.pid);
      }
    }, 4);
    keepAlive();
    break;
  }

  case 'middle-death': {
    const groupA = spawnVariant(['sleep'], false, 'ignore'); // same group A (pgid == this middle's pid)
    record('groupA', groupA.pid);
    const brain = spawnVariant(['sleep'], true); // re-detached group B, exactly the dream-brain shape
    record('brain', brain.pid);
    writeBrainPidfile(brain.pid);
    keepAlive(); // sleeps until the test SIGKILLs this middle
    break;
  }

  case 'handup-clean-exit': {
    const brain = spawnVariant(['sleep'], true);
    record('brain', brain.pid);
    writeBrainPidfile(brain.pid);
    process.exit(0);
    break;
  }

  case 'clean-exit': {
    // stdio 'ignore': the survivor must NOT hold the middle's stdout/stderr
    // pipe open, so run-job's 'close' fires with the clean exit 0 (R9-1).
    const groupA = spawnVariant(['sleep'], false, 'ignore');
    record('groupA', groupA.pid);
    process.exit(0);
    break;
  }

  case 'pipe-hold': {
    // The survivor INHERITS this middle's stdout/stderr (run-job's log pipes),
    // so 'close' is delayed past the middle's real exit and the watchdog timer
    // wins the race (R11-1).
    const groupA = spawnVariant(['sleep'], false, ['ignore', 'inherit', 'inherit']);
    record('groupA', groupA.pid);
    process.exit(0);
    break;
  }

  default:
    process.stderr.write(`supervised-child: unknown mode ${JSON.stringify(mode)}\n`);
    process.exit(2);
}
