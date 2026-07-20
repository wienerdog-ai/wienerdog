'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { WienerdogError } = require('./errors');

/**
 * Private-by-default modes for the whole Wienerdog mechanics root (audits A5 +
 * A9, ADR-0024, WP-126 + WP-a9-private-modes-repair): 0700 dirs / 0600 files,
 * independent of umask, with an explicit final chmod (mkdir's mode is
 * umask-masked on some platforms). Mirrors the proven identity-approvals/
 * ledger atomic-write shape.
 *
 * Coverage (single enumerator, three surfaces): the A5 set (core/state/logs
 * dirs, digest/alerts/ledger/approvals files, per-run logs, dream scratch,
 * quarantine) UNION the A9 set (`secrets/` and every file directly inside it —
 * GWS tokens + client JSON — the grants/pins/run-evidence state files, every
 * `logs/<job>` subdirectory, and the four repair-only metadata files
 * config.yaml / install-manifest.json / schedule.json / watermarks.json,
 * whose WRITERS stay unchanged per the DATED OWNER DECISION 2026-07-19).
 *
 * win32 posture (OWNER-APPROVED 2026-07-17): POSIX modes do not exist there —
 * chmod is a best-effort no-op, the scan reports {insecure: 0}, and WP-127
 * documents that Windows protection relies on the per-user profile ACLs.
 */

const WIN32 = process.platform === 'win32';

/** The A5-scoped private DIRECTORIES (0700). state/quarantine is WP-123's
 *  staged-output secret quarantine — it can hold raw secret bytes.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A5_PRIVATE_DIRS = (paths) => [
  paths.core,
  paths.state,
  paths.logs,
  path.join(paths.state, 'dream-scratch'),
  path.join(paths.state, 'quarantine'),
];

/** The A5-scoped private FILES directly under state/ (0600). */
const A5_PRIVATE_FILE_BASENAMES = [
  'digest.md',
  'alerts.jsonl',
  'transcript-ledger.json',
  'identity-approvals.json',
];

/** A9-scoped private DIRECTORIES (0700): the credential store. `secrets/` is
 *  where GWS OAuth tokens + client JSON live (A9). Repaired, never created here.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_DIRS = (paths) => [paths.secrets];

/** A9-scoped private FILES directly under state/ (0600): grants, exec pins, run
 *  evidence, plus the two metadata files schedule.json/watermarks.json
 *  (repair-only, DATED OWNER DECISION 2026-07-19 — their writers are NOT
 *  changed). (Tokens/client JSON are matched by walking secrets/ for every
 *  regular file — no fixed basename list, so a new google-token-*.json is
 *  covered automatically.) */
const A9_PRIVATE_STATE_FILES = [
  'broker-grants.json',
  'exec-pins.json',
  'run-evidence.jsonl',
  'schedule.json',
  'watermarks.json',
];

/** A9-scoped private FILES at the CORE ROOT (0600): the two non-credential
 *  metadata files (repair-only — writers unchanged). Their absolute paths are
 *  `paths.config` and `paths.manifest`; enumerate by those, not by joining a
 *  basename onto state/.
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
const A9_PRIVATE_CORE_FILES = (paths) => [paths.config, paths.manifest];

/** chmod `p` to `mode` unless it already has it. Best-effort: a vanished or
 *  odd path is skipped; win32 is a no-op. Returns true iff the mode changed.
 *  @param {string} p @param {number} mode @returns {boolean} */
function chmodIfNeeded(p, mode) {
  if (WIN32) return false;
  try {
    if ((fs.statSync(p).mode & 0o777) === mode) return false;
    fs.chmodSync(p, mode);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create `dir` (recursive) private to the owner (0700), independent of umask:
 * mkdir with mode then chmod (the explicit chmod defeats a permissive umask).
 * Idempotent; the chmod is best-effort and a no-op on win32.
 * @param {string} dir
 */
function mkdirPrivate(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodIfNeeded(dir, 0o700);
}

/**
 * Atomically write `data` to `dest` as a 0600 file (temp + rename + final
 * chmod), mirroring identity-approvals.writeRegistry / ledger.writeLedger.
 * Ensures the parent dir exists and is 0700.
 * @param {string} dest @param {string|Buffer} data
 */
function writeFilePrivate(dest, data) {
  const dir = path.dirname(dest);
  mkdirPrivate(dir);
  const tmp = path.join(dir, `.${path.basename(dest)}.${process.pid}.tmp`);
  fs.writeFileSync(tmp, data, { mode: 0o600 });
  chmodIfNeeded(tmp, 0o600);
  fs.renameSync(tmp, dest);
  chmodIfNeeded(dest, 0o600);
}

/** @param {string} dir @param {(name:string)=>boolean} keep
 *  @returns {string[]} absolute paths of matching regular files in `dir` (one level) */
function listFiles(dir, keep) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && keep(e.name)).map((e) => path.join(dir, e.name));
}

