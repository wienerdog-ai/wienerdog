'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/**
 * Process reaping to quiescence (audit A10, ADR-0030, WP-a10-reap-mechanism).
 *
 * One supervisor primitive pair used by run-job's watchdog and dream.js:
 *
 *  - `reapTree(pid)` — read the process table from an AUTHORITATIVE source
 *    (Linux `/proc` directly; macOS/BSD the verified absolute `/bin/ps` —
 *    NEVER a PATH-resolved bare `ps`, which the job PATH could front-run with
 *    a planted fake that misdirects the SIGKILLs), compute the real transitive
 *    ppid-descendant tree plus every process group those descendants belong
 *    to, SIGKILL both, and re-snapshot/re-kill until two consecutive sweeps
 *    find zero descendants (bounded). Best-effort; never throws.
 *  - `reapGroup(pgid)` — the authenticated-PGID primitive for the handed-up
 *    brain group: an explicit NEGATIVE-PGID `kill(-pgid, SIGKILL)` (reaches
 *    every surviving member even after the group leader exited) followed by a
 *    bounded poll (`kill(-pgid, 0)` until ESRCH) to VERIFIED quiescence,
 *    returning a CHECKED `{ reaped }` result. Best-effort; never throws.
 *
 * Platform scope (R5-2, owner-approved — ordinary platform scope, NOT an
 * ADR-0030 adversarial residual): the leaderless-reparented-member guarantee is
 * POSIX-only this release. win32 has NO negative-PGID equivalent — `taskkill
 * /PID <pid> /T /F` reaches only a LIVE pid and its LIVE child tree, so once
 * the group leader has exited it reaches nothing and provides NO
 * leaderless-member guarantee. The win32 branch keeps the pre-A10 tree-kill
 * shape (hardened to the ABSOLUTE System32 taskkill with no bare-name
 * fallback); the Windows post-parent-exit case is deferred to
 * WP-a10-windows-reap. Job Objects are explicitly out of scope.
 */

/** Bounded re-sweep default for reapTree. */
const DEFAULT_MAX_SWEEPS = 5;
/** Bounded quiescence-poll default for reapGroup. */
const DEFAULT_MAX_POLLS = 5;
/** Delay between real quiescence polls/sweeps (ms) — gives the kernel/init a
 *  beat to reap the SIGKILLed processes before the next probe. Tests inject
 *  `pollDelayMs: 0` to keep fake-seam cases instant. */
const DEFAULT_POLL_DELAY_MS = 40;

/** Synchronous, dependency-free sleep (Atomics.wait — never spawns anything).
 *  @param {number} ms */
function sleepMs(ms) {
  if (!(ms > 0)) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    /* best-effort — a platform without SharedArrayBuffer just polls tightly */
  }
}

/**
 * Structural verification of the absolute `/bin/ps` before it is spawned as a
 * KILL authority. Same checks as exec-identity's structural verifier (WP-154):
 * regular file, an execute bit, owner uid ∈ {current uid, root}, and no
 * group/other-writable non-root-owned ancestor dir. Reimplemented locally
 * (with a distinct name) because the post-fix-pass exec-identity module keeps
 * its verifier module-internal — execution-only encapsulation, R13/R15,
 * enforced by the pinned-exec canary; injectable via the `verifyPs` seam so
 * tests can force a verification failure and assert the legacy fallback.
 * @param {string} realpath
 * @param {NodeJS.Platform} platform
 * @returns {{ok:true}|{ok:false, why:string}}
 */
