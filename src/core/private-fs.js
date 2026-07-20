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
function listPrivateEntries(paths) {
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
      /* missing → skipped */
    }
  }

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
  for (const job of jobDirs) {
    for (const f of listFiles(path.join(paths.logs, job.name), (n) => n.endsWith('.log'))) fileSet.add(f);
  }
  for (const f of listFiles(path.join(paths.state, 'dream-scratch'), (n) => n.endsWith('.json'))) fileSet.add(f);
  for (const f of listFiles(path.join(paths.state, 'quarantine'), () => true)) fileSet.add(f);
  for (const f of listFiles(paths.secrets, () => true)) fileSet.add(f);
  return { dirs: [...dirSet], files: [...fileSet] };
}

/**
 * Repair wrong modes over the A5 ∪ A9 set: every existing dir → 0700, every
 * existing file → 0600 (over-tight modes included — expected-mode equality).
 * TWO-PHASE (WP-a9 round-3): phase 1 chmods every enumerated DIRECTORY to 0700
 * first — a 000/non-executable `secrets/` (or logs/) hides its contents from
 * the enumeration (`listFiles`'s readdirSync fails → []), so a one-pass repair
 * would fix the dir but leave a 0644 token trapped inside it until the NEXT
 * sync. Phase 2 then RE-RUNS the same enumerator (the now-0700 dirs yield
 * their contents) and chmods the newly visible dirs + every file. Idempotent;
 * best-effort per entry (a missing or odd entry is skipped, never throws);
 * win32 chmod is a no-op. Returns the count of entries actually changed for a
 * truthful doctor/sync line.
 * @param {import('./paths').WienerdogPaths} paths @returns {{changed:number}}
 */
function repairPrivateModes(paths) {
  let changed = 0;
  // Phase 1 — dirs first: make every unreadable/over-tight dir traversable.
  for (const d of listPrivateEntries(paths).dirs) if (chmodIfNeeded(d, 0o700)) changed += 1;
  // Phase 2 — re-enumerate (same enumerator — single-predicate invariant), then
  // fix the newly visible dirs and every file.
  const { dirs, files } = listPrivateEntries(paths);
  for (const d of dirs) if (chmodIfNeeded(d, 0o700)) changed += 1;
  for (const f of files) if (chmodIfNeeded(f, 0o600)) changed += 1;
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