/**
 * The SINGLE enumerator behind all three surfaces (doctor warn, sync
 * repair/scan, digest banner) — the A5 ∪ A9 union: {dirs, files}. Every dir
 * carries the implicit expected mode 0700, every file 0600.
 *  - dirs: the A5 dirs, `secrets/`, and every existing `logs/<job>` subdir.
 *  - files: the four A5 state/ basenames, the A9 state/ files (grants, pins,
 *    run evidence, schedule.json, watermarks.json), the two core-root metadata
 *    files (config.yaml, install-manifest.json), every `logs/<job>/*.log` (one
 *    nesting level — run-job's layout), every scratch extract, every
 *    quarantined copy, and every regular file directly under `secrets/`
 *    (tokens + client JSON, no fixed basename list).
 * Existence-guarded (a missing entry is skipped — this module repairs, it
 * never creates) and de-duplicated (the union must not double-report).
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{dirs:string[], files:string[]}}
 */
/** The DIRECTORY half of the single enumerator (kept a separate internal
 *  function so the fixed-point repair loop can enumerate dirs WITHOUT the
 *  redundant per-iteration secrets/scratch file walk; `listPrivateEntries`
 *  builds on it, so all surfaces still share one dir source).
 *  @param {import('./paths').WienerdogPaths} paths @returns {string[]} */