function verifyPsBinary(realpath, platform) {
  let st;
  try {
    st = fs.statSync(realpath);
  } catch (err) {
    return { ok: false, why: `cannot stat ${realpath}: ${err.message}` };
  }
  if (!st.isFile()) return { ok: false, why: `${realpath} is not a regular file` };
  if (platform === 'win32') return { ok: true };
  if ((st.mode & 0o111) === 0) return { ok: false, why: `${realpath} has no execute bit` };
  const uid = process.getuid ? process.getuid() : 0;
  if (st.uid !== uid && st.uid !== 0) {
    return { ok: false, why: `${realpath} is owned by uid ${st.uid}, not the current user (${uid}) or root` };
  }
  let dir = path.dirname(realpath);
  for (;;) {
    let ds;
    try {
      ds = fs.statSync(dir);
    } catch (err) {
      return { ok: false, why: `cannot stat ancestor ${dir}: ${err.message}` };
    }
    if ((ds.mode & 0o022) !== 0 && ds.uid !== 0) {
      return { ok: false, why: `ancestor directory ${dir} is group/other-writable and not root-owned` };
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { ok: true };
}

/**
 * Linux reader: readdir `<procRoot>`, parse `<procRoot>/<pid>/stat` per numeric
 * entry (pid = field 1, ppid = field 4, pgrp = field 5 — parsed AFTER the last
 * ')' because comm may contain spaces/parens). No external binary.
 *
 * Per-PID disappearance is normal churn, NOT a failure (R7-3): a process
 * routinely exits between the readdir and the per-entry stat read, so a
 * per-entry ENOENT/ESRCH (or an unreadable/empty single stat file) SKIPS that
 * pid and the walk CONTINUES with the surviving rows — a mid-scan vanishing
 * unrelated pid must NOT null the whole table (nulling would drop the caller
 * to the legacy single group-kill and leak the separately-detached brain).
 * @param {string} procRoot
 * @returns {Array<{pid:number, ppid:number, pgid:number}>|null}
 */
function readTableLinux(procRoot) {
  let entries;
  try {
    entries = fs.readdirSync(procRoot);
  } catch {
    return null; // unreadable /proc root — the snapshot is unusable AS A WHOLE
  }
  /** @type {Array<{pid:number, ppid:number, pgid:number}>} */
  const rows = [];
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue;
    let raw;
    try {
      raw = fs.readFileSync(path.join(procRoot, name, 'stat'), 'utf8');
    } catch {
      continue; // R7-3: the pid vanished mid-scan (ENOENT/ESRCH) — skip, don't null
    }
    if (!raw) continue; // empty stat — skip this pid, keep the snapshot
    const close = raw.lastIndexOf(')');
    if (close === -1) continue;
    const pid = parseInt(raw, 10);
    const rest = raw.slice(close + 1).trim().split(/\s+/);
    const ppid = Number(rest[1]);
    const pgid = Number(rest[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isInteger(pgid)) continue;
    rows.push({ pid, ppid, pgid });
  }
  return rows.length > 0 ? rows : null; // zero usable rows == unusable snapshot
}

/**
 * darwin/BSD reader: spawn the ABSOLUTE, SIP-protected `/bin/ps` — never a
 * bare `ps` (the job PATH front-loads the user-writable ~/.local/bin, the
 * ADR-0028 executable-injection class, and here the resolved binary decides
 * what gets KILLED) — and only after structural verification passes.
 * @param {string} psPath
 * @param {typeof spawnSync} sspawn
 * @param {typeof verifyPsBinary} verify
 * @param {NodeJS.Platform} platform
 * @returns {Array<{pid:number, ppid:number, pgid:number}>|null}
 */
function readTablePs(psPath, sspawn, verify, platform) {
  if (typeof psPath !== 'string' || !path.isAbsolute(psPath)) return null; // never a PATH lookup
  let v;
  try {
    v = verify(psPath, platform);
  } catch {
    return null;
  }
  if (!v || v.ok !== true) return null; // missing/unverifiable /bin/ps → unusable snapshot
  let r;
  try {
    r = sspawn(psPath, ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
  } catch {
    return null;
  }
  if (!r || r.error || typeof r.stdout !== 'string') return null;
  /** @type {Array<{pid:number, ppid:number, pgid:number}>} */
  const rows = [];
  for (const line of r.stdout.split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length !== 3) continue; // a single malformed line is skipped, not fatal
    const pid = Number(parts[0]);
    const ppid = Number(parts[1]);
    const pgid = Number(parts[2]);
    if (!Number.isInteger(pid) || !Number.isInteger(ppid) || !Number.isInteger(pgid)) continue;
    rows.push({ pid, ppid, pgid });
  }
  return rows.length > 0 ? rows : null;
}

/**
 * Read the process table from the authoritative source for `platform`.
 * Linux: `<procRoot>` (default '/proc') directly — no external binary.
 * darwin/bsd: the verified ABSOLUTE `psPath` (default '/bin/ps') — never 'ps'.
 * Returns `null` ONLY when the snapshot is unusable AS A WHOLE (unreadable
 * `<procRoot>` root, missing/unverifiable `/bin/ps` or a failed spawn, or zero
 * usable rows); a table with SOME rows (individual entries skipped for per-PID
 * races, R7-3) is returned, never nulled. The caller falls back to the legacy
 * group-kill only on `null`.
 * @param {NodeJS.Platform} platform  inject it — never mock process.platform
 * @param {{spawnSync?: typeof spawnSync, procRoot?: string, psPath?: string,
 *          verifyPs?: typeof verifyPsBinary}} [seams]
 * @returns {Array<{pid:number, ppid:number, pgid:number}>|null}
 */
function readProcessTable(platform, seams = {}) {
  try {
    if (platform === 'linux') {
      return readTableLinux(seams.procRoot || '/proc');
    }
    if (platform === 'darwin' || platform === 'freebsd' || platform === 'openbsd' || platform === 'netbsd') {
      return readTablePs(
        seams.psPath || '/bin/ps',
        seams.spawnSync || spawnSync,
        seams.verifyPs || verifyPsBinary,
        platform
      );
    }
    return null; // unknown platform — the caller degrades to the legacy group-kill
  } catch {
    return null;
  }
}

/** Transitive ppid-closure of `root` over `table`, always including `root`.
 *  @param {Array<{pid:number, ppid:number, pgid:number}>} table
 *  @param {number} root
 *  @returns {Set<number>} */
function descendantClosure(table, root) {
  const S = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of table) {
      if (!S.has(r.pid) && S.has(r.ppid)) {
        S.add(r.pid);
        grew = true;
      }
    }
  }
  return S;
}

