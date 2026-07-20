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
 *  @returns {string[]} absolute paths of matching regular files in `dir` (one
 *  level). `withFileTypes` + `e.isFile()` is lstat-based — a symlinked child is
 *  NOT reported as a file, so this never follows a link out of the dir. */
function listFiles(dir, keep) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isFile() && keep(e.name)).map((e) => path.join(dir, e.name));
}

/** @param {string} p @returns {import('fs').Stats|null} lstat (never follows). */
function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/** @param {string} p @returns {string|null} realpath, or null when unresolvable. */
function realpathOrNull(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** Is the canonical `real` at or beneath the canonical `coreReal`? Both sides
 *  are realpaths, so a symlinked ancestor of the core (e.g. /var → /private/var)
 *  never causes a false escape. Fail-closed when either is missing.
 *  @param {string|null} real @param {string|null} coreReal @returns {boolean} */
function withinCore(real, coreReal) {
  if (!real || !coreReal) return false;
  return real === coreReal || real.startsWith(coreReal + path.sep);
}

/**
 * Classify an enumerated private path WITHOUT following symlinks (audit A9 /
 * G2, ADR-0027 never-follow bar). Returns the kind when the path is a REAL
 * (non-symlink) entry of the expected type whose canonical location stays
 * within the core; 'anomaly' when it is a symlink OR its realpath escapes the
 * core (surfaced, never repaired-through); null when it is missing or the wrong
 * kind (skipped). @param {string} p @param {'dir'|'file'} kind
 * @param {string|null} coreReal @returns {'dir'|'file'|'anomaly'|null} */
function classifyPrivatePath(p, kind, coreReal) {
  const ls = lstatOrNull(p);
  if (!ls) return null; // missing / parent unreadable
  if (ls.isSymbolicLink()) return 'anomaly'; // a private path is a symlink → surface, never follow
  if (kind === 'dir' ? !ls.isDirectory() : !ls.isFile()) return null; // wrong kind → skip
  if (!withinCore(realpathOrNull(p), coreReal)) return 'anomaly'; // escapes the core → surface
  return kind;
}

/** The DIRECTORY half of the single enumerator (kept a separate internal
 *  function so the fixed-point repair loop can enumerate dirs WITHOUT the
 *  redundant per-iteration secrets/scratch file walk; `listPrivateEntries`
 *  builds on it, so all surfaces still share one dir source). Never follows a
 *  symlink: a symlinked/escaping private dir is returned under `anomalies`, not
 *  `dirs` — so it is neither traversed nor chmodded, only surfaced.
 *  @param {import('./paths').WienerdogPaths} paths
 *  @returns {{dirs:string[], anomalies:string[]}} */
function listPrivateDirs(paths) {
  const coreReal = realpathOrNull(paths.core);
  const dirSet = new Set();
  const anomalies = new Set();

  for (const d of [...A5_PRIVATE_DIRS(paths), ...A9_PRIVATE_DIRS(paths)]) {
    const c = classifyPrivatePath(d, 'dir', coreReal);
    if (c === 'dir') dirSet.add(d);
    else if (c === 'anomaly') anomalies.add(d);
  }

  // logs/<job> subdirs — only READ logs/ when it is itself a real, contained,
  // traversable dir (a symlinked logs/ is an anomaly above and never read).
  if (dirSet.has(paths.logs)) {
    let jobEntries = [];
    try {
      jobEntries = fs.readdirSync(paths.logs, { withFileTypes: true });
    } catch {
      jobEntries = [];
    }
    for (const e of jobEntries) {
      const jp = path.join(paths.logs, e.name);
      const c = classifyPrivatePath(jp, 'dir', coreReal); // re-lstat: don't trust the Dirent
      if (c === 'dir') dirSet.add(jp);
      else if (c === 'anomaly') anomalies.add(jp);
    }
  }
  return { dirs: [...dirSet], anomalies: [...anomalies] };
}

/**
 * The SINGLE enumerator behind all three surfaces (doctor warn, sync
 * repair/scan, digest banner) — the A5 ∪ A9 union, never following a symlink:
 * `{dirs, files, anomalies}`. `dirs` (expected 0700) and `files` (expected
 * 0600) are REAL, in-core entries safe to chmod; `anomalies` are enumerated
 * private paths that are symlinks or escape the core — surfaced (so the
 * predicate flags them and doctor WARNs) but NEVER repaired-through.
 *  - dirs: the A5 dirs, `secrets/`, and every existing `logs/<job>` subdir.
 *  - files: the four A5 state/ basenames, the A9 state/ files (grants, pins,
 *    run evidence, schedule.json, watermarks.json), the two core-root metadata
 *    files (config.yaml, install-manifest.json), every `logs/<job>/*.log` (one
 *    nesting level — run-job's layout), every scratch extract, every
 *    quarantined copy, and every regular file directly under `secrets/`
 *    (tokens + client JSON, no fixed basename list).
 * Existence-guarded (a missing entry is skipped — this module repairs, it
 * never creates) and de-duplicated (the union must not double-report). Files
 * are walked ONLY out of real, contained dirs (`dirSet` membership), so a
 * symlinked `secrets/`/`logs/<job>` is never enumerated into.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{dirs:string[], files:string[], anomalies:string[]}}
 */
function listPrivateEntries(paths) {
  const coreReal = realpathOrNull(paths.core);
  const { dirs, anomalies: dirAnomalies } = listPrivateDirs(paths);
  const dirSet = new Set(dirs);
  const anomalies = new Set(dirAnomalies);

  const fileSet = new Set();
  const fileCandidates = [
    ...A5_PRIVATE_FILE_BASENAMES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_STATE_FILES.map((base) => path.join(paths.state, base)),
    ...A9_PRIVATE_CORE_FILES(paths),
  ];
  for (const f of fileCandidates) {
    const c = classifyPrivatePath(f, 'file', coreReal);
    if (c === 'file') fileSet.add(f);
    else if (c === 'anomaly') anomalies.add(f);
  }
  // Walk files ONLY out of real, contained dirs (dirSet membership) so a
  // symlinked secrets//logs/<job> is never followed. `listFiles` itself skips
  // symlinked children (lstat-based isFile()).
  for (const d of dirs) {
    if (path.dirname(d) === paths.logs) {
      for (const f of listFiles(d, (n) => n.endsWith('.log'))) fileSet.add(f);
    }
  }
  if (dirSet.has(path.join(paths.state, 'dream-scratch'))) {
    for (const f of listFiles(path.join(paths.state, 'dream-scratch'), (n) => n.endsWith('.json'))) fileSet.add(f);
  }
  if (dirSet.has(path.join(paths.state, 'quarantine'))) {
    for (const f of listFiles(path.join(paths.state, 'quarantine'), () => true)) fileSet.add(f);
  }
  if (dirSet.has(paths.secrets)) {
    for (const f of listFiles(paths.secrets, () => true)) fileSet.add(f);
  }
  return { dirs, files: [...fileSet], anomalies: [...anomalies] };
}

/** Defensive iteration cap for the fixed-point directory repair. The real
 *  private tree is shallow (core → state → {dream-scratch,quarantine},
 *  core → logs → <job>, core → secrets — depth 3), so a handful of passes
 *  always converges; this cap only guards against a pathological/unbounded
 *  spin and CANNOT be hit by the real layout. If it is ever hit the repair is
 *  aborted (fail-closed) rather than reporting a partial repair as complete. */
const MAX_DIR_REPAIR_PASSES = 64;

/** F30/ADR-0027 never-follow flags. Undefined on win32 → 0 (no-op there — the
 *  realpath-canonical containment above is the win32 bound, and chmod is a
 *  WIN32 no-op regardless). */
const O_NOFOLLOW = fs.constants.O_NOFOLLOW || 0;
const O_DIRECTORY = fs.constants.O_DIRECTORY || 0;

/**
 * TOCTOU-safe chmod that NEVER follows a symlink (audit A9 / G2, ADR-0027).
 * Opens the path O_RDONLY|O_NOFOLLOW (dirs add O_DIRECTORY), `fstat`s the fd to
 * confirm the kind + current mode, and `fchmod`s that verified descriptor — a
 * swap-to-symlink between enumeration and chmod then trips O_NOFOLLOW at open
 * (ELOOP/ENOTDIR) → the entry is REFUSED, never chmodded through the link.
 *
 * An owner-owned but UNREADABLE real dir/file (e.g. mode 000 — the fixed-point
 * loop's whole reason to exist) cannot be opened O_RDONLY (EACCES), so that one
 * case falls back to an lstat-guarded path chmod: re-lstat (reject a symlink),
 * confirm the kind, then `chmodSync` (chmod needs only ownership, not read).
 * The fallback's residual is a microscopic re-lstat→chmod window on a
 * first-touch 000 entry only; every readable entry uses the fd path with no
 * path-based window. `seams` inject the *Sync calls for tests (a forced ELOOP).
 *
 * @param {string} p @param {number} expectedMode @param {boolean} isDir
 * @param {{openSync?,fstatSync?,fchmodSync?,closeSync?,lstatSync?,chmodSync?}} [seams]
 * @returns {'changed'|'unchanged'|'refused'} 'refused' = a symlink/swap/error —
 *   surfaced by the read predicate, never silently treated as clean. */
function applyModeSecure(p, expectedMode, isDir, seams = {}) {
  if (WIN32) return 'unchanged';
  const openSync = seams.openSync || fs.openSync;
  const fstatSync = seams.fstatSync || fs.fstatSync;
  const fchmodSync = seams.fchmodSync || fs.fchmodSync;
  const closeSync = seams.closeSync || fs.closeSync;
  let fd = null;
  try {
    fd = openSync(p, fs.constants.O_RDONLY | O_NOFOLLOW | (isDir ? O_DIRECTORY : 0));
  } catch (e) {
    // EACCES/EPERM on a real unreadable entry (000) → lstat-guarded fallback.
    // ELOOP/ENOTDIR (a symlink at the final component) or anything else → refuse.
    if (e && (e.code === 'EACCES' || e.code === 'EPERM')) {
      return applyModeFallback(p, expectedMode, isDir, seams);
    }
    return 'refused';
  }
  try {
    const st = fstatSync(fd);
    if (isDir ? !st.isDirectory() : !st.isFile()) return 'refused';
    if ((st.mode & 0o777) === expectedMode) return 'unchanged';
    fchmodSync(fd, expectedMode);
    return 'changed';
  } catch {
    return 'refused';
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* best-effort close */
      }
    }
  }
}