function listPrivateDirs(paths) {
  let jobDirs;
  try {
    jobDirs = fs.readdirSync(paths.logs, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    jobDirs = [];
  }
  const dirSet = new Set();
  const dirCandidates = [
    ...A5_PRIVATE_DIRS(paths),
    ...A9_PRIVATE_DIRS(paths),
    ...jobDirs.map((job) => path.join(paths.logs, job.name)),
  ];
  for (const d of dirCandidates) {
    try {
      if (fs.statSync(d).isDirectory()) dirSet.add(d);
    } catch {
      /* missing / parent unreadable → skipped */
    }
  }
  return [...dirSet];
}

function listPrivateEntries(paths) {
  const dirs = listPrivateDirs(paths);

  const fileSet = new Set();
  const fileCandidates = [
    ...A5_PRIVATE_FILE_BASENAMES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_STATE_FILES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_CORE_FILES(paths),
  ];
  for (const f of fileCandidates) {
    try {
      if (fs.statSync(f).isFile()) fileSet.add(f);
    } catch {
      /* missing → skipped */
    }
  }
  // Every discovered logs/<job> subdir contributes its *.log files (the dir set
  // already resolved which job dirs are traversable).
  for (const d of dirs) {
    if (path.dirname(d) === paths.logs) {
      for (const f of listFiles(d, (n) => n.endsWith('.log'))) fileSet.add(f);
    }
  }
  for (const f of listFiles(path.join(paths.state, 'dream-scratch'), (n) => n.endsWith('.json'))) fileSet.add(f);
  for (const f of listFiles(path.join(paths.state, 'quarantine'), () => true)) fileSet.add(f);
  for (const f of listFiles(paths.secrets, () => true)) fileSet.add(f);
  return { dirs, files: [...fileSet] };
}

/** Defensive iteration cap for the fixed-point directory repair. The real
 *  private tree is shallow (core → state → {dream-scratch,quarantine},
 *  core → logs → <job>, core → secrets — depth 3), so a handful of passes
 *  always converges; this cap only guards against a pathological/unbounded
 *  spin and CANNOT be hit by the real layout. If it is ever hit the repair is
 *  aborted (fail-closed) rather than reporting a partial repair as complete. */
const MAX_DIR_REPAIR_PASSES = 64;

/**
 * Repair wrong modes over the A5 ∪ A9 set to their EXPECTED mode (dirs 0700,
 * files 0600 — over-tight modes repaired too, expected-mode equality).
 *
 * FIXED-POINT DIRECTORY REPAIR, THEN A SINGLE FILE PASS (WP-a9 round-3 + G1).
 * A 000/non-executable directory hides its contents from the enumeration
 * (`readdirSync`/`statSync` fail through the unreadable parent → skipped), and
 * this can nest to ANY depth (`logs/`=000 hiding `logs/<job>/`=000 hiding a
 * `0644` log; `core/`=000 hiding `secrets/`=000 hiding a `0644` token). A fixed
 * number of passes only opens a fixed number of levels, leaving a deeper file
 * world-readable until the next sync — a fail-open in a security guard. So the
 * DIRECTORY repair is a fixed-point LOOP: chmod every currently-discoverable
 * private dir to 0700 and RE-ENUMERATE, repeating until the discoverable dir
 * set stops growing (each newly-traversable dir can reveal deeper ones). The
 * set is monotonic (a chmod only reveals more, never hides) and bounded by the
 * finite tree, so it converges; the cap is purely defensive. Only AFTER every
 * private dir is traversable does ONE fresh file enumeration run and chmod
 * files to 0600 — so a token trapped under any nesting depth is reached in this
 * single `repairPrivateModes` call, and a follow-up `scanPrivateModes` is
 * `{insecure: 0}`.
 *
 * Best-effort per entry (a missing or un-chmoddable entry is skipped); win32
 * chmod is a no-op. Returns the count of entries actually changed for a
 * truthful doctor/sync line. Keeps the single-enumerator invariant: the dir
 * loop and the file pass both derive from `listPrivateDirs`/`listPrivateEntries`
 * that feed the three read surfaces.
 * @param {import('./paths').WienerdogPaths} paths @returns {{changed:number}}
 * @throws {WienerdogError} if the directory repair does not converge within the
 *   defensive cap (unreachable by the real layout — surfaced, never silent).
 */
function repairPrivateModes(paths) {
  let changed = 0;
  // Fixed-point directory phase: repair discoverable private dirs to 0700 and
  // re-enumerate until the discoverable set stops growing.
  let prevCount = -1;
  let pass = 0;
  for (; pass < MAX_DIR_REPAIR_PASSES; pass += 1) {
    const dirs = listPrivateDirs(paths);
    for (const d of dirs) if (chmodIfNeeded(d, 0o700)) changed += 1;
    if (dirs.length === prevCount) break; // no newly-revealed dir → fixed point
    prevCount = dirs.length;
  }
  if (pass >= MAX_DIR_REPAIR_PASSES) {
    throw new WienerdogError(
      'private-modes repair did not converge within its bounded directory-repair cap — ' +
        'the private directory tree is unexpectedly deep; repair aborted rather than reporting ' +
        'a partially-repaired credential store as complete.'
    );
  }
  // Every private dir is now traversable → one fresh file pass to 0600.
  for (const f of listPrivateEntries(paths).files) if (chmodIfNeeded(f, 0o600)) changed += 1;
  return { changed };
}

/**
 * READ-ONLY list of A5 ∪ A9 entries whose mode deviates from the expected one
 * in EITHER direction — (mode & 0o777) !== 0700 for dirs / 0600 for files — so
 * a loosened 0755/0644 AND an over-tight 0600/000 dir (a traversal-broken
 * credential store) are both flagged. Never chmods. POSIX only (win32 → []).
 * The single predicate behind doctor's WARNs, sync --dry-run's would-repair
 * count, and the digest insecure-modes banner — so those surfaces can never
 * disagree.
 * @param {import('./paths').WienerdogPaths} paths @returns {string[]}
 */
function insecureEntries(paths) {
  if (WIN32) return [];
  const { dirs, files } = listPrivateEntries(paths);
  const out = [];
  for (const [list, expectedMode] of [
    [dirs, 0o700],
    [files, 0o600],
  ]) {
    for (const p of list) {
      try {
        if ((fs.statSync(p).mode & 0o777) !== expectedMode) out.push(p);
      } catch {
        /* vanished → skipped */
      }
    }
  }
  return out;
}

/**
 * READ-ONLY scan: the count of wrong-moded A5 ∪ A9 entries.
 * win32 → {insecure: 0} (POSIX-only guarantee, owner-approved).
 * @param {import('./paths').WienerdogPaths} paths @returns {{insecure:number}}
 */
function scanPrivateModes(paths) {
  return { insecure: insecureEntries(paths).length };
}

/** Open a per-run log stream that is ALWAYS owner-only (0600), independent of
 *  umask and of a pre-existing file's mode — or FAIL: it never returns a stream
 *  onto a file it could not secure to 0600.
 *  POSIX: openSync(file, flags, 0o600) → fchmodSync(fd, 0o600) (covers the
 *    append-into-a-legacy-0666 case, on the fd not the path); on fchmod failure
 *    closeSync(fd) and THROW (never write into a world-readable file). The
 *    returned stream is built on the ALREADY-VERIFIED fd.
 *  win32: no mode/chmod semantics — plain stream (POSIX-only guarantee, matching
 *    the rest of this module).
 *  @param {string} file  absolute log path (its dir already exists — mkdir is
 *    the caller's job, now mkdirPrivate)
 *  @param {{flags?: string, openSync?, fchmodSync?, closeSync?}} [opts]
 *    the *Sync seams are test injection only (to force an fchmod failure)
 *  @returns {import('fs').WriteStream}
 *  @throws {WienerdogError} if the fd cannot be secured to 0600 (POSIX) */
function createLogStreamPrivate(file, opts = {}) {
  const flags = opts.flags || 'w';
  if (WIN32) return fs.createWriteStream(file, { flags });
  const openSync = opts.openSync || fs.openSync;
  const fchmodSync = opts.fchmodSync || fs.fchmodSync;
  const closeSync = opts.closeSync || fs.closeSync;
  const fd = openSync(file, flags, 0o600); // atomic create-with-0600
  try {
    fchmodSync(fd, 0o600); // enforce 0600 even on a pre-existing append target
  } catch (e) {
    try {
      closeSync(fd);
    } catch {
      /* best-effort close */
    }
    throw new WienerdogError(
      `refusing to write log ${file}: could not secure it to 0600 (${e && e.message})`
    );
  }
  return fs.createWriteStream(file, { fd }); // stream on the verified fd
}

module.exports = {
  mkdirPrivate,
  writeFilePrivate,
  createLogStreamPrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
  A9_PRIVATE_DIRS,
  A9_PRIVATE_STATE_FILES,
  A9_PRIVATE_CORE_FILES,
};