/** The supervisor's own pgid (guarded so the reap can never target it), or null. */
function selfPgid() {
  try {
    return typeof process.getpgrp === 'function' ? process.getpgrp() : null;
  } catch {
    return null;
  }
}

/** True when `id` may be signalled at all: never pid/pgid 1 (kill(-1) is
 *  kill-everything), never the supervisor itself or its own group.
 *  @param {number} id @returns {boolean} */
function safeTarget(id) {
  if (!Number.isInteger(id) || id <= 1) return false;
  if (id === process.pid) return false;
  const own = selfPgid();
  if (own !== null && id === own) return false;
  return true;
}

/**
 * win32: the ABSOLUTE System32 `taskkill /PID <pid> /T /F` — the resolved path
 * is held in a variable and spawned only if it exists. An absent System32
 * taskkill.exe is a closed, diagnosed cleanup failure: a best-effort no-op,
 * NEVER a bare-name fallback (the Windows clean-run PATH front-loads the
 * user-writable ~/.local/bin ahead of System32 — a bare name is the same
 * executable-injection class as bare `ps`, and worse because it kills).
 * @param {number} pid
 * @param {{spawnSync?: typeof spawnSync}} seams
 */
function taskkillTree(pid, seams) {
  const sspawn = seams.spawnSync || spawnSync;
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  const taskkillPath = path.join(systemRoot, 'System32', 'taskkill.exe');
  let present = false;
  try {
    present = fs.statSync(taskkillPath).isFile();
  } catch {
    present = false;
  }
  if (!present) return; // diagnosed no-op — never fall back to a bare-name taskkill
  try {
    sspawn(taskkillPath, ['/PID', String(pid), '/T', '/F']);
  } catch {
    /* best-effort */
  }
}