/** lstat-guarded path chmod for an unreadable-but-owned (000) entry the fd path
 *  cannot open. Rejects a symlink and a kind mismatch before chmod.
 *  @param {string} p @param {number} expectedMode @param {boolean} isDir
 *  @param {object} seams @returns {'changed'|'unchanged'|'refused'} */
function applyModeFallback(p, expectedMode, isDir, seams = {}) {
  const lstatSync = seams.lstatSync || fs.lstatSync;
  const chmodSync = seams.chmodSync || fs.chmodSync;
  let ls;
  try {
    ls = lstatSync(p);
  } catch {
    return 'refused';
  }
  if (ls.isSymbolicLink()) return 'refused'; // never follow
  if (isDir ? !ls.isDirectory() : !ls.isFile()) return 'refused';
  if ((ls.mode & 0o777) === expectedMode) return 'unchanged';
  try {
    chmodSync(p, expectedMode);
    return 'changed';
  } catch {
    return 'refused';
  }
}

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
 * NEVER FOLLOWS A SYMLINK (G2, ADR-0027): only REAL, in-core `dirs`/`files`
 * are repaired — a symlinked/escaping private path is an `anomaly` (surfaced by
 * the read predicate, never chmodded through), and each chmod goes through the
 * O_NOFOLLOW `applyModeSecure` fd so a swap-to-symlink mid-repair is refused,
 * not followed to an out-of-tree target.
 *
 * Best-effort per entry (a missing/symlinked/un-chmoddable entry is skipped —
 * and remains flagged by the predicate, never silently certified clean); win32
 * chmod is a no-op. Returns the count of entries actually changed for a
 * truthful doctor/sync line. Keeps the single-enumerator invariant: the dir
 * loop and the file pass both derive from `listPrivateDirs`/`listPrivateEntries`
 * that feed the three read surfaces. `opts` forwards the *Sync test seams to
 * `applyModeSecure` (a forced-ELOOP TOCTOU test); production passes none.
 * @param {import('./paths').WienerdogPaths} paths
 * @param {{openSync?,fstatSync?,fchmodSync?,closeSync?,lstatSync?,chmodSync?}} [opts]
 * @returns {{changed:number}}
 * @throws {WienerdogError} if the directory repair does not converge within the
 *   defensive cap (unreachable by the real layout — surfaced, never silent).
 */
