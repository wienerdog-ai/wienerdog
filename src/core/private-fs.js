'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Private-by-default modes for the A5 secret-lifecycle artifacts (audit A5,
 * ADR-0024, WP-126): 0700 dirs / 0600 files, independent of umask, with an
 * explicit final chmod (mkdir's mode is umask-masked on some platforms).
 * Mirrors the proven identity-approvals/ledger atomic-write shape.
 *
 * A5/A9 boundary (load-bearing, OWNER-APPROVED 2026-07-17): this module
 * covers ONLY the explicit set below. It never walks into `secrets/`, GWS
 * token/grant/client files, config.yaml, the manifest, or scheduler state —
 * those are audit action A9's scope.
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
 * Enumerate the existing A5-scoped entries: {dirs, files}. Files are the four
 * state/ basenames, every `logs/<job>/*.log` (one nesting level — run-job's
 * layout), every scratch extract, and every quarantined copy. Never walks
 * `secrets/`.
 * @param {import('./paths').WienerdogPaths} paths
 * @returns {{dirs:string[], files:string[]}}
 */
function listA5Entries(paths) {
  const dirs = [];
  for (const d of A5_PRIVATE_DIRS(paths)) {
    try {
      if (fs.statSync(d).isDirectory()) dirs.push(d);
    } catch {
      /* missing → skipped */
    }
  }
  const files = [];
  for (const base of A5_PRIVATE_FILE_BASENAMES) {
    try {
      if (fs.statSync(path.join(paths.state, base)).isFile()) files.push(path.join(paths.state, base));
    } catch {
      /* missing → skipped */
    }
  }
  let jobDirs;
  try {
    jobDirs = fs.readdirSync(paths.logs, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    jobDirs = [];
  }
  for (const job of jobDirs) {
    files.push(...listFiles(path.join(paths.logs, job.name), (n) => n.endsWith('.log')));
  }
  files.push(...listFiles(path.join(paths.state, 'dream-scratch'), (n) => n.endsWith('.json')));
  files.push(...listFiles(path.join(paths.state, 'quarantine'), () => true));
  return { dirs, files };
}

/**
 * Repair legacy modes over the A5-scoped set: every existing dir → 0700,
 * every existing file → 0600. Idempotent; best-effort per entry (a missing or
 * odd entry is skipped, never throws); win32 chmod is a no-op. Returns the
 * count of entries actually changed for a truthful doctor/sync line. Does NOT
 * touch `secrets/` or any GWS grant/token/client file (A9).
 * @param {import('./paths').WienerdogPaths} paths @returns {{changed:number}}
 */
function repairPrivateModes(paths) {
  let changed = 0;
  const { dirs, files } = listA5Entries(paths);
  for (const d of dirs) if (chmodIfNeeded(d, 0o700)) changed += 1;
  for (const f of files) if (chmodIfNeeded(f, 0o600)) changed += 1;
  return { changed };
}

/**
 * READ-ONLY list of A5-scoped entries whose mode grants any group/world bit
 * ((mode & 0o077) !== 0). Never chmods. POSIX only (win32 → []). The single
 * predicate behind doctor's WARNs, sync --dry-run's would-repair count, and
 * the digest insecure-modes banner — so those surfaces can never disagree.
 * @param {import('./paths').WienerdogPaths} paths @returns {string[]}
 */
function insecureEntries(paths) {
  if (WIN32) return [];
  const { dirs, files } = listA5Entries(paths);
  const out = [];
  for (const p of [...dirs, ...files]) {
    try {
      if ((fs.statSync(p).mode & 0o077) !== 0) out.push(p);
    } catch {
      /* vanished → skipped */
    }
  }
  return out;
}

/**
 * READ-ONLY scan: the count of group/world-accessible A5-scoped entries.
 * win32 → {insecure: 0} (POSIX-only guarantee, owner-approved).
 * @param {import('./paths').WienerdogPaths} paths @returns {{insecure:number}}
 */
function scanPrivateModes(paths) {
  return { insecure: insecureEntries(paths).length };
}

module.exports = {
  mkdirPrivate,
  writeFilePrivate,
  repairPrivateModes,
  scanPrivateModes,
  insecureEntries,
  A5_PRIVATE_DIRS,
  A5_PRIVATE_FILE_BASENAMES,
};