/**
 * Reap a process and its real descendant tree to quiescence. Best-effort;
 * NEVER throws.
 * win32: absolute System32 `taskkill /PID <pid> /T /F` (OS PID-table
 *   tree-kill; the OS handles the tree, no re-sweep — and NO leaderless-member
 *   guarantee, R5-2/WP-a10-windows-reap).
 * POSIX: read the process table from an AUTHORITATIVE source (Linux /proc;
 *   macOS/BSD the verified absolute /bin/ps — never a PATH-resolved `ps`),
 *   then SIGKILL (1) every process group that the target or any transitive
 *   ppid-descendant belongs to, AND (2) every transitive ppid-descendant pid;
 *   re-snapshot and re-kill until TWO CONSECUTIVE sweeps find zero descendants
 *   (bounded by maxSweeps — the two-consecutive-clean condition closes the
 *   snapshot→kill fork race). Catches: a plain child tree; a child re-detached
 *   into its OWN group (still a ppid-descendant — the dream-brain leak); a
 *   `setsid` child (new session, ppid intact); a double-fork-no-setsid child
 *   (reparented to init, group retained — caught by the group kill). Does NOT
 *   catch a process that BOTH setsid's AND double-forks to fully detach — the
 *   ADR-0030 / A12 residual; the hermetic brain (A1) has no shell to produce
 *   one. Never kills pid 1, process.pid (the supervisor), or anything outside
 *   S ∪ (−G).
 * @param {number} pid           the immediate supervised child's pid
 * @param {NodeJS.Platform} platform  inject it — never mock process.platform
 * @param {{ kill?: typeof process.kill,
 *           readTable?: () => Array<{pid:number, ppid:number, pgid:number}>|null,
 *           spawnSync?: typeof spawnSync,
 *           procRoot?: string, psPath?: string,
 *           verifyPs?: typeof verifyPsBinary,
 *           maxSweeps?: number, pollDelayMs?: number }} [seams]
 *           `readTable` overrides the platform reader outright; `procRoot`
 *           (default '/proc') and `psPath` (default '/bin/ps') point the
 *           default reader at fixtures; `maxSweeps` default 5.
 * @returns {void}
 */