function repairPrivateModes(paths, opts = {}) {
  let changed = 0;
  // Fixed-point directory phase: repair discoverable REAL private dirs to 0700
  // (never following a symlink) and re-enumerate until the set stops growing.
  let prevCount = -1;
  let pass = 0;
  for (; pass < MAX_DIR_REPAIR_PASSES; pass += 1) {
    const { dirs } = listPrivateDirs(paths);
    for (const d of dirs) if (applyModeSecure(d, 0o700, true, opts) === 'changed') changed += 1;
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
  // Every real private dir is now traversable → one fresh file pass to 0600.
  for (const f of listPrivateEntries(paths).files) {
    if (applyModeSecure(f, 0o600, false, opts) === 'changed') changed += 1;
  }
  return { changed };
}

/**
 * READ-ONLY list of insecure A5 ∪ A9 entries. Two classes, both surfaced so
 * doctor WARNs / the digest banner counts them and neither is silently clean:
 *  - a REAL entry whose mode deviates from the expected one in EITHER direction
 *    — (mode & 0o777) !== 0700 for dirs / 0600 for files — so a loosened
 *    0755/0644 AND an over-tight 0600/000 dir (a traversal-broken credential
 *    store) are both flagged;
 *  - an ANOMALY: a private path that is a SYMLINK or resolves outside the core
 *    (G2, ADR-0027) — repair refuses to follow it, so it stays flagged until a
 *    human replaces it with a real in-core path.
 * Mode reads use `lstat` (the entries are already classified non-symlink real,
 * so lstat mode == stat mode — but lstat never follows). Never chmods. POSIX
 * only (win32 → []). The single predicate behind doctor's WARNs, sync
 * --dry-run's would-repair count, and the digest banner — those surfaces can
 * never disagree.
 * @param {import('./paths').WienerdogPaths} paths @returns {string[]}
 */
function insecureEntries(paths) {
  if (WIN32) return [];
  const { dirs, files, anomalies } = listPrivateEntries(paths);
  const out = new Set();
  for (const [list, expectedMode] of [
    [dirs, 0o700],
    [files, 0o600],
  ]) {
    for (const p of list) {
      const ls = lstatOrNull(p);
      if (ls && (ls.mode & 0o777) !== expectedMode) out.add(p);
    }
  }
  for (const a of anomalies) out.add(a); // symlink / escapes-core → surfaced, never repaired
  return [...out];
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