function reapTree(pid, platform, seams = {}) {
  try {
    if (platform === 'win32') {
      if (Number.isInteger(pid) && pid > 1) taskkillTree(pid, seams);
      return;
    }
    if (!safeTarget(pid)) return;
    const kill = seams.kill || process.kill;
    const maxSweeps =
      Number.isInteger(seams.maxSweeps) && seams.maxSweeps > 0 ? seams.maxSweeps : DEFAULT_MAX_SWEEPS;
    const delay = seams.pollDelayMs === undefined ? DEFAULT_POLL_DELAY_MS : seams.pollDelayMs;
    const snapshot = () => {
      try {
        return seams.readTable ? seams.readTable() : readProcessTable(platform, seams);
      } catch {
        return null;
      }
    };

    let table = snapshot();
    if (!table || table.length === 0) {
      // Unusable snapshot → degrade to the legacy single group-kill; never throw.
      try {
        kill(-pid, 'SIGKILL');
      } catch {
        /* already gone — best-effort */
      }
      return;
    }

    let clean = 0;
    for (let sweep = 0; sweep < maxSweeps; sweep++) {
      const S = descendantClosure(table, pid);
      const extras = [...S].filter((p) => p !== pid && table.some((r) => r.pid === p));
      if (sweep > 0 && extras.length === 0) {
        clean += 1;
        if (clean >= 2) return; // two consecutive clean sweeps — quiescent
      } else {
        clean = 0;
        // G = every process group any member of S belongs to.
        const groups = new Set();
        for (const r of table) {
          if (S.has(r.pid)) groups.add(r.pgid);
        }
        for (const g of groups) {
          if (!safeTarget(g)) continue; // never -1, never the supervisor's own group
          try {
            kill(-g, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
        for (const p of S) {
          if (!safeTarget(p)) continue; // never pid 1, never process.pid
          try {
            kill(p, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
      }
      if (sweep < maxSweeps - 1) {
        if (!seams.readTable) sleepMs(delay); // real tables need a beat to settle
        table = snapshot();
        if (!table) return; // observation degraded mid-loop — kills already sent
      }
    }
  } catch {
    /* best-effort — NEVER throws into the watchdog */
  }
}

/**
 * Reap an AUTHENTICATED process GROUP by its pgid — the handed-up brain group —
 * and CONFIRM the group is empty before reporting success (R7-2). Distinct from
 * reapTree: the input is a PGID, not a PID, and the group leader may already
 * have exited (a positive-pid table lookup would find nothing and leak the
 * members). Best-effort; NEVER throws; returns a CHECKED result.
 * POSIX: SIGKILL the group by NEGATIVE pgid — `kill(-pgid, 'SIGKILL')` reaps
 *   every surviving member even when the leader is gone — then BOUNDED-POLL to
 *   quiescence: probe `kill(-pgid, 0)` and re-SIGKILL until it throws ESRCH (no
 *   member of the group remains) or maxPolls is reached. A successful SIGKILL
 *   only means the signal was ACCEPTED, NOT that every member is gone; on an
 *   error it proves even less — the direct signal alone is never treated as
 *   completion; the poll is what turns "signal accepted" into "group verified
 *   empty". Guarded so it never targets pgid 1, process.pid, or the
 *   supervisor's own group. A probe of an already-empty group is a harmless
 *   ESRCH → `{ reaped: true }` at once (idempotent).
 * win32: absolute System32 `taskkill /PID <pgid> /T /F` (pgid == the detached
 *   brain's pid); no bare-name fallback. NOTE (R5-2): win32 reaches only a
 *   LIVE pid and its LIVE child tree — there is NO negative-PGID equivalent,
 *   so it does NOT reach a leaderless reparented member once the group leader
 *   has exited; NO leaderless-member guarantee (deferred to
 *   WP-a10-windows-reap). win32 returns `{ reaped: true }` best-effort after
 *   the taskkill — it cannot verify the leaderless case it explicitly does not
 *   cover — so the POSIX fail-loud escalation never activates there.
 * ASYNC by necessity: the settled group's last member is often the
 * supervisor's OWN just-SIGKILLed direct child, which stays a ZOMBIE — and a
 * zombie still counts as a live group member for kill() — until the
 * supervisor's event loop runs libuv's waitpid. A synchronous poll would block
 * that very loop and could never observe ESRCH, spuriously reporting
 * `{ reaped: false }` on every timeout; the inter-poll delay therefore yields
 * to the event loop (`await setTimeout`). The result contract is unchanged.
 * @param {number} pgid  the handed-up brain process-group id
 * @param {NodeJS.Platform} platform  inject it — never mock process.platform
 * @param {{ kill?: typeof process.kill, spawnSync?: typeof spawnSync,
 *           maxPolls?: number, pollDelayMs?: number }} [seams]  maxPolls default 5
 * @returns {Promise<{ reaped: boolean }>}  reaped=true ONLY when the group
 *   reached VERIFIED quiescence (POSIX: `kill(-pgid, 0)` threw ESRCH within
 *   maxPolls; win32: best-effort after taskkill). reaped=false on a POSIX
 *   timeout with members still present — the caller MUST NOT delete a pidfile
 *   whose group is not yet verified empty (R7-2): the INNER caller (dream.js's
 *   finally) RETAINS the hand-up pidfile on reaped=false so run-job's backstop
 *   can retry; the FINAL caller (run-job — the last backstop, no later reader)
 *   does ONE bounded final escalation and, if still non-empty, FAILS LOUD
 *   (R8-1) rather than certifying clean.
 */
async function reapGroup(pgid, platform, seams = {}) {
  try {
    if (platform === 'win32') {
      if (Number.isInteger(pgid) && pgid > 1) taskkillTree(pgid, seams);
      return { reaped: true }; // best-effort — no negative-PGID equivalent (R5-2)
    }
    if (!safeTarget(pgid)) {
      // Guarded/no-op input (pgid 1, the supervisor itself/its own group, or a
      // non-integer from a corrupt pidfile): nothing this primitive may touch.
      return { reaped: true };
    }
    const kill = seams.kill || process.kill;
    const maxPolls =
      Number.isInteger(seams.maxPolls) && seams.maxPolls > 0 ? seams.maxPolls : DEFAULT_MAX_POLLS;
    const delay = seams.pollDelayMs === undefined ? DEFAULT_POLL_DELAY_MS : seams.pollDelayMs;

    try {
      kill(-pgid, 'SIGKILL'); // negative-PGID: reaps members even with the leader gone
    } catch {
      /* ESRCH here means already empty — the probe below confirms it */
    }
    for (let i = 0; i < maxPolls; i++) {
      try {
        kill(-pgid, 0); // probe: throws ESRCH iff NO member of the group remains
      } catch (err) {
        if (err && err.code === 'ESRCH') return { reaped: true }; // verified empty
        // EPERM/other: a member exists (or is unprovable) — keep polling.
      }
      try {
        kill(-pgid, 'SIGKILL'); // a member survives → re-SIGKILL and re-probe
      } catch {
        /* raced to empty — the next probe confirms */
      }
      if (i < maxPolls - 1 && delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay)); // yield: let libuv reap our own zombie child
      }
    }
    return { reaped: false }; // bounded poll timed out with a member still present
  } catch {
    return { reaped: false }; // never throws; an unverifiable group is not "reaped"
  }
}

module.exports = { reapTree, reapGroup, readProcessTable };
